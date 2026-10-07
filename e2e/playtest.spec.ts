import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Scripted balance playtest — "the counted run". Sim-drives the real game
 * (rendering stubbed, fixed-step clock) through every room of a full
 * 101-room route under three playstyles:
 *
 *   walker — teleports room to room and just stands exposed. Measures the
 *     ambient pressure floor: how often the route itself kills a careless
 *     player. Milestone/authored rooms are excluded via godMode there
 *     (their fights are scripted survivable-by-design — a teleporter can't
 *     run them fairly).
 *   hider  — same walk, but enters the room's first hiding spot whenever a
 *     live entity is present and waits the pass out. Measures the
 *     competent-player bound: a player who reads tells and hides should
 *     survive almost everything ambient.
 *   looter — hider walk (hides whenever a live entity is around) plus
 *     visits every loot/drawer/machine socket on the path and holds E on
 *     take/search/vend/claim prompts — hold verbs included. Measures
 *     economy income against toll/vend spend.
 *
 * The under leg (space='under') teleports into the Underscript via
 * `enterUnderscript()` and walks `route.underRooms` — the subfloor has
 * never been measured before; it carries its own entity roster, marginalia
 * economy, flooded halls, and authored safe landings (index % 20).
 *
 * Each run writes test-results/playtest-<seed>-<style>.json; BALANCE.md
 * carries the interpreted numbers. Assertions are structural only — this
 * leg measures; it doesn't tune.
 */

interface RunReport {
  seed: string;
  style: string;
  rooms: number;
  roomsReached: number;
  deaths: Record<string, number>;
  deathsTotal: number;
  deathsHidden: number;
  panics: number;
  farthestRoom: number;
  encounters: number;
  socketsTouched: number;
  stats: {
    deaths: number;
    retries: number;
    roomsVisited: number;
    imprintsEarned: number;
    marginaliaEarned: number;
    entityEncounters: Record<string, number>;
    victory: boolean;
  };
  inventory: { id: string; count: number }[];
  errors: string[];
}

// PLAYTEST_SEEDS env narrows the sweep for smoke runs (comma-separated).
const SEEDS = (process.env.PLAYTEST_SEEDS ?? 'ash-vault-101,gilt-spine-777,wax-bell-256').split(',');

interface G {
  renderFrame(): void;
  clock: { tick(): boolean; dt: number; time: number };
  frame(): void;
  godMode: boolean;
  lastDeathCause: string;
  player: {
    dead: boolean; health: number; panic: number;
    pos: { x: number; y: number; z: number };
    protection: string;
    hiddenSpot: unknown;
    teleport(x: number, y: number, z: number, yaw?: number): void;
    enterHiding(spot: unknown, now: number): boolean;
    exitHiding(now: number): void;
  };
  currentRoom: number;
  entities: { id: string }[];
  inventory: { id: string; count: number }[];
  stats: RunReport['stats'];
  input: { interactPressed: boolean };
  interaction: { focused: { prompt: string; holdMs?: number } | null };
  keys: Set<string>;
  startRun(o: { seedText: string; difficulty: string }): void;
  retryFromCheckpoint(): void;
  enterUnderscript(): void;
  route: {
    rooms: RouteRooms;
    underRooms: RouteRooms;
  };
}

