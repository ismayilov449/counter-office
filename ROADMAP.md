# ROADMAP — Counter-Office: the next 33 features (approved 2026-11-01)

The user approved these 33 features on 2026-11-01. They are grouped so that **one agent builds one group**: features
that share a game system or the same code are in the same group, so two agents never work on the same thing.

**State (2026-11-08): wave 1 is done.** Groups 1–5 (wounds, walls, power, stealth, underground) were built and
browser-tested on their branches, then merged, linked and tested together on **`integration/2026-11-08`** (RESUME.md
sections 0 and 9; each group's notes stay in `docs/features/<group>.md`). **Next: wave 2, groups 6–10** (hostages,
explosives, close combat, sight, fire). All of wave 1 is in `main` (fast-forwarded 2026-11-09), so every wave 2
group can start from `main`.

**New (2026-11-13): group 11, Realism** (hearing loss, hostages panic, hostages talk), added at the user's request;
**done 2026-11-13, on `main`**.
**New (2026-11-13): group 12, Blood & horror** (blood pools, wall splatter, blood on screen, dying sounds, the heartbeat,
executions), added at the user's request; **done 2026-11-13, on `main`** (the user tested it in game).
**New (2026-11-13): group 13, War** (the wounded call for help, no kill confirmation), added at the user's request;
**built 2026-11-13, on `main`**. Both only on cs_mansion and cs_mansion_night, each switched on and off in the admin
settings like the RPG-7.

**New (2026-11-24): group 14, Phone tracker** (stop the Terrorists camping: every Terrorist carries a phone that is
always on, the CTs hunt the phones with a tracker), designed with the user. Version 1 is 14.1-14.4,
version 2 is 14.5-14.7. **Versions 1 and 2 built 2026-11-24, on `main`** (server-tested; not yet checked in a browser).

(Before wave 1: every group built on the 9 features of 2026-10-31 and the hostage fix, merged into `main` on
2026-11-02.)

## All 33 features at a glance

| Order | Group | Features, in build order |
|---|---|---|
| 1 | Downed & wounds | 1.1 Drag a downed teammate · 1.2 Interrogate a downed enemy + the downed suicide · 1.3 Wounds with consequences · 1.4 Adrenaline syringe |
| 2 | Walls & water | 2.1 See-through bullet holes · 2.2 Burst pipes and live wires · ~~2.3 Wet guns jam~~ (removed) · 2.4 Bodies float up in the flood |
| 3 | Power & machinery | 3.1 Circuit breaker per floor + garage generator · 3.2 Power surge · 3.3 Cut the elevator cable |
| 4 | Stealth & hiding | 4.1 The chimney · 4.2 Creaking floorboards · 4.3 Hide in the car trunk |
| 5 | Underground & vents | 5.1 No radar underground · 5.2 Echo in the tunnels · 5.3 Air vents |
| 6 | Hostages | 6.1 Hostages try to escape (zip ties) — **done 2026-11-11** · 6.2 Carrying wounded hostages — **done 2026-11-11** |
| 7 | Explosives | 7.1 Throw a grenade back · 7.2 Booby-trapped body · 7.3 Dead man's switch · 7.4 Cut the wire |
| 8 | Close combat | 8.1 Suppressors · 8.2 Disarm from behind · 8.3 Door fights |
| 9 | Sight | 9.1 Eyes adjust to darkness — **done 2026-11-11** · ~~9.2 Night windows act as mirrors~~ (dropped) · 9.3 Visible breath in the cold — **done 2026-11-12** |
| 10 | Fire | ~~10.1–10.4~~ **dropped 2026-11-12 at the user's request** |
| 11 | Realism (new 2026-11-13) | 11.1 Hearing loss · 11.2 Hostages panic · 11.3 Hostages talk — **done 2026-11-13** |
| 12 | Blood & horror (new 2026-11-13) | 12.1 Blood pools under bodies · 12.2 Splatter on walls · 12.3 Blood on your screen · 12.4 Dying sounds · 12.5 The heartbeat when alone · 12.6 Executions — **done 2026-11-13** |
| 13 | War (new 2026-11-13, both Mansion maps, admin switches) | 13.1 The wounded call for help · 13.2 No kill confirmation — **built 2026-11-13** |
| 14 | Phone tracker (new 2026-11-24, both Mansion maps, admin switch) | 14.1 The Terrorists' phones · 14.2 The CT tracker and its scans · 14.3 Underground and the jammer · 14.4 Counting phones, phones that notice a scan · 14.5 Cell towers · 14.6 The drone's antenna · 14.7 The hostages' phones |

