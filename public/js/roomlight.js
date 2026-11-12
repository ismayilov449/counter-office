// Indoor lighting: inside a room volume the sun doesn't reach, and the sky light is dimmed — strongly when the
// room's lights are switched off. On night maps a room whose lights are on also glows with their warm light all
// through it (so it's lit wherever its lamp is, even when the lamp isn't one of the few that really shine, and its
// windows look lit from outside). Done by patching the Lambert/Phong shaders with shared uniforms.
import * as THREE from 'three';

const N = 24;
const LIT = 0.85, DARK = 0.12;
const PAD = 0.06;
const BLACKOUT = 0.025; // the power cut on Mansion: only flashlights, muzzle flashes and fire light the rooms

const uniforms = {
  uRoomMin: { value: Array.from({ length: N }, () => new THREE.Vector3(1e5, 1e5, 1e5)) },
  uRoomMax: { value: Array.from({ length: N }, () => new THREE.Vector3(-1e5, -1e5, -1e5)) },
  // How much of the sky light gets in; on night maps GLOW + the glow for a lit room (the glow rides on this one value
  // because the room loop runs for every pixel: a second array in it cost ~10% of a frame on swiftshader).
  uRoomAmb: { value: new Array(N).fill(1) },
  // Nightvision: flat light on every surface, dark room or not (the screen's CSS filter alone can't lift black: 0 x 2.3 = 0).
  uNvg: { value: 0 },
};
export const setNvg = k => { uniforms.uNvg.value = k; };
const GLOW = 2; // (a sky-light share is at most 1)

// A lamp lights only its own room (integration 2026-11-08): point lights cast no shadows, so a lamp lit the rooms round
// it through the walls (a room switched off stayed lit by its neighbours' lamps, on the same storey too). Each point
// light gets up to two boxes (its room's parts: world.js puts them on the lamp as userData.box, from map.rooms by its
// light group); a surface outside them gets none of its light. A light with no box (the effects' flash, fires, the
// estate's lamps, the lift's) lights everything as before. The boxes go in the order three.js lists the scene's point
// lights (lampBoxes, from the main scene's onBeforeRender); any other scene draws with them off (no point lights there).
// Light through a see-through bullet hole still works: the lit room's surfaces seen through it are in its lamp's box.
const NL = 32, FAR = 1e5;
const LPAD = 0.02; // (its walls' faces lie on its box's sides)
const lampVec = v => ({ value: Array.from({ length: NL }, () => new THREE.Vector3(v, v, v)) });
uniforms.uLampAMin = lampVec(-FAR); uniforms.uLampAMax = lampVec(FAR);
uniforms.uLampBMin = lampVec(FAR); uniforms.uLampBMax = lampVec(-FAR);
const _lights = [];
function collectLights(o, cam) {
  if (o.visible === false) return;
  if (o.isPointLight && o.layers.test(cam.layers)) _lights.push(o);
  for (const c of o.children) collectLights(c, cam);
}
function setLampBox(i, box) {
  const a = box?.[0], b = box?.[1];
  if (a) { uniforms.uLampAMin.value[i].set(a.min[0] - LPAD, a.min[1] - LPAD, a.min[2] - LPAD); uniforms.uLampAMax.value[i].set(a.max[0] + LPAD, a.max[1] + LPAD, a.max[2] + LPAD); }
  else { uniforms.uLampAMin.value[i].setScalar(-FAR); uniforms.uLampAMax.value[i].setScalar(FAR); }
  if (b) { uniforms.uLampBMin.value[i].set(b.min[0] - LPAD, b.min[1] - LPAD, b.min[2] - LPAD); uniforms.uLampBMax.value[i].set(b.max[0] + LPAD, b.max[1] + LPAD, b.max[2] + LPAD); }
  else { uniforms.uLampBMin.value[i].setScalar(FAR); uniforms.uLampBMax.value[i].setScalar(-FAR); }
}
// (three.js: the visible point lights in scene order, shadow casters first, then those with a map: WebGLLights.setup)
export function lampBoxes(scene, cam) {
  _lights.length = 0;
  collectLights(scene, cam);
  _lights.sort((x, y) => (y.castShadow ? 2 : 0) - (x.castShadow ? 2 : 0) + (y.map ? 1 : 0) - (x.map ? 1 : 0));
  for (let i = 0; i < NL; i++) setLampBox(i, _lights[i]?.userData.box);
}
export function lampBoxesOff() { for (let i = 0; i < NL; i++) setLampBox(i, null); }
// The main scene's renders (the view, the CCTV picture) mask the lamps; the first-person weapon's scene draws unmasked.
export function maskLamps(scene) {
  scene.onBeforeRender = (r, s, cam) => (globalThis.__noLampMask ? lampBoxesOff() : lampBoxes(s, cam)); // (__noLampMask: the browser tests' A/B)
  scene.onAfterRender = () => lampBoxesOff();
}

