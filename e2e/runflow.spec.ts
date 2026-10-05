import { test, expect } from '@playwright/test';

/**
 * Run-flow regression: the death → retry loop must work end-to-end on the
 * production build. `?debug` exposes the game handle so the suite can force a
 * deterministic kill instead of driving a sighted entity to a killing blow.
 */


test('death shows the death screen and retry restarts the run', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

  // Force a kill — private at compile time, reachable at runtime.
  await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: { damagePlayer(n: number, s: string, h: string): void } }).__thresholdGame;
    g.damagePlayer(999, 'sweep', 'test kill');
  });

  await expect(page.locator('.overlay.death')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.death-title')).toHaveText('The threshold keeps you');

  // force: the death overlay fades in, so the button never reports 'stable'
  await page.getByRole('button', { name: 'Retry from checkpoint' }).click({ force: true });
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.overlay.death')).toHaveCount(0);

  // A second kill must still work — proves the retried run is live, not a ghost.
  await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: { damagePlayer(n: number, s: string, h: string): void } }).__thresholdGame;
    g.damagePlayer(999, 'sweep', 'test kill 2');
  });
  await expect(page.locator('.overlay.death')).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('quit to menu keeps the checkpoint; Continue resumes the run', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to Menu' }).click({ force: true });
  await expect(page.locator('.menu-inner')).toBeVisible({ timeout: 10_000 });

  // Checkpoint was written at run start — the menu must offer Continue.
  await page.getByRole('button', { name: 'Continue', exact: true }).click({ force: true });
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('underscript entry streams the subfloor and walks clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

  // Jump the threshold — enterUnderscript teleports into U-000 and checkpoints.
  const space = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: { enterUnderscript(): void; space: string } }).__thresholdGame;
    g.enterUnderscript();
    return g.space;
  });
  expect(space).toBe('under');

  for (let i = 0; i < 8; i++) {
    await page.keyboard.down('w');
    await page.waitForTimeout(650);
    await page.keyboard.up('w');
    await page.waitForTimeout(250);
  }
  expect(errors).toEqual([]);
});

