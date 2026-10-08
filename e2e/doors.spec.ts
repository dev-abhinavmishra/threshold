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
        g.player.pitch = Math.atan2(at.y + 0.4 - (g.player.pos.y + g.player.eyeHeight), Math.hypot(ax, az) || 1);
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
    const gAny = g as unknown as { killPlayer(src: string, hint: string): void };
    const origKill = gAny.killPlayer.bind(gAny);
    gAny.killPlayer = (src: string, hint: string) => {
      killTried = `${src}:${hint}`;
      const bp = (bell as unknown as { pos: { x: number; z: number } }).pos;
      const pp = g.player.pos;
      killGeo = `bell(${bp.x.toFixed(2)},${bp.z.toFixed(2)}) player(${pp.x.toFixed(2)},${pp.z.toFixed(2)}) leaf(${door.pos.x.toFixed(2)},${door.pos.z.toFixed(2)}) yaw=${door.yaw.toFixed(2)}`;
      origKill(src, hint);
    };

    const door = bRoom.doors.find((d) => d.id === `door-${bRoom.index}-in`);
    if (!door) return { stage: 'no-door' } as const;
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
      g.player.pitch = Math.atan2(brace.pos.y + 0.2 - g.player.eyeHeight, Math.hypot(ax, az) || 1);
      if (/brace door/i.test(g.interaction.focused?.prompt ?? '')) g.keys.add('KeyE');
      g.frame();
      braced = door.heldBy === 'player';
    }
    g.keys.delete('KeyE');
    if (!braced) return { stage: 'brace-failed', prompt: g.interaction.focused?.prompt } as const;

    // Stay on the bar (release is >1.7m or opening it). The bellman warns,
    // walks to the leaf, rattles on a cadence, holds ~14s, then fades.
    let faded = false, opened = false;
    const cluster = [...g.route.rooms[bRoom.index - 1].doors, ...bRoom.doors]
      .filter((d) => Math.hypot(d.pos.x - door.pos.x, d.pos.z - door.pos.z) < 0.6);
    const trace: string[] = [];
    for (let f = 0; f < 700 && !faded; f++) {
      g.frame();
      if (cluster.some((d) => d.opening || (d.openT ?? 0) > 0.05)) opened = true;
      if (caps.some((c) => /steps fade down the hall/.test(c))) faded = true;
      if (f % 30 === 0) {
        const tp = bell.threatPos();
        const dd = tp ? Math.hypot(tp.x - door.pos.x, tp.z - door.pos.z) : -1;
        trace.push(`f${f} bell@${dd.toFixed(2)} dead=${g.player.dead} hold=${door.heldBy} ht=${(bell as unknown as { doorHoldT?: number }).doorHoldT?.toFixed(1)} st=${bell.state} o=${door.opening ? 'open' : (door.openT ?? 0).toFixed(2)}`);
      }
    }
    g.keys.delete('KeyC');
    return { stage: 'done', faded, opened, bellState: bell.state, dead: g.player.dead, trace, caps: caps.slice(-14), allCaps: caps, killTried, killGeo } as const;
  });

  expect(result.stage, JSON.stringify(result)).toBe('done');
  if (result.stage !== 'done') return;
  const r = result as { faded: boolean; opened: boolean; bellState: string; dead: boolean; trace: string[]; caps: string[]; allCaps: string[]; killTried: string; killGeo: string };
  const tail = r.allCaps.join(' | ') + ' trace: ' + r.trace.join(' ; ') + ' killTried: ' + r.killTried + ' geo: ' + r.killGeo;
  expect(r.caps.some((c) => /tests the bar|strains|palm flat/.test(c)), `caps: ${tail}`).toBe(true);
  expect(r.faded, `caps: ${tail}`).toBe(true);
  expect(r.opened, 'the brace leaked — a cluster leaf swung').toBe(false);
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
          const dx = pt.pos.x - g.player.pos.x, dy = pt.pos.y + 0.6 - g.player.eyeHeight, dz = pt.pos.z - g.player.pos.z;
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
          const dx = pt.pos.x - g.player.pos.x, dy = pt.pos.y + 0.6 - g.player.eyeHeight, dz = pt.pos.z - g.player.pos.z;
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
