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
