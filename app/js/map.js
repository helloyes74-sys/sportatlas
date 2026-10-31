// Karte: dunkler Basisstil (OpenFreeMap-Vektorkacheln), 3D-Gelände (Terrarium-DEM), Schummerung,
// Datenebenen je Sportart. Farben folgen den amtlichen Pistenfarben; das UI-Rot bleibt dem UI.
/* global maplibregl */

export const COLORS = {
  piste: { novice: "#39d98a", easy: "#3d8bff", intermediate: "#ff4b4b", advanced: "#0a0a0a", expert: "#0a0a0a", freeride: "#ffb347", unknown: "#9aa7b0" },
  hikeDifficulty: { easy: "#3d8bff", medium: "#ff4b4b", hard: "#0a0a0a", unknown: "#9aa7b0" },
  hikeDuration: { short: "#39d98a", half: "#3d8bff", day: "#ff4b4b", long: "#0a0a0a", unknown: "#9aa7b0" },
  bikeGrade: { flat: "#39d98a", gentle: "#3d8bff", moderate: "#ffb347", steep: "#ff6a3d", verysteep: "#c8312c", unknown: "#9aa7b0" },
  xc: { classic: "#2ad1c9", skating: "#8ff0ea", both: "#2ad1c9", unknown: "#2ad1c9" },
  lift: "#e7edf2",
  accent: "#ff2a2a",
  sport: { ski: "#3d8bff", xc: "#2ad1c9", bike: "#ffb347", hike: "#39d98a" },
};

const matchExpr = (prop, table, fallback) => ["match", ["coalesce", ["get", prop], "unknown"], ...Object.entries(table).flatMap(([k, v]) => [k, v]), fallback];

/** Basisstil: monochromes Nachtrelief. Quellen: OpenFreeMap (Vektor), AWS Terrain Tiles (DEM). */
export function baseStyle() {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      omt: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: '© <a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
      dem: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 14, attribution: 'Gelände: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>' },
      // zweite Quelle für die Schummerung (MapLibre rät von einer gemeinsamen Quelle für Terrain und Hillshade ab)
      demShade: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 14 },
    },
    sky: { "sky-color": "#0a0d10", "horizon-color": "#0a0d10", "fog-color": "#0a0d10", "fog-ground-blend": .6, "horizon-fog-blend": .9, "sky-horizon-blend": 1, "atmosphere-blend": 0 },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0a0d10" } },
      { id: "hillshade", type: "hillshade", source: "demShade", paint: { "hillshade-exaggeration": .55, "hillshade-shadow-color": "#05070a", "hillshade-highlight-color": "#4a5661", "hillshade-accent-color": "#1a2229", "hillshade-illumination-direction": 325 } },
      { id: "landcover-ice", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", ["get", "class"], "ice"], paint: { "fill-color": "#cfd8df", "fill-opacity": .55 } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": "#0c1b26" } },
      { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": "#143040", "line-width": ["interpolate", ["linear"], ["zoom"], 8, .4, 14, 1.6] } },
      { id: "road-minor", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12.5, filter: ["match", ["get", "class"], ["minor", "service", "track", "path"], true, false], paint: { "line-color": "#1c252b", "line-width": ["interpolate", ["linear"], ["zoom"], 11, .3, 15, 1.2] } },
      { id: "road-major", type: "line", source: "omt", "source-layer": "transportation", filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false], paint: { "line-color": "#2a353d", "line-width": ["interpolate", ["linear"], ["zoom"], 7, .4, 14, 2.2] } },
      { id: "rail", type: "line", source: "omt", "source-layer": "transportation", filter: ["==", ["get", "class"], "rail"], paint: { "line-color": "#333f48", "line-width": .8, "line-dasharray": [3, 2] } },
      { id: "boundary-glow", type: "line", source: "omt", "source-layer": "boundary", filter: ["all", ["<=", ["get", "admin_level"], 4], ["!=", ["coalesce", ["get", "maritime"], 0], 1]], paint: { "line-color": "#ff2a2a", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 6, 12, 16], "line-blur": ["interpolate", ["linear"], ["zoom"], 6, 6, 12, 14], "line-opacity": .22 } },
      { id: "boundary", type: "line", source: "omt", "source-layer": "boundary", filter: ["<=", ["get", "admin_level"], 4], paint: { "line-color": "#ff2a2a", "line-opacity": .35, "line-width": ["match", ["get", "admin_level"], 2, 1.2, .6], "line-dasharray": [4, 3] } },
      { id: "peak", type: "symbol", source: "omt", "source-layer": "mountain_peak", minzoom: 12, filter: ["all", ["==", ["get", "class"], "peak"], [">=", ["coalesce", ["get", "ele"], 0], 1500]], layout: { "text-field": ["format", ["get", "name"], {}, "\n", {}, ["concat", ["to-string", ["get", "ele"]], " m"], { "font-scale": .85 }], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-anchor": "bottom", "text-offset": [0, -.4], "symbol-sort-key": ["-", 0, ["coalesce", ["get", "ele"], 0]] }, paint: { "text-color": "#c9d4dc", "text-halo-color": "#0a0d10", "text-halo-width": 1.2 } },
      { id: "peak-dot", type: "circle", source: "omt", "source-layer": "mountain_peak", minzoom: 12, filter: ["all", ["==", ["get", "class"], "peak"], [">=", ["coalesce", ["get", "ele"], 0], 1500]], paint: { "circle-radius": 1.8, "circle-color": "#c9d4dc" } },
      { id: "place", type: "symbol", source: "omt", "source-layer": "place", filter: ["match", ["get", "class"], ["city", "town", "village"], true, false], layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": ["match", ["get", "class"], "city", 14, "town", 12, 10.5], "text-letter-spacing": .06, "text-transform": ["match", ["get", "class"], "city", "uppercase", "none"] }, paint: { "text-color": "#9fb0bb", "text-halo-color": "#0a0d10", "text-halo-width": 1.4 } },
    ],
  };
}

