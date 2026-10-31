# usage: restart.sh [ENV=VAL ...] - (re)start the test server on GAME_PORT (default 3999; HTTPS on GAME_PORT-1) with
# fresh test data in $SP/testdata (SP defaults to $TEMP/co-test). Never the real data/ folder.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SP="${SP:-$TEMP/co-test}"
PORT="${GAME_PORT:-3999}"
mkdir -p "$SP"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"
cd "$ROOT"
env PORT=$PORT HTTPS_PORT=$((PORT - 1)) DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass "$@" node server.js > "$SP/srv.log" 2>&1 &
for i in $(seq 1 60); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
grep "Mode:\|Error\|error" "$SP/srv.log" | head -5
