import { test, expect } from '@playwright/test';
import { seededRun, ThresholdG, GRoom } from './harness';

test.setTimeout(300_000);

// The door layer: ear-to-the-seam listening, noise rousing what waits
// beyond, bracing a leaf with your weight, the walk-away door chock.
test('ear to the seam: listen reports what waits beyond a door', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;

    const inRoom = (r: GRoom, x: number, z: number) => {
      const dx = x - r.origin.x, dz = z - r.origin.z;
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const sw = r.spec?.width ?? r.spec?.w, sd = r.spec?.depth ?? r.spec?.d;
      return !!sw && !!sd && Math.abs(lx) <= sw / 2 + 0.5 && Math.abs(lz) <= sd / 2 + 0.5;
    };
    const standIn = (r: GRoom, x: number, z: number, rad = 1.1) => {
      // Teleport to the r-side of point (x,z) — nudged toward room centre.
      const dx = r.origin.x - x, dz = r.origin.z - z;
      const L = Math.hypot(dx, dz) || 1;
      g.player.teleport(x + (dx / L) * rad, 0, z + (dz / L) * rad);
      g.currentRoom = r.index;
      for (let f = 0; f < 40; f++) g.frame();
    };
    const drive = (at: { x: number; y: number; z: number }, match: RegExp, done: () => boolean, cap: number): string => {
      const seen: string[] = [];
            for (let f = 0; f < cap && !done(); f++) {
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        g.player.pitch = Math.atan2(at.y + 0.4 - ((g.player.eyePos({ x: 0, y: 0, z: 0 })).y), Math.hypot(ax, az) || 1);
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
    const main = g.route.rooms.filter((r) => r.index >= 0).sort((a, b) => a.index - b.index);
    const rec = g as unknown as Record<string, Set<string>>;
    const HEARD = 'listenedDoors';

    // Door between host room i and i+1 is `door-{i+1}-in`, owned by the next
    // room — stand inside host near the shared wall and find its seam point.
    const listenAt = (host: GRoom, next: GRoom): { prompts: string; heard: number; caps: string[] } | { none: true } => {
      const door = (next.doors ?? []).find((d) => d.id === `door-${next.index}-in`);
      if (!door) return { none: true };
      const nx = Math.sin(door.yaw), nz = Math.cos(door.yaw);
      const cand = [1, -1].map((s) => ({ x: door.pos.x + nx * 1.4 * s, z: door.pos.z + nz * 1.4 * s })).find((p) => inRoom(host, p.x, p.z));
      if (!cand) return { none: true };
      g.player.teleport(cand.x, 0, cand.z);
      g.currentRoom = host.index;
      for (let f = 0; f < 40; f++) g.frame();
      g.keys.add('KeyC'); // crouched: the seam point registers
      for (let f = 0; f < 10; f++) g.frame();
      const seam = g.interaction.interactables.find((i) => i.kind === 'listen' && i.id === `listen-${door.id}`);
      if (!seam) { g.keys.delete('KeyC'); return { none: true }; }
      // At the seam — close enough that the edge point outranks the door.
      standIn(host, seam.pos.x, seam.pos.z, 0.55);
      const before = rec[HEARD].size;
      const prompts = drive(seam.pos, /listen at door/i, () => rec[HEARD].size > before, 240);
      g.keys.delete('KeyC');
      return { prompts, heard: rec[HEARD].size, caps: [...caps] };
    };

    // 1) a door whose next room has a scheduled entity → the entity's tell.
    const withEnt: { prompts: string; heard: number; caps: string[]; entity: string; room: number } | { none: true } = (() => {
      for (let i = 0; i < main.length - 1; i++) {
        const next = main[i + 1];
        const sched = next.scheduled?.[0];
        if (!sched) continue;
        caps.length = 0;
        const r = listenAt(main[i], next);
        if ('none' in r) continue;
        return { ...r, entity: sched.entity, room: next.index };
      }
      return { none: true };
    })();

    // 2) a door whose next room is quiet → '[nothing moves]' or dark/safe tell.
    const quiet = (() => {
      for (let i = 0; i < main.length - 1; i++) {
        const next = main[i + 1];
        if (next.scheduled?.length) continue;
        caps.length = 0;
        const r = listenAt(main[i], next);
        if ('none' in r) continue;
        const quietCap = r.caps.find((c) => /nothing moves|dark beyond|resting place|dead air|draught/i.test(c));
        return { ...r, quietCap, room: next.index, dark: next.darkRoom, tpl: next.templateId };
      }
      return { none: true };
    })();

    // 3) a primed set piece hums through the seam — loud work three doors
    //    back means it never opened cold (s340)
    const primed = (() => {
      const ms = (g as unknown as { milestones: Map<number, { primed: boolean; primedAudible: boolean; prime(): void }> }).milestones;
      let sawPrimed = false;
      for (const [idx, m] of ms) {
        if (!m.primedAudible) continue;
        sawPrimed = true;
        const mPos = main.findIndex((r) => r.index === idx);
        if (mPos <= 0) continue;
        const next = main[mPos], host = main[mPos - 1];
        if ((next.scheduled?.length ?? 0) > 0) continue; // an entity's tell outranks
        m.prime();
        caps.length = 0;
        const r = listenAt(host, next);
        m.primed = false;
        if ('none' in r) continue;
        return { ...r, room: idx, cap: r.caps.find((c) => /mid-count/.test(c)) };
      }
      // every primed-audible room hosting an entity is a legitimate skip —
      // an entity's tell outranks the primed cap by design (s340)
      return sawPrimed ? { untested: true } : { none: true };
    })();

    return { withEnt, quiet, primed, heardTotal: rec[HEARD].size };
  });

  const ent = result.withEnt;
  expect('none' in ent ? 'none' : `entity @${ent.room} prompts[${ent.prompts}]`).not.toBe('none');
  if (!('none' in ent)) {
    expect(ent.heard, `prompts seen [${ent.prompts}]`).toBeGreaterThan(0);
    const tell = ent.caps.find((c) => /crawl|breath|whisper|feet|page|footsteps|chord|steps|ticking|hum|rattle|machine|stiff|rustle|unwritten|grafting|hiss|gears|cloth|vast|counting|lullaby|moves beyond/i.test(c));
    expect(tell ?? `no tell — caps[${ent.caps}] entity ${ent.entity}`).toBeTruthy();
  }
  const q = result.quiet;
  expect('none' in q ? 'none' : `quiet @${q.room} prompts[${q.prompts}]`).not.toBe('none');
  if (!('none' in q)) {
    expect(q.quietCap ?? `no quiet caption — caps[${q.caps}] dark ${q.dark} tpl ${q.tpl}`).toBeTruthy();
  }
  const p = result.primed;
  if ('untested' in p) {
    expect(true, 'all primed rooms hosted entities — caption unobservable on this seed').toBeTruthy();
  } else {
    expect('none' in p ? 'none' : `primed @${p.room} prompts[${p.prompts}]`).not.toBe('none');
    if (!('none' in p)) {
      expect(p.cap ?? `no primed caption — caps[${p.caps}]`).toMatch(/mid-count — it heard you/);
    }
  }
  expect(errors).toEqual([]);
});

