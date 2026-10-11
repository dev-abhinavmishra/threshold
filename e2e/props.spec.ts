import { test, expect } from '@playwright/test';
import { seededRun, ThresholdG, GRoom } from './harness';

test.setTimeout(300_000);

// Ambient prop-interact layer: tv/clock/hearth/window/cooler/typewriter/
// printer/phone/seat, the two-stage washer, floor traps, hiding, codex.
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

// sprint 404 — the trap doesn't care whose foot: a walker crossing a
// live trap eats the same snap — staggered mid-stride, the pull real.
test('the trap fires on a walker too — staggered, and it was not your foot', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const ga = g as unknown as {
      entities: { id: string; state: string; pos?: { x: number; z: number };
        threatPos?(): { x: number; z: number } | null; staggerUntil?: number }[];
      snappedTraps: Set<string>;
      spawnById(id: string): void;
    };
    const em: { x: number; z: number; caption?: string }[] = [];
    (g as unknown as { sound: { on(cb: (e: { x: number; y: number; z: number; intensity: number; category: string; caption?: string }) => void): void } })
      .sound.on((e) => { if (/trap/.test(e.caption ?? '')) em.push(e); });

    // find an armed trap — same walk as the pry leg
    let trap: { x: number; z: number; key: string } | null = null;
    let trapRoom: GRoom | null = null;
    for (const r of g.route.rooms) {
      if (!r.spec?.props.some((p) => p.kind === 'mousetrap')) continue;
      g.player.teleport(r.origin.x, 0, r.origin.z);
      g.currentRoom = r.index;
      for (let f = 0; f < 30 && !g.liveTraps.length; f++) g.frame();
      if (g.liveTraps.length) { trap = g.liveTraps[0]; trapRoom = r; break; }
    }
    if (!trap || !trapRoom) return { stage: 'no-armed-trap' } as const;

    // drop a roaming walker onto the trap — the grafter reads its own pos
    ga.spawnById('grafter');
    const ent = ga.entities.find((e) => e.id === 'grafter' && e.state !== 'done');
    if (!ent?.pos) return { stage: 'no-walker' } as const;
    const hp0 = (g as unknown as { player: { health: number } }).player.health;
    ent.pos.x = trap.x; ent.pos.z = trap.z;
    g.player.teleport(trapRoom.origin.x, 0, trapRoom.origin.z); // stand clear
    for (let f = 0; f < 60 && !ga.snappedTraps.has(trap.key); f++) g.frame();
    const snapped = ga.snappedTraps.has(trap.key);
    const staggered = snapped && (ent.staggerUntil ?? 0) > g.clock.time;
    const pullHeard = em.some((e) => Math.hypot(e.x - trap!.x, e.z - trap!.z) < 0.5);
    const hpAfter = (g as unknown as { player: { health: number } }).player.health;
    return { stage: 'done', snapped, staggered, pullHeard, spared: hpAfter === hp0 } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.snapped, 'the trap snaps under the walker').toBe(true);
  expect(result.staggered, 'the snap staggers the walker').toBe(true);
  expect(result.pullHeard, 'the snap is a real pull at the trap').toBe(true);
  expect(result.spared, 'it was not your foot — no bite for you').toBe(true);
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

// Flooded halls (sprint 254): standing water makes every upright stride loud
// and slow; crouch-wading is quiet but slower; the drain is the paid quiet.
test('flooded halls: wading carries, crouch is quiet, the drain pays', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    const ga = g as unknown as {
      enterUnderscript(): void; space: string; godMode: boolean; currentRoom: number;
      drainedRooms: Set<string>; drainNoted: Set<string>;
      streamer: { get(i: number): { group: { getObjectByName(n: string): { position: { y: number } } | undefined } } | undefined };
      sound: { emit(e: { x: number; y: number; z: number; intensity: number; category: string; caption?: string; source?: unknown }): void };
      player: { pos: { x: number; y: number; z: number }; vel: { x: number; z: number }; yaw: number; pitch: number; crouching: boolean; speedMul: number; teleport(x: number, y: number, z: number): void; eyeHeight: number };
    };
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    ga.godMode = true;
    let splashes = 0;
    const origEmit = ga.sound.emit.bind(ga.sound);
    ga.sound.emit = (e) => { if (e.category === 'impact' && /water/.test(e.caption ?? '')) splashes++; origEmit(e); };

    ga.enterUnderscript();
    const DRAIN = new Set(['pipeManifold', 'conduitRun', 'sumpPump', 'hydrant', 'wallVent']);
    // a laundress fouls her own drain — the crank is choked while she works;
    // 'the wash' covers her window, so this leg takes a hall she isn't on
    const room = g.route.underRooms.find((r) => r.flooded && r.spec?.props?.some((p) => DRAIN.has(p.kind))
      && !r.scheduled?.some((s) => s.entity === 'laundress'));
    if (!room) return { stage: 'no-flooded-drainable' } as const;
    const drainless = g.route.underRooms.filter((r) => r.flooded && !r.spec?.props?.some((p) => DRAIN.has(p.kind)));

    const drive = (at: { x: number; y: number; z: number }, match: RegExp, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        ga.player.yaw = Math.atan2(ax, az);
        const eyeY = ga.player.pos.y + ga.player.eyeHeight;
        ga.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.55 - eyeY, Math.hypot(ax, az) || 1)));
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

    // Wade in — the room notices and the water carries steps.
    ga.player.teleport(room.origin.x, 0, room.origin.z);
    ga.currentRoom = room.index;
    for (let f = 0; f < 40; f++) g.frame();
    const key = `under:${room.index}`;
    const noted = ga.drainNoted.has(key);

    // Upright stride: loud and slowed.
    let slowSeen = 1;
    g.keys.add('KeyW'); g.keys.add('ShiftLeft');
    for (let f = 0; f < 120; f++) { g.frame(); slowSeen = Math.min(slowSeen, ga.player.speedMul); }
    g.keys.delete('KeyW'); g.keys.delete('ShiftLeft');
    const loudSplashes = splashes;

    // Crouch-wade: quiet.
    splashes = 0;
    g.keys.add('KeyC'); g.keys.add('KeyW');
    for (let f = 0; f < 120; f++) g.frame();
    g.keys.delete('KeyW'); g.keys.delete('KeyC');
    const quietSplashes = splashes;

    // The drain — a real interactable on the room's pipework.
    const drainIt = g.interaction.interactables.find((i) => i.kind === 'drain' && i.enabled);
    if (!drainIt) return { stage: 'no-drain', noted, loudSplashes, quietSplashes, slowSeen } as const;
    // stand on the room-center side of the pipework — drive() aims but
    // never walks, and the wade phase leaves the player wherever it ends
    {
      const dx = room.origin.x - drainIt.pos.x, dz = room.origin.z - drainIt.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      ga.player.teleport(drainIt.pos.x + (dx / dl) * 0.9, 0, drainIt.pos.z + (dz / dl) * 0.9);
      for (let f = 0; f < 5; f++) g.frame();
    }
    const prompts = drive(drainIt.pos, /open the drain/i, () => ga.drainedRooms.has(key), 220);
    const drained = ga.drainedRooms.has(key);
    if (!drained) return { stage: 'drain-failed', noted, loudSplashes, quietSplashes, slowSeen, prompts } as const;

    // Drained: walk it again — the water stopped carrying.
    ga.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    splashes = 0;
    g.keys.add('KeyW');
    for (let f = 0; f < 90; f++) g.frame();
    g.keys.delete('KeyW');
    const drainedSplashes = splashes;

    // The sheet sinks.
    for (let f = 0; f < 220; f++) g.frame();
    const sheetY = ga.streamer.get(room.index)?.group.getObjectByName(`flood-${room.index}`)?.position.y ?? null;

    return {
      stage: 'done', room: room.index, noted, loudSplashes, quietSplashes, slowSeen,
      drained, drainedSplashes, sheetY, drainlessCount: drainless.length,
      drainlessHaveDrain: drainless.some((r) => {
        ga.currentRoom = r.index;
        for (let f = 0; f < 5; f++) g.frame();
        return g.interaction.interactables.some((i) => i.kind === 'drain' && i.id.startsWith(`drain-${r.index}:`) || (i.kind === 'drain' && i.id.includes(`:${r.index}:`)));
      }),
      prompts,
    } as const;
  });

  if (result.stage === 'no-flooded-drainable') test.skip();
  expect(result.noted, JSON.stringify(result)).toBe(true);
  expect(result.loudSplashes, JSON.stringify(result)).toBeGreaterThan(0);
  expect(result.quietSplashes, JSON.stringify(result)).toBe(0);
  expect(result.slowSeen, JSON.stringify(result)).toBeLessThanOrEqual(0.7);
  expect(result.drained, JSON.stringify(result)).toBe(true);
  expect(result.drainedSplashes, JSON.stringify(result)).toBe(0);
  expect(result.sheetY, JSON.stringify(result)).toBeLessThan(0.05);
  expect(result.drainlessHaveDrain).toBe(false);
  expect(errors).toEqual([]);
});

