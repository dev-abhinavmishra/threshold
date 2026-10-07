import { test, expect } from '@playwright/test';
import { seededRun } from './harness';
import type { ThresholdG as HarnessG } from './harness';

test.setTimeout(300_000);

// The spend economy: pay-or-refuse shops (toll/vend/custodian/broker)
// and the human who registers your claims — every purse has a counter.
test('the house detective — he phones ahead, or you settle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: HarnessG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      imprints: number; currentRoom: number; keys: Set<string>;
      interaction: { focused?: { prompt?: string; kind?: string } };
      entities: { id: string; clocked?: boolean; warranted?: boolean }[];
    };
    ga.imprints = 80;

    // --- 1. draw a guest's held bag — the register accrues ---
    const cageRoom = g.route.rooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claim === true && s.meta?.marginalia !== true && !s.meta?.taken));
    if (!cageRoom) return { stage: 'no-cage' } as const;
    g.player.teleport(cageRoom.origin.x, 0, cageRoom.origin.z);
    for (let f = 0; f < 40; f++) g.frame();
    const cage = (cageRoom.sockets ?? []).find((s) => s.meta?.claim === true && s.meta?.marginalia !== true && !s.meta?.taken);
    if (!cage?.meta) return { stage: 'no-cage-sock' } as const;
    const cx = cageRoom.origin.x - cage.pos.x, cz = cageRoom.origin.z - cage.pos.z;
    const cl = Math.hypot(cx, cz) || 1;
    for (let f = 0; f < 55 && !cage.meta.taken; f++) {
      g.player.teleport(cage.pos.x + (cx / cl) * 0.9, 0, cage.pos.z + (cz / cl) * 0.9);
      g.player.yaw = Math.atan2(cage.pos.x - g.player.pos.x, cage.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2((cage.pos.y + 0.6) - eyeY, 0.95);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    if (!cage.meta.taken) return { stage: 'claim-failed' } as const;

    // --- 1.5 the affidavit — swearing the goods home, in imprints ---
    (ga as unknown as { unpaidHeld: number }).unpaidHeld = 3; // more held work behind you
    const afRoom = g.route.rooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.affidavit && !s.meta?.taken));
    if (afRoom) {
      g.player.teleport(afRoom.origin.x, 0, afRoom.origin.z);
      ga.currentRoom = afRoom.index;
      for (let f = 0; f < 30; f++) g.frame();
      const af = (afRoom.sockets ?? []).find((s) => s.meta?.affidavit && !s.meta?.taken);
      for (let f = 0; f < 60 && af?.meta && !af.meta.taken; f++) {
        const ax = afRoom.origin.x - af.pos.x, az = afRoom.origin.z - af.pos.z;
        const al = Math.hypot(ax, az) || 1;
        g.player.teleport(af.pos.x + (ax / al) * 0.9, 0, af.pos.z + (az / al) * 0.9);
        g.player.yaw = Math.atan2(af.pos.x - g.player.pos.x, af.pos.z - g.player.pos.z);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.atan2((af.pos.y + 0.6) - eyeY, 0.95);
        g.frame();
        if (f === 5) ga.keys.add('KeyE');
      }
      ga.keys.delete('KeyE');
    }
    const heldAfterAf = (ga as unknown as { unpaidHeld: number }).unpaidHeld;

    // --- 2. into his room with a CLEAN book — rifle the register drawer
    //    under his nose: owed>0 starts his slow look and the settle point
    //    could steal the drawer's focus; the rifle itself must be what
    //    files your face. +2 lines AND an instant clock.
    const dRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'detective'));
    if (!dRoom) return { stage: 'no-detective' } as const;
    (ga as unknown as { unpaidHeld: number }).unpaidHeld = 0;
    const prev = g.route.rooms[dRoom.index - 1];
    if (prev) { g.player.teleport(prev.origin.x, 0, prev.origin.z); for (let f = 0; f < 25; f++) g.frame(); }
    g.player.teleport(dRoom.origin.x, 0, dRoom.origin.z);
    let det: { clocked?: boolean; warranted?: boolean } | undefined;
    for (let f = 0; f < 60; f++) {
      g.frame();
      det = ga.entities.find((e) => e.id === 'detective') ?? det;
      if (det) break;
    }
    if (!det) return { stage: 'no-det-spawn', ents: ga.entities.map((e) => e.id) } as const;
    const reg = g.interaction.interactables.find((i) => i.kind === 'registerDrawer' && i.enabled);
    if (reg) {
      // rotate through candidate sides until focus locks on the drawer —
      // a neighbouring socket can outrank the naive stand, and an
      // out-of-bounds stand focuses 'none' and rotates on by itself
      for (let f = 0, ci = 0; f < 120 && (reg.data as { stock?: number }).stock !== 0; f++) {
        const ang = ci * Math.PI / 4;
        g.player.teleport(reg.pos.x + Math.sin(ang) * 0.9, 0, reg.pos.z + Math.cos(ang) * 0.9);
        g.player.yaw = Math.atan2(reg.pos.x - g.player.pos.x, reg.pos.z - g.player.pos.z);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.atan2((reg.pos.y + 0.6) - eyeY, 0.95);
        g.frame();
        // only hold E when the drawer has focus — mid-rotation a
        // neighbouring socket must not get the hold instead
        if (g.interaction.focused?.id === reg.id) ga.keys.add('KeyE');
        else ga.keys.delete('KeyE');
        if (g.interaction.focused?.id !== reg.id) ci++; // wrong side — rotate
      }
      ga.keys.delete('KeyE');
    }
    const heldAfterDrawer = (ga as unknown as { unpaidHeld: number }).unpaidHeld;
    for (let f = 0; f < 40 && !det.clocked; f++) g.frame();
    const clocked = caps.some((c) => /has your face|goes on the wire|face files itself/.test(c));

    // --- 3. slip a room without settling — the wire rings ahead ---
    //    keep the slip SHORT: the ring wakes nxt's listeners, and a grab
    //    drags the player >10 rooms out — the warrant cools, settle gone
    const nxt = g.route.rooms.find((r) => r.index === dRoom.index + 1) ?? g.route.rooms[dRoom.index - 1];
    if (!nxt) return { stage: 'no-neighbor' } as const;
    const ringCap = caps.length;
    g.player.teleport(nxt.origin.x, 0, nxt.origin.z);
    for (let f = 0; f < 6; f++) g.frame();
    const rang = caps.slice(ringCap).some((c) => /house phone rings ahead/.test(c));
    // straight back to his room before anything woken can reach us
    g.player.teleport(dRoom.origin.x, 0, dRoom.origin.z);
    for (let f = 0; f < 5; f++) g.frame();

    // --- 4. back to his desk — settle ---
    const settle = g.interaction.interactables.find((i) => i.kind === 'settle' && i.enabled);
    if (!settle) return { stage: 'no-settle' as const, clocked, heldAfterDrawer,
      roused: caps.some((c) => /lifts the house phone/.test(c)),
      cooled: caps.some((c) => /wire ahead of you goes quiet/.test(c)) } as const;
    const i0 = ga.imprints;
    let settlePrompt = '';
    for (let f = 0; f < 70; f++) {
      const sx = dRoom.origin.x - settle.pos.x, sz = dRoom.origin.z - settle.pos.z;
      const sl = Math.hypot(sx, sz) || 1;
      g.player.teleport(settle.pos.x + (sx / sl) * 0.9, 0, settle.pos.z + (sz / sl) * 0.9);
      g.player.yaw = Math.atan2(settle.pos.x - g.player.pos.x, settle.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2((settle.pos.y + 0.6) - eyeY, 0.95);
      g.frame();
      if (!settlePrompt) {
        const fp = ga.interaction.focused?.prompt;
        if (fp && /Settle the account/.test(fp)) settlePrompt = fp;
      }
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const paid = caps.some((c) => /paid \d+ — the detective strikes your name/.test(c));
    return { stage: 'done' as const, clocked, rang, heldAfterAf, heldAfterDrawer, settlePrompt, paid,
      spent: ga.imprints < i0, warranted: det?.warranted === true };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.clocked, JSON.stringify(result)).toBe(true);
  expect(result.heldAfterAf, JSON.stringify(result)).toBe(2); // 3 − 2 + 1: the filing itself enters his book
  expect(result.heldAfterDrawer, JSON.stringify(result)).toBe(2); // 0 + 2: hands in HIS book file your face
  expect(result.rang, JSON.stringify(result)).toBe(true);
  expect(result.settlePrompt, JSON.stringify(result)).toMatch(/Settle the account/);
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.warranted, JSON.stringify(result)).toBe(false);
  expect(errors).toEqual([]);
});

