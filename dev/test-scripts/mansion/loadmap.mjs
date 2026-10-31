// Loads the game in the headless Edge as a Terrorist on whatever map the test server runs, takes a screenshot
// (OUT/load_<name>.png) and prints the page errors.
import { open, sleep } from './game.mjs';
const name = process.argv[2] || 'map';
const g = await open('T', 'Loader');
await sleep(1500);
console.log('screenshot', await g.shot(`load_${name}.png`));
console.log('map title:', await g.ev("document.querySelector('.radar-name, #radar-name, #map-name')?.textContent || ''"));
console.log('errors:', g.errors.length ? g.errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
