// 8.2 Disarm from behind (GAME_PORT=3993 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1).
// Bob (T) holds an AK, looking west; Alice (CT, only her USP) presses E:
// a. in front of him (1 m): nothing; b. 2 m behind him: nothing; c. 1 m behind: his AK is hers (her rifle slot was
// free), he's told and switched to his knife; d. at once again (his Glock now): the 3 s cooldown; e. after it: the
// Glock is snatched, and since she has her USP it lands on the floor in front of her; Bob has only his knife.
import { player, sleep, until, checker, nextLive, got } from '../explosives/lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const ID = { alice: alice.id(), bob: bob.id() };
let drops = [];
alice.ws.addEventListener('message', e => { const s = String(e.data); if (s.includes('"dr":')) { const m = JSON.parse(s); if (m.dr) drops = m.dr; } });
await nextLive([alice, bob], st);
await until(() => alice.snap?.ph === 'live', 5000);

bob.send({ t: 'buy', item: 'ak47' });
ok('Bob has an AK', await until(() => bob.me?.inv?.primary?.id === 'ak47', 1000));
bob.w = 'ak47';
const base = [-22.25, 4.27, 8.941], W = Math.PI / 2; // (an open floor by the T spawn; yaw pi/2 looks west, -x)
bob.at(base, W);
async function press(at, yaw = -W) {
  alice.at(at, yaw);
  await sleep(300);
  alice.clear(); bob.clear();
  alice.use(true);
  await sleep(250);
  alice.use(false);
  await sleep(150);
}
await press([base[0] - 1, base[1], base[2]], -W);
ok('a: in front of him: nothing', !got(bob, 'ccDisarmed').length && bob.me.inv.primary?.id === 'ak47');
await press([base[0] + 2, base[1], base[2]], W);
ok('b: 2 m behind him: nothing', !got(bob, 'ccDisarmed').length);
await press([base[0] + 1, base[1], base[2] + 0.3], W);
ok('c: 1 m behind: Bob is told (ccDisarmed)', await until(() => got(bob, 'ccDisarmed', m => m.by === ID.alice && m.w === 'ak47').length > 0, 1000));
ok('c: "You were disarmed!" (big)', got(bob, 'msg', m => m.big && /You were disarmed/.test(m.text)).length > 0);
await until(() => !bob.me.inv.primary && alice.me.inv.primary, 1000);
ok('c: his AK is gone', !bob.me.inv.primary);
ok(`c: it's Alice's (${alice.me.inv.primary?.id}, mag ${alice.me.inv.primary?.mag})`, alice.me.inv.primary?.id === 'ak47' && alice.me.inv.primary.mag > 0);
ok('c: Alice is told', got(alice, 'msg', m => /snatched his AK/.test(m.text)).length > 0);
bob.w = 'glock';
bob.at(base, W);
await press([base[0] + 1, base[1], base[2]], W);
ok('d: again at once: the cooldown', !got(bob, 'ccDisarmed').length && bob.me.inv.secondary?.id === 'glock');
await sleep(3000);
await press([base[0] + 1, base[1], base[2]], W);
ok('e: after 3 s: the Glock goes', await until(() => got(bob, 'ccDisarmed', m => m.w === 'glock').length > 0, 1000));
await until(() => !bob.me.inv.secondary, 1000);
ok(`e: Bob has no gun left (knife only) ${JSON.stringify(bob.me.inv)}`, !bob.me.inv.primary && !bob.me.inv.secondary);
ok('e: Alice keeps her USP', alice.me.inv.secondary?.id === 'usp');
ok('e: the Glock is on the floor in front of her', await until(() => drops.some(d => d[1] === 'glock' && Math.hypot(d[2] - alice.p[0], d[4] - alice.p[2]) < 2.5), 1500));
ok('e: Alice is told it\'s on the floor', got(alice, 'msg', m => /on the floor/.test(m.text)).length > 0);

for (const c of [alice, bob]) c.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
