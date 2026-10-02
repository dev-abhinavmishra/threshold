/**
 * Procedural decal overlays — canvas-generated alpha textures for grime,
 * stains, posters, and warning stripes. Cheap flat planes placed just off
 * surfaces; deterministic per room via the shared rng.
 */
import * as THREE from 'three';
import type { Rng } from '../engine/rng';

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  draw(ctx);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ---------- grime streak (drips under fixtures / corners) ---------- */

export function grimeStreak(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 256, (ctx) => {
    const drops = 6 + Math.floor(rng.float() * 8);
    for (let i = 0; i < drops; i++) {
      const x = 14 + rng.float() * 100;
      const top = rng.float() * 40;
      const len = 60 + rng.float() * 180;
      const w = 2 + rng.float() * 7;
      const a = 0.10 + rng.float() * 0.22;
      const g = ctx.createLinearGradient(0, top, 0, top + len);
      g.addColorStop(0, `rgba(18,16,12,${a})`);
      g.addColorStop(1, 'rgba(18,16,12,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - w / 2, top, w, len);
    }
  });
}

/* ---------- floor stain blot ---------- */

export function floorStain(rng: Rng): THREE.Texture | null {
  return canvasTex(256, 256, (ctx) => {
    const blobs = 4 + Math.floor(rng.float() * 5);
    for (let i = 0; i < blobs; i++) {
      const x = 70 + rng.float() * 116;
      const y = 70 + rng.float() * 116;
      const r = 22 + rng.float() * 52;
      const a = 0.10 + rng.float() * 0.20;
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, `rgba(14,12,10,${a})`);
      g.addColorStop(0.7, `rgba(14,12,10,${a * 0.5})`);
      g.addColorStop(1, 'rgba(14,12,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + rng.float() * 0.5), rng.float() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/* ---------- poster / notice ---------- */

const POSTER_PALS = [
  { bg: '#b8a888', ink: '#2a2620', band: '#7a2c20' },
  { bg: '#8f9a8e', ink: '#1d211d', band: '#2c4a58' },
  { bg: '#a8947a', ink: '#241f18', band: '#4a3820' },
  { bg: '#7d8494', ink: '#191c22', band: '#6b2f2f' },
];

export function poster(rng: Rng): THREE.Texture | null {
  const pal = POSTER_PALS[Math.floor(rng.float() * POSTER_PALS.length)];
  return canvasTex(128, 176, (ctx) => {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, 128, 176);
    ctx.strokeStyle = 'rgba(20,18,14,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 122, 170);
    ctx.fillStyle = pal.band;
    ctx.fillRect(10, 12, 108, 26);
    ctx.fillStyle = pal.ink;
    // fake headline + body text lines + a figure block
    ctx.fillRect(16, 48, 96, 6);
    for (let i = 0; i < 7; i++) ctx.fillRect(16, 62 + i * 10, 40 + rng.float() * 56, 3);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 138, 42, 26);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(18, 140, 38, 22);
    // corner wear
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 0); ctx.lineTo(0, 22); ctx.fill();
  });
}

/* ---------- cobweb (wall/ceiling corner) ---------- */

export function cobweb(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 128, (ctx) => {
    // Radial web anchored in the top-right corner of the quad.
    const cx = 128, cy = 0;
    ctx.strokeStyle = 'rgba(210,205,190,0.30)';
    const spokes = 7 + Math.floor(rng.float() * 4);
    for (let i = 0; i < spokes; i++) {
      const a = (Math.PI / 2) * (i / (spokes - 1)) + (rng.float() - 0.5) * 0.05;
      const r = 118 + rng.float() * 10;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    // sagging arcs between spokes
    for (let ring = 1; ring <= 4; ring++) {
      const rr = ring * 28 + rng.float() * 8;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < spokes; i++) {
        const a0 = (Math.PI / 2) * (i / (spokes - 1));
        const a1 = (Math.PI / 2) * ((i + 0.5) / (spokes - 1));
        const sag = 1.06 + rng.float() * 0.1;
        const x0 = cx - Math.cos(a0) * rr, y0 = cy + Math.sin(a0) * rr;
        const x1 = cx - Math.cos(a1) * rr * sag, y1 = cy + Math.sin(a1) * rr * sag;
        if (i === 0) ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x1, y1, cx - Math.cos((Math.PI / 2) * ((i + 1) / (spokes - 1))) * rr, cy + Math.sin((Math.PI / 2) * ((i + 1) / (spokes - 1))) * rr);
      }
      ctx.stroke();
    }
  });
}

/* ---------- night exterior seen through windows ---------- */

export function nightBackdrop(rng: Rng): THREE.Texture | null {
  return canvasTex(256, 192, (ctx) => {
    // cold sky gradient, darker at the sill
    const sky = ctx.createLinearGradient(0, 0, 0, 192);
    sky.addColorStop(0, '#0a1420');
    sky.addColorStop(0.55, '#0c1a28');
    sky.addColorStop(1, '#05090f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 256, 192);
    // distant skyline silhouettes
    for (let layer = 0; layer < 2; layer++) {
      const base = 110 + layer * 30;
      ctx.fillStyle = layer === 0 ? '#0d1520' : '#070c14';
      let x = -10;
      while (x < 266) {
        const bw = 18 + rng.float() * 34;
        const bh = 30 + rng.float() * 62;
        ctx.fillRect(x, base - bh, bw, bh + 84);
        x += bw + rng.float() * 14;
      }
    }
    // sparse lit windows — a couple of amber, a couple of cold
    for (let i = 0; i < 26; i++) {
      const warm = rng.bool(0.4);
      ctx.fillStyle = warm ? `rgba(216,155,74,${0.25 + rng.float() * 0.4})` : `rgba(150,178,205,${0.2 + rng.float() * 0.35})`;
      ctx.fillRect(rng.float() * 250, 60 + rng.float() * 110, 2, 3);
    }
    // faint moon haze top-left
    const moon = ctx.createRadialGradient(48, 34, 2, 48, 34, 46);
    moon.addColorStop(0, 'rgba(180,196,214,0.35)');
    moon.addColorStop(1, 'rgba(180,196,214,0)');
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, 96, 80);
  });
}

/* ---------- warning stripe band ---------- */

export function warningStripe(): THREE.Texture | null {
  return canvasTex(256, 32, (ctx) => {
    ctx.fillStyle = '#c8a018';
    ctx.fillRect(0, 0, 256, 32);
    ctx.fillStyle = '#161310';
    for (let x = -32; x < 288; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 32); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 32);
      ctx.fill();
    }
  });
}

/* ---------- mesh helpers ---------- */

/** Quad in the XY plane — caller positions/orients it onto a surface.
 *  Material + texture are per-mesh; disposeRoom frees them via userData. */
export function decalQuad(tex: THREE.Texture | null, w: number, h: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: tex ?? undefined, transparent: true, roughness: 0.95, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    }),
  );
  mesh.userData.decalMat = true;
  mesh.renderOrder = 2;
  return mesh;
}
