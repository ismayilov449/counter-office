// Close combat in the browser (GAME_PORT=3993 CDP_PORT=9336 MAP=cs_mansion; server with BOTS=0 START_MONEY=16000
// FREEZE_TIME=1 BUY_TIME=90 ROUND_TIME=180: the headless page draws 1-3 frames a second, so this checks the HUD, not
// timing). Alice is the browser (CT), Bob a scripted T.
// 8.1 the buy menu lists the suppressor; bought, her USP's shot reaches Bob as suppressed (a screenshot of the tube).
// 8.2 behind Bob: the hint "Press E to disarm Bob", E snatches his Glock; Bob behind her: "You were disarmed!", knife out.
// 8.3 at a closed door: the hint names holding it shut; Bob holds it from the other side: her E shows the push bar.
import { open, sleep, OUT } from '../mansion/game.mjs';
import { player, until, checker, admin, got } from '../explosives/lib.mjs';
const ok = checker();
const rounds = [];
const bob = await player('Bob', 'T');
bob.on.round = m => rounds.push(m.n);
const g = await open('CT', 'Alice', ['msg', 'me', 'ccDisarmed', 'ccDoor']);
const text = id => g.ev(`document.getElementById('${id}').textContent`);
const waitText = async (id, re, ms = 8000) => { let s = ''; for (let t = 0; t < ms && !re.test(s); t += 200) { await sleep(200); s = await text(id) || ''; } return s; };
await until(() => rounds.length > 0, 90000, 200);
// (a round already running when Bob joined leaves him dead till the next: restart, wait till he's up)
await admin({ action: 'restart' });
await until(() => rounds.length > 1 && bob.alive, 30000, 200);
await sleep(2500);
const base = [-22.25, 4.27, 8.941], W = Math.PI / 2;
bob.w = 'glock';
bob.at([base[0] - 6, base[1], base[2]], 0);

// 8.1
await g.key('KeyB');
const menu = await waitText('buymenu', /Suppressor/, 5000);
ok('8.1: the buy menu lists the Suppressor', /Suppressor/.test(menu) && /\$400/.test(menu));
await g.key('KeyB');
await g.send({ t: 'buy', item: 'sup' });
await sleep(1000);
ok('8.1: bought (inv.sup)', (await g.msgs()).some(m => m.t === 'me' && m.inv?.sup === 1));
await g.key('Digit2');
await g.tp([base[0] + 3, base[1], base[2]], 0);
await sleep(2500);
console.log('  screenshot', await g.shot('cc-sup-vm.png'));
bob.clear();
await g.click(0, 1500); // (held: at 1-3 fps a short click can fall between two frames)
ok('8.1: her shot reaches Bob suppressed', await until(() => got(bob, 'shot', m => m.sup === 1 && m.w === 'usp').length > 0, 5000));

// 8.2 (Alice behind Bob)
bob.at(base, W);
await g.tp([base[0] + 1, base[1], base[2]], W);
const h = await waitText('hint', /disarm Bob/);
ok(`8.2: the hint "${h}"`, /Press E to disarm Bob/.test(h));
console.log('  screenshot', await g.shot('cc-disarm-hint.png'));
bob.clear();
await g.key('KeyE', 300);
ok('8.2: E snatched his Glock', await until(() => got(bob, 'ccDisarmed', m => m.w === 'glock').length > 0, 5000));
// (Bob behind Alice)
await g.tp(base, W);
bob.at([base[0] + 1, base[1], base[2]], W);
await sleep(2500);
await g.key('Digit2');
await sleep(1500);
await g.msgs();
bob.use(true); await sleep(250); bob.use(false);
const c = await waitText('center-msg', /You were disarmed/);
ok(`8.2: "${c}"`, /You were disarmed/.test(c));
const wn = await waitText('weapon-name', /Knife/i, 5000);
ok(`8.2: her knife is out (${wn})`, /Knife/i.test(wn));
console.log('  screenshot', await g.shot('cc-disarmed.png'));

// 8.3 (Mansion's door 1: its leaf along x at z = 11.379)
const Y = 0.813, X = -14.63, Z = 11.379;
bob.at([X + 4, Y, Z - 3], 0);
await g.tp([X, Y, Z - 1.0], Math.PI);
const dh = await waitText('hint', /hold it shut/);
ok(`8.3: the door hint "${dh}"`, /Press E to open the door .*crouch \+ hold E to hold it shut/.test(dh));
bob.at([X, Y, Z + 0.7], 0, 1);
await sleep(500);
bob.use(true);
await sleep(800);
await g.keyDown('KeyE');
const pb = await waitText('progress-label', /holding it \(1 vs 1\)/);
ok(`8.3: the push bar "${pb}"`, /they're holding it \(1 vs 1\)/.test(pb));
console.log('  screenshot', await g.shot('cc-door-push.png'));
await g.keyUp('KeyE');
bob.use(false);

ok(`no page errors ${JSON.stringify(g.errors)}`, g.errors.length === 0);
console.log('  shots in', OUT);
bob.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
