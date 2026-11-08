# Walls & water (ROADMAP group 2, branch `feature/walls`)

## STATUS (2026-11-08)
- **Done (server, browser code, server and Node tests):**
  - **2.1 See-through bullet holes** — `t1.mjs` 13/13 (cs_mansion and cs_mansion_night), `unit.mjs` 78/78, `clientsmoke.mjs` 102/102 in all (holes part).
  - **2.2 Burst pipes and live wires** — `t2.mjs` 21/21 on both Mansion maps (with GAS_LEAK_X=6), `unit.mjs` (the runs), `clientsmoke.mjs`.
  - **2.3 Wet guns jam** — the browser's own rule; `clientsmoke.mjs` (wet guns part).
  - **2.4 Bodies float up in the flood** — the browser's; `clientsmoke.mjs` (floating part).
- **Regressions run on this branch:** `integration/links.mjs` a–g 36/36 and h 4/4 (GAS_LEAK_X=6), shield
  `t-shield.mjs` 28/28 (cs_mansion), body `t1.mjs` 57/57 (cs_mansion), gas `t_gas.mjs` 20/20 (GAS_LEAK_X=3),
  `walls/maps.mjs`: all 7 maps load and shoot (no `wa` anywhere), `BOTS=4` for 60 s on cs_mansion and cs_mansion_night
  (and 180 s on cs_mansion): no server errors, tick 0.8–1.3 ms average (max 8.3 ms at the start).
- **Not done yet (needs the browser, when allowed):** the browser test — the holes seen from both sides (day, night,
  the blackout: light through them), peeking through a shot-up wall, the rings, the dust out of the far side; a burst
  pipe's spray and the wet patch growing; the sparks, the zap; the radiators and sockets on the walls; WET / JAMMED
  over the ammo and R clearing it; a drowned body floating in the cellar; no page errors; and **the draw cost**
  (expected below) measured with `views.mjs` / `integration/gviews.mjs` against `main`.
- **Next:** the browser test, then the draw-cost numbers here.

