# Hostages that make it out (fix, branch `fix/hostages`)

## STATUS
- **Fixed (server side), mansion first.** `lib/hostages.js` (the following), two small changes in `lib/nav.js` (the
  route a bot takes when it leads a hostage), tests in `dev/test-scripts/hostages/`, this doc. No browser code changed.
- **What was wrong.** On cs_mansion no hostage led by a CT ever reached the street: each one lost track at the same
  spot — the two downstairs ones on the front door's jamb (-6.8, 0.8, -2.3), the two upstairs ones on the corner of the
  upstairs doorway at (-13.7, 4.3, 8.2). Same on `main`. Causes:
  1. `updateHostages` dropped a breadcrumb as soon as the hostage was within 0.7 m of it and walked straight at the
     next one, so it cut the corner after a doorway into the jamb.
  2. The path a CT walks often passes a jamb or an open door leaf closer than a body's radius (0.35 m): the hostage
     ended up pushing head-on against a corner it only clipped by 1-7 cm, and nothing ever moved it sideways.
  3. (Found by the tests) Standing a hair inside a 3 mm floor board (the mansion's closet over the cellar stairs),
     a step pushed the body out of the far side of the whole floor — the hostage jumped 9 m, out of the house.
  4. Bots: the route a bot takes when leading a hostage could use ladders (the storm drain / tunnel), which hostages
     can't climb, and "drops" through the upstairs floor under a thin wall (a nav-grid bug), which nobody can do.
- **The fix** (cheap: only following hostages do extra work, a few box tests over the ~100 boxes near them):
  - A breadcrumb is done with once the hostage is within 0.3 m of it, or within 0.7 m **and** it has a clear straight
    walk to the next one (`clearLine`: its body sampled every 0.25 m against what it can't step onto).
  - `sideStep`: when the way ahead (0.25 m) is blocked by a corner the body only clips, it side-steps the shortest
    way round (up to 0.6 m, both ways tried, chains of wall boxes followed) while moving on; a wall head-on is left to
    the stuck rule.
  - Stuck rule: moving but less than 0.25 m in half a second → skip to the next breadcrumb (a crumb it can't get to).
    The old "lost track" rule (stuck 3 s with the leader > 6 m away, or the leader > 30 m away) is unchanged.
  - Standing a hair inside a board less than 5 cm high: stand on it; and a hostage never moves more than its top
    speed allows in a tick (if the physics would throw it further, it stays put).
  - `lib/nav.js`: a "standing" path (only used by a bot leading a hostage, `goalWhy === 'rescue'`) skips ladders and
    makes drops cost a lot (it takes the stairs when there are some; cs_assault's office needs its one drop); and a
    drop link needs a clear fall (fixes bots walking off upstairs "through" the floor, on every map).
  - Unchanged: following distance (stops 2.2 m from the leader), speeds (4.4 m/s, 5.8 beyond 7 m), the hop, idle,
    E to make it wait, rescue, the hostage-killed penalty, `lost` events, the `h.trail` / `h.leader` fields (other
    branches hook in — the shield branch's `if (h.heldBy != null) continue;` goes in at the top of the loop as before).
- **Tests (all pass, 2026-11-01; `GAME_PORT=4100`, no browser):**
  - `rescue.mjs` (live server, a scripted CT leads each hostage from it to the street at 2.5 m/s through the open
    doors, down the stairs and out of the front door): **4/4 rescued on cs_mansion** (33-37 s each) and
    **4/4 on cs_mansion_night**; `main`: 0/4. cs_assault (`DROPS=1`, hostage 0): followed and rescued (70 s).
  - `sim.mjs` (offline, the same walks against the collision world at 32 Hz): cs_mansion 4/4 at 1.5, 2.5, 4 and 5 m/s,
    with the doors opened from either side (`DOOR_SIDE=+`), and with drops allowed; cs_mansion_night 4/4;
    **cs_assault 4/4** (`DROPS=1`; `main`: 0/4, all stuck at (-6.2, -0.3, -15.0)).
  - **Tight corners**, `sim.mjs cs_mansion tour`: random walks between two spots in the house (cellar, ground floor,
    upstairs; the route hugs every corner and doorway on the way): **100/100** followed for seeds 1, 2, 3 and 7, 60/60 at
    1.2 m/s, 100/100 at 4.5 m/s, 100/100 with the doors opened the other way; `main`: 61/100 (seed 7).
  - Bots' own rescue routes (the bots' grid, `standing`): on cs_mansion they are now all walking routes (before: the
    storm-drain/tunnel ladders, a drop off the gallery, "drops" through the upstairs floor); a hostage following them
    offline at 2.5-6.3 m/s: 4/4 rescued on cs_mansion, 4/4 on cs_assault (whose route keeps its one needed drop).
  - Bots live, `botsoak.mjs` with `BOTS=4` (4 a side) on cs_mansion, 3 runs of 170-180 s, no server errors in any:
    before the `lib/nav.js` changes bots took no hostage; after the ladder/clear-fall changes 2 taken, 1 rescued; after
    the drop cost 1 taken, 0 rescued (not watched: it may have been shot). On `main` the other agent saw none rescued in
    180 s. Small numbers because most CT bots spend the round stuck in the storm drain on their way *to* the hostages
    (see "Known, not fixed").
  - The server starts on all 7 maps (2 bots a side, a scripted player in for 12 s each): no errors.
  - Cost: 168 µs per tick for 4 following hostages against 144 µs on `main` (offline bench), i.e. +0.1% of a tick.
- **Browser checks still to do** (none run, the user's rule until every agent is done):
  - Lead each of the 4 mansion hostages out by hand (and on cs_mansion_night): through the upstairs doorway at x -13,
    down the stairs, out of the front door with the door swung either way, cutting corners on purpose; the hostage
    should round jambs without a visible hitch (a short side-step at most) and never "lose track".
  - Lead one through the cellar (down the closet stairs and back up): it shouldn't vanish (the old 9 m jump).
  - Watch a bot lead a hostage on cs_mansion: it should take the stairs, not the gallery edge or a ladder.
  - cs_assault: lead one out of the office (down the drop the route needs).
  - The hostage's animation while side-stepping: it keeps facing the breadcrumb, so it may look like a short sidestep.

## README
Visible change is small (hostages no longer get stuck on door frames). If wanted, in the bots' paragraph, replace
"(around crawl spaces, which hostages can't get through)" with "(around crawl spaces and ladders, which hostages can't
get through or climb, and by the stairs rather than off a ledge)". In cs_mansion's section nothing changes.

## RESUME notes
- **Files:** `lib/hostages.js` (`blockedAt`, `clearLine`, `sideStep` at the top; in `updateHostages`: `boxes` is
  fetched once per hostage and also used by `movePlayer`; the crumb rule; the side step; after `movePlayer` the thin-board
  lift, the jump guard and the stuck rule with `h.unstickAt` / `h.unstickPos`). `lib/nav.js`: `astar` (standing: no
  ladders, drops +30) and `buildNavData` (a drop needs a clear fall).
- **Tests:** `dev/test-scripts/hostages/`
  - `rescue.mjs` — live: start the server with `PORT=4100 HTTPS_PORT=4101 MAP=cs_mansion BOTS=0 ROUND_TIME=900
    DATA_DIR=... ADMIN_PASSWORD=testpass node server.js`, then `GAME_PORT=4100 node dev/test-scripts/hostages/rescue.mjs`
    (`HOSTAGES=0,2`, `WALK=`, `DOOR_SIDE=+`, `DROPS=1` for cs_assault, `TRACE=1`).
  - `sim.mjs` — offline, seconds: `node dev/test-scripts/hostages/sim.mjs cs_mansion` (rescue) or `... cs_mansion tour`
    (`TOURS=`, `SEED=`, `WALK=`, `FROM=x,y,z TO=x,y,z` for one walk, `TRACE=1 TRACE_MS=250`, `VERBOSE=1`,
    `HOSTAGES_LIB=path` to run another version of lib/hostages.js, e.g. main's, for comparison). Its routes: the bots'
    grid with the open door leaves as walls and no ladders/jumps (drops with `DROPS=1`), smoothed like a bot's.
  - `botsoak.mjs` — live with `BOTS=4`: how often bots led a hostage, rescues, kills, round results.
- **Known, not fixed (bots, not hostages):** on cs_mansion the CT bots' way *to* the hostages often goes down the storm
  drain by the street (ladder 3, under hatch 3 at (14, 0.2, 16)) and they get stuck at its top, climbing up and down
  under the hatch for the rest of the round; that is why bots still rarely rescue anyone. Bots don't wait for a hostage
  that falls behind (it follows at up to 5.8 m/s, a bot runs ~6.3; beyond 30 m it loses track). The bots' rescue goal is
  any spot in the rescue rectangle, the tunnel under the street included (it counts: `inRescueZone` is 2D).
- **Test-only caveats:** nav paths keep only 0.12 m off walls, so the scripted CT walks closer to jambs than a real
  player can (harder than the real game). The tour uses spots below y 6 (no roofs). The scripted CT is teleported
  along the route (the server trusts a test player's position), so it never collides with anything itself.
