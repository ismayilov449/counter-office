// Helpers for maps converted from GoldSrc levels (see tools/bsp/convert.mjs).

// GoldSrc "angle" (degrees, 0 = east, counter-clockwise from above) -> our yaw.
export const yawOf = a => Math.atan2(-Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180));

// Yaw that looks from p towards (x, z).
export const yawTo = (p, x, z) => Math.atan2(-(x - p[0]), -(z - p[2]));

// The top of the highest solid under (x, z) at most `up` above y (where something placed at y stands).
export function groundAt(solids, x, y, z, up = 0.6) {
  let top = -Infinity;
  for (const b of solids) {
    if (x > b[0] && x < b[3] && z > b[2] && z < b[5] && b[4] <= y + up && b[4] > top) top = b[4];
  }
  return top > -Infinity ? top : y;
}

// The file the BSP texture extractor (tools/bsp/textures.mjs) wrote for a texture name.
export const texFile = name => name.toLowerCase().replace(/[^a-z0-9_-]/g, c => '_' + c.charCodeAt(0).toString(16)) + '.png';

// A func_ladder volume -> m.ladder(): it leans on the side that has a wall right behind it.
export function addLadder(m, solids, l) {
  const [x1, y1, z1, x2, y2, z2] = l;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, y = (y1 + y2) / 2;
  const hit = (x, z) => solids.some(b => x > b[0] && x < b[3] && z > b[2] && z < b[5] && y > b[1] && y < b[4]);
  const sides = [
    { n: [1, 0], at: [x1, cz], probe: [x1 - 0.12, cz] }, { n: [-1, 0], at: [x2, cz], probe: [x2 + 0.12, cz] },
    { n: [0, 1], at: [cx, z1], probe: [cx, z1 - 0.12] }, { n: [0, -1], at: [cx, z2], probe: [cx, z2 + 0.12] },
  ];
  // No wall (a ladder up through a hatch or into a vent): face the side with a floor at its foot and
  // get off on the other side, where the floor is near its top.
  const thin = x2 - x1 < z2 - z1 ? sides.slice(0, 2) : sides.slice(2);
  const fits = s => {
    const foot = groundAt(solids, s.at[0] + s.n[0] * 0.5, y1 + 0.3, s.at[1] + s.n[1] * 0.5);
    const top = groundAt(solids, s.at[0] - s.n[0] * 0.6, y2 + 0.3, s.at[1] - s.n[1] * 0.6, 0.9);
    return Math.abs(foot - y1) < 0.7 && Math.abs(top - y2) < 1.2;
  };
  const side = sides.find(s => hit(...s.probe)) || thin.find(fits) || thin[0];
  const width = side.n[0] ? z2 - z1 : x2 - x1;
  m.ladder(side.at[0], side.at[1], side.n, y1, y2, Math.max(0.6, width));
}
