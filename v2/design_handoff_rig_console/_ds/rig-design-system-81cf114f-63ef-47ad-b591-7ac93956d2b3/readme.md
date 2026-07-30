# Rig — Design System

> An engineered, developer-first design system for **Rig**, an AI workflow engine and spec-driven development pipeline.

## What Rig is

Rig is an **AI workflow engine + spec-driven development pipeline**. It runs as a long-lived server (an MCP tool server plus a REST/web dashboard) backed by Postgres, and orchestrates AI coding agents (Claude Code, or an alternate "Pi" backend) through a structured, human-gated feature-development lifecycle:

> **idea → requirements → design → tasks → implementation**

Two products live in the same repo and share this design language:

1. **The Workflow Engine** — a generic YAML-defined state machine (nodes of kind `agent` / `human` / `guard` / `script`, wired with `reads` / `writes` / `goto` transitions). A polling scheduler claims runnable runs and drives the interpreter node-by-node in the background.
2. **The Spec Pipeline** — the concrete product surface built on the engine. A "spec" (feature) is not a file — it's rows in Postgres, rendered to markdown on demand, moving through sequential, human-gated stages.

### The pipeline stages
| Stage | Produces | Agent | Model |
|---|---|---|---|
| 0 · Grilling | Q&A transcript (interview) | `grilling` skill | — |
| 1 · Requirements | User stories, EARS criteria, non-goals, glossary | `requirements-compiler` | Sonnet |
| 2 · Design | Architecture, components, data model, traceability | `design-drafter` | Opus |
| 3 · Tasks | Ordered task lists, parallel batches, DoD | `tasks-drafter` | Sonnet |
| 4 · Implementation | Code changes, checked off task-by-task | `spec-implementation-orchestrator` | Haiku |

Each stage ends with `finalize_stage` (→ `in_review`). **Approve/deny is human-only** — the human reviews rendered markdown in the web UI and flips status. Denials return a short freeform reason for the drafting agent to incorporate on redraft.

Supporting concepts the UI must express: **grilling sessions** (persisted interview transcripts), **guardrails & audit** (every write carries an `actor` validated against a `known_actors` table; every mutation writes an `audit_log` row), and **dual executors** (`ClaudeExecutor` vs `PiExecutor`).

## Sources provided
- **Product/functionality description** (pasted brief) — the only source supplied.
- **No codebase, Figma file, logo, brand fonts, or existing design assets were attached.** This system is therefore an original, from-scratch brand built to fit the product's engineering character. If real brand assets exist, supply them and this system will be re-derived from them.

---

## CONTENT FUNDAMENTALS

**Voice.** Precise, technical, quietly confident — an engineer's tool, not a marketing site. Rig never overpromises; it states what the machine does. The name implies persistence and forward motion (pipelines advance, guards hold, the scheduler never sleeps), so copy favors active, mechanical verbs: *compile, finalize, claim, dispatch, gate, redraft, attribute.*

**Person.** Address the operator as **you** ("You approve each stage"). Refer to the system and its agents in the third person ("The drafter incorporates the denial reason"). Avoid "we" — there is no marketing "we."

**Casing.**
- UI labels & buttons: **Sentence case** ("Finalize stage", "Approve", "Attach session").
- Section eyebrows / metadata labels / table headers: **UPPERCASE mono**, tracked (`STAGE`, `ACTOR`, `LAST RUN`).
- Stage & status names in prose: lowercase-with-underscore when quoting the machine value (`in_review`, `known_actors`), Title Case when naming the concept ("Requirements stage").

**Terminology is exact.** Use the product's real nouns: *spec, stage, grilling session, actor, guard, node, run, executor, audit log, Definition of Done, EARS criteria.* Never soften them into generic words ("item", "step", "user"). A spec is a spec.

**Numbers & data.** Monospace everything countable — IDs, timestamps, run counts, model names, durations. Timestamps are relative in dense views ("4m ago") and absolute on hover.

**Tone examples.**
- Empty state: `No specs yet. Start one with the grilling skill, or create it directly.`
- Gate prompt: `Stage 2 · Design is in review. Approve to advance, or deny with a reason.`
- Denial hint: `Denied — "Data model missing traceability to REQ-014." Redrafting…`
- Guard/audit note: `Every write is attributed. actor must be a registered known_actor.`

