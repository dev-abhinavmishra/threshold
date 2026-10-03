import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__thresholdGame, null, { timeout: 20000 });
const out = await page.evaluate(() => {
  const g = window.__thresholdGame;
  g.startRun({ seedText: 'moth-ledger-404' });
  g.resume();
  const rooms = g.route.rooms;
  const res = { kinds: {}, armedRugs: 0, armedPuddles: 0, rugSlip: null, seat: null };
  const want = ['rug','puddle','pipe','bench','window','waterCooler','typewriter'];
  let seatDone = false, rugDone = false;
  for (let i = 0; i < 101; i++) {
    const spec = rooms[i]?.spec; if (!spec) continue;
    const aabb = g.roomAabb(rooms[i]);
    g.player.pos.x = (aabb.minX + aabb.maxX) / 2;
    g.player.pos.z = (aabb.minZ + aabb.maxZ) / 2;
    for (let f = 0; f < 4; f++) g.frame();
    for (const it of g.interaction.interactables) res.kinds[it.kind] = (res.kinds[it.kind] ?? 0) + 1;
    res.armedRugs = g.armedRugs.size;
    res.armedPuddles = g.armedPuddles.size;
    if (!rugDone && g.liveRugs.length) {
      const r = g.liveRugs[0];
      g.player.crouching = false; g.player.pos.x = r.x; g.player.pos.z = r.z;
      g.frame();
      rugDone = true;
      res.rugSlip = { slipped: g.slippedRugs.has(r.key), speed: g.player.speedMul };
      g.player.speedMul = 1;
    }
    if (!seatDone) {
      const s = g.interaction.interactables.find((it) => it.kind === 'seat');
      if (s) {
        g.player.stamina = 20;
        g.interaction.focused = s;
        g.tryInteract();
        g.frame();
        const froze = g.player.frozen;
        g.clock.time += 3.2;
        g.frame();
        seatDone = true;
        res.seat = { froze, stAfter: g.player.stamina, unfroze: !g.player.frozen, restingNull: g.resting === null };
      }
    }
  }
  res.armedRugs = g.armedRugs.size;
  res.armedPuddles = g.armedPuddles.size;
  res.armedRugTrue = [...g.armedRugs.values()].filter(Boolean).length;
  res.armedPudTrue = [...g.armedPuddles.values()].filter(Boolean).length;
  return res;
});
console.log(JSON.stringify(out));
await b.close();
