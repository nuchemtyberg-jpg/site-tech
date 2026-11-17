# Claude takeoff (Phase 2)

## Production prerequisite

The published app was verified as Autoscale during implementation. Autoscale can
scale to zero; it is not a reliable host for uninterrupted 10–40 minute background
work. Before relying on production takeoffs, republish on Reserved VM, or host
the worker separately on persistent compute with the same database and private
App Storage access. No deployment target was changed automatically.

Closing a browser does not stop a run. PostgreSQL worker leases and checkpoints
allow restart recovery. Only one run is processed per worker process; multiple
processes claim distinct runs with `FOR UPDATE SKIP LOCKED`. A heartbeat renews
leases. Expired running leases can be reclaimed.

## Access and instructions

Approved admin/manager/estimator users may start, cancel, continue and approve
takeoffs, edit versioned playbooks and learned rules. Regular users cannot read
these endpoints. Only admins access AI settings, pricing and the all-runs list.
The Anthropic SDK and API key are server-only; run APIs omit model messages,
tool payloads, private storage paths and credentials.

Fixed tool/safety instructions precede job-specific instructions, active learned
rules newest first, and the selected base playbook. Document text is untrusted
evidence, not an instruction source. Custom trade text matches learned-rule scope
case-insensitively. Each run snapshots its playbook, rules, model/prices, job/rates,
and selected files/pages. Original bytes are copied to private App Storage with a
SHA-256 hash, so future document replacements do not change a run. These snapshots
and persisted model/tool conversation can support Phase 3 chat; chat is not built.

## Lifecycle

`queued → running → needs_review → completed`; other terminal states are
`failed`, `cancelled`, `stopped_at_cap`. Every model response and tool result is
checkpointed. Pending tools are replayed without repeating the paid model call.
Final submission atomically creates a new estimate revision, updates whole-dollar
Expected Value, links the run and creates a bell notification. No existing
revision is overwritten, including on Continue. Phase 1 math and locks are unchanged.

Continue explicitly approves additional dollars and steps, preserving prior
partial revisions. Review completion records the approver and time. Partial
work saved at a cap remains reviewable; unfinished scope is flagged NOT QUANTIFIED.
The model has an additional `checkpoint_takeoff` tool so accumulated categories
survive a budget stop before final submission.

## Budget and caching

Prices per million tokens are editable and snapshotted per run. Defaults:
Opus 5.5 input/output/cache-read/cache-write = 4/20/.20/5 USD;
Sonnet 5.5 = 2/10/.10/2.50 USD. Defaults: $25 and 150 steps.
Costs use each response's separate usage categories. Timestamped cost events
drive calendar-month totals, including runs continued across month boundaries.

Before each generation, count prompt tokens and reserve the worst-case
input/cache-write charge plus bounded output. Near the limit, request final
submission. If there is insufficient budget for a call, save the latest
checkpoint with an unfinished-scope flag without spending more. Invalid
submissions return tool errors for correction, within the same limits.

An interrupted request can have been billed without a persisted response.
There is no claim of exactly-once Anthropic billing: the reserved amount is
counted conservatively as uncertain spend, and recorded in progress rather than
silently replaying the call. Costs reflect configured pricing, not an invoice.
429/temporary-unavailable responses use persisted exponential backoff.

Ephemeral prompt-cache boundaries cover instructions/playbook/original rates/document
manifest and the compacted tool-results conversation. Cache expiration still
applies; budget reservation assumes no cache discount. Selected-page estimates
in the wizard are heuristics, not guaranteed prices.

## Document preparation and start reliability

Anthropic model lookup, token counting and generation failures retain sanitized
operation, HTTP status, provider error type/message and request ID in run activity
and structured server logs. SDK objects, request bodies and credentials are never
serialized. A failed run's Retry action requires confirmation because it can make
paid calls; it requeues the same checkpoint with unchanged documents/settings,
spent amounts and caps. Transient retry timers reset; uncertain-call reservations
remain. Exhausted limits cannot be increased through Retry.

`npx tsx scripts/diagnose-takeoff-count.ts <run-id>` replays only the first
token-count request for a failed step-zero run, using shared system construction.
It records results without requeueing or calling generation.

