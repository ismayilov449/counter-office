# Human shield (agent "shield", branch `feature/shield`)

## STATUS (finished on the server side 2026-10-31; browser-verified on cs_mansion and Mansion at night 2026-11-01)

**Browser-verified (2026-11-01, headless Edge 960x540, fresh test server per run, `BOTS=0 START_MONEY=16000
ROUND_TIME=600`; no page errors anywhere):**
- `g-shield.mjs`: all 42 checks pass on cs_mansion and on cs_mansion_night.
  - As a CT: "A hostage is being used as a shield!", the scream plays (its oscillators are made at the grab; heard by
    ear: not checked), the hint "A Terrorist holds this hostage as a shield" and E refused next to it, a shot at the
    T's chest from the front hits the hostage ("You hit the hostage!..."), E lets go; a head shot at the side of his
    head that shows kills the T ("HS" in the feed), the hostage is let go unhurt and the CT leads it away ("The
    hostage is following you"); shooting the held hostage dead: shieldDrop 'dead', "Viewer killed a hostage!
    (-$1500)", money $16000 → $14500.
  - As the T: the grab hint, E grabs, the Glock comes out, 1 doesn't take the AK, no ducking or jumping, 3.27 m/s
    walking with the hostage (game time), E lets go, the AK again and full speed (4.7–5.3 m/s).
  - The gadgets: holding the hostage by the zip line's terrace stand and at the CCTV desk the hint is "Press E to let
    the hostage go" and E lets go (no hooking on, no sitting down); sitting at the desk with a free hostage 1.47 m
    away, no grab hint, and E gets him up (not a grab). After letting go by the stand the hint is the grab hint (E
    grabs before hooking on there; as designed in `onUse`).
- Screenshots looked at (`sh_<map>_front/side/angle/throat/hit/released/headshot/hostage_dead/holder/holder_walked/
  terrace/desk/desk_seated.png`, plus 1280x720 close-ups from the front, both front corners and both sides): the
  hostage in front of the T leaning back, its head to his left, the T's head showing past it on his right, the pistol
  by its right shoulder; the hostage's lowered hands up in front of its throat; from the side, the T's arm stub between
  the bodies and his chest clear of its back. The night map looks the same, lit by the room's lamp.
- **Fixes (516b8e3):**
  - The arm: with `0.24 − pitch, −0.31, 0` × 1.4 only a 3–4 cm stub showed, half behind the hostage's right hand.
    Now the STATUS's alternative, `0.30 − pitch, −0.40, 0` × 1.6: about twice as much forearm at the throat, below the
    chin, under its hands; from the T's right a tan forearm is seen crossing in front of its neck. Checked at aim pitch
    0 and −1.0 (the right arm and pistol drop with the aim; the left arm stays level).
  - The holder's own view: his hostage's leaning head was 0.36 m from his eyes and filled a third of his screen (a
    big flat block cut by the near plane, a dark blob at night). In his own view it's now hidden (its shoulders and
    hands still show in front of him); everyone else sees it. (Someone spectating the holder in first person still
    sees it.)
- Test fixes (e1dc9bd): the team click is retried until the join goes through, the page's connection is closed before
  rejoining (otherwise auto-balance moved the second join), each part starts a fresh round (admin restart), the
  speeds are measured in game time (headless runs slower than the clock), the full-speed walk has 5 m of free floor
  (it walked into a wall: 0 m/s), and the side view stands in the room (x −22.9: x −25 was outside, floor 0).
  Positions use the living room's floor, 0.82.
- **Draw cost** (`g-cost.mjs`, the page as a CT 3.5 m in front of hostage 3, 4 s each, against this branch and against
  a server of `main`'s code (origin/main extracted to a temp folder; main has only ROADMAP.md beyond this branch's
  merge)): this branch held 152.9 draw calls / 473k vertices a frame; main after the same E (nothing happens there)
  154.1 / 476k. No measurable cost: nothing new is drawn, two models are posed. (Both runs show 10–20 more calls in the
  first 5 s after the round starts, on main too.)
- Server tests after the fixes (all pass, no server errors): `t-shield.mjs` 28/28 on cs_mansion and cs_mansion_night,
  `t-rescue.mjs` 5/5 on both. The server lists all 7 maps at start.
