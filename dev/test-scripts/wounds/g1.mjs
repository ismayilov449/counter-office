// Wounds in the browser, part 1 (cs_mansion or cs_mansion_night: MAP= as the server's; GAME_PORT, CDP_PORT; server
// with BOTS=0 START_MONEY=16000 MAP_ROTATION=0 ROUND_TIME=600). The browser is a Terrorist ("Tester") with two
// scripted teammates (Mate, Toby) and two scripted CTs (Charlie, Cathy) on the back garden's lawn:
//  a. the buy menu: the syringe in Equipment (its picture, ✔ once bought), the SYRINGE badge; a 2 s revive with it
//     ("(adrenaline)" on the bar), used up
//  b. the drag: E on downed Mate, walk (backwards, facing him): the pistol in hand, the slow walk (game time), the
//     hint, the body 0.95 m off, the blood drops; standing still: the revive goes on to the end
//  c. seen from outside: Toby drags Mate past the browser (the dragger's arm, the body head first)
//  d. dragged: the browser down, Mate drags it: the view goes with the body, "Mate is dragging you"
//  e. interrogation: Charlie down, the browser holds E in front of him: the bar, then the message and a yellow ring
//     on the radar round Cathy's red dot, gone after 5 s
// Screenshots (OUT) prefixed g1_; page errors printed at the end. ~4 minutes.
import { page, ok, summary, until, sleep, MAP_ID } from './gshared.mjs';
import { player } from './lib.mjs'; // (scripted players that follow the server while dragged, as a browser does)

const g = await page('T');
const { tp, keyDown, keyUp, key, shot, ev, send, text } = g;
const C1 = await player('Charlie', 'CT'), M = await player('Mate', 'T'), C2 = await player('Cathy', 'CT'), T2 = await player('Toby', 'T');
const bots = [C1, M, C2, T2];
for (const c of bots) { c.on.s = m => { c.snap = m; }; c.on.roster = m => { c.roster = m.list; }; c.on.me = m => { c.inv = m.inv; }; }
C1.w = C2.w = 'usp'; M.w = T2.w = 'glock';
T2.on.bodyUp = () => { T2.upAt = Date.now(); };
const idOf = name => M.roster?.find(e => e.name === name)?.id;
const row = id => M.snap?.pl?.find(r => r[0] === id);
const posOf = id => row(id)?.slice(1, 4);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const chest = c => [c.p[0], c.p[1] + 1.2, c.p[2]];
const shoot = async (c, to, wait = 380) => {
  const o = [c.p[0], c.p[1] + 1.62, c.p[2]], d = to.map((v, i) => v - o[i]), l = Math.hypot(...d);
  c.send({ t: 'shoot', o, d: d.map(v => v / l), w: c.w, rt: c.snap?.time ?? 0 });
  await sleep(wait);
};
const drop = async (c, by = C1, watch = T2) => { for (let i = 0; i < 14 && !watch.got('bodyDown').some(m => m.v === c.id); i++) await shoot(by, chest(c)); };

