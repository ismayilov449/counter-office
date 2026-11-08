// Stealth's server module (lib/stealth.js) and shared rules (shared/stealth.js) in Node, with a fake server: no game
// server needed. The trunk's geometry (behind the car, beside its back end, not beside the doors, not the pickup), where
// a hider is kept, radar spotting (unspot), a car blowing up (carBlown), being downed in a trunk, the snapshot's `st`,
// the bots' eyes (canSee), and the chimney's zones (the hearth, the top, the flue, the firebox).
// node dev/test-scripts/stealth/unit.mjs   (exit code 1 on any failure)
import { createStealth } from '../../../lib/stealth.js';
import { STEALTH, atTrunk, trunkPos, trunkBack, trunkExits, hasTrunk, inFlue, upFlue, inFirebox, atHearth, atTop, topSpot, chimneyLadder, stealthOf } from '../../../shared/stealth.js';
import { CHIMNEY as C } from '../../../shared/maps/mansion_stealth.js';
import { BotManager } from '../../../lib/bots.js';
import { carForward } from '../../../shared/vehicles.js';
import { MAPS } from '../../../shared/maps/index.js';
let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); };

// ---- the trunk's geometry
const car = { id: 1, type: 'car', p: [0, 0, 0], yaw: 0.6, speed: 0 }, f = carForward(car.yaw), r = [-f[2], 0, f[0]];
const at = (along, side, y = 0) => [f[0] * along + r[0] * side, y, f[2] * along + r[2] * side];
ok(atTrunk(car, at(-2.8, 0)) && atTrunk(car, at(-1.85, 1.3)) && atTrunk(car, at(-1.85, -1.3)), 'behind the car, and beside its back end either side: at the trunk');
ok(!atTrunk(car, at(0, 1.6)) && !atTrunk(car, at(-1.0, 1.4)) && !atTrunk(car, at(2.8, 0)), 'beside the doors or in front: not (E gets into the car there)');
ok(!atTrunk(car, at(-4.0, 0)) && !atTrunk(car, at(-2.8, 0, 1.5)), 'too far behind, or on top of something: not');
ok(!atTrunk({ ...car, type: 'pickup' }, at(-2.8, 0)) && !hasTrunk({ type: 'pickup' }) && hasTrunk({}), 'the pickup has none (a car without a type has one)');
const tp = trunkPos(car), tb = trunkBack(car);
ok(Math.abs((tp[0] * f[0] + tp[2] * f[2]) - STEALTH.trunk.at) < 1e-9 && tp[1] === STEALTH.trunk.low && Math.abs(tb[0] * f[0] + tb[2] * f[2] + 2.2) < 1e-9, 'the hider lies 1.6 m back from the middle, under the bullets\' line; the bumper is 2.2 m back');
ok(trunkExits(car).length === 6 && Math.abs(trunkExits(car)[0][0] * f[0] + trunkExits(car)[0][2] * f[2] + 3.0) < 1e-9, 'six ways out, behind it first');

