// A real gas system (Mansion maps; see shared/gas.js and lib/gas.js): in the browser. Draws the gas pipes (kitchen) and
// the boiler (cellar), the gas hissing out of a holed pipe, a faint shimmer in rooms with enough gas (a few soft
// sprites per room, one draw call for all of them; nothing full-screen), "You smell gas" on the HUD, the coughing of
// people choking in it, and the blast when it goes off. The server sends the rooms' gas in snapshots ('gs') while
// there is any, and 'gasLeak' / 'gasBoom' / 'gasCough' messages.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Billboards } from './billboards.js';
import { ambientAt } from './roomlight.js';
import { GAS, PIPE, gasRoomAt, gasPipes } from '/shared/gas.js';

const HAZE_MAX = 96;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// The meter's face: a white dial, a counter, GAS in red.
function dialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e8e4d8'; g.fillRect(4, 4, 56, 56);
  g.fillStyle = '#111'; g.fillRect(10, 26, 44, 12);
  g.fillStyle = '#e8e4d8'; g.font = 'bold 10px monospace'; g.fillText('04217', 16, 36);
  g.fillStyle = '#b02020'; g.font = 'bold 11px sans-serif'; g.fillText('GAS', 21, 18);
  g.strokeStyle = '#555'; g.lineWidth = 1; g.strokeRect(10, 44, 44, 8);
  return new THREE.CanvasTexture(c);
}

