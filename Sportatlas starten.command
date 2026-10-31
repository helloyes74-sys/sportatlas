#!/bin/bash
# Doppelklick startet den Sportatlas und öffnet den Browser. Fenster offen lassen; Schließen beendet die App.
cd "$(dirname "$0")"
source ./node-env.sh
printf '\033]0;Sportatlas läuft – Fenster offen lassen\007'
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden."
  echo "Bitte von https://nodejs.org die LTS-Version installieren (Installer durchklicken), dann diese Datei erneut doppelklicken."
  open "https://nodejs.org/de/download"
  read -r -p "Enter zum Schließen"; exit 1
fi
echo "Node $(node -v) gefunden. Sportatlas läuft unter http://localhost:5173"
( sleep 1.5; open "http://localhost:5173" ) &
node scripts/serve.mjs 5173
