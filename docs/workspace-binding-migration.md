# Workspace-based project binding: migration and trust boundary

This document has two parts: how to move an already-bound repo from the old
per-repo `.mcp.json` URL-slug binding to the new workspace-based binding
without losing its history, and what security guarantee (and what security
guarantee is *not* given) by the new `X-Rig-Project-Id` header the resolver
attaches to every request.

## Migration (Story 4.2)

### Before: URL-slug binding

Under the old model, a repo's `.mcp.json` pointed directly at the server with
the project slug baked into the URL path, e.g.:

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

Here `development` is the project slug — it's also the value of
`spec_pipeline.projects.slug` for that repo's project row, and everything
that row owns (its trails, specs, waypoint history) hangs off that slug.

### After: workspace-based binding

Under the new model, the server exposes a single fixed `/mcp` route (see
`packages/server/src/mcp/server.ts`) — there is no per-project path segment
anymore. Project binding instead comes from an `X-Rig-Project-Id` header,
which the `rig-resolver` binary (`packages/resolver/`) attaches by walking up
from the current working directory to find a `*.code-workspace` file and
reading its `rig.projectId` field (`packages/resolver/src/discover.ts`).
`.mcp.json` now points at the resolver instead of the server directly, e.g.:

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

### Preserving an existing project's slug and history

The workspace scanner (`packages/server/src/workspace/workspace-scanner.ts`)
provisions or matches a project for every `*.code-workspace` file it finds
under `RIG_WORKSPACES_DIR`:

- if the file's `rig.projectId` is present and a valid kebab-case slug, the
  scanner calls `ensureProject` with that exact id — this **matches** the
  existing `spec_pipeline.projects` row with that slug rather than creating a
  new one;
- if `rig.projectId` is absent, the scanner derives a slug from the
  filename, resolves it against any existing slug collisions, provisions a
  **brand-new** project row for it, and writes the winning slug back into the
  file.

So the only way to keep a repo's existing trail/spec history alive across
this cutover is to make sure its new `.code-workspace` file already carries
the *same* slug its old `.mcp.json` URL used — that's what makes the scanner
take the match path instead of the provision path.

Concrete steps, per repo currently bound via the old `.mcp.json` URL-slug
scheme:

1. **Find the existing project slug.** Open the repo's current `.mcp.json`
   and read the slug out of the URL path: `.../mcp/<projectSlug>`. In the
   example above, the slug is `development`.
2. **Create the repo's `.code-workspace` file** (if one doesn't already
   exist) inside the directory tree the server scans (`RIG_WORKSPACES_DIR`).
   A minimal multi-root workspace file pointing at the repo's folder is
   enough.
3. **Hand-set `rig.projectId` in that `.code-workspace` file to the slug
   from step 1**, before the scanner ever runs against it:

   ```json
   {
     "folders": [{ "path": "/absolute/path/to/the/repo" }],
     "rig": {
       "projectId": "development"
     }
   }
   ```

   This is the load-bearing step: it's what makes `scanOneFile` take the
   `ensureProject(pool, projectId)` match branch (Story 1 AC3) against the
   pre-existing `spec_pipeline.projects` row for `development`, instead of
   falling through to the injection branch that would slugify the filename
   and provision a brand-new (empty-history) project.
4. **Update the repo's `.mcp.json`** to the resolver-based shape shown above
   (`command: rig-resolver` with `RIG_MCP_URL` pointed at the fixed `/mcp`
   route and `RIG_MCP_BEARER_TOKEN` set), and remove the old
   `url: http://.../mcp/<slug>` entry entirely.
5. **Verify the bind.** Once the server has picked up the workspace file (one
   scan pass) and the IDE has relaunched the resolver, opening the project
   through Rig's tools should show the same trails/specs the repo had before
   the cutover — because the underlying `spec_pipeline.projects` row is the
   same row, just now reached by `rig.projectId` instead of a URL segment.

If step 3 is skipped, the scanner has no way to know the new
`.code-workspace` file corresponds to a pre-existing project: it will
provision a new project under a filename-derived slug, and the repo's prior
trail/spec history will still exist in the database (nothing is deleted) but
will no longer be reachable from that repo's binding.

### No dual-support window (Story 4 AC1)

This is a **hard cutover, not a gradual rollout**. There is no period where
both the old `/mcp/:projectSlug` URL-slug route and the new fixed `/mcp` +
`X-Rig-Project-Id` header route are served side by side. The moment the
server ships this change, the old per-project URL path stops resolving —
every repo still pointing `.mcp.json` at `http://.../mcp/<slug>` starts
failing to connect immediately, with no fallback and no grace period. The
steps above must be completed for a repo *before* (or in the same change as)
the server deploy that removes the old route, not after.

## Trust boundary (Story 6)

The `X-Rig-Project-Id` header is how a caller tells the server which
`spec_pipeline.projects` row to bind the MCP session to
(`packages/server/src/mcp/server.ts`, `dispatch`). Its exact trust basis is:

- **Authentication is the shared bearer token.** `isAuthorizedRequest`
  (`packages/server/src/mcp/auth.ts`) checks the `Authorization: Bearer
  <RIG_MCP_BEARER_TOKEN>` header before anything else runs, and that check
  passes or fails on possession of the single, static, per-daemon token — it
  is not project-scoped, so a valid token grants access to *every* project
  endpoint.
- **The project id's provenance is the local resolver.** In the intended
  deployment, `X-Rig-Project-Id` is set by `rig-resolver`
  (`packages/resolver/src/proxy.ts`), a stdio binary launched locally by the
  IDE, which derives the value by walking up the filesystem from the
  session's working directory to the nearest `*.code-workspace` file and
  reading its `rig.projectId` (`packages/resolver/src/discover.ts`). The
  server has no way to verify that provenance — it only sees the header
  value on the incoming HTTP request.
- **There is no independent per-caller authorization check.** Once a request
  passes the bearer-token check, the server accepts whatever
  `X-Rig-Project-Id` value the request carries (after only a syntactic
  kebab-slug format check) and binds the session to that project. Nothing
  verifies that the caller presenting the token is *entitled* to claim that
  specific project id — the header is trusted purely on (a) possession of
  the shared `RIG_MCP_BEARER_TOKEN` and (b) the assumption that it originated
  from a locally-launched resolver walking a real workspace tree, not on any
  server-side check of which project a given caller may claim.

This is safe as long as there is exactly one trusted holder of
`RIG_MCP_BEARER_TOKEN`. It stops being safe the moment a second person is
issued their own token: at that point either party's resolver could set
`X-Rig-Project-Id` to *any* project slug (their own or anyone else's) and the
server would honor it, because nothing today checks which projects a given
bearer-token holder is allowed to bind sessions to.

**Revisit trigger:** per-caller project authorization must be designed and
built before a second person is ever issued a `RIG_MCP_BEARER_TOKEN`.
