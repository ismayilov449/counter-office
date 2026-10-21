// Counter-Office client: input, local movement/shooting prediction, remote interpolation, rendering.
import * as THREE from 'three';
import { MAPS, DEFAULT_MAP, siteAt, inBuyZone } from '/shared/maps/index.js';
import { WEAPONS, ITEMS, BUY_MENU, GRENADES, FIRE, GUNGAME, availableTo, itemInfo, slotKey, ammoCost } from '/shared/weapons.js';
import { SurfaceGrid } from './surfaces.js';
import { RADIO } from '/shared/radio.js';
import { PLAYER, movePlayer, overlapsAny, overlapsBox, raycastMap, rayPlayer, ladderAt, ladderPull, ladderExit, inWater } from '/shared/physics.js';
import { CAR, seatPos, stepCar } from '/shared/vehicles.js';
import { CollisionWorld } from '/shared/collision.js';
import { doorCenter } from '/shared/doors.js';
import { buildWorld, QUALITY, createCarModel, createPickupModel, animateCar } from './world.js';
import { setRooms, patchTree, ambientAt } from './roomlight.js';
import { createPlayerModel, createHostageModel, setPlayerWeapon, posePlayer, poseEmote, clearEmote, createNameTag, createViewModel, createDropModel, createPlantedBomb, createGibPieces, tearOff, mendModel } from './models.js';
import { buildMortarSetup } from './guns.js';
import { skyOf } from '/shared/maps/sky.js';
import { EMOTES, EMOTE } from '/shared/emotes.js';
import { RANKS } from '/shared/ranks.js';
import { ACHIEVEMENT } from '/shared/achievements.js';
import { Effects, nadeFuse } from './effects.js';
import { audio } from './audio.js';
import { Hud, TEAM_NAME, TEAM_COLOR } from './hud.js';
import { MenuPanel } from './menus.js';
import { SprayEditor, loadSpray, defaultSpray, sprayTexture, getSprayTexture } from './spray.js';
import { Net } from './net.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// ---------------------------------------------------------------- settings

const SETTINGS_KEY = 'counter-office-settings';
const settings = { name: '', sens: 1, volume: 0.6, quality: 'medium', fullscreen: true, rawInput: true, radioVoice: true, killcam: true, announcer: true, chGap: 3, chLen: 7, chThick: 2, chColor: '#50ff50' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* storage unavailable */ }
if (!QUALITY[settings.quality]) settings.quality = 'medium';
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } };
audio.setVolume(settings.volume);
const Q = QUALITY[settings.quality];

// ---------------------------------------------------------------- rendering setup

const renderer = new THREE.WebGLRenderer({ antialias: Q.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
renderer.shadowMap.enabled = Q.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('game').appendChild(renderer.domElement);

const BASE_FOV = 74;
const INTERP_MS = 100;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 900);
camera.rotation.order = 'YXZ';

const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.01, 10);
vmScene.add(vmCamera);
const vmHemi = new THREE.HemisphereLight(0xffffff, 0x705f48, 2.2);
vmScene.add(vmHemi);
const vmSun = new THREE.DirectionalLight(0xfff0d6, 1.6);
vmSun.position.set(1, 2, 1);
vmScene.add(vmSun);

// The flashlight always exists (intensity 0 when off) so toggling it never recompiles shaders.
const flashlight = new THREE.SpotLight(0xfff4e0, 0, 35, 0.36, 0.45, 1.3);
scene.add(flashlight, flashlight.target);

let map = MAPS[DEFAULT_MAP];
let world = null;
let coll = new CollisionWorld(map);
const fx = new Effects(scene, () => coll);
const hud = new Hud();
const menu = new MenuPanel($('menu'));

function loadMap(id) {
  const next = MAPS[id] || MAPS[DEFAULT_MAP];
  if (world && next === map) return;
  if (world) world.dispose();
  map = next;
  coll = new CollisionWorld(map);
  surfaces = new SurfaceGrid(map);
  world = buildWorld(scene, map, settings.quality);
  patchTree(world.group);
  game.lights = {};
  game.broken = [];
  game.doors = [];
  setRooms(map.rooms, game.lights);
  buildCars();
  clearHostages();
  renderer.toneMappingExposure = map.theme.exposure || 1;
  hud.setMap(map);
  fx.reset();
  for (const d of drops.values()) scene.remove(d);
  drops.clear();
  if (plantedBomb) { scene.remove(plantedBomb); plantedBomb = null; }
  renderMapVotes();
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCamera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  vmCamera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- state

const me = {
  id: null, joined: false, team: 'SPEC', alive: false, hp: 0, armor: 0, helmet: false, kit: false, nvg: false, money: 0,
  inv: { primary: null, secondary: null, he: 0, flash: 0, smoke: 0, molotov: 0, c4: false },
  slot: 'knife', lastSlot: 'knife', pendingSlot: false,
  p: [0, 0, 0], v: [0, 0, 0], onGround: false, crouch: false, eyeH: PLAYER.eye, airSpeed: 0,
  yaw: 0, pitch: 0, punchP: 0, punchY: 0, lastYaw: 0, sway: 0, bobT: 0,
  shotsFired: 0, nextShot: 0, lastFire: 0, drawUntil: 0, reload: null,
  scope: 0, resumeScope: 0, resumeAt: 0, flashUntil: 0, kick: 0, swing: 0, swingAlt: false,
  spawnSeq: 0, stepDist: 0, deathAt: 0, specId: null, act: null, jumpQueued: false,
  triggerFresh: false, usingKey: false, usingMouse: false, shake: 0, nadeHold: null,
  flashlight: false, nvgOn: false, roundBuys: [], lastBuys: [], spray: null,
  driving: null, car: null, carCam: 'chase', camYaw: 0, camPitch: 0.25, camIdle: 0, lastCarSend: 0, riding: null,
};

const game = {
  phase: 'warmup', mode: 'bomb', tl: -1, el: 0, snapRecv: 0, score: { T: 0, CT: 0 },
  bomb: { s: 'none', p: null, tl: 0 }, cfg: { roundTime: 115, buyTime: 25, freezeTime: 3 }, roster: [], carrier: null, maps: [],
  lights: {}, broken: [], doors: [],
};

const remotes = new Map();
const drops = new Map();
let dropList = [];
let plantedBomb = null;
let nextBeep = 0;
let serverOffset = null;
let shotRequested = false;

function serverNow() {
  return performance.now() + (serverOffset ?? 0);
}

function nameOf(id) {
  return game.roster.find(p => p.id === id)?.name || `Player${id}`;
}

function teamOf(id) {
  if (id === me.id) return me.team;
  return remotes.get(id)?.team || game.roster.find(p => p.id === id)?.team || 'SPEC';
}

// ---------------------------------------------------------------- weapons & inventory

function weaponOf(slot) {
  switch (slot) {
    case 'primary': return me.inv.primary?.id || null;
    case 'secondary': return me.inv.secondary?.id || null;
    case 'knife': return me.zombie ? 'claws' : 'knife';
    case 'c4': return me.inv.c4 ? 'c4' : null;
    default: return GRENADES.includes(slot) && me.inv[slot] > 0 ? slot : null;
  }
}
// The pickup's gunner always uses the mounted machine gun.
const current = () => (me.riding?.gunner ? 'pkt' : weaponOf(me.slot) || 'knife');
const currentItem = () => (me.slot === 'primary' || me.slot === 'secondary' ? me.inv[me.slot] : null);
const bestSlot = () => (me.inv.primary ? 'primary' : me.inv.secondary ? 'secondary' : 'knife');
const SLOT_ORDER = ['primary', 'secondary', 'knife', ...GRENADES, 'c4'];

let vm = null, vmId = null, vmTeam = null;
function refreshViewModel() {
  const id = current();
  const look = me.zombie ? 'Z' : me.team;
  if (vm && vmId === id && vmTeam === look) return;
  if (vm) vmCamera.remove(vm);
  vm = createViewModel(id, look);
  vmCamera.add(vm);
  vmId = id;
  vmTeam = look;
}

function switchSlot(slot, silent = false) {
  if (!weaponOf(slot)) return;
  if (slot === me.slot && vmId === current()) return;
  if (slot !== me.slot) me.lastSlot = me.slot;
  me.slot = slot;
  me.nadeHold = null;
  me.reload = null;
  me.scope = 0;
  me.resumeScope = 0;
  me.shotsFired = 0;
  me.drawUntil = performance.now() + (slot === 'knife' ? 300 : 600);
  if (me.usingMouse) stopUse('mouse');
  refreshViewModel();
  if (!silent) audio.play('draw');
}

function cycleWeapon(dir) {
  const avail = SLOT_ORDER.filter(s => weaponOf(s));
  const i = avail.indexOf(me.slot);
  switchSlot(avail[(i + dir + avail.length) % avail.length]);
}

// Key 4 cycles through the grenades you carry, like CS.
function cycleGrenades() {
  const owned = GRENADES.filter(g => me.inv[g] > 0);
  if (!owned.length) return;
  const i = owned.indexOf(me.slot);
  switchSlot(owned[(i + 1) % owned.length]);
}

const eyePos = () => [me.p[0], me.p[1] + me.eyeH, me.p[2]];

function aimDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

function computeSpread(def) {
  let s = def.spread ?? 0;
  if (def.sniper && !me.scope) s = def.unscoped;
  const hs = Math.hypot(me.v[0], me.v[2]);
  if (hs > 1.6) s += (def.moveSpread || 0) * Math.min(1, hs / 5);
  if (!me.onGround) s += (def.moveSpread || 0) * 1.5 + 0.03;
  else if (me.crouch) s *= 0.7;
  s += Math.min(me.shotsFired, 10) * (def.spreadInc || 0) * 0.55;
  return s;
}

function applySpread(d, s) {
  const a = Math.random() * Math.PI * 2, r = s * Math.random();
  let rx = -d[2], rz = d[0];
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl; rz /= rl;
  const u = [-rz * d[1], rz * d[0] - rx * d[2], rx * d[1]];
  const c = Math.cos(a) * r, sn = Math.sin(a) * r;
  const o = [d[0] + rx * c + u[0] * sn, d[1] + u[1] * sn, d[2] + rz * c + u[2] * sn];
  const l = Math.hypot(...o);
  return o.map(v => v / l);
}

const _v = new THREE.Vector3();
function viewMuzzleWorld() {
  if (!vm || me.scope) {
    const e = eyePos();
    return [e[0], e[1] - 0.15, e[2]];
  }
  vmCamera.updateMatrixWorld();
  vm.updateMatrixWorld(true);
  vm.userData.muzzle.getWorldPosition(_v);
  _v.applyMatrix4(camera.matrixWorld);
  return [_v.x, _v.y, _v.z];
}

// Trace against the map and enemy players for instant local feedback.
function localTrace(o, d, range) {
  const wall = coll.raycast(o, d, range, 'bullet', me.driving ?? me.riding?.id ?? null);
  let t = wall ? wall.t : range, hitR = null;
  for (const r of remotes.values()) {
    if (!r.alive || (!game.cfg.friendlyFire && isMate(r))) continue;
    const h = rayPlayer(o, d, r.p, r.c, t, bigHeads());
    if (h) { t = h.t; hitR = r; }
  }
  for (const hs of hostages.values()) {
    if (hs.state > 1) continue;
    const h = rayPlayer(o, d, hs.p, false, t);
    if (h) { t = h.t; hitR = hs; }
  }
  return { t, wall: hitR ? null : wall, hitR, end: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] };
}

function ejectCasing() {
  const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
  const right = [cy, 0, -sy], fwd = aimDir(me.yaw, me.pitch);
  const e = eyePos();
  fx.casing([e[0] + right[0] * 0.14 + fwd[0] * 0.35, e[1] - 0.1 + fwd[1] * 0.35, e[2] + right[2] * 0.14 + fwd[2] * 0.35], right, fwd);
}

function fireRocket(id, def, now) {
  const d = applySpread(aimDir(me.yaw + me.punchY, me.pitch + me.punchP), computeSpread(def));
  const muzzle = viewMuzzleWorld();
  fx.flashLight(muzzle, 60, 0.08);
  fx.puff(muzzle, 0xd8d4cc, 1.6, 1.2, 0.2);
  me.flashUntil = now + 60;
  net.send({ t: 'shoot', o: eyePos(), d, w: id, rt: serverNow() - INTERP_MS });
  audio.play('shot', null, id);
  me.punchP = Math.min(0.12, me.punchP + def.recoil);
  me.kick = 1;
  me.shotsFired++;
}

function fireBullet(id, def, now) {
  if (def.rocket) { fireRocket(id, def, now); return; }
  const o = eyePos();
  const base = aimDir(me.yaw + me.punchY, me.pitch + me.punchP);
  const spread = computeSpread(def);
  const dirs = def.pellets
    ? Array.from({ length: def.pellets }, () => applySpread(base, def.pelletSpread + spread))
    : [applySpread(base, spread)];
  const muzzle = viewMuzzleWorld();
  for (const d of dirs) {
    const tr = localTrace(o, d, 250);
    if (tr.hitR) fx.blood(tr.end);
    else if (tr.wall) { fx.decal(tr.end, tr.wall.n); if (!def.pellets || Math.random() < 0.4) fx.sparks(tr.end, tr.wall.n); }
    if (def.sniper || Math.random() < (def.pellets ? 0.25 : 0.5)) fx.tracer(muzzle, tr.end);
  }
  fx.flashLight(muzzle, 40, 0.05);
  me.flashUntil = now + 45;
  ejectCasing();
  net.send(def.pellets ? { t: 'shoot', o, ds: dirs, w: id, rt: serverNow() - INTERP_MS } : { t: 'shoot', o, d: dirs[0], w: id, rt: serverNow() - INTERP_MS });
  audio.play('shot', null, id === 'm4a1' ? 'm4a1s' : id);

  me.punchP = Math.min(0.075, me.punchP + def.recoil * 0.45 * (1 + Math.min(me.shotsFired, 6) * 0.07));
  if (me.shotsFired > 3) me.punchY = clamp(me.punchY + (Math.random() - 0.5) * def.recoil * 0.5, -0.025, 0.025);
  me.shotsFired++;
  me.kick = 1;
  if (def.sniper && me.scope && !def.autoSniper) {
    me.resumeScope = me.scope;
    me.scope = 0;
    me.resumeAt = now + def.rate * 1000;
  }
}

function knife(alt) {
  const now = performance.now();
  if (now < me.nextShot || now < me.drawUntil || game.phase === 'freeze') return;
  const w = me.zombie ? 'claws' : 'knife';
  const def = WEAPONS[w];
  me.nextShot = now + (alt ? def.altRate : def.rate) * 1000;
  me.swing = 1;
  me.swingAlt = alt;
  const o = eyePos(), d = aimDir(me.yaw, me.pitch);
  audio.play('knife');
  const tr = localTrace(o, d, def.range);
  if (tr.hitR) fx.blood(tr.end);
  else if (tr.wall) fx.sparks(tr.end, tr.wall.n);
  net.send({ t: 'shoot', o, d, w, alt, rt: serverNow() - INTERP_MS });
  stopEmote();
}

function throwNade(kind, strong = true) {
  if (me.inv[kind] <= 0) return;
  const o = eyePos(), d = aimDir(me.yaw, me.pitch + (strong ? 0.08 : 0.2));
  const wall = coll.raycast(o, d, 0.6, 'move');
  const k = wall ? 0 : 0.4;
  const start = [o[0] + d[0] * k, o[1] + d[1] * k - 0.1, o[2] + d[2] * k];
  const sp = strong ? 21 : 10;
  const v = [d[0] * sp + me.v[0] * 0.5, d[1] * sp + (strong ? 1.5 : 1) + me.v[1] * 0.3, d[2] * sp + me.v[2] * 0.5];
  net.send({ t: 'nade', k: kind, o: start, v });
  audio.play('throw');
  me.inv[kind]--;
  me.nextShot = performance.now() + 500;
  me.swing = 1;
  me.swingAlt = false;
  switchSlot(me.inv[kind] > 0 ? kind : bestSlot(), true);
}