- **Left:** the scream by ear; a real-frame-rate look at the pose while the holder walks and turns. cs_assault not
  tested (the user's decision).

**State:** feature complete on cs_mansion and Mansion at night. `main` is merged in twice: zip line + CCTV (`d796da8`;
two conflicts, both kept both sides: `onNade` keeps main's `busy(p)` plus the shield line, main.js imports
`gadgets.js` and `shield.js`), then main's RESUME.md update (`a8d7475`, no conflict). In `onUse` the zip line / CCTV
checks (getting off, getting up) run before `shield.use`, the hooking on, the cutting and sitting down after it, so a
holder's E always lets go first. A hold also ends on `p.zip` / `p.cctv` (`holdBreak`, 'busy'; it can't happen through
E, a safety net), and `shieldHint` stays quiet on the zip line, at the CCTV desk, in a car or flying the drone.
All node tests were rerun after both merges (below); no code fix was needed. **cs_assault was not tested** (the user's
decision, 2026-10-31: no effort on de_dust2, cs_assault or de_inferno; see "cs_assault" below).

**Done and working (tested on cs_mansion and cs_mansion_night):**
- Server (`lib/shield.js`): grab with E (Terrorist, alive, not a bot, not downed, live or warmup, a waiting or following
  hostage within 1.6 m and in sight, a pistol in his inventory); E again lets go; the hold ends when the T dies, is
  downed (`p.downed`), leaves, changes team, the round ends, he loses his pistol, gets into a car or drone controls, or
  climbs a ladder; the hostage dying ends it too. The hostage is put 0.42 m in front of him every tick (closer when a
  wall is in the way) and set down where a body fits when let go. Only his pistol fires (AK, knife, grenades refused).
  Held-hostage hitboxes (head leaning to his left so his head shows), lag-compensated with the hostage's own short
  history. A CT who hits it is told so (killing it still costs $1500 through `hurtHostage`). CTs can't lead a held
  hostage. Bots hold fire when a held hostage is in the line of fire. Snapshot key `sh`, messages `shieldGrab` /
  `shieldDrop`.
- Browser (`public/js/shield.js`): who holds whom (from `sh`), pistol forced (slot switching blocked), no ducking or
  jumping, walking pace; the holder draws his own hostage at his predicted position; poses (the T's left forearm
  reaching to the hostage's throat, the pistol by its right shoulder; the hostage leaning back, head to his left, its
  hands up at his arm); local hit traces use the held
  hitboxes; hints (T: grab / let go; CT: "A Terrorist holds this hostage as a shield"); a synthesized muffled scream at
  the grab; the CTs' message "A hostage is being used as a shield!".

**Verified (2026-10-31, after both merges; test server on 4050, `START_MONEY=16000`, `BOTS=0` unless said):**
- `dev/test-scripts/shield/t-shield.mjs`: all 28 checks pass on cs_mansion and on cs_mansion_night (`MAP=...` for
  server and test; same hostage 3 and spots on both). The checks: grab from a CT leading it, snapshot `sh`, held in
  front, walks along, AK/knife/HE refused and the pistol fires, front shot hits the hostage with the CT's message and
  the trace ending on it, side shot hits the T, a CT's E refused, a 20° lag-compensated shot (rt) at a walking T hits
  the rewound hostage, E lets go, a CT leads it again, re-grab, a front head shot kills the T and lets it go unhurt.
- `dev/test-scripts/shield/t-rescue.mjs`: passes on cs_mansion and cs_mansion_night (held, let go, led out through
  door 1 and rescued: "Rescuer rescued a hostage!"). Before the merges it also passed with `NOSHIELD=1` (the control).
- main's gadget tests with the shield code in: `dev/test-scripts/mansion/t16zip.mjs` (zip line, 14 checks) and
  `t17cctv.mjs` (CCTV, 17 checks) pass on cs_mansion.
- 60 s with `BOTS=4` (4 per team, hard) on cs_mansion and on cs_mansion_night with no server errors: one scripted T
  grabbed hostage 3 each round and held it while the bots played round him (so the bots' hold-fire check and the held
  hitboxes ran); one hold ended with 'round', as it should. (Scratch script, not committed: like `botsoak.mjs`, plus
  `t.at([-20.5, 0.81, 9.4], 0)` and E each round.)
