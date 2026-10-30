# Counter-Office

A Counter-Strike 1.6 style multiplayer FPS that runs in the browser. One machine hosts the
server; everyone else on the office network just opens a URL. No installs for players. Models, textures and
sound effects are generated in code; the voice lines are the CS 1.6 originals in `public/sounds/`.

## Hosting

Requires Node.js 18+ on the host machine.

```
npm install
npm start
```

or double-click `start-server.bat`. The console prints the addresses to share:

```
Recommended (fullscreen blocks browser shortcuts like Ctrl+W):
  https://10.50.200.23:3443
Plain HTTP:
  http://10.50.200.23:3000
```

**Use the HTTPS address.** Browsers only let a page block shortcuts such as Ctrl+W, Ctrl+T and Esc
(Keyboard Lock API) when it is fullscreen *and* served over HTTPS. The server creates a
self-signed certificate in `certs/` on first start, so each player sees a certificate warning once:
click **Advanced → Continue**. In fullscreen, hold **Esc** to leave.

**Windows firewall:** allow Node.js on private/domain networks when asked, or open TCP ports
3000 and 3443 inbound.

**Join page:** put the address of the players' join page (a claude.ai page with a Join button) in
`data/join-page.txt`. On every start the server then copies the game's link and opens that page. Press **Ctrl+V**
there and everyone's Join button points at the new link. Players just keep that page bookmarked.

## Admin panel

Open **`/admin`** on the server address (for example `https://10.50.200.23:3443/admin`), or click **Admin panel** in
the Esc menu. The password is printed in the server window when it starts. It is generated on the first start and saved
in `data/admin.json`, where you can change it (or set `ADMIN_PASSWORD`). From the panel you can:

- switch the **game mode** (Classic, Gun Game, Zombie mode, Deathmatch or Hide and Seek; the match restarts),
- set the **bots**: how many players each team is filled up to (off, 1 vs 1 … 10 vs 10) and their level (easy, normal, hard),
- turn on **party modes** (low gravity, headshots only, big heads, one weapon for everyone),
- change the start money, rounds to win, round/freeze/buy time, C4 timer, friendly fire, auto team balance, halftime
  and map rotation (saved in `data/settings.json`; round times apply from the next round, start money from the next match),
- **restart the match**, **change the map** now, send a message to everyone,
- see everyone's team, kills, deaths and ping, **move** a player to T / CT / spectators, or **kick** them.

Five wrong passwords lock the panel for a minute for that computer.

## Settings

Settings saved from the admin panel (or the Esc menu) win over these environment variables. Delete
`data/settings.json` to go back to them. Set environment variables before starting (PowerShell:
`$env:MAP="cs_mansion"; npm start`):

| Variable        | Default    | Meaning                                       |
|-----------------|------------|-----------------------------------------------|
| `PORT`          | 3000       | HTTP port                                     |
| `HTTPS_PORT`    | 3443       | HTTPS port                                    |
| `MAP`           | de_dusty   | Starting map (`de_dusty`, `de_dust2`, `cs_mansion`, `aim_map`, `de_inferno`, `cs_assault`) |
| `MAP_ROTATION`  | on         | `0` keeps the same map after a match ends     |
| `ROUNDS_TO_WIN` | 10         | Rounds needed to win the match                |
| `ROUND_TIME`    | 115        | Round length in seconds                       |
| `FREEZE_TIME`   | 3          | Freeze/buy time at round start                |
| `BUY_TIME`      | 25         | Seconds after freeze time you can still buy   |
| `BOMB_TIME`     | 40         | C4 timer                                      |
| `START_MONEY`   | 800        | Money at match start (players can also change it in the Esc menu; saved in `data/settings.json`) |
| `FRIENDLY_FIRE` | off        | `1` to enable                                 |
| `GAME_MODE`     | classic    | `gungame` Gun Game, `zombie` Zombie mode, `deathmatch` Deathmatch, `hns` Hide and Seek |
| `BOTS`          | 8          | Fill each team up to this many players with bots (8 = 8 vs 8); `0` turns bots off |
| `BOT_LEVEL`     | hard       | Bot level: `easy`, `normal` or `hard` |
| `DM_FRAGS`      | 30         | Deathmatch: kills to win |
| `DM_MINUTES`    | 10         | Deathmatch: time limit in minutes |
| `AUTO_BALANCE`  | on         | `0` turns off auto team balance               |
| `HALFTIME`      | on         | `0` turns off the halftime side switch        |
| `ADMIN_PASSWORD`| generated  | Password for `/admin` (otherwise `data/admin.json`) |
| `DATA_DIR`      | `data`     | Folder for stats, settings and the admin password |

