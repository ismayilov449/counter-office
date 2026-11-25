// The storm, the browser's part (Hotel Meridian, map.storm; the server's part: lib/storm.js). Rain round the camera
// while it's outdoors (streaks, one mesh); on a strike ('storm' { near }) the whole picture flashes white for a moment
// (a double flicker), then the thunder rolls in, later and quieter the farther the strike, and for as long as it
// rumbles nobody else's footsteps can be heard.
import * as THREE from 'three';
import { indoors } from './roomlight.js';

const N = 1400, R = 18, TOP = 14, FALL = 17, STREAK = 0.45;

// ctx: { scene, renderer, audio, camera, map() }
export function createStorm(ctx) {
  const { audio } = ctx;
  const pos = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 2 * R, y = Math.random() * TOP, z = (Math.random() - 0.5) * 2 * R;
    pos.set([x, y, z, x + 0.03, y + STREAK, z], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb2c8, transparent: true, opacity: 0.35, depthWrite: false }));
  rain.frustumCulled = false;
  rain.visible = false;
  ctx.scene.add(rain);
  let flashAt = -1e9, thunderAt = 0, thunderVol = 1, last = 0;

  return {
    handlers: {
      storm(m) {
        flashAt = performance.now();
        thunderAt = flashAt + (0.4 + m.near * 2.2) * 1000;
        thunderVol = 1 - m.near * 0.6;
      },
    },
    frame(now) {
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      const on = !!ctx.map().storm, cam = ctx.camera.position;
      // rain: drops fall and wrap round a box that follows the camera; none drawn while it's indoors
      rain.visible = on && !indoors([cam.x, cam.y, cam.z]);
      if (rain.visible) {
        rain.position.set(cam.x, cam.y - 4, cam.z);
        for (let i = 0; i < N; i++) {
          const k = i * 6;
          let y = pos[k + 1] - FALL * dt;
          if (y < 0) y += TOP;
          pos[k + 1] = y; pos[k + 4] = y + STREAK;
        }
        geo.attributes.position.needsUpdate = true;
      }
      if (!on) return;
      // the flash: bright, a dip, bright again, over about 0.4 s
      const s = (now - flashAt) / 1000, base = ctx.map().theme.exposure || 1;
      if (s < 0.45) ctx.renderer.toneMappingExposure = base * (1 + (s < 0.08 || (s > 0.16 && s < 0.3) ? 2.6 : 0.5));
      else if (s < 0.6) ctx.renderer.toneMappingExposure = base;
      if (thunderAt && now >= thunderAt) {
        thunderAt = 0;
        audio.play('thunder', null, thunderVol);
        audio.hush(2.6); // the thunder drowns out footsteps
      }
    },
  };
}
