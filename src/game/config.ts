/**
 * Central tuning data — entity stats, player constants, difficulty presets,
 * balance rules. All gameplay constants live here, not scattered in code.
 */
import type { Difficulty, EntityId, EntityTuning, SettingsData } from './types';

export const PLAYER = {
  height: 1.7,
  crouchHeight: 0.95,
  radius: 0.32,
  eyeHeight: 1.62,
  crouchEyeHeight: 0.9,
  walkSpeed: 4.2,
  sprintSpeed: 6.8,
  crouchSpeed: 2.0,
  accel: 28,
  friction: 14,
  stepHeight: 0.45,
  interactRange: 2.6,
  maxHealth: 100,
  staminaMax: 100,
  staminaDrain: 16,       // per second sprinting
  staminaRegen: 22,       // per second not sprinting
  headBobAmp: 0.035,
  headBobFreq: 1.9,
};

export const PANIC = {
  // Seconds of safe hiding before forced exit, lerped by progress.
  baseSafeTime: 22,
  lateSafeTime: 11,
  // Onboarding forgiveness — much longer window before room 10.
  graceRoomLimit: 10,
  graceSafeTime: 60,
  reentryCooldown: 8,
  warningAt: 0.65, // fraction at which strong tremor starts
};

export const DIRECTOR = {
  // Rooms the entity needs to stay away before reuse.
  globalEntityCooldownRooms: 3,
  // Recent-death mercy: reduce encounter pressure after a death.
  mercyRoomsAfterDeath: 4,
  // Prewarm: build rooms this far ahead.
  prewarmAhead: 5,
  // Keep this many prior rooms instantiated (rebound + backtracking).
  keepBehind: 4,
};

const STD = 1;

