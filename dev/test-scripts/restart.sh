# usage: restart.sh [ENV=VAL ...]  — (re)start the test server on :3999 with fresh test data
SP="$TEMP/claude/C--Users-Rufat-Ismayilov-Desktop-CS1-6/fda3fa36-5543-4bf3-aafd-2dd06116628f/scratchpad"
PID=$(netstat -ano | grep ':3999 ' | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
rm -rf "$SP/testdata"; mkdir -p "$SP/testdata"
cd /c/Users/Rufat.Ismayilov/Desktop/CS1.6
env PORT=3999 HTTPS_PORT=3998 DATA_DIR="$SP/testdata" ADMIN_PASSWORD=testpass "$@" node server.js > "$SP/srv.log" 2>&1 &
for i in $(seq 1 40); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
grep "Mode:\|Error\|error" "$SP/srv.log" | head -5
