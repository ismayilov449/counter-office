# Feature: Underground & vents (ROADMAP group 5, branch `feature/underground`)

## STATUS
- **Done (server and browser code, server and Node tests):**
  - **5.1 No radar underground.** `t-radar.mjs` 12/12 on cs_mansion and cs_mansion_night; `clientsmoke.mjs` part 1;
    the old `jamtest.mjs` (de_dust2) still passes.
  - **5.2 Echo in the tunnels.** `clientsmoke.mjs` part 2 (a fake sound kit); `t-echo.mjs` 3/3 on both Mansion maps.
  - **5.3 Air vents** (grilles, listening, grenades, gas). `unit.mjs` 112/112, `t-vents.mjs` 32/32 on both Mansion
    maps, `clientsmoke.mjs` part 3; `clientsmoke.mjs` 84/84 in all.
- **Regressions run on this branch:** gas `t_gas.mjs` (GAS_LEAK_X=3) all OK, gas `maps.mjs` (all 7 maps load),
  `integration/links.mjs` a–g 36/36 and h 4/4 (GAS_LEAK_X=6), `mansion/walls.mjs` 0 missing / 0 twice; `BOTS=4` for
  60 s on both Mansion maps: no server errors, tick 0.8–2.0 ms average (max 10.4 ms at the start).
- **Browser-tested (2026-11-08, headless Edge, swiftshader, 960x540; `g-underground.mjs` 22/22 on cs_mansion and
  22/22 on cs_mansion_night, no page errors).** Every screenshot was looked at: the six grilles by day and at night (the
  cellar's over the gap between the wine racks, the back lawn's at the foot of the wall by the crates, the two ceiling
  grilles by their lamps, the two floor grilles), and in the blackout (as dark as the walls round them); the hint by
  each grille; the radar's "NO SIGNAL" static in the cellar, the drain and the smugglers' tunnel as a T and in the
  cellar as a CT, the message going down, a ping refused, normal radar again in the kitchen and the living room; a
  real lob (Mouse2) at the kitchen's ceiling grille: the grenade seen right under the grille, then gone, a new one coming
  up out of the bedroom's floor grille (tracked in the page: the first ends 0.46 m from the kitchen's grille, the
  second starts 0.29 m from the bedroom's), the boom upstairs, one "Fire in the hole" (the throw) and none for the
  grenade out of the vent; a scripted player's smoke thrown into the north-east room's ceiling grille popping out of
  the security room's floor grille and filling that room.
