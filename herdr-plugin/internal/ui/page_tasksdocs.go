package ui

import (
	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/somnivertix/rig/herdr-plugin/internal/rigclient"
)

// TasksDocsPage lists one spec's per-design-component tasks docs — the
// tasks stage is tracked per component, unlike requirements/design/
// implementation which are spec-wide.
type TasksDocsPage struct {
	client   *rigclient.Client
	specID   string
	specName string
	list     list.Model
	denyForm *Form
}

func NewTasksDocsPage(client *rigclient.Client, specID, specName string) *TasksDocsPage {
	return &TasksDocsPage{
		client:   client,
		specID:   specID,
		specName: specName,
		list:     newList("Tasks docs"),
		denyForm: NewForm("Deny tasks stage", []string{"Reason"}, nil),
	}
}

func (p *TasksDocsPage) Title() string     { return p.specName + " / tasks" }
func (p *TasksDocsPage) SetSize(w, h int)  { p.list.SetSize(w, footerHeight(h)) }
func (p *TasksDocsPage) isFiltering() bool { return p.list.FilterState() == list.Filtering }
func (p *TasksDocsPage) onFirstPage() bool { return p.list.Paginator.OnFirstPage() }
func (p *TasksDocsPage) formActive() bool  { return p.denyForm.Active }

type tasksDocsLoadedMsg struct {
	docs []rigclient.TasksDoc
	err  error
}

func (p *TasksDocsPage) Init() tea.Cmd {
	client, id := p.client, p.specID
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		docs, err := client.ListTasksDocs(ctx, id)
		return tasksDocsLoadedMsg{docs: docs, err: err}
	}
}

func (p *TasksDocsPage) selected() (rigclient.TasksDoc, bool) {
	it, ok := p.list.SelectedItem().(item)
	if !ok {
		return rigclient.TasksDoc{}, false
	}
	return it.payload.(rigclient.TasksDoc), true
}

func (p *TasksDocsPage) doAction(kind string, doc rigclient.TasksDoc, reason string) tea.Cmd {
	client, specID := p.client, p.specID
	req := rigclient.StageActionRequest{Stage: rigclient.StageTasks, Component: doc.ComponentSlug, Reason: reason}
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		var err error
		switch kind {
		case "finalize":
			_, err = client.FinalizeStage(ctx, specID, req)
		case "approve":
			_, err = client.ApproveStage(ctx, specID, req)
		case "deny":
			_, err = client.DenyStage(ctx, specID, req)
		}
		if err != nil {
			return stageActionMsg{verb: kind, err: err}
		}
		return stageActionMsg{verb: kind}
	}
}

func (p *TasksDocsPage) viewRendered(doc rigclient.TasksDoc) tea.Cmd {
	client, specID := p.client, p.specID
	return func() tea.Msg {
		ctx, cancel := withTimeout()
		defer cancel()
		md, err := client.RenderSpecDocument(ctx, specID, rigclient.StageTasks, doc.ComponentSlug)
		if err != nil {
			return renderedDocMsg{err: err}
		}
		return renderedDocMsg{stage: "tasks/" + doc.ComponentSlug, markdown: md}
	}
}

func (p *TasksDocsPage) Update(msg tea.Msg) (Page, tea.Cmd) {
	if handled, cmd := p.denyForm.Update(msg); handled {
		return p, cmd
	}

	switch msg := msg.(type) {
	case tasksDocsLoadedMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		items := make([]list.Item, len(msg.docs))
		for i, d := range msg.docs {
			items[i] = item{id: d.ID, title: d.ComponentName + "  " + statusBadge(d.Status), desc: denialDesc(d.DeniedAt, d.LastDenialReason), payload: d}
		}
		return p, p.list.SetItems(items)

	case stageActionMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		return p, tea.Batch(Status(msg.verb+": ok"), p.Init())

	case renderedDocMsg:
		if msg.err != nil {
			return p, StatusErr(msg.err)
		}
		return p, Push(NewTextViewPage(p.specName+" / "+msg.stage, msg.markdown))

	case tea.KeyMsg:
		doc, ok := p.selected()
		if !ok {
			break
		}
		switch msg.String() {
		case "f":
			return p, p.doAction("finalize", doc, "")
		case "a":
			return p, p.doAction("approve", doc, "")
		case "d":
			p.denyForm.Open()
			p.denyForm.OnSubmit = func(v []string) tea.Cmd { return p.doAction("deny", doc, v[0]) }
			return p, nil
		case "v":
			return p, p.viewRendered(doc)
		case "r":
			return p, p.Init()
		}
	}

	var cmd tea.Cmd
	p.list, cmd = p.list.Update(msg)
	return p, cmd
}

func (p *TasksDocsPage) View() string {
	footer := helpStyle.Render("f: finalize · a: approve · d: deny · v: view doc · r: refresh")
	if p.denyForm.Active {
		footer = p.denyForm.View()
	}
	return p.list.View() + "\n" + footer
}
