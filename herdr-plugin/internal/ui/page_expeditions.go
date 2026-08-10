package ui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/somnivertix/rig/herdr-plugin/internal/rigclient"
)

var expeditionFilters = []rigclient.ExpeditionStatus{"", rigclient.ExpeditionActive, rigclient.ExpeditionComplete, rigclient.ExpeditionAbandoned}

type ExpeditionsPage struct {
	client      *rigclient.Client
	workspaceID string
	list        list.Model
	filterIdx   int
}

func NewExpeditionsPage(client *rigclient.Client, workspaceID string) *ExpeditionsPage {
	l := newList("Expeditions")
	return &ExpeditionsPage{client: client, workspaceID: workspaceID, list: l}
}

func (p *ExpeditionsPage) Title() string     { return "Expeditions" }
func (p *ExpeditionsPage) SetSize(w, h int)  { p.list.SetSize(w, footerHeight(h)) }
func (p *ExpeditionsPage) isFiltering() bool { return isFilteringList(p.list) }
func (p *ExpeditionsPage) onFirstPage() bool { return onFirstPageList(p.list) }

func (p *ExpeditionsPage) filter() rigclient.ExpeditionStatus { return expeditionFilters[p.filterIdx] }

func (p *ExpeditionsPage) filterLabel() string {
	if p.filter() == "" {
		return "all"
	}
	return string(p.filter())
}

type expeditionsLoadedMsg struct {
	expeditions []rigclient.Expedition
	err         error
}

func (p *ExpeditionsPage) load() tea.Cmd {
	client, ws, status := p.client, p.workspaceID, p.filter()
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		exps, err := client.ListExpeditions(ctx, ws, status)
		return expeditionsLoadedMsg{expeditions: exps, err: err}
	}
}

func (p *ExpeditionsPage) Init() tea.Cmd {
	p.list.Title = fmt.Sprintf("Expeditions (%s)", p.filterLabel())
	return p.load()
}

func (p *ExpeditionsPage) Update(msg tea.Msg) (Page, tea.Cmd) {
	switch msg := msg.(type) {
	case expeditionsLoadedMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		items := make([]list.Item, len(msg.expeditions))
		for i, e := range msg.expeditions {
			items[i] = item{
				id:      e.ID,
				title:   fmt.Sprintf("%s  [%s]", e.Title, e.Status),
				desc:    e.BriefingPrompt,
				payload: e,
			}
		}
		return p, p.list.SetItems(items)

	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			if it, ok := p.list.SelectedItem().(item); ok {
				exp := it.payload.(rigclient.Expedition)
				return p, Push(NewExpeditionDetailPage(p.client, exp))
			}
			return p, nil
		case "f":
			p.filterIdx = (p.filterIdx + 1) % len(expeditionFilters)
			p.list.Title = fmt.Sprintf("Expeditions (%s)", p.filterLabel())
			return p, p.load()
		case "r":
			return p, p.load()
		}
	}

	var cmd tea.Cmd
	p.list, cmd = p.list.Update(msg)
	return p, cmd
}

func (p *ExpeditionsPage) View() string {
	return p.list.View() + "\n" + helpStyle.Render("f: filter status · r: refresh · enter: open")
}