test('victory shows the completion screen and returns to menu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

  // Crossing the Engine threshold is a hundred-room walk — force the same
  // code path the milestone calls.
  await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: { victory(): void } }).__thresholdGame;
    g.victory();
  });
  await expect(page.locator('.overlay.victory')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.victory-title')).toHaveText('The hundredth door closes behind you');

  await page.getByRole('button', { name: 'Return to threshold' }).click({ force: true });
  await expect(page.locator('.menu-inner')).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('chase room spawns the Pursuer and clears it at the end room', async ({ page }) => {
  // SwiftShader starves rAF so badly that real-time keyboard input barely
  // advances the sim (clock freezes at ~0.1s). Drive the game's own frame
  // loop instead: fixed-step clock + manual g.frame() calls with rendering
  // nooped — milestones, interactables, entities and the streamer all run
  // their real code paths; only rasterization is skipped. godMode keeps the
  // Pursuer from ending the scripted walk; the spawn/seal assertions stay.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

  const chaseIdx = await page.evaluate(() => {
    const g = (window as unknown as {
      __thresholdGame: {
        renderFrame(): void;
        clock: { tick(): boolean; dt: number; time: number };
        godMode: boolean;
        route: { rooms: { index: number; spec: { special?: string } }[] };
      };
    }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    return g.route.rooms.find((x) => x.spec.special === 'chase1')?.index ?? null;
  });
  expect(chaseIdx).not.toBeNull();

  // Jump to just inside the room before the chase — debug-jump semantics:
  // currentRoom AND player move together (the streamer windows on
  // currentRoom). Room origins can sit inside furniture, so stand a bit
  // back from the doorway instead of at the room center.
  await page.evaluate((idx: number) => {
    const g = (window as unknown as {
      __thresholdGame: {
        currentRoom: number;
        player: { teleport(x: number, y: number, z: number, yaw?: number): void };
        route: { rooms: { index: number; origin: { x: number; z: number }; doors: { id: string; pos: { x: number; z: number } }[] }[] };
      };
    }).__thresholdGame;
    const rooms = g.route.rooms;
    const prev = rooms[idx - 1], chase = rooms[idx];
    g.currentRoom = idx - 1;
    const door = chase.doors.find((d) => d.id.includes('-in')) ?? prev.doors[prev.doors.length - 1];
    const dx = prev.origin.x - door.pos.x, dz = prev.origin.z - door.pos.z;
    const L = Math.hypot(dx, dz) || 1;
    // pos.y is feet, not eye — groundHeight settles it
    g.player.teleport(door.pos.x + (dx / L) * 1.5, 0, door.pos.z + (dz / L) * 1.5, Math.atan2(-dx, -dz));
  }, chaseIdx!);

  // In-page sim walk: hold W, aim at the exit-door leaf (this room's -out or
  // the next room's -in leaf while it is closed). E is pressed ONLY when a
  // door prompt is focused — hiding spots sit next to doors and outscore
  // them in the focus ray, so blind E presses just hide the player. When
  // the door won't take focus the aim oscillates until it does. A jammed
  // door gets unlocked the same way a key would (this test covers
  // spawn+seal, not locks).
  const walkTo = (target: number, maxSec: number) => page.evaluate(({ target, maxSec }) => {
    const g = (window as unknown as {
      __thresholdGame: {
        currentRoom: number;
        frame(): void;
        keys: Set<string>;
        input: { interactPressed: boolean };
        interaction: { focused: { prompt: string } | null };
        player: { pos: { x: number; y: number; z: number }; yaw: number; pitch: number; eyeHeight: number; teleport(x: number, y: number, z: number, yaw?: number): void };
        route: { rooms: {
          index: number; origin: { x: number; z: number };
          doors: { id: string; pos: { x: number; y: number; z: number }; isMainRoute: boolean; falseDoor?: boolean; openT: number; locked: boolean; opening: boolean }[];
        }[] };
        entities: { id: string }[];
      };
    }).__thresholdGame;
    const rooms = g.route.rooms;
    const unlockCluster = (door: { pos: { x: number; z: number } }) => {
      for (const r of rooms) for (const d of r.doors) {
        if (Math.hypot(d.pos.x - door.pos.x, d.pos.z - door.pos.z) < 0.6) d.locked = false;
      }
    };
    g.keys.add('KeyW');
    let markX = g.player.pos.x, markZ = g.player.pos.z, stallWindows = 0, bypassed = 0;
    for (let f = Math.ceil(maxSec * 30); f > 0 && g.currentRoom < target; f--) {
      const cur = rooms[g.currentRoom];
      const next = rooms[Math.min(g.currentRoom + 1, rooms.length - 1)];
      const door = cur?.doors.find((d) => d.isMainRoute && !d.falseDoor && d.id.includes('-out'))
        ?? next?.doors.find((d) => d.isMainRoute && !d.falseDoor && d.id.includes('-in'));
      const t = door && door.openT < 0.8 ? door.pos : next.origin;
      const dist = Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z);
      const baseYaw = Math.atan2(t.x - g.player.pos.x, t.z - g.player.pos.z);
      g.player.yaw = baseYaw + (stallWindows > 0 ? Math.sin(f * 0.2) * 0.6 : 0);
      // Door interactables sit at leaf center (y+0.6) — level aim misses the
      // 0.86 align gate, so pitch the eye down at it like a player would.
      const aimY = door && door.openT < 0.8 ? door.pos.y + 0.6 : g.player.pos.y + g.player.eyeHeight;
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(aimY - eyeY, dist || 1)));
      const focused = g.interaction.focused?.prompt ?? '';
      g.input.interactPressed = /door/i.test(focused);
      g.frame();
      // Pinned players slide along colliders and jitter >0.005/frame, so
      // measure displacement over 15-frame windows instead of per frame.
      if (f % 15 === 0) {
        const moved = Math.hypot(g.player.pos.x - markX, g.player.pos.z - markZ);
        if (moved < 0.45) {
          stallWindows++;
          if (door && stallWindows >= 3 && door.locked) unlockCluster(door);
          // Adjacent props can out-focus the leaf forever in some layouts;
          // open the pos-cluster like the interact path would (door.opening).
          if (door && stallWindows >= 3 && door.openT < 0.8 && dist < 2.5) {
            for (const r of rooms) for (const d of r.doors) {
              if (Math.hypot(d.pos.x - door.pos.x, d.pos.z - door.pos.z) < 0.6) d.opening = true;
            }
          }
          // Pinned at an open doorway (prop/frame pinch in some layouts):
          // step through the gap — the test covers spawn+seal, not pathing.
          if (door && stallWindows >= 3 && door.openT >= 0.8 && dist < 2.5) {
            const dx = next.origin.x - door.pos.x, dz = next.origin.z - door.pos.z;
            const L = Math.hypot(dx, dz) || 1;
            g.player.teleport(door.pos.x + (dx / L) * 0.8, g.player.pos.y, door.pos.z + (dz / L) * 0.8, g.player.yaw);
            bypassed++; stallWindows = 0;
          } else if (stallWindows >= 3 && (!door || door.openT >= 0.8 || dist >= 2.5)) {
            // Wedged mid-room on furniture: step toward the target.
            const L = Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z) || 1;
            g.player.teleport(g.player.pos.x + ((t.x - g.player.pos.x) / L) * 2.5, g.player.pos.y, g.player.pos.z + ((t.z - g.player.pos.z) / L) * 2.5, g.player.yaw);
            bypassed++; stallWindows = 0;
          }
        } else { stallWindows = 0; markX = g.player.pos.x; markZ = g.player.pos.z; }
      }
    }
    g.keys.delete('KeyW');
    return { room: g.currentRoom, pursuer: g.entities.some((e) => e.id === 'pursuer'), bypassed };
  }, { target, maxSec });

  const entered = await walkTo(chaseIdx!, 25);
  expect(entered.room).toBeGreaterThanOrEqual(chaseIdx!);
  expect(entered.pursuer).toBe(true);

  const sealed = await walkTo(chaseIdx! + 3, 60);
  expect(sealed.room).toBeGreaterThanOrEqual(chaseIdx! + 3);
  // The Pursuer's despawn runs a beat after the seal room registers —
  // settle a second of sim time before asserting it's gone.
  const pursuerGone = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: { frame(): void; entities: { id: string }[] } }).__thresholdGame;
    for (let f = 0; f < 90 && g.entities.some((e) => e.id === 'pursuer'); f++) g.frame();
    return !g.entities.some((e) => e.id === 'pursuer');
  });
  expect(pursuerGone).toBe(true);
  expect(errors).toEqual([]);
});

