// A screenshot's mean brightness (0..255), from the PNG itself (node's zlib; 8-bit RGB/RGBA, no interlace — what
// Chrome's captureScreenshot writes). rect: [x0, y0, x1, y1] as fractions of the picture (default: all of it).
import fs from 'node:fs';
import zlib from 'node:zlib';

export function meanLum(file, rect = [0, 0, 1, 1]) {
  const b = fs.readFileSync(file);
  let w = 0, h = 0, ct = 0, idat = [];
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error('png: only 8-bit, not interlaced'); }
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error('png: colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, u = up ? up[i] : 0, c = up && i >= bpp ? up[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      row[i] = v & 255;
    }
  }
  const [x0, y0, x1, y1] = [rect[0] * w, rect[1] * h, rect[2] * w, rect[3] * h].map(Math.round);
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * stride + x * bpp; s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; n++; }
  return n ? s / n : 0;
}
