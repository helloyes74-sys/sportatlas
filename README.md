# Sportatlas Kärnten

Skigebiete, Loipen, Radrouten und Wanderwege eines Bundeslandes auf einer dunklen 3D-Reliefkarte.
Pisten in den amtlichen Farben, Radwege mit Steigungsprofil, Wanderwege mit Gehzeit, Wetter live.

## Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20. Keine weiteren Installationen nötig.

```bash
npm run dev
```

Dann <http://localhost:5173> öffnen. Am Mac geht es auch per Doppelklick auf „Sportatlas starten.command“ und „Daten laden.command“. Die App zeigt sofort alle 73 Gebiete und Routen mit Stammdaten (Pistenkilometer,
Preise, Saison, Höhen; bei Routen Länge, Gehzeit, Höhenmeter, Start und Ziel aus der verlinkten Tourenbeschreibung). Die Linien auf der Karte (Pisten, Lifte, Routen) kommen aus OpenStreetMap und werden
einmalig geladen:

```bash
npm run fetch -- gerlitzen        # Pisten, Lifte, Loipen der Gerlitzen aus OpenStreetMap
npm run elevation -- gerlitzen    # Höhen dazu (Geländekacheln), Profile und Gehzeiten berechnen
```

Danach Seite neu laden, Gerlitzen öffnen, Piste antippen. Für alle Gebiete auf einmal: `npm run data`
(rechnet mit Wartepausen, dauert einige Minuten; bereits geladene Gebiete werden 7 Tage lang übersprungen, `--force` lädt neu).

## Auf dem Handy

Den Rechner und das Handy ins gleiche WLAN, `npm run dev` starten und am Handy `http://<IP-des-Rechners>:5173`
öffnen. Über „Zum Startbildschirm“ wird die Seite als App installiert (PWA, funktioniert danach auch mit
schlechtem Netz; Kartenkacheln brauchen weiterhin Internet). Dauerhafte Adresse: **https://helloyes74-sys.github.io/sportatlas-/** – GitHub Pages veröffentlicht den
Ordner `app/` bei jedem Push auf `main` automatisch (`.github/workflows/pages.yml`).

## Datenquellen

| Daten | Quelle | Lizenz / Bedingung |
| --- | --- | --- |
| Pisten, Lifte, Loipen, Rad- und Wanderrouten | OpenStreetMap über Overpass | ODbL, Namensnennung in der App |
| Gelände (3D) | AWS Terrain Tiles (Terrarium) | frei, Hinweis in der Karte |
| Karte (Orte, Gewässer, Straßen) | OpenFreeMap / OpenMapTiles | frei, Hinweis in der Karte |
| Höhen für Profile | AWS Terrain Tiles (dieselben wie das 3D-Gelände); Alternative Open-Meteo Elevation API mit `--open-meteo` | frei / gratis nicht kommerziell |
| Wetter | Open-Meteo Forecast API | gratis nicht kommerziell, „Weather data by Open-Meteo.com“ |
| Stammdaten der Gebiete | je Gebiet in `sources` verlinkt (HDsports, schneehoehen.de, kaernten.at, …) | per Hand gepflegt |

Offene Lifte in Echtzeit gibt es nicht als freie Schnittstelle; jedes Skigebiet verlinkt dafür die Betreiberseite.

## Neues Gebiet anlegen

1. Datei `app/data/areas/<ski|xc|bike|hike>/<id>.json` anlegen (Vorlage: `areas/ski/gerlitzen.json`).
2. Eintrag in `app/data/regions/kaernten.json` unter `areas` ergänzen.
3. `npm run fetch -- <id>` und `npm run elevation -- <id>`.

Für Routen (Rad, Wandern) gilt: Tagestouren aus Tourenführern (Bergwelten, Tourismusverbände, climbfinder,
Kärnten Werbung Slow Trails) mit Quelle. Den Verlauf holt das Skript aus OSM, gesteuert über `osm` in der
Gebietsdatei: `relation_ids` (aus `Routen-Check.txt`, am zuverlässigsten), `way_name`/`way_ref` für Straßen
und Steige ohne Routen-Relation (werden zu einer Linie verschmolzen, Anstiege bergauf gelesen) oder
`relation_name` (Regex). `clip: true` schneidet eine lange Relation an der Bounding-Box ab, z. B. für eine
Etappe. „Routen prüfen.command“ (`node scripts/probe-routes.mjs`) listet je Route die Kandidaten aus OSM.

## Entwicklung

```bash
npm test          # Unit-Tests
```

Alles Weitere steht in `CLAUDE.md` (Aufbau, Datenregeln, Stil, nächste Schritte).

Stand: 31.10.2026 – Rad- und Wanderrouten als Tagestouren (30 Wanderungen, 15 Radtouren), Filterchips, Sortierung nach Standort, GPX-Export und Teilen-Link; Stammdaten Ski Saison 2026/27.
