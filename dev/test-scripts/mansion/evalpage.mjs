// node evalpage.mjs "<js expr>" — evaluate in the headless page (port 9335), with a timeout
const list = await (await fetch('http://127.0.0.1:9335/json/list')).json();
console.log(list.map(t => t.type + ' ' + t.url).join('\n'));
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 1) { console.log(JSON.stringify(m.result).slice(0, 2000)); process.exit(0); } };
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: process.argv[2], returnByValue: true, awaitPromise: true } }));
setTimeout(() => { console.log('timeout'); process.exit(1); }, 8000);
