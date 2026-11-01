// A winning bet and the end-of-match award in the real game (headless Edge on CDP_PORT 9480, server on GAME_PORT 4080):
//   up.ps1 BOTS=0 START_MONEY=4000 ROUNDS_TO_WIN=1 MAP=cs_mansion   (or cs_mansion_night; a fresh server for each run)
// Rufat (the browser, T) bets $1000 on 3+ kills (pays ×5). Tina (scripted, T) bets $500 on surviving (pays ×2). Rufat
// kills the three CTs: both bets win, the chat and the money say so, and the match is over. The summary names Rufat
// "Best gambler · +$4000 · 1 of 1 bet won". Screenshots in OUT (award-*.png).
process.env.GAME_PORT ||= '4080'; process.env.CDP_PORT ||= '9480';
const { open, sleep } = await import('../mansion/game.mjs');
const { player } = await import('../mansion/client.mjs');
let fails = 0;
const ok = (what, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };
const R = [19, 0, -8], C = [19, 0, -11], AWAY_T = [2, 0, 9]; // (the street east of the house)
const g = await open('T', 'Rufat', ['msg', 'betOk', 'betNo', 'betEnd', 'round', 'matchEnd']);
await g.cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 6 && !(await g.ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await g.ev('document.querySelector(\'#join .team-btn[data-team="T"]\').click(), 1'); await sleep(1500);
}
const inbox = [];
const pull = async () => { inbox.push(...JSON.parse(await g.ev('JSON.stringify(__in.splice(0))'))); return inbox; };
const waitMsg = async (pred, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { const m = (await pull()).find(pred); if (m) return m; await sleep(100); } return null; };
const text = sel => g.ev(`document.querySelector(${JSON.stringify(sel)})?.textContent.replace(/\\s+/g, ' ').trim() || ''`);
const enter = async () => { for (const type of ['keyDown', 'keyUp']) { await g.cmd('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(50); } };
const fireAt = (from, to) => { const o = [from[0], from[1] + 1.62, from[2]], t = [to[0], to[1] + 1.62, to[2]]; const d = t.map((v, i) => v - o[i]), l = Math.hypot(...d); return g.send({ t: 'shoot', o, d: d.map(v => v / l), w: 'deagle' }); };

// (alternating: with auto team balance a team can't get two ahead at any join, so Carl, then Tina, then Cid and Cleo)
const carl = await player('Carl', 'CT'), tina = await player('Tina', 'T'), cts = [carl, await player('Cid', 'CT'), await player('Cleo', 'CT')];
ok('three CTs joined', cts.every(c => c.me?.team === 'CT'), cts.map(c => c.me?.team).join());
ok('round 1 starts', !!(await waitMsg(m => m.t === 'round' && m.n === 1, 20000)));
tina.at(AWAY_T, 0);
for (const c of cts) c.at([-37.5, 0, 1.5], 0);
await sleep(500);
await g.key('F3'); await sleep(400);
await g.key('Digit3'); await sleep(100); await g.key('Digit7'); await sleep(250);
ok('3, 7: "Bet $1000 on 3 kills → it pays $5000"', /Bet \$1000 on 3 kills → it pays \$5000/.test(await text('#bet .bet-sum')), await text('#bet .bet-sum'));
await enter();
const okm = await waitMsg(m => m.t === 'betOk' || m.t === 'betNo', 4000);
ok('placed', okm?.t === 'betOk' && okm.pay === 5000, JSON.stringify(okm));
tina.send({ t: 'betPlace', target: 'live', stake: 500 });
await sleep(400);
ok('chat: Tina bets $500 on surviving the round', /Tina bets \$500 on surviving the round!/.test(await text('#chat-log')), await text('#chat-log'));
// live: a Desert Eagle, the three CTs in a row 3 m north, one at a time
g.send({ t: 'buy', item: 'deagle' }); await sleep(3000);
await g.tp(R, 0);
for (const c of cts) {
  c.at(C, Math.PI); await sleep(500);
  for (let i = 0; i < 4 && c.alive; i++) { await fireAt(R, C); await sleep(700); }
  if (c.alive) break;
  c.at([-37.5, 0, 1.5], 0); // (the body out of the line)
}
ok('Rufat killed all three CTs', cts.every(c => !c.alive));
const end = await waitMsg(m => m.t === 'betEnd', 5000);
const mine = end?.list.find(b => b.name === 'Rufat'), hers = end?.list.find(b => b.name === 'Tina');
ok('3+ kills won ×5: $5000 paid in full', mine?.won && mine.pay === 5000 && mine.paid === 5000, JSON.stringify(mine));
ok('survive won ×2: $1000', hers?.won && hers.pay === 1000, JSON.stringify(hers));
await sleep(400);
const chat = await text('#chat-log');
ok('chat: "Rufat bet $1000 on 3 kills… and won $5000!"', /Rufat bet \$1000 on 3 kills… and won \$5000!/.test(chat), chat);
ok('chat: "Tina bet $500 on surviving the round… and won $1000!"', /Tina bet \$500 on surviving the round… and won \$1000!/.test(chat), chat);
await g.shot('award-won.png');
const me = await waitMsg(m => m.t === 'matchEnd', 8000);
const aw = me?.awards?.find(a => a.title === 'Best gambler');
ok('matchEnd: Best gambler is Rufat, +$4000', aw?.name === 'Rufat' && /^\+\$4000 · 1 of 1 bet won$/.test(aw.value), JSON.stringify(me?.awards));
await sleep(800);
const summary = await g.ev('[...document.querySelectorAll("#match-summary .award")].map(a => [...a.children].map(c => c.textContent.trim()).join(" ")).join(" | ")');
ok('the summary on screen shows "Best gambler Rufat +$4000 · 1 of 1 bet won"', /Best gambler Rufat \+\$4000 · 1 of 1 bet won/.test(summary), summary);
await g.shot('award-summary.png');
ok('no page errors', !g.errors.length, g.errors.join(' | '));
for (const c of [...cts, tina]) c.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
