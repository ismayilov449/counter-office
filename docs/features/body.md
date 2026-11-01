# "Downed, not dead" + "Play dead" (feature "body", branch `feature/body`)

## STATUS
- **Finished (server side).** Server (`lib/body.js`), browser (`public/js/body.js`), shared numbers/hitboxes
  (`shared/body.js`), hooks in server.js, lib/bots.js, main.js; this doc. `main` (zip line, CCTV) is merged in
  (7fe11e5; the only conflicts were hook lines next to main's new `busy(p)` checks and imports: both kept).
- **The Mansion's gadgets (done 2026-10-31):** going down or playing dead takes you off the zip line (you let go and
  fall: the landing's fall damage finishes someone down, wakes someone playing dead) and up from the CCTV desk (back
  where you stood). From the floor (down, playing dead, getting up) E doesn't hook on, cut the cable or sit down. On a
  gadget, E works the gadget before a revive. A "corpse" falling off the zip line keeps its weapons until it lands,
  then they fall where it lies, and the server pins it there. K in mid-air (jumping, on a ladder, swimming) is refused
  in the browser ("Stand on the ground to play dead"). Server test `gadgets.mjs` (38 checks) passes on cs_mansion and
  cs_mansion_night.
- **Hostage rescue — verdict: not a regression of this feature.** `lib/hostages.js` and the hostage part of `onUse`
  are untouched (a CT's E only goes to a revive when a downed teammate lies within 1.6 m in front of him), and the
  same scripted walk (`hostage.mjs`, cs_mansion, all 4 hostages, doors opened first, a hostage-walkable path) gives
  exactly the same result on a server run from `main`'s code (a temporary worktree of origin/main, port 4012): no
  hostage reaches the street; each one loses track at the same spot — the front door's jamb (-6.8, 0.8, -2.3) for the
  two downstairs, an upstairs doorway's corner (-13.7, 4.3, 8.2) for the two upstairs. Cause (main's code):
  `updateHostages` drops a breadcrumb as soon as the hostage is within 0.7 m of it and then walks straight at the next
  one, so it cuts the corner when the leader turns right after a doorway and gets caught on the jamb. Bots: 180 s soaks
  with 5 bots a side on cs_mansion rescued none, on this branch and on main alike (both rounds ran out of time). The
  first try failed for test reasons too (the bots' grid has ladders and false drops through the Mansion's roofs, and a
  scripted CT walks through closed doors), fixed in the test. A fix, if wanted, belongs in `lib/hostages.js` (e.g.
  drop a crumb only within ~0.3 m, or skip to a later crumb only when it's in line of sight) — not this feature's file.
- **Server tests after the merge (all pass):** `t1.mjs` on cs_mansion (7 rounds; it now takes `MAP=`), `gadgets.mjs`
  on cs_mansion and cs_mansion_night, main's `t16zip.mjs` and `t17cctv.mjs`, `hostage.mjs` part 1 (a downed CT can't
  lead a hostage), bot soaks (cs_mansion 5 bots 180 s, cs_mansion 4 bots 60 s, cs_mansion_night 4 bots 120 s: no
  server errors, tick avg 0.7–2.3 ms, max 5.1 ms), the server starts on all 7 maps (with bots) without errors. Not
  re-run (the user asked for Mansion-only testing): `obj.mjs` (bomb, de_dust2 — no code it touches changed in the
  merge) and the de_dust2 / cs_assault soaks.
