/**
 * React shell — menus, HUD, captions, death/victory screens, settings,
 * archive. The game canvas sits behind everything; the sim publishes a
 * HUD snapshot into the store ~15 Hz.
 */
import { useEffect, useRef, useState } from 'react';
import { useGameStore, loadCheckpoint } from '../game/store';
import { Game } from '../game/Game';
import { ITEM_DEFS, DEFAULT_KEYBINDS, DEATH_NAMES } from '../game/config';
import type { SettingsData, Difficulty } from '../game/types';
import { DOCUMENTS } from '../game/documents';

let gameInstance: Game | null = null;

export function getGame(): Game | null {
  return gameInstance;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const phase = useGameStore((s) => s.phase);
  const menuPage = useGameStore((s) => s.menuPage);

  useEffect(() => {
    if (!canvasRef.current || gameInstance) return;
    try {
      const g = new Game(canvasRef.current);
      gameInstance = g;
      g.run();
      const debugOn = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
      if (debugOn) (window as unknown as { __thresholdGame?: Game }).__thresholdGame = g;
      if (debugOn) {
        void import('../game/debug').then(({ debugApi, installDebugPanel }) => {
          installDebugPanel(g, debugApi(g));
        });
      }
    } catch (e) {
      setBootError(e instanceof Error ? e.message : 'WebGL unavailable');
    }
    return () => {
      gameInstance?.dispose();
      gameInstance = null;
    };
  }, []);

  const inGame = phase === 'PLAYING' || phase === 'MINIGAME' || phase === 'PAUSED';
  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />
      {phase === 'MENU' && <Menu />}
      {bootError && (
        <div className="overlay dim">
          <div className="menu-inner">
            <h2>THE HOUSE WILL NOT OPEN</h2>
            <p>This browser cannot create a WebGL context, so the house cannot be drawn. ({bootError})</p>
          </div>
        </div>
      )}
      {inGame && <HUD />}
      {phase === 'PAUSED' && <PauseMenu />}
      {phase === 'DEAD' && <DeathScreen />}
      {phase === 'COMPLETE' && <VictoryScreen />}
      {phase === 'MENU' && menuPage === 'settings' && <SettingsPage />}
      {phase === 'MENU' && menuPage === 'documents' && <ArchivePage />}
      {(phase === 'PAUSED' && menuPage === 'settings') && <SettingsPage />}
    </div>
  );
}

/* ==================== MENU ==================== */

