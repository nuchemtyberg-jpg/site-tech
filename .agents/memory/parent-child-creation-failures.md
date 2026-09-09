---
name: Parent-child creation failures
description: How to handle sequential creation when the primary record succeeds but an optional related record fails.
---

When a flow creates a primary record and then an optional related record, a failure in the related request is partial success. Return and select the created primary record, report the related-record failure explicitly, and never encourage retrying the whole submission.

**Why:** Retrying the original submission after the primary request succeeded creates duplicate primary records and still does not guarantee the related record will succeed.

**How to apply:** In any sequential parent-then-child creation flow, distinguish parent failure from child failure. Invalidate and expose the parent after it exists, and make any retry child-only.