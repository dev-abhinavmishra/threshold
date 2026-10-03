# Enemy: Echoskin

- **Narrative function**: Door mimic stalker — reads as the Pursuer's silhouette on approach
- **Visual / silhouette**: Horned thing (quaternius_demon)
- **Audio cues**: echoed footsteps answering yours
- **Spawn / rules**: shadows the player a room behind; copies the Pursuer telegraph as a decoy
- **Counterplay**: count footsteps — it answers one step late; it cannot kill at range
- **Failure outcome**: close contact
- **Fairness safeguards**: decoy rule documented in death hint
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.echoskin`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
