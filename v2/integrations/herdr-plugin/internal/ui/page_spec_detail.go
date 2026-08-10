package ui

import (
	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/somnivertix/rig/integrations/herdr-plugin/internal/rigclient"
)

// SpecDetailPage shows one spec's four pipeline stages (requirements,
// design, tasks, implementation) with their statuses, and lets you
// finalize/approve/deny each — the same lifecycle actions the web
// console's spec detail screen exposes, minus the document-editing UI
// (this plugin is a viewer + approver, not a drafting tool).
type SpecDetailPage struct {
	client    *rigclient.Client
	spec      rigclient.Spec
	list      list.Model
	info      string
	infoLines int
	denyForm  *Form
}

func NewSpecDetailPage(client *rigclient.Client, spec rigclient.Spec) *SpecDetailPage {
	p := &SpecDetailPage{
		client:   client,
		spec:     spec,
		list:     newList("Stages"),
		denyForm: NewForm("Deny stage", []string{"Reason"}, nil),
	}
	// Fixed 4-row menu — filtering has no value here and would otherwise
	// need the same isFiltering() escape hatch the other list pages use.
	p.list.SetFilteringEnabled(false)
	p.setSpec(spec)
	return p
}

func (p *SpecDetailPage) setSpec(spec rigclient.Spec) {
	p.spec = spec
	p.info = labelStyle.Render("slug: ") + spec.Slug + "\n"
	p.infoLines = lipgloss.Height(p.info)

	items := []list.Item{
		item{id: "requirements", title: "Requirements  " + statusBadge(spec.RequirementsStageStatus), desc: denialDesc(spec.RequirementsDeniedAt, spec.RequirementsLastDenialReason), payload: "requirements"},
		item{id: "design", title: "Design  " + statusBadge(spec.DesignStageStatus), desc: denialDesc(spec.DesignDeniedAt, spec.DesignLastDenialReason), payload: "design"},
		item{id: "tasks", title: "Tasks  " + statusBadge(spec.TasksStageStatus), desc: "enter: view per-component task docs", payload: "tasks"},
		item{id: "implementation", title: "Implementation  " + statusBadge(spec.ImplementationStageStatus), desc: denialDesc(spec.ImplementationDeniedAt, spec.ImplementationLastDenialReason), payload: "implementation"},
	}
	p.list.SetItems(items)
}

func denialDesc(deniedAt, reason *string) string {
	if deniedAt == nil {
		return ""
	}
	return "denied " + *deniedAt + ": " + strOr(reason, "")
}

func (p *SpecDetailPage) Title() string { return p.spec.FeatureName }

func (p *SpecDetailPage) SetSize(w, h int) {
	p.list.SetSize(w, footerHeight(h-p.infoLines))
}

func (p *SpecDetailPage) formActive() bool { return p.denyForm.Active }

func (p *SpecDetailPage) Init() tea.Cmd {
	client, id := p.client, p.spec.ID
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		spec, err := client.GetSpec(ctx, id)
		return specLoadedMsg{spec: spec, err: err}
	}
}

type specLoadedMsg struct {
	spec *rigclient.Spec
	err  error
}

type stageActionMsg struct {
	spec *rigclient.Spec
	verb string
	err  error
}

func (p *SpecDetailPage) selectedStage() (rigclient.SpecStageName, bool) {
	it, ok := p.list.SelectedItem().(item)
	if !ok {
		return "", false
	}
	return rigclient.SpecStageName(it.payload.(string)), true
}

func (p *SpecDetailPage) doStageAction(kind string, stage rigclient.SpecStageName, reason string) tea.Cmd {
	client, id := p.client, p.spec.ID
	req := rigclient.StageActionRequest{Stage: stage, Reason: reason}
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		var resp *rigclient.StageActionResponse
		var err error
		switch kind {
		case "finalize":
			resp, err = client.FinalizeStage(ctx, id, req)
		case "approve":
			resp, err = client.ApproveStage(ctx, id, req)
		case "deny":
			resp, err = client.DenyStage(ctx, id, req)
		}
		if err != nil {
			return stageActionMsg{verb: kind, err: err}
		}
		return stageActionMsg{spec: resp.Spec, verb: kind}
	}
}

func (p *SpecDetailPage) viewRendered(stage rigclient.SpecStageName) tea.Cmd {
	client, id := p.client, p.spec.ID
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		md, err := client.RenderSpecDocument(ctx, id, stage, "")
		if err != nil {
			return renderedDocMsg{err: err}
		}
		return renderedDocMsg{stage: string(stage), markdown: md}
	}
}

type renderedDocMsg struct {
	stage    string
	markdown string
	err      error
}

func (p *SpecDetailPage) Update(msg tea.Msg) (Page, tea.Cmd) {
	if handled, cmd := p.denyForm.Update(msg); handled {
		return p, cmd
	}

	switch msg := msg.(type) {
	case specLoadedMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		p.setSpec(*msg.spec)
		return p, nil

	case stageActionMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		if msg.spec != nil {
			p.setSpec(*msg.spec)
		}
		return p, Status(msg.verb + ": ok")

	case renderedDocMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		return p, Push(NewTextViewPage(p.spec.FeatureName+" / "+msg.stage, msg.markdown))

	case tea.KeyMsg:
		stage, ok := p.selectedStage()
		if !ok {
			break
		}
		switch msg.String() {
		case "enter":
			if stage == rigclient.StageTasks {
				return p, Push(NewTasksDocsPage(p.client, p.spec.ID, p.spec.FeatureName))
			}
			return p, nil
		case "f":
			if stage == rigclient.StageTasks {
				return p, nil
			}
			return p, p.doStageAction("finalize", stage, "")
		case "a":
			if stage == rigclient.StageTasks {
				return p, nil
			}
			return p, p.doStageAction("approve", stage, "")
		case "d":
			if stage == rigclient.StageTasks {
				return p, nil
			}
			p.denyForm.Open()
			p.denyForm.OnSubmit = func(v []string) tea.Cmd {
				return p.doStageAction("deny", stage, v[0])
			}
			return p, nil
		case "v":
			if stage == rigclient.StageTasks {
				return p, nil
			}
			return p, p.viewRendered(stage)
		}
	}

	var cmd tea.Cmd
	p.list, cmd = p.list.Update(msg)
	return p, cmd
}

func (p *SpecDetailPage) View() string {
	footer := helpStyle.Render("f: finalize · a: approve · d: deny · v: view doc · enter: tasks docs")
	if p.denyForm.Active {
		footer = p.denyForm.View()
	}
	return p.info + p.list.View() + "\n" + footer
}
