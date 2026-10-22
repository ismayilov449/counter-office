// Counter-Office game server: serves the web client (HTTP + HTTPS) and runs the authoritative game
// (rounds, money, damage, bomb, grenades, maps) over WebSockets.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { MAPS, MAP_IDS, DEFAULT_MAP, siteAt, inBuyZone, inRescueZone, mapMode } from './shared/maps/index.js';
import { WEAPONS, ITEMS, GRENADES, FIRE, GUNGAME, defaultPistol, slotKey, ammoCost, shellFlight, mortarRange, MILS, MINES, MINE, CAMO, PING, BREAK } from './shared/weapons.js';
import { RADIO } from './shared/radio.js';
import { PLAYER, NADE, rayAABB, rayPlayer, simulateNade, overlapsAny, inWater } from './shared/physics.js';
// Zombie mode: zombie health, the first ("mother") zombies' health, seconds until the infection, respawn delay.
const ZOMBIE = { hp: 1000, motherHp: 2000, countdown: 12, respawn: 4 };
// Party modes the admin can switch on (see CFG.party).
const PARTY_WEAPONS = ['', 'awp', 'deagle', 'scout', 'ak47', 'knife', 'rpg'];
import { CAR, carBoxes, seatPos, exitSpots } from './shared/vehicles.js';
import { CollisionWorld } from './shared/collision.js';
import { skyOf } from './shared/maps/sky.js';
import { doorBox, doorCenter, openingSide } from './shared/doors.js';
import { Stats, rating } from './lib/stats.js';
import { rankIndex } from './shared/ranks.js';
import { ACHIEVEMENTS } from './shared/achievements.js';
import { EMOTE } from './shared/emotes.js';
import { createHostages, updateHostages, HOSTAGE_STATE } from './lib/hostages.js';
import { BotManager, BOT_LEVELS } from './lib/bots.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !isNaN(+v) ? +v : d);

const CFG = {
  port: num(env.PORT, 3000),
  httpsPort: num(env.HTTPS_PORT, 3443),
  roundsToWin: num(env.ROUNDS_TO_WIN, 10),
  freezeTime: num(env.FREEZE_TIME, 3),
  commenceTime: 3,
  roundTime: num(env.ROUND_TIME, 115),
  buyTime: num(env.BUY_TIME, 25),
  bombTime: num(env.BOMB_TIME, 40),
  plantTime: 3,
  defuseTime: 10,
  kitDefuseTime: 5,
  roundEndDelay: 5,
  startMoney: num(env.START_MONEY, 800),
  maxMoney: 16000,
  friendlyFire: env.FRIENDLY_FIRE === '1',
  rotateMaps: env.MAP_ROTATION !== '0',
  gameMode: ['gungame', 'zombie', 'deathmatch', 'hns'].includes(env.GAME_MODE) ? env.GAME_MODE : 'classic',
  // Bots fill both teams up to perTeam players each (8 = 8 vs 8); 0 turns them off.
  bots: { perTeam: num(env.BOTS, 8), difficulty: BOT_LEVELS[env.BOT_LEVEL] ? env.BOT_LEVEL : 'hard' },
  dmFrags: num(env.DM_FRAGS, 30), // Deathmatch: kills to win
  dmMinutes: num(env.DM_MINUTES, 10), // Deathmatch: time limit
  hnsHide: 30, // Hide and Seek: seconds the hiders get before the seekers are let out
  party: { lowGravity: false, headshotsOnly: false, bigHeads: false, weapon: '' },
  autoBalance: env.AUTO_BALANCE !== '0', // keep teams within one player of each other
  halftime: env.HALFTIME !== '0', // swap sides halfway through a classic match
  ggRespawn: 2, // Gun Game: seconds before you respawn
  ggProtect: 2, // Gun Game: seconds of spawn protection (ends when you shoot)
  sprayCooldown: 5000,
  tickRate: 30,
  maxPlayers: 32,
};

// ---------------------------------------------------------------- static files

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const MOUNTS = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three')],
  ['/', path.join(ROOT, 'public')],
];

function serveStatic(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { url = '/'; }
  if (url === '/api/admin') { handleAdmin(req, res); return; }
  if (url === '/api/achievements') {
    const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
    const e = stats.get(name) || {};
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({
      rank: e.rounds != null ? rankIndex(rating(e), e.rounds) : -1, rating: e.rounds != null ? rating(e) : 0, rounds: e.rounds || 0,
      list: ACHIEVEMENTS.map(a => ({ ...a, at: e.ach?.[a.id] || null, have: a.stat ? Math.min(a.goal, e[a.stat] || 0) : null })),
    }));
    return;
  }
  if (url === '/admin' || url === '/admin/') url = '/admin.html';
  if (url === '/api/leaderboard') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(stats.top(50)));
    return;
  }
  for (const [prefix, dir] of MOUNTS) {
    if (!url.startsWith(prefix)) continue;
    const file = path.join(dir, url.slice(prefix.length) || 'index.html');
    if (!file.startsWith(dir + path.sep)) break;
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
    return;
  }
  res.writeHead(404);
  res.end('Not found');
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

// Self-signed certificate so the game can run over HTTPS, which browsers require before they let a
// fullscreen page capture shortcuts like Ctrl+W (Keyboard Lock API).
async function loadCertificate() {
  const dir = path.join(ROOT, 'certs');
  const keyFile = path.join(dir, 'key.pem'), certFile = path.join(dir, 'cert.pem');
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  try {
    const { default: selfsigned } = await import('selfsigned');
    const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...lanAddresses().map(ip => ({ type: 7, ip }))];
    const pems = selfsigned.generate([{ name: 'commonName', value: 'Counter-Office' }], {
      days: 3650, keySize: 2048, algorithm: 'sha256',
      extensions: [{ name: 'basicConstraints', cA: false }, { name: 'subjectAltName', altNames }],
    });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(keyFile, pems.private);
    fs.writeFileSync(certFile, pems.cert);
    return { key: pems.private, cert: pems.cert };
  } catch (e) {
    console.warn('  HTTPS disabled (could not create a certificate):', e.message);
    return null;
  }
}

// ---------------------------------------------------------------- state

const T0 = performance.now();
const now = () => performance.now() - T0;
const players = new Map();
let nextId = 1;

let MAP = MAPS[env.MAP] || MAPS[String(env.MAP || '').replace(/^de_/, 'cs_')] || MAPS[DEFAULT_MAP];
const DATA_DIR = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, 'data');
const stats = new Stats(path.join(DATA_DIR, 'stats.json'));

// Server-wide game settings changed from the admin panel (and start money from the Esc menu), kept in
// data/settings.json. Saved values win over the environment variables.
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const START_MONEY_CHOICES = [800, 1000, 1600, 2400, 3200, 5000, 8000, 10000, 16000];
const int = (lo, hi) => v => Number.isInteger(v) && v >= lo && v <= hi;
const bool = v => typeof v === 'boolean';
const SETTINGS = {
  gameMode: v => ['classic', 'gungame', 'zombie', 'deathmatch', 'hns'].includes(v),
  bots: v => !!v && typeof v === 'object' && Number.isInteger(v.perTeam) && v.perTeam >= 0 && v.perTeam <= 10 && !!BOT_LEVELS[v.difficulty],
  dmFrags: int(5, 150),
  dmMinutes: int(2, 60),
  party: v => !!v && typeof v === 'object' && bool(v.lowGravity) && bool(v.headshotsOnly) && bool(v.bigHeads) && PARTY_WEAPONS.includes(v.weapon),
  startMoney: v => START_MONEY_CHOICES.includes(v),
  roundsToWin: int(1, 30),
  roundTime: int(30, 900),
  freezeTime: int(0, 20),
  buyTime: int(5, 300),
  bombTime: int(15, 120),
  friendlyFire: bool,
  autoBalance: bool,
  halftime: bool,
  rotateMaps: bool,
};
const savedSettings = {};
try {
  const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  for (const [k, ok] of Object.entries(SETTINGS)) if (saved[k] !== undefined && ok(saved[k])) { CFG[k] = saved[k]; savedSettings[k] = saved[k]; }
} catch { /* no saved settings yet */ }
function saveSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(savedSettings, null, 1));
}
const settingsView = () => Object.fromEntries(Object.keys(SETTINGS).map(k => [k, CFG[k]]));
const isGG = () => CFG.gameMode === 'gungame';
const isZM = () => CFG.gameMode === 'zombie';
const isDM = () => CFG.gameMode === 'deathmatch';
const isHNS = () => CFG.gameMode === 'hns';
// Teammates (nobody is in Deathmatch: everyone fights everyone).
const mates = (a, b) => !!a && !!b && a.team === b.team && !isDM();
const partyWeapon = () => (CFG.gameMode === 'classic' ? CFG.party.weapon : '');
const headScale = () => (CFG.party.bigHeads ? 2 : 1);
const isHostageMap = () => mapMode(MAP) === 'hostage';
// Stats only count in real matches, not warmup.
const record = (p, field, n = 1) => {
  if (!p || p.bot || game.phase === 'warmup' || !inTeam(p)) return;
  const e = stats.add(p.name, field, n);
  if (e) for (const a of ACHIEVEMENTS) if (a.stat === field && e[field] >= a.goal) unlockAch(p, a.id);
};
let world = new CollisionWorld(MAP);

const game = {
  phase: 'warmup', // warmup | freeze | live | end
  phaseEnd: 0,
  roundStartAt: 0,
  pendingStart: 0,
  matchOver: false,
  round: 0,
  score: { T: 0, CT: 0 },
  lossStreak: { T: 0, CT: 0 },
  bomb: { state: 'none', carrier: null, p: null, explodeAt: 0 },
  plantedThisRound: false,
  hostages: [],
  glassAt: {},
  pieceHp: new Map(), // breakable chunks' health (see blastMap)
  firstBlood: false,
  teamSize: { T: 0, CT: 0 },
  drops: [],
  nades: [],
  fires: [],
  mines: [],
  nextMineId: 1,
  endVote: null,
  sprays: new Map(),
  nextDropId: 1,
  nextNadeId: 1,
};

const other = team => (team === 'T' ? 'CT' : 'T');
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const vec3 = a => (Array.isArray(a) && a.length === 3 && a.every(isNum) ? a : null);
const norm = d => { const l = Math.hypot(d[0], d[1], d[2]); return l > 1e-6 ? d.map(v => v / l) : null; };
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const r2 = v => Math.round(v * 100) / 100;
const eyeOf = p => [p.p[0], p.p[1] + (p.c ? PLAYER.crouchEye : PLAYER.eye), p.p[2]];
const inTeam = p => p.team === 'T' || p.team === 'CT';
const teamName = t => (t === 'T' ? 'Terrorists' : 'Counter-Terrorists');

function send(p, msg) {
  if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}
function broadcast(msg, filter) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if ((!filter || filter(p)) && p.ws.readyState === 1) p.ws.send(s);
}
const notify = (text, big = false, filter) => broadcast({ t: 'msg', text, big }, filter);

const makeItem = id => ({ id, mag: WEAPONS[id].mag, res: WEAPONS[id].reserve });
const freshInv = team => ({ primary: null, secondary: inTeam({ team }) ? makeItem(defaultPistol(team)) : null, he: 0, flash: 0, smoke: 0, molotov: 0, pmn: 0, mon50: 0, c4: false });
const ownItem = (p, w) => (p.inv.primary?.id === w ? p.inv.primary : p.inv.secondary?.id === w ? p.inv.secondary : null);

function addMoney(p, amount) {
  p.money = Math.max(0, Math.min(CFG.maxMoney, p.money + amount));
}

function sendMe(p) {
  send(p, {
    t: 'me', team: p.team, alive: p.alive, hp: Math.max(0, Math.round(p.hp)), armor: Math.round(p.armor),
    helmet: p.helmet, kit: p.kit, nvg: p.nvg, camo: !!p.camo, camoOn: !!p.camoOn, money: p.money, inv: p.inv, zombie: !!p.zombie,
  });
}

function sendRoster() {
  const list = [...players.values()].filter(p => p.joined).map(p => ({
    id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, ping: p.ping, alive: p.alive, vote: p.vote || null,
    lv: isGG() ? (p.level || 0) + 1 : undefined, rank: rankOf(p.name), z: p.zombie ? 1 : 0, bot: p.bot ? 1 : 0,
  }));
  broadcast({ t: 'roster', list, carrier: game.bomb.carrier }, q => q.team === 'T');
  broadcast({ t: 'roster', list, carrier: null }, q => q.team !== 'T');
}

function resetLoadout(p) {
  p.inv = freshInv(p.team);
  p.armor = 0;
  p.helmet = false;
  p.kit = false;
  p.nvg = false;
  p.camo = false;
  p.camoOn = false;
}

// ---------------------------------------------------------------- spawning, teams, maps

function groundY(x, y, z) {
  const hit = world.raycast([x, y + 1, z], [0, -1, 0], 60, 'solid');
  return hit ? y + 1 - hit.t : 0;
}

// Gun Game: anywhere on the map you can walk around (from the bots' grid): roomy, dry floor, and of a
// few random picks the one furthest from the other players. Null until the grid is built.
function randomSpot(p) {
  const nav = bots.nav();
  if (!nav) return null;
  const others = [...players.values()].filter(q => q !== p && q.alive && inTeam(q));
  let best = null, bestD = -1;
  for (let i = 0; i < 40; i++) {
    const n = nav.random(-1);
    if (n < 0 || nav.tight[n]) continue;
    const pos = nav.pos(n);
    if (inWater(MAP.water, [pos[0], pos[1] + 0.5, pos[2]])) continue;
    if (overlapsAny(world.move(null, pos, 2), pos[0], pos[1] + 0.05, pos[2], PLAYER.radius, PLAYER.height)) continue;
    const d = Math.min(30, ...others.map(q => dist3(q.p, pos)));
    if (d > bestD) { best = pos; bestD = d; }
    if (bestD >= 30 && i >= 8) break;
  }
  return best && { p: [best[0], best[1] + 0.01, best[2]], yaw: Math.random() * Math.PI * 2 - Math.PI };
}

function spawnPlayer(p) {
  p.burnUntil = 0;
  // Zombie mode: humans spread over both spawn areas, zombies come back at the T spawn.
  const spots = (isZM() && p.team === 'CT' ? [...MAP.spawns.CT, ...MAP.spawns.T] : MAP.spawns[p.team]).slice().sort(() => Math.random() - 0.5);
  const taken = [...players.values()].filter(q => q !== p && q.alive);
  let spot = spots.find(s => taken.every(q => dist2(q.p, s.p) > 1.2)) || spots[0];
  if (isDM() && game.phase !== 'warmup') {
    // Deathmatch: any spawn on the map, away from everyone else.
    const far = s => Math.min(99, ...taken.map(q => dist3(q.p, s.p)));
    const all = [...MAP.spawns.T, ...MAP.spawns.CT].sort((a, b) => far(b) - far(a));
    spot = all[Math.floor(Math.random() * Math.min(4, all.length))];
  }
  if (isGG() && game.phase !== 'warmup') spot = randomSpot(p) || spot;
  if (p.driving != null || p.riding != null) releaseCar(p);
  p.alive = true;
  p.hp = 100;
  p.p = spot.p.slice();
  p.yaw = spot.yaw;
  p.pitch = 0;
  p.c = 0;
  p.act = null;
  p.reloadUntil = 0;
  p.history = [];
  p.spawnSeq++;
  p.zombie = isZM() && p.team === 'T' && game.phase !== 'warmup';
  if (p.zombie) { p.hp = ZOMBIE.hp; zombieLoadout(p); }
  else if (isDM() && game.phase !== 'warmup') dmLoadout(p);
  else if (isHNS() && game.phase !== 'warmup') hnsLoadout(p);
  else if (partyWeapon()) partyLoadout(p);
  else if (MAP.freeArmor && CFG.gameMode === 'classic') { p.armor = 100; p.helmet = true; }
  if (game.phase === 'warmup') p.money = CFG.maxMoney;
  send(p, { t: 'spawn', p: p.p, yaw: p.yaw, sq: p.spawnSeq });
  sendMe(p);
  if (p.bot) bots.onSpawn(p);
  if (isGG() && game.phase === 'live') send(p, { t: 'gg', level: p.level || 0, w: GUNGAME[p.level || 0], quiet: true });
}

// With auto team balance on, a team can't get two players ahead of the other.
function teamFull(p, team) {
  if (!CFG.autoBalance || !inTeam({ team }) || isZM() || p.bot) return false;
  const count = t => [...players.values()].filter(q => q !== p && q.team === t && !q.bot).length;
  return count(team) + 1 - count(other(team)) >= 2;
}

function setTeam(p, team) {
  // Zombie mode: you join as a human before the infection and as a zombie after it.
  if (isZM() && inTeam({ team }) && game.phase !== 'warmup') team = game.infected ? 'T' : 'CT';
  if (p.team === team) return;
  const wasSpec = !inTeam(p);
  if (p.alive) killPlayer(p, null, 'world', false, true);
  p.team = team;
  resetLoadout(p);
  if (!p.bot) notify(`${p.name} joined the ${team === 'SPEC' ? 'spectators' : teamName(team)}`);
  if (inTeam(p) && isGG() && game.phase === 'live') {
    // Join a Gun Game in progress at the lowest level anyone is on.
    const levels = [...players.values()].filter(q => q !== p && inTeam(q)).map(q => q.level || 0);
    if (wasSpec || p.level == null) p.level = levels.length ? Math.min(...levels) : 0;
    ggLoadout(p);
    spawnPlayer(p);
    protect(p);
  } else if (inTeam(p) && (game.phase === 'warmup' || game.phase === 'freeze' || (isZM() && game.phase === 'live' && !game.infected))) spawnPlayer(p);
  else sendMe(p);
  checkTeams();
  checkRoundEnd();
  sendRoster();
  if (!p.bot) syncBots();
}

