// Effects are synthesized with WebAudio; the CS 1.6 voice lines (round start, bomb, win, "Fire in the hole") are mp3s in /sounds.
import { WEAPONS } from '/shared/weapons.js';

let ctx = null, master = null, noise = null, reverb = null;

const VOICES = ['bombdef', 'bombpl', 'com_go', 'ctwin', 'terwin', 'ct_fireinhole', 'go', 'letsgo', 'locknload', 'moveout'];
const voiceBuf = new Map();
let voiceSrc = null;
const listenerPos = { x: 0, y: 0, z: 0 };
// What the audio thread was last told (see listener).
const heard = { x: 1e9, y: 0, z: 0, fx: 0, fy: 0, fz: 0, at: 0 };

// Gunshots are layered: a sharp supersonic crack, a distorted mid "body", a low boom, the action cycling
// and an echo tail. crack/body/boom are frequencies (Hz), dur the body length (s), tail the echo amount.
const GUN = {
  glock: { crack: 5200, body: 1500, boom: 150, dur: 0.11, gain: 0.7, tail: 0.25 },
  usp: { suppressed: true, body: 1250, gain: 0.55 },
  p228: { crack: 4800, body: 1350, boom: 140, dur: 0.12, gain: 0.75, tail: 0.28 },
  deagle: { crack: 3600, body: 900, boom: 85, dur: 0.24, gain: 1.15, tail: 0.6 },
  fiveseven: { crack: 6000, body: 1700, boom: 160, dur: 0.1, gain: 0.65, tail: 0.25 },
  elite: { crack: 5000, body: 1450, boom: 145, dur: 0.11, gain: 0.72, tail: 0.27 },
  m3: { crack: 2600, body: 650, boom: 70, dur: 0.3, gain: 1.3, tail: 0.65, after: 'pump' },
  xm1014: { crack: 2800, body: 700, boom: 75, dur: 0.26, gain: 1.2, tail: 0.55 },
  mac10: { crack: 5200, body: 1600, boom: 160, dur: 0.07, gain: 0.6, tail: 0.2 },
  tmp: { suppressed: true, body: 1500, gain: 0.45 },
  mp5: { crack: 5400, body: 1500, boom: 155, dur: 0.08, gain: 0.6, tail: 0.22 },
  ump45: { crack: 4400, body: 1150, boom: 120, dur: 0.1, gain: 0.7, tail: 0.3 },
  p90: { crack: 6200, body: 1800, boom: 170, dur: 0.07, gain: 0.55, tail: 0.2 },
  galil: { crack: 4000, body: 1100, boom: 105, dur: 0.14, gain: 0.9, tail: 0.42 },
  famas: { crack: 4300, body: 1200, boom: 115, dur: 0.12, gain: 0.85, tail: 0.4 },
  ak47: { crack: 3400, body: 950, boom: 95, dur: 0.16, gain: 1.0, tail: 0.5 },
  m4a1: { crack: 4100, body: 1150, boom: 110, dur: 0.13, gain: 0.88, tail: 0.42 },
  m4a1s: { suppressed: true, body: 1050, gain: 0.5 },
  sg552: { crack: 3800, body: 1050, boom: 100, dur: 0.14, gain: 0.92, tail: 0.45 },
  aug: { crack: 4000, body: 1100, boom: 105, dur: 0.13, gain: 0.9, tail: 0.44 },
  scout: { crack: 3000, body: 800, boom: 80, dur: 0.28, gain: 1.15, tail: 0.75, after: 'bolt' },
  g3sg1: { crack: 3000, body: 850, boom: 82, dur: 0.22, gain: 1.12, tail: 0.65 },
  sg550: { crack: 3400, body: 950, boom: 92, dur: 0.18, gain: 1.02, tail: 0.55 },
  pkt: { crack: 3200, body: 900, boom: 88, dur: 0.15, gain: 1.0, tail: 0.5 },
  rpg: { launcher: true },
  rpg26: { launcher: true },
  awp: { crack: 2400, body: 600, boom: 58, dur: 0.42, gain: 1.45, tail: 1.0, after: 'bolt' },
  m249: { crack: 3600, body: 1000, boom: 95, dur: 0.14, gain: 0.95, tail: 0.45 },
};

// A soft-clipping curve that gives gunshots their punch.
let driveCurve = null;
function drive() {
  if (!driveCurve) {
    driveCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; driveCurve[i] = Math.tanh(x * 4) * 0.9; }
  }
  const w = ctx.createWaveShaper();
  w.curve = driveCurve;
  return w;
}

// Outdoor echo: decaying noise as a convolution impulse.
function makeReverb() {
  const len = Math.floor(ctx.sampleRate * 1.6);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      // a couple of discrete slap-backs off walls, then a diffuse tail
      const slap = (Math.abs(t - 0.09 - ch * 0.013) < 0.004 ? 0.5 : 0) + (Math.abs(t - 0.23 - ch * 0.02) < 0.005 ? 0.3 : 0);
      d[i] = ((Math.random() * 2 - 1) * Math.exp(-t * 3.2) * 0.5 + slap * (Math.random() * 2 - 1)) * (t < 0.02 ? t / 0.02 : 1);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  conv.connect(lp).connect(master);
  return conv;
}

function gunshot(out, t, s, dist) {
  // Distant shots lose their highs and keep more echo.
  const bus = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.max(1200, 16000 / (1 + dist / 18));
  bus.connect(lp).connect(out);
  if (reverb) {
    const send = ctx.createGain();
    send.gain.value = (s.tail ?? 0.15) * 0.7 / (1 + dist / 25);
    bus.connect(send).connect(reverb);
  }
  const g = s.gain;
  if (s.suppressed) {
    burst(bus, t, { dur: 0.08, type: 'bandpass', freq: s.body, freqEnd: s.body * 0.6, q: 1.4, gain: g * 1.1 });
    burst(bus, t, { dur: 0.025, type: 'highpass', freq: 4500, gain: g * 0.6 });
    tone(bus, t, { freq: 210, freqEnd: 70, dur: 0.07, gain: g * 0.5 });
    tone(bus, t + 0.025, { freq: 2900, dur: 0.012, type: 'square', gain: 0.05 });
    return;
  }
  burst(bus, t, { dur: 0.018, type: 'highpass', freq: s.crack, gain: g * 1.8 });
  const sh = drive();
  sh.connect(bus);
  burst(sh, t, { dur: s.dur, type: 'bandpass', freq: s.body, freqEnd: s.body * 0.45, q: 0.8, gain: g * 1.5 });
  burst(bus, t + 0.004, { dur: s.dur * 1.8, freq: s.body * 1.4, freqEnd: 220, gain: g * 0.55 });
  tone(bus, t, { freq: s.boom, freqEnd: 32, dur: s.dur * 1.5, gain: g * 0.95 });
  tone(bus, t, { freq: s.boom * 2.1, freqEnd: 60, dur: s.dur * 0.6, type: 'triangle', gain: g * 0.3 });
  // action cycling
  tone(bus, t + 0.028, { freq: 3100 + Math.random() * 400, dur: 0.012, type: 'square', gain: 0.045 });
}

