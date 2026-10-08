import { describe, it, expect, vi } from 'vitest';
import { Reposter, type ReposterHooks } from '../src/entities/reposter';
import { generateRoute } from '../src/world/generator';
import { v3 } from '../src/engine/math';
import type { RoomInstance } from '../src/game/types';

function underRooms(): RoomInstance[] {
  return generateRoute({ seedText: 'sim-seed-01', difficulty: 'standard', includeUnderscript: true }).underRooms;
}

function hooks() {
  const cues: string[] = [];
  const reposted: { roomIdx: number; x: number; z: number }[] = [];
  const h: ReposterHooks = {
    addMesh: vi.fn(),
    removeMesh: vi.fn(),
    cue: vi.fn((_n, _a, caption: string) => { cues.push(caption); }),
    repost: vi.fn((roomIdx: number, host: { x: number; z: number }) => {
      reposted.push({ roomIdx, x: host.x, z: host.z });
    }),
  };
  return { h, cues, reposted };
}

function step(r: Reposter, rooms: RoomInstance[], h: ReposterHooks, seconds: number) {
  const player = { pos: v3(9e9, 0, 9e9) };
  for (let t = 0; t < seconds; t += 0.1) r.update(0.1, rooms, player, h);
}

describe('Reposter (the boards won\'t stay bare)', () => {
  it('walks the spine and re-pins every bare board, one pin at a time', () => {
    const rooms = underRooms();
    const { h, cues, reposted } = hooks();
    const r = new Reposter();
    const hosts = [
      { roomIdx: 30, x: rooms[30].origin.x, z: rooms[30].origin.z },
      { roomIdx: 33, x: rooms[33].origin.x, z: rooms[33].origin.z },
    ];
    expect(r.dispatch(rooms, hosts, h)).toBe(true);
    expect(r.stage).toBe('inbound');
    expect(cues.some((t) => /fresh paper/.test(t))).toBe(true);
    step(r, rooms, h, 400);
    expect(r.stage).toBe('idle');
    // both boards got their sheet back, hi → lo (the crew comes from deeper)
    expect(reposted.map((x) => x.roomIdx)).toEqual([33, 30]);
    expect(cues.some((t) => /re-sheeted/.test(t))).toBe(true);
    expect(h.removeMesh).toHaveBeenCalled();
  });

  it('the cut kills the walk — the boards it never reached stay bare', () => {
    const rooms = underRooms();
    const { h, reposted } = hooks();
    const r = new Reposter();
    const hosts = [
      { roomIdx: 30, x: rooms[30].origin.x, z: rooms[30].origin.z },
      { roomIdx: 40, x: rooms[40].origin.x, z: rooms[40].origin.z },
    ];
    r.dispatch(rooms, hosts, h);
    // let the first pin land (hi end), then cut before the last
    for (let t = 0; t < 120 && reposted.length === 0 && r.active; t += 0.1)
      r.update(0.1, rooms, { pos: v3(9e9, 0, 9e9) }, h);
    expect(reposted.length).toBe(1);
    r.cutBy(h);
    expect(r.stage).toBe('idle');
    step(r, rooms, h, 60);
    expect(reposted.length).toBe(1); // the second board stands bare
    // a second dispatch (the clerk reaching again) still works
    expect(r.dispatch(rooms, hosts, h)).toBe(true);
  });

  it('one walk at a time — a second dispatch is refused', () => {
    const rooms = underRooms();
    const { h } = hooks();
    const r = new Reposter();
    const hosts = [{ roomIdx: 30, x: rooms[30].origin.x, z: rooms[30].origin.z }];
    expect(r.dispatch(rooms, hosts, h)).toBe(true);
    expect(r.dispatch(rooms, hosts, h)).toBe(false);
  });
});
