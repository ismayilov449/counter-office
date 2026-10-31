// Blood trails in the browser (test server on GAME_PORT: MAP=cs_mansion BOTS=0, fresh data; headless Edge on CDP_PORT).
// The browser is a CT ("Watcher"); a scripted T ("Runner") is shot by a scripted CT ("Shooter") and walks while he
// bleeds. 1. the cap (BLOOD.max) piled up in view, and the draw calls with the drops shown and hidden (one draw call);
// 2. the Runner's trail along the Mansion's street, then down the cellar stairs (the drops lie on the steps);
// 3. the Runner shoots the Watcher: the BLEEDING badge, his own drops as he walks, P bandages (bar, slow walking),
// the badge goes; 4. Dust II: a trail over the sand slope beside Long A, the drops tilted with it.
// Screenshots in OUT (gb_*.png), page errors printed.
import { open, sleep } from '../mansion/game.mjs';
import { player, admin } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { BLOOD } from '../../../shared/blood.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };

const g = await open('CT', 'Watcher', ['msg', 'bloodBandage', 'bloodKit']);
const { tp, shot, ev, errors, key, msgs } = g;
// a draw-call counter on the game's WebGL context, and a handle on the blood module's instance
const hook = async () => ev(`(async () => {
  const gl = document.querySelector('#game canvas').getContext('webgl2');
  window.__dc = 0; window.__fr = 0;
  if (!gl.__counted) {
    gl.__counted = true;
    for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const f = gl[k].bind(gl); gl[k] = (...a) => { window.__dc++; return f(...a); }; }
    (function loop() { window.__fr++; requestAnimationFrame(loop); })();
  }
  const { BloodTrails } = await import('/js/blood.js');
  if (!BloodTrails.__hooked) { BloodTrails.__hooked = true; const up = BloodTrails.prototype.update; BloodTrails.prototype.update = function (...a) { window.__bleed = this; return up.apply(this, a); }; }
  return 'ok';
})()`);
console.log('hooks:', await hook());
const dcPerFrame = async (ms = 4000) => {
  const a = JSON.parse(await ev('JSON.stringify([__dc, __fr])'));
  await sleep(ms);
  const b = JSON.parse(await ev('JSON.stringify([__dc, __fr])'));
  return { dc: (b[0] - a[0]) / (b[1] - a[1]), fps: (b[1] - a[1]) / (ms / 1000) };
};
const drops = () => ev('__bleed ? __bleed.count : -1');

const runner = await player('Runner', 'T'), shooter = await player('Shooter', 'CT');
let phase = null;
runner.on.s = m => { phase = m.ph; };
const live = async () => { for (let i = 0; i < 300 && phase !== 'live'; i++) await sleep(100); await sleep(300); };
let coll = new CollisionWorld(MAPS.cs_mansion);
const floorY = (x, z, hint) => { const h = coll.raycast([x, hint + 0.6, z], [0, -1, 0], 3, 'solid'); return h ? +(hint + 0.6 - h.t).toFixed(3) : hint; };
const dirTo = (o, p) => { const d = p.map((v, i) => v - o[i]), l = Math.hypot(...d); return d.map(v => v / l); };
// the shooter steps up 3 m north of the runner and shoots him once in the chest; true if it hurt him
const wound = async () => {
  const p = runner.p, at = [p[0], floorY(p[0], p[2] - 3, p[1]), p[2] - 3];
  shooter.at(at, Math.PI); await sleep(600);
  runner.clear();
  const o = [at[0], at[1] + 1.62, at[2]];
  shooter.send({ t: 'shoot', o, d: dirTo(o, [p[0], p[1] + 1.2, p[2]]), w: 'usp' });
  await sleep(400);
  shooter.at([p[0], -30, p[2] + 40]); // out of the way
  return runner.got('dmg').at(-1)?.hp;
};
// walk the runner through points (x, z), on the floor, ~4 m/s
const walk = async (c, pts, y0) => {
  let y = y0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
    for (let k = 1; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      y = floorY(x, z, y);
      c.at([x, y, z], Math.atan2(-(bx - ax), -(bz - az)));
      await sleep(65);
    }
  }
  return y;
};
const matrices = from => ev(`JSON.stringify((() => { const m = new __bleed.mesh.matrix.constructor(), out = []; for (let i = ${from}; i < __bleed.count; i++) { __bleed.mesh.getMatrixAt(i, m); const e = m.elements; out.push([e[12], e[13], e[14], e[8], e[9], e[10]].map(v => +v.toFixed(3))); } return out; })())`).then(JSON.parse);

await live();
await hook();
// ---- 1. the cap piled up in front of the watcher (in the street), draw calls with them shown and hidden
await tp([27, 0, 1], 0, -0.3);
runner.at([-22, 4.27, -9]); shooter.at([-22, 4.27, 9]);
await sleep(1200);
await ev(`(() => { for (let i = 0; i < ${BLOOD.max + 150}; i++) __bleed.drip([25.5 + Math.random() * 3, 0, -8 + Math.random() * 6], 1 + (i % 3)); return __bleed.count; })()`);
await sleep(800);
const nCap = await drops();
ok(`the drops stop at the cap: ${nCap} (max ${BLOOD.max})`, nCap === BLOOD.max);
await shot('gb_cap.png');
const shown1 = await dcPerFrame();
await ev('__bleed.mesh.visible = false, 1');
const hidden = await dcPerFrame();
await ev('__bleed.mesh.visible = true, 1');
const shown2 = await dcPerFrame();
const extra = (shown1.dc + shown2.dc) / 2 - hidden.dc;
ok(`draw calls: ${hidden.dc.toFixed(2)} without the drops, ${shown1.dc.toFixed(2)} / ${shown2.dc.toFixed(2)} with ${nCap} of them: +${extra.toFixed(2)} (fps ${hidden.fps.toFixed(1)})`, extra > 0.5 && extra < 1.5);
await ev('__bleed.clear(), 1');

