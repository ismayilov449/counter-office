// Power & machinery in the browser (Mansion; the server runs it: lib/power.js; the rules both share: shared/power.js;
// the machine room and the ladder are part of the level: shared/maps/mansion_power.js). main.js makes one with
// createPower(ctx) and calls into it: load() with each map, update() every frame (the models, the generator's noise,
// what E is aimed at), hint() and progress() for the help line, the server's messages (handlers: power, pwPop, pwSfx),
// and powered(circuit) / poweredAt(pos) for whatever needs to know (the CCTV's monitors; later sight).
// The lamps themselves come in the usual 'lights' message (the server works them out; lights.dead: the groups with no
// power, pitch dark in roomlight.js).
// Cheap to draw: the breaker panel is one mesh (a canvas texture for its labels), the generator one, the winch one
// (vertex colours, one shared material); each is drawn only when in view, never casts shadows, no lights. The
// generator's exhaust and every spark are the effects' pooled particles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER } from '/shared/physics.js';
import { CIRCUITS, CIRCUIT_NAMES, LABELS, BREAKER, GEN, CABLE, freshState, genFuel, genRunning, live, circuitAt, aimAt } from '/shared/power.js';

const aimDir = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
const WHITE_UV = [0.97, 0.03]; // (a white texel of the panel's canvas, for the parts that only have a colour)

