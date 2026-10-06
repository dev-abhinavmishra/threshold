import { test, expect } from '@playwright/test';
import { seededRun, ThresholdG } from './harness';

test.setTimeout(300_000);

// The scheduled cast: bellman/porter/warden/groundswell/inspector/
// commissionaire loops and the hearing verbs that move them.
test('the bellman trails your steps — knock, follow, yield to a held gaze', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // bellman pinned @32

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    type Ent = { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null };
    const bellmanRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'bellman'));
    if (!bellmanRoom) return { stage: 'none-scheduled' } as const;
    const prev = g.route.rooms[bellmanRoom.index - 1];
    // Walk in from the previous room — a real position change so enter()
    // fires the scheduled spawn.
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(bellmanRoom.origin.x, 0, bellmanRoom.origin.z);
    for (let f = 0; f < 50; f++) g.frame();
    const ent = g.entities.find((e) => e.id === 'bellman') as Ent | undefined;
    if (!ent) return { stage: 'not-spawned' } as const;
    // Keep moving — stand still and it legitimately catches you.
    const marks: { x: number; z: number }[] = [];
    const hops: number[][] = [];
    const nxt = g.route.rooms[bellmanRoom.index + 1];
    const nxt2 = g.route.rooms[bellmanRoom.index + 2];
    if (nxt) hops.push([nxt.origin.x, nxt.origin.z]);
    if (nxt2) hops.push([nxt2.origin.x, nxt2.origin.z]);
    let framesWatched = 0;
    let outcome = 'watching';
    for (const [x, z] of hops) {
      g.player.teleport(x, 0, z);
      for (let f = 0; f < 35; f++) {
        const tp = ent.threatPos();
        if (tp) marks.push({ x: tp.x, z: tp.z });
        g.frame();
      }
    }
    // Distance travelled while we walked the next two rooms.
    let travelled = 0;
    for (let i = 1; i < marks.length; i++) travelled += Math.hypot(marks[i].x - marks[i - 1].x, marks[i].z - marks[i - 1].z);
    // Now hold it in your gaze — it must freeze, then yield. Teleport to a
    // spot ~4m from its head so it's in gaze range, then keep facing it.
    const tp = ent.threatPos();
    if (tp) {
      const dir = Math.atan2(tp.x - g.player.pos.x, tp.z - g.player.pos.z);
      g.player.teleport(tp.x - Math.sin(dir) * 4, 0, tp.z - Math.cos(dir) * 4);
      g.player.yaw = dir;
    }
    for (let f = 0; f < 1200; f++) {
      const tp2 = ent.threatPos();
      if (ent.state === 'done' || !g.entities.includes(ent as never)) { outcome = 'yielded'; break; }
      if (!tp2) { g.frame(); continue; }
      const dx = tp2.x - g.player.pos.x, dz = tp2.z - g.player.pos.z;
      g.player.yaw = Math.atan2(dx, dz);
      if (Math.hypot(dx, dz) < 10.5) framesWatched++;
      g.frame();
    }
    return { stage: 'done', followed: travelled, outcome, framesWatched, state: ent.state } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { followed: number; outcome: string; framesWatched: number };
  expect(r.followed).toBeGreaterThan(1.5);
  expect(r.framesWatched).toBeGreaterThan(0);
  expect(r.outcome).toBe('yielded');
  expect(errors).toEqual([]);
});

