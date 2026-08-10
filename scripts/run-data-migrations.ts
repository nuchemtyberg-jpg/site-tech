/**
 * Applies tracked data migrations (see server/dataMigrations.ts).
 * Run after `npm run db:push`. Also runs automatically at server startup.
 * Usage: npx tsx scripts/run-data-migrations.ts
 */
import { runDataMigrations } from "../server/dataMigrations";

runDataMigrations()
  .then(() => {
    console.log("Data migrations up to date.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Data migration failed:", err);
    process.exit(1);
  });
