package ui

import "github.com/charmbracelet/bubbles/list"

// item is a generic list.Item used by every list page (expeditions, specs,
// handoffs, waypoints, tasks docs, workspaces) — the row text differs per
// domain object, but selecting a row always just needs its ID plus enough
// info to render a detail page.
type item struct {
	id      string
	title   string
	desc    string
	payload any
}

func (i item) FilterValue() string { return i.title }
func (i item) Title() string       { return i.title }
func (i item) Description() string { return i.desc }

func newList(title string) list.Model {
	delegate := list.NewDefaultDelegate()
	delegate.Styles.SelectedTitle = delegate.Styles.SelectedTitle.Foreground(colorAccent).BorderLeftForeground(colorAccent)
	delegate.Styles.SelectedDesc = delegate.Styles.SelectedDesc.Foreground(colorAccent)

	l := list.New(nil, delegate, 0, 0)
	l.Title = title
	l.Styles.Title = l.Styles.Title.Background(colorMuted)
	l.SetShowStatusBar(true)
	l.SetFilteringEnabled(true)
	// App owns "q"/"esc" for back-navigation (see app.go); the list's own
	// built-in quit keybinding would otherwise call tea.Quit straight out
	// of a nested page instead of popping one level.
	l.DisableQuitKeybindings()
	return l
}

// isFilteringList and onFirstPageList back every list page's isFiltering()/
// onFirstPage() methods (see app.go's filterer/pager interfaces) — one
// implementation instead of six near-identical copies.
func isFilteringList(l list.Model) bool { return l.FilterState() == list.Filtering }
func onFirstPageList(l list.Model) bool { return l.Paginator.OnFirstPage() }
