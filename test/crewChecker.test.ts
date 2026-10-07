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
  const h: CheckerHooks = {
    addMesh: vi.fn(),
    removeMesh: vi.fn(),
    cue: vi.fn((_n, _a, caption: string) => { cues.push(caption); }),
    emit: vi.fn((e: SoundEvent) => { emitted.push(e); }),
  };
  return { h, emitted, cues };
}

function step(c: CrewChecker, rooms: RoomInstance[], h: CheckerHooks, seconds: number, player = { pos: v3(9e9, 0, 9e9), room: -1, exposed: false }) {
  for (let t = 0; t < seconds; t += 0.1) c.update(0.1, rooms, player, h);
}

describe('CrewChecker (the count answered)', () => {
  it('walks to the rung socket and cries the find to the room when it catches an exposed lingerer', () => {
    const rooms = underRooms();
    const { h, emitted } = hooks();
    const c = new CrewChecker();
    const ri = 30;
    const socket = { x: rooms[ri].origin.x, z: rooms[ri].origin.z };
    expect(c.dispatch(rooms, socket, h)).toBe(true);
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
    // then it finishes its count and walks out
    step(c, rooms, h, 30, player);
    expect(c.stage).toBe('outbound');
    step(c, rooms, h, 200);
    expect(c.stage).toBe('idle');
    expect(h.removeMesh).toHaveBeenCalled();
  });

  it('a vacated room sweeps clean — no find, and it moves on', () => {
    const rooms = underRooms();
    const { h, emitted, cues } = hooks();
    const c = new CrewChecker();
    const ri = 30;
    const socket = { x: rooms[ri].origin.x, z: rooms[ri].origin.z };
    c.dispatch(rooms, socket, h);
    step(c, rooms, h, 300);
    expect(c.stage).toBe('idle');
    expect(emitted).toHaveLength(0);
    expect(cues.some((t) => /counts the till and moves on/.test(t))).toBe(true);
  });

  it('the books send one walker at a time', () => {
    const rooms = underRooms();
    const { h } = hooks();
    const c = new CrewChecker();
    const socket = { x: rooms[30].origin.x, z: rooms[30].origin.z };
    expect(c.dispatch(rooms, socket, h)).toBe(true);
    expect(c.dispatch(rooms, socket, h)).toBe(false);
    step(c, rooms, h, 300);
    expect(c.dispatch(rooms, socket, h)).toBe(true); // free again after it leaves
  });

  it('roomOf resolves socket positions to their under room', () => {
    const rooms = underRooms();
    expect(roomOf(rooms, rooms[30].origin)).toBe(30);
    expect(roomOf(rooms, { x: 9e9, z: 9e9 })).toBe(-1);
  });
});

describe('CrewChecker — strip the lamp', () => {
  it('a stripped lamp sweeps blind and cries the theft on the spot', () => {
    const rooms = underRooms();
    const { h, emitted, cues } = hooks();
    const c = new CrewChecker();
    const ri = 30;
    const socket = { x: rooms[ri].origin.x, z: rooms[ri].origin.z };
    c.dispatch(rooms, socket, h);
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
    expect(cues.some((t) => /counts blind/.test(t))).toBe(true);
  });

  it('the lamp re-lights when the books send the next walker', () => {
    const rooms = underRooms();
    const { h } = hooks();
    const c = new CrewChecker();
    const socket = { x: rooms[30].origin.x, z: rooms[30].origin.z };
    c.dispatch(rooms, socket, h);
    c.stripLamp(h);
    step(c, rooms, h, 300);
    c.dispatch(rooms, socket, h);
    expect(c.lampLit).toBe(true); // the crew wires another one
  });
});
