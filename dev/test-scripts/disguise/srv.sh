# usage: srv.sh [ENV=VAL ...] - (re)start the disguise test server on GAME_PORT (default 4070, HTTPS on +1) with fresh
# test data in $SP/testdata (SP: required, a temp folder of your own). Stops only whatever listens on GAME_PORT.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${GAME_PORT:-4070}"
[ -z "$SP" ] && { echo "set SP"; exit 1; }
mkdir -p "$SP"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"
cd "$ROOT"
env PORT=$PORT HTTPS_PORT=$((PORT + 1)) DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass "$@" node server.js > "$SP/srv.log" 2>&1 &
for i in $(seq 1 80); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
sleep 1
grep "Mode:\|Error\|error" "$SP/srv.log" | head -5