let rooms = [];
let glow = 0, glowGroups = null;

// Night maps: how strongly a lit room glows (map.theme.roomGlow), and which rooms have lamps (the groups of the
// map's light switches, plus map.theme.glowRooms for lamps that are always on, like the tunnels'; a shed without
// either stays dark).
export function setGlow(k, groups) {
  glow = k || 0;
  glowGroups = groups || null;
}

export function setRooms(list, lights) {
  rooms = (list || []).slice(0, N);
  for (let i = 0; i < N; i++) {
    const r = rooms[i];
    if (r) {
      // (a little bigger, so the walls and ceilings on its edges count as inside)
      uniforms.uRoomMin.value[i].set(r.min[0] - PAD, r.min[1] - PAD, r.min[2] - PAD);
      uniforms.uRoomMax.value[i].set(r.max[0] + PAD, r.max[1] + PAD, r.max[2] + PAD);
      const on = lights?.[r.group] !== false;
      uniforms.uRoomAmb.value[i] = !on ? ((lights.power === false || lights.dead?.includes(r.group)) && r.power ? BLACKOUT : DARK) // (power: lights.dead, a circuit without power)
        : glow && (!glowGroups || glowGroups.has(r.group)) ? GLOW + glow : (r.amb ?? LIT);
    } else {
      uniforms.uRoomMin.value[i].set(1e5, 1e5, 1e5);
      uniforms.uRoomMax.value[i].set(-1e5, -1e5, -1e5);
      uniforms.uRoomAmb.value[i] = 1;
    }
  }
}

// How much a lit room glows at a point (night maps), for the first-person weapon.
export function glowAt(p) {
  let k = 0;
  rooms.forEach((r, i) => {
    if (p.x > r.min[0] && p.x < r.max[0] && p.y > r.min[1] && p.y < r.max[1] && p.z > r.min[2] && p.z < r.max[2]) k = Math.max(k, uniforms.uRoomAmb.value[i] - GLOW);
  });
  return k;
}

// Brightness factor at a point (used for the first-person weapon, which lives in its own scene).
export function ambientAt(p) {
  let k = 1;
  rooms.forEach((r, i) => {
    if (p.x > r.min[0] && p.x < r.max[0] && p.y > r.min[1] && p.y < r.max[1] && p.z > r.min[2] && p.z < r.max[2]) k = Math.min(k, uniforms.uRoomAmb.value[i] > GLOW ? LIT : uniforms.uRoomAmb.value[i]);
  });
  return k;
}
// Is a point ([x, y, z]) in one of the rooms (under a roof)?
export const indoors = p => rooms.some(r => p[0] > r.min[0] && p[0] < r.max[0] && p[1] > r.min[1] && p[1] < r.max[1] && p[2] > r.min[2] && p[2] < r.max[2]);

const SUN_LINE = 'getDirectionalLightInfo( directionalLight, directLight );';
const POINT_LINE = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
if (!THREE.ShaderChunk.lights_fragment_begin.includes(POINT_LINE)) console.warn('roomlight: the point light line moved (three.js update?): lamps light through walls again');

