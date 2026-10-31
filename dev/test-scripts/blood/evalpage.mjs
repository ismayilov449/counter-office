// Evaluate an expression in the game page of the headless Edge on CDP_PORT (default 9420): node evalpage.mjs '<js>'
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default;
const list = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9420}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 1) { console.log(m.result?.result?.value ?? JSON.stringify(m.result)); process.exit(); } };
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: process.argv[2], returnByValue: true, awaitPromise: true } }));
