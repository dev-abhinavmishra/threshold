import { test, expect } from '@playwright/test';
import { seededRun } from './harness';

test.setTimeout(300_000);

// The authored setpieces: gate/engine/index/lens/valve/wake/draft — the
// named puzzle legs that drive the route's milestones.
interface GSock { kind: string; pos: { x: number; y: number; z: number }; meta: Record<string, unknown> }
interface GDoor { pos: { x: number; y: number; z: number }; locked: boolean; lockId?: string; openT: number }
interface GRoom {
  index: number; templateId?: string;
  origin: { x: number; z: number };
  yaw: number;
  entryPos: { x: number; y: number; z: number };
  sockets: GSock[]; doors: GDoor[];
  spec?: { props?: { kind: string; x: number; z: number; y?: number }[] };
}
interface GMilestone {
  clamps: Set<string>;
  phase?: string;
  relaysTaken?: number;
  routingStep?: number;
  routingSequence?: number[];
  boardShowing?: number;
  done?: boolean;
  cardsTaken?: number;
  catalogRead?: boolean;
  consoleStep?: number;
  consoleShowing?: number;
  targetGlyphs?: string[];
  orrery?: { solved: boolean; pylonProgress: number[] };
}
interface ThresholdG {
  renderFrame(): void;
  clock: { tick(): boolean; dt: number; time: number };
  godMode: boolean;
  frame(): void;
  currentRoom: number;
  space: string;
  imprints: number;
  marginalia: number;
  inventory: { id: string; count: number }[];
  milestones: { get(i: number): GMilestone | undefined };
  giveItem(id: string, n?: number): void;
  stats: { underscriptDeepest: number; underscriptCompleted: boolean; victory: boolean };
  steamMasks: { until: number }[];
  coffinOpened: boolean;
  documents: { id: string }[];
  input: { interactPressed: boolean };
  keys: Set<string>;
  interaction: { focused?: { prompt: string; holdTime?: number } | null };
  audio: { onCaption(fn: (c: { text: string; severity?: string }) => void): unknown };
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

test('underscript gate: seal clamps + resonance key descend, exit returns with palimpsest', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 'threshold');

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

test('engine: relays unlock the routing board, sequence frees the lift to victory', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 'threshold');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const standAt = (room: GRoom, p: { x: number; z: number }, r = 1.15) => {
      const dx = room.origin.x - p.x, dz = room.origin.z - p.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(p.x + (dx / L) * r, 0, p.z + (dz / L) * r);
    };
    const aimAt = (at: { x: number; y: number; z: number }) => {
      const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.6 - eyeY, Math.hypot(ax, az) || 1)));
    };
    const drive = (at: { x: number; y: number; z: number }, match: RegExp, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        aimAt(at);
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

    const room = g.route.rooms.find((r) => r.templateId === 'ms-engine');
    if (!room) return { stage: 'no-engine' } as const;
    const ms = g.milestones.get(room.index);
    if (!ms) return { stage: 'no-milestone' } as const;

    // Walk in — teleport inside the room AABB so the room-change hook
    // detects the entry and wakes the Engine (phase relays + Curator).
    // (Pre-setting currentRoom would make prev===current and skip enter().)
    g.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 90 && ms.phase !== 'relays'; f++) g.frame();
    if (ms.phase !== 'relays') return { stage: 'no-wake', phase: ms.phase } as const;

    // Pull five relays.
    const relays = room.sockets.filter((s) => s.meta?.relay === true);
    for (const s of relays.slice(0, 5)) {
      standAt(room, s.pos);
      drive(s.pos, /resonance relay|take/i, () => s.meta.taken === true, 60);
    }
    const phaseAfterRelays = ms.phase;

    // Wrong press: board showing anything but the next terminal resets.
    const board = room.sockets.find((s) => s.meta?.board === true);
    const isolator = room.sockets.find((s) => s.meta?.isolator === true);
    if (!board || !isolator) return { stage: 'no-board', phaseAfterRelays } as const;
    standAt(room, board.pos);
    let wrongPressed = false;
    for (let f = 0; f < 400 && !wrongPressed; f++) {
      aimAt(board.pos);
      if (ms.boardShowing !== ms.routingSequence![0]) {
        g.input.interactPressed = true;
        wrongPressed = true;
      }
      g.frame();
      g.input.interactPressed = false;
    }
    const rejected = caps.some((t) => /route rejected/.test(t));
    const resetHeld = ms.routingStep === 0;

    // Correct sequence: press only when the board shows the next terminal.
    for (let f = 0; f < 2400 && (ms.routingStep ?? 0) < 3; f++) {
      aimAt(board.pos);
      if (ms.boardShowing === ms.routingSequence![ms.routingStep ?? 0]) g.input.interactPressed = true;
      g.frame();
      g.input.interactPressed = false;
    }
    const phaseAfterBoard = ms.phase;

    // Pull the isolator — the lift fires the victory.
    standAt(room, isolator.pos);
    drive(isolator.pos, /isolator|pull/i, () => g.stats.victory === true, 40);
    return {
      stage: 'done', phaseAfterRelays, wrongPressed, rejected, resetHeld,
      phaseAfterBoard, victory: g.stats.victory === true,
      liftFree: caps.some((t) => /routing complete/.test(t)),
    };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.phaseAfterRelays).toBe('routing');
  expect(result.wrongPressed).toBe(true);
  expect(result.rejected).toBe(true);
  expect(result.resetHeld).toBe(true);
  expect(result.phaseAfterBoard).toBe('escape');
  expect(result.liftFree).toBe(true);
  expect(result.victory).toBe(true);
  expect(errors).toEqual([]);
});

