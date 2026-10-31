// Oberfläche: Sport-Tabs, Gebietsliste, Detailblatt. Reine Render-Funktionen (HTML-Strings),
// die Ereignisse hängt main.js an.

import { seasonState, fmtKm, fmtNum, fmtEur, fmtDate, fmtTime } from "./data.js";
import { COLORS } from "./map.js";
import { legendFor } from "./profile.js";
import { describe, weekday } from "./weather.js";
import { favorites, notes, starsHtml } from "./favorites.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const SPORTS = { ski: "Ski", xc: "Langlauf", bike: "Rad", hike: "Wandern" };
export const sportLabel = (t) => SPORTS[t] || t;
const DIFF = { novice: "sehr leicht", easy: "leicht", intermediate: "mittel", advanced: "schwer", expert: "sehr schwer", freeride: "Skiroute / Freeride", unknown: "ohne Angabe" };
const HIKE = { easy: "leicht (T1)", medium: "mittel (T2)", hard: "schwer (T3+)", unknown: "ohne Angabe" };
const LIFT = { gondola: "Kabinenbahn", cable_car: "Pendelbahn", mixed_lift: "Kombibahn", chair_lift: "Sesselbahn", drag_lift: "Schlepplift", platter: "Tellerlift", "t-bar": "Bügellift", "j-bar": "Bügellift", rope_tow: "Seillift", magic_carpet: "Förderband", funicular: "Standseilbahn" };
const STARS = ["", "leicht", "mittel", "anspruchsvoll", "schwer", "sehr schwer"];

export function renderSports(active) {
  return Object.entries(SPORTS).map(([k, l]) => `<button role="tab" data-sport="${k}" aria-pressed="${k === active}" style="--c:${COLORS.sport[k]}"><span class="dot"></span>${l}</button>`).join("");
}

function keyFacts(a) {
  if (a.type === "ski") return `<b>${fmtNum(a.pistes_km?.total, a.pistes_km?.total % 1 ? 1 : 0)} km</b>${fmtEur(a.prices?.day_adult)}`;
  if (a.type === "xc") return `<b>${a.loipen_km?.total ? fmtNum(a.loipen_km.total) + " km" : "–"}</b>${esc(a.technique || "")}`;
  const km = fmtNum(a.length_km, a.length_km % 1 ? 1 : 0) + " km";
  if (a.type === "bike") return `<b>${km}</b>${a.ascent_m ? `↑ ${fmtNum(a.ascent_m)} m` : a.descent_m ? `↓ ${fmtNum(a.descent_m)} m` : STARS[a.difficulty] || ""}`;
  return `<b>${km}</b>${a.duration_min ? fmtTime(a.duration_min) : a.ascent_m ? `↑ ${fmtNum(a.ascent_m)} m` : STARS[a.difficulty] || ""}`;
}

export function renderList(areas, selectedId, { onlyFavs = false, distances = null } = {}) {
  const favs = favorites.list(), all = notes.all();
  const list = onlyFavs ? areas.filter((a) => favs.includes(a.id) || all[a.id]?.stars) : areas;
  if (!list.length) return onlyFavs ? `<p class="empty">Noch nichts gemerkt. Im Detailblatt eines Gebiets auf ☆ tippen oder Sterne vergeben.</p>` : `<p class="empty">Nichts gefunden.</p>`;
  return list.map((a) => {
    const s = a.type === "ski" ? seasonState(a) : null;
    const n = all[a.id];
    return `<button class="item" role="listitem" data-area="${a.id}" aria-pressed="${a.id === selectedId}">
      <span class="nm">${favs.includes(a.id) ? '<span class="favmark" aria-label="gemerkt">★</span>' : ""}${esc(a.name)}</span><span class="kv">${keyFacts(a)}</span>
      <span class="rg">${(a.type === "bike" || a.type === "hike") && a.kind ? esc(a.kind) + " · " : ""}${esc(a.region || "")}${distances?.[a.id] != null ? `<span class="dist">${Math.round(distances[a.id])} km</span>` : ""}${n?.stars ? ` <span class="stars mini" aria-label="${n.stars} von 5 Sternen">${starsHtml(n.stars)}</span>` : ""}</span>
      ${s ? `<span class="st ${s.cls}">${s.text}</span>` : ""}
    </button>`;
  }).join("");
}

