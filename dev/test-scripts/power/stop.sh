# usage: stop.sh — stop the power branch's test server (whatever listens on GAME_PORT, default 4230: only ours).
PORT="${GAME_PORT:-4230}"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null && echo "stopped the server on $PORT (pid $PID)"
exit 0
