# The Singer

A small hooded thing that walks your own trail, five seconds late.

## What it does

- Records every step you take for the last ~12 seconds and replays them
  5 seconds behind you — real footstep sound events, in your cadence,
  coming from behind. You hear someone keeping your exact pace.
- Stops when you stop. Waits silently for the trail to refill. The
  footsteps resuming when you do is the scare.
- Flees the instant you look at it (within ~12 m) or walk into it —
  a skitter of steps and it's gone. It was never hunting you.
- Harmless, and quietly useful: its steps are real sound events, so
  sound-hunters (Whispers, Redactors) that hear it track *it*, not you.
  An accidental decoy that still costs you your nerve.

## Spawn rules

`spawnChance 0.3`, `minRoom 22`, `cooldown 18`. Never in the Underscript —
scheduled encounters only, via `spawnById('singer')`.

## Counterplay

- **Ignore it.** It's the only entity where doing nothing is optimal.
- **Feed the hunters to it.** If you hear it while a hunter is loose,
  move slowly — let its steps out-shout yours.
- **Never follow it.** Chasing into a bolt-hole room during a threat
  window gets you killed by the thing you ran from it toward.

## Design intent

Dread, not danger — the run needs an entity that rewards observation
instead of punishing it, so "something behind you" stays a live question
rather than a solved one. Cheap insurance against pacing dead zones:
it converts any quiet stretch into a slow-burn tail in ~6 s flat.

## Failure mode (by design)

None. It can strand a player who over-rotates on a harmless tail and
walks into a real threat — that death is attributed to the killer,
not the Singer, and the postmortem hint says so.
