// The SWAT helicopter, stage 1, the server's part (ROADMAP 18). Fresh test server: GAME_PORT=3995 MAP=cs_mansion
// BOTS=0 FREEZE_TIME=1 (no browser). Alice and Carol (CT), Bob (T).
// Default: Alice gets in (the pilot), flies it up; Carol can't climb in up there; the fuel burns in the air; Bob's
// bullets on its metal wear its hull down; Alice bails out up high: she lands hurt, and nobody flying it, it falls and
// explodes. FUEL=1 (with HELI_FUEL=5 on the server): Alice hovers until it runs dry: it drops and explodes, killing her.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { HELI, SEATS } from '../../../shared/heli.js';
const ok = checker();
const M = MAPS.cs_mansion, H = M.heli, st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const carol = await player('Carol', 'CT');
await until(() => alice.id() != null, 3000);
const aliceId = alice.id();
const told = { a: [], c: [] };
alice.on.msg = m => told.a.push(m.text);
carol.on.msg = m => told.c.push(m.text);
await nextLive([alice, bob], st);
await until(() => alice.snap?.ph === 'live', 8000);
await sleep(300);
const use = async (p, ms = 100) => { p.send({ t: 'use', on: true }); await sleep(ms); p.send({ t: 'use', on: false }); await sleep(200); };
const hl = () => alice.snap?.hl;
ok(`it stands on its pad (${JSON.stringify(hl())})`, hl() && Math.hypot(hl()[0] - H.p[0], hl()[2] - H.p[2]) < 0.1 && hl()[6] === 0);

// in, up
alice.at([H.p[0] + 2.2, 0, H.p[2]], 0, 0);
await sleep(200);
await use(alice);
ok('Alice gets in, the pilot', got(alice, 'heliIn').at(-1)?.seat === 0);
const fly = async (to, secs) => { // (the pilot's browser: straight there, 20 times a second)
  const from = hl().slice(0, 3), n = Math.round(secs * 20);
  for (let i = 1; i <= n; i++) {
    const p = from.map((v, k) => v + ((to[k] - v) * i) / n);
    alice.send({ t: 'heli', p, yaw: 0, v: [0, (to[1] - from[1]) / secs, 0], tilt: 0, roll: 0, air: p[1] > 0.2 ? 1 : 0 });
    await sleep(50);
  }
};
await fly([H.p[0], 8, H.p[2]], 3);
await sleep(200);
ok(`it flies up there (${JSON.stringify(hl())})`, Math.abs(hl()[1] - 8) < 0.2 && hl()[6] === 1);
const row = carol.snap?.pl.find(r => r[0] === aliceId);
ok(`Alice sits in it (${JSON.stringify(row?.slice(1, 4))})`, row && Math.abs(row[2] - (8 + SEATS[0][1])) < 0.3);

if (!process.env.FUEL) {
  carol.at([H.p[0] + 2, 0, H.p[2]], 0, 0);
  await sleep(200);
  await use(carol);
  ok('Carol can\'t climb in up there', !got(carol, 'heliIn').length);
  await sleep(1500);
  ok(`the fuel burns in the air (${hl()[8]} s left)`, hl()[8] < HELI.fuel - 2);
  // Bob shoots its belly
  bob.w = bob.me?.inv?.secondary?.id || 'glock';
  bob.at([H.p[0], 0, H.p[2] - 5.5], 0, 0); // (in front of its nose, which faces -z while Alice flies it: nobody sits there)
  await sleep(300);
  for (let i = 0; i < 8; i++) {
    const o = bob.eye(), aim = [H.p[0], 8 + 0.6, H.p[2] - 1.45], d = aim.map((v, k) => v - o[k]), l = Math.hypot(...d);
    bob.send({ t: 'shoot', o, d: d.map(v => v / l), w: bob.w, rt: 0 });
    await sleep(250);
  }
  await sleep(200);
  ok(`Bob's bullets wear its hull down (${hl()[7]}%)`, hl()[7] < 100);
  // Alice bails out
  alice.clear();
  await use(alice);
  const out = got(alice, 'heliOut').at(-1);
  ok(`Alice jumps out up high, into the back garden (${JSON.stringify(out?.p)})`, out && out.p[1] > 6 && out.p[0] > -43 && out.p[0] < -29.5);
  // (her browser falls: positions down to the street)
  for (let y = out.p[1]; y > 0; y -= 0.6) { alice.at([out.p[0], Math.max(0, y), out.p[2]], 0, 0); await sleep(50); }
  for (let i = 0; i < 8; i++) { alice.at([out.p[0], 0, out.p[2]], 0, 0); await sleep(60); }
  ok('she lands hurt', await until(() => got(alice, 'dmg').length > 0, 1500));
  ok('nobody flying it, it falls and explodes', await until(() => got(alice, 'boom', m => m.k === 'heli').length > 0, 4000));
  await sleep(200);
  ok(`a wreck (${JSON.stringify(hl())})`, hl()[6] === 3);
} else {
  ok('it runs dry: the engine stops', await until(() => got(alice, 'heliFuel').length > 0, 8000));
  ok('it drops and explodes', await until(() => got(alice, 'boom', m => m.k === 'heli').length > 0, 4000));
  ok('Alice dies in it', await until(() => alice.me?.alive === false, 1500));
}
process.exit();