// Grenades: pressing the button pulls the pin and holds the grenade ready; letting go throws it.
function holdNade(strong) {
  const id = current();
  if (!WEAPONS[id].grenade || me.nadeHold || !me.alive || me.driving != null) return;
  const now = performance.now();
  if (now < me.nextShot || now < me.drawUntil || game.phase === 'freeze' || ui.chat) return;
  me.nadeHold = { kind: id, strong, at: now };
  audio.play('pin');
}
function releaseNade(strong) {
  const h = me.nadeHold;
  if (!h || h.strong !== strong) return;
  me.nadeHold = null;
  if (!me.alive || current() !== h.kind || game.phase === 'freeze') return;
  throwNade(h.kind, strong);
}

function tryFire(now) {
  const id = current(), def = WEAPONS[id];
  stopEmote();
  if (now < me.nextShot || now < me.drawUntil || me.reload || id === 'c4') return;
  if (def.melee) { knife(false); return; }
  if (def.grenade) return; // thrown when the button is released (see holdNade)
  if (!def.auto && !me.triggerFresh) return;
  me.triggerFresh = false;
  if (def.mortar) { mortarFire(now); return; }
  if (def.mounted) {
    me.nextShot = now + def.rate * 1000;
    me.lastFire = now;
    fireBullet(id, def, now);
    return;
  }
  const item = currentItem();
  if (!item) return;
  if (item.mag <= 0) {
    audio.play('empty');
    me.nextShot = now + 250;
    if (item.res > 0) startReload();
    return;
  }
  item.mag--;
  me.nextShot = now + def.rate * 1000;
  me.lastFire = now;
  fireBullet(id, def, now);
}

// ---------------------------------------------------------------- 82-BM-37 mortar
// Mouse1 sets it up (on open ground: a couple of seconds, crouched, not moving); then the view goes up over the map,
// the mouse moves the aim point, Mouse1 fires and E (or switching weapons) packs it up. The server checks and fires
// the shell (onMortar in server.js); everyone sees and hears it fly in through the 'shell' message.
const MORTAR = WEAPONS.mortar;
const skyOpen = p => skyOf(map, coll).open(p);
const groundAt = (x, z, fallback) => skyOf(map, coll).ground(x, z, fallback);

function mortarFire(now) {
  const m = me.mortar;
  if (!m) {
    if (!me.onGround || inWater(map.water, me.p)) return;
    if (!skyOpen(me.p)) { hud.small('The mortar needs open sky above it', 2); audio.play('deny'); return; }
    stopEmote();
    me.mortar = { phase: 'setup', start: now, until: now + MORTAR.setup * 1000, yaw: me.yaw, at: [me.p[0] - Math.sin(me.yaw) * 35, me.p[2] - Math.cos(me.yaw) * 35] };
    me.scope = 0;
    audio.play('draw');
    return;
  }
  if (m.phase !== 'aim') return;
  const item = currentItem();
  if (!item || item.mag <= 0) { audio.play('empty'); me.nextShot = now + 400; return; }
  net.send({ t: 'mortar', at: m.at.map(v => Math.round(v * 100) / 100) });
  item.mag--;
  me.nextShot = now + MORTAR.rate * 1000;
}

// Per frame: finish setting up; pack up when the mortar is put away, dropped, or you die.
function updateMortar(now) {
  const m = me.mortar;
  if (!m) return;
  if (!me.alive || current() !== 'mortar' || me.driving != null || me.riding || game.phase === 'end') { me.mortar = null; return; }
  if (m.phase === 'setup' && now >= m.until) {
    m.phase = 'aim';
    audio.play('pickup');
  }
}

// The mouse moves the aim point (screen up = the way the mortar faces), kept within range.
function aimMortar(dx, dy) {
  const m = me.mortar, k = 0.05 * settings.sens;
  const s = Math.sin(m.yaw), c = Math.cos(m.yaw);
  m.at[0] += (c * dx + s * dy) * k;
  m.at[1] += (-s * dx + c * dy) * k;
  const ox = m.at[0] - me.p[0], oz = m.at[1] - me.p[2], d = Math.hypot(ox, oz) || 1;
  const want = clamp(d, MORTAR.range[0], MORTAR.range[1]);
  m.at = [me.p[0] + (ox / d) * want, me.p[2] + (oz / d) * want];
}

// The map view: looking down over the mortar and the aim point, the mortar's facing up the screen.
function mortarCamera() {
  const m = me.mortar, b = me.p;
  const mid = [(b[0] + m.at[0]) / 2, (b[2] + m.at[1]) / 2];
  const H = 22 + Math.hypot(m.at[0] - b[0], m.at[1] - b[2]) * 0.75;
  const f = [-Math.sin(m.yaw), -Math.cos(m.yaw)];
  camera.position.set(mid[0] - f[0] * H * 0.25, b[1] + H, mid[1] - f[1] * H * 0.25);
  camera.up.set(f[0], 0, f[1]);
  camera.lookAt(mid[0], b[1], mid[1]);
  camera.up.set(0, 1, 0);
}

// Markers on the map view (drawn over everything): the aim point with the shells' spread, the blast radius, and
// rings at the shortest and longest range around the mortar.
let mortarMarks = null;
function ring(r, w, color, opacity) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false }));
  m.renderOrder = 999;
  return m;
}
function updateMortarMarks() {
  const m = me.mortar;
  const show = !!m && m.phase === 'aim' && me.alive;
  if (!show) { if (mortarMarks) mortarMarks.visible = false; return; }
  if (!mortarMarks) {
    mortarMarks = new THREE.Group();
    mortarMarks.userData = {
      spread: ring(1, 0.12, 0xff3030, 0.95), dot: ring(0.25, 0.25, 0xff3030, 0.95), blast: ring(MORTAR.blast, 0.15, 0xffa040, 0.45),
      min: ring(MORTAR.range[0], 0.2, 0xffffff, 0.35), max: ring(MORTAR.range[1], 0.3, 0xffffff, 0.35),
    };
    for (const o of Object.values(mortarMarks.userData)) mortarMarks.add(o);
    scene.add(mortarMarks);
  }
  const u = mortarMarks.userData;
  mortarMarks.visible = true;
  const dist = Math.hypot(m.at[0] - me.p[0], m.at[1] - me.p[2]);
  const y = groundAt(m.at[0], m.at[1], me.p[1]) + 0.05;
  for (const o of [u.spread, u.dot, u.blast]) o.position.set(m.at[0], y, m.at[1]);
  u.spread.scale.setScalar(Math.max(0.8, dist * 0.04));
  for (const o of [u.min, u.max]) o.position.set(me.p[0], me.p[1] + 0.05, me.p[2]);
}

// Set-up mortars on the ground: ours (seen from the map view) and other players'.
let ownMortar = null;
function placeMortarModel(model, p, yaw) {
  model.position.set(p[0] - Math.sin(yaw) * 0.55, p[1], p[2] - Math.cos(yaw) * 0.55);
  model.rotation.set(0, yaw, 0);
}
function updateOwnMortarModel() {
  const m = me.mortar;
  if (m && !ownMortar) { ownMortar = buildMortarSetup(); scene.add(ownMortar); }
  if (!ownMortar) return;
  ownMortar.visible = !!m && m.phase === 'aim';
  if (ownMortar.visible) placeMortarModel(ownMortar, me.p, m.yaw);
}

function startReload() {
  const item = currentItem(), id = current(), def = WEAPONS[id];
  if (!me.alive || !item || me.reload || !def.mag || item.mag >= def.mag || item.res <= 0) return;
  const now = performance.now();
  me.reload = { slot: me.slot, start: now, until: now + def.reload * 1000, dur: def.reload * 1000 };
  me.scope = 0;
  me.resumeScope = 0;
  me.shotsFired = 0;
  net.send({ t: 'reload', w: id });
  audio.play('reload', null, id);
}

function finishReload() {
  const r = me.reload;
  me.reload = null;
  const item = me.inv[r.slot];
  if (!item) return;
  const n = Math.min(WEAPONS[item.id].mag - item.mag, item.res);
  item.mag += n;
  item.res -= n;
}

function secondary() {
  if (!me.alive) return;
  const id = current(), def = WEAPONS[id];
  if (def.zoom && !me.reload && performance.now() >= me.drawUntil) {
    me.scope = (me.scope + 1) % (def.zoom.length + 1);
    me.resumeScope = 0;
    audio.play('click');
  } else if (id === 'knife' || id === 'claws') {
    knife(true);
  } else if (def.grenade) {
    holdNade(false);
  }
}

function canPlantHere() {
  return me.alive && me.inv.c4 && game.phase === 'live' && !!siteAt(map, me.p) && me.onGround;
}
function canDefuseHere() {
  const b = game.bomb;
  return me.alive && me.team === 'CT' && b.s === 'planted' && game.phase === 'live' &&
    Math.hypot(me.p[0] - b.p[0], me.p[1] - b.p[1], me.p[2] - b.p[2]) < 1.8;
}
function nearestDrop() {
  let best = null, bd = 1.8;
  for (const [, w, x, y, z] of dropList) {
    const d = Math.hypot(me.p[0] - x, me.p[2] - z);
    if (d < bd && Math.abs(me.p[1] - y) < 1.3 && (w !== 'c4' || me.team === 'T')) { bd = d; best = w; }
  }
  return best;
}

function startUse(src) {
  if (src === 'key') me.usingKey = true; else me.usingMouse = true;
  net.send({ t: 'use', on: true });
}
function stopUse(src) {
  const was = me.usingKey || me.usingMouse;
  if (src === 'key') me.usingKey = false; else me.usingMouse = false;
  if (was && !me.usingKey && !me.usingMouse) net.send({ t: 'use', on: false });
}

function die() {
  if (!me.alive) return;
  if (me.emote) stopEmote();
  if (me.driving != null || me.riding) leaveCar(null);
  me.alive = false;
  me.deathAt = performance.now();
  me.reload = null;
  me.scope = 0;
  me.act = null;
  me.specId = null;
  me.flashlight = false;
  stopUse('key');
  stopUse('mouse');
  audio.play('death');
  if (menu.id === 'buy') menu.close();
}

// ---------------------------------------------------------------- buying

function buyBlockReason() {
  if (!me.alive) return 'You must be alive to buy.';
  if (game.phase === 'warmup') return '';
  if (isGG()) return 'There is no buying in Gun Game — kill to get the next weapon.';
  if (isHNS()) return 'There is no buying in Hide and Seek.';
  if (isDM()) return '';
  if (game.cfg.party?.weapon && game.cfg.gameMode === 'classic') return `Party mode: ${WEAPONS[game.cfg.party.weapon].name} only — no buying.`;
  if (game.phase !== 'freeze' && game.phase !== 'live') return 'You cannot buy right now.';
  if (isZM()) {
    if (me.zombie) return 'Zombies can\'t buy anything.';
    const el = game.el + (performance.now() - game.snapRecv) / 1000;
    return el > game.cfg.freezeTime + (game.cfg.zombieCountdown || 12) + game.cfg.buyTime ? 'Buy time is over.' : '';
  }
  const elapsed = game.el + (performance.now() - game.snapRecv) / 1000;
  if (elapsed > game.cfg.freezeTime + game.cfg.buyTime) return `${game.cfg.buyTime} seconds have passed. You can't buy anything now!`;
  if (!inBuyZone(map, me.team, me.p)) return 'You are not in a buy zone.';
  return '';
}

function priceOf(id) {
  if (isDM()) return 0;
  if (id === 'vesthelm' && me.armor >= 100 && !me.helmet) return 350;
  return itemInfo(id).price;
}

function owns(id) {
  const def = WEAPONS[id];
  if (def?.grenade) return me.inv[id] >= def.max;
  if (def) return me.inv[slotKey(id)]?.id === id;
  if (id === 'vest') return me.armor >= 100;
  if (id === 'vesthelm') return me.armor >= 100 && me.helmet;
  if (id === 'kit') return me.kit;
  if (id === 'nvg') return me.nvg;
  return false;
}

function buy(id) {
  net.send({ t: 'buy', item: id });
  me.roundBuys.push(id);
}

function ammoLabel(action) {
  const cost = ammoCost(action === 'ammo1' ? me.inv.primary : me.inv.secondary);
  return cost ? `$${cost.price}` : 'full';
}

function buyCategory(cat) {
  return {
    id: 'buy',
    title: cat.title,
    build: () => {
      const reason = buyBlockReason();
      return {
        info: `$${me.money}`,
        footer: reason,
        items: cat.items.filter(id => availableTo(id, me.team) && !(id === 'kit' && game.mode === 'hostage')).map(id => {
          const def = itemInfo(id), price = priceOf(id), have = owns(id);
          const w = WEAPONS[id];
          const note = have ? '(owned)' : w && w.damage && !w.grenade ? `${w.damage}${w.pellets ? `×${w.pellets}` : ''} dmg · ${w.mag} rds` : '';
          return { label: def.name, right: `$${price}`, note, disabled: !!reason || have || price > me.money, select: () => buy(id) };
        }),
      };
    },
  };
}

const buyMenu = {
  id: 'buy',
  title: 'Buy Item',
  build: () => {
    const reason = buyBlockReason();
    return {
      info: `$${me.money}`,
      footer: reason || 'Number keys to choose · F1 autobuy · F2 rebuy · , and . buy ammo',
      items: BUY_MENU.map(cat => ({
        label: cat.title,
        right: cat.action ? ammoLabel(cat.action) : '',
        disabled: !!reason || (cat.action && ammoLabel(cat.action) === 'full'),
        select: () => (cat.action ? buy(cat.action) : buyCategory(cat)),
      })),
    };
  },
};

function openBuy(direct) {
  if (!me.alive || me.team === 'SPEC') return;
  if (menu.id === 'buy') { menu.close(); return; }
  menu.open(buyMenu);
  if (direct) menu.push(buyCategory(BUY_MENU.find(c => c.title === direct)));
}

// F1: best rifle you can afford, then armor, kit and grenades.
function autobuy() {
  if (buyBlockReason()) { hud.small(buyBlockReason()); return; }
  let money = me.money;
  const list = [];
  const want = (id, price) => { if (price <= money) { list.push(id); money -= price; return true; } return false; };
  if (!me.inv.primary) {
    const prefs = me.team === 'CT' ? ['m4a1', 'famas', 'mp5', 'tmp'] : ['ak47', 'galil', 'mp5', 'mac10'];
    for (const id of prefs) if (want(id, WEAPONS[id].price)) break;
  }
  if (me.armor < 100 || !me.helmet) want('vesthelm', me.armor >= 100 ? 350 : 1000) || (me.armor < 100 && want('vest', 650));
  if (me.team === 'CT' && !me.kit) want('kit', 200);
  list.push('ammo1', 'ammo2');
  if (!me.inv.flash) want('flash', 200);
  if (!me.inv.he) want('he', 300);
  list.forEach(buy);
}

function rebuy() {
  if (buyBlockReason()) { hud.small(buyBlockReason()); return; }
  if (!me.lastBuys.length) { hud.small('Nothing to rebuy yet.'); return; }
  me.lastBuys.forEach(buy);
}

function radioMenu(key) {
  const r = RADIO[key];
  return {
    id: `radio-${key}`,
    title: r.title,
    build: () => ({ items: r.items.map((text, n) => ({ label: text, select: () => net.send({ t: 'radio', menu: key, n }) })) }),
  };
}

const teamMenu = {
  id: 'team',
  title: 'Select team',
  build: () => ({
    items: [
      { label: 'Terrorist Forces', select: () => net.send({ t: 'team', team: 'T' }) },
      { label: 'Counter-Terrorist Forces', select: () => net.send({ t: 'team', team: 'CT' }) },
      { label: 'Auto-select', select: () => net.send({ t: 'team', team: pickTeam('auto') }) },
      { label: 'Spectate', select: () => net.send({ t: 'team', team: 'SPEC' }) },
    ],
  }),
};

