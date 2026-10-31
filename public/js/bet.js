// "Bet on yourself" on the page: the F3 bet panel (its own overlay; opened from the buy menu's footer it sits on top
// of the menu), the bet lines in the chat and the tracker on the HUD. The server decides everything (lib/bet.js);
// this only shows it. main.js creates it and hands it the keys (onKey) and the server's bet* messages (handlers).
// ctx: me(), game(), send(msg), lock() (take the mouse back), overlays() (main's updateOverlays), buyOpen(),
// small(text, secs), play(sound).
import { BET, betTarget, betPayout } from '/shared/bet.js';
import { esc, TEAM_COLOR } from './hud.js';

const money = n => `$${n}`;
const who = (name, team) => `<b style="color:${TEAM_COLOR[team] || '#ccc'}">${esc(name)}</b>`;

export class BetPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.isOpen = false;
    this.pick = null; // the target chosen (kept for the next round, like a re-buy)
    this.stake = 500;
    this.mine = null; // my bet this round: { target, stake, pay, k, alive }
    this.html = '';
    this.trackHtml = '';
    this.root = document.createElement('div');
    this.root.id = 'bet';
    this.root.className = 'hidden';
    document.body.appendChild(this.root);
    this.track = document.createElement('div');
    this.track.id = 'bet-track';
    this.track.className = 'hidden';
    (document.getElementById('hud') || document.body).appendChild(this.track);

    this.root.addEventListener('mousedown', e => {
      e.stopPropagation(); // never a shot or a click into the game behind it
      if (e.button !== 0) return;
      const t = e.target.closest('[data-t]'), s = e.target.closest('[data-s]'), a = e.target.closest('[data-a]');
      if (t && !t.classList.contains('off')) this.pick = t.dataset.t;
      else if (s && !s.classList.contains('off')) this.stake = +s.dataset.s;
      else if (a?.dataset.a === 'place') { this.place(); return; }
      else if (a?.dataset.a === 'close' || e.target === this.root) { this.close(); return; }
      else return;
      e.preventDefault();
      this.render(true);
    });
    this.root.addEventListener('contextmenu', e => e.preventDefault());

    // the server's messages (main.js adds these to its own)
    this.handlers = {
      betOk: m => {
        this.mine = { target: m.target, stake: m.stake, pay: m.pay, k: 0, alive: true };
        this.ctx.small(`Bet placed: ${money(m.stake)} on ${betTarget(m.target)?.on} — it pays ${money(m.pay)}`, 4);
        this.ctx.play('buy');
        this.update();
      },
      betNo: m => {
        this.ctx.small(m.why, 4);
        this.ctx.play('deny');
      },
      betNew: m => {
        this.chat(`🎲 ${who(m.name, m.team)} bets <b>${money(m.stake)}</b> on ${esc(betTarget(m.target)?.on || '?')}!`);
        if (m.id !== this.ctx.me().id) this.ctx.play('chat');
      },
      betTrack: m => {
        if (!this.mine) return;
        this.mine.k = m.k;
        this.mine.alive = m.alive;
        this.update();
      },
      betEnd: m => {
        for (const r of m.list) {
          const on = esc(betTarget(r.target)?.on || '?');
          const mineNow = r.id === this.ctx.me().id;
          let text;
          if (r.void) text = `🎲 ${who(r.name, r.team)}'s bet on ${on} is called off (the round never started) — ${money(r.paid)} back.`;
          else if (r.won) {
            const capped = r.paid < r.pay ? ` <span class="bet-cap">(only ${money(r.paid)} fit under the ${money(m.cap)} cap)</span>` : '';
            text = `🎲 ${who(r.name, r.team)} bet ${money(r.stake)} on ${on}… <span class="bet-won">and won ${money(r.pay)}!</span>${capped}`;
          } else text = `🎲 ${who(r.name, r.team)} bet ${money(r.stake)} on ${on}… <span class="bet-lost">and lost ${money(r.stake)}.</span>`;
          this.chat(text);
          if (mineNow) {
            this.mine = null;
            if (r.won) {
              this.ctx.small(r.paid < r.pay ? `You won your bet: ${money(r.pay)} — but only ${money(r.paid)} fit under the ${money(m.cap)} cap.` : `You won your bet: ${money(r.pay)}!`, 5);
              this.ctx.play('achieve');
            } else if (!r.void) this.ctx.small(`You lost your bet (${money(r.stake)}).`, 4);
          }
        }
        this.update();
      },
      betRound: () => {
        this.mine = null;
        this.update();
      },
    };
    setInterval(() => this.update(), 250); // the countdown, money, and hiding when the round or mode changes
  }

  // Bets happen in classic rounds only (the buy menu shows its "F3 Bet" only then).
  shown() {
    return this.ctx.game().cfg.gameMode === 'classic';
  }

  // Seconds of buy time left (bets close with it).
  left() {
    const g = this.ctx.game();
    const el = g.el + (performance.now() - g.snapRecv) / 1000;
    return g.cfg.freezeTime + g.cfg.buyTime - el;
  }

  // Why no bet can be placed now, or '' (the server checks the same: lib/bet.js refuse()).
  blocked() {
    const me = this.ctx.me(), g = this.ctx.game();
    if (me.team !== 'T' && me.team !== 'CT') return 'Join a team to bet.';
    if (g.cfg.gameMode !== 'classic') return 'Bets are only in classic rounds (not Deathmatch, Gun Game, Zombie or Hide and Seek).';
    if (g.phase === 'warmup') return 'No bets during warmup — they open with the first round.';
    if (this.mine) return 'One bet a round — yours is placed and can\'t be changed.';
    if (g.phase !== 'freeze' && g.phase !== 'live') return 'Bets open when the next round starts.';
    if (this.left() <= 0) return 'Bets close with the buy time — try next round.';
    if (!me.alive) return 'You must be alive to bet.';
    if (me.money < BET.minStake) return `You need at least ${money(BET.minStake)} to bet.`;
    return '';
  }

  // The biggest stake you can put down now.
  maxStake() {
    return Math.min(BET.maxStake, Math.floor(this.ctx.me().money / BET.step) * BET.step);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    if (this.isOpen || !this.ctx.me().joined) return;
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.render(true);
    if (document.pointerLockElement) document.exitPointerLock();
    this.ctx.overlays();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    if (this.ctx.buyOpen()) return; // back to the buy menu, the mouse stays free
    this.ctx.lock();
    setTimeout(() => this.ctx.overlays(), 300); // (if the browser refused the lock: the pause menu, click to play)
  }

  place() {
    const why = this.blocked();
    if (why) { this.ctx.small(why, 3); this.ctx.play('deny'); return; }
    if (!this.pick) { this.ctx.small('Pick what you bet on first (1–4).', 3); this.ctx.play('deny'); return; }
    const stake = Math.min(this.stake, this.maxStake());
    if (stake < BET.minStake) { this.ctx.small(`You need at least ${money(BET.minStake)} to bet.`, 3); return; }
    this.ctx.send({ t: 'betPlace', target: this.pick, stake });
    this.close(); // the server answers betOk (or betNo with why)
  }

  // Keys: F3 opens and closes the panel; while it's open it takes every key but Tab: 1–4 the target, 5–9 a stake
  // chip, 0 the most you can, Enter places the bet, Esc / F3 close. Returns true when the key was used.
  onKey(e) {
    if (e.code === 'F3') { if (!e.repeat) this.toggle(); return true; }
    if (!this.isOpen) return false;
    if (e.code === 'Tab') return false;
    if (e.repeat) return true;
    const d = /^(Digit|Numpad)(\d)$/.exec(e.code);
    if (d) {
      const n = +d[2];
      if (n >= 1 && n <= BET.targets.length) this.pick = BET.targets[n - 1].id;
      else if (n >= 5 && n <= 9) { if (BET.stakes[n - 5] <= this.maxStake()) this.stake = BET.stakes[n - 5]; }
      else if (n === 0 && this.maxStake() >= BET.minStake) this.stake = this.maxStake();
      this.render(true);
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.place();
    else if (e.code === 'Escape') this.close();
    return true;
  }

  update() {
    if (this.isOpen) this.render();
    this.renderTrack();
  }

  render(force = false) {
    if (!this.isOpen) return;
    const me = this.ctx.me(), why = this.blocked(), max = this.maxStake();
    const left = Math.max(0, Math.ceil(this.left()));
    const open = !why;
    let body;
    if (this.mine) {
      const m = this.mine, t = betTarget(m.target);
      body = `<div class="bet-placed">Your bet: <b>${money(m.stake)}</b> on <b>${esc(t.on)}</b> — it pays <b>${money(m.pay)}</b>
        <div class="muted">${t.kills ? `${Math.min(m.k, t.kills)} of ${t.kills} kill${t.kills === 1 ? '' : 's'} so far` : m.alive ? 'Still alive — stay that way.' : 'You died.'}</div></div>`;
    } else {
      const stake = Math.min(this.stake, max);
      const targets = BET.targets.map((t, i) => `<div class="bet-t${this.pick === t.id ? ' sel' : ''}${open ? '' : ' off'}" data-t="${t.id}">
        <span class="bet-key">${i + 1}</span><b>${esc(t.label)}</b><i>×${t.odds}</i></div>`).join('');
      const stakes = [...BET.stakes.map((s, i) => [s, i + 5]), [max, 0]].map(([s, k]) => `<div class="bet-s${!k ? ' max' : ''}${this.stake === s && s <= max ? ' sel' : ''}${open && s <= max && s >= BET.minStake ? '' : ' off'}" data-s="${s}">
        <span class="bet-key">${k}</span>${k ? money(s) : `Max ${s >= BET.minStake ? money(s) : ''}`}</div>`).join('');
      const t = betTarget(this.pick);
      const sum = !open ? '' : t && stake >= BET.minStake
        ? `Bet <b>${money(stake)}</b> on <b>${esc(t.on)}</b> → it pays <b>${money(betPayout(stake, t.id))}</b>${me.money - stake + betPayout(stake, t.id) > BET.cap ? ` <span class="bet-cap">(above the ${money(BET.cap)} cap it would be lost)</span>` : ''}`
        : 'Pick a target (1–4) and a stake (5–9, 0 for the most you can).';
      body = `<div class="bet-sub">This round I'll get at least…</div><div class="bet-targets">${targets}</div>
        <div class="bet-sub">Stake</div><div class="bet-stakes">${stakes}</div>
        <div class="bet-sum">${sum}</div>`;
    }
    const html = `<div class="bet-head"><span class="bet-title">BET ON YOURSELF</span>
        <span class="bet-left">${open ? `closes in ${left} s` : ''}</span><span class="bet-money">${money(me.money)}</span></div>
      ${why && !this.mine ? `<div class="bet-reason">${esc(why)}</div>` : ''}
      <div class="bet-body">${body}</div>
      <div class="bet-foot">${open && !this.mine ? '<span data-a="place" class="bet-go"><b>Enter</b> Place bet</span>' : ''}<span data-a="close"><b>F3</b> Close</span></div>
      <div class="bet-note">One bet a round, and it can't be changed. Kills: enemies only (bots count, team kills don't), before the
        round is decided. Survive: alive when it's decided. The stake is taken now; a win pays stake × odds.</div>`;
    if (!force && html === this.html) return;
    this.html = html;
    this.root.innerHTML = `<div class="bet-panel">${html}</div>`;
  }

  // The HUD line: your bet and how it's going, or (in buy time, with no bet yet) a hint that you can bet.
  renderTrack() {
    const g = this.ctx.game(), me = this.ctx.me(), m = this.mine;
    let html = '', cls = '';
    if (m && this.shown() && g.phase !== 'warmup') {
      const t = betTarget(m.target);
      let state;
      if (t.kills) {
        const pips = Array.from({ length: t.kills }, (_, i) => (i < m.k ? '●' : '○')).join('');
        state = `<span class="bt-pips">${pips}</span> ${m.k}/${t.kills} kill${t.kills === 1 ? '' : 's'}`;
        cls = m.k >= t.kills ? 'won' : m.alive ? '' : 'dead';
      } else {
        state = m.alive ? 'alive' : 'dead';
        cls = m.alive ? '' : 'lost';
      }
      html = `<span class="bt-k">BET</span> ${money(m.stake)} on ${esc(t.on)} · <b>${state}</b> · pays ${money(m.pay)}`;
    } else if (!m && this.shown() && me.alive && !this.isOpen && (g.phase === 'freeze' || g.phase === 'live') && this.left() > 0 && me.money >= BET.minStake) {
      html = `<span class="bt-k">F3</span> Bet on yourself · ${Math.ceil(this.left())} s`;
      cls = 'hint';
    }
    const key = cls + html;
    if (key === this.trackHtml) return;
    this.trackHtml = key;
    this.track.className = html ? cls : 'hidden';
    this.track.innerHTML = html;
  }

  // A line in the chat log, like hud.chat's (8 lines, fading after 10 s).
  chat(html) {
    const log = document.getElementById('chat-log');
    if (!log) return;
    const div = document.createElement('div');
    div.className = 'bet-line';
    div.innerHTML = html;
    log.appendChild(div);
    while (log.children.length > 8) log.firstChild.remove();
    setTimeout(() => div.classList.add('old'), 10000);
  }
}
