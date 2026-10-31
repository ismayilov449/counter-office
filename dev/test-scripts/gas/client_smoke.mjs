// The browser's gas module (public/js/gas.js) run in Node with a stubbed page (no browser, no GPU): builds the pipes
// of both Mansion maps, takes snapshots and messages, runs frames, and checks what it would draw and say.
//   node --import ./dev/test-scripts/gas/register.mjs dev/test-scripts/gas/client_smoke.mjs
const noop = () => {};
const ctx2d = new Proxy({}, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' && /^(create\w*Gradient)$/.test(k) ? () => ({ addColorStop: noop }) : noop), set: (o, k, v) => { o[k] = v; return true; } });
const el = () => ({ style: {}, textContent: '', appendChild: noop, getContext: () => ctx2d, width: 0, height: 0 });
const hudEl = { ...el(), children: [], appendChild(c) { this.children.push(c); } };
globalThis.document = { createElement: el, getElementById: id => (id === 'hud' ? hudEl : null), body: hudEl };
const THREE = await import('three');
const { createGasClient } = await import('../../../public/js/gas.js');
const { MAPS } = await import('../../../shared/maps/index.js');
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };

const calls = [];
const rec = name => (...a) => calls.push([name, ...a]);
const fx = { sparks: rec('sparks'), explosion: rec('explosion'), flashLight: rec('flashLight') };
const audio = { out: () => null, play: rec('play'), muffled: false };
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
const me = { id: 1, alive: true, p: [-17.5, 0.81, -11.5], shake: 0 };
const gas = createGasClient({ scene, camera, fx, audio, me, brk: () => new Set(), indoors: () => true, shellShock: rec('shellShock'), realBlast: rec('realBlast') });
const meshes = o => { let n = 0; o.traverse(c => { if (c.isMesh && c.visible) n++; }); return n; };
const frames = (n, dt = 0.05) => { for (let i = 0; i < n; i++) gas.update(dt, (frames.t = (frames.t || 0) + dt * 1000)); };

for (const id of ['cs_mansion', 'cs_mansion_night']) {

  gas.setMap(MAPS[id]);
  const groups = scene.children.filter(c => c.isGroup);
  ok(`${id}: 2 pipes built (${groups.map(meshes).join(' + ')} meshes: one per material, and the valve lever)`, gas.debug().pipes.length === 2 && groups.length === 2 && groups.every(g => meshes(g) <= 8));
}
const kitchen = MAPS.cs_mansion.rooms.findIndex(r => r.group === 'lampa6');
frames(5);
ok('clean air: no sprites, no HUD line', gas.debug().sprites === 0 && gas.debug().msg === '');
gas.handlers.gasLeak({ i: 0, s: 1, p: [-16.64, 1.54, -13.82] });
gas.snapshot({ p: [1, 0], r: [kitchen, 80] });
frames(60);
let d = gas.debug();
ok(`a leak: sparks at the hole, vapour (${d.sprites} sprites), the shimmer in the kitchen (${JSON.stringify(d.haze)}), HUD "${d.msg}"`, calls.some(c => c[0] === 'sparks') && d.haze.includes(kitchen) && d.sprites > 3 && d.sprites <= 7 + 30 && /a lot of it/.test(d.msg));
gas.snapshot({ p: [1, 0], r: [kitchen, 9] });
frames(80);
ok(`a little gas: "${gas.debug().msg}", no shimmer below the haze threshold`, gas.debug().msg === 'You smell gas' && !gas.debug().haze.includes(kitchen));
gas.snapshot({ p: [1, 0], r: [kitchen, 120] });
frames(80);
ok(`thick gas: "${gas.debug().msg}"`, /choking/.test(gas.debug().msg));
me.p = [-16.6, 0.81, -13.1];
ok(`the valve hint: "${gas.hint()}"`, /Hold E to close the gas valve/.test(gas.hint() || ''));
me.p = [-10, 0.81, -12];
ok('no hint away from the valve', gas.hint() === null);
gas.handlers.gasLeak({ i: 0, s: 2, p: [-16.64, 1.54, -13.82] });
ok('shut: no hint, the pipe state is 2', gas.hint() === null && gas.debug().pipes[0].s === 2);
calls.length = 0;
gas.handlers.gasBoom({ i: kitchen, p: [-18.3, 2.25, -9.77], s: 0.6, e: 130, k: 'impact' });
frames(2);
const n = calls.filter(c => c[0] === 'explosion').length;
ok(`the blast: ${n} fireballs, the c4 boom, soot (realBlast), shell shock close by; the shimmer gone`, n >= 2 && calls.some(c => c[0] === 'play' && c[1] === 'c4boom') && calls.some(c => c[0] === 'realBlast') && calls.some(c => c[0] === 'shellShock') && !gas.debug().haze.includes(kitchen));
gas.snapshot({ p: [3, 0], r: [] });
frames(2);
ok('a wrecked pipe is no longer drawn', gas.debug().pipes[0].visible === false);
gas.snapshot(undefined);
frames(30);
ok('the next round (no gs): pipes whole and drawn, no sprites, no HUD line', gas.debug().pipes.every(p => p.s === 0 && p.visible) && gas.debug().sprites === 0 && gas.debug().msg === '');
gas.handlers.gasCough({ id: 2, p: [0, 1, 0] });
ok('a cough without audio running is harmless', true);
gas.setMap(MAPS.de_dust2);
gas.snapshot(undefined);
frames(10);
ok('another map: no pipes, nothing drawn', gas.debug().pipes.length === 0 && gas.debug().sprites === 0);
