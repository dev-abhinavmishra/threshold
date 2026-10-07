/** Per-entity + per-decile encounter histograms over the QA seeds —
 *  the repeatable version of docs/BALANCE.md's audit method. */

import { generateRoute } from '../src/world/generator';

const SEEDS = ['ash-vault-101', 'gilt-spine-777', 'moth-ledger-404', 'sable-cord-001', 'wax-bell-256'];

const hist = (rooms: { index: number; scheduled: { entity: string }[] }[], n: number) => {
  const rows = new Map<string, number[]>();
  const gaps: number[] = [];
  for (const r of rooms) for (const s of r.scheduled) {
    rows.set(s.entity, [...(rows.get(s.entity) ?? []), r.index]);
  }
  const flat = rooms.filter((r) => r.scheduled.length > 0).map((r) => r.index);
  for (let i = 1; i < flat.length; i++) gaps.push(flat[i] - flat[i - 1]);
  const deciles = new Array<number>(10).fill(0);
  for (const r of rooms) {
    if (r.scheduled.length === 0) continue;
    const d = Math.min(9, Math.floor(((r.index + 1) / n) * 10));
    deciles[d] += r.scheduled.length;
  }
  return { rows, maxGap: gaps.length ? Math.max(...gaps) : 0, deciles };
};

for (const seed of SEEDS) {
  const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
  const main = hist(route.rooms, route.rooms.length);
  const under = hist(route.underRooms, route.underRooms.length);
  const fmt = (m: Map<string, number[]>) =>
    [...m.entries()].sort((a, b) => b[1].length - a[1].length)
      .map(([e, ix]) => `${e} ${ix.length}`).join(' · ');
  console.log(`\nseed ${seed}`);
  console.log(`  main  maxGap ${main.maxGap} | ${fmt(main.rows)}`);
  console.log(`        deciles ${main.deciles.join(' ')}`);
  console.log(`  under maxGap ${under.maxGap} | ${fmt(under.rows)}`);
}
