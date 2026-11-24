// Mansion 2.0: the phone tracker's cell towers (ROADMAP 14.5; rules in shared/phonetracker.js, server lib/phonetracker.js,
// browser public/js/phonetracker.js). Called once from remodel() in mansion2.js; TOWERS goes on the map as map.towers.
// Each tower is a mast (drawn by the browsers) and an equipment cabinet at its foot: the cabinet is what gets shot or
// blown up, and what a CT repairs (hold E). Both are solids here, and `keep` (never break).
//   - roof: a mast on the flat roof of the lift's machine room, its cabinet inside the room (south-east corner, by the
//     doorway): you get up there by the roof terrace's ladder
//   - garage: on the driveway east of the garage
//   - street: on the CT street, in the middle of the rescue zone
// box: the cabinet; mast: [x, foot y, z, height]
export const TOWERS = [
  { name: 'roof', box: { min: [-20.1, 9.92, -3.65], max: [-19.4, 11.3, -3.35] }, mast: [-20.7, 12.57, -4.47, 4.5] },
  { name: 'garage', box: { min: [-12.9, 0, -19.3], max: [-12.1, 1.3, -18.7] }, mast: [-12.5, 0, -19.75, 8] },
  { name: 'street', box: { min: [27.6, 0, 4.7], max: [28.4, 1.3, 5.3] }, mast: [28, 0, 5.75, 8] },
];
const MAST = 0.12; // the mast's half width

export function addTowers({ solid, keep }) {
  for (const { box: b, mast: [x, y, z, h] } of TOWERS) {
    solid([b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]]);
    keep.push([b.min[0] - 0.01, b.min[1] - 0.01, b.min[2] - 0.01, b.max[0] + 0.01, b.max[1] + 0.01, b.max[2] + 0.01]);
    solid([x - MAST, y, z - MAST, x + MAST, y + h, z + MAST]);
    keep.push([x - MAST - 0.01, y - 0.01, z - MAST - 0.01, x + MAST + 0.01, y + h + 0.01, z + MAST + 0.01]);
  }
}