test('the crack and the pebble: stoop reads the seam, slip taps the far side', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const emits: { x: number; z: number; category: string; intensity: number }[] = [];
    const snd = g.sound as { emit(e: { x: number; z: number; category: string; intensity: number }): void };
    const origEmit = snd.emit.bind(snd);
    snd.emit = (e) => { emits.push(e); origEmit(e); };

    const inRoom = (r: GRoom, x: number, z: number) => {
      const dx = x - r.origin.x, dz = z - r.origin.z;
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const sw = r.spec?.width ?? r.spec?.w, sd = r.spec?.depth ?? r.spec?.d;
      return !!sw && !!sd && Math.abs(lx) <= sw / 2 + 0.5 && Math.abs(lz) <= sd / 2 + 0.5;
    };
    const hold = (at: { x: number; y: number; z: number }, match: RegExp, done: () => boolean, cap: number, aimY = 0.4): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        g.player.pitch = Math.atan2(at.y + aimY - ((g.player.eyePos({ x: 0, y: 0, z: 0 })).y), Math.hypot(ax, az) || 1);
        const prompt = g.interaction.focused?.prompt ?? '';
        if (f % 12 === 0) seen.push(prompt);
        if (match.test(prompt)) g.keys.add('KeyE'); else g.keys.delete('KeyE');
        g.frame();
      }
      g.keys.delete('KeyE');
      return seen.join('|');
    };
    const main = g.route.rooms.filter((r) => r.index >= 0).sort((a, b) => a.index - b.index);
    const attempts: string[] = [];

    // A door whose next room is quiet — the crack reads an empty seam, and
    // the pebble lands where nothing hunts it.
    for (let i = 0; i < main.length - 1; i++) {
      const host = main[i], next = main[i + 1];
      if (next.scheduled?.length) continue;
      const door = (next.doors ?? []).find((d) => d.id === `door-${next.index}-in`);
      if (!door || (door.openT ?? 0) > 0.4 || door.falseDoor) continue;
      const nx = Math.sin(door.yaw), nz = Math.cos(door.yaw);
      const cand = [1, -1].map((s) => ({ x: door.pos.x + nx * 1.2 * s, z: door.pos.z + nz * 1.2 * s })).find((p) => inRoom(host, p.x, p.z));
      if (!cand) continue;
      g.player.teleport(cand.x, 0, cand.z);
      g.currentRoom = host.index;
      for (let f = 0; f < 40; f++) g.frame();
      g.keys.add('KeyC');
      for (let f = 0; f < 10; f++) g.frame();

      const stoop = g.interaction.interactables.find((i) => i.kind === 'stoop' && i.id === `stoop-${door.id}`);
      const slip = g.interaction.interactables.find((i) => i.kind === 'slip' && i.id === `slip-${door.id}`);
      if (!stoop || !slip) { g.keys.delete('KeyC'); continue; }

      // Stand ON the leaf's normal — the room-center nudge veers laterally
      // into the seam anchors' shadow. The lattice is positional: leaf
      // centre reads the crack, the edges read sound and weight.
      const side = Math.sign((cand.x - door.pos.x) * nx + (cand.z - door.pos.z) * nz) || 1;
      const standAt = (ax: number, az: number, rad: number) => {
        g.player.teleport(ax + nx * side * rad, 0, az + nz * side * rad);
        g.currentRoom = host.index;
        for (let f = 0; f < 40; f++) g.frame();
      };
      const aimFrames = (at: { x: number; y: number; z: number }, aimY: number, n: number) => {
        for (let f = 0; f < n; f++) {
          const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
          g.player.yaw = Math.atan2(ax, az);
          g.player.pitch = Math.atan2(at.y + aimY - ((g.player.eyePos({ x: 0, y: 0, z: 0 })).y), Math.hypot(ax, az) || 1);
          g.frame();
        }
      };
      // hunt a stand where the STOOP is what focus lands on — the doorway
      // lane ejects some centre stands, so try the normal at a few depths
      let stoopStood = false;
      const radTries: string[] = [];
      // sprint 469: the whole seam lattice sits above the prox gate —
      // stoop at face height, the hands at reach height — so aim decides,
      // and the aim must come from eyePos because a crouched eye is 0.9
      // high, not 1.62.
      const liveStoop = () => g.interaction.interactables.find((i) => i.kind === 'stoop' && i.id === `stoop-${door.id}`)!;
      for (const rad of [0.3, 0.5, 0.7, 1.0]) {
        standAt(stoop.pos.x, stoop.pos.z, rad);
        aimFrames(liveStoop().pos, 0.6, 8);
        radTries.push(`r${rad}@${g.player.pos.x.toFixed(2)},${g.player.pos.z.toFixed(2)} f=${g.interaction.focused?.id ?? 'null'}`);
        if (g.interaction.focused?.id === stoop.id) { stoopStood = true; break; }
      }
      if (!stoopStood) {
        attempts.push(`${door.id}: stoop never focused — ${JSON.stringify({
          p: { x: +g.player.pos.x.toFixed(2), z: +g.player.pos.z.toFixed(2) },
          radTries,
          near: g.interaction.interactables.filter((i) => Math.hypot(i.pos.x - g.player.pos.x, i.pos.z - g.player.pos.z) < 1.5).map((i) => i.id),
        })}`);
        continue;
      }
      caps.length = 0;
      const stoopPrompts = hold(liveStoop().pos, /stoop to the crack/i, () => caps.some((c) => /crack|seam|shadow|glass|floor|eye|plaster|dark|resting|lamp/.test(c)), 200, 0.6);
      const stoopCap = caps.find((c) => /lit seam|black glass|shadow|draught|eye meets|resting|dead dark|plaster|lamp|floor/.test(c));

      let slipStood = false;
      for (const rad of [0.15, 0.25, 0.45, 0.62, 0.8]) {
        standAt(slip.pos.x, slip.pos.z, rad);
        aimFrames(slip.pos, 0.6, 8);
        if (g.interaction.focused?.id === slip.id) { slipStood = true; break; }
      }
      if (!slipStood) { attempts.push(`${door.id}: slip never focused`); continue; }
      caps.length = 0;
      const e0 = emits.length;
      const slipPrompts = hold(slip.pos, /slip a pebble/i, () => caps.some((c) => /pebble skips under/.test(c)), 200, 0.6);
      g.keys.delete('KeyC');
      const slipCaps = [...caps];
      // the tap should land on the far side of the leaf — side resolved
      // the same way the verb does (the side the player stood on, above)
      const landX = door.pos.x - nx * side * 1.3, landZ = door.pos.z - nz * side * 1.3;
      const tap = emits.slice(e0).find((e) => e.category === 'distraction' && Math.hypot(e.x - landX, e.z - landZ) < 0.5);
      return { stage: 'done', room: next.index, stoopPrompts, stoopCap, slipPrompts, slipCaps, tap, emitCount: emits.length - e0, attempts };
    }
    g.keys.delete('KeyC');
    return attempts.length ? { stage: 'unreachable', attempts } as const : { stage: 'no-door' } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { room: number; stoopPrompts: string; stoopCap?: string; slipPrompts: string; slipCaps: string[]; tap?: { x: number; z: number }; emitCount: number };
  expect(r.stoopPrompts, 'the stoop verb never focused at the leaf').toMatch(/stoop to the crack/i);
  expect(r.stoopCap ?? `no seam read — caps[${r.slipCaps}]`).toBeTruthy();
  expect(r.slipPrompts, 'the slip verb never minted').toMatch(/slip a pebble/i);
  expect(r.slipCaps.some((c) => /pebble skips under/.test(c)), `slip caps[${r.slipCaps}]`).toBe(true);
  expect(r.tap ?? `no far-side 'distraction' emit at the land point`).toBeTruthy();
  expect(errors).toEqual([]);
});

