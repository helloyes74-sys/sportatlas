// Höhen aus Terrarium-Geländekacheln (AWS Terrain Tiles, frei, ohne Schlüssel, ohne Rate-Limit).
// Dieselben Kacheln zeichnen in der App das 3D-Gelände, darum passen Profile und Relief zusammen.
// Enthält einen kleinen PNG-Decoder (nur Node-Bordmittel: zlib), weil Node keinen eingebaut hat.

import { inflateSync } from "node:zlib";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** PNG (8 Bit, RGB oder RGBA, ohne Interlace) → { width, height, channels, data: Uint8Array } */
export function decodePNG(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("Kein PNG");
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`PNG-Variante nicht unterstützt (Bittiefe ${bitDepth}, Interlace ${interlace})`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`PNG-Farbtyp ${colorType} nicht unterstützt (Palette)`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels, out = new Uint8Array(stride * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]; const row = y * stride, prev = row - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[p++];
      const a = i >= channels ? out[row + i - channels] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = y > 0 && i >= channels ? out[prev + i - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new Error(`PNG-Filter ${filter} unbekannt`);
      }
      out[row + i] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}

/** Terrarium-Kachel → Float32Array mit Höhen in Metern. */
export function terrariumHeights(png) {
  const { width, height, channels, data } = png;
  const h = new Float32Array(width * height);
  for (let i = 0, p = 0; i < h.length; i++, p += channels) h[i] = data[p] * 256 + data[p + 1] + data[p + 2] / 256 - 32768;
  return { width, height, h };
}

export class TerrainSampler {
  constructor({ zoom = 13, cacheDir, log = () => {} } = {}) { this.z = zoom; this.cacheDir = cacheDir; this.log = log; this.tiles = new Map(); this.downloads = 0; }

  async tile(x, y) {
    const key = `${x}/${y}`;
    if (this.tiles.has(key)) return this.tiles.get(key);
    const p = (async () => {
      const file = this.cacheDir ? path.join(this.cacheDir, `${this.z}-${x}-${y}.png`) : null;
      let buf = null;
      if (file) { try { buf = await readFile(file); } catch { /* nicht im Cache */ } }
      if (!buf) {
        for (let t = 0; t < 4; t++) {
          const res = await fetch(TILE_URL(this.z, x, y), { headers: { "User-Agent": "sportatlas/0.1" } });
          if (res.ok) { buf = Buffer.from(await res.arrayBuffer()); break; }
          if (res.status === 404) throw new Error(`Kachel ${this.z}/${x}/${y} fehlt`);
          this.log(`  Kachel ${this.z}/${x}/${y}: HTTP ${res.status}, neuer Versuch …`); await sleep(2000 * (t + 1));
        }
        if (!buf) throw new Error(`Kachel ${this.z}/${x}/${y} nicht ladbar`);
        this.downloads++;
        if (file) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, buf); }
      }
      return terrariumHeights(decodePNG(buf));
    })();
    this.tiles.set(key, p);
    p.catch(() => this.tiles.delete(key));
    return p;
  }

  /** Höhe an [lon, lat] in Metern, bilinear zwischen den vier Nachbarpixeln. */
  async elevation(lon, lat) {
    const n = 2 ** this.z;
    const fx = ((lon + 180) / 360) * n;
    const latR = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const tile = await this.tile(tx, ty);
    // Pixelkoordinate innerhalb der Kachel, Pixelmitte bei +0.5
    let px = (fx - tx) * tile.width - 0.5, py = (fy - ty) * tile.height - 0.5;
    px = Math.min(tile.width - 1.001, Math.max(0, px)); py = Math.min(tile.height - 1.001, Math.max(0, py));
    const x0 = Math.floor(px), y0 = Math.floor(py), dx = px - x0, dy = py - y0;
    const at = (x, y) => tile.h[y * tile.width + x];
    const top = at(x0, y0) * (1 - dx) + at(x0 + 1, y0) * dx;
    const bot = at(x0, y0 + 1) * (1 - dx) + at(x0 + 1, y0 + 1) * dx;
    return top * (1 - dy) + bot * dy;
  }

  async elevations(coords) {
    const out = [];
    for (const c of coords) out.push([c[0], c[1], Math.round((await this.elevation(c[0], c[1])) * 10) / 10]);
    return out;
  }
}
