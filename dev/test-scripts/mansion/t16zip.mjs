// Step 16: the zip line, server side (Mansion; GAME_PORT test server with BOTS=0). A T and a CT, round 1:
// the CT hooks on at the deck on the neighbour's roof and rides down (the snapshot shows him hanging, pose 1, moving
// along the cable; he drops off at the terrace); the T on the terrace shoots him on the way (a hit). He rides down
// again and lets go over the street: the landing hurts (fall damage). He hooks on at the terrace and climbs; the T
// cuts the cable at the tensioner (3 s): he falls, nobody can hook on, and after a restart it's back.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { player, sleep, admin } from './client.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const G = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { MAPS } = await G('shared/maps/index.js');
const { CollisionWorld } = await G('shared/collision.js');
const { fallDamage } = await G('shared/gadgets.js');
const MAP = MAPS[process.env.MAP || 'cs_mansion'], Z = MAP.zip, world = new CollisionWorld(MAP);
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };

const t = await player('Cutter', 'T'), ct = await player('Rider', 'CT');
const CTID = ct.log.find(m => m.t === 'welcome')?.id, ctId = () => CTID;
ct.on.zipEnd = m => { ct.p = m.p.slice(); }; // (a browser carries on from where the server says)
let rows = []; // the CT's snapshot rows while watching
t.on.s = m => { const r = m.pl.find(q => q[0] === ctId()); if (r) rows.push({ at: Date.now(), x: r[1], y: r[2], z: r[3], pose: r[13] }); };
for (let i = 0; i < 150 && !t.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
await sleep(3400); // the freeze time

// ---- ride down from the deck; the T on the terrace shoots him half way
const deck = Z.stands[0].p, terrace = Z.stands[1].p;
t.at([-5.0, 4.27, -6.6], Math.PI / 2); t.w = "glock";
ct.at(deck, -Math.PI / 2); await sleep(300);
ct.clear(); rows = [];
const t0 = Date.now();
ct.use(true); await sleep(80); ct.use(false);
await sleep(300);
const zipMsg = ct.got('zip')[0];
ok('E on the deck hooks the CT on (dir 1)', zipMsg && zipMsg.dir === 1);
await sleep(2200);
const last = rows[rows.length - 1];
ok(`the snapshot shows him hanging (pose ${last?.pose}) under the cable at x ${last?.x}, y ${last?.y}`, last && last.pose === 1 && last.y > 6.5 && last.x < 33);
// shoot at his chest (where the server has him now)
const eye = [-5.0, 4.27 + 1.62, -6.6], chest = [last.x, last.y + 1.2, last.z];
const d = chest.map((v, k) => v - eye[k]), l = Math.hypot(...d);
ct.clear();
t.send({ t: 'shoot', o: eye, d: d.map(v => v / l), w: 'glock' });
await sleep(300);
ok(`a pistol shot from the terrace hits the rider (hp ${ct.got('dmg')[0]?.hp})`, ct.got('dmg').length === 1);
for (let i = 0; i < 100 && !ct.got('zipEnd').length; i++) await sleep(100);
const end = ct.got('zipEnd')[0], secs = (Date.now() - t0) / 1000;
ok(`he drops off at the terrace end after ${secs.toFixed(1)} s (why ${end?.why}, at ${end?.p})`, end && end.why === 'end' && Math.abs(end.p[0] - -4.6) < 0.2 && secs > 5 && secs < 9);
const speeds = rows.slice(1).map((r, i) => Math.hypot(r.x - rows[i].x, r.y - rows[i].y) / Math.max(0.02, (r.at - rows[i].at) / 1000));
ok(`top speed about 10 m/s (${Math.max(...speeds.slice(5, -5)).toFixed(1)}, from the snapshots)`, Math.max(...speeds.slice(5, -5)) < 13.5);
await sleep(300);
ok('his pose is back to normal after', rows[rows.length - 1].pose === 0);

// ---- ride down again, let go over the street: the landing hurts
ct.at(deck, -Math.PI / 2); await sleep(300);
ct.clear();
const hp0 = ct.me?.hp ?? 100;
ct.use(true); await sleep(80); ct.use(false);
await sleep(2500);
ct.send({ t: 'zip', off: 1 });
await sleep(200);
const off = ct.got('zipEnd')[0];
ok(`Space lets go (why ${off?.why}, falling at ${off?.v?.map(v => v.toFixed(1))}) over the street (x ${off?.p?.[0].toFixed(1)})`, off && off.why === 'letgo' && off.p[0] > 24 && off.p[0] < 28.7);
if (off) {
  // fall straight down (the test's own simple physics), sending the position like a browser does
  const g = world.raycast([off.p[0], off.p[1] + 0.1, off.p[2]], [0, -1, 0], 30, 'solid'), ground = off.p[1] + 0.1 - g.t;
  let y = off.p[1], vy = off.v[1];
  ct.p = off.p.slice();
  while (y > ground) { vy -= 20 * 0.02; y = Math.max(ground, y + vy * 0.02); ct.at([off.p[0], y, off.p[2]]); await sleep(20); }
  for (let i = 0; i < 10; i++) { ct.at([off.p[0], ground, off.p[2]]); await sleep(20); }
  await sleep(300);
  const want = fallDamage(off.p[1] - ground);
  const got = ct.got('dmg').map(m => m.d);
  ok(`a ${(off.p[1] - ground).toFixed(1)} m drop hurts (${got.join(',') || 'nothing'}; fallDamage says ${want})`, got.length === 1 && got[0] === want && want > 0);
}

// ---- hook on at the terrace and climb; the T cuts the cable
ct.at(terrace, Math.PI / 2); await sleep(300);
ct.clear(); t.clear();
ct.use(true); await sleep(80); ct.use(false);
await sleep(1000);
ok('E at the terrace hooks him on going up (dir -1)', ct.got('zip')[0]?.dir === -1);
t.at([-5.4, 4.27, -8.0], -Math.PI / 2); await sleep(200);
t.use(true); await sleep(1500);
const sawing = t.got('sfx').some(m => m.s === 'zipsaw');
await sleep(1800); t.use(false);
await sleep(300);
ok('the T saws at it (a sound everyone hears)', sawing);
ok(`after 3 s it's cut: the gadgets state says so (${JSON.stringify(t.got('gadgets').slice(-1)[0])}) and it snaps`, t.got('gadgets').slice(-1)[0]?.zipCut === 1 && t.got('sfx').some(m => m.s === 'zipsnap'));
ok(`the climber falls (zipEnd ${ct.got('zipEnd')[0]?.why})`, ct.got('zipEnd')[0]?.why === 'cut');
if (ct.got('zipEnd')[0]) { const p = ct.got('zipEnd')[0].p, g = world.raycast([p[0], p[1] + 0.1, p[2]], [0, -1, 0], 30, 'solid'); ct.at([p[0], p[1] + 0.1 - g.t, p[2]]); }
await sleep(300);
ct.at(terrace, Math.PI / 2); await sleep(300);
ct.clear();
ct.use(true); await sleep(80); ct.use(false); await sleep(400);
ok('nobody can hook on to a cut cable', !ct.got('zip').length);

// ---- a restart: it's back
t.clear();
await admin({ action: 'restart' });
for (let i = 0; i < 60 && !t.got('gadgets').some(m => m.zipCut === 0); i++) await sleep(100);
ok('after a restart the cable is back', t.got('gadgets').some(m => m.zipCut === 0));
t.close(); ct.close();
process.exit();
