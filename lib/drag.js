// Dragging, generic (ROADMAP 1.1; docs/features/wounds.md "The drag API"): one thing pulls another along the ground.
// The dragger and the dragged are any objects with a position `p` ([x, y, z]): a player pulling a downed teammate
// (lib/wounds.js), and later a CT carrying a wounded hostage (group 6) or someone dragging a booby-trapped corpse
// (group 7). Use the one engine everybody shares (`wounds.drag` in server.js), so nothing is in two drags at once.
//
// How it moves: the dragged follows the dragger's own path (breadcrumbs dropped as he walks), so it goes only where
// he went — round corners, through doorways, up and down stairs — and stays `gap` metres (flat) behind him. When he
// walks back towards it the rope goes slack and it stays put. It moves at most `speed` × 1.6 m/s; if the dragger gets
// more than `lose` metres away (he ran, he was moved) the drag ends ('lost'). If something else moves the dragged
// (the lift, an explosion's push), its old breadcrumbs are dropped and it is pulled straight from where it now is.
//
//   const drag = createDrag();
//   drag.start(dragger, target, {
//     kind: 'mate',              // what sort of drag (list(kind) filters by it)
//     gap: 0.95, speed: 1.3, lose: 2.6,
//     place(target, pos, yaw, dr) {},  // put it there (default: target.p = pos); yaw faces the dragger (head first)
//     check(dr) {},              // called every tick before moving: return a reason (a string) to end the drag
//     onStop(dr, why) {},        // the drag ended (stop, stopTarget, check, 'lost')
//     data: {},                  // anything (kept on the drag as dr.data)
//   }) -> the drag, or null if either one is already in a drag
//   drag.stop(dragger, why) / drag.stopTarget(target, why) / drag.stopAll(why)
//   drag.get(dragger) -> the drag; drag.targetOf(dragger), drag.draggerOf(target) -> the other one or null
//   drag.list(kind) -> the drags (all kinds without one)
//   drag.tick(dt)  (seconds; server.js calls it once a tick through wounds.tick)
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const CRUMB = 0.15; // metres the dragger walks between two breadcrumbs
const STEP = 0.05; // metres per step when walking the dragged along the path

export function createDrag() {
  const byDragger = new Map(), byTarget = new Map();

  function start(dragger, target, opts = {}) {
    if (!dragger?.p || !target?.p || dragger === target) return null;
    if (byDragger.has(dragger) || byTarget.has(dragger) || byDragger.has(target) || byTarget.has(target)) return null;
    const dr = {
      kind: opts.kind || 'drag', dragger, target,
      gap: opts.gap ?? 0.95, speed: opts.speed ?? 1.3, lose: opts.lose ?? 2.6,
      place: opts.place || ((t, pos) => { t.p = pos; }), check: opts.check || null, onStop: opts.onStop || null,
      data: opts.data || {},
      trail: [], // the dragger's breadcrumbs the dragged hasn't reached yet
      last: target.p.slice(), // where we last put the dragged (to notice something else moving it)
      yaw: yawTo(target.p, dragger.p),
    };
    byDragger.set(dragger, dr);
    byTarget.set(target, dr);
    return dr;
  }

  function end(dr, why) {
    if (byDragger.get(dr.dragger) !== dr) return;
    byDragger.delete(dr.dragger);
    byTarget.delete(dr.target);
    dr.onStop?.(dr, why);
  }

  // One tick of one drag: drop a breadcrumb where the dragger is, then walk the dragged along the crumbs until it's
  // `gap` behind him (or this tick's distance is used up).
  function step(dr, dt) {
    const D = dr.dragger.p;
    let pos = dr.target.p.slice();
    if (dist3(pos, dr.last) > 0.05) dr.trail.length = 0; // something else moved it: start from where it is
    const tail = dr.trail.length ? dr.trail[dr.trail.length - 1] : null;
    if (!tail || dist3(tail, D) >= CRUMB) dr.trail.push(D.slice());
    let budget = dr.speed * 1.6 * dt;
    while (budget > 1e-6 && flat(pos, D) > dr.gap) {
      const to = dr.trail[0] || D;
      const left = dist3(pos, to);
      if (left < 1e-4) { if (dr.trail.length) { dr.trail.shift(); continue; } break; }
      const s = Math.min(STEP, left, budget);
      pos = pos.map((v, i) => v + ((to[i] - v) * s) / left);
      budget -= s;
      if (s === left && dr.trail.length) dr.trail.shift();
    }
    // The rope clearly slack (he came back towards it): the crumbs out and back are of no more use; from here it's a
    // short straight pull to him.
    if (flat(pos, D) < dr.gap - 0.2) dr.trail = [D.slice()];
    if (flat(pos, D) > 0.15) dr.yaw = yawTo(pos, D);
    dr.place(dr.target, pos, dr.yaw, dr);
    dr.last = dr.target.p.slice();
    if (flat(dr.target.p, D) > dr.lose) end(dr, 'lost');
  }

  function tick(dt) {
    for (const dr of [...byDragger.values()]) {
      const why = dr.check?.(dr);
      if (why) { end(dr, why); continue; }
      if (byDragger.get(dr.dragger) === dr) step(dr, dt);
    }
  }

  return {
    start,
    stop(dragger, why = 'stop') { const dr = byDragger.get(dragger); if (dr) end(dr, why); },
    stopTarget(target, why = 'stop') { const dr = byTarget.get(target); if (dr) end(dr, why); },
    stopAll(why = 'stop') { for (const dr of [...byDragger.values()]) end(dr, why); },
    get: dragger => byDragger.get(dragger) || null,
    targetOf: dragger => byDragger.get(dragger)?.target || null,
    draggerOf: target => byTarget.get(target)?.dragger || null,
    list: kind => [...byDragger.values()].filter(dr => !kind || dr.kind === kind),
    tick,
  };
}

// The yaw that faces from a to b (the game's convention: a player faces -z at yaw 0).
export const yawTo = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
