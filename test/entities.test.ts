import { describe, it, expect, vi } from 'vitest';
import { CorridorRunner, Warden } from '../src/entities/corridor';
import { Bellman } from '../src/entities/bellman';
import { Collector } from '../src/entities/collector';
import { Witness, Whisper, Hollow, Lurker, Margin, Husk, Porter, Groundswell, Inspector, Commissionaire } from '../src/entities/room';
import { generateRoute } from '../src/world/generator';
import { SeedStreams } from '../src/engine/rng';
import { v3, hasLineOfSight } from '../src/engine/math';
import { shutLeafBlockers } from '../src/engine/doorGeo';
import type { EntityCtx } from '../src/entities/base';
import type { RoomInstance } from '../src/game/types';

function fakePlayer() {
  const self = {
    pos: v3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    hiddenSpot: null as null | { kind: string },
    dead: false,
    exitHiding(_now: number) { self.hiddenSpot = null; },
    teleport(x: number, _y: number, z: number) { self.pos.x = x; self.pos.y = 0; self.pos.z = z; },
    protection: 'exposed',
    rootedUntil: 0,
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

  it('the knocker boots loose goods — its stride scatters what the floorkeeper pockets (s494)', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0].pos;
    const px = room.origin.x, pz = room.origin.z;
    const trail = Array.from({ length: 9 }, (_, i) =>
      v3(entry.x + ((px - entry.x) * i) / 8, 0, entry.z + ((pz - entry.z) * i) / 8));
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: trail });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(px - 30, 0, pz - 30); player.yaw = 0;
    const scatter = vi.fn(() => true);
    (ctx as { scatterSpill?: typeof scatter }).scatterSpill = scatter;
    const b = new Bellman();
    b.spawn(ctx);
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (b.state !== 'done' && steps++ < 3000) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    expect(scatter, 'its stride asked the floor about loose goods').toHaveBeenCalled();
    b.dispose();
  });

  it('every walker boots it — the sweep scatters the pile it never reads (s503)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number } };
    player.pos = v3(rooms[20].origin.x - 40, 0, rooms[20].origin.z - 40);
    const scatter = vi.fn(() => false);
    (ctx as { scatterSpill?: typeof scatter }).scatterSpill = scatter;
    const sw = new CorridorRunner('sweep');
    sw.spawn(ctx);
    let t = 0; let steps = 0;
    const ctxMut = ctx as { now: number };
    while (sw.state !== 'done' && steps++ < 3000) { ctxMut.now = t; sw.update(0.05); t += 0.05; }
    expect(scatter, 'the pass asked the floor about loose goods').toHaveBeenCalled();
    sw.dispose();
  });

  it('the floorkeeper never boots — its stride reads before it scatters (s503)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | object };
    player.pos = v3(rooms[28].entryPos.x - 30, 0, rooms[28].entryPos.z - 30);
    player.hiddenSpot = { id: 'cab' } as object;
    const scatter = vi.fn(() => false);
    (ctx as { scatterSpill?: typeof scatter }).scatterSpill = scatter;
    const warden = new Warden();
    warden.spawn(ctx);
    let t = 0;
    for (let i = 0; i < 400; i++) t = step(warden, ctx, 0.05, t);
    expect(scatter, 'the reader pockets — it never boots blindly').not.toHaveBeenCalled();
    warden.dispose();
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

  it('a braced door holds it at the threshold until it loses interest', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0];
    entry.heldBy = 'player';   // the player braced the leaf they came through
    const trail = [v3(entry.pos.x, 0, entry.pos.z), v3(room.origin.x, 0, room.origin.z)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: trail });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(rooms[20].origin.x + 20, 0, rooms[20].origin.z); // well away, unseen
    const b = new Bellman();
    b.spawn(ctx);
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (b.state !== 'done' && steps++ < 400) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /tests the bar|strains|palm flat/.test(c))).toBe(true);
    expect(captions.some((c) => /steps fade down the hall/.test(c))).toBe(true);
    expect(entry.opening).toBe(false);  // the brace held — it never swung
    expect((ctx.killPlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    b.dispose();
  });

  it('worries a wedged door loose, then comes through', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0];
    entry.heldBy = 'wedge';   // a chock set under the leaf
    const trail = [v3(entry.pos.x, 0, entry.pos.z), v3(room.origin.x, 0, room.origin.z)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: trail });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(rooms[20].origin.x + 20, 0, rooms[20].origin.z); // well away, unseen
    // sprint 393 — the kick doesn't eat the chock: wedgeKicked reports
    // the boot so the Game drops it as loot on the far side of the leaf
    const kicked = vi.fn();
    ctx.wedgeKicked = kicked;
    const b = new Bellman();
    b.spawn(ctx);
    let t = step(b, ctx, 4);
    expect(entry.opening).toBe(false);   // still held — rattles, no swing
    expect(entry.heldBy).toBe('wedge');
    t = step(b, ctx, 6, t);
    expect(entry.heldBy).toBe(undefined); // the chock gave — kicked loose
    expect(kicked).toHaveBeenCalledTimes(1);
    const [doorPos, fromPos] = kicked.mock.calls[0];
    expect(Math.hypot(doorPos.x - entry.pos.x, doorPos.z - entry.pos.z)).toBeLessThan(0.01);
    // fromPos is the kick side — the bellman stood ~at the leaf when it gave
    const bp = (b as unknown as { pos: { x: number; z: number } }).pos;
    expect(Math.hypot(fromPos.x - bp.x, fromPos.z - bp.z)).toBeLessThan(0.5);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /wedge skids loose/.test(c))).toBe(true);
    step(b, ctx, 3, t);
    expect(entry.opening).toBe(true);    // then it knocks the freed leaf
    b.dispose();
  });

  it('shoulders a LIVE brace — each strain shoves the holder off the leaf (sprint 446)', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0];
    entry.heldBy = 'player';   // the player braced the leaf they came through
    const trail = [v3(entry.pos.x, 0, entry.pos.z), v3(room.origin.x, 0, room.origin.z)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: trail });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    // standing AT the leaf on the near side, bracing it — a live hold
    player.pos = v3(entry.pos.x + 0.8, 0, entry.pos.z + 0.5);
    player.yaw = Math.PI; // face away — isolate the shove path
    const b = new Bellman();
    b.spawn(ctx);
    const d0 = Math.hypot(player.pos.x - entry.pos.x, player.pos.z - entry.pos.z);
    let t = step(b, ctx, 4);
    expect(Math.hypot(player.pos.x - entry.pos.x, player.pos.z - entry.pos.z)).toBeCloseTo(d0, 5);
    t = step(b, ctx, 3, t);   // first strain — one stride back
    const d1 = Math.hypot(player.pos.x - entry.pos.x, player.pos.z - entry.pos.z);
    expect(d1).toBeGreaterThan(d0 + 0.3);
    step(b, ctx, 5, t);       // second strain — past the 1.7m keep radius
    const d2 = Math.hypot(player.pos.x - entry.pos.x, player.pos.z - entry.pos.z);
    expect(d2).toBeGreaterThan(1.7);  // the brace's own rule would release now
    // and the leaf bows under the shoulder — openT past 0.05 trips the
    // Game's own brace-release even where the room gives no room to be
    // pushed into (real-geometry fix: the shove bows the leaf, not just
    // the holder)
    expect(entry.openT ?? 0).toBeGreaterThan(0.05);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /shoulders the leaf/.test(c))).toBe(true);
    b.dispose();
  });

  it('a stale held mark with the player away still ends in lost interest (sprint 446)', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0];
    entry.heldBy = 'player';
    const trail = [v3(entry.pos.x, 0, entry.pos.z), v3(room.origin.x, 0, room.origin.z)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: trail });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(rooms[20].origin.x + 20, 0, rooms[20].origin.z); // nowhere near
    const b = new Bellman();
    b.spawn(ctx);
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (b.state !== 'done' && steps++ < 400) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /shoulders the leaf/.test(c))).toBe(false); // no live brace — no shoulder
    expect(captions.some((c) => /steps fade down the hall/.test(c))).toBe(true);
    b.dispose();
  });

  it('the eye tells — a stoop sighting drops a crumb it walks to (sprint 450)', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const trail = [v3(room.origin.x, 0, room.origin.z)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: trail });
    const b = new Bellman();
    b.spawn(ctx);
    const t = step(b, ctx, 4);   // warn → engage, trail starts pulling
    // the crack met your kneel here — the watcher gets YOUR position
    const kneel = v3(room.origin.x + 6, 0, room.origin.z + 3);
    const d0 = Math.hypot(b.pos.x - kneel.x, b.pos.z - kneel.z);
    b.eyeTell!(kneel);
    step(b, ctx, 4, t);
    const d1 = Math.hypot(b.pos.x - kneel.x, b.pos.z - kneel.z);
    expect(d1).toBeLessThan(d0); // it walks the sighting, not the cold trail
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /remembers the crack/.test(c))).toBe(true);
    b.dispose();
  });

  it('releases the hold and knocks normally once the brace is gone', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0];
    entry.heldBy = 'player';
    const trail = [v3(entry.pos.x, 0, entry.pos.z), v3(room.origin.x, 0, room.origin.z)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: trail });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(rooms[20].origin.x + 20, 0, rooms[20].origin.z); // well away, unseen
    const b = new Bellman();
    b.spawn(ctx);
    const t = step(b, ctx, 4);   // braced — it holds and rattles
    expect(entry.opening).toBe(false);
    entry.heldBy = undefined;  // the player stepped away
    step(b, ctx, 3, t);
    expect(entry.opening).toBe(true);  // knocked, then it swings for it
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

  it('works the house keys through a locked leaf — the leaf never opens', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0];
    entry.locked = true;   // a leaf the game locked, still locked for you
    const trail = [v3(entry.pos.x, 0, entry.pos.z), v3(room.origin.x, 0, room.origin.z)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: trail });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(rooms[20].origin.x + 20, 0, rooms[20].origin.z); // well away, unseen
    const b = new Bellman();
    b.spawn(ctx);
    const pos = (b as unknown as { pos: { x: number; z: number } }).pos;
    const nx = Math.sin(entry.yaw), nz = Math.cos(entry.yaw);
    const side = (p: { x: number; z: number }) => (p.x - entry.pos.x) * nx + (p.z - entry.pos.z) * nz;
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    // The keys work for a few seconds, then it comes through the seam.
    while (Math.abs(side(pos)) < 0.2 && steps++ < 300) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    expect(Math.abs(side(pos))).toBeGreaterThanOrEqual(0.2);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /keys works the lock|keys turning|keyway/.test(c))).toBe(true);
    expect(captions.some((c) => /lock turns for it/.test(c))).toBe(true);
    expect(entry.opening).toBeFalsy();        // the leaf never swung
    expect(entry.locked).toBe(true);          // still locked for you
    b.dispose();
  });

  it('holds under a close stare — the fold clock only runs at range (sprint 396)', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0].pos;
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: [] });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(room.origin.x, 0, room.origin.z);
    player.yaw = Math.atan2(entry.x - room.origin.x, entry.z - room.origin.z); // face the entry he comes through
    const b = new Bellman();
    b.spawn(ctx);
    const pos = (b as unknown as { pos: { x: number; z: number } }).pos;
    let t = 0; const ctxMut = ctx as { now: number };
    for (let i = 0; i < 60; i++) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    expect(b.state).toBe('engage');
    // step into arm's reach with the gaze held — the stare pins him now:
    // the fold clock only accrues at range, so the 2.6s fold never lands
    player.pos = v3(pos.x - Math.sin(player.yaw) * 1.4, 0, pos.z - Math.cos(player.yaw) * 1.4);
    for (let i = 0; i < 80; i++) { ctxMut.now = t; b.update(0.05); t += 0.05; } // 4s — past any fold
    expect(b.state).toBe('engage');
    expect((b as unknown as { cuttable: boolean }).cuttable).toBe(true);
    // step back to range — the stare still holds, the clock resumes, he folds
    player.pos = v3(pos.x - Math.sin(player.yaw) * 6, 0, pos.z - Math.cos(player.yaw) * 6);
    let steps = 0;
    while (b.state !== 'done' && steps++ < 400) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    expect(b.state).toBe('done');
    b.dispose();
  });

  it('a cut ring turns a locked leaf into a wall (sprint 396)', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0];
    entry.locked = true;
    const trail = [v3(entry.pos.x, 0, entry.pos.z), v3(room.origin.x, 0, room.origin.z)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 20, playerTrail: trail });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(rooms[20].origin.x + 20, 0, rooms[20].origin.z); // well away, unseen
    const b = new Bellman();
    b.spawn(ctx);
    b.cutKeys(); // the ring scatters before he ever reaches the seam
    const pos = (b as unknown as { pos: { x: number; z: number } }).pos;
    const nx = Math.sin(entry.yaw), nz = Math.cos(entry.yaw);
    const side = (p: { x: number; z: number }) => (p.x - entry.pos.x) * nx + (p.z - entry.pos.z) * nz;
    let t = 0; const ctxMut = ctx as { now: number }; let steps = 0;
    while (b.state !== 'done' && steps++ < 500) { ctxMut.now = t; b.update(0.05); t += 0.05; }
    expect(b.state).toBe('done');
    expect(Math.abs(side(pos))).toBeLessThan(0.2); // never through the seam
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /lost interest/.test(c))).toBe(true);
    expect(captions.every((c) => !/keys works the lock|lock turns for it/.test(c))).toBe(true);
    expect(entry.locked).toBe(true); // still locked for you too — the keys are spent, not yours
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

  it('reads the sign — a killed hazard pulls it off the line to investigate', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const room = rooms[28];
    const mid = v3((room.entryPos.x + room.exitPos.x) / 2, 0, (room.entryPos.z + room.exitPos.z) / 2);
    const evidence = { pos: v3(mid.x + 1.2, 0, mid.z), room: 28, kind: 'line', t: 0, readBy: [] as string[] };
    (ctx as { hazardEvidence?: EntityCtx['hazardEvidence'] }).hazardEvidence =
      (key, x, z, r) => {
        const out = !evidence.readBy.includes(key)
          && Math.hypot(evidence.pos.x - x, evidence.pos.z - z) < r ? [evidence] : [];
        for (const e of out) e.readBy.push(key);
        return out;
      };
    const warden = new Warden();
    warden.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | object };
    player.pos = v3(room.entryPos.x - 3, 0, room.entryPos.z - 3);
    player.hiddenSpot = { id: 'cab' } as object;
    let closest = Infinity, invSeen = false;
    for (let i = 0; i < 160; i++) {
      step(warden, ctx, 0.05);
      const p = (warden as unknown as { pos: { x: number; z: number } }).pos;
      closest = Math.min(closest, Math.hypot(p.x - evidence.pos.x, p.z - evidence.pos.z));
      if ((warden as unknown as { investigate: unknown }).investigate) invSeen = true;
    }
    // it left the line and walked the sign, once
    expect(invSeen, 'the warden should investigate the sign').toBe(true);
    expect(closest, 'it walks all the way to the sign').toBeLessThan(0.8);
    expect(evidence.readBy).toContain('warden:28');
    expect(warden.state, 'then it resumes the patrol').toBe('engage');
    warden.dispose();
  });

  it('the register\'s face is on the sign — a filed face teaches double (sprint 362)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28, heldOwed: () => 3 });
    const room = rooms[28];
    const mid = v3((room.entryPos.x + room.exitPos.x) / 2, 0, (room.entryPos.z + room.exitPos.z) / 2);
    const evidence = { pos: v3(mid.x + 1.2, 0, mid.z), room: 28, kind: 'line', t: 0, readBy: [] as string[] };
    (ctx as { hazardEvidence?: EntityCtx['hazardEvidence'] }).hazardEvidence =
      (key, x, z, r) => {
        const out = !evidence.readBy.includes(key)
          && Math.hypot(evidence.pos.x - x, evidence.pos.z - z) < r ? [evidence] : [];
        for (const e of out) e.readBy.push(key);
        return out;
      };
    const warden = new Warden();
    warden.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | object };
    player.pos = v3(room.entryPos.x - 3, 0, room.entryPos.z - 3);
    player.hiddenSpot = { id: 'cab' } as object;
    const w = warden as unknown as { signReads: number };
    let t = 0;
    for (let i = 0; i < 400 && w.signReads < 2; i++) t = step(warden, ctx, 0.05, t);
    // ONE named mark teaches what two strangers' marks used to —
    // signReads 2 == learned in a single read
    expect(w.signReads, 'one filed-face mark weighs two').toBeGreaterThanOrEqual(2);
    const cues = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(cues.some((s) => /register's face is on this sign/.test(s)),
      'the read names whose hands').toBe(true);
    warden.dispose();
  });

  it('the floor folds its felt back in — spilled wraps re-pocket (s482)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const room = rooms[28];
    const mid = v3((room.entryPos.x + room.exitPos.x) / 2, 0, (room.entryPos.z + room.exitPos.z) / 2);
    const pile = { x: mid.x + 1.0, z: mid.z };
    let taken = false;
    (ctx as { nearestSpill?: EntityCtx['nearestSpill'] }).nearestSpill =
      () => taken ? null : { ...pile, kind: 'wrap' as const };
    (ctx as { scavengeSpill?: EntityCtx['scavengeSpill'] }).scavengeSpill =
      vi.fn((x: number, z: number) => {
        if (Math.hypot(x - pile.x, z - pile.z) < 0.55) { taken = true; return { kind: 'wrap' as const, n: 2 }; }
        return null;
      });
    const warden = new Warden();
    warden.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | object };
    player.pos = v3(room.entryPos.x - 30, 0, room.entryPos.z - 30);
    player.hiddenSpot = { id: 'cab' } as object;
    const w = warden as unknown as { pocketed: number };
    let t = 0;
    for (let i = 0; i < 400 && !taken; i++) t = step(warden, ctx, 0.05, t);
    expect(taken, 'the pile was claimed').toBe(true);
    expect(w.pocketed, 'the felt is carried again').toBe(2);
    warden.dispose();
  });

  it('a kicked chock is loose goods — the warden pockets it, and spills it again (s489)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const room = rooms[28];
    const mid = v3((room.entryPos.x + room.exitPos.x) / 2, 0, (room.entryPos.z + room.exitPos.z) / 2);
    const chock = { x: mid.x + 1.0, z: mid.z };
    let taken = false;
    (ctx as { nearestSpill?: EntityCtx['nearestSpill'] }).nearestSpill =
      () => taken ? null : { ...chock, kind: 'wedge' as const };
    (ctx as { scavengeSpill?: EntityCtx['scavengeSpill'] }).scavengeSpill =
      vi.fn((x: number, z: number) => {
        if (Math.hypot(x - chock.x, z - chock.z) < 0.55) { taken = true; return { kind: 'wedge' as const }; }
        return null;
      });
    const spilled: number[] = [];
    (ctx as { spillChocks?: EntityCtx['spillChocks'] }).spillChocks =
      (_p, n) => { spilled.push(n); };
    const warden = new Warden();
    warden.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | object };
    player.pos = v3(room.entryPos.x - 30, 0, room.entryPos.z - 30);
    player.hiddenSpot = { id: 'cab' } as object;
    const w = warden as unknown as { pocketedChocks: number };
    let t = 0;
    for (let i = 0; i < 400 && !taken; i++) t = step(warden, ctx, 0.05, t);
    expect(taken, 'the chock was confiscated').toBe(true);
    expect(w.pocketedChocks, 'the chock is carried').toBe(1);
    // carried means spillable — put it down and the chock falls back out
    warden.stagger(3);
    expect(w.pocketedChocks).toBe(0);
    expect(spilled).toEqual([1]);
    warden.dispose();
  });

  it('the floorkeeper settles — pocketed goods spill where it went under (s502)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const dropped: number[] = [];
    const chocks: number[] = [];
    (ctx as { dropWraps?: EntityCtx['dropWraps'] }).dropWraps = (_p, n) => { dropped.push(n); };
    (ctx as { spillChocks?: EntityCtx['spillChocks'] }).spillChocks = (_p, n) => { chocks.push(n); };
    const warden = new Warden();
    warden.spawn(ctx);
    const w = warden as unknown as { pocketed: number; pocketedChocks: number };
    w.pocketed = 2; w.pocketedChocks = 1;
    // a quiet settle must not eat confiscated goods — confiscated, not
    // destroyed (dispose() runs onDone)
    warden.dispose();
    expect(dropped, 'the felt spills loose on settle').toEqual([2]);
    expect(chocks, 'the chocks spill loose on settle').toEqual([1]);
    expect(w.pocketed).toBe(0);
    expect(w.pocketedChocks).toBe(0);
  });

  it('doubts the mark — sign on a wiped floor is not investigated (sprint 291)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const room = rooms[28];
    const mid = v3((room.entryPos.x + room.exitPos.x) / 2, 0, (room.entryPos.z + room.exitPos.z) / 2);
    // a wiped floor 2m from the sign — inside the 3.5m doubt radius
    const wipe = { pos: v3(mid.x + 1.2, 0, mid.z - 2), room: 28, kind: 'wipe', t: 0, readBy: [] as string[], wiped: true };
    const evidence = { pos: v3(mid.x + 1.2, 0, mid.z), room: 28, kind: 'line', t: 0, readBy: [] as string[] };
    const records = [wipe, evidence];
    (ctx as { hazardEvidence?: EntityCtx['hazardEvidence'] }).hazardEvidence =
      (key, x, z, r) => {
        const out = records.filter((e) => (e.wiped || !e.readBy.includes(key))
          && Math.hypot(e.pos.x - x, e.pos.z - z) < r);
        for (const e of out) if (!e.wiped) e.readBy.push(key);
        return out;
      };
    const warden = new Warden();
    warden.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | object };
    player.pos = v3(room.entryPos.x - 3, 0, room.entryPos.z - 3);
    player.hiddenSpot = { id: 'cab' } as object;
    for (let i = 0; i < 400; i++) step(warden, ctx, 0.05);
    const cues = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(cues.some((t) => /the floor smells wiped/.test(t)), 'it sniffs the wipe and doubts').toBe(true);
    expect(cues.some((t) => /reads the sign/.test(t)), 'it never believes the wiped-floor mark').toBe(false);
    expect((warden as unknown as { investigate: unknown }).investigate, 'it stays on the line').toBeNull();
    expect(evidence.readBy).toContain('warden:28'); // the doubt still consumed the mark
    warden.dispose();
  });

  it('the second read teaches — two marks and the pace quickens (sprint 293)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const room = rooms[28];
    const mid = v3((room.entryPos.x + room.exitPos.x) / 2, 0, (room.entryPos.z + room.exitPos.z) / 2);
    const records = [
      { pos: v3(mid.x + 1.2, 0, mid.z), room: 28, kind: 'line', t: 0, readBy: [] as string[] },
      { pos: v3(mid.x - 1.5, 0, mid.z + 1), room: 28, kind: 'wire', t: 0, readBy: [] as string[] },
    ];
    (ctx as { hazardEvidence?: EntityCtx['hazardEvidence'] }).hazardEvidence =
      (key, x, z, r) => {
        // one mark per read, as they arrive in play — the live callback
        // marks everything returned, and the warden only weighs to the
        // first in-room mark, so a second would burn unseen anyway
        const out = records.filter((e) => !e.readBy.includes(key)
          && Math.hypot(e.pos.x - x, e.pos.z - z) < r).slice(0, 1);
        for (const e of out) e.readBy.push(key);
        return out;
      };
    const warden = new Warden();
    warden.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | object };
    player.pos = v3(room.entryPos.x - 3, 0, room.entryPos.z - 3);
    player.hiddenSpot = { id: 'cab' } as object;
    const w = warden as unknown as { pos: { x: number; z: number }; signReads: number; investigate: unknown };
    // two marks land across cycles; it weighs both (spends the reads)
    let t = 0;
    for (let i = 0; i < 600; i++) { t = step(warden, ctx, 0.05, t); if (w.signReads >= 2) break; }
    expect(w.signReads, 'it weighs both marks').toBeGreaterThanOrEqual(2);
    const cues = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(cues.some((s) => /floor is worked/.test(s)), 'the second read teaches — once').toBe(true);
    // let any investigation finish, then run both a learned warden and a
    // fresh one on the same line for the same window — the learned one
    // covers more ground (1.18 speed + shorter end pauses).
    for (let i = 0; i < 300 && w.investigate; i++) t = step(warden, ctx, 0.05, t);
    const baseline = new Warden();
    baseline.spawn(ctx); // same key — records already read, it learns nothing
    const wb = baseline as unknown as { pos: { x: number; z: number } };
    let dLearned = 0, dBase = 0;
    for (let i = 0; i < 240; i++) {
      const lx = w.pos.x, lz = w.pos.z, bx = wb.pos.x, bz = wb.pos.z;
      t = step(warden, ctx, 0.05, t); baseline.update(0.05);
      dLearned += Math.hypot(w.pos.x - lx, w.pos.z - lz);
      dBase += Math.hypot(wb.pos.x - bx, wb.pos.z - bz);
    }
    expect(dLearned, `learned ${dLearned.toFixed(1)} vs baseline ${dBase.toFixed(1)}`)
      .toBeGreaterThan(dBase * 1.1);
    warden.dispose();
    baseline.dispose();
  });

  it('a learned warden strikes first — the whistle dies quick (sprint 294)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const room = rooms[28];
    const mid = v3((room.entryPos.x + room.exitPos.x) / 2, 0, (room.entryPos.z + room.exitPos.z) / 2);
    const records = [
      { pos: v3(mid.x + 1.2, 0, mid.z), room: 28, kind: 'line', t: 0, readBy: [] as string[] },
      { pos: v3(mid.x - 1.5, 0, mid.z + 1), room: 28, kind: 'wire', t: 0, readBy: [] as string[] },
    ];
    (ctx as { hazardEvidence?: EntityCtx['hazardEvidence'] }).hazardEvidence =
      (key, x, z, r) => {
        const out = records.filter((e) => !e.readBy.includes(key)
          && Math.hypot(e.pos.x - x, e.pos.z - z) < r).slice(0, 1);
        for (const e of out) e.readBy.push(key);
        return out;
      };
    const warden = new Warden();
    warden.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | object; dead: boolean };
    player.pos = v3(room.entryPos.x - 3, 0, room.entryPos.z - 3);
    player.hiddenSpot = { id: 'cab' } as object;
    const w = warden as unknown as {
      pos: { x: number; z: number }; signReads: number; investigate: unknown;
      charging: boolean; mesh: { rotation: { y: number } } | null;
    };
    let t = 0;
    for (let i = 0; i < 600 && w.signReads < 2; i++) t = step(warden, ctx, 0.05, t);
    expect(w.signReads).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 300 && w.investigate; i++) t = step(warden, ctx, 0.05, t);
    const baseline = new Warden();
    baseline.spawn(ctx);
    const wb = baseline as unknown as typeof w;

    // keep the player pinned 8m ahead of the warden's live heading — it
    // stays in the facing cone through line-end turns — count frames to
    // the whistle, then charge pace over 20 frames (inside the 1.5s
    // lost-scent grace so a stray LOS drop can't end the charge early)
    const expose = (hunter: typeof w, upd: () => void) => {
      const pin = () => {
        const h = hunter.mesh ? hunter.mesh.rotation.y : 0;
        // sprint 441 — the whistle needs air too: hunt the bearing where
        // the pin's sight line actually clears shut leaves and walls (the
        // heading cone pins it dead-ahead whatever's in the way; a nearer
        // stand often clears the finite panel a far one can't).
        for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.0, -1.0]) {
          for (const dist of [8, 6, 4.5, 3]) {
            const cand = v3(hunter.pos.x + Math.sin(h + off) * dist, 0, hunter.pos.z + Math.cos(h + off) * dist);
            const host = ctx.rooms[(hunter as unknown as { hostRoom: number }).hostRoom];
            const eyeW = v3(hunter.pos.x, 1.7, hunter.pos.z);
            const eyeP = v3(cand.x, 1.5, cand.z);
            const blockers = (host ? host.losBlockers : []).concat(shutLeafBlockers(ctx.rooms, hunter.pos, cand));
            if (hasLineOfSight(eyeW, eyeP, blockers)) { player.pos = cand; return; }
          }
        }
        player.pos = v3(hunter.pos.x + Math.sin(h) * 8, 0, hunter.pos.z + Math.cos(h) * 8);
      };
      player.hiddenSpot = null;
      player.dead = false;
      pin();
      let frames = 0;
      while (frames++ < 60 && !hunter.charging) { pin(); upd(); }
      let walked = 0;
      for (let i = 0; i < 20; i++) {
        const px = hunter.pos.x, pz = hunter.pos.z;
        pin(); upd();
        walked += Math.hypot(hunter.pos.x - px, hunter.pos.z - pz);
      }
      return { frames, walked };
    };
    const a = expose(w, () => { t = step(warden, ctx, 0.05, t); });
    // hide again — the strike may have 'killed' the stub player
    player.hiddenSpot = { id: 'cab' } as object;
    player.dead = false;
    player.pos = v3(room.entryPos.x - 3, 0, room.entryPos.z - 3);
    const b = expose(wb, () => baseline.update(0.05));

    expect(a.frames, `learned whistles at frame ${a.frames}`).toBeLessThanOrEqual(6);
    expect(b.frames, `baseline needs ${b.frames}`).toBeGreaterThanOrEqual(7);
    expect(a.walked, `charge ${a.walked.toFixed(1)} vs ${b.walked.toFixed(1)}`)
      .toBeGreaterThan(b.walked * 1.15);
    const cues = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(cues.some((s) => /already knows you/.test(s)), 'the learned whistle reads different').toBe(true);
    warden.dispose();
    baseline.dispose();
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

  it('holds mid-stride under the house’s own glass — the stagger freezes every clock (sprint 395)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 28 });
    const warden = new Warden();
    warden.spawn(ctx);
    const room = rooms[28];
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: null | object };
    player.pos = v3(room.entryPos.x - 3, 0, room.entryPos.z - 3);
    player.hiddenSpot = { id: 'cab' } as object; // hidden far off — pure patrol
    let t = step(warden, ctx, 6);
    const p0 = (warden as unknown as { pos: { x: number; z: number } }).pos;
    const frozen = { x: p0.x, z: p0.z };
    warden.stagger(4); // the glass lands — the world holds still for him
    t = step(warden, ctx, 4, t); // the full stagger window
    const p1 = (warden as unknown as { pos: { x: number; z: number } }).pos;
    // the staggerUntil boundary frame may run one update — a single step
    // at most, not a walk
    expect(Math.hypot(p1.x - frozen.x, p1.z - frozen.z)).toBeLessThan(0.15);
    step(warden, ctx, 6, t); // gathers himself — the pace resumes
    const p2 = (warden as unknown as { pos: { x: number; z: number } }).pos;
    expect(Math.hypot(p2.x - frozen.x, p2.z - frozen.z)).toBeGreaterThan(0.5);
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
    // the wave needs a long run — pick a room with a ≥14m entry→exit
    // axis so the swell is still traveling at step 30 (index drifted
    // when new templates joined the seeded pool)
    const gi = rooms.findIndex((r, i) => i > 15 &&
      Math.hypot(r.exitPos.x - r.entryPos.x, r.exitPos.z - r.entryPos.z) >= 14);
    expect(gi).toBeGreaterThanOrEqual(0);
    const ctx = makeCtx(rooms, { currentRoomIndex: gi });
    const gs = new Groundswell();
    gs.spawn(ctx);
    const room = rooms[gi];
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

