# Enemy: Grafter

- **Narrative function**: Underscript roamer — hovers, wanders, notices
- **Visual / silhouette**: Hovering rock-thing (quaternius_goleling, bob animation)
- **Audio cues**: grind cycle every ~4.5s
- **Spawn / rules**: seeded roam; notices player <9m unhidden same room → charge at 1.4× speed
- **Counterplay**: break line-of-sight between rooms; outlast 75s timer
- **Failure outcome**: contact kill
- **Fairness safeguards**: wake cue + hover bob visible in dark; leaves after ±2 rooms
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.grafter`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
