#!/bin/zsh
# Poll DSR uploads every 4 minutes and log any change, so the pilot day is
# tracked without having to re-run the check by hand.
DSR="${1:-4245-13}"
OUT="${2:-/tmp/litmus-$DSR.log}"
prev=""
for i in $(seq 1 90); do
  now=$(npx tsx tools/litmus.ts "$DSR" 2>&1)
  if [[ "$now" != "$prev" ]]; then
    echo "########## $(date '+%H:%M:%S') ##########" >> "$OUT"
    echo "$now" >> "$OUT"
    prev="$now"
  fi
  sleep 240
done
