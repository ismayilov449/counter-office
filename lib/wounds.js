// "Downed & wounds" on the server (ROADMAP group 1; docs/features/wounds.md). server.js calls in at a few hooks marked
// "wounds:"; everything else is here.
//
// 1.1 Dragging a downed teammate: hold E on him (the revive starts) and walk — the revive pauses and you drag him,
// slowly, with only your pistol; stop walking (E still held) and the revive goes on from where it was; let go of E and
// you let go of him. He keeps bleeding (blood trail). It ends when either of you gets up or dies, on a ladder, the zip
// line, the CCTV desk, in a car, with the drone, holding a hostage, or when you get too far from him. The drag itself is
// the generic engine in lib/drag.js (also for hostages and corpses later: `wounds.drag`).
// 1.2 Interrogating a downed enemy: hold E 3 s on him (in front, close; once per downing). The nearest of his standing
// teammates then shows on your whole team's radar for 5 s (the radar's own spotting). Then finish him if you like.
// The downed suicide: a downed player holds K for 5 s and shoots himself with his pistol — an interrogation not yet
// done gets nothing; the kill goes to whoever downed him (bets too).
// 1.3 Wounds: a bullet in the leg limps you, in the arm (a torso hit out at the side) shakes your aim, a head hit you
// survive (a graze) blurs your sight; until you die or the round ends; a bandage (P) halves them. The browser applies
// them to the player (it moves him and aims his shots); the server gives bots the same speed and spread
// (p.wdSpeed, p.wdSpread, read by lib/bots.js).
// 1.4 The adrenaline syringe (buy menu, Equipment): a revive takes 2 s instead of 5 and uses it up; the revived man
// gets up with shaking aim and blurred sight that fade over 20 s (1.3's effects).
//
// Its fields on a player all start with "wd" (wdUse: E held; wd: the wounds { l, a, h }; wdAd: the adrenaline's
// after-effect { until, dur }; wdEndAt: the suicide's shot; wdAsked: interrogated this downing; wdKeep: the revive's
// progress a drag paused; wdRevive: the revive act this player last started, ...); the syringe is p.inv.adren.
import { BODY } from '../shared/body.js';
import { WOUNDS, armSide, woundFx } from '../shared/wounds.js';
import { WEAPONS } from '../shared/weapons.js';
import { PLAYER, ladderAt } from '../shared/physics.js';
import { siteAt, mapMode } from '../shared/maps/index.js';
import * as body from './body.js';
import { createDrag } from './drag.js';

const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const r2 = v => Math.round(v * 100) / 100;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const D = WOUNDS.drag;

