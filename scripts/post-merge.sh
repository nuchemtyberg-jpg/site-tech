#!/bin/bash
set -e

npm install
npm run db:push
npx tsx scripts/run-data-migrations.ts
