# Sportatlas – Anleitung für Claude Code

Sportatlas zeigt alle Outdoor-Sportangebote eines Bundeslandes (Start: Kärnten) auf einer dunklen
3D-Reliefkarte: Skigebiete mit Pisten nach Schwierigkeit, Loipen, Radrouten mit Steigungsprofil,
Wanderwege mit Gehzeit. Privates Projekt von Thomas, zunächst fürs eigene Handy.

## Befehle

```
npm run dev                       # http://localhost:5173 (statischer Server ohne Abhängigkeiten)
npm test                          # Unit-Tests (node:test), müssen vor jedem Commit grün sein
npm run fetch -- gerlitzen        # OSM-Linien eines Gebiets laden (Overpass) → app/data/geo/
npm run elevation -- gerlitzen    # Höhen anreichern (Geländekacheln) + Profile berechnen
node scripts/probe-routes.mjs     # OSM-Routen-Relationen je Rad-/Wanderroute auflisten → Routen-Check.txt
npm run data                      # beides für alle Gebiete (dauert, Fair-Use-Pausen eingebaut)
```

Es gibt keinen Build-Schritt und keine npm-Abhängigkeiten. Die App ist reines ES-Modul-JavaScript,
MapLibre GL kommt per `<script>` von unpkg (Version in `app/index.html` gepinnt). Node ≥ 20.

## Aufbau

```
app/                   die PWA (statisch ausliefern, fertig)
  index.html           Hülle, lädt MapLibre und js/main.js
  css/app.css          Stil-Tokens oben in :root (Nachtkarte, Akzent --accent)
  js/main.js           Zustand, Ereignisse, Hash-Routing (#ski, #ski/gerlitzen)
  js/map.js            Basisstil, Gelände, Datenebenen, Farben (COLORS)
  js/ui.js             Render-Funktionen (HTML-Strings) für Listen und Detailblatt
  js/profile.js        Gefälle-/Steigungsprofil als Canvas-Balken
  js/weather.js        Open-Meteo-Vorhersage
  js/data.js           Laden von Index, Gebieten, GeoJSON; Formatierer
  js/geo.js            Geo-Mathematik, geteilt mit den Skripten (Länge, Profil, Gehzeit, Klassen)
  data/regions/        index.json + eine Datei je Bundesland (Liste der Gebiete)
  data/areas/<typ>/    eine Stammdaten-Datei je Gebiet (ski | xc | bike | hike)
  data/geo/<typ>/      generiertes GeoJSON je Gebiet + index.json (schreiben die Skripte)
  data/cache/          Höhen-Cache (nicht einchecken)
scripts/               fetch-osm.mjs, add-elevation.mjs, probe-routes.mjs, serve.mjs, lib/overpass.mjs, lib/lines.mjs, lib/terrain.mjs
*.command              Doppelklick-Starter für den Mac (Server, Datenimport, Routen-Check), node-env.sh findet Node
tests/                 node:test
```

## Datenregeln

- **Eine Datei pro Bundesland, eine pro Gebiet.** Ein neues Gebiet = neue Datei unter `app/data/areas/<typ>/`
  plus ein Eintrag in `app/data/regions/<land>.json`. Ein neues Bundesland = neue Region-Datei plus Eintrag in
  `regions/index.json`.
- **Stammdaten nur mit Quelle.** Jede Zahl (Pistenkm, Preis, Saison, Höhen) hat einen Eintrag in `sources`
  und ein `updated`-Datum. Nichts schätzen; fehlt ein Wert, bleibt das Feld weg. `center_note: "ungefähr"`
  markiert handgesetzte Koordinaten, die noch geprüft gehören.
- **Linien kommen aus OpenStreetMap** (ODbL, Namensnennung bleibt in der App). Verlauf, Schwierigkeit
  (`piste:difficulty`, `sac_scale`), Lifttyp (`aerialway`) nie von Hand nachzeichnen.
- **Rad- und Wanderrouten sind Tagestouren aus Tourenführern** (Bergwelten, Tourismusverbände wie
  woerthersee.com/visitvillach.at/nassfeld.at, climbfinder für Rennrad-Anstiege, Kärnten Werbung für Slow
  Trails), keine Weitwanderwege mit hunderten Kilometern. Jede Route trägt `length_km`, nach Quelle
  `duration_min`, `ascent_m`, `descent_m`, `top_m`, `avg_grade`/`max_grade`, `start`, `end` bzw.
  `round_trip`, `kind` (Gipfelwanderung, Klammwanderung, Slow Trail, Seenrunde, Radweg-Etappe,
  Rennrad-Anstieg, Flow Trail …) und `difficulty` 1–5 (leicht, mittel, anspruchsvoll, schwer, sehr schwer;
  Wandern nach SAC: T1→1, T2→2, T3→3, T4→4).