describe('Inspector (sprint 236)', () => {
  const stepUntil = (fn: () => boolean, ctx: EntityCtx, e: Inspector, max = 1200) => {
    const ctxMut = ctx as { now: number };
    let t = (ctxMut.now as number) || 0, steps = 0;
    while (steps++ < max && !fn()) { ctxMut.now = t; e.update(0.05); t += 0.05; }
    ctxMut.now = t;
    return fn();
  };
  const inspRoomIdx = (rooms: RoomInstance[]) =>
    rooms.findIndex((r) => r.index >= 10 && r.index < 55 && r.hidingSpots.length >= 2);

  it('walks the room and tries every lid, then moves on', () => {
    const rooms = routeRooms();
    const idx = inspRoomIdx(rooms);
    expect(idx).toBeGreaterThan(0);
    const ctx = makeCtx(rooms, { currentRoomIndex: idx });
    const insp = new Inspector();
    insp.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number } };
    player.pos = v3(0, 0, -999); // watch from afar
    stepUntil(() => insp.state === 'done', ctx, insp, 1600);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(insp.state).toBe('done');
    expect(captions.filter((c) => /it tries the lid/.test(c)).length).toBeGreaterThanOrEqual(2);
    expect(captions.some((c) => /moves on to the next room/.test(c))).toBe(true);
    insp.dispose();
  });

  it('lets go when the lid is held through the rattle', () => {
    const rooms = routeRooms();
    const idx = inspRoomIdx(rooms);
    const ctx = makeCtx(rooms, { currentRoomIndex: idx });
    const insp = new Inspector();
    insp.spawn(ctx);
    const room = rooms[idx];
    // Hide in the spot closest to its spawn — it will be tested first.
    const ep = room.entryPos;
    const spot = room.hidingSpots.reduce((a, b) =>
      (Math.hypot(a.exitPos.x - ep.x, a.exitPos.z - ep.z) < Math.hypot(b.exitPos.x - ep.x, b.exitPos.z - ep.z) ? a : b));
    const player = ctx.player as unknown as { hiddenSpot: unknown; pos: { x: number; y: number; z: number } };
    player.hiddenSpot = spot;
    player.pos = v3(spot.exitPos.x, 0, spot.exitPos.z);
    const gotLid = stepUntil(() => spot.trappedBy === 'inspector', ctx, insp, 900);
    expect(gotLid).toBe(true);
    // Hold it shut — four presses inside the window.
    for (let i = 0; i < 4; i++) insp.struggle();
    stepUntil(() => spot.trappedBy !== 'inspector', ctx, insp, 200);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /lets go — moves on/.test(c))).toBe(true);
    expect((ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect(player.hiddenSpot).toBe(spot); // still hidden — won the grapple
    insp.dispose();
  });

  it('pulls the player out when the grapple goes unanswered', () => {
    const rooms = routeRooms();
    const idx = inspRoomIdx(rooms);
    const ctx = makeCtx(rooms, { currentRoomIndex: idx });
    const insp = new Inspector();
    insp.spawn(ctx);
    const room = rooms[idx];
    const ep = room.entryPos;
    const spot = room.hidingSpots.reduce((a, b) =>
      (Math.hypot(a.exitPos.x - ep.x, a.exitPos.z - ep.z) < Math.hypot(b.exitPos.x - ep.x, b.exitPos.z - ep.z) ? a : b));
    const player = ctx.player as unknown as { hiddenSpot: unknown; pos: { x: number; y: number; z: number } };
    player.hiddenSpot = spot;
    player.pos = v3(spot.exitPos.x, 0, spot.exitPos.z);
    const gotLid = stepUntil(() => spot.trappedBy === 'inspector', ctx, insp, 900);
    expect(gotLid).toBe(true);
    stepUntil(() => spot.trappedBy !== 'inspector', ctx, insp, 200); // no presses — it wins
    const dmg = (ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls;
    expect(dmg.length).toBe(1);
    expect(dmg[0][1]).toBe('inspector');
    expect(player.hiddenSpot).toBeNull(); // dragged into the open
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /pulls you out/.test(c))).toBe(true);
    insp.dispose();
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

describe('Commissionaire (sprint 237)', () => {
  const stepUntil = (fn: () => boolean, ctx: EntityCtx, e: Commissionaire, max = 1200) => {
    const ctxMut = ctx as { now: number };
    let t = (ctxMut.now as number) || 0, steps = 0;
    while (steps++ < max && !fn()) { ctxMut.now = t; e.update(0.05); t += 0.05; }
    ctxMut.now = t;
    return fn();
  };
  const commRoomIdx = (rooms: RoomInstance[]) =>
    rooms.findIndex((r, i) => r.index >= 14 && r.index <= 70 && i < rooms.length - 1 && !r.authored && r.biome !== 'safe');
  const entryCluster = (rooms: RoomInstance[], idx: number) => {
    const en = rooms[idx].entryPos;
    return [...rooms[idx].doors, ...rooms[idx - 1].doors]
      .filter((d) => Math.hypot(d.pos.x - en.x, d.pos.z - en.z) < 0.9);
  };

  it('seals the entry leaf and releases it when done', () => {
    const rooms = routeRooms();
    const idx = commRoomIdx(rooms);
    expect(idx).toBeGreaterThan(0);
    const ctx = makeCtx(rooms, { currentRoomIndex: idx });
    const comm = new Commissionaire();
    comm.spawn(ctx);
    const held = entryCluster(rooms, idx);
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((d) => d.heldBy === 'commissionaire')).toBe(true);
    // Room change retires it — the doors it held must open again.
    (ctx as { currentRoomIndex: number }).currentRoomIndex = idx + 1;
    comm.update(0.05);
    expect(comm.state).toBe('done');
    expect(held.every((d) => d.heldBy === undefined)).toBe(true);
    comm.dispose();
  });

  it('finds you in the lantern arc and throws you back to the entry', () => {
    const rooms = routeRooms();
    const idx = commRoomIdx(rooms);
    const ctx = makeCtx(rooms, { currentRoomIndex: idx });
    const comm = new Commissionaire();
    comm.spawn(ctx);
    const room = rooms[idx];
    const en = room.entryPos, ex = room.exitPos;
    // Stand on the entry→exit axis inside the sweep's centre.
    const yaw = Math.atan2(en.x - ex.x, en.z - ex.z);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; hiddenSpot: unknown };
    player.pos = v3(ex.x + Math.sin(yaw) * 4.5, 0, ex.z + Math.cos(yaw) * 4.5);
    const hit = stepUntil(
      () => (ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length > 0,
      ctx, comm, 900,
    );
    expect(hit).toBe(true);
    expect((ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1] === 'commissionaire')).toBe(true);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /lantern finds you|throws you back/.test(c))).toBe(true);
    comm.dispose();
  });

  it('stands aside the moment the exit leaf opens', () => {
    const rooms = routeRooms();
    const idx = commRoomIdx(rooms);
    const ctx = makeCtx(rooms, { currentRoomIndex: idx });
    const comm = new Commissionaire();
    comm.spawn(ctx);
    const room = rooms[idx];
    const ex = room.exitPos;
    const exitDoor = [...room.doors, ...rooms[idx + 1].doors]
      .find((d) => Math.hypot(d.pos.x - ex.x, d.pos.z - ex.z) < 0.9);
    expect(exitDoor).toBeTruthy();
    exitDoor!.opening = true;
    comm.update(0.05);
    expect(comm.state).toBe('done');
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /stands aside/.test(c))).toBe(true);
    comm.dispose();
  });
});

