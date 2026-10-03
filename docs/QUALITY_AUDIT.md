# THRESHOLD — Quality Audit

_Audit of the working game at `stable-pre-rehaul` (post-sprint-86, ~16.4k LOC TS/TSX, 63 main-floor + 14 Underscript room templates, 464 licensed model dirs, 14 rigged animated figures, 15 Blender-milled original prefabs, 19 tuned entity ids + 5 corridor-runner variants + 9 ambient scare systems, 52 unit tests + 4 e2e + 5-seed determinism sim)._

## 1. Strengths worth preserving

- **Seeded generation core** (`engine/rng`, `world/generator`, `world/validation`, `npm run sim`): every run is reproducible; 5-seed validation gates keys-before-locks, hiding coverage, no overlapping volumes. This is the foundation everything hangs on — hard to rebuild, cheap to extend.
- **Milestone spine**: authored set pieces at 50/51/75/100 + two chase sequences give the 100-room run real structure; no other layer of the game has this value-per-line.
- **Renderer**: ACES + SSAO + bloom + grain, PBR textures, quality presets incl. shadow-map gating, light shafts, decals, wainscot/architrave trim — already above "AI prototype" visuals on hardware.
- **Settings/accessibility surface**: 4 volume buses, sensitivity/invert/FOV, bob + reduced-motion + reduced-flashes, captions w/ size, high-contrast, minigame assist, keybinds, panic-FX reduction. Deep already.
- **Entity base + tuning table**: uniform `idle|warn|engage|resolve|done` states + per-id tuning rows in `config.ts` — expandable without rewrites.
- **Asset pipeline**: 464 CC0 models + rigged Quaternius bodies + the Blender mill — the import story is solved, provenance documented in `ASSETS.md`.
- **Checkpoint system**: ward-based saves exist at milestones; death→retry is tested in e2e.

## 2. Functional but need a quality rehaul

- **Enemy scripting**: bespoke per-class state machines work, but lack a shared debug surface (spawn at cursor, state overlay, kill switch) and authored docs. Rehaul = add the debug layer + `docs/ENEMY_*`, not rewrite behavior.
- **Encounter pacing**: `scheduleEncounters` is data-driven but pacing is implicit in `spawnChance/minRoom` — no authored tension curve (e.g. guaranteed lulls after chases). Rehaul = pacing planner over the schedule.
- **Audio**: synthesized cues + positional pans exist, but no reverb zones per biome and no occlusion modeling beyond same-room gating. Rehaul = cheap convolution-free reverb send + door-state occlusion factor.
- **Interaction coverage**: doors/drawers/hides/loot exist; physical interactions (hold-open, peek, slammed-shut reactions) are thin. Rehaul = richer door states, not new architecture.
- **Room repetition**: 63 templates is good but corridor biome still dominates some seeds (~25–30%). Rehaul = template weight shaping + more mill-dressed variants.
- **Prop-perf**: hundreds of small meshes per room; no batching for repeated props (shelves, drawers). Rehaul = InstancedMesh for repeated kinds.

## 3. Systems requiring full replacement

- **None at architecture level.** Every system passes the PRESERVE tests (stable, testable, expandable). The only full replacements are *content-level*: procedural placeholder bodies for entities are being replaced by rigged GLBs (already 14/19 done).
- **Debug tooling: absent → build new** (mandated by brief): room-jump, entity spawn/kill, state overlay, seed jump, FPS/frame overlay, save/load test hooks.

## 4. Biggest reasons it currently reads below target

- Encounters fire from a flat probability field — no designed escalation curve, so tension can plateau mid-run.
- Enemy telegraphing relies on audio cues + caption hints; no *visual* foreshadowing language (scuffs, disturbed props, drawings) tied to the specific entity scheduled in the run.
- Underscript reads sparser than the main floor (now being dressed by the mill — sprints 84–85).
- Audio lacks spatial occlusion — a threat 2 doors away sounds identical to one adjacent.
- No one has actually *played the balance*: tuning numbers are sim-validated, not playtested.

## 5. Biggest player-experience problems

- Death classes are hinted but the "what just killed me" read is uneven across entities.
- Sprint has no stamina tradeoff depth; hiding is binary in/out with no near-miss state.
- Route choice exists (branching + Underscript detour) but not signposted — players may miss the subfloor entirely.

## 6. Pacing & replayability problems

- Tension curve is emergent only; needs authored "beats" (warning → relief → escalation) seeded per run.
- Seed variety is spatial, not experiential — item/entity mix should differ more run-to-run within fairness bounds.

## 7. Atmosphere / audio / lighting problems

- No occlusion/reverb zoning; light flicker is uniform; dark rooms lean on the same palette.
- Procedural door-leaf + corridor architrave still flat-lit at grazing angles (mill archways landed for portals; doors pending).

## 8. Technical / performance risks

- Draw calls scale with prop count (~150–400/room); fine at target res, risk on integrated GPUs — mitigate via instancing + existing quality presets.
- AnimationMixer count grows per streamed room — bounded by the streaming window, but profiles absent.
- No FPS/frame-time HUD — the brief mandates one; being added with debug tooling.

## 9. Prioritized work plan

1. **Debug tooling** (sprint 87): room-jump, entity spawn, state overlay, perf HUD.
2. **Encounter pacing planner** (sprint 88): authored beat curve layered on seeded picks.
3. **Per-enemy docs + foreshadowing props** (sprint 89–90): `docs/ENEMY_*` + in-world tell decals per scheduled entity.
4. **Audio zoning** (sprint 91): occlusion factor + biome reverb send.
5. **Prop instancing** (sprint 92): InstancedMesh for repeated kinds.
6. **Playtest pass + tuning** (sprint 93+): recorded full run, death-hint audit, pacing fixes.
7. Continue mill coverage + rigged roster to taste.

## 10. Rollback / migration strategy

- `stable-pre-rehaul` tag created at 6cc032c (this commit's parent state). All rehaul work lands on `devin/1790826595-threshold-game` behind the existing test gate; any migration that breaks sim/e2e is reverted, not forced.
- Replacement rule honored already: procedural bodies weren't deleted — rigged GLBs layer in with the procedural path as fallback (`riggedFigure() ?? tallFigure()`).
