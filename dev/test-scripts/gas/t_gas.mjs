// The gas system on the server (Mansion). Needs the test server on GAME_PORT started with
//   MAP=cs_mansion BOTS=0 START_MONEY=16000 ROUND_TIME=300 GAS_LEAK_X=3   (the leak three times as fast, to save time)
// A Terrorist and a CT play; each part is a fresh round (admin restart), so it also checks the repair at round start.
//   1. a pistol shot holes the kitchen's meter; the gas fills the kitchen, not the garage behind a closed door, then
//      the garage once the door is open; the valve (hold E 2 s) shuts it; an open back door and a broken window vent
//      the kitchen faster than the closed room does
//   2. a new round: the pipe is whole, no gas; the gas thick enough to choke (damage, coughing); a shot sets it off
//      (gasBoom, damage, walls broken, doors blown)
//   3. a light switch sets it off   4. the fuse box lever (the cellar's boiler)   5. a chain: kitchen then cellar
//   6. an HE grenade sets it off
import { player, admin, sleep } from '../mansion/client.mjs';
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { GAS } = await import(G + 'shared/gas.js');
const map = MAPS.cs_mansion, room = g => map.rooms.findIndex(r => r.group === g);
const KITCHEN = room('lampa6'), GARAGE = room('garage'), CELLAR = room('cellar');
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };

const t = await player('Gasman', 'T'), ct = await player('Sparky', 'CT');
let gs = null, snaps = 0;
t.on.s = m => { gs = m.gs || null; snaps++; };
const conc = i => { const r = gs?.r || []; for (let k = 0; k < r.length; k += 2) if (r[k] === i) return r[k + 1] / GAS.Q; return 0; };
const pipe = i => gs?.p?.[i] ?? 0;
const waitFor = async (cond, secs, step = 250) => { for (let i = 0; i < (secs * 1000) / step; i++) { if (cond()) return true; await sleep(step); } return cond(); };
const eyeOf = p => [p[0], p[1] + 1.62, p[2]];
const shootAt = (c, from, at, w) => {
  const o = eyeOf(from), d = at.map((v, i) => v - o[i]), l = Math.hypot(...d);
  c.send({ t: 'shoot', o, d: d.map(v => v / l), w, rt: 0 });
};
const holdE = async (c, ms) => { c.use(true); await sleep(ms); c.use(false); };
const newRound = async () => {
  t.clear(); ct.clear();
  await admin({ action: 'restart' });
  await waitFor(() => t.got('round').length > 0, 10);
  await sleep(3400); // the freeze time
};
const KSPOT = [-17.5, 0.81, -11.5], METER = [-16.6, 1.5, -13.92], CMETER = [-13.405, -0.22, 2.15];
const AWAY = [-6, 0, 18]; // on the south lawn
const CSPOT = [-16.5, -2.2, 2.15]; // in the cellar, facing the boiler
const want = n => !process.env.PARTS || process.env.PARTS.split(',').includes(String(n)); // PARTS=1,3: only those
// (the match starts by itself a moment after both have joined: wait for that first, or it restarts under the test)
await waitFor(() => t.got('round').length > 0, 15);
await sleep(500);