type RouteRooms = {
  index: number; authored: boolean;
  entryPos: { x: number; y: number; z: number };
  exitPos: { x: number; y: number; z: number };
  spec?: { special?: string; sockets: { kind: string; pos?: { x: number; y: number; z: number }; x?: number; z?: number }[] };
  hidingSpots: { exitPos: { x: number; z: number } }[];
  sockets: { kind: string; pos: { x: number; y: number; z: number }; filled?: boolean; meta?: Record<string, unknown> }[];
}[];
async function playOnce(page: import('@playwright/test').Page, seed: string, style: string, space: 'main' | 'under' = 'main'): Promise<RunReport> {
  const errors: string[] = [];
  const report = await page.evaluate(
    ({ seed, style, space }) => {
      const g = (window as unknown as { __thresholdGame: {
        renderFrame(): void;
        clock: { tick(): boolean; dt: number; time: number };
      } }).__thresholdGame as unknown as G;
      g.renderFrame = () => {};
      g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
      g.startRun({ seedText: seed, difficulty: 'standard' });
      g.renderFrame = () => {};
      if (space === 'under') g.enterUnderscript();
      const rooms = space === 'under' ? g.route.underRooms : g.route.rooms;

      const rep: RunReport = {
        seed, style, rooms: rooms.length, roomsReached: 0, deaths: {}, deathsTotal: 0, deathsHidden: 0,
        panics: 0, farthestRoom: 0, encounters: 0, socketsTouched: 0,
        stats: null as unknown as RunReport['stats'], inventory: [], errors: [],
      };
      const deaths: string[] = [];
      // Economy earned before a death survives into `banked` — the
      // checkpoint restore would otherwise erase it from the report.
      const banked = { imprintsEarned: 0, marginaliaEarned: 0 };
      const econBase = { imprintsEarned: 0, marginaliaEarned: 0 };

      const standIn = (room: G['route']['rooms'][number]) => {
        const en = room.entryPos, ex = room.exitPos;
        const dx = ex.x - en.x, dz = ex.z - en.z, L = Math.hypot(dx, dz) || 1;
        g.player.teleport(en.x + (dx / L) * 1.3, 0, en.z + (dz / L) * 1.3, Math.atan2(dx, dz));
      };
      // Corridor runners are what cover is for. Patrol entities (hauler,
      // auditor, margin, grafter, stillframe) never vacate and don't demand
      // a locker — hiding from them is the over-use that buys lockout.
      const RUNNERISH = new Set(['sweep', 'reprise', 'maelstrom', 'redline', 'returner', 'pursuer', 'orrery']);
      const runnerLive = () => g.entities.some((e) => RUNNERISH.has(e.id));
      for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        // A real hider waits out a live pass inside the locker instead of
        // stepping out into it — wait for the pass to end (patience cap for
        // the rare stacked runner) before moving on.
        if (g.player.hiddenSpot) {
          let w = 0;
          while (runnerLive() && w++ < 600 && !g.player.dead) g.frame();
          g.player.exitHiding(g.clock.time);
        }
        // Scripted milestone/set-piece deaths aren't ambient balance —
        // a teleporter can't fight them fairly, so godMode there only.
        g.godMode = !!(room.spec?.special || room.authored);
        g.currentRoom = room.index;
        standIn(room);
        // Cautious entry: if a runner is mid-pass, duck into the nearest
        // cover at the threshold rather than standing exposed for a frame.
        if (style !== 'walker' && runnerLive() && !g.player.hiddenSpot) {
          for (let j = i; j >= Math.max(0, i - 2); j--) {
            if (rooms[j].hidingSpots.length) {
              const spot = rooms[j].hidingSpots[0];
              g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z, 0);
              g.player.enterHiding(spot, g.clock.time);
              break;
            }
          }
        }
        g.frame(); // room-entry: spawnScheduled + streamer window

        // Under rooms hold patrol entities that never vacate — longer waits
        // measure nothing (there is no pass to outlast), so walker+hider
        // spend a shorter fixed window; looter keeps 240 for socket loops.
        const budget = room.spec?.special ? 90 : (space === 'under' && style !== 'looter' ? 150 : 240);
        let sawEntities = false;
        // Cover may live a room or two back — generation only guarantees a
        // survival option within ±2 of a lethal trigger room, and a real
        // player backtracks. The hider does too (nearest spot behind it).
        const nearestCover = () => {
          for (let j = i; j >= Math.max(0, i - 2); j--) {
            if (rooms[j].hidingSpots.length) return rooms[j].hidingSpots[0];
          }
          return null;
        };
        for (let f = 0; f < budget && !g.player.dead; f++) {
          // hider: retreat into cover while a runner is live; with no
          // cover within reach a real player flees onward, not stand still.
          if (style !== 'walker' && runnerLive() && !g.player.hiddenSpot) {
            const spot = nearestCover();
            if (spot) {
              g.player.teleport(spot.exitPos.x, 0, spot.exitPos.z, 0);
              g.player.enterHiding(spot, g.clock.time);
            } else {
              break;
            }
          }
          if (g.player.hiddenSpot) g.keys.clear();
          g.frame();
          // Un-hide the moment the pass is over — lingering in the locker is
          // what makes the next room's transit cost a lockout wait.
          if (g.player.hiddenSpot && !runnerLive()) g.player.exitHiding(g.clock.time);
          // loot pass mid-room
          if (style === 'looter' && f === 30) {
            const LOOT_PROMPT = /search|loot|take|open|drawer|pry|claim|feed|vend|register|read/i;
            for (const s of room.sockets) {
              if (!/loot|drawer|key|cabinet|machine/.test(s.kind)) continue;
              g.player.teleport(s.pos.x, 0, s.pos.z, 0);
              // hold verbs (vend/claim/pry/register take 1.2s+) need a held
              // key across frames, not a one-frame press — keep E down while
              // the prompt matches, bail when the verb completes/disables.
              for (let t = 0; t < 45; t++) {
                if (LOOT_PROMPT.test(g.interaction.focused?.prompt ?? '')) {
                  g.keys.add('KeyE');
                  g.input.interactPressed = true;
                } else {
                  g.keys.delete('KeyE');
                  break;
                }
                g.frame();
              }
              g.keys.delete('KeyE');
              g.input.interactPressed = false;
              rep.socketsTouched++;
            }
            standIn(room);
          }
          // entities gone → hider comes out and moves on early
          if (f > 60 && g.entities.length === 0 && !g.player.dead) break;
          if (g.entities.length) sawEntities = true;
        }
        if (sawEntities) rep.encounters++;

        if (g.player.dead) {
          const cause = g.lastDeathCause || 'unknown';
          const live = g.entities.map((e) => e.id).join('+');
          deaths.push(`${room.index}:${cause}~${live || '-'}${g.player.hiddenSpot ? '^' : ''}`);
          if (g.player.hiddenSpot) rep.deathsHidden++;
          // retry restores checkpoint currency — bank earned counters so
          // income doesn't depend on death timing.
          for (const k of Object.keys(banked) as (keyof typeof banked)[]) {
            banked[k] += g.stats[k] - econBase[k];
          }
          g.retryFromCheckpoint(); // restores frame loop
          g.renderFrame = () => {};
          g.clock.tick = () => { g.clock.dt = 1 / 30; g.clock.time += g.clock.dt; return true; };
          for (const k of Object.keys(econBase) as (keyof typeof econBase)[]) {
            econBase[k] = g.stats[k];
          }
        }
        rep.farthestRoom = Math.max(rep.farthestRoom, i);
        rep.roomsReached = i + 1;
      }
      rep.style = `${style}-${space}`;

      for (const d of deaths) {
        const c = (d.split(':').slice(1).join(':') || 'unknown').split('~')[0];
        rep.deaths[c] = (rep.deaths[c] ?? 0) + 1;
      }
      rep.deathsTotal = deaths.length;
      (rep as RunReport & { deathsSeq?: string }).deathsSeq = deaths.join(' ');
      rep.stats = {
        ...g.stats,
        imprintsEarned: banked.imprintsEarned + g.stats.imprintsEarned - econBase.imprintsEarned,
        marginaliaEarned: banked.marginaliaEarned + g.stats.marginaliaEarned - econBase.marginaliaEarned,
      };
      rep.inventory = g.inventory.map((x) => ({ ...x }));
      return rep;
    },
    { seed, style, space },
  );
  report.errors = errors;
  return report;
}

