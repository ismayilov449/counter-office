// "Downed, not dead" and "Play dead" in the browser (docs/features/body.md). main.js calls in at a few hooks marked
// "body:"; the server's messages (bodyDown, bodyUp, bodyKill, bodyPlayDead and the snapshot's "bd") are handled here.
//
// The snapshot's "bd": { d: [[id, bleed left 0..1, revive 0..1, reviver]] (everyone down; the numbers only for our own
// team), u: [[id, 0..1]] (getting up from playing dead), p: [[id, fake killer]] (our team playing dead) }.
// The server says a teammate playing dead is dead (snapshot, roster, team bar) to everyone; we undo that for our team.
import { BODY, rayLying } from '/shared/body.js';

let A = null; // what main.js hands over (initBody)
const st = {
  downed: false, // me, down on the floor
  pd: false, // me, playing dead
  pdP: null, pdYaw: 0, pdLow: false, pdAt: 0, // where and how I lay down
  riseUntil: 0, // me getting up (performance.now ms)
  eye: null, // my camera height while down (smoothed)
  riseAsk: 0, keyAt: 0,
  down: new Map(), // id -> the snapshot's entry, for everyone down
  pdMates: new Map(), // id -> fake killer: teammates playing dead (me too)
  rise: new Map(), // id -> when they started getting up from playing dead
  upAt: new Map(), // id -> when they were revived (crawling -> standing)
  tag: new Map(), // victim id -> 'finished' | 'bled', for the kill message that follows
  cam: null, // the camera (body.camera), for how close a body on the floor is
  tagged: new Set(), // names of teammates on the floor whose name tag shows (no second name under the crosshair)
};
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'ControlRight'];
const TAG_Y = 2.15; // (createNameTag)
const smooth = f => f * f * (3 - 2 * f);

export function initBody(api) {
  A = api;
  const H = api.net.handlers;
  const wrap = (k, fn) => { const orig = H[k] || (() => {}); H[k] = m => fn(m, orig); };
  wrap('s', (m, orig) => { onSnap(m); orig(m); });
  wrap('kill', onKill);
  wrap('roster', (m, orig) => { patchRoster(m.list); orig(m); });
  wrap('bar', (m, orig) => { if (st.pdMates.size) for (const row of m.l) if (st.pdMates.has(row[0])) row[1] = 1; orig(m); });
  wrap('spawn', (m, orig) => { clearMe(); orig(m); });
  H.bodyDown = onDown;
  H.bodyUp = onUp;
  H.bodyKill = m => st.tag.set(m.v, m.how);
  H.bodyPlayDead = onPlayDead;
  wrapHud();
}

// ---------------------------------------------------------------- the server's messages

function onSnap(m) {
  const now = performance.now(), bd = m.bd;
  st.down.clear();
  const rising = new Set();
  if (bd) {
    for (const e of bd.d) st.down.set(e[0], e);
    for (const [id, f] of bd.u) { rising.add(id); if (!st.rise.has(id)) st.rise.set(id, now - f * BODY.rise * 1000); }
  }
  for (const id of st.rise.keys()) if (!rising.has(id)) st.rise.delete(id);
  st.pdMates = new Map((bd?.p || []).map(([id, by]) => [id, by]));
  // they look dead to everyone; we're on their side
  if (st.pdMates.size) for (const row of m.pl) if (st.pdMates.has(row[0])) row[8] = 1;
  // my own state (the messages say it first; the snapshot keeps it right)
  if (A.me.alive) {
    if (st.down.has(A.me.id) !== st.downed) setDowned(!st.downed);
    if (st.pd && !st.pdMates.has(A.me.id)) st.pd = false;
  }
}

function onKill(m, orig) {
  const how = st.tag.get(m.v);
  st.tag.delete(m.v);
  st.down.delete(m.v);
  st.upAt.delete(m.v);
  st.pdMates.delete(m.v);
  if (m.v === A.me.id) clearMe();
  if (!how) { orig(m); return; }
  // "(finished)" or "(bled out)" after the name in the kill feed
  const hud = A.hud, kf = hud.killfeed;
  hud.killfeed = function (k, v, w, hs, mine) { return kf.call(this, k, { ...v, name: `${v.name} (${how === 'bled' ? 'bled out' : 'finished'})` }, w, hs, mine); };
  try { orig(m); } finally { hud.killfeed = kf; }
}