export function createMap(container, region) {
  const map = new maplibregl.Map({
    container,
    style: baseStyle(),
    center: region.center,
    zoom: 8.3,
    pitch: 50,
    bearing: -12,
    maxPitch: 75,
    // Nicht die ganze Welt: weiter als Österreich-Übersicht lässt sich nicht herauszoomen (Hochformat braucht 6,5)
    minZoom: 6.5,
    renderWorldCopies: false,
    attributionControl: { compact: true },
    hash: false,
  });
  // Am Handy sitzt unten das Listenblatt, darum die Zoom-/Kompass-Knöpfe oben rechts
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), narrow() ? "top-right" : "bottom-right");
  softBounds(map, PAN_BOUNDS);
  map.on("load", () => {
    map.setTerrain({ source: "dem", exaggeration: 1.45 });
    addDataLayers(map);
    map.__ready = true; // ab hier dürfen Quellen gesetzt und Kamerafahrten gestartet werden
  });
  return map;
}

/** Österreich plus ein Stück der Nachbarländer: so weit darf der Kartenmittelpunkt wandern. */
export const PAN_BOUNDS = [9.2, 46.0, 17.4, 49.3];

/** Weiche Begrenzung statt maxBounds. MapLibres maxBounds hält den ganzen Bildausschnitt in der Box;
 *  im Hochformat am Handy ist der Bildschirm höher als die Box, dann lässt sich die Karte nur noch
 *  seitlich schieben. Hier darf stattdessen nur der Mittelpunkt die Box nicht verlassen – läuft er
 *  hinaus, gleitet die Karte nach dem Loslassen zurück. */
function softBounds(map, [w, s, e, n]) {
  let busy = false;
  map.on("moveend", () => {
    if (busy) return;
    const c = map.getCenter();
    const lng = Math.min(e, Math.max(w, c.lng)), lat = Math.min(n, Math.max(s, c.lat));
    if (lng === c.lng && lat === c.lat) return;
    busy = true;
    map.easeTo({ center: [lng, lat], duration: 450 });
    map.once("moveend", () => { busy = false; });
  });
}

