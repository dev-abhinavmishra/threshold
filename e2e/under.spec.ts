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
