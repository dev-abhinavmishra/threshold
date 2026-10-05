# Enemy: Witness

- **Narrative function**: Gaze-punishment — do not meet it
- **Visual / silhouette**: Relocated statue-class figure with a halo ring and white eyes (statue model or tribal rig)
- **Audio cues**: witness-drone while held in sight
- **Spawn / rules**: anchors at a room edge; pulls the camera toward itself unless reduced-motion; damages while faced
- **Counterplay**: Look away; walk past on the far side
- **Failure outcome**: 3s held gaze = escalating damage
- **Fairness safeguards**: camera pull is resistible, reduced-motion disables pull
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.witness`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
