// Einstieg: Zustand, Ereignisse, Hash-Routing (#ski, #ski/gerlitzen, #hike/alpe-adria-trail).
/* global maplibregl */

import { loadRegion, loadGeo, loadSpots } from "./data.js";
import { createMap, setHere, setAreaMarkers, setGeo, setSelection, setHikeColorMode, flyToBbox, flyToRegion, setFocus, flyToSector, startTour, stopTour, tourRunning, introFlight, snapshot, INTERACTIVE_LAYERS, COLORS, narrow } from "./map.js";
import { computeSectors } from "./sectors.js";
import { favorites, notes } from "./favorites.js";
import { filterGroups, applyFilters, renderFilters, distanceKm } from "./filters.js";
import { toGPX, downloadText } from "./gpx.js";
import { renderSports, renderList, renderLegend, renderDetail, renderWeather, renderSnow, sportLabel } from "./ui.js";
import { drawProfile } from "./profile.js";
import { forecast, snowNow } from "./weather.js";
import { bbox, flatCoords } from "./geo.js";
import { renderCatalog, renderSpotFilters, renderSpotList, renderSpotDetail, kmFrom, spotName, RADII, DEFAULT_RADIUS } from "./spots.js";

const $ = (s) => document.querySelector(s);
const state = { region: null, sport: "ski", area: null, geo: null, feature: null, hikeMode: "difficulty", query: "", onlyFavs: false, sectors: [], activeSector: null, filters: {}, here: null, near: false, locating: false,
  view: "routes", spotSport: null, spot: null, radius: DEFAULT_RADIUS, spots: null };
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
state.radius = [0, ...RADII].includes(store.get("radius")) ? store.get("radius") : DEFAULT_RADIUS;
try { state.spots = await loadSpots("kaernten"); } catch { state.spots = null; }
const SPORT_INFO = new Map((state.spots?.catalog || []).flatMap((g) => g.sports.map((s) => [s.id, { ...s, group: g.group }])));
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
// Anflug beim Start, wenn kein Gebiet in der Adresse steht (sonst fliegt openArea direkt hin)
if (map && !parseHash().areaId) introFlight(map, state.region);
applyRoute();
window.addEventListener("hashchange", applyRoute);
// Zum Nachsehen in der Browser-Konsole: sportatlas.map, sportatlas.state
window.sportatlas = { map, state };
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});

