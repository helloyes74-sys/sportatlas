#!/bin/bash
# Lädt die App (Ordner app/) als Cloudflare Worker „sportatlas“ hoch. Beim ersten Mal öffnet sich der Browser
# zum Anmelden bei Cloudflare („Allow“ klicken), danach läuft es ohne Rückfrage. Adresse steht am Ende.
cd "$(dirname "$0")"
source ./node-env.sh
printf '\033]0;Sportatlas – online stellen\007'
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden. Bitte zuerst „Sportatlas starten.command“ ausführen, das erklärt die Installation."
  read -r -p "Enter zum Schließen"; exit 1
fi
echo "Tests …"
if ! node --test tests/*.test.mjs >/dev/null 2>&1; then
  echo "Tests schlagen fehl – nichts hochgeladen. Bitte Claude Bescheid geben."
  read -r -p "Enter zum Schließen"; exit 1
fi
echo "Lade app/ zu Cloudflare hoch (wrangler) …"
npx --yes wrangler@4 deploy
echo
echo "Fertig. Die App ist unter https://sportatlas.probe1745.workers.dev erreichbar."
echo "Tipp: Unter dash.cloudflare.com → Workers & Pages → sportatlas → Settings → Domains & Routes lässt sich die Adresse ablesen,"
echo "unter Zero Trust → Access → Applications kann sie wie der London-Atlas geschützt werden."
read -r -p "Enter zum Schließen"
