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
    const hzf = g as unknown as {
      hazard: { snares: { pos: { x: number; z: number }; room: number; armed: boolean }[] };
    };
    const inUnderRoom = (x: number, z: number) =>
      Math.abs(x - room.origin.x) <= (room.width ?? 0) / 2 && Math.abs(z - room.origin.z) <= (room.depth ?? 0) / 2;
    // s405 made every wire a shared resource: a walker crossing an armed
    // snare spends it — and its '[paper screams]' plays where it trips,
    // not where you stand. The room's swamper can spend the seeded wire
    // during the setup frames, out of earshot. Pin every walker in this
    // room to its far corner BEFORE any frame ticks, then re-tie the
    // wire: the leg reads the player's trip, not the world's luck.
    for (const e of g.entities) {
      const tp = e.threatPos?.();
      if (!tp || !inUnderRoom(tp.x, tp.z)) continue;
      const epos = e.pos as { x: number; z: number } | undefined;
      if (!epos) continue;
      const corner = { x: room.origin.x - (snares[0].pos.x - room.origin.x), z: room.origin.z - (snares[0].pos.z - room.origin.z) };
      epos.x = corner.x; epos.z = corner.z;
      const camp = e as unknown as { roamT?: number; crackCampUntil?: number; target?: unknown };
      if ('roamT' in camp) camp.roamT = 0;
      camp.crackCampUntil = g.clock.time + 60;
    }
    for (const s of hzf.hazard.snares) {
      if (s.room !== room.index) continue;
      if (!s.armed && Math.hypot(s.pos.x - snares[0].pos.x, s.pos.z - snares[0].pos.z) < 0.5) s.armed = true;
    }

    const wadeDiag: string[] = [];
    const wadeOnto = (s: { x: number; z: number }, crouched: boolean) => {
      // seeded drift can wall off any one lane — prop colliders shift
      // between sprints. Try each cardinal approach until the wire is
      // underfoot; the trip reads distance, not the way you came in.
      let at = { x: 0, z: 0 };
      for (const [ox, oz] of [[0, 0.9], [0.9, 0], [0, -0.9], [-0.9, 0]] as const) {
        g.player.teleport(s.x + ox, 0, s.z + oz);
        g.player.yaw = Math.atan2(-ox, -oz);
        ga.currentRoom = room.index;
        if (crouched) g.keys.add('KeyC');
        // rooted0 reads BEFORE the settle: a collider eject that walks the
        // player onto the wire IS the trip the leg is about — it counts.
        const rooted0 = ga.player.rootedUntil;
        for (let f = 0; f < 20; f++) g.frame();
        // entities spawn on proximity — a swamper appearing mid-settle can
        // spend the shared wire under s405's two-way rule. Re-pin anything
        // in the room after the settle, and re-tie the wire: the leg reads
        // the player's trip, not the world's luck.
        for (const e of g.entities) {
          const tp = e.threatPos?.();
          if (!tp || !inUnderRoom(tp.x, tp.z)) continue;
          const ep = e.pos as { x: number; z: number } | undefined;
          if (!ep) continue;
          ep.x = room.origin.x - (s.x - room.origin.x);
          ep.z = room.origin.z - (s.z - room.origin.z);
          const c2 = e as unknown as { roamT?: number; crackCampUntil?: number };
          if ('roamT' in c2) c2.roamT = 0;
          c2.crackCampUntil = g.clock.time + 60;
        }
        if (!hzf.hazard.snares.find((sn) => sn.room === room.index
          && Math.hypot(sn.pos.x - s.x, sn.pos.z - s.z) < 0.5)!.armed
          && rooted0 === ga.player.rootedUntil) {
          hzf.hazard.snares.find((sn) => sn.room === room.index
            && Math.hypot(sn.pos.x - s.x, sn.pos.z - s.z) < 0.5)!.armed = true;
        }
        g.keys.add('KeyW');
        let reached = false;
        let closest = 99;
        for (let f = 0; f < 70; f++) {
          g.frame();
          closest = Math.min(closest, Math.hypot(g.player.pos.x - s.x, g.player.pos.z - s.z));
          if (Math.hypot(g.player.pos.x - s.x, g.player.pos.z - s.z) < 0.65) reached = true;
          if (ga.player.rootedUntil > rooted0 || (reached && !crouched) || (reached && f > 30)) break;
        }
        g.keys.delete('KeyW');
        g.keys.delete('KeyC');
        at = { x: g.player.pos.x, z: g.player.pos.z };
        const rooted = ga.player.rootedUntil > rooted0;
        wadeDiag.push(`${ox},${oz}->closest${closest.toFixed(2)}${reached ? 'R' : ''}`);
        if (rooted || reached) return { rooted, at };
      }
      return { rooted: false, at };
    };

    // The wire hides from an upright wader: stand near a live one and no
    // 'snip' mints — check BEFORE tripping spends the room's only wire.
    // Stand 2.4m off: close enough to mint (the radius is 4.6m), far
    // enough that a collider eject can't walk the player onto the wire
    // and self-trip before the wade begins.
    g.player.teleport(snares[0].pos.x + 2.4, 0, snares[0].pos.z);
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
    const nearCols = (room.colliders ?? []).filter((c) =>
      Math.hypot((c.minX + c.maxX) / 2 - snares[0].pos.x, (c.minZ + c.maxZ) / 2 - snares[0].pos.z) < 1.6)
      .map((c) => `${((c.minX + c.maxX) / 2).toFixed(2)},${((c.minZ + c.maxZ) / 2).toFixed(2)} ${(c.maxX - c.minX).toFixed(1)}x${(c.maxZ - c.minZ).toFixed(1)}`);
    return { stage: 'done', room: room.index, nSnares: snares.length, tripped, felt,
      blindNoPrompt, cut, caps: caps.slice(-16), wadeDiag, nearCols,
      snareAt: { x: snares[0].pos.x, z: snares[0].pos.z },
      armed: hzf.hazard.snares.find((s) => s.room === room.index && Math.hypot(s.pos.x - snares[0].pos.x, s.pos.z - snares[0].pos.z) < 0.5)?.armed } as const;
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
    const room = g.route.rooms.find((r) => !r.flooded && !r.scheduled?.length
      && r.sockets?.some((sk) => sk.meta?.hazard === 'snare' && !sk.meta?.spent))
      ?? g.route.rooms.find((r) => !r.flooded
      && r.sockets?.some((sk) => sk.meta?.hazard === 'snare' && !sk.meta?.spent));
    if (!room) return { stage: 'no-snare' } as const;
    if (!ga.hazard.snares.some((h) => h.room === room.index && h.armed)) return { stage: 'no-snare' } as const;
    const hz0 = ga.hazard.snares.find((h) => h.room === room.index)!.pos;
    g.player.teleport(hz0.x + 0.7, 0, hz0.z + 0.7);
    ga.currentRoom = room.index;
    for (let f = 0; f < 25; f++) g.frame();
    // sprint 404+ — wires trip walkers too: anything already afield can cut
    // the seal for you before the drive lands. Clear the field; staying in
    // this room mints no new spawns.
    for (const e of (g.entities as unknown as { done?(): void }[])) e.done?.();
    for (let f = 0; f < 30; f++) g.frame();
    const sawPrompt = g.interaction.interactables.some((i) => i.kind === 'snip');
    // hunt a stand that actually holds the wire's focus: a bare pitch at a
    // fixed offset can lose the cone to a nearer counter verb. Same
    // stand-drop probe the economy legs use.
    let lock: { x: number; z: number; dy: number } | null = null;
    for (let k = 0; k < 12 && !lock; k++) {
      const a = (k / 12) * Math.PI * 2;
      const sx = hz0.x + Math.sin(a) * 1.1, sz = hz0.z + Math.cos(a) * 1.1;
      for (const dy of [0.7, 0.45, 0.2, 0]) {
        g.player.teleport(sx, 0, sz);
        g.player.yaw = Math.atan2(hz0.x - sx, hz0.z - sz);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.max(-1.45, Math.min(1.45,
          Math.atan2(0.06 + dy - eyeY, Math.hypot(hz0.x - sx, hz0.z - sz) || 1)));
        g.frame();
        if (/cut the seal/i.test(g.interaction.focused?.prompt ?? '')) { lock = { x: sx, z: sz, dy }; break; }
      }
    }
    let cut = false;
    for (let f = 0; f < 160 && !cut && lock; f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'snip' && i.enabled);
      if (!it) break;
      g.player.teleport(lock.x, 0, lock.z);
      g.player.yaw = Math.atan2(it.pos.x - lock.x, it.pos.z - lock.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.max(-1.45, Math.min(1.45,
        Math.atan2(it.pos.y + lock.dy - eyeY, Math.hypot(it.pos.x - lock.x, it.pos.z - lock.z) || 1)));
      if (/cut the seal/i.test(g.interaction.focused?.prompt ?? '')) ga.keys.add('KeyE');
      g.frame();
      cut = caps.some((c) => /seal parts/.test(c));
    }
    ga.keys.delete('KeyE');
    return { stage: 'done', room: room.index, sawPrompt, hunted: !!lock, cut,
      disarmed: !ga.hazard.snares.find((h) => h.room === room.index)?.armed,
      caps: caps.slice(-12) } as const;
  });

  if (result.stage === 'no-snare') test.skip();
  expect(result.sawPrompt, JSON.stringify(result)).toBe(true);
  expect(result.cut, JSON.stringify(result)).toBe(true);
  expect(result.disarmed, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

// sprint 405 — the wire doesn't care whose foot either: a walker trips an
// armed seal like you do — rooted a beat, loud, and the sprung wire signs.
test('the wire trips a walker too — rooted, loud, signed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const ga = g as unknown as {
      hazard: { snares: { room: number; armed: boolean; pos: { x: number; y: number; z: number } }[];
        evidence: { pos: { x: number; z: number }; room: number; kind: string }[] };
      entities: { id: string; state: string; pos?: { x: number; z: number }; staggerUntil?: number }[];
      spawnById(id: string): void;
    };
    const em: { x: number; z: number; caption?: string }[] = [];
    (g as unknown as { sound: { on(cb: (e: { x: number; y: number; z: number; intensity: number; category: string; caption?: string }) => void): void } })
      .sound.on((e) => { if (/snare/.test(e.caption ?? '')) em.push(e); });

    const hz = ga.hazard.snares.find((h) => h.armed);
    if (!hz) return { stage: 'no-snare' } as const;
    ga.spawnById('grafter');
    const ent = ga.entities.find((e) => e.id === 'grafter' && e.state !== 'done');
    if (!ent?.pos) return { stage: 'no-walker' } as const;
    // player stands clear of the 0.7m trip radius — it must be HIS wire
    g.player.teleport(hz.pos.x + 2.5, 0, hz.pos.z + 2.5);
    const ev0 = ga.hazard.evidence.length;
    ent.pos.x = hz.pos.x; ent.pos.z = hz.pos.z;
    for (let f = 0; f < 60 && hz.armed; f++) g.frame();
    const disarmed = !hz.armed;
    const staggered = disarmed && (ent.staggerUntil ?? 0) > g.clock.time;
    const pullHeard = em.some((e) => Math.hypot(e.x - hz.pos.x, e.z - hz.pos.z) < 0.5);
    const signed = ga.hazard.evidence.slice(ev0).some((e) => e.kind === 'wire'
      && Math.hypot(e.pos.x - hz.pos.x, e.pos.z - hz.pos.z) < 0.5);
    const notYours = caps.some((c) => /foot that was not yours/.test(c));
    return { stage: 'done', disarmed, staggered, pullHeard, signed, notYours } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.disarmed, 'the wire trips under the walker').toBe(true);
  expect(result.staggered, 'the trip roots the walker a beat').toBe(true);
  expect(result.pullHeard, 'the trip is a real pull at the wire').toBe(true);
  expect(result.signed, 'the sprung wire leaves fresh sign').toBe(true);
  expect(result.notYours, 'the house tells you whose foot it was not').toBe(true);
  expect(errors).toEqual([]);
});

