#!/usr/bin/env bash
# Runs the authenticated HTTP API regression tests (scripts/test-http-api.ts).
# The tests need the app serving on localhost:5000. If it's not already up,
# this script starts `npm run dev`, waits for the port, runs the tests, and
# shuts the server down again.
set -u

BASE="http://localhost:5000"
STARTED_PID=""

is_up() {
  curl -s -o /dev/null --max-time 2 "$BASE/api/auth/user"
}

cleanup() {
  if [ -n "$STARTED_PID" ]; then
    echo "Stopping dev server (pid $STARTED_PID)..."
    kill -- -"$STARTED_PID" 2>/dev/null || kill "$STARTED_PID" 2>/dev/null
    wait "$STARTED_PID" 2>/dev/null
  fi
}
trap cleanup EXIT

if ! is_up; then
  echo "Server not running on :5000 — starting dev server..."
  setsid npm run dev >/tmp/http-api-test-server.log 2>&1 &
  STARTED_PID=$!
  for i in $(seq 1 60); do
    if is_up; then break; fi
    sleep 1
  done
  if ! is_up; then
    echo "FAIL: server did not come up on :5000 within 60s"
    echo "--- server log tail ---"
    tail -50 /tmp/http-api-test-server.log
    exit 1
  fi
  echo "Server is up."
fi

npx tsx scripts/test-http-api.ts
exit $?
