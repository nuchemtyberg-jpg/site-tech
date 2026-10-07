---
name: Bidding and contract lifecycle
description: Editable bids after award, multiple contracts per Project, and deferred change orders
---

Bidding remains accessible and editable after a job is active in Projects. The first awarded bid creates the Project; a separate bid for additional scope can be explicitly linked and awarded to that same Project as another contract.

**Why:** The user clarified that active jobs can receive additional scopes. A one-time handoff to a read-only bid would prevent their intended workflow.

**How to apply:** Preserve bid identity and award history, support multiple bids/contracts per Project, and never create another Project just because an additional bid is awarded. Do not treat post-award Bidding access as read-only.

Additional scope can also be handled by a change order to the existing bid, but the user explicitly deferred the change-order feature until later.

**Why:** Separate linked bids/contracts are the current scope; contractual amendments are a distinct future feature.

**How to apply:** Do not include change-order implementation or silently rewrite agreed terms as part of award conversion.
