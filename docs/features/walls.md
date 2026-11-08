# Walls & water (ROADMAP group 2, branch `feature/walls`)

## STATUS
- **2.1 See-through bullet holes: done** (server tests and node tests pass; browser test still to run).
- 2.2 Burst pipes and live wires: next.
- 2.3 Wet guns jam: not started.
- 2.4 Bodies float up in the flood: not started.

## Where the hidden pipes and cables are (for the other wave-1 groups)
All inside existing interior plaster walls of the house; no geometry is added for them (only small sockets and
radiators drawn on the walls as hints, by `public/js/walls.js`). Coordinates in metres (x, y, z), the ground floor at
0.81, the upper floor at 4.27. None is in the living room (group 4's fireplace), above the lift shaft (group 3), or in
the cellar.

| Run | Kind | Wall | Inside the wall at | Along | Height |
|---|---|---|---|---|---|
| W1 | water pipe | kitchen ↔ north-east room | x −13.1 | z −13.95…−10.25 | y 1.45 |
| E1 | cable | same wall | x −13.1 | z −13.95…−10.25 | y 1.11 |
| W2 | water pipe | hall ↔ south-east room (ground floor) | z 6.70 | x −12.85…−6.86 | y 1.05 |
| E2 | cable | same wall | z 6.70 | x −12.85…−6.86 | y 1.40 |
| E3 | cable | hall ↔ north-east room (ground floor) | z −9.95 | x −13.85…−6.86 | y 1.11 |
| W3 | water pipe | the two south rooms (ground floor) | x −16.35 | z 4.95…10.90 | y 1.60 |
| W4 | water pipe | upper hall ↔ north-east bedroom | z −9.95 | x −15.35…−6.86 | y 4.85 |
| E4 | cable | same wall | z −9.95 | x −15.35…−6.86 | y 4.57 |
| E5 | cable | upstairs partition west of the upper hall | x −16.35 | z −5.4…−1.3 and 0.9…10.9 | y 4.57 |
| (risers) | cable | up from every light switch in the house to the ceiling | the switch | vertical | switch → ceiling |
