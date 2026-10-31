# Feature: a real gas system (agent "gas", branch `feature/gas`)

## STATUS
- **Done:** everything in the spec. Server: pipes, leak, spread, venting, choking, all sparks (shot, impact, grenades,
  explosions, fire, light switch, fuse box), blast, chain, valve, repair. Browser module: pipe models, vapour, shimmer,
  hiss, coughing, HUD line, blast effects. Hooks, protocol and these notes are written.
- **Half-done:** nothing on the server. The browser side has only been checked in Node with a stubbed page. One early
  screenshot of the pipe looked right, then browser tests were stopped.
- **Next steps:** run the browser checks below (`dev/test-scripts/gas/g_gas.mjs` with the test server on `GAS_LEAK_X=3`);
  if the shimmer is too strong or too faint, tune the opacity in `public/js/gas.js` (`update()`, `0.035 + 0.1 * k`).
  For the elevator: `gas.sparkAt(motorPos, 'motor', player)`.
- **Tests that exist** (all pass): `t_gas.mjs` (server, 6 parts), `graph.mjs` (no server), `client_smoke.mjs` (browser
  module in Node), `maps.mjs` (all 7 maps), `botgas.mjs` (BOTS=4); the old `mansion/t5.mjs` and `t7.mjs` still pass.
- **Browser checks still to do:** pipe, vapour, shimmer (subtle, not fog; day, night, blackout), blast and HUD line by
  eye; sounds by ear; no page errors on both Mansion maps through a leak, a blast and a round reset; frame cost with gas
  in view; a real mouse click on the meter.

## (a) README