export function renderLegend(sport, hikeMode) {
  const sw = (label, c, cls = "") => `<span><i class="${cls}" style="--c:${c}"></i>${label}</span>`;
  if (sport === "ski") return sw("sehr leicht", COLORS.piste.novice) + sw("leicht", COLORS.piste.easy) + sw("mittel", COLORS.piste.intermediate) + sw("schwer", COLORS.piste.advanced, "black") + sw("Skiroute", COLORS.piste.freeride, "dash") + sw("Lift", COLORS.lift, "dash");
  if (sport === "xc") return sw("klassisch", COLORS.xc.classic, "dash") + sw("Skating", COLORS.xc.skating, "dash");
  if (sport === "bike") return sw("flach", COLORS.bikeGrade.flat) + sw("bis 6 %", COLORS.bikeGrade.gentle) + sw("bis 10 %", COLORS.bikeGrade.moderate) + sw("bis 15 %", COLORS.bikeGrade.steep) + sw("über 15 %", COLORS.bikeGrade.verysteep) + `<span>Farbe = steilster Anstieg</span>`;
  if (hikeMode === "duration") return sw("unter 2 h", COLORS.hikeDuration.short) + sw("2–4 h", COLORS.hikeDuration.half) + sw("4–7 h", COLORS.hikeDuration.day) + sw("über 7 h", COLORS.hikeDuration.long, "black");
  return sw("leicht T1", COLORS.hikeDifficulty.easy) + sw("mittel T2", COLORS.hikeDifficulty.medium) + sw("schwer T3+", COLORS.hikeDifficulty.hard, "black");
}

function statsFor(a) {
  const cell = (k, v) => (v == null || v === "" ? "" : `<div><small>${k}</small><b>${v}</b></div>`);
  if (a.type === "ski") {
    const s = seasonState(a);
    return `<div class="stats">${cell("Pisten", fmtNum(a.pistes_km?.total, a.pistes_km?.total % 1 ? 1 : 0) + " km")}${cell("Tageskarte", fmtEur(a.prices?.day_adult) + (a.prices?.dynamic ? " ab" : ""))}${cell("Lifte", a.lifts)}${cell("Höhe", a.elevation ? `${a.elevation.base_m}–${a.elevation.top_m} m` : null)}${cell("Saison", a.season ? `${fmtDate(a.season.from)}–${fmtDate(a.season.to)}` : null)}${cell("Betrieb", a.season?.hours)}${cell("Beschneiung", a.snowmaking_pct != null ? a.snowmaking_pct + " %" : null)}</div>
    ${s ? `<p class="sub ${s.cls}" style="font-weight:600">${s.text}</p>` : ""}${kmBar(a.pistes_km)}`;
  }
  if (a.type === "xc") return `<div class="stats">${cell("Loipen", a.loipen_km?.total ? fmtNum(a.loipen_km.total) + " km" : null)}${cell("Technik", esc(a.technique))}${cell("Tageskarte", a.prices ? fmtEur(a.prices.day_adult) : null)}</div>`;
  // Routen (Rad, Wandern): Kennzahlen aus der Tourenbeschreibung der Quelle, dazu Start und Ziel
  const km = fmtNum(a.length_km, a.length_km % 1 ? 1 : 0) + " km";
  const m = (v) => (v == null || v === 0 ? null : fmtNum(v) + " m");
  const startEnd = a.start ? `<p class="sub route-ends"><b>Start</b> ${esc(a.start)}${a.end ? `<br><b>Ziel</b> ${esc(a.end)}` : a.round_trip ? "<br><b>Ziel</b> Rundtour, zurück zum Ausgangspunkt" : ""}</p>` : "";
  if (a.type === "bike") {
    return `<div class="stats">${cell("Länge", km)}${cell("Aufstieg", m(a.ascent_m))}${cell("Abfahrt", m(a.descent_m))}${cell("Höchster Punkt", m(a.top_m))}${cell("Ø Steigung", a.avg_grade != null ? fmtNum(a.avg_grade, 1) + " %" : null)}${cell("Max. Steigung", a.max_grade != null ? fmtNum(a.max_grade, a.max_grade % 1 ? 1 : 0) + " %" : null)}${cell("Fahrzeit", a.duration_min ? fmtTime(a.duration_min) : null)}${cell("Niveau", STARS[a.difficulty])}${cell("Typ", esc(a.kind))}${cell("Belag", esc(a.surface))}</div>${startEnd}`;
  }
  return `<div class="stats">${cell("Länge", km)}${cell("Gehzeit", a.duration_min ? fmtTime(a.duration_min) : null)}${cell("Aufstieg", m(a.ascent_m))}${cell("Abstieg", m(a.descent_m))}${cell("Höchster Punkt", m(a.top_m))}${cell("Niveau", STARS[a.difficulty])}${cell("Typ", esc(a.kind))}${cell("Etappen", a.stages > 1 ? a.stages : null)}</div>${startEnd}`;
}

