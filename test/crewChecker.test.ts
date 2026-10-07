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
