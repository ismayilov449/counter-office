// The drag engine (lib/drag.js) and the shared rules (shared/wounds.js), no server. Run: node dev/test-scripts/wounds/unit.mjs
import { createDrag, yawTo } from '../../../lib/drag.js';
import { WOUNDS, armSide, woundFx } from '../../../shared/wounds.js';

let fails = 0, n = 0;
const ok = (what, cond) => { n++; console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) fails++; };
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const r2 = v => Math.round(v * 100) / 100;
const DT = 1 / 32;

// ---- 1. a straight pull: the body ends up `gap` behind, never faster than speed × 1.6
{
  const drag = createDrag();
  const A = { p: [0, 0, 0] }, B = { p: [0, 0, 1.2] };
  const dr = drag.start(A, B, { gap: 0.95, speed: 1.3 });
  ok('start returns the drag', !!dr && drag.targetOf(A) === B && drag.draggerOf(B) === A && drag.get(A) === dr);
  ok('nothing can be in two drags', drag.start(A, { p: [1, 0, 1] }) === null && drag.start({ p: [2, 0, 2] }, B) === null && drag.start(B, { p: [3, 0, 3] }) === null);
  let maxStep = 0;
  for (let i = 0; i < 96; i++) { // 3 s walking -z at 1.3 m/s
    A.p = [0, 0, -1.3 * DT * (i + 1)];
    const before = B.p.slice();
    drag.tick(DT);
    maxStep = Math.max(maxStep, Math.hypot(B.p[0] - before[0], B.p[2] - before[2]) / DT);
  }
  ok(`the body trails 0.95 m behind (${r2(flat(A.p, B.p))})`, Math.abs(flat(A.p, B.p) - 0.95) < 0.06);
  ok(`it never moves faster than 1.3 × 1.6 m/s (${r2(maxStep)})`, maxStep <= 1.3 * 1.6 + 1e-6);
  ok(`it faces the dragger, head first (yaw ${r2(dr.yaw)})`, Math.abs(dr.yaw - yawTo(B.p, A.p)) < 0.05);
  // walking back: slack, it stays
  const at = B.p.slice();
  for (let i = 0; i < 16; i++) { A.p = [A.p[0], 0, A.p[2] + 0.04]; drag.tick(DT); }
  ok('walking back towards it: the rope is slack, it stays put', flat(at, B.p) < 1e-6);
  drag.stop(A, 'test');
  ok('stop ends it', !drag.get(A) && !drag.draggerOf(B));
}

// ---- 2. round a corner: it follows the dragger's path, not the straight line
{
  const drag = createDrag();
  const A = { p: [0, 0, 0] }, B = { p: [0, 0, 0.9] };
  drag.start(A, B, { gap: 0.95, speed: 1.3 });
  const path = [];
  for (let i = 1; i <= 40; i++) path.push([0, 0, -0.05 * i]); // 2 m north
  for (let i = 1; i <= 40; i++) path.push([0.05 * i, 0, -2]); // then 2 m east
  let cut = 0;
  for (const p of path) {
    A.p = p;
    for (let k = 0; k < 2; k++) drag.tick(DT / 2);
    // the corner is at (0, -2): a body cutting it would be at x > 0 and z > -2 - 0.05 at the same time, well inside
    if (B.p[0] > 0.12 && B.p[2] > -1.9) cut++;
  }
  for (let k = 0; k < 40; k++) drag.tick(DT);
  ok(`round the corner it stays on the path (${cut} ticks off it)`, cut === 0);
  ok(`and ends 0.95 m behind on the second leg (${B.p.map(r2)})`, Math.abs(B.p[2] + 2) < 0.06 && Math.abs(flat(A.p, B.p) - 0.95) < 0.06);
}

// ---- 3. up a stair: it takes the height of the path
{
  const drag = createDrag();
  const A = { p: [0, 0, 0] }, B = { p: [0, 0, 0.9] };
  drag.start(A, B, { gap: 0.95, speed: 1.3 });
  for (let i = 1; i <= 60; i++) { A.p = [0, Math.min(1.5, i * 0.025), -0.05 * i]; drag.tick(DT * 1.5); }
  for (let k = 0; k < 30; k++) drag.tick(DT);
  ok(`up the steps behind him (body y ${r2(B.p[1])}, dragger y ${r2(A.p[1])})`, B.p[1] > 1.0 && B.p[1] <= 1.5);
}

// ---- 4. lost: the dragger runs off (or is moved): the drag ends, onStop says why
{
  const drag = createDrag();
  const A = { p: [0, 0, 0] }, B = { p: [0, 0, 0.9] };
  let why = null;
  drag.start(A, B, { gap: 0.95, speed: 1.3, lose: 2.6, onStop: (dr, w) => { why = w; } });
  A.p = [0, 0, -4];
  drag.tick(DT);
  ok(`the dragger 4 m away at once: 'lost' (${why})`, why === 'lost' && !drag.get(A));
}

