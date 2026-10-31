# "Downed, not dead" + "Play dead" (feature "body", branch `feature/body`)

## STATUS
- **Done:** server (`lib/body.js`), browser (`public/js/body.js`), shared numbers/hitboxes (`shared/body.js`), hooks in
  server.js, lib/bots.js, main.js; this doc.
- **Tests that exist and pass (server only):** `t1.mjs` (7 rounds, everything below), `obj.mjs` (bomb: downed carrier
  can't plant, revive, plant, defuse), `bots.mjs` (soaks: dust2 90 s, Mansion 180 s, cs_assault 200 s — no server
  errors, bots go down, crawl with the pistol and finish downed enemies).
- **Half-done:** `hostage.mjs` — the feature parts pass (a downed CT can't lead a hostage; E on a hostage still makes it
  follow), but the scripted walk to the rescue zone loses the hostage ("lost track of you") — a test-walking problem
  (the hostage code is untouched); hostage rescue end-to-end is not verified. Next step: walk slower / check where the
  hostage gets stuck, or watch bots rescue on cs_assault with normal bots.
- **Browser checks still to do:** run `g1.mjs` (see "Browser checks still to do" below); no browser test was run
  after the shooter positions were fixed.
- **Integration:** `main` gained the zip line / CCTV after this branch: on going down, release `p.zip` / `p.cctv`
  (main's applyDamage only leaves the CCTV desk when hp > 0) — e.g. via `body.onDown(...)`. See "For integration".

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

## (b) RESUME notes

### Files
- `shared/body.js` — `BODY` (all the numbers) and `rayLying(o, d, p, yaw, kind, maxT)`: hitboxes of a body lying on
  the floor, `down` (crawling on the belly, head forward, centred on the player's position) or `dead`/`deadLow` (on the
  back, feet where the player stood, head behind — matching main.js's corpse, which tips over backwards about its feet;
  `deadLow` for someone who was crouching).
- `lib/body.js` — all the server logic. `init(api)` gets what it needs from server.js; `onDown(fn)` lets other
  features react when someone goes down.
- `public/js/body.js` — all the browser logic: `initBody(api)` (wraps net handlers and hud methods) and the `body`
  object of hooks.
- Tests: `dev/test-scripts/body/` — `srv.sh` (test server on 4010/4011, fresh data in `$SP/testdata`), `t1.mjs`
  (server, 7 rounds), `g1.mjs` (browser), `bots.mjs` (bots soak), `obj.mjs` (bomb and hostage regressions).

### State (the shared contract)
- `p.downed` (boolean) and `p.playingDead` (boolean), owned here. Everything else this feature keeps on a player starts
  with `body` (`bodyBleedEnd`, `bodyBy`, `bodyWeapon`, `bodyHit`, `bodyPdUsed`, `bodyPdEnd`, `bodyRiseUntil`,
  `bodyDrops`, `bodyFakeBy`, `bodyRevive`, `bodyReviver`, …).
- Downed players are `alive` (so bullets, spotting, bots and the drone/car code all still see them) with `hp` 0.
  Someone playing dead is `alive` too; only what the other team is told says otherwise.

### Hooks in existing files (each marked `// body:`)
- `server.js`
  - imports `./lib/body.js`; `body.init({...})` right after the `BotManager` is created.
  - `applyDamage`: `body.hurt(v, attacker, weapon)` after the spawn-protection line (remembers the last enemy hit, a hit
    wakes someone playing dead); `const killed = v.hp <= 0 && !body.tryDown(...)` (the only change to the damage flow).
  - `killPlayer`: first line after `if (!v.alive) return;`: for someone down or playing dead, `body.died(...)` clears
    the state and returns who gets the kill (`killer`, `weapon`, `hs` are reassigned).
  - `spawnPlayer`: `body.reset(p)` first.
  - `handle`: `if (body.handle(p, m)) return;` before the switch (the `bodyPlayDead` message; swallows a "corpse"'s
    `state`, emotes, and all-chat).
  - `onUse`: `if (body.use(p, t)) return;` after the `!m.on` line (revive; nothing to use from the floor).
  - `onShoot`: `if (body.noFire(p, m.w)) return;` after the first check; and the two player hit tests use
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
  - import of `./body.js`; `initBody({...})` right after `const net = new Net({...})`.
  - `switchSlot`: `if (body.blocksSlot(slot)) return;`.
  - keydown switch: `case 'KeyK': body.key(); break;`.
  - `updateLocal`: `|| body.frozen()` on `frozen`, `|| body.crouched()` on `wantCrouch`, `speed = body.move(speed)`,
    `body.eye(dt)` after the eye-height line, `&& !body.frozen()` on `canFire`.
  - `frame`: `body.frame(dt, now)` after `updateRemotes`, `body.camera(camera)` after `updateCamera`,
    `if (vm && body.frozen()) vm.visible = false;` after `updateViewModel`.
- `public/js/body.js` wraps (no edits there): net handlers `s`, `kill`, `roster`, `bar`, `spawn`; hud methods `hint`,
  `progress`, `radar` (and `killfeed` only for the length of one `kill` handler call).

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

### Verified
- `t1.mjs` (server, de_dust2, 2 v 2 scripted, 7 rounds, all OK): a headshot kills outright; the last one standing
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

### Browser checks still to do (the architect's run)
Run `GAME_PORT=4010 CDP_PORT=<edge> OUT=<dir> node dev/test-scripts/body/g1.mjs` against `srv.sh MAP=de_dust2 BOTS=0
START_MONEY=16000 MAP_ROTATION=0` (it takes ~5 minutes) and look at the screenshots:
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

### Not verified / known gaps
- Nothing in the browser after browser tests were stopped (see above).
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
- Human shield (`p.shield`): call `body.onDown(p => { /* let go of p.shield */ })` from server.js after `body.init`,
  or check `p.downed` in that feature's tick.
- Blood trails (`p.bleeding`): someone down should bleed — either that feature treats `p.downed` as bleeding, or set
  `p.bleeding` in an `onDown` hook and clear it in `body.reset`/revive.
- Disguise (uniform from a really dead body, hold E 3 s): a body playing dead is `alive`, so the server must refuse
  it — but quietly, the same way it refuses any non-body (the prompt and the refusal must not tell an enemy that the
  "corpse" is alive). Downed players are alive too.
- E is shared: revive comes first in `onUse` (right after the `!m.on` line) and only when a downed teammate is within
  1.6 m and in front (or under you); the uniform, hostage grab and floodgate valve hooks should come after it.
