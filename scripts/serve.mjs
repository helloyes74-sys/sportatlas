#!/usr/bin/env node
// Winziger statischer Server ohne Abhängigkeiten: node scripts/serve.mjs [port]
// Standard: nur dieser Rechner (127.0.0.1) – andere Geräte im WLAN kommen nicht dran.
// Freigabe fürs Handy im selben WLAN nur bewusst mit SPORTATLAS_LAN=1.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "app");
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const LAN = process.env.SPORTATLAS_LAN === "1";
const HOST = LAN ? "0.0.0.0" : "127.0.0.1";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".geojson": "application/geo+json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2" };

/** IPv4-Adressen dieses Rechners im lokalen Netz (fürs Handy im selben WLAN). */
const lanAddresses = () => Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/__info") { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); return res.end(JSON.stringify({ port: PORT, lan: LAN ? lanAddresses().map((a) => `http://${a}:${PORT}`) : [] })); }
    if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("404 " + p); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, HOST, () => {
  console.log(`Sportatlas läuft: http://localhost:${PORT}  (Strg+C beendet)`);
  if (LAN) for (const a of lanAddresses()) console.log(`Am Handy im selben WLAN: http://${a}:${PORT}`);
  else console.log("Nur auf diesem Mac erreichbar (andere Geräte im WLAN sind ausgesperrt).");
});
