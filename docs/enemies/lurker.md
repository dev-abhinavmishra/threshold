# Enemy: Lurker

- **Narrative function**: Darkness ambusher — the light-holding lesson, mid-run maintenance wings
- **Visual / silhouette**: Crouched ninja (quaternius_ninja, scaled 0.72, near-black tint, amber emissive)
- **Audio cues**: low stalk scrape (`lurker-stalk`), recoil hiss (`lurker-flee`)
- **Spawn / rules**: crouches ~2.4m off the door lane; stalks toward the player while unlit within seeRange
- **Counterplay**: hold the lamp/pulse beam on it ~1.2s — it recoils and is done (uses Game's `lightOnIt` mark)
- **Failure outcome**: it reaches killRange (1.4m) or stalks past 9s → damage + done
- **Fairness safeguards**: 1s warn cue at spawn; pacing tier 2 (never in calm or chase beats); biome-restricted (maintenance/unlit/guest)
- **Debug**: `spawn lurker` in the debug panel; tuning row `ENTITY_TUNING.lurker`
- **Compatible rooms**: minRoom 28, biomes maintenance/unlit/guest
- **Pacing**: tier 2 via the sprint-88 beat planner; foreshadowed by dropped tools (`toolbox`/`wrench`/`papers`)