test('wired drawers — the latch reads forced, the open bites, the coax is free', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // ~9% of unlocked drawers are wired

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      currentRoom: number; keys: Set<string>;
      godMode: boolean;
    };
    ga.godMode = false; // the bite must reach real health
    // find two wired drawers
    type Sock = { kind: string; pos: { x: number; y: number; z: number };
      yaw: number; meta: Record<string, unknown> };
    const wired = g.route.rooms.flatMap((r) => ((r.sockets ?? []) as Sock[])
      .filter((sk) => sk.kind === 'drawer' && sk.meta?.wired === true)
      .map((sk) => ({ room: r, sock: sk })));
    if (wired.length < 2) return { stage: 'too-few', n: wired.length } as const;
    const aim = (x: number, z: number, y = 0.7) => {
      g.player.yaw = Math.atan2(x - g.player.pos.x, z - g.player.pos.z);
      const eyeY = g.player.pos.y + (g.player.crouching ? 0.95 : g.player.eyeHeight);
      g.player.pitch = Math.atan2(y - eyeY, Math.hypot(x - g.player.pos.x, z - g.player.pos.z) || 1);
    };
    const drive = (want: RegExp, hold = false) => {
      let prompt = '';
      for (let f = 0; f < 130; f++) {
        prompt = g.interaction.focused?.prompt ?? '';
        if (want.test(prompt) && hold) ga.keys.add('KeyE');
        g.frame();
        if (hold && /coax|drawer/i.test(prompt) === false) break;
      }
      ga.keys.delete('KeyE');
      return prompt;
    };

    // Drawer A: read the tell, then pay the teeth.
    const a = wired[0];
    g.player.teleport(a.sock.pos.x, 0, a.sock.pos.z + 1.1);
    ga.currentRoom = a.room.index;
    aim(a.sock.pos.x, a.sock.pos.z);
    const tellPrompt = drive(/forced/, false);
    const hp0 = g.player.health;
    drive(/Search drawer/, true);
    const bit = g.player.health < hp0;
    const snapped = caps.some((c) => /latch snaps/.test(c));

    // Drawer B: coax the latch — free, no teeth.
    const b = wired[1];
    g.player.teleport(b.sock.pos.x, 0, b.sock.pos.z + 0.85);
    ga.currentRoom = b.room.index;
    const capsBefore = caps.length;
    ga.keys.add('KeyC'); // kneel to coax — crouch-gated like the wire
    const seen: string[] = [];
    for (let f = 0; f < 6; f++) g.frame(); // let the crouch settle before aiming
    aim(b.sock.pos.x, b.sock.pos.z, 0.4);
    for (let f = 0; f < 40; f++) { g.frame(); if (f % 20 === 19) seen.push(g.interaction.focused?.prompt ?? '-'); }
    drive(/Coax the latch/, true);
    ga.keys.delete('KeyC');
    const coaxed = b.sock.meta.opened === true && b.sock.meta.wired === false;
    // The coax path is quiet: no snap, and the eased-latch line fires.
    const coaxCaps = caps.slice(capsBefore);
    const noBite = !coaxCaps.some((c) => /latch snaps|latch bites/.test(c))
      && coaxCaps.some((c) => /coaxes open|latch eases/.test(c));
    return { stage: 'done', n: wired.length, tellPrompt, bit, snapped, coaxed, noBite,
      seen: seen.slice(-14), caps: caps.slice(-10) } as const;
  });

  if (result.stage === 'too-few') test.skip();
  expect(result.tellPrompt, JSON.stringify(result)).toMatch(/latch looks forced/);
  expect(result.bit, JSON.stringify(result)).toBe(true);
  expect(result.snapped, JSON.stringify(result)).toBe(true);
  expect(result.coaxed, JSON.stringify(result)).toBe(true);
  expect(result.noBite, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the wheel chews — fan warns, bites a stander, and dies on the chock', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // live fans at 39/48/60/...

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      currentRoom: number;
      hazard: { fans: { pos: { x: number; z: number }; room: number; dead: boolean }[];
        evidence: { kind: string; room: number }[] };
      player: { health: number };
      inventory: { id: string; count: number }[];
    };
    const fan = ga.hazard.fans.find((f) => !f.dead);
    if (!fan) return { stage: 'no-fan' } as const;
    const froom = g.route.rooms[fan.room];
    // hover at the warn ring, from the room interior — the wheel names itself
    const inX = froom.origin.x - fan.pos.x, inZ = froom.origin.z - fan.pos.z;
    const inL = Math.hypot(inX, inZ) || 1;
    const hx = fan.pos.x + (inX / inL) * 1.7, hz = fan.pos.z + (inZ / inL) * 1.7;
    g.player.teleport(hx, 0, hz);
    ga.currentRoom = fan.room;
    for (let f = 0; f < 40; f++) g.frame();
    const warned = caps.some((c) => /belt-wheel chews/.test(c));
    // stand in the blades — the wheel bites
    const hp0 = ga.player.health;
    g.player.teleport(fan.pos.x + (inX / inL) * 0.5, 0, fan.pos.z + (inZ / inL) * 0.5);
    ga.currentRoom = fan.room;
    for (let f = 0; f < 30; f++) g.frame();
    const bitten = ga.player.health < hp0;
    // back off, feed the chock — the blades stand still
    g.player.teleport(fan.pos.x + (inX / inL) * 1.8, 0, fan.pos.z + (inZ / inL) * 1.8);
    ga.currentRoom = fan.room;
    ga.inventory.push({ id: 'doorChock', count: 1 });
    const eyeY2 = g.player.pos.y + g.player.eyeHeight;
    g.player.pitch = Math.atan2(1.15 - eyeY2, 1.8);
    g.player.yaw = Math.atan2(fan.pos.x - g.player.pos.x, fan.pos.z - g.player.pos.z);
    for (let f = 0; f < 12; f++) g.frame();
    const chockPrompt = g.interaction.focused?.prompt ?? '';
    const chocks0 = (ga.inventory.find((i) => i.id === 'doorChock')?.count) ?? 0;
    g.keys.add('KeyE');
    for (let f = 0; f < 60 && !fan.dead; f++) g.frame();
    g.keys.delete('KeyE');
    for (let f = 0; f < 8; f++) g.frame();
    const spent = (ga.inventory.find((i) => i.id === 'doorChock')?.count ?? 0) < chocks0;
    const signLeft = ga.hazard.evidence.some((e) => e.kind === 'fan' && e.room === fan.room);
    const jammed = fan.dead;
    // sprint 394 — the jam isn't welded: the dead wheel offers 'Work the
    // chock free'; pulling it back returns the tool and the blades live.
    // A cabinet near the stand out-scores the verb at this aim, so pin
    // focus to the minted unchock id (the doors.spec aimHold pattern) —
    // hold+interact still run the real pipeline.
    for (let f = 0; f < 12; f++) g.frame();
    const unchock = g.interaction.interactables.find((i) => i.kind === 'unchock');
    const unchockPrompt = unchock?.prompt ?? '';
    if (unchock) {
      const sys = g.interaction as unknown as {
        focus: (eye: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }, pos: { x: number; y: number; z: number }) => typeof g.interaction.focused;
        focused: typeof g.interaction.focused;
        interactables: typeof g.interaction.interactables;
      };
      const origFocus = sys.focus.bind(sys);
      sys.focus = (eye, look, pos) => {
        const here = sys.interactables.find((i) => i.id === unchock.id);
        const r = here ?? origFocus(eye, look, pos);
        sys.focused = r ?? null;
        return r;
      };
      for (let f = 0; f < 80 && fan.dead; f++) { if (g.interaction.focused?.id === unchock.id) g.keys.add('KeyE'); g.frame(); }
      sys.focus = origFocus;
      g.keys.delete('KeyE');
    }
    const back = (ga.inventory.find((i) => i.id === 'doorChock')?.count ?? 0) > (chocks0 - 1);
    const spun = !fan.dead;
    return { stage: 'done', warned, bitten, dead: jammed, spent, signLeft, chockPrompt, unchockPrompt, back, spun, caps } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.warned, JSON.stringify(result)).toBe(true);
  expect(result.chockPrompt, JSON.stringify(result)).toMatch(/Chock the blades/);
  expect(result.bitten, JSON.stringify(result)).toBe(true);
  expect(result.dead, JSON.stringify(result)).toBe(true);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.signLeft, JSON.stringify(result)).toBe(true);
  expect(result.unchockPrompt, JSON.stringify(result)).toMatch(/Work the chock free/);
  expect(result.back, JSON.stringify(result)).toBe(true);
  expect(result.spun, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the belt is goods — the strip signs, the refit answers, the house pulls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // live fans at 39/48/60/...

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const ga = g as unknown as {
      currentRoom: number;
      hazard: { fans: { pos: { x: number; z: number }; room: number; dead: boolean;
          belted?: boolean; owner?: 'player'; chocked?: boolean }[];
        evidence: { kind: string; room: number; by?: string }[] };
      player: { health: number };
      inventory: { id: string; count: number }[];
      entityCtx: () => { rearmHazard?: (k: string, x: number, z: number) => string | null };
      droppedBelts: { x: number; z: number }[];
    };
    const fan = ga.hazard.fans.find((f) => !f.dead);
    if (!fan) return { stage: 'no-fan' } as const;
    const froom = g.route.rooms[fan.room];
    const inX = froom.origin.x - fan.pos.x, inZ = froom.origin.z - fan.pos.z;
    const inL = Math.hypot(inX, inZ) || 1;
    // stand near the blades, feed the chock — the wheel jams
    g.player.teleport(fan.pos.x + (inX / inL) * 1.8, 0, fan.pos.z + (inZ / inL) * 1.8);
    ga.currentRoom = fan.room;
    ga.inventory.push({ id: 'doorChock', count: 1 });
    for (let f = 0; f < 12; f++) g.frame();
    const chockIt = g.interaction.interactables.find((i) => i.kind === 'chock');
    const sys = g.interaction as unknown as {
      focus: (eye: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }, pos: { x: number; y: number; z: number }) => typeof g.interaction.focused;
      focused: typeof g.interaction.focused;
      interactables: typeof g.interaction.interactables;
    };
    const origFocus = sys.focus.bind(sys);
    const pinTo = (id: string) => {
      sys.focus = (eye, look, pos) => {
        const here = sys.interactables.find((i) => i.id === id);
        const r = here ?? origFocus(eye, look, pos);
        sys.focused = r ?? null;
        return r;
      };
    };
    if (chockIt) {
      pinTo(chockIt.id);
      for (let f = 0; f < 80 && !fan.dead; f++) { if (g.interaction.focused?.id === chockIt.id) g.keys.add('KeyE'); g.frame(); }
      g.keys.delete('KeyE');
    }
    const jammed = fan.dead && fan.chocked === true;
    for (let f = 0; f < 12; f++) g.frame();
    // the still wheel offers the strip
    const strip = g.interaction.interactables.find((i) => i.kind === 'workBelt');
    const stripPrompt = strip?.prompt ?? '';
    const belts0 = (ga.inventory.find((i) => i.id === 'fanBelt')?.count) ?? 0;
    if (strip) {
      pinTo(strip.id);
      for (let f = 0; f < 120 && fan.belted !== false; f++) { if (g.interaction.focused?.id === strip.id) g.keys.add('KeyE'); g.frame(); }
      g.keys.delete('KeyE');
    }
    const stripped = fan.belted === false && fan.dead;
    const beltGot = (ga.inventory.find((i) => i.id === 'fanBelt')?.count ?? 0) > belts0;
    const chockBack = fan.chocked === false
      && (ga.inventory.find((i) => i.id === 'doorChock')?.count ?? 0) > 0;
    const signed = ga.hazard.evidence.some((e) => e.kind === 'work'
      && e.by === 'player' && e.room === fan.room);
    // a beltless housing is outside the house's re-engage
    const rearmDead = ga.entityCtx().rearmHazard?.('fan', fan.pos.x, fan.pos.z);
    for (let f = 0; f < 12; f++) g.frame();
    // the stripped housing offers the refit — your belt, your wheel
    const refit = g.interaction.interactables.find((i) => i.kind === 'refitBelt');
    const refitPrompt = refit?.prompt ?? '';
    if (refit) {
      pinTo(refit.id);
      for (let f = 0; f < 120 && fan.dead; f++) { if (g.interaction.focused?.id === refit.id) g.keys.add('KeyE'); g.frame(); }
      g.keys.delete('KeyE');
    }
    sys.focus = origFocus;
    const owned = fan.owner === 'player' && !fan.dead && fan.belted !== false;
    // jurisdiction: the house can't re-engage your live wheel — and a
    // 'work' mark near it gets the pull instead
    const rearmMine = ga.entityCtx().rearmHazard?.('fan', fan.pos.x, fan.pos.z);
    const pull = ga.entityCtx().rearmHazard?.('work', fan.pos.x, fan.pos.z);
    const pulled = fan.belted === false && fan.dead && fan.owner === undefined;
    const beltOnBoards = ga.droppedBelts.length > 0;
    return { stage: 'done', jammed, stripPrompt, stripped, beltGot, chockBack, signed,
      rearmDead, refitPrompt, owned, rearmMine, pull, pulled, beltOnBoards } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.jammed, JSON.stringify(result)).toBe(true);
  expect(result.stripPrompt, JSON.stringify(result)).toMatch(/Work the belt off/);
  expect(result.stripped, JSON.stringify(result)).toBe(true);
  expect(result.beltGot, JSON.stringify(result)).toBe(true);
  expect(result.chockBack, JSON.stringify(result)).toBe(true);
  expect(result.signed, JSON.stringify(result)).toBe(true);
  expect(result.rearmDead, JSON.stringify(result)).toBeNull();
  expect(result.refitPrompt, JSON.stringify(result)).toMatch(/Fit the belt back/);
  expect(result.owned, JSON.stringify(result)).toBe(true);
  expect(result.rearmMine, JSON.stringify(result)).toBeNull();
  expect(result.pull, JSON.stringify(result)).toBe('pull');
  expect(result.pulled, JSON.stringify(result)).toBe(true);
  expect(result.beltOnBoards, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the glass is goods — the pry signs, the seat answers, the house tears', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const ga = g as unknown as {
      currentRoom: number;
      hazard: { watchers: { pos: { x: number; z: number }; room: number; dead: boolean;
          lensed?: boolean; owner?: 'player'; lensHoldUntil?: number }[];
        evidence: { kind: string; room: number; by?: string }[] };
      player: { health: number };
      inventory: { id: string; count: number }[];
      entityCtx: () => { rearmHazard?: (k: string, x: number, z: number) => string | null };
      droppedLenses: { x: number; z: number }[];
    };
    const eye = ga.hazard.watchers.find((w) => !w.dead
      && g.route.rooms[w.room] && !g.route.rooms[w.room].darkRoom);
    if (!eye) return { stage: 'no-eye' } as const;
    const wroom = g.route.rooms[eye.room];
    const inX = wroom.origin.x - eye.pos.x, inZ = wroom.origin.z - eye.pos.z;
    const inL = Math.hypot(inX, inZ) || 1;
    // stand under the eye, feed the felt — it goes blind
    g.player.teleport(eye.pos.x + (inX / inL) * 1.6, 0, eye.pos.z + (inZ / inL) * 1.6);
    ga.currentRoom = eye.room;
    ga.inventory.push({ id: 'feltWrap', count: 1 });
    const sys = g.interaction as unknown as {
      focus: (eyeP: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }, pos: { x: number; y: number; z: number }) => typeof g.interaction.focused;
      focused: typeof g.interaction.focused;
      interactables: typeof g.interaction.interactables;
    };
    const origFocus = sys.focus.bind(sys);
    const pinTo = (id: string) => {
      sys.focus = (eyeP, look, pos) => {
        const here = sys.interactables.find((i) => i.id === id);
        const r = here ?? origFocus(eyeP, look, pos);
        sys.focused = r ?? null;
        return r;
      };
    };
    for (let f = 0; f < 12; f++) g.frame();
    const tapeIt = g.interaction.interactables.find((i) => i.kind === 'tape');
    if (tapeIt) {
      pinTo(tapeIt.id);
      for (let f = 0; f < 100 && !eye.dead; f++) { if (g.interaction.focused?.id === tapeIt.id) g.keys.add('KeyE'); g.frame(); }
      g.keys.delete('KeyE');
    }
    const blinded = eye.dead;
    for (let f = 0; f < 12; f++) g.frame();
    // the blind eye offers the pry
    const pry = g.interaction.interactables.find((i) => i.kind === 'pryLens');
    const pryPrompt = pry?.prompt ?? '';
    const lenses0 = (ga.inventory.find((i) => i.id === 'eyeLens')?.count) ?? 0;
    if (pry) {
      pinTo(pry.id);
      for (let f = 0; f < 140 && eye.lensed !== false; f++) { if (g.interaction.focused?.id === pry.id) g.keys.add('KeyE'); g.frame(); }
      g.keys.delete('KeyE');
    }
    const pried = eye.lensed === false && eye.dead;
    const lensGot = (ga.inventory.find((i) => i.id === 'eyeLens')?.count ?? 0) > lenses0;
    const wrapBack = (ga.inventory.find((i) => i.id === 'feltWrap')?.count ?? 0) > 0;
    const signed = ga.hazard.evidence.some((e) => e.kind === 'work'
      && e.by === 'player' && e.room === eye.room);
    // the empty socket is outside the house's wake — felt-stay-dead,
    // and the pry already handed your felt back so there's nothing to strip
    const rearmDead = ga.entityCtx().rearmHazard?.('blind', eye.pos.x, eye.pos.z);
    for (let f = 0; f < 12; f++) g.frame();
    // the pried socket offers the seat — your glass, your eye
    const seat = g.interaction.interactables.find((i) => i.kind === 'seatLens');
    const seatPrompt = seat?.prompt ?? '';
    if (seat) {
      pinTo(seat.id);
      for (let f = 0; f < 120 && eye.dead; f++) { if (g.interaction.focused?.id === seat.id) g.keys.add('KeyE'); g.frame(); }
      g.keys.delete('KeyE');
    }
    sys.focus = origFocus;
    const owned = eye.owner === 'player' && !eye.dead && eye.lensed !== false;
    // jurisdiction: the house can't wake your eye — a 'work' mark near
    // it gets the tear instead
    const rearmMine = ga.entityCtx().rearmHazard?.('blind', eye.pos.x, eye.pos.z);
    const tear = ga.entityCtx().rearmHazard?.('work', eye.pos.x, eye.pos.z);
    const torn = eye.lensed === false && eye.dead && eye.owner === undefined;
    const lensOnBoards = ga.droppedLenses.length > 0;
    return { stage: 'done', blinded, pryPrompt, pried, lensGot, wrapBack, signed,
      rearmDead, seatPrompt, owned, rearmMine, tear, torn, lensOnBoards } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.blinded, JSON.stringify(result)).toBe(true);
  expect(result.pryPrompt, JSON.stringify(result)).toMatch(/Pry the lens out/);
  expect(result.pried, JSON.stringify(result)).toBe(true);
  expect(result.lensGot, JSON.stringify(result)).toBe(true);
  expect(result.wrapBack, JSON.stringify(result)).toBe(true);
  expect(result.signed, JSON.stringify(result)).toBe(true);
  expect(result.rearmDead, JSON.stringify(result)).toBeNull();
  expect(result.seatPrompt, JSON.stringify(result)).toMatch(/Seat the lens/);
  expect(result.owned, JSON.stringify(result)).toBe(true);
  expect(result.rearmMine, JSON.stringify(result)).toBeNull();
  expect(result.tear, JSON.stringify(result)).toBe('lensTear');
  expect(result.torn, JSON.stringify(result)).toBe(true);
  expect(result.lensOnBoards, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the scarred latch — a drawer somebody else already coaxed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // coaxed drawer at main room 77

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      currentRoom: number;
      player: { health: number };
      inventory: { id: string; count: number }[];
    };
    let target: { pos: { x: number; y: number; z: number }; meta?: Record<string, unknown> } | undefined;
    let roomIdx = -1;
    for (const r of g.route.rooms) {
      const sk = (r.sockets ?? []).find((s) => s.meta?.coaxed === true);
      if (sk) { target = sk; roomIdx = r.index; break; }
    }
    if (!target?.meta) return { stage: 'none' } as const;
    const sock = target as { pos: { x: number; y: number; z: number }; meta: Record<string, unknown> };
    // stand at the drawer — the scar tells first
    const room = g.route.rooms[roomIdx];
    const inX = room.origin.x - sock.pos.x, inZ = room.origin.z - sock.pos.z;
    const inL = Math.hypot(inX, inZ) || 1;
    g.player.teleport(sock.pos.x + (inX / inL) * 1.4, 0, sock.pos.z + (inZ / inL) * 1.4);
    ga.currentRoom = roomIdx;
    const eyeY = g.player.pos.y + g.player.eyeHeight;
    g.player.pitch = Math.atan2(sock.pos.y + 0.4 - eyeY, 1.4);
    g.player.yaw = Math.atan2(sock.pos.x - g.player.pos.x, sock.pos.z - g.player.pos.z);
    const inv0 = ga.inventory.map((i) => `${i.id}:${i.count}`).join(',');
    const hp0 = ga.player.health;
    let prompt = '';
    for (let f = 0; f < 30; f++) { g.frame(); prompt = g.interaction.focused?.prompt ?? prompt; }
    // hold E to search — no teeth, just the bare drawer
    g.keys.add('KeyE');
    for (let f = 0; f < 50 && sock.meta.opened !== true; f++) g.frame();
    g.keys.delete('KeyE');
    for (let f = 0; f < 10; f++) g.frame();
    const inv1 = ga.inventory.map((i) => `${i.id}:${i.count}`).join(',');
    return { stage: 'done', prompt, opened: sock.meta.opened === true,
      noBite: !caps.some((c) => /latch snaps|latch bites/.test(c)),
      bare: caps.some((c) => /drawer is bare/.test(c)),
      paidNothing: inv0 === inv1 && ga.player.health === hp0, caps } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.prompt, JSON.stringify(result)).toMatch(/scarred/);
  expect(result.opened, JSON.stringify(result)).toBe(true);
  expect(result.noBite, JSON.stringify(result)).toBe(true);
  expect(result.bare, JSON.stringify(result)).toBe(true);
  expect(result.paidNothing, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the lie in wire — a forged sign reads like fresh work to a hunter', async ({ page }) => {
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
      currentRoom: number;
      hazard: { evidence: { kind: string; room: number; pos: { x: number; z: number }; readBy: string[]; weak?: boolean }[] };
      inventory: { id: string; count: number }[];
    };
    const room = g.route.rooms[4];
    g.player.teleport(room.origin.x, 0, room.origin.z);
    ga.currentRoom = 4;
    ga.inventory.push({ id: 'feltWrap', count: 2 });
    const ev0 = ga.hazard.evidence.length;
    // kneel on bare boards — the wrap offers the lie
    g.keys.add('KeyC');
    for (let f = 0; f < 20; f++) g.frame();
    const prompt = g.interaction.focused?.prompt ?? '';
    g.keys.add('KeyE');
    for (let f = 0; f < 80 && ga.hazard.evidence.length === ev0; f++) g.frame();
    g.keys.delete('KeyE');
    g.keys.delete('KeyC');
    const evs = ga.hazard.evidence.slice(-2) as { kind: string; room: number; readBy: string[]; weak?: boolean }[];
    const wraps = ga.inventory.find((i) => i.id === 'feltWrap')?.count ?? 0;
    const liesCaption = caps.some((c) => /lie in wire/.test(c));
    // the forged mark is ordinary fresh sign — a hunter's getter would read it
    const hunterReadable = !!evs[0] && evs[0].room === 4 && evs[0].readBy.length === 0;
    // ...and the wrap's ash lands as a second, weak mark beside it
    const ash = evs[1];
    return { stage: 'done', prompt, grew: ga.hazard.evidence.length === ev0 + 2,
      hunterReadable, ashWeak: ash?.weak === true && ash?.kind === 'water' && ash?.room === 4,
      spent: wraps === 1, liesCaption, caps } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.prompt, JSON.stringify(result)).toMatch(/Forge the sign/);
  expect(result.grew, JSON.stringify(result)).toBe(true);
  expect(result.hunterReadable, JSON.stringify(result)).toBe(true);
  expect(result.ashWeak, 'the rub left a weak water-ash the grafter alone reads').toBe(true);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.liesCaption, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

