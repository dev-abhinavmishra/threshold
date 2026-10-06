import { test, expect, Page } from '@playwright/test';

// Prop-interact e2e — the ambient interact layer (tv/clock/hearth/window/
// cooler/typewriter/printer/phone/seat), the two-stage washer, floor traps,
// hiding enter/exit incl. the hollow struggle, and document→codex pickup.
// Same sim-drive harness as mechanics.spec.ts: fixed-step clock + manual
// g.frame() so SwiftShader's starved rAF doesn't matter. Seed 's' carries
// every target kind on the main route.

test.setTimeout(300_000);

async function seededRun(page: Page, seed = 's'): Promise<void> {
  await page.goto('/?debug');
  const input = page.locator('.seed-input');
  await input.evaluate((el: HTMLInputElement, s: string) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, s);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, seed);
  await page.getByRole('button', { name: 'Seeded Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 90_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame, undefined, { timeout: 90_000 });
}

interface ThresholdG {
  renderFrame(): void;
  clock: { tick(): boolean; dt: number; time: number };
  frame(): void;
  godMode: boolean;
  currentRoom: number;
  player: {
    pos: { x: number; y: number; z: number };
    yaw: number; pitch: number; eyeHeight: number; health: number; dead: boolean;
    teleport(x: number, y: number, z: number, yaw?: number): void;
    hiddenSpot: { id: string } | null;
    crouching: boolean;
  };
  input: { interactPressed: boolean };
  keys: Set<string>;
  audio: { onCaption(fn: (c: { text: string; severity?: string }) => void): unknown };
  sound: { emit(e: { x: number; y: number; z: number; intensity: number; category: string; caption: string }): void };
  spawned: Set<string>;
  doorTry: { id: string } | null;
  interaction: {
    focused?: { prompt: string; holdTime?: number } | null;
    interactables: { kind: string; id: string; pos: { x: number; y: number; z: number } }[];
  };
  entities: { id: string; state: string }[];
  route: { rooms: GRoom[] };
  // interact journals (private fields — reachable at runtime)
  litTVs: Set<string>;
  woundClocks: Set<string>;
  litHearths: Set<string>;
  lookedWindows: Set<string>;
  drunkCoolers: Set<string>;
  typedKeys: Set<string>;
  printedPages: Set<string>;
  answeredPhones: Set<string>;
  satSeats: Set<string>;
  ranWashers: Set<string>;
  finishedWashers: Set<string>;
  emptiedWashers: Set<string>;
  priedTraps: Set<string>;
  liveTraps: { key: string; x: number; z: number }[];
  documents: { id: string }[];
  marginalia: number;
}

interface GRoom {
  index: number;
  templateId?: string;
  origin: { x: number; z: number };
  yaw: number;
  doors?: { id: string; pos: { x: number; z: number }; yaw: number; label: string; falseDoor?: boolean; deep?: boolean; openT?: number; opening?: boolean }[];
  scheduled?: { entity: string; roused?: boolean; triggerRoom: number; seed: number }[];
  darkRoom?: boolean;
  spec?: { width?: number; depth?: number; w?: number; d?: number; props: { kind: string; x: number; z: number; y?: number }[] };
  hidingSpots: { id: string; exitPos: { x: number; y: number; z: number }; trappedBy?: string }[];
  sockets?: { meta?: Record<string, unknown>; pos: { x: number; y: number; z: number } }[];
}

test('ambient prop interacts: tv, clock, hearth, window, cooler, typewriter, printer, phone, seat', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    // Stand on the room-interior side of the prop — a fixed world offset can
    // land inside a wall/prop and shove the player back out.
    const standAt = (room: GRoom, p: { x: number; z: number }, r = 1.2) => {
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
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.55 - eyeY, Math.hypot(ax, az) || 1)));
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
    // Room-local prop coords → world.
    const world = (room: GRoom, p: { x: number; z: number; y?: number }) => {
      const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
      return { x: room.origin.x + p.x * c + p.z * s, y: p.y ?? 0.8, z: room.origin.z - p.x * s + p.z * c };
    };
    const settle = (room: GRoom) => {
      g.currentRoom = room.index;
      for (let f = 0; f < 40; f++) g.frame();
    };

    type Target = { kinds: string[]; prompt: RegExp; set: string };
    const targets: Target[] = [
      { kinds: ['television'], prompt: /tune the static/i, set: 'litTVs' },
      { kinds: ['clock'], prompt: /wind the clock/i, set: 'woundClocks' },
      { kinds: ['fireplace', 'stove', 'masonryHeater', 'firePit'], prompt: /light the hearth/i, set: 'litHearths' },
      { kinds: ['window'], prompt: /look out/i, set: 'lookedWindows' },
      { kinds: ['waterCooler'], prompt: /drink/i, set: 'drunkCoolers' },
      { kinds: ['typewriter'], prompt: /strike a key/i, set: 'typedKeys' },
      { kinds: ['printer', 'printerRow'], prompt: /print the page/i, set: 'printedPages' },
      { kinds: ['payphone'], prompt: /lift the receiver/i, set: 'answeredPhones' },
      { kinds: ['bench', 'plasticChair', 'armchair', 'diningChair'], prompt: /rest a moment/i, set: 'satSeats' },
    ];
    type Rec = Record<string, Set<string>>;
    const rec = g as unknown as Rec;
    const out: { set: string; room?: number; prompts: string; grew: boolean }[] = [];
    for (const t of targets) {
      // Try each room carrying the kind — safe-room templates register no
      // prop interacts, and an individual prop may be lane-culled.
      let done = false; let lastPrompts = 'NO-PROP'; let lastRoom: number | undefined;
      for (const r of g.route.rooms) {
        const p = r.spec?.props.find((x) => t.kinds.includes(x.kind));
        if (!p) continue;
        const wpos = world(r, p);
        standAt(r, wpos);
        settle(r);
        const before = rec[t.set].size;
        const prompts = drive({ x: wpos.x, y: wpos.y ?? 0.8, z: wpos.z }, t.prompt, () => rec[t.set].size > before, 200);
        lastPrompts = prompts; lastRoom = r.index;
        if (rec[t.set].size > before) { done = true; break; }
      }
      out.push({ set: t.set, room: lastRoom, prompts: lastPrompts, grew: done });
    }
    return out;
  });

  for (const r of result) {
    expect(r.grew, `${r.set} @${r.room} prompts[${r.prompts}]`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('washer runs a cycle, then pays out on empty', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const standAt = (room: GRoom, p: { x: number; z: number }, r = 1.2) => {
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
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.55 - eyeY, Math.hypot(ax, az) || 1)));
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
    const world = (room: GRoom, p: { x: number; z: number; y?: number }) => {
      const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
      return { x: room.origin.x + p.x * c + p.z * s, y: p.y ?? 0.8, z: room.origin.z - p.x * s + p.z * c };
    };

    let room: GRoom | null = null; let pos: { x: number; z: number } | null = null;
    for (const r of g.route.rooms) {
      const p = r.spec?.props.find((x) => x.kind === 'washer');
      if (p) { room = r; pos = world(r, p); break; }
    }
    if (!room || !pos) return { stage: 'no-washer' } as const;
    standAt(room, pos);
    g.currentRoom = room.index;
    for (let f = 0; f < 40; f++) g.frame();

    // Stage 1 — Run the load.
    const ranBefore = g.ranWashers.size;
    const promptsA = drive({ x: pos.x, y: 0.7, z: pos.z }, /run the load/i, () => g.ranWashers.size > ranBefore, 200);
    if (g.ranWashers.size === ranBefore) return { stage: 'no-run', promptsA } as const;

    // Cycle runs 24s of sim time — the drum calls patrols; it finishes on
    // its own, we just let frames pass.
    for (let f = 0; f < 900 && g.finishedWashers.size === 0; f++) g.frame();
    if (g.finishedWashers.size === 0) return { stage: 'never-finished' } as const;

    // Stage 2 — Empty the drum: pays marginalia, clanks, or wet cloth.
    const m0 = g.marginalia;
    const promptsB = drive({ x: pos.x, y: 0.7, z: pos.z }, /empty the drum/i, () => g.emptiedWashers.size > 0, 200);
    return { stage: 'done', promptsA, promptsB, emptied: g.emptiedWashers.size > 0, marginalia: g.marginalia - m0 } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect((result as { emptied: boolean }).emptied).toBe(true);
  expect(errors).toEqual([]);
});