test('hiding spot: enter hides the player, leave restores them', async ({ page }) => {
  // Sim-drive (same pattern as the chase test): fixed-step clock + manual
  // frame() so SwiftShader's starved rAF doesn't matter. Covers the real
  // interact path — focus scoring, enterHiding, exitHiding, protection.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

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
        player: {
          pos: { x: number; y: number; z: number };
          yaw: number; pitch: number; eyeHeight: number;
          hiddenSpot: { id: string; exitPos: { x: number; y: number; z: number } } | null;
          protection: string;
          dead: boolean;
          teleport(x: number, y: number, z: number, yaw?: number): void;
        };
        entities: { id: string; state: string }[];
        spawnById(id: string): void;
        route: { rooms: {
          index: number; origin: { x: number; z: number };
          hidingSpots: { id: string; kind: string; exitPos: { x: number; y: number; z: number }; trappedBy?: string }[];
        }[] };
      };
    }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;

    const rooms = g.route.rooms;
    const pressIfFocused = (re: RegExp) => { g.input.interactPressed = re.test(g.interaction.focused?.prompt ?? ''); g.frame(); };
    const aimAt = (p: { x: number; y: number; z: number }) => {
      const dx = p.x - g.player.pos.x, dz = p.z - g.player.pos.z;
      g.player.yaw = Math.atan2(dx, dz);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const dist = Math.hypot(dx, dz);
      g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(p.y - eyeY, dist || 1)));
    };

    // Try each candidate spot until one takes focus — some spots sit at
    // angles or ranges the focus ray can't reach from a fair approach.
    let entered: { room: number; spot: string } | null = null;
    outer:
    for (const room of rooms) {
      if (room.index < 2) continue; // skip the spawn room's staging
      const spots = room.hidingSpots.filter((s) => !s.trappedBy);
      for (const spot of spots) {
        g.currentRoom = room.index;
        // Stand inside the room facing the spot — exitPos is the interact
        // point, approach it from the room-center side.
        const dx = room.origin.x - spot.exitPos.x, dz = room.origin.z - spot.exitPos.z;
        const L = Math.hypot(dx, dz) || 1;
        g.player.teleport(spot.exitPos.x + (dx / L) * 1.1, 0, spot.exitPos.z + (dz / L) * 1.1, Math.atan2(-dx, -dz));
        for (let f = 0; f < 30; f++) {
          aimAt(spot.exitPos);
          pressIfFocused(/hide/i);
          if (g.player.hiddenSpot) break;
        }
        if (g.player.hiddenSpot) { entered = { room: room.index, spot: spot.id }; break outer; }
      }
    }
    if (!entered) return { ok: false, stage: 'no-spot-focused' };
    const hiddenProt = g.player.protection;
    const viewInside = !!g.player.hiddenSpot;

    // Hiding must actually protect: spawn a sweep while hidden with
    // godMode off — the runner passes through the player's room and the
    // spot's protection is the only thing between them.
    g.godMode = false;
    g.spawnById('sweep');
    // Done entities are disposed and dropped from g.entities — wait for
    // the runner to appear, then leave (or be caught mid-'done').
    let spawned = false, sweepDone = false;
    for (let f = 0; f < 4000; f++) {
      g.frame();
      const sw = g.entities.find((e) => e.id === 'sweep');
      if (sw) spawned = true;
      if (spawned && (!sw || sw.state === 'done')) { sweepDone = true; break; }
    }
    g.godMode = true;
    const survivedHidden = !g.player.dead && !!g.player.hiddenSpot;

    // While hidden the exitHide interactable ('Leave hiding') is the only
    // registered prompt — aim out at exitPos and leave through it.
    let focusedLeave = false;
    for (let f = 0; f < 30 && g.player.hiddenSpot; f++) {
      const spot = g.player.hiddenSpot;
      if (!spot) break;
      aimAt(spot.exitPos);
      if (/leave/i.test(g.interaction.focused?.prompt ?? '')) focusedLeave = true;
      pressIfFocused(/leave/i);
    }
    const left = !g.player.hiddenSpot;
    return { ok: left && viewInside, stage: 'exit', hiddenProt, focusedLeave, left, entered, sweepDone, survivedHidden };
  });

  expect(result.stage !== 'no-spot-focused' ? '' : 'no hiding spot took focus').toBe('');
  expect(result.hiddenProt).toBe('hidden');
  expect(result.sweepDone).toBe(true);
  expect(result.survivedHidden).toBe(true);
  expect(result.left).toBe(true);
  expect(errors).toEqual([]);
});

