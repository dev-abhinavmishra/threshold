/**
 * Shared types across run state, world generation, entities, and UI.
 */
import type { Aabb, Vec3 } from '../engine/math';
import type { Rng } from '../engine/rng';

export type GamePhase =
  | 'BOOT'
  | 'MENU'
  | 'LOADING'
  | 'PLAYING'
  | 'PAUSED'
  | 'MINIGAME'
  | 'DYING'
  | 'DEAD'
  | 'ENDING'
  | 'COMPLETE';

export type Biome =
  | 'lobby'
  | 'corridor'
  | 'guest'        // hotel bedrooms / reception
  | 'records'      // stacks, offices, catalog rooms
  | 'maintenance'  // service corridors, machine rooms
  | 'gallery'      // observation spaces, conservatory
  | 'unlit'        // The Unlit Stacks (late game)
  | 'milestone'
  | 'safe'
  | 'underscript';

export type EntityId =
  | 'sweep'
  | 'reprise'
  | 'witness'
  | 'whisper'
  | 'inkling'
  | 'redactor'
  | 'echoskin'
  | 'maelstrom'
  | 'pursuer'
  | 'curator'
  | 'hollow'
  | 'husk'
  // Underscript
  | 'redline'
  | 'stillframe'
  | 'returner'
  | 'margin'
  | 'editor'
  | 'grafter'
  // Environmental
  | 'hazard'
  // Set-piece systems
  | 'orrery'
  | 'lurker'
  | 'behemoth';

export type ItemId =
  | 'handLamp'
  | 'pulseLamp'
  | 'sparkFlash'
  | 'tonic'
  | 'bandage'
  | 'latchpick'
  | 'feltWrap'
  | 'resonanceKey'
  | 'chalkSpool'
  | 'wardSeal'
  | 'palimpsest'
  | 'doorKey'
  | 'imprints'      // currency, counter not a slot
  | 'marginalia';   // subfloor score, counter not a slot

export type HidingKind = 'cabinet' | 'vent' | 'underFurniture' | 'losAlcove';

export interface HidingSpot {
  id: string;
  kind: HidingKind;
  /** World-space volume the player occupies while hidden. */
  volume: Aabb;
  /** Position the camera settles at while hidden. */
  viewPos: Vec3;
  /** Forward yaw the camera assumes while hidden. */
  viewYaw: number;
  /** Where the player stands when exiting. */
  exitPos: Vec3;
  roomIndex: number;
  /** Set at generation time when Hollow occupies this spot. */
  trappedBy?: EntityId;
  /** Readable trap clues generated when trapped. */
  trapClues: string[];
}

export type SocketKind =
  | 'loot'
  | 'key'
  | 'hiding'
  | 'lore'
  | 'hazard'
  | 'drawer'
  | 'cabinet'
  | 'itemPedestal'
  | 'clue'
  | 'distraction'
  | 'machine';

export interface Socket {
  kind: SocketKind;
  pos: Vec3;
  /** Room-local yaw so props orient correctly. */
  yaw: number;
  filled: boolean;
  meta: Record<string, number | string | boolean>;
}

export interface NavNode {
  id: string;
  pos: Vec3;
  links: string[]; // ids of connected nav nodes (same room or neighbors)
  tags: string[];  // e.g. 'corridor', 'door', 'center', 'safe'
}

/** A door separating two rooms (or sealing a side alcove). */
export interface Door {
  id: string;
  roomIndex: number;
  /** false for side-branch doors */
  isMainRoute: boolean;
  /** Door leaf center. */
  pos: Vec3;
  /** 0 = facing +Z/-Z, PI/2 = facing +X/-X */
  yaw: number;
  locked: boolean;
  lockId?: string;   // key socket must supply matching lockId
  /** False-door planted by Redactor. */
  falseDoor?: boolean;
  /** Diegetic number shown on the door. */
  label: string;
  openT: number;     // 0 closed, 1 open (animated)
  opening: boolean;
}