function kmBar(km) {
  if (!km || km.easy == null) return "";
  const parts = [["easy", COLORS.piste.easy, "leicht"], ["intermediate", COLORS.piste.intermediate, "mittel"], ["difficult", COLORS.piste.advanced, "schwer"]].filter(([k]) => km[k] != null);
  const sum = parts.reduce((s, [k]) => s + km[k], 0);
  return `<div class="kmbar" role="img" aria-label="${parts.map(([k, , l]) => `${fmtNum(km[k], 2)} km ${l}`).join(", ")}">${parts.map(([k, c]) => `<i style="width:${(km[k] / sum * 100).toFixed(1)}%;background:${c};${k === "difficult" ? "box-shadow:inset 0 0 0 1px #f2f5f7" : ""}"></i>`).join("")}</div>
  <div class="kmlegend">${parts.map(([k, , l]) => `<span>${fmtNum(km[k], km[k] % 1 ? 2 : 0)} km ${l}</span>`).join("")}${km.routes ? `<span>${fmtNum(km.routes)} km Skirouten</span>` : ""}</div>`;
}

/** Detailblatt eines Gebiets. `geo` ist die GeoJSON-Sammlung oder null. */
export function renderDetail(a, geo, { selectedFeature, hikeMode, sectors = [], activeSector } = {}) {
  const feats = geo?.features || [];
  const fav = favorites.has(a.id), note = notes.get(a.id);
  const kindLabel = a.type === "ski" ? "Skigebiet" : a.type === "xc" ? "Langlauf" : a.type === "bike" ? (a.kind || "Radroute") : (a.kind || "Wanderweg");
  const prof = selectedFeature ? profileBlock(selectedFeature, a.type) : (feats.length ? `<section><h3><span>Profil</span></h3><p class="sub">Linie in der Liste oder auf der Karte antippen, dann erscheint hier ihr Gefälle-Profil.</p></section>` : "");
  return `
    <span class="tag">${esc(kindLabel)} · ${esc(a.region || "")}</span>
    <div class="headrow"><h2>${esc(a.name)}</h2><button class="favbtn" id="favBtn" aria-pressed="${fav}" title="${fav ? "Aus der Merkliste nehmen" : "Merken"}">${fav ? "★" : "☆"}</button></div>
    ${statsFor(a)}
    ${sectors.length ? `<section><h3><span>Sektoren</span><span>Kamerafahrt</span></h3><div class="chips" id="sectorChips">${sectors.map((s) => `<button data-sector="${s.id}" aria-pressed="${s.id === activeSector}" title="${s.count} Linien${s.top_m ? ` · bis ${s.top_m} m` : ""}">${esc(s.name)}</button>`).join("")}<button data-sector="tour" id="btnTour" aria-pressed="false" title="Langsame Drehung um den Ausschnitt; jede Berührung stoppt">⟳ Rundflug</button></div></section>` : ""}
    ${a.highlights?.length ? `<section><h3><span>Besonderheiten</span></h3><ul class="hl">${a.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></section>` : ""}
    <section id="wx"><h3><span>Wetter${a.type === "ski" && a.elevation?.top_m ? ` am Berg (${a.elevation.top_m} m)` : ""}</span><span id="wxstate">lädt …</span></h3><div class="wx" id="wxgrid"></div><p class="wx-note">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener" style="color:inherit">Open-Meteo.com</a></p></section>
    ${prof}
    ${featureList(a, feats, selectedFeature, hikeMode)}
    <section><h3><span>Meine Bewertung</span><span>${note.updated ? "vom " + fmtDate(note.updated) : "nur auf diesem Gerät"}</span></h3>
      <div class="rate" id="rate">${starsHtml(note.stars, true)}</div>
      <textarea id="noteTxt" rows="2" placeholder="Notiz, z. B. Parkplatz früh voll, Pisten top präpariert">${esc(note.text)}</textarea>
    </section>
    <section><h3><span>Links</span></h3><div class="links">
      ${a.links?.website ? `<a class="btn acc" href="${esc(a.links.website)}" target="_blank" rel="noopener">Website ↗</a>` : ""}
      ${a.links?.lift_status ? `<a class="btn" href="${esc(a.links.lift_status)}" target="_blank" rel="noopener">Offene Lifte beim Betreiber ↗</a>` : ""}
      ${a.links?.map_pdf ? `<a class="btn" href="${esc(a.links.map_pdf)}" target="_blank" rel="noopener">Pistenplan PDF ↗</a>` : ""}
      ${a.links?.info ? `<a class="btn" href="${esc(a.links.info)}" target="_blank" rel="noopener">Info ↗</a>` : ""}
      ${feats.length ? `<button class="btn" id="btnGpx" title="Alle Linien dieses Gebiets als GPX (Garmin, Komoot, Apple Karten)">GPX herunterladen</button>` : ""}
      <button class="btn" id="btnShare" title="Link zu diesem Gebiet kopieren oder teilen">Link teilen</button>
      <a class="btn" href="https://www.windy.com/${a.center[1].toFixed(3)}/${a.center[0].toFixed(3)}?${a.center[1].toFixed(3)},${a.center[0].toFixed(3)},11" target="_blank" rel="noopener">Windy ↗</a>
    </div></section>
    <p class="src">Stammdaten Stand ${esc(a.updated || "")}: ${(a.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(" · ")}.${geo ? ` Linien: © OpenStreetMap-Mitwirkende (ODbL), geladen ${esc(geo.meta?.fetched || "")}${geo.meta?.elevation ? `, Höhen: ${esc(geo.meta.elevation)}` : ""}.` : ""}</p>`;
}

function profileBlock(f, type) {
  const p = f.properties;
  const name = p.display_name || p.name || p.ref || "ohne Namen";
  const segs = p.segments || [];
  const bits = [];
  if (p.length_m) bits.push(fmtKm(p.length_m));
  // Pisten bergab (oben → unten), Wanderungen und Radrouten in Laufrichtung (Anfang → Ende der Linie)
  if (p.kind === "piste" && p.top_m != null) bits.push(`${p.top_m} → ${p.bottom_m} m`);
  else if (segs.length) bits.push(`${Math.round(segs[0].e - (segs[0].g / 100) * segs[0].d)} → ${segs[segs.length - 1].e} m`);
  if (p.kind === "piste" && p.top_m != null) bits.push(`${p.top_m - p.bottom_m} Hm`);
  if (p.kind !== "piste" && p.ascent_m != null) bits.push(`↑ ${p.ascent_m} m ↓ ${p.descent_m} m`);
  if (p.kind === "hike" && p.time_min) bits.push(fmtTime(p.time_min));
  if (p.kind === "piste" && p.max_descent_grade) bits.push(`max ${p.max_descent_grade} %`);
  if (p.kind === "bike" && p.steepest_climb != null) bits.push(`steilster Anstieg ${p.steepest_climb} %`);
  const kind = p.kind === "piste" ? "piste" : "grade";
  return `<section><h3><span>Profil</span><span>${esc(name)}</span></h3>
    <p class="selinfo">${bits.join(" · ") || "Keine Kennzahlen (Höhen fehlen)"}</p>
    <canvas id="prof" aria-label="Höhenprofil ${esc(name)}"></canvas>
    <div class="proflegend">${legendFor(kind).map(([l, c]) => `<span><i style="background:${c};${c === "#0a0a0a" ? "box-shadow:0 0 0 1px #f2f5f7" : ""}"></i>${l}</span>`).join("")}</div></section>`;
}

const liftLabel = (t) => LIFT[t] || t || "Lift";

function featureList(a, feats, selected, hikeMode) {
  if (!feats.length) {
    const route = a.type === "bike" || a.type === "hike";
    return `<section><h3><span>Linien aus OpenStreetMap</span></h3><p class="empty" style="padding:0">${route
      ? "Der Verlauf dieser Route ist noch nicht geladen (oder in OpenStreetMap nicht als Route eingetragen). Kennzahlen oben stammen aus der verlinkten Tourenbeschreibung; die Karte zeigt den Startbereich."
      : "Noch keine Geodaten für dieses Gebiet."} Zum Nachladen am Mac „Daten laden.command“ doppelklicken (entspricht <code>npm run fetch -- ${esc(a.id)}</code> und <code>npm run elevation -- ${esc(a.id)}</code>).</p></section>`;
  }
  const selId = selected?.properties?.osm_id;
  const row = (f, c, cls, left, right) => `<button class="feat" data-feat="${f.properties.osm_id}" aria-pressed="${f.properties.osm_id === selId}" style="--c:${c}"><span class="sw ${cls}"></span><span><span class="nm">${esc(f.properties.display_name || f.properties.name || "ohne Namen")}</span><br><span class="mt l">${left}</span></span><span class="mt">${right}</span></button>`;
  const km = (f) => (f.properties.length_m ? fmtKm(f.properties.length_m) : "");
  const sortLen = (x, y) => (y.properties.length_m || 0) - (x.properties.length_m || 0);
  const out = [];
  if (a.type === "ski") {
    const pistes = feats.filter((f) => f.properties.kind === "piste" && f.geometry.type !== "Polygon");
    const groups = ["novice", "easy", "intermediate", "advanced", "expert", "freeride", "unknown"];
    out.push(`<section><h3><span>Pisten</span><span>${pistes.length} Linien</span></h3>`);
    for (const g of groups) {
      const ps = pistes.filter((f) => (f.properties.difficulty || "unknown") === g).sort(sortLen);
      if (!ps.length) continue;
      out.push(`<div class="grp">${DIFF[g]}</div>`);
      for (const f of ps) out.push(row(f, COLORS.piste[g], g === "advanced" || g === "expert" ? "black" : g === "freeride" ? "dash" : "", `${f.properties.top_m != null ? `${f.properties.top_m} → ${f.properties.bottom_m} m` : DIFF[g]}${f.properties.lit === "yes" ? '<span class="flag">Flutlicht</span>' : ""}`, `${km(f)}${f.properties.max_descent_grade ? `<br>max ${f.properties.max_descent_grade} %` : ""}`));
    }
    out.push("</section>");
    const lifts = feats.filter((f) => f.properties.kind === "lift").sort(sortLen);
    if (lifts.length) {
      out.push(`<section><h3><span>Lifte</span><span>${lifts.length}</span></h3>`);
      for (const f of lifts) out.push(row(f, COLORS.lift, "thin dash", `${liftLabel(f.properties.aerialway)}${f.properties["aerialway:occupancy"] ? ` · ${f.properties["aerialway:occupancy"]}er` : ""}${f.properties.bottom_m != null ? ` · ${f.properties.bottom_m} → ${f.properties.top_m} m` : ""}`, `${km(f)}${f.properties.ascent_m ? `<br>↑ ${f.properties.ascent_m} m` : ""}`));
      out.push("</section>");
    }
    const xc = feats.filter((f) => f.properties.kind === "xc").sort(sortLen);
    if (xc.length) {
      out.push(`<section><h3><span>Loipen im Gebiet</span><span>${xc.length}</span></h3>`);
      for (const f of xc) out.push(row(f, COLORS.xc.classic, "dash", esc(f.properties["piste:grooming"] || "Loipe"), km(f)));
      out.push("</section>");
    }
  } else if (a.type === "xc") {
    const xc = feats.filter((f) => f.properties.kind === "xc").sort(sortLen);
    out.push(`<section><h3><span>Loipen</span><span>${xc.length}</span></h3>`);
    for (const f of xc) out.push(row(f, f.properties["piste:grooming"] === "skating" ? COLORS.xc.skating : COLORS.xc.classic, "dash", `${esc(f.properties["piste:grooming"] || "Technik ohne Angabe")}${f.properties["piste:difficulty"] ? ` · ${DIFF[f.properties["piste:difficulty"]] || f.properties["piste:difficulty"]}` : ""}${f.properties.lit === "yes" ? '<span class="flag">Flutlicht</span>' : ""}`, `${km(f)}${f.properties.ascent_m ? `<br>↑ ${f.properties.ascent_m} m` : ""}`));
    out.push("</section>");
  } else if (a.type === "bike") {
    out.push(`<section><h3><span>Routen</span><span>${feats.length}</span></h3>`);
    for (const f of feats.slice().sort(sortLen)) out.push(row(f, COLORS.bikeGrade[f.properties.grade_class] || COLORS.sport.bike, "", `${f.properties.ascent_m != null ? `↑ ${f.properties.ascent_m} m ↓ ${f.properties.descent_m} m` : esc(f.properties.route || "Radroute")}`, `${km(f)}${f.properties.steepest_climb != null ? `<br>max ${f.properties.steepest_climb} %` : ""}`));
    out.push("</section>");
  } else {
    out.push(`<section><h3><span>Wege</span><span>${feats.length}</span></h3>`);
    for (const f of feats.slice().sort(sortLen)) {
      const c = hikeMode === "duration" ? COLORS.hikeDuration[f.properties.duration_class] : COLORS.hikeDifficulty[f.properties.difficulty];
      const black = (hikeMode === "duration" ? f.properties.duration_class === "long" : f.properties.difficulty === "hard") ? "black" : "";
      out.push(row(f, c || COLORS.sport.hike, black, `${HIKE[f.properties.difficulty] || "ohne Angabe"}${f.properties.ascent_m != null ? ` · ↑ ${f.properties.ascent_m} m` : ""}`, `${km(f)}${f.properties.time_min ? `<br>${fmtTime(f.properties.time_min)}` : ""}`));
    }
    out.push("</section>");
  }
  return out.join("");
}

export function renderWeather(days) {
  return days.slice(0, 5).map((d) => `<div><span>${weekday(d.date)}</span><b>${Math.round(d.tmax)}° / ${Math.round(d.tmin)}°</b><span>${describe(d.code)}</span>${d.snow_cm > 0 ? `<span class="snow">❄ ${fmtNum(d.snow_cm, 1)} cm</span>` : d.rain_mm > 0 ? `<span>☂ ${fmtNum(d.rain_mm)} mm</span>` : `<span>☼ ${fmtNum(d.sun_h)} h</span>`}<span>${Math.round(d.wind)} km/h</span></div>`).join("");
}
