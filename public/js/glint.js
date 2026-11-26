// Scope glint (ROADMAP 17.1): a player scoped in with a sniper rifle flashes a bright star from the lens toward whoever
// it points at; the closer the aim, the brighter, seen from any distance (a fixed size on screen, walls hide it).
// The scoped bit comes with the snapshot (its flags: 2).
import * as THREE from 'three';
import { PLAYER } from '/shared/physics.js';

const CONE = Math.cos(0.18); // (about 10 degrees either side of the aim)
let tex = null;
function star() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.15, 'rgba(255,250,225,0.9)'); r.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,240,0.8)'; g.fillRect(0, 31, 64, 2); g.fillRect(31, 0, 2, 64); // (the cross of a lens flare)
  return new THREE.CanvasTexture(c);
}

// Every frame for each remote player: on = scoped in with a sniper rifle and alive; cam = our camera's position.
export function glint(scene, r, on, cam) {
  let s = r.glint;
  if (!on) { if (s) s.visible = false; return; }
  if (!s) {
    tex ||= star();
    s = r.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
    s.renderOrder = 5;
    scene.add(s);
  }
  const cp = Math.cos(r.pitch), d = [-Math.sin(r.yaw) * cp, Math.sin(r.pitch), -Math.cos(r.yaw) * cp];
  const e = [r.p[0] + d[0] * 0.45, r.p[1] + (r.c ? PLAYER.crouchEye : PLAYER.eye) + d[1] * 0.45, r.p[2] + d[2] * 0.45];
  const to = [cam.x - e[0], cam.y - e[1], cam.z - e[2]], len = Math.hypot(...to) || 1;
  const dot = (d[0] * to[0] + d[1] * to[1] + d[2] * to[2]) / len;
  if (dot < CONE) { s.visible = false; return; }
  const k = (dot - CONE) / (1 - CONE);
  s.visible = true;
  s.position.set(e[0], e[1], e[2]);
  s.scale.setScalar(0.02 + 0.06 * k * k);
  s.material.opacity = 0.35 + 0.65 * k;
}
export const dropGlint = (scene, r) => { if (r.glint) { scene.remove(r.glint); r.glint.material.dispose(); r.glint = null; } };
