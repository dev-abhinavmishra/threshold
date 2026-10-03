# Enemy: Inkling

- **Narrative function**: Light-reactive mass — hates sustained beams
- **Visual / silhouette**: Tar-dark slime (quaternius_slime, agitated under light)
- **Audio cues**: squelch, hiss on light
- **Spawn / rules**: spawns dark rooms; angers under sustained lamp; calms in shadow
- **Counterplay**: angle the beam away; move past unlit
- **Failure outcome**: charged contact under light
- **Fairness safeguards**: warn cue on first light contact; 1s+ warning
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.inkling`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
