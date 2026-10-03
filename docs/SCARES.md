# THRESHOLD — Scare & Systems Catalog

Every seeded scare beat, the salt it uses on the `scare` room stream, what the
player sees/hears, and what it costs or buys you. Salt discipline: each beat
uses a distinct salt added to the room index so beats are independent and
deterministic per seed. `+977` marks the Underscript offset when a beat is
ported to the subfloor.

## Room-entry scares (seeded per room, fire once on entry/revisit)

| Beat | Salt | Trigger | Effect | Counterplay |
|------|------|---------|--------|-------------|
| Haunt door | +87 (0.08) | room entry | a shut door drifts open alone | none — it is scenery |
| Relic relocate | +313 | room entry | a small object ends up somewhere it has no business being | none |
| Mirror wrongness | +313-era / mirror prop | facing a mirror near it | reflection beat fires | look away |
| Blackout | +0 (room index) | room entry | lamps die in a seeded room until you pass through | lamp / sprint through |
| Custodian greet | +881 | custodian room | the figure behind the counter nods/greets | trade normally |
| Broker greet | +881 | u-lobby | robed figure greets from behind the counter | barter at pedestal |
| Re-signature | +711 | revisit lobby | the register has signed itself again | none |
| Shift-door (under) | +311 (+977) | under entry | an under door repositions between visits | re-read the room |
| Breathing room | +811 (+977) (0.11) | room entry | lights pulse on a slow breath cycle | none |
| Piano wire | +911 (0.5) | piano prop present | one detuned note, positional | none |
| Door try | +933 (+977) (0.2) | room entry, ≥4 | handle rattles once, leaf shudders | listen for the latch |
| Falling book | +955 (+977) (0.3) | bookshelf/stackShelf prop | a book drops off the shelf, lands, stays | none |
| Answering steps | +166 (+977) (0.18) | room entry, ≥5 | your next 4–8 footsteps echo ~2.8m behind you; echoes emit real 'ambient' sound events | **warn:** the echo is loud enough for sound-hunters — walk quietly or wait it out |
| Phone rings | +199 (+977) (0.3) | payphone prop, ≥4 | 4s of ring bursts then stops; each ring emits 0.55 'ambient' | **warn:** draws Curator-type hunters; leave the room or be ready |
| The numbers moved | +143 (0.3) | **revisit** | the exit-door number plate reads a wrong room; sticks across re-streams | chalk-mark your doors; trust the mark, not the plate |
| Wall writing | +177 (+977) (0.28) | **revisit**, ≥6 | red scrawl appears on an interior wall ("BEHIND YOU", "STILL COUNTING", …); persists across re-streams | it's only paint — probably |
| The tenant moved | +188 (+977) (0.7) | **revisit**, deadTenant present | the slumped seated figure is simply gone; only the ink pool it sat in remains | none — it isn't after you. yet. |
| Clocks hold their breath | — (dread-driven) | proximity | every clock hand freezes and ticking stops while an engaged threat is within ~10m | stopped clocks = something is close; use the silence |
| Vending machine | — (loot stream) | maintenance/records rooms, ~22% | feed it 4–9 imprints; vends a seeded item, loud 0.6 'machine' emit | **warn:** the clank draws hunters — spend when it's quiet |
| Music box | +0 (0.1) | timed, domestic biomes | tinny note drift from room center | none |
| Door knock | +999 (0.14) | timed | slow fist on the entry door | don't answer |
| Elsewhere sound | +555 | timed | a big sound two rooms away | it's elsewhere — or it isn't |
| Crosser | +733 | timed | something crosses a far doorway, once | none |
| Unseen steps | +131 (0.16) | timed | five weighted paces crossing a room | none |

## Door states (world, not beats)

| Kind | Where | Behavior | Counterplay |
|------|-------|----------|-------------|
| Locked | main route, seeded 0.18 on rooms ≥8 | needs the matching key socket (placed ≤4 rooms earlier, guaranteed) | find the key |
| Toll door | branch closets only (~35%) | asks **3 imprints** to open | pay, or skip — never on the main route |
| Deep door | branch closets only (~30% of non-toll) | opens onto only dark (void quad masks the closet); reveal sting at arm's reach | walk through anyway — the closet is real |
| False door | planted by Redactor | a door that isn't a door | count doors against the room plan |
| Drawer locked | ~18% drawers (main), ~25% (under) | latchpick or hold-to-force (loud, weak loot) | pick is quiet, force is fast — choose by what's hunting |

## Player verbs (agency)

| Verb | Key | Effect | Cost |
|------|-----|--------|------|
| Slam door | sprint+E | fast open, intensity 1.5 — heard far | noise |
| Creep door | crouch+E | slow open, intensity 0.12 | time |
| Peek | hold E on locked | keyhole look into next room | time |
| Toss a pebble | T | 0.45-intensity distraction 3.5m ahead, 8s cooldown | free |
| Wind-up alarm | item | 14s ticking lure, 0.9 intensity | item |
| Chalk mark | item | persistent mark on a door you marked | item |
| Ward seal | item | checkpoint-protection seal | item |

## Milestone / world systems

- **The Baggage Hall (room 25 / label 018 short-run)**: authored lost-luggage depot — suitcase rows, trolleys, 5 sockets, 2 hides; authored flag keeps it lock/encounter-free.
- **Under caches**: under sockets fill from a meaner table (~38% per socket, imprints 3–16); landings (U-%20) stay safe.
- **Custodian shop** (room 52): seeded stock of 3–5 from {sparkFlash, bandage, latchpick, windAlarm, wardSeal}; unstocked pedestals disabled via `meta.taken`.
- **Broker pedestals** (u-lobby): exactly 2 per lobby, `meta.broker` + price.
- **Death echo**: re-entering the room you died in fires a one-shot memory beat.

## Ambient engine beats

- **Room-tone beds** per biome/space (underscript dark beds differ).
- **Dread heartbeat**: nearest engaged entity distance drives the lub-dub layer.
- **Torch sputter**: the beam stutters near occupied hiding spots (the Inkling/hollow tell).
- **Sweep telegraph**: corridor runners dim lamps along their path front as a travelling wave (`telegraphSpan`).
- **Clock ticks**: near a running grandfather clock, once a second.
- **Under-draft**: periodic cold pull near the Underscript passage.

## Testing hooks

- `?debug` or dev mode installs the debug panel (`src/game/debug.ts`): room-jump, entity spawn/kill, state overlay, perf HUD.
- `npm run sim` re-validates generation across 5 seeds (keys-before-locks, hiding coverage, no overlaps).
- Generation invariants tested in `test/generation.test.ts`: toll doors never main-route, deep doors never toll/locked, under caches never on landings, baggage hall authored at 25.
