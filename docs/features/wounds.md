# Downed & wounds (ROADMAP group 1, branch `feature/wounds`)

Four features on top of "Downed, not dead" (`body.md`), blood trails and the bandage (`blood.md`), the bet's kill credit
(`bet.md`) and the radar's spotting:
1.1 drag a downed teammate · 1.2 interrogate a downed enemy + the downed suicide · 1.3 wounds with consequences ·
1.4 the adrenaline syringe.

## STATUS
- **Done (built and server-tested), all four items, in order, each committed and pushed** (5f3b463 1.1, 68d792a 1.2,
  211696d 1.3, 0a13e0f 1.4; then this doc, the disguise words and a 'gone' check). Server tests on cs_mansion and cs_mansion_night, node tests of the shared rules, of the
  server module without a server and of the browser module with fakes (numbers under "Verified").
- **Next: the browser test** (not allowed yet when this was written: at most 2 agents with a headless Edge). What to
  look at is listed under "Browser checks". Also by browser: the draw cost (expected 0: see "Draw cost") and
  `mansion/buyhover.mjs` (the Equipment column has 9 items now; Rifles still has 10, so no column is taller).
- **No geometry** added: nothing for the other wave-1 groups to avoid.
- Left (not checked): the sounds by ear (the suicide's pistol cock is the 'draw' sound, the shot is the pistol's own),
  how the drag, the limp's dip, the sway and the blur feel at a real frame rate on a laptop.

## (a) README (for the players)

Put under **Gameplay**, right after "Play dead"; and in the controls table: **E** also "hold + walk: drag a downed
teammate; hold on a downed enemy: interrogate"; **K** also "down: hold to shoot yourself".

- **Drag a downed teammate.** Hold **E** on him (the revive starts) and **walk**: you drag him behind you, slowly
  (1.3 m/s) and with only your pistol in your other hand. Stand still with E held and the revive goes on from where it
  was; let go of E and you let go of him. He follows your path about a metre behind you (round corners, through
  doors, up the stairs), keeps bleeding (and leaves a trail), and can still shoot his pistol. It ends when either of
  you gets up or dies, when you get on a ladder, the zip line, the security desk, into a car, fly the drone or grab a
  hostage, or if you get more than 2.6 m away from him.
- **Interrogate a downed enemy.** Hold **E** on a downed enemy in front of you for **3 seconds**: he gives away the
  nearest of his teammates still on their feet, who shows on your whole team's radar for **5 seconds** (a ring with a
  "?" round his red dot). Once per downing. Then finish him if you like.
- **End it yourself.** Down and waiting for a revive, you may see an enemy coming first: **hold K for 5 seconds** and
  you shoot yourself with your pistol (let go of K to stop). Everyone sees the pistol at your head and hears the shot;
  an interrogation not yet finished gets nothing. The kill goes to whoever downed you (bets too); the feed says
  "(shot himself)".
