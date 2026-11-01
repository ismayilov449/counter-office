// Floodgate on the server (see shared/flood.js): the valve, the water level, drowning, electrocution at the fuse box,
// and what the water does to grenades and fire. Only on the Mansion maps (map.mansion2); elsewhere every call is a
// no-op. server.js creates it once and calls it from a few hooks marked "Floodgate".
import { FLOOD, floodLevel, floodMap, waterTop, underWater, atValve, makeFloodBoxes, setFloodBoxes } from '../shared/flood.js';
import { WEAPONS } from '../shared/weapons.js';

const r2 = v => Math.round(v * 100) / 100;
const CHEST = 1.1;

// deps: what it needs from server.js —
//   game, players, map() (the current map), broadcast, send, notify, applyDamage, hurtHostage, eyeOf, lineOfSight,
//   mates, cfg (friendlyFire), now, sparkAt(pos, kind) (the gas system's, if there is one)
export function createFlood(deps) {
  const { game, players } = deps;
  const broadcast = m => deps.broadcast(m);
  const st ={ f: 0, open: false, level: FLOOD.base, by: null };
  // the water boxes for map.water (shared by both Mansion map objects: they spread the same arrays)
  const boxes = makeFloodBoxes();
  const on = () => floodMap(deps.map());
  const wet = () => st.level > FLOOD.base + 0.02;
  // A body in the water (its feet under the surface), and how deep.
  const depth = p => Math.max(0, waterTop(st.level, p) - p[1]);
  const inWater = p => depth(p) > 0.05;

  function addBoxes() {
    const water = deps.map().water;
    if (water && !water.includes(boxes[0])) water.push(...boxes);
  }

  function reset() {
    st.f = 0; st.open = false; st.level = FLOOD.base; st.by = null;
    setFloodBoxes(boxes, st.level);
    for (const p of players.values()) { p.floodAir = FLOOD.breath; p.floodHurtAt = 0; }
    if (on()) addBoxes();
  }

  // ---- the valve: hold E for 3 s (from onUse); turning it is an action like defusing (p.act, see updateActions)
  function onUse(p, t) {
    if (!on() || !p.alive || !atValve(p.p)) return false;
    if (game.phase !== 'live' && game.phase !== 'warmup') return false;
    p.act = { type: 'flood', start: t, pos: p.p.slice(), dur: FLOOD.hold * 1000 };
    return true;
  }

  function updateAct(p, a, t) {
    const moved = Math.hypot(p.p[0] - a.pos[0], p.p[2] - a.pos[2]) > 0.6;
    if (!on() || !p.alive || (game.phase !== 'live' && game.phase !== 'warmup') || moved) { p.act = null; return; }
    if (t - a.start < a.dur) return;
    p.act = null;
    st.open = !st.open;
    st.by = p.id;
    broadcast({ t: 'floodValve', open: st.open, by: p.id, p: FLOOD.valve.p });
    deps.send(p, { t: 'msg', text: st.open ? 'You opened the valve: the storm drain is flooding — then the cellar and the tunnel.' : 'You closed the valve: the water will drain away slowly.' });
  }

  // ---- every tick
  function tick(t, dt) {
    if (!on()) return;
    const was = st.level;
    if (st.open) st.f = Math.min(1, st.f + dt / FLOOD.fill);
    else if (st.f > 0) st.f = Math.max(0, st.f - dt / FLOOD.drain);
    st.level = floodLevel(st.f);
    if (st.level !== was) { addBoxes(); setFloodBoxes(boxes, st.level); }
    breathe(t, dt);
    if (!wet()) return;
    // electrocution: the water at the fuse box while the power is on (also when someone brings it back too early)
    const fb = deps.map().fusebox;
    if (fb && st.level >= FLOOD.fuse && game.lights?.power !== false) zap(fb);
    // the water puts out fires under it, and anyone burning who gets into it
    for (const f of game.fires) if (f.until > 0 && underWater(st.level, [f.p[0], f.p[1] + 0.05, f.p[2]])) f.until = 0;
    for (const p of players.values()) if (p.alive && p.burnUntil && inWater(p.p)) p.burnUntil = 0;
  }

  // Heads under water run out of breath, then take damage every second (a downed player much sooner).
  function breathe(t, dt) {
    for (const p of players.values()) {
      if (!p.alive) { p.floodAir = FLOOD.breath; continue; }
      const down = !!p.downed; // (another feature's contract: a downed player crawling)
      if (wet() && underWater(st.level, deps.eyeOf(p))) {
        p.floodAir = (p.floodAir ?? FLOOD.breath) - dt * (down ? FLOOD.downed.breath : 1);
        if (p.floodAir <= 0 && t >= (p.floodHurtAt || 0)) {
          p.floodHurtAt = t + 1000;
          deps.applyDamage(p, null, FLOOD.drown * (down ? FLOOD.downed.drown : 1), null, 'drowned', 1);
        }
      } else if ((p.floodAir ?? FLOOD.breath) < FLOOD.breath) {
        p.floodAir = Math.min(FLOOD.breath, p.floodAir + dt * FLOOD.recover);
        p.floodHurtAt = 0;
      }
    }
    for (const h of game.hostages || []) {
      if (h.state === 'dead' || h.state === 'rescued') continue;
      if (wet() && underWater(st.level, [h.p[0], h.p[1] + 1.6, h.p[2]])) {
        h.floodAir = (h.floodAir ?? FLOOD.breath) - dt;
        if (h.floodAir <= 0 && t >= (h.floodHurtAt || 0)) { h.floodHurtAt = t + 1000; deps.hurtHostage(h, null, FLOOD.drown, 'drowned'); }
      } else if (h.floodAir != null) h.floodAir = Math.min(FLOOD.breath, h.floodAir + dt * FLOOD.recover);
    }
  }

  // Everyone in the water takes a jolt (heavy: the deeper, the worse), then the fuse blows and the house goes dark.
  function zap(fb) {
    const hit = [];
    for (const p of players.values()) {
      if (!p.alive) continue;
      const d = depth(p.p);
      if (d <= 0.05) continue;
      hit.push([r2(p.p[0]), r2(p.p[1] + Math.min(d, CHEST)), r2(p.p[2])]);
      deps.applyDamage(p, null, FLOOD.zap.min + (FLOOD.zap.max - FLOOD.zap.min) * Math.min(1, d / 1.0), null, 'electrocuted', 1);
    }
    for (const h of game.hostages || []) {
      if (h.state === 'dead' || h.state === 'rescued') continue;
      const d = depth(h.p);
      if (d > 0.05) { hit.push([r2(h.p[0]), r2(h.p[1] + Math.min(d, CHEST)), r2(h.p[2])]); deps.hurtHostage(h, null, FLOOD.zap.max, 'electrocuted'); }
    }
    broadcast({ t: 'floodZap', p: fb.p, v: hit });
    deps.sparkAt?.(fb.p, 'electric');
    // the fuse blows: the power is off as if the lever was pulled (see setPower in server.js)
    game.lights.power = false;
    for (const g of fb.groups) game.lights[g] = false;
    broadcast({ t: 'lights', lights: game.lights, power: 'off', p: fb.p });
    deps.notify(hit.length ? `The water reached the fuse box — ${hit.length} electrocuted in the water, and the fuse blew` : 'The water reached the fuse box — the fuse blew and the house went dark');
  }

  // A grenade that goes off under water (from explodeNade): a Molotov, flashbang or smoke grenade just fizzles; an
  // HE grenade's blast stays in the water (it hurts only those in it, nearby; nothing breaks). True if handled.
  function douse(n) {
    if (!on() || !wet()) return false;
    const o = [n.end[0], n.end[1] + 0.1, n.end[2]];
    if (!underWater(st.level, o)) return false;
    if (n.k !== 'he') { broadcast({ t: 'floodFizzle', p: n.end, k: n.k, id: n.id }); return true; }
    const owner = players.get(n.owner) || null;
    broadcast({ t: 'floodBoom', p: n.end, id: n.id });
    for (const q of players.values()) {
      if (!q.alive || !inWater(q.p)) continue;
      if (owner && q !== owner && deps.mates(q, owner) && !deps.cfg.friendlyFire) continue;
      const chest = [q.p[0], q.p[1] + CHEST, q.p[2]], d = Math.hypot(o[0] - chest[0], o[1] - chest[1], o[2] - chest[2]);
      if (d > FLOOD.nade || !deps.lineOfSight(o, chest)) continue;
      deps.applyDamage(q, owner, 100 * (1 - d / FLOOD.nade), 'he', 'he', WEAPONS.he.pen, null, o);
    }
    return true;
  }

  // The snapshot's `fl` key while there's anything to show: [level, valve open (1/0), someone turning it (1/0)].
  function snap() {
    if (!on()) return {};
    const turning = [...players.values()].some(p => p.act?.type === 'flood');
    if (!wet() && !st.open && !turning) return {};
    return { fl: [r2(st.level), st.open ? 1 : 0, turning ? 1 : 0] };
  }

  return { reset, tick, onUse, updateAct, douse, snap, state: st };
}
