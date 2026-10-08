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
    // sprint 341 — marked wares on your person feed the same slow look on
    // a clean ledger: the register wrote that manifest, so the sighting
    // files itself as a line.
    const gaHot = ga as unknown as { hotItems: Set<string>; giveItem(id: string, n: number): void };
    gaHot.hotItems.add('tonic');
    gaHot.giveItem('tonic', 1);
    g.player.teleport(dRoom.origin.x, 0, dRoom.origin.z);
    let det: { clocked?: boolean; warranted?: boolean } | undefined;
    for (let f = 0; f < 60; f++) {
      g.frame();
      det = ga.entities.find((e) => e.id === 'detective') ?? det;
      if (det) break;
    }
    if (!det) return { stage: 'no-det-spawn', ents: ga.entities.map((e) => e.id) } as const;
    const stockCap = caps.length;
    for (let f = 0; f < 120 && !det.clocked; f++) g.frame();
    const stockCapHit = caps.slice(stockCap).some((c) => /knows marked stock/.test(c));
    const heldAfterStock = (ga as unknown as { unpaidHeld: number }).unpaidHeld;
    const reg = g.interaction.interactables.find((i) => i.kind === 'registerDrawer' && i.enabled);
    let drawerSign = false;
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
      // sprint 338 — hands in a staffed book leave 'work' sign too:
      // the warden pulls to register-drawer sign like a till rifle's.
      // The mark's room is whatever the game resolves at the stand
      // (ga.currentRoom), not the scheduled room's index.
      drawerSign = (ga as unknown as { hazard: { evidence: { kind: string; room: number; pos: { x: number; z: number } }[] } })
        .hazard.evidence.some((e) => e.kind === 'work' && e.room === ga.currentRoom
          && Math.hypot(e.pos.x - reg.pos.x, e.pos.z - reg.pos.z) < 1.2);
    }
    const heldAfterDrawer = (ga as unknown as { unpaidHeld: number }).unpaidHeld;
    for (let f = 0; f < 40 && !det.clocked; f++) g.frame();
    const clocked = caps.some((c) => /has your face|goes on the wire|face files itself|knows marked stock/.test(c));

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
    return { stage: 'done' as const, clocked, rang, heldAfterAf, heldAfterStock, stockCapHit, heldAfterDrawer, drawerSign, settlePrompt, paid,
      spent: ga.imprints < i0, warranted: det?.warranted === true };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.clocked, JSON.stringify(result)).toBe(true);
  expect(result.heldAfterAf, JSON.stringify(result)).toBe(2); // 3 − 2 + 1: the filing itself enters his book
  expect(result.stockCapHit, JSON.stringify(result)).toBe(true); // he knows marked stock
  expect(result.heldAfterStock, JSON.stringify(result)).toBe(1); // the sighting files a line
  expect(result.heldAfterDrawer, JSON.stringify(result)).toBe(3); // 1 + 2: sighting, then hands in HIS book
  expect(result.drawerSign, JSON.stringify(result)).toBe(true); // hands in a staffed book leave 'work' sign
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
    // sprint 329 — the whole spend is marked coin: it rings where it lands.
    const gh = g as unknown as { hotImprints: number };
    gh.hotImprints = price;
    const snd = (g as unknown as { sound: { emit: (e: never) => void } }).sound;
    const origEmit = snd.emit.bind(snd);
    const rings: { cap?: string; x?: number; z?: number }[] = [];
    snd.emit = (e: { category?: string; caption?: string; x?: number; z?: number }) => {
      if (e.category === 'distraction') rings.push({ cap: e.caption, x: e.x, z: e.z });
      return origEmit(e as never);
    };
    g.imprints = price;
    standAt(room, sock.pos);
    drive(sock.pos, /feed the machine/i, () => sock.meta.taken === true, 70);
    snd.emit = origEmit;
    const markedRang = rings.some((r) => /marked coin/.test(r.cap ?? ''));
    const markedAt = rings.length
      ? Math.hypot((rings[0].x ?? 0) - sock.pos.x, (rings[0].z ?? 0) - sock.pos.z) : -1;
    const hotAfter = gh.hotImprints;
    const inv = g.inventory.find((s) => s.id === item);
    const sold = sock.meta.taken === true && g.imprints === 0 && !!inv;
    return { stage: 'done', price, item, promptsA, refused, sold, imprints: g.imprints,
      inv: g.inventory.map((s) => s.id), markedRang, markedAt, hotAfter };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.refused, result.promptsA).toBe(true);
  expect(result.sold, JSON.stringify(result.inv)).toBe(true);
  // sprint 329 — the marked coin testifies: one ring at the till, then spent
  expect(result.markedRang, JSON.stringify(result)).toBe(true);
  expect(result.markedAt).toBeLessThan(0.8);
  expect(result.hotAfter).toBe(0);
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
      const cleanUncharged = g.marginalia === 30; // read before the purse phase
      // The purse — the Broker changes coin: clean books get 6→8,
      // a dirty ledger sours the rate to 6→6, short refuses.
      const purse = (g.interaction as { interactables?: { kind: string;
        pos: { x: number; y: number; z: number } }[] }).interactables
        ?.find((i) => i.kind === 'purse');
      let pursePaid = false, purseSour = false, purseShortCap = '',
        purseCleanCap = '', purseSourCap = '', margAfterPurse = -1, purseSeen = '',
        purseWashCap = '', purseWashed = false, fenceCap = '', fencePaid = false,
        cpLedger = false, bookCap = '', bookRead = false,
        bookFound = false, bookSeen = '';
      if (purse) {
        g.imprints = 20; // marginalia still 30 — the clean fix never charged
        standAt(lobby, { x: purse.pos.x, z: purse.pos.z }, 0.7);
        purseSeen = drive(purse.pos, /purse|change/i, () => g.marginalia === 38, 50);
        pursePaid = g.marginalia === 38 && g.imprints === 14;
        purseCleanCap = caps.find((t) => /purse changes/.test(t)) ?? '';
        (g as unknown as { unpaidTheft: number }).unpaidTheft = 2;
        drive(purse.pos, /purse|change/i, () => g.marginalia === 44, 50);
        purseSour = g.marginalia === 44 && g.imprints === 8;
        purseSourCap = caps.find((t) => /rate sours/.test(t)) ?? '';
        (g as unknown as { unpaidTheft: number }).unpaidTheft = 0;
        g.imprints = 3;
        drive(purse.pos, /purse|change/i,
          () => caps.some((t) => /purse wants/.test(t)), 40);
        purseShortCap = caps.find((t) => /purse wants/.test(t)) ?? '';
        margAfterPurse = g.marginalia;
        // sprint 329/330 — the wash: feed the purse the till's marked
        // coin; the under takes it without asking (hot dies silent) but
        // its own book opens a line — the wash files a question.
        const gh = g as unknown as { hotImprints: number; paperTrail: number;
          hotItems: Set<string> };
        gh.hotImprints = 6;
        const trailBeforeWash = gh.paperTrail;
        g.imprints = Math.max(g.imprints, 6);
        drive(purse.pos, /purse|change/i,
          () => caps.some((t) => /weighs the marked coin/.test(t)), 50);
        purseWashCap = caps.find((t) => /weighs the marked coin/.test(t)) ?? '';
        purseWashed = purseWashCap !== '' && gh.hotImprints === 0
          && gh.paperTrail === trailBeforeWash + 1;
        // sprint 331 — the fence: the Broker takes marked stock off
        // your hands at an insult rate, the under's book opens a line.
        const fence = (g.interaction as { interactables?: { kind: string;
          pos: { x: number; y: number; z: number } }[] }).interactables
          ?.find((i) => i.kind === 'fence');
        if (fence) {
          gh.hotItems.add('bandage');
          g.giveItem('bandage', 2);
          const trail2 = gh.paperTrail;
          const mFence = g.marginalia;
          standAt(lobby, { x: fence.pos.x, z: fence.pos.z }, 0.7);
          drive(fence.pos, /fence|take/i, () => g.marginalia === mFence + 8, 50);
          fenceCap = caps.find((t) => /takes the marked stock/.test(t)) ?? '';
          fencePaid = g.marginalia === mFence + 8 && gh.hotItems.size === 0
            && gh.paperTrail === trail2 + 1
            && !g.inventory.some((s) => s.id === 'bandage');
          // sprint 332 — the ledgers outlive you: a checkpoint written
          // now carries the books and the marks, not just the purse
          const cpS = (g as { makeCheckpoint?: (n: number) => unknown })
            .makeCheckpoint?.(0) as { paperTrail?: number; hotItems?: unknown[];
            unpaidTheft?: number; hotImprints?: number } | undefined;
          cpLedger = !!cpS && cpS.paperTrail === gh.paperTrail
            && cpS.unpaidTheft === 0 && cpS.hotImprints === gh.hotImprints
            && Array.isArray(cpS.hotItems) && cpS.hotItems.length === gh.hotItems.size;
        }
        // sprint 334 — the book answers back: the under's ledgers read
        // out loud for a pittance, and the asking files a question too
        const book = (g.interaction as { interactables?: { kind: string;
          pos: { x: number; y: number; z: number } }[] }).interactables
          ?.find((i) => i.kind === 'book');
        bookFound = !!book;
        if (book) {
          const mBook = g.marginalia;
          const tBook = gh.paperTrail;
          standAt(lobby, { x: book.pos.x, z: book.pos.z }, 0.7);
          bookSeen = drive(book.pos, /book|ask/i,
            () => caps.some((t) => /book on you|one line on you/.test(t)), 50);
          bookCap = caps.find((t) => /book on you|one line on you/.test(t)) ?? '';
          bookRead = bookCap !== '' && g.marginalia === mBook - 3
            && gh.paperTrail === tBook + 1
            && bookCap.includes(`${tBook + 1} question`);
        }
      }
      return {
        stage: 'done', refused, refuseCap, price, item,
        purseFound: !!purse, pursePaid, purseSour, purseCleanCap, purseSourCap,
        purseShortCap, margAfterPurse, purseWashCap, purseWashed,
        fenceCap, fencePaid, cpLedger, bookCap, bookRead,
        bookFound, bookSeen,
        purseSeen, pursePos: purse ? { x: purse.pos.x, y: purse.pos.y, z: purse.pos.z } : null,
        bsockPos: lobby.sockets.filter((s) => s.meta?.broker !== undefined)
          .map((s) => ({ x: Math.round(s.pos.x * 10) / 10, y: s.pos.y, z: Math.round(s.pos.z * 10) / 10 })),
        playerAt: { x: Math.round(g.player.pos.x * 10) / 10, z: Math.round(g.player.pos.z * 10) / 10 },
        sold: sock.meta.sold === true,
        paid: markedPaid || g.marginalia === 0,
        hasItem: g.inventory.some((s) => s.id === item),
        traded: caps.some((t) => /traded/.test(t)),
        twoPedestals: !!sock2, markedPaid, markedCap, expected2,
        fixFound: true, fixPrompt, fixPaid, fixCap, heldAfterFix,
        cleanCap, cleanUncharged,
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
  // sprint 323 — the purse: 6 imprints change at 8 clean / 6 sour / refuse short
  expect(result.purseFound, JSON.stringify(result)).toBe(true);
  expect(result.pursePaid, JSON.stringify(result)).toBe(true);
  expect(result.purseCleanCap).toMatch(/purse changes/);
  expect(result.purseSour, JSON.stringify(result)).toBe(true);
  expect(result.purseSourCap).toMatch(/rate sours/);
  expect(result.purseShortCap).toMatch(/purse wants/);
  // sprint 329/330 — the wash: marked coin dies silent, the under's
  // book opens a line for it (paperTrail +1 asserted in purseWashed)
  expect(result.purseWashed, JSON.stringify(result)).toBe(true);
  expect(result.purseWashCap).toMatch(/weighs the marked coin/);
  // sprint 331 — the fence: marked stock out at the insult rate, a line
  expect(result.fencePaid, JSON.stringify(result)).toBe(true);
  expect(result.fenceCap).toMatch(/takes the marked stock/);
  // sprint 332 — the checkpoint carries the ledgers (trail/marks mirror
  // live state, death can't launder the books)
  expect(result.cpLedger, JSON.stringify(result)).toBe(true);
  // sprint 334 — the book reads you: costs 3 marginalia + one filed
  // question, and the read counts the asking
  expect(result.bookRead, JSON.stringify(result)).toBe(true);
  expect(result.bookCap).toMatch(/question|one line/);
  expect(result.margAfterPurse).toBe(44);
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
    const ga = g as unknown as { unpaidHeld: number; hotImprints?: number;
      hotItems?: Set<string>;
      clerkFigs?: Map<number, unknown>;
      hazard: { evidence: { pos: { x: number; z: number }; kind: string;
        weak?: boolean }[] };
      bellRung?: Map<number, { t: number; x: number; z: number }> };

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

    const drive = (at: { x: number; y: number; z: number }, done: () => boolean, cap: number,
      toward: { x: number; z: number } = clerked.origin): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const dx = toward.x - at.x, dz = toward.z - at.z;
        const L = Math.hypot(dx, dz) || 1;
        g.player.teleport(at.x + (dx / L) * 1.0, 0, at.z + (dz / L) * 1.0);
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(at.y + 0.6 - eyeY, Math.hypot(ax, az) || 1)));
        const prompt = g.interaction.focused?.prompt ?? '';
        if (f % 10 === 0) seen.push(prompt);
        if (/counter|buy|wares|take|ask|clerk|rifle|till|ring|bell|purse|change/i.test(prompt)) {
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

    // Pay: the till rings — with marked coin in the pool, so the spend
    // testifies twice: the ring AND the register files the hands.
    const gHot = g as unknown as { hotImprints: number };
    gHot.hotImprints = 1;
    const heldHot = ga.unpaidHeld;
    g.imprints = price;
    drive(sock.pos, () => sock.meta.sold === true, 50);
    const sold = sock.meta.sold === true;
    const tillCap = caps.find((t) => /till rings/.test(t)) ?? '';
    // sprint 335 — the marked coin testifies twice: hot drained by the
    // spend, the register filed the hands that fed it
    const hotFiled = sold && gHot.hotImprints === 0
      && ga.unpaidHeld === heldHot + 1;
    const hotFileCap = caps.find((t) => /files the hands/.test(t)) ?? '';
    ga.unpaidHeld = heldHot; // the rifle's +2 reads against a clean book

    // The register's rate: a filed face pays more on the second pedestal.
    const sock2 = clerked.sockets.find((s) => s.meta?.clerk !== undefined
      && s.meta?.clerkItem !== undefined && s !== sock);
    let ratePaid = false, rateCap = '', expected2 = 0;
    if (sock2) {
      const price2 = sock2.meta.clerkPrice as number;
      ga.unpaidHeld = 3;
      expected2 = price2 + Math.min(3 + 3 * 2, 10); // +9 on the register's rate
      // quote the rate via a refusal (keeps the ware unsold for the
      // cold-counter phase below — a sold socket presses silently)
      g.imprints = expected2 - 1;
      drive(sock2.pos, () => caps.some((t) => /register's rate is/.test(t)), 50);
      rateCap = caps.find((t) => /register's rate is/.test(t)) ?? '';
      const quoted = Number(/register's rate is (\d+)/.exec(rateCap)?.[1]);
      ratePaid = quoted === expected2 && sock2.meta.sold !== true
        && g.imprints === expected2 - 1;
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
    // Change the purse — the clerk's counter converts marginalia to
    // imprints: clean books 8→6, a filed face sours it to 8→4.
    const purse = (g.interaction as { interactables?: { kind: string;
      pos: { x: number; y: number; z: number } }[] }).interactables
      ?.find((i) => i.kind === 'purse');
    let pursePaid = false, purseSour = false, purseShortCap = '',
      purseCleanCap = '', purseSourCap = '', purseSeen = '';
    if (purse) {
      // the purse sits at the counter's lateral end — at+1.0·dirToCenter lands
      // inside the counter flank's collider and the eject leaves the aim stale
      // (lookDir set pre-push misses by ~60°); stand 0.6m off instead
      const pcx = clerked.origin.x - purse.pos.x;
      const pcz = clerked.origin.z - purse.pos.z;
      const pL = Math.hypot(pcx, pcz) || 1;
      const purseAt = { x: purse.pos.x - (pcx / pL) * 0.4, y: purse.pos.y,
        z: purse.pos.z - (pcz / pL) * 0.4 };
      g.marginalia = 20; g.imprints = 10;
      purseSeen = drive(purseAt, () => g.imprints === 16, 60);
      pursePaid = g.imprints === 16 && g.marginalia === 12;
      purseCleanCap = caps.find((t) => /purse changes/.test(t)) ?? '';
      ga.unpaidHeld = 2; // a filed face — the register sours the change
      drive(purseAt, () => g.imprints === 20, 50);
      purseSour = g.imprints === 20 && g.marginalia === 4;
      purseSourCap = caps.find((t) => /counts your coins twice|rate sours/.test(t)) ?? '';
      ga.unpaidHeld = 0;
      g.marginalia = 5; g.imprints = 20;
      drive(purseAt, () => caps.some((t) => /purse wants/.test(t)), 40);
      purseShortCap = caps.find((t) => /purse wants/.test(t)) ?? '';
    }
    // Rifle the till — the staffed-register rummage: pays once, files
    // your face twice, and the till never re-offers.
    const till = (g.interaction as { interactables?: { kind: string;
      pos: { x: number; y: number; z: number } }[] }).interactables
      ?.find((i) => i.kind === 'till');
    let tillPaid = false, tillHeld = 0, rifleCap = '', tillGone = false, tillSeen = '';
    let hotAfterRifle = -1;
    let workMark = false, headPre = 0, headPost = 0;
    let restockCap = '', restockDone = false;
    const clerkFig = ga.clerkFigs?.get(g.route.rooms.indexOf(clerked)) as
      { position: { x: number; z: number }; rotation: { y: number };
        userData?: { figureParts?: { head?: { rotation: { y: number } } } } } | undefined;
    const clerkHead = clerkFig?.userData?.figureParts?.head;
    // the bell draws its eye — a warm clerk answers its own ring; the
    // cold counter ignores the house's sound and watches only you
    const bell = (g.interaction as { interactables?: { kind: string;
      pos: { x: number; y: number; z: number } }[] }).interactables
      ?.find((i) => i.kind === 'bell');
    const bellRungMap = ga.bellRung;
    const normRel = (dx: number, dz: number, yaw: number) =>
      Math.atan2(Math.sin(Math.atan2(dx, dz) - yaw), Math.cos(Math.atan2(dx, dz) - yaw));
    let bellLookWarm = 0, relBellN = 0, bellLookCold = 0, relPlayerN = 0;
    if (till) {
      ga.unpaidHeld = 0;
      g.imprints = 0;
      // pre-rifle: the clerk attends the till — its head never tracks
      headPre = clerkHead ? Math.abs(clerkHead.rotation.y) : -1;
      if (bell && clerkFig && clerkHead) {
        drive(bell.pos, () => caps.some((t) => /note rolls/.test(t)), 60);
        for (let f = 0; f < 20; f++) g.frame();
        relBellN = normRel(bell.pos.x - clerkFig.position.x,
          bell.pos.z - clerkFig.position.z, clerkFig.rotation.y);
        bellLookWarm = clerkHead.rotation.y;
        bellRungMap?.delete(g.route.rooms.indexOf(clerked)); // let the later phase ring fresh
      }
      // stand close (0.7m): from the default 1.0m stand the unsold
      // front-edge wares out-score the mid-counter till on proximity —
      // inside the align band the nearer candidate wins regardless of aim
      const tdx = clerked.origin.x - till.pos.x, tdz = clerked.origin.z - till.pos.z;
      const tdl = Math.hypot(tdx, tdz) || 1;
      tillSeen = drive({ x: till.pos.x - (tdx / tdl) * 0.3, y: till.pos.y,
        z: till.pos.z - (tdz / tdl) * 0.3 },
        () => caps.some((t) => /off the till/.test(t)), 80);
      rifleCap = caps.find((t) => /off the till/.test(t)) ?? '';
      tillPaid = rifleCap !== '' && (g.imprints > 0 || g.inventory.length > 0);
      tillHeld = ga.unpaidHeld;
      // sprint 329 — imprints paid off the till are marked coin
      hotAfterRifle = ga.hotImprints ?? -1;
      // the till smells of hands — the rifle leaves fresh 'work' sign at
      // the counter (kind-agnostic readers pull it; the warden weighs it)
      workMark = ga.hazard.evidence
        .some((e) => e.kind === 'work' && e.weak !== true
          && Math.hypot(e.pos.x - till.pos.x, e.pos.z - till.pos.z) < 0.6);
      for (let f = 0; f < 12; f++) g.frame();
      tillGone = !(g.interaction as { interactables?: { kind: string }[] })
        .interactables?.some((i) => i.kind === 'till');
      // post-rifle: the cold counter's face finds your hands — stand
      // ~52° off the fig's facing and its head turns to keep you
      if (clerkFig && clerkHead) {
        g.player.teleport(
          clerkFig.position.x + Math.sin(clerkFig.rotation.y + 0.9) * 2.0, 0,
          clerkFig.position.z + Math.cos(clerkFig.rotation.y + 0.9) * 2.0);
        for (let f = 0; f < 40; f++) g.frame();
        headPost = clerkHead.rotation.y;
      }
      // sprint 333 — the take goes back: the emptied till reaccepts
      // its own marked stock — free, quiet, and the file stays written
      const restock = (g.interaction as { interactables?: { kind: string;
        pos: { x: number; y: number; z: number } }[] }).interactables
        ?.find((i) => i.kind === 'restock');
      if (restock) {
        ga.hotItems?.add('tonic');
        g.giveItem('tonic', 1);
        const heldAtRestock = ga.unpaidHeld;
        // the till anchor sits mid-counter — drive from the close 0.7m
        // stand (1.0m lands inside the counter flank collider: eject
        // fires after the aim, lookDir misses ~60°, focus stays null)
        const rdx = clerked.origin.x - restock.pos.x, rdz = clerked.origin.z - restock.pos.z;
        const rdl = Math.hypot(rdx, rdz) || 1;
        drive({ x: restock.pos.x - (rdx / rdl) * 0.3, y: restock.pos.y,
          z: restock.pos.z - (rdz / rdl) * 0.3 },
          () => caps.some((t) => /takes its own back/.test(t)), 50);
        restockCap = caps.find((t) => /takes its own back/.test(t)) ?? '';
        restockDone = restockCap !== '' && (ga.hotItems?.size ?? -1) === 0
          && !g.inventory.some((s) => s.id === 'tonic')
          && ga.unpaidHeld === heldAtRestock;
      }
    }
    // Ring the desk bell — the house's only positional lure: noise at
    // the counter, not at you, then a cooldown the tired click names.
    let bellDist = -1, bellCap = '', bellTiredCap = '', bellRang = 0;
    if (bell) {
      const snd = (g as unknown as { sound: { emit: (e: never) => void } }).sound;
      const origEmit = snd.emit.bind(snd);
      const rings: { x: number; z: number }[] = [];
      snd.emit = (e: { category?: string; x?: number; z?: number; intensity?: number; y?: number }) => {
        if (e.category === 'distraction') rings.push({ x: e.x ?? 0, z: e.z ?? 0 });
        return origEmit(e as never);
      };
      // the warm ring's caption is already in caps — wait for a NEW one
      const ringsBefore = caps.filter((t) => /note rolls/.test(t)).length;
      drive(bell.pos, () => caps.filter((t) => /note rolls/.test(t)).length > ringsBefore, 60);
      bellCap = caps.find((t) => /note rolls/.test(t)) ?? '';
      bellRang = rings.length;
      bellDist = rings.length
        ? Math.hypot(rings[0].x - bell.pos.x, rings[0].z - bell.pos.z) : -1;
      // ...but the cold clerk doesn't look — its eye stays on the thief.
      // Stand on the side opposite the bell; the head should track YOU.
      if (clerkFig && clerkHead) {
        const side = relBellN >= 0 ? -1.0 : 1.0; // opposite the bell
        g.player.teleport(
          clerkFig.position.x + Math.sin(clerkFig.rotation.y + side) * 2.0, 0,
          clerkFig.position.z + Math.cos(clerkFig.rotation.y + side) * 2.0);
        for (let f = 0; f < 20; f++) g.frame();
        relPlayerN = normRel(g.player.pos.x - clerkFig.position.x,
          g.player.pos.z - clerkFig.position.z, clerkFig.rotation.y);
        bellLookCold = clerkHead.rotation.y;
      }
      // inside the cooldown a second ring only clicks
      drive(bell.pos, () => caps.some((t) => /tired click/.test(t)), 60);
      bellTiredCap = caps.find((t) => /tired click/.test(t)) ?? '';
      snd.emit = origEmit;
    }
    // The counter goes cold: rifled tills close the clerk's service —
    // wares refuse at any price, the page folds, only the bell (the
    // house's, not the clerk's) still answers.
    let coldWareCap = '', coldWareSold = true, coldAskCap = '', coldImprints = -1, coldBellCap = '', coldPurseCap = '';
    g.imprints = 99;
    if (sock2) {
      drive(sock2.pos, () => caps.some((t) => /folds its hands/.test(t)), 50);
      coldWareCap = caps.find((t) => /folds its hands/.test(t)) ?? '';
      coldWareSold = sock2.meta.sold === true;
      coldImprints = g.imprints;
    }
    if (ask) {
      drive(ask.pos, () => caps.filter((t) => /folds its hands/.test(t)).length >= 2, 60);
      const folds = caps.filter((t) => /folds its hands/.test(t));
      coldAskCap = folds[folds.length - 1] ?? '';
    }
    if (bell) {
      drive(bell.pos, () => caps.some((t) => /tired click|note rolls/.test(t)), 60);
      coldBellCap = caps.find((t) => /tired click|note rolls/.test(t)) ?? '';
    }
    // the purse is the clerk's service too — a cold counter folds it
    if (purse) {
      drive(purse.pos, () => caps.filter((t) => /folds its hands/.test(t)).length >= 3, 60);
      const folds = caps.filter((t) => /folds its hands/.test(t));
      coldPurseCap = folds[folds.length - 1] ?? '';
    }
    // sprint 328 — the unfiled hands: at a second warm counter, ring the
    // bell then rifle inside its look window (~3.5s) — the eye is on the
    // bell, not your hands: the register never writes you, though the
    // till still opens, still smells, and the counter still goes cold.
    const clerked2 = g.route.rooms.find((r) => r !== clerked
      && r.sockets.some((s) => s.meta?.clerk === 'slot0'));
    let unfiledCap = '', unfiledHeld = -1, unfiledCold = false, unfiledRoom = -1;
    let unfiledLocal = '', unfiledSeen = '', ring2Ok = false;
    let unfiledStand: { x: number; z: number } | null = null, unfiledDist = -1;
    let till2Pos: { x: number; z: number } | null = null;
    let stockCue = '', stockYaw = -1, markPruned = false, cleanYaw = -1,
      cleanDrift = -1;
    let gateProbe: { enabled: boolean; dist: number; align: number; prox: number; eyeY: number } | null = null;
    let ejectProbe: { pre: { x: number; z: number }; post: { x: number; z: number };
      origin: { x: number; z: number } } | null = null;
    const closedCounters = (g as unknown as { closedCounters?: Set<number> }).closedCounters;
    if (clerked2) {
      const idxB = g.route.rooms.indexOf(clerked2);
      unfiledRoom = clerked2.index;
      ga.unpaidHeld = 0;
      // sprint 335 — drain the hot pool too: this phase asserts ONLY
      // the bell-window +0, and room A's rifle left marked coin that any
      // stray priced press in room B (e.g. the warm ask on the fig)
      // would spend into a +1 register file
      (g as unknown as { hotImprints: number }).hotImprints = 0;
      g.player.teleport(clerked2.origin.x, 0, clerked2.origin.z);
      g.currentRoom = clerked2.index;
      for (let f = 0; f < 20; f++) g.frame();
      // sprint 331 — the till's stock testifies: carry marked goods past
      // a warm clerk and its own stock tells — the eye finds the take.
      const figB = ga.clerkFigs?.get(idxB) as
        { position: { x: number; z: number }; rotation: { y: number };
          userData?: { figureParts?: { head?: { rotation: { y: number } } } } } | undefined;
      const headB = figB?.userData?.figureParts?.head;
      if (figB && headB) {
        ga.hotItems?.add('doorChock');
        g.giveItem('doorChock', 1);
        g.player.teleport(figB.position.x + Math.sin(figB.rotation.y + 1.0) * 2.0, 0,
          figB.position.z + Math.cos(figB.rotation.y + 1.0) * 2.0);
        for (let f = 0; f < 24; f++) g.frame();
        stockYaw = headB.rotation.y;
        stockCue = caps.find((t) => /reads its own stock/.test(t)) ?? '';
        // sprint 337 — the mark dies with the goods: zero the last
        // marked unit and the pool prunes it; a fresh clean ware of
        // the same id is not the take and no eye finds it
        const chockStack = g.inventory.find((i) => i.id === 'doorChock');
        if (chockStack) chockStack.count = 0;
        for (let f = 0; f < 30; f++) g.frame(); // prune + head decay
        markPruned = !(ga.hotItems?.has('doorChock') ?? true);
        g.giveItem('doorChock', 1);
        g.player.teleport(figB.position.x + Math.sin(figB.rotation.y - 1.0) * 2.0, 0,
          figB.position.z + Math.cos(figB.rotation.y - 1.0) * 2.0);
        for (let f = 0; f < 30; f++) g.frame();
        cleanYaw = headB.rotation.y;
        // an unwatched head holds its last bearing (no decay path) — the
        // proof is it does NOT chase the clean carrier to this side
        cleanDrift = Math.abs(cleanYaw - stockYaw);
        ga.hotItems?.clear();
      }
      // interactables mint per-room on approach — find room B's once inside
      const local = () => (g.interaction as { interactables?: { kind: string;
        pos: { x: number; y: number; z: number }; enabled?: boolean;
        data?: { roomIndex?: number } }[] }).interactables;
      const bell2 = local()?.find((i) => i.kind === 'bell' && i.data?.roomIndex === idxB);
      const till2 = local()?.find((i) => i.kind === 'till' && i.data?.roomIndex === idxB);
      unfiledLocal = local()?.map((i) => `${i.kind}@${i.data?.roomIndex}`).join('|') ?? '';
      if (bell2 && till2) {
        const rollsBefore = caps.filter((t) => /note rolls/.test(t)).length;
        drive(bell2.pos, () => caps.filter((t) => /note rolls/.test(t)).length > rollsBefore, 60,
          clerked2.origin);
        ring2Ok = caps.filter((t) => /note rolls/.test(t)).length > rollsBefore;
        // inside the eye's window — reach the till before ~3.5s passes
        const t2dx = clerked2.origin.x - till2.pos.x, t2dz = clerked2.origin.z - till2.pos.z;
        const t2dl = Math.hypot(t2dx, t2dz) || 1;
        const tillsBefore = caps.filter((t) => /off the till/.test(t)).length;
        unfiledSeen = drive({ x: till2.pos.x + (t2dx / t2dl) * 0.4, y: till2.pos.y,
          z: till2.pos.z + (t2dz / t2dl) * 0.4 },
          () => caps.filter((t) => /off the till/.test(t)).length > tillsBefore, 80, clerked2.origin);
        // probe the gate: dist/align/prox of the till candidate as focus() sees it
        const liveTill = local()?.find((i) => i.kind === 'till' && i.data?.roomIndex === idxB) as
          { pos: { x: number; y: number; z: number }; enabled?: boolean } | undefined;
        if (liveTill) {
          const ld = (g.player as unknown as { lookDir(out: { x: number; y: number; z: number }):
            { x: number; y: number; z: number } }).lookDir({ x: 0, y: 0, z: 0 });
          const eye = { x: g.player.pos.x, y: g.player.pos.y + g.player.eyeHeight, z: g.player.pos.z };
          const ddx = liveTill.pos.x - eye.x, ddy = (liveTill.pos.y + 0.6) - eye.y, ddz = liveTill.pos.z - eye.z;
          const dd = Math.hypot(ddx, ddy, ddz) || 1;
          gateProbe = {
            enabled: liveTill.enabled === true, dist: Math.round(dd * 100) / 100,
            align: Math.round(((ddx * ld.x + ddy * ld.y + ddz * ld.z) / dd) * 100) / 100,
            prox: Math.round(Math.hypot(liveTill.pos.x - g.player.pos.x,
              liveTill.pos.y - g.player.pos.y, liveTill.pos.z - g.player.pos.z) * 100) / 100,
            eyeY: Math.round(eye.y * 100) / 100,
          };
        }
        // is the planned stand itself inside a collider? teleport there
        // bare and diff pre/post-frame positions
        const planX = till2.pos.x + (t2dx / t2dl) * 1.4, planZ = till2.pos.z + (t2dz / t2dl) * 1.4;
        g.player.teleport(planX, 0, planZ);
        ejectProbe = {
          pre: { x: Math.round(g.player.pos.x * 10) / 10, z: Math.round(g.player.pos.z * 10) / 10 },
          post: { x: 0, z: 0 },
          origin: { x: Math.round(clerked2.origin.x * 10) / 10, z: Math.round(clerked2.origin.z * 10) / 10 },
        };
        g.frame();
        ejectProbe.post = { x: Math.round(g.player.pos.x * 10) / 10, z: Math.round(g.player.pos.z * 10) / 10 };
        till2Pos = { x: Math.round(till2.pos.x * 10) / 10, z: Math.round(till2.pos.z * 10) / 10 };
        unfiledStand = { x: Math.round(g.player.pos.x * 10) / 10, z: Math.round(g.player.pos.z * 10) / 10 };
        unfiledDist = Math.hypot(g.player.pos.x - till2.pos.x, g.player.pos.z - till2.pos.z);
        unfiledCap = caps.find((t) => /unfiled/.test(t)) ?? '';
        unfiledHeld = ga.unpaidHeld;
        unfiledCold = closedCounters?.has(idxB) === true;
      }
    }
    return { stage: 'done', figPresent, refused, refuseCap, sold, tillCap,
      hotFiled, hotFileCap,
      hasItem: g.inventory.some((s) => s.id === item),
      twoSocks: !!sock2, ratePaid, rateCap, expected2,
      askFound: !!ask, askPrompt, askPaid, askCap, askTwice,
      tillFound: !!till, tillPaid, tillHeld, tillRifleCap: rifleCap, tillGone, tillSeen,
      hotAfterRifle,
      workMark, headPre, headPost, bellLookWarm, relBellN, bellLookCold, relPlayerN,
      restockCap, restockDone,
      bellFound: !!bell, bellRang, bellDist, bellCap, bellTiredCap,
      coldWareCap, coldWareSold, coldImprints, coldAskCap, coldBellCap, coldPurseCap,
      unfiledCap, unfiledHeld, unfiledCold, unfiledRoom,
      unfiledLocal, unfiledSeen, ring2Ok, unfiledStand, unfiledDist, till2Pos, gateProbe, ejectProbe,
      stockCue, stockYaw, markPruned, cleanYaw, cleanDrift,
      purseFound: !!purse, pursePaid, purseSour, purseCleanCap, purseSourCap, purseShortCap,
      purseSeen, pursePos: purse ? { x: Math.round(purse.pos.x*10)/10, y: purse.pos.y, z: Math.round(purse.pos.z*10)/10 } : null,
      pursePlayer: { x: Math.round(g.player.pos.x*10)/10, z: Math.round(g.player.pos.z*10)/10 },
      nearPurse: purse ? (g.interaction as { interactables?: { kind: string; enabled?: boolean;
        pos: { x: number; y: number; z: number }; priority?: number }[] }).interactables
        ?.filter((i) => Math.hypot(i.pos.x - purse.pos.x, i.pos.z - purse.pos.z) < 3)
        .map((i) => `${i.kind}${i.enabled === false ? '!' : ''}@${Math.round(Math.hypot(i.pos.x - purse.pos.x, i.pos.z - purse.pos.z) * 10) / 10}`) : [],
      clerkQ: sock.meta.clerkQ as string };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.figPresent).toBe(true);
  expect(result.refused).toBe(true);
  expect(result.refuseCap).toMatch(/imprints required/);
  expect(result.sold).toBe(true);
  expect(result.tillCap).toMatch(/till rings/);
  // sprint 335 — the marked coin testifies twice: the spend drains the
  // hot pool and the register files the hands that fed it
  expect(result.hotFiled, JSON.stringify(result)).toBe(true);
  expect(result.hotFileCap).toMatch(/files the hands/);
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
  // sprint 320 — rifle the till: pays once, files your face twice, never re-offers
  expect(result.tillFound, JSON.stringify(result)).toBe(true);
  expect(result.tillPaid, JSON.stringify(result)).toBe(true);
  expect(result.tillHeld).toBe(2);
  expect(result.tillGone).toBe(true);
  expect(result.workMark, JSON.stringify(result)).toBe(true); // fresh 'work' sign at the counter
  // sprint 329 — the till's coin is marked: hot iff it paid imprints
  expect((result.hotAfterRifle ?? -1) > 0 === (result.tillRifleCap ?? '').includes('marked'),
    JSON.stringify(result)).toBe(true);
  expect(result.headPre).toBeLessThan(0.15); // untracked before the rifle
  expect(result.headPost, JSON.stringify(result)).toBeGreaterThan(0.25); // the clerk watches your hands
  // sprint 333 — the take goes back: marks clear, goods stripped, file stays
  expect(result.restockDone, JSON.stringify(result)).toBe(true);
  expect(result.restockCap).toMatch(/takes its own back/);
  // sprint 327 — the bell draws its eye: warm clerk turns toward its own
  // ring (when the bell isn't dead-ahead), cold clerk keeps watching you
  if (Math.abs(result.relBellN ?? 0) > 0.3) {
    expect(Math.sign(result.bellLookWarm ?? 0), `rel=${result.relBellN} ${JSON.stringify(result)}`).toBe(Math.sign(result.relBellN ?? 0));
    expect(Math.abs(result.bellLookWarm ?? 0)).toBeGreaterThan(0.15);
  }
  if (Math.abs(result.relPlayerN ?? 0) > 0.3
    && Math.abs((result.relPlayerN ?? 0) - (result.relBellN ?? 0)) > 0.4) {
    expect(Math.sign(result.bellLookCold ?? 0), `relP=${result.relPlayerN} relB=${result.relBellN} ${JSON.stringify(result)}`).toBe(Math.sign(result.relPlayerN ?? 0));
  }
  // sprint 321 — the desk bell: noise at the counter, a spent tool inside 25s
  expect(result.bellFound, JSON.stringify(result)).toBe(true);
  expect(result.bellCap).toMatch(/note rolls/);
  expect(result.bellRang).toBe(1);
  expect(result.bellDist).toBeLessThan(0.6);
  expect(result.bellTiredCap).toMatch(/tired click/);
  // sprint 331 — the till's stock testifies: warm clerk reads the
  // take on you — head yaw tracks the carrier + the stock cue pings
  expect(result.stockCue, JSON.stringify(result)).toMatch(/reads its own stock/);
  expect(Math.abs(result.stockYaw ?? 0), JSON.stringify(result)).toBeGreaterThan(0.25);
  // sprint 337 — the mark dies with the goods: consumed units prune the
  // pool and a clean re-acquired ware of the same id doesn't witness
  expect(result.markPruned, JSON.stringify(result)).toBe(true);
  expect(result.cleanDrift, JSON.stringify(result)).toBeGreaterThan(-1);
  expect(result.cleanDrift, JSON.stringify(result)).toBeLessThan(0.15);
  // sprint 328 — the unfiled hands: rifled inside the bell's look window
  // the register never writes you, but the counter still goes cold
  expect(result.unfiledRoom, 'second clerked room needed for the unfiled phase').toBeGreaterThan(-1);
  expect(result.unfiledCap, JSON.stringify(result)).toMatch(/unfiled/);
  expect(result.unfiledHeld, JSON.stringify(result)).toBe(0);
  expect(result.unfiledCold, JSON.stringify(result)).toBe(true);
  // sprint 322 — the counter goes cold: a rifled till ends the clerk's service
  expect(result.coldWareCap).toMatch(/folds its hands/);
  expect(result.coldWareSold).toBe(false);
  expect(result.coldImprints).toBe(99);
  expect(result.coldAskCap).toMatch(/folds its hands/);
  expect(result.coldBellCap).toMatch(/tired click|note rolls/);
  expect(result.coldPurseCap).toMatch(/folds its hands/);
  // sprint 324 — the purse's other direction: marginalia changes to imprints
  expect(result.purseFound, JSON.stringify(result)).toBe(true);
  expect(result.pursePaid, JSON.stringify(result)).toBe(true);
  expect(result.purseCleanCap).toMatch(/purse changes/);
  expect(result.purseSour, JSON.stringify(result)).toBe(true);
  expect(result.purseSourCap).toMatch(/counts your coins twice|rate sours/);
  expect(result.purseShortCap).toMatch(/purse wants/);
  expect(errors).toEqual([]);
});

