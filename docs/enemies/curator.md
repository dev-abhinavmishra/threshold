# Enemy: Curator

- **Narrative function**: Index milestone guardian — measures the player like a specimen
- **Visual / silhouette**: Robed archivist under measuring rods (quaternius_wizard, 2.8m, dim emissive)
- **Audio cues**: rod clicks, page turns
- **Spawn / rules**: guards room 51; engages on intrusion; slow patrol. Since sprint 191 it also walks on its own: one ambient Curator may schedule per run in records/gallery/unlit rooms ≥56 in tier≥2 windows (spawnChance 0.22, cooldown 999 — once per run), containing itself to the trigger room on spawn
- **Counterplay**: stay outside its measuring radius; loot only after it passes
- **Failure outcome**: measured too long = strike
- **Fairness safeguards**: huge warning window; safe alcoves authored in the room
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.curator`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
