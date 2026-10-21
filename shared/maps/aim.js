// aim_map — a small symmetric arena for quick fights, like the CS 1.6 classic. No bomb or hostages: a round ends
// when one team is wiped out. Every round starts with free armor and an AWP, AK-47 and M4A1 lying in the field.
import { createBuilder, rowSpawns } from './builder.js';

const m = createBuilder();
const { box, floor } = m;

floor(-21, -27, 21, 27, 'concrete');
// Outer walls
box(-21, -27, 21, -26, 6, 'greybrick');
box(-21, 26, 21, 27, 6, 'greybrick');
box(-21, -26, -20, 26, 6, 'greybrick');
box(20, -26, 21, 26, 6, 'greybrick');

// Low walls in front of each spawn (shoot over them, gaps in the middle and at the sides)
for (const z of [-19, 19]) {
  const z1 = z < 0 ? z - 0.5 : z, z2 = z < 0 ? z : z + 0.5;
  box(-15, z1, -4, z2, 1.15, 'block');
  box(4, z1, 15, z2, 1.15, 'block');
}

// The field: crates and blocks, mirrored for both sides
const mirror = (x1, z1, x2, z2, h, mat) => {
  box(x1, z1, x2, z2, h, mat);
  box(-x2, -z2, -x1, -z1, h, mat);
};
mirror(-6, -2, -4, 0, 1.1, 'crate');
mirror(-10, 6, -8, 8, 2.2, 'crate');
mirror(-8, 6, -6, 8, 1.1, 'crate');
mirror(8, 6, 10, 8, 1.1, 'crate');
mirror(-3, 9, 3, 10, 1.2, 'block');
mirror(-16, -2, -14, 2, 3, 'block');
mirror(-18, 12, -16, 14, 1.1, 'crate');
mirror(12, 13, 14, 15, 2.2, 'crate');

// Barrels and lamps
for (const [x, z] of [[-18.5, -24.5], [18.5, 24.5], [-18.5, 24.5], [18.5, -24.5]]) {
  m.solid(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 1.1);
  m.add({ type: 'barrel', p: [x, 0, z] });
}
for (const [x, z] of [[-20.4, -10], [-20.4, 10], [20.4, -10], [20.4, 10]]) m.add({ type: 'lamp', p: [x, 4.2, z] });
m.add({ type: 'flag', p: [0, 6, 26.4], h: 2.5, colors: ['#a33a2a', '#e8b45a'] });
m.add({ type: 'flag', p: [0, 6, -26.4], h: 2.5, colors: ['#2c4a8a', '#f2f2f2'] });

export default {
  id: 'aim_map',
  title: 'Aim Map',
  mode: 'elim',
  boxes: m.boxes,
  decor: m.decor,
  bounds: { min: -27, max: 27 },
  zones: {
    buyT: { min: [-20, 19], max: [20, 26] },
    buyCT: { min: [-20, -26], max: [20, -19] },
  },
  spawns: {
    T: [...rowSpawns(22, [-10, -6, -2, 2, 6, 10], 0), ...rowSpawns(24.5, [-8, -4, 0, 4, 8], 0)],
    CT: [...rowSpawns(-22, [-10, -6, -2, 2, 6, 10], Math.PI), ...rowSpawns(-24.5, [-8, -4, 0, 4, 8], Math.PI)],
  },
  labels: {},
  // Handed out at the start of every round.
  freeArmor: true,
  roundDrops: [
    { w: 'awp', p: [0, 0, 0] },
    { w: 'ak47', p: [-11, 0, 3] },
    { w: 'm4a1', p: [11, 0, -3] },
    { w: 'deagle', p: [-5, 0, 12] },
    { w: 'deagle', p: [5, 0, -12] },
  ],
  camo: 'urban', // the uniforms' camouflage colors (desert, urban or woodland)
  theme: {
    skyTop: '#3e7cc4', skyHorizon: '#d6e6f0', fog: ['#dde6ea', 70, 200],
    sun: { color: '#fff4e0', intensity: 2.9, dir: [30, 75, 20] },
    hemi: { sky: '#eaf4ff', ground: '#8a8478', intensity: 1.5 },
    exposure: 1.0, clouds: 0.4, particles: 'dust',
  },
};
