// Builds the 3D level for a map: procedurally painted materials, sky, lighting and animated decor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { doorAngle } from '/shared/doors.js';
import { Batch } from './batch.js';

const rand = (a, b) => a + Math.random() * (b - a);

// Small seeded RNG so decor (paintings etc.) looks the same for every player.
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function canvasTexture(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(g, s, n, colors, maxAlpha, maxSize = 3) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = Math.random() * maxAlpha;
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * maxSize, 1 + Math.random() * maxSize);
  }
  g.globalAlpha = 1;
}

function lines(g, color, alpha, width, segs) {
  g.strokeStyle = color;
  g.globalAlpha = alpha;
  g.lineWidth = width;
  for (const [x1, y1, x2, y2] of segs) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  g.globalAlpha = 1;
}

// Running-bond blocks (sandstone, brick, stone).
const blocks = (base, light, dark, line, rows, cols, noise = 0.25) => (g, s) => {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  const rh = s / rows, cw = s / cols;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? cw / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      g.globalAlpha = rand(0.03, 0.14);
      g.fillStyle = Math.random() < 0.5 ? light : dark;
      g.fillRect(c * cw + off, r * rh, cw, rh);
    }
  }
  g.globalAlpha = 1;
  speckle(g, s, s * 20, [dark, light], noise);
  const segs = [];
  for (let r = 0; r <= rows; r++) {
    segs.push([0, r * rh, s, r * rh]);
    const off = r % 2 ? cw / 2 : 0;
    for (let c = 0; c <= cols; c++) segs.push([c * cw + off, r * rh, c * cw + off, (r + 1) * rh]);
  }
  lines(g, line, 0.4, Math.max(2, s / 128), segs);
};

const slabs = (base, light, dark, line, n) => (g, s) => {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  const w = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.globalAlpha = rand(0.04, 0.14);
    g.fillStyle = Math.random() < 0.5 ? light : dark;
    g.fillRect(i * w + 2, j * w + 2, w - 4, w - 4);
  }
  g.globalAlpha = 1;
  speckle(g, s, s * 28, [dark, light, base], 0.3);
  const segs = [];
  for (let i = 0; i <= n; i++) segs.push([i * w, 0, i * w, s], [0, i * w, s, i * w]);
  lines(g, line, 0.4, 3, segs);
};

const planks = (base, light, dark, n, vertical = false) => (g, s) => {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  const w = s / n;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = rand(0.06, 0.2);
    g.fillStyle = Math.random() < 0.5 ? light : dark;
    if (vertical) g.fillRect(i * w, 0, w, s); else g.fillRect(0, i * w, s, w);
    g.globalAlpha = 0.12;
    g.fillStyle = dark;
    for (let k = 0; k < 6; k++) {
      const p = i * w + Math.random() * w;
      if (vertical) g.fillRect(p, 0, 1, s); else g.fillRect(0, p, s, 1);
    }
  }
  g.globalAlpha = 1;
  speckle(g, s, s * 6, [dark, light], 0.2, 5);
  const segs = [];
  for (let i = 0; i <= n; i++) segs.push(vertical ? [i * w, 0, i * w, s] : [0, i * w, s, i * w]);
  lines(g, dark, 0.6, 2, segs);
};

const noiseTex = (base, colors, density, alpha, size = 4) => (g, s) => {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  speckle(g, s, s * density, colors, alpha, size);
};

