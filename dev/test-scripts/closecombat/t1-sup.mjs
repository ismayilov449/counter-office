// 8.1 Suppressors (GAME_PORT=3993 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1).
// Alice (CT) buys a suppressor at her spawn ($400, once); shoots Bob (T) in the chest with her USP: the shot goes out
// with sup:1 and does ~90% of the damage; she sells it back and shoots again from the same spot: no sup, full damage.
import { player, sleep, until, checker, nextLive, got } from '../explosives/lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
let bobHp = 100;
bob.on.dmg = m => { bobHp = m.hp; };
await nextLive([alice, bob], st);
await until(() => alice.snap?.ph === 'live', 5000);
alice.w = 'usp';
const home = alice.p.slice(), money = alice.me.money;

alice.send({ t: 'buy', item: 'sup' });
ok('bought: inv.sup', await until(() => alice.me?.inv?.sup === 1, 1000));
ok(`$400 taken (${money} -> ${alice.me.money})`, money - alice.me.money === 400);
alice.clear();
alice.send({ t: 'buy', item: 'sup' });
ok('a second one: refused', await until(() => got(alice, 'msg', m => /already have a suppressor/.test(m.text)).length > 0, 1000));

const base = [-22.25, 4.27, 8.941]; // (an open floor by the T spawn)
async function shot() {
  bob.at(base, Math.PI / 2);
  alice.at([base[0] + 3, base[1], base[2]], -Math.PI / 2);
  await sleep(400);
  bob.clear();
  const hp = bobHp;
  alice.shootAt(bob, 'usp', 'chest');
  await until(() => got(bob, 'dmg').length > 0, 1500);
  await sleep(100);
  return { dmg: hp - bobHp, s: got(bob, 'shot')[0] };
}
const a = await shot();
ok(`suppressed: the shot says sup (${JSON.stringify(a.s?.sup)})`, a.s?.sup === 1);
alice.at(home);
await sleep(300);
alice.send({ t: 'sell', item: 'sup' });
ok('sold back: no inv.sup', await until(() => !alice.me?.inv?.sup, 1000));
await sleep(1100); // (the USP's rate is no problem; this is the buy message settling)
const b = await shot();
ok(`plain: no sup (${JSON.stringify(b.s?.sup)})`, b.s && !b.s.sup);
ok(`suppressed damage ${a.dmg} ~ 90% of ${b.dmg}`, a.dmg > 0 && b.dmg > 0 && Math.abs(a.dmg - b.dmg * 0.9) <= 1.5);

// a shotgun gets nothing from it: buy it back, a M3 shot goes out plain
alice.at(home);
await sleep(300);
alice.send({ t: 'buy', item: 'sup' });
alice.send({ t: 'buy', item: 'm3' });
await until(() => alice.me?.inv?.primary?.id === 'm3' && alice.me.inv.sup, 1000);
bob.at(base, Math.PI / 2);
alice.at([base[0] + 3, base[1], base[2]], -Math.PI / 2);
await sleep(400);
bob.clear();
const o = alice.eye(), d = [-1, 0, 0];
alice.send({ t: 'shoot', o, ds: Array.from({ length: 9 }, () => d), w: 'm3', rt: 0 });
ok('M3: no suppressor', await until(() => got(bob, 'shot').length > 0, 1000) && !got(bob, 'shot')[0].sup);

for (const c of [alice, bob]) c.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