- **Draw cost** (WebGL draws per frame; the light frames' median, then the frames that also redraw the shadow maps;
  `g-ugcost.mjs`). Against `main`, cs_mansion by day — branch / main: cellar grille 89 / 88 (224 / 222), back lawn
  303 / 300 (435 / 433), kitchen ceiling 101 / 100 (238 / 236), bedroom floor 122 / 120 (259 / 256), north-east room
  ceiling 173 / 173 (311 / 310), security room floor 216 / 215 (352 / 351), kitchen 116 / 116 (254 / 252), cellar
  129 / 129 (266 / 266). The same views on the branch with the grilles' mesh hidden, right after (A/B, the exact
  cost): +0…+2 draws (noise ±1: it is one mesh, one draw call where it's in view), by day and at night; nothing in the
  shadow passes (it casts no shadow), no light added.
- **Not checked:** the sounds by ear (the echo, the tunnel ring, the duct rattle, listening through a grille: the
  headless browser has no sound card); frame times on a real laptop.
- **Next:** nothing on this branch; the merge links below.

## The vent grilles
Three short ducts, a grille at each end (`shared/underground.js`, `GRILLES`/`DUCTS`). Every grille sits where nothing
ever breaks (the cellar's walls, the house's foundation, the slab between the storeys), and none is in the living room
(group 4's fireplace is on its south wall), on the roof or by the lift's shaft (group 3), or in a wall with pipes or
cables (group 2). The ducts are not drawn and not crawlable (they run inside the walls and the slab).

| # | Grille | Where (x, y, z in m) | Duct to |
|---|---|---|---|
| 0 | cellar, high in the west wall, over the gap between two wine racks (z 1.1…2.0) | plate x −22.9, y 0.04…0.40, z 1.2…1.8, facing +x | 1 (1.0 m) |
| 1 | back lawn, at the foot of the house's west wall (the foundation), under the living room's south window | plate x −23.67, y 0.04…0.40, z 1.2…1.8, facing −x | 0 |
| 2 | kitchen ceiling (west of the kitchen lamp) | plate y 4.06, x −20.3…−19.8, z −11.0…−10.5, facing down | 3 (1.9 m) |
| 3 | floor of the north-west bedroom upstairs (above the kitchen) | plate y 4.27, x −18.6…−18.1, z −11.0…−10.5, facing up | 2 |
| 4 | ceiling of the ground floor's north-east room | plate y 4.06, x −9.6…−9.1, z −11.3…−10.8, facing down | 5 (1.9 m) |
| 5 | floor of the security room (CCTV), above it | plate y 4.27, x −8.0…−7.5, z −11.3…−10.8, facing up | 4 |

(Grilles 0 and 1 were first at z −2.5…−1.9 — the spots pushed in the first commit — and moved to z 1.2…1.8 because
crates stand on the lawn against the wall at z −2.5…−0.4.)

## The underground areas
`shared/underground.js` `AREAS` (one list, used by the radar, the echo and the tests): the cellar (with the lift's pit
and the drain's grate shaft), its stairwell below y 0 (about the lower three quarters of the stairs), the smugglers'
tunnel (up to its ceiling, so on the shed's ladder you leave it when your head is in the shed), the storm drain and
its street shaft half way up, the old water tunnel under the north lawn. A point (feet or eyes) inside a box is
underground. The cellar's box stops at its ceiling (0.61): the living room's floor is 0.2 m higher, so nobody up there
(standing or crouched) is ever underground.

## (a) README

Text for the README's Mansion section (cs_mansion and cs_mansion_night), after the floodgate:

  - **Underground** (the cellar, the smugglers' tunnel, the storm drain and the old water tunnel under the north lawn):
    - **No radar down there.** Your radar shows only static ("NO SIGNAL"), for both teams, and you can't ping (middle
      mouse) or call in a mortar target (V). Nobody underground shows up as a red dot on anyone's radar, and what you
      see down there doesn't reach your team's radar either. You rely on your ears.
    - **Shots echo through the house.** A gunshot or an explosion underground is heard everywhere above ground as a
      muffled, rolling boom from below, however far away you are — so everyone knows a fight is going on down there.
      Down in the tunnels the shots ring and echo along the walls. Suppressed guns (USP, TMP, M4A1) make only a faint
      thud.
  - **Air vents**: three short ducts with a metal grille at each end — the cellar (high in its west wall, between the
    wine racks) and the back lawn (at the foot of the house's west wall); the kitchen's ceiling and the floor of the
    bedroom above it; the ceiling of the ground floor's north-east room and the floor of the security room above it.
    - **Listen**: stand by a grille (crouch by a low one, or over a floor grille) and you hear what goes on at the other
      end — footsteps, reloads, shots — much louder and clearer than through the walls, coming out of the grille. The
      closer your ear is to the grille, the better.
    - **Grenades**: throw a grenade into a grille (or drop one into a floor grille) and it rattles through the duct and
      drops out of the other end a moment later — an HE or a flashbang into the room behind, a smoke grenade fills it,
      a Molotov breaks on its floor. The grenade keeps its fuse, so throw it in early. You hear it clatter through.
    - **Gas** spreads through the vents too, slowly: a leak in the kitchen reaches the bedroom above it after a minute
      or two, and the cellar's vent lets a little of the boiler's gas out onto the back lawn.
    - The ducts are too small to crawl through. Bots don't use them.

For the file list at the end of the README:

    shared/underground.js   Underground & vents: the underground areas, the vent grilles and ducts, the vent graph (gas, smoke)
    lib/underground.js      On the server: no radar underground, grenades through the vents
    public/js/underground.js In the browser: the radar's static underground, the echo, the grilles, listening at a vent

No new keys and no new E use (the grilles only have a hint: "Air vent to …: listen here — a grenade thrown in comes out
there").

## (b) RESUME notes

### Files
- `shared/underground.js`: `UG` (the numbers: echo gains and gap, `listen` 2.2 m, `via` 0.35, `outside` 14 m, `mouth`
  0.5 m + `mouthPad` 0.05, duct speed 5 m/s and minimum 0.3 s, how fast a grenade pops out), `AREAS` /
  `isUnderground(map, p)` / `ugAreas(map)` / `undergroundMap(map)` (= `map.mansion2`), the vents: `GRILLES`, `DUCTS`
  ([a, b, length, gas area]), `ventsOf(map)` (grilles with `c`, `nv`, `mouth`, `links`; ducts), `grilleDist`,
  `grilleRoom(rooms, g)`, `ventLinks(map)` (the vent graph between `map.rooms`), `inGrilleSpace`, `nadeIntoVent(vents,
  path)`, `ventExit(g, jitter)`, `ductTime(len)`.
- `lib/underground.js`: `createUnderground(api)` → `{ under, noRadar, refuse, nade, tick, reset, pending }`. api:
  `map(), world(), game, now(), broadcast, send`.
  - Radar: `under(p)`; `noRadar(p)` (alive and underground: the snapshot's `sp` is `[]`); `refuse(p)` (a ping or a
    target call from underground: the message `UG_MSG`, true).
  - Grenades: `nade(id, k, owner, path, fuse)` from onNade: finds the first path point in a grille's mouth, cuts `path`
    there (in place: so the windows after it don't break), picks the duct's other end, broadcasts `ugDuct`, and returns
    `{ n, m }`: `n` goes into the game.nades entry (`end`: the far grille's mouth until it comes out; a Molotov's `at`),
    `m` into the 'nade' message (`fu`: the flight's length up to the grille). A bouncing grenade keeps its fuse; if it
    runs out in the duct it goes off at the mouth of the grille it's nearer to (a Molotov at the one it went in).
    `tick(t)` (every tick, before the grenades go off): a grenade due out of its duct, still in game.nades, gets its
    flight from the far grille simulated from the world as it is then (`ventExit`: out of a wall at 2.4 m/s, up out of
    a floor at 3.2 m/s, down from a ceiling), `n.end` (and a Molotov's `n.at`) set, and a second 'nade' message goes out
    (`vent`: the grille, `fu`: the time left). `reset()` (resetWorld) forgets the ones still to come out; a new round
    also empties game.nades, so nothing comes out after it either way.
- `public/js/underground.js`: `init(deps)`, `setMap(map)`, `update(dt, now, camera)`, `noSignal()`, `blocked()`,
  `shot(o, w)`, `boom(p, k)`, `ventPos(pos)`, `hint()`, `debug()`.
  - Radar: `noSignal()` (alive, in a team, feet underground) goes to `hud.radar` as the jammer's flag (same static,
    "NO SIGNAL"; body.js's red crosses are hidden by the same flag). A first-time message when you go down (again
    after a minute).
  - Echo: two buses made once per audio context from audio.js's `floodKit()` and `audio.out(null)`: "below" (low-pass
    450 Hz, dry + a 0.23 s feedback delay darkening each time) and "tunnel" (band-pass 1.1 kHz, a 0.14 s feedback delay
    and a 0.31 s tap). Above ground a shot underground is a tone 130→45 Hz + a low-passed noise burst into "below",
    gain `UG.echo.gain` × the gun's loudness (pistol 0.7 … sniper 1.25; suppressed `0.15`), the same at any distance;
    underground a band-passed burst into "tunnel", less further away (never under 0.35). At most one per 0.07 s (a spray
    is one rolling rumble); blasts (`boom`: HE 1, C4 1.6, mortar 1.5 …; smoke none) always, longer.
  - Vents: one mesh for the six grilles (a quad each 4 mm off its surface, a 64 px canvas texture: frame, slats, dark
    duct; MeshLambertMaterial so the room light and the blackout apply; no shadow). Every frame: the grille your ears
    (the camera) are nearest, within 2.2 m and on its side. `ventPos(pos)` (audio.js calls it for every positional
    `play`): a sound in the space at the other end of that grille's duct (its room; round an outside grille, outdoors
    within 14 m) comes out of your grille, `d(ear, grille) + 0.35 × (duct + d(far grille, sound))` away, when that's
    under 0.9 × its real distance. The hint within 1.8 m (standing over a floor grille your ears are 1.62 m off).
    'ugDuct': a rattle at the grille it goes in, a clank at the one it comes out of.

### Hooks in shared files (each marked `// underground`)
- `server.js`: the import; `const ug = createUnderground({...})` after the flood; `spots()` → `if (ug.under(e.p) ||
  ug.under(eye)) return false;`; `updateSpotting()`'s last loop → `if (ug.under(e.p)) continue;` (never a red dot,
  however `spotAt` was set); `onPing()` and `onSpot()` → `if (ug.refuse(p)) return;` (after the jammer's line); the
  snapshot's `sp` → `|| ug.noRadar(p)`; `onNade()` → `const duct = ug.nade(id, k, p.id, path, fuse);` and
  `...duct?.n` in the game.nades entry, `...duct?.m` in the 'nade' broadcast; `tick()` → `ug.tick(t)` before the
  grenades go off; `resetWorld()` → `ug.reset()`.
- `lib/gas.js` (gas): the import of `ventLinks`; in `buildGraph`, after the links to the outside: one line pushing a
  link per duct `{ a, b, fixed: area, gated: [], area: 0, vent }` (always open; `GAS_DEBUG=1` lists them).
- `public/js/main.js`: the import; `ug.init({...})` after `flood.init`; `ug.setMap(map)` in `loadMap`;
  `ug.update(dt, now, camera)` in `frame`; `ug.blocked()` first in `sendPing()` and `spotTarget()`; `hud.radar(...,
  jammedHere() || ug.noSignal())`; `ug.shot(m.o, m.w)` in the 'shot' handler and `ug.shot(o, id)` in `fireBullet`;
  `ug.boom(m.p, m.k)` in the 'boom' handler; the 'nade' handler: `m.fu ?? nadeFuse(m.k)` and no "Fire in the hole" for a
  grenade coming out of a vent (`m.vent == null`); the hint: `if (!hint && (gh = ug.hint())) hint = gh;` just before
  `hud.hint(hint)`.
- `public/js/audio.js`: one line at the top of `play()`: `if (pos && this.vent) pos = this.vent(pos) || pos;`.

### Protocol
- No snapshot key (the suggested `ug` is unused: nothing about the vents changes during a round; a grenade in a duct
  is events). The underground player's `sp` is `[]`, like a jammed CT's.
- `ugDuct { id, a, b, in, d }`: grenade `id` goes into grille `a` `in` ms after the throw and comes out of grille `b`
  `d` ms later (for the sound).
- 'nade' gets `fu` (s: how long to fly / show it; the first message: up to the grille) and, on the second message out
  of a vent, `vent` (the grille it comes out of).
- The message `No signal underground — no radar, pings or target calls down here.` answers a ping or a target call
  from underground.

### E key
No new E use. The grilles' hint is the lowest priority (only when nothing else is said).

### Choices
- Both teams lose the radar underground (the jammer only blinds the CTs); dead players and spectators are not
  affected (they see every enemy, as before). Teammates still show on the radar of those above ground.
- A viewer underground spots nobody (no signal to send it): checked by his eyes, so on the stairs a standing player
  half way down may still spot (eyes above y 0) while he's already unspottable (feet below y 0).
- The echo is the same everywhere above ground (the street and the neighbour's house too).
- A grille in a floor catches a grenade rolling over it (the mouth is 0.5 m deep: a thrown grenade moves up to 0.39 m a
  step, and bounces off the plate from the step before).
- One trip per grenade: one that pops back onto its floor grille stays there.
- Duct areas for the gas: cellar–outside 0.4 m², the two ceiling–floor ducts 0.9 m² (gas is lighter than air: ceiling
  grilles catch it). Measured (no server, `unit.mjs` and gas/graph.mjs): the kitchen pipe holed, the bedroom above smells
  it after ~100 s and shimmers after ~3 min; without the vents it never gets there.

## Links to wire at merge
- **Group 1 (wounds), interrogation:** an interrogated enemy underground already never shows (the guard in
  `updateSpotting`). Better: in `lib/wounds.js`, where the nearest standing teammate is picked, skip the ones
  underground (`ug.under(q.p)`, pass `under` in its api), so the interrogation names someone who will show.
- **Group 4 (stealth), creaking floorboards:** if the creaks are played through `audio.play` with a position (like
  footsteps), they come through the vents already; nothing to wire. The cellar stairs' creaks are underground: no echo
  (only shots and blasts echo).
- **Group 3 (power):** nothing (the ducts have no fans; the radar doesn't depend on the power).
- **Group 2 (walls):** nothing. (Bullets through walls don't go through a grille: the grilles sit on surfaces that
  never break and stop nothing.)
- **Group 10 (fire), smoke through the vents:** use `ventLinks(map)` from `shared/underground.js` — `[{ a, b, area, duct
  }]`, `a`/`b` indices into `map.rooms` (b = −1: outside), the same graph the gas uses — or the gas graph itself
  (lib/gas.js's links with `vent` set). The grilles (`ventsOf(map).grilles`, with `c`, `nv`, `name`) for where smoke
  puffs out.
- **Floodgate:** nothing (the water stops at −0.45, under the cellar's grille at 0.04…0.40).

## Tests (dev/test-scripts/underground/)
- `srv.sh` / `stop.sh`: the test server on GAME_PORT (default 4250; HTTPS 4251), `BOTS=0`, `MAP=cs_mansion`,
  `FREEZE_TIME=1`, fresh data in `$SP/testdata`; stop.sh stops only what listens on that port.
- `t-radar.mjs` (server; 3 players): red dots in the living room; none in the cellar; the CT at the foot of the cellar
  stairs and the T at the top don't spot each other; CT2 in the kitchen does, but the underground CT's radar stays
  empty; pings and target calls refused underground.
- `t-echo.mjs` (server): shots and an HE in the cellar reach a CT on the street and one upstairs, with an origin
  `isUnderground` calls underground; a shot in the kitchen doesn't.
- `t-vents.mjs` (server; one T in warmup): an HE into each grille with the browser's own throw: cut at the grille,
  `ugDuct`, out of the other grille, the boom in the far grille's room at its full fuse (1.58–1.61 s of game time); a
  Molotov dropped into the bedroom's grille burns in the kitchen; a restart while one is in a duct: nothing comes out.
- `unit.mjs` (no server): the grilles (rooms, solid and unbreakable behind, clear mouths), the gas links, throws into
  each grille, the server module with a stand-in server (cut, duct, fuse kept, exit, where it goes off, a fuse running
  out in the duct, a Molotov, a new round, a throw nowhere near), and the gas reaching the bedroom.
- `clientsmoke.mjs` (`node --import ./dev/test-scripts/gas/register.mjs …`): the browser module in Node: the radar's
  signal in 11 places, messages, the echo with a fake sound kit, the grilles' mesh, listening (crouched/standing,
  sides, other rooms), hints, the duct rattle; nothing on the other 5 maps.
- `throws.mjs`: the throw search the tests share.
- `g-underground.mjs` (browser; server: `srv.sh ROUND_TIME=600 START_MONEY=16000 AUTO_BALANCE=0 BUY_TIME=300`, so the
  browser player and a scripted helper are both Terrorists and it stays warmup; `MAP=cs_mansion_night` for the night):
  the checks in STATUS, screenshots `gu_d_*` / `gu_n_*` in OUT. `edge.ps1` (re)starts the headless Edge on CDP 9650
  (no extensions, no sync, fresh profile, 960x540) and stops it by its PID and port only.
- `g-ugcost.mjs` (browser): the draw calls in the six grille views, the kitchen and the cellar (`AB=1`: each also with
  the grilles' mesh hidden). Run against this branch's server and `main`'s (e.g. `git archive main` into a scratch
  folder, its own `node_modules` copy, the server there on the same port).
- Lessons: the server's team balance moves a second Terrorist to the CTs (a round starts, buy time runs out):
  `AUTO_BALANCE=0`; close the page's socket (`__ws.close()`) before rejoining in the same tab, or the old player stays;
  a grenade thrown straight up from under a ceiling grille goes in within 0.05 s (no frame shows it): throw from a
  couple of metres to see it go in.
