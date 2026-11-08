// Underground & vents in the real game (headless Edge on CDP_PORT, test server on GAME_PORT with BOTS=0; the map is
// the server's: cs_mansion or cs_mansion_night). Everything in warmup (a browser player and a scripted helper on the
// same team: no round, buying anywhere). Screenshots to OUT, names PREFIX_*.png (gu_d_ by day, gu_n_ at night).
//   1. the six grilles, each from a few metres (screenshots), and the hint right by each
//   2. the radar as a T: static ("NO SIGNAL") in the cellar, the message going down, a ping refused; normal again in
//      the kitchen
//   3. a real throw (Mouse1) straight up into the kitchen's ceiling grille: the grenade (tracked in the page) ends at
//      that grille and a new one comes out of the bedroom's floor grille; one "Fire in the hole" (the throw), none for
//      the grenade out of the vent; the messages (fu, ugDuct, vent, the boom upstairs)
//   4. the helper throws a smoke into the kitchen's ceiling grille while we watch the bedroom's floor grille: it drops
//      out there and smokes (screenshots)
//   5. the blackout (the helper at the fuse box): the grilles in the dark (screenshots)
//   6. rejoined as a CT (alone): the radar's static in the cellar and normal radar in the kitchen
// Page errors throughout. Server: srv.sh ROUND_TIME=600 START_MONEY=16000 AUTO_BALANCE=0 BUY_TIME=300 (both on the T side: warmup).
import { open, sleep, OUT } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const U = await import(G + 'shared/underground.js');
const { SPOTS, findThrow } = await import('./throws.mjs');
const MAPID = process.env.MAP || 'cs_mansion', NIGHT = /night/.test(MAPID), P = process.env.PREFIX || (NIGHT ? 'gu_n' : 'gu_d');
const map = MAPS[MAPID], world = new CollisionWorld(map), vents = U.ventsOf(map);
const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', what); };
const r2 = v => Math.round(v * 100) / 100;
const errors = [];

async function join(team) {
  const g = await open(team, 'Viewer', ['msg', 'nade', 'ugDuct', 'boom', 'lights', 'round', 'me']);
  await g.cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 8 && !(await g.ev('document.getElementById("join").classList.contains("hidden")')); i++) {
    await g.ev(`document.querySelector('#join .team-btn[data-team="${team}"]').click(), 1`); await sleep(1500);
  }
  await g.ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
  await sleep(1500);
  // in the page: the game's own modules (the same instances main.js uses), the grenades in the scene each frame, the
  // voice lines played, the radar's yellow "NO SIGNAL" pixels
  console.log('  page hooks:', await g.ev(`(async () => {
    const THREE = await import('three');
    window.__ug = await import('/js/underground.js');
    const { audio } = await import('/js/audio.js');
    window.__voices = [];
    const v0 = audio.voice.bind(audio);
    audio.voice = (n, k) => { __voices.push(n); return v0(n, k); };
    window.__scenes = new Set();
    const umw = THREE.Object3D.prototype.updateMatrixWorld;
    THREE.Object3D.prototype.updateMatrixWorld = function (f) { if (this.isScene) window.__scenes.add(this); return umw.call(this, f); };
    window.__nades = [];
    const sample = () => {
      const t = performance.now();
      for (const s of __scenes) s.traverse(o => { const q = o.geometry?.parameters; if (o.isMesh && o.parent && q && q.radius === 0.07 && q.widthSegments === 8 && q.heightSegments === 6) __nades.push([t, +o.position.x.toFixed(3), +o.position.y.toFixed(3), +o.position.z.toFixed(3), o.uuid]); });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    window.__radarYellow = () => { const d = document.getElementById('radar').getContext('2d').getImageData(30, 88, 140, 24).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 215 && d[i + 1] > 165 && d[i + 1] < 235 && d[i + 2] < 100) n++; return n; };
    return 'ok';
  })()`));
  return g;
}
const text = (g, id) => g.ev(`document.getElementById('${id}')?.textContent || ''`);
// (stand somewhere, turn, wait for frames: headless draws 1-3 a second)
const view = async (g, p, yaw, pitch, wait = 2500) => { await g.tp(p, yaw, 0); if (pitch) await g.look(0, pitch); await sleep(wait); };

