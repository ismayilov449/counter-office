// "Downed, not dead" and "Play dead" on the server (docs/features/body.md). server.js calls in at a few hooks marked
// "body:"; everything else is here.
//
// Downed (classic mode on bomb and hostage maps, live rounds only): lethal damage leaves you on the floor instead of
// killing you, unless it was a headshot, a kill that bursts the body apart (see gibOf in server.js), or nobody else on
// your team is still standing. You crawl with your pistol and bleed out in BODY.bleed seconds; a teammate holding E on
// you for BODY.revive seconds gets you up with BODY.reviveHp; any damage while you're down kills you. The kill goes to
// whoever finishes you, or to whoever downed you if you bleed out (or the world finishes you). When nobody on a team is
// standing any more, its downed bleed out at once, so win checks see them as dead.
//
// Play dead (classic mode, live rounds and warmup, once a life): K drops you like a real corpse. The other team gets a
// kill message exactly like a real one, and everything they're sent says you're dead (snapshot, team bar, roster,
// radar); your weapons fall out of your hands as real drops and come back when you get up (K, moving or shooting, a
// hit, after BODY.playDead seconds or at the end of the round). Your team is told the truth in the snapshot's "bd".
//
// The Mansion's gadgets: going down or playing dead takes you off the zip line (you fall) and up from the CCTV desk
// (server.js's onDown / onPlayDead hooks); from the floor you can't hook on or sit down. A "corpse" falling off the
// zip line lands first (its positions go through until then, and the landing's fall damage wakes it), then its
// weapons fall.
//
// Owns p.downed and p.playingDead (the shared contract); its own fields on a player all start with "body".
import { BODY, rayLying } from '../shared/body.js';

let S = null; // what server.js hands over: see init
const downHooks = [], pdHooks = [];
const r2 = v => Math.round(v * 100) / 100;
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const bdJson = { T: '', CT: '', X: '' }; // this tick's "bd" snapshot part for each side (X: spectators)
let lastT = 0;

export function init(api) { S = api; }

// Other features that must react when someone goes down (the human shield lets go of the hostage; off the zip line,
// up from the CCTV desk): fn(p), called before anyone is told.
export function onDown(fn) { downHooks.push(fn); }
// ... and when someone starts playing dead (off the zip line, up from the CCTV desk): fn(p), called once the play dead
// is allowed, before the weapons fall and the fake kill is sent (so it can still move the player).
export function onPlayDead(fn) { pdHooks.push(fn); }

const classic = () => S.cfg.gameMode === 'classic';
const downedOn = () => classic() && S.mapMode() !== 'elim' && S.game.phase === 'live';
const playDeadOn = () => classic() && (S.game.phase === 'live' || S.game.phase === 'warmup');
const rising = (p, t = S.now()) => (p.bodyRiseUntil || 0) > t;
// Up on their feet (or playing dead, which is up as far as the rules go): not down, not dead.
const standing = q => q.alive && !q.downed && S.inTeam(q);

// ---------------------------------------------------------------- damage and death (applyDamage / killPlayer)

// applyDamage, before the damage: remember who hit whom (for the fake kill), and a hit wakes someone playing dead.
export function hurt(v, attacker, weapon) {
  if (attacker && attacker !== v && !S.mates(attacker, v)) v.bodyHit = { id: attacker.id, w: weapon, t: S.now() };
  if (v.playingDead) endPlayDead(v, true, 'hit');
}

// applyDamage, on lethal damage: true if v goes down instead of dying.
export function tryDown(v, attacker, weapon, part, from) {
  if (v.downed || !downedOn() || !S.inTeam(v) || v.zombie) return false;
  if (part === 'head') return false; // a headshot kills outright
  if (S.gibOf(weapon, false, from && { part, from })) return false; // so does anything that bursts the body apart
  if (![...S.players.values()].some(q => q !== v && q.team === v.team && standing(q))) return false; // nobody left to revive
  down(v, attacker, weapon);
  return true;
}

