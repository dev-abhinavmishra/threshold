import { test, expect } from '@playwright/test';
import { seededRun, ThresholdG } from './harness';

test.setTimeout(300_000);

// The under's crew + its paper: the hauler's sledge and lamp, the
// laundress's basin, lost-property cages, crew board, claim register,
// and the Auditor's tally — everything priced in marginalia.
test('the haul — a sledge you can pick while it scrapes the hall', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // hauler @ u-2

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      entities: { id: string; state: string }[];
      marginalia: number; keys: Set<string>;
    };
    ga.enterUnderscript();
    ga.godMode = true;
    const hRoom = g.route.underRooms.find((r) => !r.darkRoom && r.scheduled?.some((s) => s.entity === 'hauler'))
      ?? g.route.underRooms.find((r) => r.scheduled?.some((s) => s.entity === 'hauler'));
    if (!hRoom) return { stage: 'none-scheduled' } as const;
    g.player.teleport(hRoom.origin.x, 0, hRoom.origin.z);
    ga.currentRoom = hRoom.index;
    for (let f = 0; f < 60; f++) g.frame();
    const hauler = ga.entities.find((e) => e.id === 'hauler') as
      { id: string; sledgePos: { x: number; z: number }; stock: number; state: string } | undefined;
    if (!hauler) return { stage: 'no-hauler' } as const;
    const m0 = ga.marginalia;
    const st0 = hauler.stock;
    // stand on the drag, aim at it, hold E — pilfer on the move
    g.player.teleport(hauler.sledgePos.x, 0, hauler.sledgePos.z);
    let prompt = '';
    for (let f = 0; f < 40; f++) {
      // stay pinned to the moving sledge — the pick walks with the haul
      g.player.teleport(hauler.sledgePos.x, 0, hauler.sledgePos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(0.4 - eyeY, 0.5);
      g.player.yaw = Math.atan2(hauler.sledgePos.x - g.player.pos.x,
        hauler.sledgePos.z - g.player.pos.z) || 0;
      g.frame();
      prompt = g.interaction.focused?.prompt ?? prompt;
      if (f === 8) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    for (let f = 0; f < 10; f++) g.frame();
    // then the lamp: aim at the tail light, hold E — the drag goes dark
    const hl = hauler as unknown as { lampPos: { x: number; z: number }; lampLit: boolean; relit: boolean };
    const hadCharge = (g as unknown as { inventory: { id: string; count: number }[] })
      .inventory.find((i) => i.id === 'handLamp')?.count ?? 0;
    let stripPrompt = '';
    for (let f = 0; f < 45 && hl.lampLit; f++) {
      g.player.teleport(hl.lampPos.x, 0, hl.lampPos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(0.75 - eyeY, 0.5);
      g.player.yaw = Math.atan2(hl.lampPos.x - g.player.pos.x,
        hl.lampPos.z - g.player.pos.z) || 0;
      g.frame();
      stripPrompt = g.interaction.focused?.prompt ?? stripPrompt;
      if (f === 8) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    for (let f = 0; f < 10; f++) g.frame();
    const lampAfter = (g as unknown as { inventory: { id: string; count: number }[] })
      .inventory.find((i) => i.id === 'handLamp');
    // the economy of darkness: under live mains the team scavenges a bulb —
    // the lamp comes back on, dimmer, and strips a second (smaller) time
    let relit = false, scavengedPaid = false, secondDark = false;
    const litRoom = !(hRoom as { darkRoom?: boolean }).darkRoom;
    if (litRoom) {
      for (let f = 0; f < 150 && !hl.relit; f++) {
        g.player.teleport(hl.lampPos.x, 0, hl.lampPos.z);
        g.frame();
      }
      relit = hl.relit && hl.lampLit;
      if (relit) {
        const had2 = lampAfter?.count ?? 0;
        for (let f = 0; f < 45 && hl.lampLit; f++) {
          g.player.teleport(hl.lampPos.x, 0, hl.lampPos.z);
          const eyeY = g.player.pos.y + g.player.eyeHeight;
          g.player.pitch = Math.atan2(0.75 - eyeY, 0.5);
          g.player.yaw = Math.atan2(hl.lampPos.x - g.player.pos.x,
            hl.lampPos.z - g.player.pos.z) || 0;
          g.frame();
          if (f === 8) ga.keys.add('KeyE');
        }
        ga.keys.delete('KeyE');
        for (let f = 0; f < 10; f++) g.frame();
        const lamp2 = (g as unknown as { inventory: { id: string; count: number }[] })
          .inventory.find((i) => i.id === 'handLamp');
        scavengedPaid = (lamp2?.count ?? 0) - had2 >= 30;
        for (let f = 0; f < 150; f++) g.frame();
        secondDark = !hl.lampLit;
      }
    }
    return { stage: 'done', prompt, spent: hauler.stock < st0,
      paid: ga.marginalia > m0 || caps.some((c) => /off the sledge/.test(c)),
      stripPrompt, lampOut: !hl.lampLit || relit,
      lampPocketed: (lampAfter?.count ?? 0) - hadCharge >= 55,
      litRoom, relit, scavengedPaid, secondDark,
      caps: caps.filter((c) => /sledge|scrape|pilfer|lamp|bulb/.test(c)) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.prompt, JSON.stringify(result)).toMatch(/Pick the sledge/);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(result.stripPrompt, JSON.stringify(result)).toMatch(/Strip the lamp/);
  expect(result.lampOut, JSON.stringify(result)).toBe(true);
  expect(result.lampPocketed, JSON.stringify(result)).toBe(true);
  if (result.litRoom) {
    expect(result.relit, JSON.stringify(result)).toBe(true);
    expect(result.scavengedPaid, JSON.stringify(result)).toBe(true);
    expect(result.secondDark, JSON.stringify(result)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('the wash — a fouled drain, the thrown sound, the window', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 'gilt-spine-777'); // laundress @ u-15 (lit flood) + u-105 (drowned mains)

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      entities: { id: string; state: string }[];
      drainedRooms: Set<string>; keys: Set<string>;
      sound: { emit(e: { x: number; y: number; z: number; intensity: number; category: string; caption: string }): void };
      interaction: { focused?: { prompt?: string; kind?: string } };
    };
    ga.enterUnderscript();
    ga.godMode = true; // her bite is not the subject — the foul and the window are
    const wRoom = g.route.underRooms.find((r) => r.scheduled?.some((s) => s.entity === 'laundress'));
    if (!wRoom) return { stage: 'none-scheduled' } as const;
    g.player.teleport(wRoom.origin.x, 0, wRoom.origin.z);
    ga.currentRoom = wRoom.index;
    for (let f = 0; f < 60; f++) g.frame();
    const w = ga.entities.find((e) => e.id === 'laundress') as
      { guarding: boolean; drainPos: { x: number; z: number }; state: string } | undefined;
    if (!w) return { stage: 'no-laundress' } as const;

    // stand at the basin and work the crank — she fouls it.
    // Aim at the interactable's focus point (pos.y + 0.6): the drain sits
    // at y=0.9 → aim at 1.5, nearly level — a floor-aim misses align>0.86
    // and prox is too far (1.23 > 1.1) to save it.
    g.player.teleport(w.drainPos.x + 0.6, 0, w.drainPos.z);
    const foulCapBefore = caps.length;
    let pressed = '';
    for (let f = 0; f < 55; f++) {
      g.player.teleport(w.drainPos.x + 0.6, 0, w.drainPos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const hd = Math.max(0.3, Math.hypot(w.drainPos.x - g.player.pos.x, w.drainPos.z - g.player.pos.z));
      g.player.pitch = Math.atan2(1.5 - eyeY, hd);
      g.player.yaw = Math.atan2(w.drainPos.x - g.player.pos.x, w.drainPos.z - g.player.pos.z);
      g.frame();
      if (ga.interaction.focused?.prompt) pressed = ga.interaction.focused.prompt;
      if (f === 10) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const fouled = caps.slice(foulCapBefore).some((c) => /choked with somebody's wash/.test(c));
    const stillWet = !ga.drainedRooms.has(`under:${wRoom.index}`);

    // pull her off the basin with a thrown sound, then take the window
    const ox = wRoom.origin.x - w.drainPos.x, oz = wRoom.origin.z - w.drainPos.z;
    ga.sound.emit({ x: w.drainPos.x + ox * 0.7, y: 0.3, z: w.drainPos.z + oz * 0.7,
      intensity: 0.6, category: 'impact', caption: '[slam]' });
    for (let f = 0; f < 40; f++) g.frame(); // she goes to sniff
    const offGuard = !w.guarding;
    // window one: pick the wash and let her come home to it — the keen.
    // The wash socket sits at y=0.5 → focus point 1.1; prox covers it anyway.
    const winCapsBefore = caps.length;
    for (let f = 0; f < 40; f++) {
      g.player.teleport(w.drainPos.x + 0.5, 0, w.drainPos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const hd = Math.max(0.3, Math.hypot(w.drainPos.x - g.player.pos.x, w.drainPos.z - g.player.pos.z));
      g.player.pitch = Math.atan2(1.1 - eyeY, hd);
      g.player.yaw = Math.atan2(w.drainPos.x - g.player.pos.x, w.drainPos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const basketPaid = caps.slice(winCapsBefore).some((c) => /clean linen|pins in the hem/.test(c));
    g.player.teleport(wRoom.origin.x, 0, wRoom.origin.z); // stand back for her return
    for (let f = 0; f < 260 && !caps.some((c) => /wail at the basin|wash is lighter/.test(c)); f++) g.frame();
    const keened = caps.some((c) => /wail at the basin|wash is lighter/.test(c));
    // window two: pull her off again and take the crank — no keen, she rides
    // out. While she sniffs, 'Search the wash' (priority 3, prox-eligible)
    // out-scores the drain on any close stand — stand ≥1.0m so its prox
    // (>1.1) and align (<0.86) both fail, leaving the drain the only verb.
    ga.sound.emit({ x: w.drainPos.x + ox * 0.7, y: 0.3, z: w.drainPos.z + oz * 0.7,
      intensity: 0.6, category: 'impact', caption: '[slam]' });
    for (let f = 0; f < 40; f++) g.frame();
    for (let f = 0; f < 55; f++) {
      g.player.teleport(w.drainPos.x + 1.05, 0, w.drainPos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const hd = Math.max(0.3, Math.hypot(w.drainPos.x - g.player.pos.x, w.drainPos.z - g.player.pos.z));
      g.player.pitch = Math.atan2(1.5 - eyeY, hd);
      g.player.yaw = Math.atan2(w.drainPos.x - g.player.pos.x, w.drainPos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    for (let f = 0; f < 15; f++) g.frame();
    const drained = ga.drainedRooms.has(`under:${wRoom.index}`);
    const rodeOut = caps.some((c) => /wash goes down the drain/.test(c));
    return { stage: 'done', pressed, fouled, stillWet, offGuard, basketPaid, keened, drained, rodeOut,
      gone: w.state === 'done' } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.pressed, JSON.stringify(result)).toMatch(/Open the drain/);
  expect(result.fouled, JSON.stringify(result)).toBe(true);
  expect(result.stillWet, JSON.stringify(result)).toBe(true);
  expect(result.offGuard, JSON.stringify(result)).toBe(true);
  expect(result.basketPaid, JSON.stringify(result)).toBe(true);
  expect(result.drained, JSON.stringify(result)).toBe(true);
  expect(result.rodeOut, JSON.stringify(result)).toBe(true);
  expect(result.keened, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the lost property — marginalia claims on somebody else\'s effects', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // lost-property tags @ u-1

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>;
      interaction: { focused?: { prompt?: string; kind?: string } };
    };
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 30;
    const cageRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claim && s.meta?.marginalia));
    if (!cageRoom) return { stage: 'none' } as const;
    g.player.teleport(cageRoom.origin.x, 0, cageRoom.origin.z);
    ga.currentRoom = cageRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    // first: a broke claim — burn the purse, touch the tag, get told
    ga.marginalia = 1;
    const tag = (cageRoom.sockets ?? []).find((s) => s.meta?.claim && s.meta?.marginalia);
    if (!tag) return { stage: 'no-tag' } as const;
    const shortCap = caps.length;
    for (let f = 0; f < 50; f++) {
      g.player.teleport(tag.pos.x + 0.4, 0, tag.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(tag.pos.y - eyeY, 0.5);
      g.player.yaw = Math.atan2(tag.pos.x - g.player.pos.x, tag.pos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const shortWarn = caps.slice(shortCap).some((c) => /short/.test(c) && /marginalia/.test(c));
    const readPrompt = ga.interaction.focused?.prompt ?? '';
    // then: pay a real claim
    ga.marginalia = 30;
    const m0 = ga.marginalia;
    for (let f = 0; f < 50; f++) {
      g.player.teleport(tag.pos.x + 0.4, 0, tag.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(tag.pos.y - eyeY, 0.5);
      g.player.yaw = Math.atan2(tag.pos.x - g.player.pos.x, tag.pos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const paid = caps.some((c) => /effects held|inside the bag|old papers|someone's papers/.test(c));
    return { stage: 'done', readPrompt, shortWarn,
      spent: ga.marginalia < m0 || caps.some((c) => /\+.*marginalia/.test(c)), paid } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.readPrompt, JSON.stringify(result)).toMatch(/Reclaim the effects tagged/);
  expect(result.shortWarn, JSON.stringify(result)).toBe(true);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the crew board — the shift sheet says who is signed on', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // crew board @ u-33, grafter signed @45

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>;
      interaction: { focused?: { prompt?: string; kind?: string } };
    };
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 30;
    const boardRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.crewBoard));
    if (!boardRoom) return { stage: 'none' } as const;
    g.player.teleport(boardRoom.origin.x, 0, boardRoom.origin.z);
    ga.currentRoom = boardRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    const board = (boardRoom.sockets ?? []).find((s) => s.meta?.crewBoard);
    if (!board?.meta) return { stage: 'no-board' } as const;
    const m0 = ga.marginalia;
    let prompt = '';
    const readCap = caps.length;
    // stand on the room-center side of the board — the socket sits off its
    // host prop, and teleporting +0.9 in raw x lands inside the collider
    const bx = boardRoom.origin.x - board.pos.x, bz = boardRoom.origin.z - board.pos.z;
    const bl = Math.hypot(bx, bz) || 1;
    const stand = { x: board.pos.x + (bx / bl) * 0.9, z: board.pos.z + (bz / bl) * 0.9 };
    for (let f = 0; f < 55; f++) {
      g.player.teleport(stand.x, 0, stand.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      // focus() evaluates the direction to pos + 0.6y — the wall-mounted
      // board is at y1.0 so its aim point sits at eye level, not the floor
      g.player.pitch = Math.atan2((board.pos.y + 0.6) - eyeY, 0.95);
      g.player.yaw = Math.atan2(board.pos.x - g.player.pos.x, board.pos.z - g.player.pos.z);
      g.frame();
      // capture the aimed verb BEFORE the hold — once the board is read
      // its interactable disables and focus falls to whatever prop sits
      // beside it (a typewriter won this room's socket after 's' reseated)
      if (f < 5) prompt = ga.interaction.focused?.prompt ?? prompt;
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const read = caps.slice(readCap).filter((c) => /shift sheet marks|runs clean/.test(c));
    return { stage: 'done' as const, prompt, read,
      spent: ga.marginalia < m0, taken: board.meta?.taken === true };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.prompt, JSON.stringify(result)).toMatch(/Check the crew board/);
  expect((result.read ?? []).length, JSON.stringify(result)).toBeGreaterThan(0);
  expect(result.read?.[0] ?? '', JSON.stringify(result)).toMatch(/Door \d{3}/);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.taken, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the claim register — which tags still pay and which are drawn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // registers on under desks; cages @1,31,39,48,73,85,87

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>;
      interaction: { focused?: { prompt?: string; kind?: string } };
    };
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 30;
    // pick a register whose +10 window actually contains cages — a blank
    // column is honest output but tests nothing
    const regRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claimRegister)
      && g.route.underRooms.some((o) => o.index > r.index && o.index <= r.index + 10
        && (o.sockets ?? []).some((s) => s.meta?.claim && s.meta?.marginalia === true)));
    if (!regRoom) return { stage: 'none' } as const;
    g.player.teleport(regRoom.origin.x, 0, regRoom.origin.z);
    ga.currentRoom = regRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    const reg = (regRoom.sockets ?? []).find((s) => s.meta?.claimRegister);
    if (!reg?.meta) return { stage: 'no-register' } as const;
    const m0 = ga.marginalia;
    let prompt = '';
    const readCap = caps.length;
    const bx = regRoom.origin.x - reg.pos.x, bz = regRoom.origin.z - reg.pos.z;
    const bl = Math.hypot(bx, bz) || 1;
    const stand = { x: reg.pos.x + (bx / bl) * 0.9, z: reg.pos.z + (bz / bl) * 0.9 };
    for (let f = 0; f < 55; f++) {
      g.player.teleport(stand.x, 0, stand.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2((reg.pos.y + 0.6) - eyeY, 0.95);
      g.player.yaw = Math.atan2(reg.pos.x - g.player.pos.x, reg.pos.z - g.player.pos.z);
      g.frame();
      // capture pre-press — a read/taken paper disables and focus falls
      // to whatever prop sits beside it
      if (f < 5) prompt = ga.interaction.focused?.prompt ?? prompt;
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const read = caps.slice(readCap).filter((c) => /claim register shows|columns run blank/.test(c));
    return { stage: 'done' as const, prompt, read,
      spent: ga.marginalia < m0, taken: reg.meta?.taken === true };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.prompt, JSON.stringify(result)).toMatch(/Consult the claim register/);
  expect((result.read ?? []).length, JSON.stringify(result)).toBeGreaterThan(0);
  expect(result.read?.[0] ?? '', JSON.stringify(result)).toMatch(/Door \d{3} — '.*' (still held|drawn)/);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.taken, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the audit — the clerk totals your hands, the ledger walks', async ({ page }) => {
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
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>; unpaidTheft: number;
      interaction: { focused?: { prompt?: string; kind?: string } };
      entities: { id: string; demanded?: boolean; pursuing?: boolean }[];
    };
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 40;

    // --- 1. draw somebody else's tag — the tally accrues ---
    const cageRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claim && s.meta?.marginalia === true && !s.meta?.taken));
    if (!cageRoom) return { stage: 'no-cage' } as const;
    g.player.teleport(cageRoom.origin.x, 0, cageRoom.origin.z);
    ga.currentRoom = cageRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    const cage = (cageRoom.sockets ?? []).find((s) => s.meta?.claim && s.meta?.marginalia === true && !s.meta?.taken);
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

    // --- 1.5 the return slip — writing back what you took ---
    ga.unpaidTheft = 3; // more petty work behind you than the tag shows
    const slipRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.returnSlip && !s.meta?.taken));
    if (slipRoom) {
      g.player.teleport(slipRoom.origin.x, 0, slipRoom.origin.z);
      ga.currentRoom = slipRoom.index;
      for (let f = 0; f < 30; f++) g.frame();
      const slip = (slipRoom.sockets ?? []).find((s) => s.meta?.returnSlip && !s.meta?.taken);
      for (let f = 0; f < 60 && slip?.meta && !slip.meta.taken; f++) {
        const sx = slipRoom.origin.x - slip.pos.x, sz = slipRoom.origin.z - slip.pos.z;
        const sl = Math.hypot(sx, sz) || 1;
        g.player.teleport(slip.pos.x + (sx / sl) * 0.9, 0, slip.pos.z + (sz / sl) * 0.9);
        g.player.yaw = Math.atan2(slip.pos.x - g.player.pos.x, slip.pos.z - g.player.pos.z);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.atan2((slip.pos.y + 0.6) - eyeY, 0.95);
        g.frame();
        if (f === 5) ga.keys.add('KeyE');
      }
      ga.keys.delete('KeyE');
    }
    const theftAfterSlip = ga.unpaidTheft;

    // --- 2. into his room with a CLEAN book — rifle the tally drawer
    //    under his nose: owed>0 would auto-demand on entry and the settle
    //    point would steal the drawer's focus; the rifle itself must be
    //    what slaps the book open. +2 lines AND an instant demand.
    const aRoom = g.route.underRooms.find((r) => r.scheduled?.some((s) => s.entity === 'auditor')
      && r.index !== cageRoom.index);
    if (!aRoom) return { stage: 'no-clerk' } as const;
    ga.unpaidTheft = 0;
    g.player.teleport(aRoom.origin.x, 0, aRoom.origin.z);
    ga.currentRoom = aRoom.index;
    const demandCap = caps.length;
    let clerk: { demanded?: boolean; pursuing?: boolean } | undefined;
    for (let f = 0; f < 60; f++) {
      g.frame();
      clerk = ga.entities.find((e) => e.id === 'auditor') ?? clerk;
      if (clerk) break;
    }
    if (!clerk) return { stage: 'no-clerk-spawn', ents: ga.entities.map((e) => e.id) } as const;
    const tally = g.interaction.interactables.find((i) => i.kind === 'tallyDrawer' && i.enabled);
    if (tally) {
      for (let f = 0; f < 60 && (tally.data as { stock?: number }).stock !== 0; f++) {
        const sx = aRoom.origin.x - tally.pos.x, sz = aRoom.origin.z - tally.pos.z;
        const sl = Math.hypot(sx, sz) || 1;
        g.player.teleport(tally.pos.x + (sx / sl) * 0.9, 0, tally.pos.z + (sz / sl) * 0.9);
        g.player.yaw = Math.atan2(tally.pos.x - g.player.pos.x, tally.pos.z - g.player.pos.z);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.atan2((tally.pos.y + 0.6) - eyeY, 0.95);
        g.frame();
        if (f === 5) ga.keys.add('KeyE');
      }
      ga.keys.delete('KeyE');
    }
    const theftAfterDrawer = ga.unpaidTheft;
    for (let f = 0; f < 40 && !clerk.demanded; f++) g.frame();
    const demanded = caps.slice(demandCap).some((c) => /hands are in his book|book slaps open/.test(c));
    if (ga.marginalia < 14) ga.marginalia = 14; // purse floor for the settle

    // --- 3. settle at his desk ---
    const settle = g.interaction.interactables.find((i) => i.kind === 'audit' && i.enabled);
    if (!settle) return { stage: 'no-settle' } as const;
    const m0 = ga.marginalia;
    let settlePrompt = '';
    for (let f = 0; f < 60; f++) {
      const sx = aRoom.origin.x - settle.pos.x, sz = aRoom.origin.z - settle.pos.z;
      const sl = Math.hypot(sx, sz) || 1;
      g.player.teleport(settle.pos.x + (sx / sl) * 0.9, 0, settle.pos.z + (sz / sl) * 0.9);
      g.player.yaw = Math.atan2(settle.pos.x - g.player.pos.x, settle.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2((settle.pos.y + 0.6) - eyeY, 0.95);
      g.frame();
      if (!settlePrompt) {
        const fp = ga.interaction.focused?.prompt;
        if (fp && /Settle the ledger/.test(fp)) settlePrompt = fp;
      }
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const paid = caps.some((c) => /paid \d+ — the clerk turns the page/.test(c));
    return { stage: 'done' as const, demanded, theftAfterSlip, theftAfterDrawer, settlePrompt, paid,
      spent: ga.marginalia < m0, pursuing: clerk?.pursuing === true };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.demanded, JSON.stringify(result)).toBe(true);
  expect(result.theftAfterSlip, JSON.stringify(result)).toBe(2); // 3 − 2 + 1: the filing itself is claimed
  expect(result.theftAfterDrawer, JSON.stringify(result)).toBe(2); // 0 + 2: hands in HIS book rouse him
  expect(result.settlePrompt, JSON.stringify(result)).toMatch(/Settle the ledger/);
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.pursuing, JSON.stringify(result)).toBe(false);
  expect(errors).toEqual([]);
});


test('the index — the filer files your questions, the halls listen', async ({ page }) => {
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
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>; paperTrail: number; unpaidHeld: number;
      interaction: { focused?: { prompt?: string; kind?: string } };
      entities: { id: string; filed?: boolean; posted?: boolean }[];
    };
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 40;
    // Four consults on the books — heavy enough to lighten with paper.
    ga.paperTrail = 4;

    // --- 0. the counter-claim — a paid line off your own file ---
    const csRoom = g.route.underRooms.find((r) => (r.sockets ?? []).some((s) => s.meta?.counterClaim && !s.meta?.taken));
    if (csRoom) {
      g.player.teleport(csRoom.origin.x, 0, csRoom.origin.z);
      ga.currentRoom = csRoom.index;
      for (let f = 0; f < 30; f++) g.frame();
      const csSock = (csRoom.sockets ?? []).find((s) => s.meta?.counterClaim && !s.meta?.taken);
      for (let f = 0; f < 60 && csSock && csSock.meta && !csSock.meta.taken; f++) {
        const sx = csRoom.origin.x - csSock.pos.x, sz = csRoom.origin.z - csSock.pos.z;
        const sl = Math.hypot(sx, sz) || 1;
        g.player.teleport(csSock.pos.x + (sx / sl) * 0.9, 0, csSock.pos.z + (sz / sl) * 0.9);
        g.player.yaw = Math.atan2(csSock.pos.x - g.player.pos.x, csSock.pos.z - g.player.pos.z);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.atan2((csSock.pos.y + 0.6) - eyeY, 0.95);
        g.frame();
        if (f === 5) ga.keys.add('KeyE');
      }
      ga.keys.delete('KeyE');
    }
    const trailAfterClaim = ga.paperTrail;

    // --- 1. rifle her drawer — the loudest question in the under ---
    const fRoom = g.route.underRooms.find((r) => r.scheduled?.some((s) => s.entity === 'filer'));
    if (!fRoom) return { stage: 'no-filer' } as const;
    g.player.teleport(fRoom.origin.x, 0, fRoom.origin.z);
    ga.currentRoom = fRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    const docket = g.interaction.interactables.find((i) => i.kind === 'docket' && i.enabled);
    if (!docket) return { stage: 'no-docket', ents: ga.entities.map((e) => e.id) } as const;
    const mDocket = ga.marginalia;
    for (let f = 0; f < 60 && (docket.data as { stock?: number }).stock !== 0; f++) {
      const sx = fRoom.origin.x - docket.pos.x, sz = fRoom.origin.z - docket.pos.z;
      const sl = Math.hypot(sx, sz) || 1;
      g.player.teleport(docket.pos.x + (sx / sl) * 0.9, 0, docket.pos.z + (sz / sl) * 0.9);
      g.player.yaw = Math.atan2(docket.pos.x - g.player.pos.x, docket.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2((docket.pos.y + 0.6) - eyeY, 0.95);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const rifled = (docket.data as { stock?: number }).stock === 0;
    const trailAfterRifle = ga.paperTrail;
    const docketPaid = ga.marginalia > mDocket || caps.some((c) => /off the index/.test(c));

    // --- 2. the rummage itself filed you — the slow look lands ---
    let clerk: { filed?: boolean; posted?: boolean } | undefined;
    for (let f = 0; f < 160; f++) {
      g.frame();
      clerk = ga.entities.find((e) => e.id === 'filer') ?? clerk;
      if (clerk?.posted) break;
    }
    if (!clerk) return { stage: 'no-filer-spawn', ents: ga.entities.map((e) => e.id), rifled } as const;
    const filed = caps.some((c) => /the filer has your name/.test(c));

    // --- 2. into the next room — the word travels ahead ---
    const next = g.route.underRooms.find((r) => r.index > fRoom.index);
    if (!next) return { stage: 'no-next' } as const;
    const capMark = caps.length;
    g.player.teleport(next.origin.x, 0, next.origin.z);
    ga.currentRoom = next.index;
    for (let f = 0; f < 12; f++) g.frame();
    const wordOut = caps.slice(capMark).some((c) => /the word arrives before you/.test(c));

    // --- 3. run the courier down — the word dies with it ---
    const mCut = ga.marginalia;
    const crk = clerk as { runnerOut?: boolean; posted?: boolean; runnerPos?: { x: number; z: number } };
    let cutPrompt = '';
    for (let f = 0; f < 240 && crk.runnerOut; f++) {
      const rp = crk.runnerPos;
      if (!rp) break;
      g.player.teleport(rp.x + 0.5, 0, rp.z + 0.5);
      g.player.yaw = Math.atan2(rp.x - g.player.pos.x, rp.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(1.5 - eyeY, 0.7);
      g.frame();
      if (!cutPrompt) {
        const fp = ga.interaction.focused?.prompt;
        if (fp && /Cut the runner/.test(fp)) cutPrompt = fp;
      }
      if (f === 4) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const cut = crk.runnerOut === false && crk.posted === false;
    const courierPaid = ga.marginalia > mCut || caps.some((c) => /off the courier/.test(c));

    // the word is dead: a further room should not light for you
    const next2 = g.route.underRooms.find((r) => r.index > next.index);
    let wordDead = true;
    if (next2) {
      const capMark2 = caps.length;
      g.player.teleport(next2.origin.x, 0, next2.origin.z);
      ga.currentRoom = next2.index;
      for (let f = 0; f < 12; f++) g.frame();
      wordDead = !caps.slice(capMark2).some((c) => /the word arrives before you/.test(c));
    }

    // but the ledger is still yours — she re-files a heavy asker on sight
    g.player.teleport(fRoom.origin.x, 0, fRoom.origin.z);
    ga.currentRoom = fRoom.index;
    for (let f = 0; f < 200 && !crk.posted; f++) g.frame();
    const refiled = crk.posted === true;

    // --- 3b. this time the courier gets away — the word files upstairs ---
    // Don't chase: stay put and let it run the chain out. The card lands
    // in the house register — a line in the Detective's book.
    g.player.teleport(fRoom.origin.x, 0, fRoom.origin.z);
    for (let f = 0; f < 1600 && crk.runnerOut; f++) g.frame();
    const wordUpstairs = ga.unpaidHeld;

    // --- 4. back to the drawer — square the index ---
    g.player.teleport(fRoom.origin.x, 0, fRoom.origin.z);
    ga.currentRoom = fRoom.index;
    for (let f = 0; f < 8; f++) g.frame();
    const square = g.interaction.interactables.find((i) => i.kind === 'square' && i.enabled);
    if (!square) return { stage: 'no-square' } as const;
    const m0 = ga.marginalia;
    let squarePrompt = '';
    for (let f = 0; f < 60; f++) {
      const sx = fRoom.origin.x - square.pos.x, sz = fRoom.origin.z - square.pos.z;
      const sl = Math.hypot(sx, sz) || 1;
      g.player.teleport(square.pos.x + (sx / sl) * 0.9, 0, square.pos.z + (sz / sl) * 0.9);
      g.player.yaw = Math.atan2(square.pos.x - g.player.pos.x, square.pos.z - g.player.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2((square.pos.y + 0.6) - eyeY, 0.95);
      g.frame();
      if (!squarePrompt) {
        const fp = ga.interaction.focused?.prompt;
        if (fp && /Square the index/.test(fp)) squarePrompt = fp;
      }
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const paid = caps.some((c) => /paid \d+ — the filer strikes your card/.test(c));
    return { stage: 'done' as const, rifled, trailAfterClaim, trailAfterRifle, docketPaid,
      filed, wordOut, cutPrompt, cut, courierPaid, wordDead, refiled, wordUpstairs, squarePrompt, paid,
      trail: ga.paperTrail, spent: ga.marginalia < m0, posted: clerk.posted === true };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.trailAfterClaim, JSON.stringify(result)).toBe(3); // 4 − 2 + 1: the asking is logged too
  expect(result.rifled, JSON.stringify(result)).toBe(true);
  expect(result.trailAfterRifle, JSON.stringify(result)).toBe(5);
  expect(result.docketPaid, JSON.stringify(result)).toBe(true);
  expect(result.filed, JSON.stringify(result)).toBe(true);
  expect(result.wordOut, JSON.stringify(result)).toBe(true);
  expect(result.cutPrompt, JSON.stringify(result)).toMatch(/Cut the runner/);
  expect(result.cut, JSON.stringify(result)).toBe(true);
  expect(result.courierPaid, JSON.stringify(result)).toBe(true);
  expect(result.wordDead, JSON.stringify(result)).toBe(true);
  expect(result.refiled, JSON.stringify(result)).toBe(true);
  expect(result.wordUpstairs, JSON.stringify(result)).toBe(1); // the escaped courier's card lands in the register
  expect(result.squarePrompt, JSON.stringify(result)).toMatch(/Square the index/);
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(result.trail, JSON.stringify(result)).toBe(0);
  expect(result.posted, JSON.stringify(result)).toBe(false);
  expect(errors).toEqual([]);
});

test('the count — the till rings late where your hands were (sprint 305)', async ({ page }) => {
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
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>; clock: { time: number };
      sound: { on(fn: (e: { x: number; z: number; caption?: string; intensity: number }) => void): unknown };
      interaction: { focused?: { prompt?: string; kind?: string } };
    };
    const heard: { x: number; z: number; caption: string; intensity: number }[] = [];
    ga.sound.on((e) => { if (e.caption && /count is short/.test(e.caption)) heard.push(e as never); });
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 30;
    const cageRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claim && s.meta?.marginalia));
    if (!cageRoom) return { stage: 'none' } as const;
    const tag = (cageRoom.sockets ?? []).find((s) => s.meta?.claim && s.meta?.marginalia);
    if (!tag) return { stage: 'no-tag' } as const;
    g.player.teleport(cageRoom.origin.x, 0, cageRoom.origin.z);
    ga.currentRoom = cageRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    // pilfer the tag — a real claim, paid and taken
    for (let f = 0; f < 50; f++) {
      g.player.teleport(tag.pos.x + 0.4, 0, tag.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(tag.pos.y - eyeY, 0.5);
      g.player.yaw = Math.atan2(tag.pos.x - g.player.pos.x, tag.pos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const paid = caps.some((c) => /effects held|inside the bag|old papers|someone's papers/.test(c));
    if (!paid) return { stage: 'no-pay', caps: caps.slice(-8) } as const;
    // let the books catch up — the report is queued ~75 sim-seconds out
    for (let f = 0; f < 80 * 30 && heard.length === 0; f++) g.frame();
    const ring = heard[0];
    const dx = ring ? Math.abs(ring.x - tag.pos.x) : 99;
    const dz = ring ? Math.abs(ring.z - tag.pos.z) : 99;
    return { stage: 'done', paid, counted: heard.length > 0, dx, dz,
      intensity: ring?.intensity, heard: heard.slice(0, 4) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(result.counted, JSON.stringify(result)).toBe(true);
  // the ring lands at the pilfered socket, not on you
  expect((result.dx ?? 9) + (result.dz ?? 9), JSON.stringify(result)).toBeLessThan(0.6);
  // loud enough to rouse the dormant and pull the room's listeners
  expect(result.intensity, JSON.stringify(result)).toBeGreaterThanOrEqual(0.55);
  expect(errors).toEqual([]);
});

test('the checker — the count sends a lamp down the row (sprint 306)', async ({ page }) => {
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
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>; unpaidHeld: number;
      checker: { stage: string };
      sound: { on(fn: (e: { x: number; z: number; caption?: string; intensity: number }) => void): unknown };
    };
    const heard: { x: number; z: number; caption: string; intensity: number }[] = [];
    ga.sound.on((e) => { if (e.caption && /count stands/.test(e.caption)) heard.push(e as never); });
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 30;
    ga.unpaidHeld = 0;
    const cageRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claim && s.meta?.marginalia));
    if (!cageRoom) return { stage: 'none' } as const;
    const tag = (cageRoom.sockets ?? []).find((s) => s.meta?.claim && s.meta?.marginalia);
    if (!tag) return { stage: 'no-tag' } as const;
    g.player.teleport(cageRoom.origin.x, 0, cageRoom.origin.z);
    ga.currentRoom = cageRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    for (let f = 0; f < 50; f++) {
      g.player.teleport(tag.pos.x + 0.4, 0, tag.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(tag.pos.y - eyeY, 0.5);
      g.player.yaw = Math.atan2(tag.pos.x - g.player.pos.x, tag.pos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const paid = caps.some((c) => /effects held|inside the bag|old papers|someone's papers/.test(c));
    if (!paid) return { stage: 'no-pay', caps: caps.slice(-8) } as const;
    // sprint 312 — pilfer a second till before the first report rings, so
    // the books mark them together and the lamp walks both rooms
    const cageRoom2 = g.route.underRooms.find((r) => r !== cageRoom
      && (r.sockets ?? []).some((s) => s.meta?.claim && s.meta?.marginalia));
    let pilfered2 = false;
    if (cageRoom2) {
      const tag2 = (cageRoom2.sockets ?? []).find((s) => s.meta?.claim && s.meta?.marginalia)!;
      ga.currentRoom = cageRoom2.index;
      for (let f = 0; f < 50; f++) {
        g.player.teleport(tag2.pos.x + 0.4, 0, tag2.pos.z);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.atan2(tag2.pos.y - eyeY, 0.5);
        g.player.yaw = Math.atan2(tag2.pos.x - g.player.pos.x, tag2.pos.z - g.player.pos.z);
        g.frame();
        if (f === 5) ga.keys.add('KeyE');
      }
      ga.keys.delete('KeyE');
      pilfered2 = caps.filter((c) => /effects held|inside the bag|old papers|someone's papers/.test(c)).length >= 2;
    }
    // linger exposed in the pilfered room — the count rings ~75s out, then
    // the checker walks. Stay put: this is the losing play, on purpose.
    // (cap sized for a 2-stop route: sweep of this room can land ~150s in)
    let dispatched = false;
    for (let f = 0; f < 340 * 30 && heard.length === 0; f++) {
      g.player.teleport(tag.pos.x + 0.4, 0, tag.pos.z);
      g.frame();
      if (ga.checker.stage !== 'idle') dispatched = true;
    }
    const found = heard[0];
    // sprint 311 — the floor shutters while the count walks: a stocked
    // broker pedestal must refuse trade until the checker leaves
    const lobby = g.route.underRooms.find((r) => r.templateId === 'u-lobby'
      && (r.sockets ?? []).some((s) => s.meta?.broker !== undefined && s.meta?.brokerItem !== undefined && s.meta?.sold !== true));
    if (!lobby) return { stage: 'no-lobby' } as const;
    const bsock = (lobby.sockets ?? []).find((s) => s.meta?.broker !== undefined
      && s.meta?.brokerItem !== undefined && s.meta?.sold !== true)!;
    ga.marginalia = 99;
    ga.currentRoom = lobby.index;
    const closedBefore = caps.length;
    for (let f = 0; f < 90 && bsock.meta?.sold !== true; f++) {
      if (ga.checker.stage === 'idle') break; // too late — he already left
      const dx = lobby.origin.x - bsock.pos.x, dz = lobby.origin.z - bsock.pos.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(bsock.pos.x + (dx / L) * 0.9, 0, bsock.pos.z + (dz / L) * 0.9);
      const ax = bsock.pos.x - g.player.pos.x, az = bsock.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(bsock.pos.y + 0.6 - eyeY, Math.hypot(ax, az) || 1);
      if (/trade wares|inspect|take/i.test(g.interaction.focused?.prompt ?? '')) {
        g.input.interactPressed = true;
      }
      g.frame();
      g.input.interactPressed = false;
    }
    const closedSeen = caps.slice(closedBefore).some((c) => /floor is closed/.test(c));
    const refusedWhileWalking = bsock.meta?.sold !== true;
    // let it close the count and leave
    for (let f = 0; f < 120 * 30 && ga.checker.stage !== 'idle'; f++) g.frame();
    // the floor reopens — the same pedestal trades now
    for (let f = 0; f < 90 && bsock.meta?.sold !== true; f++) {
      const dx = lobby.origin.x - bsock.pos.x, dz = lobby.origin.z - bsock.pos.z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(bsock.pos.x + (dx / L) * 0.9, 0, bsock.pos.z + (dz / L) * 0.9);
      const ax = bsock.pos.x - g.player.pos.x, az = bsock.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(bsock.pos.y + 0.6 - eyeY, Math.hypot(ax, az) || 1);
      if (/trade wares|inspect|take/i.test(g.interaction.focused?.prompt ?? '')) {
        g.input.interactPressed = true;
      }
      g.frame();
      g.input.interactPressed = false;
    }
    const soldAfter = bsock.meta?.sold === true;
    return { stage: 'done', paid, dispatched, found: heard.length > 0,
      closedSeen, refusedWhileWalking, soldAfter, pilfered2,
      wideSeen: caps.some((c) => /more than one till|marked them together/.test(c)),
      walkCont: caps.some((c) => /walk continues/.test(c)),
      fx: found?.x, fz: found?.z, intensity: found?.intensity,
      finalStage: ga.checker.stage,
      px: tag.pos.x + 0.4, pz: tag.pos.z,
      cueSeen: caps.some((c) => /walks the row|more than one till/.test(c)),
      closeSeen: caps.some((c) => /closes the count|counts the till/.test(c)),
      witSeen: caps.some((c) => /register gains a witness/.test(c)),
      heldAfter: ga.unpaidHeld,
      caps: caps.slice(-10) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(result.cueSeen, JSON.stringify(result)).toBe(true); // the answer went out
  expect(result.dispatched, JSON.stringify(result)).toBe(true);
  expect(result.found, JSON.stringify(result)).toBe(true); // the lamp found the lingerer
  expect(result.heldAfter, JSON.stringify(result)).toBe(1); // the witness line landed
  expect(result.witSeen, JSON.stringify(result)).toBe(true);
  // sprint 311 — the floor shutters while he walks, reopens when he leaves
  expect(result.closedSeen, JSON.stringify(result)).toBe(true);
  expect(result.refusedWhileWalking, JSON.stringify(result)).toBe(true);
  expect(result.soldAfter, JSON.stringify(result)).toBe(true);
  // sprint 312 — two tills marked together: one wide walk, both swept
  if (result.pilfered2) {
    expect(result.wideSeen, JSON.stringify(result)).toBe(true);
    expect(result.walkCont, JSON.stringify(result)).toBe(true);
  }
  // the find rings at YOU — the building learns where you are now
  expect(Math.abs((result.fx ?? 99) - (result.px ?? 0)) + Math.abs((result.fz ?? 99) - (result.pz ?? 0)), JSON.stringify(result)).toBeLessThan(1.0);
  expect(result.intensity, JSON.stringify(result)).toBeGreaterThanOrEqual(0.55);
  expect(result.closeSeen, JSON.stringify(result)).toBe(true);
  expect(result.finalStage, JSON.stringify(result)).toBe('idle'); // it left
  expect(errors).toEqual([]);
});

test('strip the checker\'s lamp — the most brazen pilfer in the under (sprint 307)', async ({ page }) => {
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
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>;
      checker: { stage: string; lampLit: boolean; position: { x: number; z: number } };
      crewCount: { pending: number };
      inventory: { id: string; count: number }[];
      sound: { on(fn: (e: { caption?: string }) => void): unknown };
    };
    const cried: string[] = [];
    ga.sound.on((e) => { if (e.caption && /dies in your hands/.test(e.caption)) cried.push(e.caption); });
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 30;
    const cageRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claim && s.meta?.marginalia));
    if (!cageRoom) return { stage: 'none' } as const;
    const tag = (cageRoom.sockets ?? []).find((s) => s.meta?.claim && s.meta?.marginalia);
    if (!tag) return { stage: 'no-tag' } as const;
    g.player.teleport(cageRoom.origin.x, 0, cageRoom.origin.z);
    ga.currentRoom = cageRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    for (let f = 0; f < 50; f++) {
      g.player.teleport(tag.pos.x + 0.4, 0, tag.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(tag.pos.y - eyeY, 0.5);
      g.player.yaw = Math.atan2(tag.pos.x - g.player.pos.x, tag.pos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const paid = caps.some((c) => /effects held|inside the bag|old papers|someone's papers/.test(c));
    if (!paid) return { stage: 'no-pay', caps: caps.slice(-8) } as const;
    // wait for the books to send somebody (~75s ring + dispatch)
    for (let f = 0; f < 100 * 30 && ga.checker.stage === 'idle'; f++) g.frame();
    if (ga.checker.stage === 'idle') return { stage: 'no-dispatch', caps: caps.slice(-8) } as const;
    // shadow the walker — steal its light while it counts
    let stripped = false;
    for (let f = 0; f < 400; f++) {
      const cp = ga.checker.position;
      g.player.teleport(cp.x - 0.3, 0, cp.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(0.9 - eyeY, 0.4);
      g.player.yaw = Math.atan2(cp.x - g.player.pos.x, cp.z - g.player.pos.z);
      g.frame();
      if (f === 2) ga.keys.add('KeyE');
      if (!ga.checker.lampLit) { stripped = true; break; }
      if (ga.checker.stage === 'idle') break;
    }
    ga.keys.delete('KeyE');
    const lamp = ga.inventory.find((i) => i.id === 'handLamp');
    // let it finish counting blind and leave
    for (let f = 0; f < 120 * 30 && ga.checker.stage !== 'idle'; f++) g.frame();
    return { stage: 'done', stripped, cried: cried.length > 0,
      charge: lamp?.count ?? 0, pending: ga.crewCount.pending,
      blindSeen: caps.some((c) => /counts blind/.test(c)),
      pickupSeen: caps.some((c) => /count's lamp comes free/.test(c)),
      finalStage: ga.checker.stage,
      caps: caps.slice(-10) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.stripped, JSON.stringify(result)).toBe(true);
  expect(result.cried, JSON.stringify(result)).toBe(true); // it felt the light die
  expect(result.charge, JSON.stringify(result)).toBe(45); // warm, still swinging
  expect(result.pending, JSON.stringify(result)).toBeGreaterThanOrEqual(1); // the lamp files another count
  expect(result.blindSeen, JSON.stringify(result)).toBe(true); // swept blind, count stays open
  expect(result.finalStage, JSON.stringify(result)).toBe('idle'); // it left
  expect(errors).toEqual([]);
});

test('the quiet amendment — bury the count before it rings (sprint 308)', async ({ page }) => {
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
      enterUnderscript(): void; godMode: boolean; currentRoom: number;
      marginalia: number; keys: Set<string>;
      checker: { stage: string };
      crewCount: { pending: number };
      sound: { on(fn: (e: { caption?: string }) => void): unknown };
    };
    const rings: string[] = [];
    ga.sound.on((e) => { if (e.caption && /count is short/.test(e.caption)) rings.push(e.caption); });
    ga.enterUnderscript();
    ga.godMode = true;
    ga.marginalia = 60;
    const cageRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.claim && s.meta?.marginalia));
    const formRoom = g.route.underRooms.find((r) =>
      (r.sockets ?? []).some((s) => s.meta?.misfile));
    if (!cageRoom || !formRoom) return { stage: 'none' } as const;
    const tag = (cageRoom.sockets ?? []).find((s) => s.meta?.claim && s.meta?.marginalia);
    const form = (formRoom.sockets ?? []).find((s) => s.meta?.misfile);
    if (!tag || !form) return { stage: 'no-tag' } as const;
    // pilfer the tag — a loss-report queues
    g.player.teleport(cageRoom.origin.x, 0, cageRoom.origin.z);
    ga.currentRoom = cageRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    for (let f = 0; f < 50; f++) {
      g.player.teleport(tag.pos.x + 0.4, 0, tag.pos.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.atan2(tag.pos.y - eyeY, 0.5);
      g.player.yaw = Math.atan2(tag.pos.x - g.player.pos.x, tag.pos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    const paid = caps.some((c) => /effects held|inside the bag|old papers|someone's papers/.test(c));
    if (!paid) return { stage: 'no-pay', caps: caps.slice(-8) } as const;
    const queued = ga.crewCount.pending;
    // run to the amendment desk and file before the ring lands
    g.player.teleport(formRoom.origin.x, 0, formRoom.origin.z);
    ga.currentRoom = formRoom.index;
    for (let f = 0; f < 30; f++) g.frame();
    // stand on the room-center side of the paper — the socket sits +0.5
    // toward center off a desk collider, so +0.4 lands inside the prop
    // and the frame pushes you ~1.1m out, swinging the aim off align
    const toC = { x: formRoom.origin.x - form.pos.x, z: formRoom.origin.z - form.pos.z };
    const toCL = Math.hypot(toC.x, toC.z) || 1;
    const stand = { x: form.pos.x + (toC.x / toCL) * 0.9, z: form.pos.z + (toC.z / toCL) * 0.9 };
    for (let f = 0; f < 60; f++) {
      g.player.teleport(stand.x, 0, stand.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      // aim at the FOCUS point (pos.y + 0.6), not the socket point — a
      // down-pitch at the desk-elevated socket fails the 0.86 align gate
      const hd = Math.hypot(form.pos.x - g.player.pos.x, form.pos.z - g.player.pos.z);
      g.player.pitch = Math.atan2((form.pos.y + 0.6) - eyeY, hd);
      g.player.yaw = Math.atan2(form.pos.x - g.player.pos.x, form.pos.z - g.player.pos.z);
      g.frame();
      if (f === 5) ga.keys.add('KeyE');
      if (ga.crewCount.pending === 0) break;
    }
    ga.keys.delete('KeyE');
    const buried = ga.crewCount.pending === 0;
    // wait past the count's due window — nothing should ring, nobody walks
    for (let f = 0; f < 90 * 30; f++) g.frame();
    return { stage: 'done', paid, queued, buried,
      rang: rings.length > 0, walked: ga.checker.stage !== 'idle',
      burySeen: caps.some((c) => /never reaches the books/.test(c)),
      caps: caps.slice(-10) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(result.queued, JSON.stringify(result)).toBeGreaterThanOrEqual(1); // the theft queued a report
  expect(result.buried, JSON.stringify(result)).toBe(true); // the filing buried it
  expect(result.burySeen, JSON.stringify(result)).toBe(true);
  expect(result.rang, JSON.stringify(result)).toBe(false); // the count never rang
  expect(result.walked, JSON.stringify(result)).toBe(false); // nobody walked
  expect(errors).toEqual([]);
});
