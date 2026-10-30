// Detailed procedural gun models. A gun points down -z with the grip at the origin (metres, before the
// view-model scale). Parts are merged per material so each gun is only a few draw calls; the parts that
// move (magazine, bolt/slide, shotgun pump) are separate groups in userData for the animations.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- materials

function grainTexture(base, dark) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = dark;
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.15 + Math.random() * 0.25;
    g.lineWidth = 0.5 + Math.random() * 1.5;
    g.beginPath();
    const y = Math.random() * 64;
    g.moveTo(0, y);
    g.bezierCurveTo(20, y + Math.random() * 6 - 3, 44, y + Math.random() * 6 - 3, 64, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let M = null;
function mats() {
  if (M) return M;
  const phong = (color, shininess, specular) => new THREE.MeshPhongMaterial({ color, shininess, specular });
  M = {
    metal: phong(0x2a2c2f, 45, 0x4a4a4a),
    dark: phong(0x161718, 30, 0x2a2a2a),
    poly: new THREE.MeshLambertMaterial({ color: 0x1c1c1c }),
    grip: new THREE.MeshLambertMaterial({ color: 0x121212 }),
    steel: phong(0x8e9196, 70, 0x9a9a9a),
    chrome: phong(0xc6c8cc, 110, 0xffffff),
    wood: new THREE.MeshLambertMaterial({ color: 0xffffff, map: grainTexture('#8a4a20', '#3a1a08') }),
    bakelite: new THREE.MeshLambertMaterial({ color: 0x6a2a14 }),
    olive: new THREE.MeshLambertMaterial({ color: 0x55603c }),
    tan: new THREE.MeshLambertMaterial({ color: 0x9a8a64 }),
    green: new THREE.MeshLambertMaterial({ color: 0x46583a }),
    glass: phong(0x1a2a44, 120, 0xaaccff),
    brass: phong(0xb8902e, 80, 0xffe0a0),
    red: new THREE.MeshLambertMaterial({ color: 0xa01818 }),
    tape: new THREE.MeshLambertMaterial({ color: 0x3a3a34 }),
    clay: new THREE.MeshLambertMaterial({ color: 0xc4ae82 }),
    blade: phong(0xc8ccd0, 120, 0xffffff),
    hegreen: new THREE.MeshLambertMaterial({ color: 0x3e5a2a }),
    flashgrey: phong(0x9a9c9e, 60, 0x888888),
    smokegrey: new THREE.MeshLambertMaterial({ color: 0x4a4c52 }),
    yellow: new THREE.MeshLambertMaterial({ color: 0xc8b030 }),
    bottle: new THREE.MeshPhongMaterial({ color: 0x3e5a1e, shininess: 90, specular: 0x99aa88, transparent: true, opacity: 0.82 }),
    rag: new THREE.MeshLambertMaterial({ color: 0xb8a888 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffa030 }),
    zskin: new THREE.MeshLambertMaterial({ color: 0x6f8a4e }),
    zclaw: phong(0x2a2418, 40, 0x555544),
  };
  return M;
}

// ---------------------------------------------------------------- part builder

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

class Parts {
  constructor() { this.byMat = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(_m);
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    return this;
  }
  box(w, h, d, mat, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
  // cylinder along z unless rotated
  cyl(r, len, mat, x, y, z, rx = Math.PI / 2, ry = 0, rz = 0, seg = 12, r2 = r) {
    return this.add(new THREE.CylinderGeometry(r, r2, len, seg), mat, x, y, z, rx, ry, rz);
  }
  // an extruded side profile (points [z, y] in the gun's side view), `w` thick along x
  profile(pts, w, mat, x = 0) {
    const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.rotateY(-Math.PI / 2);
    geo.translate(x + w / 2, 0, 0);
    return this.add(geo, mat);
  }
  // magazine bent forward along an arc (AK-style), built from short segments
  curvedMag(w, d, len, curve, mat, x, y, z, seg = 7) {
    let cy = y, cz = z, a = 0;
    const step = len / seg;
    for (let i = 0; i < seg; i++) {
      this.box(w, step * 1.08, d, mat, x, cy - (step / 2) * Math.cos(a), cz - (step / 2) * Math.sin(a), a);
      cy -= step * Math.cos(a);
      cz -= step * Math.sin(a);
      a += curve / seg;
    }
    return this;
  }
  build(parent = new THREE.Group()) {
    for (const [mat, geos] of this.byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.castShadow = true;
      parent.add(mesh);
    }
    return parent;
  }
}

// Builds a movable sub-part as its own group at its rest position.
function movable(gun, key, fill) {
  const p = new Parts();
  fill(p, mats());
  const g = p.build();
  gun.add(g);
  gun.userData[key] = g;
  return g;
}

// ---------------------------------------------------------------- weapons

const X = mats;

function pistol(gun, P, o) {
  const m = X(), s = o.scale || 1;
  const slideMat = m[o.slide || 'metal'], frameMat = m[o.frame || 'poly'];
  P.box(0.03 * s, 0.026 * s, 0.15 * s, frameMat, 0, 0.022 * s, -0.06 * s);                  // frame / dust cover
  P.box(0.031 * s, 0.11 * s, 0.046 * s, m.grip, 0, -0.04 * s, 0.022 * s, -0.24);             // grip
  P.box(0.006, 0.006 * s, 0.05 * s, frameMat, 0, -0.008 * s, -0.035 * s);                   // trigger guard
  P.box(0.006, 0.024 * s, 0.006, frameMat, 0, 0.002 * s, -0.06 * s);
  P.box(0.005, 0.02 * s, 0.006, m.steel, 0, 0.006 * s, -0.022 * s, 0.3);                    // trigger
  if (o.hammer) P.box(0.01, 0.02 * s, 0.012, m.steel, 0, 0.065 * s, 0.035 * s, -0.4);
  movable(gun, 'action', (A) => {
    A.box(0.034 * s, 0.036 * s, 0.19 * s, slideMat, 0, 0.052 * s, -0.07 * s);
    A.box(0.036 * s, 0.006 * s, 0.03 * s, m.dark, 0.0, 0.07 * s, -0.04 * s);               // ejection port
    for (let i = 0; i < 5; i++) A.box(0.036 * s, 0.03 * s, 0.003, m.dark, 0, 0.052 * s, 0.0 * s + i * 0.006 - 0.005); // serrations
    A.box(0.014, 0.008, 0.008, m.dark, 0, 0.074 * s, 0.018 * s);                             // rear sight
    A.box(0.004, 0.009, 0.006, m.dark, 0, 0.074 * s, -0.158 * s);                           // front sight
    if (o.deagle) A.box(0.02 * s, 0.012 * s, 0.17 * s, m.chrome, 0, 0.074 * s, -0.08 * s);  // Deagle's top rib
  });
  if (o.silencer) P.cyl(0.018, 0.15, m.dark, 0, 0.05 * s, -0.24 * s);
  else P.cyl(0.006 * s, 0.01, m.dark, 0, 0.05 * s, -0.166 * s);
  movable(gun, 'mag', (A) => {
    A.box(0.024 * s, 0.1 * s, 0.034 * s, m.dark, 0, -0.04 * s, 0.024 * s, -0.24);
    A.box(0.03 * s, 0.012 * s, 0.05 * s, m.poly, 0, -0.095 * s, 0.036 * s, -0.24);
  });
  return [0, 0.05 * s, o.silencer ? -0.32 * s : -0.17 * s];
}

function ak(gun, P, o) {
  const m = X();
  const wood = o.wood || m.wood;
  P.box(0.05, 0.062, 0.32, m.metal, 0, 0.02, -0.1);                                          // receiver
  P.box(0.046, 0.022, 0.3, m.metal, 0, 0.058, -0.1);                                         // dust cover
  P.cyl(0.023, 0.29, m.metal, 0, 0.058, -0.1, Math.PI / 2, 0, 0, 10);
  // stock: tapered wooden butt
  P.profile([[0.05, 0.045], [0.33, 0.035], [0.33, -0.075], [0.3, -0.08], [0.06, -0.01], [0.05, -0.0]], 0.044, wood);
  P.box(0.048, 0.118, 0.012, m.dark, 0, -0.02, 0.334);                                       // butt plate
  P.box(0.034, 0.095, 0.042, o.grip || m.bakelite, 0, -0.06, 0.02, -0.3);                    // pistol grip
  P.box(0.006, 0.006, 0.07, m.metal, 0, -0.022, -0.04);                                      // trigger guard
  P.box(0.005, 0.02, 0.006, m.steel, 0, -0.008, -0.025, 0.3);
  P.box(0.056, 0.05, 0.2, wood, 0, 0.005, -0.37);                                            // lower handguard
  P.box(0.044, 0.026, 0.17, wood, 0, 0.048, -0.36);                                          // upper handguard
  P.cyl(0.011, 0.31, m.dark, 0, 0.025, -0.62);                                               // barrel
  P.cyl(0.009, 0.22, m.metal, 0, 0.055, -0.55);                                              // gas tube
  P.box(0.022, 0.03, 0.03, m.metal, 0, 0.042, -0.58);                                        // gas block
  P.box(0.008, 0.05, 0.012, m.metal, 0, 0.05, -0.68);                                        // front sight post
  P.box(0.026, 0.012, 0.03, m.metal, 0, 0.03, -0.68);
  P.cyl(0.015, 0.045, m.dark, 0, 0.025, -0.79);                                              // muzzle brake
  P.box(0.03, 0.014, 0.05, m.metal, 0, 0.074, -0.24);                                        // rear sight block
  if (o.scope) {
    P.box(0.03, 0.03, 0.05, m.dark, 0, 0.085, -0.12);
    P.cyl(0.022, 0.2, m.dark, 0, 0.12, -0.12);
    P.cyl(0.03, 0.04, m.dark, 0, 0.12, -0.24, Math.PI / 2, 0, 0, 12, 0.022);
    P.cyl(0.02, 0.005, m.glass, 0, 0.12, -0.262);
  }
  movable(gun, 'mag', (A) => A.curvedMag(0.03, 0.055, 0.2, 0.55, m.metal, 0, -0.01, -0.2));
  movable(gun, 'action', (A) => A.box(0.012, 0.012, 0.03, m.steel, 0.03, 0.04, -0.12));       // charging handle
  return [0, 0.025, -0.82];
}

function m4(gun, P, o) {
  const m = X();
  P.box(0.044, 0.05, 0.22, m.dark, 0, 0.03, -0.07);                                          // upper receiver
  P.box(0.04, 0.05, 0.17, m.dark, 0, -0.012, -0.06);                                         // lower receiver
  P.box(0.03, 0.06, 0.06, m.dark, 0, -0.04, -0.11);                                          // magwell
  // carry handle with rear sight
  P.box(0.02, 0.035, 0.15, m.dark, 0, 0.083, -0.07);
  P.box(0.02, 0.03, 0.02, m.dark, 0, 0.065, -0.135).box(0.02, 0.03, 0.02, m.dark, 0, 0.065, -0.005);
  P.box(0.014, 0.02, 0.02, m.dark, 0, 0.108, -0.0);
  P.cyl(0.03, 0.26, m.poly, 0, 0.032, -0.32, Math.PI / 2, 0, 0, 12);                          // ribbed handguard
  for (let i = 0; i < 7; i++) P.cyl(0.031, 0.006, m.dark, 0, 0.032, -0.21 - i * 0.034);
  P.cyl(0.033, 0.016, m.metal, 0, 0.032, -0.18);                                             // delta ring
  P.cyl(0.009, 0.2, m.dark, 0, 0.032, -0.55);                                                // barrel
  P.profile([[-0.5, 0.045], [-0.47, 0.11], [-0.455, 0.11], [-0.44, 0.045]], 0.016, m.dark);   // front sight A-frame
  P.box(0.003, 0.012, 0.003, m.dark, 0, 0.115, -0.462);
  if (o.silencer) P.cyl(0.021, 0.17, m.dark, 0, 0.032, -0.73);
  else P.cyl(0.012, 0.04, m.dark, 0, 0.032, -0.66);
  P.cyl(0.015, 0.16, m.dark, 0, 0.03, 0.13);                                                 // buffer tube
  P.profile([[0.15, 0.06], [0.3, 0.06], [0.3, -0.06], [0.26, -0.055], [0.15, -0.0]], 0.04, m.poly); // stock
  P.box(0.032, 0.09, 0.04, m.grip, 0, -0.06, 0.02, -0.3);                                    // grip
  P.box(0.006, 0.006, 0.06, m.dark, 0, -0.04, -0.04);
  P.box(0.005, 0.02, 0.006, m.steel, 0, -0.025, -0.03, 0.3);
  movable(gun, 'mag', (A) => A.curvedMag(0.026, 0.06, 0.17, 0.18, m.metal, 0, -0.05, -0.11, 5));
  movable(gun, 'action', (A) => A.box(0.03, 0.01, 0.02, m.dark, 0, 0.058, 0.03));
  return [0, 0.032, o.silencer ? -0.82 : -0.69];
}

function bullpup(gun, P, o) {
  const m = X(), body = m[o.body || 'green'];
  if (o.aug) {
    P.profile([[0.27, 0.05], [0.27, -0.07], [0.12, -0.09], [-0.12, -0.03], [-0.3, -0.01], [-0.3, 0.045]], 0.06, body);
    P.box(0.05, 0.03, 0.06, body, 0, -0.07, -0.2, 0.3);                                     // fore grip
    P.cyl(0.026, 0.22, m.dark, 0, 0.1, -0.08);                                                // built-in scope
    P.cyl(0.032, 0.05, m.dark, 0, 0.1, -0.21, Math.PI / 2, 0, 0, 12, 0.026);
    P.cyl(0.024, 0.005, m.glass, 0, 0.1, -0.235);
    P.box(0.02, 0.04, 0.12, body, 0, 0.065, -0.08);
    P.cyl(0.011, 0.3, m.dark, 0, 0.025, -0.45);
  } else {
    // FAMAS: long carry handle on top
    P.profile([[0.27, 0.05], [0.27, -0.08], [0.1, -0.08], [-0.1, -0.02], [-0.3, -0.0], [-0.3, 0.05]], 0.058, body);
    P.box(0.022, 0.03, 0.42, body, 0, 0.1, -0.05);
    P.box(0.022, 0.06, 0.03, body, 0, 0.065, -0.24).box(0.022, 0.06, 0.03, body, 0, 0.065, 0.14);
    P.cyl(0.011, 0.24, m.dark, 0, 0.02, -0.42);
    P.box(0.006, 0.05, 0.006, m.dark, 0.02, -0.02, -0.33, 0.2).box(0.006, 0.05, 0.006, m.dark, -0.02, -0.02, -0.33, 0.2); // folded bipod
  }
  P.box(0.032, 0.09, 0.04, m.grip, 0, -0.07, -0.02, -0.25);
  P.box(0.006, 0.006, 0.06, m.dark, 0, -0.05, -0.05);
  movable(gun, 'mag', (A) => A.curvedMag(0.026, 0.055, 0.16, 0.25, m.metal, 0, -0.07, 0.15, 5));
  movable(gun, 'action', (A) => A.box(0.012, 0.012, 0.03, m.steel, 0.034, 0.03, -0.1));
  return [0, 0.022, o.aug ? -0.62 : -0.56];
}

function smg(gun, P, o) {
  const m = X(), L = o.len;
  if (o.mp5) {
    P.cyl(0.026, 0.3, m.dark, 0, 0.035, -0.08, Math.PI / 2, 0, 0, 12);                         // receiver tube
    P.box(0.044, 0.04, 0.2, m.dark, 0, 0.012, -0.05);
    P.cyl(0.026, 0.14, m.poly, 0, 0.02, -0.29, Math.PI / 2, 0, 0, 10, 0.03);                   // tapered handguard
    P.cyl(0.009, 0.08, m.dark, 0, 0.035, -0.4);
    P.cyl(0.016, 0.02, m.dark, 0, 0.07, -0.33, Math.PI / 2);                                   // front sight hood
    P.cyl(0.013, 0.025, m.dark, 0, 0.07, 0.03, 0, 0, Math.PI / 2);                             // drum rear sight
    P.box(0.006, 0.05, 0.006, m.steel, 0.02, 0.0, 0.18).box(0.006, 0.05, 0.006, m.steel, -0.02, 0.0, 0.18);
    P.box(0.006, 0.006, 0.16, m.steel, 0.02, 0.02, 0.16).box(0.006, 0.006, 0.16, m.steel, -0.02, 0.02, 0.16);
    P.box(0.05, 0.07, 0.02, m.poly, 0, 0.0, 0.245);
    movable(gun, 'mag', (A) => A.curvedMag(0.024, 0.04, 0.17, 0.45, m.metal, 0, -0.01, -0.13, 6));
  } else if (o.p90) {
    P.profile([[0.18, 0.05], [0.18, -0.07], [0.08, -0.07], [0.02, -0.02], [-0.06, -0.06], [-0.12, -0.06], [-0.2, -0.01], [-0.24, 0.04], [-0.1, 0.06]], 0.06, m.poly);
    P.cyl(0.009, 0.06, m.dark, 0, 0.015, -0.27);
    P.box(0.03, 0.03, 0.08, m.dark, 0, 0.085, -0.08);                                         // reflex sight
    movable(gun, 'mag', (A) => A.box(0.05, 0.02, 0.3, new THREE.MeshPhongMaterial({ color: 0x6a6a5a, transparent: true, opacity: 0.85, shininess: 80 }), 0, 0.066, 0.02));
    movable(gun, 'action', (A) => A.box(0.01, 0.01, 0.02, m.steel, 0.032, 0.03, -0.05));
    return [0, 0.015, -0.31];
  } else {
    // MAC-10 / TMP / UMP45: boxy bodies
    P.box(0.05, 0.075, L, o.ump ? m.poly : m.dark, 0, 0.03, -L / 2 + 0.06);
    P.cyl(0.009, o.ump ? 0.06 : 0.09, m.dark, 0, 0.035, -L + 0.0);
    if (o.ump) {
      P.box(0.02, 0.012, L * 0.8, m.dark, 0, 0.073, -L / 2 + 0.06);                           // rail
      P.profile([[0.08, 0.04], [0.28, 0.03], [0.28, -0.04], [0.08, -0.0]], 0.035, m.poly);  // folding stock
    }
    if (o.fore) P.box(0.024, 0.07, 0.026, m.poly, 0, -0.04, -L + 0.1);                       // TMP vertical grip
    if (o.mac) P.box(0.006, 0.006, 0.3, m.tape, 0.03, 0.04, 0.0);                              // MAC-10 strap
  }
  if (!o.mp5) movable(gun, 'mag', (A) => A.box(0.022, 0.16, 0.036, m.metal, 0, -0.075, o.mac ? 0.02 : -0.08, o.mac ? -0.2 : 0.05));
  P.box(0.03, 0.09, 0.04, m.grip, 0, -0.05, 0.02, -0.25);
  P.box(0.006, 0.006, 0.05, m.dark, 0, -0.012, -0.03);
  movable(gun, 'action', (A) => A.box(0.012, 0.012, 0.025, m.steel, 0.03, 0.05, -0.06));
  return [0, 0.035, o.mp5 ? -0.45 : -L - 0.05];
}

function shotgun(gun, P, o) {
  const m = X();
  P.box(0.052, 0.075, 0.24, m.dark, 0, 0.035, -0.08);                                       // receiver
  P.cyl(0.015, 0.52, m.dark, 0, 0.06, -0.47);                                                // barrel
  P.cyl(0.014, 0.4, m.metal, 0, 0.022, -0.4);                                                // tube magazine
  P.cyl(0.016, 0.02, m.metal, 0, 0.04, -0.66, Math.PI / 2);                                  // barrel clamp
  P.box(0.006, 0.012, 0.006, m.steel, 0, 0.08, -0.72);                                       // bead sight
  if (o.xm) {
    P.cyl(0.015, 0.18, m.dark, 0, 0.03, 0.14);
    P.profile([[0.1, 0.055], [0.33, 0.05], [0.33, -0.07], [0.28, -0.065], [0.12, -0.0]], 0.04, m.poly);
    P.box(0.04, 0.012, 0.18, m.dark, 0, 0.078, -0.08);                                       // rail
    movable(gun, 'pump', (A) => A.box(0.05, 0.045, 0.14, m.poly, 0, 0.022, -0.34));
  } else {
    P.profile([[0.05, 0.05], [0.33, 0.035], [0.33, -0.08], [0.29, -0.085], [0.07, -0.02]], 0.044, m.poly);
    movable(gun, 'pump', (A) => {
      A.cyl(0.024, 0.16, m.poly, 0, 0.022, -0.36, Math.PI / 2, 0, 0, 10);
      for (let i = 0; i < 5; i++) A.cyl(0.025, 0.006, m.dark, 0, 0.022, -0.3 - i * 0.03);
    });
  }
  P.box(0.032, 0.085, 0.04, m.grip, 0, -0.05, 0.03, -0.3);
  P.box(0.006, 0.006, 0.06, m.dark, 0, -0.012, -0.04);
  movable(gun, 'mag', (A) => A.cyl(0.013, 0.05, m.red, 0.0, 0.035, -0.12, Math.PI / 2, 0, 0, 8)); // the shell being loaded (hidden in the receiver until a reload)
  return [0, 0.06, -0.74];
}

function sniper(gun, P, o) {
  const m = X(), body = o.awp ? m.olive : m.dark;
  if (o.awp) {
    // thumbhole stock + chassis
    P.profile([[-0.36, 0.035], [0.08, 0.04], [0.12, 0.06], [0.42, 0.05], [0.42, -0.09], [0.36, -0.1], [0.18, -0.05], [0.1, -0.07], [0.02, -0.08], [-0.02, -0.02], [-0.36, -0.02]], 0.06, body);
    P.box(0.062, 0.03, 0.06, m.dark, 0, 0.0, 0.2);                                           // thumbhole (dark insert)
    P.box(0.07, 0.11, 0.015, m.poly, 0, -0.02, 0.425);                                       // butt pad
    P.cyl(0.015, 0.62, m.dark, 0, 0.025, -0.66, Math.PI / 2, 0, 0, 12, 0.013);               // fluted barrel
    P.cyl(0.022, 0.07, m.dark, 0, 0.025, -0.99);                                              // muzzle brake
  } else {
    P.profile([[-0.3, 0.035], [0.1, 0.04], [0.36, 0.035], [0.36, -0.08], [0.3, -0.085], [0.06, -0.02], [-0.3, -0.015]], 0.05, body);
    P.cyl(0.011, 0.45, m.dark, 0, 0.025, -0.52);
  }
  P.box(0.045, 0.045, 0.2, m.metal, 0, 0.05, -0.08);                                        // action
  // scope with bells, lenses and turrets
  const sy = 0.12;
  P.cyl(o.awp ? 0.024 : 0.019, 0.26, m.dark, 0, sy, -0.08);
  P.cyl(o.awp ? 0.036 : 0.028, 0.07, m.dark, 0, sy, -0.24, Math.PI / 2, 0, 0, 14, o.awp ? 0.024 : 0.019);
  P.cyl(o.awp ? 0.03 : 0.024, 0.05, m.dark, 0, sy, 0.07, Math.PI / 2, 0, 0, 14, o.awp ? 0.024 : 0.019);
  P.cyl(o.awp ? 0.032 : 0.025, 0.004, m.glass, 0, sy, -0.276);
  P.cyl(0.012, 0.025, m.dark, 0, sy + 0.03, -0.08, 0).cyl(0.012, 0.025, m.dark, 0.03, sy, -0.08, 0, 0, Math.PI / 2);
  P.box(0.016, 0.05, 0.02, m.dark, 0, 0.085, -0.16).box(0.016, 0.05, 0.02, m.dark, 0, 0.085, 0.0);
  P.box(0.006, 0.006, 0.06, m.dark, 0, -0.02, -0.0);
  P.box(0.005, 0.02, 0.006, m.steel, 0, -0.006, 0.01, 0.3);
  movable(gun, 'mag', (A) => A.box(0.034, 0.07, 0.08, m.dark, 0, -0.035, -0.09));
  movable(gun, 'action', (A) => {
    A.cyl(0.006, 0.05, m.steel, 0.035, 0.05, 0.02, 0, 0, Math.PI / 2);                         // bolt handle
    A.add(new THREE.SphereGeometry(0.013, 10, 8), m.steel, 0.062, 0.05, 0.02);
  });
  return [0, 0.025, o.awp ? -1.03 : -0.76];
}

function mg(gun, P) {
  const m = X();
  P.box(0.07, 0.09, 0.36, m.dark, 0, 0.03, -0.12);                                          // receiver
  P.box(0.074, 0.02, 0.24, m.metal, 0, 0.085, -0.1);                                         // feed cover
  P.cyl(0.013, 0.5, m.dark, 0, 0.03, -0.55);                                                 // barrel
  P.box(0.06, 0.04, 0.22, m.poly, 0, -0.005, -0.38);                                         // handguard
  P.box(0.01, 0.07, 0.04, m.dark, 0, 0.11, -0.3, 0.2);                                       // carry handle
  P.box(0.012, 0.012, 0.09, m.dark, 0, 0.14, -0.28);
  P.profile([[0.06, 0.06], [0.33, 0.05], [0.33, -0.08], [0.28, -0.085], [0.07, -0.01]], 0.05, m.poly);
  P.box(0.032, 0.09, 0.04, m.grip, 0, -0.06, 0.02, -0.3);
  P.box(0.006, 0.006, 0.06, m.dark, 0, -0.025, -0.04);
  for (const x of [-0.015, 0.015]) P.box(0.006, 0.006, 0.22, m.metal, x, 0.0, -0.62, 0.1);  // folded bipod
  P.cyl(0.018, 0.04, m.dark, 0, 0.03, -0.82);
  movable(gun, 'mag', (A) => {
    A.box(0.1, 0.1, 0.11, m.green, 0.03, -0.07, -0.16);                                       // ammo box
    A.box(0.1, 0.012, 0.11, m.dark, 0.03, -0.015, -0.16);
    for (let i = 0; i < 5; i++) A.cyl(0.005, 0.03, m.brass, 0.05 - i * 0.01, 0.02, -0.16, 0);  // belt
  });
  movable(gun, 'action', (A) => A.box(0.012, 0.014, 0.03, m.steel, 0.04, 0.03, -0.06));
  return [0, 0.03, -0.85];
}

function knife(gun, P) {
  const m = X();
  P.box(0.026, 0.03, 0.11, m.grip, 0, 0, 0.02);
  for (let i = 0; i < 4; i++) P.box(0.028, 0.032, 0.006, m.dark, 0, 0, -0.02 + i * 0.025);
  P.box(0.05, 0.012, 0.014, m.steel, 0, 0, -0.04);                                           // guard
  P.profile([[-0.045, 0.012], [-0.2, 0.012], [-0.26, -0.004], [-0.22, -0.02], [-0.045, -0.018]], 0.005, m.blade);
  P.box(0.0055, 0.004, 0.13, m.steel, 0, 0.012, -0.12);                                      // spine
  return [0, 0, -0.26];
}

function grenade(gun, P, id) {
  const m = X();
  if (id === 'he') {
    P.add(new THREE.SphereGeometry(0.045, 14, 10), m.hegreen, 0, 0, 0);
    for (let i = 0; i < 4; i++) P.cyl(0.046, 0.004, m.dark, 0, -0.03 + i * 0.02, 0, 0);
  } else {
    P.cyl(0.032, 0.11, id === 'flash' ? m.flashgrey : m.smokegrey, 0, 0, 0, 0, 0, 0, 14);
    if (id === 'flash') for (let i = 0; i < 6; i++) P.cyl(0.006, 0.004, m.dark, Math.cos(i) * 0.033, 0.0, Math.sin(i) * 0.033, 0, i, Math.PI / 2, 6);
    else { P.cyl(0.033, 0.012, m.yellow, 0, 0.03, 0, 0); P.cyl(0.033, 0.012, m.yellow, 0, -0.02, 0, 0); }
  }
  P.cyl(0.015, 0.025, m.metal, 0, 0.065, 0, 0);                                               // fuse head
  P.box(0.012, 0.09, 0.008, m.metal, 0.025, 0.03, 0, 0, 0, -0.15);                            // spoon
  P.add(new THREE.TorusGeometry(0.012, 0.002, 6, 14), m.steel, -0.022, 0.07, 0, 0, Math.PI / 2); // pin ring
  return [0, 0, -0.05];
}

// A zombie's hand: rotten knuckles and three long dark claws.
function claws(gun, P) {
  const m = X();
  P.box(0.07, 0.05, 0.09, m.zskin, 0, 0, 0);                                                   // back of the hand
  for (let i = 0; i < 3; i++) {
    const x = -0.024 + i * 0.024;
    P.box(0.016, 0.018, 0.05, m.zskin, x, 0.004, -0.065);                                     // fingers
    P.add(new THREE.ConeGeometry(0.008, 0.08, 6), m.zclaw, x, 0.0, -0.125, -Math.PI / 2, 0, 0); // claws
  }
  return [0, 0, -0.17];
}

// A glass bottle with a burning rag stuffed in the neck.
function molotov(gun, P) {
  const m = X();
  P.cyl(0.034, 0.12, m.bottle, 0, 0, 0, 0, 0, 0, 14);                                         // body
  P.cyl(0.013, 0.035, m.bottle, 0, 0.0775, 0, 0, 0, 0, 14, 0.034);                             // shoulder
  P.cyl(0.012, 0.045, m.bottle, 0, 0.115, 0, 0, 0, 0, 10);                                     // neck
  P.cyl(0.016, 0.03, m.rag, 0, 0.15, 0, 0.2, 0, 0.1, 7, 0.013);                                // rag in the neck
  P.box(0.022, 0.07, 0.006, m.rag, 0.018, 0.12, 0.004, 0, 0.3, 0.25);                          // hanging end
  P.add(new THREE.ConeGeometry(0.014, 0.05, 7), m.flame, 0, 0.19, 0);                          // lit rag
  return [0, 0, -0.05];
}

function c4(gun, P) {
  const m = X();
  P.box(0.2, 0.06, 0.13, m.clay, 0, 0, 0);
  for (const x of [-0.06, 0, 0.06]) P.box(0.055, 0.062, 0.13, m.tape, x, 0, 0.0).box(0.06, 0.065, 0.02, m.tape, x, 0, 0);
  P.box(0.11, 0.012, 0.075, m.dark, 0, 0.037, -0.01);                                         // timer pad
  P.box(0.07, 0.004, 0.025, new THREE.MeshBasicMaterial({ color: 0x40ff60 }), -0.01, 0.044, -0.025);
  for (let i = 0; i < 6; i++) P.box(0.012, 0.004, 0.01, m.steel, -0.03 + (i % 3) * 0.02, 0.044, 0.005 + Math.floor(i / 3) * 0.014);
  P.box(0.004, 0.004, 0.12, m.red, 0.04, 0.04, 0.0, 0, 0.4).box(0.004, 0.004, 0.12, m.yellow, 0.05, 0.04, 0.0, 0, -0.3);
  return [0, 0, -0.1];
}

// Semi-automatic snipers: rifle body, long barrel, detachable box magazine and a big scope.
function autoSniper(gun, P, o) {
  const m = X(), body = o.g3 ? m.poly : m.dark;
  P.box(0.052, 0.07, 0.36, body, 0, 0.03, -0.12);                                            // receiver
  P.cyl(0.03, 0.24, o.g3 ? m.poly : m.olive, 0, 0.025, -0.42, Math.PI / 2, 0, 0, 10);         // handguard
  P.cyl(0.012, 0.36, m.dark, 0, 0.03, -0.66);                                                // barrel
  P.cyl(0.018, 0.06, m.dark, 0, 0.03, -0.86);                                                // flash hider
  if (o.g3) {
    P.profile([[0.06, 0.05], [0.36, 0.06], [0.36, -0.08], [0.31, -0.085], [0.2, -0.03], [0.07, -0.02]], 0.046, m.poly); // stock
    P.box(0.05, 0.03, 0.14, m.poly, 0, 0.075, 0.22);                                          // cheek rest
  } else {
    P.profile([[0.06, 0.05], [0.34, 0.05], [0.34, -0.08], [0.3, -0.08], [0.3, -0.02], [0.12, -0.02], [0.12, -0.0]], 0.04, m.olive); // skeleton stock
    P.box(0.006, 0.006, 0.12, m.dark, 0.02, 0.0, -0.58).box(0.006, 0.006, 0.12, m.dark, -0.02, 0.0, -0.58); // folded bipod
  }
  P.box(0.032, 0.09, 0.04, m.grip, 0, -0.06, 0.02, -0.3);
  P.box(0.006, 0.006, 0.06, m.dark, 0, -0.025, -0.04);
  // scope with mounts
  P.box(0.016, 0.04, 0.02, m.dark, 0, 0.08, -0.2).box(0.016, 0.04, 0.02, m.dark, 0, 0.08, -0.04);
  P.cyl(0.021, 0.24, m.dark, 0, 0.115, -0.12);
  P.cyl(0.031, 0.06, m.dark, 0, 0.115, -0.27, Math.PI / 2, 0, 0, 14, 0.021);
  P.cyl(0.026, 0.004, m.glass, 0, 0.115, -0.302);
  P.cyl(0.011, 0.025, m.dark, 0, 0.145, -0.12, 0);
  movable(gun, 'mag', (A) => {
    if (o.g3) A.box(0.03, 0.14, 0.07, m.metal, 0, -0.06, -0.18, 0.12);                       // steel 20-round box
    else A.box(0.03, 0.15, 0.065, new THREE.MeshPhongMaterial({ color: 0x8a8a7a, transparent: true, opacity: 0.8, shininess: 80 }), 0, -0.06, -0.18, 0.2); // clear plastic mag
  });
  movable(gun, 'action', (A) => A.box(0.012, 0.012, 0.03, m.steel, 0.032, 0.04, -0.14));
  return [0, 0.03, -0.9];
}

// RPG-7: tube with a wooden heat guard, two grips, optical sight; the warhead sticks out the front.
function rpg7(gun, P) {
  const m = X();
  P.cyl(0.03, 0.95, m.green, 0, 0.06, -0.12, Math.PI / 2, 0, 0, 12);                          // launch tube
  P.cyl(0.045, 0.28, m.wood, 0, 0.06, -0.1, Math.PI / 2, 0, 0, 12);                            // wooden heat guard
  P.cyl(0.05, 0.16, m.dark, 0, 0.06, 0.4, Math.PI / 2, 0, 0, 12, 0.032);                      // venturi (rear flare)
  P.box(0.03, 0.1, 0.04, m.wood, 0, -0.03, 0.02, -0.25);                                       // pistol grip
  P.box(0.03, 0.09, 0.04, m.wood, 0, -0.03, -0.25, -0.15);                                     // front grip
  P.box(0.006, 0.006, 0.06, m.dark, 0, -0.005, -0.03);
  P.box(0.03, 0.05, 0.08, m.dark, -0.045, 0.1, -0.05);                                         // optical sight
  P.cyl(0.012, 0.05, m.glass, -0.045, 0.11, -0.1);
  movable(gun, 'mag', (A) => {
    A.cyl(0.03, 0.12, m.olive, 0, 0.06, -0.65, Math.PI / 2, 0, 0, 10);                         // warhead body
    A.cyl(0.065, 0.16, m.olive, 0, 0.06, -0.8, Math.PI / 2, 0, 0, 12, 0.03);                   // warhead cone base
    A.cyl(0.012, 0.14, m.olive, 0, 0.06, -0.94, Math.PI / 2, 0, 0, 10, 0.065);                 // nose
  });
  return [0, 0.06, -0.62];
}

// RPG-26: one sealed olive fibreglass tube with end caps, a flip-up frame sight and a small trigger box under it;
// nothing sticks out of the front (it's fired from inside the tube and thrown away).
function rpg26(gun, P) {
  const m = X();
  P.cyl(0.036, 0.8, m.olive, 0, 0.06, -0.12, Math.PI / 2, 0, 0, 12);                          // the tube
  P.cyl(0.042, 0.05, m.dark, 0, 0.06, -0.52, Math.PI / 2, 0, 0, 12);                          // front cap ring
  P.cyl(0.042, 0.05, m.dark, 0, 0.06, 0.28, Math.PI / 2, 0, 0, 12);                           // rear cap ring
  for (const z of [-0.3, 0.1]) P.cyl(0.039, 0.02, m.grip, 0, 0.06, z, Math.PI / 2, 0, 0, 12); // carrying-strap rings
  P.box(0.03, 0.06, 0.1, m.dark, 0, 0.0, -0.06);                                               // trigger box
  P.box(0.026, 0.085, 0.035, m.grip, 0, -0.06, -0.02, -0.2);                                   // grip
  P.box(0.004, 0.05, 0.004, m.dark, -0.03, 0.12, -0.28);                                       // flip-up sight frame
  P.box(0.004, 0.04, 0.004, m.dark, -0.03, 0.115, 0.04);
  return [0, 0.06, -0.56];
}

// A round rod from point a to point b (for the mortar's tube and bipod legs).
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _rq = new THREE.Quaternion();
function rod(P, a, b, r, mat, seg = 10, rEnd = r) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _dir.length();
  _e.setFromQuaternion(_rq.setFromUnitVectors(_up, _dir.normalize()));
  return P.cyl(r, len, mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, _e.x, _e.y, _e.z, seg, rEnd);
}

// 82-BM-37 mortar, carried over the shoulder: the smooth tube with its muzzle ring and breech cap, and the bipod
// folded along it. (The baseplate shows on the set-up mortar, see buildMortarSetup.)
function mortar(gun, P) {
  const m = X();
  P.cyl(0.042, 1.2, m.olive, 0, 0.07, -0.25, Math.PI / 2, 0, 0, 14);                          // tube
  P.cyl(0.05, 0.05, m.dark, 0, 0.07, -0.84, Math.PI / 2, 0, 0, 14);                            // muzzle ring
  P.cyl(0.055, 0.1, m.dark, 0, 0.07, 0.38, Math.PI / 2, 0, 0, 14, 0.045);                     // breech cap
  P.box(0.03, 0.03, 0.03, m.dark, 0, 0.07, 0.45);
  for (const x of [-0.05, 0.05]) P.box(0.014, 0.014, 0.7, m.dark, x, 0.02, -0.2);             // folded bipod legs
  P.box(0.12, 0.04, 0.06, m.metal, 0, 0.03, -0.45);                                            // bipod clamp
  P.box(0.03, 0.1, 0.04, m.grip, 0, -0.03, 0.02, -0.2);                                        // carrying grip
  P.box(0.03, 0.05, 0.05, m.dark, -0.06, 0.12, -0.1);                                          // sight
  return [0, 0.07, -0.87];
}

// The mortar set up on the ground: square baseplate, the tube raised at deg degrees towards -z on a bipod with its
// elevation screw, and the sight on the side. Feet at y = 0.
export function buildMortarSetup(deg = 60) {
  const g = new THREE.Group(), P = new Parts(), m = X();
  P.box(0.5, 0.05, 0.5, m.dark, 0, 0.025, 0.15);                                               // baseplate
  P.box(0.36, 0.03, 0.06, m.metal, 0, 0.06, 0.15);
  const a = (deg * Math.PI) / 180, base = [0, 0.09, 0.15], axis = [0, Math.sin(a), -Math.cos(a)];
  const along = s => base.map((v, k) => v + axis[k] * s);
  rod(P, base, along(1.2), 0.042, m.olive, 14);                                                // tube
  rod(P, along(1.17), along(1.21), 0.05, m.dark, 14);                                          // muzzle ring
  P.cyl(0.06, 0.08, m.dark, ...base, 0, 0, 0, 12);                                             // breech on the plate
  const knee = along(0.78);
  for (const x of [-0.3, 0.3]) {
    rod(P, knee, [x, 0.02, -0.62], 0.014, m.dark, 8);                                          // bipod legs
    P.box(0.07, 0.02, 0.07, m.dark, x, 0.01, -0.62);
  }
  rod(P, [-0.3, 0.2, -0.56], [0.3, 0.2, -0.56], 0.01, m.metal, 6);                             // traverse bar
  rod(P, [0, 0.2, -0.56], knee, 0.018, m.metal, 8);                                            // elevation screw
  P.box(0.05, 0.08, 0.06, m.dark, -0.07, ...along(0.72).slice(1));                             // sight
  P.build(g);
  return g;
}

// PMN: a squat green disc with a black rubber pressure cap. Held in the hand (origin at the grip).
function pmnMine(gun, P) {
  const m = X();
  P.cyl(0.056, 0.055, m.hegreen, 0, 0, -0.08, 0, 0, 0, 16);
  P.cyl(0.042, 0.012, m.grip, 0, 0.033, -0.08, 0, 0, 0, 14);
  P.box(0.03, 0.012, 0.016, m.dark, 0.05, 0.0, -0.08);                                       // fuze plug
  return [0, 0, -0.08];
}

// MON-50: a curved olive box with its face to the front, folding legs and the detonator well on top.
function mon50Mine(gun, P) {
  const m = X();
  for (let i = -2; i <= 2; i++) P.box(0.046, 0.155, 0.066, m.olive, i * 0.044, 0.05, -0.12 + Math.abs(i) * 0.012, 0, i * 0.12, 0);
  P.cyl(0.012, 0.03, m.dark, -0.05, 0.14, -0.12, 0, 0, 0, 8);
  P.cyl(0.012, 0.03, m.dark, 0.05, 0.14, -0.12, 0, 0, 0, 8);
  return [0, 0.05, -0.16];
}

// A mine laid on the ground (feet at y = 0, facing -z). A MON-50 stands on its legs with its tripwire stretched
// across its front between two little stakes (see MINE.mon50 for where).
export function buildPlacedMine(k, wire = 1.2, half = 1.5) {
  const g = new THREE.Group(), P = new Parts(), m = X();
  if (k === 'pmn') {
    P.cyl(0.056, 0.055, m.hegreen, 0, 0.0, 0, 0, 0, 0, 16);                                    // half sunk in the ground
    P.cyl(0.042, 0.012, m.grip, 0, 0.033, 0, 0, 0, 0, 14);
  } else {
    for (let i = -2; i <= 2; i++) P.box(0.046, 0.155, 0.066, m.olive, i * 0.044, 0.2, Math.abs(i) * 0.012, 0, i * 0.12, 0);
    for (const x of [-0.08, 0.08]) { rod(P, [x, 0.12, 0.02], [x * 1.6, 0, 0.1], 0.006, m.dark, 6); rod(P, [x, 0.12, 0.02], [x * 1.6, 0, -0.08], 0.006, m.dark, 6); }
    for (const x of [-half, half]) rod(P, [x, 0, -wire], [x, 0.22, -wire], 0.008, m.wood, 5); // stakes
    rod(P, [0, 0.22, 0], [0, 0.15, -wire], 0.002, m.steel, 4);                                // wire to the fuze
    rod(P, [-half, 0.15, -wire], [half, 0.15, -wire], 0.002, m.steel, 4);                     // the tripwire
  }
  P.build(g);
  return g;
}

// Satchel charge: a canvas bag of explosive with a flap, a carrying strap and a detonator block with a red light on
// top. Held in the hand (origin at the grip).
function satchelBag(P, m, y = 0) {
  P.box(0.24, 0.16, 0.08, m.tan, 0, y, 0);                                                   // the bag
  P.box(0.245, 0.06, 0.085, m.rag, 0, y + 0.06, 0.002);                                      // the flap
  P.box(0.03, 0.17, 0.088, m.olive, -0.07, y, 0).box(0.03, 0.17, 0.088, m.olive, 0.07, y, 0); // straps round it
  P.box(0.05, 0.03, 0.03, m.dark, 0.05, y + 0.09, 0.02);                                     // detonator block
}
function satchel(gun, P) {
  const m = X();
  satchelBag(P, m, -0.02);
  P.box(0.02, 0.1, 0.012, m.olive, 0, 0.1, 0, 0, 0, 0);                                      // carrying strap
  P.box(0.008, 0.008, 0.008, m.red, 0.05, 0.085, 0.02);
  return [0, 0, -0.1];
}

// The detonator: an old push-button mobile phone — grey body, small green screen, keypad, a stub antenna.
function phone(gun, P) {
  const m = X(), a = -0.5, c = Math.cos(a), s = Math.sin(a);
  // a point on the phone (dy up its face, dz out of it, towards us) in the model, the phone tipped back by a
  const at = (x, dy, dz) => [x, 0.02 + dy * c - dz * s, -0.06 + dy * s + dz * c];
  P.box(0.05, 0.11, 0.02, m.flashgrey, ...at(0, 0, 0), a);                                    // body
  P.box(0.036, 0.03, 0.004, new THREE.MeshBasicMaterial({ color: 0x8fbf5a }), ...at(0, 0.03, 0.011), a); // screen
  for (let i = 0; i < 12; i++) P.box(0.009, 0.006, 0.004, m.dark, ...at(-0.012 + (i % 3) * 0.012, 0.002 - Math.floor(i / 3) * 0.009, 0.011), a); // keys
  P.cyl(0.005, 0.03, m.dark, ...at(0.016, 0.068, 0), a, 0, 0, 6);                             // antenna
  return [0, 0.02, -0.1];
}

// A satchel stuck on something: the bag flat on the surface (its back on y = 0, the surface's normal along +y), and
// the red light on top (userData.led, its own mesh so it can blink).
export function buildPlacedSatchel() {
  const g = new THREE.Group(), P = new Parts(), m = X();
  satchelBag(P, m, 0);
  P.build(g);
  g.rotation.x = -Math.PI / 2; // (the bag's back faces -z: lay it on its back)
  g.position.y = 0.04;
  const out = new THREE.Group();
  out.add(g);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  led.position.set(0.05, 0.075, -0.09);
  out.add(led);
  out.userData.led = led;
  return out;
}

// PKT: long heavy barrel, box receiver, ammo can on the side, spade grips at the back.
function pkt(gun, P) {
  const m = X();
  P.box(0.08, 0.1, 0.42, m.metal, 0, 0.03, -0.1);
  P.cyl(0.016, 0.62, m.dark, 0, 0.04, -0.62);
  P.cyl(0.024, 0.08, m.dark, 0, 0.04, -0.95);
  P.box(0.07, 0.02, 0.3, m.dark, 0, 0.09, -0.12);                                              // feed cover
  P.box(0.012, 0.09, 0.012, m.dark, 0, 0.12, -0.55);                                           // front sight
  for (const x of [-0.05, 0.05]) P.box(0.02, 0.09, 0.03, m.grip, x, 0.0, 0.16);                 // spade grips
  P.box(0.12, 0.02, 0.03, m.grip, 0, 0.05, 0.16);
  P.box(0.11, 0.12, 0.16, m.green, 0.1, -0.02, -0.12);                                         // ammo can
  for (let i = 0; i < 5; i++) P.cyl(0.005, 0.03, m.brass, 0.06 - i * 0.008, 0.06, -0.12, 0);   // belt
  movable(gun, 'action', (A) => A.box(0.012, 0.014, 0.03, m.steel, -0.05, 0.04, -0.05));
  return [0, 0.04, -1.0];
}

const BUILD = {
  glock: (g, P) => pistol(g, P, { slide: 'dark', frame: 'poly' }),
  usp: (g, P) => pistol(g, P, { slide: 'dark', frame: 'poly', silencer: true }),
  p228: (g, P) => pistol(g, P, { slide: 'metal', frame: 'metal', hammer: true }),
  deagle: (g, P) => pistol(g, P, { slide: 'chrome', frame: 'chrome', scale: 1.28, hammer: true, deagle: true }),
  fiveseven: (g, P) => pistol(g, P, { slide: 'dark', frame: 'tan' }),
  elite: (g, P) => {
    const mz = pistol(g, P, { slide: 'steel', frame: 'steel', hammer: true });
    const left = new THREE.Group();
    const LP = new Parts();
    pistol(left, LP, { slide: 'steel', frame: 'steel', hammer: true });
    LP.build(left);
    left.position.x = -0.18;
    g.add(left);
    return mz;
  },
  m3: (g, P) => shotgun(g, P, {}),
  xm1014: (g, P) => shotgun(g, P, { xm: true }),
  mac10: (g, P) => smg(g, P, { len: 0.24, mac: true }),
  tmp: (g, P) => smg(g, P, { len: 0.28, fore: true }),
  mp5: (g, P) => smg(g, P, { mp5: true }),
  ump45: (g, P) => smg(g, P, { len: 0.4, ump: true }),
  p90: (g, P) => smg(g, P, { p90: true }),
  galil: (g, P) => ak(g, P, { wood: X().poly, grip: X().grip }),
  famas: (g, P) => bullpup(g, P, { body: 'poly' }),
  ak47: (g, P) => ak(g, P, {}),
  m4a1: (g, P) => m4(g, P, { silencer: true }),
  sg552: (g, P) => ak(g, P, { wood: X().poly, grip: X().grip, scope: true }),
  aug: (g, P) => bullpup(g, P, { aug: true, body: 'green' }),
  scout: (g, P) => sniper(g, P, {}),
  awp: (g, P) => sniper(g, P, { awp: true }),
  g3sg1: (g, P) => autoSniper(g, P, { g3: true }),
  rpg: (g, P) => rpg7(g, P),
  rpg26: (g, P) => rpg26(g, P),
  mortar: (g, P) => mortar(g, P),
  pmn: (g, P) => pmnMine(g, P),
  satchel: (g, P) => satchel(g, P),
  phone: (g, P) => phone(g, P),
  mon50: (g, P) => mon50Mine(g, P),
  pkt: (g, P) => pkt(g, P),
  sg550: (g, P) => autoSniper(g, P, {}),
  m249: (g, P) => mg(g, P),
  knife: (g, P) => knife(g, P),
  claws: (g, P) => claws(g, P),
  he: (g, P) => grenade(g, P, 'he'),
  flash: (g, P) => grenade(g, P, 'flash'),
  smoke: (g, P) => grenade(g, P, 'smoke'),
  molotov: (g, P) => molotov(g, P),
  c4: (g, P) => c4(g, P),
};

export function buildGun(id) {
  const g = new THREE.Group();
  const P = new Parts();
  const muzzle = (BUILD[id] || BUILD.glock)(g, P);
  P.build(g);
  const mz = new THREE.Object3D();
  mz.position.set(...muzzle);
  g.add(mz);
  g.userData.muzzle = mz;
  for (const k of ['mag', 'action', 'pump']) if (g.userData[k]) g.userData[k + 'Base'] = g.userData[k].position.clone();
  return g;
}
