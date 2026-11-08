// public/js/wounds.js in Node (no browser): a fake DOM, fake hud/net/audio, the real body.js under it (as main.js wires
// them: initWounds, then initBody). Runs every hook main.js calls and the message handlers, and checks what they do.
//   node --import ./dev/test-scripts/wounds/register.mjs dev/test-scripts/wounds/clientsmoke.mjs
let fails = 0, n = 0;
const ok = (what, cond) => { n++; console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) fails++; };

// ---- a fake DOM: enough for the badges and overlays
const el = tag => ({ tag, id: '', style: {}, children: [], innerHTML: '', textContent: '', classList: { add() {}, remove() {}, toggle() {} },
  appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); }, querySelector(s) { return ((this._q ||= {})[s] ||= el('div')); } });
const byId = new Map();
globalThis.document = {
  createElement: el, head: el('head'), body: el('body'),
  getElementById: id => { if (!byId.has(id)) byId.set(id, el('div')); return byId.get(id); },
  querySelector: () => null,
};
globalThis.performance ??= { now: () => Date.now() };

const { initWounds, wounds, drawSyringe } = await import('../../../public/js/wounds.js');
const { initBody, body } = await import('../../../public/js/body.js');
const { WOUNDS } = await import('../../../shared/wounds.js');

// ---- the game's side
const sent = [], played = [], smalls = [], hints = [], progress = [];
const net = { handlers: {}, send: m => sent.push(m) };
const rot = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
const model = () => ({ position: { x: 0, y: 0, z: 0 }, rotation: rot(), userData: { arms: { rotation: rot() }, hand: { rotation: rot() }, lArm: { rotation: rot() }, rArm: { rotation: rot() }, upper: { rotation: rot(), scale: { y: 1 } }, headG: { rotation: rot() }, hip: { position: { y: 0.85 } }, legs: [{ rotation: rot(), scale: { y: 1 } }, { rotation: rot(), scale: { y: 1 } }] } });
const me = { id: 1, team: 'T', alive: true, p: [0, 0, 0], v: [0, 0, 0], yaw: 0, pitch: 0, act: null, slot: 'primary', inv: { primary: { id: 'ak47' }, secondary: { id: 'glock' } }, onGround: true, usingKey: false, usingMouse: false };
const remotes = new Map();
const remote = (id, team, p, name) => { const r = { id, team, alive: true, p, name, yaw: 0, model: model(), buf: [{}], walk: 0 }; remotes.set(id, r); return r; };
remote(2, 'T', [0.6, 0, 0], 'Mate');
remote(3, 'CT', [0, 0, -0.8], 'Bob');
remote(4, 'CT', [10, 0, 10], 'Carl');
const names = { 1: 'Me', 2: 'Mate', 3: 'Bob', 4: 'Carl' };
const radarCalls = [];
const radarCtx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => radarCalls.push([k, ...a])), set: (t, k, v) => { t[k] = v; return true; } });
const hud = {
  hint(t) { hints.push(t); }, progress(l, f) { progress.push([l, f]); }, radar() {}, targetName() {}, small(t) { smalls.push(t); }, killfeed() {},
  radarCtx, radarXform: () => ({ toR: (x, z) => [x, z] }),
};
const keys = new Set();
const slots = [];
const gameDiv = { style: {} }, canvas = { style: {}, parentElement: gameDiv }; // (the blur goes on #game: main.js owns the canvas's filter)
const audio = { play: (...a) => played.push(a) };
const game = { cfg: { gameMode: 'classic' }, phase: 'live' };
initWounds({ net, me, remotes, hud, keys, audio, switchSlot: (s) => { slots.push(s); me.slot = s; }, weaponOf: s => me.inv[s], nameOf: id => names[id], canvas, busy: () => false, blockE: () => false });
initBody({ net, me, game, remotes, hud, keys, firing: () => false, switchSlot: s => { slots.push(s); me.slot = s; }, weaponOf: s => me.inv[s], nameOf: id => names[id], teamOf: id => remotes.get(id)?.team || me.team, audio, busy: () => false });
const snap = (extra = {}) => net.handlers.s({ pl: [], ...extra });
const cam = () => ({ position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, updateMatrixWorld() {} });
let now = performance.now();
const frame = (ms = 33) => { now += ms; wounds.frame(ms / 1000, now, cam()); };
const downEl = () => document.body.children.find(c => c.id === 'wd-down');
const downLine = () => { frame(); return downEl()?.querySelector('.t').textContent ?? '(none)'; };
const badgesHtml = () => byId.get('hud').children.find(c => c.id === 'wd-badges')?.innerHTML || '';

