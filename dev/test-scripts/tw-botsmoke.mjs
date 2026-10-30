// A person joins (plain socket) so bots fill the teams; let them play a while and count kills/rockets.
import { bot, sleep } from './tw-lib.mjs';
const secs = +(process.argv[2] || 30);
const p = await bot();
p.send({ t: 'join', name: 'Watcher', team: 'T' });
await sleep(secs * 1000);
const count = k => p.inbox.filter(m => m.t === k).length;
console.log('kills', count('kill'), 'rockets', count('rocket'), 'booms', count('boom'), 'rounds', count('round'), 'satchels', count('satchels'));
process.exit(0);
