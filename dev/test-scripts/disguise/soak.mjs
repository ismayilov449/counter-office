// A soak with bots (BOTS=4, any classic map; GAME_PORT default 4070): one scripted CT for SECS seconds (default 60) who
// goes to every dead Terrorist bot's body, takes its uniform, then stands 8 m in front of a live Terrorist bot. Prints
// kills, rounds, takes, reveals (by reason) and the hits taken while disguised from the team being fooled. Check the
// server log for errors afterwards (run.sh prints them).
import { player, sleep, until, yawTo, ground } from './lib.mjs';
const SECS = +(process.env.SECS || 60);
const c = await player('Soak', 'CT');
c.w = c.me?.inv?.secondary?.id || 'usp';
const stats = { kills: 0, rounds: 0, tries: 0, takes: 0, why: {}, hitsDisguised: 0 };
let disguised = false;
c.on.kill = () => stats.kills++;
c.on.round = () => { stats.rounds++; tried.clear(); };
c.on.disguiseOn = m => { if (m.you) { disguised = true; stats.takes++; } };
c.on.disguiseOff = m => { if (m.you) { disguised = false; stats.why[m.why] = (stats.why[m.why] || 0) + 1; } };
c.on.dmg = () => { if (disguised) stats.hitsDisguised++; };
const tried = new Set();
const end = Date.now() + SECS * 1000;
while (Date.now() < end) {
  await sleep(200);
  const s = c.snap;
  if (!s || !c.alive || s.ph !== 'live') continue;
  if (!disguised) {
    const body = s.pl.find(r => r[9] === 1 && !r[8] && !tried.has(r[0]));
    if (!body) continue;
    tried.add(body[0]);
    stats.tries++;
    const at = [body[1] + 0.6, body[2], body[3]];
    c.at(at, yawTo(at, [body[1], 0, body[3]]), 1);
    await sleep(250);
    const hits0 = c.got('dmg').length;
    c.use(true);
    const started = await until(() => c.snap?.me?.a === 'disguise', 800);
    await until(() => disguised || !c.alive, 3500);
    c.use(false);
    c.crouch = 0;
    const why = disguised ? 'took it' : !c.alive ? 'killed meanwhile' : !started ? 'did not start' : c.got('dmg').length > hits0 ? 'hit meanwhile' : 'stopped';
    stats.tryResults = { ...(stats.tryResults || {}), [why]: (stats.tryResults?.[why] || 0) + 1 };
  } else {
    // in front of a live Terrorist bot, 8 m away
    const bot = s.pl.find(r => r[9] === 1 && r[8]);
    if (!bot) continue;
    const at = [bot[1] - Math.sin(bot[4]) * 8, 0, bot[3] - Math.cos(bot[4]) * 8];
    at[1] = ground(at[0], at[2], bot[2] + 3);
    c.at(at, yawTo(at, [bot[1], 0, bot[3]]), 0);
  }
}
console.log('soak:', JSON.stringify(stats));
c.close();
process.exit(0);
