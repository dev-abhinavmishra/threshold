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
    const room = g.route.underRooms.find((r) => r.flooded && r.spec?.props?.some((p) => DRAIN.has(p.kind)));
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
