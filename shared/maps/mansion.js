// cs_mansion — built from the original CS 1.6 map (cs_mansion.bsp, converted into cs_mansion_bsp.js):
// the same walled estate, fountain plaza, hedges, shed, street and two-storey mansion with its rooms,
// stairs, furniture, light switches, ladder and the water tunnel under the north lawn.
// Hostage rescue: the Terrorists start upstairs in the mansion with the hostages; the CTs start on the
// street east of the estate and lead the hostages back there. Only the front and left (south) doors lead
// into the house; the right (north) wall has a ladder up to the first-floor window.
import { createBuilder } from './builder.js';
import * as BSP from './cs_mansion_bsp.js';
import { breakUp } from './breakables.js';
import { remodel, NEW_TEX } from './mansion2.js';

const m = createBuilder();


// GoldSrc texture -> painted material (null: drawn some other way)
const FACE_MATS = {
  '-0out_grss1': 'grassdirt', c2a4_flr1: 'paving', out_cac2: 'hedge', c1a3wall05: 'greybrick', out_grnd2: 'asphalt',
  crete3_wall02: 'stone', crete3_wall01b: 'stone', tnnl_flr4c: 'pooltile', out_w5: 'sewer', silo2_wet4d: 'sewer',
  '!c2a54': null, '!waterblue': null, c1a4_silo2b: 'brick', '-0fift_wall13': 'mplaster', out_wall4a: 'mblock',
  out_roof4: 'slate', fifties_flr02: 'checker', fifties_wall14: 'mwall', fifties_wall14a: 'mplaster', c1a1w1d: 'mplaster',
  c1a2_flr1: 'mfloor', fifties_ceil5: 'ceiltile', picture8: 'picture', babtech_dr1c: 'trim', babtech_dr4c: 'trim',
  black: 'black', fifties_dr1: 'door1', generic105: 'books', generic105a: 'books', generic105b: 'wood', generic105c: 'wood',
  pfab_bks1a: 'books', pfab_bks2b: 'books', drkmtlt_bord11: 'metal', generic028: 'metal', pfab_trsh1a: 'metal',
  pfab_trsh1b: 'metal', pfab_trsh1c: 'metal', pfab_trsh1d: 'metal', lab1_stair2b: 'metal', fiftsfile1: 'cabinet',
  fiftsfile2b: 'cabinet', fifties_cch1: 'fabric', fifties_cch2: 'fabric', fifties_cch3: 'fabric', fifties_cch4: 'fabric',
  fifties_dsk5a: 'wood', pfab_dskdrwr: 'wood', bcrate02: 'crate', cardbox1: 'cardboard', cardbox4: 'cardboard',
  cardboxbot1: 'cardboard', cardboxtop1: 'cardboard', cardboxtop2: 'cardboard', generic039: 'brick', prefab_pot1: 'grassdirt',
  c1a0_flipsign8: 'metal',
};

// Mansion 2.0: the new parts, and the openings to them (see mansion2.js)
const RM = remodel(BSP.SOLIDS, BSP.FACES, BSP.TEXTURES);
for (const [t, [paint]] of Object.entries(NEW_TEX)) FACE_MATS[t] = paint;

// The street texture is also on the wall behind the CT spawn: give that wall the estate's stone instead.
const FACES = { ...RM.faces, out_grnd2: [], out_grnd2_wall: [] };
for (const f of RM.faces.out_grnd2) {
  const ys = f.filter((_, i) => i % 5 === 1);
  (Math.max(...ys) - Math.min(...ys) > 0.3 ? FACES.out_grnd2_wall : FACES.out_grnd2).push(f);
}
FACE_MATS.out_grnd2_wall = 'greybrick';

