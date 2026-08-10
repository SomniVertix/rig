package ui

import (
	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/somnivertix/rig/integrations/herdr-plugin/internal/rigclient"
)

// WorkspacesPage is the root screen: every workspaceId a scanned
// .code-workspace file claims, mirroring the web console's /workspaces
// overview (there is no default workspace to guess at).
type WorkspacesPage struct {
	client *rigclient.Client
	list   list.Model
	err    error
}

func NewWorkspacesPage(client *rigclient.Client) *WorkspacesPage {
	return &WorkspacesPage{client: client, list: newList("Workspaces")}
}

func (p *WorkspacesPage) Title() string { return "rig" }

func (p *WorkspacesPage) SetSize(w, h int)  { p.list.SetSize(w, h) }
func (p *WorkspacesPage) isFiltering() bool { return p.list.FilterState() == list.Filtering }
func (p *WorkspacesPage) onFirstPage() bool { return p.list.Paginator.OnFirstPage() }

type workspacesLoadedMsg struct {
	workspaces []rigclient.Workspace
	err        error
}

func (p *WorkspacesPage) Init() tea.Cmd {
	client := p.client
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		ws, err := client.ListWorkspaces(ctx)
		return workspacesLoadedMsg{workspaces: ws, err: err}
	}
}

func (p *WorkspacesPage) Update(msg tea.Msg) (Page, tea.Cmd) {
	switch msg := msg.(type) {
	case workspacesLoadedMsg:
		p.err = msg.err
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		items := make([]list.Item, len(msg.workspaces))
		for i, w := range msg.workspaces {
			items[i] = item{id: w.WorkspaceID, title: w.WorkspaceID, desc: w.Label}
		}
		return p, p.list.SetItems(items)

	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			if it, ok := p.list.SelectedItem().(item); ok {
				return p, Push(NewHomePage(p.client, it.id))
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

func (p *WorkspacesPage) View() string {
	return p.list.View()
}
