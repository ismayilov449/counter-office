// lib/wounds.js without a server (a fake server.js side): wounds on a bot give it the speed and spread lib/bots.js reads;
// bandaging halves them; a new life clears them; the syringe's buy rules. Run: node dev/test-scripts/wounds/unit2.mjs
import { createWounds } from '../../../lib/wounds.js';
import { WOUNDS } from '../../../shared/wounds.js';
import { MAPS } from '../../../shared/maps/index.js';

let fails = 0, n = 0;
const ok = (what, cond) => { n++; console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) fails++; };
let t = 1000;
const sent = [];
const players = new Map();
const S = {
  players, game: { phase: 'live', bomb: { state: 'idle' } }, cfg: { gameMode: 'classic' }, map: () => MAPS.cs_mansion, now: () => t,
  send: (p, m) => sent.push([p.id, m]), broadcast() {}, sendMe() {}, killPlayer() {}, inTeam: p => p.team === 'T' || p.team === 'CT',
  busy: () => false, disguise: null,
};
const W = createWounds(S);
const mk = (id, team, bot = false) => { const p = { id, team, bot, alive: true, hp: 100, p: [0, 0, 0], yaw: 0, inv: { secondary: { id: 'glock' } }, spawnSeq: 1, history: [] }; players.set(id, p); return p; };
const bot = mk(1, 'T', true), man = mk(2, 'CT');
W.tick(t, 0.03);

// a bullet in the leg, then out at the side of the chest (an arm), then the head (a graze)
const hit = (v, part, at) => { W.shotAt(v, [0, 1.6, -10], [0, 0, 1], 10, v.p); if (at) v.wdShot.h = at; v.hp -= 10; W.hurt(v, man, 10, part, 'usp'); };
hit(bot, 'legs');
ok(`a bot shot in the leg limps (wdSpeed ${bot.wdSpeed})`, bot.wdSpeed === WOUNDS.leg && bot.wdSpread === 0);
hit(bot, 'chest', [0.05, 1.3, -0.3]);
ok('the middle of the chest: no arm wound', !bot.wd.a);
hit(bot, 'chest', [0.28, 1.3, -0.3]);
ok(`out at the side: an arm wound, the bot's shots spread (wdSpread ${bot.wdSpread})`, bot.wd.a === 1 && bot.wdSpread === WOUNDS.armSpread);
hit(bot, 'head');
ok('a head hit he survives: a graze', bot.wd.h === 1);
ok('nothing is sent to a bot', !sent.some(e => e[0] === 1));
// not a wound: a knife, a blast, a hit that drops him, no shot info
const before = JSON.stringify(man.wd || null);
W.shotAt(man, [0, 1.6, -10], [0, 0, 1], 10, man.p); man.hp -= 10; W.hurt(man, bot, 10, 'legs', 'knife');
W.hurt(man, bot, 30, 'he', 'he');
W.shotAt(man, [0, 1.6, -10], [0, 0, 1], 10, man.p); man.hp = 0; W.hurt(man, bot, 10, 'legs', 'usp');
ok('no wound from a knife, a blast, or a hit that drops him', JSON.stringify(man.wd || null) === before);
man.hp = 60;
W.shotAt(man, [0, 1.6, -10], [0, 0, 1], 10, man.p); t += 50; W.hurt(man, bot, 10, 'legs', 'usp');
ok('no wound from a stale shot (a later damage with no bullet of its own)', !man.wd);
t -= 50;
hit(man, 'legs');
ok(`a player is told (${JSON.stringify(sent.at(-1)[1])})`, sent.at(-1)[0] === 2 && sent.at(-1)[1].t === 'wdWounds' && sent.at(-1)[1].l === 1 && sent.at(-1)[1].n === 'l');
ok('a fresh wound can be bandaged (blood.js reads wdBandage)', man.wdBandage === true);
// a bandage (blood.js: bandageUntil set, then cleared when done) halves them
bot.bandageUntil = t + 2000; W.tick(t, 0.03);
t += 2100; bot.bandageUntil = 0; W.tick(t, 0.03);
ok(`bandaged: half (wd ${JSON.stringify(bot.wd)}, wdSpeed ${bot.wdSpeed})`, bot.wd.l === 0.5 && bot.wd.a === 0.5 && bot.wd.h === 0.5 && Math.abs(bot.wdSpeed - (1 + WOUNDS.leg) / 2) < 1e-9 && !bot.wdBandage);
// dead and up again (a new round): all gone
bot.spawnSeq++; W.tick(t, 0.03);
ok('a new life: no wounds, full speed', !bot.wd && bot.wdSpeed === 1 && bot.wdSpread === 0);
// the syringe
ok(`buying it: allowed (${W.cantBuy(man)})`, W.cantBuy(man) === null);
man.inv.adren = 1;
ok(`one at a time ("${W.cantBuy(man)}")`, /already/.test(W.cantBuy(man)));
man.inv.adren = 0;
S.cfg.gameMode = 'deathmatch';
ok(`classic rounds only ("${W.cantBuy(man)}")`, /classic/.test(W.cantBuy(man)));
S.cfg.gameMode = 'classic';

console.log(`\n${n - fails}/${n} OK`);
if (fails) process.exitCode = 1;
