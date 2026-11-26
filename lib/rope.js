// The roof rope (ROADMAP 16.2; rules in shared/safe.js, the browser's part public/js/rope.js). server.js calls in at
// hooks marked "rope:". p.rope = { i (map.ropes), at (ms the swing began) } while swinging: the server says where he
// is (the 'state' handler). Messages: 'rope' { i, ms, id } (he swings now), 'ropeEnd' { p }, 'sfx' ropehook.
import { ROPE, ropeKeys, ropeAt, GLASS_AT } from '../shared/safe.js';

// api: { game, players, map(), world(), now, send, broadcast, breakGlass(ids) }
export function createRope(api) {
  const { send, broadcast } = api;
  const R = () => api.map().ropes || [];
  const spot = p => R().findIndex(r => Math.hypot(p.p[0] - r.a[0], p.p[2] - r.a[2]) < ROPE.reach && Math.abs(p.p[1] - r.a[1]) < 0.6);
  // The intact pane in rope r's window.
  const pane = r => api.world().intactGlass.filter(g => [0, 1, 2].every(k => r.w[k] > g.min[k] - 0.15 && r.w[k] < g.max[k] + 0.15)).map(g => g.id);
  const where = (p, t) => ropeAt(ropeKeys(R()[p.rope.i]), (t - p.rope.at) / (ROPE.swing * 1000));
  return {
    roundStart() { for (const p of api.players.values()) p.rope = null; },
    // E on the eaves: a CT starts hooking the rope (ROPE.hook s; the clank is heard in the house).
    use(p, t) {
      if (p.team !== 'CT' || p.bot || !p.alive || p.rope) return false;
      const i = spot(p);
      if (i < 0) return false;
      p.act = { type: 'rope', start: t, pos: p.p.slice(), dur: ROPE.hook * 1000, i };
      broadcast({ t: 'sfx', s: 'ropehook', p: R()[i].a });
      return true;
    },
    // updateActions, after its own checks: hooked, off he swings.
    act(p, a, t) {
      if (t - a.start < a.dur) return;
      p.act = null;
      p.rope = { i: a.i, at: t, glass: false };
      p.history = [];
      broadcast({ t: 'rope', i: a.i, ms: ROPE.swing * 1000, id: p.id }); // (everyone draws the rope to him)
    },
    // The 'state' handler: while swinging, the server says where you are. True when it did.
    pinned(p, m, t) {
      if (!p.rope) return false;
      p.p = where(p, t);
      p.yaw = m.yaw; p.pitch = m.pitch; p.c = 0;
      return true;
    },
    // Every tick: the glass smashes when he reaches it, and at the end he's inside.
    tick(t) {
      for (const p of api.players.values()) {
        if (!p.rope) continue;
        if (!p.alive) { p.rope = null; continue; }
        const s = (t - p.rope.at) / (ROPE.swing * 1000);
        if (!p.rope.glass && s >= GLASS_AT - 0.05) { p.rope.glass = true; const ids = pane(R()[p.rope.i]); if (ids.length) api.breakGlass(ids); }
        if (s < 1) continue;
        p.p = where(p, t);
        p.rope = null;
        p.history = [];
        send(p, { t: 'ropeEnd', p: p.p.map(v => Math.round(v * 1000) / 1000) });
      }
    },
  };
}
