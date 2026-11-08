# usage: srv.sh [ENV=VAL ...] — (re)start the power branch's test server on GAME_PORT (default 4230; HTTPS on
# GAME_PORT+1) with fresh test data in $SP/testdata (never the real data/ folder), Mansion and no bots unless given.
# It runs detached; the script waits until it listens and returns. A server already on that port (an earlier run of
# this script) is stopped first; stop it at the end with stop.sh (by its port).
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SP="${SP:-$TEMP/co-power}"
PORT="${GAME_PORT:-4230}"
mkdir -p "$SP"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"
: > "$SP/srv.log"
cd "$ROOT"
(env PORT=$PORT HTTPS_PORT=$((PORT + 1)) DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass MAP=cs_mansion BOTS=0 START_MONEY=16000 "$@" node server.js > "$SP/srv.log" 2>&1 < /dev/null &)
node "$ROOT/dev/test-scripts/power/waitsrv.mjs" "$SP/srv.log" && grep "map \|Mode:" "$SP/srv.log" | head -2