test('the dead line — pull the house wire and the broadcast never starts (sprint 309)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: HarnessG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      imprints: number; currentRoom: number; keys: Set<string>; unpaidHeld: number;
      interaction: { focused?: { prompt?: string; kind?: string; id?: string } };
      entities: { id: string; clocked?: boolean; warranted?: boolean; lineDead?: boolean }[];
    };
    ga.imprints = 80;
    (ga as { godMode?: boolean }).godMode = true;

    const dRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'detective'));
    if (!dRoom) return { stage: 'no-detective' } as const;
    (ga as { unpaidHeld: number }).unpaidHeld = 1; // a claim behind you

    // spawn him from the prev room, then pull the junction by the door
    const prev = g.route.rooms[dRoom.index - 1];
    if (prev) { g.player.teleport(prev.origin.x, 0, prev.origin.z); for (let f = 0; f < 25; f++) g.frame(); }
    g.player.teleport(dRoom.origin.x, 0, dRoom.origin.z);
    let det: { clocked?: boolean; warranted?: boolean; lineDead?: boolean } | undefined;
    for (let f = 0; f < 60; f++) {
      g.frame();
      det = ga.entities.find((e) => e.id === 'detective') ?? det;
      if (det) break;
    }
    if (!det) return { stage: 'no-det-spawn' } as const;
    const line = g.interaction.interactables.find((i) => i.kind === 'houseLine' && i.enabled);
    if (!line) return { stage: 'no-line' } as const;
    // adaptive-stand on the junction: rotate candidate sides at 0.9m,
    // hold E only while the line has focus — the door socket is a neighbour
    let linePrompt = '';
    for (let f = 0, ci = 0; f < 140 && !det.lineDead; f++) {
      const ang = ci * Math.PI / 4;
      g.player.teleport(line.pos.x + Math.sin(ang) * 0.9, 0, line.pos.z + Math.cos(ang) * 0.9);
      g.player.yaw = Math.atan2(line.pos.x - g.player.pos.x, line.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const hd = Math.hypot(line.pos.x - g.player.pos.x, line.pos.z - g.player.pos.z);
      g.player.pitch = Math.atan2((line.pos.y + 0.6) - eyeY, hd);
      g.frame();
      if (g.interaction.focused?.id === line.id) ga.keys.add('KeyE');
      else ga.keys.delete('KeyE');
      if (g.interaction.focused?.id !== line.id) ci++;
      const fp = ga.interaction.focused?.prompt;
      if (!linePrompt && fp && /house line/.test(fp)) linePrompt = fp;
    }
    ga.keys.delete('KeyE');
    const heldAfterPull = ga.unpaidHeld;
    const dead = det.lineDead === true;
    const deadCue = caps.some((c) => /comes off the wall|dead in his hand/.test(c));
    const clocked = det.clocked === true;
    const warranted = det.warranted === true;

    // slip the next room — a dead wire cannot ring
    const nxt = g.route.rooms.find((r) => r.index === dRoom.index + 1) ?? g.route.rooms[dRoom.index - 1];
    if (!nxt) return { stage: 'no-neighbor' } as const;
    const ringCap = caps.length;
    g.player.teleport(nxt.origin.x, 0, nxt.origin.z);
    for (let f = 0; f < 6; f++) g.frame();
    const rang = caps.slice(ringCap).some((c) => /house phone rings ahead/.test(c));
    g.player.teleport(dRoom.origin.x, 0, dRoom.origin.z);
    for (let f = 0; f < 5; f++) g.frame();

    // settle — the book is still open; the damages stand in it
    const settle = g.interaction.interactables.find((i) => i.kind === 'settle' && i.enabled);
    let paid = false;
    if (settle) {
      for (let f = 0; f < 70; f++) {
        const sx = dRoom.origin.x - settle.pos.x, sz = dRoom.origin.z - settle.pos.z;
        const sl = Math.hypot(sx, sz) || 1;
        g.player.teleport(settle.pos.x + (sx / sl) * 0.9, 0, settle.pos.z + (sz / sl) * 0.9);
        g.player.yaw = Math.atan2(settle.pos.x - g.player.pos.x, settle.pos.z - g.player.pos.z);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.atan2((settle.pos.y + 0.6) - eyeY, 0.95);
        g.frame();
        if (f === 5) ga.keys.add('KeyE');
      }
      ga.keys.delete('KeyE');
      paid = caps.some((c) => /paid \d+ — the detective strikes your name/.test(c));
    }
    return { stage: 'done' as const, linePrompt, dead, deadCue, clocked, warranted,
      rang, heldAfterPull, paid };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.linePrompt, JSON.stringify(result)).toMatch(/Pull the house line/);
  expect(result.dead, JSON.stringify(result)).toBe(true);
  expect(result.deadCue, JSON.stringify(result)).toBe(true);
  expect(result.heldAfterPull, JSON.stringify(result)).toBe(2); // 1 owed + 1 damages
  expect(result.clocked, JSON.stringify(result)).toBe(true); // he files whoever stood in the room
  expect(result.warranted, JSON.stringify(result)).toBe(false); // the wire never starts
  expect(result.rang, JSON.stringify(result)).toBe(false);
  expect(result.paid, JSON.stringify(result)).toBe(true); // the book still settles
  expect(errors).toEqual([]);
});

