# usage: restart-mansion.sh [ENV=VAL ...]  — (re)start the mansion-branch test server on :4200 (HTTPS 4201) with fresh test data
SP="$TEMP/claude/C--Users-Rufat-Ismayilov-Desktop-CS1-6/fda3fa36-5543-4bf3-aafd-2dd06116628f/scratchpad"
PID=$(netstat -ano | grep ':4200 ' | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID > /dev/null
rm -rf "$SP/testdata-mansion"; mkdir -p "$SP/testdata-mansion"
cd /c/Users/Rufat.Ismayilov/Desktop/CS1.6/.claude/worktrees/agent-a556089471e441071
env PORT=4200 HTTPS_PORT=4201 DATA_DIR="$SP/testdata-mansion" ADMIN_PASSWORD=testpass "$@" node server.js > "$SP/srv-mansion.log" 2>&1 &
for i in $(seq 1 60); do sleep 0.25; grep -q "Mode:" "$SP/srv-mansion.log" && break; done
grep "Mode:\|Error\|error" "$SP/srv-mansion.log" | head -5
