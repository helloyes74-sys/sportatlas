import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { decodePNG, terrariumHeights, TerrainSampler } from "../scripts/lib/terrain.mjs";

// Minimaler PNG-Encoder für den Test: wählt je Zeile einen anderen Filtertyp, damit alle fünf geprüft werden.
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "latin1"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function encodePNG(width, height, rgb) {
  const ch = 3, stride = width * ch, raw = [];
  for (let y = 0; y < height; y++) {
    const f = y % 5; raw.push(f);
    for (let i = 0; i < stride; i++) {
      const x = rgb[y * stride + i], a = i >= ch ? rgb[y * stride + i - ch] : 0, b = y > 0 ? rgb[(y - 1) * stride + i] : 0, c = y > 0 && i >= ch ? rgb[(y - 1) * stride + i - ch] : 0;
      let v;
      if (f === 0) v = x; else if (f === 1) v = x - a; else if (f === 2) v = x - b; else if (f === 3) v = x - ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      raw.push(v & 255);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(raw))), chunk("IEND", Buffer.alloc(0))]);
}
function terrariumRGB(width, height, elevAt) {
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const v = elevAt(x, y) + 32768; const r = Math.floor(v / 256), g = Math.floor(v % 256), b = Math.round((v - Math.floor(v)) * 256) % 256; const p = (y * width + x) * 3; rgb[p] = r; rgb[p + 1] = g; rgb[p + 2] = b; }
  return rgb;
}

test("PNG-Decoder stellt alle fünf Filtertypen wieder her", () => {
  const w = 7, h = 10; const rgb = new Uint8Array(w * h * 3).map((_, i) => (i * 37 + (i >> 3) * 11) & 255);
  const png = decodePNG(encodePNG(w, h, rgb));
  assert.equal(png.width, w); assert.equal(png.height, h); assert.equal(png.channels, 3);
  assert.deepEqual(Array.from(png.data), Array.from(rgb));
});

test("Terrarium-Höhen und bilineare Abtastung", async () => {
  // Kachel 4×4, Höhe steigt um 100 m je Pixel nach rechts
  const w = 4, rgb = terrariumRGB(w, w, (x) => 1000 + 100 * x);
  const t = terrariumHeights(decodePNG(encodePNG(w, w, rgb)));
  assert.equal(Math.round(t.h[0]), 1000); assert.equal(Math.round(t.h[3]), 1300);
  const s = new TerrainSampler({ zoom: 0 });
  s.tiles.set("0/0", Promise.resolve(t));
  // Zoom 0: eine Kachel für die Welt; lon 0 liegt bei Pixel 2 (Mitte) → Pixelmitte 1.5 → 1150 m
  const e = await s.elevation(0, 0);
  assert.ok(Math.abs(e - 1150) < 1, `war ${e}`);
  const w2 = await s.elevation(-90, 0); // Pixel 1 → 0.5 → 1050
  assert.ok(Math.abs(w2 - 1050) < 1, `war ${w2}`);
});