// ctx: { scene, camera, fx, audio, me, brk() (broken pieces), indoors(p), shellShock(s), realBlast(m) }
export function createGasClient(ctx) {
  const { scene, fx, audio, me } = ctx;
  const mats = {
    gas: new THREE.MeshLambertMaterial({ color: 0xd8b21c }),
    meter: new THREE.MeshLambertMaterial({ color: 0x7c8286 }),
    dial: new THREE.MeshLambertMaterial({ map: dialTexture() }),
    valve: new THREE.MeshLambertMaterial({ color: 0xb4241c }),
    tank: new THREE.MeshLambertMaterial({ color: 0xd6d2c6 }),
    flue: new THREE.MeshLambertMaterial({ color: 0x3a3836 }),
  };
  const soft = softTexture();
  const board = new Billboards(scene, soft, { max: HAZE_MAX, sort: true });
  board.mesh.visible = false;
  let map = null, rooms = [], pipes = [], conc = [], target = [];
  const haze = new Map(); // room -> [{ p, base, ph }]
  const puffs = [];
  let msgEl = null, msgText = '';
  let lastPuff = 0;

  // ---- the pipes' models (one mesh per material and pipe, so a wrecked pipe can go)
  function buildPipe(d) {
    const group = new THREE.Group();
    const geos = {};
    const add = (mat, geo) => (geos[mat] ||= []).push(geo);
    let lever = null;
    for (const p of d.parts) {
      if (p.k === 'pipe') {
        const a = new THREE.Vector3(...p.a), b = new THREE.Vector3(...p.b), len = a.distanceTo(b);
        const geo = new THREE.CylinderGeometry(p.r, p.r, len, 8);
        geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
        geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        add(p.c || 'gas', geo);
        // a joint where pipes meet
        const j = new THREE.SphereGeometry(p.r * 1.25, 8, 6);
        add(p.c || 'gas', j.clone().translate(p.b[0], p.b[1], p.b[2]));
      } else if (p.k === 'box') {
        const s = [0, 1, 2].map(k => p.max[k] - p.min[k]);
        add('meter', new THREE.BoxGeometry(...s).translate(...[0, 1, 2].map(k => (p.min[k] + p.max[k]) / 2)));
      } else if (p.k === 'dial') {
        const geo = new THREE.PlaneGeometry(0.2, 0.2);
        geo.lookAt(new THREE.Vector3(...p.n));
        add('dial', geo.translate(...p.p));
      } else if (p.k === 'tank') {
        add('tank', new THREE.CylinderGeometry(p.r, p.r, p.h, 16).translate(p.p[0], p.p[1] + p.h / 2, p.p[2]));
        add('flue', new THREE.CylinderGeometry(p.r * 0.85, p.r, 0.12, 16).translate(p.p[0], p.p[1] + p.h + 0.06, p.p[2]));
        add('meter', new THREE.BoxGeometry(0.22, 0.14, 0.03).translate(p.p[0] + 0.0, p.p[1] + p.h * 0.62, p.p[2] - p.r - 0.005)); // its control panel
      } else if (p.k === 'valve') {
        // a quarter-turn lever on the pipe: along the pipe's side when open, across it when shut
        lever = new THREE.Group();
        lever.position.set(...p.p);
        // (the arm and its hub in one mesh: one draw call)
        lever.add(new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.03, 0.025, 0.16).translate(0, 0, 0.09), new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8).rotateX(Math.PI / 2)]), mats.valve));
        lever.userData.open = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...p.open));
        lever.userData.shut = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...p.shut));
        lever.quaternion.copy(lever.userData.open);
        group.add(lever);
      }
    }
    for (const [m, list] of Object.entries(geos)) group.add(new THREE.Mesh(mergeGeometries(list), mats[m]));
    scene.add(group);
    return { def: d, group, lever, s: PIPE.ok, at: d.leak, room: gasRoomAt(rooms, d.leak, 0.1), hiss: null, anchors: null };
  }

  function clearAll() {
    for (const p of pipes) { stopHiss(p); scene.remove(p.group); }
    pipes = [];
    for (const list of haze.values()) for (const s of list) board.drop(s.sp);
    haze.clear();
    for (const q of puffs) board.drop(q.sp);
    puffs.length = 0;
  }

  function setMap(m) {
    clearAll();
    map = m;
    rooms = m?.rooms || [];
    conc = new Array(rooms.length).fill(0);
    target = new Array(rooms.length).fill(0);
    if (!m?.mansion2) return;
    pipes = gasPipes(m).map(buildPipe);
    // the wall pieces a pipe hangs on: when they're all gone, so is the pipe
    for (const p of pipes) {
      const h = p.def.hits;
      p.anchors = (m.breakables || []).filter(pc => h.some(b => [0, 1, 2].every(k => pc.min[k] < b[k + 3] + 0.12 && pc.max[k] > b[k] - 0.12))).map(pc => pc.id);
    }
  }

  // ---- sounds (built on the game's own audio context: audio.out() gives a node in it)
  let noiseBuf = null;
  const noise = ac => {
    if (noiseBuf?.sampleRate === ac.sampleRate) return noiseBuf;
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  };
  const audioOut = (pos, far) => { try { return audio.out(pos, far); } catch { return null; } };
  function startHiss(p) {
    if (p.hiss) return;
    const out = audioOut(p.at, [2, 1.25]);
    if (!out || out.context.state !== 'running') return;
    const ac = out.context, src = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noise(ac);
    src.loop = true;
    hp.type = 'highpass'; hp.frequency.value = 2600;
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.11, ac.currentTime, 0.05);
    src.connect(hp).connect(g).connect(out);
    src.start();
    p.hiss = { src, g, out };
  }
  function stopHiss(p) {
    if (!p.hiss) return;
    try { p.hiss.src.stop(); p.hiss.g.disconnect(); } catch { /* already gone */ }
    p.hiss = null;
  }
  // a short burst of gas from a fresh hole
  function pssht(pos) {
    const out = audioOut(pos, [3, 1.1]);
    if (!out || out.context.state !== 'running') return;
    const ac = out.context, t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noise(ac);
    f.type = 'bandpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(2500, t + 0.5); f.Q.value = 0.6;
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(f).connect(g).connect(out);
    src.start(t); src.stop(t + 0.65);
  }
  // a fit of coughing: three rough bursts
  function cough(pos) {
    const out = audioOut(pos, [3, 1.2]);
    if (!out || out.context.state !== 'running') return;
    const ac = out.context, t0 = ac.currentTime;
    for (const [dt, k] of [[0, 1], [0.3, 0.8], [0.55, 0.65]]) {
      const t = t0 + dt + Math.random() * 0.05, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = noise(ac);
      f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.18); f.Q.value = 1.4;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55 * k, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random() * 0.5); src.stop(t + 0.25);
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.16);
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.18 * k, t + 0.02); og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(og).connect(out);
      o.start(t); o.stop(t + 0.22);
    }
  }

  // ---- state from the server
  function setPipe(i, s, at) {
    const p = pipes[i];
    if (!p) return;
    if (at) p.at = at;
    if (p.s === s) return;
    p.s = s;
    if (p.lever) p.lever.quaternion.copy(s === PIPE.shut ? p.lever.userData.shut : p.lever.userData.open);
    if (s === PIPE.ok) p.at = p.def.leak;
    if (s !== PIPE.leak) stopHiss(p);
  }

  function snapshot(gs) {
    if (!map) return;
    if (!gs) {
      for (let i = 0; i < pipes.length; i++) setPipe(i, PIPE.ok);
      target.fill(0);
      return;
    }
    (gs.p || []).forEach((s, i) => setPipe(i, s));
    target.fill(0);
    const r = gs.r || [];
    for (let k = 0; k + 1 < r.length; k += 2) if (r[k] < target.length) target[r[k]] = r[k + 1] / GAS.Q;
  }

  const handlers = {
    gasLeak(m) {
      setPipe(m.i, m.s, m.p);
      if (m.s === PIPE.leak && m.p) {
        pssht(m.p);
        fx.sparks(m.p, [0, 0.3, 0]);
      }
      if (m.s === PIPE.shut && m.p) audio.play('click', m.p);
    },
    gasCough(m) {
      cough(m.id === me.id ? null : m.p);
    },
    gasBoom(m) {
      const r = rooms[m.i];
      if (!r) return;
      conc[m.i] = target[m.i] = 0;
      dropHaze(m.i);
      const big = m.s > 0.35;
      const w = r.max[0] - r.min[0], d = r.max[2] - r.min[2], floor = r.min[1] + 0.1;
      // the room fills with flame: fireballs all through it
      const n = clamp(Math.round((w * d) / 14), 2, 6);
      for (let k = 0; k < n; k++) {
        const p = [r.min[0] + 0.6 + Math.random() * Math.max(0, w - 1.2), floor + 0.4 + Math.random() * 0.8, r.min[2] + 0.6 + Math.random() * Math.max(0, d - 1.2)];
        fx.explosion(p, big && k === 0);
      }
      fx.flashLight([m.p[0], m.p[1] + 0.5, m.p[2]], big ? 4000 : 2000, 0.8, 0xffa040);
      audio.muffled = !!ctx.indoors && ctx.indoors(me.p) !== ctx.indoors(m.p);
      try { audio.play(big ? 'c4boom' : 'rpgboom', m.p); } finally { audio.muffled = false; }
      ctx.realBlast?.({ p: m.p, k: big ? 'c4' : 'satchel' });
      const dist = Math.hypot(me.p[0] - m.p[0], me.p[1] - m.p[1], me.p[2] - m.p[2]);
      me.shake = Math.max(me.shake || 0, clamp(1 - dist / 40, 0, 1) * (big ? 1.4 : 1.0));
      if (me.alive && dist < 14) ctx.shellShock?.(clamp(1.3 - dist / 14, 0.3, 1));
    },
  };

  // ---- the shimmer: a few soft, faint sprites drifting in each room with enough gas
  function dropHaze(i) {
    const list = haze.get(i);
    if (!list) return;
    for (const s of list) board.drop(s.sp);
    haze.delete(i);
  }
  function makeHaze(i) {
    const r = rooms[i], w = r.max[0] - r.min[0], d = r.max[2] - r.min[2];
    const n = clamp(Math.round((w * d) / 14), 3, 7), list = [];
    const y0 = r.min[1] + 0.5, y1 = Math.max(y0, Math.min(r.max[1] - 0.4, r.min[1] + 2.6));
    for (let k = 0; k < n; k++) {
      const sp = board.take();
      if (!sp) break;
      const base = new THREE.Vector3(r.min[0] + 0.7 + Math.random() * Math.max(0, w - 1.4), y0 + Math.random() * (y1 - y0), r.min[2] + 0.7 + Math.random() * Math.max(0, d - 1.4));
      const size = 1.8 + Math.random() * 0.9;
      sp.position.copy(base);
      sp.scale.set(size, size * 0.7, 1);
      sp.material.opacity = 0;
      list.push({ sp, base, ph: Math.random() * 100, size });
    }
    haze.set(i, list);
  }
  const _v = new THREE.Vector3();
  function update(dt, now) {
    if (!map) return;
    const t = now / 1000;
    for (let i = 0; i < conc.length; i++) {
      conc[i] += (target[i] - conc[i]) * Math.min(1, dt * 1.5);
      const c = conc[i];
      if (c >= GAS.haze && !haze.has(i)) makeHaze(i);
      else if (c < GAS.haze * 0.8 && haze.has(i)) dropHaze(i);
      const list = haze.get(i);
      if (!list) continue;
      const k = clamp((c - GAS.haze) / (0.5 - GAS.haze), 0, 1);
      for (const s of list) {
        s.sp.position.set(s.base.x + Math.sin(t * 0.23 + s.ph) * 0.6, s.base.y + Math.sin(t * 0.31 + s.ph * 2) * 0.15, s.base.z + Math.cos(t * 0.19 + s.ph) * 0.6);
        // as bright as the room is lit (in the dark you hardly see it), and it shimmers a little
        const light = clamp(ambientAt(s.sp.position) / 0.85, 0.06, 1);
        s.sp.material.color.setRGB(0.86 * light, 0.9 * light, 0.7 * light);
        s.sp.material.opacity = (0.035 + 0.1 * k) * (0.8 + 0.2 * Math.sin(t * 1.7 + s.ph));
        s.sp.material.rotation = t * 0.05 + s.ph;
      }
    }
    // gas hissing out of a holed pipe: a jet of vapour, and the hiss
    const emit = now - lastPuff > 70;
    if (emit) lastPuff = now;
    for (const p of pipes) {
      const gone = p.s === PIPE.wrecked || (p.anchors.length && p.anchors.every(id => ctx.brk()?.has(id)));
      p.group.visible = !gone;
      if (p.s !== PIPE.leak) continue;
      startHiss(p);
      if (emit && puffs.length < 30) {
        const sp = board.take();
        if (sp) {
          sp.position.set(...p.at);
          sp.scale.set(0.1, 0.1, 1);
          sp.material.color.setRGB(0.9, 0.92, 0.88);
          const n = p.def.parts.find(q => q.k === 'dial')?.n || [0, 0, 1];
          puffs.push({ sp, life: 0.8, max: 0.8, v: [n[0] * 1.6 + (Math.random() - 0.5) * 0.7, 0.25 + Math.random() * 0.4, n[2] * 1.6 + (Math.random() - 0.5) * 0.7] });
        }
      }
    }
    for (let k = puffs.length - 1; k >= 0; k--) {
      const q = puffs[k];
      q.life -= dt;
      if (q.life <= 0) { board.drop(q.sp); puffs.splice(k, 1); continue; }
      const a = 1 - q.life / q.max;
      q.sp.position.x += q.v[0] * dt; q.sp.position.y += q.v[1] * dt; q.sp.position.z += q.v[2] * dt;
      q.sp.scale.set(0.1 + a * 0.6, 0.1 + a * 0.6, 1);
      q.sp.material.opacity = 0.3 * (1 - a);
    }
    board.mesh.visible = board.items.length > 0;
    if (board.mesh.visible) board.flush(ctx.camera);
    // the HUD: what you smell where you stand
    let text = '';
    if (me.alive) {
      _v.set(me.p[0], me.p[1] + 1.5, me.p[2]);
      const i = gasRoomAt(rooms, me.p ? [me.p[0], me.p[1] + 1.5, me.p[2]] : [0, -999, 0]);
      const c = i >= 0 ? Math.max(conc[i], target[i]) : 0;
      if (c >= GAS.choke) text = 'The gas is choking you — get out!';
      else if (c >= GAS.ignite) text = 'You smell gas — a lot of it. One spark and it goes up!';
      else if (c >= GAS.smell) text = 'You smell gas';
    }
    if (text !== msgText) {
      msgText = text;
      if (!msgEl) {
        msgEl = document.createElement('div');
        msgEl.id = 'gas-msg';
        msgEl.style.cssText = 'position:absolute;top:57%;left:50%;transform:translateX(-50%);font-size:15px;color:#e2e69a;text-shadow:0 0 4px #000,0 0 2px #000;pointer-events:none;white-space:nowrap';
        (document.getElementById('hud') || document.body).appendChild(msgEl);
      }
      msgEl.textContent = text;
      msgEl.style.display = text ? '' : 'none';
    }
  }

  // The E hint by a leaking pipe's valve.
  function hint() {
    if (!me.alive || !pipes.length) return null;
    const chest = [me.p[0], me.p[1] + 1.0, me.p[2]];
    const p = pipes.find(q => q.s === PIPE.leak && Math.hypot(chest[0] - q.def.valve[0], chest[1] - q.def.valve[1], chest[2] - q.def.valve[2]) < GAS.reach);
    return p ? `Hold E to close the gas valve (${GAS.valve} s)` : null;
  }

  // for tests
  function debug() {
    return { pipes: pipes.map(p => ({ s: p.s, visible: p.group.visible, hiss: !!p.hiss })), conc: conc.map(v => +v.toFixed(3)), haze: [...haze.keys()], sprites: board.items.length, msg: msgText };
  }

  return { setMap, snapshot, handlers, update, hint, debug };
}
