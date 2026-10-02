/**
 * Vendored CC0 GLTF hero props (public/assets/models/<name>/model.gltf).
 * Models preload in the background at game boot; props that have a mapped,
 * already-loaded model get the real mesh, otherwise the procedural builder
 * is used so rooms never block on the network.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface ModelSpec {
  dir: string;
  /** Target height in meters — the model is uniformly scaled to this. */
  height: number;
  /** Collider footprint (w, h, d) — shared with the procedural prop. */
  collider: [number, number, number];
  /** 'floor' anchors the model's base at y=0; 'center' anchors its center (wall/hanging mounts). */
  anchor?: 'floor' | 'center';
  /** Alternative models picked per-prop via the room's dressing rng. */
  variants?: ModelSpec[];
}

/** Prop kind → vendored model + display size. */
export const MODEL_FOR: Partial<Record<string, ModelSpec>> = {
  cabinet: { dir: 'GothicCabinet_01', height: 2.1, collider: [1.15, 2.1, 0.7] },
  bed: { dir: 'GothicBed_01', height: 1.1, collider: [1.7, 1.1, 2.2] },
  chair: {
    dir: 'Rockingchair_01', height: 1.0, collider: [0.65, 1.0, 0.75],
    variants: [{ dir: 'WoodenChair_01', height: 0.95, collider: [0.55, 0.95, 0.6] }],
  },
  table: { dir: 'WoodenTable_01', height: 0.8, collider: [1.3, 0.8, 0.85] },
  painting: {
    dir: 'hanging_picture_frame_01', height: 0.9, collider: [0, 0, 0], anchor: 'center',
    variants: [{ dir: 'fancy_picture_frame_01', height: 0.9, collider: [0, 0, 0], anchor: 'center' }],
  },
  desk: { dir: 'metal_office_desk', height: 0.8, collider: [2.0, 0.8, 0.95] },
  bookshelf: { dir: 'wooden_bookshelf_worn', height: 2.1, collider: [1.4, 2.1, 0.6] },
  sofa: {
    dir: 'sofa_02', height: 0.75, collider: [1.9, 0.75, 0.9],
    variants: [
      { dir: 'Sofa_01', height: 0.85, collider: [1.9, 0.85, 0.9] },
      { dir: 'sofa_03', height: 0.85, collider: [1.9, 0.85, 0.9] },
    ],
  },
  filing: { dir: 'drawer_cabinet', height: 1.85, collider: [1.15, 1.85, 0.5] },
  locker: { dir: 'steel_frame_shelves_01', height: 2.2, collider: [1.15, 2.2, 0.55] },
  drawerUnit: { dir: 'vintage_wooden_drawer_01', height: 0.7, collider: [0.9, 0.7, 0.5] },
  trolley: { dir: 'industrial_storage_cart', height: 1.1, collider: [1.3, 1.1, 0.9] },
  shelf: { dir: 'steel_frame_shelves_02', height: 2.1, collider: [0.6, 2.1, 0.55] },
  plant: {
    dir: 'potted_plant_01', height: 1.3, collider: [0.6, 1.3, 0.65],
    variants: [{ dir: 'nettle_plant', height: 1.0, collider: [0.5, 1.0, 0.5] }],
  },
  clock: { dir: 'vintage_grandfather_clock_01', height: 2.2, collider: [0.5, 2.2, 0.65] },
  wallClock: { dir: 'vintage_telephone_wall_clock', height: 0.55, collider: [0, 0, 0], anchor: 'center' },
  deskLamp: { dir: 'desk_lamp_arm_01', height: 0.55, collider: [0, 0, 0] },
  wallSconce: {
    dir: 'industrial_wall_sconce', height: 0.4, collider: [0, 0, 0], anchor: 'center',
    variants: [{ dir: 'industrial_wall_lamp', height: 0.45, collider: [0, 0, 0], anchor: 'center' }],
  },
  ceilingLamp: { dir: 'hanging_industrial_lamp', height: 0.9, collider: [0, 0, 0], anchor: 'center' },
  crate: {
    dir: 'wooden_crate_01', height: 0.5, collider: [0.85, 0.5, 0.45],
    variants: [{ dir: 'old_military_crate', height: 0.45, collider: [0.95, 0.45, 0.7] }],
  },
  statue: { dir: 'gothic_statue', height: 1.8, collider: [1.1, 1.8, 1.1] },
  bust: { dir: 'marble_bust_01', height: 0.55, collider: [0.3, 0.55, 0.35] },
  vase: { dir: 'brass_vase_01', height: 0.65, collider: [0, 0, 0] },
  candle: {
    dir: 'brass_candleholders', height: 0.8, collider: [0, 0, 0],
    variants: [{ dir: 'wooden_candlestick', height: 0.5, collider: [0, 0, 0] }],
  },
  mirror: { dir: 'ornate_mirror_01', height: 1.4, collider: [0, 0, 0], anchor: 'center' },
  chandelier: { dir: 'Chandelier_01', height: 1.7, collider: [0, 0, 0], anchor: 'center' },
  lamp: { dir: 'vintage_oil_lamp', height: 0.45, collider: [0, 0, 0] },
  stove: {
    dir: 'barrel_stove', height: 0.9, collider: [0.6, 0.9, 0.6],
    variants: [{ dir: 'electric_stove', height: 0.95, collider: [0.6, 0.9, 0.6] }],
  },
  books: {
    dir: 'book_encyclopedia_set_01', height: 0.28, collider: [0, 0, 0],
    variants: [{ dir: 'binder_notebook', height: 0.18, collider: [0, 0, 0] }],
  },
  papers: {
    dir: 'office_notepads', height: 0.08, collider: [0, 0, 0],
    variants: [{ dir: 'clipboard', height: 0.05, collider: [0, 0, 0] }],
  },
  carton: { dir: 'cardboard_box_01', height: 0.55, collider: [0.6, 0.55, 0.5] },
  bin: {
    dir: 'metal_trash_can', height: 0.6, collider: [0.4, 0.6, 0.4],
    variants: [{ dir: 'trashbag', height: 0.45, collider: [0.5, 0.45, 0.5] }],
  },
  generator: { dir: 'portable_generator', height: 0.85, collider: [0.9, 0.85, 0.6] },
  weldingCart: { dir: 'portable_welding_cart', height: 1.15, collider: [0.8, 1.15, 0.6] },
  rack: { dir: 'worn_metal_rack', height: 2.0, collider: [1.0, 2.0, 0.5] },
  board: { dir: 'standing_chalkboard_01', height: 1.5, collider: [0.9, 1.5, 0.5] },
  wheelchair: { dir: 'wheelchair_01', height: 1.0, collider: [0.65, 1.0, 0.9] },
  suitcase: { dir: 'vintage_suitcase', height: 0.4, collider: [0.7, 0.4, 0.5] },
  bench: { dir: 'painted_wooden_bench', height: 0.9, collider: [1.8, 0.9, 0.6] },
  payphone: { dir: 'korean_public_payphone_01', height: 1.5, collider: [0.6, 1.5, 0.6] },
  planter: { dir: 'planter_box_01', height: 0.55, collider: [1.1, 0.55, 0.4] },
  // Sprint 7 — service/industrial set + clutter
  barrel: {
    dir: 'Barrel_01', height: 0.9, collider: [0.6, 0.9, 0.6],
    variants: [{ dir: 'Barrel_02', height: 0.9, collider: [0.6, 0.9, 0.6] }],
  },
  wineBarrel: { dir: 'wine_barrel_01', height: 0.95, collider: [0.7, 0.95, 0.7] },
  pipeRun: { dir: 'modular_pipes', height: 2.2, collider: [0.4, 2.2, 0.4], anchor: 'center' },
  extinguisher: { dir: 'korean_fire_extinguisher_01', height: 0.55, collider: [0, 0, 0], anchor: 'center' },
  television: { dir: 'Television_01', height: 0.55, collider: [0.75, 0.55, 0.5] },
  wetFloor: { dir: 'WetFloorSign_01', height: 0.6, collider: [0.35, 0.6, 0.35] },
  wallClock2: { dir: 'wall_clock', height: 0.35, collider: [0, 0, 0], anchor: 'center' },
  mantelClock: { dir: 'mantel_clock_01', height: 0.3, collider: [0, 0, 0] },
  stool: { dir: 'metal_stool_01', height: 0.5, collider: [0.4, 0.5, 0.4] },
  ladder: { dir: 'ladder_sectioned_01', height: 2.4, collider: [0.5, 2.4, 0.25] },
  bucket: { dir: 'wooden_bucket_01', height: 0.35, collider: [0.35, 0.35, 0.35] },
  alarmClock: { dir: 'alarm_clock_01', height: 0.16, collider: [0, 0, 0] },
  multimeter: { dir: 'retro_multimeter', height: 0.28, collider: [0, 0, 0] },
  wrench: { dir: 'pipe_wrench', height: 0.3, collider: [0, 0, 0] },
  securityCam: {
    dir: 'security_camera_01', height: 0.35, collider: [0, 0, 0], anchor: 'center',
    variants: [{ dir: 'security_camera_02', height: 0.35, collider: [0, 0, 0], anchor: 'center' }],
  },
  toolChest: { dir: 'metal_tool_chest', height: 0.9, collider: [1.1, 0.9, 0.5] },
  propaneTank: { dir: 'propane_tank', height: 1.3, collider: [0.4, 1.3, 0.4] },
  medBox: { dir: 'medical_box', height: 0.45, collider: [0, 0, 0], anchor: 'center' },
  lantern: { dir: 'Lantern_01', height: 0.4, collider: [0.25, 0.4, 0.25] },
  flashlight: { dir: 'vintage_flashlight', height: 0.2, collider: [0, 0, 0] },
  plasticCrate: { dir: 'plastic_crate_01', height: 0.4, collider: [0.55, 0.4, 0.4] },
  gasMask: { dir: 'old_gas_mask', height: 0.3, collider: [0, 0, 0] },
  armchair: { dir: 'ArmChair_01', height: 0.95, collider: [0.9, 0.95, 0.85] },
  milCrate: { dir: 'wooden_military_crate', height: 0.5, collider: [0.9, 0.5, 0.55] },
  marbleBust: { dir: 'marble_bust_01', height: 0.5, collider: [0.35, 0.5, 0.3] },
  // Sprint 12 — utility/industrial wall-mounts + clutter
  powerBox: { dir: 'power_box_01', height: 0.65, collider: [0, 0, 0], anchor: 'center' },
  utilityBox: { dir: 'utility_box_01', height: 0.75, collider: [0, 0, 0], anchor: 'center' },
  fluoroStrip: { dir: 'mounted_fluorescent_lights', height: 0.22, collider: [0, 0, 0], anchor: 'center' },
  cageLight: { dir: 'caged_hanging_light', height: 0.65, collider: [0, 0, 0], anchor: 'center' },
  securityLight: { dir: 'security_light', height: 0.4, collider: [0, 0, 0], anchor: 'center' },
  pipeLamp: { dir: 'industrial_pipe_lamp', height: 0.55, collider: [0, 0, 0], anchor: 'center' },
  wallHose: { dir: 'garden_hose_wall_mounted_01', height: 0.95, collider: [0, 0, 0], anchor: 'center' },
  toolCart: { dir: 'tool_cart', height: 0.95, collider: [1.05, 0.95, 0.6] },
  jerrycan: { dir: 'metal_jerrycan', height: 0.5, collider: [0.4, 0.5, 0.3] },
  toolbox: { dir: 'metal_toolbox', height: 0.3, collider: [0, 0, 0] },
  lpgTank: { dir: 'small_lpg_tank', height: 0.9, collider: [0.4, 0.9, 0.4] },
  plasticChair: { dir: 'plastic_monobloc_chair_01', height: 0.85, collider: [0.5, 0.85, 0.55] },
  microwave: { dir: 'vintage_microwave', height: 0.4, collider: [0, 0, 0] },
  diningTable: { dir: 'dining_table', height: 0.8, collider: [1.6, 0.8, 1.0] },
  diningChair: { dir: 'dining_chair_02', height: 0.9, collider: [0.55, 0.9, 0.55] },
  benchVice: { dir: 'bench_vice_01', height: 0.35, collider: [0, 0, 0] },
  // Sprint 14 — underscript/industrial batch 2
  fireAlarm: { dir: 'fire_alarm', height: 0.3, collider: [0, 0, 0], anchor: 'center' },
  cableTray: { dir: 'modular_electric_cables', height: 0.4, collider: [0, 0, 0], anchor: 'center' },
  chainFence: { dir: 'modular_chainlink_fence', height: 2.2, collider: [2.4, 2.2, 0.15] },
  shutterDoor: { dir: 'rollershutter_door', height: 2.4, collider: [1.6, 2.4, 0.2] },
  roadBarrier: { dir: 'concrete_road_barrier_02', height: 0.8, collider: [1.6, 0.8, 0.4] },
  plasticCrate2: { dir: 'plastic_crate_02', height: 0.4, collider: [0.55, 0.4, 0.4] },
  plasticCrate3: { dir: 'plastic_crate_03', height: 0.4, collider: [0.55, 0.4, 0.4] },
  schoolChair: { dir: 'SchoolChair_01', height: 0.8, collider: [0.5, 0.8, 0.5] },
  schoolDesk: { dir: 'SchoolDesk_01', height: 0.75, collider: [0.65, 0.75, 0.5] },
  ceilingLamp2: { dir: 'modern_ceiling_lamp_01', height: 0.5, collider: [0, 0, 0], anchor: 'center' },
  cagedSconce: { dir: 'industrial_caged_sconce', height: 0.35, collider: [0, 0, 0], anchor: 'center' },
  manhole: { dir: 'water_manhole_cover', height: 0.06, collider: [0, 0, 0] },
  hydrant: { dir: 'fire_hydrant', height: 0.7, collider: [0.35, 0.7, 0.35] },
  chainBulb: { dir: 'pull_chain_light_socket', height: 0.5, collider: [0, 0, 0], anchor: 'center' },
  woodLadder: { dir: 'wooden_ladder', height: 2.2, collider: [0.5, 2.2, 0.15] },
  oilTin: { dir: 'oil_tin', height: 0.3, collider: [0, 0, 0] },
  tirePump: { dir: 'tire_pump', height: 0.5, collider: [0, 0, 0] },
  vintageCabinet: { dir: 'vintage_cabinet_01', height: 1.6, collider: [1.0, 1.6, 0.5] },
  modernCabinet: { dir: 'modern_wooden_cabinet', height: 1.4, collider: [1.0, 1.4, 0.5] },
  projector: { dir: 'filmstrip_projector_8mm', height: 0.45, collider: [0, 0, 0] },
  // Sprint 16 — domestic/service extraction batch
  bedOld: { dir: 'old_bed_frame', height: 1.15, collider: [1.5, 1.15, 2.1] },
  masonryHeater: { dir: 'scandinavian_masonry_heater', height: 1.7, collider: [1.1, 1.7, 0.6] },
  boombox: { dir: 'boombox', height: 0.32, collider: [0, 0, 0] },
  cassettePlayer: { dir: 'cassette_player', height: 0.16, collider: [0, 0, 0] },
  laptop: { dir: 'classic_laptop', height: 0.28, collider: [0, 0, 0] },
  dartboard: { dir: 'dartboard', height: 0.45, collider: [0, 0, 0], anchor: 'center' },
  airconUnit: { dir: 'exterior_aircon_unit', height: 0.75, collider: [0, 0, 0], anchor: 'center' },
  broom: { dir: 'plastic_broom', height: 1.3, collider: [0, 0, 0] },
  dustpan: { dir: 'dustpan', height: 0.32, collider: [0, 0, 0] },
  cementBag: { dir: 'cement_bag', height: 0.42, collider: [0.6, 0.42, 0.4] },
  compostBags: { dir: 'compost_bags', height: 0.65, collider: [0.7, 0.65, 0.6] },
  nightstand: { dir: 'ClassicNightstand_01', height: 0.62, collider: [0.55, 0.62, 0.45] },
  screenPanels: { dir: 'chinese_screen_panels', height: 1.85, collider: [1.8, 1.85, 0.12] },
  foldingStool: { dir: 'folding_wooden_stool', height: 0.46, collider: [0.4, 0.46, 0.4] },
  drillPress: { dir: 'old_drill_press', height: 1.7, collider: [0.7, 1.7, 0.6] },
  lanternChandelier: { dir: 'lantern_chandelier_01', height: 1.3, collider: [0, 0, 0], anchor: 'center' },
  megaphone: { dir: 'Megaphone_01', height: 0.26, collider: [0, 0, 0] },
  ammoBox: { dir: 'ammo_box', height: 0.22, collider: [0.4, 0.22, 0.2] },
  deadTree: { dir: 'dead_tree_trunk', height: 2.6, collider: [0.5, 2.6, 0.5] },
  baseballBat: { dir: 'baseball_bat', height: 0.82, collider: [0, 0, 0] },
  jerrycanP: { dir: 'plastic_jerrycan', height: 0.42, collider: [0.35, 0.42, 0.25] },
  sprayCans: { dir: 'spray_paint_bottles', height: 0.22, collider: [0, 0, 0] },
  rustCan: { dir: 'can_rusted', height: 0.12, collider: [0, 0, 0] },
  foodCans: { dir: 'russian_food_cans_01', height: 0.14, collider: [0, 0, 0] },
  cleanerBottle: { dir: 'drain_cleaner', height: 0.27, collider: [0, 0, 0] },
  bleachBottle: { dir: 'bleach_bottle', height: 0.3, collider: [0, 0, 0] },
  ceilingFan: { dir: 'ceiling_fan', height: 0.5, collider: [0, 0, 0], anchor: 'center' },
  // Sprint 18 — gothic/creepy dressing batch
  gothicCommode: { dir: 'GothicCommode_01', height: 0.95, collider: [1.1, 0.95, 0.55] },
  galleryStatue: {
    dir: 'concrete_cat_statue', height: 1.6, collider: [0.9, 1.6, 0.9],
    variants: [
      { dir: 'bronze_shark_statue', height: 1.6, collider: [0.9, 1.6, 0.9] },
      { dir: 'bronze_whale_statue', height: 1.6, collider: [0.9, 1.6, 0.9] },
      { dir: 'bronze_ray_statue', height: 1.6, collider: [0.9, 1.6, 0.9] },
    ],
  },
  deadBranch: {
    dir: 'dead_quiver_branch_01', height: 1.2, collider: [0, 0, 0],
    variants: [
      { dir: 'dead_quiver_branch_02', height: 1.2, collider: [0, 0, 0] },
      { dir: 'dry_branches_medium_01', height: 1.1, collider: [0, 0, 0] },
    ],
  },
  crowbar: { dir: 'crowbar_01', height: 0.75, collider: [0, 0, 0] },
  boltCutters: { dir: 'bolt_cutters_01', height: 0.8, collider: [0, 0, 0] },
  bunsenBurner: { dir: 'bunsen_burner', height: 0.25, collider: [0, 0, 0] },
  goblets: { dir: 'brass_goblets', height: 0.2, collider: [0, 0, 0] },
  rifle: { dir: 'bolt_action_rifle_7_62', height: 1.2, collider: [0, 0, 0] },
};

