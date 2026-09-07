---
name: drizzle-kit push interactive prompts
description: db:push can silently stall on create-vs-rename prompts; verify tables actually exist after pushing.
---

`npm run db:push` (drizzle-kit push) asks an interactive "created or renamed from another table?" question when a new table resembles an existing DB-only table (e.g. `data_migrations`), and a non-interactive shell cannot answer it — the push exits without applying anything while looking successful.

**Why:** A new table was never created despite two "successful" push runs. A migration-ledger table created only with raw SQL also caused automated setup to wait indefinitely for permission to delete it.

**How to apply:** Declare every application-owned table in the Drizzle schema, including raw-SQL migration ledgers. Verify new tables explicitly after pushing. If a legitimate create prompt remains, use the documented pty method only when every default choice is known to be safe.
