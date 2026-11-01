// Server-side bots. A bot is an ordinary player entry (it buys, shoots, plants and dies through the same code
// as everyone else) whose inputs come from a small brain instead of a browser:
//   - it walks the map along paths from the nav grid (lib/nav.js), jumping, ducking and climbing ladders,
//   - it sees enemies in front of it that aren't behind walls or smoke, reacts after a short delay and aims
//     with a little error (both depend on the difficulty), and hears gunfire and being shot,
//   - it plays the objective of the mode: plants or defuses the bomb, rescues or guards hostages, hunts,
//     infects (as a zombie), hides or seeks.
import { PLAYER, NADE, movePlayer, overlapsAny, ladderAt, ladderPull, rayAABB } from '../shared/physics.js';
import { WEAPONS, availableTo, slotKey, MINE, CAMO } from '../shared/weapons.js';
import { Worker } from 'worker_threads';
import { navFrom } from './nav.js';

// react: ms before the first shot at a new target; aim: aiming error (radians); turn: rad/s;
// fov: field of view (radians); head: chance to aim for the head; strafe: chance to strafe in a fight;
// burst: shots before a pause at range; nade: chance to throw a grenade at someone; spot: how far it sees (m).
export const BOT_LEVELS = {
  easy: { react: 650, aim: 0.045, turn: 4.5, fov: 1.75, head: 0.1, strafe: 0, burst: 3, nade: 0.08, spot: 45 },
  normal: { react: 380, aim: 0.024, turn: 8, fov: 2.1, head: 0.25, strafe: 0.5, burst: 5, nade: 0.18, spot: 65 },
  hard: { react: 200, aim: 0.011, turn: 14, fov: 2.4, head: 0.45, strafe: 1, burst: 8, nade: 0.3, spot: 90 },
};

const NAMES = ['Albert', 'Allen', 'Bert', 'Bob', 'Cecil', 'Clarence', 'Elliot', 'Elmer', 'Ernie', 'Eugene', 'Fergus', 'Ferris',
  'Frank', 'Frasier', 'Fred', 'George', 'Graham', 'Harvey', 'Irwin', 'Lester', 'Marvin', 'Neil', 'Niles', 'Oliver', 'Opie',
  'Quentin', 'Ricky', 'Ringo', 'Sam', 'Shark', 'Steve', 'Ted', 'Vinny', 'Walter', 'Yanni', 'Zach'];

const PRIMARY = {
  T: ['ak47', 'ak47', 'ak47', 'ak47', 'galil', 'galil', 'sg552', 'awp', 'scout', 'g3sg1', 'm249', 'mp5', 'p90', 'ump45', 'mac10', 'm3', 'xm1014'],
  CT: ['m4a1', 'm4a1', 'm4a1', 'm4a1', 'famas', 'famas', 'aug', 'awp', 'scout', 'sg550', 'm249', 'mp5', 'p90', 'ump45', 'tmp', 'm3', 'xm1014', 'rpg'],
};
const PISTOLS = { T: ['deagle', 'deagle', 'p228', 'elite'], CT: ['deagle', 'deagle', 'p228', 'fiveseven'] };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
const aimDir = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];

function spreadDir(d, s) {
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

// Does the segment a-b pass through a sphere (a smoke cloud)?
function segSphere(a, b, c, r) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
  const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * d[0] + (c[1] - a[1]) * d[1] + (c[2] - a[2]) * d[2]) / len2));
  return Math.hypot(a[0] + d[0] * t - c[0], a[1] + d[1] * t - c[1], a[2] + d[2] * t - c[2]) < r;
}

// api: the server's state and actions (see server.js, `bots = new BotManager({...})`).
export class BotManager {
  constructor(api) {
    this.api = api;
    this.navs = new Map();
    this.pending = new Set();
    this.plan = { round: -1 };
  }

  // The current map's navigation grid, or null while it is still being built (the bots wait).
  nav() {
    const id = this.api.map().id;
    const nav = this.navs.get(id);
    if (!nav) this.prepare([id]);
    return nav || null;
  }

  // Build the grids for these maps in the background, one after another. A second worker finds the paths.
  prepare(ids) {
    if (!this.builder) {
      const worker = () => {
        const w = new Worker(new URL('./navworker.js', import.meta.url));
        w.unref();
        w.on('error', e => console.warn('  Bot navigation worker failed:', e.message));
        return w;
      };
      this.builder = worker();
      this.finder = worker();
      this.waiting = new Map(); // path request -> player id
      this.reqId = 0;
      this.builder.on('message', m => {
        this.pending.delete(m.id);
        if (m.error) { console.warn(`  Bot navigation for ${m.id} failed:`, m.error); return; }
        this.finder.postMessage({ t: 'nav', id: m.id, data: m.data });
        this.navs.set(m.id, navFrom(m.data));
        if (process.env.DEBUG_BOTS) console.log(`  Bot navigation for ${m.id}: ${m.data.count} spots (${m.data.ms} ms)`);
      });
      this.finder.on('message', m => this.gotPath(m));
    }
    for (const id of ids) {
      if (this.navs.has(id) || this.pending.has(id)) continue;
      this.pending.add(id);
      this.builder.postMessage({ t: 'build', id });
    }
  }

  findPath(p, b, nav, from, to) {
    b.pathReq = ++this.reqId;
    this.waiting.set(b.pathReq, p.id);
    this.finder.postMessage({ t: 'path', req: b.pathReq, id: nav.map, from, to, standing: b.goalWhy === 'rescue', why: b.goalWhy });
  }

