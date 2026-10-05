# Enemy: Returner

- **Narrative function**: Corridor runner closing from ahead
- **Visual / silhouette**: Antlered sprinter at full run (quaternius_monkroose)
- **Audio cues**: approaching footfalls
- **Spawn / rules**: spawns up to 4 rooms ahead, runs toward player
- **Counterplay**: side-room or hide before it arrives
- **Failure outcome**: collision
- **Fairness safeguards**: audible long before visible; exits on pass
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.returner`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
