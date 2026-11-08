# Power & machinery (ROADMAP group 3, branch `feature/power`)

## STATUS (2026-11-08: 3.1 built and server-tested; 3.2 and 3.3 written, their tests next)

- **Done:** 3.1 circuits, the breaker panel and the generator (server, browser, geometry); its server test `t1.mjs`
  30/30, `unit.mjs` 55/55, `client-node.mjs` 37/37; t17cctv 17/17, t-elev 35/35, flood t1 18/18 still pass.
- **Half-done:** 3.2 (the surge) and 3.3 (the cable) are in the code already (lib/power.js, the lift's `fall`), not yet
  tested on a server.
- **Next:** 3.2's test, 3.3's test, the docs below, BOTS=4, draw cost; the browser test when allowed.

## Footprints (for the other wave-1 groups: please keep clear)

All on `cs_mansion` and `cs_mansion_night` (the night map spreads the day map). Metres, y up.

| What | Where | Notes |
|---|---|---|
| **Breaker panel** | Cellar, on the north wall (face z −5.49), x −17.30…−16.60, y −1.30…−0.40, sticking out to z −5.37 | 1.3 m east of the fuse box (x −18.6…−18.0). Keep the floor in front of it clear (x −17.6…−16.3, z −5.49…−4.4). |
| **Generator** | Garage, against the south wall: x −20.25…−18.95, z −15.30…−14.50, y 0…0.85 | Between the kitchen steps (x −22.15…−20.95) and the oil drums (x −17.35…). A solid, `keep`. |
| **Machine room** | Roof, straight over the lift's shaft: outer x −22.20…−19.20, z −5.75…−3.20, floor 9.90, roof top 12.45 | Cut into the west slope of the house's roof. Open doorway in its east wall (z −4.95…−4.00). Everything `keep`. |
| **Roof ladder** | Roof terrace, against the eave of the house's front (east) wall: x −6.20…−5.70, z −4.20…−3.60, from the terrace (4.27) to 7.95 | 4 m south of the zip line (z −8.0), clear of its pole, tensioner and stand. |
| **Way over the roof** | From the ladder's top (−6.2, 7.0, −3.9) west up the roof to the ridge (x −15.4, 12.27) and down to the machine room's door | The roof is walkable already (its collision is fine steps); please put no chimney stack or vent in the strip z −5.8…−2.6 between x −22.3 and −6.2. |
| **Lift pit buffers** | In the shaft's pit, drawn only (not solid): x −21.20…−20.95 and −20.15…−19.90, z −4.60…−4.35, y −3.40…−3.15 | Where a falling cabin lands (its floor at −3.05). |
