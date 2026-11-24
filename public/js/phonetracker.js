// Phone tracker, the browser's part (ROADMAP group 14; rules: shared/phonetracker.js, server: lib/phonetracker.js).
// The CT holding the tracker clicks to scan (3 s); every CT gets the result ('trk'): first a count of the phones, then
// circles that go onto the radar for TRACKER.radar s. The holder's screen (hud.trackerScreen) shows the last scan,
// the scans left, a scan in progress and, within TRACKER.finder m of a Terrorist, a direction finder (an arrow, signal
// bars and a beep that speeds up). A Terrorist whose phone a scan reaches feels it buzz ('trkHit').
// Version 2: the map's cell towers (drawn here; the snapshot's `tw` says which are down, and a CT next to one that is
// down is told to repair it), scans from a CT's drone (R while flying it), the hostages' phones (white circles).
import * as THREE from 'three';
import { TRACKER } from '/shared/phonetracker.js';
import { JAMMER } from '/shared/weapons.js';
import { warOn } from '/shared/war.js';

// ctx: { me, hud, audio, send(msg), remotes, cfg(), map(), current(), jammers() (id -> { p }), scene }
export function createTrackerClient(ctx) {
  const { me, hud, audio } = ctx;
  let last = null, left = TRACKER.scans, scanning = null, nextBeep = 0;
  let towers = [], towersOf = null, down = []; // the cell towers' models (for map towersOf), which are down
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

  // ---- the cell towers: a grey lattice mast with three antenna panels and a red light on top, and the equipment
  // cabinet at its foot with a status light (green; red and dark when it's down). A few meshes each.
  const M = {
    mast: new THREE.MeshLambertMaterial({ color: 0x6a6e72 }), panel: new THREE.MeshLambertMaterial({ color: 0xe6e6e0 }),
    cab: new THREE.MeshLambertMaterial({ color: 0x8a9096 }), dead: new THREE.MeshLambertMaterial({ color: 0x2e2e2c }),
    ok: new THREE.MeshBasicMaterial({ color: 0x40ff60 }), bad: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    top: new THREE.MeshBasicMaterial({ color: 0xff3020 }),
  };
  function buildTower({ box: b, mast: [x, y, z, h] }) {
    const g = new THREE.Group();
    const add = (geo, mat, px, py, pz) => { const o = new THREE.Mesh(geo, mat); o.position.set(px, py, pz); g.add(o); return o; };
    add(new THREE.BoxGeometry(0.24, h, 0.24), M.mast, x, y + h / 2, z);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2, p = add(new THREE.BoxGeometry(0.22, 0.9, 0.07), M.panel, x + Math.sin(a) * 0.22, y + h - 0.7, z + Math.cos(a) * 0.22);
      p.rotation.y = a;
    }
    const top = add(new THREE.SphereGeometry(0.09, 8, 6), M.top, x, y + h + 0.08, z);
    const c = b.min.map((v, i) => (v + b.max[i]) / 2), s = b.max.map((v, i) => v - b.min[i]);
    const cab = add(new THREE.BoxGeometry(s[0], s[1], s[2]), M.cab, c[0], c[1], c[2]);
    const led = add(new THREE.BoxGeometry(s[0] + 0.02, 0.06, s[2] + 0.02), M.ok, c[0], b.max[1] - 0.12, c[2]);
    ctx.scene.add(g);
    return { g, top, cab, led, box: b };
  }
  function syncTowers() {
    const map = ctx.map();
    if (towersOf === map) return;
    for (const t of towers) ctx.scene.remove(t.g);
    towers = (map.towers || []).map(buildTower);
    towersOf = map;
    down = [];
  }
  // a CT within reach of a tower that is down (as the server's near())
  const nearDown = () => towers.findIndex((t, i) => {
    if (!down[i]) return false;
    const b = t.box, dx = Math.max(b.min[0] - me.p[0], 0, me.p[0] - b.max[0]), dz = Math.max(b.min[2] - me.p[2], 0, me.p[2] - b.max[2]);
    return Math.hypot(dx, dz) < TRACKER.tower.reach && Math.abs(me.p[1] - b.min[1]) < 1.5;
  });
  const circles = (list, white, age) => (list || []).map(([x, z, r, floor]) => ({ kind: 'trk', p: [x, 0, z], r, floor, age, white }));

  return {
    on,
    reset() { last = null; scanning = null; left = TRACKER.scans; },
    handlers: {
      trk(m) {
        last = { ...m, got: performance.now() };
        left = m.left;
        if (m.by === me.id) scanning = null;
        const from = m.drone ? ' (from the drone)' : '';
        if (m.count != null) hud.small(`Tracker: ${m.count} phone${m.count === 1 ? '' : 's'} found`, 4);
        else hud.small(`Tracker${from}: ${m.c.length} phone${m.c.length === 1 ? '' : 's'} on the radar${m.h?.length ? `, ${m.h.length} hostage${m.h.length === 1 ? '' : 's'}` : ''}${m.down ? ` — ${m.down} cell tower${m.down === 1 ? '' : 's'} down` : ''}${m.jam?.length ? ' — a jammer is near the scan' : ''}`, 3);
        audio.play('trkdone');
      },
      trkScan(m) {
        scanning = m.cancel ? null : { start: performance.now(), dur: m.dur };
        if (!m.cancel) { audio.play('trkscan'); if (m.drone) hud.small('Scanning from the drone…', 3); }
      },
      trkInfo(m) { left = m.left; },
      trkHit(m) {
        audio.play('buzz');
        hud.small(`📵 No service — your phone was just scanned. The fake tower is to the ${m.dir}.`, 4);
      },
    },
    // Mouse1 with the tracker out; R flying a drone (fromDrone).
    scan(fromDrone = false) {
      if (scanning || !on()) return;
      if (left <= 0) { audio.play('deny'); hud.small('The tracker\'s battery is flat: no scans left this round', 2); return; }
      ctx.send(fromDrone ? { t: 'scan', drone: 1 } : { t: 'scan' });
    },
    hint() {
      if (holding()) return scanning ? 'Scanning… hold still and keep it out' : `Click to scan for the Terrorists' phones (${left} left)`;
      if (on() && me.alive && me.team === 'CT' && nearDown() >= 0) return `Hold E to repair the cell tower (${TRACKER.tower.repair} s)`;
      return '';
    },
    progress: a => (a === 'twr' ? 'Repairing the cell tower...' : null),
    // The radar's marks: the last scan's circles while they're fresh (the hostages' white).
    radarMarks(now) {
      if (!last?.c || now - last.got > TRACKER.radar * 1000) return [];
      const age = (now - last.got) / 1000;
      return [...circles(last.c, false, age), ...circles(last.h, true, age)];
    },
    // The snapshot's `tw`: which cell towers are down (none: all standing).
    snapshot(tw) {
      syncTowers();
      towers.forEach((t, i) => {
        const d = !!tw?.[i];
        if (d === !!down[i]) return;
        down[i] = d;
        t.cab.material = d ? M.dead : M.cab;
        t.led.material = d ? M.bad : M.ok;
      });
    },
    // Every frame: the towers' lights, the holder's screen and the direction finder's beep.
    frame(now) {
      syncTowers();
      const blink = Math.floor(now / 700) % 2 === 0;
      towers.forEach((t, i) => { t.top.visible = !down[i] && blink; });
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
