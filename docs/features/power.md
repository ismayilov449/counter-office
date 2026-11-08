# Power & machinery (ROADMAP group 3, branch `feature/power`)

## STATUS (2026-11-08: built and server-tested; the browser test and the draw-cost numbers are next)

- **Done (server, browser code, geometry; server and node tests):**
  - **3.1 A breaker per circuit + the garage's generator.** `t1.mjs` 31/31 (day and night), `t4.mjs` 9/9 (the links),
    `unit.mjs` 57/57, `client-node.mjs` 37/37, `lib.mjs` 29/29.
  - **3.2 Power surge.** `t2.mjs` 19/19 (`POWER_SURGE=1`), and its random mode on a default server (1 to 4 of 5 bulbs).
  - **3.3 Cut the lift's cable.** `t3.mjs` 15/15 (the brake never catching) and 10/10 (always catching), `lib.mjs`
    (hostages riding and under it).
- **Regressions run on this branch:** `t17cctv` 17/17, `t-elev` 35/35, flood `t1` 18/18, `integration/links.mjs`
  a–g 36/36 and h 4/4 (`GAS_LEAK_X=6`), `mansion/walls.mjs` 0 missing / 0 drawn twice, nav 0 links through floors
  (30,412 nodes; main 30,398: +14 on the machine room's floor), all 7 maps load and take a player (`maps.mjs`), 60 s
  with `BOTS=4` on both Mansion maps: no server errors, tick 0.7–0.9 ms average (max 3.1 ms).
- **Not done yet (needs the browser, when allowed):** the browser test (the panel, the generator, the winch and the
  machine room seen in the game, day and night; the rooms dark per circuit; the hints; the bulbs bursting; the cabin
  falling with you in it; the sounds by ear; no page errors) and **the draw cost** measured with `views.mjs` against
  `main`. Expected: +1 draw call per model in the view's frustum (the panel, the generator, the winch: one mesh each,
  no shadows), +0 for the machine room, the ladder's brackets and the pit's buffers (their faces go into the level's
  per-material meshes: concrete, block, gravel, trim, metal, all already there), +0…1 for the generator's exhaust
  (the effects' smoke billboards), no new light. Looking at the house from outside, all three models are in the
  frustum: up to +3.
- **Next:** the browser test, then the draw-cost numbers here.

## Footprints (for the other wave-1 groups: please keep clear)

All on `cs_mansion` and `cs_mansion_night` (the night map spreads the day map). Metres, y up.

| What | Where | Notes |
|---|---|---|
| **Breaker panel** | Cellar, on the north wall (face z −5.49), x −17.30…−16.60, y −1.30…−0.40, sticking out to z −5.37 | 1.3 m east of the fuse box (x −18.6…−18.0). Keep the floor in front of it clear (x −17.6…−16.3, z −5.49…−4.4). Drawn only (no solid). |
| **Generator** | Garage, against the south wall: x −20.25…−18.95, z −15.30…−14.50, y 0…0.85 | Between the kitchen steps (x −22.15…−20.95) and the oil drums (x −17.35…). A solid, `keep`. |
| **Machine room** | Roof, straight over the lift's shaft: outer x −22.20…−19.20, z −5.75…−3.20, floor 9.92, ceiling 12.42, roof top 12.57 | Cut into the west slope of the house's roof. Open doorway in its east wall (z −4.95…−4.00, 2.35 high). Everything `keep`. The winch (a solid) x −21.85…−20.45, z −5.00…−3.95, a control cabinet on the north wall. |
| **Roof ladder** | Roof terrace, against the eave of the house's front (east) wall: x −6.20…−5.70, z −4.20…−3.60, from the terrace (4.27) to 7.95 | 4 m south of the zip line (z −8.0), clear of its pole, tensioner and stand. |
| **Way over the roof** | From the ladder's top (−6.2, 7.0, −3.9) west up the roof to the ridge (x −15.4, 12.27) and down to the machine room's door | The roof is walkable already (its collision is fine steps); no chimney stack or vent in the strip z −5.8…−2.6 between x −22.3 and −6.2. (Group 4's chimney is at z 4.28…5.28: clear.) |
| **Lift pit buffers** | In the shaft's pit, drawn only (not solid): x −21.20…−20.95 and −20.15…−19.90, z −4.60…−4.35, y −3.40…−3.15 | Where a falling cabin lands (its floor at −3.05). |

## README (player-facing)

Text for the README's Mansion section (cs_mansion and cs_mansion_night), after the lift:

### Power & machinery (Mansion)

- **Circuits and breakers.** The house's power comes through the fuse box in the cellar (its lever is still the master
  switch: Terrorists cut everything, CTs bring it back) and then through a **breaker panel** on the cellar's north wall,
  just right of the fuse box. It has five breakers, labelled: **UPPER** (the upper floor's lights), **GROUND** (the
  ground floor's lights, the garage and, at night, the estate's lamps), **CELLAR** (the cellar's light), **CCTV** (the
  cameras and the security monitors) and **LIFT** (the lift and its light).
  - Look at a breaker and **hold E (1 s)**. Terrorists switch breakers off, CTs switch them back on. Cutting one darkens
    or stops only that floor or system: cut UPPER and the upper floor goes pitch dark while the rest stays lit; cut LIFT
    and the lift stops dead (like in a blackout); cut CCTV and the cameras show NO POWER.
  - A light switch on a floor with no power does nothing ("No power on the upper floor — its breaker is off").
  - When the power comes back, every lamp comes back as its switch was.
- **The generator** in the garage (against the wall by the kitchen steps): if the Terrorists cut the power, a **CT** can
  look at it and **hold E (3 s)** to start it. It's loud: you hear it roar from far across the estate. While it runs
  it lights **both floors of the house** (not the cellar, the cameras or the lift), as far as their breakers allow.
  A Terrorist can switch it off (hold E, 2 s). Its tank lasts **90 seconds** of running; then it sputters out. It's
  full again every round.
- **Power surge.** When the power comes back to a circuit (a breaker, the fuse box or the generator), a second later a
  few of its **lit** bulbs burst with a pop and a shower of sparks, and stay dark until the round ends. Each burst is a
  spark: in a room full of gas, it blows up. Switch the lights off before you bring the power back to be safe.
- **Cut the lift's cable.** The lift's machine room stands on the roof, right over the shaft. Get onto the roof from
  the roof terrace: a steel ladder runs up the front wall by the terrace's door to the eave; walk up over the ridge,
  and the machine room's door faces you on the other slope. A **Terrorist** looks at the winch and **holds E (4 s)** to
  cut the cable with a grinder (loud, sparks).
  - The cabin falls with everyone in it (or on its roof). The emergency brake catches it only sometimes (**1 in 3**):
    then it drops less than a metre and stops, nobody hurt.
  - Otherwise it crashes into the pit: everyone riding takes fall damage by the height — from the upper floor it's
    deadly, from the ground floor about 40, from the cellar nothing. Hostages too. Anyone in the pit under it is
    crushed. The crash sparks (gas).
  - The lift is out of order until the round ends (the buttons say so; its breaker doesn't help). Get out by prying
    the doors open (near a floor) or through the roof hatch.
  - Killing an enemy this way counts as your kill; teammates riding it get hurt too, but it's not a team kill.
- Bots don't use any of it.

For the file list at the end of the README:

    shared/power.js            Power & machinery: the circuits, the generator's fuel, the surge, the lift's fall, aiming
    shared/maps/mansion_power.js  The breaker panel's, the generator's and the machine room's spots; the machine room, the roof ladder
    lib/power.js               On the server: every lamp of the house, the breakers, the generator, the surge, cutting the cable
    public/js/power.js         In the browser: the panel, the generator and the winch, their sounds, the hints

## RESUME notes

### How it works
- **Circuits** (`shared/power.js` `CIRCUITS`: `upper`, `ground`, `cellar`, `cctv`, `lift`). The house's light groups
  (`map.fusebox.groups`) are each on one (`circuitTable(map)`): rooms at 4.0 m and up → upper; `cellar` → cellar;
  `elevator` → lift; `garage`, `estate` (night) and the rest → ground (the two-storey stair hall `lampa5` too). Nothing
  else (the tunnels, the shed, the neighbour's house, the street) is on the house's power. `live(state, c, t)`: the
  breaker on, and the mains on or the generator running and feeding it (`GEN.circuits`: upper, ground).
- **The lamps** (`game.lights[g]`, what every browser draws) are now worked out by `lib/power.js` for every house group:
  its switch on (kept in `sw`, so lamps come back as they were), its circuit live, its bulb not burst (and the lift's
  cable whole for `elevator`). `game.lights.dead` lists the house groups with no power: `roomlight.js` makes those rooms
  pitch dark (BLACKOUT) like the blackout does; a lamp merely switched off stays DARK as before. `game.lights.power` is
  still the mains (the fuse box's lever), for everything that read it.
- **Who changes what:** the fuse box's lever (`setPower` → `circuits.setMains`), the flood blowing the fuse (it sets
  `game.lights.power = false` itself; `circuits.tick` notices and works the lamps out again, so a running generator
  keeps the floors lit), a breaker, the generator (start, stop, out of fuel), a light switch (`circuits.onSwitch`),
  a bulb bursting.
- **The surge:** whenever a circuit goes from dead to live, each **lit** bulb on it (`ceilinglamp` decor of its groups)
  bursts with `SURGE.chance` (0.25); with 3 or more lit bulbs coming back at least one does. They burst
  `SURGE.delay` (1 s, after the browsers' flicker on a mains restore) apart by `SURGE.gap` (0.25 s); a bulb switched
  off or without power again by then stays whole. A burst: `pwPop` to everyone, `sparkAt(bulb, 'electric', whoever
  restored it)`, the group listed in `burst` and dark until the round ends (its switch says so).
- **The generator:** `[running, fuel at gt, gt]`; burns 1 fuel second per second while running (also with the mains on);
  at 0 it stops (`genout`). A CT starts it (3 s), a T stops it (2 s); starting sparks (`'motor'`: a garage full of gas
  goes up). Tank `GEN.tank` 90 s; `refuel(seconds)` adds up to the tank.
- **The cable:** a T at the winch holds E 4 s (`pwCut`; `grind` sound at the start). Then `st.cut = 1`, the lift's
  `fall(t, tc, CABLE.land)`: the cabin falls freely at 9.81 m/s² (`fallAt`, in `motionAt` for both sides) towards its
  floor on the pit's buffers (−3.05); with chance `CABLE.catch` (1/3) the brake grips after `CABLE.tc` 0.35 s and stops
  it at 25 m/s² (0.84 m in all). The riders are taken when it's cut (in the cabin or on its roof); when the lift's
  motion ends it calls `landed`: on the buffers, every rider still in the shaft takes `crashDamage(height)`
  (nothing up to 1.5 m, then 18 per metre: from the upper floor 105, the ground floor 43, the cellar 0) as weapon
  `lift` (an enemy's credited to the cutter, a teammate's to nobody), hostages riding too (`hurtHostage`, no fine);
  anyone below the cabin's floor in the shaft is crushed (500, weapon `crushed`, added to `BODY.outright` at load: no
  downed state); `sparkAt(pit, 'electric', cutter)`. Caught: a screech, nobody hurt. Out of order until the round ends
  (`liftWorks()` false: the lift behaves as in a blackout, prying and the hatch work).

### Files (all new but the hooks)
- `shared/power.js`: `CIRCUITS`, `CIRCUIT_NAMES`, `LABELS`, `BREAKER`, `GEN`, `SURGE`, `CABLE`, `REACH`, `freshState`,
  `genFuel`, `genRunning`, `live`, `circuitTable`/`circuitOf`/`circuitAt`, `deadGroups`, `fallAt`, `caughtDrop`,
  `crashDamage`, `aimAt` (what E is aimed at: `b0`..`b4`, `g`, `w`), `rayBox`, `targetSpot`.
- `shared/maps/mansion_power.js`: `POWER` (map.power: the panel's box, the generator's box and exhaust, the machine
  room, the winch and its ropes, the ladder, the buffers) and `addPower` (the geometry, one call in `remodel()`).
- `lib/power.js`: `createPower(ctx)` → `reset`, `on`, `powered(c)`, `poweredAt(pos)`, `liftWorks`, `broken`,
  `setMains`, `onSwitch`, `message`, `use`, `act`, `tick`, `send`, `landed`, `refuel(seconds)`, `debug`. Test-only env:
  `GEN_TANK` (seconds in a full tank), `POWER_SURGE` (a bulb's chance; 0 never), `POWER_CATCH` (the brake's chance).
- `public/js/power.js`: `createPower(ctx)` → `load`, `handlers` (`power`, `pwPop`, `pwSfx`), `update`, `hint`,
  `progress`, `powered(c)`, `poweredAt(pos)`, `debug`. The panel (one mesh, a 256×128 canvas for its labels, rebuilt
  when a breaker flips), the generator (one mesh, shakes while running, exhaust puffs within 30 m), the winch (one mesh,
  rebuilt when cut: frayed rope ends). The generator's roar is its own WebAudio loop (refDistance 10 m, rolloff 0.5).
- Tests: `dev/test-scripts/power/` (see Tests below).

### Hooks in shared files (each marked `power`)
- `server.js`: the import; `live: () => circuits.powered('cellar')` in `createFlood`'s deps; `circuits.reset()` in
  `resetWorld` after the fuse box's line (before the `world` broadcast and `elevator.reset()`); `circuits.tick(t)` in
  `mansionTick`; first line of `setPower`: `if (circuits.setMains(on, by)) return;`; `camLive` uses
  `circuits.powered('cctv')`; the lift's `power: () => circuits.liftWorks()` and `broken`, `landed` in
  `createElevator`; `const circuits = createPower({...})` right after the lift; `updateActions`: the `pw…` actions to
  `circuits.act`; `onUse`: `circuits.use(p, t)` after the valves (`gas.use`), before the old uses; the switches:
  `if (sw && circuits.onSwitch(p, sw)) return;` after the door check; `handle()`: `pw…` messages; on connect
  `circuits.send(p)`.
- `public/js/main.js`: the import; `circuits.load(map)` in `loadMap`; the gadgets' `power: () => circuits.powered('cctv')`
  (the monitors); `const circuits = createPower({...})` and its handlers after the lift; `circuits.update(dt, now)` after
  the lift's; the hint: `if ((gh = circuits.hint())) hint = gh;` first in the block of the new features' E uses
  (before the valves' line); the progress line after the flood's.
- `public/js/roomlight.js`: a room with no light is BLACKOUT when `lights.power === false` **or its group is in
  `lights.dead`** (and it's a power room).
- `shared/maps/mansion.js`: the import of `POWER`; `power: POWER` on the map.
- `shared/maps/mansion2.js`: the import; `addPower({...})` before the fuse box's line.
- `lib/flood.js`: the electrocution's check is `deps.live()` when given (else the mains, as before).
- The lift (see "Every lift change" below): `lib/elevator.js`, `shared/elevator.js`, `public/js/elevator.js`.

### Protocol
- **No snapshot key** (`pw` is unused): the state changes only on events. Held actions show in the snapshot's `me` as
  `pwBreaker`, `pwGen`, `pwCut`.
- Server → browsers: `power { main, b: [5 × 1/0], g: [running, fuel s, gt ms], burst: [groups], cut }` on every change
  (and to whoever joins, and with each new round); `pwPop { g, p }` a bulb bursts; `pwSfx { s, p, … }`: `breaker` (`on`),
  `genstart`, `genstop`, `genout`, `grind` (`d`: seconds), `snap`, `crash` (`h`: the height), `caught`. The lamps in
  the usual `lights` / `world` / `welcome` messages, with `lights.dead`.
- Browser → server: `pwAim { a }` (`b0`..`b4`, `g`, `w`, or null) when it changes; E is the usual `use`. The server
  checks the player is within 2.4 m of the target and on its floor (±1 m).

### E key
In `onUse` (server) and the hint (main.js) alike: drone → off zip line / CCTV desk / car → revive → (the lift aimed at)
→ shield → uniform → the valves (floodgate, gas) → **power: aimed at a breaker, the generator or the lift's winch** →
the old uses (plant, hostages, defuse, mines, satchel, the fuse box, the zip line, the CCTV desk, doors, switches,
cars, drops). Only in the live phase and warmup (in freeze and at round end E goes on to the old uses).
Aiming (within 1.8 m, not through a wall) means looking at it: at the panel, the breaker whose column the crosshair is
on. So standing at the panel you can still use the fuse box next to it (look at the fuse box), and by the generator the
car (look at the car).

### Choices (the defaults; the user can change them)
- Terrorists switch breakers off, CTs on (like the fuse box). Breakers take 1 s.
- The generator feeds the two floors' lights (with the garage and the estate's lamps), not the cellar, the CCTV or
  the lift. CTs start it (3 s), Terrorists stop it (2 s). 90 s of fuel, full each round. It burns fuel whenever it runs.
- The surge: 25 % per lit bulb, at least one from three lit bulbs, a second after the power is back; only the rooms'
  ceiling lamps burst (not the lift's cabin light, not the estate's lamps); the CCTV and the lift have no bulbs.
- The flood's electrocution at the fuse box needs the **cellar's circuit** live (the cellar's breaker on, and the mains:
  the generator doesn't feed the cellar). It still blows the mains as before.
- The emergency brake: 1 in 3. Fall damage 18 per metre over 1.5 m. Crushed under the cabin: dead (no downed state).
- The machine room has no lighting room of its own (Mansion uses 22 of roomlight's 24): it's lit like outdoors.
- The roof is now reachable (by the terrace's ladder): the whole roof is walkable, as it always was in the level.
- The tunnels' lamps aren't on the house's power (they never were): the cellar's breaker darkens only the cellar.

### Every lift change (for the elevator's owner and the merge)
- `shared/elevator.js`: imports `fallAt` from `shared/power.js`; first line of `motionAt`: a motion with `fall` set is
  `fallAt(m, t)` (free fall, maybe caught by the brake after `tc` s; same `{ y, v, moving }`).
- `lib/elevator.js`: the state's `m` carries `fall`/`tc` (`elevState.m` = `[y0, y1, t0, tb, 1, tc]` while falling);
  `elevState.x` = out of order (`ctx.broken()`); `call()` says "Out of order — someone cut the lift's cable." when
  broken; `guard()` does nothing while falling (no braking for someone in the shaft: it's in free fall); `settle()`
  calls `ctx.landed({ y, t })` when a fall ends; a new method `fall(t, tc, land)` (from where it is: power off, no
  calls, doors frozen, the fall motion). Its `power()` is now `circuits.liftWorks()` (the lift's circuit and the cable).
- `public/js/elevator.js`: `motion()` passes `fall`/`tc`; a frame's ride may be up to 3 m while falling (0.5 otherwise);
  others drawn in the past are put in a falling cabin up to 8 m away (1 otherwise); the hints say "Out of order" on the
  buttons and "The lift is wrecked" stuck between floors.

## Links to wire at merge
- **The `powered()` API** (one function both sides): server `circuits.powered(circuit)` /
  `circuits.poweredAt(pos)` (lib/power.js, made in server.js); browser `circuits.powered(circuit)` /
  `circuits.poweredAt(pos)` (public/js/power.js, made in main.js). `poweredAt` takes the house's room a point is in
  (a point inside a wall belongs to the rooms either side; an upstairs wall is the upper floor's, not the stair
  hall's) and answers true where nothing is on the house's power. On maps without it both follow the blackout's
  `game.lights.power`.
  - **Group 2 (walls, live wires):** `lib/walls.js`'s `powerAt(pos)` ("THE power check … so group 3's circuits can
    replace it at merge") becomes `deps.poweredAt(pos)`, with `poweredAt: pos => circuits.poweredAt(pos)` in
    `createWalls`'s deps in server.js. Its cables (E1–E5 and the switches' risers) then follow their floor's breaker,
    the mains and the generator.
  - **Group 9 (sight):** which rooms are dark: `game.lights.dead` (groups without power: pitch dark) and
    `game.lights[g] === false` (switched off or a burst bulb) in the browser, or `circuits.poweredAt(pos)`. A room going
    dark or lit arrives as a `lights` message (`applyLights` in main.js): the moment to start "eyes adjusting".
  - **Group 10 (fire, fuel cans):** pouring a can into the generator: `circuits.refuel(seconds)` on the server (returns
    what went in, up to the 90 s tank; it doesn't start it). Its spot: `map.power.gen` (box) and `.exhaust`. A burning
    generator or garage could stop it (set nothing new: call the T's stop path, or add a `circuits.stopGen()`).
    The surge's bursts and the crash already call `sparkAt` (fire from sparks comes with group 10's own rules).
- **Group 4 (stealth):** the garage's car trunk and the generator are both by the car: the generator's E is aimed
  (look at it), so they don't clash; if the trunk's E comes before power's in `onUse`, nothing to do either.
- **Group 1 (wounds):** a downed player crushed or killed in the crash: `crushed` is in `BODY.outright` (pushed at load
  by lib/power.js; at merge it could go into shared/body.js's list).
- **Group 5 (underground):** nothing (its doc says the same).
- **The elevator:** see "Every lift change" above.
- **README/RESUME:** the README text above; RESUME's section 8 gets a paragraph from this file.

## Tests (dev/test-scripts/power/)
- `srv.sh [ENV=VAL…]` / `stop.sh`: the test server on GAME_PORT (default 4230, HTTPS 4231), Mansion, `BOTS=0`,
  `START_MONEY=16000`, fresh data in `$SP/testdata`; started detached, stop.sh stops whatever listens on that port.
  `waitsrv.mjs` waits for it.
- `unit.mjs` (node): circuits on both Mansion maps (and none elsewhere), `circuitAt` incl. walls, `live()` with the
  generator's fuel, `deadGroups`, `fallAt` against `motionAt` (smooth, free fall, caught within `caughtDrop()`),
  `crashDamage`, `aimAt` for each target, the geometry (the room over the shaft, solids), a walk with the game's physics
  up the terrace's ladder, over the roof and into the machine room, the zip line's stands and the CCTV chair untouched.
- `client-node.mjs` (node): the browser module: models, aim through walls, every hint for both teams, rebuilds,
  shaking, powered/poweredAt, all handlers, other maps.
- `lib.mjs` (node): lib/power.js with a stand-in server: the cut and the landing (riders, a teammate, hostages riding
  and under it, crushed, the spark), caught, refuel, the flood blowing the mains.
- `t1.mjs` (server, `POWER_SURGE=0 GEN_TANK=8 ROUND_TIME=600`; MAP=cs_mansion_night too): breakers (each circuit), the
  switch messages, team rules, a short press, the lift's breaker, the mains, the generator (start, stop, out of fuel,
  empty), switches remembered, the ground floor's breaker (the estate's lamps at night), a restart.
- `t2.mjs` (server, `POWER_SURGE=1 GAS_LEAK_X=6 ROUND_TIME=600`): the surge (timing, at the lamps, switched off ones,
  no bulbs on CCTV/lift, a bulb igniting the kitchen's gas, a restart); `SURGE_RANDOM=1` on a default server.
- `t3.mjs` (server, `ROUND_TIME=600 POWER_CATCH=0`, or `POWER_CATCH=1` with `CATCH=1`): the cut, the fall, the crash's
  damage, crushed, out of order, a restart, a teammate riding; caught and prying out.
- `t4.mjs` (server, `ROUND_TIME=600 POWER_SURGE=0 FREEZE_TIME=1`): the CCTV's breaker blinds the cameras; the flood with
  the cellar's breaker off (no shock), switching it on in the water (shock, the fuse blows); the generator doesn't
  feed the cellar.
- `maps.mjs` (server): every map loads; the power state only on the Mansion maps.
