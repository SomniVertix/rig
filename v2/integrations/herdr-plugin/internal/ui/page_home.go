package ui

import (
	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/somnivertix/rig/integrations/herdr-plugin/internal/rigclient"
)

// HomePage is a single workspace's menu — the same three domains the web
// console's per-workspace nav exposes (specs, trails/expeditions, handoffs).
type HomePage struct {
	client      *rigclient.Client
	workspaceID string
	list        list.Model
}

func NewHomePage(client *rigclient.Client, workspaceID string) *HomePage {
	l := newList("Menu")
	l.SetItems([]list.Item{
		item{id: "expeditions", title: "Expeditions", desc: "Wayfinder trails: waypoints, decisions, outcomes"},
		item{id: "specs", title: "Specs", desc: "Requirements / design / tasks / implementation pipeline"},
		item{id: "handoffs", title: "Handoffs", desc: "Cross-workspace bug/question/fyi/dependency messages"},
	})
	l.SetFilteringEnabled(false)
	return &HomePage{client: client, workspaceID: workspaceID, list: l}
}

func (p *HomePage) Title() string    { return p.workspaceID }
func (p *HomePage) SetSize(w, h int) { p.list.SetSize(w, h) }
func (p *HomePage) Init() tea.Cmd    { return nil }

func (p *HomePage) Update(msg tea.Msg) (Page, tea.Cmd) {
	if key, ok := msg.(tea.KeyMsg); ok && key.String() == "enter" {
		it, ok := p.list.SelectedItem().(item)
		if !ok {
			return p, nil
		}
		switch it.id {
		case "expeditions":
			return p, Push(NewExpeditionsPage(p.client, p.workspaceID))
		case "specs":
			return p, Push(NewSpecsPage(p.client, p.workspaceID))
		case "handoffs":
			return p, Push(NewHandoffsPage(p.client, p.workspaceID))
		}
		return p, nil
	}
	var cmd tea.Cmd
	p.list, cmd = p.list.Update(msg)
	return p, cmd
}

func (p *HomePage) View() string { return p.list.View() }