- **Routenverlauf aus OSM** über `osm` in der Gebietsdatei, Reihenfolge: `relation_ids` (sicherste Wahl, aus
  `Routen-Check.txt`) › `way_name`/`way_ref` (Straßen und Steige ohne Routen-Relation, z. B. Passstraßen;
  werden zu einer Linie verschmolzen, Anstiege bergauf gelesen) › `relation_name` (Regex). `clip: true`
  schneidet eine lange Relation an der Bounding-Box ab (Etappen). `none: true` heißt: in OSM nicht erfasst,
  Skript fragt nicht mehr nach (Kennzahlen bleiben, Karte zeigt den Startbereich). `Routen prüfen.command` bzw.
  `node scripts/probe-routes.mjs` listet je Route die Kandidaten aus OSM. Nach Änderungen an einer
  Gebietsdatei lädt `fetch-osm` sie beim nächsten Lauf neu (merkt sich die Änderungszeit im geo/index.json).
- **Höhen aus den Terrarium-Geländekacheln** (AWS Terrain Tiles, dieselben wie das 3D-Relief; eigener PNG-Decoder in `scripts/lib/terrain.mjs`). Open-Meteo Elevation nur mit `--open-meteo`; das Wetter kommt weiterhin von Open-Meteo (Hinweis „Weather data by Open-Meteo.com“ bleibt).
- **Keine fremden Rezensionen** kopieren (Google, bergfex, TripAdvisor). Bewertungen sind eigene Notizen des Nutzers.
- **Live-Liftstatus** gibt es nicht gratis; dafür steht in jeder Ski-Datei `links.lift_status` auf die Betreiberseite.

## Stil

- Dunkle Reliefkarte, Signalrot `--accent` nur für UI (Rahmen, Auswahl, Marker). Pistenfarben sind die amtlichen:
  grün sehr leicht, blau leicht, rot mittel, schwarz schwer (mit weißem Rand), Skiroute orange gestrichelt.
- Rad: Linienfarbe nach steilstem Anstieg; Profil-Balken über null bergauf, unter null bergab.
- Wandern: Farbe nach Schwierigkeit (Standard) oder Gehzeit nach DIN 33466 (Umschalter unten rechts).
- Schrift: Archivo (Display, schmal) und JetBrains Mono (Zahlen). Sentence case, keine Emojis als Icons.
- Alles muss bei 390 px Breite funktionieren: Listen und Detailblatt liegen unten als Blätter mit Griff
  (`.grab`), Berühren der Karte klappt sie auf den Kopf zusammen (`.collapsed`). Die Zielhöhe steht in der
  CSS-Variable `--sheet-h`, die `map.js` für den freien Kartenausschnitt liest.

## Kamera

- **Kein `maxBounds`.** Es sperrt im Hochformat das Hoch-/Runterschieben, sobald der Bildschirm höher ist
  als die erlaubte Fläche. Stattdessen `softBounds` in `map.js`: nur der Mittelpunkt darf `PAN_BOUNDS`
  (Österreich plus Rand) nicht verlassen, sonst gleitet die Karte zurück. `minZoom` 6,5.
- **Verdeckte Ränder sind Karten-Padding**, kein Pixelversatz (`cameraFor` in `map.js`): MapLibre rechnet
  `cameraForBounds` mit dem gesetzten Padding, der Flug animiert es mit, der Mittelpunkt bleibt auf dem Ziel.
  So stimmt im Gelände die Bodenhöhe (`flyGrounded`) und der Rundflug dreht sich um das Gebiet.
- Kameraziel vor jedem Flug auf Bodenhöhe setzen (`flyGrounded`), sonst landet die Kamera im Berg
  (schwarzes Bild). MapLibre 5.6 übernimmt `elevation` nur bei `jumpTo`.

## Arbeitsweise

- Vor Änderungen an `geo.js` oder den Skripten `npm test`; neue Logik bekommt einen Test in `tests/`.
- Browser-Verhalten prüfen mit `npm run dev` und echtem Browser; für Headless-Tests MapLibre stubben
  (externe Hosts sind in vielen Sandboxes nicht erreichbar).
- Changelog-Zeile in README „Stand“ aktualisieren, wenn Daten neu geladen wurden.

## Profile von Routen

- `add-elevation` ordnet Teilstücke (`orderParts`: abgelegenstes Ende zuerst, dann der Nähe nach), rechnet das
  Profil je Teilstück (`profileParts`; Lücken zählen nicht), liest Wanderungen und Rennrad-Anstiege bergauf,
  Flow Trails bergab (`orientFor`), überbrückt Tunnel geradlinig (`tunnels` aus OSM-Tags, nur bei
  `way_name`-Routen) und nimmt das Niveau der Tourenbeschreibung, wenn OSM keine `sac_scale` hat.
- Relationen liefern keine Tags ihrer Mitglieder (`out geom`), darum dort keine Tunnelerkennung.
- `Profile rechnen.command` rechnet nur das neu, ohne Overpass.

## Nächste Schritte (Stand 31.10.2026, vormittags)

1. `Daten laden.command` einmal laufen lassen (Dobratsch-Gipfelweg 291, Simonhöhe mit neuer Box; Profile neu).
2. Test am iPhone (Safari, „Zum Home-Bildschirm“): Blätter, Tipp-Treffer, Sektorflüge.
3. Routen ohne OSM-Verlauf (`osm.none`): Wangenitzsee, Tscheppaschlucht, 6 Slow Trails – Kennzahlen bleiben.
4. Veröffentlicht auf GitHub Pages: https://helloyes74-sys.github.io/sportatlas-/ (Workflow .github/workflows/pages.yml lädt app/ bei jedem Push hoch). Später: weitere Bundesländer.