function down(v, attacker, weapon) {
  const t = S.now();
  v.downed = true;
  v.hp = 0;
  v.act = null;
  v.reloadUntil = 0;
  v.burnUntil = 0; // rolling on the floor puts the flames out (standing in the fire still burns)
  v.bodyBleedEnd = t + BODY.bleed * 1000;
  v.bodyBy = attacker && attacker !== v ? attacker.id : null;
  v.bodyWeapon = weapon;
  v.bodyRevive = 0;
  v.bodyReviver = null;
  if (v.driving != null || v.riding != null) S.exitCar(v);
  if (v.piloting != null) {
    const d = S.game.drones.find(x => x.id === v.piloting);
    if (d) S.loseDrone(d, 'pilot'); else v.piloting = null;
  }
  v.w = v.inv.secondary?.id || 'knife';
  for (const fn of downHooks) fn(v);
  S.broadcast({ t: 'bodyDown', v: v.id, k: v.bodyBy, w: weapon });
  S.sendMe(v);
}

// killPlayer, first thing, for someone down or playing dead: clears the state and says who gets the kill.
export function died(v, killer, weapon, hs, silent) {
  if (v.playingDead) endPlayDead(v, false, 'dead', true);
  if (!v.downed) return { killer, weapon, hs };
  const bled = !!v.bodyBleeding;
  v.downed = false;
  v.bodyBleeding = false;
  const by = v.bodyBy != null ? S.players.get(v.bodyBy) || null : null;
  const finisher = !bled && killer && killer !== v ? killer : null;
  if (!finisher) { killer = by; weapon = by ? v.bodyWeapon : weapon; }
  if (!silent) S.broadcast({ t: 'bodyKill', v: v.id, how: finisher ? 'finished' : 'bled' });
  return { killer, weapon, hs: false };
}

function bleedOut(q) {
  if (!q.downed || !q.alive) return;
  q.bodyBleeding = true;
  S.killPlayer(q, null, q.bodyWeapon || 'world', false);
}

function revive(q, p) {
  q.downed = false;
  q.hp = BODY.reviveHp;
  q.bodyBleedEnd = 0;
  q.bodyRevive = 0;
  q.bodyReviver = null;
  S.sendMe(q);
  S.broadcast({ t: 'bodyUp', v: q.id, by: p.id });
}

// ---------------------------------------------------------------- reviving (onUse)

// The downed teammate p would revive with E: close by on the floor, and roughly in front (or right at their feet).
function reviveTarget(p) {
  let best = null, bd = Infinity;
  for (const q of S.players.values()) {
    if (q === p || !q.downed || !q.alive || q.team !== p.team) continue;
    const d = dist2(p.p, q.p);
    if (d > BODY.reach || Math.abs(q.p[1] - p.p[1]) > 1.2 || d >= bd) continue;
    if (d > 0.9) {
      const off = Math.atan2(-(q.p[0] - p.p[0]), -(q.p[2] - p.p[2])) - p.yaw;
      if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > 1.05) continue;
    }
    if ([...S.players.values()].some(o => o !== p && o.act?.type === 'bodyRevive' && o.act.target === q.id)) continue;
    best = q; bd = d;
  }
  return best;
}

// onUse (E pressed): true if it's handled here — nothing to use from the floor, or a revive starts.
export function use(p, t) {
  if (p.downed || p.playingDead || rising(p, t)) return true;
  // (on the zip line or at the CCTV desk, E lets go / gets you up first)
  if (!p.alive || p.act || S.busy(p) || p.driving != null || p.riding != null || p.piloting != null || S.game.phase !== 'live') return false;
  const q = reviveTarget(p);
  if (!q) return false;
  p.act = { type: 'bodyRevive', start: t, pos: p.p.slice(), dur: BODY.revive * 1000, target: q.id, tpos: q.p.slice() };
  return true;
}

