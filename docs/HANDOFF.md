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

  Sprint 227 prop-interact e2e (e2e/props.spec.ts, 5 specs): closes the
  remaining interact coverage — ambient props across the route
  (tv/clock/hearth/window/cooler/typewriter/printer/phone/seat each
  driven through the real focus+hold pipeline until its journal Set
  grows), washer two-stage cycle (run -> ~24s thump -> ding -> empty
  pays out), armed mousetrap pried, hiding enter/exit + hollow trap
  (clue text in the prompt, Hollow spawns on entry, leave = struggle
  mash until the grip breaks), document socket -> codex. Harness notes:
  prop interacts only register for NON-safe templates, and enter()
  hooks still need a real position change — teleport into the room
  before expecting liveTraps/interactables. Prompt targets iterate
  every room carrying the kind since individual props can be
  lane-culled or inside a safe template.

  Sprint 228 material-clone audit (tools/audit_materials.ts): builds a
  ~50-room slice per seed and reports meshes/mats/anim per biome — run
  `npx tsx tools/audit_materials.ts [seed...]` after touching props.
  Baseline ~27-34 mats/room, ~1400 material instances per 50-room
  slice. The offender: serverRack cloned 35 LED materials per rack.
  Fix: 'blink' is seeded, so LEDs sharing (clone, seed) render
  identically — pooled per row (7 clones/rack, a whole row blinks the
  same fault code); 'device' anims carry no per-mesh seed, so
  machineBox/printerRow/controlPanel LEDs now pool by source material
  exactly. u-server peak 44→33 mats, ms-engine 55→46, slice total
  -3%. Regression guard: rack = 35 LEDs / 7 material clones.
  80 unit tests.

  Sprint 229 ear-to-the-seam: crouch at a closed door's edge and a
  'Listen at Door N' point appears ~0.55m off the leaf (priority 4,
  holdTime 1.1) — position-disambiguated so door-centre still reads
  Open and crouch+quiet-open survives. Hold it: probes 1.7m through
  the leaf (roomBeyondDoor → pointInRoom on spec.width/depth) and
  reports honestly — scheduled entity → its own audio vocabulary
  (LISTEN_CUES map at Game.ts:64), safe landing → [still air], dark
  room → [stale air], deep door → cold draught, false door / dead
  wall → [dead air — nothing behind it]. Journals into
  `listenedDoors` Set. Registration lives in
  addCrouchedDoorInteracts (player/interaction.ts) — extracted from
  Game.ts so vitest can drive it directly; also covers peek now.
  E2E harness note: the seam interactable only exists while
  crouched — hold KeyC before looking it up. 81 unit tests.

  Sprint 230 connector-corridor dressing: the jittered-milestone gap
  corridors (room.connectorIn, builder.ts ~2070) were bare floor +
  2 walls + ceiling. Now dressed in room-local space per straight
  segment: 2.2m pilaster bays with wainscotRun/corniceRun fills on
  both walls, alternating wallLanterns on runs >4.5m, a runnerRug
  when len>3.2, and a doorSurround framing each segment end
  (portal-into-corridor). Verified positions numerically: 131 wall
  pieces sit exactly 1.16 off-axis within bounds on the 47.5m elbow
  connector. GOTCHA for tests/probes: connTrim-* groups survive as
  NAMED shells but their meshes are harvested by the room's second
  static merge (builder.ts ~2240 — traverses the whole group, pulls
  any non-animated Mesh into shared-material buckets) — so assert
  group names + positions, not mesh counts, and Box3 over corr is
  empty. Same reason vitest/node sees 0 meshes: GLB kinds have no
  procedural fallback, empty until the model cache fills. Connectors
  are rare per seed — 's'/'threshold' have ZERO connectorIn rooms;
  'ash-vault-101' has 3 (longest ~47.5m). 82 unit tests.

  Sprint 231 noise rouse: loud player noise now wakes dormant scheduled
  encounters through closed doors. engine/noiseRouse.ts holds the pure
  rules (noiseCanRouse: intensity>=0.55, player-ish categories only, no
  entity-sourced or entity-cue feedback; withinRouseRadius: loudness*14m).
  Game subscribes once in the ctor → onRouseNoise scans ALL built rooms'
  doors (the door into room N is door-N-in owned by N, not the host's).
  On rouse: ScheduledEncounter.roused=true, the leaf visibly shudders
  (doorTry), the entity answers with its LISTEN_CUES sfx + ROUSED_LINES
  agitated caption, and a quiet entity-cue re-emit lets Curator hear the
  stir too. listenThrough reports the agitated variant. updateDoors
  pre-spawns roused encounters at openT>=0.6 via spawnRousedThrough —
  the entity is live before the player crosses in (spawned-set dedupe
  vs spawnScheduled). E2E: sprint strides beside door-12-in on seed 's'
  rouse the sweep; the spec also flips d.opening and asserts the entity
  exists without entering room 12. 83 unit tests.

  Sprint 232 the Bellman: first TRAILING entity — everything before was
  room-bound or a scripted corridor pass. Game now records playerTrail,
  breadcrumbs of player.pos every 1.15m (cap 160, shift notifies entities
  via Entity.trailShifted() so trailing cursors stay aligned). Bellman
  (src/entities/bellman.ts) spawns at the trigger room's entry door —
  behind the player — and walks the crumb trail at 2.1m/s (< walk 3.4,
  so it only catches a lingerer). It reads crumbs from the LIVE head at
  spawn (crumb = trail.length-1), not the run's start — an earlier draft
  indexed crumb 0 and it marched back to room 0. Closed doors in reach
  get a latch-rattle knock then d.opening=true 0.85s later. Direct gaze
  (LOS + facing + <11m) freezes it; 2.6s cumulative watch yields it —
  '[it folds back into the hall]'. Safe-room crumbs stall it at the
  threshold ~5.5s then it quits. Trail exhaustion starves it out (~9s).
  Touch kill uses playerExposed at killRange 1.05. Scheduled generically:
  tuning minRoom 16 maxRoom 74, biomes corridor/guest/records/gallery/
  maintenance/unlit, tier 2, incompatible with sweep+reprise, gated by
  hasSurvivalOption, FORBIDDEN_IN_MILESTONE. 's'/'ash-vault-101' roll no
  bellman; 'threshold' gets @35 and @55. Rig = monkroose + brass bell cone.
  SAFE_ROOM_TEMPLATES moved Game.ts → config.ts so entities can read it.
  87 unit tests, e2e props.spec 8/8 (spec on 'threshold': spawn at
  door-35-in, follows crumbs through 2 rooms, yields under gaze).

## Sprint 233 — the Porter (lintel ambusher; pitch-axis counterplay)
*First entity that lives above the sight line — clings inside the room's
airspace just over the exit door surround and drops on anyone who lingers
beneath it unlooked. The counterplay is the only mechanic in the game that
asks for a deliberately upward gaze: pitch up at the header and hold ~0.9s
to make it withdraw. Together with the Bellman (trails behind) it brackets
the player's two blind spots — behind and above.*

- `src/entities/room.ts` `Porter` — header point = next room's `-in` door pos
  + inward offset toward the host room's origin (0.5m, y 2.3). Mesh: ninja
  rig (fallback tallFigure h=1.0 hooded/tattered), head-down pose (rot.x
  0.55, scale 0.8). Dust tells every 4–8s ('dust sifts down', moth-flutter/
  hide-creak sfx + critter emit). Drop when player lingers <0.95m under the
  door >0.5s unlooked → damagePlayer(60) + '[it drops — from above]' + done.
  Gaze: lookDir·to > 0.62 AND dir.y > 0.1 (dot alone lets a LEVEL gaze spot
  it from ~6m for free — the upward pitch is the deliberate verb) + LOS via
  room losBlockers; 0.9s holds → '[something withdraws above the frame]'.
  Leaves on room-change or 70s expire ('[boards settle overhead]').
- TRAP (vitest caught, real bug): the lintel blockers span y 2.15–2.9 in the
  wall plane — a header point inside them is NEVER visible by LOS. Cling at
  y 2.3, 0.5m inside the room airspace toward the room origin instead.
- TRAP 2: entities.test.ts fakePlayer.lookDir hardcoded y=0 — a pitched gaze
  was impossible in tests. Now matches controller.ts (sin/cos(pitch)).
- Plumbing: EntityId 'porter'; tuning warningTime 0.8, damage 60, seeRange 9,
  cooldown 8, spawnChance 0.3, minRoom 20, maxRoom 74, biomes corridor/guest/
  records/gallery/maintenance/unlit; ENTITY_TIER 1; FORBIDDEN_IN_MILESTONE;
  LISTEN_CUES ('[drips of dust — something clings overhead]') + ROUSED_LINES
  ('[the dust pours — it is already above the door]'). NOT in hasSurvivalOption
  — it damages, it cannot kill (non-lethal like HazardField).
- Seed rolls: 's' @29,53; 'threshold' @39,54; 'sim-seed-01' @33,46,56.
- e2e props.spec 'porter waits above the lintel' — two-phase: linger under
  header unlooked → drop caption + done; second scheduled room → look-up
  hold → 'withdraws' caption + done. godMode blocks damagePlayer too, so
  assert on captions/state not health.
- Gates: tsc, lint, 90 vitest (+3), 5-seed sim, playwright porter spec, build.

## Sprint 234 — the Warden (corridor patrol; whistle + last-seen charge)
*The missing patrol archetype: runners pass through and are gone, the Warden
STAYS — pacing a corridor/gallery/records room's spine between its doors at
1.4m/s, pausing 1.6s at each end to scan. Crossing the room openly gets you
whistled and charged; the counterplay is timing the back-turn or breaking
line of sight mid-charge.*

- `src/entities/corridor.ts` `Warden` — patrol endpoints = host room's
  entryPos/exitPos; sees you when same room + d<9 + unhidden + LOS clear +
  inside its walk-facing cone (dot>0.3, skipped under 1.6m). 0.35s in view →
  'alarm-ring' whistle (entity-cue emit intensity 1.0 — rouses the floor)
  → charge at 3.5 → strike at <1m: damagePlayer(40) + back to patrol.
- REAL BUG the e2e caught: the blind charge chased the player's LIVE pos —
  hiding didn't help, it struck players at their hiding-spot exit. It now
  tracks `lastSeen` (v3copy'd only while canSee true): break LOS → it runs
  to where it lost you → 2.2s blind → '[the whistle dies — it resumes its
  walk]' + 1.4s re-spot grace. Hide genuinely works now.
- TRAP: ENTITY_TUNING map order IS scheduling priority — the scheduler rolls
  each entity per room in declaration order with first-success break. Warden
  appended at slot 21 got ZERO rolls on 7/8 seeds (every earlier entity ate
  the rooms first). Moved to just after `reprise` — now rolls 1–2 wardens on
  7/8 seeds ('s': @33 records-office, @66 gallery-vaulted). Any future entity
  should be placed by how much competition its biomes tolerate.
- TRAP 2: fake `hiddenSpot = {id}` crashes frame() — real spots carry
  pos/exitPos; use `room.hidingSpots[0]` in e2e.
- Fast encounters: spot→whistle→strike lands in ~2s total — e2e must react
  per-frame from spawn, not settle 60f first.
- Plumbing: EntityId 'warden'; tuning warningTime 0.5, speed 1.4, damage 40,
  seeRange 9, cooldown 8, spawnChance 0.3, minRoom 22, maxRoom 74, biomes
  corridor/gallery/records; ENTITY_TIER 2; FORBIDDEN_IN_MILESTONE;
  INCOMPATIBLE vs sweep/reprise; LISTEN_CUES + ROUSED_LINES entries.
  Mesh: orc rig + brass whistle cone (fallback tallFigure plate/white-eyes).
- Gates: tsc, lint, 93 vitest (+3), 5-seed sim, props.spec 10/10, build.

## Sprint 235 — the Groundswell (room hazard; the floor itself heaves)

- Room-bound hazard on corridor/gallery/records/maintenance 30–80: 2.5s of
  '[the floor holds its breath]', then a floorboard-wide hump travels
  entry→exit at ~3.2 m/s, dust motes lifting ahead of it. Standing in the
  band when the front passes → rooted 0.7s + 15dmg + '[the boards heave
  under you]'. Sidestep to the wall strips (calm band ≈1m along each wall)
  or ride it out between waves; ~4 waves then '[the floor settles]'.
