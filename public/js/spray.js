// Player graffiti: the drawing editor, local storage of the player's spray, and textures for everyone's sprays.
import * as THREE from 'three';

const KEY = 'counter-office-spray';
const OUT = 128; // size of the image sent to other players

const MAX_CHARS = 60000; // the server accepts sprays up to 90 000 characters

// Encode the drawing as PNG, stepping the size down until it is small enough to send.
function shrinkToFit(source) {
  let data = '';
  for (const size of [OUT, 96, 64, 48]) {
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(source, 0, 0, size, size);
    data = out.toDataURL('image/png');
    if (data.length <= MAX_CHARS) break;
  }
  return data;
}

export function loadSpray() {
  try {
    const data = localStorage.getItem(KEY);
    return data && data.length <= MAX_CHARS ? data : null;
  } catch { return null; }
}
function storeSpray(data) {
  try { localStorage.setItem(KEY, data); } catch { /* storage unavailable */ }
}

function graffitiText(g, s, text, color) {
  g.save();
  g.translate(s / 2, s / 2);
  g.rotate(-0.12);
  const size = Math.min(s * 0.42, (s * 1.6) / Math.max(2, text.length));
  g.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.22;
  g.strokeStyle = '#111';
  g.strokeText(text, 0, 0);
  g.lineWidth = size * 0.08;
  g.strokeStyle = '#fff';
  g.strokeText(text, 0, 0);
  g.fillStyle = color;
  g.fillText(text, 0, 0);
  g.restore();
}

export function defaultSpray(name) {
  const c = document.createElement('canvas');
  c.width = c.height = OUT;
  graffitiText(c.getContext('2d'), OUT, (name || 'CS').slice(0, 8).toUpperCase(), '#ff4a8a');
  return c.toDataURL('image/png');
}

