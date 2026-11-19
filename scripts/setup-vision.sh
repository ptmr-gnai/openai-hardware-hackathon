#!/bin/sh
# Download MediaPipe pose tracking once into livestream/vendor/ (git-ignored)
# so body tracking runs fully offline afterwards.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VENDOR="$(dirname "$SCRIPT_DIR")/livestream/vendor/mediapipe"
VERSION=0.10.32
MODEL_SHA256=59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a
MODEL_URL=https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task

mkdir -p "$VENDOR/wasm"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if [ ! -f "$VENDOR/vision_bundle.mjs" ]; then
  echo "Downloading @mediapipe/tasks-vision@${VERSION}…"
  curl -fsSL "https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-$VERSION.tgz" -o "$TMP/pkg.tgz"
  tar -xzf "$TMP/pkg.tgz" -C "$TMP"
  cp "$TMP/package/vision_bundle.mjs" "$VENDOR/"
  cp "$TMP"/package/wasm/* "$VENDOR/wasm/"
fi

if [ ! -f "$VENDOR/pose_landmarker_lite.task" ] || \
   [ "$(shasum -a 256 "$VENDOR/pose_landmarker_lite.task" | cut -d' ' -f1)" != "$MODEL_SHA256" ]; then
  echo "Downloading pose model…"
  curl -fsSL "$MODEL_URL" -o "$TMP/model.task"
  [ "$(shasum -a 256 "$TMP/model.task" | cut -d' ' -f1)" = "$MODEL_SHA256" ] || { echo "Pose model checksum mismatch" >&2; exit 1; }
  mv "$TMP/model.task" "$VENDOR/pose_landmarker_lite.task"
fi
echo "MediaPipe ready in $VENDOR"
