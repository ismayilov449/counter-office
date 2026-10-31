// lib/blood.js on its own (no server): createBlood with fake players and a fake clock. What bleeds, the levels, the
// HP it costs (never below BLOOD.minHp, nothing while downed), bandaging and every refusal, the snapshot's `bl` (downed
// players bleed heavily all the time, someone playing dead isn't listed, in a car: no drops), a new life. Run:
//   node dev/test-scripts/blood/unit.mjs
import { createBlood, bleeds } from '../../../lib/blood.js';
import { BLOOD, BL_BANDAGING, BL_NODROPS, bleedLevel } from '../../../shared/blood.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };

let T = 1e6;
const players = new Map(), out = [], mes = [];
const inTeam = p => p.team === 'T' || p.team === 'CT';
const b = createBlood({ players, now: () => T, send: (p, m) => out.push([p.id, m]), sendMe: p => mes.push(p.id), inTeam });
let nextId = 1;
const add = (o = {}) => { const p = { id: nextId++, team: 'T', alive: true, hp: 100, spawnSeq: 1, driving: null, riding: null, piloting: null, ...o }; players.set(p.id, p); return p; };
const tick = (ms = 31.25) => { T += ms; b.tick(T); };
const said = id => out.filter(([i, m]) => i === id && m.t === 'msg').map(([, m]) => m.text);
const got = (id, t) => out.filter(([i, m]) => i === id && m.t === t).map(([, m]) => m);
const row = id => (b.snap()?.bl || []).find(r => r[0] === id);

// ---- what bleeds
ok('bullets, the knife, the PKT, a mine, any blast (shrapnel) bleed', ['usp', 'ak47', 'awp', 'm249', 'knife', 'pkt'].every(w => bleeds(w, 'chest')) && bleeds('pmn', 'legs') && ['he', 'rpg', 'c4', 'car', 'mortar', 'satchel', 'drone', 'mon50'].every(w => bleeds(w, 'he')));
ok('fire, a fall, debris, being run over, a rocket\'s or a shell\'s fire don\'t', !bleeds('molotov', 'chest') && !bleeds('molotov', 'he') && !bleeds('fall', 'fall') && !bleeds('collapse', 'head') && !bleeds('car', 'chest') && !bleeds('rpg', 'chest') && !bleeds('mortar', 'chest') && !bleeds('world', 'chest'));
ok(`levels: light under ${BLOOD.medium}, medium under ${BLOOD.heavy}, heavy from there`, bleedLevel(1) === 1 && bleedLevel(BLOOD.medium - 1) === 1 && bleedLevel(BLOOD.medium) === 2 && bleedLevel(BLOOD.heavy) === 3);

// ---- a new life: bandages, the kit message (not to bots)
const a = add(), bot = add({ bot: true }), spec = add({ team: 'SPEC' });
tick();
ok('a new life: bandages for everyone, the kit message to humans only', a.bandages === BLOOD.bandages && bot.bandages === BLOOD.bandages && got(a.id, 'bloodKit')[0]?.left === BLOOD.bandages && !got(bot.id, 'bloodKit').length);
ok('nobody bleeds: no `bl` in the snapshot', b.snap() === null);

// ---- wounds
a.hp = 80; b.wound(a, 20, 'usp', 'chest');
ok(`a 20 HP pistol wound: light (${a.bleeding}), listed`, a.bleeding === 1 && JSON.stringify(row(a.id)) === JSON.stringify([a.id, 1, 0]));
a.hp = 65; b.wound(a, 15, 'usp', 'legs');
ok(`another 15: the damage adds up to a medium bleed (${a.bleedDmg} -> ${a.bleeding})`, a.bleedDmg === 35 && a.bleeding === 2);
b.wound(a, 10, 'molotov', 'chest');
ok('a burn on top changes nothing', a.bleedDmg === 35);
const z = add({ zombie: true }); b.wound(z, 50, 'usp', 'chest');
ok('a zombie never bleeds', !z.bleeding);
const dead = add({ alive: false, hp: 0 }); b.wound(dead, 50, 'usp', 'chest');
ok('a dead player doesn\'t start bleeding', !dead.bleeding);

// ---- the HP it costs: medium 1 HP every BLOOD.drain[2] s, never below BLOOD.minHp
mes.length = 0;
for (let i = 0; i < 32 * 10; i++) tick(); // 10 s
ok(`10 s of a medium bleed: ${65 - a.hp} HP (1 every ${BLOOD.drain[2]} s), a 'me' each time`, 65 - a.hp === Math.floor(10 / BLOOD.drain[2]) && mes.filter(i => i === a.id).length === 65 - a.hp);
const low = add({ hp: BLOOD.minHp + 1 }); tick(); b.wound(low, 60, 'knife', 'chest'); low.hp = BLOOD.minHp + 1;
for (let i = 0; i < 32 * 15; i++) tick();
ok(`a heavy bleed at ${BLOOD.minHp + 1} HP stops at ${low.hp} (bleeding alone never kills)`, low.hp === BLOOD.minHp && low.bleeding === 3);
const light = add({ hp: 90 }); tick(); b.wound(light, 10, 'glock', 'legs');
for (let i = 0; i < 32 * 10; i++) tick();
ok('a light bleed costs no HP', light.hp === 90);

// ---- it stops by itself, BLOOD.secs after the last wound
for (let i = 0; i < 32 * (BLOOD.secs - 10) + 8; i++) tick();
ok(`light bleeding stopped after ${BLOOD.secs} s`, !light.bleeding && !row(light.id));

