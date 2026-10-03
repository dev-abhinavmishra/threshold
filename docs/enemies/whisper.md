# Enemy: Whisper

- **Narrative function**: Dark-room ambusher — find the silhouette before it lands
- **Visual / silhouette**: Translucent wraith (quaternius_ghost, 1.9m, opacity 0.5, emissive lift)
- **Audio cues**: spatial whisper circling the room
- **Spawn / rules**: warn phase whispers pan toward its real position; strikes after warningTime
- **Counterplay**: track the whisper pan; light or dodge before engage
- **Failure outcome**: strike lands if unheard
- **Fairness safeguards**: whisper always precedes the hit; reduced audio captions carry it
- **Debug**: spawn via debug panel (`spawn <id>`), states `idle|warn|engage|resolve|done`, tuning row `ENTITY_TUNING.whisper`
- **Compatible rooms**: per `minRoom`/`biomes` in `src/game/config.ts`
- **Pacing**: gated by the run beat planner (planned, sprint 88)
