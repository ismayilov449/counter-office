// The lift in the Mansion: the server's part. The shaft is in the level (shared/maps/mansion_elevator.js); the maths both
// sides share (the cabin's motion, the doors, the moving boxes, what E aims at) is in shared/elevator.js; the browser's
// part (drawing, sounds, riding it smoothly, the hint) is public/js/elevator.js.
//
// The server owns the lift: where the cabin is going and when it set off, each door set's state, the calls, the roof
// hatch. It sends all of it in an 'elevState' message whenever any of it changes (and to whoever joins); both sides then
// work the cabin's height and the doors out from the clock, so a normal ride needs no corrections. Each tick it moves the
// cabin's and the doors' boxes in the collision world (world.elev) and carries along whatever is inside or on the roof:
// players and bots, hostages, dropped weapons, mines, satchel charges stuck to it.
//   - Calls (E at a landing's button or a button inside, see aimAt) are served in turn. At a stop the doors open, stay
//     open a few seconds and shut, unless someone stands in the doorway (then they open again). It moves only with every
//     door shut.
//   - The blackout (game.lights.power false) brakes it wherever it is and freezes the doors; nothing answers the buttons.
//     Within ELEV.near of a floor, whoever is inside can pry the doors open (hold E, slow and loud); anywhere, they can
//     climb out of the roof hatch onto the cabin's roof and the ladder in the shaft, and pry a landing's doors open from
//     inside the shaft (E again when they're open climbs out). With the power off, a landing's doors can be pried from
//     outside too. Power back: open doors shut, and it carries on to where it was going (or the nearest floor).
//   - Nobody is crushed: it won't set off upwards with someone on its roof or above it in the shaft (unless there's
//     ELEV.headroom left at the top), nor downwards onto someone below it, and brakes if that changes on the way; a trip
//     someone stays in the way of is given up after ELEV.give seconds. Bots stuck in the shaft are put back on a landing.
//   - Explosions don't hurt it (its boxes aren't breakable pieces); it blocks bullets and blasts like a wall.
//   - Messages: 'elevState' (the state), 'elevSfx' (a sound at a spot), 'elevTo' (where the server put you: out of the
//     hatch, back down it, out of the shaft); from the browser 'elevAim' (what E would do now, or null).
import { ELEV, motionAt, doorAt, nearestStop, inShaft, inCabin, onRoof, roofAt, makeBoxes, placeCabin, placeDoor, doorway, touches, roofSpot, cabinSpot } from '../shared/elevator.js';
import { PLAYER } from '../shared/physics.js';

const r3 = v => Math.round(v * 1000) / 1000;
const r2 = v => Math.round(v * 100) / 100;
const AIM = /^([cbl][0-2]|[hf])$/;

