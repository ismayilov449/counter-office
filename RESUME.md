# RESUME POINT — Counter-Office feature plan (stopped 2026-10-30, finished 2026-10-31 on the new PC)

**To continue:** check out branch `resume/2026-10-30` and tell Claude Code:
*"Read RESUME.md and continue the plan from the resume point."*

Work stopped because the old laptop was too slow to run three agents and their test browsers at once. Everything
done so far is on the branch `resume/2026-10-30`, which is `main` plus both feature branches, merged and tested
together. `main` itself only has steps 1 and 4. The branches `feature/t-weapons` and `feature/mansion` are kept as backups.

---

## 1. Where things stand (all 15 steps done)

| # | Step | Status | Commit(s) |
|---|------|--------|-----------|
| 1 | Radar red dots | ✅ done | `bd7523a` |
| 2 | RPG-26 (T) | ✅ done | `6e662ad` |
| 3 | Satchel charge (T) | ✅ done (some gaps, see below) | `7790797` |
| 4 | Signal jammer (T) | ✅ done | `8bba762` |
| 5 | Mansion: kitchen back door | ✅ done | `89f1fe4` |
| 6 | Mansion: wine cellar | ✅ done | `2989be2` |
| 7 | Mansion: blackout (fuse box) | ✅ done | `07e1b70` |
| 8 | Mansion: smugglers' tunnel to the shed | ✅ done | `a6cdbda` |
| 9 | Mansion: storm drain | ✅ done | `971813a` |
| 10 | Mansion: roof terrace + drainpipe ladder | ✅ done | `971813a` |
| 11 | Mansion: garage | ✅ done | `f56ff90` (test scripts fixed in `07c7d96`) |
| 12 | Mansion: neighbour's house | ✅ done | `eb58669` |
| 13 | Mansion: back garden | ✅ done | `6f11419` |
| 14 | Mansion at night | ✅ done | `f5592d0` |
| 15 | FPV drone (T) | ✅ done | see `git log` ("FPV drone ...") |

Merge commits on this branch: `5d335cd` (feature/mansion) and `34e90ed` (feature/t-weapons; the jammer/satchel
conflicts were resolved by keeping both).

**Nothing is half-done.** Every step was committed and pushed when it was finished. The plan is complete; what's left is
in "Known problems to watch" and the "Not verified" lines below.

### Post-merge check (on the old laptop, Mansion, headless Edge)
The merged build starts, and Mansion loads. A Terrorist bought the jammer, satchel and RPG-26 together ($16,000 → $10,500),
put the jammer down and threw the satchel, which stuck. There were no page errors.

**Checked by hand on 2026-10-31** (the user, in a real browser on the new PC): setting off the satchel with the phone, and
firing the RPG-26. Both work.

---

## 2. Notes on the finished steps (what was verified, what wasn't)

### 1. Radar red dots (`bd7523a`)
- **Spotting rule:** an enemy within about the screen width of a teammate (player or bot), with line of sight to head
  or chest, not through smoke. Camo counts only within 4 m. Nobody inside a jammer's area is spotted.
- **Drawing:** a live red dot; after sight is lost, a hollow ring at the last spot that fades over 3 s (no ring if the enemy died).
- **Where it's on:** classic, Gun Game, Zombie. Off in Deathmatch and Hide and Seek. Dead players and spectators see all enemies.
- **No leaks:** the server decides and sends each team only its own spotted enemies, inside that team's snapshot.
- **Cost:** each pair is checked every 4th tick (8 per second), up to 70 m; a sighting lasts 350 ms.
- **Verified:**
  - 16 bots on Dust II, tick about 1.1 ms on average (max 12);
  - only enemies are ever sent;
  - Deathmatch carries no spotting data;
  - the browser draws dots and rings with no errors.
- **Not verified:** the 70 m cutoff.

