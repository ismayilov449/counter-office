// Van extraction demo (a proposal, not in the game): a scripted 2-minute round on cs_mansion where the Terrorists get two
// hostages into the getaway van. Everything is a pure function of the timeline's time t (seconds), so the seek bar
// can jump anywhere. Real map (buildWorld), real player/hostage models, routes from the bots' nav grid
// (public/dev/van-routes.js, made by dev/van-demo/routes.mjs).
import * as THREE from 'three';
import { MAPS } from '/shared/maps/index.js';
import { buildWorld } from '../js/world.js';
import { setRooms, setGlow } from '../js/roomlight.js';
import { createPlayerModel, createHostageModel, posePlayer, setPlayerWeapon, createNameTag } from '../js/models.js';
import { ROUTES, VAN } from './van-routes.js';

const END = 120;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = k => k * k * (3 - 2 * k);

// ---- routes: arc length lookup
const R = {};
for (const [k, pts] of Object.entries(ROUTES)) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(...pts[i].map((v, j) => v - pts[i - 1][j])));
  R[k] = { pts, cum, len: cum.at(-1) };
}
function along(r, s) {
  s = clamp(s, 0, r.len);
  let i = 1;
  while (i < r.pts.length - 1 && r.cum[i] < s) i++;
  const a = r.pts[i - 1], b = r.pts[i], seg = r.cum[i] - r.cum[i - 1] || 1, k = (s - r.cum[i - 1]) / seg;
  return { p: a.map((v, j) => v + (b[j] - v) * k), yaw: Math.atan2(-(b[0] - a[0]), -(b[2] - a[2])) };
}
const yawTo = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));

// ---- the cast. moves: { at, r (route), v (m/s), stop (m short of the end), hold: [[from, to]] (standing still) }
const A = {
  ct1: { team: 'CT', name: 'CT-1', gun: 'm4a1', moves: [{ at: 7, r: 'ct1', v: 5 }] },
  ct2: { team: 'CT', name: 'CT-2', gun: 'm4a1', moves: [{ at: 8, r: 'ct2', v: 4.6 }, { at: 21, r: 'h2out', v: 3.4 }, { at: 81, r: 'ct2back', v: 6.2 }] },
  ct3: { team: 'CT', name: 'CT-3', gun: 'famas', moves: [{ at: 8.5, r: 'ct3', v: 5 }, { at: 70, r: 'ct3up', v: 4.5 }, { at: 85, r: 'ct3down', v: 4.7 }] },
  t1: { team: 'T', name: 'T-1', gun: 'ak47', moves: [{ at: 66, r: 't1', v: 3, stop: 3 }] },
  t2: { team: 'T', name: 'T-2', gun: 'ak47', moves: [{ at: 69, r: 't2', v: 3, stop: 3.5, hold: [] }] },
  t3: { team: 'T', name: 'T-3', gun: 'ak47', moves: [{ at: 12, r: 't3', v: 4 }] },
};
const holdTotal = m => (m.hold || []).reduce((s, [a, b]) => s + b - a, 0);
const arrive = m => m.at + (R[m.r].len - (m.stop || 0)) / m.v + holdTotal(m);

// The key times, worked out from the routes so the story lines up.
const CT2_ARR = arrive(A.ct2.moves[2]);
A.t2.moves[0].hold.push([CT2_ARR + 0.5, CT2_ARR + 2.3]); // hit: the hostage panics, T-2 stops to grab it again
const T1_ARR = arrive(A.t1.moves[0]), T2_ARR = arrive(A.t2.moves[0]);
const H2_SAFE = arrive(A.ct2.moves[1]) + 0.6;
const LOAD = 0.8, DEPART = T2_ARR + LOAD + 1.4, WIN = DEPART + 5.5;
A.ct1.dies = 18.3;
A.t3.dies = 19.8;
A.ct2.dies = CT2_ARR + 1.5;
A.t1.gone = A.t2.gone = DEPART - 0.4; // they jump in

