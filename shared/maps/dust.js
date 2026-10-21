// de_dusty — a small desert map. Terrorists spawn in the south (+z), CTs in the north (-z).
import { createBuilder, rowSpawns } from './builder.js';

const m = createBuilder();
const { box, floor } = m;

floor(-51, -51, 51, 51, 'sand');
box(-51, -51, 51, -50, 9, 'wall');
box(-51, 50, 51, 51, 9, 'wall');
box(-51, -50, -50, 50, 9, 'wall');
box(50, -50, 51, 50, 9, 'wall');

// Buildings that split B lane / mid / A lane
box(-50, -10, -36, 30, 7, 'wall');
box(36, -10, 50, 30, 7, 'wall');
box(-20, -15, -6, 0, 6);
box(-20, 4, -6, 22, 6);
box(6, -15, 20, 8, 6);
box(6, 12, 20, 22, 6);
box(-12, -32, 12, -24, 5);

// Mid doors with a lintel
box(-6, -6, -2, -4.5, 6, 'wall');
box(2, -6, 6, -4.5, 6, 'wall');
box(-2, -6, 2, -4.5, 2, 'wall', 4);
m.add({ type: 'door', p: [-2.6, 0, -5.25], w: 1.2, h: 3.9, rot: 0.9 });
m.add({ type: 'door', p: [2.6, 0, -5.25], w: 1.2, h: 3.9, rot: -0.9 });

// Arches
box(-36, -10, -20, -8, 2.5, 'wall', 4.5);
box(20, -10, 36, -8, 2.5, 'wall', 4.5);

// CT side walls
box(14, -50, 16, -38, 4, 'wall');
box(-16, -50, -14, -38, 4, 'wall');

// Site A
box(28, -40, 30, -38, 1, 'crate');
box(30, -40, 32, -38, 2, 'crate');
box(30, -38, 32, -36, 1, 'crate');
box(38, -31, 41, -28, 2, 'crate');
box(41, -31, 43, -29, 1, 'crate');
box(24, -27, 26, -25, 1, 'crate');
box(43, -50, 50, -41, 3);

// Site B
box(-30, -40, -28, -38, 1, 'crate');
box(-32, -40, -30, -38, 2, 'crate');
box(-32, -38, -30, -36, 1, 'crate');
box(-41, -31, -38, -28, 2, 'crate');
box(-43, -31, -41, -29, 1, 'crate');
box(-26, -27, -24, -25, 1, 'crate');
box(-50, -50, -43, -41, 3);

// Cover in lanes
box(26, 2, 28, 4, 1, 'crate');
box(28, 2, 30, 4, 2, 'crate');
box(-30, 8, -28, 10, 2, 'crate');
box(-28, 8, -26, 10, 1, 'crate');
box(-1, 12, 1, 14, 1, 'crate');
box(-24, -14, -22, -12, 2, 'crate');
box(22, -14, 24, -12, 1, 'crate');
box(20, -20, 22, -18, 1, 'crate');
box(-22, -20, -20, -18, 1, 'crate');
box(-4, -36, -2, -34, 1, 'crate');

// T spawn
box(-15, 32, -12, 35, 2, 'crate');
box(12, 32, 15, 35, 2, 'crate');
box(-2, 27, 2, 29, 1, 'crate');

// Barrels
for (const [x, z] of [[33, 18], [33.9, 18.6], [-34, -3], [18, -46], [-47, 26]]) {
  m.solid(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 1.1);
  m.add({ type: 'barrel', p: [x, 0, z] });
}

// Palms, a flag and awnings to liven it up
for (const [x, z, s] of [[-30, 44, 1.1], [30, 44, 1], [-46, 34, 0.9], [46, 36, 1.2], [-3, -46, 1], [24, -46, 0.9], [-24, 26, 0.8]]) m.tree(x, z, 'palm', s);
m.add({ type: 'flag', p: [0, 5, -24], h: 3, colors: ['#2c4a8a', '#f2f2f2'] });
m.add({ type: 'awning', p: [-6, 3.2, 22], w: 4, d: 1.4, rot: 0, color: '#a33a2a' });
m.add({ type: 'awning', p: [6, 3.2, 22], w: 4, d: 1.4, rot: 0, color: '#2a6aa3' });
m.add({ type: 'lamp', p: [-20, 4.2, -8.6] });
m.add({ type: 'lamp', p: [20, 4.2, -8.6] });

export default {
  id: 'de_dusty',
  title: 'Dusty',
  boxes: m.boxes,
  decor: m.decor,
  bounds: { min: -51, max: 51 },
  zones: {
    A: { min: [22, -46], max: [46, -22] },
    B: { min: [-46, -46], max: [-22, -22] },
    buyT: { min: [-36, 24], max: [36, 50] },
    buyCT: { min: [-16, -50], max: [16, -34] },
  },
  spawns: {
    T: [...rowSpawns(42, [-10, -6, -2, 2, 6, 10], 0), ...rowSpawns(46, [-8, -4, 0, 4, 8], 0)],
    CT: [...rowSpawns(-42, [-10, -6, -2, 2, 6, 10], Math.PI), ...rowSpawns(-46, [-8, -4, 0, 4, 8], Math.PI)],
  },
  labels: { A: [34, -34], B: [-34, -34] },
  theme: {
    skyTop: '#4a86c8', skyHorizon: '#cfe2ee', fog: ['#d9e3e6', 80, 220],
    sun: { color: '#fff0d6', intensity: 2.8, dir: [35, 70, 25] },
    hemi: { sky: '#e6f2ff', ground: '#9a8460', intensity: 1.4 },
    exposure: 1.0, clouds: 0.55, particles: 'dust',
  },
};
