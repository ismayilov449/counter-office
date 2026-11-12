// "Downed & wounds" in the browser (ROADMAP group 1; docs/features/wounds.md). main.js calls in at a few hooks marked
// "wounds:"; the server's messages (wdWounds, wdReveal, wdTalked, wdShot) and the snapshot's "wd" are handled here.
//
// The snapshot's "wd" (only while there's something in it): { d: [[dragger, dragged, x, y, z]] (who drags whom, and
// where the server puts the dragged body), k: [[id, 0..1]] (downed players ending it: the pistol at the head),
// i: [[asker, victim, 0..1]] (interrogations), a: [ids] (downed players already interrogated) }.
//
// What the player does: hold E on a downed teammate and walk to drag him (only the pistol, slowly); stand still with
// E held and the revive goes on; let go of E to drop him. Hold E on a downed enemy to interrogate him. Down, hold K to
// shoot yourself. The wounds (leg: slower, arm: the aim sways and spreads, head: the sight blurs in waves) are applied
// here to the local player; the server does the same speed and spread for bots.
import { WOUNDS, woundFx } from '/shared/wounds.js';
import { BODY } from '/shared/body.js';
import { body } from './body.js';

let A = null; // what main.js hands over (initWounds)
const st = {
  d: [], // the snapshot's wd.d
  dragging: null, // the id of the teammate I drag
  draggedBy: null, myAt: null, // who drags me, and where the server puts me
  ends: new Map(), // id -> 0..1: downed players ending it
  asks: [], // [asker, victim, 0..1]
  asked: new Set(), // downed players already interrogated (E does nothing more on them)
  w: { l: 0, a: 0, h: 0 }, adUntil: 0, adT: 1, // my wounds; the adrenaline's after-effect (performance.now)
  reveal: new Map(), // enemy id -> until (performance.now): interrogated away (a ring round his radar dot)
  spots: new Map(), // id -> [x, z]: the snapshot's radar spots (where to draw the ring)
  sentAt: -1e9, stillAt: 0, ending: false, sq: null,
  sway: [0, 0], walk: 0, blur: '', camDy: 0,
  posed: new Set(), // remotes posed here (to put back)
};
const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

// Call before initBody (main.js): body.js's hint and progress words then sit over these, as E's order on the server.
export function initWounds(api) {
  A = api;
  const H = api.net.handlers;
  const wrap = (k, fn) => { const orig = H[k] || (() => {}); H[k] = m => fn(m, orig); };
  wrap('s', (m, orig) => { onSnap(m); orig(m); });
  // a new life clears my wounds (the server says so too); the same spawn number again is a move, not a new life
  wrap('spawn', (m, orig) => { if (m.sq !== st.sq) clearMe(); st.sq = m.sq; orig(m); });
  H.wdWounds = onWounds;
  H.wdReveal = onReveal;
  H.wdTalked = m => A.hud.small(`You gave away ${A.nameOf(m.id)}`, 3);
  H.wdShot = m => A.audio.play('shot', m.p, m.w);
  wrapHud();
}

// ---------------------------------------------------------------- the server's messages

function onSnap(m) {
  const wd = m.wd, me = A.me, now = performance.now();
  const was = st.dragging, lastAt = st.myAt;
  st.d = wd?.d || [];
  st.dragging = null; st.draggedBy = null; st.myAt = null;
  for (const [a, b, x, y, z] of st.d) {
    if (a === me.id) st.dragging = b;
    if (b === me.id) { st.draggedBy = a; st.myAt = [x, y, z]; }
  }
  // the drag is over: I lie exactly where the server last put me, not where my smoothing towards it had got to (at a
  // few frames a second that was up to ~0.7 m behind; sent as my position, the body "moved" and the revive the
  // dragger starts by standing still was dropped at once: body.js's 0.6 m check. Integration 2026-11-08)
  if (lastAt && !st.myAt && me.alive && me.p) { me.p[0] = lastAt[0]; me.p[1] = lastAt[1]; me.p[2] = lastAt[2]; }
  if (st.dragging != null && was == null) st.stillAt = now;
  const ends = new Map((wd?.k || []).map(([id, f]) => [id, f]));
  // somebody down pulls his pistol to his head: the click of it, where he lies
  for (const id of ends.keys()) if (!st.ends.has(id) && id !== me.id) { const r = A.remotes.get(id); if (r) A.audio.play('draw', r.p); }
  st.ends = ends;
  st.asks = wd?.i || [];
  st.asked = new Set(wd?.a || []);
  st.spots = new Map((m.sp || []).map(([id, x, z]) => [id, [x, z]]));
}

