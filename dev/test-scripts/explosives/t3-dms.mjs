// 7.3 Dead man's switch (GAME_PORT=3995 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1 ROUND_TIME=40).
// Bob (T) buys a satchel charge and throws it on the floor; with the detonator (phone) out:
// a. xpDms arms it (everyone's xpDms lists him); putting the phone away lets go safely (list empty, satchel stays).
// b. armed again, Alice (CT) kills him: his satchel goes off (boom 'satchel', the satchel list empty).
// c. next round, not armed: Alice kills him and the satchel stays (control). Without satchels it can't be armed.
// d. next round, armed, Alice shoots him in the chest: he goes down (Carl could revive him): it goes off too.
import { player, sleep, until, checker, nextLive, got } from './lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T'), carl = await player('Carl', 'T'); // (Carl: a teammate who could revive Bob, so Bob can go down)
const all = [alice, bob, carl];
const ID = { alice: alice.id(), bob: bob.id() };
const gun = c => (c.w = c.me?.inv?.primary?.id || c.me?.inv?.secondary?.id || 'knife');
const base = [-22.25, 4.27, 8.941];
const satchels = () => got(alice, 'satchels').at(-1)?.list || [];

async function setup() {
  await nextLive(all, st);
  bob.send({ t: 'buy', item: 'satchel' });
  await sleep(300);
  bob.w = 'glock';
  bob.at(base, 0, 0);
  alice.at([base[0] + 4, base[1], base[2]], Math.PI / 2, 0);
  carl.at([base[0] - 8, base[1], base[2]], 0, 0);
  await sleep(300);
  bob.send({ t: 'xpDms' });
  await sleep(300);
  ok('no satchel out yet: not armed', got(alice, 'xpDms', m => m.ids.includes(ID.bob)).length === 0);
  bob.send({ t: 'satchel', o: [base[0], base[1] + 1.5, base[2]], v: [0, -4, -3] });
  ok('the satchel lies there', await until(() => satchels().some(r => r[2] === ID.bob), 2000));
  bob.w = 'phone';
  bob.at(base, 0, 0);
  await sleep(200);
}
async function killBob() {
  const w = gun(alice);
  for (let i = 0; i < 10 && bob.alive; i++) { alice.shootAt(bob, w, 'head'); await sleep(400); }
  return !bob.alive;
}

// a, b
await setup();
bob.send({ t: 'xpDms' });
ok('a: armed (xpDms lists Bob for Alice)', await until(() => got(alice, 'xpDms', m => m.ids.includes(ID.bob)).length > 0, 1000));
alice.clear();
bob.w = 'glock';
bob.at(base, 0, 0);
ok('a: phone away: released (empty xpDms)', await until(() => got(alice, 'xpDms', m => !m.ids.length).length > 0, 1000));
await sleep(300);
ok('a: the satchel is still there', satchels().length > 0 || got(alice, 'satchels').length === 0);
ok('a: no blast', got(alice, 'boom').length === 0);
bob.w = 'phone';
bob.at(base, 0, 0);
await sleep(200);
bob.send({ t: 'xpDms' });
ok('b: armed again', await until(() => got(alice, 'xpDms', m => m.ids.includes(ID.bob)).length > 0, 1000));
alice.clear();
ok('b: Alice kills Bob', await killBob());
ok('b: his satchel goes off', await until(() => got(alice, 'boom', m => m.k === 'satchel').length > 0, 1000));
ok('b: none left', satchels().length === 0);

// c
await setup();
alice.clear();
ok('c: Alice kills Bob (not armed)', await killBob());
await sleep(500);
ok('c: no blast, the satchel stays', got(alice, 'boom').length === 0 && got(alice, 'satchels').length === 0);

// d
await setup();
bob.send({ t: 'xpDms' });
ok('d: armed', await until(() => got(alice, 'xpDms', m => m.ids.includes(ID.bob)).length > 0, 1000));
alice.clear();
{
  const w = gun(alice);
  for (let i = 0; i < 12 && !got(alice, 'boom').length && bob.alive; i++) { alice.shootAt(bob, w, 'chest'); await sleep(350); }
}
ok('d: Bob went down (bodyDown)', got(alice, 'bodyDown', m => m.v === ID.bob).length > 0);
ok('d: his satchel goes off', await until(() => got(alice, 'boom', m => m.k === 'satchel').length > 0, 1000));

for (const c of all) c.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
