---
name: Dashboard facet summaries
description: How operational dashboard defaults should interact with clickable summary totals.
---

An operational dashboard may apply an implicit default filter to its result list, but a clickable summary for the excluded facet must be computed without that implicit facet filter.

**Why:** Applying an implicit “active only” status filter to an outcome-count summary makes the Outcomes card permanently show zero even when matching records exist. The list predicate is correct, but the navigation summary becomes misleading and unusable.

**How to apply:** Build each cross-facet summary from the shared non-facet filters (search, owner, customer, dates, archive scope), then omit only the facet’s own implicit default. Preserve explicit user-selected facet filters when the product intends summaries to reflect them.