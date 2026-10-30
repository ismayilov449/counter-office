// Satchel charge on cs_mansion: throw (browser T), defuse (raw CT), shoot it (raw CT), set off with the phone,
// stick one on the pickup and drive it away before setting it off (raw T2 + CT), owner dead = no detonation.
import { open, bot, sleep } from './tw-lib.mjs';
const WT = 'C:/Users/Rufat.Ismayilov/Desktop/CS1.6/.claude/worktrees/agent-a01c73aa3d67d1462';
const { MAPS } = await import('file:///' + WT + '/shared/maps/index.js');
const { CollisionWorld } = await import('file:///' + WT + '/shared/collision.js');
const coll = new CollisionWorld(MAPS.cs_mansion);
const ground = (x, z, from = 10) => { const h = coll.raycast([x, from, z], [0, -1, 0], 30, 'solid'); return h ? from - h.t : 0; };

const t = await open('T', 'Bomber');
const { ev, send, msgs, click, key, shot, errors, mouse } = t;
const raw = async (team, name) => {
  const b = await bot(); b.send({ t: 'join', name, team });
  b.seq = () => [...b.inbox].reverse().find(m => m.t === 'spawn')?.sq;
  b.go = (p, yaw = 0, pitch = 0, w = 'usp') => b.send({ t: 'state', sq: b.seq(), p, yaw, pitch, c: 0, w });
  b.msgs = k => b.inbox.filter(m => m.t === k);
  return b;
};
const ct = await raw('CT', 'Defuser');
const t2 = await raw('T', 'Bomber2');
ct.send({ t: 'buy', item: 'vesthelm' });
await sleep(12000);
ct.send({ t: 'buy', item: 'vesthelm' });
const sat = () => JSON.parse(ev ? '[]' : '[]');
const satList = async () => { const l = ct.msgs('satchels').pop()?.list || []; return l; };
const texts = b => b.msgs('msg').map(m => m.text);

// 1. buy, hold, throw
await send({ t: 'buy', item: 'satchel' }); await sleep(500);
await key('Digit6'); await sleep(900);
console.log('1 msgs:', (await msgs(false)).map(m => m.text || (m.t === 'me' ? 'me sat=' + m.inv.satchel + ' alive=' + m.alive : m.t)).join(' | '));
console.log('1 holding:', await ev("document.getElementById('weapon-name').textContent"));
await shot('sat-hold.png');
await mouse('mousemove', { movementX: 0, movementY: 40 }); await sleep(100);
await click(0, 900); await sleep(1400);
let list = await satList();
console.log('1 after throw: satchels', JSON.stringify(list), 'holding', await ev("document.getElementById('weapon-name').textContent"));
await shot('sat-stuck.png');
console.log('errors so far:', errors.slice(0, 3).join(' || '), 'T msgs:', (await msgs(false)).slice(-4).map(m => m.text || m.t).join(' | '));
if (!list.length) process.exit(1);

// 2. the CT walks up and defuses it
const S = l => ({ p: [l[4], l[5], l[6]], n: [l[7], l[8], l[9]] });
let s = S(list[0]);
const stand = s => { const x = s.p[0] + s.n[0] * 0.7, z = s.p[2] + s.n[2] * 0.7; return [x, ground(x, z, s.p[1] + 0.5), z]; };
ct.go(stand(s)); await sleep(200);
ct.send({ t: 'use', on: true }); await sleep(3400); ct.send({ t: 'use', on: false });
await sleep(300);
console.log('2 defuse:', texts(ct).filter(x => /atchel/.test(x)), 'list now', JSON.stringify(await satList()));

// 3. throw another, the CT shoots it from 3 m
await send({ t: 'buy', item: 'satchel' }); await sleep(500);
await key('Digit6'); await sleep(900);
await click(0, 900); await sleep(1400);
list = await satList(); s = S(list[0]);
const back = [s.p[0] + s.n[0] * 5, 0, s.p[2] + s.n[2] * 5]; back[1] = ground(back[0], back[2], s.p[1] + 1);
ct.go(back); await sleep(200);
const eye = [back[0], back[1] + 1.6, back[2]], dv = s.p.map((v, k) => v - eye[k]), dl = Math.hypot(...dv);
await msgs();
ct.send({ t: 'shoot', w: 'usp', o: eye, d: dv.map(v => v / dl) }); await sleep(800);
console.log('3 shot it:', (await msgs()).filter(m => m.t === 'boom' || m.t === 'brk').map(m => m.t + (m.k ? ':' + m.k : '') + (m.ids ? `(${m.ids.length})` : '')).join(' '), 'list', JSON.stringify(await satList()));
ct.go([27.5, 0, -18]); // back out of the way

