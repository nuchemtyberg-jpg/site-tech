# Bidding → linked Projects and contracts

## Handoff inventory

Award is an additive association, not a transfer. The original Opportunity URL,
record ID and number remain permanent. No child row or object is copied,
deleted, re-uploaded, flattened, or repointed by award.

| Source | New standalone Project | Existing target Project | History/access |
|---|---|---|---|
| Customer, name | Map to customer/name | Never overwrite | Live bid + full award snapshot |
| Street, city, state, ZIP | Map corresponding address fields | Never overwrite | Live bid + snapshot |
| Address line 2 | No operational counterpart | Never overwrite | Live bid, edit form + snapshot |
| Scope summary, internal notes | Map description/notes | Never overwrite | Live bid + immutable snapshot |
| Expected value | Initial estimated value (dollars) | Never overwrite | Immutable contract amount, separate pending totals |
| Responsible user, source, project type, probability | No counterpart | Never overwrite | Bid overview/edit form + snapshot |
| RFP received, bid due date/time, estimated start | No counterpart; actual start stays unset | Never overwrite dates | Bid dates + snapshot |
| Lost/No Bid reasons/notes, award date | Award date belongs to contract, not work start | Never overwrite | Bid outcome/status history + snapshot |
| Opportunity number, creator, timestamps, archive/deletion flags | Retain original bid number | Never overwrite | Linked bid + snapshot |
| Converted Project ID | New Project association | Selected target association | One unique contract per bid |
| Historical source Project ID/number | Retain provenance; never restore source | Retain provenance | Bid's read-only migration history |
| Contacts and bidding roles/primary flag | Stay on bid, same IDs | Stay on each bid | Project Bids & Contracts → Open in Bidding → Contacts |
| Todos (open and completed), assignments, comments, attachments | Stay on bid, same IDs | Stay on each bid | Linked bid Todos and existing todo detail links |
| Reminders, workflow executions/notifications | Same identities and links | Same identities and links | Existing My Work, notifications + linked bid |
| Communications and attachments | Stay on bid | Stay on each bid | Linked bid Communications |
| Scope items/statuses/notes/linked todos | Stay on bid; scope captured at award | Stay on each bid | Linked bid Scope + immutable original checklist |
| Activity/status history, actors, timestamps | Stay on bid; atomic award audit also in Project activity | Stay on each bid | Linked bid Activity/history |
| All folders, including renamed presets, nested, empty and tombstones | Alias original bid tree, no seeding | Labeled independent bid source | Shared Documents in both sections |
| Files/groups/versions/status/paths/uploader/date/folder/name/tags/star/category/description/tombstones | Same records; no ownership change | Same bid records, no merging | Shared Documents + version history/downloads |

## Atomicity and concurrency

Award locks the bid and then the explicitly selected target Project. Bid edits
and document mutations take the same bid lock. Number allocation uses a shared
transaction advisory lock for both normal creation and award creation, takes the
numeric maximum including deleted numbers, and never guesses a Project match.
The contract uniqueness constraint is on Opportunity ID.

Project creation/email identity, bid award/link, contract/scope snapshot,
status history, audit, workflow claims, workflow todos and notifications commit
together. Email is queued after commit, following existing workflow semantics.
Catch-up does not replay the historical award's workflow effects.

Related work stays on the bid, so concurrent todo/contact/communication writes,
reminder links and in-flight uploads cannot be stranded by conversion. Project
document aliases resolve server-side and validate any supplied bid source
against that Project, then use the bid's canonical lock. This avoids both
numeric-ID confusion and a Project→bid versus bid→Project deadlock.

Later bid edits neither update the snapshot nor the operational Project.
Amounts displayed in Bids & Contracts come from one contract per awarded bid;
pending amounts exclude awarded, Lost and No Bid bids. Both are dollar units.

Bid financial values stay admin-only after handoff: Projects created by award
are identified from the immutable original-contract provenance. Their operational
estimated value is retained for admins but redacted from staff list/detail,
customer-project lists, Bids & Contracts and mutation responses. Staff cannot
edit that restricted field. Existing native Projects receiving additional
contracts keep their existing operational-value visibility policy.

## Existing records

Implementation inspection found no awarded or linked live Opportunities in the
development database, and historical migration provenance points to retired
source Projects. This is an observation, not a migration assumption.

Catch-up is an admin-only preview and explicit selection/confirmation. It calls
the same award transaction, preserves original award dates and original history,
and reports missing dates/customers/targets, deleted targets and broken existing
links rather than creating replacements. There is no startup award conversion.

Retired source Project fields, contacts with original role labels, tasks, todos,
communications, folders/files, photos/albums, daily reports and their task/labor/
equipment/delivery/inspection/photo records, emails/attachments, RFIs/responses,
scheduling, allocations, payroll mappings, report recipients and status/activity history remain read-only in
the bid's migration-history view. Existing migrated document trees retain their
current bid ownership. Historical records are never restored or merged into the
new operational Project; deleted records are not made live.

## Lifecycle protections

Lost/No Bid bids must reopen before award. An awarded bid cannot change customer
or target, reverse status, or create a second association. Deleting a Project
with awarded contracts is rejected. Project status changes never reverse
contracts. Change orders and award reversal are separate future workflows.
