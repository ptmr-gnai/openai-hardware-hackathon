#!/bin/sh
# Scaffold a new Codex Arcade game from the SDK template.
#   ./scripts/new-game.sh squat-pop
set -eu
NAME=${1:?usage: new-game.sh <game-id>   (lowercase, dashes)}
case "$NAME" in *[!a-z0-9-]*) echo "game id must be lowercase letters, digits and dashes" >&2; exit 1;; esac
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEST="$ROOT/livestream/sdk/games/$NAME.js"
[ -e "$DEST" ] && { echo "$DEST already exists" >&2; exit 1; }
mkdir -p "$ROOT/livestream/sdk/games"
sed "s/id: 'my-game'/id: '$NAME'/" "$ROOT/livestream/sdk/template/my-game.js" > "$DEST"
echo "Created $DEST"
echo "Open:   http://127.0.0.1:8765/sdk/playground.html?src=/sdk/games/$NAME.js"
echo "Add to the arcade: import it in livestream/arcade/games/index.js and list it in \`games\`."
