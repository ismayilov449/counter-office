// The browser's underground module (public/js/underground.js) run in Node with a stubbed page (no browser, no GPU,
// no sound card): the radar's signal underground, the messages, on both Mansion maps and off on the others.
//   node --import ./dev/test-scripts/gas/register.mjs dev/test-scripts/underground/clientsmoke.mjs
const noop = () => {};
const ctx2d = new Proxy({}, { get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => { o[k] = v; return true; } });
const el = () => ({ style: {}, textContent: '', appendChild: noop, getContext: () => ctx2d, width: 0, height: 0 });
globalThis.document = { createElement: el, getElementById: () => null, body: el() };
globalThis.window = globalThis.window || {};
const THREE = await import('three');
const ug = await import('../../../public/js/underground.js');
const { MAPS } = await import('../../../shared/maps/index.js');
let fails = 0, n = 0;
const ok = (what, cond) => { n++; console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) { fails++; process.exitCode = 1; } };

const said = [];
const hud = { small: (t, s) => said.push(t) };
const scene = new THREE.Scene();
const me = { id: 1, alive: true, team: 'CT', p: [-18, 0.813, 1] };
const handlers = {};
ug.init({ scene, net: { handlers, send: noop }, me, hud, fx: {}, coll: () => null, indoors: () => true });
let now = 0;
const frames = k => { for (let i = 0; i < k; i++) ug.update(0.05, (now += 50)); };

for (const id of ['cs_mansion', 'cs_mansion_night']) {
  ug.setMap(MAPS[id]);
  said.length = 0;
  me.alive = true; me.team = 'CT';
  me.p = [-18, 0.813, 1]; frames(3);
  ok(`${id}: the living room has signal`, !ug.noSignal() && !ug.blocked() && said.length === 0);
  me.p = [-15.5, -2.2, 0]; frames(3);
  ok(`${id}: the cellar has none, and going down says so once ("${said[0]}")`, ug.noSignal() && said.length === 1 && /no radar/i.test(said[0]));
  frames(20);
  ok(`${id}: ...only once`, said.length === 1);
  ok(`${id}: a ping or a target call from the cellar is blocked, with a message`, ug.blocked() && said.length === 2 && /underground/i.test(said[1]));
  for (const [where, p, want] of [
    ['the lower cellar stairs', [-14.4, -1.0, -7.1], true], ['the top of the cellar stairs', [-14.4, 0.4, -9.2], false],
    ['the smugglers\' tunnel', [0, -2.2, 5.6], true], ['the shed above it', [14, 0.2, 16], false],
    ['the storm drain', [10, -5.0, -2.0], true], ['the street above it', [10, 0, -2.0], false],
    ['the old water tunnel', [0, -4.0, -19.5], true], ['the garage', [-19, 0, -17], false],
    ['the lift\'s cabin at the cellar stop', [-20.6, -2.2, -4.5], true], ['the lift\'s cabin on the ground floor', [-20.6, 0.813, -4.5], false],
    ['crouched in the living room (eyes at 1.57)', [-18, 1.57, 1], false],
  ]) {
    me.p = p;
    ok(`${id}: ${where}: ${want ? 'no signal' : 'signal'}`, ug.noSignal() === want);
  }
  me.p = [-15.5, -2.2, 0]; me.alive = false;
  ok(`${id}: dead: no static (the radar isn't drawn for you)`, !ug.noSignal());
  me.alive = true; me.team = 'SPEC';
  ok(`${id}: a spectator: no static`, !ug.noSignal());
}
for (const id of ['de_dust2', 'cs_assault', 'de_inferno', 'aim_map', 'de_dusty']) {
  ug.setMap(MAPS[id]);
  me.alive = true; me.team = 'T'; me.p = [0, -3, 0];
  frames(2);
  ok(`${id}: never underground`, !ug.noSignal());
}
console.log(`${n - fails}/${n} OK`);
