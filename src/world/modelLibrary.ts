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
  cabinet: {
    dir: 'GothicCabinet_01', height: 2.1, collider: [1.15, 2.1, 0.7],
    variants: [
      { dir: 'painted_wooden_cabinet', height: 2.0, collider: [1.1, 2.0, 0.65] },
      { dir: 'chinese_cabinet', height: 2.0, collider: [1.1, 2.0, 0.6] },
    ],
  },
  bed: { dir: 'GothicBed_01', height: 1.1, collider: [1.7, 1.1, 2.2] },
  chair: {
    dir: 'Rockingchair_01', height: 1.0, collider: [0.65, 1.0, 0.75],
    variants: [
      { dir: 'WoodenChair_01', height: 0.95, collider: [0.55, 0.95, 0.6] },
      { dir: 'gallinera_chair', height: 0.9, collider: [0.55, 0.9, 0.55] },
      { dir: 'painted_wooden_chair_01', height: 0.9, collider: [0.55, 0.9, 0.55] },
      { dir: 'painted_wooden_chair_02', height: 0.9, collider: [0.55, 0.9, 0.55] },
    ],
  },
  table: {
    dir: 'WoodenTable_01', height: 0.8, collider: [1.3, 0.8, 0.85],
    variants: [
      { dir: 'WoodenTable_02', height: 0.8, collider: [1.3, 0.8, 0.85] },
      { dir: 'WoodenTable_03', height: 0.8, collider: [1.3, 0.8, 0.85] },
      { dir: 'gallinera_table', height: 0.75, collider: [1.2, 0.75, 0.8] },
      { dir: 'painted_wooden_table', height: 0.8, collider: [1.3, 0.8, 0.85] },
      { dir: 'wooden_table_02', height: 0.8, collider: [1.3, 0.8, 0.85] },
    ],
  },
  painting: {
    dir: 'hanging_picture_frame_01', height: 0.9, collider: [0, 0, 0], anchor: 'center',
    variants: [
      { dir: 'fancy_picture_frame_01', height: 0.9, collider: [0, 0, 0], anchor: 'center' },
      { dir: 'hanging_picture_frame_02', height: 0.9, collider: [0, 0, 0], anchor: 'center' },
      { dir: 'fancy_picture_frame_02', height: 0.9, collider: [0, 0, 0], anchor: 'center' },
      { dir: 'hanging_picture_frame_03', height: 0.9, collider: [0, 0, 0], anchor: 'center' },
    ],
  },
  desk: { dir: 'metal_office_desk', height: 0.8, collider: [2.0, 0.8, 0.95] },
  bookshelf: {
    dir: 'wooden_bookshelf_worn', height: 2.1, collider: [1.4, 2.1, 0.6],
    variants: [
      { dir: 'wooden_display_shelves_01', height: 2.0, collider: [1.4, 2.0, 0.5] },
      { dir: 'painted_wooden_shelves', height: 2.0, collider: [1.4, 2.0, 0.5] },
    ],
  },
  sofa: {
    dir: 'sofa_02', height: 0.75, collider: [1.9, 0.75, 0.9],
    variants: [
      { dir: 'Sofa_01', height: 0.85, collider: [1.9, 0.85, 0.9] },
      { dir: 'sofa_03', height: 0.85, collider: [1.9, 0.85, 0.9] },
      { dir: 'painted_wooden_sofa', height: 0.8, collider: [1.8, 0.8, 0.85] },
      { dir: 'chinese_sofa', height: 0.8, collider: [1.8, 0.8, 0.85] },
    ],
  },
  filing: { dir: 'drawer_cabinet', height: 1.85, collider: [1.15, 1.85, 0.5] },
  locker: { dir: 'steel_frame_shelves_01', height: 2.2, collider: [1.15, 2.2, 0.55] },
  drawerUnit: { dir: 'vintage_wooden_drawer_01', height: 0.7, collider: [0.9, 0.7, 0.5] },
  trolley: { dir: 'industrial_storage_cart', height: 1.1, collider: [1.3, 1.1, 0.9] },
  shelf: {
    dir: 'steel_frame_shelves_02', height: 2.1, collider: [0.6, 2.1, 0.55],
    variants: [{ dir: 'steel_frame_shelves_03', height: 2.0, collider: [0.65, 2.0, 0.55] }],
  },
  plant: {
    dir: 'potted_plant_01', height: 1.3, collider: [0.6, 1.3, 0.65],
    variants: [
      { dir: 'nettle_plant', height: 1.0, collider: [0.5, 1.0, 0.5] },
      { dir: 'potted_plant_02', height: 1.1, collider: [0.55, 1.1, 0.55] },
      { dir: 'potted_plant_04', height: 0.9, collider: [0.5, 0.9, 0.5] },
      { dir: 'anthurium_botany_01', height: 0.8, collider: [0.4, 0.8, 0.4] },
      { dir: 'periwinkle_plant', height: 0.7, collider: [0.45, 0.7, 0.45] },
      { dir: 'crystalline_iceplant', height: 0.6, collider: [0.4, 0.6, 0.4] },
      { dir: 'weed_plant_02', height: 0.8, collider: [0.45, 0.8, 0.45] },
      { dir: 'planter_pot_clay', height: 0.85, collider: [0.5, 0.85, 0.5] },
    ],
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
    variants: [
      { dir: 'old_military_crate', height: 0.45, collider: [0.95, 0.45, 0.7] },
      { dir: 'wooden_crate_02', height: 0.5, collider: [0.8, 0.5, 0.6] },
    ],
  },
  statue: { dir: 'gothic_statue', height: 1.8, collider: [1.1, 1.8, 1.1] },
  bust: { dir: 'marble_bust_01', height: 0.55, collider: [0.3, 0.55, 0.35] },
  vase: {
    dir: 'brass_vase_01', height: 0.65, collider: [0, 0, 0],
    variants: [
      { dir: 'brass_vase_02', height: 0.6, collider: [0, 0, 0] },
      { dir: 'brass_vase_03', height: 0.55, collider: [0, 0, 0] },
      { dir: 'ceramic_vase_01', height: 0.6, collider: [0, 0, 0] },
      { dir: 'ceramic_vase_02', height: 0.55, collider: [0, 0, 0] },
      { dir: 'ceramic_vase_03', height: 0.6, collider: [0, 0, 0] },
      { dir: 'antique_ceramic_vase_01', height: 0.65, collider: [0, 0, 0] },
      { dir: 'brass_vase_04', height: 0.7, collider: [0, 0, 0] },
    ],
  },
  candle: {
    dir: 'brass_candleholders', height: 0.8, collider: [0, 0, 0],
    variants: [{ dir: 'wooden_candlestick', height: 0.5, collider: [0, 0, 0] }],
  },
  mirror: { dir: 'ornate_mirror_01', height: 1.4, collider: [0, 0, 0], anchor: 'center' },
  chandelier: {
    dir: 'Chandelier_01', height: 1.7, collider: [0, 0, 0], anchor: 'center',
    variants: [
      { dir: 'Chandelier_02', height: 1.6, collider: [0, 0, 0], anchor: 'center' },
      { dir: 'Chandelier_03', height: 1.5, collider: [0, 0, 0], anchor: 'center' },
      { dir: 'chinese_chandelier', height: 1.4, collider: [0, 0, 0], anchor: 'center' },
    ],
  },
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
  planter: {
    dir: 'planter_box_01', height: 0.55, collider: [1.1, 0.55, 0.4],
    variants: [
      { dir: 'planter_box_02', height: 0.5, collider: [1.0, 0.5, 0.4] },
      { dir: 'planter_box_03', height: 0.55, collider: [1.1, 0.55, 0.45] },
    ],
  },
  // Sprint 7 — service/industrial set + clutter
  barrel: {
    dir: 'Barrel_01', height: 0.9, collider: [0.6, 0.9, 0.6],
    variants: [
      { dir: 'Barrel_02', height: 0.9, collider: [0.6, 0.9, 0.6] },
      { dir: 'barrel_03', height: 0.9, collider: [0.6, 0.9, 0.6] },
      { dir: 'wooden_barrels_01', height: 0.9, collider: [0.7, 0.9, 0.7] },
    ],
  },
  wineBarrel: { dir: 'wine_barrel_01', height: 0.95, collider: [0.7, 0.95, 0.7] },
  pipeRun: { dir: 'modular_pipes', height: 2.2, collider: [0.4, 2.2, 0.4], anchor: 'center' },
  extinguisher: { dir: 'korean_fire_extinguisher_01', height: 0.55, collider: [0, 0, 0], anchor: 'center' },
  television: {
    dir: 'Television_01', height: 0.55, collider: [0.75, 0.55, 0.5],
    variants: [{ dir: 'television_02', height: 0.6, collider: [0.9, 0.6, 0.55] }],
  },
  wetFloor: { dir: 'WetFloorSign_01', height: 0.6, collider: [0.35, 0.6, 0.35] },
  wallClock2: { dir: 'wall_clock', height: 0.35, collider: [0, 0, 0], anchor: 'center' },
  mantelClock: { dir: 'mantel_clock_01', height: 0.3, collider: [0, 0, 0] },
  stool: {
    dir: 'metal_stool_01', height: 0.5, collider: [0.4, 0.5, 0.4],
    variants: [
      { dir: 'metal_stool_02', height: 0.5, collider: [0.4, 0.5, 0.4] },
      { dir: 'metal_stool_03', height: 0.45, collider: [0.4, 0.45, 0.4] },
      { dir: 'wooden_stool_01', height: 0.48, collider: [0.4, 0.48, 0.4] },
      { dir: 'wooden_stool_02', height: 0.5, collider: [0.4, 0.5, 0.4] },
      { dir: 'painted_wooden_stool', height: 0.45, collider: [0.4, 0.45, 0.4] },
      { dir: 'chinese_stool', height: 0.5, collider: [0.4, 0.5, 0.4] },
    ],
  },
  ladder: {
    dir: 'ladder_sectioned_01', height: 2.4, collider: [0.5, 2.4, 0.25],
    variants: [{ dir: 'wooden_ladder_02', height: 2.2, collider: [0.5, 2.2, 0.2] }],
  },
  bucket: {
    dir: 'wooden_bucket_01', height: 0.35, collider: [0.35, 0.35, 0.35],
    variants: [{ dir: 'wooden_bucket_02', height: 0.35, collider: [0.35, 0.35, 0.35] }],
  },
  alarmClock: { dir: 'alarm_clock_01', height: 0.16, collider: [0, 0, 0] },
  multimeter: { dir: 'retro_multimeter', height: 0.28, collider: [0, 0, 0] },
  wrench: {
    dir: 'pipe_wrench', height: 0.3, collider: [0, 0, 0],
    variants: [
      { dir: 'adjustable_wrench', height: 0.3, collider: [0, 0, 0] },
      { dir: 'combination_wrench', height: 0.28, collider: [0, 0, 0] },
      { dir: 'ratchet_wrench', height: 0.28, collider: [0, 0, 0] },
      { dir: 'flathead_screwdriver', height: 0.22, collider: [0, 0, 0] },
    ],
  },
  securityCam: {
    dir: 'security_camera_01', height: 0.35, collider: [0, 0, 0], anchor: 'center',
    variants: [{ dir: 'security_camera_02', height: 0.35, collider: [0, 0, 0], anchor: 'center' }],
  },
  toolChest: { dir: 'metal_tool_chest', height: 0.9, collider: [1.1, 0.9, 0.5] },
  propaneTank: { dir: 'propane_tank', height: 1.3, collider: [0.4, 1.3, 0.4] },
  medBox: { dir: 'medical_box', height: 0.45, collider: [0, 0, 0], anchor: 'center' },
  lantern: {
    dir: 'Lantern_01', height: 0.4, collider: [0.25, 0.4, 0.25],
    variants: [
      { dir: 'wooden_lantern_01', height: 0.4, collider: [0.25, 0.4, 0.25] },
      { dir: 'brass_diya_lantern', height: 0.35, collider: [0.25, 0.35, 0.25] },
    ],
  },
  flashlight: {
    dir: 'vintage_flashlight', height: 0.2, collider: [0, 0, 0],
    variants: [
      { dir: 'signal_flashlight', height: 0.25, collider: [0, 0, 0] },
      { dir: 'pastic_torch_6v', height: 0.25, collider: [0, 0, 0] },
      { dir: 'small_plastic_torch', height: 0.2, collider: [0, 0, 0] },
    ],
  },
  plasticCrate: { dir: 'plastic_crate_01', height: 0.4, collider: [0.55, 0.4, 0.4] },
  gasMask: { dir: 'old_gas_mask', height: 0.3, collider: [0, 0, 0] },
  armchair: {
    dir: 'ArmChair_01', height: 0.95, collider: [0.9, 0.95, 0.85],
    variants: [
      { dir: 'mid_century_lounge_chair', height: 0.85, collider: [0.8, 0.85, 0.8] },
      { dir: 'modern_arm_chair_01', height: 0.9, collider: [0.85, 0.9, 0.8] },
      { dir: 'GreenChair_01', height: 0.9, collider: [0.8, 0.9, 0.8] },
      { dir: 'chinese_armchair', height: 0.9, collider: [0.8, 0.9, 0.8] },
      { dir: 'BarberShopChair_01', height: 1.0, collider: [0.7, 1.0, 0.7] },
    ],
  },
  milCrate: { dir: 'wooden_military_crate', height: 0.5, collider: [0.9, 0.5, 0.55] },
  marbleBust: { dir: 'marble_bust_01', height: 0.5, collider: [0.35, 0.5, 0.3] },
  // Sprint 12 — utility/industrial wall-mounts + clutter
  powerBox: { dir: 'power_box_01', height: 0.65, collider: [0, 0, 0], anchor: 'center' },
  utilityBox: {
    dir: 'utility_box_01', height: 0.75, collider: [0, 0, 0], anchor: 'center',
    variants: [{ dir: 'utility_box_02', height: 0.75, collider: [0, 0, 0], anchor: 'center' }],
  },
  fluoroStrip: { dir: 'mounted_fluorescent_lights', height: 0.22, collider: [0, 0, 0], anchor: 'center' },
  cageLight: { dir: 'caged_hanging_light', height: 0.65, collider: [0, 0, 0], anchor: 'center' },
  securityLight: { dir: 'security_light', height: 0.4, collider: [0, 0, 0], anchor: 'center' },
  pipeLamp: { dir: 'industrial_pipe_lamp', height: 0.55, collider: [0, 0, 0], anchor: 'center' },
  wallHose: { dir: 'garden_hose_wall_mounted_01', height: 0.95, collider: [0, 0, 0], anchor: 'center' },
  toolCart: { dir: 'tool_cart', height: 0.95, collider: [1.05, 0.95, 0.6] },
  jerrycan: {
    dir: 'metal_jerrycan', height: 0.5, collider: [0.4, 0.5, 0.3],
    variants: [{ dir: 'metal_jerrycan_green', height: 0.5, collider: [0.4, 0.5, 0.3] }],
  },
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
  cassettePlayer: {
    dir: 'cassette_player', height: 0.16, collider: [0, 0, 0],
    variants: [{ dir: 'portable_cassette_player', height: 0.18, collider: [0, 0, 0] }],
  },
  laptop: { dir: 'classic_laptop', height: 0.28, collider: [0, 0, 0] },
  dartboard: { dir: 'dartboard', height: 0.45, collider: [0, 0, 0], anchor: 'center' },
  airconUnit: { dir: 'exterior_aircon_unit', height: 0.75, collider: [0, 0, 0], anchor: 'center' },
  broom: {
    dir: 'plastic_broom', height: 1.3, collider: [0, 0, 0],
    variants: [{ dir: 'wooden_broom', height: 1.3, collider: [0, 0, 0] }],
  },
  dustpan: { dir: 'dustpan', height: 0.32, collider: [0, 0, 0] },
  cementBag: { dir: 'cement_bag', height: 0.42, collider: [0.6, 0.42, 0.4] },
  compostBags: { dir: 'compost_bags', height: 0.65, collider: [0.7, 0.65, 0.6] },
  nightstand: {
    dir: 'ClassicNightstand_01', height: 0.62, collider: [0.55, 0.62, 0.45],
    variants: [{ dir: 'painted_wooden_nightstand', height: 0.6, collider: [0.55, 0.6, 0.45] }],
  },
  screenPanels: { dir: 'chinese_screen_panels', height: 1.85, collider: [1.8, 1.85, 0.12] },
  foldingStool: { dir: 'folding_wooden_stool', height: 0.46, collider: [0.4, 0.46, 0.4] },
  drillPress: {
    dir: 'old_drill_press', height: 1.7, collider: [0.7, 1.7, 0.6],
    variants: [{ dir: 'drill_press_01', height: 1.6, collider: [0.65, 1.6, 0.55] }],
  },
  lanternChandelier: { dir: 'lantern_chandelier_01', height: 1.3, collider: [0, 0, 0], anchor: 'center' },
  megaphone: { dir: 'Megaphone_01', height: 0.26, collider: [0, 0, 0] },
  ammoBox: { dir: 'ammo_box', height: 0.22, collider: [0.4, 0.22, 0.2] },
  deadTree: {
    dir: 'dead_tree_trunk', height: 2.6, collider: [0.5, 2.6, 0.5],
    variants: [
      { dir: 'dead_quiver_trunk', height: 2.4, collider: [0.45, 2.4, 0.45] },
      { dir: 'dead_tree_trunk_02', height: 2.5, collider: [0.5, 2.5, 0.5] },
    ],
  },
  baseballBat: { dir: 'baseball_bat', height: 0.82, collider: [0, 0, 0] },
  jerrycanP: { dir: 'plastic_jerrycan', height: 0.42, collider: [0.35, 0.42, 0.25] },
  sprayCans: { dir: 'spray_paint_bottles', height: 0.22, collider: [0, 0, 0] },
  rustCan: { dir: 'can_rusted', height: 0.12, collider: [0, 0, 0] },
  foodCans: { dir: 'russian_food_cans_01', height: 0.14, collider: [0, 0, 0] },
  cleanerBottle: {
    dir: 'drain_cleaner', height: 0.27, collider: [0, 0, 0],
    variants: [
      { dir: 'all_purpose_cleaner', height: 0.27, collider: [0, 0, 0] },
      { dir: 'cleaner_tin_01', height: 0.22, collider: [0, 0, 0] },
      { dir: 'multi_cleaner_bottle', height: 0.25, collider: [0, 0, 0] },
      { dir: 'multi_cleaner_5_litre', height: 0.32, collider: [0, 0, 0] },
      { dir: 'leather_cleaner_can', height: 0.2, collider: [0, 0, 0] },
      { dir: 'lubricant_spray', height: 0.22, collider: [0, 0, 0] },
      { dir: 'spray_paint_bottles_02', height: 0.2, collider: [0, 0, 0] },
    ],
  },
  bleachBottle: { dir: 'bleach_bottle', height: 0.3, collider: [0, 0, 0] },
  ceilingFan: { dir: 'ceiling_fan', height: 0.5, collider: [0, 0, 0], anchor: 'center' },
  // Sprint 18 — gothic/creepy dressing batch
  gothicCommode: {
    dir: 'GothicCommode_01', height: 0.95, collider: [1.1, 0.95, 0.55],
    variants: [{ dir: 'chinese_commode', height: 0.95, collider: [1.1, 0.95, 0.55] }],
  },
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
  // Sprint 21 — extraction batch 3 (domestic + setpiece + clutter + workshop + green)
  daybed: { dir: 'vintage_day_bed', height: 0.95, collider: [1.9, 0.95, 0.9] },
  ottoman: { dir: 'Ottoman_01', height: 0.45, collider: [0.7, 0.45, 0.7] },
  coffeeTable: {
    dir: 'CoffeeTable_01', height: 0.45, collider: [1.1, 0.45, 0.6],
    variants: [
      { dir: 'coffee_table_round_01', height: 0.45, collider: [0.7, 0.45, 0.7] },
      { dir: 'gothic_coffee_table', height: 0.45, collider: [1.1, 0.45, 0.6] },
      { dir: 'chinese_tea_table', height: 0.5, collider: [0.9, 0.5, 0.9] },
      { dir: 'industrial_coffee_table', height: 0.45, collider: [1.1, 0.45, 0.6] },
      { dir: 'modern_coffee_table_01', height: 0.4, collider: [1.1, 0.4, 0.6] },
      { dir: 'modern_coffee_table_02', height: 0.4, collider: [1.0, 0.4, 0.6] },
    ],
  },
  sideTable: {
    dir: 'side_table_01', height: 0.6, collider: [0.5, 0.6, 0.5],
    variants: [
      { dir: 'side_table_tall_01', height: 0.75, collider: [0.4, 0.75, 0.4] },
      { dir: 'small_wooden_table_01', height: 0.6, collider: [0.5, 0.6, 0.5] },
      { dir: 'chinese_console_table', height: 0.8, collider: [1.2, 0.8, 0.4] },
    ],
  },
  horseStatue: { dir: 'horse_statue_01', height: 2.1, collider: [1.4, 2.1, 0.7] },
  firePit: { dir: 'stone_fire_pit', height: 0.5, collider: [1.2, 0.5, 1.2] },
  spinningWheel: { dir: 'spinning_wheel_01', height: 1.3, collider: [1.0, 1.3, 0.6] },
  projScreen: { dir: 'projector_screen', height: 1.9, collider: [1.8, 1.9, 0.15] },
  streetLamp: {
    dir: 'street_lamp_01', height: 3.4, collider: [0.3, 3.4, 0.3],
    variants: [{ dir: 'street_lamp_02', height: 3.3, collider: [0.3, 3.3, 0.3] }],
  },
  instrPanel: { dir: 'vintage_spacecraft_instrument', height: 1.3, collider: [1.2, 1.3, 0.4] },
  teaSet: { dir: 'tea_set_01', height: 0.18, collider: [0, 0, 0] },
  wineBottles: { dir: 'wine_bottles_01', height: 0.32, collider: [0, 0, 0] },
  jug: {
    dir: 'jug_01', height: 0.3, collider: [0, 0, 0],
    variants: [{ dir: 'metal_jug', height: 0.3, collider: [0, 0, 0] }],
  },
  enamelPot: { dir: 'pot_enamel_01', height: 0.22, collider: [0, 0, 0] },
  woodenBowl: {
    dir: 'wooden_bowl_01', height: 0.14, collider: [0, 0, 0],
    variants: [{ dir: 'wooden_bowl_02', height: 0.14, collider: [0, 0, 0] }],
  },
  pillows: { dir: 'throw_pillows_01', height: 0.3, collider: [0, 0, 0] },
  basket: {
    dir: 'wicker_basket_01', height: 0.45, collider: [0.5, 0.45, 0.4],
    variants: [{ dir: 'wicker_basket_02', height: 0.4, collider: [0.45, 0.4, 0.4] }],
  },
  radio: { dir: 'vintage_radio_transceiver', height: 0.35, collider: [0, 0, 0] },
  camera: { dir: 'Camera_01', height: 0.18, collider: [0, 0, 0] },
  binoculars: {
    dir: 'vintage_binocular', height: 0.12, collider: [0, 0, 0],
    variants: [{ dir: 'binoculars', height: 0.14, collider: [0, 0, 0] }],
  },
  magnifier: { dir: 'magnifying_glass_01', height: 0.1, collider: [0, 0, 0] },
  lightbulb: {
    dir: 'lightbulb_01', height: 0.12, collider: [0, 0, 0],
    variants: [{ dir: 'lightbulb_led', height: 0.12, collider: [0, 0, 0] }],
  },
  oilCan: { dir: 'small_oil_can_01', height: 0.25, collider: [0, 0, 0] },
  cigs: { dir: 'cigarette_pack', height: 0.08, collider: [0, 0, 0] },
  lighter: { dir: 'vintage_lighter', height: 0.08, collider: [0, 0, 0] },
  mousetrap: { dir: 'mousetrap', height: 0.06, collider: [0, 0, 0] },
  sledge: { dir: 'sledgehammer_01', height: 0.9, collider: [0, 0, 0] },
  handsaw: {
    dir: 'handsaw_wood', height: 0.55, collider: [0, 0, 0],
    variants: [{ dir: 'rusted_hacksaw', height: 0.45, collider: [0, 0, 0] }],
  },
  hammer: {
    dir: 'cross_pein_hammer', height: 0.35, collider: [0, 0, 0],
    variants: [{ dir: 'wooden_hammer_01', height: 0.35, collider: [0, 0, 0] }],
  },
  screwdrivers: {
    dir: 'screwdrivers_02', height: 0.3, collider: [0, 0, 0],
    variants: [{ dir: 'screwdriver', height: 0.28, collider: [0, 0, 0] }],
  },
  handDrill: { dir: 'vintage_hand_drill', height: 0.35, collider: [0, 0, 0] },
  wateringCan: { dir: 'watering_can_metal_01', height: 0.4, collider: [0.45, 0.4, 0.25] },
  seedTray: { dir: 'seeding_tray_01', height: 0.18, collider: [0.55, 0.18, 0.35] },
  ductCirc: { dir: 'modular_airduct_circular_01', height: 0.5, collider: [0, 0, 0], anchor: 'center' },
  ductRect: { dir: 'modular_airduct_rectangular_01', height: 0.55, collider: [0, 0, 0], anchor: 'center' },
  indPipes: {
    dir: 'modular_industrial_pipes_01', height: 1.6, collider: [0, 0, 0], anchor: 'center',
    variants: [{ dir: 'modular_pipes_plastic_01', height: 1.5, collider: [0, 0, 0], anchor: 'center' }],
  },
  gutter: { dir: 'modular_metal_gutter', height: 0.35, collider: [0, 0, 0], anchor: 'center' },
  quiverTree: {
    dir: 'quiver_tree_01', height: 3.2, collider: [0.6, 3.2, 0.6],
    variants: [{ dir: 'quiver_tree_02', height: 3.0, collider: [0.6, 3.0, 0.6] }],
  },
  treeStump: {
    dir: 'tree_stump_01', height: 0.5, collider: [0.6, 0.5, 0.6],
    variants: [{ dir: 'tree_stump_02', height: 0.45, collider: [0.6, 0.45, 0.6] }],
  },
  frameStand: {
    dir: 'standing_picture_frame_01', height: 0.55, collider: [0, 0, 0],
    variants: [{ dir: 'fancy_picture_frame_02', height: 0.5, collider: [0, 0, 0] }],
  },
  rat: { dir: 'street_rat', height: 0.16, collider: [0, 0, 0] },
  axe: {
    dir: 'wooden_axe', height: 0.8, collider: [0, 0, 0],
    variants: [
      { dir: 'wooden_axe_02', height: 0.8, collider: [0, 0, 0] },
      { dir: 'wooden_axe_03', height: 0.75, collider: [0, 0, 0] },
      { dir: 'hatchet', height: 0.55, collider: [0, 0, 0] },
    ],
  },
  warHammer: { dir: 'ornate_war_hammer', height: 0.85, collider: [0, 0, 0] },
  sword: {
    dir: 'antique_estoc', height: 0.95, collider: [0, 0, 0],
    variants: [{ dir: 'antique_katana_01', height: 1.0, collider: [0, 0, 0] }],
  },
  register: { dir: 'CashRegister_01', height: 0.5, collider: [0, 0, 0] },
  console: { dir: 'ClassicConsole_01', height: 0.9, collider: [1.4, 0.9, 0.5] },
  coffeeCart: { dir: 'CoffeeCart_01', height: 1.5, collider: [1.5, 1.5, 0.7] },
  ukulele: { dir: 'Ukulele_01', height: 0.55, collider: [0, 0, 0] },
  roundTable: {
    dir: 'round_wooden_table_01', height: 0.75, collider: [0.9, 0.75, 0.9],
    variants: [{ dir: 'round_wooden_table_02', height: 0.75, collider: [0.9, 0.75, 0.9] }],
  },
  streetSeat: { dir: 'modular_street_seating', height: 0.8, collider: [1.8, 0.8, 0.55] },
  chest: { dir: 'treasure_chest', height: 0.55, collider: [0.8, 0.55, 0.5] },
  vidCamera: { dir: 'vintage_video_camera', height: 0.4, collider: [0, 0, 0] },
  barStool: { dir: 'bar_chair_round_01', height: 0.8, collider: [0.45, 0.8, 0.45] },
  picnicTable: {
    dir: 'wooden_picnic_table', height: 0.75, collider: [1.8, 0.75, 1.4],
    variants: [{ dir: 'outdoor_table_chair_set_01', height: 0.75, collider: [1.6, 0.75, 1.6] }],
  },
  stone: {
    dir: 'stone_01', height: 0.35, collider: [0.4, 0.35, 0.35],
    variants: [{ dir: 'rock_07', height: 0.4, collider: [0.45, 0.4, 0.4] }],
  },
  moss: { dir: 'moss_01', height: 0.15, collider: [0, 0, 0] },
  shelfWood: {
    dir: 'Shelf_01', height: 1.9, collider: [1.2, 1.9, 0.4],
    variants: [{ dir: 'painted_wooden_shelves', height: 1.8, collider: [1.2, 1.8, 0.4] }],
  },
  crate2: { dir: 'wooden_crate_02', height: 0.5, collider: [0.6, 0.5, 0.6] },
  // Sprint 24 — kitchen/food + electronics clutter
  kettle: { dir: 'vintage_electric_kettle', height: 0.25, collider: [0, 0, 0] },
  pan: { dir: 'brass_pan_01', height: 0.1, collider: [0, 0, 0] },
  cuttingBoard: { dir: 'wooden_cutting_board', height: 0.05, collider: [0, 0, 0] },
  carvedPlate: { dir: 'carved_wooden_plate', height: 0.3, collider: [0, 0, 0] },
  apple: { dir: 'food_apple_01', height: 0.1, collider: [0, 0, 0] },
  pears: { dir: 'food_pears_asian_01', height: 0.12, collider: [0, 0, 0] },
  cheeseBox: { dir: 'CheeseBox_01', height: 0.2, collider: [0, 0, 0] },
  football: { dir: 'american_football', height: 0.18, collider: [0, 0, 0] },
  circuitBoard: { dir: 'circuit_board', height: 0.15, collider: [0, 0, 0] },
  propaneTorch: { dir: 'propane_torch', height: 0.3, collider: [0, 0, 0] },
  searchlight: { dir: 'portable_searchlight', height: 0.9, collider: [0.5, 0.9, 0.5] },
  castleDoor: { dir: 'large_castle_door', height: 2.8, collider: [1.6, 2.8, 0.3] },
  ironGate: { dir: 'large_iron_gate', height: 2.4, collider: [1.8, 2.4, 0.2] },
  gateLatch: { dir: 'gate_latch_01', height: 0.35, collider: [0, 0, 0] },
  // Sprint 28 — extraction batch 5: tools, trophies, instruments, clutter
  powerDrill: { dir: 'Drill_01', height: 0.22, collider: [0, 0, 0] },
  pocketWatch: {
    dir: 'pocket_watch', height: 0.1, collider: [0, 0, 0],
    variants: [{ dir: 'vintage_pocket_watch', height: 0.1, collider: [0, 0, 0] }],
  },
  wristWatch: { dir: 'digital_wrist_watch', height: 0.08, collider: [0, 0, 0] },
  spectacles: { dir: 'round_spectacles', height: 0.08, collider: [0, 0, 0] },
  compass: { dir: 'seadogs_compass', height: 0.1, collider: [0, 0, 0] },
  trophyHead: {
    dir: 'bull_head', height: 0.75, collider: [0, 0, 0], anchor: 'center',
    variants: [
      { dir: 'horse_head', height: 0.8, collider: [0, 0, 0], anchor: 'center' },
      { dir: 'lion_head', height: 0.7, collider: [0, 0, 0], anchor: 'center' },
    ],
  },
  ornament: {
    dir: 'carved_wooden_elephant', height: 0.25, collider: [0, 0, 0],
    variants: [{ dir: 'garden_gnome', height: 0.35, collider: [0, 0, 0] }],
  },
  chemistrySet: { dir: 'chemistry_set', height: 0.35, collider: [0, 0, 0] },
  microscope: {
    dir: 'industrial_microscope', height: 0.35, collider: [0, 0, 0],
    variants: [{ dir: 'vintage_microscope', height: 0.35, collider: [0, 0, 0] }],
  },
  chessSet: { dir: 'chess_set', height: 0.12, collider: [0, 0, 0] },
  boardGame: {
    dir: 'sungka_board', height: 0.15, collider: [0, 0, 0],
    variants: [{ dir: 'sungka_board_02', height: 0.15, collider: [0, 0, 0] }],
  },
  machete: { dir: 'machete', height: 0.5, collider: [0, 0, 0] },
  dagger: { dir: 'ornate_medieval_dagger', height: 0.4, collider: [0, 0, 0] },
  mace: { dir: 'ornate_medieval_mace', height: 0.75, collider: [0, 0, 0] },
  katana: { dir: 'katana_stand_01', height: 1.0, collider: [0.5, 1.0, 0.3] },
  kiteShield: { dir: 'kite_shield', height: 1.3, collider: [0, 0, 0], anchor: 'center' },
  brassPot: {
    dir: 'brass_pot_01', height: 0.3, collider: [0, 0, 0],
    variants: [
      { dir: 'brass_pot_02', height: 0.28, collider: [0, 0, 0] },
      { dir: 'ceramic_pot', height: 0.3, collider: [0, 0, 0] },
    ],
  },
  handTruck: { dir: 'hand_truck', height: 1.2, collider: [0.5, 1.2, 0.5] },
  pliers: {
    dir: 'pliers', height: 0.18, collider: [0, 0, 0],
    variants: [{ dir: 'tongue_groove_pliers', height: 0.2, collider: [0, 0, 0] }],
  },
  trowel: { dir: 'trowel_01', height: 0.25, collider: [0, 0, 0] },
  handPlane: { dir: 'hand_plane_no4', height: 0.2, collider: [0, 0, 0] },
  tapeMeasure: { dir: 'measuring_tape_01', height: 0.12, collider: [0, 0, 0] },
  metalDetector: { dir: 'metal_detector', height: 1.1, collider: [0.3, 1.1, 0.3] },
  plunger: { dir: 'plunger', height: 0.5, collider: [0, 0, 0] },
  rubberBoots: { dir: 'rubber_boots', height: 0.35, collider: [0, 0, 0] },
  gallonJug: { dir: 'plastic_bottle_gallon', height: 0.3, collider: [0, 0, 0] },
  plasticBin: {
    dir: 'plastic_container', height: 0.3, collider: [0, 0, 0],
    variants: [{ dir: 'industrial_pastic_container', height: 0.35, collider: [0, 0, 0] }],
  },
  thermos: {
    dir: 'plastic_thermos', height: 0.25, collider: [0, 0, 0],
    variants: [{ dir: 'modified_thermos', height: 0.3, collider: [0, 0, 0] }],
  },
  postcards: { dir: 'postcard_set_01', height: 0.05, collider: [0, 0, 0] },
  stationery: { dir: 'stationery_supplies', height: 0.12, collider: [0, 0, 0] },
  stapler: { dir: 'vintage_stapler', height: 0.12, collider: [0, 0, 0] },
  rubberDuck: { dir: 'rubber_duck_toy', height: 0.12, collider: [0, 0, 0] },
  spade: { dir: 'rusted_spade_01', height: 0.95, collider: [0, 0, 0] },
  wheelRim: {
    dir: 'rusted_wheel_rim_01', height: 0.5, collider: [0, 0, 0],
    variants: [{ dir: 'rusted_wheel_rim_02', height: 0.5, collider: [0, 0, 0] }],
  },
  tyre: { dir: 'old_tyre', height: 0.6, collider: [0.6, 0.6, 0.6] },
  compressor: { dir: 'old_military_compressor', height: 1.0, collider: [0.9, 1.0, 0.5] },
  crutches: { dir: 'vintage_crutches_01', height: 1.35, collider: [0, 0, 0] },
  rations: { dir: 'long_life_food', height: 0.2, collider: [0, 0, 0] },
  medicalTape: { dir: 'medical_tape', height: 0.1, collider: [0, 0, 0] },
  pastry: { dir: 'croissant', height: 0.08, collider: [0, 0, 0] },
  standingFrame: { dir: 'standing_picture_frame_02', height: 1.5, collider: [0.6, 1.5, 0.4] },
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
  // Staggered queue — ~270 GLTF parses at once spikes JS heap past 2GB;
  // drip-feeding lets early rooms build while the tail loads.
  const queue = allSpecs();
  let i = 0;
  const pump = () => {
    for (let n = 0; n < 8 && i < queue.length; n++, i++) {
      const { spec } = queue[i];
      if (cache.has(spec.dir) || pending.has(spec.dir)) continue;
      pending.add(spec.dir);
      loader
        .loadAsync(`/assets/models/${spec.dir}/model.gltf`)
        .then((g) => cache.set(spec.dir, bake(normalize(g.scene, spec))))
        .catch(() => { /* fallback stays procedural */ })
        .finally(() => pending.delete(spec.dir));
    }
    if (i < queue.length) setTimeout(pump, 60);
  };
  pump();
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
