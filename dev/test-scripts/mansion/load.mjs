// Load the maps, report Mansion's numbers, and check walkability of given points (nav).
const G = new URL('../../../', import.meta.url).href;
const t0 = Date.now();
const { MAPS } = await import(G + 'shared/maps/index.js');
console.log('maps loaded in', Date.now() - t0, 'ms:', Object.keys(MAPS).join(' '));
const map = MAPS[process.argv[2] || 'cs_mansion'];
const nf = Object.values(map.faces).reduce((s, p) => s + p.length, 0);
console.log('boxes', map.boxes.length, 'pieces', map.breakables.length, 'faces', nf, 'doors', map.doors.length, 'ladders', map.ladders.length, 'rooms', map.rooms.length);
console.log('doors', JSON.stringify(map.doors.slice(2)));
if (process.argv[3] === 'nav') {
  const { CollisionWorld } = await import(G + 'shared/collision.js');
  const { buildNav } = await import(G + 'lib/nav.js');
  const world = new CollisionWorld(map);
  const t1 = Date.now();
  const nav = buildNav(map, world);
  console.log('nav', nav.count, 'nodes in', Date.now() - t1, 'ms');
  const reach = s => { const seen = new Uint8Array(nav.count); const st = [s]; seen[s] = 1; while (st.length) { const a = st.pop(); for (let k = 0; k < 8; k++) { const b = nav.link[a * 8 + k]; if (b >= 0 && !seen[b]) { seen[b] = 1; st.push(b); } } for (const e of nav.extra.get(a) || []) if (!seen[e.to]) { seen[e.to] = 1; st.push(e.to); } } return seen; };
  const T = reach(nav.nodeAt(map.spawns.T[0].p));
  const pts = JSON.parse(process.argv[4] || '[]');
  for (const p of pts) { const n = nav.nodeAt(p); console.log('point', p.join(','), 'node', n, n >= 0 ? 'y=' + nav.Y[n].toFixed(2) + ' reachable from T spawn: ' + !!T[n] : ''); }
  if (process.argv[5]) {
    const [a, b] = JSON.parse(process.argv[5]);
    const path = nav.path(nav.nodeAt(a), nav.nodeAt(b));
    console.log('path', path ? path.length + ' nodes; ' + path.filter((_, i) => i % 6 === 0 || i === path.length - 1).map(n => nav.pos(n).map(v => v.toFixed(1)).join('/')).join(' ') : 'none');
  }
}
