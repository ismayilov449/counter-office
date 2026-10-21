// HUD, scoreboard, radar, chat and screen overlays (plain DOM).
import { WEAPONS, GRENADES, MINES } from '/shared/weapons.js';
import { RANKS, RANK_SHORT, rankIndex, rankColor } from '/shared/ranks.js';

const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const TEAM_NAME = { T: 'Terrorists', CT: 'Counter-Terrorists' };

// Small coloured rank badge (S1 ... GE); "--" while unranked.
export function rankBadge(i) {
  const title = i >= 0 ? RANKS[i].name : 'Unranked — play a few more rounds';
  return `<span class="rk" style="color:${rankColor(i)};border-color:${rankColor(i)}" title="${title}">${i >= 0 ? RANK_SHORT[i] : '--'}</span>`;
}
export const TEAM_COLOR = { T: '#e8b45a', CT: '#7fb2ff' };

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'hp', 'armor', 'money', 'ammo', 'weapon-name', 'timer', 'phase', 'scoreT', 'scoreCT', 'killfeed',
      'center-msg', 'small-msg', 'hint', 'progress', 'progress-label', 'progress-fill', 'crosshair', 'hitmarker', 'scope',
      'damage', 'flash', 'flashbang', 'nvg', 'bomb-icon', 'kit-icon', 'nvg-icon', 'slots', 'spec', 'chat', 'chat-log', 'chat-line',
      'chat-mode', 'chat-input', 'scoreboard', 'radar', 'target-name', 'map-name', 'mortar-panel']) this.el[id] = $(id);
    this.radarCtx = this.el.radar.getContext('2d');
    this.radarBg = null;
    this.map = null;
    this.centerTimer = 0;
    this.smallTimer = 0;
    this.cache = {};
    this.flashUntil = 0;
    this.flashDur = 1;
    this.flashAmount = 0;
  }

  set(id, html) {
    if (this.cache[id] === html) return;
    this.cache[id] = html;
    this.el[id].innerHTML = html;
  }

  show(id, on) {
    this.el[id].classList.toggle('hidden', !on);
  }

  setMap(map) {
    this.map = map;
    this.radarBg = this.drawRadarBackground();
    this.set('map-name', esc(map.title));
  }

  status(me, weaponId) {
    this.set('hp', String(me.hp));
    this.el.hp.parentElement.classList.toggle('low', me.hp <= 25);
    this.set('armor', String(me.armor) + (me.helmet ? '<small>+H</small>' : ''));
    this.set('money', `$${me.money}`);
    this.show('bomb-icon', me.inv.c4);
    this.show('kit-icon', me.kit);
    this.show('nvg-icon', me.nvg);
    const def = WEAPONS[weaponId];
    this.set('weapon-name', def ? def.name : '');
    let ammo = '';
    if (def?.grenade || def?.mine) ammo = String(me.inv[weaponId]);
    else if (def?.mounted) ammo = '∞';
    else if (def && def.mag) {
      const item = me.inv.primary?.id === weaponId ? me.inv.primary : me.inv.secondary;
      if (item) ammo = `${item.mag} <small>| ${item.res}</small>`;
    }
    this.set('ammo', ammo);

    const slots = [
      ['1', me.inv.primary?.id], ['2', me.inv.secondary?.id], ['3', me.zombie ? 'claws' : 'knife'],
      ...GRENADES.filter(g => me.inv[g] > 0).map(g => ['4', g]),
      ...MINES.filter(g => me.inv[g] > 0).map(g => ['6', g]),
      ['5', me.inv.c4 ? 'c4' : null],
    ];
    this.set('slots', slots.filter(s => s[1]).map(([k, id]) =>
      `<div class="${id === weaponId ? 'active' : ''}">${k} ${esc(WEAPONS[id].name)}${(WEAPONS[id].grenade || WEAPONS[id].mine) && me.inv[id] > 1 ? ` x${me.inv[id]}` : ''}</div>`).join(''));
  }

  timer(text, bomb) {
    this.set('timer', text);
    this.el.timer.classList.toggle('bomb', !!bomb);
  }

  score(sc) {
    this.set('scoreT', String(sc.T));
    this.set('scoreCT', String(sc.CT));
  }

  center(text, sub = '', secs = 4, color = '#fff') {
    this.el['center-msg'].innerHTML = `<span style="color:${color}">${esc(text)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    clearTimeout(this.centerTimer);
    this.centerTimer = setTimeout(() => { this.el['center-msg'].innerHTML = ''; }, secs * 1000);
  }

  small(text, secs = 3) {
    this.el['small-msg'].textContent = text;
    clearTimeout(this.smallTimer);
    this.smallTimer = setTimeout(() => { this.el['small-msg'].textContent = ''; }, secs * 1000);
  }

  // The mortar gunner's panel (html from main.js), or null to hide it.
  mortarPanel(html) {
    this.show('mortar-panel', !!html);
    if (html) this.set('mortar-panel', html);
  }

  hint(text) {
    this.set('hint', esc(text || ''));
  }

  targetName(name, team) {
    this.set('target-name', name ? `<span class="tname-${team}">${esc(name)}</span>` : '');
  }

  progress(label, frac) {
    this.show('progress', label != null);
    if (label == null) return;
    this.set('progress-label', esc(label));
    this.el['progress-fill'].style.width = `${Math.round(frac * 100)}%`;
  }

  // Size and color of the four crosshair lines (from the player's settings).
  crosshairStyle({ len, thick, color }, els = [this.el.crosshair]) {
    for (const el of els) {
      if (!el) continue;
      el.style.setProperty('--len', `${len}px`);
      el.style.setProperty('--thick', `${thick}px`);
      el.style.setProperty('--color', color);
    }
  }

  crosshair(gapPx, visible) {
    this.el.crosshair.style.setProperty('--gap', `${Math.round(gapPx)}px`);
    this.el.crosshair.style.display = visible ? '' : 'none';
  }

  scope(on) {
    this.show('scope', on);
  }

  hitmarker(hs) {
    const h = this.el.hitmarker;
    h.classList.toggle('hs', !!hs);
    h.classList.add('show');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => h.classList.remove('show'), 90);
  }

  damage(side) {
    const f = this.el.flash;
    f.classList.add('show');
    setTimeout(() => f.classList.remove('show'), 60);
    if (!side) return;
    const i = this.el.damage.querySelector(`.${side}`);
    i.classList.add('show');
    setTimeout(() => i.classList.remove('show'), 120);
  }

  flashbang(amount, dur) {
    const now = performance.now();
    const remaining = Math.max(0, this.flashUntil - now) / 1000;
    if (dur > remaining) {
      this.flashUntil = now + dur * 1000;
      this.flashDur = dur;
      this.flashAmount = Math.min(1, amount);
    }
  }

  // Per-frame overlays
  overlays(now, nvgOn) {
    const left = (this.flashUntil - now) / 1000;
    let o = 0;
    if (left > 0) {
      const f = left / this.flashDur;
      o = this.flashAmount * Math.min(1, f * 2.2);
    }
    this.el.flashbang.style.opacity = o.toFixed(3);
    this.show('nvg', nvgOn);
  }

  // Big announcer callout ("DOUBLE KILL", "ACE", ...)
  announce(text, sub = '') {
    const el = $('announcer');
    el.innerHTML = `<div class="ann-main">${esc(text)}</div>${sub ? `<div class="ann-sub">${esc(sub)}</div>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.annTimer);
    this.annTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  mvp(info, isMe) {
    const el = $('mvp');
    if (!info) { el.classList.add('hidden'); return; }
    el.innerHTML = `<span class="star">★</span> MVP: <b>${esc(info.name)}</b> <span class="muted">— ${esc(info.reason)}</span>`;
    el.classList.toggle('me', !!isMe);
    el.classList.remove('hidden');
    clearTimeout(this.mvpTimer);
    this.mvpTimer = setTimeout(() => el.classList.add('hidden'), 5000);
  }

  killcam(info) {
    const el = $('killcam');
    if (!info) { el.classList.add('hidden'); return; }
    el.innerHTML = `<div class="kc-title">KILL CAM</div><div>Killed by <span class="tname-${info.team}">${esc(info.name)}</span>
      with ${esc(info.weapon)}${info.hs ? ' <span class="hs">HEADSHOT</span>' : ''}</div><div class="muted small">Click or press Space to skip</div>`;
    el.classList.remove('hidden');
  }

  matchSummary(data, myId) {
    const el = $('match-summary');
    if (data.gg || data.dm) return this.ggSummary(data, myId, el);
    const row = p => `<tr class="${p.id === myId ? 'me' : ''}"><td class="tname-${p.team}">${esc(p.name)}</td><td class="n">${p.k}</td><td class="n">${p.d}</td>
      <td class="n">${p.hs}</td><td class="n">${p.mvps}</td><td class="n">${p.dmg}</td>${data.players.some(x => x.rescues) ? `<td class="n">${p.rescues}</td>` : ''}</tr>`;
    const rescues = data.players.some(x => x.rescues);
    el.querySelector('.panel').innerHTML = `
      <h2 style="color:${TEAM_COLOR[data.winner]}">${TEAM_NAME[data.winner]} win the match ${data.score[data.winner]} : ${data.score[data.winner === 'T' ? 'CT' : 'T']}</h2>
      <div class="awards">${data.awards.map(a => `<div class="award"><div class="a-title">${esc(a.title)}</div><div class="a-name tname-${a.team}">${esc(a.name)}</div><div class="muted">${esc(a.value)}</div></div>`).join('')}</div>
      <table><tr><th>Player</th><th class="n">K</th><th class="n">D</th><th class="n">HS</th><th class="n">MVP</th><th class="n">Dmg</th>${rescues ? '<th class="n">Rescues</th>' : ''}</tr>
      ${data.players.map(row).join('')}</table>
      <div id="end-vote" class="end-vote"></div>
      <div class="muted small">Next match starts when the vote ends · Esc or click outside to close</div>`;
    el.classList.remove('hidden');
    clearTimeout(this.summaryTimer);
    this.summaryTimer = setTimeout(() => el.classList.add('hidden'), ((data.vote?.left ?? 11) + 3) * 1000);
  }

  // Gun Game / Deathmatch result: the winner, and everyone's final level (Gun Game) and kills.
  ggSummary(data, myId, el) {
    const gg = !!data.gg, win = data.gg || data.dm;
    const row = p => `<tr class="${p.id === myId ? 'me' : ''}"><td class="tname-${p.team}">${esc(p.name)}</td>${gg ? `<td class="n">${p.lv}</td>` : ''}<td class="n">${p.k}</td><td class="n">${p.d}</td><td class="n">${p.hs}</td></tr>`;
    el.querySelector('.panel').innerHTML = `
      <h2 class="tname-${win.team}">${esc(win.name)} won ${gg ? 'Gun Game' : 'the Deathmatch'}!</h2>
      <table><tr><th>Player</th>${gg ? '<th class="n">Level</th>' : ''}<th class="n">K</th><th class="n">D</th><th class="n">HS</th></tr>
      ${data.players.map(row).join('')}</table>
      <div id="end-vote" class="end-vote"></div>
      <div class="muted small">Next match starts when the vote ends · Esc or click outside to close</div>`;
    el.classList.remove('hidden');
    clearTimeout(this.summaryTimer);
    this.summaryTimer = setTimeout(() => el.classList.add('hidden'), ((data.vote?.left ?? 11) + 3) * 1000);
  }

  // The end-of-match map vote: every map, the one just played included, with live vote counts.
  endVote(vote, myVote) {
    const box = $('end-vote');
    if (!box || !vote) return;
    const total = Object.values(vote.counts).reduce((a, b) => a + b, 0);
    box.innerHTML = `<div class="ev-head"><b>Vote for the next map</b><span class="muted small">press 1–${vote.maps.length} or click · <span id="ev-left">${Math.ceil(vote.left)}</span>s · ${total}/${vote.voters} voted</span></div>
      <div class="ev-maps">${vote.maps.map((m, i) => {
        const n = vote.counts[m.id] || 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return `<button class="ev-map${m.id === myVote ? ' mine' : ''}" data-map="${m.id}">
          <span class="ev-key">${i + 1}</span><span class="ev-title">${esc(m.title)}${m.id === vote.current ? ' <span class="muted small">(just played)</span>' : ''}</span>
          <span class="ev-n">${n} vote${n === 1 ? '' : 's'}</span><span class="ev-bar" style="width:${pct}%"></span></button>`;
      }).join('')}</div>`;
  }

  leaderboard(el, list, myName) {
    if (!list.length) { el.innerHTML = '<div class="muted small">No matches played yet — the leaderboard fills up after the first rounds.</div>'; return; }
    const me = (myName || '').trim().toLowerCase();
    el.innerHTML = `<table><tr><th>#</th><th>Player</th><th>Rank</th><th class="n">Rating</th><th class="n">K</th><th class="n">D</th><th class="n">K/D</th>
      <th class="n">HS%</th><th class="n">MVP</th><th class="n">Wins</th><th class="n">Rescues</th></tr>
      ${list.map((p, i) => `<tr class="${p.name.toLowerCase() === me ? 'me' : ''}"><td>${i + 1}</td><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] + ' ' : ''}${esc(p.name)}</td><td>${rankBadge(rankIndex(p.rating, p.rounds))} <span class="muted small">${(RANKS[rankIndex(p.rating, p.rounds)]?.name) || 'Unranked'}</span></td>
      <td class="n"><b>${p.rating}</b></td><td class="n">${p.kills}</td><td class="n">${p.deaths}</td><td class="n">${p.kd}</td><td class="n">${p.hsPct}</td>
      <td class="n">${p.mvps}</td><td class="n">${p.wins}</td><td class="n">${p.rescues}</td></tr>`).join('')}</table>`;
  }

  // Achievement unlocked: a card that slides in at the top of the screen.
  achievement(title, desc) {
    let el = document.getElementById('ach-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ach-toast';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="ach-icon">🏆</div><div><div class="ach-k">Achievement unlocked</div><div class="ach-t">${esc(title)}</div><div class="ach-d">${esc(desc)}</div></div>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.achTimer);
    this.achTimer = setTimeout(() => el.classList.remove('show'), 5000);
  }

  // The Esc-menu achievements list: rank, rating and every achievement with progress.
  achievements(el, data) {
    const r = data.rank;
    const head = `<div class="ach-rank">${rankBadge(r)} <b>${r >= 0 ? RANKS[r].name : 'Unranked'}</b>
      <span class="muted small">rating ${data.rating}${r >= 0 && RANKS[r + 1] ? ` · next rank at ${RANKS[r + 1].min}` : r < 0 ? ' · ranked after 15 rounds' : ''}</span></div>`;
    const done = data.list.filter(a => a.at).length;
    el.innerHTML = head + `<div class="muted small">${done} / ${data.list.length} unlocked</div><div class="ach-grid">${data.list.map(a => `
      <div class="ach ${a.at ? 'got' : ''}" title="${esc(a.desc)}"><div class="ach-t">${a.at ? '🏆' : '🔒'} ${esc(a.title)}</div><div class="ach-d">${esc(a.desc)}</div>
      ${a.goal > 1 && !a.at ? `<div class="ach-bar"><i style="width:${Math.round((100 * a.have) / a.goal)}%"></i></div><div class="ach-d">${a.have} / ${a.goal}</div>` : ''}</div>`).join('')}</div>`;
  }

  killfeed(killer, victim, weapon, hs, mine) {
    const div = document.createElement('div');
    div.className = 'kf' + (mine ? ' mine' : '');
    const k = killer ? `<span class="tname-${killer.team}">${esc(killer.name)}</span>` : '';
    const w = WEAPONS[weapon]?.name || (weapon === 'world' ? 'world' : weapon);
    div.innerHTML = `${k}<span class="w">[${esc(w)}]</span>${hs ? '<span class="hs">HS</span>' : ''}<span class="tname-${victim.team}">${esc(victim.name)}</span>`;
    const feed = this.el.killfeed;
    feed.appendChild(div);
    while (feed.children.length > 6) feed.firstChild.remove();
    setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 600); }, 7000);
  }

  chat(name, team, text, { teamOnly = false, dead = false, radio = false } = {}) {
    const div = document.createElement('div');
    const prefix = (dead ? '<span class="chat-dead">*DEAD* </span>' : '') + (teamOnly ? '<span class="chat-dead">(Team) </span>' : '') +
      (radio ? '<span class="chat-radio">(RADIO) </span>' : '');
    const color = TEAM_COLOR[team] || '#ccc';
    div.innerHTML = name
      ? `${prefix}<b style="color:${color}">${esc(name)}</b>: ${radio ? `<span class="chat-radio">${esc(text)}</span>` : esc(text)}`
      : `<span style="color:#9fd39f">${esc(text)}</span>`;
    const log = this.el['chat-log'];
    log.appendChild(div);
    while (log.children.length > 8) log.firstChild.remove();
    setTimeout(() => div.classList.add('old'), 10000);
  }

  openChat(team) {
    this.el.chat.classList.add('open');
    this.show('chat-line', true);
    this.el['chat-mode'].textContent = team ? 'Say (team):' : 'Say:';
    const input = this.el['chat-input'];
    input.value = '';
    setTimeout(() => input.focus(), 0);
  }

  closeChat() {
    this.el.chat.classList.remove('open');
    this.show('chat-line', false);
    this.el['chat-input'].blur();
  }

  // Hide and Seek: a seeker's screen stays black (with a countdown) while the hiders hide.
  blind(secs) {
    const el = $('hns-blind');
    if (!el) return;
    el.classList.toggle('hidden', secs == null);
    if (secs != null) el.innerHTML = `<div><div class="hb-title">The hiders are hiding…</div><div class="hb-n">${Math.max(0, secs)}</div></div>`;
  }

  spectating(name) {
    this.show('spec', !!name);
    if (name) this.set('spec', `Spectating <b>${esc(name)}</b> &nbsp;<span class="muted">(click to switch)</span>`);
  }

  scoreboard(roster, myId, score, carrierId, mapTitle) {
    const gg = roster.some(p => p.lv);
    const row = p => `<tr class="${p.alive ? '' : 'dead'} ${p.id === myId ? 'me' : ''}">
      <td>${rankBadge(p.rank ?? -1)} ${esc(p.name)}${p.id === carrierId ? ' <b style="color:#ff6a50">C4</b>' : ''}${p.alive ? '' : ' <span class="muted">dead</span>'}</td>
      ${gg ? `<td class="n">${p.lv}</td>` : ''}<td class="n">${p.k}</td><td class="n">${p.d}</td><td class="n">${p.bot ? '<span class="muted">BOT</span>' : p.ping}</td></tr>`;
    const col = team => {
      const list = roster.filter(p => p.team === team).sort((a, b) => (gg ? b.lv - a.lv : 0) || b.k - a.k || a.d - b.d);
      return `<div><h3 style="color:${TEAM_COLOR[team]}"><span>${TEAM_NAME[team]} (${list.length})</span><span>${gg ? '' : score[team]}</span></h3>
        <table><tr><th>Name</th>${gg ? '<th class="n">Level</th>' : ''}<th class="n">K</th><th class="n">D</th><th class="n">Ping</th></tr>${list.map(row).join('')}</table></div>`;
    };
    const specs = roster.filter(p => p.team === 'SPEC').map(p => esc(p.name));
    this.el.scoreboard.innerHTML = `<div class="sb-head">Counter-Office <span class="muted">— ${esc(mapTitle)}</span></div>
      <div class="cols">${col('T')}${col('CT')}</div>
      ${specs.length ? `<div class="spec-list">Spectators: ${specs.join(', ')}</div>` : ''}`;
  }

  drawRadarBackground() {
    const c = document.createElement('canvas');
    c.width = c.height = 200;
    const g = c.getContext('2d');
    const { toR, s } = this.radarXform();
    g.fillStyle = 'rgba(10, 12, 8, 0.75)';
    g.fillRect(0, 0, 200, 200);
    if (this.map.radar?.floors) {
      // Multi-level maps: paint the walkable floors (upward faces below the roofs), higher floors lighter.
      const { maxY } = this.map.radar;
      const floors = [];
      for (const polys of Object.values(this.map.faces)) {
        for (const f of polys) {
          const n = f.length / 5;
          let ny = 0, y = 0;
          for (let i = 0; i < n; i++) {
            const a = i * 5, b = ((i + 1) % n) * 5;
            ny += (f[a + 2] - f[b + 2]) * (f[a] + f[b]);
            y += f[a + 1] / n;
          }
          let area = 0;
          for (let i = 0; i < n; i++) { const a = i * 5, b = ((i + 1) % n) * 5; area += f[a] * f[b + 2] - f[b] * f[a + 2]; }
          if (ny > 0.7 * Math.abs(area) && y < maxY && y > -3) floors.push({ f, y });
        }
      }
      floors.sort((a, b) => a.y - b.y);
      for (const { f, y } of floors) {
        const k = Math.max(0, Math.min(1, (y + 1) / (maxY + 1)));
        g.fillStyle = `rgb(${(96 + 80 * k) | 0}, ${(84 + 70 * k) | 0}, ${(60 + 50 * k) | 0})`;
        g.beginPath();
        for (let i = 0; i < f.length; i += 5) { const [x, z] = toR(f[i], f[i + 2]); if (i) g.lineTo(x, z); else g.moveTo(x, z); }
        g.closePath();
        g.fill();
      }
    } else {
      g.fillStyle = 'rgba(120, 104, 74, 0.55)';
      const [x0, z0] = toR(-50, -50);
      g.fillRect(x0, z0, 100 * s, 100 * s);
    }
    for (const b of this.map.radar?.floors ? [] : this.map.boxes) {
      if (b.floor || b.min[1] > 2 || b.max[1] <= 0.3) continue;
      const [x, z] = toR(b.min[0], b.min[2]);
      const low = b.max[1] - b.min[1] < 1.3;
      g.fillStyle = low ? 'rgba(70, 60, 40, 0.8)' : 'rgba(28, 26, 22, 0.95)';
      g.fillRect(x, z, (b.max[0] - b.min[0]) * s, (b.max[2] - b.min[2]) * s);
    }
    for (const d of this.map.decor) {
      if (d.type !== 'water') continue;
      const [x, z] = toR(d.min[0], d.min[1]);
      g.fillStyle = 'rgba(70, 150, 210, 0.7)';
      g.fillRect(x, z, (d.max[0] - d.min[0]) * s, (d.max[1] - d.min[1]) * s);
    }
    if (this.map.zones.rescue) {
      const zn = this.map.zones.rescue;
      const [x, z] = toR(zn.min[0], zn.min[1]);
      g.fillStyle = 'rgba(80, 200, 100, 0.18)';
      g.fillRect(x, z, (zn.max[0] - zn.min[0]) * s, (zn.max[1] - zn.min[1]) * s);
      g.strokeStyle = 'rgba(80, 220, 110, 0.7)';
      g.strokeRect(x, z, (zn.max[0] - zn.min[0]) * s, (zn.max[1] - zn.min[1]) * s);
      g.fillStyle = 'rgba(120, 255, 140, 0.95)';
      g.font = 'bold 11px Verdana';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('RESCUE', x + ((zn.max[0] - zn.min[0]) * s) / 2, z + ((zn.max[1] - zn.min[1]) * s) / 2);
    }
    for (const key of ['A', 'B']) {
      const zn = this.map.zones[key];
      if (!zn) continue;
      const [x, z] = toR(zn.min[0], zn.min[1]);
      g.strokeStyle = 'rgba(255, 80, 60, 0.6)';
      g.strokeRect(x, z, (zn.max[0] - zn.min[0]) * s, (zn.max[1] - zn.min[1]) * s);
      const [lx, lz] = toR(...this.map.labels[key]);
      g.fillStyle = 'rgba(255, 110, 80, 0.95)';
      g.font = 'bold 16px Verdana';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(key, lx, lz);
    }
    return c;
  }

  radarXform() {
    const min = this.map.bounds.min, size = this.map.bounds.max - this.map.bounds.min;
    const s = 200 / size;
    return { s, toR: (x, z) => [(x - min) * s, (z - min) * s] };
  }

  // marks: the mortar's called-in target (a yellow cross), where its last shell landed (an orange ring, dashed when
  // nobody saw it) and, for the gunner, where the next shell will land (a bold red dot).
  radar(self, mates, bomb, hostages = [], marks = []) {
    if (!this.radarBg) return;
    const g = this.radarCtx;
    const { toR } = this.radarXform();
    g.clearRect(0, 0, 200, 200);
    g.drawImage(this.radarBg, 0, 0);
    if (bomb) {
      const [x, z] = toR(bomb.p[0], bomb.p[2]);
      if (!bomb.planted || Math.floor(performance.now() / 300) % 2 === 0) {
        g.fillStyle = '#ff5030';
        g.fillRect(x - 4, z - 4, 8, 8);
      }
    }
    for (const h of hostages) {
      const [x, z] = toR(h.p[0], h.p[2]);
      g.fillStyle = h.follow ? '#9fff9f' : '#ffffff';
      g.fillRect(x - 2.5, z - 2.5, 5, 5);
    }
    for (const mk of marks) {
      const [x, z] = toR(mk.p[0], mk.p[2]);
      g.lineWidth = 2;
      if (mk.kind === 'aim') {
        g.fillStyle = '#ff2020';
        g.strokeStyle = '#fff';
        g.beginPath(); g.arc(x, z, 5, 0, Math.PI * 2); g.fill(); g.stroke();
      } else if (mk.kind === 'target') {
        g.strokeStyle = '#ffe040';
        g.beginPath(); g.moveTo(x - 5, z - 5); g.lineTo(x + 5, z + 5); g.moveTo(x + 5, z - 5); g.lineTo(x - 5, z + 5); g.stroke();
      } else {
        g.strokeStyle = '#ffa040';
        g.setLineDash(mk.rough ? [3, 3] : []);
        g.beginPath(); g.arc(x, z, mk.rough ? 7 : 4, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
      }
      g.lineWidth = 1;
    }
    for (const m of mates) {
      const [x, z] = toR(m.p[0], m.p[2]);
      g.fillStyle = m.carrier ? '#ff7a3a' : TEAM_COLOR[m.team];
      g.beginPath();
      g.arc(x, z, 3.5, 0, Math.PI * 2);
      g.fill();
      if (m.radio) {
        g.strokeStyle = '#fff';
        g.beginPath();
        g.arc(x, z, 7, 0, Math.PI * 2);
        g.stroke();
      }
    }
    if (self) {
      const [x, z] = toR(self.p[0], self.p[2]);
      const a = Math.atan2(-Math.cos(self.yaw), -Math.sin(self.yaw));
      g.save();
      g.translate(x, z);
      g.rotate(a);
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(7, 0); g.lineTo(-4, 4); g.lineTo(-2, 0); g.lineTo(-4, -4);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
}
