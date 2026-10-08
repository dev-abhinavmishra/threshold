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

/* ---------- worn threshold — the traffic polished the boards ---------- */

export function thresholdWear(rng: Rng): THREE.Texture | null {
  return canvasTex(256, 96, (ctx) => {
    // a polished traffic band down the middle of the strip — dark worn
    // board where every walk crosses, feathering to nothing at the edges
    for (let i = 0; i < 7; i++) {
      const cy = 34 + rng.float() * 28;
      const rx = 90 + rng.float() * 60;
      const ry = 7 + rng.float() * 10;
      const a = 0.10 + rng.float() * 0.14;
      const g = ctx.createRadialGradient(128, cy, 2, 128, cy, rx);
      g.addColorStop(0, `rgba(16,13,10,${a})`);
      g.addColorStop(0.6, `rgba(16,13,10,${a * 0.55})`);
      g.addColorStop(1, 'rgba(16,13,10,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(128, cy);
      ctx.scale(1, ry / rx);
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // scuff drag-lines crossing the band
    ctx.strokeStyle = 'rgba(20,16,12,0.16)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const y = 30 + rng.float() * 36;
      ctx.beginPath();
      ctx.moveTo(30 + rng.float() * 40, y + (rng.float() - 0.5) * 6);
      ctx.quadraticCurveTo(128, y + (rng.float() - 0.5) * 14, 190 + rng.float() * 40, y + (rng.float() - 0.5) * 6);
      ctx.stroke();
    }
    // hard feather top+bottom so the strip never shows a canvas edge
    const v = ctx.createLinearGradient(0, 0, 0, 96);
    v.addColorStop(0, 'rgba(0,0,0,1)');
    v.addColorStop(0.22, 'rgba(0,0,0,0)');
    v.addColorStop(0.78, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 256, 96);
    ctx.globalCompositeOperation = 'source-over';
  });
}

/* ---------- chalk mark — the ones before you scrawled where to hide ---------- */

export function chalkMark(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const chalk = (a: number) => `rgba(232,226,208,${a})`;
    ctx.strokeStyle = chalk(0.55 + rng.float() * 0.25);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.4 + rng.float() * 1.2;
    const wob = () => (rng.float() - 0.5) * 4;
    const variant = rng.int(0, 3);
    if (variant === 0) {
      // tally cluster — 3..5 strokes and a diagonal slash across
      const n = 3 + rng.int(0, 2);
      for (let i = 0; i < n; i++) {
        const x = 24 + i * 10 + wob();
        ctx.beginPath();
        ctx.moveTo(x, 26 + wob());
        ctx.lineTo(x + wob(), 68 + wob());
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(18 + wob(), 60 + wob());
      ctx.lineTo(24 + n * 10 + wob(), 34 + wob());
      ctx.stroke();
    } else if (variant === 1) {
      // arrow — shaft + two-head, pointing a random direction
      const a = rng.float() * Math.PI * 2;
      const cx = 48, cy = 48, r = 26;
      const dx = Math.cos(a), dy = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx - dx * r, cy - dy * r);
      ctx.lineTo(cx + dx * r, cy + dy * r);
      ctx.stroke();
      const ha = 0.5;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * r, cy + dy * r);
        ctx.lineTo(cx + dx * r - Math.cos(a + s * ha) * 12, cy + dy * r - Math.sin(a + s * ha) * 12);
        ctx.stroke();
      }
    } else if (variant === 2) {
      // ringed dot — 'here'
      ctx.beginPath();
      ctx.arc(48, 44, 20 + rng.float() * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = chalk(0.7);
      ctx.beginPath();
      ctx.arc(48, 44, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // a bare X
      ctx.beginPath();
      ctx.moveTo(28 + wob(), 28 + wob());
      ctx.lineTo(68 + wob(), 68 + wob());
      ctx.moveTo(68 + wob(), 28 + wob());
      ctx.lineTo(28 + wob(), 68 + wob());
      ctx.stroke();
    }
    // dust smudge under the strokes
    ctx.fillStyle = chalk(0.05);
    ctx.fillRect(14, 70, 68, 14);
  });
}