function Menu() {
  const set = useGameStore.setState;
  const pendingSeed = useGameStore((s) => s.pendingSeed);
  const difficulty = useGameStore((s) => s.difficulty);
  const hasCheckpoint = !!loadCheckpoint();
  const menuPage = useGameStore((s) => s.menuPage);

  return (
    <div className="overlay menu">
      <div className="menu-inner">
        <h1 className="title">THRESHOLD</h1>
        <p className="subtitle">A hundred doors. The Meridian keeps them all.</p>
        {menuPage === 'title' && (
          <div className="menu-buttons">
            <button className="btn primary" onClick={() => getGame()?.startRun({})}>
              New Run
            </button>
            {hasCheckpoint && (
              <button className="btn" onClick={() => getGame()?.retryFromCheckpoint()}>
                Continue
              </button>
            )}
            <div className="seed-row">
              <input
                className="seed-input"
                placeholder="seed (optional)"
                value={pendingSeed}
                onChange={(e) => set({ pendingSeed: e.target.value })}
              />
              <button
                className="btn"
                onClick={() => getGame()?.startRun({ seedText: pendingSeed || undefined })}
              >
                Seeded Run
              </button>
            </div>
            <div className="diff-row">
              {(['learning', 'standard', 'hard', 'qa'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  className={`chip ${difficulty === d ? 'active' : ''}`}
                  onClick={() => set({ difficulty: d })}
                >
                  {d === 'qa' ? 'QA (22 rooms)' : d}
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => set({ menuPage: 'settings' })}>Settings</button>
            <button className="btn" onClick={() => set({ menuPage: 'documents' })}>Archive</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== PAUSE ==================== */

function PauseMenu() {
  const set = useGameStore.setState;
  const menuPage = useGameStore((s) => s.menuPage);
  return (
    <div className="overlay dim">
      <div className="menu-inner">
        <h2>Paused</h2>
        {menuPage === 'pause' && (
          <div className="menu-buttons">
            <button className="btn primary" onClick={() => getGame()?.resume()}>Resume</button>
            <button className="btn" onClick={() => set({ menuPage: 'settings' })}>Settings</button>
            <button className="btn" onClick={() => getGame()?.quitToMenu()}>Quit to Menu</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== BOOKS ==================== */

// the books are read back as epitaph lines — victory closes them,
// death leaves them open on you
function bookLines(books: { thefts: number; held: number; asks: number; hotCoin: number; hotGoods: number; hotPages?: number; seized?: number; coinKept?: number; spilled?: number; carried?: number; stashed?: number } | undefined): string[] {
  const lines: string[] = [];
  if (!books) return lines;
  const seized = books.seized ?? 0;
  const coinKept = books.coinKept ?? 0;
  const hotPages = books.hotPages ?? 0;
  const spilled = books.spilled ?? 0;
  const carried = books.carried ?? 0;
  const stashed = books.stashed ?? 0;
  const total = books.thefts + books.held + books.asks + books.hotCoin + books.hotGoods + hotPages + seized + coinKept + spilled + carried + stashed;
  if (total === 0) {
    lines.push('every book closed before the door did');
  } else {
    if (books.thefts > 0) lines.push(`the tally still reads ${books.thefts} ${books.thefts === 1 ? 'theft' : 'thefts'}`);
    if (books.held > 0) lines.push(`the register holds your name in ${books.held} ${books.held === 1 ? 'line' : 'lines'}`);
    if (books.asks > 0) lines.push(`the index keeps ${books.asks} of your questions`);
    if (books.hotCoin > 0) lines.push(`${books.hotCoin} marked ${books.hotCoin === 1 ? 'coin' : 'coins'} left in your purse — they still ring`);
    if (books.hotGoods > 0) lines.push(`${books.hotGoods} marked ${books.hotGoods === 1 ? 'ware' : 'wares'} went home on your back`);
    if (hotPages > 0) lines.push(`${hotPages} torn ${hotPages === 1 ? 'page' : 'pages'} still ride in your purse — the index knows the edge`);
    // the count's locker keeps what it caught — unclaimed at the end
    if (seized > 0) lines.push(`${seized} seized ${seized === 1 ? 'ware' : 'wares'} still hang in the count's locker`);
    if (coinKept > 0) lines.push(`${coinKept} of your ${coinKept === 1 ? 'coin stays' : 'coins stay'} in the count's till`);
    // sprint 500 — the floor keeps what fell: spills nobody reclaimed
    if (spilled > 0) lines.push(`${spilled} loose ${spilled === 1 ? 'good' : 'goods'} still lie on the floor — the house will tidy them`);
    // sprint 513 — and what walked out: the take still on your back
    if (carried > 0) lines.push(`${carried} ${carried === 1 ? 'good' : 'goods'} walked out on your back — the take kept its weight`);
    // sprint 519 — and what stayed parked: the stash you left in a lid
    if (stashed > 0) lines.push(`${stashed} ${stashed === 1 ? 'good stays parked in a lid' : 'goods stay parked in the lids'} — the stash you never reclaimed`);
  }
  return lines;
}

/* ==================== DEATH ==================== */

function DeathScreen() {
  const death = useGameStore((s) => s.deathInfo);
  const lines = bookLines(death?.books);
  return (
    <div className="overlay death">
      <div className="menu-inner">
        <h2 className="death-title">The threshold keeps you</h2>
        <p className="death-cause">{death ? (DEATH_NAMES[death.cause] ?? death.cause) : null}</p>
        <p className="death-hint">{death?.hint}</p>
        <p className="death-note">The Archive remembers: a new document may be unlocked.</p>
        {lines.length > 0 && (
          <div className="stats books">
            <div>the books stay open on you:</div>
            {lines.map((l, i) => <div key={i}>· {l}</div>)}
          </div>
        )}
        <div className="menu-buttons">
          <button className="btn primary" onClick={() => getGame()?.retryFromCheckpoint()}>Retry from checkpoint</button>
          <button className="btn" onClick={() => getGame()?.quitToMenu()}>Abandon run</button>
        </div>
      </div>
    </div>
  );
}

/* ==================== VICTORY ==================== */

function VictoryScreen() {
  const v = useGameStore((s) => s.victoryInfo);
  const mins = v ? Math.max(0, (v.stats.endedAt - v.stats.startedAt) / 60000).toFixed(1) : '0';
  // the books close at the door — the ledgers accrue all run and the
  // exit reads them back as epitaph lines
  const books = v?.books;
  const lines = bookLines(books);
  return (
    <div className="overlay victory">
      <div className="menu-inner">
        <h2 className="victory-title">The hundredth door closes behind you</h2>
        <div className="stats">
          <div>Rooms crossed: {v?.stats.roomsVisited ?? 0}</div>
          <div>Time: {mins} min</div>
          <div>Deaths: {v?.stats.deaths ?? 0}</div>
          <div>Imprints earned: {v?.stats.imprintsEarned ?? 0}</div>
          <div>Underscript: {v?.stats.underscriptCompleted ? 'completed' : `${v?.stats.underscriptDeepest ?? 0} rooms deep`}</div>
        </div>
        {lines.length > 0 && (
          <div className="stats books">
            <div>the books at your back:</div>
            {lines.map((l, i) => <div key={i}>· {l}</div>)}
          </div>
        )}
        <div className="menu-buttons">
          <button className="btn primary" onClick={() => getGame()?.quitToMenu()}>Return to threshold</button>
        </div>
      </div>
    </div>
  );
}

/* ==================== SETTINGS ==================== */

function SettingsPage() {
  const settings = useGameStore((s) => s.settings);
  const set = useGameStore.setState;
  const [remap, setRemap] = useState<string | null>(null);

  useEffect(() => {
    if (!remap) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      const s = { ...settings, keybinds: { ...settings.keybinds, [remap]: e.code } };
      set({ settings: s });
      getGame()?.applySettings(s);
      setRemap(null);
    };
    window.addEventListener('keydown', h, { once: true });
    return () => window.removeEventListener('keydown', h);
  }, [remap, settings, set]);

  const upd = (patch: Partial<SettingsData>) => {
    const s = { ...settings, ...patch };
    set({ settings: s });
    getGame()?.applySettings(s);
  };

  const bind = (label: string, key: string) => (
    <div className="bind-row" key={key}>
      <span>{label}</span>
      <button className="chip" onClick={() => setRemap(key)}>
        {remap === key ? 'press a key…' : (settings.keybinds[key] ?? DEFAULT_KEYBINDS[key] ?? '—')}
      </button>
    </div>
  );

  const slider = (label: string, key: keyof SettingsData, min = 0, max = 1) => (
    <div className="bind-row" key={key}>
      <span>{label}</span>
      <input
        type="range" min={min} max={max} step={0.05}
        value={settings[key] as number}
        onChange={(e) => upd({ [key]: Number(e.target.value) } as Partial<SettingsData>)}
      />
    </div>
  );

  const toggle = (label: string, key: keyof SettingsData) => (
    <div className="bind-row" key={key}>
      <span>{label}</span>
      <button className={`chip ${settings[key] ? 'active' : ''}`} onClick={() => upd({ [key]: !settings[key] } as Partial<SettingsData>)}>
        {settings[key] ? 'on' : 'off'}
      </button>
    </div>
  );

  return (
    <div className="overlay">
      <div className="menu-inner wide">
        <h2>Settings</h2>
        <div className="settings-grid">
          <div>
            <h3>Audio</h3>
            {slider('Master', 'masterVolume')}
            {slider('Music', 'musicVolume')}
            {slider('Ambience', 'ambienceVolume')}
            {slider('Effects', 'effectsVolume')}
            {slider('UI', 'uiVolume')}
          </div>
          <div>
            <h3>Controls</h3>
            {slider('Mouse sensitivity', 'sensitivity', 0.2, 3)}
            {toggle('Invert Y', 'invertY')}
            {slider('FOV', 'fov', 60, 110)}
            {toggle('Toggle crouch', 'toggleCrouch')}
            {toggle('Toggle sprint', 'toggleSprint')}
            {toggle('Head bob', 'headBob')}
          </div>
          <div>
            <h3>Accessibility</h3>
            {toggle('Reduced motion', 'reducedMotion')}
            {toggle('Reduced flashes', 'reducedFlashes')}
            {toggle('Captions', 'captions')}
            {slider('Caption size', 'captionSize', 0.7, 1.6)}
            {toggle('High contrast', 'highContrast')}
            {slider('Minigame assist', 'minigameAssist', 0, 1)}
            {toggle('Reduce panic FX', 'reducePanicFx')}
            <div className="bind-row">
              <span>Hint frequency</span>
              <div>
                {(['minimal', 'standard', 'frequent'] as const).map((h) => (
                  <button key={h} className={`chip ${settings.hintFrequency === h ? 'active' : ''}`}
                    onClick={() => upd({ hintFrequency: h })}>{h}</button>
                ))}
              </div>
            </div>
            <div className="bind-row">
              <span>Quality</span>
              <div>
                {(['low', 'medium', 'high'] as const).map((q) => (
                  <button key={q} className={`chip ${settings.quality === q ? 'active' : ''}`}
                    onClick={() => upd({ quality: q })}>{q}</button>
                ))}
              </div>
            </div>
            {toggle('Adaptive quality', 'adaptiveQuality')}
          </div>
          <div>
            <h3>Keybinds</h3>
            {bind('Forward', 'forward')}
            {bind('Back', 'back')}
            {bind('Left', 'left')}
            {bind('Right', 'right')}
            {bind('Sprint', 'sprint')}
            {bind('Crouch', 'crouch')}
            {bind('Interact', 'interact')}
            {bind('Use item / lamp', 'useItem')}
            {bind('Toss a pebble', 'toss')}
            {bind('Slot 1', 'slot1')}
            {bind('Slot 2', 'slot2')}
            {bind('Slot 3', 'slot3')}
            {bind('Slot 4', 'slot4')}
          </div>
        </div>
        <button className="btn" onClick={() => set({ menuPage: useGameStore.getState().paused ? 'pause' : 'title' })}>Back</button>
      </div>
    </div>
  );
}

/* ==================== ARCHIVE (documents) ==================== */

function ArchivePage() {
  const unlocked = useGameStore((s) => s.documents);
  const set = useGameStore.setState;
  const ids = new Set(unlocked.map((d) => d.id));
  return (
    <div className="overlay">
      <div className="menu-inner wide">
        <h2>The Archive</h2>
        <div className="doc-list">
          {DOCUMENTS.map((d) => (
            <div key={d.id} className={`doc ${ids.has(d.id) ? '' : 'locked'}`}>
              <h4>{ids.has(d.id) ? d.title : '███████'}</h4>
              <p>{ids.has(d.id) ? d.body : 'A page the Meridian is not ready to show you. Die to the entity, or find the page in a drawer.'}</p>
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => set({ menuPage: 'title' })}>Back</button>
      </div>
    </div>
  );
}

/* ==================== HUD ==================== */

function HUD() {
  const hud = useGameStore((s) => s.hud);
  const settings = useGameStore((s) => s.settings);
  return (
    <div className={`hud ${settings.highContrast ? 'hc' : ''}`}>
      <div className="vignette" style={{ opacity: hud.vignette }} />
      {hud.freezeFrame && <div className="freeze-flash" />}
      <div className="top-left">
        <div className="room-label">{hud.inUnderscript ? `U-${String(hud.roomIndex).padStart(3, '0')}` : hud.roomLabel}</div>
        <div className="seed-label">seed {hud.seedText}</div>
      </div>
      <div className="bottom-left">
        <Bar label="health" value={hud.health} max={100} cls="hp" />
        <Bar label="stamina" value={hud.stamina} max={100} cls="st" />
        {hud.panic > 0.01 && <Bar label="panic" value={hud.panic} max={1} cls="panic" />}
        <div className="wallet">
          <span className="imprint">◇ {hud.imprints}</span>
          <span className="marginalia">◇ {hud.marginalia}</span>
        </div>
        <div className="slots">
          {hud.inventory.map((it, i) => (
            <span key={it.id} className="slot">
              {i + 1}·{ITEM_DEFS[it.id]?.name ?? it.id}{it.count > 1 ? `×${it.count}` : ''}
            </span>
          ))}
        </div>
      </div>
      {hud.prompt && (
        <div className="prompt">
          <span className="key">{keyLabel(settings.keybinds.interact ?? 'KeyE')}</span> {hud.prompt}
          {hud.promptProgress > 0 && (
            <div className="hold-bar"><div style={{ width: `${Math.min(100, hud.promptProgress * 100)}%` }} /></div>
          )}
        </div>
      )}
      {settings.captions && (
        <div className="captions" style={{ fontSize: `${settings.captionSize}em` }}>
          {hud.subtitles.slice(-3).map((c) => (
            <div key={c.key} className={`caption ${c.severity}`}>{c.text}</div>
          ))}
        </div>
      )}
      {hud.hidden && <div className="hidden-tag">hidden — panic rises if they pass close</div>}
      {hud.protection === 'losSafe' && <div className="safe-tag">sheltered</div>}
      {hud.stabilizeActive && <StabilizeHud needle={hud.stabilizedNeedle} />}
      <div className="crosshair">·</div>
    </div>
  );
}

function keyLabel(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift');
}

function Bar({ label, value, max, cls }: { label: string; value: number; max: number; cls: string }) {
  return (
    <div className={`bar ${cls}`}>
      <span className="bar-label">{label}</span>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${(value / max) * 100}%` }} /></div>
    </div>
  );
}

function StabilizeHud({ needle }: { needle: number }) {
  return (
    <div className="stabilize">
      <div className="stab-track">
        <div className="stab-zone" />
        <div className="stab-needle" style={{ left: `${needle * 100}%` }} />
      </div>
      <p>hold E while the needle crosses the center</p>
    </div>
  );
}
