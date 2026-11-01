// Human shield in the browser (GAME_PORT test server, fresh, with BOTS=0 START_MONEY=16000 ROUND_TIME=600; CDP_PORT
// headless Edge; MAP= cs_mansion or cs_mansion_night as the server's; hostage 3 in the living room, floor 0.813).
//  1 the browser is a CT; a scripted Terrorist (Taker) grabs the hostage: the CT's message and the scream's sound
//    nodes, screenshots of the pose from the front, the left side and at an angle, the hint and E refused next to it,
//    a shot at the T's chest from the front hits the hostage (the server says so), the T lets go; he grabs it again and
//    a head shot at the side of his head that shows kills him: the hostage is let go and the CT leads it away; in a
//    fresh round the CT shoots the held hostage dead: shieldDrop 'dead' and the $1500 penalty.
//  2 the browser is the Terrorist: the hint, E grabs (the pistol comes out), the view, no switching to the AK, no
//    ducking or jumping, walking pace; E lets go, then the AK and full speed again.
//  3 still the Terrorist, the Mansion's gadgets: holding the hostage by the zip line's terrace stand and at the CCTV
//    desk, the hint is "let the hostage go" and E lets go (no hooking on, no sitting down); sitting at the desk with a
//    free hostage 1.5 m away, no grab hint.
// Screenshots in OUT (sh_<map>_*.png; VIEW=WxH page size, default 960x540); page errors printed.
import { open, sleep } from '../mansion/game.mjs';
import { player, admin } from '../mansion/client.mjs';