export const ENTITY_TUNING: Record<EntityId, EntityTuning> = {
  sweep: {
    warningTime: 3.2, speed: 22, damage: 100, killRange: 1.6, seeRange: 9,
    cooldown: 6, spawnChance: 0.5, minRoom: 10,
  },
  reprise: {
    warningTime: 3.6, speed: 18, damage: 100, killRange: 1.6, seeRange: 9,
    cooldown: 8, spawnChance: 0.35, minRoom: 31,
  },
  warden: {
    warningTime: 0.5, speed: 1.4, damage: 40, killRange: 0, seeRange: 9,
    cooldown: 8, spawnChance: 0.3, minRoom: 22, maxRoom: 74,
    biomes: ['corridor', 'gallery', 'records'],
  },
  groundswell: {
    warningTime: 2.5, speed: 0, damage: 15, killRange: 0, seeRange: 0,
    cooldown: 8, spawnChance: 0.3, minRoom: 30, maxRoom: 80,
    biomes: ['corridor', 'gallery', 'records', 'maintenance'],
  },
  witness: {
    warningTime: 0.8, speed: 0, damage: 14, killRange: 0, seeRange: 14,
    cooldown: 7, spawnChance: 0.4, minRoom: 20, biomes: ['gallery', 'records', 'guest'],
  },
  whisper: {
    warningTime: 1.6, speed: 0, damage: 45, killRange: 0, seeRange: 12,
    cooldown: 6, spawnChance: 0.5, minRoom: 20,
  },
  inkling: {
    warningTime: 0.5, speed: 0, damage: 26, killRange: 0, seeRange: 6,
    cooldown: 5, spawnChance: 0.45, minRoom: 22,
  },
  lurker: {
    warningTime: 1.0, speed: 1.6, damage: 28, killRange: 1.4, seeRange: 9,
    cooldown: 7, spawnChance: 0.4, minRoom: 28, biomes: ['maintenance', 'unlit', 'guest'],
  },
  inspector: {
    warningTime: 0, speed: 1.7, damage: 30, killRange: 0, seeRange: 0,
    cooldown: 9, spawnChance: 0.44, minRoom: 16, maxRoom: 82,
    biomes: ['guest', 'records', 'gallery'],
  },
  commissionaire: {
    warningTime: 0, speed: 2.7, damage: 20, killRange: 0, seeRange: 0,
    cooldown: 10, spawnChance: 0.5, minRoom: 14, maxRoom: 70,
    biomes: ['corridor', 'gallery', 'guest'],
  },
  behemoth: {
    warningTime: 3.4, speed: 0.85, damage: 60, killRange: 1.7, seeRange: 12,
    cooldown: 14, spawnChance: 0.22, minRoom: 55, biomes: ['corridor', 'maintenance'],
  },
  redactor: {
    warningTime: 0, speed: 0, damage: 35, killRange: 0, seeRange: 0,
    cooldown: 9, spawnChance: 0.28, minRoom: 21,
  },
  echoskin: {
    warningTime: 2.4, speed: 3.4, damage: 40, killRange: 1.3, seeRange: 0,
    cooldown: 8, spawnChance: 0.38, minRoom: 63,
  },
  maelstrom: {
    warningTime: 4.2, speed: 16, damage: 100, killRange: 1.6, seeRange: 12,
    cooldown: 14, spawnChance: 0.3, minRoom: 55,
  },
  pursuer: {
    warningTime: 1.2, speed: 6.1, damage: 100, killRange: 1.4, seeRange: 30,
    cooldown: 999, spawnChance: 0, minRoom: 30,
  },
  curator: {
    warningTime: 0, speed: 3.6, damage: 100, killRange: 1.5, seeRange: 0,
    cooldown: 999, spawnChance: 0.22, minRoom: 56, biomes: ['records', 'gallery', 'unlit'],
  },
  hollow: {
    warningTime: 0, speed: 0, damage: 55, killRange: 0.8, seeRange: 0,
    cooldown: 4, spawnChance: 0.3, minRoom: 31,
  },
  redline: {
    warningTime: 2.8, speed: 26, damage: 100, killRange: 1.6, seeRange: 9,
    cooldown: 7, spawnChance: 0.5, minRoom: 0,
  },
  stillframe: {
    warningTime: 0.9, speed: 0, damage: 60, killRange: 0, seeRange: 0,
    cooldown: 6, spawnChance: 0.4, minRoom: 0,
  },
  returner: {
    warningTime: 3.0, speed: 14, damage: 100, killRange: 1.6, seeRange: 10,
    cooldown: 8, spawnChance: 0.4, minRoom: 10,
  },
  margin: {
    warningTime: 0.4, speed: 2.6, damage: 50, killRange: 1.2, seeRange: 0,
    cooldown: 6, spawnChance: 0.4, minRoom: 15,
  },
  editor: {
    warningTime: 1.0, speed: 5.6, damage: 100, killRange: 1.5, seeRange: 30,
    cooldown: 999, spawnChance: 0, minRoom: 100,
  },
  grafter: {
    warningTime: 1.2, speed: 1.8, damage: 100, killRange: 1.35, seeRange: 9,
    cooldown: 14, spawnChance: 0.5, minRoom: 22,
  },
  swamper: {
    warningTime: 0, speed: 3.6, damage: 25, killRange: 0.9, seeRange: 0,
    cooldown: 10, spawnChance: 0.85, minRoom: 1,
  },
  hauler: {
    warningTime: 0, speed: 0.85, damage: 25, killRange: 1.4, seeRange: 0,
    cooldown: 26, spawnChance: 0.5, minRoom: 1,
  },
  laundress: {
    warningTime: 0, speed: 1.6, damage: 15, killRange: 1.5, seeRange: 0,
    cooldown: 30, spawnChance: 0.55, minRoom: 1,
  },
  auditor: {
    warningTime: 0, speed: 0.75, damage: 10, killRange: 1.3, seeRange: 0,
    cooldown: 22, spawnChance: 0.45, minRoom: 1,
  },
  filer: {
    warningTime: 0, speed: 0.7, damage: 0, killRange: 0, seeRange: 0,
    cooldown: 26, spawnChance: 0.4, minRoom: 1,
  },
  detective: {
    warningTime: 0, speed: 0.8, damage: 0, killRange: 0, seeRange: 0,
    cooldown: 20, spawnChance: 0.35, minRoom: 18,
  },
  husk: {
    warningTime: 0.8, speed: 4.0, damage: 100, killRange: 1.35, seeRange: 9,
    cooldown: 16, spawnChance: 0.38, minRoom: 34,
  },
  bellman: {
    warningTime: 1.5, speed: 2.1, damage: 100, killRange: 1.05, seeRange: 0,
    cooldown: 9, spawnChance: 0.28, minRoom: 16, maxRoom: 74,
    biomes: ['corridor', 'guest', 'records', 'gallery', 'maintenance', 'unlit'],
  },
  porter: {
    warningTime: 0.8, speed: 0, damage: 60, killRange: 0, seeRange: 9,
    cooldown: 8, spawnChance: 0.3, minRoom: 20, maxRoom: 74,
    biomes: ['corridor', 'guest', 'records', 'gallery', 'maintenance', 'unlit'],
  },
  hazard: {
    warningTime: 0, speed: 0, damage: 20, killRange: 0.7, seeRange: 0,
    cooldown: 0, spawnChance: 0, minRoom: 0,
  },
  orrery: {
    warningTime: 0, speed: 0, damage: 35, killRange: 0.8, seeRange: 0,
    cooldown: 0, spawnChance: 0, minRoom: 0,
  },
  collector: {
    warningTime: 1.6, speed: 2.2, damage: 0, killRange: 0, seeRange: 8,
    cooldown: 14, spawnChance: 0.32, minRoom: 18,
  },
  singer: {
    warningTime: 0, speed: 2.4, damage: 0, killRange: 0, seeRange: 12,
    cooldown: 18, spawnChance: 0.3, minRoom: 22,
  },
};