test('under-draft: the sealed passage breathes when you stand near it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 'threshold');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const room = g.route.rooms.find((r) => r.templateId === 'ms-under-entrance');
    if (!room) return { stage: 'no-entrance' } as const;
    const sock = room.sockets.find((s) => s.meta?.underDoor === true);
    if (!sock) return { stage: 'no-sock' } as const;
    g.currentRoom = room.index;
    const dx = room.origin.x - sock.pos.x, dz = room.origin.z - sock.pos.z;
    const L = Math.hypot(dx, dz) || 1;
    g.player.teleport(sock.pos.x + (dx / L) * 1.5, 0, sock.pos.z + (dz / L) * 1.5);
    for (let f = 0; f < 60; f++) g.frame();
    return { stage: 'done', caps: caps.filter((t) => /seeps|draft|breathes/.test(t)) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  const caps = (result as { caps?: string[] }).caps ?? [];
  expect(caps.length).toBeGreaterThan(0);
  expect(caps[0]).toContain('cold draft seeps up');
  expect(errors).toEqual([]);
});

test('index: five cards → master catalogue → seal console glyph order frees you', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 'threshold');

  const result = await page.evaluate(() => {
    const GLYPHS = ['Archive', 'Suture', 'Lantern', 'Orrery', 'Seal', 'Choir', 'Ledger', 'Hollow', 'Meridian', 'Index', 'Gate'];
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const standAt = (room: GRoom, p: { x: number; z: number }, r = 1.15) => {
      const dx = room.origin.x - p.x, dz = room.origin.z - p.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(p.x + (dx / L) * r, 0, p.z + (dz / L) * r);
    };
    const aimAt = (at: { x: number; y: number; z: number }) => {
      const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.6 - eyeY, Math.hypot(ax, az) || 1)));
    };
    const drive = (at: { x: number; y: number; z: number }, match: RegExp, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        aimAt(at);
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

    const room = g.route.rooms.find((r) => r.templateId === 'ms-index');
    if (!room) return { stage: 'no-index' } as const;
    const ms = g.milestones.get(room.index);
    if (!ms) return { stage: 'no-milestone' } as const;
    const cards = room.sockets.filter((s) => s.kind === 'clue' && !s.meta.catalogue);
    const catalogue = room.sockets.find((s) => s.meta.catalogue);
    if (cards.length < 5 || !catalogue) return { stage: 'no-fixture' } as const;

    // Enter for real — the milestone's enter() only fires on a room change.
    g.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 60 && g.currentRoom !== room.index; f++) g.frame();

    // Catalogue before the cards: it wants a full hand.
    standAt(room, catalogue.pos);
    drive(catalogue.pos, /master catalogue|take/i, () => ms.catalogRead === true, 30);
    const earlyRefused = ms.catalogRead !== true;

    // Take five catalog cards.
    for (const s of cards.slice(0, 5)) {
      standAt(room, s.pos);
      drive(s.pos, /catalog card|take/i, () => s.meta.taken === true, 50);
    }
    const fiveCards = (ms.cardsTaken ?? 0) >= 5;

    // Read the catalogue — the glyph order is spoken aloud.
    standAt(room, catalogue.pos);
    drive(catalogue.pos, /master catalogue|take/i, () => ms.catalogRead === true, 30);
    const orderCap = caps.find((t) => /glyph order/.test(t));

    // The seal console is a real interactable at the console prop —
    // without it the whole chain dead-ended (sprint-222 fix).
    const prop = room.spec?.props?.find((p) => p.kind === 'sealConsole');
    if (!prop) return { stage: 'no-console-prop' } as const;
    const cs = Math.cos(room.yaw), sn = Math.sin(room.yaw);
    const consoleAt = {
      x: room.origin.x + prop.x * cs + prop.z * sn,
      y: 1.25,
      z: room.origin.z - prop.x * sn + prop.z * cs,
    };
    standAt(room, consoleAt);
    let consolePromptSeen = false;
    for (let f = 0; f < 20 && !consolePromptSeen; f++) {
      aimAt(consoleAt);
      g.frame();
      consolePromptSeen = /seal console/i.test(g.interaction.focused?.prompt ?? '');
    }

    // Correct press at step 0, then a deliberately wrong press at step 1 —
    // the sequence must reset.
    let firstAccepted = false;
    for (let f = 0; f < 1200 && !firstAccepted; f++) {
      aimAt(consoleAt);
      const focused = /seal console/i.test(g.interaction.focused?.prompt ?? '');
      if (focused && GLYPHS[ms.consoleShowing ?? 0] === ms.targetGlyphs![0]) {
        g.input.interactPressed = true; firstAccepted = true;
      }
      g.frame();
      g.input.interactPressed = false;
    }
    const stepAfterFirst = ms.consoleStep;
    let wrongPress = false;
    for (let f = 0; f < 1200 && !wrongPress && (ms.consoleStep ?? 0) >= 1; f++) {
      aimAt(consoleAt);
      const focused = /seal console/i.test(g.interaction.focused?.prompt ?? '');
      if (focused && GLYPHS[ms.consoleShowing ?? 0] !== ms.targetGlyphs![ms.consoleStep ?? 0]) {
        g.input.interactPressed = true; wrongPress = true;
      }
      g.frame();
      g.input.interactPressed = false;
    }
    const resetCap = caps.some((t) => /wrong glyph/.test(t));
    const resetHeld = ms.consoleStep === 0;

    // Submit the real order — three matched presses.
    for (let f = 0; f < 3600 && (ms.consoleStep ?? 0) < 3; f++) {
      aimAt(consoleAt);
      const focused = /seal console/i.test(g.interaction.focused?.prompt ?? '');
      if (focused && GLYPHS[ms.consoleShowing ?? 0] === ms.targetGlyphs![ms.consoleStep ?? 0]) {
        g.input.interactPressed = true;
      }
      g.frame();
      g.input.interactPressed = false;
    }
    return {
      stage: 'done', earlyRefused, fiveCards, cardsTaken: ms.cardsTaken,
      catalogRead: ms.catalogRead, orderCap, consolePromptSeen,
      stepAfterFirst, wrongPress, resetCap, resetHeld,
      done: ms.done === true, released: caps.some((t) => /Index releases you/.test(t)),
      target: ms.targetGlyphs,
    };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.earlyRefused).toBe(true);
  expect(result.fiveCards).toBe(true);
  expect(result.catalogRead).toBe(true);
  expect(result.orderCap).toBeTruthy();
  expect(result.stepAfterFirst).toBe(1);
  expect(result.wrongPress).toBe(true);
  expect(result.resetCap).toBe(true);
  expect(result.resetHeld).toBe(true);
  expect(result.done).toBe(true);
  expect(result.released).toBe(true);
  expect(errors).toEqual([]);
});

