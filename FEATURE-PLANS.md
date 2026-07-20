A collection of features that I want to think through for the Rig application:



---
## Spur trails: waypoints that spin off their own trail

**Problem:** A waypoint sometimes turns out too big for its trail — not out of scope, not a simple spec handoff, but a standalone effort deserving its own trail, while the original trail keeps moving. We've hit this twice: Trail A (`rig-rebrand-and-workspace-binding`) bypassed W9/W10 with a `bypassReason` of "see trail rig-workspace-binding" — a trail that didn't exist yet, just a string with nothing backing it. That dangling pointer then had to be hand-tracked in a throwaway recovery doc after a Postgres wipe, because nothing structural linked it for a future session to follow.

Today's only tools for "not this trail's job" — `bypass_waypoint` and `reach_waypoint` (handoff) — take free text. Neither creates a real link.

**Proposal:** a first-class way to spin off a waypoint into its own trail, as a real edge in the data:
- A `spin_off_trail` action (or `reach_waypoint` mode) that creates the new trail — auto-seeded from the waypoint's question/resolution, like `complete_trail(outcomeKind: "spec")` seeds a spec — and stamps `origin_waypoint_id` back onto it in the same transaction.
- The origin waypoint records what it spun off, surfaced in `get_trail`'s map — maybe a `spurs` section alongside `decisions`/`frontier`/`fog`/`outOfScope`.
- The spun-off trail should symmetrically show "spawned from `<origin trail>` `W<n>`", mirroring how `get_trail_by_spec` traces a spec back to its trail.
- Distinct from trail→spec handoff: that's terminal (ends the trail). A spur is mid-trail, on one waypoint, and the original trail continues — more like a child trail.
- **Open question:** can a spur be created before its target trail is chartered? Leaning toward "must create it now" — same reasoning as requiring `complete_trail` to be the only path creating a linked spec, rather than allowing a bare pointer to something that may never show up.

---

Allow MCP to list all projects for troubleshooting purposes