// 3.1 Circuits, breakers and the generator, server side (Mansion; the test server from srv.sh with POWER_SURGE=0
// GEN_TANK=8 ROUND_TIME=600). A CT ("Sparky") and a T ("Cutter"), round 1:
//   - on joining: the power state (breakers on, the generator off with a full tank), no dead light groups
//   - the T switches off the upper floor's breaker (hold E 1 s, aimed at it): only the upper floor's lamps go out and are
//     listed dead; a light switch up there says why; a CT can't switch a breaker off, but on again
//   - the lift's breaker stops the lift (its state says no power); the CCTV's breaker
//   - a CT switches the living room's lamp off; the T pulls the fuse box's lever: everything dead
//   - the CT starts the generator (hold E 3 s): the two floors' lamps are back, but not the switched-off one, not the
//     cellar's, and the lift stays dead; the T switches it off (2 s); started again, it runs out of fuel (GEN_TANK)
//   - the CT pulls the lever back: every lamp as its switch says; the cellar's breaker alone darkens the cellar
//   - a restart puts it all back
import { player, sleep, admin } from '../mansion/client.mjs';

const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 8000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await sleep(50); return cond(); };
const UPPER = ['lampa9', 'lampa3', 'lampa10', 'lampa11', 'lampa1'], GROUND = ['lampa6', 'lampa4', 'lampa5', 'lampa7', 'lampa8', 'lampa2', 'garage'];
const PANEL = [-16.95, -2.2, -4.6], FUSE = [-18.3, -2.2, -4.5], GEN = [-19.6, 0, -16.0];
const SW_UP = [-16.0, 4.27, 1.32], SW_LIVING = [-19.0, 0.813, -4.0];

const ct = await player('Sparky', 'CT'), t = await player('Cutter', 'T');
for (const c of [ct, t]) {
  c.L = c.log.find(m => m.t === 'welcome')?.lights || {};
  c.pw = c.log.filter(m => m.t === 'power').pop() || null;
  c.on.power = m => { c.pw = m; };
  c.on.lights = m => { c.L = m.lights; };
  c.on.world = m => { if (m.lights) c.L = m.lights; }; // (a new round's)
  c.on.elevState = m => { c.el = m; };
}
// E aimed at something of ours (or nothing), held for `hold` ms
const press = async (c, aim, hold = 120) => { c.send({ t: 'pwAim', a: aim }); await sleep(60); c.use(true); await sleep(hold); c.use(false); await sleep(120); };
const msgs = (c, re) => c.got('msg').some(m => re.test(m.text));

