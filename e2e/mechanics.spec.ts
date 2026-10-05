import { test, expect, Page } from '@playwright/test';

// Sim-drive coverage for three untested mechanics — same harness as the
// chase/hiding tests: fixed-step clock + manual g.frame() so SwiftShader's
// starved rAF doesn't matter; the real interact/entity/minigame code paths
// run. Standard 'threshold' seed — the QA route has no branch doors and
// maelstrom/witness schedule past index 55, so only a full route carries
// the real fixtures.

test.setTimeout(300_000);

async function seededRun(page: Page): Promise<void> {
  await page.goto('/?debug');
  const input = page.locator('.seed-input');
  await input.evaluate((el: HTMLInputElement) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, 'threshold');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Seeded Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 90_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame, undefined, { timeout: 90_000 });
}

test('witness drains health while held in sight, stops when faced away', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as {
      __thresholdGame: {
        renderFrame(): void;
        clock: { tick(): boolean; dt: number; time: number };
        godMode: boolean;
        frame(): void;
        currentRoom: number;
        player: {
          pos: { x: number; y: number; z: number };
          yaw: number; pitch: number; eyeHeight: number; health: number;
          dead: boolean;
          teleport(x: number, y: number, z: number, yaw?: number): void;
        };
        entities: { id: string; state: string; threatPos?(): { x: number; y: number; z: number } }[];
        spawnById(id: string): void;
        route: { rooms: { index: number; origin: { x: number; z: number } }[] };
      };
    }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = false;
    g.player.health = 100;

    g.spawnById('witness');
    const w = g.entities.find((e) => e.id === 'witness');
    if (!w) return { stage: 'no-witness' } as const;
    // The witness anchors at a room edge of the player's current room.
    const wp = w.threatPos!();
    // Stand 6m off in the player's current room direction, facing it.
    const room = g.route.rooms[g.currentRoom];
    const dx = room.origin.x - wp.x, dz = room.origin.z - wp.z;
    const L = Math.hypot(dx, dz) || 1;
    g.player.teleport(wp.x + (dx / L) * 6, 0, wp.z + (dz / L) * 6);
    const face = () => {
      const ax = wp.x - g.player.pos.x, az = wp.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(1.4 - eyeY, Math.hypot(ax, az) || 1);
    };
    face();
    // The camera pull drags yaw back toward the witness — re-pin each
    // frame like a player resisting would. Tuning drains ~14/s so 3s of
    // held sight proves the drain without reaching 0.
    const h0 = g.player.health;
    let framesFaced = 0;
    for (let f = 0; f < 90 && !g.player.dead; f++) { face(); g.frame(); framesFaced++; }
    const drained = g.player.health;
    const dead = g.player.dead;

    // Now break line of sight — pin yaw 180° away, health must stop falling.
    let stable = true;
    const hBefore = g.player.health;
    for (let f = 0; f < 120 && !g.player.dead; f++) {
      const ax = wp.x - g.player.pos.x, az = wp.z - g.player.pos.z;
      g.player.yaw = Math.atan2(-ax, -az);
      g.player.pitch = 0;
      g.frame();
      if (g.player.health < hBefore - 0.001) { stable = false; break; }
    }
    return { stage: 'done', framesFaced, drained, h0, dead, stable, hEnd: g.player.health };
  });

  expect(result.stage).toBe('done');
  expect(result.dead).toBe(false);
  expect(result.drained).toBeLessThan(result.h0! - 1); // real drain happened
  expect(result.stable).toBe(true);                    // looking away stops it
  expect(errors).toEqual([]);
});