const SAY = {
  l: "Shot in the leg — you're limping",
  a: 'Shot in the arm — your aim shakes',
  h: 'A graze to the head — your sight blurs',
};
function onWounds(m) {
  const fresh = m.n && SAY[m.n];
  st.w = { l: m.l || 0, a: m.a || 0, h: m.h || 0 };
  st.adUntil = m.ad ? performance.now() + m.ad : 0;
  st.adT = m.adT || 1;
  if (fresh) A.hud.small(`${SAY[m.n]} (P bandages it: half as bad)`, 3);
  else if (m.n === 'band') A.hud.small('Wounds bandaged — half as bad now', 3);
  else if (m.n === 'ad') A.hud.small("Adrenaline! You're up — but your hands shake and your sight swims for a while", 4);
}

function onReveal(m) {
  st.reveal.set(m.id, performance.now() + m.s * 1000);
  const who = A.nameOf(m.id), v = A.nameOf(m.v);
  A.hud.small(m.by === A.me.id ? `${v} talked: ${who} is on your radar for ${m.s} s` : `${A.nameOf(m.by)} made ${v} talk: ${who} is on the radar for ${m.s} s`, 4);
  A.audio.play('pickup');
}

function clearMe() {
  st.w = { l: 0, a: 0, h: 0 };
  st.adUntil = 0;
  st.ending = false;
  st.sway = [0, 0];
}

// ---------------------------------------------------------------- the server's rules, for the hints

// A downed teammate I would take hold of (E held and walking): within reach, the nearest.
// the nearest dead body within reach (any team's, not blown apart; live rounds), for its drag
function bodyTarget() {
  const me = A.me;
  if (A.game?.phase !== 'live') return null;
  let best = null, bd = Infinity;
  for (const r of A.remotes.values()) {
    if (r.alive || r.model?.userData.gibAll || !r.buf.length || st.d.some(e => e[1] === r.id)) continue;
    const d = Math.hypot(r.p[0] - me.p[0], r.p[2] - me.p[2]);
    if (d <= WOUNDS.drag.reach && Math.abs(r.p[1] - me.p[1]) < 1.2 && d < bd) { best = r; bd = d; }
  }
  return best;
}
function dragTarget() {
  const me = A.me;
  let best = null, bd = Infinity;
  for (const r of A.remotes.values()) {
    if (!r.alive || r.team !== me.team || !body.lying(r) || st.d.some(e => e[1] === r.id)) continue;
    const d = Math.hypot(r.p[0] - me.p[0], r.p[2] - me.p[2]);
    if (d <= WOUNDS.drag.reach && Math.abs(r.p[1] - me.p[1]) < 1.2 && d < bd) { best = r; bd = d; }
  }
  return best;
}

// The downed enemy E would interrogate (as the server: close, in front, not yet interrogated, nobody else at it).
// (An enemy on the floor is downed: one playing dead is a corpse to us.)
function askTarget() {
  const me = A.me;
  let best = null, bd = Infinity;
  for (const r of A.remotes.values()) {
    if (!r.alive || r.team === me.team || !body.lying(r) || st.asked.has(r.id) || st.asks.some(e => e[1] === r.id)) continue;
    const d = Math.hypot(r.p[0] - me.p[0], r.p[2] - me.p[2]);
    if (d > BODY.reach || Math.abs(r.p[1] - me.p[1]) > 1.2 || d >= bd) continue;
    if (d > 0.9 && Math.abs(wrapA(Math.atan2(-(r.p[0] - me.p[0]), -(r.p[2] - me.p[2])) - me.yaw)) > 1.05) continue;
    best = r; bd = d;
  }
  return best;
}

