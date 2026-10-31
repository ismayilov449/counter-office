// Points the real mouse (CDP input events) at every item in the buy menu, at a few laptop-sized windows, and checks
// that the item stays where it was and is still the one under the mouse (the details panel mustn't push it away).
// Prints the failures and takes a screenshot of the menu at each size (OUT/buyhover-<w>x<h>.png).
import { open, sleep } from './game.mjs';
// (laptop screens in a browser window and fullscreen: 1080p at 100/125/150% scaling, 1366x768)
const SIZES = [[1920, 969], [1920, 1080], [1536, 730], [1536, 864], [1366, 657], [1366, 768], [1280, 720], [1280, 701], [1280, 600], [1024, 640], [900, 560]];
const g = await open(process.argv[2] || 'T', 'Shopper');
let bad = 0;
for (const [width, height] of SIZES) {
  await g.cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  if (!(await g.ev('!document.getElementById("buymenu").classList.contains("hidden")'))) { await g.key('KeyB'); await sleep(800); }
  const ids = JSON.parse(await g.ev('JSON.stringify([...document.querySelectorAll("#buymenu [data-buy]")].map(e => e.dataset.buy))'));
  const rect = id => g.ev(`(() => { const r = document.querySelector('#buymenu [data-buy="${id}"]').getBoundingClientRect(); return JSON.stringify([r.x, r.y, r.width, r.height]); })()`).then(JSON.parse);
  const fails = [];
  for (const id of ids) {
    // start from the panel's empty corner (no item pointed at), then move onto the item's middle
    await g.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    await sleep(60);
    const [x, y, w, h] = await rect(id);
    const cx = Math.round(x + w / 2), cy = Math.round(y + h / 2);
    if (cy < 0 || cy >= height) { fails.push(`${id}: off screen (y ${cy})`); continue; }
    await g.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });
    await sleep(150);
    const [x2, y2] = await rect(id);
    const under = await g.ev(`document.elementFromPoint(${cx}, ${cy})?.closest('[data-buy]')?.dataset.buy || 'nothing'`);
    if (Math.abs(x2 - x) > 1 || Math.abs(y2 - y) > 1 || under !== id) fails.push(`${id}: moved ${Math.round(x2 - x)},${Math.round(y2 - y)} px, under the mouse: ${under}`);
  }
  await g.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
  await sleep(100);
  const shot = await g.shot(`buyhover-${width}x${height}.png`);
  console.log(`${width}x${height}: ${ids.length} items, ${fails.length ? fails.length + ' FAIL — ' + fails.join('; ') : 'all stay put'}  (${shot})`);
  bad += fails.length;
}
console.log('page errors:', g.errors.length ? g.errors.join(' | ') : 'none');
process.exit(bad ? 1 : 0);
