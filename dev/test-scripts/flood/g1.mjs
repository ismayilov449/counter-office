// Floodgate in the browser (GAME_PORT=4040, CDP_PORT=9440; srv.sh first, with ROUND_TIME=600; ~4 minutes). The
// browser is a Terrorist; a scripted CT joins so a round goes live.
//   a. the T cuts the power first (so nobody is electrocuted yet); b. at the valve: the hint, holding E (the
//   progress bar, the wheel turns), it opens; c. screenshots: the gushing outlet (still gushing at 9.5 s), under the
//   water in the drain (tint, breath bar), drowning once the air is gone, the tunnel and the cellar with water in
//   them; d. the water passed the fuse box with the power cut: nobody shocked; in the full cellar: sinking (head
//   under), swimming up with Space (head out), out up the stairs; e. the scripted CT brings the power back while
//   standing in the water: both electrocuted, the fuse blows; f. that ends the round: the next one is dry at once;
//   g. with the power on, the T opens it again and waits on a stair a little under the fuse box: the lit cellar's water;
//   the water reaches the fuse box: he's shocked, lightly, and lives (what a victim sees), the CT on the street not.
// VIEW=WxH sets the page size (960x540 by default, to keep the software renderer's load down).
// Draw calls are counted by wrapping the page's WebGL calls. Screenshots in OUT, page errors printed.
import { open, sleep, OUT } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';