/** Leere Quellen + alle Datenebenen anlegen; Daten kommen später per setData. */
function addDataLayers(map) {
  const empty = { type: "FeatureCollection", features: [] };
  map.addSource("areas", { type: "geojson", data: empty });
  map.addSource("geo", { type: "geojson", data: empty, promoteId: "osm_id" });
  map.addSource("sel", { type: "geojson", data: empty });
  map.addSource("focus", { type: "geojson", data: empty });
  // Umgebung des offenen Gebiets abdunkeln, Gebiet selbst mit feinem Rahmen fassen (HUD-Look)
  map.addLayer({ id: "focus-dim", type: "fill", source: "focus", filter: ["==", ["get", "part"], "dim"], paint: { "fill-color": "#05070a", "fill-opacity": .5 } });
  map.addLayer({ id: "focus-frame-glow", type: "line", source: "focus", filter: ["==", ["get", "part"], "frame"], paint: { "line-color": COLORS.accent, "line-width": 8, "line-blur": 8, "line-opacity": .35 } });
  map.addLayer({ id: "focus-frame", type: "line", source: "focus", filter: ["==", ["get", "part"], "frame"], paint: { "line-color": COLORS.accent, "line-width": 1, "line-opacity": .9, "line-dasharray": [6, 3] } });
  map.addLayer({ id: "focus-corner", type: "line", source: "focus", filter: ["==", ["get", "part"], "corner"], paint: { "line-color": COLORS.accent, "line-width": 2.5 } });

  // Pistenflächen
  map.addLayer({ id: "piste-area", type: "fill", source: "geo", filter: ["all", ["==", ["get", "kind"], "piste"], ["==", ["geometry-type"], "Polygon"]], paint: { "fill-color": matchExpr("difficulty", COLORS.piste, "#9aa7b0"), "fill-opacity": .22 } });
  // Pisten: Kontur (schwarz bekommt Weiß), dann Linie
  const lineFilter = (kind) => ["all", ["==", ["get", "kind"], kind], ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false]];
  map.addLayer({ id: "piste-casing", type: "line", source: "geo", filter: lineFilter("piste"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "difficulty"], ["advanced", "expert"], "#f2f5f7", "#05080b"], "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 15, 8], "line-opacity": .85 } });
  // line-dasharray ist nicht datengetrieben, darum eigene Ebenen für gestrichelte Varianten
  const notFreeride = ["all", lineFilter("piste"), ["!=", ["get", "difficulty"], "freeride"]];
  const freeride = ["all", lineFilter("piste"), ["==", ["get", "difficulty"], "freeride"]];
  map.addLayer({ id: "piste-line", type: "line", source: "geo", filter: notFreeride, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": matchExpr("difficulty", COLORS.piste, "#9aa7b0"), "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 15, 5] } });
  map.addLayer({ id: "piste-route", type: "line", source: "geo", filter: freeride, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COLORS.piste.freeride, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 15, 4.5], "line-dasharray": [2, 1.5] } });
  // Loipen: klassisch dunkleres Türkis, Skating helleres
  map.addLayer({ id: "xc-line", type: "line", source: "geo", filter: lineFilter("xc"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["coalesce", ["get", "piste:grooming"], ""], "skating", COLORS.xc.skating, "classic+skating", COLORS.xc.both, "classic;skating", COLORS.xc.both, COLORS.xc.classic], "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.8, 15, 4], "line-dasharray": [3, 1.2] } });
  // Skitouren / Rodelbahnen dezent
  map.addLayer({ id: "other-line", type: "line", source: "geo", filter: ["any", lineFilter("skitour"), lineFilter("sled")], paint: { "line-color": "#9aa7b0", "line-width": 1.2, "line-dasharray": [1, 2], "line-opacity": .7 } });
  // Rad: Farbe nach steilstem Anstieg
  map.addLayer({ id: "bike-casing", type: "line", source: "geo", filter: lineFilter("bike"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#05080b", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 7], "line-opacity": .85 } });
  map.addLayer({ id: "bike-line", type: "line", source: "geo", filter: lineFilter("bike"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": matchExpr("grade_class", COLORS.bikeGrade, "#ffb347"), "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.6, 14, 4] } });
  // Wandern: Farbe nach Schwierigkeit (Standard) oder Gehzeit
  map.addLayer({ id: "hike-casing", type: "line", source: "geo", filter: lineFilter("hike"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "difficulty"], "hard", "#f2f5f7", "#05080b"], "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 7], "line-opacity": .85 } });
  map.addLayer({ id: "hike-line", type: "line", source: "geo", filter: lineFilter("hike"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": matchExpr("difficulty", COLORS.hikeDifficulty, "#39d98a"), "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.6, 14, 4] } });
  // Lifte: Kabinenbahnen durchgezogen, Sessel gestrichelt, Schlepper gepunktet
  const CABIN = ["gondola", "cable_car", "mixed_lift", "funicular"], DRAG = ["drag_lift", "platter", "t-bar", "j-bar", "rope_tow", "magic_carpet"];
  const liftType = (list, inList) => ["all", lineFilter("lift"), ["match", ["coalesce", ["get", "aerialway"], ""], list, inList, !inList]];
  map.addLayer({ id: "lift-line", type: "line", source: "geo", filter: liftType(CABIN, true), paint: { "line-color": COLORS.lift, "line-width": 2.2, "line-opacity": .95 } });
  map.addLayer({ id: "lift-chair", type: "line", source: "geo", filter: ["all", liftType(CABIN, false), liftType(DRAG, false)], paint: { "line-color": COLORS.lift, "line-width": 1.4, "line-dasharray": [2, 1.2], "line-opacity": .95 } });
  map.addLayer({ id: "lift-drag", type: "line", source: "geo", filter: liftType(DRAG, true), paint: { "line-color": "#aab6c0", "line-width": 1.2, "line-dasharray": [.6, 1.2], "line-opacity": .95 } });
  map.addLayer({ id: "lift-pylon", type: "symbol", source: "geo", filter: lineFilter("lift"), layout: { "symbol-placement": "line", "symbol-spacing": 60, "icon-image": "pylon", "icon-size": 1, "icon-allow-overlap": true }, paint: {} });
  // Beschriftung entlang der Linien
  map.addLayer({ id: "geo-label", type: "symbol", source: "geo", minzoom: 12, filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false], layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "display_name"], ["get", "name"], ["get", "ref"], ""], "text-font": ["Noto Sans Regular"], "text-size": 10.5, "text-letter-spacing": .04, "symbol-spacing": 400 }, paint: { "text-color": "#e9eef2", "text-halo-color": "#0a0d10", "text-halo-width": 1.5 } });
  // Auswahl: Glühen im UI-Rot
  map.addLayer({ id: "sel-glow", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COLORS.accent, "line-width": 14, "line-opacity": .28, "line-blur": 6 } });
  map.addLayer({ id: "sel-line", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 1.2, "line-opacity": .9 } });
  // Gebiete in der Übersicht: Marker (Größe nach km) + Namen
  map.addLayer({ id: "areas-ring", type: "circle", source: "areas", paint: { "circle-radius": ["+", 6, ["*", 1.2, ["sqrt", ["coalesce", ["get", "size"], 4]]]], "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": COLORS.accent, "circle-stroke-width": 1.2, "circle-stroke-opacity": .9 } });
  map.addLayer({ id: "areas-dot", type: "circle", source: "areas", paint: { "circle-radius": 2.2, "circle-color": ["get", "color"] } });
  map.addLayer({ id: "areas-label", type: "symbol", source: "areas", layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-anchor": "left", "text-offset": [1.4, 0], "text-letter-spacing": .04, "text-optional": true }, paint: { "text-color": "#e9eef2", "text-halo-color": "#0a0d10", "text-halo-width": 1.5 } });

  // kleines Stützen-Symbol für Lifte
  const c = document.createElement("canvas"); c.width = c.height = 8;
  const g = c.getContext("2d"); g.fillStyle = "#aab6c0"; g.fillRect(3, 0, 2, 8);
  map.addImage("pylon", g.getImageData(0, 0, 8, 8), { pixelRatio: 1 });
}

/** Übersichtsmarker für die Gebiete einer Sportart. */
/** Eigener Standort als pulsierender Punkt. */
export function setHere(map, lngLat) {
  whenReady(map, () => {
    if (!map.getSource("here")) {
      map.addSource("here", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "here-halo", type: "circle", source: "here", paint: { "circle-radius": 14, "circle-color": COLORS.accent, "circle-opacity": .18 } });
      map.addLayer({ id: "here-dot", type: "circle", source: "here", paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": COLORS.accent, "circle-stroke-width": 2 } });
    }
    map.getSource("here").setData({ type: "FeatureCollection", features: lngLat ? [{ type: "Feature", geometry: { type: "Point", coordinates: lngLat }, properties: {} }] : [] });
  });
}

export function setAreaMarkers(map, areas) {
  const fc = { type: "FeatureCollection", features: areas.map((a) => ({ type: "Feature", properties: { id: a.id, type: a.type, name: a.name, color: a.color || COLORS.sport[a.type], size: a.size ?? (a.pistes_km?.total || a.loipen_km?.total || a.length_km || 6) }, geometry: { type: "Point", coordinates: a.center } })) };
  whenReady(map, () => map.getSource("areas").setData(fc));
}

export function setGeo(map, fc) {
  whenReady(map, () => map.getSource("geo").setData(fc || { type: "FeatureCollection", features: [] }));
}

export function setSelection(map, feature) {
  whenReady(map, () => map.getSource("sel").setData(feature ? { type: "FeatureCollection", features: [feature] } : { type: "FeatureCollection", features: [] }));
}

/** Fokus auf ein Gebiet: alles außerhalb der (leicht erweiterten) Bounding-Box abdunkeln, Rahmen mit Eckwinkeln. */
export function setFocus(map, bbox) {
  whenReady(map, () => {
    if (!bbox) { map.getSource("focus").setData({ type: "FeatureCollection", features: [] }); return; }
    const dx = (bbox[2] - bbox[0]) * .06, dy = (bbox[3] - bbox[1]) * .06;
    const [w, s, e, n] = [bbox[0] - dx, bbox[1] - dy, bbox[2] + dx, bbox[3] + dy];
    const ring = [[w, s], [e, s], [e, n], [w, n], [w, s]];
    const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    const cx = (e - w) * .12, cy = (n - s) * .12;
    const corners = [
      [[w, s + cy], [w, s], [w + cx, s]], [[e - cx, s], [e, s], [e, s + cy]],
      [[e, n - cy], [e, n], [e - cx, n]], [[w + cx, n], [w, n], [w, n - cy]],
    ];
    map.getSource("focus").setData({ type: "FeatureCollection", features: [
      { type: "Feature", properties: { part: "dim" }, geometry: { type: "Polygon", coordinates: [world, ring] } },
      { type: "Feature", properties: { part: "frame" }, geometry: { type: "LineString", coordinates: ring } },
      ...corners.map((c) => ({ type: "Feature", properties: { part: "corner" }, geometry: { type: "LineString", coordinates: c } })),
    ] });
  });
}

/** Kamerafahrt zu einem Sektor (aus sectors.js). */
export function flyToSector(map, sector) {
  stopTour(map);
  // Padding legt den Sektor in die Mitte des freien Ausschnitts (neben den Leisten, über dem Blatt am Handy)
  whenReady(map, () => flyGrounded(map, { center: sector.center, zoom: sector.zoom, bearing: sector.bearing, padding: panelPadding() }, { pitch: sector.pitch ?? 60, duration: 2200 }));
}

/** Rundflug: langsame Drehung um den aktuellen Mittelpunkt, endet bei jeder Nutzer-Eingabe. */
let tourFrame = null;
export function startTour(map, onStop) {
  stopTour(map);
  let last = performance.now();
  const stopOnInput = () => stopTour(map);
  ["mousedown", "wheel", "touchstart", "keydown"].forEach((ev) => map.getCanvas().addEventListener(ev, stopOnInput, { once: true, passive: true }));
  const step = (now) => {
    const dt = Math.min(100, now - last); last = now;
    map.setBearing(map.getBearing() + dt * 0.006); // ~ 6° pro Sekunde, eine Runde in einer Minute
    tourFrame = requestAnimationFrame(step);
  };
  tourFrame = requestAnimationFrame(step);
  map.__tourStop = () => { ["mousedown", "wheel", "touchstart", "keydown"].forEach((ev) => map.getCanvas().removeEventListener(ev, stopOnInput)); onStop?.(); };
}
export function stopTour(map) {
  if (tourFrame) { cancelAnimationFrame(tourFrame); tourFrame = null; }
  if (map.__tourStop) { const f = map.__tourStop; map.__tourStop = null; f(); }
}
export const tourRunning = () => tourFrame !== null;

/** Wander-Färbung umschalten: "difficulty" | "duration". */
export function setHikeColorMode(map, mode) {
  whenReady(map, () => {
    map.setPaintProperty("hike-line", "line-color", mode === "duration" ? matchExpr("duration_class", COLORS.hikeDuration, "#39d98a") : matchExpr("difficulty", COLORS.hikeDifficulty, "#39d98a"));
    map.setPaintProperty("hike-casing", "line-color", mode === "duration" ? ["match", ["get", "duration_class"], "long", "#f2f5f7", "#05080b"] : ["match", ["get", "difficulty"], "hard", "#f2f5f7", "#05080b"]);
  });
}

/** Schmaler Bildschirm (Handy): Listen liegen als Blätter unten statt als Seitenleisten. */
export const narrow = () => window.matchMedia("(max-width: 860px)").matches;
const visible = (el) => el && !el.hidden && getComputedStyle(el).display !== "none";
/** Zielhöhe eines Blatts in px aus seiner CSS-Variable --sheet-h ("44vh" oder "66px"); der
 *  animierte max-height-Wert wäre mitten im Auf-/Zuklappen falsch. */
function sheetHeight(el) {
  if (!el) return 0;
  const v = getComputedStyle(el).getPropertyValue("--sheet-h").trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return el.getBoundingClientRect().height;
  return v.endsWith("vh") ? (n / 100) * window.innerHeight : n;
}
/** Freier Kartenausschnitt zwischen den Bedienelementen, die gerade sichtbar sind. */
function panelPadding() {
  if (narrow()) {
    // unten das sichtbare Blatt (eingeklappt nur sein Kopf), oben Titel, Sportarten und Werkzeuge
    const sheet = [...document.querySelectorAll(".panel")].find(visible);
    return { top: 165, bottom: Math.min(window.innerHeight * .6, sheetHeight(sheet) + 14), left: 16, right: 16 };
  }
  const vis = (id) => { const el = document.getElementById(id); return visible(el) ? el.offsetWidth + 40 : 40; };
  return { top: 80, bottom: 110, left: vis("left"), right: vis("right") };
}

/** Geländehöhe unter einem Punkt (mit Überhöhung), 0 solange die Kachel fehlt. */
const groundAt = (map, lngLat) => (map.queryTerrainElevation ? map.queryTerrainElevation(lngLat) : null) || 0;

/** Kamerafahrt mit 3D-Gelände: Ziel auf Bodenhöhe setzen, sonst landet die Kamera im Berg (schwarzes Bild).
 *  Nach der Fahrt noch einmal nachmessen, weil die Geländekachel am Ziel anfangs oft noch fehlt. */
function flyGrounded(map, cam, extra) {
  map.flyTo({ ...cam, ...extra, elevation: groundAt(map, cam.center), essential: true });
  // MapLibre 5.6 übernimmt `elevation` nur bei jumpTo, nicht bei flyTo/easeTo – darum am Ende nachsetzen
  const fix = () => {
    const e = groundAt(map, map.getCenter());
    if (e && Math.abs(e - (map.getCameraTargetElevation?.() || 0)) > 40) map.jumpTo({ elevation: e });
  };
  // Am Ziel ist die Geländekachel oft noch nicht da: dann erst nach dem Laden (idle) nachmessen
  map.once("moveend", () => { if (groundAt(map, map.getCenter())) fix(); else map.once("idle", fix); });
}

/** Kamera, die eine Bounding-Box in den freien Ausschnitt legt. Der verdeckte Rand wird als
 *  Karten-Padding mitgeführt (nicht als Pixelversatz): so bleibt der Kartenmittelpunkt auf dem Ziel,
 *  die Bodenhöhe stimmt auch im Gelände, und der Rundflug dreht sich um das Gebiet. MapLibre rechnet
 *  cameraForBounds mit dem gerade gesetzten Padding, darum wird es für die Berechnung kurz angelegt
 *  und dann vom Flug selbst animiert. */
function cameraFor(map, bbox, { bearing, maxZoom } = {}) {
  const padding = panelPadding();
  const keep = map.getPadding();
  map.setPadding(padding);
  const cam = map.cameraForBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { bearing, maxZoom });
  map.setPadding(keep);
  return cam ? { center: cam.center, zoom: cam.zoom, bearing: cam.bearing ?? bearing, padding } : null;
}

export function flyToBbox(map, bbox, { pitch = 58, bearing = -18, maxZoom = 14.5 } = {}) {
  whenReady(map, () => {
    const cam = cameraFor(map, bbox, { bearing, maxZoom });
    if (cam) flyGrounded(map, cam, { pitch, duration: 1800 });
  });
}

export function flyToRegion(map, region) {
  whenReady(map, () => {
    const cam = cameraFor(map, region.bbox, { bearing: -12 });
    if (cam) flyGrounded(map, cam, { pitch: 45, duration: 1600 });
  });
}

export const INTERACTIVE_LAYERS = ["piste-line", "piste-route", "piste-area", "xc-line", "bike-line", "hike-line", "lift-line", "lift-chair", "lift-drag", "areas-ring", "areas-label"];

/** Führt fn aus, sobald Stil und Datenebenen angelegt sind. isStyleLoaded() ist während des
 *  Kachelladens zeitweise false, darum ein eigenes Flag; "load" feuert nur einmal. */
function whenReady(map, fn) {
  if (map.__ready) fn();
  else map.once("load", () => fn());
}
