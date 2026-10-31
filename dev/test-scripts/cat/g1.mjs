// The cat in the real game, in the headless Edge (NOT RUN YET: the user's no-browser rule; for the architect).
// Server: srv.sh with MAP=cs_mansion (then again with MAP=cs_mansion_night), BOTS=0 ROUND_TIME=900, GAME_PORT 4060;
// headless Edge on CDP_PORT 9460 (see RESUME.md section 6; stop it by its command line only).
//   node dev/test-scripts/cat/g1.mjs        (screenshots in OUT, PREFIX default cat_<map>)
// The browser is a T. 1: round start, looking at the basket: the cat asleep in it (and the bowl in the kitchen).
// 2: standing still next to it: it gets up, comes over and sits looking up (the "mrrp" and the purr: listen by ear
// in a real browser). 3: a scripted CT fires into the air by it: it runs off. 4: the night map: its eyes glow in the
// dark living room (lights off). Prints the cat messages heard and every page error.
// What to look at: the cat's size next to the sofa; no sliding feet when it walks/trots/runs; it sits on the floor
// (not floating, not sunk); the tail curls; it hops onto the sofa/sill without cutting through the edge; eyes = two
// small dots, only at night, shut asleep; draw calls with and without it (catview.mjs prints them).
import { open, sleep } from '../mansion/game.mjs';
import { player } from './catclient.mjs';
const map = (await (await fetch(`http://127.0.0.1:${process.env.GAME_PORT || 4060}/api/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'testpass', action: 'state' }) })).json()).state?.map;
const P = process.env.PREFIX || `cat_${map}`;
const g = await open('T', 'Owner', ['msg', 'catMeow', 'boom']);
const { tp, shot, msgs, errors } = g;
const admin = action => fetch(`http://127.0.0.1:${process.env.GAME_PORT || 4060}/api/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'testpass', ...action }) }).then(r => r.json());
const ct = await player('Shooter', 'CT');
ct.at([25, 0, -5]);
await sleep(4000); // (the round starts: the cat back in its basket)
await admin({ action: 'restart' });
await sleep(1500);

// 1. the basket, from the living room
await tp([-20.4, 0.91, 3.6], Math.PI / 2 + 0.12, -0.35); await sleep(1200);
await shot(`${P}_1basket.png`);
await tp([-16.6, 0.81, -12.3], 0.45, -0.45); await sleep(800);
await shot(`${P}_1bowl.png`);

// 2. standing still next to it: it follows
await tp([-21.0, 0.91, 3.2], Math.PI / 2 + 0.3, -0.5); await sleep(7000);
await shot(`${P}_2follow.png`);
await tp([-20.0, 0.91, -0.5], Math.PI / 2 + 1.1, -0.4); await sleep(2000);
await shot(`${P}_2walking.png`);
await sleep(5000);
await shot(`${P}_2sitting.png`);

// 3. gunfire by it: it runs off
const cat = ct.cat?.p || [-20.5, 0.91, 0.5];
ct.at([cat[0] + 3, cat[1], cat[2] + 1]); await sleep(500);
ct.shoot([cat[0] + 3, cat[1] + 1.6, cat[2] + 1], [cat[0] + 3.2, cat[1] + 9, cat[2] + 1]);
await sleep(400);
await shot(`${P}_3running.png`);
await sleep(1200);
await shot(`${P}_3gone.png`);
ct.at([25, 0, -5]);

// 4. night: the living room's lights off, the cat in its basket again (a restart): two glowing dots
if (map === 'cs_mansion_night') {
  await admin({ action: 'restart' }); await sleep(1500);
  // the scripted CT flips the living room's switch (lampa7, by the door at z -5) and goes away again
  ct.at([-19.71, 0.91, -4.6]); await sleep(400);
  ct.send({ t: 'use', on: true }); await sleep(100); ct.send({ t: 'use', on: false }); await sleep(400);
  ct.at([25, 0, -5]);
  await tp([-19.6, 0.91, 3.0], Math.PI / 2 + 0.25, -0.3); await sleep(1500);
  await shot(`${P}_4eyes.png`);
  await tp([-15.5, 0.91, 2.0], Math.PI / 2 + 0.12, -0.12); await sleep(1000);
  await shot(`${P}_4eyesfar.png`);
}
console.log('cat messages:', (await msgs()).filter(m => m.t === 'catMeow').map(m => m.k).join(', ') || '(none)');
console.log('ERRORS:', errors.join('\n') || '(none)');
ct.close();
process.exit(0);
