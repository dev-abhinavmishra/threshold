/**
 * Build-sweep: instantiate buildRoomMesh for every room in several seeds and
 * quality tiers. Catches crashes/NaN in dressing code paths the generator sim
 * never exercises (no renderer needed — builder is document-guarded).
 */
import * as THREE from 'three';
import { buildRoomMesh, disposeRoom } from '../src/world/builder';
import { generateRoute } from '../src/world/generator';

const seeds = ['moth-ledger-404', 'gilt-spine-777', 'ash-vault-101'];
const tiers: ('low' | 'high')[] = ['low', 'high'];
let built = 0, meshTotal = 0, fail = 0, animated = 0;
const seen = new Set<string>();
for (const seedText of seeds) {
  const route = generateRoute({ seedText, difficulty: 'standard' as const });
  for (const tier of tiers) {
    for (const room of [...route.rooms, ...route.underRooms]) {
      const key = `${seedText}|${tier}|${room.index}`;
      if (!room.spec) continue;
      try {
        const b = buildRoomMesh(room, room.spec, 7, tier);
        let meshes = 0;
        b.group.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            meshes++;
            const pos = o.position;
            if (Number.isNaN(pos.x) || Number.isNaN(pos.y) || Number.isNaN(pos.z)) {
              throw new Error(`NaN position on mesh ${o.name || o.type}`);
            }
          }
        });
        meshTotal += meshes; built++; animated += b.animated.length;
        seen.add(room.templateId);
        disposeRoom(b);
      } catch (e) {
        fail++;
        console.error(`FAIL ${key} ${room.templateId}:`, (e as Error).message);
      }
    }
  }
}
console.log(`${built} room builds ok, ${fail} failed, ${meshTotal} meshes, ${animated} animated nodes, ${seen.size} templates`);
if (fail) process.exit(1);
