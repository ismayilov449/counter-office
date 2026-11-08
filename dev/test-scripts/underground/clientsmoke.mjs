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
// a fake sound kit (as audio.js's floodKit gives): nodes that connect to anything, and a list of what's played where
const node = () => ({ connect(t) { return t || node(); }, gain: { value: 1 }, frequency: { value: 0 }, Q: { value: 0 }, delayTime: { value: 0 }, type: '' });
const fctx = { currentTime: 0, createGain: node, createBiquadFilter: node, createDelay: node };
const sounds = [];
const kit = { ctx: fctx, noise: null, tone: (dest, t, o) => sounds.push(['tone', dest, o]), burst: (dest, t, o) => sounds.push(['burst', dest, o]), out: p => ({ at: p }) };
const camera = new THREE.PerspectiveCamera();
// indoors: in the house (or under the ground); the back lawn is outdoors
const { isUnderground } = await import('../../../shared/underground.js');
const indoors = p => (p[0] > -23.67 && p[0] < -6.4 && p[2] > -14.43 && p[2] < 11.3) || isUnderground(MAPS.cs_mansion, p);
ug.init({ scene, net: { handlers, send: noop }, me, hud, fx: {}, coll: () => null, indoors, kit: () => kit });
let now = 0;
const frames = k => { for (let i = 0; i < k; i++) ug.update(0.05, (now += 50), camera); };

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
// ---- 2. the echo (a fake sound kit: what goes into which bus)
const { UG } = await import('../../../shared/underground.js');
for (const id of ['cs_mansion', 'cs_mansion_night']) {
  ug.setMap(MAPS[id]);
  me.team = 'CT'; me.alive = true;
  const cam = (x, y, z) => { camera.position.set(x, y, z); frames(1); };
  const CELLAR = [-15.5, -2.2 + 1.6, 0], TUNNEL = [5, -2.2 + 1.6, 5.6], KITCHEN = [-19, 0.81 + 1.6, -10], STREET = [27, 1.6, 12];
  // above ground, a rifle in the cellar
  cam(...KITCHEN); sounds.length = 0; fctx.currentTime += 1;
  ok(`${id}: a rifle shot in the cellar, heard in the kitchen: a boom from below`, ug.shot(CELLAR, 'ak47') && sounds.length === 2 && sounds.every(s => s[1] === ug.debug().bus.below));
  const g1 = sounds.map(s => s[2].gain);
  ok(`${id}: ...at most one per ${UG.echo.gap} s (a spray is one rolling rumble)`, !ug.shot(CELLAR, 'ak47') && sounds.length === 2);
  fctx.currentTime += 0.1;
  cam(...STREET); sounds.length = 0;
  ok(`${id}: on the street, 40 m away: the same boom, as loud`, ug.shot(CELLAR, 'ak47') && sounds.length === 2 && sounds.every((s, i) => s[1] === ug.debug().bus.below && Math.abs(s[2].gain - g1[i]) < 1e-9));
  fctx.currentTime += 0.1; sounds.length = 0;
  ok(`${id}: a suppressed pistol: much quieter`, ug.shot(CELLAR, 'usp') && sounds.length === 2 && sounds[1][2].gain < g1[1] * 0.3);
  fctx.currentTime += 0.1; sounds.length = 0;
  ok(`${id}: a shot in the tunnel and the drain echoes too`, ug.shot(TUNNEL, 'deagle') && (fctx.currentTime += 0.1) && ug.shot([10, -3.4, -2], 'm3') && sounds.length === 4);
  fctx.currentTime += 0.1; sounds.length = 0;
  ok(`${id}: no echo for a shot above ground, or a knife underground`, !ug.shot(KITCHEN, 'ak47') && !ug.shot(CELLAR, 'knife') && sounds.length === 0);
  // down there
  cam(...TUNNEL); fctx.currentTime += 0.1; sounds.length = 0;
  ok(`${id}: heard in the tunnel: it rings along the tunnels (the tunnel bus)`, ug.shot(CELLAR, 'ak47') && sounds.some(s => s[1] === ug.debug().bus.tunnel));
  const far = sounds.find(s => s[1] === ug.debug().bus.tunnel)[2].gain;
  fctx.currentTime += 0.1; sounds.length = 0;
  ug.shot([4, -0.6, 5.6], 'ak47');
  const near = sounds.find(s => s[1] === ug.debug().bus.tunnel)[2].gain;
  ok(`${id}: ...louder close by (${near.toFixed(3)}) than 20 m away (${far.toFixed(3)}), never gone`, near > far && far > 0.35 * UG.echo.gain * 0.9);
  // blasts
  cam(...KITCHEN); sounds.length = 0;
  ok(`${id}: an HE in the cellar: a long boom (even right after a shot)`, ug.boom([-17, -2.1, 1], 'he') && sounds.length === 2 && sounds[0][2].dur > 0.6);
  sounds.length = 0;
  ok(`${id}: a smoke grenade in the cellar, or an HE in the kitchen: nothing`, !ug.boom([-17, -2.1, 1], 'smoke') && !ug.boom([-19, 0.9, -10], 'he') && sounds.length === 0);
}
// ---- 3. the vents
const { audio } = await import('../../../public/js/audio.js');
const { ventsOf, UG: UGv } = await import('../../../shared/underground.js');
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
ok('the audio module asks us where a sound is heard from (audio.vent)', audio.vent === ug.ventPos);
for (const id of ['cs_mansion', 'cs_mansion_night']) {
  ug.setMap(MAPS[id]);
  me.alive = true; me.team = 'T';
  const grilleMeshes = scene.children.filter(c => c.name === 'vent grilles');
  const mesh = ug.debug().mesh, v = ventsOf(MAPS[id]);
  ok(`${id}: one mesh for all six grilles (${mesh?.geometry.index.count / 3} triangles), the old one gone`, grilleMeshes.length === 1 && mesh && mesh.geometry.index.count === 36 && !mesh.castShadow);
  // each quad faces into its room, 4 mm off its surface
  const P = mesh.geometry.attributes.position.array, I = mesh.geometry.index.array;
  const facing = v.grilles.every((g, k) => {
    const [a, b, c] = [I[k * 6], I[k * 6 + 1], I[k * 6 + 2]].map(j => [P[j * 3], P[j * 3 + 1], P[j * 3 + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    return n[g.axis] * g.n > 0 && Math.abs(a[g.axis] - (g.lo[g.axis] + g.n * 0.004)) < 1e-6;
  });
  ok(`${id}: every grille's quad faces into its room, 4 mm off the surface`, facing);
  const cam = (x, y, z) => { camera.position.set(x, y, z); frames(1); };
  // crouched under the cellar's grille: the back lawn comes through it
  cam(-22.55, -2.2 + 0.76, 1.5);
  ok(`${id}: crouched under the cellar's grille: listening at grille ${ug.debug().near?.i} (${ug.debug().near?.d.toFixed(2)} m)`, ug.debug().near?.i === 0);
  const lawn = [-28, 0.1, 1.5], ear = [-22.55, -1.44, 1.5];
  const q = ug.ventPos(lawn);
  ok(`${id}: a footstep on the back lawn 5.7 m away comes out of the grille, ${q && d3(q, ear).toFixed(2)} m away (in the grille's direction)`, q && d3(q, ear) < d3(lawn, ear) * 0.7 && q[1] > ear[1]);
  ok(`${id}: ...but not a sound in the kitchen (not where the vent leads)`, ug.ventPos([-19, 0.9, -10]) === null);
  ok(`${id}: the hint names where it leads: "${ug.hint()}"`, /back lawn/.test(ug.hint() || ''));
  // over the bedroom's floor grille, crouched and standing: the kitchen below
  const step = [-17, 0.9, -7];
  cam(-18.35, 4.267 + 0.76, -10.75);
  const qc = ug.ventPos(step), earC = [-18.35, 5.027, -10.75];
  cam(-18.35, 4.267 + 1.62, -10.75);
  const qs = ug.ventPos(step), earS = [-18.35, 5.887, -10.75];
  ok(`${id}: over the bedroom's floor grille a footstep in the kitchen comes up through it: crouched ${qc && d3(qc, earC).toFixed(2)} m, standing ${qs && d3(qs, earS).toFixed(2)} m (really ${d3(step, earS).toFixed(2)} m)`, qc && qs && d3(qc, earC) < d3(qs, earS) && d3(qs, earS) < d3(step, earS) * 0.9);
  ok(`${id}: floor grille hint: "${ug.hint()}"`, /kitchen/.test(ug.hint() || '') && /dropped in/.test(ug.hint() || ''));
  // under the floor (in the kitchen, right below it): not that grille (it faces up)
  cam(-18.35, 2.43, -10.75);
  ok(`${id}: in the kitchen below the bedroom's grille: not listening at it (it faces the other way): ${ug.debug().near?.i ?? 'none'}`, ug.debug().near?.i !== 3);
  // away from every grille
  cam(-15, 2.43, 0);
  ok(`${id}: in the living room: no grille, every sound where it is`, ug.debug().near === null && ug.ventPos(step) === null && ug.hint() === null);
  // dead: no hint (but a spectator's camera may still listen)
  cam(-18.35, 5.027, -10.75); me.alive = false;
  ok(`${id}: dead: no hint`, ug.hint() === null);
  me.alive = true;
  // a grenade through a duct: a rattle in at one grille, a clank out of the other
  const r0 = ug.debug().rattles; sounds.length = 0;
  handlers.ugDuct({ id: 9, a: 2, b: 3, in: 5, d: 40 });
  await new Promise(r => setTimeout(r, 120));
  const at = sounds.map(s => s[1]?.at).filter(Boolean);
  ok(`${id}: 'ugDuct': a rattle at the kitchen's grille, then a clank at the bedroom's (${ug.debug().rattles - r0} sounds)`, ug.debug().rattles - r0 === 2 && at.some(p => d3(p, v.grilles[2].c) < 1e-6) && at.some(p => d3(p, v.grilles[3].c) < 1e-6));
}
for (const id of ['de_dust2', 'cs_assault', 'de_inferno', 'aim_map', 'de_dusty']) {
  ug.setMap(MAPS[id]);
  me.alive = true; me.team = 'T'; me.p = [0, -3, 0];
  frames(2);
  sounds.length = 0; fctx.currentTime += 1;
  ok(`${id}: never underground, no echo, no grilles`, !ug.noSignal() && !ug.shot([0, -3, 0], 'ak47') && !ug.boom([0, -3, 0], 'he') && sounds.length === 0 && !scene.children.some(c => c.name === 'vent grilles') && ug.ventPos([0, 0, 0]) === null);
}
console.log(`${n - fails}/${n} OK`);