const KEEP = ['msg', 'floodValve', 'floodZap', 'lights', 'kill', 'round', 'world', 'dmg'];
const g = await open('T', 'Diver', KEEP);
const { tp, keyDown, keyUp, shot, msgs, errors, ev, look } = g;
// a smaller view keeps the software renderer's load down (VIEW=1280x720 for full-size shots)
const [VW, VH] = (process.env.VIEW || '960x540').split('x').map(Number);
await g.cmd('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
await sleep(500);
// (on a cold page the team buttons may not take the first click: click again until the join goes through, before the
// CT joins and the round starts, or the page's T sits the round out dead)
for (let i = 0; i < 8 && !(await ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await ev('document.querySelector(\'#join .team-btn[data-team="T"]\').click(), 1'); await sleep(1500);
}
const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', what); };
const dbg = async () => JSON.parse(await ev("import('/js/flood.js').then(m => JSON.stringify(m.debug()))"));
const hint = () => ev("document.getElementById('hint').textContent");
const prog = () => ev("document.getElementById('progress').classList.contains('hidden') ? '' : document.getElementById('progress-label').textContent");
const waitFor = async (fn, ms, step = 200) => { for (let i = 0; i < ms / step; i++) { if (await fn()) return true; await sleep(step); } return false; };
// draw calls in the next few frames (the page's own WebGL context, wrapped once)
await ev(`(() => { const gl = document.querySelector('#game canvas').getContext('webgl2'); if (gl.__wrapped) return 1; gl.__wrapped = 1; window.__dc = 0;
  for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = gl[f].bind(gl); gl[f] = (...a) => { window.__dc++; return o(...a); }; }
  const frames = window.__frames = []; let last = 0; const tick = () => { frames.push(window.__dc - last); last = window.__dc; if (frames.length > 20) frames.shift(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 1; })()`);
const drawCalls = async () => { await sleep(1500); return JSON.parse(await ev('JSON.stringify(window.__frames.slice(-6))')); };

const ct = await player('Sparky', 'CT');
let ph = null;
ct.on.s = m => { ph = m.ph; };
{ const push = ct.log.push.bind(ct.log); ct.log.push = m => (m.t === 's' ? 0 : push(m)); }
await waitFor(() => ph === 'live', 30000);
await sleep(500);
ct.at([27.5, 0, 1]);
console.log('live');

// ---- a. cut the power first
await tp([-18.3, -2.2, -4.4], 0); await sleep(500);
console.log('   fuse box hint:', await hint());
await keyDown('KeyE'); await sleep(3400); await keyUp('KeyE'); await sleep(400);
check((await msgs(false)).some(m => m.t === 'lights' && m.power === 'off'), 'the T cut the power');

// ---- b. the valve
const VALVE = [23.8, -5.0, -1.75]; // (clear of the drain's south wall at z -1.4: closer, the player is inside it)
await tp(VALVE, 0); await sleep(300); await look(0, -0.25); await sleep(600);
const h = await hint();
check(/Hold E to open the valve/.test(h), `the hint at the valve: "${h}"`);
const dcDry = await drawCalls();
await shot('fl1-valve.png');
await keyDown('KeyE'); await sleep(1600);
const p1 = await prog(), w1 = (await dbg()).wheel;
await shot('fl2-turning.png');
await sleep(1900); await keyUp('KeyE'); await sleep(500);
const d1 = await dbg();
check(p1 === 'Opening the valve...' && d1.wheel !== w1, `holding E: "${p1}", the wheel turns (${w1?.toFixed(2)} -> ${d1.wheel?.toFixed(2)})`);
const m1 = await msgs(false);
check(m1.some(m => m.t === 'floodValve' && m.open) && d1.open, 'the valve opened');
const opened = Date.now(), since = () => (Date.now() - opened) / 1000;

// ---- c. screenshots as it rises
await tp([20.6, -5.0, -1.75], -Math.PI / 2); await sleep(300); await look(0, -0.2);
await waitFor(async () => since() > 5, 10000);
const d2 = await dbg();
const dcWet = await drawCalls();
await shot('fl3-gush.png');
check(d2.gush && d2.surf && d2.level > -4.6, `the outlet gushes and the drain's water rises (level ${d2.level.toFixed(2)}, areas ${d2.areas})`);
console.log(`   draw calls at the valve, dry ${JSON.stringify(dcDry)} / flooding ${JSON.stringify(dcWet)}`);
// the gush keeps going until its mouth (under the drain's ceiling) is under the water, ~11 s after opening
await waitFor(async () => since() > 9.5, 10000);
const d2b = await dbg();
await shot('fl3b-gush9.png');
check(d2b.gush && d2b.level < -3.36, `the gush still shows ${since().toFixed(1)} s after opening (level ${d2b.level.toFixed(2)}, the mouth at -3.36)`);
await waitFor(async () => (await dbg()).level > -3.15, 20000);
await tp([12, -5.0, -2.0], -Math.PI / 2); await sleep(1200);
const d3 = await dbg();
await shot('fl4-under.png');
check(d3.under && d3.breath && d3.air < 10, `in the flooded drain: under the water (tint ${d3.under}), the breath bar (air ${d3.air.toFixed(1)} s)`);
// staying under: the air runs out, then 10 damage a second
await msgs(true);
await waitFor(async () => (await dbg()).air <= 0, 12000);
await sleep(2600);
const hurt = (await msgs(false)).filter(m => m.t === 'dmg'), hp1 = +(await ev("document.getElementById('hp').textContent"));
await shot('fl4b-drowning.png');
check(hurt.length >= 1 && hurt.every(m => Math.round(m.d) === 10) && hp1 < 100 && hp1 > 0, `out of air under the water: drowning (${hurt.map(m => m.d).join(', ')} damage, hp ${hp1})`);
await tp([27.5, 0, 0], 0); // (out, to breathe)
await waitFor(async () => (await dbg()).level > -1.75, 20000);
await tp([2, -2.2, 5.65], -Math.PI / 2); await sleep(300); await look(0, -0.3); await sleep(900);
const d4 = await dbg();
await shot('fl5-tunnel.png');
check(d4.surf && !d4.under, `the tunnel with water in it (level ${d4.level.toFixed(2)}, areas ${d4.areas})`);
await tp([-14.4, 0.011, -8.3], Math.PI); // (on the stairwell's top step: lower, the player is inside it) await sleep(300); await look(0, -0.45); await g.key('KeyF'); await sleep(900);
await shot('fl6-cellar.png'); // (with the flashlight: the power is off)
await g.key('KeyF');

// ---- d. swimming in the full cellar
await waitFor(async () => (await dbg()).level > -0.5, 20000);
check(!(await msgs(false)).some(m => m.t === 'floodZap'), 'the water passed the fuse box with the power cut: nobody was shocked');
await tp([-15.5, -2.2, 1.5], Math.PI); await sleep(1500);
const d5 = await dbg();
await shot('fl7-sunk.png');
check(d5.under && d5.p[1] < -2.0, `standing on the cellar floor in the full cellar: head under (feet ${d5.p[1].toFixed(2)})`);
await keyDown('Space'); await sleep(2000);
const d6 = await dbg();
await shot('fl8-swim.png');
check(!d6.under && d6.p[1] > -1.6, `holding Space: swims up, head out (feet ${d6.p[1].toFixed(2)}, level ${d6.level.toFixed(2)})`);
// to the stairs (north-east, under the closet) and up them
const yawStairs = Math.atan2(-(-14.4 + 15.5), -(-6.5 - 1.5));
await tp(d6.p, yawStairs); await sleep(100);
await keyDown('KeyW'); await sleep(4500); await keyUp('Space'); await sleep(3000); await keyUp('KeyW'); await sleep(500);
const d7 = await dbg();
check(d7.p[1] > -0.4 && d7.p[2] < -5.6, `swam to the stairs and walked out of the water (at ${d7.p.map(v => v.toFixed(2)).join(', ')})`);

// ---- e. electrocution: the CT brings the power back standing in the water; the browser's T floats in the cellar,
// looking at the fuse box (in the water too: he gets it as well)
await tp([-17.0, -1.25, -3.4], 0.6); await keyDown('Space'); await sleep(300); await look(0, -0.45); await sleep(300);
await msgs(true);
ct.at([-18.3, -2.2, -4.4]); await sleep(300);
ct.use(true);
await waitFor(async () => (await msgs(false)).some(m => m.t === 'floodZap'), 8000, 100);
await sleep(150);
await shot('fl9-zap.png');
ct.use(false);
await keyUp('Space');
await sleep(1200);
await shot('fl10-dark.png');
const m2 = await msgs(false);
const zapped = m2.filter(m => m.t === 'kill' && m.w === 'electrocuted').length;
check(m2.some(m => m.t === 'floodZap' && m.v.length === 2) && zapped === 2, `the CT at the fuse box and the T in the water are electrocuted (${zapped} killed)`);
check(m2.some(m => m.t === 'lights' && m.power === 'off') && m2.filter(m => m.t === 'lights').at(-1)?.power === 'off', 'the fuse blew: power off');

// ---- f. the next round is dry
await waitFor(async () => ph === 'freeze', 12000, 100);
await sleep(150); // (one snapshot)
const d8a = await dbg();
await sleep(1200);
const d8 = await dbg();
check(d8a.level === -4.88 && d8.level === -4.88 && !d8.surf && !d8.open && !d8.under, `the next round: dry at once (level ${d8a.level} at the round start, ${d8.level} 1.2 s later, surface ${d8.surf})`);
await tp(VALVE, 0); await sleep(1500);
await shot('fl11-reset.png');
console.log('   messages:', (await msgs(false)).filter(m => m.t === 'msg').map(m => m.text).join(' | '));

// ---- g. this round the power is on: the T opens the valve and waits on a stairwell step a little under the fuse
// box's level (-1.60), looking into the cellar; when the water reaches the fuse box he is shocked, lightly (25 cm
// deep: ~78 damage), and lives to see it; the CT on the street is dry
ct.clear();
ct.at([27.5, 0, 1]);
await tp(VALVE, 0); await sleep(400);
await msgs(true);
await keyDown('KeyE'); await sleep(3500); await keyUp('KeyE'); await sleep(400);
check((await msgs(false)).some(m => m.t === 'floodValve' && m.open), 'a new round: the valve opens again (the power is on)');
const STEP = [-14.4, -1.597, -5.65]; // (25 cm under the fuse box's level: the server counts you in the water from 5 cm)
await tp(STEP, Math.atan2(-(-17.0 - STEP[0]), -(-3.4 - STEP[2]))); await sleep(300); await look(0, -0.25);
await waitFor(async () => (await dbg()).level > -1.6, 40000);
await sleep(300);
const d9 = await dbg();
await shot('fl12-cellar-lit.png');
check(d9.surf && !d9.under, `the cellar's water with the power on (level ${d9.level.toFixed(2)})`);
await waitFor(async () => (await msgs(false)).some(m => m.t === 'floodZap'), 20000, 100);
await shot('fl13-zap-seen.png');
await sleep(500);
await shot('fl14-zap-after.png');
await sleep(500);
const m3 = await msgs(false), zap3 = m3.find(m => m.t === 'floodZap'), hit3 = m3.filter(m => m.t === 'dmg'), hp3 = +(await ev("document.getElementById('hp').textContent"));
console.log('   zap:', JSON.stringify(zap3));
check(zap3 && zap3.v.length === 1 && hit3.length === 1 && hp3 > 0 && !ct.got('dmg').length, `the water reaches the fuse box with the power on: the T in it is shocked (${hit3.map(m => m.d).join(', ')} damage, hp ${hp3}) and lives; the CT on the street isn't hit`);
check(m3.some(m => m.t === 'lights' && m.power === 'off'), 'the fuse blew: power off');
check(!errors.length, `page errors: ${errors.length ? errors.slice(0, 5).join('\n') : 'none'}`);
console.log(`\n${checks.filter(Boolean).length}/${checks.length} passed; screenshots in ${OUT}`);
ct.close();
process.exit(0);
