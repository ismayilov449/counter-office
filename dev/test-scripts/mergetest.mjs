// After merging: on Mansion (game on 3999, Edge on 9333) a Terrorist buys the jammer, satchel and RPG-26, puts the
// jammer down, throws and sets off the satchel, fires the RPG-26. Prints what the server said and any page errors.
import fs from 'node:fs';
const OUT = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const page = (await (await fetch('http://127.0.0.1:9333/json/list')).json()).find(t => t.type === 'page');
const cdp = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => (cdp.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
cdp.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); cdp.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
const shot = async n => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + '/' + n, Buffer.from(r.result.data, 'base64')); };
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__in = [];
  const send0 = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { window.__ws = this; return send0.call(this, d); };
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return desc.get.call(this); },
    set(fn) { desc.set.call(this, e => { try { const m = JSON.parse(e.data); if (['msg','jammers','satchels','satchelThrow','rocket','boom','brk'].includes(m.t)) __in.push(m.t + (m.text ? ':' + m.text : '') + (m.list ? '(' + m.list.length + ')' : '')); } catch {} fn(e); }); } });
` });
await cmd('Page.navigate', { url: 'http://localhost:3999/' });
for (let i = 0; i < 80; i++) { await sleep(500); if (/Connected/.test(await ev("document.getElementById('conn-status')?.textContent") || '')) break; }
await ev(`document.getElementById('name').value = 'Merge'; document.querySelector('#join .team-btn[data-team="T"]').click(); 1`);
await sleep(4000);
await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 1");
const mouse = (type, o) => ev(`document.dispatchEvent(new MouseEvent('${type}', ${JSON.stringify(o)})), 1`);
const click = async (button = 0) => { await mouse('mousedown', { button }); await sleep(300); await mouse('mouseup', { button }); };
const key = async code => { const k = { key: code.slice(-1), code, windowsVirtualKeyCode: code.charCodeAt(code.length - 1) };
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await sleep(60); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); };
for (const item of ['jammer', 'satchel', 'rpg26']) { await ev(`__ws.send(JSON.stringify({ t: 'buy', item: '${item}' })), 1`); await sleep(400); }
const step = async label => { await sleep(1200); console.log(label, '->', JSON.stringify(await ev('JSON.stringify(__in.splice(0))').then(JSON.parse))); };
await step('bought');
await key('Digit6'); await sleep(500); console.log('slot after 6:', await ev("document.getElementById('hint')?.textContent"));
await click(0); await step('placed (jammer or satchel)');
await key('Digit6'); await sleep(500); await click(0); await step('next 6 + click');
await key('Digit6'); await sleep(500); await click(0); await step('next 6 + click');
await shot('merge-mansion.png');
await key('Digit1'); await sleep(800); await mouse('mousemove', { movementX: 0, movementY: -150 }); await click(0); await step('rpg26 fired');
await shot('merge-after.png');
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
