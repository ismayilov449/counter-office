// node fall-node.mjs — the browser's lift (public/js/elevator.js) riding the cut cable's fall, in node (the browser's
// import paths mapped onto the repo): our player standing in the cabin on the ground floor, the fall's state, then the
// frames — at 60, 10, 3 and 1.5 fps — with the server's "landed" state arriving just before the frame that comes after
// the landing (as it did in the night map's browser test). Every way, the player ends on the crashed cabin's floor
// (not on its roof) and rides on its floor every frame; the same with the brake catching it.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
register('data:text/javascript,' + encodeURIComponent(`
const repo = ${JSON.stringify(pathToFileURL(repo).href)};
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('/shared/')) return { url: repo + spec.slice(1), shortCircuit: true };
  if (spec === 'three') return { url: repo + 'node_modules/three/build/three.module.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: repo + 'node_modules/three/examples/jsm/' + spec.slice(13), shortCircuit: true };
  return next(spec, ctx);
}`));
const { createElevator } = await import(pathToFileURL(process.env.ELEV_FILE || repo + 'public/js/elevator.js').href); // (ELEV_FILE: another version, to compare)
const THREE = await import(pathToFileURL(repo + 'node_modules/three/build/three.module.js').href);
const { MAPS } = await import(pathToFileURL(repo + 'shared/maps/index.js').href);
const { CollisionWorld } = await import(pathToFileURL(repo + 'shared/collision.js').href);
const { movePlayer, PLAYER } = await import(pathToFileURL(repo + 'shared/physics.js').href);
const { motionAt } = await import(pathToFileURL(repo + 'shared/elevator.js').href);
const { CABLE } = await import(pathToFileURL(repo + 'shared/power.js').href);

let fails = 0, checks = 0;
const ok = (cond, what) => { checks++; console.log((cond ? 'ok   ' : 'FAIL ') + what); if (!cond) fails++; };
const map = MAPS.cs_mansion, E = map.elevator, S = E.stops, mid = [(E.cabin.x1 + E.cabin.x2) / 2, (E.cabin.z1 + E.cabin.z2) / 2 - 0.1];
const audio = { muffled: false, loop() {}, play() {}, out: () => { throw new Error('no audio'); } };
const doors = (t) => [[0, 0, t, 1], [0, 0, t, 1], [0, 0, t, 1], [0, 0, t, 1]];
for (const tc of [0, CABLE.tc]) {
  for (const fps of [60, 10, 3, 1.5]) {
    let clock = 100000, frameNo = 0;
    const scene = new THREE.Scene(), coll = new CollisionWorld(map);
    const me = { p: [mid[0], S[1], mid[1]], v: [0, 0, 0], onGround: true, crouch: false, alive: true, yaw: 0, pitch: 0, eyeH: PLAYER.eye, viewY: S[1] };
    const el = createElevator({ scene, me, net: { send() {} }, audio, serverNow: () => clock, coll: () => coll, mines: new Map(), satchels: new Map() });
    el.load(map);
    el.onState({ t: 'elevState', m: [S[1], S[1], clock, 0], d: doors(clock), h: 0, q: [], p: 1, rm: [], rs: [] });
    const frame = ms => { clock += ms; frameNo += ms; const dt = Math.min(0.05, ms / 1000); el.local(dt, frameNo); movePlayer(me, dt, coll.move(null, me.p, 2)); el.update(dt, frameNo); }; // (main.js clamps a frame to 0.05 s)
    for (let i = 0; i < 10; i++) frame(1000 / 60);
    // the cut: the fall's state
    const t0 = clock, fall = { y0: S[1], y1: CABLE.land, t0, tb: 0, fall: 1, tc };
    el.onState({ t: 'elevState', m: [S[1], CABLE.land, t0, 0, 1, tc], d: doors(t0), h: 0, q: [], p: 0, rm: [], rs: [], x: 1 });
    let worst = 0, landedSent = false, n = 0;
    for (let i = 0; i < 60 * 4; i++) {
      const ms = 1000 / fps;
      const r = motionAt(fall, clock + ms);
      // (the server's "landed" state goes out once the fall has ended; at a low frame rate it reaches the page before
      // the frame that first sees the cabin down)
      if (!r.moving && !landedSent) { landedSent = true; el.onState({ t: 'elevState', m: [r.y, r.y, Math.round(clock), 0], d: doors(clock), h: 0, q: [], p: 0, rm: [], rs: [], x: 1 }); }
      frame(ms);
      n++;
      const cy = motionAt(landedSent ? { y0: r.y, y1: r.y, t0: clock, tb: 0 } : fall, clock).y;
      worst = Math.max(worst, Math.abs(me.p[1] - cy));
      if (clock - t0 > 3000) break;
    }
    const end = motionAt(fall, clock).y;
    ok(Math.abs(me.p[1] - end) < 0.01, `${tc ? 'caught' : 'crash'} at ${fps} fps (${n} frames): ends on the cabin's floor ${end.toFixed(3)} (us ${me.p[1].toFixed(3)}), worst off its floor on the way ${worst.toFixed(3)} m`);
  }
}
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
