# Elevator (lift in the Mansion)

## STATUS (2026-11-01: built, server-side tested, browser-tested on both Mansion maps; only the sounds by ear and a real-GPU ride left)

- **Done:** the whole spec, on both Mansion maps (`cs_mansion`, `cs_mansion_night`). The shaft is part of the level; the
  cabin, its sliding doors, the calls, the blackout, the roof hatch, prying the doors, riding (players, bots, hostages,
  dropped weapons, mines, satchels), crush safety and the round reset are on the server; the browser draws it, plays its
  sounds, rides it smoothly and shows the hints. `origin/main` (up to ed6374b) is merged in. Last code commit: see
  `git log feature/elevator`.
- **Half-done:** nothing.
- **Two differences from the brief:**
  - **No snapshot key.** `el` is already taken: it's the snapshot's elapsed round time (`el` in the snapshot head,
    read by `main.js` as `game.el`). The lift doesn't need one: its state only changes on events (a call, the doors,
    arriving, the blackout), so it goes out in an `elevState` message then, and both sides work the cabin's height out
    from the clock. Nothing was added to the snapshot.
  - **Climbing out of the shaft at a landing is an E action** (like the hatch): a climber on the shaft's ladder can't line
    up with the doorway (the ladder is on the west wall, the doorways in the south wall). Once a landing's doors are
    pried open, E (looking at them, from the roof or the ladder) puts you on that landing.
- **Tests that pass** (see RESUME notes for what each checks): `elevator/unit.mjs` (694 checks), `elevator/client-node.mjs`
  (the browser module run in node, 15 checks), `elevator/t-elev.mjs` (35 checks, on both Mansion maps),
  `mansion/walls.mjs` (0 missing, 0 drawn twice, with the shaft added), nav (same false drop links as before),
  `walk.mjs` walks round the shaft, 60 s with `BOTS=4`, all 7 maps start, a map change at runtime, and t5, t7, t8, t11,
  t16zip, t17cctv as before.
- **Browser-verified (2026-11-01, headless Edge + swiftshader, `g-elevator.mjs` on `cs_mansion` and `cs_mansion_night`,
  server with `START_MONEY=16000 BOTS=0 ROUND_TIME=600`; every screenshot looked at):** all its checks pass on both maps,
  no page errors.
  - The shaft in the living room (its steel doors, the call button's plate, the moved light switch on its east side),
    upstairs (built into the bookcase wall), the doorways' frames; the cabin inside (panel, lit button while queued, the
    hatch's frame, the ceiling light); the doors sliding open; the hatch shut and open from inside, the lid standing up
    on the roof (with its handle), the ladder in the shaft from the roof.
  - The ride: the height the page sends every frame is the cabin floor's within 1 mm all the way (22–24 frames of a
    4.5 s trip: headless Edge draws 1–2 frames a second, so "smooth at 60 fps" itself is a real-GPU check; the node test
    `client-node.mjs` covers uneven frame rates). Another player standing in the cabin is drawn with his feet on its
    floor, moving and stopped.
  - The blackout: the cabin dark (the flashlight lights it), stuck between floors with the "stuck in the dark" hint; out
    through the hatch, prying the upper landing's doors from the roof (hint, progress bar "Prying the lift's doors
    open..."), climbing out; the power back: on down to the cellar, ding, doors. With the power on: up through the hatch
    and back down it (E on the hatch from the roof).
  - Every hint on the way (call, panel buttons, hatch from inside and from the roof, pry, climb out).
