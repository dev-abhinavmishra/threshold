# THRESHOLD — session handoff prompt

Paste this into a fresh session to continue the autonomous sprint work with full
context. Keep it updated when conventions change.

---

```
You are continuing an autonomous multi-sprint build of THRESHOLD, an original
first-person browser horror game, in repo dev-abhinavmishra/threshold on PR #1
(branch devin/1790826595-threshold-game, base main). DOORS/Pressure (Roblox) is
the visual quality bar — the user has rejected flat/blocky art twice; every
sprint should push density, realism, or gameplay depth. Do NOT stop at a plan
or a partial slice — each sprint must be huge, tested, and pushed.

STACK
  TypeScript strict + Vite 5 + React 18 + Three.js 0.170 + Zustand + Vitest +
  Playwright 1.48. Node 20. Repo at /home/ubuntu/repos/threshold (clone if
  absent). No CI — you run the gates yourself.

GATES (run before every push, in this order)
  npx tsc -p tsconfig.json --noEmit
  npm run lint                # eslint . --max-warnings 0
  npm test                    # vitest, ~63 tests
  npm run sim                 # 5-seed route sim; must stay corridor <~15%
  npx playwright test         # e2e (assets.spec guards every milled dir +
                            #   rigged figure; add new dirs to MILL_DIRS)
  npm run build
  Commit style: "sprint NNN: <summary>". Push to the PR branch. Never break
  main; 'stable-pre-rehaul' tag is the restore point.

KEY CONVENTIONS (hard-won — do not relearn by trial)
- window.__thresholdGame exists in DEV and in ANY build with ?debug in the
  URL (prod preview included) — e2e uses /?debug to drive damagePlayer(),
  victory(), enterUnderscript(), teleport() directly. Private TS fields are
  reachable at runtime (g.renderer.info, g.streamer.get(i), g.space).
  player.pos/vel are plain {x,y,z}; player.teleport(x,y,z,yaw) exists.
  Player spawns facing +z; forward = (sin yaw, cos yaw); WASD works without
  pointer lock.
- Checkpoint save: localStorage 'threshold.run.v1', shape CheckpointSave
  {seedText,difficulty,roomIndex,underIndex,inUnderscript,health,imprints,
  marginalia,inventory:[{id,count}],stats:RunStats}. Use health:100 for
  screenshots (low health draws a vignette). Seed via page.addInitScript —
  NEVER page.reload() after seeding.
- Settings: 'threshold.settings.v2' needs version:2; quality 'low' for
  SwiftShader screenshots ('high' times out). Viewport ~700-880px wide, ~360px
  tall. Prod preview screenshots work at 'low'; dev-server screenshots time
  out — use evaluate() on the scene graph instead.
- Chrome for e2e needs --use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader; import 'playwright-core' not 'playwright'.
- Room-local → world: rotate offset by room.yaw via
  {x:x*c+z*s, z:-x*s+z*c} (c=cos yaw, s=sin yaw).
- QA seed: 'qa' + the "QA (22 rooms)" menu chip → compressed route hitting all
  milestones, reduced Pursuer speed. Route dumps:
  npx tsx -e "import{generateRoute}from'./src/world/generator' ..."
  (run scripts through a file, tsx -e has module-resolution quirks with the
  .ts extension import).
- Entities: tuning in src/game/config.ts ENTITY_TUNING; ambient scheduling in
  scheduleEncounters (src/world/generator.ts) with an exclusion list for
  milestone-only ids; tiers in src/world/pacing.ts (ENTITY_TIER, planBeats).
  Underscript has its own scheduler (~line 1035).
- Rigged figures: riggedFigure(kind) in src/entities/rigged.ts — 17 RigSpecs
  over 16 Quaternius GLBs in public/assets/figures/. Returns
  {group, play('idle'|'move'|'attack'), update(dt)} or null until loaded —
  callers must fall back to tallFigure() and tick rig.update(dt) per frame
  (Game does this via userData.rig on entityGroup children).
- Doors: every doorway has TWO leaves (room N's 'door-N-in' + room N-1's
  'door-(N-1)-out-{wall}{offset}', mirrored rotation). Door records live in
  room.doors: entry 'door-{i}-in', branch toll 'door-{i}-b{e}' (leaf is on the
  parent's out port — resolve via spec.exits[e]). Lock hardware is attached at
  runtime by Game.syncLockHardware — locked → 'doorChain' mill model,
  lockId==='toll' → 'tollPlate'; auto-removed when d.locked clears.
- Props: PropKind union in src/world/spec.ts; every model needs a modelLibrary
  entry {dir,height,collider,anchor}. 'anchor:center' = wall/hanging mount.
  glTF +z faces into the room (Blender +y 'into wall' → glTF -z).
- wallProps yaw: west=+PI/2, east=-PI/2, north z-side=PI. WALL_MOUNT_Y gives
  default y for center-anchored wall pieces.
- Blender mill: /home/ubuntu/blender/blender (not on PATH).
  blender -b --python tools/mill/prefab_kit.py -- <kind|ALL> <outdir>
  outputs model.gltf+model.bin per piece; vendor into
  public/assets/models/<name>/. Materials: STONE/DARK/WOOD/IRON/WORN/CLOTH/
  BRASS globals set in init_mats(); register each piece in PIECES.
- Assets are CC0 ONLY: ambientCG PBR textures, Poly Haven GLTFs
  (scripts/fetch_ph.py <slug>), poly.pizza/Quaternius rigged figures, mill
  originals. Catalogue every fetch in ASSETS.md + docs/THIRD_PARTY_ATTRIBUTION.md.
- Perf rules: room builder merges every unnamed, unanimated prop into
  per-material meshes (the 'bake') — name a prop group (xxx-N) or set
  userData.anim anywhere in it to keep it live. Room lights mark ONE
  light userData.shadowEligible; Game enables castShadow only in the
  player's room (a point-light shadow is 6 scene renders). Never enable
  castShadow on more lights.
- renderer.info under the composer reads only the last pass — set
  info.autoReset=false + info.reset() + wait a frame to count real calls.
- e2e suite: playwright.config serial (workers:1), retries:1, 90s timeout.
  assets.spec = served-asset check; runflow.spec = death/retry, checkpoint,
  underscript, victory via ?debug handle; soak.spec = 15s gameplay walk (runs
  last alphabetically). Context-setup stalls and tab crashes are software-GL
  flake — retries absorb them; orphaned chromium browsers from killed probe
  scripts accumulate and starve the box, kill strays by PID.
- pkill -f 'vite' will kill your own shell — match more narrowly or use
  lsof -ti:PORT | xargs kill.
- Do NOT pkill node/playwright broadly; scripts are short-lived anyway.

DOCS (read when unsure — they're maintained per the rehaul brief)
  docs/QUALITY_AUDIT.md, docs/REHAUL_PLAN.md, docs/REHAUL_REPORT.md,
  docs/ROOM_TAXONOMY.md, docs/QA_CHECKLIST.md, docs/KNOWN_ISSUES.md,
  docs/THIRD_PARTY_ATTRIBUTION.md, docs/BALANCE.md, docs/SCARES.md,
  docs/enemies/<name>.md for each meaningful entity.
  Any major system change gets a REHAUL_PLAN entry (why/preserve/replace/
  architecture/tests/regressions) before the code lands.

CURRENT STATE (as of ~sprint 205)
  101-room run + 121-room Underscript, 19 entities, authored milestones
  (Index 50, Custodian 51, Lens 75, Engine 100, chases), hiding/Panic,
  economy (imprints/marginalia/toll doors — payouts halved sprint 198, sim
  prints income-vs-cost per seed), synthesized audio + captions,
  PBR textures + ~76 milled props + 17 rigged figures, decal wear system,
  beat-planner pacing, debug panel. Ambient Curator scheduled post-Index.
  Locked/toll doors wear milled hardware synced to door.locked.
  Corridor runners + Curator emit positional footstep foley; SoundEvent has
  optional 'source' field (listeners skip self-noise).
  Sprint 201 corridor dressing pass: conduit/vent/exit-sign/keyRack/
  extinguisher anchors on all 7 corridor templates + seeded wetFloor/
  hangingCable/radiator variety; WALL_MOUNT_Y gained keyRack, exitSign,
  wallVent, extinguisher, fireAlarm.
  Sprint 202 service-wing mill batch: cageLocker, bellCart, teaTrolley,
  bedBench, radiatorTall, linenHamper, basinSink, pegRail, towelRail,
  ceilingHook, ovalMirror (mirror variant) — dressed into 20 templates
  incl. dormitory locker bank, reception/foyer bell carts, morgue +
  fabshop hoist hooks, laundry hampers, bath anteroom basins;
  WALL_MOUNT_Y gained pegRail + towelRail.
  Locked-drawer imprint floor fixed (15–30, was 8–22 vs test floor 15).
  Sprint 203 chase-sequence e2e: sim-drives frame() (renderFrame noop +
  clock.tick→1/30) through real interaction paths — QA run, debug-jump to
  chase-1 door-front, sim-walk in (Pursuer spawns on entry), sim-walk to
  seal room (Pursuer despawns). Door focus needs pitch aimed at leaf
  center (y+0.6) — level aim fails the 0.86 align gate; E only fires on
  /door/ prompts (adjacent hide spots out-focus leaves); pinned-walker
  fallbacks open pos-clusters and step teleports past prop pinches.
  e2e covers: asset-served, menu/HUD/settings/archive, death→retry, quit→
  Continue, underscript descent, victory screen, chase spawn+seal, 15s soak.
  Sprint 204 door-lane clearance: real bug found by the chase e2e — props/
  hiding spots could land inside a door's approach lane and pinch an open
  doorway. inDoorLane(spec,x,z,r) is the lane test (strip -0.4..2m into the
  room, port.width/2+0.6 wide + r); clearDoorLanes(spec) filters spec.props
  (y<=1.9 only — above-lintel mounts are fine) + spec.hiding at instantiate;
  builder drops any built prop whose non-walkable collider footprint reaches
  a lane (catches wide props centered beside the door); foreshadow tells and
  injected corner hide spots lane-guard at push time. Regression test
  sweeps all seeds: no spec prop/hiding in any lane.
  Sprint 205 entity feel: REAL BUG found in flickerRoom — 'sweep'/'reprise'/
  'dim' wrote l.intensity via setInterval but the per-frame light loop
  recomputes intensity from userData.baseIntensity every frame, stomping
  the flicker within ~16ms. flickerRoom now writes baseIntensity (flicker
  is visible, 'dim' persists). dimmedRooms caps 'dim' to once per room per
  run (no compounding to darkness). Corridor warn front is now AUDIBLE:
  floor-creak every ~3.5m of front travel + door-rattle '[the door
  shivers]' when the front reaches the player's entryPos (thresholdTravel
  = path distance to rooms[cur].entryPos). Near-miss variety: seeded pick
  of 3 variants (door-test taps / stops-listening 2.3s / breathe 1.2s) +
  'saw the door close' strong variant when player hid <1.6s ago (except
  maelstrom) + scheduled second 'knock' touch. Arrival dim on spawn:
  lurker, inkling, echoskin, margin, stillframe, singer (skipped subtle
  entities — witness/redactor keep stealth). Entity unit tests exist in
  test/entities.test.ts — makeCtx + fakePlayer harness, ctx.cue mock.

NEXT SPRINT IDEAS (pick the biggest first)
  - Lamp emissive on 'dim' rooms: flicker-branch lamps still pulse emissive
    at old level while light dims — sync lamp glow to effective intensity.
  - Remaining entity-feel gaps: whisper/margin could use positional
    misdirection cues; husk stir could drop the room's tone bed briefly.
  - Economy: economy is now ~5x coverage — if playtests still feel rich,
    raise vend prices or trim loot weights rather than payouts again.
  - Milestone-only entities stay authored-only (pursuer/hazard); ambient
    scheduling is done for everything else.
  - Perf: SSAO pass is the next multiplier after the shadow fix — consider
    restricting SSAO to 'high' only when fps allows, or half-res.
  - e2e: hiding-spot coverage still missing (hide-in/leave via sim-drive,
    same pattern as the chase test).
  - More mill batches if dressing still reads thin: curtain variants,
    upholstered headboards, kitchen/scullery kit, stacked-linen shelves.
```

---