// ---- bandaging and its refusals
const c = add(); tick(); out.length = 0;
b.bandage(c, T);
ok(`not bleeding: "${said(c.id)[0]}"`, /not bleeding/.test(said(c.id)[0]) && c.bandages === BLOOD.bandages);
b.wound(c, 40, 'ak47', 'chest');
c.driving = 0; b.bandage(c, T); c.driving = null;
c.piloting = 3; b.bandage(c, T); c.piloting = null;
c.zip = { at: 0 }; b.bandage(c, T); c.zip = null;
c.downed = true; b.bandage(c, T); c.downed = false;
ok(`driving / flying the drone / on the zip line / downed: refused (${said(c.id).slice(1).map(s => `"${s}"`).join(', ')}), no bandage used`, said(c.id).length === 5 && /driving/.test(said(c.id)[1]) && /drone/.test(said(c.id)[2]) && /zip line/.test(said(c.id)[3]) && /down/.test(said(c.id)[4]) && c.bandages === BLOOD.bandages && !c.bandageUntil);
spec.bleeding = 2; b.bandage(spec, T); spec.bleeding = 0;
ok('a spectator: ignored', !out.some(([i]) => i === spec.id));
b.bandage(c, T);
ok('bandaging: the start message, the flag in the snapshot, busy', got(c.id, 'bloodBandage')[0]?.s === 'start' && got(c.id, 'bloodBandage')[0].left === BLOOD.bandages - 1 && (row(c.id)[2] & BL_BANDAGING) && b.busy(c));
b.bandage(c, T);
ok('P again meanwhile: nothing', got(c.id, 'bloodBandage').length === 1 && c.bandages === BLOOD.bandages - 1);
for (let i = 0; i < 32 * BLOOD.bandage - 2; i++) tick();
ok('still bandaging just before the end', b.busy(c) && c.bleeding === 2);
for (let i = 0; i < 4; i++) tick();
ok('done: no longer busy, not bleeding, the done message', !b.busy(c) && !c.bleeding && !row(c.id) && got(c.id, 'bloodBandage').at(-1)?.s === 'done');
b.wound(c, 40, 'ak47', 'chest'); b.bandage(c, T); for (let i = 0; i < 32 * BLOOD.bandage + 4; i++) tick();
b.wound(c, 40, 'ak47', 'chest'); out.length = 0; b.bandage(c, T);
ok(`the bandages run out (${BLOOD.bandages} a life): "${said(c.id)[0]}"`, c.bandages === 0 && /No bandages left/.test(said(c.id)[0]) && c.bleeding);
const d = add(); tick(); b.wound(d, 40, 'ak47', 'chest'); b.bandage(d, T); tick();
d.alive = false; tick();
ok('killed while bandaging: no longer busy, not listed, no done message', !b.busy(d) && !d.bandageUntil && !row(d.id) && got(d.id, 'bloodBandage').length === 1);
d.alive = true; d.spawnSeq++; out.length = 0; tick();
ok('the next life: fresh bandages', d.bandages === BLOOD.bandages && got(d.id, 'bloodKit')[0]?.left === BLOOD.bandages);
const e = add(); tick(); b.wound(e, 40, 'ak47', 'chest'); b.bandage(e, T); tick();
e.zombie = true; tick();
ok('turned into a zombie while bandaging: bleeding and bandaging stop', !e.bleeding && !b.busy(e));

// ---- the snapshot
const car = add(); tick(); b.wound(car, 40, 'ak47', 'chest'); car.riding = 2;
ok('a passenger in a car: listed, flag 2 (no drops)', row(car.id)?.[2] === BL_NODROPS);
car.riding = null; car.driving = 1;
ok('the driver: the same', row(car.id)?.[2] === BL_NODROPS);
car.driving = null;
const down = add(); tick(); down.downed = true; down.hp = 0;
ok('downed, never wounded through this feature: bleeds heavily (`p.bleeding || p.downed`)', JSON.stringify(row(down.id)) === JSON.stringify([down.id, BLOOD.downed, 0]));
b.wound(down, 30, 'usp', 'chest');
ok('downed: a further hit doesn\'t change it', row(down.id)?.[1] === BLOOD.downed && !down.bleeding);
mes.length = 0; for (let i = 0; i < 32 * 10; i++) tick();
ok('downed: still listed, no HP drain', row(down.id)?.[1] === BLOOD.downed && down.hp === 0 && !mes.includes(down.id));
down.downed = false; down.alive = false;
ok('finished off: not listed', !row(down.id));
const pd = add(); tick(); b.wound(pd, 40, 'ak47', 'chest'); pd.playingDead = true;
ok('playing dead: not listed (no drops give it away), still bleeding underneath', !row(pd.id) && pd.bleeding === 2);
pd.playingDead = false;
ok('up again: listed again', row(pd.id)?.[1] === 2);
const sp2 = add({ team: 'SPEC', bleeding: 2 });
ok('a spectator is never listed', !row(sp2.id));
// a new round: everyone stops
for (const p of players.values()) p.spawnSeq++;
tick();
ok('a new round: nobody bleeds, nobody bandages', [...players.values()].every(p => !p.bleeding && !p.bandageUntil) && (b.snap()?.bl || []).every(r => players.get(r[0]).downed));
console.log(process.exitCode ? 'SOME FAILED' : 'all passed');