test('armed floor trap can be pried before it snaps', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const standAt = (room: GRoom, p: { x: number; z: number }, r = 1.2) => {
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
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.55 - eyeY, Math.hypot(ax, az) || 1)));
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
    // Traps arm per-room at interactable build — walk the trap-carrying
    // rooms until liveTraps populates.
    let trap: { x: number; z: number; key: string } | null = null;
    let trapRoom: GRoom | null = null;
    for (const r of g.route.rooms) {
      if (!r.spec?.props.some((p) => p.kind === 'mousetrap')) continue;
      // enter() hooks need a real position change — a bare currentRoom
      // assignment is skipped silently.
      g.player.teleport(r.origin.x, 0, r.origin.z);
      g.currentRoom = r.index;
      for (let f = 0; f < 30 && !g.liveTraps.length; f++) g.frame();
      if (g.liveTraps.length) { trap = g.liveTraps[0]; trapRoom = r; break; }
    }
    if (!trap || !trapRoom) return { stage: 'no-armed-trap' } as const;
    standAt(trapRoom, trap);
    const prompts = drive({ x: trap.x, y: 0.08, z: trap.z }, /pry the trap/i, () => g.priedTraps.size > 0, 200);
    return { stage: 'done', prompts, pried: g.priedTraps.size } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect((result as { pried: number }).pried).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('hiding: enter + leave a safe spot; a hollow spot grips and spawns', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const standAt = (room: GRoom, p: { x: number; z: number }, r = 1.1) => {
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
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.55 - eyeY, Math.hypot(ax, az) || 1)));
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

    // A safe spot first — clean enter/exit.
    const safeRoom = g.route.rooms.find((r) => r.hidingSpots?.some((s) => !s.trappedBy));
    const safe = safeRoom?.hidingSpots.find((s) => !s.trappedBy);
    if (!safeRoom || !safe) return { stage: 'no-safe-spot' } as const;
    standAt(safeRoom, safe.exitPos);
    g.currentRoom = safeRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    const promptsA = drive(safe.exitPos, /hide/i, () => g.player.hiddenSpot !== null, 160);
    if (!g.player.hiddenSpot) return { stage: 'no-hide', promptsA } as const;
    // Leaving — 'Leave hiding' focuses while hidden.
    const promptsB = drive(safe.exitPos, /leave hiding/i, () => g.player.hiddenSpot === null, 160);
    if (g.player.hiddenSpot) return { stage: 'stuck-in-safe', promptsB } as const;

    // The hollow spot — its prompt carries a readable clue, entering spawns
    // the entity, and leaving is a struggle.
    const trapRoom = g.route.rooms.find((r) => r.hidingSpots?.some((s) => s.trappedBy === 'hollow'));
    const hollowSpot = trapRoom?.hidingSpots.find((s) => s.trappedBy === 'hollow');
    if (!trapRoom || !hollowSpot) return { stage: 'done-no-hollow', safeOk: true } as const;
    standAt(trapRoom, hollowSpot.exitPos);
    g.currentRoom = trapRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    let clueSeen = '';
    const promptsC = drive(hollowSpot.exitPos, /hide|step into|underneath|cabinet|vent/i, () => {
      const p = g.interaction.focused?.prompt ?? '';
      if (/—/.test(p)) clueSeen = p;
      return g.player.hiddenSpot !== null;
    }, 160);
    if (!g.player.hiddenSpot) return { stage: 'no-hollow-hide', promptsC } as const;
    const spawned = g.entities.some((e) => e.id === 'hollow');
    // Struggle out — repeated 'Leave hiding' presses wear the grip down.
    const promptsD = drive(hollowSpot.exitPos, /leave hiding/i, () => g.player.hiddenSpot === null, 400);
    return { stage: 'done', safeOk: true, clueSeen, spawned, escaped: g.player.hiddenSpot === null, promptsA, promptsC, promptsD } as const;
  });

  expect(['done', 'done-no-hollow'], JSON.stringify(result)).toContain(result.stage);
  if (result.stage === 'done') {
    expect((result as { spawned: boolean }).spawned).toBe(true);
    expect((result as { escaped: boolean }).escaped, JSON.stringify((result as { promptsD: string }).promptsD)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('document pickup reaches the codex', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
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
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.55 - eyeY, Math.hypot(ax, az) || 1)));
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

    // A lore/document socket — pickup pushes into g.documents (the store's
    // codex list mirrors it via setState on the same frame).
    let sock: { pos: { x: number; y: number; z: number } } | null = null;
    let room: GRoom | null = null;
    for (const r of g.route.rooms) {
      const s = r.sockets?.find((x) => (x.meta?.contains === 'lore' || x.meta?.contains === 'document') && x.meta?.taken !== true);
      if (s) { sock = s; room = r; break; }
    }
    if (!sock || !room) return { stage: 'no-lore-socket' } as const;
    standAt(room, sock.pos);
    g.currentRoom = room.index;
    for (let f = 0; f < 40; f++) g.frame();
    const before = g.documents.length;
    const prompts = drive(sock.pos, /take|search|loot|read|open/i, () => g.documents.length > before, 200);
    return { stage: 'done', prompts, before, after: g.documents.length, docs: g.documents.map((d) => d.id) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.after).toBeGreaterThan(result.before ?? 0);
  expect(errors).toEqual([]);
});

