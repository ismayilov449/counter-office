// Usage: node views.mjs <outPrefix> <viewsJson> [map] — views: [[name, jsExpr], ...]; renders with viewer.js.
// Prints each view's draw calls and triangles; BENCH=n also times n frames of each (median ms, swiftshader).
import fs from 'node:fs';
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default; // Node 20 has no global WebSocket
const [out, viewsFile, mapId = 'cs_mansion'] = process.argv.slice(2);
const views = JSON.parse(fs.readFileSync(viewsFile, 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9333}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Fetch.requestPaused') ws.send(JSON.stringify({ id: 99990, method: 'Fetch.fulfillRequest', params: { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from('// blocked').toString('base64') } }));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && ['error'].includes(m.params.type)) errors.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
};
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Fetch.enable', { patterns: [{ urlPattern: '*/js/main.js*' }] });
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cmd('Page.navigate', { url: `http://127.0.0.1:${process.env.GAME_PORT || 3999}/?nocache=` + Date.now() });
await sleep(2500);
await ev(`window.VIEW_MAP = ${JSON.stringify(mapId)}; 1`);
await ev(fs.readFileSync(new URL('./viewer.js', import.meta.url), 'utf8'));
for (let i = 0; i < 60; i++) { await sleep(500); if (await ev('window.viewReady === true || !!window.viewError')) break; }
const verr = await ev('window.viewError || ""');
if (verr) { console.log('VIEWER ERROR', verr); process.exit(1); }
console.log('world built in', Math.round(await ev('window.buildMs')), 'ms');
for (const [name, expr] of views) {
  const r = await ev(expr);
  if (r !== 'ok') errors.push(name + ': ' + r);
  const info = await ev('JSON.stringify(window.info)');
  const ms = process.env.BENCH ? await ev(`bench(${+process.env.BENCH})`) : '';
  console.log(name.padEnd(14), info, ms ? ms + ' ms' : '');
  await sleep(200);
  const s = await cmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${out}${name}.png`, Buffer.from(s.result.data, 'base64'));
}
console.log('ERRORS:', errors.join('\n') || '(none)');
process.exit(0);
