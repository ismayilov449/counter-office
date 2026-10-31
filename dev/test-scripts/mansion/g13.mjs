// Step 13 in the browser: a Terrorist (warmup) in the back garden — the gateway, the pool (jumps in, swims up and
// climbs out with Space), the greenhouse (shoots a pane out), the maze. Screenshots in OUT, page errors printed.
import { open, sleep } from './game.mjs';
const g = await open('T', 'Gardener', ['msg', 'glass']);
const { tp, key, keyDown, keyUp, click, shot, msgs, errors, ev, look } = g;
const pos = async () => JSON.parse(await ev("JSON.stringify((() => { try { return window.__lastState || null; } catch { return null; } })())"));
await tp([-26.0, 0, 0.0], Math.PI / 2); await sleep(700);
await shot('g13_gate.png');
// the pool: stand on the deck, walk in
await tp([-40.0, 0, -17.2], Math.PI); await sleep(500);
await shot('g13_pool.png');
await keyDown('KeyW'); await sleep(1500); await keyUp('KeyW'); await sleep(800);
await shot('g13_inpool.png');
// swim west and climb out holding Space
await tp([-43.5, -2.0, -12.0], Math.PI / 2); await sleep(300);
await keyDown('Space'); await keyDown('KeyW'); await sleep(3500); await keyUp('KeyW'); await keyUp('Space'); await sleep(500);
await shot('g13_out.png');
// the greenhouse: shoot a pane of its west wall from outside
await tp([-41.0, 0, 11.75], -Math.PI / 2); await sleep(400);
await key('Digit2'); await sleep(1500);
await click(0, 120); await sleep(700);
console.log('greenhouse panes broken:', JSON.stringify((await msgs()).filter(m => m.t === 'glass').map(m => m.ids)));
await shot('g13_greenhouse.png');
await tp([-42.0, 0, 12.0], Math.PI * 0.85); await sleep(500);
await shot('g13_maze.png');
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
