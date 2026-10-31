// "Downed, not dead" + "Play dead" in the browser (cs_mansion or cs_mansion_night: MAP= as the server's, default
// cs_mansion; GAME_PORT/CDP_PORT, BOTS=0 START_MONEY=16000 MAP_ROTATION=0).
// Part 1, the browser is a Terrorist with a scripted teammate (Mate) and two scripted CTs, on the back garden's lawn
// (the same layout as t1.mjs: de_dust2's CT spawn positions moved there by P()):
//   Mate goes down (crawl pose, name tag, radar cross); the browser revives him (hint, hold E, progress);
//   the browser goes down (red overlay, bleed bar, low camera, pistol only, 1 m/s crawl), Mate revives him;
//   the browser plays dead (K: eyes half closed, view from the floor) and gets up by moving (W);
//   Mate plays dead (seen by his teammate: a corpse with his name).
// Part 2, the browser is a CT: a Terrorist plays dead in front of him (a kill in the feed, a corpse, dead on the
//   scoreboard), then gets up ("... was playing dead!").
// Screenshots in OUT, page errors printed. It takes ~5 minutes (run it with a long timeout).
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
// the back garden's flat lawn (y 0): P() moves a de_dust2 CT-spawn position there, as in t1.mjs
const OFF = { cs_mansion: [-53, 27], cs_mansion_night: [-53, 27] }[process.env.MAP || 'cs_mansion'] || [0, 0];
const P = (x, y, z) => [x + OFF[0], y, z + OFF[1]];
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { if (await cond()) return true; await sleep(50); } return !!(await cond()); };
const KEEP = ['msg', 'round', 'bodyDown', 'bodyUp', 'bodyKill', 'bodyPlayDead', 'kill', 'spawn'];
let g = await open('T', 'Tester', KEEP);
let { tp, key, keyDown, keyUp, shot, msgs, errors, ev, send, look } = g;
const C1 = await player('Charlie', 'CT'), M = await player('Mate', 'T'), C2 = await player('Cathy', 'CT');
for (const c of [C1, M, C2]) { c.on.s = m => { c.snap = m; }; c.on.roster = m => { c.roster = m.list; }; }
C1.w = 'usp'; C2.w = 'usp'; M.w = 'glock';
const idOf = name => M.roster?.find(e => e.name === name)?.id;
const row = (c, id) => c.snap?.pl?.find(r => r[0] === id);
const EYE = 1.62;
const shoot = async (c, to, w = 'usp', wait = 380) => {
  const o = [c.p[0], c.p[1] + EYE, c.p[2]], d = to.map((v, i) => v - o[i]), l = Math.hypot(...d);
  c.send({ t: 'shoot', o, d: d.map(v => v / l), w, rt: 0 });
  await sleep(wait);
};
const text = id => ev(`document.getElementById('${id}')?.textContent || ''`);
let seen = [];
const pull = async () => { seen = seen.concat(await msgs()); return seen; };
const has = async pred => (await pull()).some(pred);

// ---- part 1
ok('round starts', await until(() => M.got('round').length > 0, 40000));
await send({ t: 'buy', item: 'ak47' }); await sleep(3500);
const me = idOf('Tester'), mate = idOf('Mate');
M.at(P(20, 0, -30), 0); C1.at(P(20, 0, -24), Math.PI); C2.at(P(8, 0, -22), 0);
await tp(P(16, 0, -30), -Math.PI / 2, -0.12); await sleep(800);
for (let i = 0; i < 12 && !M.got('bodyDown').length; i++) await shoot(C1, P(20, 1.2, -30));
ok('Mate is down', M.got('bodyDown').some(m => m.v === mate));
for (let i = 1; i <= 8; i++) { M.at(P(20 + i * 0.08, 0, -30), -Math.PI / 2); await sleep(100); } // crawling towards us
await sleep(600);
await shot('g1_mate_down.png');
await tp(P(21.3, 0, -30), Math.PI / 2, -0.6); await sleep(700);
ok(`the revive hint (${await text('hint')})`, /Hold E to revive Mate/.test(await text('hint')));
await shot('g1_revive_hint.png');
await keyDown('KeyE'); await sleep(1800);
ok(`reviving: progress "${await text('progress-label')}"`, /Reviving Mate/.test(await text('progress-label')));
await shot('g1_reviving.png');
await sleep(4200); await keyUp('KeyE');
ok('Mate revived by the browser', M.got('bodyUp').some(m => m.v === mate && m.by === me));