// The receiver stays off — an answered phone mints the planted lure, the
// fuse rings it back loud ('distraction'), then the line goes dead.
test('leave it off the hook — the planted ring pulls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const rec = g as unknown as {
      answeredPhones: Set<string>; offHookPhones: Set<string>; spentPhones: Set<string>;
      hookRings: { key: string; pos: { x: number; y: number; z: number }; at: number; until: number; lastRing: number }[];
    };
    const world = (room: GRoom, p: { x: number; z: number }) => {
      const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
      return { x: room.origin.x + p.x * c + p.z * s, z: room.origin.z - p.x * s + p.z * c };
    };
    const drive = (at: { x: number; z: number }, match: RegExp, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        // the phone verb anchors at y=1.4 — aim pos.y+0.6 like the focus pass does
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(1.4 + 0.55 - eyeY, Math.hypot(ax, az) || 1)));
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

    // Up to two payphone rooms: phone A rings out, phone B is hung up
    // mid-fuse and must stay silent (sprint 401 — the un-plant).
    const phones: { room: GRoom; wpos: { x: number; z: number } }[] = [];
    for (const r of g.route.rooms) {
      const p = r.spec?.props.find((x) => x.kind === 'payphone');
      if (!p) continue;
      phones.push({ room: r, wpos: world(r, p) });
      if (phones.length === 2) break;
    }
    if (!phones.length) return { stage: 'no-phone' };

    // Listen for the planted lure's emits.
    const em: { x: number; z: number; intensity: number; category: string }[] = [];
    (g as unknown as { sound: { on(cb: (e: { x: number; y: number; z: number; intensity: number; category: string }) => void): void } })
      .sound.on((e) => { if (e.category === 'distraction') em.push(e); });

    const standAndArm = (ph: { room: GRoom; wpos: { x: number; z: number } }, cap: number, skipLift = false) => {
      const dx = ph.room.origin.x - ph.wpos.x, dz = ph.room.origin.z - ph.wpos.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(ph.wpos.x + (dx / L) * 1.2, 0, ph.wpos.z + (dz / L) * 1.2);
      g.currentRoom = ph.room.index;
      for (let f = 0; f < 40; f++) g.frame();
      // counts are relative — an earlier phone's keys already sit in the sets
      let p1 = '';
      if (!skipLift) {
        const aBefore = rec.answeredPhones.size;
        p1 = drive(ph.wpos, /lift the receiver/i,
          () => rec.answeredPhones.size > aBefore, cap);
        if (rec.answeredPhones.size <= aBefore) return { ok: false as const, p1 };
      }
      const oBefore = rec.offHookPhones.size;
      const p2 = drive(ph.wpos, /leave it off the hook/i,
        () => rec.offHookPhones.size > oBefore, cap);
      return { ok: rec.offHookPhones.size > oBefore, p1, p2 };
    };

    // Phone A phase 1 (sprint 402): a live scare-ring dies at the lift —
    // the house can't ring a phone already in your hand.
    let ringCut = false;
    {
      const ph = phones[0];
      const dx = ph.room.origin.x - ph.wpos.x, dz = ph.room.origin.z - ph.wpos.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(ph.wpos.x + (dx / L) * 1.2, 0, ph.wpos.z + (dz / L) * 1.2);
      g.currentRoom = ph.room.index;
      for (let f = 0; f < 40; f++) g.frame();
      (g as unknown as { phoneRing: unknown }).phoneRing =
        { pos: { x: ph.wpos.x, y: 1.4, z: ph.wpos.z }, at: g.clock.time, until: g.clock.time + 30, lastRing: 0 };
      const aBefore = rec.answeredPhones.size;
      drive(ph.wpos, /lift the receiver/i, () => rec.answeredPhones.size > aBefore, 200);
      ringCut = rec.answeredPhones.size > aBefore
        && (g as unknown as { phoneRing: unknown }).phoneRing === null;
    }

    // Phone A phase 2: arm it and let the planted ring run out.
    // (phase 1 already answered this phone — 'Lift' is un-minted here)
    const a = standAndArm(phones[0], 200, true);
    if (!a.ok) return { stage: 'arm-failed', a, ringCut };
    const hr = rec.hookRings[0];
    if (!hr) return { stage: 'no-ring-armed' };
    const fuseLen = hr.until - hr.at;
    g.clock.time = hr.at - 0.5;
    for (let f = 0; f < 400 && rec.spentPhones.size === 0; f++) g.frame();
    const luresA = em.filter((e) => Math.hypot(e.x - phones[0].wpos.x, e.z - phones[0].wpos.z) < 0.5);

    // Phone B: arm it, then hang the receiver up — the ring must die
    // with it (no emits at its spot, phone spent).
    let hungUp = false; let silenced = true; let p3 = '';
    if (phones.length > 1) {
      const emBefore = em.length;
      const arm = standAndArm(phones[1], 200);
      if (!arm.ok) return { stage: 'b-arm-failed', arm };
      const hrB = rec.hookRings.find((r) => !rec.spentPhones.has(r.key)
        && Math.hypot(r.pos.x - phones[1].wpos.x, r.pos.z - phones[1].wpos.z) < 1);
      if (!hrB) return { stage: 'b-no-ring-armed' };
      p3 = drive(phones[1].wpos, /hang the receiver up/i,
        () => rec.spentPhones.size > 1, 200);
      hungUp = rec.spentPhones.size > 1;
      // run the clock well past the old fuse — nothing should ever ring
      g.clock.time = hrB.at + 8;
      for (let f = 0; f < 30; f++) g.frame();
      const emB = em.slice(emBefore).filter((e) => Math.hypot(e.x - phones[1].wpos.x, e.z - phones[1].wpos.z) < 0.5);
      silenced = emB.length === 0 && rec.hookRings.length === 0;
    }

    return {
      stage: 'done', fuseLen,
      lures: luresA.length,
      lureIntensity: luresA[0]?.intensity ?? 0,
      spent: rec.spentPhones.size,
      ringCut,
      secondPhone: phones.length > 1,
      hungUp, silenced, p3,
    };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.fuseLen).toBeCloseTo(6.5, 1);
  expect(result.lures, 'the planted ring emits distraction lure bursts').toBeGreaterThanOrEqual(4);
  expect(result.lureIntensity).toBeCloseTo(0.85, 2);
  expect(result.spent, 'the line went dead after the ring').toBeGreaterThanOrEqual(1);
  expect(result.ringCut, 'lifting the receiver cuts a live scare-ring').toBe(true);
  if (result.secondPhone) {
    expect(result.hungUp, JSON.stringify(result)).toBe(true);
    expect(result.silenced, 'a hung-up receiver never rings').toBe(true);
  }
  expect(errors).toEqual([]);
});