Start uses a wizard request UUID, a per-user advisory transaction lock and a saved
request fingerprint. Concurrent starts/retries return the original run; reusing a
key with changed inputs returns 409. Storage-side copies pin the exact source
generation before enqueueing; no PDF is downloaded or parsed in the start request.
An older client without a key deduplicates by its input fingerprint.

Sheet selection polls a durable preparation record (202 while queued/processing).
PDF preparation and region renders execute in separate child processes, globally
limited to one via a PostgreSQL session lock. The preparer uses a 768-MiB JS heap
limit and a 15-minute process timeout; native RSS can exceed the JS heap limit.
Children exit if the parent disconnects. Failed preparations persist a readable
error and prevent model calls. Interrupted processing resumes from saved pages.

Private App Storage caches the pinned source, each page's positioned text, vector
paths and thumbnail, with a durable manifest of page count, title/label/scale and
vector status. Cache keys include file identity, document version, storage generation
and parser version. Tools read page caches rather than reopening a PDF for measurements,
text search or layer lists. Region views use isolated rendering and are cached too.
Each parsed page is cleaned up before the next. More than 100,000 paths per page
or 500,000 points in one path raises an explicit error, never silently truncating quantities.

Poppler (`poppler_utils`) is required in development and production. The native canvas
thumbnail path reproducibly segfaulted on the incident PDF; Poppler rendered it successfully.
The production build includes `dist/takeoff-preparer.cjs`. Publish applies the new
preparation-table schema; there is no startup/production migration code.

Structured logs record request arrivals, completion/abort, preparation stages,
timing, heap/RSS, process high-water RSS, renderer sampled RSS and child exit
codes/signals. They do not log API keys, document bytes or instructions.
The planning range estimates 40–120 steps of repeated cached prompts, fresh tool input
and output, plus an initial cache write. It is not clipped to the approved cap and
is not a guarantee that the cap covers all work.

### Exact-file verification, 2026-11-17

The 27,554,459-byte, 22-page `260901_FULL-SET SIGNED (1).pdf` prepared successfully
in about 117 seconds with no Anthropic calls. All 22 text/vector caches were read
back and the immutable version reused. Preparer high-water RSS: 1,027.8 MiB;
renderer sampled peak: 29.6 MiB. Sum of separate peaks: 1,057.4 MiB (conservative,
not a measured simultaneous peak). The dev web server remained running, sampled
at 352.3 MiB after preparation; its process-lifetime high-water mark was 850.3 MiB
and includes Vite startup. A 4-GiB Reserved VM is a starting recommendation for
one preparation at a time, with production monitoring; paid model runs were not
memory-profiled and these figures are not a universal maximum.

- `npx tsx scripts/test-takeoff-start.ts`: concurrent/retried starts, changed-input conflict,
  pinned source generation, failure handling, and exact-file cache readback; no model calls.

## Conversation context management

### Streaming and interrupted requests

Generation uses the official SDK `beta.messages.stream().finalMessage()`, with a
15-minute overall deadline and a 120-second idle/no-data deadline. Incoming SSE
transport bytes, including pings, reset the idle deadline. Streaming thinking/text
is never persisted: only throttled phase messages are saved. The final assembled
message supplies the original assistant blocks and usage.

Transient network errors, timeouts, HTTP 429 and 5xx/529 generation failures retry
the identical request after 2/4/8-second backoffs, at most three retries. No tools
execute from partial streams. Ambiguous attempts reserve their full conservative
amount as uncertain spend; each retry must fit that reservation within the
remaining approved cap. User cancellation does not automatically retry. Model
lookup/token-count failures have a separate bounded retry path without generation
reservations. Error telemetry includes allowlisted SDK class/cause code, elapsed
time, status and request ID, never raw transport messages or document contents.

Run facts separate confirmed usage charges and uncertain interrupted-request
reservations. Both count toward the cap. New confirmed cost events store per-step
input/cache-write/cache-read/output tokens and dollars. Historical cost events
retain their exact amounts; older per-step token breakdowns were not saved and
cannot be reconstructed from aggregate usage, so the UI labels them unavailable.
Uncertain amounts are not claims about actual Anthropic billing.

