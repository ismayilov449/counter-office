// Draw cost: node pviews.mjs <outPrefix> [map] — renders the power views (and vcost.json's) with
// dev/test-scripts/mansion/viewer.js on the test page (960x540, the headless Edge on CDP_PORT, the server on GAME_PORT),
// first the level alone, then (MODELS=1, only where the server has public/js/power.js) with power.js's three models
// added to the viewer's scene. Prints each view's draw calls and triangles; screenshots in outPrefix*. Run it against
// this branch's server and against main's (same script) to compare.
import fs from 'node:fs';
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default;
const [out, mapId = 'cs_mansion'] = process.argv.slice(2);
const here = new URL('./', import.meta.url);
const POWER_VIEWS = [
  ['p_panel', 'view([-16.95, -0.6, -3.4], 0, -0.15)'],
  ['p_cellar', 'view([-14.6, -0.6, 3.0], 1.2, -0.1)'],
  ['p_generator', 'view([-19.6, 1.6, -16.9], 3.1416, -0.35)'],
  ['p_garage', 'view([-16.3, 1.7, -19.9], -2.3, -0.15)'],
  ['p_machine', 'view([-19.6, 11.5, -4.0], 1.35, -0.3)'],
  ['p_roof', 'view([-15.6, 13.6, -4.4], 1.5708, -0.3)'],
  ['p_terrace', 'view([-3.9, 5.9, -2.2], 1.0, 0.05)'],
  ['p_street', 'view([27.5, 1.7, -2.0], 1.5708, 0.12)'],
];
const views = [...POWER_VIEWS, ...JSON.parse(fs.readFileSync(new URL('../mansion/vcost.json', import.meta.url), 'utf8'))];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9630}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Fetch.requestPaused') ws.send(JSON.stringify({ id: 99990, method: 'Fetch.fulfillRequest', params: { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from('// blocked').toString('base64') } }));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
};
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Fetch.enable', { patterns: [{ urlPattern: '*/js/main.js*' }] });
await cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
await cmd('Page.navigate', { url: `http://127.0.0.1:${process.env.GAME_PORT || 4230}/?nocache=` + Date.now() });
await sleep(2500);
await ev(`window.VIEW_MAP = ${JSON.stringify(mapId)}; 1`);
await ev(fs.readFileSync(new URL('../mansion/viewer.js', here), 'utf8'));
for (let i = 0; i < 60; i++) { await sleep(500); if (await ev('window.viewReady === true || !!window.viewError')) break; }
const verr = await ev('window.viewError || ""');
if (verr) { console.log('VIEWER ERROR', verr); process.exit(1); }
const rows = {};
async function pass(tag) {
  for (const [name, expr] of views) {
    const r = await ev(expr);
    if (r !== 'ok') errors.push(name + ': ' + r);
    const info = JSON.parse(await ev('JSON.stringify(window.info)'));
    (rows[name] ||= {})[tag] = info;
    await sleep(150);
    if (name.startsWith('p_')) { const s = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${out}${tag}_${name}.png`, Buffer.from(s.result.data, 'base64')); }
  }
}
await pass('level');
let models = false;
if (process.env.MODELS) {
  const r = await ev(`(async () => {
    const { createPower } = await import('/js/power.js');
    const { MAPS } = await import('/shared/maps/index.js');
    const scene = viewWorld.group.parent;
    const pw = createPower({ scene, me: { p: [0, -100, 0], alive: false, yaw: 0, pitch: 0 }, net: { send() {} }, audio: { out() { throw new Error('none'); } },
      fx: { sparks() {}, puff() {}, flashLight() {}, dust() {} }, game: { phase: 'live', lights: {} }, serverNow: () => Date.now(), coll: () => null });
    pw.load(MAPS[window.VIEW_MAP]);
    return 'models ' + scene.children.length;
  })()`);
  console.log('loading the models:', r);
  models = /^models/.test(r);
  if (models) await pass('models');
}
console.log('view'.padEnd(14), 'level: calls tris'.padEnd(22), models ? 'with models: calls tris' : '');
for (const [name] of views) {
  const a = rows[name].level, b = rows[name].models;
  console.log(name.padEnd(14), `${a.calls} ${(a.triangles / 1000).toFixed(1)}k`.padEnd(22), b ? `${b.calls} ${(b.triangles / 1000).toFixed(1)}k (+${b.calls - a.calls})` : '');
}
console.log('JSON', JSON.stringify(rows));
console.log('ERRORS:', errors.join('\n') || '(none)');
process.exit(0);
