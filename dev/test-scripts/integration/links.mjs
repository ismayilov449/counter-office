// The links between the features merged on 2026-11-01, server side (Mansion). Test server on GAME_PORT with
//   MAP=cs_mansion BOTS=0 START_MONEY=16000 ROUND_TIME=600 FREEZE_TIME=1          (parts a..g)
//   ... and GAS_LEAK_X=6 for part h (PARTS=h)
// Two Terrorists (Tee, Tom) and two CTs (Cee, Cal), scripted; each part is a fresh round (admin restart).
//   a. shield x downed: Tee holds hostage 2 as a shield; shot down from behind, he lets go at once ('downed')
//   b. shield x play dead: Tee holds it again and plays dead: he lets go as a real death would ('died')
//   c. bet x downed: a finished downed player is the finisher's kill; one who bleeds out (his team all down) the downer's
//   d. elevator x play dead: a "corpse" in the cabin rides up with it (the server keeps a corpse where it lies)
//   e. E on a hostage needs line of sight: through a wall nothing happens, in sight it follows
//   f. disguise x blood: the fooled team's snapshot names a bleeding wearer by the dead player's id in "bl"
//   g. E's order: a revive beats leading a hostage
//   h. elevator -> gas: gas in the living room, the lift's motor starts: the gas goes off ('motor')
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { player, admin, sleep } from '../mansion/client.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const G = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { MAPS } = await G('shared/maps/index.js');
const { CollisionWorld } = await G('shared/collision.js');
const { overlapsAny, PLAYER } = await G('shared/physics.js');
const { GAS } = await G('shared/gas.js');
const MAP = MAPS[process.env.MAP || 'cs_mansion'], E = MAP.elevator, world = new CollisionWorld(MAP);
const want = k => !process.env.PARTS || process.env.PARTS.split(',').includes(k);
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { if (cond()) return true; await sleep(50); } return !!cond(); };
const fits = p => !overlapsAny(world.move(null, p, 2), p[0], p[1] + 0.05, p[2], PLAYER.radius, PLAYER.height - 0.05);
const clear = (a, b, what = 'bullet') => { const d = b.map((v, i) => v - a[i]), l = Math.hypot(...d); const h = world.raycast(a, d.map(v => v / l), l, what); return !h || h.t >= l - 0.2; };
const floorAt = (x, y, z) => { const h = world.raycast([x, y + 0.6, z], [0, -1, 0], 1.5, 'solid'); return h ? y + 0.6 - h.t : null; };
const fwd = yaw => [-Math.sin(yaw), 0, -Math.cos(yaw)];
const EYE = PLAYER.eye;

// (joined in turns: auto team balance)
const Tee = await player('Tee', 'T'), Cee = await player('Cee', 'CT'), Tom = await player('Tom', 'T'), Cal = await player('Cal', 'CT');
const all = [Tee, Tom, Cee, Cal];
const ids = new Map();
for (const c of all) {
  c.id = c.log.find(m => m.t === 'welcome')?.id;
  ids.set(c.id, c.log.find(m => m.t === 'welcome') ? c : null);
  c.crouch = 0;
  c.on.s = m => { c.snap = m; };
  c.on.elevState = m => { c.el = m; };
  // (our own position sender: it keeps a crouch when asked)
  clearInterval(c.timer);
  c.timer = setInterval(() => { if (c.p && c.alive) c.send({ t: 'state', sq: c.sq, p: c.p, yaw: c.yaw, pitch: 0, c: c.crouch, w: c.w || 'knife' }); }, 100);
}
Tee.w = Tom.w = 'glock'; Cee.w = Cal.w = 'usp';
const row = (c, id) => c.snap?.pl?.find(r => r[0] === id);
const shoot = async (c, to, wait = 380) => {
  const o = [c.p[0], c.p[1] + EYE, c.p[2]], d = to.map((v, i) => v - o[i]), l = Math.hypot(...d);
  c.send({ t: 'shoot', o, d: d.map(v => v / l), w: c.w, rt: 0 });
  await sleep(wait);
};
const chest = c => [c.p[0], c.p[1] + 1.2, c.p[2]], head = c => [c.p[0], c.p[1] + 1.62, c.p[2]], lying = c => [c.p[0], c.p[1] + 0.25, c.p[2]];
const downed = (by, c) => by.got('bodyDown').some(m => m.v === c.id);
const dead = (by, c) => by.got('kill').some(m => m.v === c.id);
const drop = async (shooter, c, aim = chest) => { for (let i = 0; i < 14 && !downed(Cal, c) && !dead(Cal, c) && !downed(Cee, c) && !dead(Cee, c); i++) await shoot(shooter, aim(c)); };
let roundNo = 0;
const nextRound = async (label) => {
  for (const c of all) { c.clear(); c.crouch = 0; }
  await admin({ action: 'restart' });
  ok(`${label}: a fresh round`, await until(() => Tee.got('round').length > 0, 15000));
  for (const c of [Cee, Cal]) c.send({ t: 'reload', w: 'usp' });
  for (const c of [Tee, Tom]) c.send({ t: 'reload', w: 'glock' });
  await sleep(1600); // freeze time 1 s
};
// the open back lawn (body's t1.mjs layout on the Mansion)
const LAWN = { T1: [-33, 0, -3], T2: [-33, 0, -6], C1: [-39, 0, -3], C2: [-39, 0, 3] };
// (the match starts a moment after both teams have someone: wait for it, or the restart is undone)
await until(() => Tee.got('round').length > 0, 15000);
await sleep(500);

