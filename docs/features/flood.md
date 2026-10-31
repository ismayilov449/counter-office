# Floodgate (agent "flood", branch `feature/flood`)

## (a) README

For the cs_mansion section (it works the same on cs_mansion_night), after the storm drain:

  - **Floodgate**: a big red **valve wheel** on the storm drain's wall, a few steps from the ladder down from the
    street grate. Anyone can **hold E for 3 seconds** to open it: water gushes out of a pipe by the ceiling, loud
    enough to hear along the drain, and the underground floods in about 40 seconds — first the drain (after about
    14 seconds there's no air left in it), then up through the cellar's grate into the **cellar**, its stairs and
    the **smugglers' tunnel**, until the cellar is full to a metre under its ceiling and only a hand's breadth of
    air is left under the tunnel's. **Hold E 3 seconds again** to close it, and the water drains away slowly
    (about a minute and a half from full).
    - You **swim** in it like in the pool: slower, and hold **Space** to come up. Keep your head under too long and
      you **drown**: you hold your breath for 10 seconds (the **AIR** bar), then lose 10 health a second. The
      screen goes murky green under the water.
    - **Electrocution**: if the water reaches the **fuse box** in the cellar while the power is on, everyone in the
      water — the drain, the cellar, the tunnel — gets a heavy shock (the deeper you are, the worse: knee-deep is
      likely death), with sparks and a crackle, the lights flicker, and the fuse blows: the house goes dark as if
      the lever had been pulled. Bring the power back while the fuse box is still under water and it happens
      again. Cut the power at the fuse box first and nobody in the water is hurt — but the house is dark.
    - The water puts out fires under it and anyone burning who jumps in. A Molotov, flashbang or smoke grenade
      that lands in the water fizzles out; an HE grenade going off under water hurts only those in the water near
      it (walls don't break).
    - Every round starts dry.

Keys table: **E** (hold 3 s at the valve in the storm drain) opens or closes it — no new key.

## (b) RESUME notes

### Files
- `shared/flood.js` — constants and the pieces both sides use: `FLOOD` (valve position and reach, outlet, timings,
  levels, breath, damage), `floodLevel(fill)` (fill 0..1 → level: the drain to -3.0 at 0.35, the shaft to -2.2 at
  0.45, the cellar/tunnel to -0.45 at 1), `FLOOD_AREAS` (the spaces the water fills: `[x1, z1, x2, z2, floor,
  ceil]`), `floodMap(map)` (= `map.mansion2`), `waterTop(level, p)` / `underWater(level, p)`, `makeFloodBoxes()` /
  `setFloodBoxes(boxes, level)` (the boxes for `map.water`), `atValve(p)`.
- `shared/maps/mansion_flood.js` — `floodWorks({ brush, decor })`: the valve body and stem (`x_metal`, not solid:
  the drain is 1.2 m wide), five `pipe` decors (supply down from the ceiling; out of the valve west, up, west under
  the ceiling, down to the mouth) and a flange at the mouth. The wheel is not here (it turns: see the client).
- `lib/flood.js` — `createFlood(deps)` → `{ reset, tick, onUse, updateAct, douse, snap, state }`: the valve (an
  action `p.act.type === 'flood'`, 3 s, cancelled by letting go of E or moving > 0.6 m), the fill (`+dt/40` open,
  `-dt/90` closed), the boxes in `MAP.water` (so Deathmatch's `randomSpot` avoids flooded spots), breath and
  drowning (players and hostages), electrocution + fuse blowing, fires put out, burning players put out, grenades
  under water.
- `public/js/flood.js` — `init`, `setMap`, `onSnapshot`, `update`, `hint`, `actLabel`, `level`, `debug`: the water
  surface (one mesh with up- and down-facing quads for the areas the water's top is in, rebuilt only when that set
  changes; Phong + map + transparent like the map's own water, so no new shader), the wheel (one merged mesh,
  spins while `fl[2]`), the gushing column (two crossed sheets, while open and its mouth is above the water) with
  foam/bubble particles near the camera, the gush loop sound, the underwater tint (a fixed div, z-index 4) and fog
  (the scene fog's colour/near/far swapped while the camera is under, restored after), the AIR bar (in `#hud`,
  following the server's rule), bubbles and a blub when running out, a gasp on surfacing, the zap (sparks, a blue
  flash, a crackle, a flicker ending dark), fizzles and underwater HE (splash, muffled boom).
- Tests: `dev/test-scripts/flood/` — `srv.sh` (test server on 4040/4041, fresh `DATA_DIR` in `$SP/testdata`,
  BOTS=0, MAP=cs_mansion, FREEZE_TIME=1 unless given), `t1.mjs`, `t2.mjs`, `t3.mjs` (server), `swim.mjs` (Node
  only, the game's physics), `g1.mjs` (browser, not run to the end, see below).

### Hooks in existing files (each marked `// Floodgate`)
- `shared/maps/mansion2.js`: the import, and one call `floodWorks({ brush, decor })` in `remodel()` right after the
  storm drain block.
- `server.js`:
  - import `createFlood`;
  - after `notify` is defined: `const flood = createFlood({...})` (deps: `game, players, map: () => MAP, broadcast,
    send, notify, applyDamage, hurtHostage, eyeOf, lineOfSight, mates, cfg: CFG, now, sparkAt`);
  - `resetWorld()`: `flood.reset()` (round start, match start, map change);
  - `updateActions()`: `if (a.type === 'flood') { flood.updateAct(p, a, t); continue; }` at the top of the loop;
  - `onUse()`: `if (flood.onUse(p, t)) return;` just before the fuse box;
  - `explodeNade()`: `if (flood.douse(n)) return;` first line;
  - `tick()`: `flood.tick(t, dt)` right after `dt` is computed (before `bots.update`);
  - the snapshot head: `...flood.snap()`.
- `public/js/main.js`: the import; `flood.setMap(map)` in `loadMap()` before `prewarm()`; `flood.update(dt, now,
  camera)` in `frame()` after `updateCamera`; `flood.onSnapshot(m.fl)` at the end of the `s` handler; in `updateHud`
  one line before `hud.hint(hint)` (the valve's hint wins while you stand at it) and one after the progress chain
  (`if (me.act?.a === 'flood') hud.progress(flood.actLabel(), me.act.pr)` — it overrides the chain's fallback label);
  `flood.init({ scene, net, fx, me, game, applyLights })` just before `loadMap(DEFAULT_MAP)` at the bottom (it adds
  its handlers to `net.handlers`).
- `public/js/audio.js`: at the end, `export const floodKit = () => ctx running ? { ctx, noise, burst, tone } : null`.

### Protocol
- Snapshot: optional top-level `fl: [level (2 decimals), valve open 1/0, someone turning it 1/0]`, only on the
  Mansion maps and only while there's water above the drain's trickle, the valve is open or someone is turning it.
  No `fl` = dry, closed, untouched. The `me` action is `{ a: 'flood', pr }` while turning.
- Server → all: `floodValve { open, by, p }`; `floodZap { p: fuse box, v: [[x, y, z] of everyone hit] }` (followed
  by the usual `lights` message with `power: 'off'`); `floodFizzle { p, k, id }`; `floodBoom { p, id }`.
- Kill feed weapons: `drowned`, `electrocuted` (killer null; shown as `[drowned]` / `[electrocuted]`).
- Client → server: nothing new (the existing `use` on/off).

### Coordinates and numbers
- Wheel centre (23.8, -3.9, -2.2), facing +z off the drain's north wall (z -2.6), 3 m west of the street shaft's
  ladder; usable within 1.3 m (along the floor) with your feet between -5.5 and -3.8. Outlet mouth (22.4, -3.36,
  -2.45), pointing down from just under the drain's ceiling (it goes under water ~11 s after opening).
- Levels: base -4.88 (the drain's drawn trickle: "empty"), drain full -3.0 at ~14 s, the cellar floor -2.2 at ~18 s,
  the fuse box's bottom -1.35 at ~28 s, full -0.45 at 40 s. Standing on the cellar floor your eyes are at -0.58: under
  water only when full; swimming up you reach the cellar's ceiling with your eyes at 0.43. The tunnel full leaves
  0.25 m of air (eyes at -0.38 against its ceiling). The drain has none once full; the street shaft (-3.0…0) and
  the stairwell let you surface.
- Areas (`FLOOD_AREAS`): the drain's three legs (split so footprints don't overlap), the street and cellar shafts,
  the cellar, the stairwell, the tunnel's three legs (the first one cut at the cellar's wall). The hatch shaft up to
  the shed (from -0.25) is never reached.
- Breath 10 s, then 10 damage a second (armour doesn't help); back 2 s a second above water. Zap: 50 + 110 × depth
  (capped at 1 m) → 160, armour doesn't help. Underwater HE: 100 × (1 − d/7) to players in the water within 7 m in
  sight (friendly fire rules as for an HE).

### Shared-state contracts
- Reads `p.downed` (another agent's): a downed player's breath runs out 3× faster and drowning hurts 2×. It doesn't
  exist on this branch; the check is written (`FLOOD.downed`), untested.
- Reads `game.lights.power`; on electrocution writes `game.lights.power = false` and the fuse box's groups (like
  `setPower`, without its "X cut the power" notice) and broadcasts `lights`.
- Calls `sparkAt(fuseBoxPos, 'electric')` on electrocution if the gas agent's `sparkAt` exists in server.js scope
  (`typeof sparkAt === 'function'` in the deps; if it's an import or a `const`, that works too once merged).
- Writes `p.burnUntil = 0` (put out), fires' `f.until = 0` (put out, like a smoke grenade does), its own
  `p.floodAir`, `p.floodHurtAt`, `h.floodAir`, `h.floodHurtAt`.
- Doesn't read `p.playingDead`, `p.bleeding`, `p.disguise`, `p.shield`: someone playing dead under water drowns.

### For integration
- **The elevator shaft** (main checkout's agent) reaching the cellar: add one area to `FLOOD_AREAS` in
  `shared/flood.js` with the shaft's footprint, its floor (its bottom) and ceiling; the surface, swimming, drowning
  and electrocution follow. Keep footprints at the same height from overlapping (or the surface is drawn twice).
- **Gas**: `sparkAt` wiring as above (an electric spark in a gassy cellar).
- **Downed**: `p.downed` as above.
- `main.js` `localUse` (the line that freezes you the moment you press E at a use spot) doesn't know the valve:
  you can drift a little until the server's action arrives (~50 ms); the server cancels it only past 0.6 m.
- Lines that may conflict on merge: the snapshot head (`...flood.snap()` after the `dn` line), the `hud.hint` /
  `hud.progress` area in `updateHud`, the end of `audio.js`, `onUse` before the fuse box.

### Verified (server side; how)
- `t1.mjs` (4 scripted players, START_MONEY=16000): 18/18 — opening after holding E 3 s; the level each second
  (-4.67 at 1 s … -3.05 at 13 s, -2.14 at 18 s, -1.35 at 28 s, -0.45 at 40 s); with the power on, electrocution at
  28.2 s of the CT on the cellar floor and of the T keeping his head out in the street shaft, not of the CT on a dry
  step or the T on the street; the fuse blown (power off); a CT bringing the power back with the cellar full is
  electrocuted, which ends the round, and the next round is dry with the power on; with the power cut first, no
  electrocution; a CT left in the drain loses 10 a second from 20.9 s after opening and drowns; a Molotov into the
  water fizzles (no fire), an HE under water hurt the CT in the water (100 → 53), not the T on a dry step within
  range; closing after 3 s again; draining -0.47 → -0.75 in 8 s.
- `t2.mjs` on **cs_mansion_night**: 7/7 — letting go of E after 1.5 s does nothing (the snapshot said
  `[-4.88, 0, 1]` while turning, nothing after); walking away while holding does nothing; the rising water put out
  a Molotov fire on the cellar floor 1.1 s after it started; changing the map mid-flood: on Dust II no `fl` and E at
  the same spot does nothing; back on Mansion it's dry.
- `t3.mjs` with BOTS=4 (DEBUG_TICK=1), 75 s, the valve opened in both rounds (full to -0.45, a fuse blown): no server
  errors, tick 1.1–2.3 ms average (max 11.9).
- `swim.mjs` (Node, the game's physics and collision): in the full cellar the head is under standing on the floor
  and out holding Space (feet -1.19, against the ceiling); swimming to the stairs and walking up and out; the full
  drain has no air even against its ceiling; swimming along it (5.7 s under) and up the street shaft gets your head
  out; the tunnel's air pocket; the pool unchanged.
- `walls.mjs`: 0 missing, 0 drawn twice (the valve's faces don't double the drain's walls). The server starts with
  all 7 maps.

### Browser (partly verified, then stopped by the user's rule: no headless browser tests)
- One run of `g1.mjs` on cs_mansion (before the last three fixes) passed: the hint at the valve, the progress label
  "Opening the valve...", the wheel turning, the valve opening, the drain's water rising, under the water in the
  drain (tint, fog, the AIR bar draining), the tunnel's surface, the CT electrocuted at the fuse box and the power
  off, the next round's hint, no page errors. Screenshots looked at: the valve (`fl1`), the flooding drain (`fl3`),
  under water (`fl4`), the tunnel (`fl5`), the cellar in the blackout (`fl6`, too dark to judge), the round end after
  the zap. Draw calls at the valve view: 216 dry → 218 flooding (the surface and the gush).
- Fixed after that run, **not re-checked in a browser**: the gush was hidden after ~6 s (its mouth was low: moved
  up under the ceiling); the swim-up check stood the player under the cellar's table (moved; the physics passes in
  `swim.mjs`); the client eased the level down after a round reset instead of snapping (now snaps on a jump > 0.5 m).
- **Still to do in a browser** (`GAME_PORT=4040 CDP_PORT=<port> node dev/test-scripts/flood/g1.mjs`, srv.sh first):
  all 14 checks of `g1.mjs` (the gushing column visible for ~11 s; swimming up in the full cellar and out up the
  stairs by keyboard; the T floating in the cellar electrocuted with the CT, its sparks and flicker in `fl9`; the
  next round dry at once); the night map (no page errors, the water surface lit by the tunnel's glow); the cellar's
  surface with the power on; the sounds by ear (gush, clunk, crackle, fizzle, muffled boom, gasp, blub); the frame
  cost on a real Intel iGPU.

### Not verified / known gaps
- Grenades aren't slowed in flight by water (both sides simulate the flight without it); only where they go off
  counts.
- Bots don't swim and their nav doesn't know about the water: they walk along the bottom and may drown (none did in
  the soak; they rarely go underground).
- An electrocuted hostage brings up the existing "Someone killed a hostage! (-$1500)" notice, though nobody pays.
- Only your own bubbles are drawn (none for other players under water).
- The AIR bar follows the server's rule from your own position; the damage is the server's.
- The wheel keeps the angle it was turned to across rounds (cosmetic).
