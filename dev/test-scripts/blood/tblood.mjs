// Blood trails on the server (test server on GAME_PORT with MAP=cs_mansion BOTS=0, fresh data; ~90 s).
// 1. what bleeds (bleeds()); 2. a CT's USP shot makes a T bleed (snapshot bl), the T bandages (P: bloodBandage):
// no shooting meanwhile, then the bleeding stops; 3. bandaging when not bleeding is refused; 4. a leg shot bleeds
// lightly, the bandages run out (2 a life); 5. the bleeding stops by itself after BLOOD.secs; 6. a dead player isn't
// listed, and the next round brings fresh bandages; 7. a knife stab bleeds heavily and costs HP slowly; 8. Zombie
// mode: claws on a human's armor make him bleed, a zombie shot never bleeds.
import { player, admin, sleep } from '../mansion/client.mjs';
import { bleeds } from '../../../lib/blood.js';
import { BLOOD } from '../../../shared/blood.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };

// ---- 1. what makes you bleed
ok('bullets, knife, mines and blasts bleed', bleeds('usp', 'chest') && bleeds('ak47', 'head') && bleeds('pkt', 'legs') && bleeds('knife', 'chest') && bleeds('pmn', 'legs') && bleeds('he', 'he') && bleeds('rpg', 'he') && bleeds('car', 'he'));
ok('fire, debris, being run over and a rocket\'s fire don\'t', !bleeds('molotov', 'chest') && !bleeds('collapse', 'head') && !bleeds('car', 'chest') && !bleeds('rpg', 'chest') && !bleeds('mortar', 'chest') && !bleeds('world', 'chest'));