function onDown(m) {
  const killer = m.k != null ? { name: A.nameOf(m.k), team: A.teamOf(m.k) } : null;
  A.hud.killfeed(killer, { name: `${A.nameOf(m.v)} (down)`, team: A.teamOf(m.v) }, m.w, false, m.k === A.me.id || m.v === A.me.id);
  markFeed('bd-down');
  if (!st.down.has(m.v)) st.down.set(m.v, [m.v]);
  const r = A.remotes.get(m.v);
  if (r) A.audio.play('hurt', r.p);
  if (m.v === A.me.id) setDowned(true);
}

function onUp(m) {
  const me = A.me;
  if (m.pd) { // a "corpse" gets up
    st.pdMates.delete(m.v);
    if (m.v === me.id) {
      st.pd = false;
      st.riseUntil = performance.now() + BODY.rise * 1000;
      if (m.why === 'hit') A.hud.small('You were hit — getting up!', 2);
      else if (m.why === 'time') A.hud.small("You can't play dead any longer", 2);
    } else if (A.teamOf(m.v) !== me.team) A.hud.small(`${A.nameOf(m.v)} was playing dead!`, 3);
    return;
  }
  st.down.delete(m.v);
  st.upAt.set(m.v, performance.now());
  A.hud.killfeed({ name: A.nameOf(m.by), team: A.teamOf(m.by) }, { name: A.nameOf(m.v), team: A.teamOf(m.v) }, 'revived', false, m.by === me.id || m.v === me.id);
  markFeed('bd-up');
  if (m.v === me.id) {
    setDowned(false);
    A.hud.small(`${A.nameOf(m.by)} got you back on your feet`, 3);
    A.audio.play('pickup');
  }
}

// (only to our own team)
function onPlayDead(m) {
  st.pdMates.set(m.v, m.by || 0);
  const me = A.me;
  if (m.v === me.id) {
    Object.assign(st, { pd: true, pdP: me.p.slice(), pdYaw: me.yaw, pdLow: !!me.crouch, pdAt: performance.now() });
    me.mortar = null;
    me.scope = 0;
    A.audio.play('death');
    A.hud.small('Playing dead — K, moving or shooting gets you up', 4);
  } else A.hud.small(`${A.nameOf(m.v)} is playing dead`, 3);
}

// The roster says a teammate playing dead is dead (one more death, one more kill for whoever "killed" them): undo it.
function patchRoster(list) {
  for (const [id, by] of st.pdMates) {
    const e = list.find(x => x.id === id);
    if (!e || e.alive) continue;
    e.alive = true;
    e.d = Math.max(0, e.d - 1);
    const k = by && list.find(x => x.id === by);
    if (k) k.k = Math.max(0, k.k - 1);
  }
}

function markFeed(cls) {
  document.getElementById('killfeed')?.lastElementChild?.classList.add(cls);
}

// ---------------------------------------------------------------- my own state

function setDowned(on) {
  if (st.downed === on) return;
  st.downed = on;
  st.eye = null;
  if (on) {
    A.me.mortar = null;
    A.me.scope = 0;
    forcePistol();
    A.hud.small("You're down! Crawl to cover — a teammate can revive you", 4);
    A.audio.play('hurt');
  }
}

function clearMe() {
  st.downed = false;
  st.pd = false;
  st.riseUntil = 0;
  st.eye = null;
}

function forcePistol() {
  const slot = A.weaponOf('secondary') ? 'secondary' : 'knife';
  if (A.me.slot !== slot) A.switchSlot(slot, true);
}

// The downed teammate E would revive (the server's rule: close on the floor, roughly in front, nobody else on it).
function reviveTarget() {
  const me = A.me;
  let best = null, bd = Infinity;
  for (const [id, e] of st.down) {
    const r = A.remotes.get(id);
    if (!r || !r.alive || r.team !== me.team || (e[3] && e[3] !== me.id)) continue;
    const d = Math.hypot(r.p[0] - me.p[0], r.p[2] - me.p[2]);
    if (d > BODY.reach || Math.abs(r.p[1] - me.p[1]) > 1.2 || d >= bd) continue;
    if (d > 0.9) {
      const off = Math.atan2(-(r.p[0] - me.p[0]), -(r.p[2] - me.p[2])) - me.yaw;
      if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > 1.05) continue;
    }
    best = r; bd = d;
  }
  return best;
}

