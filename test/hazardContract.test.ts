/**
 * Sprint 263 — hazard-contract audit.
 *
 * Every environmental damage source must carry BOTH halves of the deal:
 * a readable tell (prompt or spatial cue) and a paid-quiet defuse verb.
 * This spec is the regression guard: it walks the real interactable
 * registrations and the HazardField update path, and fails if a hazard
 * class ever loses its tell or its defuse.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { InteractionSystem } from '../src/player/interaction';
import { v3, hasLineOfSight } from '../src/engine/math';
import { shutLeafBlockers } from '../src/engine/doorGeo';
import type { Door, RoomInstance, Socket } from '../src/game/types';

const sock = (kind: string, meta: Record<string, unknown>, x = 1, z = 1): Socket =>
  ({ kind: kind as Socket['kind'], pos: v3(x, 0, z), yaw: 0, filled: true, meta });

const roomWith = (sockets: Socket[]): RoomInstance => ({
  index: 4, templateId: 'maint-boiler', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
  width: 8, depth: 8, spec: { width: 8, depth: 8, props: [] },
  doors: [], hidingSpots: [], scheduled: [], sockets,
} as unknown as RoomInstance);

describe('hazard contract — every hazard carries a tell and a defuse', () => {
  it('wired drawers: the prompt carries the tell AND coaches the coax', () => {
    const sys = new InteractionSystem();
    sys.addRoomInteractables(roomWith([sock('drawer', { wired: true, contains: 'bandage' })]));
    const d = sys.interactables.find((i) => i.kind === 'drawer');
    expect(d?.prompt, 'wired drawer must read forced').toMatch(/latch looks forced/);
    expect(d?.prompt, 'the tell must coach the defuse').toMatch(/coax/i);
  });

  it('clean drawers stay silent — the tell is honest', () => {
    const sys = new InteractionSystem();
    sys.addRoomInteractables(roomWith([sock('drawer', { contains: 'bandage' })]));
    expect(sys.interactables.find((i) => i.kind === 'drawer')?.prompt).toBe('Search drawer');
  });

  it('every defuse kind is registered and dispatched in code', () => {
    const interactionSrc = readFileSync('src/player/interaction.ts', 'utf8');
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const hazardSrc = readFileSync('src/entities/room.ts', 'utf8');
    // defuse verbs: snip (snare), bleed (steam), coax (wired drawer),
    // valve/drain (puddle), trap (floor trap pry)
    for (const kind of ["'snip'", "'bleed'", "'coax'", "'scrub'", "'chock'", "'forge'", "'tape'", "'untape'", "'fix'", "'ask'", "'till'", "'bell'", "'purse'", "'fence'", "'restock'", "'book'", "'askTally'", "'wanted'", "'wantedTear'"]) {
      expect(interactionSrc, `${kind} in InteractKind`).toContain(`| ${kind}`);
      expect(gameSrc, `${kind} press dispatch`).toContain(`case ${kind}`);
    }
    // tells: each hazard names itself before it bites
    expect(interactionSrc).toContain('latch looks forced');
    expect(hazardSrc).toContain('about to vent');
    expect(hazardSrc).toContain('hums amber');
    expect(hazardSrc).toContain('wire underfoot');
    expect(hazardSrc).toContain('belt-wheel chews');
    // the watched hall: the eye names its rule before it reports you
    expect(hazardSrc).toContain('the eye pans');
    expect(hazardSrc).toContain('settles on you');
    // damage paths: all four hazards reach damagePlayer
    expect(hazardSrc).toContain('Paper seals root and rustle');
    expect(hazardSrc).toContain('Steam blasts off the line');
    expect(hazardSrc).toContain('Electrified water hums amber');
    expect(gameSrc).toContain('latch bites');
    expect(hazardSrc).toContain('blades take standing flesh');
    // the drain kills the arc — the puddle's paid quiet
    expect(hazardSrc).toContain('isRoomDrained');
    // sign erasure: the felt-wrap cover-up clears hazard evidence
    expect(gameSrc).toContain('hazard.evidence');
    // the wrap's ash is weak sign — only the grafter's duller nose reads it
    expect(gameSrc).toContain('weak: true');
    expect(gameSrc).toMatch(/staleOk \|\| !e\.weak/);
    // the wipe is the scrub's shadow — warden-only, never marked read, and
    // sign beside it is doubted, not investigated
    expect(gameSrc).toContain('wiped: true');
    expect(gameSrc).toMatch(/wardenOk \|\| !e\.wiped/);
    // sign goes cold — the warden only believes fresh work (~6 min)
    expect(gameSrc).toMatch(/e\.t >= cold/);
    // the tape is testimony — a blinded eye leaves fresh sign both readers chase
    expect(gameSrc).toContain("kind: 'blind'");
    const corridorSrc = readFileSync(new URL('../src/entities/corridor.ts', import.meta.url), 'utf8');
    expect(corridorSrc).toContain('the floor smells wiped');
  });

  it('the house re-lays its work — every dead-hazard sign can restore', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const corridorSrc = readFileSync(new URL('../src/entities/corridor.ts', import.meta.url), 'utf8');
    const baseSrc = readFileSync('src/entities/base.ts', 'utf8');
    // the floorkeeper callback exists in the ctx contract
    expect(baseSrc).toContain('rearmHazard');
    // the warden remembers which sign it walked to
    expect(corridorSrc).toContain('investigateKind');
    // and the restore handles all four dead-hazard sign kinds
    expect(gameSrc).toMatch(/kind === 'wire'/);
    expect(gameSrc).toMatch(/kind === 'line'/);
    expect(gameSrc).toMatch(/kind === 'fan'/);
    expect(gameSrc).toMatch(/kind === 'blind'/);
    // the house pockets the felt it peels — confiscated, not returned
    expect(gameSrc).toContain('the felt is confiscated');
  });

  it('the under\'s coin testifies — every marginalia spend routes the funnel', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // no raw spend outside the funnel itself and the two jurisdiction
    // exceptions (the house till launders torn pages silently)
    const raw = gameSrc.split('\n').filter((l) =>
      /this\.marginalia -=/.test(l) && !/chargedMarginalia/.test(l));
    expect(raw.map((l) => l.trim())).toEqual([
      'this.marginalia -= 8;',                    // the upstairs purse — the tear means nothing to the house's till
      'this.marginalia -= n;',                    // the funnel itself
    ]);
    expect(gameSrc).toContain('hotMarginalia');
  });

  it('the under relocates instead — the scavenger strips and re-lays wire', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const spSrc = readFileSync(new URL('../src/entities/setpieces.ts', import.meta.url), 'utf8');
    const baseSrc = readFileSync('src/entities/base.ts', 'utf8');
    const storeSrc = readFileSync('src/game/store.ts', 'utf8');
    // the asymmetry is contractual: the house repairs (rearmHazard),
    // the under moves hazards onto your path (strip + plant)
    expect(baseSrc).toContain('stripSnare');
    expect(baseSrc).toContain('plantSnare');
    // the grafter carries the coil and lays it in your room
    expect(spSrc).toContain('this.carrying');
    expect(spSrc).toContain('the coil unwinds where it walks');
    // grafts are real snares with real faces — and they persist
    expect(gameSrc).toContain('grafted: true');
    expect(gameSrc).toContain("kind: 'snare'");
    expect(storeSrc).toContain('graftedWires');
  });

  it('the splice signs itself — fresh grafts leave work sign the planter cannot smell', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const spSrc = readFileSync(new URL('../src/entities/setpieces.ts', import.meta.url), 'utf8');
    const baseSrc = readFileSync('src/entities/base.ts', 'utf8');
    // planting pushes a fresh 'work' mark at the graft spot
    expect(gameSrc).toMatch(/plantSnare[\s\S]*kind: 'work'/);
    // and the planter's own key is pre-marked so it doesn't chase its own coil
    expect(baseSrc).toContain('planterKey');
    expect(spSrc).toContain('grafter:${this.spawnRoom}');
    // the splice reads as the under's work at the cut verb, not the house's weld
    expect(gameSrc).toContain('Cut the splice');
  });

  it('the spill scatters the coil — a staggered carrier drops its work unlaid', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const spSrc = readFileSync(new URL('../src/entities/setpieces.ts', import.meta.url), 'utf8');
    const baseSrc = readFileSync('src/entities/base.ts', 'utf8');
    // carried work is losable work — the grafter mirrors the floorkeeper's spill
    expect(baseSrc).toContain('spillSnare');
    expect(spSrc).toContain('override stagger');
    expect(spSrc).toContain('coil slips free');
    // a dropped coil is dead wire: unarmed, unpropped, signed like a kill
    expect(gameSrc).toMatch(/spillSnare[\s\S]*armed: false[\s\S]*kind: 'wire'/);
  });

  it('the dust keeps a hand — fresh work sign reads to the player, their own stays silent', () => {
    const roomSrc = readFileSync(new URL('../src/entities/room.ts', import.meta.url), 'utf8');
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // the fresh-read loop watches for 'work' marks the player didn't make
    expect(roomSrc).toContain('the dust keeps a hand');
    // every player-caused work push comes pre-read under 'player'
    const pushes = gameSrc.match(/kind: 'work', t: this\.clock\.time, readBy: \['player'\]/g) ?? [];
    expect(pushes.length).toBeGreaterThanOrEqual(6);
  });

  it('the coil changes hands — cutting a splice yields wire you can lay yourself', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const configSrc = readFileSync('src/game/config.ts', 'utf8');
    const storeSrc = readFileSync(new URL('../src/game/store.ts', import.meta.url), 'utf8');
    // the coil is a real item, slot-usable like the wind-up alarm
    expect(configSrc).toContain("wireCoil: { name: 'Wire Coil'");
    // a cut splice leaves the floor and rides the pack — no scrap left to strip
    expect(gameSrc).toContain('the splice parts — the coil is yours');
    // your own wire mints reclaim verbs, never ghosts a prop face
    expect(gameSrc).toContain('Pull the wire free');
    expect(gameSrc).toContain('removeSnare');
    // laid wires ride the checkpoint under the same flag that carried grafts
    expect(storeSrc).toContain('planted?: boolean');
    expect(gameSrc).toMatch(/gw\.planted[\s\S]*armed: gw\.armed, planted: true/);
  });

  it('the alarm winds down into your hand — a live lure can be un-planted', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // live lures mint the reclaim verb; a ringing clock is scrap and stops offering
    expect(gameSrc).toContain('Pick the alarm up');
    expect(gameSrc).toContain('mintAlarmDrops');
    // picking it up returns the item whole and frees the floor
    expect(gameSrc).toContain('the alarm winds down into your hand');
    expect(gameSrc).toMatch(/case 'alarmDrop'[\s\S]*giveItem\('windAlarm', 1\)/);
    // rang lures never mint — a sprung clock is spent
    expect(gameSrc).toMatch(/this\.lures\.forEach[\s\S]*if \(l\.rang\) return/);
  });

  it('the coil testifies — carried splice-scrap drags the grafter to your hands', () => {
    const spSrc = readFileSync('src/entities/setpieces.ts', 'utf8');
    const baseSrc = readFileSync('src/entities/base.ts', 'utf8');
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // the under reads its own wire off your back — same room, same 40m scent reach
    expect(spSrc).toContain("playerCarries?.('wireCoil')");
    expect(spSrc).toContain('the hands holding its wire');
    // it drags toward you without learning hunger from a smell that never lands
    expect(spSrc).toMatch(/playerCarries[\s\S]*?this\.target = v3\(p\.pos\.x/);
    // ctx answers it from the pack, not the sign list
    expect(baseSrc).toContain('playerCarries?:');
    expect(gameSrc).toContain('playerCarries: (id) => this.inventory.some');
  });

  it('the seam carries the tick — a door-listen answers your wound clock', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    expect(gameSrc).toContain('a small clock counts down beyond');
    expect(gameSrc).toContain('an alarm rings beyond — the clock you wound');
    // the listen reads the live lures list, lowest precedence — below every tread
    expect(gameSrc).toMatch(/this\.lures\.find\(\(l\) => \{\s*const ri = underRoomOf\(roam, l\.pos\)/);
  });

  it('the fallen coil lies there — spilled and restored wire wear the slack face', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // a spilled splice rebuilds its face like every dead snare keeps
    expect(gameSrc).toMatch(/spillSnare\(pos: Vec3, room: number\)[\s\S]*?snare\.mesh = this\.buildSnareProp/);
    expect(gameSrc).toContain('a coil of wire drops');
    // dead grafts restore wearing it too — no faceless wire anywhere
    expect(gameSrc).toMatch(/gw\.armed === false[\s\S]*?dead\.mesh = this\.buildSnareProp/);
  });

  it('the under sells its own wire — the broker stocks the coil', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // the coil sits in the broker's seeded stock, priced between felt and a pick
    expect(gameSrc).toMatch(/populateBroker[\s\S]*?id: 'wireCoil', price: rng\.int\(/);
    // but the house's own shelf never carries splice scrap — the
    // upstairs twin stocks chocks and picks, not the under's wire
    const clerk = gameSrc.match(/private populateClerk[\s\S]*?const stock[\s\S]*?\];/)?.[0] ?? '';
    expect(clerk).not.toContain('wireCoil');
  });

  it('maintenance is a claim — a re-tied coil stops being yours', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // the warden's re-lay marks your wire claimed: it stays planted for
    // the checkpoint but mints 'Cut the seal' like any house snare and
    // yields no coil (a reload keeps the re-lay — clearing `planted`
    // dropped the wire from the graftedWires list entirely)
    expect(gameSrc).toMatch(/kind === 'wire'[\s\S]*?s\.claimed = true/);
    // the reclaim verbs only belong to wire the house hasn't claimed
    expect(gameSrc).toMatch(/hz\.planted && !hz\.claimed[\s\S]*?'Pull the wire free'/);
    // and the claim rides the checkpoint like the rest of the graft
    const storeSrc = readFileSync('src/game/store.ts', 'utf8');
    expect(storeSrc).toMatch(/graftedWires\?.*claimed\?/);
  });

  it('the wound clock outlives you too — a paid alarm keeps its fuse', () => {
    const storeSrc = readFileSync('src/game/store.ts', 'utf8');
    expect(storeSrc).toContain('armedLures');
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // the save carries each live lure's remaining fuse; the restore
    // re-times it onto the live clock with its clock-mesh rebuilt
    expect(gameSrc).toMatch(/armedLures: this\.lures\.some/);
    expect(gameSrc).toMatch(/cp\?\.armedLures[\s\S]*?this\.lures\.push/);
  });

  it('the dead splice is contested loot — gather it before the grafter does', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // a dead graft mints 'Gather the wire' like your own spent line —
    // the same slack the grafter strips to carry
    expect(gameSrc).toMatch(/!hz\.armed && !hz\.planted && !hz\.grafted/);
    expect(gameSrc).toMatch(/hz\.grafted \? \(hz\.armed \? 'Cut the splice' : 'Gather the wire'\)/);
  });

  it('the wire is a brace you can leave — the leaf binds shut', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const intSrc = readFileSync('src/player/interaction.ts', 'utf8');
    const typeSrc = readFileSync('src/game/types.ts', 'utf8');
    // a closed, unlocked, unheld leaf mints 'Wire Door N shut' while
    // you carry a coil; the bind rides heldBy like the wedge does
    expect(intSrc).toContain('Wire Door');
    expect(typeSrc).toContain("'wired'");
    // the press consumes the coil and signs the work; the snip hands
    // it back; opening reads the bind, not a stranger's grip
    expect(gameSrc).toMatch(/d\.heldBy = 'wired'/);
    expect(gameSrc).toContain('the wire binds it — cut it free first');
    expect(gameSrc).toMatch(/unwireDoor[\s\S]*?giveItem\('wireCoil', 1\)/);
  });

  it('the house works wire free — two contacts, and the coil drops', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const corSrc = readFileSync('src/entities/corridor.ts', 'utf8');
    const storeSrc = readFileSync('src/game/store.ts', 'utf8');
    // the warden doesn't kick wire loose — a bound leaf strains first,
    // parts on the next contact, and the coil lands as gatherable loot
    expect(corSrc).toMatch(/heldBy === 'wired'[\s\S]*?strainWire/);
    expect(gameSrc).toMatch(/strainWire: \(x, z\)/);
    expect(gameSrc).toContain('the wire parts under its hands');
    expect(gameSrc).toMatch(/droppedCoils\.push/);
    expect(storeSrc).toContain('droppedCoils');
    // the drop is pos-keyed — the list shifts on gather, the pos doesn't
    expect(gameSrc).toMatch(/coilDrop[\s\S]*?findIndex[\s\S]*?wireCoil/);
  });

  it('the boards listen for your noise — a named lure pulls half again as far', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // while the sheets name you, planted sounds reach further — the
    // tick, the ring, and the phone bursts all take the same pull
    expect(gameSrc).toContain('wantedPull');
    expect(gameSrc).toMatch(/0\.9 \* wantedPull/);
    expect(gameSrc).toMatch(/1\.6 \* wantedPull/);
    expect(gameSrc).toMatch(/0\.85 \* wantedPull/);
  });

  it('the boards tax the thrown and the rung too — every lure you sound', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // the pull is a shared getter reaching every player-caused
    // lure emit: planted tick/ring/bursts, the tossed pebble and a
    // desk-bell ring you chose to sound
    expect(gameSrc).toMatch(/private get wantedPull/);
    expect(gameSrc).toMatch(/0\.45 \* this\.wantedPull/);
    expect(gameSrc).toMatch(/0\.8 \* this\.wantedPull/);
  });

  it('the wire answers the knocker too — a visit strains, the next parts it', () => {
    const src = readFileSync('src/entities/bellman.ts', 'utf8');
    // the bellman can't kick wire like a wedge: a held visit works the
    // bind once via strainWire, then loses interest — a later visit's
    // work frees the leaf the same way the warden's does
    expect(src).toMatch(/heldBy === 'wired'[\s\S]*?strainWire\?\.\(blocking\.pos\.x, blocking\.pos\.z\)/);
    expect(src).toContain('the bind held');
  });

  it('the gloved hand spends your holds, it does not eat them', () => {
    const src = readFileSync('src/entities/room.ts', 'utf8');
    // sealing a wired leaf works the bind free (coil drops as loot);
    // sealing a chocked one skids it loose like a kick — the Comm's
    // grip answers 'wired' and 'wedge' before it takes 'commissionaire'
    expect(src).toMatch(/heldBy === 'wired'[\s\S]*?strainWire/);
    expect(src).toMatch(/heldBy === 'wedge'[\s\S]*?wedgeKicked/);
  });

  it('a fresh knot counts fresh — rewire drops the house\u2019s work', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // unwire-and-rewire doesn't inherit the strain count from the
    // bind the house already worked on
    expect(gameSrc).toMatch(/case 'wireDoor'[\s\S]*?wireStrains\.delete/);
  });

  it('the seam reads your own bind — holds report, strains warn', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    // a wired leaf answers the listen at the lowest tier: quiet when
    // it holds, warn when the house is mid-strain on it
    expect(gameSrc).toMatch(/door\.heldBy === 'wired'[\s\S]*?wireStrains\.get/);
    expect(gameSrc).toContain('the bind strains');
    expect(gameSrc).toContain('your wire still holds');
  });
});

describe('coaxed drawers (sprint 268)', () => {
  it('the scarred latch tells before it opens', () => {
    const sys = new InteractionSystem();
    sys.addRoomInteractables(roomWith([sock('drawer', { coaxed: true, bare: true, contains: 'bandage' })]));
    const d = sys.interactables.find((i) => i.kind === 'drawer');
    expect(d?.prompt, 'the worked latch reads scarred').toMatch(/scarred/);
    expect(d?.prompt, 'and does not lie about being forced').not.toMatch(/forced/);
  });
});

describe('the leaf is cover (sprint 441)', () => {
  const leaf = (over: Record<string, unknown> = {}) => ({
    id: 'door-4-in', roomIndex: 4, isMainRoute: true, label: '4',
    pos: v3(0, 0, 0), yaw: 0, locked: false, opening: false, openT: 0,
    ...over,
  } as Door);
  const roomsWith = (doors: Door[]) => [{ doors }];
  // yaw 0 → the leaf runs along X (lateral ±0.55), panel z ≈ 0 (±0.06),
  // top at y = 2.2.

  it('a shut leaf blocks the sight line through it', () => {
    const blockers = shutLeafBlockers(roomsWith([leaf()]), v3(-2, 0, 0), v3(2, 0, 0));
    expect(blockers.length).toBe(1);
    expect(hasLineOfSight(v3(-2, 1.6, 0), v3(2, 1.6, 0), blockers)).toBe(false);
  });

  it('open, mid-swing, and false leaves cast no panel', () => {
    for (const over of [{ opening: true }, { openT: 0.8 }, { falseDoor: true }]) {
      expect(shutLeafBlockers(roomsWith([leaf(over)]), v3(-2, 0, 0), v3(2, 0, 0)).length).toBe(0);
    }
  });

  it('a stare around the leaf edge legitimately passes', () => {
    // ray crosses the leaf plane at |lateral| > 0.55 — past its edge
    const blockers = shutLeafBlockers(roomsWith([leaf()]), v3(-2, 0, -0.3), v3(2, 0, 1.5));
    expect(hasLineOfSight(v3(-2, 1.6, -0.3), v3(2, 1.6, 1.5), blockers)).toBe(true);
  });

  it('the panel is a door leaf, not a wall — the eye sees over it', () => {
    const blockers = shutLeafBlockers(roomsWith([leaf()]), v3(-2, 0, 0), v3(2, 0, 0));
    expect(hasLineOfSight(v3(-2, 2.35, 0), v3(2, 2.35, 0), blockers)).toBe(true);
  });

  it('every sight rule sweeps the leaves — one convention', () => {
    const corridor = readFileSync('src/entities/corridor.ts', 'utf8');
    const curator = readFileSync('src/entities/curator.ts', 'utf8');
    const room = readFileSync('src/entities/room.ts', 'utf8');
    const game = readFileSync('src/game/Game.ts', 'utf8');
    // the whistle, the spot, the Comm's throw/chase trackers, the lens
    expect(corridor).toContain('shutLeafBlockers');
    expect(curator).toContain('shutLeafBlockers');
    expect(room).toContain('shutLeafBlockers');
    expect(game).toContain('shutLeafBlockers');
  });
});

describe('the crack under the leaf (sprint 445)', () => {
  it('the stoop is wired into the same closed-leaf gate as the seam', () => {
    const interaction = readFileSync('src/player/interaction.ts', 'utf8');
    const game = readFileSync('src/game/Game.ts', 'utf8');
    expect(interaction).toContain("kind: 'stoop'");
    expect(interaction).toContain('Stoop to the crack');
    expect(game).toContain('stoopUnder(door: Door)');
    expect(game).toContain("case 'stoop'");
  });

  it('the slipped pebble lands on the far side of the leaf (sprint 447)', () => {
    const interaction = readFileSync('src/player/interaction.ts', 'utf8');
    const game = readFileSync('src/game/Game.ts', 'utf8');
    expect(interaction).toContain("kind: 'slip'");
    expect(interaction).toContain('Slip a pebble under');
    expect(game).toContain("case 'slip'");
    // shares the free toss's cooldown and its weak pull — not a new lure
    expect(game).toContain('this.nextToss');
    expect(game).toContain("category: 'distraction'");
  });

  it('the seam speaks — the call lands at the shared leaf itself (sprint 465)', () => {
    const interaction = readFileSync('src/player/interaction.ts', 'utf8');
    const game = readFileSync('src/game/Game.ts', 'utf8');
    expect(interaction).toContain("kind: 'call'");
    expect(interaction).toContain('Call through the crack');
    expect(game).toContain("case 'call'");
    // the voice emits under the far lip — room-gated hearing owns an emit
    // to one room — plus a quieter tell on your side; shares the
    // free-lure channel's breath with the pebble
    expect(game).toContain('fx, y: 0.15, z: fz');
    expect(game).toContain('this.nextToss');
  });

  it('the voice tells + mouths back — a camped leaf answers the whisper (sprints 466-467)', () => {
    const game = readFileSync('src/game/Game.ts', 'utf8');
    const callCase = game.slice(game.indexOf("case 'call'"), game.indexOf("case 'brace'"));
    // sprint 466: a watcher already at the leaf hears the whisper as a
    // sighting — same eyeTell intake the crack's watching eye uses
    expect(callCase).toContain('eyeTell');
    expect(callCase).toContain('threatPos');
    // sprint 467: a far-room watcher in earshot mouths back a breath later
    expect(callCase).toContain('seamAnswer');
    expect(callCase).toContain('withinRouseRadius');
    expect(game).toContain('private seamAnswer');
    expect(game).toContain("category: 'entity-cue'");
  });

  it('the breath at the crack — a camped watcher reads through the ear too (sprint 468)', () => {
    const game = readFileSync('src/game/Game.ts', 'utf8');
    const listen = game.slice(game.indexOf('private listenThrough'), game.indexOf("const sched = target.scheduled[0]"));
    // a live watcher pressed against the leaf outranks the room's
    // other reads — the ear hears your own call's camp before you
    // call twice into it
    expect(listen).toContain('atLeaf');
    expect(game).toContain('it is listening back');
  });
});

describe('the plate is goods (sprints 577-580)', () => {
  it('every loose-goods surface reads the sprung plate', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const baseSrc = readFileSync('src/entities/base.ts', 'utf8');
    const corrSrc = readFileSync('src/entities/corridor.ts', 'utf8');
    const graftSrc = readFileSync('src/entities/setpieces.ts', 'utf8');
    const storeSrc = readFileSync('src/game/store.ts', 'utf8');
    const interactionSrc = readFileSync('src/player/interaction.ts', 'utf8');
    // the pile exists, mints its verb, survives the save
    expect(gameSrc).toContain('droppedSprings');
    expect(gameSrc).toContain('mintSpringDrops');
    expect(storeSrc).toContain('droppedSprings?:');
    // every reader of the spill surface knows the kind
    for (const src of [gameSrc, baseSrc]) {
      expect(src).toContain("| 'spring'");
    }
    expect(baseSrc).toContain('spring?: boolean');
    expect(baseSrc).toContain('spillSprings');
    // the house pockets it like a chock, the under folds it into wire
    expect(corrSrc).toContain('pocketedSprings');
    expect(corrSrc).toContain('spring: true');
    expect(graftSrc).toContain('spring: this.carrying === 0');
    // the player's verbs are registered and dispatched
    for (const kind of ["'baitSpring'", "'springDrop'"]) {
      expect(interactionSrc, `${kind} in InteractKind`).toContain(`| ${kind}`);
      expect(gameSrc, `${kind} press dispatch`).toContain(`case ${kind}`);
    }
    // and the end reads what the floor still holds cocked
    expect(storeSrc).toContain('trapsSet?:');
    expect(gameSrc).toContain('trapsSet: this.setTraps.length');
  });
});

describe('the valve is scrap too (sprints 581-584)', () => {
  it('a bled line yields its throat; refit vents are player work the house leaves alone', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const roomSrc = readFileSync('src/entities/room.ts', 'utf8');
    const storeSrc = readFileSync('src/game/store.ts', 'utf8');
    const interactionSrc = readFileSync('src/player/interaction.ts', 'utf8');
    // the throat is a part: strip yields steamValve, refit spends it
    expect(interactionSrc).toContain("| 'workValve'");
    expect(interactionSrc).toContain("| 'refitValve'");
    expect(gameSrc).toContain("case 'workValve'");
    expect(gameSrc).toContain("case 'refitValve'");
    expect(gameSrc).toContain("giveItem('steamValve'");
    // the strip is the permanent kill — no throat, no re-lay; and
    // player-threaded lines are outside the house's re-lay jurisdiction
    expect(roomSrc).toContain('valved?: boolean');
    expect(roomSrc).toContain("owner?: 'player'");
    const rearm = gameSrc.slice(gameSrc.indexOf("kind === 'line'"), gameSrc.indexOf("kind === 'spring'"));
    expect(rearm).toContain('st.valved !== false');
    expect(rearm).toContain("st.owner !== 'player'");
    // bleeding your own refit signs 'work' by:'player', never 'line'
    const bleed = gameSrc.slice(gameSrc.indexOf("case 'bleed'"), gameSrc.indexOf("case 'scrub'"));
    expect(bleed).toContain("st.owner === 'player'");
    expect(bleed).toContain("by: 'player'");
    // throat + ownership ride deadHazards through the checkpoint
    expect(storeSrc).toContain('valved?: boolean; owner?:');
    expect(gameSrc).toContain('ventsOwned: this.hazard.steams.filter');
  });
});

describe('the house crimps your line (sprints 585-588)', () => {
  it('a work-sign near your live valve gets pinched shut — and yours re-opens free', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const baseSrc = readFileSync('src/entities/base.ts', 'utf8');
    const corridorSrc = readFileSync('src/entities/corridor.ts', 'utf8');
    // the crimp is a real answer, not a re-lay — 'work' joins the
    // investigate kinds and the return names the squeeze
    expect(baseSrc).toContain("'blind' | 'spring' | 'work'");
    expect(baseSrc).toContain("'crimp'");
    expect(corridorSrc).toContain("|| this.investigateKind === 'work'");
    expect(corridorSrc).toContain("restored === 'crimp'");
    // the ctx impl finds a live player-threaded vent and deads it,
    // keeping ownership — your throat, pinched, not unthreaded
    const crimp = gameSrc.slice(gameSrc.indexOf("kind === 'work'"));
    expect(crimp).toContain("st.owner === 'player' && near(st.pos)");
    expect(crimp).toContain('s.dead = true');
    expect(crimp).toContain("return 'crimp'");
    // and the re-open is free on your own throat
    const refit = gameSrc.slice(gameSrc.indexOf("case 'refitValve'"));
    expect(refit).toContain("st.owner === 'player' && st.valved !== false");
    // the seam reads your live line
    expect(gameSrc).toContain("your line breathes past the leaf");
  });
});

describe('the eye watches for you (sprints 589-593)', () => {
  it('an aimed eye locks its pan, reports what crosses, and the house can turn it back', () => {
    const gameSrc = readFileSync('src/game/Game.ts', 'utf8');
    const roomSrc = readFileSync('src/entities/room.ts', 'utf8');
    const baseSrc = readFileSync('src/entities/base.ts', 'utf8');
    const interactionSrc = readFileSync('src/player/interaction.ts', 'utf8');
    // 'Aim the eye' is real — kind registered, minted crouched only
    // (standing = tape; no twin-verb churn), case locks owner+bearing
    expect(interactionSrc).toContain("| 'focusEye'");
    expect(gameSrc).toContain("kind: 'focusEye'");
    expect(gameSrc).toContain("this.player.crouching) this.interaction.add({\n              kind: 'focusEye'");
    expect(gameSrc).toContain("case 'focusEye'");
    expect(gameSrc).toContain('w.aimBearing = Math.atan2');
    expect(gameSrc).toContain("w.owner = 'player'");
    // the pan lock lives in the eye's own facing computation
    expect(roomSrc).toContain('aimBearing?: number');
    expect(roomSrc).toContain('Number.isFinite(w.aimBearing)');
    // the report: your eye marks entities inside its locked cone
    expect(gameSrc).toContain('your eye marks');
    // the house's answer: a 'work' mark by your eye → reclaim, not
    // unthread — the camera was always the house's
    expect(baseSrc).toContain("| 'reclaim' | null");
    const work = gameSrc.slice(gameSrc.indexOf("kind === 'work'"));
    expect(work).toContain("return 'reclaim'");
    // aim+owner ride the checkpoint on eye records
    expect(gameSrc).toContain('aimBearing: w.aimBearing');
    expect(gameSrc).toContain('eyesAimed: this.hazard.watchers.filter');
  });
});

describe('your eye still sees you (sprint 595)', () => {
  it('the honest price: the aimed eye\'s player-settle has no owner exemption', () => {
    const roomSrc = readFileSync('src/entities/room.ts', 'utf8');
    // ownership only steers the pan — the settle accumulation still
    // runs identically for the player: no owner check gates it
    const settleRegion = roomSrc.slice(roomSrc.indexOf('w.settle = wMoving'), roomSrc.indexOf('w.settle = wMoving') + 400);
    expect(settleRegion).not.toContain('owner');
    // and ownership never mutes the eye's own warn/settle cues
    expect(roomSrc).not.toContain("w.owner === 'player' &&");
  });
});

describe('the pan is real (sprints 596-598)', () => {
  it('the beam reads your aim back, and your lock survives the blink', () => {
    const roomSrc = readFileSync('src/entities/room.ts', 'utf8');
    // beam readout: owned eyes answer aimed light with the aim report
    expect(roomSrc).toContain('eyeBeamRead');
    expect(roomSrc).toContain('its stare still holds your bearing');
    // the blink reasserts the lock — dazzle clears to NaN, aimBearing
    // keeps hold (the lock only yields to live light, never resets)
    expect(roomSrc).toContain('!Number.isFinite(w.dazzleBearing)\n        && !Number.isFinite(lampBearing)');
  });
});
