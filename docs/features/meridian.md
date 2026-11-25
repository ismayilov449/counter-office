# cs_meridian — Hotel Meridian (the new map)

Concept: "Meridian, a hotel in a storm" (the 3D concept page the user picked, 2026-11-25). Built in three stages the
user plays between: 1. the layout, 2. looks + the lift + the laundry chute, 3. the storm + polish.

## STATUS
- **Stage 1 (2026-11-25): built, server-tested, not yet seen in a browser.** shared/maps/hotel.js (registered in
  shared/maps/index.js as `cs_meridian`). Four floors 4 m apart (lobby 0, guest floors 4 and 8, penthouse 12), 8 guest
  rooms a floor with bathrooms and connecting doors, the east stairwell (two lanes, flights stacked), the fire escape
  (west wall: balconies + one ladder from the side street to the penthouse), lobby / bar / kitchen / walk-in freezer,
  the penthouse suite + roof terrace with a pool and the stair hut, street (CT spawn, rescue zone) and alley. 44 doors,
  glass windows, night lighting (every room glows, lamps in the corridors), multi-floor radar.
- Tests: `node dev/test-scripts/meridian/check.mjs` (offline: spawns/hostages on floors and free; the nav grid reaches
  every hostage and the T spawn from the CT spawn, and every hostage can follow a route out to the street);
  `dev/test-scripts/meridian/t1-smoke.mjs` (live, `MAP=cs_meridian`: round starts, spawns on the street / penthouse,
  4 hostages, the freezer hostage follows a CT). Bots (`BOTS=4`) ran 50 s with no server errors.

- **Stage 2 (2026-11-25): built, server-tested, not yet seen in a browser.**
  - Furniture and dressing: wardrobes, TVs, bedside tables, rugs, paintings and lamps in every guest room; runners,
    paintings and plants in the corridors; the lobby's rug, plants, suitcases, bar stools and bottles; the kitchen's
    shelves, fridge and hob; the freezer's racks; the penthouse's headboard, TV wall and bar; loungers and an umbrella
    on the terrace; an awning over the entrance. Rugs are 6 cm thick (the bots' grid merges floors under 5 cm apart).
  - The lift (map.elevator): the Mansion's lift code made general (any number of stops: door sets, panel buttons,
    call buttons, the aim check; `home` = the stop it waits at, default 1). The shaft in the north-west corner, doors
    facing south; it ticks outside mansionTick on other maps (server.js).
  - The laundry chute (map.chute): a steel tube in the linen rooms' corner, hatches at waist height on each floor and
    the terrace, open at the bottom over a laundry cart in the lobby's laundry room; server.js chuteTick broadcasts
    'chute' (dropping in) and 'chuteland' (the thud). No fall damage in the game (only off the zip line).
  - Tests: check.mjs (+ the chute: a body dropped in lands on the cart; the hatches are open), t1-smoke.mjs (+ the
    chute's sounds), t2-lift.mjs (lobby -> penthouse -> called to the 3rd floor -> lobby). Mansion's lift: unit.mjs
    694/694; t-elev.mjs has one failure ("once he's out of the way it goes down") that fails the same before these
    changes.

## Next
- Stage 3: the storm (rain, lightning flashes, thunder covering footsteps, power cuts), the guest-room hostage in a
  different room every round, switching on the Mansion-only features here (power, phone tracker towers, War options).

## Known
- The fire escape's ladder goes from the street to the penthouse in one climb; the bots' nav uses it as a short way to
  the T spawn (exposed while climbing). The user should say if it's too strong.
- Ceilings are tiles under every slab; the slabs' tops are carpet / marble / parquet.