Default vector result pages now contain 25 paths (explicit pagination/limits and
full measured totals remain available). Default page images use zoom 0.5 for an
overview; explicit zoom/regions preserve access to detail. Measurement still uses
cached full-resolution vectors, not the overview image.

Durable model/tool history and outbound prior messages remain unchanged.
Client-side pruning is prohibited: a thinking signature binds all preceding
content, including user tool results. Both counting and generation use
`context-management-2025-06-27` through the beta SDK, with:
- `clear_thinking_20251015`, `keep: "all"` for cache stability;
- `clear_tool_uses_20250919`, trigger 400,000 input tokens, keep 12 tool uses,
  clear at least 50,000 tokens, excluding checkpoint/final submission tools.
Editing is applied only by Anthropic. The raw history is never synchronized to
the edited version. Response `context_management.applied_edits` and the count
endpoint's original/effective counts are saved for inspection. If the effective
context still exceeds the safe limit, fail without rewriting history.

At run creation the system blocks and ordered tools are snapshotted as JSON strings, avoiding JSONB
key-order changes. The same snapshot is reused byte-for-byte on every request,
restart, Continue and Retry. Fixed instructions, job instructions, rules, playbook,
original rates and initial document manifest are included. No changing checkpoint,
scale, index, budget warning or submit-now instruction goes into system.

Each step appends a compact checkpoint summary, calibrated scales, selected sheet
indexes and limit instructions to the newest unsent user turn, alongside tool results when present.
The full initial job is provided once; full updated jobs remain in checkpoint
tool-call inputs. Previously sent turns are never edited. A persisted wire-message
snapshot preserves JSON key order across restart.
Successful sheet indexes are saved with state; legacy successful
indexes are recovered from durable history where possible. Neither scales nor
checkpoints rely on old conversation text surviving pruning.

Retry after a signature/replay failure archives the old conversation intact and
starts a fresh user turn from the latest checkpoint. Documents/caches, settings,
original rates, usage, spent amounts, pending reservations and limits are preserved.
Recovery creates a new system/tools snapshot and server-editing policy for the
fresh conversation, with one-hour caching throughout. Recovery does not
increase spending approval. No drop-block beta header is used.

`scripts/test-thinking-context.ts` exercises signed/opaque assistant blocks over
16 mocked checkpoints and restart round trips.
`scripts/test-takeoff-worker.ts` asserts identical systems and untouched assistant
blocks through actual mocked worker checkpoint/save/restart execution.
`scripts/verify-thinking-count.ts <run-id>` is read-only and count-only. For the
legacy scale-change incident, it reconstructs the original frozen system to verify
a prior signed thinking block survives a new user checkpoint and server policy,
then separately validates fresh-checkpoint recovery. It never requeues or generates.

Before generation the worker retrieves unbilled model metadata and counts the exact
server-edited request. Input is capped at 600,000 tokens or the model's reported capacity
minus bounded output and a 4,000-token margin, whichever is smaller. Missing model
capacity uses a conservative 200,000-token window (172,000 input with 24,000 output).
Outbound histories over 20 MB fail explicitly rather than being rewritten.
If essential context cannot fit after server editing, the run fails explicitly with
its checkpoint retained and no new generation charge. This is not a cost-cap
stop; approving more dollars cannot fix oversized essential context.

### Conversation cache protocol

Two fixed system breakpoints use `ttl: "1h"`. Stable top-level
`cache_control: {type: "ephemeral", ttl: "1h"}` delegates the newest-user-message
breakpoint to Anthropic automatic caching, for three total breakpoints.
This is intentional: moving explicit per-turn markers would change earlier
message JSON, while leaving every past marker would exceed the four-marker limit.
Automatic caching implements the last-block breakpoint without client-side history
mutation. `tool_choice` stays `auto`, including budget-limit submission requests;
submit-now instructions are appended in user content instead.