const humanCount = team => [...players.values()].filter(p => !p.bot && p.team === team).length;

function teamCount(team, aliveOnly = false) {
  let n = 0;
  for (const p of players.values()) if (p.team === team && (!aliveOnly || p.alive)) n++;
  return n;
}

function checkTeams() {
  // Zombie mode picks the zombies itself: any two players are enough.
  const ready = isZM() ? teamCount('T') + teamCount('CT') >= 2 : teamCount('T') > 0 && teamCount('CT') > 0;
  if (game.phase === 'warmup') {
    if (ready && !game.pendingStart) {
      game.pendingStart = now() + CFG.commenceTime * 1000;
      notify(`Game commencing in ${CFG.commenceTime} seconds...`, true);
    } else if (!ready) {
      game.pendingStart = 0;
    }
  } else if (!ready) {
    enterWarmup();
  }
}

function enterWarmup(respawnAll = false) {
  game.phase = 'warmup';
  game.pendingStart = 0;
  game.matchOver = false;
  game.endVote = null;
  game.score = { T: 0, CT: 0 };
  game.bomb = { state: 'none', carrier: null, p: null, explodeAt: 0 };
  game.drops = [];
  game.nades = [];
  game.fires = [];
  for (const p of players.values()) {
    if (!inTeam(p)) continue;
    p.inv.c4 = false;
    p.act = null;
    if (!p.alive || respawnAll) { if (!p.alive) resetLoadout(p); spawnPlayer(p); } else { p.money = CFG.maxMoney; sendMe(p); }
  }
  notify('Warmup — waiting for players on both teams', true);
  checkTeams();
}

// ---------------------------------------------------------------- dynamic world: glass, lights, cars

function lightGroups() {
  const groups = new Set();
  for (const r of MAP.rooms || []) groups.add(r.group);
  for (const sw of MAP.switches || []) groups.add(sw.group);
  return groups;
}

function resetWorld() {
  world.setBroken([]);
  world.setGone([]);
  game.pieceHp = new Map();
  game.glassAt = {};
  game.lights = {};
  for (const g of lightGroups()) game.lights[g] = true;
  for (const p of players.values()) { p.driving = null; p.riding = null; }
  world.cars = (MAP.vehicles || []).map((v, id) => freshCar(v, id));
  world.setDoors([]);
  game.hostages = isHostageMap() && CFG.gameMode === 'classic' ? createHostages(MAP) : [];
  clearMines();
  broadcast({ t: 'world', glass: [], brk: [], lights: game.lights, doors: world.doorStates });
}

// ---- Breakable walls and furniture (maps with `breakables`: cs_mansion). Explosions and heavy guns wear the
// chunks down; a broken one is gone (no collision, not drawn) until the next round.
function breakPieces(ids) {
  if (!ids.length) return;
  for (const id of ids) world.gone.add(id);
  for (const id of ids) (game.pieceAt ||= new Map()).set(id, now());
  broadcast({ t: 'brk', ids });
  // windows in a broken wall fall out
  const pcs = ids.map(id => MAP.breakables[id]);
  breakGlass(world.intactGlass.filter(g => pcs.some(pc => [0, 1, 2].every(k => g.min[k] < pc.max[k] + 0.1 && g.max[k] > pc.min[k] - 0.1))).map(g => g.id));
}

function hurtPiece(pc, dmg, out) {
  const hp = (game.pieceHp.get(pc.id) ?? pc.hp) - dmg;
  game.pieceHp.set(pc.id, hp);
  if (hp <= 0) out.push(pc.id);
}

// An explosion: every chunk within its radius takes damage, less further away and half behind another breakable
// thing; nothing behind something that can't break (a floor, the stairs). Runs after the blast has hurt people,
// so a wall it breaks still shielded them.
function blastMap(at, weapon) {
  const B = BREAK.blast[weapon];
  if (!MAP.breakables || !B) return;
  const round = game.round;
  setTimeout(() => {
    if (game.round !== round) return;
    const [R, D] = B, out = [];
    for (const pc of MAP.breakables) {
      if (world.gone.has(pc.id)) continue;
      if ([0, 1, 2].some(k => at[k] < pc.min[k] - R || at[k] > pc.max[k] + R)) continue;
      const c = [0, 1, 2].map(k => Math.max(pc.min[k], Math.min(at[k], pc.max[k])));
      const d = dist3(at, c);
      if (d > R) continue;
      let k = 1;
      if (d > 0.05) {
        const h = world.raycast(at, c.map((v, i) => (v - at[i]) / d), d - 0.03, 'solid');
        if (h && h.box.brk == null) continue;
        if (h && h.box.brk !== pc.id) k = 0.5;
      }
      hurtPiece(pc, D * (1 - d / R) * k * (0.75 + Math.random() * 0.5), out);
    }
    breakPieces(out);
  }, 0);
}

function breakGlass(ids) {
  const done = ids.filter(id => world.breakGlass(id));
  for (const id of done) game.glassAt[id] = now();
  if (done.length) broadcast({ t: 'glass', ids: done });
}

function freshCar(v, id) {
  // A pickup has a driver and one gunner on the PKT in the back; a car has a driver and two passengers.
  const type = v.type || 'car';
  const c = { id, type, p: [v.p[0], 0, v.p[1]], yaw: v.yaw, speed: 0, steer: 0, driver: null, riders: type === 'pickup' ? [null] : [null, null], color: v.color, hp: CAR.hp, wrecked: false };
  c.p[1] = groundY(c.p[0], 10, c.p[2]); // parked cars stand in the open: drop them onto the ground from above
  return c;
}

const carOf = p => world.cars.find(c => c.driver === p.id || c.riders.includes(p.id));

// Someone leaves their seat (getting out, dying, respawning, disconnecting). When the driver leaves, the
// passenger who got in first takes the wheel.
function releaseCar(p, promote = true) {
  const c = carOf(p);
  p.driving = null;
  p.riding = null;
  if (!c) return;
  if (c.driver === p.id) {
    c.driver = null;
    c.speed = 0;
    c.steer = 0;
    c.leftAt = now();
    const next = promote && !c.wrecked ? c.riders.map(id => players.get(id)).find(q => q?.alive) : null;
    if (next) {
      c.riders = c.riders.map(id => (id === next.id ? null : id));
      c.driver = next.id;
      c.leftAt = 0;
      next.riding = null;
      next.driving = c.id;
      next.p = seatPos(c, 0);
      send(next, { t: 'drive', id: c.id, car: { p: c.p, yaw: c.yaw }, moved: true });
    }
  } else {
    c.riders = c.riders.map(id => (id === p.id ? null : id));
  }
}

// The first one in drives; the next two ride along as passengers (and can shoot out of the windows).
function enterCar(p, c) {
  p.reloadUntil = 0;
  if (c.driver == null) {
    c.driver = p.id;
    c.leftAt = 0;
    p.driving = c.id;
    p.p = seatPos(c, 0);
    send(p, { t: 'drive', id: c.id, car: { p: c.p, yaw: c.yaw } });
  } else {
    const i = c.riders.indexOf(null);
    c.riders[i] = p.id;
    p.riding = { car: c.id, seat: i + 1 };
    p.p = seatPos(c, i + 1);
    send(p, { t: 'ride', id: c.id, seat: i + 1, gunner: c.type === 'pickup', car: { p: c.p, yaw: c.yaw } });
  }
  broadcast({ t: 'sfx', s: 'door', p: c.p });
}

// ---- car damage: bullets and grenades wear a car down; at zero it explodes, killing whoever is inside
function damageCar(c, dmg, attacker) {
  if (!c || c.wrecked || dmg <= 0) return;
  c.hp -= dmg;
  if (attacker && c.hp > 0) c.lastHit = attacker.id;
  if (c.hp <= 0) explodeCar(c, attacker || players.get(c.lastHit) || null);
}

function explodeCar(c, attacker) {
  c.hp = 0;
  c.wrecked = true;
  c.wreckAt = now();
  c.speed = 0;
  c.steer = 0;
  const center = [c.p[0], c.p[1] + 0.8, c.p[2]];
  broadcast({ t: 'boom', p: center, k: 'car', car: c.id });
  blastMap(center, 'car');
  const inside = [c.driver, ...c.riders].map(id => players.get(id)).filter(Boolean);
  for (const q of inside) {
    releaseCar(q, false);
    send(q, { t: 'exited', p: q.p, yaw: q.yaw });
    killPlayer(q, attacker && attacker !== q && !mates(attacker, q) ? attacker : null, 'car', false);
  }
  c.driver = null;
  c.riders = [null, null];
  breakGlass(world.intactGlass.filter(g => dist3(center, [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2, (g.min[2] + g.max[2]) / 2]) < 6).map(g => g.id));
  const R = CAR.blastRadius;
  for (const q of players.values()) {
    if (!q.alive) continue;
    if (attacker && q !== attacker && mates(q, attacker) && !CFG.friendlyFire) continue;
    const chest = [q.p[0], q.p[1] + 1.1, q.p[2]];
    const d = dist3(center, chest);
    if (d > R || !lineOfSight(center, chest)) continue;
    applyDamage(q, attacker, 130 * (1 - d / R), 'he', 'car', 1, null, center);
  }
  for (const h of game.hostages) {
    if (h.state === 'dead' || h.state === 'rescued') continue;
    const d = dist3(center, [h.p[0], h.p[1] + 1.1, h.p[2]]);
    if (d < R) hurtHostage(h, attacker, 130 * (1 - d / R), 'car');
  }
  // Chain reaction
  for (const o of world.cars) {
    if (o === c || o.wrecked) continue;
    const d = dist3(center, [o.p[0], o.p[1] + 0.8, o.p[2]]);
    if (d < 6) setTimeout(() => damageCar(o, 450 * (1 - d / 6), attacker), 250);
  }
}

// Without rounds (warmup, Deathmatch, Gun Game) broken walls and furniture come back after 90 s, but not while
// someone stands where they go back.
function mendPieces(t) {
  if (!world.gone.size) return;
  const mended = [...world.gone].filter(id => {
    if (t - (game.pieceAt?.get(id) || 0) < 90000) return false;
    const pc = MAP.breakables[id];
    return ![...players.values()].some(q => q.alive && overlapsAny([{ min: pc.min, max: pc.max }], q.p[0], q.p[1], q.p[2], PLAYER.radius, PLAYER.height));
  });
  if (!mended.length) return;
  world.setGone([...world.gone].filter(id => !mended.includes(id)));
  for (const id of mended) game.pieceHp.delete(id);
  broadcast({ t: 'world', glass: [...world.broken], brk: [...world.gone], lights: game.lights, doors: world.doorStates });
}

// Warmup has no rounds, so the map repairs itself: windows after 20 s, walls and furniture after 90 s (mendPieces),
// hostages come back 8 s after being rescued or killed, and cars left away from their parking spot return after 20 s.
function warmupRepairs(t) {
  mendPieces(t);
  const fixed = [...world.broken].filter(id => t - (game.glassAt[id] || 0) > 20000);
  if (fixed.length) {
    world.setBroken([...world.broken].filter(id => !fixed.includes(id)));
    broadcast({ t: 'world', glass: [...world.broken], brk: [...world.gone], lights: game.lights, doors: world.doorStates });
  }
  const fresh = isHostageMap() ? createHostages(MAP) : [];
  game.hostages = game.hostages.map(h =>
    (h.state === 'dead' || h.state === 'rescued') && t - (h.doneAt || 0) > 8000 ? fresh[h.id] : h);
  world.cars = world.cars.map(c => (c.wrecked && t - c.wreckAt > 20000 ? freshCar(MAP.vehicles[c.id], c.id) : c));
  for (const c of world.cars) {
    const home = MAP.vehicles?.[c.id];
    if (!home || c.driver != null || c.riders.some(id => id != null) || !c.leftAt || t - c.leftAt < 20000) continue;
    c.leftAt = 0;
    if (dist2(c.p, [home.p[0], 0, home.p[1]]) < 1) continue;
    c.p = [home.p[0], groundY(home.p[0], 10, home.p[1]), home.p[1]];
    c.yaw = home.yaw;
    c.speed = 0;
    c.steer = 0;
  }
}

function exitCar(p) {
  const c = carOf(p);
  if (!c) { p.driving = null; p.riding = null; return; }
  const boxes = world.move(null, c.p, 6);
  let spot = exitSpots(c).find(s => !overlapsAny(boxes, s[0], groundY(s[0], c.p[1] + 0.5, s[2]) + 0.05, s[2], PLAYER.radius, PLAYER.height));
  if (!spot) spot = [c.p[0], c.p[1] + CAR.height + 0.1, c.p[2]]; // nowhere to go: climb out onto the roof
  else spot = [spot[0], groundY(spot[0], c.p[1] + 0.5, spot[2]), spot[2]];
  releaseCar(p);
  p.p = spot;
  p.history = [];
  send(p, { t: 'exited', p: spot, yaw: c.yaw });
}

function nearestDoor(p) {
  let best = null, bd = 1.9;
  (MAP.doors || []).forEach((d, i) => {
    const c = doorCenter(d);
    const dd = dist2(p.p, c);
    if (dd < bd && Math.abs(p.p[1] + 1 - c[1]) < 1.6) { bd = dd; best = { i, d, dist: dd }; }
  });
  return best;
}

// Doors open away from whoever uses them, and won't swing into someone standing in the way.
function useDoor(p, i) {
  const d = MAP.doors[i];
  const next = world.doorStates[i] === 0 ? openingSide(d, p.p) : 0;
  const box = doorBox(d, next);
  const inWay = [...players.values()].some(q => q.alive && overlapsAny([box], q.p[0], q.p[1], q.p[2], PLAYER.radius, PLAYER.height)) ||
    game.hostages.some(h => h.state !== 'dead' && h.state !== 'rescued' && overlapsAny([box], h.p[0], h.p[1], h.p[2], PLAYER.radius, PLAYER.height));
  if (inWay) { send(p, { t: 'msg', text: 'Someone is in the way of the door.' }); return; }
  const states = world.doorStates.slice();
  states[i] = next;
  world.setDoors(states);
  broadcast({ t: 'doors', doors: states, i, open: next !== 0, p: doorCenter(d) });
}

function nearestSwitch(p) {
  let best = null, bd = 1.8;
  for (const sw of MAP.switches || []) {
    const d = dist2(p.p, sw.p);
    if (d < bd && Math.abs(p.p[1] + 1.2 - sw.p[1]) < 1.6) { bd = d; best = sw; }
  }
  return best;
}

// Driver updates: trust the driver's physics, check speed sanity and run people over.
function onCar(p, m, t) {
  const c = world.cars[m.id];
  if (!c || c.driver !== p.id || !p.alive || c.wrecked) return;
  const pos = vec3(m.p);
  if (!pos || !isNum(m.yaw) || !isNum(m.speed)) return;
  if (dist3(pos, c.p) > 4) return;
  c.p = pos;
  c.yaw = m.yaw;
  c.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, m.speed));
  c.steer = isNum(m.steer) ? m.steer : 0;
  if (Math.abs(c.speed) < 4) return;
  const boxes = carBoxes(c);
  for (const q of players.values()) {
    if (q === p || !q.alive || q.driving != null || q.riding != null) continue;
    if (!CFG.friendlyFire && mates(q, p)) continue;
    const hit = boxes.some(b => q.p[0] + 0.35 > b.min[0] && q.p[0] - 0.35 < b.max[0] && q.p[2] + 0.35 > b.min[2] &&
      q.p[2] - 0.35 < b.max[2] && q.p[1] < b.max[1] && q.p[1] + 1.8 > b.min[1]);
    if (!hit || t - (q.lastRunOver || 0) < 600) continue;
    q.lastRunOver = t;
    applyDamage(q, p, Math.abs(c.speed) * 5, 'chest', 'car', 1);
    broadcast({ t: 'sfx', s: 'crash', p: q.p });
  }
}

// ---- end-of-match map vote
const SUMMARY_DELAY = 2500, END_VOTE_TIME = 15000;

function endVoteState() {
  const counts = {};
  for (const id of game.endVote.votes.values()) counts[id] = (counts[id] || 0) + 1;
  return {
    maps: MAP_IDS.map(id => ({ id, title: MAPS[id].title })), current: MAP.id, counts,
    left: Math.max(0, (game.endVote.until - now()) / 1000), voters: [...players.values()].filter(p => p.joined && !p.bot).length,
  };
}

function onEndVote(p, id) {
  if (!game.endVote || !p.joined || !MAPS[id]) return;
  game.endVote.votes.set(p.id, id);
  broadcast({ t: 'endvote', vote: endVoteState(), who: p.name, id });
  // Everyone has voted: don't make them wait out the clock.
  const voters = [...players.values()].filter(q => q.joined && !q.bot);
  if (voters.every(q => game.endVote.votes.has(q.id))) {
    game.endVote.until = Math.min(game.endVote.until, now() + 2000);
    game.phaseEnd = Math.min(game.phaseEnd, now() + 2500);
  }
}