// The aimed lure — a coin rings the farthest live phone on the floor:
// the pull lands where you aren't, the touch-tones where you are.
test('dial the far line — the aimed pull', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const rec = g as unknown as {
      imprints: number;
      answeredPhones: Set<string>; offHookPhones: Set<string>; spentPhones: Set<string>;
      hookRings: { key: string; pos: { x: number; y: number; z: number }; at: number; until: number; lastRing: number; dial?: boolean }[];
    };
    const SAFE = new Set(['ms-clinic', 'ms-custodian', 'ms-index-ante', 'ms-final-ante', 'ms-decompress']);
    const world = (room: GRoom, p: { x: number; z: number }) => {
      const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
      return { x: room.origin.x + p.x * c + p.z * s, z: room.origin.z - p.x * s + p.z * c };
    };
    // every payphone on the floor, keyed like the mint loop does
    const phones: { key: string; room: GRoom; wpos: { x: number; z: number } }[] = [];
    for (const r of g.route.rooms) {
      if (!r.spec || SAFE.has(r.templateId ?? '')) continue;
      let pn = 0;
      for (const p of r.spec.props) {
        if (p.kind !== 'payphone') continue;
        phones.push({ key: `${(g as unknown as { space: string }).space}:${r.index}:${pn++}`, room: r, wpos: world(r, p) });
      }
    }
    if (phones.length < 2) return { stage: 'one-phone' };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const em: { x: number; z: number; intensity: number; category: string }[] = [];
    (g as unknown as { sound: { on(cb: (e: { x: number; y: number; z: number; intensity: number; category: string }) => void): void } })
      .sound.on((e) => { if (e.category === 'distraction') em.push(e); });

    const drive = (at: { x: number; z: number }, ay: number, match: RegExp, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(ay + 0.55 - eyeY, Math.hypot(ax, az) || 1)));
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
    const stand = (ph: { wpos: { x: number; z: number }; room: GRoom }) => {
      const dx = ph.room.origin.x - ph.wpos.x, dz = ph.room.origin.z - ph.wpos.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(ph.wpos.x + (dx / L) * 1.2, 0, ph.wpos.z + (dz / L) * 1.2);
      g.currentRoom = ph.room.index;
      for (let f = 0; f < 40; f++) g.frame();
    };

    // stand at the first phone, dial — the farthest live phone should ring
    const home = phones[0];
    const live = (k: string) => !rec.answeredPhones.has(k) && !rec.offHookPhones.has(k)
      && !rec.spentPhones.has(k) && !rec.hookRings.some((r) => r.key === k);
    const want = phones.filter((p) => p.key !== home.key && live(p.key))
      .sort((x, y) => Math.hypot(y.wpos.x - home.wpos.x, y.wpos.z - home.wpos.z)
        - Math.hypot(x.wpos.x - home.wpos.x, x.wpos.z - home.wpos.z))[0];
    if (!want) return { stage: 'no-target' };
    stand(home);
    rec.imprints = 5;
    const p1 = drive(home.wpos, 1.12, /dial the far line/i,
      () => rec.hookRings.some((r) => r.dial), 240);
    const hr = rec.hookRings.find((r) => r.dial);
    if (!hr) return { stage: 'dial-failed', p1 };
    const paidCoin = rec.imprints === 4;
    const rangFar = hr.key === want.key && Math.hypot(hr.pos.x - want.wpos.x, hr.pos.z - want.wpos.z) < 0.8;

    // jump to connect: the pull emits at the far phone, not here
    g.clock.time = hr.at - 0.3;
    for (let f = 0; f < 400 && em.length < 4; f++) g.frame();
    const farPull = em.filter((e) => Math.hypot(e.x - want.wpos.x, e.z - want.wpos.z) < 2);
    const homePull = em.filter((e) => Math.hypot(e.x - home.wpos.x, e.z - home.wpos.z) < 2);

    // lift the ringing phone — the call dies in your hand
    stand(want);
    const emBefore = em.length;
    const p2 = drive(want.wpos, 1.4, /lift the receiver/i,
      () => rec.answeredPhones.has(want.key), 240);
    const callDied = rec.answeredPhones.has(want.key)
      && !rec.hookRings.some((r) => r.dial)
      && caps.some((c) => /call dies in your hand/.test(c));
    const ringStopped = em.length === emBefore || em.slice(emBefore).length < 3;

    // no live phones left: the line finds nothing, and takes no coin
    for (const p of phones) if (p.key !== home.key) {
      rec.spentPhones.add(p.key);
    }
    rec.hookRings.length = 0;
    stand(home);
    rec.imprints = 5;
    const p3 = drive(home.wpos, 1.12, /dial the far line/i,
      () => caps.some((c) => /finds no live phone/.test(c)), 200);
    const refused = caps.some((c) => /finds no live phone/.test(c))
      && rec.imprints === 5 && !rec.hookRings.some((r) => r.dial);

    return { stage: 'done', paidCoin, rangFar, farPull: farPull.length, homePull: homePull.length,
      callDied, ringStopped, refused, p1, p2, p3, caps: caps.slice(-6) };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.paidCoin, 'the phone takes its coin').toBe(true);
  expect(result.rangFar, 'the dial rings the farthest live phone').toBe(true);
  expect(result.farPull, 'the pull emits at the far phone').toBeGreaterThanOrEqual(3);
  expect(result.homePull, 'no pull at your own phone').toBe(0);
  expect(result.callDied, 'lifting the ringing phone kills the paid call').toBe(true);
  expect(result.ringStopped, 'the ring stops once answered').toBe(true);
  expect(result.refused, 'no live phones refuses free').toBe(true);
  expect(errors).toEqual([]);
});

