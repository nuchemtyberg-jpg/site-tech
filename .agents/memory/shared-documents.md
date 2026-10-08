---
name: Shared Documents preservation rules
description: Scope and migration constraints for the shared Bidding and Project Documents tool
---

Keep Bidding and Project Documents on one shared Project-style file manager with explicit revisions; matching filenames are separate documents. Categories remain legacy metadata, not the organizing interface.

**Why:** The user superseded the plan to remove Bidding version controls and wants parity before any award-to-Project conversion. Company Documents and conversion are explicitly separate work.

**How to apply:** Extend the shared tool for both owners together, keeping entity type in ownership checks and caches. Do not add a conversion/linking flow as part of document work.

Historical pre-award migrations moved file ownership but left folder ownership behind. Preserve those folder IDs and parent relationships when enabling scoped Bidding folders.

**Why:** A folder-based interface otherwise hides existing migrated files that category cards previously displayed.

**How to apply:** Check recorded migration ownership when interpreting old folders, rather than resetting folder placement or requiring re-uploads.

Keep the generic uploader's completion callback batched by default; independent registration must be an explicit opt-in.

**Why:** Company Documents resolves folder paths once per batch. Calling its handler separately for each uploaded file duplicates folder trees.

**How to apply:** Verify existing uploader consumers when changing completion semantics, and cover multiple files sharing a relative folder path.

All Bidding jobs should start with the same preset folders as Projects, while allowing root-level files and custom folders.

**Why:** The user described the intended lifecycle: create in Bidding, organize documents, then automatically move the awarded job to Projects with all data, versions and the entire folder tree preserved.

**How to apply:** Seed presets only at bid creation, never on award. Preserve root files, empty/custom/nested folders and renamed/moved presets; award is automatic, not a second manual creation step.

Keep award linking additive rather than transferring document or related-work ownership.

**Why:** The user requires both Bidding and Projects to keep using the exact same records, including stale tabs and uploads started before award. Moving ownership would strand those writes and break reminder/workflow references.

**How to apply:** Resolve the linked bid tree from the Project and serialize mutations on its original owner. Keep additional bid trees labeled and independent; matching names never justify merging them.