// ---------------------------------------------------------------- 1. leak, spread, valve, venting
if (want(1)) {
await newRound();
ok('round start: no gas in the snapshot', gs === null);
t.at(KSPOT, 0); ct.at(AWAY, 0); await sleep(300);
shootAt(t, KSPOT, METER, 'glock'); await sleep(400);
const leak = t.got('gasLeak')[0];
ok(`a shot at the meter holes the pipe: ${JSON.stringify(leak)}`, leak?.i === 0 && leak?.s === 1);
await sleep(8000);
ok(`the kitchen fills (${conc(KITCHEN).toFixed(3)}), the garage behind the closed door doesn't (${conc(GARAGE).toFixed(3)})`, conc(KITCHEN) > GAS.haze && conc(GARAGE) === 0);
t.at([-21.55, 0.81, -13.2], 0); await sleep(300);
await holdE(t, 150); await sleep(300);
ok('the T opened the side door to the garage', t.got('doors').some(m => m.i === 7 && m.open));
await sleep(6000);
ok(`with the door open the gas gets into the garage (${conc(GARAGE).toFixed(3)})`, conc(GARAGE) > 0.01);
t.at([-16.6, 0.81, -13.2], 0); await sleep(300);
t.use(true); await sleep(2600); t.use(false); await sleep(400);
ok(`holding E at the valve shuts it (pipe state ${pipe(0)}; ${JSON.stringify(t.got('gasLeak').slice(-1)[0])})`, pipe(0) === 2);
const ln = (a, b) => Math.log(a / Math.max(b, 1e-4));
let c0 = conc(KITCHEN); await sleep(6000); let c1 = conc(KITCHEN);
const closedRate = ln(c0, c1) / 6;
// the back door open (it creaks open in 1.6 s) and the garage's roller door (2 s). (Not a window: a shot in the
// kitchen now would set it off — the bullet's muzzle flash or where it hits)
t.at([-22.4, 0.81, -8.7], -Math.PI / 2); await sleep(300); await holdE(t, 150); await sleep(300);
t.at([-14.8, 0, -17.9], -Math.PI / 2); await sleep(300); await holdE(t, 150); await sleep(2400);
ok('back door and garage door open', t.got('doors').some(m => m.i === 2 && m.open) && t.got('doors').some(m => m.i === 6 && m.open) && !t.got('gasBoom').length);
c0 = conc(KITCHEN); await sleep(6000); c1 = conc(KITCHEN);
const ventRate = ln(c0, c1) / 6;
ok(`venting clears it faster: ${(closedRate * 100).toFixed(1)}%/s closed, ${(ventRate * 100).toFixed(1)}%/s with the doors to the outside open`, ventRate > closedRate * 1.5);
}

// ---------------------------------------------------------------- 2. repaired; choking; a shot sets it off
if (want(2)) {
await newRound();
await sleep(300);
ok(`a new round: the pipe is whole and the air clean (gs ${JSON.stringify(gs)})`, gs === null);
t.at(KSPOT, 0); ct.at(AWAY, 0); await sleep(300);
shootAt(t, KSPOT, METER, 'glock'); await sleep(300);
t.at([-21, 0.81, -7], 0); await sleep(300);
const choked = await waitFor(() => conc(KITCHEN) >= GAS.choke + 0.02, 45);
await sleep(2200);
const dmg = t.got('dmg'), coughs = t.got('gasCough');
ok(`thick gas (${conc(KITCHEN).toFixed(2)}): the T chokes (${dmg.length} hits, hp ${t.got('dmg').slice(-1)[0]?.hp}) and coughs (${coughs.length})`, choked && dmg.length >= 1 && coughs.some(m => m.id));
t.at([-27, 0, -11], 0); // out of the back of the house (through the wall: the server trusts the position)
const ctSpot = [-18, 0.81, -1.5];
ct.at(ctSpot, 0); await sleep(500);
const tHp = t.got('dmg').slice(-1)[0]?.hp ?? 100;
ct.clear(); t.clear();
shootAt(ct, ctSpot, [-18, 2.0, -13.9], 'usp'); await sleep(600);
const boom = t.got('gasBoom');
ok(`a CT's shot into the kitchen sets it off: ${JSON.stringify(boom[0])}`, boom.some(m => m.i === KITCHEN));
ok(`walls and furniture broke (${t.got('brk').reduce((s, m) => s + m.ids.length, 0)} pieces), doors blown (${t.got('doors').filter(m => m.blown).map(m => m.i)})`, t.got('brk').length > 0 && t.got('doors').some(m => m.blown));
ok(`a short fire (${t.got('fire').length})`, t.got('fire').length >= 1);
const ctHit = ct.got('dmg'), kills = t.got('kill');
console.log('   CT took', ctHit.map(m => m.d).join(','), '| kills', JSON.stringify(kills.map(k => [k.k, k.v, k.w])), '| T hp before', tHp);
await sleep(500);
ok(`the gas is gone after the blast (${conc(KITCHEN)})`, conc(KITCHEN) === 0 && pipe(0) === 3);
}