// E free for an interrogation (the server's onUse order: not on a gadget, in a car, with the drone, holding a hostage,
// or where E plants or defuses the bomb).
const eFree = () => {
  const me = A.me;
  return me.alive && !me.act && me.driving == null && !me.riding && !me.drone && !A.busy?.() && !A.blockE?.() && !body.downed() && !body.playingDead();
};

function wrapHud() {
  const hud = A.hud, hint0 = hud.hint, progress0 = hud.progress, radar0 = hud.radar;
  hud.hint = function (text) {
    const me = A.me;
    let h = text;
    // (down, the hint line would sit on body.js's "YOU'RE DOWN" panel: our words go on a line under it, downLine)
    if (me.alive && body.downed()) h = '';
    else if (me.alive && st.dragging != null && A.remotes.get(st.dragging)?.alive === false) h = `Dragging ${A.nameOf(st.dragging)}'s body — let go of E to drop it`;
    else if (me.alive && st.dragging != null) h = `Dragging ${A.nameOf(st.dragging)} — stand still to revive, let go of E to drop him`;
    else if (typeof text === 'string' && text.startsWith('Hold E to revive')) h = `${text} · walk to drag him`;
    else if (eFree()) { const q = askTarget(); if (q) h = `Hold E to interrogate ${q.name} (${WOUNDS.ask} s)`; else if (!h) { const r = bodyTarget(); if (r) h = `Hold E and walk to drag ${r.name}'s body`; } }
    return hint0.call(this, h);
  };
  hud.progress = function (label, frac) {
    const me = A.me;
    if (label != null && me.act?.a === 'wdAsk') {
      const e = st.asks.find(x => x[0] === me.id);
      label = `Interrogating ${e ? A.nameOf(e[1]) : ''}...`;
    } else if (label != null && me.act?.a === 'bodyRevive' && me.inv?.adren) label = `${label.replace(/\.\.\.$/, '')} (adrenaline)...`;
    return progress0.call(this, label, frac);
  };
  // a pulsing yellow ring with a "?" round an enemy someone interrogated away (his red dot comes from the spotting)
  hud.radar = function (...args) {
    radar0.apply(this, args);
    if (!st.reveal.size || args[6] || !this.radarCtx) return;
    const g = this.radarCtx, { toR } = this.radarXform(), now = performance.now();
    for (const [id, until] of st.reveal) {
      if (now > until) { st.reveal.delete(id); continue; }
      const s = st.spots.get(id);
      if (!s) continue;
      const [x, z] = toR(s[0], s[1]);
      g.strokeStyle = '#ffd030';
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, z, 7 + 1.5 * Math.sin(now / 120), 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffd030';
      g.font = 'bold 11px sans-serif';
      g.fillText('?', x + 7, z - 5);
      g.lineWidth = 1;
    }
  };
}

// Down: what's happening to me and what K does (shown under body.js's "YOU'RE DOWN" panel).
function downLine() {
  const me = A.me;
  if (!me.alive || !body.downed() || st.ends.has(me.id)) return '';
  const ask = st.asks.find(e => e[1] === me.id);
  if (ask) return `${A.nameOf(ask[0])} is interrogating you — hold K to end it first (${WOUNDS.suicide} s)`;
  if (st.draggedBy != null) return `${A.nameOf(st.draggedBy)} is dragging you · hold K to end it yourself (${WOUNDS.suicide} s)`;
  return `Hold K to end it yourself (${WOUNDS.suicide} s)`;
}

// ---------------------------------------------------------------- the wounds' effects on me

const adLeft = (now = performance.now()) => (st.adUntil > now ? (st.adUntil - now) / st.adT : 0);
const fxNow = () => woundFx(st.w, adLeft());

