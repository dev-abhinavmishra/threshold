import { test, expect } from '@playwright/test';
import { seededRun, ThresholdG } from './harness';

test.setTimeout(300_000);

// The hazard ecology: flooded-water entity + the sign system — swamper,
// submerged wires, the cut verb, and the hunters that read evidence.
test('the swamper answers stirred water — the drain takes its medium', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's': flooded u-3/24/48; swamper scheduled on u-24

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; currentRoom: number; godMode: boolean;
      entities: { id: string; state: string; threatPos(): { x: number; z: number } }[];
      spawnScheduled(): void;
      drainedRooms: Set<string>;
    };

    ga.enterUnderscript();
    const room = g.route.underRooms.find((r) => r.flooded && r.scheduled?.some((s) => s.entity === 'swamper'));
    if (!room) return { stage: 'no-swamper-room' } as const;

    // Wade in — it rises in the far corner.
    g.player.teleport(room.origin.x, 0, room.origin.z);
    ga.currentRoom = room.index;
    ga.godMode = false;
    for (let f = 0; f < 40; f++) g.frame();
    const ent = ga.entities.find((e) => e.id === 'swamper');
    if (!ent) return { stage: 'not-spawned' } as const;

    // Stir the flood: upright wading splashes pull it in — and it takes the
    // stirring thing.
    const hp0 = g.player.health;
    g.keys.add('KeyW');
    let closeSeen = false;
    for (let f = 0; f < 400; f++) {
      g.frame();
      const tp = ent.threatPos();
      const d = Math.hypot(tp.x - g.player.pos.x, tp.z - g.player.pos.z);
      if (d < 2) closeSeen = true;
      if (g.player.health < hp0) break;
      // keep wading through the middle of the room
      if (f % 60 === 59) { const px = room.origin.x - g.player.pos.x, pz = room.origin.z - g.player.pos.z; g.player.yaw = Math.atan2(px, pz); }
    }
    g.keys.delete('KeyW');
    const struck = g.player.health < hp0;
    if (!struck) return { stage: 'no-strike', closeSeen, hp: g.player.health, caps } as const;
    const rose = caps.some((c) => /water stands up|water is not empty/.test(c));

    // The drain empties the room of it.
    ga.godMode = true;
    const DRAIN = new Set(['pipeManifold', 'conduitRun', 'sumpPump', 'hydrant', 'wallVent']);
    const drainProp = room.spec?.props?.find((p) => DRAIN.has(p.kind));
    if (!drainProp) return { stage: 'no-drain-prop', struck, closeSeen } as const;
    const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
    const dp = { x: room.origin.x + drainProp.x * c + drainProp.z * s, z: room.origin.z - drainProp.x * s + drainProp.z * c };
    g.player.teleport(dp.x + 1.0, 0, dp.z + 1.0);
    for (let f = 0; f < 30; f++) g.frame();
    const key = `under:${room.index}`;
    for (let f = 0; f < 260 && !ga.drainedRooms.has(key); f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'drain' && i.enabled);
      if (!it) break;
      const ax = it.pos.x - g.player.pos.x, az = it.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(it.pos.y + 0.55 - (g.player.pos.y + g.player.eyeHeight), Math.hypot(ax, az) || 1);
      if (/open the drain/i.test(g.interaction.focused?.prompt ?? '')) g.keys.add('KeyE');
      g.frame();
    }
    g.keys.delete('KeyE');
    if (!ga.drainedRooms.has(key)) return { stage: 'drain-failed', struck, closeSeen } as const;
    for (let f = 0; f < 20; f++) g.frame();
    const slipped = caps.some((c) => /slips down the drain/.test(c));
    const gone = ent.state === 'done' || !ga.entities.includes(ent as never);

    return { stage: 'done', room: room.index, struck, closeSeen, rose, slipped, gone, hp: g.player.health } as const;
  });

  if (result.stage === 'no-swamper-room' || result.stage === 'not-spawned') test.skip();
  expect(result.struck, JSON.stringify(result)).toBe(true);
  expect(result.rose, JSON.stringify(result)).toBe(true);
  expect(result.gone, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('the dark water hides the wire — upright trips it, the slow wade feels it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's': dark flooded halls u-3/u-24 carry submerged snares

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      enterUnderscript(): void; currentRoom: number; godMode: boolean;
      player: { rootedUntil: number };
    };

    ga.enterUnderscript();
    const room = g.route.underRooms.find((r) => r.flooded && r.darkRoom
      && r.sockets?.some((sk) => sk.meta?.hazard === 'snare' && !sk.meta?.spent));
    if (!room) return { stage: 'no-dark-flood' } as const;
    const snares = room.sockets!.filter((sk) => sk.meta?.hazard === 'snare' && !sk.meta?.spent);
    ga.godMode = true; // keep the room's swamper out of the signal — we read roots, not blood

    const wadeOnto = (s: { x: number; z: number }, crouched: boolean) => {
      // seeded drift can wall off any one lane — prop colliders shift
      // between sprints. Try each cardinal approach until the wire is
      // underfoot; the trip reads distance, not the way you came in.
      let at = { x: 0, z: 0 };
      for (const [ox, oz] of [[0, 0.9], [0.9, 0], [0, -0.9], [-0.9, 0]] as const) {
        g.player.teleport(s.x + ox, 0, s.z + oz);
        g.player.yaw = Math.atan2(-ox, -oz);
        ga.currentRoom = room.index;
        for (let f = 0; f < 20; f++) g.frame();
        const rooted0 = ga.player.rootedUntil;
        if (crouched) g.keys.add('KeyC');
        g.keys.add('KeyW');
        let reached = false;
        for (let f = 0; f < 70; f++) {
          g.frame();
          if (Math.hypot(g.player.pos.x - s.x, g.player.pos.z - s.z) < 0.65) reached = true;
          if (ga.player.rootedUntil > rooted0 || (reached && !crouched) || (reached && f > 30)) break;
        }
        g.keys.delete('KeyW');
        g.keys.delete('KeyC');
        at = { x: g.player.pos.x, z: g.player.pos.z };
        const rooted = ga.player.rootedUntil > rooted0;
        if (rooted || reached) return { rooted, at };
      }
      return { rooted: false, at };
    };

    // The wire hides from an upright wader: stand next to a live one and
    // no 'snip' mints — check BEFORE tripping spends the room's only wire.
    g.player.teleport(snares[0].pos.x + 0.6, 0, snares[0].pos.z + 0.6);
    for (let f = 0; f < 20; f++) g.frame();
    const blindNoPrompt = !g.interaction.interactables.some((i) => i.kind === 'snip');

    const up = wadeOnto(snares[0].pos, false);
    const tripped = up.rooted && caps.some((c) => /paper snare/.test(c));
    let felt = false;
    if (snares.length > 1) {
      const down = wadeOnto(snares[1].pos, true);
      felt = !down.rooted && caps.some((c) => /wire underfoot/.test(c));
    }
    // and the wire can be cut — but only a crouched wader can find it.
    // Needs a second armed wire: a single-snare room spends its only
    // wire on the trip above, and a sprung wire offers no snip by design.
    const last = snares[snares.length - 1].pos;
    g.player.teleport(last.x + 0.6, 0, last.z + 0.6);
    g.keys.add('KeyC');
    for (let f = 0; f < 30; f++) g.frame();
    let cut = false;
    for (let f = 0; f < 160 && !cut; f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'snip' && i.enabled);
      if (!it) break;
      const ax = it.pos.x - g.player.pos.x, az = it.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = -0.7;
      if (/cut/i.test(g.interaction.focused?.prompt ?? '')) g.keys.add('KeyE');
      g.frame();
      cut = caps.some((c) => /wire comes loose/.test(c));
    }
    g.keys.delete('KeyE');
    g.keys.delete('KeyC');
    return { stage: 'done', room: room.index, nSnares: snares.length, tripped, felt,
      blindNoPrompt, cut, caps: caps.slice(-16) } as const;
  });

  if (result.stage === 'no-dark-flood') test.skip();
  expect(result.tripped, JSON.stringify(result)).toBe(true);
  expect(result.blindNoPrompt, JSON.stringify(result)).toBe(true);
  if ((result.nSnares ?? 0) > 1) {
    expect(result.felt, JSON.stringify(result)).toBe(true);
    expect(result.cut, JSON.stringify(result)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('cut the seal — an upright player can disarm a dry wire', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // armed snares @ maint-service-narrow + unlit rooms

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      godMode: boolean; hazard: { snares: { room: number; armed: boolean; pos: { x: number; y: number; z: number } }[] };
      currentRoom: number; keys: Set<string>;
    };
    ga.godMode = true;
    const room = g.route.rooms.find((r) => !r.flooded
      && r.sockets?.some((sk) => sk.meta?.hazard === 'snare' && !sk.meta?.spent));
    if (!room) return { stage: 'no-snare' } as const;
    if (!ga.hazard.snares.some((h) => h.room === room.index && h.armed)) return { stage: 'no-snare' } as const;
    const hz0 = ga.hazard.snares.find((h) => h.room === room.index)!.pos;
    g.player.teleport(hz0.x + 0.7, 0, hz0.z + 0.7);
    ga.currentRoom = room.index;
    for (let f = 0; f < 25; f++) g.frame();
    const sawPrompt = g.interaction.interactables.some((i) => i.kind === 'snip');
    let cut = false;
    for (let f = 0; f < 160 && !cut; f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'snip' && i.enabled);
      if (!it) break;
      g.player.yaw = Math.atan2(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z);
      g.player.pitch = -0.7;
      if (/cut the seal/i.test(g.interaction.focused?.prompt ?? '')) ga.keys.add('KeyE');
      g.frame();
      cut = caps.some((c) => /seal parts/.test(c));
    }
    ga.keys.delete('KeyE');
    return { stage: 'done', room: room.index, sawPrompt, cut,
      disarmed: !ga.hazard.snares.find((h) => h.room === room.index)?.armed,
      caps: caps.slice(-12) } as const;
  });

  if (result.stage === 'no-snare') test.skip();
  expect(result.sawPrompt, JSON.stringify(result)).toBe(true);
  expect(result.cut, JSON.stringify(result)).toBe(true);
  expect(result.disarmed, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

test('scent — a killed hazard signs the room, the Warden reads it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // warden on patrol at 33

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      hazard: { evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string; t: number; readBy: string[] }[] };
      entities: { id: string; state: string; threatPos?(): { x: number; y: number; z: number } | null }[];
    };
    const wardenRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'warden'));
    if (!wardenRoom) return { stage: 'no-warden' } as const;
    // stand in the room to spawn the patrol, then step out of its sight
    g.player.teleport(wardenRoom.origin.x, 0, wardenRoom.origin.z);
    (g as unknown as { currentRoom: number }).currentRoom = wardenRoom.index;
    for (let f = 0; f < 30; f++) g.frame();
    const w = ga.entities.find((e) => e.id === 'warden');
    if (!w) return { stage: 'no-spawn' } as const;
    const spot = wardenRoom.hidingSpots.find((sp) => !sp.trappedBy) ?? wardenRoom.hidingSpots[0];
    if (spot) {
      g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
      (g.player as unknown as { hiddenSpot: unknown }).hiddenSpot = spot;
    } else {
      g.player.teleport(wardenRoom.origin.x - 40, 0, wardenRoom.origin.z);
    }
    for (let f = 0; f < 10; f++) g.frame();
    const sign = { pos: { x: wardenRoom.origin.x + 0.8, y: 0, z: wardenRoom.origin.z }, room: wardenRoom.index, kind: 'line', t: 0, readBy: [] as string[] };
    ga.hazard.evidence.push(sign);
    let closest = Infinity, investigated = false;
    for (let f = 0; f < 700; f++) {
      g.frame();
      const tp = w.threatPos?.();
      if (tp) closest = Math.min(closest, Math.hypot(tp.x - sign.pos.x, tp.z - sign.pos.z));
      if (caps.some((c) => /reads the sign/.test(c))) investigated = true;
      if (investigated && closest < 0.9) break;
    }
    return { stage: 'done', investigated, closest, read: sign.readBy,
      backOnLine: w.state === 'engage', caps: caps.slice(-8) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.investigated, JSON.stringify(result)).toBe(true);
  expect(result.closest, JSON.stringify(result)).toBeLessThan(1.2);
  expect((result.read ?? []).some((r) => r.startsWith('warden')), JSON.stringify(result)).toBe(true);
  expect(result.backOnLine, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

// The wipe is the scrub's shadow: the warden smells a cleaned floor and
// doubts any mark planted beside it — it never leaves the line.
test('the warden doubts — sign beside a wiped floor is not investigated', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's' carries warden @33

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      hazard: { evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string; t: number; readBy: string[]; wiped?: boolean }[] };
      entities: { id: string; state: string; threatPos?(): { x: number; y: number; z: number } | null }[];
    };
    const wardenRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'warden'));
    if (!wardenRoom) return { stage: 'no-warden' } as const;
    g.player.teleport(wardenRoom.origin.x, 0, wardenRoom.origin.z);
    (g as unknown as { currentRoom: number }).currentRoom = wardenRoom.index;
    for (let f = 0; f < 30; f++) g.frame();
    const w = ga.entities.find((e) => e.id === 'warden');
    if (!w) return { stage: 'no-spawn' } as const;
    const spot = wardenRoom.hidingSpots.find((sp) => !sp.trappedBy) ?? wardenRoom.hidingSpots[0];
    if (spot) {
      g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
      (g.player as unknown as { hiddenSpot: unknown }).hiddenSpot = spot;
    } else {
      g.player.teleport(wardenRoom.origin.x - 40, 0, wardenRoom.origin.z);
    }
    for (let f = 0; f < 10; f++) g.frame();
    // a wiped floor + fresh sign 2m inside its doubt radius
    const sign = { pos: { x: wardenRoom.origin.x + 0.8, y: 0, z: wardenRoom.origin.z }, room: wardenRoom.index, kind: 'line', t: 0, readBy: [] as string[] };
    ga.hazard.evidence.push({ pos: { x: sign.pos.x + 0.4, y: 0, z: sign.pos.z - 2 }, room: wardenRoom.index, kind: 'wipe', t: 0, readBy: [], wiped: true });
    ga.hazard.evidence.push(sign);
    let read = false, investigated = false;
    for (let f = 0; f < 700; f++) {
      g.frame();
      if ((w as unknown as { investigate: unknown }).investigate) investigated = true;
      if (caps.some((c) => /reads the sign/.test(c))) read = true;
    }
    return { stage: 'done', investigated, read, doubted: caps.some((c) => /floor smells wiped/.test(c)),
      marked: sign.readBy.some((r) => r.startsWith('warden')), caps: caps.slice(-8) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.doubted, JSON.stringify(result)).toBe(true);
  expect(result.read, `the wiped-floor mark must not be believed: ${JSON.stringify(result.caps)}`).toBe(false);
  expect(result.marked, 'the doubt still consumes the mark').toBe(true);
  expect(result.investigated, 'it never leaves the line for a doubted mark').toBe(false);
  expect(errors).toEqual([]);
});

