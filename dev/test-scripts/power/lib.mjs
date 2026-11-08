// node lib.mjs — lib/power.js on its own (a stand-in for server.js around it, no network), for what a scripted player
// can't set up: hostages in a falling cabin, someone under it, the fuel cans' refuel() hook, poweredAt().
//   - a T cuts the cable with the cabin on the ground floor: the lift is told to fall (never caught: POWER_CATCH=0);
//     when it lands on the buffers: a CT and a T riding take the fall damage for 3.9 m (the CT's credited to the Cutter,
//     the T's to nobody), a hostage riding too, a CT and a hostage under it are crushed (killed outright: 'crushed' is
//     one of the body's outright deaths), one elsewhere untouched; the crash sparks; caught, nobody is hurt
//   - refuel(): fills up to the tank, never over; an empty generator stays off until started
//   - powered()/poweredAt() follow the breakers, the mains, the generator; liftWorks() the cable too
process.env.POWER_CATCH = '0';
process.env.POWER_SURGE = '0';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const G = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { MAPS } = await G('shared/maps/index.js');
const { createPower } = await G('lib/power.js');
const { CABLE, GEN, crashDamage } = await G('shared/power.js');
const { BODY } = await G('shared/body.js');

let fails = 0, checks = 0;
const ok = (cond, what) => { checks++; if (!cond) { fails++; console.log('FAIL', what); } else if (process.env.V) console.log('ok  ', what); };
const map = MAPS.cs_mansion, E = map.elevator, W = map.power.winch;
let clock = 1000;
const calls = { dmg: [], host: [], spark: [], msgs: [], notes: [], sent: [] };
const players = new Map();
const mk = (id, team, p) => { const q = { id, name: 'P' + id, team, p, alive: true, act: null }; players.set(id, q); return q; };
const mid = [(E.cabin.x1 + E.cabin.x2) / 2, (E.cabin.z1 + E.cabin.z2) / 2];
const cutter = mk(1, 'T', [-19.85, W.floor, -4.47]);
const rider = mk(2, 'CT', [mid[0], E.stops[1], mid[1]]);
const mate = mk(3, 'T', [mid[0] + 0.3, E.stops[1], mid[1] + 0.3]);
const under = mk(4, 'CT', [-20.6, E.pit, -4.6]);
const away = mk(5, 'CT', [0, 0, 0]);
const hostages = [
  { id: 0, state: 'idle', p: [mid[0] - 0.3, E.stops[1], mid[1]] }, // riding
  { id: 1, state: 'idle', p: [-20.6, E.pit, -4.4] }, // under it
  { id: 2, state: 'idle', p: [-22.25, 4.27, -3.658] }, // upstairs, outside the shaft
];
const lights = {};
for (const g of map.fusebox.groups) lights[g] = true;
lights.power = true;
const game = { phase: 'live', lights, hostages };
let fell = null;
const elevator = { fall: (t, tc, land) => { fell = { t, tc, land }; return { y: E.stops[1] }; } };
const pw = createPower({
  map: () => map, game, players, now: () => clock,
  send: (p, m) => calls.sent.push([p.id, m]), broadcast: m => calls.msgs.push(m), notify: t => calls.notes.push(t),
  sparkAt: (pos, kind, by) => calls.spark.push({ pos, kind, by: by?.id ?? null }),
  applyDamage: (v, a, d, part, w) => { calls.dmg.push({ v: v.id, a: a?.id ?? null, d, w }); if (d >= 100) v.alive = false; },
  hurtHostage: (h, a, d, w) => calls.host.push({ h: h.id, a: a?.id ?? null, d, w }),
  mates: (a, b) => a.team === b.team, elevator: () => elevator,
});
pw.reset();
ok(BODY.outright.includes('crushed'), 'crushed is an outright death (no downed state)');
ok(pw.on() && pw.liftWorks() && !pw.broken(), 'fresh: the lift works');

