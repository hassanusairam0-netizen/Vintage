import * as THREE from 'three';

// Procedural canvas textures. Everything is generated at load, so the site ships no image assets.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { repeat = [1, 1], srgb = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Small deterministic PRNG so every load produces the same textures.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tyreBump() {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 1024, 256);
  // Lathe uv: x runs around the tyre, y runs across the section (sidewall, tread, sidewall).
  // Sidewall rings
  for (let i = 0; i < 18; i++) {
    const y = 8 + i * 4;
    g.fillStyle = i % 3 === 0 ? '#909090' : '#7a7a7a';
    g.fillRect(0, y, 1024, 1);
    g.fillRect(0, 256 - y, 1024, 1);
  }
  // Tread: classic 1930s ribbed block pattern
  const top = 92, bot = 164;
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, top, 1024, bot - top);
  g.fillStyle = '#303030';
  const blocks = 96;
  for (let i = 0; i < blocks; i++) {
    const x = (i / blocks) * 1024;
    g.fillRect(x, top, 3, bot - top);
    const off = i % 2 ? 4 : -4;
    g.fillRect(x + 2, top + 22 + off, 1024 / blocks, 3);
    g.fillRect(x + 2, bot - 25 + off, 1024 / blocks, 3);
  }
  g.fillRect(0, (top + bot) / 2 - 2, 1024, 4);
  return toTexture(c);
}

export function grainBump(seed = 7, size = 512, scale = 1) {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  const r = rng(seed);
  // Multi-octave value noise: soft hide grain for leather, fine grain for castings.
  const grid = (n) => {
    const a = new Float32Array((n + 1) * (n + 1));
    for (let i = 0; i < a.length; i++) a[i] = r();
    for (let i = 0; i <= n; i++) {
      a[i * (n + 1) + n] = a[i * (n + 1)];
      a[n * (n + 1) + i] = a[i];
    }
    return a;
  };
  const octs = [8, 32, 96].map((n) => [n, grid(n)]);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 1, tot = 0;
      for (const [n, a] of octs) {
        const fx = (x / size) * n, fy = (y / size) * n;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = sm(fx - ix), ty = sm(fy - iy);
        const i00 = a[iy * (n + 1) + ix], i10 = a[iy * (n + 1) + ix + 1];
        const i01 = a[(iy + 1) * (n + 1) + ix], i11 = a[(iy + 1) * (n + 1) + ix + 1];
        v += amp * ((i00 * (1 - tx) + i10 * tx) * (1 - ty) + (i01 * (1 - tx) + i11 * tx) * ty);
        tot += amp;
        amp *= 0.55;
      }
      v /= tot;
      // creases
      v = Math.pow(v, 1.4 * scale);
      const p = (y * size + x) * 4;
      const b = Math.floor(v * 255);
      img.data[p] = img.data[p + 1] = img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}

