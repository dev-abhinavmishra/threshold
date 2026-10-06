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
    focused?: { prompt: string; holdTime?: number; id?: string } | null;
    interactables: { kind: string; id: string; pos: { x: number; y: number; z: number }; prompt: string; enabled?: boolean; data?: { meta?: Record<string, number | string | boolean> } }[];
  };
  entities: { id: string; state: string }[];
  route: { rooms: GRoom[]; branchRooms?: GRoom[]; underRooms: GRoom[] };
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
  n: { x: number; z: number };
  entryPos: { x: number; z: number };
  exitPos: { x: number; z: number };
  doors: { id: string; pos: { x: number; z: number }; yaw: number; label: string; falseDoor?: boolean; deep?: boolean; openT?: number; opening?: boolean; heldBy?: string; locked?: boolean }[];
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
      const s = r.sockets?.find((x) => (x.meta?.contains === 'lore' || x.meta?.contains === 'document') && !x.meta?.claim && !x.meta?.vend && x.meta?.taken !== true);
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
        // Hug the exit wall INSIDE the room beside the leaf, face it, press.
        g.player.teleport(ex.x + Math.sin(yaw) * 0.9 + Math.sin(yaw + Math.PI / 2) * 0.8, 0, ex.z + Math.cos(yaw) * 0.9 + Math.cos(yaw + Math.PI / 2) * 0.8);
        yawTo(ex);
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

test('the collector counts your purse — the toll scales with what you carry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await seededRun(page); // seed 's': collector @23

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const purse = g as unknown as { imprints: number };

    const cRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'collector'));
    if (!cRoom) return { stage: 'no-collector' } as const;
    const prev = g.route.rooms[cRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(cRoom.origin.x, 0, cRoom.origin.z);
    purse.imprints = 150;   // the tin should count it: 150 × 0.12 = 18

    let toll: { pos: { x: number; y: number; z: number }; prompt: string } | null = null;
    for (let f = 0; f < 500 && !toll; f++) {
      g.frame();
      const t = g.interaction.interactables.find((i) => i.kind === 'toll');
      if (t) toll = t as unknown as { pos: { x: number; y: number; z: number }; prompt: string };
    }
    if (!toll) return { stage: 'no-toll', caps: caps.slice(-10) } as const;
    const prompt = toll.prompt;

    let paid = false;
    for (let f = 0; f < 160 && !paid; f++) {
      const ax = toll.pos.x - g.player.pos.x, az = toll.pos.z - g.player.pos.z;
      const al = Math.hypot(ax, az) || 1;
      if (al > 1.4) g.player.teleport(toll.pos.x - (ax / al) * 1.2, 0, toll.pos.z - (az / al) * 1.2);
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(toll.pos.y + 0.1 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (/pay the toll/i.test(g.interaction.focused?.prompt ?? '')) g.keys.add('KeyE');
      g.frame();
      paid = purse.imprints < 150;
    }
    g.keys.delete('KeyE');
    return { stage: 'done', prompt, paid, purseAfter: purse.imprints, dead: g.player.dead, caps: caps.slice(-10), allCaps: caps } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { prompt: string; paid: boolean; purseAfter: number; dead: boolean; caps: string[]; allCaps: string[] };
  expect(r.prompt, 'the ask should scale with the purse').toContain('18 imprints');
  expect(r.paid, `toll never paid. caps: ${r.allCaps.join(' | ')}`).toBe(true);
  expect(r.purseAfter).toBe(132);
  expect(r.allCaps.some((c) => /tin accepts/.test(c))).toBe(true);
  expect(errors).toEqual([]);
});