- Mechanics: axis = norm(exitPos−entryPos), span<6m rooms skip; front
  advances on `front`, swell mesh = darkOak box strip across the room
  (stripLen = crossHalf−1 each side) rotated to face the wave; 36-pt
  THREE.Points dust recycled in pLife ring; rumble 'ambient' emit 0.35s;
  hit once per run (`struck`), threatPos = hump centre while a wave runs.
- Plumbing: EntityId 'groundswell'; tuning warningTime 2.5, damage 15,
  cooldown 8, spawnChance 0.3, minRoom 30, maxRoom 80, biomes
  corridor/gallery/records/maintenance — placed right after `warden` in
  ENTITY_TUNING so it rolls on most seeds ('s'→34/42/68, 'threshold'→45/53,
  'sim-seed-01'→65); ENTITY_TIER 1; FORBIDDEN_IN_MILESTONE; non-lethal so
  NOT in the hasSurvivalOption gate; LISTEN_CUES '[boards groan]' +
  ROUSED_LINES '[the floor rolls again]'.
- E2E: 'the groundswell heaves the floor — sidestep or stumble' — teleport
  onto the moving threatPos until it heaves, then hold a wall strip
  through the remaining waves to 'floor settles'.
- Porter spec hardening: phase-B gaze spot now iterates candidate sight
  lines — guest-two-baths' bathroom wall can block the single `back`-axis
  spot (schedule shifts moved porter rooms [29,53]→[28,47,56]).
- Playwright stale-dist trap: a manually started `npm run preview` keeps
  serving the OLD dist (webServer reuseExistingServer) — rebuild+kill
  :4173 before expecting new code in e2e.
- Gates: tsc, lint, 96 vitest (+3), 5-seed sim, props.spec 12/12, build.

## Sprint 236 — the Inspector (anti-camping: it tests every hiding spot)

- Room-bound checker on guest/records/gallery 16–82: a livery figure
  (monkroose + brass keyring) walks spot→spot nearest-first at 1.7, tries
  each lid for 2.6s. If yours is being tested the prompt becomes a
  hold-the-lid grapple: 4 interact presses inside the window → it lets go
  and moves on; none → it pulls you out for 30dmg. It NEVER re-checks a
  spot — the meta is staying one spot behind it, or bailing out early.
  Standing in its walking path earns an 8dmg shove (4s cd).
- Mechanics: skips trappedBy spots (hollow lids stay hollow's); checked
  set per room instance; grapple reuses the Hollow `trappedBy` channel —
  Game's exitHide case routes presses to `inspector.struggle()` and never
  calls exitHiding while trapped; the entity clears trappedBy itself on
  resolve and can force `player.exitHiding(now)` directly (ctx.player is
  the real controller).
- Scheduling: ENTITY_TUNING slot ~7 (after lurker) still left seeds at
  0–1 — upstream entities eat the biomes before its roll. Fix = a
  spot-aware guarantee pin after the standard guarantees: first free
  room 22–44 with ≥2 untrapped hidingSpots. Now 8/8 seeds roll it
  ('threshold'→27 morgue, 's'→77 bullpen, 'gilt'→21+63).
- Generator gate: `inspector` needs `room.hidingSpots.length >= 2`.
- Tuning: speed 1.7, damage 30, cooldown 9, spawnChance 0.44, tier 2,
  FORBIDDEN_IN_MILESTONE; LISTEN_CUES '[a latch being tried]' +
  ROUSED_LINES '[the keys again]'.
- E2E: 'the inspector tests every lid' — 's' @77 records-bullpen (2
  runtime-untrapped lids): hold the nearest through real exitHide
  presses → 'lets go', then the second lid unanswered → 'pulls you out'.
  'gilt-spine-777' @21 is a BAD room: the hollow-trap pass marks its
  second lid AT RUNTIME (generator sees it clean) — always pick rooms by
  runtime `!s.trappedBy` count, not generator output.
- Debugging traps learned (all in props.spec warden/inspector specs):
  - `killPlayer` is NOT godMode-gated — a co-spawned bellman legitimately
    executed the exposed test player mid-spec (silent assert failure —
    no captions, no strikes). Bail on `g.player.dead` in long drives and
    retire co-spawned entities (`ent.state='done'` is public) that are
    under test elsewhere.
  - The warden's blind charge has TWO legal endings: 'whistle dies'
    (lostT>2.2) OR 'Warden strikes' — if the hiding spot sits within 1m
    of your last-seen position it strikes through the volume. Assert
    either; don't assume give-up.
  - Spot `exitPos` is EXPOSED (outside the hide volume): teleporting the
    player there while "hidden" lets room watchers/cameras see you —
    drive hidden players to the volume CENTRE.
  - '[the handle rattles — held]' is the ambient doorTry scare
    (Game.ts ~4835), NOT grapple feedback; '[small scuffle]' is
    critters; '[something crosses the far door]' is figure-pass. Grep
    caption text before attributing it to an entity.
  - `room.entryPos` does not exist — the entry door pos is `room.n`
    (rooms use n/s compass fields).
- Vitest fakePlayer grew `dead` + `exitHiding` (clears hiddenSpot).
- Gates: tsc, lint, 99 vitest (+3), 5-seed sim, props.spec 12/12, build.

## Sprint 237 — the Commissionaire (forward-blocker: it holds the doors)

- The first encounter that gates your forward path: a livery doorman
  (monkroose + brass lantern arm) plants ~1m inside the exit leaf, and on
  room entry HOLDS the way back — `Door.heldBy` (new Door field, separate
  from `locked`: no key path) seals the entry leaf cluster on both sides of
  the doorway; the door case refuses it with '[the door is held from the
  far side]'.
- The sweep is a VISIBLE mechanic: an additive amber cone from the lantern
  tracks `gazeYaw = baseYaw + sin(t*0.9)*1.15` (±66°, ~7s cycle); caught in
  the wedge for 0.45s → '[the lantern finds you]' → chase at 2.7 tracking
  live position while LOS holds (lastSeen when it breaks) → contact throws
  you ~2.5m toward the sealed entry + 20dmg ('[it throws you back to the
  door]'), then it walks back to post at 1.9. Touching the post is an 8dmg
  elbow (4s cd). Hiding spots are safe from the gaze (hiddenSpot short-
  circuits inGaze).
- Win condition: the instant any exit-cluster leaf's `opening` is set it
  yields — '[it stands aside — this once]' → done → all held doors
  released (onDone always clears heldBy, so death/expire/leave also unseal).
  Intended plays: cross on the blind arc, or bait it off-post (chase gives
  ~3-5s) then touch the leaf before it returns. Non-lethal-ish → not
  survival-gated; expire 150s prevents soft-locks.
- Scheduling: corridor/gallery/guest 14-70, spawnChance 0.5, tier 2,
  FORBIDDEN; same ordered-roll trap as inspector — pinned first free room
  24-46 windowCompatible → 8/8 seeds (ash-vault-101 gets 3).
- e2e spec drives the whole loop: sealed assert → real interact refusal on
  the held leaf → bait in the visible pocket → 'lantern finds you' → touch
  the exit leaf mid-chase → yield + unseal. Geometry note: in suite-split
  the dead-axis at ~5m is behind the divider wall — the gaze covers the
  room obliquely; probe `ent.inGaze()` (private is reachable) on a grid to
  find a visible pocket when writing specs for other rooms.
- Vitest +3 (seal/release, arc-catch+throwback, exit-open yield): 102 total.
- Gates: tsc, lint, 102 vitest, 5-seed sim, props.spec 13/13, build.

NEXT SPRINT IDEAS (pick the biggest first)
  - Perf audit done (228): tools/audit_materials.ts reports per-biome
    mats/meshes; LED clones pooled per row/source. Remaining clones are
    per-seed-emissive (screens, sconce decals) — real per-instance data.
  - Economy: economy is now ~5x coverage — if playtests still feel rich,
    raise vend prices or trim loot weights rather than payouts again.
  - Milestone-only entities stay authored-only (pursuer/hazard); ambient
    scheduling is done for everything else.
  - e2e: done — ambient interacts, washer cycle, trap pry, hiding
    enter/exit + hollow struggle, document→codex all green (props.spec.ts).
  - More mill batches if dressing still reads thin: main-route sideboard
    variants + corridor furniture; u-room kit is milled now (sprint 220) —
    next under-room depth is variants/weathering, not new kinds.
    Grand staircase kit + tracery done (225); u-weathering done (226) —
    next under-room depth is authored variants, not systems.
