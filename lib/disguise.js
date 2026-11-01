// Disguise (server side). Crouch over a dead enemy and hold E for DISGUISE.take seconds to put on their uniform; from then
// on, until it breaks, the other team takes you for the dead player:
// - their snapshots show you as that player (the dead player's id and team, so their own model, colours and name tag),
//   and your own entry is left out. Nothing in their copy says "disguised" (see headFor);
// - their radar doesn't spot you (server.js updateSpotting asks p.disguise) and their bots don't see you (lib/bots.js);
// - your own team (and spectators) see you as you are, with a marker: the "dg" part of their snapshot.
// It breaks (reveal) when you shoot, knife someone, throw a grenade or satchel, fire a mortar, start planting or
// defusing, an enemy gets within DISGUISE.recognise metres of you in sight, an enemy hurts you, or you go down. It's
// lost when you die and cleared every round; one per life.
//
// Contract with the rest of the server: p.disguise is the team a player looks like, or null (this file owns it).
// It reads p.downed and p.playingDead (other features): no uniform from a downed or play-dead body, and going down breaks it.
import { DISGUISE, disguiseAllowed } from '../shared/disguise.js';

const TEAM_CODE = { T: 1, CT: 2 };
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const r2 = v => Math.round(v * 100) / 100;
const chest = p => [p.p[0], p.p[1] + (p.c ? 0.5 : 1.05), p.p[2]];