Text for the README's Mansion section (cs_mansion and cs_mansion_night), after the blackout:

  - **Gas**: a yellow **gas pipe with a meter** runs up the kitchen's north wall (the one the garage is behind), and
    a **boiler** stands against the cellar's east wall with its own pipe and meter. **Shoot a pipe** and it's holed:
    gas hisses out of it and fills the room, then spreads to the rooms next door through whatever is open between
    them — doorways, open doors, doors blown off, broken windows, holes blown in the walls. A closed door holds it
    back; open doors, windows and holes to the outside let it out (the wind takes it), so opening up a room clears it.
    - **You smell gas** (the HUD says so) where there's some; thicker, the room shimmers faintly; thick enough and
      you **choke**: you cough and lose a few HP a second.
    - **Any spark sets it off** once there's enough of it (the HUD warns you: *"One spark and it goes up!"*): a
      gunshot in the room or into it (the muzzle flash, or where the bullet hits), a grenade (HE, flashbang,
      Molotov), any explosion, a fire, **someone flipping a light switch**, or **the fuse box's lever** in the
      cellar. The more gas and the bigger the room, the bigger the blast: everyone in the room is hurt (more the
      thicker the gas; armour doesn't help), people near it in sight too; it breaks the room's walls and furniture,
      blows its doors off and its windows out, and leaves it burning for a moment. The rooms next to it with enough
      gas go off right after, one after the other. A kill by the blast counts for whoever made the spark.
    - **The valve**: hold **E** for 2 seconds at the red lever under a leaking meter to shut the gas off. What's in
      the air stays until it's vented (or set off).
    - The pipes are mended and the air is clean at the start of each round (with no rounds — warmup, Deathmatch,
      Gun Game — a holed pipe is mended after a minute).
    - Rough times: a holed kitchen pipe makes the kitchen (doorways open, doors and windows shut) explosive in about
      25 seconds, and choking after a little over a minute; with the back door open it takes about 40 seconds; with
      the back door and both windows open it never gets there.

For the file list at the end of the README:

    shared/gas.js           The gas system's numbers (leak, spread, thresholds) and helpers, server and browser
    shared/maps/mansion_gas.js Mansion's gas pipes and boiler (called from mansion2.js)
    lib/gas.js              The gas on the server: rooms and openings, leaks, spreading, choking, sparks, blasts
    public/js/gas.js        The gas in the browser: the pipes, the vapour and shimmer, the hiss, coughing, the blast

## (b) RESUME notes

### Files
- `shared/gas.js`: `GAS` (all numbers: `step` 0.25 s, `leak` 3 m³/s, `spread` 0.35, `vent` 2.0, `seep`, thresholds
  `smell` 0.03, `haze` 0.06, `ignite` 0.2, `rich` 0.65 (strongest blast), `choke` 0.4, `chokeDps` [3, 11], `valve` 2 s,
  `reach` 1.3 m, `mend` 60 s, `Q` 250), `PIPE` states (0 ok, 1 leaking, 2 shut at the valve, 3 wrecked),
  `gasRoomAt(rooms, p)`, `gasPipes(map)`.
- `shared/maps/mansion_gas.js`: `addGasPipes({ decor, solids })`, called once from `remodel()`. Pushes two
  `{ type: 'gaspipe' }` decor entries (world.js's `buildDecor` ignores unknown decor types, so nothing else draws
  them): `parts` (what the browser draws), `hits` (bullet hit boxes, a little fatter than the pipe), `leak` (default
  leak point), `valve`. The boiler is also a solid (`[cx-R, -2.2, cz-R, -13.31, -0.7, cz+R]`; under 0.86 m so never
  breakable).
  - Kitchen: x −16.6 on the inside of the north wall (z −14.02): pipe from the floor (0.81) to a meter at 1.27–1.73,
    up to 3.86, then east under the ceiling into the corner (x −13.33); valve at (−16.6, 1.06, −13.95).
  - Cellar: boiler centre (−13.72, 1.6), r 0.36, 1.5 m tall, flue to the ceiling; the gas pipe down the east wall at
    z 2.15 through a meter (y −0.45…0) to the boiler; valve at (−13.38, −0.85, 2.15).
- `lib/gas.js`: `createGas(api)` → `{ reset, tick, snap, onShot, sparkAt, use, valve, debug, rupture }`.
  - **Rooms** are `map.rooms` (the lighting volumes, 21 on Mansion), volume = box volume.
  - **Openings** are found once per map object (WeakMap cache; ~150–180 ms at server start / map change, only on
    `mansion2` maps): for every two rooms whose boxes touch along an axis (gap −0.3…0.7 m, overlap > 0.2 m), and for
    every side and the top of each room towards no other room (= outside), the shared face is sampled every 0.25 m
    with a short axis-aligned segment across it (±0.45–0.6 m). A segment crossed by a static solid is never open; one
    crossed only by breakable pieces / glass / closed door leaves is open once all of those are broken / shattered /
    open-or-blown. Samples are grouped by what crosses them → per link `fixed` area + `gated` openings. Grates don't
    block. `GAS_DEBUG=1` prints the links at build (e.g. kitchen–living room 5.3 m² open; kitchen–garage gated by door
    7 and glass 16; kitchen–outside by door 2 and glass 0; cellar–kitchen 7.5 m² through the stair hole).
  - **Step** (every 0.25 s, only while a pipe is holed or there's gas): leak into the pipe's room
    (`GAS.leak × GAS_LEAK_X`), flow per link `spread × openArea × Δc` (outside: `vent × area × c`), clamped to stay
    stable, `seep` everywhere. Fires in a room over `ignite` set it off. Once a second: choking (`applyDamage(q, null,
    dps, 'chest', 'gas', 1)`) and a `gasCough` broadcast every ~2 s per choking player.
  - **Blast** (`explode(i, by, kind)`): s = (c − ignite)/(rich − ignite), E = c × volume. Damage `45 + 125·s` inside
    (pen 1: armour doesn't help, part 'he'), outside within `1.5 + 0.55·√E` m with line of sight from inside the room
    `× 0.75 × (1 − d/R)`; attacker = the sparker unless it's the victim or a teammate (then world damage, no
    penalty). Knock-back (`knock`), hostages (`hurtHostage`), cars in the room (`damageCar`), pieces touching the room
    (+0.5 m) take `(90 + 270·s) × (0.6…1.4)` (furniture ×1.4, roofs ×0.6) via `hurtPiece`/`breakPieces`, doors whose
    centre is in the room (+0.7) blown, glass in it broken, 1–3 fires (`game.fires`, `w: 'gas'`), bot smoke. Pipes in
    the room → wrecked. Neighbours through open links: over `ignite` → queued to go off 180–300 ms later (`chain`),
    under it → halved.
  - A blast within 2.5 m of a pipe (in sight) tears it open; a pipe whose wall pieces are all gone is torn open.
- `public/js/gas.js`: `createGasClient(ctx)` → `{ setMap, snapshot, handlers, update, hint, debug }`. Pipes: one
  merged mesh per material per pipe (plain Lambert, so the room lighting / blackout applies and no new shader is
  compiled): kitchen 4 draw calls, cellar 6, only when in view. Shimmer: 3–7 soft sprites per room over `haze`
  (1.8–2.7 m, opacity 0.03–0.14, scaled by the room's light via `ambientAt`, so it's nearly invisible in the dark),
  plus the vapour jet at a leak — all in one `Billboards` instance (one draw call, same shader as the effects' boards,
  hidden when empty; the billboard shader already fades what's right in front of the camera). Sounds are built on the
  game's audio context (`audio.out(pos).context`): a looping hiss per leaking pipe, a burst on rupture, coughing. The
  HUD line is its own `#gas-msg` div (top 57%). `gasBoom`: 2–6 `fx.explosion`s through the room, flash light,
  c4/rpg boom (muffled through walls), `realBlast` soot/dust, shake, shell shock within 14 m.

### Hooks in existing files (each marked `// gas`)
- `server.js`: import; `const gas = createGas({...})` after `notify`; `resetWorld()` → `gas.reset()`; `blastMap()` →
  `gas.sparkAt(at, weapon)` (satchel, C4, car, mines, drone; no owner); `explodeRocket()` → `gas.sparkAt(at, weapon,
  owner)` (RPG, RPG-26, mortar; before blastMap so the shooter gets the credit); `explodeNade()` → `gas.sparkAt(o, n.k,
  owner)` for he/flash/molotov; `onUse()` light switch → `gas.sparkAt(sw.p, 'switch', p)` (only when it really
  toggles — not with the power off); `onUse()` → `if (gas.use(p, t)) return;` before the fuse box; `setPower()` →
  `gas.sparkAt(MAP.fusebox.p, 'fusebox', by)`; `updateActions()` → `gasValve` act handled first; `onShoot()` →
  `gas.onShot(p, o, traces, def)` after the bullet loop; `tick()` → `gas.tick(t)` after `updateFires`; snapshot head
  → `...gas.snap()`.
- `public/js/main.js`: import; `const gas = createGasClient({...})` after `game`; `loadMap()` → `gas.setMap(map)`;
  `s()` → `gas.snapshot(m.gs)`; `Object.assign(net.handlers, gas.handlers)` after `new Net`; `frame()` →
  `gas.update(dt, now)`; the E-hint chain → `gas.hint()`; progress label for `gasValve`.
- `shared/maps/mansion2.js`: import + one call `addGasPipes({ decor, solids })` before the fuse box line.

### Protocol
- Snapshot key `gs` (only while a pipe isn't intact or there's any gas): `{ p: [pipe state, ...], r: [roomIndex,
  conc 1..250, ...] }` (room index into `map.rooms`).
- `gasLeak { i, s, p }` (pipe i's new state; p where it leaks), `gasBoom { i, p, s, e, k }` (room i went off;
  s 0..1 strength, e gas m³, k the spark kind), `gasCough { id, p }`. Fires use the existing `fire`/`fireOut`.
- Player act `gasValve` (shows in `me.a`).

### Contract
- **Owned:** `gas.sparkAt(pos, kind, by = null)` in server.js (returns true when it set gas off). Kinds used: 'shot',
  'impact', 'switch', 'fusebox', 'fire', 'chain', weapon ids. Kinds 'shot', 'impact', 'switch', 'fusebox', 'fire',
  'flash', 'motor' never tear a pipe open; any other kind (a blast) within 2.5 m does. For the elevator motor:
  `gas.sparkAt(motorPos, 'motor', player)` when it starts/stops.
- **Read:** `game.lights.power` isn't read (the fuse box hook is in `setPower`). `game.fires`, `game.hostages`,
  `world.gone/broken/doorStates/cars`, `game.round`, `game.nextNadeId`.
- Not touched: `p.downed`, `p.playingDead`, `p.bleeding`, `p.disguise`, `p.shield`, water.

### Verified (server side; Node)
- `dev/test-scripts/gas/graph.mjs` (no server): graph build time and links; the kitchen leak with everything closed /
  back door open / back door + both windows / the valve shut at 40 s; the cellar leak.
- `dev/test-scripts/gas/t_gas.mjs` (test server on 4030, `GAS_LEAK_X=3 ROUND_TIME=300 START_MONEY=16000`, a T and a
  CT over WebSocket; PARTS=1,2,… to run some): a pistol shot holes the meter; the kitchen fills while the garage behind
  the closed side door stays clean, then gets gas once it's opened; the valve shuts the leak; the back door + garage
  door vent faster than the closed room; a new round has no `gs` (repaired); choking (damage + coughs); a CT's shot
  sets it off (gasBoom, pieces broken, doors 2 and 7 blown, fire, gas gone, pipe wrecked); the kitchen light switch
  sets it off; the fuse box lever sets the cellar off; a chain kitchen → cellar; an HE sets it off. (Found on the way:
  shooting a window out of a gassy kitchen sets it off — the muzzle flash.)
- `dev/test-scripts/gas/client_smoke.mjs` (`node --import ./dev/test-scripts/gas/register.mjs …`): the browser module
  in Node with a stubbed page: pipes build on both Mansion maps (4 + 6 meshes), leak → sparks, vapour, shimmer,
  HUD lines at the three levels, valve hint, shut, blast effects, wrecked pipe hidden, round reset, other maps empty.
- `t_gas.mjs` parts 2 and 4 also pass on a server started with `MAP=cs_mansion_night`.
- `dev/test-scripts/gas/maps.mjs`: the admin switches through all 7 maps with a player on, a shot on each: every map
  loads, no `gs` anywhere, no server errors.
- `dev/test-scripts/gas/botgas.mjs` on a `BOTS=4 DEBUG_TICK=1` server (normal leak rate): both pipes holed, 75 s with 4
  bots a side playing while the gas spread (kitchen 0.48, cellar 0.45 at the end): no server errors, tick 0.5–2.1 ms
  on average (max 7.8 ms).
- The old Mansion tests `mansion/t5.mjs` (the back door creaks open, closes, is shot out) and `mansion/t7.mjs` (the
  blackout: cut, dead switch, restored) still pass on this branch.
- Graph build: 144–180 ms per Mansion map object (once, at start-up / map change).

### Not verified (browser checks still to do)
- How it looks: the pipe and meter (one early screenshot looked right: yellow pipe, grey meter with "GAS" dial, red
  lever), the vapour jet, the shimmer's strength (must be subtle, not fog) by day, at night and in a blackout, the
  room-filling blast, the HUD line's position.
- The sounds by ear (hiss, rupture burst, coughing, the blast muffled through walls).
- No page errors on cs_mansion and cs_mansion_night with gas, a blast, a round reset; frame cost with gas in view.
- The real click on the meter (the scripted-client shots work; the first headless click didn't fire before the
  browser tests were stopped).

### Known gaps / choices
- Gas set off by a satchel, C4, mine, car or drone blast credits nobody (the blastMap hook has no owner); grenades,
  rockets and mortar shells credit the thrower/shooter.
- The rooms are boxes: the gas is even in a whole room box (the kitchen box includes the old closet), and spaces in no
  room box (wall gaps, the attic) count as outside. Gas doesn't rise or sink.
- A few "openings" run along inside a wall between storeys (only open once wall pieces on both floors are gone).
- The pipe doesn't block bullets; a holed pipe is drawn whole (the vapour shows the hole).
- Bots ignore gas (they shoot in it and can set it off or hole a pipe; they take the damage).