```

---

## Sprint 238 — the floor hears you (noise reactions across the cast)

- Discovery: only the Curator ever subscribed to `ctx.sound.on` — every
  entity since sprint 230 was deaf, so the windAlarm lure's promise
  ('sound-hunters go to it') was only ever true for one entity + the
  behind-door rouse. Now the whole cast hears loud noise, each per its
  archetype — noise is a real risk/reward channel, not just flavor.
- Shared filter: `noiseCanRouse(e)` + `withinRouseRadius(e, x, z)` —
  the SAME loud-only categories the door-rouse uses (sprint strides,
  slams, machine knocks, 'distraction' lures); entity-sourced events
  still never feed back. Radius = intensity * 14m.
- Per-entity reactions:
  - Warden — leaves its a–b line to walk to the sound (1.4x) and scan
    1.8s; `canSee` stays live the whole trip (it walks with eyes).
    windAlarm genuinely pulls it off post — the lure works now.
  - Commissionaire — never leaves its post (it's the doorman), but pins
    `pinYaw` on the sound for 3.5s: the sweep stops there, blinding the
    room's far arc. Throw a lure to one side → cross the other.
    `aimYaw()` centralizes pinned-vs-sweep for body+cone.
  - Bellman — a loud sound drops `noiseCrumb` it stoops to sniff, then
    resumes the trail. Your own sprint/slam sounds feed it too — noise
    you make becomes part of the path it walks. Gated: ignores sounds
    while frozen under gaze, still won't follow sound into resting
    rooms, and noise during 'warn' queues until engage.
  - Groundswell — loud noise while idle pulls `waveAt` to now+0.7s:
    sprint through a swell room and the floor answers sooner.
  - Inspector — a noise cuts the running lid test to its last 1.2s:
    buys you seconds at the lid it is ON, at the price of hurrying it
    toward yours. '[it glances up — then back to the lid]', 8s cd.
- Test harness note: `makeCtx.sound.on` is a stub — hearing tests
  re-inject `sound` with an `on` mock that captures the handler, then
  feed SoundEvents directly (see 'Hearing the cast' describe block).
- Traps found: bellman's warn-phase gate dropped pre-engage sounds —
  fixed (warn counts as listening). Inspector's own rattle emits carry
  `source` so it can't provoke itself — same protection everywhere via
  the e.source check.
- Vitest +5 (warden investigate, commissionaire pin, bellman crumb,
  groundswell provoke, inspector glance): 107 total.
- Gates: tsc, lint, 107 vitest, 5-seed sim, props.spec 13/13, build.

NEXT SPRINT IDEAS (pick the biggest first)
  - Entity e2e coverage for the hearing layer (props.spec has the base
    entity loops; add lure-pull specs if the cast's noise reactions
    need browser-level verification).
  - The last deaf spot: milestone-only entities (pursuer/hazard) —
    sound-driven reactions for the milestone set, or leave authored.
  - Economy: still ~5x coverage; if playtests feel rich raise vend
    prices rather than trim payouts.
  - More mill batches if dressing reads thin: main-route sideboard
    variants, corridor furniture; u-room variants done (226).

## Sprint 239 — hearing e2e + the pebble floor (dead mechanic resurrected)

- Browser-level verification of sprint 238's hearing layer through the
  REAL paths — not direct emits: `tossPebble()`, `useActiveSlot` on a
  pushed windAlarm (item → planted lure → Game's tick loop → sound bus),
  and literal Shift+W sprint strides (controller footfall → 'sprint' emit).
- DEAD MECHANIC found while wiring the pebble spec: `tossPebble` emits
  0.45 — below `ROUSE_MIN_INTENSITY` 0.55 — so the 'free, weak lure'
  reached NOTHING (no door rouse, and sprint-238 entities used the same
  floor). New `noiseCanBeHeard` (0.42, same category set) splits
  in-room hearing from door-rousing: pebbles audible to entities in the
  room, still can't wake what's behind doors. Entities now use it.
- One spec, three real-path proofs on seed 's' (bellman @32 → warden @33
  → groundswell @34, consecutive): pebble toss detours the bellman to
  the crumb; the wound alarm's ticks pull the warden off post to the
  lure position; sprint strides provoke the next swell early.
- Emergent-verified, not planned: sprinting in room 34 also pulled the
  Warden out of room 33 through the wall — withinRouseRadius honestly
  carries through walls. And you CANNOT toss a pebble at a bellman
  you're looking at: the gaze freeze evaluates at emit-time, so aimed
  tosses land dead — the counterplay is tossing sideways (spec asserts
  the flank toss).
- Harness traps (spec comments): post-detour the bellman resumes your
  trail — an exposed lingerer is a touch-kill (killPlayer bypasses
  godMode) — hide after tossing. Warden whistles on room-enter before
  you can hide — harmless for the hearing assert (charge gate blocks
  hearing, lure investigation resumes after the strike).
- Environment trap now in config comments: playwright webServer has
  reuseExistingServer — a stale `vite preview` on :4173 serves a build
  from whenever it started, skipping rebuilds. Kill it before rerunning
  after source edits, or you'll test yesterday's bundle.
- Vitest +1 (pebble floor: 0.3 ignored, 0.45 investigates): 108 total.
- Gates: tsc, lint, 108 vitest, 5-seed sim, props.spec 14/14, build.

NEXT SPRINT IDEAS (pick the biggest first)
  - The milestone set is the last deaf spot: pursuer/hazard sound
    reactions (they're authored-only; adding hearing is a design call).
  - Pebble/rebalance note: 0.45 in-room hearing makes tossPebble a real
    tool now — watch whether free lures on an 8s cd trivialize the
    commissionaire/bellman rooms in playtests.
  - Economy still ~5x; mill batches still open on main-route furniture.

## Sprint 240 — brace the door (player counterplay at thresholds)

- Crouch at a closed door and the seam gains a mirror point: `Brace Door N`
  (0.55m off the leaf opposite the listen seam, holdTime 0.8, priority 4).
  Completing sets `heldBy='player'` on the whole doorway cluster — the same
  field the Commissionaire uses against you. Widened `Door.heldBy` to
  `EntityId | 'player'`.
- The brace is your body weight: it holds only while you stay within 1.7m
  and the leaf stays shut — `updateBraces` releases on distance ('[you let
  go]') or the leaf swinging. Opening your own braced door just releases
  the brace (opening IS letting go); other heldBy kinds still refuse.
- Bellman honest doors (the load-bearing change): its walk never waited
  for a knocked leaf — it ghosted through closed doors a beat after the
  rattle, so a brace could never have caught it. `blockingDoorNear` now
  pauses it at a closed leaf ON the path to its crumb (radius 1.2m, inside
  the 1.25 knock reach so head-on approaches knock first) until the swing.
  A braced leaf on the path holds it 14s with 'test-the-bar' rattles, then
  '[its steps fade down the hall — it lost interest]'. Braces BEAT it, at
  the cost of standing on the door while it works the latch.
- `doorBetween` is a leaf-plane side test (normal = (sin yaw, cos yaw)):
  off-plane positions block only opposite-side targets; standing IN the
  doorway (it spawns there) blocks anything meaningfully through.
- Knock pending re-checks heldBy at swing time — a brace laid inside the
  0.85s window still beats the swing.
- Also closed the wall-ghost loophole in sprint-238 hearing: warden and
  bellman noise detours now require the sound to be reachable — same room,
  or (bellman only) a room whose door the bellman is standing at. It lives
  at thresholds; roomAt resolves its door pos to EITHER adjacent room's
  fuzzy bounds, so the reachable-room check is door-proximity, not
  room-equality.
- Vitest +2 (braced hold→fade, release→knock), props.spec +1 (real brace
  loop: enter → crouch-brace → cadence rattles → fade, leaf never swung).
- Gates: tsc, lint, 110 vitest, 5-seed sim, props.spec 15/15, build.
- Harness traps learned: the brace-vs-knock race is ~0.5s — spec settles
  must stay under ~1s after room-enter or the swing beats the brace.
  killPlayer bypasses godMode AGAIN — stand >1.05m (killRange) off the leaf
  but <1.7m (brace radius) — a 0.9m-in nudge threads it.

NEXT SPRINT IDEAS (pick the biggest first)
  - Brace UX worth watching: bracing a door you just closed vs an already
    knocking bellman is a lost race by design — check playtest feel.
  - Locked doors still ghost for the bellman (deliberate: it goes where it
    wills) — if a run ever trails into a keyed door it walks through.
  - Economy still ~5x; milestone-set hearing remains a design call
    (Pursuer is a scripted chase — hearing doesn't fit its shape anyway).

## Sprint 241 — noise draws the patrol (the Warden leaves its room)

- Sprint-240's reachability guard made adjacent-room noise FREE — loud
  sounds next door reached nothing. The Warden's whole archetype is
  corridor patrol, so now it answers: a hearable noise in another room is
  reachable when its patrol has brought it to that room's door
  (`atRoomDoor`, 2.2m — its a–b endpoints ARE the doors, so it hears
  cross-room noise exactly at its turnaround pauses).
- New `src/engine/doorGeo.ts`: `doorBetween` (lifted from bellman),
  `atRoomDoor`, `pointInRoom` — the shared leaf-plane/room-geometry the
  hearing layer now needs in two places.
- Crossing is physical: `doorOnPath` on the investigate walk — a braced or
  locked leaf turns it back ('[it turns from the held door]' — your brace
  beats the Warden too, consistent with the Bellman); anything else it
  shoves the whole doorway cluster open ('[the Warden puts a shoulder
  through the door]' + a slammed-door noise emit). It walks in, scans the
  point, and returns to its a–b line.
- Vitest +3 (at-door → shoulder-through, held leaf → gives up, mid-patrol
  unreachable → stays on line), props.spec +1 (live drive: stage a crash
  inside room 34 the moment the patrol reaches the shared door; it
  shoulders through, checks, and resumes its walk).
- Gates: tsc, lint, 113 vitest, 5-seed sim, props.spec 16/16, build.
- Harness traps learned: an exposed enterRoom settle in a warden room is
  a whistle + charge + STRIKE (the strike hits even a spot you hide in
  after it's seen you) — teleport directly into the hiding spot BEFORE the
  settle, `hiddenSpot = spot` + exitPos. '[The Meridian...]' is the intro
  caption, not a death — don't read it as killPlayer. And the investigate
  walk stops ~0.4m short of the noise point — assert crossing depth with
  slack, not the emit distance.

NEXT SPRINT IDEAS (pick the biggest first)
  - Same reachability now guards bellman crumbs and warden checks — the
    commissionaire's lantern-pin is still strictly in-room by design.
  - The warden's own footstep emits are entity-sourced (inert) — a real
    player's sprint in the next room is now the dangerous version.
  - Economy still ~5x; milestone-set hearing remains a design call.

## Sprint 242 — the tin counts what you carry (Collector purse-scaled toll)

- The economy ran ~5x: purses of 390–570 vs flat asks of 2–3. The
  Collector is the toll-taker — now its ask counts the purse:
  `tollPrice = clamp(2, floor(purse × 0.12), 24)`, live via a new optional
  `EntityCtx.purse` (Game wires `() => this.imprints`; headless ctxs omit).
- A fat purse is announced: purse ≥ ~67 flips the spawn cue to '[a tin of
  teeth rattles — counting what you carry]' — the honest tell that
  hoarding draws a heavier ask. The prompt prints the live price; the
  'toll' Game case reads `it.data.price` (falls back to 2 for legacy
  registrations). Re-offers after a refused approach re-count the purse.
- The choice is unchanged in shape: pay the scaled toll (it whispers the
  nearest threat's distance) or refuse and drag its rattle two rooms —
  real noise to anything that hunts by sound. Now meaningful at every
  purse level instead of trivial once you're rich.
- Vitest +3 (scale 5→2 / 50→6 / 150→18 / 400→24, pay→whisper→leave,
  rich-purse spawn cue), props.spec +1 (real path: purse 150 → prompt
  '18 imprints' → hold E → purse 132 → 'the tin accepts').
- Gates: tsc, lint, 116 vitest, 5-seed sim, props.spec 17/17, build.
- Trap learned: vitest describes nest — closing a describe early splits a
  spec into an orphaned tail block. And for e2e toll math, `imprints`
  is Game-private — cast `g as unknown as { imprints }`.

NEXT SPRINT IDEAS (pick the biggest first)
  - The purse still accrues faster than it spends mid-run — the Collector
    is now the progressive sink; watch whether tolls land often enough
    (it's scheduled, not guaranteed).
  - Door tolls stay flat 3 — optional loot closets, different mechanic.
  - Milestone-set hearing remains a design call.

## Sprint 243 — the door chock (set it and walk away)

- New purse item `doorChock` (maxCharges 2, viewmodel prism): the brace's
  paid counterpart. Crouch at a closed leaf and the seam gains a third
  point — `Wedge Door N` (hold 0.9) sits a step off the leaf on the
  player's side. Setting it costs a chock and marks the whole doorway
  cluster `heldBy='wedge'`; `Pull the wedge free` (hold 0.5) reclaims it.
- Design position: the brace is free but tethers you within 1.7m; the
  chock buys distance — it holds while you walk away — but it's weaker:
  the Bellman worries a wedge loose in ~6s of rattles vs the ~14s it
  takes to lose interest at a brace, then '[the wedge skids loose —
  kicked under the leaf]' and knocks the freed leaf normally. Worrying
  DESTROYS the chock (no reclaim); pulling is the only way it comes back.
- Economy: both vend-machine arrays carry it doubled (~2/8 weight), the
  Custodian shop stocks it at 12 imprints, the Broker at 8–14.
- The 'door' case refuses a wedged leaf with '[the wedge holds it — pull
  it free first]' — before the generic held check, since 'wedge' is the
  player's own hold and has a reclaim path.
- Bugs found: wedge/unwedge/brace cases clustered via `doorsAt(it.pos)`
  — but the interactable pos is the OFFSET ANCHOR (±0.45–0.55 off the
  leaf), not the leaf. Clustered on `it.data` (the Door) instead.
- Vitest +1 (bellman worries the wedge loose ~6s then knocks through),
  props.spec +1: rehearsal set/pull on an unscheduled BRANCH-room leaf
  (route doors get crossed by entities mid-hold — first attempt died to
  a wanderer opening the leaf under the hold), then a timed wedge on the
  bellman room's in-door, walk away, 'skids loose' + the leaf swings.
- Harness traps learned: every closed leaf in the focus window registers
  a wedge point while you carry a chock — match interactables by `id`,
  never prompt. The wedge anchor sits below floor level (y−0.12): a
  level look can't win the proximity-weighted focus score against the
  ±0.55 seam anchors (real players pitch down; pitch writes don't hold
  across crouched frames in the harness), so the spec wraps `sys.focus`
  to return the wedge point while it exists — and MUST also assign
  `sys.focused`, which is set inside the real `focus()` and gates the
  keypress check. Aim still patched via `lookDir` so the hold pipeline
  runs the real path.
- Gates: tsc, lint, 117 vitest, 5-seed sim, props.spec 18/18, build.

NEXT SPRINT IDEAS (pick the biggest first)
  - The wedge is the first mid-run spend on the MAIN route — purses
    still accrue ~5x; a route-side sink (desk-clerk vendor) could be next.
  - Locked leaves still ghost the Bellman through walls (deliberate so
    far — knock path skips them).
  - Brace UX watch: bracing a door you just closed vs an already-knocking
    bellman is a ~0.5s race — intended, but watch for feel complaints.
  - Milestone-set hearing remains a design call.

## Sprint 244 — the porter's cage (guest-wing spend point)

- The purse still accrued ~5x with no main-route spend between the
  Custodian (52) and the underscript. New sink: a `keyCabinet` of "held
  bags" on guest/lobby rooms (~38% roll → 2–5 cages/seed). Each cage
  carries 2–3 claim tags, spread laterally along the cabinet face —
  `Claim the bag tagged 'Voss' — 12 imprints` (hold 1.2). The tag names
  the claimant, not the contents — semi-blind, so it reads as a claim,
  not a shelf.
- Pool: items (bandage/tonic/chalkSpool/latchpick/feltWrap/sparkFlash/
  doorChock×2/windAlarm/wardSeal), a purse of imprints (8–26), or the
  owner's papers (a codex document — '[the bag held someone's papers]').
  Short purses get '[the claim is N imprints — M short]'. Claims are
  the run's recurring drain, priced 6–15 vs the vend machine's 4–11.
- Placement mirrors the vend block: seeded wall-spot candidates, first
  that's lane-free and ~0.7m clear of placed furniture (the cabinet has
  no collider — clearance is visual only, and loose props like
  rugs/stains/trays don't count).
- InteractKind 'claim'; registration keys `sock.meta.claim`; the Game
  case pays, resolves `meta.contains` in the loot vocabulary (item /
  'imprints' purse / 'lore' codex grant with the +6-imprints dedup
  fallback), and marks the tag taken.
- Generation regression caught: claim sockets share `contains:'lore'`
  with free document sockets — the codex spec grabbed a priced tag and
  never matched a take-prompt. Spec filters now exclude meta.claim/vend.
- Trap learned: candidates spaced only in y on a wall socket stack focus-
  collide — spread claim tags LATERALLY (±0.3m along the cabinet face).
- Gates: tsc, lint, 118 vitest (+1 cage spec), 5-seed sim, props.spec
  19/19, build.

NEXT SPRINT IDEAS (pick the biggest first)
  - Cage coverage is guest/lobby only — gallery/records wings still run
    purse-rich with no sink (a records "fines drawer"? gallery "coatrack"?).
  - Locked leaves still ghost the Bellman through walls (deliberate so
    far — knock path skips them).
  - Brace UX watch: bracing vs an already-knocking bellman is a ~0.5s
    race — intended, but watch for feel complaints.
  - Milestone-set hearing remains a design call.

## Sprint 245 — the guest ledger (paid foresight)

- The purse needed a second economy: claims sell blind *things*; ledgers
  sell honest *information*. A 'Read the guest ledger' point sits beside
  real `counter` props on ~60% of counter rooms (seeded 9–16 imprints;
  counters exist on every seed — checked).
- Hold 1.2s → pay → the book answers with `[the ledger expects: a valet
  who follows at Door 032 · the floor, restless at Door 034]`: the next
  10 rooms' `room.scheduled`, deduped, capped at 4, each entity named in
  hotel-euphemism (`NOUNS` map covering all 25 schedule types; unknown
  kinds read 'a guest unlisted'). Nothing ahead → `[the ledger's pages
  ahead are blank — nothing is expected]` — still an answer worth buying.
- One read per book: `meta.taken` + disabled socket. The register sits
  at the counter's room-facing edge (origin-ward offset 0.55m, y 1.0),
  not beside a wall like the cage tags.
- e2e (props.spec +1 → 20): seed 's' ledgers at 12/45/54; spec drives
  room 12's book — refuses a 14-imprint purse against the 15-ask, pays
  at 80, asserts purse == 65, the expects-line names a Door, and the
  socket disables after the read.

NEXT SPRINT IDEAS (pick the biggest first)
  - Gallery/records wings still run purse-rich with no sink (a records
    "fines drawer"? gallery "coatrack"? — second ledger variant:
    'the duty roster' on records desks tells STAFF positions (warden/
    inspector/commissionaire only), cheaper than the full book).
  - Locked leaves still ghost the Bellman (deliberate so far — knock
    path skips them; now that ledgers name what waits where, the ghost
    is easier to notice).
  - Brace UX watch: bracing vs an already-knocking bellman is a ~0.5s
    race — intended, but watch for feel complaints.
  - Milestone-set hearing remains a design call.
  - Ledger honesty lever: a rare seeded 'forged page' (redactor rooms)
    that LIES about one door — the book's euphemisms already hedge.

## Sprint 246 — the house keys (locked leaves vs the Bellman)

- The trail never crosses locked leaves, so the Bellman ghosted through
  any it met — knock loop skipped them, blocking skipped them. Now a
  locked leaf on the path is honest: it works the house ring
  (KEYS_LINES, 1.9s cadence) for ~3.2s, then `[the lock turns for it —
  the leaf never opens]` and comes through the seam (pos snaps 0.8m
  toward target; the leaf stays locked and never swings).
- Design pick over the alternatives: 'loses interest' would make locked
  doors a free wall you never even pay for; 'it unlocks the leaf' would
  open keygated rooms for free — economy break. Staff-keys-through-the-
  seam keeps the economy and is scarier: locks stop guests, not staff.
- blockingDoorNear no longer skips `d.locked`; the knock loop still does
  (locked leaves are never knocked — no pending-swing on them).
- Tests: vitest 'works the house keys through a locked leaf' (pos crosses
  the plane; leaf stays locked + unswung; keys + slip captions fire);
  e2e spec locks the '-in' leaf the bellman just spawned behind and
  watches it come through — 21/21.

NEXT SPRINT IDEAS (pick the biggest first)
  - Gallery/records wings still run purse-rich with no sink (a records
    "fines drawer"? gallery "coatrack"? — second ledger variant:
    'the duty roster' on records desks tells STAFF positions (warden/
    inspector/commissionaire only), cheaper than the full book).
  - Warden cross-room shoulder-push vs the new keys fiction — it still
    turns back at locked leaves (tested); decide if staff should carry
    the ring there too, or if patrolmen don't rate keys (fiction call).
  - Brace UX watch: bracing vs an already-knocking bellman is a ~0.5s
    race — intended, but watch for feel complaints.
  - Milestone-set hearing remains a design call.
  - Ledger honesty lever: a rare seeded 'forged page' (redactor rooms)
    that LIES about one door — the book's euphemisms already hedge.

## Sprint 247 — the duty roster (records-wing staff locator)

- The records wing's counterpart to the guest ledger: 'Consult the duty
  roster — N imprints' on desk/writingDesk props in records/maintenance
  rooms (~50% roll, 4–9 imprints — cheaper paper, narrower knowledge).
  Where the ledger predicts, the roster LOCATES: `[the duty roster
  marks: a watchman on his rounds at Door 046]` reads live entity
  positions (threatPos → pointInRoom → door number) for the staff cast —
  bellman/warden/inspector/commissionaire/porter/custodian/collector —
  'between the doors' when mid-corridor. All signatures when no one is
  marked working.
- One read per book (taken + disabled), same interaction idiom as the
  ledger: 1.2s hold, short-purse warn.
- e2e: warden spawned live @33 → read roster desk @35 → the line names
  'a watchman on his rounds'. Gen spec pins biome+desk+price.
- Entity→roster nouns reuse ledger register-euphemism register (valet,
  watchman, clerk, doorman, porter, custodian, toll-taker) — STAFF map
  lives in the Game case.

NEXT SPRINT IDEAS (pick the biggest first)
  - Both books exist now — the natural third: 'the complaint drawer'
    (gallery/maintenance) reporting HAZARD marks — groundswell floors,
    trapped lids, redactor doors — the non-staff threats the books don't
    cover. Completes the information economy triad.
  - Ledger honesty lever: a rare seeded 'forged page' (redactor rooms)
    that LIES about one door — the book's euphemisms already hedge.
  - Warden cross-room keys question remains open (staff ring vs patrol
    doesn't rate keys) — fiction call.
  - Brace UX watch; milestone-set hearing remains a design call.

## Sprint 248 — the complaint book (information triad complete)

- Third book: 'the fault book' on maintenance work surfaces
  (table/toolChest/toolbox) and 'the complaint book' on gallery
  sideboards/desks/console tables — ~50% roll, 3–8 imprints (cheapest
  paper). One kind 'complaint', `meta.fault` splits the naming.
- Files HAZARDS by door for the next 8 rooms — the other two books'
  blind spot: non-staff scheduled entities (18-kind noun map; STAFF set
  excluded — roster's job) plus physical marks: hollow-trapped lids
  ('a lid that bites'), false doors ('a door that isn't'), deep doors
  ('a door deeper than the wall'). Empty → '[the fault book is clear
  ahead]' / '[no complaints filed ahead — suspicious in itself]'.
- The triad is now complete: the ledger predicts (guest book), the
  roster locates (staff desk), the complaint book files (hazards).
  Same idiom everywhere: 1.2s hold, short-purse warn, one read per book.
- e2e: fault book @39 on 's' files the sweep@41, groundswell@42,
  hollow@43 — 'Door 04N — the floor heaves' lines. props.spec 23/23.

NEXT SPRINT IDEAS (pick the biggest first)
  - Ledger honesty lever: a rare seeded 'forged page' (redactor rooms)
    that LIES about one door — the books' honesty covenant has never
    been tested; the first lie has to be visible in retrospect.
  - The underscript has no books — a fourth in u-maintenance (work
    orders/fault sheets, marginalia-priced?) extends the triad below.
  - Warden cross-room keys question remains open (staff ring vs patrol
    doesn't rate keys) — fiction call.
  - Brace UX watch; milestone-set hearing remains a design call.

## Sprint 249 — the forged page (the books' first lie)

- The information covenant now has its exception: a guest ledger whose
  own read window (+10) contains a redactor's door carries `forged` +
  `forgedCover` meta — stamped in generateRoute AFTER scheduleEncounters
  settles (see trap below).
- The lie is omission, played honestly: the covered room's filings are
  dropped from the expects-line. If that was the only filing, the book
  asserts empty — `[the ledger expects: still air until Door 071]` —
  through a door that holds a forger. The tell is physical and readable:
  a second whisper `[the ink on one page is still wet]`.
- Rarity: ledgers rarely sit in a redactor's sightline — 5 forged books
  across 3/7 seeds (ash-vault 65/68→71, wax-bell 45→48 & 81→86,
  sable-cord 62→72; none on 's' or 'threshold').
- Trap learned: `fillSockets` runs BEFORE `scheduleEncounters` — socket
  meta that depends on `room.scheduled` must be stamped in a post-pass
  inside generateRoute, not inline in the socket blocks. (First attempt
  found zero covers and silently no-op'd; second attempt landed inside
  generateUnderscript's tail — the `return rooms` after the editor pin
  is the UNDER rooms' scheduler, not main.)
- vitest: forged ⇒ cover within (idx, idx+10] and holds a redactor;
  ≥1 seed carries one. e2e ash-vault-101: ledger@65 omits Door 071,
  emits the wet-ink tell, purse decrements. props.spec 24/24.

NEXT SPRINT IDEAS (pick the biggest first)
  - The underscript has no books — a fourth (work orders/fault sheets in
    u-maintenance, marginalia-priced?) extends the triad below.
  - Warden cross-room keys fiction call (staff ring vs patrol weight).
  - Brace UX race watch; milestone-set hearing remains a design call.

## Sprint 250 — the work-order book (the under's fourth paper)

- `File the work order — N marginalia` on under work surfaces in
  u-office-row / u-open-office / u-print-shop / u-server / u-break /
  u-records-cage / u-lobby (template gate + 0.12 roll → 6–10/run, 3–8
  marginalia — the crew's own currency, spent only here and at the Broker).
- The book answers CARGO, not threats: `[open tickets: Door 023 —
  imprints for the tin · Door 028 — the machine still stocks]` — under
  rooms in +12 with unspent loot/vend sockets — then `[the egress stamp
  is filed at Door 120]` so the sheet always points at the way out.
  Empty → `[the sheet is stamped closed ahead — the crew's been through]`.
- The library is now four books across two currencies: ledger predicts,
  roster locates, complaint files hazards, work order files cargo.
- Trap: the under-cache fill test asserts every filled under socket has
  `meta.contains` — book/vend sockets must be excluded like vend.
- e2e drives the real descent (`enterUnderscript()` callable via cast —
  it rewires space/streamer/entities) then files u-22 on 's': open
  tickets caption + egress stamp + marginalia debit. props.spec 25/25.

NEXT SPRINT IDEAS (pick the biggest first)
  - Warden cross-room keys fiction call (staff ring vs patrol weight).
  - Brace UX race watch; milestone-set hearing remains a design call.
  - e2e file is 25 specs / 2.1min — splitting props.spec by theme
    (books / doors / entities) would halve per-spec feedback time.

## Sprint 251 — the under hears you + pull the alarm

- `fireAlarm` props (u-stair-landings, 13/seed) are now live: crouch-free
  `Pull the alarm` point (0.7s hold, priority 2) — a pulled bell emits a
  1.0 'machine' crash + `[the bell screams in the stairwell]`. The under's
  own lure: loud, fixed, free, and it rings exactly where you stand.
- The under-cast now hears loud noise, scoped to where the fiction fits:
  Grafter drifts `target` to an in-room crash it doesn't owe to a seen
  body (`[the rubble drags toward the sound]`, 6s repeat-gate); a real
  lure. Stillframe strikes a crash in player earshot while its shutter
  is open — `[the shutter catches the noise]`, provoked like groundswell,
  "a crash IS movement". Margin skipped (its wrong-edge rustle is
  already sound-themed).
- Traps: e2e interactable references go STALE — `rebuildInteractables`
  runs every frame and replaces objects; check liveness by re-querying
  `interactables` (kind+enabled), never by `it.enabled` on a held ref.
  Stillframe's `inputHeld` path strikes on ANY held key in the window —
  testing the noise path needs a held-key-free emitter (tossPebble works:
  0.45 'distraction', above the 0.42 in-room floor).
- e2e "the under hears you": bell pull → caption + point gone; bus-level
  crash in a grafter's room → target lands on the point + drag caption;
  pebble in a stillframe window → snap caption + real damage. 26/26.

NEXT SPRINT IDEAS (pick the biggest first)
  - Brace UX race watch; milestone-set hearing remains a design call.
  - props.spec is 26 specs / 2.2min — splitting by theme (books / doors /
    entities) would halve per-spec feedback time.
  - Under-cast depth: the Returner (u-exit guard) is the only scheduled
    under entity with no noise verb — alarm pulls could wake it.

## Sprint 252 — props.spec split by theme

- The 2,127-line props.spec is now four themed files sharing a new
  `e2e/harness.ts` (seededRun + ThresholdG/GRoom debug-handle types):
  props.spec (ambient layer, 5), doors.spec (seam/brace/chock, 4),
  entities.spec (the cast + hearing, 10), books.spec (priced paper, 7).
- Same 26 specs, same bodies — worst file now 49s vs the old 2.2min
  single file. `npx playwright test e2e/entities.spec.ts` for the cast.

NEXT SPRINT IDEAS (pick the biggest first)
  - Brace UX race watch; milestone-set hearing remains a design call.
  - Under-cast depth: the Returner (u-exit guard) is the only scheduled
    under entity with no noise verb — alarm pulls could wake it.

## Sprint 253 — the returner answers the bell

- The last deaf under-cast member heard: while the Returner is still
  latching doors ahead (its 3.0s warn window), a crash within earshot of
  the latching end shortens the warning to a heartbeat — once, then it
  is already coming (`[the latching quickens toward the sound]`).
- Fiction: the crew's bells were wired for it — pulling a fire alarm
  near a warning returner is a summons, not a lure. The free bell now
  has a real cost when the wrong thing is latching. Only the returner
  subscribes (sweep/reprise/maelstrom passes stay scripted).
- vitest: crash at its door shortens warnT ≤1.0 once; far/quiet noise
  never reaches it; a sweep never subscribes. e2e leg 4 of "the under
  hears you" drives it live — entities.spec 10/10.

NEXT SPRINT IDEAS (pick the biggest first)
  - Brace UX race watch; milestone-set hearing remains a design call.
  - Under-cast depth done; next archetype: an under-room hazard layer
    (flooding maintenance, lights-out server hall)?

## Sprint 254 — flooded under-halls (the under-room hazard layer)

- `RoomInstance.flooded` on the wet service templates (u-corridor,
  u-long-hall, u-server, u-narrow-stacks, u-partition-maze, u-break) at a
  0.12 dressing roll — 3–7 flooded rooms per seed; safe landings and the
  lobby never flood (template gate keeps it off safe-room kinds).
- Builder lays a `flood-<idx>` water sheet (MAT.waterDark, ~5cm, covers
  the floor) marked `userData.anim` so the merge pass leaves it live and
  it can sink when drained.
- Wade rules (Game per-frame): inside a flooded, undrained room upright
  movement is speedMul 0.7 and every ~1.7m of travel emits 'impact' 0.55
  `[water takes every step]` — loud enough to rouse doors and feed the
  under's hunters. Crouch-wading is quiet but still slow. Entering a
  flooded room captions `[water covers the floor here — every step
  carries]` once per room (drainNoted).
- `Open the drain` (1.2s hold) sits on the room's first pipe-family prop
  (DRAIN_PROPS = pipeManifold/conduitRun/sumpPump/hydrant/wallVent). The
  crank is loud once — 'machine' 0.55 `[the crank screams once]` — then
  the room joins `drainedRooms`, the sheet sinks over ~6s, and the hall
  is quiet. Flooded rooms without drainable plumbing (partition-maze)
  honestly get no drain — cross them loud, or slow.
- Gates: tsc, lint, 127 vitest (+1 generation spec: flooded only on wet
  templates, never safe landings, drain where plumbing allows), 5-seed
  sim, e2e 27/27 (new props.spec leg: 10 splash emits upright, 0 crouched,
  drain → 0 emits + sheet at −0.06), build.
- Harness trap learned: `player.crouching` is recomputed from held keys
  every frame — assert the field drives nothing; hold 'KeyC' instead.

NEXT SPRINT IDEAS (pick the biggest first)
  - Brace UX race watch; milestone-set hearing remains a design call.
  - Under hazard layer landed; next: a lights-out variant for the same
    wet corridors (dying fixtures already exist — a hall where the mains
    are out entirely and the water hides the floor traps)?

## Sprint 255 — the Swamper (the flooded halls answer back)

- New under entity `swamper`: a drowned crewman that lies under sprint-254's
  standing water — submerged hump (inkGhost rig) + a dark displacement
  patch on the sheet, spawned only on `flooded` rooms (85% roll, cooldown
  10 — every flooded hall usually has one).
- It knows you only by what the water carries: any `noiseCanBeHeard` emit
  inside its room pulls it gliding at 3.6m/s to the point; a wader still
  stirring on contact gets `[the water stands up]` + 25dmg, then it slips
  to the far corner and lies again (8s strike cooldown). Quiet tells:
  `[the water moves, close]` when it drifts near a still wader.
- Counterplay is sprint-254's own verbs: crouch-wading stirs nothing (it
  never homes); `Open the drain` removes its medium — the moment the room
  joins `drainedRooms` it cues `[something slips down the drain]` and
  despawns (new `EntityCtx.isRoomDrained` hook). Its own strike emits are
  `source`-marked so it can't lure itself.
