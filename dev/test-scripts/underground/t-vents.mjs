// 5.3 Air vents on the server (GAME_PORT=4250; run srv.sh first, MAP=cs_mansion or cs_mansion_night). One scripted
// Terrorist alone (warmup: he buys anywhere) throws an HE into each of the six grilles with the browser's own throw
// (throws.mjs), and checks what everyone is told: the first 'nade' cut at the grille (`fu`), 'ugDuct' (in at this
// grille, out at the other), a second 'nade' out of the other grille (`vent`), the 'boom' on the far side (its room)
// at the grenade's full fuse (game time, from the snapshots). Then a Molotov dropped into the bedroom's floor grille
// burns in the kitchen, and a grenade in a duct when the round restarts never comes out.
import { player, admin, sleep } from '../mansion/client.mjs';
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const U = await import(G + 'shared/underground.js');
const { SPOTS, findThrow } = await import('./throws.mjs');
const map = MAPS[process.env.MAP || 'cs_mansion'], world = new CollisionWorld(map), vents = U.ventsOf(map);
const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', what); };
const r2 = v => Math.round(v * 100) / 100;
const T = await player('Ventman', 'T');
let gt = 0; // the game's clock (snapshot time)
const ev = [];
T.on.s = m => { gt = m.time; };
for (const k of ['nade', 'ugDuct', 'boom', 'fire']) T.on[k] = m => ev.push({ ...m, gt });
{ const push = T.log.push.bind(T.log); T.log.push = m => (m.t === 's' ? 0 : push(m)); }
const waitFor = async (fn, ms, step = 50) => { for (let i = 0; i < ms / step; i++) { if (fn()) return true; await sleep(step); } return fn(); };
const roomOf = p => U.grilleRoom(map.rooms, { c: p, nv: [0, 0, 0] });
const name = i => (i < 0 ? 'outside' : map.rooms[i].group);
await sleep(500);
console.log('map', map.id, '— one T, warmup');

for (const s of SPOTS) {
  const g = vents.grilles[s.g], out = vents.grilles[g.links[0].to];
  const t = findThrow(world, vents, g, s.from);
  if (!t) { check(false, `grille ${g.i}: no throw found`); continue; }
  T.send({ t: 'buy', item: 'he' }); await sleep(150);
  T.at(s.from, t.yaw, t.pitch); await sleep(250);
  ev.length = 0;
  T.send({ t: 'nade', k: 'he', o: t.o, v: t.v });
  await waitFor(() => ev.some(e => e.t === 'boom'), 3500);
  const first = ev.find(e => e.t === 'nade' && e.vent == null), duct = ev.find(e => e.t === 'ugDuct');
  const exit = ev.find(e => e.t === 'nade' && e.vent != null), boom = ev.find(e => e.t === 'boom');
  check(first && Math.abs(first.fu - t.tIn) < 1e-6, `grille ${g.i} (${g.name}): the throw is cut at the grille after ${r2(first?.fu)} s`);
  check(duct && duct.a === g.i && duct.b === out.i, `grille ${g.i}: 'ugDuct' in at ${duct?.a}, out at ${duct?.b} (${out.name}) after ${duct?.d} ms`);
  check(exit && exit.vent === out.i && U.grilleDist(out, exit.o) < 0.2, `grille ${g.i}: a second 'nade' drops out of grille ${exit?.vent}, ${r2((exit?.gt - first?.gt) / 1000)} s after the throw, ${r2(exit?.fu)} s left`);
  const br = boom && roomOf(boom.p), want = U.grilleRoom(map.rooms, out);
  check(boom && br === want, `grille ${g.i}: the boom is in ${boom ? name(br) : '-'} (${boom?.p.map(r2)}): the far grille's side (${name(want)})`);
  const dt = boom && first ? (boom.gt - first.gt) / 1000 : null;
  check(dt != null && Math.abs(dt - 1.6) < 0.1, `grille ${g.i}: it goes off at its full fuse: ${r2(dt)} s of game time after the throw`);
  await sleep(300);
}

// a Molotov dropped into the bedroom's floor grille: the fire is in the kitchen
{
  const g = vents.grilles[3], t = findThrow(world, vents, g, SPOTS[3].from, 4, true);
  T.send({ t: 'buy', item: 'molotov' }); await sleep(150);
  T.at(SPOTS[3].from, t.yaw, t.pitch); await sleep(250);
  ev.length = 0;
  T.send({ t: 'nade', k: 'molotov', o: t.o, v: t.v });
  await waitFor(() => ev.some(e => e.t === 'fire'), 3000);
  const fire = ev.find(e => e.t === 'fire'), boom = ev.find(e => e.t === 'boom');
  check(fire && roomOf(fire.p) === 0 && boom?.k === 'molotov', `a Molotov dropped into the bedroom's grille burns in the kitchen (${fire ? name(roomOf(fire.p)) : '-'} ${fire?.p.map(r2)})`);
  await sleep(500);
}

// a new round with a grenade in the duct: it never comes out
{
  const g = vents.grilles[2], t = findThrow(world, vents, g, SPOTS[2].from);
  T.send({ t: 'buy', item: 'he' }); await sleep(150);
  T.at(SPOTS[2].from, t.yaw, t.pitch); await sleep(250);
  ev.length = 0;
  T.send({ t: 'nade', k: 'he', o: t.o, v: t.v });
  await waitFor(() => ev.some(e => e.t === 'ugDuct'), 1000);
  await admin({ action: 'restart' });
  await sleep(2500);
  check(ev.some(e => e.t === 'ugDuct') && !ev.some(e => e.t === 'nade' && e.vent != null) && !ev.some(e => e.t === 'boom'), `a restart while it's in the duct: nothing comes out, no boom (${ev.map(e => e.t).join(' ')})`);
}

const pass = checks.filter(Boolean).length;
console.log(`${pass}/${checks.length} passed`);
T.close();
process.exit(pass === checks.length ? 0 : 1);
