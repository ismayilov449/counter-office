# The mansion's cat

## STATUS
- **Done:** the server AI (`lib/cat.js`), the browser model, animation and sounds (`public/js/cat.js`), the shared
  numbers (`shared/cat.js`), and every hook in `server.js` and `main.js`. `main` (zip line, CCTV) is merged in. The
  server-side tests pass:
  - `sim.mjs`: 60 minutes of wandering, doors open and doors shut. No tick off a floor, outside the map or inside a
    wall. All 14 spots are reached (doors open). It never stood still with a path.
  - `ai.mjs`: 38 checks, 40 runs in a row.
  - `t1.mjs`: live server, 32 checks.
  - `clientsmoke.mjs`: 34 checks (now with no paw through the floor and planted paws at the walk and trot).
  - `soak.mjs`: 60 s with `BOTS=4`, no server errors; ticks about 1 ms on average.
  - `maps.mjs`: all 7 maps start.
  - Re-run after the browser fixes: `sim.mjs` (20 min on `cs_mansion`, 10 on `cs_mansion_night`: 0 bad ticks),
    `ai.mjs`, `clientsmoke.mjs`, `t1.mjs` (`WANDER=40`) and `maps.mjs` all pass, with 0 server errors.
- **Browser-verified (headless Edge, swiftshader, both Mansion maps; `catview.mjs` and `g1.mjs`):**
  - **`catview.mjs` (posed cats):** every pose reads clearly. The size next to the sofa is right (a sitting cat's
    head is about at seat height). The tail curls when it sits and loafs. The loaf on the sofa seat, the sleep in the
    basket and the bowl in the kitchen look right. At night the eyes are two small yellow-green dots, they glow in
    the dark living room, and they are shut when it sleeps. No page errors.
  - **`g1.mjs` (the real game), all 30 checks pass on `cs_mansion`:**
    - asleep in its basket at round start;
    - it follows a player who stands still by it ("mrrp"), sits at his feet looking up, and walks after him;
    - a team mate's PMN under it goes off: thrown (screech), it lands on a floor, runs, hides, never dies;
    - a shot into the air makes it hiss and bolt;
    - a bullet throws it, unhurt;
    - it goes up to a crouched player in ghillie camo and meows;
    - left alone it wanders (28 to 65 m in 90 s over the runs), up onto the sofa and the kitchen window sill,
      0 snapshots off a floor;
    - no page errors.
  - **`g1.mjs` on `cs_mansion_night`:** all the same checks pass (the follow and the mine in the cellar). With the
    living room's lights switched off, the awake cat's eyes glow, two yellow dots looking up from the basket, and a
    small dot from across the room. Up on the sofa, not cutting its edge. No page errors.
  - **Fixes from the browser checks** (`public/js/cat.js`):
    - **Foot sliding:** the old walk and trot swung the legs as pendulums that never lifted, with a stride that
      didn't match the swing. The paws slid about 34 cm a step cycle, and in the game the 9/s blend damped the
      swing to a third or a half of that. Now a paw that is down stays put (an IK leg, see the animation below),
      and it comes forward lifted: 1.4 cm of slide a cycle at the walk and trot, 3.5 cm at the gallop
      (`clientsmoke.mjs` checks it).
    - **Paws through the floor:** the gallop sank them up to 3 cm mid-stride and the stretch 6.6 cm. `pawLift`
      keeps every paw at or above the floor, and the stretch is now a play bow with the front paws flat.
    - **Blending:** a new state crossfades in from the pose it had (0.3 s), then follows its target exactly. The
      old per-frame lerp damped every quick movement (steps, licking, trembling).
    - **Draw calls:** the eyes are frustum-culled (they used to cost a call at night even off screen). Its shadow
      is only drawn within 12 m of the camera, like the players' 30 m rule, since a room lamp's cube shadow draws
      it up to 6 times.
    - **Tests:** `catview.mjs`'s basket view looked past the basket. `g1.mjs` now goes to the cat wherever it is,
      lays the mine only under a sitting cat, keeps the watching player beyond following range, keeps the shooter
      and Tom out of the picture, and adds the mine, bullet, camo and wander steps, the perch pictures and the draw
      calls. `clientsmoke.mjs` now checks the floor and the planted paws.
  - **Draw cost against `main`** (the in-game WebGL draws per frame, with the cat, basket and bowl switched off by
    layer: that is everything this branch adds to a frame):
    - +2.5 looking at the basket with the cat in it (the cat, the basket, part of the bowl);
    - +0 looking away while the cat is in its basket;
    - +13.7 looking away while the cat walks under the living room's shadow-casting lamp right behind the camera
      (its shadow in the lamps' cube shadow maps; the 12 m rule doesn't help this close);
    - night: +3.3 looking at the basket, +0.3 and +0.7 looking away (the eyes no longer cost a call off screen).
