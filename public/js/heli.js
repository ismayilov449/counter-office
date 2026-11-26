// The SWAT helicopter, the browser's part (ROADMAP 18, stage 1; rules in shared/heli.js, the server's part
// lib/heli.js): its model and pad, where it is (the snapshot's hl, smoothed; the pilot's own flying is ours), the
// pilot's controls and chase camera, a passenger's seat, the rotor's sound, the hints.
import * as THREE from 'three';
import { HELI, S, SEATS, GUNNERS, seatPos, heliBoxes, stepHeli, heliGround, nosePos } from '/shared/heli.js';
import { mergeByMaterial } from './world.js';

const ROTOR_Y = 2.95; // (the rotor's hub, full size: just over the engine)
const EYE = [0.45, 1.6, -0.55]; // (the pilot's eyes in the cockpit, full size: right, up, back along +z)

// Stage 2: the door gunners' PKTs (on the model, turned the way their gunners look), the fast rope (whoever slides down
// it: the rope from the door to him; our own slide follows the server's path).
// ctx: { me, game, scene, audio, hud, send(m), map(), coll(), keys(), remotes }
export function createHeli(ctx) {
  const { me } = ctx;
  let model = null, pad = null, rotor = null, tailRotor = null, paint = null, beacon = null, mapTex = null, mfdCanvas = null, mapAt = 0, legs = null, view = null;
  let radarData = null; // (the HUD radar's dots this frame: main.js heliC.radar()) // view: { p, yaw, tilt, roll, st, hp, fuel, seats }
  let own = null; // the pilot's own flying: { p, yaw, v, tilt, roll, landed, engine, sent }
  // the pilot's view: from the cockpit (look: the eyes' pitch) or chasing it from behind (pitch: the camera's height)
  let cam = { yaw: 0, pitch: 0.25, look: -0.12, chase: false }, spinA = 0, spinV = 0, last = 0, guns = [];
  const ropes = new Map(); // stage 2: id -> { line, until } for whoever slides down the rope
  // the pilot's flares: bright sparks falling away from it for a few seconds
  const sparks = [];
  let sparkTex = null, rocketAt = 0;
  const _dir = new THREE.Vector3();
  // Where a rocket would go now: toward what the middle of the screen is on, or locked onto an enemy near it (within
  // LOCK radians of the middle, in sight of the nose); { o, d, at (where it hits), locked }.
  const LOCK = 0.09;
  function aimAt(camera) {
    camera.getWorldDirection(_dir);
    const c = [camera.position.x, camera.position.y, camera.position.z], d = [_dir.x, _dir.y, _dir.z], coll = ctx.coll();
    const o = nosePos(own);
    let target = null, best = LOCK;
    for (const r of ctx.remotes.values()) {
      if (!r.alive || r.team === me.team || !r.buf?.length) continue;
      const q = [r.p[0], r.p[1] + 1.0, r.p[2]], v = [q[0] - c[0], q[1] - c[1], q[2] - c[2]], l = Math.hypot(...v);
      const ang = Math.acos(Math.min(1, (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / l));
      if (ang >= best || l > 200) continue;
      const w = [q[0] - o[0], q[1] - o[1], q[2] - o[2]], lw = Math.hypot(...w), h = coll.raycast(o, w.map(x => x / lw), lw, 'bullet', 'heli');
      if (h && h.t < lw - 0.5) continue; // (a wall between the nose and him)
      best = ang; target = q;
    }
    if (!target) { const h = coll.raycast(c, d, 250, 'bullet', 'heli'), t = h ? h.t : 250; target = [c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t]; }
    const w = [target[0] - o[0], target[1] - o[1], target[2] - o[2]], lw = Math.hypot(...w) || 1, dir = w.map(x => x / lw);
    const h = coll.raycast(o, dir, lw + 1, 'bullet', 'heli'), t = h ? Math.min(h.t, lw) : lw; // (what the rocket would really hit first)
    return { o, d: dir, at: [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t], locked: best < LOCK };
  }
  // The flight display (256 px): a map round it, 40 m each way, heading up and turning with it (the HUD radar's picture
  // of the map and its dots), the compass ring, the heading on top; height over the ground and speed each side; fuel
  // and hull bars and what's left of the rockets and flares at the bottom.
  function mfd() {
    const g = mfdCanvas.getContext('2d'), h = own, hud = ctx.hud, W = 256, cx = 128, cy = 132, R = 92;
    g.fillStyle = '#05080a'; g.fillRect(0, 0, W, W);
    g.strokeStyle = '#2a3a44'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, W - 6);
    if (!h) return;
    const { toR, s } = hud.radarXform(200), k = R / 40 / s; // (radar px per m: s; ours: R px for 40 m)
    const [hx, hz] = toR(h.p[0], h.p[2]), c = Math.cos(h.yaw), sn = Math.sin(h.yaw);
    const at = (x, z) => { const [px, pz] = toR(x, z), dx = (px - hx) * k, dz = (pz - hz) * k; return [cx + dx * c - dz * sn, cy + dx * sn + dz * c]; };
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#0d1a14'; g.fillRect(0, 0, W, W);
    if (hud.radarBg) { g.save(); g.translate(cx, cy); g.rotate(h.yaw); g.scale(k, k); g.translate(-hx, -hz); g.globalAlpha = 0.9; g.drawImage(hud.radarBg, 0, 0); g.restore(); }
    const dot = (p, color, r) => { const [x, y] = at(p[0], p[2]); g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    for (const m of radarData?.hostages || []) dot(m.p, '#ffffff', 3);
    for (const m of radarData?.mates || []) if (m.p) dot(m.p, '#5ab0ff', 4);
    for (const m of radarData?.enemies || []) if (m.p && !(m.fade < 1)) dot(m.p, '#ff3a2a', 4.5);
    for (const [id, r] of ctx.remotes) if (tags.get(id)?.visible) dot(r.p, '#ff3a2a', 4.5); // (and the ones it sees itself)
    g.restore();
    // the range rings, ourselves in the middle
    g.strokeStyle = 'rgba(120, 220, 160, 0.35)'; g.lineWidth = 1;
    for (const r of [R / 2, R]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#e8fff0'; g.beginPath(); g.moveTo(cx, cy - 9); g.lineTo(cx + 6, cy + 6); g.lineTo(cx, cy + 3); g.lineTo(cx - 6, cy + 6); g.closePath(); g.fill();
    // the compass: N E S W round the ring (north is -z)
    const hdg = ((((-h.yaw * 180) / Math.PI) % 360) + 360) % 360;
    g.font = 'bold 13px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [l, deg] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) { const a = ((deg - hdg) * Math.PI) / 180; g.fillStyle = l === 'N' ? '#ff7060' : '#9fe0b8'; g.fillText(l, cx + Math.sin(a) * (R - 10), cy - Math.cos(a) * (R - 10)); }
    // the readouts
    const alt = Math.max(0, h.p[1] - heliGround(ctx.coll().move('heli', h.p, 9), h.p, h.yaw)), spd = Math.hypot(h.v[0], h.v[2]) * 3.6;
    g.fillStyle = '#9fe0b8'; g.font = 'bold 15px Consolas, monospace';
    g.fillText('HDG ' + String(Math.round(hdg) % 360).padStart(3, '0'), cx, 16);
    g.textAlign = 'left'; g.fillText('ALT', 10, 40); g.fillText(alt.toFixed(1) + 'm', 10, 58);
    g.textAlign = 'right'; g.fillText('SPD', W - 10, 40); g.fillText(String(Math.round(spd)), W - 10, 58);
    const bar = (y, label, f, color) => { g.textAlign = 'left'; g.fillStyle = '#9fe0b8'; g.font = 'bold 12px Consolas, monospace'; g.fillText(label, 10, y + 5); g.fillStyle = '#1c2a24'; g.fillRect(50, y, 120, 10); g.fillStyle = color; g.fillRect(50, y, 120 * Math.max(0, Math.min(1, f)), 10); };
    bar(W - 34, 'FUEL', view.fuel / HELI.fuel, view.fuel < 20 ? '#ff5030' : '#ffd040');
    bar(W - 18, 'HULL', view.hp / 100, view.hp < 35 ? '#ff5030' : '#60d080');
    g.textAlign = 'right'; g.fillStyle = '#ffffff'; g.font = 'bold 13px Consolas, monospace';
    g.fillText('R' + (view.rockets ?? 0) + '  F' + (view.flares ?? 0), W - 10, W - 22);
  }
  // In it (the pilot and the door gunners): a red diamond over every enemy it has a clear line to, so the ones down
  // below between the hedges and on the roofs stand out. (Their lines are checked 8 times a second.)
  const tags = new Map(); // remote id -> sprite
  let tagTex = null, tagAt = 0;
  function targets(now) {
    const on = me.alive && me.heli && (me.heli.seat === 0 || GUNNERS.includes(me.heli.seat)) && view.st < 2;
    if (!on) { for (const s of tags.values()) s.visible = false; return; }
    if (!tagTex) {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d');
      g.strokeStyle = '#ff3020'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(16, 3); g.lineTo(29, 16); g.lineTo(16, 29); g.lineTo(3, 16); g.closePath(); g.stroke();
      tagTex = new THREE.CanvasTexture(c);
    }
    const check = now - tagAt > 125;
    if (check) tagAt = now;
    const eye = seatPos(shown(), me.heli.seat), coll = ctx.coll();
    eye[1] += 1.0 * S;
    for (const [id, r] of ctx.remotes) {
      let s = tags.get(id);
      const enemy = r.alive && r.team !== me.team && r.buf?.length;
      if (!enemy) { if (s) s.visible = false; continue; }
      if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false })); s.scale.setScalar(0.035); s.renderOrder = 9; ctx.scene.add(s); tags.set(id, s); }
      s.position.set(r.p[0], r.p[1] + 2.1, r.p[2]);
      if (!check) continue;
      const q = [r.p[0], r.p[1] + 1.2, r.p[2]], d = [q[0] - eye[0], q[1] - eye[1], q[2] - eye[2]], l = Math.hypot(...d);
      const h = l < 150 && coll.raycast(eye, d.map(v => v / l), l, 'bullet', 'heli');
      s.visible = l < 150 && !(h && h.t < l - 0.6);
    }
  }
  // the pilot's target marker: drawn over everything where the rocket would hit; red when locked onto someone
  let marker = null;
  function markerAt(a) {
    if (!marker) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      g.strokeStyle = '#fff'; g.lineWidth = 4;
      g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2); g.stroke();
      for (const [x1, y1, x2, y2] of [[32, 2, 32, 16], [32, 48, 32, 62], [2, 32, 16, 32], [48, 32, 62, 32]]) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
      marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      marker.scale.setScalar(0.05);
      marker.renderOrder = 10;
      ctx.scene.add(marker);
    }
    marker.visible = !!a;
    if (!a) return;
    marker.position.set(a.at[0], a.at[1], a.at[2]);
    marker.material.color.setHex(a.locked ? 0xff3020 : view.rockets > 0 ? 0xffffff : 0x777777);
    marker.scale.setScalar(a.locked ? 0.065 : 0.05);
  }

  function build() {
    if (model) { ctx.scene.remove(model, pad); model = pad = null; }
    const H = ctx.map().heli;
    if (!H) return;
    // (built at full size, front -z, drawn at shared/heli.js's S; its boxes in shared/heli.js stay a 2.0 x 4.4 body)
    paint = new THREE.MeshLambertMaterial({ color: 0x1d2a44 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x15181c }), steel = new THREE.MeshLambertMaterial({ color: 0x7c8288 });
    const white = new THREE.MeshLambertMaterial({ color: 0xd8dade }), seat = new THREE.MeshLambertMaterial({ color: 0x2b2d30 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4dc, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    model = new THREE.Group();
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); model.add(m); return m; };
    // the nose: a glass bubble over a painted chin (one sphere, its top and bottom halves), the windscreen's frame
    add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.98, 1.0, 1.15), glass, 0, 1.3, -1.0);
    add(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.98, 0.75, 1.15), glass, 0, 1.3, -1.0); // (its chin glass too: the pilot sees down past his feet)
    add(new THREE.TorusGeometry(0.98, 0.035, 6, 24, Math.PI).scale(1, 1.0, 1), dark, 0, 1.3, -1.0, 0, 0, 0); // (the frame across its top)
    add(new THREE.BoxGeometry(0.06, 1.0, 0.06), dark, 0, 1.8, -1.95, -0.5); // (the centre post)
    // the cabin: its floor and belly, the roof, the back wall, the posts each side of the open doors
    add(new THREE.BoxGeometry(1.96, 0.75, 2.4), paint, 0, 0.92, 0.6);
    add(new THREE.BoxGeometry(1.9, 0.1, 2.5), paint, 0, 2.3, 0.4);
    add(new THREE.BoxGeometry(1.96, 1.4, 0.1), paint, 0, 1.6, 1.8);
    for (const x of [-0.95, 0.95]) for (const z of [-0.35, 1.75]) add(new THREE.BoxGeometry(0.08, 1.4, 0.1), paint, x, 1.6, z);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.12, 2.3), white, s * 0.99, 1.22, 0.6); // (a white stripe along each side: outside only, nothing under the pilot's feet)
    // the engine and its exhaust on the roof
    add(new THREE.BoxGeometry(1.0, 0.45, 1.9), paint, 0, 2.58, 0.9);
    add(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 10), dark, 0.25, 2.65, 1.95, Math.PI / 2);
    // inside: the instrument panel (its screens glow), two seats in front and a bench behind, the pilot's stick
    // (small and low, well under the pilot's eyes: the glass ahead of him stays clear)
    add(new THREE.BoxGeometry(1.1, 0.16, 0.3), dark, 0, 1.12, -1.5, -0.4);
    for (const x of [-0.42, 0.42]) add(new THREE.PlaneGeometry(0.18, 0.11), new THREE.MeshBasicMaterial({ color: 0x3aa0d8 }), x, 1.18, -1.36, -0.4);
    // the moving map in front of the pilot: the radar's own picture (the HUD's canvas, copied a few times a second)
    // the flight display in front of the pilot (drawn by mfd(): a moving map turning with it, the compass, the readouts)
    if (ctx.hud.el) {
      mfdCanvas = document.createElement('canvas');
      mfdCanvas.width = mfdCanvas.height = 256;
      mapTex = new THREE.CanvasTexture(mfdCanvas);
      add(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: mapTex, transparent: true, opacity: 0.72, depthWrite: false }), 0, 1.22, -1.33, -0.4); // (in the middle of the panel, a little see-through)
    }
    // the pilot's own legs (only we see them, from his seat: everyone else sees his body sitting there)
    legs = new THREE.Group();
    const trousers = new THREE.MeshLambertMaterial({ color: 0x2a3038 }), boots = new THREE.MeshLambertMaterial({ color: 0x141414 });
    for (const dx of [-0.12, 0.12]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.48), trousers); thigh.position.set(0.45 + dx, 1.08, -0.8);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.46, 0.13), trousers); shin.position.set(0.45 + dx, 0.85, -1.08); shin.rotation.x = -0.35;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.26), boots); boot.position.set(0.45 + dx, 0.62, -1.21);
      legs.add(thigh, shin, boot);
    }
    for (const dx of [-0.12, 0.12]) add(new THREE.BoxGeometry(0.12, 0.03, 0.16), dark, 0.45 + dx, 0.55, -1.25); // (the pedals)
    model.add(legs);
    for (const x of [-0.45, 0.45]) { add(new THREE.BoxGeometry(0.55, 0.12, 0.55), seat, x, 0.95, -0.6); add(new THREE.BoxGeometry(0.55, 0.65, 0.1), seat, x, 1.3, -0.3, 0.15); } // (25 cm further back than they were: more glass ahead)
    add(new THREE.BoxGeometry(1.6, 0.12, 0.6), seat, 0, 0.95, 1.4); add(new THREE.BoxGeometry(1.6, 0.6, 0.1), seat, 0, 1.3, 1.7);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), dark, 0.45, 1.15, -0.9, -0.3);
    guns = GUNNERS.map(i => { // the door guns: a receiver and a barrel on a pivot in each door
      const g = new THREE.Group(), side = SEATS[i][0] >= 0 ? 1 : -1;
      g.position.set(side * 1.02, 1.5, -SEATS[i][2]);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.45), dark), barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), dark);
      body.position.z = -0.1; barrel.position.z = -0.7;
      g.add(body, barrel);
      g.userData = { side, seat: i };
      model.add(g);
      return g;
    });
    // the tail: a boom thinning towards its end, the stabiliser across it, the fin raked back, "SWAT" on each side
    add(new THREE.CylinderGeometry(0.16, 0.34, 4.0, 12), paint, 0, 1.75, 3.75, Math.PI / 2);
    add(new THREE.BoxGeometry(1.5, 0.06, 0.4), paint, 0, 1.75, 4.9);
    add(new THREE.BoxGeometry(0.08, 1.1, 0.6), paint, 0, 2.25, 5.65, 0.35);
    const label = document.createElement('canvas');
    label.width = 128; label.height = 32;
    const lg = label.getContext('2d');
    lg.fillStyle = '#e8e8e8'; lg.font = 'bold 26px sans-serif'; lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.fillText('SWAT', 64, 17);
    const word = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(label), transparent: true, depthWrite: false });
    for (const s of [-1, 1]) add(new THREE.PlaneGeometry(1.3, 0.32), word, s * 0.29, 1.76, 3.1, 0, s * Math.PI / 2);
    beacon = add(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010 }), 0, 2.8, 5.85);
    // the skids: two tubes turned up at the front, two struts each side up to the belly
    for (const x of [-0.85, 0.85]) {
      add(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 8), steel, x, 0.05, 0.2, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), steel, x, 0.2, -1.75, Math.PI / 2 - 0.6);
      for (const z of [-0.9, 1.2]) add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), steel, x * 0.85, 0.35, z, 0, 0, x > 0 ? 0.3 : -0.3);
    }
    // the mast and hub over the engine, two long thin blades
    add(new THREE.CylinderGeometry(0.08, 0.1, ROTOR_Y - 2.8, 8), dark, 0, (ROTOR_Y + 2.8) / 2, 0);
    rotor = new THREE.Group();
    rotor.position.set(0, ROTOR_Y, 0);
    rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), dark));
    for (const a of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.BoxGeometry(HELI.rotor, 0.03, 0.22), dark); b.position.x = Math.cos(a) * HELI.rotor / 2; b.position.z = -Math.sin(a) * HELI.rotor / 2; rotor.add(b); }
    model.add(rotor);
    tailRotor = new THREE.Group();
    tailRotor.position.set(0.12, 2.3, 5.75);
    for (const a of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.1, 0.1), dark); b.rotation.x = a; tailRotor.add(b); }
    model.add(tailRotor);
    mergeByMaterial(model, [beacon]); // (the legs are a group: they stay apart, shown only to the pilot himself) // (one mesh per material for the fixed parts: the rotors, the door guns and the light move)
    model.scale.setScalar(S); // (built at full size, drawn at shared/heli.js's S)
    ctx.scene.add(model);
    // the pad: a white H in a circle on the street
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.strokeStyle = '#e8e8e8'; g.lineWidth = 14; g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e8e8e8'; g.fillRect(78, 60, 22, 136); g.fillRect(156, 60, 22, 136); g.fillRect(78, 117, 100, 22);
    pad = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    pad.position.set(H.p[0], H.p[1] + 0.02, H.p[2]);
    ctx.scene.add(pad);
    view = { p: H.p.slice(), yaw: H.yaw, tilt: 0, roll: 0, st: 0, hp: 100, fuel: HELI.fuel, seats: [] };
  }
  const shown = () => (own && me.heli?.seat === 0 ? own : view);
  const pilotNow = () => me.alive && me.heli?.seat === 0 && own;

  return {
    load() { build(); own = null; me.heli = null; },
    handlers: {
      heliIn(m) {
        me.heli = { seat: m.seat };
        own = null;
        if (m.seat === 0) own = { p: m.h.p.slice(), yaw: m.h.yaw, v: m.h.v.slice(), tilt: 0, roll: 0, landed: true, engine: !m.h.out, sent: 0 };
        cam = { yaw: 0, pitch: 0.25, look: -0.12, chase: cam.chase };
      },
      heliOut(m) { me.heli = null; own = null; me.p = m.p.slice(); me.v = [0, 0, 0]; me.onGround = false; me.viewY = me.p[1]; },
      slide(m) {
      const now = performance.now();
      if (m.id === me.id) { me.heli = null; own = null; me.slide = { ...m, t0: now }; }
      const old = ropes.get(m.id);
      if (old) ctx.scene.remove(old.line);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x2a2a2a }));
      line.frustumCulled = false;
      ctx.scene.add(line);
      ropes.set(m.id, { line, m, until: now + ((m.y0 - m.g) / m.v) * 1000 + 400 });
    },
    heliFlare(m) {
      ctx.audio.play('flare', m.p);
      if (!sparkTex) {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        r.addColorStop(0, 'rgba(255,250,220,1)'); r.addColorStop(0.3, 'rgba(255,170,60,0.9)'); r.addColorStop(1, 'rgba(255,120,20,0)');
        g.fillStyle = r; g.fillRect(0, 0, 32, 32);
        sparkTex = new THREE.CanvasTexture(c);
      }
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.position.set(m.p[0], m.p[1] + 0.5, m.p[2]);
        s.scale.setScalar(0.7);
        ctx.scene.add(s);
        const a = (i / 10) * Math.PI * 2;
        sparks.push({ s, v: [Math.cos(a) * (3 + Math.random() * 3), 1 + Math.random() * 2, Math.sin(a) * (3 + Math.random() * 3)], t0: performance.now() });
      }
    },
    slideEnd(m) { me.slide = null; me.p = m.p.slice(); me.v = [0, 0, 0]; me.onGround = true; me.viewY = me.p[1]; },
    heliFuel(m) { if (own) own.engine = false; ctx.hud.small(m.dead ? 'HIT! The helicopter is going down — jump (E)!' : 'OUT OF FUEL! The engine stopped — get out (E)!', 4); },
    },
    snapshot(hl) {
      if (!hl || !view) return;
      const [x, y, z, yaw, tilt, roll, st, hp, fuel, seats, side = 0, rockets = 0, flares = 0] = hl;
      Object.assign(view, { target: [x, y, z], tyaw: yaw, tilt, roll, st, hp, fuel, seats, side: [null, 'T', 'CT'][side], rockets, flares });
      if (st >= 2 && own) own.engine = false; // (falling or wrecked: the server has it now)
      if (st >= 2 && me.heli?.seat === 0) own = null;
    },
    piloting: () => !!pilotNow(),
    yaw: () => own?.yaw ?? 0, // (the pilot's radar turns with it)
    // main.js, before the HUD radar: its dots (teammates, enemies seen, hostages) for the cockpit's display.
    radar(mates, enemies, hostages) { radarData = { mates, enemies, hostages }; },
    // Q in it: on the ground, to a door gun and back (like the pickup's gun).
    // Mouse1 flying: a nose rocket toward what the middle of the screen is on.
    rocket(camera) {
      if (!pilotNow() || view.st >= 2) return;
      const now = performance.now();
      if (now < rocketAt) return;
      if (!(view.rockets > 0)) { ctx.hud.small('No rockets left', 1.5); return; }
      rocketAt = now + HELI.rocketGap * 1000;
      const a = aimAt(camera);
      ctx.send({ t: 'heliRocket', d: a.d.map(v => Math.round(v * 1000) / 1000) });
      ctx.audio.play('shot', null, 'rpg26');
    },
    // G flying: flares.
    flare() {
      if (!pilotNow() || view.st >= 2) return;
      if (!(view.flares > 0)) { ctx.hud.small('No flares left', 1.5); return; }
      ctx.send({ t: 'heliFlare' });
    },
    swap() {
      if (view?.st === 1) { ctx.hud.small('Land first to change seats', 2); return; }
      ctx.send({ t: 'heliSeat' });
    },
    seated: () => me.alive && !!me.heli,
    gunner: () => me.alive && GUNNERS.includes(me.heli?.seat),
    // The mouse while flying: it turns, the camera's pitch.
    mouse(dx, dy, k) {
      if (!pilotNow()) return false;
      own.yaw -= dx * k;
      if (cam.chase) cam.pitch = Math.max(-0.3, Math.min(1.2, cam.pitch + dy * k));
      else cam.look = Math.max(-1.5, Math.min(0.6, cam.look - dy * k)); // (down to nearly straight below, through the chin's glass)
      return true;
    },
    // Our own movement in it (true: handled): the pilot flies; a passenger sits.
    local(dt) {
      if (me.alive && me.slide) { // (down the rope: where the server has us)
        const s = me.slide;
        me.p = [s.x, Math.max(s.g, s.y0 - (s.v * (performance.now() - s.t0)) / 1000), s.z];
        me.v = [0, 0, 0]; me.crouch = false; me.jumpQueued = false; me.viewY = me.p[1];
        return true;
      }
      if (!me.alive || !me.heli) return false;
      const keys = ctx.keys();
      if (pilotNow()) {
        const input = { fwd: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), side: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), up: (keys.has('Space') ? 1 : 0) - (keys.has('ControlLeft') ? 1 : 0) };
        const crash = stepHeli(own, input, dt, ctx.coll().move('heli', own.p, 9), own.engine);
        if (crash > HELI.hard) ctx.send({ t: 'heliHit', s: Math.round(crash * 10) / 10 });
        ctx.coll().heli = heliBoxes(own);
        const now = performance.now();
        if (now - own.sent > 50) {
          own.sent = now;
          const r3 = v => Math.round(v * 1000) / 1000;
          const g = heliGround(ctx.coll().move('heli', own.p, 9), own.p, own.yaw);
          ctx.send({ t: 'heli', p: own.p.map(r3), yaw: r3(own.yaw), v: own.v.map(r3), tilt: r3(own.tilt), roll: r3(own.roll), air: own.p[1] - g > 0.15 ? 1 : 0 });
        }
      }
      const h = shown();
      if (h) me.p = seatPos(h, me.heli.seat);
      me.v = [0, 0, 0]; me.crouch = true; me.eyeH = 1.0; me.onGround = true; me.jumpQueued = false; me.viewY = me.p[1];
      return true;
    },
    // V flying: the cockpit or the chase camera.
    toggleView() { cam.chase = !cam.chase; ctx.hud.small(cam.chase ? 'Chase camera (V: the cockpit)' : 'Cockpit (V: the chase camera)', 1.5); },
    // The pilot's camera (true when it set it): from his seat, looking out through the glass; or from behind.
    camera(camera) {
      if (!pilotNow()) return false;
      if (!cam.chase) {
        const c = Math.cos(own.yaw), s = Math.sin(own.yaw), [ex, ey, ez] = EYE.map(v => v * S);
        camera.position.set(own.p[0] + ex * c + ez * s, own.p[1] + ey, own.p[2] - ex * s + ez * c);
        camera.rotation.set(cam.look + (own.tilt || 0), own.yaw, -(own.roll || 0), 'YXZ');
        return true;
      }
      const t = [own.p[0], own.p[1] + 1.3, own.p[2]], yaw = own.yaw + cam.yaw, p = cam.pitch;
      const dir = [Math.sin(yaw) * Math.cos(p), Math.sin(p), Math.cos(yaw) * Math.cos(p)];
      const hit = ctx.coll().raycast(t, dir, 8, 'solid'), d = hit ? Math.max(1.5, hit.t - 0.3) : 8;
      camera.position.set(t[0] + dir[0] * d, t[1] + dir[1] * d, t[2] + dir[2] * d);
      camera.lookAt(t[0], t[1], t[2]);
      return true;
    },
    hint() {
      if (!view || !ctx.map().heli) return null;
      if (me.alive && me.heli) {
        const fuel = Math.ceil(view.fuel), hull = view.hp, gun = GUNNERS.includes(me.heli.seat), q = view.st === 1 ? '' : gun ? ' · Q: leave the gun' : ' · Q: a door gun';
        return me.heli.seat === 0
          ? `${me.team === 'T' ? 'STOLEN HELICOPTER · ' : 'HELICOPTER · '}fuel ${fuel} s · hull ${hull}% · Mouse1 rocket (${view.rockets}) · G flares (${view.flares}) · W/S A/D fly · Space up · Ctrl down · V: view · E: get out${q}`
          : `${gun ? 'DOOR GUN · Mouse1 fires (no reloads)' : 'In the helicopter'} · hull ${hull}% · E: ${view.st === 1 ? 'slide down the rope (hovering slowly) or jump' : 'get out'}${q}`;
      }
      if (!me.alive || (me.team !== 'CT' && me.team !== 'T') || view.st >= 2) return null;
      const h = shown();
      if (Math.hypot(me.p[0] - h.p[0], me.p[2] - h.p[2]) > HELI.reach || Math.abs(me.p[1] - h.p[1]) > 2.5) return null;
      const free = SEATS.findIndex((_, i) => !(view.seats?.[i]));
      if (free < 0) return 'The helicopter is full';
      if (view.side && view.side !== me.team) return null;
      if (me.team === 'T') return free === 0 ? 'Press E to steal the helicopter and fly it' : 'Press E to get into the stolen helicopter';
      return free === 0 ? `Press E to fly the helicopter (fuel ${Math.ceil(view.fuel)} s)` : 'Press E to get into the helicopter';
    },
    frame(now) {
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      if (!model || !view) return;
      // others' view: ease towards the snapshot
      if (view.target) {
        const k = Math.min(1, dt * 10);
        for (let i = 0; i < 3; i++) view.p[i] += (view.target[i] - view.p[i]) * k;
        let dy = view.tyaw - view.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        view.yaw += dy * k;
      }
      const h = shown();
      if (!own || me.heli?.seat !== 0) ctx.coll().heli = heliBoxes(view);
      model.position.set(h.p[0], h.p[1], h.p[2]);
      model.rotation.set(h.tilt || 0, h.yaw, -(h.roll || 0), 'YXZ');
      // the rotor spins up while anyone is in it (or it flies), down when it's empty or wrecked
      const running = view.st === 1 || (view.st === 0 && view.seats?.some(Boolean)) || (own && own.engine);
      spinV += ((running && view.st !== 3 ? 1 : 0) - spinV) * Math.min(1, dt * 0.8);
      spinA += spinV * dt * 28;
      rotor.rotation.y = spinA;
      tailRotor.rotation.x = spinA * 1.7;
      model.visible = true;
      paint.color.setHex(view.st === 3 ? 0x1a1a1a : 0x1d2a44);
      beacon.visible = view.st !== 3 && Math.floor(now / 600) % 2 === 0; // (the tail's red light blinks)
      // the door guns turn the way their gunners look; an empty one points out of its door
      for (const g of guns) {
        const id = view.seats?.[g.userData.seat], r = id && (id === me.id ? me : ctx.remotes.get(id));
        const yaw = r ? (r === me ? me.yaw : r.yaw) - h.yaw : -g.userData.side * Math.PI / 2, pitch = r ? (r === me ? me.pitch : r.pitch) : -0.2;
        g.rotation.set(pitch, yaw, 0, 'YXZ');
        g.visible = !(r === me); // (our own: the view model)
      }
      // the fast ropes: from the door over its slider to him
      for (const [id, l] of ropes) {
        const who = id === me.id ? me : ctx.remotes.get(id);
        if (now > l.until || !who) { ctx.scene.remove(l.line); l.line.geometry.dispose(); ropes.delete(id); continue; }
        const pos = l.line.geometry.attributes.position;
        pos.setXYZ(0, l.m.x, Math.max(h.p[1] + 1.6, l.m.y0 + 1.5), l.m.z);
        pos.setXYZ(1, who.p[0], who.p[1] + 1.6, who.p[2]);
        pos.needsUpdate = true;
      }
      markerAt(pilotNow() && view.st < 2 && ctx.camera ? aimAt(ctx.camera) : null); // (the pilot: where a rocket would go)
      if (mapTex && me.heli?.seat === 0 && now - mapAt > 100) { mapAt = now; mfd(); mapTex.needsUpdate = true; } // (the cockpit's display, while we fly)
      legs.visible = me.alive && me.heli?.seat === 0;
      targets(now);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const k = sparks[i], age = (now - k.t0) / 1000;
        if (age > 2.5) { ctx.scene.remove(k.s); k.s.material.dispose(); sparks.splice(i, 1); continue; }
        k.v[1] -= 4 * dt;
        k.s.position.x += k.v[0] * dt; k.s.position.y += k.v[1] * dt; k.s.position.z += k.v[2] * dt;
        k.s.material.opacity = 1 - age / 2.5;
      }
      ctx.audio.engine('heli', [h.p[0], h.p[1] + 2, h.p[2]], 17 * spinV, spinV > 0.05);
    },
    died() { me.heli = null; own = null; me.slide = null; },
  };
}