// sprint 406 — the floor slides under his stride too: a walker loses his
// footing on a loose rug or a wet floor exactly the way you do.
test('the rug and the water slide under a walker too', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page, 's');

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const ga = g as unknown as {
      armedRugs: Map<string, boolean>; armedPuddles: Map<string, boolean>;
      liveRugs: { x: number; z: number; key: string }[];
      livePuddles: { x: number; z: number; key: string }[];
      slippedRugs: Set<string>; slippedPuddles: Set<string>;
      entities: { id: string; state: string; pos?: { x: number; z: number }; staggerUntil?: number }[];
      spawnById(id: string): void;
    };
    const em: { x: number; z: number; caption?: string }[] = [];
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    (g as unknown as { sound: { on(cb: (e: { x: number; y: number; z: number; intensity: number; category: string; caption?: string }) => void): void } })
      .sound.on((e) => { if (/stumble|splash/.test(e.caption ?? '')) em.push(e); });

    // armed rolls are per-minted prop — mint a room holding a rug and a
    // room holding a puddle, then arm them directly (the leg tests the
    // trip, not the 0.35 seed roll).
    const rugRoom = g.route.rooms.find((r) => r.spec?.props?.some((p) => p.kind === 'rug'));
    const pdRoom = g.route.rooms.find((r) => r.spec?.props?.some((p) => p.kind === 'puddle'));
    if (!rugRoom && !pdRoom) return { stage: 'no-slip' } as const;
    ga.spawnById('grafter');
    const ent = ga.entities.find((e) => e.id === 'grafter' && e.state !== 'done');
    if (!ent?.pos) return { stage: 'no-walker' } as const;
    let armedRug: string | undefined;
    let armedPd: string | undefined;
    const ga2 = g as unknown as { space: string };
    for (const rm of [rugRoom, pdRoom]) {
      if (!rm) continue;
      g.player.teleport(rm.origin.x, 0, rm.origin.z);
      for (let f = 0; f < 4; f++) g.frame();
      const k = [...ga.armedRugs.keys()].filter((x) => x.startsWith(`${ga2.space}:${rm.index}:`)).pop();
      const pk = [...ga.armedPuddles.keys()].filter((x) => x.startsWith(`${ga2.space}:${rm.index}:`)).pop();
      if (k && !ga.slippedRugs.has(k)) { ga.armedRugs.set(k, true); if (!armedRug) armedRug = k; }
      if (pk && !ga.slippedPuddles.has(pk)) { ga.armedPuddles.set(pk, true); if (!armedPd) armedPd = pk; }
    }
    if (!armedRug && !armedPd) return { stage: 'no-slip' } as const;

    const out: { rug?: boolean; puddle?: boolean; pullRug?: boolean; pullPd?: boolean; staggered?: boolean;
      hisRug?: boolean; hisPd?: boolean } = {};
    // live lists only fill while the spot's room is minted — park the
    // player inside each room (clear of the slip radius so it's HIS
    // trip, not yours) and walk the grafter onto the spot.
    const epos = ent.pos;
    const trip = (key: string, isRug: boolean, rm: { origin: { x: number; z: number } }) => {
      const live = () => (isRug ? ga.liveRugs : ga.livePuddles).find((s) => s.key === key);
      const slipped = () => (isRug ? ga.slippedRugs : ga.slippedPuddles).has(key);
      g.player.teleport(rm.origin.x, 0, rm.origin.z);
      for (let f = 0; f < 6 && !live() && !slipped(); f++) g.frame();
      let spot = live();
      if (!spot) return { hit: slipped(), pull: false };
      // park 2.2m clear toward the room's heart — keeps the mint, stays
      // outside the slip radius so the trip is HIS, not yours
      const ox = rm.origin.x - spot.x, oz = rm.origin.z - spot.z;
      const od = Math.hypot(ox, oz) || 1;
      g.player.teleport(spot.x + (ox / od) * 2.2, 0, spot.z + (oz / od) * 2.2);
      for (let f = 0; f < 120 && !slipped(); f++) {
        const s = live();
        if (s) { spot = s; epos.x = s.x; epos.z = s.z; }
        g.frame();
      }
      return { hit: slipped(), pull: em.some((e) => Math.hypot(e.x - spot.x, e.z - spot.z) < 0.5) };
    };
    if (armedRug && rugRoom) {
      const r = trip(armedRug, true, rugRoom);
      out.rug = r.hit;
      out.pullRug = r.pull;
      out.staggered = (ent.staggerUntil ?? 0) > g.clock.time;
      out.hisRug = caps.some((c) => /stride that was not yours/.test(c));
    }
    if (armedPd && pdRoom) {
      const r = trip(armedPd, false, pdRoom);
      out.puddle = r.hit;
      out.pullPd = r.pull;
      out.hisPd = caps.some((c) => /floor takes his feet/.test(c));
      out.staggered = out.staggered || (ent.staggerUntil ?? 0) > g.clock.time;
    }
    return { stage: 'done', armedRug: !!armedRug, armedPd: !!armedPd, ...out,
      emN: em.length, emCap: em.slice(-6).map((e) => e.caption), capsTail: caps.slice(-6) } as const;
  });

  if (result.stage === 'no-slip') test.skip();
  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  if (result.armedRug) {
    expect(result.rug, 'a loose rug slides under the walker').toBe(true);
    expect(result.pullRug, `the rug stumble is a real sound: ${JSON.stringify(result)}`).toBe(true);
    expect(result.hisRug, 'it was HIS stride, not yours').toBe(true);
  }
  if (result.armedPd) {
    expect(result.puddle, 'a wet floor takes his feet').toBe(true);
    expect(result.pullPd, 'the splash is a real sound').toBe(true);
    expect(result.hisPd, 'it was HIS feet, not yours').toBe(true);
  }
  expect(result.staggered, 'the stumble roots him a beat').toBe(true);
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
        room: number; dead: boolean; arc: number }[] };
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
    // stand off the arc's center toward an extreme: the pan is sinusoidal and
    // dwells longest at its turning points — a wide-arc eye (arc ~0.95 vs the
    // ±0.42 cone) bleeds a center stand's settle between passes, but a stand
    // near the dwell point stays in-cone through the long pause.
    const fx = Math.sin(live.yaw + live.arc * 0.6), fz = Math.cos(live.yaw + live.arc * 0.6);
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

