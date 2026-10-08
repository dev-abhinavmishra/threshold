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

Sprint 217 re-merge note (this branch, after main raced to 278):
- The sprint-217 door-lane work collided with ~60 parallel sprints;
  merged toward main's placement audit (sprints 221-223) and kept only
  the UNIQUE mechanism: laneBlock meta + footprintInDoorLeaf +
  builder collider-shed. clearDoorLanes exempts meta.laneBlock props;
  the builder keeps their meshes but drops colliders inside a leaf's
  ±0.35m×0.9m throat. Sweep on merged code finds ZERO culled props —
  the mechanism is dormant but guards the sealed-doorway regression
  class: the leaf test fails if a collider in the throat isn't tagged.
- laneBlock tags were NOT re-applied (main moved every in-lane prop
  out — nothing to preserve today). Tag a prop laneBlock only when it
  genuinely belongs inside a doorway (portcullis, archway decor).

Sprint 279 — tidy wall dressing (this branch):
- wallProps() now enforces curated walls: no same-kind repeats on one
  wall (reroll x4), and a min along-wall gap between different dressing
  families — WALL_GAP 1.1m at emission, 0.77m tolerated through clash
  shifts. Curtain pieces (curtain/curtainRod/curtainLong/curtainSwag/
  drapePanel) share one family so layered windows still cluster.
- Wall props carry meta.side (0/1/2 = west/east/exit) — resolveWallClashes
  uses it to keep shifted props gapped on the same wall.
- Test: 'wall dressing keeps breathing room' asserts >=0.6m same-side
  gap (diff families) across all templates x3 seeds. Route probe:
  wall-hung density 1.34 -> 1.29 props/room — tidier, not starved.



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

## Sprint 280 — the scavenged bulb (economy of darkness)
Strip sprint 279's work-lamp in a LIT under room and it doesn't stay dark:
after ~3.5s the team pulls a bulb off the wall fixtures and wires it back
on — `[the team scavenges a bulb — the lamp fights on, dimmer]` (intensity
0.5 vs 0.85, distance 4 vs 5.5). In a drowned-mains room the strip is
permanent — nothing to scavenge. The scavenged lamp re-registers 'Strip
the lamp' (`h.lampLit` gates it per frame); the second strip pays 30
charge instead of 55 (`h.relit` at press time) and the dark holds for
good — one scavenge per haul. `room.darkRoom` is the lit/dead flag.
Traps:
- **The hauler never leaves its spawn room** — 'if you strip near a lit
  room' collapses to 'if the haul room is lit'. `c.rooms[h.spawnRoom]
  .darkRoom` is the whole check.
- **`relightT` accumulates only while unlit and unrelit** — a strip in a
  dark room just idles the timer (condition `room && !room.darkRoom`).
- e2e prefers a lit hauler (`find(!darkRoom && scheduled.hauler)` falls
  back to any) so the re-light branch runs deterministically on 's';
  `litRoom` flag lets the asserts branch when a seed has none.
- e2e timing: relight needs >3.5s of frames at dt=1/30 — 150 frames is
  the margin. Assert `relit && lampLit`, then re-approach for strip two.
- **`.vite/` needs ignoring twice**: `.gitignore` covers git but eslint
  scans it — `eslint.config.js` ignores now lists `.vite` too (the dev
  server's deps cache was linted as 293 errors).

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - The shared-anchor double-verb flag is open with Abhinav (standing
    dead-on the lamp admits pick AND strip via prox<1.1).
  - Slow spec files (entities/mechanics ~1.4m each) could split by theme.
  - The scavenged bulb could be *plantable*: a peeled handLamp bulb
    donated to a dark sledge re-lights it YOUR way? (probably gimmick)

## Sprint 281 — the spec split (feedback time)
`entities.spec.ts` (1330 lines, ~1.4m) and `mechanics.spec.ts` (1283)
split by theme so a sprint runs only what it touches:
- `entities.spec.ts` — the stalker cast + hearing (10: bellman, porter,
  warden, groundswell, inspector, commissionaire, hears×2).
- `hazards.spec.ts` — flood + sign ecology (5: swamper, dark water, cut
  the seal, scent, ghosts). Harness `ThresholdG`.
- `economy.spec.ts` — pay-or-refuse + the claim register (5: toll, vend,
  custodian, broker, house detective). Mixed types: shop tests keep the
  local interface block; the detective test casts `HarnessG` (see trap).
- `setpieces.spec.ts` — authored puzzle legs (7: gate, engine, draft,
  index, valve, wake, lens). Local interface block.
- `mechanics.spec.ts` — core verbs (3: witness, maelstrom, keyed door).
Traps:
- **`mechanics.spec.ts` had its own type layer** — mid-file `interface
  GSock/GDoor/GRoom/GMilestone/ThresholdG` (orig. 329–382), richer than
  the harness types (keyPairs, milestones, giveItem, underReturn...).
  Moved tests need the block copied in; files authored against the
  harness types need `import type { ThresholdG as HarnessG }` for their
  casts, not a second local ThresholdG (TS2440).
- **`seededRun(page)` in mechanics meant 'threshold'** — the local
  bootstrap defaulted there; the harness default is 's'. Moved legs that
  relied on the default must pass 'threshold' explicitly.
- **Latent skip unmasked by the move**: 'cut the seal' found the FIRST
  room with a snare socket — room 2's is `spent` (sprint-266 old sign,
  dead), so the leg silently skipped since 266 landed. Socket finds now
  filter `!sk.meta?.spent` (same fix in the dark-water leg).
- File headers carry the theme comment; per-test seed comments keep the
  original wording so `// 's': ...` greps still work.

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - The shared-anchor double-verb flag is open with Abhinav (standing
    dead-on the lamp admits pick AND strip via prox<1.1).
  - `under.spec.ts` (873 lines / ~1.1m) is now the biggest file — could
    split under-traversal vs the under-economy legs if it keeps growing.
  - The scavenged bulb could be *plantable*: donate a bulb to a dark
    sledge, re-light it your way? (probably gimmick)

## Sprint 282 — the marked rate (the tally reaches the counter)
The under's clerks' score now prices the one staffed trade: carrying
`unpaidTheft > 0` to a Broker pedestal charges the same reading the
Auditor's desk makes — `effPrice = price + min(4 + owed*2, 14)`. Cues:
`[traded at the marked rate — N marginalia]` on pay, `[the marked rate
is N marginalia — settle the tally or pay the crew]` on short. Theft now
has an invisible surcharge running under the whole floor; the Auditor's
desk is the only way back to clean prices. Custodian/main-route shops
are untouched (different ledger — `unpaidHeld` is the Detective's book;
vends are imprints-only so the marked rate has no other recipient).
Traps:
- **'shop' kind covers broker AND custodian prompts** but the custodian
  never reaches the case — `CustodianEncounter.onInteract` eats it first;
  the case's `meta.broker === undefined` early-return keeps it broker-only.
- e2e: u-lobby carries TWO broker pedestals — buy clean, then set
  `(g as { unpaidTheft }).unpaidTheft = 3` (private is runtime-writable)
  and buy the second at the marked rate; assert the exact fee
  `price + min(4+owed*2, 14)` not just 'more'.
- The marked rate only applies where a CREW MEMBER reads you — cages are
  unattended claims and stay flat-priced; they accrue the mark, they
  don't price it.

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - The shared-anchor double-verb flag is open with Abhinav.
  - `under.spec.ts` (873 lines) is now the biggest spec — could split
    traversal vs under-economy legs.
  - The Detective has a warrant escalation (phones ahead); the Auditor's
    equivalent could be a wanted poster — a marked face the under cast
    reads? (design call — how does a clerk share your face?)

## Sprint 283 — the under split (under.spec.ts → under + undercast)
Under followed the sprint-281 split: `under.spec.ts` keeps the spine
(way-back traversal, electrified flood, steam line, old sign — 4 legs);
new `undercast.spec.ts` takes the crew and its paper (haul, wash, lost
property, crew board, claim register, audit — 6 legs). Both files are
harness-typed — no local interface block this time (the legacy layer
only exists in the mechanics lineage). 'the wash' keeps its known
seed-gated skip (no laundress on 's').

## Sprint 284 — the wash un-skipped (and its aim fixed for real)
The wash leg's seed-gated skip since sprint 272 ended: 's' drifted the
laundress off schedule; gilt-spine-777 (already a sim seed) schedules
TWO — u-15 (lit flood) + u-105 (drowned mains). The leg is fully dynamic
(`find(r.scheduled laundress)`) so only the seed swapped. But un-skipping
exposed two latent spec bugs the skip had hidden:
- **Floor-aim never reached the drain**: drain interactable pos.y=0.9 →
  focus point is 1.5 (pos.y+0.6), nearly eye level. Aiming pitch at 0.5
  gave align≈0.68 <0.86 and prox 1.23 >1.1 — focus could NEVER land.
  The wash socket (y=0.5, prox-covered) is why the basket phases always
  looked fine. All aim loops now pitch at the interactable's own focus
  point (drain 1.5, wash 1.1) against live horizontal distance.
- **The sniff window makes the drain unreachable at close stand**:
  while she's in 'engage', 'Search the wash' (priority 3) out-scores the
  drain (priority 2) at any stand where its prox <1.1 admits it — the
  crank is structurally unfocusable under ~1m. Phase-3 stand moved to
  1.05m: wash prox >1.1 AND align <0.86 → ineligible → drain alone.
Trap logged for future specs: **aim at it.pos.y + 0.6, not the prop**,
and always compute pitch from live horizontal distance — collision can
push a teleported stand point ~0.25m off.

## Sprint 286 — the counted run (scripted balance playtest)
`e2e/playtest.spec.ts` is the first real playtest: sim-drives the game
(renderFrame stubbed, dt=1/30 fixed clock — the runflow pattern) through
all 101 rooms of a 'standard' route × 3 seeds × 3 styles (walker/hider/
looter). Mechanics: `g.currentRoom=idx` + teleport to entryPos+1.3 toward
exitPos triggers spawnScheduled on entry; milestone/authored rooms run
under `g.godMode` (scripted fights a teleporter can't fairly run); hider
enters `room.hidingSpots[0]` via `player.enterHiding(spot,g.clock.time)`
and exits before the next room (`exitHiding` — teleport does NOT clear
hiddenSpot). New instrumentation: `g.lastDeathCause` stamps the killer.
Reports land in test-results/playtest-<style>.json. Numbers + the tune
(vend price bands int(4,9)→int(12,20) main, int(5,11)→int(14,24) under —
economy was ~5x coverage) are in docs/BALANCE.md.
Traps:
- `player.dead` freezes the frame loop — after a death you must
  `g.retryFromCheckpoint()` AND re-stub renderFrame/clock.tick (startRun
  rebuilds them).
- hider still dies 8-10×/run — all from sources that bypass hiding BY
  DESIGN (maelstrom reads spots, witness sight-holds, spotless corridor
  rooms, hazards mid-loot). Not a tune.
- pursuer×2 deaths in EVERY report are the scripted chases — noise, not a
  signal. Exclude milestone deaths from any tuning math.
- Loot income: looter pulls +33..+121 of the sim's 379-592 possible —
  sockets are sparse on some seeds (gilt-spine-777: 33) but still
  out-earn vend spend.

## Sprint 285 — the watched hall (the eye reads motion)
The hazard family's sixth axis — and the first that isn't touch, time,
or posture: `securityCam` (wall-mount dressing: lobby/records/gallery/
corridor/maintenance/milestone rooms, ~2–6/seed) and `searchlight`
(maint-server, corridor-checkpoint) are now live watchers. Each sweeps
a deterministic arc (cam ±0.95rad/7–11s, light ±0.5/10–14s); MOTION
inside the cone settles it for 0.9s → `[the eye settles on you]` +
`emit 0.5 'machine'` AT THE PLAYER'S POSITION — the building knows
where you are *now*, not where you were, and every existing listener
(warden, grafter, swamper, hauler ram) answers through the noise
system it already has. Still feet beat it mid-cone; the blind spot is
under the mount (d<0.45). `Tape the eye`/`Smother the beam` (feltWrap,
1.6s) blinds one permanently — the wrap's third job. `darkRoom` kills
watchers for free: drowned mains = dead eyes.
Traps:
- Wall-mount cam props carry `yaw` but no `y` — default cam pos.y=2.35,
  searchlight 1.4; world yaw = p.yaw + room.yaw (matches rotXZ).
- The watcher registry lives on HazardField from spec.props (sockets
  carry loot/hazards; watchers come from props).
- 's' fixture pair: cam@18 is DARK (dead eye — no verb, no report),
  cam@36 lit (live) — the leg asserts both sides on one seed.
- 'tape' joins InteractKind + the hazardContract defuse list — the
  contract now guards the eye's tell lines too.

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - The shared-anchor double-verb flag is open with Abhinav.
  - The taped eye could leave a 'seen' record hunters read differently
    (a warden seeing a taped cam knows the trick) — half-baked, skip
    unless a clean fiction lands.
  - The Auditor wanted-poster stays a design call.
  - wetFloor (13 uses) is still dead dressing — a second slip family is
    probably too same-y with armed puddles; keep dormant.

## Sprint 286 — the inspection sheet (watcher foresight, sixth book)
The last info-layer hole: watchers were the only threat axis no paper
covered. 'Read the inspection sheet — N imprints' (4–9) sits on
records/maintenance desks (roster hosts, roll 0.4, one paper per room —
a sheet never shares a room with a roster/complaint book). The read
scans `route.rooms` spec.props for securityCam/searchlight in the next
10 doors: `Door 036 — a live eye sweeps` / `the beam crosses` /
`a dead eye — mains out` (darkRoom watchers are marked dead). Library
map now: ledger predicts, roster locates, fault book files hazards,
register prices claims, work order files cargo, crew board files crew —
and the inspection sheet files eyes.
Traps:
- **New lootRng consumption reseats every downstream consumer** — the
  sheet loop moved 's' under work-orders from u-22+ to u-47+. Any spec
  pinning placement (or finding fragile geometry) breaks on reseat:
  legs must live-compute fixtures AND aim at the interactable's real
  focus point.
- **The +0.1 aim idiom is the +0.6 trap's older form** — work-order leg
  died on a reseated dense u-break kitchen because `pos.y + 0.1`
  couldn't reach the focus point `pos.y + 0.6` (interaction.ts). All
  `pos.y + 0.1` pitch lines in e2e were converted to +0.6 — the focus
  point is uniform for every interactable kind.
- A stale `vite preview` on :4173 + `reuseExistingServer` in
  playwright.config silently serves pre-change dist — `fuser -k
  4173/tcp` when a leg can't see brand-new code (this burned the first
  leg run this sprint).

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - The shared-anchor double-verb flag is open with Abhinav.
  - The Auditor wanted-poster stays a design call.
  - The sheet could mark hunter sign too (a 'survey copy' verb?), or
    dead mains could get their own second paper (the 'mains ledger' —
    which rooms are dark ahead — already implicit in the sheet).

## Sprint 287 — the confiscated case (e2e/hazards leg 7, generation spec, 'confiscate' stream)

What:
- `confiscated` loot sockets: lit watched rooms (a live securityCam /
  searchlight in spec.props, mains on) can hold a seized case ~2.4m out
  under the cone. The first lit watched room always carries one;
  subsequent watched rooms roll 0.6. Pays an item (latchpick /
  chalkSpool / doorChock / feltWrap / handLamp / sparkFlash) or 8–16
  imprints.
- 'pry' verb (priority 3 — same tier as the offset-anchor books — 2.2s
  hold): free goods, but the dwell sits inside the sweep and the crack
  rings as a 0.45 'machine' emit the room's listeners hear.
- Dedicated `confiscate` RngStream — placed AFTER applyForeshadowing
  (the witness cams are part of the watch set) on its own stream so the
  underscript generator's 'loot' draws don't reseat.
Traps:
- **Wall-mount dressing is builder-side only** — biome mount tables
  (builder.ts) add meshes, not spec.props. Watcher ingestion reads
  spec.props, which only has authored + foreshadow cams. Anything
  keying on watchers at GENERATION time must run after
  applyForeshadowing, not inside fillSockets (the first draft placed
  zero cases on 's' for exactly this reason).
- **Post-hold focus capture** — once a one-shot interactable is taken
  it disables and the next-best verb (a corridor phone 2.4m away)
  takes focus; a leg asserting the prompt must latch it DURING the
  aim loop, not read the last-seen focus after the hold.
- Shared-RNG reseat rule restated: prefer a NEW named stream over
  drawing an existing stream earlier (a new stream isolates its own
  shuffle; an existing stream reseats every downstream consumer).

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - The shared-anchor double-verb flag is open with Abhinav.
  - The Auditor wanted-poster stays a design call.
  - The case currently guards goods — a 'sealed warrant' variant could
    hold paper (a claims sheet for main-route ledgers: which rooms'
    effects were drawn).

## Sprint 288 — the marked approach (foreshadow completion + under foreshadow)

What:
- `foreshadow.ts` TELLS now covers EVERY schedulable entity — 16 new prop
  tell sets (bellman, porter, warden, groundswell, inspector,
  commissionaire, detective, curator, redline, stillframe, margin, editor,
  swamper, hauler, laundress, auditor) on top of the original 15.
  pursuer/hazard/orrery stay untelled (milestone/env, never scheduled).
- `builder.ts` FORESHADOW_TELLS decal sets added for the 11 entities that
  had none (bellman→footprintTrail, porter→high grimeStreak,
  warden→footprintTrail, groundswell→floor crackDecal, inspector→handPrints,
  commissionaire→scratchMarks, detective→small handPrints, swamper→wide
  floorStain, hauler→trail+low grimeStreak, laundress→floorStain,
  auditor→handPrints).