- **Browser-verified (2026-11-01, headless Edge 960x540, cs_mansion and cs_mansion_night; no page errors anywhere).**
  - `g1.mjs` (now on the back garden's lawn: `t1.mjs`'s layout moved by `P()`; `MAP=`, default cs_mansion): all 28
    checks pass on both maps. In the screenshots: a downed teammate crawling on his belly, head up, pistol forward,
    his name tag over him from a distance, the radar cross; "Hold E to revive Mate (5 s)" then "Reviving Mate...";
    down yourself: red edges, "YOU'RE DOWN", the bleed bar counting down, the low camera, the Glock only (1 doesn't
    take the AK), a crawl of 1.00–1.01 m/s, "Mate is reviving you" with the green bar, then 30 HP and all gone; play
    dead: eyes half closed, the view from the floor with the AK and Glock lying in front, no gun in hand, getting up
    over a second (the eyes overlay fades 0.85 → 0.05); a teammate playing dead looks like a corpse with his tag;
    as a CT: a corpse, "[world] Mate" in the feed, Mate dead on the scoreboard, the corpse getting up, "Mate was
    playing dead!".
  - New `g2.mjs` (the Mansion's gadgets in the browser, the hand checks below): all pass on both maps. K while jumping
    and on a ladder: "Stand on the ground to play dead". Shot down just after hooking on to the zip line: off the
    cable first ('letgo'), no trolley over your head, down on the deck, no hint, E does nothing; to the others he lies
    there (pose 0), not hanging. K on the zip line: off the cable, the view falls with you (eyes half closed) — over
    the deck, and 1.4 s down the cable, where the body flies on and lands on the lower roof (a 3.6 m fall, still a
    corpse, the view on that roof's floor), K gets you up. K at the CCTV desk: the camera picture closes ('left'), you
    lie on the floor by the chair, no hint, E does nothing, K gets you up. Downed at the desk: up first ('hurt'), down
    on the floor, the empty chair beside you, no hint, E does nothing. As a Terrorist: a CT playing dead on the cable
    falls as a corpse onto the lower roof, his pistol appears by the body (0.45 m) only after he lands, then he gets up
    ("C1 was playing dead!"); a CT shot down on the cable lies on the deck crawling, not hanging.
  - Fixes (d86e40e): (1) up close a downed teammate's name tag (it hangs low, right where you look) filled the view and
    covered the "Hold E to revive" hint: it now fades out from 3 m to 1.5 m (the hint names him anyway); (2) his name
    showed twice (the tag and main.js's name under the crosshair): while his tag shows, the crosshair name is left out;
    (3) main.js's aim tests (the crosshair name, the local hit feedback) used the standing hitbox, so aiming above a
    body on the floor showed his name and aiming at it didn't: they now use the lying hitboxes, as the server does
    (two marked hook lines in main.js, `body.lying(r) ? body.ray(...) : rayPlayer(...)`). Up close (under 1.5 m),
    aiming at him shows the crosshair name again.
  - The two failed checks of the first run were test faults (40f2e44): headless, the page drew a few frames a second
    and main.js caps a frame's step at 0.05 s, so the game ran slower than the clock (the crawl is measured against
    the game's own time now: 1.00 m/s); "Mate was playing dead!" shows for 3 s and was read after a slow screenshot
    (it's read first now). Also in the tests: the team buttons are clicked again until the join goes through (a cold
    page had them disabled), the page's connection is closed before rejoining in the same tab (otherwise the old
    player stayed on the server and auto-balance moved the new one to the other team), and a 960x540 page.
  - Server tests after the fixes (all pass): `t1.mjs` on cs_mansion (57 checks), `gadgets.mjs` on cs_mansion and
    cs_mansion_night (38 each). The server lists all 7 maps at start. No server code changed in this round.
- **Left:** by ear (not checked): the downed "hurt" and play-dead "death" sounds. By hand at a real frame rate: how the
  crawl reads, whether the downed camera sway is annoying, the revive/bleed text on a small laptop screen. Seen in
  passing, not this feature's: hud's `#small-msg` (top 76px) sits on top of the team bar's money line (`body.teambar`
  moves the kill feed down but not that message) — e.g. "Playing dead — K, moving or shooting gets you up" over the
  cards. Spectating a teammate who is down or playing dead still puts the camera at crouch height (see the gaps).

## (a) README

Put under **Gameplay**, after the radar red dots (and add the keys to the controls table: **K** play dead; **E** also
revives a downed teammate).

- **Downed, not dead** (classic mode on bomb and hostage maps; not on aim_map, in warmup, Deathmatch, Gun Game, Zombie
  or Hide and Seek). At 0 HP you don't die: you drop to the floor and **crawl** (about 1 m/s) with only your pistol
  (the knife if you have none). You can still shoot it. You bleed out in **30 seconds** — a red bar at the bottom of the
  screen counts down.
  - A teammate gets you up by **holding E on you for 5 seconds** (they can't shoot meanwhile; it stops if either of you
    moves away, and your bleeding pauses while they work). You get up with **30 HP**. Your teammates see a pulsing red
    cross on their radar where you lie, and "Hold E to revive …" when they stand over you.
  - Any damage while you're down kills you (an enemy "finishes" you). On the floor you're a low target: shots at
    chest height go over you.
  - **No downed state** when you're killed by a **headshot**, by anything that blows the body apart (RPG-7, RPG-26,
    mortar, HE grenade, C4, a car blowing up, a mine, the satchel, a drone dive; an AWP or M249 hit; a Scout or Desert
    Eagle headshot), or when nobody else on your team is still on their feet. Fire: going down puts the flames out,
    but lying in the fire burns you to death.
  - When nobody on your team is left standing, the downed bleed out at once, so the round ends as usual.
  - The kill feed shows "Name (down)", then "Name (finished)" or "Name (bled out)", and "[revived]". The kill goes to
    whoever finishes you; if you bleed out (or the world finishes you), to whoever downed you. Being downed and revived
    isn't a death.
  - Downed when the round ends and not finished: you survive (you keep your weapons, like any survivor).
  - Bots go down too (they crawl with the pistol) and finish downed enemies; they don't revive.
