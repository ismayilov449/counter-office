// Power & machinery (Mansion): what the server (lib/power.js) and the browsers (public/js/power.js) share.
//   - Circuits: the house's lights and machines are on five circuits, each with its breaker on the panel in the cellar
//     (next to the fuse box): the upper floor, the ground floor (with the garage and, at night, the estate's lamps),
//     the cellar, the CCTV (cameras and monitors) and the lift (motor and cabin light). The fuse box's lever is still
//     the master switch (game.lights.power). A circuit is live when its breaker is on and either the mains is on or the
//     generator runs and feeds it (GEN.circuits).
//   - The generator in the garage: CTs start it (hold E), Terrorists switch it off; it burns its tank (GEN.tank seconds)
//     and is loud. refuel() on the server is the hook for fuel cans.
//   - Power surge: when a circuit's power comes back, a few of its lit bulbs burst with sparks (each a gas spark) and
//     stay dark until the round ends.
//   - The lift's cable: a Terrorist cuts it in the machine room on the roof; the cabin falls (fallAt), the emergency
//     brake catches it only sometimes (CABLE.catch); riders take fall damage by the height (crashDamage).
// The state both sides keep: { main: mains on (the fuse box), b: breakers on (1/0, in CIRCUITS order), g: [generator
// running (1/0), fuel seconds left at time gt, gt (server ms)], burst: light groups whose bulb burst, cut: the lift's
// cable cut (1/0) }.

export const CIRCUITS = ['upper', 'ground', 'cellar', 'cctv', 'lift'];
export const CIRCUIT_NAMES = { upper: 'the upper floor', ground: 'the ground floor', cellar: 'the cellar', cctv: 'the CCTV', lift: 'the lift' };
export const LABELS = ['UPPER', 'GROUND', 'CELLAR', 'CCTV', 'LIFT'];

// hold: seconds of holding E to flip a breaker
export const BREAKER = { hold: 1.0 };
// start/stop: seconds of holding E (CT starts it, T stops it); tank: seconds of running on a full tank; circuits: what it
// feeds while the mains is off (the two floors' lights: not the cellar, the cameras or the lift)
export const GEN = { start: 3.0, stop: 2.0, tank: 90, circuits: ['upper', 'ground'] };
// chance: each lit bulb on a circuit whose power comes back bursts with this chance; atLeast: with at least this many lit
// bulbs coming back, one bursts for sure; delay: seconds after the power is back (after the lights' flicker), gap: between
// two bursts
export const SURGE = { chance: 0.25, atLeast: 3, delay: 1.0, gap: 0.25 };
// hold: seconds to cut the cable; catch: the emergency brake's chance to catch the cabin; g: the fall's acceleration;
// tc: how long it falls before the brake grips (when it does), decel: how hard it then stops (m/s²); land: the cabin's
// floor on the pit's buffers; safe/perM: fall damage, nothing up to `safe` m, then perM per metre
export const CABLE = { hold: 4.0, catch: 1 / 3, g: 9.81, tc: 0.35, decel: 25, land: -3.05, safe: 1.5, perM: 18 };
// how far (m) E reaches the panel, the generator and the winch (aimed at)
export const REACH = 1.8;

const isOn = v => v !== 0 && v !== false;

// A fresh state (every round).
export const freshState = () => ({ main: 1, b: CIRCUITS.map(() => 1), g: [0, GEN.tank, 0], burst: [], cut: 0 });

// The generator's fuel left at server time t (s), and whether it still runs.
export function genFuel(s, t) {
  const [on, fuel, gt] = s.g;
  return on ? Math.max(0, fuel - (t - gt) / 1000) : fuel;
}
export const genRunning = (s, t) => !!s.g[0] && genFuel(s, t) > 0;

// Is circuit c live? (null: something not on the house's power, always live.) t: server time (for the generator's fuel).
export function live(s, c, t) {
  if (!c || !s) return true;
  const i = CIRCUITS.indexOf(c);
  if (i < 0) return true;
  if (!isOn(s.b[i])) return false;
  if (isOn(s.main)) return true;
  return GEN.circuits.includes(c) && genRunning(s, t);
}

// ---- which circuit a light group is on (the house's groups: map.fusebox.groups; anything else isn't on it)
const tables = new WeakMap();
export function circuitTable(map) {
  if (!map?.fusebox) return {};
  let tab = tables.get(map);
  if (tab) return tab;
  tab = {};
  for (const g of map.fusebox.groups) {
    if (g === 'elevator') tab[g] = 'lift';
    else if (g === 'cellar') tab[g] = 'cellar';
    else if (g === 'estate' || g === 'garage') tab[g] = 'ground';
    else {
      const r = (map.rooms || []).find(o => o.group === g);
      tab[g] = !r ? 'ground' : r.min[1] >= 4.0 ? 'upper' : r.max[1] <= 0.7 ? 'cellar' : 'ground';
    }
  }
  tables.set(map, tab);
  return tab;
}
export const circuitOf = (map, group) => circuitTable(map)[group] || null;