// A spot to hold a hostage from: the holder `d` m from it facing it, with free floor for him, for the hostage in front
// and for a shooter `back` m behind him who sees his chest.
function holdSpots(h, d = 0.9, back = 2.2) {
  for (let k = 0; k < 16; k++) {
    const yaw = (k / 16) * Math.PI * 2, f = fwd(yaw);
    const tp = [h[0] - f[0] * d, h[1], h[2] - f[2] * d], sp = [tp[0] - f[0] * back, h[1], tp[2] - f[2] * back];
    const hp = [tp[0] + f[0] * 0.42, h[1], tp[2] + f[2] * 0.42];
    if (![tp, sp, hp].every(p => fits(p) && floorAt(p[0], p[1], p[2]) !== null && Math.abs(floorAt(p[0], p[1], p[2]) - h[1]) < 0.05)) continue;
    if (!clear([sp[0], sp[1] + EYE, sp[2]], [tp[0], tp[1] + 1.2, tp[2]]) || !clear([tp[0], tp[1] + EYE, tp[2]], [h[0], h[1] + 1.1, h[2]])) continue;
    return { tp, sp, yaw };
  }
  return null;
}
const H2 = MAP.hostages[2].p.slice(), H3 = MAP.hostages[3].p.slice();
H2[1] = floorAt(H2[0], H2[1], H2[2]); H3[1] = floorAt(H3[0], H3[1], H3[2]);
const away = (c, p) => c.at(p, 0);

// ---------------------------------------------------------------- a. shield x downed
if (want('a')) {
  await nextRound('a');
  const s = holdSpots(H2);
  ok(`a: a spot to hold hostage 2 from (${s && s.tp.map(v => v.toFixed(2))})`, !!s);
  away(Tom, LAWN.T2); away(Cal, LAWN.C2);
  Tee.at(s.tp, s.yaw); Cee.at(s.sp, s.yaw); await sleep(500);
  Tee.use(true); await sleep(150); Tee.use(false); await sleep(400);
  ok('a: Tee grabs the hostage', Cal.got('shieldGrab').some(m => m.id === Tee.id) && Cal.snap?.sh?.some(r => r[1] === Tee.id));
  await drop(Cee, Tee);
  const sd = Cal.got('shieldDrop').find(m => m.id === Tee.id);
  ok(`a: shot down from behind: bodyDown, and the hostage let go at once (why ${sd?.why})`, downed(Cal, Tee) && sd?.why === 'downed');
  await sleep(300);
  ok('a: nobody holds it in the snapshot', !Cal.snap?.sh);
}

