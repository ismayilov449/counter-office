// No server needed: builds Mansion's gas graph (rooms, openings) and runs the gas without players.
//   node graph.mjs [map] [seconds] [scenario]   scenario: closed | backdoor | windows | cellar
// Prints the openings (GAS_DEBUG) and the concentration of the busiest rooms every 5 s of game time.
process.env.GAS_DEBUG ||= '1';
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const { createGas } = await import(G + 'lib/gas.js');
const { GAS } = await import(G + 'shared/gas.js');
const [mapId = 'cs_mansion', secs = '60', scenario = 'closed'] = process.argv.slice(2);
const map = MAPS[mapId];
const world = new CollisionWorld(map);
let t = 0;
const game = { phase: 'live', hostages: [], fires: [], round: 1, nextNadeId: 1 };
const log = [];
const gas = createGas({
  map: () => map, world: () => world, game, players: new Map(), now: () => t, broadcast: m => log.push(m), send: () => {},
  inTeam: () => true, mates: () => false, applyDamage: () => 0, hurtHostage: () => {}, damageCar: () => {},
  breakPieces: ids => { for (const id of ids) world.gone.add(id); }, piecesNear: (lo, hi) => map.breakables.filter(pc => [0, 1, 2].every(k => pc.min[k] < hi[k] && pc.max[k] > lo[k])),
  hurtPiece: (pc, d, out) => { if (d > pc.hp) out.push(pc.id); }, breakGlass: ids => ids.forEach(id => world.breakGlass(id)),
  blowDoor: i => { const s = world.doorStates.slice(); s[i] = 9; world.setDoors(s); }, lineOfSight: () => true, roundless: () => false,
});
const t0 = performance.now();
gas.reset();
console.log('reset (graph) took', (performance.now() - t0).toFixed(0), 'ms');
const dbg = gas.debug();
if (scenario === 'backdoor') { const s = world.doorStates.slice(); s[2] = 1; world.setDoors(s); }
if (scenario === 'windows') { world.breakGlass(0); world.breakGlass(16); const s = world.doorStates.slice(); s[2] = 1; world.setDoors(s); }
gas.rupture(scenario === 'cellar' ? 1 : 0, null, null);
const names = dbg.rooms;
// VALVE=n: someone shuts the valve at n s (holding E by it)
const valveAt = +(process.env.VALVE || 0) * 1000, pipe = map.decor.filter(d => d.type === 'gaspipe')[scenario === 'cellar' ? 1 : 0];
const shutter = { id: 99, alive: true, p: [pipe.valve[0], pipe.valve[1] - 1, pipe.valve[2] + 0.3], act: null };
for (let s = 0; s <= +secs * 4; s++) {
  t = s * 250;
  if (valveAt && t === valveAt) console.log('valve: use ->', gas.use(shutter, t));
  if (shutter.act) gas.valve(shutter, shutter.act, t);
  gas.tick(t);
  if (s % 20 === 0) {
    const d = gas.debug();
    const top = d.c.map((v, i) => [i, v]).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]).slice(0, 7);
    console.log(`t=${(t / 1000).toFixed(0).padStart(3)}s`, top.map(([i, v]) => `${i}:${names[i]}=${v.toFixed(3)}`).join('  '));
  }
}
console.log('thresholds: smell', GAS.smell, 'haze', GAS.haze, 'ignite', GAS.ignite, 'choke', GAS.choke);