// 4. throw a third, set it off with the phone
await send({ t: 'buy', item: 'satchel' }); await sleep(500);
await key('Digit6'); await sleep(900);
await click(0, 900); await sleep(1400);
console.log('4 holding:', await ev("document.getElementById('weapon-name').textContent"));
await shot('sat-phone.png');
await sleep(700); await click(0, 900);
await shot('sat-boom.png');
await sleep(1200);
console.log('4 phone:', (await msgs()).filter(m => m.t === 'boom' || m.t === 'brk').map(m => m.t + (m.k ? ':' + m.k : '') + (m.ids ? `(${m.ids.length})` : '')).join(' '), 'list', JSON.stringify(await satList()), 'holding', await ev("document.getElementById('weapon-name').textContent"));

// 5. on the pickup: T2 throws it at the truck's side, the CT drives off, T2 sets it off
t2.send({ t: 'buy', item: 'satchel' }); await sleep(400);
const car = MAPS.cs_mansion.vehicles[0];
const from = [car.p[0], 0, car.p[1] - 4]; from[1] = ground(from[0], from[2]);
t2.go(from, Math.PI, 0, 'satchel'); await sleep(200);
t2.send({ t: 'satchel', o: [from[0], from[1] + 1.5, from[2]], v: [0, 1.5, 12] }); await sleep(1200);
list = await satList();
console.log('5 on car:', JSON.stringify(list));
const cp = [car.p[0] + 2, ground(car.p[0] + 2, car.p[1] + 1.5), car.p[1] + 1.5];
ct.go([car.p[0] + 1.5, ground(car.p[0] + 1.5, car.p[1] + 1.5), car.p[1] + 1.5]); await sleep(200);
ct.send({ t: 'use', on: true }); await sleep(200); ct.send({ t: 'use', on: false });
console.log('5 drive:', JSON.stringify(ct.msgs('drive').pop()));
const c0 = ct.msgs('drive').pop()?.car;
if (c0) for (let i = 1; i <= 4; i++) { ct.send({ t: 'car', id: 0, p: [c0.p[0] + i * 2.5, c0.p[1], c0.p[2]], yaw: c0.yaw, speed: 2, steer: 0 }); await sleep(150); }
ct.send({ t: 'use', on: true }); await sleep(200); ct.send({ t: 'use', on: false }); await sleep(200); // out of the car
ct.go([27.5, 0, -18]); await sleep(200);
await msgs();
t2.send({ t: 'satchel', det: 1 }); await sleep(600);
console.log('5 boom:', (await msgs()).filter(m => m.t === 'boom').map(m => m.k + '@' + m.p.join(',')).join(' '), 'car started at', c0 && c0.p.join(','));

// 6. owner dead: T2 throws one, dies, can't set it off; it can still be defused
await sleep(1500);
t2.go(MAPS.cs_mansion.spawns.T[1].p, 0, 0, 'usp'); await sleep(200);
t2.send({ t: 'buy', item: 'satchel' }); await sleep(300);
const spot = [car.p[0] - 6, 0, car.p[1] - 4]; spot[1] = ground(spot[0], spot[2]);
t2.go(spot, Math.PI, -0.5, 'satchel'); await sleep(200);
t2.send({ t: 'satchel', o: [spot[0], spot[1] + 1.5, spot[2]], v: [0, -2, 6] }); await sleep(1000);
list = await satList();
console.log('6 thrown:', JSON.stringify(list));
// the CT shoots T2 in the head from 2 m
const ce = [spot[0] + 2, spot[1] + 1.6, spot[2]];
ct.go([ce[0], spot[1], ce[2]]); await sleep(200);
for (let i = 0; i < 4 && !ct.msgs('kill').some(m => m.v === t2.inbox.find(x => x.t === 'welcome')?.id); i++) {
  const hd = [spot[0] - ce[0], spot[1] + 1.62 - ce[1], spot[2] - ce[2]], hl = Math.hypot(...hd);
  ct.send({ t: 'shoot', w: 'usp', o: ce, d: hd.map(v => v / hl) }); await sleep(250);
}
console.log('6 T2 killed:', ct.msgs('kill').map(m => m.v + ' by ' + m.k + ' ' + m.w).join(' | '));
await msgs();
t2.send({ t: 'satchel', det: 1 }); await sleep(600);
console.log('6 dead owner det -> booms:', (await msgs()).filter(m => m.t === 'boom').length, 'list', JSON.stringify(await satList()));
s = S((await satList())[0]);
ct.go(stand(s)); await sleep(200);
ct.send({ t: 'use', on: true }); await sleep(3400); ct.send({ t: 'use', on: false }); await sleep(300);
console.log('6 defused:', texts(ct).filter(x => /atchel/.test(x)).length, 'list', JSON.stringify(await satList()));
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