Each feature's full description is in its group's section below.

## Order of the groups

The groups are numbered in the order they start. Wave 1 builds the base systems; each wave 2 group waits for the
wave 1 group(s) it builds on.

| Order | Group | Branch | Wave | Waits for | Groups that need it |
|---|---|---|---|---|---|
| 1 | Downed & wounds | `feature/wounds` (done 2026-11-08) | 1 | — | 6 Hostages, 7 Explosives (dragging a body) |
| 2 | Walls & water | `feature/walls` (done 2026-11-08) | 1 | — | 8 Close combat (shooting code), 10 Fire (materials, wet floors) |
| 3 | Power & machinery | `feature/power` (done 2026-11-08) | 1 | — | 9 Sight (rooms dark per floor), 10 Fire (generator fuel) |
| 4 | Stealth & hiding | `feature/stealth` (done 2026-11-08) | 1 | — | 10 Fire (lighting the fireplace closes the chimney) |
| 5 | Underground & vents | `feature/underground` (done 2026-11-08) | 1 | — | none (vents later carry fire smoke too) |
| 6 | Hostages | `feature/hostage-escape` | 2 | 1 | — |
| 7 | Explosives | `feature/explosives` | 2 | 1 | — |
| 8 | Close combat | `feature/closecombat` | 2 | 2 | — |
| 9 | Sight | `feature/sight` | 2 | 3 | — |
| 10 | Fire | `feature/fire` | 2 | 2, 3, 4 | — (it links to almost everything, so it goes last) |
| 11 | Realism | `feature/realism` | 3 | — (all it needs is in `main`) | — |
| 12 | Blood & horror | `feature/blood-horror` | 3 | — (all it needs is in `main`) | — |
| 13 | War | `feature/war` | 3 | — (all it needs is in `main`) | — |
| 14 | Phone tracker | `feature/phone-tracker` | 4 | — (all it needs is in `main`) | — |

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

## 1. Downed & wounds (`feature/wounds`, wave 1) — **done 2026-11-08**

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

## 2. Walls & water (`feature/walls`, wave 1) — **done 2026-11-08**

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
3. ~~**Wet guns jam.**~~ **Removed on 2026-11-09 at the user's request** (it was built in wave 1, then taken out:
   guns never jam, R only reloads). It was: after swimming or wading through the flood, your gun sometimes jams until
   it dries; tap R to clear it.
4. **Bodies float up in the flood.** In a flooded cellar the dead float to the surface. Grim, but it tells you who
   drowned down there.

Links: a cable's sparks stop when its circuit is off (group 3); the fire hose soaks floors (group 10).

## 3. Power & machinery (`feature/power`, wave 1) — **done 2026-11-08**

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

## 4. Stealth & hiding (`feature/stealth`, wave 1) — **done 2026-11-08**

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

## 5. Underground & vents (`feature/underground`, wave 1) — **done 2026-11-08**

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

1. **Hostages try to escape.** *(Done 2026-11-11, on `main`: lib/hostage-escape.js; unwatched 20 s, caught within 4 m, ties loose after 60 s.)* A hostage left unwatched sneaks towards a door, so Terrorists must guard them or zip-tie
   them (hold E). CTs cut the ties to lead them out. It pairs with the human shield.
