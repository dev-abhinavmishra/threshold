# THRESHOLD

A hundred doors. The house keeps the count.

**THRESHOLD** is a first-person browser horror game: a procedurally generated
100-room run through an archival hotel that is also an index of everything it
has kept. Every run is fully deterministic from its seed text — same seed,
same house, same things waiting in it.

Built entirely in code: every model is procedural Three.js geometry, every
sound is synthesized in WebAudio, every room is assembled from a seeded room
grammar. No external assets.

## Playing

```bash
npm install
npm run dev        # → http://localhost:5173
```

**Controls** (all remappable in Settings → Controls)

| Action | Default |
| --- | --- |
| Move | WASD |
| Look | Mouse (pointer lock) |
| Sprint | Shift |
| Crouch | C |
| Interact | E |
| Slam door (loud, fast) | Shift + E |
| Creep door (slow, quiet) | C + E |
| Peek keyhole (locked door) | C + hold E |
| Lamp | F |
| Item slots | 1–4 |
| Pause | Esc |

**Objective:** reach Room 100 — The Engine — breach it, restore its relays,
route its index, and leave through the Isolator. Dying returns you to your
last checkpoint (the house remembers where you were).

## The route

- **000** — the lobby. You arrive.
- **001–009** — onboarding: movement, doors, drawers, your first lamp.
- **010–019** — The Sweep teaches hiding.
- **020–029** — Witness, Whisper, Redactor: sight, sound, and false doors.
- **030** — the Pursuer's first chase.
- **031–039** — Reprise rebounds; Hollow waits in warm cabinets; Panic meter.
- **040** — the Clinic. Breathe.
- **041–048** — the Curator's shadow lengthens; listen for the catalogue.
- **049** — antechamber.
- **050 — The Index** — stealth past the blind Curator, catalogue five cards,
  solve the console.
- **051** — the Custodian. Merchant: spend Imprints on gear.
- **052–059** — mixed pressure: Maelstrom demands Stabilization.
- **060–062** — the Underscript entrance. Bring the Resonance Key and two
  seal clamps, or keep moving.
- **063–069** — Echo-Skin: never look back while it passes.
- **070** — the Conservatory.
- **075 — Lens Hall** — charge the Orrery's four pylons to open the way.
- **080** — the second chase.
- **081–098** — the Unlit Stacks. Lamplight is scarce; entities are not.
- **099** — final antechamber.
- **100 — The Engine** — breach, relay recovery, routing board, escape.

### The Underscript (optional)

Below the hotel: 121 sub-basement rooms, U-000…U-120. Entry requires the
Resonance Key and two seal clamps (all found before the entrance). Down there
you earn **Marginalia** instead of Imprints, the Pulse Lamp replaces your
flashlight, and the Editor deletes things behind you. Reach U-120 for the
Palimpsest; exits return you to the main floor near room 70.

## Developing

```bash
npm run dev          # dev server
npm run build        # typecheck + production build → dist/
npm run preview      # serve the build
npm run lint         # eslint (zero warnings)
npm run typecheck    # tsc --noEmit
npm test             # vitest: rng, generation, entities, math, persistence
npm run test:e2e     # playwright browser smoke tests
npm run sim          # headless route validation across seeds
```

### Seeds

Every run is keyed by its seed text (shown top-left in the HUD, enterable on
the title screen). `seed streams → structure / dressing / loot / encounter /
audio / puzzle / entity` are independent, so systems never starve each other.
`qa` difficulty compresses the route to ~22 rooms for rapid playtesting.

### Architecture notes

- **Renderer**: imperative Three.js 0.170 (not R3F — the room streamer needs
  explicit control over mesh lifecycles and pooling).
- **Generation**: port-chained placement (each room's entry port mounts on
  the previous exit), AABB overlap rejection, jittered milestone standoffs
  with drawn gap-corridors, branch loot closets, authored anchors at fixed
  indices.
- **Validation**: `validateRoute` certifies connectivity, key-before-lock,
  survival options within reach of lethal triggers, encounter incompatibility
  windows, milestone ordering, and Underscript entry requirements.
- **Collision**: kinematic AABB-only (`slideMove2D`, `raycastAabb`,
  `hasLineOfSight`) — no physics engine.
- **Streaming**: sliding window `[center-4, center+5]` keyed on room index;
  Underscript is a separate index space.
- **Entities**: explicit state machines (`idle/warn/engage/resolve/done`)
  driven by the difficulty director (cooldowns, spawn chances, mercy after
  death, incompatible pairs).
- **Audio**: WebAudio synth (no samples) — buses for music/sfx/ui/voice,
  spatial cues, generative pads per mood, chase percussion, caption feed for
  every cue.
- **Persistence**: `threshold.settings.v2`, `threshold.meta.v1`,
  `threshold.run.v1` in localStorage.

## Accessibility

Full key remapping, mouse sensitivity + invert-Y, FOV, reduced motion and
reduced flashes, captions for every audio cue, hint frequency control,
minigame assist, colorblind/high-contrast HUD, and multiple text scales.

## Testing

- `test/` — Vitest: seeded-RNG invariants, generation properties
  (determinism, connectivity, non-overlap, port chaining, key ordering),
  entity simulations (sweep pass, reprise rebounds, exposure kills, mesh
  leaks), movement math, settings/meta/checkpoint persistence.
- `e2e/` — Playwright: menu render, run start + HUD, settings, archive.
- `npm run sim` — prints per-seed route stats + validation report.

## License

Original work. All art, geometry, audio, text, and code is generated for this
project — no third-party assets, characters, or layouts.
