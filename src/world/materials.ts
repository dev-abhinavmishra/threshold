/**
 * Shared materials — the THRESHOLD palette.
 * Main floor: charcoal, tobacco brown, oxidized green, paper cream, warning amber.
 * Underscript: gray-blue concrete, fluorescent ivory, black ink, red amendment.
 */
import * as THREE from 'three';
import { woodTex, metalTex, carpetTex, TEX } from './textures';

export const PALETTE = {
  plaster: 0x8f8578,
  plasterDark: 0x6e665c,
  darkOak: 0x4a3423,
  oak: 0x6b4c30,
  brass: 0x8f7a3a,
  brassBright: 0xc9a44a,
  steel: 0x5a6066,
  steelDark: 0x3a4046,
  glassDusty: 0x9aa39b,
  paper: 0xd8cfb4,
  paperOld: 0xbfb494,
  tile: 0x777d75,
  charcoal: 0x23211e,
  carpet: 0x4d3b33,
  carpetGreen: 0x3d4a3e,
  oxGreen: 0x4a6b5a,
  amber: 0xd88b2a,
  red: 0xa83226,
  ink: 0x1a1a18,
  concrete: 0x6a7078,
  concreteDark: 0x4a5058,
  fluoro: 0xe8e4d0,
  wax: 0xc9b98a,
} as const;

const mats = new Map<string, THREE.MeshStandardMaterial>();

function m(key: string, color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  let mat = mats.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.04, ...opts });
    mats.set(key, mat);
  }
  return mat;
}

export const MAT = {
  plaster: () => m('plaster', PALETTE.plaster),
  plasterDark: () => m('plasterDark', PALETTE.plasterDark),
  darkOak: () => woodTex(true),
  oak: () => woodTex(false),
  brass: () => m('brass', PALETTE.brass, { metalness: 0.55, roughness: 0.45 }),
  brassBright: () => m('brassBright', PALETTE.brassBright, { metalness: 0.65, roughness: 0.35 }),
  steel: () => metalTex(false),
  steelDark: () => metalTex(true),
  paper: () => m('paper', PALETTE.paper, { roughness: 1 }),
  paperOld: () => m('paperOld', PALETTE.paperOld, { roughness: 1 }),
  tile: () => TEX.concreteFloor(),
  charcoal: () => m('charcoal', PALETTE.charcoal),
  carpet: () => carpetTex(false),
  carpetGreen: () => carpetTex(true),
  oxGreen: () => m('oxGreen', PALETTE.oxGreen),
  glassDusty: () => m('glassDusty', PALETTE.glassDusty, { transparent: true, opacity: 0.35, roughness: 0.2, metalness: 0.2 }),
  amber: () => m('amber', PALETTE.amber, { emissive: PALETTE.amber, emissiveIntensity: 1.7 }),
  amberDim: () => m('amberDim', PALETTE.amber, { emissive: PALETTE.amber, emissiveIntensity: 1.1 }),
  redLamp: () => m('redLamp', PALETTE.red, { emissive: PALETTE.red, emissiveIntensity: 2.0 }),
  ink: () => m('ink', PALETTE.ink),
  concrete: () => TEX.concreteWall(),
  concreteDark: () => TEX.concreteFloor(),
  fluoro: () => m('fluoro', PALETTE.fluoro, { emissive: PALETTE.fluoro, emissiveIntensity: 1.4 }),
  wax: () => m('wax', PALETTE.wax),
  waterDark: () => m('waterDark', 0x1a2426, { roughness: 0.15, metalness: 0.3 }),
  darkVoid: () => m('darkVoid', 0x0b0a09, { roughness: 1 }),
  creatureFabric: () => m('creatureFabric', 0x2a2624, { roughness: 1 }),
  creatureSkin: () => m('creatureSkin', 0x8a8072, { roughness: 0.95 }),
  screenGreen: () => m('screenGreen', 0x1d3a26, { emissive: 0x2d7a4a, emissiveIntensity: 0.9 }),
  screenAmber: () => m('screenAmber', 0x3a2a14, { emissive: 0xc07a28, emissiveIntensity: 0.9 }),
  screenDark: () => m('screenDark', 0x0d0f0d, { emissive: 0x16202a, emissiveIntensity: 0.35, roughness: 0.4 }),
  eyeGlow: () => m('eyeGlow', 0xffe9b0, { emissive: 0xffe9b0, emissiveIntensity: 2.2 }),
  afterglow: () => m('afterglow', 0xe8c86a, { emissive: 0xe8c86a, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }),
  shadowFigure: () => m('shadowFigure', 0x111010, { roughness: 1 }),
};

/** Materials keyed by biome floor material for prop builders. */
export function floorMaterial(kind: string): THREE.MeshStandardMaterial {
  switch (kind) {
    case 'wood': return MAT.darkOak();
    case 'carpet': return MAT.carpet();
    case 'stone': return MAT.tile();
    case 'metal': return MAT.steelDark();
    case 'concrete': return MAT.concrete();
    case 'paper': return MAT.paperOld();
    default: return MAT.plaster();
  }
}

export function disposeSharedMaterials(): void {
  for (const mat of mats.values()) mat.dispose();
  mats.clear();
}
