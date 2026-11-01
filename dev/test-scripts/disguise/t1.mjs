// Disguise on the test server (GAME_PORT, default 4070; MAP=aim_map BOTS=0 START_MONEY=16000 FREEZE_TIME=1).
// Five scripted players: Alice and Dave (CT), Bob, Carl and Eve (T). Round by round:
// 1. Alice kills Bob. Standing over him E does nothing; crouched it starts (Carl hears the rustle), moving cancels it;
//    3 s crouched: disguised. Carl's and Eve's snapshots: no Alice, "Bob" alive where she is, no "dg" anywhere in the
//    text; Bob (dead) and Dave see the truth, Dave's "dg" lists her. Carl's radar: a red dot on her before, none after.
//    Carl 2.5 m away looking away: nothing; looking at her: recognised (both told), and his snapshot is the truth again.
//    One uniform per life.
// 2. Disguised, Alice shoots: blown ("shot"), Carl 13 m away is told; a second body: refused (one per life).
// 3. Still disguised when the round ends: cleared at the next round start.
// 4. Alice sneaks up behind Eve (1.5 m, not recognised) and knifes her: blown ("knife").
// 5. Carl shoots the disguised Alice: blown ("hurt"); she dies. Carl takes HER uniform (a T as a CT): Dave's snapshot
//    shows "Alice" where Carl is. Carl throws a grenade: blown ("nade").
import { player, sleep, until, checker, yawTo, spot, los } from './lib.mjs';
const ok = checker();

const rounds = [];
const alice = await player('Alice', 'CT');
alice.on.round = m => rounds.push(m.n);
const bob = await player('Bob', 'T'), dave = await player('Dave', 'CT');
const carl = await player('Carl', 'T'), eve = await player('Eve', 'T');
const all = { alice, bob, dave, carl, eve };
const ID = Object.fromEntries(Object.entries(all).map(([k, c]) => [k, c.id()]));
console.log('ids', JSON.stringify(ID));
// (the gun in hand goes with every position update: a reload is cancelled by a different one)
alice.w = 'usp'; dave.w = 'usp'; carl.w = 'glock'; bob.w = 'glock'; eve.w = 'glock';
let round = 0;
async function nextLive() {
  const want = round + 1;
  await until(() => rounds.some(n => n >= want), 60000, 100);
  round = Math.max(...rounds);
  // a full magazine for everyone who shoots in these tests (survivors keep what's left)
  for (const c of [alice, dave, carl]) c.send({ t: 'reload', w: gun(c) });
  await sleep(3000);
  await until(() => alice.snap?.ph === 'live', 10000, 50);
  for (const c of Object.values(all)) { c.crouch = 0; c.clear(); }
  await sleep(200);
  ok(`round ${round} live, all alive`, Object.values(all).every(c => c.alive));
}
// The pistol in hand (E over a body that gives no uniform swaps it for the one lying there, as it always did).
function gun(c) {
  const inv = c.me?.inv;
  c.w = inv?.primary?.id || inv?.secondary?.id || 'knife';
  return c.w;
}
async function kill(shooter, victim, part = 'head') {
  const w = gun(shooter);
  for (let i = 0; i < 12 && victim.alive; i++) {
    if (i === 4 || i === 8) { shooter.send({ t: 'reload', w }); await sleep(3000); } // (out of bullets?)
    shooter.shootAt(victim, w, part);
    await sleep(450);
  }
  return !victim.alive;
}
const actOf = c => c.snap?.me?.a || null;
const got = (c, t, f = () => true) => c.log.filter(m => m.t === t && f(m));
async function take(c, at, yaw = 0) {
  c.at(at, yaw, 1);
  await sleep(250);
  c.use(true);
  const started = await until(() => actOf(c) === 'disguise', 1500);
  const on = await until(() => got(c, 'disguiseOn').length > 0, 4500);
  c.use(false);
  return started && on;
}
const dgOf = c => c.snap?.dg || null;