const g = await join('T');
console.log('map', MAPID, 'joined as T; OUT', OUT);
const helper = await player('Helper', 'T');
helper.ph = null; helper.on.s = m => { helper.ph = m.ph; };
{ const push = helper.log.push.bind(helper.log); helper.log.push = m => (m.t === 's' ? 0 : push(m)); }
helper.at([-37.5, 0, 1.5], 0); // (parked in the back garden)
await sleep(1500);
check(helper.ph === 'warmup', `warmup (phase ${helper.ph}): buying anywhere, no round`);

// ---- 1. the grilles, and the hint by each
const LOOK = [ // [grille, feet, yaw, pitch] a few metres off, looking at it
  [0, [-21.2, -2.2, 1.5], Math.PI / 2, 0.42], [1, [-26.0, 0, 1.5], -Math.PI / 2, -0.52],
  [2, [-20.05, 0.813, -8.9], 0, 0.72], [3, [-18.35, 4.267, -9.3], 0, -0.85],
  [4, [-9.35, 0.813, -12.8], Math.PI, 0.72], [5, [-7.75, 4.267, -12.5], Math.PI, -0.85],
];
const CLOSE = [ // right by it: the hint
  [0, [-22.5, -2.2, 1.5], Math.PI / 2], [1, [-24.1, 0, 1.5], -Math.PI / 2], [2, [-20.05, 0.813, -10.75], 0],
  [3, [-18.35, 4.267, -10.0], 0], [4, [-9.6, 0.813, -11.5], 0], [5, [-7.75, 4.267, -11.9], Math.PI], // (4: out of the light switch's reach, whose E hint goes first)
];
const shots = [];
let msgDown = '';
for (const [i, p, yaw, pitch] of LOOK) {
  await view(g, p, yaw, pitch);
  if (i === 0) msgDown = await text(g, 'small-msg'); // (the first time down: the word about the radar)
  shots.push(await g.shot(`${P}_grille${i}.png`));
}
for (const [i, p, yaw] of CLOSE) {
  await view(g, p, yaw, 0, 1500);
  const h = await text(g, 'hint'), far = vents.grilles[vents.grilles[i].links[0].to].name;
  check(h.includes('Air vent to ' + far), `grille ${i} (${vents.grilles[i].name}): the hint "${h}"`);
}

// ---- 2. the radar as a T
await view(g, [-18, 0.813, 1], Math.PI / 2, 0, 2000);
const y0 = await g.ev('__radarYellow()');
await view(g, [-15.5, -2.2, 0.5], Math.PI / 2, 0, 2200);
const y1 = await g.ev('__radarYellow()'), ns1 = await g.ev('__ug.noSignal()');
await g.shot(`${P}_radar_cellar_T.png`);
check(y0 === 0 && y1 > 25 && ns1 === true, `T: the radar shows "NO SIGNAL" in the cellar (${y1} yellow pixels; ${y0} in the living room)`);
check(/no radar signal/i.test(msgDown), `T: going down says so: "${msgDown}"`);
await g.click(1, 80);
await sleep(400);
const msgPing = await text(g, 'small-msg');
check(/No signal underground/.test(msgPing), `T: a ping (middle mouse) in the cellar is refused: "${msgPing}"`);
for (const [where, p] of [['the drain', [10, -5.0, -2.0]], ['the smugglers\' tunnel', [0, -2.2, 5.65]]]) {
  await view(g, p, Math.PI / 2, 0, 1500);
  const y = await g.ev('__radarYellow()');
  check(y > 25, `T: static in ${where} too (${y})`);
}
await view(g, [-17.5, 0.81, -11.5], 0, 0, 2000);
const y2 = await g.ev('__radarYellow()'), ns2 = await g.ev('__ug.noSignal()');
await g.shot(`${P}_radar_kitchen_T.png`);
check(y2 === 0 && ns2 === false, `T: back in the kitchen the radar is normal (${y2} yellow pixels)`);

