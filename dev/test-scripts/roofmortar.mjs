// Mansion, Terrorist at their spawn inside the house: set the mortar up under the roof, aim on the map, fire —
// the roof above must break (brk) and the shell fly; a second shell breaks nothing more. Screenshots.
import fs from 'node:fs';
const OUT = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const cdp = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (cdp.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
cdp.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); cdp.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
const shot = async name => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + '/' + name, Buffer.from(r.result.data, 'base64')); };
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1536, height: 864, deviceScaleFactor: 1, mobile: false });
await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__in = [];
  const send0 = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { window.__ws = this; return send0.call(this, d); };
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return desc.get.call(this); },
    set(fn) { desc.set.call(this, e => { try { const m = JSON.parse(e.data); if (m.t === 'shell' || m.t === 'brk' || m.t === 'boom') __in.push(m); } catch {} fn(e); }); } });
` });
await cmd('Page.navigate', { url: 'http://localhost:3999/' });
for (let i = 0; i < 60; i++) { await sleep(500); if (/Connected/.test(await ev("document.getElementById('conn-status')?.textContent") || '')) break; }
await ev(`document.getElementById('name').value = 'Gunner'; document.querySelector('#join .team-btn[data-team="T"]').click(); 'ok'`);
await sleep(3000);
await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
const mouse = (type, o) => ev(`document.dispatchEvent(new MouseEvent('${type}', ${JSON.stringify(o)})), 1`);
const click = async button => { await mouse('mousedown', { button }); await sleep(60); await mouse('mouseup', { button }); };
const key = async code => { await cmd('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.slice(-1), windowsVirtualKeyCode: code.charCodeAt(code.length - 1) }); await sleep(60); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.slice(-1), windowsVirtualKeyCode: code.charCodeAt(code.length - 1) }); };
await ev("__ws.send(JSON.stringify({ t: 'buy', item: 'mortar' })), 1");
await sleep(500); await key('Digit1'); await sleep(1200);
console.log('hint before setup:', await ev("document.getElementById('hint').textContent"));
await click(0); await sleep(300);
console.log('message:', await ev("document.getElementById('small-msg').textContent"));
await sleep(2700);
const panelOn = await ev("!document.getElementById('mortar-panel').classList.contains('hidden')");
console.log('set up under the roof:', panelOn);
await click(2); await sleep(300);
await mouse('mousemove', { movementX: 140, movementY: 40 }); await sleep(150);
await shot('roof-map.png');
await click(0); await sleep(1500);
await click(0); await sleep(1200);
const after1 = await ev('JSON.stringify(__in)').then(JSON.parse);
console.log('after shot 1:', after1.map(m => m.t + (m.ids ? `(${m.ids.length} pieces)` : '')).join(' '));
await shot('roof-hole.png');
await ev("__in.length = 0, 1");
await sleep(2500); await click(0); await sleep(800);
const after2 = await ev('JSON.stringify(__in)').then(JSON.parse);
console.log('after shot 2:', after2.map(m => m.t + (m.ids ? `(${m.ids.length} pieces)` : '')).join(' ') || 'nothing');
await sleep(5000);
await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); 1");
console.log('errors:', errors.length ? errors.slice(0, 3).join('\n') : 'none');
process.exit(0);
