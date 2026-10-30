// Posts the game's link to a Bitrix24 chat when the server starts, so nobody has to ask for the IP.
// Set up in data/announce.json (an empty one is made on the first start): the inbound webhook's address and the
// chat to post in. BITRIX_WEBHOOK and BITRIX_CHAT override the file. See README, "Posting the link to Bitrix".
import fs from 'node:fs';
import path from 'node:path';

const TEMPLATE = {
  webhook: '',
  chat: '',
  message: '[B]Counter-Office is up[/B], map {map}\n{link}',
};

export async function announce(dataDir, env, { link, map }) {
  const file = path.join(dataDir, 'announce.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') { console.warn(`  Bitrix: could not read ${file}: ${e.message}`); return; }
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(TEMPLATE, null, 1));
  }
  const webhook = String(env.BITRIX_WEBHOOK || cfg.webhook || '').trim();
  // "chat123", or the chat's whole address pasted from the browser (…?IM_DIALOG=chat123)
  const chat = String(env.BITRIX_CHAT || cfg.chat || '').trim().replace(/^.*IM_DIALOG=([^&#]+).*$/, '$1');
  if (!webhook || !chat) {
    console.log(`  To post this link to a Bitrix chat on every start, fill in ${file}\n`);
    return;
  }
  // https://portal/rest/12/abc123/ (also accepted with a method on the end, as Bitrix shows an example)
  const base = webhook.replace(/\/+$/, '').replace(/\/[\w.]+\.json$/, '');
  const message = String(cfg.message || TEMPLATE.message).replaceAll('{link}', link).replaceAll('{map}', map);
  try {
    const res = await fetch(`${base}/im.message.add.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DIALOG_ID: chat, MESSAGE: message }),
      signal: AbortSignal.timeout(10000),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(out.error_description || out.error || `HTTP ${res.status}`);
    console.log(`  Posted the link to the Bitrix chat (${chat})\n`);
  } catch (e) {
    console.warn(`  Bitrix: could not post the link: ${e.cause?.message || e.message}\n`);
  }
}