const t = await player('Bleeder', 'T'), ct = await player('Shooter', 'CT');
let bl = null;
t.on.s = m => { bl = m.bl || null; };
const entry = id => (bl || []).find(e => e[0] === id);
const tid = () => t.me?.id ?? t.log.find(m => m.t === 'welcome')?.id;
const roundStart = async () => {
  t.clear(); ct.clear();
  for (let i = 0; i < 200 && !t.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
  await sleep(3400); // freeze time
};
const dirTo = (o, p) => { const d = p.map((v, i) => v - o[i]), l = Math.hypot(...d); return d.map(v => v / l); };
const ctShoot = async (w = 'usp', alt = false) => {
  const o = [ct.p[0], ct.p[1] + 1.62, ct.p[2]];
  ct.send({ t: 'shoot', o, d: dirTo(o, [t.p[0], t.p[1] + 1.2, t.p[2]]), w, alt });
  await sleep(350);
};
const myId = t.log.find(m => m.t === 'welcome').id, ctId = ct.log.find(m => m.t === 'welcome').id;

await roundStart();
t.at([2, 0, -16], -Math.PI / 2); ct.at([6, 0, -16], Math.PI / 2);
await sleep(400);
ok('nobody bleeds at round start', !entry(myId));

// ---- 2. shot: bleeding; bandage: no shooting, then it stops
await ctShoot('usp');
const hp0 = t.got('dmg').at(-1)?.hp;
ok(`a USP shot hurt the T (hp ${hp0})`, hp0 < 100);
await sleep(200);
ok(`the T bleeds: bl ${JSON.stringify(entry(myId))}`, entry(myId)?.[1] >= 1);
t.clear(); ct.clear();
t.send({ t: 'bloodBandage' });
await sleep(250);
const start = t.got('bloodBandage')[0];
ok(`bandaging started: ${JSON.stringify(start)}`, start?.s === 'start' && start.dur === BLOOD.bandage * 1000 && start.left === BLOOD.bandages - 1);
ok('the snapshot says so (flag 1)', (entry(myId)?.[2] & 1) === 1);
const o = [t.p[0], 1.62, t.p[2]];
t.send({ t: 'shoot', o, d: dirTo(o, [ct.p[0], 1.2, ct.p[2]]), w: 'glock' });
await sleep(300);
ok('a shot while bandaging is refused (the CT took no damage)', !ct.got('dmg').length);
await sleep(BLOOD.bandage * 1000);
ok('bandaging done', t.got('bloodBandage').some(m => m.s === 'done'));
ok('no longer bleeding', !entry(myId));
t.send({ t: 'shoot', o, d: dirTo(o, [ct.p[0], 1.2, ct.p[2]]), w: 'glock' });
await sleep(300);
ok('shooting works again afterwards', ct.got('dmg').length === 1);

// ---- 3. not bleeding: refused, no bandage used
t.clear();
t.send({ t: 'bloodBandage' });
await sleep(250);
ok('bandaging while not bleeding is refused', !t.got('bloodBandage').length && t.got('msg').some(m => /not bleeding/.test(m.text)));

// ---- 4. the last bandage (a shot in the legs: a light wound), then none
const ctShootLegs = async () => {
  const o = [ct.p[0], ct.p[1] + 1.62, ct.p[2]];
  ct.send({ t: 'shoot', o, d: dirTo(o, [t.p[0], t.p[1] + 0.35, t.p[2]]), w: 'usp' });
  await sleep(350);
};
t.clear();
await ctShootLegs();
await sleep(200);
ok(`a leg shot (hp ${t.got('dmg').at(-1)?.hp}): light bleeding: bl ${JSON.stringify(entry(myId))}`, entry(myId)?.[1] === 1);
t.clear();
t.send({ t: 'bloodBandage' });
await sleep(BLOOD.bandage * 1000 + 300);
ok('second bandage used, none left', t.got('bloodBandage').some(m => m.s === 'start' && m.left === 0) && t.got('bloodBandage').some(m => m.s === 'done'));
await ctShootLegs();
await sleep(200);
t.clear();
t.send({ t: 'bloodBandage' });
await sleep(300);
ok(`no bandages left: refused (hp ${t.me?.hp ?? '?'})`, !t.got('bloodBandage').length && t.got('msg').some(m => /No bandages left/.test(m.text)));
ok('still bleeding', entry(myId)?.[1] >= 1);

// ---- 5. it stops by itself
const woundAt = Date.now();
for (let i = 0; i < (BLOOD.secs + 3) * 10 && entry(myId); i++) await sleep(100);
const secs = (Date.now() - woundAt) / 1000 + 0.75;
ok(`the bleeding stopped by itself after ~${secs.toFixed(1)} s`, !entry(myId) && secs > BLOOD.secs - 1 && secs < BLOOD.secs + 2);

// ---- 6. dead: not listed; next round: fresh bandages
for (let i = 0; i < 12 && t.me?.alive !== false; i++) await ctShoot('usp');
await sleep(200);
ok('dead: not listed', t.me?.alive === false && !entry(myId));
await roundStart();
ok(`next round: fresh bandages (${JSON.stringify(t.got('bloodKit').at(-1))})`, t.got('bloodKit').at(-1)?.left === BLOOD.bandages);
ok('nobody bleeds', !bl);

// ---- 7. a knife stab: heavy bleeding, slow HP loss (never below BLOOD.minHp)
t.at([2, 0, -16], -Math.PI / 2); ct.at([3.1, 0, -16], Math.PI / 2); await sleep(400);
t.clear();
await ctShoot('knife', true);
const hp1 = t.got('dmg').at(-1)?.hp;
await sleep(200);
ok(`a knife stab (hp ${hp1}) bleeds heavily: bl ${JSON.stringify(entry(myId))}`, entry(myId)?.[1] === 3);
await sleep(BLOOD.drain[3] * 1000 * 2 + 400);
const hp2 = t.me.hp;
ok(`heavy bleeding costs HP slowly: ${hp1} -> ${hp2} in ${(BLOOD.drain[3] * 2 + 0.4).toFixed(1)} s`, hp2 === hp1 - 2);

// ---- 8. Zombie mode: claws through armor bleed; zombies never bleed
await admin({ action: 'settings', settings: { gameMode: 'zombie' } });
t.clear(); ct.clear();
for (let i = 0; i < 100 && !t.got('spawn').length; i++) await sleep(100);
await sleep(3500);
// both buy a vest (humans buy anywhere before the infection), then wait for it
t.send({ t: 'buy', item: 'vest' }); ct.send({ t: 'buy', item: 'vest' });
for (let i = 0; i < 250 && !t.got('zstart').length; i++) await sleep(100);
const zs = t.got('zstart')[0];
ok(`the infection started: zombies ${JSON.stringify(zs?.ids)}`, !!zs);

const [zombie, human] = zs.ids.includes(myId) ? [t, ct] : [ct, t];
const hid = zs.ids.includes(myId) ? ctId : myId, zid = zs.ids.includes(myId) ? myId : ctId;
zombie.at([2, 0, -16]); human.at([3.2, 0, -16]); await sleep(400);
ok(`the human has armor (${human.me?.armor})`, human.me?.armor > 0);
{
  const zo = [2, 1.62, -16];
  zombie.send({ t: 'shoot', o: zo, d: dirTo(zo, [3.2, 1.2, -16]), w: 'claws' });
  await sleep(400);
}
ok(`claws on the vest: the human bleeds: ${JSON.stringify(bl)}`, (bl || []).some(e => e[0] === hid));
{
  const ho = [3.2, 1.62, -16];
  zombie.clear();
  human.send({ t: 'shoot', o: ho, d: dirTo(ho, [2, 1.2, -16]), w: human.me?.inv?.secondary?.id || 'usp' });
  await sleep(400);
}
ok(`a shot zombie (hp ${zombie.got('dmg').at(-1)?.hp}) doesn't bleed: ${JSON.stringify(bl)}`, zombie.got('dmg').length && !(bl || []).some(e => e[0] === zid));
await admin({ action: 'settings', settings: { gameMode: 'classic' } });
t.close(); ct.close();
process.exit();
