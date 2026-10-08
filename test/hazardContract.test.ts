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
