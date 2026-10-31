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
};
const GLOW = 2; // (a sky-light share is at most 1)

let rooms = [];
let glow = 0, glowGroups = null;

// Night maps: how strongly a lit room glows (map.theme.roomGlow), and which rooms have lamps (the groups of the
// map's light switches; a tunnel or a shed without one stays dark).
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
      uniforms.uRoomAmb.value[i] = !on ? (lights.power === false && r.power ? BLACKOUT : DARK)
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

const SUN_LINE = 'getDirectionalLightInfo( directionalLight, directLight );';

function onBeforeCompile(shader) {
  shader.uniforms.uRoomMin = uniforms.uRoomMin;
  shader.uniforms.uRoomMax = uniforms.uRoomMax;
  shader.uniforms.uRoomAmb = uniforms.uRoomAmb;
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
` + shader.fragmentShader
    .replace('void main() {', `void main() {
  float roomIn = 0.0;
  float roomAmb = 1.0;
  for ( int i = 0; i < ${N}; i ++ ) {
    if ( all( greaterThan( vRoomPos, uRoomMin[ i ] ) ) && all( lessThan( vRoomPos, uRoomMax[ i ] ) ) ) {
      roomIn = 1.0;
      roomAmb = min( roomAmb, uRoomAmb[ i ] );
    }
  }
  float roomGlow = max( roomAmb - ${GLOW.toFixed(1)}, 0.0 );
  roomAmb = roomAmb > ${GLOW.toFixed(1)} ? ${LIT} : roomAmb;`)
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(SUN_LINE, `${SUN_LINE}\n\t\tdirectLight.color *= 1.0 - roomIn;`))
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse *= roomAmb;\n\treflectedLight.indirectDiffuse += roomGlow * vec3( 1.0, 0.8, 0.56 ) * BRDF_Lambert( material.diffuseColor );');
}

// Every Lambert and Phong material has it from the start (set on their prototypes when this module loads), so a
// material is compiled once, with it, the first time it's drawn — patching materials one by one later meant a
// second compile (a freeze) for every new kind of thing on screen.
for (const M of [THREE.MeshLambertMaterial, THREE.MeshPhongMaterial]) {
  M.prototype.onBeforeCompile = onBeforeCompile;
  M.prototype.customProgramCacheKey = () => 'room-light';
}
