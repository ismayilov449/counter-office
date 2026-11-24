// Phone tracker, version 1, the server's part (ROADMAP 14.1-14.4). Fresh test server: GAME_PORT=3995 MAP=cs_mansion
// BOTS=0 START_MONEY=16000 FREEZE_TIME=1 PHONE_TRACKER=1 (no browser).
// Alice and Dave (CT), Bob and Carl (T). One CT gets the tracker. Its first scan only counts the phones (2) and Bob's
// phone tells him which way the scan came from (east). Then: Bob stands still upstairs and his circle shrinks scan after
// scan; Carl walks about in the back garden and his stays big; every phone is inside its circle; the other CT, next to
// Bob, hears the buzz. Carl puts a jammer down: his phone drops out of the scans. Bob kills the holder: the tracker
// lies there and the other CT picks it up, with the scans left.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got, dist3 } from '../explosives/lib.mjs';
import { TRACKER, circleRadius } from '../../../shared/phonetracker.js';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const dave = await player('Dave', 'CT'), bob = await player('Bob', 'T'), carl = await player('Carl', 'T');
const told = [];
bob.on.msg = m => told.push(m.text);
const all = [alice, dave, bob, carl];
await nextLive(all, st);
carl.send({ t: 'buy', item: 'jammer' });
await until(() => alice.snap?.ph === 'live', 8000);
await sleep(400);
const H = [alice, dave].find(c => c.me?.inv?.tracker > 0), O = H === alice ? dave : alice;
ok(`one CT has the tracker (${H === alice ? 'Alice' : 'Dave'})`, !!H && !(O.me?.inv?.tracker > 0));
ok('the Ts are told the CTs have one', told.some(t => /phone tracker/.test(t)));
ok(`Carl bought a jammer (${carl.me?.inv?.jammer})`, carl.me?.inv?.jammer > 0);

const BOB = [-20, 4.27, -2], HPOS = [-1, 0, -6], GARDEN = [[-40, 0, 0], [-40, 0, 5]]; // (the back garden: open lawn)
bob.at(BOB, 0);
carl.at(GARDEN[0], 0);
H.at(HPOS, Math.PI / 2);
O.at([BOB[0] + 1.5, BOB[1], BOB[2]], 0);
H.w = 'tracker';
let walk = 0;
const walker = setInterval(() => { walk += 0.05; carl.at(GARDEN[Math.floor(walk / 1.5) % 2].map((v, i) => i === 2 ? v + Math.sin(walk * 3) : v), 0); }, 50);
await sleep(600);

async function scan() {
  const n = got(H, 'trk').length;
  H.send({ t: 'scan' });
  await until(() => got(H, 'trk').length > n, (TRACKER.scanTime + 2) * 1000);
  return got(H, 'trk').at(-1);
}
const s1 = await scan();
ok(`first scan: counts the phones only (${JSON.stringify(s1 && { count: s1.count, c: s1.c })})`, s1?.count === 2 && !s1.c);
ok(`the other CT got it too`, got(O, 'trk').length === 1);
const hit = got(bob, 'trkHit').at(-1);
ok(`Bob's phone says the scan came from the ${hit?.dir}`, /east/.test(hit?.dir || ''));
ok(`Dave/Alice next to Bob heard the buzz`, got(O, 'sfx', m => m.s === 'buzz').length > 0);

const inside = (c, p) => Math.hypot(c[0] - p[0], c[1] - p[2]) <= c[2] + 0.01;
const bobR = [], carlR = [];
for (let i = 0; i < 3; i++) {
  await sleep(300);
  const s = await scan();
  const cs = s?.c || [];
  const b = cs.find(c => inside(c, BOB)), k = cs.find(c => inside(c, carl.p));
  ok(`scan ${i + 2}: 2 circles, each phone inside one (${JSON.stringify(cs)})`, cs.length === 2 && !!b && !!k);
  bobR.push(b?.[2]); carlR.push(k?.[2]);
}
ok(`Bob stood still: his circle shrinks (${bobR.join(' > ')})`, bobR[0] > bobR[1] && bobR[1] > bobR[2]);
ok(`Carl kept walking: his stays big (${carlR.join(', ')}) — bigger than Bob's last`, carlR.every(r => r > bobR[2]));
const d = dist3(HPOS, BOB);
ok(`walls count: Bob's first circle (${bobR[0]}) is bigger than in the open (${(circleRadius({ d }) * 0.6).toFixed(2)})`, bobR[0] > circleRadius({ d }) * TRACKER.circle.still);
ok(`no floor named from ${d.toFixed(0)} m away`, got(H, 'trk').at(-1).c.every(c => c[3] === 0));
ok(`scans left: ${got(H, 'trk').at(-1).left}`, got(H, 'trk').at(-1).left === TRACKER.scans - 4);

clearInterval(walker);
carl.send({ t: 'jammer', p: carl.p, yaw: 0 });
await sleep(500);
ok('Carl put his jammer down', got(carl, 'jammers').some(m => m.list.length));
const s5 = await scan();
ok(`Carl's jammer hides his phone (${s5?.c?.length} circle)`, s5?.c?.length === 1 && inside(s5.c[0], BOB));

// Bob kills the holder: the tracker lies there; the other CT picks it up
bob.at([HPOS[0] - 2, HPOS[1], HPOS[2]], -Math.PI / 2);
O.at([HPOS[0] + 6, HPOS[1], HPOS[2]], 0);
await sleep(400);
for (let i = 0; i < 12 && H.alive; i++) { bob.shootAt(H, bob.me?.inv?.secondary?.id || 'glock', 'head'); await sleep(250); }
ok('the holder is dead', !H.alive);
await sleep(400);
O.at(HPOS, 0);
ok('the other CT picks it up', await until(() => O.me?.inv?.tracker > 0, 3000));
ok(`and is told the scans left (${got(O, 'msg', m => /picked up the phone tracker/.test(m.text)).at(-1)?.text})`, got(O, 'msg', m => /3 scans left/.test(m.text)).length > 0);
console.log(ok.fails() ? ok.fails() + ' FAILED' : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
