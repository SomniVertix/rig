package ui

import (
	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/somnivertix/rig/herdr-plugin/internal/rigclient"
)

type SpecsPage struct {
	client      *rigclient.Client
	workspaceID string
	list        list.Model
}

func NewSpecsPage(client *rigclient.Client, workspaceID string) *SpecsPage {
	return &SpecsPage{client: client, workspaceID: workspaceID, list: newList("Specs")}
}

func (p *SpecsPage) Title() string     { return "Specs" }
func (p *SpecsPage) SetSize(w, h int)  { p.list.SetSize(w, footerHeight(h)) }
func (p *SpecsPage) isFiltering() bool { return p.list.FilterState() == list.Filtering }
func (p *SpecsPage) onFirstPage() bool { return p.list.Paginator.OnFirstPage() }

type specsLoadedMsg struct {
	specs []rigclient.Spec
	err   error
}

func (p *SpecsPage) Init() tea.Cmd {
	client, ws := p.client, p.workspaceID
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		specs, err := client.ListSpecs(ctx, ws)
		return specsLoadedMsg{specs: specs, err: err}
	}
}

func (p *SpecsPage) Update(msg tea.Msg) (Page, tea.Cmd) {
	switch msg := msg.(type) {
	case specsLoadedMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		items := make([]list.Item, len(msg.specs))
		for i, s := range msg.specs {
			desc := "req:" + s.RequirementsStageStatus + "  design:" + s.DesignStageStatus +
				"  tasks:" + s.TasksStageStatus + "  impl:" + s.ImplementationStageStatus
			items[i] = item{id: s.ID, title: s.FeatureName, desc: desc, payload: s}
		}
		return p, p.list.SetItems(items)

	case tea.KeyMsg:
		switch msg.String() {
		case "enter":
			if it, ok := p.list.SelectedItem().(item); ok {
				spec := it.payload.(rigclient.Spec)
				return p, Push(NewSpecDetailPage(p.client, spec))
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

func (p *SpecsPage) View() string {
	return p.list.View() + "\n" + helpStyle.Render("r: refresh · enter: open")
}
