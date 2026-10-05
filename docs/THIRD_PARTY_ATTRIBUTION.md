# Third-Party Attribution

Runtime deps: `three` (MIT), `react`/`react-dom` (MIT), `zustand` (MIT), `vite`, `vitest`, `playwright`, `typescript`, `eslint` — see package.json; all MIT/BSD-family.

## Art assets (all CC0/Public Domain)

| Source | What | License |
| --- | --- | --- |
| ambientCG.com | PBR texture sets (walls, floors, ceilings, metal, fabric, stone, plaster, carpet) | CC0 |
| Poly Haven (polyhaven.com) | Furniture/prop GLTF models — beds, desks, sofas, shelves, lamps, statues, clocks, carts, appliances | CC0 |
| poly.pizza → Quaternius | Rigged animated creatures: ghost, demon, skeleton, slime, wizard, blueDemon, alien, goleling, yeti, orc, ninja, tribal, monkroose, dragon | CC0 |

Per-file provenance (poly.pizza ids + model dirs) lives in `ASSETS.md` — it's the source of truth, appended per sprint.

## Original assets
- `tools/mill/prefab_kit.py` — headless Blender 4.2 prefab mill (archway, colonnade, vault, fireplace, windowArch, hatch, medallion, scissorgate, balustrade, boilerDrum, pipeManifold, stackShelf, breakerPanel, wallVent, portcullis, wardrobe, dresser, nightstand, boneArch, toppledColumn, wallNiche, stairGate, transomWindow, bookCart, radiatorFin, dumbwaiter, ironGrate, keyRack, counterBell, luggageRack, doorPlaque, hallTree, umbrellaStand, washStand, mailCart, podiumLectern, conduitRun, sumpPump, hangingCable, ductRun, doorChain, tollPlate, plinth, displayCase, ropeBarrier, exhibitLabel, libraryLadder, cageLocker, bellCart, teaTrolley, bedBench, radiatorTall, linenHamper, basinSink, pegRail, towelRail, ceilingHook, ovalMirror) — authored for this project, original.
- All audio is synthesized in `src/audio/audio.ts` — no third-party audio files.
- All decals are canvas-generated at runtime — no third-party decal files.

## Tooling
- Blender 4.2.9 LTS (GPL — tool only; exported meshes carry no license contamination).

## Inspected reference repos (read-only, none imported)
- `github.com/per-simmons/blender-production` — headless Blender workflow patterns (user-recommended); informed the mill, no code copied.
- The brief's Godot/Unreal/Unity lists — engine-mismatched (we are Three.js/TS); mined for *concepts only*: LimboAI's state-task separation informed the entity state machine; Maaack's settings-menu checklist is already satisfied; SimpleDungeons' rules are satisfied by our seeded validator. No code, assets, or systems imported.