const SHOTS = [
  { at: 17.4, from: 't3', to: 'ct1', n: 4 },
  { at: 18.9, from: 'ct2', to: 't3', n: 3 },
  { at: CT2_ARR + 0.1, from: 'ct2', to: 't2', n: 3 },
  { at: CT2_ARR + 0.8, from: 't1', to: 'ct2', n: 5 },
  { at: DEPART - 0.9, from: 'ct3', to: 'van', n: 7 },
];

// Hostages: own spot, then (leader, the leader's move, from) following 1.6 m behind on the same route.
const H = {
  h0: { p: [-22.25, 4.27, -3.658], yaw: -2.15, lead: 't1', move: 0, until: T1_ARR, out: 'van' },
  h1: { p: [-22.25, 4.27, 3.454], yaw: -1.17, lead: 't2', move: 0, until: T2_ARR, out: 'van' },
  h2: { p: [-14.122, 0.81, -1.219], yaw: 1.36, lead: 'ct2', move: 1, until: H2_SAFE, out: 'safe' },
  h3: { p: [-20.5, 0.81, 8.4], yaw: 0 },
};
const GAP = 1.6;

function moveState(a, t) {
  if (a.dies != null) t = Math.min(t, a.dies);
  let m = null;
  for (const x of a.moves) if (x.at <= t) m = x;
  if (!m) return { p: R[a.moves[0].r].pts[0].slice(), yaw: a.yaw0 ?? along(R[a.moves[0].r], 0.5).yaw, s: 0, moving: false, m: null };
  let e = t - m.at, held = false;
  for (const [h0, h1] of m.hold || []) { if (t >= h1) e -= h1 - h0; else if (t > h0) { e -= t - h0; held = true; } }
  const r = R[m.r], end = r.len - (m.stop || 0), s = clamp(e * m.v, 0, end);
  const { p, yaw } = along(r, s);
  return { p, yaw, s, moving: !held && s > 0 && s < end, m, held };
}

function actorAt(id, t) {
  const a = A[id], st = moveState(a, t);
  let yaw = st.yaw;
  for (const s of SHOTS) if (s.from === id && t > s.at - 0.4 && t < s.at + s.n * 0.12 + 0.6) yaw = yawTo(st.p, targetPos(s.to, t));
  const dead = a.dies != null && t >= a.dies;
  if (a.gone && t >= a.gone - 0.6) { // into the van
    const k = clamp((t - (a.gone - 0.6)) / 0.6, 0, 1);
    st.p = st.p.map((v, i) => v + (VAN_DOOR[i] - v) * k);
  }
  return { ...st, yaw, dead, deadK: dead ? clamp((t - a.dies) / 0.5, 0, 1) : 0, hidden: a.gone != null && t >= a.gone };
}

function hostageAt(id, t) {
  const h = H[id];
  if (!h.lead) return { p: h.p, yaw: h.yaw, state: 'idle' };
  const a = A[h.lead], m = a.moves[h.move], tt = Math.min(t, h.until);
  if (tt < m.at) return { p: h.p, yaw: h.yaw, state: 'idle' };
  const st = moveState(a, Math.min(tt, a.dies ?? Infinity));
  const s = st.m === m ? st.s - GAP : -1;
  const pos = s > 0 ? along(R[m.r], s) : { p: h.p, yaw: h.yaw };
  if (t >= h.until) {
    if (h.out === 'safe') return { ...pos, state: 'safe', hidden: true };
    const k = clamp((t - h.until) / LOAD, 0, 1); // pushed into the van
    return { p: pos.p.map((v, i) => v + (VAN_DOOR[i] - v) * ease(k)), yaw: pos.yaw, state: 'loaded', hidden: k >= 1 };
  }
  const duck = st.held; // its escort was hit: it ducks
  return { ...pos, state: duck ? 'duck' : 'follow' };
}

