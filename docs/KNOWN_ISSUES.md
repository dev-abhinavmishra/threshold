# Known Issues

| # | Severity | Issue | Status |
| --- | --- | --- | --- |
| 1 | medium | Encounter pacing is emergent not authored — mid-run tension can plateau | Fixed — sprint 88 beat planner + 93 density floor (max gap ≤10) |
| 2 | medium | No audio occlusion/reverb — distant threats sound adjacent | Fixed — sprint 90 convolver zones + door lowpass |
| 3 | medium | No debug tooling (room-jump, entity spawn, perf HUD) | Fixed — sprint 87 debug panel |
| 4 | low | Procedural door leaf reads flat at grazing light angles | Fixed — sprint 94 milled 6-panel GLB leaf |
| 5 | low | corridor biome can dominate some seeds (~25–30%) | Fixed — sprint 94 weight taper past room 9 (now 9–17%) |
| 6 | low | Draw calls high in dense rooms on iGPU | Fixed — sprint 91 InstancedMesh clutter |
| 7 | low | Player sprint has no stamina tradeoff; hiding is binary | Design review pending |
| 8 | info | QA renders use BLENDER_WORKBENCH — not the game renderer | Expected |
| 9 | info | E2E runs on SwiftShader — screenshots darker/noisier than real GPU | Expected |