test('brace the door: the bellman tests the bar and loses interest', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's': bellman @32

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

    const bRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'bellman'));
    if (!bRoom) return { stage: 'no-bellman' } as const;
    // Enter for real (the spawn hook needs a position change), but settle
    // only ~1s — the bellman warns 1.5s before it walks, and the brace has
    // to land before its knock matures into the swing.
    const prev = g.route.rooms[bRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(bRoom.origin.x, 0, bRoom.origin.z);
    for (let f = 0; f < 8; f++) g.frame();
    const bell = gi.entities.find((e) => e.id === 'bellman');
    if (!bell) return { stage: 'no-bellman-spawn', caps: caps.slice(-8) } as const;

    const door = bRoom.doors.find((d) => d.id === `door-${bRoom.index}-in`);
    if (!door) return { stage: 'no-door' } as const;
    // The brace point sits a half-step off the leaf on the mirror side of
    // the listen seam — stand there, nudged ~0.9m into the room (outside
    // its 1.05 touch reach, inside the 1.7m brace radius), and crouch.
    // This is a race: the brace has to land before its knock matures (~2.4s).
    const latX = Math.cos(door.yaw), latZ = -Math.sin(door.yaw);
    const bx = door.pos.x - latX * 0.55, bz = door.pos.z - latZ * 0.55;
    const toC = { x: bRoom.origin.x - bx, z: bRoom.origin.z - bz };
    const L = Math.hypot(toC.x, toC.z) || 1;
    g.player.teleport(bx + (toC.x / L) * 0.9, 0, bz + (toC.z / L) * 0.9);
    g.keys.add('KeyC');
    for (let f = 0; f < 4; f++) g.frame();
    const brace = g.interaction.interactables.find((i) => i.kind === 'brace' && i.id === `brace-${door.id}`);
    if (!brace) return { stage: 'no-brace-point' } as const;

    // Hold E on the brace point until the leaf is held.
    let braced = false;
    for (let f = 0; f < 90 && !braced; f++) {
      const ax = brace.pos.x - g.player.pos.x, az = brace.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(brace.pos.y + 0.2 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (/brace door/i.test(g.interaction.focused?.prompt ?? '')) g.keys.add('KeyE');
      g.frame();
      braced = door.heldBy === 'player';
    }
    g.keys.delete('KeyE');
    if (!braced) return { stage: 'brace-failed', prompt: g.interaction.focused?.prompt } as const;

    // Stay on the bar (release is >1.7m or opening it). The bellman warns,
    // walks to the leaf, rattles on a cadence, holds ~14s, then fades.
    let faded = false, opened = false;
    const cluster = [...g.route.rooms[bRoom.index - 1].doors, ...bRoom.doors]
      .filter((d) => Math.hypot(d.pos.x - door.pos.x, d.pos.z - door.pos.z) < 0.6);
    const trace: string[] = [];
    for (let f = 0; f < 700 && !faded; f++) {
      g.frame();
      if (cluster.some((d) => d.opening || (d.openT ?? 0) > 0.05)) opened = true;
      if (caps.some((c) => /steps fade down the hall/.test(c))) faded = true;
      if (f % 30 === 0) {
        const tp = bell.threatPos();
        const dd = tp ? Math.hypot(tp.x - door.pos.x, tp.z - door.pos.z) : -1;
        trace.push(`f${f} bell@${dd.toFixed(2)} dead=${g.player.dead} hold=${door.heldBy}`);
      }
    }
    g.keys.delete('KeyC');
    return { stage: 'done', faded, opened, bellState: bell.state, dead: g.player.dead, trace, caps: caps.slice(-14), allCaps: caps } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { faded: boolean; opened: boolean; bellState: string; dead: boolean; trace: string[]; caps: string[]; allCaps: string[] };
  const tail = r.allCaps.join(' | ');
  expect(r.caps.some((c) => /tests the bar|strains|palm flat/.test(c)), `caps: ${tail} trace: ${r.trace.join(' ; ')}`).toBe(true);
  expect(r.faded, `caps: ${tail}`).toBe(true);
  expect(r.opened, 'the brace leaked — a cluster leaf swung').toBe(false);
  expect(r.bellState).toBe('done');
  expect(errors).toEqual([]);
});

