---
name: Derived status from checklist items
description: How to expose a workflow-stage indicator (e.g. readiness) computed from a set of child item statuses, without a second stored status field.
---

When a parent record (e.g. an Opportunity) needs a coarse workflow-stage indicator that depends entirely on the state of its child items (e.g. a scope/checklist's items each being Included/Excluded/Needs Clarification/Not Reviewed), compute it on read instead of storing it as a column on the parent.

**Why:** A stored second status invites drift from the item-level truth (someone edits an item, forgets to recompute; a bug leaves it stale) and risks conflicting with the parent's own primary status field, which is a source of confusion for users and code alike.

**How to apply:** Put the pure computation (counts → label) in a shared module so both server responses and client UI use the identical rule, and return it as a derived field in list/detail API payloads rather than persisting it. Only every item being intentionally resolved (not just "touched") with zero outstanding "needs clarification" items should count as the fully-ready terminal state.
