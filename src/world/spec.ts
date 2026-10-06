/**
 * Room template spec — data describing a room before it becomes geometry.
 * Templates are authored in local space (entry on -Z wall, exit configurable),
 * then placed into world space by the generator (rotation + translation).
 */
import type { Biome, EntityId, HidingKind, SocketKind } from '../game/types';

export type Wall = 'n' | 'e' | 'w' | 's'; // s = entry wall (-Z), n = +Z

export interface Port {
  /** Position along the wall (meters from wall's left edge when viewed from inside looking at the wall). */
  offset: number;
  wall: Wall;
  width: number;
}

export type PropKind =
  // furniture / hiding
  | 'cabinet' | 'desk' | 'bed' | 'table' | 'chair' | 'crate' | 'shelf'
  | 'filing' | 'drawerUnit' | 'vent' | 'sofa' | 'locker'
  // dressing
  | 'lamp' | 'wallSconce' | 'painting' | 'mirror' | 'window' | 'rug'
  | 'paperStack' | 'pipe' | 'rubble' | 'plant' | 'curtain' | 'sign'
  | 'pillar' | 'railing' | 'stairs' | 'partition' | 'ceilingLamp'
  | 'chandelier' | 'bookshelf' | 'counter' | 'till' | 'trolley'
  | 'clock' | 'wallClock' | 'statue' | 'bust' | 'vase' | 'candle' | 'stove'
  | 'machineBox' | 'hangingPanels' | 'deskLamp' | 'keypad'
  | 'monitor' | 'serverRack' | 'paperScatter' | 'glassWall'
  | 'board' | 'bench' | 'wheelchair' | 'suitcase' | 'bin'
  | 'generator' | 'weldingCart' | 'planter' | 'books' | 'papers'
  | 'carton' | 'payphone' | 'rack'
  | 'archway' | 'colonnade' | 'fireplace' | 'windowArch' | 'hatch'
  | 'medallion' | 'vault' | 'scissorgate' | 'balustrade'
  | 'boneArch' | 'toppledColumn' | 'wallNiche' | 'stairGate'
  | 'transomWindow' | 'bookCart' | 'radiatorFin' | 'dumbwaiter' | 'ironGrate'
  | 'keyRack' | 'counterBell' | 'luggageRack'
  | 'hallTree' | 'umbrellaStand' | 'washStand' | 'mailCart' | 'podiumLectern'
  | 'boilerDrum' | 'pipeManifold' | 'stackShelf'
  | 'breakerPanel' | 'wallVent' | 'portcullis'
  | 'conduitRun' | 'sumpPump' | 'hangingCable' | 'ductRun'
  | 'plinth' | 'displayCase' | 'ropeBarrier' | 'exhibitLabel' | 'libraryLadder'
  | 'cageLocker' | 'bellCart' | 'teaTrolley' | 'bedBench' | 'radiatorTall'
  | 'linenHamper' | 'basinSink' | 'pegRail' | 'towelRail' | 'ceilingHook'
  | 'wardrobe' | 'dresser' | 'nightstand'
  | 'barrel' | 'wineBarrel' | 'pipeManifold' | 'extinguisher' | 'television'
  | 'wetFloor' | 'wallClock2' | 'mantelClock' | 'stool' | 'ladder'
  | 'bucket' | 'alarmClock' | 'multimeter' | 'wrench' | 'securityCam'
  | 'toolChest' | 'propaneTank' | 'medBox' | 'lantern' | 'flashlight'
  | 'plasticCrate' | 'gasMask' | 'armchair' | 'milCrate' | 'statue' | 'marbleBust'
  | 'morgueDrawer' | 'gurney' | 'washer' | 'boilerTank' | 'cubiclePod'
  | 'powerBox' | 'utilityBox' | 'fluoroStrip' | 'cageLight' | 'securityLight'
  | 'pipeLamp' | 'wallHose' | 'toolCart' | 'jerrycan' | 'toolbox'
  | 'lpgTank' | 'plasticChair' | 'microwave' | 'diningTable' | 'diningChair'
  | 'benchVice'
  | 'fireAlarm' | 'cableTray' | 'chainFence' | 'shutterDoor' | 'roadBarrier'
  | 'plasticCrate2' | 'plasticCrate3' | 'schoolChair' | 'schoolDesk'
  | 'ceilingLamp2' | 'cagedSconce' | 'manhole' | 'hydrant' | 'chainBulb'
  | 'woodLadder' | 'oilTin' | 'tirePump' | 'vintageCabinet' | 'modernCabinet' | 'projector'
  | 'stove' | 'bedOld' | 'masonryHeater' | 'boombox' | 'cassettePlayer'
  | 'laptop' | 'dartboard' | 'airconUnit' | 'broom' | 'dustpan'
  | 'cementBag' | 'compostBags' | 'nightstand' | 'screenPanels' | 'foldingStool'
  | 'drillPress' | 'lanternChandelier' | 'megaphone' | 'ammoBox' | 'deadTree'
  | 'baseballBat' | 'jerrycanP' | 'sprayCans' | 'rustCan'
  | 'foodCans' | 'cleanerBottle' | 'bleachBottle' | 'ceilingFan'
  | 'gothicCommode' | 'galleryStatue' | 'deadBranch' | 'crowbar' | 'boltCutters'
  | 'watcherFigure'
  | 'deadTenant'
  | 'coffin'
  | 'dollCluster'
  | 'hallFigure'
  | 'hauntedPortrait'
  | 'pianoUpright'
  | 'rubblePile'
  | 'rootGrowth'
  | 'weedCluster'
  | 'bunsenBurner' | 'goblets' | 'rifle'
  // sprint 21 — extraction batch 3
  | 'daybed' | 'ottoman' | 'coffeeTable' | 'sideTable' | 'horseStatue'
  | 'firePit' | 'spinningWheel' | 'projScreen' | 'streetLamp' | 'instrPanel'
  | 'teaSet' | 'wineBottles' | 'jug' | 'enamelPot' | 'woodenBowl' | 'pillows'
  | 'basket' | 'radio' | 'camera' | 'binoculars' | 'magnifier' | 'lightbulb'
  | 'oilCan' | 'cigs' | 'lighter' | 'mousetrap' | 'sledge' | 'handsaw'
  | 'hammer' | 'screwdrivers' | 'handDrill' | 'wateringCan' | 'seedTray'
  | 'ductCirc' | 'ductRect' | 'indPipes' | 'gutter' | 'quiverTree'
  | 'treeStump' | 'frameStand' | 'rat' | 'axe' | 'warHammer' | 'sword'
  | 'register' | 'console' | 'coffeeCart' | 'ukulele' | 'roundTable'
  | 'streetSeat' | 'chest' | 'vidCamera' | 'barStool' | 'picnicTable'
  | 'stone' | 'moss' | 'shelfWood' | 'crate2'
  | 'castleDoor' | 'ironGate' | 'gateLatch'
  // sprint 24 — kitchen/food + electronics clutter
  | 'kettle' | 'pan' | 'cuttingBoard' | 'carvedPlate' | 'apple' | 'pears'
  | 'cheeseBox' | 'football' | 'circuitBoard' | 'propaneTorch' | 'searchlight'
  // sprint 28 — tools, trophies, instruments, clutter
  | 'powerDrill' | 'pocketWatch' | 'wristWatch' | 'spectacles' | 'compass'
  | 'trophyHead' | 'ornament' | 'chemistrySet' | 'microscope' | 'chessSet'
  | 'boardGame' | 'machete' | 'dagger' | 'mace' | 'katana' | 'kiteShield'
  | 'brassPot' | 'handTruck' | 'pliers' | 'trowel' | 'handPlane' | 'tapeMeasure'
  | 'metalDetector' | 'plunger' | 'rubberBoots' | 'gallonJug' | 'plasticBin'
  | 'thermos' | 'postcards' | 'stationery' | 'stapler' | 'rubberDuck'
  | 'spade' | 'wheelRim' | 'tyre' | 'compressor' | 'crutches' | 'rations'
  | 'medicalTape' | 'pastry' | 'standingFrame'
  // sprint 35 — batch 6
  | 'sportsBall' | 'gamepad' | 'gameConsole' | 'blowtorch' | 'cigaretteCase'
  | 'pickaxe' | 'compostBag' | 'rollerShutter' | 'shell' | 'fishingKnife'
  | 'woodenSpoon' | 'onion' | 'sweetPotato' | 'lemon' | 'gardenGloves'
  | 'cardboardBox'
  // sprint 43 — batch 7: exteriors, food, curios, boulders
  | 'shipModel' | 'cannon' | 'coveredCar' | 'overheadCrane' | 'fireEscape'
  | 'pistol' | 'stickGrenade' | 'lifebuoy'
  | 'fishHat' | 'cakeSlice' | 'fruit' | 'boulder' | 'barkDebris' | 'treeStump'
  // milestone / machinery
  | 'pylon' | 'catalogueDesk' | 'sealConsole' | 'relay' | 'liftDoors'
  | 'routingBoard' | 'orreryRig' | 'catalogTrack' | 'rollingLadder'
  | 'merchantCounter' | 'speakingTube' | 'printerRow' | 'alarm'
  | 'trench' | 'freightLift' | 'stairLanding' | 'liftShaft'
  // sprint 213 — service-wing mill batch
  | 'kitchenRange' | 'sculleryRack' | 'potRack' | 'pantryShelf'
  | 'stackedLinen' | 'upholsteredHeadboard' | 'coalScuttle'
  // sprint 215 — dressing batch: window/dining/service detail
  | 'curtainSwag' | 'drapePanel' | 'linenPress' | 'candelabra'
  | 'valveWheel' | 'dumbWaiterDoor' | 'apothecaryCabinet' | 'meatHook'
  | 'wineRack' | 'grateDrain'
  // sprint 216 — chapel / dining dressing batch
  | 'platedRoast' | 'platedPie' | 'ceilingRose' | 'pewRow' | 'chapelAltar'
  // hazards
  | 'snare' | 'puddle' | 'steamVent' | 'fan' | 'brokenFloor'
  // underscript
  | 'cubicle' | 'breakTable' | 'recordsCage' | 'printer' | 'fluoroTube'
  | 'exitSign' | 'typewriter' | 'waterCooler';

