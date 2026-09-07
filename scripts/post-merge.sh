#!/bin/bash
set -e

npm install

# Keep this non-interactive: post-merge setup runs with stdin closed.
# data_migrations is declared in shared/schema.ts, so Drizzle will not offer
# to delete the migration ledger and wait indefinitely for confirmation.
npm run db:push -- --force

npx tsx scripts/run-data-migrations.ts