// sprint 646 — the under's grafts: a carried belt/lens re-threads dead
// work against you. Driven through the same ctx hooks the grafter calls.
test('the under grafts back — the wheel and the socket answer a third jurisdiction', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const ga = g as unknown as {
      hazard: {
        fans: { pos: { x: number; z: number }; room: number; dead: boolean;
          belted?: boolean; owner?: 'player' | 'under' }[];
        watchers: { pos: { x: number; z: number }; room: number; dead: boolean;
          lensed?: boolean; owner?: 'player' | 'under' }[];
        evidence: { kind: string; by?: string }[];
      };
      droppedBelts: { x: number; z: number }[];
      entityCtx: () => {
        nearestGraft?: (x: number, z: number, maxD: number, kind?: 'wheel' | 'socket')
          => { x: number; z: number; kind: 'wheel' | 'socket' } | null;
        graft?: (x: number, z: number, kind: 'wheel' | 'socket', byKey: string) => boolean;
        rearmHazard?: (k: string, x: number, z: number) => string | null;
      };
      mintBeltDrops: () => void;
    };
    const ctx = ga.entityCtx();
    // a stripped housing (belted:false) is the wheel substrate;
    // a pried socket (lensed:false) is the eye substrate.
    const wheel = ga.hazard.fans.find((f) => g.route.rooms[f.room]);
    if (!wheel) return { stage: 'no-fan' } as const;
    wheel.dead = true;
    wheel.belted = false;
    const socket = ga.hazard.watchers.find((w) => g.route.rooms[w.room]
      && !g.route.rooms[w.room].darkRoom);
    if (!socket) return { stage: 'no-eye' } as const;
    socket.dead = true;
    socket.lensed = false;
    const evBefore = ga.hazard.evidence.length;
    // the graft-seek finds each substrate under its own kind only
    const wheelSite = ctx.nearestGraft?.(wheel.pos.x, wheel.pos.z, 30, 'wheel');
    const socketSite = ctx.nearestGraft?.(socket.pos.x, socket.pos.z, 30, 'socket');
    const wrongKind = ctx.nearestGraft?.(wheel.pos.x, wheel.pos.z, 30, 'socket');
    const wrongKind2 = ctx.nearestGraft?.(socket.pos.x, socket.pos.z, 30, 'wheel');
    // and the graft itself claims them for the under
    const graftedWheel = ctx.graft?.(wheel.pos.x, wheel.pos.z, 'wheel', 'grafter:0');
    const graftedSocket = ctx.graft?.(socket.pos.x, socket.pos.z, 'socket', 'grafter:0');
    const graftSign = ga.hazard.evidence.slice(evBefore)
      .every((e) => e.kind === 'work' && e.by === 'grafter:0');
    // the house can't re-engage foreign work; 'work' near it pulls it back
    const wheelOwner = wheel.owner, socketOwner = socket.owner;
    const wheelLive = !wheel.dead && wheel.belted !== false;
    const socketLive = !socket.dead && socket.lensed !== false;
    const houseRearm = ctx.rearmHazard?.('fan', wheel.pos.x, wheel.pos.z) ?? 'x';
    const pulled = ctx.rearmHazard?.('work', wheel.pos.x, wheel.pos.z);
    const torn = ctx.rearmHazard?.('work', socket.pos.x, socket.pos.z);
    return {
      stage: 'done',
      wheelSite: wheelSite?.kind, socketSite: socketSite?.kind,
      wrongKind: wrongKind?.kind ?? null, wrongKind2: wrongKind2?.kind ?? null,
      graftedWheel, graftedSocket, graftSign,
      wheelOwner, socketOwner, wheelLive, socketLive,
      houseRearm, pulled, torn,
      beltDropped: ga.droppedBelts.length > 0,
    } as const;
  });

  if (result.stage !== 'done') { expect(result.stage).toBe('done'); return; }
  expect(result.wheelSite, 'a muscle-less housing is the belt substrate').toBe('wheel');
  expect(result.socketSite, 'a pried socket is the lens substrate').toBe('socket');
  expect(result.wrongKind, 'a belt cannot graft a socket').not.toBe('socket');
  expect(result.wrongKind2, 'a lens cannot graft a wheel').not.toBe('wheel');
  expect(result.graftedWheel, 'the wheel graft takes').toBe(true);
  expect(result.graftedSocket, 'the socket graft takes').toBe(true);
  expect(result.wheelOwner, 'the grafted wheel answers the under').toBe('under');
  expect(result.socketOwner, 'the grafted eye answers the under').toBe('under');
  expect(result.wheelLive, 'the grafted wheel spins again').toBe(true);
  expect(result.graftSign, 'the graft signs work under the grafter key').toBe(true);
  expect(result.houseRearm, 'the house cannot re-engage foreign work').toBe('x');
  expect(result.pulled, 'work near a grafted wheel is the pull').toBe('pull');
  expect(result.torn, 'work near a grafted socket is the tear').toBe('lensTear');
  expect(result.beltDropped, 'the pull drops the grafted muscle as goods').toBe(true);
  expect(errors).toEqual([]);
});