// ctx: map(), world(), now(), players (Map), game, send(p, msg), broadcast(msg), power(), sendMines(), sendSatchels(),
// motorStart(pos, by): called whenever the motor starts (the gas system's sparkAt(pos, 'motor', player) goes there).
export function createElevator(ctx) {
  let E = null, B = null, st = null, y = 0, bound = null;
  const doorX = () => (E.door.x1 + E.door.x2) / 2;
  const at = () => { const n = nearestStop(E, y); return n.d < 0.002 ? n.s : -1; };
  const landingAt = s => [doorX(), E.stops[s] + 1.2, E.out.z2];
  const view = () => ({
    t: 'elevState',
    m: [st.m.y0, st.m.y1, st.m.t0, st.m.tb],
    d: st.d.map(d => d.slice()),
    h: st.h, q: st.target >= 0 ? [st.target, ...st.q] : st.q.slice(), p: st.power ? 1 : 0, rm: st.rm, rs: st.rs,
  });
  const push = () => ctx.broadcast(view());
  const sfx = (s, p) => ctx.broadcast({ t: 'elevSfx', s, p: p.map(r2) });
  const say = (p, text) => ctx.send(p, { t: 'msg', text });

  function setDoor(k, dir, t, dur = ELEV.door) {
    st.d[k] = [r3(doorAt(st.d[k], t)), dir, Math.round(t), dur];
  }
  const doorsShut = t => st.d.every(d => d[1] <= 0 && doorAt(d, t) === 0);
  const bodies = () => {
    const out = [];
    for (const q of ctx.players.values()) if (q.alive && (q.team === 'T' || q.team === 'CT')) out.push(q.p);
    for (const h of ctx.game.hostages || []) if (h.state !== 'dead' && h.state !== 'rescued') out.push(h.p);
    return out;
  };
  const blocked = k => { const b = doorway(E, k, y); return bodies().some(p => touches(b, p)); };

  // How high and how low the cabin may go with whoever is in the shaft outside it.
  function limits() {
    let max = Infinity, min = -Infinity;
    for (const p of bodies()) {
      if (!inShaft(E, p) || inCabin(E, y, p, 0.35)) continue;
      if (p[1] >= roofAt(E, y) - 0.15) max = Math.min(max, E.top - ELEV.headroom - E.cabin.ceil - E.cabin.roof);
      else if (p[1] < y) min = Math.max(min, p[1] + PLAYER.crouchHeight + 0.05 + E.cabin.floor);
    }
    return { min, max };
  }

  function open(s, t, dur = ELEV.door) {
    setDoor(0, 1, t, dur);
    setDoor(1 + s, 1, t, dur);
    st.openUntil = t + (dur + ELEV.hold) * 1000;
    sfx('doors', landingAt(s));
    push();
  }

  // A call to stop s (from its landing or from inside). Returns a message when it can't be served.
  function call(s, t, by) {
    if (!st.power) return 'No power — the lift is dead. (The fuse box is in the cellar.)';
    const r = motionAt(st.m, t);
    st.by = by;
    if (!r.moving && at() === s) {
      const d = st.d[0], o = doorAt(d, t);
      if (d[1] > 0 || (o > 0 && d[1] === 0)) st.openUntil = Math.max(st.openUntil, t + ELEV.hold * 1000);
      else open(s, t);
      return null;
    }
    if (st.target !== s && !st.q.includes(s)) st.q.push(s);
    if (!r.moving && !doorsShut(t)) st.openUntil = Math.min(st.openUntil, t + ELEV.soon * 1000);
    push();
    return null;
  }

  // Put a player somewhere (out of the hatch, back down it, out of the shaft): their browser is told.
  function place(p, pos, crouch) {
    p.p = pos.map(r3);
    p.history = [];
    p.act = null;
    ctx.send(p, { t: 'elevTo', p: p.p, c: crouch ? 1 : 0 });
  }
  // On a landing, in front of its doorway (on its floor: the living room's is 10 cm above the floor you see).
  function landingSpot(s) {
    const x = doorX(), z = E.out.z2 + 0.5, hit = ctx.world().raycast([x, E.stops[s] + 1, z], [0, -1, 0], 2, 'solid');
    return [x, hit ? E.stops[s] + 1 - hit.t + 0.001 : E.stops[s] + 0.001, z];
  }

  function startForce(p, what, s, t) {
    p.act = { type: 'elevforce', what, s, start: t, pos: p.p.slice(), dur: ELEV.force * 1000 };
    sfx('pry', what === 'f' ? [doorX(), y + 1.2, E.cabin.z2] : landingAt(s));
  }
  function force(what, s, t) {
    const r = motionAt(st.m, t), close = Math.abs(y - E.stops[s]) <= ELEV.near;
    if (what === 'f') { setDoor(0, 1, t, ELEV.forced); if (close) setDoor(1 + s, 1, t, ELEV.forced); }
    else { setDoor(1 + s, 1, t, ELEV.forced); if (close && !r.moving) setDoor(0, 1, t, ELEV.forced); }
    st.openUntil = t + (ELEV.forced + ELEV.hold) * 1000;
    sfx('forced', what === 'f' ? [doorX(), y + 1.2, E.cabin.z2] : landingAt(s));
    push();
  }

  function setPower(on, t) {
    st.power = on;
    if (!on) {
      if (motionAt(st.m, t).moving && !st.m.tb) { st.m.tb = Math.round(t); sfx('brake', [doorX(), y + 1.2, E.cabin.z2]); }
      st.d = st.d.map(d => [r3(doorAt(d, t)), 0, Math.round(t), d[3]]);
    } else st.openUntil = t + ELEV.soon * 1000;
    push();
  }

  // Whatever is in the cabin or on its roof moves with it.
  function carry(yPrev, dy) {
    const rides = (p, below) => inCabin(E, yPrev, p, below) || onRoof(E, yPrev, p, 0.2);
    for (const q of ctx.players.values()) if (q.alive && rides(q.p, 0.35)) q.p = [q.p[0], q.p[1] + dy, q.p[2]];
    for (const h of ctx.game.hostages || []) if (h.state !== 'dead' && h.state !== 'rescued' && rides(h.p, 0.35)) h.p[1] += dy;
    for (const d of ctx.game.drops) if (rides(d.p, 0.15)) d.p[1] += dy;
    for (const m of ctx.game.mines) if (rides(m.p, 0.15)) m.p[1] += dy;
    for (const s of ctx.game.satchels) if (s.elev) s.p[1] += dy;
  }
  // Which mines and satchels ride it (the browsers move their models along).
  function riders() {
    const rm = ctx.game.mines.filter(m => inCabin(E, y, m.p, 0.15) || onRoof(E, y, m.p, 0.15)).map(m => m.id);
    const rs = ctx.game.satchels.filter(s => s.elev).map(s => s.id);
    if (String(rm) === String(st.rm) && String(rs) === String(st.rs)) return;
    st.rm = rm;
    st.rs = rs;
    push();
  }

  function place3(t) {
    placeCabin(E, B, y, st.h);
    for (let k = 0; k < 4; k++) placeDoor(E, B, k, y, doorAt(st.d[k], t));
    const w = ctx.world();
    if (w.elev !== B.all) { w.elev = B.all; w.elevBound = bound; }
  }

  // Moving: brake if someone is in the way (or a landing's doors were pried open on the way).
  function guard(t, r) {
    if (st.m.tb) return;
    const lim = limits(), sd = (r.v * r.v) / (2 * ELEV.brake) + 0.12;
    const pried = st.d.some((d, k) => k > 0 && doorAt(d, t) > 0);
    if (pried || (r.v > 0 && y + sd >= lim.max) || (r.v < 0 && y - sd <= lim.min)) {
      st.m.tb = Math.round(t);
      sfx('brake', [doorX(), y + 1.2, E.cabin.z2]);
      push();
    }
  }
  // A trip has just ended: at its stop (the doors open, ding) or braked somewhere.
  function settle(t) {
    const braked = !!st.m.tb;
    st.m = { y0: r3(y), y1: r3(y), t0: Math.round(t), tb: 0 };
    if (!braked && st.target >= 0) {
      const s = st.target;
      st.target = -1;
      st.q = st.q.filter(i => i !== s);
      sfx('ding', landingAt(s));
      open(s, t);
    } else push();
    if (st.rm.length) ctx.sendMines();
    if (st.rs.length) ctx.sendSatchels();
  }
  // Standing: the doors shut after a while (unless someone is in the way), then it sets off for the next call.
  function rest(t) {
    if (!st.power) return;
    let shut = true;
    for (let k = 0; k < 4; k++) {
      const d = st.d[k], o = doorAt(d, t);
      if (o > 0 || d[1] > 0) shut = false;
      if (d[1] < 0 && o > 0 && blocked(k)) { setDoor(k, 1, t); st.openUntil = t + ELEV.hold * 1000; sfx('doors', k ? landingAt(k - 1) : [doorX(), y + 1.2, E.cabin.z2]); push(); }
    }
    if (!shut) {
      if (t < st.openUntil) return;
      const ks = [0, 1, 2, 3].filter(k => (st.d[k][1] > 0 && doorAt(st.d[k], t) >= 1) || (st.d[k][1] === 0 && doorAt(st.d[k], t) > 0));
      if (!ks.length) return;
      if (ks.some(blocked)) { st.openUntil = t + 500; return; }
      for (const k of ks) setDoor(k, -1, t);
      const s = at();
      sfx('doors', s >= 0 ? landingAt(s) : [doorX(), y + 1.2, E.cabin.z2]);
      push();
      return;
    }
    const here = at(), lim = limits();
    if (st.target < 0 && st.q.length) st.target = st.q.shift();
    if (st.target < 0 && here < 0) {
      // between floors (after the blackout, or braked): on to the nearest floor it can reach
      const ok = E.stops.map((h, s) => s).filter(s => E.stops[s] <= lim.max && E.stops[s] >= lim.min).sort((a, b) => Math.abs(E.stops[a] - y) - Math.abs(E.stops[b] - y));
      if (ok.length) st.target = ok[0];
    }
    if (st.target < 0) return;
    if (here === st.target) { const s = st.target; st.target = -1; open(s, t); return; }
    const goal = E.stops[st.target];
    if (goal > y ? goal > lim.max : goal < lim.min) {
      st.held ||= t;
      if (t - st.held > ELEV.give * 1000) { st.target = -1; st.held = 0; push(); }
      return;
    }
    st.held = 0;
    st.m = { y0: r3(y), y1: goal, t0: Math.round(t), tb: 0 };
    ctx.motorStart?.([doorX(), y + E.cabin.ceil + 0.3, (E.shaft.z1 + E.shaft.z2) / 2], st.by || null);
    push();
  }
  // Bots never use the lift; one stuck in the shaft (fallen in, or carried off in the cabin) is put back on a landing.
  function rescueBots(t) {
    for (const q of ctx.players.values()) {
      if (!q.bot || !q.alive) continue;
      const free = !inShaft(E, q.p) || (inCabin(E, y, q.p, 0.4) && at() >= 0 && doorAt(st.d[0], t) > 0.9);
      if (free) { q.elevStuck = 0; continue; }
      q.elevStuck ||= t;
      if (t - q.elevStuck < 10000) continue;
      q.elevStuck = 0;
      const s = nearestStop(E, q.p[1]).s;
      q.p = landingSpot(s);
    }
  }

  return {
    // Each round (and on a new map): the cabin on the ground floor, doors shut, no calls, the hatch shut.
    reset() {
      E = ctx.map().elevator || null;
      if (!E) { B = null; return; }
      const t = Math.round(ctx.now());
      B = makeBoxes();
      bound = { min: [E.out.x1, E.pit - 0.2, E.out.z1], max: [E.out.x2, E.top + 0.1, E.out.z2] };
      y = E.stops[1];
      st = { m: { y0: y, y1: y, t0: t, tb: 0 }, d: [0, 1, 2, 3].map(() => [0, 0, t, ELEV.door]), h: 0, q: [], target: -1, openUntil: 0, power: ctx.power(), held: 0, by: null, rm: [], rs: [] };
      for (const q of ctx.players.values()) q.elevStuck = 0;
      place3(t);
      push();
    },
    // Every tick (Mansion).
    tick(t) {
      if (!E || ctx.map().elevator !== E) return;
      const power = ctx.power();
      if (power !== st.power) setPower(power, t);
      const r = motionAt(st.m, t), yPrev = y;
      y = r.y;
      if (y !== yPrev) carry(yPrev, y - yPrev);
      place3(t);
      if (r.moving) guard(t, r);
      else if (st.m.y0 !== st.m.y1 || st.m.tb) settle(t);
      else rest(t);
      riders();
      rescueBots(t);
    },
    send(p) { if (E && st) ctx.send(p, view()); },
    // 'elev…' messages from a browser.
    message(p, m) {
      if (m.t === 'elevAim') p.elevAim = typeof m.a === 'string' && AIM.test(m.a) ? m.a : null;
    },
    // E: what the player's browser said they aim at (checked here). True when it was the lift's.
    use(p, t) {
      if (!E || p.bot || !p.elevAim) return false;
      const a = p.elevAim, kind = a[0], s = +a[1], r = motionAt(st.m, t), inside = inCabin(E, y, p.p, 0.4);
      if (kind === 'c') {
        const c = E.call[s];
        if (inShaft(E, p.p) || Math.hypot(p.p[0] - c[0], p.p[2] - c[2]) > 2.2 || Math.abs(p.p[1] - E.stops[s]) > 1.2) return false;
        const no = call(s, t, p);
        if (no) say(p, no); else ctx.send(p, { t: 'elevSfx', s: 'click', p: c });
        return true;
      }
      if (kind === 'b') {
        if (!inside) return false;
        const no = call(s, t, p);
        if (no) say(p, no); else ctx.send(p, { t: 'elevSfx', s: 'click', p: [E.panel.x, y + E.panel.ys[s], E.panel.z] });
        return true;
      }
      if (kind === 'h') {
        if (!inside && !onRoof(E, y, p.p, 0.3)) return false;
        if (r.moving) { say(p, 'Wait until the lift stops.'); return true; }
        if (inside) {
          if (roofAt(E, y) + ELEV.headroom > E.top) { say(p, 'No room above the cabin up here — the shaft ends just over it.'); return true; }
          st.h = 1;
          place(p, roofSpot(E, y), true);
          push();
        } else place(p, cabinSpot(E, y), false);
        sfx('hatch', [(E.hatch.x1 + E.hatch.x2) / 2, roofAt(E, y), (E.hatch.z1 + E.hatch.z2) / 2]);
        return true;
      }
      if (kind === 'f') {
        if (!inside) return false;
        if (r.moving) return true;
        const here = at();
        if (st.power && here >= 0) { call(here, t, p); return true; }
        const n = nearestStop(E, y);
        if (n.d > ELEV.near) { say(p, 'Too far from a floor — only the shaft\'s wall behind these doors. Look up: the roof hatch.'); return true; }
        if (doorAt(st.d[0], t) > 0.9 && doorAt(st.d[1 + n.s], t) > 0.9) return false;
        startForce(p, 'f', n.s, t);
        return true;
      }
      // 'l': a landing's doors, from inside the shaft (pry them; open: climb out) or from outside in a blackout (pry)
      const shaft = inShaft(E, p.p) && !inside;
      const dx = Math.hypot(p.p[0] - doorX(), p.p[2] - E.out.z2), dy = p.p[1] - E.stops[s];
      if (shaft ? dx > 1.6 || dy < -2.1 || dy > 0.7 : inShaft(E, p.p) || dx > 2.2 || Math.abs(dy) > 1.2) return false;
      const o = doorAt(st.d[1 + s], t);
      if (shaft && o > 0.9) { place(p, landingSpot(s), false); return true; }
      if (!shaft && st.power) { const no = call(s, t, p); if (no) say(p, no); return true; }
      if (o > 0.9) return false;
      startForce(p, 'l', s, t);
      return true;
    },
    // The 'elevforce' action (held E): done after ELEV.force seconds, if they hold still.
    act(p, a, t) {
      if (!E || !p.alive || Math.hypot(p.p[0] - a.pos[0], p.p[2] - a.pos[2]) > 0.6 || (a.what === 'f' && motionAt(st.m, t).moving)) { p.act = null; return; }
      if (t - a.start < a.dur) return;
      p.act = null;
      force(a.what, a.s, t);
    },
    // A player's own position (the 'state' message, sent a moment ago): standing in the cabin or on its roof means on
    // its floor now.
    fixRider(pos) {
      if (!E) return;
      if (inCabin(E, y, pos, 0.35) && pos[1] < y + 0.08) pos[1] = y;
      else if (inShaft(E, pos) && Math.abs(pos[1] - roofAt(E, y)) < 0.3 && pos[1] < roofAt(E, y) + 0.08) pos[1] = roofAt(E, y);
    },
    // A satchel charge that has just stuck to something: to the cabin (or its doors), it rides along. (ms: its flight,
    // during which the cabin may have moved.)
    stick(s, hit, ms) {
      if (!E || !hit?.box?.elev || hit.box.elevDoor >= 1) return;
      const t = ctx.now();
      s.p = [s.p[0], s.p[1] + motionAt(st.m, t).y - motionAt(st.m, t - ms).y, s.p[2]];
      s.elev = 1;
    },
    // (tests) the state as it is
    debug: () => (E ? { y, ...view() } : null),
  };
}