- **`generateUnderscript` now calls `applyForeshadowing(rooms,
  streams.stream('uscare'))`** before returning — the under decal tells
  (stillframe/redline/margin/editor/grafter/returner) were dead code
  before: built for the builder, never set by generation. New dedicated
  'uscare' stream (RngStream union + STREAM_SALTS) per the shared-RNG
  reseat rule.
- Economy-host finds (`LOST_PROP_HOSTS`, `BOARD_HOSTS`, `REGISTER_HOSTS`,
  `WORK_ORDER_SURF`) now skip `meta.foreshadow` props — a dropped sign
  shouldn't qualify as crew furniture. Main-floor host finds run inside
  fillSockets BEFORE applyForeshadowing so they were already immune.
Traps:
- Two foreshadow layers: prop tells (foreshadow.ts → spec.props with
  meta.foreshadow) and decal tells (builder.ts → room.foreshadow flag).
  The flag only sets on a back-1 room that is unscheduled + unmarked.
- Under rooms are NOT authored-flagged the way main milestones are —
  applyForeshadowing's `prev.authored` skip doesn't exempt landings;
  `u-stair-landing` rooms can carry tell props (harmless — inDoorLane
  guards paths).
- Adding a schedulable entity without a TELLS entry now fails
  generation.test.ts 'marked approach' coverage.
- `foreshadow` field type on RoomInstance is the entity id string —
  decal sets and prop sets are keyed the same way.
- Wax-bell looter income drifted 103→112 — the confiscated-case marks
  rolls, not foreshadow. Verify economy deltas against sim, not
  assumptions.

## sprint 289 — the cause reads (death screen uniform)

**What**: the death screen printed the raw kill-source id ('groundswell',
'commissionaire') while the curated hint map only covered the original 20
entities — newer killers got good caller hints but an unreadable cause
label. Now every lethal source reads the same way.

**Files**:
- `src/game/config.ts` — new `DEATH_NAMES` (fiction name per source, e.g.
  'the Groundswell', 'the House' for hazard) and `DEATH_HINTS` (the
  curated advice map moved out of killPlayer and extended to all 36
  sources). `killPlayer` prefers `DEATH_HINTS[source]` over the
  caller-passed hint — the map is the single source of truth for death
  lines now.
- `src/ui/App.tsx` — `.death-cause` renders `DEATH_NAMES[cause] ?? cause`.
- `test/generation.test.ts` — 'the cause reads' coverage: names+hints for
  every `ENTITY_TUNING` key + 'hazard' (fails when a new entity is added
  without read lines).
- `e2e/runflow.spec.ts` — death test asserts cause shows 'the Sweep' and
  hint shows the curated line.

**Traps**:
- `death.cause` / `lastDeathCause` stay the raw entity id — playtest.json
  and encounter stats depend on it; only the display layer gets the name.
- Callers still pass hints (deathHint() per entity) — those are the
  FALLBACK for sources not in DEATH_HINTS; keep writing them.
- Two callers can kill under one id with different caller hints (inspector
  has two sites) — the map collapses them to one line on purpose.

## sprint 290 — the sealed warrant (paper for goods)

**What**: the confiscated case had exactly two contents (goods / imprint
purse). Now some cases hold the seizure ledger itself — a warrant that
reads which cases ahead are still held vs already drawn.

**Files**:
- `generator.ts` — the case pass collects `caseSocks`; a post-pass on the
  same 'confiscate' stream converts ~35% of non-final cases to
  `meta.contains='warrant'` (drops `amount`). Final case is exempt — a
  warrant that reports on nothing is a blank.
- `Game.ts` 'pry' — `contains === 'warrant'` scans ALL later main rooms
  (not a stretch window — cases are 20-40 doors apart) for `meta.confiscated`
  sockets, prints `Door NNN — case still held|drawn`, capped at 6.
- `test/generation.test.ts` — 'sealed warrant' invariant (every warrant
  has a later case; carries no amount) + the confiscated-cases test now
  accepts 'warrant' as contents.
- `e2e/books.spec.ts` — drives gilt-spine-777 to warrant@22, pries, and
  asserts the read lists `Door 055 — case still held`.

**Traps**:
- Warrants are sparse by nature: ~1 in 3 non-final cases, and most seeds
  only carry 1-3 cases. A seed can legitimately ship zero warrants.
- The read window is the whole remaining route, NOT +10 — every other
  paper reads a stretch, this one is a full ledger (verified: +10 would
  have printed blank on both live seeds).
- **Stale preview server trap**: playwright.config `reuseExistingServer`
  keeps an old `vite preview` on :4173 — e2e ran the pre-warrant dist and
  reported 'no-warrant' on a seed that provably places one. When a new
  generation feature 'isn't there' in e2e, `fuser -k 4173/tcp` first.


## sprint 289b — counter-scent (the ash keeps)

(Parallel sprint numbering across concurrent branches — the warrant
implementation on main (sprint 290) superseded this branch's own warrant
draft; kept their seizure ledger, dropped the claim-read variant.)

What:
- Forging a sign now leaves a SECOND evidence record beside the lie:
  `{kind: 'water', weak: true}` — rubbed felt sheds a real trace even
  where the wire mark is fake. Caption: `a lie in wire; the ash keeps`.
- `hazardEvidence` reads three tiers now: fresh sign (both hunters),
  forged sign (both hunters), old sign (grafter only, sprint 270), and
  weak sign (grafter only, sprint 289b). The warden's sharper nose skips
  `weak` — `staleOk` (grafter keys) gates both `old` and `weak`.
- Grafter caption forks a third way: `[stone snuffles the ash — it
  smells hands]`. The lie still works; it just costs a residue that
  pulls the duller hunter to the same spot twice (once for the lie,
  once for the ash — separate records, read-once each).
- `weak` added to both evidence record types (room.ts field + the
  EntityCtx callback shape in base.ts — they're parallel interfaces,
  keep them in sync).
Traps: none new — the record lands at +0.4/+0.4 off the player so the
  grafter's room-of check still resolves inside the same room.
- Resume decodes the full route's GLB set on the main thread: first cold
  run can starve RAF for >60s (CDP stack samples show continuous
  GLTFLoader.loadBufferView/traverse). viewmodel:77 now stubs renderFrame
  and waits on an INTERVAL poll (RAF polling starves with the loop);
  the remaining flake is a cold-decode timeout, retry-warm passes ~5s.
  Manual g.frame() evaluates also queue behind decode — never trust a
  90s evaluate hang to mean a frame loop; sample the stack via CDP
  Debugger.pause first.

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - The shared-anchor double-verb flag is open with Abhinav.
  - The Auditor wanted-poster stays a design call.
  - 'Seen'-record echo (hunters that already read your sign act like
    they know you) — half-baked, logged skip.
  - A scrub that removes the lie leaves the ash? (Scrub radius 2.6m
    already takes both — no work needed; verify in play.)


## sprint 291 — the warden doubts (the wipe's shadow)

What:
- Scrubbing sign now leaves a permanent `wiped` evidence record
  (`kind:'wipe'`) where the mark stood — the floor smells worked.
- `hazardEvidence` returns wipes ONLY to `warden:` keys and never marks
  them read (`e.wiped || !e.readBy.includes(key)`; wiped records skip
  the readBy push) — a wiped floor poisons that hunter's reads in the
  zone permanently. Grafter keys never see them (its dumb nose doesn't
  smell cleaned floor).
- The warden partitions its scent list: wipes are a filter, not a
  target. Sign within 3.5m of a wipe → `[it doubts the mark — the floor
  smells wiped]`, no investigation; the mark is still consumed
  (readBy-marked on return, like every sign).
- The tradeoff: scrub twice and the floor betrays your LATER lies —
  a forge or real kill beside a wipe is doubted, never believed.
  Scrub is now both cleanup AND inoculation for a spot you control.
- Scrub offers skip wiped records (nothing to rub); a re-scrub still
  erases wipes within 2.6m like any record.
Traps:
- 's' warden patrol line passes ~0.8m from its room origin — e2e can't
  assert "never approaches" as proof of no-investigation; assert the
  `investigate` field stays null (runtime-readable on the entity).
- vitest ctx stubs must mirror the callback contract: wipes return
  unmarked for warden keys — the doubt test's stub replicates
  `e.wiped || !e.readBy.includes(key)`.

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - The shared-anchor double-verb flag is open with Abhinav.
  - The Auditor wanted-poster stays a design call.
  - 'Seen'-record echo — half-baked, logged skip.
  - A wipe could decay ('the smell fades after N minutes') if permanent
    zone-poison proves too strong in play.

## sprint 292 — the sign goes cold

What:
- `hazardEvidence` gains a time axis: `e.t >= clock.time - 360` for
  non-grafter keys — a mark older than ~6 sim-minutes has dried and the
  warden stops believing it (grafter keys exempt: `staleOk` — the grafter's
  whole diet is ghosts anyway). Wipes bypass the clock (`e.wiped ||`)
  so the doubt-zone never ages out.
- Fresh sign now has a shelf life: kill a hazard early and by the time
  you backtrack the warden shrugs — loud work is marked work, but only
  RECENT work. Your forge's lie dries too (~6 min per planted bait).
- e2e 'the sign goes cold': a `t = now-400` mark never reads (readBy
  stays empty — not even consumed), a fresh mark same room pulls.

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - The shared-anchor double-verb flag is open with Abhinav.
  - The Auditor wanted-poster stays a design call.
  - 'Seen'-record echo — half-baked, logged skip.

## sprint 293 — the second read teaches ('seen'-record echo)

What:
- The warden counts in-room marks it weighs: `signReads`. Doubted marks
  count too — reading enough sign, believed or not, teaches it the
  floor is worked.
- At 2+, `learned`: patrol speed ×1.18, end-pauses 1.6s→0.9s, the
  arrive-and-scan lingers 1.8s→2.6s. One cue: `[it knows this floor is
  worked — the pace quickens]`. State lives on the warden instance —
  it un-learns when it despawns.
- The first kill marks you; the SECOND makes you a pattern. Loud work
  in a warden's room now escalates the hunter, not just the paper.
Traps:
- The live hazardEvidence marks readBy on ALL returned records; the
  warden weighs only to the first in-room mark (`break`). Two
  simultaneous marks → the second burns unseen, never counted.
  Vitest stubs must feed marks one per call (`.slice(0,1)`), as they
  arrive in play.
- Patrol speed comparisons need PATH length, not net displacement —
  the a–b line is back-and-forth; |end-start| ≈ 0 regardless of pace.
- A second warden spawned on the same hostRoom shares key
  `warden:N` — same-ctx baselines read nothing (readBy already full):
  useful for A/B pacing tests.

## sprint 294 — the whistle dies quick

What:
- The learned escalation reaches the strike: a learned warden's
  whistle grace drops 0.35s→0.12s and its charge runs 4.3 (was 3.5).
  The whistle caption changes — `[a whistle — the Warden already
  knows you]` — the tell that the worked floor armed the strike.
Traps:
- Whistle-timing assertions: leave slack for an LOS blink — `seenT`
  decays on a missed frame (pin-ahead ordering cost one frame).
- Charge speed needs a path-length measure while pinning the player
  ahead of live heading — a static target ends the charge early
  (strike at <1.0m) and caps `walked` at the gap, not the speed.
- Keep walked measurement under the 1.5s lost-scent grace — a stray
  LOS drop mid-measure ends the charge.

## sprint 295 — the rubble hungers (learned grafter)

What:
- The grafter's escalation is appetite, not pace: `markReads` counts
  in-room marks it drags to (old/weak/fresh all count — its diet is
  ghosts). At 2+, eager: base drag ×1.15, the notice multiplier
  1.4→1.75, lifeT cap 75→120 (it lingers feasting). One cue:
  `[stone has tasted too much — it hunts in earnest]`.
- Asymmetry on purpose: the warden quickens; the grafter hungers.
Traps:
- Grafter A/B roam measures DON'T work: pickRoam seeds off
  `lifeT` — two instances at different ages pick different targets.
  Measure drag speed instead: same spot, fresh mark, frames-to-mark.
- makeCtx's stub player is `protection: 'exposed'` — a hiddenSpot
  field alone does NOT hide them; `notices` outranks the scent target
  within seeRange (9m). Set `protection = 'hidden'` explicitly or the
  grafter chases the player, not the mark.
- Grafter kill is instant at killRange once `rising` ends — keep the
  player 'hidden' in drag-measure tests.

NEXT SPRINT IDEAS (pick the biggest first)
  - Milestone-set hearing remains a design call (needs Abhinav).
  - The shared-anchor double-verb flag is open with Abhinav.
  - The Auditor wanted-poster stays a design call.
  - Counter-learning: a player could OVERFEED a room's hunter
    (plant cheap forged marks to... nothing — learning only helps the
    hunter; the feed is pure cost. Skip.)



## review fixes — mounted tells + the honest looter (post-merge, PRs #12/#13)

**What**: Devin Review flagged the merged sprints. All four findings real:
- `applyForeshadowing` dropped every tell at floor level — wall-hung kinds
  (keyRack, pegRail, towelRail, sign, wallVent...) plus transomWindow and
  securityCam sank through the floor. `WALL_MOUNT_Y` is now exported from
  templates.ts; foreshadow mounts those kinds at eye height flush on the
  wall face (TELL_MOUNT_Y adds transomWindow/securityCam at 2.3 — not in
  the table; their templates mount them explicitly).
- playtest looter never fed a machine: the prompt regex missed 'Feed the
  machine' and single-frame `interactPressed` can't complete a 1.2s hold
  verb anyway. Loot pass now holds KeyE up to 45 frames on
  /feed|vend|claim|pry|register|read|search|loot|take|open|drawer/.
- Retry restores checkpoint currency → income depended on death timing.
  Earned counters (imprintsEarned/marginaliaEarned) are now banked past
  the restore (`banked`/`econBase`) — net-of-spend is the honest figure.
- Comment said looter = walker + loot; it actually hides like hider.
  Comment corrected; semantics unchanged.

**Numbers moved** (BALANCE.md): looter net +121/+33/+103 → +5/+23/+0 —
vend prices after sprint 286 roughly balance a looter's income, so the
'~5x coverage' read was unspent-wealth inflation.

**Trap**: any tell/host-find that injects props must respect mount
conventions — check WALL_MOUNT_Y membership before placing at y=0.


## sprint 296 — the archive keeps score

**What**: the death screen promises "a new document may be unlocked" but
the newer cast (~19 kill sources) had no `doc-*` entry at all — the
promise was empty for half the roster. Filled the shelf:

- `documents.ts` — 'Entity: X' codex entries for bellman, porter, warden,
  groundswell, inspector, commissionaire, auditor, swamper, hauler,
  laundress, lurker, behemoth, collector, singer, grafter, orrery,
  detective, husk, and hazard ('the House'). Codex voice: what it is +
  the counterplay rule, matched to DEATH_HINTS intent.
- `generation.test.ts` — 'the cause reads' now also asserts every
  ENTITY_TUNING key + 'hazard' has a `doc-${id}` in DOCUMENTS.

**Tuning**: none. Documentation-only sprint; all new docs are category
'entity', unlockedAt 0 (unlocked by the kill that names them).


## e2e harness — the RAF-death flake (viewmodel:77)

**What**: `viewmodel.spec.ts:77` ('lit lamp takes the hand while its beam
is on') starved for multiple full runs under machine load — diagnosed as
the runner's `requestAnimationFrame` dying outright: `lastFrameNow`
froze at boot+4.5s while the page's event loop stayed live (KeyF still
bound, `lampOn` toggled). Not a pause, not decode-starve — zero RAF
callbacks for 150s+.

**Fix**: the leg now steps the sim manually — `g.frame()` is called
inside `waitForFunction` polls, so a dead RAF can't wedge the leg:

- Gate before key presses: `clock.time` only advances when the sim
  actually ticks (phase PLAYING/MINIGAME) — poll `g.clock.time > bootT`
  with `g.frame()` inside the predicate. This replaces fixed-cadence
  presses racing the PLAYING gate (keydowns in non-PLAYING phases are
  silently discarded — `useLamp`/`useActiveSlot` bind only while running).
- Beam build needs one sim tick after `lampOn` — same `g.frame()` step
  inside the beam wait.
- `frame()` is private but runtime-callable; each manual call
  re-schedules one RAF — bounded and self-healing when RAF revives.

**Trap**: `.hud` visible does NOT mean PLAYING — it renders for
PLAYING|MINIGAME|PAUSED. `phase` is not on `window`; `clock.time`
advancing is the only reliable "sim is running" signal, and `g.resume()`
exists if a PAUSED verdict ever needs breaking (the pointerlockchange
listener pauses on lock loss).


## sprint 297 — the Filer (the index files your questions)

- The under's third ledger entity: a hooded clerk at an index drawer who keeps
  the tally of what you **ask** — distinct from the Auditor's tally of what you
  **take** and the Detective's register of what you **carry out**. Every paid
  consult (workOrder, crewBoard, claimRegister) increments `paperTrail`.
- `trailOwed` ctx callback (`base.ts`), like `claimsOwed`/`heldOwed`. Filer:
  slow look (~2.5s shared presence) when `trail>=3 && player in spawnRoom` →
  `filed`/`posted`, registers a `square` interactable ("Square the index"),
  and each fresh room entered within ±8 emits impact noise at the player
  (intensity 0.5 — the halls listen for your step). Non-damaging. 'square'
  charges `min(4+trail*2,14)` marginalia → `filer.squared()`.
- **Trap (the real lesson of this sprint):** `applyForeshadowing` consumes the
  shared 'uscare' stream *per scheduled room* — scheduling a new entity BEFORE
  that pass shifts every later tell's placement (a ropeBarrier ended up sealing
  a door leaf). New post-encounter scheduling goes AFTER `applyForeshadowing`,
  then calls it again with the new third arg `only: Set<string>` to lay that
  entity's tells on its own stream. Both halves draw on 'filer' exclusively.
