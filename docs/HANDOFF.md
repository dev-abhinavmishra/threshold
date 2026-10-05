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

CURRENT STATE (as of sprint 213)
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
  Sprint 206 hiding-spot e2e (sim-drive): teleport 1.1m room-side of an
  untrapped spot's exitPos, aim+press until /hide/i prompt fires, assert
  protection==='hidden', then spawnById('sweep') WITH godMode OFF — the
  runner's pass must complete and the hidden player survives (protection
  proven live, not vacuous), then leave via /leave/i prompt. NOTE: done
  entities are disposed AND removed from g.entities — wait for
  spawn-then-absent, not state==='done'. e2e covers: asset-served,
  menu/HUD/settings/archive, death→retry, quit→Continue, underscript
  descent, victory, chase spawn+seal, hiding enter/protect/leave, soak.
  13 tests.
  Sprint 207 lamp-emissive + presence: flicker-paired lamp glow now scales
  l.intensity/origBaseIntensity (new builder userData) so 'dim'-settled
  rooms' fixtures actually go half-glow (was pulsing full emissive — a
  sprint-205 leftover). audio.duckRoomTone(seconds,level) dips the biome
  bed with restore scheduled on the AudioParam timeline; ctx.duckTone?
  exposed to entities — husk stirs (2.6s) + bellows (5s) gulp the room's
  ambience. Margin emits 'margin-rustle' positional cues from the
  MIRRORED edge while closing unseen (audio lies about which side).
  Tests: margin rustles ≥2 positional + husk duckTone on crowd-stir.
  Sprint 208 full lamp pairing + more tone ducks: REAL BUG — the sconce
  PointLight was pushed into built.lights with no userData.baseIntensity,
  so the ambient loop wrote NaN into its intensity every frame. Fixed at
  creation. Every built light now pairs to its spec-aligned lamp mesh
  (lampMeshes index-aligns with spec.lights; lights[] is a re-sorted
  slice — pair via l.userData.ls identity, per-light material clone,
  skip userData.anim meshes which have their own lightRef coupling).
  Ambient loop writes glow for ALL paired lights incl. dead rooms →0.02.
  More duckTone callers: corridor door-rattle arrival (1.8s), stillframe
  snap (1.4s), hollow grapple (2.2s).
  Sprint 209 glow-decal sync: shafts/pools/sconce throws now live in
  built.shafts (sconce decals moved in — shafts declared beside
  lampMeshes/lights) tagged userData.lsRef or lightRef; ambient loop
  lazily resolves each to a light and scales material.opacity by
  intensity/origBaseIntensity — 'dim'/'break'/telegraph visibly drains
  fake-volumetrics + sconce spill, not just lamp glow. Dust motes thin
  by the room's mean light mul (0 when blackedOut). NOTE: THREE
  material.clone() JSON-serializes userData — never store Object3D refs
  before a clone; set lightRef AFTER cloning (see poolMat2).
  Sprint 210 hollow-trap + panic-eject e2e: QA short runs use a random
  seed — pin one (g.startRun({seedText:'trap-seed-7'}) inside evaluate,
  re-stub renderFrame after; the patched clock tick survives startRun).
  Traps only roll on rooms index>=12 with >=2 spots at 30% — probe seeds
  before pinning. Eject path: panic decays hard during the runner's warn
  phase (0.15/s), so pin g.player.panic=0.999 per frame and the first
  engage-within-30m frame crosses 1 -> panicEject. Assertions prove the
  sweep really engaged within 30m (engage+near tracked per frame).
  14 e2e tests.
  Sprint 211 powered-emissive audit: deviceMul = dead?0:min(1,roomMul)
  scales mains-powered glow — blink/screen/tv-live anims multiply
  emissiveIntensity; new 'device' anim kind for static powered emitters
  (GLB lit fixtures minus open flame, floor-lamp bead, machineBox /
  printerRow / vending LEDs — each material-cloned + baseEm stored;
  GLB clones share materials so clone BEFORE tagging/writing). Fire
  (flame), exit signs, alarm domes, boiler pilot, window night-glow
  stay lit — not mains-powered. 'dim' flicker rides wall-clock
  setInterval — sim-drive can't wait it out: await setTimeout ~900ms
  inside evaluate. GOTCHA: playwright webServer serves a PREBUILT
  dist/ (build && preview, reuseExistingServer) — after editing src,
  kill the :4173 preview or the suite runs yesterday's bundle.
  16 e2e tests.
  Sprint 212/213 held viewmodel: `HeldView` (src/game/viewmodel.ts) —
  EVERY equipped slot item shows in-hand low-right (per-item pose +
  mesh: GLB for lamp/lighter/watch, procedural for the rest, vmFallback
  stand-ins hot-swap to the GLB when the preload drip lands it), a
  procedural gloved hand (fist or palm grip per item) wraps it; lit
  lamp overrides the equipped slot so the beam has a source. Look-lag
  (exponential yaw/pitch smoothing, ±0.16/±0.12 rad, sway group), gait
  bob by ground speed + idle breath, equip raise (0.32s ease-out cubic
  y/roll/dip), per-item use motions (jab/key-twist/drink/tilt/crank —
  vm-crank group spins), interact thrust (0.32s 0.07m lunge, fired in
  tryInteract → heldView.thrust()), peek hides. Beam cones + dust motes
  anchor at heldView.tipWorld() (item tip), and beamFade=
  clamp((dist(eye,tip)-0.12)/0.25) multiplies beamMats+motesMat so
  lag-swings can't smear the cone across the near plane.
  LEARNINGS: (a) the lamp key path needs inventory handLamp/pulseLamp
  count>0 — harnesses must set g.lampOn=true directly, toggleLamp?.() is
  a silent no-op; (b) modelInstance returns null until the drip-fed
  preload reaches that dir — UPGRADEABLE retries each frame and
  hot-swaps the fallback for the GLB; (c) spec.height normalizes by
  bbox Y and over-inflates models authored lying flat ×4+ —
  viewmodel.fitHeld() rescales by longest axis (0.26m), rotates
  longest→z, centers; (d) page.screenshot times out / the tab crashes
  under load — grab canvas.toDataURL() inside evaluate right after
  g.frame() instead (toDataURL is valid same-task, no
  preserveDrawingBuffer needed); (e) checkpoint-seed inventory via
  addInitScript(threshold.run.v1) instead of g.inventory.push —
  start() resets inventory async and will wipe a mid-boot grant;
  (f) heldView/beamGroup are created inside renderFrame — they don't
  exist under the stubbed renderFrame, probe only after a real frame.

NEXT SPRINT IDEAS (pick the biggest first)
  - Quality-mode scaling: lampMesh pairing + device tagging add material
    clones per emitter per room — check memory on long runs; share clones
    per room where the tag set is identical.
  - Economy: economy is now ~5x coverage — if playtests still feel rich,
    raise vend prices or trim loot weights rather than payouts again.
  - Milestone-only entities stay authored-only (pursuer/hazard); ambient
    scheduling is done for everything else.
  - Perf: SSAO pass is the next multiplier after the shadow fix — consider
    restricting SSAO to 'high' only when fps allows, or half-res.
  - e2e: remaining untested paths — maelstrom stabilize minigame, witness
    drain, underscript seep/clamor, toll-door purchase.
  - More mill batches if dressing still reads thin: curtain variants,
    upholstered headboards, kitchen/scullery kit, stacked-linen shelves.
```

---
