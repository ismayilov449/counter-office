// The buy menu's "F3 Bet" footer item must not change the menu's size or layout: at buyhover's 11 window sizes,
// measures the panel, the footer and every item with the bet item there and with it taken out, and compares.
// GAME_PORT (4080) / CDP_PORT (9480); the server in classic mode (warmup is fine).
process.env.GAME_PORT ||= '4080'; process.env.CDP_PORT ||= '9480';
const { open, sleep } = await import('../mansion/game.mjs');
const SIZES = [[1920, 969], [1920, 1080], [1536, 730], [1536, 864], [1366, 657], [1366, 768], [1280, 720], [1280, 701], [1280, 600], [1024, 640], [900, 560]];
const g = await open('T', 'Footer');
const measure = () => g.ev(`JSON.stringify([...document.querySelectorAll('#buymenu .bm-panel, #buymenu .bm-foot, #buymenu .bm-cols, #buymenu .bm-info, #buymenu [data-buy]')]
  .map(e => { const r = e.getBoundingClientRect(); return [e.dataset.buy || e.className, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(' '); }))`).then(JSON.parse);
let bad = 0;
for (const [width, height] of SIZES) {
  await g.cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  if (!(await g.ev('!document.getElementById("buymenu").classList.contains("hidden")'))) { await g.key('KeyB'); await sleep(800); }
  const has = await g.ev('!!document.querySelector("#buymenu [data-act=bet]")');
  const withBet = await measure();
  await g.ev('document.querySelector("#buymenu [data-act=bet]").style.display = "none", 1');
  await sleep(100);
  const without = await measure();
  await g.ev('document.querySelector("#buymenu [data-act=bet]").style.display = "", 1');
  const diff = withBet.filter((v, i) => v !== without[i]);
  const foot = withBet.find(v => v.startsWith('bm-foot'));
  console.log(`${width}x${height}: bet item ${has ? 'shown' : 'MISSING'}, ${withBet.length} boxes, ${diff.length ? 'CHANGED: ' + diff.slice(0, 4).join('; ') : 'identical'} (footer ${foot.split(' ').slice(3).join('x')})`);
  if (!has || diff.length) bad++;
}
console.log('page errors:', g.errors.length ? g.errors.join(' | ') : 'none');
process.exit(bad ? 1 : 0);