- **Trap 2:** the main-route scheduler iterates every `ENTITY_TUNING` key minus
  a hardcoded under-entity exclusion list — a new under entity MUST be added
  there or it rolls as a main-route candidate (filer appeared at r-95).
- e2e 'the index' (undercast): `paperTrail` is TS-private → runtime writable
  (`ga.paperTrail = 3`) — drives the full loop without scripting three consults.

## sprint 298 — the docket pilfer (both ledgers in one reach)

- The Filer's own drawer is lootable: 'Rifle the docket drawer' (0.9s hold,
  registers at spawn, one-shot `stock=1`, priority 2 — sits under 'square' 4).
  Pays like a sledge pick (60% 4–9 marginalia, else an under item) but prices
  BOTH ledgers: `unpaidTheft += 1` (the Auditor counts it) AND
  `paperTrail += 2` — reaching into the index is the loudest question the
  under records. At trail 1 the rummage literally files you mid-reach.
- The square point survives a docket pilfer and vice versa — they share the
  station: square anchors 1.15m toward room center, the docket sits ON the
  deskPos (y=0.9). Focus scoring separates them by ~1.1m; same aim-pitch
  idiom (`pos.y + 0.6`) drives both.

## sprint 299 — the counter-claim (the paper that files YOUR file)

- Sixth under paper: 'File a counter-claim — N marginalia' (4–8, desk hosts —
  the register family). Strikes 2 lines off `paperTrail`, then logs the
  asking as a consult (+1): **net −1**. At trail 0 it shrugs and charges
  nothing; at trail 1 it nets 0. It can lighten a file, never clean it —
  only the Filer's desk squares the card.
- Generator: post-pass on the new 'countersign' stream (isolated from every
  lootRng consumer around it), placed after the work-order block.
- e2e 'the index' now drives the full ledger arc: counter-claim (4→3) →
  rifle the docket (3→5) → filed → runner → square (→0).



## sprint 297 — the subfloor counts too (under playtest legs)

**What**: `e2e/playtest.spec.ts` never measured the Underscript — half
the game had zero balance data. The spec now runs 6 legs: the three
main styles + `under-<style>` on `route.underRooms` via
`enterUnderscript()` (private in TS, runtime-callable).

**Numbers** (BALANCE.md): under walker 23/23/24 deaths, hider 17/16/16,
looter 11/9/13 + marg +18..+30 — the subfloor is ~1.5-2x main-route
pressure, deaths concentrated on redline (~50%) + grafter/returner.
Hider residue beyond alarms is ~3-5/121.

**Harness traps** (cost ~2h to learn, don't relearn):
- Back-to-back under seeds in ONE playwright page slow to a crawl and
  wedge the renderer (~45min stall, CPU flat). The under legs `boot()`
  a fresh page per seed — keep that or legs die on timeout-retry loops.
- Under patrol entities never vacate, so walker+hider use budget 150
  under (no pass to outlast); looter keeps 240 for socket loops.
- `PLAYTEST_SEEDS` env narrows the sweep for smoke runs.
- `page.on('crash')` is logged on under legs for future stalls.


## docs — the open calls, decision-ready

**What**: the three Abhinav-blocked backlog items (milestone-set
hearing, shared-anchor double-verb, Auditor wanted-poster) are written
up in `docs/DESIGN_CALLS.md` — status quo, options, and a
recommendation each. When he answers, delete the doc's settled section
and build the pick.

**Recommendations recorded**: milestone hearing → light touch (primed
opening tell only, fights stay authored); double-verb → yaw-window on
`strip` (~10 lines, matches pry's shared-anchor disambiguation);
wanted poster → poster-as-evidence on downstream boards, suspicion
tier only, or skip to keep the under's threat texture physical.


## sprint 299 — lockers at the end of the corridor (under cover + hider truth)

**What**:
- `injectCornerCabinet` (generator.ts) — shared corner/mid-wall cabinet
  injector; fixes a latent bug on BOTH routes: density passes pushed
  `spec.hiding` post-instantiate but never `spec.props`, so injected
  cabinets hid you inside nothing (functional cover, no mesh). Now the
  locker prop lands too.
- `ensureUnderCoverDensity` — the under had no density pass at all:
  cover in 48-60% of rooms, dead stretches to 7 rooms (main enforces ≤2
  natural). Same ±2 window → no 5-room dead stretch; authored landings
  skipped; mid-wall candidates cover corridor-width templates
  (u-long-hall) whose corners all sit in door lanes. Runs AFTER
  scheduling so spawn counts don't move — cover only, never more
  patrols. Fork: `roomStream('dressing', 790)`.
- e2e hider model was wrong in a way that mattered: it hid from ANY live
  entity and never waited out a pass. Under patrols never vacate → the
  hider lived in lockers → panic re-entry lockout ate every room hop →
  every "redline kill" landed in the forced ~1.6s exposed transition.
  Fixed model: hides only for RUNNERISH entities (sweep/reprise/
  maelstrom/redline/returner/pursuer/orrery), waits passes out inside
  the locker (600f cap), un-hides when quiet, backtracks ≤2 rooms for
  cover, flees forward when there's none. Log adds `deathsHidden` +
  `deathsSeq` (`room:cause~liveEntities`, `^` = died hidden).

**Re-measured** (BALANCE.md sprint-299 correction): hider-under 8/7/9
(vs 17/16/16 artifact) — ZERO runner deaths in 363 rooms. Residual =
grafter×4-6 (walks blind into rubble — honest counterplay), margin×2
(reads cover), editor×1 (authored climax). The "under ~2x for hider"
read retracts — main-parity; the under's extra edge lives in room
hazards, not corridors. hider-main 9/8/12, same profile.

**Traps**:
- Multi-seed under runs still intermittently crash the page even with
  boot-per-seed (browser-process OOM across heavy evaluates). Solo
  seeds are reliable (~45-100s): `PLAYTEST_SEEDS=<seed> npx playwright
  test e2e/playtest.spec.ts -g under-hider`. Collect per-seed when
  measuring; don't trust a crashed 3-seed run's retry.
- `enterHiding` returns false inside `panicLockoutUntil` — any scripted
  re-hide must survive ~1.6s of exposure, exactly like a player.

## sprint 300 — the runner made flesh (cut the courier)

- The Filer's post is now physical: `openIndex()` sends a courier sprinting
  the under spine (`corridorPath` toward spawnRoom±8, the route-flow
  direction). ~3.4 m/s far, **1.2 m/s while the player is within 4m** —
  a courier isn't a fighter; closing on it is the only window 'Cut the
  runner' (1.0s hold, prox-gated like pick/strip, per-frame at runnerPos)
  gets. At 3.4 it outruns a hold mid-press.
- `cutRunner()` = the word dies mid-delivery (posted/filed off, index
  closes torn, no fee) BUT `paperTrail` stays — the ledger is still
  yours; she re-files a heavy asker on the next slow look. Cutting buys
  hall-silence, not absolution. Escape ⇒ the word is out, unrecallable.
- Runner is Filer-internal (not a scheduled entity): no ENTITY_TUNING /
  TELLS / DEATH_NAMES / scheduler entries needed.
- Traps: the interactable id must NOT embed `currentRoom` — the chase
  crosses rooms and a churning id resets the hold (`cutWord-<space>:filer`
  is stable). Runner's note mesh uses MAT.paper().
- e2e 'the index' now drives the full arc: counter-claim → docket rifle →
  file → wordOut → chase → cut → word dead → re-file → square → 0.

## sprint 301 — the return slip (theft ledger's relief valve)

- The Auditor's book gets the counter-claim's twin: 'File a return slip
  — N marginalia' (3–7, priced a notch cheaper than counter-claims) on
  the LOST_PROP_HOSTS family — you file the return where the thefts are
  taken. Strikes 2 off `unpaidTheft`, the filing itself is claimed (+1):
  net −1. Never cleans the book — only his desk settles. Blank ledger
  shrugs free. Same economics as sprint 299's counter-claim, aimed at
  the OTHER ledger — the two papers complete the relief-valve pair:
  questions answered at desks, thefts answered at cages.
- Own 'returnslip' stream + salt — the isolated-roll rule again; the
  counter-claim spec now lists it in the cache-fill contract's exempt
  metas (`!x.meta.returnSlip` — new consult-socket metas belong there
  or generation.test.ts:474 goes red while a -t filter hides it).
- e2e 'the audit' seeds theft 3 then files a slip mid-ledger:
  3 → 2 (−2, +1) before the settle still closes the book.



## sprint 302 — the affidavit (held ledger's relief valve)

- The triad closes: 'File an affidavit — N imprints' on records/
  maintenance/lobby/guest desks — a sworn statement the held goods
  reached their owner. Strikes 2 off `unpaidHeld`, the filing itself
  enters his book (+1): net −1. Blank register shrugs free. The ONLY
  relief valve priced in imprints — the under twins run on marginalia.
  Every ledger now has entity desk (full settle) + paper valve (−1).
- Own 'affidavit' stream + salt; placed at generateRoute scope AFTER
  every filing pass (streams aren't in fillSockets' scope — the
  confiscate pass shows the pattern). Exclusion checks register too —
  lobby rooms can hold counter + frontDesk and would otherwise take
  two papers; 'frontDesk' isn't a template prop kind (compile error),
  lobby/guest desks resolve as consoleTable/desk/writingDesk.
- e2e detective leg seeds held 3 → files the affidavit → 2 (−2, +1),
  then the clock/ring/settle arc still runs.


## sprint 303 — the word goes upstairs (ledger coupling)

- `escaped()` now files: the courier that gets past you carries the card
  to the house register — `wordFiled` ctx callback → `unpaidHeld += 1`,
  cue '[the card reaches the stairs — the house register gains your
  name]'. The runner heads down-spine toward the egress, so an escape
  was always "bound for the stairs" — now it's mechanically true.
- Cutting buys silence below AND above (a torn card never files);
  escape brands you in the Detective's book — the under ask-ledger
  feeds the upstairs claim-ledger. First MUTATING ctx callback
  (all prior hooks were `*Owed` getters) — `wordFiled?: () => void`,
  optional like the rest for headless ctxs.
- e2e 'the index' now runs BOTH courier endings in one leg: cut the
  first (word dead), let the second run out after she re-files
  (`unpaidHeld === 1`), then square. vitest asserts `wordFiled` fires
  exactly once on escape and never on a cut.



## sprint 304 — the last two drawers (entity-drawer rouse + pRoom=-1 trap)

- The Filer's docket is riflable (s298); the Auditor's tally and the
  Detective's register weren't — you could pick the SLEDGE under him but
  not the book he guards. Both now add their drawer at onSpawn:
  'tallyDrawer' / 'registerDrawer', one-shot, 0.9s, priority 3 —
  MUST outrank the desk's own loot sockets (priority 1); the settle
  point (4) outranks them once the rouse fires, so the rummage is a
  one-shot surprise, not a repeatable trick.
  Game case prices its own ledger (+2 theft / +2 held) and calls
  keeper.rifledTally()/.rifledRegister() — the book slaps open / your
  face files itself, on the spot, no slow look.
- REAL PRODUCT FIX — the rouse guards: entity rouse checks used
  `roomOf(player.pos) !== spawnRoom`, but `roomOf` returns the FIRST
  bounds match, and room rects overlap at borders — a stand inside the
  desk room resolved to a NEIGHBOUR's index and the guard skipped the
  rouse entirely. All rifledX() now use proximity to the drawer
  (dx²+dz² > 2.6² → return): hands in the drawer mean you ARE at his
  desk.
- REAL PRODUCT FIX — the -1 cool gap: Detective's `cool()` read
  `Math.abs(pRoom - spawnRoom) > 10` unguarded; `roomOf` returns -1
  BETWEEN bounds (desk-edge niche, door threshold) → |−1−26| = 27 →
  the warrant cooled the instant it opened. Same gap existed in the
  Auditor's pursuit-end and the Filer's posted-cool — all three now
  `pRoom >= 0 &&`. Between-bounds is "still here", not "outrun".
- e2e traps: entity drawers can't be driven on a CLEAN ledger via the
  usual entry — owed>0 auto-rouses (his demand beats your rummage:
  priority-4 settle steals the drawer's focus mid-hold). Reseed the
  ledger to 0 before entering so the RIFLE is the rouse under test.
  Adaptive-stand idiom for crowded desks: rotate an 8-angle stand list,
  hold E only while `focused?.id === drawer.id` — neighbours (loot
  socks, prop drawers, affidavits) share the 1.9m prox gate and steal
  holds mid-rotation. Warranted slips must be SHORT (6 frames out,
  5 back): the wire's ring wakes the neighbour's listeners and a grab
  drags the player >10 rooms — the cool is then legitimate.



## sprint 302b — review debt: wall-eject exits, honest docs, echoskin fix

- Devin Review triage on merged PRs #17/#18/#20 — all findings real, all fixed:
  - injectCornerCabinet two of five corners faced a wall and ejected the
    player out of the room on leave; the furniture check also counted
    floor-flat props (manholes) as cover so the locker mesh never spawned.
    Corners now yaw into the room; hasFurniture needs a ≥0.5 collider.
  - The same convention slip existed in authored spots: records-vault
    cabinet, gallery-rotunda's second losAlcove, morgue-drawers locker,
    library-stacks desk-hide all exited through a wall. New test sweeps
    every template ×5 seeds: each hiding spot's exitPos must land inside
    its room, and injected cabinets need a real prop body.
  - Death now reloads `documents` into state so the Archive stops showing
    freshly-unlocked docs as locked until restart. Singer doc rewritten to
    match the nonlethal trail-follower it actually is. DESIGN_CALLS yaw
    rationale + poster scope wording corrected. Playtest hider keeps
    fleeing when exposed with no cover instead of skipping to idle.
- Carried fix for sibling sprint-291's `Echoskin.onSpawn` using undeclared
  `c` (main's tsc was red; `this.ctx.player.pos` instead).
- Gates: tsc, lint, 213 vitest, 5-seed sim, build — all green.

## sprint 400 — the second count (balance re-audit)

- `scripts/balance.ts` + `npm run balance`: repeatable per-entity +
  per-decile encounter histograms + max scheduled gap across the QA
  seeds — the tool BALANCE.md's method assumed but never committed.
- Numbers (5 seeds): main maxGap ≤9, ~19-20 distinct ids/seed, no
  dominant pick (worst: redactor 6, sweep 5, hollow 7); decile curve
  holds the safe opening (0 in 0-9) with a mid-run ramp. Under stays
  the gauntlet (62-73/121) with editor pinned at 1.
- The new cast is alive on real seeds: commissionaire/groundswell/
  porter/warden/bellman up top; filer+auditor 3-4, detective+inspector
  1-3, laundress 0-2 (flooded-only) — thin but present by design.
- No tuning: distribution is intentional; rerun the count after any
  roster or pacing change instead of guessing.
- HANDOFF retitle: my PR #23 entry renumbered 302 → 302b (sibling's
  sprint 302 = the affidavit). Parent/child numbering is now disjoint:
  child keeps 3xx, parent takes 400+.

## sprint 401 — the calls come in (primed milestones, sledge yaw, wanted sheets)

- DESIGN_CALLS all answered (B, B, A):
- **Milestone hearing (B)**: `Milestone.primed` + `prime()`. Loud work in
  the three doors before a set piece primes it — onRouseNoise primes
  milestones at currentRoom+1..+3. Same mechanics, hotter opening tell:
  Index/Engine curators start already moving toward the entry door,
  the Custodian greets you watching the door, Lens Hall beams open
  mid-sweep — each with a "[it heard you three doors back]" caption.
- **Sledge strip yaw window (B)**: 'Strip the lamp' needs you facing the
  lamp (dot >= 0.6, always inside 0.5m) — grazing the pile while looking
  away no longer strips it.
- **Wanted posters (A-lite)**: `ctx.wanted` flag. Once an Auditor's ledger
  names you (demanded) with unpaid tally, `wantedNotice` sheets pin to
  the faces of crew-board furniture in the next 5 host rooms downstream
  and under-crew notice reach widens 1.5x (Grafter sight, Hauler +
  Laundress hearing). Settling the tally pulls the sheets down.
- Test: test/priming.test.ts covers primed/unprimed Index, Lens Hall
  primed caption, prime idempotency.
- Gates: tsc, lint, 217 vitest — green.
## sprint 305 — the count (the till rings late)

- The under's trace axis: pilfering CREW property (marginalia `claim`
  cages, sledge `pick`, lamp `strip`) queues a loss-report in
  `src/engine/crewCount.ts` that `sound.emit`s at the socket ~75s later —
  intensity 0.6 'item', so it ROUSES dormant encounters through doors and
  pulls the room's own listeners. Delayed heat that lands where you WERE:
  pilfer-and-move misleads (the count hunts your shadow), pilfer-and-linger
  and it finds you. The laundress's keen generalized — the books wail too.
- Entity desks are NOT crew property (they keep their own books — the
  drawer rouses are their count). The wash isn't queued either: her keen
  IS the count for her load.
- Traps/log: `emitCaption` displays every captioned event regardless of
  distance — the player "hears" the count anywhere, which is the intended
  tell. Sound events for listeners need NO `source` field (sourced events
  are self-noise, filtered by noiseCanBeHeard/noiseCanRouse).
- Harness: `scripts/soak-cdp-raw.mjs` + `scripts/soak-eval.js` — when
  playwright's fresh launches enter the `trap int3` Compositor crash state
  (dmesg; NOT OOM), drive the same playOnce evaluate on the desktop Chrome
  at :29229 via raw CDP. Needs a self-started `vite preview :4173` (the
  suite's dies with its runner → new tabs land on chrome-error://).
- Gates: tsc, lint, 218 vitest (+2), 5-seed sim, economy+undercast 13/13
  (+the count leg), build.

## sprint 306 — the checker (the count sends a lamp)

- `src/entities/crewChecker.ts` — a Game-managed walker (NOT an Entity;
  the count is reactive so the responder must be too). A rung count now
  also dispatches a hooded checker with a live PointLight lamp who walks
  the under spine (corridorPath reversed — the crew comes from deeper),
  sweeps the rung socket ~26s, and walks on.
- The find: exposed player in the socket room for >1.4s of sweep → a
  0.75 'impact' emit AT THE PLAYER — the building learns where you are
  NOW, same trick as the detective's phone. Non-damaging, crew-style:
  the word, not the wound. Vacated/hidden = clean sweep, it moves on.
- One walker at a time (dispatch returns false while out — the rings
  still emit, the books don't send a crowd). Player-facing chain:
  `[the count is answered — somebody walks the row with a lamp]` →
  `[the checker's lamp finds you — the count stands]` or
  `[the checker counts the till and moves on]`.
- Fixed a latent sprint-305 bug found while wiring: crewCount losses
  survived startRun — a queued report would ring in the NEXT run at a
  stale socket. `CrewCount.reset()` + `checker.reset(hooks)` now run in
  startRun beside `this.hazard = new HazardField()`.
- Tests: roomOf is exported from crewChecker (entities have their own
  private copies — this one takes (rooms, p) args for headless driving).
  e2e: `ga.checker.stage` is runtime-reachable (TS private ≠ #private).
- Gates: tsc, lint, 218 vitest (+4), undercast count/index/audit/checker
  legs 4/4, build pending.

## sprint 307 — strip the checker's lamp (the boldest pilfer in the under)

- The crew's counterparty carries stealable light: 'Strip the lamp'
  (1.1s hold, prox-gated per-frame interactable on the walking checker,
  new kind `stripCheck`) frees a `handLamp` at 45 charge — between the
  scavenged bulb's 30 and the sledge lamp's 55.
- The recursion is the design: it is HOLDING the light, so it feels it
  die on the spot (0.65 impact emit at ITS position — wakes the room),
  and the lamp is crew property → the strip files ANOTHER loss-report
  (crewCount.push) → ~75s later the books send the next checker, fresh
  lamp wired. The lamps are endless; you can strip every one.
- Blind counting: `lampLit` gates the sweep's find — strip before or
  during the sweep and it counts you invisible, closing with
  `[the checker counts blind — the count stays open]`.
- Traps/log: checker's interactable id is a constant 'stripCheck' (one
  walker at a time, so no room suffix needed — hold persists across its
  walk since the id is stable while pos tracks it). Game passes the
  checker as `it.data` — same cast-to-Record pattern as the hauler.
- Gates: tsc, lint, 222 vitest (+6 incl. 2 strip specs), 5-seed sim,
  undercast **10/10** (+strip leg), build.

## sprint 308 — the quiet amendment (bury the count before it rings)

- Seventh under paper: 'Misfile a line item — N marginalia' (6–11, the
  register's desk family: filing/cubicle/schoolDesk/keyCabinet/
  recordsCage). The filing strikes every PENDING loss-report out of the
  count — buried reports never ring, so no checker is dispatched.
  It is a timing play, not a pardon: a checker already walking keeps
  walking, and the pilfer itself is already in the Auditor's tally.
- Blank books shrug free ('[the tally is already honest — nothing to
  bury]'); short purse warns. One-shot per socket (`meta.taken`).
- New RngStream 'misfile' (0x151f11e5) isolates the 0.08 roll — same
  safe-landing / foreshadow-host exclusions as the other papers.
- Traps/log: the e2e leg needed TWO aim fixes — (1) pitch must target
  the focus point `pos.y + 0.6`, not the socket point: a desk-elevated
  socket aimed at raw pos.y is a ~55° down-pitch that fails the 0.86
  align gate (the +0.6 focus point sits near eye level). (2) standing at
  `sock.pos + 0.4x` puts you INSIDE the host desk's collider — the frame
  pushes you ~1.1m out and swings the aim ~45° off. Stand on the
  room-center side: `sock.pos + dirToCenter * 0.9` (the paper juts that
  way by design). Distances recompute from g.player.pos AFTER teleport.
- Gates: tsc, lint, 225 vitest (+1 gen spec), 5-seed sim, undercast
  **11/11** (+quiet amendment leg), build.

## sprint 309 — the dead line (the wire's counterplay)

- The Detective's broadcast finally has a physical counter: 'Pull the
  house line' (1.4s hold) on a junction box + conduit mounted beside his
  entry door (entryPos + perp*0.75 − entryDir*0.25, y1.25 box).
- The pull is sabotage, not a trick: it emits '[a junction box comes off
  the wall]' (0.5 item noise — heard), bills +1 held as damages
  (ctx.lineCut → unpaidHeld+1), and his desk phone dying files a face on
  the spot — `openRegister()` runs with the dead-line cue variant
  ('[the line is dead in his hand — he files your name longhand]').
- Asymmetry vs the runner-cut: cutting the courier kills the whole
  filing (card closes torn); pulling the line kills only the broadcast —
  `warranted` never sets (or dies mid-run) but `clocked` and the settle
  desk stand. The under's word is carried; the house's wire is
  infrastructure.
- openRegister now sets `warranted = !lineDead` — pull BEFORE the slow
  look lands and the wire never starts (prevention play, still priced).
- Fixed the latent cool-gate hole: `warranted &&` gated the outrun/payoff
  cool — a dead line never sets warranted, so a clocked-only register
  could never cool. Now `(warranted || clocked) &&`.
- Traps/log: test fixtures lack entryDir — `room.entryDir?.x ?? 0`.
  lineMesh stores the GROUP (box+pipe), not the box — removeEntityMesh
  needs what addEntityMesh got. The junction is registered at spawn
  (entity interactable, not a socket — no generation allowlist needed).
- Gates: tsc, lint, 228 vitest (+3), 5-seed sim, economy **6/6** (+dead
  line leg; the phone-ahead leg still passes unchanged), build.

## sprint 310 — the witness mark (the find joins the ledgers)

- The checker's lamp find used to cost only a noise emit — the cry to
  the room and nothing else. Now `CheckerHooks.witnessed` fires once
  per dispatch on the find and Game writes it into the house book:
  `unpaidHeld += 1` + '[the lamp holds your face — the register gains
  a witness]' (warn cue).
- Design: the counterparty's light holding your face IS a statement —
  the under's count and the upstairs register now bind through one
  mechanic. Get seen by the crew's sweep and the Detective's desk grows
  a line you must settle (or escape via affidavit / paying the held
  balance).
- Asymmetry kept: strip the lamp and the blind sweep still files
  nothing — the witness mark is exactly what the light buys the crew.
- The hook lives on CheckerHooks (not entityCtx) because the checker is
  a Game-managed walker, not a RoomEntity — same one-shot-per-dispatch
  contract as the emit itself.
- Traps/log: hooks() test helper gains the `witnessed` vi.fn — a
  blind-sweep spec asserts it never fires. The e2e checker leg sets
  `unpaidHeld = 0` pre-run and asserts `=== 1` after the find.
- Gates: tsc, lint, 228 vitest, 5-seed sim, undercast **12/12** (the
  checker leg asserts the witness line + cue), build.

## sprint 311 — the floor closes for the count

- While the checker walks (`checker.active` — inbound, sweep, or
  outbound), every broker pedestal in the under refuses trade:
  '[the floor is closed for the count]' (warn cue on the attempt). The
  prompt stays up; the refusal is the tell. When he despawns the floor
  reopens — same pedestal sells normally.
- Design: a pilfered under goes market-dead for exactly the dangerous
  window — you cannot spend marginalia while the crew audits your
  theft, so the count's 75s-delayed walk now prices TIME as well as
  noise. Scoped to the Broker deliberately: he is the only STAFFED
  marginalia point (same scoping rule as sprint 282's marked rate);
  cages and papers are unattended reads, not staff you can shutter.
- The gate sits in Game.tryInteract's 'shop' case after the
  broker/sold guards — non-broker 'shop' sockets unchanged.
- Traps/log: post-found shutter window is safe by construction — the
  find lands ~1.4s into a 26s sweep, so ≥24 sim-s of active time
  remains before outbound can end (≫ the e2e leg's 90-frame attempt).
  's' seed u-lobby pedestals stock reliably; the leg picks an unsold
  one and sets marginalia=99 so refusal reads as the shutter, not the
  purse.
- Gates: tsc, lint, 228 vitest, 5-seed sim, undercast **12/12** (the
  checker leg now asserts closed-cue + refusal + reopening sale),
  build.

## sprint 312 — the multi-stop sweep (the books mark them together)

- `CrewChecker.dispatch` now takes `sockets[]` and walks ONE hi→lo
  route that sweeps every till the books marked — one stop per till
  room. Pilfer twice before the count rings and the lamp visits both
  rooms on the same walk; a second dispatch while a route is live is
  still refused ('one walker per beat, not a crowd' holds).
- `CrewCount.pendingSockets()` exposes queued-but-unrung reports —
  the books marked them the moment the pilfer happened, so the route
  covers tills whose ring hasn't gone out yet (their ring still emits
  on schedule; the walk is already decided).
- State machine: inbound → sweep → [more stops → inbound → sweep] →
  outbound → idle. Interim cue '[the checker counts a till — the walk
  continues]' at each non-final stop; the contextual close (found /
  lamp-lit / blind) only at the last. Dispatch cue goes wide:
  '[the count is answered wide — the lamp has more than one till]'.
