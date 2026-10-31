// Injected into the game page: a standalone renderer of a map.
//   window.view(pos, yaw, pitch, opts) draws one frame from a first-person camera;
//   window.viewTop(cx, cz, half, camY, opts) draws a plan from above (an orthographic camera at height camY, so
//     everything above it is cut away: camY 3.5 shows Mansion's ground floor);
//   window.info has the last frame's draw calls and triangles (sun shadow pass included);
//   window.bench(n) renders the last view n times and returns the median frame time in ms (GPU-synced).
(async () => {
  const THREE = await import('three');
  const { buildWorld } = await import('/js/world.js');
  const { MAPS } = await import('/shared/maps/index.js');
  const { setRooms, setGlow } = { setGlow: () => {}, ...(await import('/js/roomlight.js')) }; // (older builds have no setGlow)
  const map = MAPS[window.VIEW_MAP || 'cs_mansion'];
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:99999';
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = map.theme.exposure || 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1000);
  scene.add(camera);
  const t0 = performance.now();
  const world = buildWorld(scene, map, window.VIEW_Q || 'medium');
  window.buildMs = performance.now() - t0;
  setGlow(map.theme.roomGlow, new Set([...(map.switches || []).map(s => s.group), ...(map.theme.glowRooms || [])]));
  setRooms(map.rooms, {});
  window.viewWorld = world;
  let cam = camera;
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const frame = () => {
    renderer.render(scene, cam);
    window.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length };
  };
  const setup = (o, at) => {
    world.setLights(o.lights || {});
    setRooms(map.rooms, o.lights || {});
    world.setDoors(o.doors || []);
    if (o.brk) world.setBrokenPieces(o.brk);
    for (let i = 0; i < 40; i++) world.update(0.05, at);
  };
  window.view = (p, yaw, pitch, o = {}) => {
    cam = camera;
    camera.position.set(...p);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    setup(o, camera.position);
    camera.updateMatrixWorld();
    frame();
    return 'ok';
  };
  window.viewTop = (cx, cz, half, camY = 60, o = {}) => {
    const a = innerWidth / innerHeight;
    cam = new THREE.OrthographicCamera(-half * a, half * a, half, -half, 0.01, camY + 20);
    cam.position.set(cx, camY, cz);
    cam.up.set(0, 0, -1); // north (-z) up, like the radar
    cam.lookAt(cx, 0, cz);
    cam.updateMatrixWorld();
    setup(o, new THREE.Vector3(cx, 1.7, cz));
    frame();
    return 'ok';
  };
  window.bench = (n = 20) => {
    const ts = [];
    for (let i = 0; i < n; i++) {
      const t = performance.now();
      renderer.render(scene, cam);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // wait for the GPU
      ts.push(performance.now() - t);
    }
    ts.sort((x, y) => x - y);
    return +ts[n >> 1].toFixed(2);
  };
  window.viewReady = true;
})().catch(e => { window.viewError = String(e.stack || e); });