// ---- reload foley, built from small mechanical events
const fol = {
  magOut(o, t) { tone(o, t, { freq: 2300, dur: 0.015, type: 'square', gain: 0.09 }); burst(o, t + 0.02, { dur: 0.13, type: 'bandpass', freq: 2600, freqEnd: 1400, q: 1.5, gain: 0.28 }); },
  magIn(o, t) { burst(o, t, { dur: 0.07, freq: 800, gain: 0.55 }); tone(o, t + 0.035, { freq: 1700, dur: 0.02, type: 'square', gain: 0.12 }); tone(o, t, { freq: 160, freqEnd: 90, dur: 0.06, gain: 0.25 }); },
  boltBack(o, t) { burst(o, t, { dur: 0.09, type: 'bandpass', freq: 3200, freqEnd: 1600, q: 2, gain: 0.35 }); tone(o, t + 0.08, { freq: 2100, dur: 0.015, type: 'square', gain: 0.1 }); },
  boltFwd(o, t) { burst(o, t, { dur: 0.04, type: 'highpass', freq: 2200, gain: 0.65 }); tone(o, t, { freq: 950, freqEnd: 600, dur: 0.06, type: 'triangle', gain: 0.25 }); },
  slide(o, t) { burst(o, t, { dur: 0.05, type: 'bandpass', freq: 3000, q: 2, gain: 0.35 }); burst(o, t + 0.06, { dur: 0.035, type: 'highpass', freq: 2500, gain: 0.6 }); tone(o, t + 0.06, { freq: 1200, freqEnd: 800, dur: 0.05, type: 'triangle', gain: 0.2 }); },
  shell(o, t) { tone(o, t, { freq: 1500, dur: 0.02, type: 'square', gain: 0.08 }); burst(o, t + 0.02, { dur: 0.06, freq: 1100, gain: 0.35 }); },
  pump(o, t) { burst(o, t, { dur: 0.09, type: 'bandpass', freq: 1700, freqEnd: 1100, q: 1.2, gain: 0.5 }); burst(o, t + 0.16, { dur: 0.08, type: 'bandpass', freq: 1300, freqEnd: 2000, q: 1.2, gain: 0.55 }); tone(o, t + 0.24, { freq: 700, dur: 0.04, type: 'triangle', gain: 0.25 }); },
  rattle(o, t) { for (let i = 0; i < 6; i++) tone(o, t + i * 0.035, { freq: 2600 + Math.random() * 1200, dur: 0.015, type: 'square', gain: 0.05 }); },
  clank(o, t) { burst(o, t, { dur: 0.06, freq: 1400, gain: 0.45 }); tone(o, t, { freq: 620, freqEnd: 480, dur: 0.12, type: 'triangle', gain: 0.18 }); },
};

function reloadFoley(o, t, id) {
  const def = WEAPONS[id] || { reload: 2.5, cls: 'rifle' };
  const d = def.reload, at = f => t + d * f;
  switch (def.autoSniper ? 'rifle' : def.cls) {
    case 'pistol':
      if (id === 'elite') { fol.magOut(o, at(0.1)); fol.magOut(o, at(0.18)); fol.magIn(o, at(0.48)); fol.magIn(o, at(0.62)); fol.slide(o, at(0.82)); fol.slide(o, at(0.9)); }
      else { fol.magOut(o, at(0.15)); fol.magIn(o, at(0.55)); fol.slide(o, at(0.8)); }
      break;
    case 'shotgun': {
      const n = 4;
      for (let i = 0; i < n; i++) fol.shell(o, at(0.12 + (i * 0.6) / n));
      fol.pump(o, at(0.8));
      break;
    }
    case 'sniper':
      fol.boltBack(o, at(0.08)); fol.magOut(o, at(0.3)); fol.magIn(o, at(0.6)); fol.boltFwd(o, at(0.85));
      break;
    case 'mg':
      fol.clank(o, at(0.12)); fol.magOut(o, at(0.28)); fol.magIn(o, at(0.52)); fol.rattle(o, at(0.66)); fol.clank(o, at(0.84));
      break;
    default:
      fol.magOut(o, at(0.18)); fol.magIn(o, at(0.55)); fol.boltBack(o, at(0.74)); fol.boltFwd(o, at(0.82));
  }
}

let voice = null;
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  voice = voices.find(v => /en[-_](US|GB)/i.test(v.lang) && /male|david|mark|george|daniel/i.test(v.name)) ||
    voices.find(v => /^en/i.test(v.lang)) || null;
}
if (window.speechSynthesis) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

function burst(dest, t0, { dur, type = 'lowpass', freq = 2000, freqEnd, q = 0.7, gain = 1 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.85 + Math.random() * 0.3;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.05);
}