// Sign goes cold: a mark older than ~6 sim-minutes has dried — the warden
// never picks it up; a fresh mark in the same room still pulls it.
test('the sign goes cold — the warden only believes fresh work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's' carries warden @33

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      hazard: { evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string; t: number; readBy: string[] }[] };
      entities: { id: string; state: string }[];
    };
    const wardenRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'warden'));
    if (!wardenRoom) return { stage: 'no-warden' } as const;
    g.player.teleport(wardenRoom.origin.x, 0, wardenRoom.origin.z);
    (g as unknown as { currentRoom: number }).currentRoom = wardenRoom.index;
    for (let f = 0; f < 30; f++) g.frame();
    const w = ga.entities.find((e) => e.id === 'warden');
    if (!w) return { stage: 'no-spawn' } as const;
    const spot = wardenRoom.hidingSpots.find((sp) => !sp.trappedBy) ?? wardenRoom.hidingSpots[0];
    if (spot) {
      g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
      (g.player as unknown as { hiddenSpot: unknown }).hiddenSpot = spot;
    } else {
      g.player.teleport(wardenRoom.origin.x - 40, 0, wardenRoom.origin.z);
    }
    for (let f = 0; f < 10; f++) g.frame();
    // a cold mark: dried 400s before the frame's sim-time
    const coldSign = { pos: { x: wardenRoom.origin.x + 0.8, y: 0, z: wardenRoom.origin.z }, room: wardenRoom.index, kind: 'line', t: g.clock.time - 400, readBy: [] as string[] };
    ga.hazard.evidence.push(coldSign);
    let coldRead = false;
    for (let f = 0; f < 400 && !coldRead; f++) {
      g.frame();
      coldRead = caps.some((c) => /reads the sign/.test(c));
    }
    // sanity: fresh work in the same room still pulls it
    const freshSign = { pos: { x: wardenRoom.origin.x - 1.2, y: 0, z: wardenRoom.origin.z + 1.2 }, room: wardenRoom.index, kind: 'wire', t: g.clock.time, readBy: [] as string[] };
    ga.hazard.evidence.push(freshSign);
    let freshRead = false;
    for (let f = 0; f < 400 && !freshRead; f++) {
      g.frame();
      freshRead = caps.some((c) => /reads the sign/.test(c));
    }
    return { stage: 'done', coldRead, coldMarked: coldSign.readBy.length > 0,
      freshRead, caps: caps.slice(-8) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.coldRead, `cold sign must be ignored: ${JSON.stringify(result.caps)}`).toBe(false);
  expect(result.coldMarked, 'the warden never even reads it').toBe(false);
  expect(result.freshRead, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

// The second read teaches: a warden that has weighed two marks knows the
// floor is worked — it announces it once and the line runs faster.
test('the second read teaches — the warden quickens on a worked floor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's' carries warden @33

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      hazard: { evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string; t: number; readBy: string[] }[] };
      entities: { id: string; state: string }[];
    };
    const wardenRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'warden'));
    if (!wardenRoom) return { stage: 'no-warden' } as const;
    g.player.teleport(wardenRoom.origin.x, 0, wardenRoom.origin.z);
    (g as unknown as { currentRoom: number }).currentRoom = wardenRoom.index;
    for (let f = 0; f < 30; f++) g.frame();
    const w = ga.entities.find((e) => e.id === 'warden');
    if (!w) return { stage: 'no-spawn' } as const;
    const spot = wardenRoom.hidingSpots.find((sp) => !sp.trappedBy) ?? wardenRoom.hidingSpots[0];
    if (spot) {
      g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
      (g.player as unknown as { hiddenSpot: unknown }).hiddenSpot = spot;
    } else {
      g.player.teleport(wardenRoom.origin.x - 40, 0, wardenRoom.origin.z);
    }
    for (let f = 0; f < 10; f++) g.frame();
    // two marks, read across separate scent cycles — the second teaches
    const mk = (dx: number, dz: number) => ga.hazard.evidence.push({
      pos: { x: wardenRoom.origin.x + dx, y: 0, z: wardenRoom.origin.z + dz },
      room: wardenRoom.index, kind: 'line', t: g.clock.time, readBy: [],
    });
    mk(0.8, 0);
    for (let f = 0; f < 60; f++) g.frame(); // one scent cycle reads mark one
    mk(-1.2, 1.2);
    for (let f = 0; f < 500; f++) g.frame();
    return { stage: 'done',
      learned: caps.some((c) => /floor is worked/.test(c)),
      learnOnce: caps.filter((c) => /floor is worked/.test(c)).length === 1,
      caps: caps.slice(-8) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.learned, JSON.stringify(result)).toBe(true);
  expect(result.learnOnce, 'the lesson announces once').toBe(true);
  expect(errors).toEqual([]);
});