function pickTeam(team) {
  if (team === 'auto') {
    const nt = game.roster.filter(p => p.team === 'T' && p.id !== me.id).length;
    const nct = game.roster.filter(p => p.team === 'CT' && p.id !== me.id).length;
    team = nt < nct ? 'T' : nct < nt ? 'CT' : Math.random() < 0.5 ? 'T' : 'CT';
  }
  return team;
}

// ---------------------------------------------------------------- remote players

function updateTag(r) {
  if (r.tag) {
    r.model.remove(r.tag);
    r.tag.material.map.dispose();
    r.tag.material.dispose();
    r.tag = null;
  }
  if (isMate(r)) {
    r.tag = createNameTag(r.name, TEAM_COLOR[r.team]);
    r.model.add(r.tag);
  }
}

// Zombie mode: Terrorists are the zombies (after warmup).
const lookFor = team => (isZM() && team === 'T' && game.phase !== 'warmup' ? 'Z' : team);

function addRemote(id, team) {
  const look = lookFor(team);
  const model = createPlayerModel(look);
  scene.add(model);
  const r = { id, team, look, model, buf: [], alive: true, w: null, fl: 0, name: nameOf(id), tag: null, p: [0, 0, 0], c: 0, yaw: 0, pitch: 0, walk: 0, stepAcc: 0, lastP: null, deadT: 0, radioUntil: 0 };
  remotes.set(id, r);
  updateTag(r);
  return r;
}

function removeRemote(r) {
  scene.remove(r.model);
  if (r.mortarSet) scene.remove(r.mortarSet);
  remotes.delete(r.id);
}

function sampleRemote(r, rt) {
  const b = r.buf;
  let a = b[0], c = b[b.length - 1], f = 0;
  if (rt <= a.t) c = a;
  else if (rt >= c.t) a = c;
  else {
    for (let i = b.length - 1; i > 0; i--) {
      if (b[i - 1].t <= rt && rt <= b[i].t) {
        a = b[i - 1]; c = b[i];
        f = (rt - a.t) / (c.t - a.t || 1);
        break;
      }
    }
  }
  return {
    p: [lerp(a.p[0], c.p[0], f), lerp(a.p[1], c.p[1], f), lerp(a.p[2], c.p[2], f)],
    yaw: a.yaw + angleDiff(a.yaw, c.yaw) * f,
    pitch: lerp(a.pitch, c.pitch, f),
    c: f < 0.5 ? a.c : c.c,
    alive: (f < 0.5 ? a : c).alive,
    w: (f < 0.5 ? a : c).w,
  };
}

// Render time for other players: normally slightly in the past for smooth interpolation;
// during the kill cam it is the replay clock.
const renderTime = () => (killcam ? killcam.t : serverNow() - INTERP_MS);

let specActive = false;

function updateRemotes(dt) {
  const rt = renderTime();
  for (const r of remotes.values()) {
    if (!r.buf.length) { r.model.visible = false; continue; }
    const s = sampleRemote(r, rt);
    const alive = killcam ? s.alive !== 0 : r.alive;
    if (killcam && s.w && s.w !== r.model.userData.gunId) setPlayerWeapon(r.model, s.w);
    const moved = r.lastP ? Math.hypot(s.p[0] - r.lastP[0], s.p[2] - r.lastP[2]) : 0;
    const speed = dt > 0 ? moved / dt : 0;
    r.lastP = s.p;
    Object.assign(r, { p: s.p, c: s.c, yaw: s.yaw, pitch: s.pitch });
    r.model.position.set(...s.p);
    r.model.rotation.y = s.yaw;
    if (alive) {
      if (r.model.userData.torn) { mendModel(r.model); r.model.userData.gibAll = false; }
      r.walk += moved * 3.2;
      r.model.rotation.x = 0;
      r.deadT = 0;
      posePlayer(r.model, s.c, s.pitch, r.walk, Math.min(1, speed / 4));
      const em = r.emote && EMOTE[r.emote.id];
      if (em && performance.now() - r.emote.start < em.secs * 1000) poseEmote(r.model, r.emote.id, (performance.now() - r.emote.start) / 1000);
      else if (r.emote) { r.emote = null; clearEmote(r.model); showEmoteLabel(r, null); }
      if (speed > 4 && speed < 15 && !killcam) {
        r.stepAcc += moved;
        if (r.stepAcc > 2.4) { r.stepAcc = 0; audio.play('step', s.p, surfaceAt(s.p)); }
      }
    } else {
      r.deadT += dt;
      r.model.rotation.x = Math.min(Math.PI / 2, r.deadT * 5);
    }
    r.model.userData.light.visible = alive && !!r.fl;
    const deployed = alive && !!r.mo && !killcam;
    if (deployed && !r.mortarSet) { r.mortarSet = buildMortarSetup(); scene.add(r.mortarSet); }
    if (r.mortarSet) { r.mortarSet.visible = deployed; if (deployed) placeMortarModel(r.mortarSet, s.p, s.yaw); }
    if (r.model.userData.gun) r.model.userData.gun.visible = !deployed;
    r.model.userData.headG.scale.setScalar(bigHeads());
    if (r.tag) r.tag.visible = alive;
    r.model.visible = !(!me.alive && me.specId === r.id && specActive) && !(killcam && killcam.killer === r.id) && !(!alive && r.model.userData.gibAll);
  }
}

// ---------------------------------------------------------------- world objects

function syncDrops(list) {
  dropList = list;
  const seen = new Set();
  for (const [id, w, x, y, z] of list) {
    seen.add(id);
    let d = drops.get(id);
    if (!d) {
      d = createDropModel(w);
      d.rotation.y = (id * 2.399) % (Math.PI * 2);
      scene.add(d);
      drops.set(id, d);
    }
    d.position.set(x, y, z);
  }
  for (const [id, d] of drops) if (!seen.has(id)) { scene.remove(d); drops.delete(id); }
}

function syncBomb(b) {
  if (b.s === 'planted' || (b.s === 'defused' && plantedBomb)) {
    if (!plantedBomb) {
      plantedBomb = createPlantedBomb();
      scene.add(plantedBomb);
      nextBeep = 0;
    }
    plantedBomb.position.set(...b.p);
  } else if (plantedBomb) {
    scene.remove(plantedBomb);
    plantedBomb = null;
  }
}

function updateBomb(now) {
  if (!plantedBomb) return;
  const led = plantedBomb.userData.led;
  if (game.bomb.s !== 'planted') { led.visible = false; return; }
  const tl = Math.max(0, game.bomb.tl - (now - game.snapRecv) / 1000);
  if (now >= nextBeep) {
    audio.play('beep', game.bomb.p);
    led.visible = true;
    setTimeout(() => { led.visible = false; }, 90);
    nextBeep = now + (0.12 + 0.9 * clamp(tl / 40, 0, 1)) * 1000;
  }
}

// ---------------------------------------------------------------- cars & light switches

const cars = new Map(); // id -> { id, model, buf, p, yaw, speed, steer, driver }

function buildCars() {
  for (const c of cars.values()) scene.remove(c.model);
  cars.clear();
  me.driving = null;
  me.car = null;
  (map.vehicles || []).forEach((v, id) => {
    const model = v.type === 'pickup' ? createPickupModel(v.color) : createCarModel(v.color);
    patchTree(model);
    scene.add(model);
    cars.set(id, { id, type: v.type || 'car', model, buf: [], p: [v.p[0], 0, v.p[1]], yaw: v.yaw, speed: 0, steer: 0, driver: 0, hp: CAR.hp, riders: v.type === 'pickup' ? [0] : [0, 0], wrecked: false, smokeAt: 0 });
  });
  syncCollisionCars();
}

function syncCollisionCars() {
  coll.cars = [...cars.values()].map(c => (me.car && c.id === me.driving ? { id: c.id, p: me.car.p, yaw: me.car.yaw } : { id: c.id, p: c.p, yaw: c.yaw }));
}

function onCarSnapshot(list, time) {
  for (const [id, x, y, z, yaw, speed, steer, driver, hp = CAR.hp, r1 = 0, r2 = 0, wrecked = 0] of list || []) {
    const c = cars.get(id);
    if (!c) continue;
    c.hp = hp;
    c.riders = c.type === 'pickup' ? [r1] : [r1, r2];
    if (!!wrecked !== c.wrecked) { c.wrecked = !!wrecked; setWrecked(c.model, c.wrecked); }
    const last = c.buf[c.buf.length - 1];
    if (last && Math.hypot(last.p[0] - x, last.p[2] - z) > 6) c.buf = [];
    c.buf.push({ t: time, p: [x, y, z], yaw, speed, steer });
    if (c.buf.length > 30) c.buf.shift();
    c.driver = driver;
  }
}

function updateCars(dt) {
  const rt = renderTime();
  for (const c of cars.values()) {
    if (me.car && c.id === me.driving) {
      Object.assign(c, { p: me.car.p.slice(), yaw: me.car.yaw, speed: me.car.speed, steer: me.car.steer });
    } else if (c.buf.length) {
      const b = c.buf;
      let a = b[0], n = b[b.length - 1], f = 0;
      if (rt <= a.t) n = a;
      else if (rt >= n.t) a = n;
      else for (let i = b.length - 1; i > 0; i--) if (b[i - 1].t <= rt && rt <= b[i].t) { a = b[i - 1]; n = b[i]; f = (rt - a.t) / (n.t - a.t || 1); break; }
      c.p = [lerp(a.p[0], n.p[0], f), lerp(a.p[1], n.p[1], f), lerp(a.p[2], n.p[2], f)];
      c.yaw = a.yaw + angleDiff(a.yaw, n.yaw) * f;
      c.speed = lerp(a.speed, n.speed, f);
      c.steer = lerp(a.steer, n.steer, f);
    }
    c.model.position.set(c.p[0], c.p[1], c.p[2]);
    c.model.rotation.y = c.yaw;
    animateCar(c.model, c.speed, c.steer, dt);
    const driven = (me.car && c.id === me.driving) || c.driver;
    audio.engine(c.id, [c.p[0], c.p[1] + 0.8, c.p[2]], c.speed, !!driven && !c.wrecked);
    // A damaged car smokes from the bonnet; a wreck burns.
    const now = performance.now();
    if ((c.wrecked || c.hp < CAR.hp * 0.45) && now > c.smokeAt) {
      const f = [-Math.sin(c.yaw), -Math.cos(c.yaw)];
      const hood = [c.p[0] + f[0] * 1.5, c.p[1] + 1.0, c.p[2] + f[1] * 1.5];
      if (c.wrecked) {
        c.smokeAt = now + 90;
        fx.puff([c.p[0] + (Math.random() - 0.5) * 1.2, c.p[1] + 1.2, c.p[2] + (Math.random() - 0.5) * 2.5], 0x1e1c1a, 2.6, 2.4, 1.2);
        fx.puff([c.p[0] + (Math.random() - 0.5) * 1.2, c.p[1] + 0.9, c.p[2] + (Math.random() - 0.5) * 2.5], 0xff7a20, 0.9, 0.35, 0.8);
      } else {
        const heavy = c.hp < CAR.hp * 0.2;
        c.smokeAt = now + (heavy ? 110 : 220);
        fx.puff(hood, heavy ? 0x2a2826 : 0x9a9690, 1.4, 1.8, 0.9);
      }
    }
  }
  syncCollisionCars();
}

// Burnt-out look for a wrecked car (and back to normal when it is repaired).
function setWrecked(model, wrecked) {
  model.traverse(o => {
    if (!o.isMesh) return;
    if (!o.userData.origMat) o.userData.origMat = o.material;
    o.material = wrecked ? new THREE.MeshLambertMaterial({ color: 0x1c1a18 }) : o.userData.origMat;
  });
  patchTree(model);
}

function nearestCar() {
  let best = null, bd = CAR.enterRange;
  for (const c of cars.values()) {
    const d = Math.hypot(me.p[0] - c.p[0], me.p[2] - c.p[2]);
    if (!c.wrecked && (!c.driver || c.riders.includes(0)) && d < bd && Math.abs(me.p[1] - c.p[1]) < 1.5) { bd = d; best = c; }
  }
  return best;
}

function nearestDoor() {
  let best = null, bd = 1.9;
  (map.doors || []).forEach((d, i) => {
    const c = doorCenter(d);
    const dist = Math.hypot(me.p[0] - c[0], me.p[2] - c[2]);
    if (dist < bd && Math.abs(me.p[1] + 1 - c[1]) < 1.6) { bd = dist; best = { i, dist }; }
  });
  return best;
}

function applyDoors(states) {
  game.doors = states || [];
  coll.setDoors(game.doors);
  world?.setDoors(game.doors);
}

function nearestSwitch() {
  let best = null, bd = 1.8;
  for (const sw of map.switches || []) {
    const d = Math.hypot(me.p[0] - sw.p[0], me.p[2] - sw.p[2]);
    if (d < bd && Math.abs(me.p[1] + 1.2 - sw.p[1]) < 1.6) { bd = d; best = sw; }
  }
  return best;
}

function applyLights(lights) {
  game.lights = lights || {};
  world?.setLights(game.lights);
  setRooms(map.rooms, game.lights);
}

function applyBrokenGlass(ids) {
  game.broken = ids || [];
  coll.setBroken(game.broken);
  world?.setBrokenGlass(game.broken);
}

