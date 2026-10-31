// Einstieg: Zustand, Ereignisse, Hash-Routing (#ski, #ski/gerlitzen, #hike/alpe-adria-trail).
/* global maplibregl */

import { loadRegion, loadGeo } from "./data.js";
import { createMap, setHere, setAreaMarkers, setGeo, setSelection, setHikeColorMode, flyToBbox, flyToRegion, setFocus, flyToSector, startTour, stopTour, tourRunning, INTERACTIVE_LAYERS, COLORS, narrow } from "./map.js";
import { computeSectors } from "./sectors.js";
import { favorites, notes } from "./favorites.js";
import { filterGroups, applyFilters, renderFilters, distanceKm } from "./filters.js";
import { toGPX, downloadText } from "./gpx.js";
import { renderSports, renderList, renderLegend, renderDetail, renderWeather, renderSnow, sportLabel } from "./ui.js";
import { drawProfile } from "./profile.js";
import { forecast, snowNow } from "./weather.js";
import { bbox, flatCoords } from "./geo.js";

const $ = (s) => document.querySelector(s);
const state = { region: null, sport: "ski", area: null, geo: null, feature: null, hikeMode: "difficulty", query: "", onlyFavs: false, sectors: [], activeSector: null, filters: {}, here: null, near: false, locating: false };
const store = {
  get(k, d) { try { const v = localStorage.getItem("sportatlas:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("sportatlas:" + k, JSON.stringify(v)); } catch { /* privat / voll */ } },
};

function toast(msg, ms = 4000) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- Start ----------
if (typeof maplibregl === "undefined") {
  document.body.insertAdjacentHTML("beforeend", `<p class="toast" style="display:block">Kartenbibliothek konnte nicht geladen werden (kein Internet?). Listen funktionieren trotzdem.</p>`);
}
state.region = await loadRegion("kaernten");
state.hikeMode = store.get("hikeMode", "difficulty");
const map = typeof maplibregl !== "undefined" ? createMap("map", state.region) : null;
if (map) {
  map.on("load", () => setHikeColorMode(map, state.hikeMode));
  map.on("click", onMapClick);
  map.on("mousemove", onMapMove);
  map.getCanvas().addEventListener("mouseleave", () => { $("#tip").hidden = true; });
  // Am Handy: sobald die Karte angefasst wird, klappen die Blätter auf ihren Kopf zusammen
  map.on("dragstart", () => collapseSheets());
  map.on("zoomstart", (e) => { if (e.originalEvent) collapseSheets(); });
  map.on("rotatestart", (e) => { if (e.originalEvent) collapseSheets(); });
}

// ---------- Blätter am Handy ----------
/** Blatt auf- oder zuklappen; am Desktop (Seitenleisten) passiert nichts. */
function setSheet(el, open) { if (narrow()) el.classList.toggle("collapsed", !open); else el.classList.remove("collapsed"); }
function collapseSheets() { if (narrow()) document.querySelectorAll(".panel").forEach((p) => p.classList.add("collapsed")); }
document.addEventListener("click", (e) => { const g = e.target.closest("[data-grab]"); if (g) setSheet(g.parentElement, g.parentElement.classList.contains("collapsed")); });
$("#q").addEventListener("focus", () => setSheet($("#left"), true));
window.matchMedia("(max-width: 860px)").addEventListener("change", (m) => { if (!m.matches) document.querySelectorAll(".panel").forEach((p) => p.classList.remove("collapsed")); });
applyRoute();
window.addEventListener("hashchange", applyRoute);
// Zum Nachsehen in der Browser-Konsole: sportatlas.map, sportatlas.state
window.sportatlas = { map, state };
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});

// ---------- Routing ----------
function parseHash() {
  const [sport, areaId] = location.hash.replace(/^#\/?/, "").split("/");
  return { sport: state.region.types[sport] ? sport : null, areaId: areaId || null };
}
function setHash(sport, areaId) {
  const h = "#" + sport + (areaId ? "/" + areaId : "");
  if (location.hash !== h) history.pushState(null, "", h);
  applyRoute();
}
async function applyRoute() {
  const { sport, areaId } = parseHash();
  state.sport = sport || store.get("sport", "ski");
  store.set("sport", state.sport);
  const area = areaId ? state.region.areas.find((a) => a.id === areaId && a.type === state.sport) : null;
  renderSportsBar();
  renderFilterBar();
  renderAreaList();
  renderLegendBar();
  if (area) await openArea(area);
  else closeArea();
}

// ---------- Übersicht ----------
function renderSportsBar() {
  $("#sports").innerHTML = renderSports(state.sport);
  $("#crumb").textContent = `${state.region.name} · ${sportLabel(state.sport)}`;
  $("#modeWrap").hidden = state.sport !== "hike";
  $("#colorMode").innerHTML = `<option value="difficulty" ${state.hikeMode === "difficulty" ? "selected" : ""}>Schwierigkeit</option><option value="duration" ${state.hikeMode === "duration" ? "selected" : ""}>Gehzeit</option>`;
}
function areasOfSport() {
  const q = state.query.trim().toLowerCase();
  let list = state.region.areas.filter((a) => a.type === state.sport && (!q || `${a.name} ${a.region || ""} ${a.kind || ""} ${(a.highlights || []).join(" ")}`.toLowerCase().includes(q)));
  list = applyFilters(list, filterGroups(state.sport, state.region.areas), state.filters[state.sport] || {});
  // Nähe: nach Luftlinie vom Standort; sonst Skigebiete und Loipen nach Größe, Routen nach Art und Name
  if (state.near && state.here) return list.sort((a, b) => distanceKm(state.here, a) - distanceKm(state.here, b));
  if (state.sport === "bike" || state.sport === "hike") return list.sort((a, b) => (a.kind || "").localeCompare(b.kind || "", "de") || a.name.localeCompare(b.name, "de", { numeric: true }));
  return list.sort((a, b) => (b.pistes_km?.total || b.loipen_km?.total || 0) - (a.pistes_km?.total || a.loipen_km?.total || 0));
}
function renderFilterBar() {
  $("#filters").innerHTML = renderFilters(filterGroups(state.sport, state.region.areas), state.filters[state.sport] || {}, { here: state.here, near: state.near, locating: state.locating });
}
/** Standort abfragen (einmal je Sitzung) und die Liste nach Entfernung sortieren. */
function toggleNear() {
  if (state.near) { state.near = false; renderFilterBar(); renderAreaList(); return; }
  if (state.here) { state.near = true; renderFilterBar(); renderAreaList(); return; }
  if (!navigator.geolocation) { toast("Dieses Gerät gibt keinen Standort frei."); return; }
  state.locating = true; renderFilterBar();
  navigator.geolocation.getCurrentPosition((pos) => {
    state.here = [pos.coords.longitude, pos.coords.latitude]; state.locating = false; state.near = true;
    if (map) setHere(map, state.here);
    renderFilterBar(); renderAreaList();
    toast(`Standort gefunden (±${Math.round(pos.coords.accuracy)} m) – Liste nach Entfernung sortiert`);
  }, (err) => {
    state.locating = false; renderFilterBar();
    toast(err.code === 1 ? "Standort nicht freigegeben – in den Browser-Einstellungen erlauben." : "Standort konnte nicht ermittelt werden.");
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
}
function renderAreaList() {
  const list = areasOfSport();
  const distances = state.here ? Object.fromEntries(list.map((a) => [a.id, distanceKm(state.here, a)])) : null;
  $("#list").innerHTML = renderList(list, state.area?.id, { onlyFavs: state.onlyFavs, distances });
  $("#favFilter").setAttribute("aria-pressed", state.onlyFavs);
  const shown = state.onlyFavs ? $("#list").querySelectorAll(".item").length : list.length;
  $("#count").textContent = `${shown} ${state.sport === "ski" ? "Gebiete" : state.sport === "xc" ? "Loipen" : "Routen"}`;
  if (map) setAreaMarkers(map, list);
}
function renderLegendBar() { $("#legend").innerHTML = renderLegend(state.sport, state.hikeMode); }

// ---------- Gebiet ----------
async function openArea(area) {
  const changed = state.area?.id !== area.id;
  state.area = area;
  if (changed) { state.feature = null; state.geo = undefined; state.sectors = []; state.activeSector = null; if (map) stopTour(map); }
  $("#right").hidden = false;
  document.querySelectorAll("#list .item").forEach((b) => b.setAttribute("aria-pressed", b.dataset.area === area.id));
  if (state.geo === undefined) {
    try { state.geo = await loadGeo(area); } catch (e) { state.geo = null; toast(`Geodaten konnten nicht geladen werden: ${e.message}`); }
    if (state.area?.id !== area.id) return; // inzwischen anderes Gebiet
    if (map) { setGeo(map, state.geo); setSelection(map, null); }
  }
  if (changed) state.sectors = computeSectors(state.geo, area);
  // erst das Blatt füllen (am Handy bestimmt seine Höhe den freien Kartenausschnitt), dann fliegen
  renderDetailPanel();
  if (changed) setSheet($("#right"), true);
  // Kamera: auf die echten Linien zoomen, wenn es welche gibt, sonst auf die Bounding-Box des Gebiets
  const focus = geoBbox(state.geo) || area.bbox;
  if (map && changed) { flyToBbox(map, focus, { pitch: area.type === "ski" ? 60 : 52 }); setFocus(map, focus); }
  loadWeather(area);
  loadSnow(area);
}
/** Bounding-Box aller Linien eines Gebiets, um 10 % erweitert; null ohne Daten. */
function geoBbox(geo) {
  const feats = geo?.features?.filter((f) => f.geometry.type !== "Point") || [];
  if (!feats.length) return null;
  const b = bbox(feats.flatMap((f) => flatCoords(f.geometry)));
  const dx = (b[2] - b[0]) * .1 || .01, dy = (b[3] - b[1]) * .1 || .01;
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}
function closeArea() {
  state.area = null; state.feature = null; state.geo = undefined; state.sectors = []; state.activeSector = null;
  $("#right").hidden = true;
  document.querySelectorAll("#list .item").forEach((b) => b.setAttribute("aria-pressed", "false"));
  if (map) { stopTour(map); setGeo(map, null); setSelection(map, null); setFocus(map, null); }
}
function renderDetailPanel() {
  queueMicrotask(() => { if (state.area && snowCache.has(state.area.id)) { const [top, base] = snowCache.get(state.area.id); const g = $("#snowgrid"); if (g) { g.innerHTML = renderSnow(top, base, state.area); const st = $("#snowstate"); if (st) st.textContent = "Modell"; } } });
  const el = $("#detail");
  const scroll = el.scrollTop;
  el.innerHTML = renderDetail(state.area, state.geo, { selectedFeature: state.feature, hikeMode: state.hikeMode, sectors: state.sectors, activeSector: state.activeSector });
  const tourBtn = $("#btnTour"); if (tourBtn) tourBtn.setAttribute("aria-pressed", map ? tourRunning() : false);
  el.scrollTop = scroll;
  const canvas = $("#prof");
  if (canvas && state.feature) drawProfile(canvas, state.feature.properties.segments, state.feature.properties.kind === "piste" ? "piste" : "grade");
  if (weatherCache.has(state.area.id)) paintWeather(weatherCache.get(state.area.id));
}
const weatherCache = new Map();
const snowCache = new Map();
async function loadSnow(area) {
  if (area.type !== "ski") return;
  const paint = ([top, base]) => { const g = $("#snowgrid"), st = $("#snowstate"); if (!g || state.area?.id !== area.id) return; g.innerHTML = renderSnow(top, base, area); if (st) st.textContent = top?.time ? "Modell · " + top.time.slice(11, 16) + " Uhr" : "Modell"; };
  if (snowCache.has(area.id)) return paint(snowCache.get(area.id));
  try {
    const top = area.elevation?.top_m, base = area.elevation?.base_m;
    const res = await Promise.all([snowNow(area.center, top), base && top && top - base > 150 ? snowNow(area.center, base) : null]);
    snowCache.set(area.id, res); paint(res);
  } catch (e) { const st = $("#snowstate"); if (st && state.area?.id === area.id) st.textContent = "nicht erreichbar"; }
}
async function loadWeather(area) {
  if (weatherCache.has(area.id)) return paintWeather(weatherCache.get(area.id));
  try {
    const days = await forecast(area.center, area.type === "ski" ? area.elevation?.top_m : undefined);
    weatherCache.set(area.id, days);
    if (state.area?.id === area.id) paintWeather(days);
  } catch (e) {
    const st = $("#wxstate"); if (st) st.textContent = "nicht erreichbar";
  }
}
function paintWeather(days) {
  const grid = $("#wxgrid"), st = $("#wxstate");
  if (!grid) return;
  grid.innerHTML = renderWeather(days);
  if (st) st.textContent = "7 Tage · Open-Meteo";
}

function selectFeature(osmId, { fly = true } = {}) {
  const f = state.geo?.features.find((x) => String(x.properties.osm_id) === String(osmId));
  state.feature = state.feature?.properties.osm_id === f?.properties.osm_id ? null : f || null;
  if (map) {
    setSelection(map, state.feature);
    if (state.feature && fly) {
      const b = bbox(flatCoords(state.feature.geometry));
      if (b[2] - b[0] > 0.002 || b[3] - b[1] > 0.002) flyToBbox(map, b, { pitch: 60, maxZoom: 15.5 });
    }
  }
  renderDetailPanel();
  // am Handy das Blatt öffnen, damit das Profil der angetippten Linie sichtbar wird
  if (state.feature && !fly) setSheet($("#right"), true);
  const btn = document.querySelector(`#detail [data-feat="${state.feature?.properties.osm_id}"]`);
  btn?.scrollIntoView({ block: "nearest" });
}

// ---------- Ereignisse ----------
document.addEventListener("click", (e) => {
  const sp = e.target.closest("[data-sport]"); if (sp) { setHash(sp.dataset.sport, null); return; }
  const ar = e.target.closest("[data-area]"); if (ar) { setHash(state.sport, ar.dataset.area); return; }
  const ft = e.target.closest("[data-feat]"); if (ft) { selectFeature(ft.dataset.feat); return; }
  const sc = e.target.closest("[data-sector]"); if (sc) { onSector(sc.dataset.sector); return; }
  if (e.target.closest("#favBtn") && state.area) { favorites.toggle(state.area.id); renderDetailPanel(); renderAreaList(); return; }
  if (e.target.closest("#favFilter")) { state.onlyFavs = !state.onlyFavs; renderAreaList(); return; }
  const fc = e.target.closest("[data-filter]"); if (fc) {
    const cur = (state.filters[state.sport] ||= {}); const set = (cur[fc.dataset.filter] ||= new Set());
    set.has(fc.dataset.option) ? set.delete(fc.dataset.option) : set.add(fc.dataset.option);
    renderFilterBar(); renderAreaList(); return;
  }
  if (e.target.closest("#btnClearFilters")) { state.filters[state.sport] = {}; renderFilterBar(); renderAreaList(); return; }
  if (e.target.closest("#btnNear")) { toggleNear(); return; }
  if (e.target.closest("#btnGpx") && state.area && state.geo) { downloadText(`${state.area.id}.gpx`, toGPX(state.geo, state.area)); toast("GPX gespeichert – in Komoot, Garmin Connect oder Apple Karten öffnen"); return; }
  if (e.target.closest("#btnShare") && state.area) {
    const url = location.origin + location.pathname + "#" + state.sport + "/" + state.area.id;
    if (navigator.share) navigator.share({ title: `Sportatlas – ${state.area.name}`, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast("Link kopiert: " + url), () => toast(url));
    return;
  }
  const st = e.target.closest("[data-star]"); if (st && state.area) { const v = +st.dataset.star; const cur = notes.get(state.area.id).stars; notes.set(state.area.id, { stars: cur === v ? 0 : v }); renderDetailPanel(); renderAreaList(); return; }
  if (e.target.closest("#closeDetail")) { setHash(state.sport, null); setSheet($("#left"), true); if (map) flyToRegion(map, state.region); return; }
  if (e.target.closest("#btnOverview")) { setHash(state.sport, null); setSheet($("#left"), true); if (map) flyToRegion(map, state.region); return; }
  if (e.target.closest("#btnTilt") && map) { map.easeTo({ pitch: map.getPitch() > 20 ? 0 : 60, duration: 700 }); return; }
});
$("#q").addEventListener("input", (e) => { state.query = e.target.value; renderAreaList(); });
document.addEventListener("input", (e) => { if (e.target.id === "noteTxt" && state.area) notes.set(state.area.id, { text: e.target.value }); });
document.addEventListener("change", (e) => { if (e.target.id === "noteTxt") renderAreaList(); });

function onSector(id) {
  if (!map) return;
  if (id === "tour") {
    if (tourRunning()) { stopTour(map); } else { startTour(map, () => { const b = $("#btnTour"); if (b) b.setAttribute("aria-pressed", "false"); }); }
    const b = $("#btnTour"); if (b) b.setAttribute("aria-pressed", tourRunning());
    return;
  }
  const s = state.sectors.find((x) => x.id === id);
  if (!s) return;
  state.activeSector = id;
  flyToSector(map, s);
  document.querySelectorAll("#sectorChips [data-sector]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.sector === id));
}
$("#colorMode").addEventListener("change", (e) => {
  state.hikeMode = e.target.value; store.set("hikeMode", state.hikeMode);
  if (map) setHikeColorMode(map, state.hikeMode);
  renderLegendBar(); if (state.area) renderDetailPanel();
});
window.addEventListener("resize", () => { const c = $("#prof"); if (c && state.feature) drawProfile(c, state.feature.properties.segments, state.feature.properties.kind === "piste" ? "piste" : "grade"); });

function onMapClick(e) {
  // Finger sind breiter als ein Mauszeiger: am Handy zählt ein Treffer im Umkreis von 16 px
  const r = narrow() ? 16 : 4;
  const box = [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]];
  const hits = map.queryRenderedFeatures(box, { layers: INTERACTIVE_LAYERS.filter((l) => map.getLayer(l)) });
  if (!hits.length) return;
  // Marker eines anderen Gebiets zuerst, dann Linien des offenen Gebiets
  const isArea = (f) => f.layer.id.startsWith("areas-");
  const h = hits.find((f) => isArea(f) && f.properties.id !== state.area?.id) || hits.find((f) => !isArea(f)) || hits[0];
  if (h.layer.id.startsWith("areas-")) { setHash(h.properties.type, h.properties.id); return; }
  selectFeature(h.properties.osm_id, { fly: false });
}
function onMapMove(e) {
  const hits = map.queryRenderedFeatures(e.point, { layers: INTERACTIVE_LAYERS.filter((l) => map.getLayer(l)) });
  const tip = $("#tip");
  map.getCanvas().style.cursor = hits.length ? "pointer" : "";
  if (!hits.length) { tip.hidden = true; return; }
  const p = hits[0].properties;
  let text, color = COLORS.accent;
  if (hits[0].layer.id.startsWith("areas-")) { text = p.name; color = p.color; }
  else {
    const name = p.display_name || p.name || p.ref || "ohne Namen";
    const extra = p.kind === "piste" ? ({ novice: "sehr leicht", easy: "leicht", intermediate: "mittel", advanced: "schwer", expert: "sehr schwer", freeride: "Skiroute" }[p.difficulty] || "") : p.kind === "lift" ? (p.aerialway || "Lift") : "";
    text = [name, extra, p.length_m ? (p.length_m / 1000).toLocaleString("de-AT", { maximumFractionDigits: 1 }) + " km" : ""].filter(Boolean).join(" · ");
    color = p.kind === "piste" ? (COLORS.piste[p.difficulty] || "#9aa7b0") : p.kind === "lift" ? COLORS.lift : COLORS.sport[p.kind] || COLORS.accent;
    if (color === "#0a0a0a") color = "#f2f5f7";
  }
  tip.textContent = text; tip.style.setProperty("--c", color);
  tip.style.left = e.point.x + "px"; tip.style.top = e.point.y + "px"; tip.hidden = false;
}

// Handy-Link: der Dev-Server meldet seine Adressen im WLAN (nur lokal, nicht auf einem Hoster)
if (["localhost", "127.0.0.1"].includes(location.hostname)) {
  fetch("/__info").then((r) => (r.ok ? r.json() : null)).then((info) => {
    const url = info?.lan?.find((u) => /^http:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(u)) || info?.lan?.[0];
    if (!url) return;
    const b = $("#phoneLink"); b.innerHTML = `Am Handy<b>${url.replace(/^http:\/\//, "")}</b>`; b.hidden = false;
    b.onclick = () => { navigator.clipboard?.writeText(url).then(() => toast("Adresse kopiert: " + url + " (Handy muss im selben WLAN sein)"), () => toast(url)); };
  }).catch(() => {});
}

// kleine Hilfe beim ersten Start
if (!store.get("seen")) { store.set("seen", true); toast("Tipp: Gebiet links wählen, dann Piste oder Weg antippen. Noch keine Linien? Siehe README: npm run fetch", 7000); }