test('ghosts — stale sign still pulls the Grafter, the caption says so', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's' grafter @6

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      currentRoom: number;
      hazard: { evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string; t: number; readBy: string[]; old?: boolean }[] };
      entities: { id: string; update(d: number): void; pos?: { x: number; z: number } }[];
    };
    const gRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'grafter'));
    if (!gRoom) return { stage: 'none-scheduled' } as const;
    // hide in a real spot in the grafter's room — let it spawn + settle
    const spot = gRoom.hidingSpots?.find((sp) => !sp.trappedBy);
    if (!spot) return { stage: 'no-spot' } as const;
    g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
    (g.player as unknown as { hiddenSpot: unknown }).hiddenSpot = spot;
    ga.currentRoom = gRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    // plant stale sign in the room — old evidence only a grafter smells
    ga.hazard.evidence.push({
      pos: { x: gRoom.origin.x, y: 0, z: gRoom.origin.z }, room: gRoom.index,
      kind: 'wire', t: -1, readBy: [], old: true,
    });
    let closest = Infinity;
    for (let f = 0; f < 900; f++) {
      g.frame();
      const gr = ga.entities.find((e) => e.id === 'grafter');
      if (gr?.pos) closest = Math.min(closest,
        Math.hypot(gr.pos.x - gRoom.origin.x, gr.pos.z - gRoom.origin.z));
    }
    const staleRead = ga.hazard.evidence[ga.hazard.evidence.length - 1].readBy.some((r) => r.startsWith('grafter'));
    const ghostCaption = caps.some((c) => /old mark/.test(c));
    return { stage: 'done', closest, staleRead, ghostCaption, caps } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.staleRead, JSON.stringify(result)).toBe(true);
  expect(result.closest, JSON.stringify(result)).toBeLessThan(3.2);
  expect(result.ghostCaption, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});