// ---------------------------------------------------------------- 1.1 the drag
snap({ bd: { d: [[2, 0.9, 0.2, 1]], u: [], p: [] } }); // Mate (2) down, me reviving him
me.act = { a: 'bodyRevive', pr: 0.2 };
me.usingKey = true;
keys.add('KeyW');
frame();
ok(`E held + walking while reviving: wdDrag on (${JSON.stringify(sent.at(-1))})`, sent.at(-1)?.t === 'wdDrag' && sent.at(-1).on === 1);
me.act = null;
snap({ bd: { d: [[2, 0.9, 0, 0]], u: [], p: [] }, wd: { d: [[1, 2, 0.6, 0, 0.9]], k: [], i: [], a: [] } });
ok('dragging: the walking speed is capped (5.2 -> 1.3)', Math.abs(wounds.speed(5.2) - WOUNDS.drag.speed) < 1e-9);
ok('dragging: only the pistol (1 blocked, 2 allowed)', wounds.blocksSlot('primary') && !wounds.blocksSlot('secondary'));
frame();
ok(`dragging: switched to the pistol (${slots.at(-1)})`, slots.at(-1) === 'secondary');
hud.hint('Hold E to revive Mate (5 s)');
ok(`hint: "${hints.at(-1)}"`, /^Dragging Mate/.test(hints.at(-1)));
const before = sent.length;
frame(100); frame(100);
ok('still walking: no wdDrag off', sent.length === before);
keys.delete('KeyW');
frame(200); frame(200);
ok(`standing still with E held: wdDrag off (${JSON.stringify(sent.at(-1))})`, sent.at(-1)?.t === 'wdDrag' && sent.at(-1).on === 0);
// not dragging, not reviving, but a downed mate in reach: E held and walking takes hold of him straight away
snap({ bd: { d: [[2, 0.9, 0, 0]], u: [], p: [] } });
keys.add('KeyD');
frame(450);
ok('E held + walking by a downed mate (no revive): wdDrag on', sent.at(-1)?.t === 'wdDrag' && sent.at(-1).on === 1);
keys.delete('KeyD');
me.usingKey = false;
hud.hint('Hold E to revive Mate (5 s)');
ok(`the revive hint says you can drag (${hints.at(-1)})`, / walk to drag him$/.test(hints.at(-1)));

// dragged: the server says where I am
snap({ bd: { d: [[1, 0.8, 0, 0]], u: [], p: [] }, wd: { d: [[2, 1, 1.5, 0, 0.5]], k: [], i: [], a: [] } });
ok('down: body.js knows', body.downed());
ok('dragged: I don\'t move myself (speed 0)', wounds.speed(1) === 0);
for (let i = 0; i < 30; i++) frame();
ok(`dragged: my position goes where the server puts me (${me.p.map(v => Math.round(v * 100) / 100)})`, Math.hypot(me.p[0] - 1.5, me.p[2] - 0.5) < 0.02);
hud.hint('Some hint');
ok('down: no hint line (it would sit on the "YOU\'RE DOWN" panel)', hints.at(-1) === '');
ok(`dragged, under the panel: "${downLine()}"`, /^Mate is dragging you · hold K to end it yourself/.test(downLine()));

