// Gefälle-/Steigungsprofil als Balken je Abschnitt: über der Nulllinie bergauf, darunter bergab.
// Für Pisten zählt der Betrag des Gefälles (grün < 15 %, blau < 25 %, rot < 40 %, schwarz darüber),
// für Rad und Wandern die Steigung in Laufrichtung (Gefälle blau, dann grün → dunkelrot).

import { pisteGradeClass, gradeClass } from "./geo.js";

const PISTE = { green: "#39d98a", blue: "#3d8bff", red: "#ff4b4b", black: "#0a0a0a" };
const GRADE = { down: "#3d8bff", flat: "#39d98a", gentle: "#9ccf3a", moderate: "#ffb347", steep: "#ff6a3d", verysteep: "#c8312c" };

export function colorFor(kind, g) {
  if (kind === "piste") return PISTE[pisteGradeClass(Math.abs(g))];
  return GRADE[gradeClass(g)];
}

export function legendFor(kind) {
  if (kind === "piste") return [["bis 15 %", PISTE.green], ["15–25 %", PISTE.blue], ["25–40 %", PISTE.red], ["über 40 %", PISTE.black]];
  return [["Gefälle", GRADE.down], ["0–3 %", GRADE.flat], ["3–6 %", GRADE.gentle], ["6–10 %", GRADE.moderate], ["10–15 %", GRADE.steep], ["über 15 %", GRADE.verysteep]];
}

/**
 * Zeichnet das Profil in ein Canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{d:number,g:number,e:number}[]} segments  Abschnitte (d Meter horizontal, g Prozent)
 * @param {string} kind  piste | bike | hike | xc
 */
export function drawProfile(canvas, segments, kind = "piste") {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || 320, H = canvas.clientHeight || 150;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const c = canvas.getContext("2d");
  c.scale(dpr, dpr);
  c.clearRect(0, 0, W, H);
  const padL = 40, padR = 8, top = 10, bot = 22;
  const mono = '500 10px "JetBrains Mono", ui-monospace, monospace';
  c.font = mono;
  if (!segments?.length) {
    c.fillStyle = "#8c99a3";
    c.fillText("Kein Profil: Höhen fehlen. Skript add-elevation.mjs ausführen.", padL, H / 2);
    return;
  }
  const gs = segments.map((s) => s.g);
  let hi = Math.max(5, ...gs), lo = Math.min(-5, ...gs);
  if (kind === "piste") { hi = Math.max(5, hi); lo = Math.min(lo, -20); }
  hi = Math.ceil(hi / 10) * 10; lo = Math.floor(lo / 10) * 10;
  const Y = (g) => top + (hi - g) / (hi - lo) * (H - top - bot);
  const y0 = Y(0);
  // Raster
  c.strokeStyle = "#243038"; c.lineWidth = 1; c.fillStyle = "#8c99a3";
  for (let g = lo; g <= hi; g += 10) {
    const y = Y(g);
    c.beginPath(); c.moveTo(padL, y); c.lineTo(W - padR, y); c.stroke();
    c.fillText((g > 0 ? "+" : "") + g + " %", 2, y + 3);
  }
  c.strokeStyle = "#ff2a2a"; c.beginPath(); c.moveTo(padL, y0); c.lineTo(W - padR, y0); c.stroke();
  // Balken
  const total = segments.reduce((s, x) => s + x.d, 0);
  const w = W - padL - padR;
  let x = padL;
  for (const s of segments) {
    const bw = Math.max(1, s.d / total * w);
    const y = Y(Math.max(lo, Math.min(hi, s.g)));
    const ry = Math.min(y, y0), rh = Math.max(1, Math.abs(y - y0));
    c.fillStyle = colorFor(kind, s.g);
    c.fillRect(x + .5, ry, Math.max(1, bw - 1), rh);
    if (c.fillStyle === "#0a0a0a") { c.strokeStyle = "#f2f5f7"; c.lineWidth = 1; c.strokeRect(x + 1, ry + .5, Math.max(1, bw - 2), rh - 1); }
    x += bw;
  }
  // Achse unten: Distanz
  c.fillStyle = "#8c99a3";
  c.fillText("0", padL, H - 6);
  c.textAlign = "right";
  c.fillText((total / 1000).toLocaleString("de-AT", { maximumFractionDigits: 1 }) + " km", W - padR, H - 6);
  c.textAlign = "left";
}