function effects(dt, now, camera) {
  const me = A.me, fx = fxNow();
  // a shaky hand: the aim drifts by itself (it's where the shots go), a slow wander and a faster tremor
  const t = now / 1000, amp = me.alive ? fx.shake : 0;
  const sy = amp * (0.6 * Math.sin(t * 2.3) + 0.3 * Math.sin(t * 5.9 + 1.3) + 0.15 * Math.sin(t * 13.1 + 0.4));
  const sp = amp * 0.7 * (0.6 * Math.sin(t * 1.9 + 2.1) + 0.3 * Math.sin(t * 6.7 + 0.2) + 0.15 * Math.sin(t * 11.3 + 2.9));
  me.yaw += sy - st.sway[0];
  me.pitch += sp - st.sway[1];
  st.sway = [sy, sp];
  // the limp: the view dips and rolls on the bad leg's step
  const hs = Math.hypot(me.v?.[0] || 0, me.v?.[2] || 0);
  if (me.alive && st.w.l && me.onGround && hs > 0.3) st.walk += hs * dt * 1.7;
  const step = st.w.l && me.alive ? Math.max(0, Math.sin(st.walk)) ** 3 * Math.min(1, hs / 2) : 0;
  // ending it: the head tilts towards the pistol (right) and drops a little over the 5 s
  const end = me.alive && st.ends.has(me.id) ? st.ends.get(me.id) : 0, k = end * end * (3 - 2 * end);
  if (step > 0.001 || k > 0) {
    camera.position.y -= 0.06 * st.w.l * step;
    camera.rotation.z -= 0.03 * st.w.l * step + 0.28 * k;
    camera.rotation.x -= 0.12 * k;
    camera.updateMatrixWorld();
  }
  // the blur: in waves (a head graze every 6 s, adrenaline every 3 s)
  let px = 0;
  if (me.alive && fx.blur > 0) {
    const per = adLeft(now) > 0 ? 3 : 6;
    px = fx.blur * Math.max(0, Math.sin((t * 2 * Math.PI) / per)) ** 2;
  }
  const css = px >= 0.25 ? `blur(${(Math.round(px * 4) / 4).toFixed(2)}px)` : '';
  // (on the canvas's container: main.js owns the canvas's own filter — nightvision, the CCTV picture — and sets it
  // every frame; a filter on the parent adds to it)
  const el = A.canvas?.parentElement || A.canvas;
  if (el && el.style.filter !== css) { st.blur = css; el.style.filter = css; }
}

// ---------------------------------------------------------------- remote players

// The pistol at the temple (raised over the first 0.8 s), the other arm back down.
function poseEnd(u, f, now) {
  const k = Math.min(1, (f * WOUNDS.suicide) / 0.8);
  u.arms.rotation.x += (Math.PI / 2 - u.arms.rotation.x) * k;
  u.arms.rotation.y = -0.35 * k;
  u.arms.rotation.z = 0.03 * Math.sin(now / 45) * k; // (trembling)
  u.hand.rotation.y = (Math.PI / 2) * k;
  u.lArm.rotation.x = -1.3 * k;
}

// One hand on the collar of the body he pulls (behind him, or in front when he walks backwards), leaning into it.
function poseDragger(r, u, e) {
  const off = wrapA(Math.atan2(-(e[2] - r.p[0]), -(e[4] - r.p[2])) - r.yaw);
  u.lArm.rotation.set(Math.abs(off) > Math.PI / 2 ? -2.3 : -0.8, off > 0 ? 0.3 : -0.3, 0);
  u.upper.rotation.x = 0.18;
}

function unpose(u) {
  u.arms.rotation.y = 0;
  u.arms.rotation.z = 0;
  u.hand.rotation.y = 0;
  u.lArm.rotation.set(0, 0, 0);
  u.upper.rotation.x = 0;
}

function poseRemotes(now) {
  const seen = new Set();
  const dragger = new Map(st.d.map(e => [e[0], e])), dragged = new Set(st.d.map(e => e[1]));
  for (const r of A.remotes.values()) {
    const u = r.model?.userData;
    if (!r.alive || !u?.arms) continue;
    if (st.ends.has(r.id)) poseEnd(u, st.ends.get(r.id), now);
    else if (dragger.has(r.id)) poseDragger(r, u, dragger.get(r.id));
    else if (dragged.has(r.id)) { for (const leg of u.legs) leg.rotation.x = 0; } // (pulled along, not crawling)
    else continue;
    seen.add(r.id);
  }
  for (const id of st.posed) {
    const u = !seen.has(id) && A.remotes.get(id)?.model?.userData;
    if (u?.arms) unpose(u);
  }
  st.posed = seen;
}

