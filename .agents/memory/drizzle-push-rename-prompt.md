---
name: drizzle-kit push interactive prompts
description: db:push can silently stall on create-vs-rename prompts; verify tables actually exist after pushing.
---

`npm run db:push` (drizzle-kit push) asks an interactive "created or renamed from another table?" question when a new table resembles an existing DB-only table (e.g. `data_migrations`), and a non-interactive shell cannot answer it — the push exits without applying anything while looking successful.

**Why:** A new `project_contacts` table was never created despite two "successful" push runs; the DB also contains tables (like `data_migrations`) not in `shared/schema.ts`, which push offers to drop — always abort that.

**How to apply:** After any schema push, verify with `psql "$DATABASE_URL" -c "select to_regclass('<table>');"`. If push stalls on prompts, create the table/indexes with hand-written SQL matching the drizzle definition instead.
