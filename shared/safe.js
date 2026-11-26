// The safe and the roof rope (ROADMAP 16; Mansion maps). Used by lib/safe.js, lib/rope.js, public/js/safe.js and
// public/js/rope.js.
// The safe: against the south wall of the upper floor's south-east room. A Terrorist holds E at it to crack it, `crack`
//   s in all (what he's done stays done this round when he lets go), its dial clicking all the while (heard across the
//   floor). Cracked: every Terrorist gets `pay`; once a round.
// The roof rope: at a spot on the eaves over an upstairs window (map.ropes), a CT holds E `hook` s to hook a rope (the
//   hook's clank is heard in the house); then he swings out, down and in through the window (its glass smashes), in
//   `swing` s, along ropePath().
export const SAFE = { crack: 20, reach: 1.4, pay: 1500, click: 1.1 };
export const ROPE = { hook: 2, swing: 1.6, reach: 1.0 };

// The swing for rope r ({ a: the spot on the roof, n: +1 / -1 the window's outward side along x, w: the window's
// middle }): keyframes [s 0..1, x, y, z] (the feet), out over the edge, down beside the window, in through it, onto the
// floor inside.
export function ropeKeys(r) {
  const [ax, ay, az] = r.a, wx = r.w[0], n = r.n, floor = r.floor;
  return [[0, ax, ay, az], [0.25, wx + n * 0.7, ay + 0.15, az], [0.6, wx + n * 1.3, r.w[1] - 0.55, r.w[2]], [0.78, wx, r.w[1] - 0.6, r.w[2]], [1, wx - n * 1.0, floor, r.w[2]]];
}
// Where the feet are at s (0..1): smooth between the keyframes.
export function ropeAt(keys, s) {
  s = Math.max(0, Math.min(1, s));
  let i = 1;
  while (i < keys.length - 1 && keys[i][0] < s) i++;
  const a = keys[i - 1], b = keys[i], k = (s - a[0]) / (b[0] - a[0] || 1), e = k * k * (3 - 2 * k);
  return [a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, a[3] + (b[3] - a[3]) * e];
}
export const GLASS_AT = 0.78; // (the s where the feet reach the window: its glass breaks)
