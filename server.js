// Counter-Office game server: serves the web client (HTTP + HTTPS) and runs the authoritative game
// (rounds, money, damage, bomb, grenades, maps) over WebSockets.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { MAPS, MAP_IDS, DEFAULT_MAP, siteAt, inBuyZone, inRescueZone, mapMode } from './shared/maps/index.js';
import { WEAPONS, ITEMS, GRENADES, FIRE, GUNGAME, defaultPistol, slotKey, ammoCost, shellFlight, mortarRange, MILS, MINES, MINE, CAMO, PING, JAMMER, BREAK, BLAST_FIRE, REAL, SATCHEL, DRONE, droneSignal } from './shared/weapons.js';
import { RADIO } from './shared/radio.js';
import { PLAYER, NADE, rayAABB, rayPlayer, simulateNade, overlapsAny, inWater } from './shared/physics.js';
// Zombie mode: zombie health, the first ("mother") zombies' health, seconds until the infection, respawn delay.
const ZOMBIE = { hp: 1000, motherHp: 2000, countdown: 12, respawn: 4 };
// Party modes the admin can switch on (see CFG.party).
const PARTY_WEAPONS = ['', 'awp', 'deagle', 'scout', 'ak47', 'knife', 'rpg'];
import { CAR, carBoxes, seatPos, exitSpots } from './shared/vehicles.js';
import { CollisionWorld } from './shared/collision.js';
import { skyOf } from './shared/maps/sky.js';
import { doorBox, doorCenter, doorReach, openingSide, GONE } from './shared/doors.js';
import { ZIP, zipFeet, zipPoint, zipDir, zipRide, fallDamage, CCTV, camView, camHalfFov } from './shared/gadgets.js';
import { Stats, rating } from './lib/stats.js';
import { rankIndex } from './shared/ranks.js';
import { ACHIEVEMENTS } from './shared/achievements.js';
import { EMOTE } from './shared/emotes.js';
import { createHostages, updateHostages, HOSTAGE_STATE } from './lib/hostages.js';
import { initShield } from './lib/shield.js'; // shield: a Terrorist holds a hostage as a human shield
import { BotManager, BOT_LEVELS } from './lib/bots.js';
import { createBlood } from './lib/blood.js'; // blood trails
import { createCat } from './lib/cat.js'; // the mansion's cat
import { createDisguise } from './lib/disguise.js'; // Disguise
import * as body from './lib/body.js'; // body: "Downed, not dead" + "Play dead"

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
  // 32 a second, i.e. every 31.25 ms: exactly two steps of the Windows timer (15.6 ms). At 30 the timer rounded
  // most ticks up to 47 ms, so the game really ran at ~22 snapshots a second, unevenly.
  tickRate: 32,
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
  if (url === '/api/build') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ build: BUILD }));
    return;
  }
  for (const [prefix, dir] of MOUNTS) {
    if (!url.startsWith(prefix)) continue;
    const file = path.join(dir, url.slice(prefix.length) || 'index.html');
    if (!file.startsWith(dir + path.sep)) break;
    staticFile(file, (err, f) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      // The browser asks "has it changed?" each time (no-cache) and gets a tiny "no" (304) when it hasn't.
      const head = { 'Content-Type': f.type, 'Cache-Control': 'no-cache', ETag: f.etag };
      if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, head); res.end(); return; }
      if (f.gz) {
        head.Vary = 'Accept-Encoding';
        if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { head['Content-Encoding'] = 'gzip'; res.writeHead(200, head); res.end(f.gz); return; }
      }
      res.writeHead(200, head);
      res.end(f.data);
    });
    return;
  }
  res.writeHead(404);
  res.end('Not found');
}

// Served files, read and compressed once and kept until they change on disk. The page carries the build it came
// from (see BUILD), so a page left open across an update notices and reloads.
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg']);
const fileCache = new Map();
function staticFile(file, done) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { done(err || new Error('not a file')); return; }
    const hit = fileCache.get(file);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) { done(null, hit); return; }
    fs.readFile(file, (err2, data) => {
      if (err2) { done(err2); return; }
      const ext = path.extname(file);
      if (file === INDEX_HTML) data = Buffer.from(data.toString('utf8').replace('content="dev"', `content="${BUILD}"`));
      const f = {
        mtime: st.mtimeMs, size: st.size, data, type: MIME[ext] || 'application/octet-stream',
        etag: `"${crypto.createHash('sha1').update(data).digest('base64url').slice(0, 16)}"`,
        gz: COMPRESS.has(ext) && data.length > 1024 ? zlib.gzipSync(data, { level: 9 }) : null,
      };
      fileCache.set(file, f);
      done(null, f);
    });
  });
}

// The game's version: a fingerprint of every file the browser loads, taken when the server starts.
const INDEX_HTML = path.join(ROOT, 'public', 'index.html');
const BUILD = (() => {
  const h = crypto.createHash('sha1');
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else { h.update(path.relative(ROOT, full)); h.update(fs.readFileSync(full)); }
    }
  };
  for (const dir of ['public', 'shared']) walk(path.join(ROOT, dir));
  return h.digest('hex').slice(0, 10);
})();

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
  jammers: [],
  drones: [],
  nextMineId: 1,
  satchels: [],
  camsDown: new Set(), // broken CCTV cameras (Mansion), and when each broke
  camDownAt: {},
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
const freshInv = team => ({ primary: null, secondary: inTeam({ team }) ? makeItem(defaultPistol(team)) : null, he: 0, flash: 0, smoke: 0, molotov: 0, pmn: 0, mon50: 0, jammer: 0, satchel: 0, drone: 0, c4: false });
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

// ---- The team bar along the top (classic matches, like CS2's): for your own team money, health, grenades, the kit
// and the bomb; for the other team only who's alive and what they hold — everything once you're dead or watching.
// Each player gets their own copy, so nothing they shouldn't see is ever sent to them.
// A row: [id, alive, weapon, hp | -1, money | -1, [grenades and mines], flags: 1 kit, 2 the bomb]
function sendTeamBar() {
  if (CFG.gameMode !== 'classic') return;
  const team = [...players.values()].filter(q => q.joined && inTeam(q));
  if (!team.length) return;
  const rows = team.map(q => {
    const nades = [];
    for (const k of [...GRENADES, ...MINES]) for (let i = 0; i < (q.inv[k] || 0); i++) nades.push(k);
    const full = [q.id, q.alive ? 1 : 0, q.inv.primary?.id || q.inv.secondary?.id || 'knife', Math.max(0, Math.round(q.hp)), q.money, nades, (q.kit ? 1 : 0) | (q.inv.c4 ? 2 : 0)];
    return { q, full, enemy: [q.id, q.alive ? 1 : 0, full[2], -1, -1, [], 0] };
  });
  body.fakeBar(rows); // body: someone playing dead looks dead
  for (const p of players.values()) {
    if (!p.joined) continue;
    const all = !inTeam(p) || !p.alive;
    send(p, { t: 'bar', l: rows.map(r => (all || r.q.team === p.team ? r.full : r.enemy)) });
  }
}

function sendRoster() {
  const list = [...players.values()].filter(p => p.joined).map(p => ({
    id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, ping: p.ping, buf: p.buf || 0, alive: p.alive, vote: p.vote || null,
    lv: isGG() ? (p.level || 0) + 1 : undefined, rank: rankOf(p.name), z: p.zombie ? 1 : 0, bot: p.bot ? 1 : 0,
  }));
  body.fakeRoster(list); // body: someone playing dead looks dead
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
  body.reset(p); // body: up on your feet
  p.burnUntil = 0;
  p.piloting = null;
  p.zip = null;
  p.zipFall = null;
  p.cctv = null;
  p.buys = []; // what can be sold back (onSell): this life's purchases
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
  game.burnt = new Set();
  game.doorGoneAt = {};
  game.doorHeat = {};
  game.doorOpening = {};
  game.doorHp = {};
  game.glassAt = {};
  game.lights = {};
  for (const g of lightGroups()) game.lights[g] = true;
  if (MAP.fusebox) game.lights.power = true; // (Mansion's blackout: see the fuse box)
  for (const p of players.values()) { p.driving = null; p.riding = null; }
  world.cars = (MAP.vehicles || []).map((v, id) => freshCar(v, id));
  world.setDoors([]);
  game.hostages = isHostageMap() && CFG.gameMode === 'classic' ? createHostages(MAP) : [];
  clearMines();
  cat.reset(); // cat: back asleep in its basket
  game.zipCut = false;
  game.camsDown = new Set();
  game.camDownAt = {};
  broadcast({ t: 'world', glass: [], brk: [], lights: game.lights, doors: world.doorStates });
  sendGadgets();
}

// ---- Breakable walls and furniture (maps with `breakables`: cs_mansion). Explosions and heavy guns wear the
// chunks down; a broken one is gone (no collision, not drawn) until the next round.
function breakPieces(ids, from = null, fall = false) {
  if (!ids.length) return;
  for (const id of ids) world.gone.add(id);
  for (const id of ids) (game.pieceAt ||= new Map()).set(id, now());
  broadcast({ t: 'brk', ids, from: from && from.map(r2), fall: fall ? 1 : 0 });
  // windows in a broken wall fall out
  const pcs = ids.map(id => MAP.breakables[id]);
  breakGlass(world.intactGlass.filter(g => pcs.some(pc => [0, 1, 2].every(k => g.min[k] < pc.max[k] + 0.1 && g.max[k] > pc.min[k] - 0.1))).map(g => g.id));
  if (MAP.realism && !fall) collapse();
}

// What no longer holds on to anything falls (see linkUp in shared/maps/breakables.js) and hurts whoever is under it.
function collapse() {
  const P = MAP.breakables, held = new Uint8Array(P.length), queue = [];
  for (const pc of P) if (pc.anchor && !world.gone.has(pc.id)) { held[pc.id] = 1; queue.push(pc.id); }
  while (queue.length) for (const n of P[queue.pop()].links) if (!held[n] && !world.gone.has(n)) { held[n] = 1; queue.push(n); }
  const fallen = P.filter(pc => !held[pc.id] && !world.gone.has(pc.id));
  if (!fallen.length) return;
  breakPieces(fallen.map(pc => pc.id), null, true);
  const hurt = new Map();
  for (const pc of fallen) {
    for (const q of players.values()) {
      if (!q.alive || q.p[1] > pc.min[1] || q.p[1] < pc.min[1] - 4) continue;
      if (q.p[0] < pc.min[0] - 0.3 || q.p[0] > pc.max[0] + 0.3 || q.p[2] < pc.min[2] - 0.3 || q.p[2] > pc.max[2] + 0.3) continue;
      hurt.set(q, Math.min(150, (hurt.get(q) || 0) + REAL.collapse));
    }
  }
  for (const [q, dmg] of hurt) applyDamage(q, null, dmg, 'head', 'collapse', 1);
}

// A door blown off its hinges (or burnt away): gone until the next round.
function blowDoor(i) {
  if (world.doorStates[i] === GONE) return;
  const states = world.doorStates.slice();
  states[i] = GONE;
  world.setDoors(states);
  (game.doorGoneAt ||= {})[i] = now();
  broadcast({ t: 'doors', doors: states, i, blown: true, p: doorCenter(MAP.doors[i]) });
}

// Realism (cs_mansion): a blast throws people back and knocks their aim, tears doors off, and leaves a cloud of
// dust the bots can't see through.
function blastShove(at, weapon) {
  const P = REAL.push[weapon];
  if (P) {
    const [R, speed] = P;
    for (const q of players.values()) {
      if (!q.alive || q.bot) continue;
      const chest = [q.p[0], q.p[1] + 1.1, q.p[2]];
      const d = dist3(at, chest);
      if (d > R || !lineOfSight(at, chest)) continue;
      const k = 1 - d / R, h = Math.hypot(chest[0] - at[0], chest[2] - at[2]) || 1;
      send(q, { t: 'knock', v: [((chest[0] - at[0]) / h) * speed * k, speed * 0.35 * k, ((chest[2] - at[2]) / h) * speed * k], aim: 0.35 * k });
    }
  }
  const D = REAL.door[weapon];
  if (D) (MAP.doors || []).forEach((d, i) => { if (doorReach(d, at) < D * (d.weak ? 1.6 : 1)) blowDoor(i); });
  const S = REAL.smoke[weapon];
  if (S) (game.smokes ||= []).push({ p: [at[0], at[1] + 0.5, at[2]], until: now() + S * 1000 });
}

