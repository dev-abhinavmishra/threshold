/**
 * Dev-only debug surface: room-jump, entity spawn/kill, state overlay,
 * perf HUD (fps + draw calls), seed info. Enabled with ?debug=1 or
 * import.meta.env.DEV. Zero production impact — installed lazily and
 * never included in the critical path.
 */
import { Game } from './Game';
import { ENTITY_TUNING } from './config';

export interface DebugApi {
  jump: (room: number) => void;
  spawn: (id: string) => boolean;
  killAll: () => void;
  entityStates: () => { id: string; state: string; t: number }[];
  perf: () => { fps: number; calls: number; tris: number };
  pos: () => { room: number; x: number; z: number };
  seed: () => string;
  damage: (n: number) => void;
  godmode: (on: boolean) => void;
}

interface GameInternals {
  route: { rooms: { index: number; origin: { x: number; y: number; z: number } }[] } | null;
  currentRoom: number;
  player: { pos: { x: number; y: number; z: number } };
  entities: { id: string; state: string; stateT: number }[];
  renderer: { info: { render: { calls: number; triangles: number } } };
  seed: string;
  spawnEntity: (e: unknown) => void;
  damagePlayer: (n: number, src: string, hint: string) => void;
  godMode: boolean;
}

export function debugApi(game: Game): DebugApi {
  const g = game as unknown as GameInternals;
  const api: DebugApi = {
    jump: (room) => {
      const arr = g.route?.rooms ?? [];
      if (!arr.length) return;
      const i = Math.max(0, Math.min(arr.length - 1, room));
      g.currentRoom = i;
      const o = arr[i].origin;
      g.player.pos.x = o.x; g.player.pos.y = o.y; g.player.pos.z = o.z;
    },
    spawn: (id) => {
      const entity = (ENTITY_TUNING as Record<string, unknown>)[id];
      if (!entity) return false;
      // Spawn through the game's own path by constructing via the switch:
      // use the schedule path — direct ctor map lives in Game.spawnEntity callers;
      // simplest reliable path: emit through the same switch Game uses.
      (g as unknown as { spawnById?: (s: string) => void }).spawnById?.(id);
      return true;
    },
    killAll: () => { for (const e of g.entities) (e as unknown as { done: () => void }).done(); },
    entityStates: () => g.entities.map((e) => ({ id: e.id, state: e.state, t: e.stateT })),
    perf: () => ({ fps: 0, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }),
    pos: () => ({ room: g.currentRoom, x: g.player.pos.x, z: g.player.pos.z }),
    seed: () => g.seed,
    damage: (n) => g.damagePlayer(n, 'debug', ''),
    godmode: (on) => { g.godMode = on; },
  };
  return api;
}

/** DOM overlay panel — plain HTML, no React, created once. */
export function installDebugPanel(_game: Game, api: DebugApi): void {
  const el = document.createElement('div');
  el.id = 'dbg';
  el.style.cssText = [
    'position:fixed', 'top:8px', 'left:8px', 'z-index:9999', 'font:11px/1.4 monospace',
    'background:rgba(0,0,0,.78)', 'color:#9fc', 'padding:8px 10px', 'border:1px solid #345',
    'border-radius:4px', 'min-width:230px', 'user-select:none', 'pointer-events:auto',
  ].join(';');
  el.innerHTML = `
    <b style="color:#fd8">THRESHOLD debug</b>
    <div id="dbg-perf"></div>
    <div id="dbg-pos"></div>
    <div id="dbg-ent" style="max-height:140px;overflow:auto"></div>
    <div style="margin-top:4px">
      jump <input id="dbg-jump" size="4"> <button id="dbg-go">go</button>
      <select id="dbg-spawn" style="margin-left:4px"></select><button id="dbg-do">spawn</button>
      <button id="dbg-kill">kill all</button>
      <button id="dbg-god">god</button>
    </div>`;
  document.body.appendChild(el);
  const sel = el.querySelector<HTMLSelectElement>('#dbg-spawn')!;
  for (const id of Object.keys(ENTITY_TUNING)) {
    const o = document.createElement('option');
    o.value = o.textContent = id;
    sel.appendChild(o);
  }
  el.querySelector('#dbg-go')!.addEventListener('click', () => {
    api.jump(parseInt(el.querySelector<HTMLInputElement>('#dbg-jump')!.value || '0', 10));
  });
  el.querySelector('#dbg-do')!.addEventListener('click', () => api.spawn(sel.value));
  el.querySelector('#dbg-kill')!.addEventListener('click', () => api.killAll());
  let god = false;
  el.querySelector('#dbg-god')!.addEventListener('click', (e) => {
    god = !god; api.godmode(god);
    (e.target as HTMLElement).style.color = god ? '#f66' : '';
  });

  let last = performance.now(), frames = 0, fps = 0;
  const perfEl = el.querySelector('#dbg-perf')!, posEl = el.querySelector('#dbg-pos')!, entEl = el.querySelector('#dbg-ent')!;
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - last >= 500) {
      fps = Math.round((frames * 1000) / (now - last)); frames = 0; last = now;
      const p = api.perf(); const ps = api.pos();
      perfEl.textContent = `${fps} fps · ${p.calls} calls · ${(p.tris / 1000).toFixed(0)}k tris`;
      posEl.textContent = `room ${ps.room} · (${ps.x.toFixed(1)}, ${ps.z.toFixed(1)}) · seed ${api.seed()}`;
      const ents = api.entityStates();
      entEl.innerHTML = ents.map((e) => `<div>${e.id} <i>${e.state}</i> ${e.t.toFixed(1)}s</div>`).join('') || '<i>no entities</i>';
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
