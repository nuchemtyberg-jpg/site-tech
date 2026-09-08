#!/usr/bin/env bash
# Runs the authenticated HTTP API regression tests (scripts/test-http-api.ts).
# The tests use a dedicated server on port 5100 so validation never depends on
# or leaves the main preview port in use.
set -euo pipefail

TEST_PORT="${TEST_PORT:-5100}"
BASE="http://localhost:${TEST_PORT}"
STARTED_PID=""

is_up() {
  curl -s -o /dev/null --max-time 2 "$BASE/api/auth/user"
}

cleanup() {
  if [ -n "$STARTED_PID" ]; then
    echo "Stopping test server (pid $STARTED_PID)..."
    kill -- -"$STARTED_PID" 2>/dev/null || kill "$STARTED_PID" 2>/dev/null
    wait "$STARTED_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if is_up; then
  echo "FAIL: dedicated HTTP test port ${TEST_PORT} is already in use." >&2
  exit 1
fi

bash scripts/sync-schema.sh

echo "Starting test server on :${TEST_PORT}..."
setsid env PORT="$TEST_PORT" npm run dev >/tmp/http-api-test-server.log 2>&1 &
STARTED_PID=$!
for i in $(seq 1 60); do
  if is_up; then break; fi
  sleep 1
done
if ! is_up; then
  echo "FAIL: server did not come up on :${TEST_PORT} within 60s"
  echo "--- server log tail ---"
  tail -50 /tmp/http-api-test-server.log
  exit 1
fi
echo "Test server is up."

TEST_BASE_URL="$BASE" npx tsx scripts/test-http-api.ts
TEST_BASE_URL="$BASE" npx tsx scripts/test-project-contacts-api.ts
TEST_BASE_URL="$BASE" npx tsx scripts/test-opportunities-api.ts
TEST_BASE_URL="$BASE" npx tsx scripts/test-opportunity-documents-api.ts
