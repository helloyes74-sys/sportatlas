// Sportarten-Katalog und Sportorte aus OSM (Padel, Golf, Klettern …): Liste aller Sportarten nach
// Überbegriff, Orte im Umkreis des Standorts, Detailblatt eines Ortes. Reine Render-Funktionen; main.js hängt die Ereignisse an.

import { esc } from "./ui.js";
import { fmtNum } from "./data.js";
import { haversine } from "./geo.js";

export const RADII = [10, 15, 20, 25, 50];
export const DEFAULT_RADIUS = 20;
const ROUTE_UNIT = { ski: ["Gebiet", "Gebiete"], xc: ["Loipe", "Loipen"], bike: ["Route", "Routen"], hike: ["Route", "Routen"] };
const SURFACE = { clay: "Sand", grass: "Rasen", artificial_turf: "Kunstrasen", acrylic: "Hartplatz", asphalt: "Asphalt", concrete: "Beton", tartan: "Tartan", sand: "Sand", artificial_grass: "Kunstrasen", carpet: "Teppich", paving_stones: "Pflaster", gravel: "Kies", wood: "Holz", rubber: "Gummi", ice: "Eis" };

/** Entfernung in km vom Standort [lon, lat] zu einem Ort {lon, lat} oder einem Gebiet {center}. */
export const kmFrom = (here, p) => (here ? haversine(here, p.center || [p.lon, p.lat]) / 1000 : null);

const plural = (n, [one, many]) => `${fmtNum(n)} ${n === 1 ? one : many}`;
/** Anzeigename eines Ortes; unbenannte Plätze heißen nach ihrer Sportart. */
export const spotName = (p, label) => p.name || label;

/** Liste aller Sportarten nach Überbegriff. counts: {sportId: {total, near}} */
export function renderCatalog(catalog, counts, { here, radius, query = "" }) {
  const q = query.trim().toLowerCase();
  const groups = catalog.map((g) => ({ ...g, sports: g.sports.filter((s) => !q || `${s.label} ${g.group}`.toLowerCase().includes(q)) })).filter((g) => g.sports.length);
  if (!groups.length) return `<p class="empty">Keine Sportart gefunden.</p>`;
  return groups.map((g) => `<div class="cat-group"><h3 class="cat-head">${esc(g.group)}</h3>${g.sports.map((s) => {
    const c = counts[s.id] || { total: 0, near: null };
    const unit = s.route ? ROUTE_UNIT[s.route] : ["Ort", "Orte"];
    const main = here ? (c.near ? `<b>${fmtNum(c.near)}</b>in ${radius} km` : `<b>–</b>nicht in ${radius} km`) : `<b>${fmtNum(c.total)}</b>${unit[1]}`;
    return `<button class="item cat" role="listitem" data-catalog="${s.id}" ${here && !c.near ? 'data-far="true"' : ""}>
      <span class="nm">${esc(s.label)}</span><span class="kv">${main}</span>
      <span class="rg">${here ? plural(c.total, unit) + " in Kärnten" : s.route ? "Gebiete und Strecken mit Karte" : "Orte aus OpenStreetMap"}</span>
    </button>`;
  }).join("")}</div>`).join("");
}

/** Umkreis-Chips und Standort-Knopf über der Ortsliste. */
export function renderSpotFilters({ here, radius, locating }) {
  if (!here) return `<div class="chiprow"><button class="chip near" id="btnNear" ${locating ? "disabled" : ""}>${locating ? "Standort wird ermittelt …" : "Standort verwenden"}</button><span class="hint">zeigt nur Orte in deiner Nähe</span></div>`;
  return `<div class="chiprow"><span class="chiplabel">Umkreis</span>${RADII.map((r) => `<button class="chip" data-radius="${r}" aria-pressed="${r === radius}">${r} km</button>`).join("")}<button class="chip" data-radius="0" aria-pressed="${radius === 0}">ganz Kärnten</button></div>`;
}

/** Orte einer Sportart, nach Entfernung sortiert. */
export function renderSpotList(spots, label, { here, selectedId, radius }) {
  if (!spots.length) return `<p class="empty">${here && radius ? `Im Umkreis von ${radius} km ist nichts eingetragen. Umkreis vergrößern oder „ganz Kärnten“ wählen.` : "Nichts gefunden."}</p>`;
  return spots.map((p) => {
    const d = kmFrom(here, p);
    const facts = [p.courts ? `${p.courts} Plätze` : "", p.indoor === true ? "Halle" : p.indoor === "teils" ? "Halle und Freiluft" : "", SURFACE[p.surface] || ""].filter(Boolean).join(" · ");
    return `<button class="item" role="listitem" data-spot="${esc(p.id)}" aria-pressed="${p.id === selectedId}">
      <span class="nm">${esc(spotName(p, label))}</span><span class="kv">${d != null ? `<b>${d < 10 ? fmtNum(d, 1) : fmtNum(Math.round(d))} km</b>` : ""}</span>
      <span class="rg">${esc(facts || (p.name ? label : "ohne Namen in OpenStreetMap"))}</span>
    </button>`;
  }).join("");
}

/** Detailblatt eines Ortes. */
export function renderSpotDetail(p, label, group, { here, stand }) {
  const d = kmFrom(here, p);
  const cell = (k, v) => (v == null || v === "" ? "" : `<div><small>${k}</small><b>${esc(v)}</b></div>`);
  const ll = `${p.lat},${p.lon}`;
  const osmLink = p.osm?.[0] ? `https://www.openstreetmap.org/${({ n: "node", w: "way", r: "relation" })[p.osm[0][0]]}/${p.osm[0].slice(1)}` : null;
  return `
    <span class="tag">${esc(label)} · ${esc(group)}</span>
    <div class="headrow"><h2>${esc(spotName(p, label))}</h2></div>
    <div class="stats">${cell("Entfernung", d != null ? (d < 10 ? fmtNum(d, 1) : fmtNum(Math.round(d))) + " km Luftlinie" : null)}${cell("Plätze", p.courts)}${cell("Art", p.indoor === true ? "Halle" : p.indoor === "teils" ? "Halle und Freiluft" : null)}${cell("Belag", SURFACE[p.surface] || p.surface)}${cell("Geöffnet", p.hours)}${cell("Gebühr", p.fee === "yes" ? "ja" : p.fee === "no" ? "frei" : p.fee)}</div>
    ${p.name ? "" : `<p class="sub">In OpenStreetMap ohne Namen eingetragen – oft ein Gemeinde- oder Vereinsplatz.</p>`}
    <section id="wx"><h3><span>Wetter</span><span id="wxstate">lädt …</span></h3><div class="wx" id="wxgrid"></div><p class="wx-note">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener" style="color:inherit">Open-Meteo.com</a></p></section>
    <section><h3><span>Links</span></h3><div class="links">
      ${p.web ? `<a class="btn acc" href="${esc(p.web)}" target="_blank" rel="noopener">Website ↗</a>` : ""}
      <a class="btn ${p.web ? "" : "acc"}" href="https://www.google.com/maps/dir/?api=1&destination=${ll}" target="_blank" rel="noopener">Route dorthin ↗</a>
      <button class="btn" id="btnShare">Link teilen</button>
    </div></section>
    <p class="src">Ort aus OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL), Stand ${esc(stand || "")}${osmLink ? ` · <a href="${osmLink}" target="_blank" rel="noopener">Eintrag ansehen oder ergänzen</a>` : ""}. Fehlt ein Platz, kann man ihn in OpenStreetMap eintragen; er erscheint dann nach dem nächsten monatlichen Abruf.</p>`;
}
