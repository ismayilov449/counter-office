// A map loads, the buy menu opens with the new pictures, no errors.
import { open, sleep } from './tw-lib.mjs';
const name = process.argv[2] || 'menu';
const { ev, key, shot, errors } = await open('T', 'Shopper');
await sleep(1500);
await key('KeyB'); await sleep(1200);
const icons = await ev("JSON.stringify([...document.querySelectorAll('[data-buy]')].filter(e => ['rpg26','satchel'].includes(e.dataset.buy)).map(e => e.dataset.buy + ':' + (e.querySelector('img')?.src.length || 0) + ':' + e.textContent.trim().slice(0, 40)))");
console.log('map', await ev("document.getElementById('map-name')?.textContent"), 'items', icons);
await shot(name + '.png');
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