// ---------------------------------------------------------------- round 1
await nextLive();
const B = spot(0, 5), A0 = spot(0, 0), C = spot(-8, 5), E = spot(-15, 20), D = spot(5, -10);
bob.at(B, Math.PI); carl.at(C, yawTo(C, A0)); eve.at(E, 0); dave.at(D, 0); alice.at(A0, yawTo(A0, B));
await sleep(700);
ok('Alice kills Bob', await kill(alice, bob));
// control: Carl, looking at Alice from 9 m, has her as a red dot
ok('before: Carl\'s radar has Alice (red dot)', await until(() => (carl.snap?.sp || []).some(r => r[0] === ID.alice), 2000));
const AB = [B[0] + 0.6, B[1], B[2]];
alice.at(AB, yawTo(AB, B), 0);
await sleep(300);
alice.use(true);
await sleep(500);
ok('standing over the body, E starts nothing', actOf(alice) === null);
alice.use(false);
alice.at(AB, yawTo(AB, B), 1);
await sleep(250);
alice.use(true);
ok('crouched, E starts changing', await until(() => actOf(alice) === 'disguise', 1500));
ok('Carl (9 m) hears the rustle start', await until(() => got(carl, 'disguiseFx', m => m.k === 'start').length > 0, 1000));
alice.at([AB[0] + 1, AB[1], AB[2]], alice.yaw, 1);
ok('moving cancels it', await until(() => actOf(alice) === null, 1000));
ok('and the rustle stops for Carl', await until(() => got(carl, 'disguiseFx', m => m.k === 'stop').length > 0, 1000));
alice.use(false);
await sleep(300);
const t0 = Date.now();
ok('crouched 3 s over Bob: disguised', await take(alice, AB, yawTo(AB, B)));
console.log(`     (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
ok('Alice is told she wears Bob\'s uniform (look T)', got(alice, 'disguiseOn', m => m.you && m.as === 'Bob' && m.look === 'T').length === 1);
ok('Dave (teammate) is told too', got(dave, 'disguiseOn', m => m.id === ID.alice).length === 1);
ok('Carl and Eve are told nothing', !got(carl, 'disguiseOn').length && !got(eve, 'disguiseOn').length);
await sleep(300);
for (const [name, c] of [['Carl', carl], ['Eve', eve]]) {
  const raw = c.raw, s = JSON.parse(raw);
  const asBob = s.pl.find(r => r[0] === ID.bob);
  ok(`${name}'s snapshot: no Alice in it`, !s.pl.some(r => r[0] === ID.alice));
  ok(`${name}'s snapshot: "Bob" alive, a T, where Alice crouches`, asBob && asBob[8] === 1 && asBob[9] === 1 && Math.abs(asBob[1] - AB[0]) < 0.05 && Math.abs(asBob[3] - AB[2]) < 0.05 && asBob[6] === 1);
  ok(`${name}'s snapshot text has no "dg"`, !raw.includes('"dg"'));
}
{
  const s = bob.snap, me = s.pl.find(r => r[0] === ID.bob), al = s.pl.find(r => r[0] === ID.alice);
  ok('Bob (dead, the uniform\'s owner) sees the truth: Alice a CT, himself dead', al && al[9] === 2 && me && me[8] === 0 && !bob.raw.includes('"dg"'));
  const ds = dave.snap;
  ok('Dave sees Alice as she is (a CT)', ds.pl.find(r => r[0] === ID.alice)?.[9] === 2);
  ok('Dave\'s "dg": Alice wears Bob\'s (look T)', JSON.stringify(ds.dg?.d) === JSON.stringify([[ID.alice, ID.bob, 'Bob', 1]]));
  ok('Alice\'s "dg": her own entry, and used', alice.snap.dg?.d?.[0]?.[0] === ID.alice && alice.snap.dg?.u?.includes(ID.alice));
  ok('the stripped body is in the CTs\' "dg"', dave.snap.dg?.s?.includes(ID.bob));
}
// the radar: Carl looks at her for 1.5 s, no red dot
carl.at(C, yawTo(C, AB));
await sleep(300);
let dot = false;
for (let i = 0; i < 30; i++) { if ((carl.snap?.sp || []).some(r => r[0] === ID.alice)) dot = true; await sleep(50); }
ok('Carl\'s radar has no red dot on her while she\'s disguised', !dot);
// 2.5 m away, looking away
const C2 = [AB[0] + 2.5, AB[1], AB[2]];
carl.at(C2, yawTo(C2, [20, 0, 5]));
await sleep(600);
ok('Carl 2.5 m away looking away: not recognised', !got(alice, 'disguiseOff').length && !!alice.snap.dg?.d);
carl.at(C2, yawTo(C2, AB));
ok('Carl turns to her: recognised ("near")', await until(() => got(alice, 'disguiseOff', m => m.you && m.why === 'near').length > 0, 1000));
ok('Carl is told who it was', got(carl, 'disguiseOff', m => m.id === ID.alice && m.name === 'Alice' && m.as === 'Bob' && m.why === 'near').length === 1);
ok('Dave is told her disguise is blown', got(dave, 'disguiseOff', m => m.mate && m.id === ID.alice).length === 1);
await sleep(200);
{
  const s = carl.snap, al = s.pl.find(r => r[0] === ID.alice), b = s.pl.find(r => r[0] === ID.bob);
  ok('Carl\'s snapshot: Alice back as a CT, Bob dead on his spot', al && al[9] === 2 && b && b[8] === 0 && Math.abs(b[3] - B[2]) < 0.05);
}
ok('Carl\'s radar has her again', await until(() => (carl.snap?.sp || []).some(r => r[0] === ID.alice), 1500));
alice.use(true);
await sleep(500);
ok('one uniform per life: E over Bob again starts nothing', actOf(alice) === null);
alice.use(false);
alice.at(AB, yawTo(AB, C2), 0);
await sleep(500);
await kill(alice, carl); await kill(alice, eve);