// The map with the most votes (ties broken at random); with no votes, the usual rotation.
function nextMapAfterMatch() {
  const counts = {};
  if (game.endVote) for (const [pid, id] of game.endVote.votes) if (players.has(pid)) counts[id] = (counts[id] || 0) + 1;
  game.endVote = null;
  const best = Math.max(0, ...Object.values(counts));
  if (best > 0) {
    const tied = Object.keys(counts).filter(id => counts[id] === best);
    return tied[Math.floor(Math.random() * tied.length)];
  }
  return CFG.rotateMaps ? MAP_IDS[(MAP_IDS.indexOf(MAP.id) + 1) % MAP_IDS.length] : MAP.id;
}

function changeMap(id) {
  if (!MAPS[id]) return;
  MAP = MAPS[id];
  world = new CollisionWorld(MAP);
  game.sprays.clear();
  for (const p of players.values()) p.vote = null;
  broadcast({ t: 'map', id, mode: mapMode(MAP) });
  resetWorld();
  notify(`Changing map to ${MAP.title}`, true);
  enterWarmup(true);
  sendRoster();
}

function checkVotes() {
  const voters = [...players.values()].filter(p => p.joined && !p.bot);
  const counts = {};
  for (const p of voters) if (p.vote) counts[p.vote] = (counts[p.vote] || 0) + 1;
  for (const [id, n] of Object.entries(counts)) {
    if (n > voters.length / 2) { changeMap(id); return; }
  }
}

function startMatch() {
  game.endVote = null;
  game.halftimePending = false;
  game.halftimeDone = false;
  game.score = { T: 0, CT: 0 };
  game.lossStreak = { T: 0, CT: 0 };
  game.round = 0;
  game.matchOver = false;
  for (const p of players.values()) {
    p.kills = 0;
    p.deaths = 0;
    p.match = { hs: 0, mvps: 0, rescues: 0, dmg: 0 };
    p.money = CFG.startMoney;
    p.alive = false;
    p.level = 0;
    resetLoadout(p);
  }
  if (isGG()) startGunGame();
  else if (isDM()) startDeathmatch();
  else startRound();
}

// ---- auto team balance: between rounds, move players from the bigger team until they are within one
function balanceTeams() {
  if (!CFG.autoBalance || isZM()) return;
  for (;;) {
    const nT = humanCount('T'), nCT = humanCount('CT');
    if (Math.abs(nT - nCT) < 2) return;
    const from = nT > nCT ? 'T' : 'CT', to = other(from);
    // The player with the fewest kills (the newest one on a tie) switches.
    const p = [...players.values()].filter(q => q.team === from && !q.bot).sort((a, b) => a.kills - b.kills || b.id - a.id)[0];
    movePlayer(p, to);
    notify(`${p.name} was moved to the ${teamName(to)} to balance the teams`);
  }
}

function movePlayer(p, team) {
  if (p.driving != null || p.riding != null) releaseCar(p);
  if (p.inv.c4) { p.inv.c4 = false; if (game.bomb.carrier === p.id) game.bomb = { state: 'none', carrier: null, p: null, explodeAt: 0 }; }
  p.team = team;
  if (!isGG()) resetLoadout(p);
  send(p, { t: 'msg', text: `You are now a ${team === 'T' ? 'Terrorist' : 'Counter-Terrorist'}`, big: true });
  sendMe(p);
}

// ---- halftime: after the first half of a classic match the teams switch sides
const halftimeRound = () => Math.max(1, CFG.roundsToWin - 1);
function swapSides() {
  game.halftimePending = false;
  game.halftimeDone = true;
  game.score = { T: game.score.CT, CT: game.score.T };
  game.lossStreak = { T: 0, CT: 0 };
  for (const p of players.values()) {
    if (!inTeam(p)) continue;
    if (p.driving != null || p.riding != null) releaseCar(p);
    p.team = other(p.team);
    resetLoadout(p);
    p.money = CFG.startMoney;
    p.alive = false;
    sendMe(p);
  }
  broadcast({ t: 'halftime', score: game.score });
  notify('Teams have switched sides', true);
}

function startRound() {
  if (game.halftimePending) swapSides();
  if (game.hnsSwap) swapHns();
  balanceTeams();
  syncBots(true);
  if (isZM()) {
    // Everyone starts the round human (CT) with money to buy whatever they like.
    for (const p of players.values()) {
      if (!inTeam(p)) continue;
      if (p.zombie || p.team !== 'CT') { if (p.driving != null || p.riding != null) releaseCar(p); p.alive = false; }
      p.team = 'CT';
      p.zombie = false;
      p.money = CFG.maxMoney;
    }
    game.infected = false;
  }
  const t = now();
  game.round++;
  game.phase = 'freeze';
  game.roundStartAt = t;
  game.phaseEnd = t + CFG.freezeTime * 1000;
  game.drops = [];
  game.nades = [];
  game.fires = [];
  game.smokes = [];
  clearMines();
  game.bomb = { state: 'none', carrier: null, p: null, explodeAt: 0 };
  game.plantedThisRound = false;
  game.firstBlood = false;
  game.teamSize = { T: teamCount('T'), CT: teamCount('CT') };
  resetWorld();

  for (const p of players.values()) {
    p.rs = { kills: 0, dmg: 0, rescues: 0, obj: null };
    p.clutchVs = 0;
    if (!inTeam(p)) continue;
    if (!p.alive) resetLoadout(p);
    p.inv.c4 = false;
    spawnPlayer(p);
  }
  // aim_map: weapons lying in the field every round.
  if (MAP.roundDrops && CFG.gameMode === 'classic' && !partyWeapon()) {
    for (const d of MAP.roundDrops) {
      const w = WEAPONS[d.w];
      game.drops.push({ id: game.nextDropId++, w: d.w, mag: w.mag, res: w.reserve, p: [d.p[0], groundY(d.p[0], d.p[1] + 1, d.p[2]), d.p[2]], owner: null, until: 0 });
    }
  }

  const ts = [...players.values()].filter(p => p.team === 'T');
  if (isZM()) {
    game.infectAt = game.phaseEnd + ZOMBIE.countdown * 1000;
    notify(`Zombie mode! The infection starts ${ZOMBIE.countdown} seconds after buy time. Buy guns and find a spot to hold!`, true);
  } else if (isHNS()) {
    game.hideUntil = game.phaseEnd + CFG.hnsHide * 1000;
    broadcast({ t: 'hns', hideUntil: game.hideUntil, hide: CFG.hnsHide });
    notify(`Hide and Seek! Hiders: you have ${CFG.hnsHide} seconds to hide.`, true, q => q.team === 'T');
    notify(`Hide and Seek! Seekers: you are let out in ${CFG.hnsHide} seconds — then knife every hider.`, true, q => q.team === 'CT');
  } else if (mapMode(MAP) !== 'bomb') {
    if (isHostageMap()) {
      notify('Rescue the hostages! CTs: press E on a hostage to lead it to the street.', false, q => q.team === 'CT');
      notify('Guard the hostages in the mansion!', false, q => q.team === 'T');
    }
  } else if (ts.length) {
    const c = ts[Math.floor(Math.random() * ts.length)];
    c.inv.c4 = true;
    game.bomb = { state: 'carried', carrier: c.id, p: null, explodeAt: 0 };
    sendMe(c);
    send(c, { t: 'msg', text: 'You have the bomb! Plant it at site A or B.' });
  }
  broadcast({ t: 'round', n: game.round, score: game.score });
  sendRoster();
}

// ---------------------------------------------------------------- Zombie mode

function zombieLoadout(p) {
  p.inv = freshInv('T');
  p.inv.secondary = null;
  p.armor = 0;
  p.helmet = false;
  p.kit = false;
  p.nvg = true;
  p.reloadUntil = 0;
}

function startInfection() {
  const humans = [...players.values()].filter(p => inTeam(p) && p.alive);
  game.infected = true;
  if (humans.length < 2) return;
  const n = Math.min(humans.length - 1, Math.max(1, Math.round(humans.length / 5)));
  const chosen = humans.sort(() => Math.random() - 0.5).slice(0, n);
  for (const p of chosen) turnZombie(p, null, true);
  notify(`${chosen.map(p => p.name).join(' and ')} ${n > 1 ? 'are' : 'is'} infected! Run!`, true);
  broadcast({ t: 'zstart', ids: chosen.map(p => p.id) });
}

function turnZombie(p, by, mother = false) {
  if (p.driving != null || p.riding != null) releaseCar(p);
  p.team = 'T';
  p.zombie = true;
  p.hp = mother ? ZOMBIE.motherHp : ZOMBIE.hp;
  p.act = null;
  p.burnUntil = 0;
  zombieLoadout(p);
  if (by) {
    by.kills++;
    addMoney(by, 300);
    record(by, 'infections');
    sendMe(by);
    p.deaths++;
  }
  sendMe(p);
  broadcast({ t: 'infect', v: p.id, k: by ? by.id : null, mother });
  sendRoster();
  checkRoundEnd();
}

// A zombie's claws: armor soaks the hit, after that the human turns.
function clawHit(target, zombie, dmg) {
  if (target.armor > 0) {
    target.armor = Math.max(0, target.armor - dmg);
    send(target, { t: 'dmg', hp: target.hp, armor: Math.round(target.armor), from: zombie.p, d: 0 });
    send(zombie, { t: 'hit', hs: false, kill: false });
    return;
  }
  send(zombie, { t: 'hit', hs: false, kill: true });
  turnZombie(target, zombie);
}

// ---------------------------------------------------------------- party modes

function partyLoadout(p) {
  const w = partyWeapon();
  p.inv = freshInv(p.team);
  p.inv.secondary = null;
  if (w !== 'knife') {
    const item = makeItem(w);
    item.res = Math.max(item.res, item.mag * 6);
    p.inv[slotKey(w)] = item;
  }
  p.armor = 100;
  p.helmet = true;
}

// ---------------------------------------------------------------- achievements & ranks

function unlockAch(p, id) {
  if (!p || p.bot || game.phase === 'warmup' || !inTeam(p)) return;
  if (stats.unlock(p.name, id)) broadcast({ t: 'ach', id, pid: p.id, name: p.name });
}

function rankOf(name) {
  const e = stats.get(name);
  return e ? rankIndex(rating(e), e.rounds) : -1;
}

// Tell everyone when someone climbs a rank (checked at the end of every round).
function checkRankUps() {
  for (const p of players.values()) {
    if (!p.joined) continue;
    const r = rankOf(p.name);
    if (p.rankSeen != null && r > p.rankSeen) broadcast({ t: 'rankup', id: p.id, name: p.name, rank: r, placed: p.rankSeen < 0 });
    p.rankSeen = r;
  }
}

// ---------------------------------------------------------------- Deathmatch

// Free for all: you respawn two seconds after dying with the guns you picked last (B buys anything, free).
function dmLoadout(p) {
  p.inv = freshInv(p.team);
  if (p.dmSecondary) p.inv.secondary = makeItem(p.dmSecondary);
  // (The mortar again only if nobody else took it meanwhile: one on the map.)
  if (p.dmPrimary === 'mortar' && [...players.values()].some(q => q !== p && q.inv.primary?.id === 'mortar')) p.dmPrimary = null;
  if (p.dmPrimary) p.inv.primary = makeItem(p.dmPrimary);
  p.inv.he = 1;
  p.armor = 100;
  p.helmet = true;
  p.money = CFG.maxMoney;
  p.reloadUntil = 0;
}

function startDeathmatch() {
  const t = now();
  game.round = 1;
  game.phase = 'live';
  game.roundStartAt = t;
  game.phaseEnd = t + CFG.dmMinutes * 60000;
  game.drops = [];
  game.nades = [];
  game.fires = [];
  game.smokes = [];
  clearMines();
  game.bomb = { state: 'none', carrier: null, p: null, explodeAt: 0 };
  game.firstBlood = false;
  game.teamSize = { T: teamCount('T'), CT: teamCount('CT') };
  resetWorld();
  for (const p of players.values()) {
    p.rs = { kills: 0, dmg: 0, rescues: 0, obj: null };
    if (!inTeam(p)) continue;
    spawnPlayer(p);
    protect(p);
  }
  broadcast({ t: 'sfx', s: 'go' });
  notify(`Deathmatch! Everyone against everyone — first to ${CFG.dmFrags} kills (or the most kills after ${CFG.dmMinutes} minutes) wins. Press B for free guns.`, true);
  sendRoster();
}

function dmWin(p) {
  if (game.phase !== 'live') return;
  const t = now();
  game.phase = 'end';
  game.matchOver = true;
  game.phaseEnd = t + SUMMARY_DELAY + END_VOTE_TIME + 1500;
  for (const q of players.values()) {
    if (!inTeam(q)) continue;
    q.act = null;
    record(q, 'matches');
  }
  const reason = p ? `${p.name} wins the Deathmatch with ${p.kills} kills!` : 'The Deathmatch is over';
  if (p) {
    record(p, 'matchWins');
    record(p, 'mvps');
    if (p.match) p.match.mvps++;
  }
  const mvp = p ? { id: p.id, name: p.name, reason: `${p.kills} kills` } : null;
  broadcast({ t: 'roundEnd', winner: p?.team || 'T', reason, score: game.score, matchMsg: reason, mvp, solo: p?.name || '-' });
  openMatchEnd(p?.team || 'T', { dm: { name: p?.name || '-', team: p?.team || 'T', kills: p?.kills || 0 } });
  checkRankUps();
  sendRoster();
}

// ---------------------------------------------------------------- Hide and Seek

// Terrorists hide, Counter-Terrorists seek with knives. Hiders get flashbangs and a smoke to get away.
function hnsLoadout(p) {
  p.inv = freshInv(p.team);
  p.inv.secondary = null;
  if (p.team === 'T') { p.inv.flash = 2; p.inv.smoke = 1; }
  p.armor = 0;
  p.helmet = false;
  p.kit = false;
  p.nvg = false;
  p.reloadUntil = 0;
}

// When the seekers find everyone, the teams switch for the next round.
function swapHns() {
  game.hnsSwap = false;
  for (const p of players.values()) {
    if (!inTeam(p)) continue;
    if (p.driving != null || p.riding != null) releaseCar(p);
    p.team = other(p.team);
    p.alive = false;
    sendMe(p);
  }
  notify('The seekers found everyone — the teams switch: hiders seek, seekers hide!', true);
}

// ---------------------------------------------------------------- bots

const bots = new BotManager({
  players: () => players, game: () => game, map: () => MAP, world: () => world, cfg: () => CFG, now,
  inTeam, enemies: (a, b) => !mates(a, b), mode: () => CFG.gameMode, mapMode: () => mapMode(MAP), phase: () => game.phase,
  canBuy: p => !canBuy(p, now()), buy: (p, id) => onBuy(p, id), use: p => onUse(p, { on: true }, now()),
  shoot: (p, m) => onShoot(p, m), nade: (p, m) => onNade(p, m), siteAt: pos => siteAt(MAP, pos),
  door: p => { const d = nearestDoor(p); return d && world.doorStates[d.i] === 0 ? d.i : null; },
  useDoor: (p, i) => useDoor(p, i), kill: p => killPlayer(p, null, 'world', false),
  doors: () => (MAP.doors || []).map((d, i) => ({ i, box: world.doorBoxes[i], open: world.doorStates[i] !== 0 })),
});

function addBot(team) {
  let p = null;
  const ws = { readyState: 3, send() {}, close() { if (p) leave(p); } };
  p = newPlayer(ws);
  p.bot = bots.brain();
  p.name = bots.name([...players.values()].map(q => q.name));
  p.joined = true;
  players.set(p.id, p);
  setTeam(p, team);
}

// Keep each team at CFG.bots.perTeam players by adding or removing bots around the people playing. With nobody
// playing there are no bots. In the middle of a round only dead bots leave (the rest go when it ends).
function syncBots(force = false) {
  const per = CFG.bots.perTeam;
  const people = [...players.values()].filter(p => !p.bot && p.joined && inTeam(p));
  const all = [...players.values()].filter(p => p.bot);
  const canGo = q => force || !q.alive || game.phase === 'warmup' || game.phase === 'end' || isGG() || isDM();
  const trim = (list, want) => {
    list.sort((a, b) => a.alive - b.alive);
    while (list.length > want && canGo(list[0])) leave(list.shift());
  };
  if (!people.length || per <= 0) { trim(all, 0); return; }
  if (isZM()) {
    const want = Math.max(0, per * 2 - people.length);
    trim(all, want);
    for (let n = all.length; n < want; n++) addBot('CT');
    return;
  }
  for (const team of ['T', 'CT']) {
    const want = Math.max(0, per - people.filter(p => p.team === team).length);
    const mine = all.filter(p => p.team === team);
    trim(mine, want);
    for (let n = mine.length; n < want; n++) addBot(team);
  }
}

// ---------------------------------------------------------------- Gun Game

