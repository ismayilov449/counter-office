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
// the page size (VIEW=WxH, default 960x540: lighter on the PC than game.mjs's 1280x720)
const [VW, VH] = (process.env.VIEW || '960x540').split('x').map(Number);
// (and on a cold page the team buttons are still disabled when game.mjs clicks one: click again until we're in)
const view = async (g, team) => {
  for (let i = 0; i < 60 && !(await g.ev("document.getElementById('join').classList.contains('hidden')")); i++) {
    await g.ev(`(b => { if (b && !b.disabled) b.click(); })(document.querySelector('#join .team-btn[data-team="${team}"]')), 1`);
    await sleep(500);
  }
  await sleep(1000);
  await g.ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
  await g.cmd('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
};
let g = await open('T', 'Tester', KEEP);
await view(g, 'T');
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
for (let i = 1; i <= 8; i++) { M.at(P(20 + i * 0.08, 0, -30), -Math.PI / 2); await sleep(100); } // crawling (away from us, head first)
await sleep(600);
await shot('g1_mate_down.png');
ok(`aiming over him (where he would stand) shows no name ("${await text('target-name')}")`, (await text('target-name')) === '');
await tp(P(20.64, 0, -27), 0, Math.atan2(0.2 - EYE, 3)); await sleep(700); // from his side, aiming at his belly
ok(`3 m away, aiming at him: his name tag over him, no second name under the crosshair ("${await text('target-name')}")`, (await text('target-name')) === '');
await shot('g1_mate_down_side.png');
await tp(P(20.64, 0, -28.2), 0, Math.atan2(0.2 - EYE, 1.8)); await sleep(700); // closer: the tag has faded
ok(`1.8 m away, aiming at him where he lies shows his name ("${await text('target-name')}")`, /Mate/.test(await text('target-name')));
await shot('g1_mate_down_near.png');
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
// (headless, the page draws a few frames a second and main.js caps a frame's step at 0.05 s, so the game runs slower
// than the clock: the crawl is measured against the game's own time, summed here the same way)
await ev("window.__gt = 0; window.__gtN = 0; window.__gtOn = true; (function f(t0) { requestAnimationFrame(t => { if (!window.__gtOn) return; window.__gt += Math.min(0.05, (t - t0) / 1000); window.__gtN++; f(t); }); })(performance.now()), 1");
await keyDown('KeyW'); await sleep(3000); await keyUp('KeyW');
const gt = await ev('window.__gtOn = false, window.__gt'), fps = (await ev('window.__gtN')) / 3;
await sleep(500);
const p1 = row(M, me).slice(1, 4), moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
ok(`crawling: ${moved.toFixed(2)} m in ${gt.toFixed(2)} s of game time (${fps.toFixed(1)} fps) = ${(moved / gt).toFixed(2)} m/s, crouched (${row(M, me)?.[6]})`, moved / gt > 0.7 && moved / gt < 1.15 && row(M, me)?.[6] === 1);
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
await keyDown('KeyW'); await sleep(200); await keyUp('KeyW');
// getting up takes 1 s: the eyes overlay fades over it (read straight away: a headless screenshot can take that long)
const fade = [];
for (let i = 0; i < 6; i++) { fade.push(+(await ev("document.getElementById('bd-eyes').style.opacity"))); await sleep(150); }
ok(`getting up over a second (eyes overlay ${fade.join(' ')})`, fade.some(v => v > 0.1 && v < 0.95) && fade[fade.length - 1] < fade[0]);
await shot('g1_rising.png');
ok('moving gets you up', await has(m => m.t === 'bodyUp' && m.v === me && m.pd === 1));
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
// (close the page's connection first: the browser may keep the old page, socket open, in its back/forward cache, and
// the server would keep "Tester" in the game)
await ev('window.__ws?.close(), 1'); await sleep(800);
g = await open('CT', 'Watcher', KEEP);
await view(g, 'CT');
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
M.send({ t: 'bodyPlayDead' });
// (shown for 3 s; headless screenshots are slow, so it's read before them)
const told = await until(async () => /Mate was playing dead/.test(await text('small-msg')), 2500);
ok(`"Mate was playing dead!" ("${await text('small-msg')}")`, told);
await shot('g1_ct_rising.png');
await sleep(1500);
await shot('g1_ct_up.png');
console.log('errors (part 2):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
for (const c of [C1, M, Tom]) c.close();
process.exit();
