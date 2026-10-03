/**
 * Rigged CC0 creature bodies (public/assets/figures/*.glb — Quaternius,
 * full animation sets). Loads once, clones via SkeletonUtils so each entity
 * gets its own bind pose + AnimationMixer. Returns null until loaded —
 * callers fall back to tallFigure so spawns never block on the network.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

interface RigSpec {
  file: string;
  /** Target height in meters. */
  height: number;
  /** Preferred clips, by substring — first hit wins. */
  clips: { idle: string[]; move: string[]; attack: string[] };
  /** Multiply material color (house-tint). */
  tint?: number;
  /** Transparency for apparitions. */
  opacity?: number;
  /** Additive emissive lift so the body reads in darkness. */
  emissive?: number;
}

export const RIGGED: Record<string, RigSpec> = {
  /** Translucent wraith — Whisper's localized silhouette, Margin's edge-shape. */
  ghost: {
    file: 'quaternius_ghost.glb', height: 1.9, opacity: 0.5, emissive: 0.25,
    clips: { idle: ['flying_idle', 'idle'], move: ['fast_flying', 'flying'], attack: ['headbutt', 'punch'] },
  },
  /** Horned thing that fills doorways — Pursuer core, EchoSkin stalker. */
  demon: {
    file: 'quaternius_demon.glb', height: 2.3, tint: 0.45,
    clips: { idle: ['flying_idle', 'idle'], move: ['fast_flying', 'flying', 'run'], attack: ['headbutt', 'punch'] },
  },
  /** Ink-black ghost variant for the Underscript. */
  inkGhost: {
    file: 'quaternius_ghost.glb', height: 2.1, tint: 0.06, opacity: 0.85, emissive: 0.05,
    clips: { idle: ['flying_idle', 'idle'], move: ['fast_flying', 'flying'], attack: ['headbutt', 'punch'] },
  },
  /** Skeletal runner — corridor passes and the chase lead. */
  skeleton: {
    file: 'quaternius_skeleton.glb', height: 2.2, tint: 0.6,
    clips: { idle: ['idle'], move: ['run', 'walk'], attack: ['punch', 'sword'] },
  },
  /** Tar-dark slime — the Inkling's mass, agitated by held light. */
  slime: {
    file: 'quaternius_slime.glb', height: 0.6, tint: 0.08, emissive: 0.05,
    clips: { idle: ['idle'], move: ['walk', 'jump'], attack: ['bite_front', 'jump'] },
  },
  /** Robed archivist — the Curator's body under its measuring rods. */
  wizard: {
    file: 'quaternius_wizard.glb', height: 2.8, tint: 0.35, emissive: 0.04,
    clips: { idle: ['idle'], move: ['walk'], attack: ['bite_front', 'punch', 'jump'] },
  },
  /** Deep-blue winged thing — the Editor patrolling the Underscript. */
  blueDemon: {
    file: 'quaternius_bluedemon.glb', height: 2.6, tint: 0.4, emissive: 0.06,
    clips: { idle: ['flying_idle', 'idle'], move: ['fast_flying', 'flying'], attack: ['headbutt', 'punch'] },
  },
};

interface RigSource { scene: THREE.Group; animations: THREE.AnimationClip[] }

const loader = new GLTFLoader();
const cache = new Map<string, RigSource>();
const pending = new Set<string>();

export function preloadFigures(): void {
  const files = [...new Set(Object.values(RIGGED).map((s) => s.file))];
  for (const file of files) {
    if (cache.has(file) || pending.has(file)) continue;
    pending.add(file);
    loader
      .loadAsync(`/assets/figures/${file}`)
      .then((g) => cache.set(file, { scene: g.scene as THREE.Group, animations: g.animations }))
      .catch(() => { /* procedural fallback stays */ })
      .finally(() => pending.delete(file));
  }
}

function pickClip(anims: THREE.AnimationClip[], keys: string[]): THREE.AnimationClip | null {
  const lower = anims.map((a) => a.name.toLowerCase());
  for (const k of keys) {
    const i = lower.findIndex((n) => n.includes(k));
    if (i >= 0) return anims[i];
  }
  return anims[0] ?? null;
}

export interface RiggedFigure {
  group: THREE.Group;
  /** Tick the mixer each frame. */
  update(dt: number): void;
  /** Crossfade to a named state. */
  play(state: 'idle' | 'move' | 'attack', fade?: number): void;
}

/** A cloned rigged body scaled to spec.height, floor-anchored, mixer primed. */
export function riggedFigure(kind: keyof typeof RIGGED): RiggedFigure | null {
  const spec = RIGGED[kind];
  const src = cache.get(spec.file);
  if (!src) return null;

  const body = skClone(src.scene) as THREE.Group;
  const bb = new THREE.Box3().setFromObject(body);
  const size = new THREE.Vector3();
  bb.getSize(size);
  const s = spec.height / (size.y || 1);
  body.scale.setScalar(s);
  bb.setFromObject(body);
  const c = new THREE.Vector3();
  bb.getCenter(c);
  body.position.set(-c.x, -bb.min.y, -c.z);

  const tuned = new Set<string>();
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false; // skinned bounds go stale on animated rigs
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!mat || tuned.has(mat.uuid)) return;
    tuned.add(mat.uuid);
    if (spec.tint !== undefined) mat.color.multiplyScalar(spec.tint);
    if (spec.emissive !== undefined) {
      mat.emissive = mat.color.clone();
      mat.emissiveIntensity = spec.emissive;
    }
    if (spec.opacity !== undefined) {
      mat.transparent = true;
      mat.opacity = spec.opacity;
      mat.depthWrite = false;
    }
    mat.metalness = 0;
    mat.roughness = Math.max(mat.roughness ?? 0.5, 0.6);
  });

  const group = new THREE.Group();
  group.add(body);
  group.userData.rigged = kind;

  const mixer = new THREE.AnimationMixer(body);
  const actions: Partial<Record<'idle' | 'move' | 'attack', THREE.AnimationAction>> = {};
  let current: THREE.AnimationAction | null = null;
  const resolve = (state: 'idle' | 'move' | 'attack') => {
    if (!actions[state]) {
      const clip = pickClip(src.animations, spec.clips[state]);
      if (!clip) return null;
      actions[state] = mixer.clipAction(clip);
    }
    return actions[state]!;
  };
  const play = (state: 'idle' | 'move' | 'attack', fade = 0.25) => {
    const next = resolve(state);
    if (!next || next === current) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    current?.fadeOut(fade);
    current = next;
  };
  play('idle', 0);

  return { group, play, update: (dt: number) => mixer.update(dt) };
}