// ---- 5. check: a reason ends it before it moves; place gets the position and the yaw
{
  const drag = createDrag();
  const A = { p: [0, 0, 0] }, B = { p: [0, 0, 1.5] };
  let why = null, placed = 0, stop = false;
  drag.start(A, B, { place: (t, pos, yaw) => { t.p = pos; t.yaw = yaw; placed++; }, check: () => (stop ? 'nope' : null), onStop: (dr, w) => { why = w; } });
  drag.tick(DT);
  ok('place is called with the position and the yaw', placed === 1 && typeof B.yaw === 'number');
  stop = true;
  drag.tick(DT);
  ok(`check's reason ends it (${why}), nothing placed`, why === 'nope' && placed === 1);
}

// ---- 6. moved by something else (the lift): its old crumbs are dropped
{
  const drag = createDrag();
  const A = { p: [0, 0, 0] }, B = { p: [0, 0, 0.9] };
  drag.start(A, B, { gap: 0.95, speed: 1.3 });
  for (let i = 1; i <= 20; i++) { A.p = [0, 0, -0.05 * i]; drag.tick(DT); }
  B.p = [B.p[0], 3, B.p[2]]; A.p = [A.p[0], 3, A.p[2] - 0.5]; // both carried up 3 m, then he walks on
  drag.tick(DT);
  ok(`carried up, it doesn't go back down to the old crumbs (y ${r2(B.p[1])})`, Math.abs(B.p[1] - 3) < 0.01);
}

// ---- 7. list(kind), stopTarget, stopAll
{
  const drag = createDrag();
  const a = { p: [0, 0, 0] }, b = { p: [1, 0, 0] }, c = { p: [5, 0, 0] }, d = { p: [6, 0, 0] };
  drag.start(a, b, { kind: 'mate' });
  drag.start(c, d, { kind: 'hostage' });
  ok('list(kind) filters', drag.list('mate').length === 1 && drag.list('hostage').length === 1 && drag.list().length === 2);
  drag.stopTarget(b);
  ok('stopTarget ends the drag of that target', !drag.get(a) && drag.list().length === 1);
  drag.stopAll();
  ok('stopAll ends them all', drag.list().length === 0);
}

// ---- 8. arm hits: out at the side of the torso; from the side always
{
  const pos = [0, 0, 0], yaw = 0; // facing -z
  ok('a hit in the middle of the chest is no arm hit', !armSide([0.05, 1.3, -0.3], pos, yaw));
  ok('a hit 0.25 m out to the side is an arm hit', armSide([0.25, 1.3, -0.3], pos, yaw) && armSide([-0.25, 1.1, -0.3], pos, yaw));
  ok('a hit on the side face (shot from the side) is an arm hit', armSide([0.3, 1.2, 0.05], pos, yaw));
  ok('turned 90 degrees, the side is along z', armSide([0.0, 1.2, 0.3], pos, Math.PI / 2) && !armSide([0.3, 1.2, 0.05], pos, Math.PI / 2));
}

// ---- 9. what the wounds do
{
  const none = woundFx(null), leg = woundFx({ l: 1, a: 0, h: 0 }), legB = woundFx({ l: 0.5, a: 0, h: 0 });
  ok('no wounds: nothing', none.speed === 1 && none.spread === 0 && none.shake === 0 && none.blur === 0);
  ok(`a leg wound: ${leg.speed} of the speed, bandaged ${legB.speed}`, Math.abs(leg.speed - WOUNDS.leg) < 1e-9 && Math.abs(legB.speed - (1 + WOUNDS.leg) / 2) < 1e-9);
  const arm = woundFx({ l: 0, a: 1, h: 0 }), armB = woundFx({ l: 0, a: 0.5, h: 0 });
  ok('an arm wound: spread and shake, halved when bandaged', arm.spread === WOUNDS.armSpread && arm.shake === WOUNDS.armShake && Math.abs(armB.spread - WOUNDS.armSpread / 2) < 1e-9);
  const head = woundFx({ l: 0, a: 0, h: 1 });
  ok('a head graze: blur', head.blur === WOUNDS.headBlur && head.speed === 1);
  const ad = woundFx(null, 1), ad2 = woundFx(null, 0.5);
  ok('adrenaline: shake, spread and blur, fading', ad.shake === WOUNDS.adren.shake && ad.blur === WOUNDS.adren.blur && Math.abs(ad2.shake - WOUNDS.adren.shake / 2) < 1e-9 && ad.speed === 1);
}

console.log(`\n${n - fails}/${n} OK`);
if (fails) process.exitCode = 1;