export interface PropSpec {
  kind: PropKind;
  x: number;      // local coords
  z: number;
  y?: number;     // base elevation (default 0)
  yaw?: number;   // radians
  scale?: number;
  variant?: number;
  meta?: Record<string, number | string | boolean>;
}

export interface LocalSocket {
  kind: SocketKind;
  x: number;
  z: number;
  y?: number;
  yaw?: number;
  meta?: Record<string, number | string | boolean>;
}

export interface LocalHiding {
  kind: HidingKind;
  x: number;
  z: number;
  yaw: number;
  propKind: PropKind; // cabinet | vent | desk | bed | — alcove uses 'partition'
}

export interface LocalNav {
  id: string;
  x: number;
  z: number;
  y?: number;
  links: string[];
  tags: string[];
}

export interface LocalZone {
  // LOS-safe alcove; y range assumed floor..2m
  x: number; z: number; w: number; d: number;
}

export interface LocalCollider {
  x: number; z: number; y?: number; w: number; d: number; h: number;
  /** If true, only blocks entity LOS, not movement (e.g. tall shelf mid-room). */
  losOnly?: boolean;
  /** If true, blocks movement but not entity LOS (e.g. glass partitions). */
  movementOnly?: boolean;
  /** Floor-height steps/stairs the player can climb. */
  walkable?: boolean;
}

