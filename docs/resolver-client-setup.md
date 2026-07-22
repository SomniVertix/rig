# Launching `rig-resolver` from VS Code, Claude Code CLI, and Pi

`rig-resolver` (`packages/resolver/`) is one binary, launched over stdio, that
every MCP client points at instead of the Rig HTTP server directly. It walks
up from its own launch location to find the nearest `*.code-workspace` file,
reads that file's `rig.projectId`, and proxies the MCP session to the real
server with `X-Rig-Project-Id` attached as a header (see
`docs/workspace-binding-migration.md` for the full binding/trust-boundary
writeup).

This doc is the launch-config reference for the three clients Rig supports:
**VS Code**, **Claude Code CLI**, and **Pi**. All three configs:

- run the *same* `packages/resolver/dist/cli.js` build — there is no
  per-client resolver variant;
- pass `RIG_MCP_URL` (the server's fixed `/mcp` route) and
  `RIG_MCP_BEARER_TOKEN` (the shared daemon token) to the resolver process as
  **environment variables**, not as a client-level HTTP `url`/`Authorization`
  entry. The resolver is the only thing that ever speaks HTTP to the server;
  the client only ever speaks stdio to the resolver.
- must be launched with a working directory inside (or at) the workspace's
  folder tree — see [Launch location matters](#launch-location-matters-story-2-ac4)
  below.

## Prerequisites

Build the resolver once (from the repo root):

```bash
pnpm --filter @rig/resolver build
```

This produces `packages/resolver/dist/cli.js`, the file every config below
points at either directly (`node <path>/dist/cli.js`) or indirectly (a linked
`rig-resolver` bin on `PATH`).

`@rig/resolver` is not published to a registry yet, so `command: "rig-resolver"`
only resolves if you've linked the package's bin locally, e.g.:

```bash
pnpm --filter @rig/resolver exec pnpm link --global
# or: cd packages/resolver && npm link
```

Until you've done that, use the explicit `node <absolute-path-to>/packages/resolver/dist/cli.js`
form shown in each example — it works with no extra setup.

## Common environment variables

Every config below sets the same two variables on the resolver process:

| Variable | Value | Purpose |
|---|---|---|
| `RIG_MCP_URL` | e.g. `http://localhost:8787/mcp` | The server's fixed MCP route (no per-project path segment). |
| `RIG_MCP_BEARER_TOKEN` | e.g. `dev-local-token` | The shared daemon bearer token; forwarded by the resolver as `Authorization: Bearer <token>` on the proxied HTTP request. |

If either is unset or empty, `rig-resolver` exits non-zero immediately with a
stderr diagnostic naming the missing variable (`packages/resolver/src/cli.ts`)
— it never falls back to a default server or an unauthenticated request.

---

## VS Code

VS Code's MCP client reads a `servers` map from a workspace-scoped
`.vscode/mcp.json` (or the equivalent `mcp.servers` key under a
`"mcp"` object in user/workspace `settings.json`). Add a `stdio` entry
pointing at the built resolver:

`.vscode/mcp.json` (inside the repo's workspace folder tree):

```json
{
  "servers": {
    "rig": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/rig/packages/resolver/dist/cli.js"],
      "env": {
        "RIG_MCP_URL": "http://localhost:8787/mcp",
        "RIG_MCP_BEARER_TOKEN": "dev-local-token"
      }
    }
  }
}
```

If you've linked the `rig-resolver` bin (see [Prerequisites](#prerequisites)),
`command` can be simplified to `"rig-resolver"` with no `args`:

```json
{
  "servers": {
    "rig": {
      "type": "stdio",
      "command": "rig-resolver",
      "env": {
        "RIG_MCP_URL": "http://localhost:8787/mcp",
        "RIG_MCP_BEARER_TOKEN": "dev-local-token"
      }
    }
  }
}
```

There is no `url` or `headers` field in either form — VS Code never talks
HTTP to Rig directly.

## Claude Code CLI

Claude Code's `.mcp.json` (repo root, same file that today holds the
old HTTP entry) takes a `command`/`args`/`env` stdio server instead of a
`type: "http"` entry. This **replaces** the current entry:

```json
{
  "mcpServers": {
    "rig": {
      "type": "http",
      "url": "http://localhost:8787/mcp/development",
      "headers": {
        "Authorization": "Bearer dev-local-token"
      }
    }
  }
}
```

with:

```json
{
  "mcpServers": {
    "rig": {
      "command": "node",
      "args": ["/absolute/path/to/rig/packages/resolver/dist/cli.js"],
      "env": {
        "RIG_MCP_URL": "http://localhost:8787/mcp",
        "RIG_MCP_BEARER_TOKEN": "dev-local-token"
      }
    }
  }
}
```

or, with the `rig-resolver` bin linked and on `PATH`:

```json
{
  "mcpServers": {
    "rig": {
      "command": "rig-resolver",
      "env": {
        "RIG_MCP_URL": "http://localhost:8787/mcp",
        "RIG_MCP_BEARER_TOKEN": "dev-local-token"
      }
    }
  }
}
```

No `type`, `url`, or `headers` field remains — Claude Code launches the
resolver as a local stdio subprocess and never opens an HTTP connection to
Rig itself. (This is the same shape documented as the target end state in
`docs/workspace-binding-migration.md`'s migration steps; this doc is the
copy-pasteable reference for it.)

## Pi

Pi (`@earendil-works/pi-coding-agent`, wired in as `PiExecutor` — see
`FUNCTIONALITY.md`) launches MCP servers the same way as the other two
clients: as a local stdio subprocess with `command`/`args`/`env`. Configure
it the same shape, in whichever settings surface your Pi build reads MCP
server entries from (global `~/.pi/agent/settings.json` or project
`.pi/settings.json` — see Pi's own `settings.md`):

```json
{
  "mcpServers": {
    "rig": {
      "command": "node",
      "args": ["/absolute/path/to/rig/packages/resolver/dist/cli.js"],
      "env": {
        "RIG_MCP_URL": "http://localhost:8787/mcp",
        "RIG_MCP_BEARER_TOKEN": "dev-local-token"
      }
    }
  }
}
```

or, with `rig-resolver` linked and on `PATH`:

```json
{
  "mcpServers": {
    "rig": {
      "command": "rig-resolver",
      "env": {
        "RIG_MCP_URL": "http://localhost:8787/mcp",
        "RIG_MCP_BEARER_TOKEN": "dev-local-token"
      }
    }
  }
}
```

**Update (2026-07-21, verified by spike):** the bridging extension has
landed and was tested directly against this repo's live server. Pi's core
`settings.json` still has no built-in `mcpServers` key, but the
`nicobailon/pi-mcp-adapter` extension (npm: `pi-mcp-adapter`) supplies one —
it reads the same `command`/`args`/`env` stdio shape shown above from a
`mcp.json` file (precedence: global `~/.pi/agent/mcp.json`, then project
`.mcp.json` / `.pi/mcp.json`), registers a proxy tool with Pi, and — even
when Pi is driven headlessly through an ACP session via the community
`pi-acp` adapter (which does *not* itself forward MCP servers passed over
ACP) — genuinely calls through to the configured MCP server. Confirmed
end-to-end against `http://localhost:8787/mcp` with real, non-hallucinated
results for both a no-arg tool (`list_projects`) and a parameterized one
(`get_trail`).

**Remaining gap:** which project a Pi session's MCP calls resolve against is
controlled by this static config file, not by the ACP session's `cwd`. A
stale global config can silently win over a project-local one (observed
during the spike — see `diff-plans.md` §9 point 3 for details). Anything
that provisions Pi sessions per-project (e.g. the Rig Console backend) needs
to write/verify the correct `.pi/mcp.json` for that project before spawning,
rather than assuming session `cwd` alone binds it the way it does for the
resolver itself.

---

## Launch location matters (Story 2 AC4)

`rig-resolver` refuses to guess a project. On startup it walks up from its
own `cwd` looking for a `*.code-workspace` file
(`packages/resolver/src/discover.ts`'s `findNearestWorkspace`); if it reaches
the filesystem root without finding one, it exits non-zero with a stderr
diagnostic naming the starting directory and never contacts the server at
all.

Because every client above launches the resolver as a subprocess of the
editor/CLI session, the resolver's `cwd` is whatever directory that session
was opened in. Concretely:

- **VS Code**: open the folder (or one of the folders in a multi-root
  workspace) that contains, or is nested under, the `*.code-workspace` file.
  Opening a directory entirely outside that tree gives the resolver no
  workspace file to find.
- **Claude Code CLI**: run `claude` from inside (or at) the workspace's
  folder tree — same constraint, since Claude Code inherits its own working
  directory into the subprocess it spawns for `command`.
  `.mcp.json` living at the repo root is necessary but not sufficient; the
  CLI still has to be *launched* from within that tree for the resolver's
  upward walk to succeed.
- **Pi**: same rule — launch `pi` from inside the workspace's folder tree.

There is no repo-relative HTTP URL to fall back on anymore (the old
`.../mcp/<project-slug>` path is retired — see
`docs/workspace-binding-migration.md`). Project binding is entirely a
function of *where the resolver was launched from*, not of anything baked
into the client config file itself.
