# usage: server.sh [ENV=VAL ...] - (re)start the elevator agent's test server on GAME_PORT (default 4090; HTTPS on
# GAME_PORT+1) with fresh test data in $SP/testdata. Never the real data/ folder.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SP="${SP:-$TEMP/co-elevator}"
PORT="${GAME_PORT:-4090}"
mkdir -p "$SP"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"
cd "$ROOT"
env PORT=$PORT HTTPS_PORT=$((PORT + 1)) DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass MAP=${MAP:-cs_mansion} BOTS=${BOTS:-0} "$@" node server.js > "$SP/srv.log" 2>&1 &
for i in $(seq 1 80); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
grep "Mode:\|Error\|error" "$SP/srv.log" | head -5
