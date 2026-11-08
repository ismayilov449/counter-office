// node client-node.mjs — runs public/js/power.js (the browser's part) in node, without a browser: the import paths the
// browser uses ('/shared/…', 'three', 'three/addons/…') are mapped onto the repo and node_modules, and a do-nothing canvas
// stands in for the panel's labels. Builds the models for cs_mansion, then checks: what E aims at (each breaker, the
// generator, the winch; nothing through a wall; nothing while busy), the pwAim messages, every hint for both teams as the
// state changes, the models rebuilt when a breaker flips or the cable is cut, the generator shaking while it runs,
// powered()/poweredAt(), the messages' handlers, another map (nothing drawn).
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
register('data:text/javascript,' + encodeURIComponent(`
const repo = ${JSON.stringify(pathToFileURL(repo).href)};
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('/shared/')) return { url: repo + spec.slice(1), shortCircuit: true };
  if (spec === 'three') return { url: repo + 'node_modules/three/build/three.module.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: repo + 'node_modules/three/examples/jsm/' + spec.slice(13), shortCircuit: true };
  return next(spec, ctx);
}`));
const g2d = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => g2d }) };
const { createPower } = await import(pathToFileURL(repo + 'public/js/power.js').href);
const THREE = await import(pathToFileURL(repo + 'node_modules/three/build/three.module.js').href);
const { MAPS } = await import(pathToFileURL(repo + 'shared/maps/index.js').href);
const { CollisionWorld } = await import(pathToFileURL(repo + 'shared/collision.js').href);
const { PLAYER } = await import(pathToFileURL(repo + 'shared/physics.js').href);

let fails = 0, checks = 0;
const ok = (cond, what) => { checks++; if (!cond) { fails++; console.log('FAIL', what); } else if (process.env.V) console.log('ok  ', what); };
const map = MAPS.cs_mansion, P = map.power;
const scene = new THREE.Scene(), sent = [];
let clock = 100000, frameNo = 0;
const audio = { muffled: false, out: () => { throw new Error('no audio in node'); } };
const fx = { sparks: () => {}, puff: () => {}, flashLight: () => {}, dust: () => {} };
const me = { p: [0, 0, 0], alive: true, yaw: 0, pitch: 0, eyeH: PLAYER.eye, team: 'T', act: null };
const game = { phase: 'live', lights: {} };
const coll = new CollisionWorld(map);
const pw = createPower({ scene, me, net: { send: m => sent.push(m) }, audio, fx, game, serverNow: () => clock, coll: () => coll });
const frame = (ms = 1000 / 60) => { clock += ms; frameNo += ms; pw.update(ms / 1000, frameNo); };
const state = (s = {}) => pw.handlers.power({ t: 'power', main: 1, b: [1, 1, 1, 1, 1], g: [0, 90, clock], burst: [], cut: 0, ...s });
// stand at `feet`, look at point q
const look = (feet, q) => {
  me.p = feet.slice();
  const e = [feet[0], feet[1] + PLAYER.eye, feet[2]], d = [q[0] - e[0], q[1] - e[1], q[2] - e[2]];
  me.yaw = Math.atan2(-d[0], -d[2]); me.pitch = Math.asin(d[1] / Math.hypot(...d));
  frame();
  return sent.at(-1)?.a ?? null;
};

pw.load(map);
ok(scene.children.length === 3, `the models are in the scene (${scene.children.length}: the panel, the generator, the winch)`);
pw.load(map);
ok(scene.children.length === 3, 'loading the map again: nothing twice');
state();

// ---- the panel: each breaker's column
const pn = P.panel, colX = i => pn.min[0] + ((pn.max[0] - pn.min[0]) * (i + 0.5)) / 5, py = (pn.min[1] + pn.max[1]) / 2;
const SPOT = [-16.95, -2.2, -4.6];
for (let i = 0; i < 5; i++) ok(look(SPOT, [colX(i), py, pn.max[2]]) === 'b' + i, `looking at breaker ${i}: E aims at 'b${i}' (${sent.at(-1)?.a})`);
look(SPOT, [colX(0), py, pn.max[2]]);
ok(pw.hint() === 'Hold E to switch off the breaker for the upper floor (1 s)', `T, upper floor on: ${pw.hint()}`);
me.team = 'CT';
ok(pw.hint() === 'The breaker for the upper floor is on (the Terrorists can switch it off)', `CT, on: ${pw.hint()}`);
const geo0 = scene.children[0].geometry;
state({ b: [0, 1, 1, 1, 1] });
ok(scene.children[0].geometry !== geo0, 'a breaker flipped: the panel rebuilt (its lever down)');
ok(pw.hint() === 'Hold E to switch the breaker for the upper floor back on (1 s)', `CT, off: ${pw.hint()}`);
me.team = 'T';
ok(pw.hint() === 'The breaker for the upper floor is off', `T, off: ${pw.hint()}`);
me.act = { a: 'pwBreaker', pr: 0.5 };
frame();
ok(sent.at(-1)?.a === null && pw.hint() === null, 'busy (holding E): no target, no hint');
ok(pw.progress('pwBreaker') === 'Switching the breaker...', 'the progress label');
me.act = null;
ok(look([-16.95, -2.2, -2.0], [colX(2), py, pn.max[2]]) === null, 'too far from the panel (2.6 m): nothing');
game.phase = 'freeze';
look(SPOT, [colX(2), py, pn.max[2]]);
ok(pw.hint() === null, 'in the freeze time: no hint (the server does nothing)');
game.phase = 'live';

