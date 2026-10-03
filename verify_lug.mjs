import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await b.newPage();
page.on('crash', () => console.log('PAGE CRASHED'));
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__thresholdGame, null, { timeout: 25000 });
const out = await page.evaluate(() => {
  const g = window.__thresholdGame;
  g.startRun({ seedText: 'wax-bell-256' });
  g.resume();
  const rooms = g.route.rooms;
  const found = [];
  for (let i = 0; i < 40; i++) {
    const aabb = g.roomAabb(rooms[i]);
    g.player.pos.x = (aabb.minX + aabb.maxX) / 2;
    g.player.pos.z = (aabb.minZ + aabb.maxZ) / 2;
    for (let f = 0; f < 3; f++) g.frame();
    const a = g.luggageArmed.get(i);
    if (a) found.push(i);
  }
  let spawned = null;
  if (found.length) {
    const i = found[0];
    const a = g.luggageArmed.get(i);
    a.since = -999;
    g.player.pos.x = a.wx - 6.5; g.player.pos.z = a.wz;
    for (let f = 0; f < 3; f++) g.frame();
    const room = g.streamer.get(i);
    const lug = room?.group.children.find((c) => c.name === `lug-${i}`);
    spawned = { spawnedAtDistance: !!lug };
    g.player.pos.x = a.wx - 1; g.player.pos.z = a.wz;
    for (let f = 0; f < 3; f++) g.frame();
    spawned.noticed = g.luggageNoticed.has(i);
  }
  return { armedRooms: found, spawned };
});
console.log(JSON.stringify(out));
await b.close();