export interface LightSpec {
  x: number; y: number; z: number;
  color: number;
  intensity: number;
  range: number;
  group: 'main' | 'dim' | 'accent' | 'warning';
  /** Can entities/affects flicker or break it. */
  breakable?: boolean;
}

export interface RoomSpec {
  templateId: string;
  version: number;
  biome: Biome;
  width: number;
  depth: number;
  height: number;
  entry: Port;          // always on 's' wall (local -Z)
  exits: Port[];        // one or more (main route uses [0])
  props: PropSpec[];
  sockets: LocalSocket[];
  hiding: LocalHiding[];
  nav: LocalNav[];
  safeZones: LocalZone[];
  colliders: LocalCollider[]; // extra interior colliders (walls are auto)
  lights: LightSpec[];
  floorMaterial: 'wood' | 'carpet' | 'stone' | 'metal' | 'concrete' | 'paper';
  /** Override wall surface; biome default applies when unset. */
  wallMaterial?: 'wallpaper' | 'concrete' | 'tile' | 'woodPanel' | 'travertine' | 'corrugated' | 'brick';
  tags: string[];
  /** Entities forbidden here regardless of eligibility. */
  forbidEntities?: EntityId[];
  /** Only these may appear. */
  allowOnlyEntities?: EntityId[];
  darkChance: number;   // probability this room rolls dark
  weight: number;
  perfCost: number;     // 1..5
  minRoom: number;      // earliest route index eligible
  /** Special handling key for authored/milestone behavior. */
  special?: string;
}

