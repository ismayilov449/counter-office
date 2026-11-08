// Wounds in the browser, part 2 (MAP= as the server's; GAME_PORT, CDP_PORT; server with BOTS=0 START_MONEY=16000
// MAP_ROTATION=0 ROUND_TIME=600). The browser is a CT ("Tester") in kevlar and a helmet, with two scripted CTs
// (Cathy, Chris) and two scripted Terrorists (Tango shoots from 17 m with a Glock, Toby) on the back garden's lawn:
//  a. the CSS blur's cost: frame times with the canvas blurred (3 px) and not, at the same view
//  b. walking speed before; then a leg, an arm and a head hit: the LEG / ARM / HEAD badges; the limp (speed in game
//     time, about 0.7 of before); the aim drifting by itself (the server's yaw for the browser, no mouse); the blur
//     waves (the canvas's filter over 8 s); P: the badges halved
//  c. down: the line under the "YOU'RE DOWN" panel; hold K: the bar, the dark edges, the head tilting; the shot; the
//     kill feed's "(shot himself)"
//  d. (a new round) Cathy down 2 m in front of the browser holds K: the pistol at her temple, as others see it; the shot
//  e. the browser down, Chris revives him with the syringe (2 s): the ADRENALINE badge, the drift and the blur waves
// Screenshots (OUT) prefixed g2_; page errors printed at the end. ~5 minutes.
import { page, ok, summary, until, sleep } from './gshared.mjs';
import { player, admin } from './lib.mjs';

const g = await page('CT');
const { tp, keyDown, keyUp, key, shot, ev, send, text } = g;
const T1 = await player('Tango', 'T'), C2 = await player('Cathy', 'CT'), T2 = await player('Toby', 'T'), C3 = await player('Chris', 'CT');
const bots = [T1, C2, T2, C3];
for (const c of bots) { c.on.roster = m => { c.roster = m.list; }; }
T1.w = T2.w = 'glock'; C2.w = C3.w = 'usp';
const idOf = name => T2.roster?.find(e => e.name === name)?.id;
const row = id => T2.snap?.pl?.find(r => r[0] === id);
const posOf = id => row(id)?.slice(1, 4);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const fire = (c, to) => { const o = [c.p[0], c.p[1] + 1.62, c.p[2]], d = to.map((v, i) => v - o[i]), l = Math.hypot(...d); c.send({ t: 'shoot', o, d: d.map(v => v / l), w: c.w, rt: c.snap?.time ?? 0 }); };
const badges = () => text('wd-badges');
// the browser's walking speed over `secs` of game time, holding a key
const walk = async (from, yaw, secs, keyCode = 'KeyW') => {
  await tp(from, yaw, 0); await sleep(1500);
  const p0 = posOf(me), g0 = await g.gt();
  await keyDown(keyCode);
  await until(async () => (await g.gt()) - g0 >= secs, 60000);
  const g1 = await g.gt();
  await keyUp(keyCode);
  await sleep(1500);
  const p1 = posOf(me);
  return flat(p0, p1) / (g1 - g0);
};
// frame times (ms) over `ms` of real time
const frameMs = async ms => { await ev('__frames.length = 0, 1'); await sleep(ms); return +(await ev('__frames.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, __frames.length - 1)')).toFixed(1); };

ok('round starts', await until(() => T2.got('round').length > 0, 40000));
const me = idOf('Tester');
await send({ t: 'buy', item: 'vesthelm' });
await sleep(4000);
const V = [-31, 0, -3];
T1.at([-48, 0, -3], -Math.PI / 2); T2.at([-48, 0, 5], -Math.PI / 2); C2.at([-30, 0, 5.5], 0); C3.at([-29.5, 0, 4], 0);

// ---------------------------------------------------------------- a. the blur's cost
await tp([-36, 0, 0], Math.PI / 2, 0); await sleep(2500);
const cost = [];
for (let i = 0; i < 3; i++) {
  await ev("document.getElementById('game').style.filter = '', 1");
  const plain = await frameMs(4000);
  await ev("document.getElementById('game').style.filter = 'blur(3px)', 1");
  const blurred = await frameMs(4000);
  cost.push([plain, blurred]);
}
await ev("document.getElementById('game').style.filter = '', 1");
console.log(`     frame times (ms, plain / blurred 3 px): ${cost.map(c => c.join(' / ')).join(', ')}`);
const avg = k => cost.reduce((a, c) => a + c[k], 0) / cost.length;
ok(`the blur's cost: ${avg(0).toFixed(1)} ms -> ${avg(1).toFixed(1)} ms a frame (headless SwiftShader; ${(avg(1) - avg(0)).toFixed(1)} ms)`, true);