// ---- the van: drives in from the north wall, waits in the back garden, leaves through the south wall
const VAN_IN = 66, VAN_STOP = 74;
const VAN_DOOR = [VAN[0] + 1.3, 0.2, VAN[2]];
function vanAt(t) {
  let z;
  if (t < VAN_IN) return { hidden: true };
  if (t < VAN_STOP) z = 30 + (VAN[2] - 30) * ease((t - VAN_IN) / (VAN_STOP - VAN_IN));
  else if (t < DEPART) z = VAN[2];
  else { const e = t - DEPART; z = VAN[2] - 1.2 * e * e - 2 * e; }
  return { p: [VAN[0], 0, z], hidden: z > 24.6 || z < -24.6, door: t > VAN_STOP + 0.5 && t < DEPART - 0.3 ? 1 : 0 };
}
function targetPos(id, t) {
  if (id === 'van') { const v = vanAt(t); return v.p ? [v.p[0] + 1, 1.2, v.p[2]] : VAN; }
  const p = A[id] ? actorAt(id, t).p : hostageAt(id, t).p;
  return [p[0], p[1] + 1.2, p[2]];
}

// ---- story: banners, kill feed, captions
const BANNERS = [
  { at: 1, dur: 4.5, html: 'VAN EXTRACTION<small>proposed round rule · cs_mansion · the unhappy path for the CTs</small>' },
  { at: 6, dur: 2.5, html: 'ROUND START' },
  { at: 51, dur: 4, html: '📞 THE PHONE IS RINGING…<small>negotiations have failed</small>' },
  { at: 66, dur: 4.5, html: '<span class="t">EXTRACTION</span><small>Ts: get 2 hostages into the van · CTs: stop them</small>' },
  { at: 81, dur: 3, html: '📯 HONK! <small>the van shows on the CT radar</small>' },
  { at: WIN, dur: 9, html: '<span class="t">TERRORISTS WIN</span><small>2 hostages taken in the van</small>' },
];
const FEED = [
  { at: 18.3, html: '<span class="t">T-3</span> [AK-47] <span class="ct">CT-1</span>' },
  { at: 19.8, html: '<span class="ct">CT-2</span> [M4A1] <span class="t">T-3</span>' },
  { at: H2_SAFE, html: '<span class="ct">CT-2</span> rescued a hostage <span class="ct">+$1000</span>' },
  { at: T1_ARR + LOAD, html: '<span class="t">T-1</span> loaded a hostage <span class="t">+$1000</span>' },
  { at: A.ct2.dies, html: '<span class="t">T-1</span> [AK-47] <span class="ct">CT-2</span>' },
  { at: T2_ARR + LOAD, html: '<span class="t">T-2</span> loaded a hostage <span class="t">+$1000</span>' },
];
const CAPTIONS = [
  [0, '<b>Van Extraction</b> (a proposal). Hostages don\'t escape on their own. Four hostages: two upstairs, two downstairs.'],
  [6, '<b>STANDOFF.</b> A normal hostage round: three CTs push from the street, three Terrorists hold the house.'],
  [15, 'CT-1 takes the front door first…'],
  [18, '…T-3 is waiting in the hall. CT-2 trades him straight away.'],
  [21, 'CT-2 presses E on the downstairs hostage and leads it out. CT-3 covers the front door.'],
  [H2_SAFE, '<b>1 of 4 rescued.</b> A hostage rescued now is safe for the rest of the round.'],
  [40, 'Upstairs, T-1 and T-2 keep two hostages close. Hiding here is fine — for now.'],
  [51, '<b>15 s warning.</b> Ts hear: “The van is coming, get the hostages ready.” CTs only hear sirens: “Something\'s happening — grab the hostages NOW.”'],
  [58, 'Nobody on the CT side knows where the van will stop. CT-2 waits on the street, CT-3 holds the front door.'],
  [66, '<b>EXTRACTION.</b> The van pulls into the back garden. <b>The Ts see it, the CTs don\'t</b> — not for 15 seconds.'],
  [71, 'Ts need <b>2 of the 3 hostages</b> still held. The hostages drag their feet: an escort is slow and exposed.'],
  [75, 'CT-3 guesses wrong and sweeps upstairs — just as the Ts leave it.'],
  [81, '<b>HONK!</b> The van shows on the CT radar. CT-2 sprints round the house.'],
  [87, 'Every escort is now the most valuable target on the map.'],
  [T1_ARR, 'T-1 pushes the first hostage into the van: <b>1 / 2</b>.'],
  [CT2_ARR, 'CT-2 arrives and hits T-2! The hostage panics and ducks…'],
  [A.ct2.dies, '…but T-1 was covering him. CT-2 is down.'],
  [T2_ARR - 0.3, 'T-2 grabs the hostage again and pushes it in: <b>2 / 2</b>. GO!'],
  [DEPART - 1, 'CT-3 arrives seconds too late. The doors slam shut and the van drives off.'],
  [WIN, '<b>TERRORISTS WIN.</b> Waiting for the clock would have lost this round: the van made the Ts move.'],
  [WIN + 5, 'The happy path for the CTs: kill an escort, take a hostage back, or wreck the van before it fills.'],
];