export interface DifficultyMod {
  spawnChanceMul: number;
  warningTimeMul: number;
  panicSafeMul: number;
  resourceMul: number;
  captionAssist: boolean;
}

export const DIFFICULTY: Record<Difficulty, DifficultyMod> = {
  learning: { spawnChanceMul: 0.55, warningTimeMul: 1.5, panicSafeMul: 1.5, resourceMul: 1.4, captionAssist: true },
  standard: { spawnChanceMul: STD, warningTimeMul: STD, panicSafeMul: STD, resourceMul: STD, captionAssist: false },
  hard:     { spawnChanceMul: 1.35, warningTimeMul: 0.78, panicSafeMul: 0.75, resourceMul: 0.7, captionAssist: false },
  qa:       { spawnChanceMul: 1.0, warningTimeMul: 1.0, panicSafeMul: 1.0, resourceMul: 1.0, captionAssist: true },
};

export const DEFAULT_KEYBINDS: Record<string, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  interact: 'KeyE',
  useItem: 'KeyF',
  toss: 'KeyT',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3',
  slot4: 'Digit4',
};

export function defaultSettings(): SettingsData {
  return {
    version: 2,
    masterVolume: 0.9,
    musicVolume: 0.7,
    ambienceVolume: 0.8,
    effectsVolume: 0.9,
    uiVolume: 0.8,
    sensitivity: 1.0,
    invertY: false,
    fov: 75,
    toggleCrouch: false,
    toggleSprint: false,
    headBob: true,
    reducedMotion: false,
    reducedFlashes: false,
    captions: false,
    captionSize: 1,
    highContrast: false,
    hintFrequency: 'standard',
    minigameAssist: 0,
    quality: 'medium',
    adaptiveQuality: true,
    keybinds: { ...DEFAULT_KEYBINDS },
    reducePanicFx: false,
  };
}

export const QUALITY = {
  low: { pixelRatioCap: 1.0, shadowMap: false, fogDensity: 0.05, maxLights: 2, particleMul: 0.4 },
  medium: { pixelRatioCap: 1.5, shadowMap: false, fogDensity: 0.04, maxLights: 3, particleMul: 0.7 },
  high: { pixelRatioCap: 2.0, shadowMap: true, fogDensity: 0.035, maxLights: 4, particleMul: 1.0 },
} as const;

/** Templates where entities do not intrude — resting rooms on the route. */
export const SAFE_ROOM_TEMPLATES = new Set(['ms-clinic', 'ms-custodian', 'ms-index-ante', 'ms-final-ante', 'ms-decompress']);

/** Entities that must never be scheduled in milestone or safe rooms. */
export const FORBIDDEN_IN_MILESTONE: EntityId[] = [
  'sweep', 'reprise', 'witness', 'whisper', 'inkling', 'redactor',
  'echoskin', 'maelstrom', 'hollow', 'bellman', 'porter', 'warden', 'groundswell', 'inspector', 'commissionaire',
];