// ---------------------------------------------------------------- round 2: a shot gives you away
await nextLive();
const E2 = spot(-4, 5), C3 = spot(-10, 13);
bob.at(B, Math.PI); eve.at(E2, Math.PI); carl.at(C3, yawTo(C3, A0)); dave.at(D, 0); alice.at(A0, yawTo(A0, B));
await sleep(700);
ok('Alice kills Bob and Eve', (await kill(alice, bob)) && (alice.at(A0, yawTo(A0, E2)), await sleep(300), await kill(alice, eve)));
ok('disguised as Bob', await take(alice, AB, yawTo(AB, B)));
const AE = [E2[0] + 0.6, E2[1], E2[2]];
alice.at(AE, 0, 1); await sleep(250); alice.use(true); await sleep(500);
ok('a second body while disguised: nothing', actOf(alice) === null && dgOf(alice)?.d?.[0]?.[2] === 'Bob');
alice.use(false);
alice.clear(); carl.clear();
ok(`(that E swapped her pistol for Eve's: ${gun(alice)})`, true);
await sleep(200);
alice.send({ t: 'shoot', o: alice.eye(), d: [0, 1, 0], w: gun(alice), rt: 0 });
ok('a shot (into the air): blown ("shot")', await until(() => got(alice, 'disguiseOff', m => m.why === 'shot').length > 0, 1000));
ok('Carl, 13 m away, is told', await until(() => got(carl, 'disguiseOff', m => m.id === ID.alice && m.why === 'shot').length > 0, 500));
await sleep(300);
alice.use(true); await sleep(500);
ok('then Eve\'s body: refused (one per life)', actOf(alice) === null);
alice.use(false);
alice.at(AE, yawTo(AE, C3), 0); await sleep(500);
await kill(alice, carl);

// ---------------------------------------------------------------- round 3: cleared at round start
await nextLive();
const C4 = spot(-8, 12), E4 = spot(6, 10), D4 = spot(5, -6);
ok('(Dave sees Carl and Eve)', los([D4[0], 1.6, D4[2]], [C4[0], 1.2, C4[2]]) && los([D4[0], 1.6, D4[2]], [E4[0], 1.2, E4[2]]));
bob.at(B, Math.PI); carl.at(C4, Math.PI); eve.at(E4, Math.PI); dave.at(D4, yawTo(D4, C4)); alice.at(A0, yawTo(A0, B));
await sleep(700);
await kill(alice, bob);
ok('disguised as Bob', await take(alice, AB, yawTo(AB, B)));
dave.at(D4, yawTo(D4, C4)); await sleep(300);
await kill(dave, carl);
dave.at(D4, yawTo(D4, E4)); await sleep(300);
await kill(dave, eve);
ok('the round ends with Alice still disguised', await until(() => alice.snap?.ph === 'end', 3000) && !!dgOf(dave)?.d);
ok('(in the round-end phase Carl still sees "Bob")', !carl.snap.pl.some(r => r[0] === ID.alice));
await until(() => alice.snap?.ph === 'freeze', 10000);
await sleep(200);
ok('next round: no "dg" for anyone, Carl sees Alice as she is', !dave.raw.includes('"dg"') && !alice.raw.includes('"dg"') && carl.snap.pl.find(r => r[0] === ID.alice)?.[9] === 2 && !alice.raw.includes('"dg"'));

