// The bet panel, tracker and chat lines in the real game (headless Edge on CDP_PORT 9480, server on GAME_PORT 4080):
//   up.ps1 BOTS=0 START_MONEY=12000 BUY_TIME=40
// Rufat (the browser, T; Tina, scripted, on his side) against Carl and Cid (scripted, CT). Warmup: F3 shows why there are no bets. Round 1, with
// the keys: F3, 2 (2 kills), 9 ($2000), Enter; the chat line and the tracker; F3 again shows the placed bet; he kills
// Carl (tracker 1/2), then Cid (2/2): won $6000, capped. Round 2, with the mouse: B, the buy menu's "F3 Bet", Survive,
// $500, Place bet; Carl kills him: the tracker says dead, the bet is lost. Screenshots in OUT (bet-*.png).
process.env.GAME_PORT ||= '4080'; process.env.CDP_PORT ||= '9480';
const { open, sleep } = await import('../mansion/game.mjs');
const { player } = await import('../mansion/client.mjs');
let fails = 0;
const ok = (what, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };
const g = await open('T', 'Rufat', ['msg', 'betOk', 'betNo', 'betNew', 'betTrack', 'betEnd', 'betRound', 'round', 'roundEnd']);
const inbox = [];
// (read and empty the page's message list in one go: game.mjs's msgs() does it in two steps and can lose one between)
const pull = async () => { inbox.push(...JSON.parse(await g.ev('JSON.stringify(__in.splice(0))'))); return inbox; };
const waitMsg = async (pred, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { const m = (await pull()).find(pred); if (m) return m; await sleep(100); } return null; };
const size = async (width, height) => { await g.cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await sleep(300); };
const panelOpen = () => g.ev('!document.getElementById("bet").classList.contains("hidden")');
const text = sel => g.ev(`document.querySelector(${JSON.stringify(sel)})?.textContent.replace(/\\s+/g, ' ').trim() || ''`);
const enter = async () => { await g.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(50); await g.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };
const esc = async () => { await g.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(50); await g.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); };
const clickOn = async sel => {
  const r = JSON.parse(await g.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify([r.x + r.width / 2, r.y + r.height / 2]); })()`));
  if (!r) return false;
  const [x, y] = r.map(Math.round);
  await g.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await g.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(60);
  await g.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(150);
  return true;
};
// the page's player shoots (through its own socket) from its eye at a point
const fireAt = (from, to, w = 'deagle') => { const o = [from[0], from[1] + 1.62, from[2]], t = [to[0], to[1] + 1.62, to[2]]; const d = t.map((v, i) => v - o[i]), l = Math.hypot(...d); return g.send({ t: 'shoot', o, d: d.map(v => v / l), w }); };

// ---- warmup
await size(1280, 720);
await g.key('F3'); await sleep(300);
ok('warmup: F3 opens the panel', await panelOpen());
ok('…saying why there are no bets', /warmup/.test(await text('#bet .bet-reason')), await text('#bet .bet-reason'));
ok('…and the pause menu stays hidden', await g.ev('document.getElementById("paused").classList.contains("hidden")'));
await g.shot('bet-warmup.png');
await g.key('F3'); await sleep(200);
ok('F3 closes it', !(await panelOpen()));

// ---- round 1
const carl = await player('Carl', 'CT'), cid = await player('Cid', 'CT'), tina = await player('Tina', 'T');
ok('round 1 starts', !!(await waitMsg(m => m.t === 'round' && m.n === 1, 20000)));
tina.at([-20, 0, 44], 0);
await sleep(600);
ok('the HUD hints F3 in buy time', /F3 Bet on yourself/.test(await text('#bet-track')), await text('#bet-track'));
await size(1920, 969);
await g.key('F3'); await sleep(400);
ok('F3 opens the panel', await panelOpen());
await g.shot('bet-panel-1920x969.png');
await size(1280, 600);
await g.shot('bet-panel-1280x600.png');
const fits = JSON.parse(await g.ev('(() => { const r = document.querySelector("#bet .bet-panel").getBoundingClientRect(); return JSON.stringify([r.top, r.bottom, innerHeight]); })()'));
ok('at 1280x600 the panel fits on screen', fits[0] >= 0 && fits[1] <= fits[2], fits.join());
await g.key('Digit2'); await sleep(100); await g.key('Digit9'); await sleep(250);
ok('2, 9: "Bet $2000 on 2 kills → it pays $6000"', /Bet \$2000 on 2 kills → it pays \$6000/.test(await text('#bet .bet-sum')), await text('#bet .bet-sum'));
await g.shot('bet-picked-1280x600.png');
await enter();
const okm = await waitMsg(m => m.t === 'betOk' || m.t === 'betNo', 4000);
ok('Enter: the bet is placed', okm?.t === 'betOk' && okm.pay === 6000, JSON.stringify(okm));
await sleep(500);
ok('the panel closed', !(await panelOpen()));
ok('money on the HUD: $10000', (await text('#money')) === '$10000', await text('#money'));
ok('chat: "Rufat bets $2000 on 2 kills!"', /Rufat bets \$2000 on 2 kills!/.test(await text('#chat-log')), await text('#chat-log'));
ok('tracker: $2000 on 2 kills · 0/2', /\$2000 on 2 kills · ○○ 0\/2 kills · pays \$6000/.test(await text('#bet-track')), await text('#bet-track'));
await size(1280, 720);
await g.shot('bet-placed.png');
await g.key('F3'); await sleep(300);
ok('F3 again: the panel shows the placed bet', /Your bet: \$2000 on 2 kills/.test(await text('#bet .bet-placed')), await text('#bet .bet-placed'));
await g.shot('bet-panel-placed.png');
await g.key('Digit1'); await enter(); await sleep(400);
ok('…and doesn\'t send a second one', !(await pull()).some(m => m.t === 'betNo' || (m.t === 'betOk' && m !== okm)));
await esc(); await sleep(200);
ok('Esc closes it', !(await panelOpen()));

// live: buy a Desert Eagle, stand at [0, 0, 40]; Carl and Cid 3 m north
g.send({ t: 'buy', item: 'deagle' }); await sleep(2800);
await g.tp([0, 0, 40], 0);
carl.at([0, 0, 37], Math.PI); cid.at([0, 0, 37], Math.PI);
await sleep(500);
for (let i = 0; i < 4 && carl.alive && cid.alive; i++) { await fireAt([0, 0, 40], [0, 0, 37]); await sleep(700); }
ok('one CT down', !carl.alive || !cid.alive);
await sleep(300);
ok('tracker: ●○ 1/2', /●○ 1\/2 kills/.test(await text('#bet-track')), await text('#bet-track'));
await g.shot('bet-track-1of2.png');
for (let i = 0; i < 4 && (carl.alive || cid.alive); i++) { await fireAt([0, 0, 40], [0, 0, 37]); await sleep(700); }
const end1 = await waitMsg(m => m.t === 'betEnd', 5000);
ok('round over: won', end1?.list[0]?.won && end1.list[0].pay === 6000, JSON.stringify(end1?.list));
await sleep(400);
const chat1 = await text('#chat-log');
ok('chat: "…and won $6000! (only $2800 fit under the $16000 cap)"', /Rufat bet \$2000 on 2 kills… and won \$6000! \(only \$2800 fit under the \$16000 cap\)/.test(chat1), chat1);
ok('money $16000', (await text('#money')) === '$16000', await text('#money'));
ok('tracker gone', await g.ev('document.getElementById("bet-track").classList.contains("hidden")'));
await g.shot('bet-won.png');

// ---- round 2: with the mouse, from the buy menu
ok('round 2 starts', !!(await waitMsg(m => m.t === 'round' && m.n === 2, 20000)), inbox.filter(m => /^round|betRound/.test(m.t)).map(m => m.t + (m.n || '')).join());
await sleep(500);
await g.key('KeyB'); await sleep(500);
ok('the buy menu shows "F3 Bet"', /F3 Bet/.test(await text('#buymenu .bm-foot')), await text('#buymenu .bm-foot'));
ok('click "F3 Bet": the bet panel opens', (await clickOn('#buymenu [data-act=bet]')) && (await panelOpen()));
ok('…over the buy menu, which stays open', !(await g.ev('document.getElementById("buymenu").classList.contains("hidden")')));
await clickOn('#bet [data-t=live]'); await clickOn('#bet [data-s="500"]');
ok('clicks: "Bet $500 on surviving the round → it pays $1000"', /Bet \$500 on surviving the round → it pays \$1000/.test(await text('#bet .bet-sum')), await text('#bet .bet-sum'));
await g.shot('bet-over-buymenu.png');
await clickOn('#bet [data-a=place]');
const ok2 = await waitMsg(m => (m.t === 'betOk' || m.t === 'betNo') && m !== okm, 4000);
ok('"Place bet": placed', ok2?.t === 'betOk' && ok2.target === 'live' && ok2.stake === 500, JSON.stringify(ok2));
await sleep(300);
ok('the panel closed, the buy menu is still open', !(await panelOpen()) && !(await g.ev('document.getElementById("buymenu").classList.contains("hidden")')));
await g.key('KeyB'); await sleep(300);
// Carl buys a Desert Eagle and shoots Rufat
carl.send({ t: 'buy', item: 'deagle' }); await sleep(2600);
await g.tp([0, 0, 40], 0);
carl.at([0, 0, 37], Math.PI); cid.at([20, 0, -40], 0); tina.at([-20, 0, 44], 0);
await sleep(500);
ok('tracker: alive', /surviving the round · alive/.test(await text('#bet-track')), await text('#bet-track'));
const meAlive = () => g.ev('document.getElementById("bet-track").textContent.includes("dead")');
for (let i = 0; i < 4 && !(await meAlive()); i++) { const o = [0, 1.62, 37]; carl.send({ t: 'shoot', o, d: [0, 0, 1], w: 'deagle' }); await sleep(700); }
ok('Carl killed Rufat: tracker says dead', await meAlive(), await text('#bet-track'));
ok('…in red', /lost/.test(await g.ev('document.getElementById("bet-track").className')));
await g.shot('bet-dead.png');
// Tina (the last Terrorist) too, so the round ends
tina.at([0, 0, 40], 0); await sleep(400);
for (let i = 0; i < 4 && tina.alive; i++) { carl.send({ t: 'shoot', o: [0, 1.62, 37], d: [0, 0, 1], w: 'deagle' }); await sleep(700); }
const end2 = await waitMsg(m => m.t === 'betEnd' && m !== end1, 5000);
await sleep(400);
ok('round over: lost', end2 && !end2.list[0].won, JSON.stringify(end2?.list));
ok('chat: "…and lost $500."', /Rufat bet \$500 on surviving the round… and lost \$500\./.test(await text('#chat-log')), await text('#chat-log'));
await g.shot('bet-lost.png');

ok('no page errors', !g.errors.length, g.errors.join(' | '));
carl.close(); cid.close(); tina.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