/** Entities incompatible to overlap in one room-window. */
export const INCOMPATIBLE: [EntityId, EntityId][] = [
  ['whisper', 'inkling'],     // taught separately; never co-scheduled
  ['bellman', 'sweep'],       // trail-stalker vs sprint-pressure — competing pressure
  ['bellman', 'reprise'],
  ['witness', 'maelstrom'],   // camera pull vs precision stabilization
  ['stillframe', 'pursuer'],  // freeze input vs chase — unfair
  ['stillframe', 'maelstrom'],
  ['stillframe', 'returner'],
  ['stillframe', 'redline'],
  ['margin', 'stillframe'],
  ['redline', 'returner'],
  ['warden', 'sweep'],        // patrol sightlines vs sprint-pressure — competing corridor control
  ['warden', 'reprise'],
];

export const ITEM_DEFS: Record<string, { name: string; desc: string; maxCharges: number; slotItem: boolean }> = {
  handLamp: { name: 'Hand Lamp', desc: 'A reliable beam. Watch the battery.', maxCharges: 100, slotItem: true },
  pulseLamp: { name: 'Pulse Lamp', desc: 'Crank to charge. It hums — things can hear it.', maxCharges: 100, slotItem: true },
  sparkFlash: { name: 'Spark Flash', desc: 'One bright reprieve. Loud.', maxCharges: 1, slotItem: true },
  tonic: { name: 'Tonic', desc: 'Breath easier. Run longer.', maxCharges: 1, slotItem: true },
  bandage: { name: 'Bandage', desc: 'Bind what the building opened.', maxCharges: 1, slotItem: true },
  latchpick: { name: 'Latchpick', desc: 'Opens ordinary locks. Not seals.', maxCharges: 3, slotItem: true },
  feltWrap: { name: 'Felt Wrap', desc: 'Quiet steps for a while.', maxCharges: 1, slotItem: true },
  resonanceKey: { name: 'Resonance Key', desc: 'It vibrates near sealed maintenance doors.', maxCharges: 1, slotItem: true },
  chalkSpool: { name: 'Chalk Spool', desc: 'Mark the thresholds you have taken.', maxCharges: 5, slotItem: true },
  wardSeal: { name: 'Ward Seal', desc: 'A paper band that refuses one passing thing. Once.', maxCharges: 1, slotItem: true },
  palimpsest: { name: 'Palimpsest', desc: 'The overwritten page. One true line shows through.', maxCharges: 1, slotItem: true },
  doorKey: { name: 'Brass Key', desc: 'Numbered for a door in this wing.', maxCharges: 1, slotItem: true },
  windAlarm: { name: 'Wind-up Alarm', desc: 'Wind it, set it down, walk away. It rings where you are not.', maxCharges: 1, slotItem: true },
  doorChock: { name: 'Door Chock', desc: 'A rubber wedge. Set it under a shut door — it holds until you take it back, or something worries it loose.', maxCharges: 2, slotItem: true },
  wireCoil: { name: 'Wire Coil', desc: 'A snare\'s worth of wire, coiled. Lay it where the living walk — it trips whoever steps on it.', maxCharges: 4, slotItem: true },
  springPart: { name: 'Spring Plate', desc: 'A trap\'s works, pried whole. Crouch and set it — it bites whichever foot finds it first.', maxCharges: 2, slotItem: true },
  steamValve: { name: 'Brass Valve', desc: 'A vent\'s throat, threaded whole. Refit it on a stripped line — the blast answers whoever passes.', maxCharges: 2, slotItem: true },
  fanBelt: { name: 'Drive Belt', desc: 'A wheel\'s muscle, walked off the rim whole. Fit it on a stripped wheel — the blades answer whoever stands under them.', maxCharges: 2, slotItem: true },
};

