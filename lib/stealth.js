// Stealth & hiding on the server (ROADMAP group 4; the rules both sides use: shared/stealth.js):
//   4.1 the chimney: soot for whoever climbs the flue, lighting the fireplace (hold E 2 s), its fire hurting anyone in
//       the flue (the browsers take its rungs away, so they fall), E on the roof by the stack climbs in at the top;
//   4.3 hiding in a car's trunk: E behind a car (not the pickup) climbs in; the server keeps you inside the car's
//       body wherever it's driven (not drawn, never spotted, no shooting); E jumps out; a car blowing up kills you.
// (4.2, the creaking boards, is the browsers' alone: each one hears whoever steps on a creaky spot, like footsteps.)
// server.js creates it once and calls it from a few hooks marked "stealth:". On maps without the chimney (all but the
// Mansion maps) the chimney's calls do nothing; the trunk works on the Mansion maps only (TRUNK_MAPS).
import { STEALTH, stealthOf, upFlue, inFirebox, atHearth, atTop, topSpot, hearthFront, atTrunk, hasTrunk, trunkPos, trunkBack, trunkExits } from '../shared/stealth.js';
import { PLAYER, overlapsAny } from '../shared/physics.js';

const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const TRUNK_ON = map => !!map?.mansion2; // the trunk: Mansion maps only for now (drop this to have it on every map with cars)

