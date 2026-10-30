// Signal jammer, server logic, with two clients on de_dust2 (warmup, no bots):
//  T buys and places a jammer at the T spawn; spotting near/inside; CT radar ('sp') empty inside; ping refused inside;
//  a second jammer can't be bought; CT shoots it 3 times -> 'jamdown' and the list is empty.
const G = 'file:///C:/Users/Rufat.Ismayilov/Desktop/CS1.6/';
const { MAPS } = await import(G + 'shared/maps/index.js');
const map = MAPS.de_dust2;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(name, team) {
  const c = { name, msgs: [], sp: null, me: null, seq: 0, ws: new WebSocket('ws://127.0.0.1:3999/ws') };
  c.ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'welcome') { c.id = m.id; c.ws.send(JSON.stringify({ t: 'join', name, team })); }
    else if (m.t === 's') c.sp = m.sp;
    else if (m.t === 'spawn') c.seq = m.sq;
    else if (m.t === 'me') c.me = m;
    else c.msgs.push(m);
  };
  c.send = o => c.ws.send(JSON.stringify(o));
  c.at = (p, yaw = 0) => { c.p = p; c.yaw = yaw; c.send({ t: 'state', sq: c.seq, p, yaw, pitch: 0, c: 0, w: c.w || 'knife' }); };
  return c;
}
const T = client('JamT', 'T'), CT = client('JamCT', 'CT');
await sleep(6500); // (the match starts 3 s after both teams have a player, then 1 s freeze)
const base = map.spawns.T[0].p;
const ok = (label, v) => console.log((v ? 'PASS ' : 'FAIL ') + label);
// a spot far from the jammer: the CT spawn
const far = map.spawns.CT[0].p;
// keep both positions fresh
let posT = base, posCT = far, yawCT = 0;
const keep = setInterval(() => { T.at(posT); CT.at(posCT, yawCT); }, 50);
await sleep(300);
T.send({ t: 'buy', item: 'jammer' }); await sleep(300);
ok('T bought a jammer', T.me?.inv?.jammer === 1); console.log('  T says:', T.msgs.filter(m => m.t === 'msg').map(m => m.text).join(' | '), 'money', T.me?.money);
T.send({ t: 'jammer', p: base, yaw: 0 }); await sleep(300);
const list = T.msgs.filter(m => m.t === 'jammers').pop()?.list;
ok('jammer placed and broadcast', list?.length === 1);
const J = list[0].slice(2, 5);
T.send({ t: 'buy', item: 'jammer' }); await sleep(300);
ok('second jammer refused', T.me?.inv?.jammer === 0 && T.msgs.some(m => m.t === 'msg' && /already/.test(m.text)));
// both far from the jammer, side by side: spotted
posT = [far[0] + 1, far[1], far[2]]; posCT = far; await sleep(600);
ok('T spotted next to the CT away from the jammer', CT.sp?.some(r => r[0] === T.id));
// T inside the jammer's area, CT just outside it, 1.5 m apart (no field-of-view check that close)
const dir = [1, 0];
posT = [J[0], J[1], J[2]]; posCT = [J[0] + 1.2, J[1], J[2]]; await sleep(600);
ok('CT inside the area gets an empty radar', Array.isArray(CT.sp) && CT.sp.length === 0);
CT.send({ t: 'mark', p: [J[0], J[1], J[2] + 3] }); await sleep(300);
ok('ping refused inside the area', CT.msgs.some(m => m.t === 'msg' && /jammed/i.test(m.text)));

// T just inside the area, CT just outside it (1.5 m apart): T must not be spotted — in each of 4 directions
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inside = [];
for (const [dx, dz] of dirs) {
  posT = [J[0] + dx * 13.8, J[1], J[2] + dz * 13.8]; posCT = [J[0] + dx * 15.3, J[1], J[2] + dz * 15.3]; await sleep(500);
  inside.push(CT.sp?.some(r => r[0] === T.id) ? 1 : 0);
}
ok('enemy inside the area not spotted from outside (' + inside.join('') + ')', inside.every(v => !v));
// CT shoots the jammer from 3 m, 3 times
posT = far; posCT = [J[0] + 3, J[1], J[2]]; yawCT = Math.PI / 2; CT.w = 'usp'; await sleep(300);
const eye = [posCT[0], posCT[1] + 1.64, posCT[2]], aim = [J[0], J[1] + 0.2, J[2]];
const d = aim.map((v, i) => v - eye[i]), l = Math.hypot(...d);
for (let i = 0; i < 3; i++) { CT.send({ t: 'shoot', w: 'usp', o: eye, d: d.map(v => v / l) }); await sleep(350); }
await sleep(300);
ok('three shots destroy it (jamdown)', CT.msgs.some(m => m.t === 'jamdown'));
ok('list empty after', T.msgs.filter(m => m.t === 'jammers').pop()?.list.length === 0);
const after = [];
for (const [dx, dz] of dirs) {
  posT = [J[0] + dx * 13.8, J[1], J[2] + dz * 13.8]; posCT = [J[0] + dx * 15.3, J[1], J[2] + dz * 15.3]; await sleep(500);
  after.push(CT.sp?.some(r => r[0] === T.id) ? 1 : 0);
}
console.log('  control, same spots without the jammer (spotted per direction):', after.join(''));
clearInterval(keep);
process.exit(0);