// ---------------------------------------------------------------- what someone down or playing dead can't do

// onShoot / onNade: true if this shot (or throw) is refused.
export function noFire(p, w) {
  if (p.playingDead || rising(p)) return true;
  if (p.act?.type === 'bodyRevive') return true;
  if (p.downed) return !(w === 'knife' || w === p.inv.secondary?.id);
  return false;
}

// canBuy: a reason, or null.
export function noBuy(p) {
  if (p.downed) return "You can't buy while you're down.";
  if (p.playingDead) return "You're playing dead.";
  return null;
}

// handle() (every message), first thing: true if it's handled here.
export function handle(p, m) {
  switch (m.t) {
    case 'bodyPlayDead':
      if (p.playingDead) endPlayDead(p, true, 'self');
      else startPlayDead(p);
      return true;
    case 'state': // a corpse doesn't move: the server keeps where (and how) it fell — once it has landed: off the
      // zip line it still falls, so its positions (and the landing's fall damage) go through; tick keeps its facing
      return !!p.playingDead && !S.falling(p);
    case 'emote':
      return !!(p.downed || p.playingDead);
    case 'chat':
      if (p.playingDead && !m.team) { S.send(p, { t: 'msg', text: 'Only team chat (U) while playing dead — the other team would know.' }); return true; }
      return false;
    default:
      return false;
  }
}

// ---------------------------------------------------------------- playing dead

function startPlayDead(p) {
  const t = S.now();
  const no = text => S.send(p, { t: 'msg', text });
  if (!p.alive || p.downed || !S.inTeam(p) || p.zombie || rising(p, t)) return;
  if (!playDeadOn()) return no('Playing dead works in classic matches only (not in buy time or after the round).');
  if (p.bodyPdUsed) return no('You can play dead only once a round.');
  if (p.driving != null || p.riding != null || p.piloting != null || p.act) return no("You can't play dead right now.");
  if (![...S.players.values()].some(q => q !== p && q.team === p.team && standing(q) && !q.playingDead)) {
    return no("You're the last one standing — playing dead would fool nobody (the round wouldn't end).");
  }
  for (const fn of pdHooks) fn(p); // (off the zip line, up from the CCTV desk)
  p.playingDead = true;
  p.bodyPdUsed = true;
  p.bodyPdEnd = t + BODY.playDead * 1000;
  p.bodyPdYaw = p.yaw;
  p.bodyPdC = p.c;
  p.reloadUntil = 0;
  if (p.camoOn) p.camoOn = false;
  // The weapons fall out of the hands, as real drops (like a real death); they come back when you get up. Falling off
  // the zip line, they fall where the body lands (tick).
  p.bodyDrops = [];
  p.bodyDropList = S.game.drops;
  p.bodyDropLater = S.falling(p);
  if (!p.bodyDropLater) dropAll(p);
  // The fake death: the other side (and spectators) get exactly what a real one sends. The last enemy who hit you in
  // the last few seconds "killed" you.
  const hit = p.bodyHit && t - p.bodyHit.t < BODY.fakeBy * 1000 ? p.bodyHit : null;
  const by = hit ? S.players.get(hit.id) : null;
  p.bodyFakeBy = by && by.team !== p.team && S.inTeam(by) ? by.id : null;
  S.broadcast({ t: 'kill', k: p.bodyFakeBy, v: p.id, w: p.bodyFakeBy ? hit.w : 'world', hs: false, streak: 0, first: false, ace: false, gib: null }, q => q.team !== p.team);
  S.broadcast({ t: 'bodyPlayDead', v: p.id, by: p.bodyFakeBy }, q => q.team === p.team);
  S.sendMe(p);
  S.sendRoster();
}

