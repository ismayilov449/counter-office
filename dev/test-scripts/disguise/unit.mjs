// lib/disguise.js on its own, with fake players (no server): taking a uniform, the snapshot copies per team, the
// contract fields from other features (p.downed, p.playingDead), recognition up close (in front / behind), the round's
// reset, a body blown apart, the dead player coming back. Run: node dev/test-scripts/disguise/unit.mjs
import { createDisguise } from '../../../lib/disguise.js';
import { checker } from './lib.mjs';
const ok = checker();

const players = new Map(), game = { phase: 'live', round: 1 }, cfg = { gameMode: 'classic' };
const mk = (id, name, team, p, yaw = 0) => {
  const q = { id, name, team, p, yaw, c: 0, alive: true, joined: true, spawnSeq: 1, log: [] };
  q.ws = { readyState: 1, send: s => q.log.push(JSON.parse(s)) };
  players.set(id, q);
  return q;
};
const alice = mk(1, 'Alice', 'CT', [0, 0, 0]), dave = mk(2, 'Dave', 'CT', [0, 0, -10]);
const bob = mk(3, 'Bob', 'T', [0, 0, 1]), carl = mk(4, 'Carl', 'T', [10, 0, 10]), eve = mk(5, 'Eve', 'T', [-30, 0, 30]);
const D = createDisguise({ players, game, cfg: () => cfg, send: (p, m) => p.ws.send(JSON.stringify(m)), lineOfSight: () => true, eyeOf: p => [p.p[0], p.p[1] + 1.6, p.p[2]] });
const die = (q, gib = null) => { q.alive = false; D.onDeath(q, gib); };
const row = q => [q.id, q.p[0], q.p[1], q.p[2], q.yaw, 0, q.c, 'usp', q.alive ? 1 : 0, q.team === 'T' ? 1 : 2, 0, 0, 0];
const head = () => { const pl = [...players.values()].map(row); return { pl, head: JSON.stringify({ t: 's', time: Math.random(), pl }).slice(0, -1) }; };
const plOf = (q, h) => JSON.parse(D.headFor(q, h.head, h.pl) + '}').pl;
let t = 1000;

D.tick();
die(bob);
ok('a body is kept for the round', D.corpses.has(bob.id));
ok('standing over it, E does nothing here (falls through to doors, guns...)', !D.tryStart(alice, t));
alice.c = 1;
ok('crouched over it, E starts changing', D.tryStart(alice, t) && alice.act?.type === 'disguise');
ok('the rustle goes to Alice and to Dave? (Dave 10 m away: yes), not to far-off Eve', alice.log.some(m => m.t === 'disguiseFx' && m.k === 'start') && dave.log.some(m => m.t === 'disguiseFx') && !eve.log.some(m => m.t === 'disguiseFx'));
D.act(alice, alice.act, t + 1500);
ok('still changing after 1.5 s', alice.act?.type === 'disguise' && !alice.disguise);
D.act(alice, alice.act, t + 3001);
ok('after 3 s: p.disguise is the enemy team', alice.disguise === 'T' && !alice.act);
ok('Alice is told, and her teammate Dave', alice.log.some(m => m.t === 'disguiseOn' && m.you && m.as === 'Bob') && dave.log.some(m => m.t === 'disguiseOn' && m.id === 1));
ok('the fooled team is told nothing', !carl.log.some(m => m.t === 'disguiseOn'));
D.tick();

let h = head();
const cp = plOf(carl, h);
const asBob = cp.find(r => r[0] === bob.id);
ok('Carl (T) sees no Alice in the snapshot', !cp.some(r => r[0] === alice.id));
ok('Carl sees "Bob" alive, a T, where Alice stands', asBob && asBob[8] === 1 && asBob[9] === 1 && asBob[1] === alice.p[0] && asBob[3] === alice.p[2]);
ok('Carl gets no "dg"', D.snapKey(carl) === '' && D.snapKey(eve) === '');
const bp = plOf(bob, h);
ok('Bob (the dead owner) sees the truth: Alice as a CT, himself dead', bp.find(r => r[0] === alice.id)?.[9] === 2 && bp.find(r => r[0] === bob.id)?.[8] === 0);
ok('Dave (CT) sees the truth', plOf(dave, h).find(r => r[0] === alice.id)?.[9] === 2);
ok('Dave\'s "dg" lists Alice as Bob, look T', JSON.parse(D.snapKey(dave).slice(6)).d[0].join() === '1,3,Bob,1');
ok('a spectator gets the truth and the "dg"', D.headFor({ id: 99, team: 'SPEC' }, h.head, h.pl) === h.head && D.snapKey({ team: 'SPEC' }).includes('"d"'));

