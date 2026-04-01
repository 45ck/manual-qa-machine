#!/bin/bash
# Serve a QA report directory locally for viewing screenshots
# Usage: ./serve-report.sh [report-dir] [port]

REPORT_DIR="${1:-.}"
PORT="${2:-8080}"

if [ ! -d "$REPORT_DIR" ]; then
  echo "Error: Directory '$REPORT_DIR' not found"
  exit 1
fi

echo "Serving QA report from: $REPORT_DIR"
echo "Open: http://localhost:$PORT"
echo "Press Ctrl+C to stop"

# Use Python's built-in HTTP server
if command -v python3 &> /dev/null; then
  python3 -m http.server "$PORT" --directory "$REPORT_DIR"
elif command -v python &> /dev/null; then
  cd "$REPORT_DIR" && python -m SimpleHTTPServer "$PORT"
elif command -v npx &> /dev/null; then
  npx serve "$REPORT_DIR" -l "$PORT"
else
  echo "Error: No suitable HTTP server found (need python3, python, or npx)"
  exit 1
fi