test('puzzle-valve: cracking the mechanism vents steam and yields its key', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
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

    // The lock filler hides doorKeys inside puzzle sockets — before the
    // 'puzzle' switch case existed that key was unreachable and its
    // main-route door could never unlock (seed 's': room 63 → lock-64;
    // 'threshold' lost its keyed valve room when the layout shifted,
    // sprint 223).
    const room = g.route.rooms.find((r) => r.templateId === 'puzzle-valve'
      && r.sockets.some((s) => s.meta.puzzle === 'valve' && s.meta.contains === 'doorKey'));
    if (!room) return { stage: 'no-fixture' } as const;
    const sock = room.sockets.find((s) => s.meta.puzzle === 'valve')!;
    const lockId = sock.meta.lockId as string;
    const lockRoom = g.route.rooms.find((r) => r.doors.some((d) => d.lockId === lockId));
    const door = lockRoom?.doors.find((d) => d.lockId === lockId);
    if (!lockRoom || !door) return { stage: 'no-lock' } as const;
    const wasLocked = door.locked === true;

    g.currentRoom = room.index;
    standAt(room, sock.pos);
    const masksBefore = g.steamMasks.length;
    const prompts = drive(sock.pos, /examine mechanism|take/i, () => sock.meta.taken === true, 60);
    const cracked = sock.meta.taken === true;
    const vented = g.steamMasks.length > masksBefore;
    const hissCap = caps.some((t) => /steam vents|cracks open/.test(t));
    const gotKey = (g.inventory.find((x) => x.id === 'doorKey')?.count ?? 0) >= 1;
    if (!gotKey) return { stage: 'no-key', cracked, vented, prompts } as const;

    // The released key opens its lock — the route is no longer a dead end.
    g.currentRoom = lockRoom.index;
    standAt(lockRoom, door.pos);
    drive(door.pos, /unlock|door|peek/i, () => !door.locked, 90);
    const opened = !door.locked;
    for (let f = 0; f < 60 && door.openT < 0.5; f++) g.frame();
    return { stage: 'done', wasLocked, cracked, vented, hissCap, gotKey, opened, openT: door.openT };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.wasLocked).toBe(true);
  expect(result.cracked).toBe(true);
  expect(result.vented).toBe(true);
  expect(result.hissCap).toBe(true);
  expect(result.gotKey).toBe(true);
  expect(result.opened).toBe(true);
  expect(result.openT).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

