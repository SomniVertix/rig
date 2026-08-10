package ui

import (
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
)

// Form is a small modal text-input overlay used by detail pages for the
// handful of write actions that need free text (claim by, reach
// resolution, bypass/deny reason, ...). It renders on top of a page's own
// View when Active, and swallows key events until submitted or cancelled.
type Form struct {
	Active   bool
	Title    string
	labels   []string
	optional []bool
	inputs   []textinput.Model
	focus    int
	OnSubmit func(values []string) tea.Cmd
}

func NewForm(title string, labels []string, optional []bool) *Form {
	inputs := make([]textinput.Model, len(labels))
	for i, l := range labels {
		ti := textinput.New()
		ti.Placeholder = l
		ti.CharLimit = 2000
		ti.Width = 60
		inputs[i] = ti
	}
	return &Form{Title: title, labels: labels, optional: optional, inputs: inputs}
}

// Open resets every field and shows the form.
func (f *Form) Open() {
	f.Active = true
	f.focus = 0
	for i := range f.inputs {
		f.inputs[i].SetValue("")
		f.inputs[i].Blur()
	}
	f.inputs[0].Focus()
}

// Update returns handled=true when the form consumed msg (the caller should
// not process it further) plus any resulting command.
func (f *Form) Update(msg tea.Msg) (handled bool, cmd tea.Cmd) {
	if !f.Active {
		return false, nil
	}
	if key, ok := msg.(tea.KeyMsg); ok {
		switch key.String() {
		case "esc":
			f.Active = false
			return true, nil
		case "tab", "down":
			f.advance(1)
			return true, nil
		case "shift+tab", "up":
			f.advance(-1)
			return true, nil
		case "enter":
			if f.focus < len(f.inputs)-1 {
				f.advance(1)
				return true, nil
			}
			if !f.valid() {
				return true, nil
			}
			values := make([]string, len(f.inputs))
			for i, in := range f.inputs {
				values[i] = in.Value()
			}
			f.Active = false
			if f.OnSubmit != nil {
				return true, f.OnSubmit(values)
			}
			return true, nil
		}
	}
	var c tea.Cmd
	f.inputs[f.focus], c = f.inputs[f.focus].Update(msg)
	return true, c
}

func (f *Form) valid() bool {
	for i, in := range f.inputs {
		required := f.optional == nil || !f.optional[i]
		if required && in.Value() == "" {
			return false
		}
	}
	return true
}

func (f *Form) advance(delta int) {
	f.inputs[f.focus].Blur()
	f.focus = (f.focus + delta + len(f.inputs)) % len(f.inputs)
	f.inputs[f.focus].Focus()
}

func (f *Form) View() string {
	if !f.Active {
		return ""
	}
	body := sectionHeader.Render(f.Title) + "\n"
	for i, in := range f.inputs {
		label := f.labels[i]
		if f.optional != nil && f.optional[i] {
			label += " (optional)"
		}
		body += labelStyle.Render(label+": ") + in.View() + "\n"
	}
	body += helpStyle.Render("tab/enter: next field · enter on last field: submit · esc: cancel")
	return promptBoxStyle.Render(body)
}
