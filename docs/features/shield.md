# Human shield (agent "shield", branch `feature/shield`)

## STATUS (paused 2026-10-31, work in progress)

**Done and working (tested on cs_mansion):**
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
  jumping, walking pace; the holder draws his own hostage at his predicted position; poses (the T's left arm round the
  neck, the pistol beside the hostage's head; the hostage leaning back, head to his left); local hit traces use the held
  hitboxes; hints (T: grab / let go; CT: "A Terrorist holds this hostage as a shield"); a synthesized muffled scream at
  the grab; the CTs' message "A hostage is being used as a shield!".

**Verified:**
- `dev/test-scripts/shield/t-shield.mjs` on cs_mansion: all 28 checks pass (grab from a CT leading it, snapshot `sh`,
  held in front, walks along, AK/knife/HE refused and the pistol fires, front shot hits the hostage with the CT's
  message and the trace ending on it, side shot hits the T, a CT's E refused, a 20° lag-compensated shot (rt) at a
  walking T hits the rewound hostage, E lets go, a CT leads it again, re-grab, a front head shot kills the T and lets
  it go unhurt).
- `dev/test-scripts/shield/t-rescue.mjs` on cs_mansion: a hostage that was held and let go is led out and rescued
  ("Rescuer rescued a hostage!"). Also passes with `NOSHIELD=1` (the control).
- `dev/test-scripts/shield/g-shield.mjs` part 1 (browser CT watching a scripted T): shieldGrab arrives, the CT's message
  shows, the hint and the refused E work, shieldDrop arrives, no page errors. The pose screenshots from the front, the
  side and at an angle were looked at: the hostage stands in front of the T, his head shows past its leaning head, the
  pistol beside it.
- The server starts with all 7 maps listed.

**Half-done / not verified:**
- After those screenshots the poses were tweaked (the T's left arm scaled 1.4× and aimed across the hostage's throat;
  the hostage's arms lowered to 0.55 rad and turned inwards). **Not looked at yet.**
- `g-shield.mjs` had two test bugs, both fixed in the script but **not rerun**: the browser shot used an 80 ms click
  (headless draws a few frames a second: now 400 ms), and part 2 (the browser as the holder: hint, E, pistol, no
  AK/duck/jump, walking pace 2.5–3.5 m/s, E lets go, AK and full speed again) joined the page after the scripted CT, so
  auto team balance made the page a CT (now the page joins first).
- Not run at all: cs_assault (`MAP=cs_assault` for t-shield, t-rescue and g-shield), the 60 s `BOTS=4` soak, the
  scream by ear, the frame cost (it adds nothing to draw: two existing models are posed).

**Next steps (exact):**
1. Start the test server (`PORT=4050 HTTPS_PORT=4051 MAP=cs_mansion BOTS=0 START_MONEY=16000 DATA_DIR=<temp>/testdata
   ADMIN_PASSWORD=testpass node server.js`) and a headless Edge on CDP 9450.
2. `GAME_PORT=4050 CDP_PORT=9450 OUT=<temp>/shots node dev/test-scripts/shield/g-shield.mjs`: all checks should pass;
   look at `sh_cs_mansion_front/side/angle/hit/holder*.png` and adjust the poses in `shieldPoseRemote` /
   `shieldPoseHostage` if the arm or hands look wrong (restart the server after client changes).
3. Restart with `MAP=cs_assault` and run `t-shield.mjs`, `t-rescue.mjs` and `g-shield.mjs` with `MAP=cs_assault` (the
   browser test has a cs_assault setup, untested: check its spots with `spots.mjs` if it fails).
4. `BOTS=4` for 60 s on cs_mansion (e.g. `dev/test-scripts/mansion/botsoak.mjs`) with no server errors; check
   de_dust2 still loads.
5. Fill in the "Verified" lines below, then commit and push.

**Tests:** `dev/test-scripts/shield/` — `t-shield.mjs` (server, scripted players), `t-rescue.mjs` (rescue after
release; `NOSHIELD=1` for the control, `TRACE=1` to print the walk), `g-shield.mjs` (browser), `spots.mjs` and
`paths.mjs` (no server: free spots round each hostage, the bots' paths from each hostage to the rescue zone).

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
`lib/shield.js` (`holdBreak`, `use`). For integration: E is consumed by `shield.use` before planting, doors, switches
and cars, but only when a T is near a free hostage or is holding one (and for a CT pressing E next to a held one), so
the revive / uniform / valve uses of E should be ordered with that in mind.

**Choices and known gaps:**
- There is no money penalty for merely hurting a hostage in the game (only $1500 for killing one), so a CT hitting a
  held hostage gets a message and the usual damage; no extra fine was added.
- Movement limits are enforced by the holder's browser (the server trusts positions, as for all movement); the server
  enforces pistol-only and no grenades. Mines, satchel, jammer, drone and mortar are blocked only by the browser's slot
  lock.
- Explosions and fire hurt the held hostage and the T separately (as before); a rocket uses the plain hostage hitbox.
- On stairs the held hostage stands at the holder's height (its feet may dip into a step).
- The hostage AI's following (unchanged) sticks at tight corners on cs_mansion (e.g. the wall end at x −13.3, z 7.9,
  the fountain's low walls, a hedge at x −0.5): `t-rescue.mjs` walks a route round them; the bots' standing paths from
  the mansion's hostages also use the storm-drain or tunnel ladders, which hostages can't climb. Not this feature's
  code, noted while testing.
