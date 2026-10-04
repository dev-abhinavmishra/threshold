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
| The occupant knocks | +211 (0.55) | Wake proximity ≤3.4m | a single knock answers from inside the ajar coffin | don't lean in |
| Clocks hold their breath | — (dread-driven) | proximity | every clock hand freezes and ticking stops while an engaged threat is within ~10m | stopped clocks = something is close; use the silence |
| Vending machine | — (loot stream) | maintenance/records rooms, ~22% | feed it 4–9 imprints; vends a seeded item, loud 0.6 'machine' emit | **warn:** the clank draws hunters — spend when it's quiet |
| Played piano | — (interaction) | lobby/guest/gallery pianos, once per room | three detuned strikes, loud 1.5 'distraction' emit at the instrument | a real lure — play it and be somewhere else |
| Tuned television | — (interaction) | guest-room TVs, once per set | the flicker resolves to a steady dead channel — fixed light in a dark room, 0.7 'machine' hiss | light for the dark; the hiss carries to listeners |
| The channel answers | +383 (0.32) | 14–26s after a TV is tuned | a whisper plays from the set — it heard the tuning | the answer draws listeners too — leave before it speaks |
| Wound clock | — (interaction) | grandfather clocks, once per clock | three struck chimes over ~2.2s, loud 1.3 'distraction' emit each | the loudest deliberate lure in the game — wind it, then be gone |
| Cracked valve | — (interaction) | steam vents / boilers / manifolds, once per vent | ~26s of steam: inside ~7m your footstep emits are drowned ×0.22; the hiss itself calls listeners every ~2.4s | cover, not silence — sprint through the hiss zone, don't linger at the valve |
| Lit hearth | — (interaction) | fireplaces / stoves / masonry heaters / fire pits, once each | ~45s of firelight: heals 2.2/s inside ~3m, flickering warm light, soft crackle emits | the house sells you rest, loudly — healing means standing still where it's lit |
| Lifted receiver | — (interaction) | dead payphones, once per phone | a whisper reports the nearest threat's distance (in the room / a door away / rooms away) | the receiver clack is a sound — ask, then move |
| Armed mousetrap | +611 (0.32/trap) | some mousetraps are set — a raised jaw wire is the tell | stepping on one snaps it: 4 damage, a loud footstep-class emit, a panic tick | look down in storage rooms; a set trap can be pried flat (E) before you cross it |
| Ran the load | — (interaction) | washers/dryers, once per machine | ~24s unstoppable cycle: a loud thump every ~1.2s that masks your steps inside ~6m (×0.35) and calls patrols to the laundry | start it and take the long way — hunters answer the drum, not you |
| Empty the drum | +631 | when a run cycle ends | the drum pays out — marginalia (55%), or a wet clank that emits a 0.7 lure (30%), or nothing | come back for it — but standing by the ding has an audience |
| The luggage arrives | +563 (0.16) | seeded rooms, ~6s+ after entry | a suitcase appears — only ever while its spot is unobserved; a settling thud marks it if you're close | it was not there; someone carried it in while you looked elsewhere — check it, then keep moving |
| Printed page | — (interaction) | office printers, once each | prints a route report — next lock (Meridian) or doors-to-exit (Underscript); a jam (28%) grinds loud instead | information for noise — the whir is heard; a jam is heard further |
| The keyhole answers | +677 (0.24/door) | peeks through locked doors | the far side is occupied: an eye at the hole, a close whisper, a panic tick — once per door | peeking is information with a price; the house watches back |
| Struck key | — (interaction) | typewriters, once each | four spaced clacks over ~1.4s, each a 0.55 distraction emit on the desk | a mechanical lure — write a word, be somewhere else |
| Looked out | +683 | windows, once each | the outside is fog, or the corridor you crossed (empty), or someone looking up — a panic tick on the last | the window is free to check; it is not free to be seen checking |
| Cold water | +691 (0.3 wrong) | water coolers, once each | a real drink heals 6 — or the tap runs tepid and thick (panic +0.12) | thirst is a gamble the plumbing settles |
| The pipes tick | — (proximity) | rooms with pipework/boilers/vents | ironwork ticks — slow when a threat is far, faster as it closes under ~12m | the walls keep count: hear it quicken, find a hiding spot |
| The stone migrates | +613 (0.55/statue) | statues and marble busts | one quiet step toward you, up to ~1m — only ever while unobserved; a scrape if you're close | it waits for you to look away; leave the room, don't stare |
| The pages whisper | — (proximity, ~1.2s) | bookshelves, papers, stacks | linger close and the pages say a title — yours. Once per shelf | reading is free; being read is the price |
| Loose rug | +617 (0.35/rug) | rugs with a curled corner | steps out from under you once: a stumble (×0.72 for 1.4s), a small footstep-class emit, a panic tick | watch the floor — a curled corner means it lies |
| Rest a moment | — (interaction) | benches and chairs, once each | sit for 3s frozen and exposed; stamina returns in full when you rise | the wood creaks its welcome — rest is loud and still |
| The boards remember | +619 (0.22/room) | seeded rooms, both floors | upright strides answer with a creak and a small footstep-class emit | crouch and the house forgets you crossed |
| Wet floor | +619+977 (0.4/puddle) | puddles | running feet lose it once: a hard stumble (×0.6 for 1.8s) and a splash that carries | crouch-wade the wet — standing water takes standing feet |
| Chandelier drop | +701 (0.35/chandelier) | armed chandeliers, both floors | the chain creaks when you stand beneath; a loud noise there drops the glass — 18 damage and a crash every hunter hears | creak means step off the drop zone; never be loud under glass |
| Music box | +0 (0.1) | timed, domestic biomes | tinny note drift from room center | none |
| Door knock | +999 (0.14) | timed | slow fist on the entry door | don't answer |
| Elsewhere sound | +555 | timed | a big sound two rooms away | it's elsewhere — or it isn't |
| Crosser | +733 | timed | a masked figure strides across a far doorway, once, mid-stride animation | none |
| The Shade | +347 (+977) | timed, ≥9 | a figure that has no body until the beam catches it — it stands, only ever at opacity the light grants | it can't move — the dark never belonged to it |
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
- **The Wake (room 85)**: authored chapel of rest — bench rows, candle-lit bier with an ajar coffin, offering loot, 2 hides; `special: 'wake'` keeps it quiet except its own beats. The lid lifts on a long hold: the reveal is authored — empty shelf, warm pillow, and a guest note that should not know your name.
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
- **Painted eyes**: ~3/10 paintings carry a gaze — eyes that open only while unobserved (out of the view cone or too far to read), drifting toward your position; look at one and they are just paint again. First full open whispers a cue per painting.
- **The Singer**: replays your own footstep trail ~5 s behind you — real sound events in your cadence; stop walking and it waits silently, look at it and it bolts. Harmless, and a quiet decoy: hunters that hear it track *it*, not you.
- **Foreshadow marks**: the room before a scheduled entity carries that entity's tell as decals — runner trails (`pursuer`/`sweep`/`reprise`), high claw-marks (`returner`), glass-web cracks (`stillframe`), black handprints (`redactor`/`hollow`/`witness`), peeled strips (`whisper`/`curator`), ink blobs (`inkling`), a drag smear (`maelstrom`), a sleep ring (`husk`), grit + cracks (`grafter`), red warning stripes (`editor`/`redline`), doubled footprints (`echoskin`), frame-edge scratches (`margin`), low scratches (`lurker`), wide cracks (`behemoth`), low grime (`orrery`), coin-spill stains + low handprints (`collector`), short footprint pairs (`singer`). ~4/5 of scheduled entities leave a mark; main floor only.

## Testing hooks

- `?debug` or dev mode installs the debug panel (`src/game/debug.ts`): room-jump, entity spawn/kill, state overlay, perf HUD.
- `npm run sim` re-validates generation across 5 seeds (keys-before-locks, hiding coverage, no overlaps).
- Generation invariants tested in `test/generation.test.ts`: toll doors never main-route, deep doors never toll/locked, under caches never on landings, baggage hall authored at 25.