test('maelstrom stabilize minigame: rhythm hold succeeds, passive fails', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as {
      __thresholdGame: {
        renderFrame(): void;
        clock: { tick(): boolean; dt: number; time: number };
        godMode: boolean;
        frame(): void;
        input: { interactPressed: boolean };
        interaction: { focused: { prompt: string } | null };
        currentRoom: number;
        keys: Set<string>;
        stabilize: { needle: number; zone: number; timeLeft: number; failT: number } | null;
        player: {
          pos: { x: number; y: number; z: number };
          yaw: number; pitch: number; eyeHeight: number; health: number;
          hiddenSpot: { id: string } | null;
          dead: boolean;
          teleport(x: number, y: number, z: number, yaw?: number): void;
        };
        entities: { id: string; state: string; stabilizeTriggered?: boolean }[];
        spawnById(id: string): void;
        route: { rooms: {
          index: number; origin: { x: number; z: number };
          hidingSpots: { id: string; kind: string; exitPos: { x: number; y: number; z: number }; trappedBy?: string }[];
        }[] };
      };
    }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = false;
    g.player.health = 100;

    const aimAt = (p: { x: number; y: number; z: number }) => {
      const dx = p.x - g.player.pos.x, dz = p.z - g.player.pos.z;
      g.player.yaw = Math.atan2(dx, dz);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const dist = Math.hypot(dx, dz);
      g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(p.y - eyeY, dist || 1)));
    };

    // Enter a real hiding spot through the interact path (same approach
    // as the hiding spec — spots gate the maelstrom's attack).
    let hidden = false;
    outer:
    for (const room of g.route.rooms) {
      if (room.index < 2) continue;
      for (const spot of room.hidingSpots.filter((s) => !s.trappedBy)) {
        g.currentRoom = room.index;
        const dx = room.origin.x - spot.exitPos.x, dz = room.origin.z - spot.exitPos.z;
        const L = Math.hypot(dx, dz) || 1;
        g.player.teleport(spot.exitPos.x + (dx / L) * 1.1, 0, spot.exitPos.z + (dz / L) * 1.1, Math.atan2(-dx, -dz));
        for (let f = 0; f < 30; f++) {
          aimAt(spot.exitPos);
          g.input.interactPressed = /hide/i.test(g.interaction.focused?.prompt ?? '');
          g.frame();
          if (g.player.hiddenSpot) { hidden = true; break outer; }
        }
      }
    }
    if (!hidden) return { stage: 'no-spot' } as const;

    // Trigger the maelstrom's stabilize attack against the hidden player.
    g.spawnById('maelstrom');
    const mael = g.entities.find((e) => e.id === 'maelstrom');
    if (!mael) return { stage: 'no-maelstrom' } as const;
    mael.stabilizeTriggered = true;
    g.frame();
    if (!g.stabilize) return { stage: 'no-minigame' } as const;

    // Leg 1 — hold E only while the needle sits in the zone. Good rhythm
    // drains timeLeft ~3x during holds → success inside ~12s sim.
    let legs = 0, heldFrames = 0, lastFailT = 0;
    for (let f = 0; f < 700 && g.stabilize && !g.player.dead; f++) {
      const s = g.stabilize;
      lastFailT = s.failT;
      const holding = Math.abs(s.needle - 0.5) < s.zone;
      if (holding) { g.keys.add('KeyE'); heldFrames++; } else g.keys.delete('KeyE');
      g.frame();
    }
    g.keys.delete('KeyE');
    // Success signature: minigame closed with the player still hidden and
    // undamaged — the fail path costs 45hp + the spot. (The runner itself
    // completes its pass and despawns mid-minigame, so its flag is
    // unreachable here.)
    const won = !g.stabilize && !g.player.dead && !!g.player.hiddenSpot && g.player.health === 100;
    const leg1 = { stabilizeOpen: !!g.stabilize, hidden: !!g.player.hiddenSpot, health: g.player.health, heldFrames, lastFailT };
    legs++;

    // Leg 2 — the first runner has resolved its pass and been removed;
    // spawn a fresh one, re-trigger, and never hold: needle excursions
    // accumulate failT to 2.4 → 45 damage + exitHiding. Survives from 100.
    g.spawnById('maelstrom');
    const mael2 = g.entities.filter((e) => e.id === 'maelstrom').pop();
    if (!mael2) return { stage: 'no-second-maelstrom', won, legs } as const;
    mael2.stabilizeTriggered = true;
    g.frame();
    if (!g.stabilize) return { stage: 'no-second-minigame', won, legs } as const;
    const wasHidden: boolean = !!g.player.hiddenSpot;
    let leg2 = { stabilizeOpen: true as boolean, hidden: true as boolean };
    for (let f = 0; f < 1400 && g.stabilize && !g.player.dead; f++) {
      g.keys.delete('KeyE');
      g.frame();
    }
    leg2 = { stabilizeOpen: !!g.stabilize, hidden: !!g.player.hiddenSpot };
    const failed = !g.stabilize && !g.player.hiddenSpot && g.player.health < 100;
    legs++;
    return { stage: 'done', won, failed, wasHidden, legs, leg1, leg2, health: g.player.health, dead: g.player.dead };
  });

  expect(result.stage).toBe('done');
  expect(result.won, JSON.stringify(result)).toBe(true);     // rhythm hold clears the attack
  expect(result.failed).toBe(true);  // passive play costs 45hp + the spot
  expect(result.dead).toBe(false);
  expect(errors).toEqual([]);
});