- found/witnessed stay once-per-dispatch (the first held face); a
  multi-stop route also LENGTHENS the sprint-311 shutter window.
- Traps/log: the e2e find lands at the LAST stop now — the 306 leg's
  170*30 linger cap was sized for one stop (~55s walk); a 2-stop route
  puts the second till's sweep ~150s out — cap raised to 340*30. The
  shutter-attempt loop checks `stage === 'idle'` BEFORE pressing, not
  after — a same-frame departure could sell through the gate. Spec
  files treat `sockets`/`meta` optional: `(x.sockets ?? [])` / `?.`.
- Gates: tsc, lint, 229 vitest (+1 two-stop spec: sweeps counted = 2),
  5-seed sim, undercast **12/12** (the leg pilfers a second cage tag —
  's' has tills at under-rooms 1/26/53/56/71/73/90 — asserts the wide
  cue + walk-continues + found at the linger room), build.

## sprint 313 — the eye files too (devin/1791394439-threshold-s313)

- The house's watchers now rhyme with the checker's lamp: a HELD
  settle (w.settle > 0.9 report) fires ctx.eyeFiled?.() ONCE per eye
  (new `filed` flag on the watcher struct) — Game's entityCtx wires it
  to unpaidHeld + 1, same register the lamp's witness mark lands in.
  New cue beside the settle: '[the eye's report goes in the register —
  your face is filed]'. A re-report (still feet → moving again) rings
  noise but files no second line.
- Trap/log: watchers are on HazardField (ctx callbacks fine), built
  from room.spec.props kinds securityCam/searchlight — not sockets.
  Spec: pinCam + `eyeFiled = vi.fn()` on ctx; step ~8.5s to force two
  reports and assert eyeFiled called exactly once. The e2e leg zeroes
  ga.unpaidHeld first, then asserts +1 after settle and still +1 after
  a second report — measures the ledger, not the caption.
- Gates: tsc, lint, 230 vitest (+1 once-per-eye spec), 5-seed sim,
  e2e hazards — 'the watched hall' leg extended (heldAfterSettle===1,
  filedCue, heldAfterSecond===1), build.

## sprint 314 — the register talks back (devin/1791395297-threshold-s314)

- The watch network is two-way now: while `ctx.heldOwed() > 0` (the
  Detective's book holds a line on you — eyeFiled/witnessed/wordFiled/
  lineCut all feed it) every watcher settles ~1.6x faster:
  `w.settle + dt * (marked ? 1.6 : 1)`. One warn per marking via
  `markedWarned` (clears when unmarked): '[the register talks back —
  the eyes have your description]', gated on a LIVE watcher in the
  current room. No ctx changes — `heldOwed` already existed for the
  Detective.
- Trap/log: the pan warn is severity 'info', not 'warn' — check the
  actual literal before editing nearby cue calls (an edit batch failed
  mid-apply on that mismatch). Struct-field adds to `watchers` must
  init in the push block (~line 940) — `filed`/`markedWarned` live
  there, not on the prop spec.
- Gates: tsc, lint, 231 vitest (+1 marked-A/B spec: frames-to-settle
  < stranger*0.85, warn exactly once), 5-seed sim, e2e hazards — the
  watched-hall leg asserts talksBack fires exactly once after filing,
  build.

## sprint 315 — the tape is testimony (devin/1791395701-threshold-s315)

- Blinding an eye now leaves sign: the 'tape' case pushes a `kind:
  'blind'` evidence mark at the mount (fresh t, no flags) — a mounted
  felt patch is substantive work, not ash (unlike forge's weak mark),
  so BOTH readers (warden + grafter) pull to it once. The eye fork is
  now three-way: dodge it (free), eat the file (+1 held), or tape it
  (permanent blind + fresh sign the hunters chase). Cue amended:
  '[the eye goes blind under the felt — and the felt smells of your
  work]'.
- Trap/log: `wiped` is the wrong flag for "warden reads this" —
  warden SKIPS wiped entries as targets ('a wipe is a filter on the
  sign, not a target', corridor.ts ~630); wiped exists only to poison
  nearby marks via the doubt filter. For a real pull, push a plain
  fresh mark — `kind` only matters for player-readable old sign.
- Gates: tsc, lint, 231 vitest (+1 contract line asserting
  `kind: 'blind'`), 5-seed sim, e2e hazards — the watched-hall leg
  asserts a 'blind' mark lands within 0.5m of the taped mount, build.

## sprint 316 — the felt comes back (devin/1791396001-threshold-s316)

- Tape is now a PARKED tool, not a consumed one: a taped eye
  (`w.dead === true` — only felt sets that flag; dead-mains eyes ride
  `darkRoom` instead) offers 'Take the felt back — it wakes' (`untape`
  kind, 1.0s hold): `w.dead = false`, `giveItem('feltWrap', 1)`, the
  mount's prompt flips back to Tape/Smother on the next rebuild. The
  sprint-315 'blind' mark STAYS — the sign already went out; you can't
  un-smell it. A re-lit eye can't refile (its `filed` flag persists),
  its settle restarts from 0.
- Trap/log: the e2e leg now drives a three-state mount (live → blind
  → relit) — capture `focused` prompts gated on `live.dead`, or the
  post-hold frames overwrite 'Tape the eye' with the next state's
  prompt. Mechanics asserted on state (wraps 0→1, `dead` flag,
  evidence mark), not on prompt strings.
- Gates: tsc, lint, 231 vitest (contract kind list += 'untape'),
  5-seed sim, e2e hazards — the watched-hall leg asserts the recover
  prompt, wrap refund, relight, and that the blind mark persists,
  build.

## sprint 317 — the fix (devin/1791396501-threshold-s317)

- The Broker gains a second anchor on the man himself: 'Ask the
  Broker for a fix' (kind 'fix', 1.2s hold, priority 3 — on the
  brokerFigs figure at pos.y+1.4, NOT the pedestal socket — the
  shared-anchor double-verb stays a design call). He makes a call and
  one line comes off your DEEPEST ledger (tie order: tally > register
  > file) priced by depth: `min(6 + worst*3, 18)` marginalia. Clean
  slate → '[your slate is clean — nothing to fix]' (free shrug);
  short → 'the crew does not write on credit'; checker walking →
  'the floor is closed for the count' (sprint 311's shutter covers
  the fix too). Per-ledger captions name the book: tally / register /
  your file.
- Trap/log: the fix anchor MUST out-priority the pedestal 'shop'
  (priority 2) or 'Trade wares' steals focus at every stand point
  that can see the figure — 3 is the floor. Stand ~1.4m off the fig
  in e2e; the pedestal anchor is off-axis there.
- Trap/log: prompt text is static ('Ask the Broker for a fix') —
  the real price is computed in the press case; a price baked into
  the prompt at rebuildInteractables time goes stale the moment a
  ledger moves.
- Gates: tsc, lint, 231 vitest (contract kind list += 'fix'), 5-seed
  sim, e2e economy — the broker leg now drives the full arc: refuse →
  pay → marked rate → fix (held 5→4, call caption) → clean refusal
  uncharged, build.

## sprint 318 — the night clerk (devin/1791397616-threshold-s318)

