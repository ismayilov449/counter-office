// Phone tracker, the browser's part (ROADMAP group 14; rules: shared/phonetracker.js, server: lib/phonetracker.js).
// The CT holding the tracker clicks to scan (3 s); every CT gets the result ('trk'): first a count of the phones, then
// circles that go onto the radar for TRACKER.radar s. The holder's screen (hud.trackerScreen) shows the last scan,
// the scans left, a scan in progress and, within TRACKER.finder m of a Terrorist, a direction finder (an arrow, signal
// bars and a beep that speeds up). A Terrorist whose phone a scan reaches feels it buzz ('trkHit').
import { TRACKER } from '/shared/phonetracker.js';
import { JAMMER } from '/shared/weapons.js';
import { warOn } from '/shared/war.js';

// ctx: { me, hud, audio, send(msg), remotes, cfg(), map(), current(), jammers() (id -> { p }) }
export function createTrackerClient(ctx) {
  const { me, hud, audio } = ctx;
  let last = null, left = TRACKER.scans, scanning = null, nextBeep = 0;
  const on = () => warOn(ctx.cfg()?.phoneTracker, ctx.map());
  const holding = () => me.alive && ctx.current() === 'tracker';
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const jammedAt = p => [...ctx.jammers().values()].some(j => dist(j.p, p) < JAMMER.radius);

  // The nearest living Terrorist within TRACKER.finder m whose phone isn't jammed (the direction finder), or null.
  function finder() {
    if (jammedAt(me.p)) return null;
    let best = null, bd = TRACKER.finder;
    for (const r of ctx.remotes.values()) {
      if (!r.alive || r.team !== 'T' || jammedAt(r.p)) continue;
      const d = dist(r.p, me.p);
      if (d < bd) { bd = d; best = r; }
    }
    if (!best) return null;
    const a = Math.atan2(-(best.p[0] - me.p[0]), -(best.p[2] - me.p[2])) - me.yaw;
    return { d: bd, turn: Math.atan2(Math.sin(a), Math.cos(a)), bars: Math.max(1, Math.min(5, Math.ceil(5 * (1 - bd / TRACKER.finder) + 0.01))) };
  }

  return {
    on,
    reset() { last = null; scanning = null; left = TRACKER.scans; },
    handlers: {
      trk(m) {
        last = { ...m, got: performance.now() };
        left = m.left;
        if (m.by === me.id) scanning = null;
        if (m.count != null) hud.small(`Tracker: ${m.count} phone${m.count === 1 ? '' : 's'} found`, 4);
        else hud.small(`Tracker: ${m.c.length} phone${m.c.length === 1 ? '' : 's'} on the radar${m.jam?.length ? ' — a jammer is near the scan' : ''}`, 3);
        audio.play('trkdone');
      },
      trkScan(m) {
        scanning = m.cancel ? null : { start: performance.now(), dur: m.dur };
        if (!m.cancel) audio.play('trkscan');
      },
      trkInfo(m) { left = m.left; },
      trkHit(m) {
        audio.play('buzz');
        hud.small(`📵 No service — your phone was just scanned. The fake tower is to the ${m.dir}.`, 4);
      },
    },
    // Mouse1 with the tracker out.
    scan() {
      if (scanning) return;
      if (left <= 0) { audio.play('deny'); hud.small('The tracker\'s battery is flat: no scans left this round', 2); return; }
      ctx.send({ t: 'scan' });
    },
    hint: () => (holding() ? (scanning ? 'Scanning… hold still and keep it out' : `Click to scan for the Terrorists' phones (${left} left)`) : ''),
    // The radar's marks: the last scan's circles while they're fresh.
    radarMarks(now) {
      if (!last?.c || now - last.got > TRACKER.radar * 1000) return [];
      const age = (now - last.got) / 1000;
      return last.c.map(([x, z, r, floor]) => ({ kind: 'trk', p: [x, 0, z], r, floor, age }));
    },
    // Every frame: the holder's screen and the direction finder's beep.
    frame(now) {
      if (!on() || !holding()) { hud.trackerScreen(null); return; }
      const f = finder();
      if (f && now >= nextBeep) { audio.play('trkbeep'); nextBeep = now + 120 + (f.d / TRACKER.finder) * 900; }
      hud.trackerScreen({
        me: { p: me.p, yaw: me.yaw }, left, scans: TRACKER.scans,
        scan: scanning ? Math.min(1, (now - scanning.start) / scanning.dur) : null,
        last: last && { ...last, age: (now - last.got) / 1000 },
        finder: f, jammed: jammedAt(me.p),
      });
    },
  };
}
