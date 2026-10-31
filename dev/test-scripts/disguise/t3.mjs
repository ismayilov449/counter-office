// Disguise and bots (MAP=aim_map BOTS=2 FREEZE_TIME=1; GAME_PORT, default 4070). Alice and Dave are CTs (no CT bot),
// Bob a Terrorist plus one Terrorist bot. Alice kills Bob and takes his uniform, then keeps 6 m in front of the bot,
// in its sight, for 6 s: it doesn't shoot her. She fires a shot into the air (blown) and stays: now it shoots her.
import { player, sleep, until, checker, yawTo, ground, los } from './lib.mjs';
const ok = checker();
const rounds = [];
const alice = await player('Alice', 'CT');
alice.on.round = m => rounds.push(m.n);
const dave = await player('Dave', 'CT'), bob = await player('Bob', 'T');
const ID = { alice: alice.id(), dave: dave.id(), bob: bob.id() };
// a round in which everyone (and the bot) is alive
let tries = 0;
for (;;) {
  const n = rounds.length;
  await until(() => rounds.length > n, 60000, 100);
  await sleep(1300);
  await until(() => alice.snap?.ph === 'live', 10000);
  if (alice.alive && bob.alive || ++tries > 3) break;
}
const botRow = () => alice.snap?.pl.find(r => r[9] === 1 && r[0] !== ID.bob && r[8]);
ok('a T bot is playing', !!botRow());
const botId = botRow()?.[0];
dave.at([-20, 0, -24], 0); // out of the way, in a corner
const B = [0, 0, -12], A0 = [0, 0, -16];
bob.at(B, Math.PI); alice.at(A0, yawTo(A0, B)); alice.w = 'usp';
await sleep(700);
for (let i = 0; i < 10 && bob.alive; i++) { alice.shootAt(bob, 'usp'); await sleep(450); }
ok('Alice kills Bob', !bob.alive);
const AB = [B[0] + 0.6, 0, B[2]];
alice.at(AB, yawTo(AB, B), 1); await sleep(250); alice.use(true);
ok('disguised as Bob', await until(() => alice.got('disguiseOn').some(m => m.you), 4500));
alice.use(false); alice.crouch = 0;
// stay 6 m in front of the bot, in its sight
const follow = async (secs) => {
  let seen = 0, samples = 0;
  const hp0 = alice.me?.hp ?? 100;
  const end = Date.now() + secs * 1000;
  while (Date.now() < end) {
    const r = alice.snap?.pl.find(x => x[0] === botId);
    if (!r || !r[8]) break;
    const yaw = r[4], bp = [r[1], r[2], r[3]];
    const at = [bp[0] - Math.sin(yaw) * 6, 0, bp[2] - Math.cos(yaw) * 6];
    at[1] = ground(at[0], at[2], bp[1] + 3);
    alice.at(at, yawTo(at, bp), 0);
    samples++;
    if (los([bp[0], bp[1] + 1.6, bp[2]], [at[0], at[1] + 1.2, at[2]])) seen++;
    await sleep(150);
  }
  return { seen, samples, lost: hp0 - (alice.me?.hp ?? 0) };
};
alice.clear();
const a = await follow(6);
ok(`6 s in front of the bot (in sight ${a.seen}/${a.samples} times): it held fire (hp lost ${a.lost}, dmg messages ${alice.got('dmg').length})`, a.seen > 20 && a.lost === 0 && alice.got('dmg').length === 0);
ok('still disguised (the bot never came within 3 m looking at her)', !alice.got('disguiseOff').length);
alice.send({ t: 'shoot', o: [alice.p[0], alice.p[1] + 1.6, alice.p[2]], d: [0, 1, 0], w: 'usp', rt: 0 });
ok('a shot into the air: blown', await until(() => alice.got('disguiseOff').some(m => m.why === 'shot'), 1000));
const b = await follow(6);
ok(`then in front of it again: it shoots her (dmg messages ${alice.got('dmg').length}, hp lost ${b.lost})`, alice.got('dmg').length > 0);
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'all passed');
for (const c of [alice, dave, bob]) c.close();
process.exit();
