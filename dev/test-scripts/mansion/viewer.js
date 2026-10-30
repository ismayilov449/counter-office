// Injected into the game page: a standalone renderer of a map, window.view(pos, yaw, pitch, opts) draws one frame.
(async () => {
  const THREE = await import('three');
  const { buildWorld } = await import('/js/world.js');
  const { MAPS } = await import('/shared/maps/index.js');
  const { setRooms } = await import('/js/roomlight.js');
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
  const world = buildWorld(scene, map, window.VIEW_Q || 'medium');
  setRooms(map.rooms, {});
  window.viewWorld = world;
  window.view = (p, yaw, pitch, o = {}) => {
    camera.position.set(...p);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    world.setLights(o.lights || {});
    setRooms(map.rooms, o.lights || {});
    world.setDoors(o.doors || []);
    if (o.brk) world.setBrokenPieces(o.brk);
    for (let i = 0; i < 40; i++) world.update(0.05, camera.position);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    return 'ok';
  };
  window.viewReady = true;
})().catch(e => { window.viewError = String(e.stack || e); });