/** A dragged chalk/paint arrow scuffed on the floor, pointing +X. */
export function wayArrow(rng: Rng) {
  return canvasTex(128, 96, (ctx) => {
    const chalk = (a: number) => `rgba(235,232,224,${a})`;
    const wob = () => rng.float() * 3 - 1.5;
    ctx.strokeStyle = chalk(0.8);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // shaft — two wobbly strokes like a dragged heel
    ctx.beginPath();
    ctx.moveTo(14, 48 + wob());
    ctx.lineTo(92 + wob() * 2, 46 + wob());
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(18, 52 + wob());
    ctx.lineTo(88 + wob(), 50 + wob());
    ctx.stroke();
    // head
    ctx.globalAlpha = 1;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(74 + wob(), 30 + wob());
    ctx.lineTo(100 + wob(), 48 + wob());
    ctx.lineTo(74 + wob(), 66 + wob());
    ctx.stroke();
    // dust smear behind the tail
    ctx.fillStyle = chalk(0.06);
    ctx.fillRect(8, 58, 60, 16);
  });
}

/** Two heel-drag lines + a smear where the feet left the ground —
 *  the floor remembers someone who didn't walk out. Runs +X. */
export function dragTrail(rng: Rng): THREE.Texture | null {
  return canvasTex(256, 96, (ctx) => {
    const dark = (a: number) => `rgba(40,32,22,${a})`;
    const wob = () => rng.float() * 4 - 2;
    // twin gouges, wobbling, slightly diverging
    for (const side of [-14, 14]) {
      ctx.strokeStyle = dark(0.42);
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(6, 48 + side + wob());
      for (let x = 40; x <= 250; x += 40) ctx.lineTo(x, 48 + side + wob() * 2);
      ctx.stroke();
      // heel chisel marks between the lines
      ctx.strokeStyle = dark(0.3);
      ctx.lineWidth = 3;
      for (let x = 24; x < 230; x += 34 + rng.float() * 18) {
        ctx.beginPath();
        ctx.moveTo(x, 48 + side * 0.6 + wob());
        ctx.lineTo(x + 10, 48 + side * 0.4 + wob());
        ctx.stroke();
      }
    }
    // the smear at the end — where nothing pressed down again
    const smear = ctx.createRadialGradient(240, 48, 4, 240, 48, 30);
    smear.addColorStop(0, dark(0.5));
    smear.addColorStop(1, dark(0));
    ctx.fillStyle = smear;
    ctx.fillRect(200, 8, 56, 80);
  });
}

/** A cluster of pinned house notices — ruled paper, curled corners,
 *  the building's paperwork left up past anyone who could read it. */
