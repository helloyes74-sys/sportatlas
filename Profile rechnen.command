#!/bin/bash
# Rechnet nur Höhen, Profile, Gehzeiten und Laufrichtung neu (aus den schon geladenen OSM-Linien),
# ohne OpenStreetMap zu fragen. Schnell, weil die Geländekacheln zwischengespeichert sind.
cd "$(dirname "$0")"
source ./node-env.sh
printf '\033]0;Sportatlas – Profile rechnen\007'
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden. Bitte zuerst „Sportatlas starten.command“ ausführen, das erklärt die Installation."
  read -r -p "Enter zum Schließen"; exit 1
fi
node scripts/add-elevation.mjs
echo; echo "Fertig. Im Browser die Seite neu laden. Dieses Fenster kann geschlossen werden."
