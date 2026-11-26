// The helicopter pilot's nose PKT and flares, and where the guns may point, the server's part. Fresh test server: GAME_PORT=3995 MAP=cs_mansion
// BOTS=0 FREEZE_TIME=1 START_MONEY=16000 RPG7=1 (no browser; the RPG-7 is off by default). Alice (CT) flies it, Bob (T)
// on the lawn with an RPG.
// Alice's nose gun hits Bob ahead of it; a shot out to the side (into its own cabin's way) does nothing. Bob's RPG
// hits the helicopter: its hull drops. Alice fires flares: Bob's next RPG flies past and doesn't hurt it; 1 flare left.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { HELI, aimOk } from '../../../shared/heli.js';
const ok = checker();
const H = MAPS.cs_mansion.heli, st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
await nextLive([alice, bob], st);
await until(() => alice.snap?.ph === 'live', 8000);
bob.send({ t: 'buy', item: 'rpg' }); // (at his spawn, in the buy zone)
await sleep(300);
const use = async (p, ms = 100) => { p.send({ t: 'use', on: true }); await sleep(ms); p.send({ t: 'use', on: false }); await sleep(200); };
const hl = () => alice.snap?.hl;
alice.at([H.p[0], 0, H.p[2] + 2.2], 0, 0);
await sleep(200);
await use(alice);
ok('Alice flies it', got(alice, 'heliIn').at(-1)?.seat === 0);
ok(`${HELI.flares} flares (${hl()?.[11]})`, hl()?.[11] === HELI.flares);
// the door guns: straight out of the door yes, toward the nose (the pilot) or across the cabin no (yaw 0: nose -z)
ok('door gun arcs', aimOk(0, 2, [1, 0, 0]) && aimOk(0, 3, [-1, 0, 0]) && !aimOk(0, 2, [0, 0, -1]) && !aimOk(0, 2, [-1, 0, 0]) && !aimOk(0, 3, [0.3, 0, -1]) && aimOk(0, 2, [0.05, -1, 0]) && aimOk(0, 0, [0, -0.3, -1]) && !aimOk(0, 0, [1, 0, 0.2]));
let at = H.p.slice();
for (let i = 1; i <= 40; i++) { at = [H.p[0], (6 * i) / 40, H.p[2]]; alice.send({ t: 'heli', p: at, yaw: H.yaw, v: [0, 0, 0], tilt: 0, roll: 0, air: 1 }); await sleep(50); }
const hold = setInterval(() => alice.send({ t: 'heli', p: at, yaw: H.yaw, v: [0, 0, 0], tilt: 0, roll: 0, air: 1 }), 50);
// the nose gun at Bob, 10 m in front of it (its nose faces west)
bob.at([H.p[0] - 10, 0, H.p[2]], -Math.PI / 2, 0);
await sleep(300);
const nose = [at[0] - 1.9 * 0.7, at[1] + 0.55 * 0.7, at[2]], spot = [bob.p[0], 1.0, bob.p[2]], aim = spot.map((v, k) => v - nose[k]), l = Math.hypot(...aim);
alice.send({ t: 'shoot', o: nose, d: [0, 0, 1], w: 'pkt', rt: 0 }); // (out to its side: not allowed)
await sleep(400);
alice.send({ t: 'shoot', o: nose, d: [0, 0, -1], w: 'pkt', rt: 0 });
await sleep(400);
ok('a nose gun shot out to the side does nothing', got(bob, 'dmg').length === 0 && !got(bob, 'shot').length);
alice.send({ t: 'shoot', o: nose, d: aim.map(v => v / l), w: 'pkt', rt: 0 });
ok('the nose gun hits Bob ahead of it', await until(() => got(bob, 'dmg').length > 0, 1500));
// Bob's RPG at the helicopter
await sleep(1500);
bob.w = 'rpg';
bob.at(bob.p, -Math.PI / 2, 0);
await sleep(300);
const shootRpg = async () => { const o = bob.eye(), t = [at[0] + 0.6, at[1] + 0.6, at[2]], d = t.map((v, k) => v - o[k]), n = Math.hypot(...d); bob.send({ t: 'shoot', o, d: d.map(v => v / n), w: 'rpg', rt: 0 }); await sleep(1200); };
const hp0 = hl()[7];
await shootRpg();
ok(`Bob's RPG hits it (${hp0}% -> ${hl()[7]}%)`, hl()[7] < hp0);
// flares, then another RPG
alice.send({ t: 'heliFlare' });
ok('everyone sees the flares', await until(() => got(bob, 'heliFlare').length > 0, 1000));
const hp1 = hl()[7];
bob.send({ t: 'use', on: false });
await sleep(3200); // (the RPG's reload)
alice.send({ t: 'heliFlare' }); // (the second flares, to cover the second rocket: the first ones are out by now)
await sleep(100);
await shootRpg();
ok(`with flares out its next RPG doesn't hurt it (${hp1}% -> ${hl()[7]}%)`, hl()[7] === hp1);
ok(`no flares left (${hl()[11]})`, hl()[11] === 0);
clearInterval(hold);
process.exit();