export function wallNotice(rng: Rng): THREE.Texture | null {
  return canvasTex(160, 160, (ctx) => {
    const papers = 2 + Math.floor(rng.float() * 2);
    for (let i = 0; i < papers; i++) {
      const x = 20 + i * 34 + (rng.float() - 0.5) * 14;
      const y = 24 + (rng.float() - 0.5) * 20 + i * 10;
      const rot = (rng.float() - 0.5) * 0.22;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      const pw = 42 + rng.float() * 14, ph = 58 + rng.float() * 16;
      // drop shadow + paper (aged stock)
      ctx.fillStyle = 'rgba(20,16,10,0.4)';
      ctx.fillRect(-pw / 2 + 3, -ph / 2 + 4, pw, ph);
      const paper = rng.float();
      ctx.fillStyle = paper < 0.3 ? 'rgba(226,214,186,0.95)' : 'rgba(238,232,216,0.95)';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      // header bar + ruled lines — deliberately unreadable at distance
      ctx.fillStyle = 'rgba(96,60,40,0.75)';
      ctx.fillRect(-pw / 2 + 5, -ph / 2 + 6, pw - 10, 5);
      ctx.fillStyle = 'rgba(70,60,50,0.7)';
      const lines = 4 + Math.floor(rng.float() * 3);
      for (let l = 0; l < lines; l++) {
        const lw = pw - 10 - rng.float() * 16;
        ctx.fillRect(-pw / 2 + 5, -ph / 2 + 16 + l * 8, lw, 2);
      }
      // pin
      ctx.fillStyle = 'rgba(140,40,32,0.95)';
      ctx.beginPath(); ctx.arc(0, -ph / 2 + 3, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  });
}

/** Oxidising streaks bleeding down from a fixture — ochre drips
 *  thinning as they fall. Anchor at top edge. */
export function rustStreak(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 144, (ctx) => {
    const rust = (a: number) => `rgba(120,62,30,${a})`;
    const drips = 3 + Math.floor(rng.float() * 4);
    for (let i = 0; i < drips; i++) {
      const x = 12 + rng.float() * 72;
      const len = 40 + rng.float() * 95;
      const wd = 2.5 + rng.float() * 5;
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, rust(0.55 + rng.float() * 0.2));
      g.addColorStop(1, rust(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      // a drip that wobbles as it falls
      ctx.moveTo(x - wd / 2, 0);
      for (let y = 4; y < len; y += 8) ctx.lineTo(x - wd / 2 + Math.sin(y * 0.3 + i) * 1.5, y);
      for (let y = len; y > 4; y -= 8) ctx.lineTo(x + wd / 2 + Math.sin(y * 0.3 + i) * 1.5, y);
      ctx.lineTo(x + wd / 2, 0);
      ctx.closePath();
      ctx.fill();
      // bead at the head
      ctx.fillStyle = rust(0.5);
      ctx.fillRect(x - wd * 0.9, 0, wd * 1.8, 3);
    }
  });
}

/** The clean rectangle a fallen picture left behind — grime everywhere but
 * the patch the frame covered, a nail still set, dust skirt at the base. */
export function frameGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 120, (ctx) => {
    // aged wall reads through alpha — darken the surround, keep the
    // picture-shaped patch pale like fresh paint the grime never reached.
    ctx.fillStyle = 'rgba(40,32,26,0.28)';
    ctx.fillRect(0, 0, 96, 120);
    const px = 14 + rng.float() * 8, py = 12 + rng.float() * 8;
    const pw = 56 + rng.float() * 14, ph = 66 + rng.float() * 20;
    ctx.fillStyle = 'rgba(210,198,175,0.5)';
    ctx.fillRect(px, py, pw, ph);
    // faint grime bleed along the patch's lower lip
    const g = ctx.createLinearGradient(0, py + ph - 10, 0, py + ph + 10);
    g.addColorStop(0, 'rgba(60,45,32,0)');
    g.addColorStop(1, 'rgba(60,45,32,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(px - 3, py + ph - 8, pw + 6, 16);
    // the nail that held it
    ctx.fillStyle = 'rgba(30,24,20,0.85)';
    ctx.beginPath();
    ctx.arc(px + pw / 2, py - 5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // dust skirt the drop shook loose
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(120,105,88,${0.12 + rng.float() * 0.15})`;
      ctx.fillRect(px - 4 + rng.float() * (pw + 8), py + ph + 8 + rng.float() * 6, 2 + rng.float() * 5, 1.5);
    }
  });
}

/** Ash spill at a cold hearth — pale gray mound ringed by charcoal flecks,
 * thin dust blown out across the floor. */
export function ashPile(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 128, (ctx) => {
    // blown-out dust halo
    const halo = ctx.createRadialGradient(64, 76, 8, 64, 76, 60);
    halo.addColorStop(0, 'rgba(140,135,128,0.30)');
    halo.addColorStop(1, 'rgba(140,135,128,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(64, 76, 60, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    // the mound itself, denser at the grate mouth (top of texture)
    const mound = ctx.createRadialGradient(64, 56, 4, 64, 56, 34);
    mound.addColorStop(0, 'rgba(185,180,170,0.75)');
    mound.addColorStop(0.7, 'rgba(120,115,108,0.5)');
    mound.addColorStop(1, 'rgba(90,85,80,0)');
    ctx.fillStyle = mound;
    ctx.beginPath();
    ctx.ellipse(64, 58, 40, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    // charcoal flecks strewn downhill
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(25,22,20,${0.5 + rng.float() * 0.3})`;
      ctx.fillRect(40 + rng.float() * 52, 34 + rng.float() * 60, 1.5 + rng.float() * 3.5, 1 + rng.float() * 2);
    }
    // a few stray cinders carried outward
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(60,55,50,${0.35 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(20 + rng.float() * 90, 85 + rng.float() * 35, 1 + rng.float() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Count kept in scratches — clusters of four strokes crossed by a fifth,
 * like something tallied the times it checked. */
export function tallyMarks(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const clusters = 1 + Math.floor(rng.float() * 2);
    for (let c = 0; c < clusters; c++) {
      const cx = 14 + c * 34 + rng.float() * 8, cy = 30 + rng.float() * 30;
      const h = 26 + rng.float() * 10;
      for (let i = 0; i < 4; i++) {
        const x = cx + i * 7 + (rng.float() - 0.5) * 2;
        ctx.strokeStyle = `rgba(30,25,22,${0.55 + rng.float() * 0.25})`;
        ctx.lineWidth = 1.4 + rng.float() * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.lineTo(x + (rng.float() - 0.5) * 3, cy + h);
        ctx.stroke();
      }
      // the crossing fifth, drag angle varies
      ctx.strokeStyle = `rgba(28,23,20,${0.6 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy + h * (0.55 + rng.float() * 0.2));
      ctx.lineTo(cx + 26, cy + h * (0.25 + rng.float() * 0.2));
      ctx.stroke();
    }
  });
}

/** What the line above has been feeding — a damp ring with splash edge,
 * dark enough to read wet on any floor. */
export function dampSpot(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const g = ctx.createRadialGradient(48, 48, 4, 48, 48, 42);
    g.addColorStop(0, 'rgba(22,20,18,0.55)');
    g.addColorStop(0.6, 'rgba(28,25,22,0.4)');
    g.addColorStop(1, 'rgba(30,27,24,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(48, 48, 42, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    // splash edge — droplets thrown outward from the impact ring
    for (let i = 0; i < 12; i++) {
      const a = rng.float() * Math.PI * 2, r = 32 + rng.float() * 12;
      ctx.fillStyle = `rgba(20,18,16,${0.35 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(48 + Math.cos(a) * r, 48 + Math.sin(a) * r * 0.9, 1 + rng.float() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // hard wet core
    const core = ctx.createRadialGradient(48, 48, 0, 48, 48, 14);
    core.addColorStop(0, 'rgba(15,14,13,0.65)');
    core.addColorStop(1, 'rgba(15,14,13,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(48, 48, 14, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The arc a door leaf polishes into the floor — a faint band on the
 * leaf's travel, denser where it rests and smears where it snaps shut. */
export function swingWear(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 128, (ctx) => {
    const r = 92 + rng.float() * 12;
    const cx = 6, cy = 6;
    // quarter arc from +u edge sweeping toward +v edge
    const a0 = -0.15 + rng.float() * 0.2, a1 = Math.PI / 2 + 0.1 - rng.float() * 0.2;
    ctx.strokeStyle = 'rgba(88,80,70,0.32)';
    ctx.lineWidth = 8 + rng.float() * 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
    // brighter rub where the leaf tip rides most
    ctx.strokeStyle = 'rgba(96,88,76,0.28)';
    ctx.lineWidth = 3 + rng.float() * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + (rng.float() - 0.5) * 8, a0 + 0.2, a1 - 0.15);
    ctx.stroke();
    // smear at the closed end
    ctx.fillStyle = 'rgba(80,72,62,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, 10, 4, a0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The dust shadow — a faintly cleaner patch of wall where tall
 * furniture has stood for years, edged with the grime that built up
 * around it. */
export function dustShadow(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    // grime halo around the clean patch
    ctx.fillStyle = 'rgba(48,44,38,0.30)';
    ctx.beginPath();
    ctx.roundRect(6, 6, 84, 116, 8);
    ctx.fill();
    // the protected area — lighter than the wall around it
    ctx.fillStyle = 'rgba(198,190,172,0.20)';
    ctx.beginPath();
    ctx.roundRect(14, 12, 68, 104, 4);
    ctx.fill();
    // dust line where the top edge of the furniture sat
    ctx.fillStyle = 'rgba(60,54,46,0.25)';
    ctx.fillRect(12, 10 + rng.float() * 6, 72, 3);
  });
}

/** The votive — a guttered candle stub in a wax pool with scattered
 * petals or paper flecks, left where something waited. */
export function votiveWax(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // wax pool, irregular edge
    ctx.fillStyle = 'rgba(196,188,164,0.42)';
    ctx.beginPath();
    ctx.ellipse(48, 50, 26 + rng.float() * 8, 20 + rng.float() * 7, rng.float(), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,202,178,0.35)';
    ctx.beginPath();
    ctx.ellipse(48, 50, 14 + rng.float() * 5, 11 + rng.float() * 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // candle stub
    ctx.fillStyle = 'rgba(214,205,180,0.85)';
    ctx.fillRect(44, 38, 8, 14);
    ctx.fillStyle = 'rgba(60,55,48,0.8)';
    ctx.fillRect(47, 36, 2, 4);
    // petals / flecks scattered outward
    for (let i = 0; i < 9; i++) {
      const a = rng.float() * Math.PI * 2, rr = 30 + rng.float() * 16;
      ctx.fillStyle = rng.bool(0.5) ? 'rgba(140,70,60,0.4)' : 'rgba(190,180,160,0.35)';
      ctx.beginPath();
      ctx.ellipse(48 + Math.cos(a) * rr, 50 + Math.sin(a) * rr, 2.5, 1.5, a, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** The corner scuff — a crescent smear where bodies cut the turn hard:
 * sole-drag arcs and a low heel-mark at the wall base. */
export function cornerScuff(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 128, (ctx) => {
    // sweeping arc around the corner (texture corner at 8,8 = wall corner)
    const cx = 8, cy = 8;
    ctx.strokeStyle = 'rgba(58,52,44,0.35)';
    for (let i = 0; i < 4; i++) {
      ctx.lineWidth = 5 + rng.float() * 4;
      const r = 46 + i * 12 + rng.float() * 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0.05 + rng.float() * 0.2, Math.PI / 2 - rng.float() * 0.15);
      ctx.stroke();
    }
    // heel digs along the sweep
    for (let i = 0; i < 5; i++) {
      const a = 0.1 + rng.float() * 1.3;
      const r = 50 + rng.float() * 50;
      ctx.fillStyle = 'rgba(46,40,34,0.4)';
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4, 2, a + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** The patch — a repair the house remembers: a pale plaster plug with a
 * hairline crack ring, where the wall was punched through and mended. */
export function patchPlug(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const n = 2 + Math.floor(rng.float() * 3);
    for (let i = 0; i < n; i++) {
      const x = 20 + rng.float() * 56, y = 20 + rng.float() * 56;
      const r = 7 + rng.float() * 9;
      // hairline ring of the old wound
      ctx.strokeStyle = 'rgba(52,48,42,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r + 4, rng.float(), Math.PI * (1 + rng.float()));
      ctx.stroke();
      // one or two stress cracks running off it
      const a = rng.float() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4));
      ctx.lineTo(x + Math.cos(a) * (r + 4 + 8 + rng.float() * 14), y + Math.sin(a) * (r + 4 + 8 + rng.float() * 14));
      ctx.stroke();
      // the plug itself — paler, slightly proud
      ctx.fillStyle = 'rgba(180,172,152,0.32)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(196,188,168,0.22)';
      ctx.beginPath();
      ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** The old number — a painted room numeral over a door, the one before
 * it scratched out beneath: the hotel renumbered its rooms once. */
export function oldNumber(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // current number — faded stencil digits
    const digits = String(10 + Math.floor(rng.float() * 88));
    ctx.fillStyle = 'rgba(165,155,135,0.30)';
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.fillText(digits, 48, 44);
    // worn speckle across the strokes
    for (let i = 0; i < 26; i++) {
      ctx.clearRect(30 + rng.float() * 36, 20 + rng.float() * 22, 2 + rng.float() * 3, 1 + rng.float() * 2);
    }
    // the earlier number — scratched over, barely there
    ctx.fillStyle = 'rgba(120,110,95,0.20)';
    ctx.font = '24px serif';
    ctx.fillText(String(1 + Math.floor(rng.float() * 9)) + digits[1], 48, 74);
    ctx.strokeStyle = 'rgba(70,64,55,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(32 + rng.float() * 6, 62 + rng.float() * 12);
      ctx.lineTo(58 + rng.float() * 6, 58 + rng.float() * 12);
      ctx.stroke();
    }
  });
}

/** The nail row — where the coat hooks hung: a run of small nail holes
 * with a sag shadow under each, and torn plaster where one was ripped. */
export function nailRow(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 96, (ctx) => {
    const n = 5 + Math.floor(rng.float() * 4);
    const x0 = 14 + rng.float() * 10, y = 40 + rng.float() * 16;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (14 + rng.float() * 4);
      // sag shadow — grime dragged down under the old hook
      ctx.fillStyle = 'rgba(52,47,40,0.28)';
      ctx.fillRect(x - 1, y, 2, 14 + rng.float() * 14);
      // the hole itself
      ctx.fillStyle = 'rgba(38,34,29,0.6)';
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      // one hook ripped out: ragged plaster tear
      if (i === 2 && rng.bool(0.7)) {
        ctx.fillStyle = 'rgba(168,160,142,0.35)';
        ctx.beginPath();
        ctx.arc(x + 4, y + 2, 5 + rng.float() * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,55,48,0.4)';
        ctx.stroke();
      }
    }
  });
}

/** The fan sheds — a dust ring on the floor under the blades: what the
 * spin throws off collects in a halo at the drop point. */
export function dustFall(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // faint full halo
    ctx.strokeStyle = 'rgba(140,130,112,0.20)';
    ctx.lineWidth = 10 + rng.float() * 6;
    ctx.beginPath();
    ctx.arc(48, 48, 30 + rng.float() * 8, 0, Math.PI * 2);
    ctx.stroke();
    // heavier flecks where dust settled
    for (let i = 0; i < 14; i++) {
      const a = rng.float() * Math.PI * 2, rr = 24 + rng.float() * 18;
      ctx.fillStyle = `rgba(120,112,96,${0.2 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(48 + Math.cos(a) * rr, 48 + Math.sin(a) * rr, 1 + rng.float() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // pale drift center (dust walks inward)
    ctx.fillStyle = 'rgba(150,140,122,0.12)';
    ctx.beginPath();
    ctx.arc(48, 48, 14, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The traffic lane — the pale worn strip feet make on a route walked
 * ten thousand times: slight sheen, dragged edges, gaps where boards
 * took the wear instead. */
export function wornLane(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 256, (ctx) => {
    // long soft lane down v
    for (let i = 0; i < 22; i++) {
      const t = i / 22;
      const w = 26 + Math.sin(t * Math.PI) * 14 + rng.float() * 6;
      ctx.fillStyle = `rgba(150,142,126,${0.05 + rng.float() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(64 + (rng.float() - 0.5) * 10, 20 + t * 216, w / 2, 10 + rng.float() * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // edge drags
    ctx.strokeStyle = 'rgba(120,112,98,0.14)';
    for (let s = -1; s <= 1; s += 2) {
      ctx.lineWidth = 3 + rng.float() * 3;
      ctx.beginPath();
      ctx.moveTo(64 + s * 16, 30);
      ctx.quadraticCurveTo(64 + s * (20 + rng.float() * 6), 128, 64 + s * 16, 226);
      ctx.stroke();
    }
  });
}

/** The inspection stamp — a faded ink seal beside the door frame: ring,
 * tick, and a year nobody remembers. The house's last clean bill. */
export function inspectionStamp(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    ctx.strokeStyle = 'rgba(70,80,110,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(48, 46, 26 + rng.float() * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(48, 46, 20 + rng.float() * 3, 0, Math.PI * 2);
    ctx.stroke();
    // the tick
    ctx.strokeStyle = 'rgba(70,80,110,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(38, 46);
    ctx.lineTo(45, 54);
    ctx.lineTo(60, 36);
    ctx.stroke();
    // year line beneath
    ctx.fillStyle = 'rgba(70,80,110,0.3)';
    ctx.font = '11px serif';
    ctx.textAlign = 'center';
    ctx.fillText(`19${40 + Math.floor(rng.float() * 50)}`, 48, 88);
    // ink blur wear
    for (let i = 0; i < 18; i++) {
      ctx.clearRect(22 + rng.float() * 52, 16 + rng.float() * 60, 3, 1 + rng.float() * 2);
    }
  });
}

/** The mouth it eats from — a chewed arch at the baseboard line, dark
 * inside, crumbs and gnaw-marks scattered at the threshold. */
export function mouseHole(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // chewed opening — irregular dark arch
    ctx.fillStyle = 'rgba(28,24,20,0.9)';
    ctx.beginPath();
    ctx.moveTo(30, 88);
    ctx.quadraticCurveTo(30, 66, 48, 64);
    ctx.quadraticCurveTo(66, 66, 66, 88);
    ctx.closePath();
    ctx.fill();
    // gnawed rim — ragged paler plaster edge
    ctx.strokeStyle = 'rgba(160,150,130,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(28, 88);
    ctx.quadraticCurveTo(28, 63, 48, 61);
    ctx.quadraticCurveTo(68, 63, 68, 88);
    ctx.stroke();
    // tooth nicks
    ctx.fillStyle = 'rgba(140,130,110,0.4)';
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + rng.float() * 0.7);
      ctx.fillRect(48 + Math.cos(a) * 20 - 1, 76 - Math.sin(a) * 14, 3, 3);
    }
    // crumbs scattered out from the hole
    for (let i = 0; i < 9; i++) {
      const dx = (rng.float() - 0.5) * 60;
      const dist = 2 + rng.float() * 14;
      ctx.fillStyle = `rgba(120,105,80,${0.3 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.arc(48 + dx, 88 - dist * rng.float(), 0.8 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** The chase patch — a rectangular cutout in the wall, re-plastered:
 * pale fill inside a hairline border crack where the wall was opened
 * for wire and closed again. */
export function chasePatch(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    const x0 = 24 + rng.float() * 10, y0 = 14 + rng.float() * 12;
    const pw = 34 + rng.float() * 18, ph = 70 + rng.float() * 30;
    // hairline border crack
    ctx.strokeStyle = 'rgba(52,48,42,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, pw, ph);
    // plaster fill — paler than the wall
    ctx.fillStyle = 'rgba(176,168,150,0.22)';
    ctx.fillRect(x0 + 2, y0 + 2, pw - 4, ph - 4);
    // a corner sag where the fill shrank
    ctx.strokeStyle = 'rgba(60,55,48,0.35)';
    ctx.beginPath();
    ctx.moveTo(x0, y0 + ph);
    ctx.lineTo(x0 + pw * 0.4, y0 + ph + 3 + rng.float() * 4);
    ctx.stroke();
    // dust track down from the work
    ctx.fillStyle = 'rgba(140,132,114,0.15)';
    ctx.fillRect(x0 + pw * 0.3, y0 + ph + 4, pw * 0.4, 16 + rng.float() * 12);
  });
}

/** The map nobody trusts — a framed route plan, room blocks and arrows
 * under old glass, and a YOU ARE HERE dot that can't be right. */
export function oldMap(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 96, (ctx) => {
    // frame
    ctx.strokeStyle = 'rgba(90,80,64,0.7)';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, 120, 88);
    // paper
    ctx.fillStyle = 'rgba(196,186,162,0.85)';
    ctx.fillRect(9, 9, 110, 78);
    // room blocks — a corridor spine with rooms off it
    ctx.strokeStyle = 'rgba(80,72,60,0.6)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(18, 40, 92, 10);
    for (let i = 0; i < 6; i++) {
      const rx = 20 + i * 15 + rng.float() * 3;
      ctx.strokeRect(rx, 20 + rng.float() * 8, 10, 14);
      ctx.strokeRect(rx, 56 + rng.float() * 8, 10, 14);
    }
    // stair mark + arrows
    ctx.beginPath();
    ctx.moveTo(20, 34);
    ctx.lineTo(30, 30 + rng.float() * 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(96, 54);
    ctx.lineTo(108, 50 + rng.float() * 6);
    ctx.stroke();
    // YOU ARE HERE — red dot, wrong side of the plan half the time
    ctx.fillStyle = 'rgba(150,40,36,0.75)';
    ctx.beginPath();
    ctx.arc(40 + rng.float() * 48, rng.bool(0.5) ? 32 : 60, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // glass sheen + grime
    ctx.fillStyle = 'rgba(210,215,220,0.10)';
    ctx.beginPath();
    ctx.moveTo(9, 9);
    ctx.lineTo(50, 9);
    ctx.lineTo(20, 87);
    ctx.lineTo(9, 87);
    ctx.fill();
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = 'rgba(60,55,46,0.15)';
      ctx.fillRect(10 + rng.float() * 108, 10 + rng.float() * 76, 2 + rng.float() * 4, 1.5);
    }
  });
}
