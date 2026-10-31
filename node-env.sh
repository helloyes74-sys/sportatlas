# Von den .command-Dateien eingebunden: findet Node auch dann, wenn es nur für interaktive Shells eingerichtet ist (nvm, fnm, Volta, Homebrew).
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  for d in "$HOME/.nvm/versions/node"/*/bin "$HOME/.local/share/fnm/node-versions"/*/installation/bin "$HOME/Library/Application Support/fnm/node-versions"/*/installation/bin; do
    [ -x "$d/node" ] && export PATH="$d:$PATH" && break
  done
fi
