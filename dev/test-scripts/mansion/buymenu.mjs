// Opens the buy menu as a Terrorist (warmup) and takes a screenshot of it (OUT/buymenu.png).
import { open, sleep } from './game.mjs';
const g = await open(process.argv[2] || 'T', 'Shopper');
await g.key('KeyB'); await sleep(1500);
console.log(await g.shot('buymenu.png'), 'errors:', g.errors.length ? g.errors.join(' | ') : 'none');
process.exit(0);
