# Bet on yourself (F3)

Branch `feature/bet`. Part (a) is the player-facing text for the README; part (b) is for RESUME.md and the architect.

## STATUS

- **Done:** the feature, its hooks and every test. **Browser-verified** in headless Edge (swiftshader) on `cs_mansion` and
  `cs_mansion_night`, a fresh server for each run. No bug was found in the feature itself; the fixes were all in the tests.
- **`gbet.mjs`: 36 of 36 on both maps, no page errors.** The screenshots, looked at one by one:
  - `bet-panel-1920x969.png`, `bet-panel-1280x600.png`: the panel is centred and fits; the four targets with their odds
    and the six stake chips; "0 Max $2000" with the key clear of the text.
  - `bet-picked-1280x600.png`: with 2 and 9 pressed, only "2 kills" and the $2000 chip are lit, and the sum line reads
    "Bet $2000 on 2 kills → it pays $6000".
  - `bet-warmup.png`: greyed out, "No bets during warmup — they open with the first round."
  - `bet-placed.png`, `bet-panel-placed.png`, `bet-track-1of2.png`: the HUD money drops by the stake. Also the chat line,
    the tracker at the bottom (`○○ 0/2`, then `●○ 1/2`), and F3 again showing the placed bet.
  - `bet-won.png`: "…and won $6000! (only $2800 fit under the $16000 cap)", money $16000, the tracker gone.
  - `bet-over-buymenu.png`: the panel over the open buy menu, Survive and $500 lit, "(over $16000 is lost)".
  - `bet-dead.png`, `bet-lost.png`: the tracker turns red ("dead · lost"), then "…and lost $500."
- **`gaward.mjs` (new): all checks on both maps, no page errors.**
  - A 3-kill bet wins ×5 ($5000, paid in full) and a team mate's survive bet wins ×2 ($1000), each with its chat line.
  - The match summary on screen has a "Best gambler · Rufat · +$4000 · 1 of 1 bet won" card next to the other awards
    (`award-won.png`, `award-summary.png`).
- **`footer.mjs`:** identical at all 11 sizes (the footer is 31 px high everywhere), no page errors.
- **`mansion/buyhover.mjs`:** all 41 items stay put at 10 sizes. 900×560 has the 5 known failures (`pmn` not under the
  mouse; `mon50`, `satchel`, `camo` and `jammer` below the window): the scroll case that is also on `main`. No page errors.
- **Draw cost against `main`: none.** The feature adds no 3D objects, only page elements. `gdraw.mjs` (new) counts the
  WebGL draws per frame in the living room. Frames alternate between a light and a heavy kind (shadow maps are redrawn
  every few frames), and both cost exactly 227 / 369 draws with nothing open, with the panel open, and with a bet on the
  tracker.
- **Server tests, re-run on `cs_mansion`:** `unit.mjs` 49/49, `tws.mjs` all, `tmatch.mjs` all, and `tsoak.mjs`
  (`BOTS=4 ROUND_TIME=20`, 60 s: 3 rounds, only the person bets). The server's stderr was empty, and it starts with all
  7 maps.
- **Test fixes (on this branch):**
  - `gbet.mjs`, `tws.mjs`, `tmatch.mjs`: moved from Dusty positions to the Mansion (the fight in the street east of the
    house at x 19; whoever isn't in it waits in the garden or on the lawn).
  - `gbet.mjs`: the 960×540 page outside the two panel shots, and the team click retried on a cold page.
  - New `gaward.mjs` (the ×5 and ×2 wins and the award on screen), with the joins alternating CT/T: with auto team balance
    a team can't get two ahead at any join, so a third CT can only join after the second T.
  - New `gdraw.mjs` (the draw cost).
- **Seen, not this feature's (for the architect):** the short-lived centre text (`#small-msg`, top 76 px in `main`'s
  `style.css`) overlaps the team bar's money cards once players are in the game. It happens with "Bet placed…", "You won
  your bet…" and "You lost your bet…", and the same way with the game's own "Guard the hostages in the mansion!". It
  belongs to `main`'s HUD layout, so it wasn't changed here.