- THE BUG THIS SPRINT EXPOSED: main-route `scheduleEncounters` iterates
  all of ENTITY_TUNING with an exclusion list — 'swamper' wasn't excluded,
  so dry main rooms rolled a submerged-only entity (porters/collectors
  displaced + swampers on dry floor). Fixed by adding it to the list —
  new entity ids are global-by-default, gate them per-pass.
- Under layout drift: shared 'encounter' stream — swamper draws on flooded
  rooms reshuffled the whole under schedule ('s' grafter @5/19 → @6/27/…).
  Exposed a real ambush: a grafter scheduled on u-lobby (9×7) spawns
  ~1.25m off the player and kills inside ~1.3s — spec now picks a grafter
  room with corner clearance ≥5m. Watch item: lethal scheduled entities
  on tiny rooms are instant ambushes on entry.
- vitest +3 (glide+strike, quiet crouch contact, out-of-room deafness +
  drain despawn), entities.spec +1 leg. Listen/rouse/book-euphemism lines
  all covered ('a drowned porter in the flood').
- Gates: tsc, lint, 130 vitest, 5-seed sim, e2e 28/28, build.

NEXT SPRINT IDEAS (pick the biggest first)
  - Brace UX race watch; milestone-set hearing remains a design call.
  - Tiny-room lethal ambush rule (above) — worth a scheduling sanity pass:
    min room area for killRange entities, or survival-option gating.
  - Lights-out wet corridors: dead mains on flooded halls (water hides
    traps in the dark).