test('the door chock holds while you walk away — until something worries it loose', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's': bellman @32

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const gi = g as unknown as {
      entities: { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null }[];
      giveItem(id: string, n?: number): void;
      inventory: { id: string; count: number }[];
    };
    gi.giveItem('doorChock', 2);

    const bRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'bellman'));
    if (!bRoom) return { stage: 'no-bellman' } as const;
    const prev = g.route.rooms[bRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();

    // Rehearsal on a quiet closed leaf: set the wedge, then pull it free.
    // Branch rooms are unscheduled — nothing crosses their doors mid-hold.
    const qRoom = g.route.branchRooms?.find((r) => !(r.scheduled?.length) && r.doors.some((d) => !d.locked && !d.falseDoor && (d.openT ?? 0) <= 0.4));
    const rehearseIn = qRoom ?? prev;
    const pDoor = rehearseIn.doors.find((d) => !d.locked && !d.falseDoor && (d.openT ?? 0) <= 0.4);
    if (!pDoor) return { stage: 'no-rehearsal-door' } as const;
    g.player.teleport(rehearseIn.origin.x, 0, rehearseIn.origin.z);
    for (let f = 0; f < 6; f++) g.frame();
    const toP = { x: rehearseIn.origin.x - pDoor.pos.x, z: rehearseIn.origin.z - pDoor.pos.z };
    const LP = Math.hypot(toP.x, toP.z) || 1;
    g.player.teleport(pDoor.pos.x + (toP.x / LP) * 0.9, 0, pDoor.pos.z + (toP.z / LP) * 0.9);
    g.keys.add('KeyC');
    for (let f = 0; f < 4; f++) g.frame();
    // The seam anchors all crowd the leaf; a level look can't lift the
    // below-floor wedge point past 'Listen at Door N' on the focus score.
    // Real players pitch down — here we hand lookDir the exact bearing.
    // Match by id: every closed leaf in the window carries a wedge point.
    const aimHold = (id: string, done: () => boolean, frames = 90): boolean => {
      const lp = g.player as unknown as { lookDir(out: { x: number; y: number; z: number }): void };
      const orig = lp.lookDir.bind(lp);
      // Real players pitch down to the below-floor anchor; the harness can't
      // hold a pitch, so while the point exists we hand focus() the answer.
      // Hold+interact still run the real pipeline.
      const sys = g.interaction as unknown as {
        focus: (eye: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }, pos: { x: number; y: number; z: number }) => typeof g.interaction.focused;
        interactables: { id: string; prompt: string; kind: string; pos: { x: number; y: number; z: number }; enabled: boolean }[];
      };
      const origFocus = sys.focus.bind(sys);
      let seen = false;
      for (let f = 0; f < frames && !done(); f++) {
        const pt = g.interaction.interactables.find((i) => i.id === id);
        if (!pt) { g.frame(); continue; }
        seen = true;
        lp.lookDir = (out) => {
          const dx = pt.pos.x - g.player.pos.x, dy = pt.pos.y + 0.6 - g.player.eyeHeight, dz = pt.pos.z - g.player.pos.z;
          const L = Math.hypot(dx, dy, dz) || 1;
          out.x = dx / L; out.y = dy / L; out.z = dz / L;
        };
        sys.focus = (eye, look, pos) => {
          const here = sys.interactables.find((i) => i.id === id);
          const r = here ?? origFocus(eye, look, pos);
          (sys as { focused?: unknown }).focused = r ?? null;
          return r;
        };
        if (g.interaction.focused?.id === id) g.keys.add('KeyE');
        g.frame();
      }
      lp.lookDir = orig;
      sys.focus = origFocus;
      g.keys.delete('KeyE');
      return seen;
    };
    if (!aimHold(`wedge-${pDoor.id}`, () => pDoor.heldBy === 'wedge')) return { stage: 'no-wedge-point', caps: caps.slice(-6) } as const;
    const wedgedRehearsal = pDoor.heldBy === 'wedge';
    const countAfterSet = gi.inventory.find((i) => i.id === 'doorChock')?.count ?? -1;
    if (!aimHold(`unwedge-${pDoor.id}`, () => pDoor.heldBy === undefined)) return { stage: 'no-unwedge-point', caps: caps.slice(-6) } as const;
    const unwedged = pDoor.heldBy === undefined;
    const countAfterPull = gi.inventory.find((i) => i.id === 'doorChock')?.count ?? -1;
    g.keys.delete('KeyC');

    // The real thing: enter, race the wedge down before the knock matures.
    g.player.teleport(bRoom.origin.x, 0, bRoom.origin.z);
    for (let f = 0; f < 8; f++) g.frame();
    const bell = gi.entities.find((e) => e.id === 'bellman');
    if (!bell) return { stage: 'no-bellman-spawn', caps: caps.slice(-8) } as const;
    const door = bRoom.doors.find((d) => d.id === `door-${bRoom.index}-in`);
    if (!door) return { stage: 'no-door' } as const;
    const toC = { x: bRoom.origin.x - door.pos.x, z: bRoom.origin.z - door.pos.z };
    const L = Math.hypot(toC.x, toC.z) || 1;
    g.player.teleport(door.pos.x + (toC.x / L) * 0.9, 0, door.pos.z + (toC.z / L) * 0.9);
    g.keys.add('KeyC');
    for (let f = 0; f < 4; f++) g.frame();
    aimHold(`wedge-${door.id}`, () => door.heldBy === 'wedge');
    g.keys.delete('KeyC');
    const wedged = door.heldBy === 'wedge';
    if (!wedged) return { stage: 'wedge-failed', prompt: g.interaction.focused?.prompt, crouch: g.player.crouching, hasChock: gi.inventory.find((i) => i.id === 'doorChock')?.count } as const;

    // Then walk away — the whole point vs the brace. The bellman rattles it,
    // kicks the chock loose, knocks the freed leaf, and comes through.
    g.player.teleport(door.pos.x + (toC.x / L) * 2.4, 0, door.pos.z + (toC.z / L) * 2.4);
    const cluster = [...prev.doors, ...bRoom.doors]
      .filter((d) => Math.hypot(d.pos.x - door.pos.x, d.pos.z - door.pos.z) < 0.6);
    let loose = false, opened = false, openedAt = -1;
    const trace: string[] = [];
    for (let f = 0; f < 700 && !opened; f++) {
      g.frame();
      if (caps.some((c) => /wedge skids loose/.test(c))) loose = true;
      if (cluster.some((d) => d.opening || (d.openT ?? 0) > 0.05)) { opened = true; openedAt = f; }
      if (f % 40 === 0) {
        const tp = bell.threatPos();
        const dd = tp ? Math.hypot(tp.x - door.pos.x, tp.z - door.pos.z) : -1;
        trace.push(`f${f} bell@${dd.toFixed(2)} dead=${g.player.dead} hold=${door.heldBy} loose=${loose}`);
      }
    }
    return { stage: 'done', wedgedRehearsal, countAfterSet, unwedged, countAfterPull, loose, opened, openedAt, heldAfter: door.heldBy, dead: g.player.dead, trace, caps: caps.slice(-14) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { wedgedRehearsal: boolean; countAfterSet: number; unwedged: boolean; countAfterPull: number; loose: boolean; opened: boolean; openedAt: number; dead: boolean; trace: string[]; caps: string[] };
  const tail = r.caps.join(' | ') + ' trace: ' + r.trace.join(' ; ');
  expect(r.wedgedRehearsal, 'the wedge never set').toBe(true);
  expect(r.countAfterSet).toBe(1);
  expect(r.unwedged, 'pull the wedge free did not release the leaf').toBe(true);
  expect(r.countAfterPull).toBe(2);   // the chock comes back to your pocket
  expect(r.loose, `bellman never kicked the wedge — ${tail}`).toBe(true);
  expect(r.opened, `leaf never swung after the chock gave — ${tail}`).toBe(true);
  expect(errors).toEqual([]);
});

