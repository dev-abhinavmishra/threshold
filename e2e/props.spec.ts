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