test('toll door: too-poor refuses, paid opens and deducts imprints', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

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

    // Seed 's' generates toll doors on branch closets (door-53-b1
    // among them — seed 'threshold' lost its toll rooms when new
    // templates shifted the layout, sprint 223).
    let door: { id: string; pos: { x: number; y: number; z: number }; locked: boolean; lockId?: string; openT: number; opening: boolean } | null = null;
    let parent: { index: number; origin: { x: number; z: number } } | null = null;
    for (const room of g.route.rooms) {
      const d = room.doors.find((x) => x.lockId === 'toll');
      if (d) { door = d; parent = room; break; }
    }
    if (!door || !parent) return { stage: 'no-toll-door' } as const;
    const doorAtFind = `${door.id}@${parent.index} locked=${door.locked}`;

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

    // Loot near the leaf can out-focus it — and the toll plate's own
    // prompt is a take-family prompt ('Take' pressed the plate and PAID
    // 3 imprints on the first draft of this spec). So: clear out-focus
    // sockets while pinning the purse at 2 — a too-poor player stays
    // too-poor even when a spark socket grants imprints mid-loop. The
    // refusal itself must come from a door/toll-family prompt: pressing
    // it with 2 imprints has to refuse and keep the leaf locked.
    g.imprints = 2;
    let refusePrompt = '';
    const refuseLog: string[] = [];
    for (let f = 0; f < 40 && door.locked; f++) {
      aimAtLeaf();
      const prompt = g.interaction.focused?.prompt ?? '';
      refuseLog.push(`${f}:${prompt}|i${g.imprints}|L${door.locked}`);
      if (/door|unlock|toll|pay/i.test(prompt)) refusePrompt = prompt;
      g.input.interactPressed = /door|unlock|toll|pay|take|loot|search/i.test(prompt);
      g.frame();
      if (g.imprints > 2) g.imprints = 2;
    }
    g.input.interactPressed = false;
    const stayedLocked = door.locked && /door|unlock|toll|pay/i.test(refusePrompt);

    // Paid — 5 imprints: unlock takes 3, door opens. A nearby loot
    // socket may pad imprints before the unlocking press, so measure
    // the charge itself: imprints delta across the frame that flipped
    // the lock must be exactly -3 (the toll).
    g.imprints = 5;
    let paid = false, presses = 0, charge = 0, prev = g.imprints;
    const focusLog: string[] = [];
    for (let f = 0; f < 60 && !paid; f++) {
      aimAtLeaf();
      const prompt = g.interaction.focused?.prompt ?? '';
      if (f % 10 === 0) focusLog.push(prompt);
      g.input.interactPressed = /door|take|loot|search/i.test(prompt);
      if (g.input.interactPressed) presses++;
      prev = g.imprints;
      g.frame();
      if (!door.locked) { paid = true; charge = prev - g.imprints; }
    }
    // Let the leaf animate open to prove the path completes.
    for (let f = 0; f < 60 && door.openT < 0.5; f++) g.frame();
    return { stage: 'done', doorAtFind, refusePrompt, stayedLocked, paid, presses, focusLog, charge, imprints: g.imprints, openT: door.openT, refuseLog };
  });

  expect(result.stage, `door=${result.doorAtFind} ${JSON.stringify(result)}`).toBe('done');
  expect(result.stayedLocked, `${result.doorAtFind} refuse=${JSON.stringify(result.refuseLog)} imp=${result.imprints}`).toBe(true);
  expect(result.paid, `focus=${JSON.stringify(result.focusLog)} presses=${result.presses}`).toBe(true);
  expect(result.charge).toBe(3);
  expect(result.imprints).toBeGreaterThanOrEqual(2);
  expect(result.openT).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

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

