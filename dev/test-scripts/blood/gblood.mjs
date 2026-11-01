// Blood trails in the browser (test server on GAME_PORT: MAP=cs_mansion BOTS=0, fresh data; headless Edge on CDP_PORT).
// The browser is a CT ("Watcher"); a scripted T ("Runner") is shot by a scripted CT ("Shooter") and walks while he
// bleeds. 1. the cap (BLOOD.max) piled up in view, and the draw calls with the drops shown and hidden (one draw call);
// 2. the Runner's trail along the Mansion's street, then down the cellar stairs (the drops lie on the steps);
// 3. the Runner shoots the Watcher: the BLEEDING badge, his own drops as he walks, P bandages (bar, slow walking),
// the badge goes; 4. Mansion at night: a new map clears the drops, a trail over the house's sloped roof (the drops
// tilted with it) and along the street in the dark. Run it with CDP_PORT=9420 GAME_PORT=4020 (up.sh starts the server).
// Screenshots in OUT (gb_*.png), page errors printed.
import { open, sleep } from '../mansion/game.mjs';
import { player, admin } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { BLOOD } from '../../../shared/blood.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };

const g = await open('CT', 'Watcher', ['msg', 'bloodBandage', 'bloodKit']);
const { tp, shot, ev, errors, key, msgs } = g;
// SIZE=960x540: a smaller page than open()'s 1280x720 (lighter on the PC)
if (process.env.SIZE) { const [w, h] = process.env.SIZE.split('x').map(Number); await g.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); }
// a draw-call counter on the game's WebGL context, and a handle on the blood module's instance
const hook = async () => ev(`(async () => {
  const gl = document.querySelector('#game canvas').getContext('webgl2');
  window.__dc = 0; window.__fr = 0; window.__bdc = 0; window.__inBlood = false; window.__per = [];
  if (!gl.__counted) {
    gl.__counted = true;
    // every draw call, and those made while the blood mesh is being drawn (its onBeforeRender / onAfterRender)
    for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const f = gl[k].bind(gl); gl[k] = (...a) => { window.__dc++; if (window.__inBlood) window.__bdc++; return f(...a); }; }
    // shader programs linked (a link mid-game is a freeze)
    window.__links = 0; const link = gl.linkProgram.bind(gl); gl.linkProgram = p => { window.__links++; return link(p); };
    // (the draw calls of each frame: a frame's count varies with passes made only now and then, so the median is used)
    let last = 0;
    (function loop() { window.__fr++; if (window.__dc > last) { window.__per.push(window.__dc - last); if (window.__per.length > 400) window.__per.shift(); } last = window.__dc; requestAnimationFrame(loop); })();
  }
  const { BloodTrails } = await import('/js/blood.js');
  if (!BloodTrails.__hooked) { BloodTrails.__hooked = true; const up = BloodTrails.prototype.update; BloodTrails.prototype.update = function (...a) { window.__bleed = this; return up.apply(this, a); }; }
  return 'ok';
})()`);
console.log('hooks:', await hook());
// draw calls a frame (the median), the blood mesh's own draw calls a frame (exact), fps
const dcPerFrame = async (ms = 4000) => {
  await ev(`(() => { const m = __bleed.mesh; m.onBeforeRender = () => { window.__inBlood = true; }; m.onAfterRender = () => { window.__inBlood = false; }; __per.length = 0; return 1; })()`);
  const a = JSON.parse(await ev('JSON.stringify([__dc, __fr, __bdc])'));
  await sleep(ms);
  const b = JSON.parse(await ev('JSON.stringify([__dc, __fr, __bdc, __per.slice().sort((x, y) => x - y)])'));
  const per = b[3], frames = b[1] - a[1];
  return { dc: per.length ? per[per.length >> 1] : 0, mean: (b[0] - a[0]) / frames, own: (b[2] - a[2]) / frames, fps: frames / (ms / 1000) };
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
console.log(`     draw calls a frame (median; mean): ${hidden.dc} (${hidden.mean.toFixed(1)}) without the drops, ${shown1.dc} (${shown1.mean.toFixed(1)}) / ${shown2.dc} (${shown2.mean.toFixed(1)}) with ${nCap} of them: +${extra.toFixed(1)} (fps ${hidden.fps.toFixed(1)})`);
ok(`the drops' own draw calls a frame: ${shown1.own.toFixed(2)} / ${shown2.own.toFixed(2)} with ${nCap} of them, ${hidden.own.toFixed(2)} hidden`, Math.abs(shown1.own - 1) < 0.1 && Math.abs(shown2.own - 1) < 0.1 && hidden.own === 0);
// drying and fading: every drop made older (the shader works from each drop's birth time)
const age = s => ev(`(() => { const t = performance.now() / 1000 - ${s}; __bleed.born.array.fill(t); __bleed.born.needsUpdate = true; __bleed.lastBorn = t; return 1; })()`);
await age(20); await sleep(800); await shot('gb_cap_dry.png');
await age(BLOOD.life - BLOOD.fade / 2); await sleep(800); await shot('gb_cap_fading.png');
await age(BLOOD.life + 1); await sleep(800);
const goneN = await drops(), goneV = await ev('__bleed.mesh.visible');
ok(`all faded after ${BLOOD.life} s: ${goneN} drops, mesh visible ${goneV}`, goneN === 0 && goneV === false);
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
// (a drop whose middle is on a step's edge, within the positions' rounding, lies on the lower step: also checked 2 cm off)
const bad = onSteps.filter(([x, y, z]) => [0, 0.02, -0.02].every(dz => Math.abs(floorY(x, z + dz, y + 0.1) + 0.01 - y) > 0.05));
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
// the gun down (main.js lowers it by (drawUntil - now) / 600: more than 600 ms ahead swings it round into view)
const lead = await ev('__bleed.ctx.me.drawUntil - performance.now()');
ok(`the gun down while bandaging (${Math.round(lead)} ms ahead)`, lead > 0 && lead <= 600);
await shot('gb_bandaging.png');
await sleep(1150);
await shot('gb_bandaging_end.png'); // (the gun coming back up)
await sleep(BLOOD.bandage * 1000 + 600 - 1150);
const after = await ev("(() => { const b = document.getElementById('bleed-badge'); return b.classList.contains('hidden') ? 'hidden' : b.textContent; })()");
const mul2 = await ev('__bleed.speedMul()');
ok(`bandaged: badge ${after}, speed x${mul2}`, after === 'hidden' && mul2 === 1);
await tp([27, 0, 4], 0, -0.35);
await sleep(800);
await shot('gb_ownTrail.png');
// the P line at the end of the Esc menu's controls list
const pLine = await ev("[...document.querySelectorAll('#paused .controls > div')].at(-1)?.textContent");
await ev("document.getElementById('paused').classList.remove('hidden'), 1"); await sleep(400);
await shot('gb_esc.png');
await ev("document.getElementById('paused').classList.add('hidden'), 1");
ok(`the Esc menu's last control: "${pLine}"`, /^P bandage \(when bleeding\)$/.test(pLine || ''));

// ---- 4. Mansion at night: a new map clears the drops; a trail over the house's sloped roof, the drops tilted with it
await admin({ action: 'map', map: 'cs_mansion_night' });
coll = new CollisionWorld(MAPS.cs_mansion_night);
phase = null;
await sleep(4000);
await live();
await hook();
ok(`a new map: no drops (${await drops()})`, (await drops()) === 0);
// the map's first drop: its shader was compiled while the map loaded (prewarm), so no program is linked now
await tp([27, 0, 1], 0, -0.3); await sleep(1500);
const l0 = await ev('__links');
await ev('__bleed.drip([27, 0, -3], 2), 1'); await sleep(1000);
const l1 = await ev('__links');
ok(`the map's first drop links no shader program (${l1 - l0} linked, ${await drops()} drop)`, l1 === l0 && (await drops()) === 1);
await ev('__bleed.clear(), 1');
const y0 = floorY(-22.5, -8, 8.5);
runner.at([-22.5, y0, -8], Math.PI / 2); await sleep(700);
const hpN = await wound();
ok(`the runner bleeds at night (hp ${hpN})`, hpN < 100);
const roof = [];
for (let x = -22.5; x <= -16.01; x += 0.5) roof.push([x, -8 + Math.sin(x * 0.8) * 0.8]);
await walk(runner, roof, y0);
runner.at([-18, -2.2, -1]); // (down in the cellar, out of sight)
await tp([-20.5, floorY(-20.5, -3.5, 9.5), -3.5], 0, -0.45);
await sleep(1200);
const nRoof = await drops();
ok(`drops on the roof: ${nRoof}`, nRoof >= 8);
await shot('gb_night_roof.png');
const tilted = (await matrices(0)).filter(([x, y, z, nx, ny]) => ny < 0.95).length;
ok(`drops lying tilted on the roof's slope: ${tilted} of ${nRoof}`, tilted >= nRoof - 2);
await tp([27, 0, 1], 0, -0.3);
runner.at([27, 0, -14], Math.PI); await sleep(700);
await wound();
const st2 = [];
for (let z = -14; z <= -6.01; z += 0.5) st2.push([27 + Math.sin(z * 0.6), z]);
await walk(runner, st2, 0);
runner.at([-18, -2.2, -1]);
await sleep(1000);
await shot('gb_night_street.png');

console.log('page errors:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
ok('no page errors', !errors.length);
runner.close(); shooter.close();
process.exit();
