# ROADMAP — Counter-Office: the next 33 features (approved 2026-11-01)

The user approved these 33 features on 2026-11-01. They are grouped so that **one agent builds one group**: features
that share a game system or the same code are in the same group, so two agents never work on the same thing.

**Nothing here is started yet.** Every group builds on the 9 features still on their branches (bet, blood, cat, shield,
disguise, downed/play dead, gas, floodgate, elevator) and the hostage fix. **Start only after those are browser-tested
and merged into `main`** (see RESUME.md section 0).

## All 33 features at a glance

| Order | Group | Features, in build order |
|---|---|---|
| 1 | Downed & wounds | 1.1 Drag a downed teammate · 1.2 Interrogate a downed enemy + the downed suicide · 1.3 Wounds with consequences · 1.4 Adrenaline syringe |
| 2 | Walls & water | 2.1 See-through bullet holes · 2.2 Burst pipes and live wires · 2.3 Wet guns jam · 2.4 Bodies float up in the flood |
| 3 | Power & machinery | 3.1 Circuit breaker per floor + garage generator · 3.2 Power surge · 3.3 Cut the elevator cable |
| 4 | Stealth & hiding | 4.1 The chimney · 4.2 Creaking floorboards · 4.3 Hide in the car trunk |
| 5 | Underground & vents | 5.1 No radar underground · 5.2 Echo in the tunnels · 5.3 Air vents |
| 6 | Hostages | 6.1 Hostages try to escape (zip ties) · 6.2 Carrying wounded hostages |
| 7 | Explosives | 7.1 Throw a grenade back · 7.2 Booby-trapped body · 7.3 Dead man's switch · 7.4 Cut the wire |
| 8 | Close combat | 8.1 Suppressors · 8.2 Disarm from behind · 8.3 Door fights |
| 9 | Sight | 9.1 Eyes adjust to darkness · 9.2 Night windows act as mirrors · 9.3 Visible breath in the cold |
| 10 | Fire | 10.1 Real fire that spreads · 10.2 Fuel cans in the garage · 10.3 Throw a lit lighter · 10.4 Fire hose |

Each feature's full description is in its group's section below.

## Order of the groups

The groups are numbered in the order they start. Wave 1 builds the base systems; each wave 2 group waits for the
wave 1 group(s) it builds on.

| Order | Group | Branch | Wave | Waits for | Groups that need it |
|---|---|---|---|---|---|
| 1 | Downed & wounds | `feature/wounds` | 1 | — | 6 Hostages, 7 Explosives (dragging a body) |
| 2 | Walls & water | `feature/walls` | 1 | — | 8 Close combat (shooting code), 10 Fire (materials, wet floors) |
| 3 | Power & machinery | `feature/power` | 1 | — | 9 Sight (rooms dark per floor), 10 Fire (generator fuel) |
| 4 | Stealth & hiding | `feature/stealth` | 1 | — | 10 Fire (lighting the fireplace closes the chimney) |
| 5 | Underground & vents | `feature/underground` | 1 | — | none (vents later carry fire smoke too) |
| 6 | Hostages | `feature/hostage-escape` | 2 | 1 | — |
| 7 | Explosives | `feature/explosives` | 2 | 1 | — |
| 8 | Close combat | `feature/closecombat` | 2 | 2 | — |
| 9 | Sight | `feature/sight` | 2 | 3 | — |
| 10 | Fire | `feature/fire` | 2 | 2, 3, 4 | — (it links to almost everything, so it goes last) |

**Rolling start, not strict waves:** start wave 1 (groups 1–5). Whenever a wave 1 group is tested and merged, start the
groups that were waiting on it:
- 1 merged → start 6 and 7;
- 2 merged → start 8;
- 3 merged → start 9;
- 2, 3 and 4 all merged → start 10.

**Test and merge order:** 1, 2, 3, 4, 5, then wave 2 as it finishes. This frees the most waiting groups first.

