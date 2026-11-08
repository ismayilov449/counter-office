# usage: stop.sh — stop the Underground & vents test server (whatever listens on GAME_PORT, default 4250; nothing else).
PORT="${GAME_PORT:-4250}"
PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null && echo "stopped $PID (port $PORT)"
exit 0
