// Gold pictures for the buy menu, like CS2's: each gun, grenade and mine is the game's own model, rendered once from
// the side in shaded gold metal (a key light, a fill and the sky, so magazines, scopes and stocks stand out), muzzle
// to the left; armour, the kit, nightvision and the ghillie suit are
// drawn. Made while a map loads (see prewarm in main.js), so opening the menu never stutters.
import * as THREE from 'three';
import { buildGun, buildMortarSetup, buildPlacedMine, buildDrone } from './guns.js';

const GOLD = '#e7b350', W = 256, H = 128;
const icons = new Map();

// A model seen from the side, its outline filled with gold.
function renderModel(renderer, obj, target, scene, camera, gold) {
  // turned a little toward the viewer and tipped back, so the top and the side catch the light differently
  const turn = new THREE.Group();
  turn.add(obj);
  turn.rotation.set(0.12, 0.38, 0, 'YXZ');
  obj = turn;
  scene.add(obj);
  obj.updateMatrixWorld(true);
  obj.traverse(o => { if (o.isMesh) o.material = gold; else if (o.isSprite || o.isLine || o.isPoints) o.visible = false; });
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  // the long side across the picture, with a margin
  const k = Math.max(size.z / (W * 0.86), size.y / (H * 0.8), 1e-4);
  camera.left = -W / 2 * k; camera.right = W / 2 * k; camera.top = H / 2 * k; camera.bottom = -H / 2 * k;
  camera.near = 0.01; camera.far = 50;
  camera.position.set(mid.x + 10, mid.y, mid.z); // from this side the muzzle is on the left, as in CS2
  camera.lookAt(mid);
  camera.updateProjectionMatrix();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const px = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(target, 0, 0, W, H, px);
  renderer.setRenderTarget(null);
  scene.remove(obj);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const img = c.getContext('2d').createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // rows come bottom up
  c.getContext('2d').putImageData(img, 0, 0);
  return c.toDataURL();
}

// Equipment without a model, drawn.
function drawn(kind) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = GOLD;
  g.strokeStyle = GOLD;
  const vest = (x, y, s) => {
    g.beginPath();
    g.moveTo(x - 22 * s, y - 34 * s); g.lineTo(x - 10 * s, y - 34 * s); g.quadraticCurveTo(x, y - 22 * s, x + 10 * s, y - 34 * s);
    g.lineTo(x + 22 * s, y - 34 * s); g.lineTo(x + 30 * s, y - 20 * s); g.lineTo(x + 26 * s, y + 34 * s); g.lineTo(x - 26 * s, y + 34 * s);
    g.lineTo(x - 30 * s, y - 20 * s); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x - 18 * s, y + 4 * s, 36 * s, 4 * s);
    g.fillRect(x - 18 * s, y + 16 * s, 36 * s, 4 * s);
    g.fillStyle = GOLD;
  };
  if (kind === 'vest') vest(100, 50, 1.1);
  else if (kind === 'vesthelm') {
    vest(78, 52, 1);
    g.beginPath(); g.arc(140, 58, 26, Math.PI, 0); g.lineTo(170, 64); g.lineTo(110, 64); g.closePath(); g.fill();
  } else if (kind === 'kit') {
    g.fillRect(58, 34, 84, 50);
    g.fillRect(84, 22, 32, 14);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(92, 44, 16, 30); g.fillRect(84, 52, 32, 14);
  } else if (kind === 'nvg') {
    g.beginPath(); g.arc(78, 52, 22, 0, 7); g.arc(122, 52, 22, 0, 7); g.fill();
    g.fillRect(78, 42, 44, 20);
    g.lineWidth = 6; g.beginPath(); g.moveTo(56, 48); g.quadraticCurveTo(100, 6, 144, 48); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.arc(78, 52, 11, 0, 7); g.arc(122, 52, 11, 0, 7); g.fill();
  } else if (kind === 'camo') {
    // a ghillie suit: a shaggy cloak of strips
    g.beginPath(); g.ellipse(100, 30, 18, 16, 0, 0, 7); g.fill();
    for (let i = 0; i < 46; i++) {
      const a = -1.2 + (i / 45) * 2.4, l = 40 + ((i * 37) % 17);
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(100 + Math.sin(a) * 14, 40); g.lineTo(100 + Math.sin(a) * l, 40 + Math.cos(a) * l * 0.95); g.stroke();
    }
  }
  return c.toDataURL();
}

// Make them all (once).
export function makeBuyIcons(renderer, ids) {
  if (icons.size) return;
  const target = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace; // the same gold as on screen
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera();
  // gold metal (not Lambert or Phong: those carry the indoor-lighting patch), lit from the upper left and front
  const gold = new THREE.MeshStandardMaterial({ color: 0xf0b850, metalness: 0.35, roughness: 0.42, emissive: 0x4a3008, flatShading: true });
  const key = new THREE.DirectionalLight(0xfff2d8, 3.6), fill = new THREE.DirectionalLight(0xd8e4ff, 1.3);
  key.position.set(6, 8, 6);
  fill.position.set(4, -3, -6);
  scene.add(key, fill, new THREE.HemisphereLight(0xfff4e0, 0x6a5030, 1.4));
  const prev = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  for (const id of ids) {
    if (['vest', 'vesthelm', 'kit', 'nvg', 'camo'].includes(id)) { icons.set(id, drawn(id)); continue; }
    let obj;
    try {
      obj = id === 'mortar' ? buildMortarSetup(50) : id === 'pmn' || id === 'mon50' ? buildPlacedMine(id, 0.01, 0.01) : id === 'drone' ? buildDrone() : buildGun(id);
      if (id === 'drone') obj.rotation.z = -1.05; // (its top towards the camera: the arms and propellers in an X)
    } catch { continue; }
    icons.set(id, renderModel(renderer, obj, target, scene, camera, gold));
  }
  renderer.setClearColor(prev, prevAlpha);
  target.dispose();
  gold.dispose();
}

export const buyIcon = id => icons.get(id) || '';