function tone(dest, t0, { freq, freqEnd, dur, type = 'sine', gain = 0.3 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// ---- the 82-BM-37's shells
// Sounds that carry across the map: [refDistance, rolloff] for their panner instead of the usual 3 m / 1.1.
const FAR = { creak: [9, 0.7], roller: [9, 0.7], dronedive: [10, 0.7], dronedown: [6, 0.9], dronehit: [6, 0.9], mortarfire: [15, 0.7], whistle: [25, 0.45], mortarboom: [14, 0.5], rpgboom: [14, 0.5], c4boom: [14, 0.5], heboom: [10, 0.6], crumble: [8, 0.8] };

// A shell coming down, like the real thing on recordings: a reedy, breathy shriek that holds high and then drops
// faster and faster (Doppler) as it comes in, fluttering with the air tearing round it; thin and far away at first,
// swelling and brightening, and in the last moment a ripping roar of air straight into the blast.
// close (0..1): how near it lands to us; a closer one is louder, lower and ends in a heavier roar.
function curve(n, fn) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1));
  return c;
}
function shellWhistle(out, t, dur, close) {
  const end = t + dur - 0.03, len = end - t;
  const hi = 1250 - close * 200, lo = 420 - close * 120;
  // pitch: slow fall at first, then quickly down at the end
  const pitch = curve(64, u => lo + (hi - lo) * (1 - Math.pow(u, 2.4)));
  // loudness: like 1 / distance, the last part rising fast
  const loud = 0.5 + close * 0.5;
  const amp = curve(64, u => loud * (0.07 + 0.93 * Math.pow(u, 2.5)));

  const bus = ctx.createGain();
  const air = ctx.createBiquadFilter(); // far away it's dull; close it's bright
  air.type = 'lowpass';
  air.frequency.setValueCurveAtTime(curve(32, u => 1400 + 9000 * Math.pow(u, 2)), t, len);
  bus.connect(air).connect(out);
  if (reverb) {
    const send = ctx.createGain();
    send.gain.value = 0.45;
    air.connect(send).connect(reverb);
  }
  const env = ctx.createGain();
  env.gain.setValueCurveAtTime(amp, t, len);
  env.connect(bus);

  // the flutter: random fast wobbles of loudness from the turbulence
  const flut = ctx.createBufferSource(), flp = ctx.createBiquadFilter(), fg = ctx.createGain(), fmod = ctx.createGain();
  flut.buffer = noise;
  flut.loop = true;
  flp.type = 'lowpass';
  flp.frequency.value = 45;
  fg.gain.value = 14;
  fmod.gain.value = 1;
  flut.connect(flp).connect(fg).connect(fmod.gain);
  fmod.connect(env);

  // the shriek: a reedy tone (sawtooth through a band that follows it) over a pure one
  const reed = ctx.createOscillator(), band = ctx.createBiquadFilter(), rg = ctx.createGain();
  reed.type = 'sawtooth';
  reed.frequency.setValueCurveAtTime(pitch, t, len);
  band.type = 'bandpass';
  band.Q.value = 5;
  band.frequency.setValueCurveAtTime(curve(64, u => pitch[Math.round(u * 63)] * 1.05), t, len);
  rg.gain.value = 0.55;
  reed.connect(band).connect(rg).connect(fmod);
  const pure = ctx.createOscillator(), pg = ctx.createGain();
  pure.frequency.setValueCurveAtTime(pitch, t, len);
  pg.gain.value = 0.35;
  pure.connect(pg).connect(fmod);
  // breath: air hissing in a wider band around the tone
  const hiss = ctx.createBufferSource(), hb = ctx.createBiquadFilter(), hg = ctx.createGain();
  hiss.buffer = noise;
  hiss.loop = true;
  hb.type = 'bandpass';
  hb.Q.value = 2.2;
  hb.frequency.setValueCurveAtTime(curve(64, u => pitch[Math.round(u * 63)] * 1.4), t, len);
  hg.gain.value = 1.1;
  hiss.connect(hb).connect(hg).connect(fmod);

  // the last moment: a ripping roar of air and a low rush, straight into the impact
  const rip = Math.min(0.75, len * 0.3), r0 = end - rip;
  const roar = ctx.createBufferSource(), rlp = ctx.createBiquadFilter(), rgn = ctx.createGain();
  roar.buffer = noise;
  roar.loop = true;
  rlp.type = 'lowpass';
  rlp.frequency.setValueAtTime(400, r0);
  rlp.frequency.exponentialRampToValueAtTime(4500, end);
  rgn.gain.setValueAtTime(0.0001, r0);
  rgn.gain.exponentialRampToValueAtTime(0.5 + close * 0.9, end);
  rgn.gain.linearRampToValueAtTime(0, end + 0.02);
  roar.connect(rlp).connect(rgn).connect(bus);
  const rush = ctx.createOscillator(), rug = ctx.createGain();
  rush.frequency.setValueAtTime(55, r0);
  rush.frequency.exponentialRampToValueAtTime(90, end);
  rug.gain.setValueAtTime(0.0001, r0);
  rug.gain.exponentialRampToValueAtTime(0.25 + close * 0.6, end);
  rug.gain.linearRampToValueAtTime(0, end + 0.02);
  rush.connect(rug).connect(bus);

  for (const src of [flut, reed, pure, hiss]) { src.start(t); src.stop(end + 0.05); }
  for (const src of [roar, rush]) { src.start(r0); src.stop(end + 0.05); }
}

// Long low noise (looped, so it can last seconds): rumble and rolling thunder.
function rumble(dest, t0, { dur, freq, freqEnd, gain, attack = 0.02, q = 0.7 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.playbackRate.value = 0.6 + Math.random() * 0.2;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.05);
}

// The shell landing, a huge BOOOOOM: a sharp crack, a pressure thump in the chest, a deep distorted blast and a
// sub-bass that takes seconds to die, thunder rolling back off walls and hills, and dirt and stones raining down.
// All through a limiter, so it's as loud as it can be without breaking up. s (0..1): its size; a smaller one
// (an HE grenade) is a little sharper and higher, and its tail and echoes shorter.
function shellBlast(out, t, s = 1) {
  const up = (1 - s) * 40; // smaller blasts sit higher
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -8;
  lim.knee.value = 6;
  lim.ratio.value = 12;
  lim.attack.value = 0.002;
  lim.release.value = 0.4;
  const bus = ctx.createGain();
  bus.gain.value = 1.6;
  bus.connect(lim).connect(out);
  if (reverb) {
    const send = ctx.createGain();
    send.gain.value = 1.3;
    lim.connect(send).connect(reverb);
  }
  const sh = drive();
  sh.connect(bus);
  // the crack and the pressure thump
  burst(bus, t, { dur: 0.07, type: 'highpass', freq: 1800, gain: 2.2 });
  tone(bus, t, { freq: 85 + up, freqEnd: 24 + up / 3, dur: 0.6, gain: 2.4 });
  // the blast itself, torn and distorted
  rumble(sh, t, { dur: 0.4 + 2.2 * s, freq: 1600 + up * 20, freqEnd: 45 + up, gain: 3.0, attack: 0.008 });
  tone(sh, t, { freq: 130 + up, freqEnd: 28 + up / 2, dur: 0.4 + 0.8 * s, type: 'triangle', gain: 1.0 });
  // BOOOOOM: two deep tones slowly falling and beating against each other, dying away over seconds
  tone(bus, t + 0.02, { freq: 46 + up, freqEnd: 15 + up / 2, dur: 5.5 * s, gain: 2.0 * s });
  tone(bus, t + 0.02, { freq: 51 + up, freqEnd: 17 + up / 2, dur: 4.5 * s, gain: 1.3 * s });
  rumble(bus, t + 0.05, { dur: 6.5 * s, freq: 260 + up * 3, freqEnd: 35, gain: 1.6 * s, attack: 0.25 * s });
  // thunder rolling back from far walls, each echo later, lower and softer
  for (const [dt, g, fr] of [[0.45, 1.0, 420], [1.1, 0.75, 320], [1.9, 0.55, 240], [2.9, 0.38, 180], [4.0, 0.22, 140]]) {
    if (dt > 4.5 * s) break;
    rumble(bus, t + dt, { dur: 2.2 * s, freq: fr + up * 3, freqEnd: 40, gain: g * (0.4 + 0.6 * s), attack: 0.12 });
  }
  // debris raining down
  for (let i = 0; i < 40 * s; i++) {
    const at = t + 0.35 + Math.pow(Math.random(), 1.6) * 3.2 * s;
    burst(bus, at, { dur: 0.025 + Math.random() * 0.06, type: 'bandpass', freq: 900 + Math.random() * 3200, q: 1.5, gain: 0.06 + Math.random() * 0.12 });
  }
}

