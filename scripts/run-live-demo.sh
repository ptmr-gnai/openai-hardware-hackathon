#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(dirname "$SCRIPT_DIR")
SERVER_PID=""
H10_PID=""

cleanup() {
  [ -z "$H10_PID" ] || kill "$H10_PID" 2>/dev/null || true
  [ -z "$SERVER_PID" ] || kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"
python3 -m http.server 8765 --bind 127.0.0.1 --directory livestream &
SERVER_PID=$!
swift tools/h10_stream.swift --json-file livestream/hr.json &
H10_PID=$!

echo "Live demo: http://127.0.0.1:8765"
wait "$H10_PID"

