// node waitsrv.mjs [log] — waits (up to 20 s) until the test server's log says it's up ("Mode:"); exits 1 if it never does.
import fs from 'node:fs';
const log = process.argv[2] || `${process.env.SP || process.env.TEMP + '/co-power'}/srv.log`;
for (let i = 0; i < 80; i++) {
  try { if (/Mode:/.test(fs.readFileSync(log, 'utf8'))) process.exit(0); } catch { /* not yet */ }
  await new Promise(r => setTimeout(r, 250));
}
console.log('the server did not start: ' + log);
process.exit(1);