// S: what server.js hands over — players, game, cfg, map(), now, send, broadcast, sendMe, killPlayer, inTeam, busy
// (on the zip line / at the CCTV desk), disguise (reveal).
export function createWounds(S) {
  const drag = createDrag();
  const reveals = []; // { id, team, until }: interrogated away, on that team's radar
  let wd = null; // this tick's snapshot part
  const say = (p, text) => S.send(p, { t: 'msg', text });
  const live = () => S.game.phase === 'live';
  const classic = () => S.cfg.gameMode === 'classic';
  // on their feet: not down, not playing dead, not dead
  const standing = q => q.alive && !q.downed && !q.playingDead && S.inTeam(q);
  // hands full or somewhere else: a gadget, a car, the drone, a hostage held as a shield
  const handsFull = p => S.busy(p) || p.driving != null || p.riding != null || p.piloting != null || p.shield != null;
  const onLadder = p => !!ladderAt(S.map().ladders, p.p, PLAYER.height);
  // where E plants or defuses the bomb (E does that there, not an interrogation)
  const bombSpot = p => live() && ((p.team === 'T' && p.inv.c4 && !!siteAt(S.map(), p.p)) || (p.team === 'CT' && S.game.bomb?.state === 'planted' && !!S.game.bomb.p && dist3(p.p, S.game.bomb.p) < 1.8));
  // roughly in front (or right at his feet), as body.js's revive
  const inFront = (p, q) => {
    if (flat(p.p, q.p) <= 0.9) return true;
    const off = Math.atan2(-(q.p[0] - p.p[0]), -(q.p[2] - p.p[2])) - p.yaw;
    return Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= 1.05;
  };

  // ---------------------------------------------------------------- 1.1 dragging a downed teammate

  function cantDrag(p) {
    if (!standing(p) || p.bot || !live()) return 'down';
    if (handsFull(p)) return 'busy';
    if (onLadder(p)) return 'ladder';
    if (p.bandageUntil && S.now() < p.bandageUntil) return 'busy'; // (bandaging, blood.js)
    return null;
  }
  const draggable = (p, q) => q !== p && q.alive && q.downed && q.team === p.team && !drag.draggerOf(q) && !drag.targetOf(q) &&
    flat(p.p, q.p) <= D.reach && Math.abs(q.p[1] - p.p[1]) < 1.2;
  // the one in his revive, or the nearest downed teammate within reach (behind him too: he's holding him)
  function dragTarget(p) {
    if (p.act?.type === 'bodyRevive') { const q = S.players.get(p.act.target); return q && draggable(p, q) ? q : null; }
    let best = null, bd = Infinity;
    for (const q of S.players.values()) if (draggable(p, q) && flat(p.p, q.p) < bd) { best = q; bd = flat(p.p, q.p); }
    return best;
  }

  function startDrag(p, t) {
    if (drag.get(p) || drag.draggerOf(p) || !p.wdUse || cantDrag(p) || (p.act && p.act.type !== 'bodyRevive')) return;
    const q = dragTarget(p);
    if (!q) return;
    // the revive pauses: its progress is kept for when he stands still again
    q.wdKeep = p.act ? Math.max(0, Math.min(0.95, (t - p.act.start) / p.act.dur)) : 0;
    p.act = null;
    S.disguise?.reveal(p, 'drag'); // (pulling a wounded enemy along in their uniform gives it away)
    drag.start(p, q, { kind: 'mate', gap: D.gap, speed: D.speed, lose: D.lose, place: placeMate, check: checkMate, onStop: stoppedMate });
    say(q, `${p.name} is dragging you to cover`);
  }

  function placeMate(q, pos, yaw) {
    const t = S.now();
    q.p = pos;
    q.yaw = yaw; // head first, towards whoever pulls him
    q.c = 1;
    q.history.push({ t, p: pos, c: 1 });
    while (q.history.length && q.history[0].t < t - 1000) q.history.shift();
  }

  function checkMate(dr) {
    const p = dr.dragger, q = dr.target;
    if (S.players.get(p.id) !== p || S.players.get(q.id) !== q) return 'gone'; // (left the game)
    if (!q.alive || !q.downed) return 'up'; // revived (by someone else) or killed
    if (!live()) return 'round';
    if (!p.wdUse) return 'letgo';
    return cantDrag(p);
  }

  function stoppedMate(dr, why) {
    const p = dr.dragger, q = dr.target, t = S.now();
    // (for a moment the body stays where the drag left it: the dragged browser's positions still on their way were
    // smoothed towards ours and lag behind; taken as his, the body "moved" and body.js dropped the revive below.
    // Integration 2026-11-08: the intermittent "revive right after the drag" miss)
    q.wdHeldUntil = t + D.hold;
    // he stopped walking, E still held: the revive goes on from where it was
    if (why === 'still' && p.wdUse && standing(p) && q.alive && q.downed && !p.act) {
      p.act = { type: 'bodyRevive', start: t, pos: p.p.slice(), dur: BODY.revive * 1000, target: q.id, tpos: q.p.slice() };
      setRevive(p, t);
    } else q.wdKeep = 0;
    if (why === 'lost') say(p, `You lost your grip on ${q.name}.`);
    else if (why === 'ladder') say(p, "You can't drag him up a ladder — you let go.");
  }

  // A revive (body.js's act, started by E or by stopping a drag), once: the syringe's 2 s, and the progress a drag
  // paused (it ends sooner).
  function setRevive(p, t) {
    const a = p.act;
    if (!a || a.type !== 'bodyRevive' || a.wd) return;
    a.wd = true;
    const q = S.players.get(a.target);
    if (p.inv?.adren && !p.bot) { a.dur = WOUNDS.adren.revive * 1000; a.adren = true; }
    if (q?.wdKeep > 0) { a.start = t - q.wdKeep * a.dur; q.wdKeep = 0; }
    p.wdRevive = a;
  }

  // body.js: someone got up after a revive. With the syringe: it's used up, and he gets up shaky (1.3's effects).
  body.onRevive((q, p) => {
    const a = p.wdRevive;
    p.wdRevive = null;
    q.wdKeep = 0;
    if (!a?.adren || a.target !== q.id || !p.inv?.adren) return;
    p.inv.adren = 0;
    S.sendMe(p);
    q.wdAd = { until: S.now() + WOUNDS.adren.after * 1000, dur: WOUNDS.adren.after * 1000 };
    sendWounds(q, 'ad');
    say(p, `Adrenaline: ${q.name} is up — he'll be shaky for a while.`);
  });

  // ---------------------------------------------------------------- 1.2 interrogation and the downed suicide

  // The downed enemy E would interrogate: close, in front, not yet interrogated this downing, nobody else at it.
  function askTarget(p) {
    let best = null, bd = Infinity;
    for (const q of S.players.values()) {
      if (q === p || !q.alive || !q.downed || !S.inTeam(q) || q.team === p.team || q.wdAsked) continue;
      const d = flat(p.p, q.p);
      if (d > BODY.reach || Math.abs(q.p[1] - p.p[1]) > 1.2 || d >= bd || !inFront(p, q)) continue;
      if ([...S.players.values()].some(o => o !== p && o.act?.type === 'wdAsk' && o.act.target === q.id)) continue;
      best = q; bd = d;
    }
    return best;
  }

  // onUse, right after the revive: true if E starts an interrogation.
  function use(p, t) {
    if (p.act || p.bot || !standing(p) || !live() || !classic() || handsFull(p) || bombSpot(p)) return false;
    const q = askTarget(p);
    if (!q) return false;
    p.act = { type: 'wdAsk', start: t, pos: p.p.slice(), dur: WOUNDS.ask * 1000, target: q.id, tpos: q.p.slice() };
    S.disguise?.reveal(p, 'ask');
    return true;
  }

  // He talks: the nearest of his teammates still on their feet (not one in our uniform: he'd be no dot on our radar
  // anyway) shows on the interrogator's team's radar for WOUNDS.reveal seconds.
  function talk(p, q, t) {
    q.wdAsked = true;
    const mates = [...S.players.values()].filter(e => e !== q && e.team === q.team && standing(e) && e.disguise !== p.team);
    if (!mates.length) { say(p, `${q.name} has nobody left to give away.`); return; }
    mates.sort((a, b) => dist3(a.p, q.p) - dist3(b.p, q.p));
    const e = mates[0];
    reveals.push({ id: e.id, team: p.team, until: t + WOUNDS.reveal * 1000 });
    S.broadcast({ t: 'wdReveal', by: p.id, v: q.id, id: e.id, s: WOUNDS.reveal }, o => o.team === p.team);
    S.send(q, { t: 'wdTalked', by: p.id, id: e.id });
  }

  function startEnd(p, t) {
    if (!p.alive || !p.downed || p.wdEndAt) return;
    if (!p.inv.secondary) { say(p, 'You have no pistol to do it with.'); return; }
    p.wdEndAt = t + WOUNDS.suicide * 1000;
    p.w = p.inv.secondary.id;
  }

  function shoot(p, t) {
    const w = p.inv.secondary?.id || 'glock';
    p.wdEndAt = 0;
    p.wdShotAt = t;
    S.broadcast({ t: 'wdShot', v: p.id, w, p: [r2(p.p[0]), r2(p.p[1] + 0.35), r2(p.p[2])] });
    p.wdHow = 'suicide'; // (body.js's bodyKill says so; the kill itself goes to whoever downed him)
    S.killPlayer(p, p, w, false);
    p.wdHow = null;
  }

  // ---------------------------------------------------------------- 1.3 wounds

  // onShoot, just before a bullet's applyDamage: where it struck (an arm, or the torso?). pos: the victim's rewound feet.
  function shotAt(q, o, d, t, pos) {
    q.wdShot = { h: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], pos: pos.slice(), at: S.now() };
  }

  // applyDamage, after the hit: a bullet that hurt and didn't drop him leaves a wound.
  function hurt(v, attacker, dmg, part, weapon) {
    const shot = v.wdShot;
    v.wdShot = null;
    if (!shot || S.now() - shot.at > 5 || !classic() || !v.alive || v.hp <= 0 || v.zombie || !S.inTeam(v)) return;
    const def = WEAPONS[weapon];
    if (!def || def.melee || !(dmg > 0)) return;
    const k = part === 'legs' ? 'l' : part === 'head' ? 'h' : (part === 'chest' || part === 'stomach') && armSide(shot.h, shot.pos, v.yaw) ? 'a' : null;
    if (!k) return;
    const w = (v.wd ||= { l: 0, a: 0, h: 0 });
    if (w[k] === 1) return;
    w[k] = 1;
    sendWounds(v, k);
  }

  // What's left of the adrenaline's after-effect, 1 .. 0.
  const adLeft = (p, t = S.now()) => (p.wdAd && t < p.wdAd.until ? (p.wdAd.until - t) / p.wdAd.dur : 0);

  // The bots' share (lib/bots.js reads them) and P's (blood.js: a fresh wound can be bandaged without bleeding).
  function factors(p) {
    const fx = woundFx(p.wd, adLeft(p));
    p.wdSpeed = fx.speed;
    p.wdSpread = fx.spread;
    p.wdBandage = !!p.wd && (p.wd.l === 1 || p.wd.a === 1 || p.wd.h === 1);
  }

  // Tell the player (n: what's new — 'l', 'a', 'h', 'band' (bandaged), 'ad' (adrenaline)).
  function sendWounds(p, n = null) {
    factors(p);
    if (p.bot) return;
    const w = p.wd || { l: 0, a: 0, h: 0 }, t = S.now();
    S.send(p, { t: 'wdWounds', l: w.l, a: w.a, h: w.h, ad: p.wdAd ? Math.max(0, Math.round(p.wdAd.until - t)) : 0, adT: p.wdAd?.dur || 0, n });
  }

  function newLife(p) {
    const had = !!(p.wd || p.wdAd);
    p.wdSeq = p.spawnSeq;
    Object.assign(p, { wd: null, wdAd: null, wdAsked: false, wdKeep: 0, wdEndAt: 0, wdBandAt: 0, wdRevive: null, wdShot: null, wdWasDown: false });
    factors(p);
    if (had) sendWounds(p);
  }

  // ---------------------------------------------------------------- the hooks

  // handle() (every message), after body.js's: true if it's handled here.
  function handle(p, m) {
    switch (m.t) {
      case 'use': // (E held, for the drag; then onUse does its work)
        p.wdUse = !!m.on;
        if (!m.on) drag.stop(p, 'letgo');
        return false;
      case 'wdDrag': // walking with E held over a downed teammate (on), or standing still again (off)
        if (m.on) startDrag(p, S.now());
        else drag.stop(p, 'still');
        return true;
      case 'wdEnd': // K held while down (on), or let go (off)
        if (m.on) startEnd(p, S.now());
        else p.wdEndAt = 0;
        return true;
      case 'state': { // being dragged: the server says where he is (and which way his body lies)
        // (just after a drag his browser may still say where its smoothing had got to: kept where the drag left him
        // until it agrees, D.hold ms at most; see stoppedMate)
        const held = p.wdHeldUntil > S.now() && Array.isArray(m.p) && Math.hypot(m.p[0] - p.p[0], m.p[2] - p.p[2]) > 0.25;
        if (!drag.draggerOf(p) && !held) return false;
        if (p.alive && m.sq === p.spawnSeq) {
          if (isNum(m.pitch)) p.pitch = m.pitch;
          if (typeof m.w === 'string' && (m.w === p.inv.secondary?.id || m.w === 'knife')) p.w = m.w;
        }
        return true;
      }
      default:
        return false;
    }
  }

  // onShoot / onNade: true if this shot (or throw) is refused.
  function noFire(p, w) {
    if (p.act?.type === 'wdAsk' || p.wdEndAt) return true;
    if (drag.get(p)) return !(w === p.inv.secondary?.id || (w === 'knife' && !p.inv.secondary));
    return false;
  }

  // onBuy, for the syringe: a reason, or null.
  function cantBuy(p) {
    if (!classic() || mapMode(S.map()) === 'elim') return 'Adrenaline is for classic rounds on bomb and hostage maps.';
    if (p.inv.adren) return 'You already have an adrenaline syringe.';
    return null;
  }

  // Every tick, after the bots and hostages have moved.
  function tick(t, dt) {
    const { players } = S;
    for (const p of players.values()) {
      if (p.wdSeq !== p.spawnSeq) newLife(p);
      if (p.downed && p.alive && !p.wdWasDown) { p.wdAsked = false; p.wdKeep = 0; } // a new downing
      p.wdWasDown = !!(p.downed && p.alive);
      setRevive(p, t);
      // a bandage done (blood.js clears bandageUntil): the wounds are half as bad
      if (p.wdBandAt && !p.bandageUntil && p.alive && p.wd) {
        let any = false;
        for (const k of ['l', 'a', 'h']) if (p.wd[k] === 1) { p.wd[k] = 0.5; any = true; }
        if (any) sendWounds(p, 'band');
      }
      p.wdBandAt = p.bandageUntil || 0;
      if (p.wdAd) {
        if (t >= p.wdAd.until || !p.alive) { p.wdAd = null; sendWounds(p); }
        else factors(p);
      }
      // the suicide: the shot goes off
      if (p.wdEndAt) {
        if (!p.alive || !p.downed) p.wdEndAt = 0;
        else if (t >= p.wdEndAt) shoot(p, t);
      }
    }
    // interrogations in progress
    for (const p of players.values()) {
      const a = p.act;
      if (!a || a.type !== 'wdAsk') continue;
      const q = players.get(a.target);
      if (!standing(p) || !live() || !q || !q.alive || !q.downed || flat(q.p, a.tpos) > 0.6 || flat(p.p, q.p) > BODY.reach + 0.6) {
        p.act = null;
        if (q && q.wdShotAt === t) say(p, `${q.name} shot himself before he talked.`);
        continue;
      }
      if (t - a.start >= a.dur) { p.act = null; talk(p, q, t); }
    }
    // interrogated away: spotted (the radar's own red dot) until the time is up
    for (let i = reveals.length - 1; i >= 0; i--) {
      const r = reveals[i], e = players.get(r.id);
      if (t >= r.until || !e || !e.alive || !live()) { reveals.splice(i, 1); continue; }
      (e.spotAt ||= {})[r.team] = t;
    }
    drag.tick(dt);
    // the snapshot's "wd": who drags whom (and where the dragged body is), who is ending it, who is interrogating whom,
    // who has been interrogated already (this downing)
    const d = drag.list('mate').map(dr => [dr.dragger.id, dr.target.id, r2(dr.target.p[0]), r2(dr.target.p[1]), r2(dr.target.p[2])]);
    const k = [], i = [], a = [];
    for (const p of players.values()) {
      if (p.wdEndAt && p.alive) k.push([p.id, r2(Math.min(1, 1 - (p.wdEndAt - t) / (WOUNDS.suicide * 1000)))]);
      if (p.act?.type === 'wdAsk') i.push([p.id, p.act.target, r2(Math.min(1, (t - p.act.start) / p.act.dur))]);
      if (p.wdAsked && p.downed && p.alive) a.push(p.id);
    }
    wd = d.length || k.length || i.length || a.length ? { wd: { d, k, i, a } } : null;
  }

  return {
    drag, // the generic drag engine (lib/drag.js) for other features: hostages (group 6), corpses (group 7)
    handle, use, noFire, shotAt, hurt, tick, cantBuy,
    snap: () => wd || {},
    // for other features: is p dragging / being dragged, a player's wounds (0, 0.5, 1 each) and the adrenaline left
    dragging: p => drag.targetOf(p), draggedBy: p => drag.draggerOf(p),
    woundsOf: p => ({ ...(p.wd || { l: 0, a: 0, h: 0 }), ad: adLeft(p) }),
  };
}
