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
    // tape — yellowed masking strips on the top corners
    for (const tx of [4, 106]) {
      if (rng.bool(0.75)) {
        ctx.save();
        ctx.translate(tx + 8, 0);
        ctx.rotate((rng.float() - 0.5) * 0.5);
        ctx.fillStyle = 'rgba(198,186,150,0.55)';
        ctx.fillRect(-3, -4, 18, 14);
        ctx.restore();
      }
    }
    // a lifted lower corner — peel shadow with the pale underside
    if (rng.bool(0.45)) {
      const side = rng.bool(0.5) ? 1 : -1;
      const px = side > 0 ? 128 : 0;
      const lift = 14 + rng.float() * 22;
      ctx.fillStyle = 'rgba(12,10,8,0.35)';
      ctx.beginPath();
      ctx.moveTo(px, 176 - lift - 4);
      ctx.lineTo(px, 176);
      ctx.lineTo(px - side * (lift + 8), 176);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(214,206,186,0.85)';
      ctx.beginPath();
      ctx.moveTo(px, 176 - lift);
      ctx.quadraticCurveTo(px - side * lift * 0.6, 176 - lift * 0.4, px - side * (lift + 4), 176);
      ctx.lineTo(px, 176);
      ctx.closePath();
      ctx.fill();
    }
    // torn edge — a bite out of one side
    if (rng.bool(0.3)) {
      const ey = 40 + rng.float() * 110;
      const bite = 4 + rng.float() * 9;
      ctx.clearRect(rng.bool(0.5) ? 0 : 128 - bite, ey, bite, 6 + rng.float() * 14);
    }
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

/** The register — a guest ledger page: ruled lines, neat early
 * signatures, and later entries that stop pretending to be handwriting. */
export function registerPage(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    // paper, pinned, slightly curled shadow
    ctx.fillStyle = 'rgba(198,190,166,0.9)';
    ctx.fillRect(10, 8, 76, 112);
    ctx.fillStyle = 'rgba(40,36,30,0.25)';
    ctx.fillRect(84, 12, 4, 108);
    // pin shadow
    ctx.fillStyle = 'rgba(60,55,48,0.6)';
    ctx.beginPath(); ctx.arc(48, 12, 2.5, 0, Math.PI * 2); ctx.fill();
    // ruled lines
    ctx.strokeStyle = 'rgba(90,84,70,0.4)';
    ctx.lineWidth = 0.8;
    for (let r = 0; r < 13; r++) {
      ctx.beginPath();
      ctx.moveTo(14, 22 + r * 7.5);
      ctx.lineTo(82, 22 + r * 7.5);
      ctx.stroke();
    }
    // signatures — early rows neat wiggles, late rows descend to scrawl
    const rows = 9 + Math.floor(rng.float() * 3);
    for (let r = 0; r < rows; r++) {
      const y = 24 + r * 7.5;
      const degrade = r / rows;
      ctx.strokeStyle = `rgba(52,48,60,${0.6 - degrade * 0.25})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      const n = 5 + rng.float() * 6;
      let x = 16;
      ctx.moveTo(x, y);
      for (let w = 0; w < n; w++) {
        const wx = x + 4 + rng.float() * 4;
        if (degrade < 0.5) {
          ctx.bezierCurveTo(x + 2, y - 3 - rng.float() * 2, wx - 2, y + 2, wx, y - rng.float() * 2);
        } else {
          // scrawl: jagged dips
          ctx.lineTo(wx, y + (rng.float() - 0.5) * 6 * degrade);
        }
        x = wx;
      }
      ctx.stroke();
      // late rows: a date or a tallied cross in the margin
      if (degrade > 0.6 && rng.bool(0.5)) {
        ctx.fillStyle = 'rgba(120,40,36,0.5)';
        ctx.fillRect(78, y - 2, 4, 1);
        ctx.fillRect(80, y - 4, 1, 4);
      }
    }
    // stain corner
    ctx.fillStyle = 'rgba(120,100,70,0.2)';
    ctx.beginPath(); ctx.arc(80, 112, 8, 0, Math.PI * 2); ctx.fill();
  });
}

/** The eviction slip — an official dispossession notice pinned where
 * the guest stopped being a guest: letterhead bar, typed lines, the
 * stamped seal, a name field that was never filled in. */
export function evictionSlip(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    // crisp paper, official — brighter than the wall wants it to be
    ctx.fillStyle = 'rgba(212,206,190,0.92)';
    ctx.fillRect(16, 6, 64, 116);
    ctx.fillStyle = 'rgba(40,36,30,0.28)';
    ctx.fillRect(78, 10, 4, 112);
    // letterhead bar + rules
    ctx.fillStyle = 'rgba(58,54,70,0.75)';
    ctx.fillRect(22, 12, 52, 5);
    ctx.strokeStyle = 'rgba(58,54,70,0.5)';
    ctx.lineWidth = 0.7;
    for (let r = 0; r < 12; r++) {
      ctx.beginPath();
      ctx.moveTo(22, 26 + r * 6.5);
      ctx.lineTo(74 - rng.float() * 14, 26 + r * 6.5);
      ctx.stroke();
    }
    // the name field — typed dots, never filled
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(58,54,70,0.55)';
    ctx.strokeRect(24, 58, 42, 9);
    ctx.setLineDash([]);
    // official seal — a stamped circle, half off the page edge
    ctx.strokeStyle = 'rgba(96,40,36,0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(66, 92, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(66, 92, 7, 0, Math.PI * 2);
    ctx.stroke();
    // torn bottom corner
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillStyle = 'rgba(212,206,190,0.0)';
    ctx.beginPath();
    ctx.moveTo(72, 122);
    ctx.lineTo(80, 108 + rng.float() * 8);
    ctx.lineTo(80, 122);
    ctx.closePath();
    ctx.fill();
    // pin
    ctx.fillStyle = 'rgba(60,55,48,0.7)';
    ctx.beginPath(); ctx.arc(48, 10, 2.2, 0, Math.PI * 2); ctx.fill();
  });
}

/** The repair ticket — a maintenance stub torn off its perforation:
 * stamped job number, scrawled status, a grease thumb where the
 * mechanic held it. */
export function repairTicket(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // tag paper, hung on the wire hole at top-left
    ctx.fillStyle = 'rgba(196,186,158,0.9)';
    ctx.fillRect(8, 14, 80, 70);
    // perforation edge (top) — sawtooth
    ctx.fillStyle = 'rgba(196,186,158,0.0)';
    for (let x = 8; x < 88; x += 6) {
      ctx.clearRect(x, 12, 3, 3);
    }
    // wire hole + string shadow
    ctx.fillStyle = 'rgba(30,26,22,0.8)';
    ctx.beginPath(); ctx.arc(20, 22, 3, 0, Math.PI * 2); ctx.fill();
    // stamped job number — blocky digits
    ctx.fillStyle = 'rgba(48,44,60,0.7)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`NO ${4100 + Math.floor(rng.float() * 900)}`, 28, 30);
    // part lines — printed columns
    ctx.strokeStyle = 'rgba(60,54,46,0.45)';
    ctx.lineWidth = 0.7;
    for (let r = 0; r < 6; r++) {
      ctx.beginPath();
      ctx.moveTo(14, 40 + r * 7);
      ctx.lineTo(82, 40 + r * 7);
      ctx.stroke();
      // checkbox marks, some ticked
      if (rng.bool(0.6)) {
        ctx.fillStyle = 'rgba(96,40,36,0.55)';
        ctx.fillRect(16, 37 + r * 7, 3, 3);
      }
    }
    // the verdict, scrawled — a red slash through the last line
    ctx.strokeStyle = 'rgba(120,40,36,0.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(16, 78 + rng.float() * 2);
    ctx.lineTo(80, 72 + rng.float() * 4);
    ctx.stroke();
    // grease thumbprint — oval smudge bottom-right
    ctx.fillStyle = 'rgba(46,40,32,0.35)';
    ctx.beginPath();
    ctx.ellipse(72, 78, 8, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The photo strip — a booth strip pinned crooked: four frames of a
 * face that reads less like a face each exposure. */
export function photoStrip(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 128, (ctx) => {
    // the strip itself — dark photo paper
    ctx.fillStyle = 'rgba(30,28,30,0.92)';
    ctx.fillRect(8, 8, 32, 114);
    for (let f = 0; f < 4; f++) {
      const y = 12 + f * 28;
      // frame silver border
      ctx.strokeStyle = 'rgba(190,182,170,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(12, y, 24, 24);
      // figure — a head shape that dissolves with each frame
      const fade = f / 3;
      ctx.fillStyle = `rgba(196,190,178,${0.55 - fade * 0.3})`;
      ctx.beginPath();
      ctx.arc(24 + (rng.float() - 0.5) * 4 * f, y + 11 + rng.float() * 3, 5 - fade * 2, 0, Math.PI * 2);
      ctx.fill();
      // scatter/noise takes over the late frames
      const noise = 4 + f * 6;
      for (let i = 0; i < noise; i++) {
        ctx.fillStyle = `rgba(120,112,104,${0.2 + rng.float() * 0.25})`;
        ctx.fillRect(13 + rng.float() * 22, y + 1 + rng.float() * 22, 1.5, 1.5);
      }
      if (f === 3) {
        // last frame — a smear where the head was
        ctx.fillStyle = 'rgba(70,66,72,0.5)';
        ctx.beginPath();
        ctx.ellipse(24, y + 13, 7, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // pin through the top
    ctx.fillStyle = 'rgba(70,64,56,0.8)';
    ctx.beginPath(); ctx.arc(24, 8, 2.2, 0, Math.PI * 2); ctx.fill();
  });
}

/** The dropped glove — someone's hand-shaped belonging left mid-floor:
 * a limp silhouette, fingers curled under, cuff open where it slid off. */
export function droppedGlove(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // glove body — palm oval + four finger stubs + thumb
    ctx.fillStyle = 'rgba(58,48,40,0.85)';
    ctx.beginPath();
    ctx.ellipse(48, 58, 16, 22, 0.15, 0, Math.PI * 2);
    ctx.fill();
    // fingers — stubby rounded bars curled under
    for (let f = 0; f < 4; f++) {
      const fx = 36 + f * 8.5;
      ctx.beginPath();
      ctx.ellipse(fx, 34 - rng.float() * 3, 3.4, 9 - rng.float() * 2, (rng.float() - 0.5) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // thumb sticking out
    ctx.beginPath();
    ctx.ellipse(66, 54, 4, 9, 0.7, 0, Math.PI * 2);
    ctx.fill();
    // cuff opening — lighter rim where the hand slid out
    ctx.strokeStyle = 'rgba(90,76,62,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(48, 78, 13, 5, 0, 0, Math.PI);
    ctx.stroke();
    // fabric sheen + seam stitch lines
    ctx.strokeStyle = 'rgba(80,68,56,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(38 + i * 9, 44);
      ctx.quadraticCurveTo(40 + i * 9, 58, 38 + i * 9, 72);
      ctx.stroke();
    }
    // soft floor shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(50, 84, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The spilled pen — ink spill blooming where it hit, the pen itself
 * dropped beside it at whatever angle the fall left. */
export function inkSpill(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // ink bloom — irregular dark pool, edges feathered
    ctx.fillStyle = 'rgba(30,32,50,0.75)';
    ctx.beginPath();
    const cx = 40, cy = 60;
    ctx.moveTo(cx + 14, cy);
    for (let a = 0; a <= 6.3; a += 0.5) {
      const r = 10 + rng.float() * 7;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8);
    }
    ctx.closePath();
    ctx.fill();
    // satellite spatter — the little drops that flew
    for (let i = 0; i < 8; i++) {
      const a = rng.float() * Math.PI * 2;
      const d = 12 + rng.float() * 18;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 0.6 + rng.float() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // the pen — thin barrel at a fall angle, nib toward the pool
    ctx.save();
    ctx.translate(62, 34);
    ctx.rotate(0.5 + rng.float() * 0.6);
    ctx.fillStyle = 'rgba(52,44,38,0.9)';
    ctx.fillRect(-2, -16, 4, 26);
    ctx.fillStyle = 'rgba(160,140,90,0.8)';
    ctx.fillRect(-1.5, 10, 3, 6);
    ctx.restore();
    // ink trail where it rolled
    ctx.strokeStyle = 'rgba(30,32,50,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(58, 42);
    ctx.quadraticCurveTo(52, 50, 44, 56);
    ctx.stroke();
  });
}

/** The fallen spectacles — glasses cracked on the floorboards: round
 * frames, one lens starred, a temple arm folded wrong. */
export function fallenSpecs(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    ctx.strokeStyle = 'rgba(140,120,80,0.85)';
    ctx.lineWidth = 2;
    // two round rims
    ctx.beginPath(); ctx.arc(36, 54, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(62, 54, 12, 0, Math.PI * 2); ctx.stroke();
    // bridge
    ctx.beginPath();
    ctx.moveTo(48, 54); ctx.lineTo(50, 54);
    ctx.quadraticCurveTo(49, 51, 50, 54);
    ctx.stroke();
    // temple arms — one out, one folded under
    ctx.beginPath();
    ctx.moveTo(24, 52); ctx.lineTo(12, 58 + rng.float() * 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(74, 52); ctx.lineTo(82, 46);
    ctx.stroke();
    // glass shine in the good lens
    ctx.strokeStyle = 'rgba(200,200,210,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(30, 48); ctx.lineTo(40, 60);
    ctx.stroke();
    // starred crack in the right lens
    ctx.strokeStyle = 'rgba(210,210,220,0.6)';
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 5; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(62, 54);
      ctx.lineTo(62 + Math.cos(a) * (5 + rng.float() * 6), 54 + Math.sin(a) * (5 + rng.float() * 6));
      ctx.stroke();
    }
    // floor shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(49, 68, 26, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The glass keeps the wrong room — a dusty mirror that reflects a
 * corridor that isn't this one: a lit doorway far off, and sometimes a
 * figure that isn't you. Portrait-shaped for the mirror panel. */
export function wrongRoom(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 160, (ctx) => {
    // near-black reflective field, dimmer at the edges
    const g = ctx.createRadialGradient(48, 80, 8, 48, 80, 95);
    g.addColorStop(0, 'rgba(38,36,34,1)');
    g.addColorStop(1, 'rgba(10,10,10,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 160);
    // a corridor receding — converging wall lines, floor band
    const vx = 40 + rng.float() * 16;
    ctx.strokeStyle = 'rgba(90,84,74,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 30); ctx.lineTo(vx - 8, 70);
    ctx.moveTo(96, 30); ctx.lineTo(vx + 8, 70);
    ctx.moveTo(0, 150); ctx.lineTo(vx - 12, 118);
    ctx.moveTo(96, 150); ctx.lineTo(vx + 12, 118);
    ctx.stroke();
    // the lit doorway that isn't here — warm rectangle at the far end
    const dw = 12 + rng.float() * 5;
    ctx.fillStyle = 'rgba(196,158,96,0.55)';
    ctx.fillRect(vx - dw / 2, 70, dw, 48);
    ctx.fillStyle = 'rgba(120,92,54,0.5)';
    ctx.fillRect(vx - dw / 2, 70, 2, 48);
    // sometimes: somebody in it — a tall stillness in the light
    if (rng.bool(0.3)) {
      ctx.fillStyle = 'rgba(16,12,10,0.9)';
      const fh = 20 + rng.float() * 6;
      ctx.beginPath();
      ctx.ellipse(vx + (rng.float() - 0.5) * dw * 0.4, 118 - fh / 2, 3, fh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // floor band catching the door light
    ctx.fillStyle = 'rgba(140,110,66,0.18)';
    ctx.beginPath();
    ctx.moveTo(vx - dw, 118); ctx.lineTo(vx + dw, 118);
    ctx.lineTo(vx + dw * 2.6, 160); ctx.lineTo(vx - dw * 2.6, 160);
    ctx.fill();
    // dust on the glass — sheen sweep + speckle, keeps the lie dim
    ctx.fillStyle = 'rgba(200,205,215,0.08)';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(38, 0); ctx.lineTo(10, 160); ctx.lineTo(0, 160);
    ctx.fill();
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(190,185,175,${0.03 + rng.float() * 0.08})`;
      ctx.fillRect(rng.float() * 96, rng.float() * 160, 1 + rng.float() * 2, 1);
    }
  });
}

/** Plaster fall — crumbs scattered under a cracked wall: a dense knot at
 * the baseboard thinning outward, a few bigger chips. */
export function plasterFall(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 10;
    for (let i = 0; i < 40; i++) {
      const d = Math.pow(rng.float(), 1.8);
      const a = rng.float() * Math.PI * 2;
      const r = 4 + rng.float() * 6;
      const t = 60 + rng.float() * 140;
      ctx.fillStyle = `rgba(${t},${t - 8},${t - 24},${0.5 + rng.float() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * d * 38, 30 + Math.sin(a) * d * 26 + d * 20, r * (0.4 + rng.float() * 0.6), r * 0.55, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // a couple of chips with a flat face — broken plate, not gravel
    ctx.fillStyle = 'rgba(185,178,160,0.85)';
    for (let i = 0; i < 3; i++) {
      const bx = cx + (rng.float() - 0.5) * 40, by = 34 + rng.float() * 30;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(rng.float() * Math.PI);
      ctx.fillRect(-5, -2.5, 9 + rng.float() * 5, 4 + rng.float() * 3);
      ctx.restore();
    }
    // dust halo under it all
    ctx.fillStyle = 'rgba(120,112,96,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, 52, 42, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Glass fog — condensation on a pane, milky field with beaded edges;
 * sometimes someone dragged a finger through it from the inside. */
export function glassFog(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    // milky field, denser toward the edges (cold glass, warm room)
    const m = ctx.createLinearGradient(0, 0, 0, 128);
    m.addColorStop(0, 'rgba(196,210,220,0.34)');
    m.addColorStop(1, 'rgba(188,204,214,0.44)');
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, 96, 128);
    const edge = ctx.createRadialGradient(48, 64, 20, 48, 64, 78);
    edge.addColorStop(0, 'rgba(200,214,224,0)');
    edge.addColorStop(1, 'rgba(210,222,230,0.3)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, 96, 128);
    // droplet rings — condensate beading, brighter rim than core
    for (let i = 0; i < 46; i++) {
      const x = rng.float() * 96, y = rng.float() * 128;
      const r = 0.8 + rng.float() * 2.4;
      ctx.strokeStyle = `rgba(228,238,244,${0.12 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const variant = rng.float();
    if (variant < 0.45) {
      // finger-drag: 2-4 arcs wiped clear — the dark night shows through
      const n = 2 + Math.floor(rng.float() * 3);
      for (let i = 0; i < n; i++) {
        const sx = 30 + rng.float() * 36, sy = 44 + rng.float() * 30;
        const len = 14 + rng.float() * 22, dir = rng.float() < 0.5 ? -1 : 1;
        ctx.strokeStyle = 'rgba(10,18,26,0.72)';
        ctx.lineWidth = 3.2 + rng.float() * 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(sx + dir * len * 0.5, sy - len * 0.3, sx + dir * len, sy + len * (0.5 + rng.float() * 0.4));
        ctx.stroke();
        // drip tails the wipe pushed down
        ctx.strokeStyle = 'rgba(220,232,240,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + dir * len, sy + len * 0.6);
        ctx.lineTo(sx + dir * len + dir * 2, sy + len * 0.6 + 10 + rng.float() * 10);
        ctx.stroke();
      }
    } else if (variant < 0.65) {
      // half a hand — heel + two fingers dragged short, not a full print
      ctx.fillStyle = 'rgba(12,20,28,0.6)';
      const hx = 30 + rng.float() * 36, hy = 60 + rng.float() * 26;
      ctx.beginPath();
      ctx.ellipse(hx, hy, 9, 12, rng.float() * 0.6 - 0.3, 0, Math.PI * 2);
      ctx.fill();
      for (let f = 0; f < 3; f++) {
        const fx = hx - 8 + f * 7 + rng.float() * 2;
        ctx.beginPath();
        ctx.ellipse(fx, hy - 14 - rng.float() * 4, 2.6, 5 + rng.float() * 3, 0.1 * (f - 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

/** Moth drift — dead moths and wing dust gathered under a sill. */
export function mothDrift(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // pale dust band, heavier near the wall line (top of the quad)
    const d = ctx.createLinearGradient(0, 0, 0, 64);
    d.addColorStop(0, 'rgba(190,184,168,0.34)');
    d.addColorStop(1, 'rgba(190,184,168,0)');
    ctx.fillStyle = d;
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 14; i++) {
      const x = 4 + rng.float() * 56, y = 4 + rng.float() * rng.float() * 52;
      // a moth: two small wings angled out from a thin body
      ctx.fillStyle = `rgba(${205 + rng.float() * 30},${198 + rng.float() * 26},${180 + rng.float() * 22},${0.5 + rng.float() * 0.35})`;
      const a = rng.float() * Math.PI;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(-1.6, 0, 2.4, 1.3, -0.5, 0, Math.PI * 2);
      ctx.ellipse(1.6, 0, 2.4, 1.3, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,52,40,0.7)';
      ctx.fillRect(-0.5, -2.6, 1, 5.2);
      ctx.restore();
    }
  });
}

/** Ring stains — years of set-down glasses: thin mug rings, one honest
 * spill where something soaked through the varnish. */
export function ringStains(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const n = 2 + Math.floor(rng.float() * 3);
    for (let i = 0; i < n; i++) {
      const x = 20 + rng.float() * 56, y = 20 + rng.float() * 56;
      const r = 7 + rng.float() * 6;
      const a = 0.16 + rng.float() * 0.2;
      // the ring itself — varnish lifted at the water line
      ctx.strokeStyle = `rgba(88,66,40,${a})`;
      ctx.lineWidth = 1.6 + rng.float();
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.85 + rng.float() * 0.2), rng.float() * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      // pale tide mark just outside it
      ctx.strokeStyle = `rgba(190,175,140,${a * 0.7})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(x, y, r + 1.6, (r + 1.6) * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (rng.float() < 0.4) {
      // the spill — irregular bloom, darker at the rim
      const bx = 30 + rng.float() * 36, by = 30 + rng.float() * 36;
      const br = 10 + rng.float() * 10;
      ctx.strokeStyle = 'rgba(78,58,34,0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.35) {
        const rr = br + Math.sin(t * 3 + rng.float() * 3) * 3;
        const px = bx + Math.cos(t) * rr, py = by + Math.sin(t) * rr * 0.8;
        if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(96,74,44,0.1)';
      ctx.beginPath();
      ctx.ellipse(bx, by, br * 0.8, br * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Drain halo — verdigris and rust fanning out from where the water
 * finds its way down: green-blue core ring, oxidised streaks below. */
export function drainHalo(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48, cy = 40;
    // wet sheen field — floor stays darker where it never dries
    const sheen = ctx.createRadialGradient(cx, cy, 4, cx, cy, 44);
    sheen.addColorStop(0, 'rgba(40,48,44,0.4)');
    sheen.addColorStop(1, 'rgba(40,48,44,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, 96, 96);
    // verdigris ring — the copper bloom where water sits
    ctx.strokeStyle = `rgba(82,124,106,${0.3 + rng.float() * 0.2})`;
    ctx.lineWidth = 4 + rng.float() * 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14 + rng.float() * 4, 10 + rng.float() * 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    // oxidised streaks running down-drift
    for (let i = 0; i < 5; i++) {
      const sx = cx - 14 + rng.float() * 28;
      ctx.strokeStyle = `rgba(${120 + rng.float() * 30},${74 + rng.float() * 16},${40 + rng.float() * 14},${0.18 + rng.float() * 0.14})`;
      ctx.lineWidth = 1.4 + rng.float() * 1.6;
      ctx.beginPath();
      ctx.moveTo(sx, cy + 6);
      ctx.quadraticCurveTo(sx + (rng.float() - 0.5) * 6, cy + 16 + rng.float() * 8, sx + (rng.float() - 0.5) * 10, cy + 26 + rng.float() * 14);
      ctx.stroke();
    }
    // dark rim speckle
    for (let i = 0; i < 18; i++) {
      const a = rng.float() * Math.PI * 2, r = 13 + rng.float() * 5;
      ctx.fillStyle = `rgba(30,34,30,${0.3 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75, 0.8 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Waterline — the tide the room survived: a darker line at the top
 * edge of the flood band, sediment settling below it. */
export function waterline(rng: Rng): THREE.Texture | null {
  return canvasTex(256, 96, (ctx) => {
    // the sharp top edge — where the water sat for days
    const wy = 18 + rng.float() * 8;
    ctx.strokeStyle = 'rgba(58,52,38,0.5)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, wy);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, wy + Math.sin(x * 0.05 + rng.float() * 4) * 2.4);
    ctx.stroke();
    // sediment band under it, streaky and uneven
    for (let i = 0; i < 60; i++) {
      const x = rng.float() * 256;
      const top = wy + 2 + rng.float() * 6;
      const len = 8 + rng.float() * rng.float() * 38;
      ctx.strokeStyle = `rgba(${70 + rng.float() * 30},${60 + rng.float() * 26},${40 + rng.float() * 18},${0.06 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.5 + rng.float() * 3;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + (rng.float() - 0.5) * 4, top + len);
      ctx.stroke();
    }
    // efflorescence flecks — salt pushed out of the plaster as it dried
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(190,184,168,${0.08 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(rng.float() * 256, wy + 4 + rng.float() * 40, 1 + rng.float() * 2.5, 0.7 + rng.float(), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Soot stain — the black bloom a dead fire breathed up the wall above
 * its mouth for years: a dark core fingering upward into wisps. */
export function sootStain(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 10;
    // dense core, wide and low
    const core = ctx.createRadialGradient(cx, 108, 4, cx, 108, 40);
    core.addColorStop(0, 'rgba(24,20,16,0.75)');
    core.addColorStop(0.55, 'rgba(26,22,18,0.4)');
    core.addColorStop(1, 'rgba(26,22,18,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 40, 96, 88);
    // smoke fingers rising — darker at root, feathering out
    for (let i = 0; i < 9; i++) {
      const sx = cx + (rng.float() - 0.5) * 30;
      const top = 12 + rng.float() * 40;
      const w = 2.5 + rng.float() * 4;
      const g = ctx.createLinearGradient(0, 108, 0, top);
      g.addColorStop(0, `rgba(28,24,20,${0.35 + rng.float() * 0.2})`);
      g.addColorStop(1, 'rgba(28,24,20,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, 108);
      ctx.quadraticCurveTo(sx + (rng.float() - 0.5) * 10, 60, sx + (rng.float() - 0.5) * 16, top);
      ctx.stroke();
    }
  });
}

/** Slept-in — the sweat-shadow a sleeper leaves on the sheet: a head
 * oval, a shoulder spread, the faint trough of a body that lay too long. */
export function sleptIn(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 160, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 8;
    // yellowed body bloom — biggest at the torso, fading to the knees
    const g = ctx.createRadialGradient(cx, 62, 6, cx, 62, 52);
    g.addColorStop(0, 'rgba(120,104,68,0.28)');
    g.addColorStop(0.6, 'rgba(118,102,66,0.14)');
    g.addColorStop(1, 'rgba(118,102,66,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, 66, 26, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    // the head — a darker oval where a pillow would sit
    ctx.fillStyle = 'rgba(96,80,52,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx + (rng.float() - 0.5) * 6, 20, 11 + rng.float() * 3, 9, (rng.float() - 0.5) * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // the trough — a crease-line down the spine of the mattress
    ctx.strokeStyle = 'rgba(88,74,46,0.22)';
    ctx.lineWidth = 3 + rng.float();
    ctx.beginPath();
    ctx.moveTo(cx + (rng.float() - 0.5) * 4, 40);
    ctx.quadraticCurveTo(cx + (rng.float() - 0.5) * 10, 80, cx + (rng.float() - 0.5) * 8, 126);
    ctx.stroke();
    // hair-strand specks near the pillow mark
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = 'rgba(60,48,34,0.35)';
      ctx.lineWidth = 0.6;
      const hx = cx - 8 + rng.float() * 16, hy = 14 + rng.float() * 12;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + (rng.float() - 0.5) * 6, hy + (rng.float() - 0.5) * 6);
      ctx.stroke();
    }
  });
}

/** Lost letter — a cream envelope dropped face-up: stamp square,
 * three address lines, one bad crease from being stepped over. */
export function lostLetter(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // envelope body — aged cream, slight skew
    ctx.fillStyle = 'rgba(226,214,186,0.92)';
    ctx.fillRect(8, 20, 48, 32);
    ctx.strokeStyle = 'rgba(140,124,96,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 20, 48, 32);
    // flap crease — the V of a sealed envelope
    ctx.beginPath();
    ctx.moveTo(8, 22); ctx.lineTo(32, 38); ctx.lineTo(56, 22);
    ctx.stroke();
    // the stamp — a small dark square, half peeled
    ctx.fillStyle = 'rgba(120,90,80,0.8)';
    ctx.fillRect(46, 24, 7, 7);
    // address lines — uneven ink scrawl, third line trails off
    ctx.strokeStyle = 'rgba(50,44,36,0.7)';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(13, 30); ctx.lineTo(13 + 16 + rng.float() * 6, 30 + (rng.float() - 0.5) * 2);
    ctx.moveTo(13, 36); ctx.lineTo(13 + 20 + rng.float() * 4, 36);
    ctx.moveTo(13, 42); ctx.lineTo(13 + 10 + rng.float() * 8, 42 + (rng.float() - 0.5) * 2);
    ctx.stroke();
    // the crease — a fold scar across a corner
    ctx.strokeStyle = 'rgba(160,148,120,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(10, 50); ctx.lineTo(50 + rng.float() * 4, 22);
    ctx.stroke();
  });
}

/** Fist mark — a punched-wall crater at striking height: dark impact
 * ring, radiating hairline cracks, and the pale bulge where plaster
 * pushed back. */
export function fistMark(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 10;
    const cy = 48 + (rng.float() - 0.5) * 8;
    // the bulge — plaster pushed outward around the blow
    const bulge = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26);
    bulge.addColorStop(0, 'rgba(255,255,255,0)');
    bulge.addColorStop(0.55, 'rgba(236,228,210,0.16)');
    bulge.addColorStop(1, 'rgba(236,228,210,0)');
    ctx.fillStyle = bulge;
    ctx.fillRect(0, 0, 96, 96);
    // the ring — the knuckle circle that took the skin
    ctx.strokeStyle = 'rgba(52,44,34,0.42)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + rng.float() * 2, 0, Math.PI * 2);
    ctx.stroke();
    // the dark center — plaster punched through to lath
    const pit = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8);
    pit.addColorStop(0, 'rgba(38,30,24,0.55)');
    pit.addColorStop(1, 'rgba(38,30,24,0)');
    ctx.fillStyle = pit;
    ctx.fillRect(cx - 9, cy - 9, 18, 18);
    // hairline cracks running off the blow — 4 to 6 of them
    const n = 4 + Math.floor(rng.float() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.float() * 0.5;
      const len = 14 + rng.float() * 22;
      ctx.strokeStyle = 'rgba(70,58,44,0.5)';
      ctx.lineWidth = 0.8 + rng.float() * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
      const mx = cx + Math.cos(a) * len * 0.6, my = cy + Math.sin(a) * len * 0.6;
      ctx.quadraticCurveTo(mx + (rng.float() - 0.5) * 8, my + (rng.float() - 0.5) * 8,
        cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
  });
}

/** Smoke stain — the greasy film a fire leaves on the ceiling: a broad
 * brown-yellow bloom, darkest over the hearth, thinning to nothing. */
export function smokeStain(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 128, (ctx) => {
    const cx = 64 + (rng.float() - 0.5) * 14;
    const cy = 64 + (rng.float() - 0.5) * 14;
    // the bloom — dirty amber, wider than tall, edges feathered
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 58);
    g.addColorStop(0, 'rgba(88,66,40,0.42)');
    g.addColorStop(0.4, 'rgba(96,74,46,0.28)');
    g.addColorStop(0.75, 'rgba(104,82,54,0.12)');
    g.addColorStop(1, 'rgba(104,82,54,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 56, 46 + rng.float() * 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // the hot core — where the column of smoke stood
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
    core.addColorStop(0, 'rgba(58,42,28,0.4)');
    core.addColorStop(1, 'rgba(58,42,28,0)');
    ctx.fillStyle = core;
    ctx.fillRect(cx - 20, cy - 20, 40, 40);
    // soot flecks drifting off the bloom
    for (let i = 0; i < 30; i++) {
      const a = rng.float() * Math.PI * 2, r = 20 + rng.float() * 42;
      ctx.fillStyle = `rgba(70,52,34,${0.06 + rng.float() * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 0.7 + rng.float() * 1.6, 0.7 + rng.float() * 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Under-bed — the things the room kept under the mattress: a shoe-box
 * silhouette, a suitcase corner, the soft rim of gathered dust. */
export function underBed(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // dust rim — the untouched halo under the frame
    const dust = ctx.createRadialGradient(48, 32, 8, 48, 32, 44);
    dust.addColorStop(0, 'rgba(140,130,112,0.3)');
    dust.addColorStop(1, 'rgba(140,130,112,0)');
    ctx.fillStyle = dust;
    ctx.fillRect(0, 0, 96, 64);
    // the box — a shoe-box rectangle pushed to one side
    if (rng.bool(0.75)) {
      const bx = 12 + rng.float() * 20;
      ctx.fillStyle = 'rgba(60,50,40,0.5)';
      ctx.fillRect(bx, 26, 22 + rng.float() * 8, 16);
      ctx.strokeStyle = 'rgba(30,26,20,0.5)';
      ctx.strokeRect(bx, 26, 22, 16);
      ctx.strokeStyle = 'rgba(46,38,30,0.4)'; // lid seam
      ctx.beginPath();
      ctx.moveTo(bx, 30); ctx.lineTo(bx + 22, 30); ctx.stroke();
    }
    // the suitcase — a taller case corner with a strap line
    if (rng.bool(0.5)) {
      const sx = 50 + rng.float() * 24;
      ctx.fillStyle = 'rgba(52,42,34,0.55)';
      ctx.fillRect(sx, 18, 26, 28);
      ctx.strokeStyle = 'rgba(30,24,20,0.55)';
      ctx.strokeRect(sx, 18, 26, 28);
      ctx.beginPath();
      ctx.moveTo(sx + 8, 18); ctx.lineTo(sx + 8, 46); ctx.stroke();
    }
    // dust strands pooling around whatever is under there
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(150,142,124,${0.1 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(rng.float() * 96, 40 + rng.float() * 20, 1 + rng.float() * 3, 0.8 + rng.float() * 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Kick split — the door that was forced once: a vertical split in the
 * leaf skin beside the latch, splinters raised pale, shoe shadow below. */
export function kickSplit(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const cx = 32 + (rng.float() - 0.5) * 6;
    const cy = 55 + (rng.float() - 0.5) * 8;
    // shoe shadow — the dark oval where the sole landed
    const sole = ctx.createRadialGradient(cx, cy + 6, 2, cx, cy + 6, 16);
    sole.addColorStop(0, 'rgba(40,32,24,0.45)');
    sole.addColorStop(1, 'rgba(40,32,24,0)');
    ctx.fillStyle = sole;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, 12, 9, (rng.float() - 0.5) * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // the split — a jag running up from the blow
    ctx.strokeStyle = 'rgba(30,24,18,0.7)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy + 14);
    let px = cx, py = cy + 14;
    while (py > cy - 26) {
      py -= 5 + rng.float() * 6;
      px = cx + (rng.float() - 0.5) * 5;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    // splinters — pale raised slivers flanking the split
    for (let i = 0; i < 7; i++) {
      const sy = cy + 10 - i * 5.5;
      const side = i % 2 === 0 ? 1 : -1;
      ctx.strokeStyle = 'rgba(212,196,160,0.55)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx + side * 1.5, sy);
      ctx.lineTo(cx + side * (4 + rng.float() * 5), sy - 3 - rng.float() * 3);
      ctx.stroke();
    }
    // wood dust at the base of the blow
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(160,140,104,${0.15 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx - 10 + rng.float() * 20, cy + 14 + rng.float() * 6, 0.5 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Scratch writing — the words worked into the glass with a pin or a
 * nail: thin pale strokes, uneven, the pressure changing mid-letter. */
export function scratchWriting(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 96, (ctx) => {
    ctx.strokeStyle = 'rgba(235,235,235,0.75)';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    const line = (x: number, y: number, len: number, tilt: number) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(tilt) * len, y + Math.sin(tilt) * len);
      ctx.stroke();
    };
    // crude block letters spelled one stroke at a time
    const y0 = 30 + (rng.float() - 0.5) * 10;
    let x = 18 + rng.float() * 8;
    const letters = Math.min(4, 2 + Math.floor(rng.float() * 4));
    for (let l = 0; l < letters; l++) {
      const w = 9 + rng.float() * 3, h = 14 + rng.float() * 4;
      const wob = () => (rng.float() - 0.5) * 2.5;
      // left stem
      line(x + wob(), y0, h, Math.PI / 2 + wob() * 0.05);
      // top bar
      if (rng.bool(0.85)) line(x, y0, w, wob() * 0.08);
      // mid bar
      if (rng.bool(0.6)) line(x + wob(), y0 + h * 0.5, w * (0.7 + rng.float() * 0.3), wob() * 0.06);
      // bottom bar / right stem decide the glyph
      if (rng.bool(0.75)) line(x, y0 + h, w, wob() * 0.08);
      if (rng.bool(0.5)) line(x + w, y0, h, Math.PI / 2);
      x += w + 5 + rng.float() * 3;
    }
    // the underline — one long scrape under the word, tailing off
    ctx.strokeStyle = 'rgba(235,235,235,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(14, y0 + 24);
    ctx.quadraticCurveTo(64, y0 + 28 + (rng.float() - 0.5) * 4, 14 + rng.float() * 90, y0 + 26);
    ctx.stroke();
    // stray pin scratches
    for (let i = 0; i < 6; i++) {
      line(10 + rng.float() * 108, 10 + rng.float() * 76, 4 + rng.float() * 10, rng.float() * Math.PI);
    }
  });
}

/** Body outline — the chalk line a count left on the floor where
 * someone was found: a fallen figure drawn in one shaky stroke. */
export function bodyOutline(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 160, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 10;
    ctx.strokeStyle = 'rgba(225,220,205,0.72)';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    // head
    ctx.ellipse(cx, 18, 10, 9, (rng.float() - 0.5) * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    // body + limbs — one continuous outline
    ctx.beginPath();
    ctx.moveTo(cx - 4, 26);
    ctx.lineTo(cx - 16 - rng.float() * 4, 44);          // left arm out
    ctx.lineTo(cx - 20, 62);
    ctx.lineTo(cx - 11, 66);
    ctx.lineTo(cx - 12, 86);                           // left hip
    ctx.lineTo(cx - 14 - rng.float() * 6, 126);        // left leg
    ctx.lineTo(cx - 8, 138);
    ctx.lineTo(cx + 2, 130);                           // between feet
    ctx.lineTo(cx + 6, 140);
    ctx.lineTo(cx + 14 + rng.float() * 4, 134);
    ctx.lineTo(cx + 10, 88);                           // right hip
    ctx.lineTo(cx + 14, 68);                           // right arm across body
    ctx.lineTo(cx + 6, 60);
    ctx.lineTo(cx + 12, 44);
    ctx.lineTo(cx + 4, 26);
    ctx.stroke();
    // the shakiness — a second fainter trace offset a hair
    ctx.strokeStyle = 'rgba(225,220,205,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx + 1.5, 19, 10, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    // chalk dust dribbles off the outline
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(225,220,205,${0.1 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(14 + rng.float() * 70, 20 + rng.float() * 120, 0.4 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Dust date — a date finger-traced through the film on a dusty top:
 * pale wiped strokes in a dark grey field, one year, never finished. */
export function dustDate(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // the film itself — undisturbed dust darkening the wood
    const film = ctx.createRadialGradient(48, 32, 6, 48, 32, 44);
    film.addColorStop(0, 'rgba(120,114,102,0.4)');
    film.addColorStop(1, 'rgba(120,114,102,0)');
    ctx.fillStyle = film;
    ctx.fillRect(0, 0, 96, 64);
    // wiped strokes — the pale wood showing through where a finger drew
    ctx.strokeStyle = 'rgba(226,216,192,0.6)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    const stroke = (x: number, y: number, w: number, h: number, tilt: number) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.5 + (rng.float() - 0.5) * 2,
        x + w, y + h + tilt);
      ctx.stroke();
    };
    // two or three digits, blocky and hesitant
    let x = 22 + rng.float() * 8;
    const digits = 2 + Math.floor(rng.float() * 2);
    for (let i = 0; i < digits; i++) {
      const dw = 10 + rng.float() * 3;
      stroke(x, 20, 0, 14, 0);              // left stem
      if (rng.bool(0.8)) stroke(x, 20, dw, 0, (rng.float() - 0.5) * 2);   // top
      if (rng.bool(0.7)) stroke(x, 34, dw * 0.9, 0, 0);                    // bottom
      if (rng.bool(0.55)) stroke(x + dw, 20, 0, 14, 0);                    // right
      x += dw + 4 + rng.float() * 4;
    }
    // the smear where the hand rested after
    ctx.strokeStyle = 'rgba(226,216,192,0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(20, 48);
    ctx.quadraticCurveTo(48, 52, 72 + rng.float() * 10, 46);
    ctx.stroke();
  });
}

/** Drape ghost — the sun-bleached rectangle a hanging drape spared:
 * the wall kept dark where it hung, pale around the fold edges. */
export function drapeGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 10;
    const gw = 26 + rng.float() * 8;
    // pale surround — years of bleaching except where cloth covered
    const bg = ctx.createRadialGradient(cx, 64, gw * 0.6, cx, 64, gw * 2.2);
    bg.addColorStop(0, 'rgba(240,232,212,0.0)');
    bg.addColorStop(0.75, 'rgba(240,232,212,0.16)');
    bg.addColorStop(1, 'rgba(240,232,212,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 96, 128);
    // the spared strip — the wall's original colour kept vertical
    const strip = ctx.createLinearGradient(cx - gw / 2, 0, cx + gw / 2, 0);
    strip.addColorStop(0, 'rgba(70,60,48,0.05)');
    strip.addColorStop(0.5, 'rgba(70,60,48,0.3)');
    strip.addColorStop(1, 'rgba(70,60,48,0.05)');
    ctx.fillStyle = strip;
    ctx.fillRect(cx - gw / 2, 8, gw, 112);
    // fold shadows — the pleats left stripes within the spared strip
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(56,48,38,${0.08 + rng.float() * 0.1})`;
      ctx.fillRect(cx - gw / 2 + i * (gw / 6) + rng.float(), 8, gw / 9, 112);
    }
    // the hem line — a sharper edge where the drape ended
    ctx.strokeStyle = 'rgba(240,232,212,0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - gw / 2 - 3, 118);
    ctx.lineTo(cx + gw / 2 + 3, 118);
    ctx.stroke();
  });
}

/** Switch polish — the grease halo a decade of hands leaves around a
 * switch or latch: a dark smudge core, a lighter wipe ring. */
export function switchPolish(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32 + (rng.float() - 0.5) * 8;
    const cy = 32 + (rng.float() - 0.5) * 8;
    // wipe ring — the cleaner reached out to here, rarely past it
    const ring = ctx.createRadialGradient(cx, cy, 8, cx, cy, 26);
    ring.addColorStop(0, 'rgba(70,60,46,0)');
    ring.addColorStop(0.7, 'rgba(216,206,184,0.18)');
    ring.addColorStop(1, 'rgba(216,206,184,0)');
    ctx.fillStyle = ring;
    ctx.fillRect(0, 0, 64, 64);
    // the smudge — layered palm-grease, darkest dead centre
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 13);
    core.addColorStop(0, 'rgba(56,46,36,0.5)');
    core.addColorStop(0.6, 'rgba(56,46,36,0.28)');
    core.addColorStop(1, 'rgba(56,46,36,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 17, (rng.float() - 0.5) * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // finger smear trails — the swipe arcs of reaching hands
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(66,55,42,${0.1 + rng.float() * 0.12})`;
      ctx.lineWidth = 2 + rng.float() * 1.5;
      const a = -0.6 + i * 0.24 + rng.float() * 0.1;
      ctx.beginPath();
      ctx.arc(cx, cy + 6, 15 + i, a, a + 0.5 + rng.float() * 0.4);
      ctx.stroke();
    }
  });
}

/** Growth marks — the pencil ticks a parent kept on the door frame:
 * short ruled lines ascending, a year scrawled beside a few. */
export function growthMarks(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 128, (ctx) => {
    ctx.strokeStyle = 'rgba(52,44,34,0.75)';
    ctx.lineCap = 'round';
    let y = 108;
    const ticks = 4 + Math.floor(rng.float() * 5);
    for (let i = 0; i < ticks; i++) {
      const tx = 18 + (rng.float() - 0.5) * 6;
      ctx.lineWidth = 1.3 + rng.float() * 0.5;
      ctx.beginPath();
      ctx.moveTo(tx, y);
      ctx.lineTo(tx + 14 + rng.float() * 6, y + (rng.float() - 0.5) * 1.5);
      ctx.stroke();
      // a tiny year beside one in three
      if (rng.bool(0.35)) {
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(52,44,34,0.5)';
        ctx.beginPath();
        ctx.moveTo(tx + 18, y - 3); ctx.lineTo(tx + 26, y - 3 + rng.float());
        ctx.moveTo(tx + 18, y + 1); ctx.lineTo(tx + 24, y + 1);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(52,44,34,0.75)';
      }
      y -= 12 + rng.float() * 9;
      if (y < 14) break;
    }
    // the last mark sits highest and is freshest — darker, surer
    ctx.strokeStyle = 'rgba(40,34,26,0.85)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(16, y + 4); ctx.lineTo(34, y + 4);
    ctx.stroke();
  });
}

/** Sill damp — the rain the sill kept letting in: damp fans running
 * down from a leak line, tide edge where the plaster stayed wet. */
export function sillDamp(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    const top = 10 + rng.float() * 6;
    // damp fans — soft dark streaks splaying downward
    const fans = 4 + Math.floor(rng.float() * 4);
    for (let i = 0; i < fans; i++) {
      const fx = 12 + (i / fans) * 74 + (rng.float() - 0.5) * 8;
      const flen = 40 + rng.float() * 60;
      const g = ctx.createLinearGradient(fx, top, fx + (rng.float() - 0.5) * 10, top + flen);
      g.addColorStop(0, 'rgba(84,72,56,0.4)');
      g.addColorStop(0.75, 'rgba(96,84,64,0.12)');
      g.addColorStop(1, 'rgba(96,84,64,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(fx - 3, top);
      ctx.lineTo(fx + 3, top);
      ctx.lineTo(fx + 6 + rng.float() * 4, top + flen);
      ctx.lineTo(fx - 6 - rng.float() * 4, top + flen);
      ctx.closePath();
      ctx.fill();
    }
    // the tide edge — a darker wavy line where the wet stopped
    ctx.strokeStyle = 'rgba(70,58,44,0.4)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const tideY = 84 + rng.float() * 20;
    ctx.moveTo(6, tideY);
    for (let x = 6; x < 90; x += 8)
      ctx.quadraticCurveTo(x + 4, tideY + (rng.float() - 0.5) * 5, x + 8, tideY + (rng.float() - 0.5) * 3);
    ctx.stroke();
    // the bloom beneath — plaster that never dried pale
    const bloom = ctx.createLinearGradient(0, tideY, 0, 128);
    bloom.addColorStop(0, 'rgba(160,150,130,0.2)');
    bloom.addColorStop(1, 'rgba(160,150,130,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(6, tideY, 84, 128 - tideY);
    // mineral speckles in the tide
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(200,194,180,${0.12 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.arc(10 + rng.float() * 76, tideY - 4 + rng.float() * 14, 0.5 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Radiator bleed — the rust a sweating radiator runs down the wall:
 * vertical oxidised streaks from pipe height to the baseboard. */
export function radiatorBleed(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // rust fans under each fin — the bleed lines correspond to the
    // vertical ribs the water chose to run down
    const fans = 5 + Math.floor(rng.float() * 4);
    for (let i = 0; i < fans; i++) {
      const fx = 10 + (i / fans) * 78 + (rng.float() - 0.5) * 6;
      const flen = 36 + rng.float() * 44;
      const top = 8 + rng.float() * 6;
      const g = ctx.createLinearGradient(fx, top, fx, top + flen);
      g.addColorStop(0, 'rgba(96,52,30,0.42)');
      g.addColorStop(0.7, 'rgba(112,64,36,0.18)');
      g.addColorStop(1, 'rgba(112,64,36,0)');
      ctx.fillStyle = g;
      ctx.fillRect(fx - 1.4 - rng.float(), top, 3 + rng.float() * 2, flen);
    }
    // the drip line — a darker seam where the bleed pooled at the bottom
    ctx.strokeStyle = 'rgba(88,48,28,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const py = 78 + rng.float() * 8;
    ctx.moveTo(8, py);
    ctx.quadraticCurveTo(48, py + rng.float() * 6, 88, py + (rng.float() - 0.5) * 4);
    ctx.stroke();
    // oxide flecks in the run field
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(120,66,38,${0.12 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.ellipse(8 + rng.float() * 80, 10 + rng.float() * 72, 0.6 + rng.float() * 1.4, 1.2 + rng.float() * 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Burn marks — cigarette and ember scars a carpet keeps: small char
 * rings with ash fringes, clustered where a hand would have dropped. */
export function burnMarks(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 34 + rng.float() * 26;
    const cy = 38 + rng.float() * 20;
    const burns = 2 + Math.floor(rng.float() * 3);
    for (let i = 0; i < burns; i++) {
      const bx = cx + (rng.float() - 0.5) * 34;
      const by = cy + (rng.float() - 0.5) * 30;
      const br = 4 + rng.float() * 4;
      // char pit — melted fibre, nearly black
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, 'rgba(20,16,12,0.75)');
      g.addColorStop(0.65, 'rgba(30,24,18,0.45)');
      g.addColorStop(1, 'rgba(30,24,18,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      // ash fringe — the pale grey crescent where the ember was ground
      ctx.strokeStyle = 'rgba(180,174,160,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by, br + 1, rng.float() * Math.PI, rng.float() * Math.PI + 1.6 + rng.float());
      ctx.stroke();
    }
    // ash dust scattered around the drop zone
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = `rgba(168,160,146,${0.08 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(cx - 18 + rng.float() * 40, cy - 14 + rng.float() * 32, 0.4 + rng.float() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Pane tape — the masking-tape X a wartime house puts on its glass:
 * two cream strips crossing, frayed ends, edges lifting. */
export function paneTape(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    const tape = (x0: number, y0: number, x1: number, y1: number, wdt: number) => {
      // the strip — cream with translucent edges
      ctx.strokeStyle = 'rgba(216,204,178,0.55)';
      ctx.lineWidth = wdt;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // torn edge shading along one side
      ctx.strokeStyle = 'rgba(150,138,116,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + wdt * 0.4, y0);
      ctx.lineTo(x1 + wdt * 0.4, y1);
      ctx.stroke();
      // frayed ends — ragged little flags past the glass edge
      ctx.strokeStyle = 'rgba(216,204,178,0.7)';
      ctx.lineWidth = wdt * 0.55;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + (rng.float() - 0.5) * 6, y1 + (rng.float() - 0.5) * 6);
      ctx.stroke();
    };
    tape(6, 6, 88, 122, 5 + rng.float() * 2);
    tape(88, 8, 10, 120, 5 + rng.float() * 2);
    // the cross point — a dab where they overlap
    ctx.fillStyle = 'rgba(216,204,178,0.5)';
    ctx.beginPath();
    ctx.arc(47 + (rng.float() - 0.5) * 6, 64, 4, 0, Math.PI * 2);
    ctx.fill();
    // lifting corners — tiny gaps where tape peeled off
    for (const [px, py] of [[8, 8], [86, 10], [10, 118]]) {
      if (rng.bool(0.5)) {
        ctx.fillStyle = 'rgba(40,36,30,0.25)';
        ctx.beginPath();
        ctx.ellipse(px, py, 3, 2, rng.float(), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

/** Wax sheen — the half-moons a polisher left at a threshold: soft
 * overlapping arcs of sheen where the floor was last buffed. */
export function waxSheen(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 96, (ctx) => {
    // polish arcs — overlapping crescents, pale sheen
    const arcs = 5 + Math.floor(rng.float() * 4);
    for (let i = 0; i < arcs; i++) {
      const ax = 20 + i * (88 / arcs) + (rng.float() - 0.5) * 8;
      const ay = 30 + rng.float() * 36;
      const ar = 14 + rng.float() * 12;
      ctx.strokeStyle = `rgba(230,222,200,${0.12 + rng.float() * 0.12})`;
      ctx.lineWidth = 5 + rng.float() * 4;
      ctx.beginPath();
      ctx.arc(ax, ay, ar, Math.PI + (rng.float() - 0.5) * 0.5, Math.PI * 2 + (rng.float() - 0.5) * 0.3);
      ctx.stroke();
    }
    // the haze — broad soft sheen field under the arcs
    const haze = ctx.createRadialGradient(64, 52, 10, 64, 52, 56);
    haze.addColorStop(0, 'rgba(230,222,200,0.1)');
    haze.addColorStop(1, 'rgba(230,222,200,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, 128, 96);
    // the dry edge — where the wax wasn't reached
    ctx.strokeStyle = 'rgba(90,80,64,0.2)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(10, 82);
    ctx.quadraticCurveTo(64, 86 + rng.float() * 6, 118, 80);
    ctx.stroke();
  });
}

/** Vent dust — the breath a grille never stops exhaling: a dark halo
 * around the fixture and a down-drift of sooty air. */
export function ventDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // halo — dust settled around the frame
    const g = ctx.createRadialGradient(48, 34, 6, 48, 34, 40);
    g.addColorStop(0, 'rgba(30,26,22,0.4)');
    g.addColorStop(0.7, 'rgba(30,26,22,0.18)');
    g.addColorStop(1, 'rgba(30,26,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // down-drift — the soft column of carried dust under the vent
    const dd = ctx.createLinearGradient(48, 40, 48, 92);
    dd.addColorStop(0, 'rgba(30,26,22,0.22)');
    dd.addColorStop(1, 'rgba(30,26,22,0)');
    ctx.fillStyle = dd;
    const dw = 16 + rng.float() * 12;
    ctx.fillRect(48 - dw / 2, 40, dw, 52);
    // streak teeth — separate faint fingers in the drift
    for (let i = 0; i < 6; i++) {
      const sx = 42 + rng.float() * 14;
      ctx.fillStyle = `rgba(30,26,22,${0.1 + rng.float() * 0.12})`;
      ctx.fillRect(sx, 44, 1.4 + rng.float(), 40 + rng.float() * 10);
    }
    // settled grit in the halo band
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(34,30,26,${0.15 + rng.float() * 0.2})`;
      const a = rng.float() * Math.PI * 2;
      const r = 22 + rng.float() * 18;
      ctx.beginPath();
      ctx.arc(48 + Math.cos(a) * r, 34 + Math.sin(a) * r * 0.6, 0.5 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Heel scuff — the black arcs boots leave along a baseboard when
 * feet swing close: clustered crescents at toe height. */
export function heelScuff(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 48, (ctx) => {
    const marks = 4 + Math.floor(rng.float() * 4);
    for (let i = 0; i < marks; i++) {
      const hx = 12 + rng.float() * 104;
      const hy = 20 + rng.float() * 14;
      const swing = rng.float() * 0.9 + 0.4;
      ctx.strokeStyle = `rgba(24,20,18,${0.35 + rng.float() * 0.3})`;
      ctx.lineWidth = 1.6 + rng.float() * 1.4;
      ctx.beginPath();
      ctx.arc(hx, hy + 8, 7 + rng.float() * 4, Math.PI * (1.1 + rng.float() * 0.2), Math.PI * (1.1 + rng.float() * 0.2) + swing);
      ctx.stroke();
      // the smear tail — rubber dragged off the toe
      ctx.fillStyle = `rgba(24,20,18,${0.15 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.ellipse(hx + 4 + rng.float() * 6, hy + 10, 3 + rng.float() * 4, 1.4, 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    // dust disturbed at the board's feet
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(150,140,120,${0.06 + rng.float() * 0.1})`;
      ctx.beginPath();
      ctx.arc(8 + rng.float() * 112, 30 + rng.float() * 14, 0.6 + rng.float() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Chair halo — the pomade sheen a headrest keeps: a soft grease
 * ellipse where a thousand heads leaned back. */
export function chairHalo(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32 + (rng.float() - 0.5) * 8;
    // the shine — warm grease bloom, brighter at the crown
    const g = ctx.createRadialGradient(cx, 30, 2, cx, 30, 18 + rng.float() * 6);
    g.addColorStop(0, 'rgba(180,160,120,0.32)');
    g.addColorStop(0.55, 'rgba(160,140,104,0.16)');
    g.addColorStop(1, 'rgba(160,140,104,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // the crown ring — fabric polished hardest where the head sat
    ctx.strokeStyle = 'rgba(190,170,130,0.3)';
    ctx.lineWidth = 2 + rng.float();
    ctx.beginPath();
    ctx.ellipse(cx, 30, 10 + rng.float() * 4, 12 + rng.float() * 4, 0, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    // hair-line runs down the fabric
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(150,132,100,${0.12 + rng.float() * 0.12})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const hx = cx - 10 + rng.float() * 20;
      ctx.moveTo(hx, 34);
      ctx.lineTo(hx + (rng.float() - 0.5) * 3, 44 + rng.float() * 10);
      ctx.stroke();
    }
  });
}

/** Sconce soot — the breath a flame arm deposits on the wall above
 * itself: a dark bloom climbing from the fixture. */
export function sconceSoot(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    // the bloom — heaviest at the rim where the flame licks
    const g = ctx.createRadialGradient(32, 78, 2, 32, 78, 46);
    g.addColorStop(0, 'rgba(26,22,18,0.5)');
    g.addColorStop(0.5, 'rgba(26,22,18,0.22)');
    g.addColorStop(1, 'rgba(26,22,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 96);
    // the finger — a soot tongue the heat carried upward
    for (let i = 0; i < 4; i++) {
      const fx = 26 + rng.float() * 12;
      const flen = 30 + rng.float() * 40;
      const fg = ctx.createLinearGradient(fx, 74, fx, 74 - flen);
      fg.addColorStop(0, 'rgba(28,24,20,0.3)');
      fg.addColorStop(1, 'rgba(28,24,20,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(fx - 1 - rng.float(), 74 - flen, 2.4 + rng.float() * 1.6, flen);
    }
    // grit flecks in the bloom field
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(30,26,22,${0.14 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(12 + rng.float() * 40, 34 + rng.float() * 50, 0.5 + rng.float() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Clock ghost — where a wall clock hung and swung: the case ghost
 * plus the arc its pendulum scribed into the plaster. */
export function clockGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 10;
    // case ghost — the spared rectangle, pale where the case sat
    const g = ctx.createRadialGradient(cx, 44, 6, cx, 44, 40);
    g.addColorStop(0, 'rgba(200,192,170,0.28)');
    g.addColorStop(0.7, 'rgba(200,192,170,0.12)');
    g.addColorStop(1, 'rgba(200,192,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 128);
    ctx.fillStyle = 'rgba(208,198,176,0.3)';
    ctx.fillRect(cx - 14, 16, 28, 52);
    ctx.strokeStyle = 'rgba(90,80,64,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 14, 16, 28, 52);
    // the scribed arc — the pendulum's swing worn into the wall below
    ctx.strokeStyle = 'rgba(96,86,68,0.4)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, 40, 62 + rng.float() * 8, Math.PI * 0.5 - 0.3, Math.PI * 0.5 + 0.3);
    ctx.stroke();
    // terminal wear dabs at the swing's ends
    for (const a of [Math.PI * 0.5 - 0.28, Math.PI * 0.5 + 0.28]) {
      ctx.fillStyle = 'rgba(96,86,68,0.3)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 63, 40 + Math.sin(a) * 63, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // hook scar above the case
    ctx.fillStyle = 'rgba(60,50,40,0.4)';
    ctx.beginPath();
    ctx.arc(cx, 10, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Knob shine — the brass polish a thousand hands burnished into the
 * paint around a working handle: a pale worn ring. */
export function knobShine(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // the ring — finish worn down to a sheen in a hand's reach
    const g = ctx.createRadialGradient(32, 32, 6, 32, 32, 24);
    g.addColorStop(0, 'rgba(210,196,160,0)');
    g.addColorStop(0.55, 'rgba(210,196,160,0.26)');
    g.addColorStop(0.85, 'rgba(190,176,140,0.12)');
    g.addColorStop(1, 'rgba(190,176,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // finger trails — short worn arcs at turning radius
    const n = 5 + Math.floor(rng.float() * 4);
    for (let i = 0; i < n; i++) {
      const a0 = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(216,202,166,${0.2 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.6 + rng.float();
      ctx.beginPath();
      ctx.arc(32, 32, 13 + rng.float() * 5, a0, a0 + 0.4 + rng.float() * 0.6);
      ctx.stroke();
    }
    // nail scratches at the reach edge
    for (let i = 0; i < 4; i++) {
      const a = rng.float() * Math.PI * 2;
      const r0 = 20 + rng.float() * 8;
      ctx.strokeStyle = `rgba(220,206,170,${0.18 + rng.float() * 0.16})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(a) * r0, 32 + Math.sin(a) * r0);
      ctx.lineTo(32 + Math.cos(a) * (r0 + 4 + rng.float() * 4), 32 + Math.sin(a) * (r0 + 4 + rng.float() * 4));
      ctx.stroke();
    }
  });
}

/** Rail ghost — the hardware a curtain rail left behind: a pale shadow
 * line above the window, bracket scars, the screw holes that stayed. */
export function railGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 64, (ctx) => {
    // the shadow line — a pale run where the rail sat for decades
    ctx.fillStyle = 'rgba(206,196,172,0.3)';
    ctx.fillRect(8, 26 + rng.float() * 4, 112, 3.4);
    ctx.fillStyle = 'rgba(88,78,62,0.22)';
    ctx.fillRect(8, 30, 112, 1.2);
    // bracket ghosts — little blocks where the arms stood
    const brackets = 2 + Math.floor(rng.float() * 2);
    for (let i = 0; i < brackets; i++) {
      const bx = 16 + i * (96 / (brackets - 1 || 1)) + (rng.float() - 0.5) * 8;
      ctx.fillStyle = 'rgba(210,200,176,0.32)';
      ctx.fillRect(bx - 4, 14, 8, 18);
      ctx.strokeStyle = 'rgba(90,80,64,0.3)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(bx - 4, 14, 8, 18);
      // the screws that stayed — paired dark pits
      for (const sy of [18, 26]) {
        ctx.fillStyle = 'rgba(52,44,36,0.55)';
        ctx.beginPath();
        ctx.arc(bx + (rng.float() - 0.5) * 3, sy, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // oxidised drip under a bracket end
    if (rng.bool(0.5)) {
      const dx = 10 + rng.float() * 100;
      const dg = ctx.createLinearGradient(dx, 32, dx, 56);
      dg.addColorStop(0, 'rgba(110,66,38,0.3)');
      dg.addColorStop(1, 'rgba(110,66,38,0)');
      ctx.fillStyle = dg;
      ctx.fillRect(dx - 1.4, 32, 3, 24);
    }
  });
}

/** Chair rub — the chair-back height wear band a room earns where
 * seats kept knocking the same stretch of wall: a horizontal scuff
 * line with contact dabs and finish rubbed thin. */
export function chairRub(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 48, (ctx) => {
    // the band — finish rubbed to a sheen along back height
    const band = ctx.createLinearGradient(0, 14, 0, 36);
    band.addColorStop(0, 'rgba(210,198,170,0)');
    band.addColorStop(0.5, `rgba(210,198,170,${0.16 + rng.float() * 0.1})`);
    band.addColorStop(1, 'rgba(210,198,170,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, 14, 128, 22);
    // contact dabs — the top corners of chair backs left repeat hits
    const dabs = 3 + Math.floor(rng.float() * 4);
    for (let i = 0; i < dabs; i++) {
      const dx = 14 + rng.float() * 100;
      ctx.fillStyle = `rgba(220,208,180,${0.2 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(dx, 24 + (rng.float() - 0.5) * 6, 4 + rng.float() * 5, 2.6 + rng.float() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(70,60,48,${0.14 + rng.float() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(dx, 27 + (rng.float() - 0.5) * 4, 2.4 + rng.float() * 3, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // edge nicks — chips where a back caught the plaster hard
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(60,52,42,0.35)';
      ctx.fillRect(10 + rng.float() * 110, 22 + rng.float() * 10, 1 + rng.float() * 2, 0.8 + rng.float() * 1.4);
    }
  });
}

/** Bedpost notches — the small carved counts a sleeper cut into the
 * frame: short horizontal ticks in the wood, some still dark. */
export function bedpostNotches(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const groups = 2 + Math.floor(rng.float() * 3);
    for (let gIdx = 0; gIdx < groups; gIdx++) {
      const gx = 10 + gIdx * 18 + (rng.float() - 0.5) * 6;
      const gy = 14 + rng.float() * 60;
      const ticks = 3 + Math.floor(rng.float() * 4);
      for (let i = 0; i < ticks; i++) {
        const ty = gy + i * 4.4;
        const dark = rng.bool(0.35);
        ctx.strokeStyle = dark ? 'rgba(30,24,18,0.6)' : 'rgba(96,80,60,0.5)';
        ctx.lineWidth = 1 + rng.float() * 0.6;
        ctx.beginPath();
        ctx.moveTo(gx, ty);
        ctx.lineTo(gx + 8 + rng.float() * 4, ty + (rng.float() - 0.5) * 1.6);
        ctx.stroke();
      }
      // a diagonal cross-cut closing the set
      if (rng.bool(0.5)) {
        ctx.strokeStyle = 'rgba(96,80,60,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(gx - 1, gy + ticks * 4.4 - 1);
        ctx.lineTo(gx + 11, gy - 2);
        ctx.stroke();
      }
    }
    // raw wood pale around the worked patch
    const g = ctx.createRadialGradient(30, 50, 4, 30, 50, 40);
    g.addColorStop(0, 'rgba(214,196,164,0.1)');
    g.addColorStop(1, 'rgba(214,196,164,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 96);
  });
}

/** Pane writing — a finger dragged through condensation once: wiped
 * streaks and the crude letters somebody spelled with them. */
export function paneWriting(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // wiped field — pale tracery where the moisture was cleared
    const g = ctx.createRadialGradient(48, 40, 6, 48, 40, 44);
    g.addColorStop(0, 'rgba(210,216,210,0.22)');
    g.addColorStop(0.7, 'rgba(210,216,210,0.1)');
    g.addColorStop(1, 'rgba(210,216,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the letters — crude finger-writing, 2–4 strokes per glyph
    const letters = 2 + Math.floor(rng.float() * 3);
    const lh = 26;
    for (let li = 0; li < letters; li++) {
      const lx = 16 + li * (60 / letters) + (rng.float() - 0.5) * 4;
      const ly = 26 + (rng.float() - 0.5) * 6;
      const strokes = 2 + Math.floor(rng.float() * 2);
      for (let s = 0; s < strokes; s++) {
        ctx.strokeStyle = `rgba(224,230,222,${0.5 + rng.float() * 0.25})`;
        ctx.lineWidth = 2.4 + rng.float();
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (s === 0) { ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + lh); }
        else if (s === 1) { ctx.moveTo(lx, ly); ctx.lineTo(lx + 10 + rng.float() * 5, ly + (rng.float() - 0.5) * 3); }
        else { ctx.moveTo(lx, ly + lh * 0.5); ctx.lineTo(lx + 9 + rng.float() * 4, ly + lh * 0.5 + (rng.float() - 0.5) * 3); }
        ctx.stroke();
      }
    }
    // drip runs — the wiped water slid off the letters' heels
    for (let i = 0; i < 6; i++) {
      const dx = 18 + rng.float() * 60;
      ctx.strokeStyle = `rgba(210,216,210,${0.15 + rng.float() * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dx, 52);
      ctx.lineTo(dx + (rng.float() - 0.5) * 2, 52 + 10 + rng.float() * 18);
      ctx.stroke();
    }
  });
}

/** Table scratches — a worktop keeps its knife years: a field of
 * crossed cuts, some pale, some dark with old stains in the grooves. */
export function tableScratches(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the worked patch — faintly polished ground in the middle
    const g = ctx.createRadialGradient(48, 48, 8, 48, 48, 42);
    g.addColorStop(0, 'rgba(200,188,160,0.12)');
    g.addColorStop(1, 'rgba(200,188,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the cuts — crossed scores, mixed direction
    const cuts = 10 + Math.floor(rng.float() * 8);
    for (let i = 0; i < cuts; i++) {
      const x0 = 12 + rng.float() * 56;
      const y0 = 14 + rng.float() * 62;
      const len = 10 + rng.float() * 26;
      const ang = rng.float() * Math.PI;
      const dark = rng.bool(0.4);
      ctx.strokeStyle = dark ? `rgba(58,48,38,${0.25 + rng.float() * 0.2})` : `rgba(212,198,168,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.7 + rng.float() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len * 0.4);
      ctx.stroke();
    }
    // gouge pits — the hard ones
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(54,44,34,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(18 + rng.float() * 60, 20 + rng.float() * 56, 1.4, 0.8, rng.float() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Phone ghost — a wall phone left its case: pale rectangle where the
 * box sat, cord shadow looping down, the bell holes that stayed. */
export function phoneGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 44 + (rng.float() - 0.5) * 12;
    // surround halo — aged paint where the case stood off
    const g = ctx.createRadialGradient(cx, 34, 6, cx, 34, 34);
    g.addColorStop(0, 'rgba(206,196,172,0.26)');
    g.addColorStop(1, 'rgba(206,196,172,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the case ghost — spared rectangle with a scuffed rim
    ctx.fillStyle = 'rgba(212,202,178,0.3)';
    ctx.fillRect(cx - 13, 16, 26, 38);
    ctx.strokeStyle = 'rgba(88,78,62,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 13, 16, 26, 38);
    // bell holes — the twin screws that outlived the box
    ctx.fillStyle = 'rgba(54,46,38,0.55)';
    ctx.beginPath(); ctx.arc(cx - 6, 10, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6, 10, 1.6, 0, Math.PI * 2); ctx.fill();
    // the cord's loop shadow — the wire's drape worn into the paint
    ctx.strokeStyle = 'rgba(80,70,56,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + 8, 54);
    ctx.bezierCurveTo(cx + 14 + rng.float() * 6, 66, cx + 6, 78, cx + 10, 88);
    ctx.stroke();
    // receiver cradle wear — two contact dabs
    for (const dx of [-8, 8]) {
      ctx.fillStyle = 'rgba(96,84,66,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx + dx, 20, 2.6, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Mould bloom — the cold corner the damp owns: spotted clusters
 * creeping out of the ceiling seam, green-black and stippled. */
export function mouldBloom(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the field — damp dark ground in the corner
    const g = ctx.createRadialGradient(28, 22, 4, 28, 22, 40);
    g.addColorStop(0, 'rgba(40,44,34,0.4)');
    g.addColorStop(0.6, 'rgba(40,44,34,0.18)');
    g.addColorStop(1, 'rgba(40,44,34,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the bloom — clustered spore dots growing outward, denser in
    // the heart, thinning to single spores at the fringe
    const spots = 40 + Math.floor(rng.float() * 30);
    for (let i = 0; i < spots; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = Math.pow(rng.float(), 0.6) * 34;
      const sx = 28 + Math.cos(a) * r * (0.8 + rng.float() * 0.4);
      const sy = 22 + Math.sin(a) * r * 0.9;
      const green = rng.bool(0.4);
      ctx.fillStyle = green
        ? `rgba(58,66,44,${0.3 + rng.float() * 0.3})`
        : `rgba(30,32,26,${0.3 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.5 + rng.float() * (r < 12 ? 1.8 : 1.1), 0, Math.PI * 2);
      ctx.fill();
    }
    // the seam stain — the bloom's dark root in the corner joint
    ctx.strokeStyle = 'rgba(34,36,28,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 6);
    ctx.lineTo(4 + rng.float() * 10, 8 + rng.float() * 4);
    ctx.stroke();
  });
}

/** Key board — a pegboard of keys that left: the panel ghost, the
 * hook row, and the little swung shadows the keys used to cast. */
export function keyBoard(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48, top = 14;
    // panel ghost — the board's spared rectangle
    const g = ctx.createRadialGradient(cx, 46, 8, cx, 46, 42);
    g.addColorStop(0, 'rgba(204,194,170,0.24)');
    g.addColorStop(1, 'rgba(204,194,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = 'rgba(208,198,174,0.26)';
    ctx.fillRect(cx - 30, top, 60, 56);
    ctx.strokeStyle = 'rgba(88,78,62,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 30, top, 60, 56);
    // hook row — paired pegs, some with the key's swung arc beneath
    for (let i = 0; i < 6; i++) {
      const hx = cx - 24 + i * 10;
      ctx.fillStyle = 'rgba(52,44,36,0.55)';
      ctx.beginPath();
      ctx.arc(hx, top + 10, 1.4, 0, Math.PI * 2);
      ctx.fill();
      if (rng.bool(0.5)) {
        // key shadow — the teardrop hang the wall remembers
        ctx.strokeStyle = 'rgba(80,70,56,0.3)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.ellipse(hx + (rng.float() - 0.5) * 3, top + 18, 2.6, 4.5, (rng.float() - 0.5) * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // number ticks inked under the hooks
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(70,60,48,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const nx = cx - 22 + i * 12;
      ctx.moveTo(nx, top + 30);
      ctx.lineTo(nx, top + 36 + rng.float() * 4);
      ctx.stroke();
    }
  });
}

/** Luggage scuff — the belt-height scrape a thousand cases left on
 * the corridor wall: a horizontal drag band with rubber smears. */
export function luggageScuff(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 48, (ctx) => {
    // the scrape band — long horizontal drags at trunk height
    const drags = 3 + Math.floor(rng.float() * 3);
    for (let i = 0; i < drags; i++) {
      const dy = 14 + i * 9 + (rng.float() - 0.5) * 4;
      const x0 = 8 + rng.float() * 30;
      const len = 50 + rng.float() * 60;
      const dg = ctx.createLinearGradient(x0, 0, x0 + len, 0);
      dg.addColorStop(0, `rgba(40,36,30,${0.28 + rng.float() * 0.15})`);
      dg.addColorStop(0.8, `rgba(40,36,30,${0.14 + rng.float() * 0.1})`);
      dg.addColorStop(1, 'rgba(40,36,30,0)');
      ctx.strokeStyle = dg;
      ctx.lineWidth = 1.4 + rng.float() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x0, dy);
      ctx.lineTo(x0 + len, dy + (rng.float() - 0.5) * 3);
      ctx.stroke();
    }
    // wheel smears — rubber arcs where cases tipped
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(30,26,22,${0.2 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const wx = 16 + rng.float() * 100;
      ctx.arc(wx, 36, 5 + rng.float() * 4, Math.PI, Math.PI + 0.7 + rng.float() * 0.5);
      ctx.stroke();
    }
    // corner dents — the brass corner of a trunk bit the plaster
    for (let i = 0; i < 3; i++) {
      if (!rng.bool(0.6)) continue;
      const dx = 20 + rng.float() * 90;
      ctx.fillStyle = 'rgba(56,48,40,0.4)';
      ctx.beginPath();
      ctx.moveTo(dx, 16 + rng.float() * 14);
      ctx.lineTo(dx + 3.4, 17 + rng.float() * 14);
      ctx.lineTo(dx + 1, 21 + rng.float() * 10);
      ctx.closePath();
      ctx.fill();
    }
  });
}

/** Door drag — the crescent a sagging leaf scrapes into the floor at
 * its swing's far reach: a worn arc, darker at the stall point. */
export function doorDrag(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 64, (ctx) => {
    // the sweep arc — worn finish along the swing circle
    const cx = 20 + rng.float() * 20;
    const cy = 56;
    const r0 = 44 + rng.float() * 12;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(190,176,150,${0.22 - i * 0.05})`;
      ctx.lineWidth = 2.5 - i * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, r0 + i * 3, -Math.PI * (0.45 + rng.float() * 0.05), -Math.PI * 0.12);
      ctx.stroke();
    }
    // the stall point — the darkest bite where the leaf hesitates
    const sa = -Math.PI * (0.3 + rng.float() * 0.1);
    ctx.fillStyle = 'rgba(70,60,48,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(sa) * r0, cy + Math.sin(sa) * r0, 4, 2.4, sa, 0, Math.PI * 2);
    ctx.fill();
    // ground-in grit along the arc
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * (0.15 + rng.float() * 0.3);
      ctx.fillStyle = `rgba(88,78,64,${0.14 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (r0 + (rng.float() - 0.5) * 6), cy + Math.sin(a) * (r0 + (rng.float() - 0.5) * 6), 0.5 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Soap scum — the tide line a basin keeps: a pale mineral ring on
 * the rim and drip fingers running to the drain. */
export function soapScum(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // rim ring — the scum tide where water stood
    ctx.strokeStyle = 'rgba(200,196,180,0.5)';
    ctx.lineWidth = 3 + rng.float();
    ctx.beginPath();
    ctx.ellipse(48, 30, 36, 16, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    // inner film — the bloom on the bowl floor
    const g = ctx.createRadialGradient(48, 34, 4, 48, 34, 26);
    g.addColorStop(0, 'rgba(196,192,176,0.16)');
    g.addColorStop(1, 'rgba(196,192,176,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 64);
    // drip fingers — runs down to the drain hole
    for (let i = 0; i < 4; i++) {
      const dx = 34 + i * 9 + (rng.float() - 0.5) * 4;
      ctx.strokeStyle = `rgba(196,192,176,${0.22 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(dx, 34);
      ctx.quadraticCurveTo(dx + (rng.float() - 0.5) * 4, 44, 48 + (rng.float() - 0.5) * 5, 50);
      ctx.stroke();
    }
    // mineral speckle on the ring
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * (1.05 + rng.float() * 0.9);
      ctx.fillStyle = `rgba(210,206,190,${0.25 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(48 + Math.cos(a) * 36, 30 + Math.sin(a) * 16, 0.6 + rng.float() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Shaver smear — the soap-and-hair wipe somebody left on a mirror:
 * a dragged hand-smear through film with bristle specks. */
export function shaverSmear(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // soap film — a cloudy ground across the wipe zone
    const g = ctx.createRadialGradient(48, 44, 6, 48, 44, 42);
    g.addColorStop(0, 'rgba(206,208,196,0.2)');
    g.addColorStop(1, 'rgba(206,208,196,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the wipe — a hand dragged down through the film, darker where
    // the heel pressed
    for (let i = 0; i < 5; i++) {
      const wx = 30 + i * 8 + (rng.float() - 0.5) * 4;
      ctx.strokeStyle = `rgba(226,228,214,${0.34 + rng.float() * 0.2})`;
      ctx.lineWidth = 3.4 + rng.float() * 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(wx, 24 + rng.float() * 6);
      ctx.quadraticCurveTo(wx + (rng.float() - 0.5) * 8, 46, wx + (rng.float() - 0.5) * 6, 66 + rng.float() * 8);
      ctx.stroke();
    }
    // lather dots — the flicked foam
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(230,232,220,${0.2 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(10 + rng.float() * 76, 12 + rng.float() * 72, 0.5 + rng.float() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // bristle specks — the dark hairs the razor left
    for (let i = 0; i < 14; i++) {
      const bx = 24 + rng.float() * 50;
      const by = 30 + rng.float() * 44;
      ctx.strokeStyle = `rgba(46,40,32,${0.4 + rng.float() * 0.3})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + (rng.float() - 0.5) * 4, by + 1 + rng.float() * 3);
      ctx.stroke();
    }
  });
}

/** Stair wear — the tread centers a million steps polished: pale
 * crescents stacked like riser faces, darker noses where the edge
 * bit. */
export function stairWear(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // tread bands — horizontal wear crescents, center-biased
    const treads = 5 + Math.floor(rng.float() * 3);
    for (let i = 0; i < treads; i++) {
      const ty = 12 + i * (72 / treads);
      const tw = 30 + rng.float() * 26;
      const tx = 48 + (rng.float() - 0.5) * 14;
      const g = ctx.createRadialGradient(tx, ty, 1, tx, ty, tw / 2);
      g.addColorStop(0, `rgba(212,200,170,${0.24 + rng.float() * 0.12})`);
      g.addColorStop(1, 'rgba(212,200,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(tx, ty, tw / 2, 4.5 + rng.float() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // the nose — dark grind on the riser lip
      ctx.strokeStyle = 'rgba(70,60,48,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(tx - tw / 2, ty + 3);
      ctx.quadraticCurveTo(tx, ty + 5 + rng.float() * 2, tx + tw / 2, ty + 3);
      ctx.stroke();
    }
    // dragged heel marks between treads
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = `rgba(88,78,64,${0.15 + rng.float() * 0.15})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      const hx = 20 + rng.float() * 56;
      const hy = 14 + rng.float() * 68;
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + (rng.float() - 0.5) * 8, hy + 4 + rng.float() * 5);
      ctx.stroke();
    }
  });
}

/** Hook wear — the greasy halo a coat peg earns: swung arcs where
 * the hook's load knocked the paint, lint below it. */
export function hookWear(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const cx = 32;
    // halo — hand-height smudge around the peg
    const g = ctx.createRadialGradient(cx, 30, 3, cx, 30, 22);
    g.addColorStop(0, 'rgba(60,52,40,0.38)');
    g.addColorStop(0.6, 'rgba(60,52,40,0.15)');
    g.addColorStop(1, 'rgba(60,52,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 96);
    // swung marks — the coat's weight arcing the plaster
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(76,66,52,${0.24 + rng.float() * 0.18})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const a0 = Math.PI * (0.4 + rng.float() * 0.3);
      ctx.arc(cx, 30, 9 + rng.float() * 7, a0, a0 + 0.5 + rng.float() * 0.5);
      ctx.stroke();
    }
    // the peg pit — dark bite where the hook screws sit
    ctx.fillStyle = 'rgba(40,34,28,0.5)';
    ctx.beginPath();
    ctx.arc(cx, 28, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, 36, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // lint drift — fibers dusted down under the hang
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(150,140,120,${0.1 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(22 + rng.float() * 20, 44 + rng.float() * 40, 0.7, 1.6, (rng.float() - 0.5) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Ceiling hair — a plaster hairline that wandered: one branching
 * crack, forks thinning as they run, a pale dust line along it. */
export function ceilingHair(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 96, (ctx) => {
    // the run — a wandering hairline
    let x = 10 + rng.float() * 20;
    let y = 20 + rng.float() * 20;
    ctx.strokeStyle = 'rgba(52,46,38,0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 6 + Math.floor(rng.float() * 5);
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < segs; i++) {
      x += 14 + rng.float() * 10;
      y += (rng.float() - 0.5) * 14;
      ctx.lineTo(x, y);
      pts.push([x, y]);
    }
    ctx.stroke();
    // forks — thinner splits off the main run
    for (const [fx, fy] of pts.slice(1, -1)) {
      if (!rng.bool(0.5)) continue;
      ctx.strokeStyle = 'rgba(52,46,38,0.4)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + (rng.float() - 0.5) * 16, fy + (rng.float() - 0.5) * 22);
      ctx.stroke();
    }
    // pale dust settled along the crack's lip
    ctx.strokeStyle = 'rgba(200,190,168,0.2)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1] + 1.4);
    for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py + 1.4);
    ctx.stroke();
    // the pale stain spot the crack grew from
    const g = ctx.createRadialGradient(pts[0][0], pts[0][1], 1, pts[0][0], pts[0][1], 14);
    g.addColorStop(0, 'rgba(180,168,144,0.22)');
    g.addColorStop(1, 'rgba(180,168,144,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 96);
  });
}

/** Cart tracks — twin wheel rails ground into a service floor: two
 * parallel drags, darker where the wheels bit, dust between. */
export function cartTracks(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 96, (ctx) => {
    const gap = 26 + rng.float() * 10;
    const drift = (rng.float() - 0.5) * 10;
    for (const side of [-1, 1]) {
      const wx = 64 + side * gap / 2 + drift;
      // the rail — a worn dark line, slightly wavy
      ctx.strokeStyle = `rgba(44,38,32,${0.34 + rng.float() * 0.12})`;
      ctx.lineWidth = 2.2 + rng.float();
      ctx.beginPath();
      ctx.moveTo(wx + (rng.float() - 0.5) * 3, 6);
      ctx.bezierCurveTo(wx + (rng.float() - 0.5) * 6, 34, wx + (rng.float() - 0.5) * 6, 62, wx + (rng.float() - 0.5) * 3, 90);
      ctx.stroke();
      // polished keel — the shine line inside the track
      ctx.strokeStyle = `rgba(196,186,162,${0.2 + rng.float() * 0.12})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(wx, 8);
      ctx.lineTo(wx + (rng.float() - 0.5) * 4, 88);
      ctx.stroke();
    }
    // dust ridge between the rails
    const dg = ctx.createLinearGradient(0, 0, 0, 96);
    dg.addColorStop(0, 'rgba(160,148,128,0.05)');
    dg.addColorStop(0.5, `rgba(160,148,128,${0.12 + rng.float() * 0.08})`);
    dg.addColorStop(1, 'rgba(160,148,128,0.05)');
    ctx.fillStyle = dg;
    ctx.fillRect(64 + drift - gap / 2 + 4, 0, gap - 8, 96);
    // grit cast off the treads
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(70,62,52,${0.14 + rng.float() * 0.16})`;
      const side = rng.bool(0.5) ? -1 : 1;
      ctx.beginPath();
      ctx.arc(64 + drift + side * (gap / 2 + 2 + rng.float() * 6), 8 + rng.float() * 80, 0.5 + rng.float() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Grout lines — the darkening bands tile keeps between its courses:
 * horizontal seams gone grey-green with damp and soap years. */
export function groutLines(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 96, (ctx) => {
    // horizontal seams — every ~22px, slight wander
    const rows = 4 + Math.floor(rng.float() * 2);
    for (let i = 0; i < rows; i++) {
      const gy = 14 + i * 22 + (rng.float() - 0.5) * 3;
      ctx.strokeStyle = `rgba(52,56,46,${0.28 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.1 + rng.float() * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= 128; x += 32) ctx.lineTo(x, gy + (rng.float() - 0.5) * 1.6);
      ctx.stroke();
      // drip stain riding the seam — the damp follows the grout
      if (rng.bool(0.55)) {
        const dx = 12 + rng.float() * 104;
        const dl = ctx.createLinearGradient(dx, gy, dx, gy + 18 + rng.float() * 10);
        dl.addColorStop(0, 'rgba(52,56,46,0.3)');
        dl.addColorStop(1, 'rgba(52,56,46,0)');
        ctx.fillStyle = dl;
        ctx.fillRect(dx - 1.2, gy, 2.4 + rng.float(), 18 + rng.float() * 10);
      }
    }
    // a few vertical joints
    for (let i = 0; i < 4; i++) {
      const vx = 16 + i * 32 + (rng.float() - 0.5) * 6;
      ctx.strokeStyle = `rgba(52,56,46,${0.18 + rng.float() * 0.12})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(vx, 10);
      ctx.lineTo(vx + (rng.float() - 0.5) * 2, 88);
      ctx.stroke();
    }
    // soap bloom across the field
    const g = ctx.createRadialGradient(64, 48, 10, 64, 48, 60);
    g.addColorStop(0, 'rgba(190,194,180,0.08)');
    g.addColorStop(1, 'rgba(190,194,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 96);
  });
}

/** Counter drips — the runs that streak down a case piece's face:
 * gravity trails under the lip where spills escaped the top. */
export function counterDrips(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    // lip shadow — the dark seam under the top edge
    ctx.fillStyle = 'rgba(40,34,28,0.3)';
    ctx.fillRect(6, 8, 52, 2.4);
    // drip runs — thin gravity trails, some stopping early
    const n = 3 + Math.floor(rng.float() * 4);
    for (let i = 0; i < n; i++) {
      const dx = 10 + rng.float() * 44;
      const dlen = 26 + rng.float() * 50;
      const dg = ctx.createLinearGradient(dx, 10, dx, 10 + dlen);
      dg.addColorStop(0, `rgba(96,78,56,${0.36 + rng.float() * 0.18})`);
      dg.addColorStop(1, 'rgba(96,78,56,0)');
      ctx.fillStyle = dg;
      ctx.fillRect(dx - 0.9, 10, 1.8 + rng.float(), dlen);
      // the tear-drop at the run's end
      ctx.fillStyle = 'rgba(96,78,56,0.3)';
      ctx.beginPath();
      ctx.ellipse(dx, 10 + dlen, 1.6, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // pale tide at the bottom where the drips pooled
    const bg = ctx.createLinearGradient(0, 78, 0, 96);
    bg.addColorStop(0, 'rgba(110,92,68,0)');
    bg.addColorStop(1, `rgba(110,92,68,${0.16 + rng.float() * 0.1})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 78, 64, 18);
  });
}

/** Sun fade — the bleached patch a window pours onto the boards:
 * a pale parallelogram, sharpest at the sill edge, feathered away. */
export function sunFade(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 96, (ctx) => {
    // the pool — a parallelogram of bleached boards, slanted with the
    // sun's angle
    const skew = 10 + rng.float() * 14;
    ctx.fillStyle = `rgba(216,206,178,${0.16 + rng.float() * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(20, 14);
    ctx.lineTo(104, 14);
    ctx.lineTo(104 + skew, 78);
    ctx.lineTo(20 + skew, 78);
    ctx.closePath();
    ctx.fill();
    // mullion bars — darker slots where the frame's shadow never
    // bleached
    for (let i = 1; i <= 2; i++) {
      const bx = 20 + i * 28 + skew * 0.5;
      ctx.fillStyle = 'rgba(90,80,64,0.18)';
      ctx.fillRect(bx, 12, 3 + rng.float() * 2, 68);
    }
    // the sill edge — sharpest line where the light cut in
    ctx.strokeStyle = 'rgba(220,210,182,0.4)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(18, 12);
    ctx.lineTo(106, 12);
    ctx.stroke();
    // the feathered far edge — fade out where the sun lost reach
    const fg = ctx.createLinearGradient(0, 60, 0, 90);
    fg.addColorStop(0, 'rgba(216,206,178,0.1)');
    fg.addColorStop(1, 'rgba(216,206,178,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(16, 60, 116, 30);
  });
}

/** Hinge rust — the oxidised runs a leaf's hinges bleed down the
 * door face: vertical streaks from each knuckle, pitting at top. */
export function hingeRust(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    // hinge shadows — two knuckle stains at hinge heights
    for (const hy of [16, 52, 82]) {
      if (!rng.bool(0.8)) continue;
      const g = ctx.createRadialGradient(30, hy, 1, 30, hy, 9);
      g.addColorStop(0, 'rgba(96,52,30,0.5)');
      g.addColorStop(1, 'rgba(96,52,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(30, hy, 9, 0, Math.PI * 2);
      ctx.fill();
      // the run — a rust tongue dragged down the grain
      const rlen = 12 + rng.float() * 22;
      const rg = ctx.createLinearGradient(30, hy, 30, hy + rlen);
      rg.addColorStop(0, 'rgba(110,62,36,0.4)');
      rg.addColorStop(1, 'rgba(110,62,36,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(28.4 + (rng.float() - 0.5) * 2, hy, 3.4, rlen);
      // oxide grit at the knuckle
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = `rgba(120,68,40,${0.24 + rng.float() * 0.2})`;
        ctx.beginPath();
        ctx.arc(26 + rng.float() * 9, hy - 3 + rng.float() * 6, 0.5 + rng.float() * 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

/** Lamp ghost — the pale ring a standing lamp's shade threw onto the
 * floor for years: a soft ring of un-darkened boards. */
export function lampGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 12;
    const cy = 48 + (rng.float() - 0.5) * 12;
    // the spared field — boards kept pale inside the lamp's reach
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 34);
    g.addColorStop(0, 'rgba(212,202,176,0.24)');
    g.addColorStop(0.7, 'rgba(212,202,176,0.12)');
    g.addColorStop(1, 'rgba(212,202,176,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the base ring — the darker circle the stand sat in
    ctx.strokeStyle = 'rgba(88,76,60,0.35)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, 7 + rng.float() * 2, 0, Math.PI * 2);
    ctx.stroke();
    // floor-cord drag — the flex path out of the ring
    ctx.strokeStyle = 'rgba(80,70,56,0.3)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy + 4);
    ctx.quadraticCurveTo(cx + 20 + rng.float() * 8, cy + 12, cx + 30 + rng.float() * 10, cy + 8 + rng.float() * 10);
    ctx.stroke();
    // dust line at the spared edge
    for (let i = 0; i < 14; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.fillStyle = `rgba(170,160,140,${0.14 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (30 + rng.float() * 6), cy + Math.sin(a) * (30 + rng.float() * 6), 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Rocker arcs — the twin crescents a rocking chair carves into the
 * floor under its runners: polished arcs, ground at the extremes. */
export function rockerArcs(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    for (const side of [-1, 1]) {
      const rx = 48 + side * 16;
      // the runner's crescent — a long shallow arc, worn bright
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(206,194,166,${0.22 - i * 0.05})`;
        ctx.lineWidth = 2.4 - i * 0.5;
        ctx.beginPath();
        ctx.arc(rx, 48, 26 + i * 3 + rng.float() * 4, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
      }
      // the pitch dents — ground bites at each swing's end
      for (const a of [Math.PI * 1.25, Math.PI * 1.75]) {
        ctx.fillStyle = 'rgba(72,62,50,0.4)';
        ctx.beginPath();
        ctx.ellipse(rx + Math.cos(a) * 27, 48 + Math.sin(a) * 27, 2.6, 1.6, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // grit thrown off the runners
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(88,78,64,${0.12 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(20 + rng.float() * 56, 14 + rng.float() * 28, 0.5 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Cord wear — the vertical smear a window's pull-cord painted on
 * the reveal: a dragged line, frayed knots, a swing scuff at reach. */
export function cordWear(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 128, (ctx) => {
    const cx = 24;
    // the drag line — greasy vertical where the cord hung
    const g = ctx.createLinearGradient(cx - 4, 0, cx + 4, 0);
    g.addColorStop(0, 'rgba(60,52,42,0)');
    g.addColorStop(0.5, `rgba(60,52,42,${0.3 + rng.float() * 0.15})`);
    g.addColorStop(1, 'rgba(60,52,42,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 5, 6, 10, 104);
    // knot dents — the cord's knots bumped the paint at intervals
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(48,42,34,${0.34 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + (rng.float() - 0.5) * 4, 18 + i * 24 + rng.float() * 8, 1.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // the swing scuff — where the cord's end swayed at pull height
    ctx.strokeStyle = 'rgba(64,56,44,0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, 96, 10 + rng.float() * 6, Math.PI * 1.3, Math.PI * 1.9);
    ctx.stroke();
    // fray flecks — cord fibers dusted off along the run
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(160,148,124,${0.18 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(cx - 4 + rng.float() * 10, 10 + rng.float() * 96, 0.5 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Night glow — the warm halo a bedside lamp breathed onto the wall
 * every night: a soft amber bloom behind the table. */
export function nightGlow(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 10;
    const cy = 40 + rng.float() * 8;
    // the bloom — warm amber, brightest at the shade's mouth
    const g = ctx.createRadialGradient(cx, cy, 3, cx, cy, 38);
    g.addColorStop(0, 'rgba(220,180,110,0.3)');
    g.addColorStop(0.55, 'rgba(220,180,110,0.14)');
    g.addColorStop(1, 'rgba(220,180,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the shade's shadow — a darker cut where the lamp itself stood
    ctx.fillStyle = 'rgba(50,40,30,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // soot point — the bulb's kiss on the plaster
    ctx.fillStyle = 'rgba(60,48,32,0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 2 + rng.float(), 0, Math.PI * 2);
    ctx.fill();
    // moth specks drawn to the warm
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(140,120,90,${0.2 + rng.float() * 0.2})`;
      const a = rng.float() * Math.PI * 2;
      const r = 12 + rng.float() * 20;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.5 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Lace shadow — the net a lace curtain throws onto the wall beside
 * the window: a dappled lattice of light when the sun was kind. */
export function laceShadow(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the lattice — crossed diagonal threads, pale sun on plaster
    ctx.strokeStyle = `rgba(216,206,178,${0.14 + rng.float() * 0.1})`;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 12; i++) {
      const off = -40 + i * 12;
      ctx.beginPath();
      ctx.moveTo(off, 0);
      ctx.lineTo(off + 96, 96);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(off + 96, 0);
      ctx.lineTo(off, 96);
      ctx.stroke();
    }
    // the rosettes — knots at the crossings, slightly irregular
    for (let y = 12; y < 96; y += 17) {
      for (let x = 10; x < 96; x += 17) {
        if (!rng.bool(0.7)) continue;
        ctx.fillStyle = `rgba(224,214,186,${0.16 + rng.float() * 0.14})`;
        ctx.beginPath();
        ctx.arc(x + (rng.float() - 0.5) * 4, y + (rng.float() - 0.5) * 4, 1.8 + rng.float(), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // the falloff — the net's shadow dies toward the room
    const fg = ctx.createLinearGradient(96, 0, 0, 96);
    fg.addColorStop(0, 'rgba(216,206,178,0.05)');
    fg.addColorStop(1, 'rgba(216,206,178,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, 96, 96);
  });
}

/** Flour dust — the pale film a worktop keeps in a kitchen that fed
 * a house: powder drift, wiped arcs, a kneaded patch. */
export function flourDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the drift — a pale dust field across the board
    const g = ctx.createRadialGradient(48, 44, 6, 48, 44, 42);
    g.addColorStop(0, 'rgba(222,216,200,0.3)');
    g.addColorStop(0.6, 'rgba(222,216,200,0.14)');
    g.addColorStop(1, 'rgba(222,216,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the kneaded patch — a cleared oval where dough was worked
    ctx.strokeStyle = 'rgba(190,182,162,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(46 + (rng.float() - 0.5) * 8, 42 + (rng.float() - 0.5) * 8, 18 + rng.float() * 6, 13 + rng.float() * 4, (rng.float() - 0.5) * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    // wiped arcs — a hand swept the dust once
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(228,222,208,${0.2 + rng.float() * 0.14})`;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(30 + rng.float() * 36, 46 + rng.float() * 20, 14 + rng.float() * 8, rng.float() * Math.PI, rng.float() * Math.PI + 0.9 + rng.float() * 0.6);
      ctx.stroke();
    }
    // dust lumps — settled ridges at the board's edge
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(226,220,204,${0.3 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 84, 8 + rng.float() * 80, 0.7 + rng.float() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Grease cloud — the bloom a cooker breaths onto the ceiling above:
 * a warm oily film, drips back down the plaster, a hot core. */
export function greaseCloud(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 12;
    const cy = 44 + (rng.float() - 0.5) * 12;
    // the film — amber grease bloom, densest over the burners
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 38);
    g.addColorStop(0, 'rgba(148,110,58,0.34)');
    g.addColorStop(0.55, 'rgba(148,110,58,0.16)');
    g.addColorStop(1, 'rgba(148,110,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the hot core — where the steam column hits hardest
    ctx.fillStyle = 'rgba(110,78,40,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10 + rng.float() * 4, 8 + rng.float() * 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // run-back drips — condensed fat lines under the bloom
    for (let i = 0; i < 6; i++) {
      const dx = cx - 22 + rng.float() * 44;
      const dlen = 8 + rng.float() * 16;
      const dg = ctx.createLinearGradient(dx, cy + 14, dx, cy + 14 + dlen);
      dg.addColorStop(0, 'rgba(140,104,54,0.3)');
      dg.addColorStop(1, 'rgba(140,104,54,0)');
      ctx.fillStyle = dg;
      ctx.fillRect(dx - 0.8, cy + 14, 1.6 + rng.float(), dlen);
    }
    // dust caught in the grease film
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(110,84,46,${0.2 + rng.float() * 0.2})`;
      const a = rng.float() * Math.PI * 2;
      const r = Math.pow(rng.float(), 0.7) * 30;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, 0.5 + rng.float() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Rug curl — the shadow a curling rug edge throws and the grit
 * trapped under it: a dark lip line with dust at the lift. */
export function rugCurl(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // the lift shadow — a darkened line along the curling edge
    const cy = 22 + rng.float() * 8;
    ctx.strokeStyle = 'rgba(38,32,26,0.5)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(8, cy);
    ctx.bezierCurveTo(30, cy - 6 - rng.float() * 6, 66, cy + 4 + rng.float() * 4, 88, cy - 2);
    ctx.stroke();
    // pale curl face — the rug's underside catching light
    ctx.strokeStyle = `rgba(196,182,152,${0.3 + rng.float() * 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, cy - 3);
    ctx.bezierCurveTo(32, cy - 9 - rng.float() * 5, 64, cy + 1, 86, cy - 5);
    ctx.stroke();
    // trapped grit — dust clods the lip keeps
    for (let i = 0; i < 12; i++) {
      const t = rng.float();
      const gx = 10 + t * 76;
      const gy = cy + 3 + rng.float() * 8 + Math.sin(t * Math.PI) * 2;
      ctx.fillStyle = `rgba(60,52,42,${0.3 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(gx, gy, 0.7 + rng.float() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // pile crushed flat past the lift
    ctx.strokeStyle = 'rgba(150,138,114,0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(14 + i * 12, cy + 8);
      ctx.lineTo(16 + i * 12, cy + 14 + rng.float() * 4);
      ctx.stroke();
    }
  });
}

/** Bath ring — the tide line a tub keeps: a grey-green mineral band
 * running the rim, hair caught in the scum. */
export function bathRing(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // the tide band — a horizontal grey-green seam along the tub wall
    const ty = 24 + rng.float() * 6;
    ctx.fillStyle = `rgba(96,98,80,${0.3 + rng.float() * 0.15})`;
    ctx.fillRect(6, ty, 84, 4.5);
    ctx.fillStyle = 'rgba(120,122,100,0.2)';
    ctx.fillRect(6, ty + 4.5, 84, 2);
    // scum film below the ring
    const g = ctx.createLinearGradient(0, ty + 5, 0, 58);
    g.addColorStop(0, 'rgba(96,98,80,0.12)');
    g.addColorStop(1, 'rgba(96,98,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(6, ty + 5, 84, 22);
    // drips down from the line
    for (let i = 0; i < 5; i++) {
      const dx = 12 + rng.float() * 72;
      ctx.strokeStyle = `rgba(100,102,84,${0.24 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(dx, ty + 4);
      ctx.lineTo(dx + (rng.float() - 0.5) * 2, ty + 8 + rng.float() * 14);
      ctx.stroke();
    }
    // hair caught in the scum — dark threads across the band
    for (let i = 0; i < 6; i++) {
      const hx = 14 + rng.float() * 68;
      ctx.strokeStyle = `rgba(44,38,32,${0.4 + rng.float() * 0.25})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(hx, ty - 1 + rng.float() * 5);
      ctx.quadraticCurveTo(hx + 3 + rng.float() * 4, ty + 2, hx + 6 + rng.float() * 5, ty - 1 + rng.float() * 6);
      ctx.stroke();
    }
    // rust spot at the drain end
    ctx.fillStyle = 'rgba(110,66,38,0.35)';
    ctx.beginPath();
    ctx.ellipse(80 + rng.float() * 8, ty + 10, 4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Wardrobe dark — the deep untouched shadow behind a wardrobe that
 * hasn't moved since it arrived: absolute darkness, dust at the
 * crack, a thing the light never reached. */
export function wardrobeDark(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    // the crack — near-black vertical slit where the doors never
    // quite met
    const cx = 48 + (rng.float() - 0.5) * 4;
    const g = ctx.createLinearGradient(cx - 6, 0, cx + 6, 0);
    g.addColorStop(0, 'rgba(20,16,14,0)');
    g.addColorStop(0.5, 'rgba(16,12,10,0.8)');
    g.addColorStop(1, 'rgba(20,16,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 128);
    // the slit itself — near absolute
    ctx.fillStyle = 'rgba(10,8,7,0.85)';
    ctx.fillRect(cx - 1.2, 10, 2.4 + rng.float(), 106);
    // dust fuzz on the door edges — the only thing the slit gave up
    for (let i = 0; i < 20; i++) {
      const side = rng.bool(0.5) ? -1 : 1;
      ctx.fillStyle = `rgba(170,160,140,${0.1 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(cx + side * (1.6 + rng.float() * 3), 12 + rng.float() * 100, 0.5 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // keyhole glint — one dark dot where the lock was
    ctx.fillStyle = 'rgba(14,10,8,0.7)';
    ctx.beginPath();
    ctx.arc(cx, 66, 2, 0, Math.PI * 2);
    ctx.fill();
    // escutcheon shadow ring
    ctx.strokeStyle = 'rgba(60,50,40,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, 66, 3.4, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Book gap — the dark slot a shelf keeps where books were pulled
 * out: void slits between spines, dust on the shelf edge. */
export function bookGap(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the shelf line — dust on the shelf edge beneath the books
    ctx.fillStyle = `rgba(160,150,130,${0.14 + rng.float() * 0.1})`;
    ctx.fillRect(0, 78, 96, 3);
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgba(160,150,130,${0.12 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(4 + rng.float() * 88, 76 + rng.float() * 6, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // spine band — the row the gap cuts through
    ctx.fillStyle = 'rgba(60,50,40,0.28)';
    ctx.fillRect(0, 14, 96, 60);
    // the gaps — narrow voids, some angled (half-pulled)
    const gaps = 2 + Math.floor(rng.float() * 3);
    for (let i = 0; i < gaps; i++) {
      const gx = 12 + rng.float() * 72;
      const gw = 3 + rng.float() * 6;
      ctx.fillStyle = `rgba(18,14,12,${0.6 + rng.float() * 0.2})`;
      if (rng.bool(0.35)) {
        // half-pulled book leans in the gap
        ctx.save();
        ctx.translate(gx + gw / 2, 74);
        ctx.rotate((rng.float() - 0.5) * 0.3);
        ctx.fillRect(-gw / 2, -58, gw, 58);
        ctx.restore();
      } else {
        ctx.fillRect(gx, 14, gw, 62);
      }
      // dust rim where the pulled book's edge sat
      ctx.fillStyle = 'rgba(170,160,140,0.2)';
      ctx.fillRect(gx - 1, 72, gw + 2, 2);
    }
    // pale stripe ghosts — where books kept the sun off
    for (let i = 0; i < 3; i++) {
      if (!rng.bool(0.5)) continue;
      ctx.fillStyle = 'rgba(140,130,110,0.14)';
      ctx.fillRect(8 + rng.float() * 80, 14, 2.5 + rng.float() * 3, 62);
    }
  });
}

/** Desk ink — the blot a writing desk carries under the pot: ink
 * pool, drip trails to the edge, nib-scratch furrows. */
export function deskInk(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 50 + (rng.float() - 0.5) * 14;
    const cy = 44 + (rng.float() - 0.5) * 12;
    // the pool — near-black where the pot stood and spilled
    ctx.fillStyle = 'rgba(20,22,30,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9 + rng.float() * 4, 7 + rng.float() * 3, (rng.float() - 0.5) * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // blotted halo — where paper pressed the wet ink
    ctx.strokeStyle = 'rgba(24,26,36,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 13 + rng.float() * 5, 10 + rng.float() * 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    // drip trails to the desk edge
    for (let i = 0; i < 4; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(20,22,30,${0.35 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 8);
      ctx.lineTo(cx + Math.cos(a) * (16 + rng.float() * 14), cy + Math.sin(a) * (14 + rng.float() * 10));
      ctx.stroke();
      // the drop at trail's end
      ctx.fillStyle = 'rgba(18,20,28,0.5)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (17 + rng.float() * 14), cy + Math.sin(a) * (15 + rng.float() * 10), 1.2 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // nib furrows — test strokes near the pool
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(22,24,32,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.8;
      const nx = cx - 30 + rng.float() * 20;
      const ny = cy + 10 + rng.float() * 18;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.quadraticCurveTo(nx + 4, ny - 4 - rng.float() * 3, nx + 8 + rng.float() * 4, ny);
      ctx.stroke();
    }
    // flecks
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(20,22,30,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx - 34 + rng.float() * 70, cy - 20 + rng.float() * 42, 0.5 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Piano dust — the grey film a closed piano keeps under the fall:
 * a dust field with a wiped band where keys once lifted. */
export function pianoDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the film — uniform grey dust settled on the lid
    ctx.fillStyle = 'rgba(158,152,140,0.22)';
    ctx.fillRect(0, 0, 96, 96);
    const g = ctx.createRadialGradient(48, 40, 10, 48, 40, 42);
    g.addColorStop(0, 'rgba(168,162,150,0.14)');
    g.addColorStop(1, 'rgba(168,162,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the wiped band — someone opened it once, recently
    if (rng.bool(0.55)) {
      const wy = 30 + rng.float() * 20;
      ctx.fillStyle = 'rgba(96,88,72,0.3)';
      ctx.fillRect(10, wy, 76, 7 + rng.float() * 4);
      ctx.fillStyle = 'rgba(140,132,116,0.2)';
      ctx.fillRect(10, wy + 8, 76, 2);
    }
    // finger trails through the dust
    for (let i = 0; i < 4; i++) {
      const ty = 20 + rng.float() * 40;
      ctx.strokeStyle = `rgba(96,88,72,${0.24 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(14 + rng.float() * 10, ty);
      ctx.quadraticCurveTo(48, ty + (rng.float() - 0.5) * 10, 80 - rng.float() * 8, ty + (rng.float() - 0.5) * 6);
      ctx.stroke();
    }
    // dust ridge along the fall seam
    ctx.fillStyle = 'rgba(138,132,118,0.3)';
    ctx.fillRect(4, 50, 88, 1.6);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(148,142,128,${0.2 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 84, 48 + rng.float() * 5, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Pipe sweat — condensation the pipes carry: moisture beads along
 * the run, rust weeps at the joints, a damp drip on the wall below. */
export function pipeSweat(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // the run — a horizontal condensation band down the pipe line
    const py = 28 + rng.float() * 6;
    const g = ctx.createLinearGradient(0, py - 10, 0, py + 16);
    g.addColorStop(0, 'rgba(150,160,160,0)');
    g.addColorStop(0.5, `rgba(160,170,168,${0.16 + rng.float() * 0.1})`);
    g.addColorStop(1, 'rgba(150,160,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, py - 10, 96, 26);
    // beads — moisture dots along the pipe's underside
    for (let i = 0; i < 18; i++) {
      const bx = 4 + rng.float() * 88;
      ctx.fillStyle = `rgba(190,200,198,${0.3 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(bx, py + 3 + rng.float() * 6, 0.6 + rng.float() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // joint weeps — rust streaks at couplings
    for (let i = 0; i < 3; i++) {
      const jx = 14 + rng.float() * 68;
      ctx.fillStyle = `rgba(120,70,40,${0.26 + rng.float() * 0.18})`;
      ctx.fillRect(jx - 1.5, py, 3, 8 + rng.float() * 10);
      ctx.beginPath();
      ctx.arc(jx, py + 4, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // the wall drip — one damp line below where it fell
    const dx = 20 + rng.float() * 56;
    ctx.strokeStyle = 'rgba(130,140,136,0.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(dx, py + 8);
    ctx.lineTo(dx + (rng.float() - 0.5) * 2, py + 26 + rng.float() * 8);
    ctx.stroke();
  });
}

/** Frame lean — the marks a leaning frame leaves where its corners
 * rest: two rubbing pits and a dust-tide line along the bottom. */
export function frameLean(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // corner pits — two dark rubs where the frame's back corners dug
    const spread = 20 + rng.float() * 14;
    const py = 22 + rng.float() * 8;
    for (const sx of [-1, 1]) {
      ctx.fillStyle = `rgba(50,42,34,${0.4 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(32 + sx * spread * 0.5, py, 3 + rng.float(), 2.2 + rng.float(), sx * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // the polish ring the rock drew
      ctx.strokeStyle = 'rgba(90,78,64,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(32 + sx * spread * 0.5, py, 4.4 + rng.float(), 0, Math.PI * 2);
      ctx.stroke();
    }
    // dust tide — a pale line where the bottom edge kept the shelf
    const ty = 44 + rng.float() * 8;
    ctx.fillStyle = `rgba(150,142,124,${0.22 + rng.float() * 0.14})`;
    ctx.fillRect(10, ty, 44, 2.4);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(140,132,116,${0.18 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(12 + rng.float() * 40, ty + 2 + rng.float() * 4, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // a faint rub where the top edge pivoted
    ctx.strokeStyle = 'rgba(70,60,48,0.26)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(32, py - 14, 9 + rng.float() * 4, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  });
}

/** Drawer slit — the dark gap around a drawer face that never quite
 * shut: a shadow slit, worn pull smudges, snagged dust. */
export function drawerSlit(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // the slit — a dark L along the top and one side of the drawer
    const inset = 8 + rng.float() * 4;
    ctx.fillStyle = 'rgba(18,14,12,0.6)';
    ctx.fillRect(8, inset, 48, 2.4);
    ctx.fillRect(8 + 44 + rng.float() * 3, inset, 2.4, 38);
    // dim shade inside the face
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(40,34,28,0.18)');
    g.addColorStop(1, 'rgba(40,34,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // pull smudges — grease at the handle
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(44,38,30,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(28 + rng.float() * 10, 30 + rng.float() * 6, 2 + rng.float() * 1.5, 1.2 + rng.float(), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // snag dust — threads caught on the slit edge
    for (let i = 0; i < 8; i++) {
      const sx = 10 + rng.float() * 44;
      ctx.strokeStyle = `rgba(150,142,126,${0.2 + rng.float() * 0.14})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(sx, inset + 1);
      ctx.lineTo(sx + (rng.float() - 0.5) * 3, inset + 3.4);
      ctx.stroke();
    }
  });
}

/** Hearth spill — the ash a fireplace kicks past the fender: a grey
 * fan on the hearth stone, ember pits, stray flints. */
export function hearthSpill(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // the fan — grey ash drifting out of the opening
    const g = ctx.createRadialGradient(48, 8, 4, 48, 8, 48);
    g.addColorStop(0, 'rgba(140,136,128,0.4)');
    g.addColorStop(0.5, 'rgba(140,136,128,0.18)');
    g.addColorStop(1, 'rgba(140,136,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 64);
    // ember pits — dark burns where coals rolled
    for (let i = 0; i < 5; i++) {
      const ex = 20 + rng.float() * 56;
      const ey = 14 + rng.float() * 30;
      ctx.fillStyle = `rgba(30,26,22,${0.5 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 2.5 + rng.float() * 2, 1.8 + rng.float(), rng.float() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,60,30,0.3)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(ex, ey, 3.6 + rng.float() * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // flints — pale splinters of coal
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(52,46,40,${0.4 + rng.float() * 0.25})`;
      const fx = 16 + rng.float() * 64;
      const fy = 12 + rng.float() * 38;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(rng.float() * Math.PI);
      ctx.fillRect(-1.6, -0.7, 3.2 + rng.float() * 2, 1.4);
      ctx.restore();
    }
    // ash dust at the fender line
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(160,156,148,${0.24 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(8 + rng.float() * 80, 30 + rng.float() * 28, 0.6 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Crate splinters — the field a dragged crate leaves: torn wood
 * slivers, nail marks, a pale skid where the corner dug. */
export function crateSplinters(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // the skid — a pale groove where the corner dug
    const sy = 30 + rng.float() * 10;
    ctx.strokeStyle = `rgba(170,150,116,${0.3 + rng.float() * 0.15})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(10, sy);
    ctx.quadraticCurveTo(48, sy + (rng.float() - 0.5) * 8, 84, sy + (rng.float() - 0.5) * 5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,100,74,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, sy + 2.5);
    ctx.quadraticCurveTo(48, sy + 2 + (rng.float() - 0.5) * 8, 82, sy + 2);
    ctx.stroke();
    // slivers — torn wood flecks scattered along the skid
    for (let i = 0; i < 18; i++) {
      const t = rng.float();
      const fx = 10 + t * 74;
      const fy = sy + (rng.float() - 0.5) * 12;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(rng.float() * Math.PI);
      ctx.fillStyle = `rgba(150,126,92,${0.4 + rng.float() * 0.3})`;
      ctx.fillRect(-0.5, -0.5, 2 + rng.float() * 3, 1);
      ctx.restore();
    }
    // nail marks — dark punctures where slats tore
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(40,32,26,${0.45 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(20 + rng.float() * 56, sy - 6 + rng.float() * 14, 0.8 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Umbrella ring — the drip circle an umbrella stand keeps: a wet
 * ring on the floor, drip spatters radiating out, a rust stain. */
export function umbrellaRing(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48, cy = 48;
    // the wet ring — drip circle around the stand base
    ctx.strokeStyle = `rgba(90,96,88,${0.3 + rng.float() * 0.15})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 20 + rng.float() * 4, 0, Math.PI * 2);
    ctx.stroke();
    // inner film — damp pool inside the ring
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 22);
    g.addColorStop(0, 'rgba(80,86,80,0.22)');
    g.addColorStop(1, 'rgba(80,86,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    // spatters — drips radiating outside the ring
    for (let i = 0; i < 16; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 24 + rng.float() * 18;
      ctx.fillStyle = `rgba(90,96,88,${0.24 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.7 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // rust stain — where the stand's iron foot sat
    ctx.fillStyle = `rgba(110,64,36,${0.3 + rng.float() * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(cx + (rng.float() - 0.5) * 6, cy + (rng.float() - 0.5) * 6, 7 + rng.float() * 3, 5.5 + rng.float() * 2.5, rng.float(), 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Sheet shape — the faint shadow a sleeper leaves on linen: a pale
 * head-pillow stain, a hip hollow, the fold shadow at the edge. */
export function sheetShape(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // pillow stain — a dim yellowed oval where the head lay
    ctx.fillStyle = `rgba(148,132,104,${0.18 + rng.float() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(48, 20, 13 + rng.float() * 4, 8 + rng.float() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // the body band — faint perspiration line down the center
    const g = ctx.createLinearGradient(40, 26, 40, 80);
    g.addColorStop(0, 'rgba(150,134,108,0)');
    g.addColorStop(0.4, `rgba(150,134,108,${0.12 + rng.float() * 0.08})`);
    g.addColorStop(1, 'rgba(150,134,108,0)');
    ctx.fillStyle = g;
    ctx.fillRect(30, 26, 30, 56);
    // the hip hollow — a shallow depression shade
    ctx.fillStyle = `rgba(140,124,100,${0.14 + rng.float() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(48, 58, 20 + rng.float() * 6, 10 + rng.float() * 3, (rng.float() - 0.5) * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // fold shadows — where the linen creased under weight
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(120,108,88,${0.16 + rng.float() * 0.12})`;
      ctx.lineWidth = 1.2;
      const fy = 34 + i * 14;
      ctx.beginPath();
      ctx.moveTo(26, fy);
      ctx.quadraticCurveTo(48, fy + 3 - rng.float() * 6, 70, fy + (rng.float() - 0.5) * 4);
      ctx.stroke();
    }
    // sweat flecks — the faint print marks
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(140,124,100,${0.12 + rng.float() * 0.12})`;
      ctx.beginPath();
      ctx.arc(32 + rng.float() * 32, 30 + rng.float() * 40, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Knot holes — the eyes the boards kept: dark knots with sap rings,
 * a lifted splinter, a worn groove down the plank line. */
export function knotHoles(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // plank seam — the dark line between two boards
    const sx = 44 + rng.float() * 10;
    ctx.fillStyle = 'rgba(30,24,18,0.45)';
    ctx.fillRect(sx, 0, 1.8 + rng.float(), 96);
    // the knots — dark rings with woodgrain halos
    const knots = 2 + Math.floor(rng.float() * 3);
    for (let i = 0; i < knots; i++) {
      const kx = 14 + rng.float() * 68;
      const ky = 14 + rng.float() * 68;
      const kr = 3 + rng.float() * 3;
      ctx.fillStyle = `rgba(34,26,18,${0.55 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr, kr * 0.75, rng.float() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      // sap ring
      ctx.strokeStyle = 'rgba(120,100,70,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr + 2.2, kr * 0.75 + 1.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      // grain lines bending around it
      ctx.strokeStyle = 'rgba(90,74,54,0.22)';
      ctx.beginPath();
      ctx.moveTo(kx - kr - 8, ky - 3);
      ctx.quadraticCurveTo(kx, ky - kr - 4, kx + kr + 8, ky - 3);
      ctx.stroke();
    }
    // the lifted splinter — a pale torn line along the seam
    ctx.strokeStyle = `rgba(170,150,116,${0.3 + rng.float() * 0.15})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sx + 4, 20);
    ctx.lineTo(sx + 5 + rng.float() * 3, 40 + rng.float() * 20);
    ctx.stroke();
    // nail pairs at the joist lines
    for (let i = 0; i < 3; i++) {
      const ny = 18 + i * 28 + rng.float() * 6;
      for (const off of [-2, 2]) {
        ctx.fillStyle = 'rgba(26,20,16,0.55)';
        ctx.beginPath();
        ctx.arc(sx + 5 + off, ny, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

/** Dust shaft — the light a window throws onto the boards: a pale
 * trapezoid with the dust motes caught inside it. */
export function dustShaft(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    // the shaft — a bright parallelogram, soft far edge
    const g = ctx.createLinearGradient(24, 8, 72, 120);
    g.addColorStop(0, `rgba(216,204,168,${0.24 + rng.float() * 0.12})`);
    g.addColorStop(0.7, 'rgba(216,204,168,0.1)');
    g.addColorStop(1, 'rgba(216,204,168,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(34, 6);
    ctx.lineTo(66, 6);
    ctx.lineTo(78, 122);
    ctx.lineTo(46, 122);
    ctx.closePath();
    ctx.fill();
    // the mullion bars — shadow slots inside the shaft
    for (let i = 0; i < 2; i++) {
      const t = 0.35 + i * 0.25;
      ctx.fillStyle = 'rgba(90,80,64,0.22)';
      ctx.fillRect(34 + t * 36, 6, 2.2, 116 - t * 4);
    }
    // the motes — dust dots drifting in the light
    for (let i = 0; i < 22; i++) {
      const mx = 36 + rng.float() * 38;
      const my = 12 + rng.float() * 104;
      ctx.fillStyle = `rgba(226,216,188,${0.2 + rng.float() * 0.24})`;
      ctx.beginPath();
      ctx.arc(mx, my, 0.5 + rng.float() * 1, 0, Math.PI * 2);
      ctx.fill();
    }
    // the sill shadow — a darker band where the frame cuts the light
    ctx.fillStyle = 'rgba(96,86,68,0.18)';
    ctx.fillRect(30, 6, 44, 4);
  });
}

/** Flue stain — the soot column a fireplace breathes up the wall:
 * a dark rising plume, thumb-width streaks, a hot lip at the
 * mantel shelf. */
export function flueStain(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 8;
    // the plume — a soft soot bloom widening upward
    const g = ctx.createRadialGradient(cx, 96, 8, cx, 96, 64);
    g.addColorStop(0, `rgba(46,38,30,${0.4 + rng.float() * 0.15})`);
    g.addColorStop(0.55, 'rgba(46,38,30,0.18)');
    g.addColorStop(1, 'rgba(46,38,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 128);
    // rising streaks — smoke paths drafted up the plaster
    for (let i = 0; i < 6; i++) {
      const bx = cx - 16 + rng.float() * 32;
      ctx.strokeStyle = `rgba(50,42,34,${0.24 + rng.float() * 0.18})`;
      ctx.lineWidth = 1.4 + rng.float();
      ctx.beginPath();
      ctx.moveTo(bx, 96);
      ctx.quadraticCurveTo(bx + (rng.float() - 0.5) * 10, 60 - rng.float() * 20, bx + (rng.float() - 0.5) * 16, 30 + rng.float() * 16);
      ctx.stroke();
    }
    // the lip — dense soot right at the opening top
    ctx.fillStyle = 'rgba(34,28,22,0.55)';
    ctx.fillRect(cx - 16, 96, 32, 8);
    // grit carried up with the smoke
    for (let i = 0; i < 14; i++) {
      const gy = 90 - rng.float() * 60;
      const a = Math.pow(rng.float(), 0.6) * (100 - gy) * 0.35;
      ctx.fillStyle = `rgba(52,44,36,${0.3 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(cx + (rng.float() - 0.5) * 2 * a, gy, 0.5 + rng.float() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Label ghost — the pale rectangles a pharmacy shelf keeps where
 * paper labels peeled off: ghost grids, curled corners, paste. */
export function labelGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the grid — rows of pale label rectangles on dark shelf wood
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (!rng.bool(0.75)) continue;
        const lx = 10 + c * 20;
        const ly = 14 + r * 26;
        ctx.fillStyle = `rgba(196,186,160,${0.3 + rng.float() * 0.18})`;
        ctx.fillRect(lx, ly, 12, 9);
        // the scribed line inside — old handwriting bars
        ctx.strokeStyle = 'rgba(80,70,56,0.3)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(lx + 2, ly + 4);
        ctx.lineTo(lx + 10, ly + 4);
        ctx.moveTo(lx + 2, ly + 6);
        ctx.lineTo(lx + 8, ly + 6);
        ctx.stroke();
        // one curled corner
        if (rng.bool(0.3)) {
          ctx.fillStyle = 'rgba(90,80,66,0.4)';
          ctx.beginPath();
          ctx.moveTo(lx + 10, ly);
          ctx.lineTo(lx + 12, ly + 2);
          ctx.lineTo(lx + 12, ly);
          ctx.fill();
        }
      }
    }
    // paste smears — glue residue where labels failed
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(170,158,132,${0.16 + rng.float() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(16 + rng.float() * 64, 16 + rng.float() * 64, 4 + rng.float() * 3, 2.4 + rng.float() * 1.6, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Candle drip — the wax trails a candle throws down its holder:
 * white drips off the rim, a pool at the base, a tall wick smear. */
export function candleDrip(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 96, (ctx) => {
    const cx = 24;
    // wax pool at the holder's base
    ctx.fillStyle = `rgba(212,200,170,${0.35 + rng.float() * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(cx, 78, 14 + rng.float() * 4, 6 + rng.float() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // rim drips — wax running off the lip
    const drips = 4 + Math.floor(rng.float() * 4);
    for (let i = 0; i < drips; i++) {
      const dx = cx - 9 + rng.float() * 18;
      const dlen = 10 + rng.float() * 26;
      ctx.strokeStyle = `rgba(216,204,176,${0.5 + rng.float() * 0.25})`;
      ctx.lineWidth = 1.6 + rng.float() * 1.2;
      ctx.beginPath();
      ctx.moveTo(dx, 30);
      ctx.quadraticCurveTo(dx + (rng.float() - 0.5) * 3, 30 + dlen * 0.6, dx + (rng.float() - 0.5) * 4, 30 + dlen);
      ctx.stroke();
      // the tear drop at the end
      ctx.fillStyle = 'rgba(220,208,180,0.6)';
      ctx.beginPath();
      ctx.arc(dx + (rng.float() - 0.5) * 3, 30 + dlen, 1.4 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // smoke kiss — a soot column off the wick top
    ctx.strokeStyle = 'rgba(60,54,46,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, 26);
    ctx.quadraticCurveTo(cx + 3, 14, cx + 1, 4);
    ctx.stroke();
    // wax specks sprayed when lit
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(212,200,170,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx - 10 + rng.float() * 20, 50 + rng.float() * 30, 0.5 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Plaster bulge — the blister a damp wall pushes out: a raised
 * dome shade, crack crown around it, damp skirt bleeding down. */
export function plasterBulge(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 14;
    const cy = 44 + (rng.float() - 0.5) * 12;
    // the damp skirt — moisture bleeding below the blister
    const dg = ctx.createLinearGradient(0, cy + 8, 0, cy + 44);
    dg.addColorStop(0, `rgba(110,104,84,${0.2 + rng.float() * 0.12})`);
    dg.addColorStop(1, 'rgba(110,104,84,0)');
    ctx.fillStyle = dg;
    ctx.fillRect(cx - 24, cy + 8, 48, 40);
    // the dome — lit top, shaded underside (a raised blister)
    const g = ctx.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, 18);
    g.addColorStop(0, 'rgba(190,182,164,0.4)');
    g.addColorStop(0.6, `rgba(120,110,94,${0.24 + rng.float() * 0.12})`);
    g.addColorStop(1, 'rgba(70,62,50,0.12)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 16 + rng.float() * 4, 13 + rng.float() * 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // crack crown — hairlines ringing the blister
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng.float() * 0.4;
      ctx.strokeStyle = `rgba(48,40,32,${0.4 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      const r0 = 15 + rng.float() * 3;
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.82);
      ctx.lineTo(cx + Math.cos(a) * (r0 + 4 + rng.float() * 6), cy + Math.sin(a) * (r0 + 4 + rng.float() * 5) * 0.82);
      ctx.stroke();
    }
    // flake — a fallen plaster scale at the skirt's foot
    ctx.fillStyle = 'rgba(180,172,152,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx + (rng.float() - 0.5) * 20, cy + 40, 3, 2, rng.float(), 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Mirror blind — the tarnish a mirror loses its silvering to:
 * dark bloom at the edges, fogged lobes, a cold grey field. */
export function mirrorBlind(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // edge tarnish — dark creep in from the frame
    ctx.strokeStyle = `rgba(38,34,32,${0.5 + rng.float() * 0.15})`;
    ctx.lineWidth = 7 + rng.float() * 4;
    ctx.strokeRect(4, 4, 88, 88);
    // fogged lobes — silvering lost in grey billows
    for (let i = 0; i < 5; i++) {
      const lx = 14 + rng.float() * 68;
      const ly = 14 + rng.float() * 68;
      ctx.fillStyle = `rgba(96,92,88,${0.18 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 8 + rng.float() * 8, 6 + rng.float() * 6, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // fogged speckle — the fine pinpoints where it failed
    for (let i = 0; i < 24; i++) {
      const x = rng.float() * 88 + 4;
      const y = rng.float() * 88 + 4;
      // heavier near the edges
      const edge = Math.min(x, 96 - x, y, 96 - y) / 48;
      if (rng.float() > 0.3 + edge) continue;
      ctx.fillStyle = `rgba(60,56,52,${0.3 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.5 + rng.float() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // the kiss — a dark bloom where a face pressed
    if (rng.bool(0.5)) {
      ctx.fillStyle = 'rgba(50,46,44,0.3)';
      ctx.beginPath();
      ctx.ellipse(48 + (rng.float() - 0.5) * 10, 40, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Door dent — the pit a doorknob pounds into the wall it slams
 * into: a round crater, ring cracks, paint chips. */
export function doorDent(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 32;
    // the crater — dark pit at the impact point
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 10);
    g.addColorStop(0, 'rgba(24,20,16,0.65)');
    g.addColorStop(0.6, `rgba(60,50,40,${0.4 + rng.float() * 0.15})`);
    g.addColorStop(1, 'rgba(60,50,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(18,14,12,0.7)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3.5 + rng.float(), 3 + rng.float(), rng.float() * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // ring cracks — hairlines radiating from the pit
    for (let i = 0; i < 5; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(40,32,26,${0.4 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 3);
      ctx.lineTo(cx + Math.cos(a) * (9 + rng.float() * 8), cy + Math.sin(a) * (8 + rng.float() * 6));
      ctx.stroke();
    }
    // paint chips — flecks knocked loose around the crater
    for (let i = 0; i < 10; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 6 + rng.float() * 12;
      ctx.fillStyle = `rgba(170,160,140,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.5 + rng.float() * 1, 0, Math.PI * 2);
      ctx.fill();
    }
    // smear — a rubbed arc where the knob scraped
    ctx.strokeStyle = 'rgba(80,70,58,0.28)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 12 + rng.float() * 3, Math.PI * 0.4, Math.PI * 1.1);
    ctx.stroke();
  });
}

/** Tap calc — the lime a tap carries where it always drips: white
 * calcified crust at the spout's mouth, streaks down the neck. */
export function tapCalc(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    // calc crust — white crusted lump at the spout mouth
    const cy = 74 + rng.float() * 6;
    ctx.fillStyle = `rgba(206,204,190,${0.5 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(32, cy, 9 + rng.float() * 3, 5 + rng.float() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // crust texture — gritty dots in the lump
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(190,190,176,${0.4 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.arc(26 + rng.float() * 12, cy - 3 + rng.float() * 8, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // calc streaks — drips down the neck that crystallized
    for (let i = 0; i < 4; i++) {
      const sx = 26 + rng.float() * 12;
      ctx.strokeStyle = `rgba(200,198,184,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.2 + rng.float() * 0.8;
      ctx.beginPath();
      ctx.moveTo(sx, cy - 6);
      ctx.lineTo(sx + (rng.float() - 0.5) * 4, cy - 20 - rng.float() * 24);
      ctx.stroke();
    }
    // verdigris bloom — copper pipes corrode green
    if (rng.bool(0.5)) {
      ctx.fillStyle = 'rgba(96,140,110,0.3)';
      ctx.beginPath();
      ctx.ellipse(32 + (rng.float() - 0.5) * 8, cy - 14, 5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // the drip — one wet drop still hanging
    ctx.fillStyle = 'rgba(190,204,200,0.55)';
    ctx.beginPath();
    ctx.arc(32, cy + 7, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Rust halo — the ring a floor drain keeps: orange oxidation
 * bleeding out from the grate, a dark wet center. */
export function rustHalo(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48, cy = 48;
    // the halo — rust bloom radiating from the drain rim
    const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 40);
    g.addColorStop(0, 'rgba(44,36,28,0.5)');
    g.addColorStop(0.35, `rgba(120,70,38,${0.4 + rng.float() * 0.15})`);
    g.addColorStop(0.7, 'rgba(120,70,38,0.16)');
    g.addColorStop(1, 'rgba(120,70,38,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // the wet center — still-damp dark pool
    ctx.fillStyle = 'rgba(30,26,22,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, 7 + rng.float() * 2, 0, Math.PI * 2);
    ctx.fill();
    // oxide flecks — rust dust scattered on the halo
    for (let i = 0; i < 20; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 10 + Math.pow(rng.float(), 0.7) * 30;
      ctx.fillStyle = `rgba(140,80,42,${0.3 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.6 + rng.float() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // drip channels — rust running outward along grout lines
    for (let i = 0; i < 3; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(110,64,34,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
      ctx.lineTo(cx + Math.cos(a) * (30 + rng.float() * 12), cy + Math.sin(a) * (30 + rng.float() * 12));
      ctx.stroke();
    }
  });
}

/** Porcelain crazing — the crackle an old basin wears: fine
 * intersecting hairlines like ice crackle, rust bleeds at nodes. */
export function porcelainCraze(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the crackle — fine intersecting hairlines over the surface
    for (let i = 0; i < 14; i++) {
      let x = rng.float() * 96;
      let y = rng.float() * 96;
      let a = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(70,64,54,${0.3 + rng.float() * 0.25})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        a += (rng.float() - 0.5) * 1.4;
        x += Math.cos(a) * (4 + rng.float() * 8);
        y += Math.sin(a) * (4 + rng.float() * 8);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // node bleeds — rust stains at the deep cracks' crossings
    for (let i = 0; i < 6; i++) {
      const nx = 12 + rng.float() * 72;
      const ny = 12 + rng.float() * 72;
      ctx.fillStyle = `rgba(116,72,42,${0.26 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(nx, ny, 1.6 + rng.float() * 1.8, 0, Math.PI * 2);
      ctx.fill();
      // short bleed run
      ctx.strokeStyle = 'rgba(116,72,42,0.3)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(nx + (rng.float() - 0.5) * 8, ny + 4 + rng.float() * 8);
      ctx.stroke();
    }
    // lime smear — a pale wash where the water sat
    if (rng.bool(0.6)) {
      const g = ctx.createRadialGradient(48, 30, 4, 48, 30, 34);
      g.addColorStop(0, 'rgba(200,198,184,0.18)');
      g.addColorStop(1, 'rgba(200,198,184,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 96, 96);
    }
  });
}

/** Hook sag — the plaster a ceiling hook pulls down over years:
 * a shadow halo under the mount, sag cracks, rust from the bolt. */
export function hookSag(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 30;
    // the pull halo — a dim ring where the mount plate rocks
    ctx.strokeStyle = `rgba(60,52,42,${0.35 + rng.float() * 0.15})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + rng.float() * 2, 0, Math.PI * 2);
    ctx.stroke();
    // sag cracks — downward stress lines under the plate
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * (0.15 + i * 0.22) + rng.float() * 0.1;
      ctx.strokeStyle = `rgba(50,42,34,${0.4 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
      ctx.lineTo(cx + Math.cos(a) * (13 + rng.float() * 7), cy + Math.sin(a) * (14 + rng.float() * 8));
      ctx.stroke();
    }
    // bolt rust — a rust pool where the bolt sits
    ctx.fillStyle = `rgba(110,64,36,${0.4 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2 + rng.float(), 0, Math.PI * 2);
    ctx.fill();
    // the drip — one rust run straight down
    ctx.strokeStyle = 'rgba(110,64,36,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 3);
    ctx.lineTo(cx + (rng.float() - 0.5) * 2, cy + 12 + rng.float() * 10);
    ctx.stroke();
    // plaster dust that fell off
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(170,162,144,${0.2 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(cx - 14 + rng.float() * 28, cy + 12 + rng.float() * 12, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Chain shine — the polish a dragged chain leaves: a bright worn
 * line through grime, link dimples, dark grease tails. */
export function chainShine(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    const cy = 24;
    // grease tail — a dark bed the chain lay in
    const g = ctx.createLinearGradient(8, cy, 88, cy);
    g.addColorStop(0, 'rgba(30,26,22,0.4)');
    g.addColorStop(0.8, `rgba(30,26,22,${0.3 + rng.float() * 0.15})`);
    g.addColorStop(1, 'rgba(30,26,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(8, cy - 4, 80, 9);
    // the shine — worn bright line where links rode
    ctx.strokeStyle = `rgba(190,180,160,${0.35 + rng.float() * 0.2})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(10, cy);
    ctx.quadraticCurveTo(46, cy + (rng.float() - 0.5) * 6, 84, cy + (rng.float() - 0.5) * 3);
    ctx.stroke();
    // link dimples — evenly spaced pits along the shine
    const links = 7 + Math.floor(rng.float() * 4);
    for (let i = 0; i < links; i++) {
      const lx = 14 + i * (68 / links);
      ctx.fillStyle = `rgba(60,54,44,${0.4 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(lx, cy + (rng.float() - 0.5) * 2, 1.6, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // grease smudges flaking off
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(36,30,24,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(12 + rng.float() * 72, cy - 8 + rng.float() * 18, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Rope fray — the fiber a rope rubs off: loose strands curling out
 * of the lay, snapped hairs, a chafe shade where it runs. */
export function ropeFray(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 96, (ctx) => {
    const cx = 24;
    // the chafe band — a worn shade where the rope runs tight
    const g = ctx.createLinearGradient(0, 34, 0, 58);
    g.addColorStop(0, 'rgba(140,124,98,0)');
    g.addColorStop(0.5, `rgba(140,124,98,${0.3 + rng.float() * 0.15})`);
    g.addColorStop(1, 'rgba(140,124,98,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 34, 48, 24);
    // snapped hairs — fibers curling off the lay
    for (let i = 0; i < 14; i++) {
      const hy = 30 + rng.float() * 34;
      const side = rng.bool(0.5) ? -1 : 1;
      ctx.strokeStyle = `rgba(170,154,120,${0.4 + rng.float() * 0.3})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + side * 3, hy);
      ctx.quadraticCurveTo(cx + side * (6 + rng.float() * 5), hy + (rng.float() - 0.5) * 4, cx + side * (9 + rng.float() * 6), hy + (rng.float() - 0.5) * 8);
      ctx.stroke();
    }
    // lay lines — the twisted strands still holding
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(120,106,80,${0.3 + rng.float() * 0.15})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - 4 + i * 3.5, 6);
      ctx.lineTo(cx - 6 + i * 3.5, 92);
      ctx.stroke();
    }
    // fiber dust below the fray
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(150,134,104,${0.24 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx - 8 + rng.float() * 16, 60 + rng.float() * 28, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Leaf litter — the leaves a broken pane let in: curled silhouettes
 * scattered inward from the sill line, damp stains under them. */
export function leafLitter(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the drift — leaves scattered inward, denser at the sill side
    const count = 10 + Math.floor(rng.float() * 7);
    for (let i = 0; i < count; i++) {
      const lx = 10 + rng.float() * 76;
      const ly = 12 + Math.pow(rng.float(), 1.4) * 74;
      const size = 3 + rng.float() * 4;
      const rot = rng.float() * Math.PI * 2;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      // the leaf — a curled pointed oval
      const shade = rng.bool(0.6) ? '96,74,44' : '70,62,38';
      ctx.fillStyle = `rgba(${shade},${0.4 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.quadraticCurveTo(size * 0.8, 0, 0, size);
      ctx.quadraticCurveTo(-size * 0.8, 0, 0, -size);
      ctx.fill();
      // stem line
      ctx.strokeStyle = `rgba(${shade},0.5)`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(0, size + 1.5);
      ctx.stroke();
      ctx.restore();
      // the damp stain it left
      if (rng.bool(0.35)) {
        ctx.fillStyle = 'rgba(70,64,50,0.14)';
        ctx.beginPath();
        ctx.arc(lx, ly + 2, size * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // grit the wind carried
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(110,100,80,${0.2 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(10 + rng.float() * 76, 10 + rng.float() * 80, 0.5 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Bell rose — the servant-bell plate a wall keeps: a porcelain
 * rosette with wire holes, rust ring, dust lip on top. */
export function bellRose(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 30;
    // plate ghost — a pale ring where the rosette sat
    ctx.strokeStyle = `rgba(190,182,164,${0.3 + rng.float() * 0.15})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.stroke();
    // the porcelain disc that stays
    ctx.fillStyle = `rgba(196,190,174,${0.4 + rng.float() * 0.15})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    // the wire holes — dark bores through the plate
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.fillStyle = 'rgba(26,20,16,0.7)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // center screw pit
    ctx.fillStyle = 'rgba(30,24,18,0.75)';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // rust ring — oxidation bleeding under the plate
    ctx.strokeStyle = `rgba(110,64,36,${0.28 + rng.float() * 0.15})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.stroke();
    // dust lip — dust settled on the rosette's top edge
    ctx.strokeStyle = 'rgba(160,152,134,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  });
}

/** Web drape — the fan a spider works between a furniture top and
 * the wall: pale thread radii, sag lines, a few caught motes. */
export function webDrape(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // anchor at top-left corner; threads fan down-right
    const ax = 6, ay = 6;
    // radii — spokes from the anchor
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 0.08 + (i / 8) * Math.PI * 0.4;
      ctx.strokeStyle = `rgba(200,196,186,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + Math.cos(a) * (60 + rng.float() * 20), ay + Math.sin(a) * (60 + rng.float() * 20));
      ctx.stroke();
    }
    // sag rings — drooping connecting threads between spokes
    for (let r = 2; r < 6; r++) {
      ctx.strokeStyle = `rgba(196,192,182,${0.22 + rng.float() * 0.16})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const r0 = r * 13;
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * 0.08 + (i / 10) * Math.PI * 0.4;
        const sag = Math.sin((i / 10) * Math.PI * 5) * 2;
        const px = ax + Math.cos(a) * (r0 + sag);
        const py = ay + Math.sin(a) * (r0 + sag);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // caught motes — dust and a gnat or two in the web
    for (let i = 0; i < 12; i++) {
      const a = rng.float() * Math.PI * 0.45 + Math.PI * 0.08;
      const r = 16 + rng.float() * 52;
      ctx.fillStyle = `rgba(180,176,166,${0.3 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(ax + Math.cos(a) * r, ay + Math.sin(a) * r, 0.6 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // one dark speck — the thing that made it
    ctx.fillStyle = 'rgba(50,44,38,0.6)';
    ctx.beginPath();
    ctx.arc(ax + 20 + rng.float() * 20, ay + 20 + rng.float() * 20, 1.3, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Keyhole wear — the polish ring a keyhole gets from a lifetime of
 * fumbled keys: a bright worn ellipse, scratch fan, oil smudge. */
export function keyholeWear(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 34;
    // the fumble fan — short scratches where the key missed
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (0.3 + rng.float() * 0.4);
      const r = 6 + rng.float() * 14;
      ctx.strokeStyle = `rgba(120,104,84,${0.3 + rng.float() * 0.25})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6);
      ctx.stroke();
    }
    // the polish ring — metal grease worked into the plate edge
    ctx.strokeStyle = `rgba(176,160,128,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 7 + rng.float(), 9 + rng.float(), 0, 0, Math.PI * 2);
    ctx.stroke();
    // the keyhole itself — near-black slot
    ctx.fillStyle = 'rgba(16,12,10,0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 1.4, cy - 2, 2.8, 7);
    // oil smear — the dark dab under the slot
    ctx.fillStyle = `rgba(40,34,28,${0.3 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 5 + rng.float() * 3, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // brass glints — where the plate's edge caught light
    for (let i = 0; i < 5; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.fillStyle = `rgba(196,168,110,${0.3 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 7, cy + Math.sin(a) * 9, 0.6 + rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Candle skin — the wax jacket a burnt candle sheds: collapsed
 * shell walls, a dripped skirt, wick stub. */
export function candleSkin(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 96, (ctx) => {
    const cx = 24;
    // the skirt — pooled wax where the shell collapsed
    ctx.fillStyle = `rgba(214,200,168,${0.45 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(cx, 80, 12 + rng.float() * 3, 5 + rng.float() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // shell walls — the hollow cylinder standing where it burned down
    ctx.strokeStyle = `rgba(208,194,160,${0.5 + rng.float() * 0.2})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx - 9, 78);
    ctx.quadraticCurveTo(cx - 11, 40, cx - 8 + rng.float() * 3, 14 + rng.float() * 6);
    ctx.moveTo(cx + 9, 78);
    ctx.quadraticCurveTo(cx + 11, 40, cx + 8 - rng.float() * 3, 14 + rng.float() * 6);
    ctx.stroke();
    // the slump — a melted lip sagged sideways
    ctx.strokeStyle = `rgba(214,200,168,${0.55 + rng.float() * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 8, 16);
    ctx.quadraticCurveTo(cx + (rng.float() - 0.5) * 6, 10 + rng.float() * 8, cx + 8, 18 + rng.float() * 4);
    ctx.stroke();
    // wick stub — the black thread still standing
    ctx.strokeStyle = 'rgba(20,16,14,0.7)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx, 20);
    ctx.quadraticCurveTo(cx + 2, 14, cx + 1, 9);
    ctx.stroke();
    // drips down the shell
    for (let i = 0; i < 4; i++) {
      const dx = cx - 8 + rng.float() * 16;
      ctx.strokeStyle = `rgba(218,206,178,${0.4 + rng.float() * 0.25})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(dx, 20 + rng.float() * 10);
      ctx.lineTo(dx + (rng.float() - 0.5) * 3, 30 + rng.float() * 30);
      ctx.stroke();
    }
  });
}

/** Stair shine — the polish a tread wears at the lane: a worn bright
 * band mid-tread, darkened edges, heel chips on the nose. */
export function treadShine(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // the lane — a polished band mid-tread where feet land
    const g = ctx.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, 'rgba(140,130,110,0)');
    g.addColorStop(0.45, `rgba(176,166,142,${0.3 + rng.float() * 0.15})`);
    g.addColorStop(0.75, `rgba(176,166,142,${0.2 + rng.float() * 0.1})`);
    g.addColorStop(1, 'rgba(140,130,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 48);
    // the dull lane edges — grime either side of the worn band
    ctx.fillStyle = 'rgba(50,44,36,0.14)';
    ctx.fillRect(0, 0, 96, 8);
    ctx.fillRect(0, 42, 96, 6);
    // heel chips — nicks along the tread nose
    for (let i = 0; i < 7; i++) {
      const nx = 12 + rng.float() * 72;
      ctx.fillStyle = `rgba(96,84,64,${0.4 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(nx, 44, 1.8 + rng.float(), 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // the nose itself — a bright worn edge
    ctx.strokeStyle = `rgba(196,186,164,${0.4 + rng.float() * 0.15})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(4, 45);
    ctx.lineTo(92, 45);
    ctx.stroke();
    // dust at the tread's back corner
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(130,120,102,${0.16 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(8 + rng.float() * 80, 2 + rng.float() * 8, 0.6 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Moth bites — the holes moths eat in hanging wool and silk: small
 * chewed voids, frayed edges, shed scales dusting below. */
export function mothBites(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the bites — irregular voids chewed through the fabric
    const bites = 6 + Math.floor(rng.float() * 5);
    for (let i = 0; i < bites; i++) {
      const bx = 14 + rng.float() * 68;
      const by = 16 + rng.float() * 64;
      const bs = 2 + rng.float() * 3.5;
      ctx.fillStyle = `rgba(26,22,18,${0.55 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(bx, by, bs, bs * (0.6 + rng.float() * 0.5), rng.float() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      // frayed threads at the hole's rim
      ctx.strokeStyle = `rgba(150,138,118,${0.4 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.5;
      for (let f = 0; f < 3; f++) {
        const a = rng.float() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(bx + Math.cos(a) * bs, by + Math.sin(a) * bs * 0.7);
        ctx.lineTo(bx + Math.cos(a) * (bs + 1.5 + rng.float() * 2), by + Math.sin(a) * (bs + 2 + rng.float() * 2));
        ctx.stroke();
      }
    }
    // shed scales — moth dust drifts below the damage
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = `rgba(190,180,158,${0.2 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(20 + rng.float() * 56, 56 + rng.float() * 36, 0.5 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // a web pull — one thread still holding the fabric
    ctx.strokeStyle = 'rgba(180,172,152,0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(30 + rng.float() * 30, 14);
    ctx.quadraticCurveTo(48, 40, 34 + rng.float() * 30, 70);
    ctx.stroke();
  });
}

/** Valance dust — the dust a curtain top collects: a grey film on
 * the header, a swept lane where hands ran it back. */
export function valanceDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // the film — heavy dust along the header
    const g = ctx.createLinearGradient(0, 0, 0, 30);
    g.addColorStop(0, `rgba(150,142,124,${0.4 + rng.float() * 0.15})`);
    g.addColorStop(1, 'rgba(150,142,124,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 32);
    // the folds — vertical gathers shaded in the dust
    for (let i = 0; i < 8; i++) {
      const fx = 8 + i * 11;
      ctx.fillStyle = `rgba(110,102,88,${0.18 + rng.float() * 0.12})`;
      ctx.fillRect(fx, 0, 2.5, 30 + rng.float() * 6);
    }
    // the swept lane — a hand wiped it once
    ctx.fillStyle = `rgba(180,170,148,${0.3 + rng.float() * 0.15})`;
    ctx.beginPath();
    ctx.moveTo(20, 8);
    ctx.quadraticCurveTo(48, 4 + rng.float() * 4, 76, 10 + rng.float() * 4);
    ctx.lineTo(76, 14 + rng.float() * 4);
    ctx.quadraticCurveTo(48, 10 + rng.float() * 4, 20, 14);
    ctx.fill();
    // dust lumps at the rod line
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(160,152,134,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 84, 2 + rng.float() * 8, 0.7 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Curtain shadow — the silhouette a curtain throws on the wall
 * behind it: soft vertical folds in dark shade, a light slit at
 * the window's edge. */
export function curtainShade(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    // the shade — soft vertical folds
    for (let i = 0; i < 6; i++) {
      const fx = 12 + i * 13;
      const gw = 8 + rng.float() * 4;
      const g = ctx.createLinearGradient(fx, 0, fx + gw, 0);
      g.addColorStop(0, 'rgba(60,52,44,0)');
      g.addColorStop(0.5, `rgba(60,52,44,${0.2 + rng.float() * 0.12})`);
      g.addColorStop(1, 'rgba(60,52,44,0)');
      ctx.fillStyle = g;
      ctx.fillRect(fx, 8, gw, 112);
    }
    // the slit — bright knife-edge where the window light leaked
    const sx = 8 + rng.float() * 6;
    const g2 = ctx.createLinearGradient(sx, 0, sx + 8, 0);
    g2.addColorStop(0, `rgba(210,200,176,${0.3 + rng.float() * 0.15})`);
    g2.addColorStop(1, 'rgba(210,200,176,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(sx, 8, 8, 110);
    // hem shadow — the bottom edge's darker line
    ctx.fillStyle = 'rgba(50,44,36,0.28)';
    ctx.fillRect(10, 116, 76, 3);
    // sway ghost — one fold bent outward by a breeze
    ctx.strokeStyle = 'rgba(70,60,50,0.22)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(30, 8);
    ctx.quadraticCurveTo(38 + rng.float() * 8, 60, 32 + rng.float() * 6, 116);
    ctx.stroke();
  });
}

/** Pot ring — the scorch ring a hot pot brands into wood: a dark
 * ring, pale heat halo, a burnt-through patch at the hottest edge. */
export function potRing(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 12;
    const cy = 48 + (rng.float() - 0.5) * 12;
    // heat halo — a pale bleach ring where steam dried the wax
    ctx.strokeStyle = `rgba(190,178,150,${0.25 + rng.float() * 0.15})`;
    ctx.lineWidth = 6 + rng.float() * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 20 + rng.float() * 4, 0, Math.PI * 2);
    ctx.stroke();
    // the ring — the scorched brand itself
    ctx.strokeStyle = `rgba(50,38,26,${0.55 + rng.float() * 0.2})`;
    ctx.lineWidth = 4 + rng.float() * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 16 + rng.float() * 3, 0, Math.PI * 2);
    ctx.stroke();
    // the hot edge — one arc where the pot sat longest
    const a0 = rng.float() * Math.PI * 2;
    ctx.strokeStyle = 'rgba(24,18,14,0.7)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, 16 + rng.float() * 3, a0, a0 + 1 + rng.float() * 1.4);
    ctx.stroke();
    // scorch specks — carbon freckles inside the ring
    for (let i = 0; i < 12; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = rng.float() * 13;
      ctx.fillStyle = `rgba(40,32,24,${0.3 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Lid steam — the condensation line a lidded pot leaves: a wet
 * ring, drip beads inside it, a mineral ghost where it dried. */
export function lidSteam(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48, cy = 48;
    // the wet ring — a damp circle the lid's rim sealed
    ctx.strokeStyle = `rgba(140,152,146,${0.35 + rng.float() * 0.2})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(cx, cy, 22 + rng.float() * 3, 0, Math.PI * 2);
    ctx.stroke();
    // drip beads — condensed drops inside the ring
    for (let i = 0; i < 14; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 8 + rng.float() * 13;
      ctx.fillStyle = `rgba(170,182,174,${0.3 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.7 + rng.float() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // mineral ghost — the pale tide mark left when it dried
    ctx.strokeStyle = `rgba(196,192,176,${0.25 + rng.float() * 0.15})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 18 + rng.float() * 2, 0, Math.PI * 2);
    ctx.stroke();
    // runnel — one drip that escaped the lid's edge
    const ra = rng.float() * Math.PI * 2;
    ctx.strokeStyle = 'rgba(140,152,146,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ra) * 23, cy + Math.sin(ra) * 23);
    ctx.lineTo(cx + Math.cos(ra) * (30 + rng.float() * 8), cy + Math.sin(ra) * (30 + rng.float() * 8));
    ctx.stroke();
  });
}

/** Wine rack ghost — the pale rings a rack keeps where bottles
 * lay: paired ring pairs on the shelf, drip stains, dust rows. */
export function rackGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the rows — bottle-ring pairs stacked up the shelf
    for (let r = 0; r < 3; r++) {
      const ry = 24 + r * 26;
      const bottles = 3 + Math.floor(rng.float() * 2);
      for (let b2 = 0; b2 < bottles; b2++) {
        const bx = 16 + b2 * 24 + (rng.float() - 0.5) * 4;
        // the ring — where the bottle's shoulder rested
        ctx.strokeStyle = `rgba(150,138,116,${0.3 + rng.float() * 0.2})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(bx, ry, 8, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        // the heel mark — the bottle's back ring
        ctx.beginPath();
        ctx.ellipse(bx + 10, ry, 5, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // shelf dust between the rows
      ctx.fillStyle = 'rgba(140,132,114,0.14)';
      ctx.fillRect(8, ry + 8, 80, 3);
    }
    // the drip — wine bled down the shelf face once
    if (rng.bool(0.5)) {
      const dx = 20 + rng.float() * 56;
      ctx.strokeStyle = 'rgba(70,36,36,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dx, 20);
      ctx.lineTo(dx + (rng.float() - 0.5) * 4, 60 + rng.float() * 14);
      ctx.stroke();
    }
  });
}

/** Sprint 485 — plaster wound: a hole in the render shows the wood lath behind, crumbs below. */
export function lathExpose(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // broken plaster rim — an irregular gap in the wall skin
    const cx = 48, cy = 44;
    const rim: [number, number][] = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 24 + rng.float() * 10;
      rim.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.72]);
    }
    // dark cavity behind
    g.fillStyle = 'rgba(18,12,9,0.88)';
    g.beginPath();
    rim.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.closePath(); g.fill();
    // lath strips inside the cavity
    g.fillStyle = 'rgba(96,72,46,0.9)';
    for (let i = 0; i < 5; i++) {
      const ly = cy - 14 + i * 7;
      g.fillRect(cx - 20 - rng.float() * 4, ly, 40 + rng.float() * 6, 3.4);
    }
    // bright jagged plaster edge
    g.strokeStyle = 'rgba(216,205,186,0.55)';
    g.lineWidth = 1.6;
    g.beginPath();
    rim.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.closePath(); g.stroke();
    // hair cracks radiating from the rim
    g.strokeStyle = 'rgba(60,50,42,0.5)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r0 = 22 + rng.float() * 6, len = 8 + rng.float() * 14;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.72);
      g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.72);
      g.stroke();
    }
    // fallen crumbs at the wound's foot
    g.fillStyle = 'rgba(200,190,172,0.5)';
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      g.fillRect(cx - 14 + t * 28 + rng.range(-3, 3), cy + 20 + rng.float() * 6, 1.6, 1.6);
    }
  });
}

/** Sprint 485 — drain ring: rust halo + drip channels around a floor grate. */
export function drainRust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48, cy = 48;
    // diffuse rust halo
    const halo = g.createRadialGradient(cx, cy, 12, cx, cy, 42);
    halo.addColorStop(0, 'rgba(122,62,26,0.0)');
    halo.addColorStop(0.62, 'rgba(122,62,26,0.42)');
    halo.addColorStop(1, 'rgba(122,62,26,0.0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, 96, 96);
    // solid ring where water stands against the grate rim
    g.strokeStyle = 'rgba(96,44,16,0.75)';
    g.lineWidth = 3 + rng.float() * 1.5;
    g.beginPath(); g.arc(cx, cy, 15, 0, Math.PI * 2); g.stroke();
    // oxide speckle inside
    g.fillStyle = 'rgba(70,30,12,0.6)';
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(3, 14);
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.4, 1.4);
    }
    // drip channels walking away downslope
    g.strokeStyle = 'rgba(96,44,16,0.45)';
    g.lineWidth = 1;
    const nd = 3 + (rng.float() < 0.5 ? 1 : 0);
    for (let i = 0; i < nd; i++) {
      const a = rng.range(0.3, Math.PI - 0.3); // downward hemisphere
      let x = cx + Math.cos(a) * 16, y = cy + Math.sin(a) * 16;
      g.beginPath(); g.moveTo(x, y);
      const steps = 4 + Math.floor(rng.float() * 3);
      for (let s = 0; s < steps; s++) {
        x += Math.cos(a) * rng.range(4, 8) + rng.range(-2, 2);
        y += Math.sin(a) * rng.range(5, 9);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

/** Sprint 485 — underbed haze: dust pelt + the small things that rolled under and stayed. */
export function underbedHaze(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // long soft dust field, darkest at the back (top = deeper under)
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(60,52,44,0.55)');
    grad.addColorStop(0.55, 'rgba(70,62,52,0.34)');
    grad.addColorStop(1, 'rgba(70,62,52,0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 96, 64);
    // dust-bunny clumps along the back edge
    g.fillStyle = 'rgba(96,88,76,0.5)';
    for (let i = 0; i < 14; i++) {
      const x = rng.range(6, 90), y = rng.range(2, 18);
      g.beginPath(); g.ellipse(x, y, rng.range(2, 5), rng.range(1, 2.4), rng.range(0, 1), 0, Math.PI * 2); g.fill();
    }
    // lost buttons / coins / a dead moth — the small archaeology
    for (let i = 0; i < 5; i++) {
      const x = rng.range(10, 86), y = rng.range(20, 44);
      if (rng.float() < 0.4) { // coin
        g.fillStyle = 'rgba(140,120,80,0.6)';
        g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
      } else if (rng.float() < 0.5) { // button
        g.fillStyle = 'rgba(120,110,96,0.55)';
        g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(40,34,28,0.6)';
        g.fillRect(x - 0.4, y - 0.4, 0.8, 0.8);
      } else { // dead moth
        g.fillStyle = 'rgba(150,140,120,0.5)';
        g.beginPath(); g.ellipse(x, y, 2.4, 1, rng.range(0, 3), 0, Math.PI * 2); g.fill();
      }
    }
    // sweep-front: someone pushed a broom part-way under once, then gave up
    g.strokeStyle = 'rgba(52,46,40,0.35)';
    g.lineWidth = 2;
    const sw = rng.range(20, 60);
    g.beginPath(); g.moveTo(sw, 50);
    g.quadraticCurveTo(sw + rng.range(-6, 6), 34, sw + rng.range(-10, 10), 20);
    g.stroke();
  });
}

/** Sprint 486 — the paper let go: a wallpaper flap curls off the seam, paste stain and bare plaster behind. */
export function paperPeel(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const sx = 30 + rng.float() * 20; // seam x
    // exposed plaster behind the flap — a rough vertical tongue
    g.fillStyle = 'rgba(196,184,166,0.85)';
    g.beginPath();
    g.moveTo(sx, 8);
    g.quadraticCurveTo(sx + 14 + rng.float() * 8, 30, sx + 10 + rng.float() * 10, 58);
    g.quadraticCurveTo(sx + 8, 76, sx + 2, 88);
    g.lineTo(sx - 3, 88);
    g.quadraticCurveTo(sx - 2, 60, sx - 4, 30);
    g.closePath(); g.fill();
    // paste stain — darker tide where the adhesive let go
    g.strokeStyle = 'rgba(140,120,94,0.4)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(sx - 2, 10);
    g.quadraticCurveTo(sx + 12, 34, sx + 8, 60);
    g.stroke();
    // the flap itself — curled paper edge still holding its pattern
    g.fillStyle = 'rgba(112,96,78,0.9)';
    g.beginPath();
    g.moveTo(sx - 4, 8);
    g.quadraticCurveTo(sx + 16 + rng.float() * 6, 32, sx + 12, 62);
    g.lineTo(sx + 6, 66);
    g.quadraticCurveTo(sx + 8, 38, sx - 6, 12);
    g.closePath(); g.fill();
    // curl shadow under the flap's free edge
    g.strokeStyle = 'rgba(30,24,18,0.6)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(sx - 4, 8);
    g.quadraticCurveTo(sx + 15, 32, sx + 11, 62);
    g.stroke();
    // faint stripe of surviving pattern on the flap face
    g.strokeStyle = 'rgba(150,132,108,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(sx - 2 + i * 4, 14 + i * 4);
      g.quadraticCurveTo(sx + 10 + i * 3, 34 + i * 6, sx + 8 + i * 2, 58);
      g.stroke();
    }
    // grit fallen at the foot
    g.fillStyle = 'rgba(170,158,140,0.5)';
    for (let i = 0; i < 8; i++) {
      g.fillRect(sx - 6 + rng.float() * 18, 84 + rng.float() * 8, 1.4, 1.4);
    }
  });
}

/** Sprint 486 — the tiles broke: a crack web and dark grout on wet-room floors. */
export function tileCrack(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48;
    // darkened grout cross — the tile grid showing through grime
    g.strokeStyle = 'rgba(52,44,38,0.4)';
    g.lineWidth = 1.6;
    for (const [x0, y0, x1, y1] of [[0, 48, 96, 48], [48, 0, 48, 96], [0, 24, 96, 24], [24, 0, 24, 96], [0, 72, 96, 72], [72, 0, 72, 96]] as const) {
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    // the crack — one main fracture with branch hairlines
    g.strokeStyle = 'rgba(30,24,20,0.8)';
    g.lineWidth = 1.2;
    let x = cx + rng.range(-10, 10), y = 8;
    g.beginPath(); g.moveTo(x, y);
    const segs = 5 + Math.floor(rng.float() * 3);
    for (let i = 0; i < segs; i++) {
      x += rng.range(-12, 12);
      y += rng.range(10, 18);
      g.lineTo(x, y);
    }
    g.stroke();
    // branches
    g.lineWidth = 0.7;
    for (let i = 0; i < 4; i++) {
      const bx = cx + rng.range(-18, 18), by = rng.range(20, 70);
      g.beginPath(); g.moveTo(bx, by);
      g.lineTo(bx + rng.range(-14, 14), by + rng.range(-8, 12));
      g.stroke();
    }
    // chips where the crack crossed the grout
    g.fillStyle = 'rgba(190,180,164,0.5)';
    for (let i = 0; i < 6; i++) {
      g.fillRect(cx + rng.range(-16, 16), 44 + rng.range(-6, 8), 2, 1.4);
    }
    // grime pool in the low tile
    const pool = g.createRadialGradient(70, 70, 2, 70, 70, 16);
    pool.addColorStop(0, 'rgba(46,40,34,0.5)');
    pool.addColorStop(1, 'rgba(46,40,34,0)');
    g.fillStyle = pool;
    g.fillRect(50, 50, 40, 40);
  });
}

/** Sprint 486 — the scuttle spilled: coal dust, lumps and the scuffed circle where it always stands. */
export function coalDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48, cy = 48;
    // rubbed black circle — the scuttle's standing spot
    const spot = g.createRadialGradient(cx, cy, 4, cx, cy, 34);
    spot.addColorStop(0, 'rgba(22,18,15,0.7)');
    spot.addColorStop(0.7, 'rgba(28,24,20,0.35)');
    spot.addColorStop(1, 'rgba(28,24,20,0)');
    g.fillStyle = spot;
    g.fillRect(0, 0, 96, 96);
    // spilled lumps, densest near the center then scattered out
    for (let i = 0; i < 22; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = i < 8 ? rng.range(6, 18) : rng.range(18, 44);
      const s = rng.range(1.2, 3.2);
      g.fillStyle = `rgba(16,14,12,${0.55 + rng.float() * 0.3})`;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.lineTo(cx + Math.cos(a) * r + s, cy + Math.sin(a) * r - s * 0.6);
      g.lineTo(cx + Math.cos(a) * r + s * 1.4, cy + Math.sin(a) * r + s * 0.5);
      g.closePath(); g.fill();
    }
    // glinting facets on the fresh lumps
    g.fillStyle = 'rgba(140,150,160,0.35)';
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(4, 20);
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.2, 0.8);
    }
    // dust tails — drag arcs where a lump skidded
    g.strokeStyle = 'rgba(30,26,22,0.4)';
    g.lineWidth = 0.9;
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, Math.PI * 2);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
      g.quadraticCurveTo(
        cx + Math.cos(a) * 24 + rng.range(-4, 4), cy + Math.sin(a) * 24 + rng.range(-4, 4),
        cx + Math.cos(a) * rng.range(30, 42), cy + Math.sin(a) * rng.range(30, 42));
      g.stroke();
    }
  });
}

/** Sprint 487 — the pegs kept the shapes: faded coat + hat silhouettes and rust freckles where things hung. */
export function coatGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (g) => {
    const cx = 48;
    // hat ghost — a brimmed oval fading into the paint
    g.fillStyle = 'rgba(70,62,52,0.4)';
    g.beginPath(); g.ellipse(cx, 26, 15 + rng.float() * 4, 6, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx, 20, 7, 7 + rng.float() * 2, 0, 0, Math.PI * 2); g.fill();
    // coat ghost — shoulders sloping to a hem, the wall lighter where cloth sat
    g.fillStyle = 'rgba(96,86,72,0.42)';
    g.beginPath();
    g.moveTo(cx - 12, 34);
    g.quadraticCurveTo(cx - 22 - rng.float() * 4, 44, cx - 24 - rng.float() * 5, 78);
    g.quadraticCurveTo(cx - 24, 96, cx - 18, 100);
    g.lineTo(cx + 18, 100);
    g.quadraticCurveTo(cx + 24, 96, cx + 24 + rng.float() * 5, 78);
    g.quadraticCurveTo(cx + 22 + rng.float() * 4, 44, cx + 12, 34);
    g.quadraticCurveTo(cx, 40, cx - 12, 34);
    g.closePath(); g.fill();
    // collar dip
    g.fillStyle = 'rgba(52,46,38,0.35)';
    g.beginPath(); g.ellipse(cx, 36, 5, 3, 0, 0, Math.PI * 2); g.fill();
    // hook rust freckles
    g.fillStyle = 'rgba(110,58,26,0.6)';
    for (let i = 0; i < 4; i++) {
      const hx = cx - 18 + i * 12 + rng.range(-2, 2);
      g.beginPath(); g.arc(hx, 30 + rng.range(-2, 2), 1.1, 0, Math.PI * 2); g.fill();
      g.fillRect(hx - 0.4, 30, 0.8, 5 + rng.float() * 3);
    }
    // hem drip shadows
    g.fillStyle = 'rgba(60,52,44,0.25)';
    for (let i = 0; i < 5; i++) {
      g.fillRect(cx - 20 + i * 9 + rng.range(-2, 2), 100 + rng.range(-3, 3), 3 + rng.float() * 3, 6 + rng.float() * 5);
    }
  });
}

/** Sprint 487 — the box gave way: damp bloom, a sagging corner and pulp smear under cartons left too long. */
export function boxRot(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48, cy = 48;
    // damp bloom spreading past the footprint
    const bloom = g.createRadialGradient(cx, cy, 8, cx, cy, 44);
    bloom.addColorStop(0, 'rgba(70,58,40,0.55)');
    bloom.addColorStop(0.65, 'rgba(76,64,44,0.28)');
    bloom.addColorStop(1, 'rgba(76,64,44,0)');
    g.fillStyle = bloom;
    g.fillRect(0, 0, 96, 96);
    // the footprint's darker edge where the box drank the damp
    g.strokeStyle = 'rgba(56,44,30,0.5)';
    g.lineWidth = 3;
    g.strokeRect(cx - 22, cy - 18, 44, 36);
    // pulp smears — softened cardboard slumping outward
    g.fillStyle = 'rgba(88,72,50,0.45)';
    for (let i = 0; i < 8; i++) {
      const a = rng.range(0, Math.PI * 2);
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * rng.range(22, 32), cy + Math.sin(a) * rng.range(20, 30),
        rng.range(3, 7), rng.range(1.5, 3.5), a, 0, Math.PI * 2);
      g.fill();
    }
    // tape ghost — the strip that held the seam
    g.strokeStyle = 'rgba(120,108,88,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 20, cy);
    g.lineTo(cx + 20, cy + rng.range(-2, 2));
    g.stroke();
    // paper pulp fibers
    g.strokeStyle = 'rgba(100,84,58,0.35)';
    g.lineWidth = 0.7;
    for (let i = 0; i < 10; i++) {
      const x = cx + rng.range(-26, 26), y = cy + rng.range(-22, 22);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-4, 4), y + rng.range(-4, 4)); g.stroke();
    }
  });
}

/** Sprint 487 — the case filmed over: dust film and one wiped arc on display glass nobody has opened in years. */
export function caseDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // overall film — heaviest at the edges
    const edge = g.createRadialGradient(48, 48, 18, 48, 48, 60);
    edge.addColorStop(0, 'rgba(168,160,144,0.1)');
    edge.addColorStop(1, 'rgba(168,160,144,0.5)');
    g.fillStyle = edge;
    g.fillRect(0, 0, 96, 96);
    // dust speckle
    g.fillStyle = 'rgba(180,172,156,0.4)';
    for (let i = 0; i < 60; i++) {
      g.fillRect(rng.range(2, 94), rng.range(2, 94), 0.9, 0.9);
    }
    // the one wiped arc — somebody looked inside once
    g.strokeStyle = 'rgba(48,42,36,0.5)';
    g.lineWidth = 7 + rng.float() * 2;
    g.beginPath();
    const ay = 30 + rng.float() * 30;
    g.moveTo(14, ay);
    g.quadraticCurveTo(48, ay - 14 - rng.float() * 8, 82, ay + rng.range(-4, 6));
    g.stroke();
    // streak tails under the wipe
    g.strokeStyle = 'rgba(120,112,98,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const sx = 20 + i * 16 + rng.range(-3, 3);
      g.beginPath(); g.moveTo(sx, ay + 2); g.lineTo(sx + rng.range(-2, 2), ay + 10 + rng.float() * 6); g.stroke();
    }
    // fingermarks at the lower edge
    g.fillStyle = 'rgba(60,54,46,0.4)';
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.ellipse(30 + i * 16 + rng.range(-4, 4), 88 + rng.range(-3, 3), 2, 2.6, rng.range(-0.4, 0.4), 0, Math.PI * 2); g.fill();
    }
  });
}

/** Sprint 488 — the rug frayed: loose edge threads, a worn binding band and grit shaken out. */
export function carpetFray(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (g) => {
    // binding band — the hem strip where the pile wore to the warp
    g.fillStyle = 'rgba(74,64,52,0.55)';
    g.fillRect(0, 4, 96, 10 + rng.float() * 4);
    // worn gaps in the binding
    g.fillStyle = 'rgba(140,128,110,0.4)';
    for (let i = 0; i < 9; i++) {
      g.fillRect(4 + i * 10 + rng.range(-2, 2), 6 + rng.range(-2, 2), rng.range(4, 8), 5);
    }
    // loose threads curling off the edge
    g.strokeStyle = 'rgba(130,116,96,0.6)';
    g.lineWidth = 0.9;
    for (let i = 0; i < 16; i++) {
      const x = 4 + i * 5.6 + rng.range(-2, 2);
      const len = 8 + rng.float() * 14;
      g.beginPath();
      g.moveTo(x, 14);
      g.quadraticCurveTo(x + rng.range(-3, 3), 14 + len * 0.6, x + rng.range(-5, 5), 14 + len);
      g.stroke();
    }
    // grit and fiber pills shaken free
    g.fillStyle = 'rgba(60,52,44,0.5)';
    for (let i = 0; i < 14; i++) {
      g.fillRect(rng.range(2, 94), rng.range(28, 46), 1.3, 1.1);
    }
    // a few longer pulled threads
    g.strokeStyle = 'rgba(150,136,114,0.5)';
    for (let i = 0; i < 4; i++) {
      const x = rng.range(8, 88);
      g.beginPath(); g.moveTo(x, 15); g.lineTo(x + rng.range(-14, 14), 40 + rng.float() * 5); g.stroke();
    }
  });
}

/** Sprint 488 — the board kept the holes: pin pocks, rust freckles and paper ghosts where notices hung. */
export function pinScars(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // paper ghosts — rectangles faded lighter than the felt around them
    g.fillStyle = 'rgba(150,140,120,0.3)';
    for (let i = 0; i < 4; i++) {
      const w0 = 14 + rng.float() * 16, h0 = 18 + rng.float() * 18;
      g.fillRect(8 + rng.range(0, 60), 10 + rng.range(0, 56), w0, h0);
    }
    // pin pocks — the dense old holes
    g.fillStyle = 'rgba(30,24,18,0.7)';
    for (let i = 0; i < 40; i++) {
      g.beginPath(); g.arc(rng.range(6, 90), rng.range(6, 90), 0.7 + rng.float() * 0.4, 0, Math.PI * 2); g.fill();
    }
    // rust freckles where pins sat for years
    g.fillStyle = 'rgba(112,58,26,0.55)';
    for (let i = 0; i < 12; i++) {
      const x = rng.range(8, 88), y = rng.range(8, 88);
      g.beginPath(); g.arc(x, y, 1.1, 0, Math.PI * 2); g.fill();
      g.fillRect(x - 0.3, y, 0.6, 3 + rng.float() * 3);
    }
    // corner tape ghosts
    g.fillStyle = 'rgba(140,128,104,0.35)';
    for (let i = 0; i < 5; i++) {
      const x = rng.range(10, 80), y = rng.range(10, 80);
      g.save(); g.translate(x, y); g.rotate(rng.range(-0.4, 0.4));
      g.fillRect(-4, -1.5, 8, 3); g.restore();
    }
  });
}

/** Sprint 488 — the feet wicked the damp: dark tide rings where the furniture stands in wet rooms. */
export function legRings(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // four leg positions, tide ring at each
    const legs: [number, number][] = [[30, 30], [66, 30], [30, 66], [66, 66]];
    for (const [lx, ly] of legs) {
      const r0 = 5 + rng.float() * 2;
      const ring = g.createRadialGradient(lx, ly, r0 * 0.4, lx, ly, r0 + 6);
      ring.addColorStop(0, 'rgba(60,48,36,0)');
      ring.addColorStop(0.55, 'rgba(60,48,36,0.55)');
      ring.addColorStop(1, 'rgba(60,48,36,0)');
      g.fillStyle = ring;
      g.fillRect(lx - 12, ly - 12, 24, 24);
      // the dark contact point under the leg
      g.fillStyle = 'rgba(38,30,24,0.7)';
      g.beginPath(); g.arc(lx, ly, r0 * 0.5, 0, Math.PI * 2); g.fill();
    }
    // wicking trails between the feet — damp walked the grain
    g.strokeStyle = 'rgba(56,46,36,0.3)';
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(30, 30); g.lineTo(66, 30); g.stroke();
    g.beginPath(); g.moveTo(30, 66); g.lineTo(66, 66); g.stroke();
    // swell shadow under the near edge
    const edge = g.createLinearGradient(0, 78, 0, 96);
    edge.addColorStop(0, 'rgba(52,42,32,0)');
    edge.addColorStop(1, 'rgba(52,42,32,0.45)');
    g.fillStyle = edge;
    g.fillRect(12, 78, 72, 18);
  });
}

/** Sprint 489 — the rail kept its dust: a grey ledge line on the picture rail, flyspecks and nail pits. */
export function railDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (g) => {
    // the dust ledge — a soft band sitting on the rail's top edge
    const ledge = g.createLinearGradient(0, 4, 0, 20);
    ledge.addColorStop(0, 'rgba(170,160,146,0.55)');
    ledge.addColorStop(1, 'rgba(170,160,146,0.05)');
    g.fillStyle = ledge;
    g.fillRect(4, 4, 88, 16);
    // thicker drifts in the corners and at the ends
    g.fillStyle = 'rgba(178,168,152,0.5)';
    g.beginPath(); g.ellipse(12, 10, 10, 5, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(84, 9, 9, 4.5, 0, 0, Math.PI * 2); g.fill();
    // flyspecks across the ledge
    g.fillStyle = 'rgba(40,34,28,0.6)';
    for (let i = 0; i < 26; i++) {
      g.fillRect(rng.range(6, 90), rng.range(5, 16), 0.8, 0.8);
    }
    // nail pits where hooks once bit the rail
    g.fillStyle = 'rgba(36,30,24,0.65)';
    for (let i = 0; i < 5; i++) {
      const x = 16 + i * 16 + rng.range(-3, 3);
      g.beginPath(); g.arc(x, 24 + rng.range(-2, 2), 1.1, 0, Math.PI * 2); g.fill();
      g.fillRect(x - 0.3, 24, 0.6, 4 + rng.float() * 3);
    }
    // paint line where the rail meets plaster — a shadow seam
    g.strokeStyle = 'rgba(50,42,36,0.4)';
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(2, 30); g.lineTo(94, 30); g.stroke();
  });
}

/** Sprint 489 — the table kept its rings: glass rings, a polish bloom and crumbs under the plates. */
export function waxRings(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48, cy = 48;
    // polish bloom — a broad soft sheen where the wax was last rubbed
    const bloom = g.createRadialGradient(cx - 8, cy - 6, 4, cx - 8, cy - 6, 40);
    bloom.addColorStop(0, 'rgba(200,190,168,0.28)');
    bloom.addColorStop(1, 'rgba(200,190,168,0)');
    g.fillStyle = bloom;
    g.fillRect(0, 0, 96, 96);
    // glass rings — three overlapping rings at different alphas
    for (let i = 0; i < 3; i++) {
      const x = cx + rng.range(-22, 22), y = cy + rng.range(-20, 20);
      const r = 9 + rng.float() * 5;
      g.strokeStyle = `rgba(60,50,40,${0.35 + rng.float() * 0.2})`;
      g.lineWidth = 1.6 + rng.float();
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      // the wet edge of the ring — a darker crescent
      g.strokeStyle = 'rgba(40,32,26,0.4)';
      g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, r, rng.range(0, 2), rng.range(2.5, 4.5)); g.stroke();
    }
    // crumb trail — a scatter line from the plate edge outward
    g.fillStyle = 'rgba(140,120,90,0.55)';
    const tx = rng.range(-1, 1), ty = rng.range(-1, 1);
    const tl = Math.hypot(tx, ty) || 1;
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      g.fillRect(cx + (tx / tl) * (8 + t * 30) + rng.range(-4, 4), cy + (ty / tl) * (8 + t * 30) + rng.range(-4, 4), 1.5, 1.2);
    }
    // knife score — fine parallel scratches in the sheen
    g.strokeStyle = 'rgba(90,78,64,0.3)';
    g.lineWidth = 0.6;
    for (let i = 0; i < 5; i++) {
      const x = cx + rng.range(-16, 16), y = cy + rng.range(-12, 12);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(6, 14), y + rng.range(-2, 3)); g.stroke();
    }
  });
}

/** Sprint 489 — the basket shed: wicker splinters and fiber wisps scattered under the weave. */
export function basketShed(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48, cy = 48;
    // fiber halo — fine pale wisps spreading from the basket's foot
    g.strokeStyle = 'rgba(160,146,118,0.35)';
    g.lineWidth = 0.7;
    for (let i = 0; i < 22; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r0 = rng.range(10, 20), len = rng.range(12, 30);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.quadraticCurveTo(
        cx + Math.cos(a) * (r0 + len * 0.5) + rng.range(-4, 4), cy + Math.sin(a) * (r0 + len * 0.5) + rng.range(-4, 4),
        cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      g.stroke();
    }
    // wicker splinters — short straw slivers
    g.fillStyle = 'rgba(148,130,100,0.6)';
    for (let i = 0; i < 16; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(8, 42);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      g.save(); g.translate(x, y); g.rotate(rng.range(0, Math.PI));
      g.fillRect(-rng.range(2, 5), -0.5, rng.range(4, 10), 1); g.restore();
    }
    // the shadow foot — where the basket always sits
    const foot = g.createRadialGradient(cx, cy, 2, cx, cy, 16);
    foot.addColorStop(0, 'rgba(46,38,30,0.45)');
    foot.addColorStop(1, 'rgba(46,38,30,0)');
    g.fillStyle = foot;
    g.fillRect(cx - 18, cy - 18, 36, 36);
    // dust between the splinters
    g.fillStyle = 'rgba(120,110,94,0.3)';
    for (let i = 0; i < 18; i++) {
      g.fillRect(cx + rng.range(-30, 30), cy + rng.range(-30, 30), 1.1, 1);
    }
  });
}

/** Sprint 490 — the clock stopped: dust film, a frozen-hand shadow and the pendulum's rest mark. */
export function clockStopped(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48, cy = 40;
    // the face — a pale disc dulled by film
    g.fillStyle = 'rgba(200,192,174,0.5)';
    g.beginPath(); g.arc(cx, cy, 26, 0, Math.PI * 2); g.fill();
    // dust film heaviest at the rim
    g.strokeStyle = 'rgba(140,130,116,0.5)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, 25, 0, Math.PI * 2); g.stroke();
    // tick ghosts
    g.fillStyle = 'rgba(60,52,44,0.5)';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillRect(cx + Math.cos(a) * 21 - 0.6, cy + Math.sin(a) * 21 - 0.6, 1.3, 1.3);
    }
    // the hands — frozen at the hour it died, plus their soot shadow
    const ha = rng.range(0, Math.PI * 2), ma = rng.range(0, Math.PI * 2);
    for (const [ang, len, w0] of [[ha, 13, 2.4], [ma, 19, 1.4]] as const) {
      g.strokeStyle = 'rgba(30,26,22,0.75)';
      g.lineWidth = w0;
      g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(ang - Math.PI / 2) * len, cy + Math.sin(ang - Math.PI / 2) * len);
      g.stroke();
      // sun-bleach shadow each hand left on the face
      g.strokeStyle = 'rgba(90,80,68,0.3)';
      g.lineWidth = w0 + 1.4;
      g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(ang - Math.PI / 2 + 0.12) * len, cy + Math.sin(ang - Math.PI / 2 + 0.12) * len);
      g.stroke();
    }
    g.fillStyle = 'rgba(28,24,20,0.8)';
    g.beginPath(); g.arc(cx, cy, 1.8, 0, Math.PI * 2); g.fill();
    // pendulum rest-mark — the arc it swept until it slowed
    g.strokeStyle = 'rgba(96,84,70,0.4)';
    g.lineWidth = 1.2;
    g.beginPath(); g.arc(cx, cy + 34, 18, Math.PI * 0.6, Math.PI * 0.9); g.stroke();
    // dust speckle
    g.fillStyle = 'rgba(150,140,126,0.35)';
    for (let i = 0; i < 30; i++) {
      g.fillRect(rng.range(14, 82), rng.range(8, 78), 0.9, 0.9);
    }
  });
}

/** Sprint 490 — the shelf lip kept the dust: a grey line on the front edge, broken by finger wipes. */
export function shelfLip(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (g) => {
    // the dust line along the front lip
    const lip = g.createLinearGradient(0, 6, 0, 22);
    lip.addColorStop(0, 'rgba(168,158,142,0.6)');
    lip.addColorStop(1, 'rgba(168,158,142,0.08)');
    g.fillStyle = lip;
    g.fillRect(2, 6, 92, 16);
    // finger wipes — clear swipes where hands reached past the lip
    g.fillStyle = 'rgba(52,46,40,0.4)';
    for (let i = 0; i < 4; i++) {
      const x = 14 + i * 20 + rng.range(-4, 4);
      g.fillRect(x, 8, 3.5, 11 + rng.float() * 4);
    }
    // dust drifts piling at the ends
    g.fillStyle = 'rgba(176,166,150,0.5)';
    g.beginPath(); g.ellipse(10, 12, 9, 4, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(86, 13, 8, 3.6, 0, 0, Math.PI * 2); g.fill();
    // moth specks and shelf-edge crumbs
    g.fillStyle = 'rgba(46,40,34,0.55)';
    for (let i = 0; i < 18; i++) {
      g.fillRect(rng.range(6, 90), rng.range(7, 18), 0.8, 0.7);
    }
    // the edge line itself — shadow under the lip
    g.strokeStyle = 'rgba(40,34,28,0.55)';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(2, 23); g.lineTo(94, 23); g.stroke();
  });
}

/** Sprint 490 — the boards kept the grime: a dirt line and splash marks along the baseboard. */
export function baseGrime(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (g) => {
    // the grime tide — darkest right at the board
    const tide = g.createLinearGradient(0, 44, 0, 14);
    tide.addColorStop(0, 'rgba(44,38,32,0.6)');
    tide.addColorStop(1, 'rgba(44,38,32,0)');
    g.fillStyle = tide;
    g.fillRect(0, 14, 96, 30);
    // splash marks rising off the floor — mop slops and spills
    g.fillStyle = 'rgba(56,48,40,0.4)';
    for (let i = 0; i < 9; i++) {
      const x = rng.range(6, 90);
      const h = 4 + rng.float() * 12;
      g.beginPath();
      g.ellipse(x, 42 - h / 2, 2 + rng.float() * 3, h / 2, rng.range(-0.2, 0.2), 0, Math.PI * 2);
      g.fill();
    }
    // scuff kicks — heel marks along the board
    g.strokeStyle = 'rgba(30,26,22,0.6)';
    g.lineWidth = 1.8;
    for (let i = 0; i < 5; i++) {
      const x = rng.range(10, 86);
      g.beginPath();
      g.moveTo(x, 40);
      g.quadraticCurveTo(x + rng.range(-2, 4), 36, x + rng.range(2, 8), 40 - rng.float() * 5);
      g.stroke();
    }
    // dust line caught in the seam between board and floor
    g.strokeStyle = 'rgba(140,130,116,0.5)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 44); g.lineTo(96, 44); g.stroke();
    // nail shadows where the board is pinned
    g.fillStyle = 'rgba(36,30,26,0.5)';
    for (let i = 0; i < 4; i++) {
      g.fillRect(12 + i * 22 + rng.range(-3, 3), 42.5, 1, 2);
    }
  });
}

/** Sprint 491 — the rail kept the hands: a darkened grip band and polish sheen worn into the handrail. */
export function railGrime(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (g) => {
    // the grip band — decades of hands darkened the wood along the top
    const band = g.createLinearGradient(0, 8, 0, 26);
    band.addColorStop(0, 'rgba(52,40,28,0.65)');
    band.addColorStop(0.6, 'rgba(56,44,30,0.35)');
    band.addColorStop(1, 'rgba(56,44,30,0)');
    g.fillStyle = band;
    g.fillRect(4, 8, 88, 18);
    // polish sheen — the rubbed highlights between darker spans
    g.fillStyle = 'rgba(190,170,140,0.3)';
    for (let i = 0; i < 5; i++) {
      const x = 10 + i * 18 + rng.range(-3, 3);
      g.beginPath(); g.ellipse(x, 14, 6 + rng.float() * 4, 2.4, 0, 0, Math.PI * 2); g.fill();
    }
    // finger drag marks — short darker strokes across the band
    g.strokeStyle = 'rgba(36,28,20,0.5)';
    g.lineWidth = 1.1;
    for (let i = 0; i < 8; i++) {
      const x = rng.range(8, 86);
      g.beginPath(); g.moveTo(x, 11); g.lineTo(x + rng.range(-3, 3), 20 + rng.float() * 4); g.stroke();
    }
    // ring dents where knuckles rapped the rail
    g.fillStyle = 'rgba(28,22,18,0.5)';
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.ellipse(rng.range(12, 84), 13 + rng.range(-1, 3), 1.6, 0.9, 0, 0, Math.PI * 2); g.fill();
    }
    // dust in the underside shadow
    g.fillStyle = 'rgba(150,140,124,0.3)';
    for (let i = 0; i < 12; i++) {
      g.fillRect(rng.range(6, 90), rng.range(28, 40), 1, 0.8);
    }
  });
}

/** Sprint 491 — the doors took the boots: heel scuffs, finger drags and a kicked dent on the lift metal. */
export function liftScuff(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48;
    // heel scuffs — dark rubber arcs low on the door
    g.strokeStyle = 'rgba(28,24,20,0.7)';
    for (let i = 0; i < 5; i++) {
      const x = cx + rng.range(-28, 28);
      const y = 78 + rng.range(-6, 10);
      g.lineWidth = 2 + rng.float() * 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + rng.range(4, 10), y - rng.range(3, 8), x + rng.range(10, 18), y - rng.range(2, 6));
      g.stroke();
    }
    // the kicked dent — a shallow bright scrape
    g.fillStyle = 'rgba(160,150,132,0.35)';
    g.beginPath(); g.ellipse(cx + rng.range(-10, 10), 74, 6, 3, rng.range(-0.3, 0.3), 0, Math.PI * 2); g.fill();
    // finger drags — greasy smears at push height
    g.strokeStyle = 'rgba(48,40,32,0.45)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const x = cx + rng.range(-24, 24);
      g.beginPath(); g.moveTo(x, 46 + rng.range(-4, 4)); g.lineTo(x + rng.range(-2, 2), 60 + rng.range(-4, 8)); g.stroke();
    }
    // the seam shadow between the leaves
    g.strokeStyle = 'rgba(22,18,16,0.65)';
    g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(cx, 4); g.lineTo(cx, 92); g.stroke();
    // oil crescents along the bottom track
    g.fillStyle = 'rgba(30,26,22,0.5)';
    for (let i = 0; i < 7; i++) {
      g.beginPath(); g.ellipse(10 + i * 12, 91 + rng.range(-1, 2), 3, 1.4, 0, 0, Math.PI * 2); g.fill();
    }
  });
}

/** Sprint 491 — the gap kept the drift: dust, grit and a dead leaf that blew under the door. */
export function doorDrift(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (g) => {
    // the drift — a wind-combed ridge heaped against the door foot
    const drift = g.createLinearGradient(0, 12, 0, 40);
    drift.addColorStop(0, 'rgba(160,150,134,0.55)');
    drift.addColorStop(0.7, 'rgba(150,140,124,0.3)');
    drift.addColorStop(1, 'rgba(150,140,124,0)');
    g.fillStyle = drift;
    g.fillRect(6, 12, 84, 28);
    // combed ripple lines — the draft shaped them
    g.strokeStyle = 'rgba(120,110,96,0.4)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(8, 16 + i * 5);
      g.quadraticCurveTo(48, 14 + i * 5 + rng.range(-2, 3), 88, 16 + i * 5);
      g.stroke();
    }
    // a dead leaf pinned in the drift
    g.fillStyle = 'rgba(96,80,50,0.6)';
    const lx = 30 + rng.float() * 36;
    g.beginPath(); g.ellipse(lx, 20, 4.5, 2.2, rng.range(-0.5, 0.5), 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(60,48,30,0.5)';
    g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(lx - 4, 20); g.lineTo(lx + 4, 20); g.stroke();
    // grit and splinters in the ridge
    g.fillStyle = 'rgba(70,62,52,0.55)';
    for (let i = 0; i < 16; i++) {
      g.fillRect(rng.range(10, 86), rng.range(14, 34), 1.3, 1);
    }
    // the shadow seam under the door itself
    g.strokeStyle = 'rgba(24,20,18,0.7)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(4, 10); g.lineTo(92, 10); g.stroke();
  });
}

/** Sprint 492 — the battens left ghosts: pale strips and nail pits where boards crossed the glass. */
export function battenGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // two crossed strips — the wood kept the light off the pane,
    // so the glass stayed cleaner underneath
    for (const [ang, len] of [[0.5, 70], [-0.45, 64]] as const) {
      g.save();
      g.translate(48, 48);
      g.rotate(ang);
      const strip = g.createLinearGradient(0, -5, 0, 5);
      strip.addColorStop(0, 'rgba(190,184,168,0.1)');
      strip.addColorStop(0.5, 'rgba(196,188,172,0.55)');
      strip.addColorStop(1, 'rgba(190,184,168,0.1)');
      g.fillStyle = strip;
      g.fillRect(-len / 2, -5, len, 10);
      g.restore();
    }
    // nail pits at each strip end — they were hammered hard
    g.fillStyle = 'rgba(32,26,22,0.7)';
    for (const [ang, len] of [[0.5, 70], [-0.45, 64]] as const) {
      for (const s of [-1, 1]) {
        const x = 48 + Math.cos(ang) * (len / 2) * s;
        const y = 48 + Math.sin(ang) * (len / 2) * s;
        g.beginPath(); g.arc(x, y, 1.3, 0, Math.PI * 2); g.fill();
        // rust weep under each nail
        g.fillRect(x - 0.4, y, 0.8, 4 + rng.float() * 3);
      }
    }
    // grime in the pane's corners — where the boards couldn't shade it
    g.fillStyle = 'rgba(60,52,44,0.3)';
    for (const [cx0, cy0] of [[10, 10], [86, 12], [12, 84], [84, 86]] as const) {
      g.beginPath(); g.ellipse(cx0, cy0, 8, 6, 0, 0, Math.PI * 2); g.fill();
    }
    // scratches where the board's edge swung and bit
    g.strokeStyle = 'rgba(50,42,36,0.4)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      const x = 30 + rng.range(-8, 30), y = 30 + rng.range(-8, 30);
      g.beginPath(); g.arc(x, y, rng.range(10, 24), rng.range(0, 1), rng.range(1.5, 2.5)); g.stroke();
    }
  });
}

/** Sprint 492 — the jug wept rings: a sticky ring and drip tear under the vessels nobody moves. */
export function jugRing(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48, cy = 48;
    // the ring — a stubborn stain where the base always stands
    g.strokeStyle = 'rgba(72,56,38,0.6)';
    g.lineWidth = 3.4;
    g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.stroke();
    // doubled ghost where it stood once before
    g.strokeStyle = 'rgba(84,66,44,0.3)';
    g.lineWidth = 2.4;
    g.beginPath(); g.arc(cx + rng.range(-8, 8), cy + rng.range(-6, 6), 15, 0, Math.PI * 2); g.stroke();
    // the drip tear — one run that escaped down the side and dried
    const da = rng.range(0, Math.PI * 2);
    g.strokeStyle = 'rgba(78,60,40,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(da) * 16, cy + Math.sin(da) * 16);
    g.quadraticCurveTo(
      cx + Math.cos(da) * 22 + rng.range(-3, 3), cy + Math.sin(da) * 24,
      cx + Math.cos(da) * 26 + rng.range(-4, 4), cy + Math.sin(da) * 30 + rng.range(0, 6));
    g.stroke();
    // the tear's bead
    g.fillStyle = 'rgba(70,54,36,0.55)';
    g.beginPath(); g.arc(cx + Math.cos(da) * 27, cy + Math.sin(da) * 31, 2.2, 0, Math.PI * 2); g.fill();
    // dust pooled inside the ring — the dust found the rim but not the middle
    g.fillStyle = 'rgba(150,140,124,0.25)';
    for (let i = 0; i < 20; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(12, 18);
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.2, 1);
    }
  });
}

/** Sprint 492 — the panels bowed: a belly shadow, sprung nail heads and a cracked seam. */
export function panelBow(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48;
    // belly shadow — the panel bows outward, darkest at its sprung edge
    const belly = g.createRadialGradient(cx, 48, 6, cx, 48, 40);
    belly.addColorStop(0, 'rgba(150,138,120,0.1)');
    belly.addColorStop(0.75, 'rgba(46,38,30,0.35)');
    belly.addColorStop(1, 'rgba(46,38,30,0.55)');
    g.fillStyle = belly;
    g.fillRect(0, 0, 96, 96);
    // the sprung edge — a dark gap opening along one side
    const se = rng.bool(0.5) ? 8 : 88;
    const gap = g.createLinearGradient(se, 0, se === 8 ? 22 : 74, 0);
    gap.addColorStop(0, 'rgba(20,16,13,0.75)');
    gap.addColorStop(1, 'rgba(20,16,13,0)');
    g.fillStyle = gap;
    g.fillRect(Math.min(se, se === 8 ? 22 : 74), 0, 14, 96);
    // sprung nail heads — bright dots popped proud of the face
    g.fillStyle = 'rgba(170,158,140,0.7)';
    for (let i = 0; i < 5; i++) {
      const x = se === 8 ? rng.range(10, 24) : rng.range(72, 86);
      const y = 14 + i * 16 + rng.range(-4, 4);
      g.beginPath(); g.arc(x, y, 1.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(30,24,20,0.5)';
      g.fillRect(x - 0.4, y + 1, 0.8, 2.5);
      g.fillStyle = 'rgba(170,158,140,0.7)';
    }
    // the cracked seam — a hairline split following the grain
    g.strokeStyle = 'rgba(34,28,22,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    let sx = cx + rng.range(-10, 10);
    g.moveTo(sx, 8);
    for (let i = 0; i < 5; i++) {
      sx += rng.range(-4, 5);
      g.lineTo(sx, 16 + i * 14);
    }
    g.stroke();
    // dust trapped in the belly shadow
    g.fillStyle = 'rgba(140,130,116,0.3)';
    for (let i = 0; i < 20; i++) {
      g.fillRect(rng.range(20, 76), rng.range(16, 80), 1, 0.9);
    }
  });
}

/** Sprint 493 — the claws raked low: three-furrow scratches at the door's foot, something wanted through. */
export function clawMarks(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48;
    // three parallel furrows — gouged deep, brighter where the wood split
    for (let f = 0; f < 3; f++) {
      const x0 = cx - 16 + f * 16 + rng.range(-3, 3);
      const lean = rng.range(-0.15, 0.15);
      // the gouge
      g.strokeStyle = 'rgba(30,24,18,0.85)';
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(x0, 70);
      g.quadraticCurveTo(x0 + lean * 30, 46, x0 + lean * 48, 20 + rng.range(-4, 6));
      g.stroke();
      // the splintered edge — bright torn grain beside the gouge
      g.strokeStyle = 'rgba(170,152,124,0.6)';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(x0 + 2.4, 68);
      g.quadraticCurveTo(x0 + lean * 30 + 2, 46, x0 + lean * 48 + 2, 24);
      g.stroke();
      // torn fibers fanning at the top of each rake
      g.strokeStyle = 'rgba(120,104,84,0.5)';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(x0 + lean * 48, 22);
        g.lineTo(x0 + lean * 48 + rng.range(-6, 6), 12 + rng.range(-3, 4));
        g.stroke();
      }
    }
    // smeared pad-drag below the rakes
    g.fillStyle = 'rgba(44,36,28,0.35)';
    g.beginPath(); g.ellipse(cx, 78, 22, 6, 0, 0, Math.PI * 2); g.fill();
    // wood splinters dropped at the foot
    g.fillStyle = 'rgba(140,124,100,0.55)';
    for (let i = 0; i < 10; i++) {
      g.save();
      g.translate(cx + rng.range(-24, 24), 84 + rng.range(-3, 6));
      g.rotate(rng.range(0, Math.PI));
      g.fillRect(-2.5, -0.5, rng.range(3, 7), 1);
      g.restore();
    }
  });
}

/** Sprint 493 — the lamp smoked the ceiling: a soot ring and smoke smudge above the hanging light. */
export function lampSoot(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48, cy = 48;
    // the ring — soot halo where the flame's heat bloomed upward
    const ring = g.createRadialGradient(cx, cy, 8, cx, cy, 38);
    ring.addColorStop(0, 'rgba(30,26,22,0.15)');
    ring.addColorStop(0.55, 'rgba(34,28,24,0.55)');
    ring.addColorStop(1, 'rgba(34,28,24,0)');
    g.fillStyle = ring;
    g.fillRect(0, 0, 96, 96);
    // the core — a dense disc right above the mantle
    const core = g.createRadialGradient(cx, cy, 1, cx, cy, 12);
    core.addColorStop(0, 'rgba(22,18,15,0.75)');
    core.addColorStop(1, 'rgba(22,18,15,0)');
    g.fillStyle = core;
    g.fillRect(cx - 14, cy - 14, 28, 28);
    // the lean — smoke smudge drifting off-axis toward the room's draft
    const la = rng.range(0, Math.PI * 2);
    g.strokeStyle = 'rgba(38,32,26,0.35)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx + Math.cos(la) * 10, cy + Math.sin(la) * 10);
    g.quadraticCurveTo(
      cx + Math.cos(la) * 26 + rng.range(-4, 4), cy + Math.sin(la) * 26 + rng.range(-4, 4),
      cx + Math.cos(la) * 42, cy + Math.sin(la) * 42);
    g.stroke();
    // flyspecks caught in the soot
    g.fillStyle = 'rgba(20,16,14,0.6)';
    for (let i = 0; i < 18; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(8, 34);
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.9, 0.9);
    }
    // plaster heat-crackle — hairlines at the ring's edge
    g.strokeStyle = 'rgba(50,44,38,0.4)';
    g.lineWidth = 0.7;
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
      g.lineTo(cx + Math.cos(a) * rng.range(36, 44), cy + Math.sin(a) * rng.range(36, 44));
      g.stroke();
    }
  });
}

/** Sprint 493 — someone sat: seat dust with one clean wipe where a body last landed. */
export function seatWipe(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48, cy = 48;
    // the dust field — thick, undisturbed except for the wipe
    g.fillStyle = 'rgba(156,146,130,0.5)';
    g.fillRect(8, 8, 80, 80);
    // edge drifts
    g.fillStyle = 'rgba(166,156,140,0.55)';
    g.beginPath(); g.ellipse(14, 20, 12, 8, 0.3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(80, 74, 13, 9, -0.2, 0, Math.PI * 2); g.fill();
    // dust speckle texture
    g.fillStyle = 'rgba(120,110,96,0.4)';
    for (let i = 0; i < 60; i++) {
      g.fillRect(rng.range(10, 86), rng.range(10, 86), 1, 0.9);
    }
    // THE WIPE — the clean oval where someone sat down: the cushion
    // shows through in a body-shaped absence of dust
    const wx = cx + rng.range(-6, 6), wy = cy + rng.range(-4, 4);
    g.fillStyle = 'rgba(58,48,38,0.75)';
    g.beginPath(); g.ellipse(wx, wy, 22, 17, rng.range(-0.15, 0.15), 0, Math.PI * 2); g.fill();
    // wipe fringe — dust pushed outward at the oval's lip
    g.strokeStyle = 'rgba(140,130,114,0.55)';
    g.lineWidth = 2.4;
    g.beginPath(); g.ellipse(wx, wy, 23.5, 18.5, 0, 0, Math.PI * 2); g.stroke();
    // hand-drag at the wipe's edge — they steadied themselves sitting
    g.strokeStyle = 'rgba(70,58,46,0.5)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const hx = wx + 20 + rng.range(-2, 3);
      g.beginPath(); g.moveTo(hx, wy - 8 + i * 3.4); g.lineTo(hx + 7 + rng.float() * 4, wy - 9 + i * 3.4); g.stroke();
    }
  });
}

/** Sprint 494 — the book dried open: warped cover wings and a page fan that never went back. */
export function pageFan(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    const cx = 48;
    // warped cover — the two boards sprung open like wings
    for (const s of [-1, 1]) {
      g.save();
      g.translate(cx, 44);
      g.rotate(s * (0.5 + rng.float() * 0.2));
      g.fillStyle = 'rgba(70,58,44,0.85)';
      g.fillRect(s * 4, -26, s * 30, 12);
      // gilt edge on the cover lip
      g.fillStyle = 'rgba(180,150,80,0.4)';
      g.fillRect(s * 4, s * -1 - 15, s * 30, 1.4);
      g.restore();
    }
    // the page fan — leaves sprung up from the spine in a dead arc
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const a = -0.7 + t * 1.4;
      g.save();
      g.translate(cx, 42);
      g.rotate(a + rng.range(-0.03, 0.03));
      g.fillStyle = `rgba(196,188,170,${0.5 + t * 0.3})`;
      g.fillRect(-0.8, -34, 1.6, 34);
      g.restore();
    }
    // spine shadow
    g.fillStyle = 'rgba(30,24,20,0.7)';
    g.beginPath(); g.ellipse(cx, 44, 6, 3, 0, 0, Math.PI * 2); g.fill();
    // damp tide along the lower page edges
    g.strokeStyle = 'rgba(120,104,80,0.4)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx - 22, 30);
    g.quadraticCurveTo(cx, 26 + rng.range(-2, 3), cx + 22, 30);
    g.stroke();
    // foxing spots — the rust of old paper
    g.fillStyle = 'rgba(120,90,50,0.45)';
    for (let i = 0; i < 8; i++) {
      g.beginPath(); g.arc(cx + rng.range(-16, 16), 14 + rng.range(-6, 16), rng.range(0.7, 1.6), 0, Math.PI * 2); g.fill();
    }
  });
}

/** Sprint 494 — the pages curled: damp pulled the corners up, the ink ran a little. */
export function paperCurl(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // the sheet — a pale quadrilateral, corners lifting
    g.fillStyle = 'rgba(198,190,172,0.85)';
    g.beginPath();
    g.moveTo(16, 18); g.lineTo(80, 14); g.lineTo(84, 78); g.lineTo(20, 82);
    g.closePath(); g.fill();
    // corner curls — dark scoops where each corner rolls up
    for (const [cx0, cy0] of [[20, 20], [78, 16], [20, 78], [82, 76]] as const) {
      const curl = g.createRadialGradient(cx0, cy0, 1, cx0, cy0, 10);
      curl.addColorStop(0, 'rgba(60,52,44,0.55)');
      curl.addColorStop(1, 'rgba(60,52,44,0)');
      g.fillStyle = curl;
      g.fillRect(cx0 - 11, cy0 - 11, 22, 22);
    }
    // text lines — faded, wavering where the damp warped the sheet
    g.strokeStyle = 'rgba(70,62,54,0.45)';
    g.lineWidth = 0.9;
    for (let i = 0; i < 9; i++) {
      const y = 26 + i * 6;
      g.beginPath();
      g.moveTo(24, y);
      g.quadraticCurveTo(48, y + rng.range(-1.5, 1.5), 76 - rng.float() * 12, y + rng.range(-1, 1));
      g.stroke();
    }
    // the ink that ran — one line bled into a bloom
    g.fillStyle = 'rgba(50,56,80,0.4)';
    g.beginPath(); g.ellipse(52 + rng.range(-6, 6), 44 + rng.range(-6, 6), 5, 3.4, rng.range(-0.4, 0.4), 0, Math.PI * 2); g.fill();
    // edge stains — the damp came from below
    g.strokeStyle = 'rgba(120,104,80,0.4)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(20, 82); g.lineTo(84, 78); g.stroke();
    // a single fingerprint in the margin
    g.fillStyle = 'rgba(60,52,44,0.3)';
    g.beginPath(); g.ellipse(70, 60, 2.2, 3, 0.3, 0, Math.PI * 2); g.fill();
  });
}

/** Sprint 494 — the ceiling bloomed: a water ring, stain map and blistered plaster overhead. */
export function plasterBloom(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48 + rng.range(-10, 10), cy = 48 + rng.range(-8, 8);
    // concentric tide rings — the leak came and went in seasons
    for (let i = 0; i < 3; i++) {
      const r = 12 + i * 11 + rng.range(-2, 2);
      g.strokeStyle = `rgba(96,78,56,${0.5 - i * 0.12})`;
      g.lineWidth = 2.2 - i * 0.5;
      g.beginPath();
      // wobbly ring — not a true circle
      for (let a = 0; a <= 32; a++) {
        const t = (a / 32) * Math.PI * 2;
        const rr = r + Math.sin(t * 3 + i) * 2.4;
        const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr * 0.8;
        if (a) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath(); g.stroke();
    }
    // the stain's heart — darkest where the drip stood longest
    const heart = g.createRadialGradient(cx, cy, 2, cx, cy, 14);
    heart.addColorStop(0, 'rgba(84,66,44,0.55)');
    heart.addColorStop(1, 'rgba(84,66,44,0)');
    g.fillStyle = heart;
    g.fillRect(cx - 16, cy - 16, 32, 32);
    // plaster blisters — small raised dots inside the oldest ring
    g.fillStyle = 'rgba(150,140,124,0.5)';
    for (let i = 0; i < 12; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(4, 13);
      g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 1.1, 0, Math.PI * 2); g.fill();
    }
    // one blister burst — a bright pit
    g.fillStyle = 'rgba(180,170,156,0.6)';
    g.beginPath(); g.arc(cx + rng.range(-8, 8), cy + rng.range(-6, 6), 1.6, 0, Math.PI * 2); g.fill();
    // crack tails leaving the bloom
    g.strokeStyle = 'rgba(58,50,42,0.4)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, Math.PI * 2);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 27);
      g.lineTo(cx + Math.cos(a) * 46, cy + Math.sin(a) * 38);
      g.stroke();
    }
  });
}

/** Sprint 495 — the embers jumped: scorch pits and coal shadows on the floor past the hearth's edge. */
export function emberPits(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // ash wash — grey film thickest near the hearth (bottom of the tex)
    const wash = g.createLinearGradient(0, 64, 0, 20);
    wash.addColorStop(0, 'rgba(140,134,124,0.4)');
    wash.addColorStop(1, 'rgba(140,134,124,0)');
    g.fillStyle = wash;
    g.fillRect(0, 20, 96, 44);
    // scorch pits — small black craters where a live coal landed
    for (let i = 0; i < 6; i++) {
      const x = 14 + i * 13 + rng.range(-4, 4);
      const y = 30 + rng.range(0, 26);
      const r = 2.2 + rng.float() * 2;
      const pit = g.createRadialGradient(x, y, 0.4, x, y, r + 2);
      pit.addColorStop(0, 'rgba(16,12,10,0.9)');
      pit.addColorStop(0.5, 'rgba(30,24,20,0.6)');
      pit.addColorStop(1, 'rgba(30,24,20,0)');
      g.fillStyle = pit;
      g.fillRect(x - r - 3, y - r - 3, r * 2 + 6, r * 2 + 6);
      // the roll mark — the coal skidded before it died
      g.strokeStyle = 'rgba(36,28,22,0.5)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - rng.range(3, 8), y + rng.range(-2, 3)); g.lineTo(x, y); g.stroke();
    }
    // ember ghosts — faint orange ember-crackles frozen in the grain
    g.strokeStyle = 'rgba(160,80,30,0.3)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      const x = rng.range(16, 80), y = rng.range(30, 54);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-4, 4), y + rng.range(2, 6)); g.stroke();
    }
    // kicked ash fans
    g.fillStyle = 'rgba(150,144,134,0.3)';
    for (let i = 0; i < 3; i++) {
      const x = rng.range(20, 76);
      g.beginPath(); g.ellipse(x, 56 + rng.range(-2, 4), 8, 3, rng.range(-0.3, 0.3), 0, Math.PI * 2); g.fill();
    }
  });
}

/** Sprint 495 — someone traced the wall: one finger line dragged through the dust, dust piled at its end. */
export function fingerTrace(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (g) => {
    // the dust field — the wall's skin of grey
    const field = g.createLinearGradient(0, 0, 0, 48);
    field.addColorStop(0, 'rgba(158,148,132,0.3)');
    field.addColorStop(1, 'rgba(158,148,132,0.15)');
    g.fillStyle = field;
    g.fillRect(0, 0, 96, 48);
    // speckle
    g.fillStyle = 'rgba(130,120,106,0.3)';
    for (let i = 0; i < 40; i++) {
      g.fillRect(rng.range(4, 92), rng.range(4, 44), 1, 0.9);
    }
    // THE LINE — a clean dragged channel through the dust, slightly
    // wavering like a finger, ending in a dust ridge
    const y0 = 20 + rng.range(-6, 6);
    const up = rng.bool(0.3);
    g.strokeStyle = 'rgba(56,48,40,0.7)';
    g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(12, y0);
    for (let i = 1; i <= 8; i++) {
      g.lineTo(12 + i * 8, y0 + Math.sin(i * 0.9) * 2 + rng.range(-1, 1) + (up ? -i * 1.2 : 0));
    }
    g.stroke();
    // the dust piled where the finger stopped
    const ex = 12 + 8 * 8;
    const ey = y0 + Math.sin(8 * 0.9) * 2 + (up ? -9.6 : 0);
    g.fillStyle = 'rgba(150,140,124,0.7)';
    g.beginPath(); g.ellipse(ex + 2, ey, 5, 3, 0.2, 0, Math.PI * 2); g.fill();
    // a second fainter line — they came back once
    if (rng.bool(0.5)) {
      g.strokeStyle = 'rgba(60,52,44,0.4)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(16, y0 + 9); g.lineTo(60 + rng.range(-8, 8), y0 + 9 + rng.range(-3, 3)); g.stroke();
    }
    // fingertip prints beside the line
    g.fillStyle = 'rgba(60,52,44,0.35)';
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.ellipse(20 + i * 8 + rng.range(-2, 2), y0 - 8 + rng.range(-2, 2), 1.6, 2.1, 0.2, 0, Math.PI * 2); g.fill();
    }
  });
}

/** Sprint 495 — the mop dried mid-sweep: curved stroke arcs and a water edge that never finished. */
export function mopArcs(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48, cy = 50;
    // mop strokes — concentric arcs fanned from the sweeper's stance
    for (let i = 0; i < 6; i++) {
      const r = 18 + i * 9;
      const a0 = Math.PI * (1.1 + rng.range(-0.08, 0.08));
      const a1 = Math.PI * (1.75 + rng.range(-0.08, 0.08));
      g.strokeStyle = `rgba(120,116,108,${0.4 - i * 0.04})`;
      g.lineWidth = 2.6;
      g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
      // bristle streaks within the stroke
      g.strokeStyle = 'rgba(140,134,124,0.2)';
      g.lineWidth = 0.7;
      g.beginPath(); g.arc(cx, cy, r + 2, a0 + 0.05, a1 - 0.05); g.stroke();
    }
    // the water edge — the tide line where the wet work stopped
    g.strokeStyle = 'rgba(66,60,52,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(10, 30);
    g.quadraticCurveTo(48, 24 + rng.range(-3, 3), 86, 32);
    g.stroke();
    // damp sheen above the edge — the floor still drying
    const sheen = g.createLinearGradient(0, 8, 0, 30);
    sheen.addColorStop(0, 'rgba(110,104,96,0.25)');
    sheen.addColorStop(1, 'rgba(110,104,96,0)');
    g.fillStyle = sheen;
    g.fillRect(8, 8, 80, 22);
    // grit the mop gathered at stroke ends
    g.fillStyle = 'rgba(70,62,52,0.5)';
    for (let i = 0; i < 12; i++) {
      const a = rng.range(Math.PI * 1.6, Math.PI * 1.95);
      const r = rng.range(20, 66);
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.4, 1);
    }
  });
}

/** The ladder left its rub — two parallel polish streaks where the
 *  rails always lean, rung shadows, foot scuffs at the baseboard. */
export function ladderRub(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const lx = 34 + rng.float() * 26;
    const lean = rng.range(-0.06, 0.06);
    // The rails rubbed the same spots a hundred times — twin sheen bars.
    for (const off of [-9, 9]) {
      const sheen = g.createLinearGradient(lx + off - 2, 10, lx + off + 2, 10);
      sheen.addColorStop(0, 'rgba(186,168,138,0)');
      sheen.addColorStop(0.5, `rgba(196,178,148,${0.3 + rng.float() * 0.15})`);
      sheen.addColorStop(1, 'rgba(186,168,138,0)');
      g.fillStyle = sheen;
      g.save();
      g.translate(lx + off, 48);
      g.rotate(lean);
      g.fillRect(-2.4, -34, 4.8, 68);
      g.restore();
    }
    // Where the rails met the wall the paint wore off — bright caps.
    for (const off of [-9, 9]) {
      g.fillStyle = `rgba(206,190,162,${0.3 + rng.float() * 0.2})`;
      g.beginPath();
      g.ellipse(lx + off + lean * -30, 14 + rng.float() * 6, 2.4, 3.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Rung ghosts — faint horizontal marks between the rails.
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(170,154,126,${0.08 + rng.float() * 0.1})`;
      g.fillRect(lx - 9, 22 + i * 14 + rng.range(-2, 2), 18, 1.1);
    }
    // The feet kicked and dug — scuffs and divots down at the floor line.
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(64,52,38,${0.16 + rng.float() * 0.2})`;
      g.save();
      g.translate(lx + rng.range(-14, 14), 82 + rng.range(-3, 6));
      g.rotate(rng.range(-0.5, 0.5));
      g.fillRect(-3, -1, 6 + rng.float() * 4, 2);
      g.restore();
    }
    for (const off of [-9, 9]) {
      g.fillStyle = 'rgba(52,42,32,0.35)';
      g.beginPath();
      g.ellipse(lx + off, 86 + rng.range(-1.5, 1.5), 2, 1.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Dust settled heavy right where the ladder stands.
    const dust = g.createRadialGradient(lx, 88, 2, lx, 88, 18);
    dust.addColorStop(0, 'rgba(120,106,86,0.3)');
    dust.addColorStop(1, 'rgba(120,106,86,0)');
    g.fillStyle = dust;
    g.fillRect(lx - 18, 70, 36, 26);
  });
}

/** The sill peeled — paint flakes curling off the window board
 *  where the weather got at it, damp streaks dropping below. */
export function sillPeel(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (g) => {
    // The bare board shows through where the paint let go.
    g.fillStyle = 'rgba(98,82,62,0.5)';
    g.fillRect(6, 6, 84, 14);
    // Flakes — lifted chips, some still curled at an edge.
    for (let i = 0; i < 12; i++) {
      const fx = 8 + rng.float() * 80;
      const fy = 7 + rng.float() * 11;
      g.fillStyle = `rgba(214,204,188,${0.35 + rng.float() * 0.3})`;
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx + 3 + rng.float() * 4, fy + rng.range(-1, 1));
      g.lineTo(fx + 2 + rng.float() * 3, fy + 2.5 + rng.float() * 2);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(70,58,44,0.3)';
      g.lineWidth = 0.4;
      g.stroke();
    }
    // Chips that fell and kept lying on the board.
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(206,196,180,${0.3 + rng.float() * 0.3})`;
      g.fillRect(10 + rng.float() * 76, 16 + rng.float() * 3, 1.5 + rng.float() * 2, 0.8 + rng.float() * 1);
    }
    // Damp ran down the reveal — thin drip trails under the sill.
    for (let i = 0; i < 4; i++) {
      const dx = 14 + rng.float() * 68;
      const len = 8 + rng.float() * 16;
      const drip = g.createLinearGradient(0, 20, 0, 20 + len);
      drip.addColorStop(0, 'rgba(80,66,50,0.4)');
      drip.addColorStop(1, 'rgba(80,66,50,0)');
      g.fillStyle = drip;
      g.fillRect(dx, 20, 1.1 + rng.float() * 0.7, len);
    }
    // The bottom edge stays dark where the wall keeps the shadow.
    g.fillStyle = 'rgba(40,32,24,0.28)';
    g.fillRect(6, 44, 84, 2);
  });
}

/** The drawers kept the scratches — ring-pull rubs, scraped fronts,
 *  and the finger-groove grime of a thousand openings. */
export function drawerScars(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // Grime worked into the groove under each pull.
    for (const py of [18, 44]) {
      const px = 48 + rng.range(-8, 8);
      const grim = g.createRadialGradient(px, py, 1, px, py, 9);
      grim.addColorStop(0, 'rgba(60,48,34,0.5)');
      grim.addColorStop(0.7, 'rgba(60,48,34,0.18)');
      grim.addColorStop(1, 'rgba(60,48,34,0)');
      g.fillStyle = grim;
      g.beginPath();
      g.arc(px, py, 9, 0, Math.PI * 2);
      g.fill();
      // The pull's own rub — a bright ring where the metal swung.
      g.strokeStyle = 'rgba(196,184,164,0.4)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(px, py + 1.5, 3.5 + rng.float() * 0.8, 0.1, Math.PI - 0.1);
      g.stroke();
      // Fingernail scratches arcing away from the grip.
      for (let s = 0; s < 4; s++) {
        g.strokeStyle = `rgba(210,198,176,${0.14 + rng.float() * 0.18})`;
        g.lineWidth = 0.35;
        g.beginPath();
        g.moveTo(px + rng.range(-4, 4), py + 3 + rng.range(-1, 1));
        g.quadraticCurveTo(px + rng.range(-8, 8), py + 7 + rng.range(-1, 1), px + rng.range(-10, 10), py + 9 + rng.range(-1.5, 1.5));
        g.stroke();
      }
    }
    // Long scuffs across the fronts — furniture dragged, boxes slid.
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = `rgba(186,172,148,${0.08 + rng.float() * 0.14})`;
      g.lineWidth = 0.5 + rng.float() * 0.6;
      g.beginPath();
      const sy = 8 + rng.float() * 52;
      g.moveTo(4 + rng.float() * 20, sy);
      g.lineTo(60 + rng.float() * 30, sy + rng.range(-3, 3));
      g.stroke();
    }
    // The seam between drawers reads darker — dust in the gap.
    g.fillStyle = 'rgba(44,36,26,0.4)';
    g.fillRect(6, 30.5, 84, 1.2);
    // Corner knocks — chipped spots at the vulnerable edges.
    for (const [cx, cy] of [[8, 8], [88, 8], [8, 58], [88, 58]] as const) {
      if (!rng.bool(0.6)) continue;
      g.fillStyle = 'rgba(90,72,52,0.4)';
      g.beginPath();
      g.arc(cx + rng.range(-1.5, 1.5), cy + rng.range(-1.5, 1.5), 1.2 + rng.float() * 1.4, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** The range kept its grease — spatter burst and drip runs down the
 *  oven door where decades of fat came off the pans. */
export function ovenGrease(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // The heat-darkened zone — a broad amber-brown film.
    const film = g.createRadialGradient(48, 26, 4, 48, 26, 34);
    film.addColorStop(0, 'rgba(112,76,38,0.42)');
    film.addColorStop(0.7, 'rgba(96,64,32,0.2)');
    film.addColorStop(1, 'rgba(96,64,32,0)');
    g.fillStyle = film;
    g.fillRect(14, 4, 68, 52);
    // Spatter — the burst where a lid came off mid-fry.
    for (let i = 0; i < 26; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 4 + rng.float() * 22;
      g.fillStyle = `rgba(70,46,20,${0.14 + rng.float() * 0.26})`;
      g.beginPath();
      g.arc(48 + Math.cos(a) * r, 24 + Math.sin(a) * r * 0.7, 0.4 + rng.float() * 1.3, 0, Math.PI * 2);
      g.fill();
    }
    // The drips — fat that ran and stayed, darker at the head.
    for (let i = 0; i < 5; i++) {
      const dx = 26 + rng.float() * 44;
      const len = 14 + rng.float() * 26;
      g.fillStyle = `rgba(84,54,24,${0.22 + rng.float() * 0.18})`;
      g.fillRect(dx, 28, 1.4 + rng.float() * 1.2, len);
      g.fillStyle = 'rgba(64,40,16,0.4)';
      g.beginPath();
      g.arc(dx + 0.9, 28, 1.6 + rng.float() * 1, 0, Math.PI * 2);
      g.fill();
    }
    // The bottom lip holds a polish where a rag wiped once.
    g.fillStyle = 'rgba(150,120,80,0.22)';
    g.fillRect(20, 56 + rng.range(-1, 1), 56, 2.4);
    // Crumbs of old carbon along the edge.
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(40,28,14,${0.3 + rng.float() * 0.3})`;
      g.fillRect(18 + rng.float() * 60, 54 + rng.float() * 6, 0.8 + rng.float() * 1.2, 0.7 + rng.float());
    }
  });
}

/** The dial kept the thumb — a polish halo around the tuner where
 *  one hand always landed, dust film broken by fingertip arcs. */
export function dialRubs(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // Dust film across the face.
    g.fillStyle = 'rgba(96,88,74,0.34)';
    g.fillRect(10, 8, 76, 48);
    // The dial glow — a rubbed-clean halo where the thumb rides.
    const dx = 44 + rng.range(-8, 8);
    const halo = g.createRadialGradient(dx, 32, 2, dx, 32, 15);
    halo.addColorStop(0, 'rgba(180,168,144,0.5)');
    halo.addColorStop(0.6, 'rgba(180,168,144,0.2)');
    halo.addColorStop(1, 'rgba(180,168,144,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(dx, 32, 15, 0, Math.PI * 2);
    g.fill();
    // The dial ring itself — a worn-bright circle.
    g.strokeStyle = 'rgba(200,190,168,0.5)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(dx, 32, 8 + rng.float(), 0, Math.PI * 2);
    g.stroke();
    // Fingertip arcs — the wiping motion broken out of the dust.
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = `rgba(186,174,150,${0.14 + rng.float() * 0.16})`;
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(dx + rng.range(-2, 2), 32 + rng.range(-2, 2), 11 + rng.float() * 6, rng.float() * 3, rng.float() * 3 + 0.9 + rng.float() * 0.8);
      g.stroke();
    }
    // The station numbers gone ghost — faint tick row under the dial.
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(150,140,120,${0.1 + rng.float() * 0.14})`;
      g.fillRect(24 + i * 5, 48 + rng.range(-0.5, 0.5), 0.8, 2.4 + rng.float());
    }
    // Dust that drifted back into the wipe's wake.
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(88,80,66,${0.1 + rng.float() * 0.16})`;
      g.fillRect(12 + rng.float() * 72, 10 + rng.float() * 44, 0.8, 0.8);
    }
  });
}

/** The boiler shed its skin — rust flakes and scale on the floor
 *  under the tank, orange dust in the drip line. */
export function boilerFlake(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // The shed zone — a soft arc of oxide dust around the drip line.
    const arc = rng.range(-0.4, 0.4);
    for (let i = 0; i < 40; i++) {
      const a = Math.PI * (0.15 + rng.float() * 0.7) + arc;
      const r = 20 + rng.float() * 22;
      const fx = 48 + Math.cos(a) * r;
      const fy = 60 + Math.sin(a) * r * 0.55;
      g.fillStyle = `rgba(${120 + Math.floor(rng.float() * 60)},${52 + Math.floor(rng.float() * 26)},${18 + Math.floor(rng.float() * 12)},${0.2 + rng.float() * 0.4})`;
      g.save();
      g.translate(fx, fy);
      g.rotate(rng.float() * Math.PI);
      g.fillRect(-0.6 - rng.float() * 1.4, -0.4 - rng.float() * 0.8, 1.2 + rng.float() * 2.8, 0.8 + rng.float() * 1.6);
      g.restore();
    }
    // Fresh flakes — brighter chips that just let go.
    for (let i = 0; i < 8; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 16 + rng.float() * 20;
      g.fillStyle = `rgba(196,96,32,${0.3 + rng.float() * 0.3})`;
      g.beginPath();
      g.arc(48 + Math.cos(a) * r, 58 + Math.sin(a) * r * 0.5, 0.7 + rng.float() * 1, 0, Math.PI * 2);
      g.fill();
    }
    // The drip rings — mineral ghost where condensate always lands.
    for (const rx of [-14, 6, 22]) {
      if (!rng.bool(0.7)) continue;
      g.strokeStyle = `rgba(140,80,36,${0.16 + rng.float() * 0.16})`;
      g.lineWidth = 0.9;
      g.beginPath();
      g.ellipse(48 + rx, 66 + rng.range(-3, 3), 4 + rng.float() * 3, 1.6 + rng.float() * 1.4, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // The sweep pile — scale pushed to one side by an old brush.
    const px = 48 + rng.range(-24, 24);
    const pile = g.createRadialGradient(px, 78, 1, px, 78, 9);
    pile.addColorStop(0, 'rgba(110,58,22,0.5)');
    pile.addColorStop(1, 'rgba(110,58,22,0)');
    g.fillStyle = pile;
    g.beginPath();
    g.arc(px, 78, 9, 0, Math.PI * 2);
    g.fill();
  });
}

/** The mirror crept — amalgam crawling in from the edges where the
 *  silvering gave up, black deltas eating the corners. */
export function mirrorAmalgam(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // Edge creep — the black backing eats inward, deepest at corners.
    for (const [cx, cy] of [[0, 0], [96, 0], [0, 96], [96, 96]] as const) {
      const reach = 10 + rng.float() * 14;
      const creep = g.createRadialGradient(cx, cy, 1, cx, cy, reach);
      creep.addColorStop(0, 'rgba(14,12,10,0.85)');
      creep.addColorStop(0.55, 'rgba(22,19,16,0.55)');
      creep.addColorStop(1, 'rgba(22,19,16,0)');
      g.fillStyle = creep;
      g.beginPath();
      g.arc(cx, cy, reach, 0, Math.PI * 2);
      g.fill();
      // The creep isn't smooth — fingered deltas pushing inward.
      for (let i = 0; i < 4; i++) {
        g.fillStyle = `rgba(18,15,12,${0.4 + rng.float() * 0.3})`;
        g.beginPath();
        g.ellipse(cx + rng.range(-2, 2), cy + rng.range(3, 12) * (cy === 0 ? 1 : -1), 1 + rng.float() * 2.2, 2.5 + rng.float() * 3, rng.float(), 0, Math.PI * 2);
        g.fill();
      }
    }
    // The sides weep too — thin black fingers down the frame line.
    for (const [edge, horiz] of [[0, true], [96, true], [0, false], [96, false]] as const) {
      for (let i = 0; i < 5; i++) {
        const t = 12 + rng.float() * 72;
        const len = 3 + rng.float() * 8;
        g.fillStyle = `rgba(20,17,14,${0.3 + rng.float() * 0.3})`;
        if (horiz) g.fillRect(edge === 0 ? 0 : 96 - len, t, len, 0.8 + rng.float());
        else g.fillRect(t, edge === 0 ? 0 : 96 - len, 0.8 + rng.float(), len);
      }
    }
    // Fox spots — the tiny dead freckles scattered across the face.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(30,26,22,${0.2 + rng.float() * 0.3})`;
      g.beginPath();
      g.arc(20 + rng.float() * 56, 20 + rng.float() * 56, 0.4 + rng.float() * 0.9, 0, Math.PI * 2);
      g.fill();
    }
    // What remains has a tired sheen — a faint bloom center-face.
    const sheen = g.createRadialGradient(48, 48, 4, 48, 48, 30);
    sheen.addColorStop(0, 'rgba(170,172,168,0.1)');
    sheen.addColorStop(1, 'rgba(170,172,168,0)');
    g.fillStyle = sheen;
    g.fillRect(18, 18, 60, 60);
  });
}

/** The basin kept its ring — a limescale tide band and the grime
 *  film that settles where the water always stops. */
export function basinRing(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // The standing-water line — a hard mineral band all around.
    g.strokeStyle = 'rgba(188,178,150,0.6)';
    g.lineWidth = 1.8;
    g.beginPath();
    g.ellipse(48, 52, 36 + rng.range(-2, 2), 24 + rng.range(-2, 2), 0, 0, Math.PI * 2);
    g.stroke();
    // Scum below it — a cloudy film filling the ring.
    const scum = g.createRadialGradient(48, 56, 4, 48, 56, 28);
    scum.addColorStop(0, 'rgba(110,98,74,0.4)');
    scum.addColorStop(0.75, 'rgba(110,98,74,0.18)');
    scum.addColorStop(1, 'rgba(110,98,74,0)');
    g.fillStyle = scum;
    g.beginPath();
    g.ellipse(48, 56, 34, 23, 0, 0, Math.PI * 2);
    g.fill();
    // Above the line stays clean-ish but filmed — light streaks.
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = `rgba(160,150,128,${0.1 + rng.float() * 0.12})`;
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(20 + rng.float() * 56, 12 + rng.float() * 8);
      g.lineTo(24 + rng.float() * 52, 26 + rng.float() * 10);
      g.stroke();
    }
    // The drain eye — dark centre where everything leaves.
    g.fillStyle = 'rgba(30,26,20,0.6)';
    g.beginPath();
    g.arc(48, 58, 3 + rng.float(), 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(170,160,140,0.4)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.arc(48, 58, 5 + rng.float(), 0, Math.PI * 2);
    g.stroke();
    // Hair and grit caught in the ring.
    for (let i = 0; i < 10; i++) {
      const a = rng.float() * Math.PI * 2;
      g.fillStyle = `rgba(50,42,30,${0.3 + rng.float() * 0.3})`;
      g.fillRect(48 + Math.cos(a) * 35, 52 + Math.sin(a) * 23, 0.9, 0.7);
    }
    // One drip overshot — a streak down from the tap end.
    g.fillStyle = 'rgba(120,106,80,0.3)';
    g.fillRect(46 + rng.range(-4, 4), 14, 1.6, 10 + rng.float() * 6);
  });
}

/** The hinge wore the frame — paint rubbed off the door edge and
 *  finger grime at the pull side of every cabinet that gets used. */
export function hingeWear(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    const flip = rng.bool(0.5);
    const edgeX = flip ? 88 : 8;
    const pullX = flip ? 20 : 76;
    // The swing rub — paint gone where the door edge always meets the frame.
    const rub = g.createLinearGradient(edgeX - (flip ? -8 : 8), 0, edgeX, 0);
    rub.addColorStop(0, 'rgba(186,168,140,0)');
    rub.addColorStop(1, 'rgba(190,172,142,0.5)');
    g.fillStyle = rub;
    g.fillRect(flip ? edgeX : edgeX - 8, 4, 8, 56);
    // Hinge shadows — dark ticks where the hardware bites.
    for (const hy of [12, 32, 52]) {
      g.fillStyle = 'rgba(44,36,26,0.4)';
      g.fillRect(edgeX - (flip ? 0 : 2), hy - 1, 3, 2.4);
      g.fillStyle = `rgba(150,138,116,${0.18 + rng.float() * 0.16})`;
      g.fillRect(edgeX - (flip ? 3 : 5), hy - 0.8, 1.6, 1.6);
    }
    // The pull side — finger grime blooms where the grip is.
    const grim = g.createRadialGradient(pullX, 32, 1, pullX, 32, 9);
    grim.addColorStop(0, 'rgba(64,52,38,0.5)');
    grim.addColorStop(0.7, 'rgba(64,52,38,0.2)');
    grim.addColorStop(1, 'rgba(64,52,38,0)');
    g.fillStyle = grim;
    g.beginPath();
    g.arc(pullX, 32, 9, 0, Math.PI * 2);
    g.fill();
    // Nail crescents around the grip — the grab that misses.
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = `rgba(190,176,152,${0.12 + rng.float() * 0.16})`;
      g.lineWidth = 0.4;
      g.beginPath();
      g.arc(pullX + rng.range(-5, 5), 32 + rng.range(-4, 4), 4 + rng.float() * 3, rng.float() * 4, rng.float() * 4 + 0.8);
      g.stroke();
    }
    // The door-gap seam runs dark the whole height.
    g.fillStyle = 'rgba(40,32,24,0.45)';
    g.fillRect(47.5, 2, 1.4, 60);
    // Scuffs low where the toe taps it shut.
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(80,66,48,${0.14 + rng.float() * 0.2})`;
      g.save();
      g.translate(30 + rng.float() * 40, 54 + rng.range(-3, 4));
      g.rotate(rng.range(-0.4, 0.4));
      g.fillRect(-3, -0.8, 6 + rng.float() * 4, 1.6);
      g.restore();
    }
  });
}

/** The head kept its oil — a dark bloom on the headboard where the
 *  same head rested a thousand nights, hair oil worked in deep. */
export function headGrease(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // The rest-bloom — a broad dark oval where the head always lies.
    const hx = 48 + rng.range(-6, 6);
    const bloom = g.createRadialGradient(hx, 30, 3, hx, 30, 26);
    bloom.addColorStop(0, 'rgba(52,40,28,0.55)');
    bloom.addColorStop(0.6, 'rgba(52,40,28,0.28)');
    bloom.addColorStop(1, 'rgba(52,40,28,0)');
    g.fillStyle = bloom;
    g.beginPath();
    g.ellipse(hx, 30, 26, 18, 0, 0, Math.PI * 2);
    g.fill();
    // The polish ring — hair oil wicks an edge around the bloom.
    g.strokeStyle = 'rgba(80,60,40,0.35)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.ellipse(hx, 30, 24 + rng.float() * 3, 16 + rng.float() * 2, 0, 0, Math.PI * 2);
    g.stroke();
    // The pressure never stays even — darker lobes where it leaned.
    for (let i = 0; i < 3; i++) {
      const lx = hx + rng.range(-10, 10);
      const lobe = g.createRadialGradient(lx, 30 + rng.range(-4, 4), 1, lx, 30 + rng.range(-4, 4), 8);
      lobe.addColorStop(0, 'rgba(44,34,22,0.4)');
      lobe.addColorStop(1, 'rgba(44,34,22,0)');
      g.fillStyle = lobe;
      g.beginPath();
      g.arc(lx, 30 + rng.range(-4, 4), 8, 0, Math.PI * 2);
      g.fill();
    }
    // Stray hairs stuck in the sheen — fine arcs near the top edge.
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = `rgba(30,24,18,${0.2 + rng.float() * 0.2})`;
      g.lineWidth = 0.35;
      g.beginPath();
      const sx = hx + rng.range(-16, 16);
      g.moveTo(sx, 18 + rng.range(-4, 4));
      g.quadraticCurveTo(sx + rng.range(-4, 4), 22 + rng.range(-3, 3), sx + rng.range(-6, 6), 26 + rng.range(-3, 3));
      g.stroke();
    }
    // The rail line below — dust shadow under the head's reach.
    g.fillStyle = 'rgba(40,32,22,0.28)';
    g.fillRect(hx - 26, 56 + rng.range(-1, 1), 52, 1.6);
  });
}

/** The frame knocked the wall — rub arcs and paint chips where the
 *  headboard bangs the plaster when the bed moves. */
export function frameRattle(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // Two contact zones — the headboard's posts hit the same spots.
    for (const cx of [30, 66]) {
      const cy = 40 + rng.range(-6, 6);
      // The rub — a crescent of polished plaster.
      const rub = g.createRadialGradient(cx, cy, 1, cx, cy, 12);
      rub.addColorStop(0, 'rgba(186,170,142,0.5)');
      rub.addColorStop(0.6, 'rgba(186,170,142,0.2)');
      rub.addColorStop(1, 'rgba(186,170,142,0)');
      g.fillStyle = rub;
      g.beginPath();
      g.arc(cx, cy, 12, 0, Math.PI * 2);
      g.fill();
      // The chips — knocked-out plaster divots in the rub zone.
      for (let i = 0; i < 4; i++) {
        g.fillStyle = `rgba(196,186,168,${0.4 + rng.float() * 0.3})`;
        g.beginPath();
        g.arc(cx + rng.range(-6, 6), cy + rng.range(-8, 8), 0.8 + rng.float() * 1.6, 0, Math.PI * 2);
        g.fill();
      }
      // The knock ring — an arc of dented paint around the sweet spot.
      g.strokeStyle = `rgba(96,80,60,${0.3 + rng.float() * 0.2})`;
      g.lineWidth = 0.9;
      g.beginPath();
      g.arc(cx, cy, 8 + rng.float() * 2, rng.float() * 2, rng.float() * 2 + 1.6 + rng.float());
      g.stroke();
    }
    // Swing arcs — the paths the posts drag on each shove.
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = `rgba(160,144,118,${0.12 + rng.float() * 0.14})`;
      g.lineWidth = 0.6;
      const side = rng.bool(0.5) ? 30 : 66;
      g.beginPath();
      g.moveTo(side + rng.range(-5, 5), 46 + rng.range(-3, 3));
      g.quadraticCurveTo(side + rng.range(-3, 3), 54 + rng.range(-3, 3), side + rng.range(-8, 8), 62 + rng.range(-4, 4));
      g.stroke();
    }
    // Fallen plaster dust caught at the base.
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(180,168,146,${0.2 + rng.float() * 0.24})`;
      g.fillRect(24 + rng.float() * 48, 74 + rng.float() * 12, 0.9 + rng.float(), 0.9 + rng.float() * 0.6);
    }
  });
}

/** The cushions learned the body — a dip-shadow on the seat where
 *  the weight always settles, button dimples and edge grime. */
export function seatSag(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // The dip — a broad settle-shadow across the cushion middle.
    const dip = g.createRadialGradient(48, 44, 4, 48, 44, 30);
    dip.addColorStop(0, 'rgba(58,46,34,0.4)');
    dip.addColorStop(0.7, 'rgba(58,46,34,0.16)');
    dip.addColorStop(1, 'rgba(58,46,34,0)');
    g.fillStyle = dip;
    g.beginPath();
    g.ellipse(48, 44, 30, 22, 0, 0, Math.PI * 2);
    g.fill();
    // Seat-edges catch a sheen — front lip where legs swing over.
    const lip = g.createLinearGradient(0, 78, 0, 88);
    lip.addColorStop(0, 'rgba(150,134,110,0)');
    lip.addColorStop(0.6, `rgba(158,142,116,${0.2 + rng.float() * 0.12})`);
    lip.addColorStop(1, 'rgba(158,142,116,0)');
    g.fillStyle = lip;
    g.fillRect(20, 78, 56, 10);
    // Button dimples pulled deep by years of sitting.
    for (const [bx, by] of [[34, 36], [62, 36], [48, 52]] as const) {
      if (!rng.bool(0.7)) continue;
      g.fillStyle = 'rgba(34,26,18,0.5)';
      g.beginPath();
      g.arc(bx + rng.range(-2, 2), by + rng.range(-2, 2), 1.6 + rng.float(), 0, Math.PI * 2);
      g.fill();
      // The pull creases — short lines radiating from each button.
      for (let c = 0; c < 4; c++) {
        g.strokeStyle = `rgba(46,36,26,${0.18 + rng.float() * 0.14})`;
        g.lineWidth = 0.4;
        const a = (c / 4) * Math.PI * 2 + rng.range(-0.4, 0.4);
        g.beginPath();
        g.moveTo(bx + Math.cos(a) * 2.2, by + Math.sin(a) * 2.2);
        g.lineTo(bx + Math.cos(a) * (5 + rng.float() * 2), by + Math.sin(a) * (5 + rng.float() * 2));
        g.stroke();
      }
    }
    // The crumb line — what fell between the cushions and stayed.
    g.strokeStyle = 'rgba(40,32,22,0.4)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(16, 46 + rng.range(-1.5, 1.5));
    g.quadraticCurveTo(48, 49 + rng.range(-1.5, 1.5), 80, 46 + rng.range(-1.5, 1.5));
    g.stroke();
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(60,48,34,${0.3 + rng.float() * 0.3})`;
      g.fillRect(20 + rng.float() * 56, 46 + rng.range(-2, 3), 0.8, 0.8);
    }
  });
}

/** The ribbon kept the words — an ink halo round the platen, the
 *  ghost of typed lines where the carriage stopped mid-letter. */
export function platenInk(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // The ribbon smudge — a broad inked band across the platen line.
    const band = g.createLinearGradient(0, 24, 0, 40);
    band.addColorStop(0, 'rgba(20,18,24,0)');
    band.addColorStop(0.5, 'rgba(20,18,24,0.4)');
    band.addColorStop(1, 'rgba(20,18,24,0)');
    g.fillStyle = band;
    g.fillRect(14, 24, 68, 16);
    // Ghost lines — the last page's rows impressed into the roller.
    for (let i = 0; i < 4; i++) {
      const y = 27 + i * 3 + rng.range(-0.5, 0.5);
      for (let x = 20; x < 76; x += 2 + rng.float() * 3) {
        g.fillStyle = `rgba(30,26,36,${0.2 + rng.float() * 0.3})`;
        g.fillRect(x, y, 1 + rng.float() * 1.6, 0.7);
      }
    }
    // The strike zone — densest ink where the keys hit the same spot.
    const zone = g.createRadialGradient(48, 32, 1, 48, 32, 10);
    zone.addColorStop(0, 'rgba(14,12,20,0.55)');
    zone.addColorStop(1, 'rgba(14,12,20,0)');
    g.fillStyle = zone;
    g.beginPath();
    g.arc(48, 32, 10, 0, Math.PI * 2);
    g.fill();
    // Key fingerprints on the hood — smudged dust where hands rest.
    for (let i = 0; i < 6; i++) {
      const fx = 20 + rng.float() * 56;
      g.fillStyle = `rgba(60,54,44,${0.14 + rng.float() * 0.2})`;
      g.beginPath();
      g.ellipse(fx, 50 + rng.range(-3, 4), 3 + rng.float() * 2, 1.2 + rng.float() * 0.8, rng.range(-0.3, 0.3), 0, Math.PI * 2);
      g.fill();
    }
    // The ribbon fray — a stray thread of ink escaping the band.
    g.strokeStyle = 'rgba(24,20,30,0.4)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(76, 32);
    g.quadraticCurveTo(84, 34 + rng.range(-2, 2), 90, 38 + rng.range(-3, 3));
    g.stroke();
  });
}

/** The breaker kept the burn — a scorch bloom round the failed
 *  fuse and the finger-smut of every reset since. */
export function sparkScorch(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // The blowout — a starburst of carbon around the row that went.
    const sx = 34 + rng.float() * 28;
    const sy = 26 + rng.float() * 20;
    const burn = g.createRadialGradient(sx, sy, 1, sx, sy, 16);
    burn.addColorStop(0, 'rgba(12,10,10,0.8)');
    burn.addColorStop(0.4, 'rgba(22,18,16,0.45)');
    burn.addColorStop(1, 'rgba(22,18,16,0)');
    g.fillStyle = burn;
    g.beginPath();
    g.arc(sx, sy, 16, 0, Math.PI * 2);
    g.fill();
    // The spray — carbon threads licking away from the fault.
    for (let i = 0; i < 12; i++) {
      const a = rng.float() * Math.PI * 2;
      const len = 6 + rng.float() * 14;
      g.strokeStyle = `rgba(26,22,20,${0.25 + rng.float() * 0.3})`;
      g.lineWidth = 0.5 + rng.float() * 0.5;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len * 0.8);
      g.stroke();
    }
    // The fault's eye — a melted pinpoint at the centre.
    g.fillStyle = 'rgba(6,6,8,0.9)';
    g.beginPath();
    g.arc(sx, sy, 2 + rng.float(), 0, Math.PI * 2);
    g.fill();
    // Reset smuts — finger trails down the toggle line.
    for (let i = 0; i < 4; i++) {
      const fx = 26 + rng.float() * 44;
      g.fillStyle = `rgba(70,60,50,${0.18 + rng.float() * 0.2})`;
      g.save();
      g.translate(fx, 62 + rng.range(-6, 6));
      g.rotate(rng.range(-0.15, 0.15));
      g.fillRect(-1, -6, 2 + rng.float(), 12);
      g.restore();
    }
    // Melted sheen flecks where the plastic blistered.
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(140,130,110,${0.14 + rng.float() * 0.18})`;
      g.beginPath();
      g.arc(sx + rng.range(-10, 10), sy + rng.range(-8, 8), 0.5 + rng.float() * 0.8, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** The wheels kept their ruts — twin polished tracks and a skid
 *  where the chair or gurney always rolls to its rest. */
export function wheelRuts(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const bend = rng.range(-0.2, 0.2);
    // Twin tracks — the same two lines worn pale every trip.
    for (const off of [-8, 8]) {
      g.strokeStyle = `rgba(178,160,130,${0.3 + rng.float() * 0.14})`;
      g.lineWidth = 2 + rng.float() * 0.8;
      g.beginPath();
      g.moveTo(6, 48 + off + bend * -20);
      g.quadraticCurveTo(48, 48 + off + bend * 30, 90, 48 + off + bend * 20);
      g.stroke();
      // A darker hair inside each track — the tyre's centre wear.
      g.strokeStyle = `rgba(120,104,82,${0.2 + rng.float() * 0.16})`;
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(6, 48 + off + bend * -20);
      g.quadraticCurveTo(48, 48 + off + bend * 30, 90, 48 + off + bend * 20);
      g.stroke();
    }
    // The skid — a dark jag where a wheel locked once.
    const kx = 30 + rng.float() * 40;
    g.strokeStyle = 'rgba(50,42,32,0.45)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(kx, 48 + rng.range(-6, 6));
    g.lineTo(kx + 6 + rng.float() * 8, 48 + rng.range(-6, 6));
    g.stroke();
    // Grime pushed up between the tracks.
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(70,58,44,${0.12 + rng.float() * 0.2})`;
      g.fillRect(10 + rng.float() * 76, 44 + rng.range(-4, 10), 1 + rng.float() * 1.4, 0.8);
    }
    // The rest point — a smudge where the wheels stop and stay.
    const rx = 66 + rng.range(-8, 12);
    const rest = g.createRadialGradient(rx, 48 + bend * 18, 1, rx, 48 + bend * 18, 8);
    rest.addColorStop(0, 'rgba(140,120,96,0.4)');
    rest.addColorStop(1, 'rgba(140,120,96,0)');
    g.fillStyle = rest;
    g.beginPath();
    g.arc(rx, 48 + bend * 18, 8, 0, Math.PI * 2);
    g.fill();
  });
}

/** The plants died standing — a shed-leaf ring and stem scuff
 *  where the pot kept a green thing that nobody watered. */
export function plantDeath(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // The leaf-fall ring — dropped fronds scattered in a halo.
    for (let i = 0; i < 22; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 16 + rng.float() * 18;
      g.fillStyle = `rgba(${96 + Math.floor(rng.float() * 40)},${64 + Math.floor(rng.float() * 24)},${28 + Math.floor(rng.float() * 14)},${0.35 + rng.float() * 0.3})`;
      g.save();
      g.translate(48 + Math.cos(a) * r, 48 + Math.sin(a) * r);
      g.rotate(rng.float() * Math.PI);
      g.beginPath();
      g.ellipse(0, 0, 2.2 + rng.float() * 1.6, 0.9 + rng.float() * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // One curled leaf kept its curl — a brighter crescent.
    g.strokeStyle = `rgba(140,104,52,${0.4 + rng.float() * 0.2})`;
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(48 + rng.range(-18, 18), 48 + rng.range(-18, 18), 4 + rng.float() * 2, 0, Math.PI * 1.4);
    g.stroke();
    // Pot-shadow ring — the soil line where the pot sits.
    g.strokeStyle = 'rgba(64,50,34,0.4)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(48, 48, 11 + rng.float() * 2, 0, Math.PI * 2);
    g.stroke();
    // Spilled soil — a fan of grit out one side.
    const sa = rng.float() * Math.PI * 2;
    for (let i = 0; i < 12; i++) {
      const d = 12 + rng.float() * 12;
      const spread = rng.range(-0.35, 0.35);
      g.fillStyle = `rgba(56,44,30,${0.3 + rng.float() * 0.3})`;
      g.fillRect(48 + Math.cos(sa + spread) * d, 48 + Math.sin(sa + spread) * d, 0.9 + rng.float() * 0.7, 0.8 + rng.float() * 0.6);
    }
    // Water-ring ghost — the saucer that overflowed once.
    g.strokeStyle = `rgba(120,100,72,${0.18 + rng.float() * 0.14})`;
    g.lineWidth = 0.9;
    g.beginPath();
    g.arc(48, 48, 16 + rng.float() * 3, rng.float() * 3, rng.float() * 3 + 3.5);
    g.stroke();
  });
}

/** The jars kept their dust — a shoulder ring where the dust sits
 *  on the curve and a wipe streak where a hand reached once. */
export function jarDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // The shoulder band — dust that settles where the glass curves.
    const band = g.createLinearGradient(0, 12, 0, 26);
    band.addColorStop(0, 'rgba(120,108,88,0)');
    band.addColorStop(0.5, `rgba(120,108,88,${0.35 + rng.float() * 0.15})`);
    band.addColorStop(1, 'rgba(120,108,88,0)');
    g.fillStyle = band;
    g.fillRect(16, 12, 64, 14);
    // Dust caps the lid — a soft pale pad.
    const cap = g.createRadialGradient(48, 12, 1, 48, 12, 12);
    cap.addColorStop(0, 'rgba(150,140,116,0.45)');
    cap.addColorStop(1, 'rgba(150,140,116,0)');
    g.fillStyle = cap;
    g.beginPath();
    g.ellipse(48, 12, 16, 6, 0, 0, Math.PI * 2);
    g.fill();
    // The wipe — one clean swipe through the film.
    g.strokeStyle = `rgba(60,54,44,${0.3 + rng.float() * 0.2})`;
    g.lineWidth = 3.5;
    g.beginPath();
    const wy = 30 + rng.range(-4, 4);
    g.moveTo(20, wy);
    g.quadraticCurveTo(48, wy + rng.range(-4, 4), 76, wy + rng.range(-3, 3));
    g.stroke();
    // Fingertip commas at the wipe's start.
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = `rgba(56,50,40,${0.2 + rng.float() * 0.2})`;
      g.lineWidth = 0.7;
      g.beginPath();
      g.arc(22 + i * 3, wy - 2 + rng.range(-1, 1), 1.6, 0, Math.PI * 1.2);
      g.stroke();
    }
    // Settled specks — flyspecks and flour motes across the film.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(70,62,50,${0.14 + rng.float() * 0.2})`;
      g.fillRect(18 + rng.float() * 60, 14 + rng.float() * 38, 0.7, 0.7);
    }
    // The label's edge — a pale strip where glue held paper once.
    if (rng.bool(0.5)) {
      g.strokeStyle = 'rgba(170,160,136,0.3)';
      g.lineWidth = 1;
      g.strokeRect(36 + rng.range(-6, 6), 36 + rng.range(-4, 4), 18 + rng.float() * 6, 10 + rng.float() * 4);
    }
  });
}

/** The stools scraped arcs — quarter-moon gouges where the legs
 *  drag around a pivot, scuffs where they're kicked straight. */
export function stoolDrag(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 44 + rng.range(-8, 8);
    const cy = 46 + rng.range(-8, 8);
    // Pivot arcs — the front legs swung and the back legs held.
    for (let i = 0; i < 4; i++) {
      const r = 12 + i * 5 + rng.float() * 3;
      const a0 = rng.float() * Math.PI * 2;
      const sweep = 0.7 + rng.float() * 0.9;
      g.strokeStyle = `rgba(${140 + Math.floor(rng.float() * 30)},${124 + Math.floor(rng.float() * 24)},${98 + Math.floor(rng.float() * 20)},${0.3 + rng.float() * 0.2})`;
      g.lineWidth = 0.9 + rng.float() * 0.6;
      g.beginPath();
      g.arc(cx, cy, r, a0, a0 + sweep);
      g.stroke();
    }
    // The gouge — one deep arc where a leg dug in.
    g.strokeStyle = 'rgba(90,74,54,0.55)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(cx, cy, 16 + rng.float() * 6, rng.float() * 4, rng.float() * 4 + 1.1);
    g.stroke();
    // Kick scuffs — straight drags where the stool was shoved.
    for (let i = 0; i < 3; i++) {
      const sx = cx + rng.range(-22, 22);
      const sy = cy + rng.range(-22, 22);
      g.save();
      g.translate(sx, sy);
      g.rotate(rng.float() * Math.PI);
      g.fillStyle = `rgba(120,104,80,${0.2 + rng.float() * 0.2})`;
      g.fillRect(-4, -0.8, 8 + rng.float() * 5, 1.6);
      g.restore();
    }
    // Leg dimples — small pits where the stool stands now.
    for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]] as const) {
      if (!rng.bool(0.75)) continue;
      g.fillStyle = 'rgba(66,54,40,0.4)';
      g.beginPath();
      g.arc(cx + dx + rng.range(-1, 1), cy + dy + rng.range(-1, 1), 0.8 + rng.float() * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    // Dust pushed to the rest position — a faint settle ring.
    g.strokeStyle = `rgba(120,106,84,${0.2 + rng.float() * 0.14})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.ellipse(cx, cy, 9 + rng.float() * 2, 8 + rng.float() * 2, 0, 0, Math.PI * 2);
    g.stroke();
  });
}

/** The ladder's feet — twin pad pits and the kick scuffs where the
 *  rails dig in every time it gets climbed. */
export function ladderFeet(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    const gap = 20 + rng.float() * 8;
    const lx = 48 - gap / 2, rx = 48 + gap / 2;
    // The pads — deep divots worn where the feet land every time.
    for (const fx of [lx, rx]) {
      const pit = g.createRadialGradient(fx, 34, 1, fx, 34, 7);
      pit.addColorStop(0, 'rgba(50,40,30,0.55)');
      pit.addColorStop(0.6, 'rgba(50,40,30,0.24)');
      pit.addColorStop(1, 'rgba(50,40,30,0)');
      g.fillStyle = pit;
      g.beginPath();
      g.ellipse(fx, 34, 7, 5, 0, 0, Math.PI * 2);
      g.fill();
      // The pad's own bite — a small hard-edged sole print.
      g.fillStyle = 'rgba(60,48,34,0.5)';
      g.save();
      g.translate(fx, 34);
      g.rotate(rng.range(-0.15, 0.15));
      g.fillRect(-2.4, -1.6, 4.8, 3.2);
      g.restore();
    }
    // Drag scars — the arcs the feet carve when the ladder's walked in.
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = `rgba(140,124,100,${0.2 + rng.float() * 0.2})`;
      g.lineWidth = 0.8 + rng.float() * 0.5;
      g.beginPath();
      const sx = lx + rng.range(-6, 6);
      g.moveTo(sx, 20 + rng.range(-4, 4));
      g.quadraticCurveTo((sx + lx) / 2, 28 + rng.range(-2, 2), lx + rng.range(-2, 2), 32 + rng.range(-2, 2));
      g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = `rgba(140,124,100,${0.18 + rng.float() * 0.18})`;
      g.lineWidth = 0.8;
      g.beginPath();
      const sx = rx + rng.range(-6, 6);
      g.moveTo(sx, 20 + rng.range(-4, 4));
      g.quadraticCurveTo((sx + rx) / 2, 28, rx + rng.range(-2, 2), 32 + rng.range(-2, 2));
      g.stroke();
    }
    // Splinters and grit shaken loose from the wood.
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(110,90,64,${0.24 + rng.float() * 0.3})`;
      g.fillRect(48 + rng.range(-gap, gap), 30 + rng.range(-8, 18), 0.9 + rng.float() * 0.8, 0.6 + rng.float() * 0.5);
    }
    // Kicked dust ridge between the feet.
    const ridge = g.createLinearGradient(0, 40, 0, 48);
    ridge.addColorStop(0, 'rgba(130,114,90,0)');
    ridge.addColorStop(0.5, `rgba(130,114,90,${0.18 + rng.float() * 0.12})`);
    ridge.addColorStop(1, 'rgba(130,114,90,0)');
    g.fillStyle = ridge;
    g.fillRect(48 - gap / 2 - 4, 40, gap + 8, 8);
  });
}

/** The vice's grit — filings and metal dust under the workbench
 *  where the work got done, in a fan under the jaw side. */
export function viceGrit(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const fa = rng.range(-0.5, 0.5) + Math.PI / 2;
    // The fan — filings thrown in a cone off the jaw.
    for (let i = 0; i < 46; i++) {
      const a = fa + rng.range(-0.6, 0.6);
      const r = 8 + rng.float() * 30;
      const fx = 48 + Math.cos(a) * r;
      const fy = 40 + Math.sin(a) * r * 0.8;
      const bright = rng.bool(0.3);
      g.fillStyle = bright
        ? `rgba(196,188,168,${0.3 + rng.float() * 0.35})`
        : `rgba(90,80,66,${0.2 + rng.float() * 0.3})`;
      g.save();
      g.translate(fx, fy);
      g.rotate(a + Math.PI / 2 + rng.range(-0.3, 0.3));
      g.fillRect(-1.4, -0.35, 2.8 + rng.float() * 2, 0.7);
      g.restore();
    }
    // The dense zone — ground-in grey where the filings pile.
    const pile = g.createRadialGradient(48, 52, 2, 48, 52, 18);
    pile.addColorStop(0, 'rgba(78,68,56,0.42)');
    pile.addColorStop(1, 'rgba(78,68,56,0)');
    g.fillStyle = pile;
    g.beginPath();
    g.ellipse(48, 52, 20, 14, 0, 0, Math.PI * 2);
    g.fill();
    // Oil crescents — the drip-off streaks.
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = `rgba(46,38,28,${0.24 + rng.float() * 0.2})`;
      g.lineWidth = 1 + rng.float() * 0.6;
      g.beginPath();
      g.arc(48 + rng.range(-14, 14), 58 + rng.range(-4, 10), 4 + rng.float() * 4, rng.float() * 3, rng.float() * 3 + 1.6);
      g.stroke();
    }
    // Wire curls — sprung spirals that fell and stayed.
    for (let i = 0; i < 3; i++) {
      if (!rng.bool(0.7)) continue;
      g.strokeStyle = 'rgba(180,170,148,0.4)';
      g.lineWidth = 0.5;
      g.beginPath();
      g.arc(48 + rng.range(-20, 20), 48 + rng.range(-14, 20), 1.4 + rng.float() * 1.2, 0, Math.PI * 1.7);
      g.stroke();
    }
    // The toe-line — boot scuffs along the standing edge.
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(60,50,38,${0.16 + rng.float() * 0.2})`;
      g.save();
      g.translate(30 + rng.float() * 36, 76 + rng.range(-4, 4));
      g.rotate(rng.range(-0.4, 0.4));
      g.fillRect(-3, -1, 6 + rng.float() * 3, 2);
      g.restore();
    }
  });
}

/** The barrel's rings — hoop-rust circles and stave weeps where
 *  the keg always sits and sweats. */
export function barrelRings(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48 + rng.range(-4, 4);
    const cy = 48 + rng.range(-4, 4);
    // The seat ring — the hoop's rust circle pressed into the floor.
    g.strokeStyle = 'rgba(96,56,24,0.55)';
    g.lineWidth = 2 + rng.float() * 0.8;
    g.beginPath();
    g.arc(cx, cy, 13 + rng.float() * 2, 0, Math.PI * 2);
    g.stroke();
    // The weep ring outside it — the contents that escaped down the staves.
    g.strokeStyle = 'rgba(70,42,20,0.32)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.arc(cx, cy, 17 + rng.float() * 3, 0, Math.PI * 2);
    g.stroke();
    // Damp blotches pooled between the rings.
    for (let i = 0; i < 8; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 14 + rng.float() * 4;
      g.fillStyle = `rgba(60,38,18,${0.2 + rng.float() * 0.25})`;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.4 + rng.float() * 1.6, 1 + rng.float(), a, 0, Math.PI * 2);
      g.fill();
    }
    // A second ghost — where the barrel stood before this stand.
    if (rng.bool(0.6)) {
      g.strokeStyle = 'rgba(110,68,32,0.2)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx + rng.range(-24, 24), cy + rng.range(-18, 18), 12 + rng.float() * 2, rng.float() * 3, rng.float() * 3 + 4);
      g.stroke();
    }
    // Stave drag — the arc scraped when it was rolled into place.
    g.strokeStyle = `rgba(120,96,64,${0.24 + rng.float() * 0.2})`;
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(cx + rng.range(-10, 10), cy + rng.range(-10, 10), 24 + rng.float() * 8, rng.float() * 4, rng.float() * 4 + 1.2);
    g.stroke();
    // Drip tears off the lowest stave.
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 2 + rng.range(-0.4, 0.4);
      const tx = cx + Math.cos(a) * 15;
      const ty = cy + Math.sin(a) * 15;
      g.fillStyle = `rgba(56,36,18,${0.3 + rng.float() * 0.25})`;
      g.fillRect(tx, ty, 1, 4 + rng.float() * 6);
    }
  });
}

/** The landing wore a turn — a pivoting fan of heel arcs where
 *  every climber wheels round the stair's elbow. */
export function landingWear(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const cx = 48 + rng.range(-8, 8);
    const cy = 44 + rng.range(-8, 8);
    // The turn — concentric heel arcs swept around the pivot point.
    for (let i = 0; i < 7; i++) {
      const r = 8 + i * 5 + rng.float() * 2;
      const a0 = rng.float() * Math.PI * 2;
      const sweep = 1.2 + rng.float() * 1.6;
      g.strokeStyle = `rgba(170,152,122,${0.14 + rng.float() * 0.18})`;
      g.lineWidth = 1.4 + rng.float() * 0.8;
      g.beginPath();
      g.arc(cx, cy, r, a0, a0 + sweep);
      g.stroke();
    }
    // The pivot — a polished knot where the leading foot plants.
    const pivot = g.createRadialGradient(cx, cy, 1, cx, cy, 9);
    pivot.addColorStop(0, 'rgba(196,180,150,0.5)');
    pivot.addColorStop(1, 'rgba(196,180,150,0)');
    g.fillStyle = pivot;
    g.beginPath();
    g.arc(cx, cy, 9, 0, Math.PI * 2);
    g.fill();
    // Toe drags — short straight scuffs where a boot pivoted on its heel.
    for (let i = 0; i < 6; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 10 + rng.float() * 16;
      const tx = cx + Math.cos(a) * r;
      const ty = cy + Math.sin(a) * r;
      g.save();
      g.translate(tx, ty);
      g.rotate(a + Math.PI / 2);
      g.fillStyle = `rgba(70,58,44,${0.18 + rng.float() * 0.2})`;
      g.fillRect(-2.5, -0.7, 5 + rng.float() * 3, 1.4);
      g.restore();
    }
    // Dust that the feet pushed out of the arc lanes.
    for (let i = 0; i < 12; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 26 + rng.float() * 12;
      g.fillStyle = `rgba(96,84,66,${0.14 + rng.float() * 0.2})`;
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 0.9, 0.9);
    }
  });
}

/** The cage shook its rust — flake falls and wire drags on the
 *  floor beneath doors that get rattled to check the lock. */
export function cageRattle(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // The shake line — a rust dust strip under the door's bottom rail.
    const band = g.createLinearGradient(0, 30, 0, 44);
    band.addColorStop(0, 'rgba(110,60,26,0)');
    band.addColorStop(0.45, `rgba(110,60,26,${0.35 + rng.float() * 0.15})`);
    band.addColorStop(1, 'rgba(110,60,26,0)');
    g.fillStyle = band;
    g.fillRect(10, 30, 76, 14);
    // Flake falls — bright oxide chips in the shake line.
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `rgba(${140 + Math.floor(rng.float() * 50)},${64 + Math.floor(rng.float() * 24)},${22 + Math.floor(rng.float() * 12)},${0.3 + rng.float() * 0.35})`;
      g.save();
      g.translate(12 + rng.float() * 72, 32 + rng.float() * 12);
      g.rotate(rng.float() * Math.PI);
      g.fillRect(-1, -0.5, 2 + rng.float() * 2, 1 + rng.float());
      g.restore();
    }
    // The rattle grip — a finger-polished spot mid-door.
    const gx = 36 + rng.float() * 24;
    const grip = g.createRadialGradient(gx, 18, 1, gx, 18, 9);
    grip.addColorStop(0, 'rgba(170,150,122,0.4)');
    grip.addColorStop(1, 'rgba(170,150,122,0)');
    g.fillStyle = grip;
    g.beginPath();
    g.arc(gx, 18, 9, 0, Math.PI * 2);
    g.fill();
    // Wire shadows — the mesh's own stave lines in the grime.
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(50,42,32,${0.2 + rng.float() * 0.16})`;
      g.fillRect(14 + i * 12 + rng.range(-1, 1), 30, 0.7, 14);
    }
    // The kick dent — a toe-deep scuff at the frame's foot.
    g.fillStyle = 'rgba(44,36,26,0.5)';
    g.save();
    g.translate(48 + rng.range(-16, 16), 44);
    g.rotate(rng.range(-0.2, 0.2));
    g.fillRect(-3.5, -1.2, 7, 2.4);
    g.restore();
  });
}

/** The call button grubbed — a finger-worn halo and wipe streaks
 *  round the plate everyone jabs at the lift. */
export function callGrub(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (g) => {
    const bx = 32 + rng.range(-4, 4);
    const by = 30 + rng.range(-4, 4);
    // The halo — decades of fingers missing and finding the button.
    const halo = g.createRadialGradient(bx, by, 2, bx, by, 16);
    halo.addColorStop(0, 'rgba(60,50,38,0.55)');
    halo.addColorStop(0.5, 'rgba(60,50,38,0.28)');
    halo.addColorStop(1, 'rgba(60,50,38,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(bx, by, 16, 0, Math.PI * 2);
    g.fill();
    // The button's own crown — polished bright by the jabs.
    g.fillStyle = 'rgba(190,176,150,0.55)';
    g.beginPath();
    g.arc(bx, by, 3 + rng.float(), 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(46,38,28,0.4)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.arc(bx, by, 4.5 + rng.float(), 0, Math.PI * 2);
    g.stroke();
    // Missed jabs — nail scratches ringing the button.
    for (let i = 0; i < 6; i++) {
      const a = rng.float() * Math.PI * 2;
      g.strokeStyle = `rgba(170,156,132,${0.18 + rng.float() * 0.2})`;
      g.lineWidth = 0.4;
      g.beginPath();
      g.arc(bx + rng.range(-1.5, 1.5), by + rng.range(-1.5, 1.5), 6 + rng.float() * 4, a, a + 0.5 + rng.float() * 0.6);
      g.stroke();
    }
    // The drag — fingers slide down off the button to the plate edge.
    g.fillStyle = `rgba(80,68,50,${0.22 + rng.float() * 0.18})`;
    g.fillRect(bx - 1 + rng.range(-2, 2), by + 5, 2 + rng.float(), 16 + rng.float() * 8);
    // The plate screws — rust ticks at the corners.
    for (const [sx, sy] of [[6, 6], [58, 6], [6, 90], [58, 90]] as const) {
      if (!rng.bool(0.7)) continue;
      g.fillStyle = `rgba(120,66,28,${0.3 + rng.float() * 0.3})`;
      g.beginPath();
      g.arc(sx + rng.range(-1, 1), sy + rng.range(-1, 1), 1 + rng.float() * 0.7, 0, Math.PI * 2);
      g.fill();
    }
    // Smear field — the wall's own grime around the plate.
    const grime = g.createRadialGradient(32, 48, 6, 32, 48, 30);
    grime.addColorStop(0, 'rgba(74,62,48,0.14)');
    grime.addColorStop(1, 'rgba(74,62,48,0)');
    g.fillStyle = grime;
    g.fillRect(4, 20, 56, 60);
  });
}

/** The wheel shed its wool — lanolin dust and fiber drifts caught
 *  in the treadle path and under the flyer. */
export function spinDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // Wool dust — a soft felted film over the wheel's working face.
    const film = g.createRadialGradient(48, 30, 3, 48, 30, 30);
    film.addColorStop(0, 'rgba(168,150,118,0.3)');
    film.addColorStop(0.7, 'rgba(168,150,118,0.14)');
    film.addColorStop(1, 'rgba(168,150,118,0)');
    g.fillStyle = film;
    g.fillRect(16, 6, 64, 50);
    // Fiber wisps — threads that drifted and stuck.
    for (let i = 0; i < 12; i++) {
      g.strokeStyle = `rgba(190,174,144,${0.2 + rng.float() * 0.25})`;
      g.lineWidth = 0.5;
      g.beginPath();
      const wx = 20 + rng.float() * 56;
      const wy = 12 + rng.float() * 40;
      g.moveTo(wx, wy);
      g.quadraticCurveTo(wx + rng.range(-4, 4), wy + rng.range(-3, 3), wx + rng.range(-7, 7), wy + rng.range(-5, 5));
      g.stroke();
    }
    // The treadle dip — a worn hollow where the foot pumps.
    const dip = g.createRadialGradient(48 + rng.range(-6, 6), 50, 1, 48 + rng.range(-6, 6), 50, 8);
    dip.addColorStop(0, 'rgba(60,48,34,0.5)');
    dip.addColorStop(1, 'rgba(60,48,34,0)');
    g.fillStyle = dip;
    g.beginPath();
    g.ellipse(48, 50, 10, 5, 0, 0, Math.PI * 2);
    g.fill();
    // Lanolin sheen — oily wipe marks on the spokes' reach.
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = `rgba(150,132,102,${0.16 + rng.float() * 0.14})`;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(48, 26, 10 + i * 4 + rng.float() * 2, rng.float() * 3, rng.float() * 3 + 1);
      g.stroke();
    }
    // Fuzz knots — little balls where fibers gathered.
    for (let i = 0; i < 7; i++) {
      g.fillStyle = `rgba(160,144,114,${0.3 + rng.float() * 0.3})`;
      g.beginPath();
      g.arc(22 + rng.float() * 52, 14 + rng.float() * 40, 0.7 + rng.float() * 0.9, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** The counter kept the coins — a scratch fan where change gets
 *  swept across and the elbow's polish at the lean spot. */
export function counterBelt(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // Coin scratches — bright score arcs where payment gets slid.
    for (let i = 0; i < 14; i++) {
      const sx = 28 + rng.float() * 40;
      const sy = 20 + rng.float() * 24;
      g.strokeStyle = `rgba(196,184,162,${0.16 + rng.float() * 0.24})`;
      g.lineWidth = 0.4 + rng.float() * 0.4;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + rng.range(-6, 6), sy + rng.range(-3, 3), sx + rng.range(-12, 12), sy + rng.range(-5, 5));
      g.stroke();
    }
    // The coin well — a round-worn spot where change pools.
    const well = g.createRadialGradient(48 + rng.range(-10, 10), 30, 1, 48 + rng.range(-10, 10), 30, 9);
    well.addColorStop(0, 'rgba(180,166,142,0.4)');
    well.addColorStop(1, 'rgba(180,166,142,0)');
    g.fillStyle = well;
    g.beginPath();
    g.arc(48, 30, 9, 0, Math.PI * 2);
    g.fill();
    // The elbow rest — a long dull polish at the front edge.
    const elbow = g.createLinearGradient(0, 52, 0, 60);
    elbow.addColorStop(0, 'rgba(170,152,128,0)');
    elbow.addColorStop(0.6, `rgba(176,158,132,${0.26 + rng.float() * 0.14})`);
    elbow.addColorStop(1, 'rgba(176,158,132,0)');
    g.fillStyle = elbow;
    g.fillRect(24 + rng.range(-8, 8), 52, 44, 8);
    // One deep gouge — a coin dug a scar once.
    g.strokeStyle = 'rgba(150,134,108,0.45)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(24 + rng.float() * 20, 24 + rng.float() * 12);
    g.lineTo(60 + rng.float() * 16, 26 + rng.float() * 12);
    g.stroke();
    // Coffee rings — payment taken over cups.
    if (rng.bool(0.6)) {
      g.strokeStyle = 'rgba(90,64,38,0.35)';
      g.lineWidth = 1.1;
      g.beginPath();
      g.arc(30 + rng.float() * 40, 34 + rng.range(-8, 8), 5 + rng.float() * 2, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

/** The bell dulled — a palm-polished cap and the smut ring where
 *  hands bang the counter bell for attention nobody gives. */
export function bellTap(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (g) => {
    // The tap crown — the dome's apex polished bright by palms.
    const crown = g.createRadialGradient(32, 26, 1, 32, 26, 12);
    crown.addColorStop(0, 'rgba(210,198,172,0.6)');
    crown.addColorStop(0.55, 'rgba(210,198,172,0.2)');
    crown.addColorStop(1, 'rgba(210,198,172,0)');
    g.fillStyle = crown;
    g.beginPath();
    g.arc(32, 26, 12, 0, Math.PI * 2);
    g.fill();
    // The dome's own circle — the bell's rim in the grime field.
    g.strokeStyle = 'rgba(50,42,32,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(32, 30, 14 + rng.float() * 2, 0, Math.PI * 2);
    g.stroke();
    // Grime around — the counter dust the bell's skirt never reaches.
    const grime = g.createRadialGradient(32, 34, 10, 32, 34, 26);
    grime.addColorStop(0, 'rgba(80,68,52,0.1)');
    grime.addColorStop(1, 'rgba(80,68,52,0.3)');
    g.fillStyle = grime;
    g.beginPath();
    g.arc(32, 34, 26, 0, Math.PI * 2);
    g.fill();
    // Palm smuts — hand-oil crescents off the cap's sides.
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = `rgba(110,94,72,${0.2 + rng.float() * 0.2})`;
      g.lineWidth = 0.7;
      g.beginPath();
      g.arc(32 + rng.range(-4, 4), 28 + rng.range(-3, 3), 8 + rng.float() * 3, rng.float() * 3, rng.float() * 3 + 1);
      g.stroke();
    }
    // Fingerprint commas where impatient fingers tapped.
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = `rgba(140,126,102,${0.16 + rng.float() * 0.2})`;
      g.lineWidth = 0.5;
      g.beginPath();
      g.arc(32 + rng.range(-14, 14), 30 + rng.range(-10, 10), 1.2, 0, Math.PI * 1.3);
      g.stroke();
    }
  });
}

/** The pews wore the knees — shin-kick scuffs along the pew foot
 *  and the sit-line's shine where congregations sat a century. */
export function pewWear(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (g) => {
    // The sit-shine — a long dull polish along the seat's leading edge.
    const shine = g.createLinearGradient(0, 8, 0, 16);
    shine.addColorStop(0, 'rgba(180,160,132,0)');
    shine.addColorStop(0.5, `rgba(186,166,138,${0.3 + rng.float() * 0.15})`);
    shine.addColorStop(1, 'rgba(186,166,138,0)');
    g.fillStyle = shine;
    g.fillRect(8, 8, 80, 8);
    // Shin kicks — the drag marks of a hundred shifts and kneels.
    for (let i = 0; i < 9; i++) {
      g.save();
      g.translate(14 + rng.float() * 68, 30 + rng.range(-5, 6));
      g.rotate(rng.range(-0.3, 0.3));
      g.fillStyle = `rgba(140,120,94,${0.16 + rng.float() * 0.22})`;
      g.fillRect(-4, -0.9, 8 + rng.float() * 5, 1.8);
      g.restore();
    }
    // Hymnal groove — the ledge line where the books always rest.
    g.strokeStyle = `rgba(90,74,54,${0.3 + rng.float() * 0.2})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(10, 20 + rng.range(-1, 1));
    g.lineTo(86, 20 + rng.range(-1, 1));
    g.stroke();
    // Knee dents — paired dimples where the kneelers' shins press.
    for (const kx of [30, 62]) {
      if (!rng.bool(0.75)) continue;
      for (const off of [-3, 3]) {
        g.fillStyle = 'rgba(58,46,34,0.4)';
        g.beginPath();
        g.ellipse(kx + off + rng.range(-1, 1), 36 + rng.range(-1.5, 1.5), 1.4, 0.9, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // The floor side's dust ridge — swept grit under the seat lip.
    g.fillStyle = `rgba(110,96,74,${0.2 + rng.float() * 0.14})`;
    g.fillRect(10, 42 + rng.range(-1, 1), 76, 1.6);
    // Graffiti ghosts — knife initials scrubbed but still readable.
    if (rng.bool(0.4)) {
      g.strokeStyle = 'rgba(120,102,78,0.3)';
      g.lineWidth = 0.5;
      const gx = 20 + rng.float() * 50;
      g.strokeRect(gx, 12 + rng.range(-2, 2), 3, 3.5);
      g.beginPath();
      g.moveTo(gx + 5, 12); g.lineTo(gx + 5, 15.5);
      g.moveTo(gx + 4, 13.5); g.lineTo(gx + 6, 13.5);
      g.stroke();
    }
  });
}

/** The kneeler kept the weight — elbow shine on the rail and the
 *  deep soft dents in the pad where the knees go. */
export function kneelRubs(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // The rail's sheen — forearms polished a band along the rest.
    const sheen = g.createLinearGradient(0, 8, 0, 18);
    sheen.addColorStop(0, 'rgba(190,172,142,0)');
    sheen.addColorStop(0.5, `rgba(196,178,148,${0.35 + rng.float() * 0.15})`);
    sheen.addColorStop(1, 'rgba(196,178,148,0)');
    g.fillStyle = sheen;
    g.fillRect(12, 8, 72, 10);
    // Elbow cups — twin darker rests where the elbows dig in.
    for (const ex of [30, 64]) {
      const cup = g.createRadialGradient(ex, 13, 1, ex, 13, 7);
      cup.addColorStop(0, 'rgba(120,102,76,0.45)');
      cup.addColorStop(1, 'rgba(120,102,76,0)');
      g.fillStyle = cup;
      g.beginPath();
      g.ellipse(ex + rng.range(-2, 2), 13, 7, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
    // The pad's memory — knee dents sunk where the praying happens.
    for (const kx of [34, 60]) {
      const dent = g.createRadialGradient(kx, 46, 1, kx, 46, 10);
      dent.addColorStop(0, 'rgba(56,44,32,0.5)');
      dent.addColorStop(0.65, 'rgba(56,44,32,0.22)');
      dent.addColorStop(1, 'rgba(56,44,32,0)');
      g.fillStyle = dent;
      g.beginPath();
      g.ellipse(kx + rng.range(-2, 2), 46 + rng.range(-1, 1), 10, 7, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Seam crease — the pad's own fold line across the middle.
    g.strokeStyle = 'rgba(46,36,26,0.4)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(14, 46 + rng.range(-0.8, 0.8));
    g.quadraticCurveTo(48, 47 + rng.range(-1, 1), 82, 46 + rng.range(-0.8, 0.8));
    g.stroke();
    // Finger rubs on the rail edge — the grip before standing.
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = `rgba(160,144,118,${0.16 + rng.float() * 0.18})`;
      g.lineWidth = 0.5;
      g.beginPath();
      g.arc(24 + rng.float() * 48, 16 + rng.range(-1, 1), 2.5 + rng.float() * 1.5, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
    }
  });
}

/** The hatch kept its ring — pull-ring rust and the dust seam that
 *  frames the door nobody opens. */
export function hatchRing(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    const hx = 50 + rng.range(-8, 8);
    const hy = 34 + rng.range(-8, 8);
    // The pull-ring's orbit — rust circle where the ring swings.
    g.strokeStyle = `rgba(124,68,30,${0.45 + rng.float() * 0.2})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(hx, hy, 6 + rng.float() * 1.5, 0, Math.PI * 2);
    g.stroke();
    // Rust sprinkle inside the orbit — what the ring sheds.
    for (let i = 0; i < 10; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 4 + rng.float() * 6;
      g.fillStyle = `rgba(150,86,38,${0.3 + rng.float() * 0.3})`;
      g.fillRect(hx + Math.cos(a) * r, hy + Math.sin(a) * r, 0.9, 0.9);
    }
    // The seam — a dark rectangle where the hatch meets its frame.
    g.strokeStyle = 'rgba(30,24,18,0.55)';
    g.lineWidth = 1.8;
    const sx = 22 + rng.range(-2, 2), sy = 18 + rng.range(-2, 2);
    const sw = 52 + rng.range(-3, 3), sh = 60 + rng.range(-3, 3);
    g.strokeRect(sx, sy, sw, sh);
    // Dust drifted against the seam's lip — a pale line along two edges.
    g.fillStyle = `rgba(160,146,120,${0.24 + rng.float() * 0.16})`;
    g.fillRect(sx, sy - 1.4, sw, 1.4);
    g.fillRect(sx - 1.4, sy, 1.4, sh);
    // The hinge ticks — dark bites on the seam's hinge side.
    for (const hyt of [sy + 8, sy + sh - 10]) {
      g.fillStyle = 'rgba(38,30,22,0.6)';
      g.fillRect(sx + (rng.bool(0.5) ? 0 : sw - 2), hyt, 2.4, 3.6);
    }
    // Drag marks — the ring's swing arcs scraping the plate.
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = `rgba(150,130,104,${0.2 + rng.float() * 0.16})`;
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(hx + rng.range(-1, 1), hy + rng.range(-1, 1), 8 + rng.float() * 3, rng.float() * 3, rng.float() * 3 + 1.2);
      g.stroke();
    }
    // Finger grub below the ring — the pull zone's grime.
    const grub = g.createRadialGradient(hx, hy + 10, 1, hx, hy + 10, 7);
    grub.addColorStop(0, 'rgba(64,52,38,0.4)');
    grub.addColorStop(1, 'rgba(64,52,38,0)');
    g.fillStyle = grub;
    g.beginPath();
    g.arc(hx, hy + 10, 7, 0, Math.PI * 2);
    g.fill();
  });
}

/** The canvas crackled — age craquelure webbing the paint and a
 *  slack-canvas shadow where the fabric pulled loose. */
export function canvasCrackle(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // The web — fine crazed cracks threading the whole face.
    for (let i = 0; i < 26; i++) {
      let x = 8 + rng.float() * 80;
      let y = 8 + rng.float() * 80;
      g.strokeStyle = `rgba(${60 + Math.floor(rng.float() * 40)},${52 + Math.floor(rng.float() * 36)},${40 + Math.floor(rng.float() * 28)},${0.2 + rng.float() * 0.28})`;
      g.lineWidth = 0.35;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += rng.range(-8, 8);
        y += rng.range(-6, 6);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // Slack shadow — the canvas's belly where it left the stretcher.
    const belly = g.createRadialGradient(48 + rng.range(-10, 10), 50 + rng.range(-8, 8), 4, 48, 50, 26);
    belly.addColorStop(0, 'rgba(40,32,24,0.25)');
    belly.addColorStop(1, 'rgba(40,32,24,0)');
    g.fillStyle = belly;
    g.fillRect(20, 24, 56, 52);
    // Paint loss — flake chips down to the gesso.
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(190,180,158,${0.3 + rng.float() * 0.3})`;
      g.beginPath();
      g.ellipse(14 + rng.float() * 68, 14 + rng.float() * 68, 0.9 + rng.float() * 1.6, 0.6 + rng.float() * 1, rng.float(), 0, Math.PI * 2);
      g.fill();
    }
    // Varnish amber — the old coat's nicotine film.
    const amber = g.createLinearGradient(0, 0, 96, 96);
    amber.addColorStop(0, 'rgba(140,104,44,0)');
    amber.addColorStop(0.5, `rgba(140,104,44,${0.12 + rng.float() * 0.08})`);
    amber.addColorStop(1, 'rgba(140,104,44,0)');
    g.fillStyle = amber;
    g.fillRect(6, 6, 84, 84);
    // Stretcher ghost — faint bar lines where the frame presses behind.
    for (const pos of [10, 86]) {
      g.fillStyle = 'rgba(50,40,30,0.18)';
      g.fillRect(pos - 0.8, 8, 1.6, 80);
      g.fillRect(8, pos - 0.8, 80, 1.6);
    }
  });
}

/** The darts missed the board — a pocked halo round the target and
 *  the floor scars where the throwers stood. */
export function dartSplash(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // The pock field — holes sprayed around the board's rim.
    for (let i = 0; i < 30; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 22 + rng.float() * 18;
      const px = 48 + Math.cos(a) * r;
      const py = 46 + Math.sin(a) * r;
      g.fillStyle = `rgba(36,28,20,${0.4 + rng.float() * 0.35})`;
      g.beginPath();
      g.arc(px, py, 0.5 + rng.float() * 0.8, 0, Math.PI * 2);
      g.fill();
      // The crater lip — plaster pushed up round the hole.
      if (rng.bool(0.4)) {
        g.strokeStyle = 'rgba(160,146,122,0.25)';
        g.lineWidth = 0.4;
        g.beginPath();
        g.arc(px, py, 1.4 + rng.float(), 0, Math.PI * 2);
        g.stroke();
      }
    }
    // The board's own ring — where its rim shields the wall.
    g.strokeStyle = 'rgba(30,24,18,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(48, 46, 20 + rng.float(), 0, Math.PI * 2);
    g.stroke();
    // Chalk dust under the scoring spot.
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(190,184,170,${0.2 + rng.float() * 0.24})`;
      g.fillRect(66 + rng.float() * 20, 60 + rng.float() * 8, 0.9, 0.9);
    }
  });
}

/** The toes kept the line — a gouged oche and the chalk smear of a
 *  thousand throws, on the floor out from the dartboard. */
export function ocheLine(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (g) => {
    // Chalk smear thrown forward of the line.
    const lane = g.createLinearGradient(0, 0, 0, 48);
    lane.addColorStop(0, 'rgba(150,134,108,0)');
    lane.addColorStop(0.55, `rgba(150,134,108,${0.16 + rng.float() * 0.12})`);
    lane.addColorStop(1, 'rgba(150,134,108,0)');
    g.fillStyle = lane;
    g.fillRect(18, 4, 60, 40);
    // The gouge itself — a dragged toe-mark, ends worn past the chalk.
    g.strokeStyle = `rgba(120,102,78,${0.32 + rng.float() * 0.2})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(16 + rng.range(-2, 2), 12 + rng.range(-1, 1));
    g.lineTo(80 + rng.range(-2, 2), 12 + rng.range(-1, 1));
    g.stroke();
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(190,184,170,${0.18 + rng.float() * 0.2})`;
      g.fillRect(20 + rng.float() * 56, 16 + rng.float() * 22, 0.9, 0.9);
    }
  });
}

/** The printers coughed toner — grey scatter and paper-jam streaks
 *  under the machines that always jam. */
export function tonerDrift(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // The drift — toner grey pooled under the output slot.
    const pool = g.createRadialGradient(50, 44, 3, 50, 44, 24);
    pool.addColorStop(0, 'rgba(52,48,44,0.45)');
    pool.addColorStop(0.7, 'rgba(52,48,44,0.18)');
    pool.addColorStop(1, 'rgba(52,48,44,0)');
    g.fillStyle = pool;
    g.beginPath();
    g.ellipse(50, 44, 26, 18, 0, 0, Math.PI * 2);
    g.fill();
    // The scatter — fine black dust sprayed past the tray.
    for (let i = 0; i < 34; i++) {
      const a = rng.range(-0.6, 0.6) + Math.PI / 2;
      const r = 10 + rng.float() * 34;
      g.fillStyle = `rgba(40,36,34,${0.2 + rng.float() * 0.3})`;
      g.fillRect(48 + Math.cos(a) * r, 40 + Math.sin(a) * r * 0.7, 0.8 + rng.float() * 0.7, 0.7 + rng.float() * 0.5);
    }
    // Paper streaks — the jams dragged out leaving drag bars.
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(150,142,126,${0.16 + rng.float() * 0.16})`;
      g.save();
      g.translate(48 + rng.range(-16, 16), 46 + rng.range(-8, 10));
      g.rotate(rng.range(-0.5, 0.5));
      g.fillRect(-8, -0.9, 16 + rng.float() * 6, 1.8);
      g.restore();
    }
    // Paper chips — torn-off corners that never got picked up.
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(200,194,178,${0.3 + rng.float() * 0.3})`;
      g.save();
      g.translate(20 + rng.float() * 56, 56 + rng.float() * 26);
      g.rotate(rng.float() * Math.PI);
      g.fillRect(-1.4, -1, 2.8 + rng.float() * 2, 2 + rng.float() * 1.6);
      g.restore();
    }
    // The service-open ghost — a darker patch where the cover drops.
    g.strokeStyle = 'rgba(44,38,32,0.3)';
    g.lineWidth = 0.8;
    g.strokeRect(36 + rng.range(-4, 4), 30 + rng.range(-4, 4), 24 + rng.float() * 6, 16 + rng.float() * 4);
  });
}

/** The boots kept the mud — heel-and-toe stamps and a kicked mud
 *  line under the rack where the wet boots always stand. */
export function bootPrints(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (g) => {
    // Standing prints — paired sole ghosts where the boots live.
    for (let i = 0; i < 4; i++) {
      const px = 24 + rng.float() * 48;
      const py = 30 + rng.float() * 24;
      const rot = rng.range(-0.4, 0.4);
      for (const side of [-2.5, 2.5]) {
        g.save();
        g.translate(px + side + rng.range(-0.8, 0.8), py);
        g.rotate(rot);
        // Sole pad.
        g.fillStyle = `rgba(${70 + Math.floor(rng.float() * 24)},${54 + Math.floor(rng.float() * 18)},${36 + Math.floor(rng.float() * 12)},${0.3 + rng.float() * 0.25})`;
        g.beginPath();
        g.ellipse(0, -1.5, 2.2, 3.2, 0, 0, Math.PI * 2);
        g.fill();
        // Heel pad.
        g.beginPath();
        g.ellipse(0, 3.4, 1.6, 1.8, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    // The trudge — a short sequence of fading stamps out one side.
    const ta = rng.range(-0.6, 0.6);
    for (let i = 0; i < 5; i++) {
      const tx = 14 + i * 12;
      const ty = 66 + i * 3 * Math.sin(ta);
      g.save();
      g.translate(tx, ty);
      g.rotate(ta);
      g.fillStyle = `rgba(80,62,42,${0.32 - i * 0.05})`;
      g.beginPath();
      g.ellipse(0, 0, 2, 3, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // Dried clods — mud crumbs shaken off the treads.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(60,46,30,${0.3 + rng.float() * 0.3})`;
      g.fillRect(18 + rng.float() * 60, 26 + rng.float() * 40, 0.8 + rng.float() * 1.1, 0.7 + rng.float() * 0.8);
    }
    // The kick line — a smear where boots get toed off the wall.
    g.strokeStyle = `rgba(76,58,38,${0.3 + rng.float() * 0.2})`;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(20, 20 + rng.range(-2, 2));
    g.quadraticCurveTo(48, 18 + rng.range(-2, 2), 76, 20 + rng.range(-2, 2));
    g.stroke();
  });
}

/** The hooks rusted rings — an oxide halo round each meat hook
 *  and ceiling hook, plus the blood-dark drip under the point. */
export function hookRing(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    const hx = 48 + rng.range(-6, 6);
    // The mount ring — rust halo where the hook meets its boss.
    g.strokeStyle = `rgba(128,70,30,${0.5 + rng.float() * 0.2})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(hx, 18 + rng.range(-2, 2), 5 + rng.float() * 1.5, 0, Math.PI * 2);
    g.stroke();
    // Rust bleed — oxide wicking outward in threads.
    for (let i = 0; i < 8; i++) {
      const a = rng.float() * Math.PI * 2;
      const len = 5 + rng.float() * 9;
      g.strokeStyle = `rgba(140,80,36,${0.2 + rng.float() * 0.24})`;
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(hx + Math.cos(a) * 5, 18 + Math.sin(a) * 5);
      g.lineTo(hx + Math.cos(a) * len + rng.range(-1, 1), 18 + Math.sin(a) * len + rng.range(-1, 1));
      g.stroke();
    }
    // The drip — a blood-dark thread dropping off the point.
    const dx = hx + rng.range(-2, 2);
    const drip = g.createLinearGradient(0, 26, 0, 52);
    drip.addColorStop(0, 'rgba(88,34,20,0.5)');
    drip.addColorStop(1, 'rgba(88,34,20,0)');
    g.fillStyle = drip;
    g.fillRect(dx, 26, 1.4 + rng.float() * 0.8, 26 + rng.float() * 8);
    // The swing scar — an arc where the hook's swing kept the mark.
    g.strokeStyle = `rgba(150,132,106,${0.24 + rng.float() * 0.2})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(hx, 20, 12 + rng.float() * 4, Math.PI * 0.4, Math.PI * 0.9);
    g.stroke();
    // Flecks — scale chips that fell.
    for (let i = 0; i < 7; i++) {
      g.fillStyle = `rgba(150,88,40,${0.28 + rng.float() * 0.3})`;
      g.fillRect(hx + rng.range(-12, 12), 30 + rng.float() * 24, 0.8 + rng.float() * 0.6, 0.7 + rng.float() * 0.5);
    }
  });
}

/** The racks remembered weight — sag shadows and load dents where
 *  cases and keys have hung too long. */
export function rackWeight(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (g) => {
    // The sag — a bowed shadow where the rail bends under its load.
    g.strokeStyle = 'rgba(52,42,32,0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(10, 14 + rng.range(-1, 1));
    g.quadraticCurveTo(48, 20 + rng.range(-1, 2), 86, 14 + rng.range(-1, 1));
    g.stroke();
    // Load dents — divots where each case's weight digs in.
    for (let i = 0; i < 5; i++) {
      const lx = 16 + rng.float() * 64;
      const dent = g.createRadialGradient(lx, 22, 1, lx, 22, 6);
      dent.addColorStop(0, 'rgba(60,48,36,0.45)');
      dent.addColorStop(1, 'rgba(60,48,36,0)');
      g.fillStyle = dent;
      g.beginPath();
      g.arc(lx, 22, 6, 0, Math.PI * 2);
      g.fill();
    }
    // Chafe lines — where straps and handles rub the rail.
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = `rgba(160,142,116,${0.16 + rng.float() * 0.18})`;
      g.lineWidth = 0.6;
      const rx = 14 + rng.float() * 68;
      g.beginPath();
      g.moveTo(rx, 12 + rng.range(-1, 1));
      g.lineTo(rx + rng.range(-3, 3), 20 + rng.range(-1, 2));
      g.stroke();
    }
    // Dust on the shadow side — a soft fill under the sag.
    const dust = g.createLinearGradient(0, 24, 0, 36);
    dust.addColorStop(0, 'rgba(130,116,92,0)');
    dust.addColorStop(0.5, `rgba(130,116,92,${0.16 + rng.float() * 0.12})`);
    dust.addColorStop(1, 'rgba(130,116,92,0)');
    g.fillStyle = dust;
    g.fillRect(14, 24, 68, 12);
    // A strap ghost — the pale rectangle one bag protected.
    if (rng.bool(0.5)) {
      g.strokeStyle = 'rgba(190,176,148,0.28)';
      g.lineWidth = 1;
      g.strokeRect(28 + rng.range(-6, 6), 26 + rng.range(-3, 3), 14 + rng.float() * 6, 8 + rng.float() * 4);
    }
  });
}

/** Can ring — the rust ring a stored can leaves on its shelf: an
 * orange circle, oxide dust, a few stacked rings from re-sets. */
export function canRing(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // stacked rings — re-set cans leave concentric rust circles
    const rings = 2 + Math.floor(rng.float() * 3);
    for (let i = 0; i < rings; i++) {
      const cx = 32 + (rng.float() - 0.5) * 12;
      const cy = 32 + (rng.float() - 0.5) * 12;
      const r = 8 + rng.float() * 10;
      ctx.strokeStyle = `rgba(120,70,38,${0.4 + rng.float() * 0.25})`;
      ctx.lineWidth = 2 + rng.float() * 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      // wet ghost inside the ring
      ctx.fillStyle = `rgba(110,66,36,${0.14 + rng.float() * 0.1})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // oxide dust — rust powder scattered around
    for (let i = 0; i < 14; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 14 + rng.float() * 16;
      ctx.fillStyle = `rgba(140,82,44,${0.3 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 0.6 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // drip — one orange run off the shelf edge
    if (rng.bool(0.5)) {
      ctx.strokeStyle = 'rgba(120,70,38,0.4)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(36 + rng.float() * 8, 50);
      ctx.lineTo(36 + rng.float() * 6, 62);
      ctx.stroke();
    }
  });
}

/** Beam dust — the ridge a beam keeps where no hand ever reaches:
 * a thick grey film with a clean keel line on top, cobweb bites. */
export function beamDust(rng: Rng): THREE.Texture | null {
  return canvasTex(128, 48, (ctx) => {
    const by = 20 + rng.float() * 6;
    // the film — thick settled dust along the beam top
    ctx.fillStyle = `rgba(150,144,132,${0.3 + rng.float() * 0.14})`;
    ctx.fillRect(4, by, 120, 5);
    // clumps — heavier drifts at the joist pockets
    for (let i = 0; i < 10; i++) {
      const bx = 10 + rng.float() * 108;
      ctx.fillStyle = `rgba(140,134,122,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(bx, by + 2, 4 + rng.float() * 5, 2.4 + rng.float() * 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // the keel — a slightly brighter line down the middle
    ctx.strokeStyle = `rgba(180,174,162,${0.24 + rng.float() * 0.14})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, by + 1.5);
    ctx.lineTo(120, by + 1.5);
    ctx.stroke();
    // cobweb bites — pale thread fans at the beam ends
    for (const ex of [8, 118]) {
      if (!rng.bool(0.6)) continue;
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = `rgba(200,196,186,${0.3 + rng.float() * 0.2})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(ex, by + 4);
        ctx.lineTo(ex + (ex < 20 ? 10 + rng.float() * 8 : -10 - rng.float() * 8), by + 10 + rng.float() * 12);
        ctx.stroke();
      }
    }
    // fallen dust flecks beneath
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.18 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(8 + rng.float() * 112, by + 8 + rng.float() * 18, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Peg wear — the shine a peg keeps where coats always hung: dark
 * rubbed tips, sag shadows below, polish arcs where sleeves slid. */
export function pegWear(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const cx = 32;
    // peg halo — a rubbed ring around the peg's mount
    ctx.strokeStyle = `rgba(50,42,34,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, 26, 6 + rng.float(), 0, Math.PI * 2);
    ctx.stroke();
    // the tip shine — bright wear on the peg's end
    ctx.fillStyle = `rgba(190,180,160,${0.3 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(cx, 26, 2.6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // sag shadow — the shade a heavy coat left pulling down
    const g = ctx.createLinearGradient(0, 30, 0, 74);
    g.addColorStop(0, `rgba(46,38,32,${0.24 + rng.float() * 0.14})`);
    g.addColorStop(1, 'rgba(46,38,32,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, 44, 10 + rng.float() * 4, 22 + rng.float() * 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // polish arcs — where sleeves slid past the peg going up and off
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(170,160,140,${0.24 + rng.float() * 0.16})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, 26, 8 + i * 4 + rng.float() * 2, Math.PI * (0.6 + rng.float() * 0.3), Math.PI * (1.3 + rng.float() * 0.2));
      ctx.stroke();
    }
    // lint at the base
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(150,142,128,${0.2 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(cx - 8 + rng.float() * 16, 66 + rng.float() * 22, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Exting tag — the pull-tag ghost an extinguisher keeps: a red
 * plastic sliver on the pin, inspection string, mount shadow. */
export function extingTag(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 96, (ctx) => {
    const cx = 24;
    // mount shadow — the dark ghost where the bracket grips
    ctx.fillStyle = `rgba(30,26,22,${0.3 + rng.float() * 0.15})`;
    ctx.fillRect(10, 30, 28, 30);
    // the tag — a red plastic sliver still tied to the pin
    ctx.fillStyle = `rgba(150,44,36,${0.6 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(cx, 22);
    ctx.lineTo(cx + 4, 32);
    ctx.lineTo(cx - 2, 34);
    ctx.lineTo(cx - 4, 24);
    ctx.closePath();
    ctx.fill();
    // the string — a slack loop hanging off it
    ctx.strokeStyle = `rgba(200,196,186,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + 1, 30);
    ctx.quadraticCurveTo(cx + 8 + rng.float() * 4, 38 + rng.float() * 4, cx + 4, 46 + rng.float() * 6);
    ctx.stroke();
    // finger grease — smudges where hands tested the handle
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(50,44,36,${0.2 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(14 + rng.float() * 20, 34 + rng.float() * 20, 1.8 + rng.float(), 1 + rng.float(), rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // dust lip on the bracket's top
    ctx.fillStyle = 'rgba(160,152,134,0.3)';
    ctx.fillRect(10, 28, 28, 1.6);
  });
}

/** Pin lines — the tally strings a routing board keeps: pin holes
 * in rows, cotton strings strung between them, pencil labels. */
export function pinLines(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // pin grid — small dark holes in rough rows
    const pins: [number, number][] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        if (!rng.bool(0.7)) continue;
        const px = 14 + c * 14 + (rng.float() - 0.5) * 5;
        const py = 14 + r * 22 + (rng.float() - 0.5) * 6;
        pins.push([px, py]);
        ctx.fillStyle = 'rgba(30,24,18,0.7)';
        ctx.beginPath();
        ctx.arc(px, py, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // strings — a few cotton lines strung between pins
    const runs = 2 + Math.floor(rng.float() * 3);
    for (let i = 0; i < runs && pins.length > 2; i++) {
      const a = pins[Math.floor(rng.float() * pins.length)];
      const c = pins[Math.floor(rng.float() * pins.length)];
      if (a === c) continue;
      ctx.strokeStyle = `rgba(196,188,168,${0.4 + rng.float() * 0.25})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      // slight sag
      const mx = (a[0] + c[0]) / 2;
      const my = (a[1] + c[1]) / 2 + 3 + rng.float() * 4;
      ctx.quadraticCurveTo(mx, my, c[0], c[1]);
      ctx.stroke();
    }
    // pencil labels — faint scribed rows beside some pins
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(80,70,56,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.7;
      const ly = 18 + rng.float() * 60;
      ctx.beginPath();
      ctx.moveTo(66 + rng.float() * 8, ly);
      ctx.lineTo(78 + rng.float() * 8, ly);
      ctx.stroke();
    }
    // eraser dust — crumbs where labels were reworked
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(160,152,134,${0.2 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(10 + rng.float() * 76, 80 + rng.float() * 10, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Bucket ring — the drip ring a bucket leaves: a wet circle with
 * a puddle ghost in the middle, splash spatters outside. */
export function bucketRing(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 32;
    // the ring — a damp circle where the base sat
    ctx.strokeStyle = `rgba(90,96,88,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 3 + rng.float();
    ctx.beginPath();
    ctx.arc(cx, cy, 16 + rng.float() * 3, 0, Math.PI * 2);
    ctx.stroke();
    // the ghost — a faint puddle remnant inside
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 15);
    g.addColorStop(0, 'rgba(80,86,80,0.3)');
    g.addColorStop(1, 'rgba(80,86,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();
    // spatters — drips that missed the ring
    for (let i = 0; i < 12; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 18 + rng.float() * 10;
      ctx.fillStyle = `rgba(90,96,88,${0.26 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.7 + rng.float() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // rust kiss — iron ring oxidized where the handle sat
    if (rng.bool(0.5)) {
      ctx.fillStyle = 'rgba(110,64,36,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx + 10 + rng.float() * 6, cy - 4, 3, 2, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Fan film — the grey film a ceiling fan's blades collect: blade
 * streaks, a clean leading edge, dust shed onto the hub. */
export function fanFilm(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48, cy = 48;
    // blade streaks — dusty arcs along the sweep
    const blades = 3 + Math.floor(rng.float() * 2);
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2 + rng.float() * 0.2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      // blade film — the trailing edge's dust
      const g = ctx.createLinearGradient(10, 0, 34, 0);
      g.addColorStop(0, 'rgba(150,144,132,0.28)');
      g.addColorStop(1, 'rgba(150,144,132,0)');
      ctx.fillStyle = g;
      ctx.fillRect(8, -3, 28, 8);
      // leading edge clean — polished strip where it cuts the air
      ctx.fillStyle = 'rgba(70,60,50,0.3)';
      ctx.fillRect(8, -3, 28, 1.4);
      ctx.restore();
    }
    // hub dust — settled film on the motor cap
    ctx.fillStyle = `rgba(140,134,122,${0.3 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 7 + rng.float() * 2, 0, Math.PI * 2);
    ctx.fill();
    // shed grit — dust the sweep threw off
    for (let i = 0; i < 18; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 30 + rng.float() * 14;
      ctx.fillStyle = `rgba(150,144,132,${0.2 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Hose scuff — the drag arcs a wall hose rubs on its way out:
 * curved wear bands at the reel, chafe stripes where it ran. */
export function hoseScuff(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 20 + rng.float() * 10, cy = 20;
    // reel halo — a dark worn circle where the coil sits
    ctx.strokeStyle = `rgba(60,52,42,${0.35 + rng.float() * 0.2})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 16 + rng.float() * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(50,44,36,${0.2 + rng.float() * 0.12})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    // drag arcs — the hose's sweep lines heading down
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(70,60,50,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.6 + rng.float();
      ctx.beginPath();
      ctx.moveTo(cx + 6 + i * 3, cy + 10);
      ctx.quadraticCurveTo(cx + 26 + i * 6, cy + 30 + i * 6, cx + 40 + i * 8, cy + 60 + i * 8);
      ctx.stroke();
    }
    // chafe spots — where the hose rubbed mid-wall
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(80,70,58,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(40 + rng.float() * 40, 40 + rng.float() * 40, 3 + rng.float() * 2, 1.4 + rng.float(), rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // dust the coil shed
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(160,152,134,${0.18 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(8 + rng.float() * 30, 8 + rng.float() * 30, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Bottle bloom — the grey bloom on stored bottles: a dust film,
 * drip ghosts down the necks, a clean rim where hands held them. */
export function bottleBloom(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const cx = 32;
    // the film — settled dust on shoulders and glass
    const g = ctx.createLinearGradient(0, 10, 0, 90);
    g.addColorStop(0, `rgba(150,144,132,${0.3 + rng.float() * 0.15})`);
    g.addColorStop(0.5, 'rgba(150,144,132,0.16)');
    g.addColorStop(1, 'rgba(150,144,132,0)');
    ctx.fillStyle = g;
    ctx.fillRect(8, 10, 48, 82);
    // neck clean band — where hands lifted it
    ctx.fillStyle = 'rgba(60,54,44,0.22)';
    ctx.fillRect(cx - 4, 14, 8, 10);
    // drip ghosts — old runs down the glass
    for (let i = 0; i < 4; i++) {
      const dx = cx - 12 + rng.float() * 24;
      ctx.strokeStyle = `rgba(140,134,120,${0.24 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(dx, 30);
      ctx.quadraticCurveTo(dx + (rng.float() - 0.5) * 4, 50 + rng.float() * 10, dx + (rng.float() - 0.5) * 6, 70 + rng.float() * 14);
      ctx.stroke();
    }
    // dust clumps on the shoulder
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.28 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx - 14 + rng.float() * 28, 26 + rng.float() * 12, 0.6 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Bust cap — the grey cap a bust's crown and shoulders collect:
 * a crown film, shoulder ledges, clean nose where hands steadied it. */
export function bustCap(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const cx = 32;
    // crown cap — the film across the top planes
    const g = ctx.createLinearGradient(0, 4, 0, 40);
    g.addColorStop(0, `rgba(150,144,132,${0.4 + rng.float() * 0.18})`);
    g.addColorStop(1, 'rgba(150,144,132,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 14, 4, 28, 40);
    // shoulder ledges — dust that settled on the shelf of the chest
    for (const sx of [-1, 1]) {
      ctx.fillStyle = `rgba(150,144,132,${0.32 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(cx + sx * 14, 62 + rng.float() * 4, 9, 3 + rng.float() * 1.5, sx * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // clean nose — the wipe where a hand steadied the face
    ctx.fillStyle = 'rgba(60,54,44,0.26)';
    ctx.beginPath();
    ctx.ellipse(cx + (rng.float() - 0.5) * 4, 30, 2.4, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // settled specks down the plinth
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.22 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(cx - 18 + rng.float() * 36, 70 + rng.float() * 22, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Piece squares — on a dusty board, the squares the pieces stood
 * on stay clean: a checker of pale/kept squares in the film. */
export function pieceSquares(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // overall dust film
    ctx.fillStyle = `rgba(150,144,132,${0.34 + rng.float() * 0.14})`;
    ctx.fillRect(0, 0, 96, 96);
    const cell = 12;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        // a scatter of squares kept clean where a piece stood
        if (rng.float() < 0.3) {
          ctx.clearRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
          ctx.fillStyle = 'rgba(150,144,132,0.06)';
          ctx.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
        }
      }
    }
    // piece rings — faint circular edges where bases sat
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(120,114,102,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(12 + rng.float() * 72, 12 + rng.float() * 72, 3 + rng.float() * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // edge film heavier where hands never reached
    const g = ctx.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, 'rgba(140,134,122,0.14)');
    g.addColorStop(1, 'rgba(140,134,122,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 24);
  });
}

/** Globe spins — horizontal thumb-polish bands where hands turned
 * the sphere: clean arcs at the waist, dust on the cap and foot. */
export function globeSpin(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const cx = 32;
    // cap dust — the top no one touches
    ctx.fillStyle = `rgba(150,144,132,${0.36 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(cx, 16, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // waist bands — the polish arcs of a thousand spins
    for (let i = 0; i < 3; i++) {
      const y = 42 + i * 10 + rng.float() * 3;
      ctx.strokeStyle = `rgba(60,54,44,${0.3 + rng.float() * 0.16})`;
      ctx.lineWidth = 2.4 + rng.float();
      ctx.beginPath();
      ctx.ellipse(cx, y, 15 + rng.float() * 2, 3.5, 0, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    // dust film that survived between the bands
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.2 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(cx - 14 + rng.float() * 28, 30 + rng.float() * 50, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // foot ledge — dust on the stand collar
    ctx.fillStyle = `rgba(140,134,122,${0.3 + rng.float() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(cx, 84, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Gate track — the rub tracks a sliding gate drags: twin scuff
 * lines along the floor rail, grease beads at the wheels. */
export function gateTrack(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // twin rails — the polished tracks the wheels ground
    for (const y of [18, 30]) {
      ctx.strokeStyle = `rgba(60,54,44,${0.4 + rng.float() * 0.18})`;
      ctx.lineWidth = 2.2 + rng.float();
      ctx.beginPath();
      ctx.moveTo(4, y + (rng.float() - 0.5) * 2);
      ctx.lineTo(92, y + (rng.float() - 0.5) * 2);
      ctx.stroke();
    }
    // wheel grease beads — dark drops where the rollers paused
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(40,36,30,${0.4 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(8 + rng.float() * 80, (rng.bool(0.5) ? 18 : 30) + (rng.float() - 0.5) * 4, 2 + rng.float() * 1.6, 1.2 + rng.float(), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // rust dust the tracks shed
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(140,90,50,${0.24 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 84, 10 + rng.float() * 28, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Lift heels — the mark a freight lift keeps: heel arcs at the
 * sill, finger smears on the leaf, a grease seam at the gap. */
export function liftHeels(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // sill heel arcs — boots dragging across the plate
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(60,54,44,${0.34 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.8 + rng.float();
      const x = 14 + rng.float() * 60;
      ctx.beginPath();
      ctx.arc(x, 88, 6 + rng.float() * 4, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    // finger smears — pushes on the leaf at hand height
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(120,114,102,${0.24 + rng.float() * 0.16})`;
      ctx.lineWidth = 2;
      const x = 20 + rng.float() * 56, y = 30 + rng.float() * 30;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng.float() - 0.5) * 10, y + 10 + rng.float() * 8);
      ctx.stroke();
    }
    // grease seam — the weep along the closing gap
    const gx = 46 + rng.float() * 4;
    ctx.fillStyle = `rgba(40,36,30,${0.36 + rng.float() * 0.18})`;
    ctx.fillRect(gx, 8, 2 + rng.float() * 1.4, 80);
    // grit the wheels ground off
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(90,84,74,${0.26 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 84, 80 + rng.float() * 14, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Shutter chain — the wear a shutter's haul chain leaves: a
 * polished run down the jamb, grease spots, a slack-loop ghost. */
export function shutterChain(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 96, (ctx) => {
    const cx = 24;
    // the run — a polished vertical where the chain slides
    const g = ctx.createLinearGradient(0, 6, 0, 78);
    g.addColorStop(0, `rgba(60,54,44,${0.4 + rng.float() * 0.18})`);
    g.addColorStop(1, 'rgba(60,54,44,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 2.5, 6, 5, 74);
    // link shadows — the chain's dotted ghost
    for (let y = 8; y < 76; y += 4) {
      ctx.fillStyle = `rgba(40,36,30,${0.34 + rng.float() * 0.14})`;
      ctx.fillRect(cx - 1.2, y, 2.4, 1.8);
    }
    // grease spots — thumb-grease where hands worked the haul
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(40,36,30,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(cx + (rng.float() - 0.5) * 10, 20 + rng.float() * 50, 1.6 + rng.float(), 2.4 + rng.float(), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // slack loop — the chain's spare curve at the base
    ctx.strokeStyle = `rgba(50,44,38,${0.38 + rng.float() * 0.16})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + 4, 84, 7 + rng.float() * 2, Math.PI * 0.2, Math.PI * 1.4);
    ctx.stroke();
  });
}

/** Tea ring — the tannin tide a forgotten cup keeps: a dark ring
 * inside the rim, a drip tail, dust on the saucer. */
export function teaRing(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 48, (ctx) => {
    const cx = 24, cy = 24;
    // the ring — tannin line where the level sat for years
    ctx.strokeStyle = `rgba(90,60,30,${0.5 + rng.float() * 0.2})`;
    ctx.lineWidth = 1.6 + rng.float() * 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, 13 + rng.float() * 2, 0, Math.PI * 2);
    ctx.stroke();
    // second fainter ring — an earlier fill
    ctx.strokeStyle = `rgba(110,76,40,${0.3 + rng.float() * 0.14})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(cx, cy, 10 + rng.float() * 2, 0, Math.PI * 2);
    ctx.stroke();
    // the dregs — a dark pool ghost at the bottom
    ctx.fillStyle = `rgba(70,46,22,${0.36 + rng.float() * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(cx + (rng.float() - 0.5) * 3, cy + 3, 6 + rng.float() * 2, 3.5 + rng.float(), rng.float() * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // a drip tail over the rim
    ctx.strokeStyle = `rgba(90,60,30,${0.4 + rng.float() * 0.18})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + 10, cy - 8);
    ctx.quadraticCurveTo(cx + 13, cy - 2, cx + 12, cy + 6 + rng.float() * 4);
    ctx.stroke();
    // saucer dust
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.22 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(cx - 18 + rng.float() * 36, cy - 18 + rng.float() * 36, 0.6 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Lens veil — the dust and web film a watched lens grows: a
 * fog patch over the glass, web strands at the hood lip. */
export function lensVeil(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 48, (ctx) => {
    const cx = 24, cy = 24;
    // fog patch — the film over the glass
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 18);
    g.addColorStop(0, `rgba(150,144,132,${0.4 + rng.float() * 0.18})`);
    g.addColorStop(1, 'rgba(150,144,132,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    // web strands — spider silk at the hood lip
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(180,176,164,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - 16 + rng.float() * 6, cy - 14 + rng.float() * 4);
      ctx.quadraticCurveTo(cx + (rng.float() - 0.5) * 20, cy + (rng.float() - 0.5) * 10, cx + 12 + rng.float() * 6, cy - 10 + rng.float() * 6);
      ctx.stroke();
    }
    // dust specks on the housing
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.26 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(4 + rng.float() * 40, 4 + rng.float() * 40, 0.6 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // a dead pixel-clean spot where someone wiped once
    ctx.fillStyle = 'rgba(60,54,44,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx + 4, cy - 2, 3, 2, 0.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Sheet drag — the lines a mangle press keeps: parallel drag
 * streaks in the feed direction, starch ghosts, finger polish. */
export function sheetDrag(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // parallel drag streaks — the linen's way through
    for (let i = 0; i < 7; i++) {
      const y = 10 + i * 4.5 + (rng.float() - 0.5) * 2;
      ctx.strokeStyle = `rgba(120,114,102,${0.26 + rng.float() * 0.18})`;
      ctx.lineWidth = 1.2 + rng.float();
      ctx.beginPath();
      ctx.moveTo(4, y);
      ctx.lineTo(92, y + (rng.float() - 0.5) * 3);
      ctx.stroke();
    }
    // starch ghosts — pale stiff patches where spray dried
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(170,168,158,${0.2 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(12 + rng.float() * 70, 8 + rng.float() * 32, 6 + rng.float() * 4, 2.5 + rng.float(), rng.float() * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // finger polish — the shine on the feed lip
    ctx.fillStyle = `rgba(60,54,44,${0.3 + rng.float() * 0.16})`;
    ctx.fillRect(8, 40, 80, 2.4);
    // edge drips — bluing water that ran off
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(80,100,130,${0.26 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.1;
      const x = 16 + rng.float() * 64;
      ctx.beginPath();
      ctx.moveTo(x, 42);
      ctx.lineTo(x + (rng.float() - 0.5) * 3, 47);
      ctx.stroke();
    }
  });
}

/** Tube lip — the whistle-lip polish a speaking tube keeps: a
 * bright worn rim, breath tarnish below, dust in the grille. */
export function tubeLip(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 64, (ctx) => {
    const cx = 24;
    // mouth polish — lips on brass for a century
    ctx.fillStyle = `rgba(60,54,44,${0.4 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(cx, 14, 9 + rng.float() * 2, 4.5 + rng.float(), 0, 0, Math.PI * 2);
    ctx.fill();
    // breath tarnish — the green-brown bloom below the mouth
    const g = ctx.createLinearGradient(0, 18, 0, 44);
    g.addColorStop(0, `rgba(80,90,70,${0.3 + rng.float() * 0.18})`);
    g.addColorStop(1, 'rgba(80,90,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 10, 18, 20, 26);
    // grille dust — the holes no word cleaned
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx - 8 + rng.float() * 16, 46 + rng.float() * 12, 0.9 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // whistle drip — condensation that ran once
    ctx.strokeStyle = `rgba(90,84,74,${0.3 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx + 5, 18);
    ctx.quadraticCurveTo(cx + 7, 30, cx + 5 + (rng.float() - 0.5) * 3, 40);
    ctx.stroke();
  });
}

/** Alarm pull — the mark a fire alarm's lever keeps: finger grease
 * on the handle, knuckle smudges, dust in the break-glass. */
export function alarmPull(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 64, (ctx) => {
    const cx = 24;
    // finger grease — the pull the drills taught
    ctx.fillStyle = `rgba(60,54,44,${0.42 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(cx, 40, 10 + rng.float() * 2, 5 + rng.float(), 0, 0, Math.PI * 2);
    ctx.fill();
    // knuckle arcs — fingers curled round the T-handle
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(80,72,60,${0.3 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx - 6 + i * 6, 34, 3.2, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    // glass dust — the pane no alarm wiped
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.24 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(cx - 10 + rng.float() * 20, 8 + rng.float() * 16, 0.6 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // grime halo at the mount
    ctx.strokeStyle = `rgba(70,62,50,${0.3 + rng.float() * 0.16})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 4, 36, 56);
  });
}

/** Valve grip — the hand-polish a valve wheel keeps: bright arcs
 * on the rim, grease in the hub, dust on the upper spokes. */
export function valveGrip(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 32, r = 22;
    // rim polish — the arcs where palms turned it
    for (let i = 0; i < 5; i++) {
      const a0 = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(60,54,44,${0.4 + rng.float() * 0.2})`;
      ctx.lineWidth = 2.4 + rng.float();
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a0 + 0.6 + rng.float() * 0.5);
      ctx.stroke();
    }
    // hub grease
    ctx.fillStyle = `rgba(40,36,30,${0.4 + rng.float() * 0.18})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 4 + rng.float(), 0, Math.PI * 2);
    ctx.fill();
    // spoke dust — settled on the upper arcs only
    for (let i = 0; i < 10; i++) {
      const a = Math.PI + rng.float() * Math.PI;
      ctx.fillStyle = `rgba(150,144,132,${0.26 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4) * 0.4 - 4, 0.8 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Needle ghost — the marks a dead gauge keeps: a stuck pointer's
 * arc, dust on the dial face, finger taps at the glass. */
export function needleGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 32;
    // dial dust — film over the face
    ctx.fillStyle = `rgba(150,144,132,${0.3 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fill();
    // needle ghost — the dark arc where the pointer parked for
    // years and bleached the face around it
    const a = Math.PI * (0.7 + rng.float() * 0.6);
    ctx.strokeStyle = `rgba(50,44,36,${0.44 + rng.float() * 0.2})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 19, cy + Math.sin(a) * 19);
    ctx.stroke();
    // pointer sweep ghost — the arc it swept before stopping
    ctx.strokeStyle = `rgba(120,110,96,${0.26 + rng.float() * 0.14})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 17, Math.PI * 0.75, a);
    ctx.stroke();
    // finger taps — the spots someone rapped the glass
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(60,54,44,${0.24 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(cx - 10 + rng.float() * 20, cy - 10 + rng.float() * 20, 2, 1.4, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Cable sleeve — the dust sleeve a hanging cable keeps: a grey
 * tube around the drop, web at the ceiling rosette, a wiped run. */
export function cableSleeve(rng: Rng): THREE.Texture | null {
  return canvasTex(32, 96, (ctx) => {
    const cx = 16;
    // rosette bloom — dust and web at the ceiling anchor
    ctx.fillStyle = `rgba(150,144,132,${0.4 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(cx, 8, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // the sleeve — a dust film hugging the drop
    const g = ctx.createLinearGradient(0, 10, 0, 90);
    g.addColorStop(0, `rgba(150,144,132,${0.34 + rng.float() * 0.14})`);
    g.addColorStop(0.7, 'rgba(150,144,132,0.18)');
    g.addColorStop(1, 'rgba(150,144,132,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 4, 10, 8, 82);
    // web threads — silk from rosette to wall
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(180,176,164,${0.3 + rng.float() * 0.16})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - 4, 10 + rng.float() * 6);
      ctx.quadraticCurveTo(cx + (rng.float() - 0.5) * 14, 20 + rng.float() * 10, cx + 8, 24 + rng.float() * 12);
      ctx.stroke();
    }
    // a wiped run — where a hand slid it
    ctx.fillStyle = 'rgba(60,54,44,0.2)';
    ctx.fillRect(cx - 3, 40 + rng.float() * 10, 6, 8 + rng.float() * 6);
  });
}

/** Key ghost — the marks a key rack keeps: pale tag shapes where
 * keys hung, hook-bright spots, a dust drift on the rail. */
export function keyGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // tag ghosts — pale paper silhouettes where keys hung
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 9 + (rng.float() - 0.5) * 2;
      ctx.fillStyle = `rgba(170,164,150,${0.3 + rng.float() * 0.16})`;
      ctx.fillRect(x, 14, 5, 12 + rng.float() * 4);
      ctx.beginPath();
      ctx.arc(x + 2.5, 14, 2.4, Math.PI, 0);
      ctx.fill();
    }
    // hook shine — bright pins where tags rubbed
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(60,54,44,${0.36 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(10.5 + i * 9, 12, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // dust drift — the rail no hand ran along
    ctx.fillStyle = `rgba(150,144,132,${0.3 + rng.float() * 0.16})`;
    ctx.fillRect(4, 6, 56, 3);
    // a key that stayed — dark shape still hanging
    ctx.fillStyle = `rgba(50,44,36,${0.4 + rng.float() * 0.14})`;
    ctx.fillRect(46, 16, 2.4, 14);
    ctx.beginPath();
    ctx.arc(47.2, 17, 2.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Vend kick — the marks a vending unit keeps: shoe scuffs at the
 * drop flap, coin-cup wear, finger glass trails by the buttons. */
export function vendKick(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    // shoe kicks — arcs low on the machine face
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(60,54,44,${0.36 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.6 + rng.float();
      const x = 10 + rng.float() * 44;
      ctx.beginPath();
      ctx.arc(x, 92, 5 + rng.float() * 4, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    // coin-cup wear — the scratch ring where change got scooped
    ctx.strokeStyle = `rgba(70,62,50,${0.4 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(32, 72, 7 + rng.float(), Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    // button rub — a greasy column beside the buttons
    const g = ctx.createLinearGradient(0, 20, 0, 55);
    g.addColorStop(0, `rgba(80,72,60,${0.3 + rng.float() * 0.16})`);
    g.addColorStop(1, 'rgba(80,72,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(44, 20, 10, 36);
    // glass trails — fingers that pointed through the pane
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(120,114,102,${0.2 + rng.float() * 0.14})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(10 + rng.float() * 20, 12 + rng.float() * 14);
      ctx.lineTo(10 + rng.float() * 20, 20 + rng.float() * 14);
      ctx.stroke();
    }
  });
}

/** Trap set — the marks a mousetrap keeps: bait ghosts, sprung
 * dust blowback, drag lines where it slid once. */
export function trapSet(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 48, (ctx) => {
    const cx = 24, cy = 26;
    // bait ghost — the dark square where the cheese sat
    ctx.fillStyle = `rgba(80,60,30,${0.4 + rng.float() * 0.18})`;
    ctx.fillRect(cx - 4, cy - 4, 8, 7);
    // sprung blowback — dust ring blown outward around the trap
    ctx.strokeStyle = `rgba(150,144,132,${0.3 + rng.float() * 0.16})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 18, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
    // snap arc — the wire's swing shadow
    ctx.strokeStyle = `rgba(50,44,36,${0.42 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 11, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    // drag lines — it slid once, spraying dust
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(140,134,122,${0.26 + rng.float() * 0.14})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy + 10 + i * 3);
      ctx.lineTo(cx + 16, cy + 12 + i * 2 + (rng.float() - 0.5) * 2);
      ctx.stroke();
    }
  });
}

/** Tape curl — the marks a dropped tape measure keeps: a curled
 * end ghost, measure ticks, and the sweep line it drew in dust. */
export function tapeCurl(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 32, (ctx) => {
    // the sweep — a measuring line drawn through the dust
    ctx.strokeStyle = `rgba(150,144,132,${0.4 + rng.float() * 0.18})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(6, 16 + (rng.float() - 0.5) * 3);
    ctx.lineTo(80, 16 + (rng.float() - 0.5) * 3);
    ctx.stroke();
    // measure ticks — the blade's increments bitten off
    for (let i = 0; i < 9; i++) {
      const x = 10 + i * 8;
      ctx.strokeStyle = `rgba(60,54,44,${0.36 + rng.float() * 0.16})`;
      ctx.lineWidth = i % 4 === 0 ? 1.8 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 13);
      ctx.lineTo(x, 13 + (i % 4 === 0 ? 6 : 3.4));
      ctx.stroke();
    }
    // curled end — the hook's dark curl
    ctx.strokeStyle = `rgba(50,44,36,${0.44 + rng.float() * 0.16})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(84, 16, 5, -Math.PI * 0.4, Math.PI * 0.6);
    ctx.stroke();
    // housing scuff where it was dropped
    ctx.fillStyle = `rgba(80,72,60,${0.3 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(10, 24, 7, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Manifold rust — the weep a pipe manifold keeps: drip trails
 * under each valve body, rust halos at the flanges, scale flakes. */
export function manifoldRust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // flange halos — oxide rings where the joints bolt together
    for (let i = 0; i < 4; i++) {
      const x = 16 + i * 20 + (rng.float() - 0.5) * 4;
      ctx.strokeStyle = `rgba(140,80,40,${0.4 + rng.float() * 0.18})`;
      ctx.lineWidth = 2.4 + rng.float();
      ctx.beginPath();
      ctx.arc(x, 22, 8 + rng.float() * 2, 0, Math.PI * 2);
      ctx.stroke();
      // the weep — a rust tear under each flange
      ctx.fillStyle = `rgba(130,74,36,${0.34 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.moveTo(x - 2, 28);
      ctx.quadraticCurveTo(x + (rng.float() - 0.5) * 3, 40, x + (rng.float() - 0.5) * 4, 54);
      ctx.lineTo(x + 3, 54);
      ctx.quadraticCurveTo(x + 1, 40, x + 3, 28);
      ctx.fill();
    }
    // scale flakes — shed paint and rust chips
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(120,70,36,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(6 + rng.float() * 84, 50 + rng.float() * 12, 1.4 + rng.float(), 0.7 + rng.float() * 0.5, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // mineral crust — white-green scale at the valve seats
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(160,180,150,${0.3 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(10 + rng.float() * 76, 30 + rng.float() * 8, 1 + rng.float() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Crane hook — the wear an overhead crane keeps: the trolley's
 * polished lane on the beam, grease drops, the block's cable rub. */
export function craneHook(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // trolley lane — a bright polished line where wheels ran
    ctx.strokeStyle = `rgba(60,54,44,${0.44 + rng.float() * 0.18})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, 14);
    ctx.lineTo(92, 14 + (rng.float() - 0.5) * 2);
    ctx.stroke();
    // wheel rest marks — darker spots where the trolley parked
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(40,36,30,${0.4 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(14 + i * 22 + rng.float() * 6, 16, 4 + rng.float() * 2, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // grease drops — oil weeps below the running gear
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `rgba(50,44,36,${0.36 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(8 + rng.float() * 80, 26 + rng.float() * 16, 1.6 + rng.float(), 2.4 + rng.float(), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // chain shadow — the block's hang marks at mid-span
    ctx.strokeStyle = `rgba(60,54,44,${0.34 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(46, 18);
    ctx.quadraticCurveTo(48 + (rng.float() - 0.5) * 4, 30, 46 + (rng.float() - 0.5) * 6, 42);
    ctx.stroke();
  });
}

/** Car veil — the marks under a dust-sheeted car: the sheet's
 * hem shadow, grime lines at the wheels, a fingertip smear on glass. */
export function carVeil(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // hem shadow — the sheet's dark line where it meets the floor
    ctx.strokeStyle = `rgba(50,44,36,${0.4 + rng.float() * 0.18})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(4, 50 + (rng.float() - 0.5) * 2);
    ctx.bezierCurveTo(30, 52 + rng.float() * 2, 60, 48 + rng.float() * 2, 92, 50 + (rng.float() - 0.5) * 2);
    ctx.stroke();
    // wheel grime — the arcs where tyres met concrete
    for (const wx of [24, 68]) {
      ctx.fillStyle = `rgba(60,54,44,${0.36 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(wx + (rng.float() - 0.5) * 4, 54, 9 + rng.float() * 2, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // drip line — condensation that ran off the cover once
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(90,84,74,${0.24 + rng.float() * 0.14})`;
      ctx.lineWidth = 1;
      const x = 14 + i * 16 + rng.float() * 6;
      ctx.beginPath();
      ctx.moveTo(x, 52);
      ctx.lineTo(x + (rng.float() - 0.5) * 2, 58 + rng.float() * 4);
      ctx.stroke();
    }
    // dust pelt — the sheet's shed film under it all
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.2 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 84, 8 + rng.float() * 40, 0.7 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Steam bleach — the bleach-fan a steam vent keeps: a pale cone
 * of leached paint, mineral tears, a scalded rim. */
export function steamBleach(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const cx = 32;
    // bleach cone — steam's pale bloom down the wall
    const g = ctx.createLinearGradient(0, 6, 0, 90);
    g.addColorStop(0, `rgba(200,196,186,${0.4 + rng.float() * 0.16})`);
    g.addColorStop(0.5, 'rgba(200,196,186,0.2)');
    g.addColorStop(1, 'rgba(200,196,186,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - 8, 6);
    ctx.lineTo(cx + 8, 6);
    ctx.lineTo(cx + 18 + rng.float() * 6, 90);
    ctx.lineTo(cx - 18 - rng.float() * 6, 90);
    ctx.fill();
    // mineral tears — white-green runs inside the cone
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(170,190,170,${0.3 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.2;
      const x = cx - 8 + rng.float() * 16;
      ctx.beginPath();
      ctx.moveTo(x, 12);
      ctx.lineTo(x + (rng.float() - 0.5) * 8, 60 + rng.float() * 24);
      ctx.stroke();
    }
    // scalded rim — the ring where the vent meets the wall
    ctx.strokeStyle = `rgba(140,134,122,${0.4 + rng.float() * 0.16})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, 8, 12, 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    // rust kiss — iron tears at the bottom edge
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(140,80,40,${0.3 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(cx - 14 + rng.float() * 28, 86 + rng.float() * 6, 1.8 + rng.float(), 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Duct seam — the streaks a duct run keeps: grime lines at each
 * seam, finger wipes on the hangers, rust at the damper. */
export function ductSeam(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // seam streaks — grime bleeding from the joints
    for (let i = 0; i < 3; i++) {
      const x = 18 + i * 28 + (rng.float() - 0.5) * 4;
      ctx.strokeStyle = `rgba(80,72,60,${0.36 + rng.float() * 0.18})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x, 6);
      ctx.lineTo(x + (rng.float() - 0.5) * 3, 40);
      ctx.stroke();
      // the weep under each seam
      ctx.fillStyle = `rgba(90,80,66,${0.3 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(x, 42, 3 + rng.float() * 2, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // hanger wipes — clean streaks where the strap rubs
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = `rgba(60,54,44,${0.3 + rng.float() * 0.14})`;
      ctx.fillRect(30 + i * 36, 4, 3, 10);
    }
    // damper rust — oxide dust at the adjuster
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(140,80,40,${0.26 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(70 + rng.float() * 20, 20 + rng.float() * 16, 0.8 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Buoy fade — the marks a lifebuoy keeps: sun-bleach fade on the
 * ring, a salt crust, the rope's dark where it was grabbed once. */
export function buoyFade(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 32;
    // the fade — a bleached arc on the sun side
    ctx.strokeStyle = `rgba(200,190,170,${0.36 + rng.float() * 0.16})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, Math.PI * 0.9, Math.PI * 1.9);
    ctx.stroke();
    // grab dark — the grip's shadow at the low arc
    ctx.strokeStyle = `rgba(60,54,44,${0.4 + rng.float() * 0.18})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, Math.PI * 0.15, Math.PI * 0.6);
    ctx.stroke();
    // salt crust — white specks on the ring
    for (let i = 0; i < 12; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.fillStyle = `rgba(220,216,206,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, 0.8 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // rope shadow — the hanging line's ghost below
    ctx.strokeStyle = `rgba(90,80,66,${0.3 + rng.float() * 0.14})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy + 20);
    ctx.quadraticCurveTo(cx + 8, cy + 30, cx + 5, cy + 30 + rng.float() * 6);
    ctx.stroke();
  });
}

/** Gaze crack — the marks a haunted portrait keeps: craquelure
 * webs, a shine across the eyes, dust in the frame's lip. */
export function gazeCrack(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const cx = 32;
    // craquelure — the varnish's cracked web
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = `rgba(120,110,90,${0.24 + rng.float() * 0.14})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      let x = rng.float() * 64, y = rng.float() * 96;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (rng.float() - 0.5) * 14; y += (rng.float() - 0.5) * 14;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // eye shine — a dry gleam that won't leave the gaze
    for (const ex of [-1, 1]) {
      ctx.fillStyle = `rgba(200,196,186,${0.3 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(cx + ex * 7, 30, 2.4, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // frame-lip dust — the ledge the cloth never reached
    const g = ctx.createLinearGradient(0, 0, 0, 10);
    g.addColorStop(0, `rgba(150,144,132,${0.4 + rng.float() * 0.16})`);
    g.addColorStop(1, 'rgba(150,144,132,0)');
    ctx.fillStyle = g;
    ctx.fillRect(2, 0, 60, 12);
    // nicotine film — the smoke's brown wash on the varnish
    ctx.fillStyle = `rgba(120,90,50,${0.14 + rng.float() * 0.1})`;
    ctx.fillRect(4, 12, 56, 80);
  });
}

/** Trophy dust — the marks a mounted head keeps: dust on the
 * brow ledges, cobweb spans between the tines, a dull nose. */
export function trophyDust(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32;
    // brow ledges — the film across the skull planes
    ctx.fillStyle = `rgba(150,144,132,${0.36 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(cx, 20, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // web spans — silk strung between the tines
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(180,176,164,${0.3 + rng.float() * 0.16})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - 18 + rng.float() * 4, 10 + rng.float() * 8);
      ctx.quadraticCurveTo(cx + (rng.float() - 0.5) * 10, 24 + rng.float() * 6, cx + 16 - rng.float() * 4, 10 + rng.float() * 8);
      ctx.stroke();
    }
    // dull nose — the only thing that still gets touched
    ctx.fillStyle = `rgba(50,44,36,${0.44 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(cx, 46, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // shed dust — specks on the shield plaque
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.26 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(cx - 16 + rng.float() * 32, 52 + rng.float() * 10, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Rigging dust — the marks a ship model keeps: dust sag on the
 * ratlines, grey sails, a cleaned deck stripe amidships. */
export function riggingDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // ratline sags — dust-weighted curves between the shrouds
    for (let i = 0; i < 4; i++) {
      const y = 12 + i * 8;
      ctx.strokeStyle = `rgba(150,144,132,${0.32 + rng.float() * 0.16})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.quadraticCurveTo(48, y + 5 + rng.float() * 3, 76, y);
      ctx.stroke();
    }
    // grey sails — the film on the canvas
    for (const sx of [30, 60]) {
      ctx.fillStyle = `rgba(160,154,140,${0.24 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.moveTo(sx - 8, 16);
      ctx.quadraticCurveTo(sx, 30, sx - 6, 44);
      ctx.lineTo(sx + 8, 44);
      ctx.quadraticCurveTo(sx + 2, 30, sx + 10, 16);
      ctx.fill();
    }
    // deck stripe — one wipe amidships
    ctx.fillStyle = `rgba(60,54,44,${0.3 + rng.float() * 0.14})`;
    ctx.fillRect(24, 50, 48, 2.4);
    // yard dust — the spars' top film
    for (const y of [10, 20]) {
      ctx.fillStyle = `rgba(150,144,132,${0.3 + rng.float() * 0.14})`;
      ctx.fillRect(16, y, 64, 1.6);
    }
  });
}

/** Stencil ghost — the marks a crate stencil leaves: pale letters
 * where paint peeled off, stencil bleed, corner wear. */
export function stencilGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // stencil bleed — ghost letterforms, their paint gone
    const letters = '12345678';
    ctx.font = 'bold 20px monospace';
    ctx.textBaseline = 'middle';
    let x = 10;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(170,164,150,${0.2 + rng.float() * 0.16})`;
      ctx.fillText(letters[Math.floor(rng.float() * 8)], x, 22);
      x += 14 + rng.float() * 6;
    }
    // stencil overspray — a faint rectangle around the print
    ctx.strokeStyle = `rgba(170,164,150,${0.2 + rng.float() * 0.12})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 8, 84, 30);
    // corner wear — the dragged scuffs at the crate's edges
    for (const [cx, cy] of [[8, 42], [86, 40], [10, 8]]) {
      ctx.fillStyle = `rgba(60,54,44,${0.3 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(cx + (rng.float() - 0.5) * 3, cy, 4 + rng.float() * 2, 1.8, rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // stencil smear — one pass that slipped
    ctx.strokeStyle = `rgba(150,144,132,${0.24 + rng.float() * 0.14})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(60, 18);
    ctx.lineTo(80 + rng.float() * 8, 24);
    ctx.stroke();
  });
}

/** Weld spatter — the marks welding leaves: bead tracks, spatter
 * pits, scorch halos, a ground-clamp bite. */
export function weldSpatter(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // bead track — the weld's rippled seam
    ctx.strokeStyle = `rgba(70,60,46,${0.5 + rng.float() * 0.16})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(8, 24);
    for (let x = 8; x < 88; x += 6) {
      ctx.lineTo(x + 3, 24 + (rng.float() - 0.5) * 3);
    }
    ctx.stroke();
    // spatter pits — the scatter of flung droplets
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgba(50,44,36,${0.36 + rng.float() * 0.24})`;
      const d = rng.float() * 16;
      ctx.beginPath();
      ctx.arc(10 + rng.float() * 76, 24 + (rng.float() - 0.5) * 2 * (6 + d), 0.6 + rng.float() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // scorch halo — the heat tint around the bead
    ctx.fillStyle = `rgba(90,60,36,${0.2 + rng.float() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(48, 24, 44, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // clamp bite — the ground's burn mark off to one side
    ctx.fillStyle = `rgba(40,36,30,${0.4 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(14 + rng.float() * 10, 40, 3.4, 2.2, 0.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Cosmo grease — the marks packing grease leaves: a waxy film,
 * thumb swirls, a wrapped-item ghost, weep at the lid seam. */
export function cosmoGrease(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // waxy film — cosmoline's amber glaze
    ctx.fillStyle = `rgba(160,120,60,${0.26 + rng.float() * 0.14})`;
    ctx.fillRect(4, 4, 56, 40);
    // thumb swirls — fingerprints set in the wax
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(120,88,40,${0.3 + rng.float() * 0.18})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(12 + rng.float() * 40, 10 + rng.float() * 28, 2 + rng.float() * 2, 0, Math.PI * (0.4 + rng.float() * 0.8));
      ctx.stroke();
    }
    // wrapped ghost — the shape the grease-paper kept
    ctx.strokeStyle = `rgba(140,104,50,${0.34 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(18, 14, 24, 16);
    // lid weep — wax that crept out at the seam
    ctx.fillStyle = `rgba(150,110,52,${0.36 + rng.float() * 0.18})`;
    ctx.fillRect(6, 20, 52, 3);
    // dust film — grease caught the dirt
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(140,134,122,${0.22 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 52, 6 + rng.float() * 36, 0.7 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Flask ring — the marks a chemistry set keeps: reagent rings on
 * the bench, stain drips down flask sides, a scorch under the stand. */
export function flaskRing(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // reagent rings — the residue circles flasks leave
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(${['120,80,140', '90,110,70', '140,90,40'][i]},${0.4 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.8 + rng.float();
      ctx.beginPath();
      ctx.arc(16 + i * 17 + (rng.float() - 0.5) * 4, 30 + (rng.float() - 0.5) * 16, 5 + rng.float() * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // stain drips — reagent runs down a side
    ctx.strokeStyle = `rgba(100,70,120,${0.36 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(46, 16);
    ctx.quadraticCurveTo(48, 30, 45 + (rng.float() - 0.5) * 4, 44);
    ctx.stroke();
    // scorch — the burner stand's heat mark
    ctx.fillStyle = `rgba(50,44,36,${0.4 + rng.float() * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(24, 52, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // bench speckle — drops that dried mid-run
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(110,80,60,${0.26 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 52, 8 + rng.float() * 50, 0.5 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Block cuts — the marks a chopping block keeps: cleaver grooves,
 * a darker hollow where the knife fell most, fat sheen. */
export function blockCuts(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // cleaver grooves — scored lines, densest at the middle
    for (let i = 0; i < 14; i++) {
      const cx = 32 + (rng.float() - 0.5) * 20;
      const cy = 32 + (rng.float() - 0.5) * 20;
      const a = rng.float() * Math.PI;
      ctx.strokeStyle = `rgba(70,54,34,${0.34 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.9 + rng.float() * 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * (4 + rng.float() * 8), cy - Math.sin(a) * (4 + rng.float() * 8));
      ctx.lineTo(cx + Math.cos(a) * (4 + rng.float() * 8), cy + Math.sin(a) * (4 + rng.float() * 8));
      ctx.stroke();
    }
    // the hollow — where the knife fell most, worn darker
    ctx.fillStyle = `rgba(56,42,26,${0.3 + rng.float() * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(32, 30, 9 + rng.float() * 3, 6 + rng.float() * 2, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // fat sheen — the grease film on the grain
    ctx.fillStyle = `rgba(140,120,80,${0.14 + rng.float() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(30, 34, 22, 14, 0.2, 0, Math.PI * 2);
    ctx.fill();
    // edge chips — cleaver bites at the rim
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(60,46,28,${0.36 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 52, 4 + rng.float() * 4, 1.4 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Torch soot — the marks a propane torch keeps: a soot feather
 * on the wall behind work, heat tint on the nozzle, a fuel weep. */
export function torchSoot(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32;
    // soot feather — the black bloom the flame brushed up
    const g = ctx.createRadialGradient(cx, 46, 2, cx, 30, 30);
    g.addColorStop(0, `rgba(30,26,22,${0.5 + rng.float() * 0.18})`);
    g.addColorStop(1, 'rgba(30,26,22,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, 34, 16, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    // heat tint — the metal's straw-blue where it ran hot
    ctx.fillStyle = `rgba(140,110,70,${0.24 + rng.float() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(cx, 50, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // fuel weep — an oily crescent at the valve
    ctx.strokeStyle = `rgba(90,84,60,${0.36 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx + 8, 52, 5, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    // ash flecks — the feather's shed
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(60,54,44,${0.3 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(cx - 14 + rng.float() * 28, 10 + rng.float() * 30, 0.6 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Card curl — the marks old postcards keep: curled corner
 * ghosts, sun fade, a tape hinge at one corner. */
export function cardCurl(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // corner ghosts — pale card silhouettes where they were tacked
    for (let i = 0; i < 4; i++) {
      const x = 6 + i * 15 + (rng.float() - 0.5) * 2;
      ctx.fillStyle = `rgba(170,164,150,${0.22 + rng.float() * 0.14})`;
      ctx.fillRect(x, 10 + (rng.float() - 0.5) * 4, 12, 16 + rng.float() * 4);
      // the curled corner — a lifted triangle shadow
      ctx.fillStyle = `rgba(60,54,44,${0.3 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.moveTo(x + 9, 10);
      ctx.lineTo(x + 12, 10);
      ctx.lineTo(x + 12, 13);
      ctx.fill();
    }
    // tape hinges — yellowed tape marks at corners
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(200,180,120,${0.3 + rng.float() * 0.16})`;
      ctx.fillRect(4 + rng.float() * 56, 4 + rng.float() * 30, 4, 6);
    }
    // sun fade — a bright wash where the light sat
    const g = ctx.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, `rgba(200,196,186,${0.14 + rng.float() * 0.1})`);
    g.addColorStop(1, 'rgba(200,196,186,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 48);
    // tack holes — the pins that held them
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(50,44,36,${0.4 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 52, 6 + rng.float() * 32, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Label fade — the marks an exhibit label keeps: bleached text
 * ghosts, sun stripes, a lifted corner, a finger smear. */
export function labelFade(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 32, (ctx) => {
    // bleached lines — text rows the sun ate
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.3 + rng.float() * 0.14})`;
      ctx.fillRect(8, 8 + i * 6, 40 + rng.float() * 8, 2.4);
    }
    // sun stripe — one edge bleached harder
    ctx.fillStyle = `rgba(200,196,186,${0.2 + rng.float() * 0.12})`;
    ctx.fillRect(0, 0, 64, 6);
    // lifted corner — the label peeling off its pins
    ctx.fillStyle = `rgba(60,54,44,${0.32 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.moveTo(56, 24);
    ctx.lineTo(64, 24);
    ctx.lineTo(64, 32);
    ctx.lineTo(54, 30);
    ctx.fill();
    // finger smear — visitors touched the lower right
    ctx.fillStyle = `rgba(80,72,60,${0.28 + rng.float() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(50, 22, 6, 3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // pin holes
    for (const x of [8, 56]) {
      ctx.fillStyle = `rgba(50,44,36,${0.4 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(x, 8, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Speaker dust — the marks old electronics keep: dust cones on
 * the drivers, felt-grille film, dial wear at the knob. */
export function speakerDust(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // cone dust — grey rings on the driver
    for (const cx of [20, 44]) {
      ctx.strokeStyle = `rgba(150,144,132,${0.36 + rng.float() * 0.16})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, 22, 9 + rng.float(), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(150,144,132,${0.24 + rng.float() * 0.12})`;
      ctx.beginPath();
      ctx.arc(cx, 22, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // grille film — dust in the felt mesh
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(150,144,132,${0.18 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 52, 6 + rng.float() * 36, 0.6 + rng.float() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // dial wear — polish arc at the tuner
    ctx.strokeStyle = `rgba(60,54,44,${0.4 + rng.float() * 0.16})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(32, 42, 5, Math.PI * 0.8, Math.PI * 1.9);
    ctx.stroke();
    // cassette lip dust — the door's grime line
    ctx.fillStyle = `rgba(140,134,122,${0.26 + rng.float() * 0.14})`;
    ctx.fillRect(38, 36, 18, 2);
  });
}

// ---------- sprint 554: the barrel kept the hoop, the bin kept the ash ----------

export function hoopRust(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // hoop shadows — rust bleeding under each band
    for (const y of [12, 24, 36]) {
      for (let x = 0; x < 64; x += 4) {
        const a = 0.18 + rng.float() * 0.22;
        ctx.fillStyle = `rgba(96,50,24,${a})`;
        ctx.fillRect(x, y - 1, 4, 3 + rng.float() * 2);
      }
      // drips falling off the band
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = `rgba(88,46,22,${0.3 + rng.float() * 0.2})`;
        const dx = rng.float() * 64;
        ctx.fillRect(dx, y + 2, 1, 2 + rng.float() * 6);
      }
    }
    // stave weep — dark joins between the planks
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `rgba(30,22,16,${0.14 + rng.float() * 0.12})`;
      ctx.fillRect(4 + rng.float() * 56, 4, 0.8, 40);
    }
  });
}

export function ashRing(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // ash scatter — grey crumbs spilled around the bin's rim
    for (let i = 0; i < 40; i++) {
      const a = rng.float() * Math.PI * 2, r = 16 + rng.float() * 14;
      ctx.fillStyle = `rgba(150,146,138,${0.2 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 0.6 + rng.float() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // kicked paper — a crumpled wad that missed
    ctx.fillStyle = `rgba(196,190,178,${0.4 + rng.float() * 0.2})`;
    ctx.beginPath();
    const wx = 12 + rng.float() * 12, wy = 38 + rng.float() * 12;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rr = 3 + rng.float() * 2;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](wx + Math.cos(a) * rr, wy + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    // char flecks — darker grit in the spill
    for (let i = 0; i < 18; i++) {
      const a = rng.float() * Math.PI * 2, r = 14 + rng.float() * 16;
      ctx.fillStyle = `rgba(50,46,40,${0.24 + rng.float() * 0.2})`;
      ctx.fillRect(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1.4, 1.4);
    }
  });
}

export function lockerGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 64, (ctx) => {
    // label ghosts — pale rectangles where name cards sat for decades
    for (let i = 0; i < 2; i++) {
      const ly = 8 + i * 24 + rng.float() * 4;
      ctx.fillStyle = `rgba(160,152,136,${0.24 + rng.float() * 0.16})`;
      ctx.fillRect(10 + rng.float() * 4, ly, 24 + rng.float() * 8, 6 + rng.float() * 2);
      // pin holes at the card's corners
      ctx.fillStyle = 'rgba(40,36,30,0.5)';
      ctx.fillRect(11 + rng.float() * 4, ly + 1, 1, 1);
      ctx.fillRect(32 + rng.float() * 4, ly + 1, 1, 1);
    }
    // vent shadow — grime above the louvres
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(52,48,42,${0.2 + rng.float() * 0.14})`;
      ctx.fillRect(12, 40 + i * 4, 24, 1.6);
    }
    // key scratch — someone fished for the lock in the dark
    ctx.strokeStyle = `rgba(140,132,118,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 0.8;
    const sx = 24 + rng.float() * 6;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(sx + rng.float() * 3 - 1.5, 30);
      ctx.lineTo(sx + rng.float() * 4 - 2, 30 - 4 - rng.float() * 6);
      ctx.stroke();
    }
  });
}

// ---------- sprint 555: the kettle whistled, the board kept the cuts ----------

export function kettleScale(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 48, (ctx) => {
    // limescale bloom — chalky crust climbing from the waterline
    for (let i = 0; i < 14; i++) {
      const a = rng.float() * Math.PI * 2, r = 6 + rng.float() * 14;
      ctx.fillStyle = `rgba(214,208,192,${0.26 + rng.float() * 0.24})`;
      ctx.beginPath();
      ctx.arc(24 + Math.cos(a) * r, 30 + Math.sin(a) * r * 0.5, 1.5 + rng.float() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // drip trails down the belly
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(198,192,176,${0.3 + rng.float() * 0.2})`;
      const dx = 8 + rng.float() * 32;
      ctx.fillRect(dx, 10 + rng.float() * 8, 1 + rng.float() * 0.6, 8 + rng.float() * 10);
    }
    // heat ring — where the flame licked the base
    ctx.strokeStyle = `rgba(60,50,40,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(24, 40, 14, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  });
}

export function boardScores(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // knife scoring — a hundred cuts crossing the middle
    for (let i = 0; i < 46; i++) {
      const x = 10 + rng.float() * 44, y = 8 + rng.float() * 32;
      const a = (rng.float() - 0.5) * 0.9;
      const len = 4 + rng.float() * 12;
      ctx.strokeStyle = `rgba(72,58,40,${0.2 + rng.float() * 0.3})`;
      ctx.lineWidth = 0.6 + rng.float() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    // worked-in stain — the hollow where years of meals were cut
    ctx.fillStyle = `rgba(88,68,44,${0.16 + rng.float() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(32, 24, 18 + rng.float() * 6, 10 + rng.float() * 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // edge scrub — paler rim where it was washed least hard
    ctx.strokeStyle = `rgba(200,186,160,${0.2 + rng.float() * 0.12})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 56, 40);
  });
}

export function dartHalo(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // missed holes — a spray of pits around the board's rim
    for (let i = 0; i < 40; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 20 + rng.float() * 10;
      ctx.fillStyle = `rgba(46,38,30,${0.3 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 0.5 + rng.float() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // chalk arcs — someone's throw line drawn too often
    ctx.strokeStyle = `rgba(186,178,160,${0.3 + rng.float() * 0.18})`;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(32, 32, 24 + rng.float() * 5, rng.float() * Math.PI, rng.float() * Math.PI + 0.9);
      ctx.stroke();
    }
    // pull ghosts — faint rings where the board was re-hung
    ctx.strokeStyle = `rgba(140,130,112,${0.22 + rng.float() * 0.14})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// ---------- sprint 556: the jug sweated, the shelf kept the folds ----------

export function jugSweat(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 64, (ctx) => {
    // sweat runnels — cold drops crawling down the glass
    for (let i = 0; i < 12; i++) {
      const x = 6 + rng.float() * 36;
      ctx.fillStyle = `rgba(190,196,200,${0.22 + rng.float() * 0.2})`;
      ctx.fillRect(x, 8 + rng.float() * 20, 1, 6 + rng.float() * 16);
      ctx.beginPath();
      ctx.arc(x + 0.5, 30 + rng.float() * 24, 1.1 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // sediment line — the level it stood at for years
    ctx.fillStyle = `rgba(120,104,76,${0.3 + rng.float() * 0.2})`;
    const sy = 34 + rng.float() * 12;
    ctx.fillRect(4, sy, 40, 1.6);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(108,92,66,${0.24 + rng.float() * 0.18})`;
      ctx.fillRect(6 + rng.float() * 36, sy + 2, 1.4, 2 + rng.float() * 3);
    }
    // finger smears where it was grabbed
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(170,168,158,${0.18 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(16 + rng.float() * 18, 12 + rng.float() * 8, 1.4, 3, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function foldPulls(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // stack shadows — crease lines across the folded linen
    for (let i = 0; i < 6; i++) {
      const y = 8 + i * 7 + rng.float() * 2;
      ctx.fillStyle = `rgba(96,92,84,${0.24 + rng.float() * 0.16})`;
      ctx.fillRect(6, y, 52, 1.8);
      ctx.fillStyle = `rgba(196,190,176,${0.2 + rng.float() * 0.14})`;
      ctx.fillRect(6, y + 1.8, 52, 1);
    }
    // pulled edge — a sheet's corner dragged out of the stack
    ctx.fillStyle = `rgba(210,204,190,${0.34 + rng.float() * 0.18})`;
    ctx.beginPath();
    const px = 44 + rng.float() * 8;
    ctx.moveTo(px, 20);
    ctx.lineTo(px + 10, 26 + rng.float() * 4);
    ctx.lineTo(px + 2, 30);
    ctx.closePath(); ctx.fill();
    // dust on the top fold — it has not been lifted in months
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgba(150,146,138,${0.16 + rng.float() * 0.12})`;
      ctx.fillRect(8 + rng.float() * 48, 6 + rng.float() * 5, 1.6, 1);
    }
  });
}

export function shelfDust(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // empty ghosts — pale rectangles where the pieces sat
    for (let i = 0; i < 3; i++) {
      const w = 10 + rng.float() * 10;
      ctx.strokeStyle = `rgba(186,180,164,${0.3 + rng.float() * 0.18})`;
      ctx.lineWidth = 1.4;
      const x = 8 + i * 18 + rng.float() * 4, y = 26 + rng.float() * 6;
      ctx.strokeRect(x, y - 8, w, 8);
    }
    // dust film — a grey skin on the glass shelf
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(158,152,140,${0.1 + rng.float() * 0.12})`;
      ctx.fillRect(rng.float() * 64, rng.float() * 48, 1.5, 1.5);
    }
    // wipe arc — one half-hearted clean pass
    ctx.strokeStyle = `rgba(210,204,190,${0.22 + rng.float() * 0.16})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(50, 40, 14, Math.PI * 1.1, Math.PI * 1.8);
    ctx.stroke();
    // dead fly — there is always one
    ctx.fillStyle = 'rgba(50,46,40,0.5)';
    ctx.fillRect(10 + rng.float() * 30, 38 + rng.float() * 6, 1.6, 1);
  });
}

// ---------- sprint 557: the till kept the scratch, the screen kept the ghost ----------

export function tillScratch(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // coin rings — circles polished into the counter over a till's life
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(150,142,124,${0.26 + rng.float() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(10 + rng.float() * 44, 8 + rng.float() * 14, 2.4 + rng.float() * 1.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    // drawer rub — the bright line where the tray slid a thousand times
    ctx.fillStyle = `rgba(170,162,146,${0.3 + rng.float() * 0.18})`;
    ctx.fillRect(6, 30 + rng.float() * 6, 52, 1.6);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(120,112,96,${0.18 + rng.float() * 0.14})`;
      ctx.fillRect(8 + rng.float() * 46, 32 + rng.float() * 5, 1.4, 2.4);
    }
    // button ghosts — worn crowns over the heavy keys
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(190,182,164,${0.22 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(14 + i * 12, 12, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function screenGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // burn ghost — a pale phantom frame left in the phosphor
    ctx.strokeStyle = `rgba(190,200,204,${0.2 + rng.float() * 0.14})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 10, 40, 26);
    // static snow — a dead channel's residue
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(200,204,206,${0.08 + rng.float() * 0.14})`;
      ctx.fillRect(12 + rng.float() * 40, 10 + rng.float() * 26, 1.4, 1);
    }
    // dust skin on the glass
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(158,152,140,${0.12 + rng.float() * 0.1})`;
      ctx.fillRect(rng.float() * 64, rng.float() * 48, 1.8, 1.4);
    }
    // wipe swatch — one clean arc where someone checked if it still worked
    ctx.strokeStyle = `rgba(216,210,196,${0.26 + rng.float() * 0.16})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(16, 40, 16, Math.PI * 1.2, Math.PI * 1.75);
    ctx.stroke();
  });
}

export function splatFilm(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 48, (ctx) => {
    // spatter — a bowl boiled over in there once
    for (let i = 0; i < 26; i++) {
      const a = rng.float() * Math.PI * 2, r = rng.float() * 16;
      ctx.fillStyle = `rgba(150,110,70,${0.24 + rng.float() * 0.26})`;
      ctx.beginPath();
      ctx.arc(24 + Math.cos(a) * r, 20 + Math.sin(a) * r * 0.8, 0.6 + rng.float() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // cooked-on ring — the plate's tide line
    ctx.strokeStyle = `rgba(140,100,62,${0.3 + rng.float() * 0.2})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(24, 24, 13, 0, Math.PI * 2);
    ctx.stroke();
    // keypad wear — the two buttons anyone ever pressed
    for (const [bx, by] of [[38, 10], [38, 18]]) {
      ctx.fillStyle = `rgba(196,190,176,${0.3 + rng.float() * 0.18})`;
      ctx.fillRect(bx + rng.float() * 2, by + rng.float() * 2, 5, 3.4);
    }
  });
}

// ---------- sprint 558: the saw kept its dust, the wrench kept its prints ----------

export function sawdustFan(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // dust fan — a drift thrown sideways by the stroke
    for (let i = 0; i < 50; i++) {
      const t = rng.float();
      const x = 8 + t * 48, y = 30 - Math.sin(t * Math.PI) * 14 + rng.float() * 8;
      ctx.fillStyle = `rgba(178,148,104,${0.2 + rng.float() * 0.24})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.5 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // cut kerf — the line the teeth left in the bench
    ctx.strokeStyle = `rgba(70,56,38,${0.4 + rng.float() * 0.18})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, 34);
    ctx.lineTo(54, 30 + rng.float() * 4);
    ctx.stroke();
    // piled heap — the drift under the last cut
    ctx.fillStyle = `rgba(186,156,110,${0.3 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(46, 38, 8, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function oilyGrip(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 48, (ctx) => {
    // palm sheen — dark polish where the hand closed
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(46,40,34,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(16 + rng.float() * 16, 14 + i * 8, 4 + rng.float() * 2, 2.2, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // finger ghosts — four drag marks along the haft
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(56,48,40,${0.22 + rng.float() * 0.18})`;
      ctx.fillRect(14 + i * 5, 8, 2.4, 8 + rng.float() * 4);
    }
    // wipe streak — a rag passed once
    ctx.strokeStyle = `rgba(160,152,138,${0.24 + rng.float() * 0.16})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(8, 40);
    ctx.quadraticCurveTo(24, 36 + rng.float() * 4, 42, 38);
    ctx.stroke();
    // rust freckles where the knuckles knocked it
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(112,60,28,${0.24 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(8 + rng.float() * 32, 6 + rng.float() * 10, 0.7 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function haftShine(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 64, (ctx) => {
    // hand polish — the long bright burnish of seasons of work
    ctx.fillStyle = `rgba(190,166,124,${0.26 + rng.float() * 0.18})`;
    ctx.fillRect(18, 14, 12, 34);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(200,178,134,${0.14 + rng.float() * 0.14})`;
      ctx.fillRect(20 + rng.float() * 8, 16 + rng.float() * 28, 2, 3);
    }
    // sweat dark — grime packed above and below the grip
    ctx.fillStyle = `rgba(60,48,34,${0.3 + rng.float() * 0.18})`;
    ctx.fillRect(18, 8, 12, 4);
    ctx.fillRect(18, 50, 12, 5);
    // chip marks where it was leaned against stone
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(96,76,50,${0.3 + rng.float() * 0.2})`;
      ctx.fillRect(16 + rng.float() * 14, 56 + rng.float() * 5, 1.6, 1.4);
    }
  });
}

// ---------- sprint 559: the case kept the journey, the truck kept its toes ----------

export function strapScuff(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // strap shadows — twin dark bands where the belts bit
    for (const x of [20, 44]) {
      ctx.fillStyle = `rgba(52,42,32,${0.28 + rng.float() * 0.18})`;
      ctx.fillRect(x - 2, 4, 4, 40);
      // buckle scratch arcs beside each band
      ctx.strokeStyle = `rgba(150,140,120,${0.3 + rng.float() * 0.18})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(x + 6, 12 + rng.float() * 20, 3, 0, Math.PI);
      ctx.stroke();
    }
    // corner knocks — pale rubs at the four heels
    for (const [cx, cy] of [[8, 8], [56, 8], [8, 40], [56, 40]]) {
      ctx.fillStyle = `rgba(180,168,146,${0.24 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + rng.float() * 3, cy + rng.float() * 3, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // sticker ghosts — pale rectangles where travel labels peeled away
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = `rgba(190,182,162,${0.2 + rng.float() * 0.14})`;
      ctx.fillRect(26 + rng.float() * 14, 14 + i * 14, 10, 6);
    }
  });
}

export function toeRubs(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // plate rubs — twin arcs the toe plate ground into floors
    for (const x of [18, 42]) {
      ctx.strokeStyle = `rgba(140,132,118,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, 30, 10 + rng.float() * 3, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
    // wheel trails — twin tracks run off the back edge
    ctx.strokeStyle = `rgba(64,56,46,${0.24 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.6;
    for (const x of [20, 44]) {
      ctx.beginPath();
      ctx.moveTo(x, 6);
      ctx.lineTo(x + rng.float() * 4 - 2, 30);
      ctx.stroke();
    }
    // shoe scuffs — the sole stamps where loads were righted
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(80,72,60,${0.22 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(12 + rng.float() * 40, 34 + rng.float() * 8, 3.4, 1.6, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function mailDust(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 48, (ctx) => {
    // paper dust — grey film sifted from a thousand envelopes
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = `rgba(172,166,152,${0.12 + rng.float() * 0.14})`;
      ctx.fillRect(6 + rng.float() * 52, 6 + rng.float() * 36, 1.8, 1.2);
    }
    // corner curls — labels worked loose at the edges
    for (let i = 0; i < 3; i++) {
      const x = 10 + rng.float() * 36, y = 10 + rng.float() * 22;
      ctx.fillStyle = `rgba(200,192,172,${0.3 + rng.float() * 0.18})`;
      ctx.fillRect(x, y, 8, 5);
      ctx.fillStyle = 'rgba(90,84,72,0.4)';
      ctx.fillRect(x + 6, y + 3, 2, 2);
    }
    // ink smudge — a franking stamp that never dried
    ctx.fillStyle = `rgba(52,56,72,${0.3 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(30 + rng.float() * 10, 30 + rng.float() * 8, 5, 2.6, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // string tail — twine off a torn parcel
    ctx.strokeStyle = `rgba(120,110,90,${0.34 + rng.float() * 0.2})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(46, 8);
    ctx.bezierCurveTo(50, 16, 44, 22, 52, 30);
    ctx.stroke();
  });
}

export function lockerKick(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // toe-scuff band — a decade of boots judging the doors shut
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(64,60,52,${0.18 + rng.float() * 0.22})`;
      ctx.save();
      ctx.translate(10 + rng.float() * 76, 40 + rng.float() * 18);
      ctx.rotate((rng.float() - 0.5) * 0.7);
      ctx.fillRect(-6, -1.6, 12, 3.2);
      ctx.restore();
    }
    // dent dimples — the doors that took a fist or a shoulder
    for (let i = 0; i < 6; i++) {
      const x = 12 + rng.float() * 72, y = 10 + rng.float() * 26;
      ctx.strokeStyle = `rgba(80,74,64,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 2.2 + rng.float() * 1.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(46,42,36,${0.3 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // dropped-key scratches — short nicks where brass searched the lock
    for (let i = 0; i < 5; i++) {
      const x = 16 + rng.float() * 64;
      ctx.strokeStyle = `rgba(150,140,120,${0.28 + rng.float() * 0.18})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, 22 + rng.float() * 8);
      ctx.lineTo(x + (rng.float() - 0.5) * 6, 28 + rng.float() * 8);
      ctx.stroke();
    }
  });
}

export function pumpSeep(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the drip trail — a bead line walking from the pump foot
    ctx.strokeStyle = `rgba(40,44,40,${0.4 + rng.float() * 0.16})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(14, 10);
    let x = 14, y = 10;
    for (let i = 0; i < 5; i++) {
      x += 12 + rng.float() * 8;
      y += 10 + rng.float() * 8;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    // wet beads — each pause still dark
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `rgba(30,34,32,${0.34 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(14 + i * 11 + rng.float() * 4, 12 + i * 9 + rng.float() * 5, 2.4, 1.6, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // mineral run — white ghosts the water left drying
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(196,192,172,${0.16 + rng.float() * 0.12})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20 + rng.float() * 20, 14);
      ctx.lineTo(26 + rng.float() * 24, 70 + rng.float() * 12);
      ctx.stroke();
    }
    // the pool at the end — where the trail stopped asking
    ctx.fillStyle = `rgba(24,30,28,${0.4 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(72, 78, 12, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function mailDrift(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // slipped letters — a fan of envelopes the cart dropped
    for (let i = 0; i < 9; i++) {
      const a = -0.5 + i * 0.22 + rng.float() * 0.12;
      const x = 48 + Math.cos(a) * (18 + rng.float() * 18);
      const y = 30 + Math.abs(Math.sin(a)) * (14 + rng.float() * 30);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + (rng.float() - 0.5) * 0.4);
      ctx.fillStyle = `rgba(210,202,180,${0.5 + rng.float() * 0.2})`;
      ctx.fillRect(-7, -4, 14, 8);
      ctx.strokeStyle = 'rgba(120,112,96,0.35)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(-7, -4, 14, 8);
      ctx.restore();
    }
    // a few gone face-down — darker, older
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(20 + rng.float() * 56, 60 + rng.float() * 24);
      ctx.rotate(rng.float() * Math.PI);
      ctx.fillStyle = `rgba(150,142,124,${0.4 + rng.float() * 0.16})`;
      ctx.fillRect(-6, -3.5, 12, 7);
      ctx.restore();
    }
    // paper dust sifting through it all
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(190,184,168,${0.1 + rng.float() * 0.12})`;
      ctx.fillRect(8 + rng.float() * 80, 20 + rng.float() * 70, 1.6, 1.1);
    }
  });
}

export function sootFan(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the burn blowback — a black fan blown sideways from the drum mouth
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const spread = 6 + t * 34;
      ctx.fillStyle = `rgba(28,26,24,${0.42 - t * 0.3 + rng.float() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(16 + t * 62 + rng.float() * 6, 48 + (rng.float() - 0.5) * spread, 3 + t * 5, 2 + t * 4, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // carbon feathers — the sharp leading edges of the plume
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = `rgba(20,18,16,${0.4 + rng.float() * 0.18})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(20, 46 + rng.float() * 6);
      ctx.lineTo(58 + rng.float() * 26, 30 + rng.float() * 36);
      ctx.stroke();
    }
    // ember pits in the dense core
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(140,60,30,${0.3 + rng.float() * 0.22})`;
      ctx.beginPath();
      ctx.arc(18 + rng.float() * 18, 44 + rng.float() * 8, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function fuseTally(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // chalk counts — the electrician's running tally of which fuse died how often
    for (let g = 0; g < 4; g++) {
      const gx = 10 + g * 13, gy = 12 + rng.float() * 30;
      const n = 1 + Math.floor(rng.float() * 5);
      ctx.strokeStyle = `rgba(206,200,182,${0.34 + rng.float() * 0.18})`;
      ctx.lineWidth = 1.1;
      for (let i = 0; i < Math.min(n, 4); i++) {
        ctx.beginPath();
        ctx.moveTo(gx + i * 2.6, gy);
        ctx.lineTo(gx + i * 2.6 - 1, gy + 9);
        ctx.stroke();
      }
      if (n === 5) {
        ctx.beginPath();
        ctx.moveTo(gx - 2, gy + 8);
        ctx.lineTo(gx + 11, gy + 1);
        ctx.stroke();
      }
    }
    // a circled note — the one that kept going
    ctx.strokeStyle = `rgba(196,190,170,${0.36 + rng.float() * 0.18})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(40, 20 + rng.float() * 24, 9, 5, 0.2, 0, Math.PI * 2);
    ctx.stroke();
    // faint box — the pencil label that washed
    ctx.strokeStyle = 'rgba(170,164,148,0.2)';
    ctx.strokeRect(8, 50, 34, 10);
  });
}

export function hatchGrease(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 96, (ctx) => {
    // the grease run — a vertical smear under the hatch lip
    const g = ctx.createLinearGradient(0, 6, 0, 80);
    g.addColorStop(0, `rgba(60,54,42,${0.5 + rng.float() * 0.14})`);
    g.addColorStop(1, 'rgba(60,54,42,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(14, 6);
    ctx.bezierCurveTo(12, 30, 16, 55, 15, 82);
    ctx.lineTo(30, 82);
    ctx.bezierCurveTo(31, 55, 28, 30, 32, 6);
    ctx.closePath();
    ctx.fill();
    // cable polish — the shinier line the rope wore inside the grease
    ctx.strokeStyle = `rgba(150,140,116,${0.34 + rng.float() * 0.18})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(23, 8);
    ctx.lineTo(24 + rng.float() * 3, 78);
    ctx.stroke();
    // thumb smears — hands that pushed the door home
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(80,72,58,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(16 + rng.float() * 18, 8 + rng.float() * 10, 2.6, 4, (rng.float() - 0.5) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function bunkBoots(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // paired prints — someone stood here a while, then wasn't there
    const pairs = 3 + Math.floor(rng.float() * 3);
    let x = 14 + rng.float() * 10, y = 20 + rng.float() * 8;
    const ang = 0.5 + rng.float() * 0.7;
    for (let i = 0; i < pairs; i++) {
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(x + side * 3.2, y);
        ctx.rotate(ang + side * 0.08);
        ctx.fillStyle = `rgba(52,48,42,${0.3 + rng.float() * 0.18})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 2.2, 5.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      x += Math.cos(ang - Math.PI / 2) * -11 + (rng.float() - 0.5) * 4;
      y += 12 + rng.float() * 4;
    }
    // the last pair just stops — no step out
    ctx.fillStyle = `rgba(52,48,42,${0.36 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 2.4, 5.6, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 5, y - 1, 2.4, 5.6, ang, 0, Math.PI * 2);
    ctx.fill();
    // heel pivots — where they turned
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(60,55,48,${0.26 + rng.float() * 0.16})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(50 + rng.float() * 20, 30 + rng.float() * 20, 3 + rng.float() * 2, 0, Math.PI);
      ctx.stroke();
    }
  });
}

export function hookShadow(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // peg ghosts — clean silhouettes where tools hung for years
    for (let i = 0; i < 6; i++) {
      const x = 10 + i * 13 + rng.float() * 4, y = 12 + rng.float() * 6;
      ctx.fillStyle = `rgba(44,42,38,${0.3 + rng.float() * 0.18})`;
      ctx.fillRect(x, y, 2.4, 16 + rng.float() * 10);
      ctx.fillRect(x - 2, y + 12 + rng.float() * 6, 6.5, 2.2);
    }
    // reach shine — the bright band hands polished taking things down
    const g = ctx.createLinearGradient(0, 40, 0, 58);
    g.addColorStop(0, 'rgba(160,152,134,0)');
    g.addColorStop(0.5, `rgba(168,160,142,${0.16 + rng.float() * 0.12})`);
    g.addColorStop(1, 'rgba(160,152,134,0)');
    ctx.fillStyle = g;
    ctx.fillRect(6, 40, 84, 18);
    // drips of old oil where the bench tools bled
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(38,34,30,${0.28 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(14 + rng.float() * 68, 52 + rng.float() * 8, 2.6, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function chainDrag(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // the drag shine — a bright path where the chain ran out
    ctx.strokeStyle = `rgba(150,146,130,${0.3 + rng.float() * 0.16})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(6, 34 + rng.float() * 6);
    ctx.bezierCurveTo(30, 26 + rng.float() * 8, 60, 40 + rng.float() * 6, 90, 30 + rng.float() * 8);
    ctx.stroke();
    // link kisses — the dimpling where links hopped
    for (let i = 0; i < 18; i++) {
      const t = i / 18;
      const x = 8 + t * 80;
      const y = 33 + Math.sin(t * 4) * 5 + rng.float() * 3;
      ctx.fillStyle = `rgba(70,64,54,${0.3 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.6, 0.9, rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // rust tail — the stain a wet chain shed
    ctx.strokeStyle = `rgba(110,70,40,${0.2 + rng.float() * 0.14})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(30, 38 + rng.float() * 4);
    ctx.lineTo(78 + rng.float() * 10, 42 + rng.float() * 6);
    ctx.stroke();
  });
}

export function ceilingRing(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the water ring — a mineral tide where a leak pooled overhead
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(130,110,80,${0.28 - i * 0.05 + rng.float() * 0.06})`;
      ctx.lineWidth = 1.4 - i * 0.25;
      ctx.beginPath();
      ctx.ellipse(48, 48, 30 + i * 5 + rng.float() * 3, 24 + i * 4 + rng.float() * 3, rng.float() * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // damp heart — still dark at the drip point
    ctx.fillStyle = `rgba(96,80,60,${0.24 + rng.float() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(48, 48, 16, 13, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // the drip point itself
    ctx.fillStyle = `rgba(60,50,40,${0.4 + rng.float() * 0.18})`;
    ctx.beginPath();
    ctx.arc(46 + rng.float() * 6, 46 + rng.float() * 6, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // spall edge — plaster grain lifting at the rim
    for (let i = 0; i < 10; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.fillStyle = `rgba(180,170,150,${0.18 + rng.float() * 0.12})`;
      ctx.fillRect(48 + Math.cos(a) * (32 + rng.float() * 12), 48 + Math.sin(a) * (26 + rng.float() * 10), 2.4, 1.4);
    }
  });
}

export function plasterVein(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // settlement crack — a main vein with tributaries
    ctx.strokeStyle = `rgba(70,64,58,${0.42 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    let x = 8, y = 40 + rng.float() * 16;
    ctx.moveTo(x, y);
    for (let i = 0; i < 8; i++) {
      x += 10 + rng.float() * 4;
      y += (rng.float() - 0.5) * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    // tributaries — the thinner forks that run off
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(70,64,58,${0.26 + rng.float() * 0.14})`;
      ctx.lineWidth = 0.6;
      const bx = 20 + rng.float() * 56, by = 34 + rng.float() * 26;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + (rng.float() - 0.5) * 26, by + (rng.float() - 0.5) * 26);
      ctx.stroke();
    }
    // lifted flakes along the main crack
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(190,182,164,${0.16 + rng.float() * 0.12})`;
      ctx.fillRect(12 + rng.float() * 72, 30 + rng.float() * 34, 3, 1.6);
    }
    // the spall — where a flake let go entirely
    ctx.fillStyle = `rgba(58,52,46,${0.3 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(30 + rng.float() * 30, 44 + rng.float() * 14, 4, 2.6, rng.float(), 0, Math.PI * 2);
    ctx.fill();
  });
}

export function pendantGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // the ring — a pale circle where a shade kept the soot off
    ctx.strokeStyle = `rgba(196,188,168,${0.34 + rng.float() * 0.16})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 16, 0, Math.PI * 2);
    ctx.stroke();
    // inside kept dark — the ceiling's true tone
    ctx.fillStyle = `rgba(50,46,40,${0.14 + rng.float() * 0.1})`;
    ctx.beginPath();
    ctx.arc(32, 32, 13, 0, Math.PI * 2);
    ctx.fill();
    // the hook scar — the plaster wound it left
    ctx.fillStyle = `rgba(56,50,42,${0.42 + rng.float() * 0.18})`;
    ctx.beginPath();
    ctx.arc(32, 32, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(70,62,52,${0.36 + rng.float() * 0.16})`;
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + rng.float() * 0.5;
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(a) * 2, 32 + Math.sin(a) * 2);
      ctx.lineTo(32 + Math.cos(a) * (5 + rng.float() * 3), 32 + Math.sin(a) * (5 + rng.float() * 3));
      ctx.stroke();
    }
    // dust that drifted in after it was gone
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(170,162,146,${0.1 + rng.float() * 0.1})`;
      ctx.fillRect(14 + rng.float() * 36, 14 + rng.float() * 36, 1.4, 1);
    }
  });
}

export function fixtureSoot(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // smoke halo — decades of a hot bulb breathing at the ceiling
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 26);
    g.addColorStop(0, `rgba(46,42,38,${0.5 + rng.float() * 0.14})`);
    g.addColorStop(0.6, `rgba(52,48,44,${0.24 + rng.float() * 0.1})`);
    g.addColorStop(1, 'rgba(52,48,44,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // convection fingers — the streaks the heat drew
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + rng.float() * 0.4;
      ctx.strokeStyle = `rgba(42,38,34,${0.22 + rng.float() * 0.14})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(a) * 8, 32 + Math.sin(a) * 8);
      ctx.lineTo(32 + Math.cos(a) * (18 + rng.float() * 8), 32 + Math.sin(a) * (18 + rng.float() * 8));
      ctx.stroke();
    }
    // fly specks the light gathered
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(30,28,26,${0.4 + rng.float() * 0.2})`;
      ctx.fillRect(26 + rng.float() * 14, 26 + rng.float() * 14, 1, 1);
    }
  });
}

export function tileSag(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // grid ghosts — the ceiling grid still readable in grime
    ctx.strokeStyle = `rgba(60,56,50,${0.22 + rng.float() * 0.1})`;
    ctx.lineWidth = 1.6;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 24, 4); ctx.lineTo(i * 24, 92); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, i * 24); ctx.lineTo(92, i * 24); ctx.stroke();
    }
    // the sagging tile — a belly shadow where the panel drank
    const g = ctx.createRadialGradient(60, 36, 4, 60, 36, 20);
    g.addColorStop(0, `rgba(88,76,58,${0.4 + rng.float() * 0.14})`);
    g.addColorStop(1, 'rgba(88,76,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(36, 12, 48, 48);
    // sag highlight — the panel's lower lip catching what light there is
    ctx.strokeStyle = `rgba(170,162,140,${0.22 + rng.float() * 0.12})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(42, 54 + rng.float() * 4);
    ctx.quadraticCurveTo(60, 62, 78, 54 + rng.float() * 4);
    ctx.stroke();
    // corner stains — where the leak crept the grid
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(120,100,72,${0.2 + rng.float() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(20 + rng.float() * 56, 14 + rng.float() * 68, 4, 2.4, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function corniceLine(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // the dust ledge — a grey band where the wall hands the ceiling its dirt
    const g = ctx.createLinearGradient(0, 6, 0, 30);
    g.addColorStop(0, 'rgba(168,160,142,0)');
    g.addColorStop(0.55, `rgba(168,160,142,${0.24 + rng.float() * 0.14})`);
    g.addColorStop(1, 'rgba(168,160,142,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 6, 96, 30);
    // streaks where a draft combed it
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(150,142,126,${0.14 + rng.float() * 0.1})`;
      ctx.lineWidth = 0.8;
      const x = 6 + rng.float() * 84;
      ctx.beginPath();
      ctx.moveTo(x, 12 + rng.float() * 4);
      ctx.lineTo(x + (rng.float() - 0.5) * 10, 24 + rng.float() * 6);
      ctx.stroke();
    }
    // cobweb anchors — the threads that always start at the seam
    for (let i = 0; i < 3; i++) {
      const x = 16 + rng.float() * 64;
      ctx.strokeStyle = `rgba(200,194,180,${0.2 + rng.float() * 0.12})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x + 6 + rng.float() * 6, 34 + rng.float() * 8);
      ctx.stroke();
    }
  });
}

export function atticStain(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the broad bloom — damp that kept spreading past any ring
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(110,94,70,${0.1 + rng.float() * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(48 + (rng.float() - 0.5) * 30, 48 + (rng.float() - 0.5) * 30, 12 + rng.float() * 14, 9 + rng.float() * 10, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // the darker core — where it started
    ctx.fillStyle = `rgba(86,72,54,${0.26 + rng.float() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(46 + rng.float() * 8, 46 + rng.float() * 8, 10, 8, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // tide marks at the bloom's ragged edge
    for (let i = 0; i < 8; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(126,106,78,${0.18 + rng.float() * 0.12})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(48, 48, 26 + rng.float() * 16, a, a + 0.5 + rng.float() * 0.6);
      ctx.stroke();
    }
    // mould freckles seeding the damp
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(60,70,50,${0.24 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(30 + rng.float() * 38, 30 + rng.float() * 38, 0.9 + rng.float() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function paintFlake(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // peeled sheets — paint that curled and let go in tongues
    for (let i = 0; i < 7; i++) {
      const x = 14 + rng.float() * 62, y = 14 + rng.float() * 62;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng.float() * Math.PI);
      // the tongue — a lifted curl with a lit edge
      ctx.fillStyle = `rgba(190,182,160,${0.3 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(7 + rng.float() * 5, -4, 13 + rng.float() * 6, 2 + rng.float() * 3);
      ctx.quadraticCurveTo(8, 5 + rng.float() * 3, 0, 4 + rng.float() * 2);
      ctx.closePath();
      ctx.fill();
      // the scar it left — darker under-surface
      ctx.fillStyle = `rgba(80,72,62,${0.26 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(4, 5, 5, 2, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // craze web — the fine lines between what's still holding
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = `rgba(96,88,76,${0.18 + rng.float() * 0.12})`;
      ctx.lineWidth = 0.5;
      const x = 10 + rng.float() * 76, y = 10 + rng.float() * 76;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng.float() - 0.5) * 18, y + (rng.float() - 0.5) * 18);
      ctx.stroke();
    }
  });
}

export function heaterGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // heat shimmer — the brown halo a radiator writes over years
    const g = ctx.createRadialGradient(48, 52, 6, 48, 52, 42);
    g.addColorStop(0, 'rgba(70,60,48,0)');
    g.addColorStop(0.5, `rgba(96,80,60,${0.3 + rng.float() * 0.14})`);
    g.addColorStop(1, 'rgba(96,80,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 64);
    // rising fingers — the convection streaks
    for (let i = 0; i < 9; i++) {
      const x = 12 + i * 9 + rng.float() * 4;
      ctx.strokeStyle = `rgba(84,70,54,${0.22 + rng.float() * 0.14})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, 58);
      ctx.bezierCurveTo(x - 3, 44, x + 3, 30, x + (rng.float() - 0.5) * 6, 12 + rng.float() * 8);
      ctx.stroke();
    }
    // soot lip — the darkest band right at the source line
    ctx.fillStyle = `rgba(56,48,40,${0.3 + rng.float() * 0.16})`;
    ctx.fillRect(10, 56, 76, 4);
    // dust caught in the updraft
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(160,150,132,${0.1 + rng.float() * 0.1})`;
      ctx.fillRect(12 + rng.float() * 72, 16 + rng.float() * 36, 1.6, 1.2);
    }
  });
}

// The light leaked — a warm fan of glow spilling under a door and
// thinning into the dark, like a room that refuses to stay empty.
export function doorGlow(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const g = ctx.createRadialGradient(48, 8, 2, 48, 20, 64);
    g.addColorStop(0, `rgba(255,214,150,${0.5 + rng.float() * 0.2})`);
    g.addColorStop(0.45, `rgba(216,168,96,${0.22 + rng.float() * 0.12})`);
    g.addColorStop(1, 'rgba(120,84,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // uneven bleed — the glow frays where the sill is uneven
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(255,220,160,${0.06 + rng.float() * 0.08})`;
      ctx.fillRect(20 + rng.float() * 56, 4 + rng.float() * 40, 2 + rng.float() * 5, 2);
    }
  });
}

// The sconce kept its halo — warm bloom thrown on the plaster under
// a working wall lamp, cooling to nothing at the edge.
export function sconcePool(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 10, 2, 32, 26, 42);
    g.addColorStop(0, `rgba(255,200,130,${0.32 + rng.float() * 0.14})`);
    g.addColorStop(0.5, `rgba(200,140,80,${0.12 + rng.float() * 0.08})`);
    g.addColorStop(1, 'rgba(140,90,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/** Rat hole — the gnawed gap a wall keeps at the boards: an arched
 * chew opening, fresh shavings, a rub smear along the run. */
export function ratHole(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const cx = 40 + rng.float() * 16;
    const cy = 46;
    // the run — a faint rub line along the baseboard path
    ctx.strokeStyle = `rgba(56,48,38,${0.2 + rng.float() * 0.12})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, cy + 4);
    ctx.quadraticCurveTo(48, cy + 8, 92, cy + 3);
    ctx.stroke();
    // the hole — dark arched opening gnawed into the plaster
    ctx.fillStyle = 'rgba(14,11,9,0.85)';
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + 8);
    ctx.quadraticCurveTo(cx - 9, cy - 7, cx, cy - 8 - rng.float() * 3);
    ctx.quadraticCurveTo(cx + 9, cy - 7, cx + 9, cy + 8);
    ctx.closePath();
    ctx.fill();
    // chew rim — ragged gnaw marks around the opening
    for (let i = 0; i < 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      const rx = cx + Math.cos(a) * (9 + rng.float() * 2);
      const ry = cy + 8 + Math.sin(a) * (15 + rng.float() * 3);
      ctx.fillStyle = `rgba(140,124,100,${0.4 + rng.float() * 0.25})`;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillRect(-1.5, -0.5, 3, 1);
      ctx.restore();
    }
    // fresh shavings — pale flecks where it chewed last
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(180,162,130,${0.35 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(cx - 8 + rng.float() * 16, cy + 8 + rng.float() * 6, 0.5 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // droppings — dark specks along the run
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `rgba(30,24,20,${0.5 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(cx - 24 + rng.float() * 48, cy + 6 + rng.float() * 8, 1.2, 0.8, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Nail cluster — the hooks a wall accumulates: bent nails at odd
 * heights, wire loops still on some, a fallen frame's pit. */
export function nailCluster(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const nails = 4 + Math.floor(rng.float() * 4);
    for (let i = 0; i < nails; i++) {
      const nx = 14 + rng.float() * 68;
      const ny = 18 + rng.float() * 60;
      // nail head — dark point + rust bleed down
      ctx.fillStyle = `rgba(40,32,26,${0.6 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(nx, ny, 1.4 + rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(110,70,40,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(nx, ny + 1);
      ctx.lineTo(nx + (rng.float() - 0.5) * 2, ny + 5 + rng.float() * 8);
      ctx.stroke();
      // rust bloom
      ctx.fillStyle = `rgba(110,70,40,${0.18 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(nx, ny + 1.5, 2.4 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
      // some keep a wire loop — crescent of old picture wire
      if (rng.bool(0.45)) {
        ctx.strokeStyle = `rgba(70,60,48,${0.5 + rng.float() * 0.25})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(nx + 2 + rng.float() * 3, ny + 5, 3.5 + rng.float() * 2.5, Math.PI * 0.9, Math.PI * 2.1);
        ctx.stroke();
      }
      // shadow lip above — where the hung thing kept dust off
      if (rng.bool(0.4)) {
        ctx.fillStyle = 'rgba(160,152,134,0.16)';
        ctx.fillRect(nx - 6, ny - 3, 12, 2);
      }
    }
    // the pit — one deep gouge where a nail tore out
    ctx.fillStyle = `rgba(50,40,32,${0.4 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(20 + rng.float() * 56, 30 + rng.float() * 40, 2.6, 1.8, rng.float(), 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Figure shadow — the pale-dark silhouette a wallpaper keeps where
 * something stood in the sun too long: a head-and-shoulders bloom,
 * shoulder spread, no edges worth trusting. */
export function figureShadow(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 128, (ctx) => {
    const cx = 48 + (rng.float() - 0.5) * 10;
    // shoulders — a broad dim spread low on the paper
    const sg = ctx.createRadialGradient(cx, 96, 10, cx, 96, 34);
    sg.addColorStop(0, `rgba(52,44,38,${0.3 + rng.float() * 0.15})`);
    sg.addColorStop(1, 'rgba(52,44,38,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 40, 96, 88);
    // head — a smaller darker bloom above the shoulders
    const hg = ctx.createRadialGradient(cx, 62, 4, cx, 62, 16);
    hg.addColorStop(0, `rgba(48,40,34,${0.36 + rng.float() * 0.16})`);
    hg.addColorStop(1, 'rgba(48,40,34,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(cx - 20, 40, 40, 44);
    // the gap — a subtly paler floor where light still reached
    const lg = ctx.createRadialGradient(cx, 112, 6, cx, 112, 20);
    lg.addColorStop(0, 'rgba(160,150,130,0.14)');
    lg.addColorStop(1, 'rgba(160,150,130,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 92, 96, 36);
    // paper burn — slightly darker sun-fade around the figure
    ctx.strokeStyle = `rgba(120,108,88,${0.1 + rng.float() * 0.08})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, 78, 26, 40, 0, 0, Math.PI * 2);
    ctx.stroke();
    // specks
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(50,42,36,${0.14 + rng.float() * 0.14})`;
      ctx.beginPath();
      ctx.arc(cx - 20 + rng.float() * 40, 50 + rng.float() * 50, 0.5 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Frass line — the woodworms keep their hours: a row of tiny exit
 * pinholes along the boards with pale powder cones beneath them. */
export function frassLine(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    const holes = 4 + Math.floor(rng.float() * 4);
    for (let i = 0; i < holes; i++) {
      const hx = 10 + (i + rng.float()) * (76 / holes);
      const hy = 14 + rng.float() * 8;
      // exit pinhole
      ctx.fillStyle = `rgba(24,18,14,${0.55 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(hx, hy, 0.9 + rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
      // frass cone — fine powder settled under the hole
      ctx.fillStyle = `rgba(180,160,120,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.moveTo(hx - 4 - rng.float() * 2, hy + 16 + rng.float() * 8);
      ctx.lineTo(hx + 4 + rng.float() * 2, hy + 16 + rng.float() * 8);
      ctx.lineTo(hx + 1, hy + 2);
      ctx.lineTo(hx - 1, hy + 2);
      ctx.closePath();
      ctx.fill();
      // drill dust — the freshest crumb at the hole's lip
      if (rng.bool(0.5)) {
        ctx.fillStyle = 'rgba(210,190,150,0.5)';
        ctx.beginPath();
        ctx.arc(hx + 1, hy + 2, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // weak sag — a shallow shadow where the board's core is gone
    ctx.fillStyle = `rgba(60,50,40,${0.12 + rng.float() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(48, 30, 34 + rng.float() * 8, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Thread snag — the carpet gave up a loop: one lifted thread arc,
 * fray strays at its ends, a drag scuff where the toe caught it. */
export function threadSnag(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const cx = 40 + rng.float() * 16;
    const cy = 34;
    // the lifted loop — a bright thread arc standing off the pile
    ctx.strokeStyle = `rgba(150,120,80,${0.55 + rng.float() * 0.2})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy + 8);
    ctx.quadraticCurveTo(cx, cy - 12 - rng.float() * 6, cx + 12, cy + 8);
    ctx.stroke();
    // strays at both ends
    for (const sx of [cx - 12, cx + 12]) {
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = `rgba(140,112,74,${0.4 + rng.float() * 0.25})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(sx, cy + 8);
        ctx.lineTo(sx + (rng.float() - 0.5) * 8, cy + 8 + rng.float() * 6);
        ctx.stroke();
      }
    }
    // toe scuff — the dark arc where the shoe dragged it
    ctx.strokeStyle = `rgba(50,40,30,${0.3 + rng.float() * 0.18})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy + 14);
    ctx.quadraticCurveTo(cx, cy + 18, cx + 18, cy + 13);
    ctx.stroke();
    // pile dent — crushed nap along the drag
    ctx.fillStyle = `rgba(70,58,44,${0.2 + rng.float() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 16, 20, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // dust in the dent
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(180,168,140,${0.2 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.arc(cx - 16 + rng.float() * 32, cy + 13 + rng.float() * 6, 0.5 + rng.float() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Seal break — the door kept its wax: snapped cord ends hanging off
 * the jamb, red wax flecks flaked onto the floor below. */
export function sealBreak(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const cx = 32 + (rng.float() - 0.5) * 8;
    // cord ends — two snapped strings dangling from the wax
    for (const dir of [-1, 1]) {
      ctx.strokeStyle = `rgba(90,76,58,${0.55 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + dir * 6, 30);
      ctx.quadraticCurveTo(cx + dir * (10 + rng.float() * 4), 44 + rng.float() * 8, cx + dir * (8 + rng.float() * 4), 58 + rng.float() * 10);
      ctx.stroke();
      // frayed tip
      ctx.strokeStyle = 'rgba(110,94,72,0.5)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + dir * 8, 56);
      ctx.lineTo(cx + dir * 10, 62 + rng.float() * 6);
      ctx.stroke();
    }
    // the wax head — cracked seal still holding on the jamb side
    ctx.fillStyle = `rgba(122,32,28,${0.6 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(cx, 30, 9, 7, rng.float() * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // crack through the seal
    ctx.strokeStyle = 'rgba(60,14,12,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 7, 27);
    ctx.lineTo(cx + 6, 33);
    ctx.stroke();
    // stamp ghost — faint relief of the seal's crest
    ctx.strokeStyle = 'rgba(150,60,52,0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, 30, 4, 0, Math.PI * 2);
    ctx.stroke();
    // flaked flecks below — wax chips that fell when it snapped
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(122,32,28,${0.4 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(cx - 8 + rng.float() * 16, 68 + rng.float() * 20, 0.8 + rng.float() * 0.8, 0.6 + rng.float() * 0.6, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Paint drip — the walls were repainted in a hurry: thin runs down
 * the baseboard, brush-stroke bands, an old colour bleeding at the edge. */
export function paintDrip(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // brush band — uneven coverage of a repaint pass
    const band = ctx.createLinearGradient(0, 0, 0, 48);
    band.addColorStop(0, `rgba(160,150,132,${0.14 + rng.float() * 0.08})`);
    band.addColorStop(1, `rgba(160,150,132,${0.05 + rng.float() * 0.05})`);
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, 96, 48);
    // stroke marks — faint horizontal brush lines
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(140,130,114,${0.1 + rng.float() * 0.1})`;
      ctx.lineWidth = 1 + rng.float();
      ctx.beginPath();
      ctx.moveTo(4, 6 + i * 7 + rng.float() * 2);
      ctx.bezierCurveTo(30, 5 + i * 7, 60, 7 + i * 7, 92, 6 + i * 7 + rng.float() * 2);
      ctx.stroke();
    }
    // drips — thin runs where the roller loaded too much
    const drips = 3 + Math.floor(rng.float() * 3);
    for (let i = 0; i < drips; i++) {
      const dx = 12 + rng.float() * 72;
      const len = 12 + rng.float() * 20;
      ctx.fillStyle = `rgba(150,140,120,${0.28 + rng.float() * 0.16})`;
      ctx.fillRect(dx - 0.6, 4, 1.2 + rng.float() * 0.6, len);
      // bead at the run's end
      ctx.beginPath();
      ctx.arc(dx, 4 + len, 1.1 + rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // edge bleed — a darker strip where the old colour still shows
    ctx.fillStyle = `rgba(96,80,62,${0.18 + rng.float() * 0.12})`;
    ctx.fillRect(0, 44, 96, 4);
  });
}

/** Paper rot — the news browned where it fell: a curled sheet,
 * dark rot veins at its edges, print ghosted through the damp. */
export function paperRot(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const cx = 48;
    const cy = 30;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rng.float() - 0.5) * 0.7);
    // the sheet — browned newsprint gone brittle
    ctx.fillStyle = `rgba(150,128,88,${0.55 + rng.float() * 0.15})`;
    ctx.fillRect(-24, -14, 48, 28);
    // rot veins — dark damp eating the edges inward
    for (let i = 0; i < 8; i++) {
      const side = Math.floor(rng.float() * 4);
      ctx.fillStyle = `rgba(70,54,34,${0.3 + rng.float() * 0.2})`;
      let rx = 0; let ry = 0;
      if (side === 0) { rx = -24 + rng.float() * 48; ry = -14; }
      else if (side === 1) { rx = -24 + rng.float() * 48; ry = 14; }
      else if (side === 2) { rx = -24; ry = -14 + rng.float() * 28; }
      else { rx = 24; ry = -14 + rng.float() * 28; }
      ctx.beginPath();
      ctx.ellipse(rx, ry, 2 + rng.float() * 3, 1.5 + rng.float() * 2, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // print ghost — column rules fading through
    ctx.strokeStyle = `rgba(80,66,46,${0.25 + rng.float() * 0.15})`;
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-20, -8 + i * 4);
      ctx.lineTo(20 - rng.float() * 8, -8 + i * 4);
      ctx.stroke();
    }
    // headline bar — one bolder line still readable
    ctx.fillStyle = `rgba(80,66,46,${0.4 + rng.float() * 0.2})`;
    ctx.fillRect(-20, -11, 22 + rng.float() * 10, 2.4);
    // curled corner — one corner lifted, shadowed beneath
    const ccx = 24 * (rng.bool(0.5) ? 1 : -1);
    const ccy = 14 * (rng.bool(0.5) ? 1 : -1);
    ctx.fillStyle = 'rgba(60,48,30,0.4)';
    ctx.beginPath();
    ctx.moveTo(ccx, ccy);
    ctx.lineTo(ccx - Math.sign(ccx) * 8, ccy);
    ctx.lineTo(ccx, ccy - Math.sign(ccy) * 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // damp halo — the damp it sat in
    const dg = ctx.createRadialGradient(cx, cy, 12, cx, cy, 34);
    dg.addColorStop(0, `rgba(70,58,40,${0.16 + rng.float() * 0.1})`);
    dg.addColorStop(1, 'rgba(70,58,40,0)');
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, 96, 64);
  });
}

/** Hinge weep — the oil ran out of the knuckle: a thin dark weep
 * under each barrel, rust kiss at the pin, dust caught in the run. */
export function hingeWeep(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 96, (ctx) => {
    const barrels = 2 + Math.floor(rng.float() * 2);
    for (let i = 0; i < barrels; i++) {
      const hy = 14 + i * (60 / Math.max(1, barrels - 1)) + rng.float() * 4;
      const hx = 24 + (rng.float() - 0.5) * 4;
      // pin kiss — rust bloom at the barrel
      ctx.fillStyle = `rgba(110,64,34,${0.35 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(hx, hy, 3 + rng.float() * 1.5, 0, Math.PI * 2);
      ctx.fill();
      // the weep — thin oil run straight down
      const len = 14 + rng.float() * 18;
      const wg = ctx.createLinearGradient(0, hy, 0, hy + len);
      wg.addColorStop(0, `rgba(50,38,26,${0.4 + rng.float() * 0.2})`);
      wg.addColorStop(1, 'rgba(50,38,26,0)');
      ctx.fillStyle = wg;
      ctx.fillRect(hx - 0.8, hy + 2, 1.6 + rng.float() * 0.6, len);
      // dust caught — grey bead mid-run
      if (rng.bool(0.6)) {
        ctx.fillStyle = 'rgba(120,110,96,0.35)';
        ctx.beginPath();
        ctx.arc(hx, hy + 4 + rng.float() * len * 0.5, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // knuckle shadow — the barrel's faint presence
    ctx.fillStyle = `rgba(44,36,28,${0.2 + rng.float() * 0.1})`;
    ctx.fillRect(20, 12, 8, 72);
  });
}

/** Tally wall — the prisoner counted: columned chalk ticks in
 * fives, a broken line where the count stopped, smudged restarts. */
export function tallyWall(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cols = 3 + Math.floor(rng.float() * 2);
    for (let c = 0; c < cols; c++) {
      const x0 = 14 + c * (64 / cols);
      const rows = 2 + Math.floor(rng.float() * 3);
      for (let r = 0; r < rows; r++) {
        const y = 16 + r * 22 + rng.float() * 3;
        // four verticals + one diagonal slash — the five-count
        const five = rng.bool(0.8);
        ctx.strokeStyle = `rgba(200,196,180,${0.5 + rng.float() * 0.25})`;
        ctx.lineWidth = 1.1;
        const n = five ? 4 : 1 + Math.floor(rng.float() * 3);
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.moveTo(x0 + i * 3 + rng.float(), y);
          ctx.lineTo(x0 + i * 3 + rng.float() - 0.5, y + 9 + rng.float() * 2);
          ctx.stroke();
        }
        if (five) {
          ctx.beginPath();
          ctx.moveTo(x0 - 2, y + 9);
          ctx.lineTo(x0 + 13, y - 1);
          ctx.stroke();
        }
      }
    }
    // the restart — a smudged attempt rubbed out below
    if (rng.bool(0.7)) {
      ctx.fillStyle = `rgba(190,186,172,${0.16 + rng.float() * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(30 + rng.float() * 36, 80, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // the drag — one desperate long stroke ending mid-pull
    if (rng.bool(0.5)) {
      ctx.strokeStyle = `rgba(205,200,185,${0.35 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(20 + rng.float() * 40, 88);
      ctx.quadraticCurveTo(50, 90, 70 + rng.float() * 20, 86 - rng.float() * 4);
      ctx.stroke();
    }
  });
}

/** Board flex — the floor gives where the joists are gone: a long
 * dark gap along a board edge, lifted lip, loose nail heads. */
export function boardFlex(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    const y = 22 + rng.float() * 6;
    // the gap — dark seam running the board's edge
    ctx.fillStyle = `rgba(20,14,10,${0.5 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(4, y);
    for (let x = 4; x < 92; x += 8) {
      ctx.lineTo(x, y + (rng.float() - 0.5) * 3);
    }
    ctx.lineTo(92, y + 2.4);
    for (let x = 92; x > 4; x -= 8) {
      ctx.lineTo(x, y + 2 + (rng.float() - 0.5) * 2.5);
    }
    ctx.closePath();
    ctx.fill();
    // lifted lip — pale edge where the board rises off the joist
    ctx.strokeStyle = `rgba(170,150,120,${0.3 + rng.float() * 0.2})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(6, y - 2);
    ctx.quadraticCurveTo(48, y - 4 - rng.float() * 2, 90, y - 1.5);
    ctx.stroke();
    // loose nail heads — popped heads sitting proud along the seam
    const nails = 2 + Math.floor(rng.float() * 3);
    for (let i = 0; i < nails; i++) {
      const nx = 15 + rng.float() * 66;
      const ny = y - 4 - rng.float() * 2;
      ctx.fillStyle = `rgba(60,50,42,${0.5 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(nx, ny, 1.2, 0, Math.PI * 2);
      ctx.fill();
      // rust bleed under the head
      ctx.fillStyle = `rgba(100,60,36,${0.25 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.arc(nx, ny + 1.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // dust gathered in the gap
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(150,140,118,${0.2 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.arc(10 + rng.float() * 76, y + 1 + rng.float() * 2, 0.5 + rng.float() * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Frost fern — the window grew its garden: branching crystal
 * ferns climbing from a corner, thawed tear where breath stayed. */
export function frostFern(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const x0 = 12 + rng.float() * 16;
    const y0 = 84 - rng.float() * 8;
    // fern fronds — branching crystal strokes climbing from the corner
    const fronds = 4 + Math.floor(rng.float() * 3);
    for (let i = 0; i < fronds; i++) {
      const a = -Math.PI / 2 + (rng.float() - 0.5) * 0.9;
      const len = 22 + rng.float() * 30;
      const bx = x0 + rng.float() * 14;
      const by = y0 - rng.float() * 6;
      ctx.strokeStyle = `rgba(215,228,232,${0.35 + rng.float() * 0.25})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      let cx = bx, cy = by;
      const segs = 5 + Math.floor(rng.float() * 4);
      for (let sgi = 0; sgi < segs; sgi++) {
        const step = (len / segs) * (0.7 + rng.float() * 0.6);
        const aa = a + (rng.float() - 0.5) * 0.5;
        const nx = cx + Math.cos(aa) * step;
        const ny = cy + Math.sin(aa) * step;
        ctx.lineTo(nx, ny);
        // barbs — little V branches off each segment
        if (rng.bool(0.7)) {
          const ba = aa + (rng.bool(0.5) ? 1 : -1) * (0.7 + rng.float() * 0.4);
          const bl = 3 + rng.float() * 6;
          ctx.moveTo(nx, ny);
          ctx.lineTo(nx + Math.cos(ba) * bl, ny + Math.sin(ba) * bl);
          ctx.moveTo(nx, ny);
        }
        cx = nx; cy = ny;
      }
      ctx.stroke();
    }
    // feather dust — a faint scatter of ice specks around the fronds
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(215,228,232,${0.2 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(x0 + rng.float() * 50, y0 - rng.float() * 55, 0.4 + rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // the thawed tear — a bare channel where breath kept it clear
    ctx.strokeStyle = `rgba(80,70,64,${0.25 + rng.float() * 0.15})`;
    ctx.lineWidth = 3 + rng.float() * 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 20 + rng.float() * 30, y0 - 4);
    ctx.quadraticCurveTo(x0 + 30, y0 - 20, x0 + 36 + rng.float() * 20, y0 - 34 - rng.float() * 8);
    ctx.stroke();
  });
}

/** Latch score — the catch missed for years: arc scratches fanning
 * around the strike plate, a sheen where the tongue rides, one gouge. */
export function latchScore(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 48, (ctx) => {
    const cx = 24; const cy = 24;
    // the arc fan — swung scratches where the tongue missed the catch
    for (let i = 0; i < 7; i++) {
      const a0 = -0.4 - i * 0.22 + rng.float() * 0.06;
      const r = 14 + rng.float() * 5;
      ctx.strokeStyle = `rgba(160,148,126,${0.3 + rng.float() * 0.25})`;
      ctx.lineWidth = 0.8 + rng.float() * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy + 6, r, a0, a0 + 0.3 + rng.float() * 0.2);
      ctx.stroke();
    }
    // the gouge — one deep miss that dug the wood
    const ga = -0.5 - rng.float() * 0.8;
    ctx.strokeStyle = `rgba(50,38,28,${0.5 + rng.float() * 0.2})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy + 6, 12 + rng.float() * 4, ga, ga + 0.28);
    ctx.stroke();
    // the sheen — bright wear where the tongue rides true
    ctx.fillStyle = `rgba(190,180,160,${0.3 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // strike ghost — the plate's faint outline
    ctx.strokeStyle = `rgba(80,68,54,${0.3 + rng.float() * 0.15})`;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(cx - 6, cy - 8, 12, 18);
  });
}

/** Salt line — the seam sweats minerals: a pale crust along the very
 * bottom of the door, heavier at the sweep ends. */
export function saltLine(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 32, (ctx) => {
    // the crust band — uneven pale mineral line at the foot
    for (let x = 4; x < 92; x += 3) {
      const h = 3 + Math.sin(x * 0.22 + rng.float() * 2) * 1.6 + rng.float() * 2.2;
      ctx.fillStyle = `rgba(215,208,190,${0.3 + rng.float() * 0.22})`;
      ctx.fillRect(x, 32 - h - 4, 3, h);
    }
    // heavier ends — crust piles where the sweep stops
    for (const ex of [10 + rng.float() * 6, 80 - rng.float() * 6]) {
      ctx.fillStyle = `rgba(225,218,200,${0.4 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(ex, 27, 5 + rng.float() * 3, 4 + rng.float() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // the dark seam — the gap itself beneath the crust
    ctx.fillStyle = `rgba(28,22,18,${0.45 + rng.float() * 0.2})`;
    ctx.fillRect(4, 29, 88, 3);
    // crystals — sparkle specks along the line
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(235,230,215,${0.4 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.arc(6 + rng.float() * 84, 24 + rng.float() * 4, 0.4 + rng.float() * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Fly spot — the flies kept the shade: a cluster of dark specks
 * over a dim amber halo where the bulb breathes through. */
export function flySpot(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // the halo — dim amber where the bulb's warmth held them
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 26);
    g.addColorStop(0, `rgba(180,140,80,${0.2 + rng.float() * 0.12})`);
    g.addColorStop(1, 'rgba(180,140,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // the specks — clustered tight near center, sparse at rim
    const specks = 16 + Math.floor(rng.float() * 10);
    for (let i = 0; i < specks; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = Math.pow(rng.float(), 1.6) * 22;
      ctx.fillStyle = `rgba(30,24,18,${0.45 + rng.float() * 0.35})`;
      ctx.beginPath();
      ctx.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 0.5 + rng.float() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // smear — one dragged speck where a swipe caught it
    if (rng.bool(0.6)) {
      ctx.strokeStyle = `rgba(40,32,24,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(24 + rng.float() * 16, 30);
      ctx.lineTo(30 + rng.float() * 16, 32 + rng.float() * 6);
      ctx.stroke();
    }
  });
}

/** Chair scrape — the chair left its tracks: two thin parallel drag
 * lines where the legs pushed back, dust walls at their ends. */
export function chairScrape(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const gap = 12 + rng.float() * 8;
    const x0 = 48 - gap;
    const x1 = 48 + gap;
    for (const lx of [x0, x1]) {
      // the drag — a thin bright track where the leg slid
      ctx.strokeStyle = `rgba(180,160,130,${0.4 + rng.float() * 0.25})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(lx + (rng.float() - 0.5) * 4, 10);
      ctx.quadraticCurveTo(lx, 32, lx + (rng.float() - 0.5) * 3, 46 + rng.float() * 8);
      ctx.stroke();
      // dust wall — piled grit at the drag's end
      ctx.fillStyle = `rgba(160,148,124,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(lx, 48 + rng.float() * 6, 3.5, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // foot divot — the leg's resting pit
      ctx.fillStyle = `rgba(40,30,24,${0.35 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(lx, 12, 1.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // the smear — faint sideways brush where it turned
    ctx.strokeStyle = `rgba(170,150,124,${0.2 + rng.float() * 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 - 6, 30);
    ctx.quadraticCurveTo(48, 34, x1 + 6, 28);
    ctx.stroke();
  });
}

/** Book dust — the shelf kept its outline: pale shadow of a book's
 * lean on the shelf face, dust lip at its fore edge, thumb smudge. */
export function bookDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // the lean — a pale book-shaped ghost tipped a few degrees
    ctx.save();
    ctx.translate(44 + rng.float() * 8, 30);
    ctx.rotate(0.12 + rng.float() * 0.15);
    ctx.fillStyle = `rgba(200,192,170,${0.28 + rng.float() * 0.18})`;
    ctx.fillRect(-9, -14, 18, 28);
    // spine ridge — darker where the dust settled against it
    ctx.fillStyle = `rgba(90,78,60,${0.25 + rng.float() * 0.15})`;
    ctx.fillRect(-9, -14, 2, 28);
    ctx.restore();
    // the lip — dust built at the fore edge
    ctx.fillStyle = `rgba(150,138,114,${0.35 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(44, 47, 16, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // thumb smudge — where a hand slid it back, cleaner
    ctx.fillStyle = `rgba(210,204,186,${0.25 + rng.float() * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(58, 34, 4, 2.6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // stray dust
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(160,150,128,${0.2 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.arc(20 + rng.float() * 56, 40 + rng.float() * 12, 0.5 + rng.float() * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Vapor ghost — the kettle steamed the wall: a fading bloom of
 * condensation above where the pot sits, drip trails down. */
export function vaporGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the bloom — soft condensation mark, heavy low, gone high
    const g = ctx.createRadialGradient(48, 78, 8, 48, 70, 44);
    g.addColorStop(0, `rgba(190,196,196,${0.24 + rng.float() * 0.14})`);
    g.addColorStop(1, 'rgba(190,196,196,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // drip trails — thin runs falling off the bloom's floor
    const drips = 3 + Math.floor(rng.float() * 3);
    for (let i = 0; i < drips; i++) {
      const dx = 26 + rng.float() * 44;
      const len = 10 + rng.float() * 18;
      ctx.strokeStyle = `rgba(150,160,158,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(dx, 74);
      ctx.lineTo(dx + (rng.float() - 0.5) * 2, 74 + len);
      ctx.stroke();
    }
    // the ring — mineral halo where the steam sat longest
    ctx.strokeStyle = `rgba(170,178,176,${0.25 + rng.float() * 0.15})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(48, 74, 18 + rng.float() * 6, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    // specks
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(160,168,166,${0.2 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.arc(24 + rng.float() * 48, 60 + rng.float() * 24, 0.5 + rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Putty crack — the glazing let go: a crack net across the putty bead,
 * lifted flakes, and the glass-edge grime line the seal once hid. */
export function puttyCrack(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // the bead — a pale putty band along the frame edge
    ctx.fillStyle = `rgba(190,182,166,${0.25 + rng.float() * 0.15})`;
    ctx.fillRect(6, 18, 84, 10);
    // crack net — branching dark lines across the bead
    for (let i = 0; i < 6; i++) {
      let x = 10 + rng.float() * 70;
      let y = 22;
      ctx.strokeStyle = `rgba(60,52,42,${0.5 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += (rng.float() - 0.3) * 8;
        y += (rng.float() - 0.5) * 5;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // lifted flakes — pale slivers that popped off the bead
    for (let i = 0; i < 5; i++) {
      const fx = 12 + rng.float() * 72;
      ctx.fillStyle = `rgba(210,202,184,${0.4 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.moveTo(fx, 20);
      ctx.lineTo(fx + 3 + rng.float() * 3, 21 + rng.float() * 3);
      ctx.lineTo(fx + 1, 25);
      ctx.fill();
    }
    // glass-edge grime — the dark line the seal used to hide
    ctx.fillStyle = `rgba(45,38,30,${0.3 + rng.float() * 0.2})`;
    ctx.fillRect(8, 12, 80, 2);
    // shadow under the bead
    ctx.fillStyle = `rgba(70,60,48,${0.2 + rng.float() * 0.12})`;
    ctx.fillRect(6, 28, 84, 2);
  });
}

/** Mat ghost — the doormat walked away years ago but its outline
 * stayed: a soil rectangle, corner fray, and the grit line. */
export function matGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // the soil rectangle — darker inside where the mat trapped dirt
    ctx.fillStyle = `rgba(55,45,34,${0.3 + rng.float() * 0.18})`;
    ctx.fillRect(12, 10, 72, 44);
    // frayed rim — broken outline where edges crushed
    ctx.strokeStyle = `rgba(80,66,50,${0.45 + rng.float() * 0.2})`;
    ctx.lineWidth = 1.2;
    for (let x = 12; x < 84; x += 4) {
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.lineTo(x + 2, 10 + rng.float() * 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, 54);
      ctx.lineTo(x + 2, 54 - rng.float() * 3);
      ctx.stroke();
    }
    // corner fray — fibers dragging off the corners
    for (const [cx, cy, dx, dy] of [[12, 10, -1, -1], [84, 10, 1, -1], [12, 54, -1, 1], [84, 54, 1, 1]] as const) {
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(95,80,60,${0.35 + rng.float() * 0.2})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx * (3 + rng.float() * 4), cy + dy * (2 + rng.float() * 3));
        ctx.stroke();
      }
    }
    // the grit line — heavier soil along the door-side edge
    ctx.fillStyle = `rgba(40,32,24,${0.4 + rng.float() * 0.2})`;
    ctx.fillRect(12, 50, 72, 4);
    // clean center — where feet wiped hardest
    ctx.fillStyle = `rgba(120,108,90,${0.15 + rng.float() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(48, 30, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Joint weep — the joint sweats green: verdigris bloom haloing a
 * pipe coupling, with the drip tail running down. */
export function jointWeep(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 64, (ctx) => {
    // the coupling ghost — where the collar sat
    ctx.fillStyle = `rgba(70,64,52,${0.3 + rng.float() * 0.15})`;
    ctx.fillRect(14, 26, 20, 12);
    // verdigris bloom — green-blue crust around the collar
    const g = ctx.createRadialGradient(24, 32, 2, 24, 32, 16);
    g.addColorStop(0, `rgba(90,140,110,${0.5 + rng.float() * 0.2})`);
    g.addColorStop(0.6, `rgba(70,120,95,${0.3 + rng.float() * 0.15})`);
    g.addColorStop(1, 'rgba(70,120,95,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 64);
    // crust specks — crystalline verdigris grains
    for (let i = 0; i < 12; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 3 + rng.float() * 9;
      ctx.fillStyle = `rgba(${95 + rng.float() * 40},${140 + rng.float() * 30},${105 + rng.float() * 30},${0.4 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.arc(24 + Math.cos(a) * r, 32 + Math.sin(a) * r * 0.8, 0.5 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // the drip tail — green-white run below the joint
    ctx.strokeStyle = `rgba(110,150,120,${0.35 + rng.float() * 0.2})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(24 + (rng.float() - 0.5) * 6, 38);
    ctx.lineTo(23 + (rng.float() - 0.5) * 4, 56 + rng.float() * 6);
    ctx.stroke();
    // mineral edge — pale limescale ring on the run
    ctx.strokeStyle = `rgba(190,195,180,${0.25 + rng.float() * 0.15})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(26, 40);
    ctx.lineTo(25.5, 54);
    ctx.stroke();
  });
}

/** Nose print — someone small watched through the glass: a breath
 * halo, the nose smudge, cheek fade, and one wipe streak. */
export function nosePrint(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // the breath halo — fog patch where the face hovered
    const g = ctx.createRadialGradient(32, 34, 4, 32, 34, 20);
    g.addColorStop(0, `rgba(200,208,210,${0.22 + rng.float() * 0.12})`);
    g.addColorStop(1, 'rgba(200,208,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // the nose — a vertical smudge with two nostril dots
    ctx.fillStyle = `rgba(190,196,196,${0.4 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(32, 30, 3.4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const nx of [30.4, 33.6]) {
      ctx.fillStyle = `rgba(60,52,44,${0.4 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(nx, 34.5, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // cheek fade — soft blur where the cheek pressed
    const c = ctx.createRadialGradient(24, 36, 1, 24, 36, 8);
    c.addColorStop(0, `rgba(195,202,200,${0.25 + rng.float() * 0.12})`);
    c.addColorStop(1, 'rgba(195,202,200,0)');
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 64, 64);
    // wipe streak — one diagonal drag where a hand cleared it
    ctx.strokeStyle = `rgba(215,220,218,${0.3 + rng.float() * 0.15})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(40 + rng.float() * 6, 46);
    ctx.quadraticCurveTo(46, 40, 52 + rng.float() * 4, 34 + rng.float() * 4);
    ctx.stroke();
  });
}

/** Ink soak — the bottle went over and the ink drank through the
 * boards: a dark soak pool, splatter ring, and the pen-drag tail. */
export function inkSoak(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // the soak pool — dense heart, feathered rim
    const cx = 38 + rng.float() * 20, cy = 22;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 15);
    g.addColorStop(0, `rgba(20,22,38,${0.75 + rng.float() * 0.15})`);
    g.addColorStop(0.7, `rgba(24,26,44,${0.4 + rng.float() * 0.2})`);
    g.addColorStop(1, 'rgba(24,26,44,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 48);
    // splatter ring — droplets flung off the spill edge
    for (let i = 0; i < 12; i++) {
      const a = rng.float() * Math.PI * 2;
      const r = 12 + rng.float() * 18;
      ctx.fillStyle = `rgba(22,24,40,${0.45 + rng.float() * 0.3})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, 0.4 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // the pen-drag tail — dragged smear where the spill was wiped
    ctx.strokeStyle = `rgba(26,28,46,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy + 4);
    ctx.quadraticCurveTo(cx + 18, cy + 8, cx + 26 + rng.float() * 8, cy + 6 + rng.float() * 4);
    ctx.stroke();
    // board-line wick — ink ran along the seams
    for (let i = 0; i < 3; i++) {
      const by = 8 + i * 12 + rng.float() * 4;
      ctx.strokeStyle = `rgba(20,22,36,${0.3 + rng.float() * 0.15})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - 10 + rng.float() * 6, by);
      ctx.lineTo(cx + 10 + rng.float() * 10, by + (rng.float() - 0.5) * 2);
      ctx.stroke();
    }
  });
}

/** Shoe scuff — the skirting took the kicks: heel drags, toe arcs,
 * and rubber streaks along the wall's foot. */
export function shoeScuff(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // heel drags — long horizontal streaks low on the board
    for (let i = 0; i < 4; i++) {
      const y = 34 + rng.float() * 8;
      const x0 = 8 + rng.float() * 40;
      ctx.strokeStyle = `rgba(50,42,34,${0.4 + rng.float() * 0.25})`;
      ctx.lineWidth = 1.4 + rng.float() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + 14 + rng.float() * 18, y - rng.float() * 2);
      ctx.stroke();
    }
    // toe arcs — swung scuffs where toes caught
    for (let i = 0; i < 3; i++) {
      const cx = 20 + rng.float() * 56;
      ctx.strokeStyle = `rgba(60,50,40,${0.35 + rng.float() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, 44, 5 + rng.float() * 4, Math.PI * 1.1, Math.PI * 1.6 + rng.float() * 0.3);
      ctx.stroke();
    }
    // rubber streaks — pale skid sheen above the drags
    for (let i = 0; i < 3; i++) {
      const x = 14 + rng.float() * 60;
      ctx.fillStyle = `rgba(140,128,110,${0.25 + rng.float() * 0.15})`;
      ctx.save();
      ctx.translate(x, 28 + rng.float() * 6);
      ctx.rotate((rng.float() - 0.5) * 0.4);
      ctx.fillRect(0, 0, 6 + rng.float() * 6, 1.6);
      ctx.restore();
    }
    // dust lip — kicked grit resting on the board top
    ctx.fillStyle = `rgba(150,138,114,${0.2 + rng.float() * 0.12})`;
    ctx.fillRect(6, 8, 84, 2);
  });
}

/** Mirror tape — they taped the mirror and it stayed taped: adhesive
 * strips crossing a corner, peel ghosts, and dust-framed edges. */
export function mirrorTape(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // dust frame — grime line around the tape boundary
    ctx.strokeStyle = `rgba(80,70,58,${0.3 + rng.float() * 0.15})`;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(10, 10, 76, 76);
    // the strips — two crossing bands of aged adhesive
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.translate(48, 48);
      ctx.rotate(i === 0 ? 0.6 + rng.float() * 0.2 : -0.7 - rng.float() * 0.2);
      ctx.fillStyle = `rgba(190,178,150,${0.45 + rng.float() * 0.15})`;
      ctx.fillRect(-40, -5, 80, 10);
      // backing wrinkles
      for (let wx = -34; wx < 36; wx += 8) {
        ctx.strokeStyle = `rgba(160,148,124,${0.3 + rng.float() * 0.15})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(wx, -5);
        ctx.lineTo(wx + 2, 5);
        ctx.stroke();
      }
      ctx.restore();
    }
    // peel ghost — one corner where a strip lifted and dried
    ctx.fillStyle = `rgba(150,140,116,${0.35 + rng.float() * 0.15})`;
    ctx.beginPath();
    ctx.moveTo(70, 18);
    ctx.lineTo(82, 16);
    ctx.lineTo(78, 26);
    ctx.closePath();
    ctx.fill();
    // the exposed glass — cleaner triangle the tape hid
    ctx.fillStyle = `rgba(200,205,210,${0.15 + rng.float() * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(30, 60);
    ctx.lineTo(50, 70);
    ctx.lineTo(36, 78);
    ctx.closePath();
    ctx.fill();
    // specks
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(120,108,90,${0.25 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.arc(14 + rng.float() * 68, 14 + rng.float() * 68, 0.5 + rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Glove print — the hand pressed dust into the paint: five finger
 * pads, the palm, and the drag-off smear on door leaves. */
export function glovePrint(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // finger pads — five ovals fanned above the palm
    const pads: [number, number, number][] = [[20, 20, -0.3], [27, 15, -0.15], [34, 13, 0], [41, 16, 0.15], [47, 23, 0.4]];
    for (const [px, py, tilt] of pads) {
      ctx.fillStyle = `rgba(60,50,40,${0.45 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(px, py, 2.4, 4.4, tilt, 0, Math.PI * 2);
      ctx.fill();
    }
    // the palm — broad press, lighter heel
    const g = ctx.createRadialGradient(33, 42, 2, 33, 42, 13);
    g.addColorStop(0, `rgba(55,46,38,${0.5 + rng.float() * 0.2})`);
    g.addColorStop(1, 'rgba(55,46,38,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(33, 42, 11, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // drag-off smear — pulled down as the hand left
    ctx.strokeStyle = `rgba(58,48,40,${0.35 + rng.float() * 0.15})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 50);
    ctx.quadraticCurveTo(33, 56, 31 + (rng.float() - 0.5) * 4, 61);
    ctx.stroke();
    // dust rim — fresh dust haloing the print
    ctx.strokeStyle = `rgba(150,140,120,${0.25 + rng.float() * 0.12})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(33, 38, 18, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Cord bite — the pull cord chewed the plaster: a vertical groove
 * worn where it swings, with the disc halo at its crown. */
export function cordBite(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 96, (ctx) => {
    // the groove — a dark vertical wear channel the cord cut
    const gx = 22 + rng.float() * 4;
    ctx.fillStyle = `rgba(50,42,34,${0.4 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(gx, 40, 2.4, 30, 0.03, 0, Math.PI * 2);
    ctx.fill();
    // swing arcs — scuffs where the cord swept either side
    for (const side of [-1, 1]) {
      ctx.strokeStyle = `rgba(90,78,64,${0.3 + rng.float() * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, 20);
      ctx.quadraticCurveTo(gx + side * 10, 40, gx + side * (6 + rng.float() * 5), 58);
      ctx.stroke();
    }
    // the disc halo — plaster ring where the bell-pull cap rubbed
    ctx.strokeStyle = `rgba(120,108,90,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(gx, 14, 8 + rng.float() * 3, 0, Math.PI * 2);
    ctx.stroke();
    // cap dent — deeper center where the cap seat wore
    ctx.fillStyle = `rgba(60,50,40,${0.35 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.arc(gx, 14, 3, 0, Math.PI * 2);
    ctx.fill();
    // plaster dust — a pale drift settling below the groove
    ctx.fillStyle = `rgba(160,150,128,${0.25 + rng.float() * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(gx, 76, 7, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Kettle halo — the kettle rang the wall: a circular steam halo
 * above the stove, condensation beads and limescale drip. */
export function kettleHalo(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // steam halo — a broad moisture bloom where the spout vented
    const g = ctx.createRadialGradient(48, 40, 6, 48, 40, 38);
    g.addColorStop(0, `rgba(160,165,160,${0.3 + rng.float() * 0.15})`);
    g.addColorStop(0.6, `rgba(150,155,150,${0.18 + rng.float() * 0.1})`);
    g.addColorStop(1, 'rgba(150,155,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(48, 40, 38, 0, Math.PI * 2);
    ctx.fill();
    // ring edge — the tide line where the bloom dried
    ctx.strokeStyle = `rgba(140,135,115,${0.35 + rng.float() * 0.15})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(48, 40, 36 + rng.float() * 3, 0, Math.PI * 2);
    ctx.stroke();
    // limescale drips — mineral trails running off the ring
    for (let i = 0; i < 4; i++) {
      const dx = 30 + rng.float() * 36;
      const len = 14 + rng.float() * 26;
      ctx.strokeStyle = `rgba(190,195,185,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.8 + rng.float() * 0.7;
      ctx.beginPath();
      ctx.moveTo(dx, 62);
      ctx.quadraticCurveTo(dx + (rng.float() - 0.5) * 3, 62 + len * 0.6, dx + (rng.float() - 0.5) * 5, 62 + len);
      ctx.stroke();
    }
    // bead specks — droplets caught mid-run
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(195,200,190,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(20 + rng.float() * 56, 50 + rng.float() * 38, 0.6 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // soot kiss — a faint smoke edge along the top
    ctx.fillStyle = `rgba(60,55,48,${0.15 + rng.float() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(48, 8, 30, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Shelf sag — the shelf bowed under the weight it kept: a
 * deflection shadow, dust banks piled to the low side, lost items. */
export function shelfSag(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // the bow — a curved shadow under the shelf line, deepest mid-span
    ctx.strokeStyle = `rgba(50,42,34,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(8, 16);
    ctx.quadraticCurveTo(48, 24 + rng.float() * 6, 88, 16);
    ctx.stroke();
    // shelf line itself — the board's edge
    ctx.strokeStyle = `rgba(90,80,66,${0.4 + rng.float() * 0.15})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(8, 15);
    ctx.quadraticCurveTo(48, 22 + rng.float() * 5, 88, 15);
    ctx.stroke();
    // dust banks — piled drifts at the supported ends
    for (const bx of [14, 78]) {
      ctx.fillStyle = `rgba(160,150,130,${0.35 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.ellipse(bx + rng.float() * 4, 10, 8 + rng.float() * 4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // bracket ghosts — pale rectangles where brackets caught nothing
    for (const gx of [16, 74]) {
      ctx.fillStyle = `rgba(140,130,112,${0.25 + rng.float() * 0.12})`;
      ctx.fillRect(gx, 18, 4, 12 + rng.float() * 4);
    }
    // the lost item — one thing fell behind: a dark sliver at wall level
    ctx.fillStyle = `rgba(45,38,30,${0.45 + rng.float() * 0.2})`;
    ctx.fillRect(46 + rng.float() * 14, 22, 3, 14);
  });
}

/** Chimney smut — the flue exhaled against the ceiling: a soot
 * bloom with feathered edges and drifting smoke ghosts. */
export function chimneySmut(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // the main bloom — dense core, feathered out
    const g = ctx.createRadialGradient(48, 30, 4, 48, 30, 34);
    g.addColorStop(0, `rgba(40,34,28,${0.55 + rng.float() * 0.2})`);
    g.addColorStop(0.5, `rgba(45,38,32,${0.3 + rng.float() * 0.15})`);
    g.addColorStop(1, 'rgba(45,38,32,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(48, 30, 34, 0, Math.PI * 2);
    ctx.fill();
    // smoke ghosts — fainter drifts the draft carried wider
    for (let i = 0; i < 3; i++) {
      const gx = 20 + rng.float() * 56, gy = 55 + rng.float() * 28;
      const gg = ctx.createRadialGradient(gx, gy, 1, gx, gy, 10 + rng.float() * 8);
      gg.addColorStop(0, `rgba(50,44,38,${0.2 + rng.float() * 0.12})`);
      gg.addColorStop(1, 'rgba(50,44,38,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(gx, gy, 10 + rng.float() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    // feather streaks — soot tongues reaching down the wall
    for (let i = 0; i < 5; i++) {
      const sx = 32 + rng.float() * 32;
      ctx.strokeStyle = `rgba(48,42,36,${0.25 + rng.float() * 0.15})`;
      ctx.lineWidth = 1 + rng.float();
      ctx.beginPath();
      ctx.moveTo(sx, 40);
      ctx.quadraticCurveTo(sx + (rng.float() - 0.5) * 6, 55, sx + (rng.float() - 0.5) * 9, 66 + rng.float() * 12);
      ctx.stroke();
    }
    // tar drops — hardened beads at the bloom's bottom lip
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(30,26,22,${0.5 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(36 + rng.float() * 24, 48 + rng.float() * 8, 0.8 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Handle shadow — the pull cast the same shadow a thousand
 * mornings: a smudged crescent under a drawer/cupboard handle. */
export function handleShadow(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 48, (ctx) => {
    // the crescent — a dark half-moon the hand's shadow ground in
    ctx.fillStyle = `rgba(50,42,34,${0.45 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(24, 20, 10, 7, 0, Math.PI * 0.1, Math.PI * 0.9);
    ctx.fill();
    // pulled lip — deeper smudge at the grip's underside
    ctx.fillStyle = `rgba(45,38,30,${0.5 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(24, 22, 6, 3, 0, 0, Math.PI);
    ctx.fill();
    // finger comets — short smears trailing below
    for (let i = 0; i < 4; i++) {
      const fx = 15 + i * 6 + rng.float() * 3;
      ctx.strokeStyle = `rgba(60,52,42,${0.35 + rng.float() * 0.15})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(fx, 26);
      ctx.quadraticCurveTo(fx + 1, 32, fx + (rng.float() - 0.5) * 4, 38 + rng.float() * 4);
      ctx.stroke();
    }
    // polish rim — the high edge the cloth never reached
    ctx.strokeStyle = `rgba(180,172,150,${0.3 + rng.float() * 0.15})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(24, 19, 12, 8.5, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  });
}

/** Mirror blind — they hung a sheet over the mirror and the sheet
 * left its hem: two hook ghosts and a cloth shadow line. */
export function drapeDrop(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // cloth shadow — a broad rectangle ghost where the drape hung
    ctx.fillStyle = `rgba(120,110,95,${0.28 + rng.float() * 0.12})`;
    ctx.fillRect(14, 8, 68, 44);
    // hem shadow — darker line at the drape's bottom edge
    ctx.fillStyle = `rgba(90,80,66,${0.4 + rng.float() * 0.15})`;
    ctx.fillRect(14, 50, 68, 4);
    // fold streaks — vertical shade lines the folds threw
    for (let i = 0; i < 5; i++) {
      const fx = 20 + rng.float() * 56;
      ctx.fillStyle = `rgba(100,90,76,${0.2 + rng.float() * 0.12})`;
      ctx.fillRect(fx, 10, 2 + rng.float() * 2, 40);
    }
    // hook ghosts — clean circles where the hooks covered the wall
    for (const hx of [20, 76]) {
      ctx.fillStyle = `rgba(170,160,140,${0.35 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.arc(hx, 12, 3.5 + rng.float() * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(80,70,58,${0.4 + rng.float() * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, 12, 4.5 + rng.float() * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // hem rub — the wall's skin polished by the swinging bottom
    ctx.fillStyle = `rgba(150,140,120,${0.25 + rng.float() * 0.15})`;
    ctx.fillRect(16, 56, 64, 3);
  });
}

/** Socket scorch — the outlet spat once and kept the mark: a char
 * tear above the socket with a smoke tail and drip beads. */
export function socketScorch(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 64, (ctx) => {
    // smoke tail — the plume that climbed the wall
    const g = ctx.createRadialGradient(24, 26, 2, 24, 26, 22);
    g.addColorStop(0, `rgba(42,36,30,${0.5 + rng.float() * 0.2})`);
    g.addColorStop(1, 'rgba(42,36,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(24, 24, 13, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    // the char — a dense tear at the socket's lip
    ctx.fillStyle = `rgba(28,24,20,${0.65 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(24, 46, 7, 9, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // twin prong chars — the slots' signature
    for (const px of [21, 27]) {
      ctx.fillStyle = `rgba(20,17,14,${0.6 + rng.float() * 0.15})`;
      ctx.fillRect(px - 1, 42, 2, 7);
    }
    // drip beads — molten flecks that ran and froze
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(35,30,25,${0.5 + rng.float() * 0.15})`;
      ctx.beginPath();
      ctx.arc(20 + rng.float() * 9, 52 + rng.float() * 8, 1 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // wire shadow — the cord's line vanishing below
    ctx.strokeStyle = `rgba(70,60,50,${0.3 + rng.float() * 0.12})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(24, 55);
    ctx.quadraticCurveTo(26 + rng.float() * 4, 60, 25, 64);
    ctx.stroke();
  });
}

/** Pendulum tick — the clock's swing etched an arc on the wall:
 * a faint pendulum trace with bob halo and tick dents. */
export function pendTick(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    // swing arc — the bob's trace scored into the plaster
    ctx.strokeStyle = `rgba(70,60,50,${0.4 + rng.float() * 0.18})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(32, 20, 55, Math.PI * 0.32, Math.PI * 0.68);
    ctx.stroke();
    // bob halo — round polish ring at the swing's bottom
    ctx.strokeStyle = `rgba(140,128,110,${0.45 + rng.float() * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(32, 74, 7 + rng.float() * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(150,140,120,${0.3 + rng.float() * 0.15})`;
    ctx.beginPath();
    ctx.arc(32, 74, 5.5, 0, Math.PI * 2);
    ctx.fill();
    // tick dents — where the bob's edge kissed the wall each pass
    for (const tx of [16, 48]) {
      ctx.fillStyle = `rgba(60,50,42,${0.45 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(tx + (rng.float() - 0.5) * 3, 62 + rng.float() * 6, 1.6, 2.6, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // rod shadow — the pendulum rod's line up the wall
    ctx.strokeStyle = `rgba(100,90,76,${0.3 + rng.float() * 0.12})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(32, 18);
    ctx.lineTo(32, 70);
    ctx.stroke();
    // dust spars — where the case stopped dust reaching
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(160,150,130,${0.22 + rng.float() * 0.12})`;
      ctx.fillRect(24 + rng.float() * 16, 10 + i * 20, 8, 1.4);
    }
  });
}

/** Bread crumbs — the board dropped its crumbs for years: a soft
 * drift of crumbs and grease where the breadboard sat. */
export function crumbDrift(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // the board ghost — a pale rectangle where the board's weight kept it clean
    ctx.fillStyle = `rgba(180,170,148,${0.3 + rng.float() * 0.15})`;
    ctx.fillRect(24, 10, 48, 34);
    // grease halo — the counter's skin darkened around the board
    ctx.strokeStyle = `rgba(80,68,54,${0.35 + rng.float() * 0.18})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 8, 52, 38);
    // knife scores — cuts that missed the board's edge
    for (let i = 0; i < 6; i++) {
      const kx = 16 + rng.float() * 16;
      ctx.strokeStyle = `rgba(100,88,70,${0.3 + rng.float() * 0.15})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(kx, 12 + rng.float() * 30);
      ctx.lineTo(kx + 6 + rng.float() * 8, 14 + rng.float() * 30);
      ctx.stroke();
    }
    // the crumbs — a scatter of crumbs spilling off the edge
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(160,132,96,${0.4 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(20 + rng.float() * 66, 44 + rng.float() * 16, 0.7 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // crumb trail — a thin fan leading to the counter's edge
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(150,124,90,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(76 + i * 3, 50 + rng.float() * 10, 0.6 + rng.float() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Radiator cough — the rad's valve spat once and kept the stain:
 * a rust spur, spray flecks and the bleed-screw scar. */
export function valveSpur(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 48, (ctx) => {
    // the spur — a jet of rust arcing from the bleed screw
    ctx.strokeStyle = `rgba(130,70,40,${0.55 + rng.float() * 0.2})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(10, 38);
    ctx.quadraticCurveTo(16, 24, 28 + rng.float() * 8, 12 + rng.float() * 6);
    ctx.stroke();
    // spray flecks — where the jet broke up
    for (let i = 0; i < 8; i++) {
      const t = rng.float();
      const fx = 10 + t * 22 + (rng.float() - 0.5) * 7;
      const fy = 38 - t * 26 + (rng.float() - 0.5) * 7;
      ctx.fillStyle = `rgba(120,64,36,${0.4 + rng.float() * 0.25})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 0.6 + rng.float() * 1, 0, Math.PI * 2);
      ctx.fill();
    }
    // the bleed screw — a dark socket where the key turns
    ctx.fillStyle = `rgba(50,34,26,${0.6 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.arc(9, 40, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // rust seep — brown creep below the screw
    ctx.fillStyle = `rgba(110,60,34,${0.4 + rng.float() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(10, 44, 4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // white bloom — dried mineral ghost around the spur
    ctx.strokeStyle = `rgba(200,195,180,${0.25 + rng.float() * 0.15})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, 37);
    ctx.quadraticCurveTo(18, 24, 30, 13);
    ctx.stroke();
  });
}

/** Lintel dust — the lip of undisturbed dust a door's lintel keeps:
 * a grey shelf-line, drip tails at the ends, a settled crust. */
export function lintelDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // the shelf — a pale dust line across the lintel top
    const ly = 16 + rng.float() * 4;
    ctx.fillStyle = `rgba(166,158,140,${0.3 + rng.float() * 0.15})`;
    ctx.fillRect(4, ly, 88, 2.6);
    ctx.fillStyle = 'rgba(180,172,154,0.18)';
    ctx.fillRect(4, ly - 1.4, 88, 1.4);
    // crust bumps — dust piled thicker at intervals
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(172,164,146,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(8 + rng.float() * 80, ly + 1, 0.8 + rng.float() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // drip tails — dust that tumbled at the jamb ends
    for (const ex of [8, 86]) {
      ctx.strokeStyle = `rgba(150,142,126,${0.24 + rng.float() * 0.14})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex + rng.float() * 3, ly + 2);
      ctx.lineTo(ex + rng.float() * 2, ly + 9 + rng.float() * 8);
      ctx.stroke();
    }
    // cobweb wisps — threads off the lintel's underside
    for (let i = 0; i < 3; i++) {
      const wx = 18 + rng.float() * 60;
      ctx.strokeStyle = `rgba(196,192,182,${0.24 + rng.float() * 0.16})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(wx, ly + 3);
      ctx.quadraticCurveTo(wx + 2, ly + 8 + rng.float() * 5, wx + (rng.float() - 0.5) * 6, ly + 13 + rng.float() * 7);
      ctx.stroke();
    }
  });
}

/** Bell thumb — the greasy rub a counter bell takes: polished
 * brass halo under the dome, thumb arcs, push pits. */
export function bellThumb(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 34;
    // brass halo — a warm polished ring under the dome
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 22);
    g.addColorStop(0, `rgba(190,160,100,${0.3 + rng.float() * 0.15})`);
    g.addColorStop(0.6, 'rgba(190,160,100,0.12)');
    g.addColorStop(1, 'rgba(190,160,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // thumb arcs — greasy wipe crescents where hands pressed
    for (let i = 0; i < 5; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(160,132,80,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 8 + rng.float() * 8, a, a + 0.6 + rng.float() * 0.8);
      ctx.stroke();
    }
    // push pits — the dome's dimples from a thousand rings
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(120,96,56,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx - 6 + rng.float() * 12, cy - 5 + rng.float() * 10, 0.7 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // the ring mark — where the base ground the counter
    ctx.strokeStyle = 'rgba(100,84,56,0.35)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy + 10, 14, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  });
}

/** Slot scratch — the scratch fan a mail slot's flap carries:
 * key-chase arcs from outside, hinge shadow, flap ghosts. */
export function slotScratch(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const cy = 32;
    // flap ghost — a pale rectangle where the flap sat for years
    ctx.strokeStyle = `rgba(150,142,124,${0.3 + rng.float() * 0.14})`;
    ctx.lineWidth = 2.4;
    ctx.strokeRect(18, cy - 9, 60, 18);
    // hinge shadow — dark seam at the flap's top
    ctx.fillStyle = 'rgba(50,42,34,0.4)';
    ctx.fillRect(18, cy - 10, 60, 1.8);
    // scratch arcs — key and nail arcs chasing the slot from outside
    for (let i = 0; i < 8; i++) {
      const sx = 30 + rng.float() * 36;
      const a = rng.float() * Math.PI * 0.8 + Math.PI * 0.6;
      ctx.strokeStyle = `rgba(90,78,62,${0.35 + rng.float() * 0.25})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(sx, cy + 4 + rng.float() * 8, 5 + rng.float() * 9, a, a + 0.5 + rng.float() * 0.6);
      ctx.stroke();
    }
    // push smudges — fingers that shoved the flap
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(70,60,48,${0.24 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(30 + rng.float() * 40, cy - 2 + rng.float() * 8, 3 + rng.float() * 2, 1.8 + rng.float(), rng.float() * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // flap's side scars — dents at the slot's ends
    for (const ex of [17, 79]) {
      ctx.fillStyle = 'rgba(44,36,28,0.5)';
      ctx.beginPath();
      ctx.arc(ex, cy + (rng.float() - 0.5) * 4, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Window latch — the thumb polish and drag arc the window's latch
 * collects: grease smear, turn crescents, fingertip ghosts. */
export function windowLatch(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 36;
    // grease smear — the pad of thumbs that worked the latch
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 14);
    g.addColorStop(0, `rgba(58,50,40,${0.4 + rng.float() * 0.2})`);
    g.addColorStop(0.7, 'rgba(58,50,40,0.14)');
    g.addColorStop(1, 'rgba(58,50,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // turn crescents — the arc the handle traced
    for (let i = 0; i < 3; i++) {
      const a0 = -Math.PI * 0.6 + rng.float() * 0.4;
      ctx.strokeStyle = `rgba(70,60,48,${0.3 + rng.float() * 0.18})`;
      ctx.lineWidth = 1.2 + rng.float() * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, 12 + i * 3 + rng.float() * 2, a0, a0 + 0.7 + rng.float() * 0.5);
      ctx.stroke();
    }
    // fingertip ghosts — dots of polish where fingers steadied the sash
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `rgba(50,44,36,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(cx - 16 + rng.float() * 32, cy - 12 + rng.float() * 22, 1.6 + rng.float() * 1, 1 + rng.float() * 0.6, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // the latch bite — a small dark pit where the tongue seats
    ctx.fillStyle = 'rgba(30,26,20,0.55)';
    ctx.fillRect(cx - 1.6, cy - 2.5, 3.2, 5);
    // rain-lick — a thin damp run from the latch's drainage
    ctx.strokeStyle = `rgba(90,84,70,${0.24 + rng.float() * 0.12})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + rng.float() * 2, cy + 3);
    ctx.lineTo(cx + rng.float() * 3, cy + 16 + rng.float() * 6);
    ctx.stroke();
  });
}

/** Piano keys — the edge wear a keyboard cover keeps: ivory line,
 * polished key tops, the nick marks of rings and nails. */
export function pianoKeys(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // the fall line — a dark seam where the cover folds
    ctx.fillStyle = 'rgba(40,34,28,0.5)';
    ctx.fillRect(6, 18, 84, 2);
    // ivory glow — the pale band of keys
    ctx.fillStyle = `rgba(196,188,164,${0.24 + rng.float() * 0.1})`;
    ctx.fillRect(6, 20, 84, 10);
    // key divisions — thin dark ticks
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `rgba(52,44,36,${0.3 + rng.float() * 0.16})`;
      ctx.fillRect(7 + i * 3.5, 20, 0.8, 10);
    }
    // polished tops — sheen ovals where hands played most
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(210,202,178,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(12 + rng.float() * 72, 25, 2.5 + rng.float() * 3, 2 + rng.float(), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // nick marks — rings and nails that bit the front edge
    for (let i = 0; i < 5; i++) {
      const nx = 10 + rng.float() * 76;
      ctx.strokeStyle = `rgba(70,60,46,${0.4 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(nx, 30);
      ctx.lineTo(nx + (rng.float() - 0.5) * 2, 33 + rng.float() * 2);
      ctx.stroke();
    }
    // dust line — the grey film along the fall's upper lip
    ctx.fillStyle = `rgba(150,144,130,${0.28 + rng.float() * 0.12})`;
    ctx.fillRect(6, 17, 84, 1.2);
  });
}

/** Picture nail — the solitary nail and its straightening scratches:
 * a rust pit, level-adjust arcs, plaster crumbs, a ghost line. */
export function pictureNail(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 26;
    // nail pit — a dark bore with rust bleed
    ctx.fillStyle = 'rgba(40,30,24,0.7)';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(120,70,40,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6 + rng.float(), 0, Math.PI * 2);
    ctx.stroke();
    // straighten arcs — the frame's bottom corner sawing the wall
    for (let i = 0; i < 4; i++) {
      const r = 16 + i * 3 + rng.float() * 2;
      const a0 = Math.PI * (0.7 + rng.float() * 0.15);
      ctx.strokeStyle = `rgba(150,140,120,${0.28 + rng.float() * 0.16})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a0 + 0.3 + rng.float() * 0.3);
      ctx.stroke();
    }
    // plaster crumbs — little chips shed while it was leveled
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(180,172,150,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx - 10 + rng.float() * 20, cy + 6 + rng.float() * 14, 0.6 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // ghost line — the pale sill of dust the frame never shaded
    ctx.fillStyle = `rgba(170,162,144,${0.24 + rng.float() * 0.12})`;
    ctx.fillRect(cx - 12, cy + 20, 24, 1.6);
    // dust droop — a fine fall beneath the nail
    ctx.strokeStyle = 'rgba(150,142,124,0.3)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 2);
    ctx.lineTo(cx + (rng.float() - 0.5) * 2, cy + 12 + rng.float() * 4);
    ctx.stroke();
  });
}

/** Vase ring — the moisture ring and dust shadow a vase keeps:
 * pale ring, damp bloom inside, shelf dust pushed to its edge. */
export function vaseRing(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 32;
    // shelf dust — a pale field the vase pushed out from under itself
    const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 24);
    g.addColorStop(0, 'rgba(160,152,134,0.0)');
    g.addColorStop(0.6, `rgba(160,152,134,${0.24 + rng.float() * 0.12})`);
    g.addColorStop(1, 'rgba(160,152,134,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // moisture ring — the circle the vase's base ground in
    ctx.strokeStyle = `rgba(104,92,72,${0.4 + rng.float() * 0.2})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, 9 + rng.float() * 2, 0, Math.PI * 2);
    ctx.stroke();
    // damp bloom — a darker film inside the ring
    ctx.fillStyle = `rgba(90,80,64,${0.22 + rng.float() * 0.12})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 7.5 + rng.float(), 0, Math.PI * 2);
    ctx.fill();
    // condensation specks — old water that beaded and dried
    for (let i = 0; i < 8; i++) {
      const a = rng.float() * Math.PI * 2, r = 10 + rng.float() * 6;
      ctx.fillStyle = `rgba(120,108,86,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.5 + rng.float() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // the polish lip — a sheen where the rim was waxed
    ctx.strokeStyle = `rgba(190,182,160,${0.3 + rng.float() * 0.12})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, 12 + rng.float() * 2, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  });
}

/** Spring dust — the grey the bed's springs shed into the frame:
 * a dark line along the rail, sag rust, coil ghosts, lint balls. */
export function springDust(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    // the rail shadow — a dark line along the frame's inner edge
    ctx.fillStyle = `rgba(50,44,36,${0.4 + rng.float() * 0.14})`;
    ctx.fillRect(4, 26, 88, 3);
    // coil ghosts — the rounded imprints springs left
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = `rgba(70,62,50,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(10 + i * 8 + rng.float() * 3, 24, 2.5 + rng.float(), Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    // sag rust — oxidation drops where coils kissed the rail
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(120,70,40,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(12 + rng.float() * 72, 27 + rng.float() * 3, 0.8 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // lint balls — the rolled grey under the sag
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(150,144,130,${0.3 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(10 + rng.float() * 76, 33 + rng.float() * 9, 0.9 + rng.float() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // the bow — a deeper shadow where the frame dipped mid-span
    ctx.fillStyle = `rgba(44,38,32,${0.3 + rng.float() * 0.14})`;
    ctx.fillRect(40 + rng.float() * 10, 24, 16, 5);
  });
}

/** Drain age — the sediment rings and mineral map an old floor
 * drain keeps: concentric tide lines, limescale, iron blush. */
export function drainAge(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 32;
    // sediment rings — each drain-down left a tide
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(96,84,66,${0.34 - i * 0.07 + rng.float() * 0.1})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, 8 + i * 4 + rng.float() * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // limescale — the chalk crust on the grate's shoulders
    for (let i = 0; i < 9; i++) {
      const a = rng.float() * Math.PI * 2, r = 12 + rng.float() * 9;
      ctx.fillStyle = `rgba(180,174,158,${0.3 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.8 + rng.float() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // iron blush — rust bloom around the rim
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 10);
    g.addColorStop(0, `rgba(130,74,42,${0.3 + rng.float() * 0.16})`);
    g.addColorStop(1, 'rgba(130,74,42,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // the grate — dark slots where the water still goes
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(30,26,22,0.6)';
      ctx.fillRect(cx - 9 + i * 5, cy - 7, 2.4, 14);
    }
    // runnels — fine channels cut through the crust
    for (let i = 0; i < 4; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(70,60,48,${0.28 + rng.float() * 0.14})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
      ctx.lineTo(cx + Math.cos(a) * (20 + rng.float() * 6), cy + Math.sin(a) * (20 + rng.float() * 6));
      ctx.stroke();
    }
  });
}

/** Plate shadow — the ghost a removed wall plate leaves: pale surround,
 * dark socket hole, wire stub, screw pits. */
export function plateShadow(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    const cx = 32, cy = 42;
    // pale surround — the wall kept its clean patch inside the plate
    ctx.fillStyle = `rgba(182,176,158,${0.3 + rng.float() * 0.12})`;
    ctx.fillRect(cx - 14, cy - 20, 28, 40);
    // grime line — the dirt that lipped around the plate's edge
    ctx.strokeStyle = `rgba(80,72,58,${0.4 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(cx - 14, cy - 20, 28, 40);
    // socket hole — the dark mouth the wires came out of
    ctx.fillStyle = 'rgba(24,20,16,0.75)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 4, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // wire stub — what was left poking out
    ctx.strokeStyle = `rgba(50,40,30,${0.5 + rng.float() * 0.2})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 2);
    ctx.quadraticCurveTo(cx + 3, cy + 4, cx + (rng.float() - 0.5) * 8, cy + 9 + rng.float() * 4);
    ctx.stroke();
    // screw pits — the two bores that held the plate
    for (const sy of [cy - 16, cy + 16]) {
      ctx.fillStyle = 'rgba(40,34,26,0.6)';
      ctx.beginPath();
      ctx.arc(cx + (rng.float() - 0.5) * 4, sy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // dust lip — the grey along the surround's top edge
    ctx.fillStyle = `rgba(160,152,134,${0.3 + rng.float() * 0.12})`;
    ctx.fillRect(cx - 13, cy - 20, 26, 1.6);
  });
}

/** Headboard rub — the scrape a bed's headboard makes on the wall:
 * vertical polish, grease crescent, post dents, plaster dust. */
export function headboardRub(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48;
    // the broad scrape — a vertical polish where the board rocks
    const g = ctx.createLinearGradient(cx - 20, 20, cx + 20, 20);
    g.addColorStop(0, 'rgba(160,150,130,0)');
    g.addColorStop(0.5, `rgba(160,150,130,${0.3 + rng.float() * 0.14})`);
    g.addColorStop(1, 'rgba(160,150,130,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 22, 14, 44, 56);
    // grease crescent — the skin-oil halo where the head rests
    const rg = ctx.createRadialGradient(cx, 42, 3, cx, 42, 18);
    rg.addColorStop(0, `rgba(70,60,46,${0.3 + rng.float() * 0.16})`);
    rg.addColorStop(1, 'rgba(70,60,46,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(cx - 20, 24, 40, 36);
    // post dents — the two points the bed's posts bite the wall
    for (const px of [cx - 14, cx + 14]) {
      ctx.fillStyle = `rgba(48,40,32,${0.4 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(px + (rng.float() - 0.5) * 3, 30 + rng.float() * 6, 1.6 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // plaster dust — crumbs shaken down by the rocking
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(170,162,142,${0.28 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(cx - 18 + rng.float() * 36, 66 + rng.float() * 16, 0.6 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // rock scars — the short arcs the frame's corners cut
    for (let i = 0; i < 4; i++) {
      const sx = cx - 16 + rng.float() * 32;
      ctx.strokeStyle = `rgba(90,80,64,${0.3 + rng.float() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, 22 + rng.float() * 8);
      ctx.lineTo(sx + (rng.float() - 0.5) * 4, 30 + rng.float() * 8);
      ctx.stroke();
    }
  });
}

/** Mortise gap — the dark seam an old door's latch edge keeps:
 * the plate shadow, strike gap, screw pits, brass ghost. */
export function mortiseGap(rng: Rng): THREE.Texture | null {
  return canvasTex(48, 96, (ctx) => {
    const cx = 24;
    // the seam — a near-black line down the latch edge
    ctx.fillStyle = `rgba(22,18,14,${0.55 + rng.float() * 0.15})`;
    ctx.fillRect(cx - 2.5, 12, 5, 62);
    // plate ghost — the pale rectangle the mortise plate covered
    ctx.strokeStyle = `rgba(140,120,90,${0.3 + rng.float() * 0.14})`;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx - 8, 40, 16, 18);
    // strike gap — the mouth the tongue seats into
    ctx.fillStyle = 'rgba(20,16,12,0.7)';
    ctx.fillRect(cx - 3, 46, 6, 7);
    // screw pits — two bores for the plate screws
    for (const sy of [42, 56]) {
      ctx.fillStyle = 'rgba(36,30,24,0.6)';
      ctx.beginPath();
      ctx.arc(cx, sy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    // brass ghost — the polished polish of a plate removed
    ctx.strokeStyle = `rgba(170,140,90,${0.24 + rng.float() * 0.12})`;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(cx - 7, 41, 14, 16);
    // wood bruise — the darkened grain around the mortise
    const g = ctx.createRadialGradient(cx, 50, 6, cx, 50, 18);
    g.addColorStop(0, 'rgba(60,48,34,0)');
    g.addColorStop(1, `rgba(60,48,34,${0.24 + rng.float() * 0.1})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 30, 48, 40);
    // scratches — keys that missed the plate
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(70,60,46,${0.3 + rng.float() * 0.18})`;
      ctx.lineWidth = 0.7;
      const sx = cx - 6 + rng.float() * 12;
      ctx.beginPath();
      ctx.moveTo(sx, 60 + rng.float() * 6);
      ctx.lineTo(sx + (rng.float() - 0.5) * 3, 68 + rng.float() * 8);
      ctx.stroke();
    }
  });
}

/** Card ghost — the rectangle a removed index card leaves:
 * pale frame, pin pits, corner bruises, paste crumb. */
export function cardGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 30;
    // pale card patch — the unsoiled rectangle where a card was pinned
    ctx.fillStyle = `rgba(190,182,158,${0.34 + rng.float() * 0.14})`;
    ctx.fillRect(cx - 12, cy - 9, 24, 17);
    // grime edge — the dirt lipped around the card's sides
    ctx.strokeStyle = `rgba(76,66,52,${0.36 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx - 12, cy - 9, 24, 17);
    // pin pits — the bores where tacks held it
    for (const [px, py] of [[cx - 9, cy - 6], [cx + 9, cy - 6], [cx - 9, cy + 5], [cx + 9, cy + 5]] as const) {
      ctx.fillStyle = 'rgba(40,34,26,0.6)';
      ctx.beginPath();
      ctx.arc(px + (rng.float() - 0.5) * 1.5, py + (rng.float() - 0.5) * 1.5, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // corner bruise — one corner darkened where the card curled
    const g = ctx.createRadialGradient(cx + 10, cy + 7, 1, cx + 10, cy + 7, 7);
    g.addColorStop(0, `rgba(60,50,40,${0.4 + rng.float() * 0.16})`);
    g.addColorStop(1, 'rgba(60,50,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx + 3, cy, 14, 13);
    // paste crumb — dried glue smudge left behind
    ctx.fillStyle = `rgba(150,140,110,${0.3 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(cx - 4 + rng.float() * 8, cy + 9 + rng.float() * 2, 4 + rng.float() * 2, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // scribe ghost — the faded line of the card's title edge
    ctx.strokeStyle = `rgba(100,90,70,${0.24 + rng.float() * 0.1})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 3);
    ctx.lineTo(cx + 8, cy - 3 + (rng.float() - 0.5));
    ctx.stroke();
  });
}

/** Rod scar — the rubbed-through band a curtain rod leaves:
 * polish strip, ring dents, end nubs, cord graze. */
export function rodScar(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    const ly = 18 + rng.float() * 4;
    // polish strip — the horizontal band rings and rings wore
    ctx.fillStyle = `rgba(140,126,100,${0.28 + rng.float() * 0.14})`;
    ctx.fillRect(8, ly - 1.4, 80, 3);
    // ring dents — the evenly-spaced grind marks of curtain rings
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(90,78,60,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(12 + i * 6.4 + rng.float() * 2, ly + rng.float() * 1.5, 0.9 + rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // end nubs — heavier wear where finials sat in brackets
    for (const ex of [10, 84]) {
      ctx.fillStyle = `rgba(70,60,44,${0.4 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.arc(ex, ly + 1, 2.2 + rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // cord graze — the thin track a pull-cord sawed at one end
    ctx.strokeStyle = `rgba(100,88,66,${0.34 + rng.float() * 0.14})`;
    ctx.lineWidth = 0.9;
    const side = rng.bool(0.5) ? 16 : 76;
    ctx.beginPath();
    ctx.moveTo(side, ly + 2);
    ctx.quadraticCurveTo(side + (rng.float() - 0.5) * 4, ly + 14, side + (rng.float() - 0.5) * 6, ly + 24);
    ctx.stroke();
    // dust shelf — the pale film riding the rod's top
    ctx.fillStyle = `rgba(178,170,150,${0.26 + rng.float() * 0.1})`;
    ctx.fillRect(9, ly - 3.4, 78, 1.4);
  });
}

/** Bin shadow — the grain-shadow and drip ghosts an old grain bin
 * keeps: seed tide lines, chaff flecks, mouse trails. */
export function binShadow(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    // tide lines — the grain's old levels inside the bin
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(120,100,64,${0.32 - i * 0.07 + rng.float() * 0.1})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(48, 30 + i * 12 + rng.float() * 3, 30 + rng.float() * 4, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    // chaff — husks and husk dust settled in the corners
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(170,140,84,${0.3 + rng.float() * 0.2})`;
      ctx.fillRect(14 + rng.float() * 68, 66 + rng.float() * 22, 1.8 + rng.float() * 2.4, 0.9 + rng.float() * 0.7);
    }
    // mouse trails — the dust-skimmed runs where feet passed
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(96,82,60,${0.28 + rng.float() * 0.14})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(16 + rng.float() * 20, 78 + rng.float() * 8);
      ctx.quadraticCurveTo(48, 70 + rng.float() * 14, 72 + rng.float() * 8, 80 + rng.float() * 8);
      ctx.stroke();
    }
    // seed shadow — the dark residue left in the bottom seam
    ctx.fillStyle = `rgba(60,50,34,${0.3 + rng.float() * 0.14})`;
    ctx.fillRect(20, 84, 56, 3);
    // scoop polish — the sheen the grain-scoop's bowl kept fresh
    const g = ctx.createRadialGradient(52, 44, 3, 52, 44, 14);
    g.addColorStop(0, `rgba(186,164,110,${0.3 + rng.float() * 0.12})`);
    g.addColorStop(1, 'rgba(186,164,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(36, 30, 32, 28);
  });
}

/** Iron stamp — the maker's mark and rivet ghosts a cast-iron front
 * keeps: embossed plate, rivet heads, heat browning, flake rust. */
export function ironStamp(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48, cy = 46;
    // plate ghost — the raised rectangle where the maker's plate sat
    ctx.strokeStyle = `rgba(160,150,130,${0.32 + rng.float() * 0.14})`;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(cx - 16, cy - 8, 32, 16);
    // plate's face — a pale film inside the frame
    ctx.fillStyle = `rgba(170,160,140,${0.2 + rng.float() * 0.1})`;
    ctx.fillRect(cx - 15, cy - 7, 30, 14);
    // rivet heads — the four bosses holding the plate
    for (const [rx, ry] of [[cx - 13, cy - 5], [cx + 13, cy - 5], [cx - 13, cy + 5], [cx + 13, cy + 5]] as const) {
      ctx.fillStyle = `rgba(200,190,168,${0.4 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(50,40,32,0.4)';
      ctx.beginPath();
      ctx.arc(rx + 0.6, ry + 0.8, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // letter ghosts — faint bars where the name was cast
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(120,110,92,${0.3 + rng.float() * 0.16})`;
      ctx.fillRect(cx - 11 + i * 5, cy - 3, 3, 6);
    }
    // heat browning — the temper colors creeping off the plate
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 30);
    g.addColorStop(0, 'rgba(140,80,50,0)');
    g.addColorStop(1, `rgba(140,80,50,${0.24 + rng.float() * 0.12})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // flake rust — the scale that lifted around the rivets
    for (let i = 0; i < 7; i++) {
      const a = rng.float() * Math.PI * 2, r = 20 + rng.float() * 8;
      ctx.fillStyle = `rgba(130,70,40,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1 + rng.float() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Seat dust — the undisturbed film a never-used seat keeps:
 * grey field, fabric nap lines, a clean crescent, moth flecks. */
export function seatDust(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    // dust field — the whole seat filmed over
    ctx.fillStyle = `rgba(160,152,134,${0.3 + rng.float() * 0.14})`;
    ctx.fillRect(10, 14, 44, 36);
    // nap lines — the fabric weave showing through the film
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = `rgba(120,112,96,${0.2 + rng.float() * 0.12})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(12, 18 + i * 5 + rng.float() * 2);
      ctx.lineTo(52, 19 + i * 5 + rng.float() * 2);
      ctx.stroke();
    }
    // clean crescent — where someone's elbow brushed the corner once
    const g = ctx.createRadialGradient(46, 40, 2, 46, 40, 12);
    g.addColorStop(0, `rgba(60,54,44,${0.3 + rng.float() * 0.14})`);
    g.addColorStop(1, 'rgba(60,54,44,0)');
    ctx.fillStyle = g;
    ctx.fillRect(34, 28, 24, 24);
    // moth flecks — the tiny specks moths dropped
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(90,82,66,${0.32 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(14 + rng.float() * 36, 18 + rng.float() * 28, 0.6 + rng.float() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // front lip — dust banked heavier at the seat's front edge
    ctx.fillStyle = `rgba(172,164,146,${0.34 + rng.float() * 0.14})`;
    ctx.fillRect(10, 46, 44, 4);
  });
}

/** Chain pool — the rust shadow and link marks a hanging chain
 * throws on the floor: iron shadow, link prints, drip ring. */
export function chainPool(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 32;
    // iron shadow — the soft dark pool the chain throws
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 20);
    g.addColorStop(0, `rgba(40,34,28,${0.4 + rng.float() * 0.16})`);
    g.addColorStop(0.7, 'rgba(40,34,28,0.14)');
    g.addColorStop(1, 'rgba(40,34,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // link prints — the chain's shadow links lying flat
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + rng.float() * 0.3;
      ctx.strokeStyle = `rgba(52,42,34,${0.36 + rng.float() * 0.18})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 5, cy + Math.sin(a) * 4, 3, 1.6, a + 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // rust ring — the drip circle where condensation fell
    ctx.strokeStyle = `rgba(130,72,40,${0.3 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy, 13 + rng.float() * 3, 0, Math.PI * 2);
    ctx.stroke();
    // oxidation flecks — rust grains shed from links
    for (let i = 0; i < 10; i++) {
      const a = rng.float() * Math.PI * 2, r = 4 + rng.float() * 12;
      ctx.fillStyle = `rgba(140,78,44,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.5 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // the sway arc — a polish line where the chain sweeps lowest
    ctx.strokeStyle = `rgba(90,78,62,${0.3 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(cx, cy + 6, 9, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  });
}

/** Dial ghost — the pale ring and hand shadows a removed clock face
 * leaves: face circle, hand ghosts, winding holes, brass rim. */
export function dialGhost(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48, cy = 48;
    // face circle — the unbleached disc the dial covered
    ctx.fillStyle = `rgba(188,180,160,${0.34 + rng.float() * 0.14})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    // grime rim — the dirt ring at the dial's edge
    ctx.strokeStyle = `rgba(78,68,54,${0.4 + rng.float() * 0.16})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.stroke();
    // hand ghosts — the two shadows the hands cast for years
    ctx.strokeStyle = `rgba(96,84,66,${0.3 + rng.float() * 0.16})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - 9 + rng.float() * 4, cy - 12 - rng.float() * 3);
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 8 + rng.float() * 4, cy + 5 + rng.float() * 3);
    ctx.stroke();
    // winding holes — the two bores for the key
    for (const dx of [-6, 6]) {
      ctx.fillStyle = 'rgba(36,30,24,0.7)';
      ctx.beginPath();
      ctx.arc(cx + dx, cy + 7, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // brass rim — the polished line the bezel kept
    ctx.strokeStyle = `rgba(180,150,96,${0.28 + rng.float() * 0.12})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, 24.5, 0, Math.PI * 2);
    ctx.stroke();
    // dust — the grey that settled in the hole
    ctx.fillStyle = `rgba(140,132,116,${0.24 + rng.float() * 0.12})`;
    ctx.beginPath();
    ctx.arc(cx, cy - 16, 2 + rng.float(), 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Snare set — the flattened drag and peg marks a floor snare leaves:
 * wire loop ghost, peg pits, bait crumbs, fur tufts. */
export function snareSet(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const cx = 48, cy = 34;
    // flattened drag — the pale skid where the snare was weighted
    ctx.fillStyle = `rgba(160,150,126,${0.28 + rng.float() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 24, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // wire loop ghost — the circle the noose described
    ctx.strokeStyle = `rgba(110,96,72,${0.4 + rng.float() * 0.18})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 12, 7, 0.1, 0, Math.PI * 2);
    ctx.stroke();
    // peg pits — the two stakes that held the set
    for (const px of [cx - 16, cx + 17]) {
      ctx.fillStyle = 'rgba(36,30,24,0.7)';
      ctx.beginPath();
      ctx.arc(px + (rng.float() - 0.5) * 3, cy + (rng.float() - 0.5) * 8, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // bait crumbs — the scatter that lured the path
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(150,126,80,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx - 8 + rng.float() * 20, cy - 4 + rng.float() * 10, 0.6 + rng.float() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // fur tufts — the wisps a sprung catch left
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(140,130,110,${0.26 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(cx - 10 + rng.float() * 22, cy + 3 + rng.float() * 5, 1.6 + rng.float(), 0.8, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // escape skid — the drag-off line where it was pulled away
    ctx.strokeStyle = `rgba(120,106,80,${0.3 + rng.float() * 0.14})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 12, cy);
    ctx.quadraticCurveTo(cx + 22, cy + 2, cx + 28 + rng.float() * 4, cy + 6 + rng.float() * 3);
    ctx.stroke();
  });
}

/** Hem scrape — the sweep mark a flag's hem kept on the wall:
 * horizontal polish, tip dents, cloth threads, dust shelf. */
export function hemScrape(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const ly = 34;
    // sweep polish — the broad horizontal band the hem wiped
    const g = ctx.createLinearGradient(0, ly - 10, 0, ly + 10);
    g.addColorStop(0, 'rgba(160,152,134,0)');
    g.addColorStop(0.5, `rgba(160,152,134,${0.3 + rng.float() * 0.14})`);
    g.addColorStop(1, 'rgba(160,152,134,0)');
    ctx.fillStyle = g;
    ctx.fillRect(6, ly - 10, 84, 20);
    // tip dents — the deeper marks where the flag's corners caught
    for (let i = 0; i < 4; i++) {
      const hx = 18 + i * 18 + rng.float() * 6;
      ctx.fillStyle = `rgba(70,60,48,${0.32 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(hx, ly + (rng.float() - 0.5) * 5, 2 + rng.float() * 1.4, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // cloth threads — the frayed strands the hem shed
    for (let i = 0; i < 6; i++) {
      const hx = 20 + rng.float() * 56;
      ctx.strokeStyle = `rgba(130,120,100,${0.28 + rng.float() * 0.16})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(hx, ly);
      ctx.quadraticCurveTo(hx + (rng.float() - 0.5) * 4, ly + 4 + rng.float() * 4, hx + (rng.float() - 0.5) * 6, ly + 9 + rng.float() * 5);
      ctx.stroke();
    }
    // dust shelf — the film riding above the sweep line
    ctx.fillStyle = `rgba(174,166,146,${0.24 + rng.float() * 0.1})`;
    ctx.fillRect(8, ly - 11, 80, 1.4);
    // the deep scrape — one heavy pass darker than the rest
    ctx.strokeStyle = `rgba(80,70,56,${0.34 + rng.float() * 0.14})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(14 + rng.float() * 10, ly + 1);
    ctx.quadraticCurveTo(48, ly + 3 + rng.float() * 3, 78 + rng.float() * 8, ly + 1);
    ctx.stroke();
  });
}

/** Fender wear — the polish band a hearth fender leaves on the stone:
 * iron line, foot dents, spark pits, soot curtain. */
export function fenderWear(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    const ly = 22 + rng.float() * 3;
    // iron line — the polished rail where the fender's rail ran
    ctx.fillStyle = `rgba(60,52,44,${0.4 + rng.float() * 0.14})`;
    ctx.fillRect(10, ly - 1, 76, 2.4);
    // foot dents — the two pads the fender stood on
    for (const fx of [16, 80]) {
      ctx.fillStyle = `rgba(44,38,32,${0.5 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(fx + (rng.float() - 0.5) * 4, ly + 4, 3.4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // spark pits — where embers jumped the rail and died
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(30,26,22,${0.4 + rng.float() * 0.24})`;
      ctx.beginPath();
      ctx.arc(14 + rng.float() * 68, ly + 8 + rng.float() * 12, 0.7 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // soot curtain — the grey wash the fender sheltered
    const g = ctx.createLinearGradient(0, ly - 10, 0, ly);
    g.addColorStop(0, 'rgba(80,72,60,0)');
    g.addColorStop(1, `rgba(80,72,60,${0.24 + rng.float() * 0.1})`);
    ctx.fillStyle = g;
    ctx.fillRect(8, ly - 10, 80, 10);
    // drag marks — the sideways shift marks of the fender's feet
    for (let i = 0; i < 3; i++) {
      const dx = 20 + rng.float() * 56;
      ctx.strokeStyle = `rgba(90,80,64,${0.3 + rng.float() * 0.16})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(dx, ly + 3);
      ctx.lineTo(dx + 4 + rng.float() * 5, ly + 5 + rng.float() * 2);
      ctx.stroke();
    }
  });
}

/** Poker ring — the iron base ring the fire irons' stand keeps:
 * ground circle, tool ghosts, rust bloom, scale flecks. */
export function pokerRing(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 64, (ctx) => {
    const cx = 32, cy = 32;
    // ground circle — the ring the stand's base ground in
    ctx.strokeStyle = `rgba(48,42,36,${0.5 + rng.float() * 0.18})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 10 + rng.float() * 2, 0, Math.PI * 2);
    ctx.stroke();
    // rust bloom — the ring's oxidation halo
    const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 16);
    g.addColorStop(0, `rgba(130,72,40,${0.3 + rng.float() * 0.16})`);
    g.addColorStop(1, 'rgba(130,72,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // tool ghosts — the drag lines of tongs and pokers laid down
    for (let i = 0; i < 3; i++) {
      const a = rng.float() * Math.PI;
      ctx.strokeStyle = `rgba(70,60,48,${0.32 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * 18, cy - Math.sin(a) * 14);
      ctx.lineTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 14);
      ctx.stroke();
    }
    // scale flecks — the iron flakes the stand shed
    for (let i = 0; i < 8; i++) {
      const a = rng.float() * Math.PI * 2, r = 12 + rng.float() * 8;
      ctx.fillStyle = `rgba(120,66,38,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.7 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // the leaning shadow — the offset shade of the stand's post
    ctx.fillStyle = `rgba(36,30,26,${0.3 + rng.float() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(cx + 6, cy + 4, 3, 1.6, 0.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Ash broom — the fan strokes that pushed the ash back toward
 * the fire: broom arcs, ash banks, bristle trails, coal flecks. */
export function ashBroom(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const cy = 36;
    // broom arcs — the fan strokes pushing back toward the grate
    for (let i = 0; i < 4; i++) {
      const x0 = 14 + i * 18 + rng.float() * 6;
      ctx.strokeStyle = `rgba(110,102,88,${0.3 + rng.float() * 0.16})`;
      ctx.lineWidth = 2 + rng.float();
      ctx.beginPath();
      ctx.moveTo(x0, cy + 10);
      ctx.quadraticCurveTo(x0 + 6, cy - 4, x0 + 12 + rng.float() * 4, cy - 12 - rng.float() * 4);
      ctx.stroke();
    }
    // ash bank — the grey ridge left against the grate's lip
    ctx.fillStyle = `rgba(160,154,140,${0.3 + rng.float() * 0.14})`;
    ctx.beginPath();
    ctx.moveTo(10, cy - 10);
    for (let x = 10; x <= 86; x += 6) ctx.lineTo(x, cy - 10 + (rng.float() - 0.5) * 3);
    ctx.lineTo(86, cy - 5);
    ctx.lineTo(10, cy - 5);
    ctx.fill();
    // bristle trails — the fine parallel lines of the last pass
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = `rgba(130,122,106,${0.26 + rng.float() * 0.14})`;
      ctx.lineWidth = 0.6;
      const y0 = cy - 2 + i * 2;
      ctx.beginPath();
      ctx.moveTo(20 + rng.float() * 20, y0);
      ctx.lineTo(60 + rng.float() * 20, y0 + (rng.float() - 0.5) * 3);
      ctx.stroke();
    }
    // coal flecks — the black crumbs that missed the shovel
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(30,26,22,${0.4 + rng.float() * 0.24})`;
      ctx.beginPath();
      ctx.arc(16 + rng.float() * 64, cy + 6 + rng.float() * 12, 0.7 + rng.float() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Wine stain — the old dark spill and tide rings a cellar floor keeps:
 * spatter bloom, drip channels, sediment edge, cork press. */
export function wineStain(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 96, (ctx) => {
    const cx = 48, cy = 48;
    // spatter bloom — the dark pooling of an old pour
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 26);
    g.addColorStop(0, `rgba(60,26,28,${0.4 + rng.float() * 0.16})`);
    g.addColorStop(0.6, 'rgba(60,26,28,0.18)');
    g.addColorStop(1, 'rgba(60,26,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    // sediment edge — the darker rim where the stain dried
    ctx.strokeStyle = `rgba(44,20,22,${0.4 + rng.float() * 0.18})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 20 + rng.float() * 4, 16 + rng.float() * 3, rng.float() * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    // drip channels — the runs it took toward the drain
    for (let i = 0; i < 4; i++) {
      const a = rng.float() * Math.PI * 2;
      ctx.strokeStyle = `rgba(54,24,26,${0.34 + rng.float() * 0.16})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 12);
      ctx.lineTo(cx + Math.cos(a) * (26 + rng.float() * 10), cy + Math.sin(a) * (20 + rng.float() * 8));
      ctx.stroke();
    }
    // tide rings — each topping-up left a line
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(70,32,34,${0.3 - i * 0.05 + rng.float() * 0.12})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(cx + (rng.float() - 0.5) * 8, cy + (rng.float() - 0.5) * 8, 8 + i * 4 + rng.float() * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // cork press — the small wet circle a cork left
    ctx.strokeStyle = `rgba(80,40,34,${0.34 + rng.float() * 0.14})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx + 14 + rng.float() * 6, cy + 10 + rng.float() * 6, 2.4, 0, Math.PI * 2);
    ctx.stroke();
    // flecks — the dried drops around the edge
    for (let i = 0; i < 10; i++) {
      const a = rng.float() * Math.PI * 2, r = 22 + rng.float() * 10;
      ctx.fillStyle = `rgba(56,26,28,${0.32 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.6 + rng.float() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Whitewash line — the ghost band where a stopped paint job ended:
 * chalk edge, drip tails, roller ghosts, wall weep. */
export function whitewashLine(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const ly = 30 + rng.float() * 4;
    // chalk edge — the pale line where the wash stopped
    ctx.fillStyle = `rgba(200,196,182,${0.4 + rng.float() * 0.14})`;
    ctx.fillRect(8, ly - 8, 80, 8);
    // stop line — the sharper bottom edge
    ctx.fillStyle = `rgba(96,88,72,${0.34 + rng.float() * 0.14})`;
    ctx.fillRect(8, ly, 80, 1.6);
    // drip tails — the runs that fell below the line
    for (let i = 0; i < 7; i++) {
      const dx = 14 + rng.float() * 68;
      ctx.strokeStyle = `rgba(190,186,170,${0.3 + rng.float() * 0.18})`;
      ctx.lineWidth = 1 + rng.float() * 0.7;
      ctx.beginPath();
      ctx.moveTo(dx, ly + 1);
      ctx.lineTo(dx + (rng.float() - 0.5) * 3, ly + 6 + rng.float() * 10);
      ctx.stroke();
    }
    // roller ghosts — the faint vertical passes of the last coat
    for (let i = 0; i < 5; i++) {
      const rx = 14 + i * 16 + rng.float() * 4;
      ctx.strokeStyle = `rgba(170,164,148,${0.2 + rng.float() * 0.12})`;
      ctx.lineWidth = 3 + rng.float() * 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, ly - 9);
      ctx.lineTo(rx + (rng.float() - 0.5) * 2, ly - 1);
      ctx.stroke();
    }
    // wall weep — the damp line that made them stop
    ctx.strokeStyle = `rgba(100,90,72,${0.3 + rng.float() * 0.14})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(10 + rng.float() * 10, ly + 8);
    ctx.quadraticCurveTo(48, ly + 14 + rng.float() * 4, 80 + rng.float() * 6, ly + 8);
    ctx.stroke();
  });
}

/** Bell wire — the thin wire run and its staples a servant bell's
 * line leaves on the ceiling boards: wire line, staple crowns,
 * junction dot, fray sags. */
export function bellWire(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    const ly = 20 + rng.float() * 4;
    // wire line — the thin dark run stapled along the boards
    ctx.strokeStyle = `rgba(56,48,38,${0.5 + rng.float() * 0.16})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(6, ly);
    let wx = 6;
    while (wx < 90) {
      const nx = wx + 8 + rng.float() * 6;
      ctx.quadraticCurveTo((wx + nx) / 2, ly + rng.float() * 1.6 - 0.4, nx, ly + (rng.float() - 0.5) * 1.2);
      wx = nx;
    }
    ctx.stroke();
    // staple crowns — the saddle clamps every few inches
    for (let sx = 14; sx < 88; sx += 12 + rng.float() * 4) {
      ctx.strokeStyle = `rgba(40,34,28,${0.5 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(sx, ly - 1, 1.8, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    // junction dot — the soldered joint mid-run
    ctx.fillStyle = `rgba(46,38,30,${0.5 + rng.float() * 0.16})`;
    ctx.beginPath();
    ctx.arc(40 + rng.float() * 16, ly, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // fray sags — the dips where staples pulled out
    for (let i = 0; i < 2; i++) {
      const fx = 24 + rng.float() * 44;
      ctx.strokeStyle = `rgba(60,52,42,${0.36 + rng.float() * 0.16})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(fx, ly + 1);
      ctx.quadraticCurveTo(fx + 4, ly + 7 + rng.float() * 4, fx + 8 + rng.float() * 3, ly + 1);
      ctx.stroke();
    }
    // grease — the dust caught on the wire's underside
    ctx.fillStyle = `rgba(150,142,124,${0.2 + rng.float() * 0.1})`;
    ctx.fillRect(8, ly + 1, 80, 0.9);
  });
}

/** Kindling — the chips and curls a wood pile sheds by the hearth:
 * splinter flecks, bark curls, axe nicks, sap stains. */
export function kindling(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // splinter flecks — the thin slivers knocked off the chopping
    for (let i = 0; i < 14; i++) {
      const a = rng.float() * Math.PI;
      ctx.save();
      ctx.translate(16 + rng.float() * 64, 20 + rng.float() * 30);
      ctx.rotate(a);
      ctx.fillStyle = `rgba(140,110,70,${0.3 + rng.float() * 0.2})`;
      ctx.fillRect(-2.5 - rng.float() * 2, -0.5, 5 + rng.float() * 4, 1 + rng.float() * 0.7);
      ctx.restore();
    }
    // bark curls — the rolled strips peeled off the rounds
    for (let i = 0; i < 6; i++) {
      const bx = 20 + rng.float() * 56, by = 26 + rng.float() * 24;
      ctx.strokeStyle = `rgba(110,82,52,${0.34 + rng.float() * 0.18})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(bx, by, 2 + rng.float() * 1.5, rng.float() * Math.PI, rng.float() * Math.PI + 2 + rng.float());
      ctx.stroke();
    }
    // axe nicks — the small dark bites in the boards
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(40,32,24,${0.4 + rng.float() * 0.24})`;
      ctx.beginPath();
      ctx.ellipse(24 + rng.float() * 48, 30 + rng.float() * 20, 1.6, 0.8, rng.float(), 0, Math.PI * 2);
      ctx.fill();
    }
    // sap stain — the amber spots the fresh cuts wept
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(160,120,60,${0.28 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(26 + rng.float() * 44, 34 + rng.float() * 16, 2.4 + rng.float() * 1.6, 1.6, rng.float() * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // dust ring — the bark-dust halo under the pile
    ctx.strokeStyle = `rgba(120,100,70,${0.28 + rng.float() * 0.14})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(48, 40, 28, 12, 0, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
  });
}

/** Match burn — the strike scratches and dead matches a mantel
 * keeps: strike fans, match ghosts, sulphur pits, ash spots. */
export function matchBurn(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    // strike fans — the parallel scratch runs of struck matches
    for (let i = 0; i < 5; i++) {
      const sx = 16 + i * 14 + rng.float() * 6;
      for (let j = 0; j < 4; j++) {
        ctx.strokeStyle = `rgba(80,70,56,${0.28 + rng.float() * 0.16})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(sx + j * 1.2, 24 + rng.float() * 3);
        ctx.lineTo(sx + j * 1.2 + 6 + rng.float() * 3, 20 + rng.float() * 2);
        ctx.stroke();
      }
    }
    // match ghosts — the little sticks that burned out on the shelf
    for (let i = 0; i < 6; i++) {
      const mx = 16 + rng.float() * 64, my = 36 + rng.float() * 16;
      ctx.strokeStyle = `rgba(140,120,90,${0.36 + rng.float() * 0.2})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + 5 + rng.float() * 4, my + (rng.float() - 0.5) * 3);
      ctx.stroke();
      // spent head
      ctx.fillStyle = `rgba(30,26,22,${0.5 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(mx + (rng.bool(0.5) ? 0 : 5), my, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    // sulphur pits — the yellow-green sparks that bit the varnish
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(140,120,60,${0.3 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(20 + rng.float() * 56, 26 + rng.float() * 10, 0.6 + rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // ash spots — the grey dust of the dead strikes
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(150,146,136,${0.3 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(18 + rng.float() * 60, 44 + rng.float() * 10, 0.9 + rng.float() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Press plate — the ink-film ghost and screw pits a printing
 * plate leaves on the press bed: plate shadow, ink key, gripper bars. */
export function pressPlate(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const cx = 48, cy = 32;
    // plate shadow — the pale rectangle the chase covered
    ctx.fillStyle = `rgba(170,162,142,${0.28 + rng.float() * 0.12})`;
    ctx.fillRect(cx - 24, cy - 14, 48, 28);
    // ink film — the grey wash the type left
    ctx.fillStyle = `rgba(56,50,44,${0.24 + rng.float() * 0.14})`;
    ctx.fillRect(cx - 20, cy - 10, 40, 20);
    // letter ghosts — the faint bars of the last forme
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(40,36,30,${0.3 + rng.float() * 0.18})`;
      ctx.fillRect(cx - 18 + i * 5 + rng.float(), cy - 8 + rng.float() * 4, 3, 12 + rng.float() * 4);
    }
    // gripper bars — the two polish lines the carriage gripped
    for (const gy of [cy - 13, cy + 13]) {
      ctx.strokeStyle = `rgba(190,182,160,${0.34 + rng.float() * 0.14})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx - 22, gy);
      ctx.lineTo(cx + 22, gy);
      ctx.stroke();
    }
    // screw pits — the chase's corners
    for (const [sx, sy] of [[cx - 22, cy - 12], [cx + 22, cy - 12], [cx - 22, cy + 12], [cx + 22, cy + 12]] as const) {
      ctx.fillStyle = 'rgba(36,30,24,0.6)';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // ink key — the dark drip at the plate's feeding edge
    ctx.fillStyle = `rgba(28,24,20,${0.5 + rng.float() * 0.16})`;
    ctx.fillRect(cx - 10 + rng.float() * 10, cy + 13, 6, 2);
  });
}

/** Tail drag — the fine continuous line a tail drags through floor
 * dust along the skirting: drag line, paw pairs, pause drops. */
export function tailDrag(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 48, (ctx) => {
    const ly = 24 + rng.float() * 3;
    // drag line — the unbroken wake through the dust film
    ctx.strokeStyle = `rgba(140,132,116,${0.44 + rng.float() * 0.18})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(6, ly);
    let tx = 6;
    while (tx < 90) {
      const nx = tx + 7 + rng.float() * 5;
      ctx.quadraticCurveTo((tx + nx) / 2, ly + (rng.float() - 0.5) * 3, nx, ly + (rng.float() - 0.5) * 2);
      tx = nx;
    }
    ctx.stroke();
    // paw pairs — the dotted prints alongside the wake
    for (let i = 0; i < 14; i++) {
      const px = 10 + i * 6 + rng.float() * 3;
      const side = i % 2 === 0 ? -3 : 3;
      ctx.fillStyle = `rgba(120,110,94,${0.3 + rng.float() * 0.2})`;
      ctx.beginPath();
      ctx.arc(px, ly + side + rng.float(), 0.6 + rng.float() * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // pause drop — the wider smudge where it stopped
    ctx.fillStyle = `rgba(150,142,126,${0.36 + rng.float() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(34 + rng.float() * 20, ly + 1, 3.4, 1.8, rng.float() * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // dust bank — the film pushed against the skirting line
    ctx.fillStyle = `rgba(160,152,136,${0.24 + rng.float() * 0.1})`;
    ctx.fillRect(6, ly - 8, 84, 1.6);
    // scatter — grit thrown out of the wake
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(110,102,88,${0.3 + rng.float() * 0.18})`;
      ctx.beginPath();
      ctx.arc(12 + rng.float() * 72, ly - 5 + rng.float() * 12, 0.5 + rng.float() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Chalk game — the rubbed grid a floor chalk game leaves:
 * chalk squares, number ghosts, hopscotch taps, a lost pebble. */
export function chalkGame(rng: Rng): THREE.Texture | null {
  return canvasTex(64, 96, (ctx) => {
    // the grid — alternating single and double squares up the floor
    let gy = 14;
    for (let r = 0; r < 6; r++) {
      const wide = r % 3 === 1;
      ctx.strokeStyle = `rgba(190,186,172,${0.34 + rng.float() * 0.14})`;
      ctx.lineWidth = 1.3;
      if (wide) {
        ctx.strokeRect(14, gy, 16, 9);
        ctx.strokeRect(34, gy, 16, 9);
      } else {
        ctx.strokeRect(22, gy, 20, 9);
      }
      gy += 11;
    }
    // number ghosts — faint numerals in some squares
    for (let i = 0; i < 3; i++) {
      const ny = 17 + i * 22 + rng.float() * 5;
      ctx.strokeStyle = `rgba(180,176,162,${0.28 + rng.float() * 0.14})`;
      ctx.lineWidth = 0.9;
      ctx.strokeRect(29 + rng.float() * 4, ny, 4, 6);
    }
    // hopscotch taps — the smudged spots of landed feet
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(150,144,128,${0.26 + rng.float() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(24 + rng.float() * 16, 18 + rng.float() * 50, 3 + rng.float() * 2, 2, rng.float() * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // the pebble — the round ghost the marker left
    ctx.strokeStyle = `rgba(110,104,90,${0.4 + rng.float() * 0.18})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(32 + rng.float() * 8, 60 + rng.float() * 8, 2.2, 0, Math.PI * 2);
    ctx.stroke();
    // scuffs — where soles wiped the chalk
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(130,124,110,${0.28 + rng.float() * 0.14})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(18 + rng.float() * 28, 20 + rng.float() * 44);
      ctx.lineTo(26 + rng.float() * 30, 22 + rng.float() * 44);
      ctx.stroke();
    }
  });
}

/** Sheet stand — the paper ghost and stand shadow a music sheet
 * leaves on piano and desk tops: page edges, staff ghosts, clip marks. */
export function sheetStand(rng: Rng): THREE.Texture | null {
  return canvasTex(96, 64, (ctx) => {
    const cx = 48, cy = 30;
    // paper ghost — the unbleached rectangle under the pages
    ctx.fillStyle = `rgba(196,190,170,${0.3 + rng.float() * 0.14})`;
    ctx.fillRect(cx - 20, cy - 13, 40, 26);
    // page edges — the stack's lip on one side
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(140,132,114,${0.3 + rng.float() * 0.14})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + 19 - i, cy - 12);
      ctx.lineTo(cx + 19 - i, cy + 12);
      ctx.stroke();
    }
    // staff ghosts — the five faint lines of the last sheet
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(110,102,86,${0.24 + rng.float() * 0.12})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy - 6 + i * 2.4);
      ctx.lineTo(cx + 12, cy - 6 + i * 2.4 + (rng.float() - 0.5));
      ctx.stroke();
    }
    // clip marks — the two dents where the stand's clips held
    for (const cxm of [cx - 14, cx + 14]) {
      ctx.fillStyle = 'rgba(60,52,42,0.5)';
      ctx.beginPath();
      ctx.ellipse(cxm, cy - 12, 1.6, 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // pencil ghosts — the rubbed notes in a margin
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(90,84,70,${0.26 + rng.float() * 0.14})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - 16 + rng.float() * 8, cy + 7 + i * 1.6);
      ctx.lineTo(cx - 6 + rng.float() * 8, cy + 7 + i * 1.6 + (rng.float() - 0.5));
      ctx.stroke();
    }
    // fold shadow — the vertical crease of the turn page
    ctx.strokeStyle = `rgba(140,132,114,${0.28 + rng.float() * 0.12})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy - 12);
    ctx.lineTo(cx + 6 + rng.float() * 2, cy + 12);
    ctx.stroke();
  });
}
