/**
 * Zustand store — UI-facing state only. The simulation owns truth; this
 * store is a snapshot the Game publishes each frame for React to render.
 */
import { create } from 'zustand';
import type { GamePhase, ItemId, Document, SettingsData, RunStats, Difficulty } from './types';
import { defaultSettings, DEFAULT_KEYBINDS } from './config';

export interface HudState {
  health: number;
  stamina: number;
  panic: number; // 0..1
  roomLabel: string;
  roomIndex: number;
  inUnderscript: boolean;
  prompt: string;
  promptProgress: number;
  interactable: string | null;
  imprints: number;
  marginalia: number;
  inventory: { id: ItemId; count: number }[];
  hidden: boolean;
  protection: 'exposed' | 'losSafe' | 'hidden';
  subtitles: { text: string; severity: 'info' | 'warn' | 'danger'; key: number }[];
  vignette: number; // 0..1 danger vignette intensity
  stabilizedNeedle: number; // stabilization minigame position 0..1
  stabilizeActive: boolean;
  freezeFrame: boolean; // stillframe flash cue
  floor: 'main' | 'under';
  seedText: string;
}

export interface GameUi {
  phase: GamePhase;
  hud: HudState;
  settings: SettingsData;
  difficulty: Difficulty;
  documents: Document[];
  deathInfo: { cause: string; hint: string; entity: string } | null;
  victoryInfo: { stats: RunStats; books?: BooksClosed } | null;
  shopItems: { id: ItemId; price: number; slot: number; sold: boolean }[];
  shopOpen: boolean;
  menuPage: 'title' | 'settings' | 'documents' | 'death' | 'victory' | 'pause' | 'seeds';
  pendingSeed: string;
  achievements: string[];
  paused: boolean;
}

const emptyHud: HudState = {
  health: 100, stamina: 100, panic: 0, roomLabel: 'THRESHOLD', roomIndex: 0,
  inUnderscript: false, prompt: '', promptProgress: 0, interactable: null,
  imprints: 0, marginalia: 0, inventory: [], hidden: false, protection: 'exposed',
  subtitles: [], vignette: 0, stabilizedNeedle: 0, stabilizeActive: false,
  freezeFrame: false, floor: 'main', seedText: '',
};

export const useGameStore = create<GameUi>(() => ({
  phase: 'MENU',
  hud: emptyHud,
  settings: defaultSettings(),
  difficulty: 'standard',
  documents: [],
  deathInfo: null,
  victoryInfo: null,
  shopItems: [],
  shopOpen: false,
  menuPage: 'title',
  pendingSeed: '',
  achievements: [],
  paused: false,
}));

export const ui = useGameStore;

/* ---------------- persistence ---------------- */

const SETTINGS_KEY = 'threshold.settings.v2';
const META_KEY = 'threshold.meta.v1';
const RUN_KEY = 'threshold.run.v1';

export function loadSettings(): SettingsData {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as SettingsData;
    if (parsed.version !== 2) return defaultSettings();
    return { ...defaultSettings(), ...parsed, keybinds: { ...DEFAULT_KEYBINDS, ...parsed.keybinds } };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: SettingsData): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export interface MetaSave {
  documents: string[]; // unlocked doc ids
  victories: number;
  deaths: number;
  bestRoom: number;
  totalRuns: number;
  achievements: string[];
}

export function loadMeta(): MetaSave {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MetaSave>;
      return {
        documents: parsed.documents ?? [], victories: parsed.victories ?? 0,
        deaths: parsed.deaths ?? 0, bestRoom: parsed.bestRoom ?? 0,
        totalRuns: parsed.totalRuns ?? 0, achievements: parsed.achievements ?? [],
      };
    }
  } catch {
    /* ignore */
  }
  return { documents: [], victories: 0, deaths: 0, bestRoom: 0, totalRuns: 0, achievements: [] };
}

export function saveMeta(m: MetaSave): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** The ledgers as the door left them — read aloud on the victory screen. */
export interface BooksClosed {
  thefts: number;
  held: number;
  asks: number;
  hotCoin: number;
  hotGoods: number;
}

export interface CheckpointSave {
  seedText: string;
  difficulty: Difficulty;
  roomIndex: number;
  underIndex: number;
  inUnderscript: boolean;
  health: number;
  imprints: number;
  marginalia: number;
  inventory: { id: ItemId; count: number }[];
  stats: RunStats;
  // the ledgers outlive you — the books keep your name past a death
  unpaidTheft?: number;
  unpaidHeld?: number;
  paperTrail?: number;
  hotImprints?: number;
  hotItems?: ItemId[];
  // the wanted episode outlives you too — torn boards stay torn, an
  // armed repost keeps its remaining seconds
  wantedActive?: boolean;
  wantedRooms?: [number, { x: number; z: number }][];
  wantedRepostS?: number;
  // a pulled junction box stays off the wall — detective rooms that lost
  // their house line don't grow it back on a reload
  deadLines?: number[];
  // the sign stays written — fresh work/kill/wipe marks the hunters read
  // (authored 'old' sign re-derives from sockets, so it isn't carried)
  evidence?: { room: number;
    kind: 'wire' | 'line' | 'water' | 'fan' | 'wipe' | 'blind' | 'work';
    t: number; x: number; z: number; readBy: string[]; weak?: boolean; wiped?: boolean }[];
  // the dead stay dead — hazards you spent a tool or a risk on don't
  // resurrect on a reload (positions key the match within a room)
  deadHazards?: { room: number; kind: 'snare' | 'steam' | 'fan' | 'eye';
    x: number; z: number; dead?: boolean; filed?: boolean }[];
  // drained flooded halls — physical water state, same class as deadLines
  drainedRooms?: string[];
}

export function saveCheckpoint(c: CheckpointSave): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function loadCheckpoint(): CheckpointSave | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (raw) return JSON.parse(raw) as CheckpointSave;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearCheckpoint(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}
