// Indoor lighting: inside a room volume the sun doesn't reach, and the sky light is dimmed — strongly when the
// room's lights are switched off. Done by patching the Lambert/Phong shaders with shared uniforms.
import * as THREE from 'three';

const N = 24;
const LIT = 0.85, DARK = 0.12;

const uniforms = {
  uRoomMin: { value: Array.from({ length: N }, () => new THREE.Vector3(1e5, 1e5, 1e5)) },
  uRoomMax: { value: Array.from({ length: N }, () => new THREE.Vector3(-1e5, -1e5, -1e5)) },
  uRoomAmb: { value: new Array(N).fill(1) },
};

let rooms = [];

export function setRooms(list, lights) {
  rooms = (list || []).slice(0, N);
  for (let i = 0; i < N; i++) {
    const r = rooms[i];
    if (r) {
      uniforms.uRoomMin.value[i].set(...r.min);
      uniforms.uRoomMax.value[i].set(...r.max);
      uniforms.uRoomAmb.value[i] = lights?.[r.group] === false ? DARK : (r.amb ?? LIT);
    } else {
      uniforms.uRoomMin.value[i].set(1e5, 1e5, 1e5);
      uniforms.uRoomMax.value[i].set(-1e5, -1e5, -1e5);
      uniforms.uRoomAmb.value[i] = 1;
    }
  }
}

// Brightness factor at a point (used for the first-person weapon, which lives in its own scene).
export function ambientAt(p) {
  let k = 1;
  rooms.forEach((r, i) => {
    if (p.x > r.min[0] && p.x < r.max[0] && p.y > r.min[1] && p.y < r.max[1] && p.z > r.min[2] && p.z < r.max[2]) k = Math.min(k, uniforms.uRoomAmb.value[i]);
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
  }`)
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(SUN_LINE, `${SUN_LINE}\n\t\tdirectLight.color *= 1.0 - roomIn;`))
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse *= roomAmb;');
}

// Every Lambert and Phong material has it from the start (set on their prototypes when this module loads), so a
// material is compiled once, with it, the first time it's drawn — patching materials one by one later meant a
// second compile (a freeze) for every new kind of thing on screen.
for (const M of [THREE.MeshLambertMaterial, THREE.MeshPhongMaterial]) {
  M.prototype.onBeforeCompile = onBeforeCompile;
  M.prototype.customProgramCacheKey = () => 'room-light';
}
