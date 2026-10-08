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
import { v3 } from '../src/engine/math';
import type { RoomInstance, Socket } from '../src/game/types';

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