test('toll door: too-poor refuses, paid opens and deducts imprints', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as {
      __thresholdGame: {
        renderFrame(): void;
        clock: { tick(): boolean; dt: number; time: number };
        godMode: boolean;
        frame(): void;
        imprints: number;
        input: { interactPressed: boolean };
        interaction: { focused: { prompt: string } | null };
        player: {
          pos: { x: number; y: number; z: number };
          yaw: number; pitch: number; eyeHeight: number;
          teleport(x: number, y: number, z: number, yaw?: number): void;
        };
        route: { rooms: {
          index: number; origin: { x: number; z: number };
          doors: { id: string; pos: { x: number; y: number; z: number }; locked: boolean; lockId?: string; openT: number; opening: boolean }[];
        }[] };
      };
    }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;

    // The 'threshold' seed generates toll doors on branch closets
    // (door-5-b1, door-17-b1) — take the first.
    let door: { id: string; pos: { x: number; y: number; z: number }; locked: boolean; lockId?: string; openT: number; opening: boolean } | null = null;
    let parent: { index: number; origin: { x: number; z: number } } | null = null;
    for (const room of g.route.rooms) {
      const d = room.doors.find((x) => x.lockId === 'toll');
      if (d) { door = d; parent = room; break; }
    }
    if (!door || !parent) return { stage: 'no-toll-door' } as const;

    // Stand 1.2m room-side of the leaf, aimed at its center like the
    // chase-test door approach.
    const dx = parent.origin.x - door.pos.x, dz = parent.origin.z - door.pos.z;
    const L = Math.hypot(dx, dz) || 1;
    g.player.teleport(door.pos.x + (dx / L) * 1.2, 0, door.pos.z + (dz / L) * 1.2);
    const aimAtLeaf = () => {
      const ax = door.pos.x - g.player.pos.x, az = door.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const dist = Math.hypot(ax, az);
      g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(door.pos.y + 0.6 - eyeY, dist || 1)));
    };

    // Too poor — 2 imprints vs the 3 toll: refuse + stays locked. Loot
    // near the leaf ('Take spark Flash') can out-focus it — take whatever
    // is focused like a player would so the door gets its turn.
    g.imprints = 2;
    let refusePrompt = '';
    for (let f = 0; f < 40 && door.locked; f++) {
      aimAtLeaf();
      refusePrompt = g.interaction.focused?.prompt ?? refusePrompt;
      g.input.interactPressed = /door|take|loot|search/i.test(refusePrompt);
      g.frame();
    }
    const stayedLocked = door.locked && g.imprints === 2;

    // Paid — 5 imprints: unlock takes 3, door opens, 2 remain.
    g.imprints = 5;
    let paid = false, presses = 0;
    const focusLog: string[] = [];
    for (let f = 0; f < 60 && !paid; f++) {
      aimAtLeaf();
      const prompt = g.interaction.focused?.prompt ?? '';
      if (f % 10 === 0) focusLog.push(prompt);
      g.input.interactPressed = /door|take|loot|search/i.test(prompt);
      if (g.input.interactPressed) presses++;
      g.frame();
      if (!door.locked) paid = true;
    }
    // Let the leaf animate open to prove the path completes.
    for (let f = 0; f < 60 && door.openT < 0.5; f++) g.frame();
    return { stage: 'done', refusePrompt, stayedLocked, paid, presses, focusLog, imprints: g.imprints, openT: door.openT };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.stayedLocked).toBe(true);
  expect(result.paid, `focus=${JSON.stringify(result.focusLog)} presses=${result.presses}`).toBe(true);
  expect(result.imprints).toBe(2);
  expect(result.openT).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

interface GSock { kind: string; pos: { x: number; y: number; z: number }; meta: Record<string, unknown> }
interface GDoor { pos: { x: number; y: number; z: number }; locked: boolean; lockId?: string; openT: number }
interface GRoom {
  index: number; templateId?: string;
  origin: { x: number; z: number };
  entryPos: { x: number; y: number; z: number };
  sockets: GSock[]; doors: GDoor[];
}
interface ThresholdG {
  renderFrame(): void;
  clock: { tick(): boolean; dt: number; time: number };
  godMode: boolean;
  frame(): void;
  currentRoom: number;
  space: string;
  imprints: number;
  inventory: { id: string; count: number }[];
  milestones: { get(i: number): { clamps: Set<string> } | undefined };
  giveItem(id: string, n?: number): void;
  stats: { underscriptDeepest: number; underscriptCompleted: boolean };
  input: { interactPressed: boolean };
  keys: Set<string>;
  interaction: { focused?: { prompt: string; holdTime?: number } | null };
  player: {
    pos: { x: number; y: number; z: number };
    yaw: number; pitch: number; eyeHeight: number;
    teleport(x: number, y: number, z: number, yaw?: number): void;
  };
  route: {
    rooms: GRoom[]; underRooms: GRoom[]; underReturn: number;
    keyPairs: { keyRoom: number; lockRoom: number; lockId: string }[];
  };
}