- **What's left:**
  - **By ear, in a real browser:** the meow, mrrp, screech and hiss, and the purr right next to it (volume, and that
    the sounds come from where the cat is).
  - **Watching the walk in motion on a real GPU:** swiftshader runs at a few frames a second, so the planted paws
    were checked numerically (`clientsmoke.mjs`) and in still frames, not as smooth motion.
- **Tests:** `dev/test-scripts/cat/`. The plain node ones need no server: `sim.mjs`, `ai.mjs`, and `clientsmoke.mjs`
  (run with `node --import ./dev/test-scripts/cat/register.mjs`). The others need a server started by `srv.sh` on
  4060, with fresh data in `$TEMP/co-cat/testdata`:
  - `t1.mjs`: `MAP=cs_mansion START_MONEY=16000 BOTS=0 ROUND_TIME=900` (about 8 minutes; `WANDER=` sets the seconds
    left alone, 150 by default);
  - `soak.mjs`: `MAP=cs_mansion BOTS=4 DEBUG_TICK=1`;
  - `maps.mjs`: any map.
  - Browser: `catview.mjs` (any server on 4060), and `g1.mjs` (`MAP=cs_mansion` or `cs_mansion_night`, `BOTS=0
    ROUND_TIME=600 START_MONEY=16000`, a fresh server for each run), with one headless Edge on `CDP_PORT=9460`.

## (a) README

- **The cat** (Mansion and Mansion at night): a ginger cat lives in the house. Every round it starts asleep in its
  basket by the living-room sofa, and the server moves it, so everyone sees it in the same place.
  - **It wanders.** It goes between its favourite spots: the sofa, its basket, the food bowl in the kitchen, the
    stairs, the sunny window sill, the upstairs window, the bedroom, the terrace, the cellar, the back garden, the
    gazebo, the lawn and the shed. There it sits, loafs, sleeps or washes. It goes through open doors but can't open
    shut ones.
  - **It likes company.** Stand still next to it for a few seconds and it chirps, follows you about and sits at your
    feet looking up. Right next to it, it purrs.
  - **It gives people away.** Now and then it walks up to someone who is trying not to be seen and meows at them a few
    times. That means ghillie camo on, crouched in a room with the lights off, or playing dead. The meow comes from
    where the cat is, so listen.
  - **It hates guns.** Gunfire or an explosion nearby makes it hiss and bolt, and it hides for a while (under
    something if it can).
  - **It can set off mines.** A PMN it steps on or a MON-50 tripwire it walks into goes off, whoever laid it.
  - **It can't die.** A bullet or a blast throws it through the air with a screech, and then it runs off to hide.
  - **At night** its eyes glow in the dark.
  - Bots pay it no attention.

## (b) RESUME notes

### Files
- `shared/cat.js` (shared by the server and the browsers):
  - `CAT_MAPS` and `catMap(map)`: the cat lives on `cs_mansion` and `cs_mansion_night`.
  - `CAT_STATE`: the snapshot's state codes. 0 sit, 1 walk, 2 trot, 3 run, 4 wash, 5 stretch, 6 hide, 7 air (thrown),
    8 sleep, 9 loaf.
  - `CAT_SOUNDS`: meow, mrrp, screech, hiss.
  - `CAT`: all the numbers.
    - basket and bowl positions;
    - speeds: walk 0.85, trot 2.0, run 5.2 m/s;
    - think every 200 ms;
    - the spots (waypoints, below);
    - follow: `near` 3.5 m, `still` 3 s, `keep` 1.3 m, `lose` 14 m, `max` 45 s;
    - seek (the hidden-player meow): every 8 s, 35 % chance, range 16 m, 50 s cooldown per player, 3 meows;
    - purr within 1.15 m;
    - scared by gunfire within 22 m, and by a blast within 3 × its push radius (or 12 m);
    - hides for 12–22 s.
