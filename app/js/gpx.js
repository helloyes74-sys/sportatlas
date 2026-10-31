// GPX-Export einer Route oder eines Gebiets aus den geladenen OSM-Linien (für Garmin, Komoot, Apple Karten).

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** GeoJSON (Linien mit optionaler Höhe) → GPX 1.1. Ein Track je Linie, Teilstücke als Segmente. */
export function toGPX(geo, area, { only } = {}) {
  const feats = (geo?.features || []).filter((f) => (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString") && (!only || String(f.properties.osm_id) === String(only)));
  const tracks = feats.map((f) => {
    const parts = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const name = f.properties.display_name || f.properties.name || area.name;
    const segs = parts.map((p) => `    <trkseg>\n${p.map((c) => `      <trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}">${Number.isFinite(c[2]) ? `<ele>${Math.round(c[2])}</ele>` : ""}</trkpt>`).join("\n")}\n    </trkseg>`).join("\n");
    return `  <trk>\n    <name>${esc(name)}</name>\n    <type>${esc(f.properties.kind || area.type)}</type>\n${segs}\n  </trk>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Sportatlas Kärnten" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(area.name)}</name>
    <desc>${esc(area.kind || "")} – Linien © OpenStreetMap-Mitwirkende (ODbL), Höhen aus Geländekacheln</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
${tracks.join("\n")}
</gpx>
`;
}

/** Datei im Browser zum Herunterladen anbieten. */
export function downloadText(filename, text, mime = "application/gpx+xml") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
