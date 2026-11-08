# Walls & water (ROADMAP group 2, branch `feature/walls`)

## STATUS
- **2.1 See-through bullet holes: done** (server and node tests pass; browser test still to run).
- **2.2 Burst pipes and live wires: done** (server and node tests pass; browser test still to run).
- 2.3 Wet guns jam: next.
- 2.4 Bodies float up in the flood: not started.

## Where the hidden pipes and cables are (for the other wave-1 groups)
All inside existing interior plaster walls of the house; no geometry is added for them (only small sockets and
radiators drawn on the walls as hints, by `public/js/walls.js`). Coordinates in metres (x, y, z), the ground floor at
0.81, the upper floor at 4.27. None is in the living room (group 4's fireplace), above the lift shaft (group 3), or in
the cellar. The data: `shared/maps/mansion_walls.js`.

| Run | Kind | Wall | Inside the wall at | Along | Height | Hint |
|---|---|---|---|---|---|---|
| W1 | water pipe | kitchen ↔ north-east room | x −13.1 | z −13.95…−10.25 | y 1.66 | radiator, kitchen side, z −10.75 |
| E1 | cable | same wall | x −13.1 | z −13.95…−10.25 | y 1.11 | sockets |
| W2 | water pipe | hall ↔ south-east room (ground floor) | z 6.70 | x −11.4…−6.86 | y 1.66 | radiator, hall side, x −7.5 |
| E2 | cable | same wall | z 6.70 | x −11.4…−6.86 | y 1.11 | sockets |
| E3 | cable | hall ↔ north-east room (ground floor) | z −9.95 | x −11.4…−6.86 | y 1.11 | sockets |
| W3 | water pipe | the two south rooms (ground floor) | x −16.35 | z 4.95…10.90 | y 1.66 | radiator, south-east room's side, z 7.95 |
| W4 | water pipe | upper hall ↔ north-east bedroom | z −9.95 | x −15.35…−6.86 | y 5.12 | radiator, gallery side, x −9.2 |
| E4 | cable | same wall | z −9.95 | x −15.35…−6.86 | y 4.57 | sockets |
| E5 | cable | upstairs partition west of the upper hall | x −16.35 | z −5.4…−1.3 and 0.9…10.9 | y 4.57 | sockets |
| (risers) | cable | up from every light switch in the house to the ceiling | the switch | vertical | switch → ceiling | the switch |