Server-side clearing is triggered by the stored policy. Cache entries may be
rebuilt when clearing happens; `clear_at_least` makes those rebuilds worthwhile.
Thinking is kept rather than cleared each turn, avoiding unnecessary cache churn.
No block-binding/drop-block fallback is enabled because context editing is supported.

Legacy runs upgrade to a fresh conversation at the checkpoint before using the
new policy/tools. Broken history is archived intact. Costs, caps, documents and
preparation caches remain unchanged. No code update retries a failed run.

One-hour writes are billed at `cacheWriteHour`, defaulting to twice the input
price ($8/MTok Opus 5.5, $4/MTok Sonnet 5.5). Provider
`cache_creation.ephemeral_1h_input_tokens` is separated from total cache-write
tokens to avoid double billing; other writes retain the five-minute price.
Conservative reservations use the highest write price, not assumed future hits.

Tests: `scripts/test-prompt-cache.ts` compares byte-identical prefixes over
18 steps with scale/budget changes and simulated JSONB/restart ordering, then
checks that server-edited token counts never change the client wire prefix.
`scripts/verify-prompt-cache.ts` makes exactly two low-output paid Sonnet requests,
using synthetic data and no takeoff run. Run it only with explicit spending approval.
Provider reference: https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Context editing reference: https://platform.claude.com/docs/en/build-with-claude/context-editing

### Avoiding oversized submissions

`checkpoint_category` upserts one validated Phase 1 category into the stored job,
without retransmitting the immutable rate tables. `submit_takeoff` can finalize
that job with `use_checkpoint:true`. Full-job submission remains supported for
compatibility. All paths use the same validation and calculation engine.
Responses stopped at `max_tokens` never execute partial tool arguments. Claude is
asked to checkpoint smaller categories; two consecutive truncations fail the run
instead of repeatedly buying another full-job output. Tool duration and success
are recorded separately from model-generation duration.

Live test scripts require explicit spending approval:
- `scripts/test-takeoff-live-fixture.ts`: synthetic 3-page PDF, Sonnet 5.5, $1 cap,
  low server-editing threshold, requires actual applied edits and cache reads.
- `scripts/verify-signed-context-live.ts`: synthetic Opus probe capped at $0.25,
  requires both prior signed thinking and an actual server edit on a generated response.
  Acceptance without applied edits does not satisfy that assertion.

## Claude-added named material rates

The fixed prompt is trade-neutral: follow the playbook for the trade and read
general notes, legends, schedules, geotech and trade-specific notes.
Claude may append new named material rates for repeated materials according to
the playbook. Each new row requires a unique valid key/ID, description, unit and
nonblank number/formula; optional category/notes capture provenance. The unchanged
Phase 1 engine checks dependencies, cycles and finite formula values.

The original rates are snapshotted independently before work starts. Validation
protects both that snapshot and all rates already accepted in the latest checkpoint:
no removal or edits to existing keys, values, IDs or metadata; no changes to
labor/equipment tables, defaults or markup notes. Legacy active runs establish their
baseline from the saved job, because the previous implementation disallowed additions.
Legacy completed runs without a baseline are not falsely attributed added rates.

The sanitized run response lists additions relative to the original baseline,
with the original expression and server-computed value. Review displays
**Rates added by Claude — verify**, including key, description, unit and price.
These remain estimate-local; company promotion is an explicit, separate workflow.
Checkpointing, restart and Continue preserve provenance and do not reset the baseline.

## Tools and measurement boundaries

PDF.js provides positioned text, optional-content information and vector paths;
@napi-rs/canvas renders previews. Page coordinates are top-left PDF points after
page transforms. Model-selected/calibrated scale is stored in feet per point.
No measuring tool invents a scale.

- `sheet_index`: selected pages, title-block text, candidate sheet labels, scale
  text and vector presence. Labels are candidates to verify visually, not OCR
  guarantees. Mixed raster/vector sheets still require judgment.
- `page_text`: positioned text, optionally restricted to a region.
- `view_page`: rendered page or zoom/crop; raster measurements must be flagged
  approximate.
- `layers`: named optional-content groups with path counts; unlayered PDFs return
  an empty list.
