// Locked doors, the browser's part (rules in shared/locks.js; the server's part: lib/locks.js): which doors are locked,
// the hints at a lockable door, L, the picking's progress label.
import { LOCK, sideOf } from '/shared/locks.js';
import { doorCenter } from '/shared/doors.js';

// ctx: { me, game, send(m), map() }
export function createLocks(ctx) {
  const { me, game } = ctx;
  let locked = new Set();
  // The closed lockable door within reach: { i, d, c } or null.
  function near() {
    let best = null, bd = LOCK.reach;
    (ctx.map().doors || []).forEach((d, i) => {
      if (!d.lock || game.doors?.[i] !== 0) return;
      const c = doorCenter(d), dd = Math.hypot(me.p[0] - c[0], me.p[2] - c[2]);
      if (dd < bd && Math.abs(me.p[1] + 1 - c[1]) < 1.6) { bd = dd; best = { i, d, c }; }
    });
    return best;
  }
  return {
    handlers: { locks(m) { locked = new Set(m.ids); } },
    // L: a Terrorist locks or unlocks the door he's at.
    key() { if (me.alive && me.team === 'T') ctx.send({ t: 'lock' }); },
    hint(text) {
      const n = near();
      if (!n) return text;
      const on = locked.has(n.i);
      if (me.team === 'T') return `${text ? text + ' · ' : ''}L: ${on ? 'unlock' : 'lock'} the door`;
      if (!on || sideOf(n.d, n.c, me.p) !== n.d.lock) return text;
      return me.crouch ? `LOCKED · hold E to pick the lock (${LOCK.pick} s)` : 'LOCKED · crouch + hold E to pick it · run into it with E to kick it in · or blow it';
    },
    progress: a => (a === 'pick' ? 'Picking the lock...' : null),
  };
}
