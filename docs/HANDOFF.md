# THRESHOLD — session handoff prompt

Paste this into a fresh session to continue the autonomous sprint work with full
context. Keep it updated when conventions change.

---

```
You are continuing an autonomous multi-sprint build of THRESHOLD, an original
first-person browser horror game, in repo dev-abhinavmishra/threshold. PR #1 is
merged — each new sprint goes on a fresh branch off main with its own PR (do
NOT keep committing to devin/1790826595-threshold-game). DOORS/Pressure (Roblox) is
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

CURRENT STATE (as of sprint 223)
  101-room run + 121-room Underscript, 19 entities, authored milestones
  (Index 50, Custodian 51, Lens 75, Engine 100, chases), hiding/Panic,
  economy (imprints/marginalia/toll doors — payouts halved sprint 198, sim
  prints income-vs-cost per seed), synthesized audio + captions,
  PBR textures + ~91 milled props + 17 rigged figures, decal wear system,
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
  doorway. inDoorLane(spec,x,z,r) is the lane test (strip -0.4..1.4+r deep,
  port.width/2+0.15+r lateral — the door-rect, tightened in sprint 215's
  fix: the old 2m/0.6 approach strip silently culled beds/headboards/
  dressers standing next to doors in guest-twin/standard/suite-split
  since sprint 204); clearDoorLanes(spec) filters spec.props (y<=1.9
  only — above-lintel mounts are fine) + spec.hiding at instantiate;
  builder drops built props whose non-walkable collider AABB overlaps the
  door rect — footprintInDoorLane(spec,cx,cz,hw,hd), real half-extents,
  NOT the old circumradius (it killed beds ~4m from the leaf); foreshadow
  tells and injected corner hide spots lane-guard at push time.
  Regression test sweeps all seeds: no spec prop/hiding in any lane.
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
  Sprint 214 lamp-material clone diet — REVERTED by Devin Review F2 in
  sprint 215's fix pass: per-light writes are genuinely independent
  (baseIntensity jitter 0.88-1.14 at Game.ts, alternating sweep flicker
  writes 0.15x vs 1x), so a shared clone collapses same-source fixtures
  to whichever light wrote last. Back to one clone per paired light;
  kept: flickerRoom 'break' + blackoutRoom no longer re-clone/write
  emissive manually (the ambient loop's blackedOut branch writes 0.02
  next frame — those had also written to the SHARED cache material
  before). generation.test.ts asserts per-light clones ≠ each other and
  ≠ the MAT cache instance.
  Sprint 215 guest/scullery mill batch: 10 new pieces — curtainRod +
  curtainLong (fold-rib panels, pelmet/tie-backs), headboard (upholstered,
  brass finials), linenShelf (stacked folded linen), and a kitchen kit for
  u-break: stoveRange (replaces 'stove'), potRack, dishDrainer,
  choppingBlock, copperSet, manglePress. Dressed into guest-standard/-twin/
  -dormitory/-storage/-two-baths/-reception, suite-split, guest-suite-grand
  (wallProps kind lists), laundry-hall. WALL_MOUNT_Y gained curtainRod
  (1.1), curtainLong (1.18), potRack (1.6).
  LEARNINGS: (a) clearDoorLanes CULLS spec.props with y<=1.9 inside a door
  lane — a 6x6 u-break with opposing doors loses almost every low prop
  (chairs, center-ish furniture); first pass here silently dropped 6/6 new
  u-break props — verify placements reach spec.props in a real generateRoute
  dump, not just the template source; y>1.9 mounts always survive (potRack
  rides the exemption over the table, copperSet hangs at 1.95); (b) bed
  head = +z end of the 'bed' prop at yaw 0 — headboards sit ~0.2m behind
  that at yaw PI; (c) route.underRooms is a SEPARATE array from
  route.rooms — underscript probes must scan it (space==='under' rooms);
  (d) viewmodel swap/GLB-upgrade must free geometries via
  disposeOwned() — only vmGeo-tagged procedural geometries are owned;
  GLB clone children share the cached source's buffers, materials are
  MAT/module consts, neither is disposable; (e) heldView 'equipped' gate
  must mirror the HUD inventory filter (count>0 || lamps) or a drained
  item stays visibly held after the HUD already dropped it.
  Sprint 216 mechanics e2e (e2e/mechanics.spec.ts): sim-drive coverage
  for three untested paths — witness drain (face it → health falls ~14/s;
  break sight → drain stops), maelstrom stabilize minigame (real hide via
  interact path + spawnById('maelstrom') + stabilizeTriggered; rhythm
  hold closes it clean — still hidden, no damage — passive play eats
  failT>2.4 → 45hp + exitHiding), toll door (seed 'threshold' has
  door-5-b1/door-17-b1; too-poor refuses locked, 5 imprints pays 3 and
  opens the leaf). LEARNINGS: (a) stabilize's success signature is
  "still hidden + undamaged" — the runner despawns mid-minigame so its
  flag is unreachable; (b) minigame failT only accumulates while the
  needle is >0.42 off-center — passive fail lands ~15s, rhythm success
  ~10.5s — near-wire race by design; (c) full-route e2e needs a SEEDED
  'Seeded Run' (QA shortRun has no branch doors/late entities) — drive
  .seed-input via the native-setter + input event; (d) loot items near a
  leaf ('Take spark Flash') out-focus the door — press E on whatever is
  focused like a player would; (e) the runner entity is REMOVED from
  g.entities on done — re-spawn for a second leg rather than reusing the
  ref.
  Sprint 218 chapel/study mill batch (11 pieces, new gallery-chapel
  room): chapelPew, prayerKneeler, chapelAltar, votiveStand,
  candelabrum, settee, dressingScreen, vanityTable, sideboard,
  writingDesk, globeStand — all in tools/mill/prefab_kit.py (new mats
  wax/mirror/linen). New room gallery-chapel (11×14×5, gallery biome,
  weight 5, minRoom 28): twin pew blocks on a centre aisle, kneelers,
  altar + candelabra + votive racks in the chancel, arches, high
  windowArches. safe-sanctuary converted to the same kit (pews face
  the altar south — yaw flips with room layout). Dressing added to
  guest-standard/-twin/-two-baths/suite-split/suite-grand/reception,
  lobby-waiting, records-office/-bullpen, library-stacks, gallery-
  atrium/-banquet/-cathedral (14 templates total). LEARNINGS: milled
  pieces need PropKind entries in spec.ts + MODEL_FOR in modelLibrary
  + MILL_DIRS in assets.spec.ts + ASSETS.md table (4 registration
  points); solid-furniture hiding spots must be losAlcove/cabinet —
  underFurniture only under furniture with a real gap.
  Sprint 217 adaptive post budget (src/game/postGovernor.ts): fps EMA
  governor sheds post steps under sustained low fps — SSAO → bloom →
  render scale 0.7 — and restores one step at a time with hysteresis
  (2.5s continuous <45fps to shed, 10s >56fps to restore; any recovery
  clears the sustain counter so jank never banks a step). Passes toggle
  via pass.enabled (no composer rebuild); render scale writes
  renderer.setPixelRatio(base*mul) + composer.setPixelRatio/setSize.
  Steps ladder is built from the live pass set: 'medium' has no SSAO
  step, 'low' degrades to scale only. Settings.adaptiveQuality (default
  on) gates it — off restores everything at once. postGov.hardReset()
  on any quality-preset change. 6 vitest specs cover order/hysteresis/
  presets/disabled-reset. LEARNINGS: pass.enabled skips the pass in
  EffectComposer — no rebuild needed; EMA convergence lag (~4-5 samples)
  counts inside the sustain window, so thresholds are wall-time not
  sample-time.
  Sprint 219 mechanics e2e part 2 (e2e/mechanics.spec.ts, 6/6 passing):
  vend purchase (seed 'threshold' room 17 — feed at imprints<price
  refuses, exact pay charges + grants vendItem + sock.meta.taken),
  keyed-door round-trip (keyPairs[0] 13→14 — take doorKey from its
  socket, held 'Unlock Door N' consumes it, leaf opens), underscript
  descent/exit (ms-under-entrance @61 — 'Open Underscript passage'
  refuses while clamps<2, release both seal clamps + resonanceKey →
  enterUnderscript → space 'under' room 0; underExit on the deepest
  under-room → 'main' at underReturn 70, underscriptCompleted + free
  palimpsest). LEARNINGS: (a) page.evaluate bodies serialize into the
  page — module-scope helpers/imports are NOT reachable; inline all
  helpers per-evaluate and declare g with a full structural interface
  (module-level `interface ThresholdG` — types are erased so the cast
  survives serialization; bare `any` fails eslint, untyped callback
  params fail noImplicitAny on any-typed receivers); (b) stand on the
  room-INTERIOR side of a wall-hugging interactable — fixed world
  offsets (pos+1,+0.3) put the player inside wall colliders and the
  seal clamp never focuses; teleport pos→room.origin*1.15; (c)
  holdTime interactables fire on a plain E-press too — tryInteract()
  runs on interactPressed independent of updateHold; (d) the gate has
  TWO underEntrance sockets ('Inspect sealed passage' at entryPos y0
  AND 'Open Underscript passage' at the door) — either routes to
  UnderscriptGate.onInteract; (e) seal-clamp sockets are kind 'key' —
  one may carry contains:'doorKey' for the room's own lockId (clamp A
  at seed 'threshold' does), so releasing it also grants the key.
  Sprint 220 underscript mill batch (15 pieces, ~all u-rooms upgraded):
  cubicle, recordsCage, printerRow, printer, typewriter, waterCooler,
  breakTable, counter, machineBox, paperStack, partition, fluoroTube,
  exitSign, vendingUnit, keyCabinet — PropKind + MODEL_FOR + MILL_DIRS +
  ASSETS.md rows; u-templates referenced these kinds procedurally so
  milling same-named models upgrades every usage for free (partition is
  the losAlcove hiding propKind across the whole game). vend sockets in
  BOTH generator sites now push a milled vendingUnit beside the socket
  (lx+0.45 so the glass front aligns at the socket); keyCabinet dressed
  into u-corridor/u-server/u-lobby. LEARNINGS: (a) blender
  rotation_euler[1] is the DEPTH axis — a door hinge swings on [2] (Z);
  wrong-axis swings leak mesh past the collider; (b) joined meshes can
  keep a non-zero node translation — check node.translation + accessor
  bounds TOGETHER when sanity-checking extents; (c) narrow rooms
  (u-corridor) put generator-placed props inside door lanes — guard
  pushes with inDoorLane(spec,x,z); the interaction socket alone is the
  fallback (pre-batch behavior).
  Sprint 221 mechanics e2e part 3 (mechanics.spec.ts → 10/10): custodian
  shop purchase (imprints<price warns '[N imprints required]', exact pay →
  sock.meta.sold + 'purchased' + giveItem — handled inside
  CustodianEncounter.onInteract BEFORE Game.ts's switch, NOT the 'shop'
  case which is broker-only), broker trade (descend → u-lobby[0]
  pedestal, marginalia path), engine routing (teleport inside room-100
  AABB → enter() → phase relays; 5 relay pulls → routing; wrong board
  press resets routingStep + 'route rejected'; 3 timed presses → escape
  → isolator → stats.victory), under-draft seep caption near the sealed
  passage. LEARNINGS: (a) game captions are OFF by default
  (settings.captions=false gates emitCaption) — for caption assertions
  subscribe g.audio.onCaption AND set g.audio.captionsEnabled=true;
  (b) milestone onInteract intercepts before the kind switch —
  shop-flag conventions differ per path (custodian meta.sold vs vend
  meta.taken); (c) room-enter hooks need a REAL position change —
  pre-setting g.currentRoom makes prev===current and silently skips
  ms.enter(); teleport inside the room AABB and let currentRoomIndex()
  detect it; (d) boardShowing ticks inside the same frame() as the press
  — a press-on-match loop that re-reads each frame self-corrects across
  the 1.4s boundary (a rejected press resets routingStep, loop retries).

  Sprint 222 (mechanics e2e part 4 + three dead-mechanic resurrections —
  mechanics.spec.ts → 14/14):
  FOUND while scoping: three shipped-but-dead interactions, all fixed.
  (a) Index seal console — the 'puzzle' interactable was NEVER ADDED:
  IndexEncounter.onInteract has the whole glyph-submission branch but
  nothing creates a kind 'puzzle' interactable in the Index room, so
  cards → catalogue ended in silence. rebuildInteractables now adds an
  'Examine the seal console' interactable at the sealConsole prop's
  world position (same yaw math as the prop loop). (b) The sealConsole
  prop itself was also missing — authored dead-center at (0,-9.4),
  inside the entry door's swing lane, lane-culled at generation; moved
  to (3.6,-9.2). (c) puzzle-valve 'Examine mechanism' sockets pressed
  into nothing (kind 'puzzle' only handled inside IndexEncounter) —
  worse, fillSockets hides doorKeys INSIDE them (seed 'threshold': the
  lock-72 key sat in a dead interactable = REAL main-route soft-lock).
  New switch 'puzzle' case: crack the mechanism → steam mask + lure
  (same trade as prop valves) → resolveSocketLoot releases contents.
  (d) inDoorLane depth 2.0+r → 1.4+r: the spec-level lane was 2.55m
  deep vs the honest 1.4m leaf-swing zone footprintInDoorLane uses —
  it silently ate authored centerpieces ~2m inside door axes (the
  wake's bier + 2 candles restored; same root cause as the sprint-221
  u-lobby counter). Specs: index full chain (early catalogue refuse →
  5 cards → glyph order → wrong-press reset → 3 matched presses →
  'the Index releases you'), puzzle-valve crack → doorKey → lock-72
  opens, wake coffin 1.8s hold → doc-guest-bier, lens pylons (4 × ~75
  frames held KeyE → orrery.solved). LEARNINGS: (e) room.spec.props
  POST-generation shows what survived lane culling — diff vs authored
  template to find silently-dropped props; (f) playwright serves
  dist/ via reuseExistingServer — kill :4173 + rebuild after src
  edits or specs test a stale bundle; (g) drive() press loops must
  gate on the FOCUSED prompt (a bare E-press fires whatever is
  focused — card sockets near the console would eat presses).
  preload reaches that dir — heldTorchFallback retries each frame and
  hot-swaps the fallback cylinder for the GLB; (c) spec.height
  normalizes by bbox Y and over-inflates models authored lying flat ×4+
  — fitHeldModel() rescales by longest axis (0.26m), rotates longest→z,
  centers; (d) REAL BUG — beam cones smeared the whole screen during
  lag swings: origin tracked lagged torch pos and the cone crossed the
  near plane → beamFade=(dist(eye,origin)-0.12)/0.25 multiplies
  beamMats + motesMat opacity; (e) page.screenshot times out / the tab
  crashes under load — grab canvas.toDataURL() inside evaluate right
  after g.frame() instead (toDataURL is valid same-task, no
  preserveDrawingBuffer needed); (f) heldGroup/beamGroup are created
  inside renderFrame — they don't exist under the stubbed renderFrame,
  probe only after a real frame.
  - Mill: plated foods + pew rows + ceiling roses landed on main;
    remaining open kit — grand staircase pieces, arched window tracery.
  Sprint 223 lane-cull systemic refactor + prop re-placement: found via
  the sprint-222 audit — the center-based lane corridor (r=0.55) was
  still silently eating authored props whose centers sat inside it even
  though their real colliders never reached the door rect, while the
  builder's footprint check culled others the spec-pass let through.
  Now split honestly: clearDoorLanes(spec, isGhost?) drops a prop only
  when its CENTER lands inside the door rectangle itself (r=0 reach —
  ~70u-dead-center pieces are the only kills), ghost kinds
  (archways/transoms/wall dressing, collider[0]===0 via modelCollider)
  are never culled at spec level, and the builder's
  footprintInDoorLane owns everything else. ~50 authored props that
  GENUINELY covered doorways were re-placed by hand to clear their real
  footprint (ms-lobby front desk cluster z 2.6→1.5, custodian shop
  counter cluster −0.6z, wake coffin z 3.4→2.0, chapelAltar 5.6→5.0,
  all the counters/cages/printerRows/cubicles, ironGates ±1.4→±1.9,
  portcullis+hatch in the narrow service corridors, partition-maze
  spots made lane-safe under both orientations). Test rewritten to the
  honest rule: no solid prop collider reaches a door rect (footprint
  via modelCollider/buildProp), hiding spots still keep the deep lane.
  tools/verify_lanes.ts (from main's parallel work) also sweeps
  DROP/ORPHAN/CLIP/CLASH per template × seed — run it after editing
  template props.
  78 unit tests.
  Sprint 224 main-route corridor mill pass: corridors were the last
  big procedural-looking surface. 12 new milled kinds — wall-skin
  trim (pilaster, wainscotRun, corniceRun, wallPanel, beamRun,
  wallLantern, doorSurround, pierMirror) + floor pieces
  (runnerRug, grandfatherClock, consoleTable, newelPost). New
  corridorTrim(w,d,h,opts) helper lays out a pilaster-grid rhythm
  (1.9m bays) with wainscot + cornice + wallPanel fills per bay and
  opts {skipW/skipE, beams, lanterns, panels} — dressed across all
  10 corridor templates (corr-straight/wide/l-turn/zigzag/junction/
  grand-hall/closet-branch/doors-row + unlit-hall + laundry-hall).
  Floor pieces lane-verified by geometry (clocks 1.18m visual vs
  0.62m collider — pediment overhang is cosmetic-only).
  propsClash gained a TRIM_KINDS exemption: trim kinds are the
  wall's own face — panelling behind furniture is intended
  layering, not a collision (a pair-whitelist would need ~30
  entries). corr-doors-row adds 4 doorSurrounds at bay centres
  (pilasters sit at bay edges — never co-locate). runnerRug yaw=π/2
  turns its long axis along the corridor (glTF X-long → world Z).
  NewelPost milled but unplaced — belongs to the staircase kit.
  78 unit tests.

  ENV TRAP (sprint 224): under SwiftShader on this box,
  renderer.render()/composer=null on a BUILT streamer room
  deterministically kills the page for heavy rooms (corr-doors-row
  crashed 5/5 tries; every individual mesh renders fine; standalone
  GLTF renders fine; geometry/index/drawRange scans all clean —
  cumulative-load env limit, not a content bug). Use standalone-
  piece renders (contact sheet) or the testing agent's pipeline;
  don't bisect in-room renders expecting a bad mesh.

  Sprint 225 staircase kit + gothic tracery: 3 new milled kinds —
  grandStair (10 treads w/ nosings, closed stringer fascia, velvet
  carpet, turned balusters, swept handrail, bottom newel — a 3.0m
  show flight), traceryWindow (twin lancets + mullions + interlaced
  arch head + trefoil cluster, wall-mount), roseWindow (ring + 8
  spokes + centre boss, wall-mount). Both window kinds joined
  TRIM_KINDS (wall-skins). Placed: corr-grand-hall stair + rose
  terminus; gallery-atrium stair + 2 roses (ropeBarrier + globeStand
  relocated — the stair's 1.79x4.81 footprint is the biggest prop in
  the game); gallery-cathedral 2 roses + 4 tracery; gallery-chapel
  rose + 4 tracery; gallery-mezzanine 2 newels at the stair foot
  (balustrade is 3.0m wide — newels can't sit on the rail line).
  'stairs' prop rebuilt: nosing lips, stringer skirts, brass handrail
  (collider unchanged). Mill traps learned: ring_seg/from_pydata
  objects keep origin at world 0 — euler-rotating the OBJECT swings
  geometry on a huge arc (don't rotate ring_seg outputs); slope-
  rotated boards use rotation_euler[0]=-atan(rise/run) for low-front/
  high-back. 78 unit tests.

  Sprint 226 underscript weathering pass: the 121 under-rooms reuse
  ~15 milled kinds — per-instance decay is the "variants/weathering"
  depth layer. builder.ts now weathers under-rooms at build time:
  - fluoroTube/exitSign props: ~12%/8% dead (shared DEAD_TUBE_MAT,
    still merges per room), ~30%/18% dying (cloned emissive mat +
    'flicker' anim coupled to the nearest spec.lights entry via
    lsRef — Game resolves lightRef lazily, same as fixture flicker),
    ~12% of live tubes hang snapped (group.rotation.z tilt — ghost
    colliders, so always safe).
  - Milled GLB mats carry no emissive: the lit face is the 'wax'
    material bucket (tubes / legend strokes). Dying clones it and
    sets emissive (fluoro ivory / sign red); procedural fallbacks
    still match on emissiveIntensity>0.05.
  - U_JITTER: desk/floor pieces sit askew per kind (paperStack/
    typewriter ±0.5, waterCooler ±0.25, printer/breakTable ±0.08).
  - paperStack ~15% spilling lean (rotation.z).
  - Paper litter drift: 1-3 spots/room, 3-6 sheets each, merged to
  ONE paperOld mesh per room (+1 draw call), lane-guarded via
    footprintInDoorLane. Floor stains already existed (stainP 0.8).
  - clone(true) on GLB instances shares materials — safe to REPLACE
    mesh.material, never mutate a shared instance.
  79 unit tests.

NEXT SPRINT IDEAS (pick the biggest first)
  - Perf audit follow-up: sconce decal clones (throwMat/poolMat2 per
    sconce) and per-device prop clones (LED/screen/button) stay — each
    carries per-light/per-seed data; a per-room audit of clone counts on
    long runs is still open (measure via renderer.info.memory? no —
    enumerate scene.traverse materials).
  - Economy: economy is now ~5x coverage — if playtests still feel rich,
    raise vend prices or trim loot weights rather than payouts again.
  - Milestone-only entities stay authored-only (pursuer/hazard); ambient
    scheduling is done for everything else.
  - e2e: remaining — merchant/alarm/tv/clock/hearth prop interacts,
    underRooms beyond lobby depth (u-room exit/backtrack path), hiding
    spot enter/exit + trap reveal, document pickup → codex UI.
  - More mill batches if dressing still reads thin: main-route sideboard
    variants + corridor furniture; u-room kit is milled now (sprint 220) —
    next under-room depth is variants/weathering, not new kinds.
    Grand staircase kit + tracery done (225); u-weathering done (226) —
    next under-room depth is authored variants, not systems.
```

---