// ---------------------------------------------------------------- b. wounds
const v0 = await walk([-31, 0, -5.5], Math.PI, 1.0);
ok(`walking speed before: ${v0.toFixed(2)} m/s (game time)`, v0 > 3);
let yaws = [];
for (let i = 0; i < 12; i++) { yaws.push(row(me)?.[4]); await sleep(300); }
const still0 = Math.max(...yaws) - Math.min(...yaws);
await tp(V, Math.PI / 2, 0); await sleep(800);
for (const c of bots) c.clear();
await g.pull(); g.seen = [];
fire(T1, [V[0], 0.45, V[2]]); await sleep(500);
fire(T1, [V[0], 1.3, V[2] + 0.26]); await sleep(500);
fire(T1, [V[0], 1.62, V[2]]); await sleep(800);
const w = (await g.pull()).filter(m => m.t === 'wdWounds').at(-1);
ok(`leg, arm, head: wounded (${JSON.stringify(w)})`, w?.l === 1 && w.a === 1 && w.h === 1);
ok(`the badges: "${await badges()}"`, /LEG/.test(await badges()) && /ARM/.test(await badges()) && /HEAD/.test(await badges()));
await shot('g2_badges.png');
const v1 = await walk([-31, 0, -5.5], Math.PI, 1.0);
ok(`limping: ${v1.toFixed(2)} m/s, ${(v1 / v0).toFixed(2)} of before (0.7)`, v1 / v0 > 0.58 && v1 / v0 < 0.82);
await tp([-36, 0, 0], Math.PI / 2, 0); await sleep(800);
yaws = [];
for (let i = 0; i < 12; i++) { yaws.push(row(me)?.[4]); await sleep(300); }
const drift = Math.max(...yaws) - Math.min(...yaws);
ok(`the aim drifts by itself: ${drift.toFixed(4)} rad in 3.6 s with no mouse (before: ${still0.toFixed(4)})`, drift > 0.003 && drift < 0.06 && still0 < 0.001);
const filters = [];
let blurShot = false;
for (let i = 0; i < 40; i++) {
  const f = await g.filter();
  filters.push(f);
  if (!blurShot && /blur\(([\d.]+)px\)/.exec(f)?.[1] >= 2) { blurShot = true; await shot('g2_blur.png'); }
  await sleep(200);
}
const pxs = filters.map(f => +(/blur\(([\d.]+)px\)/.exec(f)?.[1] || 0));
ok(`the sight blurs in waves: max ${Math.max(...pxs)} px, blurred ${pxs.filter(v => v > 0).length} of ${pxs.length} samples`, Math.max(...pxs) >= 2 && pxs.some(v => v === 0) && pxs.some(v => v > 0));
await send({ t: 'bloodBandage' });
ok(`P: halved ("${await badges()}")`, await until(async () => ((await badges()).match(/½/g) || []).length === 3, 5000));
await shot('g2_bandaged.png');

// ---------------------------------------------------------------- c. the browser down, ending it
for (const c of bots) c.clear();
await tp(V, Math.PI / 2, 0); await sleep(800);
for (let i = 0; i < 14 && !(await g.has(m => m.t === 'bodyDown' && m.v === me)); i++) { fire(T1, [V[0], 1.3, V[2]]); await sleep(400); }
ok('the browser down', await g.has(m => m.t === 'bodyDown' && m.v === me));
await sleep(800);
ok(`under the panel: "${await text('wd-down')}"`, /^Hold K to end it yourself \(5 s\)/.test(await text('wd-down')));
await shot('g2_down.png');
await keyDown('KeyK');
await sleep(2600);
const line = await ev("document.querySelector('#wd-down .t')?.textContent || ''"), fill = await ev("document.querySelector('#wd-down .bar i')?.style.width || ''");
const edges = +(await ev("document.getElementById('wd-end').style.opacity || 0")), hudBar = await g.bar();
ok(`holding K: "${line}" under the panel, its bar at ${fill}, the edges darkening (${edges}); the hud's bar not used ("${hudBar}")`, /^Ending it — let go of K to stop/.test(line) && parseInt(fill) > 20 && edges > 0.2 && !hudBar);
await shot('g2_ending.png');
ok('the shot', await until(() => g.has(m => m.t === 'wdShot' && m.v === me), 5000));
await keyUp('KeyK');
await sleep(800);
const feed = await text('killfeed');
ok(`the kill feed: "${feed}"`, /Tester \(shot himself\)/.test(feed) && /Tango/.test(feed));
await shot('g2_shot.png');