// ---- scene
const map = MAPS.cs_mansion;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = map.theme.exposure || 1;
$('view').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 900);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const world = buildWorld(scene, map, 'low');
setGlow(map.theme.roomGlow, null);
setRooms(map.rooms, {});
world.setDoors(map.doors.map(() => 1)); // every door open

const models = {};
for (const [id, a] of Object.entries(A)) {
  const m = createPlayerModel(a.team);
  setPlayerWeapon(m, a.gun);
  m.add(a.tag = createNameTag(a.name, a.team === 'T' ? '#e8b04a' : '#7fb0ff'));
  scene.add(models[id] = m);
}
for (const id of Object.keys(H)) { const m = createHostageModel(); scene.add(models[id] = m); }

function createVan() {
  const g = new THREE.Group(), lam = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, c, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); o.position.set(x, y, z); g.add(o); return o; };
  box(2.1, 2.1, 5.2, 0xe8e8e2, 0, 1.45, 0);
  box(2.0, 0.6, 1.3, 0x1a2430, 0, 1.9, -2.05); // windscreen
  box(2.12, 0.25, 5.22, 0x30343a, 0, 0.5, 0);
  for (const [x, z] of [[-0.95, -1.7], [0.95, -1.7], [-0.95, 1.7], [0.95, 1.7]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 12), lam(0x151515));
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.4, z); g.add(w);
  }
  g.userData.hole = box(0.02, 1.6, 1.6, 0x101010, 1.06, 1.3, 0.2); // the dark doorway behind the sliding door
  g.userData.door = box(0.06, 1.6, 1.6, 0xd8d8d2, 1.09, 1.3, 0.2);
  return g;
}
const van = createVan();
scene.add(van);

const tracers = [...Array(6)].map(() => {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe080 }));
  l.frustumCulled = false;
  scene.add(l);
  return l;
});