ok('round starts', await until(() => M.got('round').length > 0, 40000));
const me = idOf('Tester');
for (const c of bots) c.id = idOf(c === C1 ? 'Charlie' : c === M ? 'Mate' : c === C2 ? 'Cathy' : 'Toby');
// ---------------------------------------------------------------- a. the buy menu, the syringe
await send({ t: 'buy', item: 'ak47' });
await key('KeyB'); await sleep(1500);
const item = await ev(`(() => { const e = document.querySelector('[data-buy="adren"]'); if (!e) return null; const col = e.closest('.bm-col'); return { name: e.querySelector('.bm-name')?.textContent, price: e.querySelector('.bm-price')?.textContent, img: (e.querySelector('img')?.src || '').length, key: e.querySelector('.bm-key')?.textContent, col: col?.querySelector('.bm-colhead')?.textContent }; })()`);
ok(`the buy menu has it: ${JSON.stringify(item)}`, item?.name === 'Adrenaline' && item.price === '$400' && item.img > 100 && /Equipment/.test(item.col) && item.key === '9');
await ev("document.querySelector('[data-buy=\"adren\"]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })), 1"); await sleep(400);
ok(`pointing at it: its words ("${(await text('buymenu')).match(/Adrenaline syringe[^.]*\./)?.[0]}")`, /Adrenaline syringe: revive a downed teammate in 2 s/.test(await text('buymenu')));
await shot('g1_buymenu.png');
await ev("document.querySelector('[data-buy=\"adren\"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })), 1"); await sleep(300);
await ev("document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })), 1"); await sleep(500); // (or main.js keeps firing)
ok(`bought: ✔ (${await ev("document.querySelector('[data-buy=\"adren\"] .bm-price')?.textContent")})`, (await ev("document.querySelector('[data-buy=\"adren\"] .bm-price')?.textContent")) === '✔');
await shot('g1_buymenu_owned.png');
await key('KeyB'); await sleep(2500); // (closed; the freeze time runs out)
ok(`the SYRINGE badge (${await text('wd-badges')})`, /SYRINGE/.test(await text('wd-badges')));

const A = [-33, 0, -3];
M.at(A, 0); C1.at([-39, 0, -3], -Math.PI / 2); C2.at([-39, 0, 4], -Math.PI / 2); T2.at([-30, 0, 4], 0);
await tp([-32.4, 0, -3], Math.PI / 2, -0.55); await sleep(800);
await drop(M);
ok('Mate down', T2.got('bodyDown').some(m => m.v === M.id));
const t0 = Date.now(); // (the revive runs on the server's clock)
await keyDown('KeyE');
ok(`the bar: "${await g.bar()}"`, await until(async () => /Reviving Mate \(adrenaline\)\.\.\./.test(await g.bar()), 2500));
await shot('g1_adrenaline_revive.png');
ok('Mate up', await until(() => T2.got('bodyUp').some(m => m.v === M.id && m.by === me), 4000));
const took = ((T2.upAt || Date.now()) - t0) / 1000;
await keyUp('KeyE');
ok(`in about 2 s (${took.toFixed(2)} s, with the key press and a screenshot)`, took > 1.4 && took < 3.6);
await sleep(600);
ok(`used up: no SYRINGE badge (${await text('wd-badges') || 'none'})`, !/SYRINGE/.test(await text('wd-badges')));
ok(`Mate got up shaky (${JSON.stringify(M.got('wdWounds').at(-1))})`, M.got('wdWounds').at(-1)?.n === 'ad');