// What a player carries on their level: only that weapon, the knife and full armor.
function ggLoadout(p) {
  const w = GUNGAME[p.level || 0];
  p.inv = freshInv(p.team);
  p.inv.secondary = null;
  if (w === 'he') p.inv.he = 1;
  else if (w !== 'knife') {
    const item = makeItem(w);
    item.res = Math.max(item.res, item.mag * 3);
    p.inv[slotKey(w)] = item;
  }
  p.armor = 100;
  p.helmet = true;
  p.reloadUntil = 0;
}

function protect(p) {
  p.protectUntil = now() + CFG.ggProtect * 1000;
}

function startGunGame() {
  const t = now();
  game.round = 1;
  game.phase = 'live';
  game.roundStartAt = t;
  game.phaseEnd = t;
  game.drops = [];
  game.nades = [];
  game.fires = [];
  game.bomb = { state: 'none', carrier: null, p: null, explodeAt: 0 };
  game.firstBlood = false;
  game.teamSize = { T: teamCount('T'), CT: teamCount('CT') };
  resetWorld();
  for (const p of players.values()) {
    p.rs = { kills: 0, dmg: 0, rescues: 0, obj: null };
    if (!inTeam(p)) continue;
    ggLoadout(p);
    spawnPlayer(p);
    protect(p);
  }
  broadcast({ t: 'ggStart', levels: GUNGAME.length });
  broadcast({ t: 'sfx', s: 'go' });
  notify(`Gun Game! Each kill gives you the next weapon — ${GUNGAME.length} levels, a knife kill on the last one wins.`, true);
  sendRoster();
}

function ggLevelName(lv) {
  return WEAPONS[GUNGAME[lv]]?.name || GUNGAME[lv];
}

function ggSetLevel(p, lv) {
  p.level = Math.max(0, Math.min(GUNGAME.length - 1, lv));
  if (p.alive) {
    ggLoadout(p);
    sendMe(p);
  }
  send(p, { t: 'gg', level: p.level, w: GUNGAME[p.level] });
}

function ggOnKill(killer, v, weapon) {
  if (!killer || killer === v) {
    // Suicide (falling, your own grenade...) costs a level.
    if (v.level > 0) { v.level--; send(v, { t: 'msg', text: `Suicide — you lost a level (now ${ggLevelName(v.level)})` }); }
    return;
  }
  if (mates(killer, v)) return;
  // A knife kill steals a level from the victim.
  if (weapon === 'knife' && v.level > 0) {
    v.level--;
    notify(`${killer.name} stole a level from ${v.name} with the knife!`);
  }
  const lv = killer.level || 0;
  // Only a kill with your level's weapon (or the knife) moves you up.
  if (weapon !== GUNGAME[lv] && weapon !== 'knife') return;
  if (lv === GUNGAME.length - 1) { ggWin(killer); return; }
  const leader = Math.max(0, ...[...players.values()].filter(q => q !== killer && inTeam(q)).map(q => q.level || 0));
  ggSetLevel(killer, lv + 1);
  if (killer.level === GUNGAME.length - 1) notify(`${killer.name} is on the knife level!`, true);
  else if (killer.level > leader) notify(`${killer.name} leads on level ${killer.level + 1}: ${ggLevelName(killer.level)}`);
  sendRoster();
}

function ggWin(p) {
  const t = now();
  game.phase = 'end';
  game.matchOver = true;
  game.phaseEnd = t + SUMMARY_DELAY + END_VOTE_TIME + 1500;
  for (const q of players.values()) {
    if (!inTeam(q)) continue;
    q.act = null;
    record(q, 'matches');
  }
  record(p, 'matchWins');
  record(p, 'ggWins');
  record(p, 'mvps');
  if (p.match) p.match.mvps++;
  const reason = `${p.name} won Gun Game!`;
  const mvp = { id: p.id, name: p.name, reason: 'finished the knife level' };
  broadcast({ t: 'roundEnd', winner: p.team, reason, score: game.score, matchMsg: reason, mvp, gg: true });
  openMatchEnd(p.team, { gg: { name: p.name, team: p.team } });
  checkRankUps();
  sendRoster();
}

// ---------------------------------------------------------------- round flow

function checkRoundEnd() {
  if (isGG() || isDM()) return;
  if (game.phase !== 'live' && game.phase !== 'freeze') return;
  if (isZM()) {
    if (!game.infected) return;
    if (teamCount('CT', true) === 0) endRound('T', 'The zombies have taken over!');
    else if (teamCount('T') === 0) endRound('CT', 'The zombies are gone — humans win!');
    return;
  }
  // Every person is dead and only bots are left: nobody wants to watch them play, so the round is decided now.
  const people = [...players.values()].filter(p => !p.bot && inTeam(p));
  if (game.phase === 'live' && people.length && !people.some(p => p.alive) && [...players.values()].some(p => p.bot && p.alive)) {
    finishBotRound();
    return;
  }
  if (teamCount('CT') > 0 && teamCount('CT', true) === 0) {
    endRound('T', 'All Counter-Terrorists eliminated');
  } else if (teamCount('T') > 0 && teamCount('T', true) === 0 && game.bomb.state !== 'planted') {
    endRound('CT', 'All Terrorists eliminated');
  } else if (isHostageMap()) {
    const rescued = game.hostages.filter(h => h.state === 'rescued').length;
    const waiting = game.hostages.filter(h => h.state === 'idle' || h.state === 'follow').length;
    if (rescued > 0 && waiting === 0) endRound('CT', 'All hostages have been rescued', 3500);
  }
}

// Round MVP: the winning team's player with the biggest impact.
function pickMvp(winner) {
  let best = null, bestScore = -1;
  for (const p of players.values()) {
    if (p.team !== winner || !p.rs) continue;
    const score = p.rs.kills * 2 + p.rs.rescues * 3 + (p.rs.obj ? 4 : 0) + p.rs.dmg / 100;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (!best || bestScore <= 0) return null;
  const r = best.rs;
  const reason = r.obj === 'defuse' ? 'defused the bomb' : r.obj === 'plant' ? 'planted the bomb'
    : r.rescues ? `rescued ${r.rescues} hostage${r.rescues > 1 ? 's' : ''}` : `${r.kills} kill${r.kills === 1 ? '' : 's'}`;
  return { id: best.id, name: best.name, reason };
}

function matchSummary(winner) {
  const list = [...players.values()].filter(p => inTeam(p) && p.match).map(p => ({
    id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, hs: p.match.hs, mvps: p.match.mvps,
    rescues: p.match.rescues, dmg: Math.round(p.match.dmg), lv: isGG() ? (p.level || 0) + 1 : undefined,
  }));
  if (isGG()) list.sort((a, b) => b.lv - a.lv || b.k - a.k);
  const top = (key, title, unit, filter = () => true) => {
    const c = list.filter(filter).sort((a, b) => b[key] - a[key] || b.k - a.k)[0];
    return c && c[key] > 0 ? { title, name: c.name, team: c.team, value: `${c[key]} ${unit}` } : null;
  };
  const awards = [
    top('mvps', 'Match MVP', 'MVPs'),
    top('k', 'Top fragger', 'kills'),
    top('hs', 'Headshot machine', 'headshots'),
    top('dmg', 'Damage dealer', 'damage'),
    isHostageMap() ? top('rescues', 'Hostage hero', 'rescues') : null,
  ].filter(Boolean);
  return { winner, score: game.score, players: isGG() ? list : list.sort((a, b) => b.k - a.k), awards };
}

// The bots' round is settled by who has more players (then health) left; a planted bomb goes off unless
// the CTs outnumber the Terrorists. The bots then drop dead so the next round starts right away.
function finishBotRound() {
  const alive = tm => [...players.values()].filter(p => p.team === tm && p.alive);
  const score = tm => alive(tm).length * 1000 + alive(tm).reduce((a, p) => a + p.hp, 0);
  let winner;
  if (game.bomb.state === 'planted') winner = alive('CT').length > alive('T').length ? 'CT' : 'T';
  else if (isHNS()) winner = alive('T').length ? 'T' : 'CT';
  else if (score('T') === score('CT')) winner = isHostageMap() || mapMode(MAP) === 'elim' ? 'T' : 'CT';
  else winner = score('T') > score('CT') ? 'T' : 'CT';
  endRound(winner, `Everyone is dead — only bots were left, so the round goes to the ${teamName(winner)}`);
  game.phaseEnd = Math.min(game.phaseEnd, now() + 3000);
  for (const p of players.values()) if (p.bot && p.alive) killPlayer(p, null, 'world', false, true);
}

function endRound(winner, reason, bonus = 3250) {
  if (isGG() || isDM() || (game.phase !== 'live' && game.phase !== 'freeze')) return;
  const t = now();
  const loser = other(winner);
  game.phase = 'end';
  game.phaseEnd = t + CFG.roundEndDelay * 1000;
  game.score[winner]++;
  game.lossStreak[winner] = 0;
  const lossBonus = 1400 + 500 * Math.min(game.lossStreak[loser], 4);
  game.lossStreak[loser]++;

  for (const p of players.values()) {
    p.act = null;
    for (const h of game.hostages) if (h.state === 'follow') { h.state = 'idle'; h.leader = null; }
    if (p.team === winner) addMoney(p, bonus);
    else if (p.team === loser) addMoney(p, lossBonus + (loser === 'T' && game.plantedThisRound ? 800 : 0));
    sendMe(p);
  }

  const mvp = pickMvp(winner);
  for (const p of players.values()) {
    if (!inTeam(p)) continue;
    record(p, 'rounds');
    record(p, p.team === winner ? 'wins' : 'losses');
  }
  if (mvp) {
    const p = players.get(mvp.id);
    record(p, 'mvps');
    if (p?.match) p.match.mvps++;
  }

  let matchMsg = null;
  if (game.score[winner] >= CFG.roundsToWin) {
    game.matchOver = true;
    game.phaseEnd = t + SUMMARY_DELAY + END_VOTE_TIME + 1500;
    matchMsg = `${teamName(winner)} win the match ${game.score[winner]}:${game.score[loser]}!`;
    for (const p of players.values()) {
      if (!inTeam(p)) continue;
      record(p, 'matches');
      if (p.team === winner) record(p, 'matchWins');
    }
  }
  // Achievements: a clutch (last one alive against 2+), or the last human standing in zombie mode.
  const alive = [...players.values()].filter(p => p.team === winner && p.alive);
  if (alive.length === 1 && !isZM() && alive[0].clutchVs >= 2) unlockAch(alive[0], 'clutch');
  if (alive.length === 1 && isZM() && winner === 'CT') unlockAch(alive[0], 'survivor');
  checkRankUps();
  if (isHNS() && winner === 'CT' && !matchMsg) game.hnsSwap = true;
  if (!matchMsg && CFG.halftime && !isZM() && !isHNS() && !game.halftimeDone && game.round === halftimeRound() && CFG.roundsToWin > 1) {
    game.halftimePending = true;
    game.phaseEnd += 2000;
    notify('Halftime! The teams switch sides next round.', true);
  }
  broadcast({ t: 'roundEnd', winner, reason, score: game.score, matchMsg, mvp, halftime: !!game.halftimePending });
  if (matchMsg) openMatchEnd(winner);
  sendRoster();
}

// The summary and the next-map vote, a moment after the last round.
function openMatchEnd(winner, extra = {}) {
  const round = game.round;
  setTimeout(() => {
    if (!game.matchOver || game.round !== round) return;
    game.endVote = { votes: new Map(), until: now() + END_VOTE_TIME };
    broadcast({ t: 'matchEnd', ...matchSummary(winner), ...extra, vote: endVoteState() });
  }, SUMMARY_DELAY);
}

// Heavy kills burst the body apart on the clients: explosions (RPG, mortar, HE, C4, a car) blow it to pieces, an AWP or M249
// tears off the part it hit, a Scout or Desert Eagle does it with a headshot.
function gibOf(weapon, hs, how) {
  if (!how) return null;
  if (how.part === 'he' && ['rpg', 'mortar', 'he', 'c4', 'car', 'mon50'].includes(weapon)) return { k: 'blast', from: how.from.map(r2) };
  if (weapon === 'pmn' && how.part === 'legs') return { k: 'shot', part: 'legs', from: how.from.map(r2) };
  if (['awp', 'm249'].includes(weapon) || (hs && ['scout', 'deagle'].includes(weapon))) return { k: 'shot', part: how.part, from: how.from.map(r2) };
  return null;
}

function killPlayer(v, killer, weapon, hs, silent = false, how = null) {
  if (!v.alive) return;
  v.alive = false;
  v.hp = 0;
  v.act = null;
  v.reloadUntil = 0;
  v.fl = 0;
  v.deathAt = now();
  if (v.driving != null || v.riding != null) releaseCar(v);
  if (!silent) v.deaths++;

  // Everything worth taking is left on the ground (Gun Game hands out weapons by level instead).
  const yaw = v.yaw;
  if (isGG() || isDM()) { v.inv.primary = null; v.inv.secondary = null; }
  if (v.inv.primary) { spawnDrop(v, v.inv.primary, offsetPos(v.p, yaw, 0.35)); v.inv.primary = null; }
  if (v.inv.secondary) { spawnDrop(v, v.inv.secondary, offsetPos(v.p, yaw + Math.PI / 2, 0.45)); v.inv.secondary = null; }
  if (v.inv.c4) dropBomb(v, offsetPos(v.p, yaw - Math.PI / 2, 0.45));

  let streak = 0, first = false, ace = false;
  if (killer && killer !== v) {
    if (mates(killer, v)) {
      killer.kills--;
      addMoney(killer, -3300);
    } else {
      killer.kills++;
      addMoney(killer, WEAPONS[weapon]?.killReward ?? 300);
      if (game.phase !== 'warmup') {
        killer.rs ||= { kills: 0, dmg: 0, rescues: 0, obj: null };
        streak = ++killer.rs.kills;
        first = !game.firstBlood;
        game.firstBlood = true;
        ace = streak >= Math.max(3, game.teamSize[v.team] || 0);
        record(killer, 'kills');
        if (hs) { record(killer, 'headshots'); if (killer.match) killer.match.hs++; }
        const counter = { knife: 'knifeKills', he: 'nadeKills', molotov: 'molotovKills', rpg: 'rpgKills', pkt: 'pktKills' }[weapon];
        if (counter) record(killer, counter);
        if (v.zombie) record(killer, 'zombieKills');
        if (weapon === 'car') unlockAch(killer, 'road_rage');
        if (ace) unlockAch(killer, 'ace');
        if (weapon === 'molotov' && v.burnFire != null) {
          const key = `${killer.id}:${v.burnFire}`;
          game.fireKills ||= {};
          game.fireKills[key] = (game.fireKills[key] || 0) + 1;
          if (game.fireKills[key] >= 2) unlockAch(killer, 'barbecue');
        }
      }
    }
    sendMe(killer);
  }
  if (!silent) record(v, 'deaths');
  const gib = gibOf(weapon, hs, how);
  if (!silent) broadcast({ t: 'kill', k: killer ? killer.id : null, v: v.id, w: weapon, hs: !!hs, streak, first, ace, gib: gib && { ...gib, p: v.p.map(r2), c: v.c, yaw: r2(v.yaw) } });
  if (!silent && isGG() && game.phase === 'live') ggOnKill(killer, v, weapon);
  if (!silent && isDM() && game.phase === 'live' && killer && killer !== v && killer.kills >= CFG.dmFrags) dmWin(killer);
  // Clutch: the last one alive on a team facing two or more.
  if (!silent && game.phase === 'live' && !isGG() && !isZM() && inTeam(v)) {
    const mates = [...players.values()].filter(q => q.team === v.team && q.alive);
    const foes = [...players.values()].filter(q => q.team === other(v.team) && q.alive).length;
    if (mates.length === 1 && !mates[0].clutchVs && foes >= 2) mates[0].clutchVs = foes;
  }
  sendMe(v);
  sendRoster();
  checkRoundEnd();
}

// Returns the damage dealt; `hitInfo` collects headshot/kill flags for a single hit message.
// from: where the shot or blast came from (for the body bursting apart on a heavy kill, see gibOf).
function applyDamage(v, attacker, dmg, part, weapon, pen, hitInfo, from = null) {
  if (!v.alive) return 0;
  if (attacker && attacker !== v && v.protectUntil && now() < v.protectUntil) return 0; // Gun Game spawn protection
  const mult = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 }[part] ?? 1;
  let d = dmg * mult;
  if (v.armor > 0 && part !== 'legs' && (part !== 'head' || v.helmet)) {
    let nd = d * pen;
    let ad = (d - nd) * 0.5;
    if (ad > v.armor) { nd = d - v.armor * 2; ad = v.armor; }
    v.armor = Math.max(0, v.armor - ad);
    d = nd;
  }
  d = Math.max(1, Math.round(d));
  if (attacker && attacker !== v && !mates(attacker, v) && game.phase !== 'warmup') {
    const dealt = Math.min(d, Math.max(0, v.hp));
    if (attacker.rs) attacker.rs.dmg += dealt;
    if (attacker.match) attacker.match.dmg += dealt;
    record(attacker, 'damage', dealt);
  }
  v.hp -= d;
  if (v.bot) bots.hurt(v, attacker);
  send(v, { t: 'dmg', hp: Math.max(0, v.hp), armor: Math.round(v.armor), from: attacker && attacker !== v ? attacker.p : null, d });
  const killed = v.hp <= 0;
  if (attacker && attacker !== v) {
    if (hitInfo) { hitInfo.any = true; hitInfo.hs ||= part === 'head'; hitInfo.kill ||= killed; }
    else send(attacker, { t: 'hit', hs: part === 'head', kill: killed });
  }
  if (killed) killPlayer(v, attacker, weapon, part === 'head', false, from && { part, from });
  return d;
}

