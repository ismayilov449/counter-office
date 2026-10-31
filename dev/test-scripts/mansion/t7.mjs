// Step 7: a T cuts the power at the fuse box (3 s), the switches are dead, a CT brings it back (5 s).
import { player, sleep } from './client.mjs';
const t = await player('Tee', 'T');
const ct = await player('Cee', 'CT');
await sleep(7500); // (past "game commencing" and the freeze time: the lever only works in a live round or warmup)
const t0 = Date.now();
const ev = [];
for (const c of [t, ct]) c.on.lights = m => ev.push([c === t ? 'T' : 'CT', Date.now() - t0, m.power || 'switch', m.lights.power, m.lights.lampa5, m.lights.cellar]);
t.at([-18.3, -2.2, -4.4], 0);
ct.at([-17.6, -2.2, -4.2], 0);
await sleep(300);
ct.use(true); await sleep(300); ct.use(false); // CT can't cut it
t.use(true); await sleep(1500); t.use(false); await sleep(200); // let go too early: nothing
t.use(true); await sleep(3300); t.use(false);
await sleep(200);
// a dead switch: the cellar's own, at the foot of the stairs
ct.at([-14.0, -2.2, -3.6], Math.PI / 2); await sleep(200);
ct.use(true); await sleep(100); ct.use(false); await sleep(200);
ct.at([-17.6, -2.2, -4.2], 0); await sleep(200);
ct.use(true); await sleep(5300); ct.use(false);
await sleep(300);
console.log('lights events [who, ms, kind, power, lampa5, cellar]:');
for (const e of ev) console.log(' ', JSON.stringify(e));
console.log('T msgs:', t.got('msg').map(m => m.text).join(' | '));
console.log('CT msgs:', ct.got('msg').map(m => m.text).join(' | '));
t.close(); ct.close();
process.exit(0);