  gotPath(m) {
    const p = this.api.players().get(this.waiting.get(m.req));
    this.waiting.delete(m.req);
    const b = p?.bot;
    if (!b || b.pathReq !== m.req) return; // the bot moved on to something else meanwhile
    b.pathReq = 0;
    const t = this.api.now();
    if (!m.pts) {
      // No way there from here: give up on that goal, and after a few failures just walk somewhere for a moment.
      b.goal = -1;
      if (++b.fails > 2) { const a = Math.random() * Math.PI * 2; b.wander = { d: [Math.sin(a), Math.cos(a)], until: t + 1200 }; b.fails = 0; }
      return;
    }
    b.fails = 0;
    b.path = m.pts;
    b.pi = 1;
    b.repathAt ||= t + 8000;
    b.stuckAt = t + 1200; // give it a moment to get going before calling it stuck
    b.stuckPos = p.p.slice();
  }

  name(taken) {
    const used = new Set(taken);
    const free = NAMES.filter(n => !used.has(`BOT ${n}`));
    return `BOT ${free.length ? pick(free) : pick(NAMES) + Math.floor(rnd(2, 99))}`;
  }

  brain() {
    return {
      v: [0, 0, 0], onGround: true, crouch: false, jumpCrouch: false,
      path: null, pi: 0, goal: -1, goalAt: 0, goalWhy: '', repathAt: 0, holdUntil: 0, holdYaw: null,
      target: null, reactAt: 0, lastSeen: null, lastSeenAt: 0, aimHead: false, err: [0, 0], errAt: 0,
      nextShot: 0, burst: 0, pauseUntil: 0, strafe: 1, strafeAt: 0, crouchFight: false, nadeTried: false,
      blindUntil: 0, alert: null, alertUntil: 0, stuckAt: 0, stuckPos: null, stuck: 0, boughtRound: -1, buyAt: 0,
      lookAt: null, startAt: 0, used: 0, nextLook: 0, lastFire: 0, fails: 0, wander: null, hostage: null,
    };
  }

  level() {
    return BOT_LEVELS[this.api.cfg().bots.difficulty] || BOT_LEVELS.hard;
  }

  onSpawn(p) {
    const b = p.bot, t = this.api.now();
    Object.assign(b, { v: [0, 0, 0], onGround: true, crouch: false, path: null, goal: -1, target: null, lastSeen: null,
      holdUntil: 0, holdYaw: null, stuck: 0, hostage: null, stuckAt: t + 1000, stuckPos: p.p.slice(), buyAt: t + rnd(150, 900), startAt: t + rnd(0, 2500),
      nadeTried: false, blindUntil: 0, alert: null });
  }

  // Someone fired a gun: enemy bots within earshot turn towards the sound.
  heard(shooter, pos) {
    const t = this.api.now();
    for (const p of this.api.players().values()) {
      if (!p.bot || !p.alive || p === shooter || !this.api.enemies(p, shooter)) continue;
      if (dist3(p.p, pos) > 32 || p.bot.target) continue;
      p.bot.alert = shooter.id;
      p.bot.alertUntil = t + 2500;
      p.bot.lookAt = pos.slice();
    }
  }

  hurt(p, attacker) {
    if (!attacker || attacker === p) return;
    p.bot.alert = attacker.id;
    p.bot.alertUntil = this.api.now() + 3000;
    if (!p.bot.target) p.bot.lookAt = attacker.p.slice();
  }

  flashed(p, amount, dur) {
    if (amount > 0.3) p.bot.blindUntil = this.api.now() + dur * 1000 * amount;
  }

  // ---------------------------------------------------------------- per tick
  update(dt) {
    const api = this.api, t = api.now(), game = api.game();
    let nav = null;
    if (process.env.DEBUG_BOTS && t > (this.debugAt || 0)) {
      this.debugAt = t + (+process.env.DEBUG_BOTS > 1 ? +process.env.DEBUG_BOTS : 5000);
      for (const p of api.players().values()) if (p.bot && p.alive && (!process.env.DEBUG_BOT_TEAM || p.team === process.env.DEBUG_BOT_TEAM)) {
        const b = p.bot;
        console.log(`  [bot] ${p.name} ${p.team} at ${p.p.map(v => v.toFixed(1))} goal ${b.goalWhy}:${b.goal >= 0 ? this.nav().pos(b.goal).map(v => v.toFixed(1)) : '-'} path ${b.path ? b.pi + '/' + b.path.length : '-'} wp ${b.wantMove ? b.wantMove.p.map(v => v.toFixed(1)) + (b.wantMove.jump ? ' J' : '') + (b.wantMove.ladder ? ' L' : '') : '-'} v ${b.v.map(v => v.toFixed(1))} g ${b.onGround ? 1 : 0} c ${b.crouch ? 1 : 0} stuck ${b.stuck} target ${b.target ?? '-'} h ${b.hostage}`);
      }
    }
    for (const p of api.players().values()) {
      if (!p.bot || !p.alive || !api.inTeam(p)) continue;
      nav ||= this.nav();
      if (!nav) return;
      if (this.plan.round !== game.round) this.newPlan();
      const b = p.bot;
      if (game.phase === 'freeze' || game.phase === 'warmup' || api.mode() === 'deathmatch') this.buy(p, t);
      const frozen = game.phase === 'freeze' || game.phase === 'end' || (api.mode() === 'hns' && p.team === 'CT' && t < game.hideUntil);
      const t1 = performance.now();
      this.think(p, b, nav, t, frozen);
      const t2 = performance.now();
      this.move(p, b, nav, dt, t, frozen);
      const t3 = performance.now();
      if (process.env.DEBUG_TICK && t3 - t1 > 50) console.log(`  [slow] ${p.name} think ${(t2 - t1).toFixed(0)} ms move ${(t3 - t2).toFixed(0)} ms goal ${b.goalWhy} at ${p.p.map(v => v.toFixed(1))} target ${b.target} path ${b.path?.length}`);
      p.history.push({ t, p: p.p.slice(), c: p.c });
      while (p.history.length && p.history[0].t < t - 1000) p.history.shift();
    }
  }