// Sprints 410-416 — the floor answers back: the warden re-lays dead
// hazards its sign-read lands on (restoring them in place), slipping
// close mid-tying aborts the read, every stagger emits a real crash
// other listeners drift to, and under the floor the grafter relocates
// dead wire onto your path instead of repairing it.
test('the house re-lays, the under relocates, the fall is heard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's'

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    interface WardenX { investigate: { x: number; z: number } | null; investigateScan: number;
      pos: { x: number; y: number; z: number; set?(x: number, y: number, z: number): void };
      stagger(s: number): void }
    const ga = g as unknown as {
      enterUnderscript(): void; currentRoom: number; godMode: boolean;
      entities: { id: string; state: string; threatPos(): { x: number; z: number } }[];
      spawnScheduled(): void;
      hazard: { snares: { pos: { x: number; y: number; z: number }; room: number; armed: boolean; grafted?: boolean }[];
        evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string; t: number; readBy: string[] }[] };
      sound: { emit(e: Record<string, unknown>): void; on(f: (e: { x: number; z: number; category: string; intensity: number; source?: string }) => void): () => void };
    };

    // ---------- A: the re-lay upstairs ----------
    // largest main room — warden patrols its entry→exit line; we need
    // the player outside its 9m see-range while the read completes.
    const room = g.route.rooms
      .filter((r) => (r.width ?? 0) >= 10 && (r.depth ?? 0) >= 10)
      .sort((a, b) => ((b.width ?? 0) + (b.depth ?? 0)) - ((a.width ?? 0) + (a.depth ?? 0)))[0];
    if (!room) return { stage: 'no-big-room' } as const;
    room.scheduled = [...(room.scheduled ?? []), { entity: 'warden', triggerRoom: room.index, seed: 1 }];
    g.player.teleport(room.origin.x, 0, room.origin.z - (room.depth ?? 10) / 2 + 1.2);
    ga.currentRoom = room.index;
    ga.godMode = true;
    for (let f = 0; f < 40; f++) g.frame();
    const warden = ga.entities.find((e) => e.id === 'warden' && e.state !== 'done') as unknown as
      (WardenX & { id: string; state: string; threatPos(): { x: number; z: number } }) | undefined;
    if (!warden) return { stage: 'no-warden', ents: ga.entities.map((e) => e.id) } as const;

    // dead wire + fresh sign on its patrol midpoint
    const wp = warden.threatPos();
    const spot = { x: (room.entryPos.x + room.exitPos.x) / 2, z: (room.entryPos.z + room.exitPos.z) / 2 };
    ga.hazard.snares.push({ pos: { x: spot.x, y: 0, z: spot.z }, room: room.index, armed: false });
    ga.hazard.evidence.push({ pos: { x: spot.x, y: 0, z: spot.z }, room: room.index, kind: 'wire', t: g.clock.time, readBy: [] });
    let reLaid = false;
    for (let f = 0; f < 600 && !reLaid; f++) {
      g.frame();
      const s = ga.hazard.snares.find((s) => s.room === room.index && Math.hypot(s.pos.x - spot.x, s.pos.z - spot.z) < 0.4);
      if (s?.armed) reLaid = true;
    }
    const reLayCue = caps.some((c) => /re-lays the wire/.test(c));
    if (!reLaid) return { stage: 'no-relay', wp, caps: caps.slice(-8) } as const;

    // ---------- B: caught mid-tying ----------
    const spot2 = { x: spot.x + 1.0, z: spot.z + 0.5 };
    ga.hazard.snares.push({ pos: { x: spot2.x, y: 0, z: spot2.z }, room: room.index, armed: false });
    ga.hazard.evidence.push({ pos: { x: spot2.x, y: 0, z: spot2.z }, room: room.index, kind: 'wire', t: g.clock.time, readBy: [] });
    // wait until it's AT the SIGN (kind 'wire', scan ticking) — noise
    // investigates (e.g. it hearing its own re-laid wire snap under it)
    // don't count: the abort must land on a sign-read's hands
    let aborted = false;
    let abortKind = 'never';
    for (let f = 0; f < 1500 && !aborted; f++) {
      g.frame();
      const kind = (warden as unknown as { investigateKind: string | null }).investigateKind;
      if (warden.investigate && kind === 'wire' && warden.investigateScan > 0.15) {
        abortKind = String(kind);
        const tp = warden.threatPos();
        g.player.teleport(tp.x + 1.1, 0, tp.z + 0.6);
        for (let k = 0; k < 12; k++) g.frame();
        aborted = !warden.investigate;
        break;
      }
    }
    const stillDead2 = ga.hazard.snares.some((s) => !s.armed && Math.hypot(s.pos.x - spot2.x, s.pos.z - spot2.z) < 0.4);
    const abortCue = caps.some((c) => /half-fast|stops mid-tying/.test(c));

    // ---------- C: the fall is heard ----------
    const heard: { x: number; z: number; category: string; intensity: number }[] = [];
    ga.sound.on((e) => { if (e.category === 'impact') heard.push(e); });
    const wpos = warden.threatPos();
    warden.stagger(1.5);
    g.frame();
    const crash = heard.find((e) => Math.hypot(e.x - wpos.x, e.z - wpos.z) < 0.5);

    // ---------- D: the under relocates ----------
    ga.enterUnderscript();
    const gRoom = g.route.underRooms
      .filter((r) => r.scheduled?.some((s) => s.entity === 'grafter'))
      .sort((a, b) => ((b.width ?? 0) + (b.depth ?? 0)) - ((a.width ?? 0) + (a.depth ?? 0)))[0];
    if (!gRoom) return { stage: 'no-grafter-room', reLaid, aborted, crash: !!crash } as const;
    g.player.teleport(gRoom.origin.x - (gRoom.width ?? 8) / 2 - 2.5, 0, gRoom.origin.z);
    ga.currentRoom = gRoom.index - 1 >= 0 ? gRoom.index - 1 : gRoom.index;
    // step in just long enough for the spawn, then out — no chase while it works
    g.player.teleport(gRoom.origin.x, 0, gRoom.origin.z);
    ga.currentRoom = gRoom.index;
    for (let f = 0; f < 8; f++) g.frame();
    const grafter = ga.entities.find((e) => e.id === 'grafter' && e.state !== 'done') as unknown as
      { pos: { x: number; y: number; z: number }; target: { x: number; y: number; z: number };
        id: string; state: string } | undefined;
    if (!grafter) return { stage: 'no-grafter', reLaid, aborted, crash: !!crash, ents: ga.entities.map((e) => e.id) } as const;
    g.player.teleport(gRoom.origin.x - (gRoom.width ?? 8) / 2 - 2.5, 0, gRoom.origin.z);
    ga.currentRoom = gRoom.index - 1 >= 0 ? gRoom.index - 1 : gRoom.index;

    // dead wire inside the room + park the rubble on it
    const ds = { x: gRoom.origin.x + 1.0, z: gRoom.origin.z + 1.0 };
    const deadBefore = ga.hazard.snares.filter((s) => !s.armed).length;
    ga.hazard.snares.push({ pos: { x: ds.x, y: 0, z: ds.z }, room: gRoom.index, armed: false });
    grafter.pos.x = ds.x + 0.1; grafter.pos.y = 0; grafter.pos.z = ds.z + 0.1;
    grafter.target.x = ds.x + 0.1; grafter.target.z = ds.z + 0.1;
    let stripped = false;
    for (let f = 0; f < 30 && !stripped; f++) {
      g.frame();
      stripped = ga.hazard.snares.filter((s) => !s.armed).length === deadBefore; // the planted dead one is gone
    }
    if (!stripped) return { stage: 'no-strip', reLaid, aborted, crash: !!crash } as const;

    // step back into its room — the coil unwinds where the living walk
    g.player.teleport(gRoom.origin.x - (gRoom.width ?? 8) / 2 + 1.2, 0, gRoom.origin.z);
    ga.currentRoom = gRoom.index;
    let grafted = false;
    for (let f = 0; f < 40 && !grafted; f++) {
      g.frame();
      // the graft itself is the mechanic — whether it stays armed after
      // its planter walks over it is the two-ways ecology working
      grafted = ga.hazard.snares.some((s) => s.grafted === true && s.room === gRoom.index);
    }
    const gx = grafter as unknown as { carrying: number; state: string; roomOf(p: { x: number; z: number }): number };
    const graftDebug = { carrying: gx.carrying, state: gx.state,
      roomOfPos: gx.roomOf?.(grafter.pos) ?? -99, curRoom: ga.currentRoom, gIdx: gRoom.index,
      snareRooms: ga.hazard.snares.filter((s) => s.grafted).map((s) => s.room) };
    const graftCue = caps.some((c) => /coil unwinds|coil goes with it|drags a coil/.test(c));

    return { stage: 'done', reLaid, reLayCue, aborted, stillDead2, abortCue,
      crash: !!crash, crashCat: crash?.category, stripped, grafted, graftCue,
      capsTail: caps.filter((c) => !/scuffle/.test(c)).slice(-14), abortKind, graftDebug } as const;
  });

  if (result.stage === 'no-big-room' || result.stage === 'no-grafter-room' || result.stage === 'no-grafter'
    || result.stage === 'no-warden') test.skip();
  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  expect(result.reLaid, 'the warden re-lays dead wire it reads').toBe(true);
  expect(result.reLayCue, JSON.stringify(result)).toBe(true);
  expect(result.aborted, 'a close slip aborts the read mid-tying').toBe(true);
  expect(result.stillDead2, 'the aborted wire stays dead').toBe(true);
  expect(result.abortCue, JSON.stringify(result)).toBe(true);
  expect(result.crash, 'the stagger is a real positional sound').toBe(true);
  expect(result.stripped, 'the grafter strips dead wire it stands on').toBe(true);
  expect(result.grafted, 'the coil is laid fresh in your room').toBe(true);
  expect(result.graftCue, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

// sprint 422 — the splice's own leg: a grafted wire mints 'Cut the splice'
// (the under's work, not the house's weld), the cut disarms it like any
// wire, and its fresh 'work' sign reads back to the player as warm dust.
test('the splice reads as the under\'s work — cut it, and the dust keeps a hand', async ({ page }) => {
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
      godMode: boolean; currentRoom: number; keys: Set<string>;
      hazard: { snares: { room: number; armed: boolean; grafted?: boolean; planted?: boolean; pos: { x: number; y: number; z: number } }[];
        evidence: { pos: { x: number; y: number; z: number }; room: number; kind: string;
          t: number; readBy: string[]; old?: boolean; wiped?: boolean }[] };
    };
    ga.godMode = true;
    const room = g.route.rooms.find((r) => !r.flooded && !r.scheduled?.length)
      ?? g.route.rooms.find((r) => !r.flooded);
    if (!room) return { stage: 'no-room' } as const;
    // plant the graft by hand — a live splice plus the sign it signed
    const gx = room.origin.x + 0.5, gz = room.origin.z + 0.5;
    ga.hazard.snares.push({ pos: { x: gx, y: 0, z: gz }, room: room.index, armed: true, grafted: true });
    ga.hazard.evidence.push({ pos: { x: gx, y: 0, z: gz }, room: room.index,
      kind: 'work', t: (g.clock as { time: number }).time, readBy: [] });
    g.player.teleport(gx - 1.4, 0, gz - 1.4);
    ga.currentRoom = room.index;
    for (let f = 0; f < 25; f++) g.frame();
    for (const e of (g.entities as unknown as { done?(): void }[])) e.done?.();
    for (let f = 0; f < 20; f++) g.frame();
    const dustRead = caps.some((c) => /dust keeps a hand/.test(c));
    const spliceMinted = g.interaction.interactables.some(
      (i) => i.kind === 'snip' && /splice/i.test(i.prompt ?? ''));
    let lock: { x: number; z: number; dy: number } | null = null;
    for (let k = 0; k < 12 && !lock; k++) {
      const a = (k / 12) * Math.PI * 2;
      const sx = gx + Math.sin(a) * 1.1, sz = gz + Math.cos(a) * 1.1;
      for (const dy of [0.7, 0.45, 0.2, 0]) {
        g.player.teleport(sx, 0, sz);
        g.player.yaw = Math.atan2(gx - sx, gz - sz);
        const eyeY = g.player.pos.y + g.player.eyeHeight;
        g.player.pitch = Math.max(-1.45, Math.min(1.45,
          Math.atan2(0.06 + dy - eyeY, Math.hypot(gx - sx, gz - sz) || 1)));
        g.frame();
        if (/cut the splice/i.test(g.interaction.focused?.prompt ?? '')) { lock = { x: sx, z: sz, dy }; break; }
      }
    }
    let cut = false;
    for (let f = 0; f < 160 && !cut && lock; f++) {
      const it = g.interaction.interactables.find((i) => i.kind === 'snip' && i.enabled);
      if (!it) break;
      g.player.teleport(lock.x, 0, lock.z);
      g.player.yaw = Math.atan2(it.pos.x - lock.x, it.pos.z - lock.z);
      const eyeY = g.player.pos.y + g.player.eyeHeight;
      g.player.pitch = Math.max(-1.45, Math.min(1.45,
        Math.atan2(it.pos.y + lock.dy - eyeY, Math.hypot(it.pos.x - lock.x, it.pos.z - lock.z) || 1)));
      if (/cut the splice/i.test(g.interaction.focused?.prompt ?? '')) ga.keys.add('KeyE');
      g.frame();
      cut = caps.some((c) => /splice parts|seal parts/.test(c));
    }
    ga.keys.delete('KeyE');
    const gAny = g as unknown as {
      activeSlot: number; useActiveSlot(): void;
      inventory: { id: string; count: number }[] };
    const coilCarried = gAny.inventory.some((i) => i.id === 'wireCoil' && i.count > 0);
    const spliceGone = !ga.hazard.snares.some((s) => s.grafted === true && s.room === room.index);
    // phase 2 — the coil changes hands: lay it yourself, pull it free
    let laid = false, pullMinted = false, reclaimed = false;
    if (coilCarried) {
      // activeSlot indexes the filtered slot-item list, not raw inventory
      const NONSLOT = new Set(['imprints', 'marginalia']);
      const slotIdx = gAny.inventory.filter((i) => !NONSLOT.has(i.id))
        .findIndex((i) => i.id === 'wireCoil');
      gAny.activeSlot = slotIdx;
      g.player.teleport(room.origin.x - 1.5, 0, room.origin.z - 1.5);
      g.player.yaw = Math.atan2(room.origin.x - g.player.pos.x, room.origin.z - g.player.pos.z);
      g.player.pitch = -0.9;
      gAny.useActiveSlot();
      g.frame();
      laid = ga.hazard.snares.some((s) => s.planted === true && s.armed && s.room === room.index);
      for (let f = 0; f < 10; f++) g.frame();
      pullMinted = g.interaction.interactables.some(
        (i) => i.kind === 'snip' && /pull the wire free/i.test(i.prompt ?? ''));
      // pull it back — reuse the hunt loop on the planted wire
      const pw = ga.hazard.snares.find((s) => s.planted === true && s.armed && s.room === room.index);
      if (pw) {
        let lock2: { x: number; z: number; dy: number } | null = null;
        for (let k = 0; k < 12 && !lock2; k++) {
          const a = (k / 12) * Math.PI * 2;
          const sx = pw.pos.x + Math.sin(a) * 1.1, sz = pw.pos.z + Math.cos(a) * 1.1;
          for (const dy of [0.7, 0.45, 0.2, 0]) {
            g.player.teleport(sx, 0, sz);
            g.player.yaw = Math.atan2(pw.pos.x - sx, pw.pos.z - sz);
            const eyeY = g.player.pos.y + g.player.eyeHeight;
            g.player.pitch = Math.max(-1.45, Math.min(1.45,
              Math.atan2(0.06 + dy - eyeY, Math.hypot(pw.pos.x - sx, pw.pos.z - sz) || 1)));
            g.frame();
            if (/pull the wire free/i.test(g.interaction.focused?.prompt ?? '')) { lock2 = { x: sx, z: sz, dy }; break; }
          }
        }
        for (let f = 0; f < 140 && !reclaimed && lock2; f++) {
          const it = g.interaction.interactables.find((i) => i.kind === 'snip' && i.enabled
            && /pull the wire free/i.test(i.prompt ?? ''));
          if (!it) break;
          g.player.teleport(lock2.x, 0, lock2.z);
          g.player.yaw = Math.atan2(it.pos.x - lock2.x, it.pos.z - lock2.z);
          const eyeY = g.player.pos.y + g.player.eyeHeight;
          g.player.pitch = Math.max(-1.45, Math.min(1.45,
            Math.atan2(it.pos.y + lock2.dy - eyeY, Math.hypot(it.pos.x - lock2.x, it.pos.z - lock2.z) || 1)));
          if (/pull the wire free/i.test(g.interaction.focused?.prompt ?? '')) ga.keys.add('KeyE');
          g.frame();
          reclaimed = caps.some((c) => /comes back to your hand/.test(c))
            && !ga.hazard.snares.some((s) => s.planted === true && s.room === room.index);
        }
        ga.keys.delete('KeyE');
      }
    }
    return { stage: 'done', dustRead, spliceMinted, hunted: !!lock, cut,
      disarmed: spliceGone, coilCarried, laid, pullMinted, reclaimed,
      caps: caps.slice(-10) } as const;
  });

  if (result.stage === 'no-room') test.skip();
  expect(result.stage, JSON.stringify(result)).toBe('done');
  expect(result.dustRead, JSON.stringify(result)).toBe(true);
  expect(result.spliceMinted, JSON.stringify(result)).toBe(true);
  expect(result.hunted, JSON.stringify(result)).toBe(true);
  expect(result.cut, JSON.stringify(result)).toBe(true);
  expect(result.disarmed, JSON.stringify(result)).toBe(true);
  expect(result.coilCarried, 'a cut splice rides the pack').toBe(true);
  expect(result.laid, 'the coil unwinds at your feet').toBe(true);
  expect(result.pullMinted, 'your own wire offers Pull the wire free').toBe(true);
  expect(result.reclaimed, JSON.stringify(result)).toBe(true);
  expect(errors).toEqual([]);
});