## Sprint 256 — the rise is the warning (spawn-grace for contact killers)

- New `Entity.rising()` on base (`stateT < 1.4`) — the wake cue is now a
  real grace beat: contact killers cannot strike while rising, so a thing
  that appears in your own room can never hit before you can answer it.
- Applied to the three entities that can spawn adjacent to the player:
  Grafter (setpieces), Swamper, Bellman. Pursuer/Editor stay scripted —
  their authored pacing is their grace.
- Root cause it fixes (from sprint 255's schedule drift): a grafter
  scheduled on u-lobby (9×7) spawns ~4m off a center-standing player and
  legitimately kills inside ~1.1s — an unavoidable ambush on tiny rooms.
  The grace makes the wake cue honest instead of posthumous.
- Considered and rejected: a scheduling gate (killRange entities need min
  room halfdiag) — guts the under's grafter count on corridor/narrow
  templates where the ambush is mostly a test-teleport artifact; in real
  play you enter at a door (~6.7m of warning) and the rise covers the rest.
- vitest +2 (grafter closet rise, swamper contact-while-rising), no new
  e2e legs — the entity suite re-verifies the whole cast.
- Gates: tsc, lint, 132 vitest, 5-seed sim, e2e 28/28, build.

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call — needs user input.
  - Lights-out wet corridors: dead mains on flooded halls (water hides
    traps in the dark).
  - props.spec is 6 specs; books/doors/entities carry the suite — the
    split already landed; next depth: under-room backtrack/exit coverage.

## Sprint 257 — drowned mains (the dark water hides the wire)

- DEAD SYSTEM RESURRECTED: `HazardField.snares` was fully dead code — no
  room ever emitted a `meta.hazard='snare'` socket, and `addFromRoom` was
  never called. instantiate() now converts every authored `snare` prop to
  an armed hazard socket (unlit-*, maint-service-narrow, chase2 — ~2–3
  live per seed) and run init populates the field for all rooms.
- Drowned mains: under flooded halls roll darkRoom at 0.7 not 0.45 —
  's' drowned 2 of its 3 floods (u-3, u-24; u-48 stayed lit).
- Submerged wires: a dark flooded room plants 1–2 snare props + hazard
  sockets (`meta.submerged`) seeded off door lanes, invisible under the
  sheet. Upright wading trips them: root 1.6s + 8dmg + a LOUD 0.8 impact
  that the swamper hears. Crouch-wading feels the wire — a soft
  '[wire underfoot]' scuff (0.25, below the hearing floor), snare stays
  armed. Flooded→drained rooms revert to normal visible-trip behavior.
- The stack it completes: flood → splash (feeds swamper) → dark (no
  visual) → wire (roots) → drain (the only way off the wheel). e2e leg
  drives upright-trip (rootedUntil + '[paper snare]') then crouch-feel.
- Harness traps logged: side-on approach teleports can pin against prop
  colliders — drive along the corridor's long axis; godMode blocks
  damagePlayer, so read `rootedUntil` + captions instead of health.
- Gates: tsc, lint, 136 vitest (+2 HazardField +2 generation), 5-seed
  sim, e2e 29/29, build.

NEXT SPRINT IDEAS (pick the biggest first)
  - The puddle prop's 'electrified' socket semantic is also unwired —
    more invasive (main-route maint-flooded/laundry/scullery puddles
    would become damage zones); design call whether to resurrect.
  - Snare armability in dry rooms: pry-defuse exists for trap lids but
    not floor snares — 'Cut the seal' interactable with a pebble?
  - Milestone-set hearing remains a design call.

## Sprint 258 — 'Cut the seal' (snare defuse)

- New `InteractKind` 'snip' + registration inside `rebuildInteractables`
  (Game.ts, per-frame loop over `hazard.snares`): an armed wire within 4.6m
  gets a 1.4s hold point — 'Cut the seal' on dry floors, 'Feel for the wire —
  cut it' while the snare sits under live floodwater (`flooded && !drained`).
  Submerged wires only register the point while the player is crouched — a
  wader standing up cannot see or reach them.
- Press: `hsn.armed = false` + 'trap-click' sfx + a QUIET 0.3 'item' emit
  ('[a quiet snip]') — deliberately under the rouse floor; defusing is the
  sneaky option vs the loud trip. Captions: '[the seal parts — the wire goes
  slack]' / '[the wire comes loose under the water]'.
