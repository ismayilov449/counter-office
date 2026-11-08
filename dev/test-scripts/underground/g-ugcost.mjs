// Draw calls a frame in the views the vents show, in the real game (headless Edge on CDP_PORT, server on GAME_PORT with
// BOTS=0; the map is the server's). One CT alone (warmup). Counts every WebGL draw per frame (min / median / max over
// 40 frames, as integration/gviews.mjs) looking at each of the six grilles from a few metres, and in gviews' kitchen
// and cellar views; a screenshot of each (OUT, prefix PREFIX). Run it against this branch's server and main's (the
// same views) and compare the medians.
import { open, sleep } from '../mansion/game.mjs';
const PREFIX = process.env.PREFIX || 'uc';
const g = await open('CT', 'Viewer', ['round', 'msg']);
await g.cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 8 && !(await g.ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await g.ev('document.querySelector(\'#join .team-btn[data-team="CT"]\').click(), 1'); await sleep(1500);
}
await g.ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
await sleep(3000);
await g.ev(`(() => {
  window.__dc = { n: 0, frames: [] };
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const o = C.prototype[f]; if (o) C.prototype[f] = function (...a) { window.__dc.n++; return o.apply(this, a); };
  }
  const tick = () => { __dc.frames.push(__dc.n); __dc.n = 0; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return 1;
})()`);
const measure = async () => JSON.parse(await g.ev(`(async () => {
  await new Promise(r => setTimeout(r, 600)); __dc.frames.length = 0;
  while (__dc.frames.length < 42) await new Promise(r => setTimeout(r, 100));
  const f = __dc.frames.slice(2).sort((a, b) => a - b);
  // (two kinds of frame: the light ones, and the ones that redraw the shadow maps as well: each kind's median)
  const mid = (f[0] + f[f.length - 1]) / 2, lo = f.filter(v => v <= mid), hi = f.filter(v => v > mid);
  return JSON.stringify({ min: f[0], med: f[f.length >> 1], max: f[f.length - 1], light: lo[lo.length >> 1], shadow: hi.length ? hi[hi.length >> 1] : null });
})()`));
const VIEWS = [ // [name, feet, yaw, pitch]
  ['grille0', [-21.2, -2.2, 1.5], Math.PI / 2, 0.42], ['grille1', [-26.0, 0, 1.5], -Math.PI / 2, -0.52],
  ['grille2', [-20.05, 0.813, -8.9], 0, 0.72], ['grille3', [-18.35, 4.267, -9.3], 0, -0.85],
  ['grille4', [-9.35, 0.813, -12.8], Math.PI, 0.72], ['grille5', [-7.75, 4.267, -12.5], Math.PI, -0.85],
  ['kitchen', [-17.5, 0.81, -11.5], 0, 0], ['cellar', [-15.5, -2.2, 0.5], Math.PI / 2, 0],
];
const res = {};
for (const [name, p, yaw, pitch] of VIEWS) {
  await g.tp(p, yaw, 0); if (pitch) await g.look(0, pitch);
  await sleep(2500);
  res[name] = await measure();
  await g.shot(`${PREFIX}_${name}.png`);
  console.log(`${name.padEnd(8)} draws/frame: light frames ${res[name].light}, shadow frames ${res[name].shadow} (min ${res[name].min}, max ${res[name].max})`);
  // AB=1 (this branch): the same view with the grilles' mesh hidden, right after
  if (process.env.AB) {
    await g.ev('import("/js/underground.js").then(m => { m.debug().mesh.visible = false; return 1; })');
    const off = await measure();
    await g.ev('import("/js/underground.js").then(m => { m.debug().mesh.visible = true; return 1; })');
    console.log(`${''.padEnd(8)} grilles hidden: light frames ${off.light}, shadow frames ${off.shadow}: the grilles cost ${res[name].light - off.light} / ${res[name].shadow - off.shadow}`);
    res[name].hidden = off;
  }
}
console.log('page errors:', g.errors.length ? g.errors.join(' | ') : 'none');
console.log('RESULT ' + JSON.stringify(res));
await g.ev('__ws.close(), 1');
g.cdp.close();
process.exit(0);