// ---------------------------------------------------------------- the HUD: wound badges

let ui = null;
function buildUi() {
  const css = document.createElement('style');
  css.textContent = `
#wd-badges { position: absolute; left: 18px; bottom: 58px; display: flex; gap: 6px; pointer-events: none; }
#wd-badges .badge { margin: 0; padding: 2px 7px; font-size: 13px; }
#wd-badges .badge.wd-band { background: rgba(190, 120, 20, 0.75); }
#wd-badges .badge.wd-ad { background: rgba(150, 40, 170, 0.75); }
#wd-badges .badge.wd-syr { background: rgba(30, 140, 130, 0.75); }
#wd-end { position: fixed; inset: 0; pointer-events: none; z-index: 9; opacity: 0;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.92) 100%); }
#wd-down { position: fixed; left: 50%; bottom: 13%; transform: translateX(-50%); width: 460px; max-width: 90vw; z-index: 9;
  pointer-events: none; text-align: center; color: #ffd6cf; font: bold 13px Verdana, sans-serif; text-shadow: 0 1px 2px #000; }
#wd-down .bar { height: 7px; width: 260px; margin: 5px auto 0; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,90,70,0.6); visibility: hidden; }
#wd-down .bar i { display: block; height: 100%; width: 0; background: #e8e0d0; }`;
  document.head.appendChild(css);
  // (a row of their own above the health: the bottom row is full with the bleeding badge, and the bet's footer is there
  // in buy time)
  const box = document.createElement('div');
  box.id = 'wd-badges';
  // (in the page's badge row after BLEEDING, integration 2026-11-08; without that row, at this spot on its own)
  (document.getElementById('hud-badges') || document.getElementById('hud') || document.body).appendChild(box);
  const end = document.createElement('div');
  end.id = 'wd-end';
  const down = document.createElement('div');
  down.id = 'wd-down';
  down.innerHTML = '<div class="t"></div><div class="bar"><i></i></div>';
  document.body.appendChild(end);
  document.body.appendChild(down);
  ui = { box, end, down, text: down.querySelector('.t'), bar: down.querySelector('.bar'), fill: down.querySelector('.bar i'), key: '', endK: -1, downT: null, barK: -1 };
}

function updateHud(now) {
  if (!ui) buildUi();
  const me = A.me, w = st.w, ad = adLeft(now);
  const part = (k, label) => (w[k] ? `<div class="badge${w[k] < 1 ? ' wd-band' : ''}" title="${w[k] < 1 ? 'bandaged' : 'P to bandage'}">${label}${w[k] < 1 ? ' ½' : ''}</div>` : '');
  const html = !me.alive ? '' : part('l', 'LEG') + part('a', 'ARM') + part('h', 'HEAD') +
    (ad > 0 ? `<div class="badge wd-ad">ADRENALINE ${Math.ceil((st.adUntil - now) / 1000)}</div>` : '') +
    (me.inv?.adren ? '<div class="badge wd-syr" title="adrenaline syringe: a 2 s revive">SYRINGE</div>' : '');
  if (html !== ui.key) { ui.key = html; ui.box.innerHTML = html; }
  // ending it: the world goes dark at the edges
  const f = me.alive && st.ends.has(me.id) ? Math.round(st.ends.get(me.id) * 20) / 20 : 0;
  if (f !== ui.endK) { ui.endK = f; ui.end.style.opacity = f; }
  // down: the line under body.js's panel (and ending it, its bar: not the hud's progress bar, which sits on the panel)
  const line = me.alive && body.downed() && st.ends.has(me.id) ? 'Ending it — let go of K to stop' : downLine();
  if (line !== ui.downT) { ui.downT = line; ui.text.textContent = line; }
  const b = me.alive && st.ends.has(me.id) ? Math.round(st.ends.get(me.id) * 100) : -1;
  if (b !== ui.barK) { ui.barK = b; ui.bar.style.visibility = b >= 0 ? 'visible' : 'hidden'; ui.fill.style.width = `${Math.max(0, b)}%`; }
}