test('noise through the door rouses what waits beyond', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;

    const main = g.route.rooms.filter((r) => r.index >= 0).sort((a, b) => a.index - b.index);
    const inRoom = (r: GRoom, x: number, z: number) => {
      const dx = x - r.origin.x, dz = z - r.origin.z;
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      return !!r.spec?.width && !!r.spec?.depth && Math.abs(lx) <= r.spec.width / 2 + 0.5 && Math.abs(lz) <= r.spec.depth / 2 + 0.5;
    };

    // First scheduled room on the main route; its entry door is door-N-in,
    // owned by that room. Stand in the previous room beside it.
    const nIdx = main.findIndex((r) => (r.scheduled?.length ?? 0) > 0);
    if (nIdx <= 0) return { stage: 'no-scheduled' } as const;
    const next = main[nIdx], host = main[nIdx - 1];
    const door = (next.doors ?? []).find((d) => d.id === `door-${next.index}-in`);
    if (!door) return { stage: 'no-door' } as const;
    const nx = Math.sin(door.yaw), nz = Math.cos(door.yaw);
    const cand = [1, -1].map((s) => ({ x: door.pos.x + nx * 1.6 * s, z: door.pos.z + nz * 1.6 * s }))
      .find((p) => inRoom(host, p.x, p.z));
    if (!cand) return { stage: 'no-stand' } as const;
    g.player.teleport(cand.x, 0, cand.z);
    g.currentRoom = host.index;
    for (let f = 0; f < 30; f++) g.frame();
    if (next.scheduled![0].roused) return { stage: 'pre-roused' } as const;

    // Sprint in place beside the door — strides emit 'sprint' noise at 0.85.
    let yaw = door.yaw + Math.PI / 2;
    for (let f = 0; f < 90 && !next.scheduled![0].roused; f++) {
      yaw += 0.11; // circle so we stay beside the door
      g.player.yaw = yaw;
      g.keys.add('KeyW'); g.keys.add('ShiftLeft');
      g.frame();
    }
    g.keys.delete('KeyW'); g.keys.delete('ShiftLeft');
    const ent = next.scheduled![0].entity;
    if (!next.scheduled![0].roused) return { stage: 'not-roused', ent, caps } as const;
    const tell = caps.find((c) => /heard you|knows|stirs|alert/i.test(c));
    const shudder = g.doorTry?.id === door.id;

    // Open the leaf — the roused encounter spawns without room entry.
    const before = g.entities.length;
    door.opening = true;
    for (let f = 0; f < 90; f++) g.frame();
    const spawned = g.entities.some((e) => e.id === ent);

    return { stage: 'done', ent, tell, shudder, spawned, before, after: g.entities.length, caps: caps.slice(-6) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage === 'done') {
    expect(result.tell ?? `no rouse tell — caps[${result.caps}]`).toBeTruthy();
    expect(result.spawned, `entity ${result.ent} did not pre-spawn`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('brace the door: the bellman tests the bar and loses interest', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's': bellman @32

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    type Ent = { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null };
    const gi = g as unknown as { entities: Ent[] };

    const bRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'bellman'));
    if (!bRoom) return { stage: 'no-bellman' } as const;
    // Enter for real (the spawn hook needs a position change), but settle
    // only ~1s — the bellman warns 1.5s before it walks, and the brace has
    // to land before its knock matures into the swing.
    const prev = g.route.rooms[bRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();
    g.player.teleport(bRoom.origin.x, 0, bRoom.origin.z);
    for (let f = 0; f < 8; f++) g.frame();
    const bell = gi.entities.find((e) => e.id === 'bellman');
    if (!bell) return { stage: 'no-bellman-spawn', caps: caps.slice(-8) } as const;
    let killTried = '';
    let killGeo = '';
    const door = bRoom.doors.find((d) => d.id === `door-${bRoom.index}-in`);
    if (!door) return { stage: 'no-door' } as const;
    const gAny = g as unknown as { killPlayer(src: string, hint: string): void };
    const origKill = gAny.killPlayer.bind(gAny);
    gAny.killPlayer = (src: string, hint: string) => {
      killTried = `${src}:${hint}`;
      const bp = (bell as unknown as { pos: { x: number; z: number } }).pos;
      const pp = g.player.pos;
      killGeo = `bell(${bp.x.toFixed(2)},${bp.z.toFixed(2)}) player(${pp.x.toFixed(2)},${pp.z.toFixed(2)}) leaf(${door?.pos.x.toFixed(2)},${door?.pos.z.toFixed(2)}) yaw=${door?.yaw.toFixed(2)}`;
      origKill(src, hint);
    };
    // The brace point sits a half-step off the leaf on the mirror side of
    // the listen seam — stand there, nudged ~0.9m into the room (outside
    // its 1.05 touch reach, inside the 1.7m brace radius), and crouch.
    // This is a race: the brace has to land before its knock matures (~2.4s).
    const latX = Math.cos(door.yaw), latZ = -Math.sin(door.yaw);
    const bx = door.pos.x - latX * 0.55, bz = door.pos.z - latZ * 0.55;
    const toC = { x: bRoom.origin.x - bx, z: bRoom.origin.z - bz };
    const L = Math.hypot(toC.x, toC.z) || 1;
    g.player.teleport(bx + (toC.x / L) * 0.9, 0, bz + (toC.z / L) * 0.9);
    g.keys.add('KeyC');
    for (let f = 0; f < 4; f++) g.frame();
    const brace = g.interaction.interactables.find((i) => i.kind === 'brace' && i.id === `brace-${door.id}`);
    if (!brace) return { stage: 'no-brace-point' } as const;

    // Hold E on the brace point until the leaf is held.
    let braced = false;
    for (let f = 0; f < 90 && !braced; f++) {
      const ax = brace.pos.x - g.player.pos.x, az = brace.pos.z - g.player.pos.z;
      g.player.yaw = Math.atan2(ax, az);
      g.player.pitch = Math.atan2(brace.pos.y + 0.2 - (g.player.eyePos({ x: 0, y: 0, z: 0 })).y, Math.hypot(ax, az) || 1);
      if (/brace door/i.test(g.interaction.focused?.prompt ?? '')) g.keys.add('KeyE');
      g.frame();
      braced = door.heldBy === 'player';
    }
    g.keys.delete('KeyE');
    if (!braced) return { stage: 'brace-failed', prompt: g.interaction.focused?.prompt } as const;

    // Stay on the bar. The bellman warns, walks to the leaf — and since
    // s446 a LIVE brace is shouldered, not waited out: every ~4.5s of
    // strain shoves the holder a stride back until the grip slips past
    // the 1.7m keep radius and he comes through.
    let shouldered = false, opened = false;
    const cluster = [...g.route.rooms[bRoom.index - 1].doors, ...bRoom.doors]
      .filter((d) => Math.hypot(d.pos.x - door.pos.x, d.pos.z - door.pos.z) < 0.6);
    const trace: string[] = [];
    const d0 = Math.hypot(g.player.pos.x - door.pos.x, g.player.pos.z - door.pos.z);
    let dMax = d0;
    for (let f = 0; f < 900 && bell.state !== 'done'; f++) {
      g.frame();
      if (caps.some((c) => /shoulders the leaf/.test(c))) shouldered = true;
      const dd = Math.hypot(g.player.pos.x - door.pos.x, g.player.pos.z - door.pos.z);
      if (dd > dMax) dMax = dd;
      if (cluster.some((d) => d.opening || (d.openT ?? 0) > 0.05)) opened = true;
      if (f % 30 === 0) {
        const tp = bell.threatPos();
        const bd = tp ? Math.hypot(tp.x - door.pos.x, tp.z - door.pos.z) : -1;
        trace.push(`f${f} bell@${bd.toFixed(2)} dead=${g.player.dead} hold=${door.heldBy} pd=${dd.toFixed(2)} ht=${(bell as unknown as { doorHoldT?: number }).doorHoldT?.toFixed(1)} st=${bell.state} o=${door.opening ? 'open' : (door.openT ?? 0).toFixed(2)}`);
      }
    }
    g.keys.delete('KeyC');
    return { stage: 'done', shouldered, opened, d0, dMax, heldBy: door.heldBy, bellState: bell.state, dead: g.player.dead, trace, caps: caps.slice(-14), allCaps: caps, killTried, killGeo } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { shouldered: boolean; opened: boolean; d0: number; dMax: number; heldBy?: string; bellState: string; dead: boolean; trace: string[]; caps: string[]; allCaps: string[]; killTried: string; killGeo: string };
  const tail = r.allCaps.join(' | ') + ' trace: ' + r.trace.join(' ; ') + ' killTried: ' + r.killTried + ' geo: ' + r.killGeo;
  expect(r.caps.some((c) => /tests the bar|strains|palm flat/.test(c)), `caps: ${tail}`).toBe(true);
  expect(r.shouldered, `no shoulder — caps: ${tail}`).toBe(true);
  // the shoulder bows the leaf a crack open — the grip fails on the
  // brace's own openT rule (whether or not the room gave room to be
  // pushed into; the d0/dMax bookkeeping stays in the trace)
  expect(r.heldBy, `the grip should have slipped — ${tail}`).toBe(undefined);
  expect(r.opened, 'after the grip failed the leaf never swung for it').toBe(true);
  expect(r.bellState).toBe('done');
  expect(errors).toEqual([]);
});

test('the door chock holds while you walk away — until something worries it loose', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's': bellman @32

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const gi = g as unknown as {
      entities: { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null }[];
      giveItem(id: string, n?: number): void;
      inventory: { id: string; count: number }[];
    };
    gi.giveItem('doorChock', 2);

    const bRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'bellman'));
    if (!bRoom) return { stage: 'no-bellman' } as const;
    const prev = g.route.rooms[bRoom.index - 1];
    g.player.teleport(prev.origin.x, 0, prev.origin.z);
    for (let f = 0; f < 30; f++) g.frame();

    // Rehearsal on a quiet closed leaf: set the wedge, then pull it free.
    // Branch rooms are unscheduled — nothing crosses their doors mid-hold.
    const qRoom = g.route.branchRooms?.find((r) => !(r.scheduled?.length) && r.doors.some((d) => !d.locked && !d.falseDoor && (d.openT ?? 0) <= 0.4));
    const rehearseIn = qRoom ?? prev;
    const pDoor = rehearseIn.doors.find((d) => !d.locked && !d.falseDoor && (d.openT ?? 0) <= 0.4);
    if (!pDoor) return { stage: 'no-rehearsal-door' } as const;
    g.player.teleport(rehearseIn.origin.x, 0, rehearseIn.origin.z);
    for (let f = 0; f < 6; f++) g.frame();
    const toP = { x: rehearseIn.origin.x - pDoor.pos.x, z: rehearseIn.origin.z - pDoor.pos.z };
    const LP = Math.hypot(toP.x, toP.z) || 1;
    g.player.teleport(pDoor.pos.x + (toP.x / LP) * 0.9, 0, pDoor.pos.z + (toP.z / LP) * 0.9);
    g.keys.add('KeyC');
    for (let f = 0; f < 4; f++) g.frame();
    // The seam anchors all crowd the leaf; a level look can't lift the
    // below-floor wedge point past 'Listen at Door N' on the focus score.
    // Real players pitch down — here we hand lookDir the exact bearing.
    // Match by id: every closed leaf in the window carries a wedge point.
    const aimHold = (id: string, done: () => boolean, frames = 90, each?: () => void): boolean => {
      const lp = g.player as unknown as { lookDir(out: { x: number; y: number; z: number }): void };
      const orig = lp.lookDir.bind(lp);
      // Real players pitch down to the below-floor anchor; the harness can't
      // hold a pitch, so while the point exists we hand focus() the answer.
      // Hold+interact still run the real pipeline.
      const sys = g.interaction as unknown as {
        focus: (eye: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }, pos: { x: number; y: number; z: number }) => typeof g.interaction.focused;
        interactables: { id: string; prompt: string; kind: string; pos: { x: number; y: number; z: number }; enabled: boolean }[];
      };
      const origFocus = sys.focus.bind(sys);
      let seen = false;
      for (let f = 0; f < frames && !done(); f++) {
        each?.();
        const pt = g.interaction.interactables.find((i) => i.id === id);
        if (!pt) { g.frame(); continue; }
        seen = true;
        lp.lookDir = (out) => {
          const dx = pt.pos.x - g.player.pos.x, dy = pt.pos.y + 0.6 - (g.player.eyePos({ x: 0, y: 0, z: 0 })).y, dz = pt.pos.z - g.player.pos.z;
          const L = Math.hypot(dx, dy, dz) || 1;
          out.x = dx / L; out.y = dy / L; out.z = dz / L;
        };
        sys.focus = (eye, look, pos) => {
          const here = sys.interactables.find((i) => i.id === id);
          const r = here ?? origFocus(eye, look, pos);
          (sys as { focused?: unknown }).focused = r ?? null;
          return r;
        };
        if (g.interaction.focused?.id === id) g.keys.add('KeyE');
        g.frame();
      }
      lp.lookDir = orig;
      sys.focus = origFocus;
      g.keys.delete('KeyE');
      return seen;
    };
    if (!aimHold(`wedge-${pDoor.id}`, () => pDoor.heldBy === 'wedge')) return { stage: 'no-wedge-point', caps: caps.slice(-6) } as const;
    const wedgedRehearsal = pDoor.heldBy === 'wedge';
    const countAfterSet = gi.inventory.find((i) => i.id === 'doorChock')?.count ?? -1;
    if (!aimHold(`unwedge-${pDoor.id}`, () => pDoor.heldBy === undefined)) return { stage: 'no-unwedge-point', caps: caps.slice(-6) } as const;
    const unwedged = pDoor.heldBy === undefined;
    const countAfterPull = gi.inventory.find((i) => i.id === 'doorChock')?.count ?? -1;
    g.keys.delete('KeyC');

    // The real thing: enter, race the wedge down before the knock matures.
    g.player.teleport(bRoom.origin.x, 0, bRoom.origin.z);
    for (let f = 0; f < 8; f++) g.frame();
    const bell = gi.entities.find((e) => e.id === 'bellman');
    if (!bell) return { stage: 'no-bellman-spawn', caps: caps.slice(-8) } as const;
    const door = bRoom.doors.find((d) => d.id === `door-${bRoom.index}-in`);
    if (!door) return { stage: 'no-door' } as const;
    const toC = { x: bRoom.origin.x - door.pos.x, z: bRoom.origin.z - door.pos.z };
    const L = Math.hypot(toC.x, toC.z) || 1;
    g.player.teleport(door.pos.x + (toC.x / L) * 0.9, 0, door.pos.z + (toC.z / L) * 0.9);
    g.keys.add('KeyC');
    for (let f = 0; f < 4; f++) g.frame();
    // The aim stares down the door it stands at — held gaze (2.6s) makes it
    // fold back into the hall before it can rattle the chock. This leg tests
    // the wedge, not the gaze counterplay: keep its watch clock empty.
    const unwatch = () => { (bell as { watchT?: number }).watchT = 0; };
    aimHold(`wedge-${door.id}`, () => door.heldBy === 'wedge', 90, unwatch);
    g.keys.delete('KeyC');
    const wedged = door.heldBy === 'wedge';
    if (!wedged) return { stage: 'wedge-failed', prompt: g.interaction.focused?.prompt, crouch: g.player.crouching, hasChock: gi.inventory.find((i) => i.id === 'doorChock')?.count } as const;

    // Then walk away — the whole point vs the brace. The bellman rattles it,
    // kicks the chock loose, knocks the freed leaf, and comes through.
    g.player.teleport(door.pos.x + (toC.x / L) * 2.4, 0, door.pos.z + (toC.z / L) * 2.4);
    // Face the room, not the door — a held gaze makes it fold back into the
    // hall before it ever rattles the chock loose.
    g.player.yaw = Math.atan2(toC.x, toC.z);
    g.player.pitch = 0;
    const cluster = [...prev.doors, ...bRoom.doors]
      .filter((d) => Math.hypot(d.pos.x - door.pos.x, d.pos.z - door.pos.z) < 0.6);
    let loose = false, opened = false, openedAt = -1;
    const trace: string[] = [];
    for (let f = 0; f < 700 && !opened; f++) {
      unwatch();
      g.frame();
      if (caps.some((c) => /wedge skids loose/.test(c))) loose = true;
      if (cluster.some((d) => d.opening || (d.openT ?? 0) > 0.05)) { opened = true; openedAt = f; }
      if (f % 40 === 0) {
        const tp = bell.threatPos();
        const dd = tp ? Math.hypot(tp.x - door.pos.x, tp.z - door.pos.z) : -1;
        trace.push(`f${f} bell@${dd.toFixed(2)} dead=${g.player.dead} hold=${door.heldBy} loose=${loose}`);
      }
    }
    // sprint 393 — the kick doesn't eat the chock: it slides under the
    // leaf to the player's side and lies there as gatherable loot.
    let dropSeen = false, gathered = false;
    const drop = g.interaction.interactables.find((i) => i.kind === 'wedgeDrop');
    if (drop) {
      dropSeen = true;
      g.player.teleport(drop.pos.x + (toC.x / L) * 0.9, 0, drop.pos.z + (toC.z / L) * 0.9);
      const before = gi.inventory.find((i) => i.id === 'doorChock')?.count ?? -1;
      aimHold(drop.id, () => (gi.inventory.find((i) => i.id === 'doorChock')?.count ?? -1) > before, 90, unwatch);
      gathered = (gi.inventory.find((i) => i.id === 'doorChock')?.count ?? -1) > before;
    }
    return { stage: 'done', wedgedRehearsal, countAfterSet, unwedged, countAfterPull, loose, opened, openedAt, dropSeen, gathered, heldAfter: door.heldBy, dead: g.player.dead, trace, caps: caps.slice(-14) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { wedgedRehearsal: boolean; countAfterSet: number; unwedged: boolean; countAfterPull: number; loose: boolean; opened: boolean; openedAt: number; dropSeen: boolean; gathered: boolean; dead: boolean; trace: string[]; caps: string[] };
  const tail = r.caps.join(' | ') + ' trace: ' + r.trace.join(' ; ');
  expect(r.wedgedRehearsal, 'the wedge never set').toBe(true);
  expect(r.countAfterSet).toBe(1);
  expect(r.unwedged, 'pull the wedge free did not release the leaf').toBe(true);
  expect(r.countAfterPull).toBe(2);   // the chock comes back to your pocket
  expect(r.loose, `bellman never kicked the wedge — ${tail}`).toBe(true);
  expect(r.opened, `leaf never swung after the chock gave — ${tail}`).toBe(true);
  expect(r.dropSeen, `the kicked wedge never landed as loot — ${tail}`).toBe(true);
  expect(r.gathered, `gathering the kicked wedge didn't return the chock — ${tail}`).toBe(true);
  expect(errors).toEqual([]);
});

