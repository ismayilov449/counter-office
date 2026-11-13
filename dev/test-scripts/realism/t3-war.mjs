// No kill confirmation (ROADMAP 13.2), the server's part. Fresh test server: GAME_PORT=3995 MAP=cs_mansion BOTS=0
// START_MONEY=800 FREEZE_TIME=1 AUTO_BALANCE=0 NO_KILL_CONFIRM=1 (no browser).
// Alice (CT) kills Bob (T, head shots): her money doesn't move; on the team bar Bob still looks alive to her and to
// Bob himself (dead); his teammate Carl sees him dead. Alice kills Carl: the round ends, the kill money comes then.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T'), carl = await player('Carl', 'T');
const ID = { alice: alice.id(), bob: bob.id(), carl: carl.id() };
await nextLive([alice, bob, carl], st);
await sleep(1500);
const base = [-22.25, 4.27, 8.941];
bob.at(base, 0, 0); carl.at([base[0], base[1], base[2] - 3], 0, 0);
alice.at([base[0] + 2, base[1], base[2]], Math.PI / 2, 0); await sleep(500);
const money0 = alice.me?.money;
const w = alice.me?.inv?.secondary?.id || 'usp';
for (let i = 0; i < 10 && bob.alive; i++) { alice.shootAt(bob, w, 'head'); await sleep(350); }
ok('Bob is dead', !bob.alive);
await sleep(1200);
ok(`Alice's money didn't move (${money0} -> ${alice.me?.money})`, alice.me?.money === money0);
const barRow = (c, id) => got(c, 'bar').at(-1)?.l.find(r => r[0] === id);
ok(`on Alice's team bar Bob looks alive (${JSON.stringify(barRow(alice, ID.bob))})`, barRow(alice, ID.bob)?.[1] === 1);
ok(`and to Bob himself, dead (${JSON.stringify(barRow(bob, ID.alice))}: no HP shown)`, barRow(bob, ID.bob)?.[1] === 0 && barRow(bob, ID.alice)?.[3] === -1);
ok(`Carl (his teammate) sees him dead (${JSON.stringify(barRow(carl, ID.bob))})`, barRow(carl, ID.bob)?.[1] === 0);
alice.at([base[0] + 2, base[1], base[2] - 3], Math.PI / 2, 0); await sleep(400);
for (let i = 0; i < 10 && carl.alive; i++) { alice.shootAt(carl, w, 'head'); await sleep(350); }
ok('Carl is dead: the round ends', await until(() => got(alice, 'roundEnd').length > 0, 3000));
await sleep(600);
ok(`now the kill money comes with the win (${money0} -> ${alice.me?.money}: 2 kills + the win bonus)`, alice.me?.money >= money0 + 2 * 300 + 3250);
console.log(ok.fails() ? ok.fails() + ' FAILED' : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