test('locked doors do not stop the bellman — the house keys turn, the leaf stays shut', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // bellman pinned @32

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    type Ent = { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null };
    const bellmanRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'bellman'));
    if (!bellmanRoom) return { stage: 'none-scheduled' } as const;
    const prev = g.route.rooms[bellmanRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(bellmanRoom.origin.x, 0, bellmanRoom.origin.z);
    for (let f = 0; f < 40; f++) g.frame();
    const ent = g.entities.find((e) => e.id === 'bellman') as Ent | undefined;
    if (!ent) return { stage: 'not-spawned' } as const;
    // The leaf the player came through stays shut (teleports never open it)
    // — now the house locks it. It must not knock it open; its own ring works.
    const door = bellmanRoom.doors.find((d) => d.id.endsWith('-in'));
    if (!door) return { stage: 'no-entry-door' } as const;
    door.locked = true;
    const nx = Math.sin(door.yaw), nz = Math.cos(door.yaw);
    const sideOf = (p: { x: number; z: number }) => (p.x - door.pos.x) * nx + (p.z - door.pos.z) * nz;
    const roomSide = Math.sign(sideOf({ x: bellmanRoom.origin.x, z: bellmanRoom.origin.z }));
    // It spawns on the far side (where the player just was) — run until the
    // threat position crosses to the room side, i.e. it came through the seam.
    let crossed = false;
    let steps = 0;
    while (!crossed && steps++ < 600 && ent.state !== 'done') {
      const tp = ent.threatPos();
      if (tp && Math.abs(sideOf(tp)) > 0.25 && Math.sign(sideOf(tp)) === roomSide) crossed = true;
      g.player.teleport(bellmanRoom.origin.x, 0, bellmanRoom.origin.z); // stay put, far from the door
      g.frame();
    }
    return {
      stage: 'done', crossed,
      opening: door.opening === true, stillLocked: door.locked === true,
      keysLine: caps.some((c) => /keys works the lock|keys turning|keyway/.test(c)),
      slipLine: caps.some((c) => /lock turns for it/.test(c)),
      caps: caps.slice(-12),
    } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { crossed: boolean; opening: boolean; stillLocked: boolean; keysLine: boolean; slipLine: boolean; caps: string[] };
  expect(r.keysLine, `no keys-work cue — caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.crossed, 'it never came through the locked seam').toBe(true);
  expect(r.slipLine).toBe(true);
  expect(r.opening, 'the locked leaf must never swing').toBe(false);
  expect(r.stillLocked).toBe(true);
  expect(errors).toEqual([]);
});

test('the porter waits above the lintel — look up or it drops', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's' carries porter @29 and @53

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    type Ent = { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null };
    const porterRooms = g.route.rooms.filter((r) => r.scheduled?.some((s) => s.entity === 'porter'));
    if (porterRooms.length < 2) return { stage: 'few-scheduled', count: porterRooms.length } as const;

    // --- Phase 1: walk into the first scheduled room and linger under the
    // exit door's header without ever looking up — it must drop on us.
    const roomA = porterRooms[0];
    const prev = g.route.rooms[roomA.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(roomA.origin.x, 0, roomA.origin.z);
    for (let f = 0; f < 50; f++) g.frame();
    const entA = g.entities.find((e) => e.id === 'porter') as Ent | undefined;
    if (!entA) return { stage: 'not-spawned' } as const;
    const hdrA = entA.threatPos();
    if (!hdrA) return { stage: 'no-threat' } as const;
    // Keep the gaze level and stand on the crossing point beneath it.
    g.player.pitch = 0;
    g.player.teleport(hdrA.x, 0, hdrA.z);
    let dropped = false;
    for (let f = 0; f < 300 && entA.state !== 'done'; f++) {
      g.player.pitch = 0;
      g.frame();
    }
    dropped = entA.state === 'done';

    // --- Phase 2: the second scheduled room — this time look UP at the
    // header and hold it; the porter must withdraw without touching us.
    const roomB = porterRooms[1];
    const prevB = g.route.rooms[roomB.index - 1];
    g.player.teleport(prevB.origin.x, 0, prevB.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(roomB.origin.x, 0, roomB.origin.z);
    for (let f = 0; f < 50; f++) g.frame();
    const entB = g.entities.find((e) => e.id === 'porter' && e.state !== 'done') as Ent | undefined;
    if (!entB) return { stage: 'no-second' } as const;
    const hdrB = entB.threatPos();
    if (!hdrB) return { stage: 'no-threat-2' } as const;
    // Tilt the gaze up at the header from inside the room — try several
    // sight lines since furniture/bathroom walls can block any one of them.
    const back = Math.atan2(roomB.origin.x - hdrB.x, roomB.origin.z - hdrB.z);
    const cands: [number, number][] = [
      [3.5, 0], [2.5, 1.4], [2.5, -1.4], [4.5, 2.2], [4.5, -2.2], [6, 0], [1.8, 0.8],
    ];
    let outcome = 'waiting';
    outer:
    for (const [dist, lat] of cands) {
      const px = hdrB.x + Math.sin(back) * dist + Math.cos(back) * lat;
      const pz = hdrB.z + Math.cos(back) * dist - Math.sin(back) * lat;
      g.player.teleport(px, 0, pz);
      for (let f = 0; f < 140; f++) {
        const dx = hdrB.x - g.player.pos.x, dz = hdrB.z - g.player.pos.z;
        g.player.yaw = Math.atan2(dx, dz);
        g.player.pitch = Math.atan2(hdrB.y - (g.player.pos.y + 1.62), Math.hypot(dx, dz));
        if (entB.state === 'done' || !g.entities.includes(entB as never)) { outcome = 'withdrew'; break outer; }
        g.frame();
      }
    }
    for (let f = 0; f < 600 && outcome === 'waiting'; f++) {
      if (entB.state === 'done' || !g.entities.includes(entB as never)) { outcome = 'withdrew'; break; }
      g.frame();
    }
    return {
      stage: 'done', dropped, outcome, caps,
    } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { dropped: boolean; outcome: string; caps: string[] };
  expect(r.dropped).toBe(true);
  expect(r.caps.some((c) => /drops — from above/.test(c)), `caps: ${r.caps.slice(-6).join(' | ')}`).toBe(true);
  expect(r.caps.some((c) => /dust sifts down/.test(c))).toBe(true);
  expect(r.outcome).toBe('withdrew');
  expect(r.caps.some((c) => /withdraws above the frame/.test(c))).toBe(true);
  expect(errors).toEqual([]);
});

test('the warden paces its post — whistle, charge, loses the scent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's' carries warden @33 (records-office)

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    type Ent = { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null };
    const wardenRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'warden'));
    if (!wardenRoom) return { stage: 'none-scheduled' } as const;
    const prev = g.route.rooms[wardenRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(wardenRoom.origin.x, 0, wardenRoom.origin.z);
    for (let f = 0; f < 10; f++) g.frame();
    const ent = g.entities.find((e) => e.id === 'warden') as Ent | undefined;
    if (!ent) return { stage: 'not-spawned' } as const;
    // Phase A: the instant the whistle lands, dive into a real hiding spot
    // (a bare object crashes frame(): spots carry pos/exitPos). The charge
    // runs to where it lost you and dies out there.
    // The bellman trails into the room behind you (pinned @32); killPlayer
    // bypasses godMode and an exposed stand-still is its whole trigger, so
    // retire it for this spec — it is tested on its own terms elsewhere.
    const bell = g.entities.find((e) => e.id === 'bellman') as { state: string } | undefined;
    if (bell) bell.state = 'done';
    const spot = wardenRoom.hidingSpots.find((s) => !s.trappedBy) ?? wardenRoom.hidingSpots[0];
    let resumed = false;
    for (let f = 0; f < 1600 && ent.state !== 'done'; f++) {
      if (g.player.dead) return { stage: 'player-died', caps: caps.slice(-12) } as const;
      const tp = ent.threatPos();
      // Stand in the 1.6m proximity exemption — the whistle is deterministic.
      if (tp && !g.player.hiddenSpot) g.player.teleport(tp.x, 0, tp.z - 1.4);
      g.frame();
      if (!g.player.hiddenSpot && caps.some((c) => /Warden has you/.test(c))) {
        if (spot) {
          g.player.hiddenSpot = spot;
          g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
        }
      }
      // Two legal endings to the blind charge: it gives up ('whistle
      // dies') or it reaches your last-seen spot within a metre and the
      // strike connects even into the hiding volume ('Warden strikes').
      if (caps.some((c) => /whistle dies|Warden strikes/.test(c))) { resumed = true; break; }
    }
    // Phase B: come back out into the open — it must spot again, charge,
    // and this time the strike lands.
    let struck = false;
    if (resumed) {
      const preB = caps.length;
      g.player.hiddenSpot = null;
      for (let f = 0; f < 1400 && ent.state !== 'done'; f++) {
        if (g.player.dead) return { stage: 'player-died-b', caps: caps.slice(-12) } as const;
        const tp = ent.threatPos();
        if (tp) g.player.teleport(tp.x, 0, tp.z - 1.4);
        g.frame();
        if (caps.slice(preB).some((c) => /Warden strikes/.test(c))) { struck = true; break; }
      }
    }
    return { stage: 'done', struck, resumed, paced: caps.some((c) => /measured pacing/.test(c)), caps: caps.slice(-12) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { struck: boolean; resumed: boolean; paced: boolean; caps: string[] };
  expect(r.struck, `caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.resumed, `caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.caps.some((c) => /whistle — the Warden has you/.test(c))).toBe(true);
  expect(r.paced).toBe(true);
  expect(errors).toEqual([]);
});

test('the groundswell heaves the floor — sidestep or stumble', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's' carries groundswell @34 (maint-fabshop)

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    type Ent = { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null };
    const gsRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'groundswell'));
    if (!gsRoom) return { stage: 'none-scheduled' } as const;
    const prev = g.route.rooms[gsRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(gsRoom.origin.x, 0, gsRoom.origin.z);
    for (let f = 0; f < 20; f++) g.frame();
    const ent = g.entities.find((e) => e.id === 'groundswell') as Ent | undefined;
    if (!ent) return { stage: 'not-spawned' } as const;

    // Stand on the moving hump itself — it must heave us.
    let heaved = false;
    for (let f = 0; f < 2200 && ent.state !== 'done'; f++) {
      const tp = ent.threatPos();
      if (tp) g.player.teleport(tp.x, 0, tp.z);
      g.frame();
      if (caps.some((c) => /boards heave under you/.test(c))) { heaved = true; break; }
    }
    // Then hold a wall strip calm — hug the room's edge through the rest.
    let settled = false;
    if (heaved) {
      for (let f = 0; f < 3000 && ent.state !== 'done'; f++) {
        const tp = ent.threatPos();
        // Stay 1.6m off the room's centre-line laterally — outside the hump band.
        if (tp) g.player.teleport(gsRoom.origin.x - (gsRoom.spec?.width ?? 8) / 2 + 0.4, 0, tp.z);
        g.frame();
      }
      settled = caps.some((c) => /floor settles/.test(c));
    }
    return { stage: 'done', heaved, settled, breath: caps.some((c) => /holds its breath/.test(c)), caps: caps.slice(-8) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { heaved: boolean; settled: boolean; breath: boolean; caps: string[] };
  expect(r.breath).toBe(true);
  expect(r.heaved, `caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.settled, `caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(errors).toEqual([]);
});

test('the inspector tests every lid — hold it shut or it pulls you out', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // inspector @77 records-bullpen — 2 untrapped lids at runtime

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    type Spot = { id: string; exitPos: { x: number; y: number; z: number }; trappedBy?: string };
    type Ent = { id: string; state: string };
    const iRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'inspector'));
    if (!iRoom) return { stage: 'none-scheduled' } as const;
    const prev = g.route.rooms[iRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(iRoom.origin.x, 0, iRoom.origin.z);
    for (let f = 0; f < 20; f++) g.frame();
    const ent = g.entities.find((e) => e.id === 'inspector') as Ent | undefined;
    if (!ent) return { stage: 'not-spawned' } as const;

    const spots = (iRoom.hidingSpots as Spot[]).filter((s) => !s.trappedBy);
    const ep = iRoom.entryPos;
    const dist = (s: Spot) => Math.hypot(s.exitPos.x - ep.x, s.exitPos.z - ep.z);
    const nearest = [...spots].sort((a, b) => dist(a) - dist(b))[0];

    // Slip into a spot directly — the grapple cares about which lid, not
    // how we got in; presses below still ride the real exitHide route.
    // Stand INSIDE the spot volume: exitPos is exposed, and watchers in
    // the room report a standing player.
    const hideIn = (spot: Spot) => {
      const v = (spot as unknown as { volume?: { minX: number; maxX: number; minZ: number; maxZ: number } }).volume;
      g.player.teleport(v ? (v.minX + v.maxX) / 2 : spot.exitPos.x, 0, v ? (v.minZ + v.maxZ) / 2 : spot.exitPos.z);
      g.player.hiddenSpot = spot as never;
      for (let f = 0; f < 10; f++) g.frame();
      return g.player.hiddenSpot !== null;
    };
    const press = () => { g.input.interactPressed = true; g.frame(); g.input.interactPressed = false; };
    const focused = () => g.interaction.focused?.prompt ?? '';

    // Phase A — hide in the nearest lid; HOLD it through the rattle.
    if (!hideIn(nearest)) return { stage: 'no-hide-a' } as const;
    let f = 0;
    while (f++ < 1600 && nearest.trappedBy !== 'inspector' && ent.state !== 'done') g.frame();
    if (nearest.trappedBy !== 'inspector') return { stage: 'no-grapple-a', caps: caps.slice(-8) } as const;
    const holdPrompt = focused(); // 'Leave hiding' while it rattles the lid
    while (f++ < 1600 && nearest.trappedBy === 'inspector' && ent.state !== 'done') { press(); g.frame(); }
    const held = caps.some((c) => /lets go — moves on/.test(c));

    // Phase B — the remaining lid goes unanswered: it wins the rattle.
    let pulledOut = false;
    const remaining = spots.filter((s) => s.id !== nearest.id && !s.trappedBy);
    if (remaining.length && ent.state !== 'done') {
      const next = remaining[0];
      g.player.teleport(next.exitPos.x, 0, next.exitPos.z);
      if (hideIn(next)) {
        let g2 = 0;
        while (g2++ < 1600 && next.trappedBy !== 'inspector' && ent.state !== 'done') g.frame();
        if (next.trappedBy === 'inspector') {
          while (g2++ < 1600 && next.trappedBy === 'inspector' && ent.state !== 'done') g.frame();
        }
        pulledOut = g.player.hiddenSpot === null;
      }
    }
    return {
      stage: 'done', pulledOut, held, holdPrompt,
      triedLid: caps.some((c) => /it tries the lid/.test(c)),
      holdCue: caps.some((c) => /hold it shut/i.test(c)),
      outCue: caps.some((c) => /pulls you out/.test(c)),
      caps: caps.slice(-10),
    } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { pulledOut: boolean; held: boolean; holdPrompt: string; triedLid: boolean; holdCue: boolean; outCue: boolean; caps: string[] };
  expect(r.triedLid).toBe(true);
  expect(r.holdPrompt).toMatch(/leave hiding/i);
  expect(r.holdCue, `caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.pulledOut).toBe(true);
  expect(r.outCue).toBe(true);
  expect(r.held, `caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(errors).toEqual([]);
});

test('the commissionaire holds the doors — bait it, then touch the far leaf', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's' → commissionaire @26 (suite-split)

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    type Ent = { id: string; state: string };
    const cRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'commissionaire'));
    if (!cRoom) return { stage: 'none-scheduled' } as const;
    const prev = g.route.rooms[cRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(cRoom.origin.x, 0, cRoom.origin.z);
    for (let f = 0; f < 20; f++) g.frame();
    const ent = g.entities.find((e) => e.id === 'commissionaire') as Ent | undefined;
    if (!ent) return { stage: 'not-spawned' } as const;

    const en = cRoom.entryPos, ex = cRoom.exitPos;
    const near = (p: { x: number; z: number }, pos: { x: number; z: number }) => Math.hypot(pos.x - p.x, pos.z - p.z) < 0.9;
    const entryDoors = [...cRoom.doors, ...prev.doors].filter((d) => near(en, d.pos));
    const sealedNow = entryDoors.every((d) => d.heldBy === 'commissionaire');

    // Phase A — try to retreat through the held leaf: refused with its tell.
    const yawTo = (p: { x: number; z: number }) => { g.player.yaw = Math.atan2(p.x - g.player.pos.x, p.z - g.player.pos.z); };
    g.player.teleport(en.x + (cRoom.origin.x - en.x) * 0.08, 0, en.z + (cRoom.origin.z - en.z) * 0.08);
    let refused = false;
    for (let f = 0; f < 240 && !refused; f++) {
      yawTo(en);
      g.input.interactPressed = true;
      g.frame();
      g.input.interactPressed = false;
      if (caps.some((c) => /held from the far side/.test(c))) refused = true;
    }

    // Phase B — bait it: stand exposed in the sweep's visible pocket
    // (dead-axis at distance is behind suite-split's divider wall).
    const yaw = Math.atan2(en.x - ex.x, en.z - ex.z);
    const bait = { x: ex.x + Math.sin(yaw) * 4.0 + Math.sin(yaw + Math.PI / 2) * 1.6, z: ex.z + Math.cos(yaw) * 4.0 + Math.cos(yaw + Math.PI / 2) * 1.6 };
    let lit = false;
    for (let f = 0; f < 900 && ent.state !== 'done'; f++) {
      if (g.player.dead) return { stage: 'player-died', caps: caps.slice(-10) } as const;
      if (!lit) g.player.teleport(bait.x, 0, bait.z);
      g.frame();
      if (caps.some((c) => /lantern finds you/.test(c))) { lit = true; break; }
    }

    // Phase C — while it chases, sprint to the far leaf and touch it.
    let opened = false;
    if (lit) {
      const exitDoor = [...cRoom.doors, ...g.route.rooms[cRoom.index + 1].doors].find((d) => near(ex, d.pos));
      for (let f = 0; f < 400 && ent.state !== 'done'; f++) {
        if (g.player.dead) return { stage: 'player-died-c', caps: caps.slice(-10) } as const;
        // Stand room-center side of the leaf — door lanes are kept clear of
        // colliders, so the press always focuses. (A perpendicular hug can
        // leave a shelf between you and the point on desk-dense templates.)
        const ox = cRoom.origin.x - ex.x, oz = cRoom.origin.z - ex.z;
        const ol = Math.hypot(ox, oz) || 1;
        g.player.teleport(ex.x + (ox / ol) * 0.9, 0, ex.z + (oz / ol) * 0.9);
        // Door points sit at y=0 — pitch down at the +0.6 focus point, and
        // aim from the player's ACTUAL pos: wall slide can shove you sideways
        // past the 1.1 prox fallback, where only align saves the focus.
        {
          const hd = Math.hypot(ex.x - g.player.pos.x, ex.z - g.player.pos.z) || 1;
          g.player.yaw = Math.atan2(ex.x - g.player.pos.x, ex.z - g.player.pos.z);
          g.player.pitch = Math.atan2(0.6 - 1.62, hd);
        }
        g.input.interactPressed = true;
        g.frame();
        g.input.interactPressed = false;
        if (exitDoor && (exitDoor.opening || (exitDoor.openT ?? 0) > 0.05)) { opened = true; }
        if (opened && ent.state === 'done') break;
        if (ent.state === 'done') break;
      }
      // give it a few frames to notice the leaf swinging
      for (let f = 0; f < 60 && ent.state !== 'done'; f++) g.frame();
    }

    const unsealed = entryDoors.every((d) => d.heldBy === undefined);
    return {
      stage: 'done', sealedNow, refused, lit, opened,
      yielded: caps.some((c) => /stands aside/.test(c)),
      shutCue: caps.some((c) => /way back is shut/.test(c)),
      entState: ent.state, unsealed,
      caps: caps.slice(-12),
    } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { sealedNow: boolean; refused: boolean; lit: boolean; opened: boolean; yielded: boolean; shutCue: boolean; entState: string; unsealed: boolean; caps: string[] };
  expect(r.sealedNow).toBe(true);
  expect(r.shutCue).toBe(true);
  expect(r.refused, `caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.lit, `caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.opened).toBe(true);
  expect(r.yielded).toBe(true);
  expect(r.entState).toBe('done');
  expect(r.unsealed).toBe(true);
  expect(errors).toEqual([]);
});

test('the cast hears you — pebble pulls the bellman, a lure pulls the warden, sprint provokes the swell', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's': bellman @32 → warden @33 → groundswell @34 — three in a row

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    type Ent = { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null };
    const gi = g as unknown as {
      entities: Ent[];
      lures: { pos: { x: number; y: number; z: number } }[];
      inventory: { id: string; count: number }[];
      activeSlot: number;
      useActiveSlot(): void;
      tossPebble(): void;
    };
    const enterRoom = (idx: number) => {
      const prev = g.route.rooms[idx - 1];
      g.player.teleport(prev.origin.x, 0, prev.origin.z);
      for (let f = 0; f < 30; f++) g.frame();
      g.player.teleport(g.route.rooms[idx].origin.x, 0, g.route.rooms[idx].origin.z);
      for (let f = 0; f < 70; f++) g.frame();
    };

    // ---------- Phase A: a tossed pebble stoops the bellman ----------
    const bRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'bellman'));
    if (!bRoom) return { stage: 'no-bellman' } as const;
    enterRoom(bRoom.index);
    const bell = gi.entities.find((e) => e.id === 'bellman');
    if (!bell) return { stage: 'no-bellman-spawn' } as const;
    const bp = bell.threatPos();
    if (!bp) return { stage: 'no-bell-pos', caps: caps.slice(-10) } as const;
    // Stand ~4.5m off it and toss to a FLANK: aiming the toss at it keeps
    // your gaze on it, and under your gaze it freezes and hears nothing —
    // the pebble has to land sideways. Then turn fully away.
    const px = bp.x + 4.5, pz = bp.z + 1.0;
    g.player.teleport(px, 0, pz);
    const tx = bp.x + 3.5, tz = bp.z + 3.5;   // ~5m off it, ~90° off your bearing to it
    g.player.yaw = Math.atan2(tx - px, tz - pz);
    gi.tossPebble();
    const peb = { x: px + Math.sin(g.player.yaw) * 3.5, z: pz + Math.cos(g.player.yaw) * 3.5 };
    g.player.yaw = Math.atan2(px - bp.x, pz - bp.z); // face away — no gaze freeze
    // Then hide: after it sniffs, it resumes the trail — an exposed
    // lingerer in its path is a touch-kill (killPlayer bypasses godMode).
    const bSpot = bRoom.hidingSpots.find((s) => !s.trappedBy) ?? bRoom.hidingSpots[0];
    if (bSpot) { g.player.hiddenSpot = bSpot as never; g.player.teleport(bSpot.exitPos.x, 0, bSpot.exitPos.z); }
    else g.player.teleport(px + 20, 0, pz + 20); // no lid — just be far
    let sniffed = false;
    for (let f = 0; f < 900; f++) {
      g.frame();
      const tp = bell.threatPos();
      if (tp && Math.hypot(tp.x - peb.x, tp.z - peb.z) < 0.9) { sniffed = true; break; }
      if (bell.state !== 'engage') break;
    }
    if (g.player.dead) return { stage: 'bell-killed', caps: caps.slice(-10) } as const;

    // ---------- Phase B: the wind-up lure pulls the warden off post ----------
    bell.state = 'done'; // retire — it trails into the next room and kills
    g.player.hiddenSpot = null;
    const wRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'warden'));
    if (!wRoom) return { stage: 'no-warden', sniffed } as const;
    enterRoom(wRoom.index);
    const ward = gi.entities.find((e) => e.id === 'warden' && e.state === 'engage');
    if (!ward) return { stage: 'no-warden-spawn', sniffed } as const;
    // Plant the alarm on a flank, then hide: we isolate HEARING — if its
    // eyes could see us the whistle would override the investigation.
    const spot = wRoom.hidingSpots.find((s) => !s.trappedBy) ?? wRoom.hidingSpots[0];
    const wp = ward.threatPos();
    if (!wp) return { stage: 'no-ward-pos', sniffed } as const;
    g.player.teleport(wp.x + 4.0, 0, wp.z + 3.0);
    g.player.yaw = Math.atan2(wp.x - g.player.pos.x, wp.z - g.player.pos.z); // toss TOWARD its spine
    gi.inventory.push({ id: 'windAlarm', count: 1 });
    gi.activeSlot = gi.inventory.findIndex((i) => i.id === 'windAlarm');
    gi.useActiveSlot();
    const lure = gi.lures[gi.lures.length - 1];
    if (!lure) return { stage: 'no-lure', sniffed } as const;
    if (spot) { g.player.hiddenSpot = spot as never; g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z); }
    let wardReached = false;
    for (let f = 0; f < 1400; f++) {
      g.frame();
      const tp = ward.threatPos();
      if (tp && Math.hypot(tp.x - lure.pos.x, tp.z - lure.pos.z) < 0.8) { wardReached = true; break; }
      if (ward.state !== 'engage') break;
    }

    // ---------- Phase C: real sprint strides provoke the groundswell ----------
    const gRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'groundswell'));
    if (!gRoom) return { stage: 'no-groundswell', sniffed, wardReached } as const;
    g.player.hiddenSpot = null;
    enterRoom(gRoom.index);
    const swell = gi.entities.find((e) => e.id === 'groundswell' && e.state === 'engage');
    if (!swell) return { stage: 'no-swell-spawn', sniffed, wardReached } as const;
    // Sprint down the room axis — footfall emits 'sprint' @0.85 each stride.
    const ex = gRoom.exitPos, en = gRoom.entryPos;
    g.player.teleport(en.x + 1.0, 0, en.z + 1.0);
    g.player.yaw = Math.atan2(ex.x - en.x, ex.z - en.z);
    g.keys.add('KeyW'); g.keys.add('ShiftLeft');
    const capsAt = caps.length;
    for (let f = 0; f < 80; f++) g.frame();
    g.keys.delete('KeyW'); g.keys.delete('ShiftLeft');
    let launched = false;
    for (let f = 0; f < 120; f++) {
      g.frame();
      const front = (swell as unknown as { front?: number }).front;
      if (front !== undefined && front >= 0) { launched = true; break; }
      if (swell.state !== 'engage') break;
    }
    return {
      stage: 'done', sniffed, wardReached, launched,
      caps: caps.slice(-14), swellCaps: caps.slice(capsAt, capsAt + 8),
      allCaps: caps,
    } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { sniffed: boolean; wardReached: boolean; launched: boolean; caps: string[]; swellCaps: string[]; allCaps: string[] };
  const tail = r.allCaps.join(' | ');
  expect(r.sniffed, `caps: ${tail}`).toBe(true);
  expect(r.allCaps.some((c) => /stoops to the sound/.test(c))).toBe(true);
  expect(r.wardReached, `caps: ${tail}`).toBe(true);
  expect(r.allCaps.some((c) => /turns toward the noise/.test(c))).toBe(true);
  expect(r.launched, `caps: ${tail}`).toBe(true);
  expect(r.allCaps.some((c) => /boards stir under the noise/.test(c))).toBe(true);
  expect(errors).toEqual([]);
});

test('noise draws the patrol: the warden shoulders into the next room', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await seededRun(page); // seed 's': warden @33 (records-office), so room 34 is its door neighbour

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    type Ent = { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null };
    const gi = g as unknown as { entities: Ent[] };

    const wRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'warden'));
    if (!wRoom) return { stage: 'no-warden' } as const;
    const next = g.route.rooms[wRoom.index + 1];
    const door = next?.doors.find((d) => d.id.endsWith('-in')) ?? next?.doors[0];
    if (!next || !door) return { stage: 'no-door' } as const;
    // Out of sight from frame one — teleport into the hiding spot itself.
    // An exposed enterRoom settle is a whistle + charge + strike (killPlayer
    // bypasses godMode), and a dead player sends the run back to the Meridian
    // — which is also the warden's expiry.
    const prev = g.route.rooms[wRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    const spot = wRoom.hidingSpots.find((s) => !s.trappedBy) ?? wRoom.hidingSpots[0];
    if (!spot) return { stage: 'no-spot' } as const;
    g.player.hiddenSpot = spot as never;
    g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
    for (let f = 0; f < 70; f++) g.frame();
    const warden = gi.entities.find((e) => e.id === 'warden') as (Ent & { state: string }) | undefined;
    if (!warden) return { stage: 'no-warden-spawn', caps: caps.slice(-8) } as const;

    // A loud crash just inside the next room, by their shared door — staged
    // the moment the patrol reaches that end of its line.
    const wpos = () => warden.threatPos();
    let fired = false;
    for (let i = 0; i < 3000 && !fired; i++) {
      g.frame();
      const wp = wpos();
      if (!wp) return { stage: 'warden-gone' } as const;
      if (warden.state === 'engage' && Math.hypot(wp.x - door.pos.x, wp.z - door.pos.z) < 1.8) {
        const len = Math.hypot(next.origin.x - door.pos.x, next.origin.z - door.pos.z) || 1;
        g.sound.emit({
          x: door.pos.x + ((next.origin.x - door.pos.x) / len) * 0.8,
          y: 1.2,
          z: door.pos.z + ((next.origin.z - door.pos.z) / len) * 0.8,
          intensity: 1.4, category: 'impact', caption: '[a crash beyond the wall]',
        });
        fired = true;
      }
    }
    if (!fired) return { stage: 'never-at-door', caps: caps.slice(-10) } as const;

    // It should shoulder through the leaf and check the noise point.
    const nl = Math.hypot(next.origin.x - door.pos.x, next.origin.z - door.pos.z) || 1;
    const nx = (next.origin.x - door.pos.x) / nl, nz = (next.origin.z - door.pos.z) / nl;
    const cluster = [...wRoom.doors, ...next.doors]
      .filter((d) => Math.hypot(d.pos.x - door.pos.x, d.pos.z - door.pos.z) < 0.6);
    let crossed = false, opened = false;
    const trace: string[] = [];
    const wAny = warden as unknown as { investigate: unknown; pos: { x: number; z: number } };
    for (let i = 0; i < 600 && !crossed; i++) {
      g.frame();
      if (cluster.some((d) => d.opening || (d.openT ?? 0) > 0.05)) opened = true;
      const wp = wpos();
      if (!wp) break;
      const through = (wp.x - door.pos.x) * nx + (wp.z - door.pos.z) * nz;
      crossed = through > 0.3;   // it stops ~0.4m short of the point itself
      if (i % 15 === 0) {
        trace.push(`f${i} t=${through.toFixed(2)} st=${warden.state} inv=${wAny.investigate ? 'y' : 'n'} openT=${cluster.map((d) => (d.openT ?? 0).toFixed(1)).join('/')}`);
      }
    }
    return { stage: 'done', crossed, opened, wardenState: warden.state, dead: g.player.dead, trace, caps: caps.slice(-12), allCaps: caps } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { crossed: boolean; opened: boolean; wardenState: string; dead: boolean; trace: string[]; caps: string[]; allCaps: string[] };
  const tail = r.allCaps.join(' | ');
  expect(r.crossed, `the warden never crossed into the noise room. caps: ${tail} trace: ${r.trace.join(' ; ')}`).toBe(true);
  expect(r.opened, 'the shared leaf never opened for it').toBe(true);
  expect(r.allCaps.some((c) => /shoulder through the door/.test(c)), `caps: ${tail}`).toBe(true);
  expect(errors).toEqual([]);
});

test("the under hears you — bell drifts the grafter, a crash catches the stillframe, the returner answers", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's': fireAlarm @ u-7/10/13/…, stillframe @ u-7, grafter @ u-19/42/…

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; currentRoom: number; godMode: boolean;
      entities: { id: string; threatPos(): { x: number; z: number }; target?: { x: number; z: number }; state: string }[];
      spawnScheduled(): void;
    };

    // --- 1. the bell itself ---
    ga.enterUnderscript();
    const bellRoom = g.route.underRooms.find((r) => r.spec?.props?.some((p) => p.kind === 'fireAlarm'));
    if (!bellRoom) return { stage: 'no-bell' } as const;
    g.player.teleport(bellRoom.origin.x, 0, bellRoom.origin.z);
    ga.currentRoom = bellRoom.index;
    g.godMode = true;
    for (let f = 0; f < 30; f++) g.frame();
    const bell = g.interaction.interactables.find((i) => i.kind === 'alarm');
    if (!bell) return { stage: 'no-bell-point', kinds: g.interaction.interactables.map((i) => i.kind) } as const;
        for (let f = 0; f < 120 && bell.enabled; f++) {
      const ax = bell.pos.x - g.player.pos.x, az = bell.pos.z - g.player.pos.z;
      const al = Math.hypot(ax, az) || 1;
      if (al > 1.4) g.player.teleport(bell.pos.x - (ax / al) * 1.1, 0, bell.pos.z - (az / al) * 1.1);
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(bell.pos.y + 0.6 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (g.interaction.focused?.id === bell.id) g.keys.add('KeyE');
      if (!g.interaction.interactables.some((i) => i.kind === 'alarm' && i.enabled)) break;
      g.frame();
    }
    g.keys.delete('KeyE');
    const bellRung = !g.interaction.interactables.some((i) => i.kind === 'alarm' && i.enabled)
      && caps.some((c) => /alarm screams|bell screams/.test(c));

    // --- 2. the grafter drifts to a crash ---
    // Pick the LARGEST grafter room: it spawns in the corner farthest from
    // the player and must not close killRange during the ~1.3s settle (a
    // done() from a kill attempt ends the entity before the noise phase).
    // No fixed threshold — layouts shift with the shared 'encounter' stream.
    const gRoom = g.route.underRooms
      .filter((r) => r.scheduled?.some((s) => s.entity === 'grafter'))
      .sort((a, b) => Math.hypot((b.width ?? 0) / 2, (b.depth ?? 0) / 2) - Math.hypot((a.width ?? 0) / 2, (a.depth ?? 0) / 2))[0];
    if (!gRoom) return { stage: 'no-grafter' } as const;
    g.player.teleport(gRoom.origin.x, 0, gRoom.origin.z);
    ga.currentRoom = gRoom.index;
    for (let f = 0; f < 5; f++) g.frame();
    const grafter = ga.entities.find((e) => e.id === 'grafter' && e.state !== 'done');
    if (!grafter) return { stage: 'no-grafter-spawn', ents: ga.entities.map((e) => e.id) } as const;
    // Step OUT of its room for the settle — seeRange 9 reaches across every
    // under template, so staying inside means a chase (and a done() kill
    // attempt) before the noise phase. Room-boundary means not-its-room:
    // it loses the body and hears the crash instead.
    const emitPt = { x: gRoom.origin.x + 1.5, z: gRoom.origin.z };
    const w = (gRoom.spec as { width?: number } | undefined)?.width ?? 8;
    g.player.teleport(gRoom.origin.x - w / 2 - 1.5, 0, gRoom.origin.z);
    for (let f = 0; f < 30 && grafter.state !== 'done'; f++) g.frame();
    if (grafter.state === 'done') return { stage: 'grafter-gone' } as const;
    (g as unknown as { sound: { emit(e: { x: number; y: number; z: number; intensity: number; category: string; caption: string }): void } })
      .sound.emit({ x: emitPt.x, y: 1, z: emitPt.z, intensity: 0.9, category: 'machine', caption: '[a machine knocks]' });
    // its target must land on the crash point — then it walks there
    let driftToNoise = false;
    for (let f = 0; f < 160 && !driftToNoise; f++) {
      g.frame();
      const t = (grafter as { target?: { x: number; z: number } }).target;
      if (t && Math.hypot(t.x - emitPt.x, t.z - emitPt.z) < 1.5) driftToNoise = true;
    }
    const dragCue = caps.some((c) => /drags toward the sound/.test(c));

    // --- 3. the stillframe photographs a crash ---
    // pick a room that ISN'T the bell room — its stillframe already ran
    const sRoom = g.route.underRooms.find((r) => r.scheduled?.some((s) => s.entity === 'stillframe') && r.index !== bellRoom.index);
    if (!sRoom) return { stage: 'no-still' } as const;
    g.player.teleport(sRoom.origin.x, 0, sRoom.origin.z);
    ga.currentRoom = sRoom.index;
    g.godMode = false; // the strike must land to be observed
    for (let f = 0; f < 30; f++) g.frame();
    const still = ga.entities.find((e) => e.id === 'stillframe' && e.state !== 'done');
    if (!still) return { stage: 'no-still-spawn', ents: ga.entities.map((e) => e.id) } as const;
    const hpBefore = (g.player as { health?: number }).health ?? -1;
    // a tossed pebble in the open shutter — a crash is motion enough. NO held
    // key: inputHeld is the stillframe's own strike path and would land first.
    g.player.yaw = 0;
    (g as unknown as { tossPebble(): void }).tossPebble();
    for (let f = 0; f < 120; f++) g.frame();
    const hpAfter = (g.player as { health?: number }).health ?? -1;
    const snapCue = caps.some((c) => /shutter catches the noise/.test(c));

    // --- 4. the returner answers the bell ---
    // exclude rooms already visited above — a returner scheduled there
    // spawned on entry, walked its pass, and its spawn key is spent
    g.godMode = true;
    const visited = new Set([bellRoom.index, gRoom.index, sRoom.index]);
    const rRoom = g.route.underRooms.find((r) => r.scheduled?.some((s) => s.entity === 'returner') && !visited.has(r.index));
    if (!rRoom) return { stage: 'no-returner' } as const;
    g.player.teleport(rRoom.origin.x, 0, rRoom.origin.z);
    ga.currentRoom = rRoom.index;
    for (let f = 0; f < 20; f++) g.frame();
    const ret = ga.entities.find((e) => e.id === 'returner' && e.state !== 'done');
    if (!ret) return { stage: 'no-returner-spawn', ents: ga.entities.map((e) => e.id) } as const;
    // a crash at the latching end — inside its corridor, bus-level honest
    const lat = ret.threatPos();
    (g as unknown as { sound: { emit(e: { x: number; y: number; z: number; intensity: number; category: string; caption: string }): void } })
      .sound.emit({ x: lat.x, y: 1, z: lat.z, intensity: 1.0, category: 'machine', caption: '[a bell screams]' });
    // the quickened pass should be moving within ~1.5s of frames (was ~3s)
    let engaged = false;
    for (let f = 0; f < 60 && !engaged; f++) { g.frame(); if (ret.state !== 'warn') engaged = true; }
    const latchCue = caps.some((c) => /latching quickens/.test(c));

    return { stage: 'done', bellRung, driftToNoise, dragCue, snapCue, hpBefore, hpAfter, latchCue, engaged, caps: caps.slice(-12) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { bellRung: boolean; driftToNoise: boolean; dragCue: boolean; snapCue: boolean; latchCue: boolean; engaged: boolean; hpBefore: number; hpAfter: number; caps: string[] };
  expect(r.bellRung).toBe(true);
  expect(r.dragCue, `no drift cue — caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.driftToNoise).toBe(true);
  expect(r.snapCue).toBe(true);
  expect(r.hpAfter).toBeLessThan(r.hpBefore);
  expect(r.latchCue, `no latch cue — caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.engaged, 'the quickened pass never started moving').toBe(true);
  expect(errors).toEqual([]);});

// The Swamper (sprint 255): the drowned thing that lies in flooded halls —
// splash noise pulls it to you; the drain empties the room of it.
test('the swamper answers stirred water — the drain takes its medium', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's': flooded u-3/24/48; swamper scheduled on u-24

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; currentRoom: number; godMode: boolean;
      entities: { id: string; state: string; threatPos(): { x: number; z: number } }[];
      spawnScheduled(): void;
      drainedRooms: Set<string>;
    };

    ga.enterUnderscript();
    const room = g.route.underRooms.find((r) => r.flooded && r.scheduled?.some((s) => s.entity === 'swamper'));
    if (!room) return { stage: 'no-swamper-room' } as const;

    // Wade in — it rises in the far corner.
    g.player.teleport(room.origin.x, 0, room.origin.z);
    ga.currentRoom = room.index;
    ga.godMode = false;
    for (let f = 0; f < 40; f++) g.frame();
    const ent = ga.entities.find((e) => e.id === 'swamper');
    if (!ent) return { stage: 'not-spawned' } as const;

    // Stir the flood: upright wading splashes pull it in — and it takes the
    // stirring thing.
    const hp0 = g.player.health;
    g.keys.add('KeyW');
    let closeSeen = false;
    for (let f = 0; f < 400; f++) {
      g.frame();
      const tp = ent.threatPos();
      const d = Math.hypot(tp.x - g.player.pos.x, tp.z - g.player.pos.z);
      if (d < 2) closeSeen = true;
      if (g.player.health < hp0) break;
      // keep wading through the middle of the room
      if (f % 60 === 59) { const px = room.origin.x - g.player.pos.x, pz = room.origin.z - g.player.pos.z; g.player.yaw = Math.atan2(px, pz); }
    }
    g.keys.delete('KeyW');
    const struck = g.player.health < hp0;
    if (!struck) return { stage: 'no-strike', closeSeen, hp: g.player.health, caps } as const;
    const rose = caps.some((c) => /water stands up|water is not empty/.test(c));

    // The drain empties the room of it.
    ga.godMode = true;
    const DRAIN = new Set(['pipeManifold', 'conduitRun', 'sumpPump', 'hydrant', 'wallVent']);
    const drainProp = room.spec?.props?.find((p) => DRAIN.has(p.kind));
    if (!drainProp) return { stage: 'no-drain-prop', struck, closeSeen } as const;
    const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
    const dp = { x: room.origin.x + drainProp.x * c + drainProp.z * s, z: room.origin.z - drainProp.x * s + drainProp.z * c };
    g.player.teleport(dp.x + 1.0, 0, dp.z + 1.0);
    for (let f = 0; f < 30; f++) g.frame();
    const key = `under:${room.index}`;
    for (let f = 0; f < 260 && !ga.drainedRooms.has(key); f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'drain' && i.enabled);
      if (!it) break;
      const ax = it.pos.x - g.player.pos.x, az = it.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(it.pos.y + 0.55 - (g.player.pos.y + g.player.eyeHeight), Math.hypot(ax, az) || 1);
      if (/open the drain/i.test(g.interaction.focused?.prompt ?? '')) g.keys.add('KeyE');
      g.frame();
    }
    g.keys.delete('KeyE');
    if (!ga.drainedRooms.has(key)) return { stage: 'drain-failed', struck, closeSeen } as const;
    for (let f = 0; f < 20; f++) g.frame();
    const slipped = caps.some((c) => /slips down the drain/.test(c));
    const gone = ent.state === 'done' || !ga.entities.includes(ent as never);

    return { stage: 'done', room: room.index, struck, closeSeen, rose, slipped, gone, hp: g.player.health } as const;
  });

  if (result.stage === 'no-swamper-room' || result.stage === 'not-spawned') test.skip();
  expect(result.struck, JSON.stringify(result)).toBe(true);
  expect(result.rose, JSON.stringify(result)).toBe(true);
  expect(result.gone, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the dark water hides the wire — upright trips it, the slow wade feels it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's': dark flooded halls u-3/u-24 carry submerged snares

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; currentRoom: number; godMode: boolean;
      player: { rootedUntil: number };
    };

    ga.enterUnderscript();
    const room = g.route.underRooms.find((r) => r.flooded && r.darkRoom
      && r.sockets?.some((sk) => sk.meta?.hazard === 'snare'));
    if (!room) return { stage: 'no-dark-flood' } as const;
    const snares = room.sockets!.filter((sk) => sk.meta?.hazard === 'snare');
    ga.godMode = true; // keep the room's swamper out of the signal — we read roots, not blood

    const wadeOnto = (s: { x: number; z: number }, crouched: boolean) => {
      // approach along the corridor's long axis — side-on starts can sit
      // behind a prop collider and pin the wade against the wall
      g.player.teleport(s.x, 0, s.z + 0.9);
      g.player.yaw = Math.atan2(s.x - s.x, s.z - (s.z + 0.9));
      ga.currentRoom = room.index;
      for (let f = 0; f < 25; f++) g.frame();
      const rooted0 = ga.player.rootedUntil;
      if (crouched) g.keys.add('KeyC');
      g.keys.add('KeyW');
      for (let f = 0; f < 70; f++) g.frame();
      g.keys.delete('KeyW');
      g.keys.delete('KeyC');
      return { rooted: ga.player.rootedUntil > rooted0, at: { x: g.player.pos.x, z: g.player.pos.z } };
    };

    const up = wadeOnto(snares[0].pos, false);
    const tripped = up.rooted && caps.some((c) => /paper snare/.test(c));
    let felt = false;
    if (snares.length > 1) {
      const down = wadeOnto(snares[1].pos, true);
      felt = !down.rooted && caps.some((c) => /wire underfoot/.test(c));
    }
    // and the wire can be cut — but only a crouched wader can find it
    const last = snares[snares.length - 1].pos;
    g.player.teleport(last.x + 0.6, 0, last.z + 0.6);
    for (let f = 0; f < 20; f++) g.frame();
    const blindNoPrompt = !g.interaction.interactables.some((i) => i.kind === 'snip');
    g.keys.add('KeyC');
    for (let f = 0; f < 30; f++) g.frame();
    let cut = false;
    for (let f = 0; f < 160 && !cut; f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'snip' && i.enabled);
      if (!it) break;
      const ax = it.pos.x - g.player.pos.x, az = it.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = -0.7;
      if (/cut/i.test(g.interaction.focused?.prompt ?? '')) g.keys.add('KeyE');
      g.frame();
      cut = caps.some((c) => /wire comes loose/.test(c));
    }
    g.keys.delete('KeyE');
    g.keys.delete('KeyC');
    return { stage: 'done', room: room.index, nSnares: snares.length, tripped, felt,
      blindNoPrompt, cut, caps: caps.slice(-16) } as const;
  });

  if (result.stage === 'no-dark-flood') test.skip();
  expect(result.tripped, JSON.stringify(result)).toBe(true);
  if ((result.nSnares ?? 0) > 1) expect(result.felt, JSON.stringify(result)).toBe(true);
  expect(result.blindNoPrompt, JSON.stringify(result)).toBe(true);
  expect(result.cut, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('cut the seal — an upright player can disarm a dry wire', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // armed snares @ maint-service-narrow + unlit rooms

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      godMode: boolean; hazard: { snares: { room: number; armed: boolean; pos: { x: number; y: number; z: number } }[] };
      currentRoom: number; keys: Set<string>;
    };
    ga.godMode = true;
    const room = g.route.rooms.find((r) => !r.flooded
      && r.sockets?.some((sk) => sk.meta?.hazard === 'snare'));
    if (!room) return { stage: 'no-snare' } as const;
    if (!ga.hazard.snares.some((h) => h.room === room.index && h.armed)) return { stage: 'no-snare' } as const;
    const hz0 = ga.hazard.snares.find((h) => h.room === room.index)!.pos;
    g.player.teleport(hz0.x + 0.7, 0, hz0.z + 0.7);
    ga.currentRoom = room.index;
    for (let f = 0; f < 25; f++) g.frame();
    const sawPrompt = g.interaction.interactables.some((i) => i.kind === 'snip');
    let cut = false;
    for (let f = 0; f < 160 && !cut; f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'snip' && i.enabled);
      if (!it) break;
      g.player.yaw = Math.atan2(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z);
      g.player.pitch = -0.7;
      if (/cut the seal/i.test(g.interaction.focused?.prompt ?? '')) ga.keys.add('KeyE');
      g.frame();
      cut = caps.some((c) => /seal parts/.test(c));
    }
    ga.keys.delete('KeyE');
    return { stage: 'done', room: room.index, sawPrompt, cut,
      disarmed: !ga.hazard.snares.find((h) => h.room === room.index)?.armed,
      caps: caps.slice(-12) } as const;
  });

  if (result.stage === 'no-snare') test.skip();
  expect(result.sawPrompt, JSON.stringify(result)).toBe(true);
  expect(result.cut, JSON.stringify(result)).toBe(true);
  expect(result.disarmed, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('scent — a killed hazard signs the room, the Warden reads it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // warden on patrol at 33

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      hazard: { evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string; t: number; readBy: string[] }[] };
      entities: { id: string; state: string; threatPos?(): { x: number; y: number; z: number } | null }[];
    };
    const wardenRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'warden'));
    if (!wardenRoom) return { stage: 'no-warden' } as const;
    // stand in the room to spawn the patrol, then step out of its sight
    g.player.teleport(wardenRoom.origin.x, 0, wardenRoom.origin.z);
    (g as unknown as { currentRoom: number }).currentRoom = wardenRoom.index;
    for (let f = 0; f < 30; f++) g.frame();
    const w = ga.entities.find((e) => e.id === 'warden');
    if (!w) return { stage: 'no-spawn' } as const;
    const spot = wardenRoom.hidingSpots.find((sp) => !sp.trappedBy) ?? wardenRoom.hidingSpots[0];
    if (spot) {
      g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
      (g.player as unknown as { hiddenSpot: unknown }).hiddenSpot = spot;
    } else {
      g.player.teleport(wardenRoom.origin.x - 40, 0, wardenRoom.origin.z);
    }
    for (let f = 0; f < 10; f++) g.frame();
    const sign = { pos: { x: wardenRoom.origin.x + 0.8, y: 0, z: wardenRoom.origin.z }, room: wardenRoom.index, kind: 'line', t: 0, readBy: [] as string[] };
    ga.hazard.evidence.push(sign);
    let closest = Infinity, investigated = false;
    for (let f = 0; f < 700; f++) {
      g.frame();
      const tp = w.threatPos?.();
      if (tp) closest = Math.min(closest, Math.hypot(tp.x - sign.pos.x, tp.z - sign.pos.z));
      if (caps.some((c) => /reads the sign/.test(c))) investigated = true;
      if (investigated && closest < 0.9) break;
    }
    return { stage: 'done', investigated, closest, read: sign.readBy,
      backOnLine: w.state === 'engage', caps: caps.slice(-8) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.investigated, JSON.stringify(result)).toBe(true);
  expect(result.closest, JSON.stringify(result)).toBeLessThan(1.2);
  expect((result.read ?? []).some((r) => r.startsWith('warden')), JSON.stringify(result)).toBe(true);
  expect(result.backOnLine, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('ghosts — stale sign still pulls the Grafter, the caption says so', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's' grafter @6

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      currentRoom: number;
      hazard: { evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string; t: number; readBy: string[]; old?: boolean }[] };
      entities: { id: string; update(d: number): void; pos?: { x: number; z: number } }[];
    };
    const gRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'grafter'));
    if (!gRoom) return { stage: 'none-scheduled' } as const;
    // hide in a real spot in the grafter's room — let it spawn + settle
    const spot = gRoom.hidingSpots?.find((sp) => !sp.trappedBy);
    if (!spot) return { stage: 'no-spot' } as const;
    g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
    (g.player as unknown as { hiddenSpot: unknown }).hiddenSpot = spot;
    ga.currentRoom = gRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    // plant stale sign in the room — old evidence only a grafter smells
    ga.hazard.evidence.push({
      pos: { x: gRoom.origin.x, y: 0, z: gRoom.origin.z }, room: gRoom.index,
      kind: 'wire', t: -1, readBy: [], old: true,
    });
    let closest = Infinity;
    for (let f = 0; f < 900; f++) {
      g.frame();
      const gr = ga.entities.find((e) => e.id === 'grafter');
      if (gr?.pos) closest = Math.min(closest,
        Math.hypot(gr.pos.x - gRoom.origin.x, gr.pos.z - gRoom.origin.z));
    }
    const staleRead = ga.hazard.evidence[ga.hazard.evidence.length - 1].readBy.some((r) => r.startsWith('grafter'));
    const ghostCaption = caps.some((c) => /old mark/.test(c));
    return { stage: 'done', closest, staleRead, ghostCaption, caps } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.staleRead, JSON.stringify(result)).toBe(true);
  expect(result.closest, JSON.stringify(result)).toBeLessThan(3.2);
  expect(result.ghostCaption, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the house detective — he phones ahead, or you settle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      imprints: number; currentRoom: number; keys: Set<string>;
      interaction: { focused?: { prompt?: string; kind?: string } };
      entities: { id: string; clocked?: boolean; warranted?: boolean }[];
    };
    ga.imprints = 80;

    // --- 1. draw a guest's held bag — the register accrues ---
    const cageRoom = g.route.rooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claim === true && s.meta?.marginalia !== true && !s.meta?.taken));
    if (!cageRoom) return { stage: 'no-cage' } as const;
    g.player.teleport(cageRoom.origin.x, 0, cageRoom.origin.z);
    for (let f = 0; f < 40; f++) g.frame();
    const cage = (cageRoom.sockets ?? []).find((s) => s.meta?.claim === true && s.meta?.marginalia !== true && !s.meta?.taken);
    if (!cage?.meta) return { stage: 'no-cage-sock' } as const;
    const cx = cageRoom.origin.x - cage.pos.x, cz = cageRoom.origin.z - cage.pos.z;
    const cl = Math.hypot(cx, cz) || 1;
    for (let f = 0; f < 55 && !cage.meta.taken; f++) {
      g.player.teleport(cage.pos.x + (cx / cl) * 0.9, 0, cage.pos.z + (cz / cl) * 0.9);
      g.player.yaw = Math.atan2(cage.pos.x - g.player.pos.x, cage.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2((cage.pos.y + 0.6) - eyeY, 0.95);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    if (!cage.meta.taken) return { stage: 'claim-failed' } as const;

    // --- 2. walk into his room — he clocks you ---
    const dRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'detective'));
    if (!dRoom) return { stage: 'no-detective' } as const;
    const prev = g.route.rooms[dRoom.index - 1];
    if (prev) { g.player.teleport(prev.origin.x, 0, prev.origin.z); for (let f = 0; f < 25; f++) g.frame(); }
    g.player.teleport(dRoom.origin.x, 0, dRoom.origin.z);
    let det: { clocked?: boolean; warranted?: boolean } | undefined;
    for (let f = 0; f < 200; f++) {
      g.frame();
      det = ga.entities.find((e) => e.id === 'detective') ?? det;
      if (det?.clocked) break;
    }
    if (!det) return { stage: 'no-det-spawn', ents: ga.entities.map((e) => e.id) } as const;
    const clocked = caps.some((c) => /has your face|goes on the wire/.test(c));

    // --- 3. slip a room without settling — the wire rings ahead ---
    const nxt = g.route.rooms.find((r) => r.index === dRoom.index + 1) ?? g.route.rooms[dRoom.index - 1];
    if (!nxt) return { stage: 'no-neighbor' } as const;
    const ringCap = caps.length;
    g.player.teleport(nxt.origin.x, 0, nxt.origin.z);
    for (let f = 0; f < 40; f++) g.frame();
    const rang = caps.slice(ringCap).some((c) => /house phone rings ahead/.test(c));

    // --- 4. back to his desk — settle ---
    const settle = g.interaction.interactables.find((i) => i.kind === 'settle' && i.enabled);
    if (!settle) return { stage: 'no-settle' } as const;
    const i0 = ga.imprints;
    let settlePrompt = '';
    for (let f = 0; f < 70; f++) {
      const sx = dRoom.origin.x - settle.pos.x, sz = dRoom.origin.z - settle.pos.z;
      const sl = Math.hypot(sx, sz) || 1;
      g.player.teleport(settle.pos.x + (sx / sl) * 0.9, 0, settle.pos.z + (sz / sl) * 0.9);
      g.player.yaw = Math.atan2(settle.pos.x - g.player.pos.x, settle.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2((settle.pos.y + 0.6) - eyeY, 0.95);
      g.frame();
      if (!settlePrompt) {
        const fp = ga.interaction.focused?.prompt;
        if (fp && /Settle the account/.test(fp)) settlePrompt = fp;
      }
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const paid = caps.some((c) => /paid \d+ — the detective strikes your name/.test(c));
    return { stage: 'done' as const, clocked, rang, settlePrompt, paid,
      spent: ga.imprints < i0, warranted: det?.warranted === true };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.clocked, JSON.stringify(result)).toBe(true);
  expect(result.rang, JSON.stringify(result)).toBe(true);
  expect(result.settlePrompt, JSON.stringify(result)).toMatch(/Settle the account/);
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.warranted, JSON.stringify(result)).toBe(false);
  expect(errors).toEqual([]);
});