test('ear to the seam: listen reports what waits beyond a door', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;

    const inRoom = (r: GRoom, x: number, z: number) => {
      const dx = x - r.origin.x, dz = z - r.origin.z;
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const sw = r.spec?.width ?? r.spec?.w, sd = r.spec?.depth ?? r.spec?.d;
      return !!sw && !!sd && Math.abs(lx) <= sw / 2 + 0.5 && Math.abs(lz) <= sd / 2 + 0.5;
    };
    const standIn = (r: GRoom, x: number, z: number, rad = 1.1) => {
      // Teleport to the r-side of point (x,z) — nudged toward room centre.
      const dx = r.origin.x - x, dz = r.origin.z - z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(x + (dx / L) * rad, 0, z + (dz / L) * rad);
      g.currentRoom = r.index;
      for (let f = 0; f < 40; f++) g.frame();
    };
    const drive = (at: { x: number; y: number; z: number }, match: RegExp, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        g.player.pitch = Math.atan2(at.y + 0.4 - (g.player.pos.y + g.player.eyeHeight), Math.hypot(ax, az) || 1);
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
    const main = g.route.rooms.filter((r) => r.index >= 0).sort((a, b) => a.index - b.index);
    const rec = g as unknown as Record<string, Set<string>>;
    const HEARD = 'listenedDoors';

    // Door between host room i and i+1 is `door-{i+1}-in`, owned by the next
    // room — stand inside host near the shared wall and find its seam point.
    const listenAt = (host: GRoom, next: GRoom): { prompts: string; heard: number; caps: string[] } | { none: true } => {
      const door = (next.doors ?? []).find((d) => d.id === `door-${next.index}-in`);
      if (!door) return { none: true };
      const nx = Math.sin(door.yaw), nz = Math.cos(door.yaw);
      const cand = [1, -1].map((s) => ({ x: door.pos.x + nx * 1.4 * s, z: door.pos.z + nz * 1.4 * s })).find((p) => inRoom(host, p.x, p.z));
      if (!cand) return { none: true };
      g.player.teleport(cand.x, 0, cand.z);
      g.currentRoom = host.index;
      for (let f = 0; f < 40; f++) g.frame();
      g.keys.add('KeyC'); // crouched: the seam point registers
      for (let f = 0; f < 10; f++) g.frame();
      const seam = g.interaction.interactables.find((i) => i.kind === 'listen' && i.id === `listen-${door.id}`);
      if (!seam) { g.keys.delete('KeyC'); return { none: true }; }
      // At the seam — close enough that the edge point outranks the door.
      standIn(host, seam.pos.x, seam.pos.z, 0.55);
      const before = rec[HEARD].size;
      const prompts = drive(seam.pos, /listen at door/i, () => rec[HEARD].size > before, 240);
      g.keys.delete('KeyC');
      return { prompts, heard: rec[HEARD].size, caps: [...caps] };
    };

    // 1) a door whose next room has a scheduled entity → the entity's tell.
    const withEnt: { prompts: string; heard: number; caps: string[]; entity: string; room: number } | { none: true } = (() => {
      for (let i = 0; i < main.length - 1; i++) {
        const next = main[i + 1];
        const sched = next.scheduled?.[0];
        if (!sched) continue;
        caps.length = 0;
        const r = listenAt(main[i], next);
        if ('none' in r) continue;
        return { ...r, entity: sched.entity, room: next.index };
      }
      return { none: true };
    })();

    // 2) a door whose next room is quiet → '[nothing moves]' or dark/safe tell.
    const quiet = (() => {
      for (let i = 0; i < main.length - 1; i++) {
        const next = main[i + 1];
        if (next.scheduled?.length) continue;
        caps.length = 0;
        const r = listenAt(main[i], next);
        if ('none' in r) continue;
        const quietCap = r.caps.find((c) => /nothing moves|dark beyond|resting place|dead air|draught/i.test(c));
        return { ...r, quietCap, room: next.index, dark: next.darkRoom, tpl: next.templateId };
      }
      return { none: true };
    })();

    return { withEnt, quiet, heardTotal: rec[HEARD].size };
  });

  const ent = result.withEnt;
  expect('none' in ent ? 'none' : `entity @${ent.room} prompts[${ent.prompts}]`).not.toBe('none');
  if (!('none' in ent)) {
    expect(ent.heard, `prompts seen [${ent.prompts}]`).toBeGreaterThan(0);
    const tell = ent.caps.find((c) => /crawl|breath|whisper|feet|page|footsteps|chord|steps|ticking|hum|rattle|machine|stiff|rustle|unwritten|grafting|hiss|gears|cloth|vast|counting|lullaby|moves beyond/i.test(c));
    expect(tell ?? `no tell — caps[${ent.caps}] entity ${ent.entity}`).toBeTruthy();
  }
  const q = result.quiet;
  expect('none' in q ? 'none' : `quiet @${q.room} prompts[${q.prompts}]`).not.toBe('none');
  if (!('none' in q)) {
    expect(q.quietCap ?? `no quiet caption — caps[${q.caps}] dark ${q.dark} tpl ${q.tpl}`).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test('noise through the door rouses what waits beyond', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;

    const main = g.route.rooms.filter((r) => r.index >= 0).sort((a, b) => a.index - b.index);
    const inRoom = (r: GRoom, x: number, z: number) => {
      const dx = x - r.origin.x, dz = z - r.origin.z;
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      return !!r.spec?.width && !!r.spec?.depth && Math.abs(lx) <= r.spec.width / 2 + 0.5 && Math.abs(lz) <= r.spec.depth / 2 + 0.5;
    };

    // First scheduled room on the main route; its entry door is door-N-in,
    // owned by that room. Stand in the previous room beside it.
    const nIdx = main.findIndex((r) => (r.scheduled?.length ?? 0) > 0);
    if (nIdx <= 0) return { stage: 'no-scheduled' } as const;
    const next = main[nIdx], host = main[nIdx - 1];
    const door = (next.doors ?? []).find((d) => d.id === `door-${next.index}-in`);
    if (!door) return { stage: 'no-door' } as const;
    const nx = Math.sin(door.yaw), nz = Math.cos(door.yaw);
    const cand = [1, -1].map((s) => ({ x: door.pos.x + nx * 1.6 * s, z: door.pos.z + nz * 1.6 * s }))
      .find((p) => inRoom(host, p.x, p.z));
    if (!cand) return { stage: 'no-stand' } as const;
    g.player.teleport(cand.x, 0, cand.z);
    g.currentRoom = host.index;
    for (let f = 0; f < 30; f++) g.frame();
    if (next.scheduled![0].roused) return { stage: 'pre-roused' } as const;

    // Sprint in place beside the door — strides emit 'sprint' noise at 0.85.
    let yaw = door.yaw + Math.PI / 2;
    for (let f = 0; f < 90 && !next.scheduled![0].roused; f++) {
      yaw += 0.11; // circle so we stay beside the door
      g.player.yaw = yaw;
      g.keys.add('KeyW'); g.keys.add('ShiftLeft');
      g.frame();
    }
    g.keys.delete('KeyW'); g.keys.delete('ShiftLeft');
    const ent = next.scheduled![0].entity;
    if (!next.scheduled![0].roused) return { stage: 'not-roused', ent, caps } as const;
    const tell = caps.find((c) => /heard you|knows|stirs|alert/i.test(c));
    const shudder = g.doorTry?.id === door.id;

    // Open the leaf — the roused encounter spawns without room entry.
    const before = g.entities.length;
    door.opening = true;
    for (let f = 0; f < 90; f++) g.frame();
    const spawned = g.entities.some((e) => e.id === ent);

    return { stage: 'done', ent, tell, shudder, spawned, before, after: g.entities.length, caps: caps.slice(-6) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage === 'done') {
    expect(result.tell ?? `no rouse tell — caps[${result.caps}]`).toBeTruthy();
    expect(result.spawned, `entity ${result.ent} did not pre-spawn`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('the bellman trails your steps — knock, follow, yield to a held gaze', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 'threshold');

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
    // Phase A: keep a 5.5m exposed gap — the instant the whistle lands, dive
    // into a real hiding spot (a bare object crashes frame(): spots carry
    // pos/exitPos). The charge runs to where it lost you and dies out there.
    const spot = wardenRoom.hidingSpots[0];
    let resumed = false;
    for (let f = 0; f < 1600 && ent.state !== 'done'; f++) {
      const tp = ent.threatPos();
      if (tp && !g.player.hiddenSpot) g.player.teleport(tp.x, 0, tp.z - 5.5);
      g.frame();
      if (!g.player.hiddenSpot && caps.some((c) => /Warden has you/.test(c))) {
        if (spot) {
          g.player.hiddenSpot = spot;
          g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
        }
      }
      if (caps.some((c) => /whistle dies/.test(c))) { resumed = true; break; }
    }
    // Phase B: come back out into the open — it must spot again, charge,
    // and this time the strike lands.
    let struck = false;
    if (resumed) {
      g.player.hiddenSpot = null;
      for (let f = 0; f < 1400 && ent.state !== 'done'; f++) {
        const tp = ent.threatPos();
        if (tp) g.player.teleport(tp.x, 0, tp.z - 1.4);
        g.frame();
        if (caps.some((c) => /Warden strikes/.test(c))) { struck = true; break; }
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