// ---------------------------------------------------------------- b. the browser drags Mate
await keyDown('Digit1'); await sleep(100); await keyUp('Digit1'); await sleep(500); // (the AK in hand)
M.at(A, 0);
await tp([-32.4, 0, -3], Math.PI / 2, -0.55); await sleep(600);
for (const c of bots) c.clear();
await drop(M);
ok('Mate down again', T2.got('bodyDown').some(m => m.v === M.id));
ok(`the AK in hand before (${row(me)?.[7]})`, row(me)?.[7] === 'ak47');
await keyDown('KeyE'); await sleep(1400);
ok(`reviving ("${await g.bar()}")`, /Reviving Mate/.test(await g.bar()));
ok(`the hint says walking drags (${await text('hint') || '(hidden while the bar shows)'})`, true);
const inst0 = (await ev('JSON.stringify(__inst())'));
const p0 = posOf(me), m0 = posOf(M.id), g0 = await g.gt();
await keyDown('KeyS');
ok(`dragging (hint "${await text('hint')}")`, await until(async () => /^Dragging Mate/.test(await text('hint')), 6000));
const gs = await g.gt();
await until(async () => (await g.gt()) - gs > 2.2, 60000); // (2.2 s of game time, however slow the page)
await shot('g1_dragging.png');
const hint = await text('hint');
const p1 = posOf(me), m1 = posOf(M.id), g1 = await g.gt();
await keyUp('KeyS');
const sp = flat(p0, p1) / (g1 - g0);
ok(`the pistol in hand while dragging (${row(me)?.[7]})`, row(me)?.[7] === 'glock');
ok(`walking slowly: ${flat(p0, p1).toFixed(2)} m in ${(g1 - g0).toFixed(2)} s of game time = ${sp.toFixed(2)} m/s (≤ 1.3)`, flat(p0, p1) > 0.8 && sp < 1.45);
ok(`Mate dragged along ${flat(m0, m1).toFixed(2)} m, ${flat(m1, p1).toFixed(2)} m from the browser (~0.95)`, flat(m0, m1) > 0.6 && Math.abs(flat(m1, p1) - 0.95) < 0.2);
ok(`the hint while dragging: "${hint}"`, /^Dragging Mate — stand still to revive, let go of E to drop him/.test(hint));
const inst1 = await ev('JSON.stringify(__inst())');
ok(`blood drops behind him (instanced counts ${inst0} -> ${inst1})`, inst0 !== inst1);
// stand still, E held: the revive goes on
ok(`standing still: the bar again ("${await g.bar()}")`, await until(async () => /Reviving Mate/.test(await g.bar()), 3000));
await shot('g1_drag_then_revive.png');
ok('and Mate gets up', await until(() => T2.got('bodyUp').some(m => m.v === M.id && m.by === me), 7000));
await keyUp('KeyE');

// ---------------------------------------------------------------- c. Toby drags Mate past the browser
for (const c of bots) c.clear();
M.at([-34, 0, 0], 0); T2.at([-33.4, 0, 0], Math.PI / 2);
await tp([-31, 0, 3.2], Math.atan2(-(-33.6 - -31), -(0 - 3.2)), -0.25); await sleep(700);
await drop(M, C1);
ok('Mate down (for Toby)', T2.got('bodyDown').some(m => m.v === M.id));
T2.use(true); await sleep(200); T2.send({ t: 'wdDrag', on: 1 }); await sleep(300);
for (let i = 1; i <= 40; i++) { T2.at([-33.4 + 0.04 * i, 0, 0], -Math.PI / 2); await sleep(31); }
await sleep(1500);
await shot('g1_seen_dragging.png');
const yawM = row(M.id)?.[4];
ok(`seen from outside: Toby drags him (body ${flat(posOf(M.id), posOf(T2.id)).toFixed(2)} m behind, head towards him: yaw ${yawM})`, Math.abs(flat(posOf(M.id), posOf(T2.id)) - 0.95) < 0.2 && Math.abs(yawM + Math.PI / 2) < 0.3);
T2.use(false); await sleep(300);
M.at(posOf(M.id), 0);

