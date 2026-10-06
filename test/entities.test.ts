import { describe, it, expect, vi } from 'vitest';
import { CorridorRunner, Warden } from '../src/entities/corridor';
import { Bellman } from '../src/entities/bellman';
import { Witness, Hollow, Lurker, Margin, Husk, Porter, Groundswell } from '../src/entities/room';
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
    lookDir(out: { x: number; y: number; z: number }) { const cp = Math.cos(self.pitch); out.x = Math.sin(self.yaw) * cp; out.y = Math.sin(self.pitch); out.z = Math.cos(self.yaw) * cp; return out; },
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

describe('Margin misdirection', () => {
  it('emits positional rustles from the mirrored edge while unseen', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const m = new Margin();
    m.spawn(ctx);
    // Margin sits at yaw±1.35 — facing ~cos(1.35)≈0.22 < 0.35, so the
    // unseen (closing) branch drives the rustle timer.
    const ctxMut = ctx as { now: number };
    let t = 0;
    for (let i = 0; i < 80 && m.state !== 'done'; i++) { ctxMut.now = t; m.update(0.05); t += 0.05; }
    const rustles = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'margin-rustle');
    expect(rustles.length).toBeGreaterThanOrEqual(2);
    // Each rustle is positional (a real Vec3), not the entity's null cue.
    for (const r of rustles) expect(r[1]).not.toBeNull();
    m.dispose();
  });
});

describe('Husk presence', () => {
  it('ducks the room tone when it stirs', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, duckTone: vi.fn() });
    const h = new Husk();
    h.spawn(ctx);
    // Crowd it: proximity anger crosses the stir threshold in ~0.3s.
    const tp = h.threatPos();
    if (tp) { ctx.player.pos.x = tp.x; ctx.player.pos.z = tp.z; }
    const ctxMut = ctx as { now: number };
    let t = 0;
    for (let i = 0; i < 20; i++) { ctxMut.now = t; h.update(0.05); t += 0.05; }
    expect((ctx.duckTone as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
    h.dispose();
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

describe('Bellman (sprint 232)', () => {
  const step = (b: Bellman, ctx: EntityCtx, seconds: number, at = 0) => {
    const ctxMut = ctx as { now: number };
    let t = at;
    const frames = Math.ceil(seconds / 0.05);
    for (let i = 0; i < frames; i++) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    return t;
  };

  it('spawns at the entry door and knocks it open a beat later', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: [] });
    const b = new Bellman();
    b.spawn(ctx);
    step(b, ctx, 3);
    const door = rooms[20].doors[0];
    expect(door.opening).toBe(true);
    const names = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(names).toContain('door-rattle');
    b.dispose();
  });

  it('follows the trail and kills an exposed lingerer', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0].pos;
    // Crumbs from the entry door to the room centre where the player stands.
    const px = room.origin.x, pz = room.origin.z;
    const trail = Array.from({ length: 9 }, (_, i) =>
      v3(entry.x + ((px - entry.x) * i) / 8, 0, entry.z + ((pz - entry.z) * i) / 8));
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: trail });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(px, 0, pz);
    player.yaw = Math.atan2(entry.x - px, entry.z - pz); // facing the door —
    // but the gaze frees only while watched long: it crosses ~7m in ~4s,
    // inside kill reach before watch accumulates. Kill still fires first
    // because exposure is checked before the trail step.
    player.yaw = Math.PI + player.yaw; // face AWAY to isolate the kill path
    const b = new Bellman();
    b.spawn(ctx);
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (b.state !== 'done' && steps++ < 3000) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    expect((ctx.killPlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    b.dispose();
  });

  it('yields to sustained direct gaze without ever reaching you', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0].pos;
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: [] });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(room.origin.x, 0, room.origin.z);
    player.yaw = Math.atan2(entry.x - room.origin.x, entry.z - room.origin.z); // face it
    const b = new Bellman();
    b.spawn(ctx);
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (b.state !== 'done' && steps++ < 3000) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /folds back/.test(c))).toBe(true);
    expect((ctx.killPlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    b.dispose();
  });

  it('starves out when the trail goes cold', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: [] });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(rooms[20].origin.x + 20, 0, rooms[20].origin.z); // well away, unseen
    player.yaw = Math.PI;
    const b = new Bellman();
    b.spawn(ctx);
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (b.state !== 'done' && steps++ < 3000) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /falls away/.test(c))).toBe(true);
    expect((ctx.killPlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    b.dispose();
  });
});