describe('Hearing the cast (sprint 238)', () => {
  const hearingCtx = (rooms: RoomInstance[], idx: number, overrides: Partial<EntityCtx> = {}) => {
    let hear: ((e: import('../src/engine/events').SoundEvent) => void) | null = null;
    const ctx = makeCtx(rooms, {
      currentRoomIndex: idx,
      sound: {
        emit: vi.fn(),
        on: vi.fn((fn: (e: import('../src/engine/events').SoundEvent) => void) => { hear = fn; return () => { }; }),
        intensityAt: vi.fn(() => 0),
      } as unknown as EntityCtx['sound'],
      ...overrides,
    });
    const emit = (x: number, z: number, intensity = 1, category = 'distraction') =>
      hear?.({ x, y: 0, z, intensity, category, caption: '' });
    return { ctx, emit };
  };
  const stepTo = (fn: () => boolean, ctx: EntityCtx, e: { update(dt: number): void }, max = 800) => {
    const ctxMut = ctx as { now: number };
    let t = ctxMut.now || 0, steps = 0;
    while (steps++ < max && !fn()) { ctxMut.now = t; e.update(0.05); t += 0.05; }
    ctxMut.now = t;
    return fn();
  };

  it('warden leaves its post to check a loud noise', () => {
    const rooms = routeRooms();
    const { ctx, emit } = hearingCtx(rooms, 20);
    const w = new Warden();
    w.spawn(ctx);
    const pos = (w as unknown as { pos: { x: number; z: number } }).pos;
    // in-room target — room 20's shape drifts with the template pool;
    // midpoint of origin→exit is always inside
    const np = v3((rooms[20].origin.x + rooms[20].exitPos.x) / 2, 0,
      (rooms[20].origin.z + rooms[20].exitPos.z) / 2);
    emit(np.x, np.z);
    expect((w as unknown as { investigate: unknown }).investigate).not.toBeNull();
    const arrived = stepTo(() => Math.hypot(pos.x - np.x, pos.z - np.z) < 0.6, ctx, w, 600);
    expect(arrived).toBe(true);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /turns toward the noise/.test(c))).toBe(true);
    w.dispose();
  });

  it('commissionaire pins its lantern on a heard noise', () => {
    const rooms = routeRooms();
    const idx = rooms.findIndex((r) => (r.doors?.length ?? 0) >= 2);
    const { ctx, emit } = hearingCtx(rooms, idx);
    const comm = new Commissionaire();
    comm.spawn(ctx);
    const pos = (comm as unknown as { pos: { x: number; z: number } }).pos;
    const np = v3(pos.x + 3, 0, pos.z - 2);
    emit(np.x, np.z);
    stepTo(() => Math.abs(
      (comm as unknown as { gazeYaw: number }).gazeYaw - Math.atan2(np.x - pos.x, np.z - pos.z)
    ) < 0.01, ctx, comm, 40);
    const gy = (comm as unknown as { gazeYaw: number }).gazeYaw;
    expect(gy).toBeCloseTo(Math.atan2(np.x - pos.x, np.z - pos.z), 2);
    comm.dispose();
  });

  it('bellman detours to a loud sound off the trail', () => {
    const rooms = routeRooms();
    const room = rooms[20];
    const entry = room.doors[0].pos;
    // Trail runs entry → far corner; the noise sits off-line.
    const trail = Array.from({ length: 8 }, (_, i) =>
      v3(entry.x + (room.origin.x - entry.x) * i / 7, 0, entry.z + (room.origin.z - entry.z) * i / 7));
    const { ctx, emit } = hearingCtx(rooms, 20, { playerTrail: trail });
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    player.pos = v3(room.origin.x + 30, 0, room.origin.z); // far away — no gaze freeze
    player.yaw = 0;
    const b = new Bellman();
    b.spawn(ctx);
    const pos = (b as unknown as { pos: { x: number; z: number } }).pos;
    const np = v3(entry.x + 2.5, 0, entry.z + 3.5);
    emit(np.x, np.z);
    const sniffed = stepTo(() => Math.hypot(pos.x - np.x, pos.z - np.z) < 0.6, ctx, b, 800);
    expect(sniffed).toBe(true);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /stoops to the sound/.test(c))).toBe(true);
    b.dispose();
  });

  it('groundswell waves arrive early when the room is loud', () => {
    const rooms = routeRooms();
    const { ctx, emit } = hearingCtx(rooms, 28);
    const gs = new Groundswell();
    gs.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number } };
    player.pos = v3(0, 0, -999);
    const waveAt = (gs as unknown as { waveAt: number }).waveAt;
    expect(waveAt).toBeGreaterThan(0.7 + 0.05);
    const room = rooms[28];
    emit(room.origin.x, room.origin.z);
    // Noise should have dragged the next wave to ~0.7s out.
    const launched = stepTo(() => (gs as unknown as { front: number }).front >= 0, ctx, gs, 40);
    expect(launched).toBe(true);
    gs.dispose();
  });

  it('pebbles are heard in-room but too soft to rouse through walls', () => {
    const rooms = routeRooms();
    const { ctx, emit } = hearingCtx(rooms, 20);
    const w = new Warden();
    w.spawn(ctx);
    // Breath-quiet (0.3 < 0.42 floor): ignored. Emit in-room — room
    // 20's footprint drifts with the template pool; origin is always inside.
    const ip = rooms[20].origin;
    emit(ip.x, ip.z, 0.3, 'distraction');
    expect((w as unknown as { investigate: unknown }).investigate).toBeNull();
    // Pebble loudness (0.45): below the door-rouse floor but inside hearing.
    emit(ip.x, ip.z, 0.45, 'distraction');
    expect((w as unknown as { investigate: unknown }).investigate).not.toBeNull();
    w.dispose();
  });

  it('warden shoulders through a door into the next room for a loud noise', () => {
    const rooms = routeRooms();
    const { ctx, emit } = hearingCtx(rooms, 20);
    const w = new Warden();
    w.spawn(ctx);
    // Park it beside room 21's entry door — at patrol range of the shared leaf.
    const next = rooms[21];
    const door = next.doors.find((d) => d.id.endsWith('-in')) ?? next.doors[0];
    const pos = (w as unknown as { pos: { x: number; z: number } }).pos;
    pos.x = door.pos.x; pos.z = door.pos.z;
    // Noise inside room 21, off the wall: reachable — it investigates, then
    // on the walk it puts a shoulder through the leaf and opens it.
    emit(next.origin.x, next.origin.z);
    expect((w as unknown as { investigate: unknown }).investigate).not.toBeNull();
    let t = 0; const ctxMut = ctx as { now: number };
    for (let i = 0; i < 120 && !door.opening; i++) { ctxMut.now = t; w.update(0.05); t += 0.05; }
    expect(door.opening).toBe(true);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /shoulder through the door/.test(c))).toBe(true);
    w.dispose();
  });

  it('a braced or locked leaf turns the warden from a cross-room check', () => {
    const rooms = routeRooms();
    const { ctx, emit } = hearingCtx(rooms, 20);
    const w = new Warden();
    w.spawn(ctx);
    const next = rooms[21];
    const door = next.doors.find((d) => d.id.endsWith('-in')) ?? next.doors[0];
    door.heldBy = 'player';
    const pos = (w as unknown as { pos: { x: number; z: number } }).pos;
    pos.x = door.pos.x; pos.z = door.pos.z;
    emit(next.origin.x, next.origin.z);
    expect((w as unknown as { investigate: unknown }).investigate).not.toBeNull();
    let t = 0; const ctxMut = ctx as { now: number };
    for (let i = 0; i < 120 && (w as unknown as { investigate: unknown }).investigate; i++) {
      ctxMut.now = t; w.update(0.05); t += 0.05;
    }
    expect(door.opening).toBe(false);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /turns from the held door/.test(c))).toBe(true);
    w.dispose();
  });

  it('a wedged leaf in the same seam still turns it — the shove skips held leaves', () => {
    const rooms = routeRooms();
    const { ctx, emit } = hearingCtx(rooms, 20);
    const w = new Warden();
    w.spawn(ctx);
    // Cluster doors stack in the seam: two registrations of one aperture.
    // No generated seed produces pairs <0.7m apart, so synthesize them —
    // a wedged leaf beside a merely-closed twin. Iteration order must not
    // decide: pre-fix, the free twin could answer first and the cluster
    // shove swung the wedged leaf open for free.
    const next = rooms[21];
    const door = next.doors.find((d) => d.id.endsWith('-in')) ?? next.doors[0];
    const twin = { ...door, id: `${door.id}-twin` };
    twin.pos = { ...door.pos, x: door.pos.x + 0.4 };
    next.doors.push(twin);
    door.heldBy = 'wedge';
    const pos = (w as unknown as { pos: { x: number; z: number } }).pos;
    pos.x = door.pos.x; pos.z = door.pos.z;
    emit(next.origin.x, next.origin.z);
    expect((w as unknown as { investigate: unknown }).investigate).not.toBeNull();
    let t = 0; const ctxMut = ctx as { now: number };
    for (let i = 0; i < 120 && (w as unknown as { investigate: unknown }).investigate; i++) {
      ctxMut.now = t; w.update(0.05); t += 0.05;
    }
    expect((w as unknown as { investigate: unknown }).investigate).toBeNull();
    expect(door.opening).toBe(false);
    expect(twin.opening).toBe(false);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /turns from the held door/.test(c))).toBe(true);
    w.dispose();
  });

  it('cross-room noise it cannot reach leaves the warden on its line', () => {
    const rooms = routeRooms();
    const { ctx, emit } = hearingCtx(rooms, 20);
    const w = new Warden();
    w.spawn(ctx);
    // Mid-room — far from room 21's doors — a noise there is out of reach.
    emit(rooms[21].origin.x, rooms[21].origin.z);
    expect((w as unknown as { investigate: unknown }).investigate).toBeNull();
    w.dispose();
  });

  it('inspector glances up — a noise cuts the lid test short', () => {
    const rooms = routeRooms();
    const idx = rooms.findIndex((r) => r.index >= 10 && r.index < 55 && r.hidingSpots.length >= 2);
    const { ctx, emit } = hearingCtx(rooms, idx);
    const insp = new Inspector();
    insp.spawn(ctx);
    const player = ctx.player as unknown as { pos: { x: number; y: number; z: number } };
    player.pos = v3(0, 0, -999);
    const testing = stepTo(() => (insp as unknown as { testing: unknown }).testing !== null, ctx, insp, 900);
    expect(testing).toBe(true);
    // Fresh test starts at 2.6s; noise should pull it down to 1.2.
    while ((insp as unknown as { testT: number }).testT <= 1.5) {
      stepTo(() => (insp as unknown as { testT: number }).testT > 1.5 || (insp as unknown as { testing: unknown }).testing === null, ctx, insp, 400);
      if ((insp as unknown as { testing: unknown }).testing === null) break;
    }
    expect((insp as unknown as { testing: unknown }).testing).not.toBeNull();
    const pos = (insp as unknown as { pos: { x: number; z: number } }).pos;
    emit(pos.x + 1, pos.z + 1);
    expect((insp as unknown as { testT: number }).testT).toBeLessThanOrEqual(1.2);
    insp.dispose();
  });
});


describe('Collector (sprint 242)', () => {
  const collectorCtx = (rooms: RoomInstance[], purse: number) => {
    const interactions: { kind: string; prompt: string; data: unknown }[] = [];
    const ctx = makeCtx(rooms, {
      purse: () => purse,
      addInteractable: vi.fn((it) => { interactions.push(it as { kind: string; prompt: string; data: unknown }); }),
      removeInteractable: vi.fn(),
      nearestThreat: () => null,
    });
    return { ctx, interactions };
  };
  const untilDemand = (col: Collector, ctx: EntityCtx, max = 600) => {
    const ctxMut = ctx as { now: number };
    let t = ctxMut.now || 0, steps = 0;
    while (steps++ < max && (col as unknown as { phase: string }).phase !== 'demand') {
      ctxMut.now = t; col.update(0.05); t += 0.05;
    }
    return (col as unknown as { phase: string }).phase === 'demand';
  };

  it('the tin counts what you carry — the ask scales with the purse', () => {
    for (const [purse, want] of [[5, 2], [50, 6], [150, 18], [400, 24]] as const) {
      const rooms = routeRooms();
      const { ctx, interactions } = collectorCtx(rooms, purse);
      const col = new Collector();
      col.spawn(ctx);
      expect(untilDemand(col, ctx)).toBe(true);
      const toll = interactions.find((i) => i.kind === 'toll');
      expect(toll).toBeTruthy();
      expect((toll!.data as { price: number }).price).toBe(want);
      expect(toll!.prompt).toContain(`${want} imprints`);
      col.dispose();
    }
  });

  it('paying the scaled toll buys the whisper and sends it off', () => {
    const rooms = routeRooms();
    const { ctx, interactions } = collectorCtx(rooms, 150);
    const col = new Collector();
    col.spawn(ctx);
    expect(untilDemand(col, ctx)).toBe(true);
    const toll = interactions.find((i) => i.kind === 'toll');
    expect(toll).toBeTruthy();
    (toll!.data as { pay: () => void }).pay();
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /tin accepts/.test(c))).toBe(true);
    expect((col as unknown as { phase: string }).phase).toBe('leave');
    col.dispose();
  });

  it('a rich purse is announced — the rattle says it is counting', () => {
    const rooms = routeRooms();
    const { ctx } = collectorCtx(rooms, 300);
    const col = new Collector();
    col.spawn(ctx);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /counting what you carry/.test(c))).toBe(true);
    col.dispose();
  });
});

describe('Returner answers the bell (sprint 253)', () => {
  const hearingCtx = (rooms: RoomInstance[], idx: number) => {
    let hear: ((e: import('../src/engine/events').SoundEvent) => void) | null = null;
    const ctx = makeCtx(rooms, {
      currentRoomIndex: idx,
      sound: {
        emit: vi.fn(),
        on: vi.fn((fn: (e: import('../src/engine/events').SoundEvent) => void) => { hear = fn; return () => { }; }),
        intensityAt: vi.fn(() => 0),
      } as unknown as EntityCtx['sound'],
    });
    const emit = (x: number, z: number, intensity = 1, category = 'machine') =>
      hear?.({ x, y: 0, z, intensity, category, caption: '' });
    return { ctx, emit, heard: () => hear !== null };
  };

  it('a crash within earshot of the latching end shortens the warning, once', () => {
    const rooms = routeRooms();
    const { ctx, emit, heard } = hearingCtx(rooms, 20);
    const rt = new CorridorRunner('returner', { fromAhead: true });
    rt.spawn(ctx);
    expect(heard()).toBe(true); // only the returner subscribes
    expect(rt.state).toBe('warn');
    const warnT = () => (rt as unknown as { warnT: number }).warnT;
    expect(warnT()).toBeGreaterThan(2);
    const at = (rt as unknown as { path: { x: number; z: number }[] }).path[0];
    // a far crash does not reach the latching
    emit(at.x + 400, at.z + 400);
    expect(warnT()).toBeGreaterThan(2);
    // a crash at its door answers once
    emit(at.x, at.z);
    expect(warnT()).toBeLessThanOrEqual(1.0);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /quickens toward the sound/.test(c))).toBe(true);
    rt.update(0.05);
    emit(at.x, at.z);
    expect(warnT()).toBeLessThanOrEqual(1.0);
    rt.dispose();
  });

  it('a quiet scuff or an engaged pass does not answer', () => {
    const rooms = routeRooms();
    const { ctx, emit } = hearingCtx(rooms, 20);
    const rt = new CorridorRunner('returner', { fromAhead: true });
    rt.spawn(ctx);
    const at = (rt as unknown as { path: { x: number; z: number }[] }).path[0];
    const warnT = () => (rt as unknown as { warnT: number }).warnT;
    emit(at.x, at.z, 0.3); // below the in-room floor
    expect(warnT()).toBeGreaterThan(2);
    rt.dispose();
    // a sweep never subscribes — the verb belongs to the returner alone
    const { emit: emit2, heard: heard2 } = hearingCtx(rooms, 20);
    void emit2;
    const sw = new CorridorRunner('sweep');
    sw.spawn(makeCtx(rooms, { currentRoomIndex: 20 }));
    expect(heard2()).toBe(false);
    sw.dispose();
    void ctx;
  });
});

