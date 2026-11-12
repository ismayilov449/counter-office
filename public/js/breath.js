// Visible breath in the cold (ROADMAP 9.3): outside on a night map and above the water in the flooded cellar, other
// players breathe out a small white puff every `every` s (every `run` s right after running), seen within `near` m.
// A hidden player's breath gives him away. Each puff is one sprite from the effects' smoke pool: nearly free to draw.
import { PLAYER } from '/shared/physics.js';
import { waterTop } from '/shared/flood.js';
import { indoors } from './roomlight.js';

export const BREATH = { every: 2.6, run: 1.3, near: 25, size: 0.6, life: 1.2, color: 0xe4eaf2 };
let D = null; // from main.js: { fx, map(), level(), camera }
export const initBreath = d => { D = d; };

// outside under the night sky, or above the flood's water
function cold(head) {
  if (D.map().night && head[1] > -1.5 && !indoors(head)) return true;
  const top = waterTop(D.level(), head);
  return top > -Infinity && head[1] > top;
}

// r: a remote player (p, c, yaw), speed: how fast he moves (m/s). Called every frame while he's alive.
export function breathe(r, speed, dt) {
  if (speed > 4) r.breathRun = 3; // out of breath for a few seconds
  r.breathRun = Math.max(0, (r.breathRun || 0) - dt);
  r.breathIn = (r.breathIn ?? Math.random() * BREATH.every) - dt;
  if (r.breathIn > 0) return;
  r.breathIn = (r.breathRun > 0 ? BREATH.run : BREATH.every) * (0.85 + Math.random() * 0.3);
  const head = [r.p[0], r.p[1] + (r.c ? PLAYER.crouchEye : PLAYER.eye) - 0.08, r.p[2]];
  if (D.camera.position.distanceToSquared({ x: head[0], y: head[1], z: head[2] }) > BREATH.near * BREATH.near || !cold(head)) return;
  // in front of his mouth (yaw 0 faces -z)
  D.fx.puff([head[0] - Math.sin(r.yaw) * 0.3, head[1], head[2] - Math.cos(r.yaw) * 0.3], BREATH.color, BREATH.size, BREATH.life, 0.15);
}
