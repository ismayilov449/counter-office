// Phone tracker (ROADMAP group 14, version 1; the rules and numbers: shared/phonetracker.js). One tracker per CT team,
// given to a CT at the round start (p.inv.tracker = 1; dropped where its holder dies, only a CT picks it up); its
// scans (game-wide for the round: the team has one device) take TRACKER.scanTime s. The first scan of a round only
// counts the phones; the others send every CT a circle per phone ('trk'). Every phone a scan reaches buzzes (heard
// within TRACKER.heard m) and tells its Terrorist which way the scan came from ('trkHit'). A jammer hides the phones
// round it, and the tracker points at a jammer near it.
import { TRACKER, circleRadius, circleCentre, floorOf, compass } from '../shared/phonetracker.js';
import { isUnderground } from '../shared/underground.js';
import { warOn } from '../shared/war.js';
import { dist3, r2 } from '../shared/util.js';

// api: { game, players, cfg, map(), world(), now, send, sendMe, jammedAt(pos), jammers(), dropAt(p) (a drop of the
//        tracker where p stands), eyeOf(p) }
export function createPhoneTracker(api) {
  const { game, players, send } = api;
  let left = 0, counted = false;
  const still = new Map(); // phone (player id) -> { p: where the last scan found it, n: scans in a row it stood there }
  const on = () => warOn(api.cfg.phoneTracker, api.map()) && game.hostages.length > 0;
  const toCTs = m => { for (const q of players.values()) if (q.team === 'CT') send(q, m); };
  const holder = () => [...players.values()].find(q => q.inv?.tracker > 0) || null;

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

  // The phones a scan starting now finds: every living Terrorist's, and a dead one's for TRACKER.dead s.
  function phones(t) {
    const list = [];
    for (const q of players.values()) {
      if (q.team !== 'T') continue;
      const dead = !q.alive;
      if (dead && !(q.deathAt >= game.roundStartAt && t - q.deathAt < TRACKER.dead * 1000)) continue;
      const before = q.history?.find(h => h.t >= t - 500);
      const walking = !dead && !!before && Math.hypot(q.p[0] - before.p[0], q.p[2] - before.p[2]) > TRACKER.circle.walking;
      list.push({ id: q.id, p: q.p.slice(), dead, walking });
    }
    return list;
  }

  function finish(p, s, t) {
    left--;
    const found = s.phones.filter(ph => !api.jammedAt(ph.p));
    const msg = { t: 'trk', at: s.at, from: [r2(s.from[0]), r2(s.from[2])], left, by: p.id };
    if (!counted) {
      counted = true;
      msg.count = found.length;
    } else {
      msg.c = found.map(ph => {
        const d = dist3(s.from, ph.p), under = isUnderground(api.map(), ph.p);
        const st = still.get(ph.id);
        const n = !ph.walking && st && dist3(st.p, ph.p) < TRACKER.circle.moved ? st.n + 1 : 0;
        still.set(ph.id, { p: ph.p, n });
        const r = circleRadius({ d, walls: wallsBetween(s.from, [ph.p[0], ph.p[1] + 1, ph.p[2]]), under, still: n, moving: ph.walking });
        const [x, z] = circleCentre(ph.p, r);
        return [r2(x), r2(z), r2(r), d < TRACKER.floor ? floorOf(ph.p, under) : 0];
      });
      // a jammer near the tracker: its direction (from the scan's spot), so the CTs know where to look
      msg.jam = api.jammers().filter(j => j.team === 'T' && dist3(j.p, s.from) < TRACKER.jam).map(j => r2(Math.atan2(-(j.p[0] - s.from[0]), -(j.p[2] - s.from[2]))));
    }
    toCTs(msg);
    // every phone the scan reached buzzes; its Terrorist learns which way the fake tower is
    for (const ph of found) {
      const q = players.get(ph.id);
      if (q && !ph.dead) send(q, { t: 'trkHit', dir: compass(ph.p, s.from) });
      for (const r of players.values()) if (r !== q && r.alive && dist3(r.p, ph.p) < TRACKER.heard) send(r, { t: 'sfx', s: 'buzz', p: ph.p.map(r2) });
    }
  }

  return {
    on,
    // At the round start: the tracker goes to one CT (a person, not a bot), with 8 fresh scans.
    roundStart() {
      for (const q of players.values()) { if (q.inv) q.inv.tracker = 0; q.trkScan = null; }
      left = TRACKER.scans;
      counted = false;
      still.clear();
      if (!on()) return;
      const cts = [...players.values()].filter(q => q.team === 'CT' && q.alive && !q.bot);
      if (!cts.length) return;
      const h = cts[Math.floor(Math.random() * cts.length)];
      h.inv.tracker = 1;
      api.sendMe(h);
      toCTs({ t: 'trkInfo', holder: h.id, left });
      send(h, { t: 'msg', text: 'You have the phone tracker: 6 takes it out, click to scan. Cover each other while it scans.', big: true });
      for (const q of players.values()) {
        if (q.team === 'CT' && q !== h) send(q, { t: 'msg', text: `${h.name} has the phone tracker. Cover them while they scan.` });
        if (q.team === 'T') send(q, { t: 'msg', text: 'The CTs have a phone tracker. Your phone is always on: stand still and they pinpoint you — keep moving.', big: true });
      }
    },
    // Mouse1 with the tracker out.
    scan(p, t) {
      if (!on() || !(p.inv?.tracker > 0) || !p.alive || p.trkScan || game.phase !== 'live') return;
      if (left <= 0) return send(p, { t: 'msg', text: 'The tracker\'s battery is flat: no scans left this round.' });
      const from = api.eyeOf(p);
      if (api.jammedAt(from)) return send(p, { t: 'msg', text: 'NO SIGNAL — a jammer is near. Find it and shoot it.' });
      p.trkScan = { at: t, from, phones: phones(t) };
      send(p, { t: 'trkScan', at: t, dur: TRACKER.scanTime * 1000 });
    },
    tick(t) {
      for (const p of players.values()) {
        const s = p.trkScan;
        if (!s) continue;
        if (!p.alive || !(p.inv?.tracker > 0) || p.w !== 'tracker' || game.phase !== 'live') { p.trkScan = null; send(p, { t: 'trkScan', cancel: 1 }); continue; }
        if (t - s.at >= TRACKER.scanTime * 1000) { p.trkScan = null; finish(p, s, t); }
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
  };
}
