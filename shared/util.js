// Small helpers the server's modules (and the browser's, through shared/) all use.
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const r2 = v => Math.round(v * 100) / 100; // (positions in the snapshots: centimetres)

// Lag compensation: where a player was over the last second (the server rewinds shots to it; see server.js's onShoot).
export const HISTORY_MS = 1000;
export function remember(p, t, pos, c) {
  p.history.push({ t, p: pos, c });
  while (p.history.length && p.history[0].t < t - HISTORY_MS) p.history.shift();
}
