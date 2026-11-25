// cs_meridian stage 3, live. Fresh test server: GAME_PORT=3995 MAP=cs_meridian BOTS=0 FREEZE_TIME=1 PHONE_TRACKER=1.
// The phone tracker works here too (Alice gets it; its first scan counts Bob's phone) and the storm's strikes reach
// everyone (a 'storm' message within the first 20 s of the round).
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const ct = await player('Alice', 'CT');
ct.on.round = m => st.rounds.push(m.n);
const t = await player('Bob', 'T');
await nextLive([ct, t], st);
await until(() => ct.snap?.ph === 'live', 8000);
await sleep(400);
ok('Alice has the phone tracker', ct.me?.inv?.tracker > 0);
ct.w = 'tracker'; ct.at(ct.p, 0); await sleep(200);
ct.send({ t: 'scan' });
ok(`its first scan counts Bob's phone (${got(ct, 'trk').at(-1)?.count})`, await until(() => got(ct, 'trk').at(-1)?.count === 1, 5000));
ok('lightning strikes (a storm message reaches both players)', await until(() => got(ct, 'storm').length > 0 && got(t, 'storm').length > 0, 20000));
console.log(ok.fails() ? ok.fails() + ' FAILED' : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
