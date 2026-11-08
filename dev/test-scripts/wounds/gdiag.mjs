// Diagnostic: how a dragged body looks from the side (the browser 4 m off, eye level), next to the same body lying
// downed and not dragged. Screenshots gd_*.png in OUT; prints the remote model's numbers.
import { page, sleep, until } from './gshared.mjs';
import { player } from './lib.mjs';

const g = await page('T', 'Viewer');
const C1 = await player('Charlie', 'CT'), M = await player('Mate', 'T'), C2 = await player('Cathy', 'CT'), T2 = await player('Toby', 'T');
for (const c of [C1, M, C2, T2]) c.w = c.team === 'CT' ? 'usp' : 'glock';
await until(() => M.got('round').length > 0, 40000);
await sleep(4000);
M.at([-34, 0, 0], -Math.PI / 2); T2.at([-33.4, 0, 0], Math.PI / 2); C1.at([-40, 0, 0], -Math.PI / 2); C2.at([-40, 0, 5], 0);
await g.tp([-33, 0, 4.5], 0, 0); await sleep(800);
for (let i = 0; i < 14 && !T2.got('bodyDown').some(m => m.v === M.id); i++) { C1.shootAt([-34, 1.2, 0], 'usp'); await sleep(380); }
await sleep(1500);
const info = () => g.ev(`(() => { const out = []; for (const s of __scenes) s.traverse(o => { if (o.userData?.arms && o.userData?.hip && o.visible) out.push({ p: [o.position.x, o.position.y, o.position.z].map(v => +v.toFixed(2)), r: [o.rotation.x, o.rotation.y, o.rotation.z].map(v => +v.toFixed(2)), hip: +o.userData.hip.position.y.toFixed(2), up: +o.userData.upper.scale.y.toFixed(2), legs: o.userData.legs.map(l => +l.scale.y.toFixed(2)) }); }); return JSON.stringify(out); })()`);
console.log('downed, lying:', await info());
await g.shot('gd_downed.png');
T2.use(true); await sleep(200); T2.send({ t: 'wdDrag', on: 1 }); await sleep(300);
for (let i = 1; i <= 40; i++) { T2.at([-33.4 + 0.04 * i, 0, 0], -Math.PI / 2); await sleep(31); }
await sleep(1500);
console.log('dragged:', await info());
console.log('server: Mate', JSON.stringify(M.snap?.pl?.find(r => r[0] === M.id)), 'Toby', JSON.stringify(M.snap?.pl?.find(r => r[0] === T2.id)));
await g.shot('gd_dragged.png');
T2.use(false); await sleep(1500);
console.log('dropped:', await info());
await g.shot('gd_dropped.png');
console.log('errors', g.errors);
for (const c of [C1, M, C2, T2]) c.close();
process.exit();