- **Wounds.** A bullet that hurts you without dropping you leaves a wound (classic matches):
  - in the **leg**: you limp (70 % of your speed, the view dips on the bad step);
  - in the **arm** (a hit out at the side of the chest or stomach; from the side that's always the arm): your aim
    sways by itself and your shots spread more;
  - a **graze to the head** (a head hit you survive, e.g. through a helmet): your sight blurs in waves.

  They last until you die or the round ends. A **bandage (P) halves** them (P works on a fresh wound even when you've
  stopped bleeding); a new hit on a bandaged spot makes it fresh again. LEG / ARM / HEAD badges by your health show
  them (½ when bandaged). Bots limp and shoot worse too.
- **Adrenaline syringe** (buy menu, Equipment, **$400**; classic rounds on bomb and hostage maps). With one, your
  revive takes **2 seconds** instead of 5 and uses it up; but the one you revive gets up with shaking aim and blurred
  sight that fade over **20 seconds**. One at a time; a survivor keeps it into the next round; lost when you die.

## (b) RESUME notes

### Files
- `shared/wounds.js` — `WOUNDS` (all the numbers), `armSide(hit, pos, yaw)` (is a torso hit an arm hit?),
  `woundFx(w, ad)` (what the wounds and the adrenaline do: speed factor, spread, sway, blur).
- `lib/drag.js` — **the generic drag engine** (see "The drag API" below).
- `lib/wounds.js` — all the server logic: `createWounds(api)`; registers `body.onRevive` itself.
- `public/js/wounds.js` — all the browser logic: `initWounds(api)` (wraps net handlers `s`, `spawn` and the hud's
  `hint`, `progress`, `radar`), the `wounds` object of hooks, `drawSyringe(g)` for the buy menu.
- Tests: `dev/test-scripts/wounds/` — `unit.mjs` (drag engine, armSide, woundFx), `unit2.mjs` (lib/wounds.js with a
  fake server: bots' speed/spread, bandage, new life, buy rules), `clientsmoke.mjs` (public/js/wounds.js with fakes,
  under the real body.js; run with `--import ./dev/test-scripts/wounds/register.mjs`), server tests `t1.mjs` (drag),
  `t2.mjs` (interrogation, suicide), `t3.mjs` (wounds), `t4.mjs` (syringe), helpers `lib.mjs`, `srv.sh` (test server on
  4210/4211, fresh data in `$SP/testdata`).

### State (the shared contract)
- Player fields all start with `wd`: `wdUse` (E held, from the `use` messages), `wd` (`{ l, a, h }`, each 0, 0.5
  bandaged or 1 fresh), `wdAd` (`{ until, dur }` the syringe's after-effect), `wdSpeed` / `wdSpread` (what bots get:
  lib/bots.js reads them), `wdBandage` (a fresh wound to bandage: lib/blood.js reads it), `wdEndAt` (the suicide's
  shot), `wdAsked` (interrogated this downing), `wdKeep` (the revive progress a drag paused), `wdRevive` (the revive act
  this player last started), `wdShot` (where the last bullet struck, for one applyDamage), `wdHow` ('suicide' for
  body.js's bodyKill), `wdSeq`, `wdWasDown`, `wdBandAt`, `wdShotAt`.
- The syringe is `p.inv.adren` (1 or 0): in the inventory, so `freshInv` clears it on death and a survivor keeps it;
  the browser reads `me.inv.adren`.
- Act types: `wdAsk` (interrogating; the snapshot's `me.a`). The revive stays body.js's `bodyRevive`; this feature only
  adjusts a new one once (`a.wd`): `a.dur` 2000 with the syringe (`a.adren`), `a.start` moved back by the kept progress.

### Hooks in existing files (each marked `// wounds:`)
- `server.js`
  - import of `./lib/wounds.js`; `const wounds = createWounds({...})` after the `body.onPlayDead` lines.
  - `handle`: `if (wounds.handle(p, m)) return;` right after body.js's (E held for the drag, `wdDrag`, `wdEnd`; a
    dragged player's `state` only gives pitch and weapon).
  - `onUse`: `if (wounds.use(p, t)) return;` right after `body.use` (interrogation).
  - `onShoot`: `if (wounds.noFire(p, m.w)) return;` after body.js's; `wounds.shotAt(h.q, o, h.d, h.t, rewind(...).p)`
    just before a bullet's `applyDamage`.
  - `applyDamage`: `wounds.hurt(v, attacker, d, part, weapon);` after `bleed.wound`.
  - `onNade`: `if (wounds.noFire(p, k)) return;` after body.js's.
  - `onBuy`: `if (id === 'adren' && wounds.cantBuy(p)) return fail(...)` before the price; `if (id === 'adren')
    p.inv.adren = 1;` after the items. `onSell`: `if (id === 'adren') {...}` after the items.
  - `tick`: `wounds.tick(t, dt);` after `shield.update` (after the bots and hostages moved); the snapshot head gets
    `...wounds.snap(),` (the `wd` key).
- `lib/body.js`: `upHooks` + `export function onRevive(fn)` (fn(q, reviver) after a revive); `revive()` calls them;
  `died()`'s `bodyKill` says `v.wdHow || 'bled'` (so 'suicide').
- `lib/blood.js`: `bandage()` refuses "not bleeding" only without `p.wdBandage`.
- `lib/bots.js`: `fight()` `s += p.wdSpread || 0`; `move()` `speed *= p.wdSpeed || 1`.
- `shared/weapons.js`: `ITEMS.adren` ($400); `'adren'` at the end of the Equipment column.
- `public/js/main.js`: import; `initWounds({...})` **just before** `initBody` (so body.js's hint and progress
  wrappers sit over this one's: E's order); `switchSlot`: `if (wounds.blocksSlot(slot)) return;`; `computeSpread`:
  `s = wounds.spread(s)`; `updateLocal`: `speed = wounds.speed(speed)` after body.js's; `frame`:
  `wounds.frame(dt, now, camera)` after `body.camera(camera)`; `owns`: `adren`; `cantBuy`: `adren` → 'Classic only'.
- `public/js/body.js`: the kill feed's `(shot himself)` for 'suicide'; K while down no longer says "can't play dead"
  (K held is the suicide).
- `public/js/buymenu.js`: `ABOUT.adren`. `public/js/buyicons.js`: imports `drawSyringe`; draws `adren`.
- `shared/disguise.js`: the words for a disguise blown by dragging or interrogating (`drag`, `ask` in
  `DISGUISE_WHY` / `DISGUISE_THEY`); lib/wounds.js calls `disguise.reveal(p, 'drag' | 'ask')`.

### E's order (server `onUse` and the browser's hints alike)
drone → off the zip line / CCTV desk / car → **revive** (body.js; **walking with E held turns it into a drag**, see
1.1) → **interrogate a downed enemy** (wounds) → letting go of a held hostage → a lift target aimed at → grabbing a
hostage → a uniform → the valves → the old uses. The interrogation is refused where E plants or defuses the bomb, while
holding a hostage, on a gadget, in a car, with the drone. Hints: body.js's revive hint gets " · walk to drag him";
while dragging "Dragging X — stand still to revive him, let go of E to drop him"; a downed enemy in front "Hold E to
interrogate X (3 s)"; down: "Hold K to end it yourself (5 s)" ("X is interrogating you — hold K to end it first",
"X is dragging you").

### Protocol
- Client → server: `wdDrag {on: 1|0}` (walking with E held over a downed teammate / standing still again);
  `wdEnd {on: 1|0}` (K held while down / let go). E is the existing `use` message (the server notes it held).
- Server → all: `wdShot {v, w, p}` (the suicide's shot, before the kill); the snapshot's `wd` (only while there's
  something in it): `{ d: [[dragger, dragged, x, y, z]], k: [[id, 0..1]] (ending it), i: [[asker, victim, 0..1]],
  a: [ids interrogated this downing] }`.
- Server → the interrogator's team: `wdReveal {by, v, id, s}`; → the interrogated: `wdTalked {by, id}`.
- Server → the player: `wdWounds {l, a, h, ad (ms left), adT (ms), n}` (n: 'l', 'a', 'h', 'band', 'ad' or null).
- The red dot itself is the radar's own spotting (`e.spotAt[team] = t` each tick until the time is up), so it goes
  through the jammer, disguise and play-dead rules like any spot.

### Rules decided here
- **Drag:** E held + a movement key (W/A/S/D) over a downed teammate: from a revive in progress (its progress kept),
  or straight away with no revive (the body may be behind you; reach 1.8 m). The browser sends `wdDrag` (on when it
  sees a movement key while E is held and a revive runs or a downed mate is in reach; off after 0.35 s with no
  movement key and E still held). The server pulls the body along the dragger's path at 0.95 m (lib/drag.js), sets
  its facing (head first, towards the dragger: also its lying hitbox), keeps its lag-compensation history, and ignores
  the dragged player's own positions. The dragger walks at most 1.3 m/s, no jumping, pistol only (the knife if he has
  none); the server refuses other weapons and grenades. Ends: the body gets up or dies; the dragger goes down, plays
  dead, dies; a ladder (server `ladderAt`), zip line, CCTV desk, car, drone, held hostage, bandaging; E let go; the
  round no longer live; more than 2.6 m apart ('lost'); either one leaving the game. Starting a drag (or an
  interrogation) blows a disguise. The dragged body bleeds as any downed player (blood.js lists
  him; the bleed-out clock runs: only a revive pauses it).
- **Interrogation:** a downed enemy within 1.6 m, roughly in front (body.js's revive rule), once per downing, nobody
  else at it; 3 s holding E without moving (no shooting); cancelled if he's moved (dragged away) or gets up or dies.
  The one given away: **the nearest of his teammates on their feet** (not downed, not playing dead, not in our
  uniform); **the interrogator's whole team** sees him for 5 s. Nobody left: "X has nobody left to give away."
- **Suicide:** hold K while down (needs a pistol), 5 s; let go to stop; refused nothing else. The kill:
  `killPlayer(p, p, pistol)` → body.js's `died` gives it to the downer (and his weapon), `hs` false, `bodyKill`
  'suicide'. An interrogation still running on him is cancelled ("X shot himself before he talked").
- **Wounds:** only bullets (onShoot's hits; not knives, blasts, fire, falls), only when the victim stays on his feet
  (`hp > 0` after the hit), classic mode only. Legs → leg; head → graze; chest/stomach with the hit point ≥ 0.2 m
  out from the body's middle line (relative to his facing) → arm. Effects: leg 0.7× speed; arm +0.012 spread and
  0.011 rad sway; head blur up to 3 px in waves (every 6 s); bandaged: half. The browser applies them to its player
  (speed in updateLocal, spread in computeSpread, the sway moves `me.yaw/pitch` so the shots go where the view
  drifts, the blur is a CSS filter on the game canvas, only while a wave is on); the server gives bots `wdSpeed` and
  `wdSpread`. A bandage done (blood.js clears `bandageUntil`) halves every fresh wound.
- **Syringe:** $400, one at a time, classic on bomb/hostage maps (not aim_map, warmup buys allowed like everything).
  The revive with it takes 2 s; it's used up when the revive completes (a cancelled revive keeps it). The revived
  player gets the after-effect: +0.016 spread, 0.016 rad sway, 3.5 px blur waves every 3 s, fading to nothing over
  20 s. Bots never use it.

### Draw cost
Nothing is added to the scene: no meshes, materials, lights or shadows. The drag and the suicide only pose the
existing player models; the wounds are a CSS filter (blur, only during a wave), a DOM overlay (the suicide's dark
edges) and DOM badges. Expected 0 draw calls against `main` in every view; to be confirmed with `views.mjs` /
`integration/gviews.mjs` in the browser phase. The CSS blur makes the browser composite the canvas through a filter
while a wave is on (a head graze or adrenaline only): worth a look at the frame time on an Intel laptop.

### Verified (server and node, 2026-11-08; test server 4210)
- `unit.mjs` 26/26: the body trails 0.95 m behind, never faster than 1.3 × 1.6 m/s, faces the dragger; slack when the
  dragger comes back; round a corner it stays on the path; up a slope it takes the path's height; 'lost' at 4 m;
  `check` and `place`; carried by something else (the lift) it doesn't go back to the old crumbs; list/stopTarget/
  stopAll; armSide; woundFx.
- `unit2.mjs` 14/14 (lib/wounds.js, fake server): a bot shot in the leg gets `wdSpeed` 0.7, in the arm `wdSpread`
  0.012; no wound from a knife, a blast, a lethal hit or a stale shot; a bandage halves; a new life clears; the buy
  rules.
- `t1.mjs` 30/30 on cs_mansion and cs_mansion_night (drag): the revive at 0.2, walking with E held: dragging, no act,
  "Toby is dragging you to cover"; dragged 2.05 m, his own positions ignored, 0.95 m behind, `wd.d` has the body's
  position, bleeding (bl level 3), the bleed-out clock runs (0.99 → 0.9), facing the dragger; AK refused, Glock fires;
  standing still: the revive goes on from 0.24 and ends in 4.04 s (5 × 0.8 = 4.0), 30 HP; a drag with no revive
  first; E let go drops him (no revive), he stays; running off: "You lost your grip on Tango."; onto the ladder by the
  house's west side: "You can't drag him up a ladder — you let go."; finished by a shot at where the server put him
  (lag compensation): the drag ends, the kill to the shooter.
- `t2.mjs` 28/28 on both maps (interrogation, suicide): C1 downed by T2; E with him behind: nothing; in front:
  `wdAsk`, the downed man sees it (`wd.i`), no shooting; after 3 s the nearest standing CT (C2 at 4.2 m, not C3 at
  7.6 m) is on both Terrorists' radar, not the CTs'; C1 told; still there at 4.3 s, gone at 6.0 s; once per downing
  (`wd.a`); C1 holds K: `wd.k` to everyone, the shot after 5 s heard by all with his USP, bodyKill 'suicide', the kill
  to T2 with T2's Glock, hs false, the roster +1 for T2; C2 lets go of K after 2 s: it stops, he stays down; K again
  and an interrogation started 2.5 s later: he shoots himself first, no reveal, "Cathy shot himself before he talked."
- `t3.mjs` 17/17 on both maps (wounds, Glock from 17 m at a helmeted CT): leg 100 → 87 a leg wound; the
  middle of the chest nothing; 0.26 m out at the side an arm wound; the head 71 → 39 a graze; the leg again: nothing
  new; P: all three halved; a hit in the bandaged arm: fresh again; 21 s later (not bleeding, not in `bl`) P still
  bandages the fresh arm; nothing fresh and not bleeding: "You're not bleeding."; next round: all gone.
- `t4.mjs` 23/23 on both maps (syringe): $16000 → $15600, `inv.adren` 1; not twice; sold back; with it the revive
  takes 2.04 s and uses it up, the revived man gets `ad` 20000 ms, the reviver is told, 30 HP; without it 5.05 s; the
  after-effect runs out after 20 s; with it, 1 s (0.49) + a drag + standing still: up in 1.03 s, used up.
- `clientsmoke.mjs` 48/48 (browser module with fakes): wdDrag on/off from the keys, the speed cap, pistol only, the
  hints (dragging, revive + drag, dragged, down, interrogated, interrogate, already/behind: none), the dragged
  position, wdEnd on/off and its progress bar and no crawling, the interrogation's progress label, the click and the
  pose at the temple and the shot for a remote, the pose put back, the reveal's message and radar ring (not on a
  jammed radar), the limp's speed and dip, the spread, the sway (≤ 0.01 rad), the blur, bandaged halves and badges,
  a new life clears, the adrenaline's message, spread, badges, the "(adrenaline)" revive label, the syringe picture.
- Regressions on this branch (a fresh server on 4210 for each, no errors in any server log): body `t1.mjs` 57/57
  (cs_mansion), body `gadgets.mjs` 38/38 (both maps), blood `tblood.mjs` 33/33, integration `links.mjs` a–g 36/36 and
  h 4/4 (`GAS_LEAK_X=6`), shield `t-shield.mjs` 28/28, `t17cctv.mjs` 17/17, `t16zip.mjs` 14/14, disguise `t1.mjs`
  64/64 (aim_map), bet `tws.mjs` 38/38; node: blood `unit` and `clientsmoke`, disguise `unit` and `clientsmoke` all
  pass.
- Bots: `body/bots.mjs` with `BOTS=4` for 60 s on cs_mansion (2 downs, both finished by bots, 3 kills; tick avg 0.87
  ms, max 1.4 ms) and cs_mansion_night (the same counts; avg 1.05 ms, max 6.4 ms): no server errors.
- All 7 maps start with bots (2 a side, one scripted player for 12 s each): no server errors.

### Browser checks (to do; both Mansion maps, 960x540 headless Edge)
- Drag: hold E on a downed teammate, walk: the pistol in hand, slow walk, the body follows behind (head towards you,
  legs still, no crawl), the blood trail behind it; to the others: one arm reaching to the body; stand still: the
  progress bar continues from where it was; to the dragged player: the view moves with the body, "X is dragging you".
- Interrogation: the hint, the progress "Interrogating X...", then the message and the yellow ring with "?" round the
  red dot for 5 s.
- Suicide: down, hold K: the progress "Ending it — let go of K to stop", dark edges growing; to others: the pistol at
  his temple (arms.rotation (π/2, −0.35), hand turned π/2: check it reads as a pistol to the head), the cock click
  and the shot; the feed "(shot himself)".
- Wounds: the LEG/ARM/HEAD badges (½ bandaged), the limp's dip, the sway, the blur waves (and frame time with them).
- Syringe: in the Equipment column (9th, key 9) with its gold picture, the ABOUT text, ✔ when owned, the SYRINGE badge;
  `mansion/buyhover.mjs` must still pass.
- Draw calls: `integration/gviews.mjs` (living room, kitchen, cellar, street; day and night) against `main`.

### Known gaps / notes
- While dragging with E held, E's "local use" freeze in main.js (planting spot with the bomb, a mine, a satchel, the
  fuse box, a valve within reach) stops you moving, as it does for any E hold there. Rare; left as is.
- A downed bot being dragged still tries to crawl (bots ignore the drag); the server puts it back on the rope every
  tick, so it can't get away, but the trail is pulled straight for it (its own moves count as "moved by something
  else").
- The dragged player's own facing isn't his camera's: the server lays the body head first towards the dragger (and
  hits it there); he can still look and shoot anywhere.
- The interrogation's red dot comes from the spotting: if group 5 hides spots underground, it's hidden there too
  (probably right: "no radar underground").
- The suicide needs a pistol (a downed player has only the knife if he had no pistol: "You have no pistol to do it
  with.").

## Links to wire at merge
- **The drag API, for group 6 (carrying wounded hostages) and group 7 (dragging a booby-trapped corpse).** Use the one
  engine: `wounds.drag` in server.js (lib/drag.js), so nobody can be in two drags. A dragger and a target are any
  objects with `p` ([x, y, z]):
  ```js
  wounds.drag.start(dragger, target, {
    kind: 'hostage',                 // 'mate' is taken (downed teammates); list(kind) filters
    gap: 0.5, speed: 1.2, lose: 2.6, // rope length (flat m), the dragger's pace (the target moves ≤ 1.6×), let go beyond
    place(target, pos, yaw, dr) {},  // put it there (default target.p = pos); yaw: head first towards the dragger
    check(dr) {},                    // every tick, first: return a reason to end it (e.g. 'died')
    onStop(dr, why) {},              // ended: stop/stopTarget/check's reason/'lost'
    data: {},
  });
  wounds.drag.stop(dragger, why); wounds.drag.stopTarget(target, why); wounds.drag.get(dragger)
  wounds.drag.targetOf(dragger); wounds.drag.draggerOf(target); wounds.drag.list(kind)
  ```
  `wounds.tick` already ticks the engine (after the bots and hostages moved). The engine doesn't stop a drag for game
  reasons: put those in `check` (as lib/wounds.js's `checkMate` does: up or dead, round over, E let go, ladder,
  gadget, car, drone, held hostage). The browser: the snapshot's `wd.d` lists only 'mate' drags; a hostage or corpse
  drag needs its own snapshot field (or add it to `wd.d` with a kind). For a carry on the shoulder (group 6), `gap` 0
  and `place` can put the hostage on the carrier. For the corpse (group 7): the "inspect" of a booby-trapped body is
  E on it, and dragging it should set it off: start the drag from that feature's E use.
  Also exported: `wounds.dragging(p)`, `wounds.draggedBy(p)`.
- **The wound effects** (for anything that wants them, as the syringe does): `woundFx(w, ad)` in shared/wounds.js;
  the server's `wounds.woundsOf(p)` → `{ l, a, h, ad }`; the browser's `wounds.wounds()`. The syringe sets
  `p.wdAd = { until, dur }` and sends `wdWounds`; another source of shakes/blur would do the same.
- **The interrogation uses the radar spots:** `e.spotAt[team] = t` refreshed each tick for 5 s (lib/wounds.js
  `reveals`), read by server.js's `updateSpotting`. Group 5's "no radar underground" filters spots: it then hides an
  interrogated enemy underground too.
- **Body (body.md):** `body.onRevive(fn)` is new (fn(q, reviver)). The revive act may now be shorter (`a.dur` 2000)
  and start earlier (`a.start` moved back): anything reading `act.dur` should use the act's own numbers (main.js's
  progress does: `me.act.pr`).
- **Blood:** `p.wdBandage` lets P start without bleeding; blood.js's "Bandaged — the bleeding has stopped" also shows
  then (the wounds message "Wounds bandaged — half as bad now" follows).
- **Other wave-1 groups:** the car trunk (group 4) should count as "in a car" for the drag (`p.driving`/`p.riding`
  or `busy(p)`) and refuse dragging or being dragged into it unless designed; the chimney (group 4) and vents
  (group 5): a ladder-like climb should end a drag (`busy(p)` or a ladder in `MAP.ladders` does it); the cut
  elevator cable (group 3): the drag survives a lift ride (the engine drops its crumbs when the body is carried);
  bodies float up in the flood (group 2): a dragged downed body is a live player, not a corpse — leave it to the drag.
