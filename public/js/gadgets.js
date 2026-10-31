// The Mansion's gadgets in the browser (see shared/gadgets.js; the server runs them): the zip line.
// main.js makes one with createGadgets(ctx) and calls into it: load() with each map, the server's messages, update()
// every frame, local() for the player's own movement while on a gadget, hint() for the help line, pose() for the other
// players' bodies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER } from '/shared/physics.js';
import { ZIP, zipFeet, zipPoint, zipDir, zipRide } from '/shared/gadgets.js';
import { poseGadget, clearEmote } from './models.js';

const lam = color => new THREE.MeshLambertMaterial({ color });

// A zip line trolley: two grooved wheels on the cable in a steel plate, a strap down to a T handle (the cable at y 0,
// along +x; the handle hangs HANDLE below it, where a hanging body's hands are). Our own has no strap and handle: they'd be
// right over our eyes.
const HANDLE = 0.6;
function trolleyGeometry(handle = true) {
  const parts = [
    new THREE.BoxGeometry(0.26, 0.12, 0.03).translate(0, 0.02, 0.05),
    new THREE.BoxGeometry(0.26, 0.12, 0.03).translate(0, 0.02, -0.05),
    ...[-0.08, 0.08].map(x => new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10).rotateX(Math.PI / 2).translate(x, 0.04, 0)),
  ];
  if (handle) parts.push(new THREE.BoxGeometry(0.03, HANDLE - 0.02, 0.03).translate(0, -HANDLE / 2, 0), new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8).rotateX(Math.PI / 2).translate(0, -HANDLE, 0));
  return mergeGeometries(parts);
}

