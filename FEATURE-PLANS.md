A collection of features that I want to think through for the Rig application:



---
A "spur" concept for the discovery phase — waypoints that spin off their own trail

Sometimes a waypoint, while being worked, turns out to be too big for this trail — not out of scope, not a simple handoff to a spec, but a real standalone effort that deserves its own destination and its own wayfinder session(s), while the original trail keeps moving on everything else. We've hit this exact shape twice now:

- Trail A (`rig-rebrand-and-workspace-binding`) had two waypoints (W9, W10 — the workspace scanner and the resolver process) that got bypassed with a `bypassReason` saying, in prose, "see trail rig-workspace-binding" — except that trail didn't exist yet at the time. It was just a name, typed as a string, with nothing backing it.
- That dangling pointer then had to be tracked by hand in a throwaway recovery doc (`docs/wayfinder-trails-recreation-2026-07-19.md`) after an unrelated Postgres wipe destroyed the actual trail data, because there was no structural link anywhere for a future session to follow — only prose someone had to remember to write down and keep in sync.

Right now the only tools for "this isn't this trail's job" are `bypass_waypoint` (out of scope entirely) and, after this session's fix, `reach_waypoint` as a handoff decision (still in scope, but built elsewhere) — both just take free text. Neither creates an actual link to the elsewhere.

What I want: a first-class way to say "this waypoint spins off its own trail," where the spin-off is a real edge in the data, not a string:
- Something like a `spin_off_trail` action (or a mode on `reach_waypoint`) that creates the new trail — auto-seeded from the waypoint's own question/resolution the way `complete_trail(outcomeKind: "spec")` auto-seeds a spec — and stamps a real `origin_waypoint_id` (or similar) back-reference onto it in the same transaction, no separate step to forget.
- The origin waypoint records that it spun off a trail (and which one), so `get_trail`'s computed map can surface it — maybe a `spurs` section alongside `decisions`/`frontier`/`fog`/`outOfScope` — instead of that fact being buried in prose inside a `resolution` or `bypassReason` field.
- The spun-off trail, symmetrically, should be able to show "spawned from `<origin trail>` `W<n>`" the way a spec today can be traced back to its trail via `get_trail_by_spec` — same idea, one level up, before a spec even exists.
- This is distinct from the trail→spec handoff: that's a *terminal* action ending a whole trail into one spec. A spur happens mid-trail, on a single waypoint, and the original trail keeps going — closer to a child trail than a completion.
- Worth deciding: can a spur be created before its target trail is chartered (deferred, like Trail A's bypassReason was), or does the action have to create the trail right then? Given the whole point is to kill dangling string references, I lean toward "must create it now" — same reasoning as this session's fix requiring `complete_trail` to be the only path that creates a linked spec, rather than allowing a bare pointer to something that may or may not show up later.