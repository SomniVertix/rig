<!--
  design.template.md
  Drafted autonomously by the design stage from an APPROVED requirements.md. No human
  interview happens at this stage — see README.md. If something here can't be
  determined confidently from requirements.md, draft your best-effort approach anyway
  and record the concern in Flags below rather than halting.
-->

# Design: <feature name>

## Overview

<!-- Plain-prose summary of the technical approach. Explicitly reference which
     requirements/user stories (by name, from requirements.md) this design
     addresses. -->

## Architecture

<!-- Components/modules involved and how they interact. Use a diagram (mermaid,
     ASCII, or prose) if it clarifies relationships that prose alone would muddy. -->

## Components

<!-- Mandatory: declare every component this feature is built from, at least one row
     required — a design with zero declared components is invalid and must be rejected
     at design finalization. Each `slug` MUST be kebab-case (lowercase letters/digits,
     hyphen-separated, e.g. `db-schema`, `mcp-transport`) — this is enforced by the same
     kebab-case convention used for spec/project slugs elsewhere in this workflow, not
     just a style preference. The tasks stage maps onto these 1:1: exactly one
     per-component task document (see tasks-index.template.md /
     component-tasks.template.md) per declared component slug. -->

| Slug | Display name | Responsibility |
|---|---|---|
| `<component-slug>` | <Component Display Name> | <what this component is responsible for> |

## Data Model / Interfaces

<!-- Schemas, types, API contracts. Concrete enough that an implementer can code
     directly against this section — not just a description of what data exists,
     but its actual shape. -->

## Requirement Traceability

<!-- Explicit mapping: every user story / requirement from requirements.md maps to
     the specific part of this design that satisfies it. Nothing should be able to
     silently fall through the cracks between stages. -->

| Requirement | Addressed by |
|---|---|
| Story 1: <title> | <design section / component> |
| Story 2: <title> | <design section / component> |

## Alternatives Considered

<!-- Options weighed and rejected, with why. This substitutes for the missing
     interview transcript at this stage — a cold reviewer needs to trust the design
     wasn't arbitrary. -->

-

## Open Risks / Tradeoffs

<!-- Known weaknesses or deliberately deferred concerns in the CHOSEN approach.
     Different from Flags below: this is about tradeoffs in what you decided to
     build, not gaps in what you had to work with. -->

-

## Flags

<!-- Concerns, gaps, or assumptions encountered while drafting this design because
     requirements.md was insufficient or ambiguous on some point. Always draft your
     best-effort design regardless — record the concern here instead of halting to
     ask the human. The human reviews this section during the approve/deny gate. -->

-
