#!/bin/bash
# Double-click to preview the site locally (macOS).
cd "$(dirname "$0")"
PORT=4173
echo "Serving at http://localhost:$PORT  (Ctrl+C to stop)"
(sleep 1 && open "http://localhost:$PORT") &
python3 -m http.server "$PORT"