// A footstep on each kind of floor; heavy > 1 for landing from a jump.
function footstep(out, t, surface, heavy) {
  const r = Math.random();
  const g = heavy;
  switch (surface) {
    case 'sand': // gritty crunch
      burst(out, t, { dur: 0.13 * g, type: 'bandpass', freq: 1700 + r * 700, q: 0.8, gain: 0.32 * g });
      for (let i = 0; i < 3; i++) burst(out, t + Math.random() * 0.08, { dur: 0.015, type: 'highpass', freq: 3500, gain: 0.12 * g });
      break;
    case 'grass': // soft swish
      burst(out, t, { dur: 0.16 * g, type: 'bandpass', freq: 2600 + r * 900, q: 0.5, gain: 0.16 * g });
      burst(out, t, { dur: 0.06, freq: 300, gain: 0.15 * g });
      break;
    case 'wood': // hollow knock
      burst(out, t, { dur: 0.05, type: 'bandpass', freq: 900 + r * 200, q: 1.2, gain: 0.32 * g });
      tone(out, t, { freq: 190 + r * 30, freqEnd: 140, dur: 0.12 * g, type: 'triangle', gain: 0.22 * g });
      break;
    case 'metal': // ringing clank
      burst(out, t, { dur: 0.04, type: 'highpass', freq: 2500, gain: 0.3 * g });
      tone(out, t, { freq: 620 + r * 90, dur: 0.22 * g, type: 'triangle', gain: 0.08 * g });
      tone(out, t, { freq: 1490 + r * 160, dur: 0.16 * g, type: 'sine', gain: 0.05 * g });
      tone(out, t, { freq: 140, freqEnd: 90, dur: 0.1, gain: 0.18 * g });
      break;
    case 'tile': // hard heel click
      burst(out, t, { dur: 0.03, type: 'highpass', freq: 3000 + r * 1500, gain: 0.3 * g });
      burst(out, t, { dur: 0.06, freq: 700, gain: 0.2 * g });
      break;
    case 'carpet': // muffled thump
      burst(out, t, { dur: 0.09 * g, freq: 260 + r * 60, gain: 0.25 * g });
      break;
    default: // concrete / stone
      burst(out, t, { dur: 0.07 * g, freq: 450 + r * 150, gain: 0.35 * g });
      burst(out, t, { dur: 0.02, type: 'bandpass', freq: 2200 + r * 600, q: 1.5, gain: 0.1 * g });
  }
}