**Limits (the user's rules):**
- at most **5 agents building** at once;
- at most **2 agents testing in a browser** at once, each with one headless Edge;
- the test Edge is started with `--disable-extensions --disable-sync`, the test servers with `BOTS=0`.

## Rules for the agents

The same rules as the 9-feature build (RESUME.md section 0):
- **Feature code in new files:** `lib/<name>.js`, `public/js/<name>.js`, `shared/<name>.js`, and Mansion geometry in
  `shared/maps/mansion_<name>.js` via one call in `remodel()`. Only small, marked hook lines go in shared files.
- **Own snapshot keys** per feature, and check the key isn't taken (`el` is the round time).
- **Mansion maps only:** build and test on `cs_mansion` and `cs_mansion_night`. For the other maps, only check that the
  server still starts with all 7.
- **Cheap to draw:** the players use laptops with Intel integrated graphics. Fire, smoke, water, reflections and particles
  must stay within a few draw calls; measure with `viewer.js` against `main`.
- **Notes:** each group writes `docs/features/<group>.md` (STATUS, the README text for players, RESUME notes, the links
  still to wire at merge). Push the group's branch, never `main`.
- Within a group, build the items **in the order below**. After each item: tests pass, commit, push (a safe point to
  stop at).

---

## 1. Downed & wounds (`feature/wounds`, wave 1)

Builds on: downed / play dead, blood trails and the bandage.

1. **Drag a downed teammate.** Pull a downed teammate behind cover before reviving, slowly and with only a pistol. It
   makes revives more tactical. *First, because groups 6 and 7 reuse dragging.*
2. **Interrogate a downed enemy, and the downed suicide.**
   - Hold E on a downed enemy for 3 s: one of their living teammates shows on your radar for 5 s, before you finish
     them.
   - **The user's addition:** a downed player waiting for a revive may see an enemy coming first. So he can shoot himself
     in the head with his pistol, dramatically, taking 5 s, so the enemy gets no information.
3. **Wounds with consequences.**
   - Shot in the leg: you limp.
   - Shot in the arm: your aim shakes.
   - A graze to the head: your vision blurs.

   A bandage only partly fixes it. It deepens blood trails and downed.
4. **Adrenaline syringe.** Revives a downed teammate in 2 s instead of 5, but they get up with blurred vision and shaking
   aim for a while. Speed versus risk. *After wounds, because it reuses the blur and shake effects.*

Links: a teammate being dragged still bleeds (trail); a headshot still means no revive; the cat, disguise and bet rules
for downed players stay as they are.

## 2. Walls & water (`feature/walls`, wave 1)

Builds on: the floodgate, gas (`sparkAt`). **Today bullets don't go through walls at all**: this group adds it first.

1. **See-through bullet holes.**
   - Bullets go through wood and plaster, but not brick or stone.
   - A wall shot full of holes becomes see-through: you peek through the holes, and light shines out of them in the
     dark.

   *First: it adds the material of each wall (wood, plaster, brick, stone), which the pipes and Fire use.*
2. **Burst pipes and live wires.**
   - Bullets through walls hit hidden water pipes, which spray and soak the floor.
   - They also hit electrical cables, which spark.
   - A wet floor with a sparking wire electrocutes anyone standing in the water, and sparks set off gas.

   It links water, power and gas into one trap. *This adds the wet floor and the electrocution that the fire hose reuses.*
3. **Wet guns jam.** After swimming or wading through the flood, your gun sometimes jams until it dries. Tap R to clear
   it.
4. **Bodies float up in the flood.** In a flooded cellar the dead float to the surface. Grim, but it tells you who
   drowned down there.

Links: a cable's sparks stop when its circuit is off (group 3); the fire hose soaks floors (group 10).

## 3. Power & machinery (`feature/power`, wave 1)

Builds on: the fuse box and blackout, CCTV, the elevator, gas (`sparkAt`).

1. **A circuit breaker per floor, plus a generator in the garage.**
   - Cut the power upstairs only, or only the cellar. The CCTV and the elevator each sit on a circuit.
   - CTs can start the loud, noisy generator in the garage to bring the lights back.

   It turns the blackout into a fight over power. *First: the surge and the cable build on the circuits.*
2. **Power surge.** When the power comes back, a few bulbs burst with sparks, and in a room full of gas that spark blows
   it up. Restoring the power becomes dangerous.
3. **Cut the elevator cable.** A Terrorist cuts the cable in the machine room on the roof (to build: there is none yet),
   and the cabin falls with everyone inside. The emergency brake catches it only sometimes. It makes the elevator truly
   frightening.

Links: the generator runs on the fuel from the fuel cans (group 10); the estate fence isn't on the map, so it has no
circuit.

## 4. Stealth & hiding (`feature/stealth`, wave 1)

Builds on: the cars, footsteps.

1. **The chimney.**
   - Build a fireplace in the living room (there is none yet; the elevator shaft is in the north-west corner) and a
     chimney up to the roof.
   - Climbing it is a secret vertical route.
   - You come out covered in soot and leave black footprints for 20 s.
   - Lighting the fireplace closes the route.

   *First, because Fire waits on the fireplace.*
2. **Creaking floorboards.** Some floorboards and stairs creak, even when you walk slowly (Shift). Learn the house and
   step on the edges of the stairs to stay silent.
3. **Hide in the car trunk.** Climb into a car's trunk and wait. Whoever drives the car carries you along. Then jump out.

Links: the lit fireplace becomes a real fire with group 10.

## 5. Underground & vents (`feature/underground`, wave 1)

Builds on: the cellar, tunnels and storm drain, the radar, gas.

1. **No radar underground.** In the cellar, the tunnels and the drain your radar loses signal. Down there you rely on your
   ears. *First: it marks out the underground areas, which the echo reuses.*
2. **Echo in the tunnels.** A gunshot underground echoes through the whole house, so everyone knows a fight is happening
   down there.
3. **Air vents.** Ducts connect the rooms. Listen at a grille to hear the next room, or drop a grenade down a vent.
   Watch out: gas travels through the vents too. *Last: the biggest, with new map work.*

Links: smoke from fires also travels through the vents (group 10).

## 6. Hostages (`feature/hostage-escape`, wave 2, after group 1)

Builds on: the hostage fix, the human shield, dragging (group 1).

1. **Hostages try to escape.** A hostage left unwatched sneaks towards a door, so Terrorists must guard them or zip-tie
   them (hold E). CTs cut the ties to lead them out. It pairs with the human shield.
2. **Carrying wounded hostages.** A badly hurt hostage can't walk. A CT has to carry them on his shoulder, slowly and
   with only a pistol. *Reuses dragging from group 1.*

## 7. Explosives (`feature/explosives`, wave 2, after group 1)

Builds on: grenades, satchels, the bomb, disguise, downed, dragging (group 1).

1. **Throw a grenade back.** A grenade lands at your feet: grab it and throw it back. You have about a second, and a
   mistake is fatal. *First: grenade handling, which the booby trap builds on.*
2. **Booby-trapped body.** A Terrorist hides a grenade under a dead teammate. Whoever inspects the body, takes its
   uniform or drags it sets it off. It punishes careless disguises.
3. **Dead man's switch.** A Terrorist with satchels out can hold a dead man's switch. If he's killed, all his satchels go
   off. Shooting him becomes a terrible decision. It pairs with the satchels and downed.
4. **Cut the wire.** While defusing the bomb or a satchel you can gamble: cut the red or the blue wire. Guess right and
   it's defused instantly; guess wrong and it explodes. For desperate last seconds.

## 8. Close combat (`feature/closecombat`, wave 2, after group 2)

Builds on: the shooting code (with bullets through walls from group 2), gas, darkness, doors.

1. **Suppressors.** Buy one for your gun. It's quieter, does a bit less damage, and has no muzzle flash, so it won't
   ignite gas and doesn't show you in the dark.
2. **Disarm from behind.** Sneak up behind an enemy and snatch the gun out of his hands, leaving him with only a knife.
3. **Door fights.** Kick a door open to knock down whoever stands behind it, or hold a door shut while someone pushes
   from the other side. The stronger push wins.

## 9. Sight (`feature/sight`, wave 2, after group 3)

Builds on: the room lighting, the blackout and circuits (group 3), night vision, the flashlight, the floodgate.

1. **Eyes adjust to darkness.** After a light or a flashlight, the dark is pitch black at first. Over a few seconds your
   eyes slowly adjust and you see more. It makes the blackout and night vision far more real.
2. **Night windows act as mirrors.** At night, from inside a lit room you can't see out, because the glass only reflects
   the room. Everyone outside sees you clearly. Turn the light off and it flips. *Must be faked cheaply (no real
   reflections) for the Intel laptops.*
3. **Visible breath in the cold.** Outside at night and in the flooded cellar, everyone's breath shows as small puffs,
   which give away hidden players. There is no walk-in freezer on the map.

## 10. Fire (`feature/fire`, wave 2, after groups 2, 3 and 4)

Builds on: gas, the molotov, the floodgate, the materials and wet floors (group 2), the generator (group 3), the
fireplace (group 4), the vents (group 5).

1. **Real fire that spreads.**
   - A molotov or a gas blast sets the curtains (to add: there are none yet), the wooden floors and the furniture
     alight, and the fire moves from room to room.
   - Smoke gathers under the ceiling, so you crouch to breathe and see.
   - Burning stairs can collapse.
   - The floodgate's water puts it out, and the mansion has no sprinklers.

   *First: everything else in the group feeds or fights this fire.*
2. **Fuel cans in the garage.** Pour a fuel trail across a floor and light it to make a wall of fire. Throw a can and
   shoot it for a fireball. The garage generator runs on the same fuel.
3. **Throw a lit lighter.** Flick a lighter and throw it across a room to ignite gas or a fuel trail from a safe distance.
   Gas and fuel become long-range traps.
4. **Fire hose.** A hose reel in the hall. Spray it to put out fires, knock people back and soak the floor. A soaked
   floor plus a live wire is an electrocution trap. One tool that links fire, water and electricity.

Links to wire: the lit fireplace closes the chimney (group 4); smoke travels through the vents (group 5); the generator's
fuel (group 3); soaked floors electrocute with live wires (group 2).

---

## Missing from the map today

These groups build them:
- the fireplace and chimney (group 4);
- curtains (group 10);
- the elevator's machine room on the roof (group 3).

Left out unless the user wants them:
- the estate fence (it would sit on a circuit);
- the walk-in freezer (breath would show there).

## Defaults the agents use (the user can change them)

- **Downed suicide:** the kill goes to whoever downed him.
- **Wounds:** they last until you die or the round ends; a bandage halves the effect.
- **Dead man's switch:** going down lets go of the switch too, so the satchels go off.
- **Booby-trapped body:** "inspecting" a body means pressing E on it.
