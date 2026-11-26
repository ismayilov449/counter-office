// The SWAT helicopter on the server (ROADMAP 18, stage 1; rules in shared/heli.js, the browser's part
// public/js/heli.js). server.js calls in at hooks marked "heli:". The pilot's browser flies it ('heli' { p, yaw, v,
// tilt, roll, air }, 'heliHit' { s } when it hits something); the server keeps its fuel, hull, seats and its fall.
// p.heli = { seat } for whoever sits in it (0 the pilot). Out: the snapshot's hl, 'heliIn' { seat, h }, 'heliOut' { p },
// 'heliFuel' (the engine stopped), 'boom' { k: 'heli' }, 'sfx' heliin.
import { HELI, SEATS, seatPos, heliBoxes, heliGround, heliForward, heliRight } from '../shared/heli.js';

const r2 = v => Math.round(v * 100) / 100;
const FUEL = +(globalThis.process?.env?.HELI_FUEL) || HELI.fuel; // (tests: HELI_FUEL seconds in its tank)
const r3 = v => Math.round(v * 1000) / 1000;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const vec3 = a => (Array.isArray(a) && a.length === 3 && a.every(isNum) ? a : null);

// api: { game, players, map(), world(), now, send, broadcast, notify, killPlayer(p, by, weapon), applyDamage(...),
//   lineOfSight(a, b), mates(a, b), ff(), blastMap(at, weapon), breakGlass(ids) }
export function createHeli(api) {
  const { players, send, broadcast } = api;
  let h = null; // { p, yaw, v, tilt, roll, hp, fuel, st: 'idle' | 'fly' | 'fall' | 'wreck', air, seats: [ids], spin, lastAt }
  const M = () => api.map().heli;
  const boxesNear = p => api.world().move('heli', p, 9);
  const ground = () => heliGround(boxesNear(h.p), h.p, h.yaw);
  const sync = () => { api.world().heli = heliBoxes(h); };
  const inside = () => h.seats.map(id => players.get(id)).filter(Boolean);
  const say = (p, text) => send(p, { t: 'msg', text });

  function reset() {
    const m = M();
    for (const q of players.values()) q.heli = null;
    h = m ? { p: m.p.slice(), yaw: m.yaw, v: [0, 0, 0], tilt: 0, roll: 0, hp: HELI.hp, fuel: FUEL, st: 'idle', air: false, seats: SEATS.map(() => null), spin: 0 } : null;
    sync();
  }
  // Out of seat i: beside the door on the ground; from up high, a fall (the zip line's landing hurts: p.zipFall).
  function out(p, t, quiet = false) {
    const i = p.heli?.seat;
    p.heli = null;
    if (!h || i == null) return;
    h.seats[i] = null;
    const r = heliRight(h.yaw), f = heliForward(h.yaw), side = SEATS[i][0] >= 0 ? 1 : -1, s = seatPos(h, i);
    // out of its own door, else the other one, else by the nose or the tail, else further out (clear of its box however
    // it's turned): the first spot with nothing in the way from where you leave it down to where you land
    const tries = [[r, side * 2.0], [r, -side * 2.0], [f, 3.6], [f, -3.0], [r, side * 2.6], [r, -side * 2.6]].map(([a, k]) => [h.p[0] + a[0] * k, s[1], h.p[2] + a[2] * k]);
    const clear = q => { const g = heliGround(boxesNear(q), [q[0], q[1] + 0.3, q[2]], 0), y = Math.max(g, Math.min(q[1], g + 0.05)); return { g, y, ok: g > -50 && !api.world().move('heli', q, 2).some(b => q[0] > b.min[0] - 0.4 && q[0] < b.max[0] + 0.4 && q[2] > b.min[2] - 0.4 && q[2] < b.max[2] + 0.4 && b.max[1] > y + 0.05 && b.min[1] < q[1] + 1.8) }; };
    const spot = tries.find(q => clear(q).ok) || tries[0], { g } = clear(spot);
    const pos = [spot[0], g > -50 ? Math.max(g, Math.min(s[1], g + 0.05)) : s[1], spot[2]];
    if (s[1] - g > HELI.low) { pos[1] = s[1] - 0.4; p.zipFall = { top: pos[1], y: pos[1], at: t }; }
    p.p = pos;
    p.history = [];
    if (!quiet) send(p, { t: 'heliOut', p: pos.map(r3) });
    // the pilot gone in the air: nobody flies it
    if (i === 0 && h.air && h.st === 'fly') { h.st = 'fall'; h.spin = 0.4; }
  }
  function explode(by) {
    h.st = 'wreck';
    h.v = [0, 0, 0];
    const c = [h.p[0], h.p[1] + 1.2, h.p[2]];
    broadcast({ t: 'boom', p: c.map(r2), k: 'heli' });
    api.blastMap(c, 'car');
    for (const q of inside()) { out(q, api.now(), true); send(q, { t: 'heliOut', p: q.p.map(r3) }); api.killPlayer(q, by && by !== q && !api.mates(by, q) ? by : null, 'heli'); }
    for (const q of players.values()) {
      if (!q.alive || (by && q !== by && api.mates(q, by) && !api.ff())) continue;
      const chest = [q.p[0], q.p[1] + 1.1, q.p[2]], d = Math.hypot(c[0] - chest[0], c[1] - chest[1], c[2] - chest[2]);
      if (d < HELI.blast && api.lineOfSight(c, chest)) api.applyDamage(q, by, 150 * (1 - d / HELI.blast), 'he', 'heli', 1, null, c);
    }
    api.notify(by ? `${by.name} brought down the helicopter!` : 'The helicopter crashed!', true);
  }
  function damage(dmg, by) {
    if (!h || h.st === 'wreck' || dmg <= 0) return;
    h.hp -= dmg;
    if (h.hp > 0) return;
    h.hp = 0;
    h.killer = by;
    if (h.air && h.st !== 'fall') { h.st = 'fall'; h.spin = HELI.spin; for (const q of inside()) send(q, { t: 'heliFuel', dead: 1 }); }
    else if (h.st !== 'fall') explode(by);
  }

  return {
    reset,
    // E: in it, get out; a CT near it while it stands or hovers low gets in (the pilot's seat first).
    use(p, t) {
      if (p.heli) { out(p, t); return true; }
      if (!h || !p.alive || p.team !== 'CT' || p.bot || h.st === 'wreck' || h.st === 'fall') return false;
      if (Math.hypot(p.p[0] - h.p[0], p.p[2] - h.p[2]) > HELI.reach || Math.abs(p.p[1] - h.p[1]) > 2.5) return false;
      if (h.p[1] - ground() > HELI.low) { say(p, 'Too high to climb in.'); return true; }
      const i = h.seats.indexOf(null);
      if (i < 0) { say(p, 'The helicopter is full.'); return true; }
      h.seats[i] = p.id;
      p.heli = { seat: i };
      p.act = null;
      p.p = seatPos(h, i);
      p.history = [];
      send(p, { t: 'heliIn', seat: i, h: { p: h.p.map(r3), yaw: r3(h.yaw), v: h.v.map(r3), fuel: Math.round(h.fuel), out: h.fuel <= 0 ? 1 : 0 } });
      broadcast({ t: 'sfx', s: 'heliin', p: p.p.map(r2) });
      if (i === 0) say(p, h.fuel > 0 ? 'You fly it: W/S forward and back, A/D sideways, Space up, Ctrl down, the mouse turns. E gets out.' : 'No fuel left.');
      return true;
    },
    // The pilot's browser: where it is now.
    pilot(p, m, t) {
      if (!h || p.heli?.seat !== 0 || h.st === 'wreck' || h.st === 'fall') return;
      const pos = vec3(m.p), v = vec3(m.v);
      if (!pos || !v || !isNum(m.yaw) || Math.hypot(pos[0] - h.p[0], pos[1] - h.p[1], pos[2] - h.p[2]) > 4) return;
      h.p = pos; h.yaw = m.yaw; h.v = v;
      h.tilt = isNum(m.tilt) ? m.tilt : 0; h.roll = isNum(m.roll) ? m.roll : 0;
      h.air = !!m.air;
      h.st = h.air ? 'fly' : 'idle';
      sync();
    },
    // The pilot's browser: it hit something at s m/s.
    hit(p, m) {
      if (p.heli?.seat !== 0 || !isNum(m.s)) return;
      broadcast({ t: 'sfx', s: 'crash', p: h.p.map(r2) });
      damage((Math.min(m.s, 30) - HELI.hard) * HELI.hurt, null);
    },
    // A bullet on its metal, a blast near it.
    damage,
    blast(at, R, dmg, by) {
      if (!h || h.st === 'wreck') return;
      const d = Math.max(0, Math.hypot(at[0] - h.p[0], at[1] - h.p[1] - 1.2, at[2] - h.p[2]) - 1.5); // (from its hull)
      if (d < R) damage(dmg * (1 - d / R), by);
    },
    // The 'state' handler: in a seat, you're where the seat is. True when it said so.
    pinned(p, m) {
      if (!p.heli || !h) return false;
      p.p = seatPos(h, p.heli.seat);
      p.yaw = m.yaw; p.pitch = m.pitch; p.c = 1;
      return true;
    },
    // Every tick: the seats follow it, the fuel burns in the air, its fall.
    tick(t, dt) {
      if (!h) return;
      for (let i = 0; i < h.seats.length; i++) {
        const q = players.get(h.seats[i]);
        if (!q || !q.alive || q.heli?.seat !== i) { if (q) q.heli = null; h.seats[i] = null; if (i === 0 && h.air && h.st === 'fly') { h.st = 'fall'; h.spin = 0.4; } continue; }
        q.p = seatPos(h, i);
      }
      if (h.st === 'fly' && h.air && h.seats[0] != null) {
        h.fuel -= dt;
        if (h.fuel <= 0) { h.fuel = 0; h.st = 'fall'; h.spin = 0.3; for (const q of inside()) send(q, { t: 'heliFuel' }); api.notify('The helicopter is out of fuel!'); }
      }
      if (h.st === 'fall') {
        h.v[1] -= HELI.fall * dt;
        h.yaw += h.spin * dt;
        h.p = [h.p[0] + h.v[0] * dt, h.p[1] + h.v[1] * dt, h.p[2] + h.v[2] * dt];
        const g = ground();
        if (h.p[1] <= g) {
          h.p[1] = g;
          // (out of fuel low and slow, it just thumps down; shot down or from high up, it's gone)
          if (h.hp > 0 && -h.v[1] < HELI.crash) { const s = -h.v[1]; h.v = [0, 0, 0]; h.st = 'idle'; h.air = false; damage((s - HELI.hard) * HELI.hurt, null); }
          else explode(h.killer || null);
        }
        sync();
      }
    },
    snap() {
      if (!h) return {};
      const st = { idle: 0, fly: 1, fall: 2, wreck: 3 }[h.st];
      return { hl: [r2(h.p[0]), r2(h.p[1]), r2(h.p[2]), r3(h.yaw), r2(h.tilt), r2(h.roll), st, Math.round((100 * h.hp) / HELI.hp), Math.round(h.fuel), h.seats.map(id => id || 0)] };
    },
    leave(p) { if (p.heli) out(p, api.now(), true); },
  };
}
