// Power & machinery on the server (Mansion; the rules both sides share are in shared/power.js, the browser's part is
// public/js/power.js, the geometry shared/maps/mansion_power.js). server.js makes one with createPower(ctx) and calls it
// from a few hooks marked "power:".
//   - Circuits: game.lights[g] (what the browsers draw) is now worked out here for every light group on the house's power:
//     its switch is on (sw), its circuit is live (its breaker, the mains = the fuse box's lever = game.lights.power, or
//     the generator) and its bulb hasn't burst. game.lights.dead lists the groups with no power (the rooms go pitch dark,
//     roomlight.js). powered(circuit) / poweredAt(pos) answer for everything else (the lift, the CCTV, the flood's
//     electrocution at the fuse box; later live wires and sight).
//   - The breaker panel (aimed at, hold E 1 s: Terrorists switch a breaker off, CTs on), the generator (CTs start it,
//     Terrorists stop it; it burns fuel; refuel() is the fuel cans' hook) and the lift's winch (a Terrorist cuts the
//     cable: the cabin falls, see lib/elevator.js fall()).
//   - Power surge: when a circuit's power comes back, some of its lit bulbs burst a moment later (sparks: gas).
//   - Messages: 'power' (the state, see shared/power.js; on every change and to whoever joins), 'pwPop' (a bulb bursts),
//     'pwSfx' (a sound: breaker, genstart, genstop, genout, grind, snap, crash, caught); from the browser 'pwAim' (what E
//     is aimed at: 'b0'..'b4', 'g', 'w', or null).
import { CIRCUITS, CIRCUIT_NAMES, BREAKER, GEN, SURGE, CABLE, REACH, freshState, genFuel, genRunning, live, circuitTable, circuitAt, crashDamage, targetSpot } from '../shared/power.js';
import { inCabin, onRoof, inShaft } from '../shared/elevator.js';
// Crushed under the falling cabin: dead, not downed ('crushed' is in shared/body.js's BODY.outright, which lib/body.js's
// tryDown reads; integration 2026-11-08: it was pushed onto the list from here).

const r2 = v => Math.round(v * 100) / 100;
const r1 = v => Math.round(v * 10) / 10;
const AIM = /^(b[0-4]|g|w)$/;
// (tests: GEN_TANK seconds in a full tank, POWER_SURGE a bulb's chance to burst (0: never), POWER_CATCH the brake's chance, or
// a list like 0,0,1: the outcomes of the cuts in turn, the last one from then on)
const env = globalThis.process?.env || {};
const TANK = +env.GEN_TANK || GEN.tank;
const CHANCE = env.POWER_SURGE != null && env.POWER_SURGE !== '' ? +env.POWER_SURGE : SURGE.chance;
const CATCHES = String(env.POWER_CATCH || '').includes(',') ? env.POWER_CATCH.split(',').map(Number) : null;
const CATCH = !CATCHES && env.POWER_CATCH != null && env.POWER_CATCH !== '' ? +env.POWER_CATCH : CABLE.catch;

