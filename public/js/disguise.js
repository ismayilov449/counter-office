// Disguise (browser side). The server does the fooling: the other team's snapshots show a disguised player as the dead
// player whose uniform they wear (their id, so their model, colours and name tag), so nothing here runs for them and
// nothing they get says "disguised". This file is for the wearer and their team (the snapshot's "dg" part):
// - the wearer: a badge on the HUD, the enemy's sleeves on the first-person arms, the hint and progress bar;
// - teammates: a small mask marker over a disguised teammate's head;
// - everyone near: the cloth rustling while someone changes, and the reveal (a sting and a HUD message).
// main.js calls: init, onSnapshot (after the snapshot's players), hint, look (view model), watchable (spectating), and
// the message handlers (disguiseOn / disguiseOff / disguiseFx).
import * as THREE from 'three';
import { audio } from './audio.js';
import { TEAM_NAME, TEAM_COLOR, esc } from './hud.js';
import { DISGUISE, DISGUISE_WHY, DISGUISE_THEY, disguiseAllowed } from '/shared/disguise.js';

let api = null; // { me, game, remotes, hud, refreshViewModel }
let mine = null; // { as, look } while I wear a uniform
let used = [], stripped = [];
const marked = new Map(); // teammate id -> { model, sprite }
const markMats = {};
let badge = null;
const rustles = new Map(); // n -> { g, until }

const lookOf = code => (code === 1 ? 'T' : 'CT');