export function createPower(ctx) {
  const { scene, me, net, audio, fx, serverNow } = ctx;
  let map = null, P = null, st = freshState(), aim = null, sentAim, last = null;
  let panel = null, gen = null, winch = null, panelTex = null, drawn = '';
  let engine = null, engineTry = 0, grindUntil = 0, puffAt = 0;
  const mats = [];
  const col = new THREE.MeshLambertMaterial({ vertexColors: true });
  mats.push(col);

  // ---------------------------------------------------------------- models
  const tint = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (g.index) g = g.toNonIndexed();
    return g;
  };
  const flatUV = g => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, WHITE_UV[0], WHITE_UV[1]); return g; };
  const box = (x1, y1, z1, x2, y2, z2, hex) => tint(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), hex);
  const cyl = (r, h, axis, c, hex, seg = 12) => {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    return tint(g.translate(c[0], c[1], c[2]), hex);
  };
  const only = (geos, keep) => geos.map(g => { for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k); return g; });

  // The panel's face: a steel plate, a label over each breaker, the master label.
  function drawPanelTex() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#5e6366'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#ffffff'; g.fillRect(240, 112, 16, 16); // (the white corner)
    g.fillStyle = '#e0b020'; g.fillRect(0, 0, 256, 16);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
    g.fillText('BREAKERS — HOUSE CIRCUITS', 128, 12);
    const w = 256 / CIRCUITS.length;
    LABELS.forEach((l, i) => {
      const x = w * i + w / 2;
      g.fillStyle = '#eceae2'; g.fillRect(x - 22, 24, 44, 14);
      g.fillStyle = '#111'; g.font = 'bold 9px sans-serif'; g.fillText(l, x, 34);
      g.fillStyle = '#26292b'; g.fillRect(x - 9, 46, 18, 56); // the switch's slot
      g.fillStyle = '#cfd2d4'; g.font = 'bold 8px sans-serif'; g.fillText('ON', x, 44); g.fillText('OFF', x, 112);
    });
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  // The panel with its levers (rebuilt when a breaker flips: a few hundred vertices)
  function buildPanel() {
    const b = P.panel, [x1, y1, z1] = b.min, [x2, y2, z2] = b.max, W = x2 - x1, H = y2 - y1;
    const body = new THREE.BoxGeometry(W, H, z2 - z1).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    // (only the front face shows the canvas)
    const uv = body.attributes.uv;
    for (let i = 0; i < uv.count; i++) if (i < 16 || i >= 20) uv.setXY(i, WHITE_UV[0], WHITE_UV[1]);
    const parts = [tint(body, 0xffffff)];
    const w = W / CIRCUITS.length;
    CIRCUITS.forEach((c, i) => {
      const x = x1 + w * i + w / 2, on = !!st.b[i], yc = y1 + H * (1 - 74 / 128); // (the slot's middle on the canvas)
      const ty = yc + (on ? 0.07 : -0.07);
      parts.push(flatUV(box(x - 0.025, Math.min(yc, ty) - 0.015, z2, x + 0.025, Math.max(yc, ty) + 0.015, z2 + 0.035, 0x1c1c1c)));
      parts.push(flatUV(box(x - 0.03, ty - 0.02, z2 + 0.035, x + 0.03, ty + 0.02, z2 + 0.06, on ? 0x3aa040 : 0xb02a20)));
    });
    const g = mergeGeometries(only(parts, ['position', 'normal', 'uv', 'color']));
    if (!panel) {
      const m = new THREE.MeshLambertMaterial({ map: panelTex, vertexColors: true });
      mats.push(m);
      panel = new THREE.Mesh(g, m);
      scene.add(panel);
    } else { panel.geometry.dispose(); panel.geometry = g; }
  }
  // The generator: a tubular frame, the engine (red), its fuel tank on top (yellow), the control panel, the exhaust
  function buildGen() {
    const b = P.gen, [x1, , z1] = b.min, [x2, , z2] = b.max, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, f = 0.03;
    const parts = [];
    for (const x of [x1 + f, x2 - f]) for (const z of [z1 + f, z2 - f]) parts.push(box(x - f, 0, z - f, x + f, 0.82, z + f, 0x23262a));
    for (const y of [0.04, 0.8]) { parts.push(box(x1, y - f, z1, x2, y + f, z1 + 2 * f, 0x23262a)); parts.push(box(x1, y - f, z2 - 2 * f, x2, y + f, z2, 0x23262a)); }
    parts.push(box(x1 + 0.12, 0.08, z1 + 0.12, cx + 0.1, 0.55, z2 - 0.12, 0xb3261e)); // the engine
    parts.push(cyl(0.16, 0.36, 'x', [cx + 0.32, 0.3, cz], 0x8f9497, 16)); // the alternator
    parts.push(box(x1 + 0.1, 0.58, z1 + 0.1, x2 - 0.1, 0.78, z2 - 0.1, 0xe2b414)); // the tank
    parts.push(cyl(0.05, 0.06, 'y', [x1 + 0.3, 0.81, cz], 0x111111));
    parts.push(box(x2 - 0.34, 0.12, z1 - 0.005, x2 - 0.06, 0.5, z1 + 0.04, 0x1d1f21)); // the control panel (north side)
    parts.push(box(x2 - 0.3, 0.38, z1 - 0.02, x2 - 0.22, 0.44, z1, 0xc8c8c8)); // its switch
    parts.push(cyl(0.035, 0.32, 'x', [x2 + 0.1, P.gen.exhaust[1], P.gen.exhaust[2]], 0x3a3a38)); // the exhaust
    gen = new THREE.Mesh(mergeGeometries(only(parts, ['position', 'normal', 'color'])), col);
    scene.add(gen);
  }
  // The winch: base, motor, gearbox, the sheave over the shaft and its ropes down through the floor (cut: short ends)
  function buildWinch() {
    const b = P.winch, [x1, y0, z1] = b.min, [x2, , z2] = b.max, r = P.winch.rope, cz = (z1 + z2) / 2;
    const parts = [box(x1, y0, z1, x2, y0 + 0.12, z2, 0x3a3d40)];
    parts.push(cyl(0.24, 0.62, 'x', [x1 + 0.38, y0 + 0.42, cz], 0x456a52, 16)); // the motor
    parts.push(box(x1 + 0.7, y0 + 0.12, cz - 0.25, x1 + 1.0, y0 + 0.62, cz + 0.25, 0x56595c)); // the gearbox
    parts.push(cyl(0.05, 0.4, 'x', [x1 + 1.05, y0 + 0.72, cz], 0x8a8d90)); // the shaft
    parts.push(cyl(0.32, 0.12, 'x', [r[0], y0 + 0.72, cz], 0x2d2f31, 20)); // the sheave
    const ropes = [-0.12, -0.04, 0.04, 0.12];
    for (const dz of ropes) {
      const z = r[2] + dz;
      if (!st.cut) parts.push(box(r[0] - 0.008, y0 - 0.02, z - 0.008, r[0] + 0.008, y0 + 0.72, z + 0.008, 0x9a9890));
      else parts.push(box(r[0] - 0.008, y0 + 0.25 + Math.abs(dz), z - 0.008, r[0] + 0.008, y0 + 0.72, z + 0.008, 0x9a9890)); // (frayed ends)
    }
    parts.push(box(r[0] - 0.1, y0 - 0.005, r[2] - 0.2, r[0] + 0.1, y0 + 0.004, r[2] + 0.2, 0x0c0c0c)); // the hole in the floor
    parts.push(box(x2 - 0.02, y0 + 0.75, z1 + 0.1, x2 + 0.005, y0 + 1.0, z1 + 0.35, 0xd8b020)); // a warning plate
    const g = mergeGeometries(only(parts, ['position', 'normal', 'color']));
    if (!winch) { winch = new THREE.Mesh(g, col); scene.add(winch); }
    else { winch.geometry.dispose(); winch.geometry = g; }
  }
  function build() {
    panelTex = drawPanelTex();
    buildPanel();
    buildGen();
    buildWinch();
    for (const o of [panel, gen, winch]) { o.castShadow = false; o.receiveShadow = false; o.matrixAutoUpdate = o === gen; o.updateMatrix(); }
    drawn = JSON.stringify([st.b, st.cut]);
  }
  function dispose() {
    for (const o of [panel, gen, winch]) if (o) { scene.remove(o); o.geometry.dispose(); }
    for (const m of mats) if (m !== col) m.dispose();
    mats.length = 1;
    panelTex?.dispose();
    panel = gen = winch = panelTex = null;
    engineStop(true);
  }

  // ---------------------------------------------------------------- sounds (made here)
  let noiseBuf = null;
  const ctxOf = out => { const c = out.context; if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return c; };
  function sound(pos, ref, fn) {
    try {
      const out = audio.out(pos, ref, audio.muffled), c = ctxOf(out);
      if (c.state !== 'running') return;
      const tone = (t0, freq, dur, { type = 'sine', gain = 0.2, to, attack = 0.005 } = {}) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t0);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(out);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
      };
      const hiss = (t0, dur, { freq = 1200, to, q = 1, gain = 0.2, type = 'bandpass', attack = 0.01 } = {}) => {
        const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = noiseBuf;
        s.loop = true;
        f.type = type;
        f.Q.value = q;
        f.frequency.setValueAtTime(freq, t0);
        if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        s.connect(f).connect(g).connect(out);
        s.start(t0);
        s.stop(t0 + dur + 0.05);
      };
      fn(c.currentTime, tone, hiss);
    } catch { /* no sound yet (before the first click) */ }
  }
  const SFX = {
    // a breaker: a heavy clack
    breaker: (t, tone, hiss) => { tone(t, 1900, 0.02, { type: 'square', gain: 0.12 }); hiss(t, 0.06, { freq: 1500, q: 2, gain: 0.5 }); tone(t + 0.01, 140, 0.08, { gain: 0.3 }); },
    // the generator starting: the pull cord twice, coughs, then it catches
    genstart: (t, tone, hiss) => {
      for (const k of [0, 0.55]) { hiss(t + k, 0.3, { freq: 900, to: 2600, q: 3, gain: 0.3, attack: 0.05 }); tone(t + k + 0.25, 60, 0.15, { type: 'sawtooth', gain: 0.25 }); }
      for (let i = 0; i < 4; i++) tone(t + 1.1 + i * 0.13, 45 + i * 8, 0.1, { type: 'sawtooth', gain: 0.35 });
    },
    // switched off: it winds down
    genstop: (t, tone, hiss) => { tone(t, 70, 1.2, { type: 'sawtooth', gain: 0.25, to: 18 }); hiss(t, 0.8, { freq: 500, to: 150, gain: 0.2, type: 'lowpass' }); },
    // out of fuel: it sputters and dies
    genout: (t, tone) => { for (let i = 0; i < 6; i++) tone(t + i * 0.22 + Math.random() * 0.08, 55 - i * 4, 0.12, { type: 'sawtooth', gain: 0.3 - i * 0.04 }); },
    // an angle grinder on steel rope (as long as it takes)
    grind: (t, tone, hiss) => {
      tone(t, 2600, CABLE.hold, { type: 'sawtooth', gain: 0.05, to: 3100, attack: 0.2 });
      hiss(t, CABLE.hold, { freq: 5200, q: 3, gain: 0.35, attack: 0.15 });
      for (let k = 0; k < 8; k++) hiss(t + k * 0.5 + Math.random() * 0.2, 0.25, { freq: 3500, q: 6, gain: 0.3 });
    },
    // the cable snaps: a whiplash twang, ropes thrashing
    snap: (t, tone, hiss) => { hiss(t, 0.08, { freq: 3000, gain: 1.0, type: 'highpass' }); tone(t, 420, 0.9, { type: 'sawtooth', gain: 0.18, to: 90 }); tone(t, 860, 0.5, { type: 'triangle', gain: 0.1, to: 200 }); hiss(t + 0.05, 0.7, { freq: 900, to: 300, q: 1, gain: 0.3 }); },
    // the cabin hits the pit: a huge crash, steel crumpling, debris
    crash: (t, tone, hiss) => {
      hiss(t, 0.5, { freq: 400, gain: 1.6, type: 'lowpass' });
      tone(t, 48, 0.9, { gain: 0.9, to: 28 });
      tone(t, 130, 0.4, { type: 'square', gain: 0.25, to: 60 });
      for (let k = 0; k < 6; k++) { const t0 = t + 0.1 + k * 0.09 + Math.random() * 0.05; hiss(t0, 0.15, { freq: 2000 + Math.random() * 2500, q: 4, gain: 0.4 }); tone(t0, 600 + Math.random() * 900, 0.2, { type: 'square', gain: 0.05 }); }
    },
    // the safety gear catching: a relay, steel screeching on the rails
    caught: (t, tone, hiss) => { tone(t, 1800, 0.02, { type: 'square', gain: 0.1 }); hiss(t, 0.15, { freq: 260, gain: 0.9, type: 'lowpass' }); tone(t + 0.03, 1400, 0.7, { type: 'sawtooth', gain: 0.07, to: 600 }); hiss(t + 0.03, 0.7, { freq: 3600, to: 1800, q: 6, gain: 0.35 }); },
    // a bulb bursting: a pop, glass tinkling, a fizz
    pop: (t, tone, hiss) => { hiss(t, 0.05, { freq: 2500, gain: 0.9, type: 'highpass' }); tone(t, 900, 0.05, { type: 'square', gain: 0.08 }); for (let k = 0; k < 4; k++) tone(t + 0.04 + k * 0.05, 3000 + Math.random() * 2500, 0.06, { type: 'triangle', gain: 0.05 }); hiss(t + 0.02, 0.35, { freq: 6000, q: 2, gain: 0.12 }); },
  };
  // [refDistance, rolloff]: the generator and the crash carry far
  const FAR = { breaker: [2.5, 1.2], genstart: [8, 0.7], genstop: [8, 0.7], genout: [8, 0.7], grind: [6, 0.8], snap: [8, 0.8], crash: [14, 0.6], caught: [8, 0.8], pop: [3, 1.1] };

  // The running generator: a loud, rough engine note, heard far away (from its exhaust).
  function engineStart() {
    if (engine || !P || performance.now() < engineTry) return;
    engineTry = performance.now() + 1000; // (no sound yet: try again in a second)
    try {
      const out = audio.out(P.gen.exhaust, [10, 0.5], false), c = ctxOf(out);
      if (c.state !== 'running') return;
      const g = c.createGain(), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.11, c.currentTime, 0.3);
      f.type = 'lowpass'; f.frequency.value = 900;
      const o1 = c.createOscillator(), o2 = c.createOscillator(), src = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
      o1.type = 'sawtooth'; o1.frequency.value = 29;
      o2.type = 'square'; o2.frequency.value = 58.5;
      lfo.frequency.value = 14.5; lg.gain.value = 0.05; // (the cylinder's beat)
      lfo.connect(lg).connect(g.gain);
      src.buffer = noiseBuf; src.loop = true;
      nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 0.8; ng.gain.value = 0.35;
      src.connect(nf).connect(ng).connect(f);
      o1.connect(f); o2.connect(f);
      f.connect(g).connect(out);
      for (const o of [o1, o2, src, lfo]) o.start();
      engine = { c, g, nodes: [o1, o2, src, lfo] };
    } catch { engine = null; }
  }
  function engineStop(now = false) {
    if (!engine) return;
    const { c, g, nodes } = engine;
    engine = null;
    try {
      g.gain.setTargetAtTime(0.0001, c.currentTime, now ? 0.01 : 0.25);
      for (const o of nodes) o.stop(c.currentTime + (now ? 0.05 : 1.2));
    } catch { /* already stopped */ }
  }

  // ---------------------------------------------------------------- what E would do (the same as the server's use())
  const okPhase = () => ctx.game.phase === 'live' || ctx.game.phase === 'warmup';
  function hintFor(a) {
    const t = serverNow(), T = me.team === 'T', CT = me.team === 'CT';
    if (!a || (!T && !CT)) return null;
    if (a[0] === 'b') {
      const k = +a[1], c = CIRCUIT_NAMES[CIRCUITS[k]], on = !!st.b[k];
      if (T) return on ? `Hold E to switch off the breaker for ${c} (${BREAKER.hold} s)` : `The breaker for ${c} is off`;
      return on ? `The breaker for ${c} is on (the Terrorists can switch it off)` : `Hold E to switch the breaker for ${c} back on (${BREAKER.hold} s)`;
    }
    if (a === 'g') {
      const running = genRunning(st, t), fuel = Math.ceil(genFuel(st, t));
      if (CT) return running ? `The generator is running — ${fuel} s of fuel left` : fuel <= 0 ? 'The generator\'s tank is empty' : `Hold E to start the generator (${GEN.start} s) — it lights both floors while the mains is off (${fuel} s of fuel)`;
      return running ? `Hold E to switch the generator off (${GEN.stop} s) — ${fuel} s of fuel left` : 'The generator is off (the CTs can start it)';
    }
    if (st.cut) return 'The lift\'s cable has been cut — the lift is out of order';
    return T ? `Hold E to cut the lift's cable (${CABLE.hold} s) — the cabin falls with everyone in it` : 'The lift\'s winch — the Terrorists could cut its cable here';
  }

  // ---------------------------------------------------------------- the state
  function onState(m) {
    last = m;
    st = { main: m.main, b: m.b.slice(), g: m.g.slice(), burst: m.burst.slice(), cut: m.cut };
    if (!P) return;
    const key = JSON.stringify([st.b, st.cut]);
    if (key !== drawn) {
      drawn = key;
      buildPanel();
      buildWinch();
      winch.updateMatrix(); panel.updateMatrix();
    }
  }

  return {
    load(m) {
      dispose();
      map = m;
      P = m.power || null;
      st = freshState();
      if (!P) return;
      if (last) onState(last);
      sentAim = undefined;
      aim = null;
      build();
    },
    handlers: {
      power(m) { last = m; if (P) onState(m); else st = { main: m.main, b: m.b.slice(), g: m.g.slice(), burst: m.burst.slice(), cut: m.cut }; },
      pwPop(m) {
        if (!P) return;
        for (let i = 0; i < 3; i++) fx.sparks(m.p, [0, -1, 0]);
        fx.flashLight(m.p, 8, 0.1, 0xfff4d0);
        sound(m.p, FAR.pop, SFX.pop);
      },
      pwSfx(m) {
        if (!P) return;
        const f = SFX[m.s];
        if (f) sound(m.p, FAR[m.s], f);
        if (m.s === 'grind') grindUntil = performance.now() + (m.d || CABLE.hold) * 1000;
        if (m.s === 'snap') { for (let i = 0; i < 3; i++) fx.sparks(m.p, [0, 0.5, 0]); grindUntil = 0; }
        if (m.s === 'crash') { fx.dust(m.p, 1.4); for (let i = 0; i < 4; i++) fx.sparks([m.p[0] + (Math.random() - 0.5), m.p[1], m.p[2] + (Math.random() - 0.5)], [0, 1, 0]); fx.flashLight(m.p, 6, 0.15, 0xffc080); }
        if (m.s === 'caught') for (const dx of [-0.7, 0.7]) fx.sparks([m.p[0] + dx, m.p[1], m.p[2]], [0, -1, 0]);
        if (m.s === 'genstart' || m.s === 'genout') fx.puff(P.gen.exhaust, 0x2a2a2a, 0.9, 1.2, 0.4);
      },
    },
    update(dt, now) {
      if (!P) return;
      const t = serverNow(), running = genRunning(st, t);
      // the generator: shaking, smoking, roaring while it runs
      if (running) {
        engineStart();
        gen.position.set(Math.sin(now * 0.09) * 0.004, Math.abs(Math.sin(now * 0.13)) * 0.003, Math.cos(now * 0.07) * 0.003);
        if (now > puffAt && Math.hypot(me.p[0] - P.gen.exhaust[0], me.p[2] - P.gen.exhaust[2]) < 30) {
          puffAt = now + 450;
          fx.puff([P.gen.exhaust[0] + 0.25, P.gen.exhaust[1], P.gen.exhaust[2]], 0x4a4a48, 0.5, 1.1, 0.35);
        }
      } else {
        if (engine) engineStop();
        if (gen.position.x || gen.position.y || gen.position.z) gen.position.set(0, 0, 0);
      }
      // someone cutting the cable: sparks off the ropes
      if (grindUntil > performance.now() && Math.random() < 0.5 && Math.hypot(me.p[0] - P.winch.rope[0], me.p[2] - P.winch.rope[2]) < 30) fx.sparks(P.winch.rope, [1, 0.2, 0]);
      // what E is aimed at: told to the server when it changes
      let a = null;
      if (me.alive && !me.act) {
        const eye = [me.p[0], me.p[1] + (me.eyeH || PLAYER.eye), me.p[2]], dir = aimDir(me.yaw, me.pitch), hit = aimAt(P, eye, dir);
        if (hit) {
          const wall = ctx.coll().raycast(eye, dir, hit.t + 0.01);
          if (!wall || wall.t >= hit.t - 0.05) a = hit.a;
        }
      }
      aim = a;
      if (aim !== sentAim) { sentAim = aim; net.send({ t: 'pwAim', a: aim }); }
    },
    hint() { return P && me.alive && !me.act && okPhase() ? hintFor(aim) : null; },
    progress(a) {
      if (a === 'pwBreaker') return 'Switching the breaker...';
      if (a === 'pwGen') return genRunning(st, serverNow()) ? 'Switching the generator off...' : 'Starting the generator...';
      if (a === 'pwCut') return 'Cutting the lift\'s cable...';
      return null;
    },
    // Is this circuit live? (Maps without the house's power: the blackout's state.)
    powered(c) { return P ? live(st, c, serverNow()) : ctx.game.lights?.power !== false; },
    // Is there power at this point? (The circuit of the house's room it's in; true elsewhere.)
    poweredAt(pos) { if (!P) return ctx.game.lights?.power !== false; const c = circuitAt(map, pos); return !c || live(st, c, serverNow()); },
    // (tests) the state, what E is aimed at
    debug: () => ({ st, aim, engine: !!engine }),
  };
}
