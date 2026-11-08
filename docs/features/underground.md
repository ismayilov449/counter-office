# Feature: Underground & vents (group 5, branch `feature/underground`)

## STATUS
- **In progress.** The underground areas and the vent grilles are chosen (below); 5.1 (no radar underground) is next.

## The vent grilles (chosen first, so the other wave-1 groups can avoid them)
Three short ducts, a grille at each end (`shared/underground.js`, `GRILLES`/`DUCTS`). Every grille sits where nothing
ever breaks (the cellar's walls, the house's foundation, the slab between the storeys), and none is in the living room
(group 4's fireplace and chimney), on the roof or by the lift's shaft (group 3), or in a wall with pipes or cables
(group 2 builds those).

| # | Grille | Where (x, y, z in m) | Duct to |
|---|---|---|---|
| 0 | cellar, high in the west wall (over the gap between two wine racks) | plate x −22.9, y 0.04…0.40, z −2.5…−1.9, facing +x | 1 (1.0 m) |
| 1 | back lawn, at the foot of the house's west wall (the foundation) | plate x −23.67, y 0.04…0.40, z −2.5…−1.9, facing −x | 0 |
| 2 | kitchen ceiling (west of the kitchen lamp) | plate y 4.06, x −20.3…−19.8, z −11.0…−10.5, facing down | 3 (1.9 m) |
| 3 | floor of the north-west bedroom upstairs (above the kitchen) | plate y 4.27, x −18.6…−18.1, z −11.0…−10.5, facing up | 2 |
| 4 | ceiling of the ground floor's north-east room | plate y 4.06, x −9.6…−9.1, z −11.3…−10.8, facing down | 5 (1.9 m) |
| 5 | floor of the security room (CCTV), above it | plate y 4.27, x −8.0…−7.5, z −11.3…−10.8, facing up | 4 |

The ducts themselves are not drawn and not crawlable (they run inside the walls and the slab).

## The underground areas (5.1, reused by 5.2)
`shared/underground.js` `AREAS`: the cellar (with the lift's pit), the lower part of its stairwell (below y 0), the
smugglers' tunnel, the storm drain and its street shaft (half way up), the old water tunnel under the north lawn.
