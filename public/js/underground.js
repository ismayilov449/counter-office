// Underground & vents in the browser (cs_mansion, cs_mansion_night; see shared/underground.js and lib/underground.js).
//   1. No radar underground: down there the radar shows static ("NO SIGNAL", main.js passes noSignal() to hud.radar
//      like a jammer), a ping or a target call says why it can't (blocked()), and the first time you go down a short
//      message says so.
//   2. Echo: a shot (shot()) or a blast (boom()) underground: above ground, wherever you are, a muffled boom from below
//      that rolls on (only the lows get through the floors: a low-passed thump into a feedback delay); underground a
//      ringing echo along the tunnels on top of the shot itself. Two buses made once (cheap per shot: a burst and a
//      tone into a bus), at most one echo per UG.echo.gap seconds, so a spraying rifle is one rolling rumble.
// main.js calls init() once, setMap() on every map load and update() every frame.
import { UG, isUnderground, undergroundMap } from '/shared/underground.js';
import { WEAPONS } from '/shared/weapons.js';
import { audio, floodKit } from './audio.js';

let D = null; // what it needs from main.js (see init)
let map = null, on = false;
let wasUnder = false, toldAt = -1e9;
const ear = [0, 0, 0]; // where we hear from (the camera)
const BLOCKED = 'No signal underground — no radar, pings or target calls down here';

// deps: { scene, net, me, hud, fx, coll(), indoors(p) }
export function init(deps) {
  D = deps;
}

export function setMap(m) {
  map = m;
  on = undergroundMap(m);
  wasUnder = false;
  toldAt = -1e9;
}

const under = p => on && isUnderground(map, p);
// Our radar has no signal: we're alive and underground.
export const noSignal = () => !!(D && D.me.alive && D.me.team !== 'SPEC' && under(D.me.p));
// A ping or a target call from underground: says why not (true: don't send it).
export function blocked() {
  if (!noSignal()) return false;
  D.hud.small(BLOCKED, 2);
  return true;
}

// ---------------------------------------------------------------- 2. the echo
// (the M4A1 is always heard with its silencer on: see main.js's 'shot')
const SUPPRESSED = new Set(['usp', 'tmp', 'm4a1', 'm4a1s']);
const LOUD = { pistol: 0.7, smg: 0.75, rifle: 1, mg: 1.05, shotgun: 1.2, sniper: 1.25, launcher: 1.2 };
const BLAST = { he: 1, c4: 1.6, rpg: 1.3, rpg26: 1.1, mortar: 1.5, satchel: 1.4, drone: 1.2, dronebomb: 1, car: 1.4, pmn: 0.9, mon50: 1, flash: 0.45, molotov: 0.4 };
let bus = null, lastEcho = -1, echoes = 0;

// The two buses, made once per audio context.
function buses(kit) {
  if (bus && bus.ctx === kit.ctx) return bus;
  const { ctx } = kit, out = audio.out(null);
  const node = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  // from below: a low-pass (laptop speakers play little under ~150 Hz, so it keeps up to ~450 Hz), the dry boom, and
  // a feedback delay that darkens each time round (the boom rolling through the cellar and the tunnels)
  const below = gain(1), lp = node('lowpass', 450, 0.5), dl = ctx.createDelay(1), fb = gain(0.5), damp = node('lowpass', 300, 0.5);
  dl.delayTime.value = 0.23;
  below.connect(lp);
  lp.connect(gain(0.85)).connect(out);
  lp.connect(dl); dl.connect(damp); damp.connect(fb).connect(dl);
  damp.connect(gain(0.75)).connect(out);
  // in the tunnels: band-passed slap-backs that keep coming back, and a second, later one
  const tunnel = gain(1), bp = node('bandpass', 1100, 0.6), d1 = ctx.createDelay(1), d2 = ctx.createDelay(1), fb1 = gain(0.45), damp1 = node('lowpass', 1800, 0.5);
  d1.delayTime.value = 0.14; d2.delayTime.value = 0.31;
  tunnel.connect(bp);
  bp.connect(d1); d1.connect(damp1); damp1.connect(fb1).connect(d1);
  damp1.connect(gain(0.8)).connect(out);
  bp.connect(d2); d2.connect(gain(0.45)).connect(out);
  bus = { ctx, below, tunnel };
  return bus;
}

// One echo of loudness g (1: a rifle) from a sound underground at `from`.
function echo(from, g, long) {
  const kit = D?.kit ? D.kit() : floodKit(); // (tests pass their own kit)
  if (!kit) return false;
  const b = buses(kit), t = kit.ctx.currentTime;
  if (t - lastEcho < UG.echo.gap && !long) return false;
  lastEcho = t;
  echoes++;
  if (!under(ear)) {
    // above ground: a muffled boom from below (whatever the distance)
    const k = UG.echo.gain * g;
    kit.tone(b.below, t, { freq: long ? 95 : 130, freqEnd: 45, dur: long ? 0.9 : 0.4, gain: k * 0.8 });
    kit.burst(b.below, t, { dur: long ? 0.8 : 0.28, type: 'lowpass', freq: 650, freqEnd: 140, gain: k });
  } else {
    // down there: it rings along the tunnels (less, further away; never gone)
    const d = Math.hypot(from[0] - ear[0], from[1] - ear[1], from[2] - ear[2]);
    const k = UG.echo.gain * g * (0.35 + 0.65 / (1 + d / 12));
    kit.burst(b.tunnel, t, { dur: long ? 0.35 : 0.12, type: 'bandpass', freq: 1500, freqEnd: 500, q: 0.7, gain: k });
    kit.tone(b.below, t, { freq: 110, freqEnd: 50, dur: long ? 0.7 : 0.25, gain: k * 0.5 });
  }
  return true;
}

// A shot (any player's, ours too) from `o` with weapon w: its echo if it was fired underground.
export function shot(o, w) {
  if (!on || !o || !under(o)) return false;
  const def = WEAPONS[w];
  if (!def || def.melee) return false;
  const g = SUPPRESSED.has(w) ? UG.echo.suppressed : LOUD[def.cls] ?? 1;
  return echo(o, g, false);
}

// A blast at p of kind k: its echo if it went off underground (a smoke grenade makes none).
export function boom(p, k) {
  if (!on || !p || !under(p) || !(k in BLAST)) return false;
  return echo(p, UG.echo.blast * BLAST[k], true);
}

export function update(dt, now, camera) {
  if (!D || !on) return;
  if (camera) { ear[0] = camera.position.x; ear[1] = camera.position.y; ear[2] = camera.position.z; }
  // going down: once, a short word about the radar (again only after a while above ground)
  const u = noSignal();
  if (u && !wasUnder && now - toldAt > 60000) { D.hud.small('Underground: no radar signal down here — listen', 3); toldAt = now; }
  wasUnder = u;
}

// (tests)
export const debug = () => ({ on, echoes, ear: ear.slice(), under: under(ear), bus });
