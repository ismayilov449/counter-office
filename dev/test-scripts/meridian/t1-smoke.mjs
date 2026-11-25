// cs_meridian live smoke test. Fresh test server: GAME_PORT=3995 MAP=cs_meridian BOTS=0 FREEZE_TIME=1 (no browser).
// A CT and a T join; the round goes live with 4 hostages; the CT walks into the walk-in freezer and leads its hostage.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive } from '../explosives/lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const ct = await player('Alice', 'CT');
ct.on.round = m => st.rounds.push(m.n);
const t = await player('Bob', 'T');
const hs = [];
ct.ws.addEventListener('message', e => { const s = String(e.data); if (s.includes('"hs":')) { try { const m = JSON.parse(s); if (m.hs) hs.splice(0, hs.length, ...m.hs); } catch {} } });
await nextLive([ct, t], st);
await until(() => ct.snap?.ph === 'live', 8000);
ok(`the round is live on cs_meridian (${ct.snap?.ph})`, ct.snap?.ph === 'live');
ok(`Bob spawned in the penthouse (y ${t.p?.[1]})`, Math.abs((t.p?.[1] ?? 0) - 12) < 0.3);
ok(`Alice spawned on the street (z ${ct.p?.[2]})`, (ct.p?.[2] ?? 0) > 14);
// into the freezer: open its door first (it's in the way), then E on the hostage
ct.at([-19.1, 0.12, -5.6], Math.PI); await sleep(300);
ct.send({ t: 'use', on: true }); await sleep(150); ct.send({ t: 'use', on: false }); await sleep(900);
ct.at([-19.4, 0.12, -7.6], Math.PI / 2); await sleep(300);
ct.send({ t: 'use', on: true }); await sleep(150); ct.send({ t: 'use', on: false });
ok('the freezer hostage follows Alice', await until(() => hs.find(h => Math.abs(h[1] + 20) < 1.5 && Math.abs(h[3] + 8.3) < 2)?.[5] === 1, 3000));
ok(`4 hostages (${hs.length})`, hs.length === 4);
console.log(ok.fails() ? ok.fails() + ' FAILED' : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