function wrapHud() {
  const hud = A.hud, hint0 = hud.hint, progress0 = hud.progress, radar0 = hud.radar, targetName0 = hud.targetName;
  // a teammate on the floor has his name tag right over him, next to the crosshair: not a second name under it
  hud.targetName = function (name, team) {
    return targetName0.call(this, name && st.tagged.has(name) ? null : name, team);
  };
  hud.hint = function (text) {
    const me = A.me;
    let h = null;
    if (me.alive && (st.downed || st.pd)) h = '';
    else if (me.alive && !me.act && me.driving == null && !me.riding && st.down.size) {
      const r = reviveTarget();
      if (r) h = `Hold E to revive ${r.name} (${BODY.revive} s)`;
    }
    return hint0.call(this, h ?? text);
  };
  hud.progress = function (label, frac) {
    if (label != null && A.me.act?.a === 'bodyRevive') {
      const id = [...st.down.values()].find(e => e[3] === A.me.id)?.[0];
      label = id ? `Reviving ${A.nameOf(id)}...` : 'Reviving...';
    }
    return progress0.call(this, label, frac);
  };
  // a pulsing red cross on the radar where a teammate lies wounded
  hud.radar = function (...args) {
    radar0.apply(this, args);
    if (!st.down.size || args[6] || !this.radarCtx) return;
    const g = this.radarCtx, { toR } = this.radarXform(), k = 0.5 + 0.5 * Math.sin(performance.now() / 150);
    for (const id of st.down.keys()) {
      const r = A.remotes.get(id);
      if (!r || !r.alive || r.team !== A.me.team) continue;
      const [x, z] = toR(r.p[0], r.p[2]);
      g.strokeStyle = `rgba(255, 60, 50, ${0.45 + 0.55 * k})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, z, 6 + 2 * k, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ff4a3a';
      g.fillRect(x - 1.2, z - 4, 2.4, 8); g.fillRect(x - 4, z - 1.2, 8, 2.4);
      g.lineWidth = 1;
    }
  };
}

// ---------------------------------------------------------------- remote players lying on the floor

// The name tag (a child of the model) at height dy and dz behind the model's feet, whatever the model's tilt a.
function tagAt(r, a, dy, dz) {
  if (r.tag) r.tag.position.set(0, dy * Math.cos(a) + dz * Math.sin(a), -dy * Math.sin(a) + dz * Math.cos(a));
}

function unpose(r) {
  const u = r.model.userData;
  u.headG.rotation.x = 0;
  u.rArm.rotation.x = 0;
  u.lArm.rotation.x = 0;
  if (r.tag) { r.tag.position.set(0, TAG_Y, 0); r.tag.material.opacity = 1; }
  r.bodyPosed = false;
}

// Crawling on the belly, head up, the pistol in front (k: 1 down, towards 0 getting up after a revive).
function crawl(r, k) {
  const m = r.model, u = m.userData;
  const tilt = BODY.crawlTilt * k, back = BODY.crawlBack * k;
  m.position.x += Math.sin(r.yaw) * back;
  m.position.z += Math.cos(r.yaw) * back;
  m.rotation.x = -tilt;
  u.hip.position.y = 0.85;
  for (const leg of u.legs) leg.scale.y = 1;
  u.upper.scale.y = 1;
  const sw = Math.sin(r.walk * 1.3) * 0.35;
  u.legs[0].rotation.x = sw * 0.4 * k;
  u.legs[1].rotation.x = -sw * 0.4 * k;
  u.arms.rotation.x = 1.25 * k + u.arms.rotation.x * (1 - k);
  u.rArm.rotation.x = sw * k;
  u.lArm.rotation.x = -sw * k;
  u.headG.rotation.x = 1.0 * k;
  tagAt(r, -tilt, 0.95, -back);
}

function poseRemotes(now) {
  st.tagged.clear();
  for (const r of A.remotes.values()) {
    let mode = null;
    if (r.alive && r.buf.length) {
      if (st.down.has(r.id)) mode = 'down';
      else if (st.pdMates.has(r.id)) mode = 'dead';
      else if (st.rise.has(r.id)) mode = 'rise';
      else if (st.upAt.has(r.id)) mode = 'up';
    }
    if (!mode) { if (r.bodyPosed) unpose(r); continue; }
    r.bodyPosed = true;
    if (mode === 'down') crawl(r, 1);
    else if (mode === 'up') {
      const k = 1 - (now - st.upAt.get(r.id)) / 600;
      if (k <= 0) { st.upAt.delete(r.id); unpose(r); } else crawl(r, smooth(k));
    } else {
      // like a real corpse (main.js tips the dead over backwards), getting up over BODY.rise seconds
      const f = mode === 'dead' ? 0 : Math.min(1, (now - st.rise.get(r.id)) / (BODY.rise * 1000));
      const a = (Math.PI / 2) * (1 - smooth(f));
      r.model.rotation.x = a;
      tagAt(r, a, 0.75 + (TAG_Y - 0.75) * f, (r.c ? 0.45 : 0.9) * (1 - f));
    }
    // The name tag of a body on the floor hangs low, right where you look when you stand over it: up close it would
    // fill the view and cover the "Hold E to revive" hint (which names him anyway), so it fades out from 3 m to 1.5 m.
    if (r.tag && st.cam) {
      const d = Math.hypot(r.p[0] - st.cam.position.x, r.p[2] - st.cam.position.z);
      r.tag.material.opacity = mode === 'up' || mode === 'rise' ? 1 : Math.max(0, Math.min(1, (d - 1.5) / 1.5));
      if (r.tag.visible && r.tag.material.opacity >= 0.5) st.tagged.add(r.name);
    }
  }
}

// ---------------------------------------------------------------- overlays: eyes half closed, bleeding out

let ui = null;
function buildUi() {
  const css = document.createElement('style');
  css.textContent = `
#bd-eyes { position: fixed; inset: 0; pointer-events: none; z-index: 9; opacity: 0; transition: opacity 0.35s;
  background: linear-gradient(to bottom, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.8) 17%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 64%, rgba(0,0,0,0.8) 83%, rgba(0,0,0,0.97) 100%),
    radial-gradient(ellipse at center, rgba(0,0,0,0) 38%, rgba(0,0,0,0.85) 100%); }
#bd-down { position: fixed; inset: 0; pointer-events: none; z-index: 9; display: none;
  background: radial-gradient(ellipse at center, rgba(90,0,0,0) 42%, rgba(120,0,0,0.6) 100%); }
