# binding service

Resolves an MCP client's working directory to a rig `workspaceId`, by matching
it against VS Code `*.code-workspace` files. Not part of the graph service —
no Neo4j dependency, no expedition/waypoint domain.

Ported from two pieces of v1:

- **The server-side scanner** (`packages/server/src/workspace/workspace-scanner.ts`):
  recursively walks a curated directory for `*.code-workspace` files and reads
  each one's `rig.workspaceId`.
- **The folder-claiming half of the client-side resolver**
  (`packages/resolver/src/discover.ts`'s `findWorkspacesClaiming`): matching a
  target directory against a workspace file's `folders` list.

Collapsed into one server-side `resolve` call (REST + MCP) instead of v1's
separate `rig-resolver` stdio binary that walks the filesystem itself — an
MCP client just sends its own cwd and asks the server to decide.

## What's different from v1

- No Postgres workspace provisioning. `rig.workspaceId` is read-only here: a file
  missing it is reported (logged), not auto-slugged and written back.
- No ancestor walk-up and no `.code-workspace.local` override — those are
  resolver-client concerns (a process on the developer's machine); this is a
  server-side lookup given an arbitrary directory string.
- No claim TTL / staleness — not applicable here.
- Ambiguous matches (more than one distinct `workspaceId` claiming the same
  directory) are always a hard error (409), never a silently-picked winner —
  same as v1, since which workspace a directory binds to is security-relevant.

## How it works

1. At boot, recursively scans `WORKSPACE_ROOT` for `*.code-workspace` files
   (skipping `node_modules`, `.git`, `.local` directories, matching v1).
2. Per file: parses `rig.workspaceId` (kebab-case required) and `folders`,
   resolving each folder path to an absolute path relative to the workspace
   file's own directory. Files with no `rig.workspaceId`, an invalid one, or
   that fail to parse are logged and otherwise ignored — never fatal to the
   pass.
3. Builds an in-memory registry mapping workspaceId -> claimed folder paths.
   This is a boot-time snapshot; there is no incremental rescan (change a
   `.code-workspace` file, restart the service to pick it up).
4. Serves `resolve(cwd)`: the workspace whose folders list contains `cwd`
   itself or an ancestor of it. Zero matches -> 404. More than one distinct
   `workspaceId` matching -> 409.

## Layout

```
scanner/         recursive *.code-workspace discovery + parsing (JWCC via hujson)
registry/         in-memory folder-claim matching
api/              REST POST /resolve
mcpserver/        MCP tool resolve_workspace_id, mounted onto cmd/rig's shared server
config/           env-var configuration (WORKSPACE_ROOT only; listen address is cmd/rig's concern)
```

## Running

This package no longer runs as its own process — it's a library mounted by
`cmd/rig` (see the top-level `README.md`) alongside `internal/graph`, sharing
one port and one MCP server. Its own env var is just its slice of `cmd/rig`'s
configuration: `WORKSPACE_ROOT` (required).

### REST

```
POST /resolve
{"cwd": "/abs/path/to/some/repo"}

200 {"workspaceId": "my-workspace"}
404 {"error": "registry: no workspace claims this directory"}
409 {"error": "registry: \"...\" is claimed by multiple workspaces: workspace-a, workspace-b"}
```

### MCP

Streamable HTTP at `/mcp`, exposing one tool: `resolve_workspace_id({cwd})` ->
`{workspaceId}` (or an error-content result on no-match/ambiguous/bad input —
reported as tool content, not a protocol-level error, so a calling model can
see and self-correct).

## Not yet done

- No rescan-on-demand endpoint or file-watcher — restart to pick up changes.
- No auth on `/resolve` or `/mcp`.
- Tests.