const loader = new GLTFLoader();
const cache = new Map<string, THREE.Group>();
const pending = new Set<string>();

function normalize(root: THREE.Object3D, spec: ModelSpec): THREE.Group {
  const bb = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  bb.getSize(size);
  const s = spec.height / (size.y || 1);
  root.scale.setScalar(s);
  bb.setFromObject(root);
  const c = new THREE.Vector3();
  bb.getCenter(c);
  const holder = new THREE.Group();
  const baseY = spec.anchor === 'center' ? c.y : bb.min.y;
  root.position.set(-c.x, -baseY, -c.z);
  holder.add(root);
  return holder;
}

/** Reduce a loaded GLTF scene to a single merged mesh per material for draw calls. */
function bake(holder: THREE.Group): THREE.Group {
  const byMat = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  holder.updateMatrixWorld(true);
  const tuned = new Set<string>();
  holder.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // Poly Haven exports ship near-mirror metals; under indoor lighting they
    // render as voids. Cap metalness / floor roughness so they read as worn.
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat && !tuned.has(mat.uuid)) {
      tuned.add(mat.uuid);
      if (typeof mat.metalness === 'number') mat.metalness = Math.min(mat.metalness, 0.85);
      if (typeof mat.roughness === 'number') mat.roughness = Math.max(mat.roughness, 0.35);
    }
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const key = (m.material as THREE.Material).uuid;
    let e = byMat.get(key);
    if (!e) { e = { mat: m.material as THREE.Material, geos: [] }; byMat.set(key, e); }
    e.geos.push(g);
  });
  const out = new THREE.Group();
  for (const { mat, geos } of byMat.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
    for (const g of geos) g.dispose();
  }
  return out;
}