export interface RoomTemplate {
  id: string;
  /** Deterministic — receives room-local Rng so variants are seeded. */
  build(rng: import('../engine/rng').Rng): RoomSpec;
}

/** Convenience for templates: a box wall segment list → colliders. */
export function wallColliders(
  width: number, depth: number, height: number,
  entry: Port, exits: Port[], thickness = 0.24,
): LocalCollider[] {
  const c: LocalCollider[] = [];
  const hw = width / 2;
  const hd = depth / 2;
  const doorW = (p: Port) => p.width;
  // South wall (entry, local -Z): two segments flanking the entry port.
  const e0 = entry.offset - doorW(entry) / 2;
  const e1 = entry.offset + doorW(entry) / 2;
  c.push({ x: (-hw + e0) / 2, z: -hd, w: e0 + hw, d: thickness, h: height });
  c.push({ x: (e1 + hw) / 2, z: -hd, w: hw - e1, d: thickness, h: height });
  // lintel above entry
  c.push({ x: entry.offset, z: -hd, y: 2.15, w: doorW(entry), d: thickness, h: height - 2.15 });
  for (const p of exits) {
    const pw = doorW(p) / 2;
    if (p.wall === 'n') {
      const w0 = p.offset - pw;
      const w1 = p.offset + pw;
      c.push({ x: (-hw + w0) / 2, z: hd, w: w0 + hw, d: thickness, h: height });
      c.push({ x: (w1 + hw) / 2, z: hd, w: hw - w1, d: thickness, h: height });
      c.push({ x: p.offset, z: hd, y: 2.15, w: doorW(p), d: thickness, h: height - 2.15 });
    } else if (p.wall === 'w') {
      const w0 = p.offset - pw;
      const w1 = p.offset + pw;
      c.push({ x: -hw, z: (-hd + w0) / 2, w: thickness, d: w0 + hd, h: height });
      c.push({ x: -hw, z: (w1 + hd) / 2, w: thickness, d: hd - w1, h: height });
      c.push({ x: -hw, z: p.offset, y: 2.15, w: thickness, d: doorW(p), h: height - 2.15 });
    } else if (p.wall === 'e') {
      const w0 = p.offset - pw;
      const w1 = p.offset + pw;
      c.push({ x: hw, z: (-hd + w0) / 2, w: thickness, d: w0 + hd, h: height });
      c.push({ x: hw, z: (w1 + hd) / 2, w: thickness, d: hd - w1, h: height });
      c.push({ x: hw, z: p.offset, y: 2.15, w: thickness, d: doorW(p), h: height - 2.15 });
    }
  }
  // Side walls (full) where no exit was declared.
  if (!exits.some((e) => e.wall === 'w')) c.push({ x: -hw, z: 0, w: thickness, d: depth, h: height });
  if (!exits.some((e) => e.wall === 'e')) c.push({ x: hw, z: 0, w: thickness, d: depth, h: height });
  if (!exits.some((e) => e.wall === 'n')) c.push({ x: 0, z: hd, w: width, d: thickness, h: height });
  return c;
}

