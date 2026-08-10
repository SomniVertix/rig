# Handoff: Rig Console (web dashboard)

## Overview
The Rig Console is the human-facing web dashboard for Rig — an AI workflow engine + spec-driven development pipeline (idea → requirements → design → tasks → implementation). The console is where the human operator reviews and approves/denies stage drafts, runs interactive grilling (discovery) sessions in the browser, tracks Wayfinder trails and waypoints, watches workflow runs, and inspects the audit log. All writes are actor-attributed against `known_actors`. **An actor is an agent (or the console/scheduler itself), never a human user** — the operator is not an actor; the console writes under its own fixed registered actor (`web-ui`).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy. **There is currently no UI code in the repo at all — this is a from-scratch build.** Choose an appropriate stack and recreate these designs there. Recommended: **React + Vite + TypeScript**, TanStack Query for server state (invalidate-on-SSE-ping fits its model exactly), a small client-side router (project scope + page + detail ids in the URL), and plain CSS with the design-system token files imported as-is. No CSS framework needed — the token + component CSS in `_ds/` is the styling layer; port its component classes into your component library.

The backend already exists: Zod-typed Fastify routes under `packages/server/src/web/routes/`, REST BFF + SSE (`/api/events`, "ping, then refetch" — events carry no payloads). Serve the SPA from the same daemon (port 8788).

- `Rig Console.html` — the full console prototype (all screens, one file). **Fully self-contained — double-click to open in any browser**; all CSS, fonts, and scripts are inlined, so it needs no server and no sibling files. Sample data lives inline in the file; use it as fixture data while building.
- `screenshots/` — one capture per screen (numbered in the order of the Screens section below). Use them as the visual ground truth alongside the live prototype.
- `rig-api-requirements.md` — the agreed backend contract this UI is built against (routes, payload shapes, SSE events, build order). **The backend team has implemented these; treat it as the API reference.**
- `_ds/rig-design-system-…/` — the **Rig Design System**: tokens (`fonts.css`, `colors.css`, `typography.css`, `primitives.css`, `base.css`), `components/components.css`, `styles.css` (imports all tokens), and `readme.md` (the full brand guide — read it first). Import the CSS verbatim; rebuild the components as your base library: **Button** (variants: primary/secondary/ghost/success/danger, optional icon, `block`), **IconButton** (28–32px square), **Badge** (tones: accent/neutral), **StatusBadge** (draft/in_review/approved/denied/running — color + glyph, never emoji), **StageStepper** (numbered pipeline steps, supports custom stage lists), **Tabs**, **Dialog** (scrim `rgba(11,13,16,.55)`, 240ms fade+rise), **Toast**, **Select**, **Textarea**, **Icon** (Lucide wrapper, stroke 1.75).

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and interaction states are final. Recreate pixel-perfectly, but express every value through the design-system tokens (`var(--*)`) rather than hard-coded literals.

## Routes / pages to build
Every page below must exist; suggested URL scheme (project scope in the path):
- `/projects` — Projects overview (§1)
- `/:project/specs` — Specifications list (§2)
- `/:project/specs/:specId` — Spec detail + review gate (§3)
- `/:project/trails` — Wayfinder board/list (§4)
- `/:project/trails/:trailId` — Trail detail (§5)
- `/:project/sessions/:sessionId` — Grilling transcript, read-only (§6)
- `/:project/live` — Live session workspace, supports split view (§7)
- `/:project/audit` — Audit log (§8)
- `/:project/runs` — Workflow runs (§9)
Plus two dialogs reachable from anywhere: Session launcher (§10) and Abort run (§9).

## App shell (all screens)
- CSS grid: `grid-template-columns: 248px 1fr` (sidebar collapsible to ~64px, animated 150ms), `grid-template-rows: 56px 1fr`. `height: 100vh`, `overflow: hidden`; only `<main>` scrolls (`padding: 28px 32px`, content capped `max-width: 1120px`; trail detail 1180px, live sessions 1360px).
- Theme: `data-theme` attribute toggles dark/light; dark is first-class. Base font `var(--font-sans)` (IBM Plex Sans) 14px.
- **Sidebar** (`bg-surface`, right hairline border): wordmark row (10px green square, "rig" in Space Grotesk 18/700, mono "v0.4" faint) → project picker button (mono 12.5px project slug + count badge + `chevrons-up-down` icon; opens a 330px dropdown listing projects with StatusBadges, "Open full projects view →" footer) → nav groups (mono 10px uppercase group labels; items = Lucide icon 17px + 13.5px label + mono count; selected item gets accent bg/edge) → footer: daemon `:8788` + postgres status (mono 11px, green dot), collapse row (⌘B).
- **Topbar**: page title (Space Grotesk 15/600) left; right side: primary "New session" button, SSE status chip (7px dot, pulsing when live, mono 11.5px label), theme IconButton.
- **Open-session tabs** row appears under the topbar when sessions are live: bordered chips with pulsing accent dot, mono session id, kind label, split (`columns-2`) and discard (`x`) micro-icons.
- **Toasts**: fixed bottom-right, 340px column, design-system Toast. SSE events (`spec_changed`, `trail_changed`, `session_changed`, `run_changed`) surface as toasts and trigger refetch.

