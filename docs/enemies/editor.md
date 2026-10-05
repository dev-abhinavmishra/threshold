# Enemy: Editor

- **Narrative function**: Underscript finale — the thing that rewrites the floor
- **Visual / silhouette**: Deep-blue winged thing (quaternius_bluedemon, 2.6m, emissive) over the last under room
- **Audio cues**: scratching re-writes, wing beats
- **Spawn / rules**: forced spawn on final under room; patrols; documents change under it
- **Counterplay**: route around its patrol; collect the exit seal
- **Failure outcome**: cornered = kill
- **Fairness safeguards**: final room only; telegraphed by ink creep on the walls
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.editor`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