function dropAll(p) {
  const yaw = p.bodyPdYaw;
  p.bodyDropLater = false;
  if (p.inv.primary) { p.bodyDrops.push({ id: S.spawnDrop(p, p.inv.primary, S.offsetPos(p.p, yaw, 0.35)).id, item: p.inv.primary, slot: 'primary' }); p.inv.primary = null; }
  if (p.inv.secondary) { p.bodyDrops.push({ id: S.spawnDrop(p, p.inv.secondary, S.offsetPos(p.p, yaw + Math.PI / 2, 0.45)).id, item: p.inv.secondary, slot: 'secondary' }); p.inv.secondary = null; }
  if (p.inv.c4) {
    S.dropBomb(p, S.offsetPos(p.p, yaw - Math.PI / 2, 0.45));
    const d = S.game.drops[S.game.drops.length - 1];
    if (d?.w === 'c4') p.bodyDrops.push({ id: d.id, slot: 'c4' });
  }
}

// rise: getting up (BODY.rise seconds, weapons picked back up); otherwise (dying, a new round) it just ends.
// quiet: nobody is told (killPlayer or the respawn does that).
function endPlayDead(p, rise, why = '', quiet = false) {
  if (!p.playingDead) return;
  p.playingDead = false;
  p.bodyDropLater = false; // (got up before landing: nothing fell)
  const drops = p.bodyDrops || [];
  const reset = p.bodyDropList !== S.game.drops; // a new round (or warmup) cleared the drops meanwhile
  p.bodyDrops = null;
  p.bodyDropList = null;
  if (rise || reset) {
    for (const e of drops) {
      const d = S.game.drops.find(x => x.id === e.id);
      if (d && !reset && dist2(d.p, p.p) < 2.5) S.takeDrop(p, d);
      else if (reset && e.item && !p.inv[e.slot]) p.inv[e.slot] = e.item; // (the bomb isn't given back: a new round)
    }
  }
  if (rise && p.alive) p.bodyRiseUntil = S.now() + BODY.rise * 1000;
  if (quiet) return;
  S.broadcast({ t: 'bodyUp', v: p.id, pd: 1, why });
  S.sendMe(p);
  S.sendRoster();
}

// ---------------------------------------------------------------- what the other side is told (no leaks)

// The snapshot's players: someone playing dead is dead to everyone (their team's browsers undo it with "bd").
export function hidePl(pl) {
  for (const row of pl) if (S.players.get(row[0])?.playingDead) row[8] = 0;
}

// The roster: dead, one more death, and one more kill for whoever "killed" them (undone by their team's browsers).
export function fakeRoster(list) {
  for (const p of S.players.values()) {
    if (!p.playingDead) continue;
    const e = list.find(x => x.id === p.id);
    if (e) { e.alive = false; e.d++; }
    const k = p.bodyFakeBy != null && list.find(x => x.id === p.bodyFakeBy);
    if (k) k.k++;
  }
}

// The team bar's rows: dead (their team's browsers undo it).
export function fakeBar(rows) {
  for (const r of rows) if (r.q.playingDead) { r.full[1] = 0; r.enemy[1] = 0; }
}

// Radar spotting: a "corpse" is never spotted (and doesn't spot).
export function unspot(list) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].playingDead) list.splice(i, 1);
}

// Bullets against someone lying on the floor (onShoot): their lying hitboxes instead of the standing ones.
export const lying = q => q.downed || q.playingDead;
export function rayBody(q, o, d, pos, maxT) {
  return rayLying(o, d, pos, q.yaw, q.downed ? 'down' : q.c ? 'deadLow' : 'dead', maxT);
}

// The snapshot's "bd" part for player p (empty when there's nothing to say).
export function snap(p) {
  return bdJson[p.team === 'T' || p.team === 'CT' ? p.team : 'X'];
}

// ---------------------------------------------------------------- every tick

