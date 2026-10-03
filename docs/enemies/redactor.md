# Enemy: Redactor

- **Narrative function**: False exit — a door that shouldn't exist
- **Visual / silhouette**: Oak leaf + brass plate beside the real exit, plate misaligned, label wrong
- **Audio cues**: redactor-sense cue: 'the sequence feels wrong'
- **Spawn / rules**: plants a fake exit 2.4m beside the real one; punishes interaction
- **Counterplay**: read the number plate — it doesn't match the route
- **Failure outcome**: interact = damage + door collapses
- **Fairness safeguards**: visual tells on plate + seam; never blocks the real exit
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.redactor`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
