// Underground & vents in the browser (cs_mansion, cs_mansion_night; see shared/underground.js and lib/underground.js).
//   1. No radar underground: down there the radar shows static ("NO SIGNAL", main.js passes noSignal() to hud.radar
//      like a jammer), a ping or a target call says why it can't (blocked()), and the first time you go down a short
//      message says so.
// main.js calls init() once, setMap() on every map load and update() every frame.
import { isUnderground, undergroundMap } from '/shared/underground.js';

let D = null; // what it needs from main.js (see init)
let map = null, on = false;
let wasUnder = false, toldAt = -1e9;
const BLOCKED = 'No signal underground — no radar, pings or target calls down here';

// deps: { scene, net, me, hud }
export function init(deps) {
  D = deps;
}

export function setMap(m) {
  map = m;
  on = undergroundMap(m);
  wasUnder = false;
  toldAt = -1e9;
}

const under = p => on && isUnderground(map, p);
// Our radar has no signal: we're alive and underground.
export const noSignal = () => !!(D && D.me.alive && D.me.team !== 'SPEC' && under(D.me.p));
// A ping or a target call from underground: says why not (true: don't send it).
export function blocked() {
  if (!noSignal()) return false;
  D.hud.small(BLOCKED, 2);
  return true;
}

export function update(dt, now) {
  if (!D || !on) return;
  // going down: once, a short word about the radar (again only after a while above ground)
  const u = noSignal();
  if (u && !wasUnder && now - toldAt > 60000) { D.hud.small('Underground: no radar signal down here — listen', 3); toldAt = now; }
  wasUnder = u;
}
