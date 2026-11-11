// Explosives in the browser (GAME_PORT=3995 CDP_PORT=9335 MAP=cs_mansion, server BOTS=0 START_MONEY=16000
// FREEZE_TIME=1 ROUND_TIME=40). The browser is Alice; scripted Bob and Carl (T), Dave (CT).
// CT round: 7.1 the grab hint over Bob's grenade at her feet, E: "GRENADE IN YOUR HAND", a click throws it (a nade
// of hers); 7.3 Bob arms his switch: looking at him, the warning line, his red light (screenshot); 7.4 E on his
// satchel: the defuse bar offers the wires, 1 cuts the red one (defused or blown).
// T round (Alice switched to T): 7.2 Dave kills Carl; Alice buys an HE: crouched over Carl the hint offers the trap,
// holding E the bar says "Hiding the grenade", then the body is trapped; 7.3 her own satchel, the phone out: the hint
// offers the switch, right-click arms it ("ARMED" hint). No page errors.
import { open, sleep } from '../mansion/game.mjs';
import { player, until, checker, got } from './lib.mjs';
const ok = checker();
const rounds = [];
const bob = await player('Bob', 'T');
bob.on.round = m => rounds.push(m.n);
const carl = await player('Carl', 'T'), dave = await player('Dave', 'CT');
const g = await open('CT', 'Alice', ['msg', 'boom', 'nade', 'xpHot', 'xpGrab', 'xpDms', 'xpTraps', 'sfx', 'satchels', 'me']);
const text = id => g.ev(`document.getElementById('${id}').textContent`);
const base = [-22.25, 4.27, 8.941];
async function live(n = rounds.length) {
  await until(() => rounds.length > n, 90000, 200);
  await sleep(1500);
}