// ---------------------------------------------------------------- 1.2 the downed suicide, interrogation
snap({ bd: { d: [[1, 0.8, 0, 0]], u: [], p: [] } });
frame();
ok(`down: "${downLine()}"`, /^Hold K to end it yourself/.test(downLine()));
keys.add('KeyK');
frame();
ok('down, K held: wdEnd on', sent.at(-1)?.t === 'wdEnd' && sent.at(-1).on === 1);
ok('ending it: no crawling', wounds.speed(1) === 0);
snap({ bd: { d: [[1, 0.8, 0, 0]], u: [], p: [] }, wd: { d: [], k: [[1, 0.4]], i: [], a: [] } });
hud.progress(null, 0);
ok('not on the hud\'s progress bar (it would sit on the "YOU\'RE DOWN" panel)', progress.at(-1)[0] == null);
ok(`under the panel: "${downLine()}", its bar at ${downEl().querySelector('.bar i').style.width}`, downLine() === 'Ending it — let go of K to stop' && downEl().querySelector('.bar i').style.width === '40%' && downEl().querySelector('.bar').style.visibility === 'visible');
keys.delete('KeyK');
frame();
ok('K let go: wdEnd off', sent.at(-1)?.t === 'wdEnd' && sent.at(-1).on === 0);
// someone interrogating me
snap({ bd: { d: [[1, 0.8, 0, 0]], u: [], p: [] }, wd: { d: [], k: [], i: [[3, 1, 0.3]], a: [] } });
frame();
ok(`interrogated: "${downLine()}"`, /^Bob is interrogating you — hold K to end it first/.test(downLine()));
// up again; Bob (an enemy) down in front of me
me.p = [0, 0, 0];
snap({ bd: { d: [[3]], u: [], p: [] } });
ok('up again', !body.downed());
hud.hint('');
ok(`a downed enemy in front: "${hints.at(-1)}"`, hints.at(-1) === `Hold E to interrogate Bob (${WOUNDS.ask} s)`);
snap({ bd: { d: [[3]], u: [], p: [] }, wd: { d: [], k: [], i: [], a: [3] } });
hud.hint('');
ok('interrogated already: no hint', hints.at(-1) === '');
me.yaw = Math.PI; remotes.get(3).p = [0, 0, -1.4];
snap({ bd: { d: [[3]], u: [], p: [] } });
hud.hint('');
ok('behind me (1.4 m): no hint', hints.at(-1) === '');
me.yaw = 0;
me.act = { a: 'wdAsk', pr: 0.5 };
snap({ bd: { d: [[3]], u: [], p: [] }, wd: { d: [], k: [], i: [[1, 3, 0.5]], a: [] } });
hud.progress('Defusing the bomb...', 0.5);
ok(`interrogating: "${progress.at(-1)[0]}"`, progress.at(-1)[0] === 'Interrogating Bob...');
me.act = null;
// a downed CT pulls his pistol to his head: the click; the shot
remotes.get(4).p = [3, 0, 3];
snap({ bd: { d: [[4]], u: [], p: [] }, wd: { d: [], k: [[4, 0.1]], i: [], a: [] } });
ok(`his pistol cocked: a 'draw' click where he lies (${JSON.stringify(played.at(-1))})`, played.at(-1)?.[0] === 'draw' && played.at(-1)[1] === remotes.get(4).p);
snap({ bd: { d: [[4]], u: [], p: [] }, wd: { d: [], k: [[4, 0.9]], i: [], a: [] } });
frame();
const u4 = remotes.get(4).model.userData;
ok(`others see the pistol at his temple (arms ${u4.arms.rotation.x.toFixed(2)}, ${u4.arms.rotation.y}; hand ${u4.hand.rotation.y.toFixed(2)})`, Math.abs(u4.arms.rotation.x - Math.PI / 2) < 0.01 && u4.arms.rotation.y === -0.35 && Math.abs(u4.hand.rotation.y - Math.PI / 2) < 0.01);
net.handlers.wdShot({ v: 4, w: 'usp', p: [3, 0.35, 3] });
ok(`and hear the shot (${JSON.stringify(played.at(-1))})`, played.at(-1)?.[0] === 'shot' && played.at(-1)[2] === 'usp');
snap({});
frame();
ok('the pose is put back', u4.arms.rotation.y === 0 && u4.hand.rotation.y === 0);
// the reveal: a ring round the red dot
net.handlers.wdReveal({ by: 1, v: 3, id: 4, s: 5 });
ok(`told who is on the radar ("${smalls.at(-1)}")`, smalls.at(-1) === 'Bob talked: Carl is on your radar for 5 s');
snap({ sp: [[4, 10, 10]] });
radarCalls.length = 0;
hud.radar(null, [], null, [], [], [], false);
ok(`the radar rings him (${radarCalls.filter(c => c[0] === 'arc').length} arc, a "?")`, radarCalls.some(c => c[0] === 'arc' && c[1] === 10 && c[2] === 10) && radarCalls.some(c => c[0] === 'fillText' && c[1] === '?'));
radarCalls.length = 0;
hud.radar(null, [], null, [], [], [], true);
ok('not on a jammed radar', !radarCalls.length);