// ---- what explosions can break: the walls, furniture and roofs of the house, the shed and the garage, and the
// neighbour's wall facing the mansion (a roof together with the top floor's ceiling under it, so a shell through the
// roof drops into the room). The floors, the ceiling
// between the storeys and the stairs stay, and so does the foundation under the ground floor (0.81 m), so a hole
// is a doorway.
const inHouse = b => b.min[0] > -24.5 && b.max[0] < -5.5 && b.min[2] > -15 && b.max[2] < 12.5;
const inShed = b => b.min[0] > 12.5 && b.max[0] < 18.5 && b.min[2] > 14 && b.max[2] < 18.5;
const inGarage = b => b.min[0] > -22.7 && b.max[0] < -15.5 && b.min[2] > -20.74 && b.max[2] < -14.42;
// (of the neighbour's house only the wall facing the mansion, with the window: the rest stays whole, cheaper to draw)
const inNeighbour = b => b.min[0] > 32.2 && b.max[0] < 32.6 && b.min[2] > -10.7 && b.max[2] < -3.3 && b.min[1] > -0.1;
const kept = b => RM.keep.some(k => [0, 1, 2].every(i => b.min[i] >= k[i] && b.max[i] <= k[i + 3]));
const onStairs = b => b.min[0] > -12.95 && b.max[0] < -11.4 && ((b.min[2] > -9.8 && b.max[2] < -3.4) || (b.min[2] > 0.15 && b.max[2] < 6.55));
const FLOOR = 0.81;
function breakable(b) {
  const house = inHouse(b), shed = inShed(b), garage = !house && inGarage(b), next = inNeighbour(b);
  if ((!house && !shed && !garage && !next) || kept(b)) return null;
  const dx = b.max[0] - b.min[0], dy = b.max[1] - b.min[1], dz = b.max[2] - b.min[2];
  if (b.min[1] >= (house ? 6.45 : garage ? 3.29 : next ? 5.79 : 2.4)) return { kind: 'roof' };
  if (dx > 2.6 && dz > 2.6) return null; // floors and ceilings
  if (dy <= 0.3 && [[3.95, 4.3], [6.4, 6.95]].some(([lo, hi]) => b.min[1] >= lo && b.min[1] <= hi)) return null; // floor edges
  if (onStairs(b)) return null;
  const from = house ? FLOOR : 0;
  if (b.max[1] <= from + 0.05) return null;
  // walls: tall, or long and no more than 0.65 m thick (lintels over doorways); the rest is furniture
  const wall = dy >= 1.8 || (Math.min(dx, dz) <= 0.65 && Math.max(dx, dz) >= 1.2);
  return { kind: wall ? 'wall' : 'prop', from };
}
const ROOF_Y = { house: 6.69, shed: 2.43 };
function roofFace(f) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity;
  for (let i = 0; i < f.length; i += 5) {
    x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); y0 = Math.min(y0, f[i + 1]); z0 = Math.min(z0, f[i + 2]); z1 = Math.max(z1, f[i + 2]);
  }
  const b = { min: [x0, y0, z0], max: [x1, y0, z1] };
  return (inHouse(b) && y0 >= ROOF_Y.house) || (inShed(b) && y0 >= ROOF_Y.shed);
}
const BRK = breakUp(RM.solids, FACES, breakable, { roofFace });
// furniture, bookshelves, wooden panels and doors burn
const FUEL = new Set(['books', 'wood', 'fabric', 'crate', 'cardboard', 'door1']);
for (const p of BRK.pieces) p.fuel = p.kind === 'prop' || Object.keys(BRK.pieceFaces[p.id] || {}).some(t => FUEL.has(FACE_MATS[t]));

// ---- collision: the original level's solid volumes, and the breakable chunks
for (const b of BRK.statics) m.box(b.min[0], b.min[2], b.max[0], b.max[2], b.max[1] - b.min[1], 'none', b.min[1], { hidden: true });
for (const p of BRK.pieces) for (const b of p.boxes) m.box(b.min[0], b.min[2], b.max[0], b.max[2], b.max[1] - b.min[1], 'none', b.min[1], { hidden: true, brk: p.id });

// ---- rooms (light groups named after the original lamps). Ground floor 0.81-4.06, first floor 4.27-6.71.
const G = [0.75, 4.1], U = [4.2, 6.75];
const room = (group, x1, x2, z1, z2, [y1, y2]) => ({ group, min: [x1, y1, z1], max: [x2, y2, z2], power: true });
const ROOMS = [
  room('lampa6', -23.3, -13.31, -14.05, -5.49, G),
  room('lampa4', -13.31, -6.78, -14.05, -10.16, G),
  room('lampa5', -12.9, -6.78, -10.16, 6.5, [0.75, 6.75]),
  room('lampa7', -23.3, -13.31, -5.49, 4.88, G),
  room('lampa8', -23.3, -16.56, 4.88, 11.0, G),
  room('lampa2', -16.56, -12.9, 4.88, 11.0, G), room('lampa2', -12.9, -6.78, 6.5, 11.0, G),
  room('lampa9', -23.3, -12.9, -14.05, -7.32, U),
  room('lampa3', -12.9, -6.78, -14.05, -10.16, U),
  room('lampa10', -23.3, -16.15, -7.32, 4.47, U), room('lampa10', -16.15, -12.9, -7.32, 7.92, U),
  room('lampa11', -23.3, -16.15, 4.47, 11.0, U), room('lampa11', -16.15, -12.9, 7.92, 11.0, U),
  room('lampa1', -12.9, -6.78, 6.5, 11.0, U),
];
const roomAt = p => ROOMS.find(r => [0, 1, 2].every(k => p[k] > r.min[k] && p[k] < r.max[k]));

