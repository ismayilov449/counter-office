// Disguise in the browser (headless Edge on CDP_PORT, game on GAME_PORT: MAP=cs_mansion or MAP=cs_mansion_night,
// BOTS=0 FREEZE_TIME=1; the test reads MAP too). All of it happens along the Mansion's street east of the house (the
// CT spawn: flat, 5 m wide, x 24.1..29.2; south is +z); the Terrorists not in use wait inside the house.
// Scripted: Bob and Carl (T), Dave (CT). Three parts, a round each (part 2 a second one, for the round reset):
// 1. The browser is Alice (CT). Dave kills Bob; Alice stands over him (hint), crouches (Ctrl: hint), holds E (progress
//    bar), is disguised (badge, the T sleeves on her arms), then fires: "DISGUISE BLOWN".
// 2. The browser is a CT ("Watcher"); a scripted Alice takes Bob's uniform: the teammate's view (her own model and name,
//    the mask marker over her head, and its draw calls); the next round: herself, no marker (the round reset).
// 3. The browser is a T ("Viewer"); a scripted Alice takes Bob's uniform: the enemy's view (a T named "Bob", a
//    teammate's dot on the radar, the scoreboard unchanged), then she walks up in front of him: "IMPOSTOR: Alice", and
//    she's a CT again.
// Screenshots go to OUT (dg_*.png); page errors are printed.
import { open, sleep } from '../mansion/game.mjs';
import { player, until, yawTo, checker, spot, MAP_ID, admin } from './lib.mjs';
if (!/^cs_mansion/.test(MAP_ID)) { console.log('run it with MAP=cs_mansion or MAP=cs_mansion_night'); process.exit(1); }
const S = (x, z) => spot(x, z, 3); // (on the street's floor)
const FAR_T = [-22.25, 4.27, -8.941]; // a T spawn inside the house, out of the way
const ok = checker();
const KEEP = ['msg', 'disguiseOn', 'disguiseOff', 'disguiseFx', 'round'];
const errorsAll = [];
// The page, (re)joined as `name` on `team`. Before opening it again in the same tab its game connection is closed (the
// server drops that player at once); on a cold page the team button is clicked again until the join goes through (the
// buttons stay disabled until the page is ready). SIZE=960x540: a smaller page than open()'s 1280x720 (lighter on the PC).
let prev = null;
const openAt = async (team, name, keep) => {
  if (prev) { await prev.ev('window.__ws && window.__ws.close(), 1'); await sleep(1500); prev.cdp.close(); }
  const g = prev = await open(team, name, keep);
  if (process.env.SIZE) { const [w, h] = process.env.SIZE.split('x').map(Number); await g.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); }
  for (let i = 0; i < 10 && !(await g.ev("document.getElementById('join').classList.contains('hidden')")); i++) {
    await g.ev(`document.getElementById('name').value = ${JSON.stringify(name)}; document.querySelector('#join .team-btn[data-team="${team}"]').click(), 1`);
    await sleep(1500);
  }
  await g.ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'), 1");
  return g;
};

