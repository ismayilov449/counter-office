// A lamp lights only its own room (integration 2026-11-08, public/js/roomlight.js lampBoxes): in the real game (headless
// Edge on CDP_PORT, server on GAME_PORT with BOTS=0; the map is the server's), a room with its light off next to lit
// rooms on the same storey, with the mask and without it (window.__noLampMask, the same frame otherwise), and the same
// room lit. Each view's mean brightness (power/png.mjs) and a screenshot in OUT (prefix PREFIX, default gl).
//   GAME_PORT=... CDP_PORT=... OUT=... node dev/test-scripts/integration/glamps.mjs
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
import { meanLum } from '../power/png.mjs';

const PREFIX = process.env.PREFIX || 'gl';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const mate = await player('Mate', 'T'); // (so the page's team has company; it stays on the lawn)
mate.at([-33, 0, -6], 0);
let g = await open('CT', 'Looker', ['msg', 'lights', 'world']);
for (let i = 0; i < 3 && !(await g.ev('!!window.__ws && window.__sq > 0')); i++) { await sleep(1500); g = await open('CT', 'Looker', ['msg', 'lights', 'world']); }
await sleep(2500);
// every lamp on but `off` (the page's own state, as a 'lights' message from the server would set it)
const lights = off => g.ev(`import('/shared/maps/index.js').then(({ MAPS }) => { const m = MAPS['${process.env.MAP || 'cs_mansion'}'], L = {};
  for (const g of new Set([...(m.rooms || []).map(r => r.group), ...(m.switches || []).map(s => s.group)])) L[g] = !${JSON.stringify(off)}.includes(g);
  L.power = true; L.dead = []; __onmsg({ data: JSON.stringify({ t: 'lights', lights: L }) }); return 1; })`);
const view = async (name, mask) => {
  await g.ev(`globalThis.__noLampMask = ${!mask}, 1`);
  await sleep(2500); // (a few frames at 1-3 fps; the lamp pick runs every 0.1 s of game time)
  const f = await g.shot(`${PREFIX}_${name}.png`);
  return meanLum(f, [0.1, 0.2, 0.9, 0.95]);
};
const VIEWS = [
  // [name, where, yaw, pitch, the room switched off, its neighbours on the same storey]
  ['living', [-17.5, 0.813, -3.6], Math.PI, -0.35, 'lampa7'],          // the living room, facing south (the fireplace wall; the south-west room behind it)
  ['kitchen', [-16.5, 0.813, -7.5], 0, -0.3, 'lampa6'],                // the kitchen, facing north (the garage behind its wall)
  ['bedroom', [-19.5, 4.267, 9.6], 0, -0.3, 'lampa11'],                // the bedroom upstairs, facing north (the Ts' room behind the wall)
];
const res = [];
for (const [name, p, yaw, pitch, off] of VIEWS) {
  await g.tp(p, yaw, pitch);
  await sleep(1500);
  await lights([off]);
  const masked = await view(`${name}_off_mask`, true);
  const unmasked = await view(`${name}_off_nomask`, false);
  await lights([]);
  const lit = await view(`${name}_lit_mask`, true);
  const litNo = await view(`${name}_lit_nomask`, false);
  res.push({ name, masked, unmasked, lit, litNo });
  console.log(`${name} (${off} off): with the mask ${masked.toFixed(1)}, without ${unmasked.toFixed(1)}; lit: ${lit.toFixed(1)} / ${litNo.toFixed(1)}`);
}
await g.ev('globalThis.__noLampMask = false, 1');
for (const r of res) {
  ok(`${r.name}: switched off, the neighbours' lamps no longer light it (${r.masked.toFixed(1)} with the mask < ${r.unmasked.toFixed(1)} without)`, r.masked < r.unmasked - 1);
  ok(`${r.name}: lit, its own lamp still lights it (${r.lit.toFixed(1)} with the mask, ${r.litNo.toFixed(1)} without; dark ${r.masked.toFixed(1)})`, r.lit > r.masked + 3 && r.lit > r.litNo * 0.75);
}
const errs = g.errors || [];
ok(`no page errors (${errs.length})`, !errs.length);
mate.close(); g.cdp.close();
process.exit(process.exitCode || 0);
