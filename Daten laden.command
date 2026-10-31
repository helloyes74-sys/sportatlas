#!/bin/bash
# Lädt Pisten, Lifte, Loipen und Routen aus OpenStreetMap und ergänzt Höhen (Geländekacheln).
# Erst die Gerlitzen (schnell), dann alle übrigen Gebiete. Danach im Browser neu laden.
cd "$(dirname "$0")"
source ./node-env.sh
printf '\033]0;Sportatlas – Daten laden\007'
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden. Bitte zuerst „Sportatlas starten.command“ ausführen, das erklärt die Installation."
  read -r -p "Enter zum Schließen"; exit 1
fi
echo "1/2  Gerlitzen …"
node scripts/fetch-osm.mjs gerlitzen && node scripts/add-elevation.mjs gerlitzen
echo
echo "2/2  Alle übrigen Gebiete (dauert einige Minuten, Pausen sind Absicht) …"
node scripts/fetch-osm.mjs && node scripts/add-elevation.mjs
echo
echo "Fertig. Im Browser die Seite neu laden. Dieses Fenster kann geschlossen werden."