// ---------------------------------------------------------------- drops, pickups & bomb

function offsetPos(p, yaw, d) {
  return [p[0] - Math.sin(yaw) * d, p[1], p[2] - Math.cos(yaw) * d];
}

function placeOnGround(from, dirYaw, distance) {
  const fx = -Math.sin(dirYaw), fz = -Math.cos(dirYaw);
  const eye = [from[0], from[1] + 1, from[2]];
  const wall = world.raycast(eye, [fx, 0, fz], distance + 0.5, 'move');
  const d = wall ? Math.max(0, wall.t - 0.5) : distance;
  const x = from[0] + fx * d, z = from[2] + fz * d;
  return [x, groundY(x, from[1] + 0.5, z), z];
}

function spawnDrop(owner, item, at, thrown = false) {
  const p = thrown ? placeOnGround(owner.p, owner.yaw, 1.6) : [at[0], groundY(at[0], at[1] + 0.5, at[2]), at[2]];
  game.drops.push({ id: game.nextDropId++, w: item.id, mag: item.mag, res: item.res, p, owner: owner.id, until: now() + 1200 });
}

function dropBomb(p, at, thrown = false) {
  p.inv.c4 = false;
  const pos = thrown ? placeOnGround(p.p, p.yaw, 1.6) : [at[0], groundY(at[0], at[1] + 0.5, at[2]), at[2]];
  game.drops.push({ id: game.nextDropId++, w: 'c4', p: pos, owner: p.id, until: now() + 1200 });
  game.bomb = { state: 'dropped', carrier: null, p: pos, explodeAt: 0 };
  notify('The bomb has been dropped!', false, q => q.team === 'T');
  sendMe(p);
  sendRoster();
}

function takeDrop(p, d) {
  if (p.zombie) return false;
  if (d.w === 'c4') {
    if (p.team !== 'T') return false;
    p.inv.c4 = true;
    game.bomb = { state: 'carried', carrier: p.id, p: null, explodeAt: 0 };
    send(p, { t: 'msg', text: 'You picked up the bomb.' });
    sendRoster();
  } else {
    const slot = slotKey(d.w);
    if (!slot) return false;
    // Swap: leave our current weapon where the new one was lying.
    if (p.inv[slot]) {
      if (p.reloadUntil && p.reloadWeapon === p.inv[slot].id) p.reloadUntil = 0;
      spawnDrop(p, p.inv[slot], d.p);
    }
    p.inv[slot] = { id: d.w, mag: d.mag, res: d.res };
  }
  game.drops.splice(game.drops.indexOf(d), 1);
  send(p, { t: 'sfx', s: 'pickup', w: d.w });
  sendMe(p);
  return true;
}

function nearbyDrops(p, range) {
  return game.drops
    .filter(d => dist2(p.p, d.p) <= range && Math.abs(p.p[1] - d.p[1]) <= 1.3 && !(d.owner === p.id && now() < d.until))
    .sort((a, b) => dist2(p.p, a.p) - dist2(p.p, b.p));
}

// Walking over a weapon picks it up only when that slot is empty (like CS); E swaps.
function updatePickups() {
  for (const p of players.values()) {
    if (!p.alive) continue;
    if (p.zombie) continue;
    for (const d of nearbyDrops(p, 1.0)) {
      if (d.w === 'c4' ? p.team === 'T' : !p.inv[slotKey(d.w)]) takeDrop(p, d);
    }
  }
}

function plantBomb(p, t) {
  p.inv.c4 = false;
  p.act = null;
  game.bomb = { state: 'planted', carrier: null, p: p.p.slice(), explodeAt: t + CFG.bombTime * 1000, site: siteAt(MAP, p.p) };
  game.phaseEnd = game.bomb.explodeAt;
  game.plantedThisRound = true;
  record(p, 'plants');
  addMoney(p, 300);
  if (p.rs) p.rs.obj = 'plant';
  sendMe(p);
  notify('The bomb has been planted!', true);
  broadcast({ t: 'sfx', s: 'planted' });
  sendRoster();
}

function explodeBomb() {
  const pos = game.bomb.p;
  game.bomb.state = 'exploded';
  endRound('T', 'Target successfully bombed', 3500);
  broadcast({ t: 'boom', p: pos, k: 'c4' });
  blastMap([pos[0], pos[1] + 0.3, pos[2]], 'c4');
  for (const c of world.cars) if (dist3(c.p, pos) < 15) damageCar(c, 2000, null);
  for (const q of players.values()) {
    if (!q.alive) continue;
    const dmg = 500 * (1 - dist3(q.p, pos) / 22);
    if (dmg > 0) applyDamage(q, null, dmg, 'he', 'c4', 1, null, pos);
  }
  chainMines(pos, 15);
}

function updateActions(t) {
  for (const p of players.values()) {
    const a = p.act;
    if (!a) continue;
    if (!p.alive || (game.phase !== 'live' && !(a.type === 'mine' && game.phase === 'warmup')) || dist2(p.p, a.pos) > 0.6) { p.act = null; continue; }
    if (a.type === 'mine') {
      const mine = game.mines.find(x => x.id === a.mine);
      if (!mine) { p.act = null; continue; }
      if (t - a.start >= a.dur) {
        p.act = null;
        game.mines.splice(game.mines.indexOf(mine), 1);
        sendMines();
        addMoney(p, 100);
        sendMe(p);
        send(p, { t: 'msg', text: `${WEAPONS[mine.k].name} defused.` });
        send(p, { t: 'sfx', s: 'defused' });
      }
      continue;
    }
    if (a.type === 'plant') {
      if (!p.inv.c4 || !siteAt(MAP, p.p)) { p.act = null; continue; }
      if (t - a.start >= a.dur) plantBomb(p, t);
    } else if (a.type === 'defuse') {
      if (game.bomb.state !== 'planted') { p.act = null; continue; }
      if (t - a.start >= a.dur) {
        game.bomb.state = 'defused';
        record(p, 'defuses');
        addMoney(p, 300);
        if (p.rs) p.rs.obj = 'defuse';
        notify(`${p.name} defused the bomb!`, true);
        broadcast({ t: 'sfx', s: 'defused' });
        endRound('CT', 'Bomb has been defused', 3500);
      }
    }
  }
}

function onUse(p, m, t) {
  if (!m.on) { p.act = null; return; }
  if (!p.alive || p.act) return;
  if (p.driving != null || p.riding != null) { exitCar(p); return; }
  if (game.phase === 'live' && p.team === 'T' && p.inv.c4 && siteAt(MAP, p.p)) {
    p.act = { type: 'plant', start: t, pos: p.p.slice(), dur: CFG.plantTime * 1000 };
    return;
  }
  if (p.team === 'CT' && game.phase !== 'end') {
    const h = game.hostages
      .filter(x => (x.state === 'idle' || x.state === 'follow') && dist3(p.p, x.p) < 2.2)
      .sort((a, b) => dist3(p.p, a.p) - dist3(p.p, b.p))[0];
    if (h) {
      if (h.state === 'follow' && h.leader === p.id) {
        h.state = 'idle';
        h.leader = null;
        send(p, { t: 'msg', text: 'The hostage will wait here.' });
      } else {
        if (h.state === 'idle' && !h.used) { h.used = true; addMoney(p, 150); sendMe(p); }
        h.state = 'follow';
        h.leader = p.id;
        h.trail = [p.p.slice()];
        h.checkAt = now() + 3000;
        h.checkPos = h.p.slice();
        send(p, { t: 'msg', text: 'The hostage is following you. Lead it to the street!' });
      }
      broadcast({ t: 'sfx', s: 'hostage', p: h.p });
      return;
    }
  }
  if (game.phase === 'live' && p.team === 'CT' && game.bomb.state === 'planted' && dist3(p.p, game.bomb.p) < 1.8) {
    p.act = { type: 'defuse', start: t, pos: p.p.slice(), dur: (p.kit ? CFG.kitDefuseTime : CFG.defuseTime) * 1000 };
    broadcast({ t: 'sfx', s: 'defusing' }, q => q.team === 'CT');
    return;
  }
  const mine = game.mines.filter(x => !mineFriend(x, p) && dist3(p.p, x.p) < 1.4).sort((x, y) => dist3(p.p, x.p) - dist3(p.p, y.p))[0];
  if (mine) {
    p.act = { type: 'mine', mine: mine.id, start: t, pos: p.p.slice(), dur: (p.kit ? MINE.kitDefuse : MINE.defuse) * 1000 };
    return;
  }
  const sw = nearestSwitch(p), door = nearestDoor(p);
  if (door && (!sw || door.dist < dist2(p.p, sw.p))) { useDoor(p, door.i); return; }
  if (sw) {
    game.lights[sw.group] = !game.lights[sw.group];
    broadcast({ t: 'lights', lights: game.lights, p: sw.p });
    return;
  }
  const car = world.cars
    .filter(c => !c.wrecked && (c.driver == null || c.riders.includes(null)) && dist2(p.p, c.p) < CAR.enterRange && Math.abs(p.p[1] - c.p[1]) < 1.5)
    .sort((a, b) => dist2(p.p, a.p) - dist2(p.p, b.p))[0];
  if (car && game.phase !== 'freeze') { enterCar(p, car); return; }
  const d = nearbyDrops(p, 1.8).find(x => x.w !== 'c4' || p.team === 'T');
  if (d) takeDrop(p, d);
}

// ---------------------------------------------------------------- weapons

function rewind(q, rt) {
  const h = q.history, t = now();
  if (!isNum(rt) || h.length < 2) return { p: q.p, c: q.c };
  rt = Math.max(t - 400, Math.min(t, rt));
  if (rt <= h[0].t) return { p: h[0].p, c: h[0].c };
  for (let i = h.length - 1; i > 0; i--) {
    const a = h[i - 1], b = h[i];
    if (a.t <= rt && rt <= b.t) {
      const f = (rt - a.t) / (b.t - a.t || 1);
      return { p: [0, 1, 2].map(k => a.p[k] + (b.p[k] - a.p[k]) * f), c: f < 0.5 ? a.c : b.c };
    }
  }
  return { p: q.p, c: q.c };
}

function onShoot(p, m) {
  const t = now();
  if (!p.alive || game.phase === 'freeze') return;
  p.protectUntil = 0;
  const w = m.w, def = WEAPONS[w];
  if (!def || def.grenade || def.mortar || w === 'c4') return; // (the mortar fires with a 'mortar' message)
  // Zombies only have claws, and only zombies have claws.
  if (!!p.zombie !== (w === 'claws')) return;
  let o = vec3(m.o);
  if (!o) return;
  if (dist3(o, eyeOf(p)) > 2.5) o = eyeOf(p);
  const rawDirs = def.pellets ? (Array.isArray(m.ds) ? m.ds.slice(0, def.pellets) : []) : [m.d];
  const dirs = rawDirs.map(vec3).filter(Boolean).map(norm).filter(Boolean);
  if (!dirs.length) return;

  let item = null;
  if (def.mounted) {
    // the truck's machine gun: only its gunner, and it never runs out
    const truck = carOf(p);
    if (!truck || truck.type !== 'pickup' || truck.riders[0] !== p.id || truck.wrecked) return;
  } else if (!def.melee) {
    item = ownItem(p, w);
    if (!item || item.mag <= 0) return;
    if (p.reloadUntil && p.reloadWeapon === w) return;
  }
  const alt = !!(def.melee && m.alt);
  const rate = alt ? def.altRate : def.rate;
  if (t - p.lastShot < rate * 1000 * 0.75) return;
  // Hide and Seek: the seekers wait (blind) while the hiders hide.
  if (isHNS() && p.team === 'CT' && game.phase === 'live' && t < (game.hideUntil || 0)) return;
  p.lastShot = t;
  if (!def.melee) bots.heard(p, o);
  if (item) item.mag--;
  if (def.rocket) { launchRocket(p, o, dirs[0], def); return; }

  const range = def.melee ? def.range : 250;
  const traces = [];
  const hits = [];
  const ownCar = carOf(p)?.id ?? null;
  const shattered = [], chipped = [];
  for (const d of dirs) {
    const wall = world.raycast(o, d, range, 'bullet', ownCar);
    const wallT = wall ? wall.t : range;
    let best = null;
    for (const q of players.values()) {
      if (q === p || !q.alive || !inTeam(q)) continue;
      if (!CFG.friendlyFire && mates(q, p)) continue;
      const st = rewind(q, m.rt);
      const hit = rayPlayer(o, d, st.p, st.c, wallT, headScale());
      if (hit && (!best || hit.t < best.t)) best = { q, ...hit };
    }
    for (const h of game.hostages) {
      if (h.state === 'dead' || h.state === 'rescued') continue;
      const hit = rayPlayer(o, d, h.p, false, best ? best.t : wallT);
      if (hit && (!best || hit.t < best.t)) best = { hostage: h, ...hit };
    }
    const r3 = v => Math.round(v * 1000) / 1000;
    traces.push([r3(d[0]), r3(d[1]), r3(d[2]), r2(best ? best.t : wallT), best ? 1 : 0, !best && wall ? 1 : 0]);
    if (best) hits.push({ ...best, d });
    else if (wall && wall.box.car != null && !def.melee) damageCar(world.cars[wall.box.car], def.damage * Math.pow(def.rangeMod, wall.t / 12.7), p);
    else if (wall && wall.box.brk != null && BREAK.chip[w]) hurtPiece(MAP.breakables[wall.box.brk], def.damage * BREAK.chip[w], chipped);
    const endT = best ? best.t : wallT;
    for (const g of world.intactGlass) {
      const gh = rayAABB(o, d, g.min, g.max, endT);
      if (gh) shattered.push(g.id);
    }
  }
  breakGlass(shattered);
  breakPieces(chipped);

  broadcast({ t: 'shot', id: p.id, o, w, alt, tr: traces }, q => q !== p);
  if (!hits.length) return;
  const info = {};
  for (const h of hits) {
    if (h.hostage) {
      const dmg = def.melee ? (alt ? def.altDamage : def.damage) : def.damage * Math.pow(def.rangeMod, h.t / 12.7);
      hurtHostage(h.hostage, p, dmg * ({ head: 4, stomach: 1.25, legs: 0.75 }[h.part] ?? 1), w);
      info.any = true;
      continue;
    }
    if (w === 'claws' && h.q.team === 'CT') clawHit(h.q, p, alt ? def.altDamage : def.damage);
    else if (def.melee) applyDamage(h.q, p, alt ? def.altDamage : def.damage, 'chest', w, def.pen, info);
    else if (CFG.party.headshotsOnly && h.part !== 'head') continue;
    else {
      const dealt = applyDamage(h.q, p, def.damage * Math.pow(def.rangeMod, h.t / 12.7), h.part, w, def.pen, info, eyeOf(p));
      // Bullets push zombies back.
      if (h.q.zombie && dealt) {
        const k = Math.min(7, dealt / 9);
        send(h.q, { t: 'knock', v: [h.d[0] * k, Math.min(2, k * 0.25), h.d[2] * k] });
      }
    }
  }
  if (info.any) send(p, { t: 'hit', hs: !!info.hs, kill: !!info.kill });
}

// ---- RPG: the rocket flies to the first wall, car or person in its path and explodes there. The blast
// only hurts people who can see the explosion: a wall in between protects them.
function launchRocket(p, o, d, def) {
  const ownCar = carOf(p)?.id ?? null;
  const wall = world.raycast(o, d, 300, 'bullet', ownCar);
  let dist = wall ? wall.t : 300;
  for (const q of players.values()) {
    if (q === p || !q.alive || !inTeam(q)) continue;
    const h = rayPlayer(o, d, q.p, q.c, dist);
    if (h) dist = h.t;
  }
  for (const h of game.hostages) {
    if (h.state === 'dead' || h.state === 'rescued') continue;
    const hit = rayPlayer(o, d, h.p, false, dist);
    if (hit) dist = hit.t;
  }
  const back = Math.max(0, dist - 0.3); // explode just in front of the surface
  const at = [o[0] + d[0] * back, o[1] + d[1] * back, o[2] + d[2] * back];
  const flight = (dist / def.rocketSpeed) * 1000;
  const round = game.round;
  broadcast({ t: 'rocket', id: game.nextNadeId++, o, d, dist: r2(dist), speed: def.rocketSpeed, owner: p.id });
  for (const g of world.intactGlass) {
    const gh = rayAABB(o, d, g.min, g.max, dist);
    if (gh) setTimeout(() => breakGlass([g.id]), (gh.t / def.rocketSpeed) * 1000);
  }
  setTimeout(() => { if (game.round === round) explodeRocket(at, p, def); }, flight);
}