describe('Porter (sprint 233)', () => {
  const step = (p: Porter, ctx: EntityCtx, seconds: number, at = 0) => {
    const ctxMut = ctx as { now: number };
    let t = at;
    for (let i = 0; i < Math.ceil(seconds / 0.05); i++) { ctxMut.now = t; p.update(0.05); t += 0.05; }
    return t;
  };

  it('drops on a player who lingers under the lintel unlooked', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const porter = new Porter();
    porter.spawn(ctx);
    // Stand under the exit door's header, gazing level — never look up.
    const door = rooms[21].doors.find((d) => d.id.endsWith('-in'))!;
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; pitch: number };
    player.pos = v3(door.pos.x, 0, door.pos.z);
    player.pitch = 0;
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (porter.state !== 'done' && steps++ < 1000) { ctxMut.now = t; porter.update(0.05); t += 0.05; }
    const dmg = (ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls;
    expect(dmg.length).toBeGreaterThan(0);
    expect(dmg[0][1]).toBe('porter');
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /drops — from above/.test(c))).toBe(true);
    porter.dispose();
  });

  it('withdraws when the player pitches the gaze up and holds it', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const porter = new Porter();
    porter.spawn(ctx);
    const door = rooms[21].doors.find((d) => d.id.endsWith('-in'))!;
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number; pitch: number };
    // Stand 3.5m back from the door, gaze up at the header.
    player.pos = v3(door.pos.x, 0, door.pos.z - 3.5);
    const hdr = { x: door.pos.x, y: 2.3, z: door.pos.z };
    const dx = hdr.x - player.pos.x, dz = hdr.z - player.pos.z;
    const dh = Math.hypot(dx, dz);
    player.yaw = Math.atan2(dx, dz);
    player.pitch = Math.atan2(hdr.y - 1.62, dh);
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (porter.state !== 'done' && steps++ < 1000) { ctxMut.now = t; porter.update(0.05); t += 0.05; }
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /withdraws above the frame/.test(c))).toBe(true);
    expect((ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    porter.dispose();
  });

  it('sifts dust tells while it waits, without dropping early', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const porter = new Porter();
    porter.spawn(ctx);
    const door = rooms[21].doors.find((d) => d.id.endsWith('-in'))!;
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number } };
    player.pos = v3(door.pos.x, 0, door.pos.z - 6); // in the room, out of the drop arc
    step(porter, ctx, 12);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /dust sifts down/.test(c))).toBe(true);
    expect((ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect(porter.state).toBe('engage');
    porter.dispose();
  });
});

