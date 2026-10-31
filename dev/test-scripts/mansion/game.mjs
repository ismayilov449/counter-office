// The real game in the headless Edge (CDP_PORT, default 9333) against the test server (GAME_PORT, default 3999):
// joins a team, fakes pointer lock, and can put the player anywhere (tp: a fake 'spawn' message with the real spawn
// number, so the server takes the new position), look around, press keys, click, take screenshots, and collect page
// errors and the server's messages of the kinds in `keep`.
import fs from 'node:fs';
import os from 'node:os';
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default; // Node 20 has no global WebSocket
export const OUT = process.env.OUT || os.tmpdir() + '/co-test/shots';
fs.mkdirSync(OUT, { recursive: true });
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const GAME = process.env.GAME_PORT || 3999, CDP = process.env.CDP_PORT || 9333;

export async function open(team = 'T', name = 'Tester', keep = ['msg', 'doors', 'drive', 'exited', 'boom', 'brk']) {
  const page = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find(t => t.type === 'page');
  const cdp = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => (cdp.onopen = r));
  let id = 0; const pending = new Map(); const errors = [];
  cdp.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Page.javascriptDialogOpening') cdp.send(JSON.stringify({ id: 99999, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  };
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); cdp.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
  const shot = async n => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); const f = OUT + '/' + n; fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); return f; };
  await cmd('Runtime.enable'); await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
    const ael = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (k, ...a) { if (k !== 'beforeunload') return ael.call(this, k, ...a); };
    window.__in = []; window.__keep = ${JSON.stringify(keep)}; window.__sq = 0;
    const send0 = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) { window.__ws = this; return send0.call(this, d); };
    const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return desc.get.call(this); },
      set(fn) { window.__onmsg = fn; desc.set.call(this, e => { try { const m = JSON.parse(e.data); if (m.t === 'spawn') __sq = m.sq; if (__keep.includes(m.t)) __in.push(m); } catch {} fn(e); }); } });
  ` });
  await cmd('Page.navigate', { url: `http://localhost:${GAME}/?nocache=${Date.now()}` });
  for (let i = 0; i < 80; i++) { await sleep(500); if (/Connected/.test(await ev("document.getElementById('conn-status')?.textContent") || '')) break; }
  await ev(`document.getElementById('name').value = '${name}'; document.querySelector('#join .team-btn[data-team="${team}"]').click(); 'ok'`);
  await sleep(3500);
  await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
  const mouse = (type, o) => ev(`document.dispatchEvent(new MouseEvent('${type}', ${JSON.stringify(o)})), 1`);
  const click = async (button = 0, hold = 300) => { await mouse('mousedown', { button }); await sleep(hold); await mouse('mouseup', { button }); };
  const keyDown = code => cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: code.slice(-1), code, windowsVirtualKeyCode: code.charCodeAt(code.length - 1) });
  const keyUp = code => cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: code.slice(-1), code, windowsVirtualKeyCode: code.charCodeAt(code.length - 1) });
  const key = async (code, hold = 60) => { await keyDown(code); await sleep(hold); await keyUp(code); };
  const send = m => ev(`__ws.send(${JSON.stringify(JSON.stringify(m))}), 1`);
  const msgs = async (clear = true) => { const r = JSON.parse(await ev('JSON.stringify(__in)')); if (clear) await ev('__in.length = 0, 1'); return r; };
  // stand at p looking along yaw (0: north, -z), then tilt the view by pitch (radians, up +) with the mouse
  const tp = async (p, yaw = 0, pitch = 0) => {
    await ev(`__onmsg({ data: JSON.stringify({ t: 'spawn', p: ${JSON.stringify(p)}, yaw: ${yaw}, sq: __sq }) }), 1`);
    await sleep(150);
    if (pitch) await look(0, pitch);
  };
  // turn by dyaw / dpitch radians (the default sensitivity: ~0.0022 rad a pixel; read it from the page if set)
  const look = async (dyaw, dpitch) => {
    const k = 0.0022 * (+(await ev("JSON.parse(localStorage.getItem('settings') || '{}').sens || 1")) || 1);
    await mouse('mousemove', { movementX: Math.round(-dyaw / k), movementY: Math.round(-dpitch / k) });
  };
  return { cdp, cmd, ev, shot, mouse, click, key, keyDown, keyUp, send, msgs, tp, look, errors };
}
