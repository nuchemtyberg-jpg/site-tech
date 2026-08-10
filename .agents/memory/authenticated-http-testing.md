---
name: Authenticated HTTP testing behind Replit Auth
description: Principle for end-to-end testing this app's protected APIs and route-level authorization.
---

Replit Auth has no scriptable login, so protected routes can only be exercised end-to-end by creating a real session server-side for a test user and calling the API with its cookie.

**Why:** Storage-level tests miss route-level authorization bugs — a completion review rejected the todos feature for exactly such gaps (unscoped list reads, missing detail-view checks) that only authenticated HTTP requests reveal. Test authorization with a *low-privilege* user, not just an admin.

**How to apply:** Working, self-cleaning example: `scripts/test-http-api.ts` (forges sessions for both an admin and a temp regular user). The dev DB is shared with live users — always create temp data and delete it in `finally`.
