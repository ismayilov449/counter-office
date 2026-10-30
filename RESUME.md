# RESUME POINT — Counter-Office feature plan (stopped 2026-10-30)

**To continue:** check out branch `resume/2026-10-30` and tell Claude Code:
*"Read RESUME.md and continue the plan from the resume point."*

Work stopped because the old laptop was too slow to run three agents and their test browsers at once. Everything
done so far is on the branch `resume/2026-10-30`, which is `main` plus both feature branches, merged and tested
together. `main` itself only has steps 1 and 4. The branches `feature/t-weapons` and `feature/mansion` are kept as backups.

---

## 1. Where things stand (9 of 15 steps done)

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
| 11 | Mansion: garage | ⬜ not started | |
| 12 | Mansion: neighbour's house | ⬜ not started | |
| 13 | Mansion: back garden | ⬜ not started | |
| 14 | Mansion at night | ⬜ not started | |
| 15 | FPV drone (T) | ⬜ not started (do it last) | |

Merge commits on this branch: `5d335cd` (feature/mansion) and `34e90ed` (feature/t-weapons; the jammer/satchel
conflicts were resolved by keeping both).

**Nothing is half-done.** Both agents stopped after finishing a step, so there are no WIP commits. The next job is step 11.

### Post-merge check (on the old laptop, Mansion, headless Edge)
The merged build starts, and Mansion loads. A Terrorist bought the jammer, satchel and RPG-26 together ($16,000 → $10,500),
put the jammer down and threw the satchel, which stuck. There were no page errors.

**Not re-checked after the merge:** setting off the satchel with the phone, and firing the RPG-26. Headless clicks were
missed during the weapon draw. Both passed on their own branches, but **do this check first on the new laptop**, by hand
in a real browser.

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

### Known problems to watch
- **Mansion load time:** building Mansion takes about 1.3× as long as before. That was measured on an overloaded
  machine, so **profile it** on a normal laptop.
- **Lighting rooms:** Mansion now has 22 of the 24 allowed in `public/js/roomlight.js`. Two were freed by merging the halves
  of `lampa6` and `lampa7`. The garage and neighbour's house will need care, or the limit raised.
- **Map bounds** are still ±29.2. Growing them (steps 12 and 13) shrinks everything on the radar and affects the mortar
  map, the sky grid and nav.
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

- `dev/test-scripts/` holds the test scripts used so far. They are copies; their paths and ports are hardcoded to the old
  laptop's temp folder, so fix the paths before using them.
  - `restart.sh`: the test server on :3999 with fresh test data. `restart-mansion.sh` and `restart-tweapons.sh` are the agents' variants.
  - `roofmortar.mjs`, `mortarmap.mjs` and `mergetest.mjs`: the CDP browser-test pattern. Inject a WebSocket wrapper, join a team, fake
    pointer lock, send synthetic mouse and key events, take screenshots, collect page errors.
  - `spottest.mjs`/`spotbrowser.mjs` (radar), `jamtest.mjs`/`jambrowser.mjs` (jammer), `tw-*.mjs` (RPG-26 and satchel;
    `tw-lib.mjs` is the helper).
  - `mansion/`: `client.mjs` (a scripted player over WebSocket), `walk.mjs` (walks a body through the map with the game's
    physics), `views.mjs` + `viewer.js` + `v*.json` (screenshots from fixed views), `navcheck.mjs`, `sky.mjs`, `load.mjs`,
    and the tests `t5`/`t7`/`t8.mjs`.
- **Headless Edge:**
  `msedge.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<temp>\edge-profile --enable-unsafe-swiftshader --use-angle=swiftshader --no-first-run --window-size=1280,720 about:blank`
- **Useful server env vars:** `MAP=cs_mansion`, `BOTS=0..8`, `START_MONEY=16000`, `GAME_MODE`, `DEBUG_TICK=1` (tick times),
  `PORT`, `HTTPS_PORT`, `DATA_DIR`.