## Where the hidden pipes and cables are (for the other wave-1 groups)
All inside existing interior plaster walls of the house; no geometry is added for them (only small sockets and
radiators drawn on the walls as hints, by `public/js/walls.js`). Coordinates in metres (x, y, z), the ground floor at
0.81, the upper floor at 4.27. None is in the living room (group 4's fireplace), above the lift shaft (group 3), or in
the cellar; group 5's grilles are in none of these walls. The data: `shared/maps/mansion_walls.js`.

| Run | Kind | Wall | Inside the wall at | Along | Height | Hint |
|---|---|---|---|---|---|---|
| W1 | water pipe | kitchen ↔ north-east room | x −13.1 | z −13.95…−10.25 | y 1.66 | radiator, kitchen side, z −10.75 |
| E1 | cable | same wall | x −13.1 | z −13.95…−10.25 | y 1.11 | sockets |
| W2 | water pipe | hall ↔ south-east room (ground floor) | z 6.70 | x −11.4…−6.86 | y 1.66 | radiator, hall side, x −7.5 |
| E2 | cable | same wall | z 6.70 | x −11.4…−6.86 | y 1.11 | sockets |
| E3 | cable | hall ↔ north-east room (ground floor) | z −9.95 | x −11.4…−6.86 | y 1.11 | sockets |
| W3 | water pipe | the two south rooms (ground floor) | x −16.35 | z 4.95…10.90 | y 1.66 | radiator, south-east room's side, z 7.95 |
| W4 | water pipe | upper hall ↔ north-east bedroom | z −9.95 | x −15.35…−6.86 | y 5.12 | radiator, gallery side, x −9.2 |
| E4 | cable | same wall | z −9.95 | x −15.35…−6.86 | y 4.57 | sockets |
| E5 | cable | upstairs partition west of the upper hall | x −16.35 | z −5.4…−1.3 and 0.9…10.9 | y 4.57 | sockets |
| (risers) | cable | up from every light switch in the house to the ceiling | the switch | vertical | switch → ceiling | the switch |

(The parts of W2, E2 and E3 west of x −11.48 were dropped: the hall's staircase stands against those walls there, so a
bullet can't get through.)

## (a) README

For the cs_mansion section (it works the same on cs_mansion_night):

  - **Bullets through walls**: bullets go through wood and plaster — the house's inner walls, its doors and wooden
    furniture — but not brick, stone, metal or a floor. Every wall takes a share of the damage (more from a pistol,
    less from a rifle or the AWP). Pistols, shotguns and SMGs go through one wall; rifles, snipers, the M249, the
    P90, the Five-SeveN and the Desert Eagle through two. A wall too thick for the angle you shoot at (a steep angle
    through a thick wall) stops the bullet. The house's outer walls are brick: nothing gets through them.
    - **The holes are real**: every bullet leaves a hole on both sides of the wall. You can see through the holes —
      shoot a wall full of holes and you can peek through it (holes close together come out bigger), and a lit room
      behind a wall shines out through its holes into a dark one. Plaster dust puffs out of the far side. Every round
      the walls are whole again.
  - **Pipes and cables in the walls**: water pipes run inside some of the house's inner walls (a radiator on the wall
    shows where: the pipe runs just above it), and electric cables run along them at socket height (the sockets show
    where) and up from every light switch.
    - Shoot through a wall where a **pipe** runs and it bursts: water sprays out of both holes for about 40 seconds
      and a wet patch spreads over the floor on both sides.
    - Shoot through a **cable** and it sparks at both holes, every second or so, for the rest of the round — as long
      as the power is on (cut the power at the fuse box and it goes dead; bring it back and it sparks again).
    - A sparking cable at the edge of a wet patch **electrocutes anyone standing in the water** (35 damage a shock,
      again and again; armour doesn't help; it kills outright). Burst a pipe and cut the cable next to it, and that
      corner of the room becomes a death trap. The kill is credited to whoever cut the cable.
    - A spark in a room full of **gas** sets the gas off, like any spark.
  - **Wet guns jam**: after swimming (the flood, the pool), wading, or standing in a wet patch, your gun is wet
    (WET shows over your ammo) and sometimes **jams** when you fire — the wetter, the more often. A jammed gun won't
    fire (JAMMED - TAP R): **tap R** to clear it (about a second) instead of reloading. It dries by itself: half a
    minute after a swim, a few seconds after a puddle.
  - **Bodies float up**: in the flooded cellar (and the pool) the dead rise to the surface and bob there face up, with
    their name over them — you can tell who drowned down there.

Keys table: **R** reloads, or clears a jammed gun when it's jammed — no new key.

## (b) RESUME notes

### Files
- `shared/materials.js` — the materials table: `MATERIALS` (pen, loss, max, burns, hole), `PAINT_MATERIAL` (paint →
  material), `pieceMaterial(map, pc)`, `boxMaterial(map, box)` (a chunk, a door, a car, the lift, glass or a static
  box: from the faces on its sides, worked out once per map, ~25 ms), `boxMaterials(map, box)` (every material on a
  static box: a floor is wood on top, plaster under), `isSlab(box)`, `materialsOn(map)` (= `map.mansion2 &&
  map.breakables`), `hardest(list)`. The hardest material on a box decides (brick outside + plaster inside = brick).
- `shared/walls.js` — `WALLS` (gap, power2, the browser's hole numbers), `keepThrough(mat, len, pen)`, `exitT`,
  `penetrate(map, world, o, d, range, w, exceptCar)` → `{ wall, wallT, passes, keep(t) }` (used alike by the server
  and the browser), `segSeg`, `runHit(runs, pass)`, `WET`, `jamChance(wet)`.
- `shared/maps/mansion_walls.js` — `WALL_RUNS` (the table above) and `wallRuns(map)` (+ the switch risers). No
  geometry, so no call in `remodel()`.
- `shared/wetfloor.js` — `WETFLOOR` (sizes, flow, shock), `inPatch`, `sparkReaches`, `sideOf`, `grown`,
  `packPatch` / `unpackPatch`.
- `lib/walls.js` — `createWalls(deps)` → `{ on, trace, onShot, tick, reset, snap, powerAt, wet, state }`: the bullets'
  traces, what they do to the walls they pass (weak doors shot, the heavy guns' chips, pipes burst, cables cut), the
  jets feeding their patches, the cut cables sparking (gas + wet floor), THE power check `powerAt(pos)`, the snapshot.
  `PIPES` (life 40 s, at most 6 jets and 8 cut cables, sparks every 0.35–1.4 s).
- `lib/wetfloor.js` — `createWetFloor(deps)` → `{ reset, add, feed, soak, spark, at, tick, snap, list }` (reusable).
- `public/js/walls.js` — the holes (shader patch of the penetrable walls' materials, the decals' and the rings'; the
  ring decals), the dust; the sprays (one mesh), the cut cables' sparks and crackle, the zap (`waZap`), the hints
  (radiators and sockets, one mesh); the wet gun (WET / JAMMED / CLEARING over `#ammo`); the floating bodies; `warm()`
  for the shader warm-up.
- `public/js/wetfloor.js` — `createWetFloorView(scene)`: every patch in one mesh (Phong, vertex alpha, flattened
  against its wall), the blue flash.
- Tests in `dev/test-scripts/walls/`: `srv.sh` (test server on 4220/4221, fresh `DATA_DIR` in `$SP/testdata`, BOTS=0,
  MAP=cs_mansion, FREEZE_TIME=1 unless given; `srv.sh stop`), `unit.mjs`, `clientsmoke.mjs` (with `register.mjs` +
  `loader.mjs`), `t1.mjs`, `t2.mjs`, `maps.mjs`, `soak.mjs`.

### Hooks in existing files (each marked `// walls:`)
- `server.js`: the import; `const walls = createWalls({...})` right after the flood's; `walls.reset()` in
  `resetWorld()`; in `onShoot()` the trace (`const pen = walls.trace(o, d, range, w, ownCar)`, `wall = pen.wall`,
  `wallT = pen.wallT`), `if (best) best.through = pen.keep(best.t)`, `!walls.on() &&` in the old realism wall-shot's
  condition (that rule — half damage through any thin breakable wall or a door, brick included — is replaced by this
  feature on the Mansion maps), `walls.onShot(p, w, traces)` after `gas.onShot`, `* (h.through ?? 1)` in a hostage's
  damage; `walls.tick(t, dt)` after `flood.tick`; `...walls.snap()` in the snapshot head.
- `public/js/main.js`: the import; `walls.setMap(map)` in `loadMap()` after `flood.setMap`; `walls.warm(...)` in
  `prewarm()`; `walls.localShot(o, d, id, tr.hitR ? tr.t : 250)` in `fireBullet()`; `if (walls.jammed(id, def, now))
  return;` in `tryFire()` just before `item.mag--`; `case 'KeyR': if (!walls.clearJam()) startReload(); break;`;
  `walls.onSnapshot(m.wa)` at the end of the `s` handler; `walls.remoteShot(m)` at the end of the `shot` handler;
  `walls.round()` in the `round` handler; `walls.update(dt, now, camera)` after `flood.update` in `frame()`;
  `walls.init({...})` before `loadMap(DEFAULT_MAP)`.
- `public/js/world.js`: `export const paintMaterial = key => ...` (the cached material of a paint, for the patch).
- `public/js/audio.js`: none (uses the flood's `floodKit`).

### Protocol
- Snapshot: optional top-level `wa: [patches, sprays, ends]`, only on the Mansion maps and only while there is a wet
  patch, a spraying pipe or a cut cable: a patch `[x, y, z, r, clip axis (-1 none), clip at, clip sign, live 1/0]`,
  a spray `[x, y, z, nx, nz, flow 0..1]` (one per hole), a cut cable's end `[x, y, z, nx, nz, powered 1/0]`.
- Server → all: `waZap { p: the spark, v: [[x, y, z] of everyone shocked] }`.
- Kill feed weapon: `electrocuted` (the flood's; kills outright: `BODY.outright`), credited to the cable's cutter when
  the victim is his enemy (else nobody).
- The holes have no message: every browser works them out from the existing `shot` messages (and its own shots).
- Client → server: nothing new.

### Numbers
- Damage left per wall: `(1 − loss × (1.4 − pen)) ^ (len / 0.4)` — through a 0.41 m plaster wall square on: AK 0.68,
  M4A1 0.64, Glock 0.53, USP 0.55, AWP 0.78; a door (0.1 m wood) USP 0.89. Longest path: plaster 0.8 m, wood
  1.0, paper 1.2, fabric 1.4. Boxes within 3 cm along the bullet are one wall (a wall is several 0.5 m chunks; the
  hall's wall is two 0.2 m slabs). Floors, ceilings and anything hit on its top or bottom stop bullets.
- Holes: radius 2.2 cm in plaster (×0.85…1.15 by the gun's damage), up to 2.6× bigger in a cluster (each hole within
  12 cm adds 30 %); 320 kept, the nearest 24 within 28 m in front of you are cut out.
- Pipes: hit within 7 cm; 40 s of spray (flow 1 → 0.35), each side's patch soaks 0.25 m²/s × flow, from r 0.3 m to at
  most 2.2 m. Cables: sparks every 0.35–1.4 s; a spark reaches a patch within its radius + 0.6 m and 2.2 m above its
  floor (on its side of the wall); 35 per shock, at most every 0.6 s per person.
- Wet guns: swim 30 s, wade 14 s, puddle 6 s of wetness (a second dries a second); jam chance 4 % damp → 14 % soaked;
  clearing 0.7 s.
- Floating: under 0.5 m or more of water; rises 0.6 m/s to 12 cm under the surface; bobs ±3.5 cm.

### Draw cost (expected; to measure in the browser)
- The holes in the walls: **0** draw calls (a few shader lines in the wall materials: a loop over at most 24 holes,
  with an early stop; nothing when there are none).
- The rings: +1 while holes are in view (one InstancedMesh, culled by its bounds). The hints (radiators and sockets):
  +1 in views with the house (one mesh, 1,440 vertices). The wet patches: +1 while one is in view. The sprays: +1
  while one is in view. No shadow casters, no new lights (the sparks borrow the effects' one flash light).

### Shared-state contracts
- Reads `game.lights.power` (in `powerAt` only), `map.rooms`, `p.alive`, `h.state`, the gas's `sparkAt(pos, 'electric',
  by)`; writes `p.wetShockAt`, `h.wetShockAt`; calls `applyDamage(..., 'electrocuted', 1)`, `hurtHostage`,
  `shootDoor`, `hurtPiece` + `breakPieces`.
- The browser reads `map.water` (the flood's boxes are in it with `flood: true`), `r.model` / `r.tag` / `r.alive` of
  `remotes` (after `updateRemotes`), `fx.decalMat`, `me.p` / `me.alive` / `me.nextShot` / `me.reload`.

## Links to wire at merge
- **Materials table → group 10 (Fire):** `shared/materials.js` — `pieceMaterial(map, pc)` / `boxMaterial(map, box)` /
  `boxMaterials(map, box)` and `MATERIALS[m].burns` (wood, paper, fabric, foliage burn). mansion.js's own `pc.fuel`
  (books, wood, fabric, crate, cardboard, door1) still stands; the table is finer (it knows plaster from brick).
- **Wet floor / electrocution API → group 10's fire hose (and anything that sparks):** on the server
  `walls.wet.soak(floorPoint, area, clip, by)` soaks the floor (a new patch or the one there grown; `clip` =
  `[axis, at, sign]` to keep it on one side of a wall, or null) — the browser draws it with no change (it's in `wa`);
  `walls.wet.spark(pos, by)` is a live spark (it checks the power itself through `powerAt`). `walls.wet.at(feet)`
  tells whether someone stands in water. The flood: no link needed today (every cable is above the flood's top,
  −0.45); if one is ever put lower, a cut cable under the water could call the flood's zap.
- **The power check → group 3's circuits:** replace the body of `powerAt(pos)` in `lib/walls.js` (the one function
  the wires and wet floors ask) with group 3's `power.poweredAt(pos)` (lib/power.js on `feature/power`). Group 3's
  surge could also call `walls.wet.spark(bulbPos, null)` so a bursting bulb over a wet floor shocks too.
- **Group 8 (suppressors) and the shooting code:** `onShoot` now asks `walls.trace()` (→ `penetrate()` in
  shared/walls.js) for each bullet; the damage beyond walls is `best.through` (players and hostages). A suppressor that
  lowers `def.damage` needs nothing more; if it changes the gun's power, penetration follows `WEAPONS[w].pen`.
- **Group 4's chimney breast and group 5's grilles:** classified like everything else from their faces (brick/stone
  or metal: they stop bullets); nothing to do.
- **Merge conflicts to expect:** the snapshot head (`...walls.snap()` after `...flood.snap()`), `resetWorld()` and
  `tick()` after the flood's lines, `loadMap()` / `frame()` / the bottom of main.js after the flood's lines, the
  `round` and `shot` handlers, `tryFire()` and the `KeyR` case.

## Not verified / known gaps
- Everything in the browser (see STATUS); the sounds by ear; the frame time on a real Intel laptop.
- The holes come from each browser's own trace of the `shot` messages: someone who joins mid-round doesn't see the
  holes made before. Your own shot's holes don't know about an enemy hidden behind the first wall (the server's
  damage is right; at worst a hole shows in a second wall the bullet never reached).
- Only the nearest 24 holes in front of you are see-through (the others are dark holes); doors get no see-through
  holes (they swing). A hole in a chunk that later breaks just goes with it.
- Jams are the browser's own rule (no server check); bots never jam and ignore wet floors, pipes and cables (they
  walk into a live patch and get shocked like anyone).
- Floating bodies are only drawn so: the server's body (for a uniform, for the lift) stays where he died; dead
  hostages don't float.
- `t1.mjs` d (the weak door) relies on the kitchen's back door (`weak`); the door's 260 hp is the existing
  `shootDoor`'s.