#bd-panel { position: absolute; left: 50%; bottom: 21%; transform: translateX(-50%); width: 360px; text-align: center;
  color: #ffd6cf; font: bold 14px Verdana, sans-serif; text-shadow: 0 1px 2px #000; }
#bd-panel .t { font-size: 20px; color: #ff5040; letter-spacing: 2px; }
#bd-panel .bar { height: 8px; margin: 6px 0; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,90,70,0.6); }
#bd-panel .bar i { display: block; height: 100%; width: 100%; background: #d02a1a; }
#bd-panel .bar.rev { border-color: rgba(110,220,110,0.7); }
#bd-panel .bar.rev i { background: #5fd35f; }
#killfeed .kf.bd-down .w { color: #ff8a70; }
#killfeed .kf.bd-up .w { color: #7fe07f; }`;
  document.head.appendChild(css);
  const eyes = document.createElement('div');
  eyes.id = 'bd-eyes';
  const down = document.createElement('div');
  down.id = 'bd-down';
  down.innerHTML = '<div id="bd-panel"><div class="t">YOU\'RE DOWN</div><div class="bar"><i></i></div><div class="s"></div><div class="bar rev"><i></i></div></div>';
  document.body.append(eyes, down);
  const q = s => down.querySelector(s);
  ui = { eyes, down, bleed: q('.bar i'), text: q('.s'), revBar: q('.bar.rev'), rev: q('.bar.rev i'), last: {} };
}

function setIf(key, value, apply) {
  if (ui.last[key] === value) return;
  ui.last[key] = value;
  apply(value);
}

function overlays(now) {
  if (!ui) buildUi();
  const eyes = st.pd ? 1 : now < st.riseUntil ? (st.riseUntil - now) / (BODY.rise * 1000) : 0;
  setIf('eyes', Math.round(eyes * 20) / 20, v => { ui.eyes.style.opacity = v; });
  setIf('down', st.downed, v => { ui.down.style.display = v ? 'block' : 'none'; });
  if (!st.downed) return;
  const e = st.down.get(A.me.id) || [];
  const bleed = e[1] ?? 1, rev = e[2] ?? 0;
  setIf('bleed', Math.round(bleed * 200), v => { ui.bleed.style.width = `${v / 2}%`; });
  setIf('rev', Math.round(rev * 100), v => { ui.rev.style.width = `${v}%`; ui.revBar.style.visibility = v > 0 ? 'visible' : 'hidden'; });
  const text = rev > 0 ? `${A.nameOf(e[3])} is reviving you — stay still` : `Bleeding out in ${Math.ceil(bleed * BODY.bleed)} s — crawl to cover; a teammate can hold E on you`;
  setIf('text', text, v => { ui.text.textContent = v; });
}

