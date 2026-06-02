---
name: Daily report "already completed" 403 race
description: Why signing a daily report can show a spurious "Report is already completed" error, and how it was addressed.
---

# Daily report completion double-submit race

Signing a daily report (`POST /api/reports/:id/complete`) is the ONLY path that
sets a report's status to `completed` (the autosave PUT only ever sends `{ notes }`).
The server returns 403 `"Report is already completed"` if the report is already completed.

**Symptom:** a user (e.g. on a slow mobile connection) signs once but sees
"Report is already completed", even though they never completed it before. The
report does end up correctly completed with their real signature.

**Root cause:** double submission. `disabled={mutation.isPending}` is not enough
because React state / the disabled prop update asynchronously — a fast double-tap
or mobile ghost-click fires `mutate()` twice before the button disables. First
request completes the report (200); the duplicate hits the now-completed report
and returns the scary 403.

**Why it matters / how to apply:** any "submit once, then locks server-side"
action (sign/complete/approve flows) needs a *synchronous* guard (a `useRef`
boolean set before `mutate()`, cleared in `onSettled`), not just the async
`isPending` disabled prop. Client error handling should also treat the
"already completed" 403 as a benign sync event: close the dialog and refetch so
the UI converges to the locked state, rather than showing a generic failure.