const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await cond()) return true; await sleep(50); } return !!(await cond()); };
const MAPID = process.env.MAP || 'cs_mansion';
const F = 0.82; // (the living room's floor is at 0.813)
// T position, its yaw, and viewer spots (front, left side, angle) per map (the hostage room's free spots, see t-shield.mjs)
const SETUP = {
  cs_mansion: { T: [-20.5, F, 9.4], yaw: 0, front: [-20.5, F, 5.9], side: [-22.9, F, 9.2], angle: [-18.6, F, 6.3], hint: [-20.5, F, 7.4], walkT: [-21.5, F, 8.4], walkYaw: -Math.PI / 2 },
  get cs_mansion_night() { return this.cs_mansion; }, // (the same house: t-shield.mjs picks the same spots there)
}[MAPID];
// the Mansion's gadgets: the zip line's terrace stand, the CCTV desk (floor 4.267) and its seat
const UP = 4.27, TERRACE = [-4.5, UP, -8], DESK = [-10, UP, -12];
const look = (from, at) => { const d = [at[0] - from[0], at[1] - from[1] - 1.62, at[2] - from[2]]; return [Math.atan2(-d[0], -d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))]; };
const chest = [SETUP.T[0], SETUP.T[1] + 1.2, SETUP.T[2]];
const KEEP = ['msg', 'shieldGrab', 'shieldDrop', 'zip', 'cctv', 'kill'];
// the page size; on a cold page the team buttons are still disabled when game.mjs clicks one: click until we're in
const [VW, VH] = (process.env.VIEW || '960x540').split('x').map(Number);
const view = async (g, team) => {
  for (let i = 0; i < 60 && !(await g.ev("document.getElementById('join').classList.contains('hidden')")); i++) {
    await g.ev(`(b => { if (b && !b.disabled) b.click(); })(document.querySelector('#join .team-btn[data-team="${team}"]')), 1`);
    await sleep(500);
  }
  await sleep(1000);
  await g.ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
  await g.cmd('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
};
const live = async c => {
  await until(() => c.snap?.ph === 'freeze', 8000);
  return until(() => c.snap?.ph === 'live', 15000);
};
const texts = got => got.filter(m => m.t === 'msg').map(m => m.text).join(' | ') || '-';

// ---- 1: the browser is a CT watching
let g = await open('CT', 'Viewer', KEEP);
await view(g, 'CT');
let { tp, key, click, shot, msgs, errors, ev } = g;
const t = await player('Taker', 'T'), park = await player('Parker', 'T'); // (Parker: the round goes on when Taker dies)
for (const c of [t, park]) c.on.s = m => { c.snap = { ...m, hs: 'hs' in m ? m.hs : c.snap?.hs }; };
const hostage = id => t.snap?.hs?.find(h => h[0] === id);
await admin({ action: 'restart' });
ok('a live round', await live(t));
await sleep(300);
park.at([-14, F, 4], 0);
await msgs();
// the scream: count the sound nodes made at the grab (heard by ear only; here: it plays without errors)
await ev("window.__osc = 0; (P => { if (!P.__w) { const o = P.createOscillator; P.createOscillator = function () { __osc++; return o.call(this); }; P.__w = 1; } })(AudioContext.prototype), 1");
t.w = 'glock';
t.at(SETUP.T, SETUP.yaw); await sleep(300);
t.use(); await sleep(100); t.use(false); await sleep(400);
let got = await msgs();
const grab1 = got.find(m => m.t === 'shieldGrab');
ok('the CT\'s browser got shieldGrab', !!grab1);
ok('the CT sees "' + (await ev("document.getElementById('small-msg').textContent")) + '"', /hostage is being used as a shield/.test(await ev("document.getElementById('small-msg').textContent")));
const audioState = await ev("(() => { try { return new AudioContext().state; } catch (e) { return 'none'; } })()");
// (headless Edge needs --autoplay-policy=no-user-gesture-required for the page's sound to run at all)
ok(`the scream: ${await ev('window.__osc')} oscillators made at the grab (page audio: ${audioState})`, audioState === 'running' ? (await ev('window.__osc')) >= 2 : true);
const hid = grab1?.h;
for (const [name, at] of [['front', SETUP.front], ['side', SETUP.side], ['angle', SETUP.angle]]) {
  const [yaw, pitch] = look(at, chest);
  await tp(at, yaw, pitch); await sleep(900);
  console.log('  ' + await shot(`sh_${MAPID}_${name}.png`));
}
// close up from the front, at the hostage's throat: the T's forearm under its hand
{
  const near = [SETUP.T[0], F, SETUP.T[2] - 1.9], throat = [SETUP.T[0], SETUP.T[1] + 1.45, SETUP.T[2] - 0.42];
  const [yaw, pitch] = look(near, throat);
  await tp(near, yaw, pitch); await sleep(900);
  console.log('  ' + await shot(`sh_${MAPID}_throat.png`));
}
// the hint next to it, and E refused
{
  const [yaw, pitch] = look(SETUP.hint, chest);
  await tp(SETUP.hint, yaw, pitch); await sleep(500);
  const hint = await ev("document.getElementById('hint').textContent");
  ok('the CT\'s hint next to the held hostage: ' + hint, /holds this hostage as a shield/.test(hint));
  await msgs();
  await key('KeyE', 150); await sleep(400);
  got = await msgs();
  ok('E is refused: ' + texts(got), got.some(m => m.t === 'msg' && /can't lead it/.test(m.text)));
}
// a shot at his chest from the front hits the hostage
{
  const [yaw, pitch] = look(SETUP.front, chest);
  await tp(SETUP.front, yaw, pitch); await sleep(1500); // (the pistol is drawn)
  await msgs();
  await click(0, 400); await sleep(500); // (held over a frame or two: headless draws a few frames a second)
  got = await msgs();
  console.log('  ' + await shot(`sh_${MAPID}_hit.png`));
  ok('the browser CT\'s shot at his chest hits the hostage: ' + texts(got), got.some(m => m.t === 'msg' && /You hit the hostage/.test(m.text)));
}
t.use(); await sleep(100); t.use(false); await sleep(600);
got = await msgs();
ok('the T lets go: the CT\'s browser got shieldDrop', got.some(m => m.t === 'shieldDrop'));
{
  const [yaw, pitch] = look(SETUP.angle, chest);
  await tp(SETUP.angle, yaw, pitch); await sleep(900);
  console.log('  ' + await shot(`sh_${MAPID}_released.png`));
}
// he grabs it again; a head shot at the side of his head that shows (his right, past the hostage's leaning head)
// kills him: the hostage is let go, and the CT leads it away
t.at(SETUP.T, SETUP.yaw); await sleep(300);
t.use(); await sleep(100); t.use(false); await sleep(500);
ok('grabbed again', (await msgs()).some(m => m.t === 'shieldGrab'));
{
  const head = [SETUP.T[0] + 0.1, SETUP.T[1] + 1.62, SETUP.T[2]];
  const [yaw, pitch] = look(SETUP.hint, head);
  await tp(SETUP.hint, yaw, pitch); await sleep(1500);
  await click(0, 400); await sleep(600);
  got = await msgs();
  console.log('  ' + await shot(`sh_${MAPID}_headshot.png`));
  const drop = got.find(m => m.t === 'shieldDrop');
  ok(`a head shot from the front kills the T (${got.some(m => m.t === 'kill') ? 'kill' : 'no kill'}; ${texts(got)}) and the hostage is let go (${drop?.why})`, drop?.why === 'died');
  const hs = hostage(hid);
  ok(`the hostage is unhurt and waiting (state ${hs?.[5]})`, hs && hs[5] === 0 && !got.some(m => m.t === 'msg' && /hit the hostage/.test(m.text)));
  const at = hs ? [hs[1], F, hs[3] - 1.0] : SETUP.hint;
  await tp(at, Math.PI, -0.4); await sleep(500);
  await key('KeyE', 150); await sleep(500);
  got = await msgs();
  ok('the CT leads it away: ' + texts(got), got.some(m => m.t === 'msg' && /following you/.test(m.text)));
}
// a fresh round: the CT shoots the held hostage dead (aiming at its belly, under the T's head): the $1500 penalty
await admin({ action: 'restart' });
ok('a live round', await live(t));
await sleep(300);
park.at([-14, F, 4], 0);
t.at(SETUP.T, SETUP.yaw); await sleep(300);
await msgs();
t.use(); await sleep(100); t.use(false); await sleep(500);
ok('grabbed in the new round', (await msgs()).some(m => m.t === 'shieldGrab'));
{
  const belly = [SETUP.T[0], SETUP.T[1] + 1.0, SETUP.T[2] - 0.42];
  const [yaw, pitch] = look(SETUP.hint, belly);
  await tp(SETUP.hint, yaw, pitch); await sleep(1500);
  const money0 = await ev("document.getElementById('money').textContent");
  let all = [];
  for (let i = 0; i < 10 && !all.some(m => m.t === 'shieldDrop'); i++) { await click(0, 300); await sleep(700); all = all.concat(await msgs()); }
  await sleep(500);
  all = all.concat(await msgs());
  const money1 = await ev("document.getElementById('money').textContent");
  const drop = all.find(m => m.t === 'shieldDrop');
  ok(`shooting the held hostage: ${all.filter(m => m.t === 'msg' && /hit the hostage/.test(m.text)).length} "You hit the hostage" messages, then it dies (shieldDrop ${drop?.why})`, drop?.why === 'dead');
  ok(`the penalty: ${texts(all.filter(m => /killed a hostage/.test(m.text || '')))}; money ${money0} -> ${money1}`, all.some(m => m.t === 'msg' && /killed a hostage! \(-\$1500\)/.test(m.text)) && +money0.slice(1) - +money1.slice(1) >= 1500);
  console.log('  ' + await shot(`sh_${MAPID}_hostage_dead.png`));
}
console.log('errors (CT):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
const errors1 = errors.length;

// ---- 2: the browser is the Terrorist
// (the page's connection closed first, so "Viewer" leaves; the page joins before the scripted CT, or it would be
// balanced over)
t.close(); park.close();
await ev('window.__ws?.close(), 1'); await sleep(800);
g = await open('T', 'Holder', KEEP);
await view(g, 'T');
({ tp, key, shot, msgs, errors, ev } = g);
const { keyDown, keyUp } = g;
const far = await player('Far', 'CT');
far.on.s = m => { far.snap = { ...m, hs: 'hs' in m ? m.hs : far.snap?.hs }; };
await admin({ action: 'restart' });
ok('a live round', await live(far));
await sleep(300);
far.at([-14, F, 4], 0);
// what the page sends: its position, crouch and weapon, with the game's own clock (headless draws few frames a second
// and main.js caps a frame's step at 0.05 s: the game runs slower than the wall clock)
await ev(`(() => { window.__gt = 0; (function f(t0) { requestAnimationFrame(t => { __gt += Math.min(0.05, (t - t0) / 1000); f(t); }); })(performance.now());
  const ws = __ws, s0 = ws.send.bind(ws); window.__st = []; ws.send = d => { try { const m = JSON.parse(d); if (m.t === 'state') { __st.push([__gt, m.p, m.c, m.w]); if (__st.length > 600) __st.shift(); } } catch {} return s0(d); }; return 1; })()`);
const states = async () => JSON.parse(await ev('JSON.stringify(__st)'));
const lastState = async () => (await states()).slice(-1)[0];
const hint = () => ev("document.getElementById('hint').textContent");
await tp(SETUP.walkT, SETUP.walkYaw); await sleep(400);
await ev(`__ws.send(JSON.stringify({ t: 'buy', item: 'ak47' })), 1`); await sleep(1200);
await key('Digit1'); await sleep(900);
ok('the T holds the AK before: ' + (await lastState())?.[3], (await lastState())?.[3] === 'ak47');
ok('the T\'s hint: ' + (await hint()), /grab the hostage/.test(await hint()));
await msgs();
await key('KeyE', 150); await sleep(900);
got = await msgs();
ok('E grabs it (shieldGrab)', got.some(m => m.t === 'shieldGrab'));
ok('the pistol comes out: ' + (await lastState())?.[3], (await lastState())?.[3] === 'glock');
ok('the hint: ' + (await hint()), /let the hostage go/.test(await hint()));
console.log('  ' + await shot(`sh_${MAPID}_holder.png`));
await key('Digit1'); await sleep(700);
ok('1 does not take the AK out: ' + (await lastState())?.[3], (await lastState())?.[3] === 'glock');
await keyDown('ControlLeft'); await sleep(700);
const duck = (await states()).slice(-8);
await keyUp('ControlLeft');
ok('Ctrl does not duck: c = ' + duck.map(s => s[2]).join(''), duck.every(s => !s[2]));
const y0 = (await lastState())[1][1];
await key('Space', 100); await sleep(700);
const ys = (await states()).slice(-14).map(s => s[1][1]);
ok(`Space does not jump (highest ${Math.max(...ys).toFixed(2)}, standing at ${y0.toFixed(2)})`, Math.max(...ys) - y0 < 0.05);
// metres per second of game time over the last half second of game time of holding W
const speed = async ms => {
  await keyDown('KeyW'); await sleep(ms); const s = await states(); await keyUp('KeyW'); await sleep(300);
  const a = s.filter(x => x[0] > s[s.length - 1][0] - 0.5), d = Math.hypot(a[a.length - 1][1][0] - a[0][1][0], a[a.length - 1][1][2] - a[0][1][2]);
  return d / ((a[a.length - 1][0] - a[0][0]) || 1);
};
const v1 = await speed(1600);
console.log('  ' + await shot(`sh_${MAPID}_holder_walked.png`));
ok(`walking pace with the hostage: ${v1.toFixed(2)} m/s`, v1 > 2.5 && v1 < 3.5);
await msgs();
await key('KeyE', 150); await sleep(700);
got = await msgs();
ok('E again lets it go (shieldDrop)', got.some(m => m.t === 'shieldDrop' && m.why === 'let go'));
await key('Digit1'); await sleep(900);
ok('then the AK comes out: ' + (await lastState())?.[3], (await lastState())?.[3] === 'ak47');
await tp([-22.5, F, 6.5], SETUP.walkYaw); await sleep(400); // (5 m of free floor ahead, east along the room)
const v2 = await speed(1500); // (1.5 s: at 1-2 frames a second headless, 1 s of keys was still mostly the speed-up; 5 m of floor)
ok(`and full speed again: ${v2.toFixed(2)} m/s`, v2 > 4.5);

// ---- 3: the gadgets (a fresh round; the hostage back in the living room)
await admin({ action: 'restart' });
ok('a live round', await live(far));
await sleep(300);
far.at([-14, F, 4], 0);
await tp(SETUP.T, SETUP.yaw); await sleep(600);
await msgs();
await key('KeyE', 150); await sleep(700);
const grab3 = (await msgs()).find(m => m.t === 'shieldGrab');
ok('grabbed', !!grab3);
// at the zip line's terrace stand, facing the house (the hostage on the terrace in front of him)
await tp(TERRACE, Math.PI / 2, -0.15); await sleep(900);
ok('by the zip line\'s stand, holding the hostage: ' + (await hint()), /let the hostage go/.test(await hint()));
console.log('  ' + await shot(`sh_${MAPID}_terrace.png`));
await key('KeyE', 150); await sleep(700);
got = await msgs();
ok(`E there lets it go (${got.find(m => m.t === 'shieldDrop')?.why}), no hooking on (${got.some(m => m.t === 'zip') ? 'zip!' : 'no zip'})`, got.some(m => m.t === 'shieldDrop' && m.why === 'let go') && !got.some(m => m.t === 'zip'));
console.log('  hint after letting it go there: ' + (await hint()));
await key('KeyE', 150); await sleep(700);
ok('grabbed again', (await msgs()).some(m => m.t === 'shieldGrab'));
// at the CCTV desk, back to the monitors
await tp(DESK, Math.PI, -0.15); await sleep(900);
ok('at the CCTV desk, holding the hostage: ' + (await hint()), /let the hostage go/.test(await hint()));
console.log('  ' + await shot(`sh_${MAPID}_desk.png`));
await key('KeyE', 150); await sleep(700);
got = await msgs();
ok(`E there lets it go (${got.find(m => m.t === 'shieldDrop')?.why}), no sitting down (${got.some(m => m.t === 'cctv') ? 'cctv!' : 'no cctv'})`, got.some(m => m.t === 'shieldDrop' && m.why === 'let go') && !got.some(m => m.t === 'cctv'));
// put the hostage down 1.4 m to the seat's right (out of reach of the spot the browser sits down from, 1.2 m to its
// left), then sit down: no grab hint while watching the cameras
await key('KeyE', 150); await sleep(700);
ok('grabbed again', (await msgs()).some(m => m.t === 'shieldGrab'));
await tp([-9.32, UP, -12.4], -Math.PI / 2); await sleep(700);
await key('KeyE', 150); await sleep(700);
ok('let go to the right of the seat', (await msgs()).some(m => m.t === 'shieldDrop'));
await sleep(300);
const h3 = far.snap?.hs?.find(h => h[0] === grab3?.h);
await tp([-11.45, UP, -12.5], -0.2, -0.2); await sleep(700);
ok(`the hostage (${h3?.slice(1, 4).join(', ')}) out of reach: the desk's hint: ` + (await hint()), /sit down/.test(await hint()));
await key('KeyE', 150); await sleep(1200);
got = await msgs();
const seat = got.find(m => m.t === 'cctv' && m.on);
const dist = seat && h3 ? Math.hypot(h3[1] - seat.p[0], h3[2] - seat.p[1], h3[3] - seat.p[2]) : -1;
ok(`sitting at the desk (cctv on) with the free hostage ${dist.toFixed(2)} m away: no grab hint (${await hint()})`, !!seat && dist < 1.6 && !/grab/.test(await hint()));
console.log('  ' + await shot(`sh_${MAPID}_desk_seated.png`));
await key('KeyE', 150); await sleep(700);
got = await msgs();
ok(`E gets him up from the desk (cctv off ${got.find(m => m.t === 'cctv' && !m.on)?.why}), not a grab`, got.some(m => m.t === 'cctv' && !m.on) && !got.some(m => m.t === 'shieldGrab'));
console.log('errors (T):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
ok('no page errors', errors1 === 0 && errors.length === 0);
far.close();
process.exit();