test('the floorkeeper sweeps the lid — work near your stash scatters the take', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const ga = g as unknown as {
      space: string;
      lidStashes: Map<string, { items: { id: string; count: number }[]; marked: string[] }>;
      droppedBelts: { x: number; z: number }[];
      droppedCoils: { x: number; z: number }[];
      sweptLids: number;
      entityCtx: () => {
        rearmHazard?: (k: string, x: number, z: number) => string | null;
      };
    };
    const ctx = ga.entityCtx();
    // pick a stashed lid: a hiding spot with goods on record. Force
    // the stash — the e2e fixture seeds the ledger the way a real
    // 'stashTake' deposit leaves it.
    const spot = g.route.rooms.flatMap((r) =>
      ((r as { hidingSpots?: { id: string; exitPos: { x: number; z: number } }[] })
        .hidingSpots ?? []).map((s) => ({ s })))[0];
    if (!spot) return { stage: 'no-spot' } as const;
    const { s } = spot;
    ga.lidStashes.set(`${ga.space}:${s.id}`, {
      items: [{ id: 'fanBelt', count: 2 }, { id: 'wireCoil', count: 1 }, { id: 'documents', count: 1 }],
      marked: ['fanBelt'],
    });
    const before = { belts: ga.droppedBelts.length, coils: ga.droppedCoils.length };
    // a 'work' mark at the lid's mouth — the signature the stash
    // itself leaves — gets the fourth dispatch
    const swept = ctx.rearmHazard?.('work', s.exitPos.x, s.exitPos.z);
    const stash = ga.lidStashes.get(`${ga.space}:${s.id}`);
    return {
      stage: 'swept' as const,
      swept,
      beltGain: ga.droppedBelts.length - before.belts,
      coilGain: ga.droppedCoils.length - before.coils,
      kept: stash?.items.map((i) => `${i.id}:${i.count}`) ?? ['deleted'],
      marked: stash?.marked ?? [],
      count: ga.sweptLids,
    };
  });

  if (result.stage === 'no-spot') test.skip();
  else {
    expect(result.swept, 'work near a stuffed lid is the sweep').toBe('lidSweep');
    expect(result.beltGain, 'the swept belts land as floor goods').toBe(2);
    expect(result.coilGain, 'the swept coil lands as floor goods').toBe(1);
    expect(result.kept, 'oddities keep the lid — documents do not pile').toEqual(['documents:1']);
    expect(result.marked, 'marks ride off with the scattered goods').toEqual([]);
    expect(result.count, 'the epitaph counts the tipped lid').toBe(1);
  }
  expect(errors).toEqual([]);
});

