import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__thresholdGame, null, { timeout: 20000 });
const out = await page.evaluate(() => {
  const g = window.__thresholdGame;
  g.startRun({ seedText: 'sable-cord-001' });
  g.resume();
  const rooms = g.route.rooms;
  const res = { trapRooms: [], armed: 0, snapTest: null, interactable: false };
  for (let i = 0; i < 101; i++) {
    const spec = rooms[i]?.spec;
    if (!spec) continue;
    const n = spec.props.filter((p) => p.kind === 'mousetrap').length;
    if (n) res.trapRooms.push({ i, n });
  }
  for (const { i } of res.trapRooms) {
    const aabb = g.roomAabb(rooms[i]);
    g.player.pos.x = (aabb.minX + aabb.maxX) / 2;
    g.player.pos.z = (aabb.minZ + aabb.maxZ) / 2;
    for (let f = 0; f < 4; f++) g.frame();
    for (const t of g.liveTraps) {
      res.armed++;
      res.interactable = res.interactable || g.interaction.interactables.some((it) => it.kind === 'trap');
      // walk onto it
      const hp = g.player.health;
      g.player.pos.x = t.x; g.player.pos.z = t.z;
      g.frame();
      res.snapTest = res.snapTest ?? { snapped: g.snappedTraps.has(t.key), hpBefore: hp, hpAfter: g.player.health };
    }
  }
  return res;
});
console.log(JSON.stringify(out));
await b.close();
