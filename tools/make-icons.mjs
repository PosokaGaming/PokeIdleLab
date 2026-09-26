// Genera los íconos de la extensión (una pokébola) sin dependencias:
//   node tools/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const OUT = new URL('../extension/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // sin filtro
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const RED = [227, 53, 13], WHITE = [245, 245, 245], INK = [20, 22, 28], AMBER = [245, 180, 40];

// Color de un punto en coordenadas normalizadas (-1..1), o null si queda afuera.
function pokeball(u, v) {
  const d = Math.hypot(u, v);
  if (d > 1) return null;
  if (d > 0.88) return INK; // borde
  if (d < 0.2) return d < 0.13 ? AMBER : INK; // botón
  if (Math.abs(v) < 0.09) return INK; // franja
  return v < 0 ? RED : WHITE;
}

for (const size of [16, 32, 48, 128]) {
  const S = 4; // sobremuestreo para suavizar bordes
  const file = png(size, (x, y) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) {
      for (let sx = 0; sx < S; sx++) {
        const u = ((x + (sx + 0.5) / S) / size) * 2 - 1;
        const v = ((y + (sy + 0.5) / S) / size) * 2 - 1;
        const c = pokeball(u * 1.04, v * 1.04);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
    }
    return a ? [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / (S * S)) * 255)] : [0, 0, 0, 0];
  });
  writeFileSync(new URL(`icon${size}.png`, OUT), file);
}
console.log('íconos listos en extension/icons');
