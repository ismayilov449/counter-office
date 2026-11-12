# Explosives (ROADMAP group 7, branch `feature/explosives`)

7.1 throw a grenade back · 7.2 booby-trapped body · 7.3 dead man's switch · 7.4 cut the wire. Built on `main` d88be4f.
Files: `shared/explosives.js` (numbers), `lib/explosives.js` (server), `public/js/explosives.js` (browser), tests in
`dev/test-scripts/explosives/`. Bots don't use any of it.

## STATUS
- **All four done**, in order, each committed and pushed: 7b5ae9e 7.1, 9d18146 7.2, 9c93149 7.3, 1b5c702 7.4 (then this
  doc, README, ROADMAP and the browser test).
- **Server tests** (scripted players, `GAME_PORT=3995 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1
  ROUND_TIME=40`), all pass:
  - `t1-throwback.mjs` 11/11: grabbed with > 0.8 s left, gone from the floor for others, thrown back hurts Bob (89
    damage at 2 m) as Alice's; kept in hand: Alice dies, killed by Bob's HE; E at 0.6 s left: not grabbed.
  - `t2-trap.mjs` 20/20: standing E does nothing; crouched E 2 s traps (xpTraps, the HE used up); a CT's E on the body
    blows it (an HE at the body, she's hurt/killed by the trapper); crouching for its uniform blows it (no disguise);
    an untrapped body still gives its uniform.
  - `t3-dms.mjs` 19/19: can't arm without satchels; armed (everyone told); phone away releases safely (satchel stays);
    armed and killed: the satchel goes off; armed and **downed** (a teammate alive, chest shots, `bodyDown`): it goes
    off; not armed and killed: it stays.
  - `t4-wire.mjs` 13/13 (satchels, cs_mansion): 6 cuts, each either defused at once or blown, never both/neither (4
    right, 2 wrong). `t4-bomb.mjs` 12/12 (the bomb, `MAP=de_dusty`; Mansion has no bomb): 4 rounds planted, defusing,
    cut: 3 defused, 1 blown.
- **Browser test** (`g1.mjs`, own headless Edge on CDP 9335, see "Verified (browser)").
- **Not checked:** sounds by ear; the tiny pin's look (it's added and shown within 2.5 m, but at 1280x720 in a
  swiftshader screenshot it's a few pixels); draw cost measured with viewer.js (the additions are one tiny mesh per
  trapped body and per armed switch, rare); cs_mansion_night (nothing map-specific; the code doesn't read the map).

## README text (for players)
See README.md under the satchel charge ("Dead man's switch") and "Explosives tricks":
- **Throw a grenade back:** an HE grenade by your feet (1.5 m) with ≥ 0.8 s of fuse left: **E** grabs it, **Mouse1**
  throws it back with the fuse it has left (its kills are yours). Too slow: it goes off in your hand.
- **Booby-trapped body** (classic live rounds): a Terrorist with an HE crouches over a dead teammate and holds **E** 2 s.
  The first CT who presses **E** on that body (to look or to take its uniform) sets it off. A tiny pin shows within 2.5 m.
- **Dead man's switch:** phone out, **right mouse** arms it; killed or knocked down while armed, all your satchels go
  off. Right mouse again or putting the phone away lets go safely. It blinks red; CTs who see you (20 m) are told.
- **Cut the wire:** while defusing the bomb or a satchel, **1** cuts the red wire, **2** the blue: right = defused at
  once, wrong = it goes off.

## How it works / rules chosen
- 7.1: `onNade` keeps each grenade's flight path (`n.xpPath`), so the server knows where it is now; E grabs an `he`
  within `XP.reach` of your feet with ≥ `XP.grabLeft` s left (not one that went into an air vent). In hand:
  `p.xpHot`; Mouse1 sends `xpThrow` (o, v like a strong throw), the server flies it with the fuse left and the same id.
  Held to the end: `XP.inHand` (400) damage to the holder (credited to the thrower if an enemy, else himself) plus the
  HE blast at his chest. Dying or going down with it: it drops at his feet with its fuse running. No grenade view
  model in hand: the HUD line counts down ("GRENADE IN YOUR HAND: CLICK TO THROW IT BACK! (0.6 s)").
- 7.2: bodies come from lib/disguise.js (`disguise.corpses`), so it works where uniforms do (classic, live rounds).
  The trigger is any CT's E within the uniform's reach of the body (standing = inspect, crouched = the uniform); the
  blast is an HE (`explodeNade`) owned by the trapper. Terrorists' E on a trapped mate does nothing. One trap per
  body; cleared each round and when the body's man is back up / gone. Dragging it sets it off too (2026-11-12): lib/wounds.js's
  body drag calls `explosives.dragged(p, id)` (an enemy's drag only).
- 7.3: armed per life (`spawnSeq`) while `p.w === 'phone'` and he has satchels out this life. The tick checks
  "dead or downed" before "phone away", because a downed man's weapon is switched to the pistol by body.js. CT warning:
  browser-side, an armed T within 20 m, in front (cos > 0.6) and in sight: a small HUD line every 3 s.
- 7.4: `xpWire { c: 0|1 }` during the `defuse` or `satchel` act. Right: the act's start is moved back so
  updateActions finishes the defuse as usual (money, messages, round end); wrong: `explodeBomb()` / `explodeSatchel()`.
  **Shortcut (marked in the code):** the right wire is a coin flip at the cut, not stored per bomb — same odds since
  each bomb/satchel gets one cut. Keys 1/2 (and Numpad 1/2) are taken only while defusing; otherwise they switch guns.

## Hooks in shared files (all marked `// explosives:`)
server.js (9 lines): the import; `createExplosives({...})` just before `const bots = new BotManager`; `handle()`:
`if (m.t.startsWith('xp')) { explosives.message(p, m); return; }` after the `pw` line; `updateActions`: the `xpTrap`
act after the disguise act; `onUse`: `explosives.grab` just before `body.use` (a grenade at your feet beats a
revive), `explosives.useBody` just before `disguise.tryStart`; `onNade`: `explosives.thrown(...)` after
`game.nades.push`; the tick: `explosives.tick(t)` after `ug.tick(t)`.

public/js/main.js (10 lines + one `}` moved): the import; `secondary()`: `else if (id === 'phone') xp.dms();`;
mousedown: `if (e.button === 0 && xp.throwBack()) return;` before the Mouse1 block; keydown: `xp.key(e.code)` right
after `if (e.repeat) return;`; the `nade` handler: `xp.tagNade(m)`; `...xp.handlers` after the disguise handlers;
`xp.initExplosives({...})` right after `initBody(...)` (it wraps hud.hint / hud.progress after body.js, so the grab
line goes over a revive's, as on the server); the hint chain: `hint = xp.hint(hint)` right after the disguise line;
the frame: `xp.frame()` after `walls.update`.

**E's order** (server and hints alike): drone → gadgets/car/trunk → **grab a grenade (7.1)** → revive → interrogate
→ lift → carry → escape → shield → **booby trap / a trapped body (7.2)** → uniform → the rest.

Messages (server → browser): `xpGrab {id, by}`, `xpHot {ms}`, `xpTraps {list: [[bodyId, x, y, z]]}`, `xpDms {ids}`.
Browser → server: `xpThrow {o, v}`, `xpDms`, `xpWire {c}`. No snapshot keys. Acts: `xpTrap`. Player field: `p.xpHot`.

## To wire at merge
- Merge with the main session's 9.1 (eyes) in main.js: different lines; only conflict risk is the frame list (my
  `xp.frame()` after `walls.update`, theirs `updateEyes(dt)`).
- If a later group makes corpses draggable, set off traps from the drag (see 7.2).
- The worktree needed a `node_modules` junction to main's for the browser test (three.js is served from it).

## Verified (browser)
Own headless Edge (CDP 9335, swiftshader, 1280x720), server 3995 with `BOTS=0 MAP=cs_mansion AUTO_BALANCE=0
START_MONEY=16000 FREEZE_TIME=1 BUY_TIME=90 ROUND_TIME=180` (long buy/round time: the headless page draws 1-3 frames a
second). No page errors in any run.
- `g1.mjs` (all four, CT round then T round), best run 14/15: the grab (xpHot) and the click throwing it back with the
  fuse left; the "GRENADE IN YOUR HAND" line; the grab hint; the CT's warning line "Bob holds a DEAD MAN'S SWITCH ..."
  (screenshot `xp-dms-ct.png`); the defuse bar "... or gamble: 1 cuts the red wire, 2 the blue"; as a T crouched over a
  dead mate the trap hint, the bar "Hiding the grenade under the body...", the body trapped; the phone's hint "· right-
  click: dead man's switch" and, after the right click, "DEAD MAN'S SWITCH ARMED ..." (`xp-dms-t.png`). The one miss
  (the wire's result) was the test waiting only 0.5 s: `g2-wire.mjs` (7.4 alone, waiting properly) passes 4/4 — the
  key 1 sends `xpWire {c: 0}` and the satchel went off (the wrong wire that time).
- **Flaky in the headless browser, not in the game:** g1's first part depends on the round start (other runs failed
  the whole CT part when the page wasn't spawned in time, and once the grenade went off before the page's E got out).
  The 7.1 step now presses E and clicks inside the page's own message events. A frame-rate artifact: at 1-3 fps the
  drawn grenade outlives its fuse (effects.js caps dt at 0.05 s), so the grab hint can linger; at a normal frame rate
  it doesn't.
- Not seen in a screenshot: the red light of an armed switch (Bob stood too close to the camera) and the pin.
