# Close combat (ROADMAP group 8, branch `feature/closecombat`)

8.1 suppressors · 8.2 disarm from behind · 8.3 door fights. Built on `main` 2e834df.
Files: `shared/closecombat.js` (numbers, `supFits`, `behind`), `lib/closecombat.js` (server), `public/js/closecombat.js`
(browser), tests in `dev/test-scripts/closecombat/`. Bots don't use any of it.

## STATUS
- **All three done**, in order, each committed and pushed: 51de46d 8.1, 26ffeba 8.2, 0f9c0f8 8.3 (then the teleport fix
  for the kick, this doc, README, ROADMAP and the browser test).
- **Server tests** (scripted players; `GAME_PORT=3993 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1`), all
  pass on **cs_mansion and cs_mansion_night**:
  - `t1-sup.mjs` 8/8: bought ($400 taken), a second one refused; a suppressed USP chest shot goes out with `sup:1` and
    does 29 where the plain one does 32 (sold back between the two, same spot); an M3 with a suppressor bought is plain.
  - `t2-disarm.mjs` 14/14: in front of him: nothing; 2 m behind: nothing; 1 m behind: his AK goes into Alice's free
    rifle slot (mag kept), he gets `ccDisarmed` and "You were disarmed!", she's told; again at once: the cooldown;
    after 3 s his Glock goes and, her pistol slot being full, lands in front of her (he can't take it back by walking
    over it); he's left with no gun.
  - `t3-doors.mjs` 20/20 (Mansion's door 1): walking E just opens/closes; running E kicks it open (the crash; the man
    behind takes 15, is knocked away and told; a man where the leaf swings to is moved out of its way); a crouched
    hold holds it, a push from the other side doesn't open it (1 vs 1), both see the count; a second pusher (2 vs 1)
    bursts it open in ~1.07 s, the holder shoved and told, no damage; a crouched tap just opens it; a 5 m teleport to
    the door then E opens it without a kick.
  - The other five maps (de_dusty, de_dust2, aim_map, de_inferno, cs_assault): the server starts, two players join, a
    round starts, a shot is handled, no errors.
- **Browser test** `g1.mjs` 10/10 (own headless Edge on CDP 9336, swiftshader, 1280x720; server with `BUY_TIME=90
  ROUND_TIME=180 AUTO_BALANCE=0`): the buy menu lists "Suppressor $400"; bought, her USP shot reaches Bob with `sup:1`
  (screenshot `cc-sup-vm.png`: the dark tube on the USP); behind Bob the hint "Press E to disarm Bob (snatch his
  Glock-18)" and E takes it; Bob behind her: "You were disarmed! Bob snatched your USP .45 from behind." and her
  weapon name shows Knife; at door 1 the hint "Press E to open the door · crouch + hold E to hold it shut · run + E
  kicks it"; with Bob holding it, her E shows "Pushing the door: they're holding it (1 vs 1), get help!". No page errors.
- **Not checked:** the suppressed sound by ear (it reuses the game's synthesized suppressed shot, the one the USP/TMP/
  M4A1 already have, through a short-range panner); the gas not igniting from a suppressed shot (one condition in
  `gas.onShot`, read, not run: needs gas in a room); the missing muzzle light in a dark room in a screenshot; the kick
  hint ("Press E to KICK the door open") in the browser (the headless page can't run at 1-3 fps); draw cost with
  viewer.js (the only new mesh is the tube on the gun in your hands, one draw call while it shows; no lights).

## README text (for players)
See README.md, Gameplay, after the adrenaline syringe ("Suppressor", "Close combat"), and the E row of Controls:
- **Suppressor** (buy menu, Equipment, $400, both teams): on all your pistols, SMGs and rifles until you die; 10%
  less damage, quieter and heard only nearby, no muzzle flash (no light in the dark, no spark for gas). Bots don't hear it.
- **Disarm from behind:** within 1.5 m inside an enemy's back 120°, **E** takes the gun in his hands (your free slot,
  else the floor in front of you); his knife comes out, his other weapons stay. 3 s between tries.
- **Kick a door open:** **E** at a closed door while running: 15 damage, a shove and a knocked aim for whoever is
  just behind it.
- **Hold a door shut:** crouch and hold **E** (a tap still opens it); E from the other side pushes; more pushers than
  holders for a second bursts it open; ties go to the holders.

## Defaults chosen (where the task left it open)
- 8.1: $400, both teams, Equipment column (key 0 in it). Fits `cls` pistol, smg, rifle (snipers, shotguns, the M249,
  launchers and the PKT have other classes). Kept like the adrenaline syringe: `p.inv.sup`, lost with the inventory on
  death, a survivor keeps it. Damage x0.9 (`CC.damage`). Sound: the existing suppressed synth (`GUN.sup`), positional
  with `FAR.sshot = [1, 3]` (ref 1 m, rolloff 3: about -35 dB at 20 m where a normal shot is about -17 dB) and almost
  no reverb; no underground echo. No muzzle sprite, no flash light (own or remote), no `gas.sparkAt` from the muzzle or
  the impacts (pipes still burst when hit), bots don't "hear" it (`bots.heard` skipped). **Radar:** nothing in the
  game puts a shooter on the radar for firing (spotting is by sight only), so there was nothing to turn off there.
  Disguise still drops when you fire (unchanged).
