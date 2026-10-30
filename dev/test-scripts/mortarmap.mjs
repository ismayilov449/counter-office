// Mortar map aiming in a real browser: buy, set up, right mouse opens the map, move the cursor, click, the tube lays
// itself, fire — the shell must land where the cursor was (within the spread). Then a called-in target: the map
// opens on it and a click snaps to it exactly. Screenshots of the map.
import fs from 'node:fs';
import { mortarRange, MILS } from 'file:///C:/Users/Rufat.Ismayilov/Desktop/CS1.6/shared/weapons.js';
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
  window.__out = []; window.__in = [];
  const send0 = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { window.__ws = this; try { const m = JSON.parse(d); if (m.t === 'mortar' || m.t === 'state') __out.push(m); if (__out.length > 400) __out.splice(0, 200); } catch {} return send0.call(this, d); };
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return desc.get.call(this); },
    set(fn) { this.__fn = fn; desc.set.call(this, e => { try { const m = JSON.parse(e.data); if (m.t === 'shell') __in.push(m); } catch {} fn(e); }); } });
  window.__fake = m => __ws.__fn({ data: JSON.stringify(m) });
` });
await cmd('Page.navigate', { url: 'http://localhost:3999/' });
for (let i = 0; i < 60; i++) { await sleep(500); if (/Connected/.test(await ev("document.getElementById('conn-status')?.textContent") || '')) break; }
await ev(`document.getElementById('name').value = 'Gunner'; document.querySelector('#join .team-btn[data-team="CT"]').click(); 'ok'`);
await sleep(3000);
await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
const mouse = (type, o) => ev(`document.dispatchEvent(new MouseEvent('${type}', ${JSON.stringify(o)})), 1`);
const click = async button => { await mouse('mousedown', { button }); await sleep(60); await mouse('mouseup', { button }); };
const key = async code => { await cmd('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.slice(-1), windowsVirtualKeyCode: code.charCodeAt(code.length - 1) }); await sleep(60); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.slice(-1), windowsVirtualKeyCode: code.charCodeAt(code.length - 1) }); };
await ev("__ws.send(JSON.stringify({ t: 'buy', item: 'mortar' })), 1");
await sleep(500); await key('Digit1'); await sleep(1500);
await click(0); // set up
await sleep(3000);
const panel = () => ev("document.getElementById('mortar-panel').classList.contains('hidden') ? 'hidden' : document.getElementById('mortar-panel').innerText");
console.log('panel:', (await panel()).split('\n').filter(l => /map|Bearing|Elevation/.test(l)).join(' | '));
const lastState = () => ev('JSON.stringify(__out.filter(m => m.t === "state").at(-1))').then(JSON.parse);
const s0 = await lastState();

// 1. map, move the cursor, click
await click(2); await sleep(300);
console.log('map open:', await ev("!document.getElementById('mortar-map').classList.contains('hidden')"));
const cssW = await ev("document.getElementById('mortar-map-canvas').getBoundingClientRect().width");
const bounds = { dust2: 144, mansion: 58.4 }; // filled below from the map name
const size = await ev("(() => { const t = document.getElementById('map-name').textContent; return t; })()");
console.log('map:', size, 'canvas css', Math.round(cssW));
// where the cursor starts: the tube's current aim (elevation 10-00, the facing)
const d0 = mortarRange(1000);
const start = [s0.p[0] - Math.sin(s0.yaw) * d0, s0.p[2] - Math.cos(s0.yaw) * d0];
const S = +(process.argv[3] || 144); // map size (bounds.max - bounds.min)
const mx = -120, my = 90; // pixels
for (let i = 0; i < 6; i++) { await mouse('mousemove', { movementX: mx / 6, movementY: my / 6 }); await sleep(30); }
await sleep(200);
const want = [start[0] + (mx * S) / cssW, start[1] + (my * S) / cssW];
const wantD = Math.hypot(want[0] - s0.p[0], want[1] - s0.p[2]);
console.log(`cursor at ${want.map(v => v.toFixed(1))}, ${wantD.toFixed(1)} m from the mortar`);
await shot('mortar-map.png');
await click(0); await sleep(150);
console.log('map closed after click:', await ev("document.getElementById('mortar-map').classList.contains('hidden')"));
console.log('panel while laying:', (await panel()).includes('Laying') ? 'shows "Laying the tube..."' : 'no laying line');
await sleep(1600);
await shot('mortar-laid.png');
const nOut = await ev('__out.filter(m => m.t === "mortar").length');
await mouse('mousedown', { button: 0 }); await sleep(80); await mouse('mouseup', { button: 0 });
await sleep(400);
const fired = await ev('JSON.stringify(__out.filter(m => m.t === "mortar").slice(' + nOut + '))').then(JSON.parse);
const shell = await ev('JSON.stringify(__in.at(-1))').then(JSON.parse);
console.log('fired:', JSON.stringify(fired));
if (shell) {
  const miss = Math.hypot(shell.at[0] - want[0], shell.at[2] - want[1]);
  console.log(`shell comes down ${miss.toFixed(2)} m from the clicked spot (allowed spread ${(1 + wantD * 0.03).toFixed(2)} m)`);
}

// 2. a called-in target: the map opens on it, a click snaps to it
await sleep(2600); // fire rate
const tgt = [s0.p[0] + 25, s0.p[1], s0.p[2] + 18];
await ev(`__fake({ t: 'spot', p: ${JSON.stringify(tgt)}, by: 999, name: 'Spotter' }), 1`);
await sleep(200);
await click(2); await sleep(200);
await mouse('mousemove', { movementX: 4, movementY: -3 }); await sleep(100); // a little off: still snaps
await shot('mortar-map-target.png');
await click(0); await sleep(2200);
const n2 = await ev('__in.length');
await mouse('mousedown', { button: 0 }); await sleep(80); await mouse('mouseup', { button: 0 });
await sleep(400);
const shell2 = await ev('JSON.stringify(__in.at(-1))').then(JSON.parse);
const td = Math.hypot(tgt[0] - s0.p[0], tgt[2] - s0.p[2]);
if (shell2 && (await ev('__in.length')) > n2) console.log(`target ${td.toFixed(1)} m away: shell ${Math.hypot(shell2.at[0] - tgt[0], shell2.at[2] - tgt[2]).toFixed(2)} m from it (spread ${(1 + td * 0.03).toFixed(2)} m)`);
else console.log('second shell: none');

// 3. out of reach: a click does nothing
await sleep(2600);
await click(2); await sleep(150);
for (let i = 0; i < 10; i++) { await mouse('mousemove', { movementX: 0, movementY: 0 }); }
await ev("document.dispatchEvent(new MouseEvent('mousemove', { movementX: -2000, movementY: -2000 })), 1"); await sleep(150);
await click(0); await sleep(200);
console.log('too far click: map still open', await ev("!document.getElementById('mortar-map').classList.contains('hidden')"), '| msg:', await ev("document.getElementById('small-msg').textContent"));
await click(2); await sleep(150);
console.log('right mouse closes it:', await ev("document.getElementById('mortar-map').classList.contains('hidden')"));
console.log('errors:', errors.length ? errors.slice(0, 3).join('\n') : 'none');
process.exit(0);