export const audio = {
  volume: 0.6,

  init() {
    if (ctx) { ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    reverb = makeReverb();
    for (const n of VOICES) {
      fetch(`/sounds/${n}.mp3`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b))
        .then(buf => voiceBuf.set(n, buf)).catch(() => {});
    }
  },

  // Plays a CS 1.6 voice line. A new line cuts off the previous one, like the game's radio.
  voice(name, gain = 1) {
    const buf = voiceBuf.get(name);
    if (!ctx || ctx.state !== 'running' || !buf) return false;
    if (voiceSrc) { try { voiceSrc.stop(); } catch {} }
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = gain;
    src.connect(g).connect(master);
    src.start();
    voiceSrc = src;
    src.onended = () => { if (voiceSrc === src) voiceSrc = null; };
    return true;
  },

  setVolume(v) {
    this.volume = v;
    if (master) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.value = v; }
  },

  listener(pos, fwd) {
    listenerPos.x = pos.x; listenerPos.y = pos.y; listenerPos.z = pos.z;
    if (!ctx) return;
    // Each change has to reach the audio thread, and in a fight full of sounds that wait could cost the frame several
    // milliseconds: only when you've moved or turned, at most 30 times a second.
    const now = performance.now();
    const moved = Math.abs(pos.x - heard.x) + Math.abs(pos.y - heard.y) + Math.abs(pos.z - heard.z) > 0.05 ||
      Math.abs(fwd.x - heard.fx) + Math.abs(fwd.y - heard.fy) + Math.abs(fwd.z - heard.fz) > 0.02;
    if (!moved || now - heard.at < 33) return;
    Object.assign(heard, { x: pos.x, y: pos.y, z: pos.z, fx: fwd.x, fy: fwd.y, fz: fwd.z, at: now });
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  },

  // A destination node: positional when `pos` ([x, y, z]) is given.
  // muffled: heard through the walls of a house (inside a blast outside, or the other way round)
  out(pos, [ref, roll] = [3, 1.1], muffled = false) {
    if (!pos) return master;
    let dest = master;
    if (muffled) {
      const lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass';
      lp.frequency.value = 450;
      g.gain.value = 0.7;
      lp.connect(g).connect(master);
      dest = lp;
    }
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 400;
    p.rolloffFactor = roll;
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; }
    else p.setPosition(pos[0], pos[1], pos[2]);
    p.connect(dest);
    return p;
  },

  play(name, pos = null, arg = null) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const out = this.out(pos, FAR[name], this.muffled);
    switch (name) {
      case 'shot': {
        const s = GUN[arg] || GUN.glock;
        const dist = pos ? Math.hypot(pos[0] - listenerPos.x, pos[1] - listenerPos.y, pos[2] - listenerPos.z) : 0;
        if (s.launcher) {
          // rocket launch: a hard pop and a long whoosh
          burst(out, t, { dur: 0.25, freq: 900, freqEnd: 200, gain: 1.3 });
          tone(out, t, { freq: 70, freqEnd: 30, dur: 0.35, gain: 0.9 });
          burst(out, t + 0.05, { dur: 1.2, type: 'bandpass', freq: 600, freqEnd: 2600, q: 0.7, gain: 0.45 });
          break;
        }
        gunshot(out, t, s, dist);
        // bolt-action and pump guns work the action after every shot (only heard up close)
        if (s.after && dist < 25) (s.after === 'pump' ? fol.pump : (o, t0) => { fol.boltBack(o, t0); fol.boltFwd(o, t0 + 0.22); })(out, t + (s.after === 'pump' ? 0.32 : 0.45));
        break;
      }
      case 'knife':
        burst(out, t, { dur: 0.16, type: 'bandpass', freq: 1800, freqEnd: 6000, q: 2, gain: 0.35 });
        tone(out, t + 0.02, { freq: 5200, freqEnd: 7000, dur: 0.1, type: 'triangle', gain: 0.03 });
        break;
      case 'step':
        footstep(out, t, arg, 1);
        break;
      case 'land':
        footstep(out, t, arg, 1.7);
        break;
      case 'ggup':
        tone(out, t, { freq: 660, dur: 0.08, type: 'square', gain: 0.08 });
        tone(out, t + 0.08, { freq: 880, dur: 0.08, type: 'square', gain: 0.08 });
        tone(out, t + 0.16, { freq: 1320, dur: 0.14, type: 'square', gain: 0.08 });
        break;
      case 'reload':
        reloadFoley(out, t, arg);
        break;
      case 'draw':
        burst(out, t, { dur: 0.07, type: 'bandpass', freq: 2800, freqEnd: 1800, q: 1.6, gain: 0.2 });
        tone(out, t + 0.07, { freq: 1900, dur: 0.015, type: 'square', gain: 0.07 });
        break;
      case 'empty':
        tone(out, t, { freq: 2600, dur: 0.012, type: 'square', gain: 0.12 });
        burst(out, t, { dur: 0.02, type: 'highpass', freq: 3000, gain: 0.25 });
        break;
      case 'pin':
        tone(out, t, { freq: 3400, dur: 0.02, type: 'square', gain: 0.06 });
        burst(out, t + 0.03, { dur: 0.05, type: 'bandpass', freq: 4200, q: 3, gain: 0.25 });
        tone(out, t + 0.09, { freq: 2600, freqEnd: 3800, dur: 0.06, type: 'triangle', gain: 0.05 });
        break;
      case 'throw':
        burst(out, t, { dur: 0.18, type: 'bandpass', freq: 700, freqEnd: 2400, q: 0.9, gain: 0.3 });
        break;
      case 'dooropen':
        // latch, then the hinge creaks
        tone(out, t, { freq: 1500, dur: 0.02, type: 'square', gain: 0.1 });
        burst(out, t, { dur: 0.03, type: 'highpass', freq: 2500, gain: 0.35 });
        tone(out, t + 0.06, { freq: 170, freqEnd: 290, dur: 0.6, type: 'sawtooth', gain: 0.05 });
        tone(out, t + 0.1, { freq: 350, freqEnd: 520, dur: 0.45, type: 'sawtooth', gain: 0.025 });
        burst(out, t + 0.06, { dur: 0.5, type: 'bandpass', freq: 900, q: 6, gain: 0.08 });
        break;
      case 'doorclose':
        tone(out, t, { freq: 230, freqEnd: 170, dur: 0.35, type: 'sawtooth', gain: 0.03 });
        burst(out, t + 0.3, { dur: 0.18, freq: 380, gain: 1.0 });
        tone(out, t + 0.3, { freq: 95, freqEnd: 50, dur: 0.2, gain: 0.6 });
        tone(out, t + 0.34, { freq: 1500, dur: 0.02, type: 'square', gain: 0.1 });
        break;
      case 'carboom':
        burst(out, t, { dur: 2.6, freq: 1100, freqEnd: 70, gain: 2.0 });
        tone(out, t, { freq: 70, freqEnd: 22, dur: 1.6, gain: 1.3 });
        for (let i = 0; i < 9; i++) tone(out, t + 0.15 + Math.random() * 1.6, { freq: 500 + Math.random() * 1500, freqEnd: 300, dur: 0.12, type: 'triangle', gain: 0.12 });
        burst(out, t + 0.4, { dur: 2.2, type: 'bandpass', freq: 600, q: 0.5, gain: 0.3 });
        break;
      case 'hit':
        tone(out, t, { freq: 1700, dur: 0.05, gain: 0.25 });
        break;
      case 'hs':
        tone(out, t, { freq: 2600, dur: 0.09, gain: 0.3 });
        tone(out, t + 0.03, { freq: 1300, dur: 0.12, gain: 0.2 });
        break;
      case 'hurt':
        burst(out, t, { dur: 0.15, freq: 700, gain: 0.6 });
        break;
      case 'death':
        tone(out, t, { freq: 220, freqEnd: 60, dur: 0.6, type: 'sawtooth', gain: 0.15 });
        break;
      case 'mortarfire':
        // the shell dropped down the tube: a hollow metal clink, then a deep thoomp heard far across the map
        tone(out, t, { freq: 1900, freqEnd: 1500, dur: 0.12, type: 'triangle', gain: 0.12 });
        burst(out, t + 0.08, { dur: 0.7, type: 'lowpass', freq: 800, freqEnd: 80, gain: 2.0 });
        tone(out, t + 0.08, { freq: 90, freqEnd: 28, dur: 0.8, gain: 1.5 });
        burst(out, t + 0.1, { dur: 1.6, type: 'bandpass', freq: 300, q: 0.6, gain: 0.35 });
        burst(out, t + 0.6, { dur: 1.4, freq: 400, freqEnd: 60, gain: 0.3 }); // its echo
        break;
      case 'whistle':
        // arg: { dur, close }
        shellWhistle(out, t, arg?.dur ?? 3, arg?.close ?? 0);
        break;
      case 'heboom': // an HE grenade: the same kind of blast, smaller
        shellBlast(out, t, 0.6);
        break;
      case 'crumble': {
        // a wall giving way: a cracking crash, a heavy slump, then bricks and plaster clattering down. arg: how much
        const s = arg ?? 1;
        burst(out, t, { dur: 0.25, type: 'bandpass', freq: 1400, freqEnd: 400, q: 0.8, gain: 0.9 * s });
        rumble(out, t + 0.03, { dur: 1.4, freq: 600, freqEnd: 60, gain: 1.1 * s, attack: 0.04 });
        tone(out, t + 0.05, { freq: 70, freqEnd: 35, dur: 0.6, gain: 0.8 * s });
        for (let i = 0; i < 18 * s + 4; i++) {
          const at = t + 0.15 + Math.pow(Math.random(), 1.4) * 1.6;
          burst(out, at, { dur: 0.03 + Math.random() * 0.07, type: 'bandpass', freq: 500 + Math.random() * 2200, q: 1.3, gain: 0.12 + Math.random() * 0.2 });
        }
        break;
      }
      case 'mortarboom':
      case 'rpgboom': // the RPG-7's rocket and the C4 bomb blow up the same way
      case 'c4boom':
        shellBlast(out, t);
        break;
      case 'shellshock': {
        // a shell landed right next to us: everything goes muffled under a ringing in the ears
        const s = arg ?? 1, v = this.volume;
        tone(master, t + 0.1, { freq: 3700, dur: 4.5 * s, gain: 0.09 * s });
        tone(master, t + 0.1, { freq: 3712, dur: 3.5 * s, gain: 0.05 * s });
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(v, t);
        master.gain.linearRampToValueAtTime(v * (1 - 0.7 * s), t + 0.25);
        master.gain.linearRampToValueAtTime(v, t + 0.25 + 4 * s);
        break;
      }
      case 'gib':
        // a body bursting: a wet crunch, a thump and a spatter of drips
        burst(out, t, { dur: 0.4, type: 'lowpass', freq: 1800, freqEnd: 250, gain: 1.3 });
        tone(out, t, { freq: 140, freqEnd: 45, dur: 0.35, gain: 0.7 });
        burst(out, t + 0.02, { dur: 0.12, type: 'bandpass', freq: 2600, q: 0.8, gain: 0.5 });
        for (let i = 0; i < 7; i++) burst(out, t + 0.05 + Math.random() * 0.5, { dur: 0.05, type: 'bandpass', freq: 500 + Math.random() * 900, q: 2, gain: 0.35 });
        break;
      case 'splat':
        // a piece landing
        burst(out, t, { dur: 0.09, type: 'lowpass', freq: 900 + Math.random() * 500, gain: 0.45 });
        break;
      case 'satbeep': // a satchel charge's quiet chirp
        tone(out, t, { freq: 2600, dur: 0.04, type: 'square', gain: 0.05 });
        break;
      case 'beep':
        tone(out, t, { freq: 1950, dur: 0.1, gain: 0.35 });
        break;
      case 'boom':
        burst(out, t, { dur: 1.1, freq: 1200, freqEnd: 120, gain: 1.6 });
        tone(out, t, { freq: 80, freqEnd: 25, dur: 0.9, gain: 1.0 });
        break;
      case 'bigboom':
        burst(out, t, { dur: 2.2, freq: 900, freqEnd: 60, gain: 2.0 });
        tone(out, t, { freq: 60, freqEnd: 20, dur: 1.8, gain: 1.4 });
        break;
      case 'bounce':
        tone(out, t, { freq: 500 + Math.random() * 300, dur: 0.04, type: 'triangle', gain: 0.2 });
        break;
      case 'buy':
      case 'pickup':
        tone(out, t, { freq: 900, freqEnd: 1500, dur: 0.08, gain: 0.15 });
        break;
      case 'plant':
        for (let i = 0; i < 7; i++) tone(out, t + i * 0.4, { freq: 1400 + (i % 3) * 200, dur: 0.06, type: 'square', gain: 0.08 });
        break;
      case 'win':
        tone(out, t, { freq: 523, dur: 0.25, gain: 0.2 });
        tone(out, t + 0.18, { freq: 784, dur: 0.4, gain: 0.2 });
        break;
      case 'lose':
        tone(out, t, { freq: 392, dur: 0.25, gain: 0.2 });
        tone(out, t + 0.18, { freq: 262, dur: 0.45, gain: 0.2 });
        break;
      case 'go':
        tone(out, t, { freq: 660, dur: 0.12, type: 'triangle', gain: 0.2 });
        tone(out, t + 0.12, { freq: 990, dur: 0.18, type: 'triangle', gain: 0.2 });
        break;
      case 'chat':
        tone(out, t, { freq: 1200, dur: 0.05, gain: 0.08 });
        break;
      case 'radio':
        burst(out, t, { dur: 0.12, type: 'bandpass', freq: 2500, q: 3, gain: 0.25 });
        tone(out, t + 0.02, { freq: 1500, dur: 0.06, type: 'square', gain: 0.05 });
        break;
      case 'ammo':
        tone(out, t, { freq: 700, dur: 0.05, type: 'square', gain: 0.1 });
        tone(out, t + 0.08, { freq: 900, dur: 0.05, type: 'square', gain: 0.1 });
        break;
      case 'flashpop':
        burst(out, t, { dur: 0.25, type: 'highpass', freq: 2000, gain: 1.4 });
        tone(out, t, { freq: 140, freqEnd: 50, dur: 0.3, gain: 0.6 });
        break;
      case 'ring':
        tone(out, t, { freq: 3200, dur: arg || 2, gain: 0.12 });
        break;
      case 'smoke':
        burst(out, t, { dur: 2.5, freq: 1800, freqEnd: 400, gain: 0.5 });
        break;
      case 'spray':
        burst(out, t, { dur: 0.45, type: 'highpass', freq: 3500, gain: 0.35 });
        break;
      case 'click':
        tone(out, t, { freq: 2200, dur: 0.02, type: 'square', gain: 0.08 });
        break;
      case 'nvg':
        tone(out, t, { freq: 400, freqEnd: 4000, dur: 0.35, gain: 0.08 });
        break;
      case 'deny':
        tone(out, t, { freq: 220, dur: 0.12, type: 'square', gain: 0.08 });
        break;
      case 'glass':
        burst(out, t, { dur: 0.5, type: 'highpass', freq: 4000, gain: 0.9 });
        for (let i = 0; i < 6; i++) tone(out, t + Math.random() * 0.25, { freq: 2500 + Math.random() * 3000, dur: 0.08, type: 'triangle', gain: 0.12 });
        break;
      case 'molotov':
        // the bottle smashes and the petrol catches with a deep whoomp
        burst(out, t, { dur: 0.45, type: 'highpass', freq: 3500, gain: 0.8 });
        for (let i = 0; i < 5; i++) tone(out, t + Math.random() * 0.2, { freq: 2200 + Math.random() * 2800, dur: 0.07, type: 'triangle', gain: 0.1 });
        burst(out, t + 0.05, { dur: 0.9, type: 'lowpass', freq: 300, freqEnd: 1400, gain: 1.1 });
        tone(out, t + 0.05, { freq: 90, freqEnd: 45, dur: 0.5, gain: 0.5 });
        break;
      case 'fire':
        // one crackle of a burning fire, played over and over while it burns
        burst(out, t, { dur: 0.35, type: 'bandpass', freq: 500 + Math.random() * 300, q: 0.6, gain: 0.35 });
        for (let i = 0; i < 3; i++) burst(out, t + Math.random() * 0.3, { dur: 0.025, type: 'highpass', freq: 2500 + Math.random() * 2500, gain: 0.35 });
        break;
      case 'infect':
        // a choked scream sliding into a snarl
        tone(out, t, { freq: 780, freqEnd: 260, dur: 0.7, type: 'sawtooth', gain: 0.16 });
        tone(out, t + 0.02, { freq: 1180, freqEnd: 390, dur: 0.6, type: 'square', gain: 0.05 });
        burst(out, t, { dur: 0.8, type: 'bandpass', freq: 1400, freqEnd: 500, q: 1.2, gain: 0.35 });
        tone(out, t + 0.6, { freq: 110, freqEnd: 70, dur: 0.6, type: 'sawtooth', gain: 0.18 });
        break;
      case 'zgrowl': {
        // a low wobbling growl
        const f0 = 70 + Math.random() * 40;
        tone(out, t, { freq: f0, freqEnd: f0 * 0.75, dur: 0.9, type: 'sawtooth', gain: 0.16 });
        tone(out, t, { freq: f0 * 1.5, freqEnd: f0 * 1.1, dur: 0.8, type: 'square', gain: 0.04 });
        burst(out, t, { dur: 0.9, type: 'bandpass', freq: 380, q: 1.5, gain: 0.3 });
        break;
      }
      case 'achieve':
        for (const [i, f] of [523, 659, 784, 1047].entries()) tone(out, t + i * 0.09, { freq: f, dur: 0.22, type: 'triangle', gain: 0.14 });
        tone(out, t + 0.36, { freq: 1568, dur: 0.5, type: 'sine', gain: 0.08 });
        break;
      case 'rankup':
        for (const [i, f] of [392, 523, 659, 784, 1047, 1319].entries()) tone(out, t + i * 0.08, { freq: f, dur: 0.3, type: 'square', gain: 0.07 });
        burst(out, t + 0.45, { dur: 0.6, type: 'highpass', freq: 5000, gain: 0.15 });
        break;
      case 'powerdown':
        // the big lever thrown, a heavy clunk, and the whole house's hum winding down
        burst(out, t, { dur: 0.25, freq: 700, gain: 1.1 });
        tone(out, t, { freq: 70, freqEnd: 40, dur: 0.3, gain: 0.8 });
        tone(out, t + 0.05, { freq: 120, freqEnd: 18, dur: 2.2, type: 'sawtooth', gain: 0.22 });
        tone(out, t + 0.05, { freq: 240, freqEnd: 30, dur: 1.8, type: 'square', gain: 0.05 });
        burst(out, t + 0.1, { dur: 0.5, type: 'highpass', freq: 3000, gain: 0.25 });
        break;
      case 'powerup':
        // a clunk, crackling relays and the mains hum swelling back
        burst(out, t, { dur: 0.2, freq: 700, gain: 1.0 });
        for (let i = 0; i < 6; i++) burst(out, t + 0.08 + i * 0.13, { dur: 0.03, type: 'highpass', freq: 2500, gain: 0.5 });
        tone(out, t + 0.1, { freq: 25, freqEnd: 100, dur: 1.4, type: 'sawtooth', gain: 0.2 });
        tone(out, t + 1.2, { freq: 100, dur: 0.6, type: 'sawtooth', gain: 0.06 });
        break;
      case 'switch':
        tone(out, t, { freq: 1800, dur: 0.025, type: 'square', gain: 0.15 });
        burst(out, t, { dur: 0.04, type: 'bandpass', freq: 3000, gain: 0.3 });
        break;
      case 'horn':
        tone(out, t, { freq: 410, dur: 0.45, type: 'sawtooth', gain: 0.25 });
        tone(out, t, { freq: 520, dur: 0.45, type: 'sawtooth', gain: 0.2 });
        break;
      case 'crash':
        burst(out, t, { dur: 0.45, freq: 1500, freqEnd: 200, gain: 1.3 });
        tone(out, t, { freq: 90, freqEnd: 40, dur: 0.3, gain: 0.7 });
        break;
      case 'rescue':
        tone(out, t, { freq: 660, dur: 0.15, gain: 0.25 });
        tone(out, t + 0.12, { freq: 880, dur: 0.15, gain: 0.25 });
        tone(out, t + 0.24, { freq: 1320, dur: 0.3, gain: 0.25 });
        break;
      case 'hostage':
        tone(out, t, { freq: 300, freqEnd: 420, dur: 0.18, type: 'triangle', gain: 0.2 });
        break;
      case 'announce':
        tone(out, t, { freq: 220, dur: 0.5, type: 'sawtooth', gain: 0.12 });
        tone(out, t, { freq: 330, dur: 0.5, type: 'sawtooth', gain: 0.1 });
        burst(out, t, { dur: 0.6, freq: 600, freqEnd: 3000, gain: 0.25 });
        break;
      case 'mvp':
        for (let i = 0; i < 4; i++) tone(out, t + i * 0.09, { freq: 784 * Math.pow(1.26, i), dur: 0.2, gain: 0.16 });
        break;
      case 'killcam':
        burst(out, t, { dur: 0.6, type: 'bandpass', freq: 400, freqEnd: 2000, q: 1.5, gain: 0.35 });
        break;
      case 'ladder':
        tone(out, t, { freq: 320 + Math.random() * 80, dur: 0.06, type: 'triangle', gain: 0.25 });
        burst(out, t, { dur: 0.05, type: 'bandpass', freq: 1200, q: 2, gain: 0.25 });
        break;
      case 'splash':
        burst(out, t, { dur: 0.25, type: 'bandpass', freq: 900 + Math.random() * 400, freqEnd: 2500, q: 0.8, gain: 0.5 });
        break;
      case 'door':
        tone(out, t, { freq: 160, freqEnd: 90, dur: 0.15, type: 'square', gain: 0.15 });
        break;
      case 'dronestart': {
        // the drone spinning up off the pilot's hands
        tone(out, t, { freq: 120, freqEnd: 420, dur: 0.5, type: 'sawtooth', gain: 0.12 });
        burst(out, t, { dur: 0.4, type: 'bandpass', freq: 900, freqEnd: 2400, q: 2, gain: 0.25 });
        break;
      }
      case 'dronedive': {
        // the motors screaming into a dive
        tone(out, t, { freq: 300, freqEnd: 900, dur: 0.8, type: 'sawtooth', gain: 0.14 });
        tone(out, t, { freq: 450, freqEnd: 1350, dur: 0.8, type: 'square', gain: 0.05 });
        break;
      }
      case 'dronehit': {
        // a bullet through a drone's plastic shell: a sharp clack and a short rattle
        burst(out, t, { dur: 0.05, type: 'bandpass', freq: 3200, q: 2, gain: 0.7 });
        burst(out, t + 0.04, { dur: 0.06, type: 'bandpass', freq: 1500 + Math.random() * 800, q: 4, gain: 0.3 });
        break;
      }
      case 'dronedown': {
        // a drone breaking up: a crack of plastic, rattling bits
        burst(out, t, { dur: 0.12, freq: 2600, gain: 0.8 });
        for (let k = 0; k < 5; k++) burst(out, t + 0.06 + k * 0.05 + Math.random() * 0.03, { dur: 0.04, type: 'bandpass', freq: 1800 + Math.random() * 1500, q: 3, gain: 0.35 });
        tone(out, t, { freq: 500, freqEnd: 120, dur: 0.3, type: 'sawtooth', gain: 0.08 });
        break;
      }
      case 'roller': {
        // a steel roller door rolling up or down: a motor's drone, the slats rattling over the drum, a clunk (arg: seconds)
        const len = arg || 2;
        tone(out, t, { freq: 62, freqEnd: 74, dur: len, type: 'sawtooth', gain: 0.06 });
        for (let k = 0; k < len * 13; k++) burst(out, t + k / 13 + Math.random() * 0.02, { dur: 0.035, type: 'bandpass', freq: 1500 + Math.random() * 1200, q: 4, gain: 0.3 });
        burst(out, t + len, { dur: 0.16, freq: 380, gain: 0.7 });
        tone(out, t + len, { freq: 120, freqEnd: 70, dur: 0.14, type: 'square', gain: 0.12 });
        break;
      }
      case 'zipclip':
        // a trolley's carabiner snapping onto the zip line, the cable taking the weight
        burst(out, t, { dur: 0.03, type: 'highpass', freq: 3500, gain: 0.6 });
        tone(out, t, { freq: 2400, freqEnd: 1900, dur: 0.05, type: 'square', gain: 0.06 });
        tone(out, t + 0.04, { freq: 180, freqEnd: 140, dur: 0.4, type: 'triangle', gain: 0.12 });
        break;
      case 'zipsaw':
        // bolt cutters working on the steel cable at its tensioner: strained creaks and scrapes (3 s)
        for (let k = 0; k < 9; k++) {
          const t0 = t + k * 0.33 + Math.random() * 0.05;
          burst(out, t0, { dur: 0.22, type: 'bandpass', freq: 2200 + Math.random() * 900, q: 6, gain: 0.35 });
          tone(out, t0, { freq: 300 + Math.random() * 120, freqEnd: 420, dur: 0.18, type: 'sawtooth', gain: 0.05 });
        }
        break;
      case 'zipsnap':
        // the cable parting: a sharp crack and a long whipping twang
        burst(out, t, { dur: 0.06, type: 'highpass', freq: 2500, gain: 1.4 });
        tone(out, t, { freq: 900, freqEnd: 120, dur: 1.4, type: 'sawtooth', gain: 0.12 });
        tone(out, t, { freq: 1350, freqEnd: 180, dur: 1.1, type: 'triangle', gain: 0.1 });
        burst(out, t + 0.05, { dur: 0.8, type: 'bandpass', freq: 1400, freqEnd: 300, q: 3, gain: 0.3 });
        break;
      case 'creak': {
        // a stuck old door forced open: a thump, then a long groaning creak of dry hinges (arg: seconds)
        const len = arg || 1.5;
        burst(out, t, { dur: 0.12, freq: 500, gain: 0.9 });
        tone(out, t, { freq: 90, freqEnd: 55, dur: 0.15, gain: 0.5 });
        for (let k = 0; k < 3; k++) {
          const t0 = t + 0.1 + (k * len) / 3;
          tone(out, t0, { freq: 140 + k * 30, freqEnd: 260 + k * 40, dur: len / 3 + 0.05, type: 'sawtooth', gain: 0.09 });
          tone(out, t0, { freq: 420 + k * 60, freqEnd: 610 + k * 50, dur: len / 3, type: 'sawtooth', gain: 0.04 });
          burst(out, t0, { dur: len / 3, type: 'bandpass', freq: 1100, q: 8, gain: 0.12 });
        }
        break;
      }
    }
  },

  // Continuous engine sound per car: pitch follows speed, silent when nobody drives.
  engines: new Map(),
  engine(id, pos, speed, running) {
    if (!ctx || ctx.state !== 'running') return;
    let e = this.engines.get(id);
    if (!e) {
      const out = this.out(pos);
      const g = ctx.createGain();
      g.gain.value = 0;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o2.type = 'square';
      o1.connect(f); o2.connect(f);
      f.connect(g).connect(out);
      o1.start(); o2.start();
      e = { out, g, o1, o2, f };
      this.engines.set(id, e);
    }
    const t = ctx.currentTime, rpm = Math.min(1, Math.abs(speed) / 17);
    if (pos && e.out.positionX) { e.out.positionX.value = pos[0]; e.out.positionY.value = pos[1]; e.out.positionZ.value = pos[2]; }
    e.o1.frequency.setTargetAtTime(38 + rpm * 85, t, 0.08);
    e.o2.frequency.setTargetAtTime(19 + rpm * 42, t, 0.08);
    e.f.frequency.setTargetAtTime(400 + rpm * 900, t, 0.1);
    e.g.gain.setTargetAtTime(running ? 0.07 + rpm * 0.09 : 0, t, 0.15);
  },
  // A drone's buzz: four little motors and their blades, loud and carrying far, higher when it dives; one per
  // drone while it flies, buzz(id, null) stops it.
  buzzes: new Map(),
  buzz(id, pos, diving = false) {
    if (!ctx || ctx.state !== 'running') return;
    let b = this.buzzes.get(id);
    if (!pos) {
      if (b) { b.o1.stop(); b.o2.stop(); b.lfo.stop(); b.g.disconnect(); this.buzzes.delete(id); }
      return;
    }
    if (!b) {
      const out = this.out(pos, [7, 0.8]);
      const g = ctx.createGain(), f = ctx.createBiquadFilter();
      g.gain.value = 0.07;
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 0.6;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o1.type = 'sawtooth'; o1.frequency.value = 210;
      o2.type = 'sawtooth'; o2.frequency.value = 318;
      lfo.frequency.value = 37; lg.gain.value = 0.035; // the blades' beat
      lfo.connect(lg).connect(g.gain);
      o1.connect(f); o2.connect(f);
      f.connect(g).connect(out);
      for (const o of [o1, o2, lfo]) o.start();
      b = { out, g, o1, o2, lfo, diving: false };
      this.buzzes.set(id, b);
    }
    if (b.out.positionX) { b.out.positionX.value = pos[0]; b.out.positionY.value = pos[1]; b.out.positionZ.value = pos[2]; }
    if (b.diving !== diving) {
      b.diving = diving;
      const t = ctx.currentTime;
      b.o1.frequency.setTargetAtTime(diving ? 420 : 210, t, 0.2);
      b.o2.frequency.setTargetAtTime(diving ? 640 : 318, t, 0.2);
    }
  },
  // A signal jammer's electric hum (with a slow warble), one per jammer while it stands; hum(id, null) stops it.
  hums: new Map(),
  hum(id, pos) {
    if (!ctx || ctx.state !== 'running') return;
    let h = this.hums.get(id);
    if (!pos) {
      if (h) { h.o1.stop(); h.o2.stop(); h.lfo.stop(); h.g.disconnect(); this.hums.delete(id); }
      return;
    }
    if (h) return;
    const out = this.out(pos, [2.5, 1.2]);
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    g.gain.value = 0.05;
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o1.type = 'sawtooth'; o1.frequency.value = 100;
    o2.type = 'square'; o2.frequency.value = 151;
    lfo.frequency.value = 3.3; lg.gain.value = 0.02;
    lfo.connect(lg).connect(g.gain);
    o1.connect(f); o2.connect(f);
    f.connect(g).connect(out);
    for (const o of [o1, o2, lfo]) o.start();
    this.hums.set(id, { g, o1, o2, lfo });
  },
  stopEngines() {
    for (const e of this.engines.values()) { e.o1.stop(); e.o2.stop(); e.g.disconnect(); }
    this.engines.clear();
  },
  // A steady machine sound at a spot, one per id while it runs; loop(id, null) stops it. 'whir': a zip line trolley's
  // wheels on the cable (level: its speed in m/s, higher and louder the faster); 'hum': the lift's motor (level 1 running,
  // 0 stopped).
  loops: new Map(),
  loop(id, pos, kind = 'whir', level = 1) {
    if (!ctx || ctx.state !== 'running') return;
    let l = this.loops.get(id);
    if (!pos) {
      if (l) { l.o1.stop(); l.o2.stop(); l.src.stop(); l.g.disconnect(); this.loops.delete(id); }
      return;
    }
    if (!l) {
      const out = this.out(pos, kind === 'whir' ? [4, 1] : [2.5, 1.3]);
      const g = ctx.createGain(), f = ctx.createBiquadFilter(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      g.gain.value = 0;
      f.type = 'lowpass';
      f.frequency.value = kind === 'whir' ? 1800 : 500;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), src = ctx.createBufferSource();
      o1.type = 'sawtooth'; o2.type = kind === 'whir' ? 'triangle' : 'square';
      o1.frequency.value = kind === 'whir' ? 160 : 50; o2.frequency.value = kind === 'whir' ? 340 : 100;
      // (and a hiss of the wheels or the cables running)
      src.buffer = noise; src.loop = true;
      nf.type = 'bandpass'; nf.frequency.value = kind === 'whir' ? 2600 : 900; nf.Q.value = 1.2;
      ng.gain.value = kind === 'whir' ? 0.5 : 0.25;
      src.connect(nf).connect(ng).connect(g);
      o1.connect(f); o2.connect(f);
      f.connect(g).connect(out);
      for (const o of [o1, o2, src]) o.start();
      l = { out, g, o1, o2, src, kind, level: -1 };
      this.loops.set(id, l);
    }
    if (l.out.positionX) { l.out.positionX.value = pos[0]; l.out.positionY.value = pos[1]; l.out.positionZ.value = pos[2]; }
    if (Math.abs(l.level - level) > 0.05) {
      l.level = level;
      const t = ctx.currentTime;
      if (l.kind === 'whir') {
        const k = Math.min(1, Math.abs(level) / 10);
        l.o1.frequency.setTargetAtTime(120 + 260 * k, t, 0.1);
        l.o2.frequency.setTargetAtTime(250 + 520 * k, t, 0.1);
        l.g.gain.setTargetAtTime(Math.abs(level) < 0.1 ? 0 : 0.03 + 0.07 * k, t, 0.1);
      } else l.g.gain.setTargetAtTime(level > 0 ? 0.06 : 0, t, 0.2);
    }
  },

  // Radio commands are read out loud, like the CS radio voice.
  // `announcer` uses a slower, deeper delivery for callouts like "Double kill".
  speak(text, announcer = false) {
    const s = window.speechSynthesis;
    if (!s || !this.volume) return;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = announcer ? 0.9 : 1.15;
    u.pitch = announcer ? 0.4 : 0.8;
    u.volume = Math.min(1, this.volume * 1.4);
    s.cancel();
    s.speak(u);
  },
};
