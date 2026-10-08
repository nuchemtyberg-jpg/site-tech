---
name: Bidding and contract lifecycle
description: Editable bids after award, multiple contracts per Project, and deferred change orders
---

Bidding remains accessible and editable after a job is active in Projects. The first awarded bid creates the Project; a separate bid for additional scope can be explicitly linked and awarded to that same Project as another contract.

**Why:** The user clarified that active jobs can receive additional scopes. A one-time handoff to a read-only bid would prevent their intended workflow.

**How to apply:** Preserve bid identity and award history, support multiple bids/contracts per Project, and never create another Project just because an additional bid is awarded. Do not treat post-award Bidding access as read-only.

Newly awarded Projects start in New, with award date separate from actual work start. Historic source Projects stay retired; residual operational history is evidence, not a template to restore.

**Why:** Award confirms committed scope but does not mean fieldwork has started. The user expressly prohibits restoring or overwriting retired source Projects and requires historical provenance to remain accessible.

**How to apply:** Do not invent work dates or match jobs by name/address. Any catch-up must be previewed and explicitly approved, with broken links reported instead of replacement Projects.

Award must not broaden access to restricted bid finances. Preserve the operational value, but retain the source bid's admin-only financial visibility when it creates the Project.

**Why:** Mapping a restricted bid value to a normally visible Project field otherwise bypasses the original permission boundary, even if the contract view redacts its own amount.

**How to apply:** Apply the origin-aware restriction consistently across list/detail, embedded Project responses, customer views, mutation echoes and UI. Additional awards must not change unrelated native Project policy.

Additional scope can also be handled by a change order to the existing bid, but the user explicitly deferred the change-order feature until later.

**Why:** Separate linked bids/contracts are the current scope; contractual amendments are a distinct future feature.

**How to apply:** Do not include change-order implementation or silently rewrite agreed terms as part of award conversion.
