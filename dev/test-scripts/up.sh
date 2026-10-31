# usage: up.sh [ENV=VAL ...] - restart.sh in the background (so its server can't hold this shell), then wait until
# the server listens (plus a moment for the bot navigation).
SP="${SP:-$TEMP/co-test}"
mkdir -p "$SP"; : > "$SP/srv.log"
(bash "$(dirname "$0")/restart.sh" "$@" > /dev/null 2>&1 < /dev/null &)
for i in $(seq 1 80); do sleep 0.25; grep -q "Mode:" "$SP/srv.log" && break; done
sleep 2.5
grep "Mode:\|Error" "$SP/srv.log" | head -3