// ---- windows: breakable glass in every window opening of the house (and the neighbour's), lit by the room behind it
for (const w of [...BSP.WINDOWS, ...RM.windows]) {
  const c = (w.at[0] + w.at[1]) / 2, g = 0.03;
  const mid = (w.from + w.to) / 2, y = (w.bottom + w.top) / 2;
  const inward = w.axis === 'z' ? [c + (c < -15 ? 0.6 : -0.6), y, mid] : [mid, y, c + (c < 0 ? 0.6 : -0.6)];
  const extra = { glass: true, id: m.boxes.filter(b => b.glass).length, group: w.group || roomAt(inward)?.group || null, depth: w.at[1] - w.at[0] };
  if (w.axis === 'z') m.box(c - g, w.from, c + g, w.to, w.top - w.bottom, 'glass', w.bottom, extra);
  else m.box(w.from, c - g, w.to, c + g, w.top - w.bottom, 'glass', w.bottom, extra);
}

// ---- ladders: up the north wall to the first-floor window, and down the two manholes into the tunnel
const north = BSP.LADDERS.find(l => l[4] > 3);
m.ladder((north[0] + north[3]) / 2, -14.43, [0, -1], 0, 5.25, 0.85);
m.ladder(-24.0, -18.7, [1, 0], -4.06, 0.35, 0.8);
m.ladder(25.95, -18.7, [-1, 0], -4.06, 0.35, 0.8);

// ---- doors: the front door and the left (south) door swing open with E
const DOORS = BSP.DOORS.map((d, id) => {
  const [x1, y1, z1, x2, y2, z2] = d.box;
  const axis = x2 - x1 > z2 - z1 ? 'x' : 'z';
  const len = axis === 'x' ? x2 - x1 : z2 - z1;
  return { id, axis, dir: 1, len, h: y2 - y1 - 0.02, hinge: [d.origin[0], y1, d.origin[2]], tex: 'door1' };
}).concat(RM.doors.map((d, i) => ({ id: BSP.DOORS.length + i, ...d })));

// ---- lights: one lamp per original light (the two lampa10 bulbs share one), switched by the wall buttons
const seen = new Set();
for (const l of BSP.LIGHTS) {
  if (!l.name || seen.has(l.name)) continue;
  seen.add(l.name);
  const bulbs = BSP.LIGHTS.filter(o => o.name === l.name);
  const p = [0, 1, 2].map(k => bulbs.reduce((s, o) => s + o.p[k], 0) / bulbs.length);
  const ceil = p[1] < 5 ? 4.06 : 6.71;
  m.add({ type: 'ceilinglamp', p: [p[0], ceil, p[2]], group: l.name });
  m.add({ type: 'light', p: [p[0], ceil - 0.5, p[2]], color: '#ffe8b8', intensity: l.l[3] >= 200 ? 30 : 24, distance: 13, group: l.name });
}
const SWITCHES = BSP.BUTTONS.filter(b => /^lampa/.test(b.target)).map(b => {
  const c = [(b.box[0] + b.box[3]) / 2, (b.box[1] + b.box[4]) / 2, (b.box[2] + b.box[5]) / 2];
  const thinX = b.box[3] - b.box[0] < b.box[5] - b.box[2];
  const free = n => !BSP.SOLIDS.some(s => {
    const q = thinX ? [c[0] + n * 0.15, c[1], c[2]] : [c[0], c[1], c[2] + n * 0.15];
    return q[0] > s[0] && q[0] < s[3] && q[1] > s[1] && q[1] < s[4] && q[2] > s[2] && q[2] < s[5];
  });
  const n = free(1) ? 1 : -1;
  return { group: b.target, p: c, rot: thinX ? Math.atan2(n, 0) : Math.atan2(0, n) };
});

// ---- water: the fountain and the tunnel
for (const w of BSP.WATER) m.add({ type: 'water', min: [w[0], w[2]], max: [w[3], w[5]], y: w[4], color: w[4] > 0 ? '#3a7a90' : '#2e4a3a', murky: w[4] < 0 });
for (const x of [-16, -4, 8, 20]) m.add({ type: 'tunnel-lamp', p: [x, -2.2, -18.7] });
for (const d of RM.decor) m.add(d);
for (const l of RM.ladders) m.ladder(...l);

