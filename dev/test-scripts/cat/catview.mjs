// Close-up pictures of the cat, posed (no server game needed, but the test server serves the page): the map is built
// as in the game (main.js blocked), cats in every pose stand in the living room by the basket and the sofa, and
// fixed views are rendered. On cs_mansion_night the eyes glow; the "dark" views switch the living room's lights off.
// usage: node dev/test-scripts/cat/catview.mjs <outPrefix> [map=cs_mansion]   (GAME_PORT 4060, CDP_PORT 9460)
// Prints each view's draw calls and triangles with and without the cats.
import fs from 'node:fs';
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default;
const [out, mapId = 'cs_mansion'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9460}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Fetch.requestPaused') ws.send(JSON.stringify({ id: 99990, method: 'Fetch.fulfillRequest', params: { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from('// blocked').toString('base64') } }));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    const text = m.params.args.map(a => a.value ?? a.description).join(' ');
    if (!/chrome-extension:/.test(text)) errors.push('error: ' + text); // (a browser extension's noise, not the game's)
  }
};
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Fetch.enable', { patterns: [{ urlPattern: '*/js/main.js*' }] });
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cmd('Page.navigate', { url: `http://127.0.0.1:${process.env.GAME_PORT || 4060}/?nocache=` + Date.now() });
await sleep(2500);
const setup = `(async () => {
  const THREE = await import('three');
  const { buildWorld } = await import('/js/world.js');
  const { MAPS } = await import('/shared/maps/index.js');
  const { setRooms, setGlow } = await import('/js/roomlight.js');
  const C = await import('/js/cat.js');
  const { CAT_STATE } = await import('/shared/cat.js');
  const map = MAPS[${JSON.stringify(mapId)}];
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:99999';
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = map.theme.exposure || 1;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.03, 1000);
  scene.add(camera);
  const world = buildWorld(scene, map, 'medium');
  setGlow(map.theme.roomGlow, new Set([...(map.switches || []).map(s => s.group), ...(map.theme.glowRooms || [])]));
  setRooms(map.rooms, {});
  C.catLoadMap(scene, map); // (the basket and the bowl; the live cat stays hidden with no snapshots)
  // a cat in every pose, in a row on the living-room floor (y 0.91), facing the camera (east, +x)
  const cats = new THREE.Group();
  const poses = ['sit', 'walk', 'trot', 'run', 'wash', 'stretch', 'hide', 'air', 'sleep', 'loaf'];
  poses.forEach((name, i) => {
    const m = C.createCatModel();
    m.position.set(-21.3, 0.91 + (name === 'air' ? 0.5 : 0), -3.6 + i * 0.62);
    m.rotation.y = -Math.PI / 2;
    C.catPoseModel(m, CAT_STATE[name], 1.3, 1.1);
    m.userData.eyes.visible = !!map.night && name !== 'sleep';
    cats.add(m);
  });
  // and one on the sofa, one in the basket (asleep)
  const sofa = C.createCatModel(); sofa.position.set(-22.86, 1.32, 0); sofa.rotation.y = -Math.PI / 2; C.catPoseModel(sofa, CAT_STATE.loaf, 2);
  const bask = C.createCatModel(); bask.position.set(-22.55, 0.96, 3.85); bask.rotation.y = -Math.PI / 2; C.catPoseModel(bask, CAT_STATE.sleep, 2);
  for (const m of [sofa, bask]) { m.userData.eyes.visible = !!map.night; cats.add(m); }
  scene.add(cats);
  window.catNames = poses;
  const frame = (lights = {}) => {
    world.setLights(lights); setRooms(map.rooms, lights);
    for (let i = 0; i < 30; i++) world.update(0.05, camera.position);
    renderer.render(scene, camera);
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  };
  window.view = (p, yaw, pitch, o = {}) => {
    camera.position.set(...p); camera.rotation.set(pitch, yaw, 0, 'YXZ'); camera.updateMatrixWorld();
    // (catYaw: turn the row of cats, e.g. 0 to see them side on from the east)
    cats.children.forEach((m, i) => { if (i < poses.length) m.rotation.y = o.catYaw ?? -Math.PI / 2; });
    cats.visible = false; const without = frame(o.lights);
    cats.visible = !o.noCats; const withCats = frame(o.lights);
    return JSON.stringify({ without, withCats });
  };
  window.viewReady = true;
})().catch(e => { window.viewError = String(e.stack || e); })`;
await ev(setup);
for (let i = 0; i < 60; i++) { await sleep(500); if (await ev('window.viewReady === true || !!window.viewError')) break; }
const verr = await ev('window.viewError || ""');
if (verr) { console.log('VIEWER ERROR', verr); process.exit(1); }
const dark = { lampa7: false };
// the poses two at a time, close up: from the front, then side on
const z = i => -3.6 + i * 0.62;
const pairs = [0, 2, 4, 6, 8].flatMap(i => [
  [`front_${i}`, [-20.45, 1.42, (z(i) + z(i + 1)) / 2], Math.PI / 2, -0.5],
  [`side_${i}`, [-20.45, 1.42, (z(i) + z(i + 1)) / 2], Math.PI / 2, -0.5, { catYaw: 0 }],
]);
const views = [
  ['row', [-19.6, 1.35, -0.8], Math.PI / 2 + 0.05, -0.32],       // the row of poses, from the east
  ...pairs,
  ['sofa', [-21.3, 1.5, 0.9], Math.PI / 2 - 0.5, -0.25],          // on the sofa, and the basket beyond
  ['basket', [-21.6, 1.4, 4.4], Math.PI / 2 + 0.55, -0.45],       // asleep in its basket
  ['bowl', [-16.6, 1.3, -12.3], 0.45, -0.45],                     // the bowl in the kitchen
  ['dark', [-19.6, 1.35, -0.8], Math.PI / 2 + 0.05, -0.32, { lights: dark }], // the living room's lights off
  ['far', [-14.5, 1.7, -0.5], Math.PI / 2, -0.06, { lights: dark }],          // across the dark room
];
for (const [name, p, yaw, pitch, o = {}] of views) {
  const info = await ev(`view(${JSON.stringify(p)}, ${yaw}, ${pitch}, ${JSON.stringify(o)})`);
  console.log(name.padEnd(9), info);
  await sleep(150);
  const s = await cmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${out}${name}.png`, Buffer.from(s.result.data, 'base64'));
}
console.log('ERRORS:', errors.join('\n') || '(none)');
process.exit(0);