// ---------------------------------------------------------------- 1.3 wounds
net.handlers.wdWounds({ l: 1, a: 0, h: 0, ad: 0, adT: 0, n: 'l' });
ok(`leg: told ("${smalls.at(-1)}")`, /^Shot in the leg/.test(smalls.at(-1)));
ok(`leg: speed × ${WOUNDS.leg} (${wounds.speed(5)})`, Math.abs(wounds.speed(5) - 5 * WOUNDS.leg) < 1e-9);
me.v = [3, 0, 0];
let dipped = false;
for (let i = 0; i < 60; i++) { now += 33; const c = cam(); wounds.frame(0.033, now, c); if (c.position.y < 1.6 - 0.01) dipped = true; }
ok('leg: the view dips on the bad step', dipped);
me.v = [0, 0, 0];
ok(`badge: ${badgesHtml()}`, /LEG/.test(badgesHtml()));
net.handlers.wdWounds({ l: 1, a: 1, h: 0, ad: 0, adT: 0, n: 'a' });
ok(`arm: the spread (+${WOUNDS.armSpread})`, Math.abs(wounds.spread(0.01) - (0.01 + WOUNDS.armSpread)) < 1e-9);
const y0 = me.yaw;
let moved = 0;
for (let i = 0; i < 30; i++) { frame(); moved = Math.max(moved, Math.abs(me.yaw - y0)); }
ok(`arm: the aim sways by itself (up to ${moved.toFixed(4)} rad)`, moved > 0.002 && moved < 0.03);
net.handlers.wdWounds({ l: 1, a: 1, h: 1, ad: 0, adT: 0, n: 'h' });
let blurred = '';
for (let i = 0; i < 200; i++) { frame(); if (gameDiv.style.filter) blurred = gameDiv.style.filter; }
ok(`head: the sight blurs in waves (${blurred})`, /^blur\(/.test(blurred));
net.handlers.wdWounds({ l: 0.5, a: 0.5, h: 0.5, ad: 0, adT: 0, n: 'band' });
ok(`bandaged: half as bad (speed × ${wounds.speed(1)}), told`, Math.abs(wounds.speed(1) - (1 + WOUNDS.leg) / 2) < 1e-9 && /bandaged/.test(smalls.at(-1)));
frame();
ok(`badges: bandaged (${badgesHtml().match(/wd-band/g)?.length})`, badgesHtml().match(/wd-band/g)?.length === 3);
net.handlers.spawn?.({ p: [0, 0, 0], yaw: 0, sq: 2 });
ok('a new life: no wounds', wounds.speed(1) === 1 && wounds.spread(0) === 0);
for (let i = 0; i < 3; i++) frame();
ok('and no blur', gameDiv.style.filter === '' && !canvas.style.filter);
net.handlers.wdWounds({ l: 1, a: 0, h: 0, ad: 0, adT: 0, n: 'l' });
net.handlers.spawn?.({ p: [3, 0, 3], yaw: 0, sq: 2 });
ok('the same spawn number again (a move, not a new life): the wounds stay', wounds.speed(1) === WOUNDS.leg);
net.handlers.spawn?.({ p: [0, 0, 0], yaw: 0, sq: 3 });
ok('the next life: gone', wounds.speed(1) === 1);

// ---------------------------------------------------------------- 1.4 adrenaline
net.handlers.wdWounds({ l: 0, a: 0, h: 0, ad: 20000, adT: 20000, n: 'ad' });
ok(`adrenaline: told ("${smalls.at(-1)}")`, /^Adrenaline!/.test(smalls.at(-1)));
ok(`adrenaline: shaky (spread +${wounds.spread(0).toFixed(4)})`, wounds.spread(0) > 0.012);
frame();
ok(`badge (${badgesHtml()})`, /ADRENALINE/.test(badgesHtml()));
me.inv.adren = 1;
frame();
ok('the syringe has a badge', /SYRINGE/.test(badgesHtml()));
me.act = { a: 'bodyRevive', pr: 0.3 };
snap({ bd: { d: [[2, 0.9, 0.3, 1]], u: [], p: [] } });
hud.progress('Defusing the bomb...', 0.3);
ok(`reviving with it: "${progress.at(-1)[0]}"`, progress.at(-1)[0] === 'Reviving Mate (adrenaline)...');
me.act = null;
const g = new Proxy({ save() {}, restore() {}, translate() {}, rotate() {} }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
let drew = true;
try { drawSyringe(g); } catch { drew = false; }
ok('the buy menu picture draws', drew);

console.log(`\n${n - fails}/${n} OK`);
if (fails) process.exitCode = 1;