// ---------------------------------------------------------------- b. shield x play dead
if (want('b')) {
  await nextRound('b');
  const s = holdSpots(H2);
  away(Tom, LAWN.T2); away(Cal, LAWN.C2); away(Cee, LAWN.C1);
  Tee.at(s.tp, s.yaw); await sleep(500);
  Tee.use(true); await sleep(150); Tee.use(false); await sleep(400);
  ok('b: Tee grabs the hostage', Cal.got('shieldGrab').some(m => m.id === Tee.id));
  Tee.send({ t: 'bodyPlayDead' }); await sleep(500);
  const sd = Cal.got('shieldDrop').find(m => m.id === Tee.id);
  ok(`b: playing dead lets go as a death would (why ${sd?.why}), the CTs get a kill`, sd?.why === 'died' && dead(Cal, Tee) && Tom.got('bodyPlayDead').some(m => m.v === Tee.id));
  ok('b: no "nopistol" give-away', !Cal.got('shieldDrop').some(m => m.why === 'nopistol'));
}

// ---------------------------------------------------------------- c. bet x downed
if (want('c')) {
  await nextRound('c1');
  Cee.send({ t: 'betPlace', target: 'k1', stake: 200 }); Cal.send({ t: 'betPlace', target: 'k1', stake: 200 });
  await sleep(300);
  ok('c1: both CTs bet on 1 kill', Cee.got('betOk').length === 1 && Cal.got('betOk').length === 1);
  Tee.at(LAWN.T1, 0); Tom.at(LAWN.T2, 0); Cee.at(LAWN.C1, -Math.PI / 2); Cal.at(LAWN.C2, -Math.PI / 2); await sleep(600);
  await drop(Cal, Tom);
  ok('c1: Cal downs Tom (Tee still standing)', downed(Cee, Tom) && !dead(Cee, Tom));
  for (let i = 0; i < 8 && !dead(Cee, Tom); i++) await shoot(Cee, lying(Tom));
  const k = Cee.got('kill').find(m => m.v === Tom.id);
  ok(`c1: Cee finishes him: the kill is Cee's (k ${k?.k}), Cee's bet counts it, Cal's doesn't`, k?.k === Cee.id && Cee.got('betTrack').some(m => m.k === 1) && !Cal.got('betTrack').some(m => m.k >= 1));
  await nextRound('c2');
  Cal.send({ t: 'betPlace', target: 'k1', stake: 200 }); await sleep(300);
  Tee.at(LAWN.T1, 0); Tom.at(LAWN.T2, 0); Cee.at(LAWN.C1, -Math.PI / 2); Cal.at(LAWN.C2, -Math.PI / 2); await sleep(600);
  await drop(Cal, Tom);
  ok('c2: Cal downs Tom', downed(Cee, Tom) && !dead(Cee, Tom));
  for (let i = 0; i < 6 && !dead(Cee, Tee); i++) await shoot(Cee, head(Tee));
  ok('c2: Cee kills Tee outright (a headshot)', dead(Cee, Tee));
  await until(() => dead(Cee, Tom), 2000);
  const k2 = Cee.got('kill').find(m => m.v === Tom.id);
  ok(`c2: no T standing: Tom bleeds out at once, the kill is the downer's (k ${k2?.k}) and Cal's bet counts it`, k2?.k === Cal.id && Cee.got('bodyKill').some(m => m.v === Tom.id && m.how === 'bled') && Cal.got('betTrack').some(m => m.k === 1));
  await until(() => Cal.got('betEnd').length > 0, 3000);
  const be = Cal.got('betEnd')[0]?.list?.find(b => b.id === Cal.id);
  ok(`c2: the round ends and Cal's bet is won (${JSON.stringify(be)})`, be?.won === true);
}

// ---------------------------------------------------------------- d. elevator x play dead
if (want('d') && E) {
  await nextRound('d');
  const mid = [(E.cabin.x1 + E.cabin.x2) / 2, E.stops[1], (E.cabin.z1 + E.cabin.z2) / 2 - 0.1];
  away(Tom, LAWN.T2); away(Cee, LAWN.C1);
  Tee.at(mid, 0); await sleep(400);
  Tee.send({ t: 'bodyPlayDead' }); await sleep(400);
  ok('d: Tee plays dead in the cabin', Tom.got('bodyPlayDead').some(m => m.v === Tee.id));
  const doorX = (E.door.x1 + E.door.x2) / 2;
  Cal.at([doorX, E.stops[2], E.out.z2 + 0.8], 0); await sleep(400);
  Cal.send({ t: 'elevAim', a: 'c2' }); await sleep(60); Cal.use(true); await sleep(100); Cal.use(false);
  const top = E.stops[2];
  const rode = await until(() => Math.abs((row(Cee, Tee.id)?.[2] ?? 0) - top) < 0.05, 9000);
  ok(`d: the "corpse" rides up with the cabin (y ${row(Cee, Tee.id)?.[2]}, the top stop ${top})`, rode);
  ok('d: and still looks dead to the CTs', row(Cee, Tee.id)?.[8] === 0);
}