// Fiction name shown on the death screen for each kill source.
// Cover every schedulable entity plus environmental sources.
export const DEATH_NAMES: Record<string, string> = {
  sweep: 'the Sweep', reprise: 'the Reprise', warden: 'the Warden',
  groundswell: 'the Groundswell', witness: 'the Witness', whisper: 'the Whisper',
  inkling: 'the Inkling', lurker: 'the Lurker', inspector: 'the Inspector',
  commissionaire: 'the Commissionaire', behemoth: 'the Behemoth',
  redactor: 'the Redactor', echoskin: 'the EchoSkin', maelstrom: 'the Maelstrom',
  pursuer: 'the Pursuer', curator: 'the Curator', hollow: 'the Hollow',
  redline: 'the Redline', stillframe: 'the Stillframe', returner: 'the Returner',
  margin: 'the Margin', editor: 'the Editor', grafter: 'the Grafter',
  swamper: 'the Swamper', hauler: 'the Hauler', laundress: 'the Laundress',
  auditor: 'the Auditor', detective: 'the Detective', husk: 'the Husk',
  filer: 'the Filer',
  bellman: 'the Bellman', porter: 'the Porter', hazard: 'the house',
  orrery: 'the Orrery', collector: 'the Collector', singer: 'the Singer',
};

// Curated advice line per kill source; the death screen prefers this over the
// caller-passed hint so the read is uniform no matter where the kill lands.
export const DEATH_HINTS: Record<string, string> = {
  sweep: 'Its cue is the pressure wave and the flicker. Conceal or break line of sight.',
  reprise: 'It returns — stay put through every pass.',
  warden: 'Its whistle calls the floor — break its line of sight and it loses the scent.',
  groundswell: 'The floor lifts in waves — read the dust and sidestep the hump.',
  witness: 'Look away. The pull is resistible; the regard is not.',
  whisper: 'In darkness, turn toward the voice until you see it.',
  inkling: 'It hates sustained light. Angle the beam away.',
  lurker: 'It stalks in the dark — hold your light on it to drive it off.',
  inspector: 'It tests every lid — bail out before it reaches your spot, or hold it shut through the rattle.',
  commissionaire: 'It holds the doors — cross on the blind arc, or bait it off its post and run.',
  behemoth: 'It is the house rolling — never meet it in the corridor.',
  redactor: 'Check the number, the seam, the hum. Real exits are even-tempered.',
  echoskin: 'It borrows your steps. Face it to fold it.',
  maelstrom: 'It remembers where you hide. Reach a physical safe spot.',
  pursuer: 'Sprint the sequence. Vaults and gates are the route.',
  curator: 'It hunts sound. Crouch, go slow, and distract it.',
  hollow: 'Warm cabinets lie. Check for the residue and the off-hum.',
  redline: 'Printer cascade and red lamps — conceal before the pass.',
  stillframe: 'Release all input when the shutter sounds.',
  returner: 'It comes from ahead. Retreat to known cover.',
  margin: 'Glance to freeze it; never hold it in view.',
  editor: 'Red-lined floor is already gone. Keep moving.',
  grafter: 'It is only rubble until it stands. Give it the berth it cannot give you.',
  swamper: 'It finds you by the water you move — crouch-wade, or open the drain first.',
  hauler: 'Crash noise by the haul line is the mistake — pick it quiet, or stay loud and gone.',
  laundress: 'She keeps her basin — pull her off the drain with a thrown sound before the crank.',
  auditor: 'It collects in kind — settle the ledger at the desk, or carry clean hands.',
  detective: 'He settles the book — pay the claim, or keep your hands off the shelves.',
  filer: 'It never strikes — it files. Square the index at her station, or ask fewer questions of the under.',
  husk: 'It sleeps. Keep the beam off it, keep your distance, go quiet.',
  bellman: 'It walks your steps — break your own trail and it has nothing to follow.',
  porter: 'It waits above the lintel — look up before crossing.',
  orrery: 'Beams read the low floor. Crouch and time the gaps.',
  collector: 'Its toll is negotiable — pay, or walk the long way.',
  singer: 'Its song is a leash — keep moving while it holds a note.',
  hazard: 'Watch the floor — the building sets snares.',
};

export const SHOP_PRICES: Record<string, number> = {
  handLamp: 45, sparkFlash: 60, tonic: 30, bandage: 25,
  latchpick: 50, feltWrap: 40, chalkSpool: 20, wardSeal: 90, windAlarm: 55,
  doorChock: 12,
};