test('hollow trap + panic eject: struggle frees the player, panic ejects them', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

  const result = await page.evaluate(() => {
    const g = (window as unknown as {
      __thresholdGame: {
        renderFrame(): void;
        clock: { tick(): boolean; dt: number; time: number };
        godMode: boolean;
        frame(): void;
        startRun(opts: { seedText: string }): void;
        input: { interactPressed: boolean };
        interaction: { focused: { prompt: string } | null };
        currentRoom: number;
        player: {
          pos: { x: number; y: number; z: number };
          yaw: number; pitch: number; eyeHeight: number;
          hiddenSpot: { id: string; exitPos: { x: number; y: number; z: number } } | null;
          protection: string;
          panic: number;
          dead: boolean;
          teleport(x: number, y: number, z: number, yaw?: number): void;
        };
        entities: { id: string; state: string }[];
        spawnById(id: string): void;
        route: { rooms: {
          index: number; origin: { x: number; z: number };
          hidingSpots: { id: string; kind: string; exitPos: { x: number; y: number; z: number }; trappedBy?: string }[];
        }[] };
      };
    }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    // Hollow traps are rare on short runs — pin a seed known to carry them.
    g.startRun({ seedText: 'trap-seed-2' });
    g.renderFrame = () => {};
    for (let f = 0; f < 40; f++) g.frame(); // let the streamer rebuild

    const rooms = g.route.rooms;
    const pressIfFocused = (re: RegExp) => { g.input.interactPressed = re.test(g.interaction.focused?.prompt ?? ''); g.frame(); };
    const aimAt = (p: { x: number; y: number; z: number }) => {
      const dx = p.x - g.player.pos.x, dz = p.z - g.player.pos.z;
      g.player.yaw = Math.atan2(dx, dz);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const dist = Math.hypot(dx, dz);
      g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(p.y - eyeY, dist || 1)));
    };
    const enterSpot = (spot: { exitPos: { x: number; y: number; z: number } }, room: { origin: { x: number; z: number } }) => {
      const dx = room.origin.x - spot.exitPos.x, dz = room.origin.z - spot.exitPos.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(spot.exitPos.x + (dx / L) * 1.1, 0, spot.exitPos.z + (dz / L) * 1.1, Math.atan2(-dx, -dz));
      for (let f = 0; f < 30; f++) {
        aimAt(spot.exitPos);
        pressIfFocused(/hide/i);
        if (g.player.hiddenSpot) return true;
      }
      return false;
    };

    // --- part 1: hollow trap ---
    let trappedRoom = -1;
    let hollowSpawned = false, struggledOut = false;
    outer:
    for (const room of rooms) {
      if (room.index < 2) continue;
      for (const spot of room.hidingSpots) {
        if (spot.trappedBy !== 'hollow') continue;
        g.currentRoom = room.index;
        if (!enterSpot(spot, room)) continue;
        trappedRoom = room.index;
        // Grapple: each 'Leave hiding' press struggles; release needs 3.
        hollowSpawned = g.entities.some((e) => e.id === 'hollow');
        for (let f = 0; f < 40 && g.player.hiddenSpot; f++) {
          const s = g.player.hiddenSpot;
          if (s) aimAt(s.exitPos);
          pressIfFocused(/leave/i);
        }
        struggledOut = !g.player.hiddenSpot;
        break outer;
      }
    }
    if (trappedRoom < 0) return { stage: 'no-trapped-spot' };

    // --- part 2: panic eject ---
    // Hide again in a clean spot, push panic to the brink, and spawn a
    // corridor runner near — panic crosses 1 and ejects the body.
    let panicEjected = false, rehidden = false;
    let maxPanic = 0, engagedSeen = false, nearSeen = false;
    outer2:
    for (const room of rooms) {
      if (room.index < 2) continue;
      for (const spot of room.hidingSpots) {
        if (spot.trappedBy) continue;
        g.currentRoom = room.index;
        if (!enterSpot(spot, room)) continue;
        rehidden = true;
        g.player.panic = 0.99;
        g.spawnById('sweep');
        // Panic decays through the warn phase — hold it at the brink so the
        // first engaged near-pass crosses 1.
        for (let f = 0; f < 1200 && g.player.hiddenSpot; f++) {
          g.player.panic = Math.max(g.player.panic, 0.999);
          g.frame();
          maxPanic = Math.max(maxPanic, g.player.panic);
          const sw = g.entities.find((e) => e.id === 'sweep');
          if (sw?.state === 'engage') {
            engagedSeen = true;
            const pp = (sw as { posApprox?: () => { x: number; z: number } }).posApprox?.();
            if (pp && Math.hypot(pp.x - g.player.pos.x, pp.z - g.player.pos.z) < 30) nearSeen = true;
          }
        }
        panicEjected = !g.player.hiddenSpot;
        break outer2;
      }
    }
    return { stage: 'done', trappedRoom, hollowSpawned, struggledOut, rehidden, panicEjected, dead: g.player.dead, maxPanic, engagedSeen, nearSeen };
  });

  expect(result.stage).toBe('done');
  expect(result.hollowSpawned).toBe(true);
  expect(result.struggledOut).toBe(true);
  expect(result.rehidden).toBe(true);
  // The sweep must actually have engaged nearby — the eject is threat-driven,
  // not incidental.
  expect(result.engagedSeen).toBe(true);
  expect(result.nearSeen).toBe(true);
  expect(result.panicEjected).toBe(true);
  expect(result.dead).toBe(false);
  expect(errors).toEqual([]);
});

