# usage: srv.sh [ENV=VAL ...] - (re)start the cat agent's test server on GAME_PORT (default 4060; HTTPS on
# HTTPS_PORT, default 4061) with fresh test data in $SP/testdata. Never the real data/ folder. Stops only the
# process listening on GAME_PORT.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SP="${SP:-$TEMP/co-cat}"
PORT="${GAME_PORT:-4060}"
HPORT="${HTTPS_PORT:-4061}"
mkdir -p "$SP"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"
cd "$ROOT"
env PORT=$PORT HTTPS_PORT=$HPORT DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass "$@" node server.js > "$SP/srv.log" 2>&1 &
for i in $(seq 1 80); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
grep "Mode:\|Error\|error" "$SP/srv.log" | head -5