// recognition: Carl walks up to 2.5 m, looking away, then towards her
carl.p = [0, 0, 2.5]; carl.yaw = 0; // looking north (-z)... Alice is at z 0: that's in front of him
D.tick();
ok('an enemy 2.5 m away looking at her recognises her', !alice.disguise && alice.log.some(m => m.t === 'disguiseOff' && m.why === 'near') && carl.log.some(m => m.t === 'disguiseOff' && m.id === 1 && m.as === 'Bob'));
h = head();
ok('after that Carl sees Alice again, and Bob dead', plOf(carl, h).find(r => r[0] === alice.id)?.[9] === 2 && plOf(carl, h).find(r => r[0] === bob.id)?.[8] === 0);
ok('one uniform per life: no second go', !D.tryStart(alice, t + 5000));

// a new life (next round), facing away
game.round = 2; alice.spawnSeq++; bob.spawnSeq++; bob.alive = true; carl.p = [10, 0, 10];
D.tick();
ok('the round\'s reset: no bodies, no disguises', D.corpses.size === 0 && D.info.size === 0);
die(bob);
alice.c = 1;
D.tryStart(alice, t); D.act(alice, alice.act, t + 3001);
ok('a new round: a new uniform', alice.disguise === 'T');
carl.p = [0, 0, 2.5]; carl.yaw = Math.PI; // looking south, away from her
D.tick();
ok('2.5 m away but looking away: not recognised', alice.disguise === 'T');
carl.p = [0, 0, 0.9];
D.tick();
ok('0.9 m away: noticed whichever way he looks', !alice.disguise);

// the round's reset with a disguise on
game.round = 3; alice.spawnSeq++; bob.spawnSeq++; bob.alive = true; carl.p = [10, 0, 10];
D.tick(); die(bob); D.tryStart(alice, t); D.act(alice, alice.act, t + 3001);
ok('disguised again', alice.disguise === 'T');
game.round = 4; alice.spawnSeq++; bob.spawnSeq++; bob.alive = true;
D.tick();
ok('cleared at round start', !alice.disguise && D.info.size === 0 && D.snapKey(dave) === '');

// contract: downed / play-dead bodies give no uniform; going down breaks it
die(bob); bob.downed = true;
ok('no uniform from a downed body', !D.tryStart(alice, t));
bob.downed = false; bob.playingDead = true;
ok('no uniform from someone playing dead', !D.tryStart(alice, t));
bob.playingDead = false;
die(eve, { k: 'blast' }); eve.p = [0.5, 0, 0.5];
D.corpses.get(eve.id).p = [0.5, 0, 0.5];
ok('none from a body blown apart (Bob\'s is still there)', D.tryStart(alice, t) && alice.act.body === bob.id);
alice.act = null;
alice.downed = true;
ok('a downed player can\'t start', !D.tryStart(alice, t));
alice.downed = false;
D.tryStart(alice, t); D.act(alice, alice.act, t + 3001);
ok('disguised', alice.disguise === 'T');
alice.downed = true;
D.tick();
ok('going down breaks it', !alice.disguise && alice.log.at(-1)?.why === 'downed');
alice.downed = false;

// the dead owner comes back (or leaves): the uniform is worthless
game.round = 5; alice.spawnSeq++; bob.spawnSeq++; bob.alive = true; eve.alive = true; eve.spawnSeq++;
D.tick(); die(bob); D.tryStart(alice, t); D.act(alice, alice.act, t + 3001);
bob.alive = true; bob.spawnSeq++;
D.tick();
ok('the owner alive again: the disguise ends quietly for Alice (why "gone")', !alice.disguise && alice.log.at(-1)?.why === 'gone');

// hurt: changing is stopped by any hit; a disguise by a hit from the fooled team only
game.round = 6; alice.spawnSeq++; bob.spawnSeq++; bob.alive = true;
D.tick(); die(bob); D.tryStart(alice, t);
D.onHurt(alice, null);
ok('a hit (even a fall) stops the changing', !alice.act);
D.tryStart(alice, t); D.act(alice, alice.act, t + 3001);
D.onHurt(alice, dave);
ok('a hit from a teammate doesn\'t break it', alice.disguise === 'T');
D.onHurt(alice, carl);
ok('a hit from the fooled team does', !alice.disguise && alice.log.at(-1)?.why === 'hurt');

// other modes / warmup: nothing
game.round = 7; alice.spawnSeq++; bob.spawnSeq++; bob.alive = true;
cfg.gameMode = 'deathmatch'; D.tick(); die(bob);
ok('not in Deathmatch', !D.tryStart(alice, t));
cfg.gameMode = 'classic'; game.phase = 'warmup'; D.tick(); die(bob);
ok('not in warmup', !D.tryStart(alice, t));
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'all passed');