### 2. RPG-26 (`6e662ad`)
- **Basics:** Terrorists, $3,500, Heavy column. One shot; afterwards the tube is gone and you hold the pistol.
- **Limit:** one per T team per round (in warmup and Deathmatch: one in anyone's hands at a time). A CT can pick up an unused one.
- **Verified on Mansion:**
  - buying, and the second buy refused;
  - picking it up with E;
  - the rocket, explosion, fire, about 40 pieces broken, a hostage killed;
  - the pistol after the shot;
  - the model in a screenshot.
- **Bots:** they fire any rocket launcher they hold, but never at someone within 10 m. That's one line in `lib/bots.js`.

### 3. Satchel charge (`7790797`)
- **Basics:** Terrorists, $1,200, carry 1, at most 2 out per player. 150 damage within 10 m.
- **Using it:** throw it and it sticks to a wall, floor, crate or car (on a car it rides along). After that, slot 6 is the
  phone, and Mouse1 sets off all of yours.
- **Counter-play:** CTs shoot it (it explodes) or hold E to defuse it (3 s, 1.5 s with a kit, +$200).
- **Dead owner:** the satchel stays and can be defused, but the phone is dead.
- **Verified:**
  - sticking to a wall, the floor and the pickup (it went off at the truck's new spot after a 10 m drive);
  - defusing with +$200;
  - shooting it (63 pieces broken);
  - detonating with the phone;
  - the dead-owner rule;
  - the held models in screenshots.
- **Not verified:**
  - the blinking light and chirp, by eye and ear;
  - the buy-menu pictures of the RPG-26 and the satchel;
  - the tick during satchel use;
  - defusing a dead owner's satchel.
- **Known gaps:**
  - a satchel on a door doesn't follow the door when it swings or is blown off;
  - in warmup, satchels of players who left stay until warmup ends (mines do the same).

### 4. Signal jammer (`8bba762`)
- **Basics:** Terrorists, $800, in the Mines & camo column, one per T team per round, not in Zombie. Slot 6 (it
  cycles with the mines and the satchel/phone), Mouse1 puts it down.
- **Look and sound:** an olive box with three antennas and a blinking red light, with a looping hum.
- **Lifetime:** destroyed by 3 bullets or any blast nearby; cleared every round.
- **Within 15 m:**
  - a CT's radar shows static ("NO SIGNAL") and the server sends that CT no red dots;
  - CTs can't ping or call in mortar targets (V);
  - nobody inside the area (either team) is spotted.
- **For the drone (step 15):** the drone must call the server's `jammedAt(pos)` so it crashes inside a jammer. The
  README already promises this.
- **Verified:** buying, the one-per-round limit, the static, a blocked ping, hiding from spotting in 4 directions,
  3 shots destroying it, and a screenshot.
- **Not verified:** shooting it in the browser (the scripted shots missed; the server-side test passed).
- **Choices:**
  - only CTs lose their radar, pings and target calls;
  - teammates can't damage their own jammer unless friendly fire is on.

### Mansion 2.0, steps 5–10 (the user said to skip all bot work)
- **5. Kitchen back door:**
  - in the west wall of the north-west ground-floor room (now the "kitchen"), with three stone steps outside;
  - opens in 1.6 s with a loud creak; closes instantly;
  - gunfire breaks it (260 HP, about 11 pistol shots), and blasts blow it out from 1.6× further than other doors.
- **6. Wine cellar:**
  - the old walled-up closet next to the kitchen is opened, and 15 steps go down;
  - wine racks, barrels, a table, beams, one bulb and its switch.
- **7. Blackout:**
  - a fuse box with a red lever on the cellar's north wall;
  - a T holds E for 3 s to cut the power, a CT holds E for 5 s to restore it, with a loud sound for everyone and a flicker when it comes back;
  - light switches do nothing while the power is off; power is on at round start.
  - **Not verified:** the sounds and the flicker, by ear and eye.
- **8. Smugglers' tunnel:**
  - timber-shored, 1.3 m wide and 2 m high, about **40 m** (not 25: it runs in straight legs between the cellar and the shed);
  - a trapdoor in the shed floor creaks open in 0.9 s and won't close on someone.
- **9. Storm drain:**
  - an iron grate in the street at x≈26.4, z≈−2, a ladder down, then a concrete drain with murky water to a grate in the cellar floor;
  - both grates are slow and clank.
  - **Not verified:** the street-grate screenshot was never looked at, and the grates weren't tested separately on the server (same code as the trapdoor).
- **10. Roof terrace:**
  - the porch roof was already a terrace reachable from the top floor; furniture, shrubs and a drainpipe with a ladder at the porch's north-east corner were added;
  - the mortar sky check works there.
  - **Not verified:** the terrace screenshots were never looked at.
- **Bots:** the nav mesh still builds (24.8k nodes against 24.5k before) and bots don't crash. No game with bots was
  played, and de_dust2/de_dusty weren't re-checked by that agent. The merged server did start with all maps.

### 11. Garage
- **Where:** against the house's north wall, x −22.6…−15.6, z −20.73 (the estate wall is its back wall)…−14.43, between
  the manhole and the north ladder; flat roof at 3.3–3.5 m (reachable from the ladder).
- **Roller door** (a new door kind, `roller` in `shared/doors.js`): in the east wall, 4.2 m wide, 2.7 m high. E rolls it up in
  2 s (`slow`), with a rattle; it comes down at once, but not on a player, hostage or car (any door now refuses to close
  on a car). Blasts measure their distance to the whole door (`doorReach`), not its middle; steel doors (roller, grates)
  don't burn.
- **The car:** `vehicles[1]` in mansion.js, parked facing the door. Vehicles can have `y`: the height they are dropped
  onto the ground from (under a roof). It drives out onto the north lawn.
- **Inside:** tool shelves (a new `toolshelf` texture), a workbench, three oil drums, a lamp and a switch (room group
  `garage`, cut by the blackout). The kitchen's north window looks into it.
- **Side door:** kitchen ↔ garage in the house's north wall at x −22.05…−21.05, with three concrete steps down.
- **Breaks:** walls and the roof are breakable (`inGarage` in mansion.js; roof pieces above 3.29 m, so a mortar inside blasts
  out). Steps and oil drums are kept whole (`keep` boxes from mansion2.js).
- **Draw cost:** barrels now share their material per colour, so they merge (this also merged the cellar's 7 barrels).
- **Verified:** server test `t11.mjs` (roll up, close, refused while someone stands in the door, get in and out of the car,
  an HE blows the door out); browser test `g11.mjs` (hint, rolling, open, drive out, side door; no page errors);
  `walk.mjs` through both doors; the car sim drives out; screenshots `v11.json` looked at; the old tests t5/t7/t8 still pass;
  nav builds; 60 s with BOTS=4 and no errors; de_dust2 loads.
- **Not verified:** the rattle by ear; the roller animation at full frame rate (headless runs at a few fps).

### 12. Neighbour's house
- **Where:** a walled garden x 30.79…39.8, z −12.2…−0.8 east of the street; the house x 32.3…38.9, z −10.6…−3.4, flat roof
  with a parapet (top 6.4 m), bedroom floor at 3.2. A 1.2 m gap through the street wall (z −7.6…−6.4) and a paved path to
  the front door (a normal door, `doors[8]`).
- **The window:** in the bedroom's west wall, z −8.4…−5.6, y 4.1…5.4; glass from `RM.windows` (mansion.js now takes windows
  from mansion2.js too, with their own light group). From it you see the mansion's front over both walls; from the street
  you can't see it (only the top 0.7 m of the house shows over the street wall).
- **Bounds:** ±40.5 after this step (was ±29.2; ±50 after step 13): the radar showed 81 m instead of 58.4 m. Checked: the radar draws the house at the
  right edge, the sky grid covers it (ground floor covered by the bedroom floor, bedroom under breakable roof pieces, the
  roof open), nav builds (26.6k nodes).
- **Invisible walls:** the one over the street wall is cut away along the garden; new ones stand over the garden walls,
  and two short ones stop walking along the top of the street wall past the garden. The street wall's top is now drawn in
  its stone for its whole length (it was street-coloured where it showed, missing under the old invisible wall).
- **Breaks:** only the west wall (with the window) — making the whole house breakable added ~730 pieces and +11k
  triangles to every view; the west wall alone is ~150 pieces and +2.5k. Its own lights (group `neighbour`, two
  switches); the fuse box now cuts only rooms marked `power`.
- **Stairs:** 15 steps start a step away from the south wall (walk onto them from the south) and end on a landing; the
  stairwell is railed upstairs. `walk.mjs` goes up and down them, through the gap and the door.
- **Verified:** browser test `g12.mjs` (door hint, E opens it, the view from the window, one pistol shot breaks the glass, no
  page errors); screenshots `v12.json` looked at; t5/t8/t11 still pass; nav builds; BOTS=4 for 60 s; de_dust2 loads.
- **Not verified:** bots using the house (bot work is skipped).

### 13. Back garden
- **Where:** x −49.2…−29.16 (inside its walls), z −20.73…21.95, behind the west estate wall; a 3 m gateway through that
  wall at z −1.5…1.5. Garden walls as tall as the estate's (3.45 m) with invisible walls over them; the old invisible
  wall beyond the estate wall (x −30.79…−29.16, from the ground up) is gone. The estate wall got faces on its garden side.
- **Pool:** x −44.5…−35.5, z −16.5…−7.5, floor at −2.0, water surface drawn at −0.25. Dug with `hollow()` (open top),
  pool tiles, 4 steps of 0.4 m in the south-east corner. Its water box (`RM.water`, added to `map.water`) reaches 0.1 m
  above the deck so a swimmer holding Space rises high enough to step out. `swim.mjs` simulates swimming.
- **Greenhouse:** x −38…−32, z 8…14: steel posts and beams (`x_metal` brushes), 19 plain glass panes (`RM.glass`, made in
  mansion.js as `plain` glass boxes), a door gap on the north side, gravel floor, two planting tables.
- **Gazebo** (the existing `gazebo` decor, centre (−45.2, 0)) with solid pillars and a raised floor; **maze**: 4×4 cells in
  x −49.2…−41, z 13…21.95, hedges 2.2 m (too tall to climb onto, the bench idea was dropped for that reason).
- **Bounds** ±50 now (the radar shows 100 m). The outside lawn plane no longer runs under the garden (it showed in the pool).
- **Draw cost kept down:** walls, hedges and paths use materials the level already draws; plain glass panes now share one
  material (all of them merge into one mesh — this also helps cs_assault) and draw front faces only (half the overdraw).
- **Fixed on the way:** the garage floor had no nav nodes (the bots' grid merges floors less than 5 cm apart and kept
  the lower one); its slab is 10 cm thick now.
- **Verified:** `walk.mjs`/`swim.mjs` (through the gateway, into the pool and out over the edge with Space and up the
  steps, into the greenhouse by its door, glass stops you); nav reaches the maze's dead end, the greenhouse, the gazebo,
  the pool floor and deck from the T spawn; browser test `g13.mjs` (walk into the pool, swim out, a pistol shot breaks
  two panes, no page errors); screenshots `v13.json` looked at; t7/t11 pass; BOTS=4 for 60 s; de_dust2 loads.
- **Frame cost** (before → after, swiftshader, `vcost.json`): views that don't face the garden: draw calls +0…+9,
  triangles +0.2k…+1.1k (<1%), frame time within the noise. Facing it: through the gateway from the back lawn 49 → 60
  calls, 113.0k → 115.2k triangles, 102 → 115 ms (+12%); from the T spawn's west window 54 → 63 calls, 236 → 241 ms (+2%);
  in the garden itself 35 calls and 11.8k triangles.

### 14. Mansion at night
- **How it's chosen:** a separate map id, `cs_mansion_night` ("Mansion at night", `shared/maps/mansion_night.js`): the
  Mansion's map object spread with a night theme and extra decor, so every Mansion feature works the same. It's in
  `MAPS`, so it's in the rotation (after cs_assault), the end-of-match vote, the Esc-menu vote and the admin panel, and
  `MAP=cs_mansion_night` starts on it. (The bots build a second nav grid for it in the background.)
- **Theme:** dark sky, the sun is a pale moon (its shadows stay), dim blue hemisphere light, dark fog, fireflies,
  `stars: true` (600 points on the sky, one draw call), `roomGlow`, `litGlass`, `viewmodel` (see below).
- **Lamps:** new decor types in world.js: `streetlight` (an iron post with an arm, or with `wall` a lantern on a bracket;
  shared materials so they merge) and `glows` (one Points draw call for a list of lamp glows). Their light is ordinary
  `light` decor (only the q.lamps nearest really shine). The estate's lamps are in light group `estate`, added to the
  night map's fuse-box groups: the blackout puts them out (their glows hide, their heads' shared material turns grey).
- **Lit rooms:** roomlight.js got `setGlow(k, groups)`: on a night map a room whose lights are on (and whose group has a
  switch) adds a warm light of strength k everywhere in it. It's encoded in the room's existing ambient value (2 + k), so
  the per-pixel room loop is unchanged — a second uniform array in that loop cost ~8–10% of a frame on swiftshader. The
  few extra instructions after the loop are in every map's shaders: the day maps measured +1…+5% on swiftshader
  (alternating runs; on a real GPU it should be far less).
  Window glass of lit rooms gets the theme's `litGlass` colour. The first-person weapon's lights scale with
  `viewmodel` outdoors and with the room's glow indoors.
- **Night skyline:** `skyline` decor with `night` lights more windows, brighter, and ignores the fog.
- **Verified:** fixed views `v14.json` (+ blackout and moon views) looked at; browser test `g14.mjs` on the night map
  (spawn, lawn, flashlight, nightvision, a Terrorist cuts the power: house and estate lamps go out; no page errors).
- **Frame cost** (night vs day, same build, swiftshader, `vcost.json`): draw calls +7…+26 per view, triangles +0.2k…+0.9k,
  frame time +0…+10% (the most in views with many lamps and the sky in them).
- **Not verified:** how dark it feels on the players' screens (the headless renderer's colours are close, but not the same).

