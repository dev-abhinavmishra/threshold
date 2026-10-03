import { chromium } from '@playwright/test';
const base = 'http://localhost:5199';
const seed = process.argv[2] || 'moth-ledger-404';
// teleport into rooms that likely contain batch-7 props
const targets = (process.argv[3] || 'u-open-office:u,guest-standard:main,u-break:u').split(',');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
page.on('crash', () => console.log('PAGE CRASH'));
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(base);
await page.waitForTimeout(2500);
const btn = page.getByRole('button', { name: /continue|resume/i });
if (await btn.count()) await btn.first().dispatchEvent('click');
await page.waitForTimeout(4000);
const shots = [];
for (const t of targets) {
  const [tpl, space] = t.split(':');
  const got = await page.evaluate(([tpl, space]) => {
    const g = window.__thresholdGame;
    if (!g) return 'no game';
    const list = space === 'u' ? g.route.underRooms : g.route.rooms;
    const room = list.find(r => (r.templateId || r.spec?.templateId) === tpl);
    const p = g.player;
    if (!room || !p) return 'no room ' + tpl;
    const co = Math.cos(room.yaw || 0), si = Math.sin(room.yaw || 0);
    const lz = -Math.min(3, (room.spec?.depth || 8) * 0.32);
    p.pos.x = room.origin.x + lz * si;
    p.pos.z = room.origin.z + lz * co;
    p.pos.y = room.origin.y ?? 0;
    p.yaw = Math.atan2(room.origin.x - p.pos.x, room.origin.z - p.pos.z);
    p.pitch = -0.05;
    if (p.vel) { p.vel.x = p.vel.y = p.vel.z = 0; }
    return 'ok ' + tpl;
  }, [tpl, space]);
  console.log(got);
  await page.waitForTimeout(8000);
  const f = `shots/s44_${seed}_${tpl}.png`;
  await page.screenshot({ path: f, timeout: 180000 });
  shots.push(f);
}
console.log(shots.join('\n'));
await browser.close();