// ---- the server module with a fake server
const players = new Map(), sent = [], kills = [], broadcasts = [];
const mk = (id, team, p) => { const q = { id, team, name: 'P' + id, alive: true, p: p.slice(), history: [], c: 0, act: null }; players.set(id, q); return q; };
const world = { cars: [{ ...car }, { id: 0, type: 'pickup', p: [20, 0, 0], yaw: 0, speed: 0 }], move: () => [] };
const game = { phase: 'live' };
let T = 1000;
const st = createStealth({
  game, players, map: () => MAPS.cs_mansion, world: () => world, broadcast: m => broadcasts.push(m), send: (p, m) => sent.push([p.id, m]), now: () => T,
  applyDamage: () => 0, killPlayer: (v, k, w) => { kills.push([v.id, k && k.id, w]); v.alive = false; }, mates: (a, b) => a.team === b.team,
  groundY: () => 0, roundless: () => false, sparkAt: () => false,
});
const hider = mk(1, 'CT', at(-2.6, 0)), mate = mk(2, 'CT', at(-2.6, 0.3)), enemy = mk(3, 'T', [10, 0, 10]);
st.reset();
ok(st.trunk(hider, T) && hider.trunk === 1, 'E behind it: in the trunk');
ok(Math.hypot(hider.p[0] - tp[0], hider.p[2] - tp[2]) < 1e-3 && hider.c === 1, 'kept where the trunk is, crouched');
ok(JSON.stringify(st.snap()) === JSON.stringify({ st: { k: [[1, 1]] } }), `the snapshot: st.k (${JSON.stringify(st.snap())})`);
const list = [hider, mate, enemy];
st.unspot(list);
ok(list.length === 2 && !list.includes(hider), 'radar spotting: the hider is taken off the list');
// the car moves: he goes along (every tick)
world.cars[0].p = [5, 0, 3];
st.tick(T += 31);
const tp2 = trunkPos(world.cars[0]);
ok(Math.hypot(hider.p[0] - tp2[0], hider.p[2] - tp2[2]) < 1e-3, 'the car moved: so did he');
// his browser's position is ignored
ok(st.pinned(hider, { yaw: 1, pitch: 0 }, T) && hider.yaw === 1 && Math.hypot(hider.p[0] - tp2[0], hider.p[2] - tp2[2]) < 1e-3, 'his own position ignored (where he looks counts)');
// downed in it: out
hider.downed = true;
st.tick(T += 31);
ok(hider.trunk == null && sent.some(([id, m]) => id === 1 && m.t === 'stTo'), 'downed in it: put out of it');
hider.downed = false;
// blown up inside: dead, the attacker's kill (not a teammate's)
hider.p = at(-2.6, 0); world.cars[0].p = [0, 0, 0];
st.trunk(hider, T);
st.carBlown(world.cars[0], enemy);
ok(kills.length === 1 && kills[0][0] === 1 && kills[0][1] === 3 && kills[0][2] === 'car' && hider.trunk == null, `blown up inside: he dies, the attacker's kill (${JSON.stringify(kills)})`);
hider.alive = true;
hider.p = at(-2.6, 0);
st.trunk(hider, T);
st.carBlown(world.cars[0], mate);
ok(kills.length === 2 && kills[1][1] == null, 'blown up by a teammate: nobody\'s kill');
hider.alive = true;
// the round's reset empties the trunks
hider.p = at(-2.6, 0);
st.trunk(hider, T);
st.reset();
ok(hider.trunk == null && !st.snap().st, 'a new round: the trunks are empty, nothing to say');
// in freeze time, in a car, holding a hostage, playing dead: no
game.phase = 'freeze';
ok(!st.trunk(hider, T), 'not in freeze time');
game.phase = 'live';
for (const k of ['driving', 'riding', 'zip', 'cctv', 'shield', 'downed', 'playingDead']) {
  hider[k] = k === 'shield' || k === 'driving' ? 0 : 1;
  const no = !st.trunk(hider, T);
  hider[k] = k === 'driving' || k === 'riding' || k === 'shield' ? null : 0;
  if (!no) ok(false, `${k}: got in anyway`);
}
ok(hider.trunk == null, 'not while driving, riding, on the zip line, at the CCTV desk, holding a hostage, down or playing dead');

// ---- the bots' eyes
const bm = Object.create(BotManager.prototype);
bm.api = { game: () => ({ smokes: [] }), world: () => ({ raycast: () => null }) };
const bot = { p: [0, 0, 0], c: 0, yaw: Math.atan2(-(5 - 0), -(0 - 0)), team: 'T', bot: { alert: null, target: null } };
const lv = { spot: 60, fov: 2 };
const seen = { p: [5, 0, 0], c: 1, team: 'CT', trunk: null };
ok(!!bm.canSee(bot, seen, 0, lv), 'a bot sees a player in the open');
ok(bm.canSee(bot, { ...seen, trunk: 1 }, 0, lv) === null, 'but not one in a trunk');

// ---- the chimney's zones
ok(inFlue(C, [-19.3, 5, 4.8]) && upFlue(C, [-19.3, 5, 4.8]) && !upFlue(C, [-19.3, C.hearth, 4.8]) && inFlue(C, [-19.3, C.hearth, 4.8]), 'the flue: up it vs on the hearth inside it');
ok(inFirebox(C, [-19.3, C.hearth, 4.5]) && !inFirebox(C, [-19.3, 3, 4.8]) && !inFirebox(C, [-19.3, C.floor, 3.6]), 'the firebox: low inside the mouth; not up the flue, not in the room');
ok(atHearth(C, [-19.3, C.hearth, 3.85]) && atHearth(C, [-18.5, C.floor, 3.4]) && !atHearth(C, [-19.3, C.hearth, 4.6]) && !atHearth(C, [-19.3, 4.27, 3.8]), 'lighting it: in front of the hearth (not inside, not upstairs)');
ok(atTop(C, [-19.3, 9.75, 5.7]) && atTop(C, [-20.6, 9.2, 4.8]) && !atTop(C, topSpot(C)) && !atTop(C, [-19.3, 4.27, 3.8]), 'the top: on the roof round the stack (not inside it, not in the room below)');
const L = chimneyLadder(C), Loff = chimneyLadder(C, true);
ok(L.max[1] === 10.4 && L.min[1] === C.hearth && Loff.max[1] < -100 && L.chimney, 'the rungs\' ladder, and taken away');
ok(stealthOf(MAPS.cs_mansion)?.chimney && stealthOf(MAPS.cs_mansion_night)?.chimney && !stealthOf(MAPS.de_dust2) && !stealthOf(MAPS.aim_map), 'the Mansion maps have it, the others not');

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