// ---------- Routing ----------
function parseHash() {
  const [sport, areaId, spotId] = location.hash.replace(/^#\/?/, "").split("/");
  if (sport === "alle") return { view: "catalog" };
  if (sport === "ort" && SPORT_INFO.has(areaId)) return { view: "spots", spotSport: areaId, spotId: spotId || null };
  if (!location.hash && store.get("view", "catalog") === "catalog" && state.spots) return { view: "catalog" };
  return { view: "routes", sport: state.region.types[sport] ? sport : null, areaId: areaId || null };
}
/** Zu einer Sportart aus dem Katalog: bestehende Bereiche (Ski …) oder Orte im Umkreis. */
function go(hash) { if (location.hash !== hash) history.pushState(null, "", hash); applyRoute(); }
function setHash(sport, areaId) {
  const h = "#" + sport + (areaId ? "/" + areaId : "");
  if (location.hash !== h) history.pushState(null, "", h);
  applyRoute();
}
async function applyRoute() {
  const r = parseHash();
  state.view = r.view;
  store.set("view", r.view === "catalog" ? "catalog" : "routes");
  document.body.dataset.view = r.view;
  if (r.view !== "routes") return applySpotRoute(r);
  const { sport, areaId } = r;
  state.spot = null; state.spotSport = null;
  $("#favFilter").hidden = false; $("#q").placeholder = "Suchen …";
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
  const all = state.spots ? `<button role="tab" data-go="#alle" aria-pressed="${state.view !== "routes"}" style="--c:var(--accent)"><span class="dot"></span>Alle Sportarten</button>` : "";
  $("#sports").innerHTML = all + renderSports(state.view === "routes" ? state.sport : null);
  const info = SPORT_INFO.get(state.spotSport);
  $("#crumb").textContent = `${state.region.name} · ${state.view === "catalog" ? "Alle Sportarten" : state.view === "spots" ? info?.label : sportLabel(state.sport)}`;
  $("#modeWrap").hidden = state.view !== "routes" || state.sport !== "hike";
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
  if (state.view !== "routes" && state.here) return;
  if (state.near) { state.near = false; renderFilterBar(); renderAreaList(); return; }
  if (state.here) { state.near = true; renderFilterBar(); renderAreaList(); return; }
  if (!navigator.geolocation) { toast("Dieses Gerät gibt keinen Standort frei."); return; }
  state.locating = true; rerenderList();
  navigator.geolocation.getCurrentPosition((pos) => {
    state.here = [pos.coords.longitude, pos.coords.latitude]; state.locating = false; state.near = true;
    if (map) setHere(map, state.here);
    rerenderList();
    if (state.view === "spots" && !state.spot) flySpots();
    toast(`Standort gefunden (±${Math.round(pos.coords.accuracy)} m) – ${state.view === "routes" ? "Liste nach Entfernung sortiert" : "nur Orte im Umkreis"}`);
  }, (err) => {
    state.locating = false; rerenderList();
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
/** Kartenbild sichern: am Handy über das Teilen-Blatt (Fotos, Nachrichten), sonst als Download. */
async function saveSnapshot() {
  const name = state.area ? state.area.name : `${state.region.name} · ${sportLabel(state.sport)}`;
  const sub = state.area ? `${sportLabel(state.sport)} · ${state.area.region || state.region.name} · sportatlas` : "sportatlas";
  try {
    const blob = await snapshot(map, { title: name, subtitle: sub });
    const file = new File([blob], `sportatlas-${(state.area?.id || state.sport)}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `Sportatlas – ${name}` }).catch(() => {}); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("Bild gespeichert: " + file.name);
  } catch (e) { toast("Bild konnte nicht erstellt werden: " + e.message); }
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
    if (state.area?.id === area.id || "ort:" + state.spot?.id === area.id) paintWeather(days);
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
  const gt = e.target.closest("[data-go]"); if (gt) { go(gt.dataset.go); return; }
  const cg = e.target.closest("[data-catalog]"); if (cg) { const s = SPORT_INFO.get(cg.dataset.catalog); state.query = ""; $("#q").value = ""; go(s.route ? "#" + s.route : "#ort/" + s.id); return; }
  const so = e.target.closest("[data-spot]"); if (so) { go(`#ort/${state.spotSport}/${so.dataset.spot}`); return; }
  const rd = e.target.closest("[data-radius]"); if (rd) { state.radius = +rd.dataset.radius; store.set("radius", state.radius); rerenderList(); if (state.view === "spots" && !state.spot) flySpots(); return; }
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
  if (e.target.closest("#btnShare") && state.spot) {
    const url = location.origin + location.pathname + `#ort/${state.spotSport}/${state.spot.id}`;
    if (navigator.share) navigator.share({ title: `Sportatlas – ${spotName(state.spot, SPORT_INFO.get(state.spotSport).label)}`, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast("Link kopiert: " + url), () => toast(url));
    return;
  }
  if (e.target.closest("#btnShare") && state.area) {
    const url = location.origin + location.pathname + "#" + state.sport + "/" + state.area.id;
    if (navigator.share) navigator.share({ title: `Sportatlas – ${state.area.name}`, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast("Link kopiert: " + url), () => toast(url));
    return;
  }
  const st = e.target.closest("[data-star]"); if (st && state.area) { const v = +st.dataset.star; const cur = notes.get(state.area.id).stars; notes.set(state.area.id, { stars: cur === v ? 0 : v }); renderDetailPanel(); renderAreaList(); return; }
  if (e.target.closest("#closeDetail") && state.view === "spots") { go("#ort/" + state.spotSport); setSheet($("#left"), true); return; }
  if (e.target.closest("#btnOverview") && state.view !== "routes") { go(state.view === "spots" ? "#ort/" + state.spotSport : "#alle"); setSheet($("#left"), true); if (map) { if (state.view === "spots") flySpots(); else flyToRegion(map, state.region); } return; }
  if (e.target.closest("#closeDetail")) { setHash(state.sport, null); setSheet($("#left"), true); if (map) flyToRegion(map, state.region); return; }
  if (e.target.closest("#btnOverview")) { setHash(state.sport, null); setSheet($("#left"), true); if (map) flyToRegion(map, state.region); return; }
  if (e.target.closest("#btnTilt") && map) { map.easeTo({ pitch: map.getPitch() > 20 ? 0 : 60, duration: 700 }); return; }
  if (e.target.closest("#btnShot") && map) { saveSnapshot(); return; }
  const tab = e.target.closest("[data-tab]");
  if (tab) {
    const target = tab.dataset.tab === "top" ? $("#detail") : $(tab.dataset.tab);
    setSheet($("#right"), true);
    document.querySelectorAll("#detail .tabs button").forEach((b) => b.setAttribute("aria-pressed", b === tab));
    if (tab.dataset.tab === "top") $("#detail").scrollTo({ top: 0, behavior: "smooth" }); else target?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
});
$("#q").addEventListener("input", (e) => { state.query = e.target.value; rerenderList(); });
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
  const h = hits.find((f) => isArea(f) && f.properties.id !== (state.area?.id || state.spot?.id)) || hits.find((f) => !isArea(f)) || hits[0];
  if (h.layer.id.startsWith("areas-") && h.properties.type === "ort") { go(`#ort/${state.spotSport}/${h.properties.id}`); return; }
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

// ---------- Alle Sportarten und Orte im Umkreis ----------
function rerenderList() { if (state.view === "routes") { renderFilterBar(); renderAreaList(); } else renderSpotsPanel(); }
/** Orte der aktiven Sportart: im Umkreis (mit Standort) nach Entfernung, sonst alle nach Name. */
function spotsInView() {
  const label = SPORT_INFO.get(state.spotSport)?.label || "";
  const q = state.query.trim().toLowerCase();
  let list = state.spots.places.filter((p) => p.s === state.spotSport && (!q || spotName(p, label).toLowerCase().includes(q)));
  if (state.here) {
    if (state.radius) list = list.filter((p) => kmFrom(state.here, p) <= state.radius);
    return list.sort((a, b) => kmFrom(state.here, a) - kmFrom(state.here, b));
  }
  return list.sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || spotName(a, label).localeCompare(spotName(b, label), "de"));
}
/** Zahl der Orte bzw. Gebiete je Sportart, gesamt und im Umkreis. */
function catalogCounts() {
  const counts = {};
  const add = (id, km) => { const c = (counts[id] ||= { total: 0, near: 0 }); c.total++; if (km != null && (!state.radius || km <= state.radius)) c.near++; };
  for (const p of state.spots.places) add(p.s, state.here ? kmFrom(state.here, p) : null);
  for (const a of state.region.areas) add(a.type, state.here ? kmFrom(state.here, a) : null);
  return counts;
}
function renderSpotsPanel() {
  const opts = { here: state.here, radius: state.radius, locating: state.locating };
  $("#filters").innerHTML = renderSpotFilters(opts);
  $("#favFilter").hidden = true;
  $("#q").placeholder = state.view === "catalog" ? "Sportart suchen …" : "Ort suchen …";
  if (state.view === "catalog") {
    const counts = catalogCounts();
    $("#list").innerHTML = renderCatalog(state.spots.catalog, counts, { ...opts, query: state.query });
    $("#count").textContent = `${state.spots.catalog.reduce((n, g) => n + g.sports.length, 0)} Sportarten`;
    if (map) setAreaMarkers(map, []);
    return;
  }
  const info = SPORT_INFO.get(state.spotSport);
  const list = spotsInView();
  $("#list").innerHTML = `<button class="back" data-go="#alle">← Alle Sportarten</button>` + renderSpotList(list, info.label, { here: state.here, selectedId: state.spot?.id, radius: state.radius });
  $("#count").textContent = `${list.length} ${list.length === 1 ? "Ort" : "Orte"}`;
  if (map) setAreaMarkers(map, list.map((p) => ({ id: p.id, type: "ort", name: p.name || "", center: [p.lon, p.lat], color: "#ff4d3d", size: p.courts ? p.courts * 4 : 4 })));
}
/** Kamera auf Standort und Orte im Umkreis (oder alle Orte der Sportart). */
function flySpots() {
  if (!map || state.view !== "spots") return;
  const list = spotsInView();
  const pts = list.map((p) => [p.lon, p.lat]);
  if (state.here) pts.push(state.here);
  if (!pts.length) return flyToRegion(map, state.region);
  const b = bbox(pts), pad = .02;
  flyToBbox(map, [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], { pitch: 45, maxZoom: 13.5 });
}
async function applySpotRoute(r) {
  if (!state.spots) { go("#ski"); return; }
  const was = { view: state.view, spotSport: state.spotSport, spot: state.spot?.id };
  // Gebiet schließen, falls von Ski & Co. hierher gewechselt
  if (state.area) closeArea();
  state.spotSport = r.view === "spots" ? r.spotSport : null;
  state.spot = r.spotId ? state.spots.places.find((p) => p.id === r.spotId && p.s === r.spotSport) || null : null;
  renderSportsBar();
  renderSpotsPanel();
  $("#legend").innerHTML = "";
  if (!state.spot) {
    $("#right").hidden = true;
    if (map) { setFocus(map, null); setGeo(map, null); }
    if (state.view === "spots" && (was.spotSport !== state.spotSport || was.spot)) {
      if (!state.here && !state.locating && !was.spotSport) toggleNear(); // beim ersten Öffnen einer Sportart Standort fragen
      flySpots();
    } else if (state.view === "catalog" && map && was.view === "spots") flyToRegion(map, state.region);
    return;
  }
  const info = SPORT_INFO.get(state.spotSport);
  $("#right").hidden = false;
  $("#detail").innerHTML = renderSpotDetail(state.spot, info.label, info.group, { here: state.here, stand: state.spots.stand });
  setSheet($("#right"), true);
  if (map) { const c = [state.spot.lon, state.spot.lat], d = .006; flyToBbox(map, [c[0] - d, c[1] - d * .7, c[0] + d, c[1] + d * .7], { pitch: 50, maxZoom: 15.5 }); }
  const key = "ort:" + state.spot.id;
  loadWeather({ id: key, center: [state.spot.lon, state.spot.lat], type: "ort" });
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
