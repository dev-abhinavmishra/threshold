// Raw-CDP playtest soak on the long-lived desktop Chrome (port 29229).
// Mirrors e2e/playtest.spec.ts playOnce evaluate; no playwright runner needed.
import WebSocket from 'ws';
import { readFileSync } from 'fs';

const STYLE = process.argv[2] ?? 'looter';
const SPACE = process.argv[3] ?? 'under';
const SEEDS = (process.env.PLAYTEST_SEEDS ?? 'ash-vault-101,gilt-spine-777,wax-bell-256').split(',');
const BASE = process.env.SOAK_URL ?? 'http://localhost:4173';

const version = await (await fetch('http://localhost:29229/json/version')).json();
const ws = new WebSocket(version.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

let mid = 0;
const pending = new Map();
const events = [];
ws.on('message', (data) => {
  const m = JSON.parse(data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else events.push(m);
});
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++mid;
    pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

// fresh tab on the preview build
const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: false });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);

const evaljs = async (expr, awaitPromise = false, timeout = 120_000) => {
  const r = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise, timeout,
  }, sessionId);
  if (r.exceptionDetails) throw new Error('evaluate threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result?.value;
};

await send('Page.navigate', { url: `${BASE}/?debug` }, sessionId);
await new Promise((r) => setTimeout(r, 2500));

// boot: click New Run, wait for game handle
const boot = async () => {
  for (let i = 0; i < 60; i++) {
    const ready = await evaljs(
      `(() => {
        const b = [...document.querySelectorAll('button')].find(x => /new run/i.test(x.textContent||''));
        return b ? 'menu' : (window.__thresholdGame ? 'game' : 'wait');
      })()`);
    if (ready === 'game') return;
    if (ready === 'menu') {
      await evaljs(`[...document.querySelectorAll('button')].find(x => /new run/i.test(x.textContent||'')).click()`);
    }
    await new Promise((r) => setTimeout(r, 500));
    const g = await evaljs(`!!(window.__thresholdGame)`);
    if (g) return;
  }
  throw new Error('boot timeout');
};
await boot();
console.log('booted');

const EVAL_BODY = readFileSync(new URL('./soak-eval.js', import.meta.url), 'utf8');
for (const seed of SEEDS) {
  const expr = `(${EVAL_BODY})(${JSON.stringify({ seed, style: STYLE, space: SPACE })})`;
  const r = await evaljs(expr);
  console.log(
    `PLAYTEST ${r.style} ${r.seed}: rooms=${r.roomsReached}/${r.rooms} deaths=${r.deathsTotal}` +
    ` (hidden ${r.deathsHidden}) seq=${r.deathsSeq ?? ''}` +
    ` [${Object.entries(r.deaths).map(([k, v]) => `${k}x${v}`).join(' ') || '-'}]` +
    ` imp+${r.stats.imprintsEarned} marg+${r.stats.marginaliaEarned} inv=${r.inventory.length}`,
  );
  if (r.roomsReached < 90) { console.log(`FAIL ${r.seed}: ${r.roomsReached} < 90`); process.exitCode = 1; }
}
await send('Target.closeTarget', { targetId }).catch(() => {});
ws.close();
process.exit(process.exitCode ?? 0);
