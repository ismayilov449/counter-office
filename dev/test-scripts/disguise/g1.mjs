// Disguise in the browser (headless Edge on CDP_PORT, game on GAME_PORT: MAP=aim_map BOTS=0 FREEZE_TIME=1).
// Scripted: Bob and Carl (T), Dave (CT). Three parts, a round each:
// 1. The browser is Alice (CT). Dave kills Bob; Alice stands over him (hint), crouches (Ctrl: hint), holds E (progress
//    bar), is disguised (badge, the T sleeves on her arms), then fires: "DISGUISE BLOWN".
// 2. The browser is a CT ("Watcher"); a scripted Alice takes Bob's uniform: the teammate's view (her own model and name,
//    the mask marker over her head).
// 3. The browser is a T ("Viewer"); a scripted Alice takes Bob's uniform: the enemy's view (a T named "Bob"), then she
//    walks up in front of him: "IMPOSTOR: Alice", and she's a CT again.
// Screenshots go to OUT (dg_*.png); page errors are printed.
import { open, sleep } from '../mansion/game.mjs';
import { player, until, yawTo, checker } from './lib.mjs';
const ok = checker();
const KEEP = ['msg', 'disguiseOn', 'disguiseOff', 'disguiseFx', 'round'];
const errorsAll = [];

