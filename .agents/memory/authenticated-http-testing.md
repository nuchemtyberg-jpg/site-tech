---
name: Authenticated HTTP testing behind Replit Auth
description: Principle for end-to-end testing this app's protected APIs and route-level authorization.
---

Replit Auth has no scriptable login, so protected routes can only be exercised end-to-end by creating a real session server-side for a test user and calling the API with its cookie.

**Why:** Storage-level tests miss route-level authorization bugs — a completion review rejected the todos feature for exactly such gaps (unscoped list reads, missing detail-view checks) that only authenticated HTTP requests reveal. Test authorization with a *low-privilege* user, not just an admin.

**How to apply:** Look for existing self-cleaning HTTP test scripts under `scripts/` and model new ones on them. The dev DB is shared with live users — always create temp data and delete it in `finally`. Restart the app workflow after server edits before testing (the backend is not hot-reloaded).

For live browser checks in this Nix environment, prefer the system Chromium executable over Playwright's downloaded Linux browser.

**Why:** A downloaded headless browser failed to launch because its shared libraries were unavailable; the Nix-installed browser includes compatible dependencies. The development banner can also cover fixed mobile controls when testing outside the preview iframe.

**How to apply:** Use the system browser for Playwright and dismiss the development banner through its normal dismissal mechanism in the test context only. Do not disable application overlays or bypass clickability checks to make tests pass.