test('wake: lifting the coffin lid frees the bier document', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 'threshold');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const room = g.route.rooms.find((r) => r.templateId === 'ms-wake' || r.templateId === 'ms-wake-room');
    if (!room) return { stage: 'no-wake' } as const;
    const prop = room.spec?.props?.find((p) => p.kind === 'coffin');
    if (!prop) return { stage: 'no-coffin' } as const;

    // Walk in so the rebuild installs the bier interactable.
    g.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 60 && g.currentRoom !== room.index; f++) g.frame();

    // Stand beside the bier and lift the lid — a 1.8s hold.
    const cs = Math.cos(room.yaw), sn = Math.sin(room.yaw);
    const coffinAt = {
      x: room.origin.x + prop.x * cs + prop.z * sn,
      y: 1.15,
      z: room.origin.z - prop.x * sn + prop.z * cs,
    };
    const dx = room.origin.x - coffinAt.x, dz = room.origin.z - coffinAt.z;
    const L = Math.hypot(dx, dz) || 1;
    g.player.teleport(coffinAt.x + (dx / L) * 1.1, 0, coffinAt.z + (dz / L) * 1.1);
    let held = 0;
    let sawPrompt = false;
    for (let f = 0; f < 160 && !g.coffinOpened; f++) {
      const ax = coffinAt.x - g.player.pos.x, az = coffinAt.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(coffinAt.y - eyeY, Math.hypot(ax, az) || 1)));
      const prompt = g.interaction.focused?.prompt ?? '';
      if (/coffin lid/.test(prompt)) { sawPrompt = true; g.keys.add('KeyE'); held++; }
      else g.keys.delete('KeyE');
      g.frame();
    }
    g.keys.delete('KeyE');
    const warmCap = caps.some((t) => /pillow is still warm/.test(t));
    const doc = g.documents.some((d) => d.id === 'doc-guest-bier');
    return { stage: 'done', sawPrompt, held, opened: g.coffinOpened, warmCap, doc };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.sawPrompt).toBe(true);
  expect(result.opened).toBe(true);
  expect(result.warmCap).toBe(true);
  expect(result.doc).toBe(true);
  expect(errors).toEqual([]);
});