describe('Warden (sprint 234)', () => {
  const step = (w: Warden, ctx: EntityCtx, seconds: number, at = 0) => {
    const ctxMut = ctx as { now: number };
    let t = at;
    for (let i = 0; i < Math.ceil(seconds / 0.05); i++) { ctxMut.now = t; w.update(0.05); t += 0.05; }
    return t;
  };

  it('paces the corridor spine between its doors', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const warden = new Warden();
    warden.spawn(ctx);
    const room = rooms[28];
    const span = Math.hypot(room.exitPos.x - room.entryPos.x, room.exitPos.z - room.entryPos.z);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | object };
    // Player hides in a cabinet far away — the patrol never sees them.
    player.pos = v3(room.entryPos.x - 3, 0, room.entryPos.z - 3);
    player.hiddenSpot = { id: 'cab' } as object;
    const p0 = (warden as unknown as { pos: { x: number; z: number } }).pos;
    const start = { x: p0.x, z: p0.z };
    step(warden, ctx, 10);
    const p1 = (warden as unknown as { pos: { x: number; z: number } }).pos;
    const moved = Math.hypot(p1.x - start.x, p1.z - start.z);
    expect(moved).toBeGreaterThan(1);
    expect(span).toBeGreaterThan(2);
    expect(warden.state).toBe('engage');
    expect((ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    warden.dispose();
  });

  it('whistles and charges a player caught in the open', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const warden = new Warden();
    warden.spawn(ctx);
    // Stand 2m in front of the patrol line, in the open, in view.
    const p0 = (warden as unknown as { pos: { x: number; z: number } }).pos;
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number } };
    player.pos = v3(p0.x, 0, p0.z - 2);
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (steps++ < 1200 && (ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
      ctxMut.now = t; warden.update(0.05); t += 0.05;
    }
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /whistle — the Warden has you/.test(c))).toBe(true);
    const dmg = (ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls;
    expect(dmg.length).toBeGreaterThan(0);
    expect(dmg[0][1]).toBe('warden');
    warden.dispose();
  });

  it('loses the scent when line of sight breaks', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const warden = new Warden();
    warden.spawn(ctx);
    const p0 = (warden as unknown as { pos: { x: number; z: number } }).pos;
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | { id: string } };
    player.pos = v3(p0.x, 0, p0.z - 2);
    // Get spotted, then dive into a cabinet — the whistle gives up.
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (steps++ < 200 && !(warden as unknown as { charging: boolean }).charging) {
      ctxMut.now = t; warden.update(0.05); t += 0.05;
    }
    expect((warden as unknown as { charging: boolean }).charging).toBe(true);
    player.hiddenSpot = { id: 'cab' };
    player.pos = v3(p0.x, 0, p0.z - 20); // out of sight, in a spot
    t = step(warden, ctx, 6, t);
    expect((warden as unknown as { charging: boolean }).charging).toBe(false);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /whistle dies/.test(c))).toBe(true);
    expect((ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    warden.dispose();
  });
});

describe('Groundswell (sprint 235)', () => {
  const step = (e: Groundswell, ctx: EntityCtx, seconds: number, at = 0) => {
    const ctxMut = ctx as { now: number };
    let t = at;
    for (let i = 0; i < Math.ceil(seconds / 0.05); i++) { ctxMut.now = t; e.update(0.05); t += 0.05; }
    return t;
  };

  it('heaves a player standing in the wave path', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const gs = new Groundswell();
    gs.spawn(ctx);
    const room = rooms[28];
    // Stand mid-room on the wave's travel line.
    const mid = { x: (room.entryPos.x + room.exitPos.x) / 2, z: (room.entryPos.z + room.exitPos.z) / 2 };
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; rootedUntil: number };
    player.pos = v3(mid.x, 0, mid.z);
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (steps++ < 1000 && (ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
      ctxMut.now = t; gs.update(0.05); t += 0.05;
    }
    const dmg = (ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls;
    expect(dmg.length).toBeGreaterThan(0);
    expect(dmg[0][1]).toBe('groundswell');
    expect(player.rootedUntil).toBeGreaterThan(0);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /boards heave under you/.test(c))).toBe(true);
    gs.dispose();
  });

  it('leaves the wall strips calm', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const gs = new Groundswell();
    gs.spawn(ctx);
    const room = rooms[28];
    const ax = room.exitPos.x - room.entryPos.x, az = room.exitPos.z - room.entryPos.z;
    const len = Math.hypot(ax, az);
    const nx = ax / len, nz = az / len;
    const px = -nz, pz = nx; // lateral
    const crossHalf = Math.min(room.spec?.width ?? 10, room.spec?.depth ?? 10) / 2;
    // Hug the wall — inside the calm strip the wave can't reach.
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number } };
    player.pos = v3(room.origin.x + px * (crossHalf - 0.4), 0, room.origin.z + pz * (crossHalf - 0.4));
    step(gs, ctx, 30);
    expect((ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect(gs.state).toBe('engage');
    gs.dispose();
  });

  it('settles after its waves pass', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const gs = new Groundswell();
    gs.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number } };
    player.pos = v3(0, 0, -999); // out of the room — never in the band
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (gs.state !== 'done' && steps++ < 1200) { ctxMut.now = t; gs.update(0.05); t += 0.05; }
    expect(gs.state).toBe('done');
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /floor settles/.test(c))).toBe(true);
    gs.dispose();
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
