// Mansion scares on the server (rules in shared/haunt.js; the browser's part: public/js/haunt.js): ghosts' one haunt a
// round, and Terrorists' grenades tied to doors and the lift. server.js calls in at a few hooks marked "haunt:".
// Messages: from the browser 'haunt' { k, p }; out 'haunt' { k: 'flicker', g, p } (and 'sfx' knock / rattle / slam / pin),
// 'rigs' { list: [[door index | 'lift', team, x, y, z]] } (the lift's y is over its cabin's floor).
import { HAUNT, RIG, KINDS, hauntOn } from '../shared/haunt.js';
import { doorCenter } from '../shared/doors.js';

const r2 = v => Math.round(v * 100) / 100;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const vec3 = a => (Array.isArray(a) && a.length === 3 && a.every(isNum) ? a : null);
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// api: { game, players, map(), world(), now, send, sendMe, broadcast, nearestDoor(p) -> { i, d, dist } | null,
//   closeDoor(i) -> true when it swung shut, lift(t) -> { x, z, y, stop (-1 between floors), open 0..1, moving } | null,
//   inLift(pos), thrown(n, path) (lib/explosives.js: grabbable) }
export function createHaunt(api) {
  const { game, players, send, broadcast } = api;
  const msg = (p, text) => send(p, { t: 'msg', text });
  const on = () => hauntOn(api.map());

  // ---- ghosts
  function haunt(p, m) {
    if (!on() || p.alive || (p.team !== 'T' && p.team !== 'CT') || game.phase !== 'live' || !(p.deathAt >= game.roundStartAt)) return;
    if (p.hauntRound === game.round) return msg(p, 'You have used your haunt this round.');
    const pos = vec3(m.p);
    if (!pos || !KINDS.includes(m.k)) return;
    const prey = [...players.values()].filter(q => q.alive && (q.team === 'T' || q.team === 'CT') && q.team !== p.team && d3(q.p, pos) < HAUNT.near);
    if (!prey.length) return msg(p, `No living enemy within ${HAUNT.near} m to scare. Float closer to one.`);
    const at = pos.map(r2);
    if (m.k === 'knock') broadcast({ t: 'sfx', s: 'knock', p: at });
    else if (m.k === 'flicker') {
      const rooms = api.map().rooms || [], inside = x => rooms.find(r => r.group && [0, 1, 2].every(k => x[k] > r.min[k] && x[k] < r.max[k]));
      const room = inside(pos) || inside(prey[0].p);
      if (!room) return msg(p, 'Float into a room to flicker its lights.');
      broadcast({ t: 'haunt', k: 'flicker', g: room.group, p: at });
    } else {
      const d = api.nearestDoor({ p: [pos[0], pos[1] - 1, pos[2]] }, HAUNT.door);
      if (!d || d.d.hatch || d.d.roller || d.d.grate) return msg(p, `No door within ${HAUNT.door} m to slam.`);
      const c = doorCenter(d.d).map(r2);
      if (api.world().doorStates[d.i] === 0) broadcast({ t: 'sfx', s: 'rattle', p: c });
      else if (api.closeDoor(d.i)) broadcast({ t: 'sfx', s: 'slam', p: c });
      else return msg(p, 'Someone is standing in that door.');
    }
    p.hauntRound = game.round;
    send(p, { t: 'hauntUsed' });
  }

  // ---- rigged doors and the lift: door index or 'lift' -> { owner, team, p (where the grenade sits), stop (the lift's floor when rigged) }
  const rigs = new Map();
  let round = -1;
  const sendRigs = () => broadcast({ t: 'rigs', list: [...rigs].map(([k, r]) => [k, r.team, ...r.p.map(r2)]) });
  const doorSpot = d => { const c = doorCenter(d); return [c[0], d.hinge[1] + 1, c[2]]; };
  const rigNear = p => {
    for (const k of rigs.keys()) {
      if (k === 'lift' ? api.inLift(p.p) : Math.hypot(p.p[0] - rigs.get(k).p[0], p.p[2] - rigs.get(k).p[2]) < RIG.reach && Math.abs(p.p[1] + 1 - rigs.get(k).p[1]) < 1.2) return k;
    }
    return null;
  };
  // What a Terrorist with the HE in hand would rig here: the lift standing at a floor with him in it, or a closed door.
  function target(p, t) {
    if (api.inLift(p.p)) { const l = api.lift(t); return l && !l.moving && l.stop >= 0 ? 'lift' : null; }
    const d = api.nearestDoor(p, RIG.reach);
    if (!d || d.d.hatch || d.d.roller || d.d.grate || api.world().doorStates[d.i] !== 0 || game.doorOpening?.[d.i]) return null;
    return d.i;
  }
  // E (before the doors): a crouched player at a rig takes it apart (CTs) or back (its side); a Terrorist with the HE in
  // hand starts tying it to the door or the lift.
  function use(p, t) {
    if (!on() || !p.alive || p.bot || p.downed || game.phase !== 'live') return false;
    const k = rigNear(p);
    if (k != null && p.c) {
      const mine = rigs.get(k).team === p.team;
      p.act = { type: 'rigOff', start: t, pos: p.p.slice(), dur: (mine ? RIG.undo : RIG.disarm) * 1000, key: k };
      return true;
    }
    if (p.team !== 'T' || p.w !== 'he' || !(p.inv.he > 0)) return false;
    const key = target(p, t);
    if (key == null || rigs.has(key)) return false;
    p.act = { type: 'rig', start: t, pos: p.p.slice(), dur: RIG.time * 1000, key };
    return true;
  }
  // updateActions, after its own checks (alive, live round, not walked off).
  function act(p, a, t) {
    if (a.type === 'rig' && (p.w !== 'he' || !(p.inv.he > 0) || rigs.has(a.key) || target(p, t) !== a.key)) { p.act = null; return; }
    if (a.type === 'rigOff' && !rigs.has(a.key)) { p.act = null; return; }
    if (t - a.start < a.dur) return;
    p.act = null;
    if (a.type === 'rigOff') {
      rigs.delete(a.key);
      sendRigs();
      if (!(p.inv.he > 0)) p.inv.he = 1;
      api.sendMe(p);
      return msg(p, p.team === 'CT' ? 'You took the grenade off. It is yours now.' : 'You took your grenade back.');
    }
    p.inv.he--;
    api.sendMe(p);
    const l = a.key === 'lift' ? api.lift(t) : null;
    rigs.set(a.key, l ? { owner: p.id, team: p.team, p: [l.x + 0.3, 0.06, l.z + 0.3], stop: l.stop } : { owner: p.id, team: p.team, p: doorSpot(api.map().doors[a.key]) });
    sendRigs();
    msg(p, a.key === 'lift' ? 'Grenade tied in the lift: it goes off when the doors open at another floor.' : 'Grenade tied to the door: whoever opens it pulls the pin.');
  }
  // The pin is out: a ping, the grenade drops at `end` and goes off fuse s later (its owner's, grabbable).
  function blow(k, end, t, fuse = RIG.fuse) {
    const r = rigs.get(k);
    rigs.delete(k);
    sendRigs();
    broadcast({ t: 'sfx', s: 'pin', p: [r2(end[0]), r2(end[1] + 1), r2(end[2])] });
    const n = { id: game.nextNadeId++, k: 'he', owner: r.owner, at: t + fuse * 1000, end: end.slice() };
    game.nades.push(n);
    api.thrown(n, [n.end]);
    broadcast({ t: 'nade', id: n.id, k: 'he', o: [r2(end[0]), r2(end[1] + 0.9), r2(end[2])], v: [0, 0, 0], owner: r.owner, fu: fuse });
  }
  function tick(t) {
    if (game.round !== round) { round = game.round; if (rigs.size) { rigs.clear(); sendRigs(); } }
    if (!on() || game.phase !== 'live') return;
    for (const [k, r] of rigs) {
      if (k === 'lift') {
        const l = api.lift(t);
        if (!l) { rigs.delete(k); sendRigs(); } else if (l.open > 0.3 && l.stop >= 0 && l.stop !== r.stop) blow(k, [l.x, l.y + 0.1, l.z], t, RIG.liftFuse);
        continue;
      }
      const d = api.map().doors[k], s = api.world().doorStates[k], o = game.doorOpening?.[k];
      if (s === 0 && !o) continue;
      // (it swings away from whoever opened it: the blast is on their side of the doorway; blown off its hinges, in it)
      const side = o ? o.side : s === 1 || s === -1 ? s : 0, n = d.axis === 'x' ? 2 : 0, end = [r.p[0], d.hinge[1] + 0.1, r.p[2]];
      end[n] -= side * RIG.side;
      blow(k, end, t);
    }
  }

  return {
    haunt, use, act, tick,
    send(p) { if (rigs.size) send(p, { t: 'rigs', list: [...rigs].map(([k, r]) => [k, r.team, ...r.p.map(r2)]) }); },
  };
}
