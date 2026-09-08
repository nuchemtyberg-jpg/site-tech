#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FAIL: DATABASE_URL is required to synchronize the database schema." >&2
  exit 1
fi

echo "Synchronizing database schema..."

# Drizzle's create-versus-rename prompt reads from a terminal rather than
# ordinary stdin. Run it in a pseudo-terminal and accept the safe default
# "create" choice. The timeout turns any unrecognized prompt into a clear
# failure instead of letting post-merge setup hang or silently continue.
set +e
timeout 180 script -qec "npm run db:push -- --force" /dev/null \
  < <(while true; do printf '\r'; sleep 1; done)
push_status=$?
set -e

if [ "$push_status" -eq 124 ]; then
  echo "FAIL: Database schema synchronization timed out, likely on an interactive Drizzle prompt." >&2
  exit 1
fi
if [ "$push_status" -ne 0 ]; then
  echo "FAIL: Database schema synchronization exited with status $push_status." >&2
  exit "$push_status"
fi

npx tsx scripts/verify-schema.ts