test('powered emissives die with room power: break and dim scale device glow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.getByRole('button', { name: /QA/ }).click();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

  const result = await page.evaluate(async () => {
    type Dev = { userData: { anim?: string; baseEm?: number }; material: { emissiveIntensity: number } };
    const g = (window as unknown as {
      __thresholdGame: {
        renderFrame(): void;
        clock: { tick(): boolean; dt: number; time: number };
        godMode: boolean;
        frame(): void;
        startRun(opts: { seedText: string }): void;
        flickerRoom(i: number, mode: 'break' | 'dim'): void;
        currentRoom: number;
        player: { pos: { x: number; y: number; z: number }; teleport(x: number, y: number, z: number): void };
        route: { rooms: { index: number; origin: { x: number; y: number; z: number } }[] };
        streamer: { get(i: number): { animated: Dev[] } | undefined };
      };
    }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    g.startRun({ seedText: 'trap-seed-2' });
    g.renderFrame = () => {};
    for (let f = 0; f < 40; f++) g.frame();

    // Find the first room carrying a powered emissive (device/screen/blink).
    let roomIndex = -1, before = 0;
    for (const room of g.route.rooms) {
      if (room.index < 1) continue;
      g.currentRoom = room.index;
      g.player.teleport(room.origin.x, room.origin.y, room.origin.z);
      for (let f = 0; f < 30 && g.streamer.get(room.index) === undefined; f++) g.frame();
      const built = g.streamer.get(room.index);
      const dev = built?.animated.find((o) => o.userData.anim === 'device' || o.userData.anim === 'screen' || o.userData.anim === 'blink');
      if (dev && dev.material.emissiveIntensity > 0.5) {
        roomIndex = room.index;
        before = dev.material.emissiveIntensity;
        break;
      }
    }
    if (roomIndex < 0) return { stage: 'no-device-room', roomIndex: -1, before: 0, afterDim: 0, afterBreak: 0 };

    // 'dim' halves powered glow; 'break' kills it. The flicker interval is
    // wall-clock — give it real time to settle at half, then sim-drive again.
    g.flickerRoom(roomIndex, 'dim');
    await new Promise((r) => setTimeout(r, 900));
    for (let f = 0; f < 30; f++) g.frame();
    const built = g.streamer.get(roomIndex)!;
    const dev = built.animated.find((o) => o.userData.anim === 'device' || o.userData.anim === 'screen' || o.userData.anim === 'blink')!;
    const afterDim = dev.material.emissiveIntensity;
    g.flickerRoom(roomIndex, 'break');
    for (let f = 0; f < 30; f++) g.frame();
    const afterBreak = dev.material.emissiveIntensity;
    return { stage: 'done', roomIndex, before, afterDim, afterBreak };
  });

  if (result.stage === 'no-device-room') {
    test.info().annotations.push({ type: 'note', description: 'No powered device found on this route — skipping assertions.' });
    return;
  }
  expect(result.before).toBeGreaterThan(0.5);
  // dim settles lights at ~50% — device glow must track it, not stay full.
  expect(result.afterDim).toBeLessThan(result.before * 0.7);
  expect(result.afterDim).toBeGreaterThan(0.01);
  expect(result.afterBreak).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});
