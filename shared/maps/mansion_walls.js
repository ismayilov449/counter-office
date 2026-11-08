// Walls & water (see shared/walls.js): the hidden water pipes and electric cables inside the Mansion's interior
// plaster walls. Nothing here is solid or drawn by the map: a pipe or cable is a line inside a wall, and a bullet that
// goes through the wall within `r` of it bursts the pipe or cuts the cable (lib/walls.js). The browser draws a hint
// for each (public/js/walls.js): a radiator under a pipe (on the `side` its face is on), sockets along a cable.
//   Pipes run at a radiator's top (0.85 m over the floor), cables at socket height (0.3 m); a cable also runs up from
// every light switch in the house to the ceiling. The ground floor is at 0.81, the upper floor at 4.27.
// Kept away from the living room (the fireplace), the lift's shaft and roof, and the cellar.
const R = 0.07; // how close a bullet must pass (a pipe or cable and a bit)
const G = 0.81, UP = 4.27, PIPE = 0.85, SOCKET = 0.3;
const run = (name, kind, a, b, side = 0) => ({ name, kind, a, b, r: R, side });

export const WALL_RUNS = [
  // the kitchen's east wall, to the north-east room (radiator on the kitchen side)
  run('W1', 'pipe', [-13.1, G + PIPE, -13.95], [-13.1, G + PIPE, -10.25], -1),
  run('E1', 'cable', [-13.1, G + SOCKET, -13.95], [-13.1, G + SOCKET, -10.25]),
  // the hall's south wall, to the south-east room (radiator in the hall)
  run('W2', 'pipe', [-11.4, G + PIPE, 6.70], [-6.86, G + PIPE, 6.70], -1), // (west of x -11.48 the stairs stand against it)
  run('E2', 'cable', [-11.4, G + SOCKET, 6.70], [-6.86, G + SOCKET, 6.70]),
  // the hall's north wall, to the north-east room
  run('E3', 'cable', [-11.4, G + SOCKET, -9.95], [-6.86, G + SOCKET, -9.95]), // (west of x -11.48 the stairs stand against it)
  // between the two south rooms (radiator in the south-east room: the other side is a bookcase)
  run('W3', 'pipe', [-16.35, G + PIPE, 4.95], [-16.35, G + PIPE, 10.9], 1),
  // upstairs: the upper hall's north wall, to the north-east bedroom (radiator on the hall's side)
  run('W4', 'pipe', [-15.35, UP + PIPE, -9.95], [-6.86, UP + PIPE, -9.95], 1),
  run('E4', 'cable', [-15.35, UP + SOCKET, -9.95], [-6.86, UP + SOCKET, -9.95]),
  // upstairs: the partition west of the upper hall
  run('E5', 'cable', [-16.35, UP + SOCKET, -5.4], [-16.35, UP + SOCKET, -1.3]),
  run('E5b', 'cable', [-16.35, UP + SOCKET, 0.9], [-16.35, UP + SOCKET, 10.9]),
];

// Every run on a map (the list above, and a cable up from each of the house's light switches), or none off the
// Mansion maps. Worked out once per map.
const CACHE = new WeakMap();
export function wallRuns(map) {
  if (!map?.mansion2) return [];
  if (CACHE.has(map.boxes)) return CACHE.get(map.boxes);
  const list = WALL_RUNS.slice();
  for (const s of map.switches || []) {
    if (!/^lampa/.test(s.group)) continue;
    const ceil = s.p[1] < 4.1 ? 4.04 : 6.69;
    list.push(run('switch:' + s.group, 'cable', [s.p[0], s.p[1] + 0.06, s.p[2]], [s.p[0], ceil, s.p[2]]));
  }
  CACHE.set(map.boxes, list);
  return list;
}