// The rubble hungers: a grafter that has dragged to two marks turns
// eager — it announces once and hunts faster/longer (sprint 295).
test('the rubble hungers — two marks and the grafter hunts in earnest', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's' grafter @6

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      currentRoom: number;
      hazard: { evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string; t: number; readBy: string[] }[] };
      entities: { id: string }[];
    };
    const gRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'grafter'));
    if (!gRoom) return { stage: 'none-scheduled' } as const;
    const spot = gRoom.hidingSpots?.find((sp) => !sp.trappedBy);
    if (!spot) return { stage: 'no-spot' } as const;
    g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z);
    (g.player as unknown as { hiddenSpot: unknown }).hiddenSpot = spot;
    ga.currentRoom = gRoom.index;
    for (let f = 0; f < 40; f++) g.frame();
    if (!ga.entities.some((e) => e.id === 'grafter')) return { stage: 'no-spawn' } as const;
    // two marks, read across separate scent cycles — the second feeds it
    const mk = (dx: number, dz: number) => ga.hazard.evidence.push({
      pos: { x: gRoom.origin.x + dx, y: 0, z: gRoom.origin.z + dz },
      room: gRoom.index, kind: 'wire', t: g.clock.time, readBy: [],
    });
    mk(1.5, 0.5);
    for (let f = 0; f < 90; f++) g.frame(); // one scent cycle eats mark one
    mk(-1.5, 1.5);
    for (let f = 0; f < 500; f++) g.frame();
    const learned = caps.filter((c) => /hunts in earnest/.test(c)).length;
    return { stage: 'done', learned, caps: caps.slice(-8) } as const;
  });

  if (result.stage !== 'done') test.skip();
  expect(result.learned, JSON.stringify(result)).toBe(1);
  expect(errors).toEqual([]);
});


