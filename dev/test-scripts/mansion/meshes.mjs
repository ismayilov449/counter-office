// Lists the meshes of the world built by viewer.js on the open test page (after views.mjs): how many of each kind
// (texture or colour, casting a shadow or not, triangles). Diff two runs to see what a change added.
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default; // Node 20 has no global WebSocket
const list = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9333}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 1) { console.log((m.result?.result?.value || []).join('\n')); process.exit(0); } };
const expr = `(() => {
  const out = {}; let n = 0;
  viewWorld.group.traverse(o => {
    if (!o.isMesh) return;
    n++;
    const g = o.geometry, tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const k = (o.material.map ? 'map' : '#' + o.material.color?.getHexString()) + (o.castShadow ? ' cast' : '') + ' tris ' + tris;
    out[k] = (out[k] || 0) + 1;
  });
  return [n + ' meshes', ...Object.entries(out).sort((a, b) => b[1] - a[1]).map(([k, v]) => v + ' x ' + k)];
})()`;
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
