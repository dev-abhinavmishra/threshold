import { describe, it, expect, vi } from 'vitest';
import { CrewChecker, roomOf, type CheckerHooks } from '../src/entities/crewChecker';
import { generateRoute } from '../src/world/generator';
import { v3 } from '../src/engine/math';
import type { SoundEvent } from '../src/engine/events';
import type { RoomInstance } from '../src/game/types';

function underRooms(): RoomInstance[] {
  return generateRoute({ seedText: 'sim-seed-01', difficulty: 'standard', includeUnderscript: true }).underRooms;
}

function hooks() {
  const emitted: SoundEvent[] = [];
  const cues: string[] = [];
  const witnessed = vi.fn();
  const seized = vi.fn(() => true);
  const h: CheckerHooks = {
    addMesh: vi.fn(),
    removeMesh: vi.fn(),
    cue: vi.fn((_n, _a, caption: string) => { cues.push(caption); }),
    emit: vi.fn((e: SoundEvent) => { emitted.push(e); }),
    witnessed,
    seizeMarked: seized,
  };
  return { h, emitted, cues, witnessed, seized };
}

function step(c: CrewChecker, rooms: RoomInstance[], h: CheckerHooks, seconds: number, player = { pos: v3(9e9, 0, 9e9), room: -1, exposed: false }) {
  for (let t = 0; t < seconds; t += 0.1) c.update(0.1, rooms, player, h);
}

describe('CrewChecker (the count answered)', () => {
  it('walks to the rung socket and cries the find to the room when it catches an exposed lingerer', () => {
    const rooms = underRooms();
    const { h, emitted, witnessed, seized } = hooks();
    const c = new CrewChecker();
    const ri = 30;
    const socket = { x: rooms[ri].origin.x, z: rooms[ri].origin.z };
    expect(c.dispatch(rooms, [socket], h)).toBe(true);
    expect(c.stage).toBe('inbound');
    const player = { pos: v3(socket.x, 0, socket.z), room: ri, exposed: true };
    // inbound: walk until the sweep starts
    for (let t = 0; t < 120 && c.stage === 'inbound'; t += 0.1) c.update(0.1, rooms, player, h);
    expect(c.stage).toBe('sweep');
    // the lamp takes ~1.4s of exposed linger to find you
    for (let t = 0; t < 6 && emitted.length === 0; t += 0.1) c.update(0.1, rooms, player, h);
    const found = emitted.find((e) => /count stands/.test(e.caption));
    expect(found).toBeTruthy();
    expect(found!.x).toBeCloseTo(socket.x, 1);
    expect(found!.z).toBeCloseTo(socket.z, 1);
    expect(found!.intensity).toBeGreaterThanOrEqual(0.55); // over the rouse threshold
    // the find enters the house book — a witness line, once per dispatch
    expect(witnessed).toHaveBeenCalledTimes(1);
    // and the lamp reads the marks on your back — the count receipts
    // your take into its locker on the same find (sprint 378)
    expect(seized).toHaveBeenCalledTimes(1);
    // then it finishes its count and walks out
    step(c, rooms, h, 30, player);
    expect(c.stage).toBe('outbound');
    step(c, rooms, h, 200);
    expect(c.stage).toBe('idle');
    expect(h.removeMesh).toHaveBeenCalled();
  });

  it('the lamp reads the walk too — an exposed room it only passes through finds you inbound', () => {
    const rooms = underRooms();
    const { h, emitted, witnessed } = hooks();
    const c = new CrewChecker();
    // dispatch to a mid-route till; stand exposed in the deepest room the
    // walk crosses — the lamp should see you long before its socket.
    const socket = { x: rooms[30].origin.x, z: rooms[30].origin.z };
    c.dispatch(rooms, [socket], h);
    const ri = 34; // inside the walk's hi window (30+6), crossed long before the till
    const player = { pos: v3(rooms[ri].origin.x, 0, rooms[ri].origin.z), room: ri, exposed: true };
    for (let t = 0; t < 60 && emitted.length === 0 && c.stage !== 'idle'; t += 0.1) c.update(0.1, rooms, player, h);
    const found = emitted.find((e) => /count stands/.test(e.caption));
    expect(found).toBeTruthy();
    expect(c.stage).not.toBe('sweep'); // the find landed on the walk, not the till
    expect(witnessed).toHaveBeenCalledTimes(1);
  });

  it('a vacated room sweeps clean — no find, and it moves on', () => {
    const rooms = underRooms();
    const { h, emitted, cues } = hooks();
    const c = new CrewChecker();
    const ri = 30;
    const socket = { x: rooms[ri].origin.x, z: rooms[ri].origin.z };
    c.dispatch(rooms, [socket], h);
    step(c, rooms, h, 300);
    expect(c.stage).toBe('idle');
    expect(emitted).toHaveLength(0);
    expect(cues.some((t) => /counts the till and moves on/.test(t))).toBe(true);
  });

  it('the books mark the tills together — two queued reports get one walker with two stops', () => {
    const rooms = underRooms();
    const { h, cues, witnessed } = hooks();
    const c = new CrewChecker();
    const s30 = { x: rooms[30].origin.x, z: rooms[30].origin.z };
    const s33 = { x: rooms[33].origin.x, z: rooms[33].origin.z };
    expect(c.dispatch(rooms, [s30, s33], h)).toBe(true);
    expect(cues.some((t) => /more than one till/.test(t))).toBe(true);
    // it sweeps BOTH sockets: count 'sweep' entries across the whole walk
    let sweeps = 0, prev = c.stage;
    for (let t = 0; t < 400 && c.stage !== 'idle'; t += 0.1) {
      c.update(0.1, rooms, { pos: v3(9e9, 0, 9e9), room: -1, exposed: false }, h);
      if (c.stage === 'sweep' && prev !== 'sweep') sweeps++;
      prev = c.stage;
    }
    expect(c.stage).toBe('idle');
    expect(sweeps).toBe(2);
    expect(cues.some((t) => /walk continues/.test(t))).toBe(true);
    expect(witnessed).not.toHaveBeenCalled(); // nobody home at either till
  });

  it('the books send one walker at a time', () => {
    const rooms = underRooms();
    const { h } = hooks();
    const c = new CrewChecker();
    const socket = { x: rooms[30].origin.x, z: rooms[30].origin.z };
    expect(c.dispatch(rooms, [socket], h)).toBe(true);
    expect(c.dispatch(rooms, [socket], h)).toBe(false);
    step(c, rooms, h, 300);
    expect(c.dispatch(rooms, [socket], h)).toBe(true); // free again after it leaves
  });

  it('roomOf resolves socket positions to their under room', () => {
    const rooms = underRooms();
    expect(roomOf(rooms, rooms[30].origin)).toBe(30);
    expect(roomOf(rooms, { x: 9e9, z: 9e9 })).toBe(-1);
  });

  it('the lamp counts the floor too — loose spill in the swept room joins the tag (s484)', () => {
    const rooms = underRooms();
    const { h, cues } = hooks();
    const seizeFloor = vi.fn(() => ({ pouch: 3, coils: 1 }));
    h.seizeFloor = seizeFloor;
    const c = new CrewChecker();
    const ri = 30;
    const socket = { x: rooms[ri].origin.x, z: rooms[ri].origin.z };
    c.dispatch(rooms, [socket], h);
    for (let t = 0; t < 120 && c.stage === 'inbound'; t += 0.1)
      c.update(0.1, rooms, { pos: v3(9e9, 0, 9e9), room: -1, exposed: false }, h);
    expect(c.stage).toBe('sweep');
    // the floor read fires once, when the sweep lands at the till room
    expect(seizeFloor).toHaveBeenCalledTimes(1);
    expect(seizeFloor).toHaveBeenCalledWith(ri);
    expect(cues.some((t) => /counts the floor too/.test(t))).toBe(true);
  });

  it('a stripped lamp cannot read the floor — a blind sweep leaves the spill (s484)', () => {
    const rooms = underRooms();
    const { h } = hooks();
    const seizeFloor = vi.fn(() => ({ pouch: 3, coils: 0 }));
    h.seizeFloor = seizeFloor;
    const c = new CrewChecker();
    const socket = { x: rooms[30].origin.x, z: rooms[30].origin.z };
    c.dispatch(rooms, [socket], h);
    c.stripLamp(h);
    step(c, rooms, h, 300);
    expect(c.stage).toBe('idle');
    expect(seizeFloor, 'no lamp, no floor count').not.toHaveBeenCalled();
  });
});

