// Disguise and bots (MAP=aim_map BOTS=2 FREEZE_TIME=1 AUTO_BALANCE=0; GAME_PORT, default 4070). Alice and Dave are CTs
// (so no CT bot), Bob a Terrorist plus one Terrorist bot. Alice kills Bob where the bot can't see it and takes his
// uniform, keeps out of the bot's sight for 3 s, then stays 6 m in front of it, in its sight, for 6 s: it doesn't shoot
// her. She fires a shot into the air (blown) and stays in front of it: now it shoots her.
import { player, sleep, until, checker, yawTo, ground, los } from './lib.mjs';
const ok = checker();
const rounds = [];
const alice = await player('Alice', 'CT');
alice.on.round = m => rounds.push(m.n);
const dave = await player('Dave', 'CT'), bob = await player('Bob', 'T');
const ID = { alice: alice.id(), dave: dave.id(), bob: bob.id() };
alice.w = 'usp';
const botRow = () => alice.snap?.pl.find(r => r[9] === 1 && r[0] !== ID.bob && r[8]);
const ctBots = () => alice.snap?.pl.filter(r => r[9] === 2 && r[0] !== ID.alice && r[0] !== ID.dave).length;
const eyeOfRow = r => [r[1], r[2] + 1.6, r[3]];
const dmgs = () => alice.got('dmg');
const lost = () => dmgs().reduce((s, m) => s + (m.d || 0), 0);
const SPOTS = [[-20, -20], [20, -20], [-20, 0], [20, 0], [0, -20], [-20, 15], [20, 15], [10, 10], [-10, 10]].map(([x, z]) => [x, ground(x, z), z]);
// the spot furthest from the bot that it can't see
const hidden = () => {
  const r = botRow(); if (!r) return SPOTS[0];
  const e = eyeOfRow(r);
  const free = SPOTS.filter(s => !los(e, [s[0], s[1] + 1.2, s[2]]) && !los(e, [s[0] + 0.6, s[1] + 0.5, s[2] + 4]));
  return (free.length ? free : SPOTS).sort((a, b) => Math.hypot(b[0] - r[1], b[2] - r[3]) - Math.hypot(a[0] - r[1], a[2] - r[3]))[0];
};
// stay 6 m in front of the bot, in its sight; count the times it could see her
async function follow(secs) {
  let seen = 0, samples = 0;
  const end = Date.now() + secs * 1000;
  while (Date.now() < end && alice.alive) {
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
  return { seen, samples };
}

let botId = null, done = false;
for (let attempt = 1; attempt <= 3 && !done; attempt++) {
  const n = rounds.length;
  await until(() => rounds.length > n, 130000, 100);
  for (const c of [alice]) c.send({ t: 'reload', w: 'usp' });
  await sleep(1300);
  await until(() => alice.snap?.ph === 'live', 10000);
  await sleep(300);
  if (!alice.alive || !bob.alive || !botRow() || ctBots()) { console.log(`     (round ${rounds.at(-1)}: not the right line-up, next one)`); continue; }
  botId = botRow()[0];
  dave.at([-24, 0, -24], 0);
  const B = hidden(), A0 = [B[0], B[1], B[2] - 4];
  bob.at(B, Math.PI); alice.at(A0, yawTo(A0, B));
  await sleep(700);
  for (let i = 0; i < 10 && bob.alive; i++) { alice.shootAt(bob, 'usp'); await sleep(400); }
  if (!ok(`round ${rounds.at(-1)}: Alice kills Bob out of the bot's sight`, !bob.alive)) continue;
  const AB = [B[0] + 0.6, B[1], B[2]];
  alice.clear();
  alice.at(AB, yawTo(AB, B), 1); await sleep(250); alice.use(true);
  const on = await until(() => alice.got('disguiseOn').some(m => m.you), 4500);
  alice.use(false); alice.crouch = 0;
  if (!ok('disguised as Bob' + (on ? '' : ` (hit while changing? ${dmgs().length} hits)`), on)) continue;
  // out of the bot's sight for 3 s (whatever it had in mind for her before is forgotten)
  const H = hidden(); alice.at(H, 0, 0);
  await sleep(3000);
  alice.clear();
  const a = await follow(6);
  console.log('     alice got:', JSON.stringify(alice.log.filter(m => ['dmg', 'disguiseOff', 'kill'].includes(m.t)).map(m => [m.t, m.why || m.d || '', m.k ?? ''])));
  ok(`6 s in front of the bot (in its sight ${a.seen}/${a.samples} times): it held fire (hits ${dmgs().length}, hp lost ${lost()})`, a.seen > 20 && dmgs().length === 0);
  ok('still disguised (the bot never came within 3 m looking at her)', !alice.got('disguiseOff').length);
  alice.send({ t: 'shoot', o: [alice.p[0], alice.p[1] + 1.6, alice.p[2]], d: [0, 1, 0], w: 'usp', rt: 0 });
  ok('a shot into the air: blown', await until(() => alice.got('disguiseOff').some(m => m.why === 'shot'), 1000));
  const before = dmgs().length;
  const b = await follow(8);
  ok(`then in front of it again (in sight ${b.seen}/${b.samples}): it shoots her (hits ${dmgs().length - before}, hp lost ${lost()})`, dmgs().length > before);
  done = true;
}
ok('the test ran', done);
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'all passed');
for (const c of [alice, dave, bob]) c.close();
process.exit();