// Local driving: arcade physics on the driver's machine, sent to the server 30x per second.
function updateDriving(dt, now) {
  const c = me.car;
  const frozen = game.phase === 'freeze' || ui.chat || !locked;
  const input = {
    throttle: frozen ? 0 : (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    steer: frozen ? 0 : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    handbrake: keys.has('Space'),
  };
  const crash = stepCar(c, input, dt, coll.move(c.id, c.p, 8));
  if (crash > 5) {
    audio.play('crash', [c.p[0], c.p[1] + 0.5, c.p[2]]);
    me.shake = Math.max(me.shake, Math.min(1, crash / 15));
  }
  me.p = seatPos(c);
  me.v = [0, 0, 0];
  me.crouch = true;
  me.eyeH = 1.0;
  me.onGround = true;
  // The chase camera drifts back behind the car when you stop moving the mouse.
  me.camIdle += dt;
  if (me.carCam === 'chase' && me.camIdle > 0.8 && Math.abs(c.speed) > 2) me.camYaw -= me.camYaw * Math.min(1, dt * 2.5);
  if (now - me.lastCarSend > 33) {
    me.lastCarSend = now;
    const r3 = v => Math.round(v * 1000) / 1000;
    net.send({ t: 'car', id: c.id, p: c.p.map(r3), yaw: r3(c.yaw), speed: r3(c.speed), steer: r3(c.steer) });
  }
}

// Passenger: sit in the car, look around freely and shoot out of the window.
function updateRiding() {
  const c = cars.get(me.riding.id);
  if (!c) return;
  me.p = seatPos(c, me.riding.seat);
  me.v = [0, 0, 0];
  // the pickup's gunner stands behind the machine gun; passengers sit
  me.crouch = !me.riding.gunner;
  me.eyeH = me.riding.gunner ? PLAYER.eye : 1.0;
  me.onGround = true;
}

function carCamera() {
  const c = me.car;
  const yaw = c.yaw + me.camYaw;
  if (me.carCam === 'seat') {
    camera.position.set(me.p[0], me.p[1] + 1.0, me.p[2]);
    camera.rotation.set(me.camPitch - 0.25, yaw, 0);
    return;
  }
  const target = new THREE.Vector3(c.p[0], c.p[1] + 1.3, c.p[2]);
  const pitch = clamp(me.camPitch, -0.1, 1.0);
  const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const hit = coll.raycast([target.x, target.y, target.z], dir, 7, 'solid');
  const dist = hit ? Math.max(1.2, hit.t - 0.3) : 7;
  camera.position.set(target.x + dir[0] * dist, target.y + dir[1] * dist, target.z + dir[2] * dist);
  camera.lookAt(target);
}

function enterCar(id, state) {
  me.riding = null;
  me.driving = id;
  me.car = { id, type: cars.get(id)?.type || 'car', p: state.p.slice(), yaw: state.yaw, speed: 0, steer: 0, vy: 0 };
  refreshViewModel();
  me.camYaw = 0;
  me.camPitch = 0.25;
  me.reload = null;
  me.scope = 0;
  stopUse('mouse');
  audio.play('door');
  hud.small('Driving — W/S gas & brake, A/D steer, Space handbrake, V camera, Mouse 1 horn, E get out', 5);
}

function enterRide(id, seat, gunner) {
  me.riding = { id, seat, gunner: !!gunner };
  me.reload = null;
  me.scope = 0;
  stopUse('mouse');
  audio.play('door');
  refreshViewModel();
  hud.small(gunner ? 'You are on the PKT machine gun — aim with the mouse, hold Mouse 1 to fire (unlimited ammo), E to get off'
    : 'You are a passenger — look around and shoot out of the windows, E to get out', 5);
}

function leaveCar(p, yaw) {
  const c = cars.get(me.driving);
  if (c && me.car) Object.assign(c, { p: me.car.p.slice(), yaw: me.car.yaw, speed: 0, buf: [] });
  me.driving = null;
  me.car = null;
  me.riding = null;
  refreshViewModel();
  if (p) {
    me.p = p.slice();
    me.v = [0, 0, 0];
    me.yaw = yaw ?? me.yaw;
  }
  me.crouch = false;
  me.pitch = 0;
  audio.play('door');
}

// ---------------------------------------------------------------- hostages

const hostages = new Map(); // id -> { model, buf, p, state (0 idle, 1 follow, 2 rescued, 3 dead), leader }

function clearHostages() {
  for (const h of hostages.values()) scene.remove(h.model);
  hostages.clear();
}

function syncHostages(list, time) {
  const seen = new Set();
  for (const [id, x, y, z, yaw, st, leader] of list || []) {
    seen.add(id);
    let h = hostages.get(id);
    if (!h) {
      const model = createHostageModel();
      patchTree(model);
      scene.add(model);
      h = { id, model, buf: [], p: [x, y, z], state: st, leader, walk: 0, deadT: 0, lastP: null };
      hostages.set(id, h);
    }
    if (st < h.state || (h.state === 3 && st !== 3)) { h.buf = []; h.deadT = 0; } // new round
    h.buf.push({ t: time, p: [x, y, z], yaw, pitch: 0, c: 0 });
    if (h.buf.length > 300) h.buf.shift();
    h.state = st;
    h.leader = leader;
  }
  for (const [id, h] of hostages) if (!seen.has(id)) { scene.remove(h.model); hostages.delete(id); }
}

function updateHostageModels(dt) {
  const rt = renderTime();
  for (const h of hostages.values()) {
    if (!h.buf.length) continue;
    const s = sampleRemote(h, rt);
    const moved = h.lastP ? Math.hypot(s.p[0] - h.lastP[0], s.p[2] - h.lastP[2]) : 0;
    h.lastP = s.p;
    h.p = s.p;
    h.model.position.set(...s.p);
    h.model.rotation.y = s.yaw;
    h.model.visible = h.state !== 2;
    if (h.state === 3) {
      h.deadT += dt;
      h.model.rotation.x = Math.min(Math.PI / 2, h.deadT * 5);
    } else {
      h.model.rotation.x = 0;
      h.walk += moved * 3.2;
      posePlayer(h.model, false, h.state === 1 ? 0 : 1.1, h.walk, Math.min(1, moved / dt / 4));
    }
  }
}

function nearestHostage() {
  let best = null, bd = 2.2;
  for (const h of hostages.values()) {
    if (h.state > 1) continue;
    const d = Math.hypot(me.p[0] - h.p[0], me.p[1] - h.p[1], me.p[2] - h.p[2]);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

// ---------------------------------------------------------------- heavy kills: the body bursts apart

// m: a kill message with gib { k: 'blast' | 'shot', part, from, p, c, yaw } (see gibOf in server.js);
// body: the model left lying there (pieces torn off it, or hidden for a blast); look: its team colors.
function gibBody(m, body, look) {
  const { k, part, from, p, c, yaw } = m.gib;
  const blast = k === 'blast';
  const parts = blast ? ['head', 'torso', 'rArm', 'lArm', 'lLeg', 'rLeg']
    : part === 'head' ? ['head']
    : part === 'legs' ? [Math.random() < 0.5 ? 'lLeg' : 'rLeg']
    : [Math.random() < 0.5 ? 'rArm' : 'lArm'];
  const pieces = createGibPieces(look, parts, blast ? 14 : 5);
  if (c) for (const pc of pieces) pc.at[1] *= 0.55;
  const rnd = (a, b) => a + Math.random() * (b - a);
  // A blast throws everything away from its center, harder the closer it was; a bullet carries on along its path.
  const dir = (a, b) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1; return [d[0] / l, d[1] / l, d[2] / l, l]; };
  const push = blast
    ? q => { const [x, y, z, l] = dir(from, q), s = clamp(10 - l, 3, 8) * rnd(0.6, 1.1); return [x * s + rnd(-1.2, 1.2), Math.max(y, 0) * s + rnd(2.5, 5.5), z * s + rnd(-1.2, 1.2)]; }
    : q => { const [x, y, z] = dir(from, [p[0], q[1], p[2]]), s = rnd(4, 7.5); return [x * s + rnd(-1, 1), y * s + rnd(2, 3.5), z * s + rnd(-1, 1)]; };
  fx.gib(pieces, p, yaw, push, blast);
  audio.play('gib', [p[0], p[1] + 1, p[2]]);
  if (body) {
    if (blast) { body.userData.gibAll = true; if (body === killcam?.ghost) body.visible = false; } else tearOff(body, parts);
    body.userData.torn = true;
  }
}
fx.onSplat = p => audio.play('splat', p);

// ---------------------------------------------------------------- kill cam

let killcam = null;
const selfHistory = [];

function recordSelf() {
  if (!me.alive) return;
  const t = serverNow();
  selfHistory.push({ t, p: me.p.slice(), yaw: me.yaw, pitch: me.pitch, c: me.crouch ? 1 : 0, w: current(), alive: 1 });
  while (selfHistory.length && selfHistory[0].t < t - 9000) selfHistory.shift();
}

function startKillcam(killerId, weapon, hs) {
  const r = remotes.get(killerId);
  if (!settings.killcam || !r || r.buf.length < 10) return;
  const death = serverNow() - INTERP_MS;
  const ghost = createPlayerModel(me.team);
  setPlayerWeapon(ghost, selfHistory[selfHistory.length - 1]?.w || 'knife');
  patchTree(ghost);
  scene.add(ghost);
  killcam = { killer: killerId, t: Math.max(death - 3500, r.buf[0].t), death, end: death + 900, ghost, walk: 0, lastP: null };
  hud.killcam({ name: r.name, team: r.team, weapon: WEAPONS[weapon]?.name || weapon, hs });
  audio.play('killcam');
}

function stopKillcam() {
  if (!killcam) return;
  if (killcam.gib) gibBody(killcam.gib, null, me.zombie ? 'Z' : me.team);
  scene.remove(killcam.ghost);
  killcam = null;
  hud.killcam(null);
  me.deathAt = performance.now() - 2600; // go straight to spectating
}

function updateKillcam(dt) {
  if (!killcam) return;
  const slow = killcam.t > killcam.death - 700 && killcam.t < killcam.death + 300;
  killcam.t += dt * 1000 * (slow ? 0.35 : 1);
  if (killcam.t >= killcam.end || !remotes.get(killcam.killer)) { stopKillcam(); return; }
  // Our own body at the replay time
  const g = killcam.ghost;
  if (killcam.gib && killcam.t >= killcam.death) { gibBody(killcam.gib, g, me.zombie ? 'Z' : me.team); killcam.gib = null; }
  if (selfHistory.length) {
    const s = sampleRemote({ buf: selfHistory }, Math.min(killcam.t, killcam.death));
    const moved = killcam.lastP ? Math.hypot(s.p[0] - killcam.lastP[0], s.p[2] - killcam.lastP[2]) : 0;
    killcam.lastP = s.p;
    g.position.set(...s.p);
    g.rotation.y = s.yaw;
    if (killcam.t > killcam.death) g.rotation.x = Math.min(Math.PI / 2, (killcam.t - killcam.death) / 120);
    else { killcam.walk += moved * 3.2; posePlayer(g, s.c, s.pitch, killcam.walk, Math.min(1, moved / dt / 4)); }
  }
}

function killcamCamera() {
  const r = remotes.get(killcam.killer);
  const s = sampleRemote(r, killcam.t);
  camera.position.set(s.p[0], s.p[1] + (s.c ? PLAYER.crouchEye : PLAYER.eye), s.p[2]);
  camera.rotation.set(s.pitch, s.yaw, 0);
}

// ---------------------------------------------------------------- announcer & leaderboard

const STREAK = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'ULTRA KILL' };

function announce(text, sub) {
  hud.announce(text, sub);
  audio.play('announce');
  if (settings.announcer) audio.speak(text.toLowerCase(), true);
}

function announceKill(m, killer) {
  if (!killer) return;
  const mine = m.k === me.id;
  if (m.ace) announce('ACE!', `${killer.name} wiped out the enemy team`);
  else if (mine && m.streak >= 5) announce('UNSTOPPABLE', `${m.streak} kills this round`);
  else if (mine && STREAK[m.streak]) announce(STREAK[m.streak]);
  else if (m.first) announce('FIRST BLOOD', killer.name);
  else if (m.w === 'knife') announce('HUMILIATION', `${killer.name} knifed ${nameOf(m.v)}`);
  else if (mine && m.hs) announce('HEADSHOT');
}

async function refreshLeaderboard() {
  try {
    const list = await (await fetch('/api/leaderboard', { cache: 'no-store' })).json();
    hud.leaderboard($('leaderboard'), list, settings.name);
    hud.leaderboard($('leaderboard-2'), list, settings.name);
  } catch { /* server offline */ }
}

// ---------------------------------------------------------------- input: pointer lock, fullscreen, keyboard lock

const ui = { chat: false, chatTeam: false, scores: false, paused: false };
let locked = false;
let mouse1 = false;
const keys = new Set();
const sprayEditor = new SprayEditor(data => {
  me.spray = data;
  if (me.joined) net.send({ t: 'sprayimg', data });
  hud.small('Spray saved. Press T in game to spray it.');
});

function lock() {
  if (!me.joined) return;
  const el = renderer.domElement;
  try {
    const r = settings.rawInput ? el.requestPointerLock({ unadjustedMovement: true }) : el.requestPointerLock();
    if (r && r.catch) r.catch(() => { try { el.requestPointerLock()?.catch?.(() => {}); } catch { /* ignore */ } });
  } catch { updateOverlays(); }
}

// Fullscreen + Keyboard Lock stop the browser from handling Ctrl+W, Ctrl+T, Esc, etc. (HTTPS only).
function enterGame() {
  audio.init();
  ui.paused = false;
  if (settings.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  lock();
  updateOverlays();
}

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement && navigator.keyboard?.lock) navigator.keyboard.lock().catch(() => {});
  else if (!document.fullscreenElement && navigator.keyboard?.unlock) navigator.keyboard.unlock();
});

function pause() {
  ui.paused = true;
  if (document.pointerLockElement) document.exitPointerLock();
  updateOverlays();
}

function updateOverlays() {
  const show = me.joined && !locked && !sprayEditor.isOpen;
  $('paused').classList.toggle('hidden', !show);
  if (show) { renderMapVotes(); refreshLeaderboard(); refreshAchievements(); }
}

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked) {
    keys.clear();
    mouse1 = false;
    me.nadeHold = null;
    stopUse('key');
    stopUse('mouse');
    if (ui.chat) closeChat();
  }
  updateOverlays();
});

function openChat(team) {
  ui.chat = true;
  ui.chatTeam = team;
  keys.clear();
  hud.openChat(team);
}
function closeChat() {
  ui.chat = false;
  hud.closeChat();
}
function sendChat() {
  const text = $('chat-input').value.trim();
  if (text) net.send({ t: 'chat', text, team: ui.chatTeam });
  closeChat();
}

function toggleMenu(m) {
  if (menu.id === m.id) menu.close();
  else menu.open(m);
}

function spray() {
  if (!me.alive) return;
  if (!me.spray) {
    me.spray = defaultSpray(settings.name);
    net.send({ t: 'sprayimg', data: me.spray });
  }
  net.send({ t: 'spray', d: aimDir(me.yaw, me.pitch) });
}

function takeScreenshot() {
  shotRequested = true;
}

document.addEventListener('mousemove', e => {
  if (!locked || !me.alive) return;
  const k = 0.0022 * settings.sens * (camera.fov / BASE_FOV);
  if (me.driving != null) {
    me.camYaw -= e.movementX * k;
    me.camPitch = clamp(me.camPitch + e.movementY * k * (me.carCam === 'seat' ? -1 : 1), -0.8, 1.0);
    me.camIdle = 0;
    return;
  }
  if (me.mortar?.phase === 'aim') { aimMortar(e.movementX, e.movementY); return; }
  me.yaw -= e.movementX * k;
  me.yaw = Math.atan2(Math.sin(me.yaw), Math.cos(me.yaw));
  me.pitch = clamp(me.pitch - e.movementY * k, -1.55, 1.55);
});

document.addEventListener('mousedown', e => {
  if (!locked) return;
  audio.init();
  if (e.button === 0) {
    mouse1 = true;
    me.triggerFresh = true;
    if (killcam) stopKillcam();
    else if (!me.alive) cycleSpectate();
    else if (me.driving != null) net.send({ t: 'horn' });
    else if (current() === 'c4') startUse('mouse');
    else if (WEAPONS[current()].grenade) holdNade(true);
  } else if (e.button === 2) {
    secondary();
  }
});
document.addEventListener('mouseup', e => {
  if (e.button === 2) { releaseNade(false); return; }
  if (e.button !== 0) return;
  mouse1 = false;
  if (me.usingMouse) stopUse('mouse');
  releaseNade(true);
});
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('dragstart', e => e.preventDefault());
document.addEventListener('wheel', e => {
  if (e.ctrlKey) e.preventDefault();
  if (locked && me.alive && !ui.chat) cycleWeapon(e.deltaY > 0 ? 1 : -1);
}, { passive: false });
renderer.domElement.addEventListener('click', () => {
  if (!locked && me.joined && !sprayEditor.isOpen) enterGame();
});

const SLOT_KEYS = { Digit1: 'primary', Digit2: 'secondary', Digit3: 'knife', Digit5: 'c4' };
const TEXT_KEYS = ['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyZ'];

