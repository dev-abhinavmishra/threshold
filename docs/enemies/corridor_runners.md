# Enemy: Runner Family

- **Narrative function**: Corridor traffic — Sweep/Reprise/Maelstrom
- **Visual / silhouette**: Skeleton sprinter / armoured orc / ink maelstrom core
- **Audio cues**: distant to near footfall panning
- **Spawn / rules**: cross a corridor lane from behind or ahead, N passes
- **Counterplay**: step off the lane
- **Failure outcome**: lane contact
- **Fairness safeguards**: audible approach + caps at 2 passes for reprise
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.sweep`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