const PAINTERS = {
  sand: { scale: 4, size: 512, draw: slabs('#bfa274', '#fff0cc', '#5e4a2c', '#5c4a30', 4) },
  wall: { scale: 2, size: 256, draw: blocks('#cdb083', '#fff4d8', '#6b5232', '#6b5232', 4, 2) },
  block: { scale: 2, size: 256, draw: blocks('#d9c194', '#fff4d8', '#7a5f3a', '#7a5f3a', 4, 2), color: 0xf2e6cc },
  crate: {
    scale: 1, size: 256, draw: (g, s) => {
      planks('#9a6b3c', '#c99a62', '#5a3a1a', 6)(g, s);
      lines(g, '#4a2e14', 1, 18, [[9, 9, s - 9, 9], [s - 9, 9, s - 9, s - 9], [s - 9, s - 9, 9, s - 9], [9, s - 9, 9, 9]]);
      lines(g, '#4a2e14', 1, 14, [[16, 16, s - 16, s - 16]]);
    },
  },
  grass: { scale: 3, size: 512, draw: noiseTex('#4f6b32', ['#3d5a26', '#6b8a3e', '#7a9a48', '#2e4a1c'], 60, 0.5, 3) },
  plaster: { scale: 2, size: 256, draw: noiseTex('#e8dfcf', ['#d2c6b0', '#f6efe2', '#c8baa0'], 14, 0.3, 4) },
  roof: { scale: 1.5, size: 256, draw: blocks('#5a3a30', '#7a4a3a', '#2a1a14', '#22140f', 8, 3, 0.2) },
  trim: { scale: 1, size: 128, draw: noiseTex('#f4efe6', ['#ddd5c8'], 10, 0.3) },
  marble: {
    scale: 2, size: 256, draw: (g, s) => {
      noiseTex('#ece8e2', ['#d8d2ca', '#ffffff'], 10, 0.3)(g, s);
      g.strokeStyle = '#a8a29a';
      for (let i = 0; i < 9; i++) {
        g.globalAlpha = rand(0.15, 0.4);
        g.lineWidth = rand(0.5, 2);
        g.beginPath();
        let x = Math.random() * s, y = 0;
        g.moveTo(x, y);
        while (y < s) { x += rand(-20, 20); y += rand(10, 30); g.lineTo(x, y); }
        g.stroke();
      }
      g.globalAlpha = 1;
    },
  },
  wood: { scale: 1, size: 256, draw: planks('#6a4326', '#8a5a34', '#3a2210', 5) },
  piano: { scale: 1, size: 64, draw: noiseTex('#141414', ['#2a2a2a'], 4, 0.4) },
  fabric: { scale: 0.5, size: 128, draw: noiseTex('#6a2a2a', ['#4a1a1a', '#8a3a3a'], 30, 0.4, 2) },
  shelf: {
    scale: 1.3, size: 256, draw: (g, s) => {
      g.fillStyle = '#4a2c16';
      g.fillRect(0, 0, s, s);
      const rows = 4, rh = s / rows;
      const colors = ['#7a2020', '#204a7a', '#2a6a2a', '#8a6a20', '#5a2a6a', '#3a3a3a', '#a0603a'];
      for (let r = 0; r < rows; r++) {
        let x = 6;
        while (x < s - 6) {
          const w = rand(5, 12), h = rh * rand(0.6, 0.85);
          g.fillStyle = colors[(Math.random() * colors.length) | 0];
          g.fillRect(x, r * rh + rh - h - 6, w - 1, h);
          x += w;
        }
        g.fillStyle = '#2e1a0c';
        g.fillRect(0, r * rh + rh - 6, s, 6);
      }
    },
  },
  stone: { scale: 2, size: 256, draw: blocks('#8a8680', '#b0aca4', '#5a5650', '#3a3632', 4, 3) },
  hedge: { scale: 1, size: 256, draw: noiseTex('#2e5a22', ['#1e4216', '#3e7a2e', '#4a8a36', '#16300f'], 80, 0.7, 5) },
  pooltile: { scale: 1, size: 256, draw: slabs('#4aa8d0', '#9ad8f0', '#2a7aa0', '#e8f4f8', 8) },
  brick: { scale: 1.5, size: 256, draw: blocks('#8a4a32', '#b0644a', '#5a2a1a', '#d0c0b0', 8, 4) },
  metal: { scale: 1, size: 128, draw: noiseTex('#5a6068', ['#4a5058', '#707880'], 20, 0.4) },
  parquet: {
    scale: 2, size: 256, draw: (g, s) => {
      const n = 8, w = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? '#7a4a28' : '#8a5a32';
        g.fillRect(i * w, j * w, w, w);
        g.globalAlpha = 0.15;
        g.fillStyle = '#3a2010';
        for (let k = 0; k < 4; k++) {
          if ((i + j) % 2) g.fillRect(i * w + Math.random() * w, j * w, 1, w); else g.fillRect(i * w, j * w + Math.random() * w, w, 1);
        }
        g.globalAlpha = 1;
      }
      lines(g, '#2a160a', 0.5, 1, Array.from({ length: n + 1 }, (_, i) => [[i * w, 0, i * w, s], [0, i * w, s, i * w]]).flat());
    },
  },
  carpet: {
    scale: 4, size: 256, draw: (g, s) => {
      g.fillStyle = '#7a1a1e';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#c8a040';
      g.lineWidth = 6;
      g.strokeRect(12, -10, s - 24, s + 20);
      speckle(g, s, 3000, ['#5a1014', '#9a2a2e'], 0.4, 2);
    },
  },
  gravel: { scale: 2, size: 256, draw: noiseTex('#b8ac98', ['#8a8070', '#d8ccb8', '#6a6050'], 60, 0.6, 3) },
  asphalt: {
    scale: 4, size: 256, draw: (g, s) => {
      noiseTex('#3a3a3c', ['#2a2a2c', '#4a4a4e', '#5a5a5e'], 60, 0.5, 2)(g, s);
      g.fillStyle = '#d8c060';
      g.globalAlpha = 0.7;
      g.fillRect(0, s / 2 - 3, s / 2, 6);
      g.globalAlpha = 1;
    },
  },
  deck: { scale: 2, size: 256, draw: planks('#b08a5a', '#d0aa7a', '#6a4a2a', 8, true) },
  sewer: {
    scale: 1.6, size: 256, draw: (g, s) => {
      blocks('#76766a', '#8e8e80', '#4e4e42', '#34342a', 8, 4, 0.3)(g, s);
      for (let i = 0; i < 10; i++) {
        const x = Math.random() * s, w = rand(6, 22);
        const grad = g.createLinearGradient(0, s * 0.4, 0, s);
        grad.addColorStop(0, 'rgba(60,80,40,0)');
        grad.addColorStop(1, 'rgba(60,80,40,0.5)');
        g.fillStyle = grad;
        g.fillRect(x, s * 0.4, w, s * 0.6);
      }
    },
  },
  // broken plaster and brick, inside a blown-out wall
  rubble: { scale: 1, size: 256, draw: noiseTex('#8a7f6c', ['#5e5548', '#a89a84', '#463f35', '#c4b8a2', '#6e4a3a'], 60, 0.55, 7) },
  concrete: { scale: 2, size: 256, draw: noiseTex('#8a8a80', ['#56564e', '#76766c', '#46463e', '#5a6050'], 30, 0.4, 3) },
  greybrick: { scale: 2.4, size: 256, draw: blocks('#9c9c98', '#c4c4c0', '#6c6c68', '#5c5c58', 6, 3, 0.2) },
  mansionstone: { scale: 2.4, size: 256, draw: blocks('#a69e88', '#c8c0a6', '#766e5c', '#6a6252', 9, 4, 0.22) },
  tanbrick: { scale: 1.6, size: 256, draw: blocks('#b89c68', '#d8bc88', '#806a40', '#7a6440', 8, 4, 0.2) },
  slate: { scale: 1.5, size: 256, draw: blocks('#44463f', '#5a5c54', '#2a2c26', '#22241f', 10, 4, 0.15) },
  paving: {
    scale: 2, size: 256, draw: (g, s) => {
      slabs('#d8d0b0', '#f4ecd0', '#a49c80', '#8a826a', 4)(g, s);
      speckle(g, s, 2500, ['#c8c0a0', '#fffae8'], 0.25, 2);
    },
  },
  grassdirt: {
    scale: 6, size: 512, draw: (g, s) => {
      noiseTex('#5e6a34', ['#4a5a28', '#728040', '#3e4c20', '#6a6a3a'], 50, 0.5, 3)(g, s);
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * s, y = Math.random() * s, r = rand(20, 70);
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(140,110,60,0.55)');
        grad.addColorStop(1, 'rgba(140,110,60,0)');
        g.fillStyle = grad;
        for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
      }
      speckle(g, s, 6000, ['#8a7a4a', '#3a4a1c', '#9a8a5a'], 0.4, 2);
    },
  },
  cobble: {
    // Irregular cobblestones (Dust II paths and A site)
    scale: 3.2, size: 512, draw: (g, s) => {
      g.fillStyle = '#8a7656';
      g.fillRect(0, 0, s, s);
      const n = 7, w = s / n;
      for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) {
        const cx = i * w + (j % 2 ? w / 2 : 0), cy = j * w + w / 2;
        const v = rand(145, 185) | 0;
        const pts = [];
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2 + rand(-0.25, 0.25), r = w * rand(0.38, 0.5);
          pts.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        for (const dx of [0, -s, s]) for (const dy of [0, -s, s]) {
          g.fillStyle = 'rgb(' + v + ',' + ((v * 0.88) | 0) + ',' + ((v * 0.68) | 0) + ')';
          g.beginPath();
          pts.forEach(([x, y], k) => (k ? g.lineTo : g.moveTo).call(g, cx + dx + x, cy + dy + y));
          g.closePath();
          g.fill();
          g.globalAlpha = 0.12;
          g.fillStyle = '#fff4dc';
          g.beginPath();
          g.arc(cx + dx - w * 0.1, cy + dy - w * 0.12, w * 0.22, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
        }
      }
      speckle(g, s, 14000, ['#5a4a34', '#d8c8a0', '#8a7a5a'], 0.35, 2);
    },
  },
  dustsand: {
    // Packed desert sand with darker patches and grit
    scale: 6, size: 512, draw: (g, s) => {
      g.fillStyle = '#c8a46c';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * s, y = Math.random() * s, r = rand(30, 110);
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const c = Math.random() < 0.5 ? '150,115,70' : '235,205,150';
        grad.addColorStop(0, 'rgba(' + c + ',0.35)');
        grad.addColorStop(1, 'rgba(' + c + ',0)');
        g.fillStyle = grad;
        for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
      }
      speckle(g, s, 30000, ['#9a7a4a', '#ecd2a0', '#b08a58', '#7a5e3a'], 0.45, 2);
    },
  },
  ammobox: {
    // Green military crate with a hazard stripe
    scale: 1, size: 256, draw: (g, s) => {
      g.fillStyle = '#6a8a64';
      g.fillRect(0, 0, s, s);
      speckle(g, s, 3000, ['#4e6e4a', '#8aa882'], 0.35, 3);
      lines(g, '#3a5236', 0.8, 6, [[0, s * 0.33, s, s * 0.33], [0, s * 0.66, s, s * 0.66], [8, 0, 8, s], [s - 8, 0, s - 8, s]]);
      g.fillStyle = '#e0b81a';
      for (let x = -s; x < s * 2; x += 28) {
        g.beginPath();
        g.moveTo(x, s * 0.86); g.lineTo(x + 14, s * 0.86); g.lineTo(x + 26, s); g.lineTo(x + 12, s);
        g.fill();
      }
      g.fillStyle = 'rgba(20,20,20,0.85)';
      g.fillRect(0, s * 0.84, s, 3);
    },
  },
  rock: {
    scale: 3, size: 256, draw: (g, s) => {
      noiseTex('#9a6a48', ['#7a4a30', '#b88a62', '#6a3e28', '#c49a70'], 40, 0.5, 6)(g, s);
      g.strokeStyle = '#4a2a18';
      for (let i = 0; i < 14; i++) {
        g.globalAlpha = rand(0.2, 0.5);
        g.lineWidth = rand(1, 3);
        g.beginPath();
        let x = Math.random() * s, y = Math.random() * s;
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += rand(-40, 40); y += rand(-10, 30); g.lineTo(x, y); }
        g.stroke();
      }
      g.globalAlpha = 1;
    },
  },
  dusttrim: {
    // Carved sandstone frieze under the roofline
    scale: 1, size: 256, draw: (g, s) => {
      g.fillStyle = '#c8a878';
      g.fillRect(0, 0, s, s);
      speckle(g, s, 4000, ['#8a6a44', '#ecd4a8'], 0.3, 3);
      lines(g, '#6a5032', 0.7, 6, [[0, 8, s, 8], [0, s - 8, s, s - 8]]);
      g.strokeStyle = '#6a5032';
      g.lineWidth = 5;
      g.globalAlpha = 0.6;
      for (let x = 0; x < s; x += s / 4) {
        g.beginPath();
        g.arc(x + s / 8, s / 2, s / 10, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    },
  },

  // ---- cs_mansion: painted after the original textures. "native" ones are laid out exactly like the
  // GoldSrc texture they replace (its UVs come straight from the map), the canvas top row being the top.
  mplaster: { scale: 2, size: 256, native: true, draw: noiseTex('#e2d6b4', ['#cbbd96', '#f2e8ca', '#d6c8a2', '#bfb08a'], 26, 0.32, 5) },
  mwall: {
    // Beige plaster above a varnished wood wainscot (rows 0.5-0.77 of the texture sit on the floor line)
    scale: 3.25, size: 256, native: true, draw: (g, s) => {
      noiseTex('#e2d6b4', ['#cbbd96', '#f2e8ca', '#d6c8a2', '#bfb08a'], 26, 0.32, 5)(g, s);
      const top = s * 0.505, bot = s * 0.77;
      const grad = g.createLinearGradient(0, top, 0, bot);
      grad.addColorStop(0, '#a8642c');
      grad.addColorStop(1, '#8a4e20');
      g.fillStyle = grad;
      g.fillRect(0, top, s, bot - top);
      g.globalAlpha = 0.16;
      g.fillStyle = '#4a2408';
      for (let i = 0; i < 90; i++) g.fillRect(Math.random() * s, top, 1, bot - top);
      g.globalAlpha = 1;
      lines(g, '#5a300e', 0.55, 2, [0, 1, 2, 3].map(i => [i * s / 4 + 2, top + 10, i * s / 4 + 2, bot - 8]));
      g.fillStyle = '#6a3a14';
      g.fillRect(0, top - 3, s, 9);
      g.fillStyle = '#c88a50';
      g.fillRect(0, top - 3, s, 2);
      g.fillStyle = '#4a2a10';
      g.fillRect(0, bot - 7, s, 7);
    },
  },
  mfloor: {
    // Beige basket-weave parquet
    scale: 1.63, size: 256, native: true, draw: (g, s) => {
      const n = 4, w = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v = rand(-8, 8);
        g.fillStyle = `rgb(${178 + v},${156 + v},${116 + v})`;
        g.fillRect(i * w, j * w, w, w);
        g.globalAlpha = 0.22;
        g.fillStyle = '#6a5434';
        for (let k = 1; k < 4; k++) {
          if ((i + j) % 2) g.fillRect(i * w + (k * w) / 4, j * w, 1.5, w); else g.fillRect(i * w, j * w + (k * w) / 4, w, 1.5);
        }
        g.globalAlpha = 1;
      }
      speckle(g, s, 5000, ['#8a7650', '#d8c8a0', '#6a5638'], 0.25, 2);
      lines(g, '#5a4628', 0.7, 2, Array.from({ length: n + 1 }, (_, i) => [[i * w, 0, i * w, s], [0, i * w, s, i * w]]).flat());
    },
  },
  checker: {
    scale: 1.63, size: 256, native: true, draw: (g, s) => {
      const n = 4, w = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#1c1c1c' : '#ece8de'; g.fillRect(i * w, j * w, w, w); }
      speckle(g, s, 3000, ['#888', '#fff', '#444'], 0.18, 2);
    },
  },
  ceiltile: {
    scale: 1.22, size: 256, native: true, draw: (g, s) => {
      noiseTex('#f2eee2', ['#dcd6c6', '#ffffff', '#e6e0d0'], 20, 0.4, 2)(g, s);
      lines(g, '#a8a090', 0.8, 4, [[0, 0, s, 0], [0, s / 2, s, s / 2], [0, 0, 0, s], [s / 2, 0, s / 2, s]]);
    },
  },
  mblock: {
    // Pale concrete blocks of the mansion's outer walls
    scale: 2.44, size: 256, native: true, draw: blocks('#c6bfae', '#e2dccb', '#958d7a', '#857d6a', 5, 3, 0.2),
  },
  door1: {
    scale: 1.63, size: 256, native: true, draw: (g, s) => {
      planks('#5e3418', '#7a4a26', '#2e180a', 6, true)(g, s);
      g.strokeStyle = '#4a2810';
      g.lineWidth = 6;
      for (const [x, y, w, h] of [[0.14, 0.08, 0.32, 0.38], [0.54, 0.08, 0.32, 0.38], [0.14, 0.54, 0.32, 0.38], [0.54, 0.54, 0.32, 0.38]]) g.strokeRect(x * s, y * s, w * s, h * s);
      g.fillStyle = '#d8b040';
      g.beginPath(); g.arc(s * 0.9, s * 0.5, 7, 0, Math.PI * 2); g.fill();
    },
  },
  books: {
    scale: 1, size: 256, native: true, draw: (g, s) => {
      g.fillStyle = '#5a3418';
      g.fillRect(0, 0, s, s);
      const rows = 3, rh = s / rows;
      const colors = ['#7a2020', '#204a7a', '#2a6a2a', '#8a6a20', '#5a2a6a', '#1a6a6a', '#a0603a', '#d8d0b0'];
      for (let r = 0; r < rows; r++) {
        let x = 4;
        while (x < s - 4) {
          const w = rand(6, 14), h = rh * rand(0.65, 0.9);
          g.fillStyle = colors[(Math.random() * colors.length) | 0];
          g.fillRect(x, r * rh + rh - h - 8, w - 1, h);
          x += w;
        }
        g.fillStyle = '#3a200c';
        g.fillRect(0, r * rh + rh - 8, s, 8);
      }
    },
  },
  cabinet: {
    scale: 0.8, size: 128, native: true, draw: (g, s) => {
      noiseTex('#8a9488', ['#7a8478', '#a0aa9c'], 20, 0.3, 2)(g, s);
      lines(g, '#4a5248', 0.9, 3, [[4, 4, s - 4, 4], [4, s / 2, s - 4, s / 2], [4, s - 4, s - 4, s - 4], [4, 4, 4, s - 4], [s - 4, 4, s - 4, s - 4]]);
      g.fillStyle = '#d8dcd4';
      for (const y of [s / 4, (3 * s) / 4]) g.fillRect(s * 0.35, y - 4, s * 0.3, 8);
    },
  },
  picture: {
    scale: 3.25, size: 256, native: true, draw: (g, s) => {
      g.fillStyle = '#b08a2a';
      g.fillRect(0, 0, s, s);
      const grad = g.createLinearGradient(0, 14, 0, s - 14);
      grad.addColorStop(0, '#6a9ad0');
      grad.addColorStop(0.6, '#c8dcea');
      grad.addColorStop(0.61, '#4a7a34');
      grad.addColorStop(1, '#2e5a22');
      g.fillStyle = grad;
      g.fillRect(14, 14, s - 28, s - 28);
      g.fillStyle = '#f4f2ea';
      g.fillRect(s * 0.25, s * 0.42, s * 0.5, s * 0.2);
      g.fillRect(s * 0.42, s * 0.34, s * 0.16, s * 0.1);
      g.fillStyle = '#c8c4b8';
      for (let i = 0; i < 8; i++) g.fillRect(s * 0.27 + i * s * 0.06, s * 0.45, 4, s * 0.15);
    },
  },
  black: { scale: 1, size: 32, draw: noiseTex('#111111', ['#1c1c1c'], 2, 0.3) },
  // ---- de_dust2
  d2plaster: { scale: 3, size: 256, draw: noiseTex('#d6be8e', ['#c4aa78', '#e4d0a4', '#b89c6a'], 30, 0.3, 5) },
  d2door: {
    // Sandstone surround with a big arched wooden double door (laid out like SandWllDoor)
    scale: 4.9, size: 256, native: true, draw: (g, s) => {
      blocks('#cdb083', '#fff4d8', '#6b5232', '#6b5232', 6, 4)(g, s);
      const x0 = s * 0.14, x1 = s * 0.86, top = s * 0.2, r = (x1 - x0) / 2;
      g.fillStyle = '#5a3418';
      g.beginPath();
      g.moveTo(x0, s);
      g.lineTo(x0, top + r);
      g.arc((x0 + x1) / 2, top + r, r, Math.PI, 0);
      g.lineTo(x1, s);
      g.closePath();
      g.fill();
      g.strokeStyle = '#8a6a44';
      g.lineWidth = 8;
      g.stroke();
      g.save();
      g.clip();
      planks('#6a3e1c', '#84522a', '#3a200c', 10, true)(g, s);
      g.restore();
      g.fillStyle = '#2a1608';
      g.fillRect(s / 2 - 3, top + r * 0.4, 6, s);
      g.fillStyle = '#3a3a3a';
      for (const y of [0.45, 0.8]) for (const x of [x0 + 6, x1 - 30]) g.fillRect(x, s * y, 24, 7);
    },
  },
  cardboard: {
    scale: 0.8, size: 128, native: true, draw: (g, s) => {
      noiseTex('#b08a58', ['#9a764a', '#c49c68'], 20, 0.3, 2)(g, s);
      g.fillStyle = '#d8c8a0';
      g.fillRect(0, s / 2 - 6, s, 12);
    },
  },
};

