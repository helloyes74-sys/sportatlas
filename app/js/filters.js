// Filterchips je Sportart und Sortierung nach Entfernung. Reine Funktionen über den Gebietslisten;
// der Zustand (gesetzte Filter, Standort) liegt in main.js.

import { haversine } from "./geo.js";
import { seasonState } from "./data.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Filtergruppen: id → { label, options: [{ id, label, test(area) }] }. Innerhalb einer Gruppe gilt ODER, zwischen Gruppen UND. */
export function filterGroups(sport, areas) {
  const g = [];
  const kinds = [...new Set(areas.filter((a) => a.type === sport).map((a) => a.kind).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
  if (sport === "ski") {
    g.push({ id: "km", label: "Pisten", options: [
      ["klein", "bis 20 km", (a) => (a.pistes_km?.total || 0) <= 20],
      ["mittel", "20–50 km", (a) => (a.pistes_km?.total || 0) > 20 && (a.pistes_km?.total || 0) <= 50],
      ["gross", "über 50 km", (a) => (a.pistes_km?.total || 0) > 50],
    ] });
    g.push({ id: "preis", label: "Tageskarte", options: [
      ["guenstig", "bis € 55", (a) => a.prices?.day_adult != null && a.prices.day_adult <= 55],
      ["mittel", "€ 55–70", (a) => a.prices?.day_adult > 55 && a.prices.day_adult <= 70],
      ["teuer", "über € 70", (a) => a.prices?.day_adult > 70],
    ] });
    g.push({ id: "saison", label: "Saison", options: [["offen", "jetzt offen", (a) => seasonState(a)?.cls === "on"]] });
  }
  if (sport === "hike") {
    g.push({ id: "niveau", label: "Niveau", options: [
      ["leicht", "leicht", (a) => a.difficulty === 1], ["mittel", "mittel", (a) => a.difficulty === 2], ["schwer", "anspruchsvoll+", (a) => a.difficulty >= 3],
    ] });
    g.push({ id: "dauer", label: "Gehzeit", options: [
      ["kurz", "bis 2 h", (a) => a.duration_min != null && a.duration_min <= 120],
      ["halb", "2–4 h", (a) => a.duration_min > 120 && a.duration_min <= 240],
      ["tag", "über 4 h", (a) => a.duration_min > 240],
    ] });
    g.push({ id: "hm", label: "Aufstieg", options: [
      ["flach", "bis 300 m", (a) => (a.ascent_m || 0) <= 300], ["mittel", "300–800 m", (a) => a.ascent_m > 300 && a.ascent_m <= 800], ["viel", "über 800 m", (a) => a.ascent_m > 800],
    ] });
  }
  if (sport === "bike") {
    g.push({ id: "laenge", label: "Länge", options: [
      ["kurz", "bis 20 km", (a) => (a.length_km || 0) <= 20], ["mittel", "20–50 km", (a) => a.length_km > 20 && a.length_km <= 50], ["lang", "über 50 km", (a) => a.length_km > 50],
    ] });
    g.push({ id: "hm", label: "Höhenmeter", options: [
      ["flach", "bis 300 m", (a) => (a.ascent_m || 0) <= 300], ["mittel", "300–1000 m", (a) => a.ascent_m > 300 && a.ascent_m <= 1000], ["viel", "über 1000 m", (a) => a.ascent_m > 1000],
    ] });
  }
  if ((sport === "hike" || sport === "bike") && kinds.length > 1) {
    g.push({ id: "art", label: "Art", options: kinds.map((k) => [k, k, (a) => a.kind === k]) });
  }
  return g.map((grp) => ({ ...grp, options: grp.options.map(([id, label, test]) => ({ id, label, test })) }));
}

/** Liste nach gesetzten Filtern einschränken. active: { gruppe: Set(optionIds) } */
export function applyFilters(areas, groups, active) {
  return areas.filter((a) => groups.every((grp) => {
    const sel = active[grp.id];
    if (!sel || !sel.size) return true;
    return grp.options.some((o) => sel.has(o.id) && o.test(a));
  }));
}

/** Entfernung Luftlinie in km vom Standort zum Gebietsmittelpunkt. */
export const distanceKm = (here, area) => (here ? haversine(here, area.center) / 1000 : null);

export function renderFilters(groups, active, { here, near, locating } = {}) {
  const chip = (grp, o) => `<button class="chip" data-filter="${grp.id}" data-option="${esc(o.id)}" aria-pressed="${!!active[grp.id]?.has(o.id)}">${esc(o.label)}</button>`;
  const nearLabel = locating ? "Standort wird ermittelt …" : near ? "Nach Entfernung" : "In meiner Nähe";
  const count = Object.values(active).reduce((s, set) => s + (set?.size || 0), 0);
  return `<div class="chiprow">
      <button class="chip near" id="btnNear" aria-pressed="${!!near}" ${locating ? "disabled" : ""} title="Standort abfragen und Liste nach Entfernung sortieren">${nearLabel}</button>
      ${count ? `<button class="chip clear" id="btnClearFilters" title="Alle Filter zurücksetzen">Filter löschen (${count})</button>` : ""}
    </div>
    ${groups.map((grp) => `<div class="chiprow"><span class="chiplabel">${esc(grp.label)}</span>${grp.options.map((o) => chip(grp, o)).join("")}</div>`).join("")}`;
}