function forcePistol() {
  const slot = A.weaponOf('secondary') ? 'secondary' : 'knife';
  if (A.me.slot !== slot) A.switchSlot(slot, true);
}

// ---------------------------------------------------------------- the hooks main.js calls

export const wounds = {
  // updateLocal: the walking speed — a limp, the drag's slow walk, nothing while dragged or ending it; no jumping then
  speed(speed) {
    const me = A.me;
    if (!me.alive) return speed;
    if (st.draggedBy != null || st.ends.has(me.id) || st.ending) { me.jumpQueued = false; return 0; }
    let s = speed * fxNow().speed;
    if (st.dragging != null) { me.jumpQueued = false; s = Math.min(s, WOUNDS.drag.speed); }
    return s;
  },
  // computeSpread: an arm wound (or adrenaline) spreads the shots
  spread: s => (A?.me.alive ? s + fxNow().spread : s),
  // switchSlot: only the pistol while dragging (the knife if there's no pistol)
  blocksSlot: slot => st.dragging != null && slot !== 'secondary' && !(slot === 'knife' && !A.weaponOf('secondary')),
  dragging: () => st.dragging,
  draggedBy: () => st.draggedBy,
  wounds: () => ({ ...st.w, ad: adLeft() }),
  // every frame, after the camera is placed
  frame(dt, now, camera) {
    const me = A.me;
    // E held and walking over a downed teammate: drag him (from his revive, or straight away); standing still with E
    // held: the revive goes on (the server does both)
    const eHeld = me.usingKey || me.usingMouse, moving = MOVE.some(k => A.keys.has(k));
    if (me.alive && st.dragging == null && eHeld && moving && now - st.sentAt > 400 && !body.downed() && (me.act?.a === 'bodyRevive' || (!me.act && (dragTarget() || bodyTarget())))) {
      A.net.send({ t: 'wdDrag', on: 1 });
      st.sentAt = now;
      st.stillAt = now;
    }
    if (st.dragging != null && me.alive) {
      if (moving) st.stillAt = now;
      else if (eHeld && now - st.stillAt > WOUNDS.drag.still * 1000 && now - st.sentAt > 400) { A.net.send({ t: 'wdDrag', on: 0 }); st.sentAt = now; }
      forcePistol();
    }
    // down: K held is the pistol to the head (let go to stop)
    const k = me.alive && body.downed() && A.keys.has('KeyK');
    if (k !== st.ending) { A.net.send({ t: 'wdEnd', on: k ? 1 : 0 }); st.ending = k; }
    // dragged: the server says where I am (smoothly)
    if (st.myAt && me.alive) {
      const f = Math.min(1, dt * 12), far = Math.hypot(st.myAt[0] - me.p[0], st.myAt[2] - me.p[2]) > 2;
      const dx = (st.myAt[0] - me.p[0]) * (far ? 1 : f), dy = (st.myAt[1] - me.p[1]) * (far ? 1 : f), dz = (st.myAt[2] - me.p[2]) * (far ? 1 : f);
      me.p[0] += dx; me.p[1] += dy; me.p[2] += dz;
      if (me.v) me.v[0] = me.v[2] = 0;
      camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
      camera.updateMatrixWorld();
    }
    effects(dt, now, camera);
    poseRemotes(now);
    updateHud(now);
  },
};

// The syringe's picture in the buy menu (buyicons.js draws it in gold): barrel, plunger, needle.
export function drawSyringe(g) {
  g.save();
  g.translate(128, 64);
  g.rotate(-0.32);
  g.fillRect(-58, -13, 92, 26); // the barrel
  g.fillRect(-84, -4, 28, 8); // the plunger's rod
  g.fillRect(-92, -16, 8, 32); // its thumb rest
  g.fillRect(-60, -20, 6, 40); // the finger grips
  g.fillRect(34, -6, 12, 12); // the hub
  g.fillRect(46, -1.5, 40, 3); // the needle
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = -44; x < 30; x += 14) g.fillRect(x, -13, 2, 12); // the marks
  g.fillRect(-54, 4, 70, 5); // the dose
  g.restore();
}