## Screens / Views

### 1. Projects overview (`GET /api/projects`)
Purpose: pick a project; triage by attention.
- Two sections: mono-uppercase labels "Needs your review first" and "Quiet".
- Cards in `repeat(auto-fill, minmax(330px,1fr))` grid, gap 14px. Card: `bg-surface`, 1px border, radius 8, padding 16, hover border-strong. Quiet cards at opacity .85.
- Card contents: mono project slug 13/600 + StatusBadge (e.g. "2 gates" amber / "quiet" slate) → 5px segmented stage-distribution bar (flex spans, 2px gaps, status colors) → mono counts line → attention line in `--status-review-fg` (attention cards only) → hairline-topped footer "last write {time · actor}".
- Sort: projects with waiting gates first, then live drafting activity. Clicking a card scopes Specs/Trails/Audit to it.

### 2. Specifications list (`GET /api/specs?project=`)
- Header: H1 "Specifications" (Space Grotesk 22/600) + faint mono route annotation.
- Search input (260px, icon + placeholder "Filter specs…  /"; `/` focuses) + stage-filter pills (mono 10.5 uppercase, pill radius, selected = accent border/bg).
- Table as CSS grid rows, `min-width: 720px`, columns `minmax(140px,1fr) minmax(78px,110px) repeat(3,minmax(78px,108px)) minmax(56px,74px)`: Feature / Current stage / Requirements / Design / Tasks / Updated. Stage cells are StatusBadges (slate not_started · amber in_review · emerald approved · rose denied). Rows hover-wash, click → spec detail.
- Empty state: dashed border card on a faint dot-grid (`radial-gradient(var(--border-subtle) 1px, transparent 1px)` 18px), `file-text` icon, copy "No specs yet. Start one with the grilling skill, or create it directly."
- Footer note: "Approve/deny is human-only — agents cannot self-approve a draft."

### 3. Spec detail + review gate
- Breadcrumb "← specs", H1 name + StatusBadge, mono `SPEC · #id`, StageStepper (620px) showing pipeline position.
- Two-column grid `minmax(0,1fr) minmax(240px,300px)`, gap 20.
- Left: Tabs (requirements / design / tasks). If the stage has components, a "Component" pill row (mono, selected = accent). Document card (padding 24/28): sections with Space Grotesk 15.5/600 titles, 13.5px body/bullets, task rows `[x]`/`[ ]` mono marks with hairline separators; footer annotation "rendered on demand · GET /api/specs/:id/stages/:stage/document?component=". No-document state: centered "no document / Not started. {agent} drafts this stage."
- Right rail:
  - **Human review gate card**: in_review → gate prompt + full-width success "Approve" and danger "Deny & redraft" buttons; deny opens inline Textarea (reason) + "Confirm deny"/"Cancel". Approved → green check line "Stage approved · web-ui". Denied → rose reason line `Denied — "<reason>"`, indeterminate accent progress bar, "{agent} redrafting…". (Deny reason now persists — see §4 of the API doc.)
  - **Stage / Agent / Model** key-value card (mono; model as accent Badge). Agents: requirements-compiler·sonnet, design-drafter·opus, tasks-drafter·sonnet.
  - **Origin trail card** when `originTrailId` set: link "{trail} →" + note.

### 4. Wayfinder (trails) — board + list views
- Header: H1 "Wayfinder", info button (22px circle, `info` icon) opening a "Trail statuses" Dialog (560px) explaining grilling/active/settled/chartered + waypoint states; Board/List segmented toggle (mono 11px, kanban/list icons); ↑↓/↵ kbd hints in list view; primary "New session".
- **In progress** section: live-session cards (mono id in `--text-brand`, running StatusBadge, seed text, "{n}/{m} answered · resume →").
- **Board view**: 4 equal columns (grilling / active / settled / chartered), tinted column bg per status, mono column labels + counts. Cards: title 12.5/600 + StatusBadge, 2-line-clamped subtitle, mono footer. Drag between columns supported (dragOver highlights column). Empty column: dashed "empty" placeholder.
- **List view**: master-detail `330px minmax(0,1fr)`. Left: search + status filter pills + trail rows (name + badge, 2-line trailhead, waypoint state dots, mono meta); selected row edge-highlighted; double-click opens. Right: detail card — name + badge, `TRAIL · id`, "Open trail →" secondary button, trailhead + "↳ destination", three waypoint columns (Sighted / Claimed·marked / Reached·bypassed) with colored dots, footer links to grilling session and outcome spec.
- **Scratch sessions** list below: mono id, seed, "{executor} · {n} turns · {when} · transcript persisted".
- Empty state mirrors specs (icon `map`).

