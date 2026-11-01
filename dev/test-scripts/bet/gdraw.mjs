// The bet feature's cost in a frame (headless Edge on CDP_PORT 9480, server on GAME_PORT 4080, MAP=cs_mansion, BOTS=0):
// it adds no 3D objects, only page elements (the panel, the tracker, the chat lines). Counts the WebGL draw calls per
// frame and the frame time from the same spot in the living room with nothing open, with the tracker showing a bet,
// and with the panel open. Frames alternate between a light and a heavy kind (shadow maps are redrawn every few frames),
// so the mean depends on the mix: the check is that the light and the heavy frames cost exactly the same draws in each
// state. The frame time is only a rough look (swiftshader).
process.env.GAME_PORT ||= '4080'; process.env.CDP_PORT ||= '9480';
const { open, sleep } = await import('../mansion/game.mjs');
const { player } = await import('../mansion/client.mjs');
const g = await open('T', 'Rufat', ['betOk', 'round']);
await g.cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 6 && !(await g.ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await g.ev('document.querySelector(\'#join .team-btn[data-team="T"]\').click(), 1'); await sleep(1500);
}
await g.ev(`(() => {
  window.__dc = { n: 0, frames: [], times: [], last: performance.now() };
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const o = C.prototype[f]; if (o) C.prototype[f] = function (...a) { window.__dc.n++; return o.apply(this, a); };
  }
  const tick = t => { __dc.frames.push(__dc.n); __dc.n = 0; __dc.times.push(t - __dc.last); __dc.last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return 1;
})()`);
const measure = async label => {
  const r = JSON.parse(await g.ev(`(async () => {
    await new Promise(r => setTimeout(r, 500)); __dc.frames.length = 0; __dc.times.length = 0;
    while (__dc.frames.length < 42) await new Promise(r => setTimeout(r, 100));
    const f = __dc.frames.slice(2), t = __dc.times.slice(2).sort((a, b) => a - b);
    return JSON.stringify({ draws: f.reduce((a, b) => a + b, 0) / f.length, min: Math.min(...f), max: Math.max(...f), ms: t[t.length >> 1] });
  })()`));
  console.log(`${label.padEnd(26)} draws ${r.draws.toFixed(1)} (${r.min}-${r.max}), median frame ${r.ms.toFixed(0)} ms`);
  return r;
};
const carl = await player('Carl', 'CT');
for (let i = 0; i < 100 && !(JSON.parse(await g.ev('JSON.stringify(__in)')).some(m => m.t === 'round')); i++) await sleep(200);
carl.at([-37.5, 0, 1.5], 0);
await g.tp([-16.0, 0.91, 0.5], -Math.PI / 2, 0); // (the living room)
await sleep(1500);
const a = await measure('nothing open, no bet');
await g.key('F3'); await sleep(500);
const b = await measure('the bet panel open');
await g.key('Digit1'); await sleep(100); await g.key('Digit5'); await sleep(100);
for (const type of ['keyDown', 'keyUp']) { await g.cmd('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(50); }
await sleep(800);
const c = await measure('a bet on, the tracker');
const placed = JSON.parse(await g.ev('JSON.stringify(__in)')).some(m => m.t === 'betOk');
const same = (x, y) => x.min === y.min && x.max === y.max;
console.log(`bet placed: ${placed}; the light / heavy frames: ${a.min} / ${a.max} draws with nothing open, ${b.min} / ${b.max} with the panel, ${c.min} / ${c.max} with the tracker: ${same(a, b) && same(a, c) ? 'the same' : 'DIFFERENT'}`);
console.log('page errors:', g.errors.length ? g.errors.join(' | ') : 'none');
carl.close();
process.exit(placed && same(a, b) && same(a, c) && !g.errors.length ? 0 : 1);