// sprint 700 — ordering: the scatter waits for hands that are free.
// A knee on the lid outranks the warden's broom; the 'work' sign
// stands and a later read still answers.
test('the knee outranks the broom — a held lid keeps its take', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const ga = g as unknown as {
      space: string;
      lidStashes: Map<string, { items: { id: string; count: number }[]; marked: string[] }>;
      droppedCoils: { x: number; z: number }[];
      entityCtx: () => {
        rearmHazard?: (k: string, x: number, z: number) => string | null;
      };
    };
    const ctx = ga.entityCtx();
    const spot = g.route.rooms.flatMap((r) =>
      ((r as { hidingSpots?: { id: string; exitPos: { x: number; z: number }; trappedBy?: string }[] })
        .hidingSpots ?? []).map((s) => ({ s })))[0];
    if (!spot) return { stage: 'no-spot' } as const;
    const { s } = spot;
    ga.lidStashes.set(`${ga.space}:${s.id}`, {
      items: [{ id: 'wireCoil', count: 1 }], marked: [],
    });
    // the knee sits: 'work' by the held lid names the hold — the
    // mark is spent but the take keeps its shelter.
    s.trappedBy = 'sweep';
    const held = ctx.rearmHazard?.('work', s.exitPos.x, s.exitPos.z);
    const keptWhileHeld = ga.lidStashes.get(`${ga.space}:${s.id}`)?.items.length ?? 0;
    // the knee lifts: the same mark now scatters the take.
    s.trappedBy = undefined;
    const coilsBefore = ga.droppedCoils.length;
    const freed = ctx.rearmHazard?.('work', s.exitPos.x, s.exitPos.z);
    return { stage: 'done' as const, held, keptWhileHeld,
      freed, coilGain: ga.droppedCoils.length - coilsBefore,
      stashGone: !ga.lidStashes.has(`${ga.space}:${s.id}`) };
  });

  if (result.stage === 'no-spot') test.skip();
  else {
    expect(result.held, 'a gripped lid names the hold').toBe('lidHeld');
    expect(result.keptWhileHeld, 'the knee keeps the take in the box').toBe(1);
    expect(result.freed, 'the freed lid answers the next read').toBe('lidSweep');
    expect(result.coilGain, 'the freed take scatters to the floor').toBe(1);
    expect(result.stashGone, 'the emptied lid is gone from the ledger').toBe(true);
  }
  expect(errors).toEqual([]);
});

