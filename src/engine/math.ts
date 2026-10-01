/**
 * Math + collision primitives shared by world, player, and entities.
 * Axis-aligned boxes are the only collision primitive — walls, props,
 * doors, hiding volumes — which keeps the kinematic controller and LOS
 * queries simple and deterministic.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function v3copy(out: Vec3, a: Vec3): Vec3 {
  out.x = a.x; out.y = a.y; out.z = a.z; return out;
}
export function v3set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x; out.y = y; out.z = z; return out;
}
export function v3add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z; return out;
}
export function v3sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out;
}
export function v3scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out.x = a.x * s; out.y = a.y * s; out.z = a.z * s; return out;
}
export function v3len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
export function v3len2D(a: Vec3): number {
  return Math.hypot(a.x, a.z);
}
export function v3norm(out: Vec3, a: Vec3): Vec3 {
  const l = v3len(a) || 1;
  out.x = a.x / l; out.y = a.y / l; out.z = a.z / l; return out;
}
export function v3dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
export function v3dist2D(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export function v3lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}
export function v3dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}
export function angleLerp(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angleDamp(current: number, target: number, lambda: number, dt: number): number {
  return angleLerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Axis-aligned bounding box, centered at (cx, cy, cz) with half extents. */
export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export function aabb(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Aabb {
  return { minX: cx - hx, minY: cy - hy, minZ: cz - hz, maxX: cx + hx, maxY: cy + hy, maxZ: cz + hz };
}

export function aabbFromMinMax(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Aabb {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function aabbContainsPoint(b: Aabb, x: number, y: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
}

export function aabbIntersects(a: Aabb, b: Aabb): boolean {
  return (
    a.minX < b.maxX && a.maxX > b.minX &&
    a.minY < b.maxY && a.maxY > b.minY &&
    a.minZ < b.maxZ && a.maxZ > b.minZ
  );
}

export function aabbIntersects2D(a: Aabb, b: Aabb): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/**
 * Ray vs AABB (slab method). Returns entry distance t in [0, maxDist] or -1.
 * Ray direction must be normalized.
 */
export function raycastAabb(origin: Vec3, dir: Vec3, box: Aabb, maxDist: number): number {
  let tmin = 0;
  let tmax = maxDist;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const mn = [box.minX, box.minY, box.minZ];
  const mx = [box.maxX, box.maxY, box.maxZ];
  for (let i = 0; i < 3; i++) {
    const di = d[i];
    if (Math.abs(di) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return -1;
      continue;
    }
    const inv = 1 / di;
    let t1 = (mn[i] - o[i]) * inv;
    let t2 = (mx[i] - o[i]) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin <= maxDist ? tmin : -1;
}

/**
 * Line-of-sight check between two points against a set of AABBs.
 * Returns true when nothing blocks. Eye offsets are baked into from/to.
 */
export function hasLineOfSight(from: Vec3, to: Vec3, blockers: readonly Aabb[]): boolean {
  const dir = v3();
  v3sub(dir, to, from);
  const dist = v3len(dir);
  if (dist < 1e-6) return true;
  v3norm(dir, dir);
  // Shrink the tested segment by a small epsilon at both ends so the ray
  // doesn't collide with a box the endpoints sit inside.
  const eps = 0.05;
  for (const b of blockers) {
    const t = raycastAabb(from, dir, b, dist - eps);
    if (t >= 0 && t < dist - eps) return false;
  }
  return true;
}

/** Distance from point to segment (2D, XZ plane). */
export function distToSegment2D(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-9) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/**
 * Move a circle (player capsule cross-section) through a field of AABBs in
 * the XZ plane with sliding. Applies penetration resolution iteratively.
 * Mutates and returns `pos`. Only boxes whose Y range overlaps
 * [footY, footY+height] act as blockers.
 */
export function slideMove2D(
  pos: Vec3,
  moveX: number,
  moveZ: number,
  radius: number,
  height: number,
  blockers: readonly Aabb[],
): Vec3 {
  pos.x += moveX;
  resolveAxis(pos, radius, height, blockers, 'x');
  pos.z += moveZ;
  resolveAxis(pos, radius, height, blockers, 'z');
  return pos;
}

function resolveAxis(pos: Vec3, radius: number, height: number, blockers: readonly Aabb[], axis: 'x' | 'z'): void {
  const footY = pos.y;
  const headY = pos.y + height;
  for (const b of blockers) {
    if (b.maxY <= footY + 0.01 || b.minY >= headY - 0.01) continue;
    // Expand box by radius and check containment in 2D.
    const minX = b.minX - radius;
    const maxX = b.maxX + radius;
    const minZ = b.minZ - radius;
    const maxZ = b.maxZ + radius;
    if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;
    if (axis === 'x') {
      const pushLeft = pos.x - minX;
      const pushRight = maxX - pos.x;
      pos.x += pushLeft < pushRight ? -pushLeft : pushRight;
    } else {
      const pushNear = pos.z - minZ;
      const pushFar = maxZ - pos.z;
      pos.z += pushNear < pushFar ? -pushNear : pushFar;
    }
  }
}