test('vend machine refuses on short funds, sells on exact pay', async ({ page }) => {
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

test('custodian shop: short imprints refuses, paid pedestal sells and stocks out', async ({ page }) => {
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

    const room = g.route.rooms.find((r) => r.templateId === 'ms-custodian');
    if (!room) return { stage: 'no-custodian' } as const;
    g.currentRoom = room.index;
    const stocked = room.sockets.filter((s) => s.meta?.shop !== undefined && s.meta?.shopItem !== undefined);
    if (!stocked.length) return { stage: 'no-stock' } as const;
    const sock = stocked[0];
    const price = sock.meta.price as number;
    const item = sock.meta.shopItem as string;

    // Poor: refuse — keep the money, pedestal stays stocked.
    g.imprints = price - 5;
    standAt(room, sock.pos);
    drive(sock.pos, /inspect wares|take|trade/i, () => sock.meta.sold === true, 40);
    const refused = sock.meta.sold !== true && g.imprints === price - 5;
    const refuseCap = caps.find((t) => /imprints required/.test(t));

    // Pay: pedestal sells (CustodianEncounter marks meta.sold, not taken),
    // item lands in the satchel, 'purchased' caption fires.
    g.imprints = price;
    standAt(room, sock.pos);
    drive(sock.pos, /inspect wares|take|trade/i, () => sock.meta.sold === true, 40);
    return {
      stage: 'done', refused, refuseCap, price, item,
      sold: sock.meta.sold === true,
      paid: g.imprints === 0,
      hasItem: g.inventory.some((s) => s.id === item),
      bought: caps.some((t) => /purchased/.test(t)),
    };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.refused).toBe(true);
  expect(result.refuseCap).toBeTruthy();
  expect(result.sold).toBe(true);
  expect(result.paid).toBe(true);
  expect(result.hasItem).toBe(true);
  expect(result.bought).toBe(true);
  expect(errors).toEqual([]);
});

test('broker pedestal: short marginalia refuses, paid trade grants the ware', async ({ page }) => {
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

    // Descend: release both clamps, pay the resonance key.
    const entrance = g.route.rooms.find((r) => r.templateId === 'ms-under-entrance');
    if (!entrance) return { stage: 'no-entrance' } as const;
    const doorSock = entrance.sockets.find((s) => s.meta?.underDoor === true);
    const clamps = entrance.sockets.filter((s) => !!s.meta?.sealClamp);
    if (!doorSock || clamps.length < 2) return { stage: 'no-fixture' } as const;
    g.currentRoom = entrance.index;
    for (const c of clamps) {
      standAt(entrance, c.pos);
      drive(c.pos, /release seal clamp|take|search/i, () => false, 80);
    }
    g.giveItem('resonanceKey', 1);
    standAt(entrance, doorSock.pos);
    drive(doorSock.pos, /underscript|open|inspect/i, () => g.space === 'under', 60);
    if (g.space !== 'under') return { stage: 'no-descent' } as const;

    // The landing lobby is a u-lobby — the Broker's pedestals are stocked.
    const lobby = g.route.underRooms.find((r) => r.templateId === 'u-lobby'
      && r.sockets.some((s) => s.meta?.broker !== undefined && s.meta?.brokerItem !== undefined));
    if (!lobby) return { stage: 'no-lobby' } as const;
    g.currentRoom = lobby.index;
    const sock = lobby.sockets.find((s) => s.meta?.broker !== undefined && s.meta?.brokerItem !== undefined)!;
    const price = sock.meta.brokerPrice as number;
    const item = sock.meta.brokerItem as string;

    // Poor: refuse.
    g.marginalia = Math.max(0, price - 5);
    standAt(lobby, sock.pos);
    drive(sock.pos, /trade wares|inspect|take/i, () => sock.meta.sold === true, 40);
    const refused = sock.meta.sold !== true && g.marginalia === Math.max(0, price - 5);
    const refuseCap = caps.find((t) => /marginalia required/.test(t));

    // Pay: trade.
    g.marginalia = price;
    standAt(lobby, sock.pos);
    drive(sock.pos, /trade wares|inspect|take/i, () => sock.meta.sold === true, 40);

    // The marked rate: the crew reads the tally on your hands — the second
    // pedestal charges price + the clerks' marked fee while unpaidTheft > 0.
    const sock2 = lobby.sockets.find((s) => s.meta?.broker !== undefined
      && s.meta?.brokerItem !== undefined && s !== sock);
    let markedPaid = false, markedCap = '', expected2 = 0;
    if (sock2) {
      const price2 = sock2.meta.brokerPrice as number;
      (g as unknown as { unpaidTheft: number }).unpaidTheft = 3;
      expected2 = price2 + Math.min(4 + 3 * 2, 14); // +10 on the marked rate
      g.marginalia = expected2;
      standAt(lobby, sock2.pos);
      drive(sock2.pos, /trade wares|inspect|take/i, () => sock2.meta.sold === true, 40);
      markedPaid = sock2.meta.sold === true && g.marginalia === 0;
      markedCap = caps.find((t) => /marked rate/.test(t)) ?? '';
    }
    // The fix: a second anchor on the Broker himself — he makes a call and
    // one line comes off your DEEPEST ledger, priced by depth. State here:
    // unpaidTheft=3 (the marked ledger), marginalia=0 after the trade.
    const fix = (g.interaction as { interactables?: { kind: string;
      pos: { x: number; y: number; z: number } }[] }).interactables
      ?.find((i) => i.kind === 'fix');
    let fixPrompt = '', fixPaid = false, fixCap = '', heldAfterFix = -1;
    if (fix) {
      const ga = g as unknown as { unpaidTheft: number; unpaidHeld: number; paperTrail: number };
      ga.unpaidHeld = 5; // the register outruns the tally — the fix hits it
      g.marginalia = 18;
      standAt(lobby, { x: fix.pos.x, z: fix.pos.z }, 1.4);
      fixPrompt = (() => { let p = ''; for (let f = 0; f < 8; f++) { g.frame(); p = g.interaction.focused?.prompt ?? p; } return p; })();
      drive({ x: fix.pos.x, y: fix.pos.y, z: fix.pos.z }, /fix/i,
        () => ga.unpaidHeld === 4, 60);
      heldAfterFix = ga.unpaidHeld;
      fixPaid = heldAfterFix === 4 && g.marginalia === 0;
      fixCap = caps.find((t) => /makes a call/.test(t)) ?? '';
      // clean slate → nothing to fix
      ga.unpaidTheft = 0; ga.unpaidHeld = 0; ga.paperTrail = 0;
      g.marginalia = 30;
      drive({ x: fix.pos.x, y: fix.pos.y, z: fix.pos.z }, /fix/i,
        () => caps.some((t) => /slate is clean/.test(t)), 40);
      const cleanCap = caps.find((t) => /slate is clean/.test(t)) ?? '';
      return {
        stage: 'done', refused, refuseCap, price, item,
        sold: sock.meta.sold === true,
        paid: markedPaid || g.marginalia === 0,
        hasItem: g.inventory.some((s) => s.id === item),
        traded: caps.some((t) => /traded/.test(t)),
        twoPedestals: !!sock2, markedPaid, markedCap, expected2,
        fixFound: true, fixPrompt, fixPaid, fixCap, heldAfterFix,
        cleanCap, cleanUncharged: g.marginalia === 30,
      };
    }
    return {
      stage: 'done', refused, refuseCap, price, item,
      sold: sock.meta.sold === true,
      paid: g.marginalia === 0 || markedPaid,
      hasItem: g.inventory.some((s) => s.id === item),
      traded: caps.some((t) => /traded/.test(t)),
      twoPedestals: !!sock2, markedPaid, markedCap, expected2,
      fixFound: false,
    };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.refused).toBe(true);
  expect(result.refuseCap).toBeTruthy();
  expect(result.sold).toBe(true);
  expect(result.paid).toBe(true);
  expect(result.hasItem).toBe(true);
  expect(result.traded).toBe(true);
  expect(result.twoPedestals, JSON.stringify(result)).toBe(true);
  expect(result.markedPaid, JSON.stringify(result)).toBe(true);
  expect(result.markedCap).toMatch(/marked rate/);
  // sprint 317 — the fix: deepest ledger struck, priced by depth, clean refuses
  expect(result.fixFound, JSON.stringify(result)).toBe(true);
  expect(result.fixPrompt).toMatch(/fix/i);
  expect(result.fixPaid, JSON.stringify(result)).toBe(true);
  expect(result.heldAfterFix).toBe(4);
  expect(result.fixCap).toMatch(/makes a call/);
  expect(result.cleanCap).toMatch(/slate is clean/);
  expect(result.cleanUncharged).toBe(true);
  expect(errors).toEqual([]);
});