// The breakable pieces by 2 m square of the map (made once per map), so blasts and fires only look at what's near.
const pieceGrids = new WeakMap();
let pieceQuery = 0;
function piecesNear(min, max) {
  let grid = pieceGrids.get(MAP);
  if (!grid) {
    grid = new Map();
    for (const pc of MAP.breakables) {
      for (let x = Math.floor(pc.min[0] / 2); x <= Math.floor(pc.max[0] / 2); x++) {
        for (let z = Math.floor(pc.min[2] / 2); z <= Math.floor(pc.max[2] / 2); z++) {
          const k = x * 65536 + z;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(pc);
        }
      }
    }
    pieceGrids.set(MAP, grid);
  }
  const q = ++pieceQuery, out = [];
  for (let x = Math.floor(min[0] / 2); x <= Math.floor(max[0] / 2); x++) {
    for (let z = Math.floor(min[2] / 2); z <= Math.floor(max[2] / 2); z++) {
      for (const pc of grid.get(x * 65536 + z) || []) {
        if (pc._q === q) continue;
        pc._q = q;
        if (pc.max[1] >= min[1] && pc.min[1] <= max[1]) out.push(pc);
      }
    }
  }
  return out;
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
  cat.blast(at, weapon); // cat: thrown or scared by every explosion
  const B = BREAK.blast[weapon];
  if (!MAP.breakables || !B) return;
  const round = game.round;
  setTimeout(() => {
    if (game.round !== round) return;
    const tb = performance.now();
    const [R, D] = B, out = [];
    for (const pc of piecesNear(at.map(v => v - R), at.map(v => v + R))) {
      if (world.gone.has(pc.id)) continue;
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
    breakPieces(out, at);
    if (MAP.realism) blastShove(at, weapon);
    if (env.DEBUG_TICK) console.log(`  [blast] ${weapon}: ${out.length} pieces broken in ${(performance.now() - tb).toFixed(1)} ms`);
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
  c.p[1] = groundY(c.p[0], v.y ?? 10, c.p[2]); // drop it onto the ground from above (from v.y under a roof)
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
  blastJammers(center, 6);
  blastDrones(center, 6);
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
  const doors = Object.entries(game.doorGoneAt || {}).filter(([i, at]) => world.doorStates[i] === GONE && t - at > 90000 &&
    ![...players.values()].some(q => q.alive && overlapsAny([doorBox(MAP.doors[i], 0)], q.p[0], q.p[1], q.p[2], PLAYER.radius, PLAYER.height)));
  if (doors.length) {
    const states = world.doorStates.slice();
    for (const [i] of doors) { states[i] = 0; delete game.doorGoneAt[i]; }
    world.setDoors(states);
    broadcast({ t: 'doors', doors: states, i: +doors[0][0], open: false, p: doorCenter(MAP.doors[doors[0][0]]) });
  }
  if (!world.gone.size) return;
  const mended = [...world.gone].filter(id => {
    if (t - (game.pieceAt?.get(id) || 0) < 90000) return false;
    const pc = MAP.breakables[id];
    return ![...players.values()].some(q => q.alive && overlapsAny([{ min: pc.min, max: pc.max }], q.p[0], q.p[1], q.p[2], PLAYER.radius, PLAYER.height));
  });
  if (!mended.length) return;
  world.setGone([...world.gone].filter(id => !mended.includes(id)));
  for (const id of mended) { game.pieceHp.delete(id); game.burnt?.delete(id); }
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
    c.p = [home.p[0], groundY(home.p[0], home.y ?? 10, home.p[1]), home.p[1]];
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
    if (dd < bd && Math.abs(p.p[1] + 1 - c[1]) < 1.6 && world.doorStates[i] !== GONE) { bd = dd; best = { i, d, dist: dd }; }
  });
  return best;
}

// Doors open away from whoever uses them, and won't swing into someone standing in the way.
function useDoor(p, i) {
  const d = MAP.doors[i];
  const next = world.doorStates[i] === 0 ? openingSide(d, p.p) : 0;
  const box = doorBox(d, next);
  const inWay = [...players.values()].some(q => q.alive && overlapsAny([box], q.p[0], q.p[1], q.p[2], PLAYER.radius, PLAYER.height)) ||
    game.hostages.some(h => h.state !== 'dead' && h.state !== 'rescued' && overlapsAny([box], h.p[0], h.p[1], h.p[2], PLAYER.radius, PLAYER.height)) ||
    world.cars.some(c => carBoxes(c).some(b => [0, 1, 2].every(k => b.min[k] < box.max[k] && b.max[k] > box.min[k])));
  if (inWay) { send(p, { t: 'msg', text: 'Someone is in the way of the door.' }); return; }
  if (d.slow && next !== 0) { slowOpen(i, next); return; }
  const states = world.doorStates.slice();
  states[i] = next;
  world.setDoors(states);
  broadcast({ t: 'doors', doors: states, i, open: next !== 0, p: doorCenter(d) });
}

// ---- Mansion 2.0 (see shared/maps/mansion2.js)
// A stiff old door (d.slow seconds): it creaks open loudly, and only when it has swung far enough can anyone pass.
function slowOpen(i, side) {
  const d = MAP.doors[i];
  if ((game.doorOpening ||= {})[i]) return;
  game.doorOpening[i] = { at: now() + d.slow * 1000, side };
  broadcast({ t: 'doors', doors: world.doorStates, i, creak: d.slow, side, p: doorCenter(d) });
}

// A weak door gives way to gunfire too.
function shootDoor(i, dmg) {
  const d = MAP.doors[i];
  if (!d?.weak) return;
  (game.doorHp ||= {})[i] = (game.doorHp[i] || 0) + dmg;
  if (game.doorHp[i] >= 260) blowDoor(i);
}

// Every tick on Mansion: doors that have creaked open, the gadgets.
function mansionTick(t) {
  if (MAP.zip) zipTick(t);
  if (MAP.cctv) cctvTick(t);
  for (const [i, o] of Object.entries(game.doorOpening || {})) {
    if (t < o.at) continue;
    delete game.doorOpening[i];
    if (world.doorStates[i] !== 0) continue;
    const box = doorBox(MAP.doors[i], o.side);
    if ([...players.values()].some(q => q.alive && overlapsAny([box], q.p[0], q.p[1], q.p[2], PLAYER.radius, PLAYER.height))) {
      game.doorOpening[i] = { at: t + 300, side: o.side };
      continue;
    }
    const states = world.doorStates.slice();
    states[i] = o.side;
    world.setDoors(states);
    broadcast({ t: 'doors', doors: states, i: +i, open: true, quiet: 1, p: doorCenter(MAP.doors[i]) });
  }
}

// ---- Blackout (Mansion): the fuse box in the cellar switches every light of the house at once. Off, the rooms
// go truly dark; back on, they flicker for a moment first (in the browsers). Everyone hears it.
function atFuseBox(p) {
  const f = MAP.fusebox;
  return !!f && Math.hypot(p.p[0] - f.p[0], p.p[2] - f.p[2]) < 1.4 && Math.abs(p.p[1] - f.floor) < 0.6;
}

function setPower(on, by) {
  game.lights.power = on;
  for (const g of MAP.fusebox.groups) game.lights[g] = on;
  broadcast({ t: 'lights', lights: game.lights, power: on ? 'on' : 'off', p: MAP.fusebox.p });
  notify(on ? `${by.name} brought the power back on` : `${by.name} cut the power — the house is dark`);
}

// ---- The Mansion's gadgets (see shared/gadgets.js). Their state goes to everyone in a 'gadgets' message whenever it
// changes (and to whoever joins).
function gadgetState() {
  return { t: 'gadgets', zipCut: game.zipCut ? 1 : 0, cams: [...(game.camsDown || [])] };
}
const sendGadgets = (to = null) => { if (!MAP.mansion2) return; if (to) send(to, gadgetState()); else broadcast(gadgetState()); };
// Someone on a gadget can't shoot, throw or use their items.
const busy = p => !!p.zip || !!p.cctv;

// ---- Zip line: E at either end hooks you on; the server moves you along the cable (your browser works out the same
// from the start time, see zipRide) and the snapshot shows you hanging there. E or Space lets go (CS 1.6's fall damage
// when you land: fallDamage); at the end you drop off. A Terrorist at the terrace end holds E to cut it: whoever is on
// it falls. It's back every round (without rounds, after ZIP.mend seconds).
function zipStand(p) {
  const z = MAP.zip;
  if (!z || game.zipCut) return null;
  return z.stands.find(st => Math.hypot(p.p[0] - st.p[0], p.p[2] - st.p[2]) < ZIP.reach && Math.abs(p.p[1] - st.p[1]) < 0.7) || null;
}
const atZipCut = p => !!MAP.zip && !game.zipCut && Math.hypot(p.p[0] - MAP.zip.cut[0], p.p[2] - MAP.zip.cut[2]) < ZIP.cutReach && Math.abs(p.p[1] - MAP.zip.floor) < 0.7;
const zipNow = (p, t) => zipRide(MAP.zip, p.zip.s0, p.zip.dir, Math.max(0, t - p.zip.at) / 1000);

function zipOn(p, st, t) {
  // (not on top of someone who has just hooked on there)
  if ([...players.values()].some(q => q.zip && q.zip.dir === st.dir && Math.abs(zipNow(q, t).s - st.s) < 1.5)) return send(p, { t: 'msg', text: 'Someone is on the zip line right there — wait a moment.' });
  p.zip = { s0: st.s, dir: st.dir, at: t };
  p.zipFall = null;
  p.act = null;
  p.p = zipFeet(MAP.zip, st.s);
  p.history = [];
  send(p, { t: 'zip', s0: st.s, dir: st.dir, at: t });
  broadcast({ t: 'sfx', s: 'zipclip', p: zipPoint(MAP.zip, st.s).map(r2) });
}

// Off the cable: at the end (dropping off), letting go, the cable cut, or death (no message then).
function zipOff(p, t, why) {
  if (!p.zip) return;
  const r = zipNow(p, t), pos = zipFeet(MAP.zip, r.s), v = why === 'end' ? [0, 0, 0] : zipDir(MAP.zip).map(c => c * r.v);
  p.zip = null;
  if (why === 'dead') return;
  p.p = pos;
  p.history = [];
  if (why !== 'end') p.zipFall = { top: pos[1], y: pos[1], at: t };
  const r3 = c => Math.round(c * 1000) / 1000;
  send(p, { t: 'zipEnd', p: pos.map(r3), v: v.map(r3), why });
}

// Landing after a fall off the zip line (from the positions the browser sends): the fall damage.
function zipLanding(p, pos, t) {
  const f = p.zipFall;
  if (t - f.at > 8000) { p.zipFall = null; return; }
  f.top = Math.max(f.top, pos[1]);
  if (pos[1] < f.y - 1e-3 || pos[1] > f.y + 1e-3) { f.y = pos[1]; f.moved = t; return; }
  // (landed: no lower for a moment)
  if (t - (f.moved || f.at + 150) > 150) {
    p.zipFall = null;
    const dmg = fallDamage(f.top - pos[1], PLAYER.gravity);
    if (dmg > 0) { applyDamage(p, null, dmg, 'fall', 'fall', 1, null); broadcast({ t: 'sfx', s: 'land', p: pos.map(r2) }); }
  }
}

function cutZip(by) {
  const t = now();
  game.zipCut = true;
  game.zipCutAt = t;
  for (const q of players.values()) if (q.zip) zipOff(q, t, 'cut');
  sendGadgets();
  broadcast({ t: 'sfx', s: 'zipsnap', p: MAP.zip.cut });
  notify(`${by.name} cut the zip line`, false);
}

// Every tick: the riders move along (and drop off at the end); without rounds a cut cable is mended after a while.
function zipTick(t) {
  for (const p of players.values()) {
    if (!p.zip) continue;
    if (!p.alive) { p.zip = null; continue; }
    const r = zipNow(p, t);
    p.p = zipFeet(MAP.zip, r.s);
    if (r.done) zipOff(p, t, 'end');
  }
  if (game.zipCut && (game.phase === 'warmup' || isDM() || isGG()) && t - game.zipCutAt > ZIP.mend * 1000) { game.zipCut = false; sendGadgets(); }
}

// ---- CCTV: E at the security desk sits you down to watch the cameras (your browser draws the picture from them; 1-4
// or the mouse buttons switch, the mouse turns it). The server knows which camera you watch and where it's turned, so
// the enemies it sees go on your team's radar. E (or Esc in the browser) gets you up; so does being hurt. A camera
// breaks to one bullet or a blast (back each round, without rounds after CCTV.mend s); a jammer near one blinds it;
// the blackout turns them all off.
const camLive = i => game.lights.power !== false && !game.camsDown.has(i) && !jammedAt(MAP.cctv.cams[i].p);
const atDesk = p => !!MAP.cctv && Math.hypot(p.p[0] - MAP.cctv.seat[0], p.p[2] - MAP.cctv.seat[2]) < CCTV.reach && Math.abs(p.p[1] - MAP.cctv.floor) < 0.7;

function cctvOn(p) {
  if ([...players.values()].some(q => q !== p && q.cctv)) return send(p, { t: 'msg', text: 'Someone is already watching the cameras.' });
  p.cctv = { cam: 0, yaw: 0, pitch: 0, from: p.p.slice() };
  p.act = null;
  p.p = MAP.cctv.seat.slice();
  p.c = 1;
  p.history = [];
  send(p, { t: 'cctv', on: 1, cam: 0, p: p.p });
  broadcast({ t: 'sfx', s: 'cctvon', p: MAP.cctv.seat });
}

// Up from the desk (back where you stood when you sat down), or dead (no message then).
function cctvOff(p, why) {
  if (!p.cctv) return;
  const from = p.cctv.from;
  p.cctv = null;
  if (why === 'dead') return;
  p.p = from;
  p.c = 0;
  p.history = [];
  send(p, { t: 'cctv', off: 1, p: from, why });
}

// The watcher's browser: which camera, where it's turned (or 'off': Esc).
function onCctv(p, m) {
  if (!p.cctv) return;
  if (m.off) return cctvOff(p, 'left');
  if (Number.isInteger(m.cam) && m.cam >= 0 && m.cam < MAP.cctv.cams.length) p.cctv.cam = m.cam;
  if (isNum(m.yaw)) p.cctv.yaw = Math.max(-CCTV.pan, Math.min(CCTV.pan, m.yaw));
  if (isNum(m.pitch)) p.cctv.pitch = Math.max(-CCTV.tilt, Math.min(CCTV.tilt, m.pitch));
}

function breakCam(i, by) {
  if (game.camsDown.has(i)) return;
  game.camsDown.add(i);
  game.camDownAt[i] = now();
  sendGadgets();
  broadcast({ t: 'sfx', s: 'cambreak', p: MAP.cctv.cams[i].p });
  if (by) send(by, { t: 'msg', text: `Camera destroyed (${MAP.cctv.cams[i].name.toLowerCase()}).` });
}
function blastCams(at, r) {
  MAP.cctv?.cams.forEach((c, i) => { if (!game.camsDown.has(i) && dist3(c.p, at) < r && lineOfSight(at, c.p)) breakCam(i, null); });
}

// Every tick (Mansion): without rounds, broken cameras come back after a while.
function cctvTick(t) {
  if (!game.camsDown.size || !(game.phase === 'warmup' || isDM() || isGG())) return;
  const back = [...game.camsDown].filter(i => t - game.camDownAt[i] > CCTV.mend * 1000);
  if (!back.length) return;
  for (const i of back) game.camsDown.delete(i);
  sendGadgets();
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
  snapSlow = {}; // everything again in the next snapshot
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
    bleed.wound(target, dmg, 'claws', 'chest'); // blood trails: a scratch through the armor bleeds
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
  inTeam, enemies: (a, b) => !mates(a, b) && !b.playingDead /* body: bots take a "corpse" for dead */, mode: () => CFG.gameMode, mapMode: () => mapMode(MAP), phase: () => game.phase,
  canBuy: p => !canBuy(p, now()), buy: (p, id) => onBuy(p, id), use: p => onUse(p, { on: true }, now()),
  shoot: (p, m) => onShoot(p, m), nade: (p, m) => onNade(p, m), siteAt: pos => siteAt(MAP, pos),
  door: p => { const d = nearestDoor(p); return d && world.doorStates[d.i] === 0 ? d.i : null; },
  useDoor: (p, i) => useDoor(p, i), kill: p => killPlayer(p, null, 'world', false),
  doors: () => (MAP.doors || []).map((d, i) => ({ i, box: world.doorBoxes[i], open: world.doorStates[i] !== 0 })),
});
const bleed = createBlood({ players, now, send, sendMe, inTeam }); // blood trails (lib/blood.js)
// The mansion's cat (lib/cat.js, Mansion maps only): walks the bots' nav grid; scared by shots and blasts; sets off mines.
const cat = createCat({ map: () => MAP, world: () => world, nav: () => bots.nav(), players: () => players, game: () => game, now, broadcast, detonateMine: m => detonateMine(m) });
// shield: the human shield (lib/shield.js)
const shield = initShield({ players, game, now, send, broadcast, world: () => world, map: () => MAP });
// Disguise: a dead enemy's uniform (lib/disguise.js)
const disguise = createDisguise({ players, game, cfg: () => CFG, send, lineOfSight, eyeOf });
// body: "Downed, not dead" + "Play dead" (lib/body.js) gets what it needs
body.init({
  game, players, cfg: CFG, now, mapMode: () => mapMode(MAP), send, broadcast, sendMe, sendRoster, killPlayer, gibOf, mates, inTeam,
  spawnDrop, dropBomb, takeDrop, offsetPos, exitCar, loseDrone,
  busy, falling: p => !!p.zipFall, // (on the zip line or at the CCTV desk; falling off the zip line)
});
// body: going down or playing dead takes you off the zip line (you fall) and up from the CCTV desk
body.onDown(p => { if (p.zip) zipOff(p, now(), 'letgo'); if (p.cctv) cctvOff(p, 'hurt'); });
body.onPlayDead(p => { if (p.zip) zipOff(p, now(), 'letgo'); if (p.cctv) cctvOff(p, 'left'); });

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
  if (how.part === 'he' && ['rpg', 'rpg26', 'mortar', 'he', 'c4', 'car', 'mon50', 'satchel', 'drone'].includes(weapon)) return { k: 'blast', from: how.from.map(r2) };
  if (weapon === 'pmn' && how.part === 'legs') return { k: 'shot', part: 'legs', from: how.from.map(r2) };
  if (['awp', 'm249'].includes(weapon) || (hs && ['scout', 'deagle'].includes(weapon))) return { k: 'shot', part: how.part, from: how.from.map(r2) };
  return null;
}

