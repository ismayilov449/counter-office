# Blood trails + bandage (P)

## STATUS
- **Done:** server, client and shared code; all hooks; `origin/main` (zip line, CCTV) merged in. Server-side and
  Node tests pass: `unit.mjs` (35 checks), `clientsmoke.mjs` (44 checks), `tblood.mjs` (33 checks, run twice),
  `floorindex.mjs`, `soak.mjs` with `BOTS=4` for 60 s on cs_mansion and on cs_mansion_night (no server errors), and
  the server starts on all 7 maps.
- **Tested on the Mansion only** (cs_mansion and cs_mansion_night), as the user asked. On the other maps the same code
  runs (the drops find the floor the same way), but nothing was tuned or checked there beyond the server starting.
- **Not done:** no browser test was run (user rule: no Edge until every agent has finished). `gblood.mjs` is written
  and ready, never run; no screenshots.
- **Next steps (architect):**
  1. Start the server: `GAME_PORT=4020 bash dev/test-scripts/blood/up.sh MAP=cs_mansion BOTS=0`, a headless Edge on
     9420, then `GAME_PORT=4020 CDP_PORT=9420 node dev/test-scripts/blood/gblood.mjs`. Look at `gb_*.png` in `OUT`.
  2. Browser checks still to do (by eye, in those screenshots or in a real game):
     - the drops look like blood (dark red blobs with small splashes), the right size, lying flat on the street,
       on each cellar step, tilted on the house's sloped roof; no flicker or z-fighting, no drop floating or sunk;
     - they darken over about 15 s and fade out between 30 and 40 s; the cap (600) and **one extra draw call** for all
       of them (`gblood.mjs` measures it);
     - at night (cs_mansion_night): lit like the floor around them (the room lighting patch), not glowing, not black;
     - no freeze at the first drop of a map (the shader is compiled in `prewarm`);
     - the BLEEDING badge next to HP/AP, the "Bandaging..." bar, P, slow walking, the gun lowered and back up, no
       shooting meanwhile, the messages;
     - the "P bandage (when bleeding)" line at the end of the Esc menu's controls list (added from `blood.js`);
     - frame time on a laptop with 600 drops on screen; no page errors.
  3. Merge order and links with other features: see "Interactions for integration" below.
- **Tests** (`dev/test-scripts/blood/`):
  - `unit.mjs`: `node dev/test-scripts/blood/unit.mjs` (lib/blood.js with fake players, no server);
  - `clientsmoke.mjs`: `node --import ./dev/test-scripts/blood/register.mjs dev/test-scripts/blood/clientsmoke.mjs`
    (public/js/blood.js with a fake page, real three.js, real maps; no server);
  - `floorindex.mjs`: `node dev/test-scripts/blood/floorindex.mjs` (the floor index on every map, sampled on the
    Mansion);
  - `tblood.mjs`: `GAME_PORT=4020 node dev/test-scripts/blood/tblood.mjs` against `up.sh MAP=cs_mansion BOTS=0` (~2 min);
  - `soak.mjs`: `GAME_PORT=4020 node dev/test-scripts/blood/soak.mjs 60` against `up.sh MAP=cs_mansion BOTS=4`;
  - `gblood.mjs`: the browser test (see above). `evalpage.mjs`: evaluate an expression in that page.
  - `up.sh [ENV=VAL ...]`: (re)starts the test server on 4020/4021 with fresh data in `$TEMP/co-blood/testdata`.

## (a) README

