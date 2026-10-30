// The buy menu, CS2-style: the whole shop at once in columns of gold weapon pictures (see buyicons.js). Click to
// buy, right-click to sell back something bought this round (while you can still buy), point at an item for its
// details. Keys work too: a column's number, then the item's (0 for a 10th); Esc or B closes it.
// ctx: the game's side — money(), team(), owns(id), price(id), why(id) (why it can't be bought, or ''),
// blocked() (why nothing can be bought now, or ''), refundable(id), ammo(action) (its price or 'full'),
// buy(id), sell(id), autobuy(), rebuy(), close().
import { WEAPONS, BUY_COLUMNS, itemInfo } from '/shared/weapons.js';
import { esc } from './hud.js';
import { buyIcon } from './buyicons.js';

// What our own kit does, in a line (shown when you point at it).
const ABOUT = {
  vest: 'Body armour: takes most of the damage to the chest, stomach and arms.',
  vesthelm: 'Armour and a helmet: headshots hurt far less (except from the big rifles).',
  kit: 'Defuses the bomb (and mines) twice as fast.',
  nvg: 'Nightvision (N): see in dark rooms and tunnels.',
  camo: 'Ghillie suit (H): enemies see only a shimmer of you while it\'s on; a shot shows you for a moment.',
  he: 'High-explosive grenade: heavy damage to everyone close to where it goes off.',
  flash: 'Blinds everyone who looks at it.',
  smoke: 'A thick cloud for 18 seconds; nobody sees through it, bots neither.',
  molotov: 'Bursts into flames where it lands: a 3.5 m fire for 7 seconds.',
  pmn: 'Soviet pressure mine: an enemy who steps on it loses a leg, usually their life. Hard to see.',
  jammer: 'Signal jammer (one per team): put it down and, within 15 m, the CTs\' radar shows static, they can\'t ping or call in targets, nobody there is spotted and drones crash. It hums; 3 bullets or a grenade destroy it.',
  mon50: 'Directional mine with a tripwire 3 m ahead: a fan of fragments up to 25 m forward.',
  rpg: 'Rocket launcher: explodes on whatever it hits, 9 m blast, blows holes in the mansion.',
  mortar: '82-BM-37 mortar: set it up, right mouse opens a map — click where the shell should land (or aim by hand in Soviet mils). 14 m blast.',
  m249: 'Light machine gun: a 100-round belt, chips through thin walls on the mansion.',
};

const stat = (label, value) => `<div class="bm-stat"><span>${label}</span><b>${value}</b></div>`;