const texCache = new Map();

// The original texture of a converted level, as a PNG ("img:<url>"). See-through ones ("{" textures) are cut out.
const imgLoader = new THREE.TextureLoader();
function imageMaterial(url) {
  if (texCache.has(url)) return texCache.get(url);
  const t = imgLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const clear = /\/_7b/.test(url);
  // No mipmaps for see-through textures: averaged alpha would turn distant fences into solid sheets.
  if (clear) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  const mat = new THREE.MeshLambertMaterial({ map: t, vertexColors: true, alphaTest: clear ? 0.5 : 0, side: clear ? THREE.DoubleSide : THREE.FrontSide });
  const entry = { mat, scale: 1 };
  texCache.set(url, entry);
  return entry;
}
function material(kind) {
  if (texCache.has(kind)) return texCache.get(kind);
  const p = PAINTERS[kind] || PAINTERS.block;
  const mat = new THREE.MeshLambertMaterial({ map: canvasTexture(p.size, p.draw), vertexColors: true });
  if (p.color) mat.color.setHex(p.color);
  const entry = { mat, scale: p.scale };
  texCache.set(kind, entry);
  return entry;
}

// Box with world-aligned UVs and baked "ambient occlusion" darkening toward the ground.
function boxGeometry(b, scale, floorShade) {
  const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const colors = new Float32Array(pos.count * 3);
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      if (f < 2) uv.setXY(k, z / scale, y / scale);
      else if (f < 4) uv.setXY(k, x / scale, z / scale);
      else uv.setXY(k, x / scale, y / scale);
      let shade = 1;
      if (!floorShade && f !== 2) shade = 0.62 + 0.38 * Math.min(1, Math.max(0, y) / 2.8);
      if (f === 3) shade = 0.55;
      colors.set([shade, shade, shade], k * 3);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// Polygons converted from a GoldSrc level, merged per material. UVs keep the original texture layout;
// they are rescaled to the painter's tile size unless the painter was drawn to match that texture.
function buildFaces(map, q, group) {
  const byMat = {};
  for (const [tex, polys] of Object.entries(map.staticFaces || map.faces)) {
    const key = map.faceMats[tex];
    if (!key) continue;
    const p = key.startsWith('img:') ? { native: true } : PAINTERS[key] || PAINTERS.block;
    const [tw, th] = map.faceTex[tex] || [64, 64];
    const su = p.native ? 1 : (tw * 0.0254) / p.scale, sv = p.native ? 1 : (th * 0.0254) / p.scale;
    const out = (byMat[key] ||= { pos: [], uv: [] });
    for (const f of polys) {
      const n = f.length / 5;
      for (let i = 1; i < n - 1; i++) {
        for (const k of [0, i, i + 1]) {
          out.pos.push(f[k * 5], f[k * 5 + 1], f[k * 5 + 2]);
          out.uv.push(f[k * 5 + 3] * su, f[k * 5 + 4] * sv);
        }
      }
    }
  }
  for (const [key, { pos, uv }] of Object.entries(byMat)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    // Ceilings a touch darker, like the baked light of the original.
    const nrm = g.attributes.normal, col = new Float32Array(nrm.count * 3);
    for (let i = 0; i < nrm.count; i++) col.fill(nrm.getY(i) < -0.5 ? 0.82 : 1, i * 3, i * 3 + 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const obj = new THREE.Mesh(g, key.startsWith('img:') ? imageMaterial(key.slice(4)).mat : material(key).mat);
    obj.receiveShadow = q.shadows;
    obj.castShadow = q.shadows;
    group.add(obj);
  }
}

// Decor that's only meshes (no lights, sprites or particles) can be merged.
function staticOnly(obj) {
  let ok = true;
  obj.traverse(o => { if (o.isLight || o.isSprite || o.isPoints || o.isLine || o.isInstancedMesh || (o.isMesh && Array.isArray(o.material))) ok = false; });
  return ok;
}

// Breakable walls and furniture (map.breakables, cs_mansion; see shared/maps/breakables.js). Each chunk draws its
// slices of the level's faces and a core of rubble just inside it (seen through the hole once a neighbour is gone);
// caps of rubble appear where a broken chunk leaves a gap in a floor or ceiling. Breaking a chunk collapses its
// triangles, mending restores them.
function buildBreakables(map, q, group) {
  const parts = new Map(); // material key -> { pos, uv, shade }
  const ranges = map.breakables.map(() => ({ live: [], dead: [], edges: [] }));
  const edgesOf = map.breakables.map(() => []); // id -> the pieces with an edge against it
  const part = key => {
    if (!parts.has(key)) parts.set(key, { pos: [], uv: [], shade: [] });
    return parts.get(key);
  };
  const put = (key, list, verts, shade) => {
    const o = part(key), start = o.pos.length / 3;
    for (const [x, y, z, u, v] of verts) { o.pos.push(x, y, z); o.uv.push(u, v); o.shade.push(shade); }
    list.push([key, start, o.pos.length / 3]);
  };
  // a quad on the plane pos[axis] = at, facing sign along axis, over [u0, u1] x [v0, v1] of the other two axes
  const AX = [[1, 2], [2, 0], [0, 1]];
  const quad = (axis, sign, at, lo, hi) => {
    const [a, b] = AX[axis], c = [[lo[a], lo[b]], [hi[a], lo[b]], [hi[a], hi[b]], [lo[a], hi[b]]];
    if (sign < 0) c.reverse();
    const pts = c.map(([p, s]) => { const v = [0, 0, 0]; v[axis] = at; v[a] = p; v[b] = s; return [...v, p, s]; });
    return [pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]];
  };
  for (const pc of map.breakables) {
    const r = ranges[pc.id];
    for (const [tex, polys] of Object.entries(map.pieceFaces[pc.id] || {})) {
      const key = map.faceMats[tex];
      if (!key) continue;
      const p = key.startsWith('img:') ? { native: true } : PAINTERS[key] || PAINTERS.block;
      const [tw, th] = map.faceTex[tex] || [64, 64];
      const su = p.native ? 1 : (tw * 0.0254) / p.scale, sv = p.native ? 1 : (th * 0.0254) / p.scale;
      const verts = [];
      for (const f of polys) {
        const n = f.length / 5;
        for (let i = 1; i < n - 1; i++) for (const k of [0, i, i + 1]) verts.push([f[k * 5], f[k * 5 + 1], f[k * 5 + 2], f[k * 5 + 3] * su, f[k * 5 + 4] * sv]);
      }
      put(key, r.live, verts, 1);
    }
    if (pc.kind !== 'roof') {
      const lo = pc.min.map(v => v + 0.012), hi = pc.max.map(v => v - 0.012), core = [];
      for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) core.push(...quad(axis, sign, sign > 0 ? hi[axis] : lo[axis], lo, hi));
      put('rubble', r.live, core, 0.8);
    }
    const caps = [], edges = new Map();
    for (const [axis, sign, lo, hi, nb] of pc.caps) {
      const q = quad(axis, sign, lo[axis] + sign * 0.004, lo, hi);
      if (nb == null) caps.push(...q);
      else (edges.get(nb) || edges.set(nb, []).get(nb)).push(...q);
    }
    if (caps.length) put('rubble', r.dead, caps, 0.7);
    for (const [nb, verts] of edges) {
      const e = { nb, list: [], on: false };
      put('rubble', e.list, verts, 0.7);
      r.edges.push(e);
      edgesOf[nb].push(pc.id);
    }
  }
  const geos = new Map();
  for (const [key, { pos, uv, shade }] of parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const col = new Float32Array(shade.length * 3);
    const nrm = g.attributes.normal;
    for (let i = 0; i < shade.length; i++) col.fill(shade[i] * (nrm.getY(i) < -0.5 ? 0.82 : 1), i * 3, i * 3 + 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const obj = new THREE.Mesh(g, key.startsWith('img:') ? imageMaterial(key.slice(4)).mat : material(key).mat);
    obj.receiveShadow = q.shadows;
    obj.castShadow = q.shadows;
    group.add(obj);
    geos.set(key, { g, orig: Float32Array.from(pos) });
  }
  const show = (list, on) => {
    for (const [key, a, b] of list) {
      const { g, orig } = geos.get(key), arr = g.attributes.position.array;
      if (on) arr.set(orig.subarray(a * 3, b * 3), a * 3);
      else arr.fill(0, a * 3, b * 3);
      // only the changed part goes to the graphics card (the whole wall mesh is megabytes)
      g.attributes.position.addUpdateRange(a * 3, (b - a) * 3);
      g.attributes.position.needsUpdate = true;
    }
  };
  const gone = new Set();
  for (const r of ranges) { show(r.dead, false); for (const e of r.edges) show(e.list, false); }
  return function setBroken(ids) {
    const now = new Set(ids), touched = new Set();
    for (const pc of map.breakables) {
      const was = gone.has(pc.id), is = now.has(pc.id);
      if (was === is) continue;
      show(ranges[pc.id].live, !is);
      show(ranges[pc.id].dead, is);
      if (is) gone.add(pc.id); else gone.delete(pc.id);
      touched.add(pc.id);
      for (const o of edgesOf[pc.id]) touched.add(o);
    }
    // the sides of a hole in the roof: where this column is gone and its neighbour isn't
    for (const id of touched) {
      for (const e of ranges[id].edges) {
        const on = gone.has(id) && !gone.has(e.nb);
        if (on !== e.on) { show(e.list, on); e.on = on; }
      }
    }
  };
}

// ---------------------------------------------------------------- sky

function createSky(theme) {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) },
      horizon: { value: new THREE.Color(theme.skyHorizon) },
      sunDir: { value: new THREE.Vector3(...theme.sun.dir).normalize() },
      sunColor: { value: new THREE.Color(theme.sun.color) },
    },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.35);
        if (vDir.y < 0.0) col = mix(horizon, horizon * 0.7, clamp(-vDir.y * 4.0, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

function createClouds(amount) {
  const tex = canvasTexture(512, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 70 * amount + 10; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = rand(18, 60);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) { g.save(); g.translate(dx, dy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
    }
  });
  tex.repeat.set(2, 2);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
  m.rotation.x = Math.PI / 2;
  m.position.y = 110;
  m.renderOrder = -1;
  return m;
}

// ---------------------------------------------------------------- decor

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
};

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  glowTex = canvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,230,180,0.6)');
    grad.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }, false);
  return glowTex;
}
const glow = (color, size) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
};

