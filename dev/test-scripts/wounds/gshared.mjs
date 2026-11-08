// Shared bits of the wounds browser tests (g1.mjs, g2.mjs): the page (game.mjs's open, the join retried on a cold page,
// a 960x540 page), the game's own clock (headless draws a few frames a second and main.js caps a step at 0.05 s), the
// scene's instanced meshes (the blood drops), and the radar's pixels.
import { open, sleep } from '../mansion/game.mjs';
export { sleep };
export const MAP_ID = process.env.MAP || 'cs_mansion';
let fails = 0, count = 0;
export const ok = (what, cond) => { count++; console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) { fails++; process.exitCode = 1; } };
export const summary = () => console.log(`\n${count - fails}/${count} OK`);
export const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 60; i++) { if (await cond()) return true; await sleep(60); } return !!(await cond()); };
export const KEEP = ['msg', 'round', 'roundEnd', 'bodyDown', 'bodyUp', 'bodyKill', 'kill', 'spawn', 'wdWounds', 'wdReveal', 'wdTalked', 'wdShot', 'bloodBandage', 'me'];

export async function page(team, name = 'Tester') {
  const g = await open(team, name, KEEP);
  for (let i = 0; i < 60 && !(await g.ev("document.getElementById('join').classList.contains('hidden')")); i++) {
    await g.ev(`(b => { if (b && !b.disabled) b.click(); })(document.querySelector('#join .team-btn[data-team="${team}"]')), 1`);
    await sleep(500);
  }
  await sleep(1000);
  await g.ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
  await g.cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
  // the game's clock, the scenes (for the blood drops), frame times
  await g.ev(`(async () => {
    const THREE = await import('three');
    window.__scenes = new Set();
    const umw = THREE.Object3D.prototype.updateMatrixWorld;
    THREE.Object3D.prototype.updateMatrixWorld = function (f) { if (this.isScene) window.__scenes.add(this); return umw.call(this, f); };
    window.__inst = () => { const a = []; for (const s of __scenes) s.traverse(o => { if (o.isInstancedMesh) a.push(o.count); }); return a; };
    window.__gt = 0; window.__frames = [];
    (function f(t0) { requestAnimationFrame(t => { __gt += Math.min(0.05, (t - t0) / 1000); __frames.push(t - t0); if (__frames.length > 400) __frames.shift(); f(t); }); })(performance.now());
    return 1;
  })()`);
  g.text = id => g.ev(`document.getElementById('${id}')?.textContent || ''`);
  g.gt = () => g.ev('window.__gt');
  // the progress bar's words, only while it shows (hidden, it keeps its last words)
  g.bar = () => g.ev("document.getElementById('progress').classList.contains('hidden') ? '' : document.getElementById('progress-label').textContent");
  g.seen = [];
  g.pull = async () => { g.seen = g.seen.concat(await g.msgs()); return g.seen; };
  g.has = async pred => (await g.pull()).some(pred);
  g.filter = () => g.ev("document.getElementById('game').style.filter || ''"); // (the blur: on #game, not the canvas)
  // yellow pixels (the interrogation's ring, #ffd030) on the radar within r px of the world point x, z
  g.radarYellow = (x, z, r = 12) => g.ev(`(async () => {
    const { MAPS } = await import('/shared/maps/index.js');
    const b = MAPS['${MAP_ID}'].bounds, s = 200 / (b.max - b.min), cx = (${x} - b.min) * s, cz = (${z} - b.min) * s;
    const d = document.getElementById('radar').getContext('2d').getImageData(Math.round(cx - ${r}), Math.round(cz - ${r}), ${2 * r}, ${2 * r}).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 170 && d[i + 1] < 235 && d[i + 2] < 110) n++;
    return n;
  })()`);
  return g;
}