export interface RoomInstance {
  /** Route index 0..100 for main floor, or 0..120 inside Underscript. */
  index: number;
  /** Displayed threshold label, e.g. "017" or "U-042". */
  label: string;
  templateId: string;
  biome: Biome;
  /** World transform applied to the template's local space. */
  origin: Vec3;       // room-local (0,0,0) in world
  yaw: number;        // room rotation (0, PI/2, PI, 3PI/2)
  /** Local-space bounds. */
  width: number;
  depth: number;
  height: number;
  /** Collision blockers in world space (physical). */
  colliders: Aabb[];
  /** LOS blockers in world space = colliders + transparent sight blockers. */
  losBlockers: Aabb[];
  /** Walkable-space override boxes (floors are implicit). */
  doors: Door[];
  hidingSpots: HidingSpot[];
  navNodes: NavNode[];
  sockets: Socket[];
  /** Which positions this room uses to link to neighbors. */
  entryPos: Vec3;     // world-space door centers
  exitPos: Vec3;
  entryDir: Vec3;     // outward direction of entry (points back to prev room)
  exitDir: Vec3;
  /** Diegetic light groups for warnings/flicker. */
  lightGroup: 'main' | 'dim' | 'none';
  darkRoom: boolean;
  authored: boolean;
  /** LOS-safe alcove volumes that count as physical safe spots. */
  safeZones: Aabb[];
  /** Per-room encounter metadata set by the director. */
  scheduled: ScheduledEncounter[];
  /** Optional branch room index connected through a side door. */
  branchOf?: number;
  /** Gap corridor bridging prev exit → this room's entry (jittered milestones). */
  connectorIn?: { a: Vec3; b: Vec3; elbow?: Vec3 };
  /** Materials audible underfoot. */
  floorMaterial: 'wood' | 'carpet' | 'stone' | 'metal' | 'concrete' | 'paper';
  /** The spec this room was instantiated from (retained for mesh building). */
  spec?: import('../world/spec').RoomSpec;
}

export interface ScheduledEncounter {
  entity: EntityId;
  /** Room index where the cue begins. */
  triggerRoom: number;
  /** Deterministic variant seed. */
  seed: number;
  /** For rebound entities. */
  passes?: number;
}

export interface RunStats {
  startedAt: number;
  endedAt: number;
  deaths: number;
  retries: number;
  roomsVisited: number;
  imprintsEarned: number;
  marginaliaEarned: number;
  entityEncounters: Partial<Record<EntityId, number>>;
  underscriptDeepest: number;
  underscriptCompleted: boolean;
  victory: boolean;
}

export type Difficulty = 'learning' | 'standard' | 'hard' | 'qa';

export interface SettingsData {
  version: number;
  masterVolume: number;
  musicVolume: number;
  ambienceVolume: number;
  effectsVolume: number;
  uiVolume: number;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  toggleCrouch: boolean;
  toggleSprint: boolean;
  headBob: boolean;
  reducedMotion: boolean;
  reducedFlashes: boolean;
  captions: boolean;
  captionSize: number;
  highContrast: boolean;
  hintFrequency: 'minimal' | 'standard' | 'frequent';
  minigameAssist: number; // 0..1 eases QTE/stabilization difficulty
  quality: 'low' | 'medium' | 'high';
  keybinds: Record<string, string>;
  reducePanicFx: boolean;
}

export interface Document {
  id: string;
  title: string;
  body: string;
  unlockedAt: number;
  category: 'entity' | 'lore' | 'note';
}

export interface SaveData {
  version: number;
  checkpoint?: { seedText: string; threshold: number; inventory: ItemId[]; imprints: number };
  documents: Document[];
  bestThreshold: number;
  stats: { runs: number; victories: number; underscriptVictories: number };
}

/** Context passed to room builders and encounters. */
export interface BuildContext {
  rng: Rng;
  index: number;
  label: string;
  biome: Biome;
  difficulty: Difficulty;
}

/** Serialized entity tuning — see config.ts. */
export interface EntityTuning {
  warningTime: number;      // seconds of readable cue before threat active
  speed: number;
  damage: number;
  killRange: number;
  seeRange: number;
  cooldown: number;         // min rooms between appearances
  spawnChance: number;      // base probability when eligible
  minRoom: number;          // earliest route index it may appear
  maxRoom?: number;
  biomes?: Biome[];         // restrict to these biomes (empty = any)
}