// sprint 680 — the under strips your hands: 'work' marks arm the
// grafter's strip, and every armed surface answers its pocket. Driven
// through the same ctx hooks the grafter calls.
test('the under strips your hands — every armed surface answers its pocket', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const ga = g as unknown as {
      hazard: {
        snares: { pos: { x: number; z: number }; room: number; armed: boolean;
          planted?: boolean; claimed?: boolean }[];
        fans: { pos: { x: number; z: number }; room: number; dead: boolean;
          belted?: boolean; owner?: 'player' | 'under' }[];
        watchers: { pos: { x: number; z: number }; room: number; dead: boolean;
          lensed?: boolean; owner?: 'player' | 'under' }[];
        steams: { pos: { x: number; z: number }; room: number; dead: boolean;
          valved?: boolean; owner?: 'player' | 'under' }[];
      };
      setTraps: { key: string; x: number; z: number; room: number }[];
      liveTraps: { key: string; x: number; z: number }[];
      trapPos: Map<string, { x: number; z: number }>;
      snappedTraps: Set<string>;
      priedTraps: Set<string>;
      entityCtx: () => {
        stripWork?: (x: number, z: number)
          => 'coil' | 'plate' | 'belt' | 'lens' | 'throat' | null;
      };
    };
    const ctx = ga.entityCtx();
    // seed one of each armed surface, each tagged as YOUR work
    const snare: {
      pos: { x: number; z: number }; room: number; armed: boolean;
      planted?: boolean; claimed?: boolean;
    } = ga.hazard.snares.find((s) => g.route.rooms[s.room]) ?? {
      pos: { x: g.route.rooms[0].entryPos.x + 1, z: g.route.rooms[0].entryPos.z + 1 },
      room: 0, armed: false, planted: false,
    };
    snare.armed = true; snare.planted = true; delete snare.claimed;
    const trapKey = 'strip-e2e';
    const tp = { x: snare.pos.x + 40, z: snare.pos.z + 40 }; // far from every real hazard
    ga.setTraps.push({ key: trapKey, x: tp.x, z: tp.z, room: 0 });
    ga.liveTraps.push({ key: trapKey, x: tp.x, z: tp.z });
    ga.trapPos.set(trapKey, { x: tp.x, z: tp.z });
    const fan = ga.hazard.fans.find((f) => g.route.rooms[f.room]);
    if (fan) { fan.owner = 'player'; fan.belted = true; }
    const watcher = ga.hazard.watchers.find((w) => g.route.rooms[w.room]);
    if (watcher) { watcher.owner = 'player'; watcher.lensed = true; watcher.dead = false; }
    const steam = ga.hazard.steams.find((s) => g.route.rooms[s.room]);
    if (steam) { steam.owner = 'player'; steam.valved = true; steam.dead = false; }
    const snaresBefore = ga.hazard.snares.length;
    const stripAt = (x: number, z: number) => ctx.stripWork ? ctx.stripWork(x, z) : 'missing';
    return {
      coil: stripAt(snare.pos.x, snare.pos.z),
      snareGone: ga.hazard.snares.length < snaresBefore || !ga.hazard.snares.includes(snare),
      plate: stripAt(tp.x, tp.z),
      plateGone: !ga.setTraps.some((t) => t.key === trapKey)
        && !ga.liveTraps.some((t) => t.key === trapKey)
        && !ga.trapPos.has(trapKey),
      belt: fan ? stripAt(fan.pos.x, fan.pos.z) : 'no-fan',
      fanDead: fan ? fan.dead && fan.belted === false && fan.owner === undefined : null,
      lens: watcher ? stripAt(watcher.pos.x, watcher.pos.z) : 'no-eye',
      eyeDead: watcher ? watcher.dead && watcher.lensed === false && watcher.owner === undefined : null,
      throat: steam ? stripAt(steam.pos.x, steam.pos.z) : 'no-steam',
      throatDead: steam ? steam.dead && steam.valved === false && steam.owner === undefined : null,
      // jurisdiction: the under never strips the under's own graft
      underFan: (() => {
        const f2 = ga.hazard.fans.find((f) => g.route.rooms[f.room] && f !== fan);
        if (!f2) return 'no-second-fan';
        f2.owner = 'under'; f2.belted = true;
        return stripAt(f2.pos.x, f2.pos.z);
      })(),
      // and a dead plain mark nowhere near your work answers nothing
      nothing: stripAt(123456, 123456),
    };
  });

  expect(result.coil, 'your live wire comes up as its coil').toBe('coil');
  expect(result.snareGone, 'the wire leaves the floor').toBe(true);
  expect(result.plate, 'your cocked plate folds into stock').toBe('plate');
  expect(result.plateGone, 'the plate leaves every snap loop').toBe(true);
  expect(result.belt, 'your wheel\'s muscle walks off').toBe('belt');
  expect(result.fanDead, 'the housing ends dead, beltless, nobody\'s').toBe(true);
  expect(result.lens, 'your eye\'s glass walks off').toBe('lens');
  expect(result.eyeDead, 'the socket ends dead, glassless, nobody\'s').toBe(true);
  expect(result.throat, 'your throat\'s brass walks off').toBe('throat');
  expect(result.throatDead, 'the thread ends dead, valveless, nobody\'s').toBe(true);
  expect(result.underFan, 'the under never strips the under\'s own graft').not.toBe('belt');
  expect(result.nothing, 'a mark near nothing answers nothing').toBeNull();
  expect(errors).toEqual([]);
});

// sprint 709-714 — the house keeps a tally: every landed 'work' answer
// strikes the site, strike two files a register line and the filed
// floor stands as a standing order — and a gripped lid orders the
// sweep ('lidHeld'), its own peep reading the knee that holds it shut.
test('the house keeps a tally — struck sites file, a held lid answers, the peep reads the grip', async ({ page }) => {
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
      space: string;
      unpaidHeld: number;
      filedWork: number;
      workSites: { x: number; z: number; room: number; strikes: number; lastT: number }[];
      lidStashes: Map<string, { items: { id: string; count: number }[]; marked: string[] }>;
      hazard: {
        steams: { pos: { x: number; y: number; z: number }; room: number; dead: boolean;
          valved?: boolean; owner?: string }[];
        fans: { pos: { x: number; y: number; z: number }; room: number; dead: boolean;
          belted?: boolean; chocked?: boolean; owner?: string }[];
        evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string;
          t: number; readBy: string[]; by?: string }[];
      };
      entityCtx: () => {
        rearmHazard?: (k: string, x: number, z: number) => string | null;
        filedFloors?: (x: number, z: number, r: number)
          => { x: number; z: number; room: number; strikes: number }[];
      };
      interaction: { focused: { kind: string;
        pos: { x: number; y: number; z: number }; data: unknown; enabled: boolean } | null };
      tryInteract: () => void;
    };
    const ctx = ga.entityCtx();

    // a fake floor far from every real hazard: a player-threaded vent
    // and a player-belted wheel at the same spot — two armed surfaces,
    // two 'work' answers, one struck site.
    const spot = { x: g.route.rooms[0].entryPos.x + 30, z: g.route.rooms[0].entryPos.z + 30 };
    ga.hazard.steams.push({ pos: { x: spot.x, y: 0.5, z: spot.z }, room: 0,
      dead: false, valved: true, owner: 'player' });
    ga.hazard.fans.push({ pos: { x: spot.x, y: 0, z: spot.z }, room: 0,
      dead: false, belted: true, chocked: false, owner: 'player' });
    ga.hazard.evidence.push({ pos: { x: spot.x, y: 0, z: spot.z }, room: 0,
      kind: 'work', t: g.clock.time, readBy: ['player'], by: 'player' });
    const held0 = ga.unpaidHeld;
    const first = ctx.rearmHazard?.('work', spot.x, spot.z);   // the crimp — strike 1
    const second = ctx.rearmHazard?.('work', spot.x, spot.z);  // the pull — strike 2 files
    const sites = ga.workSites.map((s) => ({ strikes: s.strikes }));
    const filed = ctx.filedFloors?.(spot.x, spot.z, 14) ?? [];

    // the knee's ordering line: a gripped stash lid can't be tipped —
    // the sweep answers 'lidHeld' and the take keeps its shelter
    const lid = g.route.rooms.flatMap((r) =>
      ((r as { index: number; hidingSpots?: { id: string;
        exitPos: { x: number; z: number }; trappedBy?: string }[] })
        .hidingSpots ?? []).map((s) => ({ room: (r as { index: number }).index, s })))[0];
    if (!lid) return { stage: 'no-spot' } as const;
    const { s: spotLid } = lid;
    ga.lidStashes.set(`${ga.space}:${spotLid.id}`, {
      items: [{ id: 'fanBelt', count: 1 }], marked: [],
    });
    spotLid.trappedBy = 'sweep';
    const heldLid = ctx.rearmHazard?.('work', spotLid.exitPos.x, spotLid.exitPos.z);
    const kept = ga.lidStashes.get(`${ga.space}:${spotLid.id}`)?.items.length ?? -1;
    // a held lid files nothing — the knee's stand is the answer, not the tally's
    const sitesAfterHeld = ga.workSites.length;

    // and the lid's own look reads the grip — drive the peep case
    const capsBefore = caps.length;
    ga.interaction.focused = { kind: 'peepLid',
      pos: { x: spotLid.exitPos.x, y: 0.5, z: spotLid.exitPos.z },
      data: { spotId: spotLid.id }, enabled: true };
    ga.tryInteract();
    const peep = caps.slice(capsBefore).some((c) => /knee holds it shut/.test(c));
    ga.interaction.focused = null;

    const tally = caps.some((c) => /register keeps this floor/.test(c));
    return { stage: 'done', first, second, sites, filed: filed.length,
      heldGain: ga.unpaidHeld - held0, filedWork: ga.filedWork,
      heldLid, kept, sitesAfterHeld, peep, tally } as const;
  });

  if (result.stage === 'no-spot') test.skip();
  else {
    expect(result.first, 'a player vent answers the crimp').toBe('crimp');
    expect(result.second, 'a player wheel answers the pull').toBe('pull');
    expect(result.sites, 'one site, two strikes').toEqual([{ strikes: 2 }]);
    expect(result.heldGain, 'the second strike files a register line').toBe(1);
    expect(result.filedWork, 'the epitaph count ticks').toBe(1);
    expect(result.filed, 'the filed floor stands as a standing order').toBe(1);
    expect(result.tally, 'the tally warns out loud').toBe(true);
    expect(result.heldLid, 'a gripped lid answers the held line').toBe('lidHeld');
    expect(result.kept, 'the take keeps its shelter under the knee').toBe(1);
    expect(result.sitesAfterHeld, 'a held answer files no site of its own').toBe(1);
    expect(result.peep, 'the peep reads the grip').toBe(true);
  }
  expect(errors).toEqual([]);
});
