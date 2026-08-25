---
name: drizzle-kit push interactive prompts
description: db:push can silently stall on create-vs-rename prompts; verify tables actually exist after pushing.
---

`npm run db:push` (drizzle-kit push) asks an interactive "created or renamed from another table?" question when a new table resembles an existing DB-only table (e.g. `data_migrations`), and a non-interactive shell cannot answer it — the push exits without applying anything while looking successful.

**Why:** A new `project_contacts` table was never created despite two "successful" push runs; the DB also contains tables (like `data_migrations`) not in `shared/schema.ts`, which push offers to drop — always abort that.

**How to apply:** After any schema push, verify with `psql "$DATABASE_URL" -c "select to_regclass('<table>');"`. If push stalls on "create or rename" prompts, run it under a pty while feeding carriage returns to accept the default (create): `(while true; do printf '\r'; sleep 2; done) | timeout 240 script -qec "npx drizzle-kit push --force" /dev/null` — plain `\n` via pipe does not work. Only safe when every prompt's default (create) is correct; abort if push offers to drop/rename existing tables you want kept.
