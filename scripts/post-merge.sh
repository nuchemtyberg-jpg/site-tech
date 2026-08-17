#!/bin/bash
set -e

npm install

# drizzle-kit push can prompt interactively when it detects possible renames.
# Pipe a stream of newlines so it always selects the default (create/keep)
# choice for each prompt without stalling.
yes "" | npm run db:push || true
# Re-run with --force to apply any remaining changes that were skipped due to
# data-loss warnings, after the rename prompts are already resolved.
npm run db:push -- --force

npx tsx scripts/run-data-migrations.ts