function onBeforeCompile(shader) {
  shader.uniforms.uRoomMin = uniforms.uRoomMin;
  shader.uniforms.uRoomMax = uniforms.uRoomMax;
  shader.uniforms.uRoomAmb = uniforms.uRoomAmb;
  shader.uniforms.uNvg = uniforms.uNvg;
  for (const k of ['uLampAMin', 'uLampAMax', 'uLampBMin', 'uLampBMax']) shader.uniforms[k] = uniforms[k]; // (a lamp lights its own room)
  shader.vertexShader = 'varying vec3 vRoomPos;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    vec4 roomWp = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      roomWp = instanceMatrix * roomWp;
    #endif
    vRoomPos = ( modelMatrix * roomWp ).xyz;`);
  shader.fragmentShader = `varying vec3 vRoomPos;
uniform vec3 uRoomMin[ ${N} ];
uniform vec3 uRoomMax[ ${N} ];
uniform float uRoomAmb[ ${N} ];
uniform float uNvg;
#if NUM_POINT_LIGHTS > 0
uniform vec3 uLampAMin[ NUM_POINT_LIGHTS ];
uniform vec3 uLampAMax[ NUM_POINT_LIGHTS ];
uniform vec3 uLampBMin[ NUM_POINT_LIGHTS ];
uniform vec3 uLampBMax[ NUM_POINT_LIGHTS ];
float lampIn( vec3 a0, vec3 a1, vec3 b0, vec3 b1 ) {
  return ( ( all( greaterThan( vRoomPos, a0 ) ) && all( lessThan( vRoomPos, a1 ) ) ) || ( all( greaterThan( vRoomPos, b0 ) ) && all( lessThan( vRoomPos, b1 ) ) ) ) ? 1.0 : 0.0;
}
#endif
` + shader.fragmentShader
    .replace('void main() {', `void main() {
  float roomIn = 0.0;
  float roomAmb = 1.0;
  for ( int i = 0; i < ${N}; i ++ ) {
    if ( all( greaterThan( vRoomPos, uRoomMin[ i ] ) ) && all( lessThan( vRoomPos, uRoomMax[ i ] ) ) ) {
      // (the first room sets it: starting from 1.0, min() would cap a lit room's GLOW + glow and it never glowed)
      roomAmb = roomIn > 0.5 ? min( roomAmb, uRoomAmb[ i ] ) : uRoomAmb[ i ];
      roomIn = 1.0;
    }
  }
  float roomGlow = max( roomAmb - ${GLOW.toFixed(1)}, 0.0 );
  roomAmb = roomAmb > ${GLOW.toFixed(1)} ? ${LIT} : roomAmb;`)
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(SUN_LINE, `${SUN_LINE}\n\t\tdirectLight.color *= 1.0 - roomIn;`)
      .replace(POINT_LINE, `${POINT_LINE}\n\t\tdirectLight.color *= lampIn( uLampAMin[ i ], uLampAMax[ i ], uLampBMin[ i ], uLampBMax[ i ] );`))
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse *= roomAmb;\n\treflectedLight.indirectDiffuse += roomGlow * vec3( 1.0, 0.8, 0.56 ) * BRDF_Lambert( material.diffuseColor );\n\treflectedLight.indirectDiffuse += uNvg * BRDF_Lambert( material.diffuseColor );');
}

// Every Lambert and Phong material has it from the start (set on their prototypes when this module loads), so a
// material is compiled once, with it, the first time it's drawn — patching materials one by one later meant a
// second compile (a freeze) for every new kind of thing on screen.
for (const M of [THREE.MeshLambertMaterial, THREE.MeshPhongMaterial]) {
  M.prototype.onBeforeCompile = onBeforeCompile;
  M.prototype.customProgramCacheKey = () => 'room-light';
}
