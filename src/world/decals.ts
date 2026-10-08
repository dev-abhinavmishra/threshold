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

/* ---------- damp ceiling stain — water ring bloom ---------- */

export function ceilingDamp(rng: Rng): THREE.Texture | null {
  return canvasTex(256, 256, (ctx) => {
    const cx = 128, cy = 128;
    // wide pale tide ring
    const R = 70 + rng.float() * 40;
    const g0 = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R);
    g0.addColorStop(0, 'rgba(70,60,40,0.05)');
    g0.addColorStop(0.75, 'rgba(70,60,40,0.16)');
    g0.addColorStop(1, 'rgba(70,60,40,0)');
    ctx.fillStyle = g0;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * (0.75 + rng.float() * 0.35), rng.float() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    // irregular darker blotches inside
    const blobs = 3 + Math.floor(rng.float() * 4);
    for (let i = 0; i < blobs; i++) {
      const a = rng.float() * Math.PI * 2;
      const rr = rng.float() * R * 0.5;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const r = 12 + rng.float() * 30;
      const al = 0.14 + rng.float() * 0.22;
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, `rgba(52,44,30,${al})`);
      g.addColorStop(1, 'rgba(52,44,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // hard drip ring edge — the tideline readers recognize
    ctx.strokeStyle = `rgba(48,40,26,${0.16 + rng.float() * 0.14})`;
    ctx.lineWidth = 2 + rng.float() * 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * (0.82 + rng.float() * 0.14), R * (0.66 + rng.float() * 0.3), rng.float() * Math.PI, 0, Math.PI * 2);
    ctx.stroke();
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

/* ---------- wanted notice ---------- */

/** A crew-board wanted sheet — heavy masthead band, one dark portrait
 *  block for the face they are looking for, and tally lines a clerk
 *  would write. Reads "you are named" at a glance. */
export function wantedNotice(rng: Rng): THREE.Texture | null {
  const pal = POSTER_PALS[0];
  return canvasTex(128, 176, (ctx) => {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, 128, 176);
    ctx.strokeStyle = 'rgba(20,18,14,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 122, 170);
    ctx.fillStyle = pal.band;
    ctx.fillRect(8, 8, 112, 30);
    // portrait plate — the face they are looking for
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 48, 60, 52);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(36, 50, 56, 48);
    // tally lines — the debt written out
    ctx.fillStyle = pal.ink;
    for (let i = 0; i < 4; i++) ctx.fillRect(20, 112 + i * 12, 46 + rng.float() * 44, 4);
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

/* ---------- gore / violence decals ---------- */

/** Dried pool — dark radial blobs, irregular rim, a couple of stray drops. */
export function bloodPool(rng: Rng): THREE.Texture | null {
  return canvasTex(256, 256, (ctx) => {
    const cx = 128, cy = 128;
    const lobes = 5 + Math.floor(rng.float() * 5);
    for (let i = 0; i < lobes; i++) {
      const a = rng.float() * Math.PI * 2;
      const d = rng.float() * 46;
      const r = 26 + rng.float() * 44;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
      g.addColorStop(0, 'rgba(58,10,8,0.85)');
      g.addColorStop(0.72, 'rgba(44,8,6,0.55)');
      g.addColorStop(1, 'rgba(44,8,6,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.55 + rng.float() * 0.45), rng.float() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // darker crusted center
    const c2 = ctx.createRadialGradient(cx, cy, 4, cx, cy, 52);
    c2.addColorStop(0, 'rgba(30,5,4,0.9)');
    c2.addColorStop(1, 'rgba(30,5,4,0)');
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.fill();
    // stray droplets
    for (let i = 0; i < 14; i++) {
      const a = rng.float() * Math.PI * 2, d = 60 + rng.float() * 60;
      ctx.fillStyle = `rgba(50,9,7,${0.35 + rng.float() * 0.4})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + rng.float() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Dragged smear — something pulled across the floor; tapering streaks. */
export function bloodSmear(rng: Rng): THREE.Texture | null {
  return canvasTex(256, 128, (ctx) => {
    const streaks = 6 + Math.floor(rng.float() * 5);
    for (let i = 0; i < streaks; i++) {
      const y0 = 20 + rng.float() * 88;
      const w0 = 6 + rng.float() * 16;
      const len = 120 + rng.float() * 120;
      const bend = (rng.float() - 0.5) * 26;
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, `rgba(52,9,7,${0.55 + rng.float() * 0.3})`);
      g.addColorStop(0.75, 'rgba(42,8,6,0.25)');
      g.addColorStop(1, 'rgba(42,8,6,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.quadraticCurveTo(len * 0.5, y0 + bend, len, y0 + bend * 1.4 + w0 * 0.2);
      ctx.lineTo(len, y0 + bend * 1.4 - w0 * 0.2);
      ctx.quadraticCurveTo(len * 0.5, y0 + bend + w0 * 0.8, 0, y0 + w0);
      ctx.fill();
    }
  });
}

/** Claw gouges down a wall — parallel torn slashes. */
export function scratchMarks(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 192, (ctx) => {
    const claws = 3 + Math.floor(rng.float() * 3);
    const x0 = 30 + rng.float() * 30;
    for (let i = 0; i < claws; i++) {
      const x = x0 + i * (10 + rng.float() * 8);
      const len = 100 + rng.float() * 80;
      const drift = (rng.float() - 0.5) * 22;
      const g = ctx.createLinearGradient(0, 8, 0, 8 + len);
      g.addColorStop(0, 'rgba(30,22,16,0)');
      g.addColorStop(0.12, `rgba(28,20,14,${0.5 + rng.float() * 0.3})`);
      g.addColorStop(0.85, 'rgba(24,16,12,0.35)');
      g.addColorStop(1, 'rgba(24,16,12,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.quadraticCurveTo(x + drift, 8 + len * 0.55, x + drift * 0.6, 8 + len);
      ctx.lineTo(x + drift * 0.6 + 2.5, 8 + len);
      ctx.quadraticCurveTo(x + drift + 2.5, 8 + len * 0.55, x + 2.5, 8);
      ctx.fill();
    }
  });
}

/** Cluster of dark hand-prints — somebody grabbed the wall here. */
export function handPrints(rng: Rng): THREE.Texture | null {
  return canvasTex(192, 160, (ctx) => {
    const prints = 3 + Math.floor(rng.float() * 4);
    for (let i = 0; i < prints; i++) {
      const x = 24 + rng.float() * 130;
      const y = 24 + rng.float() * 100;
      const s = 0.7 + rng.float() * 0.7;
      const a = 0.3 + rng.float() * 0.4;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rng.float() - 0.5) * 1.4);
      ctx.scale(s, s);
      ctx.fillStyle = `rgba(40,10,8,${a})`;
      // palm
      ctx.beginPath(); ctx.ellipse(0, 6, 9, 11, 0, 0, Math.PI * 2); ctx.fill();
      // fingers
      for (let f = -2; f <= 2; f++) {
        ctx.beginPath();
        ctx.ellipse(f * 4.4, -7 - Math.abs(f), 2.2, 7 - Math.abs(f) * 1.4, f * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      // thumb
      ctx.beginPath(); ctx.ellipse(-10, 4, 2.6, 6, -0.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  });
}

/** Broken plaster exposing brick — ragged-edged hole with coursed brick
 *  and dark mortar behind the wall skin. */
export function brickPatch(rng: Rng): THREE.Texture | null {
  return canvasTex(192, 160, (ctx) => {
    // brick courses clipped to an irregular blob
    const cx = 96, cy = 80;
    const pts: [number, number][] = [];
    const nPts = 10;
    for (let i = 0; i < nPts; i++) {
      const a = (i / nPts) * Math.PI * 2;
      const r = 46 + rng.float() * 38;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75]);
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < nPts; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#4a3226';
    ctx.fillRect(0, 0, 192, 160);
    // courses
    ctx.fillStyle = '#6b4a36';
    const bh = 12, bw = 30;
    for (let row = 0; row < 14; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let bx = -bw; bx < 192 + bw; bx += bw + 4) {
        ctx.fillRect(bx + off, row * (bh + 3), bw, bh);
      }
    }
    // darken the hole's own shadows
    const sh = ctx.createRadialGradient(cx, cy, 20, cx, cy, 100);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, 192, 160);
    ctx.restore();
    // plaster edge highlight around the break
    ctx.strokeStyle = 'rgba(210,200,180,0.35)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < nPts; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.stroke();
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

/* ---------- peeling wallpaper — torn patch exposing plaster ---------- */

export function peeledWallpaper(rng: Rng): THREE.Texture | null {
  return canvasTex(192, 256, (ctx) => {
    // hanging flap of still-attached paper at the top
    const fw = 60 + rng.float() * 70;
    const fx = 96 - fw / 2 + (rng.float() - 0.5) * 40;
    const fh = 30 + rng.float() * 26;
    // drop shadow under the flap
    const sh = ctx.createLinearGradient(0, fh + 8, 0, fh + 30);
    sh.addColorStop(0, 'rgba(10,8,6,0.4)');
    sh.addColorStop(1, 'rgba(10,8,6,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(fx - 6, fh + 6, fw + 12, 26);
    // ragged plaster exposure beneath the flap
    ctx.beginPath();
    const cx = 96 + (rng.float() - 0.5) * 30;
    const cy = 150 + rng.float() * 40;
    const pr = 55 + rng.float() * 40;
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = pr * (0.65 + rng.float() * 0.55);
      const px = cx + Math.cos(a) * r * 0.85;
      const py = cy + Math.sin(a) * r * 1.15;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#a3937c';
    ctx.fillRect(0, 0, 192, 256);
    // plaster mottling
    for (let i = 0; i < 26; i++) {
      const px = rng.float() * 192;
      const py = rng.float() * 256;
      const r = 6 + rng.float() * 22;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      const c = rng.float() < 0.5 ? '132,118,96' : '190,176,148';
      g.addColorStop(0, `rgba(${c},${0.15 + rng.float() * 0.2})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    // faint lath lines
    ctx.strokeStyle = 'rgba(90,78,60,0.25)';
    ctx.lineWidth = 2;
    for (let y = 60; y < 256; y += 18 + Math.floor(rng.float() * 8)) {
      ctx.beginPath(); ctx.moveTo(cx - pr, y); ctx.lineTo(cx + pr, y + (rng.float() - 0.5) * 4); ctx.stroke();
    }
    ctx.restore();
    // torn paper edge highlight around the patch
    ctx.strokeStyle = 'rgba(214,200,170,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // the curled flap itself — paper face with a darker fold crease
    const flap = ctx.createLinearGradient(fx, 0, fx, fh);
    flap.addColorStop(0, '#7a6a55');
    flap.addColorStop(0.75, '#66584a');
    flap.addColorStop(1, '#4a3e32');
    ctx.fillStyle = flap;
    ctx.fillRect(fx, 2, fw, fh);
    // subtle stripes on the flap so it reads as wallpaper
    ctx.strokeStyle = 'rgba(60,50,40,0.35)';
    ctx.lineWidth = 4;
    for (let x = fx + 6; x < fx + fw; x += 14) {
      ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, fh); ctx.stroke();
    }
    // fold shadow line at flap bottom
    ctx.fillStyle = 'rgba(20,16,10,0.5)';
    ctx.fillRect(fx, fh - 3, fw, 3);
  });
}

/* ---------- muddy footprint trail — staggered pairs fading along a path ---------- */

export function footprintTrail(rng: Rng): THREE.Texture | null {
  return canvasTex(160, 384, (ctx) => {
    const steps = 4 + Math.floor(rng.float() * 4);
    const weave = (rng.float() - 0.5) * 40;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const y = 340 - t * 290 + (rng.float() - 0.5) * 12;
      const x = 80 + Math.sin(t * 2.6) * weave + (i % 2 === 0 ? -26 : 26) + (rng.float() - 0.5) * 10;
      const fade = 0.34 - t * 0.22 + rng.float() * 0.06;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((i % 2 === 0 ? -0.16 : 0.16) + (rng.float() - 0.5) * 0.2);
      // sole: heel blob + ball blob, muddy brown-black
      ctx.fillStyle = `rgba(46,36,24,${fade})`;
      ctx.beginPath(); ctx.ellipse(0, -9, 9, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 11, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
      // dirt speckle around the print
      for (let s = 0; s < 6; s++) {
        ctx.fillStyle = `rgba(46,36,24,${fade * 0.4})`;
        ctx.fillRect((rng.float() - 0.5) * 30, (rng.float() - 0.5) * 34, 2, 2);
      }
      ctx.restore();
    }
  });
}

/* ---------- hairline crack — jagged dark branching polylines ---------- */

export function crackDecal(rng: Rng): THREE.Texture | null {
  return canvasTex(256, 256, (ctx) => {
    const branches = 1 + Math.floor(rng.float() * 3);
    for (let b = 0; b < branches; b++) {
      let x = 40 + rng.float() * 176;
      let y = 20 + rng.float() * 60;
      let ang = Math.PI / 2 + (rng.float() - 0.5) * 1.2;
      const segs = 8 + Math.floor(rng.float() * 12);
      const a = 0.25 + rng.float() * 0.25;
      ctx.strokeStyle = `rgba(22,18,14,${a})`;
      ctx.lineWidth = 1.5 + rng.float() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < segs; s++) {
        ang += (rng.float() - 0.5) * 0.9;
        const len = 8 + rng.float() * 16;
        x += Math.cos(ang) * len;
        y += Math.sin(ang) * len;
        ctx.lineTo(x, y);
        // occasional fork
        if (rng.float() < 0.22 && s > 2) {
          ctx.moveTo(x, y);
          const fa = ang + (rng.bool(0.5) ? 0.8 : -0.8);
          const fl = 10 + rng.float() * 18;
          ctx.lineTo(x + Math.cos(fa) * fl, y + Math.sin(fa) * fl);
          ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
    }
  });
}

/* ---------- rain streaks on glass — thin vertical runnels, slight lean ---------- */

export function rainStreaks(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 256, (ctx) => {
    const lean = (rng.float() - 0.5) * 0.12;
    const n = 14 + Math.floor(rng.float() * 10);
    for (let i = 0; i < n; i++) {
      const x = 6 + rng.float() * 116;
      const y = rng.float() * 200;
      const len = 14 + rng.float() * 60;
      const a = 0.10 + rng.float() * 0.22;
      const g = ctx.createLinearGradient(x, y, x + lean * len, y + len);
      g.addColorStop(0, 'rgba(190,210,225,0)');
      g.addColorStop(0.4, `rgba(190,210,225,${a})`);
      g.addColorStop(1, `rgba(190,210,225,${a * 0.4})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1 + rng.float() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean * len + (rng.float() - 0.5) * 3, y + len);
      ctx.stroke();
      // droplet bead at the runnel head
      ctx.fillStyle = `rgba(200,218,232,${a * 0.9})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.4, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/* ---------- threshold spill (under-door light) ---------- */

/** Warm light seeping under a closed door — a thin horizontal glow strip
 *  whose brightness dies at the edges. Signals "the room inside is already
 *  awake" when the door reads closed. */
export function thresholdSpill(): THREE.Texture | null {
  return canvasTex(128, 40, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(255,196,120,0)');
    g.addColorStop(0.25, 'rgba(255,196,120,0.55)');
    g.addColorStop(0.5, 'rgba(255,214,150,0.9)');
    g.addColorStop(0.75, 'rgba(255,196,120,0.55)');
    g.addColorStop(1, 'rgba(255,196,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 40);
    // fade vertically — brightest at the seam line (top), dying into the floor
    const v = ctx.createLinearGradient(0, 0, 0, 40);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.25, 'rgba(0,0,0,0.55)');
    v.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 128, 40);
    ctx.globalCompositeOperation = 'source-over';
  });
}
