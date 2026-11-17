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

Use the written requirements over the form source for SF/SY/CY count multiplication and nearest-filled equipment-rate derivation.

**Why:** The owner selected the written rules after being told the source omits area/volume counts and sometimes derives from a farther rate.

**How to apply:** Apply these rules consistently to new estimates and imports; retain visible missing-rate warnings rather than inventing rates.

Allow incomplete estimate formulas to be saved after confirmation, counting invalid fields as zero but rejecting nonfinite totals. Exception: invalid manual unit prices must use the calculated price with an explicit field error, not zero. Refreshing company rates preserves default markups unless explicitly opted in, and matches imported type names case-insensitively when IDs differ.

**Why:** Estimators need to save work in progress and update imported rates without unexpectedly changing a bid's markups.

**How to apply:** Keep blank-value defaults distinct from formula errors; preserve the draft's original formula strings so errors can be corrected later.

On narrow screens SiteTech must not require horizontal scrolling; estimating lines and resource rows must stack into labeled cards.

**Why:** The owner explicitly stated the mobile no-horizontal-scrolling rule.

**How to apply:** Verify expanded cost rows as well as collapsed line summaries at phone widths, without clipping controls to hide overflow.