document.addEventListener('keydown', e => {
  const typing = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  // Block browser shortcuts (reload, find, save, bookmarks, help...) while playing.
  if (me.joined) {
    const fKey = /^F\d+$/.test(e.code) && e.code !== 'F11' && e.code !== 'F12';
    if (fKey || (e.ctrlKey && !(typing && TEXT_KEYS.includes(e.code))) || e.altKey || (!typing && !sprayEditor.isOpen)) e.preventDefault();
  }
  if (sprayEditor.isOpen) { if (e.code === 'Escape') { sprayEditor.close(); updateOverlays(); } return; }
  if (ui.chat) {
    if (e.code === 'Enter') sendChat();
    else if (e.code === 'Escape') closeChat();
    return;
  }
  if (typing) return;
  if (e.code === 'Tab') {
    if (me.joined && !e.repeat) {
      ui.scores = true;
      hud.scoreboard(game.roster, me.id, game.score, game.carrier, map.title);
      hud.show('scoreboard', true);
    }
    return;
  }
  if (e.code === 'Escape') {
    if (!$('match-summary').classList.contains('hidden')) $('match-summary').classList.add('hidden');
    else if (menu.isOpen) menu.close();
    else if (me.joined && locked) pause();
    return;
  }
  const vd = /^(Digit|Numpad)(\d)$/.exec(e.code);
  if (vd && endVote && !$('match-summary').classList.contains('hidden')) {
    const m = endVote.maps[+vd[2] - 1];
    if (m && !e.repeat) voteNextMap(m.id);
    if (m) return;
  }
  if (!locked) return;
  const digit = /^(Digit|Numpad)(\d)$/.exec(e.code);
  if (menu.isOpen && digit) { if (!e.repeat) menu.key(+digit[2]); return; }

  keys.add(e.code);
  if (e.repeat) return;
  if (SLOT_KEYS[e.code]) { if (me.alive) switchSlot(SLOT_KEYS[e.code]); return; }
  switch (e.code) {
    case 'Digit4': if (me.alive) cycleGrenades(); break;
    case 'Space': if (killcam) stopKillcam(); else me.jumpQueued = true; break;
    case 'KeyQ': if (me.alive) switchSlot(weaponOf(me.lastSlot) ? me.lastSlot : bestSlot()); break;
    case 'KeyR': startReload(); break;
    case 'KeyE': if (me.mortar) me.mortar = null; else if (me.alive) startUse('key'); break;
    case 'KeyG': if (me.alive && !['knife', ...GRENADES].includes(current())) net.send({ t: 'drop', w: current() }); break;
    case 'KeyB': openBuy(); break;
    case 'KeyO': openBuy('Equipment'); break;
    case 'KeyM': toggleMenu(teamMenu); break;
    case 'KeyZ': case 'KeyX': case 'KeyC':
      if (me.alive && me.team !== 'SPEC') toggleMenu(radioMenu(e.code[3].toLowerCase()));
      break;
    case 'KeyY': openChat(false); break;
    case 'KeyU': openChat(true); break;
    case 'KeyT': spray(); break;
    case 'KeyJ': if (me.alive && me.team !== 'SPEC') toggleMenu(emoteMenu); break;
    case 'KeyV':
      if (me.driving != null) me.carCam = me.carCam === 'chase' ? 'seat' : 'chase';
      break;
    case 'KeyF':
      if (me.alive) { me.flashlight = !me.flashlight; audio.play('click'); }
      break;
    case 'KeyN':
      if (!me.nvg) hud.small('You do not own nightvision goggles.');
      else { me.nvgOn = !me.nvgOn; audio.play('nvg'); }
      break;
    case 'Comma': buy('ammo1'); break;
    case 'Period': buy('ammo2'); break;
    case 'F1': autobuy(); break;
    case 'F2': rebuy(); break;
    case 'F5': takeScreenshot(); break;
  }
});

document.addEventListener('keyup', e => {
  keys.delete(e.code);
  if (e.code === 'Tab') { ui.scores = false; hud.show('scoreboard', false); }
  if (e.code === 'KeyE') stopUse('key');
});

addEventListener('beforeunload', e => {
  if (me.joined) { e.preventDefault(); e.returnValue = ''; }
});

// ---------------------------------------------------------------- join screen & pause menu

const nameInput = $('name');
nameInput.value = settings.name || '';
const joinButtons = document.querySelectorAll('#join .team-btn');

function join(team) {
  audio.init();
  const name = nameInput.value.trim() || `Player${me.id}`;
  settings.name = name;
  saveSettings();
  net.send({ t: 'join', name, team: pickTeam(team) });
  me.spray = loadSpray() || defaultSpray(name);
  net.send({ t: 'sprayimg', data: me.spray });
  me.joined = true;
  $('join').classList.add('hidden');
  hud.show('hud', true);
  enterGame();
}

joinButtons.forEach(b => {
  b.disabled = true;
  b.addEventListener('click', () => join(b.dataset.team));
});
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter' && !joinButtons[0].disabled) join('auto');
});

for (const id of ['draw-spray', 'draw-spray-2']) {
  $(id).addEventListener('click', () => sprayEditor.open(me.spray || loadSpray()));
}

const sens = $('sens'), vol = $('vol'), quality = $('quality'), fullscreen = $('fullscreen'), rawInput = $('rawinput'), radioVoice = $('radiovoice'), killcamBox = $('killcam-setting'), announcerBox = $('announcer-setting');
sens.value = settings.sens;
vol.value = settings.volume;
quality.value = settings.quality;
fullscreen.checked = settings.fullscreen;
rawInput.checked = settings.rawInput;
radioVoice.checked = settings.radioVoice;
killcamBox.checked = settings.killcam;
announcerBox.checked = settings.announcer;
killcamBox.addEventListener('change', () => { settings.killcam = killcamBox.checked; saveSettings(); });
announcerBox.addEventListener('change', () => { settings.announcer = announcerBox.checked; saveSettings(); });
$('match-summary').addEventListener('click', e => {
  const b = e.target.closest('button[data-map]');
  if (b) { voteNextMap(b.dataset.map); return; }
  if (e.target === $('match-summary')) $('match-summary').classList.add('hidden');
});

// ---- end-of-match map vote
let endVote = null;
function voteNextMap(id) {
  if (!endVote || performance.now() > endVote.endsAt) return;
  endVote.mine = id;
  net.send({ t: 'endvote', id });
  renderEndVote();
}
function renderEndVote() {
  if (endVote) hud.endVote({ ...endVote, left: Math.max(0, (endVote.endsAt - performance.now()) / 1000) }, endVote.mine);
}
setInterval(() => {
  if (!endVote) return;
  const el = $('ev-left');
  const left = Math.max(0, Math.ceil((endVote.endsAt - performance.now()) / 1000));
  if (el) el.textContent = left;
  if (performance.now() > endVote.endsAt + 4000) endVote = null;
}, 250);
const showSettings = () => {
  $('sens-val').textContent = Number(settings.sens).toFixed(2);
  $('vol-val').textContent = Math.round(settings.volume * 100) + '%';
};
showSettings();
sens.addEventListener('input', () => { settings.sens = +sens.value; showSettings(); saveSettings(); });
vol.addEventListener('input', () => { settings.volume = +vol.value; audio.setVolume(settings.volume); showSettings(); saveSettings(); });
quality.addEventListener('change', () => { settings.quality = quality.value; saveSettings(); $('quality-note').classList.remove('hidden'); });
fullscreen.addEventListener('change', () => { settings.fullscreen = fullscreen.checked; saveSettings(); });
rawInput.addEventListener('change', () => { settings.rawInput = rawInput.checked; saveSettings(); });
radioVoice.addEventListener('change', () => { settings.radioVoice = radioVoice.checked; saveSettings(); });
// Crosshair: gap, length, thickness and color, with a live preview in the menu.
const chInputs = { chGap: $('ch-gap'), chLen: $('ch-len'), chThick: $('ch-thick'), chColor: $('ch-color') };
function applyCrosshair() {
  const preview = $('crosshair-preview');
  hud.crosshairStyle({ len: settings.chLen, thick: settings.chThick, color: settings.chColor }, [$('crosshair'), preview, $('scope')]);
  preview.style.setProperty('--gap', `${settings.chGap}px`);
  $('scope').style.setProperty('--gap', `${settings.chGap}px`);
  $('ch-gap-val').textContent = settings.chGap;
  $('ch-len-val').textContent = settings.chLen;
  $('ch-thick-val').textContent = settings.chThick;
}
for (const [key, el] of Object.entries(chInputs)) {
  el.value = settings[key];
  el.addEventListener('input', () => { settings[key] = key === 'chColor' ? el.value : +el.value; applyCrosshair(); saveSettings(); });
}
applyCrosshair();
// Start money is a server setting: changing it tells the server, which tells everyone.
const startMoney = $('start-money');
function renderStartMoney() {
  const list = game.cfg.startMoneyChoices || [800];
  startMoney.innerHTML = list.map(v => `<option value="${v}">$${v}</option>`).join('');
  startMoney.value = String(game.cfg.startMoney ?? 800);
}
startMoney.addEventListener('change', () => net.send({ t: 'startmoney', value: +startMoney.value }));
$('resume').addEventListener('click', enterGame);
$('open-admin').addEventListener('click', () => window.open('/admin', '_blank'));
$('change-team').addEventListener('click', () => { enterGame(); menu.open(teamMenu); });

function renderMapVotes() {
  const box = $('map-votes');
  if (!box || !game.maps.length) return;
  box.innerHTML = game.maps.map(m => {
    const votes = game.roster.filter(p => p.vote === m.id).length;
    const cur = m.id === map.id;
    return `<button data-map="${m.id}" ${cur ? 'disabled' : ''}>${m.title}${cur ? ' (playing)' : votes ? ` — ${votes} vote${votes > 1 ? 's' : ''}` : ''}</button>`;
  }).join('');
  box.querySelectorAll('button[data-map]').forEach(b => b.addEventListener('click', () => net.send({ t: 'votemap', id: b.dataset.map })));
}

function shortcutNote() {
  const el = $('shortcut-note');
  if (window.isSecureContext && navigator.keyboard?.lock) {
    el.textContent = 'Browser shortcuts (Ctrl+W, Ctrl+T, Esc...) are blocked while the game is fullscreen. Hold Esc to leave fullscreen.';
  } else if (game.cfg.httpsPort) {
    const url = `https://${location.hostname}:${game.cfg.httpsPort}`;
    el.innerHTML = `Ctrl+W / Ctrl+T can still close the tab on plain HTTP. Open <a href="${url}">${url}</a> to block them.`;
  } else {
    el.textContent = 'Ctrl+W / Ctrl+T can only be blocked over HTTPS in fullscreen.';
  }
}

// ---------------------------------------------------------------- network

function applyServerInv(inv) {
  // Keep locally predicted ammo for the held weapon so in-flight shots aren't refunded.
  const local = currentItem();
  if (local && !me.reload) {
    const srv = inv[me.slot];
    if (srv && srv.id === local.id) srv.mag = Math.min(srv.mag, local.mag);
  }
  me.inv = inv;
}

function radioSpeak(text) {
  if (!settings.radioVoice) return;
  // The recorded CS 1.6 line where we have one, the speech voice otherwise.
  if (text === 'Go go go!' && audio.voice('com_go')) return;
  audio.speak(text);
}

const ROUND_START_VOICES = ['moveout', 'locknload', 'letsgo', 'go'];

