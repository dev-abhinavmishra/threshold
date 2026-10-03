/**
 * Vendored CC0 texture sets (public/assets/textures/<name>/) and the shared
 * surface materials built from them. All box geometry in the game is
 * UV-fixed to 1 unit = 1 meter (see props.box / uvFixBox), so `period` is
 * simply how many meters one texture tile should span.
 */
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();

function tex(name: string, kind: 'color' | 'normalgl' | 'roughness', srgb = false): THREE.Texture {
  const key = `${name}/${kind}`;
  let t = texCache.get(key);
  if (!t) {
    try {
      t = loader.load(`/assets/textures/${name}/${kind}.jpg`);
    } catch {
      // Headless environments (unit tests, SSR) have no real image loading —
      // a blank texture keeps materials valid.
      t = new THREE.Texture();
    }
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return t;
}

export interface SurfaceOpts {
  color?: number;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
}

/** Shared PBR material for a vendored texture set; `period` = meters per tile. */
export function surfaceMaterial(name: string, period: number, opts: SurfaceOpts = {}): THREE.MeshStandardMaterial {
  const key = `${name}@${period}:${opts.color ?? 0xffffff}:${opts.metalness ?? ''}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    roughness: opts.roughness ?? 1.0,
    metalness: opts.metalness ?? 0.02,
  });
  const r = 1 / period;
  const c = tex(name, 'color', true).clone();
  c.repeat.set(r, r);
  m.map = c;
  const n = tex(name, 'normalgl').clone();
  n.repeat.set(r, r);
  m.normalMap = n;
  m.normalScale.setScalar(opts.normalScale ?? 0.85);
  const ro = tex(name, 'roughness').clone();
  ro.repeat.set(r, r);
  m.roughnessMap = ro;
  matCache.set(key, m);
  return m;
}

/** Named surface materials used by the room builder. */
export const TEX = {
  wallpaper: () => surfaceMaterial('wallpaper', 1.6, { color: 0xbfb8a8 }),
  plasterDamaged: () => surfaceMaterial('plaster-damaged', 1.8, { color: 0xb0a89a }),
  ceiling: () => surfaceMaterial('ceiling-plaster', 2.0, { color: 0xa8a49a }),
  carpet: () => surfaceMaterial('carpet-dark', 2.0, { color: 0x9a8f86 }),
  woodFloor: () => surfaceMaterial('wood-floor', 1.8, { color: 0xb09577 }),
  woodFloorDark: () => surfaceMaterial('wood-floor-dark', 1.8, { color: 0x8a7057 }),
  concreteFloor: () => surfaceMaterial('concrete-dark', 2.2, { color: 0x9aa0a6 }),
  concreteWall: () => surfaceMaterial('concrete-bunker', 2.0, { color: 0xa8aeB0 }),
  brick: () => surfaceMaterial('brick-damaged', 2.0, { color: 0xa09080 }),
  metalDirty: () => surfaceMaterial('metal-dirty', 1.2, { color: 0xb8bcc0, metalness: 0.55 }),
  metalAged: () => surfaceMaterial('metal-aged', 1.4, { color: 0xc0c4c8, metalness: 0.5 }),
  tileWall: () => surfaceMaterial('tiles-institutional', 1.3, { color: 0xb9bfb2 }),
  leather: () => surfaceMaterial('leather-dark', 1.0, { color: 0x9a8874 }),
  woodPanel: () => surfaceMaterial('wood092', 1.5, { color: 0x8a7050 }),
  marbleFloor: () => surfaceMaterial('marble012', 1.8, { color: 0xb8b4ac, roughness: 0.35 }),
  travertine: () => surfaceMaterial('travertine009', 1.6, { color: 0xb5ab98 }),
  diamondPlate: () => surfaceMaterial('diamondplate009', 1.2, { color: 0x8f959b, metalness: 0.5 }),
  metalWalkway: () => surfaceMaterial('metalwalkway014', 1.5, { color: 0x878d92, metalness: 0.55 }),
  corrugated: () => surfaceMaterial('corrugatedsteel007a', 1.5, { color: 0x8a9298, metalness: 0.6 }),
  concreteLight: () => surfaceMaterial('concrete034', 2.2, { color: 0xa2a6aa }),
  metalRusted: () => surfaceMaterial('metal-rusted', 1.4, { color: 0x8a7f78, metalness: 0.45 }),
  woodFloorWorn: () => surfaceMaterial('wood-floor-worn', 1.8, { color: 0xa08b74 }),
  woodFloorOld: () => surfaceMaterial('wood-floor-old', 1.9, { color: 0x9a8268 }),
  plasterPeeling: () => surfaceMaterial('plaster-peeling2', 1.8, { color: 0xa8a294 }),
  carpetWorn: () => surfaceMaterial('carpet-worn', 2.0, { color: 0x8a8078 }),
  wallpaperGrand: () => surfaceMaterial('wallpaper-grand', 1.5, { color: 0xa09a80 }),
  woodPaint: () => surfaceMaterial('wood-paint', 1.6, { color: 0x8a9098 }),
  marbleDark: () => surfaceMaterial('marble-dark', 1.7, { color: 0x8a8a8e, roughness: 0.32 }),
  concreteIndustrial: () => surfaceMaterial('concrete-industrial', 2.1, { color: 0x9aa0a2 }),
  terrazzo: () => surfaceMaterial('terrazzo', 1.7, { color: 0xb2aca0, roughness: 0.4 }),
  ceilingAcoustic: () => surfaceMaterial('ceiling-acoustic', 1.6, { color: 0xa8a49a }),
  clothWorn: () => surfaceMaterial('cloth-worn', 1.4, { color: 0x8a8078 }),
  plasterPainted: () => surfaceMaterial('plaster-painted', 1.8, { color: 0x9aa89b }),
  woodPlanksDark: () => surfaceMaterial('wood-planks-dark', 1.8, { color: 0x7a624c }),
  corrugatedRust: () => surfaceMaterial('corrugated-rust', 1.5, { color: 0x94857a, metalness: 0.5 }),
  carpetShag: () => surfaceMaterial('carpet-shag', 2.0, { color: 0x90857c }),
  woodParquet: () => surfaceMaterial('wood-parquet', 1.7, { color: 0xa08868 }),
  cardboard: () => surfaceMaterial('cardboard', 1.0, { color: 0xa89070 }),
  stoneWall: () => surfaceMaterial('stone-wall', 1.6, { color: 0x9a948a }),
  groundDirt: () => surfaceMaterial('ground-dirt', 1.8, { color: 0x7a6a58 }),
  metalGrid: () => surfaceMaterial('metal-grid', 1.4, { color: 0x8a9096, metalness: 0.5 }),
  tilesCheckered: () => surfaceMaterial('tiles-checkered', 1.5, { color: 0xa8a89e }),
  curtainFabric: () => surfaceMaterial('curtain-fabric', 1.4, { color: 0x6a5048 }),
  tilesMosaic: () => surfaceMaterial('tiles-mosaic', 1.5, { color: 0x9a9890 }),
  brickOld: () => surfaceMaterial('brick-old', 1.8, { color: 0xa08a78 }),
  granite: () => surfaceMaterial('granite', 1.6, { color: 0x9aa0a4, roughness: 0.35 }),
};

/** Prop-level swaps (used through MAT): wood and metal grain on furniture. */
export function woodTex(dark = false): THREE.MeshStandardMaterial {
  return dark
    ? surfaceMaterial('wood-floor-dark', 1.2, { color: 0x6e543c })
    : surfaceMaterial('wood-floor', 1.2, { color: 0x9a7a56 });
}
export function metalTex(dark = false): THREE.MeshStandardMaterial {
  return dark
    ? surfaceMaterial('metal-dirty', 0.9, { color: 0x8a9096, metalness: 0.5 })
    : surfaceMaterial('metal-aged', 1.0, { color: 0xaab0b6, metalness: 0.55 });
}
export function carpetTex(green = false): THREE.MeshStandardMaterial {
  return surfaceMaterial('carpet-dark', 1.6, { color: green ? 0x6a7a6e : 0x8a7a6e });
}

export function disposeTextures(): void {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
}
