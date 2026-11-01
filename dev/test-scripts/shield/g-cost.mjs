// What the human shield costs to draw, in the browser (GAME_PORT fresh test server with BOTS=0 ROUND_TIME=600,
// CDP_PORT headless Edge; MAP= as the server's). The page is a CT 3.5 m in front of hostage 3 in the living room; a
// scripted Terrorist stands behind it. WebGL draw calls and vertices per frame, and the frame time, are counted for
// 4 s with the hostage waiting, then for 4 s after the T presses E (held, on this branch; on main nothing happens, so
// run it against a server of main's code for the comparison). Prints one line per state.
import { open, sleep } from '../mansion/game.mjs';
import { player, admin } from '../mansion/client.mjs';
const until = async (cond, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await cond()) return true; await sleep(50); } return !!(await cond()); };
const F = 0.82, T = [-20.5, F, 9.4], FRONT = [-20.5, F, 5.9];
const [VW, VH] = (process.env.VIEW || '960x540').split('x').map(Number);
const g = await open('CT', 'Viewer', ['shieldGrab']);
for (let i = 0; i < 60 && !(await g.ev("document.getElementById('join').classList.contains('hidden')")); i++) {
  await g.ev(`(b => { if (b && !b.disabled) b.click(); })(document.querySelector('#join .team-btn[data-team="CT"]')), 1`);
  await sleep(500);
}
await sleep(1000);
await g.ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
await g.cmd('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
const t = await player('Taker', 'T');
t.on.s = m => { t.snap = m; };
await admin({ action: 'restart' });
await until(() => t.snap?.ph === 'freeze', 8000);
await until(() => t.snap?.ph === 'live', 15000);
await sleep(300);
t.w = 'glock';
t.at(T, 0);
const d = [T[0] - FRONT[0], T[1] + 1.2 - FRONT[1] - 1.62, T[2] - FRONT[2]];
await g.tp(FRONT, Math.atan2(-d[0], -d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2])));
// count draw calls and vertices (WebGL2), and frames
await g.ev(`(() => { const P = WebGL2RenderingContext.prototype; window.__dc = { calls: 0, verts: 0, frames: 0, ms: 0 };
  const wrap = (f, n) => { const o = P[f]; if (!o || o.__w) return; P[f] = function () { __dc.calls++; __dc.verts += n(arguments); return o.apply(this, arguments); }; P[f].__w = 1; };
  wrap('drawElements', a => a[1]); wrap('drawArrays', a => a[2]); wrap('drawElementsInstanced', a => a[1] * a[4]);
  wrap('drawArraysInstanced', a => a[2] * a[3]); wrap('drawRangeElements', a => a[3]);
  (function f(t0) { requestAnimationFrame(t => { __dc.frames++; __dc.ms += t - t0; f(t); }); })(performance.now());
  return 1; })()`);
const measure = async label => {
  await sleep(1500);
  await g.ev('__dc.calls = __dc.verts = __dc.frames = __dc.ms = 0, 1');
  await sleep(4000);
  const r = JSON.parse(await g.ev('JSON.stringify(__dc)'));
  console.log(`${label.padEnd(18)} ${(r.calls / r.frames).toFixed(1)} draw calls/frame, ${Math.round(r.verts / r.frames)} vertices/frame, ${(r.ms / r.frames).toFixed(1)} ms/frame (${r.frames} frames)`);
};
await measure('hostage waiting');
await g.msgs();
t.use(); await sleep(100); t.use(false); await sleep(500);
const held = (await g.msgs()).some(m => m.t === 'shieldGrab');
await measure(held ? 'hostage held' : 'after E (no hold)');
await g.shot(`cost_${process.env.LABEL || 'run'}.png`);
console.log('errors:', g.errors.length ? g.errors.slice(0, 3).join('\n') : 'none');
t.close();
process.exit();