  // Round plan for the bomb map: which site the Terrorists go for, and which site each CT watches.
  newPlan() {
    const game = this.api.game();
    this.plan = { round: game.round, site: Math.random() < 0.5 ? 'A' : 'B', ct: new Map() };
    let i = Math.floor(Math.random() * 2);
    for (const p of this.api.players().values()) if (p.bot && p.team === 'CT') this.plan.ct.set(p.id, i++ % 2 ? 'A' : 'B');
  }

  // ---------------------------------------------------------------- buying
  buy(p, t) {
    const api = this.api, b = p.bot, game = api.game();
    const key = api.mode() === 'deathmatch' ? `${game.round}:${p.spawnSeq}` : `${game.round}:${game.phase === 'warmup' ? p.spawnSeq : ''}`;
    if (b.boughtRound === key || t < b.buyAt) return;
    b.boughtRound = key;
    if (!api.canBuy(p)) return;
    const team = p.team, money = () => (api.mode() === 'deathmatch' ? 99999 : p.money);
    const tryBuy = id => { if (availableTo(id, team)) api.buy(p, id); };
    if (!p.inv.primary) {
      // Any gun the team can buy, mostly rifles when there's money for one (an RPG only now and then).
      const budget = money() - (p.armor < 100 ? 1000 : 0);
      let list = PRIMARY[team].filter(id => WEAPONS[id].price <= budget && (id !== 'rpg' || Math.random() < 0.15));
      const rifles = list.filter(id => ['rifle', 'sniper', 'mg', 'launcher'].includes(WEAPONS[id].cls));
      if (rifles.length && Math.random() < 0.85) list = rifles;
      if (list.length) tryBuy(pick(list));
    }
    if (p.armor < 100 || !p.helmet) tryBuy(money() >= 1000 ? 'vesthelm' : 'vest');
    if (!p.inv.primary && money() >= 650 && p.inv.secondary?.id !== 'deagle') tryBuy(pick(PISTOLS[team]));
    if (money() >= 300 && Math.random() < 0.6) tryBuy('he');
    if (money() >= 400 && Math.random() < 0.3) tryBuy('molotov');
    if (team === 'CT' && api.mapMode() === 'bomb' && money() >= 200 && Math.random() < 0.5) tryBuy('kit');
  }

  // ---------------------------------------------------------------- senses
  eye(p) { return [p.p[0], p.p[1] + (p.c ? PLAYER.crouchEye : PLAYER.eye), p.p[2]]; }

  canSee(p, q, t, lv) {
    if (q.disguise === p.team) return null; // Disguise: in our own team's uniform, so not a target until it breaks
    const eye = this.eye(p);
    const aims = [[q.p[0], q.p[1] + (q.c ? 0.8 : 1.6), q.p[2]], [q.p[0], q.p[1] + (q.c ? 0.5 : 1.05), q.p[2]]];
    const d = dist3(eye, aims[0]);
    if (d > lv.spot) return null;
    if (q.hidden && d > CAMO.botSees) return null; // a camouflaged player keeping still
    if (d > 2.5 && !(p.bot.alert === q.id && t < p.bot.alertUntil) && p.bot.target !== q.id) {
      const off = Math.abs(wrap(yawTo(p.p, q.p) - p.yaw));
      if (off > lv.fov / 2) return null;
    }
    for (const s of this.api.game().smokes || []) if (t < s.until && segSphere(eye, aims[0], s.p, 3.2)) return null;
    const world = this.api.world();
    for (const a of aims) {
      const dir = [a[0] - eye[0], a[1] - eye[1], a[2] - eye[2]];
      const len = Math.hypot(...dir);
      const hit = world.raycast(eye, dir.map(v => v / len), len, 'bullet');
      if (!hit || hit.t >= len - 0.25) return a;
    }
    return null;
  }

  // The nearest enemy in sight (sticking with the current one while it stays visible).
  look(p, b, t, lv) {
    if (t < b.blindUntil) { b.target = null; return null; }
    const api = this.api;
    // Eyes are checked ten times a second; in between the bot keeps its last target.
    if (t < b.nextLook) {
      const q = b.target != null ? api.players().get(b.target) : null;
      return q && q.alive ? q : null;
    }
    b.nextLook = t + 100;
    const cur = b.target != null ? api.players().get(b.target) : null;
    if (cur && cur.alive && api.enemies(p, cur) && this.canSee(p, cur, t, lv)) return cur;
    let best = null, bd = Infinity;
    for (const q of api.players().values()) {
      if (q === p || !q.alive || !api.inTeam(q) || !api.enemies(p, q)) continue;
      const d = dist3(p.p, q.p);
      if (d < bd && this.canSee(p, q, t, lv)) { bd = d; best = q; }
    }
    if (best && best.id !== b.target) {
      b.target = best.id;
      b.reactAt = t + lv.react * rnd(0.8, 1.3) + (b.alert === best.id ? -lv.react * 0.4 : 0);
      b.aimHead = Math.random() < lv.head;
      b.nadeTried = false;
      b.burst = 0;
    }
    if (!best) b.target = null;
    return best;
  }

