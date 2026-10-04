# THRESHOLD — Rehaul Final Report

_Living document — updated as rehaul sprints land. Branch `devin/1790826595-threshold-game`, PR #1. Restore point: `stable-pre-rehaul` (tag + branch at 6cc032c)._

## 1. What changed (summary)

Since the rehaul directive: per-enemy authored docs (`docs/enemies/*` for all
19 lethal/ambient ids + collector + singer), the `?debug` panel (room-jump,
entity spawn/kill, state overlay, perf HUD), a seeded beat planner
(`world/pacing.ts` — tension curves replace flat spawnChance rolls), audio
occlusion + biome reverb beds, prop instancing for repeated static kinds,
under-floor dressing from the Blender mill, ~30 seeded scare beats (full
catalog: `docs/SCARES.md`), three new entities (Collector — toll
negotiation; Singer — sound-mimic tail; plus the set-piece roster), two
renderer-impacting fixes (watch/gaze observation semantics, live
`EntityCtx.now`), and playtest-sourced fixes (register meta clobber,
co-located doors, WebGL fallback, prop colliders).

## 2. System-by-system verdict

| System | Verdict | Outcome |
| --- | --- | --- |
| Seeded RNG/streams | Preserve | Unchanged — foundation for everything |
| Room generation/validation | Preserve | +pacing hooks, +loot-pass meta guard |
| Streaming window | Preserve | +InstancedMesh pass for clutter kinds |
| Renderer/post | Preserve | +flicker variety, gaze/watch anims |
| Entity base/state machine | Preserve | +ctx (interactables, nearestThreat, live now) |
| Per-entity behavior | Rehaul (content) | docs + debug surface + 2 new ids |
| Encounter scheduling | Rehaul | beat planner over `scheduleEncounters` |
| Audio cues | Rehaul | occlusion lowpass + convolver zones |
| Interaction | Rehaul | richer doors: peek/slam/creep/listen/toll |
| Player controller | Preserve | +stamina, step-offset fixes |
| Checkpoints | Preserve | ward saves + retry (e2e-tested) |
| UI/menus/settings | Preserve | death-screen polish only |
| Figure bodies | Rehaul (content) | 14/19 rigged GLB; new bodies procedural |
| Prop library | Rehaul (content) | 464 CC0 + 15 mill pieces |
| Debug tooling | Built new | `src/game/debug.ts` |
| Docs set | Built new | `docs/*` — this file included |

## 3. Reasons for full rebuilds

None. Every system passed preserve tests (stable, maintainable, testable,
expandable); all replacements were content-level (procedural figures →
rigged GLBs, in progress 14/19).

## 4. External repositories inspected

- `github.com/per-simmons/blender-production` (user-recommended) — headless
  Blender pipeline patterns; informed `tools/mill/` design, no code copied.
- The brief's engine lists (Godot/Unity/Unreal) — concepts only: LimboAI
  task/state separation → entity state machine; Maaack settings checklist →
  already satisfied; SimpleDungeons rules → covered by seeded validator.

## 5. External repositories actually used

None for code. Asset sources (not repos): ambientCG PBR sets, Poly Haven
GLTF furniture, poly.pizza/Quaternius rigged figures — all CC0, catalogued
per-file in `ASSETS.md`.

## 6. License and attribution notes

All third-party art is CC0/public-domain; runtime deps are MIT/BSD-family.
Blender 4.2 (GPL) is build-time tooling only — exported GLBs carry no
license contamination. Full table: `docs/THIRD_PARTY_ATTRIBUTION.md`.

## 7. Playable flow tested

- Golden path, deep traversal (Lens Hall, chase, east wing), death→retry —
  recorded e2e runs (4 specs green).
- `npm run sim`: 5 seeds × (101 main + 121 under) — keys-before-locks,
  hiding coverage, no overlaps; 63 vitest assertions green.
- Balance playthrough (sighted, 'qa' seed + standard-seed partial): in
  progress — findings to date: register-meta clobber (fixed + regression
  test), drawer loot, hide toggle, crouch-peek, armed-cam caption all
  verified working.

## 8. Known limitations

See `docs/KNOWN_ISSUES.md` (13 rows). Highlights: SwiftShader e2e renders
darker than real GPUs; `?debug` panel works on preview builds but the
`__thresholdGame` handle is dev-only; shortRun/'qa' routes carry ~3
scheduled encounters by design (guarantee windows live above room 30).

## 9. Performance observations

- Instanced clutter dropped dense-room draw calls into budget (e2e asserts
  < budget in smoke spec).
- Streaming window bounds live rooms; animated props tick only inside it.
- SwiftShader software-GL runs ~1–8 fps locally — real GPUs run the ACES +
  SSAO + bloom stack at interactive rates (quality tiers: low/medium/high).

## 10. Build / run / package

```bash
npm install          # Node 20+
npm run dev          # dev server (WebGL required)
npm test             # 63 unit/sim assertions
npm run sim          # 5-seed route validation
npm run e2e          # playwright smoke suite (needs WebGL)
npm run build        # production bundle → dist/
npx vite preview     # serve the production build
```

## 11. Prioritized roadmap

1. Land balance playtest findings (in flight — this file's §7 updates).
2. Finish rigged-figure roster (14/19 → 19/19).
3. Room-density: corridor weight taper already shipped; next is
   mill-dressed variants for remaining sparse biomes.
4. Encounter gaps: `pursuer`/`curator`/`hazard` remain milestone-only —
   candidate scheduling hooks exist if balance wants them ambient.
5. Audio: biome reverb is a send — wet/dry per-room tuning next.
