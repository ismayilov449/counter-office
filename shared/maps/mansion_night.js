// cs_mansion_night — the same Mansion (everything in it plays the same) on a clear night: a moon instead of the sun, a
// dark blue sky with stars, streetlights along the street and lanterns at the doors and in the garden, lit windows, a
// lit-up city on the skyline. It's its own map in the rotation, the map vote and the admin panel.
// Cheap to draw: the lamp posts share their materials (they merge into a mesh or two), their glows take four draw
// calls in all, and their light is the map's usual point lights, of which only the few nearest the camera really shine (see
// buildWorld). The rooms whose lights are on glow from inside (roomGlow, see roomlight.js) wherever their lamp is.
// The estate's own lamps (the fountain path, the gate, the doors, the garden) are on the house's fuse box: cutting the
// power puts them out too (group 'estate'); the street's and the neighbour's stay on.
import mansion from './mansion.js';

// [x, z, height, yaw, group]: a post's arm (and lamp) reaches out along its yaw (0: +z; -PI/2: -x)
const POSTS = [
  // the street, on its east side, lamps over the road
  ...[-17, -9.5, -2.5, 4.8, 12, 19].map(z => [28.55, z, 4.4, -Math.PI / 2, null]),
  // the fountain path, either side
  [12.5, -4.2, 3.6, 0, 'estate'], [12.5, 2.6, 3.6, Math.PI, 'estate'],
  // the back garden: the pool's corners
  [-33.9, -6.4, 3.6, -3 * Math.PI / 4, 'estate'], [-46.3, -17.6, 3.6, Math.PI / 4, 'estate'],
];
// [x, y, z, yaw, group]: a lantern on a bracket out of a wall (the bracket's foot on the wall)
const LANTERNS = [
  [24.08, 2.6, -3.6, Math.PI / 2, 'estate'], [24.08, 2.6, 2.0, Math.PI / 2, 'estate'], // the gate, street side
  [-6.38, 2.9, -3.1, Math.PI / 2, 'estate'], // the front door
  [-23.69, 3.1, -9.7, -Math.PI / 2, 'estate'], // the kitchen's back door
  [-15.58, 2.95, -15.4, Math.PI / 2, 'estate'], // the garage's roller door
  [-45.2, 2.6, -0.38, 0, 'estate'], // hanging in the gazebo
  [32.28, 2.5, -8.0, -Math.PI / 2, null], // the neighbour's front door
];
const at = (p, yaw, [ox, oy, oz]) => [p[0] + ox * Math.cos(yaw) + oz * Math.sin(yaw), p[1] + oy, p[2] - ox * Math.sin(yaw) + oz * Math.cos(yaw)];
const lamps = [
  ...POSTS.map(([x, z, h, yaw, group]) => ({ post: { type: 'streetlight', p: [x, 0, z], h, rot: yaw, group }, head: at([x, 0, z], yaw, [0, h - 0.16, 0.85]), big: true, group })),
  ...LANTERNS.map(([x, y, z, yaw, group]) => ({ post: { type: 'streetlight', p: [x, y, z], rot: yaw, wall: true, group }, head: at([x, y, z], yaw, [0, -0.12, 0.38]), big: false, group })),
];
const LIGHTS = lamps.map(l => l.post);
for (const big of [true, false]) {
  for (const group of [null, 'estate']) {
    const list = lamps.filter(l => l.big === big && l.group === group);
    if (!list.length) continue;
    LIGHTS.push({ type: 'glows', points: list.map(l => l.head), size: big ? 2.6 : 1.5, color: big ? '#ffc878' : '#ffd090', group });
  }
}
for (const l of lamps) {
  LIGHTS.push({ type: 'light', p: [l.head[0], l.head[1] - (l.big ? 0.2 : 0.1), l.head[2]], color: l.big ? '#ffc27a' : '#ffd296', intensity: l.big ? 34 : 14, distance: l.big ? 17 : 8, group: l.group || undefined });
}

export default {
  ...mansion,
  id: 'cs_mansion_night',
  title: 'Mansion at night',
  night: true,
  decor: [...mansion.decor.map(d => (d.type === 'skyline' ? { ...d, night: true } : d)), ...LIGHTS],
  fusebox: { ...mansion.fusebox, groups: [...mansion.fusebox.groups, 'estate'] },
  theme: {
    skyTop: '#040818', skyHorizon: '#14203a', fog: ['#0e1628', 55, 320],
    sun: { color: '#a4b6e4', intensity: 1.0, dir: [-30, 62, 45] }, // the moon
    hemi: { sky: '#40528a', ground: '#1c1c24', intensity: 1.15 },
    exposure: 1.25, clouds: 0.3, cloudColor: '#283050', particles: 'fireflies', stars: true,
    roomGlow: 1.1, // a lit room's warm light (see roomlight.js)
    glowRooms: ['tunnel'], // rooms with no switch whose lamps are always on (the tunnels): they glow too
    litGlass: '#a87430', // a lit room's windows
    viewmodel: 0.45, // your own weapon outdoors (it has its own lights)
  },
};
