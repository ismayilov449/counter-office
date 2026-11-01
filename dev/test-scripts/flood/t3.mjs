// Floodgate with bots (GAME_PORT=4040; run srv.sh BOTS=4 DEBUG_TICK=1 first): one scripted player opens the valve
// in every live round and waits on the street, for N seconds (default 60), so the bots play through floods (they
// don't swim: they may drown, or be electrocuted). Prints the flood deaths and the round messages; check srv.log.
import { player, sleep } from '../mansion/client.mjs';
const secs = +(process.argv[2] || 60);
const c = await player('Soak', 'T');
let ph = null, fl = null, round = 0, opened = -1;
c.on.s = m => { ph = m.ph; fl = m.fl || null; };
c.on.round = () => round++;
{ const push = c.log.push.bind(c.log); c.log.push = m => (m.t === 's' ? 0 : push(m)); }
const end = Date.now() + secs * 1000;
let maxLevel = -5;
while (Date.now() < end) {
  if (ph === 'live' && opened !== round && c.alive) {
    opened = round;
    c.at([23.8, -5.0, -1.9]); await sleep(300);
    c.use(true); await sleep(3300); c.use(false);
    c.at([27.5, 0, 1]);
  }
  if (fl) maxLevel = Math.max(maxLevel, fl[0]);
  await sleep(250);
}
const kills = c.got('kill');
console.log('rounds', round, 'valve opened', c.got('floodValve').length, 'times; highest level', maxLevel);
console.log('kills', kills.length, '— drowned', kills.filter(k => k.w === 'drowned').length, ', electrocuted', kills.filter(k => k.w === 'electrocuted').length);
console.log('msgs', c.got('msg').map(m => m.text).slice(-8).join(' | '));
c.close(); process.exit(0);
