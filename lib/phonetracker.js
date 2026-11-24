// Phone tracker (ROADMAP group 14; the rules and numbers: shared/phonetracker.js). One tracker per CT team, given to a
// CT at the round start (p.inv.tracker = 1; dropped where its holder dies, only a CT picks it up); its scans (for the
// round: the team has one device) take TRACKER.scanTime s. The first scan of a round only counts the phones; the
// others send every CT a circle per phone ('trk'). Every phone a scan reaches buzzes (heard within TRACKER.heard m) and
// tells its Terrorist which way the scan came from ('trkHit'). A jammer hides the phones round it, and the tracker
// points at a jammer near it.
// Version 2: the map's cell towers (map.towers): shot or blown up, each one down makes every circle bigger until a CT
// repairs it (hold E); a CT flying a drone scans from it (R; sharper circles outdoors); every hostage has a phone too
// (white circles, msg.h) until a Terrorist zip-ties it (he takes the phone).
import { TRACKER, circleRadius, circleCentre, floorOf, compass } from '../shared/phonetracker.js';
import { isUnderground } from '../shared/underground.js';
import { rayAABB } from '../shared/physics.js';
import { warOn } from '../shared/war.js';
import { dist3, r2 } from '../shared/util.js';

const centre = b => b.min.map((v, i) => (v + b.max[i]) / 2);