// ---------------------------------------------------------------- the hooks main.js calls

export const body = {
  // no moving, shooting or aiming: playing dead, or getting up
  frozen: () => st.pd || performance.now() < st.riseUntil,
  // down: always ducked (the crawl)
  crouched: () => st.downed,
  // the walking speed: a crawl while down; no jumping from the floor
  move(speed) {
    if (st.downed || st.pd) A.me.jumpQueued = false;
    return st.downed ? Math.min(speed, BODY.crawl) : speed;
  },
  // the camera height while down
  eye(dt) {
    if (!st.downed) { st.eye = null; return; }
    st.eye = st.eye == null ? A.me.eyeH : st.eye + (BODY.downEye - st.eye) * Math.min(1, dt * 6);
    A.me.eyeH = st.eye;
  },
  // down: only the pistol (or the knife)
  blocksSlot: slot => st.downed && slot !== 'secondary' && slot !== 'knife',
  // K: play dead, or get up
  key() {
    const me = A.me, now = performance.now();
    if (!me.alive || me.drone || me.driving != null || me.riding || now - st.keyAt < 400) return;
    st.keyAt = now;
    if (st.downed) { A.hud.small("You can't play dead while you're down", 2); return; }
    if (A.game.cfg.gameMode !== 'classic') { A.hud.small('Playing dead works in classic matches only', 2); return; }
    // (a corpse can't hang in the air, on a ladder or in the water; off the zip line the server lets you fall)
    if (!me.onGround && !me.zip && !st.pd) { A.hud.small('Stand on the ground to play dead', 2); return; }
    st.riseAsk = now;
    A.net.send({ t: 'bodyPlayDead' });
  },
  // every frame, after the remote players are placed
  frame(dt, now) {
    const me = A.me;
    if (!me.alive && (st.downed || st.pd)) clearMe();
    if (st.downed) { me.ladderFree = now + 250; forcePistol(); }
    if (st.pd && !me.onGround) st.pdP = me.p.slice(); // (still falling, off the zip line: the view goes down with you)
    // moving or shooting gets you up
    if (st.pd && now - st.pdAt > 300 && now - st.riseAsk > 600 && (MOVE_KEYS.some(k => A.keys.has(k)) || A.firing())) {
      st.riseAsk = now;
      A.net.send({ t: 'bodyPlayDead' });
    }
    poseRemotes(now);
    overlays(now);
  },
  // main.js's aim tests (the name under the crosshair, the local hit feedback): someone lying on the floor is hit
  // where he lies (the server's hitboxes: crawling, or a corpse on its back), not where he would stand
  lying: r => st.down.has(r.id) || st.pdMates.has(r.id),
  ray: (r, o, d, maxT) => rayLying(o, d, r.p, r.yaw, st.down.has(r.id) ? 'down' : r.c ? 'deadLow' : 'dead', maxT),
  // after the camera is placed: lying on the floor (and getting up), or a slow sway while down
  camera(cam) {
    st.cam = cam;
    if (!A.me.alive) return;
    const now = performance.now();
    const lying = st.pd ? 1 : now < st.riseUntil ? smooth((st.riseUntil - now) / (BODY.rise * 1000)) : 0;
    if (lying > 0 && st.pdP) {
      const len = st.pdLow ? 0.7 : 1.45;
      const at = [st.pdP[0] + Math.sin(st.pdYaw) * len, st.pdP[1] + BODY.deadEye, st.pdP[2] + Math.cos(st.pdYaw) * len];
      cam.position.x += (at[0] - cam.position.x) * lying;
      cam.position.y += (at[1] - cam.position.y) * lying;
      cam.position.z += (at[2] - cam.position.z) * lying;
    } else if (st.downed) cam.rotation.z += 0.06 * Math.sin(now / 700);
    else return;
    cam.updateMatrixWorld();
  },
};