for (const style of ['walker', 'hider', 'looter']) {
  test(`playtest ${style} — ambient pressure across seeds`, async ({ page }) => {
    test.setTimeout(1_200_000);
    page.on('pageerror', (e) => console.log('pageerror:', e));
    await page.goto('/?debug');
    await page.getByRole('button', { name: 'New Run' }).click({ force: true });
    await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);

    const out: RunReport[] = [];
    for (const seed of SEEDS) {
      out.push(await playOnce(page, seed, style));
    }
    mkdirSync('test-results', { recursive: true });
    writeFileSync(join('test-results', `playtest-${style}.json`), JSON.stringify(out, null, 2));
    for (const r of out) {
      console.log(
        `PLAYTEST ${r.style} ${r.seed}: rooms=${r.roomsReached}/${r.rooms} deaths=${r.deathsTotal}` +
        ` [${Object.entries(r.deaths).map(([k, v]) => `${k}x${v}`).join(' ') || '-'}]` +
        ` imp+${r.stats.imprintsEarned} marg+${r.stats.marginaliaEarned} inv=${r.inventory.length}`,
      );
    }
    // Structural guards only — the numbers are the deliverable, not a gate.
    for (const r of out) {
      expect(r.roomsReached, `${r.seed}: run covered the route`).toBeGreaterThanOrEqual(90);
    }
  });

  test(`playtest under-${style} — subfloor pressure across seeds`, async ({ page }) => {
    // 121 under rooms at the looter's full frame budget run past 20min.
    test.setTimeout(3_600_000);
    page.on('pageerror', (e) => console.log('pageerror:', e));
    page.on('crash', () => console.log('PAGE CRASHED'));
    const boot = async () => {
      await page.goto('/?debug');
      await page.getByRole('button', { name: 'New Run' }).click({ force: true });
      await expect(page.locator('.hud')).toBeVisible({ timeout: 20_000 });
      await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame);
    };
    await boot();

    const out: RunReport[] = [];
    for (const seed of SEEDS) {
      out.push(await playOnce(page, seed, style, 'under'));
      // The under run leaves ~2x a main run's state behind — back-to-back
      // seeds in one page slow to a crawl and can wedge the renderer.
      // A fresh page per seed keeps each walk at its solo ~30s.
      await boot();
    }
    mkdirSync('test-results', { recursive: true });
    writeFileSync(join('test-results', `playtest-under-${style}.json`), JSON.stringify(out, null, 2));
    for (const r of out) {
      console.log(
        `PLAYTEST ${r.style} ${r.seed}: rooms=${r.roomsReached}/${r.rooms} deaths=${r.deathsTotal}` +
        ` (hidden ${r.deathsHidden}) seq=${(r as RunReport & { deathsSeq?: string }).deathsSeq ?? ''}` +
        ` [${Object.entries(r.deaths).map(([k, v]) => `${k}x${v}`).join(' ') || '-'}]` +
        ` imp+${r.stats.imprintsEarned} marg+${r.stats.marginaliaEarned} inv=${r.inventory.length}`,
      );
    }
    // Structural guards only — the numbers are the deliverable, not a gate.
    for (const r of out) {
      expect(r.roomsReached, `${r.seed}: run covered the subfloor`).toBeGreaterThanOrEqual(90);
    }
    expect(out.length, 'every seed ran').toBe(SEEDS.length);
  });
}