test('vend machine refuses on short funds, sells on exact pay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    // Stand on the interior side of an interactable — a fixed world offset
    // can land inside a wall/prop and shove the player back out.
    const standAt = (room: GRoom, p: { x: number; z: number }, r = 1.15) => {
      const dx = room.origin.x - p.x, dz = room.origin.z - p.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(p.x + (dx / L) * r, 0, p.z + (dz / L) * r);
    };
    const drive = (at: { x: number; y: number; z: number }, match: RegExp, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.6 - eyeY, Math.hypot(ax, az) || 1)));
        const prompt = g.interaction.focused?.prompt ?? '';
        if (f % 12 === 0) seen.push(prompt);
        if (match.test(prompt)) {
          if (g.interaction.focused?.holdTime) g.keys.add('KeyE'); else g.input.interactPressed = true;
        } else {
          g.keys.delete('KeyE'); g.input.interactPressed = false;
        }
        g.frame();
        g.input.interactPressed = false;
      }
      g.keys.delete('KeyE');
      return seen.join('|');
    };

    let sock: GSock | null = null, room: GRoom | null = null;
    for (const r of g.route.rooms) {
      const s = r.sockets.find((x) => x.meta?.vend === true && x.meta.taken !== true);
      if (s) { sock = s; room = r; break; }
    }
    if (!sock || !room) return { stage: 'no-vend' } as const;
    const price = sock.meta.price as number, item = sock.meta.vendItem as string;
    g.currentRoom = room.index;
    standAt(room, sock.pos);

    // Short funds: the feed completes and the machine refuses.
    g.imprints = price - 1;
    const promptsA = drive(sock.pos, /feed the machine/i, () => false, 70);
    const refused = sock.meta.taken !== true && g.imprints === price - 1;

    // Exact pay: feed again — charged, item granted, socket spent.
    g.imprints = price;
    standAt(room, sock.pos);
    drive(sock.pos, /feed the machine/i, () => sock.meta.taken === true, 70);
    const inv = g.inventory.find((s) => s.id === item);
    const sold = sock.meta.taken === true && g.imprints === 0 && !!inv;
    return { stage: 'done', price, item, promptsA, refused, sold, imprints: g.imprints, inv: g.inventory.map((s) => s.id) };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.refused, result.promptsA).toBe(true);
  expect(result.sold, JSON.stringify(result.inv)).toBe(true);
  expect(errors).toEqual([]);
});

test('keyed door: find the brass key, return, unlock the lock', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    // Stand on the interior side of an interactable — a fixed world offset
    // can land inside a wall/prop and shove the player back out.
    const standAt = (room: GRoom, p: { x: number; z: number }, r = 1.15) => {
      const dx = room.origin.x - p.x, dz = room.origin.z - p.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(p.x + (dx / L) * r, 0, p.z + (dz / L) * r);
    };
    const drive = (at: { x: number; y: number; z: number }, match: RegExp, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.6 - eyeY, Math.hypot(ax, az) || 1)));
        const prompt = g.interaction.focused?.prompt ?? '';
        if (f % 12 === 0) seen.push(prompt);
        if (match.test(prompt)) {
          if (g.interaction.focused?.holdTime) g.keys.add('KeyE'); else g.input.interactPressed = true;
        } else {
          g.keys.delete('KeyE'); g.input.interactPressed = false;
        }
        g.frame();
        g.input.interactPressed = false;
      }
      g.keys.delete('KeyE');
      return seen.join('|');
    };

    const pair = g.route.keyPairs[0];
    if (!pair) return { stage: 'no-keypair' } as const;
    const keyRoom = g.route.rooms.find((r) => r.index === pair.keyRoom);
    const lockRoom = g.route.rooms.find((r) => r.index === pair.lockRoom);
    const keySock = keyRoom?.sockets.find((s) => s.meta?.contains === 'doorKey' && s.meta?.lockId === pair.lockId);
    const door = lockRoom?.doors.find((d) => d.lockId === pair.lockId);
    if (!keyRoom || !lockRoom || !keySock || !door) return { stage: 'no-fixture' } as const;
    const wasLocked = door.locked === true;

    // Take the key from its socket in the key room.
    g.currentRoom = keyRoom.index;
    standAt(keyRoom, keySock.pos);
    const keyPrompts = drive(keySock.pos, /take|search|drawer|loot|sign/i,
      () => (g.inventory.find((x) => x.id === 'doorKey')?.count ?? 0) >= 1, 90);
    if (!keySock.meta.taken) return { stage: 'no-key', keyPrompts } as const;

    // Return and unlock — the held Unlock consumes the brass key.
    g.currentRoom = lockRoom.index;
    standAt(lockRoom, door.pos);
    const doorPrompts = drive(door.pos, /unlock|door|peek/i, () => !door.locked, 90);
    for (let f = 0; f < 60 && door.openT < 0.5; f++) g.frame();
    const keyLeft = g.inventory.find((x) => x.id === 'doorKey')?.count ?? 0;
    return { stage: 'done', wasLocked, keyPrompts, doorPrompts, paid: !door.locked, openT: door.openT, keyLeft };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.wasLocked).toBe(true);
  expect(result.paid, result.doorPrompts).toBe(true);
  expect(result.openT).toBeGreaterThan(0.5);
  expect(result.keyLeft).toBe(0);
  expect(errors).toEqual([]);
});