const net = new Net({
  open() { $('conn-status').textContent = 'Connected. Pick a team to join.'; },
  close(e) {
    const reasons = {
      1009: 'The server rejected a message as too large. The server is probably an older version — restart it (close the server window and run start-server.bat again).',
      1013: 'The server is full.',
      1006: 'The server stopped or the network connection was lost. Check that the server window is still running.',
      4001: 'You were kicked by the admin.',
    };
    $('disconnect-reason').textContent = reasons[e?.code] || `Lost connection to the server (code ${e?.code ?? '?'}).`;
    me.joined = false;
    if (document.pointerLockElement) document.exitPointerLock();
    $('disconnected').classList.remove('hidden');
  },
  welcome(m) {
    me.id = m.id;
    game.cfg = { ...game.cfg, ...m.cfg };
    applyModeNames();
    renderStartMoney();
    game.maps = m.maps;
    game.mode = m.mode || 'bomb';
    loadMap(m.map);
    refreshLeaderboard();
    applyLights(m.lights);
    applyBrokenGlass(m.glass);
    applyDoors(m.doors);
    for (const [id, data] of Object.entries(m.sprayImgs || {})) sprayTexture(+id, data);
    for (const s of m.sprays || []) { const tex = getSprayTexture(s.id); if (tex) fx.spray(s.id, tex, s.p, s.n, s.yaw); }
    joinButtons.forEach(b => { b.disabled = false; });
    shortcutNote();
    if (!nameInput.value) nameInput.focus();
  },
  map(m) {
    endVote = null;
    $('match-summary').classList.add('hidden');
    game.mode = m.mode || 'bomb';
    stopKillcam();
    loadMap(m.id);
  },
  roster(m) {
    game.roster = m.list;
    game.carrier = m.carrier;
    $('online').textContent = `${m.list.length} player${m.list.length === 1 ? '' : 's'} in game · map ${map.title}`;
    for (const r of remotes.values()) {
      const n = nameOf(r.id);
      if (n !== r.name) { r.name = n; updateTag(r); }
    }
    if (ui.scores) hud.scoreboard(game.roster, me.id, game.score, game.carrier, map.title);
    if (!$('paused').classList.contains('hidden')) renderMapVotes();
  },
  infect(m) {
    const victim = { name: nameOf(m.v), team: 'T' };
    const pos = m.v === me.id ? null : remotes.get(m.v)?.p;
    if (!m.respawn) {
      const killer = m.k != null ? { name: nameOf(m.k), team: 'T' } : null;
      hud.killfeed(killer, victim, m.mother ? 'first zombie' : 'infected', false, m.k === me.id || m.v === me.id);
      audio.play('infect', pos || null);
    }
    if (m.v === me.id) {
      me.zombie = true;
      stopEmote();
      if (!m.respawn) {
        hud.center('YOU ARE A ZOMBIE', 'Claw the humans to infect them — you are fast, tough and see in the dark (N).', 4, '#7fd04a');
        me.nvgOn = true;
      }
      switchSlot('knife', true);
      refreshViewModel();
    }
  },
  zstart(m) {
    if (!m.ids.includes(me.id)) hud.center('INFECTION!', 'The first zombies are among you — survive until the time runs out!', 4, '#ff6a50');
  },
  knock(m) {
    // Shot as a zombie: bullets push you back.
    if (!me.alive) return;
    me.v[0] += m.v[0];
    me.v[2] += m.v[2];
    const hs = Math.hypot(me.v[0], me.v[2]);
    if (hs > 12) { me.v[0] *= 12 / hs; me.v[2] *= 12 / hs; }
    if (m.v[1] > 0.3 && me.onGround) { me.v[1] = m.v[1]; me.onGround = false; }
    me.airSpeed = Math.max(me.airSpeed || 0, Math.hypot(me.v[0], me.v[2]));
  },
  emote(m) {
    const r = remotes.get(m.id);
    if (!r) return;
    if (m.e === 'stop') { r.emote = null; clearEmote(r.model); showEmoteLabel(r, null); return; }
    r.emote = { id: m.e, start: performance.now() };
    showEmoteLabel(r, EMOTE[m.e].label);
    const d = Math.hypot(r.p[0] - me.p[0], r.p[2] - me.p[2]);
    if (EMOTE[m.e].say && d < 30 && settings.radioVoice) audio.speak(EMOTE[m.e].say);
  },
  ach(m) {
    const a = ACHIEVEMENT[m.id];
    if (!a) return;
    if (m.pid === me.id) {
      hud.achievement(a.title, a.desc);
      audio.play('achieve');
    }
    hud.chat('🏆', 'SPEC', `${m.name} unlocked ${a.title}`, { radio: true });
  },
  rankup(m) {
    const name = RANKS[m.rank]?.name || '';
    if (m.id === me.id) {
      hud.center(m.placed ? 'RANKED!' : 'RANK UP!', `You are now ${name}`, 5, '#ffc440');
      audio.play('rankup');
    }
    hud.chat('⭐', 'SPEC', m.placed ? `${m.name} got ranked: ${name}` : `${m.name} ranked up to ${name}!`, { radio: true });
  },
  me(m) {
    const prevPrimary = me.inv.primary?.id, prevSecondary = me.inv.secondary?.id, prevTeam = me.team;
    const wasZombie = me.zombie;
    me.zombie = !!m.zombie;
    if (wasZombie !== me.zombie) { vmId = null; refreshViewModel(); }
    if (me.alive && !m.alive) die();
    Object.assign(me, { team: m.team, hp: m.hp, armor: m.armor, helmet: m.helmet, kit: m.kit, nvg: m.nvg, money: m.money });
    if (!me.nvg) me.nvgOn = false;
    applyServerInv(m.inv);
    if (me.team !== prevTeam) {
      for (const r of remotes.values()) updateTag(r);
      refreshViewModel();
    }
    if (me.pendingSlot) {
      me.pendingSlot = false;
      me.slot = bestSlot();
      vmId = null;
      refreshViewModel();
    } else if (me.alive) {
      if (m.inv.primary && m.inv.primary.id !== prevPrimary) switchSlot('primary', true);
      else if (m.inv.secondary && m.inv.secondary.id !== prevSecondary && !m.inv.primary) switchSlot('secondary', true);
      if (!weaponOf(me.slot)) switchSlot(bestSlot(), true);
    }
    if (menu.isOpen) menu.render();
  },
  gg(m) {
    me.ggLevel = m.level;
    const w = m.w;
    if (m.quiet) { if (me.alive) setTimeout(() => switchSlot(w === 'knife' ? 'knife' : w === 'he' ? 'he' : slotKey(w), true), 50); return; }
    hud.small(m.level === GUNGAME.length - 1 ? 'KNIFE LEVEL — a knife kill wins!' : `Level ${m.level + 1}: ${WEAPONS[w]?.name || w}`, 3);
    audio.play('ggup');
    // Hold the new weapon right away.
    if (me.alive) setTimeout(() => switchSlot(w === 'knife' ? 'knife' : w === 'he' ? 'he' : slotKey(w), true), 50);
  },
  ggStart(m) {
    me.ggLevel = 0;
    hud.center('GUN GAME', `${m.levels} weapons — one kill each. A knife kill on the last level wins.`, 5);
  },
  hns(m) {
    game.hideUntil = m.hideUntil;
    if (me.team === 'CT') hud.center('SEEKER', `The hiders get ${m.hide} seconds — then find them and knife them!`, 4, TEAM_COLOR.CT);
    else if (me.team === 'T') hud.center('HIDE!', `You have ${m.hide} seconds before the seekers come out. Flashbangs and a smoke help you get away.`, 5, TEAM_COLOR.T);
  },
  halftime(m) {
    me.halftimeAt = performance.now(); // the 'round' message right after shows it
    audio.play('go');
  },
  cfg(m) {
    const was = game.cfg.gameMode;
    game.cfg = { ...game.cfg, ...m.cfg };
    applyModeNames();
    if (was && m.cfg.gameMode && was !== m.cfg.gameMode) me.ggLevel = 0;
    renderStartMoney();
  },
  world(m) {
    applyLights(m.lights);
    applyBrokenGlass(m.glass);
    applyDoors(m.doors);
  },
  doors(m) {
    applyDoors(m.doors);
    audio.play(m.open ? 'dooropen' : 'doorclose', m.p);
  },
  glass(m) {
    for (const id of m.ids) {
      coll.breakGlass(id);
      game.broken.push(id);
      const pane = world?.pane(id);
      if (pane) { fx.glassShatter(pane.center, pane.size); audio.play('glass', pane.center); }
    }
    world?.setBrokenGlass(game.broken);
  },
  lights(m) {
    applyLights(m.lights);
    audio.play('switch', m.p);
  },
  drive(m) {
    enterCar(m.id, m.car);
    if (m.moved) hud.small('The driver got out — you are driving now', 4);
  },
  ride(m) {
    enterRide(m.id, m.seat, m.gunner);
  },
  exited(m) {
    leaveCar(m.p, m.yaw);
  },
  spawn(m) {
    if (me.driving != null || me.riding) leaveCar(null);
    if (isGG()) setTimeout(() => { const w = GUNGAME[me.ggLevel || 0]; if (me.alive && w === 'he') switchSlot('he', true); }, 150);
    Object.assign(me, {
      p: m.p.slice(), v: [0, 0, 0], yaw: m.yaw, pitch: 0, alive: true, spawnSeq: m.sq, reload: null, scope: 0,
      resumeScope: 0, punchP: 0, punchY: 0, crouch: false, onGround: true, act: null, pendingSlot: true, specId: null, mortar: null,
    });
    hud.spectating(null);
  },
  s(m) {
    const est = m.time - performance.now();
    if (serverOffset === null || est > serverOffset) serverOffset = est;
    else serverOffset += (est - serverOffset) * 0.02;
    Object.assign(game, { phase: m.ph, tl: m.tl, el: m.el, score: m.sc, bomb: m.b, snapRecv: performance.now() });
    me.act = m.me;
    hud.score(m.sc);
    const seen = new Set();
    for (const [id, x, y, z, yaw, pitch, c, w, alive, tc, fl, mo] of m.pl) {
      if (id === me.id) continue;
      seen.add(id);
      const team = tc === 1 ? 'T' : 'CT';
      let r = remotes.get(id);
      if (!r || r.team !== team || r.look !== lookFor(team)) {
        if (r) removeRemote(r);
        r = addRemote(id, team);
      }
      if (alive && !r.alive) { r.buf = []; r.lastP = null; r.deadT = 0; }
      if (!alive && r.alive) r.deadT = 0;
      r.alive = !!alive;
      r.fl = fl;
      r.mo = mo;
      r.buf.push({ t: m.time, p: [x, y, z], yaw, pitch, c, w, alive });
      if (r.buf.length > 300) r.buf.shift();
      if (w !== r.w) { r.w = w; setPlayerWeapon(r.model, w); }
    }
    for (const r of [...remotes.values()]) if (!seen.has(r.id)) removeRemote(r);
    syncDrops(m.dr);
    syncBomb(m.b);
    onCarSnapshot(m.cars, m.time);
    syncHostages(m.hs, m.time);
  },
  shot(m) {
    const r = remotes.get(m.id);
    if (WEAPONS[m.w]?.melee) {
      audio.play('knife', m.o);
      for (const [dx, dy, dz, e, b] of m.tr) if (b) fx.blood([m.o[0] + dx * e, m.o[1] + dy * e, m.o[2] + dz * e]);
      return;
    }
    audio.play('shot', m.o, m.w === 'm4a1' ? 'm4a1s' : m.w);
    let from = m.o;
    const muzzle = r?.model.userData.gun?.userData.muzzle;
    if (muzzle && r.model.visible) {
      muzzle.getWorldPosition(_v);
      from = [_v.x, _v.y, _v.z];
      fx.thirdPersonFlash(muzzle);
    }
    fx.flashLight(from, 30, 0.05);
    for (const [dx, dy, dz, e, b, hw] of m.tr) {
      const d = [dx, dy, dz];
      const end = [m.o[0] + dx * e, m.o[1] + dy * e, m.o[2] + dz * e];
      if (Math.random() < (m.tr.length > 1 ? 0.25 : 0.6)) fx.tracer(from, end);
      if (b) fx.blood(end);
      else if (hw) {
        const hit = coll.raycast(m.o, d, e + 0.1);
        if (hit) { fx.decal(end, hit.n); if (m.tr.length === 1 || Math.random() < 0.4) fx.sparks(end, hit.n); }
      }
    }
  },
  hit(m) {
    hud.hitmarker(m.hs);
    audio.play(m.hs ? 'hs' : 'hit');
  },
  dmg(m) {
    me.hp = m.hp;
    me.armor = m.armor;
    let side = null;
    if (m.from) {
      const rel = angleDiff(me.yaw, Math.atan2(-(m.from[0] - me.p[0]), -(m.from[2] - me.p[2])));
      side = Math.abs(rel) < Math.PI / 4 ? 'up' : Math.abs(rel) > (3 * Math.PI) / 4 ? 'down' : rel > 0 ? 'left' : 'right';
    }
    hud.damage(side);
    audio.play('hurt');
    me.punchP += 0.025;
  },
  kill(m) {
    const killer = m.k != null ? { name: nameOf(m.k), team: teamOf(m.k) } : null;
    const victim = { name: nameOf(m.v), team: teamOf(m.v) };
    hud.killfeed(killer, victim, m.w, m.hs, m.k === me.id || m.v === me.id);
    if (m.v === me.id) {
      die();
      if (killer && m.k !== me.id) {
        hud.small(`Killed by ${killer.name}`, 4);
        startKillcam(m.k, m.w, m.hs);
      }
    }
    announceKill(m, killer);
    const r = remotes.get(m.v);
    if (r && r.alive) { r.alive = false; r.deadT = 0; }
    if (m.gib) {
      // Our own death in the kill cam: the body bursts when the replay gets there.
      if (m.v === me.id && killcam) killcam.gib = m;
      else gibBody(m, r?.model, r?.look || teamOf(m.v));
    }
  },
  shell(m) {
    fx.shell(m.o, m.at, m.flight);
    audio.play('mortarfire', m.o);
    // The whistle of it coming down, near where it lands
    setTimeout(() => audio.play('whistle', m.at), Math.max(0, m.flight - 1900));
  },
  rocket(m) {
    fx.rocket(m.o, m.d, m.dist, m.speed);
    if (m.owner !== me.id) audio.play('shot', m.o, 'rpg');
  },
  nade(m) {
    fx.nade(m.k, m.o, m.v, nadeFuse(m.k), p => audio.play('bounce', p));
    // 'Fire in the hole!' goes out on the thrower's team radio.
    if (settings.radioVoice && (m.owner === me.id || teamOf(m.owner) === me.team)) audio.voice('ct_fireinhole');
  },
  boom(m) {
    if (m.k === 'flash') { fx.flashPop(m.p); audio.play('flashpop', m.p); return; }
    if (m.k === 'rpg' || m.k === 'mortar') {
      fx.explosion(m.p, true);
      audio.play('bigboom', m.p);
      const d = Math.hypot(me.p[0] - m.p[0], me.p[2] - m.p[2]);
      me.shake = Math.max(me.shake, clamp(1 - d / 30, 0, 1) * 1.2);
      return;
    }
    if (m.k === 'car') {
      fx.explosion(m.p, true);
      audio.play('carboom', m.p);
      const d = Math.hypot(me.p[0] - m.p[0], me.p[2] - m.p[2]);
      me.shake = Math.max(me.shake, clamp(1 - d / 30, 0, 1) * 1.1);
      return;
    }
    if (m.k === 'smoke') { fx.smoke(m.p); audio.play('smoke', m.p); return; }
    if (m.k === 'molotov') { audio.play('molotov', m.p); return; } // the fire itself arrives as a 'fire' message
    const big = m.k === 'c4';
    fx.explosion(m.p, big);
    audio.play(big ? 'bigboom' : 'boom', m.p);
    const d = Math.hypot(me.p[0] - m.p[0], me.p[2] - m.p[2]);
    me.shake = Math.max(me.shake, clamp(1 - d / (big ? 40 : 15), 0, 1) * (big ? 1.2 : 0.6));
  },
  flashed(m) {
    hud.flashbang(m.a, m.dur);
    audio.play('ring', null, m.dur * 0.8);
  },
  fire(m) {
    fx.fire(m.id, m.p, m.life, m.r);
  },
  fireOut(m) {
    fx.fireOut(m.id);
  },
  round(m) {
    fx.clearDecals();
    fx.clearGibs();
    fx.clearFires();
    if (me.roundBuys.length) me.lastBuys = me.roundBuys;
    me.roundBuys = [];
    if (performance.now() - (me.halftimeAt || 0) < 2000) {
      hud.center('HALFTIME', `Teams switched sides — you are now ${me.team === 'T' ? 'a Terrorist' : 'a Counter-Terrorist'}. Round ${m.n}, buy time.`, 5);
    } else if (!isHNS()) hud.center(`Round ${m.n}`, 'Buy time — press B to buy (F1 autobuy, F2 rebuy)', 3);
  },
  roundEnd(m) {
    if (m.solo) hud.center(`${m.solo} wins!`, m.reason, 9, TEAM_COLOR[m.winner]);
    else hud.center(`${TEAM_NAME[m.winner]} Win`, m.matchMsg ? `${m.reason}\n${m.matchMsg}` : m.reason, m.matchMsg ? 9 : 5, TEAM_COLOR[m.winner]);
    audio.play(me.team === 'SPEC' || (m.solo ? m.mvp?.id === me.id : me.team === m.winner) ? 'win' : 'lose');
    // 'Counter-Terrorists win' / 'Terrorists win' — after 'Bomb has been defused' when that ended the round.
    const winVoice = isZM() || m.solo ? null : m.winner === 'CT' ? 'ctwin' : m.winner === 'T' ? 'terwin' : null;
    if (winVoice) setTimeout(() => audio.voice(winVoice), /defused/i.test(m.reason || '') ? 1900 : 300);
    hud.mvp(m.mvp, m.mvp?.id === me.id);
    if (m.mvp?.id === me.id) setTimeout(() => audio.play('mvp'), 600);
  },
  matchEnd(m) {
    stopKillcam();
    hud.matchSummary(m, me.id);
    endVote = m.vote ? { ...m.vote, mine: null, endsAt: performance.now() + m.vote.left * 1000 } : null;
    renderEndVote();
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(refreshLeaderboard, 2500);
  },
  endvote(m) {
    if (!endVote) return;
    Object.assign(endVote, m.vote, { endsAt: performance.now() + m.vote.left * 1000 });
    renderEndVote();
    audio.play('click');
  },
  hostageKilled(m) {
    const killer = m.k != null ? { name: nameOf(m.k), team: teamOf(m.k) } : null;
    hud.killfeed(killer, { name: 'Hostage', team: 'H' }, m.w, false, m.k === me.id);
  },
  msg(m) {
    if (m.big) hud.center(m.text, '', 3);
    else hud.small(m.text, 3);
  },
  chat(m) {
    hud.chat(m.name, m.team, m.text, { teamOnly: m.teamOnly, dead: m.dead });
    audio.play('chat');
  },
  radio(m) {
    hud.chat(m.name, m.team, m.text, { radio: true });
    audio.play('radio');
    radioSpeak(m.text);
    const r = remotes.get(m.id);
    if (r) r.radioUntil = performance.now() + 2500;
  },
  sprayimg(m) {
    sprayTexture(m.id, m.data);
  },
  spray(m) {
    const tex = getSprayTexture(m.id);
    if (tex) fx.spray(m.id, tex, m.p, m.n, m.yaw);
    audio.play('spray', m.p);
  },
  sfx(m) {
    if (m.s === 'planted') { audio.play('beep'); audio.voice('bombpl'); }
    else if (m.s === 'defused') audio.voice('bombdef') || audio.play('defused');
    else if (m.s === 'go') audio.voice(ROUND_START_VOICES[Math.floor(Math.random() * ROUND_START_VOICES.length)]) || audio.play('go');
    else if (m.s === 'defusing') hud.small('A teammate is defusing the bomb', 2);
    else audio.play(m.s, m.p || null);
  },
  ping(m) { net.send({ t: 'pong', ts: m.ts }); },
  left(m) {
    const r = remotes.get(m.id);
    if (r) removeRemote(r);
    fx.removeSpray(m.id);
  },
});

// ---------------------------------------------------------------- per-frame updates

