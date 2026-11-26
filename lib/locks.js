// Locked doors on the server (rules in shared/locks.js; the browser's part: public/js/locks.js). server.js calls in at
// hooks marked "locks:". Messages: 'locks' { ids: [locked door indices] }, 'sfx' lockpick / lock / kick; from the
// browser 'lock' (L at a door).
import { LOCK, sideOf } from '../shared/locks.js';
import { doorCenter, openingSide } from '../shared/doors.js';

// api: { game, players, map(), world(), now, send, broadcast, nearestDoor(p, max), speed(p, t) (m/s, closecombat),
//   kickOpen(i, side, by) (closecombat's slam: the door bursts open, shoving whoever is behind it) }
export function createLocks(api) {
  const { game, send, broadcast } = api;
  const locked = new Set(), kicks = new Map(); // door -> { n, at }
  const msg = (p, text) => { if (!p.bot && p.ws) send(p, { t: 'msg', text }); };
  const sendLocks = () => broadcast({ t: 'locks', ids: [...locked] });
  const door = i => api.map().doors?.[i];
  const closed = i => api.world().doorStates[i] === 0 && !game.doorOpening?.[i];
  // From the side the key is needed (the outside), and not a Terrorist: the lock stops them.
  const stops = (p, i) => locked.has(i) && closed(i) && p.team !== 'T' && sideOf(door(i), doorCenter(door(i)), p.p) === door(i).lock;
  function unlock(i) { if (locked.delete(i)) { kicks.delete(i); sendLocks(); } }
  function kick(p, i, t) {
    const k = kicks.get(i) || { n: 0, at: 0 };
    if (t - k.at < LOCK.kickGap * 1000) return;
    k.n++; k.at = t;
    kicks.set(i, k);
    broadcast({ t: 'sfx', s: 'kick', p: doorCenter(door(i)) });
    if (k.n < LOCK.kicks) return msg(p, `You kick the locked door (${k.n} / ${LOCK.kicks})`);
    unlock(i);
    api.kickOpen(i, openingSide(door(i), p.p), p);
  }

  return {
    stops,
    // Each round: `start` of the lockable doors that start locked (not the gate: d.lockOpen) locked at random.
    roundStart() {
      locked.clear(); kicks.clear();
      const pool = (api.map().doors || []).map((d, i) => (d.lock && !d.lockOpen ? i : -1)).filter(i => i >= 0);
      for (let n = 0; n < LOCK.start && pool.length; n++) locked.add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      sendLocks();
    },
    // onUse at a door, before closecombat: a CT outside a locked door picks it (crouched), kicks it (running), or is
    // told it's locked. True when it took the E.
    use(p, i, t) {
      if (!stops(p, i)) return false;
      if (p.c) { p.act = { type: 'pick', start: t, pos: p.p.slice(), dur: LOCK.pick * 1000, door: i, next: t }; return true; }
      if (api.speed(p, t) >= 3) { kick(p, i, t); return true; }
      msg(p, 'Locked. Crouch and hold E to pick the lock, run into it with E to kick it in, or blow it open.');
      return true;
    },
    // useDoor, for everyone else who tries (bots, hostages): a locked door stays shut; a CT bot kicks it.
    blocks(p, i) {
      if (!stops(p, i)) return false;
      if (p.bot && p.team === 'CT') kick(p, i, api.now());
      return true;
    },
    // updateActions, after its own checks: picking, a click now and then on the other side.
    act(p, a, t) {
      if (!p.c || !stops(p, a.door)) { p.act = null; return; }
      if (t >= a.next) { a.next = t + 900; broadcast({ t: 'sfx', s: 'lockpick', p: doorCenter(door(a.door)) }); }
      if (t - a.start < a.dur) return;
      p.act = null;
      unlock(a.door);
      msg(p, 'Lock picked.');
    },
    // L: a Terrorist locks or unlocks the closed lockable door he's at.
    key(p) {
      if (!p.alive || p.team !== 'T' || game.phase === 'end') return;
      const d = api.nearestDoor(p, LOCK.reach);
      if (!d || !door(d.i).lock) return msg(p, 'No lockable door here.');
      if (!closed(d.i)) return msg(p, 'Close the door first.');
      if (locked.has(d.i)) { unlock(d.i); msg(p, 'Unlocked.'); } else { locked.add(d.i); kicks.delete(d.i); sendLocks(); msg(p, 'Locked: the CTs have to pick it, kick it in or blow it.'); }
      broadcast({ t: 'sfx', s: 'lock', p: doorCenter(door(d.i)) });
    },
    // An explosion at `at`: locked doors within LOCK.blast m are unlocked (their locks blown).
    blast(at) {
      for (const i of [...locked]) { const c = doorCenter(door(i)); if (Math.hypot(at[0] - c[0], at[1] - c[1], at[2] - c[2]) < LOCK.blast) unlock(i); }
    },
    send(p) { send(p, { t: 'locks', ids: [...locked] }); },
  };
}
