package ui

import "github.com/charmbracelet/lipgloss"

var (
	colorAccent = lipgloss.Color("#7aa2f7")
	colorMuted  = lipgloss.Color("240")
	colorGood   = lipgloss.Color("#9ece6a")
	colorWarn   = lipgloss.Color("#e0af68")
	colorBad    = lipgloss.Color("#f7768e")

	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("0")).
			Background(colorAccent).
			Padding(0, 1)

	breadcrumbStyle = lipgloss.NewStyle().Foreground(colorMuted)

	helpStyle = lipgloss.NewStyle().Foreground(colorMuted)

	statusOKStyle  = lipgloss.NewStyle().Foreground(colorGood)
	statusErrStyle = lipgloss.NewStyle().Foreground(colorBad).Bold(true)

	labelStyle = lipgloss.NewStyle().Foreground(colorMuted)
	valueStyle = lipgloss.NewStyle()

	badgeActive   = lipgloss.NewStyle().Foreground(colorGood)
	badgeMuted    = lipgloss.NewStyle().Foreground(colorMuted)
	badgeWarn     = lipgloss.NewStyle().Foreground(colorWarn)
	badgeBad      = lipgloss.NewStyle().Foreground(colorBad)
	sectionHeader = lipgloss.NewStyle().Bold(true).Foreground(colorAccent).MarginTop(1)

	promptBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(colorAccent).
			Padding(0, 1)
)

// statusBadge colors a lifecycle-ish status string consistently across
// expeditions, waypoints, specs, and handoffs.
func statusBadge(status string) string {
	switch status {
	case "active", "claimed", "in_review", "pending":
		return badgeWarn.Render(status)
	case "complete", "reached", "approved", "actioned", "read":
		return badgeActive.Render(status)
	case "abandoned", "bypassed", "dismissed":
		return badgeMuted.Render(status)
	case "not_started", "sighted", "marked":
		return badgeMuted.Render(status)
	default:
		return badgeBad.Render(status)
	}
}

func strOr(s *string, fallback string) string {
	if s == nil || *s == "" {
		return fallback
	}
	return *s
}
