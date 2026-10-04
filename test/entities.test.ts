import { describe, it, expect, vi } from 'vitest';
import { CorridorRunner } from '../src/entities/corridor';
import { Witness, Hollow, Lurker } from '../src/entities/room';
import { generateRoute } from '../src/world/generator';
import { SeedStreams } from '../src/engine/rng';
import { v3 } from '../src/engine/math';
import type { EntityCtx } from '../src/entities/base';
import type { RoomInstance } from '../src/game/types';

function fakePlayer() {
  const self = {
    pos: v3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    hiddenSpot: null as null | { kind: string },
    protection: 'exposed',
    crouching: false,
    sprinting: false,
    lampOn: true,
    vel: v3(0, 0, 0),
    stamina: 1,
    panic: 0,
    health: 100,
    inputs: { interactHeld: false, lampToggle: false },
    eyePos(out: { x: number; y: number; z: number }) { out.x = self.pos.x; out.y = self.pos.y + 1.62; out.z = self.pos.z; return out; },
    lookDir(out: { x: number; y: number; z: number }) { out.x = Math.sin(self.yaw); out.y = 0; out.z = Math.cos(self.yaw); return out; },
  };
  return self;
}

function makeCtx(rooms: RoomInstance[], overrides: Partial<EntityCtx> = {}): EntityCtx {
  const player = fakePlayer();
  return {
    player: player as unknown as EntityCtx['player'],
    rooms,
    currentRoomIndex: 10,
    sound: { emit: vi.fn(), on: vi.fn(() => () => {}), intensityAt: vi.fn(() => 0) } as unknown as EntityCtx['sound'],
    streams: new SeedStreams('test-seed'),
    now: 0,
    seed: 12345,
    cue: vi.fn(),
    damagePlayer: vi.fn(),
    killPlayer: vi.fn(),
    addEntityMesh: vi.fn(),
    removeEntityMesh: vi.fn(),
    flickerRoom: vi.fn(),
    spawnAt: vi.fn((i: number) => v3(rooms[i]?.origin.x ?? 0, 0, rooms[i]?.origin.z ?? 0)),
    difficulty: 'standard',
    accessibility: { reducedMotion: false, captions: true, minigameAssist: 0 },
    gameState: () => 'PLAYING',
    ...overrides,
  } as EntityCtx;
}

function routeRooms() {
  return generateRoute({ seedText: 'sim-seed-01', difficulty: 'standard', includeUnderscript: false }).rooms;
}

describe('CorridorRunner (sweep/reprise)', () => {
  it('warns before engaging and completes a pass', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const sw = new CorridorRunner('sweep');
    sw.spawn(ctx);
    // warning phase first
    let t = 0;
    const dt = 0.05;
    const ctxMut = ctx as { now: number };
    // run sim
    let steps = 0;
    while (sw.state !== 'done' && steps++ < 2000) {
      ctxMut.now = t;
      sw.update(dt);
      t += dt;
    }
    expect(sw.state === 'done').toBe(true);
    expect((ctx.cue as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    expect((ctx.flickerRoom as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    sw.dispose();
  });

  it('reprise runs multiple passes', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const rp = new CorridorRunner('reprise', { passes: 3 });
    rp.spawn(ctx);
    let t = 0; let steps = 0;
    const ctxMut = ctx as { now: number };
    while (rp.state !== 'done' && steps++ < 4000) { ctxMut.now = t; rp.update(0.05); t += 0.05; }
    expect(rp.state === 'done').toBe(true);
    rp.dispose();
  });

  it('kills a player caught exposed in the corridor', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    // player stands in the corridor path with no cover
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number } };
    const mid = rooms[20].origin;
    player.pos = v3(mid.x, 0, mid.z);
    const sw = new CorridorRunner('sweep');
    sw.spawn(ctx);
    let t = 0; let steps = 0;
    const ctxMut = ctx as { now: number };
    while (sw.state !== 'done' && steps++ < 2000) { ctxMut.now = t; sw.update(0.05); t += 0.05; }
    const killed = (ctx.killPlayer as ReturnType<typeof vi.fn>).mock.calls.length
      + (ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(killed).toBeGreaterThan(0);
    sw.dispose();
  });
});

describe('corridor telegraph + near-miss', () => {
  it('warn front is audible: floor-creaks crawling, door shiver on arrival', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const sw = new CorridorRunner('sweep');
    sw.spawn(ctx);
    let t = 0; let steps = 0;
    const ctxMut = ctx as { now: number };
    while (sw.state === 'warn' && steps++ < 400) { ctxMut.now = t; sw.update(0.05); t += 0.05; }
    const calls = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(calls.filter((n) => n === 'floor-creak').length).toBeGreaterThan(1);
    const rattles = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'door-rattle');
    expect(rattles.some((c) => /shivers/.test(String(c[2])))).toBe(true);
    sw.dispose();
  });

  it('near-miss fires exactly once per hiding spot', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: { kind: string } | null };
    const mid = rooms[20].origin;
    player.pos = v3(mid.x, 0, mid.z);
    player.hiddenSpot = { kind: 'cabinet' };
    const sw = new CorridorRunner('sweep');
    sw.spawn(ctx);
    let t = 0; let steps = 0;
    const ctxMut = ctx as { now: number };
    while (sw.state !== 'done' && steps++ < 4000) { ctxMut.now = t; sw.update(0.05); t += 0.05; }
    const nearMisses = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => /tests the door|breathing held|stops — listening|saw the door close/.test(String(c[2])),
    );
    expect(nearMisses.length).toBe(1);
    sw.dispose();
  });
});

describe('arrival dim', () => {
  it('lurker dims the room when it arrives', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const l = new Lurker();
    l.spawn(ctx);
    const calls = (ctx.flickerRoom as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c) => c[0] === 20 && c[1] === 'dim')).toBe(true);
    l.dispose();
  });
});

describe('Witness', () => {
  it('spawns, ticks, and disposes without leaking meshes', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 22 });
    const w = new Witness();
    w.spawn(ctx);
    for (let i = 0; i < 600 && w.state !== 'done'; i++) w.update(0.05);
    const adds = (ctx.addEntityMesh as ReturnType<typeof vi.fn>).mock.calls.length;
    w.dispose();
    const removes = (ctx.removeEntityMesh as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(removes).toBe(adds);
  });
});

describe('Hollow trap', () => {
  it('struggle reduces trap hold', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 30 });
    const h = new Hollow();
    h.spawn(ctx);
    for (let i = 0; i < 3; i++) h.struggle();
    expect(h.state).toBe('done');
    h.dispose();
  });
});

describe('determinism', () => {
  it('same seed → identical entity timeline', () => {
    const rooms = routeRooms();
    const run = () => {
      const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
      const sw = new CorridorRunner('sweep');
      sw.spawn(ctx);
      const poses: string[] = [];
      for (let i = 0; i < 200; i++) { sw.update(0.05); poses.push(`${sw.posApprox().x.toFixed(3)},${sw.posApprox().z.toFixed(3)}`); }
      sw.dispose();
      return poses.join('|');
    };
    expect(run()).toBe(run());
  });
});
