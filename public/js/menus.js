// CS 1.6 style numbered menus (buy menu, radio). Driven by number keys, so the mouse stays captured
// and the player can keep moving while the menu is open. Items are clickable too when the cursor is free.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class MenuPanel {
  constructor(el) {
    this.el = el;
    this.stack = [];
    this.items = [];
    this.lastHtml = '';
    el.addEventListener('mousedown', e => {
      const row = e.target.closest('[data-n]');
      if (row) { e.preventDefault(); this.key(+row.dataset.n); }
    });
  }

  get isOpen() {
    return this.stack.length > 0;
  }

  get id() {
    return this.stack[0]?.id || null;
  }

  // menu: { id, title, build: () => ({ items: [{ label, right, disabled, note, select }], footer, info }) }
  open(menu) {
    this.stack = [menu];
    this.render();
  }

  push(menu) {
    this.stack.push(menu);
    this.render();
  }

  back() {
    this.stack.pop();
    this.render();
  }

  close() {
    this.stack = [];
    this.render();
  }

  // Number key 1-9 selects an item; 0 goes back/closes. Returns true when the key was used.
  key(n) {
    if (!this.isOpen) return false;
    if (n === 0) { this.back(); return true; }
    const item = this.items[n - 1];
    if (!item) return true;
    if (item.disabled) { this.flash(n); return true; }
    const next = item.select();
    if (next && next.build) this.push(next);
    else if (next !== 'stay') this.close();
    else this.render();
    return true;
  }

  flash(n) {
    const row = this.el.querySelector(`[data-n="${n}"]`);
    if (!row) return;
    row.classList.remove('deny');
    void row.offsetWidth;
    row.classList.add('deny');
  }

  render() {
    if (!this.isOpen) {
      this.el.classList.add('hidden');
      this.items = [];
      this.lastHtml = '';
      return;
    }
    const menu = this.stack[this.stack.length - 1];
    const { items, footer, info } = menu.build();
    this.items = items.slice(0, 9);
    const rows = this.items.map((it, i) => `
      <div class="mrow ${it.disabled ? 'off' : ''}" data-n="${i + 1}">
        <span class="mkey">${i + 1}</span><span class="mlabel">${esc(it.label)}${it.note ? ` <em>${esc(it.note)}</em>` : ''}</span>
        <span class="mright">${it.right ? esc(it.right) : ''}</span>
      </div>`).join('');
    const html = `<div class="mtitle">${esc(menu.title)}${info ? `<span>${esc(info)}</span>` : ''}</div>${rows}
      <div class="mrow mexit" data-n="0"><span class="mkey">0</span><span class="mlabel">${this.stack.length > 1 ? 'Back' : 'Exit'}</span></div>
      ${footer ? `<div class="mfoot">${esc(footer)}</div>` : ''}`;
    if (html !== this.lastHtml) {
      this.el.innerHTML = html;
      this.lastHtml = html;
    }
    this.el.classList.remove('hidden');
  }
}