test('underscript gate: seal clamps + resonance key descend, exit returns with palimpsest', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    // Stand on the interior side of an interactable — a fixed world offset
    // can land inside a wall/prop and shove the player back out.
    const standAt = (room: GRoom, p: { x: number; z: number }, r = 1.15) => {
      const dx = room.origin.x - p.x, dz = room.origin.z - p.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(p.x + (dx / L) * r, 0, p.z + (dz / L) * r);
    };
    const drive = (at: { x: number; y: number; z: number }, match: RegExp, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.6 - eyeY, Math.hypot(ax, az) || 1)));
        const prompt = g.interaction.focused?.prompt ?? '';
        if (f % 12 === 0) seen.push(prompt);
        if (match.test(prompt)) {
          if (g.interaction.focused?.holdTime) g.keys.add('KeyE'); else g.input.interactPressed = true;
        } else {
          g.keys.delete('KeyE'); g.input.interactPressed = false;
        }
        g.frame();
        g.input.interactPressed = false;
      }
      g.keys.delete('KeyE');
      return seen.join('|');
    };

    const entrance = g.route.rooms.find((r) => r.templateId === 'ms-under-entrance');
    if (!entrance) return { stage: 'no-entrance' } as const;
    const gate = g.milestones.get(entrance.index);
    const doorSock = entrance.sockets.find((s) => s.meta?.underDoor === true);
    const clamps = entrance.sockets.filter((s) => !!s.meta?.sealClamp);
    if (!gate || !doorSock || clamps.length < 2) return { stage: 'no-fixture' } as const;
    g.currentRoom = entrance.index;

    // First refusal: sealed shut — no clamps released, no key.
    standAt(entrance, doorSock.pos);
    drive(doorSock.pos, /underscript|open|sealed|inspect/i, () => g.space === 'under', 30);
    const refusedEarly = g.space === 'main';

    // Release both hold-to-release clamps, then open with the resonance key.
    for (const c of clamps) {
      standAt(entrance, c.pos);
      drive(c.pos, /release seal clamp|take|search/i, () => false, 80);
    }
    const clampsDone = gate.clamps.size;
    g.giveItem('resonanceKey', 1);
    standAt(entrance, doorSock.pos);
    drive(doorSock.pos, /underscript|open|inspect/i, () => g.space === 'under', 60);
    const underStart = { room: g.currentRoom, space: g.space };
    if (g.space !== 'under') return { stage: 'no-descent', refusedEarly, clampsDone } as const;

    // Reach the deepest room, exit back to the Meridian.
    g.stats.underscriptDeepest = g.route.underRooms.length - 1;
    const exitRoom = g.route.underRooms[g.route.underRooms.length - 1];
    const exitSock = exitRoom.sockets.find((s) => s.meta?.underExit === true);
    if (!exitSock) return { stage: 'no-exit', refusedEarly, clampsDone, underStart } as const;
    g.currentRoom = exitRoom.index;
    standAt(exitRoom, exitSock.pos);
    drive(exitSock.pos, /return to the meridian|take|open/i, () => g.space === 'main', 60);
    return {
      stage: 'done', refusedEarly, clampsDone, underStart, space: g.space, room: g.currentRoom,
      palimpsest: g.inventory.some((s) => s.id === 'palimpsest'),
      completed: g.stats.underscriptCompleted === true, returnIdx: g.route.underReturn,
    };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.refusedEarly).toBe(true);
  expect(result.clampsDone).toBe(2);
  expect(result.underStart).toEqual({ room: 0, space: 'under' });
  expect(result.space).toBe('main');
  expect(result.completed).toBe(true);
  expect(result.palimpsest).toBe(true);
  expect(errors).toEqual([]);
});
