# Fixtures

Extracted from `design_handoff_rig_console/Rig Console.html`'s inline
`window.RL_DATA` sample data (2026-07-28). The HTML ships as a bundled,
gzip-compressed blob rather than plain source — extraction was: locate the
blob containing recognizable fixture strings ("Structured logging
pipeline"), gzip-decompress it, and pull the `window.RL_DATA = {...}`
object literal out by brace-matching. See git history for the one-off
extraction script if re-syncing against an updated prototype.

`RL_DATA` covers `projects`, `specs`, `stages`, `runs` (+`runDetails`),
`audit`, `actors`, `trails` (+`trailDetails`). Only the sections with no
live V2 backend are kept here as fixtures — `specs`, `trails`, and
`projects` are **not** re-exported as fixtures since Stage A build-out wires
those to the real API instead (see GAPS.md §3): `data/workspaceSummaries/live.ts`
aggregates real `/specs` and `/expeditions` results per workspace, and the
workspace *list* itself now comes from `GET /workspaces`
(`data/workspaces/live.ts`) — real scanned `.code-workspace` files via
`internal/binding/registry`, no more hand-maintained stopgap. `stages`
(the per-stage agent/model assignment) *is* kept, as
`src/config/specStages.ts` — that's static UI config, not mocked API data,
and applies to the live Specs screens too since `SpecDTO` has no agent/model
fields.

No sample data exists in `RL_DATA` for sessions/grilling transcripts (V2
has no session storage at all yet — see GAPS.md §3) or the session
launcher's field options; those fixtures are hand-authored directly in
task 10 alongside the screens that consume them, shaped to the design
handoff's described fields rather than lifted from source.
