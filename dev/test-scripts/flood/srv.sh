# usage: srv.sh [ENV=VAL ...] — (re)start the Floodgate test server on GAME_PORT (default 4040, HTTPS on 4041) with
# fresh test data in $SP/testdata (SP defaults to $TEMP/co-flood), no bots and Mansion unless given. Never the real
# data/ folder. Runs it in the background and waits until it listens.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SP="${SP:-$TEMP/co-flood}"
PORT="${GAME_PORT:-4040}"
mkdir -p "$SP"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"
: > "$SP/srv.log"
cd "$ROOT"
(env PORT=$PORT HTTPS_PORT=$((PORT + 1)) DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass BOTS=0 MAP=cs_mansion FREEZE_TIME=1 "$@" node server.js > "$SP/srv.log" 2>&1 < /dev/null &)
for i in $(seq 1 80); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
grep "Mode:\|Error\|error" "$SP/srv.log" | head -5
