// Draw calls in the real game at the views the walls feature changes (headless Edge on CDP_PORT, server on GAME_PORT
// with BOTS=0 AUTO_BALANCE=0; the map is the server's). Counts every WebGL draw per frame (min / median / max over 40
// frames) at each view and takes a screenshot (OUT, prefix PREFIX). Run it against this branch and against main (the
// same views): on main (no public/js/walls.js) only the plain views are measured; on the branch the same views again
// after holes are shot in the hall's wall and the pipe and cable in the hall's south wall are hit (holes, a spray, a
// puddle, the cable's sparks).
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
const PREFIX = process.env.PREFIX || 'gc';
const g = await open('CT', 'Viewer', ['round', 'msg']);
await g.cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 6 && !(await g.ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await g.ev('document.querySelector(\'#join .team-btn[data-team="CT"]\').click(), 1'); await sleep(1500);
}
const t = await player('Parked', 'T');
for (let i = 0; i < 100 && !(JSON.parse(await g.ev('JSON.stringify(__in)')).some(m => m.t === 'round')); i++) await sleep(200);
t.at([-37.5, 0, 1.5], 0);
await sleep(4000);
const branch = await g.ev("import('/js/walls.js').then(() => true, () => false)");
console.log(branch ? 'this branch (walls)' : 'main (no walls)');
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
  return JSON.stringify({ min: f[0], med: f[f.length >> 1], max: f[f.length - 1] });
})()`));
const EYE = 1.62;
async function aim(from, target) {
  const e = [from[0], from[1] + EYE, from[2]], dx = target[0] - e[0], dy = target[1] - e[1], dz = target[2] - e[2];
  await g.tp(from, Math.atan2(-dx, -dz));
  await sleep(250);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  if (Math.abs(pitch) > 0.002) await g.look(0, pitch);
  await sleep(350);
}
const VIEWS = [
  ['hallwall', [-10, 0.813, -2.5], [-12.9, 2.2, -2.5]], // the hall's wall to the living room (the holes)
  ['hallsouth', [-9.6, 0.813, 3.6], [-7.8, 1.2, 6.4]], // the hall's south wall: the radiator, the pipe's spray and puddle
  ['kitchen', [-14.6, 0.813, -10.75], [-13.31, 1.2, -10.75]], // the kitchen's radiator
  ['living', [-16.0, 0.813, 0.5], [-13.31, 1.9, 0.5]], // the living room, looking east at the hall's wall
  ['street', [26.5, 0, 0.5], [-10, 2, 0.5]], // the street, looking at the house
];
const res = {};
async function round(tag) {
  for (const [name, from, to] of VIEWS) {
    await aim(from, to); await sleep(2500);
    const r = res[name + tag] = await measure();
    await g.shot(`${PREFIX}_${name}${tag}.png`);
    console.log(`${(name + tag).padEnd(16)} draws/frame min ${r.min} median ${r.med} max ${r.max}`);
  }
}
await round('');
// the same shots on both builds (on main they leave the usual bullet decals; here holes, a spray, a puddle, sparks):
// at the hall's wall, at the pipe and at the cable in the hall's south wall
await g.key('Digit2'); await sleep(600); // (the pistol: 12 shots, one a click)
await aim([-10, 0.813, -2.5], [-12.9, 2.43, -2.5]);
for (let i = 0; i < 8; i++) { await g.click(0, 500); await sleep(300); await aim([-10, 0.813, -2.5], [-12.9, 2.43 + (i % 3 - 1) * 0.04, -2.5 + (i % 2 - 0.5) * 0.06]); }
await aim([-7.8, 0.813, 4.8], [-7.8, 1.66, 6.70]); await g.click(0, 500); await sleep(500);
await aim([-7.65, 0.813, 4.1], [-7.65, 1.11, 6.70]); await g.click(0, 500); await sleep(3000);
if (branch) console.log('made:', await g.ev("import('/js/walls.js').then(m => { const d = m.debug(); return JSON.stringify({ holes: d.holes, patches: d.patches, sprays: d.sprays, ends: d.ends }); })"));
await round('+shots');
console.log('page errors:', g.errors.length ? g.errors.join('\n') : 'none');
t.close();
process.exit(0);
