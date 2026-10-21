// cs_assault — built from the original CS 1.6 level (cs_assault.bsp, converted into cs_assault_bsp.js):
// the warehouse with its offices, catwalks, vents and roof, the parking lot and the side alleys.
// Hostage rescue: the Terrorists hold the hostages in the office upstairs; the CTs start in the parking lot
// south of the warehouse and bring the hostages back there. Windows and skylights break.
import { createBuilder } from './builder.js';
import { yawOf, yawTo, groundAt, addLadder } from './bsputil.js';
import * as BSP from './cs_assault_bsp.js';

const m = createBuilder();

// ---- collision: the original level's solid volumes
for (const b of BSP.SOLIDS) m.box(b[0], b[2], b[3], b[5], b[4] - b[1], 'none', b[1], { hidden: true });

// GoldSrc texture -> painted material (first match wins; null: not drawn)
const PAINT = [
  [/^\{|^glass|skkylite/i, null],
  [/^(c_viewscreen|black)/i, 'black'],
  [/crate/i, 'crate'],
  [/^out_box/i, 'cardboard'],
  [/^trk_canvas/i, 'fabric'],
  [/^(trk_|tank|bcontainer|out_galv|out_dmp|duct|lab1|~lab1|\+0lab1|generic|silo|metal|recharged|pfab_vent|babtech|-0babtech|introdr|c1a3secdr|-2c1a4_pow|c1a4i)/i, 'metal'],
  [/^fifties_dsk/i, 'wood'],
  [/^fifties_dr/i, 'door1'],
  [/light|basetrim|sign/i, 'trim'],
  [/^(out_pave|stripes)/i, 'asphalt'],
  [/^c_sidewlk/i, 'paving'],
  [/^out_gravel/i, 'gravel'],
  [/grss/i, 'grassdirt'],
  [/^c_rockwall/i, 'rock'],
  [/^c_stone|^crete3_wall/i, 'stone'],
  [/^c_bldg2|c1a4_silo2b/i, 'brick'],
  [/^c_bldg[13]/i, 'tanbrick'],
  [/^c_bldg/i, 'greybrick'],
  [/^(out_wall|-0out_wall|out_w|c1a3wall)/i, 'mblock'],
  [/^c1a0_labflr/i, 'checker'],
  [/^c1a0_lab/i, 'plaster'],
  [/^(tnnl|c_tnnl|c1a1|crete|c1a4tnnl)/i, 'concrete'],
];
const FACE_MATS = Object.fromEntries(Object.keys(BSP.FACES).map(t => [t, (PAINT.find(([re]) => re.test(t)) || [0, 'concrete'])[1]]));

// ---- breakables: windows and skylights become breakable glass, the spy computer stays as a desk;
// vent covers and boards are left out (the vents are open).
for (const b of BSP.BREAKABLES) {
  const [x1, y1, z1, x2, y2, z2] = b.box;
  if (b.material === 0 || b.material === 7) {
    m.box(x1, z1, x2, z2, y2 - y1, 'glass', y1, { glass: true, plain: true, id: m.boxes.filter(q => q.glass).length });
  } else if (b.material === 6) m.box(x1, z1, x2, z2, y2 - y1, 'metal', y1);
}

for (const l of BSP.LADDERS) addLadder(m, BSP.SOLIDS, l);

// ---- doors: the office door by the parking lot swings open with E (the hostage room's sliding doors stay open)
const DOORS = BSP.DOORS.map((d, id) => {
  const [x1, y1, z1, x2, y2, z2] = d.box;
  const axis = x2 - x1 > z2 - z1 ? 'x' : 'z';
  const len = axis === 'x' ? x2 - x1 : z2 - z1;
  return { id, axis, dir: 1, len, h: y2 - y1 - 0.02, hinge: [d.origin[0], y1, d.origin[2]], tex: 'door1' };
});

for (const l of BSP.LIGHTS) m.add({ type: 'light', p: l.p, color: '#ffe2c8', intensity: 28, distance: 14 });
m.add({ type: 'skyline', seed: 21 });

const place = s => {
  const y = groundAt(BSP.SOLIDS, s.p[0], s.p[1] + 0.2, s.p[2]);
  return { p: [s.p[0], y, s.p[2]], yaw: s.angle != null ? yawOf(s.angle) : yawTo(s.p, 0, 0) };
};
const AREA = (x1, z1, x2, z2) => ({ min: [x1, z1], max: [x2, z2] });

export default {
  id: 'cs_assault',
  title: 'Assault',
  mode: 'hostage',
  hostages: BSP.HOSTAGES.map(h => ({ p: [h.p[0], groundAt(BSP.SOLIDS, h.p[0], h.p[1], h.p[2]), h.p[2]], yaw: yawOf(h.angle) })),
  boxes: m.boxes,
  decor: m.decor,
  faces: BSP.FACES,
  faceTex: BSP.TEXTURES,
  faceMats: FACE_MATS,
  bounds: { min: -55, max: 55 },
  radar: { floors: true, maxY: 16 },
  zones: {
    rescue: AREA(-5, 14, 37, 25),
    buyCT: AREA(-5, 14, 37, 25),
    buyT: AREA(0, -47, 22, -14),
  },
  spawns: { CT: BSP.SPAWNSCT.map(place), T: BSP.SPAWNST.map(place) },
  labels: {},
  ladders: m.ladders,
  water: [],
  doors: DOORS,
  rooms: BSP.ROOMS.map(r => ({ group: 'covered', amb: 0.85, ...r })),
  theme: {
    skyTop: '#2c3c6a', skyHorizon: '#c49a8a', fog: ['#9a8a8e', 90, 280],
    sun: { color: '#ffdcbc', intensity: 3.0, dir: [-50, 45, 40] },
    hemi: { sky: '#d4d4f0', ground: '#8a7e76', intensity: 2.3 },
    exposure: 1.35, clouds: 0.4, cloudColor: '#e8c8c0',
  },
};
