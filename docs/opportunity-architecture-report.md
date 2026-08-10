# Opportunity / RFP Architecture Report (Phase 4)

_Written August 2026 as part of the Opportunity backend foundation. Nothing in
this report changes existing Project behavior — it documents current state and
the recommended migration path._

## 1. How Projects use `new` / `bidding` / `bid_lost` today

`shared/projectStatus.ts` defines the project lifecycle:
`new → bidding → active → completed`, with `bid_lost` and `cancelled` as
terminal branches (plus `on_hold`).

In practice, the app currently uses **Projects as a stand-in for pre-award
work**:

- A Project is created as soon as an RFP arrives (status `new`), long before
  any work is awarded.
- While the estimate is prepared and the bid is out, the Project sits in
  `bidding`. Workflow rules (trigger type `project_status_change`) commonly
  fire on the move to `bidding` — e.g. "assign 'Complete takeoff' to the
  estimator, due in 3 days."
- If the bid is not won, the Project is moved to `bid_lost` and lingers in the
  project list (filtered out of most default views but still a Project row,
  with schedule entries, files, todos, and activity attached to it).

This conflates two different things: *potential work being evaluated* and
*actual awarded jobs*. Consequences today: project numbers get consumed by
jobs that never happen, reporting on "real" projects requires excluding
`new`/`bidding`/`bid_lost`, and pre-award data (bid due dates, lost reasons,
probability) has nowhere structured to live.

## 2. How Opportunities should eventually replace pre-award Projects

Phase 4 introduces the `opportunities` table with its own lifecycle
(`new → under_review → estimating → proposal_ready → proposal_sent →
follow_up → awarded / lost / no_bid`, plus `on_hold`), its own numbering
(`OPP-YYYY-NNNN`), contacts with opportunity-specific roles, status history,
workflow triggers (`opportunity_status_change`), todo links, and communication
links.

Recommended end state (later phases, **no destructive change now**):

1. **New RFPs become Opportunities, not Projects.** Intake starts on the
   Opportunities page; a Project is only created when an Opportunity is
   awarded.
2. **Award conversion (future phase).** When an Opportunity moves to
   `awarded`, a conversion action creates the Project (copying customer,
   address, contacts, scope) and stores the link in
   `opportunities.converted_project_id` (column already exists, nullable).
   The Opportunity remains as the historical bid record.
3. **Project statuses shrink.** Once conversion exists, `new`, `bidding`, and
   `bid_lost` become legacy project statuses. Keep them defined (historical
   rows must stay valid and old workflow rules must not break), but stop
   offering them for new Projects; Projects then effectively start at
   `active`.
4. **Existing pre-award Projects are migrated only deliberately.** Do not
   auto-migrate. Options, in order of preference:
   - leave historical `bid_lost` Projects untouched (they are history);
   - offer an admin-only "convert to Opportunity" action for currently
     `new`/`bidding` Projects, which creates an Opportunity, moves todos'
     `relatedEntityType` links, and archives the Project.
5. **Workflow rules.** Project-trigger rules on `bidding` should be duplicated
   as opportunity-trigger rules on `estimating`/`proposal_sent` by the admin;
   the rules UI now supports both trigger types side by side.

## 3. Linking documents/files to Opportunities (recommendation)

Current state: file/document infrastructure is **project-scoped**. `files`
rows hang off `projectId` (folders, daily-report photos, PDFs), and company
documents are a separate admin-scoped area. There is no generic
"attach a file to any entity" mechanism.

Recommended approach (documented only; not built in Phase 4):

- **Add a polymorphic link on `files`,** mirroring the pattern already proven
  by `todos.related_entity_type` / `related_entity_id`:
  - add nullable `related_entity_type` (`'project' | 'opportunity'`) and
    `related_entity_id` columns to `files`;
  - backfill existing rows as `('project', project_id)` in a single
    non-destructive migration, keeping `project_id` in place so nothing that
    reads it breaks;
  - new opportunity uploads write `('opportunity', opportunity_id)` with
    `project_id NULL` (requires relaxing the NOT NULL constraint the same way
    `workflow_executions.project_id` was relaxed in this phase).
- **Do not build a separate `opportunity_files` table.** A second parallel
  file system would duplicate upload endpoints, storage ACL logic, and viewer
  routes; the polymorphic column keeps one pipeline.
- On award conversion, opportunity files can be re-pointed (or copied) to the
  new Project in the same transaction as conversion.
- Object storage paths should namespace by entity, e.g.
  `opportunities/{id}/...` vs today's project paths, so ACL checks can resolve
  the owning entity from the path.

## 4. What Phase 4 explicitly did not touch

- No existing Project statuses, routes, or workflow rules changed behavior
  (project rules are `trigger_type = 'project_status_change'`; the new
  opportunity trigger is additive).
- No migration of existing `bidding` projects.
- No Opportunity → Project conversion (only `award_date` and the nullable
  `converted_project_id` column exist).
- No file/document linking (recommendation above only).
