# rig-herdr

A [Herdr](https://herdr.dev) plugin: a terminal-pane dashboard over rig's REST
API (the same one `web/src/api/client.ts` calls), so expeditions, waypoints,
specs, tasks docs, and handoffs are visible — and, for waypoints and spec
stages, actionable — without leaving Herdr for a browser tab.

Herdr plugins are plain argv-executable programs; there's no HTML rendering
inside a Herdr pane, so this is a [Bubble Tea](https://github.com/charmbracelet/bubbletea)
TUI rather than an embedded copy of the web console.

## What it shows

- **Expeditions** (Wayfinder trails): status, briefing, destination/outcome,
  and their waypoints — with claim / release / reach / bypass / unbypass
  actions on each waypoint.
- **Specs**: requirements / design / tasks / implementation stage statuses,
  denial reasons, per-component tasks docs, rendered stage markdown, and
  finalize / approve / deny actions on each stage.
- **Handoffs**: inbound/outbound/both, body, attachments, and (read-only)
  arbiter conversation transcripts.

It talks directly to a running `rig` service (`cmd/rig`) over HTTP — no MCP,
no browser required.

## Install

`link` requires an **absolute** path — the manifest is resolved by Herdr's
background server process, not your shell, so a path relative to your
terminal's cwd won't find it:

```sh
herdr plugin link "$(pwd)"     # run from this directory
go build -o rig-herdr .        # `link` skips [[build]]; `install` runs it for you
```

Or, once published to a repo tagged `herdr-plugin`:

```sh
herdr plugin install <owner>/<repo>[/v2/integrations/herdr-plugin]
```

Open the pane (confirmed working via the CLI — no manifest `[[actions]]`
entry is needed for a plain pane):

```sh
herdr plugin pane open --plugin rig.dashboard --entrypoint dashboard --placement tab
```

`--placement` defaults to `overlay` regardless of what the manifest says, so
pass it explicitly if you want the `tab` placement declared in
`herdr-plugin.toml`. Bind the same command to a keystroke via your own
`config.toml` keybindings (see [Config Reference](https://herdr.dev/docs/config-reference/))
if you don't want to type it each time.

## Configuration

**Herdr always opens plugin panes with the plugin's own install directory as
cwd** (confirmed live — `--cwd` is not implied from the pane you ran the
command from). That directory tells the plugin nothing about which rig
workspace you actually want, so by default the pane opens on the workspace
picker rather than guessing. To jump straight to one workspace, either:

```sh
# explicit workspace, no resolution needed
herdr plugin pane open --plugin rig.dashboard --entrypoint dashboard --placement tab \
  --env RIG_WORKSPACE_ID=haven

# or point cwd at the actual project, and let /resolve figure it out
herdr plugin pane open --plugin rig.dashboard --entrypoint dashboard --placement tab \
  --cwd /path/to/haven
```

| Variable            | Default                 | Meaning                                                              |
|---------------------|--------------------------|------------------------------------------------------------------------|
| `RIG_URL`           | `http://localhost:8789` | Base URL of a running `rig` service.                                  |
| `RIG_WORKSPACE_ID`  | *(unset)*                | Skip auto-resolve and open straight to this workspace's dashboard.    |

Running the built binary directly in a terminal (outside Herdr, for local
testing) auto-resolves from your actual shell cwd via `/resolve` — the
plugin-root special case above only kicks in when `HERDR_PLUGIN_ROOT` is set
and matches cwd exactly, which is how Herdr invokes it by default.

## Keybindings

Global: `↑`/`↓` (or `j`/`k`) navigate lists, `enter` opens the selected row,
`/` filters a list, `esc`/`q`/`←` go back a level (`q` quits at the top
level; `←` defers to a list's own previous-page paging when there's more
than one page), `ctrl+c` always quits.

Per-screen actions show in the footer, e.g. on a waypoint: `c` claim,
`l` release, `e` reach, `b` bypass, `u` unbypass — each free-text field
opens a small form (`tab`/`enter` between fields, `enter` on the last field
submits, `esc` cancels the form without leaving the page).

## Layout

```
main.go                    entrypoint: resolves base URL/workspace, runs the TUI
internal/rigclient/        typed HTTP client + wire types (mirrors web/src/api/*.ts)
internal/ui/                Bubble Tea pages: a navigation stack (see app.go)
```

## Known limitations

- Read + approve/deny/finalize only — there's no document-drafting UI (no
  editing requirements/design text, no writing task items). Use the web
  console or rig's MCP tools for that.
- `HERDR_PLUGIN_CONTEXT_JSON`'s exact schema isn't published; `main.go`
  probes a few plausible key names (`cwd`, `workingDirectory`,
  `workspacePath`, `path`) before falling back to the pane's own working
  directory, which is right in the common case (a pane opened inside a
  project directory).
- No link-handler wiring yet from clicked web-console URLs
  (`/:workspace/specs/:specId`, `/:workspace/trails/:trailId`) into a
  focused detail view — worth adding via `[[link_handlers]]` in
  `herdr-plugin.toml` if you click those links often from other panes.