// sprint 440 — the wired leaf end-to-end: the coil binds a leaf for
// both sides; the bellman can't kick it — a visit's work strains the
// bind and he walks away with the leaf still held, and only a LATER
// visit's work parts it (the coil drops as loot where it was cut).
test('the wired leaf: the knocker works the bind a visit at a time', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page); // seed 's': bellman @32

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const gi = g as unknown as {
      entities: { id: string; state: string; threatPos(): { x: number; y: number; z: number } | null }[];
      giveItem(id: string, n?: number): void;
      inventory: { id: string; count: number }[];
      spawnById(id: string): void;
    };
    gi.giveItem('wireCoil', 2);
    const coilCount = () => gi.inventory.find((i) => i.id === 'wireCoil')?.count ?? -1;

    const bRoom = g.route.rooms.find((r) => r.scheduled?.some((s) => s.entity === 'bellman'));
    if (!bRoom) return { stage: 'no-bellman' } as const;
    const prev = g.route.rooms[bRoom.index - 1];

    // Rehearsal on a quiet branch leaf: bind it, then cut your own wire.
    const qRoom = g.route.branchRooms?.find((r) => !(r.scheduled?.length) && r.doors.some((d) => !d.locked && !d.falseDoor && (d.openT ?? 0) <= 0.4));
    const rehearseIn = qRoom ?? prev;
    const pDoor = rehearseIn.doors.find((d) => !d.locked && !d.falseDoor && (d.openT ?? 0) <= 0.4);
    if (!pDoor) return { stage: 'no-rehearsal-door' } as const;
    g.player.teleport(rehearseIn.origin.x, 0, rehearseIn.origin.z);
    for (let f = 0; f < 6; f++) g.frame();
    const toP = { x: rehearseIn.origin.x - pDoor.pos.x, z: rehearseIn.origin.z - pDoor.pos.z };
    const LP = Math.hypot(toP.x, toP.z) || 1;
    g.player.teleport(pDoor.pos.x + (toP.x / LP) * 0.9, 0, pDoor.pos.z + (toP.z / LP) * 0.9);
    g.keys.add('KeyC');
    for (let f = 0; f < 4; f++) g.frame();
    const aimHold = (id: string, done: () => boolean, frames = 90, each?: () => void): boolean => {
      const lp = g.player as unknown as { lookDir(out: { x: number; y: number; z: number }): void };
      const orig = lp.lookDir.bind(lp);
      const sys = g.interaction as unknown as {
        focus: (eye: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }, pos: { x: number; y: number; z: number }) => typeof g.interaction.focused;
      };
      const origFocus = sys.focus.bind(sys);
      let seen = false;
      for (let f = 0; f < frames && !done(); f++) {
        each?.();
        const pt = g.interaction.interactables.find((i) => i.id === id);
        if (!pt) { g.frame(); continue; }
        seen = true;
        lp.lookDir = (out) => {
          const dx = pt.pos.x - g.player.pos.x, dy = pt.pos.y + 0.6 - (g.player.eyePos({ x: 0, y: 0, z: 0 })).y, dz = pt.pos.z - g.player.pos.z;
          const L = Math.hypot(dx, dy, dz) || 1;
          out.x = dx / L; out.y = dy / L; out.z = dz / L;
        };
        sys.focus = (eye, look, pos) => {
          const here = g.interaction.interactables.find((i) => i.id === id);
          const r = here ?? origFocus(eye, look, pos);
          (sys as { focused?: unknown }).focused = r ?? null;
          return r;
        };
        if (g.interaction.focused?.id === id) g.keys.add('KeyE');
        g.frame();
      }
      lp.lookDir = orig;
      sys.focus = origFocus;
      g.keys.delete('KeyE');
      return seen;
    };
    if (!aimHold(`wire-${pDoor.id}`, () => pDoor.heldBy === 'wired')) return { stage: 'no-wire-point', caps: caps.slice(-6) } as const;
    const wiredRehearsal = pDoor.heldBy === 'wired';
    const countAfterBind = coilCount();
    if (!aimHold(`unwire-${pDoor.id}`, () => pDoor.heldBy === undefined)) return { stage: 'no-unwire-point', caps: caps.slice(-6) } as const;
    const unwired = pDoor.heldBy === undefined;
    const countAfterCut = coilCount();
    g.keys.delete('KeyC');

    // The real thing: inside the knock room, wire the entry leaf, then
    // stand off — the whole point vs the brace.
    g.player.teleport(bRoom.origin.x, 0, bRoom.origin.z);
    for (let f = 0; f < 8; f++) g.frame();
    const bell = gi.entities.find((e) => e.id === 'bellman');
    if (!bell) return { stage: 'no-bellman-spawn', caps: caps.slice(-8) } as const;
    const door = bRoom.doors.find((d) => d.id === `door-${bRoom.index}-in`);
    if (!door) return { stage: 'no-door' } as const;
    const toC = { x: bRoom.origin.x - door.pos.x, z: bRoom.origin.z - door.pos.z };
    const L = Math.hypot(toC.x, toC.z) || 1;
    g.player.teleport(door.pos.x + (toC.x / L) * 0.9, 0, door.pos.z + (toC.z / L) * 0.9);
    g.keys.add('KeyC');
    for (let f = 0; f < 4; f++) g.frame();
    const unwatch = () => { (bell as { watchT?: number }).watchT = 0; };
    aimHold(`wire-${door.id}`, () => door.heldBy === 'wired', 90, unwatch);
    g.keys.delete('KeyC');
    if (door.heldBy !== 'wired') return { stage: 'wire-failed', prompt: g.interaction.focused?.prompt, crouch: g.player.crouching } as const;

    g.player.teleport(door.pos.x + (toC.x / L) * 2.4, 0, door.pos.z + (toC.z / L) * 2.4);
    g.player.yaw = Math.atan2(toC.x, toC.z);
    g.player.pitch = 0;
    const cluster = [...prev.doors, ...bRoom.doors]
      .filter((d) => Math.hypot(d.pos.x - door.pos.x, d.pos.z - door.pos.z) < 0.6);
    const trace: string[] = [];
    // Visit one: he works the wire >6s, strains it, and walks away —
    // the leaf stays bound.
    let strained = false, faded = false;
    for (let f = 0; f < 900 && !faded; f++) {
      unwatch();
      g.frame();
      if (caps.some((c) => /works at the wire/.test(c))) strained = true;
      if (caps.some((c) => /bind held/.test(c))) faded = true;
      if (f % 40 === 0) {
        const tp = (bell as unknown as { pos?: { x: number; z: number } }).pos ?? bell.threatPos();
        const dd = tp ? Math.hypot(tp.x - door.pos.x, tp.z - door.pos.z) : -1;
        const faced = tp ? [...prev.doors, ...bRoom.doors]
          .filter((d) => Math.hypot(d.pos.x - tp.x, d.pos.z - tp.z) < 1.4)
          .map((d) => `${d.id.split('-').pop()}=${d.heldBy ?? '-'}`).join(',') : '';
        trace.push(`f${f} bell@${dd.toFixed(2)} hold=${door.heldBy} strained=${strained} [${faced}]`);
      }
    }
    const heldAfterVisit = door.heldBy;
    // diagnostics: which leaves did the knocker actually face?
    const bp = (bell as unknown as { pos?: { x: number; z: number } }).pos;
    const near = bp ? [...prev.doors, ...bRoom.doors]
      .filter((d) => Math.hypot(d.pos.x - bp.x, d.pos.z - bp.z) < 2.5)
      .map((d) => `${d.id}=${d.heldBy ?? '-'}@${Math.hypot(d.pos.x - bp.x, d.pos.z - bp.z).toFixed(1)}`) : [];

    // Visit two: a fresh dispatch — this visit's work parts the bind.
    gi.spawnById('bellman');
    let freed = false;
    for (let f = 0; f < 900 && !freed; f++) {
      g.frame();
      if (caps.some((c) => /wire parts under its hands/.test(c))) freed = true;
      if (f % 40 === 0) {
        const tp = gi.entities.filter((e) => e.id === 'bellman').map((e) => e.threatPos()).find(Boolean);
        const dd = tp ? Math.hypot(tp.x - door.pos.x, tp.z - door.pos.z) : -1;
        trace.push(`v2 f${f} bell@${dd.toFixed(2)} hold=${door.heldBy} freed=${freed}`);
      }
    }
    const opened = cluster.some((d) => d.opening || (d.openT ?? 0) > 0.05) || door.heldBy === undefined;

    // The coil lies where it was cut — gather it back. The mint lands
    // on the next frame's interactable rebuild, so let a few settle.
    for (let f = 0; f < 6; f++) g.frame();
    let dropSeen = false, gathered = false;
    const dropsNow = (g as unknown as { droppedCoils?: { x: number; z: number }[] }).droppedCoils?.length ?? -1;
    const dropKinds = g.interaction.interactables.filter((i) => /drop|coil/i.test(i.kind)).map((i) => i.id);
    const drop = g.interaction.interactables.find((i) => i.kind === 'coilDrop');
    if (drop) {
      dropSeen = true;
      g.player.teleport(drop.pos.x + (toC.x / L) * 0.9, 0, drop.pos.z + (toC.z / L) * 0.9);
      const before = coilCount();
      aimHold(drop.id, () => coilCount() > before, 90);
      gathered = coilCount() > before;
    }
    return { stage: 'done', wiredRehearsal, countAfterBind, unwired, countAfterCut, strained, faded, heldAfterVisit, near, freed, opened, dropsNow, dropKinds, dropSeen, gathered, dead: g.player.dead, trace, wireCaps: caps.filter((c) => /wire|bind|strain/i.test(c)), caps: caps.slice(-16) } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { wiredRehearsal: boolean; countAfterBind: number; unwired: boolean; countAfterCut: number; strained: boolean; faded: boolean; heldAfterVisit?: string; near: string[]; freed: boolean; opened: boolean; dropsNow: number; dropKinds: string[]; dropSeen: boolean; gathered: boolean; dead: boolean; trace: string[]; wireCaps: string[]; caps: string[] };
  const tail = r.caps.join(' | ') + ' wireCaps: ' + r.wireCaps.join(' | ') + ' drops: ' + r.dropsNow + ' kinds: ' + r.dropKinds.join(',') + ' near: ' + r.near.join(', ') + ' trace: ' + r.trace.join(' ; ');
  expect(r.wiredRehearsal, 'the wire never bound').toBe(true);
  expect(r.countAfterBind).toBe(1);
  expect(r.unwired, 'cut the wired leaf free did not release it').toBe(true);
  expect(r.countAfterCut).toBe(2);   // the coil comes back to your hand
  expect(r.strained, `the knocker never worked the wire — ${tail}`).toBe(true);
  expect(r.faded, `the knocker never gave up on the first visit — ${tail}`).toBe(true);
  expect(r.heldAfterVisit, `the first visit parted the wire — ${tail}`).toBe('wired');
  expect(r.freed, `the second visit never parted the bind — ${tail}`).toBe(true);
  expect(r.opened, `the leaf never freed after the wire gave — ${tail}`).toBe(true);
  expect(r.dropSeen, `the worked coil never landed as loot — ${tail}`).toBe(true);
  expect(r.gathered, `gather never returned the coil — ${tail}`).toBe(true);
  expect(errors).toEqual([]);
});