- The house gains a staffed counter: any un-authored main-route room
  with a `counter` prop can staff the night clerk — a masked, amber-
  eyed house-staff figure (`tallFigure`, NO rig: the porcelain service
  face is the identity, deliberately not the Broker's hooded robe)
  behind the till + two `itemPedestal` wares on the counter's front
  edge (local `counter.x±0.55, counter.z−0.55`, y 1.15). First counter
  room always staffed; own 'clerk' RngStream (registered in rng.ts —
  stream names are a union type, adding one needs BOTH the union entry
  AND the STREAM_SALTS record).
- 'Buy at the counter' rides the existing 'shop' InteractKind — the
  press case branches `meta.clerk` first (imprints economy, register's
  rate: `unpaidHeld > 0` → `price + min(3 + held*2, 10)`, caption
  'the register's rate', refuse 'settle your claims'), then
  `meta.broker` (marginalia, tally marked rate). Both sold-states set
  `it.enabled = false` — the clerk branch must mirror it or the ware
  re-offers.
- Trap/log: DON'T template-whitelist clerk rooms — wax-bell-256 draws
  zero reception-family templates; the `counter` prop is the correct
  discriminator and guarantees coverage (probe confirmed 2-5 clerked
  rooms on every QA seed).
- Gates: tsc, lint, 232 vitest (+1 gen spec asserting ≥1 staffed
  counter + 2 pedestals per clerked room per seed), 5-seed sim,
  e2e economy 7/7 (new leg: figure present → short refuse → till
  rings → register's rate +9 on the second pedestal), build.

## Sprint 319 — ask the clerk (the staffed page)

- New InteractKind 'ask': a second anchor on the clerk figure itself
  (pos.y+1.4, holdTime 1.0, priority 3 — same floor as 'fix'). Data
  carries { roomIndex }; the query lives on the room's slot0 socket
  meta (`clerkQ` ∈ 'staff'|'hazard'|'claims', `clerkQPrice` 4-9,
  seeded on the existing 'clerk' stream — no new stream needed, the
  pass already owns clerked rooms).
- 'Ask the clerk' — one-shot per counter (`clerkAsked` set): pays the
  page at list price, or the register's rate for a filed face
  (`price + min(2 + held, 6)`). Answers scan the next 8 main rooms:
  staff → `r.scheduled` entity nouns (STAFF map), hazard → spec.props
  fault nouns (FAULT map), claims → next 10 rooms' claim tags
  (still held/drawn). Empty stretches get a clean 'nothing filed'
  line, not silence.
- Trap: the verb is on the FIGURE, and `meta.clerkQ` must never mint
  an interactable — putting 'ask' on the slot0 socket would shadow
  'Buy at the counter' at the same anchor (interaction.ts maps
  `meta.clerk !== undefined` → kind 'shop'; a second mapping on the
  same socket only sees one branch). Page data on the socket, verb
  on the man.
- Trap: e2e leg drives hold verbs by prompt regex — the economy
  clerk drive's `/counter|buy|wares|take/i` couldn't see 'Ask the
  clerk', so the second ask never held KeyE. Match lists must cover
  every prompt the leg touches; ambient watcher captions can satisfy
  a loose `caps.length > mark` done-predicate and end the drive
  early — wait on the specific caption.
- Gates: tsc, lint, vitest (clerk spec extended: every clerked room's
  slot0 carries a valid clerkQ + 4-9 price; hazardContract += 'ask'),
  5-seed sim, e2e economy leg extended (ask anchor found → paid at
  list price → page answered → second ask says what it knows), build.

## Sprint 320 — rifle the till (the staffed counter's rummage)

- 'Rifle the till' (kind 'till', 0.9s hold, one-shot) anchors mid-
  counter — between the wares laterally and 0.5m back toward the
  clerk (computed from the two clerk sockets + the fig's position).
  Pays imprints 4-8 (60%) or one of the clerk's stock pool (40%) on
  the 'loot' stream; costs `unpaidHeld += 2` — the register-drawer
  parity: hands in a staffed register file your face twice. The
  clerk's own rate climbs emergently after (register's rate reads
  unpaidHeld). `tillTaken` on slot0's meta both disables the press
  and stops the interactable re-adding on rebuild.
- REAL BUG the leg surfaced — sold sockets re-minted enabled
  interactables: `enabled: !sock.meta.taken` ignored `meta.sold`, so
  'Buy at the counter' re-offered focus after the sale and its press
  silently hit the sold-guard. Worse, the front-edge wares stand
  between the player and the counter surface: at 1.0m standoff a
  same-line anchor 0.55m off a ware is only ~20-29° off-aim, inside
  the ~0.86 align band, and proximity wins — a sold ware out-scored
  every counter-surface verb forever. Fix: socket interactables now
  mint `enabled: !taken && sold !== true`, and the till sits 0.5m
  back on the counter (~40° off each ware) so aim picks cleanly even
  before the sale.
- Focus math for the log: `score = dist - align - priority*0.3` —
  priority dominates inside the band, but at equal priority the
  nearer candidate wins even at a 20°+ aim offset. Anchors sharing a
  line need ≥0.9m lateral separation or a depth offset to separate
  cleanly at counter standoff.
- Gates: tsc, lint, vitest (contract += 'till'), 5-seed sim, e2e
  economy leg extended (rifle → off-the-till pay → held 0→2 → till
  never re-offers), build.

## Sprint 321 — the desk bell (the house's only positional lure)

- 'Ring the desk bell' (kind 'bell', 0.5s hold) anchors at the
  counter's far end — 1.5× the slot axis past mid + 0.45 back toward
  the clerk, computed from the two clerk sockets so it never shadows
  'Rifle the till' (mid-counter) or the wares. Free, 25s per-room
  cooldown (`bellRung` map on clock.time); inside it the bell answers
  '[the bell gives a tired click]' with no noise.
- The ring emits 'distraction' at 0.8 intensity AT THE BELL — every
  other noise source in the house sits at the player's position
  (watcher reports, filer posts, strides); the bell is the first
  lure you can place and walk away from. ~11m reach through the
  noiseRouse radius — in-room listeners + the room beyond.
- Trap: keep counter-verb guards independent — the bell add lived
  inside `!tillTaken` until it didn't (a rifled till would've
  deleted the bell). One `tillSocks.length === 2` gate, separate
  one-shot guards inside.
- Trap: 'distraction' IS the rouse category — a lure verb doesn't
  need a new SoundEvent kind, only a position that isn't the player.
- Gates: tsc, lint, vitest (contract += 'bell'), 5-seed sim, e2e leg
  extended (ring → distraction emitted AT the bell pos, verified by
  wrapping g.sound.emit → second ring inside 25s gives the tired
  click and emits nothing), build.

## Sprint 322 — the counter goes cold (the rifle's real price)

- A rifled till now closes that counter: `closedCounters: Set<number>`
  (roomIndex) — 'Buy' and 'Ask' at a cold counter answer
  '[the clerk folds its hands — the counter is closed to you]' at any
  price. The bell still answers (the house's, not the clerk's). The
  rummage stops being nearly free: imprints/items now vs the staffed
  counter's wares AND its seeded page — rifle last.
- 'shop' resolves the socket's room via
  `activeRooms().findIndex(r => r.sockets.includes(sock))` — press-time
  rarity so the O(rooms) scan costs nothing; 'ask'/'till' carry
  roomIndex in `it.data` already.
- Trap: keeping a ware unsold through the leg (register's-rate now
  quoted via REFUSAL caption, not a sale) re-exposed the sprint-320
  shadow — from the default 1.0m front stand an enabled 'Buy' on the
  front edge out-scores the mid-counter till (proximity inside the
  align band beats aim). Stand at 0.7m: wares go ~40° off-axis and the
  till takes focus. Generalizes: verbs behind a front-edge row need
  close-stand drives or a depth offset.
- Gates: tsc, lint, vitest, 5-seed sim, economy leg extended (cold
  ware refuses at any price + stays unsold · cold ask folds · bell
  unaffected), build.

## Sprint 323 — the purse (the two currencies finally bridge)

- 'Change the purse — 6 imprints' anchors off the Broker counter's
  near end: pays 6 imprints for 8 marginalia on clean books, 6 on
  dirty (any of the three ledgers open sours the rate — the Broker
  reads you). Repeatable — an exchange, not a sale. Shuttered with
  the floor while the checker walks, like the fix.
- First bridge between the currencies: imprints now have a path into
  every marginalia-priced relief valve (fix, square, slips, claims).
- Trap (fig-proximity): the clerk figs stand ~2m+ behind their
  counter, so a mid-counter anchor separates from the priority-3
  fig verb — but the Broker's fig stands only ~0.7m behind his
  socks. A mid anchor lands on the fig's own line and 'Ask the
  Broker for a fix' holds focus dead-aimed. Rule of thumb: before
  placing a counter verb, check the fig's standoff — close-fig
  counters need the lateral (bell-style) offset, not the mid one.
- Gates: tsc, lint, vitest (contract += 'purse'), 5-seed sim, e2e
  broker leg extended (clean 6→8 · sour 6→6 · short refuse · the
  fixed anchor verified via purseSeen diagnostics), build.

## Sprint 324 — the purse's other direction (the exchange completes)

- 'Change the purse — 8 marginalia' anchors off the clerk counter's
  near end (the mirror anchor of the Broker's): pays 8 marginalia
  for 6 imprints on clean books, 4 for a filed face (unpaidHeld > 0
  — the clerk reads the register, not the under's tallies).
  Repeatable; a rifled counter folds like the rest of its service.
- The currency bridge is now two-way: imprints buy marginalia below
  (6→8/6), marginalia buy imprints above (8→6/4). Both spreads are
  the house's cut — clean books always pay better than filed ones.
- Trap (collider-eject stale aim): a verb anchored at the counter's
  far lateral end can put the at+1.0·dirToCenter stand INSIDE the
  counter flank's collider. The eject fires after the drive's aim
  was set, so every frame's lookDir misses by ~60° and focus sees
  zero candidates (probed: d0.41 a0.48 — purse dead-ahead but
  misaligned). Symptom to spot: focused===null for frames on end,
  not 'wrong prompt'. Fix: shift `at` ~0.4 toward center so the
  stand clears the collider — same idiom as the till's close-stand.
- Gates: tsc, lint, vitest, 5-seed sim, economy 7/7 (clerk leg:
  clean 8→6 · filed-face sour 8→4 · short refuse · cold-counter
  fold; broker leg unchanged), build.

## Sprint 325 — the till smells of hands (the rifle's third price)

- 'Rifle the till' now leaves fresh `kind: 'work'` evidence at the
  counter — substantive sign, not ash, so the warden pulls to it
  like any kill or mounted wrap and `signReads` weighs it toward
  learning. The rifle's price stack is now three deep: the file
  (+2 held), the cold counter, and scent — steal early and the
  floor reads worked where the warden walks.
- Free emergent counterplay: the crouch-scrub loop iterates
  `hazard.evidence`, so a felt wrap rubs the hands-smell off the
  counter too — costing a wrap and leaving a wipe shadow that
  poisons that floor's later reads for the same warden.
- Evidence union gained 'work' (room.ts — the kind-agnostic reader
  filters only on old/weak/wiped flags, so both hunters pull it
  without reader changes).
- Gates: tsc, lint, vitest, 5-seed sim, economy 7/7 (clerk leg:
  work mark lands at the till pos on rifle), build.

## Sprint 326 — the clerk watches your hands (the cold counter's face)

- Clerk figs now track the player by the head — but only AFTER the
  rifle: `fig.userData.clerkRoomIndex` set at mint, and the
  entity-anim traverse's broker head-track gained a clerk branch
  gated on `closedCounters.has(roomIndex)`. Before the rifle the
  fig attends the till like furniture; after, its masked face finds
  your hands from any angle in the room (±1.1 rad clamp, dt*4 lerp
  — the Broker's own convention).
- The counter arc's horror beat, free: 'the clerk watches your
  hands' was already the rifle caption — now it's physical.
- e2e clerk leg asserts both halves: head yaw ~0 pre-rifle
  (untracked), >0.25 rad post-rifle standing ~52° off the fig's
  facing.
- Gates: tsc, lint, vitest, 5-seed sim, economy 7/7, build.

### sprint 327 — the bell draws its eye
- The lure's landing made visible: `bellRung` widened to
  `Map<roomIndex, {t,x,z}>` — the ring now stores the bell's pos,
  not just the time.
- A warm (un-rifled) clerk's head turns to its own bell for ~3.5s
  after a ring — `watches` picks tx/tz = rung pos inside the window,
  player otherwise; brokers and `closedCounters` clerks keep the
  thief. The house's own sound answers for the clerk — after the
  rifle, the bell can't buy its eye back.
- e2e trap (stale-caption family): a phase's `drive(at, done)`
  matched a caption left in `caps` by an EARLIER ring — `done`
  fired at frame 0, no press, `rings` stayed empty. When a later
  phase must see a FRESH emit, count occurrences:
  `caps.filter(re).length > before`, or manipulate `bellRung`
  (`ga.bellRung?.delete(idx)`) to force a fresh ring inside a
  cooldown.
- e2e clerk leg asserts both look directions: warm ring → head yaw
  shares `rel(bell−fig)`'s sign; post-rifle fresh ring with the
  player at the opposite side → head keeps `rel(player−fig)`.
- Gates: tsc, lint, 232 vitest, 5-seed sim, economy 7/7, build.

### sprint 328 — the unfiled hands (the eye's window pays)
- The sprint-327 head-turn made mechanical: rifled inside the bell's
  look window (`bellRung.get(roomIndex)`, `clock.time − rung.t < 3.5`),
  'Rifle the till' files NOTHING — the clerk's eye is on the bell, not
  your hands: `unpaidHeld +0`, caption '[it was watching the bell —
  your hands go unfiled]'. The till still opens, still smells ('work'
  sign lands), and `closedCounters` still folds the counter — only
  the witness is missing. Ring → cross → rifle is a real steal-window
  (~1.5m of counter between bell and till inside ~3.5s).
- e2e trap (second stale-caption instance): the clerk leg's room-B
  till drive waited on `/off the till/` — room A's rifle caption
  satisfied `done()` at frame 0, so the drive never teleported
  (player stranded at the bell stand, `seen=''`, probe showed
  align −0.16 from a stale spot — mimicked the collider-eject trap).
  Diagnose order: a `done()` that may match an EARLIER phase's emit
  must count occurrences, not `some()`. Also: the leg's `drive()`
  hardcodes `clerked.origin` for its stand direction — multi-room
  legs need a `toward` param (added; default keeps old callers).
- e2e clerk leg drives both books: room A rifles unseen-by-nothing
  (+2 held — rung deleted mid-leg to expire the window), room B
  rings then rifles inside the window (held stays 0, 'unfiled'
  caption, counter still cold).
- Gates: tsc, lint, 232 vitest, 5-seed sim, economy 7/7, build.
### sprint 329 — the marked coin (rifled imprints testify)
- The till's coin is marked: rifled imprints pool into `hotImprints`,
  and every house-side imprint spend runs through `chargedImprints(n,
  x, z)` — the hot coin goes first, and each marked spend emits
  'distraction' (0.5, ~9m reach) at the till it lands in + warn cue
  '[the till knows its own coin — the house hears where it landed]'.
  Covers toll doors, the Collector's toll, vend machines, the clerk's
  wares + ask, the register/roster/complaint/watchSheet/affidavit
  papers, the claim's imprints branch, the Detective's settle, and
  the ctx `spendImprints` (entity charges incl. the custodian shop).
- The fence: the Broker's purse (`imprints -= 6`) is the ONE spend
  that doesn't testify — it silently burns `min(6, hotImprints)` —
  the under washes the house's marked coin for the spread. The
  heist chain: ring the bell → rifle blind → launder downstairs.
- Implementation note: `spendImprints(n)` ctx cb now wraps
  `chargedImprints` at `player.pos` — entity desk charges testify
  too. Only the purse keeps a raw `imprints -=` (the wash).
- e2e: vend leg pays a fully-hot spend (one 'distraction' ring at
  the vend, hot→0); broker purse leg adds the wash phase (hot 6→0,
  no emit asserted); clerk leg asserts `hotAfterRifle > 0` iff the
  rifle caption reads '— the coin is marked' (item branch = clean).
- Gates: tsc, lint, 232 vitest, 5-seed sim, economy 7/7, build.

### sprint 330 — the wash files a question (the launder isn't free)
- The purse's wash now costs the under's own book: `washed > 0` →
  `paperTrail +1`. The marked coin stays silent to the HOUSE (no
  emit — the under doesn't testify), but the Broker's book reads
  coin as carefully as the register reads faces: '[the purse weighs
  the marked coin — the under's book opens a line · 6 imprints →
  ${gain} marginalia]'. The heist chain now prices both ledgers:
  rifle = the house's book (witness + work sign unless the eye is
  on the bell), wash = the under's book (+1 trail toward her 3+).
- e2e broker leg: wash phase asserts hot 6→0 AND trail +1 inside
  `purseWashed`. Caption renamed 'washes' → 'weighs'.
- Gates: tsc, lint, vitest, 5-seed sim, economy 7/7, build.


### sprint 331 — the till's stock is marked (goods testify too)
- The goods side of the marked family: rifled ITEMS pool into
  `hotItems = Set<ItemId>` (per-id, not per-unit — ~15 count--
  consumption sites make unit marks untraceable; fiction: you can't
  tell which wrap is the till's). Rifle caption gains '— the stock
  is marked'; a carried hot id testifies at any WARM clerk: the
  head-track gains a third case (after broker + cold-counter
  tracking) — `hotItems ∩ inventory` → watches + a per-room
  (`stockSeen`) 'distraction' ping 0.4 at the player + warn cue
  '[the clerk reads its own stock on you — the till wares tell]' +
  quiet emit caption '[the till's stock answers for itself]'.
  Ring-window precedence is untouched (bell > cold > stock).
- The fence: the Broker's counter gets a third anchor — 'Fence
  the take' (+1.2·lateral flank, the purse's mirror — broker
  counters have no bell). Flat 4 marginalia per marked stack,
  `paperTrail +1` (the under's book opens a line), clears the hot
  ids AND strips them from the bag ('[the broker takes the marked
  stock without a word — the under's book opens a line · +N
  marginalia]'). No marks → free shrug. The checker-shutter covers
  it ('the floor is closed for the count'). The heist chain is now
  two-sided: launder the coin at the purse, fence the goods.
- Wire-up trap: a new InteractKind needs THREE spots — the union
  (interaction.ts), the case dispatch, and hazardContract.test's
  kind list ('fence' appended to all three).
- e2e: broker leg fence phase (bandage×2 hot → +8 marginalia,
  hotItems cleared, trail +1, bag stripped); clerk leg stock-read
  phase (warm figB + hot doorChock → head yaw >0.25 + 'reads its
  own stock' cue).
- Gates: tsc, lint, 232 vitest, 5-seed sim, economy 7/7, build.

### sprint 332 — the ledgers outlive you (death can't launder the books)
- Real hole found in `CheckpointSave`: it carried imprints/marginalia/
  inventory but NOT `unpaidTheft`/`unpaidHeld`/`paperTrail`/`hotImprints`/
  `hotItems` — a checkpoint RELOAD (fresh Game) forgot every debt and
  every mark, so dying was a free full launder for the whole marked
  economy. Worse, `startRun` never reset the ledger fields at all: a
  same-instance fresh run LEAKED the previous run's debts.
- Fix: the five fields are now optional on `CheckpointSave` (old saves
  parse as a clean slate via `?? 0`); `makeCheckpoint` writes them
  (`hotItems` → array); `startRun` restores `cp?.x ?? 0` — which both
  restores a reload AND zeroes a fresh run (the leak closes for free).
  `stockSeen` clears per run (rooms re-read the take once — fine).
  Semantics: debts accrued after the checkpoint are forgiven on retry,
  same as loot (consistent with the honest-replay prop rule).
- e2e broker leg: `cpLedger` asserts a live `makeCheckpoint` mirrors
  paperTrail/hotImprints/hotItems/unpaidTheft. vitest persistence spec
  round-trips all five + the old-save `?? 0` path.
- Trap: `hotItems` is `readonly` — rebuild via clear()+add, never assign.
- Gates: tsc, lint, 233 vitest, 5-seed sim, economy broker leg, build.

### sprint 333 — the take goes back (the emptied till reaccepts its own)
- The marked-goods triangle closes: rifled tills mint a 'restock'
  verb ('Slip the take back — it never left', 0.9s, the till's own
  anchor) at rifle time, pushed to `dynamicInteractables` so a room
  rebuild replays the offer while the counter stays cold. It takes
  back every carried `hotItems` stack — free, no profit, no ledger
  relief: the register's witness doesn't unwrite for a returned
  wrap ('[the till takes its own back — the wrap never left the
  shelf]'). The decision tree is now: carry (warm clerks read the
  stock), fence (4/stack + trail below), return (free upstairs).
- Empty-handed shrug ('[the drawer is empty — nothing of his on
  you]'); checker-shutter irrelevant (main-route counters).
- e2e clerk leg: restock at the rifled till clears hotItems +
  strips the goods + `unpaidHeld` unchanged. Trap: the till anchor
  sits mid-counter — the drive needs the close 0.7m stand (the
  1.0m default lands inside the counter flank collider → eject →
  '' samples; same class as the s324 purse fix).
- Gates: tsc, lint, 233 vitest, 5-seed sim, economy 7/7, build.

## sprint 334 — the book answers back (info layer for the ledgers)
- The five ledgers (`unpaidTheft`/`unpaidHeld`/`paperTrail`/`hotImprints`/
  `hotItems`) were player-invisible — the only signal was a surcharge.
  'Ask what the book says — 3 marginalia' is now minted inside the
  bSocks>=2 broker block, anchored LOW on the fig's flank
  (`fig.pos + 0.8·lateral`, y+0.55, holdTime 0.8, p2). Case 'book'
  (Game.ts, before 'purse'): under-only + `checker.active` shutter +
  `marginalia < 3` refuse. On press: `marginalia -= 3; paperTrail += 1`
  — the asking files too, so the read counts itself — then captions
  `[the book on you — N questions filed · M thefts tallied — the asking
  files too]` / clean `[the book holds one line on you — this one]`.
  Repeatable, not one-shot.
- Trap (new class): two same-fig anchors ~0.35m apart lose the in-band
  priority fight — the first book anchor (fig+0.7lat, +1.1y) sat inside
  'fix''s focus band and p3 won every frame (`bookSeen` showed only
  'Ask the Broker for a fix'). Waist-height at 0.8·lateral makes it a
  pitch-DOWN vs pitch-UP read — disambiguates. e2e legs on fig verbs
  should assert `xSeen` contains the target prompt, not just the cap.
- Verb wiring: interaction.ts union + hazardContract kind list.
- Gates: tsc, lint, 233 vitest, 5-seed sim, economy broker leg green, build.

## sprint 335 — the marked coin testifies twice
- `chargedImprints` (the single funnel for every imprint spend) now
  writes `unpaidHeld += 1` when any hot coin lands — the till that
  takes marked coin files the hands that fed it. Cue text:
  '[the till knows its own coin — the register files the hands that
  fed it]'. The marked-coin dilemma is complete: spend upstairs and
  every transaction files +1 held, or carry it below and launder at
  the purse for the asking's price (+1 trail per wash).