- `measure_lines`, `measure_areas`: vector lengths/closed-boundary areas with
  layer/color/weight/region filters and paginated geometry. Region filters select
  fully contained paths, not clipped portions. Areas are individual boundaries,
  not a union: nested rings, overlaps and hatch strokes require review. Curves
  are flattened into 32 segments and explicitly identified.
- `find_text`: literal text or bounded simple glob patterns, with positions.
  Arbitrary regular expressions are intentionally not executed.
- `set_scale`, `calibrate`: explicit sheet scale with source/method.
- `read_spreadsheet`: XLSX/CSV rows; cached formula values are read, not executed.
- `evaluate`: unchanged Phase 1 formula resolver.
- `checkpoint_takeoff`, `submit_takeoff`: validated Phase 1 job, unique IDs,
  append-only named material rates with existing rate snapshots protected, no manual prices/markup overrides, required
  references, valid formulas and finite authoritative totals.

Documents are limited to 40 MB, PDFs to 500 pages, spreadsheets to 20,000 rows.
Unsupported/encrypted/unreadable files fail explicitly. All raw file reads use
private object-storage paths, not model-provided network URLs.

## Verification

- `npx tsx --test scripts/test-takeoff-tools.ts scripts/test-estimating-engine.ts`
- `npx tsx --test scripts/test-takeoff-context.ts` — pruning, pairing, token limits, canonical state and legacy hydration.
- `npx tsx scripts/test-takeoff-worker.ts` — mocked Anthropic, no paid requests:
  submission, saved-tool restart recovery, caps, cancellation, notification,
  persisted sheet indexes/scales, rate provenance and oversized-request guards.
- `npx tsx scripts/test-estimating-api.ts` — authorization and Phase 1 regressions.
- `npx tsx scripts/test-estimating-browser.ts` — signed-in wizard/playbook and editor.
- `npx tsx scripts/test-takeoff-review-browser.ts` — synthetic completed-run API, added-rate review/approval and mobile layout; no model calls.
- `npm run test:client`, `npm run build`

Known-dimension PDF tests verify a 30-foot vector line and 1,800-SF rectangle.
These are not a substitute for validating a real production drawing set or a
paid end-to-end Claude run. No user bid documents were sent during implementation.

## Single-call and sectioned modes

Admin AI settings → **Takeoff mode**: `Agent` (default, the multi-step tool loop above),
`Single call` or `Sectioned`. The mode is snapshotted per run, so switching it never
affects a run already queued or running. Code: `server/takeoff/single.ts`.

**Single call** sends every selected page in one request. PDFs are cut down to the
selected pages with pdf-lib (inline under 20 MB, otherwise uploaded through the Files
API), spreadsheets as rows, images as image blocks. Instructions, learned rules, playbook
and rate tables go in the system prompt. The response is constrained with
`output_config.format` (JSON schema: categories, newRates, summary, questions); IDs are
assigned server-side and markups forced blank.

**Sectioned** is for large sets. `claude-haiku-5-5` reads the prepared sheet index
(sheet number, title block, scale, first ~700 characters of text per page; no images)
and returns 2–6 scope sections plus a short list of shared sheets (general notes,
legends, geotech). Each section then runs as its own request, in parallel, with only its
sheets plus the shared sheets and an explicit "quantify only this scope; other sections
cover …" instruction. Results are merged in code: categories kept apart (renamed
"Name (Section)" on a name clash), the first definition of a new rate key wins, questions
prefixed with the section. If the planner fails, the run falls back to one request.
Sets of 3 pages or fewer skip the planner.

Both modes reuse `validateSubmission` and the `finishRun` revision flow. A failed
validation is sent back once for correction; a second failure fails that request.
Finished sections are saved in `state.sectionOutputs`, so Retry re-runs only the failed
sections. In-flight reservations are kept in `pendingCall` and counted as uncertain spend
on Retry, like agent mode. Effort is set by **Single/sectioned effort** (default `high`).
No vector measurement tools are used: scaled quantities are flagged VERIFY
"approximate - scaled from drawing".

- `npx tsx --test scripts/test-takeoff-single.ts` — mocked client, no paid requests.