// The circuit at a point: the house's lighting room it's in (within pad m of one: a point inside a wall belongs to the
// rooms either side), or null (not on the house's power). Where rooms overlap: the lift's shaft wins (it stands in the
// living room and the room upstairs), then the lower room (a storey's room beats the two-storey stair hall, so a cable
// in an upstairs wall is on the upper floor's circuit).
export function circuitAt(map, pos, pad = 0.3) {
  const tab = circuitTable(map);
  let best = null, bestH = Infinity;
  for (const r of map?.rooms || []) {
    const c = tab[r.group];
    if (!c || ![0, 1, 2].every(k => pos[k] > r.min[k] - pad && pos[k] < r.max[k] + pad)) continue;
    const h = c === 'lift' ? -1 : r.max[1] - r.min[1];
    if (h < bestH) { best = c; bestH = h; }
  }
  return best;
}

// ---- which lamps may light what a camera sees (the browsers' lamp pick, world.js): point lights cast no shadows here,
// so with only one floor's breaker off the lamps of the floor above lit it through the slab (and the living room's the
// cellar). Inside the house only the lamps of the camera's storey shine (a group whose rooms span storeys — the stair
// hall, the lift — counts for each); outside the house, or a lamp not on the house's power, always.
const STOREYS = [[-6, 0.65], [0.65, 4.15], [4.15, 8]]; // the cellar, the ground floor, the upper floor (y)
export function lampLights(map, group, cam) {
  const tab = circuitTable(map), rooms = map?.rooms || [];
  if (!group || !tab[group]) return true;
  const inHouse = rooms.some(r => tab[r.group] && [0, 1, 2].every(k => cam[k] > r.min[k] && cam[k] < r.max[k]));
  if (!inHouse) return true;
  const band = STOREYS.find(([lo, hi]) => cam[1] >= lo && cam[1] < hi) || STOREYS[1];
  const own = rooms.filter(r => r.group === group);
  return !own.length || own.some(r => r.min[1] < band[1] && r.max[1] > band[0]);
}

// The light groups that have no power now (for the rooms' darkness in the browsers: lights.dead).
export function deadGroups(map, s, t) {
  const tab = circuitTable(map);
  return Object.keys(tab).filter(g => !live(s, tab[g], t));
}

// ---- the lift's fall: the motion { y0, y1 (where it lands), t0, fall: 1, tc (s of free fall before the brake grips;
// 0: it doesn't) }. Same answer as motionAt: { y, v, moving }.
export function fallAt(m, t) {
  const tau = Math.max(0, (t - m.t0) / 1000), g = CABLE.g, d = m.y0 - m.y1, tc = m.tc || 0;
  let s, v, stopped = false;
  if (!tc || tau <= tc) { s = (g * tau * tau) / 2; v = g * tau; }
  else {
    const vc = g * tc, D = CABLE.decel, k = Math.min(tau - tc, vc / D);
    s = (g * tc * tc) / 2 + vc * k - (D * k * k) / 2;
    v = vc - D * k;
    stopped = tau - tc >= vc / D;
  }
  if (s >= d) return { y: m.y1, v: 0, moving: false };
  return { y: m.y0 - s, v: -v, moving: !stopped };
}
// How far the cabin drops before the brake has stopped it (m).
export const caughtDrop = () => (CABLE.g * CABLE.tc * CABLE.tc) / 2 + (CABLE.g * CABLE.tc) ** 2 / (2 * CABLE.decel);
// The fall damage of a crash from h metres.
export const crashDamage = h => (h <= CABLE.safe ? 0 : Math.round((h - CABLE.safe) * CABLE.perM));

// ---- aiming (the browser works out what E is aimed at and tells the server: 'b0'..'b4' a breaker, 'g' the generator,
// 'w' the lift's winch). P: map.power. eye, dir: the view. Returns { a, t } or null.
export function aimAt(P, eye, dir) {
  if (!P) return null;
  let best = null;
  const take = (a, t) => { if (t != null && t < REACH && (!best || t < best.t)) best = { a, t }; };
  // the panel's face (it faces +z): which breaker's column the crosshair is on
  const pn = P.panel;
  if (dir[2] < -1e-6) {
    const t = (pn.max[2] - eye[2]) / dir[2];
    if (t > 0) {
      const x = eye[0] + dir[0] * t, y = eye[1] + dir[1] * t;
      if (x > pn.min[0] && x < pn.max[0] && y > pn.min[1] && y < pn.max[1]) {
        const i = Math.floor(((x - pn.min[0]) / (pn.max[0] - pn.min[0])) * CIRCUITS.length);
        take('b' + Math.max(0, Math.min(CIRCUITS.length - 1, i)), t);
      }
    }
  }
  take('g', rayBox(eye, dir, P.gen.min, P.gen.max));
  take('w', rayBox(eye, dir, P.winch.min, P.winch.max));
  return best;
}
// The distance along a ray to a box (or null).
export function rayBox(o, d, min, max) {
  let t0 = 0, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < min[k] || o[k] > max[k]) return null; continue; }
    let a = (min[k] - o[k]) / d[k], b = (max[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}
// Where a target is (its middle) and the floor you use it from: the server checks the player is near enough.
export function targetSpot(P, a) {
  const mid = b => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  if (a[0] === 'b') return { p: mid(P.panel), floor: P.panel.floor };
  if (a === 'g') return { p: mid(P.gen), floor: P.gen.floor };
  if (a === 'w') return { p: mid(P.winch), floor: P.winch.floor };
  return null;
}
