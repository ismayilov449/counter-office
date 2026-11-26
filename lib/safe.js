// The safe (ROADMAP 16.1; rules in shared/safe.js, the browser's part public/js/safe.js). server.js calls in at hooks
// marked "safe:". Messages: 'safe' { open, left (s of cracking still to do) }, 'sfx' safeclick / safeopen.
import { SAFE } from '../shared/safe.js';

// api: { game, players, map(), now, send, sendMe, broadcast, notify, addMoney(p, n) }
export function createSafe(api) {
  const { game, players, send, broadcast } = api;
  let left = SAFE.crack * 1000, open = false;
  const S = () => api.map().safe;
  const state = () => ({ t: 'safe', open: open ? 1 : 0, left: Math.round(left / 100) / 10 });
  const at = p => { const s = S(); return !!s && Math.hypot(p.p[0] - s.stand[0], p.p[2] - s.stand[2]) < SAFE.reach && Math.abs(p.p[1] - s.stand[1]) < 0.8; };
  return {
    roundStart() { left = SAFE.crack * 1000; open = false; if (S()) broadcast(state()); },
    // E at the safe: a Terrorist starts (or goes on) cracking it.
    use(p, t) {
      if (!S() || p.team !== 'T' || p.bot || open || game.phase !== 'live' || !at(p)) return false;
      if ([...players.values()].some(q => q !== p && q.act?.type === 'safe')) { send(p, { t: 'msg', text: 'Someone is already working on the safe.' }); return true; }
      p.act = { type: 'safe', start: t - (SAFE.crack * 1000 - left), pos: p.p.slice(), dur: SAFE.crack * 1000, next: t }; // (the bar shows the whole job)
      return true;
    },
    // updateActions, after its own checks: the dial clicks; what's done stays done if he lets go.
    act(p, a, t) {
      if (open) { p.act = null; return; }
      left = Math.max(0, a.dur - (t - a.start));
      if (t >= a.next) { a.next = t + SAFE.click * 1000; broadcast({ t: 'sfx', s: 'safeclick', p: S().stand.map((v, k) => (k === 1 ? v + 0.8 : v)) }); }
      if (left > 0) return;
      p.act = null;
      open = true;
      for (const q of players.values()) if (q.team === 'T') { api.addMoney(q, SAFE.pay); api.sendMe(q); }
      broadcast(state());
      broadcast({ t: 'sfx', s: 'safeopen', p: S().stand });
      api.notify(`${p.name} cracked the safe: $${SAFE.pay} for every Terrorist`, true);
    },
    send(p) { if (S()) send(p, state()); },
  };
}