// ---- the marker over a disguised teammate: a dark pill with a mask in the colour of the uniform they wear
function markerMat(look) {
  if (markMats[look]) return markMats[look];
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.beginPath();
  g.moveTo(32, 6); g.lineTo(96, 6); g.arc(96, 32, 26, -Math.PI / 2, Math.PI / 2); g.lineTo(32, 58); g.arc(32, 32, 26, Math.PI / 2, Math.PI * 1.5);
  g.fill();
  // the mask: a band with two eye holes
  g.fillStyle = TEAM_COLOR[look];
  g.beginPath();
  g.moveTo(26, 24); g.quadraticCurveTo(64, 10, 102, 24); g.quadraticCurveTo(106, 44, 84, 46); g.quadraticCurveTo(70, 46, 64, 38);
  g.quadraticCurveTo(58, 46, 44, 46); g.quadraticCurveTo(22, 44, 26, 24);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.85)';
  for (const x of [46, 82]) { g.beginPath(); g.ellipse(x, 31, 9, 6, 0, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  markMats[look] = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
  return markMats[look];
}

function makeMarker(look) {
  const s = new THREE.Sprite(markerMat(look));
  s.scale.set(0.5, 0.25, 1);
  s.position.y = 2.42; // just over the name tag
  return s;
}

// ---- the wearer's badge on the HUD
function showBadge() {
  const on = !!mine && api.me.alive;
  if (!badge) {
    if (!on) return;
    badge = document.createElement('div');
    badge.style.cssText = 'position:absolute;bottom:70px;left:50%;transform:translateX(-50%);background:rgba(20,10,30,0.65);' +
      'border:1px solid rgba(200,162,255,0.6);color:#e6d8ff;padding:4px 12px;border-radius:3px;font-size:13px;white-space:nowrap;pointer-events:none';
    (document.getElementById('hud') || document.body).appendChild(badge);
  }
  badge.style.display = on ? '' : 'none';
  if (on) badge.innerHTML = `<b>DISGUISED</b> · ${esc(mine.as)}'s uniform — the ${TEAM_NAME[mine.look]} take you for one of them`;
}

// ---- sounds, made on the game's own audio graph (audio.out gives a node; its context is the game's)
let noiseBuf = null;
function outAt(pos) {
  const master = audio.out(null);
  if (!master || master.context.state !== 'running') return null;
  return audio.out(pos);
}
function noiseOf(ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
function scratch(dest, t0, dur, freq, gain, type = 'bandpass', q = 1.2) {
  const ctx = dest.context, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseOf(ctx);
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random() * 0.8);
  src.stop(t0 + dur + 0.05);
}
function tone(dest, t0, dur, f0, f1, gain, type = 'sawtooth') {
  const ctx = dest.context, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
// cloth rustling for the 3 s of changing (stopped early when it's cancelled)
function startRustle(n, pos) {
  const out = outAt(pos);
  if (!out) return;
  const ctx = out.context, g = ctx.createGain(), t = ctx.currentTime;
  g.gain.value = 1;
  g.connect(out);
  for (let s = 0.05; s < DISGUISE.take; s += 0.08 + Math.random() * 0.17) {
    scratch(g, t + s, 0.08 + Math.random() * 0.16, 1200 + Math.random() * 2600, 0.12 + Math.random() * 0.25);
  }
  rustles.set(n, { g, until: performance.now() + DISGUISE.take * 1000 + 200 });
}
function stopRustle(n) {
  const r = rustles.get(n);
  if (!r) return;
  rustles.delete(n);
  const t = r.g.context.currentTime;
  r.g.gain.setTargetAtTime(0.0001, t, 0.04);
  setTimeout(() => r.g.disconnect(), 400);
}
// the uniform is on: a zip and a low thump
function playOn() {
  const out = outAt(null);
  if (!out) return;
  const t = out.context.currentTime;
  scratch(out, t, 0.35, 2600, 0.35, 'highpass', 0.7);
  tone(out, t + 0.05, 0.4, 110, 70, 0.25, 'sine');
}
// found out: a sharp dissonant sting and a rip
function playReveal(pos) {
  const out = outAt(pos);
  if (!out) return;
  const t = out.context.currentTime;
  tone(out, t, 0.7, 880, 300, 0.18);
  tone(out, t, 0.7, 932, 318, 0.16);
  tone(out, t, 0.5, 220, 110, 0.25, 'square');
  scratch(out, t, 0.3, 3000, 0.5, 'highpass', 0.6);
}

// The body under (or next to) us that we could take a uniform from: a dead enemy not blown apart and not stripped.
function nearestBody() {
  const me = api.me;
  let best = null, bd = DISGUISE.reach;
  for (const r of api.remotes.values()) {
    if (r.alive || r.team === me.team || r.model.userData.gibAll || stripped.includes(r.id) || !r.buf.length) continue;
    const d = Math.hypot(r.p[0] - me.p[0], r.p[2] - me.p[2]);
    if (d < bd && Math.abs(r.p[1] - me.p[1]) < DISGUISE.reachY) { bd = d; best = r; }
  }
  return best;
}

export const disguise = {
  init(a) { api = a; },

  // the uniform on my own first-person arms
  look() { return mine && api?.me.alive ? mine.look : null; },

  // Spectating: not someone the scoreboard lists as dead (in a classic round only the other team's disguised player can
  // look like that, and you mustn't watch through their eyes).
  watchable(id) {
    const g = api.game;
    if (g.cfg.gameMode !== 'classic' || g.phase === 'warmup') return true;
    return g.roster.find(q => q.id === id)?.alive !== false;
  },

  // After the snapshot's players are in: our team's disguised players, used uniforms and stripped bodies.
  onSnapshot(dg) {
    const me = api.me, list = dg?.d || [];
    used = dg?.u || [];
    stripped = dg?.s || [];
    const own = list.find(e => e[0] === me.id);
    const look = own ? lookOf(own[3]) : null;
    if ((mine ? mine.look : null) !== look) { mine = own ? { as: own[2], look } : null; api.refreshViewModel(); }
    showBadge();
    const want = new Set();
    for (const [id, , , code] of list) {
      if (id === me.id) continue;
      const r = api.remotes.get(id);
      if (!r) continue;
      want.add(id);
      let mk = marked.get(id);
      if (!mk || mk.model !== r.model) {
        if (mk) mk.model.remove(mk.sprite);
        mk = { model: r.model, sprite: makeMarker(lookOf(code)) };
        r.model.add(mk.sprite);
        marked.set(id, mk);
      }
      mk.sprite.visible = r.alive;
    }
    for (const [id, mk] of marked) if (!want.has(id)) { mk.model.remove(mk.sprite); marked.delete(id); }
    // A body that lies down metres from where it last stood (a disguise ending in the other team's view: the dead
    // player's entry goes back to their body) is put straight there, lying, instead of sliding over.
    for (const r of api.remotes.values()) {
      const b = r.buf, n = b.length;
      if (n < 2 || b[n - 1].alive || !b[n - 2].alive) continue;
      const p = b[n - 1].p, q = b[n - 2].p;
      if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 2.5) { r.buf = [b[n - 1]]; r.lastP = null; r.deadT = 1; }
    }
    if (rustles.size) { const t = performance.now(); for (const [n, r] of rustles) if (t > r.until) stopRustle(n); }
  },

  // The hint line: crouched over a dead enemy (unless E does something that comes first here: busy()).
  hint(hint, busy) {
    const me = api.me, game = api.game;
    if (mine || !me.alive || me.act || me.driving != null || me.riding || me.mortar || me.drone) return hint;
    if (!disguiseAllowed(game.cfg.gameMode, game.phase) || used.includes(me.id)) return hint;
    const body = nearestBody();
    if (!body || busy()) return hint;
    if (me.crouch) return `Hold E to put on ${body.name}'s uniform (${DISGUISE.take} s — stay crouched and still)`;
    return hint ? `${hint} · crouch + hold E for ${body.name}'s uniform` : `Crouch and hold E to put on ${body.name}'s uniform`;
  },

  progressLabel() { return 'Putting on the uniform...'; },

  handlers: {
    disguiseOn(m) {
      if (m.you) {
        mine = { as: m.as, look: m.look };
        api.refreshViewModel();
        showBadge();
        api.hud.center('DISGUISED', `You wear ${m.as}'s uniform: the ${TEAM_NAME[m.look]} take you for ${m.as}. Shooting, knifing, grenades, the bomb or going within ${DISGUISE.recognise} m of them gives you away.`, 5, '#c8a2ff');
        playOn();
      } else {
        api.hud.small(`${m.name} is wearing ${m.as}'s uniform — the ${TEAM_NAME[m.look]} take them for ${m.as}`, 4);
      }
    },
    disguiseOff(m) {
      if (m.you) {
        mine = null;
        api.refreshViewModel();
        showBadge();
        if (m.why === 'gone') api.hud.small(`The uniform is no use any more: ${DISGUISE_WHY.gone}`, 4);
        else {
          api.hud.center('DISGUISE BLOWN', `They know who you are: ${DISGUISE_WHY[m.why] || ''}`, 3, '#ff5a50');
          playReveal(null);
        }
      } else if (m.mate) {
        api.hud.small(`${m.name}'s disguise is blown`, 3);
      } else {
        api.hud.center(`IMPOSTOR: ${m.name}`, `${m.name} was wearing ${m.as}'s uniform — and ${DISGUISE_THEY[m.why] || 'was found out'}`, 3, '#ff5a50');
        playReveal(m.p);
      }
    },
    disguiseFx(m) {
      if (m.k === 'start') startRustle(m.n, m.p);
      else {
        stopRustle(m.n);
        if (m.k === 'done') { const out = outAt(m.p); if (out) scratch(out, out.context.currentTime, 0.3, 2400, 0.25, 'highpass', 0.7); }
      }
    },
  },
};
