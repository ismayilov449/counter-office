// public/js/disguise.js in Node (no browser): a fake DOM and a fake WebAudio, real three.js. Runs every entry point main.js
// calls — hint, onSnapshot (markers, badge, view-model look, the smoothing of a body that lies down metres away),
// watchable, the message handlers with their sounds — and checks what they do. Run:
//   node --import ./dev/test-scripts/disguise/register.mjs dev/test-scripts/disguise/clientsmoke.mjs
import * as THREE from 'three';
import { checker } from './lib.mjs';
const ok = checker();

// ---- fakes: anything called on them works and returns another fake; numbers read as 0
const fake = (base = {}) => new Proxy(base, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === Symbol.toPrimitive) return () => 0;
    if (k === 'then') return undefined;
    return (t[k] = fake(function () {}));
  },
  apply() { return fake(); },
});
const audioNodes = [];
class FakeAudioContext {
  constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 8000; this.destination = fake(); this.listener = fake(); }
  node(kind) { const n = fake({ kind, context: this, connect: d => d, disconnect() {}, start() {}, stop() {} }); audioNodes.push(n); return n; }
  createGain() { return this.node('gain'); }
  createBiquadFilter() { return this.node('filter'); }
  createOscillator() { return this.node('osc'); }
  createPanner() { return this.node('panner'); }
  createBufferSource() { return this.node('source'); }
  createConvolver() { return this.node('convolver'); }
  createDynamicsCompressor() { return this.node('comp'); }
  createBuffer(ch, len) { return { sampleRate: this.sampleRate, getChannelData: () => new Float32Array(len) }; }
  resume() {}
  decodeAudioData() { return Promise.reject(new Error('no')); }
}
const els = new Map();
const element = tag => ({ tag, style: {}, children: [], innerHTML: '', textContent: '', classList: fake(), appendChild(c) { this.children.push(c); return c; } });
globalThis.window = { AudioContext: FakeAudioContext };
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.document = {
  createElement: tag => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => fake() } : element(tag)),
  getElementById: id => { if (!els.has(id)) els.set(id, element('div')); return els.get(id); },
};
globalThis.performance ??= { now: () => Date.now() };

const { audio } = await import('../../../public/js/audio.js');
const { disguise } = await import('../../../public/js/disguise.js');
audio.init();

const said = [];
const hud = { center: (a, b) => said.push(['center', a, b]), small: a => said.push(['small', a]) };
let vmRefresh = 0;
const me = { id: 1, team: 'CT', alive: true, p: [0, 0, 0], crouch: false, act: null };
const game = { cfg: { gameMode: 'classic' }, phase: 'live', roster: [{ id: 1, alive: true }, { id: 2, alive: true }, { id: 3, alive: false }, { id: 4, alive: false }] };
const remotes = new Map();
const remote = (id, team, alive, p, name) => {
  const r = { id, team, alive, p, name, model: new THREE.Group(), buf: [{ t: 0, p, alive: alive ? 1 : 0 }], deadT: 0, lastP: null };
  remotes.set(id, r);
  return r;
};
remote(2, 'CT', true, [5, 0, 5], 'Dave');
const bob = remote(3, 'T', false, [0.6, 0, 0.3], 'Bob');
disguise.init({ me, game, remotes, hud, refreshViewModel: () => vmRefresh++ });

