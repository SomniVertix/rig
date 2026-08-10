package ui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/somnivertix/rig/herdr-plugin/internal/rigclient"
)

// ExpeditionDetailPage shows one expedition's metadata plus its waypoints —
// the same content as the web console's trail detail screen.
type ExpeditionDetailPage struct {
	client     *rigclient.Client
	expedition rigclient.Expedition
	list       list.Model
	info       string
	infoLines  int
}

func NewExpeditionDetailPage(client *rigclient.Client, exp rigclient.Expedition) *ExpeditionDetailPage {
	p := &ExpeditionDetailPage{client: client, expedition: exp, list: newList("Waypoints")}
	p.info = renderExpeditionInfo(exp)
	p.infoLines = lipgloss.Height(p.info)
	return p
}

func renderExpeditionInfo(e rigclient.Expedition) string {
	s := labelStyle.Render("status: ") + statusBadge(e.Status) +
		"   " + labelStyle.Render("slug: ") + e.Slug + "\n"
	s += labelStyle.Render("brief: ") + e.BriefingPrompt + "\n"
	if e.Destination != nil {
		s += labelStyle.Render("destination: ") + *e.Destination + "\n"
	}
	if e.OutcomeKind != nil {
		s += labelStyle.Render("outcome: ") + strOr(e.OutcomeKind, "") + " " + strOr(e.OutcomeSpecID, "") + "\n"
	}
	return s
}

func (p *ExpeditionDetailPage) Title() string { return p.expedition.Title }

func (p *ExpeditionDetailPage) SetSize(w, h int) {
	p.list.SetSize(w, footerHeight(h-p.infoLines))
}

func (p *ExpeditionDetailPage) isFiltering() bool { return isFilteringList(p.list) }
func (p *ExpeditionDetailPage) onFirstPage() bool { return onFirstPageList(p.list) }

type waypointsLoadedMsg struct {
	waypoints []rigclient.Waypoint
	err       error
}

func (p *ExpeditionDetailPage) Init() tea.Cmd {
	client, id := p.client, p.expedition.ID
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		wps, err := client.ListWaypoints(ctx, id)
		return waypointsLoadedMsg{waypoints: wps, err: err}
	}
}

func (p *ExpeditionDetailPage) Update(msg tea.Msg) (Page, tea.Cmd) {
	switch msg := msg.(type) {
	case waypointsLoadedMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		items := make([]list.Item, len(msg.waypoints))
		for i, w := range msg.waypoints {
			items[i] = item{
				id:      w.ID,
				title:   fmt.Sprintf("#%d %s  [%s]", w.WaypointNumber, w.Title, w.Status),
				desc:    w.Question,
				payload: w,
			}
		}
		return p, p.list.SetItems(items)

	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			if it, ok := p.list.SelectedItem().(item); ok {
				wp := it.payload.(rigclient.Waypoint)
				return p, Push(NewWaypointDetailPage(p.client, wp))
			}
			return p, nil
		case "r":
			return p, p.Init()
		}
	}

	var cmd tea.Cmd
	p.list, cmd = p.list.Update(msg)
	return p, cmd
}

func (p *ExpeditionDetailPage) View() string {
	return p.info + p.list.View() + "\n" + helpStyle.Render("r: refresh · enter: open waypoint")
}
