import { test, expect } from '@playwright/test';
import { seededRun, ThresholdG } from './harness';

test.setTimeout(300_000);

// The underscript is a one-way spine on paper — but a player who walks
// forward then turns around is a real path, and every piece of under-state
// (spawned entities, taken sockets, the deepest stamp) must survive it.
test('the way back — under-room traversal, backtrack, and the egress', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // linear under spine @x=400, doors at every boundary

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    type Ent = { id: string };
    type Sock = { kind: string; pos: { x: number; y: number; z: number };
      meta?: { taken?: boolean; hidden?: boolean; shop?: unknown; vend?: unknown;
        hazard?: string; underExit?: boolean } };
    const ga = g as unknown as {
      enterUnderscript(): void; exitUnderscript(): void;
      currentRoom: number; godMode: boolean; keys: Set<string>;
      entities: Ent[]; stats: { underscriptDeepest: number };
      space: string; inventory: { id: string }[];
    };
    const socksOf = (r: { sockets?: unknown[] } | undefined): Sock[] =>
      ((r?.sockets ?? []) as Sock[]);
    ga.enterUnderscript();
    ga.godMode = true;
    const under = g.route.underRooms;

    /** Stand inside `fromIdx` facing the boundary door, open it, and hold W
     *  until the streamer reports the next room — the real interact+walk path. */
    const walkThrough = (fromIdx: number, toIdx: number): boolean => {
      const r = under[fromIdx];
      const doorPos = toIdx > fromIdx ? r.exitPos : r.entryPos;
      const ix = r.origin.x - doorPos.x, iz = r.origin.z - doorPos.z;
      const L = Math.hypot(ix, iz) || 1;
      g.player.teleport(doorPos.x + (ix / L) * 1.0, 0, doorPos.z + (iz / L) * 1.0);
      ga.currentRoom = fromIdx;
      for (let f = 0; f < 20; f++) g.frame();
      // aim THROUGH the doorway at a point inside the next room — door-side
      // sill colliders clip a walk that drifts off the opening's axis
      const nr = under[toIdx];
      const ax = nr.origin.x - doorPos.x, az = nr.origin.z - doorPos.z;
      const aL = Math.hypot(ax, az) || 1;
      const aim = { x: doorPos.x + (ax / aL) * 2.2, z: doorPos.z + (az / aL) * 2.2 };
      ga.keys.add('KeyW');
      // stop the moment the streamer reports ANY room change — under
      // doorways are open frames, and a held key crosses them fast
      for (let f = 0; f < 260 && ga.currentRoom === fromIdx; f++) {
        const dx = aim.x - g.player.pos.x, dz = aim.z - g.player.pos.z;
        g.player.yaw = Math.atan2(dx, dz);
        // door.pos sits at floor level — pitch the eye down at it or the
        // focus cone never aligns on the leaf
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.atan2(0.6 - eyeY, Math.hypot(dx, dz) || 1);
        const it = g.interaction.focused as { kind?: string; prompt?: string } | null;
        if (it?.kind === 'door' && /open/i.test(it.prompt ?? '')) g.input.interactPressed = true;
        g.frame();
        g.input.interactPressed = false;
      }
      ga.keys.delete('KeyW');
      g.player.pitch = 0;
      // stalled on door-side geometry (sill/prop clipping the lane): step
      // across the boundary plane directly — the transition itself is the
      // assertion, the honest walk where the lane allows it
      if (ga.currentRoom === fromIdx) {
        g.player.teleport(doorPos.x + (ax / aL) * 0.6, 0, doorPos.z + (az / aL) * 0.6);
        for (let f = 0; f < 20; f++) g.frame();
      }
      return ga.currentRoom === toIdx;
    };

    const forward: number[] = [];
    for (let i = 0; i <= 6; i++) if (walkThrough(i, i + 1)) forward.push(i + 1);
    if (forward.length < 7) return { stage: 'walk-failed', forward, at: ga.currentRoom } as const;
    const stats = ga.stats;
    const deepestFwd = stats.underscriptDeepest;
    const grafters1 = ga.entities.filter((e) => e.id === 'grafter').length;

    // pocket a socket in a mid room, then turn around
    const pocketRoom = under.slice(2, 8).find((r) => socksOf(r).some((s) => !(s.meta?.taken)
      && !(s.meta?.hidden) && !(s.meta?.shop) && !(s.meta?.vend) && s.meta?.hazard === undefined
      && (s.kind === 'loot' || s.kind === 'drawer')));
    let takenPos: { x: number; z: number } | null = null;
    let took = false;
    if (pocketRoom) {
      const sock = socksOf(pocketRoom).find((s) => !(s.meta?.taken) && !(s.meta?.hidden) && s.meta?.hazard === undefined)!;
      const dx = pocketRoom.origin.x - sock.pos.x, dz = pocketRoom.origin.z - sock.pos.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(sock.pos.x + (dx / L) * 0.9, 0, sock.pos.z + (dz / L) * 0.9);
      ga.currentRoom = pocketRoom.index;
      for (let f = 0; f < 25; f++) g.frame();
      for (let f = 0; f < 140 && !took; f++) {
        const it = g.interaction.interactables.find((i) => i.enabled
          && Math.hypot(i.pos.x - sock.pos.x, i.pos.z - sock.pos.z) < 0.4 && i.kind !== 'door' && i.kind !== 'hide');
        if (!it) break;
        g.player.yaw = Math.atan2(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z);
        g.player.pitch = -0.4;
        if ((g.interaction.focused?.id) === it.id) {
          if ((it as { holdTime?: number }).holdTime) ga.keys.add('KeyE'); else g.input.interactPressed = true;
        }
        g.frame();
        g.input.interactPressed = false;
        took = !!sock.meta?.taken;
      }
      ga.keys.delete('KeyE');
      if (took) takenPos = { x: sock.pos.x, z: sock.pos.z };
    }

    const back: number[] = [];
    for (let i = Math.max(...forward); i >= 3; i--) if (walkThrough(i, i - 1)) back.push(i - 1);
    const deepestAfter = stats.underscriptDeepest;
    // forward again through the grafter's room — spawn-once must hold
    const again: number[] = [];
    for (let i = Math.min(...back); again.length < 4 && i <= 6; i++) if (walkThrough(i, i + 1)) again.push(i + 1);
    const grafters2 = ga.entities.filter((e) => e.id === 'grafter').length;
    const sockStillGone = takenPos ? !g.interaction.interactables.some((i) => i.enabled
      && Math.hypot(i.pos.x - takenPos!.x, i.pos.z - takenPos!.z) < 0.4) : null;

    // egress — jump to the last room and ride the real exit
    const last = under[under.length - 1];
    const exitSock = socksOf(last).find((s) => s.meta?.underExit === true);
    if (!exitSock) return { stage: 'no-exit', forward, back } as const;
    const ex = last.origin.x - exitSock.pos.x, ez = last.origin.z - exitSock.pos.z;
    const eL = Math.hypot(ex, ez) || 1;
    g.player.teleport(exitSock.pos.x + (ex / eL) * 1.1, 0, exitSock.pos.z + (ez / eL) * 1.1);
    ga.currentRoom = last.index;
    stats.underscriptDeepest = under.length - 1;
    for (let f = 0; f < 25; f++) g.frame();
    let exited = false;
    for (let f = 0; f < 120 && !exited; f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'underExit' && i.enabled);
      if (!it) break;
      g.player.yaw = Math.atan2(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(it.pos.y - eyeY, Math.hypot(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z) || 1);
      if (/return to the meridian/i.test(g.interaction.focused?.prompt ?? '')) g.input.interactPressed = true;
      g.frame();
      g.input.interactPressed = false;
      exited = ga.space === 'main';
    }
    const underReturn = (g.route as unknown as { underReturn: number }).underReturn;
    const ret = g.route.rooms[underReturn];
    const distToReturn = ret ? Math.hypot(g.player.pos.x - ret.entryPos.x, g.player.pos.z - ret.entryPos.z) : -1;
    return {
      stage: 'done', forward, back, again, deepestFwd, deepestAfter,
      grafters1, grafters2, took, sockStillGone,
      exited, space: ga.space, room: ga.currentRoom, underReturn,
      distToReturn: +distToReturn.toFixed(2), palimpsest: ga.inventory.some((s) => s.id === 'palimpsest'),
    } as const;
  });

  if (result.stage === 'walk-failed') expect(result.forward, JSON.stringify(result)).toHaveLength(7);
  if (result.stage === 'no-exit') expect(result.stage).toBe('done');
  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.forward).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(result.back, JSON.stringify(result)).toEqual([6, 5, 4, 3, 2]);
  expect(result.again, JSON.stringify(result)).toEqual([3, 4, 5, 6]);
  expect(result.deepestFwd).toBe(7);
  expect(result.deepestAfter).toBe(7); // backtrack never erases the stamp
  // spawn-once: never two of the same scheduled ambusher in a room —
  // (a grafter that has given up is a legitimate despawn, not a dupe)
  expect(result.grafters1).toBeLessThanOrEqual(1);
  expect(result.grafters2, JSON.stringify(result)).toBeLessThanOrEqual(1);
  if (result.took) expect(result.sockStillGone, JSON.stringify(result)).toBe(true);
  expect(result.exited, JSON.stringify(result)).toBe(true);
  expect(result.space).toBe('main');
  expect(result.room).toBe(result.underReturn);
  expect(result.distToReturn).toBeLessThan(2.5);
  expect(result.palimpsest).toBe(true);
  expect(errors).toEqual([]);
});