// sprint 469 — the review's coverage hole: a warden mid-strain on a wired
// leaf loses the bind to the player's own snip. The first strain leaves him
// standing in 'working' (~2.2s, hands in the bind); cutting inside that
// window frees the leaf under his hands — he shoulders the now-free leaf
// through instead of parting it, and the coil comes back to your hand, not
// the floor.
test('the cut answers mid-strain — the warden\'s bound leaf walks free under its hands', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // 's'

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    type GRoom = (typeof g.route.rooms)[number];
    const inRoom = (r: GRoom, x: number, z: number) => {
      const w = (r.width ?? 0) / 2, d = (r.depth ?? 0) / 2;
      return Math.abs(x - r.origin.x) <= w - 0.4 && Math.abs(z - r.origin.z) <= d - 0.4;
    };
    const ga = g as unknown as {
      entities: { id: string; state: string; threatPos(): { x: number; z: number } | null }[];
      giveItem(id: string, n?: number): void;
      inventory: { id: string; count: number }[];
      spawnById(id: string): void;
      currentRoom: number;
    };
    ga.giveItem('wireCoil', 2);
    const coilCount = () => ga.inventory.find((i) => i.id === 'wireCoil')?.count ?? -1;

    const aimHold = (id: string, done: () => boolean, frames = 90): boolean => {
      const lp = g.player as unknown as { lookDir(out: { x: number; y: number; z: number }): void };
      const orig = lp.lookDir.bind(lp);
      const sys = g.interaction as unknown as {
        focus: (eye: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }, pos: { x: number; y: number; z: number }) => typeof g.interaction.focused;
        focused: unknown;
      };
      const origFocus = sys.focus.bind(sys);
      let seen = false;
      for (let f = 0; f < frames && !done(); f++) {
        const pt = g.interaction.interactables.find((i) => i.id === id);
        if (!pt) { g.frame(); continue; }
        seen = true;
        lp.lookDir = (out) => {
          const dx = pt.pos.x - g.player.pos.x, dy = pt.pos.y + 0.6 - g.player.eyeHeight, dz = pt.pos.z - g.player.pos.z;
          const L = Math.hypot(dx, dy, dz) || 1;
          out.x = dx / L; out.y = dy / L; out.z = dz / L;
        };
        sys.focus = (eye, look, pos) => {
          const here = g.interaction.interactables.find((i) => i.id === id);
          const r = here ?? origFocus(eye, look, pos);
          sys.focused = r ?? null;
          return r;
        };
        if ((g.interaction.focused as { id?: string } | null)?.id === id) g.keys.add('KeyE');
        g.frame();
      }
      lp.lookDir = orig;
      sys.focus = origFocus;
      g.keys.delete('KeyE');
      return seen;
    };

    const main = g.route.rooms.filter((r) => r.index >= 0).sort((a, b) => a.index - b.index);
    let host: GRoom | null = null, next: GRoom | null = null;
    let door: { id: string; pos: { x: number; z: number }; yaw: number; heldBy?: string; locked?: boolean; falseDoor?: boolean; openT?: number; opening?: boolean } | null = null;
    let intoHost = { x: 0, z: 0 };
    for (let i = 0; i < main.length - 1 && !door; i++) {
      const cand = main[i + 1].doors?.find((d) => d.id === `door-${main[i + 1].index}-in`
        && !d.locked && !d.falseDoor && (d.openT ?? 0) <= 0.4);
      if (!cand) continue;
      const hx = main[i].origin.x - cand.pos.x, hz = main[i].origin.z - cand.pos.z;
      const L = Math.hypot(hx, hz) || 1;
      // the leaf must sit well inside the shared wall — player stands 0.9m
      // in, the noise lands 1.8m in, the warden parks 1.5m out
      if (!inRoom(main[i], cand.pos.x + (hx / L) * 1.8, cand.pos.z + (hz / L) * 1.8)) continue;
      if (!inRoom(main[i + 1], cand.pos.x - (hx / L) * 1.5, cand.pos.z - (hz / L) * 1.5)) continue;
      host = main[i]; next = main[i + 1]; door = cand;
      intoHost = { x: hx / L, z: hz / L };
    }
    if (!door || !host || !next) return { stage: 'no-door-pair' } as const;

    // stand just inside host, crouched — wire the leaf
    g.player.teleport(door.pos.x + intoHost.x * 0.9, 0, door.pos.z + intoHost.z * 0.9);
    ga.currentRoom = host.index;
    g.keys.add('KeyC');
    for (let f = 0; f < 10; f++) g.frame();
    if (!aimHold(`wire-${door.id}`, () => door!.heldBy === 'wired', 120)) {
      return { stage: 'no-wire-verb', caps: caps.slice(-6) } as const;
    }
    const bound = door.heldBy === 'wired';
    const coilsAfterBind = coilCount();

    // the warden patrols the room beyond — park it by the leaf. Slice off
    // the entities list first: the seed's own warden may already walk
    // another floor, and only the NEW one anchors here.
    g.player.teleport(next.origin.x, 0, next.origin.z);
    ga.currentRoom = next.index;
    for (let f = 0; f < 10; f++) g.frame();
    const beforeEnts = ga.entities.length;
    ga.spawnById('warden');
    for (let f = 0; f < 16; f++) g.frame();
    const wd = ga.entities.slice(beforeEnts).find((e) => e.id === 'warden' && e.state === 'engage') as unknown as
      { id: string; state: string; pos: { x: number; y: number; z: number }; threatPos(): { x: number; z: number };
        investigate: { x: number; y: number; z: number } | null } | undefined;
    if (!wd) return { stage: 'no-warden', ents: ga.entities.map((e) => e.id), bound } as const;
    wd.pos.x = door.pos.x - intoHost.x * 1.5; wd.pos.z = door.pos.z - intoHost.z * 1.5;

    // player back at the leaf — and a noise deep into host pulls the warden
    // in. `hear` gates cross-room noise on an atRoomDoor check whose host-side
    // leaf isn't guaranteed on every boundary shape; set the same investigate
    // field it writes — the check it walks to is what the strain answers.
    g.player.teleport(door.pos.x + intoHost.x * 0.9, 0, door.pos.z + intoHost.z * 0.9);
    for (let f = 0; f < 8; f++) g.frame();
    wd.investigate = { x: door.pos.x + intoHost.x * 1.8, y: 0, z: door.pos.z + intoHost.z * 1.8 };

    // he walks the leaf and puts his hands in the bind — the strain cue
    let strained = false;
    for (let f = 0; f < 200 && !strained; f++) {
      g.frame();
      if (caps.some((c) => /works at the wire/.test(c))) strained = true;
    }
    if (!strained) {
      const tp = wd.pos;
      return { stage: 'no-strain', bound, wdAt: { x: tp.x, z: tp.z },
        dist: Math.hypot(tp.x - door.pos.x, tp.z - door.pos.z),
        caps: caps.slice(-8) } as const;
    }

    // mid-strain: 'Cut the wired leaf free' — ~0.9s inside his ~2.2s work
    const countBeforeCut = coilCount();
    const cutSeen = aimHold(`unwire-${door.id}`, () => door!.heldBy === undefined, 70);
    const cut = door.heldBy === undefined;
    const coilsAfterCut = coilCount();
    const cutCue = caps.some((c) => /coil comes back to your hand/.test(c));

    // the leaf frees under his hands — he shoulders the now-free leaf
    // through and the bind never 'parts'
    let crossed = false, leafOpen = false;
    for (let f = 0; f < 300 && !crossed; f++) {
      g.frame();
      if ((door.opening ?? false) || (door.openT ?? 0) > 0.05) leafOpen = true;
      const tp = wd.pos;
      if ((tp.x - door.pos.x) * intoHost.x + (tp.z - door.pos.z) * intoHost.z > 0.5) crossed = true;
    }
    g.keys.delete('KeyC');
    const partsCue = caps.some((c) => /wire parts under its hands/.test(c));

    return { stage: 'done', bound, coilsAfterBind, cutSeen, cut, cutCue,
      countBeforeCut, coilsAfterCut, leafOpen, crossed, partsCue,
      wireCaps: caps.filter((c) => /wire|leaf|bind|strain|coil|shoulder/i.test(c)),
      caps: caps.slice(-10) } as const;
  });

  if (result.stage === 'no-door-pair' || result.stage === 'no-warden') test.skip();
  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const tail = (result.wireCaps ?? []).join(' | ') + ' // ' + (result.caps ?? []).join(' | ');
  expect(result.bound, 'the leaf never bound').toBe(true);
  expect(result.coilsAfterBind).toBe(1);
  expect(result.cutSeen, `the snip never minted on the strained leaf — ${tail}`).toBe(true);
  expect(result.cut, `the leaf never freed under your snip — ${tail}`).toBe(true);
  expect(result.cutCue, `the coil never came back to hand — ${tail}`).toBe(true);
  expect(result.coilsAfterCut).toBe(2);
  expect(result.partsCue, `the warden parted it anyway — ${tail}`).toBe(false);
  expect(result.leafOpen, `the leaf never swung free — ${tail}`).toBe(true);
  expect(result.crossed, `the warden never walked through — ${tail}`).toBe(true);
  expect(errors).toEqual([]);
});
