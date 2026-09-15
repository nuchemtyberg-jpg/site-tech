---
name: drizzle sql`` numeric params binding to substring() as text, not int
description: Postgres substring(text FROM int) silently resolves to the regex-pattern overload when the position argument arrives as an untyped bound parameter, returning wrong/NULL results with no error.
---

When building raw SQL with drizzle's `sql\`...\`` tag (e.g. in `tx.execute(sql\`...\`)`), interpolating a JS number directly into `substring(col FROM ${n})` sends it as a parameter with no type hint. Postgres has two `substring` overloads — position-based (`substring(text, int)`) and regex-based (`substring(text, text)`) — and an untyped parameter can resolve to the regex overload instead of the intended position one. The query runs without error but returns NULL/0 instead of the expected substring, which silently breaks logic like "compute next sequence number from an existing formatted string."

**Why:** discovered while writing a data migration that reused the existing `OPP-YYYY-NNNN` numbering pattern (`substring(opportunity_number from N)::int`) — it always computed 0 even with existing numbered rows, causing duplicate-key collisions on insert.

**How to apply:** for a numeric literal used as a SQL position/length argument (not real user data), use `sql.raw(String(n))` or cast explicitly (`${n}::int`) instead of a bare `${n}` interpolation, so Postgres has an unambiguous type and picks the correct overload. Prefer testing raw-SQL migrations that mimic existing app-level numbering logic against a real transaction before trusting them.