// ---------------------------------------------------------------- e. E on a hostage needs line of sight
if (want('e')) {
  await nextRound('e');
  away(Tee, LAWN.T1); away(Tom, LAWN.T2); away(Cal, LAWN.C2);
  let wall = null, open = null;
  for (const h of [H3, H2]) {
    for (let k = 0; k < 48 && !(wall && open); k++) {
      const a = (k / 48) * Math.PI * 2;
      for (const r of [1.0, 1.3, 1.6, 1.9, 2.1]) {
        const p = [h[0] + Math.sin(a) * r, h[1], h[2] + Math.cos(a) * r];
        const fy = floorAt(p[0], p[1], p[2]);
        if (fy === null || Math.abs(fy - h[1]) > 0.05 || !fits(p)) continue;
        const sees = clear([p[0], p[1] + EYE, p[2]], [h[0], h[1] + 1.1, h[2]], 'move');
        if (!sees && !wall) wall = { p, h };
        if (sees && !open && r <= 1.6) open = { p, h };
      }
    }
    if (wall && open && wall.h === open.h) break;
    wall = open = null;
  }
  ok(`e: a spot within 2.2 m of a hostage behind a wall (${wall?.p.map(v => v.toFixed(2))}) and one in sight`, !!wall && !!open);
  if (wall && open) {
    Cee.at(wall.p, 0); await sleep(400);
    Cee.use(true); await sleep(150); Cee.use(false); await sleep(400);
    ok('e: E through the wall: the hostage doesn\'t follow', !Cee.got('msg').some(m => /following you/.test(m.text)));
    Cee.at(open.p, 0); await sleep(400);
    Cee.use(true); await sleep(150); Cee.use(false); await sleep(400);
    ok('e: in sight: it follows', Cee.got('msg').some(m => /following you/.test(m.text)));
  }
}

// ---------------------------------------------------------------- f. disguise x blood
if (want('f')) {
  await nextRound('f');
  Tee.at(LAWN.T1, Math.PI / 2); Tom.at([-33, 0, -14], 0); Cee.at(LAWN.C1, -Math.PI / 2); Cal.at(LAWN.C2, -Math.PI / 2); await sleep(600);
  await shoot(Tom, [Cee.p[0], Cee.p[1] + 0.4, Cee.p[2]], 400); // (a leg: a light bleed)
  ok('f: Tom\'s shot makes Cee bleed', (Cal.snap?.bl || []).some(r => r[0] === Cee.id));
  for (let i = 0; i < 6 && !dead(Cee, Tee); i++) await shoot(Cee, head(Tee));
  ok('f: Cee kills Tee (a headshot)', dead(Cee, Tee));
  Cee.crouch = 1; Cee.at([LAWN.T1[0] - 0.6, 0, LAWN.T1[2]], -Math.PI / 2, 0, 1); await sleep(300);
  Cee.use(true); await sleep(3500); Cee.use(false); await sleep(300);
  ok('f: Cee puts on Tee\'s uniform', Cee.got('disguiseOn').some(m => m.you));
  Cee.crouch = 0; Cee.at([LAWN.T1[0] - 3, 0, LAWN.T1[2] + 3], 0); await sleep(500);
  const tb = Tom.snap?.bl || [], cb = Cal.snap?.bl || [];
  ok(`f: the fooled Tom's "bl" names him as Tee (${JSON.stringify(tb)}), not as Cee`, tb.some(r => r[0] === Tee.id) && !tb.some(r => r[0] === Cee.id));
  ok(`f: his own team's "bl" names him as Cee (${JSON.stringify(cb)})`, cb.some(r => r[0] === Cee.id));
}

