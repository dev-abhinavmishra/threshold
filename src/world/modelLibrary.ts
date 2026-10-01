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
}

/** Prop kind → vendored model + display size. */
export const MODEL_FOR: Partial<Record<string, ModelSpec>> = {
  cabinet: { dir: 'GothicCabinet_01', height: 2.1, collider: [1.15, 2.1, 0.7] },
  bed: { dir: 'GothicBed_01', height: 1.1, collider: [1.7, 1.1, 2.2] },
  chair: { dir: 'Rockingchair_01', height: 1.0, collider: [0.65, 1.0, 0.75] },
  table: { dir: 'WoodenTable_01', height: 0.8, collider: [1.3, 0.8, 0.85] },
  painting: { dir: 'hanging_picture_frame_01', height: 0.9, collider: [0, 0, 0], anchor: 'center' },
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
  holder.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
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

export function preloadModels(): void {
  for (const [kind, spec] of Object.entries(MODEL_FOR)) {
    if (!spec || cache.has(kind) || pending.has(kind)) continue;
    pending.add(kind);
    loader
      .loadAsync(`/assets/models/${spec.dir}/model.gltf`)
      .then((g) => cache.set(kind, bake(normalize(g.scene, spec))))
      .catch(() => { /* fallback stays procedural */ })
      .finally(() => pending.delete(kind));
  }
}

/** A cloned, floor-anchored model group when loaded, else null. */
export function modelInstance(kind: string): THREE.Group | null {
  const src = cache.get(kind);
  return src ? (src.clone(true) as THREE.Group) : null;
}

export function modelCollider(kind: string): [number, number, number] | null {
  return MODEL_FOR[kind]?.collider ?? null;
}
