// de_inferno — built from the original CS 1.6 level (de_inferno.bsp, converted into de_inferno_bsp.js) with its
// own textures (extracted into public/textures/de_inferno by tools/bsp/textures.mjs).
// Terrorists start in the south-west, CTs in the north-east. A (the courtyard by the apartments) is east,
// B (the church square, past banana) is north.
import { createBuilder } from './builder.js';
import { yawTo, texFile, addLadder } from './bsputil.js';
import * as BSP from './de_inferno_bsp.js';

const m = createBuilder();

// ---- collision: the original level's solid volumes
for (const b of BSP.SOLIDS) m.box(b[0], b[2], b[3], b[5], b[4] - b[1], 'none', b[1], { hidden: true });

// Every texture is drawn with the original image.
// (babtech_wall03 only covers the tops of the blocks above the roofs, which nobody sees from the streets.)
const FACE_MATS = Object.fromEntries(Object.keys(BSP.FACES).map(t => [t, t === 'babtech_wall03' ? null : 'img:/textures/de_inferno/' + texFile(t)]));
const FACE_SOUNDS = {
  pi_floorwd3: 'wood', cxwoodm: 'wood', eastcratelgtp: 'wood', eastcratelgtp2: 'wood', eastcratesm: 'wood',
  eastwood01: 'wood', eastwood02: 'wood', wood2: 'wood', out_hay1: 'grass', i_ground4: 'sand', i_ground1: 'sand',
  pi_grnmetal: 'metal', i_grate1: 'metal', out_grating2: 'metal', m_carpet2: 'carpet', cxruga: 'carpet',
};

for (const l of BSP.LADDERS) addLadder(m, BSP.SOLIDS, l);

// ---- doors: the wooden door on the upper floor swings open with E
const DOORS = BSP.DOORS.map((d, id) => {
  const [x1, y1, z1, x2, y2, z2] = d.box;
  const axis = x2 - x1 > z2 - z1 ? 'x' : 'z';
  const len = axis === 'x' ? x2 - x1 : z2 - z1;
  return { id, axis, dir: 1, len, h: y2 - y1 - 0.02, hinge: [d.origin[0], y1, d.origin[2]], tex: 'wood' };
});

m.add({ type: 'mountains', seed: 11 });

const [A, B] = BSP.BOMBTARGETS;
const AREA = (x1, z1, x2, z2) => ({ min: [x1, z1], max: [x2, z2] });

export default {
  id: 'de_inferno',
  title: 'Inferno',
  boxes: m.boxes,
  decor: m.decor,
  faces: BSP.FACES,
  faceTex: BSP.TEXTURES,
  faceMats: FACE_MATS,
  faceSounds: FACE_SOUNDS,
  bounds: { min: -66, max: 66 },
  radar: { floors: true, maxY: 9 },
  zones: {
    A: AREA(A[0], A[2], A[3], A[5]),
    B: AREA(B[0], B[2], B[3], B[5]),
    buyT: AREA(-58, 12, -45, 32),
    buyCT: AREA(44, -32, 57, -11),
  },
  spawns: {
    T: BSP.SPAWNST.map(s => ({ p: s.p.slice(), yaw: yawTo(s.p, 0, 0) })),
    CT: BSP.SPAWNSCT.map(s => ({ p: s.p.slice(), yaw: yawTo(s.p, 0, 0) })),
  },
  labels: { A: [(A[0] + A[3]) / 2, (A[2] + A[5]) / 2, A[1] + 0.03], B: [(B[0] + B[3]) / 2, (B[2] + B[5]) / 2, B[1] + 0.03] },
  ladders: m.ladders,
  water: [],
  doors: DOORS,
  rooms: BSP.ROOMS.map(r => ({ group: 'covered', amb: 0.6, ...r })),
  camo: 'desert', // the uniforms' camouflage colors (desert, urban or woodland)
  theme: {
    skyTop: '#3d78c0', skyHorizon: '#d4dfe6', fog: ['#dde3e2', 110, 320],
    sun: { color: '#fff3d0', intensity: 2.9, dir: [40, 70, -30] },
    hemi: { sky: '#e6efff', ground: '#9a8466', intensity: 1.6 },
    exposure: 1.05, clouds: 0.5, particles: 'dust',
  },
};
