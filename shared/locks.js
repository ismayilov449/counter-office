// Locked doors (Mansion maps; lib/locks.js and public/js/locks.js). A lockable door has d.lock: the side its key is
// needed from (+1 / -1 along the door's normal, the outside). At the round start `start` of the house's outer doors are
// locked at random; the estate gate is open but lockable. Terrorists carry the keys: they open locked doors as usual
// and L locks or unlocks the closed door they're at. From the inside anyone opens it (a thumb turn). From
// the outside the CTs pick the lock (crouch + hold E, `pick` s, clicks heard on the other side), kick it in (run into
// it with E, `kicks` loud kicks) or blow it (any explosion within `blast` m unlocks it).
export const LOCK = { start: 2, pick: 6, kicks: 3, kickGap: 0.6, blast: 3, reach: 1.6 };
// The side of door d that p is on (+1 / -1 along its normal).
export const sideOf = (d, c, p) => (p[d.axis === 'x' ? 2 : 0] >= c[d.axis === 'x' ? 2 : 0] ? 1 : -1);
