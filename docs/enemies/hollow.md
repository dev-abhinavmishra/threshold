# Enemy: Hollow

- **Narrative function**: The thing already inside the hiding spot
- **Visual / silhouette**: Grey intruder (quaternius_alien, 1.7m) pressed against the hide volume
- **Audio cues**: struggle cue when discovered
- **Spawn / rules**: occupies a random hide spot per run; discovered on entry attempt
- **Counterplay**: check hide spots visually first; this run has another hide
- **Failure outcome**: contact struggle damage
- **Fairness safeguards**: spot glows subtly; alternate hide always exists (sim-validated)
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.hollow`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