- 8.2: a **tap** of E (instant), not a hold. Reach 1.5 m (0.8 m up/down), back arc 120° (60° each side of straight
  behind), line of sight eye to eye. Takes the gun **in his hands** only (primary or pistol), **not the knife-only
  literal reading**: his other weapons stay and he's switched to his knife. Your slot free: it's yours (ammo kept);
  full: dropped half a metre in front of you as **his** drop with a 3 s guard, so he can't simply walk over it.
  Cooldown 3 s. Not on/by bots, not in Gun Game or Zombie mode, not in freeze time, not on someone in a car, on a
  gadget (zip line, CCTV, trunk), flying a drone, holding (shield) or carrying a hostage, or lying down (downed or
  playing dead).
- 8.3: **no new key**: kick = **E while running** (standing, ≥ 4.2 m/s over the last half second: walking is ≤ 3.4;
  jumps faster than 15 m/s are teleports, not running); hold = **crouch + hold E** (a crouched tap under 0.3 s still
  opens the door, on release). Kick: the door slams open away from you, everyone within 1.5 m of the doorway on the
  far side takes 15 damage (not your team unless friendly fire), gets a 7 m/s shove away from the door and their aim
  knocked (the explosion knock, `aim 0.4`); anyone standing where the leaf swings is first moved beside it
  (`ccShove`), or his browser would put him on top of the leaf. No downed state (a stagger is enough for a door).
  Holding: anyone crouched on the holders' side joins; anyone pressing E on the other side pushes (any team counts as
  a body). Pushers > holders for 1 s (`CC.win`): it bursts open to the holders' side, shoving them (no damage). A
  kick against a held door is a push. A held door can't be opened from the other side at all (useDoor checks it, so
  bots can't either); someone standing on the holders' side can still open it normally. Swinging doors only (not the
  trapdoors, grates or the garage's roller door); a slow creaky door is kicked open at once. Acts: `ccHold`
  (dur 1 h, so its bar stays empty) and `ccPush` (dur 1 s: the bar fills while they're winning); they work in any
  phase (handled before updateActions' live-round check).

## How it works
- 8.1: `cc.def(p, w)` replaces `WEAPONS[w]` in onShoot: a suppressed gun is a copy with `damage * 0.9` and `sup: true`,
  so every damage use in onShoot (players, hostages, cars, doors, breakables) is reduced in one place; `def.sup` skips
  `bots.heard`, goes out as `sup: 1` on the `shot` broadcast, and `gas.onShot` returns before its sparks. Browser:
  `cc.sup(id)` for our own shots (no flash light, no flash sprite, 'sshot'); `m.sup` for others'. The tube: a
  shared CylinderGeometry + MeshBasicMaterial added once to each view model's muzzle, shown while suppressed.
- 8.2: `cc.disarm(p, t)` in onUse right after `if (!p.alive || p.act) return;` (so after a grenade grab, a revive and
  an interrogation, before the lift and everything else). Browser: `cc.hint` shows the disarm hint over the others
  (same checks, line of sight by the collision raycast); `ccDisarmed` switches to the knife after the `me` message.
- 8.3: `cc.door(p, i, t)` where onUse used to call `useDoor` (false: open as usual). `cc.release` on E up. `cc.act`
  for `cc*` acts in updateActions. `cc.heldShut` at the top of useDoor. Messages: `ccDoor {h, p}` (the counts to
  everyone holding/pushing that door, on change), `ccShove {p}`, plus the existing `knock`, `doors` (quiet) and `sfx
  crash`.

## Hooks in shared files (all marked `// closecombat:`)
server.js: the import; `const cc = createCloseCombat({...})` (4 lines) just before the explosives one;
onShoot: `def = cc.def(p, w)`, `bots.heard` skipped for `def.sup`, the `shot` broadcast's `sup`; onBuy: the "already
have" line and `p.inv.sup = 1`; onSell: the `sup` line; useDoor: `if (cc.heldShut(i, p)) return;` first;
updateActions: `if (a.type.startsWith('cc')) { cc.act(p, a, t); continue; }` before the `pw` line; onUse:
`cc.release(p, t)` in the `!m.on` line, `if (cc.disarm(p, t)) return;` after `if (!p.alive || p.act) return;`, and
the door line `if (!cc.door(p, door.i, t)) useDoor(p, door.i);`.

public/js/main.js: the import; fireBullet: `const sup = cc.sup(id)`, the flash light only if not, the
sound `'sshot'`, no underground echo; the `shot` handler: `'sshot'`, no echo, no third-person flash, no flash light;
the view model: `u.flash.visible = ... && !cc.sup(current())`; owns(): `sup`; handlers: `...cc.handlers`;
`cc.initCloseCombat({...})` just before `xp.initExplosives`; the hint chain: `hint = cc.hint(hint)` after the
elevator line (last in that block); the progress: `cc.progress(me.act.a)` after the stealth line; the frame:
`cc.frame(vm, current())` after `xp.frame()`.

Other shared files: `lib/gas.js` (onShot: `|| def?.sup`), `public/js/audio.js` (`GUN.sup`, `FAR.sshot`, the
`case 'sshot'` falling through to `'shot'`), `shared/weapons.js` (`ITEMS.sup`, `'sup'` in the Equipment column),
`public/js/buymenu.js` (its line), `public/js/buyicons.js` (drawn icon).

Keys: **none claimed** (E only). Player fields: `p.inv.sup`, `p.ccDisarmAt`. Acts: `ccHold`, `ccPush`. No snapshot keys.

## Notes for the merge
- Conflict risk: onUse's door line and `!m.on` line, useDoor's first line, the onBuy/onSell `adren` neighbours, main.js'
  hint chain and frame list (`cc.frame` sits right after `xp.frame()`), and the Equipment column in shared/weapons.js
  (now 10 items: `sup` is key 0).
- `useDoor` refusing a held door affects every caller (bots' `openDoorNear` returns false then, as for "in the way").
- The worktree needed a `node_modules` junction to main's for the browser test (three.js is served from it).
