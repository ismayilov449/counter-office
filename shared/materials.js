// What the Mansion is made of: every wall chunk, piece of furniture, door and solid box gets a material, read from
// the paints (world.js painters) of the level's faces on it. Used by the bullets through walls (shared/walls.js) and
// meant for the fire (what burns). Server and browser use it alike. Only the Mansion maps' boxes are classified;
// elsewhere every call answers null (a wall stops bullets as before).
//
//   pen:  bullets go through it            loss: how much of a bullet's damage 0.4 m of it eats (before the gun's power)
//   max:  the longest path through it (m)  burns: it catches fire (for the fire feature)
//   hole: a bullet hole's radius in it (m) (the see-through hole in the browser)
export const MATERIALS = {
  plaster: { pen: true, loss: 0.5, max: 0.8, burns: false, hole: 0.022 },
  wood: { pen: true, loss: 0.4, max: 1.0, burns: true, hole: 0.02 },
  paper: { pen: true, loss: 0.25, max: 1.2, burns: true, hole: 0.02 },
  fabric: { pen: true, loss: 0.15, max: 1.4, burns: true, hole: 0.02 },
  glass: { pen: true, loss: 0.05, max: 0.1, burns: false, hole: 0 },
  metal: { pen: false, burns: false },
  brick: { pen: false, burns: false },
  stone: { pen: false, burns: false },
  earth: { pen: false, burns: false },
  foliage: { pen: false, burns: true },
};

// The order a mix is judged in: the hardest material on a box decides (a wall with brick outside and plaster inside
// is brick).
const HARD = ['stone', 'brick', 'metal', 'earth', 'plaster', 'wood', 'paper', 'fabric', 'foliage', 'glass'];

// The paints (map.faceMats values, see world.js PAINTERS) and what they are.
export const PAINT_MATERIAL = {
  mplaster: 'plaster', mwall: 'plaster', ceiltile: 'plaster', picture: 'plaster',
  trim: 'wood', wood: 'wood', door1: 'wood', books: 'wood', crate: 'wood', shelf: 'wood', winerack: 'wood', deck: 'wood',
  parquet: 'wood', mfloor: 'wood',
  cardboard: 'paper', fabric: 'fabric',
  metal: 'metal', cabinet: 'metal', toolshelf: 'metal', black: 'metal',
  mblock: 'brick', brick: 'brick', tanbrick: 'brick', greybrick: 'brick',
  stone: 'stone', concrete: 'stone', paving: 'stone', pooltile: 'stone', sewer: 'stone', asphalt: 'stone', gravel: 'stone',
  slate: 'stone', checker: 'stone',
  grassdirt: 'earth', rubble: 'earth', hedge: 'foliage', glass: 'glass',
};

export const hardest = list => {
  let best = null;
  for (const m of list) if (m && (best == null || HARD.indexOf(m) < HARD.indexOf(best))) best = m;
  return best;
};

// Is this map classified? (both Mansions: the night map spreads the same object)
export const materialsOn = map => !!map?.mansion2 && !!map.breakables;

// ---- per map, worked out once (both Mansion map objects share their arrays, so they share the cache too)
const CACHE = new WeakMap();
function tables(map) {
  let t = CACHE.get(map.boxes);
  if (t) return t;
  t = { piece: new Map(), box: new Map() };
  CACHE.set(map.boxes, t);
  return t;
}

const paintsOf = (map, faces) => Object.keys(faces || {}).map(tex => PAINT_MATERIAL[map.faceMats?.[tex]] || null);

// A breakable chunk (map.breakables[i]): from the faces it carries; none drawn: furniture is wood, a roof stone, a
// wall plaster.
export function pieceMaterial(map, pc) {
  if (!pc) return null;
  const t = tables(map);
  if (t.piece.has(pc.id)) return t.piece.get(pc.id);
  const m = hardest(paintsOf(map, map.pieceFaces?.[pc.id])) || (pc.kind === 'prop' ? 'wood' : pc.kind === 'roof' ? 'stone' : 'plaster');
  t.piece.set(pc.id, m);
  return m;
}

// The level's other solid boxes (floors, stairs, the parts that never break, the new rooms' walls): from the faces
// lying on their sides, found through an index of the static faces by plane. Nothing drawn on it: stone.
function staticMaterials(map) {
  const t = tables(map);
  if (t.statics) return t.statics;
  const byPlane = new Map();
  const key = (axis, at) => axis * 1e7 + Math.round(at * 100);
  for (const [tex, polys] of Object.entries(map.staticFaces || map.faces || {})) {
    const m = PAINT_MATERIAL[map.faceMats?.[tex]];
    if (!m) continue;
    for (const f of polys) {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < f.length; i += 5) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], f[i + k]); hi[k] = Math.max(hi[k], f[i + k]); }
      const axis = [0, 1, 2].find(k => hi[k] - lo[k] < 1e-3);
      if (axis == null) continue; // (sloped: roofs)
      const k = key(axis, lo[axis]);
      (byPlane.get(k) || byPlane.set(k, []).get(k)).push({ lo, hi, m });
    }
  }
  t.statics = new Map();
  for (const b of map.boxes) {
    if (b.brk != null || b.glass) continue;
    const found = [];
    for (let axis = 0; axis < 3; axis++) {
      const [u, v] = [0, 1, 2].filter(k => k !== axis);
      for (const at of [b.min[axis], b.max[axis]]) {
        for (const r of [-1, 0, 1]) {
          for (const f of byPlane.get(key(axis, at) + r) || []) {
            if (Math.abs(f.lo[axis] - at) > 0.006) continue;
            if (f.hi[u] <= b.min[u] + 1e-3 || f.lo[u] >= b.max[u] - 1e-3 || f.hi[v] <= b.min[v] + 1e-3 || f.lo[v] >= b.max[v] - 1e-3) continue;
            found.push(f.m);
          }
        }
      }
    }
    t.statics.set(b, { m: hardest(found) || 'stone', all: [...new Set(found)] });
  }
  return t.statics;
}

// Any collision box: a breakable chunk, a door (wood; an iron grate or the garage's roller door: metal), a car or the
// lift (metal), glass, or one of the level's solids. null off the Mansion maps.
export function boxMaterial(map, box) {
  if (!materialsOn(map) || !box) return null;
  if (box.brk != null) return pieceMaterial(map, map.breakables[box.brk]);
  if (box.door != null) { const d = map.doors?.[box.door]; return d && (d.grate || d.roller) ? 'metal' : 'wood'; }
  if (box.car != null || box.elev) return 'metal';
  if (box.glass) return 'glass';
  return staticMaterials(map).get(box)?.m || 'stone';
}

// Every material on a static box (a floor: wood on top, plaster underneath), for the fire's "does any of it burn".
export function boxMaterials(map, box) {
  if (!materialsOn(map) || !box) return [];
  if (box.brk != null || box.door != null || box.car != null || box.elev || box.glass) return [boxMaterial(map, box)];
  return staticMaterials(map).get(box)?.all || ['stone'];
}

// A floor or ceiling slab (both sides longer than 2.6 m, thin): bullets don't go through floors.
export const isSlab = b => b.max[0] - b.min[0] > 2.6 && b.max[2] - b.min[2] > 2.6 && b.max[1] - b.min[1] < 0.6;