test("the porter's cage sells held bags — the tag is priced, the contents are blind", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's': cages at 8, 12, 26, 54, 64

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const purse = g as unknown as { imprints: number; inventory: { id: string; count: number }[]; documents: { id: string }[] };

    const room = g.route.rooms.find((r) => (r.sockets ?? []).some((s) => s.meta?.claim));
    if (!room) return { stage: 'no-cage' } as const;
    g.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 30; f++) g.frame();

    const pt = g.interaction.interactables.find((i) => i.kind === 'claim');
    if (!pt) return { stage: 'no-claim-point' } as const;
    const prompt = pt.prompt;
    const sock = pt.data!;
    const meta = sock.meta as Record<string, number | string | boolean>;
    const price = meta.price as number;
    const contains = String(meta.contains);
    const before = { purse: (purse.imprints = 80, 80), items: purse.inventory.reduce((a, i) => a + i.count, 0), docs: purse.documents.length };

    // Refuse check first — a short purse is warned, not sold.
    purse.imprints = price - 1;
    for (let f = 0; f < 100; f++) {
      const ax = pt.pos.x - g.player.pos.x, az = pt.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(pt.pos.y + 0.1 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (g.interaction.focused?.id === pt.id) g.keys.add('KeyE');
      g.frame();
      if (caps.some((c) => /short\]/.test(c))) break;
    }
    g.keys.delete('KeyE');
    const refusedShort = purse.imprints === price - 1;

    purse.imprints = 80;
    let paid = false;
    for (let f = 0; f < 160 && !paid; f++) {
      const ax = pt.pos.x - g.player.pos.x, az = pt.pos.z - g.player.pos.z;
      const al = Math.hypot(ax, az) || 1;
      if (al > 1.4) g.player.teleport(pt.pos.x - (ax / al) * 1.1, 0, pt.pos.z - (az / al) * 1.1);
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(pt.pos.y + 0.1 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (g.interaction.focused?.id === pt.id) g.keys.add('KeyE');
      g.frame();
      paid = meta.taken === true;
    }
    g.keys.delete('KeyE');
    const itemsAfter = purse.inventory.reduce((a, i) => a + i.count, 0);
    const docsAfter = purse.documents.length;
    const gained = contains === 'imprints' ? purse.imprints > 80 - price : contains === 'lore' ? docsAfter > before.docs : itemsAfter > before.items;
    return { stage: 'done', prompt, price, contains, paid, purseAfter: purse.imprints, gained, refusedShort, caps: caps.slice(-10) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { prompt: string; price: number; contains: string; paid: boolean; purseAfter: number; gained: boolean; refusedShort: boolean; caps: string[] };
  expect(r.prompt).toMatch(/claim the bag tagged '.+' — \d+ imprints/i);
  expect(r.refusedShort, 'short purse should be warned, not sold').toBe(true);
  expect(r.paid, `claim never resolved — caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.purseAfter, 'the price should come out of the purse').toBeLessThanOrEqual(80 - r.price + (r.contains === 'imprints' ? 26 : 0));
  expect(r.gained, `nothing gained from the bag (${r.contains}) — caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(errors).toEqual([]);
});

test("the guest ledger sells foresight — the hotel's own book knows who is expected", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's': ledgers at 12, 45, 54

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const purse = g as unknown as { imprints: number };

    const room = g.route.rooms.find((r) => (r.sockets ?? []).some((s) => s.meta?.register));
    if (!room) return { stage: 'no-ledger' } as const;
    g.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 30; f++) g.frame();

    const pt = g.interaction.interactables.find((i) => i.kind === 'register');
    if (!pt) return { stage: 'no-register-point' } as const;
    const prompt = pt.prompt;
    const sock = pt.data!;
    const price = (sock.meta as { price?: number }).price ?? 0;

    const aimAndHold = (until: () => boolean, frames = 140) => {
      for (let f = 0; f < frames && !until(); f++) {
        const ax = pt.pos.x - g.player.pos.x, az = pt.pos.z - g.player.pos.z;
        const al = Math.hypot(ax, az) || 1;
        if (al > 1.4) g.player.teleport(pt.pos.x - (ax / al) * 1.1, 0, pt.pos.z - (az / al) * 1.1);
        g.player.yaw = Math.atan2(ax, az);
        g.player.pitch = Math.atan2(pt.pos.y + 0.1 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
        if (g.interaction.focused?.id === pt.id) g.keys.add('KeyE');
        g.frame();
      }
      g.keys.delete('KeyE');
    };

    // Refuse phase — a short purse is warned, not read.
    purse.imprints = price - 1;
    aimAndHold(() => caps.some((c) => /short\]/.test(c)));
    const refusedShort = caps.some((c) => /costs \d+ imprints — \d+ short/.test(c));

    // Pay phase — the book turns its own pages.
    purse.imprints = 80;
    aimAndHold(() => (sock.meta as { taken?: boolean }).taken === true);
    const paid = (sock.meta as { taken?: boolean }).taken === true;
    const purseAfter = purse.imprints;
    const ledgerLine = caps.find((c) => /the ledger expects|pages ahead are blank/.test(c)) ?? '';
    const disabledAfter = !(g.interaction.interactables.find((i) => i.id === pt.id)?.enabled ?? true);
    return { stage: 'done', prompt, price, paid, purseAfter, ledgerLine, refusedShort, disabledAfter, caps: caps.slice(-10) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { prompt: string; price: number; paid: boolean; purseAfter: number; ledgerLine: string; refusedShort: boolean; disabledAfter: boolean; caps: string[] };
  expect(r.prompt).toMatch(/read the guest ledger — \d+ imprints/i);
  expect(r.refusedShort, 'a short purse should be warned, not read').toBe(true);
  expect(r.paid, `the ledger never read — caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.purseAfter, 'the price should come out of the purse').toBe(80 - r.price);
  expect(r.ledgerLine).toMatch(/the ledger expects: .+ at Door \d{3}/);
  expect(r.disabledAfter, 'the ink dries — one read per book').toBe(true);
  expect(errors).toEqual([]);
});

test("the duty roster marks who is working — the records desk knows where the staff stand", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's': rosters at 16/21/31/35/41/55/81/82/93; warden @33

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const purse = g as unknown as { imprints: number };

    // First get someone live: entering room 33 spawns its warden.
    const wardenRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'warden'));
    if (!wardenRoom) return { stage: 'no-warden-room' } as const;
    g.player.teleport(wardenRoom.origin.x, 0, wardenRoom.origin.z);
    for (let f = 0; f < 50; f++) g.frame();
    if (!g.entities.find((e) => e.id === 'warden' && e.state !== 'done')) return { stage: 'no-warden-live' } as const;

    // Now to the nearest roster desk.
    const room = g.route.rooms.find((r) => r.index > wardenRoom.index && (r.sockets ?? []).some((s) => s.meta?.roster));
    if (!room) return { stage: 'no-roster' } as const;
    g.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    const pt = g.interaction.interactables.find((i) => i.kind === 'roster');
    if (!pt) return { stage: 'no-roster-point' } as const;
    const prompt = pt.prompt;
    const sock = pt.data!;
    const price = (sock.meta as { price?: number }).price ?? 0;
    purse.imprints = 60;
    for (let f = 0; f < 160 && !(sock.meta as { taken?: boolean }).taken; f++) {
      const ax = pt.pos.x - g.player.pos.x, az = pt.pos.z - g.player.pos.z;
      const al = Math.hypot(ax, az) || 1;
      if (al > 1.4) g.player.teleport(pt.pos.x - (ax / al) * 1.1, 0, pt.pos.z - (az / al) * 1.1);
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(pt.pos.y + 0.1 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (g.interaction.focused?.id === pt.id) g.keys.add('KeyE');
      g.frame();
    }
    g.keys.delete('KeyE');
    const paid = (sock.meta as { taken?: boolean }).taken === true;
    const rosterLine = caps.find((c) => /the duty roster marks|all signatures/.test(c)) ?? '';
    return { stage: 'done', prompt, price, paid, purseAfter: purse.imprints, rosterLine, caps: caps.slice(-10) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { prompt: string; price: number; paid: boolean; purseAfter: number; rosterLine: string; caps: string[] };
  expect(r.prompt).toMatch(/consult the duty roster — \d+ imprints/i);
  expect(r.paid, `the roster never read — caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.purseAfter).toBe(60 - r.price);
  // The warden we spawned is live — the roster must mark him.
  expect(r.rosterLine).toMatch(/a watchman on his rounds/);
  expect(errors).toEqual([]);
});

