// Signal jammer in the browser: a scripted Terrorist (WebSocket) puts a jammer down 3 m in front of the browser's CT;
// screenshots of the jammer, the radar static and the hint; V and middle-click are refused; then the CT shoots it.
// Usage: node jambrowser.mjs OUTDIR
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
const shot = async (name, clip) => { const r = await cmd('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) }); fs.writeFileSync(OUT + '/' + name, Buffer.from(r.result.data, 'base64')); };
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__in = [];
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return desc.get.call(this); },
    set(fn) { desc.set.call(this, e => { try { const m = JSON.parse(e.data); if (m.t === 'jamdown' || m.t === 'jammers' || m.t === 'msg') __in.push(m); if (m.t === 'spawn') window.__spawn = m; } catch {} fn(e); }); } });
  const send0 = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { window.__ws = this; return send0.call(this, d); };
` });
await cmd('Page.navigate', { url: 'http://localhost:3999/' });
for (let i = 0; i < 60; i++) { await sleep(500); if (/Connected/.test(await ev("document.getElementById('conn-status')?.textContent") || '')) break; }
await ev(`document.getElementById('name').value = 'CTcam'; document.querySelector('#join .team-btn[data-team="CT"]').click(); 'ok'`);
// the Terrorist
const T = { ws: new WebSocket('ws://127.0.0.1:3999/ws'), seq: 0 };
T.ws.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 'welcome') T.ws.send(JSON.stringify({ t: 'join', name: 'JamT', team: 'T' })); if (m.t === 'spawn') T.seq = m.sq; if (m.t === 'msg' || m.t === 'jammers') console.log('  T got', m.t, m.text || JSON.stringify(m.list)); };
await sleep(7000); // the match starts, freeze time ends
await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
for (let i = 0; i < 40 && !(await ev('!!window.__spawn')); i++) await sleep(500);
console.log('joined:', await ev("document.getElementById('conn-status')?.textContent"));
const sp = JSON.parse(await ev('JSON.stringify(window.__spawn)'));
const fwd = [-Math.sin(sp.yaw), -Math.cos(sp.yaw)];
const at = [sp.p[0] + fwd[0] * 3, sp.p[1], sp.p[2] + fwd[1] * 3];
const tPos = [sp.p[0] + fwd[0] * 30, sp.p[1], sp.p[2] + fwd[1] * 30];
let tp = at;
T.ws.send(JSON.stringify({ t: 'buy', item: 'jammer' })); await sleep(300); // (in his own buy zone, before he moves)
const keep = setInterval(() => T.ws.send(JSON.stringify({ t: 'state', sq: T.seq, p: tp, yaw: 0, pitch: 0, c: 0, w: 'knife' })), 50);
await sleep(400);
T.ws.send(JSON.stringify({ t: 'jammer', p: at, yaw: sp.yaw })); await sleep(300);
tp = tPos; // the T walks off
await ev('window.me_pitch = 1'); // (no-op marker)
// look down at it a little
await ev("document.dispatchEvent(new MouseEvent('mousemove', { movementY: 120 })), 1");
await sleep(1500);
console.log('page got:', await ev('JSON.stringify(__in.filter(m => m.t === "jammers").map(m => m.list))'));
console.log('hint:', await ev("document.getElementById('hint').textContent"));
await shot('jam-view.png');
const radar = JSON.parse(await ev("JSON.stringify(document.getElementById('radar').getBoundingClientRect())"));
await shot('jam-radar.png', { x: radar.x - 5, y: radar.y - 5, width: radar.width + 10, height: radar.height + 10, scale: 2 });
// V and the middle button are refused
await cmd('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyV', key: 'v', windowsVirtualKeyCode: 86 }); await sleep(60);
await cmd('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyV', key: 'v', windowsVirtualKeyCode: 86 });
await sleep(200);
console.log('after V:', await ev("document.getElementById('small-msg').textContent"));
// shoot it: aim at it (the mouse already pointed down) and click 3 times with the pistol
await ev("document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' })), document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2' })), 1");
await sleep(900);
for (let i = 0; i < 4; i++) {
  await ev("document.dispatchEvent(new MouseEvent('mousedown', { button: 0 })), 1"); await sleep(80);
  await ev("document.dispatchEvent(new MouseEvent('mouseup', { button: 0 })), 1"); await sleep(350);
}
await sleep(500);
const got = JSON.parse(await ev('JSON.stringify(__in.map(m => m.t))'));
console.log('jamdown received:', got.includes('jamdown'));
await shot('jam-after.png');
clearInterval(keep);
console.log('errors:', errors.length ? errors.slice(0, 3).join('\n') : 'none');
process.exit(0);