- **Play dead** (classic mode, in rounds and warmup; once a round): press **K** and you drop exactly like a real corpse,
  for up to **10 seconds**. Your weapons fall out of your hands like a real death's (anyone can take them; whatever is
  still there you pick up again when you get up).
  - The other team sees a real death: a kill in the feed (credited to the last enemy who hit you in the last 5 seconds),
    you're dead on their scoreboard and team bar, and you're never a red dot on their radar. Your teammates are told
    ("… is playing dead") and still see you alive.
  - You can't shoot, and your view is darkened at the edges (eyes half closed). **K** again, moving or shooting gets
    you up (1 second); so does a hit — the damage counts — the end of the round, or the 10 seconds running out.
  - Not as the last one standing on your team (the round wouldn't end, so it would fool nobody); if your teammates all
    fall while you're playing dead, you get up. Only team chat while playing dead.
  - Only with your feet on the ground (not in mid-air, on a ladder or swimming).
- **The Mansion's zip line and security desk:** going down or playing dead there lets go of the zip line — you fall,
  and a fall that hurts finishes you if you're down, or gets you up if you're playing dead — or gets you up from the
  security desk. You can't hook on, cut the cable or sit down from the floor.

## (b) RESUME notes

### Files
- `shared/body.js` — `BODY` (all the numbers) and `rayLying(o, d, p, yaw, kind, maxT)`: hitboxes of a body lying on
  the floor, `down` (crawling on the belly, head forward, centred on the player's position) or `dead`/`deadLow` (on the
  back, feet where the player stood, head behind — matching main.js's corpse, which tips over backwards about its feet;
  `deadLow` for someone who was crouching).
- `lib/body.js` — all the server logic. `init(api)` gets what it needs from server.js; `onDown(fn)` lets other
  features react when someone goes down, `onPlayDead(fn)` when someone starts playing dead (both called before anyone
  is told, so they can still move the player).
- `public/js/body.js` — all the browser logic: `initBody(api)` (wraps net handlers and hud methods) and the `body`
  object of hooks.
- Tests: `dev/test-scripts/body/` — `srv.sh` (test server on 4010/4011, fresh data in `$SP/testdata`; extra args are
  env vars, e.g. `srv.sh MAP=cs_mansion BOTS=0 START_MONEY=16000 MAP_ROTATION=0`), `t1.mjs` (server, 7 rounds; de_dust2,
  or `MAP=cs_mansion` / `cs_mansion_night` moves the same layout onto the back garden's lawn), `gadgets.mjs` (server,
  Mansion: the zip line and the CCTV desk), `hostage.mjs` (server, Mansion: a downed CT can't lead a hostage; leading
  every hostage to the street), `obj.mjs` (server, de_dust2: the bomb with a downed carrier), `bots.mjs` (bots soak),
  `g1.mjs` (browser, Mansion lawn: down, revive, play dead), `g2.mjs` (browser, Mansion: the zip line, the CCTV desk,
  K mid-air).

### State (the shared contract)
- `p.downed` (boolean) and `p.playingDead` (boolean), owned here. Everything else this feature keeps on a player starts
  with `body` (`bodyBleedEnd`, `bodyBy`, `bodyWeapon`, `bodyHit`, `bodyPdUsed`, `bodyPdEnd`, `bodyRiseUntil`,
  `bodyDrops`, `bodyFakeBy`, `bodyRevive`, `bodyReviver`, `bodyPdYaw`/`bodyPdC` (the corpse's facing and crouch),
  `bodyDropLater` (falling off the zip line: the weapons fall on landing), …).
- Downed players are `alive` (so bullets, spotting, bots and the drone/car code all still see them) with `hp` 0.
  Someone playing dead is `alive` too; only what the other team is told says otherwise.

### Hooks in existing files (each marked `// body:`)
- `server.js`
  - imports `./lib/body.js`; `body.init({...})` right after the `BotManager` is created (it gets main's gadget
    `busy` and `falling: p => !!p.zipFall`), then two lines: `body.onDown(...)` and `body.onPlayDead(...)` call the
    gadgets' own `zipOff(p, now(), 'letgo')` and `cctvOff(p, 'hurt' | 'left')` (main's `applyDamage` only gets you up
    from the desk while hp > 0, and `killPlayer`'s release doesn't run for someone who only goes down).
  - `applyDamage`: `body.hurt(v, attacker, weapon)` after the spawn-protection line (remembers the last enemy hit, a hit
    wakes someone playing dead); `const killed = v.hp <= 0 && !body.tryDown(...)` (the only change to the damage flow).
  - `killPlayer`: first line after `if (!v.alive) return;`: for someone down or playing dead, `body.died(...)` clears
    the state and returns who gets the kill (`killer`, `weapon`, `hs` are reassigned).
  - `spawnPlayer`: `body.reset(p)` first.
  - `handle`: `if (body.handle(p, m)) return;` before the switch (the `bodyPlayDead` message; swallows a "corpse"'s
    `state` — except while it's still falling off the zip line — emotes, and all-chat).
  - `onUse`: `if (body.use(p, t)) return;` after the `!m.on` line (revive; nothing to use from the floor — so no
    hooking on, cutting the cable or sitting at the desk; on a gadget it returns false, so E lets go / gets you up).
  - `onShoot`: `if (body.noFire(p, m.w)) return;` after the first check (main's line ending in `busy(p)`); and the two player hit tests use
    `body.lying(q) ? body.rayBody(...) : rayPlayer(...)`.
  - `onNade`: `if (body.noFire(p, k)) return;`.
  - `canBuy`: `if (body.noBuy(p)) return body.noBuy(p);`.
  - `updatePickups`: `if (p.playingDead) continue;`.
  - `sendTeamBar`: `body.fakeBar(rows)`; `sendRoster`: `body.fakeRoster(list)`.
  - `updateSpotting`: `body.unspot(list)` after the list is made.
  - `tick`: `body.tick(t)` before `updateSpotting`; `body.hidePl(pl)` after the `pl` loop; the snapshot send line gets
    `+ body.snap(p)` (the `bd` key).
  - bots API: `enemies: (a, b) => !mates(a, b) && !b.playingDead`.
- `lib/bots.js`: `weapon()` — a downed bot holds the pistol (or the knife); `fight()` — aims at 0.25 m on someone
  down; `move()` — a downed bot crawls (speed ≤ 1, crouched, no jumps or ladders).
- `public/js/main.js`
  - import of `./body.js` (after main's `createGadgets` import); `initBody({...})` right after
    `const net = new Net({...})`.
  - `switchSlot`: `if (body.blocksSlot(slot)) return;`.
  - keydown switch: `case 'KeyK': body.key(); break;`.
  - `updateLocal`: `|| body.frozen()` on `frozen`, `|| body.crouched()` on `wantCrouch`, `speed = body.move(speed)`,
    `body.eye(dt)` after the eye-height line, `&& !body.frozen()` on `canFire`.
  - `frame`: `body.frame(dt, now)` after `updateRemotes` and main's `gadgets.update(dt, now)`, `body.camera(camera)` after `updateCamera`,
    `if (vm && body.frozen()) vm.visible = false;` after `updateViewModel`.
  - `localTrace` and the crosshair-name loop in `frame`: `body.lying(r) ? body.ray(r, o, d, t) : rayPlayer(...)` (a
    body on the floor is aimed at where it lies, as the server's hit test does).
- `public/js/body.js` wraps (no edits there): net handlers `s`, `kill`, `roster`, `bar`, `spawn`; hud methods `hint`,
  `progress`, `radar`, `targetName` (no crosshair name for a lying teammate whose name tag shows) (and `killfeed` only
  for the length of one `kill` handler call).

### Protocol
- Server → all: `bodyDown {v, k, w}` (k: who downed them or null); `bodyUp {v, by}` (revived by `by`) or
  `bodyUp {v, pd: 1, why}` (got up from playing dead; why: self, hit, time, alone); `bodyKill {v, how}` just before the
  `kill` of someone who was down (how: finished, bled).
- Server → the player's team only: `bodyPlayDead {v, by}` (by: the fake killer or null).
- Server → the other team and spectators: a normal `kill` message for someone who starts playing dead
  (`k` = the last enemy who hit them within 5 s, or null with `w: 'world'`; streak 0, no first blood, no gib).
- Client → server: `bodyPlayDead {}` (K: starts, or gets up when already playing dead). Revive uses the existing `use`
  message (E held / released); the act is `p.act.type === 'bodyRevive'` (so `me.a` in the snapshot).
- Snapshot key `bd` (only when there's something in it): `{ d: [[id, bleed 0..1, revive 0..1, reviver]] | [[id]] for
  the other team, u: [[id, 0..1]] getting up from playing dead, p: [[id, fake killer]] own team playing dead }`.
  `pl`'s alive flag is 0 for someone playing dead (for everyone); their team's browsers set it back from `bd.p`, and
  do the same for the roster (alive, one death less, one kill less for the fake killer) and the team bar.

### Rules decided here
- Downed: classic mode, bomb and hostage maps (not aim_map's elimination), live rounds only — not warmup (instant
  respawn there makes it pointless), not after the round has ended (a lethal hit in the end phase kills). Plain death
  on a headshot, on anything `gibOf` would burst (explosions, AWP/M249, Scout/Deagle headshots), and when no teammate is
  standing. Any damage while down kills, friendly fire included (a teamkill if it's a teammate). Going down puts out
  burning; standing fire still burns.
- Kill credit: the finisher; the downer if they bleed out, or if the finisher is the world or themselves (or gone).
  `hs` is always false for the death of a downed player. Being downed then revived counts no death.
- Downed at round end: they survive (bleeding goes on through the 5 s end phase; spawn resets them).
- Play dead: classic mode, live rounds and warmup, once a life (= once a round). Not in Deathmatch, Gun Game, Zombie or
  Hide and Seek. Not while down, driving, piloting the drone, during an action, or as the last one standing.
- The fake death: real drops (primary, pistol, the bomb) so the body looks like a real one; the body's position, yaw
  and crouch are frozen on the server (it ignores the player's `state`), so the corpse can't turn as you look around.
  The corpse's server hitbox is the lying `dead` one, so shooting a suspicious body hits it.
- K only with the feet on the ground (the browser refuses it in mid-air, on a ladder or swimming: a corpse can't
  hang in the air) — except on the zip line.
- The Mansion's gadgets: going down on the zip line lets go of it (`zipOff … 'letgo'`: you fall with the cable's
  speed, and the landing's fall damage, like any damage while down, finishes you — the kill to whoever downed you);
  at the CCTV desk you get up first (`cctvOff … 'hurt'`, back where you stood, "Hit! You jumped up…"), then lie
  there. Playing dead does the same (`'letgo'`; `'left'` at the desk, no message); a "corpse" falling off the zip line
  keeps its weapons until it lands (`falling` = main's `p.zipFall`, cleared on landing), the server takes its
  positions until then (and the landing's fall damage wakes it: you can't dodge fall damage by playing dead), then
  pins it where it landed and drops its weapons there; its facing stays the one it had when K was pressed. From the
  floor (down, playing dead, getting up) E does nothing, so no hooking on, cutting or sitting down. On a gadget,
  `body.use` leaves E to the gadget (otherwise E at the desk with a downed teammate at your feet would start a revive
  instead of getting you up).

### Verified
- After merging main (2026-10-31), on cs_mansion (the user asked for Mansion-only testing from then on):
  - `t1.mjs` with `MAP=cs_mansion`: all 7 rounds OK (everything listed for de_dust2 below).
  - `gadgets.mjs` (cs_mansion and cs_mansion_night, 3 v 3 scripted, 38 checks, all OK): a CT shot down on the zip
    line over the street gets `zipEnd` ('letgo') before `bodyDown`, isn't hanging any more in the snapshot (pose 0),
    falls 6.8 m and the landing (16 fall damage) finishes him, the kill to the shooter (AK-47, bodyKill 'bled'); a CT
    downed while sitting at the desk gets `cctv off` ('hurt') before `bodyDown`, back where he stood, pose 0; downed,
    E at the desk, the terrace and the deck does nothing; a CT at the desk with a downed teammate at his feet: E gets
    him up (no revive); a T plays dead at the desk: `cctv off` ('left') before `bodyPlayDead`, the CTs get the kill
    and see a corpse where he stood (alive 0, pose 0), E does nothing; a CT plays dead on the zip line over the
    neighbour's roof: off the cable first, the Ts get the kill, his pistol stays with him while he falls, a 1.1 m
    drop does no damage, then the pistol lies 0.45 m from him and the server keeps the corpse where it landed (a
    position 3 m away is ignored), K gets him up with the pistol back; playing dead over the street: the 6.8 m fall
    does 16 damage and gets him up ('hit'), nothing dropped.
  - main's `t16zip.mjs` (14 checks) and `t17cctv.mjs` (17 checks): all OK on this branch.
  - `hostage.mjs` part 1 OK; part 2 (rescues) fails the same way on main — see STATUS.
  - Bot soaks (`bots.mjs`): cs_mansion 5 bots a side 180 s (2 downs, both finished by bots; round ended by time),
    cs_mansion 4 bots 60 s (1 down, finished by a bot), cs_mansion_night 4 bots 120 s (few fights in the dark): no
    server errors, tick avg 0.7–2.3 ms, max 5.1 ms. No downed bot lived 4 s in these runs (the crawl was seen in the
    earlier runs below).
  - The server starts on each of the 7 maps (with 2 bots a side, nav built) with no errors.
- Before the merge: `t1.mjs` (server, de_dust2, 2 v 2 scripted, 7 rounds, all OK): a headshot kills outright; the last one standing
  dies outright; down (bodyDown to everyone, no kill, alive with 0 HP, `bd` with bleeding for the team and only the id
  for the enemy); a shot at standing chest height misses someone down; revive (act, the reviver can't shoot, the
  bleeding pauses, up after 5 s with 30 HP); down again and finished by a shot at the body on the floor (bodyKill
  finished, kill to the finisher, no headshot); scoreboard counts; bleeding out after 30 s (the kill to the downer,
  how bled); the last one standing killed → the downed bleed out at once and the round ends "All Terrorists
  eliminated"; play dead: the CTs get a kill (k = the CT who hit him), the Terrorists get bodyPlayDead with the fake
  killer, snapshot dead to the CTs and `bd.p` to the Terrorists, no red dot, roster dead with +1 death and +1 kill for
  the fake killer, team bar dead, AK-47 and Glock dropped, a "corpse" doesn't move, can't shoot or knife, no all-chat,
  a shot at the corpse wakes him (bodyUp why hit), the damage counts, weapons back, alive again everywhere, 1 s before
  he can shoot, only once a round; the last one standing can't play dead; 10 s limit with no fake killer (k null,
  w world).
- `obj.mjs` (server, de_dust2, 2 v 2 on site A, all OK): the bomb carrier downed on the site can't plant (E does
  nothing from the floor); his teammate revives him; he plants (3 s); a CT defuses (10 s) and the round ends "Bomb has
  been defused".
- `bots.mjs` (one scripted player parked outside the map so the bots fight each other; no server errors in any run):
  de_dust2 BOTS=4 for 90 s — 1 down, it bled out, the downed bot crawled 2.7 m in 4 s crouched with its Glock; Mansion
  BOTS=5 for 180 s — 3 downs, 2 finished by bots, a downed bot crawled 4.6 m in 4 s with its Glock, rounds ended
  normally (time), tick avg 1.5–3.9 ms (max ~16 ms); cs_assault BOTS=4 (easy, 170 s rounds) for 200 s — 3 downs,
  1 finished by a bot, 2 bled out, round ended "All Terrorists eliminated" (no hostage rescued by the bots in that time).
- The server starts with all 7 maps (and builds the bots' nav for each in the background) with no errors.
- One browser run of `g1.mjs` happened before browser tests were stopped (an earlier version with a shooter standing
  inside a wall, so the "down" half didn't happen): playing dead worked in the real game — K sent it, the CTs got the
  kill, the eyes overlay went to full opacity, pressing W got the player up (bodyUp), a teammate playing dead was shown;
  no page errors.

### Browser checks (done 2026-11-01, see STATUS; how to run them again)
Each script needs a **fresh** test server (a player left over from an earlier run makes auto-balance put the browser
on the other team): `MAP=cs_mansion` or `cs_mansion_night`, `BOTS=0 START_MONEY=16000 MAP_ROTATION=0` (and
`ROUND_TIME=600` for `g2.mjs`), then `GAME_PORT=4010 CDP_PORT=<edge> MAP=<same> OUT=<dir> node
dev/test-scripts/body/g1.mjs` (~4 minutes) or `g2.mjs` (~5 minutes; screenshots `g2_*.png`). `VIEW=WxH` sets the page
size (default 960x540). What the `g1` screenshots should show:
- `g1_mate_down.png`: a downed teammate lies on his belly, head up, pistol forward, his name tag above him; the red
  pulsing cross on the radar.
- `g1_revive_hint.png` / `g1_reviving.png`: "Hold E to revive Mate (5 s)", then the progress bar "Reviving Mate...".
- `g1_down.png` / `g1_crawled.png` / `g1_being_revived.png`: the red edges, "YOU'RE DOWN", the bleed bar counting down,
  the low camera, the pistol in hand (1 doesn't take out the AK), crawling at about 1 m/s, "Mate is reviving you" with
  the green bar; `g1_revived.png`: all gone.
- `g1_playdead.png` / `g1_rising.png` / `g1_up.png`: eyes half closed, the view from the floor (no gun in hand), then
  getting up over a second.
- `g1_mate_playdead.png`: a teammate playing dead looks like a corpse with his name tag.
- Part 2 (the browser as a CT): `g1_ct_fake_corpse.png` (a corpse, a kill in the feed), `g1_ct_scoreboard.png` (Mate
  dead), `g1_ct_rising.png` / `g1_ct_up.png` (the corpse getting up, "Mate was playing dead!").
- No page errors (printed at the end of each part).
- By hand, worth a look: how the crawl reads at full frame rate; that the downed camera sway isn't annoying; the
  revive/bleed text on a small laptop screen.
- On cs_mansion (now scripted in `g2.mjs`; the server side is covered by `gadgets.mjs`):
  - shot down on the zip line: you drop off the cable (no trolley over your head any more), fall, and either die on
    landing or crawl on; others see you fall and lie on the floor, not hanging;
  - K on the zip line: the view falls with you (eyes half closed) and ends on the floor where the corpse lies; to
    the other team a corpse falls from the cable; the weapons appear by the body only after it lands;
  - K or going down at the CCTV desk: the camera picture closes (back to your own eyes), you're on the floor next to
    the chair, not sitting; the hint "Press E to sit down…" doesn't show while you're down;
  - K while jumping or on a ladder: "Stand on the ground to play dead".

### Not verified / known gaps
- In the browser: only headless (SwiftShader, a few to ~25 frames a second) and no sound; see STATUS "Left".
- Hostage rescue end to end: no scripted rescue on cs_mansion (on main either — see STATUS; a fault in
  `lib/hostages.js`, not here), and bots rescued none in 180 s (on main either).
- A real death on the zip line (main's code): `killPlayer` takes you off the cable without moving you, so a dead
  rider's body stays at cable height in the air. A play-dead "corpse" falls to the ground instead, so the two differ
  there; if main's corpse is fixed to fall, nothing changes here.
- The kill feed's "(down)", "(finished)", "(bled out)" and "[revived]" are made by decorating the existing kill feed
  (the victim's name / the weapon text); there's no icon.
- Spectating a teammate who is down or playing dead puts the camera at crouch height above his position, not on the
  floor.
- Blasts measure line of sight to a point 1 m up, as for anyone; someone lying behind a low wall can still be hurt.
- The rewind for lag compensation uses the downed player's current yaw (positions are rewound, the facing isn't).
- Clutch achievement: a teammate still down (alive) when the round is won means it isn't counted as a clutch.
- Playing dead as the last one alive is refused (it would fool nobody: the round wouldn't end); a sharp player might
  notice the missing money for a "kill" the fake gave him, or that no first-blood call came.
- Bots don't revive and don't play dead; they ignore anyone playing dead (they take the body for dead).

### For integration (other agents' features)
- Human shield (`p.shield`): call `body.onDown(p => { /* let go of p.shield */ })` from server.js after `body.init`
  (and `body.onPlayDead` too: a corpse can't hold a hostage), or check `p.downed` / `p.playingDead` in that feature's
  tick.
- Blood trails (`p.bleeding`): someone down should bleed — either that feature treats `p.downed` as bleeding, or set
  `p.bleeding` in an `onDown` hook and clear it in `body.reset`/revive.
- Disguise (uniform from a really dead body, hold E 3 s): a body playing dead is `alive`, so the server must refuse
  it — but quietly, the same way it refuses any non-body (the prompt and the refusal must not tell an enemy that the
  "corpse" is alive). Downed players are alive too.
- The zip line and the CCTV desk are wired already (see Hooks / Rules); a new gadget that holds the player should be
  released in the same two lines after `body.init` (`body.onDown` / `body.onPlayDead`) and counted in `busy(p)`.
- Bet (`lib/bet.js`): someone down at the round's end is `alive` (he survives and keeps his weapons), so "survive"
  counts him unless the user decides otherwise (open question in RESUME). Kills: `killPlayer` gets the killer already
  reassigned by `body.died` (the finisher, or the downer after a bleed-out), so a bet hook placed after that line sees
  the right one; playing dead never calls `killPlayer` (its kill is only a message to the other team), so it's no kill
  for bets as long as bets count server kills, not `kill` messages.
- Flood: a downed swimmer drowning faster can read `p.downed`. Cat: meow at `p.playingDead` (to everyone it's an
  ordinary alive player server-side; only messages to the other team say otherwise).
- Elevator: the server pins a "corpse" where it lay down (it ignores its `state`), so someone playing dead in a moving
  cab would stay behind in the air. Either move `p.playingDead` riders' `p.p` with the cab in the elevator's tick, or
  count the cab ride in `falling` (server.js's `body.init` line) so the browser's positions go through while it moves.
- E is shared: revive comes first in `onUse` (right after the `!m.on` line) and only when a downed teammate is within
  1.6 m and in front (or under you); the uniform, hostage grab and floodgate valve hooks should come after it.
