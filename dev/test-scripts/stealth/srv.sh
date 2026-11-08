# usage: srv.sh [ENV=VAL ...] — (re)start the stealth test server on GAME_PORT (default 4240; HTTPS on 4241) with fresh
# test data in $SP/testdata (SP defaults to $TEMP/co-stealth; never the real data/ folder), detached, its PID in
# $SP/srv.pid; returns once it listens. Defaults: MAP=cs_mansion BOTS=0 (pass them to change).
# srv.sh stop — stop it (by its port, nothing else).
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SP="${SP:-$TEMP/co-stealth}"
PORT="${GAME_PORT:-4240}"
mkdir -p "$SP"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
[ "$1" = "stop" ] && exit 0
rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"; : > "$SP/srv.log"
cd "$ROOT"
(env PORT=$PORT HTTPS_PORT=$((PORT + 1)) DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass MAP=cs_mansion BOTS=0 "$@" node server.js > "$SP/srv.log" 2>&1 < /dev/null & echo $! > "$SP/srv.pid")
for i in $(seq 1 80); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
sleep 1
grep "Mode:\|Error\|error" "$SP/srv.log" | head -5
