# usage: srv.sh [ENV=VAL ...] — (re)start the walls test server on GAME_PORT (default 4220, HTTPS on 4221) with fresh
# test data in $SP/testdata (SP defaults to $TEMP/co-walls), no bots and Mansion unless given. Never the real data/
# folder, never the live ports 3000/3443. Runs it in the background (its PID in $SP/srv.pid) and waits until it listens.
# srv.sh stop: stops the server on GAME_PORT (only that port's listener).
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SP="${SP:-$TEMP/co-walls}"
PORT="${GAME_PORT:-4220}"
mkdir -p "$SP"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
[ "$1" = "stop" ] && exit 0
rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"
: > "$SP/srv.log"
cd "$ROOT"
(env PORT=$PORT HTTPS_PORT=$((PORT + 1)) DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass BOTS=0 MAP=cs_mansion FREEZE_TIME=1 "$@" node server.js > "$SP/srv.log" 2>&1 < /dev/null &)
for i in $(seq 1 80); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1 > "$SP/srv.pid"
grep "Mode:\|Error\|error" "$SP/srv.log" | head -5
