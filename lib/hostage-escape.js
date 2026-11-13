// Hostages try to escape (ROADMAP 6.1, see shared/hostage-escape.js for the rules). An escaping hostage has state
// 'escape' (sent as 1, walking, like 'follow'): it walks the bots' nav path to the CT base, the rescue zone (route) at a sneak, opens
// the doors it bumps into, and counts as rescued when it gets there (server.js). Tied: h.tiedUntil (a time).
import { PLAYER, movePlayer, overlapsBox } from '../shared/physics.js';
import { ESCAPE, PANIC, TALK } from '../shared/hostage-escape.js';
import { sideStep } from './hostages.js';
import { CARRY } from '../shared/hostage-carry.js';

const d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// api: { game, players, map(), world(), now, send, broadcast, near(pos), reach(p, h), route(from, to, cb), openDoorNear(pos), lead(p, h) }
export function createEscape(api) {
  const { game, players, send } = api;
  const msg = (p, text) => send(p, { t: 'msg', text });
  const tied = (h, t) => (h.tiedUntil || 0) > t;
  let next = 0;

  // A Terrorist watching the hostage: within dist m, his eyes to its chest with nothing in between.
  function sees(q, h, dist) {
    if (!q.alive || q.team !== 'T' || q.downed || q.playingDead || d3(q.p, h.p) > dist) return false;
    const eye = [q.p[0], q.p[1] + (q.c ? PLAYER.crouchEye : PLAYER.eye), q.p[2]], chest = [h.p[0], h.p[1] + 1.1, h.p[2]];
    const d = chest.map((v, i) => v - eye[i]), len = Math.hypot(...d);
    if (len < 0.05) return true;
    const hit = api.world().raycast(eye, d.map(v => v / len), len, 'bullet');
    return !hit || hit.t >= len - 0.2;
  }
  const watcher = (h, dist) => [...players.values()].find(q => sees(q, h, dist));
  const scared = (h, t, s) => t - (h.scaredAt ?? -1e9) < s * 1000;
  const free = h => h.state === 'idle' && h.heldBy == null && h.carriedBy == null;

  // realism 11.2: a gunshot or a blast at `at` (kind 'shot', 'quiet' or 'blast'): the hostages that hear it are scared.
  function fright(at, kind) {
    const r = PANIC[kind], t = api.now();
    if (game.phase !== 'live') return;
    for (const h of game.hostages) if (h.state !== 'dead' && h.state !== 'rescued' && d3(h.p, at) < r) h.scaredAt = t;
  }

  // realism 11.3: where a Terrorist is, as a hostage would say it (the map's rooms; the house's floors by height)
  const PLACES = { tunnel: 'in the tunnels', cellar: 'in the cellar', garage: 'in the garage', shed: 'in the shed', neighbour: "in the neighbour's house", elevator: 'by the lift' };
  function place(p) {
    const r = (api.map().rooms || []).find(r => [0, 1, 2].every(k => p[k] > r.min[k] && p[k] < r.max[k]));
    if (!r) return 'outside';
    return PLACES[r.group] || (p[1] > 4.15 ? 'upstairs' : 'downstairs');
  }
  const NUM = ['', 'One', 'Two', 'Three', 'Four', 'Five'];
  function tell(h, t) {
    const by = new Map();
    for (const [id, s] of h.seen || []) {
      const q = players.get(id);
      if (!q?.alive || q.team !== 'T' || t - s.at > TALK.memory * 1000) continue;
      const w = place(s.p);
      by.set(w, (by.get(w) || 0) + 1);
    }
    const text = by.size
      ? [...by].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${NUM[n] || 'Lots'} of them ${w}!`.replace(/^One of them/, 'One')).join(' ')
      : "I didn't see where they went.";
    api.broadcast({ t: 'radio', id: 0, name: 'Hostage', team: 'CT', text, p: h.p }, q => q.team === 'CT');
  }
  // every half second: the Terrorists each hostage sees now
  function spot(h, t) {
    for (const q of players.values()) if (sees(q, h, TALK.sees)) (h.seen ||= new Map()).set(q.id, { p: q.p.slice(), at: t });
  }

  function start(h, t) {
    const z = api.map().zones?.rescue;
    if (!z) return;
    const goal = [(z.min[0] + z.max[0]) / 2, 0.1, Math.max(z.min[1], Math.min(z.max[1], h.p[2]))];
    h.routing = true;
    const asked = api.route(h.p, goal, pts => {
      h.routing = false;
      const now = api.now();
      if (!pts || h.state !== 'idle' || h.heldBy != null || h.carriedBy != null || tied(h, now) || game.phase !== 'live') { h.retryAt = now + 10000; return; }
      const bolt = scared(h, now, PANIC.fight); // realism 11.2: in a fight it runs for it
      Object.assign(h, { state: 'escape', bolt, leader: null, trail: pts.map(w => w.p), stuck: 0, stuckAt: now + 1000, stuckPos: h.p.slice() });
      api.broadcast({ t: 'msg', text: bolt ? 'A panicked hostage is running for it! Catch it before it reaches the CT base.' : 'A hostage is sneaking away! Catch it before it reaches the CT base.' }, q => q.team === 'T');
      api.broadcast({ t: 'msg', text: bolt ? 'A panicked hostage is running to the CT base: cover it, it can be hit in the crossfire!' : 'A hostage is escaping on its own: cover it to the CT base!' }, q => q.team === 'CT');
    });
    if (!asked) { h.routing = false; h.retryAt = t + 5000; }
  }

  function stop(h, t, by = null) {
    Object.assign(h, { state: 'idle', trail: [], watchedAt: t, retryAt: t + 5000 });
    h.v[0] = h.v[2] = 0;
    if (by) msg(by, 'You caught a hostage sneaking off. Keep an eye on it, or crouch and hold E to zip-tie it.');
  }

  function walk(h, t, dt) {
    while (h.trail.length && d2(h.trail[0], h.p) < 0.4) h.trail.shift();
    const target = h.trail[0];
    if (!target) { stop(h, t); return; } // the end of its path (in the rescue zone it's rescued first: server.js)
    const boxes = api.near(h.p), x0 = h.p[0], y0 = h.p[1], z0 = h.p[2];
    const dx = target[0] - h.p[0], dz = target[2] - h.p[2], d = Math.hypot(dx, dz) || 1;
    // clipping a door frame's corner: side-step round it (as a led hostage does, lib/hostages.js)
    const side = sideStep(boxes, h.p, dx / d, dz / d);
    const mx = side ? (dx / d) * 0.25 - (dz / d) * side : dx, mz = side ? (dz / d) * 0.25 + (dx / d) * side : dz, m = Math.hypot(mx, mz) || 1;
    const speed = h.bolt ? PANIC.speed : ESCAPE.speed;
    h.v[0] = (mx / m) * speed;
    h.v[2] = (mz / m) * speed;
    h.yaw = Math.atan2(-dx, -dz);
    if (h.onGround && target[1] > h.p[1] + 0.55 && d < 1.5) { h.v[1] = PLAYER.jump; h.onGround = false; }
    // (as in lib/hostages.js: on a thin floor board, stand on it, so a step can't push the body out under the floor)
    for (const b of boxes) if (b.max[1] > y0 && b.max[1] < y0 + 0.05 && overlapsBox(x0, y0, z0, PLAYER.radius, PLAYER.height, b)) h.p[1] = Math.max(h.p[1], b.max[1]);
    movePlayer(h, dt, boxes);
    if (Math.hypot(h.p[0] - x0, h.p[2] - z0) > 6 * dt + 0.3) { h.p[0] = x0; h.p[1] = y0; h.p[2] = z0; h.v[0] = h.v[2] = 0; }
    // Not getting anywhere: a shut door in the way gets opened; still stuck after that, it gives up for now.
    if (t >= h.stuckAt) {
      if (d2(h.p, h.stuckPos) < 0.3) { if (!api.openDoorNear(h.p) && ++h.stuck > 3) stop(h, t); }
      else h.stuck = 0;
      h.stuckAt = t + 1000;
      h.stuckPos = h.p.slice();
    }
  }

  function tick(t, dt) {
    if (!game.hostages.length) return;
    const look = t >= next;
    if (look) next = t + 500;
    for (const h of game.hostages) {
      if (h.tiedUntil && !tied(h, t)) h.tiedUntil = 0; // worked loose
      h.duck = free(h) && scared(h, t, PANIC.duck); // realism 11.2: ducking, hands over its head
      if (h.state === 'dead' || h.state === 'rescued') continue;
      if (look) spot(h, t); // realism 11.3: the Terrorists it sees
      if (h.state === 'follow' && !h.told && game.phase === 'live') { h.told = true; tell(h, t); } // realism 11.3: led for the first time this round
      if (h.state === 'escape') {
        const by = look && watcher(h, ESCAPE.catchAt);
        if (by || game.phase !== 'live') stop(h, t, by || null);
        else walk(h, t, dt);
        continue;
      }
      if (h.state !== 'idle' || h.heldBy != null || h.carriedBy != null || h.hp <= CARRY.hurt || tied(h, t) || game.phase !== 'live') { h.watchedAt = t; continue; } // (carry: a badly hurt one can't walk)
      if (!look) continue;
      if (watcher(h, ESCAPE.sight)) h.watchedAt = t;
      else if (t - (h.watchedAt ??= t) > (scared(h, t, PANIC.fight) ? PANIC.after : ESCAPE.after) * 1000 && !h.routing && t >= (h.retryAt || 0)) start(h, t);
    }
  }

  const nearest = (p, ok) => game.hostages.filter(h => ok(h) && api.reach(p, h)).sort((a, b) => d3(p.p, a.p) - d3(p.p, b.p))[0];

  return {
    tick,
    fright,
    duck: h => (h.duck ? 1 : 0),
    tied: h => (tied(h, api.now()) ? 1 : 0),
    // E (before the shield's and the CTs' lead): a crouched Terrorist starts zip-tying; a CT starts cutting the ties.
    use(p, t) {
      if (!game.hostages.length || p.bot || !p.alive || (game.phase !== 'live' && game.phase !== 'warmup')) return false;
      if (p.team === 'T' && p.c) {
        const h = nearest(p, x => (x.state === 'idle' || x.state === 'escape') && x.heldBy == null && x.carriedBy == null && !tied(x, t));
        if (!h) return false;
        if (h.state === 'escape') stop(h, t);
        p.act = { type: 'tie', h: h.id, start: t, pos: p.p.slice(), dur: ESCAPE.tie * 1000 };
        return true;
      }
      if (p.team === 'CT') {
        const h = nearest(p, x => x.state === 'idle' && x.heldBy == null && tied(x, t));
        if (!h) return false;
        p.act = { type: 'untie', h: h.id, start: t, pos: p.p.slice(), dur: ESCAPE.untie * 1000 };
        return true;
      }
      return false;
    },
    // A tie or untie in progress (hold E): ends if he moves, stands up (tying), or the hostage is gone or grabbed.
    act(p, a, t) {
      const h = game.hostages.find(x => x.id === a.h);
      if (!p.alive || !h || h.state !== 'idle' || h.heldBy != null || d2(p.p, a.pos) > 0.6 || !api.reach(p, h) || (a.type === 'tie' && !p.c)) { p.act = null; return; }
      if (t - a.start < a.dur) return;
      p.act = null;
      if (a.type === 'tie') {
        h.tiedUntil = t + ESCAPE.loose * 1000;
        msg(p, `Hostage zip-tied. The ties work loose in ${ESCAPE.loose} s.`);
      } else {
        h.tiedUntil = 0;
        api.lead(p, h);
        msg(p, 'You cut the ties. The hostage is following you: lead it to the CT base!');
      }
      api.broadcast({ t: 'sfx', s: 'hostage', p: h.p });
    },
  };
}