- **Trap:** the prop-spec loop in `addRoomInteractables` runs ONCE at room
  build — crouch-gating there means a submerged wire's point can never
  appear (player is never crouched at build). Any crouch/input-gated point
  must live in `rebuildInteractables`, which runs every frame and sees the
  live input state.
- **Trap:** `vite preview` reuseExistingServer serves the last `dist/` —
  e2e/probes against src edits need `npm run build` first. Burned a whole
  debugging loop on this; the feature worked, the bundle was stale.
- **Harness trap:** Game has no `captions` field — read them via
  `g.audio.onCaption(cb)` + `captionsEnabled = true` (the dark-water spec's
  pattern), not `ga.captions`.
- e2e: dark-water spec gained the cut phase (upright = no prompt; crouched =
  prompt → hold → '[wire comes loose]'), plus a dry-seal spec on the
  maint-service snares ('Cut the seal' → armed=false).

## Sprint 259 — 'the way back' (under-traversal e2e)

- New `e2e/under.spec.ts`: the under-spine is now driven end-to-end —
  walk 0→7 through real door interacts, pocket a socket mid-route,
  backtrack 7→2, forward again 2→6 (spawn-once holds — a despawned
  grafter is a legitimate give-up, not a dupe), then ride the egress
  leaf home: space 'main', correct underReturn room, palimpsest granted.
  `stats.underscriptDeepest` proves backtracking never erases the stamp.
- **Real findings:** under doors share the main door interact — leaf
  openT animates on the record, colliders release at openT≥0.5. And
  door-side sill colliders (~0.3 tall, beside the opening) clip a walk
  that drifts off the opening axis — real but passable dead-center.
- **Harness traps:** door interactable pos.y≈0 — the focus cone needs a
  pitch down (~atan2(0.6−eyeY, dist)), a flat-pitch aim never aligns.
  And aim THROUGH the doorway at a point inside the next room, not at
  the leaf — centerline steering avoids sill clips. Stall fallback:
  teleport 0.6m past the plane — the transition is the assertion.
- **Also:** repo-root probe_*.mjs files are linted — delete them before
  `npm run lint`, not just before commit.

## Sprint 260 — 'the water hums amber' (electrified-puddle resurrection)

- Second half of the dead `HazardField` system: the `puddles` damage path
  (4dmg/0.5s, 'Electrified water hums amber') was fully written but no
  room ever emitted a `hazard:'puddle'` socket.
- Wiring: `flooded && !darkRoom` under rooms — a LIVE flooded hall arcs
  around up to 2 of its powered fittings (serverRack/machineBox/
  controlPanel/fluoroTube/conduitRun/breakerPanel/pipeManifold → floor
  hazard sockets, off door lanes). Drowned halls carry dead wires (the
  snare branch), dry rooms carry nothing. Main route untouched — no
  standing water up there. ~19 arcs across 5/6 seeds.
- Runtime: the arc needs its medium — `isRoomDrained` skips the check
  (drain kills the arc with the water), and a `[the water ahead hums
  amber]` warn cue fires within radius+2.2 (4s cd) — readable before
  it's lethal. Counterplay: the wide step or the drain.
- **Harness trap:** sprite-less hazard assertions need blood — godMode
  blocks damagePlayer, so the e2e leg drops it for the bite check.
- e2e 'the water hums amber' (under.spec): edge-hover warns w/o damage,
  step-in ticks health, drainedRooms makes the same spot safe.
- Tests: 139 vitest (+3: two HazardField specs + generation gate that
  arcs are flooded-lit-only and never on the main route), sim, build.

## Sprint 261 — 'the line sings' (steam hazard resurrection)

- Third unwired HazardField type: steam. Authored `steamVent` props
  (boiler/laundry/maint-pipe rooms, main route + some under) now emit
  `hazard:'steam'` sockets — ~15 vents on 's', all live.
- Runtime: each vent gets a deterministic cycle from its position hash
  (4.5–7.5s): last 1.2s of the cycle hums a warn ('[the line hums —
  it is about to vent]'), then `phase < 1.8` is the blast — 6dmg ticks
  inside radius 1.3 + a loud 'machine' emit that in-room hunters hear.
  Off-cycle is safe.
- 'Bleed the line' — the third defuse verb (snip/drain/bleed): 1.6s
  hold at the fitting, `st.dead = true`, quiet 0.3 emit '[a valve
  eases]'. Dead vents skip every phase.
- e2e 'the line sings' (under.spec): hover→warn, stand through a real
  blast window→health ticks, bleed→dead→quiet. Cycle watching: poll
  `hazard.steams[i].phase` — don't guess timing.
- Tests: 142 vitest (+3), sim, build.

## Sprint 262 — 'the drawer hums' (wired drawers + coax defuse)

- ~9%/10% (main/under) of unlocked loot drawers carry `meta.wired` —
  never in safe rooms, never stacked with drawerLocked. The tell rides
  the standing prompt: 'Search drawer — the latch looks forced'.
- Open unprimed: 7dmg + loud 'impact' snap, one-shot (wired clears).
  Crouched at the drawer: 'Coax the latch' (1.4s hold) — the free, slow
  path, cleared quiet ('[a latch coaxes open]'), loot pays either way.
- Two real traps worth keeping: (1) proximity fallback (`prox < 1.1`)
  in focus() makes an offset coax anchor un-aimable — crouch-gate the
  verb instead, like the submerged wire; (2) per-frame defuse points
  must scan `streamer.builtIndices` rooms, not `rooms[currentRoom]` —
  a socket near the room boundary can be focused while standing in the
  NEXT room; also aim pitches must use the live crouch eye (~0.95m),
  not the standing `eyeHeight`.
- Tests: 143 vitest (+1 generation spec), sim, e2e leg 'wired drawers'.

## Sprint 263 — the hazard-contract audit + tell coaching

- Audited every damagePlayer source: entity attacks (hint+counterplay),
  authored setpieces (orrery/editor/maelstrom — telegraphed), chandelier
  drops (chain-creak warn), and the four hazard classes (snare/puddle/
  steam/wired drawer). The contract held; the real gap was COACHING:
  tells didn't teach the defuse until after you'd been bitten.
- Tells now name the verb: drawer prompt 'the latch looks forced; kneel
  to coax it'; steam warn 'about to vent; the valve bleeds it'.
- New test/hazardContract.test.ts — the audit encoded as a regression
  guard: every defuse kind must stay in InteractKind + press dispatch,
  every hazard keeps its tell string and its damage hint, the drain
  keeps killing arcs (isRoomDrained).
- Tests: 146 vitest (+3), sim, e2e all green.

## Sprint 264 — 'scent' (killed hazards leave sign hunters can read)

- `hazard.evidence` — every hazard death pushes a sign: snip ('wire'),
  snare TRIP too, bleed ('line'), drain ('water'). Sign is permanent,
  read-once per hunter (`readBy` keys like 'warden:33'). Quiet work is
  marked work — the defuse verbs now cost you a footprint.
- `EntityCtx.hazardEvidence(readerKey, x, z, r)` — returns fresh unread
  sign in radius AND marks it read (one call, no separate mark step).
- Readers: **Warden** polls during its a–b patrol (1.4s cadence); sign
  in its room → walks it through the existing investigate path + '[it
  reads the sign — someone has been here]' — eyes live the whole time,
  so lingering near your own sign is a mistake. **Grafter** drags to
  sign in its room on the roam cycle.
- Harness traps logged: (1) warden's investigate CLEARS on arrival —
  assert closest-approach over the window, not end position; (2) fake
  hiddenSpot `{id}` crashes focus() — must be a real hidingSpots entry
  (has exitPos); (3) playwright `-g` doesn't take two args — second
  overrides first, run files separately; (4) `toContain` on string
  arrays is exact-match, not substring.
- Tests: 148 vitest (+2), sim, e2e leg 'scent'.

## Sprint 265 — 'scrub the sign' (the cover-up verb)

- The defuse triad closes: loud (trip it), quiet (cut it), quiet-AND-
  clean (scrub it). Crouch at fresh sign → 'Scrub the sign — felt wrap'
  (1.8s hold): every evidence record within 2.6m erased, one feltWrap
  spent. Without a wrap the prompt tells you '(needs a felt wrap)' and
  the press explains '[a felt wrap would rub this out]'.
- Economy: feltWrap was a 2-minute step-muffle; it's now also the
  sign-eraser — stocked in both vend arrays + the Broker, so the
  cover-up is a real spend, not a free gesture.
- One subtlety: the sign-erase filters evidence within the RUB's
  radius, not just the focused record — one wrap cleans a floor.