// (Also the mortar's shell landing: weapon 'mortar'.)
function explodeRocket(at, owner, def, weapon = 'rpg') {
  const R = def.blast;
  const killsBefore = owner.kills;
  if (weapon === 'rpg') setTimeout(() => { if (owner.kills - killsBefore >= 2) unlockAch(owner, 'rpg_double'); }, 0);
  broadcast({ t: 'boom', p: at, k: weapon });
  blastMap(at, weapon);
  breakGlass(world.intactGlass.filter(g => dist3(at, [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2, (g.min[2] + g.max[2]) / 2]) < R * 0.7).map(g => g.id));
  for (const q of players.values()) {
    if (!q.alive) continue;
    if (q !== owner && mates(q, owner) && !CFG.friendlyFire) continue;
    const chest = [q.p[0], q.p[1] + 1.1, q.p[2]];
    const d = dist3(at, chest);
    if (d > R || !lineOfSight(at, chest)) continue;
    applyDamage(q, owner, def.damage * (1 - d / R), 'he', weapon, def.pen, null, at);
  }
  for (const h of game.hostages) {
    if (h.state === 'dead' || h.state === 'rescued') continue;
    const chest = [h.p[0], h.p[1] + 1.1, h.p[2]];
    const d = dist3(at, chest);
    if (d < R && lineOfSight(at, chest)) hurtHostage(h, owner, def.damage * (1 - d / R), weapon);
  }
  for (const c of world.cars) {
    const d = dist3(at, [c.p[0], c.p[1] + 0.7, c.p[2]]);
    if (d < R) damageCar(c, 900 * (1 - d / R), owner);
  }
  chainMines(at, MINE.chain);
}

// ---- 82-BM-37 mortar, aimed like a real one: the gunner sets a bearing (b) and an elevation (e), both in mils; the
// firing table (mortarRange) turns the elevation into a distance. The shell flies a high arc and lands there a few
// seconds later, a little off (1 m plus 3% of the distance). It needs open sky over the mortar, and a roof over the
// target catches the shell (so it can't reach indoors; see shared/maps/sky.js).
function onMortar(p, m) {
  const t = now(), def = WEAPONS.mortar;
  if (!p.alive || game.phase === 'freeze' || p.w !== 'mortar') return;
  const item = ownItem(p, 'mortar');
  if (!item || item.mag <= 0 || t - p.lastShot < def.rate * 1000 * 0.9) return;
  if (!isNum(m.b) || !isNum(m.e) || m.e < def.elev[0] - 1 || m.e > def.elev[1] + 1) return;
  const o = [p.p[0], p.p[1] + 0.9, p.p[2]];
  const sky = skyOf(MAP, world);
  if (!sky.open(p.p)) return;
  p.lastShot = t;
  p.protectUntil = 0;
  item.mag--;
  sendMe(p);
  bots.heard(p, o);
  const dist = mortarRange(m.e), bearing = (m.b / MILS) * Math.PI * 2;
  const a = Math.random() * Math.PI * 2, off = (1 + dist * 0.03) * Math.sqrt(Math.random());
  const x = p.p[0] + Math.sin(bearing) * dist + Math.cos(a) * off, z = p.p[2] - Math.cos(bearing) * dist + Math.sin(a) * off;
  const at = [x, sky.ground(x, z, p.p[1]) + 0.1, z];
  const flight = shellFlight(dist);
  const fallback = p.p[1];
  broadcast({ t: 'shell', o: o.map(r2), at: at.map(r2), flight, owner: p.id });
  const round = game.round;
  setTimeout(() => {
    if (game.round !== round) return;
    at[1] = sky.ground(x, z, fallback) + 0.1; // (a roof broken meanwhile lets it through)
    explodeRocket(at, p, def, 'mortar');
    // Where it landed, for the gunner's team: exact if one of them saw it go off, rough if nobody did.
    const team = [...players.values()].filter(q => q === p || mates(q, p));
    const seen = team.find(q => q.alive && dist3(eyeOf(q), at) < 150 && lineOfSight(eyeOf(q), [at[0], at[1] + 0.6, at[2]]));
    for (const q of team) send(q, { t: 'impact', p: at.map(r2), by: p.id, seen: seen ? seen.name : null });
  }, flight);
}

// A forward observer calls in a target for the team's mortar: the spot they're looking at (it must be in sight).
function onSpot(p, m) {
  const t = now(), pos = vec3(m.p);
  if (!p.alive || !pos || !inTeam(p) || t - (p.spotAt || 0) < 2000) return;
  const eye = eyeOf(p);
  if (dist3(eye, pos) > 250 || !lineOfSight(eye, [pos[0], pos[1] + 0.3, pos[2]])) return;
  const team = [...players.values()].filter(q => q === p || mates(q, p));
  if (!team.some(q => q.inv.primary?.id === 'mortar')) return send(p, { t: 'msg', text: 'Nobody on your team has a mortar.' });
  p.spotAt = t;
  for (const q of team) send(q, { t: 'spot', p: pos.map(r2), by: p.id, name: p.name });
}

// ---- Anti-personnel mines (see MINE in shared/weapons.js). A mine belongs to its owner's team (in Deathmatch only
// to its owner): those never set it off and always see it; enemies see it only up close (the clients do that).
const mineFriend = (mine, q) => (isDM() ? q.id === mine.owner : q.team === mine.team);

function sendMines(to = null) {
  const list = game.mines.map(m => [m.id, m.k, m.team === 'T' ? 1 : 2, ...m.p.map(r2), r2(m.yaw), m.owner, m.armAt <= now() ? 1 : 0]);
  if (to) send(to, { t: 'mines', list });
  else broadcast({ t: 'mines', list });
}

function clearMines() {
  if (!game.mines?.length) return;
  game.mines = [];
  sendMines();
}

// Laying a mine: on the floor within reach in front of you, not on top of another one.
function onMine(p, m) {
  const t = now(), k = MINES.includes(m.k) ? m.k : null, pos = vec3(m.p);
  if (!k || !pos || !isNum(m.yaw) || !p.alive || p.inv[k] <= 0 || game.phase === 'freeze' || game.phase === 'end') return;
  if (Math.hypot(pos[0] - p.p[0], pos[2] - p.p[2]) > 2.5 || Math.abs(pos[1] - p.p[1]) > 1.5) return;
  const floor = world.raycast([pos[0], pos[1] + 0.4, pos[2]], [0, -1, 0], 1, 'solid');
  if (!floor || floor.t < 0.01) return send(p, { t: 'msg', text: 'Lay the mine on the ground.' }); // (t = 0: inside something)
  pos[1] = pos[1] + 0.4 - floor.t;
  if (game.mines.some(x => dist3(x.p, pos) < 0.8)) return send(p, { t: 'msg', text: 'There is a mine there already.' });
  p.inv[k]--;
  p.protectUntil = 0;
  const own = game.mines.filter(x => x.owner === p.id);
  if (own.length >= MINE.perPlayer) game.mines.splice(game.mines.indexOf(own[0]), 1);
  game.mines.push({ id: game.nextMineId++, k, team: p.team, owner: p.id, p: pos, yaw: m.yaw, armAt: t + MINE.arm * 1000 });
  setTimeout(sendMines, MINE.arm * 1000 + 50);
  sendMe(p);
  sendMines();
}

// Each tick: an enemy stepping on a PMN, or walking into a MON-50's tripwire, sets it off.
function updateMines(t) {
  for (const mine of [...game.mines]) {
    if (mine.armAt > t || !game.mines.includes(mine)) continue;
    for (const q of players.values()) {
      if (!q.alive || !inTeam(q) || mineFriend(mine, q)) continue;
      const dy = q.p[1] - mine.p[1];
      if (mine.k === 'pmn') {
        if (dy > -0.3 && dy < 0.5 && Math.hypot(q.p[0] - mine.p[0], q.p[2] - mine.p[2]) < MINE.pmn.trigger) { detonateMine(mine, q); break; }
      } else {
        const W = MINE.mon50, fx = -Math.sin(mine.yaw), fz = -Math.cos(mine.yaw);
        const cx = mine.p[0] + fx * W.wire, cz = mine.p[2] + fz * W.wire;
        // distance from the feet to the wire (a segment across the mine's front)
        const s = Math.max(-W.wireHalf, Math.min(W.wireHalf, (q.p[0] - cx) * -fz + (q.p[2] - cz) * fx));
        const wx = cx - fz * s, wz = cz + fx * s;
        if (dy > -0.4 && dy < 0.6 && Math.hypot(q.p[0] - wx, q.p[2] - wz) < 0.35) { detonateMine(mine, q); break; }
      }
    }
  }
}

function detonateMine(mine, stepper = null) {
  const i = game.mines.indexOf(mine);
  if (i < 0) return;
  game.mines.splice(i, 1);
  sendMines();
  const owner = players.get(mine.owner) || null;
  const at = [mine.p[0], mine.p[1] + 0.15, mine.p[2]];
  const fwd = [-Math.sin(mine.yaw), 0, -Math.cos(mine.yaw)];
  broadcast({ t: 'boom', p: at.map(r2), k: mine.k, d: [r2(fwd[0]), r2(fwd[2])] });
  blastMap(at, mine.k);
  const hurts = q => q.alive && inTeam(q) && (!mineFriend(mine, q) || (CFG.friendlyFire && q.id !== mine.owner));
  if (mine.k === 'pmn') {
    const P = MINE.pmn;
    if (stepper) applyDamage(stepper, owner, P.damage, 'legs', 'pmn', 1, null, [mine.p[0], mine.p[1] - 0.5, mine.p[2]]);
    for (const q of players.values()) {
      if (q === stepper || !hurts(q)) continue;
      const chest = [q.p[0], q.p[1] + 1.1, q.p[2]], d = dist3(at, chest);
      if (d < P.splash && lineOfSight(at, chest)) applyDamage(q, owner, P.splashDamage * (1 - d / P.splash), 'he', 'pmn', 1, null, at);
    }
  } else {
    // a fan of fragments forward, and a small blast behind
    const W = MINE.mon50, o = [mine.p[0], mine.p[1] + 0.3, mine.p[2]];
    for (const q of players.values()) {
      if (!hurts(q)) continue;
      const chest = [q.p[0], q.p[1] + 1.0, q.p[2]], d = dist3(o, chest);
      const h = Math.hypot(chest[0] - o[0], chest[2] - o[2]) || 1;
      const ahead = ((chest[0] - o[0]) * fwd[0] + (chest[2] - o[2]) * fwd[2]) / h;
      let dmg = 0;
      if (ahead > Math.cos(W.cone) && d < W.range) dmg = W.damage * (1 - d / W.range);
      else if (d < W.back) dmg = W.backDamage * (1 - d / W.back);
      if (dmg > 0 && lineOfSight(o, chest)) applyDamage(q, owner, dmg, 'he', 'mon50', 1, null, o);
    }
    breakGlass(world.intactGlass.filter(g => {
      const c = [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2, (g.min[2] + g.max[2]) / 2], d = dist3(o, c);
      return d < W.range * 0.6 && ((c[0] - o[0]) * fwd[0] + (c[2] - o[2]) * fwd[2]) / (d || 1) > Math.cos(W.cone);
    }).map(g => g.id));
  }
  chainMines(at, MINE.chain);
}

// Mines near an explosion go off too (a moment later, one after another).
function chainMines(at, r) {
  for (const mine of game.mines.filter(x => dist3(x.p, at) < r)) setTimeout(() => detonateMine(mine), 120 + Math.random() * 200);
}

// Ghillie camouflage: switched on (H), you're hidden from enemies, except for a moment after each shot (see CAMO).
function updateCamo(t) {
  for (const p of players.values()) p.hidden = !!(p.camo && p.camoOn && p.alive && t - (p.lastShot || 0) >= CAMO.still * 1000);
}

// A ping: the spot a player is looking at, marked with a "!" on their team's radar (in Deathmatch only on their own).
function onPing(p, m) {
  const t = now(), pos = vec3(m.p);
  if (!p.alive || !pos || t - (p.pingAt || 0) < PING.cooldown * 1000 || dist3(eyeOf(p), pos) > PING.range + 5) return;
  p.pingAt = t;
  const to = isDM() || !inTeam(p) ? [p] : [...players.values()].filter(q => q === p || mates(q, p));
  for (const q of to) send(q, { t: 'mark', p: pos.map(r2), by: p.id, name: p.name });
}

function onNade(p, m) {
  const k = GRENADES.includes(m.k) ? m.k : 'he';
  if (!p.alive || p.inv[k] <= 0 || game.phase === 'freeze') return;
  const o = vec3(m.o), v = vec3(m.v);
  if (!o || !v || Math.hypot(...v) > 30 || dist3(o, eyeOf(p)) > 2.5) return;
  p.inv[k]--;
  p.protectUntil = 0;
  // Gun Game HE level: a fresh grenade shortly after each throw.
  if (isGG() && GUNGAME[p.level] === 'he' && k === 'he') {
    setTimeout(() => { if (p.alive && isGG() && GUNGAME[p.level] === 'he' && !p.inv.he) { p.inv.he = 1; sendMe(p); } }, 1500);
  }
  const id = game.nextNadeId++;
  const fuse = WEAPONS[k].fuse;
  const path = [];
  const end = simulateNade(world.nade(), o, v, fuse, path, !!WEAPONS[k].impact);
  const flight = WEAPONS[k].impact ? path.length * NADE.dt : fuse;
  // Windows in the grenade's flight path shatter when it reaches them.
  const panes = new Map();
  for (let i = 0, prev = o; i < path.length; prev = path[i], i++) {
    const seg = [path[i][0] - prev[0], path[i][1] - prev[1], path[i][2] - prev[2]];
    const len = Math.hypot(...seg);
    if (len < 1e-6) continue;
    for (const g of world.intactGlass) {
      if (!panes.has(g.id) && rayAABB(prev, seg.map(c => c / len), g.min, g.max, len)) panes.set(g.id, i);
    }
  }
  for (const [gid, i] of panes) setTimeout(() => breakGlass([gid]), (i + 1) * NADE.dt * 1000);
  game.nades.push({ id, k, owner: p.id, at: now() + flight * 1000, end });
  broadcast({ t: 'nade', id, k, o, v, owner: p.id });
  sendMe(p);
}

function lineOfSight(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  if (len < 0.01) return true;
  const hit = world.raycast(a, d.map(v => v / len), len);
  return !hit || hit.t >= len - 0.2;
}

function explodeNade(n) {
  const owner = players.get(n.owner) || null;
  const o = [n.end[0], n.end[1] + 0.1, n.end[2]];
  broadcast({ t: 'boom', p: n.end, k: n.k, id: n.id });
  if (n.k === 'smoke') {
    (game.smokes ||= []).push({ p: o, until: now() + 17000 }); // bots can't see through it
    // Smoke puts out Molotov fires it lands in.
    for (const f of game.fires) {
      if (Math.hypot(f.p[0] - o[0], f.p[2] - o[2]) < FIRE.radius + 1.5 && Math.abs(f.p[1] - o[1]) < 2.5) f.until = 0;
    }
    return;
  }
  if (n.k === 'molotov') { igniteMolotov(n, owner, o); return; }
  if (n.k === 'he') {
    blastMap(o, 'he');
    breakGlass(world.intactGlass.filter(g => dist3(o, [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2, (g.min[2] + g.max[2]) / 2]) < 5).map(g => g.id));
  }

  for (const q of players.values()) {
    if (!q.alive) continue;
    if (n.k === 'flash') {
      const eye = eyeOf(q);
      const d = dist3(o, eye);
      if (d > 30 || !lineOfSight(o, eye)) continue;
      const cp = Math.cos(q.pitch);
      const look = [-Math.sin(q.yaw) * cp, Math.sin(q.pitch), -Math.cos(q.yaw) * cp];
      const to = [(o[0] - eye[0]) / d, (o[1] - eye[1]) / d, (o[2] - eye[2]) / d];
      const dot = look[0] * to[0] + look[1] * to[1] + look[2] * to[2];
      const facing = dot > 0.5 ? 1 : dot > -0.2 ? 0.6 : 0.25;
      const amount = Math.min(1, facing * (1 - d / 30) * 1.4);
      if (amount > 0.05) send(q, { t: 'flashed', a: amount, dur: 0.6 + 4.2 * amount });
      if (q.bot && amount > 0.05) bots.flashed(q, amount, 0.6 + 4.2 * amount);
      continue;
    }
    if (owner && q !== owner && mates(q, owner) && !CFG.friendlyFire) continue;
    const chest = [q.p[0], q.p[1] + 1.1, q.p[2]];
    const d = dist3(o, chest);
    if (d > 9 || !lineOfSight(o, chest)) continue;
    applyDamage(q, owner, 100 * (1 - d / 9), 'he', 'he', WEAPONS.he.pen, null, o);
  }
  if (n.k === 'he') chainMines(o, MINE.chain);
  if (n.k === 'he') {
    for (const c of world.cars) {
      const d = dist3(o, [c.p[0], c.p[1] + 0.7, c.p[2]]);
      if (d < 8) damageCar(c, 260 * (1 - d / 8), owner);
    }
    for (const h of game.hostages) {
      if (h.state === 'dead' || h.state === 'rescued') continue;
      const chest = [h.p[0], h.p[1] + 1.1, h.p[2]];
      const d = dist3(o, chest);
      if (d < 9 && lineOfSight(o, chest)) hurtHostage(h, owner, 100 * (1 - d / 9), 'he');
    }
  }
}

// ---- Molotov fire: a burning patch on the floor where the bottle broke

