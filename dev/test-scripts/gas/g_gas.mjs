// The gas system in the browser (headless Edge on CDP_PORT, test server on GAME_PORT with GAS_LEAK_X=3): a Terrorist
// alone (warmup) looks at the kitchen's pipe and meter, shoots the meter (the real click), sees the vapour and gets the
// valve hint, waits for the gas (the HUD line, the shimmer), and sets it off with a shot. Then the cellar's boiler.
// Screenshots in OUT (gas_*.png), page errors printed. MAP=cs_mansion_night works the same (NIGHT=1 names the shots).
import { open, sleep } from '../mansion/game.mjs';
const g = await open('T', 'Gasman', ['gasLeak', 'gasBoom', 'gasCough', 'msg', 'brk', 'doors', 'kill', 'dmg', 'spawn']);
const { tp, key, click, shot, msgs, errors, ev } = g;
const N = process.env.NIGHT ? 'night_' : '';
const text = id => ev(`document.getElementById('${id}')?.textContent || ''`);
const lookAt = (from, at) => { const e = [from[0], from[1] + 1.62, from[2]], dx = at[0] - e[0], dy = at[1] - e[1], dz = at[2] - e[2]; return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
const METER = [-16.6, 1.5, -13.9];

await key('Digit2'); await sleep(1500); // the pistol, and wait out the draw
// the clean kitchen, and the pipe close up
const VIEW = [-22.3, 0.81, -6.2], VIEWAT = [-16.6, 1.6, -13.9];
await tp(VIEW, ...lookAt(VIEW, VIEWAT)); await sleep(1200);
await shot(`gas_${N}clean.png`);
const NEAR = [-16.9, 0.81, -12.2];
await tp(NEAR, ...lookAt(NEAR, [-16.6, 1.9, -14.0])); await sleep(900);
await shot(`gas_${N}pipe.png`);
// shoot the meter
const SPOT = [-17.4, 0.81, -11.6];
await tp(SPOT, ...lookAt(SPOT, METER)); await sleep(800);
await click(0, 250); await sleep(700);
const leak = (await msgs()).filter(m => m.t === 'gasLeak');
console.log('leak:', JSON.stringify(leak));
await shot(`gas_${N}leak.png`);
await tp([-16.6, 0.81, -13.1], ...lookAt([-16.6, 0.81, -13.1], [-16.6, 1.06, -13.95])); await sleep(700);
console.log('hint at the valve:', await text('hint'));
await shot(`gas_${N}valve.png`);
// wait for the gas, out of the kitchen (in the hall east of it)
await tp([-10, 0.81, -12], -Math.PI / 2); await sleep(500);
console.log('HUD in the hall:', JSON.stringify(await text('gas-msg')));
await sleep(9000);
await tp(VIEW, ...lookAt(VIEW, VIEWAT)); await sleep(2500);
console.log('HUD in the kitchen:', JSON.stringify(await text('gas-msg')));
await shot(`gas_${N}haze.png`);
// in the dark: the kitchen's light switched off
await tp([-14.0, 0.81, -10.67], Math.PI / 2); await sleep(300);
// (E would spark: the gas is over the threshold by now? only look at the HUD here)
console.log('HUD by the switch:', JSON.stringify(await text('gas-msg')));
// set it off with a shot from the doorway of the living room
const FROM = [-18, 0.81, -1.5];
await tp(FROM, ...lookAt(FROM, [-18, 2.0, -13.9])); await sleep(700);
await msgs();
await click(0, 250); await sleep(250);
await shot(`gas_${N}boom1.png`);
await sleep(500);
await shot(`gas_${N}boom2.png`);
const after = await msgs();
console.log('boom:', JSON.stringify(after.filter(m => m.t === 'gasBoom')), '| pieces:', after.filter(m => m.t === 'brk').reduce((s, m) => s + m.ids.length, 0), '| dmg:', after.filter(m => m.t === 'dmg').map(m => m.d).join(','));
await sleep(2500);
await tp(VIEW, ...lookAt(VIEW, VIEWAT)); await sleep(1500);
await shot(`gas_${N}after.png`);
// the cellar's boiler
const C = [-16.8, -2.2, 0.6];
await tp(C, ...lookAt(C, [-13.7, -1.0, 1.9])); await sleep(1500);
await shot(`gas_${N}boiler.png`);
console.log('errors:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
process.exit(0);