// spawnPlayer: a fresh life.
export function reset(p) {
  if (p.playingDead) endPlayDead(p, false, 'spawn', true);
  p.downed = false;
  p.playingDead = false;
  p.bodyPdUsed = false;
  p.bodyDropLater = false;
  p.bodyRiseUntil = 0;
  p.bodyBleeding = false;
  p.bodyBy = null;
  p.bodyHit = null;
  p.bodyFakeBy = null;
  p.bodyRevive = 0;
  p.bodyReviver = null;
}

export function tick(t) {
  const { players } = S;
  const dt = lastT ? Math.min(100, t - lastT) : 0;
  lastT = t;
  // revives in progress (updateActions already dropped the ones where the reviver moved)
  for (const p of players.values()) {
    const a = p.act;
    if (!a || a.type !== 'bodyRevive') continue;
    const q = players.get(a.target);
    if (!p.alive || p.downed || !q || !q.alive || !q.downed || dist2(q.p, a.tpos) > 0.6 || dist2(p.p, q.p) > BODY.reach + 0.6) {
      p.act = null;
      continue;
    }
    q.bodyReviver = p.id;
    q.bodyRevive = Math.min(1, (t - a.start) / a.dur);
    q.bodyReviving = t;
    if (t - a.start >= a.dur) { p.act = null; revive(q, p); }
  }
  for (const q of players.values()) {
    if (q.downed) {
      if (!q.alive) { q.downed = false; continue; }
      if (q.bodyReviving === t) q.bodyBleedEnd += dt; // the bleeding stops while a teammate works on you
      else { q.bodyRevive = 0; q.bodyReviver = null; }
      if (t >= q.bodyBleedEnd) bleedOut(q);
    }
    if (q.playingDead) {
      // the corpse keeps its facing and crouch (off the zip line the browser's positions go through until it lands;
      // then its weapons fall)
      q.yaw = q.bodyPdYaw;
      q.c = q.bodyPdC;
      if (q.bodyDropLater && !S.falling(q)) { dropAll(q); S.sendMe(q); }
      if (t >= q.bodyPdEnd || (S.game.phase !== 'live' && S.game.phase !== 'warmup')) endPlayDead(q, true, 'time');
    }
  }
  // Nobody standing on a team: its downed bleed out at once (so a round can't stall). If the only ones standing are
  // playing dead, they get up: the round wouldn't end anyway.
  for (const team of ['T', 'CT']) {
    let up = 0, pd = 0;
    for (const q of players.values()) if (q.team === team && standing(q)) { up++; if (q.playingDead) pd++; }
    if (!up) { for (const q of [...players.values()]) if (q.team === team && q.downed) bleedOut(q); }
    else if (pd === up) {
      for (const q of players.values()) {
        if (q.team !== team || !q.playingDead) continue;
        endPlayDead(q, true, 'alone');
        S.send(q, { t: 'msg', text: 'Your team is down — no point playing dead any more.' });
      }
    }
  }
  // the snapshot part: who's down (with how long they have and the revive, for their own team), who's getting up,
  // and (only to their team) who's playing dead and whom the other side thinks killed them
  const down = [], up = [], pd = { T: [], CT: [] };
  for (const q of players.values()) {
    if (!q.alive) continue;
    if (q.downed) down.push(q);
    if (rising(q, t)) up.push([q.id, r2(1 - (q.bodyRiseUntil - t) / (BODY.rise * 1000))]);
    if (q.playingDead && pd[q.team]) pd[q.team].push([q.id, q.bodyFakeBy || 0]);
  }
  for (const side of ['T', 'CT', 'X']) {
    const d = down.map(q => (q.team === side ? [q.id, r2(Math.max(0, q.bodyBleedEnd - t) / (BODY.bleed * 1000)), r2(q.bodyRevive || 0), q.bodyReviver || 0] : [q.id]));
    const p = pd[side] || [];
    bdJson[side] = d.length || up.length || p.length ? ',"bd":' + JSON.stringify({ d, u: up, p }) : '';
  }
}