// Is q (a player or hostage position) standing in this fire? Walls stop the flames.
function inFire(f, pos) {
  if (Math.hypot(pos[0] - f.p[0], pos[2] - f.p[2]) > FIRE.radius) return false;
  if (pos[1] < f.p[1] - 1 || pos[1] > f.p[1] + 1.4) return false;
  return lineOfSight([f.p[0], f.p[1] + 0.35, f.p[2]], [pos[0], f.p[1] + 0.35, pos[2]]);
}

function igniteMolotov(n, owner, o) {
  const t = now();
  const fire = { id: n.id, p: [n.end[0], groundY(n.end[0], n.end[1] - 0.95, n.end[2]), n.end[2]], owner: n.owner, until: t + FIRE.life * 1000, nextTick: t + FIRE.tick * 1000, round: game.round };
  game.fires.push(fire);
  broadcast({ t: 'fire', id: fire.id, p: fire.p, life: FIRE.life, r: FIRE.radius });
  breakGlass(world.intactGlass.filter(g => dist3(o, [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2, (g.min[2] + g.max[2]) / 2]) < 2.5).map(g => g.id));
  // The burst when the bottle breaks: a bit weaker than an HE grenade, only inside the fire.
  for (const q of players.values()) {
    if (!q.alive || !inFire(fire, q.p)) continue;
    if (owner && q !== owner && mates(q, owner) && !CFG.friendlyFire) continue;
    const d = Math.hypot(q.p[0] - o[0], q.p[2] - o[2]);
    q.burnUntil = t + FIRE.afterburn * 1000;
    q.burnBy = owner?.id ?? null;
    q.burnFire = fire.id;
    applyDamage(q, owner, FIRE.impact * Math.max(0.05, 1 - d / FIRE.radius), 'chest', 'molotov', 1);
  }
}

function updateFires(t) {
  for (let i = game.fires.length - 1; i >= 0; i--) {
    const f = game.fires[i];
    if (t >= f.until) {
      game.fires.splice(i, 1);
      broadcast({ t: 'fireOut', id: f.id });
      continue;
    }
    if (t < f.nextTick) continue;
    f.nextTick += FIRE.tick * 1000;
    const owner = players.get(f.owner) || null;
    for (const q of players.values()) {
      if (!q.alive || !inFire(f, q.p)) continue;
      if (owner && q !== owner && mates(q, owner) && !CFG.friendlyFire) continue;
      q.burnUntil = t + FIRE.afterburn * 1000;
      q.burnBy = f.owner;
      q.burnFire = f.id;
    }
    for (const h of game.hostages) {
      if (h.state !== 'dead' && h.state !== 'rescued' && inFire(f, h.p)) hurtHostage(h, owner, FIRE.dps * FIRE.tick, 'molotov');
    }
    for (const c of world.cars) {
      if (!c.wrecked && Math.hypot(c.p[0] - f.p[0], c.p[2] - f.p[2]) < FIRE.radius + 0.8 && Math.abs(c.p[1] - f.p[1]) < 1.5) {
        damageCar(c, 15 * FIRE.tick, owner);
      }
    }
  }
  // Everyone caught by the flames burns, and keeps burning for a moment after stepping out.
  for (const q of players.values()) {
    if (!q.burnUntil) continue;
    if (!q.alive || t > q.burnUntil) { q.burnUntil = 0; continue; }
    if (t < (q.nextBurn || 0)) continue;
    q.nextBurn = t + FIRE.tick * 1000;
    const by = players.get(q.burnBy) || null;
    applyDamage(q, by, FIRE.dps * FIRE.tick, 'chest', 'molotov', 1);
  }
}

function hurtHostage(h, attacker, dmg, weapon) {
  if (h.state === 'dead' || h.state === 'rescued') return;
  h.hp -= Math.max(1, Math.round(dmg));
  broadcast({ t: 'sfx', s: 'hurt', p: [h.p[0], h.p[1] + 1.2, h.p[2]] });
  if (h.hp > 0) return;
  h.state = 'dead';
  h.doneAt = now();
  h.leader = null;
  if (attacker) {
    addMoney(attacker, -1500);
    sendMe(attacker);
  }
  broadcast({ t: 'hostageKilled', k: attacker ? attacker.id : null, w: weapon });
  notify(`${attacker ? attacker.name : 'Someone'} killed a hostage! (-$1500)`);
  checkRoundEnd();
}

function rescueHostage(h) {
  const p = players.get(h.leader);
  h.state = 'rescued';
  h.doneAt = now();
  h.leader = null;
  if (p) {
    addMoney(p, 1000);
    if (p.rs) p.rs.rescues++;
    if (p.match) p.match.rescues++;
    record(p, 'rescues');
    sendMe(p);
  }
  for (const q of players.values()) if (q.team === 'CT' && q !== p) { addMoney(q, 150); sendMe(q); }
  broadcast({ t: 'sfx', s: 'rescue', p: h.p });
  notify(`${p ? p.name : 'A CT'} rescued a hostage!`, true);
  checkRoundEnd();
}

function canBuy(p, t) {
  if (!p.alive) return 'You must be alive to buy.';
  if (game.phase === 'warmup') return null;
  if (isGG()) return 'There is no buying in Gun Game — kill to get the next weapon.';
  if (isHNS()) return 'There is no buying in Hide and Seek.';
  if (isDM()) return null; // free guns, anywhere, any time
  if (partyWeapon()) return `Party mode: ${WEAPONS[partyWeapon()].name} only — no buying.`;
  if (isZM()) {
    if (p.zombie) return 'Zombies can\'t buy anything.';
    if (t - game.roundStartAt > (CFG.freezeTime + ZOMBIE.countdown + CFG.buyTime) * 1000) return 'Buy time is over.';
    return null; // humans buy anywhere
  }
  if (game.phase !== 'freeze' && game.phase !== 'live') return 'You cannot buy right now.';
  if (t - game.roundStartAt > (CFG.freezeTime + CFG.buyTime) * 1000) return `${CFG.buyTime} seconds have passed. You can't buy anything now!`;
  if (!inBuyZone(MAP, p.team, p.p)) return 'You are not in a buy zone.';
  return null;
}

function onBuy(p, id) {
  const t = now();
  const fail = text => send(p, { t: 'msg', text });
  const block = canBuy(p, t);
  if (block) return fail(block);

  if (id === 'ammo1' || id === 'ammo2') {
    const item = id === 'ammo1' ? p.inv.primary : p.inv.secondary;
    const cost = ammoCost(item);
    if (!cost) return fail(item ? 'Your ammo is already full.' : 'You have no weapon for that.');
    if (isDM()) cost.price = 0;
    if (p.money < cost.price) return fail('You have insufficient funds!');
    p.money -= cost.price;
    item.res += cost.rounds;
    send(p, { t: 'sfx', s: 'ammo' });
    sendMe(p);
    return;
  }

  const wdef = WEAPONS[id], idef = ITEMS[id];
  const def = wdef || idef;
  if (!def || def.price == null) return;
  if (def.team && def.team !== p.team) return fail('Your team cannot buy that.');
  if ((MINES.includes(id) || id === 'camo') && isZM()) return fail('Not in Zombie mode.');
  if (id === 'mortar') {
    // One mortar per team (in Deathmatch, one on the whole map); not against zombies.
    if (isZM()) return fail('There are no mortars in Zombie mode.');
    const holder = [...players.values()].find(q => q !== p && (isDM() || q.team === p.team) && q.inv.primary?.id === 'mortar');
    if (holder) return fail(isDM() ? `${holder.name} already has the mortar.` : `Your team already has a mortar (${holder.name}).`);
  }
  let price = def.price;

  if (wdef && (wdef.grenade || wdef.mine)) {
    if (p.inv[id] >= wdef.max) return fail('You cannot carry any more.');
  } else if (wdef) {
    if (p.inv[slotKey(id)]?.id === id) return fail('You already have that weapon.');
  } else if (id === 'vest') {
    if (p.armor >= 100) return fail('You already have kevlar.');
  } else if (id === 'vesthelm') {
    if (p.armor >= 100 && p.helmet) return fail('You already have kevlar and a helmet.');
    if (p.armor >= 100) price = 350;
  } else if (id === 'kit') {
    if (mapMode(MAP) !== 'bomb' || CFG.gameMode !== 'classic') return fail('There is no bomb to defuse.');
    if (p.kit) return fail('You already have a defuse kit.');
  } else if (id === 'nvg') {
    if (p.nvg) return fail('You already have nightvision.');
  } else if (id === 'camo') {
    if (p.camo) return fail('You already have camouflage.');
  }
  if (isDM()) price = 0;
  if (p.money < price) return fail('You have insufficient funds!');

  p.money -= price;
  if (wdef && (wdef.grenade || wdef.mine)) p.inv[id]++;
  else if (wdef) {
    const slot = slotKey(id);
    if (p.inv[slot]) {
      if (p.reloadUntil && p.reloadWeapon === p.inv[slot].id) p.reloadUntil = 0;
      if (!isDM()) spawnDrop(p, p.inv[slot], p.p, true);
    }
    p.inv[slot] = makeItem(id);
    // Deathmatch: you respawn with the guns you picked last.
    if (isDM()) p[slot === 'primary' ? 'dmPrimary' : 'dmSecondary'] = id;
  } else if (id === 'vest') p.armor = 100;
  else if (id === 'vesthelm') { p.armor = 100; p.helmet = true; }
  else if (id === 'kit') p.kit = true;
  else if (id === 'nvg') p.nvg = true;
  else if (id === 'camo') p.camo = true;
  send(p, { t: 'sfx', s: 'buy' });
  sendMe(p);
}

function onDrop(p, w) {
  if (!p.alive || (isGG() && game.phase !== 'warmup')) return;
  if (w === 'c4' && p.inv.c4) { p.act = null; dropBomb(p, p.p, true); return; }
  const slot = slotKey(w);
  if (!slot || p.inv[slot]?.id !== w) return;
  if (p.reloadUntil && p.reloadWeapon === w) p.reloadUntil = 0;
  spawnDrop(p, p.inv[slot], p.p, true);
  p.inv[slot] = null;
  sendMe(p);
}

function onSpray(p, m, t) {
  if (!p.alive || !p.sprayImg || t - p.lastSpray < CFG.sprayCooldown) return;
  const d = norm(vec3(m.d) || [0, 0, 0]);
  if (!d) return;
  const o = eyeOf(p);
  const hit = world.raycast(o, d, 4, 'solid');
  if (!hit) return;
  p.lastSpray = t;
  const pos = o.map((v, i) => r2(v + d[i] * hit.t));
  const s = { id: p.id, p: pos, n: hit.n, yaw: r2(p.yaw) };
  game.sprays.set(p.id, s);
  broadcast({ t: 'spray', ...s });
}

// ---------------------------------------------------------------- admin panel (/admin)

