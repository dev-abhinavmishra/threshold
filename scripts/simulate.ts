/** Headless route simulation — generates seeds and validates them. */
import { generateRoute } from '../src/world/generator';
import { validateRoute } from '../src/world/validation';
import type { Difficulty } from '../src/game/types';

const seeds = process.argv.slice(2);
const list = seeds.length ? seeds : ['ash-vault-101', 'gilt-spine-777', 'moth-ledger-404', 'sable-cord-001', 'wax-bell-256'];
let fail = 0;

for (const seedText of list) {
  const t0 = Date.now();
  const route = generateRoute({ seedText, difficulty: 'standard' as Difficulty, includeUnderscript: true });
  const report = validateRoute(route);
  const encCount = route.rooms.reduce((a, r) => a + r.scheduled.length, 0);
  const locks = route.keyPairs.length;
  const hide = route.rooms.reduce((a, r) => a + r.hidingSpots.length, 0);
  const biomes = new Map<string, number>();
  for (const r of route.rooms) biomes.set(r.biome, (biomes.get(r.biome) ?? 0) + 1);
  const corrShare = (((biomes.get('corridor') ?? 0) / route.rooms.length) * 100).toFixed(0);
  // Economy audit: imprint income vs mandatory costs (toll doors 3, vend prices).
  let impIn = 25; // arrival register
  let tolls = 0, vends = 0, vendCost = 0;
  for (const r of route.rooms) {
    for (const s of r.sockets) {
      const m = s.meta as { contains?: string; amount?: number; vend?: boolean; price?: number };
      if (m.contains === 'imprints') impIn += m.amount ?? 0;
      if (m.vend) { vends++; vendCost += m.price ?? 0; }
    }
    for (const d of r.doors) if (d.lockId === 'toll') tolls++;
  }
  const eco = `imp ${impIn} vs tolls ${tolls}×3 vends ${vends}Σ${vendCost}`;
  console.log(
    `seed ${seedText}: ${route.rooms.length} rooms + ${route.underRooms.length} under, ` +
    `${encCount} encounters, ${locks} locks, ${hide} hides, corridor ${corrShare}%, ${eco}, ${Date.now() - t0}ms — ${report.ok ? 'OK' : 'FAIL'}`,
  );
  for (const e of report.errors) console.log(`  ERR ${e}`);
  for (const w of report.warnings.slice(0, 6)) console.log(`  warn ${w}`);
  if (!report.ok) fail++;
}
process.exit(fail ? 1 : 0);