describe('CrewChecker — strip the lamp', () => {
  it('a stripped lamp sweeps blind and cries the theft on the spot', () => {
    const rooms = underRooms();
    const { h, emitted, cues, witnessed } = hooks();
    const c = new CrewChecker();
    const ri = 30;
    const socket = { x: rooms[ri].origin.x, z: rooms[ri].origin.z };
    c.dispatch(rooms, [socket], h);
    // steal its light mid-walk — it feels it go
    const charge = c.stripLamp(h);
    expect(charge).toBe(45);
    expect(c.lampLit).toBe(false);
    const cried = emitted.find((e) => /dies in your hands/.test(e.caption));
    expect(cried).toBeTruthy();
    expect(cried!.intensity).toBeGreaterThanOrEqual(0.55); // over the rouse threshold
    expect(c.stripLamp(h)).toBe(0); // nothing left to strip
    // blind sweep: an exposed lingerer stands in the open and is NOT found
    const player = { pos: v3(socket.x, 0, socket.z), room: ri, exposed: true };
    step(c, rooms, h, 300, player);
    expect(c.stage).toBe('idle');
    expect(emitted.filter((e) => /count stands/.test(e.caption))).toHaveLength(0);
    expect(witnessed, 'a blind lamp holds no face — no witness line').not.toHaveBeenCalled();
    expect(cues.some((t) => /counts blind/.test(t))).toBe(true);
  });

  it('the lamp re-lights when the books send the next walker', () => {
    const rooms = underRooms();
    const { h } = hooks();
    const c = new CrewChecker();
    const socket = { x: rooms[30].origin.x, z: rooms[30].origin.z };
    c.dispatch(rooms, [socket], h);
    c.stripLamp(h);
    step(c, rooms, h, 300);
    c.dispatch(rooms, [socket], h);
    expect(c.lampLit).toBe(true); // the crew wires another one
  });
});