function palm(s) {
  const g = new THREE.Group();
  const trunkMat = lam(0x8a6a42);
  let x = 0, y = 0;
  const lean = rand(-0.15, 0.15);
  for (let i = 0; i < 6; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.16 - i * 0.012, 0.2 - i * 0.012, 0.75, 7), trunkMat, x, y + 0.37, 0);
    seg.rotation.z = lean * i * 0.4;
    g.add(seg);
    x += Math.sin(-lean * i * 0.4) * 0.75;
    y += 0.72;
  }
  const crown = new THREE.Group();
  crown.position.set(x, y, 0);
  const leafMat = lam(0x3f7a2a, { side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Group();
    const blade = mesh(new THREE.PlaneGeometry(0.5, 2.6, 1, 4), leafMat, 0, 1.2, 0);
    const pos = blade.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, -Math.pow((pos.getY(k) + 1.3) / 2.6, 2) * 0.9);
    blade.geometry.computeVertexNormals();
    leaf.add(blade);
    leaf.rotation.set(rand(0.9, 1.4), (i / 9) * Math.PI * 2, 0, 'YXZ');
    crown.add(leaf);
  }
  g.add(crown);
  g.scale.setScalar(s);
  g.userData.sway = crown;
  return g;
}

function oak(s) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 3, 7), lam(0x5a3e26), 0, 1.5, 0));
  const leaves = new THREE.Group();
  const mat = lam(0x3a6a2a, { flatShading: true });
  for (let i = 0; i < 5; i++) {
    const r = rand(1.2, 1.8);
    leaves.add(mesh(new THREE.IcosahedronGeometry(r, 0), mat, rand(-1, 1), 3.4 + rand(-0.3, 0.9), rand(-1, 1)));
  }
  g.add(leaves);
  g.scale.setScalar(s);
  g.userData.sway = leaves;
  return g;
}

function cypress(s) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), lam(0x4a3420), 0, 0.5, 0));
  const top = mesh(new THREE.ConeGeometry(0.9, 5, 8), lam(0x24481e, { flatShading: true }), 0, 3.4, 0);
  g.add(top);
  g.scale.setScalar(s);
  g.userData.sway = top;
  return g;
}

export function createCarModel(color) {
  const g = new THREE.Group();
  const body = lam(new THREE.Color(color).getHex());
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.7, 4.3), body, 0, 0.6, 0));
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), new THREE.MeshLambertMaterial({ color: 0x1a2430 }), 0, 1.2, 0.2));
  g.add(mesh(new THREE.BoxGeometry(1.62, 0.08, 2.0), body, 0, 1.52, 0.2));
  const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12);
  wheel.rotateZ(Math.PI / 2);
  const wmat = lam(0x161616);
  const spins = [], steers = [];
  for (const [x, z] of [[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.4], [0.85, 1.4]]) {
    const steer = new THREE.Group();
    steer.position.set(x, 0.34, z);
    const spin = mesh(wheel, wmat);
    spin.add(mesh(new THREE.BoxGeometry(0.23, 0.08, 0.5), lam(0x5a5a5a), 0, 0, 0, false));
    steer.add(spin);
    g.add(steer);
    spins.push(spin);
    if (z < 0) steers.push(steer);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
  for (const x of [-0.6, 0.6]) {
    g.add(mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), lightMat, x, 0.7, -2.16, false));
    g.add(mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xa01818 }), x, 0.72, 2.16, false));
  }
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), lam(0x111111), -0.42, 1.0, -0.55, false));
  g.userData = { spins, steers, roll: 0 };
  return g;
}

// Pickup truck: cab in front, open bed behind with a PKT machine gun on a post.
export function createPickupModel(color) {
  const g = new THREE.Group();
  const body = lam(new THREE.Color(color).getHex());
  const dark = lam(0x1a1c1e);
  g.add(mesh(new THREE.BoxGeometry(1.86, 0.62, 4.7), body, 0, 0.62, 0));                  // chassis
  g.add(mesh(new THREE.BoxGeometry(1.72, 0.62, 1.55), new THREE.MeshLambertMaterial({ color: 0x1a2430 }), 0, 1.24, -0.75)); // cab windows
  g.add(mesh(new THREE.BoxGeometry(1.76, 0.08, 1.5), body, 0, 1.58, -0.75));                // cab roof
  g.add(mesh(new THREE.BoxGeometry(1.86, 0.3, 0.6), body, 0, 0.95, -1.95));                 // bonnet
  for (const x of [-0.9, 0.9]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.38, 2.1), body, x, 1.12, 1.25)); // bed sides
  g.add(mesh(new THREE.BoxGeometry(1.86, 0.38, 0.08), body, 0, 1.12, 2.3));                 // tailgate
  g.add(mesh(new THREE.BoxGeometry(1.7, 0.04, 2.1), dark, 0, 0.94, 1.25));                  // bed floor
  // gun post and the PKT on top (the gunner holds it)
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.0, 8), dark, 0, 1.45, 0.45));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.2), dark, 0, 1.95, 0.45));
  const wheel = new THREE.CylinderGeometry(0.38, 0.38, 0.26, 12);
  wheel.rotateZ(Math.PI / 2);
  const wmat = lam(0x161616);
  const spins = [], steers = [];
  for (const [x, z] of [[-0.88, -1.55], [0.88, -1.55], [-0.88, 1.5], [0.88, 1.5]]) {
    const steer = new THREE.Group();
    steer.position.set(x, 0.38, z);
    const spin = mesh(wheel, wmat);
    spin.add(mesh(new THREE.BoxGeometry(0.27, 0.08, 0.55), lam(0x5a5a5a), 0, 0, 0, false));
    steer.add(spin);
    g.add(steer);
    spins.push(spin);
    if (z < 0) steers.push(steer);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
  for (const x of [-0.62, 0.62]) {
    g.add(mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), lightMat, x, 0.82, -2.36, false));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xa01818 }), x, 0.9, 2.36, false));
  }
  g.userData = { spins, steers, roll: 0 };
  return g;
}