- `lib/cat.js` (the server): `createCat(api)` returns `{ reset, tick, shot, blast, snap, spots, debug }`. The last
  two are for tests.
  - **Walking:** A* over the bots' nav grid (`bots.nav()`), with its own rules:
    - no ladders, no drops over 1.1 m, no deep water, no door leaves or cars;
    - no diagonal step unless both straight neighbours are floors at the same height (stops it cutting the stairwell
      corner upstairs);
    - then straightened where the floor is flat, there's a real floor under every 0.25 m, and the line is clear.
  - **Moving:** from point to point at a fixed speed; no physics, so it can't fall through anything.
    - Its height follows the floor sampled along each leg (steps, sofa, sills).
    - A door shut or a car parked in its way stops it, and that spot is skipped for 40 s.
  - **Fleeing:** a bounded Dijkstra (2500 nodes, about 14 m) over the floor it can really reach. It picks the spot
    furthest from the danger (up to 18 m counts) for the least running, a tight spot preferred, then a covered spot
    nearby (something above it within 1.3 m).
  - **Thrown:** a hop through the air of up to 4 m, landing on a nav floor short of any wall.
  - **Mines:** checked every tick while it moves or any mine is down: the same trigger zones as players (PMN 0.45 m;
    the MON-50 wire, 0.3 m).
  - **Cost:** paths are found only when it picks somewhere new (about 1 ms on average, 8 ms at worst in the sims).
    The rest is a few distance checks a tick.
- `public/js/cat.js` (the browsers): `catLoadMap`, `catSync`, `catUpdate`, `catSound`, `catWarmModel`, plus
  `createCatModel` and `catPoseModel` for the tests.
  - **The model:** one `SkinnedMesh`. 27 boxes, 324 triangles, colours in the vertices, 10 bones (body, head, four
    legs, three tail bones). The geometry and the Lambert material are shared. One draw call, plus one for its shadow.
  - **The eyes:** a 2-point `Points` with a tiny shader, at least 2.5 px, shown only on the night map and not asleep.
    Frustum-culled like everything else (no draw call when the cat is off screen).
  - **The basket and bowl:** one baked mesh each.
  - **Smoothing:** it interpolates between snapshots on `renderTime()`. A step up is eased (about 0.1 s), and a jump
    of more than 3 m (a new round) snaps.
  - **The animation:** procedural, a target pose per state.
    - A new state crossfades in over 0.3 s (0.1 s into `air`) from the pose it had when the state changed. After that
      the pose is the target itself, so the steps and quick movements (licking, trembling) aren't damped.
    - Walk, trot and gallop (`GAIT`: stride 0.36 / 0.48 / 0.95 m a cycle) are keyed to the distance moved. A paw that
      is down stays put: each leg's angle and length are worked out from where its paw is (a one-bone leg that
      stretches up to about 20 %). It goes back exactly as fast as the floor goes by, then comes forward lifted.
      Walk and trot move in diagonal pairs, half the cycle down. The gallop moves the front pair, then the back,
      a quarter of the cycle down, with the back arching.
    - `pawLift` raises the body whenever a paw would go below the floor (a stretch, a blend between two poses).
    - The rest: sit with a tail curl; wash (licks a paw, rubs its face); loaf; sleep (curled, breathing); hide (flat,
      trembling); stretch (a play bow, front paws on the floor); air (tumbling); the head goes up when it meows.
  - **The sounds:** made on the fly through `audio.out(pos)`, so they're positional. A sawtooth through two sliding
    formant filters for meow and mrrp, plus noise for the screech and hiss; the purr is a 27 Hz rattle while the
    camera is within 7 m.
- **Tests, in `dev/test-scripts/cat/`:**
  - `sim.mjs`: minutes of wandering with a virtual clock.
  - `ai.mjs`: scenes with a virtual clock.
  - `t1.mjs`: the live server test.
  - `soak.mjs`: with bots.
  - `maps.mjs`: all maps.
  - `clientsmoke.mjs`: the client module in node, with `register.mjs` and `loader.mjs` mapping the browser paths.
  - `catview.mjs` and `g1.mjs`: browser, not run.
  - Helpers: `catclient.mjs` (a scripted player that records the cat), `srv.sh` (the server on 4060) and
    `probe.mjs` (what floor is under a point).

