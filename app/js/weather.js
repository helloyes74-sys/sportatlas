// Wetter live von Open-Meteo (kostenlos für nicht kommerzielle Nutzung, kein Schlüssel).
// Pflicht laut Lizenz: Hinweis "Weather data by Open-Meteo.com" neben den Daten.

const CODES = {
  0: "klar", 1: "meist klar", 2: "teils bewölkt", 3: "bedeckt", 45: "Nebel", 48: "Reifnebel",
  51: "Niesel", 53: "Niesel", 55: "Niesel", 56: "gefr. Niesel", 57: "gefr. Niesel",
  61: "Regen", 63: "Regen", 65: "starker Regen", 66: "gefr. Regen", 67: "gefr. Regen",
  71: "Schnee", 73: "Schnee", 75: "starker Schnee", 77: "Schneegriesel",
  80: "Schauer", 81: "Schauer", 82: "starke Schauer", 85: "Schneeschauer", 86: "Schneeschauer",
  95: "Gewitter", 96: "Gewitter, Hagel", 99: "Gewitter, Hagel",
};
export const describe = (code) => CODES[code] || "–";

const mem = new Map();

/**
 * 7-Tage-Vorhersage für einen Punkt. `elevation` (m) lässt Open-Meteo die Temperatur auf die
 * Höhe umrechnen, bei Skigebieten also am Berg statt im Tal.
 */
export async function forecast([lon, lat], elevation) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${elevation || ""}`;
  if (mem.has(key)) return mem.get(key);
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", lat.toFixed(4));
  u.searchParams.set("longitude", lon.toFixed(4));
  if (elevation) u.searchParams.set("elevation", String(Math.round(elevation)));
  u.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,precipitation_sum,wind_speed_10m_max,sunshine_duration");
  u.searchParams.set("timezone", "Europe/Vienna");
  u.searchParams.set("forecast_days", "7");
  const p = fetch(u).then((r) => { if (!r.ok) throw new Error(`Open-Meteo ${r.status}`); return r.json(); })
    .then((j) => j.daily.time.map((t, i) => ({
      date: t, code: j.daily.weather_code[i], tmax: j.daily.temperature_2m_max[i], tmin: j.daily.temperature_2m_min[i],
      snow_cm: j.daily.snowfall_sum[i], rain_mm: j.daily.precipitation_sum[i], wind: j.daily.wind_speed_10m_max[i], sun_h: (j.daily.sunshine_duration?.[i] || 0) / 3600,
    })));
  mem.set(key, p);
  p.catch(() => mem.delete(key));
  return p;
}

export const weekday = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("de-AT", { weekday: "short" });