const bob = await player('Bob', 'T'), dave = await player('Dave', 'CT'), carl = await player('Carl', 'T'); // (this order: auto team balance)
bob.w = 'glock'; carl.w = 'glock'; dave.w = 'usp';
const rounds = [];
bob.on.round = m => rounds.push(m.n);
const rosterAlive = name => bob.got('roster').at(-1)?.list.find(q => q.name === name)?.alive;
// The next round. restart: the admin restarts the match (when the browser has just joined: a player who joins during
// a live round only spawns at the next one, and the page takes longer to load than the 1 s freeze time).
async function newRound(browserName, restart = true) {
  const n = rounds.length;
  if (restart) await admin({ action: 'restart' });
  await until(() => rounds.length > n, 90000, 100);
  // (a restart while the warmup's own start is pending starts the match twice: wait until the round messages stop)
  for (let k = rounds.length; ; k = rounds.length) { await sleep(2000); if (rounds.length === k) break; }
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
const B = S(27, 5), AB = S(27.6, 5);
const ctrl = (g, down) => g.cmd('Input.dispatchKeyEvent', down
  ? { type: 'rawKeyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 }
  : { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
const text = (g, id) => g.ev(`document.getElementById('${id}')?.textContent || ''`);
// (the badge, not the centre message, which says DISGUISED too)
const badgeText = g => g.ev("[...document.querySelectorAll('#hud > div')].find(d => /^DISGUISED · /.test(d.textContent) && d.style.display !== 'none')?.textContent || ''");
// Draw calls: all of them, and those made for the mask markers (the only thing this feature adds to the scene: a
// Sprite at y 2.42, 0.5 x 0.25, on a disguised teammate's model). Per frame over ms: the median of all, the markers' mean.
const hookDraws = g => g.ev(`(async () => {
  const THREE = await import('three');
  const gl = document.querySelector('#game canvas').getContext('webgl2');
  if (!gl.__counted) {
    gl.__counted = true; window.__dc = 0; window.__mk = 0; window.__per = []; window.__fr = 0;
    for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const f = gl[k].bind(gl); gl[k] = (...a) => { window.__dc++; if (window.__inMk) window.__mk++; return f(...a); }; }
    THREE.Sprite.prototype.onBeforeRender = function () { window.__inMk = this.position.y === 2.42 && this.scale.y === 0.25; };
    THREE.Sprite.prototype.onAfterRender = function () { window.__inMk = false; };
    let last = 0;
    (function loop() { window.__fr++; if (window.__dc > last) { window.__per.push(window.__dc - last); if (window.__per.length > 400) window.__per.shift(); } last = window.__dc; requestAnimationFrame(loop); })();
  }
  return 1;
})()`);
const draws = async (g, ms = 3000) => {
  const a = JSON.parse(await g.ev('__per.length = 0, JSON.stringify([__fr, __mk])'));
  await sleep(ms);
  const b = JSON.parse(await g.ev('JSON.stringify([__fr, __mk, __per.slice().sort((x, y) => x - y)])'));
  return { median: b[2][b[2].length >> 1], markers: (b[1] - a[1]) / (b[0] - a[0]) };
};

// ---------------------------------------------------------------- 1: the wearer (the browser is Alice)
let g = await openAt('CT', 'Alice', KEEP);
await newRound('Alice');
bob.at(B, Math.PI); carl.at(FAR_T, 0); dave.at(S(27, -3), Math.PI);
await sleep(700);
ok('Dave kills Bob', await kill(dave, bob));
await g.tp(AB, yawTo(AB, B), -0.9);
await sleep(600);
const h1 = await text(g, 'hint');
// (alone, or after what E does standing there: Bob's gun lies by him, "Press E to swap for the Glock-18 · crouch + ...")
ok(`standing over Bob, the hint: "${h1}"`, /(Crouch and hold E to put on|crouch \+ hold E for) Bob's uniform/.test(h1));
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
await g.tp(AB, yawTo(AB, S(27, 20)), 0);
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
// (the next part restarts the match)

// ---------------------------------------------------------------- 2: a teammate's view (the browser is a CT)
g = await openAt('CT', 'Watcher', KEEP);
const alice = await player('Alice', 'CT'), aliceId = alice.id();
alice.w = 'usp';
await newRound('Watcher');
bob.at(B, Math.PI); carl.at(FAR_T, 0); dave.at(S(27, -18), 0); alice.at(S(27, 0), Math.PI);
await sleep(700);
ok('Alice kills Bob', await kill(alice, bob));
alice.clear(); // (her log still has the last part's disguiseOn)
alice.at(AB, yawTo(AB, B), 1); await sleep(250); alice.use(true);
ok('Alice takes Bob\'s uniform', await until(() => alice.got('disguiseOn').length > 0, 4500) && await until(() => !!alice.snap?.dg?.d?.some(e => e[0] === aliceId), 1000));
alice.use(false);
alice.at(S(27, 1), Math.PI, 0);
await sleep(300);
await g.tp(S(27, 6), yawTo(S(27, 6), S(27, 1)), -0.05);
await sleep(1200);
ok(`aiming at her the name says "${await text(g, 'target-name')}"`, (await text(g, 'target-name')) === 'Alice');
const m3 = await g.msgs();
ok('the watcher was told she wears Bob\'s uniform', m3.some(m => m.t === 'disguiseOn' && m.name === 'Alice' && m.as === 'Bob'));
await g.shot('dg_teammate.png'); // a CT, "Alice", with the mask marker
await hookDraws(g);
const d1 = await draws(g);
ok(`the mask marker: ${d1.markers.toFixed(2)} draw call a frame (the frame's median: ${d1.median})`, Math.abs(d1.markers - 1) < 0.1);
errorsAll.push(...g.errors.map(e => 'part 2: ' + e));
// end the round: Dave kills Carl (the next one is the round-reset check)
carl.at(S(27, -12), 0); dave.at(S(27, -18), yawTo(S(27, -18), S(27, -12))); await sleep(600);
await kill(dave, carl);
// the round reset (the Watcher stays on): the next round, Alice on the same spot: herself, no marker over her
await newRound('Watcher', false);
bob.at([-22.454, 4.27, -2.032], 0); carl.at(FAR_T, 0); dave.at(S(27, -18), 0); alice.at(S(27, 1), Math.PI, 0);
await g.tp(S(27, 6), yawTo(S(27, 6), S(27, 1)), -0.05);
await sleep(1500);
ok(`a new round: Alice's disguise is gone (no "dg" in her team's snapshot: ${JSON.stringify(alice.snap?.dg ?? null)})`, !alice.snap?.dg?.d?.length);
ok(`a new round: aiming at her the name says "${await text(g, 'target-name')}"`, (await text(g, 'target-name')) === 'Alice');
await g.shot('dg_teammate_reset.png'); // a CT, "Alice", no mask marker
const d2 = await draws(g);
ok(`a new round: no marker drawn (${d2.markers.toFixed(2)} a frame; the frame's median: ${d2.median})`, d2.markers === 0);
errorsAll.push(...g.errors.map(e => 'part 2 (reset): ' + e));
// (the next part restarts the match)

// ---------------------------------------------------------------- 3: the enemy's view (the browser is a T)
g = await openAt('T', 'Viewer', KEEP);
await newRound('Viewer');
bob.at(B, Math.PI); carl.at(FAR_T, 0); dave.at(S(27, -18), 0); alice.at(S(27, 0), Math.PI);
await sleep(700);
ok('Alice kills Bob', await kill(alice, bob));
alice.clear(); // (her log still has the last part's disguiseOn)
alice.at(AB, yawTo(AB, B), 1); await sleep(250); alice.use(true);
ok('Alice takes Bob\'s uniform', await until(() => alice.got('disguiseOn').length > 0, 4500) && await until(() => !!alice.snap?.dg?.d?.some(e => e[0] === aliceId), 1000));
alice.use(false);
alice.at(S(27, 1), Math.PI, 0);
await sleep(300);
const V = S(27, 7);
await g.tp(V, yawTo(V, S(27, 1)), -0.05);
await sleep(1200);
const tn = await text(g, 'target-name'), tcls = await g.ev("document.querySelector('#target-name span')?.className || ''");
ok(`aiming at her the name says "${tn}" (${tcls})`, tn === 'Bob' && tcls === 'tname-T');
const m4 = await g.msgs();
ok('the viewer was told nothing about a disguise', !m4.some(m => m.t === 'disguiseOn' || m.t === 'disguiseOff'));
await g.shot('dg_enemy.png'); // a Terrorist named "Bob"; on the radar a teammate's dot
// the scoreboard (Tab) still lists everyone on their real team, and Bob as dead (the one clue)
await g.keyDown('Tab'); await sleep(500);
const sb = await g.ev("document.getElementById('scoreboard').textContent.replace(/\\s+/g, ' ')");
ok(`the scoreboard: Bob dead with the Terrorists, Alice with the Counter-Terrorists: "${sb.slice(0, 160)}..."`, /Terrorists \(\d+\).*Bob dead.*Counter-Terrorists \(\d+\).*Alice/.test(sb));
await g.shot('dg_enemy_scores.png');
await g.keyUp('Tab');
alice.at(S(27, 4.6), Math.PI, 0);
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