// ---------------------------------------------------------------- 3. a light switch
if (want(3)) {
await newRound();
t.at(KSPOT, 0); ct.at(AWAY, 0); await sleep(300);
shootAt(t, KSPOT, METER, 'glock'); await sleep(300);
t.at(AWAY, 0);
await waitFor(() => conc(KITCHEN) >= GAS.ignite + 0.03, 40);
ct.at([-14.0, 0.81, -10.67], Math.PI / 2); await sleep(400);
t.clear();
await holdE(ct, 150); await sleep(500);
ok(`flipping the kitchen's light switch sets it off: ${JSON.stringify(t.got('gasBoom')[0])}`, t.got('lights').length > 0 && t.got('gasBoom').some(m => m.i === KITCHEN && m.k === 'switch'));
ok(`the CT who flipped it was hurt (${ct.got('dmg').map(m => m.d).join(',')}), killed by 'gas': ${t.got('kill').some(k => k.w === 'gas')}`, ct.got('dmg').length > 0);
}

// ---------------------------------------------------------------- 4. the fuse box (the cellar's boiler)
if (want(4)) {
await newRound();

t.at(CSPOT, Math.PI / 2); ct.at(AWAY, 0); await sleep(300);
shootAt(t, CSPOT, CMETER, 'glock'); await sleep(400);
ok(`a shot holes the boiler's pipe: ${JSON.stringify(t.got('gasLeak')[0])}`, t.got('gasLeak').some(m => m.i === 1 && m.s === 1));
await waitFor(() => conc(CELLAR) >= GAS.ignite + 0.03, 40);
t.at([-18.3, -2.2, -4.5], 0); await sleep(400);
t.clear();
t.use(true); await sleep(3500); t.use(false); await sleep(400);
ok(`cutting the power at the fuse box sets the cellar off: ${JSON.stringify(t.got('gasBoom')[0])}`, t.got('lights').some(m => m.power) && t.got('gasBoom').some(m => m.i === CELLAR && m.k === 'fusebox'));
}

// ---------------------------------------------------------------- 5. a chain: kitchen, then the cellar through the stair
if (want(5)) {
await newRound();
t.at(KSPOT, 0); ct.at(AWAY, 0); await sleep(300);
shootAt(t, KSPOT, METER, 'glock'); await sleep(300);
t.at(CSPOT, Math.PI / 2); await sleep(300);
shootAt(t, CSPOT, CMETER, 'glock'); await sleep(300);
t.at(AWAY, 0);
await waitFor(() => conc(KITCHEN) >= GAS.ignite + 0.03 && conc(CELLAR) >= GAS.ignite + 0.03, 45);
console.log(`   kitchen ${conc(KITCHEN).toFixed(2)}, cellar ${conc(CELLAR).toFixed(2)}`);
ct.at([-14.0, 0.81, -10.67], Math.PI / 2); await sleep(400);
t.clear();
await holdE(ct, 150); await sleep(1200);
const chain = t.got('gasBoom').map(m => `${m.i}:${m.k}`);
ok(`the kitchen goes off, then the cellar: ${chain.join(' ')}`, chain[0] === `${KITCHEN}:switch` && chain.includes(`${CELLAR}:chain`));
}

// ---------------------------------------------------------------- 6. an HE grenade
if (want(6)) {
await newRound();
t.at(KSPOT, 0); ct.at(AWAY, 0); await sleep(300);
t.send({ t: 'buy', item: 'he' }); await sleep(300);
shootAt(t, KSPOT, METER, 'glock'); await sleep(300);
await waitFor(() => conc(KITCHEN) >= GAS.ignite + 0.03, 40);
const throwFrom = [-12, 0.81, -12]; // in the hall east of the kitchen, throwing west through the doorway
t.at(throwFrom, Math.PI / 2); await sleep(300);
t.clear();
t.send({ t: 'nade', k: 'he', o: eyeOf(throwFrom), v: [-9, 1, 0] }); await sleep(2600);
ok(`an HE thrown into the kitchen sets it off: ${JSON.stringify(t.got('gasBoom')[0])}`, t.got('gasBoom').some(m => m.i === KITCHEN));
}

console.log('snapshots seen:', snaps);
t.close(); ct.close();
process.exit();