// the browser goes down
M.at(P(10, 0, -24), 0);
await tp(P(20, 0, -30), 0, 0); await sleep(700);
for (let i = 0; i < 12 && !(await has(m => m.t === 'bodyDown' && m.v === me)); i++) await shoot(C1, P(20, 1.2, -30));
ok('the browser is down', await has(m => m.t === 'bodyDown' && m.v === me));
await sleep(900);
ok(`down overlay shown: "${await text('bd-panel')}"`, /YOU'RE DOWN/.test(await text('bd-panel')) && (await ev("getComputedStyle(document.getElementById('bd-down')).display")) === 'block');
await shot('g1_down.png');
ok(`only the pistol (${row(M, me)?.[7]})`, row(M, me)?.[7] === 'glock');
await key('Digit1'); await sleep(600);
ok(`1 doesn't take out the AK (${row(M, me)?.[7]})`, row(M, me)?.[7] === 'glock');
const p0 = row(M, me).slice(1, 4);
await keyDown('KeyW'); await sleep(2000); await keyUp('KeyW'); await sleep(400);
const p1 = row(M, me).slice(1, 4), moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
ok(`crawling: ${moved.toFixed(2)} m in 2 s, crouched (${row(M, me)?.[6]})`, moved > 1.1 && moved < 2.6 && row(M, me)?.[6] === 1);
await shot('g1_crawled.png');
M.at([p1[0] + 0.6, 0, p1[2]], Math.PI / 2); await sleep(500);
M.use(true);
await sleep(2000);
await shot('g1_being_revived.png');
ok(`being revived: "${await text('bd-panel')}"`, /Mate is reviving you/.test(await text('bd-panel')));
ok('revived by Mate', await until(() => has(m => m.t === 'bodyUp' && m.v === me && m.by === mate), 4500));
M.use(false);
await sleep(600);
ok('down overlay gone', (await ev("getComputedStyle(document.getElementById('bd-down')).display")) === 'none');
await shot('g1_revived.png');

// the browser plays dead
M.at(P(10, 0, -24), 0);
await tp(P(20, 0, -30), -Math.PI / 2, 0); await sleep(600);
C2.clear();
await key('KeyK'); await sleep(900);
ok('playing dead (bodyPlayDead)', await has(m => m.t === 'bodyPlayDead' && m.v === me));
ok('the CTs got a kill message', C2.got('kill').some(m => m.v === me));
ok(`eyes half closed (opacity ${await ev("document.getElementById('bd-eyes').style.opacity")})`, +(await ev("document.getElementById('bd-eyes').style.opacity")) > 0.9);
await shot('g1_playdead.png');
await keyDown('KeyW'); await sleep(300); await keyUp('KeyW'); await sleep(250);
ok('moving gets you up', await has(m => m.t === 'bodyUp' && m.v === me && m.pd === 1));
await shot('g1_rising.png');
await sleep(1200);
await shot('g1_up.png');

// Mate plays dead in front of his teammate
M.at(P(20, 0, -26), 0); await sleep(300);
await tp(P(15, 0, -26), -Math.PI / 2, -0.2); await sleep(500);
M.send({ t: 'bodyPlayDead' }); await sleep(1200);
ok('Mate playing dead', await has(m => m.t === 'bodyPlayDead' && m.v === mate));
await shot('g1_mate_playdead.png');
M.send({ t: 'bodyPlayDead' }); await sleep(1500);
console.log('errors (part 1):', errors.length ? errors.slice(0, 5).join('\n') : 'none');

// ---- part 2: the browser is a CT
C2.close(); await sleep(300);
g = await open('CT', 'Watcher', KEEP);
({ tp, key, keyDown, keyUp, shot, msgs, errors, ev, send, look } = g);
seen = [];
const Tom = await player('Tom', 'T');
Tom.w = 'glock';
await sleep(500);
for (const c of [C1, M, Tom]) c.clear();
await shoot(C1, [M.p[0], M.p[1] + 1.62, M.p[2]], 'usp', 500); // end the round
ok('next round', await until(() => M.got('round').length > 0, 15000));
await sleep(3500);
const mate2 = idOf('Mate');
M.at(P(20, 0, -26), 0); Tom.at(P(20, 0, -33), 0); C1.at(P(10, 0, -25), 0);
await tp(P(14, 0, -26), -Math.PI / 2, -0.12); await sleep(800);
await shot('g1_ct_before.png');
M.send({ t: 'bodyPlayDead' }); await sleep(1200);
ok('the CT browser got the kill message', await has(m => m.t === 'kill' && m.v === mate2));
ok(`kill feed: "${await text('killfeed')}"`, /Mate/.test(await text('killfeed')));
await shot('g1_ct_fake_corpse.png');
await keyDown('Tab'); await sleep(400);
ok('scoreboard: Mate dead', await ev("[...document.querySelectorAll('#scoreboard tr.dead')].some(r => r.textContent.includes('Mate'))"));
await shot('g1_ct_scoreboard.png');
await keyUp('Tab');
M.send({ t: 'bodyPlayDead' }); await sleep(450);
await shot('g1_ct_rising.png');
await sleep(1000);
ok('"Mate was playing dead!"', /Mate was playing dead/.test(await ev("document.body.innerText")));
await shot('g1_ct_up.png');
console.log('errors (part 2):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
for (const c of [C1, M, Tom]) c.close();
process.exit();
