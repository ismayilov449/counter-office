// A scripted player for the cat's tests (like ../mansion/client.mjs, but it keeps its crouch when it refreshes its
// position, and it records the cat from every snapshot). Server on GAME_PORT (default 4060).
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default; // Node 20 has no global WebSocket
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const STATE = ['sit', 'walk', 'trot', 'run', 'wash', 'stretch', 'hide', 'air', 'sleep', 'loaf'];
export async function player(name, team, port = +(process.env.GAME_PORT || 4060)) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const c = { ws, log: [], sq: 0, p: null, yaw: 0, crouch: 0, me: null, alive: false, on: {}, cat: null, cats: [], meows: [] };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 's') {
      if (m.cat) { c.cat = { p: m.cat.slice(0, 3), yaw: m.cat[3], state: STATE[m.cat[4]], purr: m.cat[5], time: m.time }; c.cats.push(c.cat); if (c.cats.length > 4000) c.cats.shift(); }
      else c.cat = null;
      c.phase = m.ph;
    } else c.log.push(m);
    if (m.t === 'catMeow') c.meows.push({ ...m, at: Date.now() });
    if (m.t === 'spawn') { c.sq = m.sq; c.p = m.p; c.alive = true; }
    if (m.t === 'me') { c.me = m; c.alive = m.alive; }
    c.on[m.t]?.(m);
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  c.send = m => ws.send(JSON.stringify(m));
  c.send({ t: 'join', name, team });
  for (let i = 0; i < 50 && !c.alive; i++) await sleep(100);
  c.state = () => c.send({ t: 'state', sq: c.sq, p: c.p, yaw: c.yaw, pitch: 0, c: c.crouch, w: c.w || 'knife' });
  c.at = (p, yaw = c.yaw, crouch = c.crouch) => { c.p = p; c.yaw = yaw; c.crouch = crouch; c.state(); };
  c.got = t => c.log.filter(m => m.t === t);
  c.clear = () => { c.log.length = 0; c.meows.length = 0; };
  c.timer = setInterval(() => { if (c.p && c.alive) c.state(); }, 100);
  c.close = () => { clearInterval(c.timer); ws.close(); };
  // aim and shoot (o: the eye, at: the point aimed at)
  c.shoot = (o, at, w = 'usp') => { const d = at.map((v, i) => v - o[i]), l = Math.hypot(...d); c.send({ t: 'shoot', o, d: d.map(v => v / l), w, rt: 0 }); };
  return c;
}
export const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// wait until cond() (checked every 100 ms) or the time runs out; returns whether it happened
export async function until(cond, ms) {
  for (let t = 0; t < ms; t += 100) { if (cond()) return true; await sleep(100); }
  return !!cond();
}
