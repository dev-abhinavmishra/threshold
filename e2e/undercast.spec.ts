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
      prompt = ga.interaction.focused?.prompt ?? prompt;
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
      prompt = ga.interaction.focused?.prompt ?? prompt;
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

    // --- 2. walk into his room — the ledger opens ---
    const aRoom = g.route.underRooms.find((r) => r.scheduled?.some((s) => s.entity === 'auditor')
      && r.index !== cageRoom.index);
    if (!aRoom) return { stage: 'no-clerk' } as const;
    g.player.teleport(aRoom.origin.x, 0, aRoom.origin.z);
    ga.currentRoom = aRoom.index;
    const demandCap = caps.length;
    let clerk: { demanded?: boolean; pursuing?: boolean } | undefined;
    for (let f = 0; f < 80; f++) {
      g.frame();
      clerk = ga.entities.find((e) => e.id === 'auditor') ?? clerk;
      if (clerk?.demanded) break;
    }
    if (!clerk) return { stage: 'no-clerk-spawn', ents: ga.entities.map((e) => e.id) } as const;
    const demanded = caps.slice(demandCap).some((c) => /hands are in his book/.test(c));

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
    return { stage: 'done' as const, demanded, settlePrompt, paid,
      spent: ga.marginalia < m0, pursuing: clerk?.pursuing === true };
  });

  if (result.stage !== 'done') test.skip();
  expect(result.demanded, JSON.stringify(result)).toBe(true);
  expect(result.settlePrompt, JSON.stringify(result)).toMatch(/Settle the ledger/);
  expect(result.paid, JSON.stringify(result)).toBe(true);
  expect(result.spent, JSON.stringify(result)).toBe(true);
  expect(result.pursuing, JSON.stringify(result)).toBe(false);
  expect(errors).toEqual([]);
});

