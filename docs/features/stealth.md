# Stealth & hiding (ROADMAP group 4, branch `feature/stealth`)

## STATUS (2026-11-08)

- **Done (built, server and node tests pass):**
  - **4.1 The chimney:** the fireplace and its flue to the roof, climbing it both ways, soot and black footprints,
    lighting the fire (hold E 2 s), its harm, smoke out of the stack. `t1.mjs` 15/15 on both Mansion maps, `geom.mjs`
    45/45 (with a climbing simulation), `clientsmoke.mjs` (chimney part), `unit.mjs` (chimney part).
  - **4.2 Creaking floorboards:** 17 creaky spots, heard by every browser like footsteps. `creaks.mjs` 42/42 (both
    maps), `clientsmoke.mjs` (creak part).
  - **4.3 Hide in the car trunk:** the garage's car on the Mansion maps. `t2.mjs` 16/16 on both maps, `unit.mjs` 26/26,
    `clientsmoke.mjs` 56/56 in all.
  - Regressions on this branch (test server 4240): `mansion/t16zip.mjs` and `t17cctv.mjs` (no failures),
    `integration/links.mjs` a–g 36/36 and h 4/4 (GAS_LEAK_X=6), `gas/t_gas.mjs` 20 OK (GAS_LEAK_X=3, no failures),
    `blood/tblood.mjs` (no failures), `mansion/walls.mjs` 0 missing / 0 twice, `navcheck` 0 links through floors
    (30,379 nodes) on both maps; `BOTS=4` for 60 s on both Mansion maps: no server errors, tick 0.7–1.0 ms average
    (one 34 ms spike at night); all 7 maps load (`stealth/maps.mjs`, no server errors).
  - **Browser test** (`stealth/g1.mjs`, headless Edge on CDP 9640, a 960x540 page, server 4240 with BOTS=0
    ROUND_TIME=600 FREEZE_TIME=1 AUTO_BALANCE=0; the page a CT, scripted a T and a second CT): cs_mansion 24/24,
    cs_mansion_night 24/24, no page errors. Every screenshot looked at: the fireplace from the living room, the
    breast in the Ts' room and the bookcases either side, the bedroom side, the stack on the roof (with its dark flue)
    and from the west eave, the rungs from inside; up the flue and out over the south rim onto the roof (the soot
    message), footprints on the roof's slope (tilted with it) and in the living room; E on the roof: hanging on the
    rungs; down to the hearth; crawling out; the fire from the room, the smoke out of the stack seen from the back
    garden, a climber falling into the flames (the burning screen, "Get out of the fire!", the kill [fireplace] when he
    dies); the creaks (3 on the stairs' middle, none along the wall, the T heard on a floorboard, the page on another);
    the trunk's dark view with its strip of light and no crosshair or gun, riding along as the T drives the car out of
    the garage, out again, a hidden teammate not drawn, his teammate told, the T finding him.
  - **Fixed after the browser test** (1a3470f; the server and node tests rerun): the chimney's ladder held a climber
    against the flue's front wall, so near the top (E on the roof put you there) the climb's step-up stood him on the
    front rim — its wall side is now 0.1 m behind the rungs (`geom.mjs` now simulates climbing with main.js's ladder
    code); no footprints on the roof's slope (the feet stand on the highest step under the body, up to 0.3 m over the
    box under a print); **a trunk's hider was run over by his own car** (downed by it: he's inside its boxes) — the
    run-over loop in `onCar` skips him; E in the firebox toggled the south-west room's light through the wall (the
    switch is 1.1 m away behind it) — E does nothing inside the chimney now, and the hint there says how to climb.
- **Half-done:** nothing.
- **Next:** nothing left of the build; the sounds by ear on a real PC. Draw cost measured (below): +0 or +1 a frame.

## The fireplace and chimney: footprint (for the other wave-1 groups: please keep clear)

