# Enemy: Stillframe

- **Narrative function**: Shutter minigame — freeze on the snap
- **Visual / silhouette**: Camera-attached frame overlay
- **Audio cues**: shutter snap cue
- **Spawn / rules**: window opens ~0.55s after cue; any held input inside window = damage
- **Counterplay**: release all inputs on the snap
- **Failure outcome**: input during window
- **Fairness safeguards**: minigameAssist widens grace up to 2.4s
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.stillframe`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