// ---------------------------------------------------------------- g. E's order: a revive beats a hostage
if (want('g')) {
  await nextRound('g');
  away(Tom, LAWN.T2);
  // Cal 1 m from hostage 2, Tee shoots him down from 3 m; Cee stands between, facing Cal, within reach of both
  let spot = null;
  for (let k = 0; k < 24 && !spot; k++) {
    const a = (k / 24) * Math.PI * 2, cp = [H2[0] + Math.sin(a) * 1.1, H2[1], H2[2] + Math.cos(a) * 1.1];
    const ep = [cp[0] + Math.sin(a) * 0.8, H2[1], cp[2] + Math.cos(a) * 0.8], tp = [cp[0] + Math.sin(a) * 3, H2[1], cp[2] + Math.cos(a) * 3];
    if (![cp, ep, tp].every(p => fits(p) && Math.abs((floorAt(p[0], p[1], p[2]) ?? 9) - H2[1]) < 0.05)) continue;
    if (!clear([tp[0], tp[1] + EYE, tp[2]], [cp[0], cp[1] + 1.2, cp[2]]) || !clear([ep[0], ep[1] + EYE, ep[2]], [H2[0], H2[1] + 1.1, H2[2]], 'move')) continue;
    spot = { cp, ep, tp, yaw: Math.atan2(Math.sin(a), Math.cos(a)) };
  }
  ok('g: a spot by hostage 2', !!spot);
  if (spot) {
    Cal.at(spot.cp, 0); Tee.at(spot.tp, spot.yaw); Cee.at(LAWN.C1, 0); await sleep(500);
    await drop(Tee, Cal);
    ok('g: Cal is down by the hostage', downed(Cee, Cal));
    Cee.at(spot.ep, spot.yaw); await sleep(400); // (facing Cal: his yaw looks back along the line)
    Cee.use(true); await sleep(600);
    ok(`g: E revives Cal (act ${Cee.snap?.me?.a}), the hostage doesn't follow`, Cee.snap?.me?.a === 'bodyRevive' && !Cee.got('msg').some(m => /following you/.test(m.text)));
    Cee.use(false);
  }
}

// ---------------------------------------------------------------- h. elevator -> gas
if (want('h') && E) {
  await nextRound('h');
  let gs = null;
  Cee.on.s = m => { Cee.snap = m; gs = m.gs || null; };
  const conc = i => { const r = gs?.r || []; for (let k = 0; k < r.length; k += 2) if (r[k] === i) return r[k + 1] / GAS.Q; return 0; };
  const LIVING = MAP.rooms.findIndex(r => r.group === 'lampa7');
  away(Tee, LAWN.T1); away(Tom, LAWN.T2);
  const KSPOT = [-17.5, 0.81, -11.5], METER = [-16.6, 1.5, -13.92];
  Cal.at(KSPOT, 0); await sleep(300);
  await shoot(Cal, METER, 400);
  ok('h: a shot holes the kitchen\'s meter', Cal.got('gasLeak').some(m => m.i === 0 && m.s === 1));
  Cal.at([-6, 0, 18], 0);
  const mid = [(E.cabin.x1 + E.cabin.x2) / 2, E.stops[1], (E.cabin.z1 + E.cabin.z2) / 2 - 0.1];
  Cee.at([-6, 0, 16], 0);
  const thick = await until(() => conc(LIVING) >= GAS.ignite + 0.03, 90000);
  ok(`h: the gas reaches the living room (${conc(LIVING).toFixed(2)})`, thick);
  Cee.at(mid, 0); await sleep(300);
  Cee.send({ t: 'elevAim', a: 'b2' }); await sleep(60); Cee.use(true); await sleep(100); Cee.use(false);
  const boom = await until(() => Cal.got('gasBoom').length > 0, 8000);
  const b = Cal.got('gasBoom')[0];
  ok(`h: the lift's motor starts and the gas goes off (${JSON.stringify(b && { i: b.i, k: b.k })})`, boom && b.k === 'motor');
}

for (const c of all) c.close();
console.log(process.exitCode ? 'some checks failed' : 'all passed');
process.exit();