for (let i = 0; i < 150 && !t.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
ok('round 1 started', t.got('msg').some(m => /Guard the hostages/.test(m.text)));
await sleep(3400); // the freeze time
await until(() => ct.pw && ct.L && ct.el);

ok(`the power state on joining: breakers on, generator off, full tank (${JSON.stringify(ct.pw)})`, ct.pw && ct.pw.main === 1 && ct.pw.b.every(v => v === 1) && ct.pw.g[0] === 0 && ct.pw.g[1] === 8 && ct.pw.cut === 0 && ct.pw.burst.length === 0);
ok('no dead light groups, every lamp on', Array.isArray(ct.L.dead) && ct.L.dead.length === 0 && [...UPPER, ...GROUND, 'cellar'].every(g => ct.L[g] === true));

// ---- the upper floor's breaker
t.at(PANEL, 0); await sleep(200);
t.clear();
await press(t, 'b0', 1300);
await until(() => ct.pw.b[0] === 0, 2000);
ok('the T switched the upper floor\'s breaker off (hold E 1 s)', ct.pw.b[0] === 0 && ct.pw.b.slice(1).every(v => v === 1));
ok('the upper floor\'s lamps are out and dead; the ground floor\'s and the cellar\'s on', UPPER.every(g => ct.L[g] === false && ct.L.dead.includes(g)) && GROUND.every(g => ct.L[g] === true) && ct.L.cellar === true && !ct.L.dead.includes('lampa7'));
ok('everyone is told', msgs(ct, /switched off the breaker for the upper floor/));
ok('the breaker\'s sound', ct.got('pwSfx').some(m => m.s === 'breaker'));
t.at(SW_UP, 0); await sleep(200);
t.clear();
await press(t, null);
ok('a light switch upstairs: no power, its breaker is off', msgs(t, /No power on the upper floor — its breaker is off/));
ct.at(PANEL, 0); await sleep(200);
ct.clear();
await press(ct, 'b1', 1300);
ok('a CT can\'t switch a breaker off', ct.pw.b[1] === 1 && msgs(ct, /is on\. \(Only the Terrorists/));
await press(ct, 'b0', 1300);
await until(() => ct.pw.b[0] === 1, 2000);
ok('the CT switched it back on: the upper floor\'s lamps are back', ct.pw.b[0] === 1 && UPPER.every(g => ct.L[g] === true) && ct.L.dead.length === 0);
// a short press doesn't do it (the hold is cut short)
t.at(PANEL, 0); await sleep(150);
await press(t, 'b2', 400);
await sleep(900);
ok('letting go of E too soon does nothing', ct.pw.b[2] === 1);

// ---- the lift's breaker, the CCTV's
await press(t, 'b4', 1300);
await until(() => ct.el.p === 0, 2000);
ok('the lift\'s breaker off: the lift has no power, its cabin light is out', ct.pw.b[4] === 0 && ct.el.p === 0 && ct.L.elevator === false && ct.L.dead.includes('elevator') && GROUND.every(g => ct.L[g]));
await press(ct, 'b4', 1300);
await until(() => ct.el.p === 1, 2000);
ok('back on: the lift has power', ct.pw.b[4] === 1 && ct.el.p === 1 && ct.L.elevator === true);
await press(t, 'b3', 1300);
await until(() => ct.pw.b[3] === 0, 2000);
ok('the CCTV\'s breaker off (no lamps on it)', ct.pw.b[3] === 0 && ct.L.dead.length === 0);
await press(ct, 'b3', 1300);
await until(() => ct.pw.b[3] === 1, 2000);

// ---- the mains (the fuse box), the generator
ct.at(SW_LIVING, 0); await sleep(200);
await press(ct, null);
await until(() => ct.L.lampa7 === false, 2000);
ok('the CT switched the living room\'s lamp off', ct.L.lampa7 === false);
t.at(FUSE, 0); await sleep(200);
t.clear();
await press(t, null, 3300);
await until(() => ct.pw.main === 0, 2000);
ok('the T pulled the fuse box\'s lever: mains off, every group dead', ct.pw.main === 0 && [...UPPER, ...GROUND, 'cellar', 'elevator'].every(g => ct.L[g] === false && ct.L.dead.includes(g)) && ct.L.power === false);
ok('the lights message says power off (the browsers\' sound and flicker)', t.got('lights').some(m => m.power === 'off'));
ok('the lift has no power', ct.el.p === 0);
ct.at(GEN, Math.PI); await sleep(200);
ct.clear();
await press(ct, 'g', 3300);
await until(() => ct.pw.g[0] === 1, 2000);
ok(`the CT started the generator (hold E 3 s): ${JSON.stringify(ct.pw.g)}`, ct.pw.g[0] === 1);
ok('the two floors\' lamps are back (but not the one switched off)', [...UPPER, ...GROUND].filter(g => g !== 'lampa7').every(g => ct.L[g] === true) && ct.L.lampa7 === false);
ok('the cellar and the lift stay dead', ct.L.cellar === false && ct.L.elevator === false && ct.L.dead.includes('cellar') && ct.L.dead.includes('elevator') && !ct.L.dead.includes('lampa9') && ct.el.p === 0);
ok('the generator\'s start sound, everyone told', ct.got('pwSfx').some(m => m.s === 'genstart') && msgs(ct, /started the generator/));
t.at(GEN, Math.PI); await sleep(200);
await press(t, 'g', 2300);
await until(() => ct.pw.g[0] === 0, 2000);
ok(`the T switched it off (2 s), the floors dark again; fuel left ${ct.pw.g[1]}`, ct.pw.g[0] === 0 && UPPER.every(g => ct.L[g] === false) && ct.pw.g[1] > 0 && ct.pw.g[1] < 8);
await press(t, 'g');
ok('a T can\'t start it', msgs(t, /The generator is off\. \(The CTs can start it\.\)/));
await press(ct, 'g', 3300);
await until(() => ct.pw.g[0] === 1, 2000);
ct.clear();
await until(() => ct.pw.g[0] === 0, 9000);
ok('started again, it runs out of fuel', ct.pw.g[0] === 0 && ct.pw.g[1] === 0 && ct.got('pwSfx').some(m => m.s === 'genout') && msgs(ct, /ran out of fuel/) && UPPER.every(g => ct.L[g] === false));
await press(ct, 'g');
ok('an empty tank: it won\'t start', msgs(ct, /tank is empty/) && ct.pw.g[0] === 0);

// ---- the mains back: every lamp as its switch says; the cellar's breaker alone
ct.at(FUSE, 0); await sleep(200);
ct.clear();
await press(ct, null, 5300);
await until(() => ct.pw.main === 1, 2000);
ok('the CT pulled the lever back: every lamp on but the one switched off', ct.pw.main === 1 && [...UPPER, ...GROUND, 'cellar', 'elevator'].filter(g => g !== 'lampa7').every(g => ct.L[g] === true) && ct.L.lampa7 === false && ct.L.dead.length === 0 && ct.el.p === 1);
ok('the lights message says power on', ct.got('lights').some(m => m.power === 'on'));
t.at(PANEL, 0); await sleep(200);
await press(t, 'b2', 1300);
await until(() => ct.pw.b[2] === 0, 2000);
ok('the cellar\'s breaker: the cellar dark, the rest lit', ct.L.cellar === false && ct.L.dead.join() === 'cellar' && ct.L.lampa6 === true && ct.L.lampa9 === true);

// ---- a restart
ct.clear();
await admin({ action: 'restart' });
await until(() => ct.got('power').length && ct.pw.b[2] === 1, 6000);
await until(() => ct.L.lampa7 === true, 3000);
ok(`a restart: breakers on, the generator full, every lamp on (${JSON.stringify(ct.pw)})`, ct.pw.b.every(v => v === 1) && ct.pw.g[0] === 0 && ct.pw.g[1] === 8 && ct.pw.main === 1 && ct.L.lampa7 === true && ct.L.cellar === true && ct.L.dead.length === 0);

ct.close(); t.close();
process.exit(process.exitCode || 0);
