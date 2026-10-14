# Global Battle Engine verification — 2026-10-14

## Change

The old arena computed power/HP in the browser and allowed one local action per UTC day. The new production path uses authenticated RPCs, permanent owner-scoped records, four-hour cooldowns, a rolling cap and shared transactional HP. Demo code is imported only by the explicitly marked demo page.

## Evidence

- 21 automated tests passed: 16 actual-SQL tests in local PGlite, 5 client contract/recovery tests.
- Live migration read-back: HP 500000, version 0, enabled false, battle count 0; RLS active on both new public tables.
- Security advisor: no new engine finding. Existing warning: Auth leaked-password protection disabled. Password sign-in is not used by the engine.
- Performance advisor: unused history index (informational, new empty table); retained for cooldown/monthly queries.
- PostgreSQL logs for 03:20–03:36 UTC contained migration statements and normal checkpoints; no error entry in that returned window. This is a bounded observation, not ongoing monitoring.
- Server concurrency exercise used separate `iid_verify`, `iid_verify_private`, `iid_verify_auth` schemas, synthetic identities, and the identical migration with schema substitutions. Two parallel starts left one pending battle. Two parallel settlements left one ledger row and version 1: 500000 → 500316.
- Two different synthetic players then settled HEAL/KILL in parallel. Version 2: 500316 → 500377 (+61); version 3: 500377 → 499587 (−790). No lost update observed. Transactions deliberately stayed open for two seconds. This is a targeted concurrency check, not a load test.
- All scratch schemas were removed. Read-back: zero scratch schemas, production HP 500000, zero production battles, paused.
- Live Cloudflare browser: an existing signed-in Google/profile session displayed the old labelled local demo. No real battle was submitted.
- Local browser fixture: paused buttons disabled; start/countdown/20-second settlement rendered; result, Common tier and 240-minute cooldown displayed. No console errors in the checked fixture.
- Mobile effective viewport 390×844: document width 383, no horizontal overflow. Desktop effective viewport 1440×900: document width 1433. Host-scaled viewport requests were adjusted to achieve the measured CSS dimensions. Fixture screenshots were inspected.

## Remaining activation checks

1. Review and deploy this frontend branch to Cloudflare with `iid_world.enabled=false`.
2. Verify deployed asset versions (`flow.js?v=9`, `arena.css?v=5`) and paused arena with a real Google session. Check fresh OAuth and nickname onboarding.
3. Exercise start/tap/settle over HTTP with controlled accounts in a staging project: two browsers, disconnect/reload, token expiry, deadline/latency. UI fixtures and direct SQL tests do not prove this boundary.
4. Review external request throttling / abuse controls and tap-acknowledgement latency. Paced automation is not blocked by tap caps.
5. Enable deliberately, verify a real stored result against displayed HP/history, and inspect current logs.

No production frontend deployment, main-branch merge, real battle settlement, ads, payments or share-card rendering was performed by this task.