export function walnut() {
  const [c, g] = canvas(1024, 512);
  const r = rng(42);
  g.fillStyle = '#4a2a14';
  g.fillRect(0, 0, 1024, 512);
  // Burr walnut: clusters of tight figure inside flowing grain
  for (let i = 0; i < 260; i++) {
    const y0 = r() * 512;
    g.strokeStyle = `rgba(${90 + r() * 70},${50 + r() * 30},${20 + r() * 15},${0.15 + r() * 0.3})`;
    g.lineWidth = 0.6 + r() * 2.4;
    g.beginPath();
    for (let x = 0; x <= 1024; x += 8) {
      const y = y0 + Math.sin(x * 0.006 + i) * 14 + Math.sin(x * 0.023 + i * 3) * 6;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const cx = r() * 1024, cy = r() * 512, rad = 6 + r() * 26;
    for (let k = 0; k < 6; k++) {
      g.strokeStyle = `rgba(${30 + r() * 40},${15 + r() * 15},${5},${0.25 + r() * 0.3})`;
      g.lineWidth = 0.8 + r();
      g.beginPath();
      g.ellipse(cx, cy, rad * (1 - k * 0.14), rad * (0.6 - k * 0.08), r() * 3, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const grd = g.createLinearGradient(0, 0, 1024, 512);
  grd.addColorStop(0, 'rgba(255,190,120,0.10)');
  grd.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 512);
  return toTexture(c, { srgb: true });
}

export function honeycomb() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#0c0c0c';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#6d6a63';
  g.lineWidth = 2;
  const s = 10, h = Math.sqrt(3) * s;
  for (let y = 0; y < 512 + h; y += h) {
    for (let x = 0, k = 0; x < 512 + s * 3; x += s * 1.5, k++) {
      const cy = y + (k % 2 ? h / 2 : 0);
      g.beginPath();
      for (let a = 0; a < 6; a++) {
        const px = x + s * Math.cos((a * Math.PI) / 3), py = cy + s * Math.sin((a * Math.PI) / 3);
        a ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.stroke();
    }
  }
  return toTexture(c, { srgb: true, repeat: [3, 4] });
}

// Diamond-weave stone guard; alpha channel cuts the holes.
export function meshAlpha() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  for (let i = -256; i < 512; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke();
    g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke();
  }
  return toTexture(c, { repeat: [5, 6], aniso: 8 });
}

export function gaugeFace(kind = 'speed') {
  const [c, g] = canvas(256, 256);
  const cx = 128, cy = 128;
  const grd = g.createRadialGradient(cx, cy, 10, cx, cy, 128);
  grd.addColorStop(0, '#f4ecd8');
  grd.addColorStop(1, '#d9ccb0');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#1b1712';
  g.fillStyle = '#1b1712';
  const marks = kind === 'speed' ? 12 : kind === 'rev' ? 10 : 6;
  const start = Math.PI * 0.75, span = Math.PI * 1.5;
  for (let i = 0; i <= marks * 5; i++) {
    const a = start + (span * i) / (marks * 5);
    const major = i % 5 === 0;
    g.lineWidth = major ? 3 : 1;
    const r0 = major ? 92 : 100;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * 110, cy + Math.sin(a) * 110);
    g.stroke();
    if (major) {
      g.font = '500 17px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const val = kind === 'speed' ? (i / 5) * 10 : kind === 'rev' ? i / 5 : ['0', '', '', '', '', '', 'F'][i / 5] ?? '';
      g.fillText(String(val), cx + Math.cos(a) * 74, cy + Math.sin(a) * 74);
    }
  }
  g.font = 'italic 14px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(kind === 'speed' ? 'M.P.H.' : kind === 'rev' ? 'R.P.M. × 1000' : kind === 'oil' ? 'OIL' : 'PETROL', cx, cy + 44);
  // needle
  const na = start + span * (kind === 'speed' ? 0.0 : 0.1);
  g.strokeStyle = '#8a1c12';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(na) * 96, cy + Math.sin(na) * 96);
  g.stroke();
  g.fillStyle = '#1b1712';
  g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
  return toTexture(c, { srgb: true, repeat: [1, 1] });
}

// Enamel radiator badge: a winged roundel with the coachbuilder's initial.
export function badge() {
  const [c, g] = canvas(512, 256);
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = '#c9a25a';
  for (let side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const y = 96 + i * 9;
      g.moveTo(256 + side * 60, y);
      g.lineTo(256 + side * (230 - i * 20), y - 6 + i * 2);
      g.lineTo(256 + side * (226 - i * 20), y + 5);
      g.lineTo(256 + side * 60, y + 8);
      g.fill();
    }
  }
  g.beginPath();
  g.arc(256, 128, 64, 0, Math.PI * 2);
  g.fillStyle = '#c9a25a';
  g.fill();
  g.beginPath();
  g.arc(256, 128, 54, 0, Math.PI * 2);
  g.fillStyle = '#123d29';
  g.fill();
  g.fillStyle = '#e9d9b0';
  g.font = '600 64px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('H', 256, 132);
  const t = toTexture(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function brushed(seed = 3) {
  const [c, g] = canvas(512, 64);
  const r = rng(seed);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 900; i++) {
    const y = r() * 64;
    g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.06)`;
    g.fillRect(0, y, 512, 0.6 + r());
  }
  return toTexture(c, { repeat: [2, 6] });
}