export class BuyMenu {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.isOpen = false;
    this.col = null; // the column chosen with a number key
    this.hover = null;
    this.html = '';
    root.addEventListener('mousedown', e => {
      const it = e.target.closest('[data-buy]'), act = e.target.closest('[data-act]');
      if (it && e.button === 0) this.ctx.buy(it.dataset.buy);
      else if (it && e.button === 2) this.ctx.sell(it.dataset.buy);
      else if (act && e.button === 0) this.action(act.dataset.act);
      else return;
      e.preventDefault();
      this.render(true);
    });
    root.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('mouseover', e => {
      const it = e.target.closest('[data-buy]');
      const id = it ? it.dataset.buy : null;
      if (id !== this.hover) { this.hover = id; this.renderInfo(); }
    });
  }

  open(column = null) {
    this.isOpen = true;
    this.col = column;
    this.root.classList.remove('hidden');
    this.render(true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.hover = null;
    this.root.classList.add('hidden');
  }

  action(a) {
    if (a === 'ammo1' || a === 'ammo2') this.ctx.buy(a);
    else if (a === 'auto') this.ctx.autobuy();
    else if (a === 're') this.ctx.rebuy();
    else if (a === 'close') this.ctx.close();
  }

  // A number key: pick a column, then an item in it. Returns true when it was used.
  key(n) {
    if (this.col == null) {
      if (n >= 1 && n <= BUY_COLUMNS.length) { this.col = n - 1; this.render(true); return true; }
      return false;
    }
    const id = BUY_COLUMNS[this.col].items[n === 0 ? 9 : n - 1];
    if (id) this.ctx.buy(id);
    this.col = null;
    this.render(true);
    return true;
  }

  back() {
    if (this.col == null) return false;
    this.col = null;
    this.render(true);
    return true;
  }

  // Called often while open: rebuilds the page only when something on it changed.
  render(force = false) {
    if (!this.isOpen) return;
    const c = this.ctx, blocked = c.blocked();
    const cols = BUY_COLUMNS.map((col, ci) => {
      const items = col.items.map((id, i) => {
        const info = itemInfo(id), why = c.why(id), have = c.owns(id), price = c.price(id), poor = !why && !have && price > c.money();
        const cls = ['bm-item', have && 'owned', poor && 'poor', why && 'locked', c.refundable(id) && 'refund'].filter(Boolean).join(' ');
        return `<div class="${cls}" data-buy="${id}"><span class="bm-key">${i === 9 ? 0 : i + 1}</span>
          <img src="${buyIcon(id)}" alt=""><div class="bm-line"><span class="bm-name">${esc(info.name)}</span>
          <span class="bm-price">${why ? esc(why) : have ? '✔' : '$' + price}</span></div></div>`;
      }).join('');
      return `<div class="bm-col${this.col === ci ? ' sel' : ''}"><div class="bm-colhead"><b>${ci + 1}</b> ${esc(col.title)}</div>${items}</div>`;
    }).join('');
    const ammo = a => c.ammo(a);
    const html = `<div class="bm-head"><span class="bm-title">BUY MENU</span><span class="bm-reason">${esc(blocked)}</span><span class="bm-money">$${c.money()}</span></div>
      <div class="bm-cols${blocked ? ' blocked' : ''}">${cols}</div>
      <div class="bm-info"></div>
      <div class="bm-foot">
        <span data-act="ammo1"><b>,</b> Primary ammo <i>${ammo('ammo1')}</i></span>
        <span data-act="ammo2"><b>.</b> Secondary ammo <i>${ammo('ammo2')}</i></span>
        <span data-act="auto"><b>F1</b> Auto-buy</span>
        <span data-act="re"><b>F2</b> Re-buy previous</span>
        <span data-act="close"><b>B</b> Close</span>
      </div>`;
    if (!force && html === this.html) return;
    this.html = html;
    this.root.innerHTML = `<div class="bm-panel">${html}</div>`;
    this.renderInfo();
  }

  // The details of the item under the mouse.
  renderInfo() {
    const box = this.root.querySelector('.bm-info');
    if (!box) return;
    const id = this.hover;
    if (!id) { box.innerHTML = '<span class="muted">Point at an item for its details · click to buy · right-click to sell back</span>'; return; }
    const info = itemInfo(id), w = WEAPONS[id], c = this.ctx;
    let stats = '';
    if (w && w.damage && !w.grenade && !w.mine) {
      stats += stat('Damage', `${w.damage}${w.pellets ? ` × ${w.pellets}` : ''}`);
      if (w.rate) stats += stat('Fire rate', `${Math.round(60 / w.rate)} rpm`);
      if (w.mag) stats += stat('Magazine', `${w.mag}${w.reserve ? ` / ${w.reserve}` : ''}`);
      if (w.pen != null) stats += stat('Armour penetration', `${Math.round(w.pen * 100)}%`);
      if (w.speed) stats += stat('Movement', `${w.speed.toFixed(1)} m/s`);
    }
    if (w) stats += stat('Kill reward', `$${w.killReward ?? 300}`);
    const refund = c.refundable(id) ? '<div class="bm-refund">Right-click to sell it back</div>' : '';
    box.innerHTML = `<div class="bm-info-head"><img src="${buyIcon(id)}" alt=""><div><b>${esc(info.name)}</b><span>$${c.price(id)}</span></div></div>
      ${ABOUT[id] ? `<p>${esc(ABOUT[id])}</p>` : ''}<div class="bm-stats">${stats}</div>${refund}`;
  }
}
