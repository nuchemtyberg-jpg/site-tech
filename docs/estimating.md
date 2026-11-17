# Estimating

## Phase-one boundary
Estimates belong to Opportunities and are independent of the scope checklist.
Nothing in estimating creates or changes contracts, awards, project tasks, or
pay applications. Proposal generation is a future phase. Phase 2 AI takeoff
is documented in `docs/claude-takeoff.md`.

## Access
Approved admins, managers and estimators may read/write estimates and company
estimating rates, and view Opportunity bid values. Regular users cannot see the
Estimate tab or access any estimate/rate API. Only admins manage users and assign
roles. Estimating access does not grant access to other Admin Settings sections
or change Project financial permissions.

## Data contract
`shared/estimating/model.ts` defines the validated, version-one job structure.
The field names match the office form: `rates`, `laborRates`, `equipRates`,
`categories[].items[].res.{mat,lab,eq,sub}` and string-valued expressions. Stable
IDs identify categories, lines, rows and rate types. UI expansion state is not
stored. Estimate defaults are an additional `defaults.{tax,oh,ins,profit}` object.
Future AI writers must submit this same validated structure to the revision API;
they must not write client-calculated totals or mutate locked database rows.

Company rates are stored in `estimating_company_rates`, with a version token.
Every revision in `estimate_revisions` owns its complete rate snapshot and job,
plus server-calculated summary, revision number/name, created/saved actor and
timestamps, optimistic version, lock flag and reason. The revision picker API
returns metadata/summaries only; a separate request loads one full job.

## Calculation and compatibility
The browser and server use `shared/estimating/engine.ts` and the non-executable
arithmetic parser in `formulas.ts`. No eval or Function execution is permitted.
Expressions support named-rate dependencies, `qty` in resource rows, arithmetic,
powers, brackets, feet/inches, and currency formatting. Draft estimates may save
invalid expressions and cyclic rates after a UI confirmation; those fields count
as zero and remain highlighted for correction. Invalid manual unit prices are
the exception: pricing falls back to the calculated unit price with a field error.
Blank-field defaults are distinct
from invalid formulas. Nonfinite calculated results cannot be saved, and company
rate settings still require valid formulas. Missing typed labor/equipment
references are preserved with explicit zero-cost warnings, as in the source
form; a matching imported total is not an assertion that all costs are resolved.

Use full JavaScript-number precision throughout, without intermediate rounding.
Round only for display/CSV formatting and reference comparison. The supplied
Eyes on 9 fixture matches $765,591.76 sell and $614,435.52 direct cost, with 15
missing labor-rate warnings. Blank imported estimate defaults are zero; new jobs
copy company defaults. Blank line markup inherits category, blank category
inherits estimate defaults, and explicit zero overrides inheritance.

Written requirements override two source-form differences: SF/SY/CY multiply
by count; missing equipment periods use the nearest explicitly filled period.
Equidistant period ties prefer the shorter period. Units convert at 8 hours/day,
5 days/week, 4 weeks/month. Explicit period values are never overwritten.
Blank material/sub quantities with costs mean one; blank workers/units mean one;
blank basis means day; zero line quantity uses the total as unit price and one
as the manual-price multiplier. Material descriptions also supply steel weights.

Price order is material including waste, material tax, labor/equipment/sub
direct cost, overhead, insurance on cost plus overhead, then profit on that
subtotal. Manual unit prices override sell and recalculate residual profit.
Excluded work remains editable with would-be amounts but does not roll up.

## Revisions, conflicts and locks
Start creates Rev 0. Save overwrites only the selected unlocked revision using
its exact optimistic `version`. Save as revision snapshots the current draft
under the next number and optional name, leaving the source unchanged.
Imports create a new revision named “Imported from takeoff form”, with the
file's rates and zero estimate-default markups. Unsupported formats are rejected.

A transaction locks the Opportunity row while assigning revision numbers,
saving revisions and synchronizing Expected Value. This serializes concurrent
saves and guarantees unique consecutive numbering. Stale overwrites return 409
with the current revision. The editor keeps the draft and offers loading the
other version or saving a new revision.

Locked overwrites return 423 regardless of the client's version token.
There is no public lock/unlock endpoint in phase one. Future proposal creation
must call `lockEstimateRevision` within the same transaction as its proposal
snapshot, passing the exact expected revision version, Opportunity ID, revision
ID and lock reason. Proposal creation must retain that immutable revision ID.
Editing a locked draft is allowed locally, but persistence requires a new revision.

Saving the newest revision writes its sell total rounded to whole dollars to
Opportunity Expected Value and records `expectedValueEstimateRevision`. Saving
an older revision does not change that value. A later manual change to Expected
Value clears its estimate-source label; the next newest estimate save restores it.
Cents and fractional intermediate amounts remain in the estimate itself.

## Refresh and exports
Refresh from company rates is confirmed and affects the local draft only until
saved. Types match by ID first, then case-insensitive name; cost rows are repointed
to the matched company ID. Unmatched types are retained to avoid orphaning old
cost rows. Estimate default markups remain unchanged unless “Also replace default
markups” is selected. Matching named keys/IDs are refreshed and remaining
estimate-specific rates retained. Formula errors remain visible after refresh.
Cover view/CSV omit excluded categories and lines and renumber included work.
Detailed CSV retains every line, costs, markups and inclusion status. CSV cells
are quoted and text is protected against spreadsheet formula injection.

## Verification
- `npx tsx --test scripts/test-estimating-engine.ts`
- `npx tsx scripts/test-estimating-api.ts` (development only, temporary fixtures)
- `npm run test:client`
- `scripts/verify-schema.ts` verifies the added tables and provenance column.

The estimating endpoints accept bounded 5 MB JSON requests; unrelated endpoints
retain their existing request limits. Estimate payloads are not printed to the
standard request log. Existing schema synchronization includes the new tables.