describe('Swamper (sprint 255)', () => {
  const floodRoom = (): RoomInstance => ({
    index: 5, templateId: 'u-corridor', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 20, depth: 20, spec: { width: 20, depth: 20, props: [] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [], flooded: true,
  } as unknown as RoomInstance);

  const hearingCtx = (rooms: RoomInstance[], drained = false) => {
    let hear: ((e: import('../src/engine/events').SoundEvent) => void) | null = null;
    const ctx = makeCtx(rooms, {
      currentRoomIndex: 0,
      isRoomDrained: () => drained,
      sound: {
        emit: vi.fn(),
        on: vi.fn((fn: (e: import('../src/engine/events').SoundEvent) => void) => { hear = fn; return () => { }; }),
        intensityAt: vi.fn(() => 0),
      } as unknown as EntityCtx['sound'],
    });
    const emit = (x: number, z: number, intensity = 0.55, category = 'impact') =>
      hear?.({ x, y: 0, z, intensity, category, caption: '' });
    const step = (sw: { update(dt: number): void }, n: number) => {
      for (let i = 0; i < n; i++) { ctx.now += 0.05; sw.update(0.05); }
    };
    return { ctx, emit, step, heard: () => hear !== null };
  };

  it('lies under the flood, glides to a splash, and strikes a stirred wader', async () => {
    const { Swamper } = await import('../src/entities/setpieces');
    const rooms = [floodRoom()];
    const { ctx, emit, step, heard } = hearingCtx(rooms);
    ctx.player.pos.x = 0; ctx.player.pos.z = 6;
    const sw = new Swamper();
    sw.spawn(ctx);
    expect(heard()).toBe(true);
    expect(sw.state).toBe('engage');
    const pos = () => (sw as unknown as { pos: { x: number; z: number } }).pos;
    const start = { x: pos().x, z: pos().z };
    // a splash inside its room pulls it toward the point
    emit(0, 6);
    step(sw, 20);
    expect(Math.hypot(pos().x - start.x, pos().z - start.z)).toBeGreaterThan(1);
    // a wader stirring the flood at contact gets the strike
    ctx.player.vel.x = 1.4;
    step(sw, 140);
    expect(ctx.damagePlayer).toHaveBeenCalledWith(25, 'swamper', expect.any(String));
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /the water stands up/.test(c))).toBe(true);
    sw.dispose();
  });

  it('the boards name you — a named catch takes the marked take (sprint 366)', async () => {
    const { Swamper } = await import('../src/entities/setpieces');
    const rooms = [floodRoom()];
    const { ctx, emit, step } = hearingCtx(rooms);
    ctx.player.pos.x = 0; ctx.player.pos.z = 6;
    ctx.wanted = () => true;
    ctx.seizeMarked = vi.fn(() => true);
    const sw = new Swamper();
    sw.spawn(ctx);
    emit(0, 6);
    step(sw, 20);
    ctx.player.vel.x = 1.4;
    step(sw, 140);
    expect(ctx.damagePlayer).toHaveBeenCalledWith(25, 'swamper', expect.any(String));
    expect(ctx.seizeMarked).toHaveBeenCalled();
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /tag hangs on the nearest cage/.test(c))).toBe(true);
    sw.dispose();
    // a stranger keeps his pockets — no seize while the boards don't name him
    const rooms2 = [floodRoom()];
    const { ctx: ctx2, emit: emit2, step: step2 } = hearingCtx(rooms2);
    ctx2.player.pos.x = 0; ctx2.player.pos.z = 6;
    ctx2.wanted = () => false;
    ctx2.seizeMarked = vi.fn(() => true);
    const sw2 = new Swamper();
    sw2.spawn(ctx2);
    emit2(0, 6);
    step2(sw2, 20);
    ctx2.player.vel.x = 1.4;
    step2(sw2, 140);
    expect(ctx2.damagePlayer).toHaveBeenCalled();
    expect(ctx2.seizeMarked).not.toHaveBeenCalled();
    sw2.dispose();
  });

  it('a crouched wader stirs nothing — contact without a splash is safe', async () => {
    const { Swamper } = await import('../src/entities/setpieces');
    const rooms = [floodRoom()];
    const { ctx, emit, step } = hearingCtx(rooms);
    ctx.player.pos.x = 0; ctx.player.pos.z = 6;
    ctx.player.crouching = true;
    ctx.player.vel.x = 1.0;
    const sw = new Swamper();
    sw.spawn(ctx);
    // a pebble splash pulls it straight onto the quiet wader
    emit(0, 6);
    step(sw, 120);
    expect(ctx.damagePlayer).not.toHaveBeenCalled();
    sw.dispose();
  });

  it('the rise is the warning — contact during its first beat is still safe', async () => {
    const { Swamper } = await import('../src/entities/setpieces');
    const rooms = [floodRoom()];
    const { ctx, step } = hearingCtx(rooms);
    const sw = new Swamper();
    sw.spawn(ctx);
    const pos = (sw as unknown as { pos: { x: number; z: number } }).pos;
    ctx.player.pos.x = pos.x; ctx.player.pos.z = pos.z;
    ctx.player.vel.x = 1.4;
    step(sw, 20); // 1.0s — still rising, even on contact
    expect(ctx.damagePlayer).not.toHaveBeenCalled();
    step(sw, 40); // past the rise — the stirred wader gets it
    expect(ctx.damagePlayer).toHaveBeenCalledWith(25, 'swamper', expect.any(String));
    sw.dispose();
  });

  it('noise beyond the flood never reaches it; an open drain empties the room of it', async () => {
    const { Swamper } = await import('../src/entities/setpieces');
    const rooms = [floodRoom()];
    const { ctx, emit, step } = hearingCtx(rooms);
    ctx.player.pos.x = 0; ctx.player.pos.z = 6;
    const sw = new Swamper();
    sw.spawn(ctx);
    const pos = () => (sw as unknown as { pos: { x: number; z: number } }).pos;
    const start = { x: pos().x, z: pos().z };
    emit(200, 200); // far outside the room
    step(sw, 10);
    expect(Math.hypot(pos().x - start.x, pos().z - start.z)).toBeLessThan(1);
    sw.dispose();
    // drained — it leaves with the water
    const { ctx: ctx2, step: step2 } = hearingCtx(rooms, true);
    const sw2 = new Swamper();
    sw2.spawn(ctx2);
    step2(sw2, 3);
    expect(sw2.state).toBe('done');
    const captions = (ctx2.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /slips down the drain/.test(c))).toBe(true);
    sw2.dispose();
  });
});


describe('Grafter (sprint 256)', () => {
  it('the rise is the warning — a grafter risen at your feet cannot strike yet', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    // the u-lobby ambush from sprint 255: a closet where the far corner is
    // already inside kill range — without the grace this killed on frame 1.
    const room = {
      index: 0, templateId: 'u-lobby', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
      width: 4, depth: 4, spec: { width: 4, depth: 4, props: [] },
      doors: [], sockets: [], hidingSpots: [], scheduled: [],
    } as unknown as RoomInstance;
    const ctx = makeCtx([room], { currentRoomIndex: 0 });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const g = new Grafter();
    g.spawn(ctx);
    for (let i = 0; i < 20; i++) { ctx.now += 0.05; g.update(0.05); } // 1.0s
    expect(ctx.killPlayer).not.toHaveBeenCalled();
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; g.update(0.05); } // past the rise
    expect(ctx.killPlayer).toHaveBeenCalledWith('grafter', expect.any(String));
    g.dispose();
  });

  it('the rubble felt the crack — a stoop sighting drags it to the leaf (sprint 452)', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const room = {
      index: 0, templateId: 'u-lobby', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
      width: 9, depth: 9, spec: { width: 9, depth: 9, props: [] },
      doors: [], sockets: [], hidingSpots: [], scheduled: [],
    } as unknown as RoomInstance;
    const ctx = makeCtx([room], { currentRoomIndex: 0 });
    ctx.player.pos.x = 30; ctx.player.pos.z = 30; // unseen, a room over
    const g = new Grafter();
    g.spawn(ctx);
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; g.update(0.05); }
    const leaf = v3(3.6, 0, 0);
    const gp = (g as unknown as { pos: { x: number; z: number } }).pos;
    const d0 = Math.hypot(gp.x - leaf.x, gp.z - leaf.z);
    g.eyeTell!(v3(30, 0, 30), leaf);
    for (let i = 0; i < 200; i++) { ctx.now += 0.05; g.update(0.05); }
    const d1 = Math.hypot(gp.x - leaf.x, gp.z - leaf.z);
    expect(d1, 'the rubble camps the told leaf').toBeLessThan(Math.min(d0, 0.4));
    g.dispose();
  });

  it('reads the sign — killed hazards drag the rubble to the mark', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const room = {
      index: 0, templateId: 'u-lobby', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
      width: 9, depth: 9, spec: { width: 9, depth: 9, props: [] },
      doors: [], sockets: [], hidingSpots: [], scheduled: [],
    } as unknown as RoomInstance;
    const ctx = makeCtx([room], { currentRoomIndex: 0 });
    // the player hides in the far corner — the grafter never sees them
    ctx.player.pos.x = -3.2; ctx.player.pos.z = -3.2;
    (ctx.player as unknown as { hiddenSpot: unknown }).hiddenSpot = { id: 'cab' };
    const evidence = { pos: v3(2.8, 0, 2.8), room: 0, kind: 'wire' as const, t: 0, readBy: [] as string[] };
    ctx.hazardEvidence = (key, x, z, r) => {
      const out = !evidence.readBy.includes(key)
        && Math.hypot(evidence.pos.x - x, evidence.pos.z - z) < r ? [evidence] : [];
      for (const e of out) e.readBy.push(key);
      return out;
    };
    const g = new Grafter();
    g.spawn(ctx);
    let closest = Infinity;
    for (let i = 0; i < 300; i++) {
      ctx.now += 0.05; g.update(0.05);
      const gp = (g as unknown as { pos: { x: number; z: number } }).pos;
      closest = Math.min(closest, Math.hypot(gp.x - evidence.pos.x, gp.z - evidence.pos.z));
    }
    expect(closest, 'the rubble drags to the killed hazard').toBeLessThan(0.6);
    expect(evidence.readBy).toContain('grafter:0');
    g.dispose();
  });

  it('chases ghosts — stale sign names itself in the drag (sprint 270)', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const room = {
      index: 0, templateId: 'u-lobby', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
      width: 9, depth: 9, spec: { width: 9, depth: 9, props: [] },
      doors: [], sockets: [], hidingSpots: [], scheduled: [],
    } as unknown as RoomInstance;
    const ctx = makeCtx([room], { currentRoomIndex: 0 });
    ctx.player.pos.x = -3.2; ctx.player.pos.z = -3.2;
    (ctx.player as unknown as { hiddenSpot: unknown }).hiddenSpot = { id: 'cab' };
    const evidence = { pos: v3(2.8, 0, 2.8), room: 0, kind: 'wire' as const, t: -1, readBy: [] as string[], old: true };
    ctx.hazardEvidence = (key, x, z, r) => {
      const out = !evidence.readBy.includes(key)
        && Math.hypot(evidence.pos.x - x, evidence.pos.z - z) < r ? [evidence] : [];
      for (const e of out) e.readBy.push(key);
      return out;
    };
    const g = new Grafter();
    g.spawn(ctx);
    for (let i = 0; i < 60; i++) { ctx.now += 0.05; g.update(0.05); }
    const cues = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(cues.some((t) => /old mark/.test(t)), 'stale sign smells like stale sign').toBe(true);
    g.dispose();
  });

  it('the rubble hungers — two marks and it hunts in earnest (sprint 295)', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const room = {
      index: 0, templateId: 'u-lobby', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
      width: 9, depth: 9, spec: { width: 9, depth: 9, props: [] },
      doors: [], sockets: [], hidingSpots: [], scheduled: [],
    } as unknown as RoomInstance;
    const ctx = makeCtx([room], { currentRoomIndex: 0 });
    ctx.player.pos.x = -3.2; ctx.player.pos.z = -3.2;
    (ctx.player as unknown as { hiddenSpot: unknown }).hiddenSpot = { id: 'cab' };
    ctx.player.protection = 'hidden'; // hidden reads as furniture — the drag must win, not the notice
    const records = [
      { pos: v3(2.8, 0, 2.8), room: 0, kind: 'wire' as const, t: 0, readBy: [] as string[] },
      { pos: v3(-1.5, 0, 3.0), room: 0, kind: 'line' as const, t: 0, readBy: [] as string[] },
    ];
    ctx.hazardEvidence = (key, x, z, r) => {
      // one mark per call — see sprint 293's note about burn-unseen
      const out = records.filter((e) => !e.readBy.includes(key)
        && Math.hypot(e.pos.x - x, e.pos.z - z) < r).slice(0, 1);
      for (const e of out) e.readBy.push(key);
      return out;
    };
    const g = new Grafter();
    g.spawn(ctx);
    const gi = g as unknown as { pos: { x: number; z: number }; markReads: number };
    for (let i = 0; i < 900 && gi.markReads < 2; i++) { ctx.now += 0.05; g.update(0.05); }
    expect(gi.markReads, 'it weighed both marks').toBeGreaterThanOrEqual(2);
    const cues = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(cues.some((t) => /hunts in earnest/.test(t)), 'appetite announces once').toBe(true);
    // drag speed is the fair measure: roam picks are lifeT-seeded and
    // diverge between instances. Same spot, same mark, count frames.
    const b = new Grafter();
    b.spawn(ctx); // grafter:0 already read both marks — it learns nothing
    const bi = b as unknown as { pos: { x: number; z: number }; markReads: number };
    const drag = (hunter: Grafter, hp: { x: number; z: number }) => {
      hp.x = 0; hp.z = 0;
      const mark = { pos: v3(0, 0, -4), room: 0, kind: 'wire' as const, t: 0, readBy: [] as string[] };
      records.push(mark);
      (hunter as unknown as { scentT: number }).scentT = 0; // poll next frame, not in 1.6s
      let frames = 0;
      while (frames++ < 800 && Math.hypot(hp.x - mark.pos.x, hp.z - mark.pos.z) > 0.4) {
        ctx.now += 0.05; hunter.update(0.05);
      }
      return frames;
    };
    const fE = drag(g, gi.pos);
    const fB = drag(b, bi.pos);
    expect(fE, `eager drag ${fE}f vs baseline ${fB}f`).toBeLessThan(fB * 0.95);
    g.dispose();
    b.dispose();
  });

  it('the tally\'s mark is on the sign — an owed name teaches double (sprint 363)', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const room = {
      index: 0, templateId: 'u-lobby', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
      width: 9, depth: 9, spec: { width: 9, depth: 9, props: [] },
      doors: [], sockets: [], hidingSpots: [], scheduled: [],
    } as unknown as RoomInstance;
    const ctx = makeCtx([room], { currentRoomIndex: 0, claimsOwed: () => 2 });
    ctx.player.pos.x = -3.2; ctx.player.pos.z = -3.2;
    (ctx.player as unknown as { hiddenSpot: unknown }).hiddenSpot = { id: 'cab' };
    ctx.player.protection = 'hidden';
    const records = [
      { pos: v3(2.8, 0, 2.8), room: 0, kind: 'wire' as const, t: 0, readBy: [] as string[] },
    ];
    ctx.hazardEvidence = (key, x, z, r) => {
      const out = records.filter((e) => !e.readBy.includes(key)
        && Math.hypot(e.pos.x - x, e.pos.z - z) < r).slice(0, 1);
      for (const e of out) e.readBy.push(key);
      return out;
    };
    const g = new Grafter();
    g.spawn(ctx);
    const gi = g as unknown as { markReads: number };
    for (let i = 0; i < 900 && gi.markReads < 2; i++) { ctx.now += 0.05; g.update(0.05); }
    // ONE mark under an owed tally teaches what two strangers' marks
    // used to — markReads 2 == eager in a single read
    expect(gi.markReads, 'one tally-named mark weighs two').toBeGreaterThanOrEqual(2);
    const cues = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(cues.some((t) => /tally's mark is on this sign/.test(t)),
      'the read names whose hands').toBe(true);
    g.dispose();
  });
});

