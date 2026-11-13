// Group 11 in the browser (headless Edge on CDP_PORT, test server GAME_PORT, MAP=cs_mansion, BOTS=0, START_MONEY=16000).
// The page (CT) stands by an upstairs hostage; a scripted CT fires into the air next to it: the hostage ducks (the
// page's hostage has duck set; screenshot), then fires an M3 by the page's ear: the deafness runs without errors.
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../disguise/lib.mjs';
const H3 = [-22.25, 4.27, 3.454], HID = 1; // (upstairs by the T spawn: Terry's there, so it doesn't wander off)
const g = await open('CT', 'Pagey');
const bot = await player('Gunner', 'CT');
const rounds = [];
bot.on.round = m => rounds.push(m.n);
const terry = await player('Terry', 'T'); // (a Terrorist: a fresh round, and the hostages don't wander off yet)
for (let i = 0; i < 150 && !rounds.length; i++) await sleep(100);
await sleep(4000);
let ok = true;
const check = (what, c) => { console.log((c ? 'OK   ' : 'FAIL ') + what); ok &&= !!c; };
await g.ev(`document.body.click(), 1`); // (a user gesture, so the page's audio starts)
await g.tp([-19.3, H3[1], H3[2]], Math.PI / 2, -0.25); await sleep(1500);
for (let i = 0; i < 100 && bot.snap?.ph !== 'live'; i++) await sleep(100);
await sleep(1500);
bot.at([H3[0], H3[1], 1.2], 0, 0); await sleep(500);
let seen = false;
bot.ws.addEventListener('message', e => { const s = String(e.data); if (s.startsWith('{"t":"s"') && JSON.parse(s).hs?.find(h => h[0] === HID)?.[10] === 1) seen = true; });
bot.send({ t: 'shoot', o: bot.eye(), d: [0, 1, 0], w: bot.me?.inv?.secondary?.id || 'usp', rt: 0 });
for (let i = 0; i < 8; i++) { await sleep(1000); await g.shot('realism-duck' + i + '.png'); }
await sleep(1200);
if (!seen) console.log('DBG', bot.snap?.ph, rounds, bot.alive, JSON.stringify(bot.p), JSON.stringify(bot.row(bot.id())), bot.log.filter(m => m.t === 'msg').map(m => m.text));
check('the hostage ducks (snapshot)', seen);
const f = await g.shot('realism-duck.png');
console.log('screenshot', f);
bot.send({ t: 'buy', item: 'm3' }); await sleep(500);
bot.at([H3[0] + 1, H3[1], H3[2] - 3], 0, 0); await sleep(300);
bot.send({ t: 'shoot', o: bot.eye(), d: [0, 1, 0], w: 'm3', rt: 0 }); await sleep(1500);
const st = await g.ev(`import('/js/audio.js').then(({ audio }) => { audio.play('shellshock', null, 1); return 'played'; }).catch(e => String(e))`);
check('shellshock plays: ' + st, st === 'played');
await sleep(1000);
check('no page errors: ' + JSON.stringify(g.errors), !g.errors.length);
console.log(ok ? 'ALL OK' : 'FAILED');
process.exit(ok ? 0 : 1);