### 5. Trail detail (`GET /api/trails/:trailId`)
- Breadcrumb "← wayfinder", H1 + badge, `TRAIL · id`, StageStepper (custom stages: grilling → active → settled → chartered).
- Trailhead card: mono label, prompt text, "↳ destination", linked grilling session row.
- Tabs: **Graph** / List + note "{x}/{y} reached · claims lapse after RIG_CLAIM_TTL (24h)".
- **Graph view**: dot-grid canvas, absolutely-positioned 224px waypoint nodes (state dot + mono uppercase state + id, 12.5/500 title), SVG bezier edges between dependencies (dashed for pending, colored by state). Click selects.
- **List view**: rows with state dot, mono id, title + mono dependency note, right-aligned mono state.
- Right rail: waypoint inspector (empty state "Select a waypoint…" with `mouse-pointer-click` icon; selected → title, Decision text, amber claim box "claimed by {actor} · {when} / Stuck? Recovers via release_waypoint or lapses after 24h", dependency note) + Outcome card linking the chartered spec.

### 6. Grilling session transcript (read-only)
- Breadcrumb "← trail {id}", mono `GRILLING · {id}` + H1 "Session transcript" + completed badge.
- Left: transcript card — per turn: mono "Q{n} · grilling" label, question 14/600, mono accent "A · you" label, answer 13.5/1.6. Footer "session finalized → trailhead prompt".
- Right (sticky): Session/Started/Turns/Stage key-value card + "Fed into" card linking trail and outcome spec.

### 7. Live session (interactive grilling)
- Supports split view: two panes side by side (`liveCols` grid), each pane closable.
- Pane header: mono `SESSION · {id}` accent, type label, executor Badge (claude=accent, pi=neutral), running StatusBadge. Meta line: `actor … · project … · run-id`. "Waypoints sighted" chips appear as the agent sights them.
- Transcript card: answered turns (same as §6) + pending block on `bg-inset`: current question, Textarea ("Answer in your own words — one question at a time, to a usable answer."), primary "Submit answer" (disabled when empty) + "{n}/{m} answered · persists to the transcript".
- **Agent turn in progress** state (after every submit): mono running-colored "agent turn in progress", faint "ACP session/prompt · the agent may call MCP tools before responding", 2px indeterminate bar (animation `rl-run` 1.6s linear).
- Discovery flow end: "Finalize → propose trailhead" primary button ("sends a fixed instruction as the next turn — same as typing it"). The agent then proposes trailhead/destination **as ordinary transcript text**; the human approves conversationally; the agent calls `create_trail` and the UI refetches on the `trail_changed` ping (toast). There is **no chart-trail form** in the UI.
- Scratch flow end: "End session · persist transcript" ("scratch session · no trail charted").

### 8. Audit log (`GET /api/audit?project=&limit=&before=`)
- Grid table `70px minmax(130px,170px) minmax(110px,140px) minmax(160px,1fr)`: Time / Actor / Action / Target, all mono. Actors are agents and system components (`wayfinder-agent`, `requirements-compiler`, `scheduler`, `web-ui`) — console-originated writes (`web-ui`) colored accent, agent/scheduler writes muted. Header note: "every mutation · one row · same transaction".