2. **Carrying wounded hostages.** *(Done 2026-11-11, on `main`: lib/hostage-carry.js; 40 HP or less can't walk, carried at 55% pistol speed, pistol only.)* A badly hurt hostage can't walk. A CT has to carry them on his shoulder, slowly and
   with only a pistol. *Reuses dragging from group 1.*

## 7. Explosives (`feature/explosives`, wave 2, after group 1)

Builds on: grenades, satchels, the bomb, disguise, downed, dragging (group 1).

1. **Throw a grenade back.** *(Done 2026-11-11, on `main`: lib/explosives.js; E within 1.5 m with ≥0.8 s of fuse left, Mouse1 throws.)* A grenade lands at your feet: grab it and throw it back. You have about a second, and a
   mistake is fatal. *First: grenade handling, which the booby trap builds on.*
2. **Booby-trapped body.** *(Done 2026-11-11, on `main`: crouch + hold E 2 s; E or the uniform sets it off; a tiny pin within 2.5 m. Dragging it sets it off too: dead bodies drag since 2026-11-12, lib/wounds.js.)* A Terrorist hides a grenade under a dead teammate. Whoever inspects the body, takes its
   uniform or drags it sets it off. It punishes careless disguises.
3. **Dead man's switch.** *(Done 2026-11-11, on `main`: right mouse with the phone arms it; killed or downed: his satchels go off; CTs who see him within 20 m are told.)* A Terrorist with satchels out can hold a dead man's switch. If he's killed, all his satchels go
   off. Shooting him becomes a terrible decision. It pairs with the satchels and downed.
4. **Cut the wire.** *(Done 2026-11-11, on `main`: 1 red, 2 blue while defusing; a coin flip.)* While defusing the bomb or a satchel you can gamble: cut the red or the blue wire. Guess right and
   it's defused instantly; guess wrong and it explodes. For desperate last seconds.

## 8. Close combat (`feature/closecombat`, wave 2, after group 2)

Builds on: the shooting code (with bullets through walls from group 2), gas, darkness, doors.

1. **Suppressors.** *(Done 2026-11-11, on `main`: lib/closecombat.js; $400, pistols/SMGs/rifles, 90% damage, heard only nearby, no flash, no gas spark.)* Buy one for your gun. It's quieter, does a bit less damage, and has no muzzle flash, so it won't
   ignite gas and doesn't show you in the dark.
2. **Disarm from behind.** *(Done 2026-11-11, on `main`: E within 1.5 m in his back 120°; the gun to your free slot or the floor; he gets his knife out, keeps the rest; 3 s cooldown.)* Sneak up behind an enemy and snatch the gun out of his hands, leaving him with only a knife.
3. **Door fights.** *(Done 2026-11-11, on `main`: E while running kicks (15 damage + shove); crouch + hold E holds; more pushers than holders for 1 s bursts it open, ties to the holders.)* Kick a door open to knock down whoever stands behind it, or hold a door shut while someone pushes
   from the other side. The stronger push wins.

## 9. Sight (`feature/sight`, wave 2, after group 3)

Builds on: the room lighting, the blackout and circuits (group 3), night vision, the flashlight, the floodgate.

1. **Eyes adjust to darkness.** *(Done 2026-11-11, on `main`: public/js/eyes.js, through the tone-mapping exposure, no extra draw calls.)* After a light or a flashlight, the dark is pitch black at first. Over a few seconds your
   eyes slowly adjust and you see more. It makes the blackout and night vision far more real.
2. ~~**Night windows act as mirrors.**~~ **Dropped on 2026-11-12 at the user's request.** At night, from inside a lit room you can't see out, because the glass only reflects
   the room. Everyone outside sees you clearly. Turn the light off and it flips. *Must be faked cheaply (no real
   reflections) for the Intel laptops.*
3. **Visible breath in the cold.** *(Done 2026-11-12, on `main`: public/js/breath.js; a puff every 2.6 s, 1.3 s after running, within 25 m, one smoke sprite each.)* Outside at night and in the flooded cellar, everyone's breath shows as small puffs,
   which give away hidden players. There is no walk-in freezer on the map.

## 10. Fire (`feature/fire`, wave 2, after groups 2, 3 and 4)

**Dropped on 2026-11-12 at the user's request: none of group 10 will be built.** (Kept below for the record.)

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

## 11. Realism (`feature/realism`, added 2026-11-13)

Builds on: grenades and the shotguns, the game's sound (public/js/audio.js), the hostages (group 6, the escape and carrying),
the human shield, the radio messages.

1. **Hearing loss.** *(Done 2026-11-13, on `main`: public/js/audio.js; a low-pass on everything, the ringing past it, the existing shell shock's trigger; a shotgun within 3 m, mildly.)* A grenade going off or a shotgun fired right next to you muffles every sound for a few seconds,
   with a high ringing tone that fades out. The closer the blast, the longer it lasts. A flashbang already blinds you;
   now you're deaf too for a moment, and you can't hear footsteps coming. *Sound only (a low-pass filter on the master
   volume and one tone), no drawing cost.*
2. **Hostages panic.** *(Done 2026-11-13, on `main`: lib/hostage-escape.js; PANIC in shared/hostage-escape.js: shots 12 m, blasts 20 m, duck 4 s, bolt after 6 s at 4.2 m/s.)* Hostages duck and cover their heads at nearby gunfire and explosions. A hostage left alone
   too long during a fight may bolt on their own, and a running hostage can be hit in the crossfire. Rescuing them
   gets harder and more real. *Ties into 6.1 (escaping hostages run the same way) and the human shield.*
3. **Hostages talk.** *(Done 2026-11-13, on `main`: lib/hostage-escape.js; Terrorists seen within 20 m in the last 30 s, said once per hostage per round when first led.)* A hostage the CTs rescue or lead tells them roughly where the Terrorists are: "Two of them
   upstairs!", "One in the garage!". What they say comes from what they last saw, so it can be out of date. The line
   shows as a radio message to the CT team. *First 11.2, so a hostage knows when they've seen a fight.*

---

## 12. Blood & horror (`feature/blood-horror`, added 2026-11-13)

Builds on: the blood decals and trails (shared/blood.js, public/js BloodTrails), the bodies (lib/disguise.js corpses),
downed and wounds (group 1), the sound (public/js/audio.js), the night map's darkness. Everything must stay cheap to
draw on the Intel laptops: decals and overlays, no new lights.

*(Done 2026-11-13, on `main`: public/js/gore.js (GORE numbers there), audio.js (groan, breath, moan, heartbeat), lib/wounds.js
(12.6). Checked: 12.6 by test (realism/t2-execute.mjs 9/9; wounds t2 28/28); 12.1-12.3 in the browser (realism/g2-gore.mjs:
the pool, the wall splatter, the screen blood, no page errors). 12.4 and 12.5 (and all of it) tested in game by the user, 2026-11-13: all good.)*

1. **Blood pools under bodies.** A dead body slowly grows a dark pool under it over about 10 seconds. A big pool tells
   others how long ago someone died. *One flat decal per body that scales up; it moves with the body when dragged.*
2. **Splatter on walls.** A headshot or a close shotgun hit sprays blood onto the wall behind the target, along the
   bullet's line. *The existing blood decals, aimed at the wall behind.*
3. **Blood on your screen.** Someone killed right next to you (about 2 m) splashes drops onto your view that slowly run
   down and fade. *One overlay, only for the players that close.*
4. **Dying sounds.** A dying player gives a short groan or last breath that nearby players hear from the body. A
   headshot kill dies silent. Downed players moan now and then, which gives them away.
5. **The heartbeat when alone.** Low HP, in the dark and no teammate within 15 m: you hear your own heartbeat, faster as
   your HP drops, and the edges of your screen pulse dark. *Sound plus one overlay.*
6. **Executions.** Crouch and hold E over a downed enemy to finish him with the knife (2 s). It's quick and silent, but you're
   stuck in place while you do it. The kill counts as a knife kill. *Uses group 1's downed state; Standing E stays the interrogation (3 s);
   crouched E is the execution.*

---

## 13. War (`feature/war`, added 2026-11-13)

*(Built 2026-11-13, on `main`: shared/war.js (warOn, MEDIC), CFG.medicCalls / CFG.noKillConfirm (MEDIC_CALLS,
NO_KILL_CONFIRM) with the admin page's two checkboxes; 13.1 in public/js/gore.js and audio.js ('medic'); 13.2 in main.js
(hud.killfeed held back, hit marker, announcements, scoreboard) and server.js (the team bar, the kill money paid at
endRound). Test: realism/t3-war.mjs 7/7 (server). Not checked in a browser or by ear: waiting for the user.)*

Make it feel like a war, not a game. **Both features work only on cs_mansion and cs_mansion_night**, and each has its
own **admin switch, made the same way as the RPG-7's**:
- a `CFG` flag in server.js with an env var (`MEDIC_CALLS=1`, `NO_KILL_CONFIRM=1`), **off by default** like `RPG7`;
- the flag in the settings validator (`bool`) and in the change log's names ("Calls for help", "No kill confirmation");
- a checkbox on public/admin.html next to the RPG-7's, and the name in its `BOOLS` list;
- the browser learns the flags with the other settings, so a switch takes effect from the next round without a restart.

On any other map, or with the switch off, the game works as it does today.

1. **The wounded call for help.** A downed player can't talk normally: every few seconds he screams for a medic
   ("Medic! I'm hit!", groans), heard by **both teams** from where he lies, about 30 m and muffled through walls. Do you
   risk going out to save him? The enemy knows you will. *Builds on downed (group 1): the screams stop when he's
   revived, carried off (the drag keeps them), finished or bleeds out. A few recorded or generated voice lines per
   team in public/js/audio.js; no drawing cost.* Pairs with 12.4 (dying sounds) and 12.6 (executions).
2. **No kill confirmation.** No hit marker and no kill feed during the round, for everyone. You don't know if you
   killed him or he's lying there wounded until you go and look. The kill feed of the whole round shows at the round
   end (and the scoreboard still counts kills, but only updates at the round end). *The server sends the kill
   messages as today; the browser holds them back while the switch is on (hud.js `killfeed` and the hit marker in
   main.js). **The dead don't see it either** (the user's choice, 2026-11-13); nor does the team bar or the scoreboard
   show who is dead on the other team, and the kill money waits for the round's end.*

---

## 14. Phone tracker (`feature/phone-tracker`, added 2026-11-24)

*(**Version 1 (14.1-14.4) built 2026-11-24, on `main`:** shared/phonetracker.js (TRACKER, circleRadius, compass),
lib/phonetracker.js (server), public/js/phonetracker.js + hud.trackerScreen (browser), the admin switch `phoneTracker`
(`PHONE_TRACKER=1`); the tracker is weapon `tracker` (slot 6, drawn as the detonator's phone for now). Test:
dev/test-scripts/phonetracker/t1-server.mjs (server, all pass). Not yet checked in a browser: waiting for the user.
**Version 2 (14.5-14.7) built 2026-11-24, on `main`:** towers in shared/maps/mansion_phonetracker.js (map.towers,
solids via remodel), knocked out by bullets/blasts, repaired with E ('twr' action), the snapshot's `tw`; drone scans
(`scan` with `drone: 1`, R in the browser); hostage phones (msg.h, taken on zip-tying via escape's `tied` hook). Choices
made while building: the roof tower's cabinet is inside the lift's machine room (reachable by the roof ladder); the
hostage's phone is taken as part of zip-tying (crouch + hold E, 2 s) because standing E is the hostage shield.
Test: dev/test-scripts/phonetracker/t2-v2.mjs (server, all pass). Not yet checked in a browser.)*

*(Designed with the user on 2026-11-24, after hostage escaping (6.1) got its admin switch, because the
group didn't like hostages walking off; this replaces it as the answer to Terrorists camping.)*

**The rule behind it: a phone that sits still gets found, a phone that moves stays fuzzy.** So the only way to stay
hard to find is to keep moving, and camping gets you pinpointed. **No loopholes** (the user's rule): nothing makes a
Terrorist invisible to the tracker, things can only make him harder to find for a while. There is **no way to switch a
phone off, drop it or throw it away** (the user rejected an off switch as a "terrible gap").

Both Mansion maps (hostage rounds), with an **admin switch "Phone tracker"** made like the War switches (13): a `CFG`
flag with an env var (`PHONE_TRACKER=1`), the settings validator, the change log's name, a checkbox on admin.html.
On any other map, or with the switch off, the game works as it does today. All numbers below are first guesses, in
`shared/phonetracker.js`.

**Version 1 (14.1-14.4):**

1. **The Terrorists' phones.** Every living Terrorist carries a phone, always on, nothing to buy or hold. When a scan
   reaches it, its screen flickers "No service" and it **vibrates**: the Terrorist feels it (a buzz on screen and a
   sound) and **anyone within 3 m hears it**, through a door or a closet. **A dead Terrorist's phone keeps pinging for
   20 s** (CTs may chase a body; with 13.2 they can't tell a corpse's circle from a living one).
2. **The CT tracker and its scans.** A cell-site simulator (a fake tower in a briefcase), **one per CT team**, given to
   a random CT at the round start, dropped when its holder dies and picked up like a weapon.
   - Held in **both hands**: walking slower, about 1 s to get a gun back out, and its **screen glows** (Terrorists can
     see who holds it in the dark). Its screen is the estate map, drawn like the mortar's phone map.
   - **8 scans a round.** A scan takes **3 s** and shows **where the phones were when it started** (a moving Terrorist
     is already elsewhere).
   - Each scan draws **a circle per Terrorist phone**:
     - bigger the farther away the phone is;
     - bigger for each wall and floor between the tracker and the phone;
     - big while the phone moves;
     - shrinking scan after scan while the phone stays still, towards an exact spot.
   - The floor ("UPSTAIRS", "GROUND", "CELLAR") is only shown within 10 m.
   - **Within 20 m it is a direction finder:** an arrow, signal bars and a beep that speeds up as you close in.
   - The circles go onto **every CT's radar for a few seconds**, so the whole team hunts together.
3. **Underground and the jammer.**
   - **Underground** (the cellar, the tunnels) the signal is weak: circles twice as big, never nothing. (Group 5's
     "no radar underground" stays as it is for the radar; the tracker is its own screen.)
   - **The signal jammer** (already in the game): no scans within its 15 m; it **also cuts the Terrorists' own phones
     there** (their radar and radio, like the CTs' today); and within 30 m the tracker points towards it (a jammer is
     loud on the airwaves), so it protects for a while but shows the CTs where to look.
4. **Counting phones, phones that notice a scan.**
   - **The first scan of a round only counts the phones:** "3 phones found" (the living Terrorists plus the dead still
     pinging), no positions. Spend a scan on it early, or wait?
   - **The phones notice the fake tower:** on every scan, each Terrorist phone shows roughly **which way the scan came
     from** ("fake tower to the east"). Counter-intel for the Terrorists, so it's fair both ways.

**Version 2 (14.5-14.7):**

5. **Cell towers.** Tracking measures from real towers: **2-3 on the map** (the roof, a street pole, by the garage),
   new geometry in `shared/maps/mansion_phonetracker.js`. A Terrorist can **sabotage** one (shoot its box, or blow it
   up): scans get worse, with bigger circles, until a CT **repairs it (hold E 5 s)**. A reason for the Terrorists to
   leave their spot, and for the CTs to guard something.
6. **The drone's antenna.** Scanning from the CT drone (already in the game) gives **sharper circles outdoors**, like
   trackers on police aircraft. The drone becomes a hunting tool, and the Terrorists get a reason to shoot it down.
7. **The hostages' phones.** Every hostage has a hidden phone: a **white circle** on the tracker, so the CTs can find
   the hostages too. A Terrorist can **take a hostage's phone (hold E 2 s)**, which keeps him next to the hostage for
   that long.

**Left out (offered, not chosen):** electrical interference near the generator, a shielding pouch Terrorists could buy,
a trail for fast-moving phones.

*Bots: they don't use the tracker or react to it in version 1.*

## 15. Ghosts & rigged doors (Mansion maps) — **built 2026-11-26** (045a1c6, fb2b961, 3ccfe41)

1. **Ghosts.** Dead this round: G floats free through walls; once a round, near a living enemy (10 m), knock on a wall,
   flicker a room's lights or slam a door.
2. **Rigged doors.** A Terrorist with the HE in hand ties it to a closed door (E, 2.5 s). Opening it: a ping and the
   blast 0.5 s later on the opener's side of the doorway. A crouched CT takes it off (3 s).
3. **The rigged lift.** The same in the lift's cabin: it goes off 1 s after its doors open at another floor.

## 16. The safe & the roof rope (Mansion maps, added 2026-11-26) — **built 2026-11-26**

1. **The safe.** A second objective for the Terrorists: a safe in a room on the upper floor (the room picked when it's
   built). Cracking it takes holding E for 20 s, with loud clicks heard across the floor, and pays every Terrorist
   $1500. It pulls the Terrorists out of their corners, which also works against camping.
2. **Rope from the roof.** A CT on the roof hooks a rope at the edge (E, 2 s) and swings in through an upstairs window,
   smashing the glass: a SWAT-style entry. The Terrorists inside hear the hook clank on the roof first.

**Left out (offered, not chosen):** fake rigs, last breath (marking your killer), the bounty, throwable junk, play of
the round, funny awards.

## 17. Scope glint, locked doors & ramming the gate (Mansion maps, added 2026-11-26) — **built 2026-11-26** (scope glint on every map; the locked doors are the house's 4 outer doors and the gate, the Mansion having no inner doors)

1. **Scope glint.** A scoped sniper rifle (Scout, AWP and the rest) flashes a bright glint toward whoever it's aimed
   at, seen from far away. Snipers on the roof or at a window give themselves away, and the other side gets a fair
   warning.
2. **Locked doors.** Some doors start locked (the master bedroom, the wine cellar, the study; picked when built). The
   Terrorists spawn with the keys and can lock a door behind them. CTs pick the lock (6 s, clicks heard on the other
   side), kick it in (3 loud kicks) or blow it.
3. **Ram the gate.** CTs drive a car through the front gate or the garage door: it smashes open with debris and a huge
   noise. A loud rush with the cars the map already has.

**Left out (offered, not chosen):** the police helicopter's searchlight, looping the CCTV, the dumbwaiter, rescued
hostages talking, the last Terrorist escaping over the garden wall.

## 18. The SWAT helicopter (both Mansion maps, CTs only, added 2026-11-26) — **stage 1 built 2026-11-26** (flying, landing, fuel, damage, the crash; passengers ride along. Stage 2 not built yet: the door gunners, the rope slide)

The user's choices: CTs only; for getting in and covering fire, not a gunship; free once a round; both Mansion maps.

1. **The helipad.** Every round the helicopter waits on a helipad on the CT street. Once it's shot down it's gone
   until the next round.
2. **Seats.** A pilot, **two door gunners** (a mounted PKT each side, like the pickup's) and two passengers. E gets
   in and out, as with the cars.
3. **Flying.** Simple, like the drone but heavier: W/S forward and back, A/D sideways, Space/Ctrl up and down, the
   mouse turns. It can land on anything flat, the Mansion's roof most of all.
4. **The entry.** It lands on the roof or hovers low, and the CTs jump out right above the Terrorists. (Group 16's
   roof rope fits here: slide down from the hovering helicopter.)
5. **Limits.**
   - Fuel for 90 s in the air, then it must land or it crashes.
   - The rotor is heard across the whole map, and it drowns out the sound outdoors under it.
   - The Terrorists can shoot the pilot through the glass. Bullets wear it down slowly, and 2 RPG hits bring it down.
6. **Shot down.** It spins, falls and explodes, killing whoever is still inside. Jump out in time and you live.

*Bots: they don't fly it; Terrorist bots shoot at it.*

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