const PRESETS = {
  Smiley(g, s, color) {
    g.fillStyle = color;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.03; g.strokeStyle = '#111'; g.stroke();
    g.fillStyle = '#111';
    g.beginPath(); g.ellipse(s * 0.37, s * 0.4, s * 0.04, s * 0.07, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(s * 0.63, s * 0.4, s * 0.04, s * 0.07, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.035;
    g.beginPath(); g.arc(s / 2, s * 0.52, s * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  },
  Star(g, s, color) {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.18 : s * 0.42, a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.lineWidth = s * 0.025; g.strokeStyle = '#111'; g.stroke();
  },
  Heart(g, s, color) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(s / 2, s * 0.8);
    g.bezierCurveTo(s * 0.05, s * 0.5, s * 0.2, s * 0.12, s / 2, s * 0.32);
    g.bezierCurveTo(s * 0.8, s * 0.12, s * 0.95, s * 0.5, s / 2, s * 0.8);
    g.fill();
    g.lineWidth = s * 0.025; g.strokeStyle = '#111'; g.stroke();
  },
  Target(g, s, color) {
    for (let i = 4; i > 0; i--) {
      g.fillStyle = i % 2 ? color : '#fff';
      g.beginPath(); g.arc(s / 2, s / 2, (s * 0.42 * i) / 4, 0, Math.PI * 2); g.fill();
    }
  },
};

const COLORS = ['#111111', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff4a8a', '#8e5a2a'];

export class SprayEditor {
  constructor(onSave) {
    this.onSave = onSave;
    this.el = document.getElementById('spray-editor');
    this.canvas = this.el.querySelector('canvas');
    this.g = this.canvas.getContext('2d');
    this.size = this.canvas.width;
    this.color = '#ff4a8a';
    this.tool = 'brush';
    this.brush = 10;
    this.history = [];
    this.build();
  }

  build() {
    const palette = this.el.querySelector('.palette');
    palette.innerHTML = COLORS.map(c => `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join('') +
      '<input type="color" class="custom-color" value="#ff4a8a" title="Custom color">';
    palette.addEventListener('click', e => { const c = e.target.dataset.color; if (c) this.setColor(c); });
    palette.querySelector('.custom-color').addEventListener('input', e => this.setColor(e.target.value));

    this.el.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => this.setTool(b.dataset.tool)));
    const size = this.el.querySelector('.brush-size');
    size.addEventListener('input', () => { this.brush = +size.value; });

    const presets = this.el.querySelector('.presets');
    presets.innerHTML = Object.keys(PRESETS).map(k => `<button data-preset="${k}">${k}</button>`).join('');
    presets.addEventListener('click', e => {
      const k = e.target.dataset.preset;
      if (!k) return;
      this.snapshot();
      PRESETS[k](this.g, this.size, this.color);
    });

    const text = this.el.querySelector('.stamp-text');
    this.el.querySelector('.stamp').addEventListener('click', () => {
      if (!text.value.trim()) return;
      this.snapshot();
      graffitiText(this.g, this.size, text.value.trim().slice(0, 10), this.color);
    });
    this.el.querySelector('.undo').addEventListener('click', () => this.undo());
    this.el.querySelector('.clear').addEventListener('click', () => { this.snapshot(); this.g.clearRect(0, 0, this.size, this.size); });
    this.el.querySelector('.import').addEventListener('change', e => this.importImage(e.target.files[0]));
    this.el.querySelector('.save').addEventListener('click', () => this.save());
    this.el.querySelector('.cancel').addEventListener('click', () => this.close());

    let drawing = false, last = null;
    const point = e => {
      const r = this.canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * this.size, ((e.clientY - r.top) / r.height) * this.size];
    };
    this.canvas.addEventListener('pointerdown', e => {
      drawing = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.snapshot();
      last = point(e);
      this.stroke(last, last);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      const p = point(e);
      this.stroke(last, p);
      last = p;
    });
    const end = () => { drawing = false; };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  setColor(c) {
    this.color = c;
    if (this.tool === 'eraser') this.setTool('brush');
    this.el.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.color === c));
  }

  setTool(t) {
    this.tool = t;
    this.el.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  }

  stroke(a, b) {
    const g = this.g;
    if (this.tool === 'spray') {
      g.fillStyle = this.color;
      const steps = Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]) / 3);
      for (let i = 0; i <= steps; i++) {
        const x = a[0] + ((b[0] - a[0]) * i) / steps, y = a[1] + ((b[1] - a[1]) * i) / steps;
        for (let k = 0; k < this.brush * 1.5; k++) {
          const ang = Math.random() * Math.PI * 2, r = Math.random() * this.brush * 1.4;
          g.globalAlpha = 0.5;
          g.fillRect(x + Math.cos(ang) * r, y + Math.sin(ang) * r, 1.5, 1.5);
        }
      }
      g.globalAlpha = 1;
      return;
    }
    g.globalCompositeOperation = this.tool === 'eraser' ? 'destination-out' : 'source-over';
    g.strokeStyle = this.color;
    g.lineWidth = this.brush;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0] + 0.01, b[1]);
    g.stroke();
    g.globalCompositeOperation = 'source-over';
  }

  snapshot() {
    this.history.push(this.g.getImageData(0, 0, this.size, this.size));
    if (this.history.length > 30) this.history.shift();
  }

  undo() {
    const img = this.history.pop();
    if (img) this.g.putImageData(img, 0, 0);
  }

  importImage(file) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      this.snapshot();
      const s = this.size, k = Math.min(s / img.width, s / img.height);
      this.g.drawImage(img, (s - img.width * k) / 2, (s - img.height * k) / 2, img.width * k, img.height * k);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  open(current) {
    this.el.classList.remove('hidden');
    this.history = [];
    this.g.clearRect(0, 0, this.size, this.size);
    this.setTool('brush');
    this.setColor(this.color);
    if (current) {
      const img = new Image();
      img.onload = () => this.g.drawImage(img, 0, 0, this.size, this.size);
      img.src = current;
    }
  }

  close() {
    this.el.classList.add('hidden');
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  save() {
    const data = shrinkToFit(this.canvas);
    storeSpray(data);
    this.close();
    this.onSave(data);
  }
}

// Textures for every player's spray image, keyed by player id.
const textures = new Map();
export function sprayTexture(id, data) {
  const prev = textures.get(id);
  if (prev && prev.userData.src === data) return prev;
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.src = data;
  const img = new Image();
  img.onload = () => { tex.image = img; tex.needsUpdate = true; };
  img.src = data;
  textures.set(id, tex);
  return tex;
}
export const getSprayTexture = id => textures.get(id) || null;