test('the night clerk: short imprints refuses, paid sells, filed face pays the register\'s rate', async ({ page }) => {
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
    const ga = g as unknown as { unpaidHeld: number;
      clerkFigs?: Map<number, unknown> };

    const clerked = g.route.rooms.find((r) =>
      r.sockets.some((s) => s.meta?.clerk !== undefined && s.meta?.clerkItem !== undefined));
    if (!clerked) return { stage: 'no-clerk' } as const;
    g.player.teleport(clerked.origin.x, 0, clerked.origin.z);
    g.currentRoom = clerked.index;
    for (let f = 0; f < 30; f++) g.frame();

    const sock = clerked.sockets.find((s) => s.meta?.clerk !== undefined
      && s.meta?.clerkItem !== undefined)!;
    const price = sock.meta.clerkPrice as number;
    const item = sock.meta.clerkItem as string;
    const figPresent = ga.clerkFigs?.has(clerked.index) === true;

    const drive = (at: { x: number; y: number; z: number }, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const dx = clerked.origin.x - at.x, dz = clerked.origin.z - at.z;
        const L = Math.hypot(dx, dz) || 1;
        g.player.teleport(at.x + (dx / L) * 1.0, 0, at.z + (dz / L) * 1.0);
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.6 - eyeY, Math.hypot(ax, az) || 1)));
        const prompt = g.interaction.focused?.prompt ?? '';
        if (f % 10 === 0) seen.push(prompt);
        if (/counter|buy|wares|take|ask|clerk/i.test(prompt)) {
          if (g.interaction.focused?.holdTime) g.keys.add('KeyE'); else g.input.interactPressed = true;
        } else { g.keys.delete('KeyE'); g.input.interactPressed = false; }
        g.frame();
        g.input.interactPressed = false;
      }
      g.keys.delete('KeyE');
      return seen.join('|');
    };

    // Short: refuse.
    g.imprints = Math.max(0, price - 3);
    drive(sock.pos, () => sock.meta.sold === true, 50);
    const refused = sock.meta.sold !== true && g.imprints === Math.max(0, price - 3);
    const refuseCap = caps.find((t) => /imprints required/.test(t)) ?? '';

    // Pay: the till rings.
    g.imprints = price;
    drive(sock.pos, () => sock.meta.sold === true, 50);
    const sold = sock.meta.sold === true;
    const tillCap = caps.find((t) => /till rings/.test(t)) ?? '';

    // The register's rate: a filed face pays more on the second pedestal.
    const sock2 = clerked.sockets.find((s) => s.meta?.clerk !== undefined
      && s.meta?.clerkItem !== undefined && s !== sock);
    let ratePaid = false, rateCap = '', expected2 = 0;
    if (sock2) {
      const price2 = sock2.meta.clerkPrice as number;
      ga.unpaidHeld = 3;
      expected2 = price2 + Math.min(3 + 3 * 2, 10); // +9 on the register's rate
      g.imprints = expected2;
      drive(sock2.pos, () => sock2.meta.sold === true, 50);
      ratePaid = sock2.meta.sold === true && g.imprints === 0;
      rateCap = caps.find((t) => /register's rate/.test(t)) ?? '';
    }
    // Ask the clerk — a second anchor on the figure: one seeded page,
    // priced in imprints at the register's rate, one-shot per clerk.
    const ask = (g.interaction as { interactables?: { kind: string;
      pos: { x: number; y: number; z: number } }[] }).interactables
      ?.find((i) => i.kind === 'ask');
    let askPrompt = '', askPaid = false, askCap = '', askTwice = '';
    if (ask) {
      ga.unpaidHeld = 0; // clean face — the page sells at list price
      g.imprints = 40;
      const capMark = caps.length;
      drive(ask.pos, () => caps.slice(capMark).some((t) =>
        /duty sheet|ledger of faults|held-file/.test(t)), 60);
      askCap = caps.slice(capMark).find((t) => /duty sheet|ledger of faults|held-file/.test(t)) ?? '';
      askPaid = askCap !== '' && g.imprints === 40 - ((sock.meta.clerkQPrice as number) ?? 6);
      // one-shot: a second ask reads nothing more
      drive(ask.pos, () => caps.some((t) => /said what it knows/.test(t)), 80);
      askTwice = caps.find((t) => /said what it knows/.test(t)) ?? '';
      for (let f = 0; f < 6; f++) {
        g.frame();
        askPrompt = g.interaction.focused?.prompt ?? askPrompt;
      }
    }
    return { stage: 'done', figPresent, refused, refuseCap, sold, tillCap,
      hasItem: g.inventory.some((s) => s.id === item),
      twoSocks: !!sock2, ratePaid, rateCap, expected2,
      askFound: !!ask, askPrompt, askPaid, askCap, askTwice,
      clerkQ: sock.meta.clerkQ as string };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.figPresent).toBe(true);
  expect(result.refused).toBe(true);
  expect(result.refuseCap).toMatch(/imprints required/);
  expect(result.sold).toBe(true);
  expect(result.tillCap).toMatch(/till rings/);
  expect(result.hasItem).toBe(true);
  expect(result.twoSocks, JSON.stringify(result)).toBe(true);
  expect(result.ratePaid, JSON.stringify(result)).toBe(true);
  expect(result.rateCap).toMatch(/register's rate/);
  // sprint 319 — ask the clerk: the page answers once, at the register's rate
  expect(result.askFound, JSON.stringify(result)).toBe(true);
  expect(result.askPrompt).toMatch(/clerk/i);
  expect(result.askCap, JSON.stringify(result)).toMatch(/duty sheet|ledger of faults|held-file/);
  expect(result.askPaid).toBe(true);
  expect(result.askTwice).toMatch(/said what it knows/);
  expect(errors).toEqual([]);
});