// ---- 3. a real throw into the kitchen's ceiling grille
await g.ev('__in.length = 0, 1');
await g.send({ t: 'buy', item: 'he' }); await sleep(800);
console.log('  socket', await g.ev('__ws.readyState'), 'after the buy:', await g.ev('JSON.stringify(__in.map(m => m.t === "msg" ? m.text : m.t + (m.inv ? " he=" + m.inv.he : "")))'));
await g.ev('__in.length = 0, __voices.length = 0, __nades.length = 0, 1');
// (a lob, Mouse2, from 1.85 m off, aimed by the game's own grenade physics: long enough in the air to be drawn)
const lob = findThrow(world, vents, vents.grilles[2], SPOTS[2].from, 1.6, false, [false]);
console.log(`  the lob: yaw ${r2(lob.yaw)}, pitch ${r2(lob.pitch)}, in after ${r2(lob.tIn)} s`);
await view(g, SPOTS[2].from, lob.yaw, lob.pitch, 1500);
await g.key('Digit4'); await sleep(900);
await g.click(2, 400);
const throwShots = [];
for (let k = 0; k < 3; k++) throwShots.push(await g.shot(`${P}_throw_${k}.png`));
for (let i = 0; i < 40 && !JSON.parse(await g.ev('JSON.stringify(__in)')).some(m => m.t === 'boom'); i++) await sleep(150);
await sleep(1500); // (the page's grenade runs slowly at a few frames a second)
const ins = JSON.parse(await g.ev('JSON.stringify(__in)'));
const first = ins.find(m => m.t === 'nade' && m.vent == null), duct = ins.find(m => m.t === 'ugDuct'), exit = ins.find(m => m.t === 'nade' && m.vent != null), boom = ins.find(m => m.t === 'boom');
check(first && Math.abs(first.fu - lob.tIn) < 0.02 && duct?.a === 2 && duct?.b === 3 && exit?.vent === 3, `throw (Mouse2 in the page): cut at the kitchen's grille after ${r2(first?.fu)} s (the search said ${r2(lob.tIn)}), ugDuct ${duct?.a}->${duct?.b}, out of grille ${exit?.vent}`);
check(boom && U.grilleRoom(map.rooms, { c: boom.p, nv: [0, 0, 0] }) === map.rooms.findIndex(r => r.group === 'lampa9'), `throw: the boom is upstairs in the bedroom (${boom?.p.map(r2)})`);
const voices = JSON.parse(await g.ev('JSON.stringify(__voices)'));
check(voices.filter(v => v === 'ct_fireinhole').length === 1, `throw: one "Fire in the hole" (the throw), none for the grenade out of the vent (${JSON.stringify(voices)})`);
const samples = JSON.parse(await g.ev('JSON.stringify(__nades)'));
const byId = new Map();
for (const s of samples) { if (!byId.has(s[4])) byId.set(s[4], []); byId.get(s[4]).push(s); }
const legs = [...byId.values()].sort((a, b) => a[0][0] - b[0][0]);
const g2 = vents.grilles[2], g3 = vents.grilles[3];
const lastOf1 = legs[0]?.at(-1), firstOf2 = legs[1]?.[0];
console.log(`  grenade meshes: ${legs.length}; frames: ${legs.map(l => l.length).join(', ')}; first ends ${lastOf1?.slice(1, 4)}, second starts ${firstOf2?.slice(1, 4)}`);
check(legs.length >= 2 && U.grilleDist(g2, lastOf1.slice(1, 4)) < 0.7, `the page: the thrown grenade's last frame is at the kitchen's grille (${lastOf1 && r2(U.grilleDist(g2, lastOf1.slice(1, 4)))} m from it)`);
check(firstOf2 && U.grilleDist(g3, firstOf2.slice(1, 4)) < 0.7 && legs[1].every(s => s[2] > 4.2), `the page: then one comes up out of the bedroom's grille (${firstOf2 && r2(U.grilleDist(g3, firstOf2.slice(1, 4)))} m from it) and stays upstairs`);

