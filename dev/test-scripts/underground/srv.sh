# usage: srv.sh [ENV=VAL ...] — (re)start the Underground & vents test server on GAME_PORT (default 4250, HTTPS on
# 4251) with fresh test data in $SP/testdata (SP defaults to $TEMP/co-ug), no bots and cs_mansion unless given. Never
# the real data/ folder. Stops only what listens on that port, runs the server in the background and waits until it
# listens. Its PID goes to $SP/srv.pid.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SP="${SP:-$TEMP/co-ug}"
PORT="${GAME_PORT:-4250}"
mkdir -p "$SP"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"
: > "$SP/srv.log"
cd "$ROOT"
(env PORT=$PORT HTTPS_PORT=$((PORT + 1)) DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass BOTS=0 MAP=cs_mansion FREEZE_TIME=1 "$@" node server.js > "$SP/srv.log" 2>&1 < /dev/null &)
for i in $(seq 1 80); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1 > "$SP/srv.pid"
grep "Mode:\|Error\|error" "$SP/srv.log" | head -5
