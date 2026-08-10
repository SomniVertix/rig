// Package ui is the Herdr-pane TUI: a stack of Pages backed by rig's REST
// API, giving read+write access to the same expeditions/waypoints/specs/
// handoffs the Rig web console shows.
package ui

import (
	"context"
	"fmt"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/somnivertix/rig/integrations/herdr-plugin/internal/rigclient"
)

// Page is one screen in the navigation stack. Pages that need the terminal
// size implement SetSize; App calls it before Init on every push and on
// every WindowSizeMsg.
type Page interface {
	Init() tea.Cmd
	Update(tea.Msg) (Page, tea.Cmd)
	View() string
	Title() string
}

type sizer interface {
	SetSize(width, height int)
}

// filterer and formHolder let App ask a page whether "q"/"esc" should be
// treated as ordinary input (typing into a list filter, or a keystroke
// inside an open Form) rather than App's own quit/back navigation. Pages
// that don't hold a filterable list or a Form simply don't implement
// these, and the type assertions below just fail closed.
type filterer interface{ isFiltering() bool }
type formHolder interface{ formActive() bool }

// wantsKeyItself reports whether the top page is mid-filter-typing or has
// an open Form, in which case q/esc must reach the page instead of being
// intercepted as global quit/back.
func wantsKeyItself(p Page) bool {
	if f, ok := p.(filterer); ok && f.isFiltering() {
		return true
	}
	if f, ok := p.(formHolder); ok && f.formActive() {
		return true
	}
	return false
}

// pager lets App ask whether "left" is free to mean "go back": bubbles/list
// binds left/h to PrevPage by default, so left must only navigate the page
// stack when the top page's list has nothing left to page through.
type pager interface{ onFirstPage() bool }

func canGoBackWithLeft(p Page) bool {
	if pg, ok := p.(pager); ok {
		return pg.onFirstPage()
	}
	return true
}

// PushPageMsg navigates forward; PopPageMsg navigates back. Pages return
// these wrapped in a tea.Cmd (via Push/Pop helpers below) instead of
// mutating navigation state directly, since only App owns the stack.
type PushPageMsg struct{ Page Page }
type PopPageMsg struct{}

// StatusMsg sets the transient status line at the bottom of the screen.
type StatusMsg struct {
	Text string
	Err  bool
}

func Push(p Page) tea.Cmd { return func() tea.Msg { return PushPageMsg{Page: p} } }
func Pop() tea.Cmd        { return func() tea.Msg { return PopPageMsg{} } }
func Status(text string) tea.Cmd {
	return func() tea.Msg { return StatusMsg{Text: text} }
}
func StatusErr(err error) tea.Cmd {
	return func() tea.Msg { return StatusMsg{Text: err.Error(), Err: true} }
}

func clearStatusAfter(d time.Duration) tea.Cmd {
	return tea.Tick(d, func(time.Time) tea.Msg { return clearStatusMsg{} })
}

type clearStatusMsg struct{}

// App is the root bubbletea model.
type App struct {
	Client *rigclient.Client

	stack  []Page
	width  int
	height int

	statusText string
	statusErr  bool
}

func NewApp(client *rigclient.Client, root Page) *App {
	return &App{Client: client, stack: []Page{root}}
}

func (a *App) top() Page { return a.stack[len(a.stack)-1] }

func (a *App) Init() tea.Cmd {
	return a.top().Init()
}

func (a *App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		a.width, a.height = msg.Width, msg.Height
		for _, p := range a.stack {
			if s, ok := p.(sizer); ok {
				s.SetSize(a.width, a.contentHeight())
			}
		}
		return a, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return a, tea.Quit
		case "q", "esc":
			if wantsKeyItself(a.top()) {
				// Mid-filter-typing or an open Form: esc/q must reach the
				// page as ordinary input (cancel the filter, cancel the
				// form) instead of navigating.
				break
			}
			if len(a.stack) > 1 {
				return a.Update(PopPageMsg{})
			}
			if msg.String() == "q" {
				return a, tea.Quit
			}
		case "left":
			if len(a.stack) > 1 && !wantsKeyItself(a.top()) && canGoBackWithLeft(a.top()) {
				return a.Update(PopPageMsg{})
			}
		}

	case PushPageMsg:
		if s, ok := msg.Page.(sizer); ok {
			s.SetSize(a.width, a.contentHeight())
		}
		a.stack = append(a.stack, msg.Page)
		a.statusText = ""
		return a, msg.Page.Init()

	case PopPageMsg:
		if len(a.stack) > 1 {
			a.stack = a.stack[:len(a.stack)-1]
		}
		a.statusText = ""
		// Re-running Init reloads the page being returned to, so data edited
		// one level down (e.g. a waypoint just claimed) shows up immediately
		// without a manual refresh keypress.
		return a, a.top().Init()

	case StatusMsg:
		a.statusText = msg.Text
		a.statusErr = msg.Err
		return a, clearStatusAfter(6 * time.Second)

	case clearStatusMsg:
		a.statusText = ""
		return a, nil
	}

	newTop, cmd := a.top().Update(msg)
	a.stack[len(a.stack)-1] = newTop
	return a, cmd
}

// contentHeight reserves two rows for the title bar and one for the status
// line, so pages can size their scroll areas to fit exactly.
func (a *App) contentHeight() int {
	h := a.height - 3
	if h < 0 {
		return 0
	}
	return h
}

func (a *App) View() string {
	title := "rig"
	if len(a.stack) > 0 {
		title = a.top().Title()
	}
	bar := titleStyle.Render(fmt.Sprintf(" %s ", title))

	crumbs := ""
	if len(a.stack) > 1 {
		names := make([]string, len(a.stack))
		for i, p := range a.stack {
			names[i] = p.Title()
		}
		crumbs = breadcrumbStyle.Render(" " + joinBreadcrumbs(names) + " ")
	}

	status := helpStyle.Render(" q/esc/← back · ctrl+c quit ")
	if a.statusText != "" {
		if a.statusErr {
			status = statusErrStyle.Render(" " + a.statusText + " ")
		} else {
			status = statusOKStyle.Render(" " + a.statusText + " ")
		}
	}

	return bar + crumbs + "\n" + a.top().View() + "\n" + status
}

func joinBreadcrumbs(names []string) string {
	out := ""
	for i, n := range names {
		if i > 0 {
			out += " › "
		}
		out += n
	}
	return out
}

// footerHeight is subtracted by any page that renders one extra help line
// below its main content (list/viewport), keeping total output within the
// height App already reserved via contentHeight.
func footerHeight(h int) int {
	h--
	if h < 0 {
		return 0
	}
	return h
}

// withTimeout is the standard context every API call in this plugin uses —
// panes run interactively, so a hung request must not freeze the TUI.
func withTimeout() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 10*time.Second)
}