- e2e: the clerk leg's paid buy runs with `hotImprints=1` — asserts
  hot drains, held +1, 'files the hands' cue; restores held after.
- Trap: phases that reset `unpaidHeld` for an assertion (e.g. the
  unfiled phase's `ga.unpaidHeld = 0`) must now ALSO drain
  `hotImprints` — a stray priced press mid-drive (a warm 'ask' on a
  fig stealing a press-cycle) spends hot coin and files +1. The
  unfiled phase zeroes both.
- Gates: tsc, lint, 233 vitest, 5-seed sim, economy 7/7, build.

## sprint 336 — the books close at the door
- The five ledgers accrued all run and `victory()` reported only
  stats — the exit never read the books. `victoryInfo` now carries
  `books?: BooksClosed { thefts, held, asks, hotCoin, hotGoods }`
  (store.ts; optional — any other setState writer stays valid).
  `VictoryScreen` renders a `.stats.books` reckoning block: bracketed
  epitaph lines per open ledger, or 'every book closed before the
  door did' when all five are zero.
- e2e: the runflow victory leg sets all five ledgers via cast, calls
  `g.victory()`, asserts the reckoning text in the DOM.
- Readout only — no ending gating (that would be a design call).
- Gates: tsc, lint, 233 vitest, 5-seed sim, runflow victory leg, build.

## sprint 337 — the mark dies with the goods
- `hotItems` only left the pool via fence/restock — a mark outlived
  its last unit, so a stack at count 0 still testified and a fresh
  CLEAN ware of that id witnessed falsely (false-witness bug).
  `pruneHotMarks()` runs per frame in `frame()` (post-refreshProtection):
  an id leaves the pool when no carried stack has count > 0. The three
  read sites (traverse stock-read, fence take, restock take) also
  tighten to `i.count > 0` so a just-emptied stack never witnesses
  in the gap before the prune.
- e2e: the clerk leg zeroes the marked chock's count → prunes → then
  gives a CLEAN chock — head must NOT chase it. Assert shape: an
  unwatched head has NO decay path (`if (head && watches)` is the
  only writer) — it holds its last bearing, so the proof is drift
  vs the old yaw < 0.15, not decay to ~0.
- Gates: tsc, lint, 233 vitest, 5-seed sim, economy 7/7, build.

## sprint 338 — the books smell of hands too
- The three staffed-book rifles (Filer 'docket', Auditor 'tallyDrawer',
  Detective 'registerDrawer') left no sign — the till's three-deep price
  stack (file + keeper-rouse + scent) wasn't symmetric. All three cases
  now push fresh 'work' evidence at the drawer: the warden pulls to
  register-drawer sign (main route, its territory), the grafter drags
  to docket/tally sign (under, its diet).
- `room: this.currentRoom` is the right tag — evidence readers compare
  `player.room === e.room` (signReads weigh / wipe zone at ~1430), so
  the mark's room is "the room the pilfer happened in" by the game's own
  resolver, NOT the scheduled keeper's room index.
- e2e trap: `aRoom.index` is NOT a safe assert — under-room coarse
  bounds overlap (the drawer's own pos can resolve to a different room
  index than the keeper's scheduled room). Assert
  `e.room === ga.currentRoom` at the stand + pos distance < 1.2 instead.
- The marks read positionally like every other kind — no reader-side
  changes needed; the grafter's stale-diet and the warden's cold-cutoff
  already apply.
- Gates: tsc, lint, 233 vitest, 5-seed sim, economy 7/7 (drawerSign),
  undercast 11/11 (tallySign + docketSign), build.
## sprint 339 — the sheet names your hands

- The wanted system (s401) gains its first interactable: 'Read the
  wanted sheet' mints at a wantedRooms host when wantedActive (0.8s,
  priority 1, within 2.2m). Reading is free and repeatable — the sheet
  prints the clerk's count aloud: `[the sheet names your hands — N
  thefts tallied · the crew listens harder until the count settles]`.
  The naming still clears only by settling the tally (lowerWanted).
- Verb pos is y=0.75 so the focus target (pos.y + 0.6 = 1.35) lands on
  the sheet face — players get the prompt when they look AT the paper.
- e2e trap: `v3dist` in the focus pass is FULL 3D — a verb at y=1.1
  stood 0.7m away is prox 1.3 > 1.1, killing the nearEnough fallback;
  put verb y within ~0.8 of ground for floor-level verbs, or aim height
  at pos.y+0.6 for wall props (a sheet's face is at 1.35, not its pos).
- e2e trap (sibling to registerDrawer): verbs minted per room — a leg
  that leaves the room to read a sheet must teleport back before
  looking up 'audit'-kind interactables, or they aren't minted yet.
- undercast audit leg drives: tally-drawer rifle → demanded → wanted
  sheets up (wantedActive, 5 rooms) → read a sheet → settle lowers it.
- Gates: tsc, lint, 237 vitest (+wanted contract kind), 5-seed sim,
  undercast 11/11, build.

## sprint 340 — the seam carries the hum

- A primed milestone now answers a door-listen: `listenThrough` gains a
  branch after the scheduled-entity check —
  `milestones.get(target.index)?.primed && primedAudible` →
  `[a mechanism already mid-count — it heard you]` (danger). The s401
  primed-opening mechanic was only readable after the door swung; the
  ear now closes the loop BEFORE you cross.
- `Milestone.primedAudible` (default false, override true) marks the set
  pieces that actually answer prime(): Index, Custodian, LensHall,
  Engine. Chase reads its own clock and the gate ignores primed — a
  danger line on those would be a lie.
- Ordering: scheduled entities still outrank (their listen cue is more
  specific); the milestone check sits before the safe/dark fallbacks.
- e2e: doors.spec leg 3 primes the first primedAudible milestone with a
  clean `scheduled`, reuses `listenAt`, asserts the mid-count line, and
  un-primes after.
- Gates: tsc, lint, 237 vitest, 5-seed sim, doors 1/1 (+primed leg),
  build.
  undercast 11/11 (tallySign + docketSign), build.

## sprint 402 — calls closed, host pick extracted (sheet verb → s339)

- DESIGN_CALLS.md deleted — all three calls settled and built in 401.
- pickWantedHosts extracted to src/game/wanted.ts (pure: downstream
  rooms only, first crew-board prop per room, cap 5, yaw-projected)
  with 6 unit tests; raiseWanted calls it.
- SUPERSEDED: my 'wantedSheet' read verb dropped — sibling sprint 339
  landed 'Read the wanted sheet' (kind 'wanted', room-scoped host
  lookup, priority 1, y=0.75) first; theirs stays end-to-end.
- Gates: tsc, lint, vitest scoped (10/10) — green.

## sprint 341 — he knows marked stock

- The Detective's slow look now feeds on marked wares, not just debt:
  `pRoom === spawnRoom && (owed > 0 || carriesMarked())` — carrying
  rifled goods into his room on a clean ledger clocks him anyway. His
  register wrote the manifest of what was rifled, so the sighting
  files itself: `stockSighted()` → unpaidHeld +1, once per detective
  (`stockNoted`), cue `[he knows marked stock — the register gains a
  line]`.
- Two new ctx hooks, same witness-filing shape as eyeFiled/wordFiled/
  lineCut: `carriesMarked` (inventory has a hotItems id with count > 0
  — respects s337's pruned-mark semantics) and `stockSighted` (+1 line).
- Emergent completeness: the marked-goods carry now prices everywhere —
  warm clerks read stock on you (s331), the Broker fences it, and the
  Detective sight-files it. The carry is testimony on all three floors.
- e2e: detective leg phase 0 marks 'tonic' + carries it in clean →
  asserts the stock caption + held 0→1 → then the register rifle still
  lands +2 (heldAfterDrawer 3 — sighting stacks with the pilfer).
- Gates: tsc, lint, 237 vitest, 5-seed sim, economy 7/7, build.

## sprint 342 — the boards name your face

- The wanted sheet's ×1.5 notice extension (s401) is now honest: a
  catch in the EXTENDED band announces the boards bought it, once per
  wanted episode per entity (`sheetNamed`, reset when wanted drops).
  Grafter's gaze → '[the boards named your face — it reads you past
  its reach]'; hauler/laundress ears → '[the boards named your step]'.
  Normal-band catches keep their existing tells — the naming is only
  for what the sheets sold.
- No semantic change to ctx.wanted — the three callsites still widen
  ×1.5; this sprint adds the readable tell, not counterplay. A per-room
  'tear the sheet down' would need per-room deafen semantics (wanted
  is a global flag) — still deferred.
- e2e: audit leg phase 2.75 — with wanted up, teleport to the hauler's
  room, emit a slam ~8.5m away (inside room bounds, yaw-aware — the
  same math as pointInRoom), assert the boards caption. The grafter's
  face-band is the same hook shape, not separately driven.
- Gates: tsc, lint, 243 vitest, 5-seed sim, undercast 11/11, build.

## sprint 343 — tear the sheet down

- 'Tear the sheet down' mints beside 'Read the wanted sheet' on each
  posted board (priority 3, 1.1s, one-shot, offset 0.55m along the
  board line so 'read' keeps the center aim — papers are priority 3,
  so anything lower than the tear loses to a neighbor desk).
- The reach now reads the boards, not the flag: `ctx.wanted` →
  `wantedActive && wantedRooms.size > 0`. Each tear removes that
  room's map entry + decal; the last one ends the ×1.5 extension
  everywhere — `[the last sheet comes down — the boards forget your
  face]`. The ledger is untouched: `wantedActive` still holds until
  the tally settles (settle still mints; lowerWanted still sweeps).
  Pulling paper is 'work' sign at the host.
- This is additive on the sibling's s401 semantics, not a narrowing:
  the sheets physically carry the word — none up, no wider ear.
- e2e: audit leg phase 2.85 tears every sheet room-by-room (perp-side
  stand, focus-gated hold) → torn === sheets, reach dead, last-sheet
  caption, 'work' sign at a host. Diagnostics (tearDbg) record minted
  flag + focused-prompt samples per room — room 6's counter-claim
  (priority 3) stole focus until the tear went to 3.
- Gates: tsc, lint, 243 vitest, 5-seed sim, undercast 11/11, build.

## sprint 344 — the clerk has more paper

- s343's tear made the deafen free and permanent — this closes the
  loop: when the last sheet comes down, `wantedRepostT` starts a 30s
  window; at expiry, `raiseWanted(true)` re-arms the same raise on
  fresh downstream hosts with `[fresh sheets go up on the boards
  ahead — the clerk has more paper]`. The tug-of-war: every repost is
  another trip to another board for the tearer.
- `wantedRepostT` is armed only by the size→0 transition inside
  `wantedTear` (not by settle — `lowerWanted` clears active anyway,
  and the `> 0` guard keeps a settled episode from reposting). 30s
  matches the cost model: relief is time-bound, not free.
- Emergent: entities' `sheetNamed` resets while the boards stand bare,
  so a repost's extended catches announce again on their own.
- e2e: audit leg phase 2.9 — after tearing all sheets, wait out the
  window at the desk (repost picks hosts downstream of where you
  stand — his room has more route after it), assert `wantedRooms`
  refills + the fresh-sheets caption.
- Gates: tsc, lint, 243 vitest, 5-seed sim, undercast 11/11, build.

## sprint 345 — the wire betrays you

- The wire ring was `source: 'detective'`, and every hear gate in the
  codebase rejects sourced events (`noiseCanBeHeard`/`noiseCanRouse`
  both `!e.source`) — the phone rang *fictionally* but the house could
  not physically hear it. Dropped the tag: the ring is the wire's own
  voice at your position — a real 0.55 'impact', so whatever stands
  within ~7.7m walks to where it rang, and `onRouseNoise` primes the
  seam's milestones +1..+3 and rattles closed doors in reach.
- The under's wanted sheets widen entity bands by a flag; the wire is
  the main-route mirror — no flag, just positional sound at you on
  every fresh room entry while `warranted`. Counterplay unchanged:
  pull the line (s309) and `warranted` never sets, outrun +10 rooms,
  or settle. "They know your face" is now mechanically true.
- e2e: detective leg phase 3 subscribes `ga.sound.on` — asserts the
  ring carries no `source` (every ear hears it) and that the
  milestones within +3 of the entered room primed (assert only binds
  when a milestone sits in reach). The s278 vitest now asserts the
  emitted ring itself has no source.
- Gates: tsc, lint, 243 vitest, 5-seed sim, economy 7/7, build.

## sprint 346 — the boards keep their tears

- s332 carried the ledgers past death but the wanted EPISODE (sibling
  s401) still laundered for free: `unpaidTheft` persisted while
  `wantedActive`/`wantedRooms`/`wantedRepostT` didn't, so a reload
  mid-tug-of-war repinned every torn board and re-armed the whole
  raise. CheckpointSave now carries `wantedActive`,
  `wantedRooms` as `[roomIdx, {x,z}][]` (the decal + verbs re-derive
  from the map through `ensureWanted`, so the restore needs nothing
  else), and `wantedRepostS` = REMAINING seconds
  (`repostT - clock.time`, clamped ≥0) — the absolute field is
  clock-relative and a saved epoch would mis-fire on the new clock;
  restore re-arms as `clock.time + repostS`.
- e2e: audit leg 2.9 — `cpArmed` asserts a checkpoint written inside
  the armed window carries `wantedActive` + empty map + repostS > 0;
  `cpWanted` asserts one written after the repost mirrors the refilled
  board map 1:1. Both bind only when their phase held.
- Gates: tsc, lint, 243 vitest, 5-seed sim, undercast audit leg, build.

## sprint 403 — the fixes the review earned (s401 review debt)

- **Primed Curator froze** (review BUG_0001): `prime()` aimed `target` at
  the door but left no path — patrol only builds one when already near.
  prime() now calls `pathTo(target)` so it actually walks to the door.
- **Primed Lens Hall beams never moved** (BUG_0002): `prime()` added to
  `beamAngle`, which nothing reads — the sweep lives on pivot
  `rotation.y`. prime() now queues `beamOffset`, folded into every
  beam pivot on the next update (works pre-build too).
- **Wanted state leaked across runs** (BUG_0003): `startRun` restored
  `unpaidTheft` (by design — the books outlive you) but never reset
  `wantedActive`/`wantedRooms`, so stale sheet-pins named rooms on a
  fresh route. Both reset now; the next Auditor demand re-posts.
- **Decals placed world-into-local** (BUG_0004, plus 3 older): children
  added to a built room group live in the room's yaw frame —
  ensureWanted/GateMark/DeepVoid/ChalkMarks all set world coords and
  floated metres off. Shared `roomLocal()` (worldToLocal) + yaw−room.yaw
  at all four sites; test/roomLocal.test.ts pins the frame math.
- Bonus guard: `pathTo` no longer crashes on rooms without `navNodes`.
- Gates: tsc, lint, vitest scoped (12/12) — green.

## sprint 404 — the threshold spills light

A primed milestone's entry door now leaks a warm glow strip under its
seam (`ensurePrimedSpill` → `thresholdSpill` decal, additive, room-local
via `roomLocal`). The primed tell now reads visually from the hall —
the ear gets s340's seam hum, the eye gets light escaping a shut door.

- `src/world/decals.ts`: `thresholdSpill()` canvas (128×40, warm edge-fade
  + vertical die-off so the seam side burns brightest).
- `src/game/Game.ts`: `spillMaterial()` cached beside `wantedMaterial`;
  `ensurePrimedSpill(i, built)` on the ensure chain — cap once per built
  room, entry door = nearest `room.doors` to `room.entryPos`, strip lands
  0.1m inside across the threshold. Flat-quad in-plane yaw rides
  `rotation.z = room.yaw - door.yaw - π/2` (derived: Euler XYZ applies Rz
  first; world long-axis = roomYaw − θ).
- Doors are NOT left ajar — `d.openT` decays to shut in <0.1s, and
  leaf-collider/peek semantics were left untouched on purpose.

## sprint 347 — the dead line stays dead

- Same hole class as s332/346, entity-side this time: `lineDead` lived
  on the Detective instance — a checkpoint reload re-scheduled him
  fresh, and the pulled junction box re-minted mesh + verb, un-deading
  the wire for free (box literally hung back on the wall).
- Game-level `deadLines: Set<number>` keyed by the detective's
  `spawnRoom` (carried on `data.roomIdx` at mint); `case 'houseLine'`
  adds it post-pull; new ctx hook `lineDeadFor(roomIdx)` — `onSpawn`
  consults it BEFORE minting box/verb, so a dead line never hangs in
  the first place (`lineDead = true` set from the hook). CheckpointSave
  carries `deadLines?: number[]`.
- e2e: dead-line leg — post-pull `makeCheckpoint` asserts
  `deadLines` includes the detective's room index.
- Gates: tsc, lint, 243 vitest, 5-seed sim, economy dead-line leg, build.

## sprint 348 — the sign stays written

- The scent board laundered for free: `hazard.evidence` (fresh work /
  kill / wipe / blind marks the hunters read) is run-state, and a
  checkpoint reload rebuilt it empty — the warden's trail of YOU went
  blank while the ledgers kept your name.
- `CheckpointSave.evidence` carries only non-`old` entries — authored
  spent-socket sign re-derives from `addFromRoom` on restore, so it
  isn't duplicated. `readBy`/`weak`/`wiped` ride along (a read mark
  stays read, a wiped mark stays doubted); positions save as x/z,
  `pos.y` restored 0 like every writer.
- Gates: tsc, lint (vitest/sim batched with the next commits, per the
  new cadence).

## sprint 349 — the dead stay dead

- Biggest remaining reload lie: hazard kill-state was run-memory. A
  snipped wire re-armed, a bled line re-hissed, a choked wheel spun
  again, and a settled eye could file a SECOND witness line on the
  same face — the rooms you made safe were dangerous again and the
  register double-billed the same eye.
- `CheckpointSave.deadHazards` carries positional kill-state —
  `!armed` snares, `dead` steams/fans, and watchers that are `dead` OR
  `filed` (`filed` persists so a survivor can't be billed twice).
  `addFromRoom` runs upfront on startRun so restore marks entries
  directly: same-room + 0.35m positional match.
- `drainedRooms` was the same class of physical state (drained halls
  re-flooded on reload) — now persisted as `string[]` keys
  (`${space}:${idx}`).
- Gates: tsc, lint (vitest/sim/e2e batched at the next major commit).

## sprint 350 — the register can't bill the same manifest twice

- The Detective's `stockNoted` was per-instance: a checkpoint reload
  re-sighted your marked wares and filed a SECOND `unpaidHeld` line
  for the same manifest. `stockSighted` now takes the room key and
  dedupes against a persisted `stockFiled` set — the cue can re-fire
  (honest: he re-notes), the line can't.
- Gates: tsc, lint (batched verification with the next commits).

## sprint 351 — the boards talk to the index

- The wanted sheets named your hands to the swamper/hauler/laundress/
  grafter ears — but the under's third book heard nothing. While
  `wantedActive` stands, every consult of the under's paper now files
  DOUBLE: `fileQuestion()` (a `wantedActive ? 2 : 1` helper) replaces
  the six inline `paperTrail += 1` sites (book ask, wash, fence, work
  order, crew board, claim register). The docket rifle's `+= 2` stays
  — it was always the loudest ask.
- Readable: the wanted state is announced by the sheets and the
  extended-band catches; the book readout prints the live count.
- Gates: tsc, lint (batched verify follows).

## sprint 405 — the sting behind the seam

The primed tell now lands: opening a door onto a primed set piece cues
'[the work was already running — it heard you]' once per room
(`primedStingDone`, cleared on startRun; gated on the player being
outside `d.roomIndex` so leaving the room never re-stings). The s404
spill breathes too — `spillMeshes` (per-room cloned material) pulses
opacity 0.6±0.4 on the ensure loop, so a primed door reads alive from
the hall, not just lit.

## sprint 406 — the leg that couldn't listen

`doors.spec` primed leg: when every primed-audible milestone hosts a
scheduled entity, the entity tell outranks the primed cap by design and
the leg legitimately returned `none` — a real fail on some seeds. It now
returns `untested` (assertion skipped) when at least one primed room
existed but all were entity-scheduled; still fails hard when no primed
set piece exists at all.

## sprint 407 — the books stay open on you

Death screen now reads the same ledger epitaph the victory screen does
(s336's `BooksClosed`), inverted: victory closes the books, death leaves
them open — "the books stay open on you:" followed by the unpaid tally.
`bookLines()` shared in App.tsx; `deathInfo.books` populated in
Game.die() from the same five fields.

## sprint 352 — the count answers a named face on the spot

- The wanted sheets named your hands, but the count still queued a
  pilfer on its slow 75s cycle — a named face got the same grace a
  stranger does. `queueLoss()` (one helper for the four crewCount.push
  sites: cage tag, sledge cargo, both lamps) now passes `delay: 4`
  while `wantedActive` stands — the ring lands while you're still
  mid-exit of that room, so named pilfering has no steal-window to
  walk out of.
- Honest tell: the fast ring's caption gains '— the boards already
  named you' (ring captions are written at push-time). The quiet
  amendment reads `pending` either way — a fast loss is still a loss.
- Gates: tsc, lint (batched verify follows).

## sprint 353/354 — the boards tax everything

- While `wantedActive` stands, the under's whole counter sours:
  the Broker's purse pays `Math.max(4, gain − 2)` (named+clean pays
  the dirty price; named+dirty hits the register's sour floor of 4),
  the fix's call runs `price + 2`, and the fence's take pays
  `Math.max(2, 4 − 1)` per stack. Captions name the boards.
- Settles stay exempt by design — the audit/square tolls are the
  redemption that LOWERS the wanted state; taxing the exit would be
  perverse. Main-route prices untouched (the house reads the
  register, not the under's boards).
- Gates: tsc, lint (batched verify follows).

## sprint 355 — the sheet warns of the taxes

- The wanted readout now announces the whole price: 'the crew listens
  harder AND every counter reads the boards until the count settles' —
  so the s351–354 taxes are legible at the sheet, not just felt at
  each counter.
- Leg fix worth keeping: the strip-lamp leg's `pending >= 1` asserted
  the ring is ALWAYS still queued — s352's fast ring (~4s while named)
  fires mid-leg when the leg's earlier pilfers raised wanted. The leg
  now counts `pending + rung` (queued OR already rung) via a
  `ga.sound.on` capture of the 'marked gone' emit.

## sprint 408 — the undertow

- Rooms flanking an under-passage pick up its damp: the two rooms
  either side of the entry gate (ms-under-entrance ~index 61) and the
  return gate (~index 70) carry ceiling damp blooms, grime runs low on
  the walls, and standing floor stains — graded by distance.
- New `RoomInstance.underSeep?: number` — generator marks it (0 = the
  gate itself, ±2 the fade edge; a room in reach of both gates keeps
  the nearer grade), builder reads it and dresses the seep on its own
  rng draws (no new stream — the room-build rng is already per-room).
- Test: 'the undertow' asserts every gate-adjacent main room is marked
  and no far room is.
- Gates: tsc, lint, 247 tests, sim 5/5, build. Dressing-only change —
  no e2e leg per the tempo rule.

## sprint 409 — the set-piece approach

- The room before an unauthored set piece now bleeds that piece's marks:
  `ms-chase1`/`ms-chase2` → pursuer gouges, `ms-lens-hall` → curator
  scatter, `ms-baggage` → hauler drags. The ante rooms at 49/99 dress
  themselves; the under-entrance approach rides sprint 408's seep.
- New `RoomInstance.milestoneTell?: string` — a FORESHADOW_TELLS key set
  at generation when `rooms[i+1]` is a keyed milestone (skipped when the
  approach is itself a milestone). Mutually exclusive with `foreshadow`
  by construction; the builder reads `foreshadow ?? milestoneTell` once.
- Test: 'the set-piece approach' asserts the key, the exclusion, and
  that no stray room is marked, across all five seeds.
- Gates: tsc, lint, 248 tests, sim 5/5, build. Dressing-only — no e2e.

## sprint 356 — the repost walks — cut the reposter

- s344's bare-board recovery was an instant global flip — every sheet
  reappeared at once, unreachable. `entities/reposter.ts` is a
  `CrewChecker`-pattern walker: when the repost arms, a clerk walks
  the under spine hi→lo (WALK 1.6 — an amble, catchable) and pins a
  fresh sheet at each bare board in person (PIN_T 2.2). Cues: 'the
  clerk walks out with fresh paper', 'a sheet goes back up' per pin,
  'the boards stand re-sheeted'. `raiseWanted(true)` stays as the
  no-path fallback (empty hosts).
- Counterplay, honest both ways: 'cutRepost' (1.0s hold, ≤1.9m) grabs
  the bundle — the walk dies, 'the paper spills', and the boards it
  never reached stay bare. Cutting doesn't forgive you: the repost
  re-arms (`wantedRepostT = clock + 30`) — the clerk reaches for more
  paper. Mirrors the runner's cut: silence is bought, not the ledger.
- The tear/repost tug-of-war is now spatial: tear all 5 → 30s window →
  a physical walker re-pins one room at a time. Tearing while he walks
  is still free.
- e2e: the audit leg's repost phase updated — waits out the arm then
  the walker's first pin (the hi→lo walk can be long), drives onto
  `reposter.position` and holds E for the cut (cut detected by the
  'paper spills' caption — `active` also drops on a natural finish),
  asserts un-pinned boards stay bare. vitest reposter.test.ts covers
  dispatch→pin-order(hi→lo)→idle, mid-walk cut, dispatch refusal.
- Leg traps worth keeping: (a) teleporting out of the Auditor's room
  while owed makes him walk his ledger after you — the chase phase
  ends the settle verb; stand on him so `collect()` strikes and
  releases him home, then wait AT THE DESK (his spawn room, not the
  leg's aRoom — `spawnRoom = currentRoomIndex` at onSpawn, and the
  drawer rifle sets `demanded` without any room-presence). (b) the
  entity's position field is private `pos` — `clerk.pos`/`deskPos`
  read fine at runtime, `.position` is only the Reposter getter.
- Traps worth keeping: repost hosts come from `pickWantedHosts` at
  arm-time — rooms torn AFTER dispatch still get pinned if they were
  bare at pick; the walker's `pinAt` is nearest-path-point, so a host
  off the spine pins at its closest corridor point (the sheet still
  lands at the host's room — `repost()` writes `wantedRooms[roomIdx]`
  with the HOST's coords, not the walker's).
- Gates: tsc, lint, vitest 249 (3 new reposter specs), sim 5/5,
  undercast audit leg (in flight), build.

## sprint 357 — the clerk notices a bare board

- s344/s356's repost armed only when the boards hit ZERO — tearing
  four of five sheets was never answered. Every tear now arms the
  repost (~30s), and the walker re-pins THE TORN SLOTS (`bareBoards`
  map, roomIdx → host pos) instead of fresh downstream boards — a
  partial tear gets a partial re-sheet, same boards, honest spots.
- The duel is now per-board: tear → he walks → pin → re-tear → he
  walks again. Tearing mid-walk re-arms; at fire time a second
  dispatch is refused while he's out (+12s re-arm instead). Cut
  re-arms as before. `lowerWanted`/startRun clear `bareBoards`;
  it rides the checkpoint (`bareBoards` save field).
- Leg fix worth keeping: the audit leg's tear-sweep now outlives the
  armed repost — s357 means a pin CAN land mid-sweep. The leg pins
  `wantedRepostT = clock + 400` after each tear, then releases it
  (`clock + 1`) before the repost phase — deterministic sweep,
  real repost.
- Gates: tsc, lint, vitest persistence+reposter specs green,
  undercast audit leg green on the built bundle.

## sprint 358 — the spill smells of hands

- The reposter cut left no trace while every other pilfer does —
  tears and rifles both write 'work' sign. Grabbing the bundle now
  pushes a 'work' mark at the spill point (the warden/grafter read it
  like any rummage) and emits a positional rustle ('[paper scattering
  in the corridor]') — the counterplay is loud, just not fee-bearing:
  crew paper isn't your theft, but spilled sheets don't stay quiet.
- Traps worth keeping: 'rustle' is NOT a SoundCategory (it's a cue
  name) — the emit uses 'distraction'. And a `source`-tagged emit is
  FICTION (every hear gate rejects `e.source`) — the spill carries no
  `source` so the crew physically hears the paper hit the floor.
- Gates: tsc, lint, vitest 249.

## sprint 359 — the window is for strangers

- s328's bell-window worked for anyone: ring, rifle inside ~3.5s, the
  register never writes. But the register prices filed faces
  everywhere else — the window should too. `unfiled` now requires
  `unpaidHeld === 0`: once the register holds your face the bell
  can't buy his eye off it (rifle in-window while filed → +2 held and
  '[the register already holds your face — the bell can't buy his eye
  off it]'). House-book gated, not under-book — the boards don't reach
  upstairs; the register does.
- The eye matches the mechanic: warm clerk head-track now watches a
  filed face (`unpaidHeld > 0` counts as a watch reason beside
  Broker/cold/stock-tell) and ignores its own bell entirely.
- Leg fix: `headPre` read absolute head yaw — an unwatched head holds
  its last bearing (no decay path, s337 same trap). The probe now
  proves no-retrack: zero the book + drain `hotItems`/`hotImprints`,
  stand at a mirrored bearing, assert the head doesn't swing.
- Gates: tsc, lint, vitest 251, economy clerk leg green (unfiled path
  unchanged for a clean book).

## sprint 360 — the cold stays cold

- Same checkpoint hole as 346-351, last of the class: `tillTaken`,
  `closedCounters` and `stockSeen` were run-state a reload laundered —
  a rifled till re-warmed its clerk while `unpaidHeld` still punished.
  `CheckpointSave.closedCounters` restores the cold set AND re-stamps
  `meta.tillTaken` on each room's clerk socket; `stockSeen` carries the
  already-testified stock-reads. Sold wares still restock (paid, not
  stolen — the deliberate leniency).
- Known edge: the s333 'Slip the take back' verb is minted at rifle
  time and doesn't survive reload — post-reload the take stays fenced
  or carried. Same once-flag class as one-shot papers; noted, not
  closed.
- Trap: `route.rooms` exists by ~532 but the room restore block sits
  at ~680 — the stamp loop must live there, not earlier in startRun.
- Gates: tsc, lint, vitest 251 (+2 persistence fields).

## sprint 361 — the register answers back

- 'Ask what the register says — 3 imprints' on every staffed clerk
  figure — the house's mirror of the Broker's 'Ask what the book
  says' (s334). Flat 3: reading your own file isn't a thing the
  register surcharges. Repeatable (standing changes), cold counters
  fold it. Captions: `[the register on you — N claims held · your
  face is in it]` / `[the register has no line on you]`.
- The held count had no live readout upstairs until the victory
  screen; now the two books read you the same way on both floors.
- Anchor: same figure, waist height (y+0.85) vs 'ask' head height
  (y+1.4) — the pitch band separates them; a same-height second verb
  would lose every focus frame (s334 trap).
- Gates: tsc, lint, vitest 251, economy clerk leg +4 asserts
  (clean/filed/repeat/paid), build.

## sprint 362 — the register's face is on the sign

- The warden's sign-read (`signReads`, learns at 2) now reads
  `ctx.heldOwed()`: while the register holds a line on you, every
  fresh mark has a name attached — `signReads += 2`, so ONE mark
  authored by a filed face teaches what two strangers' marks used to.
  Tell: '[the register's face is on this sign — it knows these
  hands]'. Doubted marks (wipe-shadow range) still teach the name —
  "believed or doubted, it learns" already held.
- Counterplay hook it adds: settling your register debt de-arms the
  warden's pattern-read — the first sprint where the house book
  prices the WALK, not the counter.
- Ctx pattern note: `heldOwed` was already on EntityCtx (s314 eyes);
  corridor entities read it the same optional way (`c.heldOwed?.()
  ?? 0`) — makeCtx specs inject it as `heldOwed: () => 3`.
- Gates: tsc, lint, vitest 105 entities (+1 spec), sim 5/5.

## sprint 363 — the tally's mark is on the sign

- The under-side mirror of 362: the Grafter's `markReads` (eager at
  2) reads `ctx.claimsOwed()` — while the Auditor's book holds a line
  on you, one fresh mark below teaches what two strangers' marks
  used to. Tell: '[the tally's mark is on this sign — stone knows
  these hands]'. `old` marks still read as unknowing (the boards'
  pre-dated sign is ash); `weak` keeps the ash-snuffle line.
- `claimsOwed` = `unpaidTheft`, already on EntityCtx for the
  Auditor's own reads. Both corridor hunters now price sign off the
  book they answer to: warden ↔ register (362), grafter ↔ tally
  (363).
- Gates: tsc, lint, vitest 106 entities (+1 spec).

## sprint 410 — the periodic count (verification batch)

- Recorded e2e sweep on main covering s408-409 + s402-403: both
  under-passages grade the seep correctly (gate rooms carry 2 ceiling
  blooms, controls carry none); all four set-piece approach rooms bleed
  their tells (hauler 4.2m trail, pursuer 3.6m trails, curator stains);
  primed milestones still spill light under the door; 55-65 walk sweep
  clean. No failures.
- Verification note for probes: decal features are unambiguous by MESH
  signature (ceiling-damp quads at h-0.06, tell-trail quad sizes) — do
  not pixel-assert SwiftShader darkness.

## sprint 411 — the house teaches

- First-exposure captions on the verbs nothing told you: crouch
  ('soft feet, quiet doors'), sprint ('the house hears fast feet'),
  first hide ('the spot holds you — a thing passing close still smells
  you'), panic >0.5 ('panic throws you out of cover'), first dark room
  ('the dark keeps its own things — some of them are places to hide').
- `Game.teach(key, text)` fires once per key through 'arrival' cues;
  `taught` rides the checkpoint (new optional `CheckpointSave.taught`)
  so a death doesn't re-lecture. Fresh runs teach from zero.
- Gates: tsc, lint, 253 tests (persistence round-trip covers taught),
  sim 5/5, build. Runtime-only layer — no e2e leg.

## sprint 364 — the boards' courier knows your face

- The reposter carries your name in the bundle but walked past the
  thief: while `wanted()` and you stand in his room unhidden (<7m),
  the look stills the walk a beat (`spotT` — travel AND pins hold,
  he turns to face you) and he cries the location down the spine —
  a REAL SoundEvent emit at HIS position (entity-cue 0.55) so the
  under's listeners rouse. Once per walk (`sawNamed`). Hidden reads
  as furniture — no cry.
- ReposterHooks gained `wanted?: () => boolean` + `emit?: (e:
  SoundEvent) => void`; the update's player arg grew `room`/
  `hidden`. His room derives via `pointInRoom` on underRooms —
  `player.room === currentRoom` (the under index while under).
- Honesty note: the emit carries `caption: ''` — the recognition
  text already shows via cue; the sound is physics, not narration.
  The counterplay is being seen, not a ledger line.
- Gates: tsc, lint, vitest 254 (+1 reposter spec), sim 5/5.

## sprint 365 — the books mutter

- `maybeMutter(under)` rides the room-enter block both spaces — once per
  room per book (`murmured` set keyed space:room:book): register rustles
  in clerked/`records`/`lobby` rooms while `unpaidHeld >= 2`; the tally
  murmurs under while `unpaidTheft >= 2`; the index while `paperTrail
  >= 3`; the boards themselves lean while `wantedActive`. Whisper cues,
  non-positional — pure fiction gated on real book state.
- `murmured` deliberately does NOT ride the checkpoint: a reload
  re-muttering once is honest (the books still mutter) — it is not a
  consequence the player can launder.
- Gates: tsc, lint, vitest 254, sim 5/5.

## sprint 366 — the shout is a real sound; the sheets take the take

- s364's reposter cry emitted `category: 'entity-cue'` — that category
  is EXCLUDED from `ROUSE_CATEGORIES` (it marks rouse tells, the
  anti-cascade guard), so the shout roused nobody. Now `'distraction'`
  at intensity 0.55 (~7.7m) — a shouted name is a real disturbance.
  The vitest spec now asserts `noiseCanRouse(emits[0])`. Trap: any
  emit meant to be heard must use a ROUSE_CATEGORIES category —
  sprint/door/impact/item/puzzle-fail/machine/distraction/drawer.
- `EntityCtx.seizeMarked?: () => boolean` — repossess the marked take
  (strips hotItems stacks + zeroes hotImprints; false when nothing to
  take so callers cue honestly). Game impl mirrors the fence's strip.
- Swamper + Laundress strikes: while `wanted()` the catch also calls
  `seizeMarked` — the boards describe your face, the crew repossesses
  what the sheets describe (`[the marked wares go to the count]` /
  `go in the wash`). Grafter untouched: killPlayer means death —
  seizing pre-death is moot, the checkpoint still holds the take.
- Gates: tsc, lint, vitest 255, sim 5/5.


## sprint 412 — the mark deepens

- s409 marked only the room ON a set piece's door. Approach marks now
  grade two rooms back: `milestoneDist` (0 = adjacent, 1 = one room
  earlier) rides `milestoneTell`; the nearer milestone wins a contested
  room (min-dist). At dist 0 the two fields still exclude `foreshadow`
  (the next room IS the milestone); at dist 1 they can coexist — the
  builder prefers the live entity's marks via `foreshadow ??
  milestoneTell`.
- The builder thins by distance (`tellNear = 1 - dist*0.45`): gate and
  per-tell count both scale, so a Pursuer trail starts as faint scuffs a
  room out and gouges deep at the door. Entity foreshadows unaffected.
- Vitest: the s409 spec now asserts dist fields, the far-room grade,
  tell/dist pairing, and no marks deeper than 1.
- Gates: tsc, lint, vitest 254, sim 5/5. Generation-only — no e2e leg.


## sprint 367 — its doors stick

- While `wantedActive`, under doors swing at 0.6× openRate — the
  crew's doors read the boards. The stall announces once per door
  (`stuckAnnounced`), and the wanted-sheet readout now names this
  tax too ('its doors stick until the count settles'). A chase
  through a stuck door is the wanted episode's last unpriced gap —
  counters were taxed (s353/354) but passage wasn't.
- Gates: tsc, lint, vitest 255, sim 5/5.

## sprint 368 — the face buys nothing past six lines

- `clerkRefuses(roomIndex, pos)` — one refusal check behind buy/ask/
  purse: cold counter folds (`closedCounters`), and `unpaidHeld >= 6`
  closes EVERY staffed counter to the named face — `[she reads the
  register — the face buys nothing past six lines · the desk is the
  only answer]`. The register's escalation now matches the under's:
  deep debt ends service, not just prices it.
- askReg and slip-back deliberately stay open — a readout is
  information, and undoing the crime isn't commerce. The register
  readout declares the tier: '…the counters are closed to you' at 6+.
- The only house relief past six lines: the Detective's desk or the
  affidavit's −1. Reaching it takes 3 rifled tills or 6 witness lines.
- Gates: tsc, lint, vitest 255, sim 5/5.

## sprint 369 — the machines read the books too

- The deep tier (s368) covered staffed counters; the machines were
  still selling. `vend` now gates on the floor's own book:
  `unpaidHeld >= 6` upstairs ('the machine reads the register — it
  holds its stock'), `unpaidTheft >= 6` below ('the machine reads
  the boards — it holds its stock'). Papers, desks, the Broker and
  fix stay open on both floors — only staffed counters AND machines
  refuse. Deep debt ends the floor's commerce, not its mercy.
- Gates: tsc, lint, vitest 255, sim 5/5.

## sprint 370 — the index closes its own papers

- `indexClosed(pos)` — the third book's deep tier: `paperTrail >= 6`
  and the asking papers (work order, crew board, claim register)
  hold their pages — '[the index closes to you — six questions is a
  file, not a curiosity]'. Relief papers (counter-claim, return slip,
  affidavit), the desk, the Broker's book-readout and the fence stay
  open — closing the file's own valves or its readouts would strand
  or blind the player. All three books now have a deep tier: held →
  counters + machines, theft → machines, trail → asking papers.
- Gates: tsc, lint, vitest 121 (entities+persistence+wanted), sim 5/5.

## sprint 371 — e2e: the deep-tier legs

- The vend leg (economy) gained the deep-tier phase: a second unspent
  vend socket, `unpaidHeld=6` → refused 'the machine reads the
  register — it holds its stock' + no charge, then `=0` → sells
  clean (the tier lifts with the book, not permanently).
- New undercast leg 'the deep tier — the machines read the boards,
  the index closes': `unpaidTheft=6` → under vend refused + `=0` →
  sells; `paperTrail=6` → crew board refused 'the index closes to
  you' + no marginalia spent. Both legs green first try.
- Gates: tsc, lint; touched specs only per cadence.

## sprint 372 — the seal and the chalk ride the book

- `wardArmed` now rides `CheckpointSave` — an armed ward seal is paid
  protection (60–90 imprints); before this, a reload silently stripped
  the arm after `count--` had already eaten the item. Loss, not
  laundering, but the same class of missing field.
- `chalkMarks` (door tally marks the player drew) ride too — authored
  state, not consumable. Fresh runs still clear it (the 581 clear is
  pre-restore).
- Note for future: `as` casts inside a `.map()` inside an object
  literal mis-parse at the arrow's comma — give the callback an
  explicit return type instead (the pattern used for both maps).
- Gates: tsc, lint, vitest 255, sim 5/5, build.

## sprint 373 — the till holds its stock

- The deep tier was asymmetric: `unpaidTheft >= 6` closed the under's
  vending machines (s369) but the Broker's own pedestals still traded
  at the marked rate — the under's counter skipped the tier. Now the
  `shop` case's broker branch refuses at six: `[he reads the tally —
  the till holds its stock · the desk is the only answer]`.
- The purse, fence, fix and book stay open — laundering and settling
  aren't commerce (the same deliberate exemption as s368's readouts/
  relief valves). The book's readout declares the tier: '…the tills
  are closed to you' at `unpaidTheft >= 6`.
- e2e: the deep-tier leg gained the broker phase (refuse at 6 → sell
  at 0). Trap caught: a blind KeyE hold beside the pedestals presses
  whichever flank verb wins focus — the purse anchor won and its
  refusal caption failed every regex. Broker legs must press
  prompt-gated (`interactPressed` on /trade wares/) like the s311
  shutter leg, not blind-held.
- Gates: tsc, lint, vitest 255, sim 5/5, undercast deep-tier leg
  green, build.

## sprint 374 — the count's locker

- `seizeMarked` no longer vanishes the take: stripped stacks stash
  into `seizedTake` + hang under a fresh tag at the nearest under
  claim cage (`stashSeized`). 'Claim your seized take — 8 marginalia'
  mints via `dynamicInteractables`; claiming pays like a bag, files
  `unpaidTheft +1`, and queues the late till-ring like any draw. The
  whole seize→locker→reclaim loop now has a price and a place — a
  named catch costs the goods once, not forever.
- The tag hangs on the cage's FRONT edge (0.45m toward room center):
  first attempt put it on top of the cage's own claim verb (aim
  shadowed — 'Reclaim the effects tagged X' won every focus frame);
  a lateral offset could still sit BEHIND the authored tag. Anchoring
  along (roomCenter − socket) makes it the nearer verb by
  construction.
- `seizedTake` rides `CheckpointSave` (optional — old saves parse
  clean) and re-mints on restore.
- e2e note: hold verbs need the key HELD — `interactPressed` edges
  only fire instant verbs. The locker's leg holds `KeyE` gated on the
  focused prompt.
- Gates: tsc, lint, vitest 255, sim 5/5, undercast 'the count's
  locker' leg green, build.

## sprint 375 — the locker reads at the end

- `BooksClosed` gained `seized` (optional — older saves/UI payloads
  parse clean): the count's locker joins the epitaph. Both payloads
  (death `books`, victory `books`) sum `seizedTake` units.
- `bookLines` adds 'N seized wares still hang in the count's locker'
  — the reclaim path has its reckoning on both end screens.
- Gates: tsc, lint, vitest, sim, build (batched with the sprint).

## sprint 376 — one locker, and the tag files double under the sheets

- `stashSeized` no longer re-anchors on a second catch: while a tag
  still hangs, a fresh seize just joins the same locker (previously
  `seizedAt` moved to the nearer cage while the minted verb stayed
  at the first — the tag and the goods disagreed, and a checkpoint
  restore re-minted at the wrong spot). One locker per run.
- Under `wantedActive` the seized-claim files `unpaidTheft +2` (the
  tag is written in your name while the sheets are up — same rule
  `fileQuestion` follows for asks). Cue reads '... · the sheets
  write your name twice'.
- e2e traps logged: (1) `wantedActive` is frame-synced — lowered
  when `unpaidTheft <= 0`, raised while any Auditor `demanded`.
  Setting the flag directly gets stomped; hold `demanded` + owed
  instead (his openLedger tick gates on `!demanded`, so the desk's
  priority-4 'Settle' verb never re-mints mid-loop). (2) 'Settle
  the ledger' outprioritizes a cage tag under aim outright — owed
  tally beside an Auditor room means the tag can't be pressed.
- Gates: tsc, lint, vitest 255, sim 5/5, the locker leg extended
  (join + named-double phases), build.

## sprint 377 — the book knows the locker

- The seize cue now names the destination: both grab sites (Swamper,
  Laundress) read '[she takes what the sheets describe — a tag hangs
  on the nearest cage for it]' — the locker was previously only
  discoverable by happening on the cage.
- The under-book readout ('Ask what the book says') appends
  '· a tag keeps N of yours at the cages' while seizedTake pends —
  the locker is readable through the same paid readout as the
  ledgers, no new geometry.
- vitest: the s366 named-catch spec's caption regex updated to the
  tag phrasing.
- Gates: tsc, lint, vitest 255, sim 5/5, build.



## sprint 413 — the seam bleeds

- The s409/412 marks stopped at room edges — a jittered set piece's
  drawn gap-corridor (`connectorIn`) still read clean right up to the
  door. `MILESTONE_TELLS` is now module-scope + exported from
  generator.ts; the builder's connector block keys off it and lays
  the same `FORESHADOW_TELLS` decals along the run: floor marks sit
  on the door-half of each leg (`t = len*(0.5..0.95)`), wall marks
  flush on either face, and the leg landing on the threshold gets
  one extra mark — the trail deepens INTO the seam it pointed at.
- `FORESHADOW_TELLS` exported from builder.ts for the test.
- Vitest 256: 'the seam bleeds' asserts every keyed ms- template
  maps to a drawable tell and every seed's route carries each keyed
  set piece.
- Gates: tsc, lint, vitest 256, sim 5/5. Visual dressing only — no
  e2e leg.
||||||| 86c3548


## sprint 378 — the lamp reads the marks on you

- The checker's find now seizes: `CheckerHooks.seizeMarked` fires once
  per dispatch alongside `witnessed` — a lamp that spots you carrying
  rifled stock receipts it into the count's locker on the spot
  ('[the lamp reads the marks on you — the count takes its own]').
  Not wanted-gated: the lamp literally reads the mark — the count's
  own counter is the one place the boards don't matter.
- Game wires it through the same `entityCtx().seizeMarked` path the
  grabs use — same strip/spare semantics, same locker mint.
- e2e: the checker leg now carries a marked latchpick into the find —
  asserts strip→locker→minted verb. vitest spec asserts the hook
  fires once per dispatch.
- Gates: tsc, lint, vitest 255, sim 5/5, checker leg green, build.


## sprint 414 — the worn way

- Thresholds now carry the traffic: every leaf lays a `thresholdWear`
  strip just inside the room (85% main-route, 45% branch) — a new
  decal fn (polished traffic band + drag scuffs, feathered edges) —
  and a LOCKED leaf scars the wall beside it at handle height
  (75%: scratchMarks; toll leaves get handPrints ×2 — crowds tried).
  Door decals use the Game.ts convention: world door pos → room-local
  via R(-yaw), long axis `room.yaw - door.yaw - PI/2` across the leaf.
  Decals are named (`worn-threshold`, `lock-scars`) for tests/debug.
- Vitest 257: 'the worn way' builds the first 40 main rooms ×5 seeds,
  counts named decals — wear everywhere, scars on locked rooms.
- Gates: tsc, lint, vitest 257 (worn-way spec green), sim 5/5.
  Visual dressing only — no e2e leg.

## sprint 379 — the tag rots

- The count's locker was a free store — seized goods hung claimable
  forever. Now `seizedFuse` (300s) ticks down: at 60s a warn cue
  ('[the tag's ink is fading — the count prices patience]') + the
  book readout gains '· the ink is fading'; at 0 the tag reads
  settled, the count keeps the goods, the verb is swept.
- Honest both ways: a fresh catch re-hangs fresh ink (fuse restarts
  even when the take joins a standing locker), and the fuse rides
  the checkpoint — a reload can't launder a rotting tag.
- e2e: the locker leg's new rot phase seizes, shortens the fuse past
  the fade line, asserts fading→fenced→verb-gone.
- Gates: tsc, lint, vitest, sim 5/5, locker leg green, build.
