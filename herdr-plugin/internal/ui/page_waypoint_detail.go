package ui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/somnivertix/rig/herdr-plugin/internal/rigclient"
)

// actionAreaHeight is reserved below the viewport at a constant size,
// whether or not a form is currently open, so the total rendered height
// never changes shape mid-interaction (the largest form here — reach,
// with 4 fields — is what sets it).
const actionAreaHeight = 9

// WaypointDetailPage shows every field of one waypoint plus the write
// actions the web console exposes for it: claim, release, reach, bypass,
// unbypass.
type WaypointDetailPage struct {
	client   *rigclient.Client
	waypoint rigclient.Waypoint
	vp       viewport.Model

	claimForm    *Form
	reachForm    *Form
	bypassForm   *Form
	unbypassForm *Form
}

func NewWaypointDetailPage(client *rigclient.Client, wp rigclient.Waypoint) *WaypointDetailPage {
	p := &WaypointDetailPage{
		client:       client,
		waypoint:     wp,
		vp:           viewport.New(0, 0),
		claimForm:    NewForm("Claim waypoint", []string{"Claimed by"}, nil),
		reachForm:    NewForm("Reach waypoint", []string{"Resolution", "Resolution gist", "Rationale", "Reached in"}, []bool{false, false, true, true}),
		bypassForm:   NewForm("Bypass waypoint", []string{"Reason"}, nil),
		unbypassForm: NewForm("Unbypass waypoint", []string{"Reason"}, nil),
	}
	p.vp.SetContent(renderWaypointInfo(wp))
	return p
}

func renderWaypointInfo(w rigclient.Waypoint) string {
	s := fmt.Sprintf("#%d %s\n", w.WaypointNumber, w.Title)
	s += labelStyle.Render("status: ") + statusBadge(w.Status) + "   " + labelStyle.Render("approach: ") + strOr(w.Approach, "-") + "\n\n"
	s += labelStyle.Render("question: ") + w.Question + "\n"
	if w.ClaimedBy != nil {
		s += labelStyle.Render("claimed by: ") + *w.ClaimedBy + "  at " + strOr(w.ClaimedAt, "") + "\n"
	}
	if w.Resolution != nil {
		s += sectionHeader.Render("Resolution") + "\n" + *w.Resolution + "\n"
	}
	if w.ResolutionGist != nil {
		s += labelStyle.Render("gist: ") + *w.ResolutionGist + "\n"
	}
	if w.Rationale != nil {
		s += labelStyle.Render("rationale: ") + *w.Rationale + "\n"
	}
	if w.ReachedIn != nil {
		s += labelStyle.Render("reached in: ") + *w.ReachedIn + " at " + strOr(w.ReachedAt, "") + "\n"
	}
	if w.BypassReason != nil {
		s += labelStyle.Render("bypass reason: ") + *w.BypassReason + "\n"
	}
	if w.UnbypassReason != nil {
		s += labelStyle.Render("unbypass reason: ") + *w.UnbypassReason + "\n"
	}
	if w.SpurredToExpeditionID != nil {
		s += labelStyle.Render("spurred to expedition: ") + *w.SpurredToExpeditionID + "\n"
	}
	s += "\n" + labelStyle.Render("created: ") + w.CreatedAt + "   " + labelStyle.Render("updated: ") + w.UpdatedAt
	return s
}

func (p *WaypointDetailPage) Title() string {
	return fmt.Sprintf("Waypoint #%d", p.waypoint.WaypointNumber)
}

func (p *WaypointDetailPage) SetSize(w, h int) {
	p.vp.Width = w
	vh := h - actionAreaHeight
	if vh < 0 {
		vh = 0
	}
	p.vp.Height = vh
}

func (p *WaypointDetailPage) Init() tea.Cmd { return nil }

type waypointActionMsg struct {
	waypoint *rigclient.Waypoint
	verb     string
	err      error
}

func (p *WaypointDetailPage) runAction(f func() (*rigclient.Waypoint, error), verb string) tea.Cmd {
	return func() tea.Msg {
		wp, err := f()
		return waypointActionMsg{waypoint: wp, verb: verb, err: err}
	}
}

func (p *WaypointDetailPage) formActive() bool { return p.activeForm() != nil }

func (p *WaypointDetailPage) activeForm() *Form {
	for _, f := range []*Form{p.claimForm, p.reachForm, p.bypassForm, p.unbypassForm} {
		if f.Active {
			return f
		}
	}
	return nil
}

func (p *WaypointDetailPage) Update(msg tea.Msg) (Page, tea.Cmd) {
	client, id := p.client, p.waypoint.ID

	if f := p.activeForm(); f != nil {
		if handled, cmd := f.Update(msg); handled {
			return p, cmd
		}
	}

	switch msg := msg.(type) {
	case waypointActionMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		if msg.waypoint != nil {
			p.waypoint = *msg.waypoint
			p.vp.SetContent(renderWaypointInfo(p.waypoint))
		}
		return p, Status(msg.verb + ": ok")

	case tea.KeyMsg:
		switch msg.String() {
		case "c":
			p.claimForm.Open()
			p.claimForm.OnSubmit = func(v []string) tea.Cmd {
				return p.runAction(func() (*rigclient.Waypoint, error) {
					ctx, cancel := withTimeout()
					defer cancel()
					return client.ClaimWaypoint(ctx, id, v[0])
				}, "claim")
			}
			return p, nil
		case "l":
			return p, p.runAction(func() (*rigclient.Waypoint, error) {
				ctx, cancel := withTimeout()
				defer cancel()
				return client.ReleaseWaypoint(ctx, id)
			}, "release")
		case "e":
			p.reachForm.Open()
			p.reachForm.OnSubmit = func(v []string) tea.Cmd {
				return p.runAction(func() (*rigclient.Waypoint, error) {
					ctx, cancel := withTimeout()
					defer cancel()
					return client.ReachWaypoint(ctx, id, rigclient.ReachWaypointRequest{
						Resolution: v[0], ResolutionGist: v[1], Rationale: v[2], ReachedIn: v[3],
					})
				}, "reach")
			}
			return p, nil
		case "b":
			p.bypassForm.Open()
			p.bypassForm.OnSubmit = func(v []string) tea.Cmd {
				return p.runAction(func() (*rigclient.Waypoint, error) {
					ctx, cancel := withTimeout()
					defer cancel()
					return client.BypassWaypoint(ctx, id, v[0])
				}, "bypass")
			}
			return p, nil
		case "u":
			p.unbypassForm.Open()
			p.unbypassForm.OnSubmit = func(v []string) tea.Cmd {
				return p.runAction(func() (*rigclient.Waypoint, error) {
					ctx, cancel := withTimeout()
					defer cancel()
					return client.UnbypassWaypoint(ctx, id, v[0])
				}, "unbypass")
			}
			return p, nil
		}
	}

	var cmd tea.Cmd
	p.vp, cmd = p.vp.Update(msg)
	return p, cmd
}

func (p *WaypointDetailPage) View() string {
	action := ""
	if f := p.activeForm(); f != nil {
		action = f.View()
	} else {
		action = helpStyle.Render("c: claim · l: release · e: reach · b: bypass · u: unbypass")
	}
	return p.vp.View() + "\n" + action
}