test('lens hall: tuning all four pylons solves the orrery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 'threshold');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true; // rotating beams deal real damage during the tuning
    const standAt = (room: GRoom, p: { x: number; z: number }, r = 1.15) => {
      const dx = room.origin.x - p.x, dz = room.origin.z - p.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(p.x + (dx / L) * r, 0, p.z + (dz / L) * r);
    };

    const room = g.route.rooms.find((r) => r.templateId === 'ms-lens-hall');
    if (!room) return { stage: 'no-lens' } as const;
    const ms = g.milestones.get(room.index);
    if (!ms) return { stage: 'no-milestone' } as const;
    const pylons = room.sockets.filter((s) => s.meta.pylon !== undefined);
    if (pylons.length !== 4) return { stage: 'no-pylons' } as const;

    // Enter for real — the orrery spawns on room change.
    g.player.teleport(room.origin.x, 0, room.origin.z);
    for (let f = 0; f < 60 && g.currentRoom !== room.index; f++) g.frame();
    const woke = caps.some((t) => /four pylons/.test(t));

    // Tune each pylon — hold E on it; the encounter's onHold feeds
    // chargePylon(dt) which tops out at ~2.5s per pylon.
    const progress: number[] = [];
    for (const s of pylons) {
      standAt(room, s.pos);
      let sawTune = false;
      for (let f = 0; f < 140; f++) {
        const ax = s.pos.x - g.player.pos.x, az = s.pos.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(s.pos.y + 0.6 - eyeY, Math.hypot(ax, az) || 1)));
        const prompt = g.interaction.focused?.prompt ?? '';
        if (/resonance pylon/.test(prompt)) { sawTune = true; g.keys.add('KeyE'); }
        else g.keys.delete('KeyE');
        g.frame();
      }
      g.keys.delete('KeyE');
      progress.push(...(ms.orrery?.pylonProgress ?? []));
      if (!sawTune) return { stage: 'no-tune', progress } as const;
    }
    return {
      stage: 'done', woke, final: ms.orrery?.pylonProgress,
      solved: ms.orrery?.solved === true, done: ms.done === true,
      releaseCap: caps.some((t) => /orrery|releases|opens/.test(t)),
    };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.woke).toBe(true);
  expect(result.final?.length).toBe(4);
  expect(result.final?.every((p) => p >= 1)).toBe(true);
  expect(result.solved).toBe(true);
  expect(result.done).toBe(true);
  expect(errors).toEqual([]);
});