// ctx: map(), game, players (Map), now(), send(p, msg), broadcast(msg), notify(text), sparkAt(pos, kind, by),
// applyDamage(...), hurtHostage(...), mates(a, b), elevator() (lib/elevator.js's object)
export function createPower(ctx) {
  const { game, players } = ctx;
  let M = null, st = freshState(), sw = {}, liveWas = {}, pops = [], fall = null, sentLights = '', sentState = '';
  const on = () => !!(M && M.fusebox && M.power && ctx.map() === M);
  const say = (p, text) => ctx.send(p, { t: 'msg', text });
  const sfx = (s, p, extra = {}) => ctx.broadcast({ t: 'pwSfx', s, p: p.map(r2), ...extra });
  const mid = b => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const okPhase = () => game.phase === 'live' || game.phase === 'warmup';
  const groups = () => Object.keys(circuitTable(M));
  const lamps = () => (M.decor || []).filter(d => d.type === 'ceilinglamp' && circuitTable(M)[d.group]);

  function view(t = ctx.now()) {
    return { t: 'power', main: st.main, b: st.b.slice(), g: [st.g[0], r1(genFuel(st, t)), Math.round(t)], burst: st.burst.slice(), cut: st.cut };
  }
  function push(t) {
    const v = view(t), key = JSON.stringify({ ...v, g: [v.g[0], v.g[0] ? st.g[2] : v.g[1]] });
    if (key === sentState) return;
    sentState = key;
    ctx.broadcast(v);
  }

  const liveNow = (c, t) => live(st, c, t);
  // The lamps' states from the switches, the circuits and the bulbs; the circuits that have just come back.
  function compute(t) {
    const tab = circuitTable(M), L = game.lights, back = [];
    for (const c of CIRCUITS) {
      const now = liveNow(c, t);
      if (now && liveWas[c] === false) back.push(c);
      liveWas[c] = now;
    }
    const dead = [];
    for (const g of groups()) {
      const c = tab[g], ok = liveNow(c, t) && !(g === 'elevator' && st.cut);
      if (!ok) dead.push(g);
      L[g] = ok && sw[g] !== false && !st.burst.includes(g);
    }
    L.dead = dead;
    return back;
  }
  // After any change: the lamps, the surge for circuits that came back, the messages.
  function sync(t, by = null, extra = null) {
    const back = compute(t);
    if (back.length) surge(back, t, by);
    const s = JSON.stringify(game.lights);
    if (extra || s !== sentLights) { sentLights = s; ctx.broadcast({ t: 'lights', lights: game.lights, ...(extra || {}) }); }
    push(t);
  }

  // ---- the surge: some lit bulbs on the circuits that came back burst a moment later
  function surge(circuits, t, by) {
    const tab = circuitTable(M);
    const cands = lamps().filter(d => circuits.includes(tab[d.group]) && sw[d.group] !== false && !st.burst.includes(d.group) && !pops.some(o => o.g === d.group));
    let pick = cands.filter(() => Math.random() < CHANCE);
    if (!pick.length && CHANCE > 0 && cands.length >= SURGE.atLeast) pick = [cands[Math.floor(Math.random() * cands.length)]];
    pick.forEach((d, i) => pops.push({ at: t + (SURGE.delay + i * SURGE.gap) * 1000, g: d.group, p: [d.p[0], d.p[1] - 0.15, d.p[2]], by: by?.id ?? null }));
  }
  function popDue(t) {
    const due = pops.filter(o => o.at <= t);
    if (!due.length) return;
    pops = pops.filter(o => o.at > t);
    const tab = circuitTable(M);
    let any = false;
    for (const o of due) {
      // (only with current through it: switched off or dead again since, it stays whole)
      if (!liveNow(tab[o.g], t) || sw[o.g] === false || st.burst.includes(o.g)) continue;
      st.burst.push(o.g);
      any = true;
      ctx.broadcast({ t: 'pwPop', g: o.g, p: o.p.map(r2) });
      ctx.sparkAt(o.p, 'electric', players.get(o.by) || null); // gas: a bulb bursting is a spark
    }
    if (any) sync(t);
  }

  // ---- the lift's cable: cut, the fall, the landing
  function cutCable(by, t) {
    const E = M.elevator, el = ctx.elevator();
    st.cut = 1;
    const caught = CATCHES ? (CATCHES.length > 1 ? CATCHES.shift() : CATCHES[0]) >= 0.5 : Math.random() < CATCH;
    const r = el.fall(t, caught ? CABLE.tc : 0, CABLE.land);
    const y = r ? r.y : CABLE.land;
    const riders = [...players.values()].filter(q => q.alive && (inCabin(E, y, q.p, 0.35) || onRoof(E, y, q.p, 0.3))).map(q => q.id);
    const hostages = (game.hostages || []).filter(h => h.state !== 'dead' && h.state !== 'rescued' && (inCabin(E, y, h.p, 0.35) || onRoof(E, y, h.p, 0.3))).map(h => h.id);
    fall = { by: by.id, y0: y, caught, riders, hostages };
    sfx('snap', M.power.winch.rope);
    ctx.notify(`${by.name} cut the lift's cable!`);
    sync(t);
    if (!r || y <= CABLE.land + 0.01) landed({ y, t }); // (already at the bottom: nothing falls)
  }
  const attackerFor = (f, q) => { const by = players.get(f.by); return by && by !== q && !ctx.mates(by, q) ? by : null; };
  // From lib/elevator.js when the falling cabin stops: on the pit's buffers (a crash) or held by the brake.
  function landed({ y, t }) {
    if (!fall || !on()) { fall = null; return; }
    const E = M.elevator, f = fall, h = f.y0 - y, cx = (E.shaft.x1 + E.shaft.x2) / 2, cz = (E.shaft.z1 + E.shaft.z2) / 2;
    fall = null;
    if (y > CABLE.land + 0.01) {
      // the emergency brake held it
      sfx('caught', [cx, y + 1.2, cz]);
      ctx.notify('The lift\'s emergency brake caught the cabin');
      return;
    }
    const dmg = crashDamage(h);
    sfx('crash', [cx, y + 0.3, cz], { h: r2(h) });
    ctx.sparkAt([cx, y + 0.4, cz], 'electric', players.get(f.by) || null); // gas: the crash sparks
    for (const q of players.values()) {
      if (!q.alive || !inShaft(E, q.p)) continue;
      if (f.riders.includes(q.id)) { if (dmg > 0) ctx.applyDamage(q, attackerFor(f, q), dmg, null, 'lift', 1, null); }
      else if (q.p[1] < y - 0.02) ctx.applyDamage(q, attackerFor(f, q), 500, null, 'crushed', 1, null); // under it: crushed
    }
    for (const hg of game.hostages || []) {
      if (hg.state === 'dead' || hg.state === 'rescued' || !inShaft(E, hg.p)) continue;
      if (f.hostages.includes(hg.id) ? dmg > 0 : hg.p[1] < y - 0.02) ctx.hurtHostage(hg, null, f.hostages.includes(hg.id) ? dmg : 500, f.hostages.includes(hg.id) ? 'lift' : 'crushed');
    }
    ctx.notify(h > CABLE.safe ? 'The lift\'s cabin crashed into the pit!' : 'The lift\'s cabin dropped onto the pit\'s buffers');
  }

  // ---- the held actions (p.act types 'pwBreaker', 'pwGen', 'pwCut')
  function finish(p, a, t) {
    if (a.type === 'pwBreaker') {
      st.b[a.k] = a.to;
      sfx('breaker', mid(M.power.panel), { on: a.to });
      ctx.notify(a.to ? `${p.name} switched the breaker for ${CIRCUIT_NAMES[CIRCUITS[a.k]]} back on` : `${p.name} switched off the breaker for ${CIRCUIT_NAMES[CIRCUITS[a.k]]}`);
      ctx.sparkAt(mid(M.power.panel), 'switch', p); // gas: a breaker sparks like a light switch
      sync(t, p);
    } else if (a.type === 'pwGen') {
      st.g = [a.to, genFuel(st, t), Math.round(t)];
      sfx(a.to ? 'genstart' : 'genstop', M.power.gen.exhaust);
      ctx.notify(a.to ? `${p.name} started the generator in the garage` : `${p.name} switched the generator off`);
      if (a.to) ctx.sparkAt(mid(M.power.gen), 'motor', p); // gas: the engine's spark
      sync(t, p);
    } else if (a.type === 'pwCut') cutCable(p, t);
  }

  return {
    // Each round (from resetWorld, after game.lights is fresh) and on a new map.
    reset() {
      M = ctx.map();
      st = freshState();
      st.g[1] = TANK;
      sw = {};
      liveWas = {};
      pops = [];
      fall = null;
      sentLights = '';
      sentState = '';
      if (!on()) return;
      for (const g of groups()) sw[g] = game.lights[g] !== false;
      st.main = game.lights.power !== false ? 1 : 0;
      compute(ctx.now());
      push(ctx.now());
    },
    on,
    // Is this circuit live? ('upper', 'ground', 'cellar', 'cctv', 'lift'; on maps without the house's power: the
    // blackout's state, or true.)
    powered(c, t = ctx.now()) { return on() ? liveNow(c, t) : game.lights?.power !== false; },
    // Is there power at this point? (The circuit of the room it's in; true where nothing is on the house's power.)
    poweredAt(pos, t = ctx.now()) { if (!on()) return game.lights?.power !== false; const c = circuitAt(M, pos); return !c || liveNow(c, t); },
    // The lift runs: its circuit is live and its cable whole (lib/elevator.js's power()).
    liftWorks() { return on() ? liveNow('lift', ctx.now()) && !st.cut : game.lights?.power !== false; },
    broken() { return on() && !!st.cut; },
    // The fuse box's lever (setPower in server.js). True when handled here.
    setMains(onNow, by) {
      if (!on()) return false;
      const t = ctx.now();
      game.lights.power = onNow;
      st.main = onNow ? 1 : 0;
      sync(t, by, { power: onNow ? 'on' : 'off', p: M.fusebox.p });
      ctx.notify(onNow ? `${by.name} brought the power back on` : `${by.name} cut the power — the house is dark`);
      ctx.sparkAt(M.fusebox.p, 'fusebox', by); // gas: the fuse box's lever sparks
      return true;
    },
    // A light switch (E). True when handled here (a switch on the house's power).
    onSwitch(p, s) {
      if (!on()) return false;
      const c = circuitTable(M)[s.group];
      if (!c) return false;
      const t = ctx.now();
      if (!liveNow(c, t)) {
        const k = CIRCUITS.indexOf(c);
        say(p, !st.b[k] ? `No power on ${CIRCUIT_NAMES[c]} — its breaker is off (the panel is in the cellar, by the fuse box).` : 'No power — someone pulled the lever at the fuse box in the cellar.');
        return true;
      }
      if (st.burst.includes(s.group)) { say(p, 'The bulb has burst — no light here until the next round.'); return true; }
      sw[s.group] = sw[s.group] === false;
      compute(t);
      sentLights = JSON.stringify(game.lights);
      ctx.broadcast({ t: 'lights', lights: game.lights, p: s.p });
      ctx.sparkAt(s.p, 'switch', p); // gas: a light switch sparks
      return true;
    },
    // 'pw…' messages from a browser.
    message(p, m) {
      if (m.t === 'pwAim') p.pwAim = typeof m.a === 'string' && AIM.test(m.a) ? m.a : null;
    },
    // E: what the player's browser says they aim at (checked here). True when it was ours.
    use(p, t) {
      if (!on() || p.bot || p.downed || p.playingDead || !p.pwAim || !okPhase()) return false;
      const a = p.pwAim, spot = targetSpot(M.power, a);
      if (!spot || Math.hypot(p.p[0] - spot.p[0], p.p[2] - spot.p[2]) > REACH + 0.6 || Math.abs(p.p[1] - spot.floor) > 1.0) return false;
      if (a === 'w' && !M.elevator) return false;
      const T = p.team === 'T', CT = p.team === 'CT';
      if (!T && !CT) return false;
      const act = (type, dur, extra) => { p.act = { type, start: t, pos: p.p.slice(), dur: dur * 1000, ...extra }; };
      if (a[0] === 'b') {
        const k = +a[1], isOn = !!st.b[k];
        if (T && isOn) act('pwBreaker', BREAKER.hold, { k, to: 0 });
        else if (CT && !isOn) act('pwBreaker', BREAKER.hold, { k, to: 1 });
        else say(p, isOn ? `The breaker for ${CIRCUIT_NAMES[CIRCUITS[k]]} is on. (Only the Terrorists would switch it off.)` : `The breaker for ${CIRCUIT_NAMES[CIRCUITS[k]]} is already off.`);
        return true;
      }
      if (a === 'g') {
        const running = genRunning(st, t), fuel = genFuel(st, t);
        if (CT && !running && fuel > 0) act('pwGen', GEN.start, { to: 1 });
        else if (T && running) act('pwGen', GEN.stop, { to: 0 });
        else if (running) say(p, `The generator is running — ${Math.ceil(fuel)} s of fuel left.`);
        else if (fuel <= 0) say(p, 'The generator\'s tank is empty.');
        else say(p, 'The generator is off. (The CTs can start it.)');
        return true;
      }
      // 'w': the winch
      if (st.cut) say(p, 'The lift\'s cable has already been cut.');
      else if (T) { act('pwCut', CABLE.hold, {}); sfx('grind', M.power.winch.rope, { d: CABLE.hold }); }
      else say(p, 'The lift\'s winch. The Terrorists could cut its cable here.');
      return true;
    },
    // A held action (updateActions): done after its time if the player holds still and nothing changed meanwhile.
    act(p, a, t) {
      const stale = a.type === 'pwBreaker' ? !!st.b[a.k] === !!a.to : a.type === 'pwGen' ? genRunning(st, t) === !!a.to : a.type === 'pwCut' ? !!st.cut : true;
      if (!on() || !p.alive || !okPhase() || stale || Math.hypot(p.p[0] - a.pos[0], p.p[2] - a.pos[2]) > 0.6) { p.act = null; return; }
      if (t - a.start < a.dur) return;
      p.act = null;
      finish(p, a, t);
    },
    // Every tick (Mansion): the fuse box changed by something else (the flood's electrocution), the generator's fuel,
    // the bulbs bursting.
    tick(t) {
      if (!on()) return;
      const main = game.lights.power !== false ? 1 : 0;
      // (said as the fuse box's change, as setPower's: the lamps' message without it played a light switch's click for
      // everyone, from nowhere, and the last 'lights' message said nothing of the mains; integration 2026-11-08)
      if (main !== st.main) { st.main = main; sync(t, null, { power: main ? 'on' : 'off', p: M.fusebox.p }); }
      if (st.g[0] && genFuel(st, t) <= 0) {
        st.g = [0, 0, Math.round(t)];
        sfx('genout', M.power.gen.exhaust);
        ctx.notify('The generator ran out of fuel');
        sync(t);
      }
      if (pops.length) popDue(t);
    },
    send(p) { if (on()) ctx.send(p, view()); },
    // From lib/elevator.js: the falling cabin has stopped (y: its floor).
    landed,
    // Fuel cans (ROADMAP group 10): add `seconds` of running to the generator's tank (up to GEN.tank). Returns what
    // went in. (TANK: GEN.tank, or GEN_TANK in tests)
    refuel(seconds) {
      if (!on() || !(seconds > 0)) return 0;
      const t = ctx.now(), fuel = genFuel(st, t), add = Math.max(0, Math.min(TANK - fuel, seconds));
      st.g = [st.g[0] && fuel > 0 ? 1 : 0, fuel + add, Math.round(t)];
      push(t);
      return add;
    },
    // (tests) the state
    debug: () => ({ ...view(), sw: { ...sw }, pops: pops.length, fall }),
  };
}
