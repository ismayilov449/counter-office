// Disguise: planting gives you away (MAP=de_dust2 BOTS=0 FREEZE_TIME=1; GAME_PORT, default 4070).
// Bob is the only Terrorist (so he has the bomb), Alice and Dave are CTs. Bob kills Dave in the CT spawn and takes his
// uniform: Alice's snapshot shows "Dave" alive where Bob is and no Bob, her radar no red dot. At site A Bob holds E to
// plant: blown ("plant") the moment he starts, Alice (within 20 m) is told; the planting goes on.
import { player, sleep, until, checker, yawTo, spot, los, MAP_ID } from './lib.mjs';
const ok = checker();
if (MAP_ID !== 'de_dust2') console.log('(run with MAP=de_dust2: the spots are de_dust2\'s)');
const rounds = [];
const alice = await player('Alice', 'CT');
alice.on.round = m => rounds.push(m.n);
const dave = await player('Dave', 'CT'), bob = await player('Bob', 'T');
const ID = { alice: alice.id(), dave: dave.id(), bob: bob.id() };
await until(() => rounds.length > 0, 30000, 100);
await sleep(1500);
await until(() => alice.snap?.ph === 'live', 10000);
for (const c of [alice, dave, bob]) c.clear();
ok('live; Bob carries the bomb', bob.me?.inv?.c4 === true);
const D = spot(20, -30), B = spot(13, -30), A = spot(30, -22), SITE = spot(39, -35);
ok('(spots in sight of each other)', los([B[0], B[1] + 1.6, B[2]], [D[0], D[1] + 1.2, D[2]]) && los([A[0], A[1] + 1.6, A[2]], [D[0], D[1] + 1.2, D[2]]));
dave.at(D, Math.PI / 2); alice.at(A, yawTo(A, [40, 0, -10])); bob.at(B, yawTo(B, D)); bob.w = 'glock';
await sleep(700);
for (let i = 0; i < 12 && dave.alive; i++) { bob.shootAt(dave, 'glock'); await sleep(400); }
ok('Bob kills Dave', !dave.alive);
const BD = [D[0] - 0.6, D[1], D[2]];
bob.at(BD, yawTo(BD, D), 1); await sleep(250);
bob.use(true);
ok('Bob crouches over Dave and holds E', await until(() => bob.snap?.me?.a === 'disguise', 1500));
ok('3 s later: in Dave\'s uniform (look CT)', await until(() => bob.got('disguiseOn').some(m => m.you && m.look === 'CT' && m.as === 'Dave'), 4500));
bob.use(false);
bob.at(BD, bob.yaw, 0);
alice.at(A, yawTo(A, BD));
await sleep(400);
{
  const s = alice.snap, asDave = s.pl.find(r => r[0] === ID.dave);
  ok('Alice\'s snapshot: no Bob, "Dave" alive (a CT) where Bob stands', !s.pl.some(r => r[0] === ID.bob) && asDave && asDave[8] === 1 && asDave[9] === 2 && Math.abs(asDave[1] - BD[0]) < 0.05 && !alice.raw.includes('"dg"'));
}
let dot = false;
for (let i = 0; i < 30; i++) { if ((alice.snap?.sp || []).some(r => r[0] === ID.bob)) dot = true; await sleep(50); }
ok('Alice (looking at him, 12 m) gets no red dot on him', !dot);
// to the site and plant
bob.at(SITE, 0, 0); await sleep(400);
alice.at(A, yawTo(A, [40, 0, -10])); // (looking away: she isn't the one who finds out)
alice.clear(); bob.clear();
bob.use(true);
ok('holding E on site A: blown ("plant")', await until(() => bob.got('disguiseOff').some(m => m.you && m.why === 'plant'), 1500));
ok('Alice is told (Bob, in Dave\'s uniform, started planting)', await until(() => alice.got('disguiseOff').some(m => m.id === ID.bob && m.as === 'Dave' && m.why === 'plant'), 500));
ok('the planting goes on', bob.snap?.me?.a === 'plant');
await sleep(300);
ok('Alice\'s snapshot: Bob back as a T, Dave dead', alice.snap.pl.find(r => r[0] === ID.bob)?.[9] === 1 && alice.snap.pl.find(r => r[0] === ID.dave)?.[8] === 0);
ok('the bomb gets planted', await until(() => alice.snap?.b?.s === 'planted', 4000));
bob.use(false);
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'all passed');
for (const c of [alice, dave, bob]) c.close();
process.exit();