### 15. FPV drone
- **Shared:** `WEAPONS.drone` (slot 6, `device`, T, $5500, `perTeam: 1`; Heavy column of the buy menu), `WEAPONS.dronebomb`
  (the bomb in the air: an impact "grenade" for the browsers' flight; the server explodes it as an HE), `DRONE` and
  `droneSignal(dist, blocked)` (used by both sides), and `drone` entries in BREAK/REAL.
- **Server** (`onDrone`, `updateDrones`, …, after the jammer's code): launch (checks it's by the pilot's eyes), position
  updates from the pilot's browser (believed up to a sane speed), the bomb (`dropDroneBomb`: `simulateNade` with impact,
  an HE `nade`), the dive's impact (`explodeDrone`: like the satchel's blast), letting go (E, also as the 'use' message),
  landing (recovered within 4 m of the pilot, else lost); every tick the battery, `jammedAt`, the signal and a dead or
  missing pilot (`loseDrone`: it falls and breaks on the ground); one bullet (`rayAABB` round it) or a blast
  (`blastDrones`, next to every `blastJammers`) brings it down. The pilot can't shoot or throw, is forced crouched with
  the remote (`p.w = 'drone'`). Drones are in every snapshot while there are any (`dn`). Its camera spots enemies for
  its team (`updateSpotting`, its own fov).
