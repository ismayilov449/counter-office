# usage: SP=<your temp folder> run.sh <test.mjs> [ENV=VAL ...]
# Starts the test server on GAME_PORT (default 4070, HTTPS +1) with fresh test data in $SP/testdata and the given
# environment, runs the test (node) against it, then stops that server (only the one it started). Output: the test's,
# then any server errors. The server's log is $SP/srv.log.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${GAME_PORT:-4070}"
[ -z "$SP" ] && { echo "set SP"; exit 1; }
TEST="$1"; shift
mkdir -p "$SP"; rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"
cd "$ROOT"
env PORT=$PORT HTTPS_PORT=$((PORT + 1)) DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass "$@" node server.js > "$SP/srv.log" 2>&1 &
SRV=$!
for i in $(seq 1 80); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
sleep 2
env GAME_PORT=$PORT "$@" node "$TEST"
CODE=$?
kill $SRV 2> /dev/null
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
echo "--- server errors:"
grep -i "error\|exception\|at .*\.js:" "$SP/srv.log" | head -10
exit $CODE