// ---- 2. the runner's trail along the street, then down the cellar stairs
runner.at([26.5, 0, -14], Math.PI); await sleep(700);
const hpS = await wound();
ok(`the runner bleeds (hp ${hpS})`, hpS < 100);
const street = [];
for (let z = -14; z <= -2.01; z += 0.5) street.push([27 + Math.sin(z * 0.6) * 1.0, z]);
await walk(runner, street, 0);
runner.at([-22, 4.27, -9]);
await sleep(800);
const nStreet = await drops();
ok(`drops along the street: ${nStreet} (12 m)`, nStreet >= 12);
await shot('gb_street.png');
const flatOk = (await matrices(0)).every(([x, y, z, nx, ny, nz]) => Math.abs(y - 0.01) < 0.02 && ny > 0.999);
ok('they lie flat on the street', flatOk);
runner.at([-14.4, 0.81, -10.4], Math.PI); await sleep(400);
await tp([-14.4, 0.81, -11.2], Math.PI, -0.95);
const stairs = [];
for (let z = -10.4; z <= -4.0; z += 0.4) stairs.push([-14.4 + Math.sin(z * 2) * 0.25, z]);
const yEnd = await walk(runner, stairs, 0.81);
runner.at([-18, yEnd, -1]); // on into the cellar, out of sight
await sleep(800);
const nStairs = (await drops()) - nStreet;
ok(`drops down the stairs: ${nStairs} (runner ended at y ${yEnd})`, nStairs >= 6);
await shot('gb_stairs.png');
const onSteps = await matrices(nStreet);
const bad = onSteps.filter(([x, y, z]) => Math.abs(floorY(x, z, y + 0.1) + 0.01 - y) > 0.05);
ok(`stair drops lie on the steps (${onSteps.length} checked, ${bad.length} off by > 5 cm${bad.length ? ': ' + JSON.stringify(bad.slice(0, 3)) : ''})`, onSteps.length > 0 && bad.length === 0);

// ---- 3. the watcher bleeds: badge, own drops, P bandages
await tp([27, 0, -2], Math.PI, 0);
runner.at([27, 0, -6], 0); await sleep(800);
await msgs();
{
  const o = [27, 1.62, -6];
  runner.send({ t: 'shoot', o, d: dirTo(o, [27, 1.0, -2]), w: runner.me?.inv?.secondary?.id || 'glock' });
}
await sleep(600);
runner.at([-22, 4.27, -9]);
const badge = await ev("(() => { const b = document.getElementById('bleed-badge'); return b && !b.classList.contains('hidden') ? b.textContent : ''; })()");
ok(`the watcher bleeds: badge "${badge}"`, /BLEEDING/.test(badge));
await shot('gb_badge.png');
const n0 = await drops();
for (let i = 1; i <= 16; i++) { await tp([27, 0, -2 + i * 0.3], Math.PI, 0); await sleep(120); }
await sleep(400);
const own = (await drops()) - n0;
ok(`his own drops as he walks: ${own}`, own >= 4);
await key('KeyP');
await sleep(500);
const bar = await ev("[...document.querySelectorAll('#hud > div')].some(d => !d.classList.contains('hidden') && /Bandaging/.test(d.textContent))");
const mul = await ev('__bleed.speedMul()');
const got = await msgs(false);
ok(`P: bandaging (bar ${bar}, walking speed x${mul}, ${JSON.stringify(got.filter(m => m.t === 'bloodBandage'))})`, bar && mul === BLOOD.slow && got.some(m => m.t === 'bloodBandage' && m.s === 'start'));
await shot('gb_bandaging.png');
await sleep(BLOOD.bandage * 1000 + 600);
const after = await ev("(() => { const b = document.getElementById('bleed-badge'); return b.classList.contains('hidden') ? 'hidden' : b.textContent; })()");
const mul2 = await ev('__bleed.speedMul()');
ok(`bandaged: badge ${after}, speed x${mul2}`, after === 'hidden' && mul2 === 1);
await tp([27, 0, 4], 0, -0.35);
await sleep(800);
await shot('gb_ownTrail.png');

// ---- 4. Dust II: the sand slope beside Long A
await admin({ action: 'map', map: 'de_dust2' });
coll = new CollisionWorld(MAPS.de_dust2);
phase = null;
await sleep(4000);
await live();
await hook();
ok(`a new map: no drops (${await drops()})`, (await drops()) === 0);
const y0 = floorY(52, -16, 4.5);
runner.at([52, y0, -16], 0); await sleep(700);
const hpD = await wound();
ok(`the runner bleeds on Dust II (hp ${hpD})`, hpD < 100);
const sand = [];
for (let z = -16; z >= -28.01; z -= 0.5) sand.push([52 + Math.sin(z * 0.6) * 1.5, z]);
await walk(runner, sand, y0);
runner.at([30, 0.1, -33]);
await tp([46.5, floorY(46.5, -22, 3.5), -22], -Math.PI / 2, -0.4);
await sleep(1200);
const nSand = await drops();
ok(`drops on the sand slope: ${nSand}`, nSand >= 15);
await shot('gb_dust2.png');
const tilted = (await matrices(0)).filter(([x, y, z, nx, ny]) => ny < 0.995).length;
ok(`drops lying tilted on the slope: ${tilted} of ${nSand}`, tilted >= 5);
await tp([50.2, floorY(50.2, -22, 3.5), -21], -Math.PI / 2, -0.85);
await sleep(1000);
await shot('gb_dust2_close.png');

console.log('page errors:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
ok('no page errors', !errors.length);
runner.close(); shooter.close();
process.exit();
