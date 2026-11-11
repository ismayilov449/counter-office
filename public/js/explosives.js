// Explosives (ROADMAP group 7), the browser's side (rules in shared/explosives.js; server: lib/explosives.js).
// main.js calls in at a few hooks marked "explosives:".
// 7.1 the E hint over an HE grenade by our feet, the grenade in our hand (a countdown; Mouse1 throws it back).
import { XP } from '/shared/explosives.js';

let C = null; // from main.js: { me, net, hud, fx, audio, coll(), eyePos(), aimDir(yaw, pitch), busy() }
let hot = null; // the grenade in our hand: { until (performance.now() ms) }

const flat3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function initExplosives(ctx) {
  C = ctx;
  // Over everything but a gadget, the drone or a trunk (as on the server, E grabs a grenade before a revive).
  const hint0 = C.hud.hint;
  C.hud.hint = function (text) {
    return hint0.call(this, ourHint() ?? text);
  };
}

function ourHint() {
  const me = C.me;
  if (!me.alive) { hot = null; return null; }
  if (hot) {
    const left = Math.max(0, (hot.until - performance.now()) / 1000);
    return `GRENADE IN YOUR HAND: CLICK TO THROW IT BACK! (${left.toFixed(1)} s)`;
  }
  if (me.act || me.driving != null || me.riding || C.busy()) return null;
  return grabbable() ? 'Press E to grab the grenade and throw it back!' : null;
}

// An HE grenade (as we draw it) by our feet with enough fuse left.
function grabbable() {
  for (const n of C.fx.nades) {
    if (n.xpK !== 'he' || n.fuse - n.t < XP.grabLeft + 0.05) continue;
    const p = n.mesh.position;
    if (flat3([p.x, p.y, p.z], C.me.p) < XP.reach - 0.1) return n;
  }
  return null;
}

// main.js's nade handler: tag the grenade fx.nade just made with its id and kind.
export function tagNade(m) {
  const n = C.fx.nades[C.fx.nades.length - 1];
  if (n) { n.xpId = m.id; n.xpK = m.k; }
}

// Mouse1 while the grenade is in our hand: throw it (as a strong throw). True when it took the click.
export function throwBack() {
  if (!hot || !C.me.alive) return false;
  const me = C.me, o = C.eyePos(), d = C.aimDir(me.yaw, me.pitch + 0.08);
  const k = C.coll().raycast(o, d, 0.6, 'move') ? 0 : 0.4;
  const v = [d[0] * 21 + me.v[0] * 0.5, d[1] * 21 + 1.5 + me.v[1] * 0.3, d[2] * 21 + me.v[2] * 0.5];
  C.net.send({ t: 'xpThrow', o: [o[0] + d[0] * k, o[1] + d[1] * k - 0.1, o[2] + d[2] * k], v });
  C.audio.play('throw');
  me.swing = 1;
  hot = null;
  return true;
}

export const handlers = {
  // somebody picked a grenade up: it's gone from the floor
  xpGrab(m) {
    const i = C.fx.nades.findIndex(n => n.xpId === m.id);
    if (i < 0) return;
    C.fx.nades[i].mesh.parent?.remove(C.fx.nades[i].mesh);
    C.fx.nades.splice(i, 1);
    if (m.by === C.me.id) C.audio.play('pin');
  },
  // the grenade in our hand (ms left), or ms 0: not any more
  xpHot(m) {
    hot = m.ms > 0 ? { until: performance.now() + m.ms } : null;
  },
};