remotes.delete(3);
ok('no body near: the hint is left alone', disguise.hint('Press B to buy', () => false) === 'Press B to buy' && disguise.hint('', () => false) === '');
remotes.set(3, bob);
ok(`standing by Bob's body: "${disguise.hint('', () => false)}"`, disguise.hint('', () => false) === "Crouch and hold E to put on Bob's uniform");
ok(`with a gun on the floor too: "${disguise.hint('Press E to swap for the Glock-18', () => false)}"`, /^Press E to swap for the Glock-18 · crouch \+ hold E for Bob's uniform$/.test(disguise.hint('Press E to swap for the Glock-18', () => false)));
me.crouch = true;
ok(`crouched: "${disguise.hint('', () => false)}"`, /^Hold E to put on Bob's uniform \(3 s/.test(disguise.hint('', () => false)));
ok('E does something that comes first here (busy): left alone', disguise.hint('Hold E to plant the bomb', () => true) === 'Hold E to plant the bomb');
bob.model.userData.gibAll = true;
ok('a body blown apart: no hint', disguise.hint('', () => false) === '');
bob.model.userData.gibAll = false;
game.phase = 'warmup';
ok('warmup: no hint', disguise.hint('', () => false) === '');
game.phase = 'live';
me.act = { a: 'disguise', pr: 0.5 };
ok('while changing: no hint; the progress label', disguise.hint('', () => false) === '' && disguise.progressLabel() === 'Putting on the uniform...');
me.act = null;

// our team's snapshot part: I wear Bob's uniform, Dave (teammate) wears Eve's
disguise.onSnapshot({ d: [[1, 3, 'Bob', 1], [2, 5, 'Eve', 1]], u: [1, 2], s: [3, 5] });
const dave = remotes.get(2);
const mark = dave.model.children.find(c => c.isSprite);
ok('a mask marker over Dave', !!mark && mark.position.y > 2.3 && mark.visible);
ok('my look is T (the view model is rebuilt)', disguise.look() === 'T' && vmRefresh === 1);
const badge = els.get('hud')?.children[0];
ok(`the badge: "${badge?.innerHTML}"`, /DISGUISED/.test(badge?.innerHTML) && badge.style.display === '');
ok('used: no more hints', disguise.hint('', () => false) === '');
disguise.onSnapshot({ d: [[1, 3, 'Bob', 1], [2, 5, 'Eve', 1]], u: [1, 2], s: [3, 5] });
ok('the next snapshot changes nothing (one marker, no rebuild)', dave.model.children.filter(c => c.isSprite).length === 1 && vmRefresh === 1);
// Dave's model is rebuilt (e.g. a new remote): the marker moves to the new one
dave.model = new THREE.Group();
disguise.onSnapshot({ d: [[2, 5, 'Eve', 1]], u: [1, 2], s: [3, 5] });
ok('a rebuilt model gets the marker; I\'m no longer disguised', dave.model.children.filter(c => c.isSprite).length === 1 && disguise.look() === null && vmRefresh === 2 && badge.style.display === 'none');
disguise.onSnapshot(undefined);
ok('no "dg": markers gone', dave.model.children.filter(c => c.isSprite).length === 0);
ok('and Bob\'s body can be offered again (not stripped any more in this fake)', disguise.hint('', () => false) !== '');

// a body that lies down metres from where it last stood is put straight there
const carl = remote(4, 'T', false, [10, 0, 10], 'Carl');
carl.buf = [{ t: 0, p: [0, 0, 0], alive: 1 }, { t: 30, p: [10, 0, 10], alive: 0 }];
disguise.onSnapshot(undefined);
ok('a body lying down 14 m away: no slide (one sample, already down)', carl.buf.length === 1 && carl.deadT === 1);
const ed = remote(6, 'T', false, [1, 0, 1], 'Ed');
ed.buf = [{ t: 0, p: [0.9, 0, 1], alive: 1 }, { t: 30, p: [1, 0, 1], alive: 0 }];
disguise.onSnapshot(undefined);
ok('an ordinary death keeps its fall', ed.buf.length === 2 && ed.deadT === 0);

// spectating
ok('a classic round: not someone the scoreboard has as dead', disguise.watchable(3) === false && disguise.watchable(2) === true);
game.phase = 'warmup';
ok('warmup: anyone', disguise.watchable(3) === true);
game.phase = 'live';

// messages and their sounds
const H = disguise.handlers;
said.length = 0; audioNodes.length = 0;
H.disguiseOn({ id: 1, you: 1, as: 'Bob', look: 'T' });
ok('disguiseOn (me): DISGUISED, the look, a sound', said[0]?.[1] === 'DISGUISED' && disguise.look() === 'T' && audioNodes.length > 0);
H.disguiseOn({ id: 2, name: 'Dave', as: 'Eve', look: 'T' });
ok(`disguiseOn (a teammate): "${said[1]?.[1]}"`, /Dave is wearing Eve's uniform/.test(said[1]?.[1]));
audioNodes.length = 0;
H.disguiseOff({ you: 1, why: 'shot' });
ok(`disguiseOff (me): "${said[2]?.[1]} — ${said[2]?.[2]}", a sting`, said[2]?.[1] === 'DISGUISE BLOWN' && /fired a shot/.test(said[2]?.[2]) && disguise.look() === null && audioNodes.length > 0);
H.disguiseOff({ id: 2, mate: 1, name: 'Dave', why: 'near' });
ok(`disguiseOff (a teammate): "${said[3]?.[1]}"`, /Dave's disguise is blown/.test(said[3]?.[1]));
audioNodes.length = 0;
H.disguiseOff({ id: 7, name: 'Zed', as: 'Bob', why: 'near', p: [3, 0, 3] });
ok(`disguiseOff (an enemy found out): "${said[4]?.[1]} — ${said[4]?.[2]}", a sting there`, said[4]?.[1] === 'IMPOSTOR: Zed' && /recognised up close/.test(said[4]?.[2]) && audioNodes.some(n => n.kind === 'panner'));
H.disguiseOff({ you: 1, why: 'gone' });
ok(`disguiseOff (gone): quiet, "${said[5]?.[1]}"`, said[5]?.[0] === 'small');
audioNodes.length = 0;
H.disguiseFx({ k: 'start', n: 9, p: [1, 0, 1] });
const rustle = audioNodes.length;
H.disguiseFx({ k: 'stop', n: 9, p: [1, 0, 1] });
H.disguiseFx({ k: 'start', n: 10, p: [1, 0, 1] });
H.disguiseFx({ k: 'done', n: 10, p: [1, 0, 1] });
H.disguiseFx({ k: 'stop', n: 99, p: [1, 0, 1] }); // (one it never heard start)
ok(`the rustle: ${rustle} audio nodes for 3 s of cloth, stopped and done without errors`, rustle > 20);
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'all passed');
process.exit();