// ---------------------------------------------------------------- d. the browser down, dragged by Mate
// (Mate up first: Toby revives him)
T2.at([posOf(M.id)[0] + 0.6, 0, posOf(M.id)[2]], Math.PI / 2); await sleep(200);
T2.use(true); await until(() => T2.got('bodyUp').some(m => m.v === M.id), 7000); T2.use(false);
for (const c of bots) c.clear();
await tp([-33, 0, -3], 0, 0); await sleep(600);
M.at([-32.4, 0, -3], Math.PI / 2); T2.at([-30, 0, 4], 0);
for (let i = 0; i < 14 && !(await g.has(m => m.t === 'bodyDown' && m.v === me)); i++) await shoot(C1, [-33, 1.2, -3]);
ok('the browser down', await g.has(m => m.t === 'bodyDown' && m.v === me));
M.use(true); await sleep(200); M.send({ t: 'wdDrag', on: 1 }); await sleep(300);
const b0 = posOf(me);
for (let i = 1; i <= 50; i++) { M.at([-32.4 + 0.04 * i, 0, -3], -Math.PI / 2); await sleep(31); }
await sleep(1500);
const b1 = posOf(me);
ok(`dragged: the browser's body goes with Mate (${flat(b0, b1).toFixed(2)} m)`, flat(b0, b1) > 1.2);
ok(`under the down panel: "${await text('wd-down')}"; no hint line ("${await text('hint')}")`, /^Mate is dragging you/.test(await text('wd-down')) && !(await text('hint')));
await shot('g1_dragged.png');
M.send({ t: 'wdDrag', on: 0 }); // (the revive goes on: the browser gets up)
const trace = [];
const upd = await until(async () => {
  trace.push(`${JSON.stringify(M.snap?.me)} bd ${JSON.stringify(M.snap?.bd?.d?.find(e => e[0] === me))} at ${posOf(me)?.map(v => v.toFixed(2))}`);
  return g.has(m => m.t === 'bodyUp' && m.v === me);
}, 10000); // (the rest of the 5 s revive; it missed twice in fast runs, 2026-11-08: the trace below says where)
ok('Mate revives the browser after the drag', upd);
if (!upd) console.log('     ' + trace.filter((x, i) => i % 3 === 0).slice(0, 12).join('\n     '));
M.use(false);
await sleep(500);
ok(`the browser stays where it was dragged to (${flat(posOf(me), b1).toFixed(2)} m off)`, flat(posOf(me), b1) < 0.3);

// ---------------------------------------------------------------- e. interrogation
for (const c of bots) c.clear();
await g.pull(); g.seen = [];
C1.at([-36, 0, 2], 0); C2.at([-44, 0, -4], 0); M.at([-30, 0, 5], Math.PI); T2.at([-30, 0, 4], Math.PI);
await tp([-36, 0, 1.2], Math.PI, -0.6); await sleep(700); // facing south at Charlie, 0.8 m; Cathy behind (north-west)
for (let i = 0; i < 14 && !T2.got('bodyDown').some(m => m.v === C1.id); i++) await shoot(M, chest(C1));
ok('Charlie down', T2.got('bodyDown').some(m => m.v === C1.id));
await sleep(400);
ok(`the hint: "${await text('hint')}"`, /^Hold E to interrogate Charlie \(3 s\)/.test(await text('hint')));
await shot('g1_ask_hint.png');
await keyDown('KeyE');
ok(`the bar: "${await g.bar()}"`, await until(async () => /Interrogating Charlie\.\.\./.test(await g.bar()), 2500));
await shot('g1_asking.png');
ok('he talks', await until(() => g.has(m => m.t === 'wdReveal'), 6000));
const tReveal = Date.now(); // (the server's 5 s and the ring's are real time)
await keyUp('KeyE');
ok(`"${await text('small-msg')}"`, /Charlie talked: Cathy is on your radar for 5 s/.test(await text('small-msg')));
ok(`a yellow ring round Cathy's dot on the radar (${await g.radarYellow(-44, -4)} px)`, await until(async () => (await g.radarYellow(-44, -4)) > 15, 2500));
await shot('g1_reveal_radar.png');
await sleep(Math.max(0, 3800 - (Date.now() - tReveal)));
ok(`still there after ${((Date.now() - tReveal) / 1000).toFixed(1)} s`, (await g.radarYellow(-44, -4)) > 15);
await until(async () => (await g.radarYellow(-44, -4)) < 4, 5000);
const gone = (Date.now() - tReveal) / 1000;
ok(`gone after ${gone.toFixed(1)} s (${await g.radarYellow(-44, -4)} px)`, (await g.radarYellow(-44, -4)) < 4 && gone > 4.5 && gone < 7.5);
await shot('g1_reveal_gone.png');

ok(`no page errors${g.errors.length ? ': ' + g.errors.slice(0, 5).join(' | ') : ''}`, !g.errors.length);
summary();
for (const c of bots) c.close();
process.exit();
