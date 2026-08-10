// Command rig-herdr is a Herdr plugin pane: a terminal dashboard over the
// same REST API (see internal/rigclient) that the Rig web console's
// web/src/api/client.ts calls, so expeditions, waypoints, specs, tasks
// docs, and handoffs are visible — and, for waypoints/specs, actionable —
// from inside a Herdr pane instead of a browser tab.
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/somnivertix/rig/integrations/herdr-plugin/internal/rigclient"
	"github.com/somnivertix/rig/integrations/herdr-plugin/internal/ui"
)

func main() {
	baseURL := getEnv("RIG_URL", "http://localhost:8789")
	client := rigclient.New(baseURL)

	root := resolveRootPage(client)

	p := tea.NewProgram(ui.NewApp(client, root), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "rig-herdr:", err)
		os.Exit(1)
	}
}

// resolveRootPage tries to land directly on the current workspace's
// dashboard (POST /resolve against the pane's working directory, exactly
// like an MCP client would), falling back to the workspace picker when
// resolution is ambiguous, unmatched, or the server isn't reachable yet.
func resolveRootPage(client *rigclient.Client) ui.Page {
	if id := os.Getenv("RIG_WORKSPACE_ID"); id != "" {
		return ui.NewHomePage(client, id)
	}

	cwd := pluginCwd()
	if cwd == "" {
		return ui.NewWorkspacesPage(client)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	workspaceID, err := client.ResolveWorkspace(ctx, cwd)
	if err != nil || workspaceID == "" {
		return ui.NewWorkspacesPage(client)
	}
	return ui.NewHomePage(client, workspaceID)
}

// pluginCwd is the process's working directory, unless that's just the
// plugin's own install directory — confirmed live: `herdr plugin pane open`
// with no --cwd flag starts the pane in HERDR_PLUGIN_ROOT, which says
// nothing about which project workspace the user actually wants (it would
// resolve to whatever workspace this plugin happens to be linked inside,
// every time, regardless of what the user is working on). Resolving in
// that case would be silently wrong rather than merely unhelpful, so this
// only trusts cwd when it differs from HERDR_PLUGIN_ROOT — i.e. the pane
// was opened with an explicit `--cwd`, or the binary is being run directly
// from a project directory for local testing.
func pluginCwd() string {
	wd, err := os.Getwd()
	if err != nil {
		return ""
	}
	if root := os.Getenv("HERDR_PLUGIN_ROOT"); root != "" && sameDir(wd, root) {
		return ""
	}
	return wd
}

func sameDir(a, b string) bool {
	return filepath.Clean(a) == filepath.Clean(b)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
