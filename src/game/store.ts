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
  deathInfo: { cause: string; hint: string; entity: string; books?: BooksClosed } | null;
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
  hotPages?: number;
  /** wares still hanging in the count's locker at the end */
  seized?: number;
  /** coin the count swallowed outright — cut tags, rotted tags */
  coinKept?: number;
  /** loose goods the floor still holds — spilled piles left lying */
  spilled?: number;
  /** goods still on your back at the end — the take that walked out */
  carried?: number;
  /** goods parked in lids at the end — the stash you never reclaimed */
  stashed?: number;
  /** sprint 531 — how much of the parked take was still marked */
  stashedMarked?: number;
  /** sprint 544 — lamps still burning on the floor at the end */
  lampsLeft?: number;
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
  hotMarginalia?: number;
  hotItems?: ItemId[];
  // the wanted episode outlives you too — torn boards stay torn, an
  // armed repost keeps its remaining seconds
  wantedActive?: boolean;
  wantedRooms?: [number, { x: number; z: number }][];
  wantedRepostS?: number;
  /** Boards torn mid-episode — repost re-pins these exact slots. */
  bareBoards?: [number, { x: number; z: number }][];
  // a pulled junction box stays off the wall — detective rooms that lost
  // their house line don't grow it back on a reload
  deadLines?: number[];
  // the sign stays written — fresh work/kill/wipe marks the hunters read
  // (authored 'old' sign re-derives from sockets, so it isn't carried)
  evidence?: { room: number;
    kind: 'wire' | 'line' | 'water' | 'fan' | 'wipe' | 'blind' | 'work';
    t: number; x: number; z: number; readBy: string[]; weak?: boolean; wiped?: boolean }[];
  // an armed ward seal is paid protection — a reload can't strip it
  wardArmed?: boolean;
  // the count's locker — goods a named catch stripped hang claimable
  // at a cage under a fresh tag; a reload keeps the tag, not the loss
  seizedTake?: { items: { id: ItemId; count: number }[]; x: number; y: number; z: number; fuse?: number; coin?: number };
  // what a rotted tag fed the count — fenced goods waiting on the
  // Broker's shelf ride the checkpoint like the debts that put them there
  fencedTake?: { id: ItemId; count: number }[];
  // coin the count already swallowed — kept outright, no road back
  coinKept?: number;
  // chalk tally marks the player left on doors — authored state, not
  // a consumable: reloading shouldn't erase what they drew
  chalkMarks?: [string, { x: number; y: number; z: number; yaw: number; label: string }][];
  // the dead stay dead — hazards you spent a tool or a risk on don't
  // resurrect on a reload (positions key the match within a room)
  deadHazards?: { room: number; kind: 'snare' | 'steam' | 'fan' | 'eye';
    x: number; z: number; dead?: boolean; filed?: boolean }[];
  // drained flooded halls — physical water state, same class as deadLines
  drainedRooms?: string[];
  // registers that already filed a marked-stock sighting — a reload
  // can't bill the same manifest twice
  stockFiled?: number[];
  /** counters that already sight-filed a 24+ take — the bulge is filed once */
  bulkFiled?: number[];
  // the kicked wedge rode under the leaf — chocks the bellman booted
  // loose lie as gatherable loot; a reload keeps them on the floor
  kickedWedges?: { x: number; z: number }[];
  /** sprint 517 — the take parked in a lid: stashed goods per hiding
   *  spot id, with which stashed ids were marked stock (marks ride
   *  with the goods — a stash parks the take, it doesn't launder it). */
  lidStashes?: { spot: string; items: { id: ItemId; count: number }[]; marked?: ItemId[]; robbedWire?: boolean }[];
  /** sprint 522 — lids whose stash a staffed counter already filed
   *  (space-prefixed spot keys, same as lidStashes) */
  lidFiled?: string[];
  /** sprint 536 — pulse lamps left burning on a floor keep their
   *  battery and their pull through the save. */
  litLamps?: { x: number; z: number; room: number; space: 'main' | 'under'; batt: number; keyYaw?: number }[];
  // felt the floorkeeper pocketed off blinded eyes, spilled where he
  // went down — scattered wraps wait as floor loot, same convention
  droppedWraps?: { x: number; z: number; n: number }[];
  // coils the house worked off a bound leaf — wire isn't destroyed
  // by the strain, it lands as gatherable loot like the kicked chock
  droppedCoils?: { x: number; z: number }[];
  // a paid hand kept the coin — a staggered grafter spills its pouch:
  // floor coin waits as loot, marked coin still marked
  droppedPouches?: { x: number; z: number; n: number; hot: number }[];
  /** The grafter's relocated wire — armed or dead, the graft persists
   *  where it was laid (dead ones also ride deadHazards). */
  graftedWires?: { x: number; z: number; room: number; armed: boolean; planted?: boolean; claimed?: boolean }[];
  // wound clocks still counting — a paid windAlarm shouldn't die unrung
  // on a reload; `t` is the fuse left in seconds, restored onto the
  // live clock like dialedRings/hookRings
  armedLures?: { x: number; y: number; z: number; t: number }[];
  // counters gone cold — a rifled till doesn't re-warm its clerk on a
  // reload (sold wares still restock: you paid for those)
  closedCounters?: number[];
  // rooms whose stock-read already testified — same once-flag class
  stockSeen?: number[];
  // the house only teaches once — first-exposure captions already shown
  // stay shown across a death, same once-flag class as stockSeen
  taught?: string[];
  // receivers already answered — same once-flag class as stockSeen;
  // a reload can't re-offer the read
  answeredPhones?: string[];
  // receivers left off the hook — a planted lure keeps its remaining
  // seconds on the fuse (fuse<=0 means the line already went dead)
  offHook?: { key: string; x: number; z: number; fuse: number }[];
  // sprint 403 — calls you placed ride the checkpoint too: a paid ring
  // still lands after a reload (fuse = seconds until the far line dies)
  dialedRings?: { key: string; x: number; z: number; fuse: number }[];
  // sprint 404 — a trap that already fired or was pried stays down
  // (a reload can't re-arm a spent spring)
  snappedTraps?: string[];
  priedTraps?: string[];
  // sprint 406 — a slid rug or splashed puddle is spent too; the floor
  // doesn't re-slip on a reload (same class as the springs)
  slippedRugs?: string[];
  slippedPuddles?: string[];
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
