---
name: Estimating compatibility and scope
description: Owner's estimating boundaries and legacy form precision rules.
---

Opportunity estimates must be independent of the existing bid scope checklist. Do not change award, contract, task, or pay application behavior as part of estimating phase one.

**Why:** The office is replacing an existing Takeoff & Pricing form, not extending the scope checklist. Earlier scope-linked takeoff plans do not reflect the current request.

**How to apply:** Preserve the legacy JSON field names and rate/type IDs so imported formulas remain meaningful; avoid creating links to scope checklist items.

Calculations retain full precision at every intermediate step. Round to cents only for display/comparison, and to whole dollars only when writing the newest estimate total to Opportunity Expected Value. Imported estimates have zero estimate-default markups; new estimates use company defaults.

**Why:** The owner explicitly clarified the form's rounding and markup inheritance behavior to require cent-for-cent compatibility.

**How to apply:** Test imports against the supplied form's calculation result, not sums of displayed rounded row amounts. Do not silently substitute missing labor or equipment references to force a total.