// ---- the generator
const G = P.gen, gc = [(G.min[0] + G.max[0]) / 2, 0.6, (G.min[2] + G.max[2]) / 2], GSPOT = [gc[0], 0, -16.1];
ok(look(GSPOT, gc) === 'g', `looking at the generator: 'g' (${sent.at(-1)?.a})`);
me.team = 'CT';
ok(/^Hold E to start the generator \(3 s\)/.test(pw.hint()), `CT, off: ${pw.hint()}`);
me.team = 'T';
ok(pw.hint() === 'The generator is off (the CTs can start it)', `T, off: ${pw.hint()}`);
state({ main: 0, g: [1, 60, clock] });
ok(/^Hold E to switch the generator off \(2 s\) — 60 s of fuel left/.test(pw.hint()), `T, running: ${pw.hint()}`);
me.team = 'CT';
for (let i = 0; i < 10; i++) frame(100);
ok(/^The generator is running — 59 s of fuel left/.test(pw.hint()), `CT, running, a second later: ${pw.hint()}`);
const gm = scene.children[1];
ok(gm.position.length() > 0 && gm.position.length() < 0.01, `it shakes while it runs (${gm.position.toArray().map(v => v.toFixed(4))})`);
ok(pw.progress('pwGen') === 'Switching the generator off...', 'the progress label while it runs');
ok(pw.powered('upper') && pw.powered('ground') && !pw.powered('cellar') && !pw.powered('cctv') && !pw.powered('lift'), 'mains off, the generator on: the floors live, not the cellar, the CCTV, the lift');
ok(pw.poweredAt([-15, 5, 0]) && !pw.poweredAt([-18, -1, 0]) && pw.poweredAt([0, 0, 0]) && !pw.poweredAt([-20.6, 1, -4.5]), 'poweredAt: upstairs yes, the cellar no, the lawn yes (not on the house), in the lift no');
state({ main: 0, g: [0, 0, clock] });
frame();
ok(pw.hint() === 'The generator\'s tank is empty' && gm.position.length() === 0, `CT, empty: ${pw.hint()} (it stands still)`);
ok(!pw.powered('upper'), 'mains off, the generator off: nothing live');

// ---- the winch
const W = P.winch, wc = [(W.min[0] + W.max[0]) / 2, W.min[1] + 0.7, (W.min[2] + W.max[2]) / 2], WSPOT = [-19.85, W.floor, -4.47];
ok(look(WSPOT, wc) === 'w', `in the machine room, looking at the winch: 'w' (${sent.at(-1)?.a})`);
me.team = 'T';
state();
ok(pw.hint() === 'Hold E to cut the lift\'s cable (4 s) — the cabin falls with everyone in it', `T: ${pw.hint()}`);
me.team = 'CT';
ok(pw.hint() === 'The lift\'s winch — the Terrorists could cut its cable here', `CT: ${pw.hint()}`);
const wg = scene.children[2].geometry;
state({ cut: 1 });
ok(scene.children[2].geometry !== wg && /has been cut/.test(pw.hint()), `cut: the winch rebuilt (frayed ends), ${pw.hint()}`);
ok(look([-22.7, 8.0, -4.47], wc) === null, 'from the roof outside its west wall: nothing (through the wall)');
ok(look([-6.0, 4.27, -3.9], wc) === null, 'from the terrace: nothing');

// ---- the messages
let threw = null;
try {
  pw.handlers.pwPop({ t: 'pwPop', g: 'lampa7', p: [-18.8, 3.9, -1.02] });
  for (const s of ['breaker', 'genstart', 'genstop', 'genout', 'grind', 'snap', 'crash', 'caught']) pw.handlers.pwSfx({ t: 'pwSfx', s, p: [-20, 0, -4] });
  for (let i = 0; i < 30; i++) frame();
} catch (e) { threw = e; }
ok(!threw, `every message handled without an error (no sound in node) ${threw ? threw.stack : ''}`);

// ---- another map: nothing drawn, powered() follows the blackout
pw.load(MAPS.de_dust2);
ok(scene.children.length === 0, 'Dust II: the models gone');
game.lights = { power: false };
ok(!pw.powered('upper') && pw.hint() === null, 'Dust II: powered() is the blackout\'s, no hint');
game.lights = {};
pw.load(MAPS.cs_mansion_night);
ok(scene.children.length === 3, 'the night Mansion: the models again');

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