- **Left:**
  - By hand on a real laptop: F3 in buy time frees the mouse; Enter, a click on Place bet, Esc or F3 takes it back
    without the pause menu flashing (headless Edge fakes pointer lock).
  - The sounds by ear (the game's existing `buy` when a bet is placed, `deny` when refused, `chat` on someone else's bet).

## (a) README

**Where:** a new bullet in *Gameplay*, after the **Buy menu** bullet; one change in the *Controls* table; one word in
*Office extras*.

Gameplay bullet:

- **Bet on yourself** (classic rounds; not in warmup, Deathmatch, Gun Game, Zombie or Hide and Seek): during freeze
  time and buy time press **F3** (or click **F3 Bet** at the bottom of the buy menu) and bet some of your money on your
  own round: at least **1 kill** (×1.5), **2 kills** (×3), **3+ kills** (×5), or **survive** the round (×2). Pick the
  target (**1**–**4**, or click it), the stake (**5**–**9**: $200, $500, $1000, $1500, $2000; **0** for the most you
  can — at most $2000, and never more than you have) and press **Enter** (or click *Place bet*). The stake is taken at
  once, so you can't spend it on guns; one bet a round, and it can't be changed. Everyone sees it in the chat
  ("Rufat bets $1000 on 3 kills!"), and a line at the bottom of your screen tracks it (●●○ 2/3 kills, or alive /
  dead); in buy time, before you bet, the same spot reminds you: "F3 Bet on yourself · 18 s". When the round is decided
  the chat tells everyone how it went ("…and won $5000!" / "…and lost $1000."). A win pays the stake × the odds, up to
  the $16000 cap: whatever would go over it is lost, and the chat says so. Only kills of enemies count (bots too; team
  kills don't), made before the round is decided; "survive" means alive when it's decided (the bomb that ends the round
  still counts). Switching teams in the middle of a round loses the bet. A round decided during freeze time (a team
  left) calls the bets off and gives the stakes back. Bots don't bet. The end-of-match summary names the **Best
  gambler**: whoever won the most from bets that match.

Controls table: the row `| , / . | buy primary / secondary ammo | F1 / F2 | autobuy / rebuy |` becomes

`| , / . | buy primary / secondary ammo | F1 / F2 / F3 | autobuy / rebuy / bet on yourself |`

Office extras, the Round MVP bullet: "(Match MVP, Top fragger, Headshot machine, Damage dealer, Hostage hero, Best
gambler)".

## (b) RESUME notes

### How it's built

