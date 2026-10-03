# Enemy: Behemoth

- **Narrative function**: Late-run corridor blockade — a thing too large for the hall that flies the pass lane twice
- **Visual / silhouette**: Dragon rig (quaternius_dragon, scaled to ~3.4m, hovering at y≈0.9)
- **Audio cues**: long sub-bass warning (`behemoth-warn` 1.8s), wing thuds (`behemoth-thud`); 3-room light flicker pre-pass
- **Spawn / rules**: CorridorRunner variant (`behemoth: true`), 2 slow passes (speed 0.85), kills on contact in a wide radius
- **Counterplay**: hear the warn cue, reach a hiding spot or clear the lane before its passes — same lane discipline as the Sweep
- **Failure outcome**: touch during a pass → 60 damage
- **Fairness safeguards**: longest warningTime on the roster (3.4s); requires `hasSurvivalOption` window; cooldown 14 rooms; tier-3 beats only
- **Debug**: `spawn behemoth`; tuning row `ENTITY_TUNING.behemoth`
- **Compatible rooms**: minRoom 55, corridor/maintenance biomes
- **Pacing**: tier 3 via the beat planner; foreshadowed by collapsed debris (`rubblePile`/`rubble`/`wallVent`)