function allSpecs(): { spec: ModelSpec }[] {
  const out: { spec: ModelSpec }[] = [];
  for (const base of Object.values(MODEL_FOR)) {
    if (!base) continue;
    out.push({ spec: base });
    for (const v of base.variants ?? []) out.push({ spec: v });
  }
  return out;
}

export function preloadModels(): void {
  for (const { spec } of allSpecs()) {
    if (cache.has(spec.dir) || pending.has(spec.dir)) continue;
    pending.add(spec.dir);
    loader
      .loadAsync(`/assets/models/${spec.dir}/model.gltf`)
      .then((g) => cache.set(spec.dir, bake(normalize(g.scene, spec))))
      .catch(() => { /* fallback stays procedural */ })
      .finally(() => pending.delete(spec.dir));
  }
}

/** A cloned, floor-anchored model group when loaded, else null. `roll` in [0,1) picks a variant deterministically. */
export function modelInstance(kind: string, roll = 0): THREE.Group | null {
  const base = MODEL_FOR[kind];
  if (!base) return null;
  const variants = base.variants ?? [];
  const spec = variants.length && roll > 0.5 ? variants[Math.floor(roll * variants.length * 2) % variants.length] : base;
  const src = cache.get(spec.dir) ?? cache.get(base.dir);
  return src ? (src.clone(true) as THREE.Group) : null;
}

export function modelCollider(kind: string): [number, number, number] | null {
  return MODEL_FOR[kind]?.collider ?? null;
}