The server decides everything; the page only shows it. No snapshot data (the `bt` key isn't used): a handful of
messages instead.

**New files**

- `shared/bet.js` — `BET` (min/max stake $200–$2000 in hundreds, the panel's stake chips, the cap $16000 for the panel's
  warning, the four targets with their odds), `betTarget(id)`, `betPayout(stake, target)`.
- `lib/bet.js` — `createBets(deps)` with `deps = { players, game, cfg, now, send, broadcast, sendMe, mates, inTeam }`;
  returns `{ place, onKill, onRoundEnd, onRoundStart, onMatchStart, award, bets }`. Bets live in a `Map` (player id →
  `{ stake, target, team, kills }`) for the current round only; the match record is `p.betRec = { n, wins, net }`.
- `public/js/bet.js` — `class BetPanel(ctx)`: the panel (`#bet`, its own full-screen overlay at z-index 30: above the
  buy menu's 20, below the modals' 50), the tracker (`#bet-track`, added to `#hud`, bottom middle), the chat lines
  (appended to `#chat-log` like `hud.chat`'s: 8 lines, fade after 10 s), `onKey(e)`, `handlers` (the bet* messages) and
  `shown()` (classic mode: the buy menu's footer item). `ctx = { me, game, send, lock, overlays, buyOpen, small, play }`.
  A 250 ms interval refreshes the countdown and hides the tracker when the round or mode changes.
- `public/css/bet.css` — all the styles (linked from `index.html`; `style.css` is untouched).
- `dev/test-scripts/bet/` — the tests (below) and `up.ps1` / `down.ps1` (test server on 4080 with fresh data in
  `$SP\testdata`; stops only the process listening on that port).

**Hooks in existing files** (each marked `// bet feature`)

| File | Where | Line |
|---|---|---|
| `server.js` | imports | `import { createBets } from './lib/bet.js';` |
| `server.js` | right after `const bots = new BotManager(...)` | `const bet = createBets({ players, game, cfg: CFG, now, send, broadcast, sendMe, mates, inTeam });` |
| `server.js` | `startMatch()`, after the players loop | `bet.onMatchStart();` |
| `server.js` | `startRound()`, just before `broadcast({ t: 'round' ... })` | `bet.onRoundStart();` |
| `server.js` | `matchSummary()`, after the `awards` array | `const betAward = bet.award(); if (betAward) awards.push(betAward);` |
| `server.js` | `endRound()`, right after `broadcast({ t: 'roundEnd' ... })` | `bet.onRoundEnd();` |
| `server.js` | `killPlayer()`, right after the `kill` broadcast (also runs for silent kills) | `bet.onKill(killer, v);` |
| `server.js` | `handle()`, after `case 'sell'` | `case 'betPlace': bet.place(p, m); break;` |
| `public/js/main.js` | imports | `import { BetPanel } from './bet.js';` |
| `public/js/main.js` | the BuyMenu ctx | `bet: { open: () => betUI.open(), shown: () => betUI.shown() },` |
| `public/js/main.js` | right after `const buyUI = new BuyMenu(...)` | `const betUI = new BetPanel({ ... });` |
| `public/js/main.js` | `updateOverlays()`, after `const show = ...` | `if (show && betUI.isOpen) { $('paused').classList.add('hidden'); return; }` |
| `public/js/main.js` | the `keydown` listener, after `if (typing) return;` | `if (betUI.onKey(e)) return;` |
| `public/js/main.js` | right after `const net = new Net({...});` | `Object.assign(net.handlers, betUI.handlers);` |
| `public/js/buymenu.js` | `action()` | `else if (a === 'bet') this.ctx.bet?.open();` |
| `public/js/buymenu.js` | `render()`, the footer, between F2 and B | `${c.bet?.shown() ? '<span data-act="bet"><b>F3</b> Bet</span>' : ''}<!-- bet feature -->` |
| `public/index.html` | after the `style.css` link | `<link rel="stylesheet" href="/css/bet.css">` |

**Protocol** (all new types start with `bet`)

- in: `betPlace { target: 'k1' | 'k2' | 'k3' | 'live', stake }`
- out, to the bettor: `betOk { target, stake, pay }` or `betNo { why }`; `betTrack { k, alive }` on each counted kill
  and when the bettor dies.
- out, to everyone: `betNew { id, name, team, target, stake }`; `betEnd { list: [{ id, name, team, target, stake,
  kills, won, pay, paid, void }], cap }` once per round (only if anyone bet); `betRound {}` at every round start.

**Keys:** only F3 (assigned). While the panel is open it takes every key except Tab: 1–4 target, 5–9 stake chip, 0 the
most you can, Enter place, Esc / F3 close. (Number keys inside an open panel, like the buy menu's.)

**Rules as built**

- Placing: classic mode, phase freeze or live, within `freezeTime + buyTime` of the round start (the buy time; no buy
  zone needed), alive, in a team, not a bot, no bet yet this round, a known target, a whole-hundred stake of $200–$2000
  and no more than your money. The page checks the same before sending (`BetPanel.blocked()`), the server again
  (`refuse()` in lib/bet.js).
- The stake is taken at once (`p.money -= stake`, `sendMe`).
- Kills (`onKill`): killer ≠ victim, not `mates`, victim in a team, `game.phase === 'live'`. Bot victims count; a kill
  by a grenade or fire after the bettor died counts. Kills after the round is decided (phase `end`) don't.
- Settling: `endRound` calls `onRoundEnd`, which settles on `setImmediate` — after the rest of what decided the round:
  `explodeBomb()` calls `endRound` first and only then applies the blast, so a CT killed by the bomb loses a "survive"
  bet. Order of money: kill rewards, then the round-end bonus (in `endRound`), then the payout, capped
  (`min(pay, 16000 − money)`); `paid < pay` → the chat says how much fit. Winning: kill targets `kills >= n`; survive
  `p.alive`; a bettor whose team changed since betting loses; one who left is skipped (stake gone, no line).
- A round decided less than `freezeTime` after it started (a team left during freeze) calls the bets off: stakes back
  (capped), `void: true`, not in the record.
- Bets still open at the next `startRound` (the round never ended: map or mode change, warmup) are dropped without a
  refund (a new match resets the money anyway).
- Odds: ×1.5 / ×3 / ×5 / ×2, from rough office rates (1+ kill in ~60% of rounds, 2+ ~30%, 3+ ~15%, alive at the end
  ~40%): an average player loses about 10–25% on each target, a player who really is that good wins. Change them in
  `shared/bet.js`.
- Best gambler: the player in a team with the highest `betRec.net > 0` this match (`+$1850 · 1 of 1 bet won`).
  `startMatch` clears the records.

### Contracts with the other features

- `p.alive` — read at settling for "survive". `p.downed` is **not** read: a player still downed when the round is
  decided has `p.alive` true and so wins a survive bet; one revived survives; one who bleeds out loses (as long as
  bleeding out goes through `killPlayer`, which sets `alive = false` and calls `bet.onKill`). If downed-at-the-end
  should lose, change `!!p.alive` to `!!p.alive && !p.downed` in `settle()` (lib/bet.js).
- Kill credit with downed players: the counter goes up in `killPlayer` (the real death) for the `killer` passed there.
  If the downed feature credits the kill at the moment of the down instead, it needs to call `bet.onKill` there (or
  pass the right killer to `killPlayer` at the bleed-out).
- `p.playingDead` — not read. A fake death that doesn't call `killPlayer` counts neither as a kill nor as a death for
  bets: the server counts only in `killPlayer`, and the page's tracker changes only on `betTrack` from the server,
  never on `kill` messages (so a fake kill-feed line doesn't move it). A player playing dead is alive: a survive bet
  stands. If play dead does call `killPlayer` for the fake death, it must skip `bet.onKill`.
- `p.bleeding`, `p.disguise`, `p.shield` — not read. "Enemy" is by team (`mates`), so killing a disguised enemy counts
  and killing a teammate never does.

### What was verified, and how

All on test ports (server 4080, headless Edge 9480), test data in a temp folder.

- `unit.mjs` (lib/bet.js alone, 49 checks): every refusal (wrong mode ×2, warmup, round over, after buy time, spectator,
  dead, unknown target, 7 bad stakes, too much money, twice, a bot), the stake taken, betOk/betNew, kill counting
  (enemy, bot yes; teammate, self, world, after the round no), the deferred settling, wins and losses of every target,
  the cap (paid 3850 of 10000; 100 of 600), a team switch, a player who left, a round decided in freeze time (refund),
  leftover bets dropped, the records, the award, a new match. All pass.
- `tws.mjs` (the real server over WebSocket, Dusty, 38 checks): refused in warmup; round 1 four bets, refusals
  (twice, $99999, a made-up target), everyone gets the 4 `betNew`; Rufat kills 3 CTs with a Deagle (tracker 1, 2, 3;
  the victim's tracker dead); `betEnd` after `roundEnd`: 3 kills won $10000 with $4500 fitting under the cap (money
  $16000), survive won $1000, 1 kill with 0 lost, survive-and-killed lost; round 2: a team kill (friendly fire on)
  doesn't count, a bet after buy time is refused, 1 kill won $600, survive won $600, 2 kills with 0 lost; Deathmatch
  refused. All pass.
- `tmatch.mjs` (ROUNDS_TO_WIN=1): the match summary's awards include `Best gambler · Rufat · +$1000 · 1 of 1 bet won`.
- `tsoak.mjs` with `BOTS=4`: 60 s at the default round time (1 round) and 60 s with ROUND_TIME=20 (3 rounds, 3 bets,
  2 settled, the third still open when it stopped); only the person ever bets (7 bots never), nothing on the server's
  stderr or log.
- `gbet.mjs` (the real game in headless Edge, 36 checks, screenshots looked at): warmup F3 shows the reason, the pause
  menu stays hidden; the buy-time hint; the panel at 1920×969 and 1280×600 (fits); keys 2, 9, Enter place $2000 on
  2 kills; the HUD money, the chat line, the tracker (○○ 0/2, ●○ 1/2); F3 again shows the placed bet and can't send a
  second; won $6000 with "(only $2800 fit under the $16000 cap)" in the chat; round 2 with the mouse from the buy menu's
  footer (the panel over the menu, which stays open), Survive, $500, Place bet; killed: the tracker turns red
  ("dead · lost"); "…and lost $500." No page errors. One full run passed everything (before the last polish:
  the Max chip's padding and highlight, the shorter cap note, "dead · lost"); the run with the polished code passed
  everything except "round 1 starts", the harness race described at the end. The atomic read that fixes it is in
  `gbet.mjs` but wasn't run: browser tests were stopped for this round of work (the architect runs them all at the end).
- `footer.mjs`: with the "F3 Bet" item and with it taken out, the panel, the columns, the details strip, the footer
  (31 px high everywhere) and all 41 items are in exactly the same place at buyhover's 11 window sizes.
  `buyhover.mjs` (mansion tooling, pointed at 4080/9480): all items stay put at 10 sizes; 900×560 lists 5 failures
  (the Mines column below the window), the known "900x560 still scrolls" from before this feature — the layout there is
  identical with and without the item.
- The server starts with all 7 maps.

### Browser checks (done on the Mansion maps; see STATUS)

With the server on `MAP=cs_mansion` or `cs_mansion_night` and headless Edge (GAME_PORT / CDP_PORT set):

1. `up.ps1 BOTS=0 START_MONEY=12000 BUY_TIME=40 MAP=cs_mansion`, then `node dev/test-scripts/bet/gbet.mjs` — all 36 should pass;
   look at `bet-panel-1920x969.png` / `bet-panel-1280x600.png` / `bet-picked-1280x600.png` (the "0 Max $2000" chip:
   the key no longer touches the text; with $2000 picked only the $2000 chip lights up), `bet-over-buymenu.png`,
   `bet-track-1of2.png`, `bet-won.png`, `bet-dead.png`, `bet-lost.png`.
2. `node dev/test-scripts/bet/footer.mjs` — "identical" at all 11 sizes (with the other branches' buy-menu changes
   merged too).
3. `node dev/test-scripts/mansion/buyhover.mjs` — all stay put; 900×560 is expected to fail as on `main` (worth
   confirming once on `main` without this branch).
4. By hand on a real laptop: F3 during buy time frees the mouse; Enter / a click on Place bet / Esc / F3 takes it
   back without the pause menu flashing.

### Not verified / known gaps

- Real pointer lock: headless Edge fakes it. The panel exits pointer lock when it opens and calls `lock()` when it
  closes from a key or click (a user gesture, as `closeBuy` does); after an automatic close the browser might refuse,
  and then the pause menu shows after 300 ms (click to play).
- A live bomb explosion deciding a round with a CT survive bet (the deferral is unit-tested, not played), a hostage
  map, a halftime round and a map change in the middle of a round with an open bet weren't played.
- The bet lines share the chat log (8 lines): with six people betting, the bets and results push older chat out.
- Reconnecting in the middle of a round makes a new player: an open bet is lost.
- The round-start banner still says "press B to buy (F1 autobuy, F2 rebuy)" (main.js not touched there); the HUD
  hint "F3 Bet on yourself · N s" covers it.
- No lifetime stats or achievements for bets (only the per-match Best gambler).
- Test tooling: `dev/test-scripts/mansion/game.mjs`'s `msgs()` reads and clears the page's message list in two
  evaluations, so a message arriving between them is lost (it made "round 1 starts" flaky here); `gbet.mjs` reads with
  one `__in.splice(0)` instead.