  // ---------------------------------------------------------------- decisions
  think(p, b, nav, t, frozen) {
    const api = this.api, lv = this.level(), game = api.game();
    const enemy = frozen ? null : this.look(p, b, t, lv);
    b.wantMove = null;
    b.wantCrouch = false;
    if (enemy) {
      b.lastSeen = enemy.p.slice();
      b.lastSeenAt = t;
      this.fight(p, b, enemy, t, lv);
      return;
    }
    this.weapon(p, null);
    this.reload(p, t, false);
    if (frozen) { this.turnTo(p, b.holdYaw ?? p.yaw, 0, lv, t); return; }
    if (t < b.startAt) return;
    // Doing something on the spot (planting, defusing): stay still and keep watch.
    if (p.act) { this.glance(p, b, t, lv); return; }
    // Heard or got shot from somewhere: look there, and go and check it out.
    if (b.lookAt && t < b.alertUntil) {
      this.turnTo(p, yawTo(p.p, b.lookAt), 0, lv, t);
      if (dist3(p.p, b.lookAt) < 25) { b.lastSeen = b.lookAt.slice(); b.lastSeenAt = t; }
    }
    // Chase where an enemy was last seen for a few seconds.
    if (b.lastSeen && t - b.lastSeenAt < 5000 && api.mode() !== 'hns' && !this.busy(p)) {
      this.goTo(p, b, nav, b.lastSeen, t, 'chase');
      if (dist2(p.p, b.lastSeen) < 1.5) b.lastSeen = null;
      this.follow(p, b, nav, t, lv);
      return;
    }
    if (b.wander && t < b.wander.until) { b.wantMove = { p: [p.p[0] + b.wander.d[0] * 3, p.p[1], p.p[2] + b.wander.d[1] * 3], direct: true }; return; }
    this.objective(p, b, nav, t, lv);
    // (Holding a spot or hiding: nowhere to walk to.)
    if (!b.holdUntil && b.goalWhy !== 'hidden') this.follow(p, b, nav, t, lv);
  }

  // Busy with an objective that matters more than chasing (carrying the bomb, leading hostages, defusing).
  busy(p) {
    const game = this.api.game();
    return p.inv.c4 || game.hostages.some(h => h.state === 'follow' && h.leader === p.id) || (p.team === 'CT' && game.bomb.state === 'planted');
  }

