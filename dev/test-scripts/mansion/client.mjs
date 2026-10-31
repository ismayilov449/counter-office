// A scripted test player over the game's WebSocket (server on GAME_PORT, default 3999). The server trusts the client's position,
// so a test can stand anywhere: c.at([x, y, z]) moves there.
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default; // Node 20 has no global WebSocket
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function player(name, team, port = +(process.env.GAME_PORT || 3999)) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const c = { ws, log: [], sq: 0, p: null, yaw: 0, me: null, alive: false, on: {} };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    c.log.push(m);
    if (m.t === 'spawn') { c.sq = m.sq; c.p = m.p; c.alive = true; }
    if (m.t === 'me') { c.me = m; c.alive = m.alive; }
    c.on[m.t]?.(m);
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  c.send = m => ws.send(JSON.stringify(m));
  c.send({ t: 'join', name, team });
  for (let i = 0; i < 50 && !c.alive; i++) await sleep(100);
  c.at = (p, yaw = c.yaw, pitch = 0, crouch = 0) => { c.p = p; c.yaw = yaw; c.send({ t: 'state', sq: c.sq, p, yaw, pitch, c: crouch, w: c.w || 'knife' }); };
  c.use = (on = true) => c.send({ t: 'use', on });
  c.got = t => c.log.filter(m => m.t === t);
  c.clear = () => { c.log.length = 0; };
  // keep sending the position (the server keeps the last one; this keeps it fresh)
  c.timer = setInterval(() => { if (c.p && c.alive) c.send({ t: 'state', sq: c.sq, p: c.p, yaw: c.yaw, pitch: 0, c: 0, w: c.w || 'knife' }); }, 100);
  c.close = () => { clearInterval(c.timer); ws.close(); };
  return c;
}
// Admin action (password testpass)
export async function admin(action, port = +(process.env.GAME_PORT || 3999)) {
  const r = await fetch(`http://127.0.0.1:${port}/api/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'testpass', ...action }) });
  return r.json();
}