### Hooks in existing files (each marked "cat")
- **`server.js`:**
  - the import;
  - `const cat = createCat({...})` right after the bots' `BotManager`;
  - `resetWorld`: `cat.reset()`, back to the basket;
  - `blastMap`: `cat.blast(at, weapon)`, first line. This covers every explosion: HE, C4, rockets, mortar, mines,
    satchel, drone, cars;
  - `onShoot`: `cat.shot(p, o, def.rocket ? [] : dirs, !!def.melee)` after `bots.heard`. A rocket's launch only
    scares it; its blast throws it;
  - `explodeNade`: `if (n.k !== 'he') cat.blast(o, n.k)` (flashbang, smoke and Molotov only scare it);
  - `tick`: `cat.tick(t)` after `updateMines`;
  - the snapshot: `...cat.snap()`.
- **`public/js/main.js`:**
  - the import;
  - `loadMap`: `catLoadMap(scene, map)`;
  - `prewarm`: `place(catWarmModel(), 1.5, -1)` (the skinned shader and its shadow get compiled at load);
  - the snapshot handler: `catSync(m.cat, m.time)`;
  - a `catMeow(m)` handler, which calls `catSound(m)`;
  - `frame`: `catUpdate(dt, now, renderTime(), camera.position)`.

### Protocol
- **Snapshot:** an optional top-level `cat: [x, y, z, yaw, state, purring]`, every snapshot, on the two Mansion maps
  only. Positions are rounded to 2 decimals; state is a `CAT_STATE` code; purring is 1 or 0. No existing tuple was
  changed.
- **Message:** `{ t: 'catMeow', p: [x, y, z], k }`, broadcast, where `k` is `meow`, `mrrp`, `screech` or `hiss`. `p`
  is the cat's head, for the positional sound.

### Waypoints (`CAT.spots`)
Each spot has a floor position (snapped to the nearest nav node) and, for some, a perch it hops onto. The list gives
the id, position, perch (if any), what it does there and its weight.
- sofa: (−22.3, 0.91, 0.0); perch on the seat (−22.86, 1.32, 0); loaf, sleep, wash; weight 3.
- basket: (−22.1, 0.91, 3.7); perch (−22.55, 0.96, 3.85); sleep, loaf; weight 2.
- bowl: (−17.2, 0.81, −13.0); perch (−17.2, 0.81, −13.25); sit, wash; weight 2.
- kitchen: (−19.5, 0.81, −9.0); sit, wash, loaf; weight 1.
- stairs: (−12.2, 2.5, −6.6), which snaps to a step at 2.85; sit, loaf; weight 2.
- sunwindow: (−7.4, 0.81, −11.98); perch on the sill (−6.72, 1.63, −11.98); sit, loaf, wash; weight 3.
- upwindow: (−7.4, 4.27, 8.95); perch on the sill (−6.72, 5.08, 8.95); sit, loaf; weight 1.
- bedroom: (−20.0, 4.27, 8.5); loaf, sleep, wash; weight 1.
- terrace: (−5.3, 4.27, 3.3); perch (−6.1, 4.72, 3.3); loaf, sit, wash; weight 2.
- cellar: (−18.0, −2.2, −1.5); sit, loaf; weight 1.
- garden: (−37.5, 0.0, 1.5); sit, wash, loaf; weight 2.
- gazebo: (−45.2, 0.3, 0.0); loaf, sleep; weight 1.
- lawn: (2.0, 0.0, 9.0); sit, wash, loaf; weight 1.
- shed: (15.5, 0.2, 16.4); sit, loaf; weight 1.

A spot it can't reach (a closed door in the way) is skipped for 45 s. If none can be reached, it strolls about the
room it's shut in.

