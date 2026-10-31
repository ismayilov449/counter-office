// The gas in the browser, part 2 (headless Edge on CDP_PORT, test server on GAME_PORT started with BOTS=0
// ROUND_TIME=600 GAS_LEAK_X=3). The browser's Terrorist and a scripted CT (parked on the street) play real rounds, each
// part a fresh round (admin restart), so the round reset is checked in the page too:
//   1. the kitchen's meter shot (a real click); the side door to the garage opened: the gas gets into the garage; the
//      CT flips the kitchen's light switch while the T watches from the hall: the blast ('switch'); the pipe is wrecked
//      (the CT doesn't live through it, so that round ends)
//   2. a new round: the pipe whole, no shimmer, no HUD line, no gas left in the page
//   3. the cellar's meter shot (a real click); the T cuts the power at the fuse box: the cellar goes off ('fusebox')
//   4. a new round, then what the pipe and the gas cost in draw calls in a kitchen view (the same frames with the gas
//      module's things shown, then hidden)
// The page's gas state is read from gas.js's update() through a conditional breakpoint that never pauses.
// Screenshots in OUT (gas2_*.png). MAP=cs_mansion_night: set NIGHT=1 to name the shots.
import { open, sleep } from '../mansion/game.mjs';
import { player, admin } from '../mansion/client.mjs';
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { GAS } = await import(G + 'shared/gas.js');
const map = MAPS.cs_mansion, room = n => map.rooms.findIndex(r => r.group === n);
const KITCHEN = room('lampa6'), GARAGE = room('garage'), CELLAR = room('cellar');
const N = process.env.NIGHT ? 'night_' : '';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const lookAt = (from, at) => { const e = [from[0], from[1] + 1.62, from[2]], dx = at[0] - e[0], dy = at[1] - e[1], dz = at[2] - e[2]; return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
const waitFor = async (cond, secs, step = 250) => { for (let i = 0; i < (secs * 1000) / step; i++) { if (await cond()) return true; await sleep(step); } return cond(); };

const g = await open('T', 'Gasman', ['gasLeak', 'gasBoom', 'gasCough', 'brk', 'doors', 'lights', 'dmg', 'kill', 'round', 'spawn']);
const { tp, key, keyDown, keyUp, click, shot, msgs, errors, ev, cmd } = g;
// the gas client's state, copied to window.__g every frame by a breakpoint condition that is always false
const src = await (await fetch(`http://127.0.0.1:${process.env.GAME_PORT || 3999}/js/gas.js`)).text();
const line = src.split('\n').findIndex(l => l.includes('const emit = now - lastPuff'));
await cmd('Debugger.enable');
await cmd('Debugger.setBreakpointByUrl', { urlRegex: '/js/gas\\.js', lineNumber: line, condition: '(window.__g = { board, haze, conc, target, pipes, puffs, msgText }, false)' });
// (and one after update() has shown what it shows: window.__hideGas hides the pipes and the gas sprites, to count
// what they cost in the same frame)
const line2 = src.split('\n').findIndex(l => l.includes("let text = '';"));
await cmd('Debugger.setBreakpointByUrl', { urlRegex: '/js/gas\\.js', lineNumber: line2, condition: '(window.__hideGas && (board.mesh.visible = false, pipes.forEach(p => { p.group.visible = false; })), false)' });
const st = async () => JSON.parse(await ev(`JSON.stringify(window.__g ? { pipes: __g.pipes.map(p => [p.s, p.group.visible]), target: __g.target.map(v => +v.toFixed(3)), haze: [...__g.haze.keys()], sprites: __g.board.items.length, puffs: __g.puffs.length, msg: __g.msgText, hud: document.getElementById('gas-msg')?.textContent || '' } : null)`));
// draw calls a frame (the GL draw functions counted between animation frames; the median of the last 20)
await ev(`(() => { if (window.__dc) return 1; window.__dc = { n: 0, frames: [] };
  for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) { const o = P[f]; if (!o) continue; P[f] = function (...a) { window.__dc.n++; return o.apply(this, a); }; }
  const raf = window.requestAnimationFrame.bind(window);
  const tick = () => { window.__dc.frames.push(window.__dc.n); if (window.__dc.frames.length > 60) window.__dc.frames.shift(); window.__dc.n = 0; raf(tick); }; raf(tick); return 1; })()`);
// (swiftshader draws only a few frames a second here: count from now, skipping the frame already under way)
const calls = async () => { await ev('window.__dc.frames.length = 0, 1'); await sleep(3000); return ev('(() => { const f = window.__dc.frames.slice(1).sort((a, b) => a - b); return f[f.length >> 1]; })()'); };

const ct = await player('Sparky', 'CT');
const AWAY = [26, 1.7, 18]; // the street
const newRound = async () => {
  ct.clear(); await msgs();
  await admin({ action: 'restart' });
  await waitFor(() => ct.got('round').length > 0, 10);
  await sleep(3600); // the freeze time
  ct.at(AWAY, 0);
  await key('Digit2'); await sleep(900);
};
await waitFor(() => ct.got('round').length > 0, 15); // (the match starts by itself once both teams have someone)
await sleep(500);
// shoot at a point with the real mouse until a shot goes out (the first click after a respawn can come too early)
const fireAt = async (from, at) => {
  await tp(from, ...lookAt(from, at)); await sleep(700);
  for (let k = 0; k < 4; k++) { await click(0, 250); await sleep(500); const m = await msgs(false); if (m.some(x => x.t === 'gasLeak')) return m.filter(x => x.t === 'gasLeak'); }
  return [];
};

// ---------------------------------------------------------------- 1. the kitchen, the garage, the light switch
await newRound();
let s = await st();
ok(`round start: pipes whole and drawn ${JSON.stringify(s.pipes)}, no gas`, s.pipes.every(p => p[0] === 0 && p[1]) && s.target.every(v => v === 0));
const leak = await fireAt([-17.4, 0.81, -11.6], [-16.6, 1.5, -13.9]);
ok(`a real click on the kitchen meter holes the pipe: ${JSON.stringify(leak)}`, leak.some(m => m.i === 0 && m.s === 1));
// open the side door to the garage (door 7) and watch the garage
await tp([-21.55, 0.81, -13.2], 0); await sleep(400);
await key('KeyE'); await sleep(600);
ok('the side door to the garage opened', (await msgs(false)).some(m => m.t === 'doors' && m.i === 7 && m.open));
await waitFor(async () => (await st()).target[GARAGE] > 0.01, 30);
s = await st();
ok(`the gas gets into the garage through the open door (garage ${s.target[GARAGE]}, kitchen ${s.target[KITCHEN]})`, s.target[GARAGE] > 0.01);
const GV = [-19.5, 0.81, -19.5];
await tp(GV, ...lookAt(GV, [-19, 1.6, -14.5])); await sleep(1000);
await shot(`gas2_${N}garage.png`);
// the T watches from the hall, the CT flips the switch
const HALL = [-9.0, 0.81, -12.3];
await tp(HALL, ...lookAt(HALL, [-16, 1.4, -11])); await sleep(800);
console.log('   HUD in the hall:', JSON.stringify((await st()).hud), '| kitchen', (await st()).target[KITCHEN]);
await shot(`gas2_${N}switch0.png`);
ct.at([-14.0, 0.81, -10.67], Math.PI / 2); await sleep(500);
await msgs();
ct.use(true); await sleep(150); ct.use(false);
await sleep(300);
await shot(`gas2_${N}switch1.png`);
s = await st();
ok(`after the blast: the kitchen pipe wrecked and hidden ${JSON.stringify(s.pipes[0])}, no shimmer in the kitchen (${JSON.stringify(s.haze)})`, s.pipes[0][0] === 3 && !s.pipes[0][1] && !s.haze.includes(KITCHEN));
await sleep(500);
await shot(`gas2_${N}switch2.png`);
let m = await msgs();
const boom = m.filter(x => x.t === 'gasBoom');
ok(`the CT flipping the kitchen's light switch sets it off: ${JSON.stringify(boom)}`, boom.some(b => b.i === KITCHEN && b.k === 'switch'));
console.log('   pieces', m.filter(x => x.t === 'brk').reduce((a, x) => a + x.ids.length, 0), '| CT hurt', ct.got('dmg').map(x => x.d).join(','), '| T hurt', m.filter(x => x.t === 'dmg').map(x => x.d).join(','), '| kills', JSON.stringify(m.filter(x => x.t === 'kill').map(k => [k.k, k.v, k.w])));
ct.at(AWAY, 0);
const KV = [-22.3, 0.81, -6.2];

// ---------------------------------------------------------------- 2. a new round: everything clean in the page
await newRound();
await sleep(600);
s = await st();
ok(`a new round: pipes whole and drawn ${JSON.stringify(s.pipes)}, no gas, no shimmer, no HUD line (${JSON.stringify(s.hud)})`, s.pipes.every(p => p[0] === 0 && p[1]) && s.target.every(v => v === 0) && !s.haze.length && !s.hud);
await tp(KV, ...lookAt(KV, [-16.6, 1.6, -13.9])); await sleep(1500);
await shot(`gas2_${N}reset.png`);

// ---------------------------------------------------------------- 3. the cellar's boiler and the fuse box
const CSPOT = [-16.5, -2.2, 2.15], CMETER = [-13.405, -0.22, 2.15];
const cleak = await fireAt(CSPOT, CMETER);
ok(`a real click on the cellar's meter holes its pipe: ${JSON.stringify(cleak)}`, cleak.some(x => x.i === 1 && x.s === 1));
await sleep(1200);
await shot(`gas2_${N}boiler_leak.png`);
await waitFor(async () => (await st()).target[CELLAR] >= GAS.ignite + 0.03, 45);
s = await st();
console.log('   cellar', s.target[CELLAR], '| HUD', JSON.stringify(s.hud), '| haze rooms', JSON.stringify(s.haze));
const FB = [-18.3, -2.2, -4.5];
await tp(FB, ...lookAt(FB, [-16.5, -1.0, 1.0])); await sleep(600);
await shot(`gas2_${N}cellar_haze.png`);
await tp(FB, ...lookAt(FB, [-18.3, -0.95, -5.3])); await sleep(500);
await msgs();
await keyDown('KeyE'); await sleep(3500); await keyUp('KeyE');
await tp(FB, ...lookAt(FB, [-16.5, -1.0, 1.0])); await sleep(150);
await shot(`gas2_${N}fuse1.png`);
await sleep(600);
await shot(`gas2_${N}fuse2.png`);
m = await msgs();
const cboom = m.filter(x => x.t === 'gasBoom');
ok(`cutting the power at the fuse box sets the cellar off: ${JSON.stringify(cboom)}`, m.some(x => x.t === 'lights') && cboom.some(b => b.i === CELLAR && b.k === 'fusebox'));
console.log('   T hurt', m.filter(x => x.t === 'dmg').map(x => x.d).join(','), '| kills', JSON.stringify(m.filter(x => x.t === 'kill').map(k => [k.k, k.v, k.w])));
await sleep(2000);
await tp(CSPOT, ...lookAt(CSPOT, [-13.7, -1.0, 1.9])); await sleep(1200);
await shot(`gas2_${N}boiler_after.png`);
s = await st();
ok(`the boiler's pipe wrecked and hidden ${JSON.stringify(s.pipes[1])}`, s.pipes[1][0] === 3 && !s.pipes[1][1]);

// ---------------------------------------------------------------- 4. draw calls, no gas / gas in view
// (each count: the same view in the same frames, the gas module's things shown, then hidden)
await newRound();
const DV = [-22.3, 0.81, -6.2], DVAT = [-16.6, 1.6, -13.9];
const both = async () => { await ev('window.__hideGas = false, 1'); const a = await calls(); await ev('window.__hideGas = true, 1'); const b = await calls(); await ev('window.__hideGas = false, 1'); return [a, b]; };
await tp(DV, ...lookAt(DV, DVAT)); await sleep(1500);
const [c0, c1] = await both();
await fireAt([-17.4, 0.81, -11.6], [-16.6, 1.5, -13.9]);
await waitFor(async () => (await st()).haze.includes(KITCHEN), 20);
await tp(DV, ...lookAt(DV, DVAT)); await sleep(800);
const [g0, g1] = await both();
s = await st();
console.log(`   draw calls in the kitchen view: ${c0} (${c1} without the pipe: it costs ${c0 - c1}); with the leak and the shimmer ${g0} (${g1} without the gas module's things: ${g0 - g1}; ${s.sprites} sprites, ${s.puffs} puffs)`);
ok('the pipe and the gas cost at most 6 draw calls in the kitchen view', g0 - g1 <= 6 && c0 - c1 <= 5);
await shot(`gas2_${N}draw_gas.png`);

console.log('page errors:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
ok('no page errors', !errors.length);
ct.close();
process.exit();