test('the watched hall — the eye reads motion, felt blinds it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // cam @36 lit (live eye); cam @18 drowned mains (dead)

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      hazard: { watchers: { pos: { x: number; y: number; z: number }; yaw: number;
        room: number; dead: boolean }[] };
      currentRoom: number; godMode: boolean; keys: Set<string>;
      unpaidHeld: number;
      giveItem(id: string, n: number): void;
      interaction: { focused?: { prompt?: string };
        interactables: { kind: string; prompt: string }[] };
      sound: { emit(e: { x: number; y: number; z: number; intensity: number; category: string; caption: string }): void };
    };
    ga.godMode = true;
    ga.unpaidHeld = 0;
    const live = ga.hazard.watchers.find((w) => !w.dead && !g.route.rooms[w.room]?.darkRoom);
    if (!live) return { stage: 'no-live-watcher' } as const;
    const fx = Math.sin(live.yaw), fz = Math.cos(live.yaw);
    const sx = live.pos.x + fx * 3, sz = live.pos.z + fz * 3;
    g.player.teleport(sx, 0, sz);
    ga.currentRoom = live.room;
    for (let f = 0; f < 30; f++) g.frame();
    const warns = caps.filter((t) => /eye pans/.test(t)).length;
    // move inside the cone — the eye settles and rings your feet
    let settled = false;
    for (let f = 0; f < 400 && !settled; f++) {
      g.player.teleport(sx + Math.sin(f * 0.6) * 0.05, 0, sz + Math.cos(f * 0.5) * 0.05);
      g.frame();
      settled = caps.some((t) => /settles on you/.test(t));
    }
    const heldAfterSettle = ga.unpaidHeld;
    const filedCue = caps.some((t) => /face is filed/.test(t));
    // the register talks back — still moving in-cone while marked, the
    // network warns once that the eyes now have your description
    for (let f = 0; f < 60; f++) {
      g.player.teleport(sx + Math.sin(f * 0.6) * 0.05, 0, sz + Math.cos(f * 0.5) * 0.05);
      g.frame();
      if (caps.some((t) => /register talks back/.test(t))) break;
    }
    const talksBack = caps.some((t) => /register talks back/.test(t));
    const talksCount = caps.filter((t) => /register talks back/.test(t)).length;
    // still feet — it loses you
    const stillBefore = caps.length;
    for (let f = 0; f < 200; f++) g.frame();
    const stillReports = caps.slice(stillBefore).filter((t) => /settles on you/.test(t)).length;
    // move again — it can report you a second time but files no new line
    for (let f = 0; f < 500 && stillReports < 1; f++) {
      g.player.teleport(sx + Math.sin(f * 0.6) * 0.05, 0, sz + Math.cos(f * 0.5) * 0.05);
      g.frame();
      if (caps.slice(stillBefore).some((t) => /settles on you/.test(t))) break;
    }
    const heldAfterSecond = ga.unpaidHeld;
    // tape the eye — feltWrap at the mount, aim at the focus point (pos.y + 0.6)
    ga.giveItem('feltWrap', 1);
    const wy = live.pos.y + 0.6;
    let focused = '';
    for (let f = 0; f < 80; f++) {
      g.player.teleport(live.pos.x - fx * 1.2, 0, live.pos.z - fz * 1.2);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const hd = Math.max(0.3, Math.hypot(live.pos.x - g.player.pos.x, live.pos.z - g.player.pos.z));
      g.player.pitch = Math.atan2(wy - eyeY, hd);
      g.player.yaw = Math.atan2(live.pos.x - g.player.pos.x, live.pos.z - g.player.pos.z);
      g.frame();
      // once the hold lands the mount's prompt flips to 'Take the felt
      // back' — keep the LIVE-eye prompt for the assert
      if (ga.interaction.focused?.prompt && !live.dead) focused = ga.interaction.focused.prompt;
      if (f === 20) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    for (let f = 0; f < 15; f++) g.frame();
    const blinded = live.dead; // capture before the felt-recovery relights it
    // the felt comes back: the taped mount now offers 'Take the felt back' —
    // the eye wakes, the wrap is refunded, the sign it left stays smelled
    const wrapsBeforeRecover = (g as unknown as { inventory: { id: string; count: number }[] })
      .inventory.find((i) => i.id === 'feltWrap')?.count ?? 0;
    let recoverFocused = '';
    for (let f = 0; f < 80; f++) {
      g.player.teleport(live.pos.x - fx * 1.2, 0, live.pos.z - fz * 1.2);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const hd = Math.max(0.3, Math.hypot(live.pos.x - g.player.pos.x, live.pos.z - g.player.pos.z));
      g.player.pitch = Math.atan2(wy - eyeY, hd);
      g.player.yaw = Math.atan2(live.pos.x - g.player.pos.x, live.pos.z - g.player.pos.z);
      g.frame();
      // once the hold lands the mount flips back to 'Tape the eye' —
      // capture the DEAD-eye prompt for the assert
      if (ga.interaction.focused?.prompt && live.dead) recoverFocused = ga.interaction.focused.prompt;
      if (f === 20) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    for (let f = 0; f < 15; f++) g.frame();
    const wrapsAfterRecover = (g as unknown as { inventory: { id: string; count: number }[] })
      .inventory.find((i) => i.id === 'feltWrap')?.count ?? 0;
    const relit = !live.dead;
    // drowned mains: the dark room's cam is dead — no verb, no report
    const darkWatcher = ga.hazard.watchers.find((w) => !w.dead && !!g.route.rooms[w.room]?.darkRoom);
    let darkTapeVerb = true, darkReport = -1;
    if (darkWatcher) {
      g.player.teleport(darkWatcher.pos.x, 0, darkWatcher.pos.z + 1);
      ga.currentRoom = darkWatcher.room;
      for (let f = 0; f < 20; f++) g.frame();
      darkTapeVerb = ga.interaction.interactables.some((i) => i.kind === 'tape')
        || ga.interaction.interactables.some((i) => i.kind === 'untape');
      const dc = caps.length;
      for (let f = 0; f < 250; f++) {
        g.player.teleport(darkWatcher.pos.x + Math.sin(f * 0.7) * 0.05, 0, darkWatcher.pos.z + 2);
        g.frame();
      }
      darkReport = caps.slice(dc).filter((t) => /settles on you/.test(t)).length;
    }
    // the tape is testimony — the blinded eye left fresh sign at the mount
    const blindSign = (ga.hazard as { evidence?: { kind: string; pos: { x: number; z: number }; t: number }[] })
      .evidence?.find((e) => e.kind === 'blind'
        && Math.hypot(e.pos.x - live.pos.x, e.pos.z - live.pos.z) < 0.5);
    return { stage: 'done', warns, settled, stillReports, focused,
      heldAfterSettle, filedCue, heldAfterSecond, talksBack, talksCount,
      blinded, blindSign: !!blindSign,
      recoverFocused, wrapsBeforeRecover, wrapsAfterRecover, relit,
      darkFound: !!darkWatcher, darkTapeVerb, darkReport };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.warns, 'the eye must name its rule').toBeGreaterThan(0);
  expect(result.settled, JSON.stringify(result)).toBe(true);
  // sprint 313 — the eye files too: a held settle is a witness line, once per eye
  expect(result.heldAfterSettle, JSON.stringify(result)).toBe(1);
  expect(result.filedCue, JSON.stringify(result)).toBe(true);
  expect(result.heldAfterSecond, JSON.stringify(result)).toBe(1);
  // sprint 314 — the register talks back: marked, the network warns once
  expect(result.talksBack, JSON.stringify(result)).toBe(true);
  expect(result.talksCount, JSON.stringify(result)).toBe(1);
  expect(result.stillReports, JSON.stringify(result)).toBe(0);
  expect(result.focused).toMatch(/Tape the eye|Smother the beam/);
  expect(result.blinded, 'felt blinds the eye').toBe(true);
  // sprint 315 — the tape is testimony: blinding it left sign at the mount
  expect(result.blindSign, JSON.stringify(result)).toBe(true);
  // sprint 316 — the felt comes back: the mount offers recovery, the
  // eye wakes, the wrap returns, the sign it left stays smelled
  expect(result.recoverFocused, JSON.stringify(result)).toMatch(/felt back/);
  expect(result.wrapsBeforeRecover).toBe(0);
  expect(result.wrapsAfterRecover).toBe(1);
  expect(result.relit, 'the eye blinks awake').toBe(true);
  expect(result.blindSign, 'recovering the felt does not un-smell the sign').toBe(true);
  if (result.darkFound) {
    expect(result.darkTapeVerb, 'a dead eye has nothing to tape').toBe(false);
    expect(result.darkReport, 'dead mains watch nothing').toBe(0);
  }
  expect(errors).toEqual([]);
});

