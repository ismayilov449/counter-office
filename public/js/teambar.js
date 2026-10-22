// The team bar along the top of the screen in classic matches, like CS2's: the round timer (the bomb's once it's
// planted) with the score and how many are alive on each side between the two teams' player cards — your team on
// the left. A card: the player's picture in their colour, a health bar, money, the gun they carry, grenades, the
// kit or the bomb. The server only sends the other team's money, health and kit to the dead and spectators
// (sendTeamBar in server.js); a dead player's card is greyed out with a skull.
import { WEAPONS } from '/shared/weapons.js';
import { esc } from './hud.js';

// Each player's colour, by their place in the team (CS2 gives everyone one too).
const COLORS = ['#f2d03b', '#2fbf71', '#b35fd6', '#4aa3df', '#f08a2c', '#e0505f', '#6fd8cc', '#c9c9c9', '#ff8fd0', '#9ad94a'];

// ---- white silhouettes (SVG), CS2-style
const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="#fff">${body}</svg>`;
const GUN = {
  pistol: svg(26, 16, '<path d="M2 2h20v5h-9l-1 2h-3l-1 6H2l2-7H2z"/>'),
  smg: svg(34, 16, '<path d="M2 3h26v2h4v3H18l-1 7h-4l1-7h-3l-1 3H8l1-3H2z"/>'),
  rifle: svg(46, 16, '<path d="M1 6l6-2h30V2h3v2h5v3H32l-2 2h-5l-2 6h-4l2-6h-6l-1 3h-4l1-3H8l-7 2z"/>'),
  sniper: svg(50, 16, '<path d="M1 7l7-2h40v3H34l-2 2h-6l-2 5h-4l2-5H9l-8 2z"/><rect x="20" y="1" width="12" height="3" rx="1"/>'),
  shotgun: svg(48, 16, '<path d="M1 6l7-2h38v4H30l-2 1H18l-2 6h-4l2-6H9l-8 2z"/>'),
  mg: svg(48, 16, '<path d="M1 6l6-2h38v4H34l-2 2h-6l-2 5h-4l2-5h-2v4h-6v-4H9l-8 2z"/>'),
  launcher: svg(50, 16, '<rect x="4" y="5" width="44" height="5" rx="2"/><path d="M14 10h4l-1 5h-4zM24 10h3v3h-3z"/>'),
  mortar: svg(34, 18, '<path d="M8 15L24 2l3 3L11 17z"/><path d="M4 17l9-7 2 1-8 6zM16 13l8 4-1 1-8-4z"/>'),
  knife: svg(30, 14, '<path d="M1 6l18-3 9 4-9 3H1z"/><rect x="19" y="5" width="9" height="4" rx="1" fill="#bbb"/>'),
};
const ITEM = {
  he: svg(12, 14, '<circle cx="6" cy="9" r="5"/><rect x="4" y="1" width="4" height="4"/>'),
  flash: svg(10, 14, '<rect x="2" y="4" width="6" height="10" rx="1"/><rect x="3" y="1" width="4" height="3"/>'),
  smoke: svg(10, 14, '<rect x="2" y="4" width="6" height="10" rx="1"/><rect x="3" y="1" width="4" height="3"/><rect x="2" y="7" width="6" height="1.5" fill="#666"/>'),
  molotov: svg(10, 14, '<path d="M4 1h2v4l2 2v7H2V7l2-2z"/>'),
  pmn: svg(14, 10, '<ellipse cx="7" cy="6" rx="6" ry="3.5"/><rect x="5" y="1" width="4" height="3"/>'),
  mon50: svg(14, 12, '<rect x="1" y="1" width="12" height="7" rx="1"/><path d="M3 8l-2 4M11 8l2 4"/>'),
  kit: svg(14, 12, '<rect x="1" y="3" width="12" height="8" rx="1"/><rect x="5" y="1" width="4" height="2"/><rect x="6" y="5" width="2" height="4" fill="#444"/>'),
  c4: svg(14, 12, '<rect x="1" y="2" width="12" height="9" rx="1" fill="#f3b23a"/><rect x="3" y="4" width="8" height="3" fill="#2a2a2a"/>'),
  skull: svg(14, 14, '<path d="M7 1a6 6 0 0 0-6 6c0 2 1 3 2 4v2h8v-2c1-1 2-2 2-4a6 6 0 0 0-6-6z"/><circle cx="4.8" cy="7" r="1.6" fill="#222"/><circle cx="9.2" cy="7" r="1.6" fill="#222"/>'),
  person: svg(10, 12, '<circle cx="5" cy="3" r="2.6"/><path d="M1 12c0-3 2-5 4-5s4 2 4 5z"/>'),
};
const gunIcon = id => GUN[WEAPONS[id]?.cls] || GUN.pistol;

// ---- pictures: uploaded ones, or made here (initials on a colour; a robot face for bots)
const made = new Map();
function madePicture(name, bot) {
  const key = (bot ? 'bot:' : '') + name;
  if (made.has(key)) return made.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  g.fillStyle = `hsl(${h}, 35%, 28%)`;
  g.fillRect(0, 0, 64, 64);
  if (bot) {
    g.fillStyle = '#c9d2d8';
    g.fillRect(14, 18, 36, 30);
    g.fillRect(30, 9, 4, 9);
    g.fillStyle = '#26323a';
    g.fillRect(20, 26, 8, 7);
    g.fillRect(36, 26, 8, 7);
    g.fillRect(22, 39, 20, 3);
  } else {
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
    g.fillStyle = '#fff';
    g.font = 'bold 28px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(initials, 32, 34);
  }
  const url = c.toDataURL();
  made.set(key, url);
  return url;
}

// A picture chosen by the player, made small for sending: the middle square, 64 x 64, JPEG.
export function shrinkPicture(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas');
      c.width = c.height = 64;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 64, 64);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export class TeamBar {
  constructor(root) {
    this.root = root;
    root.innerHTML = `<div class="tb-side tb-left"></div>
      <div class="tb-mid"><div class="tb-timer"></div>
        <div class="tb-scores"><span class="tb-score l"></span><span class="tb-score r"></span></div>
        <div class="tb-alive"><span class="l"></span><span class="r"></span></div></div>
      <div class="tb-side tb-right"></div>`;
    this.left = root.querySelector('.tb-left');
    this.right = root.querySelector('.tb-right');
    this.timerEl = root.querySelector('.tb-timer');
    this.cards = new Map(); // id -> { el, key }
    this.last = '';
  }

  timer(text, bomb) {
    if (this.timerText !== text) { this.timerText = text; this.timerEl.textContent = text; }
    this.timerEl.classList.toggle('bomb', !!bomb);
  }

  // roster: [{ id, name, team, bot }], rows: the server's bar rows, myTeam: 'T' | 'CT' | other (spectating)
  update(roster, rows, avatars, score, myId, myTeam) {
    const leftTeam = myTeam === 'T' ? 'T' : 'CT', rightTeam = leftTeam === 'T' ? 'CT' : 'T';
    const byId = new Map(rows.map(r => [r[0], r]));
    const sides = { [leftTeam]: [], [rightTeam]: [] };
    for (const p of roster) if (sides[p.team] && byId.has(p.id)) sides[p.team].push(p);
    for (const list of Object.values(sides)) list.sort((a, b) => a.id - b.id);
    const seen = new Set();
    for (const [team, el] of [[leftTeam, this.left], [rightTeam, this.right]]) {
      el.className = `tb-side ${el === this.left ? 'tb-left' : 'tb-right'} ${team.toLowerCase()}`;
      sides[team].forEach((p, i) => {
        seen.add(p.id);
        const [, alive, gun, hp, money, nades, flags] = byId.get(p.id);
        const pic = avatars[p.id] || madePicture(p.name, p.bot);
        const key = [team, i, alive, gun, hp, money, nades.join(), flags, pic.length, p.name, p.id === myId].join('|');
        let c = this.cards.get(p.id);
        if (!c) { c = { el: document.createElement('div'), key: '' }; this.cards.set(p.id, c); }
        if (c.el.parentNode !== el || el.children[i] !== c.el) el.insertBefore(c.el, el.children[i] || null);
        if (c.key === key) return;
        c.key = key;
        c.el.className = `tb-card${alive ? '' : ' dead'}${p.id === myId ? ' me' : ''}`;
        c.el.style.setProperty('--pc', COLORS[i % COLORS.length]);
        c.el.title = p.name;
        const hpPart = hp >= 0 ? `<div class="tb-hp"><i style="width:${Math.min(100, hp)}%;background:${hp > 50 ? '#5fd35f' : hp > 20 ? '#e8c23a' : '#e8503a'}"></i></div>` : '';
        const kit = flags & 1 ? ITEM.kit : '', bomb = flags & 2 ? ITEM.c4 : '';
        c.el.innerHTML = `<div class="tb-pic"><img src="${pic}" alt="">${alive ? '' : `<span class="tb-skull">${ITEM.skull}</span>`}</div>${hpPart}
          <div class="tb-money">${money >= 0 ? '$' + money : ''}</div>
          <div class="tb-gun">${alive ? gunIcon(gun) : ''}</div>
          <div class="tb-items">${alive ? nades.map(n => ITEM[n] || '').join('') + kit + bomb : ''}</div>
          <div class="tb-name">${esc(p.name)}</div>`;
      });
    }
    for (const [id, c] of this.cards) if (!seen.has(id)) { c.el.remove(); this.cards.delete(id); }
    const aliveOf = team => sides[team].filter(p => byId.get(p.id)[1]).length;
    const mid = [score[leftTeam], score[rightTeam], aliveOf(leftTeam), aliveOf(rightTeam), leftTeam].join('|');
    if (mid !== this.last) {
      this.last = mid;
      const [l, r] = this.root.querySelectorAll('.tb-score'), [al, ar] = this.root.querySelectorAll('.tb-alive span');
      l.textContent = score[leftTeam] ?? 0;
      r.textContent = score[rightTeam] ?? 0;
      l.className = `tb-score l ${leftTeam.toLowerCase()}`;
      r.className = `tb-score r ${rightTeam.toLowerCase()}`;
      al.innerHTML = `${ITEM.person}${aliveOf(leftTeam)}`;
      ar.innerHTML = `${ITEM.person}${aliveOf(rightTeam)}`;
    }
  }
}
