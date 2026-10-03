import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__thresholdGame, null, { timeout: 20000 });
const out = await page.evaluate(() => {
  const g = window.__thresholdGame;
  g.startRun({ seedText: 'sable-cord-001' });
  g.resume();
  const KINDS = ['pianoUpright','television','clock','steamVent','boilerTank','pipeManifold','fireplace','stove','masonryHeater','firePit','payphone'];
  const rows = [];
  const rooms = g.route.rooms;
  for (let i = 0; i < 101; i++) {
    const spec = rooms[i]?.spec;
    if (!spec) continue;
    const interesting = spec.props.filter((p) => KINDS.includes(p.kind));
    if (!interesting.length) continue;
    const aabb = g.roomAabb(rooms[i]);
    g.player.pos.x = (aabb.minX + aabb.maxX) / 2;
    g.player.pos.z = (aabb.minZ + aabb.maxZ) / 2;
    g.player.pos.y = 0;
    for (let f = 0; f < 4; f++) g.frame();
    const reg = g.interaction.interactables.filter((it) => ['piano','tv','clock','valve','hearth','phone'].includes(it.kind)).map((it) => it.kind + ':' + it.id);
    rows.push({ i, props: interesting.map((p) => p.kind).join(','), reg: reg.join(',') });
  }
  return rows;
});
console.log(JSON.stringify(out));
await b.close();
