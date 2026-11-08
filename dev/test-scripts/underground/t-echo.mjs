// 5.2 Echo, the server's part (GAME_PORT=4250; run srv.sh START_MONEY=16000 first, MAP=cs_mansion or cs_mansion_night):
// the echo is made in each browser from the 'shot' and 'boom' messages, so check that they reach everyone, however
// far, with an origin the shared code calls underground: a T fires a pistol and throws an HE in the cellar, a CT on
// the street (about 45 m away) and one upstairs get both; the same from the kitchen is not underground.
import { player, sleep } from '../mansion/client.mjs';
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { isUnderground } = await import(G + 'shared/underground.js');
const map = MAPS[process.env.MAP || 'cs_mansion'];
const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', what); };
const T = await player('Tee', 'T'), C = await player('Cee', 'CT'), C2 = await player('Cee2', 'CT');
for (const c of [T, C, C2]) { c.ph = null; c.on.s = m => { c.ph = m.ph ?? c.ph; }; const push = c.log.push.bind(c.log); c.log.push = m => (m.t === 's' ? 0 : push(m)); }
const waitFor = async (fn, ms, step = 100) => { for (let i = 0; i < ms / step; i++) { if (fn()) return true; await sleep(step); } return fn(); };
await waitFor(() => T.ph === 'live', 25000);
console.log('map', map.id, 'phase', T.ph);
C.at([27.5, 0, 12]); C2.at([-19, 4.267, -10]);
const CELLAR = [-15.5, -2.2, 0], KITCHEN = [-19, 0.813, -11];
const eye = p => [p[0], p[1] + 1.62, p[2]];

for (const [where, p, want] of [['the cellar', CELLAR, true], ['the kitchen', KITCHEN, false]]) {
  T.at(p, 0); await sleep(300);
  for (const c of [C, C2]) c.clear();
  T.send({ t: 'shoot', o: eye(p), d: [0, -0.2, -0.98], w: 'glock', rt: 0 });
  await sleep(300);
  const got = [C, C2].map(c => c.got('shot')[0]);
  check(got.every(s => s && isUnderground(map, s.o) === want), `a pistol shot in ${where}: the CT on the street and the one upstairs get it, origin ${want ? '' : 'not '}underground (${JSON.stringify(got.map(s => s?.o))})`);
}
// an HE in the cellar (bought in the kitchen: the cellar isn't in the buy zone)
T.at(KITCHEN, 0); await sleep(200);
T.clear();
T.send({ t: 'buy', item: 'he' }); await sleep(300);
if (T.got('msg').length) console.log('  buy:', JSON.stringify(T.got('msg').map(m => m.text)));
T.at(CELLAR, 0); await sleep(300);
for (const c of [C, C2]) c.clear();
T.send({ t: 'nade', k: 'he', o: eye(CELLAR), v: [0, 2, -3] });
await waitFor(() => C.got('boom').length && C2.got('boom').length, 4000);
const b = [C, C2].map(c => c.got('boom')[0]);
check(b.every(m => m && m.k === 'he' && isUnderground(map, m.p)), `an HE in the cellar: both get the 'boom' at an underground spot (${JSON.stringify(b.map(m => m?.p))}${T.me?.inv?.he === 0 ? '' : ', the buy may have failed'})`);
const pass = checks.filter(Boolean).length;
console.log(`${pass}/${checks.length} passed`);
for (const c of [T, C, C2]) c.close();
process.exit(pass === checks.length ? 0 : 1);