- Tests: contract spec gained 'scrub'; e2e 'the line sings' drives
  bleed→sign→scrub→wrap-spent. Gates all green.

## Sprint 266 — old sign (player-readable evidence)

- `meta.spent` (~6% position-hash roll on snare/steam hazard sockets in `instantiate`, plus the dark-flood submerged snare pass) marks a hazard that died before you arrived; `fillSockets` guarantees ≥1 spent socket per route.
- `HazardField.addFromRoom` honors it: `armed:false`/`dead:true` + an evidence record with `old:true` (`t:-1`). The `hazardEvidence` getter filters `!e.old` — hunters only smell FRESH sign; old sign is for the player.
- Player read: `HazardField.update` fires a one-shot proximity cue (<3m, per record, current room only): sprung wire → '[a sprung wire, long dry — someone else took this step]'; bled line → '[a bled line, long cold — somebody worked here]'. Water evidence never goes old (no pre-drained generation).
- The sign system is now bidirectional: your kills mark rooms for hunters (264), the building's kills mark rooms for you.

**Traps**
- `instantiate()` has no rng stream in the arm loop — the position hash `(x*11 + z*3 + index*17) % 97` keeps the roll deterministic without consuming a stream. Same trick as the steam cycle hash.
- The spent guarantee must live in `fillSockets` (post-arming), not `instantiate` — only there can you see whether ANY socket rolled spent.
- Python string-`replace` edits: the evidence-type declaration sits under a docstring comment, so anchor on the type line itself, not a longer block.
- 's' spends: snare @2, steam @60 (e2e drives room 2).

## Sprint 267 — the belt-wheel (fan hazard armed)

- The `fan` prop existed but no template placed it — the last dead member of the HazardField docstring. Fan props added to maint-pipes/maint-boiler/laundry-hall/boiler-tank-room at y1.15 near walls; `instantiate` arms `pr.kind === 'fan'` → `meta:{hazard:'fan'}` with the same ~6% `spent` roll (salt 19).
- `HazardField.fans` {pos, room, dead, hitT, warnT}: warn cue at d<2.8 throttled 4s ('[a belt-wheel chews the air at shoulder height — duck under, or chock the blades]'), bite at d<1.0 && !crouching → 7dmg 0.6s throttle + loud 'machine' emit. **The crouch is the free path** — duck under standing-height blades.
- `chock` verb: standing defuse at ≤2.6m (priority 4 — outranks adjacent hide spots), spends a `doorChock`, 1.2s hold → dead + `kind:'fan'` evidence. The chock's second job (after door wedges); refusal '[a door chock would jam the wheel]'. Evidence union gained 'fan'; old-sign caption '[a chocked wheel, long still — somebody stopped the blades]'.
- The fan completes the family: snare (step), puddle (contact), steam (timed), drawer (loot), **fan (posture)** — the only hazard your crouch dodges while a stander bleeds.

**Traps**
- `builtIndices` is a `number[]` — `.includes`, not `.has` (the coax loop already knew; I guessed `.has`).
- e2e focus: a hazard point near a hiding spot loses focus ties — defuse verbs want priority ≥3 (chock 4). Same prox<1.1 fallback family as the coax anchor.
- Sprint-266's generation spec pinned spent kinds to ['snare','steam'] — extending the hazard family means updating the allowlist (its own guard caught the new kind).
- 's' live fans: 39,48,60,67,71,88,92.

## Sprint 268 — the scarred latch (old sign at the loot layer)

- ~12% of wired drawers roll `coaxed`: the latch was already worked — `wired` cleared (no bite), `bare: true` (loot suppressed), scar tell on the prompt: 'Search drawer — the latch is scarred, already worked'.
- `resolveSocketLoot` gained a `bare` early-return: '[the drawer is bare — someone else was through it first]'. The room tells you it was looted before you arrived — sprint-266's sign idea at loot granularity.
- No guarantee pass (unlike hazard sign): coaxed drawers are rare texture (0–2/route), not a floor feature.
- 's': one coaxed drawer, main room 77.

**Traps**
- The drawer-wired rolls live in TWO fill passes (main :852 SAFE_ROOM_TEMPLATES-guarded; under :585 'unwary' comment) — patch both or the route halves diverge.
- `resolveSocketLoot`'s `contains === undefined` fallthrough pays default loot (+6 marginalia under / +imprints main) — a bare drawer needs the explicit `bare` flag, not an absent `contains`.
- Socket `meta` is optional in the e2e route type — cast after the find, don't type the loop var non-nullable.

## Sprint 269 — forge the sign (the scent-lure)

- 'Forge the sign — felt wrap': crouched on bare floor with a wrap (and no existing sign within 1.4m) — 1.6s hold rubs a fake 'wire' evidence record at your position. Hunters read it as ordinary fresh sign: the warden investigates the empty spot, the grafter drags to it. The lure system gains a scent axis next to its sound axis.
- The wrap is now the full sign tool: scrub (erase) + forge (fake). Both 1-feltWrap spends.
- Registration is self-gating: the pushed evidence sits within the 1.4m gate → the point can't re-register where you just lied. Priority 1 keeps it under every other crouched verb.
- Kind is always 'wire' — kind is cosmetic to hunters (they investigate any fresh record); only old-sign captions read it.

**Traps**
- e2e: check the focused PROMPT (/Forge the sign/), not the interactables list — the forge point and door verbs coexist; focus decides.
- The 1.4m no-sign gate uses `e.room === this.currentRoom` — evidence.room is the room INDEX (matches currentRoom for main-space evidence since addFromRoom stores room.index).

## Sprint 270 — ghosts (hunter asymmetry on scent)

- `hazardEvidence` getter: `key.startsWith('grafter:')` returns stale (`old`) sign too — the rubble chases ghosts; a spent-wire room is free bait. The Warden reads `!e.old` only — fresh kills.
- Grafter caption names the read: '[stone drags to an old mark — it does not know]' vs '[...fresh sign]'. `EntityCtx.hazardEvidence` return gained `old?: boolean`.
- Lore: old sign is now tri-directional — you read it (266), the dumb hunter believes it (270), the smart one doesn't.

**Traps**
- **Evidence pos must be a complete Vec3** — a planted `{x, z}` record (no `y`) makes `v3dist` NaN → the `d > 3` guard passes as false → the player-read fires `cue(pos=NaN)` → `exponentialRampToValueAtTime` throws inside `audio.play`. Always `v3(x, 0, z)` / `{x, y:0, z}`.
- e2e hiding spots expose `exitPos`, not `pos`, in the harness type — teleport to `exitPos` + assign `hiddenSpot` (sprint-264 pattern).
- Probe scripts need the repo's node_modules (run from repo root), the preview server on :4173 (`npm run preview -- --port 4173`), and the `?debug` + `.seed-input` fill + first-button-click boot (no `?seed=` URL param).

## Sprint 271 — the Hauler (`new-forge`, under salvage-drag)

**What:** a sledge team hauls salvage down under-rooms — a–b on the room's long
axis at 0.85, the sledge trailing 1.25m behind the heading (`sledgePos` is a
public anchor that moves every frame). It scrapes `[the sledge scrapes]` every
2.4s ('impact' 0.3 — audible scenery, below the rouse floor). Loud noise within
7m of the sledge pulls a one-shot ram (25dmg 'hauler') — picking is quiet,
crashing beside it is not. Done after drifting 2+ rooms from spawn.
`stock = 4` — 'Pick the sledge' (1.8m, 0.9s hold) skims 4–9 marginalia or an
under-flavored item, emit 0.35 so the team never hears you pilfering it;
`[the sledge is stripped]` at zero.

**Traps:**
- **Evaluate the rouse-strike BEFORE the move-clear** — the old order nulled
  `alerted` on arrival (`dd < 0.35`) before the ram check ran, so noise that
  landed ON the hauler never roused it. Strike first, then walk/clear.
- **Entity `data` on an interactable needs the Record cast** —
  `Interactable.data` is `HidingSpot|Socket|Door|Record` — `Entity` fails the
  union. `data: ent as unknown as Record<string, unknown>`, then the press
  handler narrows it back through `as unknown as { stock, sledgePos }`.
- **Cooldown × spawnChance is the real density knob** — `spawnChance 0.5` with
  `cooldown 9` scheduled ~11 haulers per 121-room under. Cooldown 26 lands ~5.
  Under candidates roll in order — the first 'swamper' entry masks 'hauler'
  rolls less than you'd think because swamper's flood gate usually fails.
- **A moving anchor wants per-frame registration** — the pick point reads
  `sledgePos` fresh inside `rebuildInteractables`; the e2e pins the player to it
  each frame (a real player walks-with at 0.85 — hold range 1.9m ≥ 0.77m drift).

## Sprint 272 — the Laundress (`washer`-adjacent, flooded-basin guard)

**What:** a drowned laundress works a flooded room's drain basin — her wash
chokes the crank. While she `guarding`s (not investigating), 'Open the drain'
on her fitting fails `[the drain is choked with somebody's wash]` and she
`aggravate`s — a hiss plus a 15dmg hand-take inside killRange+0.8. Loud noise
in her room (<6m, noiseCanBeHeard floor) pulls her to the splash for ~5s —
the thrown-pebble window to take the crank. Room drains → `[the wash goes
down the drain]` → she despawns. Flood + plumbing gate in the scheduler, so
0–2 per run — the swamper claims flooded rooms first, she lands on leftovers.

**Traps:**
- **Under candidates roll in order — first success wins the room.** 'swamper'
  ahead of 'laundress' means she only lands where swamper's flood roll failed;
  gate-first-scheduled-order is a composition decision, not a bug. To pair a
  room with two entities the loop's `break` must go — don't.
- **Scheduled entities can't gate on scheduler-invisible state.** 'laundress'
  needs flooded + DRAIN_PROPS plumbing; both exist on `room` at schedule time
  (`room.flooded` set at :1277, `room.spec.props` populated) — check there,
  not in the entity.
- **`aggravate()` is the drain press reaching the entity** — the dispatch
  scans `this.entities` for a guarding laundress near the drain point before
  the crank runs. The bite is `killRange + 0.8` (she lunges past her post).
- **e2e hold durations are per-verb** — pick 0.9s, drain 1.2s; a hold that
  finishes one frame short shows a focused prompt + zero dispatch. Budget
  hold frames ≥ holdTime + 0.3s.
- **e2e `ga.keys` needs a type entry** — add `keys: Set<string>` to the `ga`
  cast when a spec starts holding E.

## Sprint 273 — pick the wash (the laundress's second window)