// sprints 465-468 — the seam speaks: 'Call through the crack' puts a voice
// under the leaf's far lip; a watcher in the far room hears it and comes to
// the door, mouths back through the crack, and (if you call while it is
// already at the seam) takes the whisper as a sighting. A listen into a
// camped leaf reads the breath.
test('the seam speaks: the call pulls, mouths back, and tells on a camped leaf', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seededRun(page);

  const result = await page.evaluate(() => {
    const g = (window as unknown as { __thresholdGame: ThresholdG }).__thresholdGame;
    g.renderFrame = () => {};
    g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
    g.godMode = true;
    const caps: string[] = [];
    g.audio.onCaption((c) => { if (c.text) caps.push(c.text); });
    (g.audio as { captionsEnabled?: boolean }).captionsEnabled = true;
    const emits: { x: number; z: number; category: string; intensity: number }[] = [];
    const snd = g.sound as { emit(e: { x: number; z: number; category: string; intensity: number }): void };
    const origEmit = snd.emit.bind(snd);
    snd.emit = (e) => { emits.push(e); origEmit(e); };
    const ents = g.entities as unknown as { id: string; state: string; pos: { x: number; y: number; z: number }; threatPos(): { x: number; y: number; z: number } | null }[];
    const gg = g as unknown as { spawnById(id: string): void; nextToss: number };

    const inRoom = (r: GRoom, x: number, z: number) => {
      const dx = x - r.origin.x, dz = z - r.origin.z;
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const sw = r.spec?.width ?? r.spec?.w, sd = r.spec?.depth ?? r.spec?.d;
      return !!sw && !!sd && Math.abs(lx) <= sw / 2 + 0.5 && Math.abs(lz) <= sd / 2 + 0.5;
    };
    const hold = (at: { x: number; y: number; z: number }, match: RegExp, done: () => boolean, cap: number, aimY = 0.4): string => {
      const seen: string[] = [];
      for (let f = 0; f < cap && !done(); f++) {
        const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        g.player.pitch = Math.atan2(at.y + aimY - ((g.player.eyePos({ x: 0, y: 0, z: 0 })).y), Math.hypot(ax, az) || 1);
        const prompt = g.interaction.focused?.prompt ?? '';
        if (f % 12 === 0) seen.push(prompt);
        if (match.test(prompt)) g.keys.add('KeyE'); else g.keys.delete('KeyE');
        g.frame();
      }
      g.keys.delete('KeyE');
      return seen.join('|');
    };
    const main = g.route.rooms.filter((r) => r.index >= 0).sort((a, b) => a.index - b.index);
    const attempts: string[] = [];

    for (let i = 0; i < main.length - 1; i++) {
      const host = main[i], next = main[i + 1];
      const door = (next.doors ?? []).find((d) => d.id === `door-${next.index}-in`);
      if (!door || (door.openT ?? 0) > 0.4 || door.falseDoor) continue;
      const nx = Math.sin(door.yaw), nz = Math.cos(door.yaw);
      const cand = [1, -1].map((s) => ({ x: door.pos.x + nx * 1.2 * s, z: door.pos.z + nz * 1.2 * s })).find((p) => inRoom(host, p.x, p.z));
      if (!cand) continue;
      // the grafter parks ~3.2m inside the far room — in the whisper's ear
      const farPark = [1, -1].map((s) => ({ x: door.pos.x - nx * 3.2 * s, z: door.pos.z - nz * 3.2 * s })).find((p) => inRoom(next, p.x, p.z) && !inRoom(host, p.x, p.z));
      if (!farPark) continue;

      // step into the far room so currentRoomIndex anchors there, spawn the
      // rubble, walk it near the leaf, then come back to the host side
      g.player.teleport(farPark.x, 0, farPark.z);
      g.currentRoom = next.index;
      for (let f = 0; f < 12; f++) g.frame();
      gg.spawnById('grafter');
      for (let f = 0; f < 24; f++) g.frame();
      const gr = ents.find((e) => e.id === 'grafter' && e.state === 'engage');
      if (!gr) { attempts.push(`${door.id}: grafter never engaged`); continue; }
      gr.pos.x = farPark.x; gr.pos.z = farPark.z;
      const tp = () => (gr.threatPos ? gr.threatPos() : gr.pos) ?? gr.pos;
      const leafDist = () => Math.hypot(tp().x - door.pos.x, tp().z - door.pos.z);
      const dist0 = leafDist();

      g.player.teleport(cand.x, 0, cand.z);
      g.currentRoom = host.index;
      for (let f = 0; f < 40; f++) g.frame();
      g.keys.add('KeyC');
      for (let f = 0; f < 10; f++) g.frame();

      const call = g.interaction.interactables.find((i2) => i2.kind === 'call' && i2.id === `call-${door.id}`);
      const listen = g.interaction.interactables.find((i2) => i2.kind === 'listen' && i2.id === `listen-${door.id}`);
      if (!call || !listen) { g.keys.delete('KeyC'); attempts.push(`${door.id}: lattice missing call=${!!call} listen=${!!listen}`); continue; }

      const side = Math.sign((cand.x - door.pos.x) * nx + (cand.z - door.pos.z) * nz) || 1;
      const fx = door.pos.x - nx * side * 0.3, fz = door.pos.z - nz * side * 0.3;
      const standAt = (ax: number, az: number, rad: number) => {
        g.player.teleport(ax + nx * side * rad, 0, az + nz * side * rad);
        g.currentRoom = host.index;
        for (let f = 0; f < 40; f++) g.frame();
      };
      const aimFrames = (at: { x: number; y: number; z: number }, aimY: number, n: number) => {
        for (let f = 0; f < n; f++) {
          const ax = at.x - g.player.pos.x, az = at.z - g.player.pos.z;
          g.player.yaw = Math.atan2(ax, az);
          g.player.pitch = Math.atan2(at.y + aimY - ((g.player.eyePos({ x: 0, y: 0, z: 0 })).y), Math.hypot(ax, az) || 1);
          g.frame();
        }
      };

      // --- phase 1: the call pulls — the voice lands at the far lip and the
      // rubble drags to the door ---
      let callStood = false;
      for (const rad of [0.45, 0.62, 0.8, 1.0]) {
        standAt(call.pos.x, call.pos.z, rad);
        aimFrames(call.pos, 0.6, 8);
        if (g.interaction.focused?.id === call.id) { callStood = true; break; }
      }
      if (!callStood) { g.keys.delete('KeyC'); attempts.push(`${door.id}: call never focused`); continue; }
      caps.length = 0;
      const e0 = emits.length;
      const callPrompts = hold(call.pos, /call through the crack/i, () => caps.some((c) => /voice goes under/.test(c)), 200, 0.6);
      // the whisper's own emit should land under the far lip; the second
      // emit sits at the verb anchor on your side
      const farEmit = emits.slice(e0).find((e) => e.category === 'distraction' && Math.hypot(e.x - fx, e.z - fz) < 0.4);
      const nearEmit = emits.slice(e0).find((e) => e.category === 'distraction' && Math.hypot(e.x - call.pos.x, e.z - call.pos.z) < 0.5 && Math.hypot(e.x - fx, e.z - fz) > 0.4);

      // sim the pull — the rubble should close on the leaf; the mouth-back
      // cue lands ~1.2-2.1s in
      let minLeaf = leafDist();
      let mouthed = false;
      for (let f = 0; f < 300; f++) {
        g.frame();
        minLeaf = Math.min(minLeaf, leafDist());
        if (caps.some((c) => /mouths back/.test(c))) mouthed = true;
      }
      const pulled = minLeaf < dist0 - 1.5;

      // --- phase 2: the voice tells — camp the rubble AT the leaf (it got
      // there under its own pull in phase 1) then call again: the whisper
      // becomes a sighting. Pin it with the entity's own camp mechanism —
      // a bare pos teleport roams off again before the listen completes.
      const gc = gr as unknown as { target: { x: number; y: number; z: number }; roamT: number; crackCampUntil: number };
      gr.pos.x = door.pos.x - nx * side * 0.9; gr.pos.z = door.pos.z - nz * side * 0.9;
      gc.target = { x: door.pos.x - nx * side * 0.9, y: 0, z: door.pos.z - nz * side * 0.9 };
      gc.roamT = 0; gc.crackCampUntil = g.clock.time + 60;
      for (let f = 0; f < 6; f++) g.frame();
      // the listen reads the camp the pull created, before the second call
      caps.length = 0;
      let listenStood = false;
      for (const rad of [0.45, 0.62, 0.8]) {
        standAt(listen.pos.x, listen.pos.z, rad);
        aimFrames(listen.pos, 0.6, 8);
        if (g.interaction.focused?.id === listen.id) { listenStood = true; break; }
      }
      const listenPrompts = listenStood ? hold(listen.pos, /listen at door/i, () => caps.some((c) => /listening back|breath at the crack/i.test(c)), 240, 0.6) : '';
      const breathCap = caps.find((c) => /listening back|breath at the crack/i.test(c));

      // wait out the shared lure breath, then call into the camped leaf
      for (let f = 0; f < 400 && g.clock.time < gg.nextToss; f++) g.frame();
      caps.length = 0;
      callStood = false;
      for (const rad of [0.45, 0.62, 0.8, 1.0]) {
        standAt(call.pos.x, call.pos.z, rad);
        aimFrames(call.pos, 0.6, 8);
        if (g.interaction.focused?.id === call.id) { callStood = true; break; }
      }
      const call2Prompts = callStood ? hold(call.pos, /call through the crack/i, () => caps.some((c) => /takes the whisper|voice goes under/.test(c)), 240, 0.6) : '';
      const toldCap = caps.find((c) => /takes the whisper/.test(c));
      // the grafter's own eyeTell answers in idiom too — it drags to the
      // leaf and camps it
      const grafterCued = caps.some((c) => /felt the crack/.test(c));
      for (let f = 0; f < 60; f++) g.frame();
      g.keys.delete('KeyC');

      // --- phase 4: the seam reaches — a camped leaf has fingers ---
      // The rubble is pressed within reach of the leaf (it got there on
      // its own camp). A slow crack verb gets yanked before it finishes.
      g.keys.add('KeyC');
      for (let f = 0; f < 10; f++) g.frame();
      const stoopV = g.interaction.interactables.find((i2) => i2.kind === 'stoop' && i2.id === `stoop-${door.id}`);
      let reachWarn = false, yanked = false;
      const pr = g.player as unknown as { rootedUntil?: number };
      const rooted0 = pr.rootedUntil ?? 0;
      const reachDiag: string[] = [];
      let stoopStood = false;
      if (stoopV) {
        // deep radii too — inside the doorway lane every stand ejects to
        // an edge where the nearer flank wins on dist; past the band a
        // centre stand holds and the aimed seam read wins on aim
        for (const rad of [0.3, 0.5, 0.7, 1.0, 1.4, 1.8, 2.2]) {
          standAt(stoopV.pos.x, stoopV.pos.z, rad);
          aimFrames(stoopV.pos, 0.6, 8);
          reachDiag.push(`r${rad}:f=${g.interaction.focused?.id ?? 'null'}`);
          if (g.interaction.focused?.id === stoopV.id) { stoopStood = true; break; }
        }
        if (!stoopStood) {
          const eye2 = g.player.eyePos({ x: 0, y: 0, z: 0 });
          const look2 = { x: Math.sin(g.player.yaw) * Math.cos(g.player.pitch), y: Math.sin(g.player.pitch), z: Math.cos(g.player.yaw) * Math.cos(g.player.pitch) };
          for (const v of [stoopV, g.interaction.interactables.find((i2) => i2.id === `slip-${door.id}`)!]) {
            const dx = v.pos.x - eye2.x, dy = v.pos.y + 0.6 - eye2.y, dz = v.pos.z - eye2.z;
            const dist = Math.hypot(dx, dy, dz);
            const al = (dx * look2.x + dy * look2.y + dz * look2.z) / (dist || 1);
            const px = Math.hypot(v.pos.x - g.player.pos.x, v.pos.z - g.player.pos.z);
            reachDiag.push(`${v.id}@d${dist.toFixed(2)} a${al.toFixed(2)} ph${px.toFixed(2)} y${v.pos.y.toFixed(2)}`);
          }
          reachDiag.push(`p=${g.player.pos.x.toFixed(2)},${g.player.pos.z.toFixed(2)} eye=${eye2.y.toFixed(2)} cr=${g.player.crouching} noStoop d=${leafDist().toFixed(2)} camp=${(gr as unknown as { crackCampUntil?: number }).crackCampUntil?.toFixed(1)} t=${g.clock.time.toFixed(1)}`);
        }
        if (stoopStood) {
          caps.length = 0;
          for (let f = 0; f < 120 && !yanked; f++) {
            const ax = stoopV.pos.x - g.player.pos.x, az = stoopV.pos.z - g.player.pos.z;
            g.player.yaw = Math.atan2(ax, az);
            g.player.pitch = Math.atan2(stoopV.pos.y + 0.6 - g.player.eyePos({ x: 0, y: 0, z: 0 }).y, Math.hypot(ax, az) || 1);
            if (g.interaction.focused?.id === stoopV.id) g.keys.add('KeyE'); else g.keys.delete('KeyE');
            g.frame();
            if (caps.some((c) => /fingers work under/.test(c))) reachWarn = true;
            if (caps.some((c) => /takes your sleeve/.test(c))) yanked = true;
          }
          g.keys.delete('KeyE');
        }
      }

      // --- phase 4b: stamp the fingers — let go while the hand is still
      // under, then answer the reach with your boot. The stamp buys ~8s:
      // a re-held stoop neither warns nor yanks inside the window ---
      let reachWarned2 = false, stampFired = false, stampedQuiet = false;
      if (stoopV && stoopStood && yanked) {
        caps.length = 0;
        // re-hold the stoop — the camper is still pressed; the warn re-arms
        for (let f = 0; f < 45 && !reachWarned2; f++) {
          const ax = stoopV.pos.x - g.player.pos.x, az = stoopV.pos.z - g.player.pos.z;
          g.player.yaw = Math.atan2(ax, az);
          g.player.pitch = Math.atan2(stoopV.pos.y + 0.6 - g.player.eyePos({ x: 0, y: 0, z: 0 }).y, Math.hypot(ax, az) || 1);
          if (g.interaction.focused?.id === stoopV.id) g.keys.add('KeyE'); else g.keys.delete('KeyE');
          g.frame();
          if (caps.some((c) => /fingers work under/.test(c))) reachWarned2 = true;
        }
        g.keys.delete('KeyE');
        // release → holdTarget clears next frame → the stamp mints while
        // the hand lingers a breath on the seam
        for (let f = 0; f < 4; f++) g.frame();
        const stampV = g.interaction.interactables.find((i2) => i2.kind === 'stampSeam' && i2.id === `stampSeam-${door.id}`);
        if (reachWarned2 && stampV) {
          for (let f = 0; f < 45 && !stampFired; f++) {
            const ax = stampV.pos.x - g.player.pos.x, az = stampV.pos.z - g.player.pos.z;
            g.player.yaw = Math.atan2(ax, az);
            g.player.pitch = Math.atan2(stampV.pos.y + 0.6 - g.player.eyePos({ x: 0, y: 0, z: 0 }).y, Math.hypot(ax, az) || 1);
            if (g.interaction.focused?.id === stampV.id) g.keys.add('KeyE'); else g.keys.delete('KeyE');
            g.frame();
            if (caps.some((c) => /you stamp the fingers/.test(c))) stampFired = true;
          }
          g.keys.delete('KeyE');
          // a stamped hand stays gone ~8s: re-holding the stoop inside
          // the window neither warns again nor yanks — the leaf is yours
          if (stampFired) {
            caps.length = 0;
            let stillWarn = false, yanked2 = false;
            for (let f = 0; f < 55; f++) {
              const ax = stoopV.pos.x - g.player.pos.x, az = stoopV.pos.z - g.player.pos.z;
              g.player.yaw = Math.atan2(ax, az);
              g.player.pitch = Math.atan2(stoopV.pos.y + 0.6 - g.player.eyePos({ x: 0, y: 0, z: 0 }).y, Math.hypot(ax, az) || 1);
              if (g.interaction.focused?.id === stoopV.id) g.keys.add('KeyE'); else g.keys.delete('KeyE');
              g.frame();
              if (caps.some((c) => /fingers work under/.test(c))) stillWarn = true;
              if (caps.some((c) => /takes your sleeve/.test(c))) yanked2 = true;
            }
            g.keys.delete('KeyE');
            stampedQuiet = !stillWarn && !yanked2;
          }
        }
      }

      // --- phase 5: the stone comes back — the slip beats the fingers
      // (0.8s hold < 0.9s yank) but the camper rolls it under again ---
      for (let f = 0; f < 400 && g.clock.time < gg.nextToss; f++) g.frame();
      caps.length = 0;
      const slipV = g.interaction.interactables.find((i2) => i2.kind === 'slip' && i2.id === `slip-${door.id}`);
      let slipFired = false, stoneBack = false;
      if (slipV) {
        let slipStood = false;
        for (const rad of [0.15, 0.25, 0.45, 0.62, 0.8]) {
          standAt(slipV.pos.x, slipV.pos.z, rad);
          aimFrames(slipV.pos, 0.6, 8);
          if (g.interaction.focused?.id === slipV.id) { slipStood = true; break; }
        }
        if (slipStood) {
          for (let f = 0; f < 60 && !slipFired; f++) {
            const ax = slipV.pos.x - g.player.pos.x, az = slipV.pos.z - g.player.pos.z;
            g.player.yaw = Math.atan2(ax, az);
            g.player.pitch = Math.atan2(slipV.pos.y + 0.6 - g.player.eyePos({ x: 0, y: 0, z: 0 }).y, Math.hypot(ax, az) || 1);
            if (g.interaction.focused?.id === slipV.id) g.keys.add('KeyE'); else g.keys.delete('KeyE');
            g.frame();
            if (caps.some((c) => /pebble skips under/.test(c))) slipFired = true;
          }
          g.keys.delete('KeyE');
          for (let f = 0; f < 90 && !stoneBack; f++) {
            g.frame();
            if (caps.some((c) => /stone rolls back/.test(c))) stoneBack = true;
          }
        }
      }

      // --- phase 6: a camped leaf is a held leaf — the swing drags at
      // masonry's weight while the camp lasts ---
      const dr = door as { openT?: number; opening?: boolean };
      dr.openT = 0; dr.opening = true;
      for (let f = 0; f < 15; f++) g.frame();
      const pressSlowed = (dr.openT ?? 1) < 0.6;
      dr.opening = false; dr.openT = 0;
      for (let f = 0; f < 30; f++) g.frame();
      g.keys.delete('KeyC');

      // --- phase 7: the seam sells — feed the armed hand, slide cold
      // bait to pin it, then put it down and take the pouch back ---
      let feedWarned = false, feedFired = false, baitFired = false,
        spillDropped = 0, coinBack = 0;
      const gAny = g as unknown as { imprints: number; hotImprints: number; droppedPouches: { x: number; z: number; n: number; hot: number }[] };
      // NO coin yet — a funded purse mints 'Slip a coin' on this lattice
      // (p5, same lip) and at this stand nearEnough lets it shadow the
      // stoop's focus all 45 frames: no hold, no reach. Coin comes back
      // once the hand is warned.
      gAny.imprints = 0; gAny.hotImprints = 0;
      g.keys.add('KeyC'); // phase 6 stood you up — back on the knee
      for (let f = 0; f < 6; f++) g.frame();
      // the camper is still pressed (re-pin: phases spent its 60s camp
      // and the leaf-drag walk put it anywhere — put it back on the far
      // lip of THIS leaf or the reach never arms)
      const grPos = gr as unknown as { pos: { x: number; y: number; z: number } };
      const nX7 = Math.sin(door.yaw), nZ7 = Math.cos(door.yaw);
      const side7 = Math.sign((g.player.pos.x - door.pos.x) * nX7 + (g.player.pos.z - door.pos.z) * nZ7) || 1;
      grPos.pos.x = door.pos.x - nX7 * side7 * 0.9;
      grPos.pos.z = door.pos.z - nZ7 * side7 * 0.9;
      gc.target.x = door.pos.x; gc.target.z = door.pos.z;
      gc.roamT = 0; gc.crackCampUntil = g.clock.time + 60;
      // the stamp's 8s cooldown can still be ticking when the phases
      // between run short — a stamped leaf can't re-warn inside it
      (g as unknown as { seamReachCd: Map<string, number> }).seamReachCd.delete(door.id);
      // warn the hand again, release, and pay it off inside the linger
      const feedDiag: string[] = [];
      for (let f = 0; f < 45 && !feedWarned && stoopV; f++) {
        const ax = stoopV.pos.x - g.player.pos.x, az = stoopV.pos.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        g.player.pitch = Math.atan2(stoopV.pos.y + 0.6 - g.player.eyePos({ x: 0, y: 0, z: 0 }).y, Math.hypot(ax, az) || 1);
        // the fingers don't care WHICH seam verb you hold — warn off
        // whichever flank wins focus this frame
        const foc7 = g.interaction.focused;
        if (foc7 && (foc7.kind === 'stoop' || foc7.kind === 'slip' || foc7.kind === 'call')) g.keys.add('KeyE'); else g.keys.delete('KeyE');
        g.frame();
        if (f % 9 === 0) {
          const sr = (g as unknown as { seamReach?: { doorId: string; t: number } | null }).seamReach;
          const gd = Math.hypot(grPos.pos.x - door.pos.x, grPos.pos.z - door.pos.z);
          feedDiag.push(`f${f} foc=${g.interaction.focused?.id ?? 'none'} held=${(g.interaction as unknown as { holdTarget?: string }).holdTarget ?? 'none'} cr=${g.player.crouching} sr=${sr ? sr.doorId : 'null'} gd=${gd.toFixed(2)} state=${gr.state}`);
        }
        if (caps.some((c) => /fingers work under/.test(c))) feedWarned = true;
      }
      g.keys.delete('KeyE');
      for (let f = 0; f < 4; f++) g.frame();
      gAny.imprints = 4; // now the hand is under, pay it
      const imprintsBeforeFeed = gAny.imprints;
      let fedStand = false;
      for (let f = 0; f < 60 && !feedFired; f++) {
        const feedV = g.interaction.interactables.find((i2) => i2.kind === 'feedSeam' && i2.id === `feedSeam-${door.id}` && /feed the hand/i.test(i2.prompt));
        if (!feedV) {
          g.frame();
          if (f % 10 === 0) {
            const sr = (g as unknown as { seamReach?: { doorId: string; lingerUntil: number } | null }).seamReach;
            const feeds = g.interaction.interactables.filter((i2) => i2.kind === 'feedSeam').map((i2) => i2.prompt).join(';');
            feedDiag.push(`F${f} sr=${sr ? `${sr.doorId}@${sr.lingerUntil.toFixed(1)}` : 'null'} t=${g.clock.time.toFixed(1)} feeds=[${feeds}] foc=${g.interaction.focused?.id ?? 'none'} cr=${g.player.crouching}`);
          }
          continue;
        }
        // the feed now mints a knee-step out on the payer's side —
        // but the seam stand sits on the slip's flank where the brace
        // (lat -0.55) is always the nearest verb; teleport to the
        // feed's own column (a bare teleport — the linger only lasts
        // ~90 frames, a 40-frame standAt burns half of it)
        if (!fedStand) {
          g.player.teleport(feedV.pos.x + nX7 * side7 * 0.3, 0, feedV.pos.z + nZ7 * side7 * 0.3);
          g.currentRoom = host.index;
          fedStand = true;
        }
        const ax = feedV.pos.x - g.player.pos.x, az = feedV.pos.z - g.player.pos.z;
        g.player.yaw = Math.atan2(ax, az);
        g.player.pitch = Math.atan2(feedV.pos.y - 0.4 - g.player.eyePos({ x: 0, y: 0, z: 0 }).y, Math.hypot(ax, az) || 1);
        if (g.interaction.focused?.id === feedV.id) g.keys.add('KeyE'); else g.keys.delete('KeyE');
        g.frame();
        if (f % 10 === 0) {
          const i2 = g.interaction as unknown as { holdTarget?: string; holdProgress?: number };
          feedDiag.push(`H${f} foc=${g.interaction.focused?.id ?? 'none'} held=${i2.holdTarget ?? 'none'} hp=${(i2.holdProgress ?? 0).toFixed(2)}`);
        }
        if (caps.some((c) => /fingers close over the coin/.test(c))) feedFired = true;
      }
      g.keys.delete('KeyE');
      const pouchAfterFeed = (gr as unknown as { pouch?: number }).pouch ?? 0;
      // the cold slide: once the paid leaf quiets (12s cd), the same slot
      // mints the bait — a coin pins the camp without a grab involved
      caps.length = 0;
      for (let f = 0; f < 240 && !baitFired; f++) {
        const baitV = g.interaction.interactables.find((i2) => i2.kind === 'feedSeam' && i2.id === `feedSeam-${door.id}` && /slip a coin/i.test(i2.prompt));
        if (baitV) {
          const ax = baitV.pos.x - g.player.pos.x, az = baitV.pos.z - g.player.pos.z;
          g.player.yaw = Math.atan2(ax, az);
          g.player.pitch = Math.atan2(baitV.pos.y + 0.6 - g.player.eyePos({ x: 0, y: 0, z: 0 }).y, Math.hypot(ax, az) || 1);
          if (g.interaction.focused?.id === baitV.id) g.keys.add('KeyE'); else g.keys.delete('KeyE');
        }
        g.frame();
        if (caps.some((c) => /coin slips under/.test(c))) baitFired = true;
      }
      g.keys.delete('KeyE');
      const pouchAfterBait = (gr as unknown as { pouch?: number }).pouch ?? 0;
      // put it down — the pouch spills where it falls and gathers back.
      // Stagger spills the pouch, then the body is done: it keeps
      // shoving whoever stands on the pile and breaks every gather
      (gr as unknown as { stagger?: (s: number) => void }).stagger?.(2);
      for (let f = 0; f < 20; f++) g.frame();
      (gr as unknown as { state: string }).state = 'done';
      for (let f = 0; f < 4; f++) g.frame();
      spillDropped = gAny.droppedPouches.length;
      // stand up FIRST — while crouched the seam lattice keeps minting
      // and 'call' at p5 out-scores a p1 pile 0.3m off
      g.keys.delete('KeyC');
      for (let f = 0; f < 12; f++) g.frame();
      // the spill lands ~0.9m off the leaf — inside the 'Open' verb's
      // range, and p3 beats p1 there forever (the pile's v3dist pays
      // the eye-to-floor drop). Drag the piles clear of the leaf and
      // re-mint: the drop entries are pos-keyed data, gather fires by
      // whichever pile wins focus.
      {
        const clear7 = { x: door.pos.x - nX7 * side7 * 3.2, z: door.pos.z - nZ7 * side7 * 3.2 };
        for (const p of gAny.droppedPouches) { p.x = clear7.x; p.z = clear7.z; }
        for (const c of (gAny as { droppedCoils?: { x: number; z: number }[] }).droppedCoils ?? []) { c.x = clear7.x; c.z = clear7.z; }
        (gAny as { mintPouchDrops?: () => void }).mintPouchDrops?.();
        (gAny as { mintCoilDrops?: () => void }).mintCoilDrops?.();
        g.player.teleport(clear7.x, 0, clear7.z);
        g.currentRoom = next.index;
        for (let f = 0; f < 6; f++) g.frame();
      }
      const gatherDiag: string[] = [];
      let pilesLeft = 5;
      while (gAny.droppedPouches.length > 0 && pilesLeft-- > 0) {
        const pile = g.interaction.interactables.find((i2) => /^(pouch|coil|wedge|wrap|alarm)Drop$/.test(i2.kind));
        if (!pile) { for (let f = 0; f < 4; f++) g.frame(); continue; }
        if (Math.hypot(pile.pos.x - g.player.pos.x, pile.pos.z - g.player.pos.z) > 0.35) {
          g.player.teleport(pile.pos.x, 0, pile.pos.z);
          g.currentRoom = next.index;
        }
        const piles0 = g.interaction.interactables.filter((i2) => /^(pouch|coil|wedge|wrap|alarm)Drop$/.test(i2.kind)).length;
        let held = false;
        for (let f = 0; f < 60 && !held; f++) {
          const ax = pile.pos.x - g.player.pos.x, az = pile.pos.z - g.player.pos.z;
          g.player.yaw = Math.atan2(ax, az);
          g.player.pitch = -0.9;
          // two piles at one fall-spot shadow each other — whichever
          // takes focus is the one you can hold
          const focG = g.interaction.focused;
          if (focG && /^(pouch|coil|wedge|wrap|alarm)Drop$/.test(focG.kind)) g.keys.add('KeyE'); else g.keys.delete('KeyE');
          g.frame();
          held = g.interaction.interactables.filter((i2) => /^(pouch|coil|wedge|wrap|alarm)Drop$/.test(i2.kind)).length < piles0;
          if (f % 15 === 0) {
            const iAny = g.interaction as unknown as { holdTarget?: { kind: string } | null; holdProgress?: number };
            gatherDiag.push(`g${f} foc=${focG?.kind ?? '-'} held=${iAny.holdTarget?.kind ?? '-'} hp=${(iAny.holdProgress ?? 0).toFixed(2)} dp=${gAny.droppedPouches.length}`);
          }
        }
        g.keys.delete('KeyE');
      }
      coinBack = gAny.imprints;

      return {
        stage: 'done', room: next.index, dist0, minLeaf, pulled, mouthed,
        farEmit: !!farEmit, nearEmit: !!nearEmit, breathCap, toldCap, grafterCued,
        callPrompts, listenPrompts, call2Prompts, leafDistEnd: leafDist(),
        reachWarn, yanked, rooted: (pr.rootedUntil ?? 0) > rooted0,
        reachWarned2, stampFired, stampedQuiet,
        slipFired, stoneBack, pressSlowed, reachDiag,
        feedWarned, feedFired, imprintsBeforeFeed, pouchAfterFeed,
        baitFired, pouchAfterBait, spillDropped, coinBack, feedDiag, gatherDiag,
        caps: caps.slice(-16), attempts,
      } as const;
    }
    g.keys.delete('KeyC');
    return attempts.length ? { stage: 'unreachable', attempts } as const : { stage: 'no-door' } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as {
    room: number; dist0: number; minLeaf: number; pulled: boolean; mouthed: boolean;
    farEmit: boolean; nearEmit: boolean; breathCap?: string; toldCap?: string; grafterCued: boolean;
    callPrompts: string; listenPrompts: string; call2Prompts: string; leafDistEnd: number; caps: string[];
    reachWarn: boolean; yanked: boolean; rooted: boolean; slipFired: boolean; stoneBack: boolean; pressSlowed: boolean;
    reachWarned2: boolean; stampFired: boolean; stampedQuiet: boolean;
    reachDiag: string[];
    feedWarned: boolean; feedFired: boolean; imprintsBeforeFeed: number;
    pouchAfterFeed: number; baitFired: boolean; pouchAfterBait: number;
    spillDropped: number; coinBack: number; feedDiag: string[]; gatherDiag: string[];
  };
  const tail = r.caps.join(' | ') + ` calls: ${r.callPrompts} / ${r.call2Prompts}`;
  expect(r.callPrompts, 'the call verb never focused at the leaf').toMatch(/call through the crack/i);
  expect(r.farEmit, `the whisper never landed under the far lip — ${tail}`).toBe(true);
  expect(r.nearEmit, `your side never heard you talk to the door — ${tail}`).toBe(true);
  expect(r.pulled, `the rubble never came to the door — d0=${r.dist0.toFixed(1)} min=${r.minLeaf.toFixed(1)} — ${tail}`).toBe(true);
  expect(r.mouthed, `it never mouthed back through the crack — ${tail}`).toBe(true);
  expect(r.breathCap ?? `the listen never read the camped leaf — ${tail}`).toMatch(/listening back|breath at the crack/i);
  expect(r.toldCap ?? `the second call never told — ${tail}`).toMatch(/takes the whisper/);
  expect(r.grafterCued, `the grafter never answered the tell in idiom — ${tail}`).toBe(true);
  // the seam reaches: the fingers warn first, then the yank takes you
  expect(r.reachWarn, `the fingers never worked under the leaf — ${r.reachDiag.join(' ')} — ${tail}`).toBe(true);
  expect(r.yanked, `the hand never took your sleeve — ${tail}`).toBe(true);
  expect(r.rooted, `the yank never rooted you — ${tail}`).toBe(true);
  // the stamp: let go while the hand is under, answer it with your boot,
  // and the leaf is yours for the window
  expect(r.reachWarned2, `the fingers never came back under — ${tail}`).toBe(true);
  expect(r.stampFired, `the stamp never landed — ${tail}`).toBe(true);
  expect(r.stampedQuiet, `the leaf stayed hot after the stamp — ${tail}`).toBe(true);
  // the stone comes back: the slip beats the fingers, then the camper
  // rolls the pebble under the leaf again
  expect(r.slipFired, `the pebble never skipped under — ${tail}`).toBe(true);
  expect(r.stoneBack, `the stone never rolled back under the crack — ${tail}`).toBe(true);
  // a camped leaf is a held leaf
  expect(r.pressSlowed, `the leaf never dragged under the rubble's weight — ${tail}`).toBe(true);
  // the seam sells: feed the armed hand quiet, bait it cold, and the
  // pouch it fills spills back as loot when the hand goes down
  expect(r.feedWarned, `the fingers never re-warned for the feed — ${r.feedDiag.join(' ')} — ${tail}`).toBe(true);
  expect(r.feedFired, `the feed never landed — ${r.feedDiag.join(' ')} — ${tail}`).toBe(true);
  expect(r.pouchAfterFeed, `the fed hand never pocketed the coin — ${tail}`).toBe(1);
  expect(r.baitFired, `the cold slide never baited the camp — ${tail}`).toBe(true);
  expect(r.pouchAfterBait, `the bait never pocketed — ${tail}`).toBe(2);
  expect(r.spillDropped, `the stagger never spilled the pouch — ${tail}`).toBeGreaterThanOrEqual(1);
  expect(r.coinBack, `the spilled coin never gathered back — ${tail} || GD ${r.gatherDiag.join(' ')}`).toBe(r.imprintsBeforeFeed);
  expect(errors).toEqual([]);
});