// ---------------------------------------------------------------- d. Cathy ends it, as others see it
for (const c of bots) c.clear();
await admin({ action: 'restart' });
ok('a fresh round', await until(() => T2.got('round').length > 0, 15000));
await sleep(600); await key('Space'); // (the kill cam of our death runs on the game's clock: headless, it outlasts the restart)
C3.send({ t: 'buy', item: 'adren' });
await sleep(4500);
const B = [-34, 0, 0];
C2.at(B, 0); C3.at([-29.5, 0, 4], 0); T1.at([-40, 0, 0], -Math.PI / 2); T2.at([-48, 0, 5], 0);
await tp([-34.15, 0, -1.9], Math.PI - 0.08, -0.5); await sleep(800); // (in front of her face, looking down at her: she faces north)
for (let i = 0; i < 14 && !T2.got('bodyDown').some(m => m.v === C2.id); i++) { fire(T1, [B[0], 1.2, B[2]]); await sleep(400); }
ok('Cathy down', T2.got('bodyDown').some(m => m.v === C2.id));
await sleep(500);
await g.pull(); g.seen = [];
await key('Digit3'); await sleep(400); // (the knife: the pistol in our own hand would cover her)
C2.send({ t: 'wdEnd', on: 1 });
await sleep(2200);
await shot('g2_remote_ending.png');
ok('her shot, heard', await until(() => g.has(m => m.t === 'wdShot' && m.v === C2.id), 5000));
await sleep(600);
ok(`the kill feed: "${await text('killfeed')}"`, /Cathy \(shot himself\)/.test(await text('killfeed')));

// ---------------------------------------------------------------- e. revived with the syringe: the after-effects
for (const c of bots) c.clear();
await tp([-33, 0, -3], 0, 0); await sleep(600);
C3.at([-32.4, 0, -3], Math.PI / 2);
for (let i = 0; i < 14 && !(await g.has(m => m.t === 'bodyDown' && m.v === me)); i++) { fire(T1, [-33, 1.2, -3]); await sleep(400); }
ok('the browser down', await g.has(m => m.t === 'bodyDown' && m.v === me));
const t0 = Date.now();
C3.use(true);
ok('up', await until(() => g.has(m => m.t === 'bodyUp' && m.v === me), 4000));
const took = (Date.now() - t0) / 1000;
C3.use(false);
ok(`Chris's syringe: up in ${took.toFixed(2)} s`, took < 3);
ok(`the ADRENALINE badge ("${await badges()}")`, await until(async () => /ADRENALINE/.test(await badges()), 2000));
await shot('g2_adrenaline.png');
yaws = [];
const ads = [];
for (let i = 0; i < 20; i++) { yaws.push(row(me)?.[4]); ads.push(+(/blur\(([\d.]+)px\)/.exec(await g.filter())?.[1] || 0)); await sleep(250); }
ok(`shaking: ${(Math.max(...yaws) - Math.min(...yaws)).toFixed(4)} rad of drift; blurred: max ${Math.max(...ads)} px`, Math.max(...yaws) - Math.min(...yaws) > 0.003 && Math.max(...ads) >= 1);
if (Math.max(...ads) >= 1) await shot('g2_adrenaline_blur.png');

ok(`no page errors${g.errors.length ? ': ' + g.errors.slice(0, 5).join(' | ') : ''}`, !g.errors.length);
summary();
for (const c of bots) c.close();
process.exit();
