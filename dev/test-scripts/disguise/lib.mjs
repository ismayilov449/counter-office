// Helpers for the disguise tests: scripted players (mansion/client.mjs) that can keep crouching, keep the raw snapshot
// text (to look for leaks), shoot at someone; the map's ground height and line of sight (the game's own collision).
import { player as basePlayer, sleep, admin } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
export { sleep, admin };

export const MAP_ID = process.env.MAP || 'aim_map';
const map = MAPS[MAP_ID];
const world = new CollisionWorld(map);
export function ground(x, z, from = 30) {
  const hit = world.raycast([x, from, z], [0, -1, 0], 80, 'solid');
  return hit ? Math.round((from - hit.t) * 1000) / 1000 : 0;
}
export const spot = (x, z, from) => [x, ground(x, z, from), z];
export function los(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d);
  const hit = world.raycast(a, d.map(v => v / len), len);
  return !hit || hit.t >= len - 0.2;
}
export const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));

export async function player(name, team) {
  const c = await basePlayer(name, team);
  c.crouch = 0;
  c.pitch = 0;
  clearInterval(c.timer);
  c.timer = setInterval(() => { if (c.p && c.alive) c.send({ t: 'state', sq: c.sq, p: c.p, yaw: c.yaw, pitch: c.pitch, c: c.crouch, w: c.w || 'knife' }); }, 50);
  c.at = (p, yaw = c.yaw, crouch = c.crouch, pitch = c.pitch) => {
    Object.assign(c, { p, yaw, crouch, pitch });
    c.send({ t: 'state', sq: c.sq, p, yaw, pitch, c: crouch, w: c.w || 'knife' });
  };
  c.raw = null;
  c.snap = null;
  c.raws = [];
  c.ws.addEventListener('message', e => {
    const s = typeof e.data === 'string' ? e.data : e.data.toString();
    if (s.startsWith('{"t":"s"')) { c.raw = s; c.snap = JSON.parse(s); if (c.keepRaw) c.raws.push(s); }
  });
  // the log keeps every message: drop the snapshots so it stays small
  const push = c.log.push.bind(c.log);
  c.log.push = m => (m.t === 's' ? c.log.length : push(m));
  c.row = id => c.snap?.pl.find(r => r[0] === id);
  c.eye = () => [c.p[0], c.p[1] + (c.crouch ? 1.0 : 1.62), c.p[2]];
  // shoot at someone's head (or chest) with what we hold
  c.shootAt = (q, w = c.w || 'usp', part = 'head') => {
    const o = c.eye(), aim = [q.p[0], q.p[1] + (part === 'head' ? (q.crouch ? 0.85 : 1.6) : (q.crouch ? 0.55 : 1.1)), q.p[2]];
    const d = aim.map((v, i) => v - o[i]), l = Math.hypot(...d);
    c.send({ t: 'shoot', o, d: d.map(v => v / l), w, rt: 0 });
  };
  c.id = () => c.me?.id ?? c.log.find(m => m.t === 'welcome')?.id;
  return c;
}

// wait until cond() is true (polling), up to ms
export async function until(cond, ms = 5000, step = 50) {
  for (let t = 0; t < ms; t += step) { if (cond()) return true; await sleep(step); }
  return !!cond();
}

export function checker() {
  let fails = 0;
  const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) { fails++; process.exitCode = 1; } return cond; };
  ok.fails = () => fails;
  return ok;
}