// Spin wheels by distance driven and turn the front ones.
export function animateCar(model, speed, steer, dt) {
  const u = model.userData;
  u.roll += (speed * dt) / 0.34;
  for (const w of u.spins) w.rotation.x = -u.roll;
  for (const s of u.steers) s.rotation.y = -steer;
}

const car = createCarModel;

function flag(colors, h) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, h + 1.5, 6), lam(0xcccccc), 0, -(h + 1.5) / 2 + 0.3, 0));
  const tex = canvasTexture(128, (c, s) => {
    colors.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, (i * s) / colors.length, s, s / colors.length); });
  }, false);
  const geo = new THREE.PlaneGeometry(2, 1.2, 16, 6);
  geo.translate(1, -0.6, 0);
  const cloth = mesh(geo, lam(0xffffff, { map: tex, side: THREE.DoubleSide }), 0.05, 0.3, 0);
  g.add(cloth);
  const base = geo.attributes.position.array.slice();
  g.userData.anim = (t) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.setZ(i, Math.sin(x * 2.4 - t * 4) * 0.15 * x + Math.sin(x * 5 - t * 7) * 0.03 * x);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return g;
}

function painting(w, h, seed) {
  const r = rng(seed);
  const tex = canvasTexture(256, (g, s) => {
    const hues = [r() * 360, r() * 360];
    const grad = g.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, `hsl(${hues[0]},40%,35%)`);
    grad.addColorStop(1, `hsl(${hues[1]},50%,20%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    g.fillStyle = `hsl(${hues[0] + 40},30%,60%)`;
    g.beginPath(); g.ellipse(s * (0.3 + r() * 0.4), s * 0.4, s * 0.15, s * 0.12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(20,30,20,0.6)';
    g.fillRect(0, s * 0.7, s, s * 0.3);
  }, false);
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.06), lam(0xa07a30), 0, 0, 0, false));
  g.add(mesh(new THREE.PlaneGeometry(w, h), lam(0xffffff, { map: tex }), 0, 0, 0.035, false));
  return g;
}

function windowPane(w, h) {
  const tex = canvasTexture(128, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#ffd890');
    grad.addColorStop(1, '#e09848');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#3a2a1a';
    g.fillRect(s / 2 - 3, 0, 6, s);
    g.fillRect(0, s / 2 - 3, s, 6);
    g.lineWidth = 10;
    g.strokeStyle = '#f4efe6';
    g.strokeRect(0, 0, s, s);
  }, false);
  return mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), 0, 0, 0, false);
}

function buildDecor(d, ctx) {
  const { group, animated, lights, quality } = ctx;
  let obj = null;
  switch (d.type) {
    case 'tree': {
      obj = d.kind === 'oak' ? oak(d.s) : d.kind === 'cypress' ? cypress(d.s) : palm(d.s);
      obj.position.set(...d.p);
      obj.rotation.y = Math.random() * Math.PI * 2;
      const sway = obj.userData.sway, phase = Math.random() * 10;
      animated.push(t => { sway.rotation.z = Math.sin(t * 0.9 + phase) * 0.035; sway.rotation.x = Math.sin(t * 0.7 + phase * 2) * 0.025; });
      break;
    }
    case 'car':
      obj = car(d.color);
      obj.position.set(...d.p);
      obj.rotation.y = d.rot;
      break;
    case 'water': {
      const w = d.max[0] - d.min[0], h = d.max[1] - d.min[1];
      const tex = canvasTexture(256, (g, s) => {
        g.fillStyle = d.color;
        g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 2;
        for (let i = 0; i < 40; i++) {
          const x = Math.random() * s, y = Math.random() * s;
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 12, y + rand(-6, 6), x + 24, y); g.stroke();
        }
      });
      tex.repeat.set(w / 3, h / 3);
      const mat = new THREE.MeshPhongMaterial({ map: tex, transparent: true, opacity: d.murky ? 0.92 : 0.82, shininess: 90, specular: d.murky ? 0x445544 : 0x88aacc, depthWrite: false });
      obj = mesh(new THREE.PlaneGeometry(w, h), mat, (d.min[0] + d.max[0]) / 2, d.y, (d.min[1] + d.max[1]) / 2, false);
      obj.rotation.x = -Math.PI / 2;
      obj.receiveShadow = true;
      animated.push((t, dt) => { tex.offset.x += dt * 0.03; tex.offset.y = Math.sin(t * 0.4) * 0.05; });
      break;
    }
    case 'plane': {
      const w = d.max[0] - d.min[0], h = d.max[1] - d.min[1];
      const base = material(d.mat);
      const tex = base.mat.map.clone();
      tex.needsUpdate = true;
      tex.repeat.set(w / base.scale, h / base.scale);
      obj = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1 }), (d.min[0] + d.max[0]) / 2, d.y, (d.min[1] + d.max[1]) / 2, false);
      obj.rotation.x = -Math.PI / 2;
      obj.receiveShadow = true;
      break;
    }
    case 'lamp': {
      obj = new THREE.Group();
      obj.position.set(...d.p);
      obj.add(mesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), lam(0x2a2a2a), 0, 0, 0, false));
      const bulb = glow(0xffd28a, 1.6);
      obj.add(bulb);
      const ph = Math.random() * 10;
      animated.push(t => { const f = 1.5 + Math.sin(t * 11 + ph) * 0.05 + Math.sin(t * 23 + ph) * 0.04; bulb.scale.set(f, f, 1); });
      break;
    }
    case 'post': {
      obj = new THREE.Group();
      obj.position.set(...d.p);
      obj.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, d.h, 6), lam(0x222222), 0, d.h / 2, 0));
      obj.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), 0, d.h + 0.1, 0, false));
      const g = glow(0xffd8a0, 2.2);
      g.position.y = d.h + 0.1;
      obj.add(g);
      break;
    }
    case 'flag':
      obj = flag(d.colors, d.h);
      obj.position.set(...d.p);
      animated.push(obj.userData.anim);
      break;
    case 'awning': {
      const tex = canvasTexture(64, (g, s) => {
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2eee4' : d.color; g.fillRect((i * s) / 8, 0, s / 8, s); }
      });
      obj = mesh(new THREE.PlaneGeometry(d.w, d.d), lam(0xffffff, { map: tex, side: THREE.DoubleSide }), ...d.p);
      obj.rotation.set(-Math.PI / 2 + 0.45, d.rot, 0, 'YXZ');
      break;
    }
    case 'door':
      obj = mesh(new THREE.BoxGeometry(d.w, d.h, 0.08), lam(d.color ? new THREE.Color(d.color).getHex() : 0xffffff, d.color ? {} : { map: material('wood').mat.map }),
        d.p[0], (d.p[1] || 0) + d.h / 2, d.p[2]);
      obj.rotation.y = d.rot;
      break;
    case 'gable': {
      // Pitched roof: a triangular prism with overhang, ridge along x or z.
      const along = d.ridge === 'z';
      const len = along ? d.max[1] - d.min[1] : d.max[0] - d.min[0];
      const span = along ? d.max[0] - d.min[0] : d.max[1] - d.min[1];
      const shape = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, d.h)]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
      geo.translate(0, 0, -len / 2);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.5, uv.getY(i) / 1.5);
      obj = mesh(geo, material('slate').mat.clone(), (d.min[0] + d.max[0]) / 2, d.y, (d.min[1] + d.max[1]) / 2);
      obj.material.vertexColors = false;
      if (!along) obj.rotation.y = Math.PI / 2;
      break;
    }
    case 'chimney': {
      obj = new THREE.Group();
      obj.position.set(...d.p);
      const stone = material('mansionstone').mat.clone();
      stone.vertexColors = false;
      obj.add(mesh(new THREE.BoxGeometry(d.w, d.h, d.d), stone, 0, d.h / 2, 0));
      obj.add(mesh(new THREE.BoxGeometry(d.w + 0.2, 0.2, d.d + 0.2), lam(0x5a5a52), 0, d.h, 0));
      for (const x of [-d.w / 4, d.w / 4]) obj.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8), lam(0x8a5040), x, d.h + 0.3, 0));
      break;
    }
    case 'octagon': {
      const base = material(d.mat);
      const tex = base.mat.map.clone();
      tex.needsUpdate = true;
      tex.repeat.set((d.r * 2) / base.scale, (d.r * 2) / base.scale);
      obj = mesh(new THREE.CircleGeometry(d.r, 8, Math.PI / 8), new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1 }), d.c[0], d.y, d.c[1], false);
      obj.rotation.x = -Math.PI / 2;
      obj.receiveShadow = true;
      break;
    }
    case 'fountain': {
      obj = new THREE.Group();
      obj.position.set(d.c[0], 0, d.c[1]);
      const stone = lam(0x8a867c);
      const inner = d.r - 0.4;
      const outerWall = mesh(new THREE.CylinderGeometry(d.r, d.r + 0.08, d.h, 8, 1, true, Math.PI / 8), stone, 0, d.h / 2, 0);
      outerWall.material = new THREE.MeshLambertMaterial({ color: 0x8a867c, side: THREE.DoubleSide });
      obj.add(outerWall);
      obj.add(mesh(new THREE.CylinderGeometry(inner, inner, d.h, 8, 1, true, Math.PI / 8), new THREE.MeshLambertMaterial({ color: 0x6a665c, side: THREE.BackSide }), 0, d.h / 2, 0));
      const top = mesh(new THREE.RingGeometry(inner, d.r, 8, 1, Math.PI / 8), new THREE.MeshLambertMaterial({ color: 0x9a968c, side: THREE.DoubleSide }), 0, d.h, 0);
      top.rotation.x = -Math.PI / 2;
      obj.add(top);
      const tex = canvasTexture(256, (g, s) => {
        g.fillStyle = '#3a5a68';
        g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(200,220,230,0.3)';
        for (let i = 0; i < 30; i++) {
          const x = Math.random() * s, y = Math.random() * s;
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y + rand(-5, 5), x + 20, y); g.stroke();
        }
      });
      const water = mesh(new THREE.CircleGeometry(inner, 8, Math.PI / 8), new THREE.MeshPhongMaterial({ map: tex, shininess: 100, specular: 0x8899aa, transparent: true, opacity: 0.9 }), 0, d.h - 0.15, 0, false);
      water.rotation.x = -Math.PI / 2;
      obj.add(water);
      obj.add(mesh(new THREE.CircleGeometry(inner, 8, Math.PI / 8).rotateX(-Math.PI / 2), lam(0x4a4a44), 0, 0.02, 0, false));
      animated.push((t, dt) => { tex.offset.x += dt * 0.02; tex.offset.y = Math.sin(t * 0.5) * 0.03; });
      break;
    }
    case 'ladder': {
      const parts = [];
      for (const x of [-d.w / 2, d.w / 2]) parts.push(new THREE.BoxGeometry(0.06, d.h, 0.06).translate(x, d.h / 2, 0.06));
      for (let y = 0.3; y < d.h; y += 0.35) parts.push(new THREE.CylinderGeometry(0.022, 0.022, d.w, 6).rotateZ(Math.PI / 2).translate(0, y, 0.06));
      obj = mesh(mergeGeometries(parts), lam(0x7a7a72), d.p[0], d.p[1], d.p[2]);
      obj.rotation.y = d.rot;
      break;
    }
    case 'tunnel-lamp': {
      obj = new THREE.Group();
      obj.position.set(...d.p);
      obj.add(mesh(new THREE.BoxGeometry(0.4, 0.12, 0.25), lam(0x2a2a26), 0, 0.06, 0, false));
      obj.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.16), new THREE.MeshBasicMaterial({ color: 0xffe6a8 }), 0, -0.02, 0, false));
      const g = glow(0xffd890, 2.2);
      g.position.y = -0.15;
      obj.add(g);
      const ph = Math.random() * 10;
      animated.push(t => { g.visible = Math.sin(t * 17 + ph) > -0.97; });
      break;
    }
    case 'pipe': {
      const a = new THREE.Vector3(...d.from), b = new THREE.Vector3(...d.to);
      const len = a.distanceTo(b);
      obj = mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 8), lam(0x5a4636), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      break;
    }
    case 'gazebo': {
      obj = new THREE.Group();
      obj.position.set(d.c[0], 0, d.c[1]);
      const white = lam(0xe8e4dc);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        obj.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, d.h, 8), white, Math.cos(a) * (d.r - 0.2), d.h / 2, Math.sin(a) * (d.r - 0.2)));
      }
      obj.add(mesh(new THREE.CylinderGeometry(d.r, d.r, 0.25, 8), white, 0, 0.12, 0));
      obj.add(mesh(new THREE.ConeGeometry(d.r + 0.5, 1.6, 8), lam(0x44463f, { flatShading: true }), 0, d.h + 0.8, 0));
      break;
    }
    case 'skyline': {
      // Hazy city towers far beyond the estate walls.
      obj = new THREE.Group();
      const r = rng(d.seed || 1);
      const winTex = canvasTexture(128, (g, s) => {
        g.fillStyle = '#1e201c';
        g.fillRect(0, 0, s, s);
        for (let y = 4; y < s; y += 8) for (let x = 4; x < s; x += 8) {
          if (Math.random() < 0.07) { g.fillStyle = Math.random() < 0.5 ? '#8a8460' : '#6a7480'; g.fillRect(x, y, 4, 4); }
        }
      });
      for (let i = 0; i < 34; i++) {
        const ang = -Math.PI * 0.95 + r() * Math.PI * 1.9 - Math.PI / 2;
        const dist = 170 + r() * 110;
        const w = 12 + r() * 20, h = 25 + r() * (r() < 0.2 ? 110 : 55);
        const t = winTex.clone();
        t.needsUpdate = true;
        t.repeat.set(w / 12, h / 12);
        const b = mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ map: t, color: 0x5a5c56 }), Math.cos(ang) * dist, h / 2 - 2, Math.sin(ang) * dist, false);
        b.rotation.y = r() * Math.PI;
        obj.add(b);
      }
      break;
    }
    case 'barrel': {
      obj = new THREE.Group();
      obj.position.set(...d.p);
      obj.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.05, 12), lam([0x2a5a8a, 0x8a3a2a, 0x3a6a3a][(Math.random() * 3) | 0]), 0, 0.53, 0));
      obj.add(mesh(new THREE.TorusGeometry(0.33, 0.02, 4, 16), lam(0x222222), 0, 0.3, 0, false).rotateX(Math.PI / 2));
      obj.add(mesh(new THREE.TorusGeometry(0.33, 0.02, 4, 16), lam(0x222222), 0, 0.8, 0, false).rotateX(Math.PI / 2));
      break;
    }
    case 'ceilinglamp': {
      // Brass drum lamp under the ceiling, like the original's
      obj = new THREE.Group();
      obj.position.set(...d.p);
      obj.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.13, 16, 1, true), lam(0xd8b048, { side: THREE.DoubleSide, emissive: 0x3a2a08 }), 0, -0.09, 0, false));
      obj.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), lam(0x8a7030), 0, -0.025, 0, false));
      const bulb = mesh(new THREE.CircleGeometry(0.19, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff2c8 }), 0, -0.15, 0, false);
      obj.add(bulb);
      const g = glow(0xffe0a0, 1.2);
      g.position.y = -0.22;
      obj.add(g);
      if (d.group) ctx.groupOf(d.group).glows.push(g, bulb);
      break;
    }
    case 'chandelier': {
      obj = new THREE.Group();
      obj.position.set(...d.p);
      obj.add(mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 20), lam(0xc8a040), 0, 0, 0, false).rotateX(Math.PI / 2));
      obj.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), lam(0x8a7030), 0, 0.35, 0, false));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const g = glow(0xffd090, 0.5);
        g.position.set(Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6);
        obj.add(g);
        if (d.group) ctx.groupOf(d.group).glows.push(g);
      }
      break;
    }
    case 'painting':
      obj = painting(d.w, d.h, d.seed);
      obj.position.set(...d.p);
      obj.rotation.y = d.rot;
      break;
    case 'window':
      obj = windowPane(d.w, d.h);
      obj.position.set(...d.p);
      obj.rotation.y = d.rot;
      break;
    case 'umbrella': {
      obj = new THREE.Group();
      obj.position.set(...d.p);
      obj.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), lam(0xdddddd), 0, 1.2, 0));
      obj.add(mesh(new THREE.ConeGeometry(1.4, 0.5, 8), lam(new THREE.Color(d.color).getHex(), { flatShading: true }), 0, 2.35, 0));
      break;
    }
    case 'fire': {
      obj = new THREE.Group();
      obj.position.set(...d.p);
      const flames = [0, 1, 2].map(i => { const f = glow(0xff7a20, 0.8); f.position.set(0, i * 0.15, (i - 1) * 0.3); obj.add(f); return f; });
      animated.push(t => flames.forEach((f, i) => { const s = 0.7 + Math.abs(Math.sin(t * 9 + i * 2)) * 0.5; f.scale.set(s, s * 1.4, 1); }));
      if (quality !== 'low') {
        const l = new THREE.PointLight(0xff8a3a, 12, 8, 2);
        l.position.set(-0.5, 0.5, 0);
        obj.add(l);
        animated.push(t => { l.intensity = 10 + Math.sin(t * 13) * 2 + Math.sin(t * 29) * 1.5; });
      }
      break;
    }
    case 'ramp': {
      // Sloped wedge over the ramp's collision steps: sloped top, two side triangles and the high end face.
      const [x1, z1] = d.min, [x2, z2] = d.max, y0 = d.y0, y1 = d.y1;
      const hx = d.dir === '+x' ? x2 : d.dir === '-x' ? x1 : null;
      const hz = d.dir === '+z' ? z2 : d.dir === '-z' ? z1 : null;
      const yAt = (x, z) => (hx !== null ? (x === hx ? y1 : y0) : (z === hz ? y1 : y0));
      const base = material(d.mat);
      const pos = [], uv = [], col = [];
      const tri = (a, b, c, shade, uvf) => {
        for (const v of [a, b, c]) { pos.push(...v); uv.push(...uvf(v)); col.push(shade, shade, shade); }
      };
      const quad = (a, b, c, e, shade, uvf) => { tri(a, b, c, shade, uvf); tri(a, c, e, shade, uvf); };
      const top = [[x1, z1], [x1, z2], [x2, z2], [x2, z1]].map(([x, z]) => [x, yAt(x, z), z]);
      quad(top[0], top[1], top[2], top[3], 1, v => [v[0] / base.scale, v[2] / base.scale]);
      const lo = Math.min(y0, y1);
      const sideX = v => [v[2] / base.scale, v[1] / base.scale], sideZ = v => [v[0] / base.scale, v[1] / base.scale];
      if (hx !== null) {
        const xh = hx, xl = hx === x2 ? x1 : x2;
        tri([xl, lo, z1], [xh, lo, z1], [xh, y1, z1], 0.75, sideZ);
        tri([xl, lo, z2], [xh, y1, z2], [xh, lo, z2], 0.75, sideZ);
        quad([xh, lo, z1], [xh, lo, z2], [xh, y1, z2], [xh, y1, z1], 0.6, sideX);
      } else {
        const zh = hz, zl = hz === z2 ? z1 : z2;
        tri([x1, lo, zl], [x1, y1, zh], [x1, lo, zh], 0.75, sideX);
        tri([x2, lo, zl], [x2, lo, zh], [x2, y1, zh], 0.75, sideX);
        quad([x1, lo, zh], [x2, lo, zh], [x2, y1, zh], [x1, y1, zh], 0.6, sideZ);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      obj = new THREE.Mesh(geo, base.mat);
      obj.material = obj.material.clone();
      obj.material.side = THREE.DoubleSide;
      obj.receiveShadow = obj.castShadow = true;
      break;
    }
    case 'arch': {
      // Arched wooden door or dark window set into a sandstone wall, with a stone frame.
      const { w, h } = d;
      const shape = (s, inset) => {
        const r = (w / 2 - inset);
        const p = new THREE.Shape();
        p.moveTo(-r, inset);
        p.lineTo(r, inset);
        p.lineTo(r, h - w / 2);
        p.absarc(0, h - w / 2, r, 0, Math.PI, false);
        p.lineTo(-r, inset);
        return new THREE.ShapeGeometry(p, 12).scale(s, 1, 1);
      };
      obj = new THREE.Group();
      obj.position.set(...d.p);
      obj.rotation.y = d.rot;
      const frame = mesh(shape(1.12, -0.18).translate(0, -0.05, 0.005), lam(0xa88a60), 0, 0, 0, false);
      obj.add(frame);
      let fill;
      if (d.kind === 'window') fill = lam(0x1c140c);
      else {
        const tex = canvasTexture(128, (g, s) => {
          planks('#6a4a2a', '#8a6238', '#3a2614', 6, true)(g, s);
          g.fillStyle = '#2a1c10';
          g.fillRect(0, s * 0.3, s, 5);
          g.fillRect(0, s * 0.7, s, 5);
        }, false);
        fill = lam(0xffffff, { map: tex });
      }
      const inner = mesh(shape(1, 0), fill, 0, 0, 0.02, false);
      // map UVs across the arch
      const uvA = inner.geometry.attributes.uv, pA = inner.geometry.attributes.position;
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, pA.getX(i) / w + 0.5, pA.getY(i) / h);
      obj.add(inner);
      break;
    }
    case 'dome': {
      obj = new THREE.Group();
      obj.position.set(d.c[0], d.y, d.c[1]);
      const stone = material('wall');
      const dome = new THREE.Mesh(new THREE.SphereGeometry(d.r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xe6d2a8));
      dome.castShadow = true;
      obj.add(dome);
      obj.add(mesh(new THREE.CylinderGeometry(d.r + 0.3, d.r + 0.3, 0.5, 24), stone.mat, 0, 0.25, 0));
      obj.add(mesh(new THREE.CylinderGeometry(0.12, 0.25, 1.4, 8), lam(0xb08a4a), 0, d.r + 0.6, 0));
      obj.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), lam(0xd0a040), 0, d.r + 1.35, 0));
      break;
    }
    case 'mountains': {
      // Painted panorama of rocky desert peaks around the horizon (like a 1.6 skybox): a far hazy ridge and a
      // nearer reddish-brown one, on an open cylinder that ignores fog.
      const r = rng(d.seed || 3);
      const Wt = 2048, Ht = 256;
      const c = document.createElement('canvas');
      c.width = Wt; c.height = Ht;
      const g = c.getContext('2d');
      // Periodic ridge line (sum of integer-frequency sines) so the panorama wraps seamlessly
      const ridge = (base, amp, seed) => {
        const k = [2, 3, 5, 8, 13, 21, 34].map((f, i) => ({ f, a: amp / (i + 1.3), p: r() * 7 + seed }));
        return x => base - k.reduce((sum, q) => sum + q.a * Math.max(0, Math.sin((x / Wt) * Math.PI * 2 * q.f + q.p)) ** 1.5, 0);
      };
      const layer = (fn, top, bottom, streak) => {
        const grad = g.createLinearGradient(0, 30, 0, Ht);
        grad.addColorStop(0, top);
        grad.addColorStop(1, bottom);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(0, Ht);
        for (let x = 0; x <= Wt; x += 4) g.lineTo(x, fn(x));
        g.lineTo(Wt, Ht);
        g.closePath();
        g.fill();
        // Rock streaks running down the slopes
        g.save();
        g.clip();
        g.strokeStyle = streak;
        for (let i = 0; i < 700; i++) {
          const x = r() * Wt, y = fn(x) + r() * 60;
          g.globalAlpha = 0.08 + r() * 0.18;
          g.lineWidth = 1 + r() * 3;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (r() - 0.5) * 30, y + 20 + r() * 50);
          g.stroke();
        }
        g.restore();
        g.globalAlpha = 1;
      };
      layer(ridge(170, 150, 1), '#a9a7ae', '#c4c0bc', '#7a7682');
      layer(ridge(215, 120, 5), '#8e6448', '#b48a64', '#4a2e1e');
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = 2;
      const geo = new THREE.CylinderGeometry(330, 330, 120, 64, 1, true);
      obj = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      obj.position.y = 56;
      obj.renderOrder = -1;
      break;
    }
    case 'light':
      if (quality === 'low') return;
      obj = new THREE.PointLight(new THREE.Color(d.color), d.intensity, d.distance, 2);
      obj.position.set(...d.p);
      obj.userData.on = d.intensity;
      lights.push(obj);
      if (d.group) ctx.groupOf(d.group).lights.push(obj);
      break;
  }
  if (obj) group.add(obj);
  return obj;
}

// Floating dust motes (day) or blinking fireflies (dusk) around the camera.
function createParticles(kind) {
  const N = kind === 'fireflies' ? 120 : 260;
  const R = 22;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos.set([rand(-R, R), rand(0.2, kind === 'fireflies' ? 3 : 6), rand(-R, R)], i * 3);
    seed[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: glowTexture(),
    color: kind === 'fireflies' ? 0xd8ff7a : 0xf4e2c0,
    size: kind === 'fireflies' ? 0.14 : 0.05,
    transparent: true,
    opacity: kind === 'fireflies' ? 0.9 : 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const update = (t, dt, cam) => {
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      pos[k] += Math.sin(t * 0.3 + seed[i]) * dt * 0.3 + dt * (kind === 'dust' ? 0.25 : 0);
      pos[k + 1] += Math.sin(t * 0.5 + seed[i] * 2) * dt * 0.15;
      pos[k + 2] += Math.cos(t * 0.27 + seed[i]) * dt * 0.3;
      // keep particles in a box around the camera
      for (const [a, c] of [[0, cam.x], [2, cam.z]]) {
        if (pos[k + a] - c > R) pos[k + a] -= 2 * R;
        else if (pos[k + a] - c < -R) pos[k + a] += 2 * R;
      }
    }
    geo.attributes.position.needsUpdate = true;
    if (kind === 'fireflies') mat.opacity = 0.6 + Math.sin(t * 3) * 0.3;
  };
  return { points: pts, update };
}

// ---------------------------------------------------------------- public

// Measured on Mansion with a laptop's built-in Intel graphics (1536x864): Medium took 13-16 ms a frame with
// antialiasing and 6-7 ms without it — the smoothed edges cost more than the shadows (~2 ms), the lamps (~1 ms) and
// the rest together. So only High smooths the edges; Medium keeps shadows and full resolution with room to spare.
export const QUALITY = {
  low: { pixelRatio: 0.75, shadows: false, shadowSize: 0, antialias: false, particles: false, lamps: 2 },
  medium: { pixelRatio: 1, shadows: true, shadowSize: 1024, antialias: false, particles: true, lamps: 4 },
  high: { pixelRatio: 1.5, shadows: true, shadowSize: 2048, antialias: true, particles: true, lamps: 6 },
};

export function buildWorld(scene, map, qualityName) {
  const q = QUALITY[qualityName] || QUALITY.medium;
  const theme = map.theme;
  const group = new THREE.Group();
  const animated = [];
  const lights = [];

  scene.background = new THREE.Color(theme.skyHorizon);
  scene.fog = new THREE.Fog(theme.fog[0], theme.fog[1], theme.fog[2]);
  const sky = createSky(theme);
  group.add(sky);
  let clouds = null;
  if (theme.clouds) {
    clouds = createClouds(theme.clouds);
    if (theme.cloudColor) clouds.material.color.set(theme.cloudColor);
    else clouds.material.color.set(theme.skyHorizon).lerp(new THREE.Color('#ffffff'), 0.6);
    group.add(clouds);
  }

  group.add(new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity));
  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
  const sunDir = new THREE.Vector3(...theme.sun.dir).normalize();
  if (q.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    const c = sun.shadow.camera;
    c.left = -40; c.right = 40; c.top = 40; c.bottom = -40; c.near = 1; c.far = 220;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
  }
  group.add(sun, sun.target);

  const groups = {};
  for (const b of map.boxes) {
    if (b.hidden || b.glass) continue;
    const m = material(b.mat);
    (groups[b.mat] ||= []).push(boxGeometry(b, m.scale, b.floor));
  }
  for (const [key, geos] of Object.entries(groups)) {
    const meshObj = new THREE.Mesh(mergeGeometries(geos), material(key).mat);
    meshObj.receiveShadow = q.shadows;
    meshObj.castShadow = q.shadows && !map.boxes.find(b => b.mat === key)?.floor;
    group.add(meshObj);
  }
  if (map.faces) buildFaces(map, q, group);
  const setBrokenChunks = map.breakables ? buildBreakables(map, q, group) : () => {};

  // Painted bomb-site letters
  for (const [letter, [x, z, y = 0.03]] of Object.entries(map.labels)) {
    const tex = canvasTexture(256, (g, s) => {
      g.font = 'bold 200px Impact, Arial Black, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(200, 60, 30, 0.75)';
      g.fillText(letter, s / 2, s / 2 + 10);
    }, false);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = q.shadows;
    group.add(m);
  }

  const byGroup = {};
  const ctx = { group, animated, lights, quality: qualityName, groupOf: g => (byGroup[g] ||= { lights: [], glows: [], glassMats: [], switches: [] }) };
  // Window frames, ceiling lamps (and their light) and light switches hang on breakable walls and ceilings: they
  // come down with them (see setBrokenPieces).
  const fixtures = [];
  const fixTo = (obj, min, max) => {
    if (!obj || !map.breakables) return;
    const ids = piecesIn(min, max);
    if (ids.length) fixtures.push({ obj, ids });
  };
  const around = (p, r) => [p.map(v => v - r), p.map(v => v + r)];
  const piecesIn = (min, max) => (map.breakables || []).filter(pc => [0, 1, 2].every(k => pc.min[k] < max[k] && pc.max[k] > min[k])).map(pc => pc.id);
  const wallAround = b => piecesIn(b.min.map(v => v - 0.12), b.max.map(v => v + 0.12));
  // Static decor is merged into a few meshes (one per material, casting shadows or not); decor that moves, glows,
  // gives light or can be switched off stays as it is.
  const decorCast = new Batch(group, { castShadow: q.shadows, receiveShadow: q.shadows, cell: 20 });
  const decorFlat = new Batch(group, { receiveShadow: q.shadows, cell: 20 });
  const KEEP = new Set(['light', 'ceilinglamp']);
  for (const d of map.decor) {
    const moving = animated.length;
    const obj = buildDecor(d, ctx);
    if (obj && animated.length === moving && !KEEP.has(d.type) && staticOnly(obj)) {
      group.remove(obj);
      decorCast.add(obj, m => m.castShadow);
      decorFlat.add(obj, m => !m.castShadow);
      continue;
    }
    // a lamp under the ceiling, its light half a metre below it
    if (d.type === 'ceilinglamp') fixTo(obj, ...around([d.p[0], d.p[1] + 0.06, d.p[2]], 0.05));
    if (d.type === 'light') fixTo(obj, ...around([d.p[0], d.p[1] + 0.56, d.p[2]], 0.05));
  }

  decorCast.build();
  decorFlat.build();

  // Windows: a frame that stays, and a glass pane (with mullions) that can shatter. All of them are merged (frames
  // in one mesh, the glass in one per room) and shown or hidden one by one.
  const panes = new Map();
  const frameMat = lam(0xeae4d6);
  const windows = new Batch(group, { receiveShadow: q.shadows });
  const showPane = p => windows.setVisible(p.pane, !p.broken && !p.down);
  for (const b of map.boxes.filter(x => x.glass)) {
    const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
    const alongX = w > d;
    const len = alongX ? w : d;
    const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    if (b.plain) {
      // A converted level's glass (shop windows, skylights): just the pane, its frame is part of the level.
      const pane = new THREE.Group();
      pane.position.set(...c);
      pane.add(mesh(new THREE.BoxGeometry(Math.max(w, 0.02), Math.max(h, 0.02), Math.max(d, 0.02)),
        new THREE.MeshPhongMaterial({ color: 0x9ab4c0, transparent: true, opacity: 0.3, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 0, false));
      panes.set(b.id, { pane: windows.add(pane), center: c, size: [w, h, d], ids: wallAround(b) });
      continue;
    }
    const frame = new THREE.Group();
    frame.position.set(...c);
    if (!alongX) frame.rotation.y = Math.PI / 2;
    const depth = b.depth || 0.66;
    const parts = [
      new THREE.BoxGeometry(len, 0.08, depth).translate(0, h / 2 - 0.04, 0),
      new THREE.BoxGeometry(len + 0.2, 0.06, depth + 0.12).translate(0, -h / 2 + 0.03, 0),
      new THREE.BoxGeometry(0.08, h - 0.14, depth).translate(-len / 2 + 0.04, -0.01, 0),
      new THREE.BoxGeometry(0.08, h - 0.14, depth).translate(len / 2 - 0.04, -0.01, 0),
    ];
    frame.add(mesh(mergeGeometries(parts), frameMat));
    // the wall right around the window holds the frame
    const ids = wallAround(b), frameHandle = windows.add(frame);
    if (ids.length) fixtures.push({ handle: frameHandle, ids });

    const grp = b.group ? ctx.groupOf(b.group) : null;
    let glassMat = grp?.glassMats[0];
    if (!glassMat) {
      glassMat = new THREE.MeshPhongMaterial({ color: 0x9ab4c0, transparent: true, opacity: 0.32, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide, emissive: 0x000000 });
      if (grp) grp.glassMats.push(glassMat);
    }
    const pane = new THREE.Group();
    pane.position.set(...c);
    if (!alongX) pane.rotation.y = Math.PI / 2;
    pane.add(mesh(new THREE.PlaneGeometry(len, h), glassMat, 0, 0, 0, false));
    pane.add(mesh(new THREE.BoxGeometry(0.05, h, 0.05), frameMat, 0, 0, 0, false));
    pane.add(mesh(new THREE.BoxGeometry(len, 0.05, 0.05), frameMat, 0, h * 0.1, 0, false));
    panes.set(b.id, { pane: windows.add(pane), center: c, size: [w, h, d], ids: wallAround(b) });
  }
  windows.build();

  // Light switches on the walls
  for (const sw of map.switches || []) {
    const plate = new THREE.Group();
    plate.position.set(...sw.p);
    plate.rotation.y = sw.rot;
    plate.add(mesh(new THREE.BoxGeometry(0.14, 0.2, 0.02), lam(0xf0ece2), 0, 0, 0, false));
    const lever = mesh(new THREE.BoxGeometry(0.04, 0.07, 0.04), lam(0x8a8478), 0, 0.03, 0.025, false);
    plate.add(lever);
    group.add(plate);
    ctx.groupOf(sw.group).switches.push(lever);
    fixTo(plate, ...around(sw.p, 0.12));
  }

  // Swinging doors: a wooden leaf on a hinge pivot that turns towards its target angle.
  const doors = (map.doors || []).map(d => {
    const pivot = new THREE.Group();
    pivot.position.set(...d.hinge);
    const leafMat = lam(0xffffff, { map: material(d.tex || 'door1').mat.map });
    const leaf = mesh(new THREE.BoxGeometry(d.len - 0.02, d.h, 0.06), leafMat, d.len / 2, d.h / 2, 0);
    pivot.add(leaf);
    for (const z of [-0.06, 0.06]) pivot.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), lam(0xd8b040), d.len - 0.12, d.h * 0.45, z, false));
    pivot.rotation.y = doorAngle(d, 0);
    group.add(pivot);
    return { d, pivot, target: pivot.rotation.y };
  });

  let particles = null;
  if (q.particles && theme.particles) {
    particles = createParticles(theme.particles);
    group.add(particles.points);
  }

  // Lamps: a light that's switched on costs every lit surface on screen, so only the few nearest the camera
  // really shine (q.lamps of them, picked in update); the rest wait as plain records.
  const lamps = [], pool = [];
  group.updateMatrixWorld(true);
  group.traverse(o => { if (o.isPointLight) lamps.push(o); });
  if (lamps.length > q.lamps) {
    for (const l of lamps) {
      l.userData.at = l.getWorldPosition(new THREE.Vector3());
      l.parent.remove(l);
    }
    for (let i = 0; i < q.lamps; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 1, 2);
      group.add(l);
      pool.push(l);
    }
  } else lamps.length = 0;
  let pickAt = 0;
  const shown = l => {
    for (let o = l; o; o = o.parent) if (!o.visible) return false;
    return l.intensity > 0;
  };
  function lightNearest(camPos) {
    const cands = lamps.filter(l => shown(l) && (!l.distance || l.userData.at.distanceTo(camPos) < l.distance + 15))
      .sort((x, y) => x.userData.at.distanceToSquared(camPos) - y.userData.at.distanceToSquared(camPos));
    pool.forEach((p, i) => {
      const l = cands[i];
      if (!l) { p.intensity = 0; return; }
      p.position.copy(l.userData.at);
      p.color.copy(l.color);
      p.intensity = l.intensity;
      p.distance = l.distance;
      p.decay = l.decay;
    });
  }

  scene.add(group);

  function setLights(state) {
    for (const [name, g] of Object.entries(byGroup)) {
      const on = state?.[name] !== false;
      for (const l of g.lights) l.intensity = on ? l.userData.on : 0;
      for (const s of g.glows) s.visible = on;
      for (const m of g.glassMats) m.emissive.setHex(on ? 0x6a4c1c : 0x000000);
      for (const lv of g.switches) lv.position.y = on ? 0.03 : -0.03;
    }
  }
  setLights({});

  function setDoors(states) {
    doors.forEach((o, i) => {
      o.pivot.visible = states?.[i] !== 9; // blown off
      const a = doorAngle(o.d, states?.[i] === 9 ? 0 : states?.[i] || 0);
      o.target = o.pivot.rotation.y + Math.atan2(Math.sin(a - o.pivot.rotation.y), Math.cos(a - o.pivot.rotation.y));
    });
  }

  function setBrokenPieces(ids) {
    setBrokenChunks(ids);
    const gone = new Set(ids);
    for (const f of fixtures) {
      const up = !f.ids.some(id => gone.has(id));
      if (f.handle) windows.setVisible(f.handle, up);
      else f.obj.visible = up;
    }
    // a window in a wall that's gone goes with it
    for (const p of panes.values()) { p.down = p.ids.some(id => gone.has(id)); showPane(p); }
  }

  function setBrokenGlass(ids) {
    const broken = new Set(ids);
    for (const [id, p] of panes) { p.broken = broken.has(id); showPane(p); }
  }

  let t = 0;
  return {
    group,
    setLights,
    setBrokenGlass,
    setBrokenPieces,
    setDoors,
    // automatic quality: the sun's shadow map at a fraction of its size (see autoquality.js)
    setShadowSize(f) {
      if (!q.shadows) return;
      const size = Math.max(256, Math.round(q.shadowSize * f));
      if (sun.shadow.mapSize.x === size) return;
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
    pane: id => panes.get(id),
    update(dt, camPos) {
      t += dt;
      for (const fn of animated) fn(t, dt);
      if (pool.length && t >= pickAt) { pickAt = t + 0.1; lightNearest(camPos); }
      for (const o of doors) {
        const diff = o.target - o.pivot.rotation.y;
        o.pivot.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), dt * 4.5);
      }
      if (clouds) {
        clouds.material.map.offset.x += dt * 0.004;
        clouds.position.x = camPos.x;
        clouds.position.z = camPos.z;
        clouds.material.map.offset.y = camPos.z / 900;
      }
      sky.position.copy(camPos);
      // Shadow frustum follows the camera, snapped to texels to avoid shimmering.
      const step = 80 / (q.shadowSize || 1024);
      const cx = Math.round(camPos.x / step) * step, cz = Math.round(camPos.z / step) * step;
      sun.target.position.set(cx, 0, cz);
      sun.position.set(cx + sunDir.x * 100, sunDir.y * 100, cz + sunDir.z * 100);
      if (particles) particles.update(t, dt, camPos);
    },
    dispose() {
      scene.remove(group);
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && !Array.from(texCache.values()).some(e => e.mat === o.material)) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
    },
  };
}
