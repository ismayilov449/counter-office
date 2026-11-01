# Disguise

## STATUS
- **Done:** server, client and shared code; all hooks; server-side tests passing (`unit.mjs`, `clientsmoke.mjs`,
  `t1.mjs` 64 checks, `t2.mjs`, `t3.mjs`, `soak.mjs` / BOTS=4 with no server errors).
- **Browser-verified** (headless Edge + swiftshader, 960x540, on cs_mansion and cs_mansion_night, ports 4070/9470):
  `g1.mjs` passes every check on both maps, no page errors, no server errors; every screenshot looked at:
  - the wearer: standing over the body the hint is added to what E does there ("Press E to swap for the Glock-18 ·
    crouch + hold E for Bob's uniform": his gun lies by him), crouched "Hold E to put on Bob's uniform (3 s — ...)", the
    "Putting on the uniform..." bar, the DISGUISED message and badge, Terrorist sleeves on the arms; a shot: "DISGUISE
    BLOWN — you fired a shot", CT sleeves back, the badge gone;
  - a teammate: Alice as herself (CT model, "Alice") with the mask marker over her name tag and the "Alice is wearing
    Bob's uniform" line; the next round she's herself with no marker (the round reset; no `dg` left);
  - the fooled team: a Terrorist named "Bob" (yellow tag, aim name "Bob"), a teammate's yellow dot on the radar, the
    scoreboard unchanged (Alice a CT, "Bob dead"), no disguise message; she walks up 2.4 m in front of the viewer:
    "IMPOSTOR: Alice — ... recognised up close", her CT model and name back, a red dot on the radar;
  - at night the same, lit like everything else (the marker is a sprite: unlit, readable in the dark);
  - planting can't happen on the Mansion maps (hostage maps): it's checked by `t2.mjs` on de_dust2 (server only).
- **Draw cost against main:** with nobody disguised, none: the branch adds nothing to the scene (the client diff is
  `disguise.js` plus the main.js hooks; the sleeves are the other team's view model, already built and compiled in
  `prewarm`). A disguised teammate in view costs his team's players one draw call (the marker sprite): measured
  1.00 a frame with Alice in view, 0 after the round reset. The fooled team draws the dead player's model instead of
  the wearer's: the same cost.
- **Fixed in the browser pass (test only, no game code needed changing):** `g1.mjs` moved from aim_map to the
  Mansion's street (the CT spawn, x 27, z -18..20); the match is restarted by the admin after the browser joins (a
  player joining a live round only spawns at the next one, and the page loads slower than the 1 s freeze time); waits
  until the round messages stop (a restart while the warmup's own start is pending starts the match twice); the
  scripted Alice's message log is cleared before her second uniform (the old `disguiseOn` made the check pass at once
  and she was moved before the 3 s were up, so part 3 had no disguise); the hint check accepts the form added to the
  gun's hint; the badge check reads the badge, not the centre message; retries the team button on a cold page and
  closes the page's connection before rejoining; new checks: the marker's draw calls, the round reset, the scoreboard.
