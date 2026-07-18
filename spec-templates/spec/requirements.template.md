<!--
  requirements.template.md
  Describes the section shape that mcp__rig__render_document (stage: "requirements")
  produces from rows written via set_requirements_overview / add_user_story /
  add_acceptance_criterion / add_non_goal / add_assumption_open_question /
  add_glossary_term. Nothing is hand-filled from this file — it's reference structure for
  the requirements-compiler agent, not a file that gets copied or edited per-feature. See
  README.md for the full process. This describes WHAT must be true — never HOW it will be
  built. No implementation detail, architecture, or technology choices belong here.
-->

# Requirements: <feature name>

## Overview

<!-- 2-4 sentences, plain prose. Orient a cold reader before they hit any formal
     structure below: what is this feature, and why does it exist. -->

## User Stories

<!--
  One subsection per user story. Each story gets:
    - A one-line "As a ___, I want ___, so that ___" statement.
    - A short plain-prose Rationale (the "why" that EARS criteria can't carry).
    - Its EARS acceptance criteria, grouped underneath.

  EARS (Easy Approach to Requirements Syntax) patterns — use whichever fits, don't
  force everything into "WHEN...SHALL":

    Ubiquitous:        THE SYSTEM SHALL <always-true behavior>
    Event-driven:       WHEN <trigger>, THE SYSTEM SHALL <response>
    State-driven:        WHILE <state>, THE SYSTEM SHALL <response>
    Unwanted behavior:  IF <undesired condition>, THEN THE SYSTEM SHALL <response>
    Complex/conditional: WHEN <trigger>, IF <condition>, THE SYSTEM SHALL <response>
    Optional feature:    WHERE <feature is included>, THE SYSTEM SHALL <response>

  Non-functional criteria MUST include a measurable threshold. "THE SYSTEM SHALL be
  fast" is not acceptable. "WHILE under 1000 concurrent users, THE SYSTEM SHALL
  respond within 200ms" is.
-->

### Story 1: <short title>

As a <role>, I want <capability>, so that <benefit>.

**Rationale:** <why this story matters, in plain prose>

**Acceptance Criteria:**

1. WHEN <trigger>, THE SYSTEM SHALL <observable, testable response>.
2. IF <undesired condition>, THEN THE SYSTEM SHALL <observable, testable response>.
3. <...>

### Story 2: <short title>

<!-- repeat pattern -->

## Non-Goals

<!-- Explicitly out of scope. State them, don't just omit them — absence of coverage
     should be deliberate, not accidental. -->

-

## Assumptions / Open Questions

<!-- Anything the compile step could not resolve from the trail's decisions transcript,
     or anything left genuinely ambiguous and flagged for the design stage to be aware
     of. The compiler cannot pause to ask the human — recording the gap here is the
     mechanism, reviewed at the approve/deny gate. Do not silently drop gaps. -->

-

## Glossary

<!-- Domain terms introduced by this feature. If a project-wide glossary already
     exists (e.g. via a domain-modeling skill), link to it instead of duplicating
     definitions here. -->

-