// api: { players, game, cfg(), send(p, msg), lineOfSight(a, b), eyeOf(p) }
export function createDisguise(api) {
  const { players, game, send, lineOfSight, eyeOf } = api;
  // The round's bodies: player id -> { id, name, team, p, seq, round, gibbed, takenBy }
  const corpses = new Map();
  // Disguised players: id -> { victim (the dead player's id), name (theirs), look (their team), seq (our life) }
  const info = new Map();
  const usedSeq = new Map(); // id -> the life (spawnSeq) a player used their one uniform in
  const acting = new Map(); // id -> { n, p }: changing right now (to stop the rustle when it ends)
  let round = -1, fxSerial = 0;
  let dgJson = { T: '', CT: '', all: '' };
  let headCache = { head: null, map: new Map() };

  const inTeam = p => p.team === 'T' || p.team === 'CT';
  const live = () => disguiseAllowed(api.cfg().gameMode, game.phase);

  // A body whose uniform can still be the one somebody wears: its player is still lying dead, this round.
  function lying(c) {
    const v = players.get(c.id);
    return !!v && !v.alive && !v.downed && !v.playingDead && v.team === c.team && v.spawnSeq === c.seq && c.round === game.round;
  }
  const takeable = c => lying(c) && !c.gibbed && c.takenBy == null;

  // The cloth rustling while someone changes: for whoever is close enough to hear it (and the dead, who watch from anywhere).
  function fx(m) {
    const msg = JSON.stringify({ t: 'disguiseFx', ...m, p: m.p.map(r2) });
    for (const q of players.values()) {
      if (q.ws.readyState !== 1 || !q.joined) continue;
      if (!q.alive || dist3(q.p, m.p) <= DISGUISE.rustleRange) q.ws.send(msg);
    }
  }

  function clear(p) {
    p.disguise = null;
    info.delete(p.id);
  }

  function resetAll() {
    for (const id of info.keys()) { const p = players.get(id); if (p) p.disguise = null; }
    info.clear();
    corpses.clear();
    usedSeq.clear();
    for (const [, st] of acting) fx({ k: 'stop', n: st.n, p: st.p });
    acting.clear();
  }

  // E (from onUse): crouched over a dead enemy's body, start changing. False when there's no such body here, so E
  // goes on to doors, switches, cars and the guns on the floor.
  function tryStart(p, t) {
    if (!live() || p.bot || !p.alive || !inTeam(p) || !p.c || p.disguise || p.downed || p.playingDead) return false;
    if (usedSeq.get(p.id) === p.spawnSeq) return false;
    let best = null, bd = DISGUISE.reach;
    for (const c of corpses.values()) {
      if (c.team === p.team || !takeable(c)) continue;
      const d = dist2(p.p, c.p);
      if (d < bd && Math.abs(p.p[1] - c.p[1]) < DISGUISE.reachY) { bd = d; best = c; }
    }
    if (!best) return false;
    p.act = { type: 'disguise', start: t, pos: p.p.slice(), dur: DISGUISE.take * 1000, body: best.id };
    const n = ++fxSerial;
    acting.set(p.id, { n, p: best.p });
    fx({ k: 'start', n, p: best.p });
    return true;
  }

  // Every tick while changing (from updateActions, after its own checks: alive, live round, not walked off).
  function act(p, a, t) {
    const c = corpses.get(a.body);
    if (!live() || !p.c || p.downed || dist2(p.p, a.pos) > DISGUISE.still || !c || !takeable(c)) { p.act = null; return; }
    if (t - a.start < a.dur) return;
    p.act = null;
    wear(p, c);
  }

  function wear(p, c) {
    c.takenBy = p.id;
    p.disguise = c.team;
    info.set(p.id, { victim: c.id, name: c.name, look: c.team, seq: p.spawnSeq });
    usedSeq.set(p.id, p.spawnSeq);
    const st = acting.get(p.id);
    acting.delete(p.id);
    fx({ k: 'done', n: st ? st.n : 0, p: c.p });
    send(p, { t: 'disguiseOn', id: p.id, you: 1, as: c.name, look: c.team });
    for (const q of players.values()) if (q !== p && q.team === p.team) send(q, { t: 'disguiseOn', id: p.id, name: p.name, as: c.name, look: c.team });
  }

  // The disguise breaks: the wearer and the enemies around are told (with a sound), the wearer's team gets a line.
  function reveal(p, why) {
    if (!p.disguise) return false;
    const d = info.get(p.id);
    clear(p);
    send(p, { t: 'disguiseOff', you: 1, why });
    const at = p.p.map(r2);
    for (const q of players.values()) {
      if (q === p || !q.joined) continue;
      if (q.team === p.team) send(q, { t: 'disguiseOff', id: p.id, mate: 1, name: p.name, why });
      else if (inTeam(q) && q.alive && dist3(q.p, p.p) <= DISGUISE.revealRange) send(q, { t: 'disguiseOff', id: p.id, name: p.name, as: d ? d.name : '', why, p: at });
    }
    return true;
  }

  // From applyDamage: any hit stops the changing; a hit from the team you're fooling gives you away.
  function onHurt(v, attacker) {
    if (v.act && v.act.type === 'disguise') v.act = null;
    if (v.disguise && attacker && attacker !== v && attacker.team === v.disguise) reveal(v, 'hurt');
  }

  // From killPlayer: the body is kept for the round (where it fell, whose it is); a body blown apart has no uniform.
  function onDeath(v, gib) {
    if (v.disguise) clear(v);
    if (!inTeam(v)) return;
    corpses.set(v.id, { id: v.id, name: v.name, team: v.team, p: v.p.slice(), seq: v.spawnSeq, round: game.round, gibbed: !!gib && gib.k === 'blast', takenBy: null });
  }

  // An enemy (of the team you look like) within DISGUISE.recognise m who sees you: in sight, and you in front of them
  // (or so close they'd notice anyway).
  function recognised(p, team) {
    const me = chest(p);
    for (const q of players.values()) {
      if (q.team !== team || !q.alive) continue;
      const d = dist3(q.p, p.p);
      if (d >= DISGUISE.recognise) continue;
      if (d > DISGUISE.touch) {
        const off = Math.atan2(-(p.p[0] - q.p[0]), -(p.p[2] - q.p[2])) - q.yaw;
        if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > DISGUISE.recogniseFov) continue;
      }
      if (lineOfSight(eyeOf(q), me)) return q;
    }
    return null;
  }

  function tick() {
    const allowed = api.cfg().gameMode === 'classic' && game.phase !== 'warmup';
    if (game.round !== round || !allowed) {
      if (info.size || corpses.size || usedSeq.size || acting.size) resetAll();
      round = game.round;
    }
    for (const [id, d] of info) {
      const p = players.get(id);
      if (!p) { info.delete(id); continue; }
      // lost: dead, respawned, moved to the other team
      if (!p.alive || p.spawnSeq !== d.seq || p.team === d.look || !p.disguise) { clear(p); continue; }
      if (p.downed) { reveal(p, 'downed'); continue; }
      // the uniform's owner isn't lying dead any more (left the game, came back, changed teams)
      const c = corpses.get(d.victim);
      if (!c || !lying(c)) { clear(p); send(p, { t: 'disguiseOff', you: 1, why: 'gone' }); continue; }
      if (p.act && (p.act.type === 'plant' || p.act.type === 'defuse')) { reveal(p, p.act.type); continue; }
      if (recognised(p, d.look)) reveal(p, 'near');
    }
    for (const [id, st] of acting) {
      const p = players.get(id);
      if (!p || !p.act || p.act.type !== 'disguise') { acting.delete(id); fx({ k: 'stop', n: st.n, p: st.p }); }
    }
    buildDg();
  }

  // The "dg" part of the snapshot, per receiving team: that team's own disguised players ([id, victim id, victim name,
  // look 1 T / 2 CT]), who has used theirs this life (u) and which enemy bodies were stripped (s). Spectators get all of
  // it. The team being fooled gets nothing.
  function buildDg() {
    if (!info.size && !usedSeq.size) { dgJson = { T: '', CT: '', all: '' }; return; }
    const make = team => {
      const d = [], u = [], s = [];
      for (const [id, x] of info) { const p = players.get(id); if (p && (!team || p.team === team)) d.push([id, x.victim, x.name, TEAM_CODE[x.look]]); }
      for (const [id, seq] of usedSeq) { const p = players.get(id); if (p && p.alive && p.spawnSeq === seq && (!team || p.team === team)) u.push(id); }
      for (const c of corpses.values()) if (c.takenBy != null && (!team || c.team !== team)) s.push(c.id);
      if (!d.length && !u.length && !s.length) return '';
      const o = {};
      if (d.length) o.d = d;
      if (u.length) o.u = u;
      if (s.length) o.s = s;
      return ',"dg":' + JSON.stringify(o);
    };
    dgJson = { T: make('T'), CT: make('CT'), all: make(null) };
  }

  const snapKey = p => (p.team === 'T' || p.team === 'CT' ? dgJson[p.team] : dgJson.all);

  // The snapshot's head as player p's copy: for the team a disguise fools, the wearer's entry becomes the dead player's
  // (their id and team, the wearer's position, pose and gun) and the wearer's own entry goes. The dead player is shown
  // the truth: nobody can be shown their own body walking about. Made once per team (and victim) per tick.
  function headFor(p, head, pl) {
    if (!info.size || (p.team !== 'T' && p.team !== 'CT')) return head;
    let key = p.team, any = false;
    for (const d of info.values()) if (d.look === p.team) { any = true; if (d.victim === p.id) key += ':' + p.id; }
    if (!any) return head;
    if (headCache.head !== head) headCache = { head, map: new Map() };
    let h = headCache.map.get(key);
    if (h === undefined) { h = variant(head, pl, p.team, p.id); headCache.map.set(key, h); }
    return h;
  }

  function variant(head, pl, team, viewer) {
    const rows = pl.slice();
    for (const [id, d] of info) {
      if (d.look !== team || d.victim === viewer) continue;
      const xi = rows.findIndex(r => r[0] === id);
      if (xi < 0 || !rows[xi][8]) continue;
      const alias = rows[xi].slice();
      alias[0] = d.victim;
      alias[9] = TEAM_CODE[d.look];
      rows.splice(xi, 1);
      const bi = rows.findIndex(r => r[0] === d.victim);
      if (bi >= 0) rows[bi] = alias; else rows.push(alias);
    }
    const from = '"pl":' + JSON.stringify(pl), i = head.indexOf(from);
    return i < 0 ? head : head.slice(0, i) + '"pl":' + JSON.stringify(rows) + head.slice(i + from.length);
  }

  return { tryStart, act, reveal, onHurt, onDeath, tick, headFor, snapKey, corpses, info };
}
