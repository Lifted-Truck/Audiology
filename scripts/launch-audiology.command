#!/bin/zsh
# Launch Audiology — start the Vite dev server (if it isn't already up) and open
# the app in the default browser. Double-clickable from Finder/Desktop, or wrapped
# as an Automator .app (see docs/DESKTOP.md). This is a convenience launcher for a
# development build, NOT a packaged app — the real native app is the Tauri roadmap
# item. It needs Node + the repo present on this machine.

# The repo this script lives in (resolve via the script's own location, so moving
# the .command / aliasing it to the Desktop still works).
REPO="${0:A:h:h}"
PORT=5173
URL="http://localhost:${PORT}"

# GUI-launched processes don't inherit the interactive shell's PATH, so add the
# common Node locations (Homebrew arm64/intel, /usr/local). Adjust if Node lives
# elsewhere (e.g. an nvm install).
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

if ! command -v npm >/dev/null 2>&1; then
  osascript -e 'display alert "Audiology" message "Node/npm not found on PATH. Install Node 18+ (e.g. `brew install node`) and try again."'
  exit 1
fi

cd "$REPO" || { osascript -e "display alert \"Audiology\" message \"Repo not found at ${REPO}.\""; exit 1; }

# Reuse a running server; otherwise start one detached and wait for the port.
if ! curl -s "$URL" >/dev/null 2>&1; then
  [ -d node_modules ] || npm install
  nohup npm run dev >/tmp/audiology-dev.log 2>&1 &
  for _ in $(seq 1 60); do
    curl -s "$URL" >/dev/null 2>&1 && break
    sleep 0.4
  done
fi

open "$URL"