// Lawns beyond the estate walls (so the city skyline stands on the ground), then the skyline itself
for (const [x1, z1, x2, z2] of [[-400, -400, 400, -22.9], [-400, 22.9, 400, 400], [-400, -22.9, -29.3, 22.9], [29.3, -22.9, 400, 22.9]]) {
  m.add({ type: 'plane', mat: 'grassdirt', min: [x1, z1], max: [x2, z2], y: -0.05 });
}
m.add({ type: 'skyline', seed: 7 });

const yawOf = a => Math.atan2(-Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180));
const spawn = s => ({ p: [s.p[0], s.p[1] < 2 ? 0 : 4.27, s.p[2]], yaw: yawOf(s.angle) });

export default {
  id: 'cs_mansion',
  title: 'Mansion',
  mode: 'hostage',
  hostages: [
    ...BSP.HOSTAGES.map(h => ({ p: [h.p[0], h.p[1] < 2 ? 0.81 : 4.27, h.p[2]], yaw: yawOf(h.angle) })),
    { p: [-20.5, 0.81, 8.4], yaw: 0 },
  ],
  boxes: m.boxes,
  decor: m.decor,
  faces: FACES,
  staticFaces: BRK.faces, // drawn as the level; the rest belongs to the breakable chunks
  breakables: BRK.pieces,
  // the battle leaves its marks: soot, rubble, collapsing walls, dust, shell shock, blast push, spreading fire,
  // doors blown off, bullets through thin walls, muffled sound indoors (see REAL in shared/weapons.js)
  realism: true,
  mansion2: true, // the Mansion 2.0 additions (see mansion2.js and mansionTick in server.js)
  pieceFaces: BRK.pieceFaces,
  faceTex: { ...RM.tex, out_grnd2_wall: BSP.TEXTURES.out_grnd2 },
  faceMats: FACE_MATS,
  bounds: { min: -40.5, max: 40.5 }, // (the neighbour's garden reaches x 40)
  zones: {
    rescue: { min: [24.1, -22.8], max: [29.2, 22.8] },
    buyCT: { min: [24.1, -22.8], max: [29.2, 22.8] },
    buyT: { min: [-23.7, -14.5], max: [-3.4, 11.4] },
  },
  spawns: {
    CT: BSP.SPAWNSCT.map(spawn),
    T: [...BSP.SPAWNST.map(spawn), { p: [-14.6, 4.27, -2.5], yaw: 0 }],
  },
  ladders: m.ladders,
  water: BSP.WATER.map(w => ({ min: [w[0], w[1], w[2]], max: [w[3], w[4], w[5]] })),
  doors: DOORS,
  rooms: [
    ...ROOMS,
    { group: 'tunnel', amb: 0.55, min: [-24.4, -4.2, -21.2], max: [26.3, -1.95, -17.8] },
    { group: 'shed', min: [13.1, 0, 14.6], max: [18.0, 2.5, 17.9] },
    ...RM.rooms,
  ],
  switches: [...SWITCHES, ...RM.switches],
  // Blackout: holding E at the fuse box in the cellar cuts (T) or restores (CT) the power of these rooms' lights.
  fusebox: { ...RM.fusebox, groups: [...new Set([...ROOMS.map(r => r.group), ...RM.rooms.filter(r => r.power).map(r => r.group)])] },
  // One pickup truck with a PKT machine gun in the back, on the lawn by the left (south) door, and a car in the
  // garage, facing its roller door (y: dropped onto the ground from that height, under the garage roof).
  vehicles: [
    { p: [-4, 17], yaw: -Math.PI / 2, color: '#5a6a48', type: 'pickup' },
    { p: [-19.75, -17.9], y: 1, yaw: -Math.PI / 2, color: '#7a1e1a' },
  ],
  labels: {},
  theme: {
    skyTop: '#3f7fc4', skyHorizon: '#cfe0ec', fog: ['#d8e2e8', 90, 300],
    sun: { color: '#fff4e2', intensity: 2.8, dir: [35, 75, 25] },
    hemi: { sky: '#e4eefa', ground: '#8e8a70', intensity: 1.9 },
    exposure: 1.15, clouds: 0.5, cloudColor: '#ffffff', particles: 'dust',
  },
};
