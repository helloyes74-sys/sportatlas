#!/bin/bash
# Fragt OpenStreetMap, welche Wander- und Radrouten als Relationen vorhanden sind, und schreibt
# die Kandidaten je Gebiet nach Routen-Check.txt (im Projektordner). Lädt nichts in die App.
cd "$(dirname "$0")"
source ./node-env.sh
printf '\033]0;Sportatlas – Routen prüfen\007'
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden. Bitte zuerst „Sportatlas starten.command“ ausführen, das erklärt die Installation."
  read -r -p "Enter zum Schließen"; exit 1
fi
node scripts/probe-routes.mjs && echo && echo "Fertig – Ergebnis steht in Routen-Check.txt. Dieses Fenster kann geschlossen werden."