export function createGadgets(ctx) {
  const { scene, me, net, audio } = ctx;
  let map = null, group = null;
  const state = { zipCut: false };

  // ---------------------------------------------------------------- zip line
  let zipModel = null; // { cable, line, dangle }
  const trolleys = new Map(); // rider id ('me' or a player's id) -> { mesh, last, speed }
  const trolleyGeo = trolleyGeometry(), ownTrolleyGeo = trolleyGeometry(false), trolleyMat = lam(0x5a5e62);

  // The cable (a thin steel cylinder, and a line along it so it shows from afar too), over the pulley and down the
  // pole to the tensioner; when cut, two loose ends hang from the mast and the pole.
  function buildZip(z) {
    const steel = lam(0x34373a), pts = [z.a, z.b, [z.b[0] + 0.06, z.cut[1] + 0.12, z.b[2]]];
    const seg = (p, q, r = 0.016) => {
      const a = new THREE.Vector3(...p), b = new THREE.Vector3(...q), len = a.distanceTo(b);
      const g = new THREE.CylinderGeometry(r, r, len, 6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    };
    const cable = new THREE.Mesh(mergeGeometries([seg(pts[0], pts[1]), seg(pts[1], pts[2])]), steel);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: 0x2c2e30 }));
    const dangle = new THREE.Mesh(mergeGeometries([seg(z.a, [z.a[0] - 0.4, z.a[1] - 2.4, z.a[2]]), seg(z.b, [z.b[0] + 0.5, z.floor + 0.05, z.b[2] + 0.3]), seg(pts[2], [pts[2][0] + 0.2, z.floor + 0.02, pts[2][2] - 0.4])]), steel);
    dangle.visible = false;
    group.add(cable, line, dangle);
    zipModel = { cable, line, dangle };
  }

  function showZip() {
    if (!zipModel) return;
    zipModel.cable.visible = zipModel.line.visible = !state.zipCut;
    zipModel.dangle.visible = state.zipCut;
  }

  // A rider's trolley on the cable above their hands (for us, above our head), and the whir of it.
  function trolleyAt(id, feet, dt, speed) {
    let t = trolleys.get(id);
    if (!t) {
      t = { mesh: new THREE.Mesh(id === 'me' ? ownTrolleyGeo : trolleyGeo, trolleyMat), last: null, speed: 0, seen: 0 };
      const d = zipDir(map.zip);
      t.mesh.rotation.set(0, Math.atan2(-d[2], d[0]), Math.asin(d[1]));
      group.add(t.mesh);
      trolleys.set(id, t);
    }
    t.seen = 1;
    t.mesh.position.set(feet[0], feet[1] + map.zip.hang, feet[2]);
    if (speed == null) speed = t.last && dt > 0 ? Math.hypot(feet[0] - t.last[0], feet[1] - t.last[1], feet[2] - t.last[2]) / dt : 0;
    t.speed += (speed - t.speed) * Math.min(1, dt * 8);
    t.last = feet.slice();
    audio.loop('zip' + id, [feet[0], feet[1] + map.zip.hang, feet[2]], 'whir', t.speed);
  }

  function updateZip(dt) {
    for (const t of trolleys.values()) t.seen = 0;
    if (me.zip && me.alive) {
      const r = zipRide(map.zip, me.zip.s0, me.zip.dir, Math.max(0, ctx.serverNow() - me.zip.at) / 1000);
      trolleyAt('me', me.p, dt, r.v);
    }
    for (const r of ctx.remotes.values()) if (r.alive && r.gpose === 1 && r.model.visible) trolleyAt(r.id, r.p, dt);
    for (const [id, t] of trolleys) if (!t.seen) { group.remove(t.mesh); audio.loop('zip' + id, null); trolleys.delete(id); }
  }

  // Our own ride: where the cable has taken us by now (the server works out the same).
  function rideZip() {
    const r = zipRide(map.zip, me.zip.s0, me.zip.dir, Math.max(0, ctx.serverNow() - me.zip.at) / 1000);
    me.p = zipFeet(map.zip, r.s);
    me.v = [0, 0, 0];
    me.onGround = false;
    me.crouch = false;
    me.eyeH = PLAYER.eye;
    me.viewY = me.p[1];
    me.reload = null;
    me.scope = 0;
    // Space lets go (E does too, through the server's 'use')
    if (me.jumpQueued) { me.jumpQueued = false; net.send({ t: 'zip', off: 1 }); }
  }

  const near = (p, q, r, dy = 0.7) => Math.hypot(p[0] - q[0], p[2] - q[2]) < r && Math.abs(p[1] - q[1]) < dy;
  function zipHint() {
    const z = map.zip;
    if (me.zip) return me.zip.dir > 0 ? 'On the zip line — E or Space to let go (you drop off at the end)' : 'Climbing the zip line hand over hand — E or Space to let go';
    if (me.team === 'T' && near(me.p, [z.cut[0], z.floor, z.cut[2]], ZIP.cutReach)) return state.zipCut ? 'The zip line is cut' : `Hold E to cut the zip line (${ZIP.cut} s) — anyone on it falls`;
    const st = z.stands.find(s => near(me.p, s.p, ZIP.reach));
    if (!st) return null;
    if (state.zipCut) return 'The zip line has been cut (it\'s mended next round)';
    return st.dir > 0 ? 'Press E to hook on to the zip line — fast down to the mansion\'s roof terrace' : 'Press E to hook on to the zip line — slowly up to the neighbour\'s roof';
  }

  // ---------------------------------------------------------------- the interface for main.js
  return {
    load(m) {
      if (group) {
        scene.remove(group);
        group.traverse(o => { if (o.geometry && o.geometry !== trolleyGeo && o.geometry !== ownTrolleyGeo) o.geometry.dispose(); });
      }
      for (const id of trolleys.keys()) audio.loop('zip' + id, null);
      trolleys.clear();
      map = m;
      group = new THREE.Group();
      scene.add(group);
      zipModel = null;
      me.zip = null;
      state.zipCut = false;
      if (map.zip) buildZip(map.zip);
    },
    // the server's messages
    onState(m) {
      state.zipCut = !!m.zipCut;
      showZip();
    },
    onZip(m) {
      me.zip = { s0: m.s0, dir: m.dir, at: m.at };
      ctx.stopEmote?.();
    },
    onZipEnd(m) {
      me.zip = null;
      me.p = m.p.slice();
      me.v = m.v.slice();
      me.onGround = false;
      me.viewY = me.p[1];
      ctx.leftGadget?.();
    },
    died() { me.zip = null; },
    // On a gadget you can look around but not move, shoot or use your items.
    busy: () => !!me.zip,
    // At a spot where holding E does something (cutting the zip line): you stand still while you hold it.
    holdSpot: () => !!map?.zip && me.team === 'T' && !state.zipCut && near(me.p, [map.zip.cut[0], map.zip.floor, map.zip.cut[2]], ZIP.cutReach),
    hidesWeapon: () => !!me.zip,
    // Our own movement while on a gadget (true: handled, skip the usual movement).
    local() {
      if (me.zip && map?.zip) { rideZip(); return true; }
      return false;
    },
    update(dt) {
      if (!map) return;
      if (map.zip) updateZip(dt);
    },
    hint() {
      if (!map || !me.alive) return null;
      return (map.zip && zipHint()) || null;
    },
    progress: a => (a === 'cut' ? 'Cutting the zip line...' : null),
    // Another player's body on a gadget (pose: the snapshot's last field).
    pose(r, pose) {
      if (pose) poseGadget(r.model, pose);
      else if (r.gpose) { clearEmote(r.model); poseGadget(r.model, 0); }
      r.gpose = pose;
    },
  };
}
