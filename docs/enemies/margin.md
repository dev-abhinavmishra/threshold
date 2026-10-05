# Enemy: Margin

- **Narrative function**: Underscript positional threat — moves only off-screen
- **Visual / silhouette**: Ink-black ghost (quaternius_inkGhost tint 0.06)
- **Audio cues**: page-edge rustle
- **Spawn / rules**: advances only while fully outside view frustum
- **Counterplay**: keep it in view; back away slowly
- **Failure outcome**: unseen contact
- **Fairness safeguards**: it freezes the instant you look
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.margin`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
