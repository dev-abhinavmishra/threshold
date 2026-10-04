# Known Issues

| # | Severity | Issue | Status |
| --- | --- | --- | --- |
| 1 | medium | Encounter pacing is emergent not authored — mid-run tension can plateau | Fixed — sprint 88 beat planner + 93 density floor (max gap ≤10) |
| 2 | medium | No audio occlusion/reverb — distant threats sound adjacent | Fixed — sprint 90 convolver zones + door lowpass |
| 3 | medium | No debug tooling (room-jump, entity spawn, perf HUD) | Fixed — sprint 87 debug panel |
| 4 | low | Procedural door leaf reads flat at grazing light angles | Fixed — sprint 94 milled 6-panel GLB leaf |
| 5 | low | corridor biome can dominate some seeds (~25–30%) | Fixed — sprint 94 weight taper past room 9 (now 9–17%) |
| 6 | low | Draw calls high in dense rooms on iGPU | Fixed — sprint 91 InstancedMesh clutter |
| 7 | low | Player sprint has no stamina tradeoff; hiding is binary | Closed — stamina drain/regen shipped; door intent (slam/creep) added sprint 95 |
| 8 | info | QA renders use BLENDER_WORKBENCH — not the game renderer | Expected |
| 9 | info | E2E runs on SwiftShader — screenshots darker/noisier than real GPU | Expected |
| 10 | medium | `EntityCtx.now` captured `clock.time` by value at spawn — every `c.now` timer (corridor pause/near-miss, curator recency, minigame windows) compared against a constant | Fixed — sprint 179 live getter |
| 11 | medium | 'watch' anim gate inverted — watches crept only while *observed*, contradicting their SCARES entry | Fixed — sprint 177 |
| 12 | medium | Loot pass rolled `contains` over `arrivalRegister` meta (~50% of seeds) — register read "Take Imprints", arrival objective unsatisfiable | Fixed — sprint 180 skip-guard + seed regression test |
| 13 | low | `?debug` panel renders but `window.__thresholdGame` handle is dev-build only — production preview builds can't be probed the same way | Expected |
| 14 | high | Authored props/hiding spots could land inside a door's approach lane and pinch an open doorway, blocking traversal (observed: chase-room entry in QA run) | Fixed — sprint 204 `inDoorLane`/`clearDoorLanes` at spec level + builder collider-extent check + foreshadow/injected-corner lane guards + seed regression test |
| 15 | high | `flickerRoom` sweep/reprise/dim wrote `l.intensity` via setInterval, but the per-frame light loop recomputes it from `userData.baseIntensity` — the warn flicker was stomped within ~16ms (invisible telegraph) | Fixed — sprint 205 writes `baseIntensity`; flicker now visible, 'dim' persists (capped once per room via `dimmedRooms`) |