- **Blood trails** — a player hit by a **bullet, a knife or shrapnel** (any explosion except fire) starts to
  **bleed**: drops of blood fall on the floor behind him as he moves, about one every 0.7 m, and now and then while
  he stands still. It's for tracking a wounded enemy, not for killing him: bleeding costs little or no health.
  - It lasts **20 seconds** from the last wound, or until bandaged. Heavier wounds bleed more: under 30 damage (added
    up while you bleed) a light bleed (a drop every ~0.85 m, one every ~4 s standing still, no health lost), from 30 a
    medium one (every ~0.7 m, ~2 s still, 1 HP every 5 s), from 60 a heavy one (every ~0.5 m, ~1 s still, bigger
    drops, 1 HP every 2.5 s). Bleeding alone never takes you below 10 HP.
  - **P bandages** you: it takes **2 seconds**, you walk slowly and can't shoot or throw meanwhile, and the bleeding
    stops. **Two bandages a life.** Not while driving, flying the drone, on the zip line or downed. A BLEEDING badge
    next to your HP shows how many you have left.
  - The drops are seen by everyone. They lie on floors, stairs, slopes and roofs (not in water), darken as they dry,
    fade out after about 40 seconds and are cleared every round. At most 600 are on the map at once (the oldest go
    first). No drops from someone in a car.
  - Zombie mode: humans bleed (a zombie's claws on armor draw blood), zombies never do. Deathmatch and Gun Game: the
    same as a classic round, with two fresh bandages each life. Hide and Seek: a knifed hider who gets away leaves a
    trail. Bots bleed like anyone but never bandage and don't follow trails.
  - A camouflaged player still drips: blood can give a hiding place away.

## (b) RESUME notes

### Files
- `shared/blood.js`: `BLOOD` (all the numbers: `secs` 20, `medium` 30 / `heavy` 60 damage, `spacing` [-, 0.85,
  0.7, 0.5] m, `idle` [-, 4, 2.2, 1.1] s, `size` [-, 0.16, 0.22, 0.3] m, `drain` [-, 0, 5, 2.5] s per HP, `minHp` 10,
  `life` 40 s with `fade` 10 s, `max` 600, `bandage` 2 s, `bandages` 2, `slow` 0.45, `downed` level 3),
  `bleedLevel(dmg)`, the `bl` flags `BL_BANDAGING` (1) and `BL_NODROPS` (2).
- `lib/blood.js`: `bleeds(weapon, part)` (what draws blood) and `createBlood({ players, now, send, sendMe, inTeam })`
  returning `{ wound, bandage, busy, tick, snap }`.
- `public/js/blood.js`: `BloodTrails` — the drops (one `InstancedMesh`, `MeshLambertMaterial` with the room lighting
  plus an age-based dry/fade in the shader from a per-instance birth time, so nothing is updated per frame; only the
  new drop's slots are uploaded), the floor index, the HUD (badge in `#bottom-left`, bar in `#hud`, the P line in the
  Esc menu's `.controls`), bandaging on the client side.
- Tests in `dev/test-scripts/blood/` (see STATUS), `loader.mjs` / `register.mjs` (browser paths for Node).

### Hooks in existing files (each marked "blood")
- `server.js`
  - import, and `const bleed = createBlood(...)` right after the bots' `BotManager`;
  - `clawHit`: `bleed.wound(target, dmg, 'claws', 'chest')` when armor soaks a zombie's claws;
  - `applyDamage`: `bleed.wound(v, d, weapon, part)` right after `v.hp -= d` (before the CCTV line);
  - `onShoot`, `onNade`, `onMortar`: `if (bleed.busy(p)) return;` after their first check line;
  - `handle`: `case 'bloodBandage': bleed.bandage(p, t)`;
  - `tick`: `bleed.tick(t)` after `updateCamo(t)`; the snapshot head: `...bleed.snap()` after `dn`.
- `public/js/main.js`
  - import (after `createGadgets`); `const bleed = new BloodTrails(scene, { me, remotes, net, hud, audio, coll: () =>
    coll, map: () => map })` right after `new Net(...)` (it adds its handlers to `net.handlers`);
  - `prewarm`: `bleed.warm(...)`; keydown: `case 'KeyP': bleed.bandage()`; snapshot `s`: `bleed.onSnapshot(m.bl)`
    after the players loop; `round`: `bleed.clear()`; `updateLocal`: `speed *= bleed.speedMul()`; `frame`:
    `bleed.update(dt, now, !!killcam)`.

### Protocol
- Snapshot key **`bl`** (only when someone bleeds): `[[id, level 1..3, flags]]`, flags 1 bandaging, 2 no drops (in a
  car). Everyone gets it (the drops are public). The drops themselves never cross the network: each browser drops
  them behind the players `bl` names, from where it draws them, with its own randomness.
- Client → server: `{ t: 'bloodBandage' }` (P).
- Server → the player: `{ t: 'bloodBandage', s: 'start', dur: 2000, left }`, `{ t: 'bloodBandage', s: 'done', left }`,
  `{ t: 'bloodKit', left }` (every new life, humans only); refusals go out as the existing `{ t: 'msg', text }`.
  The bleeding's HP loss goes out as the existing `me` message (no `dmg`, so no hit marker or flash).

### Contract fields (on the server's player)
- Owned here: `p.bleeding` (0, or level 1..3: what other features read), `p.bleedDmg`, `p.bleedUntil`, `p.bleedHpAt`,
  `p.bandageUntil` (0 when not bandaging), `p.bandages`, `p.blSeq` (the `spawnSeq` it last reset on).
- Read here: `p.downed` (body branch: a downed player is listed as bleeding heavily all the time, `p.bleeding ||
  p.downed`; no HP drain while down; can't bandage), `p.playingDead` (body branch: not listed, so no drops give the act
  away; the bleeding goes on underneath), `p.zip` (no bandaging on the zip line), `p.driving` / `p.riding` (no
  bandaging while driving; no drops in a car), `p.piloting`, `p.zombie`, `p.spawnSeq`, `p.bot`.

### How a drop finds the floor (`BloodTrails.floor`)
- A ray down the collision from 0.5 m above the feet (2.3 m long) gives the collision's top. On the converted levels
  (the Mansion, Dust II, Inferno, Assault) the collision is hidden boxes and a slope is a stair of 0.1 m steps, so the
  drawn faces are indexed too (upward faces, `ny` ≥ 0.55, in a 2 m grid; ~3 ms to build on the Mansion): the highest
  drawn face from 0.2 m under to 0.3 m over the collision's top wins, with its tilt. A face lower than that is under
  something the faces don't draw (the gazebo's floor, a decor model 0.25 m up), so the collision's top is used there.
  Box-only maps (de_dusty, aim_map) use the boxes. No drop in water; no drop with no floor within ~1.8 m under the
  feet (a jump, the zip line high up).
- Checked on the Mansion (`clientsmoke.mjs`): at all 30,131 standing spots on a 0.5 m grid (and 3,388 on the night map
  at 1.5 m) a drop finds a floor; 98.9% lie within 12 cm of the collision's top, the rest on a drawn surface above it
  (the sloped house roof is drawn up to 0.14 m above its collision steps); none on anything steep; the cellar stairs,
  the gazebo, the fountain (none) and the living room checked one by one.

### Verified (feature/blood, ports 4020/4021)
- `unit.mjs`: what bleeds; levels; damage adding up; burns, zombies and the dead don't start bleeding; the HP drain
  (medium, heavy, never below 10, none for light); stopping after 20 s; every bandage refusal (not bleeding, driving,
  drone, zip line, downed, spectator); P spam; bandaging start/busy/done; running out; killed or turned into a zombie
  while bandaging; a new life; `bl` rows for a passenger and a driver (flag 2), downed (level 3, no drain), playing
  dead (not listed), spectators; a new round clears everyone.
- `tblood.mjs` (cs_mansion, two scripted players): a USP shot bleeds (medium), bandaging (message, flag, a shot during
  it refused, stops the bleeding, shooting works after); refused when not bleeding; a leg shot bleeds lightly;
  the bandages run out; stops by itself after ~20 s; dead not listed; fresh bandages next round; a knife stab bleeds
  heavily and costs 2 HP in 5.4 s; P three times starts one bandage; a grenade while bandaging refused, thrown after;
  Zombie mode (claws on a vest bleed, a shot zombie doesn't); Deathmatch (bleeds, bandages, fresh kit on respawn).
- `clientsmoke.mjs`: handlers on `net`, one instanced mesh, the HUD parts, the P line, the shader patch (room light +
  age), prewarm drop gone next frame, the wound's first drops, spacing while walking (medium ~0.75 m, heavy closer and
  bigger), drops while standing still, flat on the street, no line after a teleport, none in a car / in the kill cam /
  once unlisted / without a position, the cap and the ring, fading clears the mesh, round clear, water, the stairs,
  the whole-map survey above, a map change, the local player (message, badge, own drops, none while driving, P,
  bandaging: slow, no shooting even after a weapon switch, bar, done; killed while bandaging; no bandages left).
- `soak.mjs` with `BOTS=4`, 60 s, cs_mansion and cs_mansion_night: 5–6 bots bled at all three levels, every `bl` row
  valid, no bot ever bandaged, no server errors.
- The server starts on all 7 maps and serves `/js/blood.js` and `/shared/blood.js`.

### Not verified / known gaps
- Nothing in a browser (see STATUS). The drops' look, lighting and frame cost are unchecked.
- Dust II, Inferno, Assault, de_dusty, aim_map: only that the server starts (the user said not to spend effort there).
- `p.downed` / `p.playingDead` only in `unit.mjs` (the body feature isn't on this branch).
- Each browser places its own drops (same path, different scatter); someone who joins late doesn't see older drops.
  In the kill cam no drops are made (others are drawn in the past).
- There is no gore setting in the game, so the drops are always on (like the gore itself).
- A wound while bandaging is stopped too when the bandage finishes. Revived players (body) keep whatever bleeding
  they had before going down; its 20 s run on.
- Seen while testing, not this feature's: on the Mansion, the living room's collision over the cellar (box x −23.2
  … −15.54, z −5.79 … 4.8) has its top at 0.91 while the floor is drawn at 0.813, so players there stand 10 cm above
  the drawn floor (the drops lie on the drawn floor).

### Interactions for integration
- **body** (`p.downed`, `p.playingDead`): already read here. On the client, the badge offers "P bandage" to a downed
  player (the server refuses with a message); hide that line when the local player is downed, once its client field
  exists.
- **disguise**: `headFor` makes the fooled team's copy of the snapshot head by splicing its `pl`. That head now
  also has `bl`, which names the wearer by his real id: in the fooled copy rename him to the dead player's id (or drop
  his row). Otherwise the fooled team sees no trail behind the wearer (the client drops blood only behind players in
  `pl`) and a hacked client could read that the wearer is alive.
- **shield**: a T holding a hostage can still bandage (P is not E); decide whether to forbid it (one line in
  `bandage()`: `if (p.shield != null) return say(...)`).
- **gas / flood**: `bleeds(weapon, part)` decides: a blast through `applyDamage` with part `'he'` bleeds (shrapnel)
  unless its weapon is `'molotov'`; fire with another part, and names that aren't guns in `WEAPONS` (drowning,
  electrocution, ...), don't. Check the names those branches pass when merging. Drops are never put in water
  (`map.water`); if the flood adds water volumes at run time, drops already on the floor stay (they fade in 40 s).
- Keys: only P is used.