// deps: what it needs from server.js —
//   game, players, map(), world(), broadcast, send, now, applyDamage, killPlayer, mates, groundY,
//   roundless() (warmup, Deathmatch, Gun Game: no rounds to put the fire out), sparkAt(pos, kind, by) (the gas system's)
export function createStealth(deps) {
  const { game, players } = deps;
  const st = { lit: false, by: null, at: 0, burnAt: 0, sparkAt: 0 };
  const chimney = () => stealthOf(deps.map())?.chimney || null;
  const say = (p, text) => deps.send(p, { t: 'msg', text });
  const sfx = (s, p) => deps.broadcast({ t: 'stSfx', s, p: p.map(r2) });
  const carById = id => deps.world().cars.find(c => c.id === id) || null;
  const hiderIn = c => [...players.values()].find(q => q.trunk === c.id) || null;

  function reset() {
    st.lit = false; st.by = null; st.at = 0; st.burnAt = 0; st.sparkAt = 0;
    for (const p of players.values()) { p.trunk = null; p.sootUntil = 0; }
  }

  // Put a player somewhere (into the chimney from the top, out of a trunk): their browser is told.
  function place(p, pos, crouch) {
    p.p = pos.map(r3);
    p.c = crouch ? 1 : 0;
    p.history = [];
    p.act = null;
    deps.send(p, { t: 'stTo', p: p.p, c: crouch ? 1 : 0 });
  }

  // ---- E (from onUse, after the valves): hold E at the hearth to light the fire; E on the roof by the stack climbs in
  function use(p, t) {
    const C = chimney();
    if (!C || !p.alive || p.act) return false;
    if (atTop(C, p.p)) {
      if (st.lit) { say(p, 'Smoke and heat pour out of the chimney: the fire below is lit.'); return true; }
      place(p, topSpot(C), true);
      return true;
    }
    if (!atHearth(C, p.p) || st.lit) return false;
    if (game.phase !== 'live' && game.phase !== 'warmup') return false;
    p.act = { type: 'fireplace', start: t, pos: p.p.slice(), dur: STEALTH.light * 1000 };
    return true;
  }

  function updateAct(p, a, t) {
    const moved = Math.hypot(p.p[0] - a.pos[0], p.p[2] - a.pos[2]) > 0.6;
    if (!chimney() || !p.alive || st.lit || moved || (game.phase !== 'live' && game.phase !== 'warmup')) { p.act = null; return; }
    if (t - a.start < a.dur) return;
    p.act = null;
    light(p, t);
  }

  function light(p, t) {
    const C = chimney();
    st.lit = true; st.by = p ? p.id : null; st.at = t; st.burnAt = t; st.sparkAt = 0;
    sfx('light', [(C.fx1 + C.fx2) / 2, C.hearth + 0.3, (C.z1 + C.fz2) / 2]);
    if (p) say(p, 'You lit the fire: nobody gets up or down the chimney until the round ends.');
  }

  // ---- every tick: soot, the fire's harm, the hiders kept in their cars
  function tick(t) {
    const C = chimney();
    if (C) {
      if (st.lit && deps.roundless() && t - st.at > STEALTH.roundless * 1000) st.lit = false; // (no round to end it)
      for (const p of players.values()) if (p.alive && upFlue(C, p.p)) p.sootUntil = t + STEALTH.soot * 1000;
      if (st.lit) burn(C, t);
    }
    for (const p of players.values()) if (p.trunk != null) keepInTrunk(p, t);
  }

  // The fire hurts whoever is in the flue: the flames in the firebox, the heat and smoke higher up. The one who lit it
  // gets the kill of an enemy (like a Molotov's thrower); a teammate's fire, or your own, kills with nobody's credit.
  function burn(C, t) {
    // a burning fire is a spark that never stops: gas in the living room goes up (gas.sparkAt, once a second)
    if (t >= st.sparkAt) { st.sparkAt = t + 1000; deps.sparkAt?.([(C.fx1 + C.fx2) / 2, C.hearth + 0.4, C.z1 - 0.1], 'fire', players.get(st.by) || null); }
    if (t < st.burnAt) return;
    st.burnAt = t + STEALTH.burn.tick * 1000;
    const by = players.get(st.by) || null;
    for (const q of players.values()) {
      if (!q.alive) continue;
      const dps = inFirebox(C, q.p) ? STEALTH.burn.fire : upFlue(C, q.p) ? STEALTH.burn.flue : 0;
      if (!dps) continue;
      const credit = by && by !== q && !deps.mates(by, q) ? by : null;
      deps.applyDamage(q, credit, dps * STEALTH.burn.tick, 'chest', 'fireplace', 1);
    }
  }

  // ---- the trunk
  // E behind a car (from onUse, just before E gets into the car): climb into its trunk.
  function trunk(p, t) {
    if (!TRUNK_ON(deps.map()) || !p.alive || p.act || p.trunk != null || game.phase === 'freeze') return false;
    if (p.driving != null || p.riding != null || p.zip || p.cctv || p.piloting != null || p.shield != null || p.downed || p.playingDead) return false;
    const c = deps.world().cars.find(k => hasTrunk(k) && !k.wrecked && atTrunk(k, p.p));
    if (!c) return false;
    // someone in it already: a teammate stays (you're told); an enemy is found and tumbles out
    const h = hiderIn(c);
    if (h) {
      if (deps.mates(h, p)) { say(p, `${h.name} is already curled up in this trunk.`); return true; }
      leave(h);
      say(h, `${p.name} opened the trunk: you've been found!`);
      say(p, `You opened the trunk: ${h.name} was hiding in it!`);
      return true;
    }
    if (Math.abs(c.speed) > STEALTH.trunk.maxSpeed) { say(p, 'Not while it\'s moving.'); return true; }
    p.trunk = c.id;
    p.act = null;
    p.reloadUntil = 0;
    p.p = trunkPos(c).map(r3);
    p.c = 1;
    p.history = [];
    sfx('trunk', trunkBack(c));
    say(p, 'You are hiding in the trunk: nobody sees you, and whoever drives the car takes you along. E to jump out.');
    return true;
  }

  // E in a trunk (from onUse, with getting off the zip line, the CCTV desk and out of a car): jump out.
  function leave(p) {
    if (p.trunk == null || !p.alive) return false;
    const c = carById(p.trunk);
    p.trunk = null;
    if (!c) return true;
    const boxes = deps.world().move(null, c.p, 6);
    let spot = trunkExits(c).map(s => [s[0], deps.groundY(s[0], c.p[1] + 0.5, s[2]), s[2]])
      .find(s => Math.abs(s[1] - c.p[1]) < 1.2 && !overlapsAny(boxes, s[0], s[1] + 0.05, s[2], PLAYER.radius, PLAYER.height));
    if (!spot) spot = [c.p[0], c.p[1] + 1.55, c.p[2]]; // nowhere to stand: out onto its roof
    place(p, spot, false);
    sfx('trunk', trunkBack(c));
    return true;
  }

  // Every tick: the hider goes wherever the car goes (and gets out if he can't stay: down, playing dead, no car).
  function keepInTrunk(p, t) {
    const c = carById(p.trunk);
    if (!p.alive) { p.trunk = null; return; }
    if (!c || c.wrecked || p.downed || p.playingDead) { leave(p); return; }
    p.p = trunkPos(c).map(r3);
    p.c = 1;
    p.history.push({ t, p: p.p, c: 1 });
    while (p.history.length && p.history[0].t < t - 1000) p.history.shift();
  }

  // The 'state' handler: in a trunk the server says where you are (true: the browser's position is ignored).
  function pinned(p, m, t) {
    if (p.trunk == null) return false;
    if (Number.isFinite(m.yaw)) p.yaw = m.yaw;
    if (Number.isFinite(m.pitch)) p.pitch = m.pitch;
    keepInTrunk(p, t);
    return true;
  }

  // Radar spotting (updateSpotting): nobody sees into a trunk.
  function unspot(list) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].trunk != null) list.splice(i, 1);
  }

  // A car blew up (explodeCar): whoever hid in its trunk dies with it, the kill to whoever blew it up.
  function carBlown(c, attacker) {
    for (const q of players.values()) {
      if (q.trunk !== c.id) continue;
      q.trunk = null;
      if (q.alive) deps.killPlayer(q, attacker && attacker !== q && !deps.mates(attacker, q) ? attacker : null, 'car', false);
    }
  }

  // The snapshot's `st` while there's anything to say (see shared/stealth.js).
  function snap() {
    const t = deps.now(), s = [], k = [];
    for (const p of players.values()) {
      if (!p.alive) continue;
      if (p.sootUntil > t) s.push([p.id, Math.round((p.sootUntil - t) / 100) / 10]);
      if (p.trunk != null) k.push([p.id, p.trunk]);
    }
    if (!st.lit && !s.length && !k.length) return {};
    const out = {};
    if (st.lit) out.f = 1;
    if (s.length) out.s = s;
    if (k.length) out.k = k;
    return { st: out };
  }

  // (for other features: group 10's real fire starts from the lit fireplace)
  const fireLit = () => st.lit;
  const hearth = () => { const C = chimney(); return C ? hearthFront(C) : null; };

  return { reset, use, updateAct, tick, trunk, leave, pinned, unspot, carBlown, snap, fireLit, hearth, light, state: st };
}