function updateLocal(dt, now) {
  if (!me.alive) return;
  if (me.driving != null && me.car) { updateDriving(dt, now); return; }
  if (me.riding) {
    updateRiding();
    const canFire = game.phase !== 'freeze' && !ui.chat && locked && !me.act;
    if (mouse1 && canFire) tryFire(now);
    if (me.reload && now >= me.reload.until) finishReload();
    if (now - me.lastFire > (WEAPONS[current()].rate || 0.1) * 1000 + 150) {
      if (!mouse1) me.shotsFired = 0;
      const k = Math.min(1, dt * 7);
      me.punchP -= me.punchP * k;
      me.punchY -= me.punchY * k;
    }
    return;
  }
  const moveBoxes = coll.move(null, me.p, 3);
  const id = current(), def = WEAPONS[id];
  const localUse = (me.usingKey || me.usingMouse) && (canPlantHere() || canDefuseHere());
  const frozen = game.phase === 'freeze' || !!me.act || localUse || ui.chat || !locked || seekerWaiting() || !!me.mortar;

  const wantCrouch = (!ui.chat && (keys.has('ControlLeft') || keys.has('ControlRight'))) || !!me.mortar;
  // Ducking in the air pulls the legs up half way, as in CS: a crouch-jump reaches higher (into vents and windows).
  // Standing up in the air lets them down again, if there's room below.
  const tuck = (PLAYER.height - PLAYER.crouchHeight) / 2;
  if (wantCrouch && !me.crouch) {
    if (!me.onGround && !me.riding && !ladderAt(map.ladders, me.p, PLAYER.height) && !inWater(map.water, me.p) && !overlapsAny(moveBoxes, me.p[0], me.p[1] + tuck, me.p[2], PLAYER.radius, PLAYER.crouchHeight)) {
      me.p[1] += tuck;
      me.eyeH -= tuck;
    }
    me.crouch = true;
  } else if (!wantCrouch && me.crouch) {
    if (!overlapsAny(moveBoxes, me.p[0], me.p[1] + 0.01, me.p[2], PLAYER.radius, PLAYER.height)) me.crouch = false;
    else if (!me.onGround && !overlapsAny(moveBoxes, me.p[0], me.p[1] - tuck, me.p[2], PLAYER.radius, PLAYER.height)) {
      me.p[1] -= tuck;
      me.eyeH += tuck;
      me.crouch = false;
    }
  }

  let fw = 0, st = 0;
  if (!frozen) {
    if (keys.has('KeyW')) fw++;
    if (keys.has('KeyS')) fw--;
    if (keys.has('KeyD')) st++;
    if (keys.has('KeyA')) st--;
  }
  const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
  let wx = -sy * fw + cy * st, wz = -cy * fw - sy * st;
  const len = Math.hypot(wx, wz);
  if (len > 0) { wx /= len; wz /= len; }
  const walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
  let speed = def.speed * (me.scope ? 0.55 : 1);
  if (me.crouch) speed *= 0.34;
  else if (walking) speed *= 0.52;
  const wet = inWater(map.water, me.p);
  if (wet) speed *= 0.7;
  // Swim up: hold Space in water to rise to the surface and climb out over the edge.
  if (wet && keys.has('Space') && !frozen) { me.v[1] = Math.max(me.v[1], 3.2); me.onGround = false; }

  // Ladders: look up + W climbs, look down + W descends, Space jumps off.
  let ladder = now > (me.ladderFree || 0) ? ladderAt(map.ladders, me.p, me.crouch ? PLAYER.crouchHeight : PLAYER.height) : null;
  // Standing at the foot of a ladder and facing away from it: just walk.
  if (ladder && me.onGround && (-sy * -ladder.n[0] + -cy * -ladder.n[1]) < 0.3) ladder = null;
  if (ladder) {
    if (me.jumpQueued && !frozen) {
      me.v = [ladder.n[0] * 4, 3.5, ladder.n[1] * 4];
      me.ladderFree = now + 400;
      me.jumpQueued = false;
    } else {
      const climb = fw * (me.pitch > -0.45 ? 1 : -1);
      // W/S move along the ladder; A/D shuffle sideways. Near the top you step off forwards,
      // at the bottom you can walk away.
      let hx = cy * st * 1.5, hz = -sy * st * 1.5;
      // Hug the ladder (so you fit up through a hatch or into a vent at the top).
      const [px, pz] = ladderPull(ladder, me.p);
      hx += px; hz += pz;
      if ((climb > 0 && me.p[1] > ladder.max[1] - 0.6) || (me.onGround && climb <= 0)) { hx = wx * 2.5; hz = wz * 2.5; }
      // (A ladder that ends beside a ledge: shuffle off sideways onto it.)
      const off = climb > 0 && !st && me.p[1] > ladder.max[1] - 0.6 ? ladderExit(ladder, me.p, moveBoxes) : null;
      if (off) { hx = off[0]; hz = off[1]; }
      // Duck at the top so you fit through a window (like crouch-climbing in CS).
      if (climb > 0 && me.p[1] > ladder.max[1] - 0.6) me.crouch = true;
      me.v[0] = hx;
      me.v[2] = hz;
      // At the top, stay put just above the ladder end so you can step off forwards.
      me.v[1] = climb > 0 && me.p[1] > ladder.max[1] - 0.12 ? 0 : climb * 3.4;
      if (Math.abs(me.v[1]) > 0.1) {
        me.ladderDist = (me.ladderDist || 0) + Math.abs(me.v[1]) * dt;
        if (me.ladderDist > 0.7) { me.ladderDist = 0; audio.play('ladder'); }
      }
    }
  } else if (me.onGround) {
    const k = Math.min(1, dt * 10);
    me.v[0] += (wx * speed - me.v[0]) * k;
    me.v[2] += (wz * speed - me.v[2]) * k;
    me.airSpeed = Math.hypot(me.v[0], me.v[2]);
    if (me.jumpQueued && !frozen) {
      me.v[1] = PLAYER.jump * (me.zombie ? 1.12 : 1);
      me.onGround = false;
    }
  } else if (len) {
    me.v[0] += wx * speed * dt * 2;
    me.v[2] += wz * speed * dt * 2;
    const hs = Math.hypot(me.v[0], me.v[2]), max = Math.max(speed, me.airSpeed);
    if (hs > max) { me.v[0] *= max / hs; me.v[2] *= max / hs; }
  }
  me.jumpQueued = false;

  const wasGround = me.onGround, vy = me.v[1];
  me.climbing = !!ladder;
  movePlayer(me, dt, moveBoxes, ladder ? 0 : PLAYER.gravity * (game.cfg.party?.lowGravity ? 0.4 : 1));
  if (me.emote && (fw || st || me.v[1] > 0.5)) stopEmote();
  // A car that drove into us pushes us out of the way.
  for (const b of coll.carBoxes()) {
    const h = me.crouch ? PLAYER.crouchHeight : PLAYER.height;
    if (!overlapsBox(me.p[0], me.p[1], me.p[2], PLAYER.radius, h, b)) continue;
    const pushes = [[b.min[0] - PLAYER.radius - me.p[0], 0], [b.max[0] + PLAYER.radius - me.p[0], 0], [0, b.min[2] - PLAYER.radius - me.p[2]], [0, b.max[2] + PLAYER.radius - me.p[2]]];
    const [dx, dz] = pushes.sort((a, c) => Math.hypot(...a) - Math.hypot(...c))[0];
    me.p[0] += dx;
    me.p[2] += dz;
  }
  if (!wasGround && me.onGround && vy < -5) audio.play('land', null, surfaceAt(me.p));
  // Ease the view over small steps (stairs, slopes) instead of popping up and down.
  const viewY = Number.isFinite(me.viewY) ? me.viewY : me.p[1], dy = me.p[1] - viewY;
  me.viewY = me.onGround && Math.abs(dy) < 0.6 ? viewY + dy * Math.min(1, dt * 16) : me.p[1];

  const hs = Math.hypot(me.v[0], me.v[2]);
  if (me.onGround && !walking && !me.crouch && hs > (wet ? 2.5 : 3.5)) {
    me.stepDist += hs * dt;
    if (me.stepDist > (wet ? 1.8 : 2.4)) { me.stepDist = 0; audio.play(wet ? 'splash' : 'step', null, surfaceAt(me.p)); }
  }
  me.eyeH += ((me.crouch ? PLAYER.crouchEye : PLAYER.eye) - me.eyeH) * Math.min(1, dt * 14);

  if (me.reload && now >= me.reload.until) finishReload();
  if (me.resumeScope && now >= me.resumeAt) {
    if (WEAPONS[current()].sniper && !me.reload) me.scope = me.resumeScope;
    me.resumeScope = 0;
  }
  const canFire = game.phase !== 'freeze' && !ui.chat && locked && !me.act;
  if (mouse1 && canFire) tryFire(now);
  if (now - me.lastFire > (def.rate || 0.1) * 1000 + 150) {
    if (!mouse1) me.shotsFired = 0;
    const k = Math.min(1, dt * 9);
    me.punchP -= me.punchP * k;
    me.punchY -= me.punchY * k;
  } else {
    // the view settles back even while spraying
    const k = Math.min(1, dt * 3);
    me.punchP -= me.punchP * k;
    me.punchY -= me.punchY * k;
  }
  const item = currentItem();
  if (item && item.mag === 0 && item.res > 0 && !me.reload && now >= me.nextShot) startReload();
}

function specCandidates() {
  return [...remotes.values()].filter(r => r.alive && r.buf.length && (me.team === 'SPEC' || isMate(r) || (isDM() && inTeamName(me.team))));
}
function cycleSpectate() {
  const list = specCandidates();
  if (!list.length) { me.specId = null; return; }
  const i = list.findIndex(r => r.id === me.specId);
  me.specId = list[(i + 1) % list.length].id;
}

function updateCamera(dt, now) {
  let fov = BASE_FOV;
  specActive = false;
  if (killcam) {
    killcamCamera();
    hud.spectating(null);
  } else if (me.alive && me.driving != null && me.car) {
    carCamera();
    hud.spectating(null);
  } else if (me.alive && me.emote) {
    emoteCamera(now);
    hud.spectating(null);
  } else if (me.alive && me.mortar?.phase === 'aim') {
    mortarCamera();
    hud.spectating(null);
  } else if (me.alive) {
    camera.position.set(me.p[0], (me.driving == null && !me.riding && Number.isFinite(me.viewY) ? me.viewY : me.p[1]) + me.eyeH, me.p[2]);
    camera.rotation.set(me.pitch + me.punchP, me.yaw + me.punchY, 0);
    const z = WEAPONS[current()].zoom;
    if (me.scope && z) fov = z[me.scope - 1];
    hud.spectating(null);
  } else {
    const since = me.deathAt ? now - me.deathAt : Infinity;
    const canSpec = me.joined && since > 2500;
    let target = me.specId != null ? remotes.get(me.specId) : null;
    if (target && !target.alive) target = null;
    if (!target && canSpec) {
      const list = specCandidates();
      if (list.length) { target = list[0]; me.specId = target.id; }
    }
    if (target && canSpec) {
      specActive = true;
      camera.position.set(target.p[0], target.p[1] + (target.c ? PLAYER.crouchEye : PLAYER.eye), target.p[2]);
      camera.rotation.set(target.pitch, target.yaw, 0);
      hud.spectating(target.name);
    } else if (me.joined && since <= 2500) {
      camera.position.set(me.p[0], me.p[1] + 0.5, me.p[2]);
      camera.rotation.set(me.pitch * 0.5 - 0.3, me.yaw, 0.3);
      hud.spectating(null);
    } else {
      const a = now * 0.00004;
      camera.position.set(Math.sin(a) * 55, 48, Math.cos(a) * 55);
      camera.lookAt(0, 0, 0);
      hud.spectating(null);
    }
  }
  if (me.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * me.shake * 0.25;
    camera.position.y += (Math.random() - 0.5) * me.shake * 0.25;
    me.shake = Math.max(0, me.shake - dt * 1.5);
  }
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
  camera.getWorldDirection(_v);
  audio.listener(camera.position, _v);

  // Flashlight follows the view
  flashlight.intensity = me.alive && me.flashlight ? 70 : 0;
  if (flashlight.intensity) {
    flashlight.position.copy(camera.position).addScaledVector(_v, 0.2);
    flashlight.position.y -= 0.1;
    flashlight.target.position.copy(camera.position).addScaledVector(_v, 10);
  }
}

function updateViewModel(dt, now) {
  if (!vm) return;
  vm.visible = me.alive && me.driving == null && !(me.scope && WEAPONS[current()].sniper);
  const amb = ambientAt(camera.position);
  vmHemi.intensity = 2.2 * Math.max(0.12, amb);
  vmSun.intensity = amb < 1 ? 0.15 : 1.6;
  if (!vm.visible) return;
  const u = vm.userData;
  const hs = Math.hypot(me.v[0], me.v[2]);
  me.bobT += dt * hs * 1.6;
  const bob = me.onGround ? Math.min(1, hs / 6) : 0;
  let x = u.base.x + Math.sin(me.bobT) * 0.012 * bob;
  let y = u.base.y + Math.abs(Math.cos(me.bobT)) * 0.012 * bob;
  let z = u.base.z, rx = 0, ry = 0, rz = 0;

  me.kick = Math.max(0, me.kick - dt * 12);
  z += me.kick * 0.04;
  rx += me.kick * 0.06;

  if (now < me.drawUntil) {
    const f = (me.drawUntil - now) / 600;
    y -= f * 0.25;
    rx -= f * 0.6;
  }
  if (me.reload) {
    const f = clamp((now - me.reload.start) / me.reload.dur, 0, 1);
    const k = Math.sin(f * Math.PI);
    y -= k * 0.06;
    rx -= k * 0.25;
    rz += k * 0.45;
    // magazine drops out and a fresh one goes in; then the bolt/slide is worked
    if (u.mag) {
      const out = f < 0.2 ? f / 0.2 : f < 0.45 ? 1 : f < 0.6 ? 1 - (f - 0.45) / 0.15 : 0;
      u.mag.position.y = u.magBase.y - out * 0.25;
      u.mag.visible = !(f > 0.25 && f < 0.4);
    }
    if (u.action) u.action.position.z = u.actionBase.z + (f > 0.72 && f < 0.85 ? 0.05 : 0);
    if (u.pump) u.pump.position.z = u.pumpBase.z + (f > 0.8 && f < 0.92 ? 0.08 : 0);
  } else {
    if (u.mag) { u.mag.position.copy(u.magBase); u.mag.visible = true; }
    if (u.action) u.action.position.z = u.actionBase.z + (now < me.flashUntil + 30 ? 0.04 : 0);
    if (u.pump) {
      const since = now - me.lastFire, def = WEAPONS[current()];
      u.pump.position.z = u.pumpBase.z + (def.after === 'pump' || current() === 'm3' ? (since > 250 && since < 600 ? 0.08 : 0) : 0);
    }
  }
  if (me.nadeHold) {
    const k = Math.min(1, (now - me.nadeHold.at) / 200);
    y += k * (me.nadeHold.strong ? 0.03 : -0.04);
    z += k * 0.04;
    x += k * 0.03;
    rx += k * (me.nadeHold.strong ? 0.5 : -0.3);
  }
  if (me.swing > 0) {
    me.swing = Math.max(0, me.swing - dt * 4);
    const k = Math.sin(me.swing * Math.PI);
    if (me.swingAlt) z -= k * 0.15;
    else { ry += k * 0.9; x -= k * 0.08; rz -= k * 0.4; }
  }
  const dyaw = angleDiff(me.lastYaw, me.yaw);
  me.lastYaw = me.yaw;
  me.sway += (clamp(dyaw * 2, -0.08, 0.08) - me.sway) * Math.min(1, dt * 10);
  x += me.sway * 0.3;
  ry += me.sway;

  vm.position.set(x, y, z);
  vm.rotation.set(rx, ry, rz);
  if (u.flash) {
    u.flash.visible = now < me.flashUntil;
    u.flash.material.rotation = Math.random() * Math.PI;
  }
}

