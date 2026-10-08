import { describe, it, expect, vi } from 'vitest';
import { Reposter, type ReposterHooks } from '../src/entities/reposter';
import { generateRoute } from '../src/world/generator';
import { v3 } from '../src/engine/math';
import { pointInRoom } from '../src/engine/doorGeo';
import { noiseCanRouse } from '../src/engine/noiseRouse';
import type { RoomInstance } from '../src/game/types';

function underRooms(): RoomInstance[] {
  return generateRoute({ seedText: 'sim-seed-01', difficulty: 'standard', includeUnderscript: true }).underRooms;
}

function hooks() {
  const cues: string[] = [];
  const reposted: { roomIdx: number; x: number; z: number }[] = [];
  const emits: import('../src/engine/events').SoundEvent[] = [];
  const h: ReposterHooks = {
    addMesh: vi.fn(),
    removeMesh: vi.fn(),
    cue: vi.fn((_n, _a, caption: string) => { cues.push(caption); }),
    repost: vi.fn((roomIdx: number, host: { x: number; z: number }) => {
      reposted.push({ roomIdx, x: host.x, z: host.z });
    }),
    emit: vi.fn((e: import('../src/engine/events').SoundEvent) => { emits.push(e); }),
  };
  return { h, cues, reposted, emits };
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

  it('he knows whose name he carries — a named face stills the walk and cries it (sprint 364)', () => {
    const rooms = underRooms();
    const { h, cues, emits } = hooks();
    h.wanted = () => true;
    const r = new Reposter();
    const hosts = [
      { roomIdx: 30, x: rooms[30].origin.x, z: rooms[30].origin.z },
      { roomIdx: 33, x: rooms[33].origin.x, z: rooms[33].origin.z },
    ];
    r.dispatch(rooms, hosts, h);
    // stand on him: his start is the deep end, one metre off
    const myIdx = rooms.findIndex((rm) => rm.spec && pointInRoom(rm, r.position.x, r.position.z));
    expect(myIdx).toBeGreaterThanOrEqual(0);
    const me = { pos: v3(r.position.x + 1, 0, r.position.z), room: rooms[myIdx].index };
    const travelBefore = (r as unknown as { travel: number }).travel;
    for (let i = 0; i < 30 && !cues.some((t) => /sees whose name/.test(t)); i++)
      r.update(0.1, rooms, me, h);
    expect(cues.some((t) => /sees whose name/.test(t)), 'he cries the named face').toBe(true);
    expect(emits.length, 'the cry is a real sound the under rouses to').toBe(1);
    // 'entity-cue' is excluded from ROUSE_CATEGORIES (anti-cascade) — the
    // cry must be a category listeners actually rouse to.
    expect(noiseCanRouse(emits[0]), 'the shout rouses the under').toBe(true);
    // the look holds the walk — no travel while he names you
    expect((r as unknown as { travel: number }).travel).toBeLessThanOrEqual(travelBefore + 0.01);
    // hidden is furniture — no cry (and wanted off is a stranger)
    const h2 = hooks().h;
    h2.wanted = () => false;
    const r2 = new Reposter();
    r2.dispatch(rooms, hosts, h2);
    const me2 = { pos: v3(r2.position.x + 1, 0, r2.position.z), room: rooms[myIdx].index };
    for (let i = 0; i < 40; i++) r2.update(0.1, rooms, me2, h2);
    expect(emits.length).toBe(1); // still one — the stranger draws no cry
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
