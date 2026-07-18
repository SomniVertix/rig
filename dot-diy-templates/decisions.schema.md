# Decisions catalog schema

The decisions catalog is the maintainer-authored input to the DIY mechanism: a
structured inventory of the key decisions made in building the source
product, written by whoever maintains that repo. It lives at
`.dot/diy/decisions.yaml` and is read by the DIY skill/agent to drive an
interactive walkthrough session — it is not the session's output (see
`build brief` for that).

## File

A single YAML file, `.dot/diy/decisions.yaml`, containing a top-level list of
entries. One entry = one decision.

## Entry fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Stable slug, unique within the catalog (e.g. `data-store`). Referenced by `dependsOn`. |
| `category` | string | yes | Free-text grouping (e.g. `data-store`, `auth`, `deployment`, `frontend-framework`). Not an enum — categories vary too much across product types to fix a list. |
| `currentChoice` | string | yes | What the source product actually uses today (e.g. `PostgreSQL`). |
| `whyChosen` | string (prose) | yes | Free-text rationale. Can be as long as needed — multi-line YAML block scalars (`|`) are expected here. |
| `alternatives` | list of `{ option, tradeoffs }` | yes | Real alternatives a builder could swap to. `tradeoffs` is prose, not a score. |
| `swapDifficulty` | enum: `trivial` \| `moderate` \| `major` | yes | Rough blast-radius signal for the walkthrough session to set expectations before the user commits to a swap. |
| `evidenceLinks` | list of strings | no | File paths (relative to repo root) or URLs backing `currentChoice`/`whyChosen` — an ADR, a commit, a doc, a code comment. Empty/omitted when a maintainer is asserting from memory rather than pointing at evidence. |
| `dependsOn` | list of strings | no | Other entries' `id`s that this decision assumes or is constrained by. Lets the session sequence questions and warn about downstream impact. |
| `extra` | map | no | Open-ended, maintainer-defined keys for anything domain-specific that doesn't fit the fixed fields above (e.g. a compliance note, a benchmark link, a migration-cost estimate). No fixed shape — this is the escape hatch that keeps the schema expressive across wildly different product types. |

## Example

See `decisions.example.yaml` in this directory.
