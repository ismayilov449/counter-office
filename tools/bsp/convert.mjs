// Usage: node tools/bsp/convert.mjs <map.bsp> <out.js> [mansion|dust2|inferno|assault]   (GoldSrc v30 BSP -> our map data)
// Converts a CS 1.6 map into data for our engine (meters, y up):
//   solids: collision boxes, faces: visible polygons with texture-space UVs grouped by texture,
//   water volumes, ladders, doors, buttons, lights, spawns, hostages.
import fs from 'fs';
import { bsp } from './parse.mjs';
import { polytopes } from './solids.mjs';
// Per-map settings: where the origin goes (GoldSrc units), and the source name.
const PRESETS = {
  mansion: { origin: [252, -320, 24], name: 'cs_mansion.bsp', windows: true },
  // de_dust2_hns: the hide-and-seek extras (ladders, grates, teleports, trapdoor button) are left out
  dust2: { origin: [64, -112, -576], name: 'de_dust2_hns.bsp', windows: false, voxel: [16, 4], rooms: { area: [-60, -72, 60, 56], max: 22 } },
  // de_inferno: fences and railings are solid; breakables come out separately (the map decides what they become)
  inferno: { origin: [404, 1312, -52], name: 'de_inferno.bsp', windows: false, voxel: [16, 4], notSolid: /^\{ladder/i, breakables: true, rooms: { area: [-65, -57, 65, 57], max: 40 } },
  // cs_assault: windows, vent covers and crates are breakables
  assault: { origin: [-720, 1024, 12], name: 'cs_assault.bsp', windows: false, voxel: [16, 4], notSolid: /^\{ladder/i, breakables: true, rooms: { area: [-51, -55, 51, 55], max: 40 } },
};
const PRESET = PRESETS[process.argv[4] || 'mansion'];
const S = 0.0254, [OX, OY, OZ] = PRESET.origin;
const r3 = v => Math.round(v * 1000) / 1000;
const TX = p => [r3((p[0] - OX) * S), r3((p[2] - OZ) * S), r3(-(p[1] - OY) * S)];
const box = (mn, mx) => { const a = TX(mn), b = TX(mx); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]; };

const ent = {}; for (const e of bsp.ents) if (e.model) ent[+e.model.slice(1)] = e;
const origin = e => (e && e.origin ? e.origin.split(' ').map(Number) : [0, 0, 0]);

// ---- collision boxes (GoldSrc units first, merged, then converted)
function solidBoxes(head, off = [0, 0, 0], want = c => c === -2) {
  const out = [];
  for (const p of polytopes(head, want)) {
    const mn = p.min.map((v, k) => v + off[k]), mx = p.max.map((v, k) => v + off[k]);
    if (p.isBox) { out.push([...mn, ...mx]); continue; }
    // Voxelize into vertical columns on a grid (z-range from the half-spaces, quantized), runs merged along x.
    const [G, Q] = PRESET.voxel || [8, 4];
    for (let y = Math.floor(p.min[1] / G) * G; y < p.max[1]; y += G) {
      let run = null;
      const flush = () => { if (run) out.push([run.x0 + off[0], y + off[1], run.lo + off[2], run.x1 + off[0], y + G + off[1], run.hi + off[2]]); run = null; };
      for (let x = Math.floor(p.min[0] / G) * G; x < p.max[0]; x += G) {
        const cx = x + G / 2, cy = y + G / 2;
        let lo = p.min[2], hi = p.max[2], ok = cx >= p.min[0] && cx <= p.max[0] && cy >= p.min[1] && cy <= p.max[1];
        for (const [n, d] of ok ? p.hs : []) {
          const rest = d - n[0] * cx - n[1] * cy;
          if (Math.abs(n[2]) < 1e-6) { if (rest < -0.01) { ok = false; break; } }
          else if (n[2] > 0) hi = Math.min(hi, rest / n[2]); else lo = Math.max(lo, rest / n[2]);
        }
        lo = Math.ceil(lo / Q) * Q; hi = Math.floor(hi / Q) * Q;
        if (!ok || hi - lo < 1) { flush(); continue; }
        if (run && run.lo === lo && run.hi === hi) run.x1 = x + G; else { flush(); run = { x0: x, x1: x + G, lo, hi }; }
      }
      flush();
    }
  }
  return out;
}
function merge(boxes) {
  boxes = boxes.map(b => b.slice());
  const k6 = v => Math.round(v * 100);
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let k = 0; k < 3; k++) {
      const o1 = (k + 1) % 3, o2 = (k + 2) % 3, groups = new Map();
      for (const b of boxes) { const key = [b[o1], b[o1 + 3], b[o2], b[o2 + 3]].map(k6).join(); (groups.get(key) || groups.set(key, []).get(key)).push(b); }
      const next = [];
      for (const g of groups.values()) {
        g.sort((a, b) => a[k] - b[k]);
        let cur = g[0];
        for (let i = 1; i < g.length; i++) {
          if (g[i][k] <= cur[k + 3] + 0.01 && g[i][k] >= cur[k] - 0.01) { cur[k + 3] = Math.max(cur[k + 3], g[i][k + 3]); changed = true; }
          else { next.push(cur); cur = g[i]; }
        }
        next.push(cur);
      }
      boxes = next;
    }
    if (!changed) break;
  }
  return boxes;
}
const worldSolid = merge(solidBoxes(bsp.models[0].head));
const water = merge(solidBoxes(bsp.models[0].head, [0, 0, 0], c => c === -3));
const entSolid = [];
// With `breakables`, func_breakable and func_door (sliding doors, left open) come out as their own lists.
const SOLID_ENTS = new Set(['func_wall', 'func_pushable', ...(PRESET.breakables ? [] : ['func_breakable', 'func_door'])]);
const NOT_SOLID_TEX = PRESET.notSolid || /^\{(ladder|fence)/i;
for (let i = 1; i < bsp.models.length; i++) {
  const e = ent[i];
  if (!e || !SOLID_ENTS.has(e.classname)) continue;
  const tex = bsp.faces.slice(bsp.models[i].firstFace, bsp.models[i].firstFace + bsp.models[i].nFaces).map(f => f.tex);
  if (tex.some(t => NOT_SOLID_TEX.test(t))) continue;
  entSolid.push(...solidBoxes(bsp.models[i].head, origin(e)));
}
const solids = [...worldSolid, ...merge(entSolid)].map(b => box(b.slice(0, 3), b.slice(3)));

// ---- faces
const faceModel = new Array(bsp.faces.length).fill(0);
bsp.models.forEach((m, i) => { for (let k = 0; k < m.nFaces; k++) faceModel[m.firstFace + k] = i; });
const SKIP_TEX = /^(sky|aaatrigger|clip|origin|\{ladder\d|\{fence\d|\+.button\d|!waterblue|\{invisible|\{blue)$/i;
const SKIP_ENTS = new Set(['func_ladder', 'func_button', 'func_door_rotating', 'trigger_camera', 'trigger_teleport', 'func_water', ...(PRESET.breakables ? ['func_breakable', 'func_door'] : [])]);
const faces = {};
for (let i = 0; i < bsp.faces.length; i++) {
  const f = bsp.faces[i];
  if (SKIP_TEX.test(f.tex)) continue;
  const e = ent[faceModel[i]];
  if (faceModel[i] && (!e || SKIP_ENTS.has(e.classname))) continue;
  const off = faceModel[i] ? origin(e) : [0, 0, 0];
  const ti = bsp.texinfo[f.ti], t = bsp.tex[ti.mip];
  let pts = f.pts.map(p => p.map((v, k) => v + off[k]));
  // winding: make it counter-clockwise seen from the front (after transform)
  const P = pts.map(TX);
  // Newell's method: robust even when the first vertices are collinear (common in BSP faces)
  const cr = [0, 0, 0];
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    cr[0] += (p[1] - q[1]) * (p[2] + q[2]); cr[1] += (p[2] - q[2]) * (p[0] + q[0]); cr[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const n = [f.n[0], f.n[2], -f.n[1]];
  const order = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0 ? [...pts.keys()].reverse() : [...pts.keys()];
  const verts = [];
  for (const k of order) {
    const p = pts[k];
    const uu = (p[0] * ti.s[0] + p[1] * ti.s[1] + p[2] * ti.s[2] + ti.s[3]) / t.w;
    const vv = -(p[0] * ti.t[0] + p[1] * ti.t[1] + p[2] * ti.t[2] + ti.t[3]) / t.h;
    verts.push(...P[k], Math.round(uu * 1000) / 1000, Math.round(vv * 1000) / 1000);
  }
  (faces[f.tex] ||= []).push(verts);
}

// ---- entities
const pt = e => TX(origin(e));
const out = { solids, water: water.map(b => box(b.slice(0, 3), b.slice(3))), faces, ladders: [], doors: [], buttons: [], lights: [], spawnsCT: [], spawnsT: [], hostages: [], bombTargets: [], breakables: [], slideDoors: [] };
for (let i = 1; i < bsp.models.length; i++) {
  const e = ent[i], m = bsp.models[i];
  if (!e) continue;
  const o = origin(e);
  const b = box(m.min.map((v, k) => v + o[k]), m.max.map((v, k) => v + o[k]));
  if (e.classname === 'func_ladder') out.ladders.push(b);
  if (e.classname === 'func_door_rotating') out.doors.push({ box: b, origin: TX(o), tex: bsp.faces[m.firstFace].tex });
  if (e.classname === 'func_button') out.buttons.push({ box: b, target: e.target });
  if (e.classname === 'func_bomb_target') out.bombTargets.push(b);
  if (e.classname === 'func_breakable' && PRESET.breakables) {
    out.breakables.push({ box: b, material: +(e.material || 0), health: +(e.health || 0), tex: bsp.faces[m.firstFace].tex });
  }
  if (e.classname === 'func_door' && PRESET.breakables) out.slideDoors.push({ box: b, angle: +(e.angle || 0), tex: bsp.faces[m.firstFace].tex });
}
for (const e of bsp.ents) {
  if (e.classname === 'light') out.lights.push({ p: pt(e), name: e.targetname || null, l: e._light.split(' ').map(Number) });
  if (e.classname === 'info_player_start') out.spawnsCT.push({ p: TX(origin(e).map((v, k) => k === 2 ? v - 36 : v)), angle: +e.angle });
  if (e.classname === 'info_player_deathmatch') out.spawnsT.push({ p: TX(origin(e).map((v, k) => k === 2 ? v - 36 : v)), angle: +(e.angle || 0) });
  if (e.classname === 'hostage_entity') out.hostages.push({ p: pt(e), angle: +e.angle });
}
const textures = Object.fromEntries(bsp.tex.map(t => [t.name, [t.w, t.h]]));
out.textures = textures;
const js = `// GENERATED from ${PRESET.name} (CS 1.6) by the BSP converter — geometry in meters, y up.\n` +
  `// solids: collision boxes [x1,y1,z1,x2,y2,z2]; faces: { texture: [[x,y,z,u,v, ...], ...] }.\n` +
  Object.entries(out).map(([k, v]) => `export const ${k.toUpperCase()} = ${JSON.stringify(v)};`).join('\n') + '\n';
fs.writeFileSync(process.argv[3], js);
console.log('solids', solids.length, 'water', out.water.length, 'faces', Object.values(faces).reduce((a, l) => a + l.length, 0), 'bytes', js.length);
console.log(JSON.stringify({ ladders: out.ladders, doors: out.doors, spawnsT: out.spawnsT, spawnsCT: out.spawnsCT, hostages: out.hostages }));

// ---- window openings in the mansion's outer walls (appended to the module)
if (PRESET.windows) {
  const inside = (x, y, z) => solids.some(b => x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]);
  const walls = [
    { axis: 'z', a: -23.67, b: -23.27, from: -14.43, to: 11.38 }, // west: wall plane x, runs along z
    { axis: 'z', a: -6.81, b: -6.40, from: -14.43, to: 11.38 },
    { axis: 'x', a: -14.43, b: -14.02, from: -23.67, to: -6.40 }, // north: plane z, runs along x
    { axis: 'x', a: 10.97, b: 11.38, from: -23.67, to: -6.40 },
  ];
  const wins = [];
  for (const w of walls) {
    const c = (w.a + w.b) / 2;
    const at = (t, y) => (w.axis === 'z' ? inside(c, y, t) : inside(t, y, c));
    for (const yScan of [2.3, 5.8]) {
      let start = null;
      for (let t = w.from; t <= w.to + 0.01; t += 0.02) {
        const open = !at(t, yScan) && t < w.to;
        if (open && start === null) start = t;
        if (!open && start !== null) {
          const mid = (start + t) / 2;
          let lo = yScan, hi = yScan;
          while (!at(mid, lo - 0.01) && lo > -1) lo -= 0.01;
          while (!at(mid, hi + 0.01) && hi < 12) hi += 0.01;
          const floor = yScan < 4 ? 0.81 : 4.27;
          if (lo > floor + 0.3 && t - start > 0.5) wins.push({ axis: w.axis, at: [w.a, w.b], from: +start.toFixed(2), to: +t.toFixed(2), bottom: +lo.toFixed(2), top: +hi.toFixed(2) });
          start = null;
        }
      }
    }
  }
  fs.appendFileSync(process.argv[3], `export const WINDOWS = ${JSON.stringify(wins)};\n`);
  console.log('windows', wins.length, JSON.stringify(wins.slice(0, 3)));
}

// ---- covered spaces (tunnels, roofed passages): rectangles with a roof 1.8-7 m above the floor, merged
// from a 1 m grid, biggest first. The game dims the sky light inside them.
if (PRESET.rooms) {
  const R = 1, [x0, z0, x1, z1] = PRESET.rooms.area;
  const nx = Math.round((x1 - x0) / R), nz = Math.round((z1 - z0) / R);
  const cellOf = new Map();
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const cx = x0 + (i + 0.5) * R, cz = z0 + (j + 0.5) * R;
    const col = solids.filter(b => cx > b[0] && cx < b[3] && cz > b[2] && cz < b[5]).sort((a, b) => a[1] - b[1]);
    for (let k = 0; k < col.length - 1; k++) {
      const floor = col[k][4], roof = col[k + 1][1];
      if (floor > -2 && floor < 9 && roof - floor >= 1.8 && roof - floor <= 7 && col.slice(k + 1).every(b => b[1] >= floor)) {
        cellOf.set(i * 10000 + j, [Math.round(floor * 2) / 2, Math.round(roof * 2) / 2, floor, roof]);
        break;
      }
    }
  }
  const used = new Set(), rooms = [];
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const k = i * 10000 + j, c = cellOf.get(k);
    if (!c || used.has(k)) continue;
    let w = 1, h = 1;
    while (i + w < nx && !used.has((i + w) * 10000 + j) && same(cellOf.get((i + w) * 10000 + j), c)) w++;
    grow: while (j + h < nz) {
      for (let a = 0; a < w; a++) { const kk = (i + a) * 10000 + j + h; if (used.has(kk) || !same(cellOf.get(kk), c)) break grow; }
      h++;
    }
    for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) used.add((i + a) * 10000 + j + b);
    if (w * h * R * R >= 6) rooms.push({ min: [x0 + i * R, c[2] - 0.3, z0 + j * R], max: [x0 + (i + w) * R, c[3] + 0.05, z0 + (j + h) * R], area: w * h });
  }
  rooms.sort((a, b) => b.area - a.area);
  const keep = rooms.slice(0, PRESET.rooms.max).map(({ min, max }) => ({ min: min.map(r3), max: max.map(r3) }));
  fs.appendFileSync(process.argv[3], `export const ROOMS = ${JSON.stringify(keep)};\n`);
  console.log('rooms', rooms.length, 'kept', keep.length, keep.slice(0, 4).map(r => JSON.stringify(r)).join(' '));
}
