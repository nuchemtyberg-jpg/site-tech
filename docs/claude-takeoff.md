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

Durable model/tool history remains unchanged for recovery and future chat. Outbound
copies retain the latest 12 tool results in full, replacing older text/images with
`[older result removed to save context — call the tool again if needed]`. Tool IDs,
result pairing and error flags remain intact. If counted input is still too large,
the worker retries with six results, then zero. As a final pass it removes the
completed conversation (including repeated full-job tool inputs), using a fresh
continuation message and the canonical checkpoint. Unfinished tool calls must be
resolved before this pass; a pending tool is never lost or executed again because
of pruning. Size errors from counting also trigger compaction; unrelated errors
retain the normal retry/failure policy.

Each step supplies the current full checkpoint job, calibrated scales and selected
sheet indexes as untrusted data, separately from the immutable original-rate snapshot
and instructions. Successful sheet indexes are saved with state; legacy successful
indexes are recovered from durable history where possible. Neither scales nor
checkpoints rely on old conversation text surviving pruning.

Before generation the worker retrieves unbilled model metadata and counts the exact
compacted request. Input is capped at 600,000 tokens or the model's reported capacity
minus bounded output and a 4,000-token margin, whichever is smaller. Missing model
capacity uses a conservative 200,000-token window (172,000 input with 24,000 output).
Outbound histories over 20 MB skip toward compaction before the counting call.
If essential context cannot fit after all passes, the run fails explicitly with
its checkpoint retained, no new generation charge, and advice to shorten the
playbook/rate notes or start a smaller document selection. This is not a cost-cap
stop; approving more dollars cannot fix oversized essential context.

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