  objective(p, b, nav, t, lv) {
    const api = this.api, game = api.game(), map = api.map(), mode = api.mode();
    const holdHere = (secs = [6, 14]) => {
      if (!b.holdUntil) { b.holdUntil = t + rnd(secs[0], secs[1]) * 1000; b.holdYaw = p.yaw + rnd(-2.5, 2.5); }
      this.turnTo(p, b.holdYaw, 0, lv, t);
      if (Math.random() < 0.01) b.holdYaw = p.yaw + rnd(-1.5, 1.5);
      if (t > b.holdUntil) { b.holdUntil = 0; b.goal = -1; }
    };
    const arrived = () => b.goal >= 0 && dist2(p.p, nav.pos(b.goal)) < 1.2 && Math.abs(p.p[1] - nav.Y[b.goal]) < 1.5;
    const zone = z => Object.assign(n => nav.X[n] > z.min[0] && nav.X[n] < z.max[0] && nav.Z[n] > z.min[1] && nav.Z[n] < z.max[1], { key: z.min.join() + z.max.join() });
    const near = (pos, r) => ({ near: pos, r });
    const here = nav.nodeAt(p.p);
    const goal = (filter, why) => {
      if (b.goal >= 0 && b.goalWhy === why) return;
      const n = filter?.near ? nav.randomNear(here, filter.near, filter.r) : nav.random(here, filter, filter?.key);
      this.setGoal(p, b, nav, n >= 0 ? n : nav.random(here), why, t);
    };

    // ---- Zombie mode
    if (mode === 'zombie') {
      if (p.zombie) {
        const prey = this.nearest(p, q => q.alive && q.team === 'CT');
        if (prey) { this.goTo(p, b, nav, prey.p, t, 'hunt', 900); this.weapon(p, null); }
        return;
      }
      if (arrived() || b.goalWhy === 'camp') { b.goalWhy = 'camp'; holdHere([15, 30]); }
      else goal(null, 'campspot');
      return;
    }
    // ---- Hide and Seek
    if (mode === 'hns') {
      if (p.team === 'T') {
        const seeker = this.nearest(p, q => q.alive && q.team === 'CT' && t >= game.hideUntil && dist3(q.p, p.p) < 12);
        if (seeker && b.goalWhy !== 'flee') {
          const from = seeker.p;
          b.goal = -1;
          goal(n => Math.hypot(nav.X[n] - from[0], nav.Z[n] - from[2]) > 25, 'flee');
        } else if (arrived()) {
          b.goalWhy = 'hidden';
          b.wantCrouch = true;
          this.turnTo(p, b.holdYaw ?? (b.holdYaw = p.yaw + Math.PI), 0, lv, t);
        } else if (b.goalWhy !== 'hidden' || b.goal < 0) {
          const ct = map.spawns.CT[0].p;
          goal(Object.assign(n => Math.hypot(nav.X[n] - ct[0], nav.Z[n] - ct[2]) > 22 && nav.tight[n], { key: 'hide' }), 'hide');
        }
        return;
      }
      if (arrived() || b.goal < 0 || t - b.goalAt > 25000) { b.goal = -1; goal(null, 'seek'); }
      return;
    }
    // ---- Deathmatch, Gun Game and maps without objectives: roam
    if (mode === 'deathmatch' || mode === 'gungame' || api.mapMode() === 'elim') {
      if (arrived() || b.goal < 0 || t - b.goalAt > 25000) {
        b.goal = -1;
        const other = map.spawns[p.team === 'T' ? 'CT' : 'T'];
        const toward = api.mapMode() === 'elim' && Math.random() < 0.6 ? pick(other).p : null;
        goal(toward ? near(toward, 12) : null, 'roam');
      }
      return;
    }
    // ---- Hostage rescue
    if (api.mapMode() === 'hostage') {
      if (p.team === 'CT') {
        // Leading a hostage: bring it straight out to the rescue zone.
        if (game.hostages.some(h => h.state === 'follow' && h.leader === p.id)) {
          if (b.goalWhy !== 'rescue') { b.goal = -1; goal(zone(map.zones.rescue), 'rescue'); }
          return;
        }
        // Otherwise fetch one: the nearest waiting hostage no other bot is already going for (kept until it's taken).
        const claimed = new Set([...api.players().values()].filter(q => q !== p && q.bot && q.alive && q.bot.hostage != null).map(q => q.bot.hostage));
        let h = game.hostages.find(x => x.id === b.hostage && x.state === 'idle');
        if (!h) {
          h = game.hostages.filter(x => x.state === 'idle' && !claimed.has(x.id)).sort((a, c) => dist3(p.p, a.p) - dist3(p.p, c.p))[0];
          b.hostage = h ? h.id : null;
        }
        if (h) {
          if (dist3(p.p, h.p) < 1.9 && t > b.used) { b.used = t + 800; api.use(p); return; }
          this.goTo(p, b, nav, h.p, t, 'hostage', 3000);
          return;
        }
        // Every hostage is taken care of: go and hunt.
        if (arrived() || b.goal < 0 || b.goalWhy !== 'roam') { b.goal = -1; goal(null, 'roam'); }
        return;
      }
      if (arrived()) { b.goalWhy = 'guard'; holdHere([8, 18]); return; }
      if (b.goal < 0) {
        const h = pick(game.hostages.filter(x => x.state === 'idle' || x.state === 'follow')) || null;
        goal(h ? near(h.p, 10) : null, 'guardspot');
      }
      return;
    }
    // ---- Bomb defusal
    const bomb = game.bomb;
    if (p.team === 'T') {
      if (p.inv.c4) {
        const site = api.siteAt(p.p);
        if (site && api.phase() === 'live') { if (!p.act && t > b.used) { b.used = t + 500; b.goal = -1; b.path = null; b.pathReq = 0; api.use(p); } return; }
        goal(zone(map.zones[this.plan.site]), 'plant');
        return;
      }
      if (bomb.state === 'dropped' && bomb.p) {
        const closest = this.nearest({ p: bomb.p }, q => q.bot && q.alive && q.team === 'T');
        if (closest === p) { this.goTo(p, b, nav, bomb.p, t, 'getbomb', 1500); return; }
      }
      if (bomb.state === 'planted') {
        if (b.goalWhy !== 'guardbomb') b.goal = -1;
        if (arrived()) { holdHere([5, 12]); return; }
        goal(near(bomb.p, 9), 'guardbomb');
        return;
      }
      if (arrived()) { holdHere([3, 8]); return; }
      const site = Math.random() < 0.75 ? this.plan.site : this.plan.site === 'A' ? 'B' : 'A';
      goal(zone(map.zones[site]), 'push');
      return;
    }
    // CT
    if (bomb.state === 'planted' && bomb.p) {
      if (dist3(p.p, bomb.p) < 1.4) {
        if (!p.act && t > b.used) { b.used = t + 500; b.goal = -1; b.path = null; b.pathReq = 0; api.use(p); }
        return;
      }
      const defuser = this.nearest({ p: bomb.p }, q => q.alive && q.team === 'CT');
      if (defuser === p || !defuser?.bot) { this.goTo(p, b, nav, bomb.p, t, 'defuse', 1500); return; }
      if (b.goalWhy !== 'cover') b.goal = -1;
      if (arrived()) { holdHere([4, 10]); return; }
      goal(near(bomb.p, 8), 'cover');
      return;
    }
    if (arrived()) { holdHere([10, 25]); return; }
    const site = this.plan.ct?.get(p.id) || 'A';
    goal(zone(map.zones[site]), 'watch');
  }

