#!/usr/bin/env node
/**
 * Generate UniPet icon assets (tray-icon.png, icon.png, icon.ico) into ../public.
 *
 * This is a zero-dependency PNG encoder so the repo doesn't pull in `sharp`
 * just for two tiny icons. ICO is a 32×32 PNG wrapped in the ICO container —
 * Windows accepts PNG-payload ICO files since Vista.
 *
 * Re-run via `node scripts/generate-icons.mjs` whenever the design changes.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
if (!existsSync(PUBLIC_DIR)) mkdirSync(PUBLIC_DIR, { recursive: true });

// ─── Mini pixel-cat sprite (cream cat with pink ears + green collar) ──
//   '.' transparent, letters → palette
const PAL = {
  K: [42, 42, 58, 255],   // outline
  F: [240, 220, 192, 255], // fur
  S: [196, 168, 120, 255], // shadow
  P: [224, 112, 80, 255],  // pink
  W: [250, 249, 255, 255], // white
  G: [74, 138, 94, 255],   // collar green
  D: [30, 30, 46, 255],    // dark
};

// 32×32 sprite — designed to read clearly at 16×16 too
const SPRITE_32 = [
  '................................',
  '................................',
  '................................',
  '................................',
  '..........KK..........KK........',
  '.........KFFK........KFFK.......',
  '........KFFFFK......KFFFFK......',
  '.......KFFPPFFK....KFFPPFFK.....',
  '......KFFFFFFFFKKKKFFFFFFFFK....',
  '.....KFFFFFFFFFFFFFFFFFFFFFFK...',
  '....KFFFFFFFFFFFFFFFFFFFFFFFFK..',
  '...KFFFFFFFFFFFFFFFFFFFFFFFFFFK.',
  '...KFFWWFFFFFFFFFFFFFFFFFFWWFFK.',
  '...KFFWDFFFFFFFFFFFFFFFFFFDWFFK.',
  '...KFFFFFFFFFPPDDPPFFFFFFFFFFFK.',
  '...KFFFFFFFFFFFPPFFFFFFFFFFFFFK.',
  '....KFFFFFFFFFFFFFFFFFFFFFFFFK..',
  '....KFFPPFFFFFFFFFFFFFFFFPPFFK..',
  '....KFFFFFFFFFFFFFFFFFFFFFFFFK..',
  '.....KFFFFFFFFFFFFFFFFFFFFFFK...',
  '......KFFFFFFFFFFFFFFFFFFFFK....',
  '.......KGGGGGGGGGGGGGGGGGGK.....',
  '........KGGGGGGGGGGGGGGGGK......',
  '.........KFFFFFFFFFFFFFFK.......',
  '..........KFFFFFFFFFFFFK........',
  '...........KKFFFFFFFFKK.........',
  '............KKKKKKKKKK..........',
  '.............KK....KK...........',
  '.............KK....KK...........',
  '.............KK....KK...........',
  '............KKK....KKK..........',
  '................................',
];

function spriteToPixels(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const col = ch === '.' ? [0, 0, 0, 0] : (PAL[ch] || [0, 0, 0, 0]);
      const i = (y * w + x) * 4;
      out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = col[3];
    }
  }
  return { w, h, pixels: out };
}

// ─── Minimal PNG encoder ───────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(w, h, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Filter byte 0 per scanline
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    pixels.subarray(y * w * 4, (y + 1) * w * 4).forEach((b, i) => {
      raw[y * (1 + w * 4) + 1 + i] = b;
    });
  }

  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ─── Scaler (nearest-neighbour) ────────────────────────
function scale(src, dstW, dstH) {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.floor((y * src.h) / dstH);
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor((x * src.w) / dstW);
      const si = (sy * src.w + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = src.pixels[si];
      out[di + 1] = src.pixels[si + 1];
      out[di + 2] = src.pixels[si + 2];
      out[di + 3] = src.pixels[si + 3];
    }
  }
  return { w: dstW, h: dstH, pixels: out };
}

// ─── ICO writer (single PNG payload, 256×256) ───────────
function writeIco(pngBuf) {
  // ICONDIR header
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);      // reserved
  dir.writeUInt16LE(1, 2);      // type = icon
  dir.writeUInt16LE(1, 4);      // count

  // ICONDIRENTRY — width/height 0 means 256 in ICO format
  const entry = Buffer.alloc(16);
  entry[0] = 0; entry[1] = 0;   // 0 = 256 for both width and height
  entry[2] = 0;                  // colors
  entry[3] = 0;                  // reserved
  entry.writeUInt16LE(1, 4);    // planes
  entry.writeUInt16LE(32, 6);   // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8); // bytes in resource
  entry.writeUInt32LE(22, 12);  // offset to image data

  return Buffer.concat([dir, entry, pngBuf]);
}

// ─── Emit ──────────────────────────────────────────────
const base = spriteToPixels(SPRITE_32);

const tray16 = scale(base, 16, 16);
const tray32 = scale(base, 32, 32);
const icon256 = scale(base, 256, 256);

const trayPng = encodePNG(tray32.w, tray32.h, tray32.pixels);
writeFileSync(join(PUBLIC_DIR, 'tray-icon.png'), trayPng);
console.log('  ✓ tray-icon.png (32×32)');

writeFileSync(join(PUBLIC_DIR, 'tray-icon@16.png'), encodePNG(tray16.w, tray16.h, tray16.pixels));
console.log('  ✓ tray-icon@16.png (16×16)');

const appPng = encodePNG(icon256.w, icon256.h, icon256.pixels);
writeFileSync(join(PUBLIC_DIR, 'icon.png'), appPng);
console.log('  ✓ icon.png (256×256)');

// icon.icns is generated only on macOS toolchains; for cross-platform we ship a PNG
// fallback and let electron-builder pick it up. We still emit icon.icns as a copy
// of the PNG so the file path exists (electron-builder validates existence).
writeFileSync(join(PUBLIC_DIR, 'icon.icns'), appPng);
console.log('  ✓ icon.icns (PNG fallback — replace with real ICNS for mac release)');

// 256×256 ICO with PNG payload — required by electron-builder
const icoPng256 = encodePNG(icon256.w, icon256.h, icon256.pixels);
writeFileSync(join(PUBLIC_DIR, 'icon.ico'), writeIco(icoPng256));
console.log('  ✓ icon.ico (256×256 PNG-payload ICO)');

console.log('\nAll icons written to', PUBLIC_DIR);
