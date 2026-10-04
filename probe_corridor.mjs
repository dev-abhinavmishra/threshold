// Corridor-dressing probe: QA seed → teleport into corridor rooms → count meshes.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1140/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 880, height: 500 } });
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
await page.goto('http://localhost:4173/?debug');
await page.getByRole('button', { name: /QA/ }).click();
await page.getByRole('button', { name: 'New Run' }).click();
await page.locator('.hud').waitFor({ timeout: 60000 });
await page.waitForFunction(() => window.__thresholdGame, { timeout: 30000 });

const targets = await page.evaluate(() => {
  const g = window.__thresholdGame;
  const out = [];
  const seen = new Set();
  for (const r of g.route.rooms) {
    const id = r.templateId ?? '';
    if (!id.startsWith('corr') || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, i: r.index, x: r.origin.x, z: r.origin.z, yaw: r.yaw });
  }
  return out;
});
console.log('targets:', targets.map((t) => t.id).join(', '));

for (const t of targets) {
  await page.evaluate((t) => {
    const g = window.__thresholdGame;
    g.player.teleport(t.x, 1.7, t.z, t.yaw);
  }, t);
  await page.waitForTimeout(1800);
  const info = await page.evaluate((t) => {
    const g = window.__thresholdGame;
    const b = g.streamer.get(t.i);
    if (!b) return `${t.id}: NOT_BUILT`;
    let meshes = 0;
    b.group.traverse((o) => { if (o.isMesh) meshes++; });
    return `${t.id} meshes=${meshes} lights=${b.lights?.length ?? 0} props=${b.spec?.props?.length ?? '?'}`;
  }, t);
  console.log(info);
}
await browser.close();
