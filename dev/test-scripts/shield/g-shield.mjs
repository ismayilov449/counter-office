// Human shield in the browser (GAME_PORT test server with BOTS=0, CDP_PORT headless Edge; cs_mansion, hostage 3 on
// the ground floor). 1: the browser is a CT; a scripted Terrorist grabs the hostage: the CT's message, screenshots of
// the pose from the front, the side and at an angle, the hint and E refused next to it, a shot at the T's chest from the
// front hits the hostage (the server says so), the T lets go. 2: the browser is the Terrorist: the hint, E grabs (the
// pistol comes out), the view, no switching to the AK, no ducking or jumping, walking pace; E lets go, then the AK and
// full speed again. Screenshots in OUT (sh_*.png); page errors printed.
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';

const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const MAPID = process.env.MAP || 'cs_mansion';
// T position, its yaw, and viewer spots (front, side, angle) per map (the hostage room's free spots, see t-shield.mjs)
const SETUP = {
  cs_mansion: { T: [-20.5, 0.81, 9.4], yaw: 0, front: [-20.5, 0.81, 5.9], side: [-25.0, 0.81, 9.4], angle: [-18.6, 0.81, 6.3], hint: [-20.5, 0.81, 7.4], walkT: [-21.5, 0.81, 8.4], walkYaw: -Math.PI / 2 },
  cs_assault: { T: [-6.909, 8.23, -38.83], yaw: Math.PI, front: [-6.909, 8.23, -35.33], side: [-10.909, 8.23, -38.83], angle: [-5.5, 8.23, -35.6], hint: [-6.909, 8.23, -37.0], walkT: [-6.909, 8.23, -38.83], walkYaw: Math.PI },
  get cs_mansion_night() { return this.cs_mansion; }, // (the same house: t-shield.mjs picks the same spots there)
}[MAPID];
const look = (from, at) => { const d = [at[0] - from[0], at[1] - from[1] - 1.62, at[2] - from[2]]; return [Math.atan2(-d[0], -d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))]; };
const chest = [SETUP.T[0], SETUP.T[1] + 1.2, SETUP.T[2]];
const roundStart = async (c, browserMsgs) => {
  for (let i = 0; i < 200; i++) {
    if (c && c.got('msg').some(m => /Guard the hostages|Rescue the hostages/.test(m.text))) break;
    if (browserMsgs && (await browserMsgs(false)).some(m => m.t === 'msg' && /Guard the hostages|Rescue the hostages/.test(m.text))) break;
    await sleep(100);
  }
  await sleep(3400);
};