function killPlayer(v, killer, weapon, hs, silent = false, how = null) {
  if (!v.alive) return;
  if (v.downed || v.playingDead) ({ killer, weapon, hs } = body.died(v, killer, weapon, hs, silent)); // body: who gets the kill
  v.alive = false;
  v.hp = 0;
  v.act = null;
  v.reloadUntil = 0;
  v.fl = 0;
  v.deathAt = now();
  if (v.driving != null || v.riding != null) releaseCar(v);
  if (v.zip) zipOff(v, now(), 'dead');
  v.zipFall = null;
  if (v.cctv) cctvOff(v, 'dead');
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
  disguise.onDeath(v, gib); // Disguise: the body is kept for the round; a disguise is lost
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
  body.hurt(v, attacker, weapon); // body: a hit wakes someone playing dead
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
  bleed.wound(v, d, weapon, part); // blood trails: the wound starts bleeding
  if (v.cctv && v.hp > 0) cctvOff(v, 'hurt'); // (hurt at the desk: you jump up)
  disguise.onHurt(v, attacker); // Disguise: a hit stops the changing; a hit from the fooled team gives you away
  if (v.bot) bots.hurt(v, attacker);
  send(v, { t: 'dmg', hp: Math.max(0, v.hp), armor: Math.round(v.armor), from: attacker && attacker !== v ? attacker.p : null, d });
  const killed = v.hp <= 0 && !body.tryDown(v, attacker, weapon, part, from); // body: downed, not dead
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
  const drop = { id: game.nextDropId++, w: item.id, mag: item.mag, res: item.res, p, owner: owner.id, until: now() + 1200 };
  game.drops.push(drop);
  return drop;
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
    if (p.playingDead) continue; // body: a "corpse" lies on its own weapons
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
  blastJammers(pos, 15);
  blastDrones(pos, 15);
}

