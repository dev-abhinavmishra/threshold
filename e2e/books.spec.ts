import { test, expect } from '@playwright/test';
import { seededRun, ThresholdG } from './harness';

test.setTimeout(300_000);

// The priced paper: collector toll, porter cage claims, guest ledger,
// duty roster, fault book, forged page, under work orders.
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
      g.player.pitch = Math.atan2(toll.pos.y + 0.6 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
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
      g.player.pitch = Math.atan2(pt.pos.y + 0.6 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
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
      g.player.pitch = Math.atan2(pt.pos.y + 0.6 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
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
        g.player.pitch = Math.atan2(pt.pos.y + 0.6 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
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
      g.player.pitch = Math.atan2(pt.pos.y + 0.6 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
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
      g.player.pitch = Math.atan2(pt.pos.y + 0.6 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
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
    const coverIsRedactor = g.route.rooms.some((r) => r.index === cover
      && r.scheduled?.some((sc) => sc.entity === 'redactor'));
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
      g.player.pitch = Math.atan2(pt.pos.y + 0.6 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (g.interaction.focused?.id === pt.id) g.keys.add('KeyE');
      g.frame();
    }
    g.keys.delete('KeyE');
    const paid = (sock.meta as { taken?: boolean }).taken === true;
    const ledgerLine = caps.find((c) => /the ledger expects|pages ahead are blank/.test(c)) ?? '';
    const wetInk = caps.some((c) => /ink on one page is still wet/.test(c));
    return { stage: 'done', cover, coverIsRedactor, paid, ledgerLine, wetInk, caps: caps.slice(-10) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { cover: number; coverIsRedactor: boolean; paid: boolean; ledgerLine: string; wetInk: boolean; caps: string[] };
  expect(r.cover).toBeGreaterThan(0);
  expect(r.coverIsRedactor).toBe(true);
  expect(r.paid, `the forged book never read — caps: ${r.caps.join(' | ')}`).toBe(true);
  // The lie: the covered Door holds a redactor and the book says nothing about it.
  expect(r.ledgerLine).toMatch(/the ledger expects/);
  expect(r.ledgerLine).not.toMatch(new RegExp(`Door ${String(r.cover).padStart(3, '0')}`));
  // The tell: legible in the moment, damning in retrospect.
  expect(r.wetInk).toBe(true);
  expect(errors).toEqual([]);
});

test("the work order files open tickets — the under's own paper answers cargo", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's': work orders live-computed (placement drifts with the loot stream)

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
      g.player.pitch = Math.atan2(pt.pos.y + 0.6 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
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

test("the inspection sheet marks which doors the house watches", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's': sheets @18/28/33/72/82/93; live cam @36, dead cam @18

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const purse = g as unknown as { imprints: number };
    const watched = (r: { spec?: { props?: { kind: string }[] } }) =>
      (r.spec?.props ?? []).some((p) => p.kind === 'securityCam' || p.kind === 'searchlight');
    const sheets = g.route.rooms.filter((r) => (r.sockets ?? []).some((s) => s.meta?.watchSheet));
    const marked = sheets.find((r) => g.route.rooms.some(
      (x) => x.index > r.index && x.index <= r.index + 10 && watched(x)));
    const clean = sheets.find((r) => !g.route.rooms.some(
      (x) => x.index > r.index && x.index <= r.index + 10 && watched(x)));
    if (!marked || !clean) return { stage: 'missing-fixture' } as const;

    const read = (room: typeof marked): { prompt: string; line: string } => {
      g.player.teleport(room.origin.x, 0, room.origin.z);
      for (let f = 0; f < 30; f++) g.frame();
      const pt = g.interaction.interactables.find((i) => i.kind === 'watchSheet');
      if (!pt) return { prompt: '', line: '' };
      purse.imprints = 60;
      const sock = pt.data!;
      const before = caps.length;
      for (let f = 0; f < 160 && !(sock.meta as { taken?: boolean }).taken; f++) {
        const ax = pt.pos.x - g.player.pos.x, az = pt.pos.z - g.player.pos.z;
        const al = Math.hypot(ax, az) || 1;
        if (al > 1.4) g.player.teleport(pt.pos.x - (ax / al) * 1.1, 0, pt.pos.z - (az / al) * 1.1);
        g.player.yaw = Math.atan2(ax, az);
        g.player.pitch = Math.atan2(pt.pos.y + 0.6 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
        if (g.interaction.focused?.id === pt.id) g.keys.add('KeyE');
        g.frame();
      }
      g.keys.delete('KeyE');
      return { prompt: pt.prompt, line: caps.slice(before).find((c) => /inspection sheet marks|nothing watches/.test(c)) ?? '' };
    };

    const markedRead = read(marked);
    const cleanRead = read(clean);
    // expected marking for the marked sheet — computed live from spec.props
    const watchedRoom = g.route.rooms.find(
      (x) => x.index > marked.index && x.index <= marked.index + 10 && watched(x))!;
    const expectMark = watchedRoom.darkRoom ? 'a dead eye' : /live eye|beam crosses|eye and a beam/;
    return { stage: 'done', markedPrompt: markedRead.prompt, markedLine: markedRead.line,
      cleanLine: cleanRead.line, watchedIdx: watchedRoom.index,
      expectMark, markedIdx: marked.index, cleanIdx: clean.index } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.markedPrompt).toMatch(/read the inspection sheet — \d+ imprints/i);
  expect(result.markedLine, `sheet@${result.markedIdx} must mark watched@${result.watchedIdx}`).toMatch(/the inspection sheet marks:/);
  expect(result.markedLine).toContain(`Door ${String(result.watchedIdx).padStart(3, '0')}`);
  expect(result.markedLine).toMatch(result.expectMark);
  expect(result.cleanLine, `sheet@${result.cleanIdx} should read clean`).toMatch(/nothing watches the doors ahead/);
  expect(errors).toEqual([]);
});
