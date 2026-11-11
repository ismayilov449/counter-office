// 7.4 in the browser, on its own (GAME_PORT=3995 CDP_PORT=9335 MAP=cs_mansion; server as for g1.mjs): Alice (the
// browser, CT) holds E on Bob's satchel, the bar offers the wires, the key 1 sends xpWire and it's defused or blown.
import { open, sleep } from '../mansion/game.mjs';
import { player, until, checker } from './lib.mjs';
const ok = checker();
const rounds = [];
const bob = await player('Bob', 'T');
bob.on.round = m => rounds.push(m.n);
const g = await open('CT', 'Alice', ['msg', 'boom', 'satchels']);
const text = id => g.ev(`document.getElementById('${id}').textContent`);
const base = [-22.25, 4.27, 8.941];
await until(() => rounds.length > 0, 90000, 200);
await sleep(1500);
await g.ev('(() => { const s = __ws.send.bind(__ws); window.__out = []; __ws.send = d => { if (!d.includes(\'"state"\')) __out.push(d); return s(d); }; return 1; })()');
bob.at(base, 0, 0); bob.send({ t: 'buy', item: 'satchel' });
await sleep(300);
bob.send({ t: 'satchel', o: [base[0] - 0.5, base[1] + 1.5, base[2]], v: [-3, -5, 0] });
await sleep(1500);
const sat = (await g.msgs()).filter(x => x.t === 'satchels').at(-1)?.list?.[0];
ok('Bob\'s satchel lies there', !!sat);
bob.at([base[0] - 14, base[1], base[2]], 0, 0);
await g.tp([sat[4] + 0.6, base[1], sat[6]], Math.PI / 2);
await sleep(800);
await g.keyDown('KeyE');
let p = '';
for (let i = 0; i < 20 && !/red wire/.test(p); i++) { await sleep(100); p = await text('progress-label'); }
ok(`the defuse bar: "${p}"`, /1 cuts the red wire/.test(p));
await g.key('Digit1', 150);
let m = [];
for (let i = 0; i < 20 && !m.some(x => /right one|wrong one/.test(x.text || '') || x.t === 'boom'); i++) { await sleep(150); m = m.concat(await g.msgs()); }
await g.keyUp('KeyE');
console.log('  sent', await g.ev('JSON.stringify(__out)'));
const right = m.some(x => x.t === 'msg' && /right one/.test(x.text)), wrong = m.some(x => x.t === 'boom' && x.k === 'satchel');
ok(`the red wire cut: ${right ? 'right, defused' : wrong ? 'wrong, blown' : 'nothing'}`, right !== wrong);
ok(`no page errors ${JSON.stringify(g.errors)}`, g.errors.length === 0);
bob.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
