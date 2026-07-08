# Launching Audiology from a desktop icon (macOS)

Audiology is a Vite dev app today, so a "launcher" starts the dev server and opens
the browser. This is a **convenience for a development build**, not a packaged app —
the real double-click native app is the **Tauri** item on the [roadmap](../README.md#roadmap)
(which also bundles the Tonality engine so it travels with the app).

`scripts/launch-audiology.command` does the work: it puts Node on PATH, `npm install`s
if needed, starts `npm run dev` (reusing an already-running server), waits for
`http://localhost:5173`, and opens it. It resolves the repo from its own location, so
it keeps working if you alias it to the Desktop.

## Option A — the `.command` file (30 seconds)

1. In Finder, open `scripts/` and **double-click `launch-audiology.command`**. (First
   run: macOS may warn it's from an unidentified developer → right-click → Open, once.)
2. To put it on the Desktop: right-click the file → **Make Alias**, drag the alias to
   the Desktop. Double-clicking it launches Audiology.

Downside: it opens a Terminal window that stays open while the server runs.

## Option B — an Automator app with a real icon (recommended, ~5 min)

Gives a proper double-click `Audiology.app` with a custom icon and no lingering
Terminal window.

1. Open **Automator** → **New** → **Application**.
2. In the actions list, find **Run Shell Script** and drag it into the workflow.
3. Set **Shell** to `/bin/zsh` and replace the body with (adjust the path if your
   clone lives elsewhere):
   ```zsh
   "/Users/machinepriest/Documents/Claude/audiology/Audiology/scripts/launch-audiology.command"
   ```
4. **File → Save**, name it `Audiology`, save to `/Applications` (or the Desktop).
5. *(Optional icon)* Select `Audiology.app` in Finder → **⌘I** (Get Info). Copy a
   `.png`/`.icns` image to the clipboard, click the small icon at the top-left of the
   Info window, and **⌘V** to paste. Drag the app to the Dock if you like.

Double-clicking `Audiology.app` now starts the server (if needed) and opens the app,
with no visible Terminal.

## Notes / troubleshooting

- **Requirements:** Node 18+ installed and the repo cloned. The script adds
  `/opt/homebrew/bin` and `/usr/local/bin` to PATH; if you use **nvm** or a custom
  Node install, add that path near the top of `launch-audiology.command`.
- **The Tonality engine** is still started from inside the app (the transport's
  **⏻ Start engine** button); the launcher only brings up Audiology itself.
- Server logs go to `/tmp/audiology-dev.log`. To stop the server, quit it from that
  Terminal (Option A) or `pkill -f "vite"`.
- **Port:** the launcher assumes `5173` (the `dev` config default). If you run the
  server on another port, edit `PORT` in the script.