const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function updateHud(now) {
  hud.overlays(now, me.alive && me.nvgOn);
  renderer.domElement.style.filter = me.alive && me.nvgOn ? 'brightness(2.3) contrast(1.15) grayscale(1) sepia(1) hue-rotate(50deg) saturate(3.5)' : '';
  if (!me.joined) return;
  const id = current(), def = WEAPONS[id];
  hud.status(me, me.alive ? id : null);
  if ((isGG() || isDM() || isHNS()) && game.phase !== 'warmup') hud.set('money', ''); // nothing to pay for
  hud.blind(seekerWaiting() ? Math.ceil((game.hideUntil - serverNow()) / 1000) : null);

  const tl = Math.max(0, game.tl - (now - game.snapRecv) / 1000);
  let phase = '';
  if (game.phase === 'warmup') { hud.timer('WARMUP'); phase = 'Waiting for players on both teams — free buying'; }
  else if (isGG() && game.phase === 'live') { hud.timer('GUN GAME'); phase = ggStatus(); }
  else if (isDM() && game.phase === 'live') { hud.timer(fmtTime(Math.ceil(tl))); phase = dmStatus(); }
  else if (isHNS() && (game.phase === 'live' || game.phase === 'freeze')) { hud.timer(fmtTime(Math.ceil(tl))); phase = hnsStatus(); }
  else if (isZM() && (game.phase === 'live' || game.phase === 'freeze')) { hud.timer(fmtTime(Math.ceil(tl))); phase = zmStatus(); }
  else if (game.phase === 'live' && game.bomb.s === 'planted') { hud.timer('C4', true); phase = 'The bomb has been planted'; }
  else {
    hud.timer(fmtTime(Math.ceil(tl)));
    if (game.phase === 'freeze') phase = 'Buy time';
    else if (game.mode === 'hostage' && game.phase === 'live') {
      const left = [...hostages.values()].filter(h => h.state < 2).length;
      phase = me.team === 'T' ? `Guard the hostages (${left} left)` : `Rescue the hostages — ${left} left`;
    }
    else if (game.phase === 'end') phase = 'Round over';
  }
  const party = partyLabel();
  hud.set('phase', party ? `${phase}${phase ? ' · ' : ''}🎉 ${party}` : phase);

  const pxPerRad = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const sniperScoped = me.alive && me.scope > 0 && def.sniper;
  hud.crosshair(settings.chGap + computeSpread(def) * pxPerRad, me.alive && !def.sniper && me.mortar?.phase !== 'aim');
  hud.scope(sniperScoped);

  let hint = '';
  if (me.alive && !me.act) {
    const drop = nearestDrop();
    const sw = nearestSwitch(), car = nearestCar(), door = nearestDoor();
    const hostage = me.team === 'CT' ? nearestHostage() : null;
    if (me.driving != null) hint = '';
    else if (me.mortar?.phase === 'aim') {
      const item = currentItem(), dist = Math.hypot(me.mortar.at[0] - me.p[0], me.mortar.at[1] - me.p[2]);
      hint = `82-BM-37 — ${Math.round(dist)} m, ${item?.mag ?? 0} shells left · Mouse: aim · Mouse1: fire · E: pack up`;
    } else if (me.mortar) hint = '';
    else if (current() === 'mortar') hint = skyOpen(me.p) ? 'Click to set up the mortar' : 'The mortar needs open sky above it';
    else if (me.riding) hint = 'Press E to get out of the car';
    else if (hostage) hint = hostage.state === 1 && hostage.leader === me.id ? 'Press E to tell the hostage to wait' : 'Press E to lead the hostage to the street';
    else if (canPlantHere()) hint = 'Hold E to plant the bomb';
    else if (!canDefuseHere() && door && (!sw || door.dist < Math.hypot(me.p[0] - sw.p[0], me.p[2] - sw.p[2]))) hint = `Press E to ${game.doors[door.i] ? 'close' : 'open'} the door`;
    else if (!canDefuseHere() && sw) hint = `Press E to switch the lights ${game.lights[sw.group] === false ? 'on' : 'off'}`;
    else if (!canDefuseHere() && car && game.phase !== 'freeze') hint = !car.driver ? 'Press E to drive the car' : car.type === 'pickup' ? 'Press E to man the machine gun' : 'Press E to get in as a passenger';
    else if (ladderAt(map.ladders, me.p, PLAYER.height) && !me.onGround) hint = 'Ladder: look up/down + W to climb, Space to jump off';
    else if (canDefuseHere()) hint = me.kit ? 'Hold E to defuse (kit: 5 s)' : 'Hold E to defuse (10 s, buy a kit to halve it)';
    else if (drop && drop !== 'c4') hint = me.inv[slotKey(drop)] ? `Press E to swap for the ${WEAPONS[drop].name}` : `Press E to pick up the ${WEAPONS[drop].name}`;
    else if (game.phase === 'freeze' && !menu.isOpen && !isHNS()) hint = 'Press B to buy';
    else if (isDM() && !me.inv.primary && !menu.isOpen) hint = 'Press B for a free gun';
  } else if (!me.alive && me.team !== 'SPEC' && game.phase !== 'warmup') {
    hint = isGG() || isDM() ? 'Respawning...' : 'You will respawn next round';
  }
  hud.hint(hint);
  if (me.act) hud.progress(me.act.a === 'plant' ? 'Planting the bomb...' : 'Defusing the bomb...', me.act.pr);
  else if (me.mortar?.phase === 'setup') hud.progress('Setting up the mortar...', clamp((now - me.mortar.start) / (me.mortar.until - me.mortar.start), 0, 1));
  else hud.progress(null);

  let target = null;
  if (me.alive) {
    const o = eyePos(), d = aimDir(me.yaw + me.punchY, me.pitch + me.punchP);
    const wall = coll.raycast(o, d, 120);
    let best = wall ? wall.t : 120;
    for (const r of remotes.values()) {
      if (!r.alive) continue;
      const h = rayPlayer(o, d, r.p, r.c, best, bigHeads());
      if (h) { best = h.t; target = r; }
    }
  }
  hud.targetName(target?.name, target?.team);

  const showAll = me.team === 'SPEC';
  const mates = [...remotes.values()].filter(r => r.alive && (showAll || isMate(r)))
    .map(r => ({ p: r.p, team: r.team, carrier: r.id === game.carrier, radio: r.radioUntil > now }));
  let bomb = null;
  if ((me.team === 'T' || showAll) && game.bomb.p && (game.bomb.s === 'dropped' || game.bomb.s === 'planted')) {
    bomb = { p: game.bomb.p, planted: game.bomb.s === 'planted' };
  }
  const hostageDots = me.team === 'T' ? [] : [...hostages.values()].filter(h => h.state < 2).map(h => ({ p: h.p, follow: h.state === 1 }));
  hud.radar(me.alive ? { p: me.p, yaw: me.yaw } : null, mates, bomb, hostageDots);
  if (menu.isOpen && Math.floor(now / 250) !== Math.floor((now - 16) / 250)) menu.render();
}

let lastSend = 0;
function sendState(now) {
  if (!me.alive || now - lastSend < 33) return;
  lastSend = now;
  const r3 = v => Math.round(v * 1000) / 1000;
  const yaw = me.car ? me.car.yaw + me.camYaw : me.yaw;
  if (me.riding) me.crouch = !me.riding.gunner;
  net.send({ t: 'state', sq: me.spawnSeq, p: me.p.map(r3), yaw: r3(yaw), pitch: r3(me.car ? 0 : me.pitch), c: me.crouch ? 1 : 0, w: current(), fl: me.flashlight ? 1 : 0, mo: me.mortar ? 1 : 0 });
}

function saveScreenshot() {
  shotRequested = false;
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `counter-office-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  a.click();
  hud.small('Screenshot saved');
}

let last = performance.now();
let lastPatch = 0;
// Molotov fires: crackling, the burning screen when you stand in one, flames on anyone caught in it.
let burnUntil = 0, nextCrackle = 0;
function updateFires(dt, now) {
  if (!fx.fires.length && now > burnUntil) { $('burn').style.opacity = 0; return; }
  if (now > nextCrackle) {
    nextCrackle = now + 280;
    for (const f of fx.fires) audio.play('fire', [f.p[0], f.p[1] + 0.5, f.p[2]]);
  }
  if (me.alive && fx.fireAt(me.p)) burnUntil = now + FIRE.afterburn * 1000;
  const burning = me.alive && now < burnUntil;
  $('burn').style.opacity = burning ? (0.55 + 0.2 * Math.sin(now / 70)).toFixed(2) : 0;
  if (burning && Math.random() < dt * 30) fx.burn(me.p);
  for (const r of remotes.values()) {
    if (!r.alive || !r.p) continue;
    if (fx.fireAt(r.p)) r.burnUntil = now + FIRE.afterburn * 1000;
    if (now < (r.burnUntil || 0)) for (let i = 0; i < 2; i++) fx.burn(r.p);
  }
}

// ---- Gun Game
const isGG = () => game.cfg.gameMode === 'gungame';
const isZM = () => game.cfg.gameMode === 'zombie';
const isDM = () => game.cfg.gameMode === 'deathmatch';
const isHNS = () => game.cfg.gameMode === 'hns';
const inTeamName = t => t === 'T' || t === 'CT';
// Teammates: same side (in Deathmatch nobody is).
const isMate = r => r.team === me.team && !isDM();
// Hide and Seek: seekers can't move or see until the hiders have had their time.
const seekerWaiting = () => isHNS() && me.alive && me.team === 'CT' && game.phase === 'live' && serverNow() < (game.hideUntil || 0);

function dmStatus() {
  const list = game.roster.filter(p => inTeamName(p.team)).sort((a, b) => b.k - a.k);
  const lead = list[0], mine = game.roster.find(p => p.id === me.id);
  const goal = game.cfg.dmFrags || 30;
  if (!lead) return `Deathmatch — first to ${goal} kills`;
  return `Deathmatch — first to ${goal} · leader ${lead.name} (${lead.k})${mine && inTeamName(mine.team) ? ` · you ${mine.k}` : ''}`;
}

function hnsStatus() {
  const left = Math.ceil(((game.hideUntil || 0) - serverNow()) / 1000);
  const hiders = game.roster.filter(p => p.team === 'T' && p.alive).length;
  if (game.phase === 'freeze' || left > 0) return me.team === 'T' ? `Hide! The seekers come out in ${Math.max(0, left)} s` : `Hiders are hiding — you're out in ${Math.max(0, left)} s`;
  return me.team === 'T' ? `Stay hidden! ${hiders} hider${hiders === 1 ? '' : 's'} left` : `Find them! ${hiders} hider${hiders === 1 ? '' : 's'} left`;
}
const bigHeads = () => (game.cfg.party?.bigHeads ? 2 : 1);

// Zombie mode calls the teams Zombies and Humans.
function applyModeNames() {
  Object.assign(TEAM_NAME, isZM() ? { T: 'Zombies', CT: 'Humans' } : isHNS() ? { T: 'Hiders', CT: 'Seekers' } : { T: 'Terrorists', CT: 'Counter-Terrorists' });
}

function zmStatus() {
  const el = game.el + (performance.now() - game.snapRecv) / 1000;
  const left = Math.ceil(game.cfg.freezeTime + (game.cfg.zombieCountdown || 12) - el);
  const humans = game.roster.filter(p => p.team === 'CT' && p.alive).length;
  if (left > 0 && !game.roster.some(p => p.z)) return `Infection in ${left} s — buy guns (anywhere) and find a spot to hold`;
  return me.zombie ? `Infect the humans! ${humans} left` : me.team === 'CT' ? `Survive! ${humans} human${humans === 1 ? '' : 's'} left` : '';
}

const PARTY_NAMES = { lowGravity: 'Low gravity', headshotsOnly: 'Headshots only', bigHeads: 'Big heads' };
function partyLabel() {
  const p = game.cfg.party;
  if (!p) return '';
  const on = Object.keys(PARTY_NAMES).filter(k => p[k]).map(k => PARTY_NAMES[k]);
  if (p.weapon && game.cfg.gameMode === 'classic') on.push(`${WEAPONS[p.weapon].name} only`);
  return on.join(' · ');
}

// Zombies nearby growl now and then, so you hear them coming.
let nextGrowl = 0;
function updateZombieGrowls(now) {
  if (!isZM() || now < nextGrowl) return;
  nextGrowl = now + 1500 + Math.random() * 2500;
  const near = [...remotes.values()].filter(r => r.alive && r.look === 'Z' && Math.hypot(r.p[0] - me.p[0], r.p[2] - me.p[2]) < 28);
  if (near.length) audio.play('zgrowl', near[Math.floor(Math.random() * near.length)].p);
}

// ---- emotes (J): you see yourself from the front while the emote plays
const emoteMenu = {
  id: 'emote',
  title: 'Emotes',
  build: () => ({ items: EMOTES.map(e => ({ label: e.label, select: () => startEmote(e.id) })) }),
};
let selfModel = null, selfLook = null;
function startEmote(id) {
  if (!me.alive || me.driving != null || me.riding) return;
  const e = EMOTE[id];
  me.emote = { id, start: performance.now(), yaw: me.yaw };
  net.send({ t: 'emote', e: id });
  if (e.say && settings.radioVoice) audio.speak(e.say);
}
function stopEmote() {
  if (!me.emote) return;
  me.emote = null;
  net.send({ t: 'emote', e: 'stop' });
  if (selfModel) selfModel.visible = false;
}
function emoteCamera(now) {
  const e = me.emote, def = EMOTE[e.id];
  const t = (now - e.start) / 1000;
  if (t > def.secs) { me.emote = null; if (selfModel) selfModel.visible = false; return; }
  const look = me.zombie ? 'Z' : me.team;
  if (!selfModel || selfLook !== look) {
    if (selfModel) scene.remove(selfModel);
    selfModel = createPlayerModel(look);
    selfLook = look;
    scene.add(selfModel);
  }
  selfModel.visible = true;
  selfModel.position.set(me.p[0], me.p[1], me.p[2]);
  selfModel.rotation.set(0, e.yaw, 0);
  setPlayerWeapon(selfModel, current());
  posePlayer(selfModel, me.crouch, 0, 0, 0);
  poseEmote(selfModel, e.id, t);
  selfModel.userData.headG.scale.setScalar(bigHeads());
  // Orbit with the mouse; it starts in front of you.
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  camera.position.set(me.p[0] + fx * 3, me.p[1] + 1.7, me.p[2] + fz * 3);
  camera.lookAt(me.p[0], me.p[1] + 1.1, me.p[2]);
}
function showEmoteLabel(r, text) {
  if (r.emoteTag) { r.model.remove(r.emoteTag); r.emoteTag.material.map.dispose(); r.emoteTag.material.dispose(); r.emoteTag = null; }
  if (!text) return;
  r.emoteTag = createNameTag(`*${text.toLowerCase()}*`, '#ffe08a');
  r.emoteTag.position.y = 2.45;
  r.model.add(r.emoteTag);
}

// ---- achievements in the Esc menu
async function refreshAchievements() {
  try {
    const r = await fetch(`/api/achievements?name=${encodeURIComponent(settings.name || '')}`, { cache: 'no-store' });
    hud.achievements($('achievements'), await r.json());
  } catch { /* server unreachable */ }
}
function ggStatus() {
  const lv = me.ggLevel || 0, w = GUNGAME[lv], next = GUNGAME[lv + 1];
  const others = game.roster.filter(p => p.id !== me.id && p.lv);
  const best = others.sort((a, b) => b.lv - a.lv)[0];
  const lead = best ? (best.lv > lv + 1 ? ` · leader: ${best.name} (level ${best.lv})` : best.lv === lv + 1 ? ' · tied for the lead' : ' · you lead') : '';
  return `Level ${lv + 1}/${GUNGAME.length}: ${WEAPONS[w]?.name || w}${next ? ` → next: ${WEAPONS[next]?.name || next}` : ' — knife kill wins!'}${lead}`;
}

// ---- footsteps: the floor under someone decides the sound (sand, grass, wood, metal, tile, carpet, concrete)
let surfaces = null;
function surfaceAt(p) {
  // Standing on a car roof or bonnet: metal.
  for (const c of cars.values()) {
    if (Math.hypot(p[0] - c.p[0], p[2] - c.p[2]) < 2.2 && p[1] > c.p[1] + 0.6 && p[1] < c.p[1] + 2) return 'metal';
  }
  return surfaces ? surfaces.at(p[0], p[1], p[2]) : 'concrete';
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  updateLocal(dt, now);
  updateMortar(now);
  updateKillcam(dt);
  recordSelf();
  updateRemotes(dt);
  updateCars(dt);
  updateHostageModels(dt);
  updateBomb(now);
  if (now - lastPatch > 1000) { lastPatch = now; patchTree(scene); }
  updateCamera(dt, now);
  updateMortarMarks();
  updateOwnMortarModel();
  updateFires(dt, now);
  updateZombieGrowls(now);
  fx.update(dt, camera);
  world?.update(dt, camera.position);
  updateViewModel(dt, now);
  updateHud(now);
  sendState(now);

  renderer.clear();
  renderer.render(scene, camera);
  if (vm && vm.visible && !me.emote && me.mortar?.phase !== 'aim') {
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
  }
  if (shotRequested) saveScreenshot();
}
loadMap(DEFAULT_MAP);
refreshViewModel();
frame();