All in metres, y up (x east, z south; the house's ground floor is at 0.813, the upper floor at 4.267).

- **One box, floor to stack top:** x **−20.15 … −18.45**, z **4.28 … 5.283**, from the living-room floor (y 0.813) up
  through the upper floor, the ceiling slab and the roof to the top of the stack at **y 10.9**. It never breaks.
  Please keep a 10 cm margin round it: **x −20.25 … −18.35, z 4.18 … 5.38, y 0.8 … 11.0** (and the hearth in front,
  below).
- **Ground floor (living room, light group `lampa7`):** a brick chimney breast on the living room's **south wall** (that
  wall is z 4.877 … 5.283), standing 0.6 m out into the room, between the doorway to the south-west room
  (x −22.9 … −20.85) and the west end of the bookcase partition (x −18.0 … −13.31, z 2.03 … 2.85). The firebox's mouth
  is in its north face: x −19.72 … −18.88, y 0.813 … 2.013. A stone hearth in front, 4 cm high (solid):
  x −20.3 … −18.3, z 3.85 … 4.28; a wooden mantel shelf over the mouth (y 2.26 … 2.34). The 1.2 m in front of the hearth
  (z ≈ 3.0 … 4.28) is where you stand to light the fire.
- **Upper floor:** the stack goes up inside the thick wall (z 4.47 … 5.69) between the **Terrorists' room** (`lampa10`,
  north of it) and the **bedroom** (`lampa11`, south). In the Ts' room the breast stands 0.19 m out of that wall
  (z 4.28 … 4.47), through the middle of the built-in bookcase (which now stops either side of it). The bedroom's
  shelf niches stay (their backs are now the chimney's). The two upstairs hostages stand by the west wall (x −22.25),
  the T spawn at (−19.0, 3.66) stays 0.6 m clear of it.
- **Roof:** it comes out on the **west slope** of the main roof (the roof's surface is about y 9.25 at x −20.15 and
  10.3 at x −18.45) and stands to y 10.9. You climb out over its south rim onto the roof south of it (z > 5.3).
- **The flue inside:** x −19.72 … −18.88, z 4.38 … 5.18 (0.84 × 0.80 m), open from the hearth (0.85) to the stack top,
  with iron rungs on its south wall (drawn as part of the level; the browsers make them a ladder, like the lift's).
- **Far from:** group 3's machine room over the lift's shaft and their way over the roof (z −5.8 … −2.6: the stack is at
  z 4.28 … 5.28), the zip line's roof terrace and deck, the CCTV desk; group 5's vent grilles (none in the living room);
  group 2's pipes and cables (the nearest, W3 and E5 at x −16.35, are 2 m east of it). Checked on their branches.

## E: where my uses are in `onUse` (server.js) and the hints (main.js)

- **Out of a trunk:** in the first group, right after getting out of a car (drone → off the zip line / CCTV desk / car /
  **trunk** → revive → …). The hint: `stealth.inside()`, applied after everything else in `updateHud`.
- **The fireplace (hold E 2 s to light it) and the chimney's top (E on the roof by the stack climbs in):** right after
  the valves (… uniform → floodgate valve → gas valve → **fireplace / chimney top** → plant → hostages → …). The hint:
  `stealth.hint(hint)` in the override block, just before the valves' line (so the valves, the uniform, the shield and
  the lift, applied after it, beat it, as on the server). Inside the chimney E does nothing (the same call returns
  true, so E never reaches the light switch on the far side of its wall); standing in the firebox the hint says "The
  chimney: look up and hold W to climb" ("Get out of the fire!" while it burns).
- **Into a trunk (E behind a car, or beside its back end):** just before getting into a car (… doors → switches →
  **trunk** → cars → drops). The same `stealth.hint(hint)` gives it only over the cars' own hints and what comes after
  them (drive / get in / man the gun / pick up / swap / Press B / the ladder's), never over a door or a switch.
- No new keys.

## (a) README text (for the players)

In the Mansion's section (cs_mansion and cs_mansion_night):

    - **The fireplace and its chimney**: a brick fireplace on the living room's south wall (between the doorway to the
      south-west room and the bookcases), its chimney straight up through the Terrorists' room to the roof.
      - **A secret way up and down**: crouch into the fireplace, stand up at its back and look up: iron rungs go up
        the flue (W climbs, like any ladder). At the top, step out over the rim onto the roof. On the roof, press **E**
        by the chimney to climb in, then look down and hold W. (Group 3's roof ladder from the terrace: "and you can
        get onto the roof from the roof terrace's ladder" — see Links.)
      - **Soot**: whoever climbs the flue comes out black with soot and leaves **black footprints** for 20 seconds,
        for everyone to see (they fade away after a minute; they're gone next round).
      - **Lighting it**: **hold E for 2 seconds** in front of the hearth and a fire roars up. Nobody gets up or down
        the chimney until the round ends — the rungs are too hot, and whoever is in the flue falls — and the fire hurts
        anyone in it (about 20 a second in the flames, 10 a second up the flue; lit by an enemy, the kill is his).
        Smoke pours out of the chimney's top, so it's seen from outside. It goes out at the end of the round (with no
        rounds: warmup, Deathmatch, Gun Game, after 90 seconds). Gas in the living room goes up when it's lit.
    - **Creaking floorboards**: some boards and stairs creak when you step on them — even walking (Shift), and
      crouching too (a little quieter). Everyone nearby hears it, like a footstep. On the hall stairs and the cellar
      stairs only the middle of some treads creaks: keep to the wall or to the banister side and you're silent. The
      creaky spots: the hall stairs (north flight: 3rd and 6th steps; south flight: 2nd, 5th and 7th), the cellar
      stairs (4th, 8th and 12th steps), the living room (by the doorway to the kitchen, in front of the sofa, in front
      of the fireplace), the kitchen by the back door, the middle of the south-west room, upstairs the middle of the
      Terrorists' room and the way into its east part, the middle of the north room and of the bedroom.
    - **Hide in a car's trunk** (the car in the garage; not the pickup): stand behind the car, or beside its back
      end, and press **E** to climb into the trunk. Inside you see only the strip of light under the lid. Nobody sees
      you — you aren't drawn and you're never a red dot on the enemy radar (bots don't see you either) — and you can't
      shoot. Whoever drives the car takes you along. **E** jumps out (behind the car, or beside it). If a teammate
      opens the trunk he's told you're in it; if an enemy opens it, he finds you and you tumble out. If the car is
      blown up, you die with it (the kill goes to whoever blew it up). Everyone hears the lid.

In "What E does first": add "getting out of a trunk" after "out of a car"; "the fireplace (hold) and the chimney's
top" after "the floodgate's and gas valves"; "a car's trunk (from behind it)" before "cars".

Controls table, E: "… enter/exit car, car trunk, zip line on/off, CCTV desk, lift, valves, chimney (top); hold: revive
a teammate, a uniform (crouched), light the fireplace; hostage shield (T)".

For the file list at the end:

    shared/stealth.js          Stealth & hiding: the chimney's zones, the creaky spots, the trunk (both sides)
    shared/maps/mansion_stealth.js  The fireplace and chimney, the list of creaky spots
    lib/stealth.js             On the server: soot, lighting the fireplace and its fire, the trunk
    public/js/stealth.js       In the browser: the chimney's rungs, the fire, sooty footprints, creaks, the trunk's view

## (b) RESUME notes

### Files
- `shared/maps/mansion_stealth.js`: `CHIMNEY` (all its numbers, `ladder` [x, z, normal, bottom, top, width]),
  `addStealth({ carve, unface, face, brush, decor, keep })` (called once from `remodel()`), `CREAKS` (name, box
  [x1, z1, x2, z2], y, k 'step' | 'board'). It pushes one decor entry `{ type: 'stealth', chimney, creaks }` (world.js
  leaves it alone): **no change to mansion.js** and no new key on the map object.
- `shared/stealth.js`: `STEALTH` (soot 20 s, sootFrom 0.5, light 2 s, lightReach 1.4, burn { tick 0.5, fire 20, flue
  10 }, roundless 90, topReach 1.3, again 0.7, trunk { reach 1.5, behind 1.4, maxSpeed 1.5, at −1.6, low −0.2 }),
  `stealthOf(map)` (the decor entry, cached on the map), the chimney's zones `inFlue`, `upFlue`, `inFirebox`,
  `hearthFront`, `atHearth`, `atTop`, `topSpot`, `chimneyLadder(C, off)`, `creakAt(creaks, p)`, the trunk's `hasTrunk`,
  `trunkBack`, `trunkPos`, `trunkEye`, `atTrunk`, `trunkExits`.
- `lib/stealth.js`: `createStealth(deps)` → `{ reset, use, updateAct, tick, trunk, leave, pinned, unspot, carBlown,
  snap, fireLit, hearth, light, state }`. deps: `game, players, map(), world(), broadcast, send, now, applyDamage,
  killPlayer, mates, groundY, roundless(), sparkAt(pos, kind, by)`.
- `public/js/stealth.js`: `init(ctx)`, `setMap`, `onSnapshot(st)`, `local()`, `frame(dt, now, camera)`, `hint(current)`,
  `inside()`, `inTrunk()`, `progressLabel(a)`, `fireLit()`, `_debug()` (tests). ctx: `scene, me, net, hud, fx, game,
  remotes, cars, coll(), map(), replay()`.
- Tests in `dev/test-scripts/stealth/`: `t1.mjs` (chimney, server), `t2.mjs` (trunk, server), `unit.mjs`, `geom.mjs`,
  `creaks.mjs`, `clientsmoke.mjs` (`node --import ./dev/test-scripts/stealth/register.mjs …`), `srv.sh` (the test
  server on 4240/4241, `DATA_DIR` in `$SP`), `maps.mjs` (all 7 maps load), the browser test `g1.mjs` (`edge.ps1`: the
  headless Edge on CDP 9640; parts a–e, `PARTS=` to run some; `MAP=cs_mansion_night` for the night map), `views.mjs`
  + `vstealth.json` (the draw cost: a 960x540 copy of mansion/views.mjs), and the planning aids `plan.mjs` (a top-down
  ASCII plan at a height), `slice.mjs` (a vertical section), `dump.mjs`.

### Hooks in shared files (each marked `// stealth:`)
- `shared/maps/mansion2.js` (2): the import; `addStealth({ carve, unface, face, brush, decor, keep })` after the lift.
- `server.js` (15): the import; `createStealth(...)` after the flood's; `stealth.reset()` in `resetWorld`;
  `stealth.carBlown(c, attacker)` in `explodeCar`; two changed lines: `busy` gets `|| p.trunk != null`, and `onCar`'s
  run-over loop skips `q.trunk != null` (the hider is inside the car's boxes: his own car downed him);
  `fireplace` act in `updateActions`; `stealth.leave(p)` in `onUse`'s first group; `stealth.use(p, t)` after
  `gas.use`; `stealth.trunk(p, t)` before the cars; `stealth.unspot(list)` after `body.unspot`;
  `stealth.pinned(p, m, t)` in the 'state' handler after the CCTV line; `stealth.tick(t)` after `flood.tick`;
  `...stealth.snap()` in the snapshot.
- `lib/bots.js` (1): `canSee` returns null for `q.trunk != null`.
- `lib/blood.js` (1, the line changed): a bleeding hider's `bl` flags get `BL_NODROPS` (no drops under the car).
- `public/js/main.js` (10): the import; `stealth.setMap(map)` in `loadMap`; `stealth.onSnapshot(m.st)`;
  `stealth.local()` in `updateLocal` after `gadgets.local`; `stealth.hint(hint)` before the valves' hint line;
  `stealth.inside()` after the override block; the progress label; `stealth.frame(dt, now, camera)` after
  `flood.update`; the view model hidden in a trunk; `stealth.init({...})` after `flood.init`.
- Nothing in audio.js (the sounds use `floodKit()` and `audio.out`), the HUD, mansion.js or collision.js.

### Protocol and state
- Snapshot key **`st`** (only while there's something to say): `{ f: 1 while the fireplace burns, s: [[id, seconds of
  soot left], …], k: [[id, car id], …] }`.
- Messages: `{ t: 'stTo', p, c }` (the server put you somewhere: into the flue from the top, out of a trunk);
  `{ t: 'stSfx', s: 'light' | 'trunk', p }`.
- Player fields: `p.trunk` (car id or null), `p.sootUntil` (ms). Act `fireplace` (2 s, cancelled by moving 0.6 m).
  Client: `me.trunk`, remotes' `r.inTrunk`.

### How it works, and the choices made
- **The chimney's ladder** is added by the browsers (like the lift's) so the bots' grid never links through it; there
  are no nav nodes in the firebox (too narrow), so bots and the cat never walk in. While the fire burns the ladder's box
  is emptied (min = max = −1000), so a climber falls into the flames.
- **Climbing out at the top**: the rungs end 0.5 m under the rim (the climber's feet stop 0.62 m under it); W steps
  over the south rim (the climb's 1 m step-up) onto the roof. **In from the top**: E within 1.8 m of the flue on the
  roof puts you on the rungs under the rim (`stTo`, crouched) — the flue is only 5 cm wider than a body each way, so
  jumping in would be a pixel hunt.
- **Soot**: the server marks anyone whose feet are 0.5 m up the flue (`upFlue`), every tick while inside, so the 20 s
  start when he comes out (either end). Crawling into the firebox alone doesn't. Each browser drops the prints itself
  (from where it sees the player; a print every 0.42 m, left and right, toes along the walk, on the floor as drawn —
  the roof's slope too — via a copy of blood.js's floor index), one instanced mesh (240 prints), darker when fresh,
  each fading out after 60 s; cleared on a new map (and they age out).
- **The fire**: hold E 2 s in front of the hearth; it burns **until the round ends** (no putting it out — group 10's real
  fire can add that); without rounds it goes out after 90 s. Harm every 0.5 s: 20/s in the firebox (`inFirebox`), 10/s
  up the flue; `applyDamage(q, lighter if an enemy, …, 'chest', 'fireplace', 1)` (the killfeed shows [fireplace]). The
  browsers draw it with the Molotov's flames (`fx.fire('fireplace', …)`, its smoke turned off; so main.js's crackle and
  burning screen work too) and puffs out of the stack's top. It's a spark (`sparkAt(…, 'fire', lighter)`, once a
  second): gas in the living room goes up.
- **The trunk**: Mansion maps only (`TRUNK_ON` in lib/stealth.js: drop it to allow every map with cars, e.g. Dust II's).
  The hider's server position is `trunkPos` (1.6 m back, 0.2 m under the car's base), inside the car's bullet body
  (bullets stop at the body below the windows), crouched, so shots and sight don't reach him; the 'state' handler
  ignores his browser's position. Spotting skips him (`unspot`), bots don't see him (`canSee`), `busy` stops shooting,
  grenades, mines, the jammer, the drone and the mortar. In the browsers he isn't drawn (model, name tag) and his
  "footsteps" from the moving car are silenced. **An occupied trunk**: a teammate opening it is told who's inside; an
  enemy finds him (he's put out, both told). The hint is the same either way ("Press E to open the trunk and hide in
  it"). **Car destroyed**: the hider dies with it (`carBlown`, the kill to whoever blew it up, nobody's if a
  teammate). Down or playing dead in a trunk: put out of it. Not in freeze time, nor while driving, riding, on the zip
  line, at the CCTV desk, holding a hostage, down or playing dead; not into a car going faster than 1.5 m/s. E behind
  the car right outside the garage rolls the garage door instead (doors come first in E's order).
- **Creaks**: only the browsers (bots don't react to footsteps, so they don't hear creaks): each one checks itself and
  every other living player's feet against the creaky spots each frame (on a spot ±0.15 m of its height, not in water,
  not during the kill cam); stepping onto one creaks, moving on along it creaks again every 0.7 m, standing still
  doesn't. Positional, a bit louder than a footstep ([4, 1]); crouched 0.55.
- **Gas** (a quirk of box rooms): the gas system sees the flue as an opening from the living room to the bedroom's box
  above (0.31 m²) and from the south-west room's (0.20 m²), and the bedroom's box venting out of the stack (0.58 m²). The
  living room's gas after 55 s: 0.042 instead of 0.043. Left as it is (a chimney does vent a room).

### Draw cost (measured)
- The level: no new static material (the set of materials in `staticFaces` is the same as `main`'s, 32, and the
  breakable pieces' too, 23; the rungs are faces in the level's metal, the bedroom niches' new backs in wood, not the
  cabinet texture, which would have been a mesh of its own). Static triangles 6,152 → 6,402 (+250); breakable pieces
  5,021 → 5,006 (the chimney replaced 15 wall and roof chunks).
- `stealth/views.mjs` (the viewer's fixed views, a 960x540 page; `vstealth.json`), this branch / `main` (539ce42, a
  copy served on the same port), draw calls (triangles +0.45k…+1.0k in every view):

  | View | day | night |
  |---|---|---|
  | living room, facing the fireplace | 101 / 100 | 106 / 105 |
  | living room, from the east | 102 / 101 | 112 / 111 |
  | Ts' room, facing the breast | 83 / 82 | 88 / 87 |
  | bedroom, facing the wall it's in | 182 / 182 | 195 / 195 |
  | roof, south of the stack | 171 / 171 | 183 / 183 |
  | roof, from the west eave | 171 / 171 | 190 / 189 |
  | the back garden, facing the house | 319 / 319 | 339 / 339 |
  | the garage (the car) | 90 / 90 | 103 / 103 |
  | outside the garage door | 120 / 120 | 136 / 135 |

  So +0 or +1 a frame.
- In game (`g1.mjs`, this page's WebGL calls a frame, the median of 6 frames; noisy at 1–3 fps): facing the fireplace
  out 140–153 / burning 143–148 (the fire: within the noise, at most +3: the Molotov's shared flame billboards, one
  glow, the shared embers); footprints on the floor: one instanced mesh, +1 while any lie there; the trunk's view is a
  page element (59–72 calls in the dark trunk: the car's surroundings through the strip). No new lights.

## Links to wire at merge
- **Group 10 (Fire):** the lit fireplace becomes a real fire: `stealth.fireLit()`, `stealth.hearth()` (where you stand
  to light it), `stealth.light(p, t)` (light it from outside, e.g. a fire spreading in), the visual is
  `fx.fire('fireplace', …)` in `public/js/stealth.js` `fire()`, the harm zones in `lib/stealth.js` `burn()`; the stack's
  smoke could become its smoke system; the fire hose / water could put it out (`state.lit = false` + the next snapshot).
- **Blood trails:** the soot footprints use a copy of blood.js's floor index and the same instanced-mesh approach;
  merging both into one decal module would save a draw call when both are on the floor.
- **Group 3 (Power):** their roof ladder from the terrace makes the roof — and so the chimney's top — reachable from
  outside: add the sentence to the README's chimney text. Nothing to wire in code.
- **Group 2 (Walls):** bullets through walls — the chimney's solids should count as **brick** (no bullets through); and
  check a bullet through the car's body can't reach a trunk hider (he lies under the car's bullet line on purpose).
- **Group 1 (Wounds):** a downed player is put out of a trunk; dragging a body into a trunk isn't supported. Both
  branches may touch `lib/blood.js`'s `bl` flags line (mine adds `|| p.trunk != null`): keep both when merging.
- **Group 5 (Underground):** nothing (no vents in the living room). Group 10's smoke through the vents: none from the
  chimney.

## Known gaps
- The sounds (the creaks, the lid, lighting the fire) are unchecked by ear (headless: the creaks are checked from the
  events they log).
- Headless, the server burns in real time while the page falls at a few frames a second: in the browser test a
  climber 1.75 m up the flue usually dies in the flames before crawling out. At a real frame rate the fall takes
  half a second.
- The south-west room's light switch (on its side of the living room's south wall, 17 cm west of the chimney) is still
  reachable through the wall from the living room in front of the breast's west side, as it was before the chimney
  (E finds switches by distance only); from inside the fireplace E no longer reaches it.
- The trunk hider's pl row (his position inside the car) goes to every browser, as every player's does; only the
  browsers hide him.
- In the warmup the cars go back home after 20 s unused; a hider goes with his car.
- The cat counts a trunk hider as "crouched" — in the dark (the garage in a blackout) it may go and meow at the car,
  as it does at anyone hiding. Left as it is (the cat's job is giving hidden players away).