// Password: ADMIN_PASSWORD, or one generated on first start and kept in data/admin.json.
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
let ADMIN_PASSWORD = env.ADMIN_PASSWORD || '';
if (!ADMIN_PASSWORD) {
  try { ADMIN_PASSWORD = String(JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8')).password || ''); } catch { /* not created yet */ }
  if (!ADMIN_PASSWORD) {
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    ADMIN_PASSWORD = [...crypto.randomBytes(8)].map(b => abc[b % abc.length]).join('');
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(ADMIN_FILE, JSON.stringify({ password: ADMIN_PASSWORD }, null, 1));
    } catch { /* read-only folder: the password is printed below and lasts this session */ }
  }
}
const adminFails = new Map(); // ip -> { n, until }

function passwordOk(given) {
  const a = Buffer.from(String(given || '')), b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const SETTING_LABELS = {
  gameMode: 'Game mode', startMoney: 'Start money', roundsToWin: 'Rounds to win', roundTime: 'Round time', freezeTime: 'Freeze time',
  buyTime: 'Buy time', bombTime: 'C4 timer', friendlyFire: 'Friendly fire', autoBalance: 'Auto team balance', halftime: 'Halftime side switch',
  rotateMaps: 'Map rotation', party: 'Party modes', bots: 'Bots', dmFrags: 'Deathmatch kill limit', dmMinutes: 'Deathmatch time limit',
};

function adminState() {
  return {
    map: MAP.id, maps: MAP_IDS.map(id => ({ id, title: MAPS[id].title })), phase: game.phase, round: game.round, score: game.score,
    settings: settingsView(), startMoneyChoices: START_MONEY_CHOICES,
    players: [...players.values()].filter(p => p.joined).map(p => ({
      id: p.id, name: p.name, team: p.team, alive: p.alive, k: p.kills, d: p.deaths, ping: p.ping, level: isGG() ? (p.level || 0) + 1 : null, bot: !!p.bot,
    })),
  };
}

function restartMatch() {
  for (const p of players.values()) p.level = 0;
  if (teamCount('T') > 0 && teamCount('CT') > 0) startMatch();
  else enterWarmup(true);
}

function adminAction(m) {
  const target = players.get(m.id);
  switch (m.action) {
    case 'state':
      return { ok: true };
    case 'kick':
      if (!target) return { error: 'No such player' };
      notify(`${target.name} was kicked by the admin`);
      target.ws.close(4001, 'Kicked by the admin');
      return { ok: true };
    case 'move':
      if (!target || !['T', 'CT', 'SPEC'].includes(m.team)) return { error: 'No such player or team' };
      setTeam(target, m.team);
      return { ok: true };
    case 'map':
      if (!MAPS[m.map]) return { error: 'No such map' };
      changeMap(m.map);
      return { ok: true };
    case 'restart':
      notify('The admin restarted the match', true);
      restartMatch();
      return { ok: true };
    case 'say': {
      const text = String(m.text || '').replace(/[<>]/g, '').trim().slice(0, 140);
      if (text) notify(`[ADMIN] ${text}`, true);
      return { ok: true };
    }
    case 'settings': {
      const changed = [];
      for (const [k, v] of Object.entries(m.settings || {})) {
        if (!SETTINGS[k] || !SETTINGS[k](v) || JSON.stringify(CFG[k]) === JSON.stringify(v)) continue;
        CFG[k] = v;
        savedSettings[k] = v;
        changed.push(k);
      }
      if (!changed.length) return { ok: true, changed };
      try { saveSettings(); } catch { /* read-only folder: keep them for this session */ }
      broadcast({ t: 'cfg', cfg: settingsView() });
      notify(`The admin changed: ${changed.map(k => SETTING_LABELS[k]).join(', ')}`);
      if (changed.includes('bots')) syncBots(game.phase === 'warmup');
      if (changed.includes('gameMode')) {
        notify({ gungame: 'Switching to Gun Game!', zombie: 'Switching to Zombie mode!', deathmatch: 'Switching to Deathmatch!', hns: 'Switching to Hide and Seek!' }[CFG.gameMode] || 'Switching to the classic game!', true);
        restartMatch();
      }
      return { ok: true, changed };
    }
    default:
      return { error: 'Unknown action' };
  }
}

function handleAdmin(req, res) {
  const reply = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') { reply(405, { error: 'POST only' }); return; }
  let body = '';
  req.on('data', c => { body += c; if (body.length > 20000) req.destroy(); });
  req.on('end', () => {
    const ip = req.socket.remoteAddress || '?';
    const f = adminFails.get(ip);
    if (f && f.until > Date.now()) { reply(429, { error: 'Too many wrong passwords — wait a minute.' }); return; }
    let m;
    try { m = JSON.parse(body); } catch { reply(400, { error: 'Bad request' }); return; }
    if (!passwordOk(m?.password)) {
      const n = (f?.n || 0) + 1;
      adminFails.set(ip, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 60000 : 0 });
      reply(403, { error: 'Wrong password' });
      return;
    }
    adminFails.delete(ip);
    const result = adminAction(m);
    reply(result.error ? 400 : 200, { ...result, state: adminState() });
  });
}

// ---------------------------------------------------------------- messages

function handle(p, m) {
  const t = now();
  switch (m.t) {
    case 'join': {
      if (p.joined) break;
      p.name = String(m.name || '').replace(/[<>&"]/g, '').trim().slice(0, 16) || `Player${p.id}`;
      p.joined = true;
      p.rankSeen = rankOf(p.name);
      let team = m.team;
      if (team !== 'T' && team !== 'CT' && team !== 'SPEC') {
        const nt = teamCount('T'), nct = teamCount('CT');
        team = nt < nct ? 'T' : nct < nt ? 'CT' : Math.random() < 0.5 ? 'T' : 'CT';
      }
      p.money = CFG.startMoney;
      if (teamFull(p, team)) {
        team = other(team);
        send(p, { t: 'msg', text: `Too many players on the other side — you joined the ${teamName(team)} (auto team balance).`, big: true });
      }
      if (team === 'SPEC') sendMe(p);
      else setTeam(p, team);
      sendRoster();
      syncBots();
      break;
    }
    case 'team':
      if (!p.joined || !['T', 'CT', 'SPEC'].includes(m.team)) break;
      if (teamFull(p, m.team)) { send(p, { t: 'msg', text: 'That team has too many players (auto team balance). Join the other side.' }); break; }
      setTeam(p, m.team);
      break;
    case 'state': {
      if (!p.alive || m.sq !== p.spawnSeq) break;
      const pos = vec3(m.p);
      if (!pos || !isNum(m.yaw) || !isNum(m.pitch)) break;
      // Hide and Seek: seekers stay where they are until the hiders have had their time.
      if (isHNS() && p.team === 'CT' && game.phase === 'live' && t < (game.hideUntil || 0)) { p.yaw = m.yaw; p.pitch = m.pitch; break; }
      p.p = pos;
      p.yaw = m.yaw;
      p.pitch = m.pitch;
      p.c = m.c ? 1 : 0;
      p.fl = m.fl ? 1 : 0;
      p.mo = isNum(m.mo) && m.mo > 0 && p.w === 'mortar' ? Math.round(Math.min(1500, m.mo)) : 0;
      if (typeof m.w === 'string' && WEAPONS[m.w]) {
        if (p.reloadUntil && m.w !== p.reloadWeapon) p.reloadUntil = 0;
        p.w = m.w;
      }
      p.history.push({ t, p: pos, c: p.c });
      while (p.history.length && p.history[0].t < t - 1000) p.history.shift();
      break;
    }
    case 'shoot':
      onShoot(p, m);
      break;
    case 'reload': {
      const def = WEAPONS[m.w];
      const item = ownItem(p, m.w);
      if (!p.alive || !item || p.reloadUntil || item.mag >= def.mag || item.res <= 0) break;
      p.reloadUntil = t + def.reload * 1000;
      p.reloadWeapon = m.w;
      break;
    }
    case 'mortar':
      onMortar(p, m);
      break;
    case 'spot':
      onSpot(p, m);
      break;
    case 'mark':
      onPing(p, m);
      break;
    case 'camo':
      if (p.camo) { p.camoOn = !!m.on; sendMe(p); }
      break;
    case 'mine':
      onMine(p, m);
      break;
    case 'nade':
      onNade(p, m);
      break;
    case 'buy':
      onBuy(p, m.item);
      break;
    case 'drop':
      onDrop(p, m.w);
      break;
    case 'use':
      onUse(p, m, t);
      break;
    case 'car':
      onCar(p, m, t);
      break;
    case 'horn':
      if (p.driving != null && !world.cars[p.driving]?.wrecked && t - (p.lastHorn || 0) > 400) {
        p.lastHorn = t;
        broadcast({ t: 'sfx', s: 'horn', p: world.cars[p.driving]?.p });
      }
      break;
    case 'spray':
      onSpray(p, m, t);
      break;
    case 'sprayimg':
      if (typeof m.data === 'string' && m.data.startsWith('data:image/png;base64,') && m.data.length < 90000) {
        p.sprayImg = m.data;
        broadcast({ t: 'sprayimg', id: p.id, data: m.data });
      }
      break;
    case 'startmoney': {
      const v = +m.value;
      if (!p.joined || !START_MONEY_CHOICES.includes(v) || v === CFG.startMoney) break;
      CFG.startMoney = v;
      savedSettings.startMoney = v;
      try { saveSettings(); } catch { /* read-only folder: keep it for this session */ }
      broadcast({ t: 'cfg', cfg: { startMoney: v } });
      notify(`${p.name} set the start money to $${v} — it applies from the next match`);
      break;
    }
    case 'emote': {
      const e = m.e === 'stop' ? 'stop' : EMOTE[m.e] ? m.e : null;
      if (!e || !p.alive || !inTeam(p) || (e !== 'stop' && t - (p.lastEmote || 0) < 1500)) break;
      if (e !== 'stop') { p.lastEmote = t; record(p, 'emotes'); }
      broadcast({ t: 'emote', id: p.id, e }, q => q !== p);
      break;
    }
    case 'endvote':
      onEndVote(p, m.id);
      break;
    case 'votemap':
      if (!p.joined || !MAPS[m.id]) break;
      if (game.endVote) { onEndVote(p, m.id); break; }
      if (m.id === MAP.id) { send(p, { t: 'msg', text: `${MAP.title} is already being played.` }); break; }
      p.vote = m.id;
      notify(`${p.name} voted for ${MAPS[m.id].title}`);
      sendRoster();
      checkVotes();
      break;
    case 'radio': {
      const menu = RADIO[m.menu];
      const text = menu?.items[m.n];
      if (!text || !p.alive || !inTeam(p) || t - (p.lastRadio || 0) < 700) break;
      p.lastRadio = t;
      broadcast({ t: 'radio', id: p.id, name: p.name, team: p.team, text, p: p.p }, q => q.team === p.team);
      break;
    }
    case 'chat': {
      const text = String(m.text || '').replace(/[<>]/g, '').trim().slice(0, 120);
      if (!text || !p.joined) break;
      const teamOnly = !!m.team && inTeam(p);
      broadcast({ t: 'chat', name: p.name, team: p.team, text, teamOnly, dead: !p.alive && inTeam(p) },
        q => !teamOnly || q.team === p.team);
      break;
    }
    case 'pong':
      if (isNum(m.ts)) p.ping = Math.round(t - m.ts);
      break;
  }
}

function leave(p) {
  players.delete(p.id);
  if (p.driving != null || p.riding != null) releaseCar(p);
  game.sprays.delete(p.id);
  if (!p.joined) return;
  if (p.inv.c4 && p.alive) dropBomb(p, p.p);
  if (game.bomb.carrier === p.id) game.bomb.carrier = null;
  if (!p.bot) notify(`${p.name} left the game`);
  broadcast({ t: 'left', id: p.id });
  checkTeams();
  checkRoundEnd();
  checkVotes();
  sendRoster();
  if (!p.bot) syncBots();
}

// ---------------------------------------------------------------- tick

function tick() {
  const t = now();

  if (game.pendingStart && t >= game.pendingStart) {
    game.pendingStart = 0;
    startMatch();
  }

  if (game.phase === 'live' && (isDM() || isGG())) mendPieces(t);
  if (game.phase === 'warmup') {
    warmupRepairs(t);
    for (const p of players.values()) if (inTeam(p) && !p.alive && t - p.deathAt > 3000) { resetLoadout(p); spawnPlayer(p); }
  } else if (game.phase === 'freeze' && t >= game.phaseEnd) {
    game.phase = 'live';
    game.phaseEnd = t + CFG.roundTime * 1000;
    if (isHNS()) { game.hideUntil = t + CFG.hnsHide * 1000; game.phaseEnd += CFG.hnsHide * 1000; }
    broadcast({ t: 'sfx', s: 'go' });
  } else if (game.phase === 'live' && isGG()) {
    for (const p of players.values()) {
      if (!inTeam(p) || p.alive || t - p.deathAt < CFG.ggRespawn * 1000) continue;
      // Auto team balance in Gun Game: someone on a team two players ahead respawns on the other side.
      if (CFG.autoBalance && !p.bot && humanCount(p.team) - humanCount(other(p.team)) >= 2) {
        const to = other(p.team);
        movePlayer(p, to);
        notify(`${p.name} was moved to the ${teamName(to)} to balance the teams`);
      }
      ggLoadout(p);
      spawnPlayer(p);
      protect(p);
    }
  } else if (game.phase === 'live' && isDM()) {
    for (const p of players.values()) {
      if (!inTeam(p) || p.alive || t - p.deathAt < CFG.ggRespawn * 1000) continue;
      spawnPlayer(p);
      protect(p);
    }
    if (t >= game.phaseEnd) {
      const best = [...players.values()].filter(inTeam).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
      dmWin(best || null);
    }
  } else if (game.phase === 'live' && isZM() && t < game.phaseEnd) {
    if (!game.infected && game.infectAt && t >= game.infectAt) startInfection();
    for (const p of players.values()) {
      if (!inTeam(p) || p.alive || t - p.deathAt < ZOMBIE.respawn * 1000) continue;
      // The dead come back as zombies once the infection has started.
      if (game.infected) p.team = 'T';
      spawnPlayer(p);
      if (p.zombie) broadcast({ t: 'infect', v: p.id, k: null, respawn: true });
    }
    checkRoundEnd();
  } else if (game.phase === 'live') {
    if (game.bomb.state === 'planted') {
      if (t >= game.bomb.explodeAt) explodeBomb();
    } else if (t >= game.phaseEnd) {
      if (isZM()) endRound('CT', 'The humans survived!');
      else if (isHNS()) endRound('T', 'The hiders survived!');
      else if (isHostageMap()) endRound('T', 'Hostages have not been rescued');
      else if (mapMode(MAP) === 'elim') {
        // Time's up on a map without objectives: more players alive wins, then more health.
        const side = tm => [...players.values()].filter(p => p.team === tm && p.alive);
        const score = tm => side(tm).length * 1000 + side(tm).reduce((a, p) => a + p.hp, 0);
        endRound(score('T') > score('CT') ? 'T' : 'CT', 'Time is up — the team with more players alive wins');
      } else endRound('CT', 'Target has been saved');
    }
  } else if (game.phase === 'end' && t >= game.phaseEnd) {
    if (game.matchOver) {
      const next = nextMapAfterMatch();
      if (next !== MAP.id) changeMap(next);
      else { notify(`Next match: ${MAP.title} again`, true); startMatch(); }
    }
    else startRound();
  }

  for (const p of players.values()) {
    if (p.reloadUntil && t >= p.reloadUntil) {
      p.reloadUntil = 0;
      const item = ownItem(p, p.reloadWeapon);
      if (item) {
        const n = Math.min(WEAPONS[item.id].mag - item.mag, item.res);
        item.mag += n;
        item.res -= n;
        sendMe(p);
      }
    }
  }

  updateActions(t);
  updatePickups();
  updateMines(t);
  updateCamo(t);
  bots.update(1 / CFG.tickRate);
  if (game.hostages.length) {
    for (const ev of updateHostages(game.hostages, players, 1 / CFG.tickRate, world.move(), t)) {
      if (ev.type === 'lost' && ev.leader) send(ev.leader, { t: 'msg', text: 'A hostage lost track of you!' });
    }
    for (const h of game.hostages) if (h.state === 'follow' && inRescueZone(MAP, h.p)) rescueHostage(h);
  }

  for (let i = game.nades.length - 1; i >= 0; i--) {
    if (t >= game.nades[i].at) explodeNade(game.nades.splice(i, 1)[0]);
  }
  updateFires(t);

  // Snapshot
  const pl = [];
  for (const p of players.values()) {
    if (!inTeam(p)) continue;
    pl.push([p.id, r2(p.p[0]), r2(p.p[1]), r2(p.p[2]), r2(p.yaw), r2(p.pitch), p.c, p.w, p.alive ? 1 : 0, p.team === 'T' ? 1 : 2, p.fl ? 1 : 0, p.mo || 0, p.hidden ? 1 : 0]);
  }
  const b = game.bomb;
  const base = {
    t: 's',
    time: Math.round(t),
    ph: game.phase,
    tl: game.phase === 'warmup' || (isGG() && game.phase === 'live') ? -1 : Math.max(0, (game.phaseEnd - t) / 1000),
    el: Math.max(0, (t - game.roundStartAt) / 1000),
    sc: game.score,
    pl,
    dr: game.drops.map(d => [d.id, d.w, r2(d.p[0]), r2(d.p[1]), r2(d.p[2])]),
    b: { s: b.state, p: b.p, tl: b.state === 'planted' ? Math.max(0, (b.explodeAt - t) / 1000) : 0 },
    hs: game.hostages.map(h => [h.id, r2(h.p[0]), r2(h.p[1]), r2(h.p[2]), r2(h.yaw), HOSTAGE_STATE[h.state], h.leader || 0]),
    cars: world.cars.map(c => [c.id, r2(c.p[0]), r2(c.p[1]), r2(c.p[2]), r2(c.yaw), r2(c.speed), r2(c.steer), c.driver || 0, Math.max(0, Math.round(c.hp)), c.riders[0] || 0, c.riders[1] || 0, c.wrecked ? 1 : 0]),
  };
  for (const p of players.values()) {
    const me = p.act ? { a: p.act.type, pr: Math.min(1, (t - p.act.start) / p.act.dur) } : null;
    send(p, { ...base, me });
  }
}

setInterval(() => {
  if (!env.DEBUG_TICK) return tick();
  const t0 = performance.now();
  tick();
  const ms = performance.now() - t0;
  tick.sum = (tick.sum || 0) + ms; tick.n = (tick.n || 0) + 1; tick.max = Math.max(tick.max || 0, ms);
  if (tick.n >= 150) { console.log(`  [tick] avg ${(tick.sum / tick.n).toFixed(2)} ms, max ${tick.max.toFixed(1)} ms`); tick.sum = tick.n = tick.max = 0; }
}, 1000 / CFG.tickRate);
setInterval(() => broadcast({ t: 'ping', ts: now() }), 2000);
setInterval(sendRoster, 2000);
setInterval(() => syncBots(), 2000);

function newPlayer(ws) {
  return {
    id: nextId++, ws, name: 'Player', team: 'SPEC', joined: false, alive: false,
    hp: 0, armor: 0, helmet: false, kit: false, nvg: false, money: CFG.startMoney, kills: 0, deaths: 0,
    p: [0, 0, 0], yaw: 0, pitch: 0, c: 0, fl: 0, w: 'knife', inv: freshInv('SPEC'),
    history: [], ping: 0, lastShot: 0, reloadUntil: 0, reloadWeapon: null, act: null, deathAt: 0, spawnSeq: 0,
    sprayImg: null, lastSpray: -1e9, vote: null, driving: null, riding: null,
    rs: { kills: 0, dmg: 0, rescues: 0, obj: null }, match: { hs: 0, mvps: 0, rescues: 0, dmg: 0 },
  };
}

resetWorld();
// Bot navigation for every map, built in the background: the current map first.
bots.prepare([MAP.id, ...MAP_IDS.filter(id => id !== MAP.id)]);

const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });

wss.on('connection', ws => {
  if (players.size >= CFG.maxPlayers) { ws.close(1013, 'Server full'); return; }
  const p = newPlayer(ws);
  players.set(p.id, p);
  const sprayImgs = {};
  for (const q of players.values()) if (q.sprayImg) sprayImgs[q.id] = q.sprayImg;
  send(p, {
    t: 'welcome', id: p.id, map: MAP.id, mode: mapMode(MAP), maps: MAP_IDS.map(id => ({ id, title: MAPS[id].title })),
    cfg: { ...settingsView(), zombieCountdown: ZOMBIE.countdown, hnsHide: CFG.hnsHide, gameMode: CFG.gameMode, autoBalance: CFG.autoBalance, halftime: CFG.halftime, startMoney: CFG.startMoney, startMoneyChoices: START_MONEY_CHOICES, roundsToWin: CFG.roundsToWin, roundTime: CFG.roundTime, buyTime: CFG.buyTime, freezeTime: CFG.freezeTime, plantTime: CFG.plantTime, friendlyFire: CFG.friendlyFire, httpsPort: httpsReady ? CFG.httpsPort : null },
    sprayImgs, sprays: [...game.sprays.values()], glass: [...world.broken], brk: [...world.gone], lights: game.lights, doors: world.doorStates,
  });
  sendMines(p);
  sendRoster();
  ws.on('message', data => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (m && typeof m.t === 'string') handle(p, m);
  });
  ws.on('close', () => leave(p));
  ws.on('error', () => {});
});

function attachWebSocket(server) {
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/ws')) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
}

let httpsReady = false;
const httpServer = http.createServer(serveStatic);
attachWebSocket(httpServer);
httpServer.listen(CFG.port, '0.0.0.0', async () => {
  const cert = await loadCertificate();
  if (cert) {
    const httpsServer = https.createServer(cert, serveStatic);
    attachWebSocket(httpsServer);
    await new Promise(res => httpsServer.listen(CFG.httpsPort, '0.0.0.0', res).on('error', e => { console.warn('  HTTPS failed:', e.message); res(); }));
    httpsReady = httpsServer.listening;
  }
  const ips = lanAddresses();
  console.log(`\n  Counter-Office server — map ${MAP.title}\n`);
  if (httpsReady) {
    console.log('  Recommended (fullscreen blocks browser shortcuts like Ctrl+W):');
    for (const ip of ips) console.log(`    https://${ip}:${CFG.httpsPort}`);
    console.log('    (first visit: click "Advanced" -> "Continue" on the certificate warning)\n');
  }
  console.log('  Plain HTTP:');
  for (const ip of ips) console.log(`    http://${ip}:${CFG.port}`);
  console.log(`    http://localhost:${CFG.port}`);
  console.log(`\n  Admin panel: ${httpsReady ? `https://${ips[0] || 'localhost'}:${CFG.httpsPort}` : `http://${ips[0] || 'localhost'}:${CFG.port}`}/admin   password: ${ADMIN_PASSWORD}`);
  if (!env.ADMIN_PASSWORD) console.log(`  (change the password in ${path.relative(ROOT, ADMIN_FILE)} or with ADMIN_PASSWORD)`);
  const modeName = { gungame: 'Gun Game', zombie: 'Zombie', deathmatch: 'Deathmatch', hns: 'Hide and Seek' }[CFG.gameMode] || 'classic';
  console.log(`\n  Mode: ${modeName}  |  bots: ${CFG.bots.perTeam ? `${CFG.bots.perTeam} per team (${CFG.bots.difficulty})` : 'off'}  |  maps: ${MAP_IDS.join(', ')}  |  rounds to win: ${CFG.roundsToWin}  |  friendly fire: ${CFG.friendlyFire ? 'on' : 'off'}\n`);
});