// ---- the camera: shots that follow the action (the camera eases between them)
const P = id => (A[id] ? actorAt(id, T) : hostageAt(id, T)).p;
const up = (p, y) => [p[0], p[1] + y, p[2]];
const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2);
function chase(id, back, high, lookAt) {
  const s = A[id] ? actorAt(id, T) : hostageAt(id, T);
  const f = [-Math.sin(s.yaw), 0, -Math.cos(s.yaw)];
  return { pos: [s.p[0] - f[0] * back, s.p[1] + high, s.p[2] - f[2] * back], look: lookAt ? lookAt() : up(s.p, 1.2) };
}
const orbit = (c, r, h, w) => ({ pos: [c[0] + Math.cos(T * w) * r, c[1] + h, c[2] + Math.sin(T * w) * r], look: c });
const SHOTS_CAM = [
  [0, () => orbit([-12, 2, 0], 46, 26, 0.08)],
  [6, () => chase('ct1', 7, 4)],
  [15.5, () => chase('ct2', 3.5, 1.7, () => up(P('t3'), 1.2))],
  [21, () => chase('h2', 4.5, 2.6)],
  [30, () => ({ pos: [17, 6, -15], look: up(P('h2'), 1) })],
  [38, () => ({ pos: [-16.6, 6.1, 0], look: [-22, 4.9, 0] })],
  [51, () => ({ pos: [19, 7, -19], look: up(P('ct2'), 1) })],
  [57, () => ({ pos: [-16.6, 6.1, 0], look: [-22, 4.9, 0] })],
  [65.5, () => ({ pos: [-32, 5, 15], look: vanAt(T).p ? up(vanAt(T).p, 1) : [-41, 1, 20] })],
  [74.5, () => chase('t1', 4, 2.2)],
  [81, () => chase('ct2', 5, 2.6)],
  [87, () => ({ pos: [-29, 8, -13], look: [-39, 1, 3] })],
  [CT2_ARR - 0.4, () => ({ pos: [-34.5, 2.6, 11], look: mid(up(P('ct2'), 1.2), up(P('t2'), 1.2)) })],
  [DEPART - 1.2, () => ({ pos: [-47, 3.2, -9], look: vanAt(T).p ? up(vanAt(T).p, 1) : VAN })],
  [WIN, () => orbit([-12, 2, 0], 46, 26, 0.08)],
];

// ---- drawing one moment
let T = 0, playing = true, speed = 1, snap = true;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const radar = $('radar').getContext('2d');
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function place(m, st, opts) {
  m.visible = !st.hidden;
  if (!m.visible) return;
  m.position.set(st.p[0], st.p[1], st.p[2]);
  m.rotation.y = st.yaw;
  m.rotation.x = -(st.deadK || 0) * Math.PI / 2;
  m.position.y += (st.deadK || 0) * 0.25;
  posePlayer(m, opts.crouch, opts.pitch, opts.phase, opts.walk);
}

function frame(dt) {
  for (const id of Object.keys(A)) {
    const st = actorAt(id, T);
    place(models[id], st, { crouch: false, pitch: 0, phase: st.s * 2.4, walk: st.moving && !st.dead ? 1 : 0 });
    A[id].tag.visible = !st.dead;
  }
  for (const id of Object.keys(H)) {
    const st = hostageAt(id, T);
    place(models[id], st, { crouch: st.state === 'duck', pitch: st.state === 'duck' ? 2.6 : st.state === 'follow' ? 0 : 1.1, phase: T * 7, walk: st.state === 'follow' ? 0.8 : 0 });
  }
  const v = vanAt(T);
  van.visible = !v.hidden;
  if (v.p) { van.position.set(...v.p); van.userData.door.position.z = 0.2 + v.door * 1.6; }

  // tracers
  let n = 0;
  for (const s of SHOTS) for (let i = 0; i < s.n; i++) {
    const at = s.at + i * 0.12;
    if (T < at || T > at + 0.06 || n >= tracers.length) continue;
    const a = up(P(s.from), 1.45), b = targetPos(s.to, T).map(x => x + (Math.random() - 0.5) * 0.3);
    tracers[n].geometry.setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
    tracers[n++].visible = true;
  }
  for (; n < tracers.length; n++) tracers[n].visible = false;

  // camera
  let shot = SHOTS_CAM[0];
  for (const s of SHOTS_CAM) if (s[0] <= T) shot = s;
  const want = shot[1]();
  const k = snap ? 1 : 1 - Math.exp(-dt * 3.5);
  camPos.lerp(new THREE.Vector3(...want.pos), k);
  camLook.lerp(new THREE.Vector3(...want.look), k);
  snap = false;
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  world.update(dt, camera.position);
  renderer.render(scene, camera);
  hud();
}

