package ui

import (
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

// TextViewPage is a read-only scrollable page for rendered spec markdown,
// handoff bodies, and conversation transcripts — content the API returns
// as one text blob with nothing to act on.
type TextViewPage struct {
	title string
	vp    viewport.Model
}

func NewTextViewPage(title, content string) *TextViewPage {
	vp := viewport.New(0, 0)
	vp.SetContent(content)
	return &TextViewPage{title: title, vp: vp}
}

func (p *TextViewPage) Title() string    { return p.title }
func (p *TextViewPage) SetSize(w, h int) { p.vp.Width = w; p.vp.Height = footerHeight(h) }
func (p *TextViewPage) Init() tea.Cmd    { return nil }

func (p *TextViewPage) Update(msg tea.Msg) (Page, tea.Cmd) {
	var cmd tea.Cmd
	p.vp, cmd = p.vp.Update(msg)
	return p, cmd
}

func (p *TextViewPage) View() string {
	return p.vp.View() + "\n" + helpStyle.Render("↑/↓/pgup/pgdn: scroll")
}
