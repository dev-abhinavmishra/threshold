import { chromium } from '@playwright/test';
import zlib from 'zlib';
import fs from 'fs';

const seed = process.argv[2] || 'moth-ledger-404';
const rooms = (process.argv[3] || '9').split(',').map(Number);

function png(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(t) : crc32(t) >>> 0);
    return Buffer.concat([len, t, crc]);
  };
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 500 } });
await ctx.addInitScript(([s]) => {
  localStorage.setItem('threshold.settings.v2', JSON.stringify({ version: 2, quality: 'low', fov: 70, motion: 'full', captions: true }));
  localStorage.setItem('threshold.run.v1', JSON.stringify({ seedText: s, difficulty: 'normal', roomIndex: 0, underIndex: 0, inUnderscript: false, health: 100, imprints: 50, marginalia: 0, inventory: [{ id: 'lamp', count: 1 }], stats: { roomsEntered: 1, deaths: 0, hides: 0, panics: 0, itemsTaken: 0, doorsOpened: 0, timePlayedMs: 0 } }));
}, [seed]);
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
await p.goto('http://localhost:5199');
await p.waitForTimeout(4000);
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /continue|resume|new run/i.test(x.textContent))?.click(); });
await p.waitForTimeout(10000);
console.log('phase:', await p.evaluate(() => { const g = window.__thresholdGame; return g && g.route ? 'run:' + g.route.rooms.length : 'no-route'; }));

for (const ri of rooms) {
  await p.evaluate(([ri]) => {
    const g = window.__thresholdGame;
    const room = g.route.rooms.find(r => r.index === ri);
    const pl = g.player;
    const lz = -Math.min(3, room.spec.depth * 0.3);
    pl.pos.x = room.origin.x + lz * Math.sin(room.yaw);
    pl.pos.z = room.origin.z + lz * Math.cos(room.yaw);
    pl.pos.y = room.origin.y;
    pl.yaw = Math.atan2(room.origin.x - pl.pos.x, room.origin.z - pl.pos.z);
    pl.pitch = -0.05;
    if (pl.vel) { pl.vel.x = pl.vel.y = pl.vel.z = 0; }
  }, [ri]);
  await p.waitForTimeout(9000);
  const data = await p.evaluate(() => {
    const g = window.__thresholdGame;
    const r = g.renderer;
    const w = 800, h = 500;
    const RT = Object.getPrototypeOf(g.composer.renderTarget1).constructor;
    const rt = new RT(w, h, { samples: 0 });
    r.setRenderTarget(rt);
    r.render(g.scene, g.camera);
    const buf = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    r.setRenderTarget(null);
    rt.dispose();
    return Array.from(buf);
  });
  const buf = Buffer.from(data);
  // WebGL rows are bottom-up — flip vertically, un-premultiply not needed (alpha 255)
  const flipped = Buffer.alloc(buf.length);
  const w = 800, h = 500;
  for (let y = 0; y < h; y++) buf.copy(flipped, (h - 1 - y) * w * 4, y * w * 4, (y + 1) * w * 4);
  const f = `shots/s21_${seed}_${ri}.png`;
  fs.writeFileSync(f, png(w, h, flipped));
  console.log('wrote', f);
}
await b.close();