### 9. Workflow runs (`GET /api/runs` · `POST /api/runs/:runId/abort`)
- Grid table `60px minmax(96px,130px) minmax(100px,1fr) minmax(58px,78px) minmax(84px,100px) minmax(52px,66px) 32px`: Run / Workflow / Node / Executor / Status / Started / (abort). Run id mono accent; running rows show a 2px indeterminate bar under the node name; executor as Badge (claude accent / pi neutral); status StatusBadge.
- Abort: 28×28 IconButton (`square` icon, tooltip "Abort run") on abortable rows only → **Abort run Dialog** (440px): explanation copy, a fixed read-only Actor row (`web-ui` — the console's own registered actor; no picker, humans are not actors; audit row written in-transaction), Cancel / primary "Abort run".

### 10. Session launcher dialog (540px)
Opened by "New session". Fields, top to bottom (mono uppercase 10.5px labels, 14px gaps):
1. **Session type** — 2 selectable cards: Discovery ("wayfinder skill · charts a trail") / General ("scratch agent session · transcript only").
2. **Executor** — 2 selectable cards: claude ("sonnet · ACP subprocess · default") / pi ("alt backend · ACP subprocess"). Both enabled.
3. **Model** — pill picker, options swap per executor: claude → opus / sonnet / haiku (default sonnet, hint "per-stage overrides still apply from the workflow YAML"); pi → pi-large / pi-fast (default pi-large, hint "alt backend · model names map in the executor config"). Switching executor resets to that executor's default.
4. **Project** — pill picker of project slugs.
5. **Seed prompt** — Textarea, placeholder "The loose idea — what should exist that does not?".
6. **Agent** — Select of agent actors (`wayfinder-agent` default, `requirements-compiler`, `design-drafter`, `tasks-drafter`) + note "The agent assigned to run this session — its writes are attributed to it as a registered known_actor."
Footer: Cancel / primary "Start session" → `POST /api/sessions`.
Selected card/pill style: accent border + `--accent-soft` bg; unselected: default border, transparent.

## Interactions & Behavior
- Navigation is client-side page switching within the shell; project selection scopes Specs/Trails/Audit/Runs.
- SSE contract: events are pings only (`spec_changed`, `trail_changed`, `waypoint_changed`, `session_changed`, `run_changed`, `audit_changed` optional) — on receipt, invalidate/refetch the relevant queries and show a toast where user-visible (e.g. "Trail charted").
- Keyboard: `/` focuses list filters; ↑/↓ select + ↵ open in Wayfinder list; ⌘B collapses sidebar.
- Hover: background wash `--bg-hover` on rows/nav, border → `--border-strong` on cards/pills. No scale effects.
- Motion: 90–150ms standard transitions; dialogs fade+4px rise ~240ms; the only loops are the running-state pulse (`rl-live` 2s opacity) and indeterminate bar (`rl-run` 1.4–1.6s translateX). Mechanical, no bounce.
- Loading/streaming: skeleton via placeholder counts is acceptable; long agent turns always show the "agent turn in progress" block — never a frozen composer.
- Validation: Submit answer disabled on empty draft; abort writes are attributed to the console's fixed `web-ui` actor.

## State Management
- Global: current project, theme, sidebar collapsed, SSE connection status, open sessions (id, kind, executor, split state), toast queue.
- Per page: spec/trail filters + search queries, selected trail + selected waypoint, board vs list view, graph vs list view, active stage/component tabs.
- Dialogs: launcher fields (type, executor, model, project, seed, assigned agent), deny reason, abort target run (attribution fixed to `web-ui`).
- Server state via the REST routes in `rig-api-requirements.md`; refetch on SSE pings (no payloads over SSE).

## Design Tokens
All values come from the Rig Design System CSS variables — port these files, don't restate hexes:
- **Fonts**: `--font-display` Space Grotesk (headings, tracking −0.02em), `--font-sans` IBM Plex Sans (body, 14px base, 13px dense), `--font-mono` IBM Plex Mono (ids, labels, eyebrows — uppercase eyebrows at 10–10.5px, letter-spacing .08em).
- **Color roles used**: `--bg-app`, `--bg-surface`, `--bg-inset`, `--bg-hover`; `--border-default/subtle/strong`; `--text-strong/body/muted/faint/brand`; `--accent` + `--accent-soft`; status pairs `--status-{review,approved,denied,running}-{fg,bg}`. Status mapping: slate draft/not_started · amber in_review/claimed · emerald approved/reached · rose denied · sky/green running.
- **Radii**: 6px controls/cards-in-cards, 8px cards/dialogs, 99px pills/badges/dots, 4px kbd.
- **Spacing**: 4px grid; 12–16px control padding, 14px card grid gaps, 20px column gaps, 24–32px section spacing.
- **Shadows**: borders over shadows; `--shadow-md` on dropdowns/dialogs; scrim `rgba(11,13,16,.55)`.
- **Icons**: Lucide, outline, `stroke-width` 1.75, 13–17px in UI, `currentColor`. No emoji anywhere.

## Assets
No images. Lucide icons from CDN (swap to the codebase's icon pipeline). Fonts are Google Fonts stand-ins (Space Grotesk, IBM Plex Sans/Mono) — replace if real brand fonts exist. Wordmark is plain type + green square (no logo asset).

## Files
- `Rig Console.dc.html` + `support.js` — full prototype; open the HTML directly in a browser. All screens reachable via the sidebar; sample data inline at the bottom of the file.
- `screenshots/01–12` — specs-list, spec-detail-review-gate, wayfinder-list, wayfinder-board, trail-detail-graph, session-transcript, live-session, runs, abort-dialog, audit-log, projects-overview, session-launcher.
- `rig-api-requirements.md` — backend API contract (implemented).
- `_ds/rig-design-system-…/` — design system: token CSS, component CSS, brand guide (`readme.md`).
