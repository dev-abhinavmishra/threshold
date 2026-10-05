# Enemy: Pursuer

- **Narrative function**: Milestone stalker — the door-frame thing that corners at scripted beats
- **Visual / silhouette**: Horned mass filling the doorway, counter-rotating inside the frame silhouette (quaternius_demon rig, 2.3m, near-black tint)
- **Audio cues**: low pulse on approach; kill sting
- **Spawn / rules**: spawns only at scripted chase/milestone triggers; fixed-lane kill; telegraphed by lighting drop
- **Counterplay**: Break line-of-sight and reach the ward before the lane closes
- **Failure outcome**: contact = death; warned by caption + sting
- **Fairness safeguards**: never ambient — only fires at designed beats; checkpoint adjacent
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.pursuer`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