describe('Grafter seam coin (sprints 476-480)', () => {
  const seamRoom = (): RoomInstance => ({
    index: 0, templateId: 'u-lobby', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 9, depth: 9, spec: { width: 9, depth: 9, props: [] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance);

  it('the pouch rides the hand — fed coin spills as floor loot on stagger', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const ctx = makeCtx([seamRoom()], { currentRoomIndex: 0 });
    ctx.player.pos.x = -3.2; ctx.player.pos.z = -3.2;
    ctx.player.protection = 'hidden';
    ctx.spillPouch = vi.fn();
    const g = new Grafter();
    g.spawn(ctx);
    const leaf = v3(3.6, 0, 0);
    g.takeCoin(1, leaf);   // a marked coin
    g.takeCoin(0, leaf);   // a clean one
    expect((g as unknown as { pouch: number }).pouch, 'two coins ride the pouch').toBe(2);
    g.stagger(4);
    expect(ctx.spillPouch, 'the spill hands the pouch to the floor').toHaveBeenCalledWith(expect.anything(), 2, 1);
    expect((g as unknown as { pouch: number }).pouch, 'the pouch is empty after').toBe(0);
    g.dispose();
  });

  it('the settle spills too — a pouch on its back sinks as floor loot (s501)', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const ctx = makeCtx([seamRoom()], { currentRoomIndex: 0 });
    ctx.player.pos.x = -3.2; ctx.player.pos.z = -3.2;
    ctx.player.protection = 'hidden';
    ctx.spillPouch = vi.fn();
    const g = new Grafter();
    g.spawn(ctx);
    const leaf = v3(3.6, 0, 0);
    g.takeCoin(1, leaf);
    g.takeCoin(0, leaf);
    // it settles peacefully — no stagger — and the coin must not vanish:
    // the under relocates, never destroys (dispose() runs onDone)
    g.dispose();
    expect(ctx.spillPouch, 'a settled grafter leaves its coin on the floor')
      .toHaveBeenCalledWith(expect.anything(), 2, 1);
    expect((g as unknown as { pouch: number }).pouch, 'the pouch is empty after').toBe(0);
  });

  it('a fed hand remembers — the paid leaf keeps its camp past a sighting', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const ctx = makeCtx([seamRoom()], { currentRoomIndex: 0 });
    ctx.player.pos.x = -3.2; ctx.player.pos.z = -3.2;
    ctx.player.protection = 'hidden';
    const g = new Grafter();
    g.spawn(ctx);
    const leaf = v3(3.6, 0, 0);
    const t0 = ctx.now;
    g.takeCoin(0, leaf);
    const camp = (g as unknown as { crackCampUntil: number }).crackCampUntil;
    expect(camp - t0, 'a paid hand camps past the eye\'s 14s').toBeGreaterThanOrEqual(22);
    g.dispose();
  });

  it('the smell is room-locked — bait under a foreign leaf is a lie', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const far = {
      index: 1, templateId: 'u-lobby', origin: { x: 30, y: 0, z: 0 }, yaw: 0,
      width: 9, depth: 9, spec: { width: 9, depth: 9, props: [] },
      doors: [], sockets: [], hidingSpots: [], scheduled: [],
    } as unknown as RoomInstance;
    const ctx = makeCtx([seamRoom(), far], { currentRoomIndex: 0 });
    ctx.player.pos.x = -3.2; ctx.player.pos.z = -3.2;
    ctx.player.protection = 'hidden'; // a seen player at the origin is lunch before it settles
    const g = new Grafter();
    g.spawn(ctx);
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; g.update(0.05); } // settle into engage
    expect(g.seamBaitable!(v3(3.6, 0, 0)), 'its own room\'s leaf takes the coin').toBe(true);
    expect(g.seamBaitable!(v3(33.6, 0, 0)), 'a foreign leaf cannot — the hand is room-locked').toBe(false);
    g.dispose();
  });

  it('the coin\'s smell shadows the payer — the pouch reads you past the eyes', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const ctx = makeCtx([seamRoom()], { currentRoomIndex: 0 });
    // the player stands far past seeRange but inside the hand's room
    ctx.player.pos.x = 3.8; ctx.player.pos.z = 3.8;
    const g = new Grafter();
    g.spawn(ctx);
    const gi = g as unknown as { pos: { x: number; z: number }; target: { x: number; z: number }; pouch: number };
    gi.pos.x = -3.5; gi.pos.z = -3.5; // ~10m away — no eye reaches this
    gi.pouch = 1;
    for (let i = 0; i < 8; i++) { ctx.now += 0.05; g.update(0.05); }
    expect(Math.hypot(gi.target.x - 3.8, gi.target.z - 3.8), 'the pouch names the payer').toBeLessThan(0.01);
    g.dispose();
  });

  it('the under reclaims its spill — quiet hands drag back for the pouch (s481)', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const ctx = makeCtx([seamRoom()], { currentRoomIndex: 0 });
    ctx.player.pos.x = -30; ctx.player.pos.z = -30; // nowhere near — quiet room
    const g = new Grafter();
    g.spawn(ctx);
    const gi = g as unknown as { pos: { x: number; z: number }; target: { x: number; z: number }; pouch: number };
    gi.pos.x = -1.5; gi.pos.z = -1.5;
    const pile = { x: 2.5, z: 2.5 };
    ctx.nearestSpill = () => ({ ...pile, kind: 'pouch' as const });
    ctx.scavengeSpill = vi.fn((x: number, z: number) =>
      Math.hypot(x - pile.x, z - pile.z) < 0.55 ? { kind: 'pouch' as const, n: 2, hot: 1 } : null);
    for (let i = 0; i < 400 && gi.pouch === 0; i++) { ctx.now += 0.05; g.update(0.05); }
    expect(Math.hypot(gi.target.x - pile.x, gi.target.z - pile.z), 'the spill pulled its target').toBeLessThan(0.01);
    expect(ctx.scavengeSpill, 'the pile was claimed on arrival').toHaveBeenCalled();
    expect(gi.pouch, 'the pouch came back onto the hand').toBe(2);
    g.dispose();
  });

  it('full hands leave the wire — a carrier passes a spilled coil (s481)', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const ctx = makeCtx([seamRoom()], { currentRoomIndex: 0 });
    ctx.player.pos.x = -30; ctx.player.pos.z = -30;
    const g = new Grafter();
    g.spawn(ctx);
    const gi = g as unknown as { pos: { x: number; z: number }; carrying: number };
    // outside every room: it can't plant (the coil unwinds only where
    // the living walk — pr -1 ≠ the player's room), so it keeps hauling
    gi.pos.x = -100; gi.pos.z = -100;
    gi.carrying = 1; // already hauling — a coil underfoot stays
    const pile = { x: 1.2, z: 1.2 };
    ctx.nearestSpill = (_x: number, _z: number, _d: number, kinds?: string[]) =>
      kinds?.includes('coil') ? { ...pile, kind: 'coil' as const } : null;
    ctx.scavengeSpill = vi.fn(() => null); // coil:false path never fires
    for (let i = 0; i < 40; i++) { ctx.now += 0.05; g.update(0.05); }
    // a carrier doesn't read the kinds it can't hold — the wire never
    // pulls it, never gets asked about (the stoop would re-arm forever)
    expect(ctx.scavengeSpill, 'full hands never stoop over wire').not.toHaveBeenCalled();
    g.dispose();
  });

  it('bait rings louder than the leaf — a placed pile pulls it off the camp (s486)', async () => {
    const { Grafter } = await import('../src/entities/setpieces');
    const ctx = makeCtx([seamRoom()], { currentRoomIndex: 0 });
    ctx.player.pos.x = -30; ctx.player.pos.z = -30; // quiet room
    const g = new Grafter();
    g.spawn(ctx);
    const gi = g as unknown as {
      pos: { x: number; z: number }; target: { x: number; z: number };
      crackCampUntil: number; pouch: number;
    };
    gi.pos.x = -1.5; gi.pos.z = -1.5;
    ctx.now = 100;
    gi.crackCampUntil = 140; // it is paid to hold a leaf — nothing ordinary moves it
    const spill = { x: 2.5, z: 2.5 };
    // ordinary spill: the camp wins — it does NOT drag for it
    ctx.nearestSpill = () => ({ ...spill, kind: 'pouch' as const });
    for (let i = 0; i < 20; i++) { ctx.now += 0.05; g.update(0.05); }
    const held = Math.hypot(gi.target.x - spill.x, gi.target.z - spill.z);
    expect(held, 'the camp ignores a plain pile').toBeGreaterThan(0.5);
    // placed bait: the ring pulls it off the leaf
    ctx.nearestSpill = () => ({ ...spill, kind: 'pouch' as const, bait: true });
    ctx.scavengeSpill = vi.fn((x: number, z: number) =>
      Math.hypot(x - spill.x, z - spill.z) < 0.55 ? { kind: 'pouch' as const, n: 1, hot: 0 } : null);
    for (let i = 0; i < 40 && gi.pouch === 0; i++) { ctx.now += 0.05; g.update(0.05); }
    expect(Math.hypot(gi.target.x - spill.x, gi.target.z - spill.z), 'bait broke the camp').toBeLessThan(0.01);
    g.dispose();
  });
});


describe('HazardField snares (sprint 257)', () => {
  const snareRoom = (flooded: boolean): RoomInstance => ({
    index: 0, templateId: 'u-corridor', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 6, depth: 12, spec: { width: 6, depth: 12, props: [] },
    doors: [], hidingSpots: [], scheduled: [], flooded,
    sockets: [{ kind: 'hazard', pos: v3(1.5, 0, 0), yaw: 0, filled: false, meta: { hazard: 'snare', submerged: true } }],
  } as unknown as RoomInstance);

  it('an upright stride trips the paper seal — root, blood, and a loud carry', async () => {
    const { HazardField } = await import('../src/entities/room');
    const rooms = [snareRoom(false)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 0 });
    const h = new HazardField();
    h.addFromRoom(rooms[0]);
    ctx.player.pos.x = 1.5; ctx.player.pos.z = 0;
    h.update(ctx, 0.05);
    expect(ctx.damagePlayer).toHaveBeenCalledWith(8, 'hazard', expect.any(String));
    expect(ctx.player.rootedUntil).toBeGreaterThan(ctx.now);
    const emits = (ctx.sound.emit as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(emits.some((e) => e.intensity >= 0.7 && e.category === 'impact')).toBe(true);
  });

  it('a crouched wader feels submerged wire and steps over — the snare stays armed', async () => {
    const { HazardField } = await import('../src/entities/room');
    const rooms = [snareRoom(true)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 0, isRoomDrained: () => false });
    const h = new HazardField();
    h.addFromRoom(rooms[0]);
    ctx.player.pos.x = 1.5; ctx.player.pos.z = 0;
    ctx.player.crouching = true;
    h.update(ctx, 0.05);
    expect(ctx.damagePlayer).not.toHaveBeenCalled();
    expect((h.snares[0] as { armed: boolean }).armed).toBe(true);
    const emits = (ctx.sound.emit as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(emits.some((e) => e.intensity <= 0.3 && /wire underfoot/.test(String(e.caption)))).toBe(true);
    // but an upright wade over the same wire trips it
    ctx.player.crouching = false;
    h.update(ctx, 0.05);
    expect(ctx.damagePlayer).toHaveBeenCalledWith(8, 'hazard', expect.any(String));
  });
});

describe('HazardField electrified water (sprint 260)', () => {
  const arcRoom = (flooded: boolean): RoomInstance => ({
    index: 0, templateId: 'u-server', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 8, depth: 10, spec: { width: 8, depth: 10, props: [] },
    doors: [], hidingSpots: [], scheduled: [], flooded, darkRoom: false,
    sockets: [{ kind: 'hazard', pos: v3(1.5, 0, 0), yaw: 0, filled: false, meta: { hazard: 'puddle', electrified: true } }],
  } as unknown as RoomInstance);

  it('live water ticks blood and hums before it bites', async () => {
    const { HazardField } = await import('../src/entities/room');
    const rooms = [arcRoom(true)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 0, isRoomDrained: () => false });
    const h = new HazardField();
    h.addFromRoom(rooms[0]);
    // just outside the arc's reach — it warns, doesn't hurt
    ctx.player.pos.x = 3.0; ctx.player.pos.z = 0;
    h.update(ctx, 1);
    expect(ctx.damagePlayer).not.toHaveBeenCalled();
    expect(ctx.cue).toHaveBeenCalledWith('steam-hiss', expect.anything(), '[the water ahead hums amber]', expect.anything());
    // inside — it ticks
    ctx.player.pos.x = 1.5;
    h.update(ctx, 1);
    expect(ctx.damagePlayer).toHaveBeenCalledWith(4, 'hazard', expect.stringContaining('Electrified'));
  });

  it('the drain takes the arc with the water', async () => {
    const { HazardField } = await import('../src/entities/room');
    const rooms = [arcRoom(true)];
    const ctx = makeCtx(rooms, { currentRoomIndex: 0, isRoomDrained: () => true });
    const h = new HazardField();
    h.addFromRoom(rooms[0]);
    ctx.player.pos.x = 1.5; ctx.player.pos.z = 0;
    h.update(ctx, 1);
    expect(ctx.damagePlayer).not.toHaveBeenCalled();
    expect(ctx.cue).not.toHaveBeenCalled();
  });
});

describe('HazardField steam lines (sprint 261)', () => {
  const steamRoom = (): RoomInstance => ({
    index: 0, templateId: 'maint-boiler', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 8, depth: 8, spec: { width: 8, depth: 8, props: [] },
    doors: [], hidingSpots: [], scheduled: [],
    sockets: [{ kind: 'hazard', pos: v3(1.5, 0, 0), yaw: 0, filled: false, meta: { hazard: 'steam' } }],
  } as unknown as RoomInstance);

  it('the line hums before it vents, and the vent ticks blood', async () => {
    const { HazardField } = await import('../src/entities/room');
    const rooms = [steamRoom()];
    const ctx = makeCtx(rooms, { currentRoomIndex: 0 });
    const h = new HazardField();
    h.addFromRoom(rooms[0]);
    const st = h.steams[0];
    ctx.player.pos.x = 3.5; ctx.player.pos.z = 0; // in the warn ring
    st.phase = st.cycle - 1.0; // last 1.2s of the cycle — the hum
    h.update(ctx, 0.02);
    expect(ctx.damagePlayer).not.toHaveBeenCalled();
    expect(ctx.cue).toHaveBeenCalledWith('steam-hiss', expect.anything(), expect.stringContaining('about to vent'), expect.anything());
    // the vent opens — step inside and it ticks
    ctx.player.pos.x = 1.5;
    st.phase = 0.2;
    h.update(ctx, 0.02);
    expect(ctx.damagePlayer).toHaveBeenCalledWith(6, 'hazard', expect.stringContaining('Steam'));
  });

  it('idle phases are safe — and a bled line is dead metal', async () => {
    const { HazardField } = await import('../src/entities/room');
    const rooms = [steamRoom()];
    const ctx = makeCtx(rooms, { currentRoomIndex: 0 });
    const h = new HazardField();
    h.addFromRoom(rooms[0]);
    const st = h.steams[0];
    ctx.player.pos.x = 1.5; ctx.player.pos.z = 0;
    st.phase = st.cycle * 0.6; // mid-idle
    h.update(ctx, 0.02);
    expect(ctx.damagePlayer).not.toHaveBeenCalled();
    st.dead = true;
    st.phase = 0.2; // back in blast — dead lines don't fire
    h.update(ctx, 0.02);
    expect(ctx.damagePlayer).not.toHaveBeenCalled();
  });
});

describe('old sign (sprint 266)', () => {
  it('spent hazards load dead and leave readable old sign', async () => {
    const { HazardField } = await import('../src/entities/room');
    const room = {
      index: 0, templateId: 'maint-boiler', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
      width: 8, depth: 8, spec: { width: 8, depth: 8, props: [] },
      doors: [], hidingSpots: [], scheduled: [],
      sockets: [
        { kind: 'hazard', pos: v3(1.5, 0, 0), yaw: 0, filled: false, meta: { hazard: 'steam', spent: true } },
        { kind: 'hazard', pos: v3(-1.5, 0, 0), yaw: 0, filled: false, meta: { hazard: 'snare', spent: true } },
      ],
    } as unknown as RoomInstance;
    const ctx = makeCtx([room], { currentRoomIndex: 0 });
    const h = new HazardField();
    h.addFromRoom(room);
    expect(h.steams[0].dead, 'a spent line is dead metal').toBe(true);
    expect(h.snares[0].armed, 'a sprung wire stays sprung').toBe(false);
    expect(h.evidence.filter((e) => e.old).length).toBe(2);
    // walking to the mark reads it — once
    ctx.player.pos.x = 1.5; ctx.player.pos.z = 0.4;
    h.update(ctx, 0.02);
    expect(ctx.cue).toHaveBeenCalledWith('floor-creak', expect.anything(),
      expect.stringContaining('bled line'), expect.anything());
    h.update(ctx, 0.02);
    const calls = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.filter((c) => /bled line/.test(String(c[2])));
    expect(calls.length, 'old sign reads once').toBe(1);
  });
});

describe('the belt-wheel (sprint 267)', () => {
  const fanRoom = {
    index: 0, templateId: 'maint-boiler', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 8, depth: 8, spec: { width: 8, depth: 8, props: [] },
    doors: [], hidingSpots: [], scheduled: [],
    sockets: [{ kind: 'hazard', pos: v3(0, 0, 0), yaw: 0, filled: false, meta: { hazard: 'fan' } }],
  } as unknown as RoomInstance;

  it('the blades take standing flesh; a duck walks under them', async () => {
    const { HazardField } = await import('../src/entities/room');
    const ctx = makeCtx([fanRoom], { currentRoomIndex: 0 });
    const h = new HazardField();
    h.addFromRoom(fanRoom);
    ctx.player.pos.x = 0.4; ctx.player.pos.z = 0.3;
    (ctx.player as unknown as { crouching: boolean }).crouching = false;
    h.update(ctx, 0.02);
    expect(ctx.damagePlayer, 'a stander feeds the wheel').toHaveBeenCalledWith(
      7, 'hazard', expect.stringContaining('duck under'));
    (ctx.damagePlayer as ReturnType<typeof vi.fn>).mockClear();
    (ctx.player as unknown as { crouching: boolean }).crouching = true;
    h.update(ctx, 0.02);
    expect(ctx.damagePlayer, 'a duck clears the blades').not.toHaveBeenCalled();
  });
});