### Contract fields (read only; the cat writes nothing on players)
- **Players:**
  - `p.alive`, `p.team`, `p.p`, `p.id`;
  - `p.c` (crouched);
  - `p.hidden` (the server's ghillie camo flag, set in `updateCamo`);
  - **`p.playingDead`** (from `feature/body`; until that is merged it's always undefined, and the check stays);
  - `p.driving`, `p.riding` and `p.zip` (someone in a car or on the zip line is never followed or meowed at).
- **Game and world:**
  - `game.lights[group] === false`, or `game.lights.power === false` for rooms with `power`: a dark room, from
    `map.rooms`;
  - `game.mines` (`k`, `p`, `yaw`, `armAt`);
  - `world.doorBoxes`, `world.carBoxes()`, `world.raycast`, `world.move`;
  - `map.water` (except boxes marked `flood`).
- **Hidden** means camo on (`p.hidden`), or `p.playingDead`, or crouched inside a room whose light is off.
- **Following** never takes a hidden player: the cat meows at them instead. If the player it's following hides, it
  switches to meowing at him.

### The water hook (floodgate, `feature/flood`)
`createCat` takes an optional `deepWater(pos)`: true where the water is too deep for a cat. When it's given:
- paths never step into deep water, and no goal or hiding spot is in it;
- a cat standing in it wades out by the cheapest way. If nothing dry is within its flee range, it heads for the
  nearest dry favourite spot (up the cellar stairs).

`ai.mjs` checks this with the flood's areas at 0.8 m deep: out within 40 s, and never back in over the next 20 minutes.

The floodgate's own water boxes (`map.water` entries with `flood: true`) are skipped when the static wet map is
built, because their level changes. At integration, add one line to the `createCat({...})` call in `server.js`
(`flood` is the floodgate's `createFlood` result; `waterTop` is from `shared/flood.js`):

```js
deepWater: p => waterTop(flood.state.level, p) - p[1] > 0.12,
```

### What was verified
- **`sim.mjs`:**
  - 60 minutes with the doors open (all 14 spots reached, 94 paths, 0 failed) and 60 with them all shut (the 10
    spots it can reach from the house; 133 paths, 30 failed, so it waited or strolled). Also 20 minutes on
    `cs_mansion_night`.
  - 0 ticks off a floor, outside the map or inside a wall. A "graze" (its side brushing an edge for one tick) shows
    a few times an hour; that's the nav grid's nodes a few mm from a step.
  - The longest stop with a path was 0.2 s; tick average 0.002 ms.
- **`ai.mjs`:**
  - basket at the start; follows a still player, purrs at 0.8 m but not at 1.4 m, gives up when he's suddenly 25 m
    off;
  - runs from a shot and hides further away (about 18 m from the gun) for 12–22 s, then stretches;
  - a bullet throws it;
  - meows at camo, at someone crouched in a dark room (and not at the same player standing up), and at
    `p.playingDead`; no meows at a player in plain sight;
  - a PMN under it goes off once armed (not before); it's thrown, lands on a floor and hides;
  - a MON-50 wire across it goes off;
  - an HE 1 m away throws it;
  - it follows a player down into the cellar and wades out of the flood;
  - reset returns it to the basket; nothing happens on other maps.
- **`t1.mjs` (live):** the same through the real hooks.
  - The T follows; his PMN under the cat goes off (screech, thrown, lands, hides; he's unhurt).
  - A CT's shot into the air makes it hiss and bolt; a CT's bullet throws it.
  - A camo T is found and meowed at (the meow carries a position).
  - 150 s alone: it moved about, 0 snapshots off a floor.
  - A natural new round (the CT kills the T) and an admin restart both put it back in its basket asleep.
- **`clientsmoke.mjs`:**
  - one skinned mesh, 324 triangles; shared geometry and material;
  - every pose and state animates without NaN;
  - the half-way smoothing, the eased hop, the snap back to the basket;
  - the four sounds through a panner; the purr starts once and stops;
  - eyes at night only (shut asleep);
  - removed from the scene on other maps.
- **`soak.mjs` and `maps.mjs`:** 60 s with `BOTS=4`: the cat in all 1934 snapshots, always on a floor; the bots'
  fighting sent it running and hiding. No server errors; ticks averaged 0.8–1.6 ms (max 7 ms after the start-up
  tick). All 7 maps start, with the `cat` key only on the two Mansions.

### What wasn't verified
- Anything you have to see or hear (browser checks above).
- The flood hook against the real floodgate: it is tested only with a fake `deepWater`.
- `p.playingDead` against the real body branch: it is tested only with the field set by hand.

### Known gaps
- **Doors:** it can't open them. At round start every door is shut, so it keeps to the open rooms until someone
  opens a way.
- **Collision:** nothing collides with it. Players walk through it, and grenades and bullets pass through (a bullet
  that hits it still goes on). A player standing between the shooter and the cat doesn't shield it.
- **Blasts:** they throw it only with a clear line from the blast. Behind a wall or floor it's only scared.
- **Mines:** it sets them off regardless of team, and the mine hurts players nearby as usual. The kill credit goes
  to the mine's owner, like any mine.
- **Purring and following:** it purrs next to anyone, enemies included. It may follow a bot that stands still.
- **Startup:** while the bots' nav grid is still being built (a few seconds after the server starts, or after the
  first switch to a Mansion map), it stays asleep in its basket.
- **Snapshot size:** about 40 bytes in every snapshot on the Mansion maps.
