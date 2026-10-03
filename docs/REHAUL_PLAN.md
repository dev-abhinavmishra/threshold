# THRESHOLD — Rehaul Plan

Verdict up front: **PRESERVE everything architecturally; rehaul systems listed below; no full rebuilds.** The codebase passes every "preserve" test in the brief — stable, maintainable, testable, expandable. The gaps are depth/pacing/content, not foundations.

## System-by-system

| System | Verdict | Why | Plan |
| --- | --- | --- | --- |
| Seeded RNG/streams | Preserve | Deterministic; 5-seed sim validates runs | — |
| Room generation + validation | Preserve | Produces fair routes; validated | Extend pacing hooks (below) |
| Streaming/culling window | Preserve | Bounded memory, tested | Instancing pass for perf |
| Renderer/post | Preserve | ACES/SSAO/bloom already | Light flicker variety |
| Entity base/state machine | Preserve | Uniform states, tuned table | Add debug surface |
| Per-entity behaviors | Rehaul (content) | Readable but shallow docs/debug | `docs/ENEMY_*` + spawn/state tooling |
| Encounter scheduling | Rehaul | Flat probability → authored beats | Beat planner over `scheduleEncounters` |
| Audio cues | Rehaul | Works, lacks occlusion/reverb | Zone reverb send + door occlusion |
| Interaction | Rehaul | Covers doors/drawers/hide/loot | Richer door states (peek/hold/slam) |
| Player controller | Preserve | Step offset, bob, material footsteps | — |
| Checkpoints | Preserve | Ward saves + retry tested | — |
| UI/menus/settings | Preserve | Deep settings, captions, contrast | Death-screen polish only |
| Figure bodies | Rehaul (content, in progress) | Procedural → rigged GLB | 14/19 done; finish roster |
| Prop library | Rehaul (content, in progress) | 464 CC0 + 15 mill pieces | Keep milling |
| Debug tooling | **Build new** | Absent | This sprint |
| Docs set | **Build new** | Absent | This sprint |

## Per-item write-ups (brief format)

### Encounter pacing planner
- **Why inadequate**: every entity rolls `spawnChance` independently per room — no guarantee of lulls after intensity, escalation toward milestones, or recovery placement. Doors/Pressure feel authored because beats are paced; ours are emergent noise.
- **Preserve**: `ENTITY_TUNING` fields, `scheduleEncounters` signature, seeded determinism.
- **Replace**: the per-room independent roll with a seeded beat plan — a run-level array of tension segments (calm / warning / threat / chase / relief) generated once per seed, entities sampled *within* segment rules.
- **New architecture**: `world/pacing.ts` → `planBeats(seed, rooms)` returns `Beat[]` consumed by `scheduleEncounters`.
- **Tests**: sim asserts no two `chase`-grade beats within N rooms, recovery after every high-intensity beat, entity density curve rising toward 100.
- **Regression risk**: fewer total encounters in early rooms — cap with min-density floor.

### Audio zoning
- **Why inadequate**: synthesized cues pan/distance correctly but a Pursuer two rooms away is as loud as adjacent; no reverb identity per biome (marble gallery vs carpet guest vs metal under).
- **Preserve**: cue table, caption coupling, volume buses.
- **Replace**: nothing — add a static reverb send per biome (simple feedback delay) + an occlusion scalar computed from door-open state + room distance.
- **Tests**: none possible headless — verify levels via debug HUD readout.
- **Regression risk**: none — additive path.

### Prop instancing
- **Why inadequate**: every prop is a unique mesh — 150–400 draw calls/room before culling.
- **Preserve**: prop placement/template data.
- **Replace**: mesh creation for identical static kinds (stackShelf, filing, pipeManifold, drawers) with `InstancedMesh` per kind per room.
- **Tests**: renderer.info draw-call assertion in e2e smoke (< budget); visual QA screenshot compare.
- **Regression risk**: per-instance material variance lost — keep instanced set to plain-material kinds only.

## Rollback
Tag `stable-pre-rehaul` (6cc032c) is the restore point. Each rehaul lands behind `npm run sim` + e2e + build green; failures revert, not force-push.
