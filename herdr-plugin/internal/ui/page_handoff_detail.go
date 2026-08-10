package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/somnivertix/rig/herdr-plugin/internal/rigclient"
)

// HandoffDetailPage is read-only — handoffs are actioned by the receiving
// workspace's own agent session, not from a dashboard, so this plugin only
// mirrors what the web console's handoff detail screen shows.
type HandoffDetailPage struct {
	client  *rigclient.Client
	id      string
	vp      viewport.Model
	title   string
	hasConv bool
}

func NewHandoffDetailPage(client *rigclient.Client, id string) *HandoffDetailPage {
	return &HandoffDetailPage{client: client, id: id, vp: viewport.New(0, 0), title: "Handoff"}
}

func (p *HandoffDetailPage) Title() string    { return p.title }
func (p *HandoffDetailPage) SetSize(w, h int) { p.vp.Width = w; p.vp.Height = footerHeight(h) }

type handoffLoadedMsg struct {
	handoff *rigclient.Handoff
	err     error
}

func (p *HandoffDetailPage) Init() tea.Cmd {
	client, id := p.client, p.id
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		h, err := client.GetHandoff(ctx, id)
		return handoffLoadedMsg{handoff: h, err: err}
	}
}

func renderHandoffInfo(h rigclient.Handoff) string {
	s := labelStyle.Render("status: ") + statusBadge(h.Status) + "   " + labelStyle.Render("type: ") + h.Type + "\n"
	s += labelStyle.Render("from: ") + h.SourceWorkspaceID + "  →  " + labelStyle.Render("to: ") + h.TargetWorkspaceID + "\n"
	s += labelStyle.Render("sent by: ") + h.SentBy + "  at " + h.SentAt + "\n\n"
	s += sectionHeader.Render("Body") + "\n" + strOr(h.Body, "(empty)") + "\n"
	if h.ResolutionNote != nil {
		s += "\n" + sectionHeader.Render("Resolution") + "\n" + *h.ResolutionNote + "\n"
		s += labelStyle.Render("resolved by: ") + strOr(h.ResolvedBy, "-") + " at " + strOr(h.ResolvedAt, "-") + "\n"
	}
	if len(h.Attachments) > 0 {
		s += "\n" + sectionHeader.Render("Attachments") + "\n"
		for _, a := range h.Attachments {
			s += fmt.Sprintf("%d. %s @ %s — %s\n", a.Ordinal, a.RepoPath, a.CommitSha, a.Note)
		}
	}
	if h.HasConversation {
		s += "\n" + helpStyle.Render("c: view arbiter conversation")
	}
	return s
}

func (p *HandoffDetailPage) Update(msg tea.Msg) (Page, tea.Cmd) {
	switch msg := msg.(type) {
	case handoffLoadedMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		p.title = msg.handoff.Title
		p.hasConv = msg.handoff.HasConversation
		p.vp.SetContent(renderHandoffInfo(*msg.handoff))
		return p, nil

	case handoffConvLoadedMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		return p, Push(NewTextViewPage(p.title+" / conversation", renderConversation(msg.conv, msg.turns)))

	case tea.KeyMsg:
		if msg.String() == "c" && p.hasConv {
			client, id := p.client, p.id
			return p, func() tea.Msg {
				ctx, cancel := withTimeout()
				defer cancel()
				conv, turns, err := client.GetHandoffConversation(ctx, id)
				return handoffConvLoadedMsg{conv: conv, turns: turns, err: err}
			}
		}
	}

	var cmd tea.Cmd
	p.vp, cmd = p.vp.Update(msg)
	return p, cmd
}

type handoffConvLoadedMsg struct {
	conv  *rigclient.HandoffConversation
	turns []rigclient.HandoffTurn
	err   error
}

func renderConversation(conv *rigclient.HandoffConversation, turns []rigclient.HandoffTurn) string {
	var b strings.Builder
	b.WriteString(labelStyle.Render("status: ") + statusBadge(conv.Status) + "\n\n")
	for _, t := range turns {
		b.WriteString(sectionHeader.Render(fmt.Sprintf("#%d %s (%s)", t.TurnNumber, t.Speaker, t.Verdict)) + "\n")
		b.WriteString(t.Content + "\n\n")
	}
	return b.String()
}

func (p *HandoffDetailPage) View() string {
	return p.vp.View() + "\n" + helpStyle.Render("↑/↓: scroll"+condHelp(p.hasConv, " · c: conversation"))
}

func condHelp(cond bool, s string) string {
	if cond {
		return s
	}
	return ""
}
