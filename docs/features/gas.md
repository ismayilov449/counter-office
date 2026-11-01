# Feature: a real gas system (agent "gas", branch `feature/gas`)

## STATUS
- **Done:** everything in the spec. Server: pipes, leak, spread, venting, choking, all sparks (shot, impact, grenades,
  explosions, fire, light switch, fuse box), blast, chain, valve, repair. Browser module: pipe models, vapour, shimmer,
  hiss, coughing, HUD line, blast effects. Hooks, protocol and these notes are written.
- **Browser-verified** (headless Edge, swiftshader, on cs_mansion and cs_mansion_night, 2026-11-01): `g_gas.mjs` and
  the new `g_gas2.mjs` pass on both maps with **no page errors** through leaks, three kinds of blast and round resets.
  Every screenshot was looked at: the kitchen pipe, meter and lever, the cellar boiler and its pipe; a **real mouse
  click** on each meter fires a shot that holes the pipe; the vapour jet; the valve hint; the HUD lines at all three
  levels ("You smell gas", "… One spark and it goes up!", "The gas is choking you — get out!"); gas getting into the
  garage once its side door is opened; the light switch (flipped by the CT) and the fuse box lever (cellar, it also
  blacks the house out) setting it off; a shot from the living room setting off a full kitchen (the room fills with
  flame, the wall to the living room is holed, fires and soot after); the pipe wrecked and hidden after its room went
  off; a new round: pipes whole, no shimmer, no HUD line. The blast scales with the gas (strength → pieces broken, seen
  in the runs): 0.46 → 254, 0.58–0.65 → 414–456, 0.72–0.83 → 442–583; 0.33 in the cellar → a cellar of flame.
- **Fixes from the browser run:**
  - The **shimmer was invisible** (pale sprites at 0.03–0.14 opacity vanish on the cream walls, even when choking):
    now a yellow-green tinge, opacity `0.08 + 0.46 * k`, sprites 2.5–3.8 m. Checked with the gas forced to fixed
    levels: hardly there at 'ignite', a faint veil (never fog) when choking; with the kitchen light off and in a
    blackout it's nearly invisible (its colour follows the room's light).
  - The **vapour jet** was only a faint smudge: opacity 0.3 → 0.55, grows a little more, and now dims with the room's
    light like the shimmer (no white glow in a dark room).
  - `g_gas.mjs` put the player inside the living room's floor (y 0.81; the floor there is 0.91): the blast's push then
    threw them sideways out through the west wall (`movePlayer` resolves an overlap by moving to the box's edge). Not
    a game bug (a walking player stands at 0.91); the test now uses 0.91.
- **Draw calls** (counted in the live game, the same frames with the gas module's things shown, then hidden): the
  kitchen pipe costs **4** in view, the shimmer + vapour **1 more** (21 sprites, 15 puffs in one instanced call); a
  kitchen view: 191 → 192 by day, 201 → 202 at night. Real-laptop frame time not measured.
- **Tests that exist** (all pass, re-run 2026-11-01 unless noted): `g_gas.mjs` and `g_gas2.mjs` (browser),
  `t_gas.mjs` (server, 6 parts), `graph.mjs` (no server), `client_smoke.mjs` (browser module in Node), `maps.mjs` (all 7
  maps); not re-run: `botgas.mjs` (BOTS=4), the old `mansion/t5.mjs` and `t7.mjs`.
- **What's left:** the sounds by ear (hiss, rupture burst, coughing, the blast muffled through walls); the frame time
  on a real laptop (swiftshader draws ~2–3 fps here, so no timing). Seen but not gas's: right after a round reset some
  smoke from the last round's fires still hangs under the kitchen ceiling for a moment (effects aren't cleared at a
  round start). For the elevator: `gas.sparkAt(motorPos, 'motor', player)`.
- **How to run the browser tests:** test server with `BOTS=0 ROUND_TIME=600 GAS_LEAK_X=3` (the server has bots on by
  default; they kill the tester), one headless Edge with `--disable-extensions --disable-sync` and a fresh profile (a
  synced profile installs extensions that inject pages and errors), then `GAME_PORT=… CDP_PORT=… node
  dev/test-scripts/gas/g_gas.mjs` and `g_gas2.mjs` (`NIGHT=1` names the shots on cs_mansion_night). `g_gas2.mjs` reads
  the gas client's state through a conditional breakpoint in `gas.js` that never pauses.

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
  compiled): kitchen 4 draw calls, cellar 6, only when in view. Shimmer: 3–7 soft yellow-green sprites per room over
  `haze` (2.5–3.8 m, opacity 0.08–0.54, scaled by the room's light via `ambientAt`, so it's nearly invisible in the
  dark), plus the vapour jet at a leak (also dimmed by the room's light) — all in one `Billboards` instance (one draw call, same shader as the effects' boards,
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

### Verified in the browser
- See STATUS: `g_gas.mjs` and `g_gas2.mjs` on both Mansion maps (looks, real clicks, HUD lines, the three sparks,
  round reset, no page errors, draw calls).

### Not verified
- The sounds by ear (hiss, rupture burst, coughing, the blast muffled through walls).
- The frame time on a real laptop.

### Known gaps / choices
- Gas set off by a satchel, C4, mine, car or drone blast credits nobody (the blastMap hook has no owner); grenades,
  rockets and mortar shells credit the thrower/shooter.
- The rooms are boxes: the gas is even in a whole room box (the kitchen box includes the old closet), and spaces in no
  room box (wall gaps, the attic) count as outside. Gas doesn't rise or sink.
- A few "openings" run along inside a wall between storeys (only open once wall pieces on both floors are gone).
- The pipe doesn't block bullets; a holed pipe is drawn whole (the vapour shows the hole).
- Bots ignore gas (they shoot in it and can set it off or hole a pipe; they take the damage).
