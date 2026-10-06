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