- **Browser:** the flight (`updateDroneFlight`: WASD/mouse/Space/Ctrl, inertia, a dive along the view, collisions with a
  small box, landing), its camera (fov 95), the video overlay (one noise layer whose position jumps every frame, one
  layer of scan lines and vignette, the readouts), the drone models from the snapshot (props spin, the light blinks, the
  bomb hangs until dropped), the buzz (`audio.buzz`, positional, carries far, higher in a dive), sounds for the launch,
  dive and crash. Models in guns.js: the remote (held) and `buildDrone()` (also the buy-menu picture, tilted).
- **Verified:** server test `t15.mjs` (buy, a second refused, launch, snapshot, the pilot crouched with the remote, the
  bomb (an HE where it lands, 91 damage to a CT next to it), letting go, landing by the pilot (back in the bag with
  33.5 s left and no bomb), relaunch, a jammer crash, losing the signal out of range, the camera spotting a CT the pilot
  couldn't see, a dive killing a CT, a CT's single shot bringing one down); `t15b.mjs` (the battery); browser test
  `g15.mjs` (buy menu picture, the remote in hand, launch, flying with the overlay, the bomb, the dive; a CT watching a
  drone hover and shooting it down; no page errors).
- **Not verified:** the buzz and the other sounds by ear; flying it by hand at full frame rate (headless runs at a few
  fps); the pilot seen crouching with the remote in a screenshot (the server's snapshot says so; a hedge was in the way).
- **Choices:** in the Heavy column; landing far from the pilot loses it; any jammer brings it down; teammates can't shoot
  their own team's drone unless friendly fire is on; the bomb drops straight down (with no sideways speed).

### Known problems to watch
- **Mansion load time** (measured 2026-10-31 on the new PC, i9-13980HX, 5 runs each): building cs_mansion (importing
  mansion.js, which the browser does too on every page load) took ~350–390 ms, the same as `main` before Mansion 2.0
  (~335–380 ms), so the 1.3× was the overloaded old laptop. `breakUp()` was most of it: for each piece it looked at every
  static solid (the caps) and clipped every face of a plane against every piece on it. In step 12 both got an index /
  quick bounds test (the output is byte-for-byte the same, checked by hashing every map), and the build took
  **~260–280 ms** with steps 11–12 in it (`remodel()` ~40 ms of that). Timings on this PC drift (it got ~1.4× slower over
  the afternoon), so compare side by side: after step 13, in one sitting, the resume point built in ~500–530 ms, step 12
  in ~355 ms and step 13 in ~360 ms (`remodel()` ~70 ms). In the browser `buildWorld` takes ~240–440 ms (swiftshader).
- **Lighting rooms:** Mansion uses 21 of the 24 allowed in `public/js/roomlight.js`: the storm drain's three boxes and the
  smugglers' tunnel's two were merged into one box each (they're deep underground, nothing else is drawn in them), which
  freed three; the garage and the neighbour's house (one box for both floors) took one each.
- **Frame cost** (fixed views `vcost.json`, viewer.js on swiftshader; draw calls include the shadow pass). Before step 11 →
  after: draw calls +1…+19 per view (+19 in the kitchen, which looks into the garage), triangles +3.5k…+5.8k (~+4%), frame
  time within the noise (±4%). Step 12: +22…+24 draw calls in views facing east (T spawn, porch, terrace, street; its
  lamps, door, window and new materials), none elsewhere; triangles +2.5k…+3.5k (~+2%); frame time within the noise.
  Step 13: see its notes.
- **Map bounds** are ±50 now (were ±29.2): the radar and the mortar map show 100 m, so things on them are smaller; the
  sky grid and nav grid grew with them (nav 30.3k nodes, built in ~160–220 ms).
- **Nav quirk:** false "drop through the floor" links next to walls: 97 already on main, plus 15 between the living room
  and the cellar. Left alone because bot work is skipped.

---

## 3. How Mansion 2.0 is built (read before steps 11–14)

- **Where the code lives:** all new geometry is in **`shared/maps/mansion2.js`** (function `remodel()`, called from
  `mansion.js`), made the way the converted BSP is made: solid boxes plus drawn faces. That way new parts break, burn,
  block mortar shells and show on the radar like the rest. Helpers:
  - `carve`: cuts a box out of the original walls, floors and their faces.
  - `brush`: adds a solid box with its faces.
  - `reveal`: draws the inside edges of a doorway.
  - `hollow`: digs out connected underground rooms with their own walls.
- **Doors** (`shared/doors.js`) can now be `slow`, `weak` (breakable by gunfire), or `hatch` lying in a floor (with `grate: true` for iron grates).
- **Server:** added `slowOpen`, `shootDoor`, `mansionTick` (runs every tick when `MAP.mansion2` is set), `atFuseBox` and `setPower`.
- **Blackout:** the power state is `game.lights.power`. In `roomlight.js`, house rooms marked `power: true` go nearly black,
  and room boxes are 6 cm bigger so walls on their edges count as inside.
- **Coordinates:**
  - Cellar: x −22.9…−13.31, z −5.49…4.5, floor y −2.2, ceiling 0.61.
  - Stairwell: in the old closet, x −15.54…−13.31, from z −9.75.
  - Fuse box: about (−18.3, −0.95, −5.3).
  - Smugglers' tunnel: y −2.2…−0.2. It runs east along z 5.0…6.3 from x −14.8 to 14.8, then south along x 13.5…14.8 to
    z 16.8. The trapdoor covers x 13.6…14.7, z 15.7…16.8, in the shed floor at y 0.2. (The shed is at about x 12.5–18.5, z 14–18.5.)
  - Drain: y −5.0…−3.0. The street leg is z −2.6…−1.4 for x 3.4…26.9; it jogs at x 3.4…4.6, then runs z −0.2…1.0 from x 4.6
    to −19.6. The street grate is at x 25.9…26.9, the cellar grate at x −19.6…−18.6.
- **Ideas for the next steps, from the agent that built 5–10:**
  - **Garage:** north side, about x −22.3…−16, z −20.6…−14.4, with a side door into the kitchen near x −22…−21.
  - **Neighbour's house:** east of the street at x ≈31…39, two storeys so its window sees over the estate wall. The
    invisible boundary wall above the street's east wall must go.
  - **Back garden:** west of x −29.2. It needs its own ground, a gate in the west wall, the invisible boundary wall removed,
    and faces on the outer side of the estate wall.

---

## 4. What's left: full specs, in this order

The user approved these. Skip all bot support (no bot use, routes or reactions); only keep existing bots from breaking.

11. **Garage** beside the house: a roller door that opens with E or is blown open by explosions, a second drivable car inside
    (reuse the car code), tool shelves, and a side door into the kitchen.
12. **Neighbour's small house** across the street, on the CT side: two rooms and a window facing the mansion (shootable glass), cheap
    to draw. Grow the bounds if needed, and check everything that uses bounds (radar, mortar map, sky grid, nav).
13. **Back garden** about 20 m west past the west estate wall: a swimmable pool (reuse the water), a glass greenhouse with
    shattering panes, a gazebo and a hedge-maze corner. Keep it light for Intel iGPUs and measure frame cost before and after.
14. **Mansion at night:** streetlights, lit windows and moonlight, cheap to render. Choose how it's selected (e.g. a separate
    map id `cs_mansion_night` in the rotation and admin panel) and document it.
15. **FPV drone** (Terrorists, $5,500, one per T team per round):
    - **Launching:** Mouse1. The pilot crouches with a remote, helpless and visible.
    - **Flying:** through the drone camera, with grainy video, a signal bar and battery left. WASD moves, the mouse steers, Space climbs, Ctrl descends.
    - **Mouse1:** drops its HE-strength grenade; then fly back and land to end.
    - **Right mouse:** a kamikaze dive that explodes on impact, stronger than an HE.
    - **E:** drops control and it falls.
    - **Weaknesses:** one bullet destroys it, and it buzzes loudly.
    - **Range:** the signal degrades past about 60 m or through thick walls and is lost at 80 m. 40 s battery.
    - **Radar and jammer:** what its camera sees counts for the radar red dots, and it **crashes inside a jammer (use the server's `jammedAt(pos)`)**.

For every step:
- new items go in the buy menu with pictures and respect team restrictions;
- breakables are repaired each round;
- existing Mansion features keep working (breakable walls, fire, the mortar through the roof, hostages, the PKT truck);
- README.md is updated in the same plain style.

---

## 5. Rules (the user's standing instructions)

- **Commits:** after each feature, commit **and push**, ending the message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never force-push or amend pushed commits.
- **Branches:** keep working on `resume/2026-10-30`, or merge it into `main` first if the user agrees (it's a fast-forward of main
  plus the two merges). Ask the user which they prefer.
- **Real data:** never touch the real `data/` folder (stats, admin password, settings, `join-page.txt`). Test with a separate
  `DATA_DIR`.
- **Edge:** never kill all Edge processes; the user browses with Edge. Stop only the headless test Edge, **by its command line**.
  Windows PowerShell 5.1's `Get-Process` has no CommandLine, so the filter in the old brief never matched. Use:
  `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*--headless=new*remote-debugging-port=9333*' } | ForEach-Object { Stop-Process -Id $_.ProcessId }`
- **The user's server:** don't touch the user's own server (ports 3000/3443). The user restarts it with `start-server.bat`.
- **Line endings:** `core.autocrlf=true`, and the files are LF. Avoid `git stash`, and after a merge check that files didn't turn CRLF.
- **Patching:** big bash heredocs with nested quotes have failed. Use the Edit tool, or patch scripts written to a file and run with node.
- **Laptops:** the players use 6 laptops, mostly Intel integrated graphics. Keep render cost low.
- **Agents:** running three agents in parallel overloaded the old laptop. On the new one, prefer **one agent at a time** (or work
  directly), and read big files (`main.js`, `server.js`) in ranges.

## 6. Test tooling

- `dev/test-scripts/` holds the test scripts. Paths are relative to the repo; ports come from `GAME_PORT` (default 3999)
  and `CDP_PORT` (default 9333), screenshots go to `OUT`, scratch files to `SP` (default `$TEMP/co-test`). They run on
  Node 20 (they fall back to the `ws` package when there's no global WebSocket).
  - `restart.sh` / `up.sh`: the test server on GAME_PORT with fresh test data in `$SP/testdata`. `mansion/edge.ps1`: (re)start
    or stop the headless Edge on 9333.
  - `mansion/game.mjs`: the real game in the headless Edge (join, fake pointer lock, `tp` to put the player anywhere, look,
    keys, clicks, screenshots, page errors). `mansion/loadmap.mjs`: load whatever map runs and screenshot it.
  - `mansion/views.mjs` + `viewer.js`: fixed views (and `viewTop` plans) with draw calls and triangles; `BENCH=n` times frames.
    `vcost.json` is the fixed set for frame cost. `meshes.mjs` lists the world's meshes (diff two runs).
  - `mansion/botsoak.mjs`: one scripted player for N seconds, so the bots play.
  - `roofmortar.mjs`, `mortarmap.mjs` and `mergetest.mjs`: the CDP browser-test pattern. Inject a WebSocket wrapper, join a team, fake
    pointer lock, send synthetic mouse and key events, take screenshots, collect page errors.
  - `spottest.mjs`/`spotbrowser.mjs` (radar), `jamtest.mjs`/`jambrowser.mjs` (jammer), `tw-*.mjs` (RPG-26 and satchel;
    `tw-lib.mjs` is the helper).
  - `mansion/`: `client.mjs` (a scripted player over WebSocket), `walk.mjs` (walks a body through the map with the game's
    physics), `views.mjs` + `viewer.js` + `v*.json` (screenshots from fixed views), `navcheck.mjs`, `sky.mjs`, `load.mjs`,
    and the tests `t5`/`t7`/`t8`/`t11.mjs` (server) and `g11.mjs` (browser).
  - Comparing with an older commit: `git worktree add --detach <SP>/wt-base <commit>`, junction its `node_modules` to the repo's,
    run its server on another port (e.g. 3997) and point `GAME_PORT` at it. Remove the worktree afterwards.
- **Headless Edge:**
  `msedge.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<temp>\edge-profile --enable-unsafe-swiftshader --use-angle=swiftshader --no-first-run --window-size=1280,720 about:blank`
- **Useful server env vars:** `MAP=cs_mansion`, `BOTS=0..8`, `START_MONEY=16000`, `GAME_MODE`, `DEBUG_TICK=1` (tick times),
  `PORT`, `HTTPS_PORT`, `DATA_DIR`.