- The server starts on every one of the 7 maps (`MAP=` each of de_dusty, de_dust2, cs_mansion, aim_map, de_inferno,
  cs_assault, cs_mansion_night: listening, HTTP 200, no errors in the log; the banner lists all 7).
- Before the merges, `g-shield.mjs` part 1 (browser CT watching a scripted T) passed and the first pose screenshots
  were looked at (the hostage in front of the T, his head showing past its leaning head, the pistol beside it).
- The poses, by the numbers (the box rigs of `public/js/models.js` rebuilt with three.js in node and posed exactly as
  `shieldPoseRemote` / `shieldPoseHostage` do, aim pitch −1.2 to 1.2; holder's frame: his feet at 0, facing −z, the
  hostage's feet at z −0.42):
  - The holder's left arm (rotation `0.24 − pitch, −0.31, 0`, z-scale 1.4) points **straight ahead, not across**: the
    arm box's own yaw in models.js (+0.45) cancels the −0.31. It runs from (−0.02, 1.32, −0.03) to (−0.03, 1.46,
    −0.57), so its middle passes 10–13 cm deep through the hostage's upper chest (shirt/vest). That can't be avoided
    with one straight box from behind: a search over x 0–0.7, y −1.2–0, scale 1.2–1.6 found no pose that reaches the
    throat with less than 10 cm in the chest. What shows: a stub in the 5 cm gap between the two bodies (side view)
    and the last ~7 cm of the forearm in front of the hostage's throat, in the middle (x −0.08…0.02, y 1.41–1.51),
    right under the hostage's right hand (its forearm crosses his by 4.5 cm: reads as gripping it). The hostage's
    head is clear (≤1 cm) down to 0.5 rad of down-pitch; looking steeply down (−0.9…−1.2 rad) the tip rises 3–5 cm
    into its chin. Left as it was until the browser could look (2026-11-01: too little showed, so the alternative,
    `0.30 − pitch, −0.40, 0` with z-scale 1.6 shows about twice as much in front (tip at x 0.06, y 1.51, z −0.63;
    11 cm in the chest; it moves away from the hostage's hand and in front of the holder's chin), is now used.
  - The right arm and the pistol: no overlap with the hostage at any pitch. The pistol (hand at 0.30, 1.45, −0.45) is
    ~0.15 m right of the hostage's right shoulder; the head leans the other way, so it's beside the neck, not the head.
  - The held hostage's lowered arms (0.55 rad, turned in 0.35 / −0.3): only the shoulder roots overlap its own torso,
    as in every ordinary pose (player 11–13 cm, waiting hostage 9–10 cm, held 11–12.5 cm); the hand halves are clear
    (<1 cm). Its hands end at (−0.06, 1.54, −0.69) and (−0.22, 1.54, −0.74): in front of its throat, 12–17 cm ahead of
    and 8 cm above the holder's arm tip.
  - The holder's chest and the hostage's back don't touch (4–10 cm apart).

**cs_assault: not tested** (by the user's decision). The game code is map-independent and active there, but nothing
was run on it. From a first attempt, before the decision: `t-shield.mjs` finds no spot (the hostages stand in two
alcoves about 2 m wide, at x −8.5…−6.5 and x −2…0; the test needs shooters 3–4.5 m ahead, at the side and at 20°, so
it would have to walk the held hostage out into the room south of them first); `t-rescue.mjs` rejects the bots' path
for a real 3.3 m drop off the loading dock at (10.75, 2.95, −31.25) (its check is meant for the nav's false
"through the floor" drops; a following hostage falls down that ledge fine) and its straight-line walker sticks at a
corner at (−6.25, −0.31, −14.98). Both test changes were reverted; `g-shield.mjs`'s cs_assault spots are unchecked.

**Nothing is left on the server side.** Not done because they need a browser or an ear: the checks below, the
scream by ear, the frame cost (nothing new is drawn: two existing models are posed).

**Browser checks (done 2026-11-01, see the top of STATUS; how to run them again — use a fresh server per run, add
`ROUND_TIME=600`, and run `g-cost.mjs` the same way for the draw cost):**
- Server: `PORT=4050 HTTPS_PORT=4051 MAP=cs_mansion BOTS=0 START_MONEY=16000 DATA_DIR=<temp>/testdata
  ADMIN_PASSWORD=testpass node server.js`; then `GAME_PORT=4050 CDP_PORT=<cdp> OUT=<temp>/shots node
  dev/test-scripts/shield/g-shield.mjs`. Repeat with `MAP=cs_mansion_night` for both (server restarted; the script
  uses the same spots there). Never run yet in its final form: both earlier test bugs are fixed in it (the shot is a
  400 ms click; the page joins before the scripted CT). All checks should pass with no page errors.
- Look at `sh_<map>_front/side/angle/hit/released/holder/holder_walked.png`: the hostage in front of the T, his head
  showing past its leaning head, the pistol by its right shoulder; the T's left forearm: its tip should show at the
  front of the hostage's throat under the hostage's right hand (see the pose numbers above; it does pass through the
  chest out of sight; from the side only a short stub between the bodies should show); the hostage's lowered hands
  up at his arm. If it looks wrong, the alternative numbers are above. Part 2 (the page as the holder): the hint, E,
  pistol only, no AK / duck / jump, walking pace 2.5–3.5 m/s, E lets go, AK and full speed again.
- By ear: the muffled scream at a grab.
- With the gadgets merged: a T holding a hostage near the zip line's terrace stand or the CCTV desk sees "Press E to
  let the hostage go", not the gadget's hint; on the zip line or at the desk no grab hint shows.
- (cs_assault, if it's ever wanted: the node tests need the changes described above first.)

**Tests:** `dev/test-scripts/shield/` — `t-shield.mjs` (server, scripted players), `t-rescue.mjs` (rescue after
release; `NOSHIELD=1` for the control, `TRACE=1` to print the walk), `g-shield.mjs` (browser; `MAP=cs_mansion` or
`cs_mansion_night`), `g-cost.mjs` (browser: draw calls with the hostage waiting and held), `spots.mjs` and `paths.mjs` (no server: free spots round each hostage, the bots' paths from each
hostage to the rescue zone).

---

## README (player-facing text)

**Human shield** (hostage maps: cs_mansion, Mansion at night, cs_assault)
- A Terrorist presses **E** on a hostage next to him to grab it as a shield: an arm round its neck, the hostage held
  in front of him. E again lets it go; so does dying.
- While he holds it he only walks (no running, jumping or ducking) and only uses his pistol (it comes out by itself).
  Climbing a ladder or losing the pistol makes him let go.
- The hostage covers him from the front. His head shows past the hostage's, and he's open from the sides and behind.
  Bullets that hit the hostage hurt it: a CT who hits it is told so, and killing it costs $1500 as usual.
- CTs can't lead a hostage away while a Terrorist holds it. Once it's let go it's an ordinary hostage again and can
  be rescued.
- Everyone sees it, hears a muffled scream when a hostage is grabbed, and the CTs get the message "A hostage is being
  used as a shield!".
- Bots don't grab hostages; bots hold their fire while a held hostage is in the way.

## RESUME notes (how it's built)

**Files (new):**
- `shared/shield.js`: `SHIELD` (reach 1.6 m, held 0.42 m ahead, speed 0.52 of the pistol's, the head's lean: side
  0.21, back 0.06, drop 0.05), `heldSpot(p, yaw, blocked)`, `heldHitboxes(hp, yaw)`, `rayHeld(o, d, hp, yaw, maxT)`.
- `lib/shield.js`: `initShield(api)` returns `use`, `blocksShot`, `rayHostage`, `hostageHit`, `update`, `snap`.
- `public/js/shield.js`: `initShield(ctx)` (adds its handlers to `net.handlers`), `shieldSnap`, `shieldHeldBy`,
  `shieldHolding`, `shieldSlotOk`, `shieldLimitKeys`, `shieldSpeed`, `shieldRay`, `shieldHint`, `shieldPoseRemote`,
  `shieldPoseHostage`; the scream is synthesized here (with `audio.out(...)`'s context), audio.js is untouched.

**Hooks in existing files (each one line, marked "shield"):**
- `server.js`: the import; `const shield = initShield({...})` after the BotManager; `onUse` (after leaving a car):
  `if (shield.use(p, t)) return;`; `onShoot`: `if (shield.blocksShot(p, w, o, dirs)) return;` after the directions,
  in the hostage loop a held hostage uses `shield.rayHostage(...)`, after `hurtHostage` in the hits loop
  `shield.hostageHit(...)`; `onNade`: `if (p.shield != null) return;`; the tick: `shield.update(t)` after the hostage
  update; the snapshot head: `...shield.snap()`.
- `lib/hostages.js` (`updateHostages`): `if (h.heldBy != null) continue;`.
- `public/js/main.js`: the import; `initShield({...})` after `new Net(...)`; `switchSlot` (`shieldSlotOk`);
  `localTrace` (held hostages via `shieldRay`); `updateLocal` (`shieldLimitKeys(keys)` before the crouch is read,
  `speed = shieldSpeed(speed, def)` after the walk/crouch factors); `updateRemotes` (`shieldPoseRemote(r)` after the
  emotes); `updateHostageModels` (`shieldPoseHostage(h)`); the `s` handler (`shieldSnap(m.sh)`); the hint
  (`shieldHint(hint)` before `hud.hint`).

**State and protocol:**
- `p.shield`: the id of the held hostage (null, or undefined before the first grab; ids start at 0, so always test
  `!= null`). The hostage gets `h.heldBy` (holder id) and `h.shHist` (its positions for lag compensation) and keeps
  `state: 'idle'`, so round logic and the `hs` tuple are unchanged.
- Snapshot: optional top-level `sh: [[hostageId, holderId], ...]`, only while someone holds a hostage.
- Messages (server → all): `shieldGrab { id, h, p }` (p: where to play the scream), `shieldDrop { id, h, why }` (why:
  `let go`, `died`, `downed`, `dead` (the hostage), `left`, `team`, `round`, `nopistol`, `busy`, `ladder`; `h: -1`
  when a new round took the hostage away). No new client → server message: grabbing is the existing `use`.
- Key: E (the existing use key), only as a Terrorist next to a hostage, or while holding one.

**Contracts:** writes `p.shield`; reads `p.downed` (a downed T lets go, a downed player can't grab) in
`lib/shield.js` (`holdBreak`, `use`). For integration, the E order in `onUse` (checked 2026-10-31): the drone's
controls, then (`!p.alive || p.act` returns), getting off the zip line, getting up from the CCTV desk, getting out of a
car; then `shield.use`; it is consumed there, before planting, leading hostages, defusing, mines, the fuse box,
hooking on the zip line, cutting it, the CCTV desk, doors, switches and cars, but only when a T is near a free hostage
(1.6 m, in sight) or is holding one, and for a CT pressing E within 2.2 m of a held one. So the revive / uniform /
valve uses of E should go after the getting-off checks; a revive placed after `shield.use` still works for a T next to
a downed mate unless a free hostage is within 1.6 m (then E grabs it); put it before `shield.use` if that should win.

**Choices and known gaps:**
- There is no money penalty for merely hurting a hostage in the game (only $1500 for killing one), so a CT hitting a
  held hostage gets a message and the usual damage; no extra fine was added.
- Movement limits are enforced by the holder's browser (the server trusts positions, as for all movement); the server
  enforces pistol-only and no grenades. Mines, satchel, jammer, drone and mortar are blocked only by the browser's slot
  lock.
- Explosions and fire hurt the held hostage and the T separately (as before); a rocket uses the plain hostage hitbox.
- On stairs the held hostage stands at the holder's height (its feet may dip into a step).
- The holder's left arm is one straight box from his shoulder, so to show its tip at the hostage's throat it passes
  through the hostage's upper chest out of sight (about 11 cm deep with the numbers in use; see STATUS). Checked in the
  browser 2026-11-01.
- The holder doesn't see his own hostage's head (it would fill a third of his screen); a spectator watching him in
  first person does.
- Tested on cs_mansion and Mansion at night only; on cs_assault the feature is active (nothing in the code is
  map-specific) but untested, and its node tests would need changes first (STATUS, "cs_assault").
- The hostage AI's following (unchanged) sticks at tight corners on cs_mansion (e.g. the wall end at x −13.3, z 7.9,
  the fountain's low walls, a hedge at x −0.5): `t-rescue.mjs` walks a route round them; the bots' standing paths from
  the mansion's hostages also use the storm-drain or tunnel ladders, which hostages can't climb. Not this feature's
  code, noted while testing.
