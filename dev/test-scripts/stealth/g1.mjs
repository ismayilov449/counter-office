// Stealth & hiding in the browser (Mansion maps). Start the server and the headless Edge first:
//   bash dev/test-scripts/stealth/srv.sh ROUND_TIME=600 FREEZE_TIME=1 AUTO_BALANCE=0 [MAP=cs_mansion_night]
//   powershell -File dev/test-scripts/stealth/edge.ps1        (CDP 9640, 960x540)
//   GAME_PORT=4240 CDP_PORT=9640 OUT=<dir> node dev/test-scripts/stealth/g1.mjs      (PARTS=a,b,... to run some)
// The page is a CT ("Sooty"); scripted players: a T ("Tee") and a second CT ("Cee2").
//   a. views: the fireplace from the living room, the breast in the Ts' room, the bedroom side, the stack on the roof,
//      the flue from inside;
//   b. climbing: up the flue on the rungs (W, looking up), over the rim onto the roof; sooty; footprints on the roof's
//      slope; E on the roof by the stack: on the rungs; down to the hearth; crawl out; footprints in the living room;
//   c. the fire: the page climbs into the flue, the T lights the fire (hold E 2 s): the page falls into the flames and
//      burns (damage, the burning screen); the flames from the room, the smoke out of the stack from the back lawn;
//   d. creaks: up the hall's south flight in the middle of the treads (walking, Shift): 3 creaks; along the wall: none;
//      the T stepping on a floorboard: heard; a floorboard by the kitchen doorway;
//   e. the trunk: the hint, E: in (the dark view with its strip of light, no crosshair, no gun); the T opens the garage
//      and drives the car out with the page in its trunk; E: out; Cee2 hides in it: not drawn; the page (his teammate)
//      opens it: told, he stays; the T opens it: Cee2 tumbles out, drawn again;
//   f. draw calls (this page's WebGL calls a frame) for the fire and the footprints; page errors.
import { open, sleep, OUT } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
import { CHIMNEY as C } from '../../../shared/maps/mansion_stealth.js';