test('the confiscated case — the eyes guard a prize', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's'); // cam @36 lit — the corridor eye guards a case

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      hazard: { watchers: { pos: { x: number; y: number; z: number }; room: number; dead: boolean }[] };
      currentRoom: number; godMode: boolean; keys: Set<string>;
      interaction: { focused?: { id?: string; prompt?: string };
        interactables: { kind: string; prompt: string; enabled: boolean }[] };
    };
    ga.godMode = true;
    const room = g.route.rooms.find((r) => r.sockets?.some((s) => s.meta?.confiscated));
    const caze = room?.sockets?.find((s) => s.meta?.confiscated);
    if (!room || !caze) return { stage: 'no-case' } as const;
    // the guard is real: a live watcher sweeps this room
    const watcher = ga.hazard.watchers.find((w) => w.room === room.index && !w.dead);
    const taken0 = caze.meta!.taken === true;

    // stand at the case, aim at the focus point (pos.y + 0.6), hold E 2.2s
    const wy = caze.pos.y + 0.6;
    const purse = g as unknown as { imprints: number; inventory: { id: string; count: number }[] };
    const imp0 = purse.imprints;
    const items0 = purse.inventory.reduce((a, i) => a + i.count, 0);
    let sawPry = false;
    for (let f = 0; f < 120; f++) {
      g.player.teleport(caze.pos.x + 0.8, 0, caze.pos.z + 0.8);
      ga.currentRoom = room.index;
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      const hd = Math.max(0.3, Math.hypot(caze.pos.x - g.player.pos.x, caze.pos.z - g.player.pos.z));
      g.player.pitch = Math.atan2(wy - eyeY, hd);
      g.player.yaw = Math.atan2(caze.pos.x - g.player.pos.x, caze.pos.z - g.player.pos.z);
      g.frame();
      // capture before the hold finishes — once the case pops, a nearby verb
      // (the corridor phone) takes focus and erases the prompt we're testing
      if (/pry the confiscated case/i.test(ga.interaction.focused?.prompt ?? '')) sawPry = true;
      if (f === 8) ga.keys.add('KeyE');
    }
    ga.keys.delete('KeyE');
    for (let f = 0; f < 15; f++) g.frame();
    return { stage: 'done', idx: room.index, watched: !!watcher, taken0,
      sawPry, taken: caze.meta!.taken === true,
      contains: caze.meta!.contains as string | undefined,
      gained: (purse.imprints - imp0) + (purse.inventory.reduce((a, i) => a + i.count, 0) - items0),
      openCaption: caps.some((c) => /case breaks open|case held a purse|case cracks|warrant lists/.test(c)),
      pryGone: !ga.interaction.interactables.some((i) => i.kind === 'pry' && i.enabled) };
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  expect(result.watched, 'the case must sit under a live eye').toBe(true);
  expect(result.sawPry, 'the pry must out-focus its room').toBe(true);
  expect(result.taken).toBe(true);
  // 's' case@36 holds a sealed warrant — its payout is paper, not goods
  if (result.contains === 'warrant') {
    expect(result.gained, 'a warrant pays information, not goods').toBe(0);
  } else {
    expect(result.gained, 'the case pays out').toBeGreaterThan(0);
  }
  expect(result.openCaption, 'the pry pays out + rings').toBe(true);
  expect(result.pryGone, 'the pry is one-shot').toBe(true);
  expect(errors).toEqual([]);
});
