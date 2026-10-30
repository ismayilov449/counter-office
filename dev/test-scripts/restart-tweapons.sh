# usage: restart-tweapons.sh [ENV=VAL ...]  — (re)start the t-weapons test server on :4100 with fresh test data
SP="$TEMP/claude/C--Users-Rufat-Ismayilov-Desktop-CS1-6/fda3fa36-5543-4bf3-aafd-2dd06116628f/scratchpad"
PID=$(netstat -ano | grep ':4100 ' | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
rm -rf "$SP/testdata-tweapons"; mkdir -p "$SP/testdata-tweapons"
cd /c/Users/Rufat.Ismayilov/Desktop/CS1.6/.claude/worktrees/agent-a01c73aa3d67d1462
env PORT=4100 HTTPS_PORT=4101 DATA_DIR="$SP/testdata-tweapons" ADMIN_PASSWORD=testpass "$@" node server.js > "$SP/srv-tweapons.log" 2>&1 &
for i in $(seq 1 40); do sleep 0.25; grep -q "Mode:" "$SP/srv-tweapons.log" && break; done
grep "Mode:\|Error\|error" "$SP/srv-tweapons.log" | head -5
