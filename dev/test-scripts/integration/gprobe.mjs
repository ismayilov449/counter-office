// Looks at one spot in the real game and lists what is drawn there (headless Edge on CDP_PORT, server on GAME_PORT,
// BOTS=0): screenshots from AT looking along each of YAWS, and the scene's meshes whose world box meets BOX.
//   AT='[26,0,2.5]' YAWS='[-2.45,-3.36]' BOX='[23.5,-0.5,3,28,4,9]' node gprobe.mjs
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
const AT = JSON.parse(process.env.AT || '[26,0,2.5]'), YAWS = JSON.parse(process.env.YAWS || '[-2.45,-3.36]');
const BOX = JSON.parse(process.env.BOX || '[23.5,-0.5,3,28,4,9]'), PREFIX = process.env.PREFIX || 'probe';
const g = await open('CT', 'Viewer', ['round']);
await g.cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 6 && !(await g.ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await g.ev('document.querySelector(\'#join .team-btn[data-team="CT"]\').click(), 1'); await sleep(1500);
}
const t = await player('Parked', 'T');
for (let i = 0; i < 100 && !(JSON.parse(await g.ev('JSON.stringify(__in)')).some(m => m.t === 'round')); i++) await sleep(200);
t.at([-37.5, 0, 1.5], 0);
await sleep(4000);
await g.ev(`(async () => {
  const THREE = await import('three');
  window.__scenes = new Set();
  const umw = THREE.Object3D.prototype.updateMatrixWorld;
  THREE.Object3D.prototype.updateMatrixWorld = function (f) { if (this.isScene) window.__scenes.add(this); return umw.call(this, f); };
  window.__meshesIn = (min, max) => {
    const b = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), out = [];
    for (const s of __scenes) s.traverse(o => {
      if (!(o.isMesh || o.isPoints || o.isSprite) || !o.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const wb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (!wb.intersectsBox(b)) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      out.push({ name: o.name || o.type, inst: !!o.isInstancedMesh, mat: m?.type, color: m?.color?.getHexString?.(), map: !!m?.map, tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 | 0,
        box: [wb.min.x, wb.min.y, wb.min.z, wb.max.x, wb.max.y, wb.max.z].map(v => +v.toFixed(2)), ud: Object.keys(o.userData || {}).join(','), parent: o.parent?.type + (o.parent?.name ? ':' + o.parent.name : '') });
    });
    return out;
  };
  return 1;
})()`);
await sleep(500);
for (const [i, yaw] of YAWS.entries()) { await g.tp(AT, yaw, 0); await sleep(2500); await g.shot(`${PREFIX}_${i}.png`); }
const list = JSON.parse(await g.ev(`JSON.stringify(__meshesIn(${JSON.stringify(BOX.slice(0, 3))}, ${JSON.stringify(BOX.slice(3))}))`));
for (const m of list.filter(m => m.box[3] - m.box[0] < 40 && m.box[5] - m.box[2] < 40)) console.log(JSON.stringify(m));
console.log(`(${list.length} meshes meet the box; the big merged level meshes not listed)`);
console.log('page errors:', g.errors.length ? g.errors.join(' | ') : 'none');
t.close();
process.exit(0);
