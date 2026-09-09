#!/usr/bin/env bash
# Verifies document-category routing through the bundled production server.
set -euo pipefail

TEST_PORT="${TEST_PORT:-5100}"
BASE="http://localhost:${TEST_PORT}"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

bash scripts/sync-schema.sh
npm run build

setsid env PORT="$TEST_PORT" NODE_ENV=production node dist/index.cjs >/tmp/production-document-categories-test.log 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 "$BASE/api/auth/user"; then
    TEST_BASE_URL="$BASE" npx tsx scripts/test-document-categories-api.ts
    exit 0
  fi
  sleep 1
done

echo "FAIL: production server did not start on port ${TEST_PORT}" >&2
tail -50 /tmp/production-document-categories-test.log >&2
exit 1
