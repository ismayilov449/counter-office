// The helicopter pilot's nose rockets and flares, the server's part. Fresh test server: GAME_PORT=3995 MAP=cs_mansion
// BOTS=0 FREEZE_TIME=1 START_MONEY=16000 RPG7=1 (no browser; the RPG-7 is off by default). Alice (CT) flies it, Bob (T)
// on the lawn with an RPG.
// Alice fires a nose rocket at Bob: everyone sees it, he's hurt, 3 left; a second one right away is too soon. Bob's RPG
// hits the helicopter: its hull drops. Alice fires flares: Bob's next RPG flies past and doesn't hurt it; 1 flare left.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { HELI } from '../../../shared/heli.js';
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
ok(`${HELI.rockets} rockets, ${HELI.flares} flares (${hl()?.[11]}, ${hl()?.[12]})`, hl()?.[11] === HELI.rockets && hl()?.[12] === HELI.flares);
let at = H.p.slice();
for (let i = 1; i <= 40; i++) { at = [H.p[0], (6 * i) / 40, H.p[2]]; alice.send({ t: 'heli', p: at, yaw: H.yaw, v: [0, 0, 0], tilt: 0, roll: 0, air: 1 }); await sleep(50); }
const hold = setInterval(() => alice.send({ t: 'heli', p: at, yaw: H.yaw, v: [0, 0, 0], tilt: 0, roll: 0, air: 1 }), 50);
// the nose rocket at Bob, 10 m in front of it (its nose faces west)
bob.at([H.p[0] - 10, 0, H.p[2]], -Math.PI / 2, 0);
await sleep(300);
const nose = [at[0] - 1.9 * 0.7, at[1] + 0.55 * 0.7, at[2]], spot = [bob.p[0], 0, bob.p[2] + 3.5], aim = spot.map((v, k) => v - nose[k]), l = Math.hypot(...aim); // (the ground beside him: hurt, not dead, so the round goes on)
alice.send({ t: 'heliRocket', d: aim.map(v => v / l) });
alice.send({ t: 'heliRocket', d: aim.map(v => v / l) });
ok('everyone sees the rocket', await until(() => got(bob, 'rocket').length > 0, 1000));
ok('Bob is hurt by its blast', await until(() => got(bob, 'dmg').length > 0, 1500));
await sleep(300);
ok(`one rocket gone, the second too soon (${hl()[11]} left, ${got(bob, 'rocket').length} fired)`, hl()[11] === HELI.rockets - 1 && got(bob, 'rocket').length === 1);
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
ok(`no flares left (${hl()[12]})`, hl()[12] === 0);
clearInterval(hold);
process.exit();
