// Shared CDP helpers for the t-weapons tests (Edge on CDP_PORT, game on GAME_PORT; defaults 9333 and 3999).
import fs from 'node:fs';
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default; // Node 20 has no global WebSocket
export const OUT = (process.env.OUT || (await import('node:os')).tmpdir() + '/co-test') + '/tw-shots';
fs.mkdirSync(OUT, { recursive: true });
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function open(team = 'T', name = 'Tester', keep = ['rocket', 'boom', 'brk', 'satchels', 'msg', 'me']) {
  // one tab, reused (the page's leave-site prompt is switched off below, so navigating again never hangs)
  const page = (await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9333}/json/list`)).json()).find(t => t.type === 'page');
  const cdp = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => (cdp.onopen = r));
  let id = 0; const pending = new Map(); const errors = [];
  cdp.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Page.javascriptDialogOpening') cdp.send(JSON.stringify({ id: 99999, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console: ' + m.params.args.map(a => a.value ?? a.description).join(' ')); };
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); cdp.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
  const shot = async n => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + '/' + n, Buffer.from(r.result.data, 'base64')); };
  await cmd('Runtime.enable'); await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
    const ael = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (k, ...a) { if (k !== 'beforeunload') return ael.call(this, k, ...a); };
    window.__in = []; window.__keep = ${JSON.stringify(keep)};
    const send0 = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) { window.__ws = this; return send0.call(this, d); };
    const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return desc.get.call(this); },
      set(fn) { desc.set.call(this, e => { try { const m = JSON.parse(e.data); if (__keep.includes(m.t)) __in.push(m); } catch {} fn(e); }); } });
  ` });
  await cmd('Page.navigate', { url: `http://localhost:${process.env.GAME_PORT || 3999}/` });
  for (let i = 0; i < 60; i++) { await sleep(500); if (/Connected/.test(await ev("document.getElementById('conn-status')?.textContent") || '')) break; }
  await ev(`document.getElementById('name').value = '${name}'; document.querySelector('#join .team-btn[data-team="${team}"]').click(); 'ok'`);
  await sleep(3000);
  await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
  const mouse = (type, o) => ev(`document.dispatchEvent(new MouseEvent('${type}', ${JSON.stringify(o)})), 1`);
  const click = async (button = 0, hold = 300) => { await mouse('mousedown', { button }); await sleep(hold); await mouse('mouseup', { button }); };
  const key = async (code, hold = 60) => { const k = { key: code.slice(-1), code, windowsVirtualKeyCode: code.charCodeAt(code.length - 1) };
    await cmd('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await sleep(hold); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); };
  const send = m => ev(`__ws.send(${JSON.stringify(JSON.stringify(m))}), 1`);
  const msgs = async (clear = true) => { const r = JSON.parse(await ev('JSON.stringify(__in)')); if (clear) await ev('__in.length = 0, 1'); return r; };
  return { cdp, cmd, ev, shot, mouse, click, key, send, msgs, errors };
}

// A second, plain WebSocket player (no browser): joins a team and gets the messages.
export async function bot(team, name) {
  const ws = new WebSocket(`ws://127.0.0.1:${process.env.GAME_PORT || 3999}/ws`);
  const inbox = [];
  ws.onmessage = e => { try { inbox.push(JSON.parse(e.data)); } catch {} };
  await new Promise(r => (ws.onopen = r));
  const send = m => ws.send(JSON.stringify(m));
  return { ws, inbox, send };
}