**Emoji:** none. This is an infrastructure tool. Status is carried by color + shape + glyph icons, never emoji. Unicode is used only for structural glyphs where an icon is overkill (`·` separators, `→` transitions, `↳` nesting).

---

## VISUAL FOUNDATIONS

**Overall vibe.** Engineered, dense, high-signal — the feel of a well-built CLI or database console rendered as a comfortable GUI. Structure is visible: hairline borders, monospace metadata, explicit state. Energy comes from a single signal-green accent against cool graphite; nothing decorative, nothing rounded-and-soft. Think Postgres tooling / Linear / a serious build dashboard.

**Color.**
- **Neutrals are cool graphite ("ink").** Light theme sits on `--paper` (#F7F8FA) with white surfaces; the first-class **dark "ink" theme** sits on near-black `--ink-950` (#0B0D10). Both ship; dark is core to the brand, not an afterthought.
- **Brand accent is signal green** `--green-400/--green-600` (#E8850C) — forge/signal energy, used sparingly for primary actions, active pipeline state, focus rings, and the wordmark dot. It is *not* sprayed across surfaces.
- **Status is semantic and consistent:** slate = draft, amber = in_review, emerald = approved, rose = denied, sky = running. These map 1:1 to workflow states and never drift.
- **Imagery:** effectively none. The product is data and text; there are no photographic heroes. Where visual texture is wanted, use a faint dotted/grid backdrop (see below), never gradients-as-decoration.

**Backgrounds.** Flat fills, no decorative gradients. Optional **fine dot-grid or 1px ruled grid** at very low contrast on empty canvases and pipeline diagrams (evokes graph paper / a schematic). Full-bleed color is reserved for the dark app chrome. No hand-drawn illustration, no photography, no mesh gradients.

**Typography.**
- **Display:** Space Grotesk (geometric, technical) for headings and big numbers.
- **UI / body:** IBM Plex Sans — the workhorse, engineered and legible at 13–15px.
- **Mono:** IBM Plex Mono for code, IDs, labels, eyebrows, table metadata, status values. Mono is a load-bearing part of the identity, not just for code blocks.
- Base UI size **14px**; dense tables 13px. Tight tracking on display (`-0.02em`), wide tracking on mono eyebrows (`0.08em`, uppercase).
- *(All three are Google Fonts stand-ins — no brand fonts were provided. Flagged; replace if real fonts exist.)*

**Spacing & layout.** 4px base grid. Dense but breathing — 12–16px padding inside controls and cards, 24–32px between sections. App shell = fixed 248px left sidebar + 56px topbar + fluid content capped ~1120px. Layout is grid-driven with `gap`; alignment is strict and left-anchored (metadata columns line up).

**Corner radii.** Tight and consistent: 6px is the default control radius, 8px for cards, 4px for chips/inputs-within-inputs, `--radius-full` only for pills/status badges and avatars. Nothing is heavily rounded — sharpness reads as precision.

**Borders.** Hairline (1px) `--border-default` is the primary structural device — this system leans on borders more than shadows. `--border-subtle` for internal dividers, `--border-strong` on hover/emphasis. Focus uses a 1.5px green border feel via the focus ring.

**Shadows.** Cool, low, restrained. Cards on the light theme mostly use borders, not shadows; shadows (`--shadow-sm/md`) appear on lifted surfaces — dropdowns, dialogs, popovers, toasts. No colored or glowing shadows except the green **focus ring** (`0 0 0 3px green@25%`).

**Cards.** White (light) / `--ink-900` (dark) surface, 1px `--border-default`, 8px radius, `--shadow-sm` at most. Content-first: an optional mono eyebrow, a title, body, and a hairline-separated footer/metadata row. No colored left-border accent cards.

**Hover / press.**
- Hover: subtle background wash (`--bg-hover`, ~3–7% ink/white overlay) and/or border darkening to `--border-strong`. Links darken. No scale-up on hover.
- Press/active: slightly deeper wash (`--bg-active`) and a 1px translate-down feel on buttons (no bouncy scaling). Primary buttons step down the green ramp (dark: `400 → 300 → 200`; light: `600 → 700 → 800`).
- Selected rows/tabs: green left indicator or green text + soft `--accent-soft` background.

**Motion.** Brisk and mechanical, never playful. 90–150ms transitions on `--ease-standard`; dialogs/popovers use `--ease-out` at 240ms with a small fade + 4px rise. No bounce, no spring, no attention-seeking loops. The one ambient motion allowed: a subtle pulse/indeterminate bar on **running** states (the scheduler working).

**Transparency & blur.** Sparingly — a backdrop scrim behind dialogs (ink @ ~50%, optional 2px blur), and translucent overlays for hover states. Chrome is opaque. No frosted-glass everywhere.

**Protection & separators.** Elevated menus/toasts separate from content via border + `--shadow-md`, not gradients. Sticky headers get a hairline bottom border, not a fade.

---

## ICONOGRAPHY

- **No icon assets were provided.** Rig uses **[Lucide](https://lucide.dev)** (loaded from CDN) as the icon system — a 1.5–2px stroke, rounded-join, outline set that matches the engineered-but-humane character and pairs cleanly with IBM Plex. *(Substitution flagged: swap for the real icon set if one exists.)*
- **Style rules:** outline only (no filled/duotone icons), 16px in dense UI / 18–20px in nav, `stroke-width: 1.75`, `currentColor` so icons inherit text color. Icons are functional, not decorative — every icon labels an action or a data type.
- **Domain glyph mapping** (Lucide names): spec = `file-text`, stage = `git-branch`, grilling = `messages-square`, requirements = `list-checks`, design = `drafting-compass`, tasks = `list-todo`, implementation = `code`, run = `play`, guard = `shield-check`, actor = `user-round-cog`, audit log = `scroll-text`, approve = `check`, deny = `x`, executor = `cpu`, scheduler = `timer`, workflow node = `box`, transition = `arrow-right`.
- **Status is conveyed by color + a small glyph**, never emoji: draft = `circle-dashed`, in_review = `clock`, approved = `check-circle`, denied = `x-circle`, running = `loader` (animated).
- **Unicode structural glyphs** allowed inline: `·` (separator), `→` (transition), `↳` (nesting), `#` (id prefix). **No emoji anywhere.**
- **Brand mark:** none was provided. The wordmark is set in Space Grotesk with a single green square/dot — see `assets/wordmark.html`. Do not invent a logo.

---

## Index / manifest

**Root**
- `styles.css` — global entry (import list only). Consumers link this.
- `readme.md` — this file.
- `SKILL.md` — Agent-Skills-compatible entry for downloading into Claude Code.
- `thumbnail.html` — project tile.

**Tokens** (`tokens/`) — all `@import`ed by `styles.css`
- `fonts.css` · `colors.css` · `typography.css` · `primitives.css` (spacing/radius/shadow/motion/layout) · `base.css` (element defaults).

**Assets** (`assets/`)
- `wordmark.html` (type-set logo, no real mark provided), `icons.md` (Lucide usage). Dot-grid backdrop is CSS, not an image.

**Foundation cards** — Design System tab, groups: `Colors`, `Type`, `Spacing`, `Effects`, `Brand`.

**Components** (`components/<group>/`) — see each `*.prompt.md`.
- `core/` — Button, IconButton, Card, Badge, Tag
- `forms/` — Input, Textarea, Select, Checkbox, Radio, Switch
- `feedback/` — Dialog, Toast, Tooltip
- `navigation/` — Tabs
- `workflow/` — StatusBadge, StageStepper (**intentional additions**, see below)

**Intentional additions** (no source component inventory existed):
- `Icon` — thin Lucide wrapper so consumers get consistent stroke/size.
- `StatusBadge` — the five workflow states are core to the product; a dedicated badge keeps them consistent.
- `StageStepper` — the idea→requirements→design→tasks→implementation progression appears on nearly every screen.

**UI kit** (`ui_kits/dashboard/`) — the Rig web dashboard: spec pipeline list, spec detail + review gate, workflow runs, audit log.

---

## Caveats
- **Original brand.** Colors, type, and mark are invented to fit the product — not extracted from real Rig assets (none were provided).
- **Fonts** (Space Grotesk / IBM Plex Sans / IBM Plex Mono) and **icons** (Lucide) are chosen stand-ins loaded from CDN. Replace with real brand fonts/icons if they exist.
- No logo was created; the wordmark is plain type per guidance.