/** Port position on the room boundary in local coords (door center). */
export function portLocalPos(port: Port, width: number, depth: number): { x: number; z: number } {
  switch (port.wall) {
    case 's': return { x: port.offset, z: -depth / 2 };
    case 'n': return { x: port.offset, z: depth / 2 };
    case 'e': return { x: width / 2, z: port.offset };
    case 'w': return { x: -width / 2, z: port.offset };
  }
}

/** Outward-facing direction of a port wall (local space). */
export function portOutwardDir(port: Port): { x: number; z: number } {
  switch (port.wall) {
    case 's': return { x: 0, z: -1 };
    case 'n': return { x: 0, z: 1 };
    case 'e': return { x: 1, z: 0 };
    case 'w': return { x: -1, z: 0 };
  }
}

/** True when a room-local point sits inside a port's approach lane —
 * the strip from just outside the door plane to ~2m into the room,
 * as wide as the leaf plus clearance. Kept prop-free so furniture
 * can't pinch the doorway a player must walk through. */
export function inDoorLane(spec: Pick<RoomSpec, 'width' | 'depth' | 'entry' | 'exits'>, x: number, z: number, r = 0.55): boolean {
  return [spec.entry, ...spec.exits].some((port) => {
    const lp = portLocalPos(port, spec.width, spec.depth);
    const dir = portOutwardDir(port);
    const a = -((x - lp.x) * dir.x + (z - lp.z) * dir.z);       // depth into the room
    const b = Math.abs((x - lp.x) * -dir.z + (z - lp.z) * dir.x); // lateral offset
    return a > -0.4 - r && a < 2.0 + r && b < port.width / 2 + 0.6 + r;
  });
}

/** True when an axis-aligned collider footprint (center + half extents,
 * room-local) physically overlaps a port's approach strip — the doorway
 * apron a prop can't enter without pinching it. This is the builder's
 * cull rule; the wider inDoorLane margin stays for placement-time
 * avoidance, where props can still be relocated instead of dropped. */
export function footprintInDoorLane(
  spec: Pick<RoomSpec, 'width' | 'depth' | 'entry' | 'exits'>,
  cx: number, cz: number, hx: number, hz: number,
): boolean {
  return [spec.entry, ...spec.exits].some((port) => {
    const lp = portLocalPos(port, spec.width, spec.depth);
    const dir = portOutwardDir(port);
    const a = -((cx - lp.x) * dir.x + (cz - lp.z) * dir.z);
    const b = Math.abs((cx - lp.x) * -dir.z + (cz - lp.z) * dir.x);
    const aH = hx * Math.abs(dir.x) + hz * Math.abs(dir.z);
    const bH = hx * Math.abs(dir.z) + hz * Math.abs(dir.x);
    return a + aH > -0.4 && a - aH < 1.3 && b - bH < port.width / 2 + 0.3;
  });
}

/** Drop filler props and hiding spots whose centers land inside a door
 * lane. Authored fixed props are skipped — the builder's footprint rule
 * culls them only when the collider truly overlaps the doorway apron. */
export function clearDoorLanes(spec: RoomSpec): void {
  spec.props = spec.props.filter((p) => (p.y ?? 0) > 1.9 || !p.meta?.wall || !inDoorLane(spec, p.x, p.z));
  spec.hiding = spec.hiding.filter((h) => !inDoorLane(spec, h.x, h.z));
}

/** Standard nav spine: entry → center → exit for simple rooms. */
export function spineNav(width: number, depth: number, entry: Port, exit: Port): LocalNav[] {
  const e = portLocalPos(exit, width, depth);
  const inward = portOutwardDir(exit);
  const exitX = e.x - inward.x * 0.9;
  const exitZ = e.z - inward.z * 0.9;
  return [
    { id: 'entry', x: entry.offset, z: -depth / 2 + 0.9, links: ['mid'], tags: ['door', 'entry'] },
    { id: 'mid', x: (entry.offset + exitX) / 2, z: (-depth / 2 + 0.9 + exitZ) / 2, links: ['entry', 'exit'], tags: ['center'] },
    { id: 'exit', x: exitX, z: exitZ, links: ['mid'], tags: ['door', 'exit'] },
  ];
}