function updateActions(t) {
  for (const p of players.values()) {
    const a = p.act;
    if (!a) continue;
    if (!p.alive || (game.phase !== 'live' && !((a.type === 'mine' || a.type === 'fuse' || a.type === 'satchel' || a.type === 'cut') && game.phase === 'warmup')) || dist2(p.p, a.pos) > 0.6) { p.act = null; continue; }
    if (a.type === 'disguise') { disguise.act(p, a, t); continue; } // Disguise: changing into a dead enemy's uniform
    if (a.type === 'fuse') {
      if (t - a.start >= a.dur) { p.act = null; setPower(!game.lights.power, p); }
      continue;
    }
    if (a.type === 'cut') {
      if (game.zipCut) p.act = null;
      else if (t - a.start >= a.dur) { p.act = null; cutZip(p); }
      continue;
    }
    if (a.type === 'satchel') {
      const s = game.satchels.find(x => x.id === a.satchel);
      if (!s) { p.act = null; continue; }
      if (t - a.start >= a.dur) {
        p.act = null;
        game.satchels.splice(game.satchels.indexOf(s), 1);
        sendSatchels();
        addMoney(p, SATCHEL.reward);
        sendMe(p);
        send(p, { t: 'msg', text: 'Satchel charge defused.' });
        send(p, { t: 'sfx', s: 'defused' });
      }
      continue;
    }
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
  if (body.use(p, t)) return; // body: revive a downed teammate (nothing to use from the floor)
  if (p.piloting != null) { const d = game.drones.find(x => x.id === p.piloting); if (d) loseDrone(d, 'released'); else p.piloting = null; return; }
  if (!p.alive || p.act) return;
  if (p.zip) { zipOff(p, t, 'letgo'); return; }
  if (p.cctv) { cctvOff(p, 'left'); return; }
  if (p.driving != null || p.riding != null) { exitCar(p); return; }
  if (shield.use(p, t)) return; // shield: a Terrorist grabs or lets go of a hostage; CTs can't lead a held one
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
  const chest = [p.p[0], p.p[1] + 1, p.p[2]];
  const sat = game.satchels.filter(x => !satchelFriend(x, p) && dist3(chest, x.p) < SATCHEL.reach).sort((x, y) => dist3(chest, x.p) - dist3(chest, y.p))[0];
  if (sat) {
    p.act = { type: 'satchel', satchel: sat.id, start: t, pos: p.p.slice(), dur: (p.kit ? SATCHEL.kitDefuse : SATCHEL.defuse) * 1000 };
    return;
  }
  if (atFuseBox(p) && (game.phase === 'live' || game.phase === 'warmup')) {
    // Terrorists cut the power (3 s), CTs bring it back (5 s)
    const off = game.lights.power === false;
    if (p.team === (off ? 'CT' : 'T')) { p.act = { type: 'fuse', start: t, pos: p.p.slice(), dur: off ? 5000 : 3000 }; return; }
    send(p, { t: 'msg', text: off ? 'The power is already off.' : 'The power is on. Only the Terrorists would cut it.' });
    return;
  }
  // the zip line: a Terrorist at the tensioner cuts it (3 s), anyone at either end hooks on (not bots)
  if (MAP.zip && !p.bot && game.phase !== 'freeze') {
    if (p.team === 'T' && atZipCut(p) && (game.phase === 'live' || game.phase === 'warmup')) {
      p.act = { type: 'cut', start: t, pos: p.p.slice(), dur: ZIP.cut * 1000 };
      broadcast({ t: 'sfx', s: 'zipsaw', p: MAP.zip.cut });
      return;
    }
    const st = zipStand(p);
    if (st) { zipOn(p, st, t); return; }
  }
  if (MAP.cctv && !p.bot && atDesk(p)) { cctvOn(p); return; }
  if (disguise.tryStart(p, t)) return; // Disguise: crouched over a dead enemy, hold E to put on their uniform
  const sw = nearestSwitch(p), door = nearestDoor(p);
  if (door && (!sw || door.dist < dist2(p.p, sw.p))) { useDoor(p, door.i); return; }
  if (sw && game.lights.power === false && MAP.fusebox.groups.includes(sw.group)) {
    send(p, { t: 'msg', text: 'No power — someone pulled the lever at the fuse box in the cellar.' });
    return;
  }
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
  if (!p.alive || game.phase === 'freeze' || p.piloting != null || busy(p)) return;
  if (bleed.busy(p)) return; // blood trails: no shooting while bandaging
  if (body.noFire(p, m.w)) return; // body: down (pistol only), playing dead, reviving
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
  if (shield.blocksShot(p, w, o, dirs)) return; // shield: a holder fires only his pistol; bots don't shoot through a held hostage

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
  if (!def.melee) disguise.reveal(p, 'shot'); // Disguise: a shot gives you away
  if (!def.melee) bots.heard(p, o);
  cat.shot(p, o, def.rocket ? [] : dirs, !!def.melee); // cat: a bullet throws it, gunfire scares it (a rocket: its blast)
  if (item) item.mag--;
  if (def.rocket) {
    launchRocket(p, o, dirs[0], def, w);
    // A disposable tube (RPG-26) is thrown away once fired: back to the pistol.
    if (def.disposable && p.inv.primary === item) { p.inv.primary = null; setTimeout(() => sendMe(p), 350); }
    return;
  }

  const range = def.melee ? def.range : 250;
  const traces = [];
  const hits = [];
  const ownCar = carOf(p)?.id ?? null;
  const shattered = [], chipped = [], jamHits = [], shotSatchels = [], shotDrones = [], shotCams = [];
  for (const d of dirs) {
    const wall = world.raycast(o, d, range, 'bullet', ownCar);
    const wallT = wall ? wall.t : range;
    let best = null;
    for (const q of players.values()) {
      if (q === p || !q.alive || !inTeam(q)) continue;
      if (!CFG.friendlyFire && mates(q, p)) continue;
      const st = rewind(q, m.rt);
      const hit = body.lying(q) ? body.rayBody(q, o, d, st.p, wallT) : rayPlayer(o, d, st.p, st.c, wallT, headScale()); // body: lying on the floor
      if (hit && (!best || hit.t < best.t)) best = { q, ...hit };
    }
    for (const h of game.hostages) {
      if (h.state === 'dead' || h.state === 'rescued') continue;
      if (h.heldBy != null) { const hit = shield.rayHostage(h, p, o, d, m.rt, best ? best.t : wallT); if (hit && (!best || hit.t < best.t)) best = { hostage: h, ...hit }; continue; } // shield: a held hostage's own hitboxes
      const hit = rayPlayer(o, d, h.p, false, best ? best.t : wallT);
      if (hit && (!best || hit.t < best.t)) best = { hostage: h, ...hit };
    }
    // Realism (cs_mansion): through a thin wall or a door, the bullet goes on with half its punch.
    if (!best && wall && MAP.realism && !def.melee && (wall.box.door != null || (wall.box.brk != null && Math.min(wall.box.max[0] - wall.box.min[0], wall.box.max[2] - wall.box.min[2]) <= REAL.thin))) {
      const b = wall.box;
      const exit = Math.min(...[0, 1, 2].filter(k => Math.abs(d[k]) > 1e-6).map(k => ((d[k] > 0 ? b.max[k] : b.min[k]) - o[k]) / d[k]));
      if (exit > wall.t && exit - wall.t < 1) {
        const o2 = [o[0] + d[0] * (exit + 0.01), o[1] + d[1] * (exit + 0.01), o[2] + d[2] * (exit + 0.01)];
        const wall2 = world.raycast(o2, d, range - exit, 'bullet', ownCar), far = wall2 ? wall2.t : range - exit;
        let beyond = null;
        for (const q of players.values()) {
          if (q === p || !q.alive || !inTeam(q)) continue;
          if (!CFG.friendlyFire && mates(q, p)) continue;
          const st = rewind(q, m.rt);
          const hit = body.lying(q) ? body.rayBody(q, o2, d, st.p, far) : rayPlayer(o2, d, st.p, st.c, far, headScale()); // body: lying on the floor
          if (hit && (!beyond || hit.t < beyond.t)) beyond = { q, ...hit };
        }
        if (beyond) hits.push({ ...beyond, t: beyond.t + exit, d, through: REAL.wallShot });
      }
    }
    const r3 = v => Math.round(v * 1000) / 1000;
    for (const j of game.jammers) {
      if (!CFG.friendlyFire && mates(p, j)) continue;
      if (rayAABB(o, d, [j.p[0] - 0.2, j.p[1], j.p[2] - 0.2], [j.p[0] + 0.2, j.p[1] + 0.5, j.p[2] + 0.2], best ? best.t : wallT)) jamHits.push(j);
    }
    traces.push([r3(d[0]), r3(d[1]), r3(d[2]), r2(best ? best.t : wallT), best ? 1 : 0, !best && wall ? 1 : 0]);
    if (best) hits.push({ ...best, d });
    else if (wall && wall.box.car != null && !def.melee) damageCar(world.cars[wall.box.car], def.damage * Math.pow(def.rangeMod, wall.t / 12.7), p);
    else if (wall && wall.box.door != null && MAP.doors[wall.box.door]?.weak) shootDoor(wall.box.door, def.melee ? def.damage * 2 : def.damage);
    else if (wall && wall.box.brk != null && BREAK.chip[w]) hurtPiece(MAP.breakables[wall.box.brk], def.damage * BREAK.chip[w], chipped);
    const endT = best ? best.t : wallT;
    if (!def.melee) for (const s of game.satchels) if (!shotSatchels.includes(s) && raySatchel(o, d, s, endT + 0.1)) shotSatchels.push(s);
    if (MAP.cctv && !def.melee) MAP.cctv.cams.forEach((c, i) => { if (!game.camsDown.has(i) && !shotCams.includes(i) && rayAABB(o, d, c.p.map(v => v - CCTV.hit), c.p.map(v => v + CCTV.hit), endT + 0.1)) shotCams.push(i); });
    for (const dr of game.drones) {
      if (shotDrones.includes(dr) || (!CFG.friendlyFire && mates(p, dr) && dr.owner !== p.id)) continue;
      if (rayAABB(o, d, dr.p.map(v => v - DRONE.hit), dr.p.map(v => v + DRONE.hit), endT + 0.1)) shotDrones.push(dr);
    }
    for (const g of world.intactGlass) {
      const gh = rayAABB(o, d, g.min, g.max, endT);
      if (gh) shattered.push(g.id);
    }
  }
  breakGlass(shattered);
  for (const j of jamHits) if (--j.hp <= 0) destroyJammer(j, p);
  breakPieces(chipped);
  for (const s of shotSatchels) explodeSatchel(s);
  for (const dr of shotDrones) hitDrone(dr, p);
  for (const i of shotCams) breakCam(i, p);

  if (def.melee && hits.some(h => h.q)) disguise.reveal(p, 'knife'); // Disguise: so does knifing someone
  broadcast({ t: 'shot', id: p.id, o, w, alt, tr: traces }, q => q !== p);
  if (!hits.length) return;
  const info = {};
  for (const h of hits) {
    if (h.hostage) {
      const dmg = def.melee ? (alt ? def.altDamage : def.damage) : def.damage * Math.pow(def.rangeMod, h.t / 12.7);
      hurtHostage(h.hostage, p, dmg * ({ head: 4, stomach: 1.25, legs: 0.75 }[h.part] ?? 1), w);
      shield.hostageHit(h.hostage, p); // shield: a CT who hits a held hostage is told so
      info.any = true;
      continue;
    }
    if (w === 'claws' && h.q.team === 'CT') clawHit(h.q, p, alt ? def.altDamage : def.damage);
    else if (def.melee) applyDamage(h.q, p, alt ? def.altDamage : def.damage, 'chest', w, def.pen, info);
    else if (CFG.party.headshotsOnly && h.part !== 'head') continue;
    else {
      const dealt = applyDamage(h.q, p, def.damage * Math.pow(def.rangeMod, h.t / 12.7) * (h.through ?? 1), h.part, w, def.pen, info, eyeOf(p));
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
function launchRocket(p, o, d, def, weapon = 'rpg') {
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
  broadcast({ t: 'rocket', id: game.nextNadeId++, o, d, dist: r2(dist), speed: def.rocketSpeed, owner: p.id, w: weapon });
  for (const g of world.intactGlass) {
    const gh = rayAABB(o, d, g.min, g.max, dist);
    if (gh) setTimeout(() => breakGlass([g.id]), (gh.t / def.rocketSpeed) * 1000);
  }
  setTimeout(() => { if (game.round === round) explodeRocket(at, p, def, weapon); }, flight);
}

// (Also the mortar's shell landing: weapon 'mortar'.)
function explodeRocket(at, owner, def, weapon = 'rpg') {
  const R = def.blast;
  const killsBefore = owner.kills;
  if (weapon === 'rpg') setTimeout(() => { if (owner.kills - killsBefore >= 2) unlockAch(owner, 'rpg_double'); }, 0);
  broadcast({ t: 'boom', p: at, k: weapon });
  blastMap(at, weapon);
  blastFire(at, owner, weapon);
  breakGlass(world.intactGlass.filter(g => dist3(at, [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2, (g.min[2] + g.max[2]) / 2]) < R * 0.7).map(g => g.id));
  for (const q of players.values()) {
    if (!q.alive) continue;
    if (q !== owner && mates(q, owner) && !CFG.friendlyFire) continue;
    const chest = [q.p[0], q.p[1] + 1.1, q.p[2]];
    const d = dist3(at, chest);
    if (d > R || !lineOfSight(at, chest)) continue;
    applyDamage(q, owner, def.damage * (1 - d / R), 'he', weapon, def.pen, null, at);
  }
  blastJammers(at, Math.max(JAMMER.blast, R * 0.6));
  blastDrones(at, Math.max(DRONE.blast, R * 0.6));
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
  if (!p.alive || game.phase === 'freeze' || p.w !== 'mortar' || busy(p)) return;
  if (bleed.busy(p)) return; // blood trails: no firing while bandaging
  const item = ownItem(p, 'mortar');
  if (!item || item.mag <= 0 || t - p.lastShot < def.rate * 1000 * 0.9) return;
  if (!isNum(m.b) || !isNum(m.e) || m.e < def.elev[0] - 1 || m.e > def.elev[1] + 1) return;
  const o = [p.p[0], p.p[1] + 0.9, p.p[2]];
  const sky = skyOf(MAP, world);
  // Under a breakable roof (and nothing else): the shell blasts its way out through it.
  const roof = sky.open(p.p) ? null : sky.roofOver(p.p);
  if (!sky.open(p.p) && !roof) return;
  p.lastShot = t;
  p.protectUntil = 0;
  disguise.reveal(p, 'shot'); // Disguise: firing a mortar gives you away
  item.mag--;
  sendMe(p);
  bots.heard(p, o);
  if (roof) breakPieces(roof, [p.p[0], p.p[1] + 1.2, p.p[2]]);
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
  if (p.team === 'CT' && jammedAt(p.p)) return send(p, { t: 'msg', text: JAM_MSG });
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
  clearJammers();
  clearSatchels();
  clearDrones();
  if (!game.mines?.length) return;
  game.mines = [];
  sendMines();
}

// Laying a mine: on the floor within reach in front of you, not on top of another one.
function onMine(p, m) {
  const t = now(), k = MINES.includes(m.k) ? m.k : null, pos = vec3(m.p);
  if (!k || !pos || !isNum(m.yaw) || !p.alive || p.inv[k] <= 0 || game.phase === 'freeze' || game.phase === 'end' || busy(p)) return;
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
  blastJammers(at, 3);
  blastDrones(at, 3);
}

// Mines near an explosion go off too (a moment later, one after another).
function chainMines(at, r) {
  for (const mine of game.mines.filter(x => dist3(x.p, at) < r)) setTimeout(() => detonateMine(mine), 120 + Math.random() * 200);
  for (const s of game.satchels.filter(x => dist3(x.p, at) < Math.max(r, SATCHEL.chain))) setTimeout(() => explodeSatchel(s), 150 + Math.random() * 200);
}

// ---- Satchel charge (see SATCHEL in shared/weapons.js). Thrown, it flies until it hits something and sticks there
// (on a car: in the car's own frame, so it rides along). Its owner's phone sets it off, in the same life only.
// Everyone sees it (it blinks); its owner's team (in Deathmatch only its owner) can't defuse it.
const satchelFriend = (s, q) => (isDM() ? q.id === s.owner : q.team === s.team);
// A car's frame: its position and yaw (a model turned by yaw about y, like the clients draw it).
const toCar = (c, v) => { const dx = v[0] - c.p[0], dz = v[2] - c.p[2], cs = Math.cos(c.yaw), sn = Math.sin(c.yaw); return [dx * cs - dz * sn, v[1] - c.p[1], dx * sn + dz * cs]; };
const fromCar = (c, l) => { const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw); return [c.p[0] + l[0] * cs + l[2] * sn, c.p[1] + l[1], c.p[2] - l[0] * sn + l[2] * cs]; };

// A row: [id, team (1 T, 2 CT), owner, owner's life (spawnSeq), x, y, z, normal x, y, z, car or -1] — on a car the
// position and the normal are in the car's frame.
function sendSatchels(to = null) {
  const list = game.satchels.map(s => [s.id, s.team === 'T' ? 1 : 2, s.owner, s.seq, ...(s.car != null ? s.local : s.p).map(r2), ...(s.car != null ? s.ln : s.n).map(r2), s.car ?? -1]);
  if (to) send(to, { t: 'satchels', list });
  else broadcast({ t: 'satchels', list });
}

function clearSatchels() {
  if (!game.satchels?.length) return;
  game.satchels = [];
  sendSatchels();
}

// Mouse1 with the satchel: thrown from o at v (m.o, m.v); with the phone (m.det): set off all of ours.
function onSatchel(p, m) {
  if (!p.alive || !inTeam(p) || busy(p)) return;
  if (m.det) {
    const mine = game.satchels.filter(s => s.owner === p.id && s.seq === p.spawnSeq);
    for (const s of mine) explodeSatchel(s);
    return;
  }
  if (!(p.inv.satchel > 0) || game.phase === 'freeze' || game.phase === 'end') return;
  const o = vec3(m.o), v = vec3(m.v);
  if (!o || !v || Math.hypot(...v) > SATCHEL.throw + 8 || dist3(o, eyeOf(p)) > 2.5) return;
  p.inv.satchel--;
  p.protectUntil = 0;
  disguise.reveal(p, 'nade'); // Disguise: so does throwing a satchel charge
  sendMe(p);
  // Fly it (gravity, no bounce) until it hits a wall, a door, the floor or a car body; windows it crosses break.
  const ownCar = carOf(p)?.id ?? null, dt = NADE.dt, pos = o.slice(), vel = v.slice();
  let hit = null, steps = 0;
  for (; steps < 240 && !hit; steps++) {
    vel[1] -= NADE.gravity * dt;
    const seg = vel.map(c => c * dt), len = Math.hypot(...seg), dir = seg.map(c => c / len);
    const h = world.raycast(pos, dir, len, 'bullet', ownCar);
    for (const g of world.intactGlass) if (rayAABB(pos, dir, g.min, g.max, h ? h.t : len)) breakGlass([g.id]);
    if (h) hit = { at: pos.map((c, k) => c + dir[k] * Math.max(0, h.t - 0.03)), n: h.n, box: h.box };
    else for (let k = 0; k < 3; k++) pos[k] += seg[k];
  }
  if (!hit) return; // (flew off the map)
  const flight = steps * dt * 1000, round = game.round, seq = p.spawnSeq;
  broadcast({ t: 'satchelThrow', o: o.map(r2), v: v.map(r2), at: hit.at.map(r2), ms: Math.round(flight) });
  setTimeout(() => {
    if (game.round !== round) return;
    const s = { id: game.nextMineId++, owner: p.id, seq, team: p.team, p: hit.at, n: hit.n, car: null };
    const car = hit.box.car != null ? world.cars[hit.box.car] : null;
    if (car && !car.wrecked) {
      s.car = hit.box.car;
      s.local = toCar(car, hit.at);
      s.ln = toCar({ p: [0, 0, 0], yaw: car.yaw }, hit.n);
    }
    const own = game.satchels.filter(x => x.owner === p.id);
    if (own.length >= SATCHEL.perPlayer) game.satchels.splice(game.satchels.indexOf(own[0]), 1);
    game.satchels.push(s);
    sendSatchels();
  }, flight);
}

// Each tick: the ones on a car move with it.
function updateSatchels() {
  for (const s of game.satchels) if (s.car != null && world.cars[s.car]) s.p = fromCar(world.cars[s.car], s.local);
}

// A bullet ray through a satchel (a small ball around it)?
function raySatchel(o, d, s, maxT) {
  const c = [s.p[0] - o[0], s.p[1] - o[1], s.p[2] - o[2]], t = c[0] * d[0] + c[1] * d[1] + c[2] * d[2];
  if (t < 0 || t > maxT) return false;
  return Math.hypot(c[0] - d[0] * t, c[1] - d[1] * t, c[2] - d[2] * t) < 0.2;
}

// Boom: about 1.5 HE grenades (people in sight of it, cars, hostages, glass), it breaks the mansion's walls and blows
// doors open, and sets off mines and other satchels nearby. Its owner gets the kills (also when someone shot it).
function explodeSatchel(s) {
  const i = game.satchels.indexOf(s);
  if (i < 0) return;
  game.satchels.splice(i, 1);
  sendSatchels();
  const owner = players.get(s.owner) || null, n = s.car != null && world.cars[s.car] ? fromCar({ p: [0, 0, 0], yaw: world.cars[s.car].yaw }, s.ln) : s.n;
  const at = [s.p[0] + n[0] * 0.15, s.p[1] + n[1] * 0.15, s.p[2] + n[2] * 0.15], R = SATCHEL.radius;
  broadcast({ t: 'boom', p: at.map(r2), k: 'satchel' });
  blastMap(at, 'satchel');
  // (On maps without realism blastMap doesn't touch doors: blow them open here.)
  if (!MAP.realism) (MAP.doors || []).forEach((d, k) => { if (doorReach(d, at) < REAL.door.satchel) blowDoor(k); });
  breakGlass(world.intactGlass.filter(g => dist3(at, [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2, (g.min[2] + g.max[2]) / 2]) < 6).map(g => g.id));
  for (const q of players.values()) {
    if (!q.alive || !inTeam(q)) continue;
    if (owner && q !== owner && mates(q, owner) && !CFG.friendlyFire) continue;
    const chest = [q.p[0], q.p[1] + 1.1, q.p[2]], d = dist3(at, chest);
    if (d > R || !lineOfSight(at, chest)) continue;
    applyDamage(q, owner, SATCHEL.damage * (1 - d / R), 'he', 'satchel', 1, null, at);
  }
  for (const h of game.hostages) {
    if (h.state === 'dead' || h.state === 'rescued') continue;
    const chest = [h.p[0], h.p[1] + 1.1, h.p[2]], d = dist3(at, chest);
    if (d < R && lineOfSight(at, chest)) hurtHostage(h, owner, SATCHEL.damage * (1 - d / R), 'satchel');
  }
  for (const c of world.cars) {
    const d = s.car === c.id ? 0 : dist3(at, [c.p[0], c.p[1] + 0.7, c.p[2]]);
    if (d < R * 0.6) damageCar(c, SATCHEL.car * (1 - d / (R * 0.6)), owner);
  }
  chainMines(at, MINE.chain);
  if (MAP.cctv) blastCams(at, CCTV.blast);
}

// ---- Signal jammer (Terrorists; see JAMMER in shared/weapons.js): a box with a blinking antenna, put down on the
// floor like a mine. Until the round ends or it's destroyed (JAMMER.hits bullets, or a blast), within JAMMER.radius
// metres: the CTs' radar shows static and they can't call in mortar targets or ping; nobody standing there is spotted
// onto a radar (see spots); drones flying in lose their signal (jammedAt). Everyone sees it and hears it hum.
const JAM_MSG = 'Signal jammed — no radar, pings or target calls here. Find the jammer (listen for the hum).';
function jammedAt(pos) {
  for (const j of game.jammers) if (dist3(j.p, pos) < JAMMER.radius) return true;
  return false;
}

function sendJammers(to = null) {
  const list = game.jammers.map(j => [j.id, j.team === 'T' ? 1 : 2, ...j.p.map(r2), r2(j.yaw)]);
  if (to) send(to, { t: 'jammers', list });
  else broadcast({ t: 'jammers', list });
}

function clearJammers() {
  game.jamUsed = {};
  if (!game.jammers.length) return;
  game.jammers = [];
  sendJammers();
}

function onJammer(p, m) {
  const pos = vec3(m.p);
  if (!pos || !isNum(m.yaw) || !p.alive || !(p.inv.jammer > 0) || game.phase === 'freeze' || game.phase === 'end' || busy(p)) return;
  if (Math.hypot(pos[0] - p.p[0], pos[2] - p.p[2]) > 2.5 || Math.abs(pos[1] - p.p[1]) > 1.5) return;
  const floor = world.raycast([pos[0], pos[1] + 0.4, pos[2]], [0, -1, 0], 1, 'solid');
  if (!floor || floor.t < 0.01) return send(p, { t: 'msg', text: 'Put the jammer down on the ground.' });
  pos[1] = pos[1] + 0.4 - floor.t;
  p.inv.jammer--;
  p.protectUntil = 0;
  game.jamUsed[p.team] = true;
  game.jammers.push({ id: game.nextMineId++, team: p.team, owner: p.id, p: pos, yaw: m.yaw, hp: JAMMER.hits });
  sendMe(p);
  sendJammers();
  notify('Signal jammer on — their radar is blind around it.', false, q => q.team === p.team && q !== p);
}

// Shot to pieces or caught in a blast. (Without rounds — warmup, Deathmatch, Gun Game — the team can buy another.)
function destroyJammer(j, by) {
  const i = game.jammers.indexOf(j);
  if (i < 0) return;
  game.jammers.splice(i, 1);
  if (game.phase === 'warmup' || isDM() || isGG()) delete game.jamUsed[j.team];
  sendJammers();
  broadcast({ t: 'jamdown', p: j.p.map(r2) });
  if (by) send(by, { t: 'msg', text: 'Signal jammer destroyed.' });
  notify('The signal jammer is down — the radar is back.', false, q => q.team === other(j.team));
}

function blastJammers(at, r) {
  if (MAP.cctv) blastCams(at, Math.max(CCTV.blast, r * 0.5)); // (every blast passes here: the cameras too)
  for (const j of [...game.jammers]) if (dist3(j.p, at) < r && lineOfSight(at, [j.p[0], j.p[1] + 0.3, j.p[2]])) destroyJammer(j, null);
}

// ---- FPV drone (Terrorists; see DRONE in shared/weapons.js). Launched with Mouse1, it's flown by its pilot's browser
// (which sends where it is, like a car's driver) while the pilot crouches with the remote and can't move or shoot.
// The server keeps the list, checks the battery, the signal (distance from the pilot, walls in between) and jammers,
// takes the bomb drop and the kamikaze dive's impact, shoots it down, and lets it fall when control is lost. Its
// camera spots enemies for the team's radar (see updateSpotting). Everyone sees it (the 'dn' part of the snapshot)
// and hears it buzz.
function onDrone(p, m, t) {
  const d = game.drones.find(x => x.owner === p.id && (x.state === 'fly' || x.state === 'dive'));
  if (m.launch) {
    const pos = vec3(m.p);
    if (!pos || !p.alive || !(p.inv.drone > 0) || d || game.phase === 'freeze' || game.phase === 'end' || busy(p) || dist3(pos, eyeOf(p)) > 1.5) return send(p, { t: 'droneEnd', why: 'nolaunch' });
    p.inv.drone--;
    const left = p.droneLeft ?? DRONE.battery * 1000;
    const nd = { id: game.nextMineId++, owner: p.id, team: p.team, p: pos, yaw: isNum(m.yaw) ? m.yaw : p.yaw, pitch: 0, state: 'fly', bomb: p.droneBomb ?? true, hp: p.droneHp ?? DRONE.hits, until: t + left, at: t, vy: 0 };
    p.droneLeft = null; p.droneBomb = null; p.droneHp = null;
    game.drones.push(nd);
    p.piloting = nd.id;
    p.act = null;
    send(p, { t: 'droneStart', id: nd.id, left, bomb: nd.bomb });
    sendMe(p);
    return;
  }
  if (!d) return;
  if (m.p) {
    // where the pilot's browser flew it: believed up to a sane speed
    const pos = vec3(m.p);
    if (!pos) return;
    const dt = Math.max(0.03, (t - d.at) / 1000);
    if (dist3(pos, d.p) > (d.state === 'dive' ? DRONE.dive * 1.5 : 20) * dt + 1) return;
    d.p = pos;
    d.at = t;
    if (isNum(m.yaw)) d.yaw = m.yaw;
    if (isNum(m.pitch)) d.pitch = Math.max(-1.5, Math.min(1.5, m.pitch));
  }
  if (m.drop && d.bomb && d.state === 'fly') dropDroneBomb(d, p);
  if (m.dive && d.state === 'fly') { d.state = 'dive'; broadcast({ t: 'sfx', s: 'dronedive', p: d.p }); }
  if (m.boom && d.state === 'dive') {
    const at = vec3(m.boom);
    explodeDrone(d, at && dist3(at, d.p) < 6 ? at : d.p);
  }
  if (m.release) loseDrone(d, 'released');
  if (m.land && d.state === 'fly') {
    // landed: back in the bag if it's by the pilot, otherwise lost
    removeDrone(d);
    if (dist3(d.p, p.p) < DRONE.pickup) {
      p.inv.drone = 1;
      p.droneLeft = Math.max(0, d.until - t);
      p.droneBomb = d.bomb;
      p.droneHp = d.hp;
      endPiloting(p, 'recovered');
    } else endPiloting(p, 'landed');
    sendMe(p);
  }
}

function removeDrone(d) {
  const i = game.drones.indexOf(d);
  if (i >= 0) game.drones.splice(i, 1);
}

function endPiloting(p, why) {
  if (!p || p.piloting == null) return;
  p.piloting = null;
  send(p, { t: 'droneEnd', why });
}

// Control lost (the battery, the signal, a jammer, the pilot let go or died): it drops out of the air.
function loseDrone(d, why) {
  if (d.state === 'fall') return;
  d.state = 'fall';
  d.vy = 0;
  endPiloting(players.get(d.owner), why);
}

// Shot down, or caught in a blast: it falls in pieces (it doesn't go off).
function downDrone(d, by, why = 'shot') {
  removeDrone(d);
  endPiloting(players.get(d.owner), why);
  broadcast({ t: 'droneDown', p: d.p.map(r2) });
  if (by && by.id !== d.owner) send(by, { t: 'msg', text: 'Drone shot down.' });
}

// A bullet: it takes DRONE.hits of them; until then each one sparks, and the drone smokes (hp in the snapshot).
function hitDrone(d, by) {
  if (--d.hp <= 0) return downDrone(d, by);
  broadcast({ t: 'droneHit', id: d.id, p: d.p.map(r2), hp: d.hp });
}

function blastDrones(at, r) {
  for (const d of [...game.drones]) if (dist3(d.p, at) < r && lineOfSight(at, d.p)) downDrone(d, null, 'blast');
}

// The bomb: dropped straight down (with the drone's way), it goes off where it lands — an HE grenade's blast.
function dropDroneBomb(d, p) {
  d.bomb = false;
  const o = [d.p[0], d.p[1] - 0.2, d.p[2]], v = [0, -1, 0];
  const path = [], end = simulateNade(world.nade(), o, v, WEAPONS.dronebomb.fuse, path, true);
  const id = game.nextNadeId++;
  game.nades.push({ id, k: 'he', owner: p.id, at: now() + path.length * NADE.dt * 1000, end });
  broadcast({ t: 'nade', id, k: 'dronebomb', o, v, owner: p.id });
}

// The kamikaze dive hits something: a blast stronger than an HE's.
function explodeDrone(d, at) {
  removeDrone(d);
  const owner = players.get(d.owner) || null, R = DRONE.radius;
  endPiloting(owner, 'exploded');
  broadcast({ t: 'boom', p: at.map(r2), k: 'drone' });
  blastMap(at, 'drone');
  if (!MAP.realism) (MAP.doors || []).forEach((dr, k) => { if (doorReach(dr, at) < REAL.door.drone) blowDoor(k); });
  breakGlass(world.intactGlass.filter(g => dist3(at, [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2, (g.min[2] + g.max[2]) / 2]) < 5).map(g => g.id));
  for (const q of players.values()) {
    if (!q.alive || !inTeam(q)) continue;
    if (owner && q !== owner && mates(q, owner) && !CFG.friendlyFire) continue;
    const chest = [q.p[0], q.p[1] + 1.1, q.p[2]], dd = dist3(at, chest);
    if (dd > R || !lineOfSight(at, chest)) continue;
    applyDamage(q, owner, DRONE.damage * (1 - dd / R), 'he', 'drone', 1, null, at);
  }
  for (const h of game.hostages) {
    if (h.state === 'dead' || h.state === 'rescued') continue;
    const chest = [h.p[0], h.p[1] + 1.1, h.p[2]], dd = dist3(at, chest);
    if (dd < R && lineOfSight(at, chest)) hurtHostage(h, owner, DRONE.damage * (1 - dd / R), 'drone');
  }
  for (const c of world.cars) {
    const dd = dist3(at, [c.p[0], c.p[1] + 0.7, c.p[2]]);
    if (dd < R * 0.7) damageCar(c, DRONE.car * (1 - dd / (R * 0.7)), owner);
  }
  chainMines(at, MINE.chain);
  blastJammers(at, JAMMER.blast);
  blastDrones(at, DRONE.blast * 1.5);
}

// Every tick: the battery, the signal, jammers, a pilot who died or left; falling drones fall and break.
function updateDrones(t) {
  for (const d of [...game.drones]) {
    const pilot = players.get(d.owner);
    if (d.state === 'fall') {
      const dt = Math.min(0.1, (t - d.at) / 1000);
      d.at = t;
      d.vy -= 20 * dt;
      const h = world.raycast(d.p, [0, -1, 0], -d.vy * dt + 0.2, 'move');
      if (h) { removeDrone(d); broadcast({ t: 'droneDown', p: [r2(d.p[0]), r2(d.p[1] - h.t + 0.1), r2(d.p[2])] }); continue; }
      d.p[1] += d.vy * dt;
      if (d.p[1] < -60) removeDrone(d);
      continue;
    }
    if (!pilot || !pilot.alive || pilot.piloting !== d.id) { loseDrone(d, 'pilot'); continue; }
    if (t >= d.until) { loseDrone(d, 'battery'); continue; }
    if (jammedAt(d.p)) { loseDrone(d, 'jammer'); continue; }
    const eye = eyeOf(pilot);
    if (droneSignal(dist3(eye, d.p), !lineOfSight(eye, d.p)) <= 0) { loseDrone(d, 'signal'); continue; }
    if (t - d.at > 3000) loseDrone(d, 'signal'); // (nothing heard from the pilot's browser)
  }
}

function clearDrones() {
  for (const d of game.drones) endPiloting(players.get(d.owner), 'round');
  game.drones = [];
  for (const p of players.values()) { p.piloting = null; p.droneLeft = null; p.droneBomb = null; p.droneHp = null; }
}

// Ghillie camouflage: switched on (H), you're hidden from enemies, except for a moment after each shot (see CAMO).
function updateCamo(t) {
  for (const p of players.values()) p.hidden = !!(p.camo && p.camoOn && p.alive && t - (p.lastShot || 0) >= CAMO.still * 1000);
}

// ---- Radar spotting (classic, Gun Game, Zombie): an enemy that anyone on a team can see — in their field of view,
// in line of sight from the eye to the body, not through smoke, a camouflaged one only within CAMO.botSees — is a red
// dot on that whole team's radar. Only the spotted enemies' positions go to the team (the "sp" part of the snapshot).
// Cheap: each viewer-enemy pair is looked at every SPOT.every ticks (staggered), only within SPOT.range metres, and
// a sighting lasts SPOT.keep ms so the dot doesn't flicker between checks.
const SPOT = { range: 70, fov: 0.95, every: 4, keep: 350 };
const spotOn = () => !isDM() && !isHNS();
const spotJson = { T: '[]', CT: '[]' };
let spotTick = 0;
function smokeBetween(a, b, t) {
  for (const s of game.smokes || []) {
    if (t >= s.until) continue;
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
    const k = Math.max(0, Math.min(1, ((s.p[0] - a[0]) * d[0] + (s.p[1] - a[1]) * d[1] + (s.p[2] - a[2]) * d[2]) / len2));
    if (Math.hypot(a[0] + d[0] * k - s.p[0], a[1] + d[1] * k - s.p[1], a[2] + d[2] * k - s.p[2]) < 3.2) return true;
  }
  return false;
}
// Can viewer v (a player, or any eye: { eye, yaw }) make out enemy e?
function spots(eye, yaw, e, t, fov = SPOT.fov) {
  const head = [e.p[0], e.p[1] + (e.c ? 0.8 : 1.6), e.p[2]], chest = [e.p[0], e.p[1] + (e.c ? 0.5 : 1.05), e.p[2]];
  const d = dist3(eye, head);
  if (d > SPOT.range) return false;
  if (e.hidden && d > CAMO.botSees) return false;
  if (jammedAt(e.p)) return false;
  if (d > 2) {
    const off = Math.atan2(-(e.p[0] - eye[0]), -(e.p[2] - eye[2])) - yaw;
    if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > fov) return false;
  }
  if (smokeBetween(eye, chest, t)) return false;
  return lineOfSight(eye, head) || lineOfSight(eye, chest);
}
function updateSpotting(t) {
  const seen = { T: [], CT: [] };
  if (spotOn()) {
    spotTick++;
    const list = [];
    for (const q of players.values()) if (q.alive && inTeam(q)) list.push(q);
    body.unspot(list); // body: a "corpse" is never spotted
    for (const v of list) {
      for (const e of list) {
        if (v.team === e.team || (v.id * 7 + e.id + spotTick) % SPOT.every) continue;
        if (spots(eyeOf(v), v.yaw, e, t)) (e.spotAt ||= {})[v.team] = t;
      }
    }
    // what a flying drone's camera sees counts for its team too
    for (const d of game.drones) {
      if (d.state === 'fall') continue;
      for (const e of list) {
        if (e.team === d.team || (d.id * 7 + e.id + spotTick) % SPOT.every) continue;
        if (spots(d.p, d.yaw, e, t, DRONE.fov)) (e.spotAt ||= {})[d.team] = t;
      }
    }
    // and what the camera someone watches at the CCTV desk sees (while it works)
    for (const v of list) {
      if (!v.cctv || !camLive(v.cctv.cam)) continue;
      const c = MAP.cctv.cams[v.cctv.cam], view = camView(c, v.cctv.yaw, v.cctv.pitch), fov = camHalfFov(c);
      for (const e of list) {
        if (e.team === v.team || (v.id * 5 + e.id + spotTick) % SPOT.every) continue;
        if (spots(c.p, view.yaw, e, t, fov)) (e.spotAt ||= {})[v.team] = t;
      }
    }
    for (const e of list) {
      const team = other(e.team);
      if (e.disguise === team) continue; // Disguise: in their uniform you're no red dot on their radar
      if (t - (e.spotAt?.[team] ?? -1e9) < SPOT.keep) seen[team].push([e.id, r2(e.p[0]), r2(e.p[2])]);
    }
  }
  spotJson.T = JSON.stringify(seen.T);
  spotJson.CT = JSON.stringify(seen.CT);
}

// A ping: the spot a player is looking at, marked with a "!" on their team's radar (in Deathmatch only on their own).
function onPing(p, m) {
  const t = now(), pos = vec3(m.p);
  if (p.team === 'CT' && jammedAt(p.p)) return send(p, { t: 'msg', text: JAM_MSG });
  if (!p.alive || !pos || t - (p.pingAt || 0) < PING.cooldown * 1000 || dist3(eyeOf(p), pos) > PING.range + 5) return;
  p.pingAt = t;
  const to = isDM() || !inTeam(p) ? [p] : [...players.values()].filter(q => q === p || mates(q, p));
  for (const q of to) send(q, { t: 'mark', p: pos.map(r2), by: p.id, name: p.name });
}

function onNade(p, m) {
  const k = GRENADES.includes(m.k) ? m.k : 'he';
  if (!p.alive || p.inv[k] <= 0 || game.phase === 'freeze' || p.piloting != null || busy(p)) return;
  if (bleed.busy(p)) return; // blood trails: no throwing while bandaging
  if (p.shield != null) return; // shield: no grenades while holding a hostage
  if (body.noFire(p, k)) return; // body: no throwing from the floor
  const o = vec3(m.o), v = vec3(m.v);
  if (!o || !v || Math.hypot(...v) > 30 || dist3(o, eyeOf(p)) > 2.5) return;
  p.inv[k]--;
  p.protectUntil = 0;
  disguise.reveal(p, 'nade'); // Disguise: a thrown grenade gives you away
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
  if (n.k !== 'he') cat.blast(o, n.k); // cat: a flashbang, smoke or a Molotov scares it too (an HE: see blastMap)
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
  if (n.k === 'he') { chainMines(o, MINE.chain); blastJammers(o, JAMMER.blast); blastDrones(o, DRONE.blast); }
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
  if (Math.hypot(pos[0] - f.p[0], pos[2] - f.p[2]) > (f.r ?? FIRE.radius)) return false;
  if (pos[1] < f.p[1] - 1 || pos[1] > f.p[1] + 1.4) return false;
  return lineOfSight([f.p[0], f.p[1] + 0.35, f.p[2]], [pos[0], f.p[1] + 0.35, pos[2]]);
}

// A blast on the ground (see BLAST_FIRE) leaves it burning; nothing below it (a rocket into a wall): no fire.
function blastFire(at, owner, weapon) {
  const F = BLAST_FIRE[weapon];
  if (!F) return;
  const h = world.raycast([at[0], at[1] + 0.2, at[2]], [0, -1, 0], 1.4, 'solid');
  if (!h) return;
  const t = now();
  const fire = { id: game.nextNadeId++, p: [at[0], at[1] + 0.2 - h.t, at[2]], owner: owner?.id ?? null, until: t + F.life * 1000, nextTick: t + FIRE.tick * 1000, round: game.round, r: F.r, w: weapon };
  game.fires.push(fire);
  broadcast({ t: 'fire', id: fire.id, p: fire.p.map(r2), life: F.life, r: F.r });
}

// Realism (cs_mansion): fire catches furniture, bookshelves and doors within reach; a burning piece burns down
// (and breaks), and its own fire spreads further. A door left standing in flames burns away.
// The floor a piece of furniture stands on (under the rest of it).
function floorUnder(pc) {
  const x = (pc.min[0] + pc.max[0]) / 2, z = (pc.min[2] + pc.max[2]) / 2;
  let y = pc.min[1] + 0.05;
  for (let i = 0; i < 8; i++) {
    const h = world.raycast([x, y, z], [0, -1, 0], 6, 'solid');
    if (!h) return pc.min[1];
    if (h.box.brk == null || !MAP.breakables[h.box.brk].fuel) return y - h.t;
    y = h.box.min[1] - 0.01;
  }
  return pc.min[1];
}

function spreadFire(f, t) {
  const B = REAL.burn, r = f.r ?? FIRE.radius;
  if (f.pieces) {
    const out = [];
    for (const id of f.pieces) if (!world.gone.has(id)) hurtPiece(MAP.breakables[id], B.dps, out);
    breakPieces(out);
  }
  if (game.fires.length < B.max) {
    for (const pc of piecesNear([f.p[0] - r - 0.5, f.p[1] - 0.5, f.p[2] - r - 0.5], [f.p[0] + r + 0.5, f.p[1] + 1.6, f.p[2] + r + 0.5])) {
      if (!pc.fuel || world.gone.has(pc.id) || game.burnt.has(pc.id)) continue;
      if (pc.min[1] > f.p[1] + 1.5 || pc.max[1] < f.p[1] - 0.3) continue;
      const cx = Math.max(pc.min[0], Math.min(f.p[0], pc.max[0])), cz = Math.max(pc.min[2], Math.min(f.p[2], pc.max[2]));
      if (Math.hypot(cx - f.p[0], cz - f.p[2]) > r + 0.4 || Math.random() > B.chance) continue;
      // the whole stack of it (a tall bookshelf is several chunks) burns in one fire
      const stack = MAP.breakables.filter(o => o.fuel && !world.gone.has(o.id) && !game.burnt.has(o.id) &&
        o.min[0] < pc.max[0] - 0.01 && o.max[0] > pc.min[0] + 0.01 && o.min[2] < pc.max[2] - 0.01 && o.max[2] > pc.min[2] + 0.01 && Math.abs(o.min[1] - pc.min[1]) < 3);
      for (const o of stack) game.burnt.add(o.id);
      const fire = {
        id: game.nextNadeId++, p: [(pc.min[0] + pc.max[0]) / 2, floorUnder(pc), (pc.min[2] + pc.max[2]) / 2],
        owner: f.owner, until: t + B.life * 1000, nextTick: t + FIRE.tick * 1000, round: game.round,
        r: Math.max(1, Math.min(2, Math.max(pc.max[0] - pc.min[0], pc.max[2] - pc.min[2]) / 2 + 0.5)), w: 'fire', pieces: stack.map(o => o.id),
      };
      game.fires.push(fire);
      broadcast({ t: 'fire', id: fire.id, p: fire.p.map(r2), life: B.life, r: fire.r });
      break; // one catch per tick
    }
  }
  (MAP.doors || []).forEach((d, i) => {
    if (world.doorStates[i] === GONE || d.roller || d.grate) return; // (steel doesn't burn)
    const c = doorCenter(d);
    if (Math.hypot(c[0] - f.p[0], c[2] - f.p[2]) > r + 0.6 || Math.abs(c[1] - 1.2 - f.p[1]) > 1.5) return;
    game.doorHeat[i] = (game.doorHeat[i] || 0) + FIRE.tick;
    if (game.doorHeat[i] >= B.door) blowDoor(i);
  });
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
    q.burnWeapon = 'molotov';
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
    if (MAP.realism) spreadFire(f, t);
    const owner = players.get(f.owner) || null;
    for (const q of players.values()) {
      if (!q.alive || !inFire(f, q.p)) continue;
      if (owner && q !== owner && mates(q, owner) && !CFG.friendlyFire) continue;
      q.burnUntil = t + FIRE.afterburn * 1000;
      q.burnBy = f.owner;
      q.burnFire = f.id;
      q.burnWeapon = f.w || 'molotov';
    }
    for (const h of game.hostages) {
      if (h.state !== 'dead' && h.state !== 'rescued' && inFire(f, h.p)) hurtHostage(h, owner, FIRE.dps * FIRE.tick, 'molotov');
    }
    for (const c of world.cars) {
      if (!c.wrecked && Math.hypot(c.p[0] - f.p[0], c.p[2] - f.p[2]) < (f.r ?? FIRE.radius) + 0.8 && Math.abs(c.p[1] - f.p[1]) < 1.5) {
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
    applyDamage(q, by, FIRE.dps * FIRE.tick, 'chest', q.burnWeapon || 'molotov', 1);
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
  if (body.noBuy(p)) return body.noBuy(p); // body: not while down or playing dead
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
  if ((MINES.includes(id) || id === 'camo' || id === 'jammer' || id === 'satchel' || id === 'drone') && isZM()) return fail('Not in Zombie mode.');
  if (id === 'jammer' && (game.jamUsed?.[p.team] || [...players.values()].some(q => q !== p && q.team === p.team && q.inv.jammer > 0))) {
    return fail('Your team already has its signal jammer this round.');
  }
  if (id === 'mortar') {
    // One mortar per team (in Deathmatch, one on the whole map); not against zombies.
    if (isZM()) return fail('There are no mortars in Zombie mode.');
    const holder = [...players.values()].find(q => q !== p && (isDM() || q.team === p.team) && q.inv.primary?.id === 'mortar');
    if (holder) return fail(isDM() ? `${holder.name} already has the mortar.` : `Your team already has a mortar (${holder.name}).`);
  }
  // The RPG-26 and the drone: one per team each round (in Deathmatch and warmup, one in anyone's hands at a time).
  if (wdef?.perTeam) {
    const free = isDM() || game.phase === 'warmup';
    const has = q => q.inv.primary?.id === id || q.inv[id] > 0 || (id === 'drone' && game.drones.some(d => d.owner === q.id && d.state !== 'fall'));
    if (free ? [...players.values()].some(has) : teamBought(p.team, id) >= wdef.perTeam) return fail(free ? `Somebody already has the ${wdef.name}.` : `Your team has already bought the ${wdef.name} this round.`);
  }
  let price = def.price;

  if (wdef && (wdef.grenade || wdef.mine || wdef.device || wdef.satchel)) {
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
  const record = { id, price, armor: p.armor, helmet: p.helmet, dropped: null };
  (p.buys ||= []).push(record);
  if (wdef?.perTeam) countTeamBuy(p.team, id, 1);
  if (wdef && (wdef.grenade || wdef.mine || wdef.device || wdef.satchel)) p.inv[id]++;
  else if (wdef) {
    const slot = slotKey(id);
    if (p.inv[slot]) {
      if (p.reloadUntil && p.reloadWeapon === p.inv[slot].id) p.reloadUntil = 0;
      if (!isDM()) record.dropped = spawnDrop(p, p.inv[slot], p.p, true);
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

// Items a team may buy only so many of each round (perTeam, the RPG-26): how many it has bought this round.
function teamBought(team, id) {
  return game.teamBuys?.round === game.round ? game.teamBuys[`${team}:${id}`] || 0 : 0;
}
function countTeamBuy(team, id, n) {
  if (game.teamBuys?.round !== game.round) game.teamBuys = { round: game.round };
  game.teamBuys[`${team}:${id}`] = Math.max(0, teamBought(team, id) + n);
}

// Selling back (right-click in the buy menu): something bought in this life, while you can still buy, for the full
// price — and the gun it replaced back in your hands if it's still lying where it fell.
function onSell(p, id) {
  const fail = text => send(p, { t: 'msg', text });
  const block = canBuy(p, now());
  if (block) return fail(block);
  const i = (p.buys || []).map(b => b.id).lastIndexOf(id);
  if (i < 0) return fail('You can only sell back what you bought this round.');
  const b = p.buys[i], wdef = WEAPONS[id];
  if (wdef && (wdef.grenade || wdef.mine || wdef.device || wdef.satchel)) {
    if (!(p.inv[id] > 0)) return fail('You don\'t have it any more.');
    p.inv[id]--;
  } else if (wdef) {
    const slot = slotKey(id);
    if (p.inv[slot]?.id !== id) return fail('You don\'t have it any more.');
    if (p.reloadUntil && p.reloadWeapon === id) p.reloadUntil = 0;
    const back = b.dropped && game.drops.indexOf(b.dropped);
    if (back != null && back >= 0) {
      const d = game.drops.splice(back, 1)[0];
      p.inv[slot] = { id: d.w, mag: d.mag, res: d.res };
    } else p.inv[slot] = slot === 'secondary' && inTeam(p) ? makeItem(defaultPistol(p.team)) : null;
  } else if (id === 'vest' || id === 'vesthelm') {
    p.armor = b.armor;
    p.helmet = b.helmet;
  } else if (id === 'kit') p.kit = false;
  else if (id === 'nvg') p.nvg = false;
  else if (id === 'camo') { p.camo = false; p.camoOn = false; }
  p.buys.splice(i, 1);
  if (wdef?.perTeam) countTeamBuy(p.team, id, -1);
  p.money += b.price;
  send(p, { t: 'sold', item: id });
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
  if (body.handle(p, m)) return; // body: play dead (K); a "corpse" doesn't move, emote or all-chat
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
      // On the zip line the server says where you are (hanging from the cable); after a fall off it, the landing hurts.
      if (p.zip) { p.p = zipFeet(MAP.zip, zipNow(p, t).s); p.yaw = m.yaw; p.pitch = m.pitch; p.c = 0; p.history.push({ t, p: p.p, c: 0 }); while (p.history[0].t < t - 1000) p.history.shift(); break; }
      // At the CCTV desk you sit on the chair facing the monitors.
      if (p.cctv) { p.p = MAP.cctv.seat.slice(); p.yaw = MAP.cctv.yaw; p.pitch = -0.3; p.c = 1; p.history.push({ t, p: p.p, c: 1 }); while (p.history[0].t < t - 1000) p.history.shift(); break; }
      if (p.zipFall) zipLanding(p, pos, t);
      if (!p.alive) break;
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
      if (p.piloting != null) { p.c = 1; p.w = 'drone'; } // (a drone's pilot crouches with the remote)
      p.history.push({ t, p: pos, c: p.c });
      while (p.history.length && p.history[0].t < t - 1000) p.history.shift();
      break;
    }
    case 'shoot':
      onShoot(p, m);
      break;
    case 'bloodBandage': // blood trails: P
      bleed.bandage(p, t);
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
    case 'jammer':
      onJammer(p, m);
      break;
    case 'satchel':
      onSatchel(p, m);
      break;
    case 'nade':
      onNade(p, m);
      break;
    case 'buy':
      onBuy(p, m.item);
      break;
    case 'drone':
      onDrone(p, m, t);
      break;
    case 'sell':
      onSell(p, m.item);
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
    case 'zip':
      if (m.off && p.zip) zipOff(p, t, 'letgo');
      break;
    case 'cctv':
      onCctv(p, m);
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
    case 'avatar':
      // the player's picture for the team bar: a small JPEG made in their browser
      if (typeof m.img === 'string' && m.img.startsWith('data:image/jpeg;base64,') && m.img.length < 24000) {
        p.avatar = m.img;
        broadcast({ t: 'avatar', id: p.id, img: m.img });
      }
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
      if (isNum(m.buf)) p.buf = Math.max(0, Math.min(999, Math.round(m.buf))); // their smoothing delay (see the scoreboard)
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
  if (MAP.mansion2) mansionTick(t);
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
  cat.tick(t); // the mansion's cat
  updateSatchels();
  if (game.drones.length) updateDrones(t);
  updateCamo(t);
  bleed.tick(t); // blood trails
  body.tick(t); // body: bleeding out, revives, playing dead
  disguise.tick(); // Disguise: breaking (3 m, plant/defuse, going down), losing it, the round's reset
  updateSpotting(t);
  // the time that really passed since the last tick: on Windows the timer fires every 31 or 47 ms rather than 33,
  // and moving by a fixed step made bots and hostages stutter on everyone's screen
  const dt = Math.min(0.1, Math.max(0.001, (t - (tick.prev ?? t - 1000 / CFG.tickRate)) / 1000));
  tick.prev = t;
  bots.update(dt);
  if (game.hostages.length) {
    for (const ev of updateHostages(game.hostages, players, dt, p => world.move(null, p, 2), t)) {
      if (ev.type === 'lost' && ev.leader) send(ev.leader, { t: 'msg', text: 'A hostage lost track of you!' });
    }
    for (const h of game.hostages) if (h.state === 'follow' && inRescueZone(MAP, h.p)) rescueHostage(h);
  }
  shield.update(t); // shield: held hostages go with their holders; holds end on death, a new round...

  for (let i = game.nades.length - 1; i >= 0; i--) {
    if (t >= game.nades[i].at) explodeNade(game.nades.splice(i, 1)[0]);
  }
  updateFires(t);

  // Snapshot
  const pl = [];
  for (const p of players.values()) {
    if (!inTeam(p)) continue;
    // (the last one: on a gadget — 1 hanging from the zip line, 2 at the CCTV desk)
    pl.push([p.id, r2(p.p[0]), r2(p.p[1]), r2(p.p[2]), r2(p.yaw), r2(p.pitch), p.c, p.w, p.alive ? 1 : 0, p.team === 'T' ? 1 : 2, p.fl ? 1 : 0, p.mo || 0, p.hidden ? 1 : 0, p.zip ? 1 : p.cctv ? 2 : 0]);
  }
  body.hidePl(pl); // body: someone playing dead is dead in the snapshot (their team learns the truth from "bd")
  const b = game.bomb;
  const head = JSON.stringify({
    t: 's',
    time: Math.round(t),
    ph: game.phase,
    tl: game.phase === 'warmup' || (isGG() && game.phase === 'live') ? -1 : Math.max(0, (game.phaseEnd - t) / 1000),
    el: Math.max(0, (t - game.roundStartAt) / 1000),
    pl,
    // drones: [id, owner, x, y, z, yaw, state (0 flying, 1 diving, 2 falling), bomb, hits it can still take]
    ...(game.drones.length ? { dn: game.drones.map(d => [d.id, d.owner, r2(d.p[0]), r2(d.p[1]), r2(d.p[2]), r2(d.yaw), d.state === 'dive' ? 1 : d.state === 'fall' ? 2 : 0, d.bomb ? 1 : 0, d.hp]) } : {}),
    ...bleed.snap(), // blood trails: who is bleeding, bl: [id, level, flags]
    ...cat.snap(), // cat: [x, y, z, yaw, state, purring] on the Mansion maps (see shared/cat.js)
    ...shield.snap(), // shield: sh: [[hostage id, holder id], ...] while someone holds a hostage
  }).slice(0, -1);
  // The parts that rarely change go out only when they do (and all of them to someone who has just joined); the
  // client keeps the last ones it got. The text is made once for everybody, not once per player.
  const slow = {
    sc: game.score,
    dr: game.drops.map(d => [d.id, d.w, r2(d.p[0]), r2(d.p[1]), r2(d.p[2])]),
    b: { s: b.state, p: b.p, tl: b.state === 'planted' ? Math.max(0, (b.explodeAt - t) / 1000) : 0 },
    hs: game.hostages.map(h => [h.id, r2(h.p[0]), r2(h.p[1]), r2(h.p[2]), r2(h.yaw), HOSTAGE_STATE[h.state], h.leader || 0]),
    cars: world.cars.map(c => [c.id, r2(c.p[0]), r2(c.p[1]), r2(c.p[2]), r2(c.yaw), r2(c.speed), r2(c.steer), c.driver || 0, Math.max(0, Math.round(c.hp)), c.riders[0] || 0, c.riders[1] || 0, c.wrecked ? 1 : 0]),
  };
  let all = '', changed = '';
  for (const [k, v] of Object.entries(slow)) {
    const s = `,"${k}":${JSON.stringify(v)}`;
    all += s;
    if (s !== snapSlow[k]) { changed += s; snapSlow[k] = s; }
  }
  for (const p of players.values()) {
    if (p.ws.readyState !== 1) continue;
    const me = p.act ? JSON.stringify({ a: p.act.type, pr: Math.min(1, (t - p.act.start) / p.act.dur) }) : 'null';
    // (the enemies the player's team has spotted: only to that team)
    const sp = inTeam(p) && spotOn() ? ',"sp":' + (p.team === 'CT' && p.alive && jammedAt(p.p) ? '[]' : spotJson[p.team]) : '';
    // Disguise: the fooled team's copy shows a disguised player as the dead one; "dg" is the wearer's own team's
    p.ws.send(disguise.headFor(p, head, pl) + (p.gotSnap ? changed : all) + sp + disguise.snapKey(p) + body.snap(p) + ',"me":' + me + '}'); // body: + "bd"
    p.gotSnap = true;
  }
}
let snapSlow = {}; // what the last snapshot said about each slow part (see tick)

// The tick loop keeps to a fixed beat (start + n × 31.25 ms) instead of "31.25 ms after the last one", so timer
// delays don't add up.
function runTick() {
  if (!env.DEBUG_TICK) return tick();
  const t0 = performance.now();
  tick();
  const ms = performance.now() - t0;
  tick.sum = (tick.sum || 0) + ms; tick.n = (tick.n || 0) + 1; tick.max = Math.max(tick.max || 0, ms);
  if (tick.n >= 150) { console.log(`  [tick] avg ${(tick.sum / tick.n).toFixed(2)} ms, max ${tick.max.toFixed(1)} ms`); tick.sum = tick.n = tick.max = 0; }
}
let nextTick = performance.now();
(function beat() {
  runTick();
  const t = performance.now();
  nextTick += 1000 / CFG.tickRate;
  if (t - nextTick > 250) nextTick = t; // fell far behind (the PC was asleep): don't race to catch up
  setTimeout(beat, Math.max(0, nextTick - t - 1));
})();
setInterval(() => broadcast({ t: 'ping', ts: now() }), 2000);
// Debugging performance: PROFILE_MS=60000 PROFILE_OUT=server.cpuprofile records a CPU profile of the first minute
// (open it in Chrome DevTools); with DEBUG_TICK, every stall of the event loop over 15 ms is reported.
if (env.PROFILE_MS) {
  import('node:inspector').then(({ Session }) => {
    const s = new Session();
    s.connect();
    s.post('Profiler.enable', () => s.post('Profiler.start', () => setTimeout(() => s.post('Profiler.stop', (e, r) => {
      fs.writeFileSync(env.PROFILE_OUT || 'server.cpuprofile', JSON.stringify(r.profile));
      console.log('  [profile] written');
    }), +env.PROFILE_MS)));
  });
}
if (env.DEBUG_TICK) {
  let last = performance.now();
  setInterval(() => {
    const t = performance.now(), lag = t - last - 10;
    if (lag > 15) console.log(`  [lag] event loop blocked ${lag.toFixed(0)} ms`);
    last = t;
  }, 10);
}
setInterval(sendRoster, 2000);
// When the same laptop runs the server and a game in the browser, the server should win: a late tick is late for
// everyone.
try { os.setPriority(os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* not allowed here: fine */ }
setInterval(sendTeamBar, 250);
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
  const sprayImgs = {}, avatars = {};
  for (const q of players.values()) if (q.sprayImg) sprayImgs[q.id] = q.sprayImg;
  for (const q of players.values()) if (q.avatar) avatars[q.id] = q.avatar;
  send(p, {
    t: 'welcome', id: p.id, build: BUILD, map: MAP.id, mode: mapMode(MAP), maps: MAP_IDS.map(id => ({ id, title: MAPS[id].title })),
    cfg: { ...settingsView(), zombieCountdown: ZOMBIE.countdown, hnsHide: CFG.hnsHide, gameMode: CFG.gameMode, autoBalance: CFG.autoBalance, halftime: CFG.halftime, startMoney: CFG.startMoney, startMoneyChoices: START_MONEY_CHOICES, roundsToWin: CFG.roundsToWin, roundTime: CFG.roundTime, buyTime: CFG.buyTime, freezeTime: CFG.freezeTime, plantTime: CFG.plantTime, friendlyFire: CFG.friendlyFire, httpsPort: httpsReady ? CFG.httpsPort : null },
    sprayImgs, avatars, sprays: [...game.sprays.values()], glass: [...world.broken], brk: [...world.gone], lights: game.lights, doors: world.doorStates,
  });
  sendMines(p);
  sendJammers(p);
  sendSatchels(p);
  sendGadgets(p);
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
  openJoinPage(httpsReady ? `https://${ips[0] || 'localhost'}:${CFG.httpsPort}` : `http://${ips[0] || 'localhost'}:${CFG.port}`);
});

// The players' join page (a page on claude.ai whose address is kept in data/join-page.txt): on start, copy the
// game's link and open that page, where the host pastes it once (Ctrl+V) and everyone's Join button follows.
function openJoinPage(link) {
  let page = '';
  try { page = fs.readFileSync(path.join(DATA_DIR, 'join-page.txt'), 'utf8').trim(); } catch { /* not set up */ }
  if (!/^https:\/\/\S+$/.test(page) || process.platform !== 'win32') return;
  const clip = spawn('clip', { stdio: ['pipe', 'ignore', 'ignore'] });
  clip.on('error', () => {});
  clip.stdin.end(link);
  spawn('cmd', ['/c', `start "" "${page}"`], { stdio: 'ignore', detached: true, windowsVerbatimArguments: true }).on('error', () => {}).unref();
  console.log(`  Join page opened, link copied: press Ctrl+V there to update it for everyone\n    ${page}\n`);
}
