# Elevator (lift in the Mansion)

## STATUS (2026-10-31, stopped because the user's session ran out)

- **Done:** `origin/main` merged in (CCTV commit 7db3a67), no conflicts. The house was surveyed (floors, walls, stairs, spawns, cellar contents) and a shaft location chosen (below). Three survey scripts are in `dev/test-scripts/elevator/`; they need no server.
- **Half-done:** nothing. **No game code has been written yet:** no `lib/elevator.js`, `public/js/elevator.js`, `shared/elevator.js` or `shared/maps/mansion_elevator.js`, and no hooks in existing files.
- **Tests that exist:** none for the lift. There are only the survey tools: `slice.mjs y [x1 x2 z1 z2 step]` (a top-down ASCII map of solids at height y: `@` static, `#` breakable, `g` glass, `D` door, `.` floor within 1.3 m below, `,` 1.3–2.5 m, blank deeper), `boxes.mjs x1 y1 z1 x2 y2 z2` (lists the boxes in a region, breakable pieces merged per piece) and `tops.mjs x z1 z2 step` (the solid intervals in a column, for stairs and slabs). There is also `server.sh` (the test server on 4090/4091 with fresh test data).
- **Browser checks still to do:** all of them. `dev/test-scripts/elevator/g-elevator.mjs` hasn't been written yet. Write it in the style of `mansion/g16zip.mjs` / `g17cctv.mjs`, with `game.mjs`.

### Chosen shaft location (from the survey: verify it with `slice.mjs` before building)
**Through the thick upstairs wall between the north corridor and the Terrorists' room, in the living room's north-west part.**
- Shaft inside: about **x −21.45…−19.80, z −5.30…−3.60** (1.65 × 1.70 m); its walls about 0.15 m thick (outer x −21.6…−19.65, z −5.49…−3.45). Pit floor at **−3.4**; the shaft's top at the upper ceiling (6.71).
- Stops: **the cellar −2.2, the ground floor 0.81 (the living room), the upper floor 4.27 (the Ts' room)**. Every door faces **south (+z)**, so the cabin needs only one door side.
- **Why here:** upstairs the shaft takes up the 1 m wall (z −5.49…−4.47) and sticks out only about 1 m into the room. It misses the hostage at (−22.25, 4.27, −3.66) by about 0.3 m, the T spawn (−22.45, −2.03) and the small object at (−18.75, −4.25). On the ground floor it stands 0.4 m west of the kitchen→living-room doorway (x −19.25…−17), so it blocks no route. In the cellar it stays 1.35 m west of the fuse box (−18.3, −0.95, −5.4) and clear of the stairs' foot (x −15.54…−13.31).
- **Things to deal with:**
  - The three barrels at (−20.9 / −20.2 / −19.5, −2.2, −4.9) stand in the shaft. Take their decor and solids out in `mansion_elevator.js` and put them back elsewhere in the cellar, e.g. along the north wall east of the fuse box.
  - The upstairs wall has an opening on its north face at x −21.84…−19.91, y 5.59…5.99 (z −5.49…−4.88). Close it, or it becomes a hole into the shaft.
  - Thin static slabs (y 4.27…4.37) lie across that corner; carve them.
  - The storey slab (y 4.06…4.27) and the cellar ceiling (0.61…0.81) have to be carved.
  - Make the shaft walls `keep` (unbreakable).
- **Rejected places:**
  - the cellar's NW corner, because the upstairs hostage spawn would be inside the shaft;
  - the south strip of the living room, because it would cut the living room ↔ south-rooms route;
  - the upstairs corridor (x −16.5…−13.5), because a shaft would leave it too narrow;
  - between the hall's two stair flights (x −13…−11.4, z −3…0), because that is how you get onto both flights (they rise north from z −3 and south from z 0);
  - next to the CCTV room, because it is too close to the desk.

### Design decided (not built yet)
- **Nav without a hook:** keep the pit floor **at or below −3.3**. Then no nav drop link reaches the pit from the ground floor (more than the 4 m DROP), and from the cellar it is a dead end that bots never path into. The shaft ladder goes on the **west wall of the shaft, x −21.45, normal +x**. Ladder-top search looks behind it for a floor, finds none at that height, and so makes no ladder link.
- **Collision:** add small marked hooks in `shared/collision.js`: `this.elev = []` in the constructor, appended in `move()`, `nade()` and `bullet()`, and tested in `raycast()` for every `what`, including 'solid', so mines can lie on the cabin floor. Mark the boxes `elev: true` so a satchel that sticks to one can be tied to the cabin in `onSatchel`.
- **Motion:** the server owns `{y0, y1, t0}` and an emergency-brake time. Position is a deterministic trapezoid: 1 m/s, 1 m/s² acceleration, a 0.4 s brake when the power is cut. Both sides compute it from `serverNow()`, the way `zipRide` is done, so a normal ride never needs a correction.
- **Riding:** before `movePlayer`, the browser moves the local player by the cabin's dy, and moves `me.viewY` by the same amount. The server does the same for bots, drops, mines and satchels (in its tick) and clamps a rider's y to the cabin floor in the 'state' handler. **Never let the cabin box move into a player:** standing on a box that has risen into you makes `movePlayer` either snap you on top of it or push you sideways out of the cabin.
- **Crush safety:**
  - Going up, the cabin stops while anyone on its roof would have under 0.9 m to the shaft top.
  - Going down, it stops above anyone in the pit or on the ladder below it.
  - In the shaft, the browser forces a crouch when there is no headroom.
  - If someone blocks the doors, they reopen.
- **Blackout:** `game.lights.power === false` brakes the cabin where it is. Prying the doors open (E, slow, loud) works only within about 0.5 m of a floor. The roof hatch (E, looking up) leads onto the cabin roof and the ladder.
- **Other details:**
  - The gas contract is a no-op `onMotorStart(pos)` hook.
  - Add a lighting room `elevator` with `power: true`, so the blackout darkens the cabin; that makes 22 of the 24 rooms.
  - Messages are `elev…`; the snapshot key is `el`.
  - Reset each round: the cabin on the ground floor, doors closed.

### Exact next steps
1. Write `shared/maps/mansion_elevator.js`: carve, the pit (`hollow`, carved to −2.19 so the cellar floor face goes), the walls with door openings, closing the opening in the wall, moving the barrels, the ladder, the room. Add one call in `remodel()` plus `elevator` in its return, and `elevator: RM.elevator` in `mansion.js`.
2. Add the shaft to `dev/test-scripts/mansion/walls.mjs` and run it (it should report 0 holes and 0 doubles). Then run `navcheck.mjs`.
3. Write `shared/elevator.js` (the motion maths, the cabin and door boxes, carry) with node unit tests, then `lib/elevator.js` and the server hooks, then `public/js/elevator.js` (one merged cabin mesh, instanced door panels, sounds) and the main.js hooks.
4. Server tests with `mansion/client.mjs` on port 4090. Then a 60 s run with BOTS=4, and the old tests (t5, t7, t8, t11, t16zip, t17cctv). Then write `g-elevator.mjs` for the architect to run.

## README (player-facing; to be written when it's built)

## RESUME notes (to be written when it's built)
- Flood contract: the shaft's footprint is x −21.6…−19.65, z −5.49…−3.45 (outer), and the pit bottom is −3.4, below the cellar floor (−2.2).