// ---------------------------------------------------------------- round 4: a knife from behind
await nextLive();
const E5 = spot(-6, 5), C5 = spot(-10, 20);
bob.at(B, Math.PI); eve.at(E5, yawTo(E5, [-25, 0, 5])); carl.at(C5, 0); dave.at(D, 0); alice.at(A0, yawTo(A0, B));
await sleep(700);
await kill(alice, bob);
ok('disguised as Bob', await take(alice, AB, yawTo(AB, B)));
const behind = [E5[0] + 1.5, E5[1], E5[2]];
alice.at(behind, yawTo(behind, E5), 0); alice.w = 'knife';
await sleep(600);
ok('1.5 m behind Eve (she looks away): not recognised', !got(alice, 'disguiseOff').length);
alice.clear(); eve.clear();
alice.shootAt(eve, 'knife', 'chest');
ok('a knife hit: blown ("knife")', await until(() => got(alice, 'disguiseOff', m => m.why === 'knife').length > 0, 1000));
ok('Eve is told', got(eve, 'disguiseOff', m => m.why === 'knife' && m.id === ID.alice).length === 1);
gun(alice);
await sleep(500);
await kill(alice, eve); alice.at(behind, yawTo(behind, C5)); await sleep(400); await kill(alice, carl);

// ---------------------------------------------------------------- round 5: hurt; death; a T in a CT's uniform; a grenade
await nextLive();
carl.at(spot(-2, 22), Math.PI); await sleep(300);
carl.send({ t: 'buy', item: 'he' }); await sleep(400);
ok('Carl bought an HE', carl.me?.inv?.he === 1);
const C6 = spot(0, 12);
bob.at(B, Math.PI); eve.at(spot(-15, 20), 0); carl.at(C6, Math.PI); dave.at(D, 0); alice.at(A0, yawTo(A0, B));
await sleep(700);
await kill(alice, bob);
ok('disguised as Bob', await take(alice, AB, yawTo(AB, B)));
alice.at(AB, alice.yaw, 0); await sleep(300);
carl.clear(); alice.clear();
gun(carl); carl.at(C6, yawTo(C6, AB)); await sleep(300);
carl.shootAt(alice, carl.w, 'legs');
ok('Carl (T) shoots her: blown ("hurt")', await until(() => got(alice, 'disguiseOff', m => m.why === 'hurt').length > 0, 1000));
ok(`her health went down (${got(alice, 'dmg').at(-1)?.hp})`, got(alice, 'dmg').at(-1)?.hp < 100);
await kill(carl, alice);
ok('Carl kills her', !alice.alive);
await sleep(200);
ok('dead: nothing in her team\'s "dg" but the stripped body', !dave.snap.dg?.d && !dave.snap.dg?.u);
// Carl strips Alice (she lies where she stood)
const CA = [AB[0] + 0.6, AB[1], AB[2]];
ok('Carl (a T) takes Alice\'s uniform', await take(carl, CA, yawTo(CA, AB)));
await sleep(300);
{
  const s = dave.snap, asAlice = s.pl.find(r => r[0] === ID.alice);
  ok('Dave (CT) sees no Carl, and "Alice" alive, a CT, where Carl is', !s.pl.some(r => r[0] === ID.carl) && asAlice && asAlice[8] === 1 && asAlice[9] === 2 && Math.abs(asAlice[1] - CA[0]) < 0.05);
  // (the CTs' "dg" still lists Bob's body, which Alice stripped; nothing about Carl)
  ok(`nothing about Carl in Dave's "dg": ${JSON.stringify(s.dg)}`, !s.dg?.d && !(s.dg?.u || []).includes(ID.carl) && !(s.dg?.s || []).includes(ID.alice));
  ok('Alice (dead, the owner) sees Carl as he is', alice.snap.pl.find(r => r[0] === ID.carl)?.[9] === 1);
  ok('Eve and Bob (Ts) get Carl in their "dg"', eve.snap.dg?.d?.[0]?.[0] === ID.carl && bob.snap.dg?.d?.[0]?.[0] === ID.carl);
}
dave.clear(); carl.clear();
carl.send({ t: 'nade', k: 'he', o: carl.eye(), v: [0, 6, 4] });
ok('Carl throws his HE: blown ("nade")', await until(() => got(carl, 'disguiseOff', m => m.why === 'nade').length > 0, 1000));
ok('(Dave is too far away to be told: 16 m+ away? ' + JSON.stringify(got(dave, 'disguiseOff')) + ')', true);
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'all passed');
for (const c of Object.values(all)) c.close();
process.exit();