// ---- the cut
cutter.pwAim = 'w';
ok(pw.use(cutter, clock) && cutter.act?.type === 'pwCut', 'the T at the winch: E starts cutting');
ok(calls.msgs.some(m => m.t === 'pwSfx' && m.s === 'grind'), 'the grinder\'s sound');
clock += 2000; pw.act(cutter, cutter.act, clock);
ok(cutter.act && !fell, 'not yet after 2 s');
clock += CABLE.hold * 1000; pw.act(cutter, cutter.act, clock);
ok(!cutter.act && fell && fell.tc === 0 && fell.land === CABLE.land, `cut: the lift told to fall, never caught (${JSON.stringify(fell)})`);
ok(pw.broken() && !pw.liftWorks(), 'out of order');
ok(calls.msgs.some(m => m.t === 'pwSfx' && m.s === 'snap') && calls.notes.some(t => /cut the lift's cable/.test(t)), 'the snap, everyone told');
ok(lights.elevator === false && lights.dead.includes('elevator'), 'its cabin light is out');
// ---- the landing (lib/elevator.js calls it)
for (const q of [rider, mate]) q.p[1] = CABLE.land;
hostages[0].p[1] = CABLE.land;
pw.landed({ y: CABLE.land, t: clock + 1200 });
const want = crashDamage(E.stops[1] - CABLE.land), dmg = id => calls.dmg.filter(c => c.v === id);
ok(dmg(2).length === 1 && dmg(2)[0].d === want && dmg(2)[0].a === 1 && dmg(2)[0].w === 'lift', `the CT riding: ${want} damage from the Cutter (${JSON.stringify(dmg(2))})`);
ok(dmg(3).length === 1 && dmg(3)[0].d === want && dmg(3)[0].a === null, `the T riding: the same, from nobody (${JSON.stringify(dmg(3))})`);
ok(dmg(4).length === 1 && dmg(4)[0].d >= 500 && dmg(4)[0].w === 'crushed' && dmg(4)[0].a === 1, `the CT under it: crushed (${JSON.stringify(dmg(4))})`);
ok(dmg(5).length === 0 && dmg(1).length === 0, 'the CT elsewhere and the Cutter: nothing');
const host = id => calls.host.filter(c => c.h === id);
ok(host(0).length === 1 && host(0)[0].d === want && host(0)[0].w === 'lift' && host(0)[0].a === null, `the hostage riding: ${want} (${JSON.stringify(host(0))})`);
ok(host(1).length === 1 && host(1)[0].d >= 500 && host(1)[0].w === 'crushed', 'the hostage under it: crushed');
ok(host(2).length === 0, 'the hostage upstairs: nothing');
ok(calls.spark.some(s => s.kind === 'electric' && s.by === 1 && Math.abs(s.pos[1] - CABLE.land) < 1), 'the crash sparks (gas), from the Cutter');
ok(calls.msgs.some(m => m.t === 'pwSfx' && m.s === 'crash'), 'the crash\'s sound');
// ---- caught (the same landing, held higher): nobody hurt
pw.reset();
calls.dmg.length = 0; calls.host.length = 0;
for (const q of players.values()) q.alive = true;
rider.p = [mid[0], E.stops[2], mid[1]];
cutter.pwAim = 'w';
pw.use(cutter, clock); clock += CABLE.hold * 1000 + 10; pw.act(cutter, cutter.act, clock);
pw.landed({ y: E.stops[2] - 0.84, t: clock + 700 });
ok(calls.dmg.length === 0 && calls.host.length === 0 && calls.msgs.some(m => m.t === 'pwSfx' && m.s === 'caught'), 'caught by the brake: nobody hurt, its screech');

// ---- refuel (the fuel cans' hook)
pw.reset();
const g = () => pw.debug().g;
ok(pw.refuel(10) === 0 && g()[1] === GEN.tank, 'a full tank takes nothing');
const ct = away;
ct.p = [-19.6, 0, -16.0]; ct.pwAim = 'g';
pw.use(ct, clock); clock += GEN.start * 1000 + 10; pw.act(ct, ct.act, clock);
ok(g()[0] === 1, 'the CT started the generator');
clock += 30000;
const added = pw.refuel(50);
ok(Math.abs(added - 30) < 0.1 && Math.abs(g()[1] - GEN.tank) < 0.1 && g()[0] === 1, `30 s burnt: refuel(50) takes ${added.toFixed(1)}, full again, still running`);
clock += GEN.tank * 1000 + 100;
pw.tick(clock);
ok(g()[0] === 0 && g()[1] === 0, 'it runs dry');
ok(pw.refuel(20) === 20 && g()[0] === 0 && g()[1] === 20, 'refuelled empty: 20 s in, it stays off until someone starts it');
ok(pw.refuel(-5) === 0 && pw.refuel(NaN) === 0, 'nonsense refuels nothing');

// ---- powered(), poweredAt()
pw.reset();
ok(pw.powered('upper') && pw.poweredAt([-15, 5, 0]) && pw.poweredAt([0, 0, 0]), 'all on');
lights.power = false;
pw.tick(clock);
ok(!pw.powered('upper') && !pw.poweredAt([-15, 5, 0]) && pw.poweredAt([0, 0, 0]) && !pw.liftWorks(), 'the mains off (as the flood does it): nothing on the house live, the lawn not on it');
ok(lights.dead.length === map.fusebox.groups.length, 'every house group dead');
lights.power = true;
pw.tick(clock);
ok(pw.powered('cellar') && lights.dead.length === 0 && lights.lampa7 === true, 'the mains back: every lamp as its switch says');

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
