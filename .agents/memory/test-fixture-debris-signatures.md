---
name: Recognizing test fixture debris in dev DB
description: How to tell leftover automated-test rows apart from real business data before deciding to migrate/delete/backfill them.
---

Signals that a row is test debris rather than real business data, in this project's dev database:
- Name or email contains a random alphanumeric suffix (e.g. "Test Project laePSF", "Auto-5lbmYd", "auto-5lbmyd-3@updates.sitetechnj.com", customer "John Smith lcIDiH", user id "U8UvZp").
- Literal test markers in the name (e.g. "__PC Test Project NoCust", "Test company").
- Blank description/notes/address despite the row otherwise looking populated.
- Matches a naming pattern also produced by a test script's own fixtures (e.g. `scripts/test-project-contacts-api.ts` creates "__PC Test Project" / "__PC Test Project NoCust" and normally hard-deletes them in a `finally` block — surviving rows mean that cleanup didn't run to completion).

**Why:** Whole dev databases can be seeded entirely with such fixtures (customers, users, projects all following this pattern), so don't assume a row with real-looking attached content (uploaded files, folders, photo albums) is genuine — those can be auto-created feature-test artifacts too.

**How to apply:** When a migration/backfill needs a decision about rows like this (e.g. missing a required foreign key), treat "assign a fabricated real-looking value" as worse than the alternatives. A shared, clearly-named placeholder record (e.g. a customer literally named "Unassigned Customer" with a note explaining its purpose) is an acceptable one-time backfill for existing orphaned rows, but should not become the default behavior for future rows of the same kind — the primary path (a human assigns the real value) should stay intact going forward. Confirm with the user before bulk-deleting or bulk-backfilling if there's any ambiguity about whether content is genuine.
