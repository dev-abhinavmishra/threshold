// Material/clone audit — builds a slice of rooms per seed and reports,
// per biome: room meshes (draw-call proxy), unique material instances, and
// which of those are clones vs shared library/cache materials. Clones carry
// per-instance data (emissive anims, per-light intensity) — the audit flags
// clone sources that mutate nothing per-frame so we can dedup them.
//
// Usage: npx tsx tools/audit_materials.ts [seed...]
import * as THREE from 'three';
import { generateRoute } from '../src/world/generator';
import { buildRoomMesh } from '../src/world/builder';
import type { RoomInstance } from '../src/game/types';

const seeds = process.argv.slice(2);
const SEEDS = seeds.length ? seeds : ['s', 'threshold'];

interface RoomStat {
  idx: number; biome: string; template: string;
  meshes: number; mats: number; animated: number; instanced: number;
}

function roomStats(r: RoomInstance, seed: number): RoomStat | null {
  if (!r.spec) return null;
  const built = buildRoomMesh(r, r.spec, seed, 'high');
  let meshes = 0, instanced = 0;
  const mats = new Set<string>();
  const anim = new Set<THREE.Object3D>();
  built.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      meshes++;
      if ((m as THREE.InstancedMesh).isInstancedMesh) instanced++;
      const mm = m.material;
      if (Array.isArray(mm)) mm.forEach((x) => mats.add(x.uuid));
      else mats.add(mm.uuid);
    }
    if (o.userData.anim) anim.add(o);
  });
  return { idx: r.index, biome: r.biome, template: r.templateId, meshes, mats: mats.size, animated: anim.size, instanced };
}

for (const seed of SEEDS) {
  const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
  const pick: RoomInstance[] = [];
  // main route every 5th + all milestone-ish rooms + first 25 under
  for (const r of route.rooms) if (r.index % 5 === 0 || r.spec?.special) pick.push(r);
  for (const r of route.underRooms.slice(0, 25)) pick.push(r);

  const byBiome = new Map<string, { n: number; meshes: number; mats: number; anim: number }>();
  const heaviest: RoomStat[] = [];
  let totalMats = 0;
  for (const r of pick) {
    const s = roomStats(r, 11);
    if (!s) continue;
    const b = byBiome.get(s.biome) ?? { n: 0, meshes: 0, mats: 0, anim: 0 };
    b.n++; b.meshes += s.meshes; b.mats += s.mats; b.anim += s.animated;
    byBiome.set(s.biome, b);
    totalMats += s.mats;
    heaviest.push(s);
  }
  console.log(`\n=== seed ${seed} — ${pick.length} rooms built, ${totalMats} material instances total`);
  for (const [biome, b] of [...byBiome].sort((a, b) => b[1].mats - a[1].mats)) {
    console.log(`  ${biome.padEnd(12)} rooms=${b.n}  meshes/room=${(b.meshes / b.n).toFixed(1)}  mats/room=${(b.mats / b.n).toFixed(1)}  anim/room=${(b.anim / b.n).toFixed(1)}`);
  }
  heaviest.sort((a, b) => b.mats - a.mats);
  console.log('  heaviest material rooms:');
  for (const s of heaviest.slice(0, 6)) {
    console.log(`    #${s.idx} ${s.template} (${s.biome}): ${s.meshes} meshes, ${s.mats} mats, ${s.animated} anim`);
  }
}