// ---------------------------------------------------------------- CT round
await live();
bob.at(base, Math.PI / 2, 0); bob.send({ t: 'buy', item: 'he' }); bob.send({ t: 'buy', item: 'satchel' });
carl.at([base[0] - 3, base[1], base[2] + 3], 0, 0); dave.at([base[0] + 6, base[1], base[2] + 3], 0, 0);
const A = [base[0] + 2, base[1], base[2]];
await g.tp(A, Math.PI / 2); // (looking west, at Bob)
await sleep(800);
await g.msgs();
// 7.1 (a headless page draws 1-3 frames a second: E and the click go at once, looking away first; the hint and the
// in-hand line are checked on their own)
await g.look(Math.PI, 0); // (turned round: thrown away from everyone)
// (the page reacts inside its own message events: an evaluate waits for a frame, too late for a 1.6 s fuse. E goes as
// startUse sends it; the click goes through the game's mousedown handler, so through xp.throwBack.)
await g.ev(`(() => { const ws = __ws; ws.addEventListener('message', function f(e) { const m = JSON.parse(e.data);
  if (m.t === 'nade' && m.owner !== undefined && !window.__grabbed) { window.__grabbed = 1; ws.send(JSON.stringify({ t: 'use', on: true })); ws.send(JSON.stringify({ t: 'use', on: false })); }
  if (m.t === 'xpHot' && m.ms > 0) { document.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); document.dispatchEvent(new MouseEvent('mouseup', { button: 0 })); ws.removeEventListener('message', f); }
}); return 1; })()`);
bob.send({ t: 'nade', k: 'he', o: [A[0] - 0.3, A[1] + 0.4, A[2]], v: [0, 0, 0] });
await sleep(1500);
let m = await g.msgs(), h = '';
ok('7.1 grabbed (xpHot)', m.some(x => x.t === 'xpHot' && x.ms > 0));
ok('7.1 thrown back (a nade with what was left of the fuse)', m.some(x => x.t === 'nade' && x.fu > 0 && x.fu < 1.6));
await g.ev("import('/js/explosives.js').then(x => x.handlers.xpHot({ ms: 5000 }))");
for (let i = 0; i < 20 && !/IN YOUR HAND/.test(h); i++) { await sleep(100); h = await text('hint'); }
ok(`7.1 the in-hand line: "${h}"`, /IN YOUR HAND/.test(h));
await g.shot('xp-hot.png');
await g.ev("import('/js/explosives.js').then(x => x.handlers.xpHot({ ms: 0 }))");
await sleep(1500);
await g.look(-Math.PI, 0);
bob.send({ t: 'buy', item: 'he' });
await sleep(300);
bob.send({ t: 'nade', k: 'he', o: [A[0] - 0.3, A[1] + 0.4, A[2]], v: [0, 0, 0] });
for (let i = 0; i < 10 && !/grab the grenade/.test(h); i++) { await sleep(60); h = await text('hint'); }
ok(`7.1 the hint: "${h}"`, /grab the grenade/.test(h));
await g.tp([A[0] + 9, A[1], A[2]], Math.PI / 2); // (away before it goes off)
await sleep(2000);
await g.tp(A, Math.PI / 2);
// 7.3 (CT side)
bob.send({ t: 'satchel', o: [base[0] - 0.5, base[1] + 1.5, base[2]], v: [-3, -5, 0] });
await sleep(1200);
bob.w = 'phone'; bob.at(base, Math.PI / 2, 0);
await sleep(300);
bob.send({ t: 'xpDms' });
let s = '';
for (let i = 0; i < 20 && !/DEAD MAN/.test(s); i++) { await sleep(150); s = await text('small-msg'); }
ok(`7.3 the CT's warning: "${s}"`, /DEAD MAN'S SWITCH/.test(s));
await g.shot('xp-dms-ct.png');
bob.w = 'glock'; bob.at(base, Math.PI / 2, 0);
await sleep(400);
// 7.4
const sat = (await g.msgs()).filter(x => x.t === 'satchels').at(-1)?.list?.[0];
ok('7.4 Bob\'s satchel lies there', !!sat);
if (sat) {
  await g.tp([sat[4] + 0.6, base[1], sat[6]], Math.PI / 2);
  bob.at([base[0] - 14, base[1], base[2]], 0, 0); carl.at([base[0] - 14, base[1], base[2] + 2], 0, 0);
  await sleep(500);
  await g.keyDown('KeyE');
  let p = '';
  for (let i = 0; i < 15 && !/red wire/.test(p); i++) { await sleep(80); p = await text('progress-label'); }
  ok(`7.4 the defuse bar: "${p}"`, /1 cuts the red wire, 2 the blue/.test(p));
  await g.shot('xp-wire.png');
  await g.key('Digit1', 150);
  m = [];
  for (let i = 0; i < 20 && !m.some(x => /right one|wrong one/.test(x.text || '') || x.t === 'boom'); i++) { await sleep(150); m = m.concat(await g.msgs()); }
  await g.keyUp('KeyE');
  const right = m.some(x => x.t === 'msg' && /right one/.test(x.text)), wrong = m.some(x => x.t === 'boom' && x.k === 'satchel');
  ok(`7.4 the red wire cut: ${right ? 'right, defused' : wrong ? 'wrong, blown' : 'nothing'}`, right !== wrong);
}

// ---------------------------------------------------------------- T round
const n0 = rounds.length;
await g.send({ t: 'team', team: 'T' });
// (end the round: Bob shoots Dave, and Alice where she's put)
{
  const AP = [base[0] + 3, base[1], base[2] + 1];
  bob.w = 'glock'; bob.at(base, 0, 0); dave.at([base[0] + 3, base[1], base[2] - 1], 0, 0);
  if (!(await g.ev("document.getElementById('hint').textContent")).includes('respawn')) await g.tp(AP, Math.PI / 2);
  await sleep(500);
  for (let i = 0; i < 12 && dave.alive; i++) { bob.shootAt(dave, 'glock', 'head'); await sleep(350); }
  for (let i = 0; i < 12; i++) { bob.shootAt({ p: AP, crouch: 0 }, 'glock', 'head'); await sleep(350); }
}
await live(n0);
await sleep(500);
await g.send({ t: 'buy', item: 'he' }); await g.send({ t: 'buy', item: 'satchel' });
await sleep(300);
const C = [base[0] + 2, base[1], base[2]], D = [base[0] + 5, base[1], base[2]];
carl.at(C, 0, 0); dave.at(D, Math.PI / 2, 0); bob.at([base[0] - 4, base[1], base[2] + 3], 0, 0);
await sleep(400);
dave.w = 'usp';
for (let i = 0; i < 10 && carl.alive; i++) { dave.shootAt(carl, 'usp', 'head'); await sleep(400); }
ok('7.2 Dave killed Carl', !carl.alive);
dave.at([base[0] + 20, base[1], base[2]], 0, 0); // (away)
await g.tp([C[0] - 0.7, C[1], C[2]], -Math.PI / 2);
await sleep(500);
await g.keyDown('ControlLeft');
await sleep(500);
h = await text('hint');
ok(`7.2 crouched over Carl: "${h}"`, /hide your HE grenade under Carl/.test(h));
await g.keyDown('KeyE');
let pl = '';
for (let i = 0; i < 15 && !/Hiding/.test(pl); i++) { await sleep(100); pl = await text('progress-label'); }
ok(`7.2 the bar: "${pl}"`, /Hiding the grenade/.test(pl));
await sleep(2200);
await g.keyUp('KeyE');
await g.keyUp('ControlLeft');
m = await g.msgs();
ok('7.2 trapped (xpTraps lists Carl)', m.some(x => x.t === 'xpTraps' && x.list.some(r => r[0] === carl.id())));
// 7.3 (T side): her own satchel, then the phone
await g.send({ t: 'satchel', o: [C[0] - 0.7, C[1] + 1.5, C[2]], v: [-3, -5, 0] });
await sleep(1200);
await g.key('Digit6');
await sleep(2500); // (the phone has to reach the server in a position update first)
h = await text('hint');
ok(`7.3 the phone out: "${h}"`, /right-click: dead man's switch/.test(h));
await g.click(2, 60);
for (let i = 0; i < 30 && !/ARMED/.test(h); i++) { await sleep(100); h = await text('hint'); }
ok(`7.3 armed: "${h}"`, /DEAD MAN'S SWITCH ARMED/.test(h));
await g.shot('xp-dms-t.png');

ok(`no page errors ${JSON.stringify(g.errors)}`, g.errors.length === 0);
for (const c of [bob, carl, dave]) c.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