  nearest(from, filter) {
    let best = null, bd = Infinity;
    for (const q of this.api.players().values()) {
      if (!this.api.inTeam(q) || !filter(q)) continue;
      const d = dist3(from.p, q.p);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  setGoal(p, b, nav, n, why, t) {
    b.pathReq = 0;
    b.goal = n;
    b.goalWhy = why;
    b.goalAt = t;
    b.holdUntil = 0;
    b.path = null; b.pathReq = 0;
    b.repathAt = 0;
  }

  // Head for a moving spot (a player, a hostage, the bomb): re-plan now and then as it moves.
  goTo(p, b, nav, pos, t, why, every = 1200) {
    // Same goal and it hasn't moved much: keep the current path.
    if (b.goalWhy === why && b.goal >= 0 && dist3(nav.pos(b.goal), pos) < 2 && (b.path || t < b.repathAt)) return;
    const n = nav.nodeAt(pos, 4);
    if (n < 0) return;
    this.setGoal(p, b, nav, n, why, t);
    b.repathAt = t + every;
  }

  // ---------------------------------------------------------------- path following
  follow(p, b, nav, t, lv) {
    if (b.goal < 0) return;
    if (!b.path) {
      // Ask the pathfinder (answers within a few ms); keep still meanwhile.
      if (b.pathReq || t < (b.nextSearch || 0)) return;
      b.nextSearch = t + 250;
      const from = nav.nodeAt(p.p);
      if (from >= 0) this.findPath(p, b, nav, from, b.goal);
      else b.goal = -1;
      return;
    }
    if (t > b.repathAt && b.goalWhy !== 'hidden') { b.path = null; b.pathReq = 0; b.repathAt = t + 8000; return; }
    let wp = b.path[b.pi];
    while (wp && dist2(p.p, wp.p) < (wp.ladder ? 0.5 : 0.6) && Math.abs(p.p[1] - wp.p[1]) < (wp.ladder ? 0.6 : 1.3)) wp = b.path[++b.pi];
    if (!wp) { b.path = null; b.pathReq = 0; b.goalReached = true; return; }
    b.wantMove = wp;
    // A closed door on the way: open it before walking into it (doors swing away from whoever opens them).
    if (t > (b.doorCheck || 0)) {
      b.doorCheck = t + 300;
      const o = [p.p[0], p.p[1] + 1, p.p[2]], d = [wp.p[0] - o[0], wp.p[1] + 1 - o[1], wp.p[2] - o[2]];
      const len = Math.min(Math.hypot(...d), 3);
      if (len > 0.1) {
        const dir = d.map(v => v / Math.hypot(...d));
        for (const door of this.api.doors()) {
          if (!door.open && rayAABB(o, dir, door.box.min.map(v => v - 0.1), door.box.max.map(v => v + 0.1), len)) this.api.useDoor(p, door.i);
        }
      }
    }
    if (nav.low[wp.n] || nav.low[b.path[b.pi - 1]?.n] || (b.stuck >= 2 && b.stuck % 2 === 0)) b.wantCrouch = true;
    if (!b.target) {
      // Look where we're going (a little ahead), or at the spot we heard something.
      const ahead = b.path[Math.min(b.path.length - 1, b.pi + 1)].p;
      if (!(b.lookAt && t < b.alertUntil)) this.turnTo(p, yawTo(p.p, ahead), 0, lv, t);
    }
  }

  glance(p, b, t, lv) {
    if (b.lookAt && t < b.alertUntil) this.turnTo(p, yawTo(p.p, b.lookAt), 0, lv, t);
  }

  turnTo(p, yaw, pitch, lv, t, dt = 1 / 30) {
    const max = lv.turn * dt;
    const dy = wrap(yaw - p.yaw);
    p.yaw = wrap(p.yaw + Math.max(-max, Math.min(max, dy)));
    p.pitch += Math.max(-max, Math.min(max, pitch - p.pitch));
  }

  // ---------------------------------------------------------------- fighting
  weapon(p, enemy) {
    const has = it => it && (it.mag > 0 || it.res > 0);
    let w = 'knife';
    if (p.zombie) w = 'claws';
    else if (has(p.inv.primary) && !(p.reloadUntil && p.reloadWeapon === p.inv.primary.id && enemy && has(p.inv.secondary) && p.inv.secondary.mag > 0)) w = p.inv.primary.id;
    else if (has(p.inv.secondary)) w = p.inv.secondary.id;
    // An RPG is for groups and cars, not for the guy next to you.
    if (WEAPONS[w]?.rocket && enemy && dist3(p.p, enemy.p) < 10 && has(p.inv.secondary)) w = p.inv.secondary.id;
    // Bots don't use the mortar (one picked up off the ground is just carried).
    if (w === 'mortar') w = has(p.inv.secondary) ? p.inv.secondary.id : 'knife';
    if (p.downed) w = has(p.inv.secondary) ? p.inv.secondary.id : 'knife'; // body: only the pistol from the floor
    if (p.w !== w) { p.w = w; p.bot.nextShot = Math.max(p.bot.nextShot, this.api.now() + 350); }
    return w;
  }

  reload(p, t, fighting) {
    if (p.reloadUntil) return;
    const item = p.inv.primary?.id === p.w ? p.inv.primary : p.inv.secondary?.id === p.w ? p.inv.secondary : null;
    if (!item || item.res <= 0) return;
    const def = WEAPONS[item.id];
    if (item.mag === 0 || (!fighting && item.mag < def.mag * 0.5)) {
      p.reloadUntil = t + def.reload * 1000;
      p.reloadWeapon = item.id;
    }
  }

  fight(p, b, q, t, lv) {
    const api = this.api;
    const w = this.weapon(p, q), def = WEAPONS[w];
    const eye = this.eye(p);
    const d = dist3(p.p, q.p);
    // Aim point: head or chest, plus an error that drifts every few hundred ms.
    const aim = [q.p[0], q.p[1] + (b.aimHead ? (q.c ? 0.78 : 1.62) : (q.c ? 0.55 : 1.15)), q.p[2]];
    if (q.downed) aim[1] = q.p[1] + 0.25; // body: finish someone crawling on the floor
    if (t > b.errAt) {
      const moving = Math.hypot(b.v[0], b.v[2]) > 1.5 ? 1.6 : 1;
      b.err = [rnd(-1, 1) * lv.aim * moving, rnd(-1, 1) * lv.aim * moving * 0.7];
      b.errAt = t + rnd(250, 500);
    }
    const yaw = yawTo(eye, aim) + b.err[0];
    const pitch = Math.atan2(aim[1] - eye[1], Math.hypot(aim[0] - eye[0], aim[2] - eye[2])) + b.err[1];
    this.turnTo(p, yaw, pitch, lv, t);

    // Melee: run at them.
    if (def.melee) {
      const nav = this.nav();
      this.goTo(p, b, nav, q.p, t, 'melee', 500);
      this.follow(p, b, nav, t, lv);
      if (d < 3) b.wantMove = { p: q.p, direct: true };
      if (d < def.range + 0.3 && t >= b.reactAt && t >= b.nextShot && Math.abs(wrap(yaw - p.yaw)) < 0.5) {
        const dir = aimDir(p.yaw, p.pitch);
        api.shoot(p, { w, o: eye, d: dir, alt: false });
        b.nextShot = t + def.rate * 1000;
      }
      return;
    }

    // Grenade at a group or someone holding an angle (once per encounter).
    if (!b.nadeTried && t >= b.reactAt && d > 8 && d < 28) {
      b.nadeTried = true;
      const k = p.inv.he > 0 ? 'he' : p.inv.molotov > 0 ? 'molotov' : null;
      if (k && Math.random() < lv.nade) { this.throwNade(p, k, q.p); b.nextShot = t + 600; return; }
    }

    // Movement in a fight: strafe close up, stand (and maybe duck) to shoot at range.
    b.path = null; b.pathReq = 0;
    b.goal = -1;
    if (t > b.strafeAt) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeAt = t + rnd(350, 900); b.crouchFight = d > 18 && Math.random() < lv.strafe * 0.4; }
    if (lv.strafe && d < 18 && Math.random() < lv.strafe) {
      const side = yawTo(p.p, q.p) + (Math.PI / 2) * b.strafe;
      b.wantMove = { p: [p.p[0] - Math.sin(side) * 3, p.p[1], p.p[2] - Math.cos(side) * 3], direct: true };
    }
    b.wantCrouch = b.crouchFight;

    const item = p.inv.primary?.id === w ? p.inv.primary : p.inv.secondary?.id === w ? p.inv.secondary : null;
    if (!item) return;
    if (item.mag <= 0) { this.reload(p, t, true); return; }
    if (p.reloadUntil && p.reloadWeapon === w) return;
    if (t < b.reactAt || t < b.nextShot || t < b.pauseUntil) return;
    const off = Math.abs(wrap(yaw - p.yaw)) + Math.abs(pitch - p.pitch);
    if (off > Math.max(0.06, 0.6 / Math.max(d, 1))) return;
    // Bursts at range (spray up close), single aimed shots with snipers and semi-autos.
    let s = def.sniper ? def.spread : def.spread ?? 0;
    const speed = Math.hypot(b.v[0], b.v[2]);
    if (speed > 1.6) s += (def.moveSpread || 0) * Math.min(1, speed / 5);
    if (p.c) s *= 0.7;
    if (t - b.lastFire > 500) b.burst = 0;
    s += Math.min(b.burst, 10) * (def.spreadInc || 0) * 0.55;
    const base = aimDir(p.yaw, p.pitch);
    const dirs = def.pellets ? Array.from({ length: def.pellets }, () => spreadDir(base, def.pelletSpread + s)) : [spreadDir(base, s)];
    api.shoot(p, { w, o: eye, d: dirs[0], ds: def.pellets ? dirs : undefined });
    b.burst++;
    b.lastFire = t;
    b.nextShot = t + def.rate * 1000 * (def.auto ? 1 : rnd(1.05, 1.4));
    if (def.auto && d > 14 && b.burst >= lv.burst * (d > 30 ? 0.5 : 1)) { b.pauseUntil = t + rnd(220, 420); b.burst = 0; }
  }

  // Lob a grenade so it lands near `at` (low arc, the speed a player throws with).
  throwNade(p, k, at) {
    const eye = this.eye(p);
    const dx = at[0] - eye[0], dz = at[2] - eye[2], D = Math.hypot(dx, dz), H = at[1] - eye[1];
    const v = 21, g = NADE.gravity;
    const disc = v ** 4 - g * (g * D * D + 2 * H * v * v);
    const th = disc > 0 ? Math.atan((v * v - Math.sqrt(disc)) / (g * D)) : Math.PI / 4;
    const vel = [(dx / D) * Math.cos(th) * v, Math.sin(th) * v + 1.5, (dz / D) * Math.cos(th) * v];
    const o = [eye[0] + (dx / D) * 0.4, eye[1] - 0.1, eye[2] + (dz / D) * 0.4];
    this.api.nade(p, { k, o, v: vel });
  }

  // ---------------------------------------------------------------- moving
  // Enemy mines the bot can see (within MINE.seen): if the next step heads onto one (a PMN, or a MON-50's tripwire),
  // turn whichever way gets clear of it.
  avoidMines(p, wx, wz) {
    const dm = this.api.mode() === 'deathmatch';
    for (const m of this.api.game().mines || []) {
      if (dm ? m.owner === p.id : m.team === p.team) continue;
      const wire = [m.p[0] - Math.sin(m.yaw) * MINE.mon50.wire, m.p[1], m.p[2] - Math.cos(m.yaw) * MINE.mon50.wire];
      if (dist3(p.p, m.p) > MINE.seen && (m.k !== 'mon50' || dist3(p.p, wire) > MINE.seen)) continue;
      const danger = q => {
        if (m.k === 'pmn') return Math.hypot(q[0] - m.p[0], q[1] - m.p[2]);
        const W = MINE.mon50, fx = -Math.sin(m.yaw), fz = -Math.cos(m.yaw), cx = m.p[0] + fx * W.wire, cz = m.p[2] + fz * W.wire;
        const s = Math.max(-W.wireHalf, Math.min(W.wireHalf, (q[0] - cx) * -fz + (q[1] - cz) * fx));
        return Math.hypot(q[0] - (cx - fz * s), q[1] - (cz + fx * s));
      };
      const step = (x, z) => danger([p.p[0] + x * 0.8, p.p[2] + z * 0.8]);
      if (step(wx, wz) > 0.9) continue;
      const turn = a => [wx * Math.cos(a) - wz * Math.sin(a), wx * Math.sin(a) + wz * Math.cos(a)];
      const l = turn(1.2), r = turn(-1.2);
      return step(...l) > step(...r) ? l : r;
    }
    return [wx, wz];
  }


  move(p, b, nav, dt, t, frozen) {
    const api = this.api, map = api.map(), world = api.world();
    const def = WEAPONS[p.w] || WEAPONS.knife;
    let wx = 0, wz = 0, jump = false;
    const wp = frozen || p.act ? null : b.wantMove;
    const ladder = ladderAt(map.ladders, p.p, b.crouch ? PLAYER.crouchHeight : PLAYER.height);
    let climb = 0;
    if (wp) {
      const dx = wp.p[0] - p.p[0], dz = wp.p[2] - p.p[2], len = Math.hypot(dx, dz);
      if (len > 0.05) { wx = dx / len; wz = dz / len; }
      if (len > 0.05) [wx, wz] = this.avoidMines(p, wx, wz);
      if (wp.jump && b.onGround && len < 1.3 && wp.p[1] - p.p[1] > 0.45) jump = true;
      if (ladder && (wp.ladder || Math.abs(wp.p[1] - p.p[1]) > 0.8)) climb = wp.p[1] > p.p[1] + 0.2 ? 1 : wp.p[1] < p.p[1] - 0.2 ? -1 : 0;
    }

    // Stuck: hop, then open a door in the way, then plan again, then pick somewhere else to go.
    if (wp && !wp.direct && t > b.stuckAt) {
      const moved = dist2(p.p, b.stuckPos);
      b.stuck = moved < 0.35 ? b.stuck + 1 : 0;
      b.stuckPos = p.p.slice();
      b.stuckAt = t + 700;
      if (b.stuck === 1) jump = b.onGround;
      if (b.stuck === 2) { const door = api.door(p); if (door != null) api.useDoor(p, door); }
      if (b.stuck === 3) { b.path = null; b.pathReq = 0; b.repathAt = t + 8000; }
      if (b.stuck >= 5) { b.goal = -1; b.path = null; b.pathReq = 0; b.stuck = 0; b.wantMove = null; }
    }

    // Crouch where the path needs it, in a fight when the brain wants to, and while jumping up onto things.
    if (b.wantCrouch || (!b.onGround && b.jumpCrouch)) b.crouch = true;
    else if (b.crouch && !overlapsAny(world.move(null, p.p, 3), p.p[0], p.p[1] + 0.01, p.p[2], PLAYER.radius, PLAYER.height)) b.crouch = false;
    if (b.onGround) b.jumpCrouch = false;

    let speed = (p.zombie ? WEAPONS.claws.speed : def.speed) * (b.crouch ? 0.34 : 1);
    if (api.mode() === 'hns' && p.team === 'T' && b.goalWhy === 'hidden') speed *= 0.5;
    if (p.downed) { speed = Math.min(speed, 1); b.crouch = true; jump = false; climb = 0; } // body: a downed bot crawls
    if (climb) {
      b.v[0] = wx * 1.6;
      b.v[2] = wz * 1.6;
      const [px, pz] = ladderPull(ladder, p.p);
      b.v[0] += px;
      b.v[2] += pz;
      b.v[1] = climb * 3.4;
      // Near the top: step off forwards.
      if (climb > 0 && p.p[1] > ladder.max[1] - 0.6) { b.v[0] = wx * 2.5; b.v[2] = wz * 2.5; b.crouch = true; }
    } else if (b.onGround) {
      const k = Math.min(1, dt * 10);
      b.v[0] += (wx * speed - b.v[0]) * k;
      b.v[2] += (wz * speed - b.v[2]) * k;
      if (jump) { b.v[1] = PLAYER.jump * (p.zombie ? 1.12 : 1); b.onGround = false; b.jumpCrouch = true; }
    } else if (wx || wz) {
      b.v[0] += wx * speed * dt * 2;
      b.v[2] += wz * speed * dt * 2;
      const hs = Math.hypot(b.v[0], b.v[2]), max = Math.max(speed, 4);
      if (hs > max) { b.v[0] *= max / hs; b.v[2] *= max / hs; }
    }
    const body = { p: p.p, v: b.v, onGround: b.onGround, crouch: b.crouch, climbing: !!climb };
    const gravity = climb || (ladder && !b.onGround && wp?.ladder) ? 0 : PLAYER.gravity * (api.cfg().party?.lowGravity ? 0.4 : 1);
    movePlayer(body, dt, world.move(null, p.p, 2), gravity);
    b.onGround = body.onGround;
    p.c = b.crouch ? 1 : 0;
    p.fl = 0;
    if (p.p[1] < -60) api.kill(p);
  }
}
