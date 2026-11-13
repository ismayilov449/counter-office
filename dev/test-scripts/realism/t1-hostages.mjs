// Hostages panic and talk (ROADMAP 11.2, 11.3). GAME_PORT=3995 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1.
// a. 11.3: Bob (T) stands in sight of the downstairs hostage, then goes outside; Alice (CT) leads it: it tells the CTs
//    on the radio "One downstairs!".
// b. 11.2: Alice fires into the air by the hostage in the hall: it ducks (the snapshot's 11th value); nobody watching
//    it, within PANIC.after s it runs for the CT base at a run.
import { player, sleep, until, checker, yawTo, spot } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { PANIC } from '../../../shared/hostage-escape.js';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const AID = alice.id();
// (the snapshot leaves hs out while nothing changed: keep the last one seen)
let lastHs = [];
setInterval(() => { if (alice.snap?.hs) lastHs = alice.snap.hs; }, 20);
const hs = id => lastHs.find(h => h[0] === id);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
await nextLive([alice, bob], st);
await sleep(1500); // (freeze time)

// a
const H2 = [-14.122, 0.81, -1.219];
bob.at([H2[0], H2[1], H2[2] + 3], 0, 0); await sleep(1500);
bob.at(spot(5, 0), 0, 0); await sleep(300);
const A = [H2[0], H2[1], H2[2] + 1];
alice.at(A, yawTo(A, H2), 0); await sleep(400);
alice.clear();
alice.use(true); await sleep(200); alice.use(false);
const fol = await until(() => hs(2)?.[5] === 1 && hs(2)?.[6] === AID, 2000);
ok(`a: the hostage follows Alice `, fol);
const said = await until(() => got(alice, 'radio', m => m.name === 'Hostage').length > 0, 2000);
const line = got(alice, 'radio', m => m.name === 'Hostage')[0]?.text;
ok(`a: it tells the CTs on the radio: "${line}"`, said && /One downstairs!/.test(line));
ok('b: Bob (T) is not told', !got(bob, 'radio', m => m.name === 'Hostage').length);

// b
const H3 = [-20.5, 0.81, 8.4], B = [H3[0] + 2, H3[1], H3[2]];
alice.at(B, 0, 0); await sleep(300);
ok('b: before: not ducking', hs(3)?.[10] === 0);
const o = alice.eye();
alice.send({ t: 'shoot', o, d: [0, 1, 0], w: alice.me?.inv?.secondary?.id || 'usp', rt: 0 });
alice.at(spot(5, 0), 0, 0); // (away, so its run isn't blocked)
ok('b: a shot nearby: it ducks', await until(() => hs(3)?.[10] === 1, 1000));
const bolted = await until(() => hs(3)?.[5] === 1 && !hs(3)?.[6], (PANIC.after + 3) * 1000);
ok('b: unwatched, it runs for it', bolted);
const p0 = hs(3).slice(1, 4); await sleep(1000); const p1 = hs(3).slice(1, 4);
ok(`b: at a run (${flat(p0, p1).toFixed(2)} m in 1 s)`, flat(p0, p1) > 2.5);
ok('b: running, it no longer ducks', hs(3)?.[10] === 0);
ok('b: the Terrorists are told it panicked', got(bob, 'msg', m => /panicked/.test(m.text)).length > 0);
console.log(ok.fails() ? ok.fails() + ' FAILED' : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
