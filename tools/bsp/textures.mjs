// Usage: node tools/bsp/textures.mjs <map.bsp> <out dir>
// Writes the textures embedded in a GoldSrc BSP as PNG files (mip level 0, palette colors).
// Textures starting with "{" are see-through: palette index 255 becomes transparent.
// Prints the list of written names; the file name of a texture is texFile(name).
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export const texFile = name => name.toLowerCase().replace(/[^a-z0-9_-]/g, c => '_' + c.charCodeAt(0).toString(16)) + '.png';

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const buf = fs.readFileSync(process.argv[2]);
  const out = process.argv[3];
  fs.mkdirSync(out, { recursive: true });
  const lump = buf.readInt32LE(4 + 2 * 8);
  const n = buf.readInt32LE(lump);
  const names = [];
  for (let i = 0; i < n; i++) {
    const o = buf.readInt32LE(lump + 4 + i * 4);
    if (o < 0) continue;
    const base = lump + o;
    const name = buf.toString('latin1', base, base + 16).replace(/\0.*$/s, '');
    const w = buf.readUInt32LE(base + 16), h = buf.readUInt32LE(base + 20);
    const offs = [0, 1, 2, 3].map(k => buf.readUInt32LE(base + 24 + k * 4));
    if (!offs[0] || /^(sky|clip|origin|aaatrigger)$/i.test(name)) continue;
    const pal = base + offs[3] + (w / 8) * (h / 8) + 2;
    const rgba = Buffer.alloc(w * h * 4);
    const clear = name[0] === '{';
    for (let p = 0; p < w * h; p++) {
      const c = buf[base + offs[0] + p];
      rgba[p * 4] = buf[pal + c * 3]; rgba[p * 4 + 1] = buf[pal + c * 3 + 1]; rgba[p * 4 + 2] = buf[pal + c * 3 + 2];
      rgba[p * 4 + 3] = clear && c === 255 ? 0 : 255;
    }
    // See-through pixels take the color of an opaque neighbour, so the key blue never bleeds into the edges.
    if (clear) {
      for (let p = 0; p < w * h; p++) {
        if (rgba[p * 4 + 3]) continue;
        const x = p % w, y = (p / w) | 0;
        let q = -1;
        for (let r = 1; r <= 3 && q < 0; r++) {
          for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
            const k = ((y + dy + h) % h) * w + ((x + dx + w) % w);
            if (rgba[k * 4 + 3]) { q = k; break; }
          }
        }
        for (let k = 0; k < 3; k++) rgba[p * 4 + k] = q < 0 ? 0 : rgba[q * 4 + k];
      }
    }
    fs.writeFileSync(path.join(out, texFile(name)), png(w, h, rgba));
    names.push(name);
  }
  console.log('textures', names.length);
}
