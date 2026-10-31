# Sportatlas – Anleitung für Claude Code

Sportatlas zeigt alle Outdoor-Sportangebote eines Bundeslandes (Start: Kärnten) auf einer dunklen
3D-Reliefkarte: Skigebiete mit Pisten nach Schwierigkeit, Loipen, Radrouten mit Steigungsprofil,
Wanderwege mit Gehzeit. Privates Projekt von Thomas, zunächst fürs eigene Handy.

## Befehle

```
npm run dev                       # http://localhost:5173, nur dieser Rechner (SPORTATLAS_LAN=1 gibt fürs WLAN frei – nur auf Wunsch von Thomas)
npm test                          # Unit-Tests (node:test), müssen vor jedem Commit grün sein
npm run fetch -- gerlitzen        # OSM-Linien eines Gebiets laden (Overpass) → app/data/geo/
npm run elevation -- gerlitzen    # Höhen anreichern (Geländekacheln) + Profile berechnen
node scripts/probe-routes.mjs     # OSM-Routen-Relationen je Rad-/Wanderroute auflisten → Routen-Check.txt
npm run data                      # beides für alle Gebiete (dauert, Fair-Use-Pausen eingebaut)
node scripts/fetch-sportorte.mjs  # alle Sportorte Kärntens aus OSM → data/sportorte-raw/ und App-Datei (Workflow „Sportorte laden“)
node scripts/build-sportorte.mjs  # nur die App-Datei app/data/sportorte/kaernten.json neu bauen (ohne Netz)
```

Es gibt keinen Build-Schritt und keine npm-Abhängigkeiten. Die App ist reines ES-Modul-JavaScript,
MapLibre GL und die Schriften liegen lokal unter `app/vendor/` (Workflow „Bibliotheken lokal ablegen“, Version dort gepinnt) – keine Anfragen an Google Fonts oder unpkg (Datenschutz). Node ≥ 20.
Neue externe Dienste nur nach Eintrag in `app/datenschutz.html`. Links aus OSM-Daten immer durch `safeUrl` (spots.js).

## Aufbau

```
app/                   die PWA (statisch ausliefern, fertig)
  index.html           Hülle, lädt MapLibre und js/main.js
  css/app.css          Stil-Tokens oben in :root (Nachtkarte, Akzent --accent)
  js/main.js           Zustand, Ereignisse, Hash-Routing (#ski, #ski/gerlitzen)
  js/map.js            Basisstil, Gelände, Datenebenen, Farben (COLORS)
  js/ui.js             Render-Funktionen (HTML-Strings) für Listen und Detailblatt
  js/filters.js        Filterchips je Sportart, Entfernungssortierung (Standort)
  js/gpx.js            GPX-Export der geladenen Linien
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

## Alle Sportarten und Orte im Umkreis

- Startseite `#alle`: Liste aller Sportarten nach Überbegriff (`CATALOG` in `scripts/lib/sports.mjs`). Ski, Langlauf,
  Rad, Wandern verweisen auf die bestehenden Bereiche (`route`), alle anderen auf `#ort/<sport>`.
- `#ort/<sport>` zeigt nur Orte im Umkreis des Standorts (Chips 10–50 km, Standard 20 km, „ganz Kärnten“);
  `#ort/<sport>/<id>` das Detailblatt. Render-Funktionen in `app/js/spots.js`.
- Ausgelassen (Wunsch Thomas): Fußball, Tischtennis, Pferd, Kanu/Kajak, Sprungschanzen, alles ohne Katalog-Eintrag.
  Benachbarte Plätze einer Sportart werden zu einem Ort zusammengefasst (`merge_m`, Tennis 180 m), `courts` zählt sie.
- OSM ist bei Trendsportarten dünn (Padel 4 Orte). Fehlende Orte in OSM eintragen, nicht von Hand in die App-Datei.

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
- `smoothElevations` in `geo.js` glättet vor dem Profil (Median 5, dann Mittel 3, symmetrisches Fenster am Rand);
  ein 80-m-Ausreißer des Höhenmodells bleibt als ±7 m übrig statt ±60 %.

## Oberfläche

- Start: `introFlight` (von oben, flach, dann Schrägansicht; Berührung bricht ab). `snapshot` liest das Canvas im
  nächsten `render` (kein preserveDrawingBuffer) und legt Titel und Namensnennung darüber → Knopf „Bild“.
- `snowline`: Raster-Ebene aus den Terrarium-Kacheln (`raster-color`), weißlich ab 1800 m – Schattierung, kein Schneebericht.
- Sektorname = Talstation des tiefsten Lifts (`sectors.js`), sonst längste Piste.
- Detailblatt: Reiter (`.tabs`, sticky) springen zu `#sec-lines`, `#snow`, `#wx`, `#sec-notes`. Am Handy größere Kennzahlen.
- Preise: `prices.season` ≠ laufende Saison → UI zeigt das Saisonkürzel mit („Tageskarte 2025/26“).

## Nächste Schritte (Stand 31.10.2026, nachmittags)

1. Nach dem nächsten Datenlauf prüfen: Loipen der 8 neuen Gebiete (`center_note`), AAT-Etappen, neue Hütten-/Almwanderungen;
   Profile nach Glättung (Malta-Hochalmstraße).
2. Am Mac testen: Anflug, Reiter, „Bild“, Schneeschattierung in 3D.
3. Preise 2026/27 noch offen: Hochrindl, Weinebene, Weissensee, Simonhöhe, Dreiländereck, Bodental, Emberger Alm,
   Kötschach-Mauthen, Weißbriach (Betreiber haben noch nicht veröffentlicht; Stand 19.10.2026).
4. **Nicht öffentlich** (seit 31.10.2026): `pages.yml` veröffentlicht nur `offline/` (leere Seite, löscht alte SW-Caches).
   Nicht ohne Rückfrage bei Thomas wieder auf `app` stellen. Die App läuft nur noch lokal am Mac.
