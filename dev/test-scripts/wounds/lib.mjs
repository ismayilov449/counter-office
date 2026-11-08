// Helpers for the wounds tests: scripted players (mansion/client.mjs) that keep their snapshot, crouch, shoot at a point
// with the server's own clock for the lag compensation; the map's ground height (the game's collision); a checker.
import { player as basePlayer, sleep, admin } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
export { sleep, admin };

export const MAP_ID = process.env.MAP || 'cs_mansion';
const map = MAPS[MAP_ID];
const world = new CollisionWorld(map);
export const MAP = map;
export function ground(x, z, from = 3) {
  const hit = world.raycast([x, from, z], [0, -1, 0], 80, 'solid');
  return hit ? Math.round((from - hit.t) * 1000) / 1000 : 0;
}
export const spot = (x, z, from) => [x, ground(x, z, from), z];
export const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
export const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const r2 = v => Math.round(v * 100) / 100;

let fails = 0, count = 0;
export const ok = (what, cond) => { count++; console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) { fails++; process.exitCode = 1; } };
export const summary = () => console.log(`\n${count - fails}/${count} OK`);
export const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 40; i++) { if (cond()) return true; await sleep(40); } return !!cond(); };

export async function player(name, team) {
  const c = await basePlayer(name, team);
  c.name = name;
  c.crouch = 0;
  c.pitch = 0;
  c.id = c.log.find(m => m.t === 'welcome')?.id;
  clearInterval(c.timer);
  // (being dragged, a real browser puts the player where the server says: wounds.js; so does this one)
  const dragged = () => c.snap?.wd?.d?.find(e => e[1] === c.id);
  c.timer = setInterval(() => {
    const e = dragged();
    if (e) c.p = e.slice(2);
    if (c.p && c.alive) c.send({ t: 'state', sq: c.sq, p: c.p, yaw: c.yaw, pitch: c.pitch, c: c.crouch, w: c.w || 'knife' });
  }, 50);
  c.at = (p, yaw = c.yaw, crouch = c.crouch, pitch = c.pitch) => {
    Object.assign(c, { p, yaw, crouch, pitch });
    c.send({ t: 'state', sq: c.sq, p, yaw, pitch, c: crouch, w: c.w || 'knife' });
  };
  c.snap = null;
  c.ws.addEventListener('message', e => {
    const s = typeof e.data === 'string' ? e.data : e.data.toString();
    if (s.startsWith('{"t":"s"')) { c.snap = JSON.parse(s); if (c.snap.sp) c.sp = c.snap.sp; c.lastSp = c.snap.sp; }
  });
  const push = c.log.push.bind(c.log);
  c.log.push = m => (m.t === 's' ? c.log.length : push(m));
  c.on.me = m => { c.hp = m.hp; c.inv = m.inv; c.money = m.money; };
  c.on.dmg = m => { c.hp = m.hp; };
  c.row = id => c.snap?.pl.find(r => r[0] === id);
  c.posOf = id => { const r = c.row(id); return r ? [r[1], r[2], r[3]] : null; };
  c.eye = () => [c.p[0], c.p[1] + (c.crouch ? 1.0 : 1.62), c.p[2]];
  c.shootAt = (to, w = c.w) => {
    const o = c.eye(), d = to.map((v, i) => v - o[i]), l = Math.hypot(...d);
    c.send({ t: 'shoot', o, d: d.map(v => v / l), w, rt: c.snap?.time ?? 0 });
  };
  return c;
}
