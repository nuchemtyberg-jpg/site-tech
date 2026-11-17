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

Use streamed generation for long reasoning, with separate overall and transport-idle deadlines.

**Why:** A long generation hit the two-minute non-streaming deadline, while a conservative reservation made the displayed spend exceed confirmed usage. Earlier unstructured error filtering also erased the SDK timeout classification.

**How to apply:** Execute only complete final-message tools, retain signed blocks, report confirmed and uncertain spend separately, and preserve safe SDK error classes/codes without logging raw requests. Count SSE pings as transport activity.

Compare rate snapshot objects structurally, not by JSON string order.

**Why:** PostgreSQL JSONB reorders object keys; string comparison falsely rejected unchanged rates in recovered tool submissions.

**How to apply:** Use deep object equality for validation across database round trips.

Context compaction must retain canonical checkpoint/scales/sheet indexes independently of conversation text, and named-rate additions must stay attributable to the original snapshot.

**Why:** The owner permits Claude to add reusable material keys, not to rewrite existing prices; long drawing runs must not depend on resending old images or geometry.

**How to apply:** Preserve the original baseline through checkpoints, restart and Continue. Use server-side context editing; do not rewrite outbound historical messages.

Thinking signatures bind the complete preceding prefix, including older user tool results, not just the system.

**Why:** A scale change in system caused the first incident; later, client-side rewriting of an old tool result invalidated downstream thinking despite keeping the assistant blocks unchanged.

**How to apply:** Keep system, tools and all earlier messages unchanged. Use Anthropic server-side context editing, never local tool-result substitution. Archive a broken conversation before fresh-checkpoint recovery; retain spend and limits.

Conversation caching requires stable wire prefixes, not just stable system instructions.

**Why:** System-only breakpoints left growing tool/image history uncached; pruning every step changed the prefix. Repeated full-job reminders also created unnecessary fresh input.

**How to apply:** Freeze ordered tools and prior wire messages as strings across JSONB round trips. Append compact context only to unsent user turns and keep tool choice stable. Server-side editing may rebuild a cache; local prefix mutation is never safe. Use one-hour automatic caching for long runs and account for its write price.

Large estimate submissions should checkpoint individual categories and finalize the stored job.

**Why:** Full-job submission repeatedly exhausted the output limit, producing incomplete arguments and expensive retries instead of a valid estimate.

**How to apply:** Preserve the Phase 1 stored structure and rates server-side; never execute truncated tool arguments. Cap repeated truncations rather than looping indefinitely.

A low server-editing trigger is not proof that an edit occurred.

**Why:** Small synthetic histories were accepted with signed thinking but the provider returned no applied edits despite the low threshold.

**How to apply:** Assert actual `applied_edits` and the presence of prior signed blocks in the same generated request when testing that combination. Separate successful counting, successful generation and actual clearing in reports.

Native canvas PDF rendering cannot be assumed safe for signed construction plan sets.

**Why:** The office's 22-page signed drawing set reproducibly caused SIGSEGV during thumbnail rendering, after successful text/vector extraction. A native crash cannot be caught by Express.

**How to apply:** Keep PDF work outside the web process, use the separate Poppler rendering path, and validate with real drawings as well as generated PDFs. Keep cache provenance tied to immutable storage generations.
