// Players join a fresh server the way the shield tests do (a T, then two CTs); prints every round start, round end,
// message and phase change for SECS seconds (default 20), to see that the match starts once and when it goes live.
import { player, sleep } from '../mansion/client.mjs';
const t0 = Date.now(), at = () => ((Date.now() - t0) / 1000).toFixed(1);
const t = await player('Taker', 'T');
let ph = null;
const log = c => m => console.log(at(), c, m.t, m.t === 'msg' ? m.text : m.t === 'round' ? `n ${m.n}` : m.t === 'roundEnd' ? m.reason : '');
for (const k of ['round', 'roundEnd', 'msg']) t.on[k] = log('T');
t.on.s = m => { if (m.ph !== ph) { ph = m.ph; console.log(at(), 'phase', ph, 'tl', m.tl?.toFixed?.(1)); } };
const ct = await player('Front', 'CT');
console.log(at(), 'Front joined');
const ct2 = await player('Side', 'CT');
console.log(at(), 'Side joined');
await sleep((+process.env.SECS || 20) * 1000);
t.close(); ct.close(); ct2.close();
process.exit();
