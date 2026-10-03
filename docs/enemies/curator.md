# Enemy: Curator

- **Narrative function**: Index milestone guardian — measures the player like a specimen
- **Visual / silhouette**: Robed archivist under measuring rods (quaternius_wizard, 2.8m, dim emissive)
- **Audio cues**: rod clicks, page turns
- **Spawn / rules**: guards room 51; engages on intrusion; slow patrol
- **Counterplay**: stay outside its measuring radius; loot only after it passes
- **Failure outcome**: measured too long = strike
- **Fairness safeguards**: huge warning window; safe alcoves authored in the room
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.curator`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
