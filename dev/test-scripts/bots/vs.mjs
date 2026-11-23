// People vs bots (BOTS_VS). Fresh test server: GAME_PORT=3995 BOTS=4 BOTS_VS=1 (no browser).
// Alice joins CT: 4 bots join T and none her side. Bob asks for T: he is put with Alice on CT. Bob asks again to switch
// to T: refused. Three people on CT: still 4 bots, all on T.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { got } from '../explosives/lib.mjs';
const ok = checker();
const roster = c => got(c, 'roster').at(-1)?.list || [];
const count = (c, team, bot) => roster(c).filter(r => r.team === team && !!r.bot === bot).length;
const alice = await player('Alice', 'CT');
await until(() => count(alice, 'T', true) === 4, 5000);
ok(`4 bots on T, none on CT (T ${count(alice, 'T', true)}, CT ${count(alice, 'CT', true)})`, count(alice, 'T', true) === 4 && count(alice, 'CT', true) === 0);
const bob = await player('Bob', 'T');
await sleep(500);
const bobRow = () => roster(alice).find(r => r.name === 'Bob');
ok(`Bob asked for T, joined Alice on CT (${bobRow()?.team})`, bobRow()?.team === 'CT');
bob.send({ t: 'team', team: 'T' }); await sleep(500);
ok(`Bob can't switch to the bots' side (${bobRow()?.team})`, bobRow()?.team === 'CT');
await player('Carl', 'CT'); await sleep(2500);
ok(`3 people on CT: still 4 bots, all T (T ${count(alice, 'T', true)}, CT ${count(alice, 'CT', true)})`, count(alice, 'T', true) === 4 && count(alice, 'CT', true) === 0);
console.log(ok.fails() ? ok.fails() + ' FAILED' : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
