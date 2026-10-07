import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage();
await page.addInitScript(() => {
  localStorage.setItem('threshold.run.v1', JSON.stringify({
    seedText: 'viewmodel-seed', difficulty: 'qa', roomIndex: 0, underIndex: 0, inUnderscript: false,
    health: 100, imprints: 0, marginalia: 0,
    inventory: [{ id: 'doorKey', count: 1 }, { id: 'handLamp', count: 80 }],
    stats: { startedAt: 0, endedAt: 0, deaths: 0, retries: 0, roomsVisited: 1,
      imprintsEarned: 0, marginaliaEarned: 0, entityEncounters: {},
      underscriptDeepest: 0, underscriptCompleted: false },
  }));
});
await page.goto('http://localhost:4173/?debug');
await page.getByRole('button', { name: /QA/ }).click();
await page.getByRole('button', { name: 'Continue', exact: true }).click({ force: true });
await page.locator('.hud').waitFor({ timeout: 30_000 });
await page.evaluate(() => { window.__thresholdGame.renderFrame = () => {}; });
await page.keyboard.press('Digit1');
await page.keyboard.press('KeyF');

const cdp = await page.context().newCDPSession(page);
await cdp.send('Debugger.enable');
// sample the main thread's stack periodically; whatever it sits in IS the wedge
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const p = cdp.send('Debugger.pause').then(() => new Promise((res) => {
    const onPaused = (e) => { cdp.off('Debugger.paused', onPaused); res(e.callFrames.slice(0, 6).map((f) => `${f.functionName} ${f.url.split('/').pop()}:${f.location.lineNumber}`)); };
    cdp.on('Debugger.paused', onPaused);
  }));
  const stack = await Promise.race([p, new Promise((r) => setTimeout(() => r(['<busy>']), 800))]);
  console.log(`sample ${i}:`, JSON.stringify(stack));
  await cdp.send('Debugger.resume').catch(() => {});
}
const s = await page.evaluate(() => {
  const g = window.__thresholdGame;
  return { on: g.lampOn, beam: !!g.beamGroup?.visible, held: g.heldView.itemId, t: g.clock.time };
});
console.log('STATE', JSON.stringify(s));
await b.close();
