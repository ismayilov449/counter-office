// The HUD's bottom left in buy time (integration 2026-11-08): the BLEEDING badge (blood.js) and the wound badges
// (wounds.js) sit in a row above the health (#hud-badges) and never overlap the bet's "F3" line (#bet-track), the
// health, the armour or the chat, at the laptop window sizes. The page's own elements, filled as they are in a round
// (the longest texts), measured at each size; a screenshot of each in OUT. Headless Edge on CDP_PORT, server on GAME_PORT.
import { open, sleep } from '../mansion/game.mjs';

const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const SIZES = [[960, 540], [1024, 640], [1280, 720], [1366, 768], [1536, 864], [1920, 1080]];
let g = await open('T', 'Hud');
for (let i = 0; i < 6 && !(await g.ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await g.ev('document.querySelector(\'#join .team-btn[data-team="T"]\')?.click(), 1'); await sleep(1500);
}
await sleep(1500);
// what a bleeding, wounded player with a syringe sees in buy time
await g.ev(`(() => {
  const b = document.getElementById('bleed-badge'); b.classList.remove('hidden'); b.textContent = 'BLEEDING HEAVILY · P bandage (2)';
  const w = document.getElementById('wd-badges'); if (w) w.innerHTML = '<div class="badge">LEG</div><div class="badge">ARM ½</div><div class="badge">HEAD</div><div class="badge">ADRENALINE 20</div><div class="badge">SYRINGE</div>';
  const t = document.getElementById('bet-track'); t.className = 'hint'; t.innerHTML = '<span class="bt-k">F3</span> Bet on yourself · 12 s';
  // (the page redraws these from its own state each frame: keep them as set)
  window.__hudKeep = setInterval(() => { b.classList.remove('hidden'); b.textContent = 'BLEEDING HEAVILY · P bandage (2)'; t.className = 'hint'; t.innerHTML = '<span class="bt-k">F3</span> Bet on yourself · 12 s'; }, 30);
  const log = document.getElementById('chat-log'); for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.textContent = 'Someone: a line of chat'; log.appendChild(d); }
  return 1;
})()`);
const rect = id => `(() => { const e = document.getElementById('${id}'); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left, r.top, r.right, r.bottom] : null; })()`;
const hit = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
for (const [w, h] of SIZES) {
  await g.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  const R = {};
  for (const id of ['bleed-badge', 'wd-badges', 'bet-track', 'hp', 'armor', 'bottom-left', 'chat-log']) R[id] = await g.ev(rect(id));
  await g.shot(`ghud_${w}x${h}.png`);
  const f = r => r ? r.map(v => Math.round(v)).join(',') : 'none';
  ok(`${w}x${h}: BLEEDING [${f(R['bleed-badge'])}] and the wounds [${f(R['wd-badges'])}] clear of the bet's line [${f(R['bet-track'])}], the health row [${f(R['bottom-left'])}] and the chat [${f(R['chat-log'])}]`,
    R['bleed-badge'] && R['bet-track'] && !hit(R['bleed-badge'], R['bet-track']) && !hit(R['wd-badges'], R['bet-track']) && !hit(R['bleed-badge'], R['bottom-left']) && !hit(R['wd-badges'], R['bottom-left']) &&
    !hit(R['bleed-badge'], R['wd-badges']) && !hit(R['bleed-badge'], R['chat-log']) && !hit(R['wd-badges'], R['chat-log']));
}
ok(`no page errors (${g.errors.length})`, !g.errors.length);
g.cdp.close();
process.exit(process.exitCode || 0);
