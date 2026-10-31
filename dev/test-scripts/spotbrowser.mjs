// Radar red dots in the browser: join a team, wait for spotted enemies, screenshot the radar; then again after
// they're lost (rings). Usage: node spotbrowser.mjs OUTDIR [team]
import fs from 'node:fs';
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default; // Node 20 has no global WebSocket
const OUT = process.argv[2], TEAM = process.argv[3] || 'CT';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9333}/json/list`)).json();
const cdp = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (cdp.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
cdp.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); cdp.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
const shot = async (name, clip) => { const r = await cmd('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) }); fs.writeFileSync(OUT + '/' + name, Buffer.from(r.result.data, 'base64')); };
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__sp = [];
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return desc.get.call(this); },
    set(fn) { desc.set.call(this, e => { try { const m = JSON.parse(e.data); if (m.t === 's') window.__sp = m.sp || []; } catch {} fn(e); }); } });
  const send0 = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { window.__ws = this; return send0.call(this, d); };
` });
await cmd('Page.navigate', { url: `http://localhost:${process.env.GAME_PORT || 3999}/` });
for (let i = 0; i < 60; i++) { await sleep(500); if (/Connected/.test(await ev("document.getElementById('conn-status')?.textContent") || '')) break; }
await ev(`document.getElementById('name').value = 'Radar'; document.querySelector('#join .team-btn[data-team="${TEAM}"]').click(); 'ok'`);
await sleep(2500);
await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
const radar = await ev("JSON.stringify(document.getElementById('radar').getBoundingClientRect())").then(JSON.parse);
const clip = { x: radar.x - 5, y: radar.y - 5, width: radar.width + 10, height: radar.height + 10, scale: 2 };
let got = 0, gone = 0;
for (let i = 0; i < 120 && got < 1; i++) { await sleep(500); if ((await ev('__sp.length')) > 0) { got = 1; await sleep(200); await shot('spot-live.png', clip); await shot('spot-full.png'); } }
console.log('spotted seen:', !!got, await ev('JSON.stringify(__sp)'));
for (let i = 0; i < 40 && got && !gone; i++) { await sleep(250); if ((await ev('__sp.length')) === 0) { gone = 1; await sleep(700); await shot('spot-lost.png', clip); } }
console.log('lost ring shot:', !!gone);
console.log('errors:', errors.length ? errors.slice(0, 3).join('\n') : 'none');
process.exit(0);
