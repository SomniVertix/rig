package ui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/somnivertix/rig/integrations/herdr-plugin/internal/rigclient"
)

var handoffDirections = []rigclient.HandoffDirection{rigclient.HandoffBoth, rigclient.HandoffInbound, rigclient.HandoffOutbound}

type HandoffsPage struct {
	client      *rigclient.Client
	workspaceID string
	list        list.Model
	dirIdx      int
}

func NewHandoffsPage(client *rigclient.Client, workspaceID string) *HandoffsPage {
	return &HandoffsPage{client: client, workspaceID: workspaceID, list: newList("Handoffs")}
}

func (p *HandoffsPage) Title() string                         { return "Handoffs" }
func (p *HandoffsPage) SetSize(w, h int)                      { p.list.SetSize(w, footerHeight(h)) }
func (p *HandoffsPage) direction() rigclient.HandoffDirection { return handoffDirections[p.dirIdx] }
func (p *HandoffsPage) isFiltering() bool                     { return p.list.FilterState() == list.Filtering }
func (p *HandoffsPage) onFirstPage() bool                     { return p.list.Paginator.OnFirstPage() }

type handoffsLoadedMsg struct {
	handoffs []rigclient.Handoff
	err      error
}

func (p *HandoffsPage) load() tea.Cmd {
	client, ws, dir := p.client, p.workspaceID, p.direction()
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		hs, err := client.ListHandoffs(ctx, ws, dir, "")
		return handoffsLoadedMsg{handoffs: hs, err: err}
	}
}

func (p *HandoffsPage) Init() tea.Cmd {
	p.list.Title = fmt.Sprintf("Handoffs (%s)", p.direction())
	return p.load()
}

func (p *HandoffsPage) Update(msg tea.Msg) (Page, tea.Cmd) {
	switch msg := msg.(type) {
	case handoffsLoadedMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		items := make([]list.Item, len(msg.handoffs))
		for i, h := range msg.handoffs {
			desc := fmt.Sprintf("%s → %s  [%s/%s]", h.SourceWorkspaceID, h.TargetWorkspaceID, h.Type, h.Status)
			items[i] = item{id: h.ID, title: h.Title, desc: desc, payload: h}
		}
		return p, p.list.SetItems(items)

	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			if it, ok := p.list.SelectedItem().(item); ok {
				h := it.payload.(rigclient.Handoff)
				return p, Push(NewHandoffDetailPage(p.client, h.ID))
			}
			return p, nil
		case "f":
			p.dirIdx = (p.dirIdx + 1) % len(handoffDirections)
			p.list.Title = fmt.Sprintf("Handoffs (%s)", p.direction())
			return p, p.load()
		case "r":
			return p, p.load()
		}
	}

	var cmd tea.Cmd
	p.list, cmd = p.list.Update(msg)
	return p, cmd
}

func (p *HandoffsPage) View() string {
	return p.list.View() + "\n" + helpStyle.Render("f: direction · r: refresh · enter: open")
}
