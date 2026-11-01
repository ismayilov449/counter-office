// Human shield (hostage maps): a Terrorist presses E on a hostage to hold it in front of him, an arm round its neck.
// E again lets it go; so does dying or being downed. While he holds it he walks (no running, jumping or ducking: his
// browser keeps to that) and fires only his pistol.
//
// State: p.shield = the id of the hostage he holds (null or undefined when none); the hostage gets h.heldBy = his id
// and stays a waiting hostage (state 'idle'), so the round logic doesn't change. Every tick the hostage is put in front
// of him (update). CTs can't lead a held hostage. Bullets that reach it hurt it as usual (hurtHostage: killing it costs
// $1500) and a CT who hits it is told so. Clients learn who holds whom from the snapshot key `sh`
// ([[hostage id, holder id], ...], only while someone holds one) and the messages shieldGrab / shieldDrop.
import { PLAYER, overlapsAny, rayPlayer, ladderAt } from '../shared/physics.js';
import { SHIELD, heldSpot, rayHeld } from '../shared/shield.js';

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// api: { players, game, now, send, broadcast, world(), map() }
export function initShield(api) {
  const { players, game, now, send, broadcast } = api;
  const msg = (p, text) => send(p, { t: 'msg', text });
  const hostageById = id => game.hostages.find(h => h.id === id) || null;
  const boxesAt = (x, y, z) => api.world().move(null, [x, y, z], 2);
  // Held: a slim body from knee height up may not be in a wall (so it goes up stairs and through doors).
  const blocked = (x, y, z) => !!overlapsAny(boxesAt(x, y, z), x, y + PLAYER.step, z, 0.22, PLAYER.height - PLAYER.step);
  // Let go: a whole standing body must fit.
  const fits = (x, y, z) => !overlapsAny(boxesAt(x, y, z), x, y + 0.05, z, PLAYER.radius, PLAYER.height - 0.05);
  const seen = (p, h) => {
    const eye = [p.p[0], p.p[1] + (p.c ? PLAYER.crouchEye : PLAYER.eye), p.p[2]], chest = [h.p[0], h.p[1] + 1.1, h.p[2]];
    const d = chest.map((v, i) => v - eye[i]), len = Math.hypot(...d);
    if (len < 0.05) return true;
    const hit = api.world().raycast(eye, d.map(v => v / len), len, 'bullet');
    return !hit || hit.t >= len - 0.2;
  };
  const lastWarn = new Map(); // CT id -> when they were last told they hit a held hostage

  // Why a hold ends now (or null): the holder left, died, was downed, changed team, the round is over, he has no
  // pistol, got into a car or a drone's controls, or climbs a ladder; or the hostage died.
  function holdBreak(p, h) {
    if (!p) return 'left';
    if (h.state !== 'idle') return h.state === 'dead' ? 'dead' : 'gone';
    if (!p.alive) return 'died';
    if (p.downed) return 'downed'; // (p.downed: a downed player, from the "downed" feature)
    if (p.team !== 'T') return 'team';
    if (game.phase !== 'live' && game.phase !== 'warmup') return 'round';
    if (!p.inv.secondary) return 'nopistol';
    if (p.driving != null || p.riding != null || p.piloting != null || p.zip || p.cctv) return 'busy';
    const l = ladderAt(api.map().ladders, p.p, PLAYER.height);
    if (l && p.p[1] > l.min[1] + 0.4) return 'ladder';
    return null;
  }

  // Put the hostage in front of its holder and remember where (for lag compensation, like a player's history).
  function place(h, p, t) {
    h.p = heldSpot(p.p, p.yaw, blocked);
    h.yaw = p.yaw;
    h.v = [0, 0, 0];
    h.onGround = true;
    const hist = h.shHist || (h.shHist = []);
    hist.push({ t, p: h.p.slice(), yaw: h.yaw });
    while (hist.length > 2 && hist[0].t < t - 1000) hist.shift();
  }

  // Where the hostage was at render time rt (what the shooter saw), like rewind() in server.js.
  function heldAt(h, rt) {
    const hist = h.shHist, t = now();
    if (!isNum(rt) || !hist || hist.length < 2) return { p: h.p, yaw: h.yaw };
    rt = Math.max(t - 400, Math.min(t, rt));
    if (rt <= hist[0].t) return hist[0];
    for (let i = hist.length - 1; i > 0; i--) {
      const a = hist[i - 1], b = hist[i];
      if (a.t <= rt && rt <= b.t) {
        const f = (rt - a.t) / (b.t - a.t || 1);
        return { p: [0, 1, 2].map(k => a.p[k] + (b.p[k] - a.p[k]) * f), yaw: f < 0.5 ? a.yaw : b.yaw };
      }
    }
    return { p: h.p, yaw: h.yaw };
  }

  function grab(p, h, t) {
    const leader = h.state === 'follow' ? players.get(h.leader) : null;
    h.state = 'idle';
    h.leader = null;
    h.trail = [];
    h.heldBy = p.id;
    h.shHist = [];
    p.shield = h.id;
    p.act = null;
    place(h, p, t);
    if (leader) msg(leader, 'A Terrorist grabbed the hostage you were leading!');
    msg(p, 'You hold a hostage as a shield. You can only walk and use your pistol. E lets go.');
    broadcast({ t: 'shieldGrab', id: p.id, h: h.id, p: [h.p[0], h.p[1] + 1.5, h.p[2]] });
  }

  function release(h, p, why) {
    h.heldBy = null;
    h.shHist = null;
    if (h.state === 'idle') {
      // Set it down where it stands if a body fits there, else in front of the holder or where he stands.
      if (!fits(...h.p) && p) {
        const s = heldSpot(p.p, p.yaw, (x, y, z) => !fits(x, y, z));
        h.p = fits(...s) ? s : p.p.slice();
      }
      h.v = [0, 0, 0];
      h.onGround = false;
      h.checkPos = h.p.slice();
    }
    if (p && p.shield === h.id) p.shield = null;
    broadcast({ t: 'shieldDrop', id: p ? p.id : 0, h: h.id, why });
    if (p && why === 'let go') msg(p, 'You let the hostage go.');
    else if (p && why === 'nopistol') msg(p, 'No pistol: you let the hostage go.');
    else if (p && why === 'ladder') msg(p, "You can't climb with a hostage: you let it go.");
  }

  return {
    // Let go at once (another feature's hook: going down, or playing dead, which must look like a death: 'died').
    letGo(p, why) {
      if (p.shield == null) return;
      const h = hostageById(p.shield);
      if (h && h.heldBy === p.id) release(h, p, why); else p.shield = null;
    },
    // The use key (E). Returns true when it was about the shield (then nothing else happens).
    use(p, t) {
      if (p.shield != null) {
        const h = hostageById(p.shield);
        if (h && h.heldBy === p.id) release(h, p, 'let go');
        else p.shield = null;
        return true;
      }
      if (!game.hostages.length) return false;
      if (p.team === 'CT') {
        // the hostage a CT would take along (the same rule as in onUse): not while a Terrorist holds it
        const h = game.hostages
          .filter(x => (x.state === 'idle' || x.state === 'follow') && dist3(p.p, x.p) < 2.2)
          .sort((a, b) => dist3(p.p, a.p) - dist3(p.p, b.p))[0];
        if (!h || h.heldBy == null) return false;
        msg(p, "A Terrorist holds this hostage as a shield: you can't lead it away. Take him down first.");
        return true;
      }
      if (p.team !== 'T' || p.bot || p.zombie || p.downed || !p.alive) return false;
      if (game.phase !== 'live' && game.phase !== 'warmup') return false;
      const h = game.hostages
        .filter(x => (x.state === 'idle' || x.state === 'follow') && x.heldBy == null && dist3(p.p, x.p) < SHIELD.reach && Math.abs(p.p[1] - x.p[1]) < 1)
        .sort((a, b) => dist3(p.p, a.p) - dist3(p.p, b.p))[0];
      if (!h || !seen(p, h)) return false;
      if (!p.inv.secondary) { msg(p, 'You need a pistol to take a hostage as a shield.'); return true; }
      grab(p, h, t);
      return true;
    },

    // A shot the server should drop: a holder fires only his pistol; a bot holds its fire while a held hostage is in
    // the way (before its target, or before the wall when it would miss).
    blocksShot(p, w, o, dirs) {
      if (p.shield != null) return p.inv.secondary?.id !== w;
      if (!p.bot || !game.hostages.some(h => h.heldBy != null && h.state === 'idle')) return false;
      const q = p.bot.target != null ? players.get(p.bot.target) : null;
      for (const d of dirs) {
        const wall = api.world().raycast(o, d, 250, 'bullet');
        let far = wall ? wall.t : 250;
        const hit = q && q.alive ? rayPlayer(o, d, q.p, q.c, far) : null;
        if (hit) far = hit.t;
        for (const h of game.hostages) {
          if (h.heldBy == null || h.state !== 'idle' || h.heldBy === p.id) continue;
          if (rayHeld(o, d, h.p, h.yaw, far)) return true;
        }
      }
      return false;
    },

    // A bullet against a held hostage (where the shooter saw it, at rt), or null. Its holder shoots past it.
    rayHostage(h, shooter, o, d, rt, maxT) {
      if (h.heldBy === shooter.id) return null;
      const s = heldAt(h, rt);
      return rayHeld(o, d, s.p, s.yaw, maxT);
    },

    // A bullet hit a hostage (after hurtHostage): a CT who hits a held one is told why that's bad.
    hostageHit(h, attacker) {
      if (h.heldBy == null || !attacker || attacker.team !== 'CT') return;
      const t = now();
      if (t - (lastWarn.get(attacker.id) || -1e9) < 1500) return;
      lastWarn.set(attacker.id, t);
      msg(attacker, h.state === 'dead'
        ? 'You killed the hostage the Terrorist was hiding behind!'
        : 'You hit the hostage! The Terrorist hides behind it: aim at his head or his sides. Killing it costs $1500.');
    },

    // Every tick: held hostages follow their holders; holds that end are ended.
    update(t) {
      for (const h of game.hostages) {
        if (h.heldBy == null) continue;
        const p = players.get(h.heldBy);
        const why = holdBreak(p, h);
        if (why) release(h, p, why);
        else place(h, p, t);
      }
      // a holder whose hostage is gone (a new round brings new hostages)
      for (const p of players.values()) {
        if (p.shield == null) continue;
        const h = hostageById(p.shield);
        if (!h || h.heldBy !== p.id) { p.shield = null; send(p, { t: 'shieldDrop', id: p.id, h: -1, why: 'round' }); }
      }
    },

    // The snapshot's `sh` key, only while someone holds a hostage.
    snap() {
      let sh = null;
      for (const h of game.hostages) if (h.heldBy != null) (sh || (sh = [])).push([h.id, h.heldBy]);
      return sh ? { sh } : {};
    },
  };
}
