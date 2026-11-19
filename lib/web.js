// The web side of the server: the game's files over HTTP(S) (compressed once, re-read when they change), the build
// fingerprint, the HTTPS certificate, the LAN addresses and the join page. The game's own routes (/api/...) are
// server.js's (see apiRoute there).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const MOUNTS = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three')],
  ['/', path.join(ROOT, 'public')],
];

// api(url, req, res): the game's own routes (server.js), true when it answered
export function serveStatic(req, res, api) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { url = '/'; }
  if (api(url, req, res)) return;
  if (url === '/admin' || url === '/admin/') url = '/admin.html';
  for (const [prefix, dir] of MOUNTS) {
    if (!url.startsWith(prefix)) continue;
    const file = path.join(dir, url.slice(prefix.length) || 'index.html');
    if (!file.startsWith(dir + path.sep)) break;
    staticFile(file, (err, f) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      // The browser asks "has it changed?" each time (no-cache) and gets a tiny "no" (304) when it hasn't.
      const head = { 'Content-Type': f.type, 'Cache-Control': 'no-cache', ETag: f.etag };
      if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, head); res.end(); return; }
      if (f.gz) {
        head.Vary = 'Accept-Encoding';
        if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { head['Content-Encoding'] = 'gzip'; res.writeHead(200, head); res.end(f.gz); return; }
      }
      res.writeHead(200, head);
      res.end(f.data);
    });
    return;
  }
  res.writeHead(404);
  res.end('Not found');
}

// Served files, read and compressed once and kept until they change on disk. The page carries the build it came
// from (see BUILD), so a page left open across an update notices and reloads.
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg']);
const fileCache = new Map();
function staticFile(file, done) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { done(err || new Error('not a file')); return; }
    const hit = fileCache.get(file);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) { done(null, hit); return; }
    fs.readFile(file, (err2, data) => {
      if (err2) { done(err2); return; }
      const ext = path.extname(file);
      if (file === INDEX_HTML) data = Buffer.from(data.toString('utf8').replace('content="dev"', `content="${BUILD}"`));
      const f = {
        mtime: st.mtimeMs, size: st.size, data, type: MIME[ext] || 'application/octet-stream',
        etag: `"${crypto.createHash('sha1').update(data).digest('base64url').slice(0, 16)}"`,
        gz: null,
      };
      const keep = () => { fileCache.set(file, f); done(null, f); };
      // compressed off the game's thread (a 1.5 MB map file took ~100 ms in one go, the ticks waiting)
      if (COMPRESS.has(ext) && data.length > 1024) zlib.gzip(data, { level: 9 }, (e, gz) => { f.gz = e ? null : gz; keep(); });
      else keep();
    });
  });
}

// The game's version: a fingerprint of every file the browser loads, taken when the server starts.
const INDEX_HTML = path.join(ROOT, 'public', 'index.html');
export const BUILD = (() => {
  const h = crypto.createHash('sha1');
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else { h.update(path.relative(ROOT, full)); h.update(fs.readFileSync(full)); }
    }
  };
  for (const dir of ['public', 'shared']) walk(path.join(ROOT, dir));
  return h.digest('hex').slice(0, 10);
})();

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

// Self-signed certificate so the game can run over HTTPS, which browsers require before they let a
// fullscreen page capture shortcuts like Ctrl+W (Keyboard Lock API).
export async function loadCertificate() {
  const dir = path.join(ROOT, 'certs');
  const keyFile = path.join(dir, 'key.pem'), certFile = path.join(dir, 'cert.pem');
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  try {
    const { default: selfsigned } = await import('selfsigned');
    const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...lanAddresses().map(ip => ({ type: 7, ip }))];
    const pems = selfsigned.generate([{ name: 'commonName', value: 'Counter-Office' }], {
      days: 3650, keySize: 2048, algorithm: 'sha256',
      extensions: [{ name: 'basicConstraints', cA: false }, { name: 'subjectAltName', altNames }],
    });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(keyFile, pems.private);
    fs.writeFileSync(certFile, pems.cert);
    return { key: pems.private, cert: pems.cert };
  } catch (e) {
    console.warn('  HTTPS disabled (could not create a certificate):', e.message);
    return null;
  }
}

// The players' join page (a page on claude.ai whose address is kept in data/join-page.txt): on start, copy the
// game's link and open that page, where the host pastes it once (Ctrl+V) and everyone's Join button follows.
export function openJoinPage(dataDir, link) {
  let page = '';
  try { page = fs.readFileSync(path.join(dataDir, 'join-page.txt'), 'utf8').trim(); } catch { /* not set up */ }
  if (!/^https:\/\/\S+$/.test(page) || process.platform !== 'win32') return;
  const clip = spawn('clip', { stdio: ['pipe', 'ignore', 'ignore'] });
  clip.on('error', () => {});
  clip.stdin.end(link);
  spawn('cmd', ['/c', `start "" "${page}"`], { stdio: 'ignore', detached: true, windowsVerbatimArguments: true }).on('error', () => {}).unref();
  console.log(`  Join page opened, link copied: press Ctrl+V there to update it for everyone\n    ${page}\n`);
}