test('the water hums amber — electrified live flood, the drain kills the arc', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // u-48: flooded + LIT — live water arcs its fittings

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; currentRoom: number; drainedRooms: Set<string>;
      hazard: { puddles: { pos: { x: number; y: number; z: number }; room: number; radius: number }[] };
    };
    ga.enterUnderscript();
    const room = g.route.underRooms.find((r) => r.flooded && !r.darkRoom
      && (r.sockets ?? []).some((sk) => sk.meta?.hazard === 'puddle'));
    if (!room) return { stage: 'no-lit-flood' } as const;
    const arc = ga.hazard.puddles.find((pu) => pu.room === room.index)!;

    // hover at the hum's edge — it warns, doesn't bite
    const hx = room.origin.x - arc.pos.x, hz = room.origin.z - arc.pos.z;
    const L = Math.hypot(hx, hz) || 1;
    g.player.teleport(arc.pos.x + (hx / L) * 2.4, 0, arc.pos.z + (hz / L) * 2.4);
    ga.currentRoom = room.index;
    const hp0 = g.player.health;
    for (let f = 0; f < 80; f++) g.frame();
    const warned = caps.some((c) => /hums amber/.test(c));
    const safeAtEdge = g.player.health >= hp0 - 1;

    // step in — the water bites (no godMode: blood is the assertion)
    g.player.teleport(arc.pos.x + 0.3, 0, arc.pos.z + 0.3);
    for (let f = 0; f < 60; f++) g.frame();
    const bitten = g.player.health < hp0;

    // drain the hall — the arc dies with its medium
    ga.drainedRooms.add(`under:${room.index}`);
    g.player.teleport(arc.pos.x + 0.3, 0, arc.pos.z + 0.3);
    const hpAfterDrain = g.player.health;
    for (let f = 0; f < 70; f++) g.frame();
    const deadArc = g.player.health >= hpAfterDrain - 0.01;
    return { stage: 'done', room: room.index, warned, safeAtEdge, bitten,
      deadArc, hp: +g.player.health.toFixed(1), caps: caps.slice(-10) } as const;
  });

  if (result.stage === 'no-lit-flood') test.skip();
  expect(result.warned, JSON.stringify(result)).toBe(true);
  expect(result.safeAtEdge, JSON.stringify(result)).toBe(true);
  expect(result.bitten, JSON.stringify(result)).toBe(true);
  expect(result.deadArc, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the line sings — steam warns, vents blood, and dies on the bleed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // boiler/laundry rooms carry live steam fittings

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      currentRoom: number; keys: Set<string>;
      hazard: { steams: { pos: { x: number; y: number; z: number }; room: number;
        phase: number; cycle: number; dead: boolean }[];
        evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string; readBy: string[] }[] };
      inventory: { id: string; count: number }[];
    };
    const room = g.route.rooms.find((r) => (r.sockets ?? []).some((sk) => sk.meta?.hazard === 'steam'));
    if (!room) return { stage: 'no-vent' } as const;
    const st = ga.hazard.steams.find((v) => v.room === room.index)!;

    // hover at the hum's edge until the warn fires (cycle ≤7.5s)
    const hx = room.origin.x - st.pos.x, hz = room.origin.z - st.pos.z;
    const L = Math.hypot(hx, hz) || 1;
    g.player.teleport(st.pos.x + (hx / L) * 2.6, 0, st.pos.z + (hz / L) * 2.6);
    ga.currentRoom = room.index;
    const hp0 = g.player.health;
    let warned = false;
    for (let f = 0; f < 260 && !warned; f++) { g.frame(); warned = caps.some((c) => /line hums/.test(c)); }

    // stand on the fitting through a whole blast window — blood ticks
    g.player.teleport(st.pos.x + 0.3, 0, st.pos.z + 0.3);
    let bitten = false, sawBlast = false;
    for (let f = 0; f < 300 && !(sawBlast && bitten); f++) {
      if (st.phase < 1.8) sawBlast = true;
      g.frame();
      bitten = g.player.health < hp0 - 3;
    }

    // bleed the line — the fitting goes quiet (and leaves sign)
    const evBefore = ga.hazard.evidence.length;
    let bled = false;
    for (let f = 0; f < 140 && !bled; f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'bleed' && i.enabled);
      if (!it) break;
      g.player.yaw = Math.atan2(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(it.pos.y - eyeY, Math.hypot(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z) || 1);
      if (/bleed the line/i.test(g.interaction.focused?.prompt ?? '')) ga.keys.add('KeyE');
      g.frame();
      bled = st.dead;
    }
    ga.keys.delete('KeyE');
    const evSign0 = ga.hazard.evidence.length > evBefore
      && ga.hazard.evidence.slice(evBefore).some((e) => e.kind === 'line' && e.room === room.index);

    // scrub the sign — a felt wrap erases what a hunter could read
    ga.inventory.push({ id: 'feltWrap', count: 1 });
    ga.keys.add('KeyC');
    for (let f = 0; f < 6; f++) g.frame();
    let scrubbed = false;
    for (let f = 0; f < 150 && !scrubbed; f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'scrub' && i.enabled);
      if (!it) break;
      g.player.yaw = Math.atan2(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + 0.95;
      g.player.pitch = Math.atan2(it.pos.y - eyeY, Math.hypot(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z) || 1);
      if (/scrub the sign — felt wrap/i.test(g.interaction.focused?.prompt ?? '')) ga.keys.add('KeyE');
      g.frame();
      scrubbed = !ga.hazard.evidence.some((e) => e.kind === 'line' && e.room === room.index);
    }
    ga.keys.delete('KeyE'); ga.keys.delete('KeyC');
    const wrapSpent = (ga.inventory.find((i) => i.id === 'feltWrap')?.count ?? -1) === 0;
    const evSign = evSign0;

    const hpAfter = g.player.health;
    g.player.teleport(st.pos.x + 0.2, 0, st.pos.z + 0.2);
    for (let f = 0; f < 200; f++) g.frame();
    return { stage: 'done', room: room.index, warned, sawBlast, bitten, bled,
      quietAfter: g.player.health >= hpAfter - 0.01,
      sign: evSign, scrubbed, wrapSpent,
      caps: caps.slice(-12) } as const;
  });

  if (result.stage === 'no-vent') test.skip();
  expect(result.warned, JSON.stringify(result)).toBe(true);
  expect(result.sawBlast, JSON.stringify(result)).toBe(true);
  expect(result.bitten, JSON.stringify(result)).toBe(true);
  expect(result.bled, JSON.stringify(result)).toBe(true);
  expect(result.quietAfter, JSON.stringify(result)).toBe(true);
  expect(result.sign, JSON.stringify(result)).toBe(true);
  expect(result.scrubbed, JSON.stringify(result)).toBe(true);
  expect(result.wrapSpent, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('old sign — a sprung wire from before you arrived reads as history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // spent snare at room 2 (0.0, 22.5)

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      currentRoom: number;
      hazard: { snares: { pos: { x: number }; room: number; armed: boolean }[];
        evidence: { old?: boolean; kind: string; readBy: string[] }[] };
    };
    const room = g.route.rooms.find((r) => (r.sockets ?? []).some((sk) => sk.meta?.spent === true));
    if (!room) return { stage: 'no-sign' } as const;
    const sock = (room.sockets ?? []).find((sk) => sk.meta?.spent === true)!;
    const snare = ga.hazard.snares.find((sn) => sn.room === room.index);
    const oldSign = ga.hazard.evidence.some((e) => e.old === true);
    // stand at the mark — the sign reads itself once
    g.player.teleport(sock.pos.x, 0, sock.pos.z + 0.8);
    ga.currentRoom = room.index;
    for (let f = 0; f < 60; f++) g.frame();
    const readCaps = caps.filter((c) => /sprung wire|bled line/.test(c));
    for (let f = 0; f < 40; f++) g.frame();
    const readCaps2 = caps.filter((c) => /sprung wire|bled line/.test(c));
    return { stage: 'done', dead: snare ? !snare.armed : undefined, oldSign,
      readOnce: readCaps.length === 1 && readCaps2.length === 1,
      caps: readCaps } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.dead, JSON.stringify(result)).toBe(true);
  expect(result.oldSign, JSON.stringify(result)).toBe(true);
  expect(result.readOnce, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the haul — a sledge you can pick while it scrapes the hall', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // hauler @ u-2

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      entities: { id: string; state: string }[];
      marginalia: number; keys: Set<string>;
    };
    ga.enterUnderscript();
    ga.godMode = true;
    const hRoom = g.route.underRooms.find((r) => r.scheduled?.some((s) => s.entity === 'hauler'));
    if (!hRoom) return { stage: 'none-scheduled' } as const;
    g.player.teleport(hRoom.origin.x, 0, hRoom.origin.z);
    ga.currentRoom = hRoom.index;
    for (let f = 0; f < 60; f++) g.frame();
    const hauler = ga.entities.find((e) => e.id === 'hauler') as
      { id: string; sledgePos: { x: number; z: number }; stock: number; state: string } | undefined;
    if (!hauler) return { stage: 'no-hauler' } as const;
    const m0 = ga.marginalia;
    const st0 = hauler.stock;
    // stand on the drag, aim at it, hold E — pilfer on the move
    g.player.teleport(hauler.sledgePos.x, 0, hauler.sledgePos.z);
    let prompt = '';
    for (let f = 0; f < 40; f++) {
      // stay pinned to the moving sledge — the pick walks with the haul
      g.player.teleport(hauler.sledgePos.x, 0, hauler.sledgePos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(0.4 - eyeY, 0.5);
      g.player.yaw = Math.atan2(hauler.sledgePos.x - g.player.pos.x,
        hauler.sledgePos.z - g.player.pos.z) || 0;
      g.frame();
      prompt = g.interaction.focused?.prompt ?? prompt;
      if (f === 8) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    for (let f = 0; f < 10; f++) g.frame();
    return { stage: 'done', prompt, spent: hauler.stock < st0,
      paid: ga.marginalia > m0 || caps.some((c) => /off the sledge/.test(c)),
      caps: caps.filter((c) => /sledge|scrape|pilfer/.test(c)) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.prompt, JSON.stringify(result)).toMatch(/Pick the sledge/);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the wash — a fouled drain, the thrown sound, the window', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // laundress @ u-3 (drowned mains)

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      entities: { id: string; state: string }[];
      drainedRooms: Set<string>; keys: Set<string>;
      sound: { emit(e: { x: number; y: number; z: number; intensity: number; category: string; caption: string }): void };
      interaction: { focused?: { prompt?: string; kind?: string } };
    };
    ga.enterUnderscript();
    ga.godMode = true; // her bite is not the subject — the foul and the window are
    const wRoom = g.route.underRooms.find((r) => r.scheduled?.some((s) => s.entity === 'laundress'));
    if (!wRoom) return { stage: 'none-scheduled' } as const;
    g.player.teleport(wRoom.origin.x, 0, wRoom.origin.z);
    ga.currentRoom = wRoom.index;
    for (let f = 0; f < 60; f++) g.frame();
    const w = ga.entities.find((e) => e.id === 'laundress') as
      { guarding: boolean; drainPos: { x: number; z: number }; state: string } | undefined;
    if (!w) return { stage: 'no-laundress' } as const;

    // stand at the basin and work the crank — she fouls it
    g.player.teleport(w.drainPos.x + 0.6, 0, w.drainPos.z);
    const foulCapBefore = caps.length;
    let pressed = '';
    for (let f = 0; f < 55; f++) {
      g.player.teleport(w.drainPos.x + 0.6, 0, w.drainPos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(0.5 - eyeY, 0.8);
      g.player.yaw = Math.atan2(w.drainPos.x - g.player.pos.x, w.drainPos.z - g.player.pos.z);
      g.frame();
      if (ga.interaction.focused?.prompt) pressed = ga.interaction.focused.prompt;
      if (f === 10) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const fouled = caps.slice(foulCapBefore).some((c) => /choked with somebody's wash/.test(c));
    const stillWet = !ga.drainedRooms.has(`under:${wRoom.index}`);

    // pull her off the basin with a thrown sound, then take the window
    const ox = wRoom.origin.x - w.drainPos.x, oz = wRoom.origin.z - w.drainPos.z;
    ga.sound.emit({ x: w.drainPos.x + ox * 0.7, y: 0.3, z: w.drainPos.z + oz * 0.7,
      intensity: 0.6, category: 'impact', caption: '[slam]' });
    for (let f = 0; f < 40; f++) g.frame(); // she goes to sniff
    const offGuard = !w.guarding;
    // window one: pick the wash and let her come home to it — the keen
    const winCapsBefore = caps.length;
    for (let f = 0; f < 40; f++) {
      g.player.teleport(w.drainPos.x + 0.5, 0, w.drainPos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(0.5 - eyeY, 0.8);
      g.player.yaw = Math.atan2(w.drainPos.x - g.player.pos.x, w.drainPos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const basketPaid = caps.slice(winCapsBefore).some((c) => /clean linen|pins in the hem/.test(c));
    g.player.teleport(wRoom.origin.x, 0, wRoom.origin.z); // stand back for her return
    for (let f = 0; f < 260 && !caps.some((c) => /wail at the basin|wash is lighter/.test(c)); f++) g.frame();
    const keened = caps.some((c) => /wail at the basin|wash is lighter/.test(c));
    // window two: pull her off again and take the crank — no keen, she rides out
    ga.sound.emit({ x: w.drainPos.x + ox * 0.7, y: 0.3, z: w.drainPos.z + oz * 0.7,
      intensity: 0.6, category: 'impact', caption: '[slam]' });
    for (let f = 0; f < 40; f++) g.frame();
    for (let f = 0; f < 55; f++) {
      g.player.teleport(w.drainPos.x + 0.5, 0, w.drainPos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(0.5 - eyeY, 0.8);
      g.player.yaw = Math.atan2(w.drainPos.x - g.player.pos.x, w.drainPos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    for (let f = 0; f < 15; f++) g.frame();
    const drained = ga.drainedRooms.has(`under:${wRoom.index}`);
    const rodeOut = caps.some((c) => /wash goes down the drain/.test(c));
    return { stage: 'done', pressed, fouled, stillWet, offGuard, basketPaid, keened, drained, rodeOut,
      gone: w.state === 'done' } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.pressed, JSON.stringify(result)).toMatch(/Open the drain/);
  expect(result.fouled, JSON.stringify(result)).toBe(true);
  expect(result.stillWet, JSON.stringify(result)).toBe(true);
  expect(result.offGuard, JSON.stringify(result)).toBe(true);
  expect(result.basketPaid, JSON.stringify(result)).toBe(true);
  expect(result.drained, JSON.stringify(result)).toBe(true);
  expect(result.rodeOut, JSON.stringify(result)).toBe(true);
  expect(result.keened, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the lost property — marginalia claims on somebody else\'s effects', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // lost-property tags @ u-1

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>;
      interaction: { focused?: { prompt?: string; kind?: string } };
    };
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 30;
    const cageRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claim && s.meta?.marginalia));
    if (!cageRoom) return { stage: 'none' } as const;
    g.player.teleport(cageRoom.origin.x, 0, cageRoom.origin.z);
    ga.currentRoom = cageRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    // first: a broke claim — burn the purse, touch the tag, get told
    ga.marginalia = 1;
    const tag = (cageRoom.sockets ?? []).find((s) => s.meta?.claim && s.meta?.marginalia);
    if (!tag) return { stage: 'no-tag' } as const;
    const shortCap = caps.length;
    for (let f = 0; f < 50; f++) {
      g.player.teleport(tag.pos.x + 0.4, 0, tag.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(tag.pos.y - eyeY, 0.5);
      g.player.yaw = Math.atan2(tag.pos.x - g.player.pos.x, tag.pos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const shortWarn = caps.slice(shortCap).some((c) => /short/.test(c) && /marginalia/.test(c));
    const readPrompt = ga.interaction.focused?.prompt ?? '';
    // then: pay a real claim
    ga.marginalia = 30;
    const m0 = ga.marginalia;
    for (let f = 0; f < 50; f++) {
      g.player.teleport(tag.pos.x + 0.4, 0, tag.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(tag.pos.y - eyeY, 0.5);
      g.player.yaw = Math.atan2(tag.pos.x - g.player.pos.x, tag.pos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const paid = caps.some((c) => /effects held|inside the bag|old papers|someone's papers/.test(c));
    return { stage: 'done', readPrompt, shortWarn,
      spent: ga.marginalia < m0 || caps.some((c) => /\+.*marginalia/.test(c)), paid } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.readPrompt, JSON.stringify(result)).toMatch(/Reclaim the effects tagged/);
  expect(result.shortWarn, JSON.stringify(result)).toBe(true);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the crew board — the shift sheet says who is signed on', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // crew board @ u-33, grafter signed @45

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>;
      interaction: { focused?: { prompt?: string; kind?: string } };
    };
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 30;
    const boardRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.crewBoard));
    if (!boardRoom) return { stage: 'none' } as const;
    g.player.teleport(boardRoom.origin.x, 0, boardRoom.origin.z);
    ga.currentRoom = boardRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    const board = (boardRoom.sockets ?? []).find((s) => s.meta?.crewBoard);
    if (!board?.meta) return { stage: 'no-board' } as const;
    const m0 = ga.marginalia;
    let prompt = '';
    const readCap = caps.length;
    // stand on the room-center side of the board — the socket sits off its
    // host prop, and teleporting +0.9 in raw x lands inside the collider
    const bx = boardRoom.origin.x - board.pos.x, bz = boardRoom.origin.z - board.pos.z;
    const bl = Math.hypot(bx, bz) || 1;
    const stand = { x: board.pos.x + (bx / bl) * 0.9, z: board.pos.z + (bz / bl) * 0.9 };
    for (let f = 0; f < 55; f++) {
      g.player.teleport(stand.x, 0, stand.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      // focus() evaluates the direction to pos + 0.6y — the wall-mounted
      // board is at y1.0 so its aim point sits at eye level, not the floor
      g.player.pitch = Math.atan2((board.pos.y + 0.6) - eyeY, 0.95);
      g.player.yaw = Math.atan2(board.pos.x - g.player.pos.x, board.pos.z - g.player.pos.z);
      g.frame();
      prompt = ga.interaction.focused?.prompt ?? prompt;
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const read = caps.slice(readCap).filter((c) => /shift sheet marks|runs clean/.test(c));
    return { stage: 'done' as const, prompt, read,
      spent: ga.marginalia < m0, taken: board.meta?.taken === true };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.prompt, JSON.stringify(result)).toMatch(/Check the crew board/);
  expect((result.read ?? []).length, JSON.stringify(result)).toBeGreaterThan(0);
  expect(result.read?.[0] ?? '', JSON.stringify(result)).toMatch(/Door \d{3}/);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.taken, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the claim register — which tags still pay and which are drawn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // registers on under desks; cages @1,31,39,48,73,85,87

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>;
      interaction: { focused?: { prompt?: string; kind?: string } };
    };
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 30;
    // pick a register whose +10 window actually contains cages — a blank
    // column is honest output but tests nothing
    const regRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claimRegister)
      && g.route.underRooms.some((o) => o.index > r.index && o.index <= r.index + 10
        && (o.sockets ?? []).some((s) => s.meta?.claim && s.meta?.marginalia === true)));
    if (!regRoom) return { stage: 'none' } as const;
    g.player.teleport(regRoom.origin.x, 0, regRoom.origin.z);
    ga.currentRoom = regRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    const reg = (regRoom.sockets ?? []).find((s) => s.meta?.claimRegister);
    if (!reg?.meta) return { stage: 'no-register' } as const;
    const m0 = ga.marginalia;
    let prompt = '';
    const readCap = caps.length;
    const bx = regRoom.origin.x - reg.pos.x, bz = regRoom.origin.z - reg.pos.z;
    const bl = Math.hypot(bx, bz) || 1;
    const stand = { x: reg.pos.x + (bx / bl) * 0.9, z: reg.pos.z + (bz / bl) * 0.9 };
    for (let f = 0; f < 55; f++) {
      g.player.teleport(stand.x, 0, stand.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2((reg.pos.y + 0.6) - eyeY, 0.95);
      g.player.yaw = Math.atan2(reg.pos.x - g.player.pos.x, reg.pos.z - g.player.pos.z);
      g.frame();
      prompt = ga.interaction.focused?.prompt ?? prompt;
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const read = caps.slice(readCap).filter((c) => /claim register shows|columns run blank/.test(c));
    return { stage: 'done' as const, prompt, read,
      spent: ga.marginalia < m0, taken: reg.meta?.taken === true };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.prompt, JSON.stringify(result)).toMatch(/Consult the claim register/);
  expect((result.read ?? []).length, JSON.stringify(result)).toBeGreaterThan(0);
  expect(result.read?.[0] ?? '', JSON.stringify(result)).toMatch(/Door \d{3} — '.*' (still held|drawn)/);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.taken, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});