function hud() {
  const safe = T >= H2_SAFE ? 1 : 0, loaded = (T >= T1_ARR + LOAD) + (T >= T2_ARR + LOAD);
  $('phase').textContent = T < 6 ? 'freeze time' : T < 51 ? 'standoff' : T < 66 ? 'negotiations failed' : T < WIN ? 'extraction' : 'round over';
  $('clock').textContent = fmt(T < 6 ? 120 : 126 - Math.min(T, WIN));
  $('score').innerHTML = `<span class="ct">rescued ${safe}</span> · <span class="h">held ${4 - safe - loaded}</span>` + (T >= 66 ? ` · <span class="t">in the van ${loaded} / 2</span>` : '');
  $('van').textContent = T < 66 ? '' : T < VAN_STOP ? 'VAN ARRIVING' : T < DEPART ? `VAN LEAVES IN ${fmt(Math.max(0, 35 - (T - VAN_STOP)))}` : 'VAN GONE';
  $('feed').innerHTML = FEED.filter(f => T >= f.at && T < f.at + 8).map(f => `<div>${f.html}</div>`).join('');
  const b = BANNERS.find(x => T >= x.at && T < x.at + x.dur);
  $('banner').style.opacity = b ? 1 : 0;
  if (b) $('banner').innerHTML = b.html;
  let cap = '';
  for (const [at, text] of CAPTIONS) if (T >= at) cap = text;
  $('caption').innerHTML = cap;
  $('seek').value = T;
  $('time').textContent = `${fmt(T)} / ${fmt(END)}`;
  drawRadar();
}

// The CT radar: CTs and hostages; Terrorists never; the van only once it honks.
function drawRadar() {
  const g = radar, S = 190 / 94, X = x => (x + 52) * S, Z = z => (z + 47) * S;
  g.clearRect(0, 0, 190, 190);
  g.strokeStyle = '#3a5'; g.lineWidth = 1;
  g.strokeRect(X(-49.5), Z(-24.4), 89.5 * S, 48.8 * S); // the estate
  g.fillStyle = 'rgba(120,160,120,0.25)'; g.fillRect(X(-23.7), Z(-14.5), 20.3 * S, 25.9 * S); // the house
  g.fillStyle = 'rgba(80,160,255,0.25)'; g.fillRect(X(24.1), Z(-22.8), 5.1 * S, 45.6 * S); // rescue zone
  const dot = (p, c, r = 3) => { g.fillStyle = c; g.beginPath(); g.arc(X(p[0]), Z(p[2]), r, 0, 7); g.fill(); };
  for (const id of ['ct1', 'ct2', 'ct3']) { const s = actorAt(id, T); dot(s.p, s.dead ? '#556' : '#7fb0ff'); }
  for (const id of Object.keys(H)) { const s = hostageAt(id, T); if (!s.hidden) dot(s.p, '#eee', 2.5); }
  if (T >= 66 && T < DEPART + 2) {
    if (T < 81) { g.fillStyle = '#f66'; g.font = 'bold 12px Verdana'; g.fillText('VAN: ?', 8, 182); }
    else if (Math.floor(T * 3) % 2) { const v = vanAt(T); if (v.p) { g.fillStyle = '#f44'; g.fillRect(X(v.p[0]) - 4, Z(v.p[2]) - 6, 8, 12); } }
  }
}

// ---- controls
$('play').onclick = () => { playing = !playing; if (T >= END) { T = 0; snap = true; playing = true; } $('play').textContent = playing ? 'Pause' : 'Play'; };
$('restart').onclick = () => { T = 0; snap = true; playing = true; $('play').textContent = 'Pause'; };
$('speed').onchange = e => { speed = +e.target.value; };
$('seek').oninput = e => { T = +e.target.value; snap = true; };

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing) { T = Math.min(END, T + dt * speed); if (T >= END) { playing = false; $('play').textContent = 'Replay'; } }
  frame(dt * (playing ? speed : 0) || 0.0001);
  requestAnimationFrame(loop);
}
frame(0);
$('loading').remove();
requestAnimationFrame(loop);
