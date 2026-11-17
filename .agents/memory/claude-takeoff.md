---
name: Claude takeoff safety and deployment
description: Durable Phase 2 scope, spending and hosting decisions.
---

Claude must produce the existing Phase 1 estimate structure, never change its calculation engine or overwrite a revision. Estimators can both run and approve; chat is explicitly Phase 3, not part of Phase 2.

**Why:** The owner wants AI to populate the proven editor, not replace pricing or revision protections.

**How to apply:** Preserve document, playbook/rule and rate snapshots plus tool messages for future chat. Use only server-side Anthropic calls.

Reserve spend before requests; an interrupted call may have incurred charges without a response. Count its reservation conservatively rather than promising exactly-once external billing.

**Why:** Local transactions cannot make an Anthropic API request atomic with PostgreSQL. Silent replay can breach an approved cap.

**How to apply:** Keep uncertain charges visible and require explicit approval for more spending. Long-running production workers need persistent compute; do not claim Autoscale guarantees uninterrupted runs.

Compare rate snapshot objects structurally, not by JSON string order.

**Why:** PostgreSQL JSONB reorders object keys; string comparison falsely rejected unchanged rates in recovered tool submissions.

**How to apply:** Use deep object equality for validation across database round trips.

Context compaction must retain canonical checkpoint/scales/sheet indexes independently of conversation text, and named-rate additions must stay attributable to the original snapshot.

**Why:** The owner permits Claude to add reusable material keys, not to rewrite existing prices; long drawing runs must not depend on resending old images or geometry.

**How to apply:** Preserve the original baseline through checkpoints, restart and Continue; prune outbound copies, never the data needed to recover unfinished work.
