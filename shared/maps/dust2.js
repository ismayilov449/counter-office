// de_dust2 — built from the original CS 1.6 level (de_dust2_hns.bsp, converted into de_dust2_bsp.js):
// the real walls, slopes, tunnels, long doors, catwalk, short, mid doors and the roofed CT base.
// The hide-and-seek extras of that file (ladders, grates, teleports) are left out.
// Terrorists start in the south, CTs in the covered base in the north. A is north-east, B north-west.
import { createBuilder } from './builder.js';
import * as BSP from './de_dust2_bsp.js';

const m = createBuilder();

// ---- collision: the original level's solid volumes
for (const b of BSP.SOLIDS) m.box(b[0], b[2], b[3], b[5], b[4] - b[1], 'none', b[1], { hidden: true });

// GoldSrc texture -> painted material
const FACE_MATS = {
  '-0csSandWall': 'wall', SandWllWndw: 'wall', SandWllDoor: 'd2door', SandWllDoor2: 'd2door', SandCCrete: 'd2plaster',
  SandTrim: 'dusttrim', SandRoad: 'cobble', SandRoadTgtB: 'cobble', '-0Sand': 'dustsand', '-2Sand': 'dustsand',
  '-0SandRock': 'rock', '-1SandRock': 'rock', '-2SandRock': 'rock', SandCrtLrgSd: 'crate', SandCrtLrgTp: 'crate',
  SandCrtSmSd: 'crate', SandCrtSmTp: 'crate', MltryCrteSd: 'ammobox', MltryCrteSd2: 'ammobox', MltryCrteTp: 'ammobox',
  tnnl_w4a: 'stone', black: 'black', generic011: 'metal', '+0~fifties_lgt2': 'trim',
};

// ---- lamps in the tunnels and passages (the ones in the hide-and-seek corridor are left out)
for (const l of BSP.LIGHTS) {
  if (l.p[0] > 40) continue;
  m.add({ type: 'light', p: l.p, color: '#ffe2a8', intensity: 18, distance: 12 });
}

m.add({ type: 'mountains', seed: 3 });

// ---- changes for our office games
// The lower tunnel west of mid is walled off.
m.box(-5.4, 14.6, -4.8, 24.4, 5.9, 'wall', 3.2);
// The hide-and-seek pool inside the long doors is filled in, flush with the floor.
m.box(22.8, 13.6, 29.3, 19.8, 7.3, 'cobble', -4.05);
m.box(26.9, 11.3, 29.3, 13.6, 7.3, 'cobble', -4.05);

const AREA = (x1, z1, x2, z2) => ({ min: [x1, z1], max: [x2, z2] });

export default {
  id: 'de_dust2',
  title: 'Dust II',
  boxes: m.boxes,
  decor: m.decor,
  faces: BSP.FACES,
  faceTex: BSP.TEXTURES,
  faceMats: FACE_MATS,
  bounds: { min: -72, max: 72 },
  radar: { floors: true, maxY: 8.2 },
  zones: {
    A: AREA(31, -42, 47, -29),
    B: AREA(-37, -47, -22, -33),
    buyT: AREA(-21, 44, 1, 54),
    buyCT: AREA(5, -37, 25, -22),
  },
  spawns: {
    T: BSP.SPAWNST.map(s => ({ p: s.p.slice(), yaw: 0 })),
    CT: BSP.SPAWNSCT.map(s => ({ p: s.p.slice(), yaw: Math.PI })),
  },
  labels: { A: [33.5, -39, 5.72], B: [-31, -39.5, 3.28] },
  ladders: [],
  water: [],
  // Two drivable cars that can be blown up: on the way up to A from long, and in front of B.
  vehicles: [
    { p: [47, -24.5], yaw: 0, color: '#8a2a24' },
    { p: [-32.5, -31.5], yaw: 0, color: '#3a5a8a' },
  ],
  // Tunnels and roofed passages: no direct sun inside, softer sky light.
  rooms: BSP.ROOMS.map(r => ({ group: 'covered', amb: 0.6, ...r })),
  camo: 'desert', // the uniforms' camouflage colors (desert, urban or woodland)
  theme: {
    skyTop: '#3f7fc4', skyHorizon: '#c9dce8', fog: ['#d6dfe2', 110, 320],
    sun: { color: '#fff1d8', intensity: 3.0, dir: [-30, 75, 40] },
    hemi: { sky: '#dfeeff', ground: '#a08658', intensity: 1.5 },
    exposure: 1.05, clouds: 0.6, particles: 'dust',
  },
};