test("the fault book files hazards by door — the cheapest paper knows what bites", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's': fault book @39 — files 041/042/043 ahead

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const purse = g as unknown as { imprints: number };

    const room = g.route.rooms.find((r) => (r.sockets ?? []).some((s) => s.meta?.complaint && s.meta?.fault));
    if (!room) return { stage: 'no-book' } as const;
    g.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    const pt = g.interaction.interactables.find((i) => i.kind === 'complaint');
    if (!pt) return { stage: 'no-complaint-point' } as const;
    const prompt = pt.prompt;
    const sock = pt.data!;
    const price = (sock.meta as { price?: number }).price ?? 0;
    purse.imprints = 40;
    for (let f = 0; f < 160 && !(sock.meta as { taken?: boolean }).taken; f++) {
      const ax = pt.pos.x - g.player.pos.x, az = pt.pos.z - g.player.pos.z;
      const al = Math.hypot(ax, az) || 1;
      if (al > 1.4) g.player.teleport(pt.pos.x - (ax / al) * 1.1, 0, pt.pos.z - (az / al) * 1.1);
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(pt.pos.y + 0.1 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (g.interaction.focused?.id === pt.id) g.keys.add('KeyE');
      g.frame();
    }
    g.keys.delete('KeyE');
    const paid = (sock.meta as { taken?: boolean }).taken === true;
    const bookLine = caps.find((c) => /the fault book lists|complaint book lists|clear ahead|no complaints/.test(c)) ?? '';
    return { stage: 'done', prompt, price, paid, purseAfter: purse.imprints, bookLine, caps: caps.slice(-10) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { prompt: string; price: number; paid: boolean; purseAfter: number; bookLine: string; caps: string[] };
  expect(r.prompt).toMatch(/read the fault book — \d+ imprints/i);
  expect(r.paid, `the book never read — caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.purseAfter).toBe(40 - r.price);
  // Room 39's window files the sweep@41, groundswell@42, hollow@43.
  expect(r.bookLine).toMatch(/the fault book lists: Door \d{3} —/);
  expect(r.bookLine).toMatch(/floor heaves|pass too fast|nests in the lids|lid that bites|door that isn't/);
  expect(errors).toEqual([]);
});

test("a forged ledger lies by omission — the wet-ink page conceals the forger's door", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 'ash-vault-101'); // forged ledger @65 conceals redactor @71

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const purse = g as unknown as { imprints: number };

    const room = g.route.rooms.find((r) => (r.sockets ?? []).some((s) => s.meta?.forged));
    if (!room) return { stage: 'no-forged' } as const;
    const cover = ((room.sockets ?? []).find((s) => s.meta?.forged)?.meta?.forgedCover as number) ?? -1;
    g.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    const pt = g.interaction.interactables.find((i) => i.kind === 'register');
    if (!pt) return { stage: 'no-register-point' } as const;
    const sock = pt.data!;
    purse.imprints = 80;
    for (let f = 0; f < 160 && !(sock.meta as { taken?: boolean }).taken; f++) {
      const ax = pt.pos.x - g.player.pos.x, az = pt.pos.z - g.player.pos.z;
      const al = Math.hypot(ax, az) || 1;
      if (al > 1.4) g.player.teleport(pt.pos.x - (ax / al) * 1.1, 0, pt.pos.z - (az / al) * 1.1);
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(pt.pos.y + 0.1 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (g.interaction.focused?.id === pt.id) g.keys.add('KeyE');
      g.frame();
    }
    g.keys.delete('KeyE');
    const paid = (sock.meta as { taken?: boolean }).taken === true;
    const ledgerLine = caps.find((c) => /the ledger expects|pages ahead are blank/.test(c)) ?? '';
    const wetInk = caps.some((c) => /ink on one page is still wet/.test(c));
    return { stage: 'done', cover, paid, ledgerLine, wetInk, caps: caps.slice(-10) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { cover: number; paid: boolean; ledgerLine: string; wetInk: boolean; caps: string[] };
  expect(r.cover).toBe(71);
  expect(r.paid, `the forged book never read — caps: ${r.caps.join(' | ')}`).toBe(true);
  // The lie: Door 071 holds a redactor and the book says nothing about it.
  expect(r.ledgerLine).toMatch(/the ledger expects/);
  expect(r.ledgerLine).not.toMatch(/Door 071/);
  // The tell: legible in the moment, damning in retrospect.
  expect(r.wetInk).toBe(true);
  expect(errors).toEqual([]);
});

test("the work order files open tickets — the under's own paper answers cargo", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's': work orders at u-22,26,39,67,79,112,113,119

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as { enterUnderscript(): void; currentRoom: number; marginalia: number };

    ga.enterUnderscript();
    const room = g.route.underRooms.find((r) => (r.sockets ?? []).some((s) => s.meta?.workOrder));
    if (!room) return { stage: 'no-order' } as const;
    ga.currentRoom = room.index;
    g.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    const pt = g.interaction.interactables.find((i) => i.kind === 'workOrder');
    if (!pt) return { stage: 'no-order-point', kinds: g.interaction.interactables.map((i) => i.kind) } as const;
    const sock = pt.data!;
    const price = (sock.meta as { price?: number }).price ?? 0;
    ga.marginalia = 40;
    for (let f = 0; f < 160 && !(sock.meta as { taken?: boolean }).taken; f++) {
      const ax = pt.pos.x - g.player.pos.x, az = pt.pos.z - g.player.pos.z;
      const al = Math.hypot(ax, az) || 1;
      if (al > 1.4) g.player.teleport(pt.pos.x - (ax / al) * 1.1, 0, pt.pos.z - (az / al) * 1.1);
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(pt.pos.y + 0.1 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (g.interaction.focused?.id === pt.id) g.keys.add('KeyE');
      g.frame();
    }
    g.keys.delete('KeyE');
    const filed = (sock.meta as { taken?: boolean }).taken === true;
    const tickets = caps.find((c) => /open tickets|stamped closed/.test(c)) ?? '';
    const egress = caps.find((c) => /egress stamp is filed/.test(c)) ?? '';
    return { stage: 'done', price, filed, tickets, egress, marginalia: ga.marginalia, caps: caps.slice(-10) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { price: number; filed: boolean; tickets: string; egress: string; marginalia: number; caps: string[] };
  expect(r.filed, `the order never filed — caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.marginalia).toBe(40 - r.price);
  expect(r.tickets).toMatch(/open tickets: Door \d{3} —/);
  // The last under-room's stamp always reads Door 120.
  expect(r.egress).toMatch(/egress stamp is filed at Door 120/);
  expect(errors).toEqual([]);
});

test("the under hears you — a pulled bell drifts the grafter, a crash catches the stillframe", async ({ page }) => {
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
    const gRoom = g.route.underRooms.find((r) => r.scheduled?.some((s) => s.entity === 'grafter'));
    if (!gRoom) return { stage: 'no-grafter' } as const;
    g.player.teleport(gRoom.origin.x, 0, gRoom.origin.z);
    ga.currentRoom = gRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    const grafter = ga.entities.find((e) => e.id === 'grafter' && e.state !== 'done');
    if (!grafter) return { stage: 'no-grafter-spawn', ents: ga.entities.map((e) => e.id) } as const;
    // stand just outside — a crash INSIDE its room is noise, not a body
    const emitPt = { x: gRoom.origin.x + 1.5, z: gRoom.origin.z };
    const w = (gRoom.spec as { width?: number } | undefined)?.width ?? 8;
    g.player.teleport(gRoom.origin.x - w / 2 - 1.5, 0, gRoom.origin.z);
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

    return { stage: 'done', bellRung, bellPos: bell.pos, driftToNoise, dragCue, snapCue, hpBefore, hpAfter, caps: caps.slice(-12) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { bellRung: boolean; seen?: string[]; driftToNoise: boolean; dragCue: boolean; snapCue: boolean; hpBefore: number; hpAfter: number; caps: string[] };
  expect(r.bellRung, `bell never pulled — seen: ${(r.seen ?? []).join(' · ')}`).toBe(true);
  expect(r.dragCue, `no drift cue — caps: ${r.caps.join(' | ')}`).toBe(true);
  expect(r.driftToNoise).toBe(true);
  expect(r.snapCue).toBe(true);
  expect(r.hpAfter).toBeLessThan(r.hpBefore);
  expect(errors).toEqual([]);
});
