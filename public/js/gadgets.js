// The Mansion's gadgets in the browser (see shared/gadgets.js; the server runs them): the zip line, CCTV.
// main.js makes one with createGadgets(ctx) and calls into it: load() with each map, the server's messages, update()
// every frame, local() for the player's own movement while on a gadget, camera() for the view while watching a camera,
// hint() for the help line, pose() for the other players' bodies, and the mouse and keys while watching.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER } from '/shared/physics.js';
import { ZIP, zipFeet, zipDir, zipRide, CCTV, camView } from '/shared/gadgets.js';
import { JAMMER } from '/shared/weapons.js';
import { poseGadget, clearEmote } from './models.js';

const lam = color => new THREE.MeshLambertMaterial({ color });
// A thin rod (a cylinder of radius r) from p to q.
function segment(p, q, r) {
  const a = new THREE.Vector3(...p), b = new THREE.Vector3(...q), len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

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
    const seg = (p, q) => segment(p, q, 0.016);
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

  // ---------------------------------------------------------------- CCTV
  // The cameras on their walls (one mesh for all four; their red lights, one Points, blink), the four screens at the
  // desk (one mesh with a small canvas texture, redrawn a few times a second only while we're near it), and while we
  // watch, the picture: the main camera simply renders from the CCTV camera, with a CCTV look (a CSS filter, black and
  // white, infrared bright on the night map; an overlay of noise, scan lines and the readouts). A dead feed (broken,
  // jammed, no power) isn't rendered at all.
  const camsDown = new Set();
  let camLeds = null, screenTex = null, screenCtx = null, screenAt = 0, screenPower = null, overlay = null;

  function buildCctv(c) {
    const parts = [];
    const tint = (g, hex) => {
      const col = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.toArray(a, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };
    for (const cam of c.cams) {
      // the housing looks along its local -z: a box, a lens, a sun hood; a bracket back to the wall
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(cam.pitch, cam.yaw, 0, 'YXZ')), at = new THREE.Vector3(...cam.p);
      const place = g => g.applyQuaternion(q).translate(at.x, at.y, at.z);
      parts.push(tint(place(new THREE.BoxGeometry(0.12, 0.11, 0.26).translate(0, 0, 0.13)), 0xd4d4cc));
      parts.push(tint(place(new THREE.CylinderGeometry(0.04, 0.045, 0.04, 10).rotateX(Math.PI / 2)), 0x141414));
      parts.push(tint(place(new THREE.BoxGeometry(0.16, 0.015, 0.3).translate(0, 0.065, 0.11)), 0xd4d4cc));
      const back = new THREE.Vector3(0, 0, 0.24).applyQuaternion(q).add(at);
      parts.push(tint(segment(back.toArray(), cam.wall, 0.02), 0x55575a));
    }
    group.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
    camLeds = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(c.cams.length * 3), 3)),
      new THREE.PointsMaterial({ color: 0xff2a1a, size: 0.06 }));
    camLeds.frustumCulled = false;
    group.add(camLeds);
    showCams();
    // the screens: four quads, each showing its quarter of one 256 px canvas (CAM 1, 2 below; 3, 4 above)
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    screenCtx = canvas.getContext('2d');
    screenTex = new THREE.CanvasTexture(canvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const quads = c.monitors.map((m, i) => {
      const g = new THREE.PlaneGeometry(c.screen[0], c.screen[1]), uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, ((i % 2) + uv.getX(k)) / 2, ((i < 2 ? 0 : 1) + uv.getY(k)) / 2);
      return g.translate(m[0], m[1], m[2]);
    });
    group.add(new THREE.Mesh(mergeGeometries(quads), new THREE.MeshBasicMaterial({ map: screenTex })));
    screenPower = null;
    drawScreens(0);
  }

  // The lights over the lenses of the cameras that work.
  function showCams() {
    if (!camLeds) return;
    const a = camLeds.geometry.attributes.position;
    map.cctv.cams.forEach((cam, i) => {
      const up = new THREE.Vector3(0, 0.07, 0.02).applyEuler(new THREE.Euler(cam.pitch, cam.yaw, 0, 'YXZ'));
      if (camsDown.has(i)) a.setXYZ(i, 0, -1000, 0);
      else a.setXYZ(i, cam.p[0] + up.x, cam.p[1] + up.y, cam.p[2] + up.z);
    });
    a.needsUpdate = true;
  }

  const camJammed = i => {
    const c = map.cctv.cams[i].p;
    return ctx.jammers().some(p => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < JAMMER.radius);
  };
  // Why a feed shows nothing ('NO POWER', 'NO SIGNAL'), or null when it works.
  const deadFeed = i => (!ctx.power() ? 'NO POWER' : camsDown.has(i) || camJammed(i) ? 'NO SIGNAL' : null);

  // The monitors: a dim grey picture with the camera's number, a bright band rolling down; static and NO SIGNAL for a
  // dead feed; black with the power off.
  function drawScreens(now) {
    const g = screenCtx, on = ctx.power();
    if (!on && screenPower === false) return; // (black already)
    screenPower = on;
    for (let i = 0; i < 4; i++) {
      const x = (i % 2) * 128, y = i < 2 ? 128 : 0;
      g.fillStyle = on ? '#262a28' : '#040404';
      g.fillRect(x, y, 128, 128);
      if (!on) continue;
      const dead = i >= map.cctv.cams.length || deadFeed(i);
      if (!dead) {
        g.fillStyle = 'rgba(150, 160, 150, 0.28)';
        g.fillRect(x, y + 72, 128, 56);
        g.fillStyle = 'rgba(210, 220, 210, 0.13)';
        g.fillRect(x, y + ((now / 25 + i * 37) % 140) - 10, 128, 8);
      }
      for (let k = 0; k < (dead ? 300 : 70); k++) {
        const v = (Math.random() * 255) | 0;
        g.fillStyle = `rgba(${v}, ${v}, ${v}, ${dead ? 0.85 : 0.22})`;
        g.fillRect(x + Math.random() * 128, y + Math.random() * 128, 2, 2);
      }
      g.fillStyle = '#e4ece4';
      g.font = 'bold 13px monospace';
      g.fillText(`CAM ${i + 1}`, x + 6, y + 17);
      if (dead) { g.font = 'bold 15px monospace'; g.fillText('NO SIGNAL', x + 22, y + 70); }
      g.strokeStyle = '#000';
      g.lineWidth = 4;
      g.strokeRect(x, y, 128, 128);
    }
    screenTex.needsUpdate = true;
  }

  function updateCctv(now) {
    if (camLeds) camLeds.visible = ctx.power() && Math.floor(now / 600) % 2 === 0;
    // the screens only near the desk, four times a second
    const s = map.cctv.seat;
    if (screenTex && now - screenAt > 250 && Math.hypot(me.p[0] - s[0], me.p[1] - s[1], me.p[2] - s[2]) < 8) { screenAt = now; drawScreens(now); }
    if (me.cctv) {
      // tell the server which camera and where it's turned (for the radar), ten times a second at most
      if (me.cctv.dirty && now - me.cctv.sentAt > 100) {
        me.cctv.dirty = false;
        me.cctv.sentAt = now;
        const r3 = v => Math.round(v * 1000) / 1000;
        net.send({ t: 'cctv', cam: me.cctv.cam, yaw: r3(me.cctv.yaw), pitch: r3(me.cctv.pitch) });
      }
      updateOverlay(now);
    } else if (overlay) overlay.el.style.display = 'none';
  }

  // What we see while watching: noise (all of it on a dead feed), scan lines, a dark edge; the camera's name, REC, the
  // date and time; NO SIGNAL / NO POWER in the middle.
  function cctvOverlay() {
    if (overlay) return overlay;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d'), img = g.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) { const v = Math.random() * 255; img.data.set([v, v, v, Math.random() < 0.6 ? 110 : 0], i * 4); }
    g.putImageData(img, 0, 0);
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;display:none;font:bold 18px Consolas,monospace;color:#eef2ee;text-shadow:0 0 4px #000';
    const noise = document.createElement('div');
    noise.style.cssText = `position:absolute;inset:0;background:url(${c.toDataURL()});image-rendering:pixelated;opacity:0.15`;
    const scan = document.createElement('div');
    scan.style.cssText = 'position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.22) 0 2px,transparent 2px 4px),radial-gradient(ellipse at center,transparent 60%,rgba(0,0,0,0.7) 100%)';
    // (clear of the radar, the team bar and the weapon list)
    const tl = document.createElement('div');
    tl.style.cssText = 'position:absolute;left:0;right:0;top:172px;text-align:center;font-size:20px';
    const tr = document.createElement('div');
    tr.style.cssText = 'position:absolute;right:28px;top:150px;text-align:right';
    const br = document.createElement('div');
    br.style.cssText = 'position:absolute;right:28px;top:176px;text-align:right;font-size:16px';
    const mid = document.createElement('div');
    mid.style.cssText = 'position:absolute;left:0;right:0;top:44%;text-align:center;font-size:34px;letter-spacing:4px';
    el.append(noise, scan, tl, tr, br, mid);
    document.body.appendChild(el);
    return (overlay = { el, noise, tl, tr, br, mid, at: 0 });
  }
  function updateOverlay(now) {
    const o = cctvOverlay(), cam = map.cctv.cams[me.cctv.cam], dead = deadFeed(me.cctv.cam);
    o.el.style.display = '';
    o.el.style.background = dead ? '#050505' : 'transparent';
    o.noise.style.backgroundPosition = `${(Math.random() * 128) | 0}px ${(Math.random() * 128) | 0}px`;
    o.noise.style.opacity = dead === 'NO SIGNAL' ? 0.9 : dead ? 0 : 0.15;
    if (now - o.at < 200) return;
    o.at = now;
    const d = new Date(), two = n => String(n).padStart(2, '0');
    o.tl.textContent = `CAM ${me.cctv.cam + 1} — ${cam.name}${map.night ? '  IR' : ''}`;
    o.tr.innerHTML = dead ? '' : `<span style="color:#ff3a2a">${Math.floor(now / 600) % 2 ? '●' : '&nbsp;'}</span> REC`;
    o.br.textContent = `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()}  ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
    o.mid.textContent = dead || '';
  }

  function switchCam(i) {
    if (!me.cctv || i < 0 || i >= map.cctv.cams.length || i === me.cctv.cam) return;
    Object.assign(me.cctv, { cam: i, yaw: 0, pitch: 0, dirty: true });
    audio.play('click');
  }

  function cctvHint() {
    const s = map.cctv.seat;
    if (me.cctv) return `Watching CAM ${me.cctv.cam + 1} — 1-4 or Mouse 1 / Mouse 2 switch cameras, the mouse turns it, E or Esc to get up`;
    if (Math.hypot(me.p[0] - s[0], me.p[2] - s[2]) < CCTV.reach && Math.abs(me.p[1] - map.cctv.floor) < 0.7) {
      return ctx.power() ? 'Press E to sit down and watch the security cameras' : 'Press E to sit at the security desk (no power: the cameras are off)';
    }
    return null;
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
      me.cctv = null;
      state.zipCut = false;
      camsDown.clear();
      camLeds = screenTex = null;
      if (map.zip) buildZip(map.zip);
      if (map.cctv) buildCctv(map.cctv);
    },
    // the server's messages
    onState(m) {
      state.zipCut = !!m.zipCut;
      showZip();
      // a camera that has just broken: sparks
      const down = new Set(m.cams || []);
      for (const i of down) if (!camsDown.has(i) && map?.cctv?.cams[i]) ctx.fx.sparks(map.cctv.cams[i].p, [0, 1, 0]);
      camsDown.clear();
      for (const i of down) camsDown.add(i);
      showCams();
    },
    onCctv(m) {
      if (m.on) {
        me.cctv = { cam: m.cam || 0, yaw: 0, pitch: 0, dirty: false, sentAt: 0 };
        me.p = m.p.slice();
        ctx.stopEmote?.();
        return;
      }
      me.cctv = null;
      me.p = m.p.slice();
      me.v = [0, 0, 0];
      me.crouch = false;
      me.viewY = me.p[1];
      if (m.why === 'hurt') ctx.hud.small('Hit! You jumped up from the security desk', 2.5);
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
    died() { me.zip = null; me.cctv = null; },
    // On a gadget you can look around but not move, shoot or use your items.
    busy: () => !!me.zip || !!me.cctv,
    watching: () => !!me.cctv,
    // At a spot where holding E does something (cutting the zip line): you stand still while you hold it.
    holdSpot: () => !!map?.zip && me.team === 'T' && !state.zipCut && near(me.p, [map.zip.cut[0], map.zip.floor, map.zip.cut[2]], ZIP.cutReach),
    hidesWeapon: () => !!me.zip || !!me.cctv,
    // Our own movement while on a gadget (true: handled, skip the usual movement).
    local() {
      if (me.zip && map?.zip) { rideZip(); return true; }
      if (me.cctv) { me.v = [0, 0, 0]; me.crouch = true; me.onGround = true; me.jumpQueued = false; return true; }
      return false;
    },
    update(dt, now) {
      if (!map) return;
      if (map.zip) updateZip(dt);
      if (map.cctv) updateCctv(now);
    },
    hint() {
      if (!map || !me.alive) return null;
      return (map.zip && zipHint()) || (map.cctv && cctvHint()) || null;
    },
    // While watching: the view from the camera (returns its field of view), the picture's look, whether to draw at all,
    // where we hear from (our own head at the desk, not the camera).
    camera(cam3d) {
      if (!me.cctv) return null;
      const c = map.cctv.cams[me.cctv.cam], v = camView(c, me.cctv.yaw, me.cctv.pitch);
      cam3d.position.set(c.p[0], c.p[1], c.p[2]);
      cam3d.rotation.set(v.pitch, v.yaw, 0);
      return c.fov;
    },
    screenFilter: () => (!me.cctv ? null : map.night ? 'grayscale(1) brightness(2.6) contrast(1.35)' : 'grayscale(1) contrast(1.25) brightness(1.05)'),
    skipRender: () => !!me.cctv && !!deadFeed(me.cctv.cam),
    ear: () => (me.cctv ? { p: [me.p[0], me.p[1] + 0.8, me.p[2]], fwd: [-Math.sin(map.cctv.yaw), 0, -Math.cos(map.cctv.yaw)] } : null),
    // the mouse turns the camera (within its limits); its buttons and 1-4 switch cameras
    mouseMove(dx, dy, k) {
      if (!me.cctv) return false;
      me.cctv.yaw = Math.max(-CCTV.pan, Math.min(CCTV.pan, me.cctv.yaw - dx * k));
      me.cctv.pitch = Math.max(-CCTV.tilt, Math.min(CCTV.tilt, me.cctv.pitch - dy * k));
      me.cctv.dirty = true;
      return true;
    },
    mouseDown(button) {
      if (!me.cctv) return;
      const n = map.cctv.cams.length;
      if (button === 0) switchCam((me.cctv.cam + 1) % n);
      else if (button === 2) switchCam((me.cctv.cam + n - 1) % n);
    },
    key(code) {
      if (!me.cctv) return false;
      const d = /^(Digit|Numpad)([1-9])$/.exec(code);
      if (d) { switchCam(+d[2] - 1); return true; }
      return false;
    },
    // get up from the desk (Esc)
    leave() { if (me.cctv) net.send({ t: 'cctv', off: 1 }); },
    progress: a => (a === 'cut' ? 'Cutting the zip line...' : null),
    // Another player's body on a gadget (pose: the snapshot's last field).
    pose(r, pose) {
      if (pose) poseGadget(r.model, pose);
      else if (r.gpose) { clearEmote(r.model); poseGadget(r.model, 0); }
      r.gpose = pose;
    },
  };
}