// ---- 1: the browser is a CT watching
let g = await open('CT', 'Viewer', ['msg', 'shieldGrab', 'shieldDrop']);
let { tp, key, click, shot, msgs, errors, ev } = g;
const t = await player('Taker', 'T');
await roundStart(t);
await msgs();
t.w = 'glock';
t.at(SETUP.T, SETUP.yaw); await sleep(300);
t.use(); await sleep(100); t.use(false); await sleep(400);
let got = await msgs();
ok('the CT\'s browser got shieldGrab', got.some(m => m.t === 'shieldGrab'));
ok('the CT sees "' + (await ev("document.getElementById('small-msg').textContent")) + '"', /hostage is being used as a shield/.test(await ev("document.getElementById('small-msg').textContent")));
for (const [name, at] of [['front', SETUP.front], ['side', SETUP.side], ['angle', SETUP.angle]]) {
  const [yaw, pitch] = look(at, chest);
  await tp(at, yaw, pitch); await sleep(900);
  console.log('  ' + await shot(`sh_${MAPID}_${name}.png`));
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
  ok('E is refused: ' + (got.filter(m => m.t === 'msg').map(m => m.text).join(' | ') || '-'), got.some(m => m.t === 'msg' && /can't lead it/.test(m.text)));
}
// a shot at his chest from the front hits the hostage
{
  const [yaw, pitch] = look(SETUP.front, chest);
  await tp(SETUP.front, yaw, pitch); await sleep(1500); // (the pistol is drawn)
  await msgs();
  await click(0, 400); await sleep(500); // (held over a frame or two: headless draws a few frames a second)
  got = await msgs();
  console.log('  ' + await shot(`sh_${MAPID}_hit.png`));
  ok('the browser CT\'s shot at his chest hits the hostage: ' + (got.filter(m => m.t === 'msg').map(m => m.text).join(' | ') || '-'), got.some(m => m.t === 'msg' && /You hit the hostage/.test(m.text)));
}
t.use(); await sleep(100); t.use(false); await sleep(600);
got = await msgs();
ok('the T lets go: the CT\'s browser got shieldDrop', got.some(m => m.t === 'shieldDrop'));
{
  const [yaw, pitch] = look(SETUP.angle, chest);
  await tp(SETUP.angle, yaw, pitch); await sleep(900);
  console.log('  ' + await shot(`sh_${MAPID}_released.png`));
}
console.log('errors (CT):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
const errors1 = errors.length;

// ---- 2: the browser is the Terrorist
// (the page joins first: a CT joining while the browser is still a CT would be balanced over to the Terrorists)
t.close();
g = await open('T', 'Holder', ['msg', 'shieldGrab', 'shieldDrop']);
({ tp, key, shot, msgs, errors, ev } = g);
const { keyDown, keyUp } = g;
const far = await player('Far', 'CT');
await roundStart(null, msgs);
far.at(far.p, 0);
// what the page sends: its position, crouch and weapon
await ev(`(() => { const ws = __ws, s0 = ws.send.bind(ws); window.__st = []; ws.send = d => { try { const m = JSON.parse(d); if (m.t === 'state') { __st.push([performance.now(), m.p, m.c, m.w]); if (__st.length > 600) __st.shift(); } } catch {} return s0(d); }; return 1; })()`);
const states = async () => JSON.parse(await ev('JSON.stringify(__st)'));
const lastState = async () => (await states()).slice(-1)[0];
await tp(SETUP.walkT, SETUP.walkYaw); await sleep(400);
await ev(`__ws.send(JSON.stringify({ t: 'buy', item: 'ak47' })), 1`); await sleep(1200);
await key('Digit1'); await sleep(900);
ok('the T holds the AK before: ' + (await lastState())?.[3], (await lastState())?.[3] === 'ak47');
const hint = await ev("document.getElementById('hint').textContent");
ok('the T\'s hint: ' + hint, /grab the hostage/.test(hint));
await msgs();
await key('KeyE', 150); await sleep(900);
got = await msgs();
ok('E grabs it (shieldGrab)', got.some(m => m.t === 'shieldGrab'));
ok('the pistol comes out: ' + (await lastState())?.[3], (await lastState())?.[3] === 'glock');
ok('the hint: ' + (await ev("document.getElementById('hint').textContent")), /let the hostage go/.test(await ev("document.getElementById('hint').textContent")));
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
const speed = async ms => {
  await keyDown('KeyW'); await sleep(ms); const s = await states(); await keyUp('KeyW'); await sleep(300);
  const a = s.filter(x => x[0] > s[s.length - 1][0] - 500), d = Math.hypot(a[a.length - 1][1][0] - a[0][1][0], a[a.length - 1][1][2] - a[0][1][2]);
  return d / ((a[a.length - 1][0] - a[0][0]) / 1000 || 1);
};
const v1 = await speed(1300);
console.log('  ' + await shot(`sh_${MAPID}_holder_walked.png`));
ok(`walking pace with the hostage: ${v1.toFixed(2)} m/s`, v1 > 2.5 && v1 < 3.5);
await msgs();
await key('KeyE', 150); await sleep(700);
got = await msgs();
ok('E again lets it go (shieldDrop)', got.some(m => m.t === 'shieldDrop' && m.why === 'let go'));
await key('Digit1'); await sleep(900);
ok('then the AK comes out: ' + (await lastState())?.[3], (await lastState())?.[3] === 'ak47');
await tp([SETUP.walkT[0] - 2 * Math.sin(SETUP.walkYaw) * 0, SETUP.walkT[1], SETUP.walkT[2]], SETUP.walkYaw + Math.PI); await sleep(400);
const v2 = await speed(900);
ok(`and full speed again: ${v2.toFixed(2)} m/s`, v2 > 4.5);
console.log('errors (T):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
ok('no page errors', errors1 === 0 && errors.length === 0);
far.close();
process.exit();
