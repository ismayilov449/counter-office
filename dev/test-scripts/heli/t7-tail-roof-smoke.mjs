// The helicopter's tail rotor, its smoke screen and the roof pad, the server's part. Fresh test server: GAME_PORT=3995
// MAP=cs_mansion BOTS=0 FREEZE_TIME=1 START_MONEY=16000 (no browser). Alice (CT) flies it, Carol (CT) rides along, Bob (T)
// on the lawn with his pistol.
// Bob's bullets on the tail boom shoot the tail rotor away (everyone is told; the snapshot says so). Alice's T: a smoke
// cloud on the ground under it, one left. She flies onto the roof pad on the balcony: Carol gets out on the top floor,
// in front of the balcony's doorway.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { HELI, S } from '../../../shared/heli.js';
const ok = checker();
const H = MAPS.cs_mansion.heli, R = H.roof, st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT'), carol = await player('Carol', 'CT');
const bob = await player('Bob', 'T');
await nextLive([alice, carol, bob], st);
await until(() => alice.snap?.ph === 'live', 8000);
const use = async (p, ms = 100) => { p.send({ t: 'use', on: true }); await sleep(ms); p.send({ t: 'use', on: false }); await sleep(200); };
const hl = () => alice.snap?.hl;
alice.at([H.p[0], 0, H.p[2] + 2.2], 0, 0);
carol.at([H.p[0] + 0.5, 0, H.p[2] - 2.2], 0, 0);
await sleep(200);
await use(alice);
await use(carol);
ok(`Alice flies it, Carol rides (${got(alice, 'heliIn').at(-1)?.seat}, ${got(carol, 'heliIn').at(-1)?.seat})`, got(alice, 'heliIn').at(-1)?.seat === 0 && got(carol, 'heliIn').at(-1)?.seat > 0);
ok(`the snapshot: ${HELI.smokes} smokes, the tail rotor whole (${hl()?.[12]}, ${hl()?.[13]})`, hl()?.[12] === HELI.smokes && hl()?.[13] === 0);
// Bob shoots the tail boom (on its pad, nose to the west: the tail is east of it)
bob.w = 'glock'; // (his starting pistol)
bob.at([H.p[0] + 3, 0, H.p[2] + 6], 0, 0); // (beside the tail: east of it is the house's wall)
await sleep(300);
const tail = [H.p[0] + 4.1 * S, 1.65 * S, H.p[2]];
for (let i = 0; i < 30 && !hl()[13]; i++) {
  const o = [bob.p[0], 1.6, bob.p[2]], d = tail.map((v, k) => v - o[k]), n = Math.hypot(...d);
  bob.send({ t: 'shoot', o, d: d.map(v => v / n), w: 'glock', rt: 0 });
  await sleep(200);
}
ok(`Bob's bullets on the tail boom shoot the tail rotor away (hull ${hl()[7]}%)`, await until(() => hl()[13] === 1, 1000) && hl()[7] > 0);
ok('everyone is told', got(bob, 'notify').some(m => /tail rotor/.test(m.text)) || got(bob, 'msg').some(m => /tail rotor/.test(m.text)));
// up, the smoke screen
let at = H.p.slice();
const fly = async (to, step = 2.5) => { while (Math.hypot(...to.map((v, k) => v - at[k])) > 0.01) { const d = to.map((v, k) => v - at[k]), l = Math.hypot(...d), k = Math.min(1, step / l); at = at.map((v, i) => v + d[i] * k); alice.send({ t: 'heli', p: at, yaw: 0, v: [0, 0, 0], tilt: 0, roll: 0, air: at[1] > R.p[1] + 0.05 || at[1] > 0.05 ? 1 : 0 }); await sleep(50); } };
await fly([H.p[0], 6, H.p[2]]);
alice.send({ t: 'heliSmoke' });
ok('its smoke screen: a smoke cloud on the ground under it', await until(() => got(bob, 'boom').some(m => m.k === 'smoke' && Math.abs(m.p[1]) < 0.3 && Math.hypot(m.p[0] - at[0], m.p[2] - at[2]) < 0.5), 1000));
await sleep(200);
ok(`one smoke left (${hl()[12]})`, hl()[12] === HELI.smokes - 1);
// over the house onto the roof pad
await fly([H.p[0], 14, H.p[2]]);
await fly([R.p[0], 14, R.p[2]]);
await fly([R.p[0], R.p[1], R.p[2]], 1);
alice.send({ t: 'heli', p: R.p, yaw: 0, v: [0, 0, 0], tilt: 0, roll: 0, air: 0 });
await sleep(300);
await use(carol);
const out = got(carol, 'heliOut').at(-1)?.p;
ok(`landed on the roof pad, Carol gets out on the top floor in front of the doorway (${out})`, !!out && Math.abs(out[1] - R.p[1]) < 0.1 && R.exits.some(([x, z]) => Math.hypot(out[0] - x, out[2] - z) < 0.01) && !carol.zipFall);
process.exit();
