# Enemy: Redline

- **Narrative function**: Underscript corridor sentry — the red-lit line
- **Visual / silhouette**: Ink column with a red lamp band
- **Audio cues**: electrical hum, redline cue
- **Spawn / rules**: patrols its corridor span; kill on contact while lit
- **Counterplay**: time passes during its sweep gap; hide in vents
- **Failure outcome**: contact while active
- **Fairness safeguards**: lamp band visible far; sweep rhythm fixed
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.redline`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
