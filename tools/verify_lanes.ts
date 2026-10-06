/*
 * Placement sweep — deterministic prop-layout checks across every room
 * template and a spread of seeds. Run: npx tsx tools/verify_lanes.ts
 *
 * Reports:
 *   DROP    — prop culled by clearDoorLanes (inside a door approach lane)
 *   HIDEDROP— hiding spot culled by clearDoorLanes (usually design)
 *   ORPHAN  — hiding spot with no furniture within 1.5m to hide behind
 *   CLIP    — model collider extends past a wall face (>5cm)
 *   CLASH   — two FIXED props materially co-located (propsClash). Wall-hung
 *             filler (wallProps, meta.wall) is already nudged/dropped by
 *             resolveWallClashes inside spec(), so remaining CLASH lines are
 *             authored pairs — either a real overlap to fix or a deliberate
 *             co-location to whitelist in CLASH_OK below.
 */
import { MAIN_TEMPLATES, propsClash, CLASH_OK } from '../src/world/templates';
import { clearDoorLanes } from '../src/world/spec';
import { MODEL_FOR } from '../src/world/modelLibrary';
import { SeedStreams } from '../src/engine/rng';
import type { PropSpec } from '../src/world/spec';

const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
let drops = 0, orphans = 0, clips = 0, clashes = 0;

function clashOk(a: string, b: string) {
  return CLASH_OK.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

/* Half extents [hx, hz] for a prop, rotated by yaw. */
function footprint(p: PropSpec): [number, number] {
  const m = MODEL_FOR[p.kind as keyof typeof MODEL_FOR];
  if (!m || !m.collider || m.collider[0] === 0) return [0.25, 0.25];
  const [cw, , cd] = m.collider;
  const yaw = p.yaw ?? 0;
  const quarter = Math.round(yaw / (Math.PI / 2));
  const snapped = Math.abs(quarter * Math.PI * 0.5 - yaw) < 0.05;
  const swap = snapped && Math.abs(quarter) % 2 === 1;
  return swap ? [cd / 2, cw / 2] : [cw / 2, cd / 2];
}

for (const t of MAIN_TEMPLATES) {
  const orphanSeen = new Set<string>();
  for (const s of seeds) {
    const spec = t.build(new SeedStreams(s).roomStream('test', 1));
    const before = spec.props.slice();
    clearDoorLanes(spec);
    for (const p of before.filter((p) => !spec.props.includes(p))) {
      console.log(`DROP ${t.id} seed=${s} kind=${p.kind} x=${p.x.toFixed(2)} z=${p.z.toFixed(2)} y=${p.y}`);
      drops++;
    }

    const spec2 = t.build(new SeedStreams(s).roomStream('test', 1));
    const hidingBefore = spec2.hiding.slice();
    clearDoorLanes(spec2);
    for (const h of hidingBefore.filter((h) => !spec2.hiding.includes(h))) {
      console.log(`HIDEDROP ${t.id} seed=${s} kind=${h.kind} x=${h.x} z=${h.z}`);
    }
    // mirror instantiate()'s backstop: orphan spots get propKind furniture
    // spawned. Report each template's backstopped spot once (informational —
    // the room works, but explicit furniture would be better dressing).
    for (const h of spec2.hiding) {
      const near = spec2.props.some(
        (p) => Math.hypot(p.x - h.x, p.z - h.z) <= 1.3 && (p.y ?? 0) < 0.2,
      );
      if (!near) {
        const key = `${t.id}:${h.x.toFixed(1)},${h.z.toFixed(1)}`;
        if (!orphanSeen.has(key)) {
          orphanSeen.add(key);
          console.log(`ORPHAN ${t.id} hide=${h.kind}(${h.x.toFixed(2)},${h.z.toFixed(2)}) -> backstop spawns ${h.propKind}`);
          orphans++;
        }
        spec2.props.push({ kind: h.propKind, x: h.x, z: h.z, yaw: h.yaw });
      }
    }
    for (const p of spec2.props) {
      const m = MODEL_FOR[p.kind as keyof typeof MODEL_FOR];
      if (!m || !m.collider || m.collider[0] === 0) continue;
      const [hw, hd] = footprint(p);
      const ox = spec2.width / 2 - Math.abs(p.x) - hw;
      const oz = spec2.depth / 2 - Math.abs(p.z) - hd;
      if (ox < -0.05 || oz < -0.05) {
        console.log(`CLIP ${t.id} seed=${s} ${p.kind} x=${p.x.toFixed(2)} z=${p.z.toFixed(2)} room=${spec2.width}x${spec2.depth} margin x=${ox.toFixed(2)} z=${oz.toFixed(2)}`);
        clips++;
      }
    }
    // CLASH: fixed-vs-fixed pairs only — wallProps filler is already
    // resolved inside spec() by resolveWallClashes.
    const floorProps = spec2.props.filter((p) => (p.y ?? 0) < 1.9 && !p.meta?.wall);
    for (let i = 0; i < floorProps.length; i++) {
      for (let j = i + 1; j < floorProps.length; j++) {
        const a = floorProps[i], b = floorProps[j];
        if (clashOk(a.kind, b.kind)) continue;
        if (!propsClash(a, b)) continue;
        console.log(
          `CLASH ${t.id} seed=${s} ${a.kind}(${a.x.toFixed(2)},${a.z.toFixed(2)}) vs ${b.kind}(${b.x.toFixed(2)},${b.z.toFixed(2)})`,
        );
        clashes++;
      }
    }
  }
}
console.log(`--- drops=${drops} orphans=${orphans} clips=${clips} clashes=${clashes}`);