## Maps

- **de_dusty** — desert map: B lane, mid with doors, A lane; sites at the CT end.
- **de_dust2** — the CS 1.6 classic, converted from the original level (`de_dust2_hns.bsp`): the real walls, sloped
  mid and ramps, both tunnels to B, long doors and the pit, the catwalk and short stairs to A, mid doors, and the
  roofed CT base. Terrorists start in the south, CTs in the covered base in the north; A is north-east, B
  north-west. (The hide-and-seek extras in that file — ladders, grates, teleports, secret passages — are not used.)
  Office changes: the lower tunnel west of mid is walled off, the pit inside the long doors is filled in, and two
  cars you can drive or blow up stand on the way up to A from long and in front of B.
- **cs_mansion** — hostage rescue, converted from the original CS 1.6 `cs_mansion.bsp` (same walls, rooms,
  stairs, furniture, fountain plaza, hedges, shed and street), on a bright sunny day.
  - Terrorists start **upstairs** in the mansion with the hostages; CTs start on the **street** east of
    the estate. A CT presses **E** on a hostage to make it follow and leads it to the street (rescue
    zone); E again tells it to wait.
  - CTs win by rescuing every living hostage or eliminating the Terrorists; Terrorists win by
    eliminating the CTs or running out the clock. Rescue: +$1000 for the rescuer, +$150 for the other
    CTs. Killing a hostage costs $1500.
  - Three **doors** lead into the house: the **front door** (porch), the **left door** (south side) and the
    **kitchen back door** (west, behind the house, up three stone steps). Press **E** to open or close them — they
    swing away from you, creak, and won't swing into someone standing in the way. The back door is old and stiff:
    it takes 1.6 seconds to creak open, loud enough to hear across the house (closing is quick), and it's weak —
    a dozen pistol shots or a blast further off knock it out.
  - A **ladder** in the middle of the right (north) wall leads up to a first-floor window — you duck
    through it automatically at the top. Break the glass first (shoot it).
  - **Windows** are real glass: see through them, shoot or grenade them to shatter.
  - **Destructible house**: explosions blow ragged holes in the walls and roofs of the mansion and the shed and smash
    the furniture — the C4 most, then the mortar, an RPG rocket, a car blowing up, an HE grenade and the mines. The
    M249, AWP and the PKT chip away at them too (about 15 M249 hits break a bit of wall). A hole that reaches the
    floor is a new doorway; windows in a broken wall fall out. A mortar shell through the roof takes the top floor's
    ceiling with it, and the next one drops into the room. Window frames, lamps and light switches come down with
    the wall or ceiling they hang on. The floors, the ceiling between the storeys and the
    stairs stay. Everything is repaired at the start of each round (with no rounds — warmup, Deathmatch, Gun Game —
    90 seconds after it broke).
  - **The battle leaves its marks** (Mansion only):
    - **Soot** blackens the walls, ceilings and floors around every explosion; **rubble** — bricks and lumps of
      plaster — flies out of what breaks and stays on the floor; a fresh hole keeps **smoking** for a while.
    - **Collapse**: whatever no longer holds on to anything (a stretch of wall cut loose, a bit of roof) comes down,
      hurting whoever is under it.
    - **Dust** hangs where something blew up (bots can't see through it for a few seconds).
    - **Shell shock**: close to a blast your ears ring, the screen blurs and sways and you move slower for a few
      seconds; the **blast throws you back** and knocks your aim.
    - **Fire spreads** to furniture, bookshelves and doors: they burn down and break, set what's next to them alight,
      and indoors the smoke gathers under the ceiling and fills the room.
    - **Doors** are blown off their hinges by a blast nearby, or burn away in a fire.
    - **Bullets go through** thin walls and doors with half their damage.
    - **Sound**: explosions outside sound muffled from inside the house (and the other way round); a blast nearby
      shakes the room and brings dust down from the ceiling.
  - **Wine cellar** under the living room: the walled-up closet off the kitchen (by the doorway to the hall) is open
    now, and a steep wooden stair goes down into a low stone cellar with wine racks, barrels and a table, lit by one
    bulb (its switch is at the foot of the stairs). The ground floor above it never breaks.
  - **Blackout**: the house's **fuse box** hangs in the cellar, a big red lever on it. A Terrorist **holds E for
    3 seconds** to cut the power: every light in the house (and the cellar) goes out at once — truly dark, only
    flashlights (**F**), nightvision (**N**), muzzle flashes, explosions and fire light the rooms — and everyone
    hears the power die. A CT **holds E for 5 seconds** to bring it back; the lights flicker on. The light switches
    do nothing while the power is off. It can be cut and restored any number of times; each round starts with the
    power on.
  - **Light switches** in every room, like the original (press **E**). Switched-off rooms go dark —
    use the flashlight (**F**) or nightvision (**N**).
  - **Water tunnel** under the north lawn from behind the mansion to the street, with a manhole and
    ladder at each end.
  - The lawn by the left door has a **pickup truck** with a **PKT machine gun** in the back. It has two seats: the
    first one in drives, the second stands at the PKT (aim with the mouse, hold Mouse 1, unlimited ammo).
- **de_inferno** — the CS 1.6 classic, converted from the original `de_inferno.bsp` **with its own textures** (taken out
  of the .bsp into `public/textures/de_inferno`): the Italian village with banana, the church square and the apartments.
  Terrorists start in the south-west, CTs in the north-east; **A** is the courtyard by the apartments (east), **B** the
  church square past banana (north).
- **cs_assault** — hostage rescue, converted from the original `cs_assault.bsp`: the warehouse with its offices,
  catwalks and roof, the parking lot and the alleys, at dusk. The Terrorists hold four hostages in the office upstairs;
  the CTs start in the parking lot and bring the hostages back there. Ladders lead up to the roof and the vents, the
  shop windows and the skylights are glass you can shoot out, and the office door by the parking lot opens with **E**.
  (The original's textures aren't inside its .bsp, so this one is painted like Dust II and the mansion.)
- **aim_map** — a small mirrored arena for quick fights, like the CS 1.6 classic. No bomb or hostages: a round ends
  when one team is wiped out (at the time limit, the side with more players alive wins, then the one with more
  health). Everyone gets free Kevlar + helmet each round, and an AWP (in the middle), AK-47, M4A1 and two Desert
  Eagles lie in the field. Buying works in your spawn area.

**Cars** (Dust II has two, the mansion has the pickup): **E** in/out; the first one in **drives** (**W/S**
gas/brake, **A/D** steer, **Space** handbrake, **V** camera, **Mouse 1** horn). A car takes two passengers who
look around and shoot out of the windows; the pickup takes one gunner. When the driver gets out, the one who got
in first takes the wheel. Cars can be **destroyed**: bullets, grenades and rockets wear them down — they smoke,
then explode, killing everyone inside and hurting anyone within 7 m. Ramming enemies hurts them.

**End-of-match map vote:** when a match ends, the summary shows every map, including the one just played. Click one or
press its number key. You have 15 seconds; the vote ends early once everyone has voted. The map with the most votes is next (ties
are decided at random), and the same map again simply restarts the match. With no votes, maps rotate as before. During
a match anyone can also vote from the Esc menu: more than half the players voting for a map switches to it immediately.

## Office extras

- **Leaderboard** — lifetime stats per player name (kills, deaths, K/D, headshot %, MVPs, wins,
  rescues and a combined rating), saved in `data/stats.json` on the host. Shown on the join screen
  and in the Esc menu, also at `/api/leaderboard`. Warmup doesn't count. Delete the file to reset.
- **Announcer** — First blood, Double/Triple/Ultra kill, Unstoppable, Headshot, Humiliation (knife)
  and Ace (wipe out a team of 3+), with a voice (can be turned off in Esc menu).
- **Round MVP** after every round and an **end-of-match summary** with awards (Match MVP, Top fragger,
  Headshot machine, Damage dealer, Hostage hero).
- **Ranks** — Silver I up to The Global Elite, from your leaderboard rating (you climb by playing well over time).
  You are ranked after 15 rounds. The badge shows next to your name on the scoreboard (Tab) and on the leaderboard;
  everyone sees it when someone ranks up. Esc menu → *Your rank & achievements* shows the rating you need for the next rank.
- **Achievements** — 26 of them, from *First Blood* and *Stabby* (knife kill) to *Ace*, *Clutch* (win as the last one
  alive against 2+), *Two Birds, One Rocket*, *Barbecue* (2 kills with one Molotov), *Road Rage*, *Gun Master*,
  *Patient Zero* (25 infections), *Zombie Slayer* and *Dance Floor* (10 emotes). A card pops up when you unlock one and
  the chat tells everyone. Esc menu lists them all with your progress. Saved with your stats; warmup doesn't count.
- **Emotes** — press **J**, then a number: Dance, Point and laugh, Wave, Salute, Come at me, Cheer, Facepalm. Others
  see your player do it (with a label and a voice line); you see yourself from the front (move the mouse to look
  around). Moving or shooting stops it.
- **Kill cam** — when you die, a short replay from your killer's eyes, slowed down at the moment of the
  kill. Click or press Space to skip; can be turned off in the Esc menu.
- **Gore** — a heavy kill bursts the body apart: an **RPG**, **HE grenade**, **C4** or exploding car blows it to
  pieces (head, torso, arms, legs and scraps fly off, bounce and bleed), an **AWP** or **M249** tears off the part it
  hit (a headshot takes the head off), and a **Scout** or **Desert Eagle** does it with a headshot. Blood sprays,
  pools under the body and splashes nearby walls. It all stays until the next round starts (in Deathmatch and Gun
  Game the oldest dozen go first). In the kill cam you see your own body burst at the moment of the kill.

## Gameplay

**Team bar** (classic matches, like CS2's): along the top, the round timer — the bomb's 40-second countdown, in
red, once it's planted — with the score and how many are alive on each side, between the two teams' player
cards; your team on the left (CT on the left when you spectate). A card shows the player's picture in their
colour, a health bar, money, the gun they carry, grenades and mines, the defuse kit or the bomb. Of the other
team you see only who's alive and what gun they hold — everything once you're dead or spectating (the server
doesn't even send the rest). Dead players are greyed out with a skull. Choose your picture on the join screen
(it stays in your browser); without one you get your initials, bots a robot. Not shown in Deathmatch, Gun Game,
Zombie or Hide and Seek. Esc → Team bar turns it off (back to the plain score and timer).

- **Warmup** until both teams have a player (instant respawn, $16000, buy anywhere), then
  "game commencing" after 3 s and 3 s freeze time per round.
- **Weapons:** Glock, USP, P228, Desert Eagle, Five-SeveN, Dual Berettas, M3, XM1014, MAC-10, TMP,
  MP5, UMP45, P90, Galil, FAMAS, AK-47, M4A1, Scout, SG 552, AUG, AWP, the semi-automatic snipers
  D3/AU-1 (G3SG1, T, $5000) and Krieg 550 Commando (SG550, CT, $4200), M249, RPG-7 (CT only, $6000), 82-BM-37 mortar ($6000); HE, flashbang and smoke
  grenades, Molotov; Kevlar, helmet, defuse kit, nightvision.
- **RPG-7** (buy menu → Heavy, CTs only, $6000; a Terrorist can pick it up from a dead CT): the rocket flies to
  the first wall, car or person and explodes for up to 500 damage within 9 m — but only to people who can see the
  explosion. A wall between you and the blast protects you. Rockets also smash windows and blow up cars.
- **82-BM-37 mortar** (buy menu → Heavy, both teams, $6000, 6 shells; one per team — in Deathmatch one on the map;
  not in Zombie mode, and bots don't use it). It's heavy: you walk slowly with it. It's aimed like a real one, in
  Soviet mils (60-00 to the full circle; bearings go clockwise from north, the top of the radar):
  - **Mouse1** sets it up (2 seconds, on open ground); you stay crouched and can't move. On Mansion you can also set it
    up under a roof that breaks (the top floor of the house — the Terrorists' spawn — and the shed): the first shell
    blasts a hole about 1.5 m wide in the roof above you and flies out. Not on the ground floor: a floor is in the way.
  - You look out along the tube. The **mouse** (or **A D**) turns it — the panel shows the **bearing**, e.g. 31-50 —
    and raises or lowers it (or **W S**): the **elevation**, from 7-50 (45°, the furthest: 80 m) to 14-15 (85°, 14 m).
    The **firing table** on the panel says how far each elevation throws, and a bold **red dot** on the radar shows,
    live, where the next shell will come down as you turn and tilt the tube.
  - **The easy way: Right mouse opens a map.** It shows your mortar, its reach (14–80 m) and the called-in targets
    and pings. Move the cursor (green when in reach, with a circle showing how far shells scatter there) and **click**
    where the shell should land: the map closes and the tube swings round and tilts itself onto that spot ("Laying
    the tube..."), then Mouse1 fires. A click near a called-in target or ping snaps exactly onto it. The map shows
    nothing the radar doesn't, so you still need someone to call in where the enemies are.
  - **V** calls in a target — anyone on the team (or you, before setting up): the spot you're looking at. The
    gunner's panel shows its bearing and distance from the mortar and how far to turn, and it's marked on the radar.
  - **Mouse1** fires. The shell flies a high arc for 3½–5 seconds; everyone near where it comes down hears it scream
    in for the last 3½ seconds — a reedy, fluttering shriek dropping in pitch, louder and lower the closer it will
    land, ending in a ripping roar of air: run! The blast is a huge, deep BOOM with thunder rolling on for seconds, heard across the map; right next to it your ears ring and everything goes muffled for a
    few seconds. It lands a little off (1 m + 3% of the distance) and blows up like an RPG rocket (up to
    300 damage within 14 m, not through walls, bodies burst apart). A roof stops it — on Mansion until shells have
    blown a hole in it. Where it lands burns for 20 seconds (like a Molotov), and in grass or sand it
    leaves a crater; an RPG rocket that goes off on the ground does the same (8 seconds of fire). Craters and scorch
    marks stay until the next round.
  - After each shell the panel says where it landed: exactly, with the correction ("6 m short, 0-40 left of the
    target"), if someone on the team saw it go off; only roughly ("not observed") if nobody did. It's on the radar
    too. Walk the shells onto the target, like a real crew.
  - **E** or switching weapons packs it up.
- **Anti-personnel mines** (buy menu → 7 Mines & camo, both teams, carry up to 2 of each; classic and Deathmatch only).
  Press **6** to take one out (again to switch type) and **Mouse1** to lay it on the ground a step in front of you;
  it arms 1.5 seconds later. Your team always sees its own mines (with a green ring) and never sets them off;
  enemies only notice a mine within 3 m. Hold **E** next to an enemy mine to defuse it (3 s, 1.5 s with a defuse
  kit, +$100). An explosion nearby sets mines off. They're cleared every round; you can have 4 down at once.
  - **PMN** ($500): a Soviet pressure mine, flat on the ground. An enemy who steps on it loses a leg — and usually
    their life — and anyone close by is hurt too.
  - **MON-50** ($600): a Soviet directional mine on little legs, with a tripwire stretched across its front 3 m out.
    An enemy walking into the wire sets it off: a fan of fragments up to 25 m ahead (60° wide), a small blast behind.
- **Ghillie camo** (buy menu → 7 Mines & camo, $1000): press **H** to switch it on and off. While it's on, enemies see only a faint
  shimmer of you (bots can't make you out beyond 4 m); each shot shows you for 1.5 seconds. Teammates always see you.
  Lost when you die.
- **Pings**: click the **middle mouse button** (the scroll wheel) to put a yellow **!** on your team's radar where
  you're looking. It lasts 6 seconds; one per player at a time.
- **Molotov** (buy menu → 6 Equipment, $400, both teams): the bottle breaks on the first floor it lands on and sets a
  circle of 3.5 m on fire for 7 seconds. Everyone inside takes a burst of up to 80 damage (a bit less than an HE, less
  towards the edge), then burns for 15 HP a second while standing in it, and for a moment after stepping out. Armor
  doesn't help. Walls stop the flames. A smoke grenade thrown into the fire puts it out. Fire also hurts hostages and cars.
- Dead players drop their primary **and** pistol. Walking over a weapon picks it up when that slot
  is empty; press **E** while standing on one to swap it for the gun you carry.
- **Buy menu** (CS2-style, **B**): the whole shop at once in columns, in the old menu's order and numbers —
  1 Pistols, 2 Shotguns, 3 SMGs, 4 Rifles, 5 Heavy, 6 Equipment, 7 Mines & camo — with shaded gold pictures made from
  the game's own models; it fits any window (the columns wrap on a small one). Click to buy, or press
  the column's number then the item's (**0** for a 10th); point at an item for its damage, fire rate, magazine,
  armour penetration, speed and kill reward. Items for the other team are greyed ("CT only"), owned ones ticked,
  ones you can't afford dimmed with the price in red. **Right-click** sells back something you bought this round
  (full price, while you can still buy; a gun you had before comes back if it's still on the ground). The bottom row:
  ammo (**,** **.**), auto-buy (**F1**), re-buy (**F2**), close (**B** / **Esc**). The mouse is free while it's open.
  The mouse stays captured, so you can keep moving.
- **Graffiti:** draw your own spray (join screen or Esc menu → *Draw graffiti*), then press **T**
  in game to spray it on the wall you are looking at.
- **Auto team balance:** you can't join a team that would then have two players more than the other (you land on the
  other side). If the teams still drift apart (people leaving, the admin moving players), the player with the fewest
  kills on the bigger team is moved at the start of the next round.
- **Halftime:** after round *rounds to win − 1* (round 9 with the default 10), the teams switch sides like in a
  real match: everyone starts again with the start money, and the score stays with the players.
- **Footsteps** sound like the floor: sand, grass, wood, metal (also car roofs), tiles, carpet, stone; water splashes.

## Bots

Bots fill the teams up to **8 vs 8** (change it in the admin panel or with `BOTS`): with 6 people playing there are 10
bots, with 10 people 6 bots, and so on — each team is topped up to the same size, and a bot leaves when a person joins
(at the end of the round if it's alive). With nobody playing there are no bots. Their names start with **BOT**, and the
scoreboard shows BOT instead of a ping. Bots don't count in the leaderboard, ranks or achievements (your kills on them do).

- **Levels:** easy, normal and **hard** (the default) — they differ in how fast they react, how well they aim, how far
  and how wide they see, whether they strafe in a fight, and how often they throw grenades. Change it in the admin panel
  (Bots → Bot level) or with `BOT_LEVEL`.
- They **buy** like players (any weapon their team can buy — rifles, SMGs, shotguns, snipers, the M249 and now and then
  an RPG — plus armor, grenades, a Molotov and a defuse kit), pick up weapons, reload, throw HE grenades and Molotovs,
  and can't see through smoke or when flashed. They turn towards gunfire and towards whoever shoots them.
- They **play the objective**: the Terrorists pick a site and plant, the CTs watch the sites, retake and defuse; on
  hostage maps the CTs fetch the hostages and lead them out (around crawl spaces, which hostages can't get through)
  and the Terrorists guard them. In Deathmatch and Gun Game they roam, as zombies they hunt the humans, in Hide and Seek
  they hide in corners or search. They walk the real map: stairs, jumps, crouch spots, ladders and doors.
- **When every person is dead, the round ends right away** — nobody has to watch the bots finish it. The team with
  more players left wins it (then the one with more health); a planted bomb counts for the Terrorists unless the CTs
  outnumber them. The remaining bots drop dead and the next round starts.
- The server works out where bots can walk for every map in the background when it starts (a few seconds), so map
  changes never freeze the game.

## Deathmatch

Admin panel → Game mode → Deathmatch (or `GAME_MODE=deathmatch`). **Everyone against everyone**, on any map:

- You respawn 2 seconds after dying, anywhere on the map away from others, with full armor, an HE grenade and 2 seconds
  of spawn protection (shooting ends it).
- **B** buys any gun **for free**, anywhere and any time; you respawn with the guns you picked last.
- The first to **30 kills** wins (or whoever has the most kills after **10 minutes** — both can be changed in the admin
  panel). Then the summary and the map vote, like after a match. Nothing is dropped when you die.

## Hide and Seek

Admin panel → Game mode → Hide and Seek (or `GAME_MODE=hns`). The **Terrorists hide**, the **Counter-Terrorists
seek**:

- At the start of a round the hiders get **30 seconds** to hide. The seekers' screens stay black with a countdown and
  they can't move until then.
- Seekers only have a knife. Hiders have a knife too, plus two flashbangs and a smoke grenade to get away.
- The seekers win by knifing every hider; the hiders win if anyone is still hidden when the time runs out (the round
  time, after the 30 seconds), or if they get every seeker. When the seekers win, the **teams switch** for the next
  round. No buying.
- Dust II is the classic Hide and Seek map, but any map works.

## Gun Game

Turn it on in the admin panel (Game mode → Gun Game) or with `GAME_MODE=gungame`. It works on every map (no bomb or
hostages).

- Everyone starts with the Glock. Each kill gives you the next weapon:
  Glock → USP → P228 → Desert Eagle → Five-SeveN → Dual Berettas → M3 → XM1014 → MAC-10 → TMP → MP5 → UMP45 → P90 →
  Galil → FAMAS → AK-47 → M4A1 → SG 552 → AUG → Scout → AWP → M249 → RPG-7 → HE grenade → **knife**.
  The first player to make a knife kill on the last level wins the match.
- Only kills with your current weapon (or the knife) move you up. A **knife kill steals a level** from the victim.
  Killing yourself (your own grenade or rocket, a fall) costs a level.
- Everyone spawns at a random spot anywhere on the map (as far from the others as it can find), not at the team
  spawns.
- You respawn 2 seconds after dying, with full armor and 2 seconds of spawn protection (shooting ends it). On the HE
  level you get a new grenade after every throw. No buying, no dropped weapons.
- The HUD shows your level, the next weapon and who leads; Tab shows everyone's level. Players who join late start at
  the lowest level anyone is on.
- After the win comes the usual match summary and map vote, and then another Gun Game.

## Zombie mode

Turn it on in the admin panel (Game mode → Zombie mode) or with `GAME_MODE=zombie`. Works on every map; any two
players can start.

- Everyone starts the round as a **human** with $16000 and can buy anywhere until buy time ends. Twelve seconds after
  the freeze time the infection starts: about one in five players becomes a **zombie** (2000 HP for these first ones).
- Zombies only have **claws**, but they are fast, jump higher, have 1000 HP, see in the dark (nightvision on) and
  can't buy or pick up guns. A claw hit on a human turns them into a zombie on the spot — armor soaks a few hits first.
- Bullets **push zombies back**. Dead zombies come back after 4 seconds; humans who die (falling, fire) come back as
  zombies.
- **Humans win** if anyone is still human when the time runs out; **zombies win** when everyone is infected.
  Teams are shown as Zombies and Humans; zombies growl, and infected players scream.

## Party modes

In the admin panel, for fun nights. They apply right away and can be combined with any game mode:

- **Low gravity** — you jump about 2.5 times as high and float down.
- **Headshots only** — bullets only hurt when they hit the head (grenades, fire, rockets and knives still work).
- **Big heads** — everyone's head is twice as big, and so is the head hitbox.
- **Everyone gets only…** an AWP, Desert Eagle, Scout, AK-47, knife or RPG-7 (classic mode): each spawn gives you only
  that weapon (plenty of ammo) plus Kevlar and a helmet; no buying.

The HUD shows the active party modes under the timer.

## Controls (CS 1.6 defaults)

| Key | Action | Key | Action |
|---|---|---|---|
| W A S D | move | Space | jump |
| Ctrl | duck | Shift | walk (silent) |
| Mouse 1 / 2 | fire / zoom, knife stab | R | reload |
| Mouse 1 (grenade) | hold to pull the pin, release to throw | Mouse 2 (grenade) | hold, release for a short lob |
| E | use: plant, defuse (bomb or mine), pick up, door, light switch, enter/exit car | G | drop weapon |
| 1 2 3 5 | primary, pistol, knife, C4 | 4 / 6 | grenades / mines (press again to cycle) |
| Q | last weapon | Wheel | switch weapon |
| B | buy menu | O | buy equipment |
| , / . | buy primary / secondary ammo | F1 / F2 | autobuy / rebuy |
| Z X C | radio menus | T | spray graffiti |
| F | flashlight | N | nightvision |
| J | emotes | V | call in a mortar target |
| Y / U | chat / team chat | Tab | scores |
| M | choose team | F5 | screenshot |
| H | ghillie camo on / off | Middle click | ping "!" on the team radar |
| Esc | menu (settings, map vote) | 0–9 | pick in menus |

Ducking makes you 0.9 m tall, as in CS, so you fit through vents and crawl spaces. Duck in mid-air (jump, then
Ctrl) to pull your legs up and reach higher ledges, windows and vent openings. On a ladder, look up and hold W to
climb: you are held against the ladder, step over the edge at the top (onto a ledge beside it, too), and Space jumps off.

## Voice lines

The original CS 1.6 voices (copied from `gameVoices/` to `public/sounds/`): a random "Move out" / "Lock 'n' load" /
"Let's go" / "Go" when the round goes live, "Bomb has been planted", "Bomb has been defused", "Counter-Terrorists win" /
"Terrorists win" at round end, "Fire in the hole!" when a teammate throws a grenade, and "Go go go!" on the radio (X → 1).
Grenade and radio voices follow the *Speak radio commands* setting.

## Crosshair

Esc → Crosshair: gap (radius), length, thickness and color, with a live preview. Saved in your own browser.
Standing still, the gap is exactly what you set, with every weapon. With **Dynamic** on (the default) it opens up
while you move, jump or spray, like CS 1.6, and closes again when you stop; turn it off for a fixed crosshair.

## Graphics

Esc → Graphics: **Low** (no shadows, lower resolution — for weak office PCs), **Medium** (shadows, full resolution,
no edge smoothing — recommended for laptops), **High** (sharper shadows, smoothed edges — for a real graphics card).
On a laptop's built-in Intel graphics, edge smoothing alone more than doubles the cost of a frame (Medium: 6–7 ms
without it, 13–16 ms with it), which is why only High has it. Reload the page after changing it. Only the nearest lamps really light the scene (2 / 4 / 6).

**Auto-adjust** (on by default): when the game can't keep up (under ~48 FPS for a moment) it steps down — lower
render resolution (85% → 72% → 60% → 50%), shadows redrawn every 2nd or 3rd frame and less sharp, fewer smoke puffs
and flames — and steps back up, one level every ~12 s, once it runs smoothly again (if a step up makes it struggle,
it stays down for a minute and a half). It never switches shadows or lamps on and off, so it never causes a freeze.
**Show FPS and ping** puts a small readout next to the radar (with the resolution when it's turned down), and
the **buffer**: how far in the past other players are drawn so they move smoothly (70–250 ms, it adapts to the
network). If it stays near 200 ms or more, that player's Wi-Fi is struggling.

**No freezes in a fight** — how the client keeps every frame short (keep it that way when adding things):
- **Shaders are compiled while a map loads, never mid-fight.** three.js compiles a shader the first time something
  new is drawn, which can take a good part of a second. `prewarm()` in main.js draws one of everything (players,
  guns in hand, every effect, both kinds of shadow pass) once when the map loads. A new kind of object or effect
  belongs in it. The room lighting is on the Lambert/Phong prototypes (roomlight.js), so a material is compiled once.
- **Effects reuse their objects.** Sprites and fire glows come from pools and go back to them; a disposed material
  takes its shader with it (and the next one compiles it again). Smoke, fireballs and flames are billboards — one
  draw call per kind — capped, and fading out right in front of the camera (stacked full-screen layers are the most
  expensive thing to draw).
- **Bullet holes, soot and rubble are instanced**, map decor and windows merged; broken walls upload only the part
  of their mesh that changed.
- **No full-screen CSS filters** on the game canvas (shell shock is an overlay; a blur cost a whole extra pass).
- **Models share their geometry.** Every box of a body is one shared unit box, guns on the ground and mines are
  copies of one model each, the kill cam reuses its figure, and a player who leaves takes their merged mesh with
  them — nothing piles up on the graphics card over a long match.

**Smooth movement over Wi-Fi:**
- The server sends **32 snapshots a second** on a fixed beat — 31.25 ms is exactly two steps of the Windows timer
  (at 30 a second the timer rounded most ticks up to 47 ms). Score, dropped guns, bomb, hostages and cars go out only
  when they change; the snapshot text is made once per tick for everybody.
- Your game sends your position every frame (up to ~60 a second), so every snapshot has a fresh one.
- Other players are drawn a little in the past (the **buffer**, 70–250 ms), adapting to how unevenly snapshots
  arrive; when one is late they keep moving for a moment instead of freezing. Shots are checked by the server at
  the same moment in the past, so hits land where you saw them.
- **Weak connection warning:** no updates for a moment, a ping over 150 ms, or a buffer over 150 ms shows a warning
  under the radar; the scoreboard marks that player's ping with ⚠ for everyone.
- The server process runs at above-normal priority, so the laptop that hosts and plays keeps its ticks on time.

**Updates and loading:**
- After restarting the server with a new version, open game pages **reload by themselves** (they check every
  2 s while disconnected). A page that still carries an older version than the server reloads once when it connects.
- Files are sent gzip-compressed and the browser keeps them: a first load is about 1.1 MB (was 5.5 MB), and a reload
  or map change downloads only what changed (about 10 KB).

- On the server, collision and the breakable pieces sit in 2 m grids; `DEBUG_TICK=1` prints tick times, event-loop
  stalls and what each blast cost, `PROFILE_MS=60000` records a CPU profile.

## Project layout

```
server.js            HTTP/HTTPS + WebSocket server, authoritative game logic
shared/maps/         Map definitions (boxes for collision + decor) and map registry
shared/weapons.js    Weapon/equipment stats, the buy menu layout and the Gun Game ladder
shared/ranks.js      Rank ladder; shared/achievements.js achievement list; shared/emotes.js emotes
shared/radio.js      Radio commands
shared/physics.js    Movement & collision, ray tests, hitboxes, grenade simulation
shared/doors.js      Swinging doors (collision boxes per open/closed state)
shared/maps/breakables.js Destructible walls and furniture: cuts a level's solids into chunks with their faces (cs_mansion)
shared/maps/mansion2.js Mansion 2.0: the parts cs_mansion has beyond the original level (solids + faces, carved in)
shared/maps/*_bsp.js cs_mansion / de_dust2 / de_inferno / cs_assault geometry converted from the original .bsp files
                     (generated by tools/bsp/convert.mjs; de_inferno's textures by tools/bsp/textures.mjs into public/textures)
lib/bots.js          Bots: buying, seeing, aiming, fighting, objectives, moving
lib/nav.js           Where bots can walk (a grid of floors per map) and path finding; lib/navworker.js runs it in the background
public/js/           Browser client (Three.js): world, models, effects, HUD, menus, sprays, audio, footstep surfaces
public/js/batch.js   Fewer draw calls: player parts and guns baked into one mesh each, static decor and windows merged
public/js/billboards.js Smoke, fireballs and flames: every particle of a kind in one draw call
public/js/autoquality.js Automatic quality: steps resolution, shadows and effects down and up to hold the frame rate
public/js/teambar.js The CS2-style team bar: player cards, pictures and weapon silhouettes
public/admin.html    The admin panel (/admin)
```

To make a new map, copy `shared/maps/dust.js`, change the `box(...)` calls and register it in
`shared/maps/index.js` — the server and clients both read it.
