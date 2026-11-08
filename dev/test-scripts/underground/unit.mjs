// Underground & vents without a server: the shared code (shared/underground.js), the server module's grenades
// (lib/underground.js with a stand-in for server.js) and the vents in the gas (lib/gas.js), on both Mansion maps.
//   node dev/test-scripts/underground/unit.mjs
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const { NADE, simulateNade } = await import(G + 'shared/physics.js');
const U = await import(G + 'shared/underground.js');
const { createUnderground } = await import(G + 'lib/underground.js');
const { createGas } = await import(G + 'lib/gas.js');
const { GAS } = await import(G + 'shared/gas.js');
const { SPOTS, findThrow } = await import('./throws.mjs');
let n = 0, fails = 0;
const ok = (what, cond) => { n++; console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) { fails++; process.exitCode = 1; } };
const r2 = v => Math.round(v * 100) / 100;

for (const id of ['cs_mansion', 'cs_mansion_night']) {
  const map = MAPS[id], world = new CollisionWorld(map), v = U.ventsOf(map);
  const room = i => (i < 0 ? 'outside' : map.rooms[i].group);
  // ---- the grilles
  ok(`${id}: 6 grilles, 3 ducts, each grille joined to one other`, v.grilles.length === 6 && v.ducts.length === 3 && v.grilles.every(g => g.links.length === 1));
  const rooms = v.grilles.map(g => room(U.grilleRoom(map.rooms, g)));
  ok(`${id}: their rooms: ${rooms.join(', ')}`, rooms.join() === 'cellar,outside,lampa6,lampa9,lampa4,lampa3');
  const inside = (p, b) => [0, 1, 2].every(k => p[k] > b.min[k] && p[k] < b.max[k]);
  for (const g of v.grilles) {
    const behind = g.c.map((c, k) => c - g.nv[k] * 0.03);
    const wall = world.solids.filter(b => inside(behind, b));
    const pts = [];
    for (const a of [0.2, 0.5, 0.8]) for (const b of [0.2, 0.5, 0.8]) for (const c of [0.2, 0.5, 0.8]) pts.push([0, 1, 2].map((k, j) => g.mouth.min[k] + (g.mouth.max[k] - g.mouth.min[k]) * [a, b, c][j]));
    ok(`${id}: grille ${g.i} (${g.name}) sits on a solid that never breaks, its mouth is clear`, wall.length > 0 && wall.every(b => b.brk == null) && !pts.some(p => world.solids.some(b => inside(p, b))));
  }
  // ---- the gas links
  const links = U.ventLinks(map);
  ok(`${id}: vent links for the gas: ${links.map(l => `${room(l.a)}-${room(l.b)} ${l.area} m²`).join(', ')}`, links.length === 3 && links.every(l => l.a >= 0) && links.some(l => l.b === -1));
  // ---- throws into each grille: found with the browser's throw, in through the right grille
  for (const s of SPOTS) {
    const g = v.grilles[s.g], t = findThrow(world, v, g, s.from);
    ok(`${id}: a throw from ${JSON.stringify(s.from)} goes into grille ${g.i} (${g.name})${t ? `: pitch ${r2(t.pitch)}, ${t.strong ? 'strong' : 'lob'}, in after ${r2(t.tIn)} s` : ''}`, !!t && t.tIn < 1.0);
    s.t = t;
  }
  // ---- the server's part with a stand-in server
  let now = 0;
  const msgs = [], game = { nades: [] };
  const ug = createUnderground({ map: () => map, world: () => world, game, now: () => now, broadcast: m => msgs.push(m), send: () => {} });
  for (const s of SPOTS) {
    if (!s.t) continue;
    const g = v.grilles[s.g], out = v.grilles[g.links[0].to];
    msgs.length = 0; game.nades.length = 0; now = 10000;
    const path = [];
    const end = simulateNade(world.nade(), s.t.o, s.t.v, 1.6, path, false);
    const full = path.length;
    const duct = ug.nade(77, 'he', 5, path, 1.6);
    game.nades.push({ id: 77, k: 'he', owner: 5, at: now + 1600, end, ...duct?.n });
    const n0 = game.nades[0];
    ok(`${id}: grille ${g.i}: the path is cut at the grille (${full} -> ${path.length} steps), the message says when (fu ${r2(duct?.m.fu)})`, !!duct && path.length === s.t.i + 1 && Math.abs(duct.m.fu - s.t.tIn) < 1e-9);
    const dm = msgs.find(m => m.t === 'ugDuct');
    ok(`${id}: grille ${g.i}: 'ugDuct' ${g.i} -> ${dm?.b} (in ${dm?.in} ms, ${dm?.d} ms in the duct)`, dm && dm.a === g.i && dm.b === out.i && dm.d >= 300);
    ok(`${id}: grille ${g.i}: the HE keeps its fuse (at ${n0.at - 10000} ms)`, n0.at === 11600);
    // run the ticks until it comes out
    for (now = 10000; now <= 11600; now += 31.25) ug.tick(now);
    const exit = msgs.find(m => m.t === 'nade' && m.vent != null);
    ok(`${id}: grille ${g.i}: it drops out of grille ${exit?.vent} (${out.name}) at ${exit && r2(U.grilleDist(out, exit.o))} m from it, with ${r2(exit?.fu)} s left`, exit && exit.vent === out.i && U.grilleDist(out, exit.o) < 0.2 && exit.fu > 0.3 && exit.fu < 1.4);
    const endRoom = U.grilleRoom(map.rooms, { c: n0.end, nv: [0, 0, 0] });
    const outRoom = U.grilleRoom(map.rooms, out);
    ok(`${id}: grille ${g.i}: it goes off in ${room(endRoom)} (${n0.end.map(r2)}), the far grille's side`, endRoom === outRoom || (outRoom === -1 && endRoom === -1));
    ok(`${id}: grille ${g.i}: ${out.name}: ${U.isUnderground(map, n0.end) ? 'under' : 'above'} ground, as the far grille's room`, U.isUnderground(map, n0.end) === (out.i === 0));
  }
  // a fuse that runs out in the duct: it goes off at a grille's mouth (the nearer one)
  {
    const s = SPOTS[2], path = [];
    simulateNade(world.nade(), s.t.o, s.t.v, 1.6, path, false);
    msgs.length = 0;
    const late = ug.nade(78, 'he', 5, path, s.t.tIn + 0.1); // (0.1 s left at the grille: less than half the duct)
    const g = v.grilles[2];
    ok(`${id}: a fuse that runs out in the duct: it goes off at the mouth of the grille it went in (${late?.n.end.map(r2)}), nothing comes out`, late && U.grilleDist(g, late.n.end) < 0.2 && ug.pending() === 0);
  }
  // a Molotov: breaks where it lands after dropping out (its time set then)
  {
    const s = { t: findThrow(world, v, v.grilles[3], SPOTS[3].from, 4, true) }, path = [];
    msgs.length = 0; game.nades.length = 0; now = 20000;
    const end = s.t ? simulateNade(world.nade(), s.t.o, s.t.v, 4, path, true) : null;
    const d = ug.nade(79, 'molotov', 5, path, 4);
    if (d) game.nades.push({ id: 79, k: 'molotov', owner: 5, at: now + path.length * NADE.dt * 1000, end, ...d.n });
    for (now = 20000; now <= 21000; now += 31.25) ug.tick(now);
    const n0 = game.nades[0], out = v.grilles[2];
    ok(`${id}: a Molotov dropped into the bedroom's grille falls out of the kitchen's ceiling and breaks on the kitchen floor (${n0?.end.map(r2)}, at +${n0 && Math.round(n0.at - 20000)} ms)`, d && n0 && U.grilleRoom(map.rooms, { c: n0.end, nv: [0, 0, 0] }) === 0 && n0.end[1] > 0.813 && n0.end[1] < 1.1 && n0.at < 21500); // (an impact grenade stops a step above the floor)
  }
  // a new round: nothing comes out
  {
    const s = SPOTS[0], path = [];
    msgs.length = 0; game.nades.length = 0; now = 30000;
    const end = simulateNade(world.nade(), s.t.o, s.t.v, 1.6, path, false);
    const d = ug.nade(80, 'he', 5, path, 1.6);
    game.nades.push({ id: 80, k: 'he', owner: 5, at: now + 1600, end, ...d.n });
    game.nades.length = 0; // (a new round empties game.nades)
    ug.reset();
    for (now = 30000; now <= 31600; now += 31.25) ug.tick(now);
    ok(`${id}: a new round while it's in the duct: nothing comes out`, !msgs.some(m => m.t === 'nade') && ug.pending() === 0);
  }
  // a grenade thrown nowhere near a grille: untouched
  {
    const path = [];
    simulateNade(world.nade(), [-18, 2.4, 0], [3, 2, 1], 1.6, path, false);
    const len = path.length;
    ok(`${id}: a grenade thrown across the living room: no vent, the path as it was`, ug.nade(81, 'he', 5, path, 1.6) === null && path.length === len);
  }
  // ---- the gas: the kitchen's pipe holed, 150 s: the bedroom above gets it through the vent
  {
    let t = 0;
    const g2 = { phase: 'live', hostages: [], fires: [], round: 1, nextNadeId: 1 };
    const w2 = new CollisionWorld(map);
    const gas = createGas({
      map: () => map, world: () => w2, game: g2, players: new Map(), now: () => t, broadcast: () => {}, send: () => {},
      inTeam: () => true, mates: () => false, applyDamage: () => 0, hurtHostage: () => {}, damageCar: () => {}, breakPieces: () => {},
      piecesNear: () => [], hurtPiece: () => {}, breakGlass: () => {}, blowDoor: () => {}, lineOfSight: () => true, roundless: () => false,
    });
    gas.reset();
    gas.rupture(0, null, null);
    const ix = g => map.rooms.findIndex(r => r.group === g);
    const conc = () => { const d = gas.debug(); return d.c || d.conc || []; };
    for (let s = 0; s <= 150 * 4; s++) { t = s * 250; gas.tick(t); }
    const c = conc();
    ok(`${id}: gas: the kitchen leaks for 150 s: the bedroom above it smells it through the vent (${r2(c[ix('lampa9')] ?? -1)} > ${GAS.smell}), the security room gets some (${(c[ix('lampa3')] ?? -1).toFixed(3)})`, c[ix('lampa9')] > GAS.smell && c[ix('lampa3')] > 0.003);
  }
}
console.log(`${n - fails}/${n} OK`);