const bob = await player('Bob', 'T'), dave = await player('Dave', 'CT'), carl = await player('Carl', 'T'); // (this order: auto team balance)
bob.w = 'glock'; carl.w = 'glock'; dave.w = 'usp';
const rounds = [];
bob.on.round = m => rounds.push(m.n);
const rosterAlive = name => bob.got('roster').at(-1)?.list.find(q => q.name === name)?.alive;
async function newRound(browserName) {
  const n = rounds.length;
  await until(() => rounds.length > n, 90000, 100);
  for (const c of [dave, carl]) c.send({ t: 'reload', w: c.w });
  await sleep(1500);
  await until(() => bob.snap?.ph === 'live', 10000);
  await sleep(300);
  ok(`a new round: the browser's ${browserName} is alive`, await until(() => rosterAlive(browserName) === true, 3000));
}
async function kill(shooter, victim) {
  for (let i = 0; i < 12 && victim.alive; i++) {
    if (i === 5) { shooter.send({ t: 'reload', w: shooter.w }); await sleep(3000); }
    shooter.shootAt(victim, shooter.w); await sleep(450);
  }
  return !victim.alive;
}
const B = [0, 0, 5], AB = [0.6, 0, 5];
const ctrl = (g, down) => g.cmd('Input.dispatchKeyEvent', down
  ? { type: 'rawKeyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 }
  : { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
const text = (g, id) => g.ev(`document.getElementById('${id}')?.textContent || ''`);
const badgeText = g => g.ev("[...document.querySelectorAll('#hud > div')].find(d => /DISGUISED/.test(d.textContent) && d.style.display !== 'none')?.textContent || ''");

// ---------------------------------------------------------------- 1: the wearer (the browser is Alice)
let g = await open('CT', 'Alice', KEEP);
await newRound('Alice');
bob.at(B, Math.PI); carl.at([-15, 0, 20], 0); dave.at([0, 0, -3], 0);
await sleep(700);
ok('Dave kills Bob', await kill(dave, bob));
await g.tp(AB, yawTo(AB, B), -0.9);
await sleep(600);
const h1 = await text(g, 'hint');
ok(`standing over Bob, the hint: "${h1}"`, /Crouch and hold E to put on Bob's uniform/.test(h1));
await ctrl(g, true); await sleep(500);
const h2 = await text(g, 'hint');
ok(`crouched: "${h2}"`, /^Hold E to put on Bob's uniform/.test(h2));
await g.shot('dg_hint.png');
await g.keyDown('KeyE'); await sleep(1500);
const pl = await text(g, 'progress-label'), shown = await g.ev("!document.getElementById('progress').classList.contains('hidden')");
ok(`holding E: the progress bar "${pl}"`, shown && pl === 'Putting on the uniform...');
await g.shot('dg_changing.png');
await sleep(2200);
await g.keyUp('KeyE'); await ctrl(g, false);
await sleep(500);
const m1 = await g.msgs();
ok('disguiseOn came', m1.some(m => m.t === 'disguiseOn' && m.you && m.as === 'Bob'));
const bt = await badgeText(g);
ok(`the badge: "${bt}"`, /DISGUISED/.test(bt) && /Bob's uniform/.test(bt));
ok(`the centre message: "${await text(g, 'center-msg')}"`, /DISGUISED/.test(await text(g, 'center-msg')));
await g.tp(AB, yawTo(AB, [0, 0, 20]), 0);
await sleep(800);
await g.shot('dg_wearer.png'); // the badge, and Terrorist sleeves on the arms
await g.click(0, 120);
await sleep(600);
const m2 = await g.msgs();
ok('a shot: disguiseOff ("shot")', m2.some(m => m.t === 'disguiseOff' && m.you && m.why === 'shot'));
ok(`"${await text(g, 'center-msg')}"`, /DISGUISE BLOWN/.test(await text(g, 'center-msg')));
ok('the badge is gone', !(await badgeText(g)));
await g.shot('dg_blown.png');
errorsAll.push(...g.errors.map(e => 'part 1: ' + e));
// end the round: Dave kills Carl
carl.at([-6, 0, 2], 0); dave.at([0, 0, -3], yawTo([0, 0, -3], [-6, 0, 2])); await sleep(600);
await kill(dave, carl);

// ---------------------------------------------------------------- 2: a teammate's view (the browser is a CT)
g = await open('CT', 'Watcher', KEEP);
const alice = await player('Alice', 'CT');
alice.w = 'usp';
await newRound('Watcher');
bob.at(B, Math.PI); carl.at([-15, 0, 20], 0); dave.at([10, 0, -10], 0); alice.at([0, 0, 0], 0);
await sleep(700);
ok('Alice kills Bob', await kill(alice, bob));
alice.at(AB, yawTo(AB, B), 1); await sleep(250); alice.use(true);
ok('Alice takes Bob\'s uniform', await until(() => alice.got('disguiseOn').length > 0, 4500));
alice.use(false);
alice.at([0, 0, 1], Math.PI, 0);
await sleep(300);
await g.tp([0, 0, 6], yawTo([0, 0, 6], [0, 0, 1]), -0.05);
await sleep(1200);
ok(`aiming at her the name says "${await text(g, 'target-name')}"`, (await text(g, 'target-name')) === 'Alice');
const m3 = await g.msgs();
ok('the watcher was told she wears Bob\'s uniform', m3.some(m => m.t === 'disguiseOn' && m.name === 'Alice' && m.as === 'Bob'));
await g.shot('dg_teammate.png'); // a CT, "Alice", with the mask marker
errorsAll.push(...g.errors.map(e => 'part 2: ' + e));
// end the round: Dave kills Carl (Alice's shot would end her disguise: no matter now)
carl.at([4, 0, -2], 0); dave.at([10, 0, -10], yawTo([10, 0, -10], [4, 0, -2])); await sleep(600);
await kill(dave, carl);

// ---------------------------------------------------------------- 3: the enemy's view (the browser is a T)
g = await open('T', 'Viewer', KEEP);
await newRound('Viewer');
bob.at(B, Math.PI); carl.at([-15, 0, 20], 0); dave.at([10, 0, -10], 0); alice.at([0, 0, 0], 0);
await sleep(700);
ok('Alice kills Bob', await kill(alice, bob));
alice.at(AB, yawTo(AB, B), 1); await sleep(250); alice.use(true);
ok('Alice takes Bob\'s uniform', await until(() => alice.got('disguiseOn').length > 0, 4500));
alice.use(false);
alice.at([0, 0, 1], Math.PI, 0);
await sleep(300);
const V = [0, 0, 7];
await g.tp(V, yawTo(V, [0, 0, 1]), -0.05);
await sleep(1200);
const tn = await text(g, 'target-name'), tcls = await g.ev("document.querySelector('#target-name span')?.className || ''");
ok(`aiming at her the name says "${tn}" (${tcls})`, tn === 'Bob' && tcls === 'tname-T');
const m4 = await g.msgs();
ok('the viewer was told nothing about a disguise', !m4.some(m => m.t === 'disguiseOn' || m.t === 'disguiseOff'));
await g.shot('dg_enemy.png'); // a Terrorist named "Bob"
alice.at([0, 0, 4.6], Math.PI, 0);
await sleep(800);
const m5 = await g.msgs();
ok('she walks up in front of him: recognised', m5.some(m => m.t === 'disguiseOff' && m.why === 'near' && m.name === 'Alice'));
ok(`"${await text(g, 'center-msg')}"`, /IMPOSTOR: Alice/.test(await text(g, 'center-msg')));
await sleep(400);
ok(`and she's herself again: "${await text(g, 'target-name')}"`, (await text(g, 'target-name')) === 'Alice');
await g.shot('dg_reveal.png');
errorsAll.push(...g.errors.map(e => 'part 3: ' + e));
ok('no page errors' + (errorsAll.length ? ': ' + errorsAll.slice(0, 6).join(' | ') : ''), !errorsAll.length);
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'all passed');
for (const c of [bob, carl, dave, alice]) c.close();
process.exit();