// api: { game, players, cfg, map(), world(), now, send, sendMe, broadcast, jammedAt(pos), jammers(), dropAt(p) (a drop
//        of the tracker where p stands), eyeOf(p), drone(p) (the drone p is flying, or null), los(a, b) }
export function createPhoneTracker(api) {
  const { game, players, send } = api;
  let left = 0, counted = false, issued = false, towers = [];
  const still = new Map(); // phone ('p' + player id, 'h' + hostage id) -> { p: where the last scan found it, n: scans in a row it stood there }
  const on = () => warOn(api.cfg.phoneTracker, api.map()) && game.hostages.length > 0;
  const toCTs = m => { for (const q of players.values()) if (q.team === 'CT') send(q, m); };
  const holder = () => [...players.values()].find(q => q.inv?.tracker > 0) || null;
  const towersDown = () => towers.filter(w => w.down).length;
  // outdoors: not underground and in none of the map's rooms (the house, the garage, the shed...)
  const outdoors = p => !isUnderground(api.map(), p) && !(api.map().rooms || []).some(r => [0, 1, 2].every(k => p[k] > r.min[k] && p[k] < r.max[k]));

  // Walls and floors between a and b: rays along the line, each solid thing it passes through counts once.
  function wallsBetween(a, b) {
    const d = b.map((v, i) => v - a[i]), len = Math.hypot(...d);
    if (len < 0.1) return 0;
    const u = d.map(v => v / len);
    let at = 0, n = 0;
    while (n < TRACKER.circle.walls) {
      const from = a.map((v, i) => v + u[i] * at);
      const hit = api.world().raycast(from, u, len - at, 'bullet');
      if (!hit || at + hit.t >= len - 0.1) break;
      n++;
      at += hit.t + 0.4; // through it (a wall is about 0.2-0.3 m thick)
    }
    return n;
  }

  // The phones a scan starting now finds: every living Terrorist's, a dead one's for TRACKER.dead s, and the hostages'
  // (alive, still with their phones).
  function phones(t) {
    const list = [];
    for (const q of players.values()) {
      if (q.team !== 'T') continue;
      const dead = !q.alive;
      if (dead && !(q.deathAt >= game.roundStartAt && t - q.deathAt < TRACKER.dead * 1000)) continue;
      const before = q.history?.find(h => h.t >= t - 500);
      const walking = !dead && !!before && Math.hypot(q.p[0] - before.p[0], q.p[2] - before.p[2]) > TRACKER.circle.walking;
      list.push({ key: 'p' + q.id, id: q.id, p: q.p.slice(), dead, walking });
    }
    for (const h of game.hostages) {
      if (h.state === 'dead' || h.state === 'rescued' || h.noPhone) continue;
      list.push({ key: 'h' + h.id, hostage: true, p: h.p.slice(), walking: h.state === 'follow' || h.state === 'escape' });
    }
    return list;
  }

  function circle(s, ph) {
    const d = dist3(s.from, ph.p), under = isUnderground(api.map(), ph.p);
    const st = still.get(ph.key);
    const n = !ph.walking && st && dist3(st.p, ph.p) < TRACKER.circle.moved ? st.n + 1 : 0;
    still.set(ph.key, { p: ph.p, n });
    const sharp = s.drone && outdoors(ph.p) ? TRACKER.drone.outdoors : 1; // the drone's antenna: sharper outdoors
    const r = circleRadius({ d, walls: wallsBetween(s.from, [ph.p[0], ph.p[1] + 1, ph.p[2]]), under, still: n, moving: ph.walking, towersDown: towersDown(), sharp });
    const [x, z] = circleCentre(ph.p, r);
    return [r2(x), r2(z), r2(r), d < TRACKER.floor ? floorOf(ph.p, under) : 0];
  }

  function finish(p, s) {
    left--;
    const found = s.phones.filter(ph => !api.jammedAt(ph.p));
    const ts = found.filter(ph => !ph.hostage), hs = found.filter(ph => ph.hostage);
    const msg = { t: 'trk', at: s.at, from: [r2(s.from[0]), r2(s.from[2])], left, by: p.id, drone: s.drone ? 1 : 0, down: towersDown() };
    if (!counted) {
      counted = true;
      msg.count = ts.length;
    } else {
      msg.c = ts.map(ph => circle(s, ph));
      msg.h = hs.map(ph => circle(s, ph)); // the hostages' phones: white circles
      // a jammer near the scan: its direction (from the scan's spot), so the CTs know where to look
      msg.jam = api.jammers().filter(j => j.team === 'T' && dist3(j.p, s.from) < TRACKER.jam).map(j => r2(Math.atan2(-(j.p[0] - s.from[0]), -(j.p[2] - s.from[2]))));
    }
    toCTs(msg);
    // every phone the scan reached buzzes; its Terrorist learns which way the fake tower is
    for (const ph of found) {
      const q = ph.id != null ? players.get(ph.id) : null;
      if (q && !ph.dead) send(q, { t: 'trkHit', dir: compass(ph.p, s.from) });
      for (const r of players.values()) if (r !== q && r.alive && dist3(r.p, ph.p) < TRACKER.heard) send(r, { t: 'sfx', s: 'buzz', p: ph.p.map(r2) });
    }
  }

  // A cell tower knocked out (by: who did it, or null).
  function knock(i) {
    const w = towers[i], T = api.map().towers[i];
    if (!w || w.down) return;
    w.down = true;
    api.broadcast({ t: 'sfx', s: 'twrdown', p: centre(T.box).map(r2) });
    api.broadcast({ t: 'msg', text: `The ${T.name} cell tower is down: the CTs' tracker is less accurate until a CT repairs it.` });
  }

  return {
    on,
    // At the round start: the tracker goes to one CT (a person, not a bot), with 8 fresh scans; the towers stand again.
    roundStart() {
      for (const q of players.values()) { if (q.inv) q.inv.tracker = 0; q.trkScan = null; }
      left = TRACKER.scans;
      counted = false;
      issued = false;
      still.clear();
      towers = (api.map().towers || []).map(() => ({ hp: TRACKER.tower.hits, down: false }));
      if (!on()) return;
      const cts = [...players.values()].filter(q => q.team === 'CT' && q.alive && !q.bot);
      if (!cts.length) return;
      const h = cts[Math.floor(Math.random() * cts.length)];
      h.inv.tracker = 1;
      issued = true;
      api.sendMe(h);
      toCTs({ t: 'trkInfo', holder: h.id, left });
      send(h, { t: 'msg', text: 'You have the phone tracker: 6 takes it out, click to scan. Cover each other while it scans.', big: true });
      for (const q of players.values()) {
        if (q.team === 'CT' && q !== h) send(q, { t: 'msg', text: `${h.name} has the phone tracker. Cover them while they scan. (Flying a drone, R scans from it.)` });
        if (q.team === 'T') send(q, { t: 'msg', text: 'The CTs have a phone tracker. Your phone is always on: stand still and they pinpoint you — keep moving. Knock out a cell tower to blur their scans.', big: true });
      }
    },
    // Mouse1 with the tracker out, or R flying a drone (m.drone).
    scan(p, t, fromDrone = false) {
      if (!on() || !p.alive || p.trkScan || game.phase !== 'live') return;
      const d = fromDrone ? api.drone(p) : null;
      if (fromDrone ? !d || p.team !== 'CT' || !issued : !(p.inv?.tracker > 0)) return;
      if (left <= 0) return send(p, { t: 'msg', text: 'The tracker\'s battery is flat: no scans left this round.' });
      const from = d ? d.p.slice() : api.eyeOf(p);
      if (api.jammedAt(from)) return send(p, { t: 'msg', text: 'NO SIGNAL — a jammer is near. Find it and shoot it.' });
      p.trkScan = { at: t, from, phones: phones(t), drone: d ? d.id : null };
      send(p, { t: 'trkScan', at: t, dur: TRACKER.scanTime * 1000, drone: d ? 1 : 0 });
    },
    tick(t) {
      for (const p of players.values()) {
        const s = p.trkScan;
        if (!s) continue;
        const busy = s.drone != null ? api.drone(p)?.id !== s.drone : !(p.inv?.tracker > 0) || p.w !== 'tracker';
        if (!p.alive || busy || game.phase !== 'live') { p.trkScan = null; send(p, { t: 'trkScan', cancel: 1 }); continue; }
        if (t - s.at >= TRACKER.scanTime * 1000) { p.trkScan = null; finish(p, s); }
      }
    },
    // Its holder died (or left): it lies where he fell.
    drop(p) {
      if (!(p.inv?.tracker > 0)) return;
      p.inv.tracker = 0;
      p.trkScan = null;
      api.dropAt(p);
      toCTs({ t: 'trkInfo', holder: 0, left });
    },
    // Walking over it (or E): a CT picks it up.
    take(p) {
      if (p.team !== 'CT' || p.bot || holder()) return false;
      p.inv.tracker = 1;
      send(p, { t: 'msg', text: `You picked up the phone tracker (${left} scans left). 6 takes it out.` });
      toCTs({ t: 'trkInfo', holder: p.id, left });
      return true;
    },
    // A Terrorist inside a jammer's area has no signal either: no radio from or to him.
    noSignal: p => on() && p.team === 'T' && api.jammedAt(p.p),

    // ---- cell towers (14.5)
    // A bullet along o + d*t up to endT: a standing tower's cabinet in the way takes a hit.
    shoot(o, d, endT) {
      if (!on()) return;
      towers.forEach((w, i) => {
        const b = api.map().towers[i].box;
        if (!w.down && rayAABB(o, d, b.min, b.max, endT + 0.1) && --w.hp <= 0) knock(i);
      });
    },
    // A blast of radius r at `at`: a cabinet within TRACKER.tower.blast m (or half the blast's radius) in its sight goes.
    blast(at, r) {
      if (!on()) return;
      towers.forEach((w, i) => {
        const c = centre(api.map().towers[i].box);
        if (!w.down && dist3(c, at) < Math.max(TRACKER.tower.blast, r * 0.5) && api.los(at, c)) knock(i);
      });
    },
    // E: a CT next to a tower that is down starts repairing it.
    use(p, t) {
      if (!on() || p.team !== 'CT' || !p.alive) return false;
      const i = towers.findIndex((w, k) => w.down && near(p, api.map().towers[k].box));
      if (i < 0) return false;
      p.act = { type: 'twr', i, start: t, pos: p.p.slice(), dur: TRACKER.tower.repair * 1000 };
      return true;
    },
    act(p, a, t) {
      const w = towers[a.i];
      if (!p.alive || !w?.down || Math.hypot(p.p[0] - a.pos[0], p.p[2] - a.pos[2]) > 0.6) { p.act = null; return; }
      if (t - a.start < a.dur) return;
      p.act = null;
      w.down = false;
      w.hp = TRACKER.tower.hits;
      const T = api.map().towers[a.i];
      api.broadcast({ t: 'sfx', s: 'twrup', p: centre(T.box).map(r2) });
      api.broadcast({ t: 'msg', text: `${p.name} repaired the ${T.name} cell tower.` });
    },
    // The snapshot: which towers are down (only while one is).
    snap: () => (on() && towers.some(w => w.down) ? { tw: towers.map(w => (w.down ? 1 : 0)) } : {}),

    // ---- the hostages' phones (14.7): a Terrorist zip-tying a hostage takes its phone.
    tied(p, h) {
      if (!on() || h.noPhone) return;
      h.noPhone = true;
      send(p, { t: 'msg', text: 'You took the hostage\'s phone: the CTs\' tracker can\'t see it any more.' });
    },
  };
}

// p within reach of the box (its feet near the box's floor, flat distance to its sides).
function near(p, b) {
  const dx = Math.max(b.min[0] - p.p[0], 0, p.p[0] - b.max[0]), dz = Math.max(b.min[2] - p.p[2], 0, p.p[2] - b.max[2]);
  return Math.hypot(dx, dz) < TRACKER.tower.reach && Math.abs(p.p[1] - b.min[1]) < 1.5;
}
