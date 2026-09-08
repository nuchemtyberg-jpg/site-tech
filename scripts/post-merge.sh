#!/usr/bin/env bash
set -euo pipefail

npm install

# Keep this non-interactive: post-merge setup runs with stdin closed.
# data_migrations is declared in shared/schema.ts, so Drizzle will not offer
# to delete the migration ledger. The wrapper also handles create-versus-rename
# prompts and verifies the schema before data migrations run.
bash scripts/sync-schema.sh
npx tsx scripts/run-data-migrations.ts