**What:** her basket is a loot socket with her schedule. While she
`guarding`s there's no point — while she sniffs a splash, 'Search the wash'
appears at her basin (1.0s hold, priority 3 — beats the drain's 2, so a
window visit steals first, then cranks). Pays cloth goods or hem-pins.
Two consequence orderings: pilfer-and-leave → she comes home, counts the
load, and `[a keen — the wash is lighter]` emits 0.55 loud (feeds the
under's hunters); pilfer-then-drain → she rides the water out before she
ever finds it light — the silent path. Also: hands on her basin while she
works are now bitten outright (<0.8 proximity aggravate — the guard post
is real, the hiss at 1.6 is the warning).

**Traps:**
- **Outcomes can be mutually exclusive across a state transition** — the
  e2e's first draft demanded `keened && drained` in one leg; the drain
  despawns her before the return-check can fire. Two orderings = two
  windows in one leg (lure→pick→return→keen, lure→crank→ride-out).
- **Same-position interactables resolve on priority alone** — basket (3)
  and drain (2) both sit at drainPos; the higher one holds focus until
  spent, then the next appears. Ordering the loot before the verb is the
  designed UX here, not an accident — the window sequence reads
  steal→drain naturally.
- **Proximity bites need a warning tier** — the hiss cue at 1.6m exists
  precisely so the <0.8 auto-aggravate is fair; bites without a tell are
  ambush, and ambush on a static guard is cheap.

## Sprint 274 — the lost-property cage (under spend point)

**What:** the porter's cage for the staff level. Claim sockets hang on under
cage/locker furniture (`recordsCage|keyCabinet|locker|filing|cabinet`,
~5–9 cages/seed at roll 0.08), tagged to staff who stopped answering —
`Reclaim the effects tagged 'Briggs' — N marginalia` (3–9). Same claim
mechanism, flagged `meta.marginalia` so the prompt, the charge, and the
short-purse warning all read the under's purse. Payout: under items,
`contains:'marginalia'` purse refunds, lore.

**Traps:**
- **Roll × host-incidence is the real density** — 0.3 on ~110 rooms with
  locker/filing/cabinet everywhere produced 48–85 tags. Under furniture
  hosts are common; the roll, not the host set, carries the rarity.
- **Reusing a kind across currencies wants a flag, not a new kind** —
  `meta.marginalia` on the same 'claim' dispatch kept prompt/charge/payout
  as three small branches instead of a cloned verb.
- **`contains:'marginalia'` is a new payout name** — the dispatch's
  contains-switch needed the explicit branch; a bare `giveItem` on it
  would have thrown (not an ItemId).

## Sprint 275 — the crew board (under foresight)

**What:** the under's fifth paper and the first that sells *crew*, not
cargo. `Check the crew board — N marginalia` (3–8) hangs 0.45 off storage
hosts (`keyCabinet|cabinet|locker|stackShelf|cubicle`, roll 0.09 → ~4
boards/seed). A read marks the next 12 under rooms' `scheduled` cast in
crew euphemisms — `[the shift sheet marks: Door 045 — a grafter in the
fill]` — or `[the sheet runs clean ahead — nobody signed on]`. One read
per board (`meta.taken`).

**Traps:**
- **Interactable focus scores `dist - align - priority*0.3`** — a board
  socket 0.45 off its host shares the prox window with the host's own
  loot socket; equal priority is a coin toss. The board takes priority 3
  (same tier as picks/defuses) or 'Take' wins.
- **Elevated sockets evade the prox fallback AND the down-pitch idiom** —
  `pos.y=1.0` puts prox at 1.35 even point-blank (fallback is <1.1), and
  focus() aims at `pos + 0.6y`, i.e. eye level. Aim pitch at
  `pos.y + 0.6`, not the raw pos.
- **Teleporting beside a socket lands you inside its host collider** —
  stand on the room-center side: `pos + (origin - pos).norm * 0.9`.
- **E2e legs must exclude rooms earlier legs already visited** — spawn
  keys are spent on entry. The shifted under schedule put the first
  returner ON the fire-alarm room; the returner walked its pass during
  the bell phase and phase 4 found `spawned` already consumed. Multi-leg
  specs should pick their rooms `!visited`.
- **Spec 'no-board' stage vs seed drift** — boards are seeded, not
  guaranteed per seed; the spec skips when the roll finds nothing.
- **Paper-read sockets stay `filled:true` with no `contains`** — the
  cache spec's loot filter must exclude each paper kind (workOrder,
  crewBoard, …) alongside `meta.vend`.

## Sprint 276 — the claim register (the library's third book)

**What:** `Consult the claim register — N marginalia` (2–6, cheapest paper)
on under desk furniture (`filing|cubicle|schoolDesk|keyCabinet|recordsCage`,
roll 0.08). A read cross-references the next 10 rooms' lost-property claim
sockets — `Door NNN — 'Briggs' still held` vs `'Briggs' drawn` — so cages
worth the walk are named, and dead ones are marked. Blank window →
`[the register's claim columns run blank ahead]`. The under library is now
a triad: board files crew, order files cargo, register files claims.

**Traps:**
- **New socket passes consume the shared stream** — insert position
  decides whose downstream rolls shift. Register sits between crewBoard
  and workOrder; e2e legs all find-by-meta so order doesn't break them,
  but any spec hardcoding seeded positions would.
- **The desk-side socket wants the same treatment as the board** —
  priority 3 (host loot socket shares the prox window), `pos.y+0.6` aim,
  center-side stand. The three rules travel together for elevated paper.
- **`s.meta.marginalia === true` narrows claims** — the register must not
  file main-route claim sockets if the schema ever reuses `meta.claim`
  up there; the flag is the currency guard again.
## Sprint 277 — the Auditor (the theft tally walks)

**What:** a desk clerk scheduled on dry under-rooms carrying desk furniture
(`filing|cubicle|schoolDesk|recordsCage|keyCabinet`, `!flooded`, rolls after
laundress in the candidate line). The Game counts pilferage in `unpaidTheft`
— every marginalia claim, sledge pick, and basket steal increments it. Walk
in owing >0 and he holds out the ledger: `Settle the ledger — see the tally`
(a self-registered `audit` interactable, priority 4, at deskPos+1.15 toward
center). Paying `min(4 + owed*2, 14)` marginalia zeroes the tally and he
stamps you square. Walk out owing and he repaths along corridorPath at 0.75
and follows, room to room; touch is a 10dmg beating, then homebound. Setting
is the only absolution; `settled()` clears everything and removes the point.

**Traps:**
- **The interactable the entity registers must outrank its room** —
  priority 4 for the settle point; anything lower loses to host loot
  sockets the same way board/register paper did at priority 2.
- **`corridorPath` needs a full `traveled` for repaths** — repathing
  FORWARD from the spawn room seeds traveled=0; repathing BACK (player
  retreated) seeds `pathLength` so followPath resumes at the far end.
- **Demand fires on `pRoom === spawnRoom`, pursuit on `!=='`** — the two
  windows are exclusive across the same boundary check; a spec that only
  watches one room sees demand but never pursuit.
- **The capture-what-it-paid idiom** — the settle point disables itself
  on payment, so a last-frame `focused.prompt` reads whatever inherits
  focus (here: `Take spark Flash` from the room's pedestal). Capture the
  prompt while it still matches, not after.
- **`claimsOwed?: () => number` is optional in EntityCtx** — vitest ctx
  mocks skip it; entity guards `?.()` so specs that don't wire it see
  demand=false, pursuit=false.
## Sprint 278 — the House Detective (the wire, not the walk)

**What:** a plain suit desked at `counter|desk|writingDesk|filing` rooms on
the main route (minRoom 18, plus a mid-route pin at 26–58 so every seed
carries one). Each imprint claim drawn — porter's cage tags — accrues
`unpaidHeld`. Walk into his room owing and he clocks your face over a 2.5s
slow look: `Settle the account — see the register` (kind `settle`,
priority 4, toll `min(8 + owed*2, 24)` imprints). The counter-fork isn't a
pursuit — it's a WIRE: leave his room owing and every room you enter within
±10 rings `[the house phone rings ahead of you]` (a loud synthetic emit at
your position — the room's listeners are awake when you arrive). The wire
goes quiet past reach, or when the register is paid. He never touches you —
his weapon is that the building knows your face.

**Traps:**
- **`roomOf()` returns the ARRAY index, not `room.index`** — specs
  testing range cutoffs must pad the rooms array so the far room sits at
  array position >10, not just carry `index: 12`.
- **Phone-ahead marks a room CHANGE, not presence** — `lastPlayerRoom`
  dedupes the emit so pacing between two rooms rings on each re-entry;
  that's the intent, but it means the emit only fires on the frame the
  index flips.
- **A pinned entity needs the pin to check `!rooms.some(scheduled)`** —
  the natural scheduler can still out-roll it (wax-bell puts one at 89
  naturally); the global-check convention holds, so a deep natural roll
  suppresses the mid-route pin.
- **Desk-gated main-route entities roll rare** — spawnChance×tier×mercy
  on top of a prop gate lands ~0–1/seed; a guarantee pin is load-bearing
  if the mechanic must exist every run.

**Stream-shift casualties (e2e fixes after the detective scheduler rolls):**
- **Any new main-route `encRng` consumption reseats the whole under layout**
  — the 'encounter' stream is shared (memoized by name). The desk-gate bool
  + pin int moved 's' under rooms and the commissionaire pin (26→27).
  Specs that pin a *room index* or *template* will break: assert against the
  live route instead (forged-ledger now verifies `coverIsRedactor` + omits
  `Door <cover>` dynamically rather than `toBe(71)`).
- **Door points sit at y=0 — pitch down at the +0.6 focus point**, and aim
  from the player's ACTUAL post-frame pos: wall slide can shove the stand
  point sideways past the 1.1 prox fallback (records-vault pushed a 0.9m
  stand to prox 1.12 — align 0.59 at level pitch → no focus, no press).
- **A lethal scheduled entity can't always be settled inside its room** —
  grafter seeRange 9 + chase 2.52 m/s + killRange 1.35 beats a 4.2m spawn
  corner inside 1.3s. `godMode` blocks the damage but NOT the `done()` —
  a kill attempt still ends the entity. Spawn, step OUT of its room, settle,
  then feed it noise. Also: pick the LARGEST scheduled room, never a fixed
  size threshold — layouts shift.
- **`flickerRoom` can't dim a lightless room** — `roomMul` averages
  `built.lights`; no lights → mul stays 1 → device glow undimmable. Power
  specs must pick rooms with `built.lights.length > 0`. And blink/screen
  anims oscillate per-frame — sample emissive MAX over frames, not a point.

## Sprint 279 — the sledge lamp (light you can lift off the haul)

**What:** the hauler's drag now carries a hooded work-lamp on its tail —
a real PointLight pool (amber, r≈5.5, flickers at ~7Hz) swinging with
the haul through the under's dark rooms. It's a second lift beside
'Pick the sledge': `'Strip the lamp'` (1.1s hold, registered on the
lamp's own trailing pos at 1.9m, priority 3) frees it as
`giveItem('handLamp', 55)` — a hooded hand lamp at half battery for
new carriers, a +55 top-up for owners (count IS charge). The drag goes
dark permanently: `stripLamp()` kills the light and swaps the bulb to
screenDark. Pilfer-level quiet (0.35 emit), `unpaidTheft += 1` — the
Auditor counts the lamp too.

**The fork:** leave it = a free moving reveal while the team works your
flooded hall (its pool shows wires, arcs, the laundress's basin); strip
it = pocket light, the room loses the beacon for good. Same counterweight
as the sledge itself — loud noise near it still rams you.

**Traps:**
- **The two sledge verbs need separate anchor points** — 'pick' on
  sledgePos (y 0.4) vs 'strip' on lampPos (y 0.75), ~0.62m apart; the
  same 1.9m gate admits both but the aim separates them in focus
  scoring. Priority stays equal (3) — let proximity decide, don't
  outrank the cheaper verb.
- **`lampPos` trails the drag's heading** — sledge rotation is
  atan2(heading) so the tail lamp's world pos is sledgePos − heading·0.62,
  computed per frame like sledgePos itself.
- **Vec3 is a plain object** — `v3set`/direct fields, not `.set()`.
- **Shared cached materials** — never mutate MAT.amber() to dim a bulb
  (every amber fixture in the scene dims); swap `bulb.material` to
  MAT.screenDark() instead.
- e2e: the haul leg now drives BOTH lifts — pick (stock--) then strip
  (lampLit→false, +55 handLamp charge delta). Aim at lampPos directly:
  standing on the point with atan2 → yaw 0, pitch at the 0.75 point.

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - A dark sledge's return trip could 're-light' if you strip near a
    lit room — the team scavenges a bulb? (economy of darkness)
  - Slow spec files (entities/mechanics ~1.4m each) could split by theme.