describe('the Hauler (sprint 271)', () => {
  const haulRoom = {
    index: 0, templateId: 'u-long-hall', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 8, depth: 14, spec: { width: 8, depth: 14, props: [] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;

  it('hauls a–b down the long axis, the sledge trailing the line', async () => {
    const { Hauler } = await import('../src/entities/setpieces');
    const ctx = makeCtx([haulRoom], { currentRoomIndex: 0 });
    const h = new Hauler();
    h.spawn(ctx);
    const z0 = (h as unknown as { pos: { x: number; z: number } }).pos.z;
    for (let i = 0; i < 120; i++) { ctx.now += 0.05; h.update(0.05); }
    const p1 = (h as unknown as { pos: { x: number; z: number } }).pos;
    const s1 = (h as unknown as { sledgePos: { x: number; z: number } }).sledgePos;
    expect(Math.abs(p1.z - z0), 'the haul advances').toBeGreaterThan(1);
    // the drag trails the heading by ~1.25m
    const behind = Math.hypot(s1.x - p1.x, s1.z - p1.z);
    expect(behind).toBeGreaterThan(1.0);
    expect(behind).toBeLessThan(1.6);
    h.dispose();
  });

  it('a crash near the sledge pulls the ram — once', async () => {
    const { Hauler } = await import('../src/entities/setpieces');
    const ctx = makeCtx([haulRoom], { currentRoomIndex: 0 });
    // wire the bus by hand — the ctx spy only records emits
    const listeners: ((e: { x: number; y: number; z: number; intensity: number; category: string; caption: string }) => void)[] = [];
    ctx.sound.on = ((fn: never) => { listeners.push(fn); return () => {}; }) as never;
    const h = new Hauler();
    h.spawn(ctx);
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; h.update(0.05); } // past the rise
    // stand on the haul line, bang the boards beside the sledge
    const hp = (h as unknown as { pos: { x: number; z: number } }).pos;
    ctx.player.pos.x = hp.x; ctx.player.pos.z = hp.z + 1.0;
    for (const fn of listeners) fn({ x: hp.x, y: 0.3, z: hp.z, intensity: 0.7, category: 'impact', caption: '[slam]' });
    for (let i = 0; i < 60; i++) { ctx.now += 0.05; h.update(0.05); }
    expect(ctx.damagePlayer, 'the sledge team rams the sound').toHaveBeenCalledWith(
      25, 'hauler', expect.any(String));
    const hits = (ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1] === 'hauler');
    expect(hits.length, 'one ram per rouse').toBe(1);
    h.dispose();
  });

  it('the work-lamp rides the tail — stripping it darks the drag for good', async () => {
    const { Hauler } = await import('../src/entities/setpieces');
    const ctx = makeCtx([haulRoom], { currentRoomIndex: 0 });
    const h = new Hauler();
    h.spawn(ctx);
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; h.update(0.05); }
    // the lamp hangs off the sledge's tail, ~0.62m behind the drag point
    const s1 = (h as unknown as { sledgePos: { x: number; z: number } }).sledgePos;
    const l1 = (h as unknown as { lampPos: { x: number; z: number } }).lampPos;
    expect(Math.hypot(l1.x - s1.x, l1.z - s1.z)).toBeGreaterThan(0.4);
    expect(Math.hypot(l1.x - s1.x, l1.z - s1.z)).toBeLessThan(0.9);
    expect(h.lampLit).toBe(true);
    h.stripLamp();
    expect(h.lampLit).toBe(false);
    const cues = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(cues.some((c) => c.includes('goes dark'))).toBe(true);
    h.dispose();
  });

  it('a lit room scavenges the lamp back on; dead mains keep the dark', async () => {
    const { Hauler } = await import('../src/entities/setpieces');
    // lit room (no darkRoom flag): strip → wait >3.5s → the team wires a bulb on
    const ctxLit = makeCtx([haulRoom], { currentRoomIndex: 0 });
    const h1 = new Hauler();
    h1.spawn(ctxLit);
    for (let i = 0; i < 30; i++) { ctxLit.now += 0.05; h1.update(0.05); }
    h1.stripLamp();
    expect(h1.lampLit).toBe(false);
    for (let i = 0; i < 90; i++) { ctxLit.now += 0.05; h1.update(0.05); } // 4.5s
    expect(h1.relit, 'the scavenge happens once, under light').toBe(true);
    expect(h1.lampLit, 'the lamp fights on').toBe(true);
    const cues1 = (ctxLit.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(cues1.some((c) => c.includes('scavenges a bulb'))).toBe(true);
    // the second strip is the last — the scavenged bulb pays and the dark holds
    h1.stripLamp();
    expect(h1.lampLit).toBe(false);
    for (let i = 0; i < 90; i++) { ctxLit.now += 0.05; h1.update(0.05); }
    expect(h1.lampLit, 'no second scavenge').toBe(false);
    const cues2 = (ctxLit.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(cues2.some((c) => c.includes('scavenged bulb comes free'))).toBe(true);
    h1.dispose();
    // dead mains: the drag stays dark
    const darkRoom = { ...haulRoom, darkRoom: true } as unknown as RoomInstance;
    const ctxDark = makeCtx([darkRoom], { currentRoomIndex: 0 });
    const h2 = new Hauler();
    h2.spawn(ctxDark);
    for (let i = 0; i < 30; i++) { ctxDark.now += 0.05; h2.update(0.05); }
    h2.stripLamp();
    for (let i = 0; i < 90; i++) { ctxDark.now += 0.05; h2.update(0.05); }
    expect(h2.lampLit, 'nothing to scavenge where the mains are dead').toBe(false);
    expect(h2.relit).toBe(false);
    h2.dispose();
  });
});

describe('the Laundress (sprint 272)', () => {
  const laundryRoom = {
    index: 0, templateId: 'u-server', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 9, depth: 11, flooded: true,
    spec: { width: 9, depth: 11, props: [{ kind: 'pipeManifold', x: 2.5, z: 3.0, yaw: 0 }] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;

  it('keeps her basin — a hand on the crank is answered', async () => {
    const { Laundress } = await import('../src/entities/setpieces');
    const ctx = makeCtx([laundryRoom], { currentRoomIndex: 0, isRoomDrained: () => false });
    const w = new Laundress();
    w.spawn(ctx);
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; w.update(0.05); } // past the rise
    expect(w.guarding, 'she holds the drain').toBe(true);
    const dp = (w as unknown as { drainPos: { x: number; z: number } }).drainPos;
    w.aggravate(v3(dp.x + 0.4, 0, dp.z)); // a hand on the crank, within reach
    expect(ctx.damagePlayer, 'she takes the hand').toHaveBeenCalledWith(
      15, 'laundress', expect.any(String));
    w.aggravate(v3(dp.x + 0.4, 0, dp.z)); // still biting cooldown — once
    expect((ctx.damagePlayer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    w.dispose();
  });

  it('a splash pulls her off the basin, then she returns to it', async () => {
    const { Laundress } = await import('../src/entities/setpieces');
    const ctx = makeCtx([laundryRoom], { currentRoomIndex: 0, isRoomDrained: () => false });
    const listeners: ((e: { x: number; y: number; z: number; intensity: number; category: string; caption: string }) => void)[] = [];
    ctx.sound.on = ((fn: never) => { listeners.push(fn); return () => {}; }) as never;
    const w = new Laundress();
    w.spawn(ctx);
    const wp = (w as unknown as { pos: { x: number; z: number } }).pos;
    // a splash across the room — close enough to worry her (aim inside the 9-wide room)
    for (const fn of listeners) fn({ x: wp.x - 3, y: 0.3, z: wp.z, intensity: 0.6, category: 'impact', caption: '[slam]' });
    expect(w.guarding, 'the basin is unwatched').toBe(false);
    for (let i = 0; i < 150; i++) { ctx.now += 0.05; w.update(0.05); } // ~7.5s: out, sniff, return
    expect(w.guarding, 'nothing at the splash — back to work').toBe(true);
    w.dispose();
  });

  it('rides the water out when the room drains', async () => {
    const { Laundress } = await import('../src/entities/setpieces');
    let drained = false;
    const ctx = makeCtx([laundryRoom], { currentRoomIndex: 0, isRoomDrained: () => drained });
    const w = new Laundress();
    w.spawn(ctx);
    drained = true;
    ctx.now += 0.05; w.update(0.05);
    expect(w.state, 'the wash went down the drain').toBe('done');
  });

  it('hands on her basin while she works are bitten', async () => {
    const { Laundress } = await import('../src/entities/setpieces');
    const ctx = makeCtx([laundryRoom], { currentRoomIndex: 0, isRoomDrained: () => false });
    const w = new Laundress();
    w.spawn(ctx);
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; w.update(0.05); }
    const wp = (w as unknown as { pos: { x: number; z: number } }).pos;
    ctx.player.pos.x = wp.x + 0.4; ctx.player.pos.z = wp.z; // at the basin
    ctx.now += 0.05; w.update(0.05);
    expect(ctx.damagePlayer, 'she guards the wash').toHaveBeenCalledWith(
      15, 'laundress', expect.any(String));
    w.dispose();
  });

  it('a pilfered basket keens on her return — loud enough to feed hunters', async () => {
    const { Laundress } = await import('../src/entities/setpieces');
    const ctx = makeCtx([laundryRoom], { currentRoomIndex: 0, isRoomDrained: () => false });
    const listeners: ((e: { x: number; y: number; z: number; intensity: number; category: string; caption: string }) => void)[] = [];
    ctx.sound.on = ((fn: never) => { listeners.push(fn); return () => {}; }) as never;
    const w = new Laundress();
    w.spawn(ctx);
    const wp = (w as unknown as { pos: { x: number; z: number } }).pos;
    for (const fn of listeners) fn({ x: wp.x - 3, y: 0.3, z: wp.z, intensity: 0.6, category: 'impact', caption: '[slam]' });
    for (let i = 0; i < 40; i++) { ctx.now += 0.05; w.update(0.05); } // she's out sniffing
    expect(w.guarding).toBe(false);
    w.basketFull = false; // pilfered mid-window
    for (let i = 0; i < 140; i++) { ctx.now += 0.05; w.update(0.05); } // she returns
    expect(w.guarding, 'back to the basin').toBe(true);
    const emits = (ctx.sound.emit as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as { caption: string; intensity: number });
    const keen = emits.find((e) => /wail at the basin/.test(e.caption));
    expect(keen, 'the wash is lighter').toBeTruthy();
    expect(keen!.intensity, 'the keen carries').toBeGreaterThanOrEqual(0.55);
    w.dispose();
  });
});

describe('the Auditor (sprint 277)', () => {
  const deskRoom = {
    index: 0, templateId: 'u-records-cage', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 10, depth: 12,
    entryPos: { x: 0, y: 0, z: -6 }, exitPos: { x: 0, y: 0, z: 6 }, navNodes: [],
    spec: { width: 10, depth: 12, props: [{ kind: 'filing', x: 2.5, z: 3.0, yaw: 0 }] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;
  const hallRoom = {
    index: 1, templateId: 'u-corridor', origin: { x: 0, y: 0, z: 12 }, yaw: 0,
    width: 6, depth: 12,
    entryPos: { x: 0, y: 0, z: 7 }, exitPos: { x: 0, y: 0, z: 17 }, navNodes: [],
    spec: { width: 6, depth: 12, props: [] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;

  it('notes unpaid hands in his room — the ledger comes out', async () => {
    const { Auditor } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      claimsOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0; // in his room
    const a = new Auditor();
    a.spawn(ctx);
    for (let i = 0; i < 40; i++) { ctx.now += 0.05; a.update(0.05); }
    expect(a.demanded, 'the ledger opens').toBe(true);
    const add = ctx.addInteractable as ReturnType<typeof vi.fn>;
    expect(add.mock.calls.some((c) => (c[0] as { kind: string }).kind === 'audit'), 'the settle point registers').toBe(true);
    a.dispose();
  });

  it('walks the book after a debtor who leaves', async () => {
    const { Auditor } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      claimsOwed: () => 3,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const a = new Auditor();
    a.spawn(ctx);
    for (let i = 0; i < 40; i++) { ctx.now += 0.05; a.update(0.05); }
    expect(a.demanded).toBe(true);
    ctx.player.pos.x = 0; ctx.player.pos.z = 12; // slips into the next room, still owing
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; a.update(0.05); }
    expect(a.pursuing, 'the ledger walks').toBe(true);
    a.dispose();
  });

  it('his touch is a beating — the debt still stands', async () => {
    const { Auditor } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      claimsOwed: () => 3,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const a = new Auditor();
    a.spawn(ctx);
    for (let i = 0; i < 40; i++) { ctx.now += 0.05; a.update(0.05); } // past the rise
    ctx.player.pos.x = 0; ctx.player.pos.z = 12;
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; a.update(0.05); }
    expect(a.pursuing).toBe(true);
    // stand on his path — within the touch
    const wp = (a as unknown as { pos: { x: number; z: number } }).pos;
    ctx.player.pos.x = wp.x + 0.5; ctx.player.pos.z = wp.z;
    for (let i = 0; i < 20 && !ctx.damagePlayer.mock.calls.length; i++) { ctx.now += 0.05; a.update(0.05); }
    expect(ctx.damagePlayer, 'the clerk collects in kind').toHaveBeenCalledWith(
      10, 'auditor', expect.any(String));
    a.dispose();
  });

  it('the clerk\'s hands take it too — a named catch seizes (sprint 383)', async () => {
    const { Auditor } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      claimsOwed: () => 3,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.wanted = () => true;
    ctx.seizeMarked = vi.fn(() => true);
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const a = new Auditor();
    a.spawn(ctx);
    for (let i = 0; i < 40; i++) { ctx.now += 0.05; a.update(0.05); }
    ctx.player.pos.x = 0; ctx.player.pos.z = 12;
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; a.update(0.05); }
    expect(a.pursuing).toBe(true);
    const wp = (a as unknown as { pos: { x: number; z: number } }).pos;
    ctx.player.pos.x = wp.x + 0.5; ctx.player.pos.z = wp.z;
    for (let i = 0; i < 20 && !ctx.damagePlayer.mock.calls.length; i++) { ctx.now += 0.05; a.update(0.05); }
    expect(ctx.damagePlayer).toHaveBeenCalledWith(10, 'auditor', expect.any(String));
    expect(ctx.seizeMarked, 'the tally\'s own clerk strips the marked take').toHaveBeenCalled();
    a.dispose();
    // a stranger keeps his pockets — no seize while the boards don't name him
    const ctx2 = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      claimsOwed: () => 3,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx2.wanted = () => false;
    ctx2.seizeMarked = vi.fn(() => true);
    ctx2.player.pos.x = 0; ctx2.player.pos.z = 0;
    const a2 = new Auditor();
    a2.spawn(ctx2);
    for (let i = 0; i < 40; i++) { ctx2.now += 0.05; a2.update(0.05); }
    ctx2.player.pos.x = 0; ctx2.player.pos.z = 12;
    for (let i = 0; i < 30; i++) { ctx2.now += 0.05; a2.update(0.05); }
    const wp2 = (a2 as unknown as { pos: { x: number; z: number } }).pos;
    ctx2.player.pos.x = wp2.x + 0.5; ctx2.player.pos.z = wp2.z;
    for (let i = 0; i < 20 && !ctx2.damagePlayer.mock.calls.length; i++) { ctx2.now += 0.05; a2.update(0.05); }
    expect(ctx2.damagePlayer).toHaveBeenCalled();
    expect(ctx2.seizeMarked).not.toHaveBeenCalled();
    a2.dispose();
  });

  it('settled stamps square — ledger shut, pursuit off', async () => {
    const { Auditor } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      claimsOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const a = new Auditor();
    a.spawn(ctx);
    for (let i = 0; i < 40; i++) { ctx.now += 0.05; a.update(0.05); }
    expect(a.demanded).toBe(true);
    a.settled();
    expect(a.demanded).toBe(false);
    expect(a.pursuing).toBe(false);
    const rm = ctx.removeInteractable as ReturnType<typeof vi.fn>;
    expect(rm.mock.calls.length, 'the settle point comes down').toBeGreaterThan(0);
    a.dispose();
  });

  it('rifle the tally drawer — hands in HIS book open it on the spot (sprint 304)', async () => {
    const { Auditor } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      claimsOwed: () => 0, // a clean ledger — the rummage itself is the crime
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 2.5; ctx.player.pos.z = 3.2; // hands at his desk
    const a = new Auditor();
    a.spawn(ctx);
    const add = ctx.addInteractable as ReturnType<typeof vi.fn>;
    expect(add.mock.calls.some((c) => (c[0] as { kind: string }).kind === 'tallyDrawer'),
      'the drawer registers at spawn').toBe(true);
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; a.update(0.05); }
    expect(a.demanded, 'no demand on clean hands').toBe(false);
    a.rifledTally();
    expect(a.demanded, 'the book slaps open at your name').toBe(true);
    expect(add.mock.calls.some((c) => (c[0] as { kind: string }).kind === 'audit'),
      'the settle point comes up').toBe(true);
    a.dispose();
  });
});

describe('the House Detective (sprint 278)', () => {
  const deskRoom = {
    index: 0, templateId: 'records-aisle', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 10, depth: 12,
    entryPos: { x: 0, y: 0, z: -6 }, exitPos: { x: 0, y: 0, z: 6 }, navNodes: [],
    spec: { width: 10, depth: 12, props: [{ kind: 'counter', x: 2.5, z: 3.0, yaw: 0 }] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;
  const hallRoom = {
    index: 1, templateId: 'corridor', origin: { x: 0, y: 0, z: 12 }, yaw: 0,
    width: 6, depth: 12,
    entryPos: { x: 0, y: 0, z: 7 }, exitPos: { x: 0, y: 0, z: 17 }, navNodes: [],
    spec: { width: 6, depth: 12, props: [] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;

  it('clocks a debtor over the slow look — the register comes out', async () => {
    const { Detective } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      heldOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const d = new Detective();
    d.spawn(ctx);
    // under 2.5s of shared presence — still just a suit at a desk
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(d.clocked, 'no clock yet').toBe(false);
    for (let i = 0; i < 40; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(d.clocked, 'the slow look lands').toBe(true);
    expect(d.warranted, 'the wire is live').toBe(true);
    const add = ctx.addInteractable as ReturnType<typeof vi.fn>;
    expect(add.mock.calls.some((c) => (c[0] as { kind: string }).kind === 'settle'), 'the settle point registers').toBe(true);
    d.dispose();
  });

  it('rifle the register drawer — your face files itself, no slow look (sprint 304)', async () => {
    const { Detective } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      heldOwed: () => 0, // a clean register — the rummage itself is the crime
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 2.5; ctx.player.pos.z = 3.2; // hands at his counter
    const d = new Detective();
    d.spawn(ctx);
    const add = ctx.addInteractable as ReturnType<typeof vi.fn>;
    expect(add.mock.calls.some((c) => (c[0] as { kind: string }).kind === 'registerDrawer'),
      'the drawer registers at spawn').toBe(true);
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(d.clocked, 'no clock on clean hands').toBe(false);
    d.rifledRegister();
    expect(d.clocked, 'your face files itself').toBe(true);
    expect(d.warranted, 'the wire is live already').toBe(true);
    d.dispose();
  });

  it('the eye at his crack opens the register on the spot (sprint 451)', async () => {
    const { Detective } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      heldOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const d = new Detective();
    d.spawn(ctx);
    for (let i = 0; i < 20; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(d.clocked, 'the slow look has barely started').toBe(false);
    // your kneel at his leaf is the closest look he'll ever get
    d.eyeTell!(v3(d.deskPos.x + 1, 0, d.deskPos.z));
    expect(d.clocked, 'the register opens on the sighting').toBe(true);
    expect(d.warranted, 'the wire is live').toBe(true);
    d.dispose();
  });

  it('a clean face at his crack is only a kneel (sprint 451)', async () => {
    const { Detective } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      heldOwed: () => 0, carriesMarked: () => false,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const d = new Detective();
    d.spawn(ctx);
    d.eyeTell!(v3(d.deskPos.x + 1, 0, d.deskPos.z));
    expect(d.clocked, 'nothing to file — the register stays shut').toBe(false);
    d.dispose();
  });

  it('phones ahead — each fresh room you enter rings for you', async () => {
    const { Detective } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      heldOwed: () => 3,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const d = new Detective();
    d.spawn(ctx);
    for (let i = 0; i < 60 && !d.warranted; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(d.warranted).toBe(true);
    const emit = ctx.sound.emit as ReturnType<typeof vi.fn>;
    emit.mockClear();
    ctx.player.pos.x = 0; ctx.player.pos.z = 12; // slips into the next room
    for (let i = 0; i < 10; i++) { ctx.now += 0.05; d.update(0.05); }
    // the ring is a real sound — no entity tag, so every ear hears it
    // and the wire betrays where it rang
    const ring = emit.mock.calls.find((c) =>
      /house phone rings/.test((c[0] as { caption?: string }).caption ?? ''));
    expect(ring, 'the room rings ahead of you').toBeTruthy();
    expect((ring![0] as { source?: string }).source,
      'the wire carries no entity tag — every ear hears it').toBeUndefined();
    d.dispose();
  });

  it('the wire only reaches so far — past its reach it goes quiet', async () => {
    const { Detective } = await import('../src/entities/setpieces');
    // roomOf() returns the array index — the far room must sit past +10
    const rooms = [deskRoom, hallRoom];
    for (let i = 2; i <= 12; i++) {
      rooms.push({ ...hallRoom, index: i, origin: { x: 0, y: 0, z: i * 12 },
        entryPos: { x: 0, y: 0, z: i * 12 - 6 }, exitPos: { x: 0, y: 0, z: i * 12 + 6 } } as unknown as RoomInstance);
    }
    const ctx = makeCtx(rooms, {
      currentRoomIndex: 0,
      heldOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const d = new Detective();
    d.spawn(ctx);
    for (let i = 0; i < 60 && !d.warranted; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(d.warranted).toBe(true);
    ctx.player.pos.x = 0; ctx.player.pos.z = 12 * 12; // inside array room 12
    for (let i = 0; i < 10; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(d.warranted, 'the wire goes quiet past its reach').toBe(false);
    d.dispose();
  });

  it('settled strikes your name — wire off, point down', async () => {
    const { Detective } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      heldOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const d = new Detective();
    d.spawn(ctx);
    for (let i = 0; i < 60 && !d.warranted; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(d.warranted).toBe(true);
    d.settled();
    expect(d.clocked).toBe(false);
    expect(d.warranted).toBe(false);
    const rm = ctx.removeInteractable as ReturnType<typeof vi.fn>;
    expect(rm.mock.calls.length, 'the settle point comes down').toBeGreaterThan(0);
    d.dispose();
  });

  it('pull the house line before the look — he files a face, but the wire never starts (sprint 309)', async () => {
    const { Detective } = await import('../src/entities/setpieces');
    const lineCut = vi.fn();
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      heldOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
      lineCut,
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const d = new Detective();
    d.spawn(ctx);
    const add = ctx.addInteractable as ReturnType<typeof vi.fn>;
    expect(add.mock.calls.some((c) => (c[0] as { kind: string }).kind === 'houseLine'),
      'the junction box registers at spawn').toBe(true);
    d.pulledLine();
    expect(lineCut, 'the dead wire is billed as damages').toHaveBeenCalledTimes(1);
    expect(d.clocked, 'his phone dies on the desk — a face is filed on the spot').toBe(true);
    expect(d.warranted, 'the broadcast never starts').toBe(false);
    const cue = ctx.cue as ReturnType<typeof vi.fn>;
    expect(cue.mock.calls.some((c) => /dead in his hand/.test(String(c[2]))),
      'the dead-line tell').toBe(true);
    // slip a fresh room — nothing rings
    const emit = ctx.sound.emit as ReturnType<typeof vi.fn>;
    emit.mockClear();
    ctx.player.pos.x = 0; ctx.player.pos.z = 12;
    for (let i = 0; i < 10; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(emit.mock.calls.some((c) => (c[0] as { source?: string }).source === 'detective'),
      'no ring on a dead line').toBe(false);
    // still settleable — the book stays open
    expect(add.mock.calls.some((c) => (c[0] as { kind: string }).kind === 'settle'),
      'the settle point still registers').toBe(true);
    d.settled();
    expect(d.clocked).toBe(false);
    d.dispose();
  });

  it('pull the house line mid-warrant — the broadcast dies, the book stays open', async () => {
    const { Detective } = await import('../src/entities/setpieces');
    const lineCut = vi.fn();
    const ctx = makeCtx([deskRoom, hallRoom], {
      currentRoomIndex: 0,
      heldOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
      lineCut,
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const d = new Detective();
    d.spawn(ctx);
    for (let i = 0; i < 60 && !d.warranted; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(d.warranted).toBe(true);
    d.pulledLine();
    expect(d.warranted, 'the wire dies mid-run').toBe(false);
    expect(d.clocked, 'he already had your face').toBe(true);
    expect(lineCut).toHaveBeenCalledTimes(1);
    // a second pull is a no-op — one-shot sabotage
    d.pulledLine();
    expect(lineCut).toHaveBeenCalledTimes(1);
    d.dispose();
  });

  it('outrunning a dead line still cools the face-ledger', async () => {
    const { Detective } = await import('../src/entities/setpieces');
    const rooms = [deskRoom, hallRoom];
    for (let i = 2; i <= 12; i++) {
      rooms.push({ ...hallRoom, index: i, origin: { x: 0, y: 0, z: i * 12 },
        entryPos: { x: 0, y: 0, z: i * 12 - 6 }, exitPos: { x: 0, y: 0, z: i * 12 + 6 } } as unknown as RoomInstance);
    }
    const ctx = makeCtx(rooms, {
      currentRoomIndex: 0,
      heldOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
      lineCut: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const d = new Detective();
    d.spawn(ctx);
    d.pulledLine();
    expect(d.clocked).toBe(true);
    expect(d.warranted).toBe(false);
    ctx.player.pos.x = 0; ctx.player.pos.z = 12 * 12; // past the reach
    for (let i = 0; i < 10; i++) { ctx.now += 0.05; d.update(0.05); }
    expect(d.clocked, 'the register cools even with the wire dead').toBe(false);
    d.dispose();
  });
});

describe('the Filer (sprint 297)', () => {
  const fileRoom = {
    index: 0, templateId: 'under-records', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 10, depth: 12,
    entryPos: { x: 0, y: 0, z: -6 }, exitPos: { x: 0, y: 0, z: 6 }, navNodes: [],
    spec: { width: 10, depth: 12, props: [{ kind: 'keyCabinet', x: 2.5, z: 3.0, yaw: 0 }] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;
  const hallRoom = {
    index: 1, templateId: 'corridor', origin: { x: 0, y: 0, z: 12 }, yaw: 0,
    width: 6, depth: 12,
    entryPos: { x: 0, y: 0, z: 7 }, exitPos: { x: 0, y: 0, z: 17 }, navNodes: [],
    spec: { width: 6, depth: 12, props: [] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;

  it('files your name over the slow look — the card comes out', async () => {
    const { Filer } = await import('../src/entities/setpieces');
    const ctx = makeCtx([fileRoom, hallRoom], {
      currentRoomIndex: 0,
      trailOwed: () => 3,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const f = new Filer();
    f.spawn(ctx);
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(f.filed, 'no card yet').toBe(false);
    for (let i = 0; i < 40; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(f.filed, 'the slow look lands').toBe(true);
    expect(f.posted, 'the runner is out').toBe(true);
    const add = ctx.addInteractable as ReturnType<typeof vi.fn>;
    expect(add.mock.calls.some((c) => (c[0] as { kind: string }).kind === 'square'), 'the square point registers').toBe(true);
    f.dispose();
  });

  it('sends a runner — each fresh room you enter listens for your step', async () => {
    const { Filer } = await import('../src/entities/setpieces');
    const ctx = makeCtx([fileRoom, hallRoom], {
      currentRoomIndex: 0,
      trailOwed: () => 4,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const f = new Filer();
    f.spawn(ctx);
    for (let i = 0; i < 60 && !f.posted; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(f.posted).toBe(true);
    const emit = ctx.sound.emit as ReturnType<typeof vi.fn>;
    emit.mockClear();
    ctx.player.pos.x = 0; ctx.player.pos.z = 12;
    for (let i = 0; i < 10; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(emit.mock.calls.some((c) => (c[0] as { source?: string }).source === 'filer'),
      'the room ahead already listens').toBe(true);
    f.dispose();
  });

  it('the word only travels so far — past its reach it goes quiet', async () => {
    const { Filer } = await import('../src/entities/setpieces');
    const rooms = [fileRoom, hallRoom];
    for (let i = 2; i <= 10; i++) {
      rooms.push({ ...hallRoom, index: i, origin: { x: 0, y: 0, z: i * 12 },
        entryPos: { x: 0, y: 0, z: i * 12 - 6 }, exitPos: { x: 0, y: 0, z: i * 12 + 6 } } as unknown as RoomInstance);
    }
    const ctx = makeCtx(rooms, {
      currentRoomIndex: 0,
      trailOwed: () => 3,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const f = new Filer();
    f.spawn(ctx);
    for (let i = 0; i < 60 && !f.posted; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(f.posted).toBe(true);
    ctx.player.pos.x = 0; ctx.player.pos.z = 10 * 12; // room 10 — past the 8-room reach
    for (let i = 0; i < 10; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(f.posted, 'the word goes quiet past its reach').toBe(false);
    f.dispose();
  });

  it('squared strikes your card — runner recalled, point down', async () => {
    const { Filer } = await import('../src/entities/setpieces');
    const ctx = makeCtx([fileRoom, hallRoom], {
      currentRoomIndex: 0,
      trailOwed: () => 3,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const f = new Filer();
    f.spawn(ctx);
    for (let i = 0; i < 60 && !f.posted; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(f.posted).toBe(true);
    f.squared();
    expect(f.filed).toBe(false);
    expect(f.posted).toBe(false);
    const rm = ctx.removeInteractable as ReturnType<typeof vi.fn>;
    expect(rm.mock.calls.length, 'the square point comes down').toBeGreaterThan(0);
    f.dispose();
  });

  it('a light trail is beneath notice — under 3 the drawer stays shut', async () => {
    const { Filer } = await import('../src/entities/setpieces');
    const ctx = makeCtx([fileRoom, hallRoom], {
      currentRoomIndex: 0,
      trailOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const f = new Filer();
    f.spawn(ctx);
    for (let i = 0; i < 90; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(f.filed, 'two questions never reach the index').toBe(false);
    f.dispose();
  });

  it('the docket registers at her station — pilferable, and outlives a square', async () => {
    const { Filer } = await import('../src/entities/setpieces');
    const ctx = makeCtx([fileRoom, hallRoom], {
      currentRoomIndex: 0,
      trailOwed: () => 3,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const f = new Filer();
    f.spawn(ctx);
    const add = ctx.addInteractable as ReturnType<typeof vi.fn>;
    expect(add.mock.calls.some((c) => (c[0] as { kind: string }).kind === 'docket'),
      'the drawer is on the station from the start').toBe(true);
    for (let i = 0; i < 60 && !f.posted; i++) { ctx.now += 0.05; f.update(0.05); }
    f.squared();
    const rm = ctx.removeInteractable as ReturnType<typeof vi.fn>;
    const removed = rm.mock.calls.map((c) => c[0] as string);
    expect(removed.some((id) => id.startsWith('square-')), 'the square point comes down').toBe(true);
    expect(removed.some((id) => id.startsWith('docket-')), 'the drawer survives a square').toBe(false);
    f.dispose();
    const removed2 = rm.mock.calls.map((c) => c[0] as string);
    expect(removed2.some((id) => id.startsWith('docket-')), 'the drawer comes down with her').toBe(true);
  });
});

describe('the watched hall (sprint 285)', () => {
  const camRoom = (dark: boolean) => ({
    index: 0, templateId: 'corr-straight', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 8, depth: 8, darkRoom: dark,
    spec: { width: 8, depth: 8, props: [{ kind: 'securityCam', x: 0, z: -2, yaw: 0 }] },
    doors: [], hidingSpots: [], scheduled: [], sockets: [],
  }) as unknown as RoomInstance;

  const pinCam = async (dark: boolean) => {
    const { HazardField } = await import('../src/entities/room');
    const h = new HazardField();
    const room = camRoom(dark);
    h.addFromRoom(room);
    const w = h.watchers[0];
    // pin the sweep to a fixed beam facing +z for the duration
    w.arc = 0; w.yaw = 0; w.half = 0.42; w.range = 6.5; w.lastReport = -10;
    const ctx = makeCtx([room], { currentRoomIndex: 0 });
    return { h, w, ctx };
  };
  const step = (h: InstanceType<typeof import('../src/entities/room').HazardField>,
    ctx: EntityCtx, x: number, z: number, n = 30) => {
    for (let i = 0; i < n; i++) { ctx.player.pos.x = x + Math.sin(i) * 0.02; ctx.player.pos.z = z; ctx.now += 0.05; h.update(ctx, 0.05); }
  };

  it('motion inside the cone settles the eye — it rings your position', async () => {
    const { h, ctx } = await pinCam(false);
    ctx.player.pos.x = 0; ctx.player.pos.z = 2;
    h.update(ctx, 0.05); // first frame seeds the motion trace
    step(h, ctx, 0, 2, 40); // ~2s of movement inside the beam
    expect(ctx.cue).toHaveBeenCalledWith('steam-hiss', expect.anything(),
      expect.stringContaining('settles on you'), expect.anything());
    const emit = ctx.sound.emit as ReturnType<typeof vi.fn>;
    const reports = emit.mock.calls.filter((c) => c[0].category === 'machine');
    expect(reports.length, 'the report rings your feet').toBeGreaterThan(0);
    expect(Math.hypot(reports[0][0].x - 0, reports[0][0].z - 2)).toBeLessThan(0.2);
  });

  it('a held settle files a witness line — once per eye, however often it reports', async () => {
    const { h, ctx } = await pinCam(false);
    const eyeFiled = vi.fn();
    ctx.eyeFiled = eyeFiled;
    ctx.player.pos.x = 0; ctx.player.pos.z = 2;
    h.update(ctx, 0.05);
    step(h, ctx, 0, 2, 170); // ~8.5s — long enough for two reports (5s cooldown)
    const emit = ctx.sound.emit as ReturnType<typeof vi.fn>;
    const reports = emit.mock.calls.filter((c) => c[0].category === 'machine');
    expect(reports.length, 'the eye reported more than once').toBeGreaterThanOrEqual(2);
    expect(eyeFiled, 'one line per eye — a re-report is not a new witness').toHaveBeenCalledTimes(1);
    expect(ctx.cue).toHaveBeenCalledWith('steam-hiss', expect.anything(),
      expect.stringContaining('your face is filed'), expect.anything());
  });

  it('a marked face settles faster — the register talks back', async () => {
    const framesToSettle = async (owed: number) => {
      const { h, ctx } = await pinCam(false);
      ctx.heldOwed = () => owed;
      ctx.player.pos.x = 0; ctx.player.pos.z = 2;
      h.update(ctx, 0.05);
      let f = 0;
      for (; f < 600; f++) {
        ctx.player.pos.x = Math.sin(f) * 0.02; ctx.player.pos.z = 2;
        ctx.now += 0.05; h.update(ctx, 0.05);
        if ((ctx.cue as ReturnType<typeof vi.fn>).mock.calls
          .some((c) => String(c[2]).includes('settles on you'))) break;
      }
      return { f, ctx };
    };
    const stranger = await framesToSettle(0);
    const marked = await framesToSettle(3);
    expect(marked.f, 'a filed face settles ~1.6x faster')
      .toBeLessThan(stranger.f * 0.85);
    expect(marked.ctx.cue).toHaveBeenCalledWith('steam-hiss', expect.anything(),
      expect.stringContaining('register talks back'), expect.anything());
    expect(stranger.ctx.cue).not.toHaveBeenCalledWith('steam-hiss', expect.anything(),
      expect.stringContaining('register talks back'), expect.anything());
    // one warn per marking — the flag holds across many reports
    const talks = (marked.ctx.cue as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => String(c[2]).includes('register talks back')).length;
    expect(talks).toBe(1);
  });

  it('still feet pass it — no settle, no report', async () => {
    const { h, ctx } = await pinCam(false);
    ctx.player.pos.x = 0; ctx.player.pos.z = 2;
    for (let i = 0; i < 60; i++) { ctx.now += 0.05; h.update(ctx, 0.05); }
    const emit = ctx.sound.emit as ReturnType<typeof vi.fn>;
    expect(emit.mock.calls.filter((c) => c[0].category === 'machine').length).toBe(0);
  });

  it('dead mains kill the eye; a dead eye watches nothing', async () => {
    const { h, ctx } = await pinCam(true); // drowned-mains room
    ctx.player.pos.x = 0; ctx.player.pos.z = 2;
    h.update(ctx, 0.05);
    step(h, ctx, 0, 2, 40);
    const emit = ctx.sound.emit as ReturnType<typeof vi.fn>;
    expect(emit.mock.calls.filter((c) => c[0].category === 'machine').length).toBe(0);
  });
});

describe('the Filer’s runner (sprint 300)', () => {
  const fileRoom = {
    index: 0, templateId: 'under-records', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 10, depth: 12,
    entryPos: { x: 0, y: 0, z: -6 }, exitPos: { x: 0, y: 0, z: 6 }, navNodes: [],
    spec: { width: 10, depth: 12, props: [{ kind: 'keyCabinet', x: 2.5, z: 3.0, yaw: 0 }] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;
  const chain: RoomInstance[] = [fileRoom];
  for (let i = 1; i <= 10; i++) {
    chain.push({ index: i, templateId: 'corridor', origin: { x: 0, y: 0, z: i * 12 },
      width: 6, depth: 12,
      entryPos: { x: 0, y: 0, z: i * 12 - 6 }, exitPos: { x: 0, y: 0, z: i * 12 + 6 },
      navNodes: [], spec: { width: 6, depth: 12, props: [] },
      doors: [], sockets: [], hidingSpots: [], scheduled: [] } as unknown as RoomInstance);
  }
  async function filed() {
    const { Filer } = await import('../src/entities/setpieces');
    const wordFiled = vi.fn();
    const ctx = makeCtx(chain, {
      currentRoomIndex: 0,
      trailOwed: () => 3,
      wordFiled,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const f = new Filer();
    f.spawn(ctx);
    for (let i = 0; i < 80 && !f.posted; i++) { ctx.now += 0.05; f.update(0.05); }
    return { f, ctx, wordFiled };
  }

  it('goes out on foot — the word travels the spine, catchable', async () => {
    const { f, ctx } = await filed();
    expect(f.runnerOut, 'the courier is out').toBe(true);
    const z0 = f.runnerPos.z;
    for (let i = 0; i < 30 && f.runnerOut; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(f.runnerPos.z - z0, 'it moves down the chain').toBeGreaterThan(1);
    const meshes = (ctx.addEntityMesh as ReturnType<typeof vi.fn>).mock.calls;
    expect(meshes.length, 'desk + courier meshes').toBeGreaterThanOrEqual(2);
    f.dispose();
  });

  it('cut the runner — the word dies with it, the card comes out torn', async () => {
    const { f, ctx, wordFiled } = await filed();
    expect(f.runnerOut).toBe(true);
    f.cutRunner();
    expect(f.runnerOut).toBe(false);
    expect(wordFiled, 'a torn card never reaches the stairs').not.toHaveBeenCalled();
    expect(f.posted, 'the word never lands').toBe(false);
    expect(f.filed, 'the card comes out torn').toBe(false);
    const removes = (ctx.removeEntityMesh as ReturnType<typeof vi.fn>).mock.calls;
    expect(removes.length, 'the courier is down').toBeGreaterThan(0);
    const rm = ctx.removeInteractable as ReturnType<typeof vi.fn>;
    expect(rm.mock.calls.some((c) => String(c[0]).startsWith('square')), 'the square point closes').toBe(true);
    f.dispose();
  });

  it('let it run — the word is delivered, past recall, and files upstairs', async () => {
    const { f, ctx, wordFiled } = await filed();
    expect(f.runnerOut).toBe(true);
    for (let i = 0; i < 900 && f.runnerOut; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(f.runnerOut, 'the courier is gone').toBe(false);
    expect(f.posted, 'the word is out — the halls still listen').toBe(true);
    expect(wordFiled, 'the card lands in the house register').toHaveBeenCalledTimes(1);
    f.dispose();
  });
});

describe('the gaze needs air (sprint 442)', () => {
  // A shut leaf between you and the thing your eyes are on breaks every
  // gaze-driven effect — the whisper can't strike through it, can't be
  // banished through it, and relocates instead of landing for free.
  const leafRoom = (): RoomInstance => ({
    index: 0, templateId: 't', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 10, depth: 10, spec: { width: 10, depth: 10, props: [] },
    doors: [{
      id: 'door-0-in', roomIndex: 0, isMainRoute: true, label: '0',
      pos: v3(0, 0, 0), yaw: Math.PI / 2, locked: false,
      opening: false, openT: 0, swingT: 0, holdT: 0,
    } as RoomInstance['doors'][number]],
    hidingSpots: [], scheduled: [], sockets: [], losBlockers: [],
  } as unknown as RoomInstance);

  it("the strike can't reach through a shut leaf — it relocates and hunts again", () => {
    const rooms = [leafRoom(), leafRoom(), leafRoom()];
    const ctx = makeCtx(rooms, { currentRoomIndex: 0 });
    const p = ctx.player as unknown as { pos: { x: number; y: number; z: number } };
    // leaf plane at x=0 (yaw PI/2 → leaf runs along Z): player west, whisper east
    p.pos = v3(-3, 0, 0);
    const wh = new Whisper();
    wh.spawn(ctx);
    (wh as unknown as { pos: { x: number; z: number } }).pos = v3(3, 0, 0);
    const before = { x: (wh as unknown as { pos: { x: number } }).pos.x, z: (wh as unknown as { pos: { z: number } }).pos.z };
    const dmg = ctx.damagePlayer as ReturnType<typeof vi.fn>;
    const cm = ctx as { now: number };
    // run past the whole strike window
    for (let i = 0; i < 160 && !dmg.mock.calls.length; i++) { cm.now += 0.05; wh.update(0.05); }
    expect(dmg, 'a shut leaf is cover from the strike').not.toHaveBeenCalled();
    const after = wh as unknown as { pos: { x: number; z: number }; attackT: number };
    const moved = Math.hypot(after.pos.x - before.x, after.pos.z - before.z);
    expect(moved, 'it relocates to hunt again rather than landing for free').toBeGreaterThan(0.5);
    // (it may since have been rightfully dismissed — a relocate landing in
    // real cover followed by an honest gaze is the designed ending)
    wh.dispose();
  });

  it("a gaze through the leaf can't banish it either", () => {
    const rooms = [leafRoom(), leafRoom(), leafRoom()];
    const ctx = makeCtx(rooms, { currentRoomIndex: 0 });
    const p = ctx.player as unknown as { pos: { x: number; y: number; z: number }; yaw: number };
    p.pos = v3(-3, 0, 0);
    p.yaw = Math.PI / 2; // facing +X — dead-on the whisper behind the leaf
    const wh = new Whisper();
    wh.spawn(ctx);
    (wh as unknown as { pos: { x: number; z: number } }).pos = v3(3, 0, 0);
    const cm = ctx as { now: number };
    for (let i = 0; i < 40; i++) { cm.now += 0.05; wh.update(0.05); }
    expect(wh.state, 'staring through a door is not a gaze').not.toBe('done');
    wh.dispose();
  });
});

describe('the eye tells — the rest of the cast (sprints 455-460)', () => {
  const washRoom = {
    index: 0, templateId: 'u-server', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 9, depth: 11, flooded: true,
    entryPos: { x: 0, y: 0, z: -5 }, exitPos: { x: 0, y: 0, z: 5 }, navNodes: [],
    spec: { width: 9, depth: 11, props: [{ kind: 'pipeManifold', x: 2.5, z: 3.0, yaw: 0 }] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;
  const deskRoom = {
    index: 0, templateId: 'u-records-cage', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
    width: 10, depth: 12,
    entryPos: { x: 0, y: 0, z: -6 }, exitPos: { x: 0, y: 0, z: 6 }, navNodes: [],
    spec: { width: 10, depth: 12, props: [{ kind: 'filing', x: 2.5, z: 3.0, yaw: 0 }] },
    doors: [], sockets: [], hidingSpots: [], scheduled: [],
  } as unknown as RoomInstance;

  it('the pipes tell her — a kneel at her leaf pulls her off the basin (sprint 455)', async () => {
    const { Laundress } = await import('../src/entities/setpieces');
    const ctx = makeCtx([washRoom], { currentRoomIndex: 0, isRoomDrained: () => false });
    const w = new Laundress();
    w.spawn(ctx);
    for (let i = 0; i < 30; i++) { ctx.now += 0.05; w.update(0.05); }
    expect(w.guarding, 'she holds the drain').toBe(true);
    const leaf = v3(-3.5, 0, -2);
    w.eyeTell!(v3(30, 0, 30), leaf); // your kneel carries down the plumbing
    expect(w.guarding, 'the basin is unwatched').toBe(false);
    const wp = (w as unknown as { pos: { x: number; z: number } }).pos;
    const d0 = Math.hypot(wp.x - leaf.x, wp.z - leaf.z);
    for (let i = 0; i < 120; i++) { ctx.now += 0.05; w.update(0.05); }
    const d1 = Math.hypot(wp.x - leaf.x, wp.z - leaf.z);
    expect(d1, 'she walks to HER side of the leaf').toBeLessThan(d0);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /pipes told her/.test(c))).toBe(true);
    w.dispose();
  });

  it('a face at her crack is a face on file — the index opens (sprint 456)', async () => {
    const { Filer } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom], {
      currentRoomIndex: 0, addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const f = new Filer();
    f.spawn(ctx);
    for (let i = 0; i < 20; i++) { ctx.now += 0.05; f.update(0.05); }
    expect(f.filed, 'the drawer is still shut on you').toBe(false);
    f.eyeTell!(v3(0, 0, -5)); // the kneel gives her your face
    expect(f.filed, 'your name is on a card').toBe(true);
    expect(f.posted, 'the word goes out on foot').toBe(true);
    f.eyeTell!(v3(0, 0, -5)); // filed once — further kneels tell nothing
    f.dispose();
  });

  it('a debtor at his crack opens the ledger early (sprint 457)', async () => {
    const { Auditor } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom], {
      currentRoomIndex: 0, claimsOwed: () => 2,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const a = new Auditor();
    a.spawn(ctx);
    expect(a.demanded, 'the tally is still shut').toBe(false);
    a.eyeTell!(v3(0, 0, -5)); // a debtor presenting themselves
    expect(a.demanded, 'the ledger comes out on the sighting').toBe(true);
    a.dispose();
  });

  it('a clean face at his crack is only a kneel (sprint 457)', async () => {
    const { Auditor } = await import('../src/entities/setpieces');
    const ctx = makeCtx([deskRoom], {
      currentRoomIndex: 0, claimsOwed: () => 0,
      addInteractable: vi.fn(), removeInteractable: vi.fn(),
    });
    ctx.player.pos.x = 0; ctx.player.pos.z = 0;
    const a = new Auditor();
    a.spawn(ctx);
    a.eyeTell!(v3(0, 0, -5));
    expect(a.demanded, 'nothing owed — the book stays shut').toBe(false);
    a.dispose();
  });

  it('the lantern locks on the crack (sprint 458)', () => {
    const entryRoom = {
      index: 0, templateId: 'u-lobby', origin: { x: 0, y: 0, z: -14 }, yaw: 0,
      width: 8, depth: 8,
      entryPos: { x: 0, y: 0, z: -17 }, exitPos: { x: 0, y: 0, z: -11 }, navNodes: [],
      spec: { width: 8, depth: 8, props: [] },
      doors: [], sockets: [], hidingSpots: [], scheduled: [],
    } as unknown as RoomInstance;
    const room = {
      index: 1, templateId: 'u-hall', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
      width: 8, depth: 8,
      entryPos: { x: 0, y: 0, z: -3 }, exitPos: { x: 0, y: 0, z: 3 }, navNodes: [],
      spec: { width: 8, depth: 8, props: [] },
      doors: [], sockets: [], hidingSpots: [], scheduled: [],
    } as unknown as RoomInstance;
    const ctx = makeCtx([entryRoom, room], { currentRoomIndex: 1 });
    const cm = new Commissionaire();
    cm.spawn(ctx);
    const leaf = v3(room.exitPos.x - 1, 0, room.exitPos.z);
    cm.eyeTell!(v3(30, 0, 30), leaf);
    const pin = cm as unknown as { pinYaw: number | null; pinUntil: number };
    expect(pin.pinYaw, 'the light holds a bearing').not.toBeNull();
    expect(pin.pinUntil, 'the pin outlasts a thrown sound').toBeGreaterThan(ctx.now + 4);
    // post = exitPos + sin/cos(baseYaw)·1.0, baseYaw = atan2(entry−exit)
    const baseYaw = Math.atan2(room.entryPos.x - room.exitPos.x, room.entryPos.z - room.exitPos.z);
    const post = { x: room.exitPos.x + Math.sin(baseYaw), z: room.exitPos.z + Math.cos(baseYaw) };
    const want = Math.atan2(leaf.x - post.x, leaf.z - post.z);
    expect(Math.abs(pin.pinYaw! - want), 'the lantern aims at your leaf').toBeLessThan(0.3);
    cm.dispose();
  });

  it('the keys turn toward your door (sprint 459)', () => {
    const room = {
      index: 0, templateId: 'u-lobby', origin: { x: 0, y: 0, z: 0 }, yaw: 0,
      width: 12, depth: 12,
      entryPos: { x: 0, y: 0, z: -5 }, exitPos: { x: 0, y: 0, z: 5 }, navNodes: [],
      spec: { width: 12, depth: 12, props: [] },
      doors: [], sockets: [],
      hidingSpots: [
        { id: 'far', kind: 'cabinet', exitPos: { x: 4, y: 0, z: 4 } },
        { id: 'near', kind: 'cabinet', exitPos: { x: -4, y: 0, z: -4 } },
      ],
      scheduled: [],
    } as unknown as RoomInstance;
    const ctx = makeCtx([room], { currentRoomIndex: 0 });
    const insp = new Inspector();
    insp.spawn(ctx);
    const leaf = v3(-4.5, 0, -4.5); // the crack sits beside the 'near' lid
    insp.eyeTell!(v3(30, 0, 30), leaf);
    const tgt = (insp as unknown as { target: { id: string } | null }).target;
    expect(tgt?.id, 'it walks to the cover nearest your door').toBe('near');
    insp.dispose();
  });

  it('the shy thing flinches — a sighting costs it the spot (sprint 460)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const room = rooms[20];
    ctx.player.pos.x = room.origin.x; ctx.player.pos.z = room.origin.z;
    const wh = new Whisper();
    wh.spawn(ctx);
    const wp = wh as unknown as { pos: { x: number; z: number } };
    const before = { x: wp.pos.x, z: wp.pos.z };
    wh.eyeTell!(v3(30, 0, 30));
    const moved = Math.hypot(wp.pos.x - before.x, wp.pos.z - before.z);
    expect(moved, 'it abandons the spot you saw').toBeGreaterThan(0.5);
    const captions = (ctx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[2]));
    expect(captions.some((c) => /shadow flinches/.test(c))).toBe(true);
    wh.dispose();
  });
});

describe('the eye tells — hunters and mass (sprints 461-464)', () => {
  it('the mass bends through your kneel (sprint 461)', async () => {
    const { Pursuer } = await import('../src/entities/setpieces');
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const room = rooms[20];
    const p = new Pursuer();
    p.spawn(ctx);
    const wps = [v3(room.origin.x, 0, room.origin.z - 4), v3(room.origin.x, 0, room.origin.z + 4)];
    p.begin(wps);
    const kneel = v3(room.origin.x + 2, 0, room.origin.z);
    p.eyeTell!(kneel);
    const wi = (p as unknown as { wi: number }).wi;
    expect((p as unknown as { waypoints: { x: number; z: number }[] }).waypoints[wi].x,
      'the route detours through the told point').toBeCloseTo(kneel.x, 3);
    p.end();
  });

  it('a kneel before it wakes the route is ignored (sprint 461)', async () => {
    const { Pursuer } = await import('../src/entities/setpieces');
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const p = new Pursuer();
    p.spawn(ctx);
    p.eyeTell!(v3(1, 0, 1)); // no chase running — frames on a rack
    expect((p as unknown as { waypoints: unknown[] }).waypoints.length).toBe(0);
    p.dispose();
  });

  it('it red-lines the floor under the crack (sprint 462)', async () => {
    const { Editor } = await import('../src/entities/setpieces');
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const e = new Editor();
    e.spawn(ctx);
    const leaf = v3(rooms[20].origin.x + 3, 0, rooms[20].origin.z + 2);
    const n0 = e.zones.length;
    e.eyeTell!(v3(30, 0, 30), leaf);
    expect(e.zones.length, 'the audit writes a zone on the spot').toBe(n0 + 1);
    const z = e.zones[e.zones.length - 1];
    expect(Math.hypot(z.x - leaf.x, z.z - leaf.z), 'the zone covers the leaf').toBeLessThan(0.01);
    e.dispose();
  });

  it('the sleeper stirs on the kneel — two sightings wake it (sprint 463)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const room = rooms[20];
    ctx.player.pos.x = room.origin.x + 8; ctx.player.pos.z = room.origin.z + 8; // far corner, unstirring
    ctx.player.lastMoveSpeed = 0;
    const h = new Husk();
    h.spawn(ctx);
    const hp = (h as unknown as { pos: { x: number; z: number } }).pos;
    // player 8+ meters out, lamp beam aimed away — dormant baseline
    ctx.player.yaw = Math.atan2(room.origin.x - hp.x > 0 ? -1 : 1, 0); // face away
    ctx.now += 0.05; h.update(0.05);
    h.eyeTell!(v3(30, 0, 30));
    const angered = (h as unknown as { anger: number }).anger;
    expect(angered, 'the kneel thump works on it').toBeGreaterThan(0.4);
    h.eyeTell!(v3(30, 0, 30));
    // two tells is enough — the sleeper should be hunting now or one frame from it
    ctx.now += 0.05; h.update(0.05);
    const mode = (h as unknown as { mode: string }).mode;
    expect(mode, 'the second crack woke it').toBe('hunt');
    h.dispose();
  });

  it('the pass slows over the told seam (sprint 464)', () => {
    const rooms = routeRooms();
    const ctx = makeCtx(rooms, { currentRoomIndex: 20 });
    const sw = new CorridorRunner('sweep');
    sw.spawn(ctx);
    const cm = ctx as { now: number };
    // run through the warning into the pass
    for (let i = 0; i < 400 && sw.state === 'warn'; i++) { cm.now += 0.05; sw.update(0.05); }
    expect(sw.state).toBe('engage');
    // drop a told crack just ahead of the moving front
    const f = sw as unknown as { pos?: unknown };
    void f;
    const path = (sw as unknown as { path: { x: number; z: number }[] }).path;
    const leaf = v3(path[Math.min(2, path.length - 1)].x, 0, path[Math.min(2, path.length - 1)].z);
    sw.eyeTell!(v3(30, 0, 30), leaf);
    // run until the front reaches the told leaf — the pass should brake there
    const nm = sw as unknown as { nearMissUntil: number };
    let slowed = false;
    for (let i = 0; i < 1200 && sw.state === 'engage'; i++) {
      cm.now += 0.05; sw.update(0.05);
      if (nm.nearMissUntil > cm.now) { slowed = true; break; }
    }
    expect(slowed, 'it braked over the seam it watched').toBe(true);
    sw.dispose();
  });
});
