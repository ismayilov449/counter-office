// Bot navigation off the main thread, so the game never waits for it. The same script runs as two workers:
//   builder:    { t: 'build', id }  -> { t: 'built', id, data } (see buildNavData in nav.js) or { t: 'built', id, error }
//   pathfinder: { t: 'nav', id, data } stores a map's grid; { t: 'path', req, id, from, to, standing }
//               -> { t: 'path', req, pts } with the smoothed waypoints ({ p, jump, ladder, n }) or pts: null
import { parentPort } from 'worker_threads';
import { MAPS } from '../shared/maps/index.js';
import { CollisionWorld } from '../shared/collision.js';
import { buildNavData, navBuffers, navFrom, smoothPath } from './nav.js';

const navs = new Map(), worlds = new Map();
const stats = { n: 0, fail: 0, ms: 0, failMs: 0, why: {} };
if (process.env.DEBUG_TICK) setInterval(() => { if (stats.n) console.log(`  [paths] ${stats.n} in 10 s, ${stats.fail} failed, ${stats.ms.toFixed(0)} ms (${stats.failMs.toFixed(0)} ms failing)`, JSON.stringify(stats.why)); Object.assign(stats, { n: 0, fail: 0, ms: 0, failMs: 0, why: {} }); }, 10000).unref();

parentPort.on('message', m => {
  if (m.t === 'build') {
    try {
      const map = MAPS[m.id];
      const data = buildNavData(map, new CollisionWorld(map));
      parentPort.postMessage({ t: 'built', id: m.id, data }, navBuffers(data));
    } catch (e) {
      parentPort.postMessage({ t: 'built', id: m.id, error: String(e?.stack || e) });
    }
  } else if (m.t === 'nav') {
    navs.set(m.id, navFrom(m.data));
    worlds.set(m.id, new CollisionWorld(MAPS[m.id]));
  } else if (m.t === 'path') {
    const nav = navs.get(m.id);
    const t0 = performance.now();
    const nodes = nav ? nav.path(m.from, m.to, m.standing) : null;
    const ms = performance.now() - t0;
    stats.n++; stats.ms += ms; stats.why[m.why] = (stats.why[m.why] || 0) + 1;
    if (!nodes) { stats.fail++; stats.failMs += ms; }
    const pts = nodes ? smoothPath(nav, nodes, worlds.get(m.id)).map(w => ({ p: w.p, jump: w.jump, n: w.n, ladder: !!w.ladder })) : null;
    parentPort.postMessage({ t: 'path', req: m.req, pts });
  }
});
