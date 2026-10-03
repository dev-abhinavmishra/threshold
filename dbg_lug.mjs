import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__thresholdGame, null, { timeout: 25000 });
const out = await page.evaluate(() => {
  const g = window.__thresholdGame;
  g.startRun({ seedText: 'wax-bell-256' });
  g.resume();
  const rooms = g.route.rooms;
  const i = 2;
  const aabb = g.roomAabb(rooms[i]);
  g.player.pos.x = (aabb.minX + aabb.maxX) / 2;
  g.player.pos.z = (aabb.minZ + aabb.maxZ) / 2;
  for (let f = 0; f < 4; f++) g.frame();
  const a = g.luggageArmed.get(i);
  if (!a) return { err: 'not armed', cur: g.currentRoom };
  a.since = -999;
  const dx = a.wx - g.player.pos.x, dz = a.wz - g.player.pos.z;
  g.player.yaw = Math.atan2(-dx, -dz); // face away from the spot
  for (let f = 0; f < 5; f++) g.frame();
  const built = g.streamer.get(i);
  return {
    cur: g.currentRoom, dist: Math.hypot(dx, dz).toFixed(2),
    spawned: g.luggageSpawned.has(i),
    lugChildren: built ? built.group.children.filter((c) => c.name === `lug-${i}`).length : -1,
    noticed: g.luggageNoticed.has(i),
  };
});
console.log(JSON.stringify(out));
await b.close();