// ---- 4. the helper's smoke into the north-east room's ceiling grille, out of the security room's floor grille, on camera
{
  const g4 = vents.grilles[4], g3 = vents.grilles[5]; // (g3: the grille it comes out of)
  const t = findThrow(world, vents, g4, SPOTS[4].from);
  helper.send({ t: 'buy', item: 'smoke' }); await sleep(300);
  helper.at(SPOTS[4].from, t.yaw, t.pitch); await sleep(400);
  await view(g, [-7.75, 4.267, -12.6], Math.PI, -0.75, 2500);
  await g.ev('__in.length = 0, __nades.length = 0, 1');
  helper.send({ t: 'nade', k: 'smoke', o: t.o, v: t.v });
  for (let k = 0; k < 5; k++) { await g.shot(`${P}_smoke_${k}.png`); await sleep(400); }
  await sleep(2500);
  await g.shot(`${P}_smoke_after.png`);
  const ins2 = JSON.parse(await g.ev('JSON.stringify(__in)')), s2 = JSON.parse(await g.ev('JSON.stringify(__nades)'));
  const b2 = ins2.find(m => m.t === 'boom');
  const up = s2.filter(s => U.grilleDist(g3, s.slice(1, 4)) < 1.2);
  check(b2?.k === 'smoke' && U.grilleDist(g3, b2.p) < 1.5 && up.length > 0, `the helper's smoke comes up out of the security room's grille (${up.length} frames of it within 1.2 m) and smokes there (${b2?.p.map(r2)})`);
}

// ---- 5. the blackout
helper.at([-18.3, -2.2, -4.5], 0); await sleep(400);
helper.use(true); await sleep(3400); helper.use(false); await sleep(800);
const lights = JSON.parse(await g.ev('JSON.stringify(__in)')).filter(m => m.t === 'lights');
check(lights.some(m => m.power === 'off'), `the helper cut the power at the fuse box (${JSON.stringify(lights.map(m => m.power))})`);
for (const [i, p, yaw, pitch] of [LOOK[0], LOOK[2], LOOK[4]]) {
  await view(g, p, yaw, pitch);
  await g.shot(`${P}_dark_grille${i}.png`);
}
helper.at([-37.5, 0, 1.5], 0);

// ---- 6. as a CT (alone, so still warmup)
helper.close();
await g.ev("__ws.close(), 1"); // (the old connection first, or the T stays on the server)
g.cdp.close();
await sleep(1000);
const c = await join('CT');
await view(c, [-18, 0.813, 1], Math.PI / 2, 0, 2000);
const cy0 = await c.ev('__radarYellow()');
await view(c, [-15.5, -2.2, 0.5], Math.PI / 2, 0, 2200);
const cy1 = await c.ev('__radarYellow()');
await c.shot(`${P}_radar_cellar_CT.png`);
await view(c, [-17.5, 0.81, -11.5], 0, 0, 2000);
const cy2 = await c.ev('__radarYellow()');
await c.shot(`${P}_radar_kitchen_CT.png`);
check(cy0 === 0 && cy1 > 25 && cy2 === 0, `CT: static in the cellar (${cy1}), normal in the living room (${cy0}) and the kitchen (${cy2})`);

check(errors.length === 0 && g.errors.length === 0 && c.errors.length === 0, `no page errors (${[...errors, ...g.errors, ...c.errors].join(' | ') || 'none'})`);
const pass = checks.filter(Boolean).length;
console.log(`${pass}/${checks.length} passed`);
c.cdp.close();
process.exit(pass === checks.length ? 0 : 1);
