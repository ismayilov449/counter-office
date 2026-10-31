// Step 15: the FPV drone, server side (Mansion; GAME_PORT test server with START_MONEY=16000, BOTS=0).
// Warmup, the T alone ($16000 for three things): a jammer and a drone that flies into it; then a drone (a second is
// refused): launch, fly (the snapshot shows it), drop the bomb, land it by the pilot (back in the bag), relaunch,
// fly it out of range.
// Then a CT joins (the match starts): round 1, its camera spots the CT for the T radar, the bomb and a dive hit him;
// round 2, the CT shoots one down.
import { player, sleep } from './client.mjs';
const t = await player('Pilot', 'T');
await sleep(500);
const t0 = Date.now(), ev = [];
const log = (who, m) => ev.push(`${((Date.now() - t0) / 1000).toFixed(1)} ${who} ${m}`);
const watch = (c, who) => {
  c.on.droneStart = m => log(who, `droneStart id ${m.id} left ${Math.round(m.left)} bomb ${m.bomb}`);
  c.on.droneEnd = m => log(who, `droneEnd ${m.why}`);
  c.on.droneDown = m => log(who, `droneDown at ${m.p.map(v => v.toFixed(1))}`);
  c.on.boom = m => log(who, `boom ${m.k} at ${m.p.map(v => (+v).toFixed(1))}`);
  c.on.nade = m => log(who, `nade ${m.k}`);
  c.on.msg = m => { if (/drone|Drone|jammer|funds/.test(m.text)) log(who, `msg: ${m.text}`); };
  c.on.dmg = m => log(who, `hurt: hp ${m.hp}`);
};
watch(t, 'T');
let dn = null, sp = [], spSeen = false;
t.on.s = m => { dn = m.dn || null; if (m.sp) { sp = m.sp; if (m.sp.length) spSeen = true; } };
const pilotAt = [-6, 0, -18], eye = [-6, 0.76, -18];
t.at(pilotAt, Math.PI / 2, 0, 1); await sleep(300);
const fly = async (from, to, secs, yaw = Math.PI / 2) => {
  const n = Math.ceil(secs / 0.05);
  for (let i = 1; i <= n; i++) { t.send({ t: 'drone', p: from.map((v, j) => v + (to[j] - v) * (i / n)), yaw, pitch: -0.6 }); await sleep(50); }
  return to;
};
const launch = async () => { const p = [eye[0] - 0.6, eye[1] + 0.1, eye[2]]; t.send({ t: 'drone', launch: 1, p, yaw: Math.PI / 2 }); await sleep(250); return p; };
const buy = async () => { t.send({ t: 'buy', item: 'drone' }); await sleep(250); };

// ---- warmup: a jammer on the lawn 22 m east of the pilot; the drone flies into its area
t.send({ t: 'buy', item: 'jammer' }); await sleep(250);
t.at([16, 0, -18], Math.PI / 2, 0, 0); await sleep(150);
t.send({ t: 'jammer', p: [16, 0, -18.5], yaw: 0 }); await sleep(250);
t.at(pilotAt, Math.PI / 2, 0, 1); await sleep(150);
await buy(); let p = await launch();
p = await fly(p, [-6, 3, -18], 0.3);
p = await fly(p, [6, 3, -18], 1.5); await sleep(400);
await sleep(2000); // (it falls)
// ---- warmup: the next drone
await buy();
console.log('bought:', t.me?.inv?.drone, '| second buy:', (await buy(), t.got('msg').map(m => m.text).filter(x => /drone/i.test(x)).slice(-1)[0]));
p = await launch();
console.log('after launch, snapshot drones:', JSON.stringify(dn), '| pilot crouched with the remote:', JSON.stringify(t.log.filter(m => m.t === 's').slice(-1)[0]?.pl?.find(q => q[0] === t.log.find(m => m.t === 'welcome')?.id)?.slice(6, 8)));
p = await fly(p, [-6, 6, -18], 1.0);
p = await fly(p, [2, 6, -18], 1.0);
t.send({ t: 'drone', p, drop: 1 }); await sleep(2200); // the bomb falls onto the lawn
log('T', 'drone after the drop: ' + JSON.stringify(dn));
p = await fly(p, [-7.5, 2, -18], 0.6);
p = await fly(p, [-7.5, 0.15, -18], 0.6);
t.send({ t: 'drone', p, land: 1 }); await sleep(400);
console.log('inventory after landing by the pilot:', t.me?.inv?.drone);
p = await launch(); // (the same one again)
p = await fly(p, [-6, 3, -18], 0.3);
p = await fly(p, [40, 3, 20], 4.0); await sleep(400); // out of range, through the walls

// ---- a CT joins: the match starts; round 1
const ct = await player('Target', 'CT');
watch(ct, 'CT');
for (let i = 0; i < 100 && t.got('msg').every(m => !/Guard the hostages/.test(m.text)) ; i++) await sleep(100); // freeze over? (message at round start)
await sleep(3300); // the freeze time
t.at([-10, 4.27, -5], 0, 0, 0); await sleep(200); await buy(); // in the T buy zone (the house)
log('T', `bought in round 1: ${t.me?.inv?.drone}`);
t.at(pilotAt, Math.PI / 2, 0, 1); ct.at([4, 0, -10], Math.PI); await sleep(300);
p = await launch();
p = await fly(p, [-6, 8, -18], 1.0, Math.PI);
p = await fly(p, [3, 8, -15], 1.2, Math.PI); // looking south at the CT, who's out of the pilot's sight
await sleep(800);
log('T', `radar spotted the CT while the drone looked: ${spSeen}`);
t.send({ t: 'drone', p: [4, 8, -10.2], drop: 1 }); await sleep(2000);
log('CT', '(the bomb has landed)');
t.send({ t: 'drone', dive: 1 });
p = await fly([4, 8, -10.2], [4, 1.2, -10], 0.4, Math.PI);
t.send({ t: 'drone', p, boom: p }); await sleep(600);
log('CT', '(the dive has hit)');
// ---- round 2: the CT shoots it down
for (let i = 0; i < 120 && !t.got('msg').some(m => /Guard the hostages/.test(m.text) && m !== undefined) ; i++) await sleep(100);
t.clear();
for (let i = 0; i < 120 && !t.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
await sleep(3300);
t.at([-10, 4.27, -5], 0, 0, 0); await sleep(200); await buy();
log('T', `bought in round 2: ${t.me?.inv?.drone}`);
t.at(pilotAt, Math.PI / 2, 0, 1); await sleep(200);
p = await launch();
p = await fly(p, [-6, 3, -18], 0.6);
const ctEye = [4, 1.62, -18];
ct.at([4, 0, -18], Math.PI / 2); ct.w = 'usp'; await sleep(300);
const d = p.map((v, i) => v - ctEye[i]), l = Math.hypot(...d);
ct.send({ t: 'shoot', o: ctEye, d: d.map(v => v / l), w: 'usp', rt: 0 }); await sleep(800);
console.log('events:\n  ' + ev.join('\n  '));
t.close(); ct.close(); process.exit(0);
