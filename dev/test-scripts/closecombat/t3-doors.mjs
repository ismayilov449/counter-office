// 8.3 Door fights (GAME_PORT=3993 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1), on Mansion's door 1 (its
// leaf along x at z = 11.379, from x = -15.545; from the north side, z < 11.379, it swings south).
// a. Alice (CT) walks up and presses E: it just opens (nobody hurt); E again closes it.
// b. Alice runs at it and presses E: kicked open; Bob (T) just behind it takes 15, is knocked south and told;
//    Dan (T) standing where the leaf swings to is moved out of its way (ccShove).
// c. Bob crouches and holds E on the closed door (south side); Alice presses E (north): she pushes, it stays shut
//    (1 vs 1: the holder wins), both see the count.
// d. Carol (CT) pushes too: 2 vs 1, it bursts open south in about a second; Bob is shoved and told.
// e. Bob crouched taps E (under 0.3 s) on the closed door: it just opens.
import { player, sleep, until, checker, nextLive, got } from '../explosives/lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const carol = await player('Carol', 'CT');
const dan = await player('Dan', 'T');
const all = [alice, bob, carol, dan];
let doorState = 0, bobHp = 100;
alice.on.doors = m => { if (Array.isArray(m.doors)) doorState = m.doors[1]; };
alice.on.world = m => { if (Array.isArray(m.doors)) doorState = m.doors[1]; };
bob.on.dmg = m => { bobHp = m.hp; };
await nextLive(all, st);
await until(() => alice.snap?.ph === 'live', 5000);

const Y = 0.813, X = -14.63, Z = 11.379, N = 0, S = Math.PI; // yaw 0 looks north (-z), pi south
const away = (c, x = -20) => c.at([x, Y, 8.2], N);
for (const c of all) c.clear();
away(carol, -14); away(dan, -13.5);
bob.at([X, Y, Z + 0.6], N);
alice.at([X, Y, Z - 2.5], S);
await sleep(400);
const press = async (c, ms = 250) => { c.use(true); await sleep(ms); c.use(false); };

// a
alice.at([X, Y, Z - 1.0], S);
await sleep(600);
await press(alice);
ok('a: walking up, E opens it', await until(() => doorState !== 0, 1000));
ok('a: nobody knocked', !got(bob, 'knock').length && bobHp === 100);
await sleep(300);
await press(alice);
ok('a: E closes it again', await until(() => doorState === 0, 1000));

// b
dan.at([-15.4, Y, Z + 0.5], N);
alice.at([X, Y, Z - 3.4], S);
await sleep(400);
for (const c of all) c.clear();
for (let i = 0; i < 8; i++) { alice.at([X, Y, Z - 3.4 + i * 0.3], S); await sleep(50); }
await press(alice);
ok('b: running E kicks it open (south)', await until(() => doorState === 1, 1000));
ok('b: the crash', got(alice, 'sfx', m => m.s === 'crash').length > 0);
ok(`b: Bob took 15 (hp ${bobHp})`, await until(() => bobHp === 85, 1000));
ok('b: Bob knocked south', got(bob, 'knock', m => m.v[2] > 3).length > 0);
ok('b: Bob told', got(bob, 'msg', m => /kicked the door into you/.test(m.text)).length > 0);
const sh = got(dan, 'ccShove')[0];
ok(`b: Dan moved out of the leaf's way (${JSON.stringify(sh?.p)})`, !!sh && Math.abs(sh.p[0] - (-15.545 + 0.43)) < 0.02);
dan.at([-15.115, Y, Z + 0.5], N);
away(dan, -13.5);

// close it (from the north, walking)
alice.at([X, Y, Z - 1.0], S);
await sleep(600);
await press(alice);
await until(() => doorState === 0, 1000);
ok('closed again', doorState === 0);

// c
bob.at([X, Y, Z + 0.7], N, 1);
await sleep(400);
for (const c of all) c.clear();
bob.use(true); // (held)
await sleep(500);
ok('c: Bob is holding it (ccHold)', bob.snap?.me?.a === 'ccHold');
await press(alice, 1800);
ok('c: Alice pushes (told)', got(alice, 'msg', m => /holding the door shut/.test(m.text)).length > 0);
ok('c: 1 vs 1: still shut', doorState === 0);
ok('c: both see the count', got(alice, 'ccDoor', m => m.h === 1 && m.p === 1).length > 0 && got(bob, 'ccDoor', m => m.h === 1 && m.p === 1).length > 0);

// d
carol.at([X + 0.5, Y, Z - 1.0], S);
alice.at([X - 0.4, Y, Z - 1.0], S);
await sleep(400);
for (const c of all) c.clear();
alice.use(true); carol.use(true);
const t0 = Date.now();
ok('d: 2 vs 1: it bursts open south', await until(() => doorState === 1, 3000));
const dt = Date.now() - t0;
ok(`d: after about a second (${dt} ms)`, dt > 700 && dt < 2200);
ok('d: Bob shoved and told', got(bob, 'knock').length > 0 && got(bob, 'msg', m => /forced the door/.test(m.text)).length > 0);
ok('d: no damage from a push', bobHp === 85);
alice.use(false); carol.use(false); bob.use(false);
away(carol, -14);

// e
alice.at([X, Y, Z - 1.0], S);
await sleep(500);
await press(alice);
await until(() => doorState === 0, 1000);
bob.at([X, Y, Z + 0.7], N, 1);
await sleep(400);
await press(bob, 120);
ok('e: a crouched tap just opens it (north)', await until(() => doorState === -1, 1000));

for (const c of all) c.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
