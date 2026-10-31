#!/bin/bash
# Lädt nur die Rad- und Wanderrouten aus OpenStreetMap (Relationen bzw. Straßen/Wege laut osm-Angaben
# in den Gebietsdateien) und ergänzt Höhen und Profile. Skigebiete und Loipen bleiben unberührt.
cd "$(dirname "$0")"
source ./node-env.sh
printf '\033]0;Sportatlas – Routen laden\007'
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden. Bitte zuerst „Sportatlas starten.command“ ausführen, das erklärt die Installation."
  read -r -p "Enter zum Schließen"; exit 1
fi
echo "1/3  Radrouten …";    node scripts/fetch-osm.mjs --type bike --force
echo; echo "2/3  Wanderrouten …"; node scripts/fetch-osm.mjs --type hike --force
echo; echo "3/3  Höhen und Profile …"; node scripts/add-elevation.mjs geo/bike geo/hike
echo; echo "Fertig. Im Browser die Seite neu laden. Dieses Fenster kann geschlossen werden."