- **Server tests re-run** (after the browser pass): `unit.mjs`, `clientsmoke.mjs`, `t1.mjs` (64 checks), `t2.mjs`
  (planting breaks it, the plant goes on) pass, no server errors. `t3.mjs` (a bot holds fire at a disguised player)
  passed only now and then: Alice killed Bob with 10 pistol shots, gunfire calls bots within 32 m over (`bots.heard`),
  and the bot found her while she was changing (a hit stops it, as designed): the gunfire lets the bot see the
  shooter whichever way it looks for 2.5 s and turns it that way. Now Dave shoots Bob and runs off to a corner, and
  Alice only changes by the body; Dave shoots from 4 m towards the middle of the map (the old spot, 4 m north of the
  hidden spot, was inside one of aim_map's 6 m blocks for some of them, e.g. (-20, -4) and (-20, -24)); a round whose
  set-up still misses (the bot wanders) is a note and the next round tries again (up to 5; "the test ran" fails if
  none works). **Still flaky:** with hard bots on the small aim_map the set-up often misses (the bot finds her while
  she changes, or Bob survives Dave's shots); of the last two runs one passed in round 1 and one reached the check in
  none of its 5 rounds. The check itself passed all 4 times it was reached (over the runs): the bot had her in sight
  39/39 times over 6 s and held fire, then shot her once she'd fired. Making it steady (a quieter set-up, or the test
  on the Mansion) is left.
- **Left:** the sounds by ear (rustle, sting, zip); a real laptop's frame time; a steady `t3.mjs` (above); `p.downed` / `p.playingDead` from the
  other branches (see "Interactions for integration"). Seen, not this feature's: `hud.small` lines ("Alice is wearing
  Bob's uniform") are drawn over the team bar's money row; an admin restart during the warmup's "Game commencing"
  countdown starts the match twice (server.js `pendingStart` isn't cleared by `startMatch`).
- **Next steps (architect):** merge (see "Interactions for integration"). To re-run the browser test: a fresh server
  `SP=$TEMP/co-disguise GAME_PORT=4070 bash dev/test-scripts/disguise/srv.sh MAP=cs_mansion BOTS=0 FREEZE_TIME=1`, a
  headless Edge on 9470, then `MAP=cs_mansion SIZE=960x540 GAME_PORT=4070 CDP_PORT=9470 node
  dev/test-scripts/disguise/g1.mjs` (and the same with `cs_mansion_night`); screenshots `dg_*.png` in `OUT`.
- **Tests:** `dev/test-scripts/disguise/`: `unit.mjs` and `clientsmoke.mjs` (plain node; the latter with
  `--import ./dev/test-scripts/disguise/register.mjs`), and through `SP=<temp> bash run.sh <test> ENV...`:
  `t1.mjs` (MAP=aim_map BOTS=0 START_MONEY=16000 FREEZE_TIME=1), `t2.mjs` (MAP=de_dust2 BOTS=0 FREEZE_TIME=1),
  `t3.mjs` (MAP=aim_map BOTS=2 FREEZE_TIME=1 AUTO_BALANCE=0 ROUND_TIME=60), `soak.mjs` (MAP=de_dust2 BOTS=4 SECS=120).

## (a) README

- **Disguise** (classic matches, in a live round — not in warmup, Deathmatch, Gun Game, Zombie or Hide and Seek):
  **crouch over a dead enemy and hold E** for 3 seconds to put on their uniform. Stay crouched and still: standing up,
  moving or being hit stops it. It rustles, so anyone within about 12 m hears someone changing. Standing over a body,
  E still picks up its guns as before — crouching is what makes it the uniform. Not from a body blown apart, one already
  stripped, or someone who's only down or playing dead. One uniform per life.
  - From then on the other team takes you for the dead player: they see their own team's model and colours with **the
    dead player's name** over your head ("I thought he was dead…"), you're a teammate on their radar and never a red
    dot, and their bots don't shoot you. Your own team sees you as you are, with a small mask over your head; you see
    the enemy's sleeves on your arms and a DISGUISED badge.
  - It **breaks** the moment you fire (any gun, the mortar too), knife someone, throw a grenade or a satchel, start
    planting or defusing, get hit by one of them, go down — or when one of them **sees you up close**: within 3 m, with
    you in front of him (within 1 m he notices whichever way he looks — so you can still sneak up behind someone with
    the knife). You and the enemies within 20 m hear a sting and get the message ("IMPOSTOR: …"), and from then on
    everyone sees you as yourself again. Your team gets a line too.
  - It's lost when you die and cleared every round. The scoreboard and the team bar still list you on your own team
    (they never showed where anyone is), and the dead player is still listed as dead there — the one clue.
  - The dead player himself sees you as you are (nobody can be shown his own body walking about). Bots don't take
    uniforms.

## (b) RESUME notes

### Files
- `shared/disguise.js` — `DISGUISE` (take 3 s, reach 1.4 m / 1.2 m up or down, still 0.25 m, recognise 3 m with a
  1.0 rad half-angle, touch 1 m, reveal range 20 m, rustle range 12 m), the reason texts `DISGUISE_WHY` (for the
  wearer) / `DISGUISE_THEY` (for the enemies), `disguiseAllowed(mode, phase)` (classic and `live`).
- `lib/disguise.js` — `createDisguise({ players, game, cfg, send, lineOfSight, eyeOf })` returns `tryStart`, `act`,
  `reveal`, `onHurt`, `onDeath`, `tick`, `headFor`, `snapKey` (and `corpses` / `info` for tests). Keeps the round's
  bodies (`corpses`: id, name, team, position, spawnSeq, round, gibbed, takenBy), who wears what (`info`), the life
  each player used their uniform in (`usedSeq`) and who is changing (`acting`, for the rustle's stop).
- `public/js/disguise.js` — the wearer's badge (a div in `#hud`), the mask marker over disguised teammates (one
  canvas-texture SpriteMaterial per look, a Sprite child of the remote's model at y 2.42), the hint, the progress
  label, the reveal/on messages, the sounds (synthesised on the game's own AudioContext: `audio.out(pos).context`, so
  `audio.js` is untouched), and a smoothing for remotes that die metres from where they stood.
- Tests in `dev/test-scripts/disguise/` (see below), `run.sh` (start a server on 4070 with fresh data, run a test,
  stop that server), `lib.mjs` (scripted players that keep crouching, keep the raw snapshot, shoot; ground height and
  line of sight from the game's collision).

### Hooks in existing files (each marked `// Disguise`)
- `server.js`
  - import, and `const disguise = createDisguise(...)` right after the bots' `BotManager`;
  - `killPlayer`: `disguise.onDeath(v, gib)` after `gibOf` (the body record; a disguise is lost);
  - `applyDamage`: `disguise.onHurt(v, attacker)` after `v.hp -= d` (any hit stops the changing; a hit from the fooled
    team breaks the disguise);
  - `updateActions`: `if (a.type === 'disguise') { disguise.act(p, a, t); continue; }` after the common checks (alive,
    `live`, not walked 0.6 m off);
  - `onUse`: `if (disguise.tryStart(p, t)) return;` after the fuse box, before doors/switches/cars/guns on the floor
    (so plant, hostages, bomb/mine/satchel defusing and the fuse box come first);
  - `onShoot`: `reveal(p, 'shot')` after `p.lastShot = t` (not melee; rockets and the PKT included), and
    `reveal(p, 'knife')` before the `shot` broadcast when a knife hit a player;
  - `onMortar` (`'shot'`), `onNade` and `onSatchel` (`'nade'`): one line after the item is used up;
  - `updateSpotting`: `if (e.disguise === team) continue;` in the final loop (no red dot for the fooled team, from
    players, bots and drones alike);
  - `tick`: `disguise.tick()` before `updateSpotting`; the snapshot send line uses `disguise.headFor(p, head, pl)` and
    appends `disguise.snapKey(p)` (one line changed).
- `lib/bots.js` `canSee`: `if (q.disguise === p.team) return null;` (a bot never makes out someone in its own team's
  uniform: no target, so no shots; noises and hits only turn it).
- `public/js/main.js`
  - import; `disguise.init({ me, game, remotes, hud, refreshViewModel })` before `new Net`;
  - `refreshViewModel`: `const look = disguise.look() || (...)` (the enemy's sleeves);
  - snapshot handler `s`: `disguise.onSnapshot(m.dg)` after the players loop;
  - message handlers: `...disguise.handlers` (disguiseOn / disguiseOff / disguiseFx);
  - `specCandidates`: `disguise.watchable(r.id)` in the filter;
  - `updateHud`: `hint = disguise.hint(hint, busy)` before `hud.hint(hint)` (busy: plant, defuse, mine, satchel,
    fuse box, a hostage — what E does first), and a line after the progress chain that shows "Putting on the
    uniform..." for the `disguise` action (a second `hud.progress` call in that frame; `hud.set` caches).

### Protocol
- Snapshot key `dg` (only to the wearer's own team and spectators, only while there's something in it):
  `{ d: [[id, victim id, victim name, look (1 T / 2 CT)]], u: [ids who used theirs this life], s: [stripped body ids] }`.
  The fooled team never gets `dg`.
- The fooled team's copy of the snapshot head (`headFor`): the wearer's `pl` tuple is taken out and the dead player's
  tuple is replaced by the wearer's with the dead player's id and team code (index 0 and 9). The tuple layout is
  unchanged; at most one copy per team (plus one for each victim, who gets the truth) per tick, made by splicing the
  `"pl":[...]` part of the shared head text.
- `p.act.type === 'disguise'` (the existing `me` part of the snapshot: `{ a: 'disguise', pr }`).
- Messages: `disguiseOn` (to the wearer: `{ id, you: 1, as, look }`; to the wearer's team: `{ id, name, as, look }`),
  `disguiseOff` (wearer: `{ you: 1, why }`, why `gone` = the dead player is back or left: quiet; team: `{ id, mate: 1,
  name, why }`; enemies within 20 m: `{ id, name, as, why, p }`), `disguiseFx` (`{ k: start|stop|done, n, p }` to
  everyone within 12 m and to the dead).

### Anti-leak
- The fooled team's snapshots show the dead player alive where the wearer is, and no wearer — no `dg`, no id of the
  wearer, nothing that says "disguised"; they get no disguise message until it breaks. The client code for them is the
  ordinary code (the remote's model and name tag come from the snapshot's id and team code), so the name over his head,
  the name when aiming at him, the radar (a teammate's dot) and the killfeed (after it breaks) are all as for anyone.
- Red dots: the server leaves the wearer out of the fooled team's `sp`. Dead players of the fooled team see "every
  enemy" on the radar — the wearer isn't one in their copy.
- Spectating: `watchable` refuses anyone the scoreboard lists as dead in a classic round (only the disguised enemy can
  look like that), so a dead player of the fooled team can't watch through the wearer's eyes.
- Scoreboard / team bar / roster: unchanged — real teams; the dead player stays "dead". Decided so: moving the wearer
  on the scoreboard would show an extra player on that team, and those lists never told positions.
- The victim (dead) gets the truth (`headFor` key `team:victimId`): his own id can't be shown as a remote.
- Known tells, kept on purpose: the dead player's name over a live "teammate"; the wearer's own gun (a CT rifle in a
  Terrorist's hands); hostages following a "Terrorist"; the rustle while changing.
- Not hidden from a hacked client: the roster still says who's dead; a "dead" id walking about in the snapshot is
  the same clue the name tag gives.

### Verified (all on `feature/disguise`, ports 4070/4071, CDP 9470)
- `unit.mjs` (lib/disguise.js with fake players, no server): taking, the per-team snapshot copies, the victim's
  truth, spectators, recognition in front / behind / within 1 m, one per life, round reset, `p.downed` and
  `p.playingDead` bodies refused, going down breaks it, a body blown apart refused, the dead player coming back
  (`gone`), hits (a fall stops the changing; a teammate's hit doesn't break it, the fooled team's does), off in
  Deathmatch and warmup.
- `t1.mjs` (aim_map, 5 scripted players): see the file's header — taking (standing: nothing; crouched; moving cancels;
  the rustle start/stop), every snapshot check (no wearer, "Bob" alive where she is, no `dg` in the fooled team's text,
  the victim's and teammate's truth, `dg` contents), no red dot (with a red dot as the control before), recognition
  (looking away at 2.5 m: no; looking: yes; everyone told), one per life, the shot, a second body, cleared at round
  start, the knife from behind, the fooled team's hit, death, a T in a CT's uniform, a grenade.
- `t2.mjs` (de_dust2): a T in a CT's uniform, the CT's snapshot and radar, planting breaks it (the plant goes on).
- `t3.mjs` (aim_map, BOTS=2): a T bot with the disguised CT 6 m in front of it, in sight, holds fire for 6 s; after
  a shot it fires at her.
- `clientsmoke.mjs` (public/js/disguise.js in Node with a fake DOM and WebAudio, real three.js): hints, markers,
  badge, view-model look, the body smoothing, `watchable`, every message handler and its sounds — no errors.
- `soak.mjs` + `mansion/botsoak.mjs` (de_dust2, BOTS=4, 60–120 s, the soak player taking bot uniforms): no server
  errors; the server log lists all 7 maps.
- `g1.mjs` (headless Edge, cs_mansion and cs_mansion_night, along the street): the wearer, a teammate (marker, its one
  draw call, gone the next round), the fooled team (model, name, radar, scoreboard), the reveal; see STATUS.

### Not verified / known gaps
- The sounds by ear (rustle, sting, zip): only that they play without errors.
- `p.downed` / `p.playingDead` only in the unit test (those features aren't on this branch).
- The drone: flying it, its bomb or dive don't break a disguise (the pilot crouches with a remote far away).
- Mines, the jammer, driving: don't break it. A disguised player can lead hostages (they follow a "Terrorist").
- A hacked client could still work it out (see Anti-leak).

### Interactions for integration
- `p.downed` (revive feature): the tick reveals a downed wearer (`downed`); a downed body gives no uniform. If downing
  goes through `killPlayer`, the body record is made then and only becomes takeable once `downed` is false and
  `alive` still false (bled out).
- `p.playingDead`: such a body gives no uniform (refused silently: E falls through to the other uses, so the faker
  isn't told apart by a message). If play dead shows the player as dead in snapshots, the client's hint will offer the
  uniform on them; decide whether to hide that. A disguised player who plays dead: the fooled team would see "the dead
  player" lying where he lies — consider breaking the disguise on play dead.
- E priorities in `onUse`: mine comes after the fuse box and before doors. Reviving (5 s), grabbing a hostage and the
  floodgate valve should come before it (they aren't on dead enemies).
- Human shield (`p.shield`): grabbing someone should probably reveal (one `disguise.reveal(p, 'shield')` line; add a
  text to `DISGUISE_WHY` / `DISGUISE_THEY`).
- Snapshot send line: other features adding keys edit the same line; keep `disguise.headFor(p, head, pl)` as the head.
