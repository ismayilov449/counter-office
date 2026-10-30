// RPG-26: buy (T), the per-team limit, hold it (screenshot), fire: rocket + boom 'rpg26' + broken pieces, and the
// tube is gone (pistol in hand).
import { open, sleep } from './tw-lib.mjs';
const t = await open('T', 'Rocketeer');
const { ev, send, msgs, click, key, shot, errors } = t;
import { bot } from './tw-lib.mjs';
const ct = await bot(); ct.send({ t: 'join', name: 'Victim', team: 'CT' });
await sleep(8000);
await send({ t: 'buy', item: 'rpg26' }); await sleep(600);
console.log('primary after buy:', await ev("JSON.stringify(__in.filter(m => m.t === 'me').pop()?.inv.primary)"), 'money', await ev("__in.filter(m => m.t === 'me').pop()?.money"));
await key('Digit1'); await sleep(900);
console.log('holding:', await ev("document.getElementById('weapon-name').textContent"));
await shot('rpg26-hold.png');
// drop it and try to buy a second one: the team's one is used up
await send({ t: 'drop', w: 'rpg26' }); await sleep(400);
await send({ t: 'buy', item: 'rpg26' }); await sleep(400);
console.log('second buy msgs:', (await msgs(false)).filter(m => m.t === 'msg').map(m => m.text));
// pick it back up (E near it)
await sleep(1200); await key('KeyE', 120); await sleep(600);
console.log('picked back up:', await ev("__in.filter(m => m.t === 'me').pop()?.inv.primary?.id"));
await key('Digit1'); await sleep(900);
// look a bit down at the wall/floor ahead and fire
await t.mouse('mousemove', { movementX: 0, movementY: 60 }); await sleep(100);
await click(0); await sleep(150);
await shot('rpg26-fire.png');
await sleep(1500);
const got = await msgs();
console.log('after firing:', got.map(m => (m.text || '') + m.t + (m.k ? ':' + m.k : '') + (m.w ? ':' + m.w : '') + (m.ids ? `(${m.ids.length})` : '')).join(' '));
console.log('primary now:', await ev("JSON.stringify(__in.filter(m => m.t === 'me').pop()?.inv.primary)"), 'holding', await ev("document.getElementById('weapon-name').textContent"));
await shot('rpg26-after.png');
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