- **Fixed in the browser pass:**
  - E aimed at the lift with a hostage near (the upper landing is by the hostages) showed the hostage's hint while the
    server gives E to the lift first: the lift's hint now comes first when aimed at it (`elevator.aiming()`, hook in
    `main.js`).
  - Standing on the cabin's roof, E on the hatch never worked (your eyes are 1.62 m over it, the reach 1.6 m): only
    crouching did. `aimAt` gives the hatch at your feet a longer reach (+0.6 m); two new `unit.mjs` checks (694).
  - The living room's light switch (on the shaft's east face) could be used from inside the cabin, its roof and the
    ladder, through the wall: not from inside the shaft any more (`elevator.walledIn`, hooks in both `nearestSwitch`).
  - The hatch was invisible from inside (the lid flush with the roof, the same grey): a light steel frame round it on
    the ceiling and a handle under the lid (in the existing meshes: no extra draw call).
  - Night map: the cabin was dark navy with the power on (its lighting room didn't glow while the rooms round it did),
    and the landing doors' inner panels showed stripes (their front face is exactly on the lift room's padded edge, so
    pixels flipped between the two rooms' light). `elevator` is now one of the night map's always-lit rooms (like the
    tunnels: its ceiling light is on with the power; the blackout still darkens it): warm cabin, no stripes.
  - `g-elevator.mjs` reworked so it runs at 1–2 fps (waits for each hint before pressing E), joins all scripted players
    before the game starts (a T joining restarted the round mid-test; a player joining a live round waits dead), checks
    the ride frame by frame against the cabin's motion, and visits the roof with the power on.
- **Draw cost** (`viewer.js`, `vcost.json` + five lift views, swiftshader, day map; the lift's models loaded into the
  viewer's scene for the last column): base (main ed6374b) → branch level (the shaft) → branch with the lift's models:
  the lift's views +3…+6 draw calls in all (living room 130→129→134, landing 126→126→131, upstairs 129→129→135,
  cellar 114→113→117, in the cabin 130→131→136), the other views +0…+5; triangles +0.3k…+2.6k for the shaft and +0.64k
  for the models; 3 more shader programs (the models' vertex-colour, instanced and basic materials); no lights, no
  shadows.
- **Left (by ear / on a real laptop):** the sounds (hum, ding, doors, brake, prying, hatch, click) and how far they carry;
  the ride and the view at a real frame rate on a real GPU.
- **Known limits (small, left alone):** a grenade or a Molotov's fire on the cabin's floor doesn't ride along (their
  flight is worked out when thrown); bullet holes on the cabin stay where they were made; a hostage riding is drawn a
  few centimetres off the floor (other players are corrected, hostages aren't); a satchel stuck to a door panel rides up
  and down but doesn't slide with the panel; a pried landing door with the cabin elsewhere leaves the shaft open (you
  can fall in: there's no fall damage outside the zip line). The living room's floor is 0.91 m to walk on while the floor
  you see is at 0.813 (the cellar's ceiling under it, from Mansion 2.0): the cabin's floor is the one you see, so you
  step 10 cm down into it. What E aims at goes to the server once a frame: looking at a button and pressing E within the
  same frame uses the last frame's aim (16 ms at 60 fps). Inside the cabin, its lighting is the darker of the lift's
  room and the room it's in (roomlight.js takes the minimum of overlapping rooms): with the living room's lights
  switched off, the cabin at the ground floor is dim too. The hostages' own E reach (3D, through walls, on main) lets a
  CT riding past the upper floor lead a hostage standing by the shaft.

## README (player-facing)

### The lift (Mansion)

A small lift links the wine cellar, the living room and the Terrorists' room upstairs. Its shaft stands in the living
room's north-west corner, by the doorway to the kitchen (upstairs, built into the bookcase wall). It's on both Mansion
maps.

- **Calling it:** look at the button beside the lift's doors and press **E**. The button lights up while it's on its way.
  When it arrives it rings, and the doors slide open.
- **Riding it:** inside, the panel is by the doors, on the wall to your right as you step in: look at a button (top:
  upper floor, middle: ground floor, bottom: cellar) and press **E**. The doors shut, and the lift goes at about walking pace (1 m/s; the
  ground floor to upstairs takes 4.5 s). You hear its motor hum. Dropped weapons, mines and satchel charges in it ride
  along too.
- **Doors:** they stay open a few seconds. Anyone standing in the doorway keeps them open. The lift only moves with
  every door shut.
- **Blackout:** if the Terrorists cut the power at the fuse box, the lift stops dead where it is, maybe between floors,
  in the dark. The buttons do nothing.
  - **Near a floor** (within about a metre): hold **E** looking at the doors to pry them open (3 s, loud: everyone near
    hears the grinding).
  - **Anywhere:** look up at the hatch in the ceiling and press **E** to climb out onto the cabin's roof. There's a ladder
    up the shaft. Look at a landing's doors and hold **E** to pry them open from inside the shaft, then press **E** again
    to climb out. E on the hatch from the roof drops you back in.
  - With the power off, a landing's doors can also be pried open from outside, but mind the empty shaft.
  - When the power comes back, open doors shut and the lift carries on to where it was going.
- **Safety:** the lift won't come down onto someone in the shaft below it, and won't go to the top floor with someone on
  its roof (there's no room). It brakes if that changes on the way.
- Explosions don't hurt it. A satchel charge stuck to it rides along until it goes off.
- Every round it starts on the ground floor with its doors shut, the hatch shut.
- Bots don't use it.

## RESUME notes

### Files (all new but the hooks)
- **`shared/maps/mansion_elevator.js`:** the shaft, called once from `remodel()` (`addElevator`); returns `map.elevator`
  (every number the lift uses). Also `moveSwitches` (called from `mansion.js`).
- **`shared/elevator.js`:** what both sides share. `ELEV` (speeds, times), `motionAt` (the cabin's height from its motion
  and the clock), `tripTime`, `doorAt`, `makeBoxes`/`placeCabin`/`placeDoor` (the moving boxes), `doorway` (whoever stands
  there holds the doors), `makeLadders`/`placeLadders`, `inCabin`/`onRoof`/`inShaft`, `roofSpot`/`cabinSpot`, `aimAt` (what
  E would do).
- **`lib/elevator.js`:** the server's part (`createElevator(ctx)`: `reset`, `tick`, `send`, `message`, `use`, `act`,
  `fixRider`, `stick`, `walledIn`).
- **`public/js/elevator.js`:** the browser's part (`createElevator(ctx)`: `load`, `onState`, `onSfx`, `onTo`, `local`,
  `remote`, `update`, `hint`, `aiming`, `walledIn`, `progress`).
- **Tests and tools** in `dev/test-scripts/elevator/`: `unit.mjs`, `client-node.mjs`, `t-elev.mjs`, `soak.mjs`,
  `g-elevator.mjs` (browser: run on both maps, see STATUS), `server.sh` (test server on 4090/4091, fresh data), the survey tools
  `slice.mjs`, `boxes.mjs`, `tops.mjs`, `faces.mjs`. `mansion/walls.mjs` checks the shaft too.

### Hooks in existing files (each line marked "elevator")
- **`shared/maps/mansion2.js`:** import; `const elevator = addElevator({...})` before the fuse box; `elevator` added to
  `remodel()`'s return.
- **`shared/maps/mansion.js`:** import; `moveSwitches(SWITCHES, RM.elevator)` (the living room's light switch was on the
  wall where the shaft is: now on the shaft's east side, x −19.64, z −4.49); `elevator: RM.elevator` on the map.
- **`shared/collision.js`:** `this.elev = []` (the moving boxes, set by the lift each tick/frame, with `elevBound`, the
  shaft's box); `elevNear()` puts them in `move()` and `bullet()` near the shaft; `nade()` and `raycast()` (every `what`,
  `'solid'` too, so mines lie on the cabin's floor and drops land on it) test them, behind one test of `elevBound`.
- **`server.js`:** import; `createElevator({...})` after CCTV (with the gas hook, below); `elevator.reset()` at the end of
  `resetWorld`; `elevator.tick(t)` in `mansionTick`; in `onUse` after leaving a car, `elevator.use(p, t)` (true only when
  the player aims at a lift button/door/hatch: it comes before the hostage and the old uses; when merging the E order,
  it belongs with "the old uses", after shield grab, revive, uniform and the floodgate valve); `updateActions`: the
  `'elevforce'` action (prying, any phase) goes to `elevator.act`; `handle()`: `elev…` messages to
  `elevator.message`; the `'state'` handler: `elevator.fixRider(pos)` before `p.p = pos`; on connect
  `elevator.send(p)`; `onSatchel`: `elevator.stick(s, hit, flight)` when it sticks; `nearestSwitch`: first line, no
  switch from inside the shaft (`elevator.walledIn`).
- **`shared/maps/mansion_night.js`:** `'elevator'` added to the theme's `glowRooms` (the cabin lit at night).
- **`public/js/main.js`:** import; `elevator.load(map)` in `loadMap`; `elevator.local(dt, now)` first thing in
  `updateLocal` (after the alive check: it runs for drivers and drone pilots too); `elevator.remote(s.p, rt)` after
  `sampleRemote`; `elevator.update(dt, now)` after `gadgets.update`; a hint line after the gadgets' hint, and one before
  the hostage's (aimed at the lift: `elevator.aiming()`, E goes to it first as on the server; when merging the E order,
  it moves with `elevator.use`); `nearestSwitch`: first line (`elevator.walledIn(me.p)`); a progress line
  after the gadgets' progress; the three message handlers; `createElevator({...})` after `createGadgets`.

### Protocol
- **Server → browsers:**
  - `elevState { m: [y0, y1, t0, tb], d: [[o, dir, t, dur] × 4], h, q, p, rm, rs }`, on every change and to whoever
    joins. `m` is the motion, `d` the door sets (0 the cabin's, 1 + s the landing's at stop s), `h` the hatch open, `q` the
    calls (the current trip first), `p` the power, `rm`/`rs` the ids of the mines/satchels riding it. Times are the
    server's clock (ms), as `serverNow()`.
  - `elevSfx { s, p }`: a sound at a spot: `ding`, `doors`, `brake`, `pry`, `forced`, `hatch`; `click` only to the presser.
  - `elevTo { p, c }`: where the server put you (out of the hatch: crouching; back down it; out of the shaft).
- **Browser → server:** `elevAim { a }`, what E would do now (from `aimAt`), sent when it changes (or null). `a`:
  `c0..c2` a landing's call button (with the power off, aiming at that landing's doors gives `l0..l2`); `b0..b2` the
  cabin's buttons; `h` the hatch; `f` the cabin's doors; `l0..l2` a landing's doors from inside the shaft. E itself is the
  usual `use`; the server checks the target against where the player is.
- **No snapshot key** (see STATUS). Prying is a `p.act` of type `'elevforce'`, so it shows in the snapshot's `me` like the
  other held actions.

### Coordinates and numbers
- **Shaft:** inside x −21.45…−19.80, z −5.34…−3.60; outside (walls 0.15) x −21.6…−19.65, z −5.49…−3.45. Pit floor −3.4,
  top 6.706 (the upper floor's ceiling). Walls `keep` (never break). Lighting room `elevator` (power: the blackout darkens
  it): Mansion now uses 22 of the 24 rooms.
- **Stops:** −2.2 (cellar), 0.813 (living room), 4.267 (Ts' room); the floors you see (the BSP's 0.8128 and 4.2672).
  Doorways in the south wall, x −21.015…−20.115, 2.05 high, steel frames.
- **Cabin:** outside x −21.28…−19.85, z −5.29…−3.62; walls 0.05, inside 2.2 high, roof 0.08, floor 0.1. Hatch
  x −20.70…−19.95, z −5.15…−4.40. Panel on the inside of the east wall at x −19.895, z −3.98, buttons 1.0 / 1.15 / 1.3 m
  up (cellar, ground, upper). Call buttons at (−19.86, stop + 1.1, −3.445).
- **Ladder:** drawn on the shaft's west wall (x −21.45, z −4.25…−3.65) from the pit to 6.6; climbable only below the
  cabin and above its roof (two ladders the browser keeps in `map.ladders`; the server and the bots' nav never see them).
- **Motion:** 1 m/s, 1 m/s² up and down; emergency brake 2.5 m/s² (0.4 s, 0.2 m from full speed). Doors 1 s (pried:
  1.6 s), open 3 s (1.5 s when a call is waiting), prying 3 s within 0.9 m of a floor. Headroom kept above someone on
  the roof 0.95 m (so the top floor is out of reach then: the cabin goes no higher than 3.48). A blocked trip is dropped
  after 10 s. A bot stuck in the shaft 10 s is put on the nearest landing.
- **Cellar:** the three barrels that stood in the shaft's place: one is now just east of the shaft (−19.3, −4.9), two on
  the stack by the stairs (−16.2, −2.2) and (−16.85, −3.25). With the one by the shaft, the bots' grid keeps exactly the
  same false drop links as before (157, same set).

### Contracts with the other branches
- **Gas (motor spark):** `server.js`, in `createElevator({... motorStart: (pos, by) => {} })`, marked
  "elevator → gas". It's called every time the motor starts, with a point over the cabin's roof and the player whose
  call started it (or null). Once the gas system is merged: `motorStart: (pos, by) => sparkAt(pos, 'motor', by)`.
- **Flood (`FLOOD_AREAS` in `shared/flood.js`):** the shaft's footprint is x −21.6…−19.65, z −5.49…−3.45 (outside of its
  walls; inside x −21.45…−19.80, z −5.34…−3.60), its bottom (the pit's floor) −3.4, 1.2 m below the cellar's floor (−2.2).
  The cellar's doorway is in the south wall at x −21.015…−20.115, so cellar water would pour into the pit there.
- **Other features' player fields:** riding uses positions only, so downed, playing-dead, bleeding, disguised players
  and a T with a shield all ride like anyone. `elevator.use` already ignores players with `p.downed` or `p.playingDead`
  (fields from the body branch; undefined here).
- **Keys:** only E.

### What was verified (server side, 2026-10-31)
- **`unit.mjs`:** trips between every pair of stops end exactly on the stop, are smooth (never over 1 m/s, never back),
  the ground floor to upstairs takes the distance + 1 s; the brake at 200 random moments stops within v²/2B, within 0.4 s,
  on the way; the doors' timing; riding with the game's `movePlayer` the way the browser does it (standing, uneven
  frames of 5–50 ms, walking about, jumping, braked half way, on the roof as far as it goes with someone up there): on
  the floor all the way, never out of the cabin, never through the floor or the ceiling; the hatch's spot on the roof is
  free and off the ladder; walking in and out at each stop with the doors open; the shut doors hold you in and keep you
  out, also with the cabin elsewhere; up the ladder from the roof until the upper landing is in reach; no ladder inside
  the cabin; aiming at each button, the hatch, the doors, the call buttons, a landing's doors in a blackout; the doors'
  light curtain.
- **`client-node.mjs`:** the browser module in node: the models built (4 scene objects), its boxes and ladders in place,
  loading again adds nothing twice; looking at the call button: `elevAim c1` and the hint; riding up at uneven frame rates:
  exactly on the cabin's floor every frame, the view along, the hum on while moving and off after; braked between floors
  in the blackout: still on its floor, the "stuck in the dark" hint; looking up: the hatch; `elevTo`: on the roof
  crouching; a remote rider drawn 100 ms late is put on the cabin's floor; another map: the models gone.
- **`t-elev.mjs`** (both maps): starts on the ground floor, shut; the call opens both door sets; inside, a button queues
  it, the doors shut and it sets off (2.6 s), half way after 2 s, upstairs in 4.4 s, a ding and the doors open; the
  snapshot shows the rider going up with it (within 1 cm); someone in the doorway keeps the doors open 6.5 s, stepping in
  they shut; a T cuts the power on the way down: it brakes (screech) between floors; no buttons; the doors can't be pried
  that far from a floor; the hatch puts him on the roof; prying the upper landing's doors from the roof (sound, progress
  bar), they give, E climbs out upstairs; the CT brings the power back: the pried doors shut, it goes on to the cellar and
  opens; a pistol thrown in, a mine laid in it and a satchel stuck to its wall ride to the ground floor (the mine and the
  satchel listed as riding); the satchel goes off in it and the lift still answers calls; someone on the ladder below
  it: it won't go down, once he's out it does; someone on its roof: it won't go up to the top floor, once he's off it does;
  a restart puts it back (ground floor, shut, hatch shut, no calls). No server errors.
- **Others:** `walls.mjs` 0/0 (the shaft inside from the pit to the top, the outside in the three rooms, the north side in
  the kitchen and the corridor, the doorways' frames and sills); nav 30,403 nodes (30,426 before), the 157 false drop links
  exactly as before; `walk.mjs` from the kitchen through the doorway into the living room, along the shaft's south face, the
  nook behind it, the T spawn to the hostage's corner upstairs, the corridor upstairs, the cellar's stair foot to the fuse
  box; 60 s with `BOTS=4` while the lift made trips: no errors, no bot ever in the shaft, tick 1.2–3.1 ms (the base,
  side by side: 1.3–2.7); all 7 maps start and take a player (the lift's state only on the two Mansion maps); a map
  change to Dust II and back to the night Mansion; t5, t7, t8, t11, t16zip (14), t17cctv (17) as before; Mansion's build
  time unchanged (~300 ms in node, side by side with the base).
