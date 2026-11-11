// Close combat (ROADMAP group 8, rules in shared/closecombat.js; docs/features/closecombat.md). server.js calls in at a
// few hooks marked "closecombat:". Bots don't use any of it.
// State: p.inv.sup = 1 with a suppressor (bought; lost with a death, like the rest of the inventory).
import { WEAPONS, slotKey } from '../shared/weapons.js';
import { CC, supFits, behind } from '../shared/closecombat.js';
import { PLAYER, overlapsBox } from '../shared/physics.js';
import { doorBox, doorCenter, openingSide } from '../shared/doors.js';

// api: { game, players, send, broadcast, sendMe, now, mates(a, b), eyeOf(p), lineOfSight(a, b), spawnDrop(p, item, at, thrown),
//   blocked(p) (in a car, on a gadget, holding or carrying a hostage, lying on the floor...), noDisarm() (Gun Game, Zombie),
//   map(), world(), useDoor(p, i), doorBlocked(box) (a hostage or a car in it), applyDamage(...), ff() (friendly fire) }
export function createCloseCombat(api) {
  const { game, players, send, broadcast } = api;
  // ---- 8.1 suppressors
  const suppressed = (p, w) => !!p.inv?.sup && supFits(w);
  // onShoot's weapon: a suppressed gun is a copy with less damage and `sup` set (onShoot reads def.damage everywhere).
  function def(p, w) {
    const d = WEAPONS[w];
    return d && suppressed(p, w) ? { ...d, damage: d.damage * CC.damage, sup: true } : d;
  }

  // ---- 8.2 disarming from behind: E within reach of an enemy, inside his back arc, snatches the gun in his hands.
  // The gun goes into the same slot of ours if it's free, else onto the floor in front of us. He keeps his other
  // weapons and is switched to his knife.
  const gunInHands = q => { const slot = slotKey(q.w); return slot && q.inv[slot]?.id === q.w ? slot : null; };
  function victim(p) {
    for (const q of players.values()) {
      if (q === p || !q.alive || q.downed || q.bot || q.zombie || api.mates(p, q) || !inTeam(q) || api.blocked(q) || !gunInHands(q)) continue;
      if (Math.hypot(q.p[0] - p.p[0], q.p[2] - p.p[2]) > CC.reach || Math.abs(q.p[1] - p.p[1]) > CC.reachY) continue;
      if (behind(p.p, q.p, q.yaw) && api.lineOfSight(api.eyeOf(p), api.eyeOf(q))) return q;
    }
    return null;
  }
  function disarm(p, t) {
    if (!p.alive || p.downed || p.bot || p.zombie || !inTeam(p) || api.noDisarm() || game.phase === 'freeze' || api.blocked(p)) return false;
    if (t - (p.ccDisarmAt || 0) < CC.cooldown * 1000) return false;
    const v = victim(p);
    if (!v) return false;
    const slot = gunInHands(v), item = v.inv[slot], name = WEAPONS[item.id].name;
    v.inv[slot] = null;
    if (v.reloadWeapon === item.id) v.reloadUntil = 0;
    const kept = !p.inv[slot];
    if (kept) p.inv[slot] = item;
    // (on the floor half a metre in front of us; it's his drop, so for dropGuard s he can't walk over it to take it back)
    else api.spawnDrop(v, item, [p.p[0] - Math.sin(p.yaw) * 0.5, p.p[1], p.p[2] - Math.cos(p.yaw) * 0.5]).until = t + CC.dropGuard * 1000;
    p.ccDisarmAt = t;
    api.sendMe(p);
    api.sendMe(v);
    send(v, { t: 'ccDisarmed', by: p.id, w: item.id });
    send(v, { t: 'msg', text: `You were disarmed! ${p.name} snatched your ${name} from behind.`, big: true });
    send(p, { t: 'msg', text: kept ? `You snatched his ${name}.` : `You snatched his ${name}: it's on the floor in front of you.` });
    broadcast({ t: 'sfx', s: 'pickup', p: v.p });
    return true;
  }

  // ---- 8.3 door fights (Mansion's swinging doors; not hatches, grates or the garage's roller door)
  // Acts: { type: 'ccHold', door, side } holding a closed door shut (crouched, E held); { type: 'ccPush', door, side }
  // pushing it from the other side (E held). side: the way the door would swing if this player opened it.
  const swingDoor = d => d && !d.hatch && !d.roller;
  const doorOf = i => api.map().doors?.[i];
  const closed = i => api.world().doorStates[i] === 0 && !game.doorOpening?.[i];
  const acts = (i, type) => [...players.values()].filter(q => q.act?.type === type && q.act.door === i);
  // Fastest the player went over the last half second (horizontal m/s, from the positions his browser sent).
  function speed(p, t) {
    const h = p.history || [];
    let best = 0;
    for (let j = h.length - 1, k = j; j > 0 && h[j].t > t - 500; j--) {
      while (k > 0 && h[j].t - h[k].t < 120) k--;
      const dt = (h[j].t - h[k].t) / 1000;
      if (dt > 0.05) best = Math.max(best, Math.hypot(h[j].p[0] - h[k].p[0], h[j].p[2] - h[k].p[2]) / dt);
    }
    return best;
  }
  // Swing door i open to `side` hard: everyone just behind it on that side is shoved back (out of the leaf's way)
  // and, from a kick (by), hurt. Returns false (nothing done) if a hostage or a car stands in the leaf's way.
  function slam(i, side, by) {
    const d = doorOf(i), box = doorBox(d, side);
    if (api.doorBlocked(box)) return false;
    const c = doorCenter(d), k = d.axis === 'x' ? 0 : 2, n = 2 - k;
    for (const q of players.values()) {
      if (!q.alive || q === by || Math.abs(q.p[1] + 1 - c[1]) > 1.2 || (q.p[n] - d.hinge[n]) * side <= 0) continue;
      if (Math.hypot(q.p[0] - c[0], q.p[2] - c[2]) > CC.hitReach && !overlapsBox(q.p[0], q.p[1], q.p[2], PLAYER.radius, PLAYER.height, box)) continue;
      if (q.act?.type?.startsWith('cc')) q.act = null;
      if (overlapsBox(q.p[0], q.p[1], q.p[2], PLAYER.radius, PLAYER.height, box)) {
        // (standing where the leaf swings to: moved into the doorway beside it, or his browser would put him on top of it)
        q.p = q.p.slice();
        q.p[k] = d.hinge[k] + d.dir * (0.05 + PLAYER.radius + 0.03);
        send(q, { t: 'ccShove', p: q.p });
      }
      const v = [0, 0.4, 0];
      v[n] = side * CC.push;
      send(q, { t: 'knock', v, aim: by ? CC.aim : CC.aim / 2 });
      if (by && (!api.mates(by, q) || api.ff())) api.applyDamage(q, by, CC.kickDamage, 'chest', 'door', 1, null, c);
      if (!q.bot) send(q, { t: 'msg', text: by ? `${by.name} kicked the door into you!` : 'They forced the door open!', big: !!by });
    }
    if (game.doorOpening) delete game.doorOpening[i];
    const states = api.world().doorStates.slice();
    states[i] = side;
    api.world().setDoors(states);
    broadcast({ t: 'doors', doors: states, i, open: true, quiet: 1, p: c });
    broadcast({ t: 'sfx', s: 'crash', p: c });
    return true;
  }
  // Is door i held shut against p (someone on its other side holding it)? useDoor asks first (bots too).
  function heldShut(i, p) {
    const h = acts(i, 'ccHold')[0];
    if (!h || h.act.side === openingSide(doorOf(i), p.p)) return false;
    if (p.ws?.readyState === 1 && !p.bot) send(p, { t: 'msg', text: 'The door is held shut from the other side.' });
    return true;
  }
  // E on a closed door (onUse, instead of opening it): push against a holder; running: kick it open; crouched: hold
  // it shut (a quick tap still opens it: see release). false: open it the usual way.
  function door(p, i, t) {
    const d = doorOf(i);
    if (p.bot || !swingDoor(d) || !closed(i)) return false;
    const side = openingSide(d, p.p), holders = acts(i, 'ccHold');
    const act = type => { p.act = { type, door: i, side, start: t, pos: p.p.slice(), dur: type === 'ccHold' ? 3.6e6 : CC.win * 1000 }; sendCounts(i); return true; };
    if (holders.length && holders[0].act.side !== side) {
      send(p, { t: 'msg', text: 'Someone is holding the door shut! Keep holding E to push: the side with more people wins.' });
      return act('ccPush');
    }
    if (holders.length) return p.c ? act('ccHold') : false;
    if (speed(p, t) >= CC.run) return slam(i, side, p);
    return p.c ? act('ccHold') : false;
  }
  // E let go: a hold shorter than a tap (with nobody pushing yet) was only meant to open the door.
  function release(p, t) {
    const a = p.act;
    if (a?.type !== 'ccHold') return;
    p.act = null;
    sendCounts(a.door);
    if (t - a.start < CC.tap * 1000 && !acts(a.door, 'ccPush').length && closed(a.door)) api.useDoor(p, a.door);
  }
  // Both sides see the count ("2 vs 1") on their progress bar.
  const last = new Map();
  function sendCounts(i) {
    const h = acts(i, 'ccHold'), q = acts(i, 'ccPush'), key = `${h.length}:${q.length}`;
    if (last.get(i) === key) return;
    last.set(i, key);
    for (const x of [...h, ...q]) send(x, { t: 'ccDoor', h: h.length, p: q.length });
  }
  // updateActions, for the cc acts: still there, still crouched (holding), the door still closed; more pushers than
  // holders for CC.win s: it bursts open towards the holders. Pushing a door nobody holds any more just opens it.
  function act(p, a, t) {
    if (!p.alive || p.downed || Math.hypot(p.p[0] - a.pos[0], p.p[2] - a.pos[2]) > 0.6 || !closed(a.door) || (a.type === 'ccHold' && !p.c)) {
      p.act = null;
      sendCounts(a.door);
      return;
    }
    if (a.type !== 'ccPush') return;
    const holders = acts(a.door, 'ccHold').filter(q => q.act.side !== a.side);
    if (!holders.length) { p.act = null; sendCounts(a.door); api.useDoor(p, a.door); return; }
    const pushers = acts(a.door, 'ccPush').filter(q => q.act.side === a.side);
    if (pushers.length <= holders.length) { a.start = t; return; } // (ties: the holders)
    if (t - a.start < a.dur) return;
    for (const q of pushers) q.act = null;
    slam(a.door, a.side, null);
    sendCounts(a.door);
  }

  return { def, suppressed, disarm, door, release, heldShut, act };
}
const inTeam = p => p.team === 'T' || p.team === 'CT';
