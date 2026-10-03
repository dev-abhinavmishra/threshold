# Enemy: Husk

- **Narrative function**: Dormant sleeper — beam-paint wakes it
- **Visual / silhouette**: Big pale slumped figure (quaternius_yeti, 2.5m)
- **Audio cues**: stir → bellow → heavy footsteps
- **Spawn / rules**: sleeps against walls in big rooms; anger builds on light 0.4+, proximity <3.4m, sprint noise; hunts last-seen
- **Counterplay**: don't paint it with the lamp; walk past quietly
- **Failure outcome**: hunt charge kill within 1.35m
- **Fairness safeguards**: stir cue + unslump is loud and slow; give-up returns it home
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.husk`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
