# rig

One process, one port, one MCP server. `cmd/rig` merges two previously
separate services — `internal/graph` (Neo4j-backed expeditions/waypoints) and
`internal/binding` (cwd -> workspaceId resolution) — under a single MCP
server named `rig`, exposing the full `mcp__rig__*` tool catalog from both
domains at one `/mcp` endpoint, alongside both REST surfaces.

## Layout

```
cmd/rig/                entrypoint: loads both domains' config, wires storage/scanning,
                         builds one mcp.Server, mounts both REST routers + /mcp
internal/graph/          expedition/waypoint domain (Neo4j), scoped by workspaceId — see internal/graph/README.md
internal/binding/        workspace-file scanning + cwd -> workspaceId resolve (Neo4j-free) — see internal/binding/README.md
openapi/graph.yaml       hand-maintained REST contract for internal/graph/api
docs/                    spec-pipeline design notes, feature decision logs, Neo4j query reference
```

`.meta/` (spec pipeline templates, agent/skill definitions) lives at the repo root, not here — it documents workflow across all three top-level components (`backend/`, `frontend/`, `herdr-plugin/`), not just this one.

## Running

```
export GRAPH_NEO4J_PASSWORD=...          # required; GRAPH_NEO4J_* otherwise defaults
export WORKSPACE_ROOT=/path/to/curated/workspaces/dir   # required
go run ./cmd/rig
```

Env vars:

- `RIG_HTTP_ADDR` (default `:8789`) — the single port serving REST + MCP.
- `GRAPH_NEO4J_URI`, `GRAPH_NEO4J_USERNAME`, `GRAPH_NEO4J_PASSWORD` (required),
  `GRAPH_NEO4J_DATABASE` — see `internal/graph/README.md`.
- `WORKSPACE_ROOT` (required) — see `internal/binding/README.md`.

### Docker Compose

`docker-compose.yml` runs the full platform locally: a bundled `neo4j:5-community`
container plus the `rig` service built from the `Dockerfile`. The build
context is the repo root (`context: ..`), not this directory — the image
build needs both `frontend/` and this directory, which are siblings.

```
cp .env .env.local        # optional, if you want to keep the checked-in defaults
edit .env: set RIG_WORKSPACES_HOST_DIR to a real host directory, and a real NEO4J_PASSWORD
docker compose up -d --build
```

rig then listens on `http://localhost:${RIG_HTTP_PORT:-8789}` (REST at `/`,
MCP at `/mcp`); Neo4j Browser is at `http://localhost:${NEO4J_HTTP_PORT:-7474}`.
See `.env` for the full list of variables and what each controls.

Note: `EnsureSchema`'s property type constraints require Neo4j Enterprise
Edition (Aura included) and are skipped with a warning against the bundled
Community container — the uniqueness constraints/index still apply either
way. See `internal/graph/store/neo4jstore/neo4jstore.go`.

### Endpoints

- `/mcp` — streamable HTTP MCP server named `rig`, exposing both domains'
  tools together (expedition/waypoint tools from `internal/graph/mcpserver`,
  `resolve_workspace_id` from `internal/binding/mcpserver`).
- `/resolve` — binding REST (`POST /resolve`).
- everything else — graph REST (`/expeditions`, `/waypoints`, ...), per
  `openapi/graph.yaml`.

## Why merged

Both services previously ran as independent binaries (`cmd/graph`,
`cmd/workspace`), each with its own MCP server (`rig-graph`, `rig-workspace`)
on its own port — so any MCP client wanting both tool sets had to register
two separate servers, even though tool names already assumed one flat
`mcp__rig__*` namespace. `cmd/rig` is now the only entrypoint; the domain
packages under `internal/` are libraries it mounts, not standalone services.