const PORT = +(process.env.GAME_PORT || 4240);
const want = k => !process.env.PARTS || process.env.PARTS.split(',').includes(k);
const KEEP = ['msg', 'stTo', 'stSfx', 'dmg', 'kill', 'drive', 'exited', 'round', 'doors'];
const g = await open('CT', 'Sooty', KEEP);
const { tp, keyDown, keyUp, shot, msgs, errors, ev, look } = g;
await g.cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
await sleep(500);
for (let i = 0; i < 8 && !(await ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await ev('document.querySelector(\'#join .team-btn[data-team="CT"]\').click(), 1'); await sleep(1500);
}
const MAPID = process.env.MAP || 'cs_mansion', tag = MAPID === 'cs_mansion_night' ? 'n' : 'd';
const checks = [];
const check = (ok, what) => { checks.push(!!ok); console.log(ok ? 'PASS' : 'FAIL', what); };
const S = expr => ev(`import('/js/stealth.js').then(m => JSON.stringify((d => ${expr})(m._debug())))`).then(s => { try { return JSON.parse(s); } catch { return s; } });
const meP = async () => (await S('d.me()')).p;
const hint = () => ev("document.getElementById('hint').textContent");
const prog = () => ev("document.getElementById('progress').classList.contains('hidden') ? '' : document.getElementById('progress-label').textContent");
const waitFor = async (fn, ms, step = 200) => { for (let i = 0; i < ms / step; i++) { if (await fn()) return true; await sleep(step); } return !!(await fn()); };
const snapT = async name => shot(`st-${tag}-${name}`);
// draw calls a frame (this page's WebGL), the last few frames
await ev(`(() => { const gl = document.querySelector('#game canvas').getContext('webgl2'); if (gl.__wrapped) return 1; gl.__wrapped = 1; window.__dc = 0;
  for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = gl[f].bind(gl); gl[f] = (...a) => { window.__dc++; return o(...a); }; }
  const frames = window.__frames = []; let last = 0; const tick = () => { frames.push(window.__dc - last); last = window.__dc; if (frames.length > 20) frames.shift(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 1; })()`);
const drawCalls = async () => { await sleep(2500); const f = JSON.parse(await ev('JSON.stringify(window.__frames.slice(-6))')); return f.sort((a, b) => a - b)[Math.floor(f.length / 2)]; };

// the scripted players: a T so the round goes live, a second CT
const T = await player('Tee', 'T', PORT), C2 = await player('Cee2', 'CT', PORT);
let ph = null, snap = null;
const slow = {};
for (const m of T.log) if (m.t === 's') for (const k of ['cars']) if (k in m) slow[k] = m[k];
for (const c of [T, C2]) { const push = c.log.push.bind(c.log); c.log.push = m => { if (m.t === 's') { if (c === T) { ph = m.ph; for (const k of ['cars']) { if (k in m) slow[k] = m[k]; else m[k] = slow[k]; } snap = m; } return 0; } return push(m); }; }
const press = async c => { c.use(true); await sleep(150); c.use(false); await sleep(200); };
await waitFor(() => ph === 'live', 40000);
T.at([-17.0, 0.813, 1.5]); C2.at([27.5, 0, 3]);
await sleep(800);
console.log('live; map', MAPID);
const pageId = (await S('d.me()')).id;

// ---- a. views
if (want('a')) {
  await tp([-19.3, 0.813, 0.6], Math.PI); await sleep(1200); await look(0, 0.12); await sleep(1500);
  const dcRoom = await drawCalls();
  await snapT('a1-fireplace.png');
  console.log(`   draw calls, living room facing the fireplace: ${dcRoom}`);
  await tp([-19.3, 4.267, 2.2], Math.PI); await sleep(1200); await look(0, 0.15); await sleep(1500);
  await snapT('a2-ts-room-breast.png');
  await tp([-19.3, 4.267, 8.0], 0); await sleep(1200); await look(0, 0.1); await sleep(1500);
  await snapT('a3-bedroom-side.png');
  await tp([-19.3, 9.75, 7.6], 0); await sleep(1200); await look(0, 0.1); await sleep(1500);
  const dcRoof = await drawCalls();
  await snapT('a4-roof-stack.png');
  console.log(`   draw calls, on the roof facing the stack: ${dcRoof}`);
  await tp([-23.0, 8.0, 4.8], -Math.PI / 2); await sleep(1200); await look(0, 0.35); await sleep(1500); // (the roof's eave, west of the stack, looking east)
  await snapT('a5-roof-from-west.png');
  await tp([-19.3, C.hearth, 4.8], Math.PI); await sleep(1200); await look(0, 1.2); await sleep(1500);
  await snapT('a6-flue-looking-up.png');
  check(true, 'views taken (look at the screenshots)');
}

// ---- b. climbing up and down, soot and footprints
if (want('b')) {
  await tp([-19.3, C.hearth, 4.8], Math.PI); await sleep(1000); await look(0, 0.7); await sleep(800);
  const y0 = (await meP())[1];
  console.log('   at the back of the firebox, hint:', JSON.stringify(await hint()));
  await keyDown('KeyW');
  let top = false, ys = [];
  for (let i = 0; i < 600 && !top; i++) {
    await sleep(150);
    const p = await meP();
    if (i % 4 === 0) ys.push(+p[1].toFixed(2));
    if (p[2] > C.z2 + 0.1) top = true; // (over the south rim: let go of W at once, or he walks on off the roof's end)
  }
  await keyUp('KeyW'); await sleep(2500);
  const pt = await meP();
  console.log('   climbing, y every 0.6 s:', ys.join(' '));
  check(y0 < 1 && ys.some(y => y > 5 && y < 9) && top && pt[2] > C.z2 && pt[1] > 9 && pt[1] < C.top - 0.1, `up the flue on the rungs and out over the south rim onto the roof (now ${pt.map(v => v.toFixed(2)).join(', ')})`);
  await snapT('b1-out-on-roof.png');
  const sooty = await waitFor(async () => (await S('[...d.soot.keys()]')).includes(pageId), 3000);
  check(sooty, 'sooty (the snapshot lists the page)');
  // walk south along the roof's west slope (level that way) a few metres: prints on the slope
  const n0 = await S('d.printCount()');
  await tp([pt[0], pt[1], pt[2]], Math.PI); await sleep(600);
  await keyDown('ShiftLeft'); await keyDown('KeyW');
  await waitFor(async () => (await meP())[2] > pt[2] + 3, 40000, 150);
  await keyUp('KeyW'); await keyUp('ShiftLeft'); await sleep(1500);
  const n1 = await S('d.printCount()');
  const pr = await S('(() => { const m = d.prints.mesh, a = m.instanceMatrix.array, out = []; for (let i = 0; i < m.count; i++) { const e = a.slice(i * 16, i * 16 + 16), l = Math.hypot(e[8], e[9], e[10]); out.push([e[12], e[13], e[14], e[9] / l]); } return out; })()');
  const roofPrints = pr.filter(q => q[1] > 8.5 && q[1] < C.top - 0.05); // (not the one on the stack's flat rim)
  check(n1 > n0 + 2 && roofPrints.length >= 2 && roofPrints.every(q => q[3] < 0.95), `footprints on the roof's slope (${roofPrints.length}, tilted: up.y ${roofPrints.map(q => q[3].toFixed(2)).join(' ')}; on the rim: ${pr.filter(q => q[1] >= C.top - 0.05).length})`);
  await tp([-19.6, 9.75, pt[2] - 0.6], Math.PI); await sleep(800); await look(0, -0.6); await sleep(1500); // (behind where he started, looking along them)
  await snapT('b2-roof-prints.png');
  // back to the stack, E: on the rungs, hanging (not on a rim)
  await tp([-19.3, 9.75, 6.2], 0); await sleep(1000);
  const ht = await hint();
  await msgs();
  await g.key('KeyE', 200); await sleep(2500);
  const into = (await msgs()).find(m => m.t === 'stTo');
  const pin = await meP();
  check(/climb down the chimney/.test(ht) && into && Math.abs(pin[1] - 10.1) < 0.25 && pin[2] > C.fz1 && pin[2] < C.fz2, `on the roof by the stack: "${ht}"; E puts you on the rungs, hanging there (${pin.map(v => v.toFixed(2)).join(', ')})`);
  await snapT('b3-in-flue-top.png');
  // down: look down, W (no teleport: as a player does)
  await look(0, -1.1); await sleep(500);
  await keyDown('KeyW');
  await waitFor(async () => (await meP())[1] < C.hearth + 0.05, 120000, 400);
  await keyUp('KeyW'); await sleep(500);
  const pb = await meP();
  check(pb[1] < C.hearth + 0.05, `down the flue to the hearth (y ${pb[1].toFixed(2)})`);
  // crawl out (crouch, W: still facing north) and walk about the living room
  await look(0, 1.1); await sleep(300);
  await keyDown('ControlLeft'); await keyDown('KeyW');
  await waitFor(async () => (await meP())[2] < C.z1 - 0.5, 40000, 300);
  await keyUp('KeyW'); await keyUp('ControlLeft'); await sleep(800);
  const po = await meP();
  check(po[2] < C.z1 - 0.3, `crawled out of the fireplace into the living room (z ${po[2].toFixed(2)})`);
  const n2 = await S('d.printCount()');
  await keyDown('KeyW'); await sleep(4000); await keyUp('KeyW'); await sleep(1500);
  const n3 = await S('d.printCount()');
  check(n3 > n2 + 2, `footprints on the living room's floor (${n3 - n2} more)`);
  await tp([-19.3, 0.813, 3.6], 0); await sleep(800); await look(0, -0.7); await sleep(1500);
  const dcPrints = await drawCalls();
  await snapT('b4-room-prints.png');
  console.log(`   draw calls looking at the prints: ${dcPrints}`);
}

// ---- c. the fire
if (want('c')) {
  // up the flue, low (the rungs catch you): the server burns in real time, the page falls in game time (1-3 fps)
  await tp([-19.3, 2.6, 4.8], Math.PI); await sleep(1500);
  const hang = await meP();
  T.at([-19.3, C.hearth, 3.85]); await sleep(500);
  await msgs();
  T.use(true); await sleep(2400); T.use(false);
  const litOk = await waitFor(() => S('d.lit()'), 3000);
  check(litOk, 'the T held E 2 s at the hearth: it burns');
  const fell = await waitFor(async () => (await meP())[1] < 1.2 || !(await S('d.me()')).alive, 30000, 300);
  const burn = +(await ev("getComputedStyle(document.getElementById('burn')).opacity"));
  await snapT('c1-in-the-flames.png');
  check(hang[1] > 2 && fell, `the page, up the flue (y ${hang[1].toFixed(2)}), falls into the fireplace (now y ${(await meP())[1].toFixed(2)})`);
  await sleep(800);
  const dmg2 = (await msgs(false)).filter(x => x.t === 'dmg');
  const killed = (await msgs(false)).find(x => x.t === 'kill' && x.v === pageId);
  check(dmg2.length >= 2 && (burn > 0 || killed?.w === 'fireplace'), `and burns: ${dmg2.length} hits, hp ${dmg2.at(-1)?.hp}, burning screen ${burn}${killed ? ', killed by ' + killed.w : ''}`);
  // (the server burns in real time while the headless page falls at a few frames a second: he usually dies) — a new
  // round, the page alive in the living room, the T lights it again: the flames from the room, the smoke from outside
  const { admin } = await import('../mansion/client.mjs');
  const newRound = async () => {
    await admin({ action: 'restart' }, PORT);
    await waitFor(async () => !(await S('d.lit()')) && ph === 'live' && (await S('d.me()')).alive, 25000);
    await sleep(1500);
  };
  await newRound();
  check(!(await S('d.lit()')), 'a new round: out');
  await tp([-19.3, 0.813, 1.6], Math.PI); await sleep(1500); await look(0, 0.05); await sleep(1000);
  const dcCold = await drawCalls();
  T.at([-18.4, C.hearth, 3.85]); await sleep(500);
  T.use(true); await sleep(2400); T.use(false);
  await waitFor(() => S('d.lit()'), 3000);
  T.at([-16.0, 0.813, -2.0]); await sleep(2500);
  const dcFire = await drawCalls();
  await snapT('c2-fire-from-room.png');
  console.log(`   draw calls facing the fireplace: out ${dcCold}, burning ${dcFire}`);
  await tp([-38.0, 0.0, 2.0], -Math.PI / 2 - 0.15); await sleep(1500); await look(0, 0.4); await sleep(3000); // (from the back garden: closer, the eave hides the stack)
  await snapT('c3-smoke-from-back-lawn.png');
  await newRound();
  T.at([-17.0, 0.813, 1.5]); C2.at([27.5, 0, 3]);
}

// ---- d. creaks
if (want('d')) {
  const creaks = () => S('d.creakLog.map(c => [c.kind, +c.pos[0].toFixed(2), +c.pos[1].toFixed(2), +c.pos[2].toFixed(2), c.g])');
  await S('d.creakLog.splice(0)');
  await tp([-12.18, 0.813, -0.4], Math.PI); await sleep(1000);
  await keyDown('ShiftLeft'); await keyDown('KeyW');
  await waitFor(async () => (await meP())[2] > 5.2, 60000, 400);
  await keyUp('KeyW'); await keyUp('ShiftLeft'); await sleep(500);
  const up = (await creaks()).filter(c => Math.abs(c[1] + 12.18) < 0.3);
  check(up.length === 3 && up.every(c => c[0] === 'step'), `walking (Shift) up the middle of the south flight: ${up.length} creaks (3): ${JSON.stringify(up)}`);
  await S('d.creakLog.splice(0)');
  await tp([-12.5, 0.813, -0.4], Math.PI); await sleep(1000);
  await keyDown('KeyW');
  await waitFor(async () => (await meP())[2] > 5.2, 60000, 400);
  await keyUp('KeyW'); await sleep(500);
  const edge = await creaks();
  check(edge.length === 0, `running up along the wall: ${edge.length} creaks (0) ${JSON.stringify(edge)}`);
  // the T steps onto the board in front of the sofa: the page hears it
  await tp([-19.0, 0.813, 0.0], Math.PI / 2); await sleep(800);
  await S('d.creakLog.splice(0)');
  for (let i = 0; i <= 12; i++) { T.at([-20.6 - i * 0.1, 0.813, 0.0]); await sleep(150); }
  await sleep(1500);
  const heardT = await creaks();
  check(heardT.some(c => c[0] === 'board' && c[1] < -21.3 && c[1] > -22.3), `the T stepping onto the board in front of the sofa: heard (${JSON.stringify(heardT)})`);
  // the page on the board by the kitchen doorway
  await S('d.creakLog.splice(0)');
  await tp([-17.0, 0.813, -4.5], Math.PI / 2); await sleep(800);
  await keyDown('KeyW'); await sleep(3000); await keyUp('KeyW'); await sleep(500);
  const board = await creaks();
  check(board.some(c => c[0] === 'board' && c[1] < -17.4 && c[1] > -18.4), `the page walking onto the board by the kitchen doorway: a creak (${JSON.stringify(board)})`);
  T.at([-17.0, 0.813, 1.5]);
}

// ---- e. the trunk
if (want('e')) {
  const car1 = () => { const r = slow.cars?.find(c => c[0] === 1); return r && { p: [r[1], r[2], r[3]], yaw: r[4] }; };
  const g0 = car1();
  await tp([-21.5, g0.p[1], -19.2], -Math.PI / 2 - 0.4); await sleep(1500);
  const h0 = await hint();
  check(h0 === 'Press E to open the trunk and hide in it', `beside the back of the garage's car: "${h0}"`);
  await msgs();
  await g.key('KeyE', 200);
  const inT = await waitFor(async () => (await S('d.me()')).trunk === 1, 4000);
  await sleep(1500);
  const cover = await ev("(() => { const c = document.getElementById('stealth-trunk'); return c ? getComputedStyle(c).display : 'none'; })()");
  const cross = await ev("document.getElementById('crosshair').style.visibility");
  const hIn = await hint();
  check(inT && cover === 'block' && cross === 'hidden' && /Press E to jump out/.test(hIn), `E: in the trunk — the dark view (${cover}), no crosshair (${cross}), the hint "${hIn}"`);
  const dcTrunk = await drawCalls();
  await snapT('e1-in-trunk-garage.png');
  console.log(`   draw calls in the trunk: ${dcTrunk}`);
  // the T rolls the garage door up, gets in and drives out
  T.at([-16.6, 0, -17.9]); await sleep(500); await press(T); await sleep(2600);
  T.at([-19.0, 0, -19.3]); await sleep(400); T.clear(); await press(T);
  const drives = await waitFor(() => T.got('drive').length, 3000);
  const start = car1().p;
  for (let i = 1; i <= 16; i++) { T.send({ t: 'car', id: 1, p: [start[0] + i * 0.8, start[1], start[2]], yaw: g0.yaw, speed: 6, steer: 0 }); await sleep(250); }
  T.send({ t: 'car', id: 1, p: [start[0] + 12.8, start[1], start[2]], yaw: g0.yaw, speed: 0, steer: 0 });
  await sleep(2500);
  const pRide = await meP();
  check(drives && pRide[0] > start[0] + 11, `the T drives the car out of the garage: the page goes along (x ${pRide[0].toFixed(2)})`);
  await snapT('e2-in-trunk-driven.png');
  await msgs();
  await g.key('KeyE', 200); await sleep(1500);
  const out = (await msgs()).find(m => m.t === 'stTo');
  const pOut = await meP();
  check(out && (await S('d.me()')).trunk == null && pOut[1] > -0.1, `E: out of the trunk (${pOut.map(v => v.toFixed(2)).join(', ')}), the normal view back`);
  // T gets out; Cee2 hides in it; the page looks at the car
  await press(T); await sleep(500); T.at([start[0] + 12.8 + 3, 0, start[2] + 2.5]);
  const c1 = car1(), back = [c1.p[0] - 2.2 - 0.5, 0, c1.p[2]];
  C2.at(back); await sleep(500); await press(C2);
  await waitFor(async () => (await S(`d.remotes().find(r => r.inTrunk)`)) != null, 4000);
  await tp([c1.p[0] - 7.5, 0, c1.p[2] + 0.5], -Math.PI / 2); await sleep(2000);
  const rem = (await S('d.remotes()')).find(r => r.inTrunk);
  check(rem && !rem.visible, `Cee2 in the trunk: not drawn (${JSON.stringify(rem)})`);
  await snapT('e3-car-with-hidden-cee2.png');
  // the page (his teammate) opens it
  await tp([back[0] - 0.2, 0, back[2] - 0.3], -Math.PI / 2); await sleep(1200);
  const h1 = await hint();
  await msgs();
  await g.key('KeyE', 200); await sleep(1500);
  const told = (await msgs()).filter(m => m.t === 'msg').map(m => m.text);
  const still = (await S('d.remotes()')).find(r => r.inTrunk);
  check(h1 === 'Press E to open the trunk and hide in it' && told.some(t => /Cee2 is already curled up/.test(t)) && still, `his teammate opens it: "${told.join(' | ')}", he stays (the hint was the same: "${h1}")`);
  // the T opens it
  await tp([c1.p[0] - 7.5, 0, c1.p[2] + 0.5], -Math.PI / 2); await sleep(800);
  T.at([back[0], 0, back[2] + 0.4]); await sleep(500); await press(T);
  await sleep(2000);
  const found = (await S('d.remotes()')).find(r => r.id === rem?.id && !r.inTrunk && Math.hypot(r.p[0] - back[0], r.p[2] - back[2]) < 3 && r.visible); // (Cee2 himself)
  check(!(await S('d.remotes()')).some(r => r.inTrunk) && found, `the T opens it: Cee2 tumbles out, drawn again (${JSON.stringify(found)})`);
  await snapT('e4-cee2-found.png');
}

console.log('page errors:', errors.length ? errors.join('\n') : '(none)');
check(!errors.length, 'no page errors');
T.close(); C2.close();
const bad = checks.filter(c => !c).length;
console.log(`${checks.length - bad}/${checks.length} passed; screenshots in ${OUT}`);
process.exit(bad ? 1 : 0);
