import { chromium } from '@playwright/test';
const base = 'http://localhost:5199';
const seed = process.argv[2] || 'moth-ledger-404';
const rooms = (process.argv[3] || '2,3,7').split(',').map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--run-all-compositor-stages-before-draw', '--disable-frame-rate-limit', '--ozone-platform=headless'] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
await ctx.addInitScript(([s]) => {
  localStorage.setItem('threshold.settings.v2', JSON.stringify({ version: 2, quality: 'low', fov: 70, motion: 'full', captions: true }));
  localStorage.setItem('threshold.run.v1', JSON.stringify({
    seedText: s, difficulty: 'normal', roomIndex: 0, underIndex: 0, inUnderscript: false,
    health: 100, imprints: 50, marginalia: 0,
    inventory: [{ id: 'lamp', count: 1 }],
    stats: { roomsEntered: 1, deaths: 0, hides: 0, panics: 0, itemsTaken: 0, doorsOpened: 0, timePlayedMs: 0 }
  }));
}, [seed]);
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(base);
await page.waitForTimeout(2500);
const btn = page.getByRole('button', { name: /continue|resume/i });
if (await btn.count()) await btn.first().dispatchEvent('click');
await page.waitForTimeout(4000);
const shots = [];
for (const ri of rooms) {
  await page.evaluate(([ri]) => {
    const g = window.__thresholdGame;
    if (!g) return;
    const room = g.route.rooms.find(r => r.index === ri);
    const p = g.player;
    if (!room || !p) { console.log('no room/player', ri); return; }
    const co = Math.cos(room.yaw || 0), si = Math.sin(room.yaw || 0);
    const lz = -Math.min(3, room.spec.depth * 0.3); // near entry (local -Z)
    p.pos.x = room.origin.x + lz * si;
    p.pos.z = room.origin.z + lz * co;
    p.pos.y = room.origin.y ?? 0;
    p.yaw = Math.atan2(room.origin.x - p.pos.x, room.origin.z - p.pos.z);
    p.pitch = -0.05;
    if (p.vel) { p.vel.x = p.vel.y = p.vel.z = 0; }
  }, [ri]);
  await page.waitForTimeout(8000);
  const f = `shots/s21_${seed}_${ri}.png`;
  await page.screenshot({ path: f, timeout: 180000 });
  shots.push(f);
}
console.log(shots.join('\n'));
await browser.close();
