## Goal
Deliver a production-ready release: full codebase audit, automatic fixes for every correctness/security/UX/perf issue I find, a Directus cleanup script, and a single HANDOVER.md the client's ops team can follow.

## Required from you (live-access half)
Before Step 4 runs I need:
- A publicly reachable Directus base URL (or temporary tunnel), e.g. `https://directus.mebrokers.net`.
- A **static admin token** for the `admin@mebrokers.net` user (Directus → User → Token), pasted into chat once. I'll use it only for `GET` introspection of `/collections`, `/fields`, `/relations`, `/policies`, `/permissions`, `/access`, `/roles`, `/flows`.
- Confirmation that the production admin email is `admin@mebrokers.net` and no other accounts should survive cleanup.

If you can't expose Directus publicly, I'll fall back to a "bootstrap-script-truth" audit: I verify the script matches the documented schema and ship a self-test endpoint you run on the server.

## Step 1 — Code audit (every module, parallelized)
Spawn parallel sub-audits over the repo and produce findings with file:line refs:

1. **Auth & route guards** — `src/lib/routeAuth.ts`, every `src/routes/*.tsx`, login/logout flow, token storage, refresh, `/requests/$id` guard, role-gated UI hiding vs server enforcement.
2. **Agents/Supervisors** — re-verify the last fix set (UUID mapping, tab persistence, refresh, titles, toasts) plus edit-mode supervisor/UW dropdown values, sales→underwriter scoping, deactivate/reactivate flow.
3. **Branches** — create/update/delete refresh, cache invalidation in every dialog that lists branches.
4. **Requests** — list/detail, status transitions, assignment, quotes race, notes, file uploads, public upload page, audit emission, notifications fan-out, supervisor/UW/sales scoping.
5. **Files** — upload pipeline, mime validation, orphan cleanup on request delete, asset URL signing.
6. **Notifications & audit** — emitter coverage for every mutation, read/unread, retention.
7. **Directus client layer** — `directusClient.ts`, `directusApi.ts`, cache invalidation, error surface, token refresh, demoStore fallback gated correctly.
8. **Frontend hygiene** — duplicate fetches, stale closures, useEffect deps, RTL/LTR, empty/loading/error states, responsive breakpoints, console errors.
9. **Security** — privilege-escalation paths, `/users` PATCH guard, role check bypasses, secrets in bundle, public API surface.
10. **Performance** — N+1 in `rowToRequest`, polling intervals, payload `fields=` size, pagination caps.

Each sub-audit returns: file:line, severity (critical/high/medium/low), category, and proposed fix.

## Step 2 — Apply fixes (this is what consumes most of the work)
For every Critical and High finding I'll edit the code directly. Mediums/Lows get fixed when cheap; otherwise documented in HANDOVER.md as "deferred, non-blocking" with rationale. Categories targeted:
- correctness bugs (wrong payloads, wrong refresh, wrong labels, UUID/code mix-ups)
- security/permission bugs (missing guards, exposed admin paths)
- UX polish (empty states, skeletons, RTL alignment, dialog titles, toast wording)
- performance (collapse duplicate calls, batch reads, narrow `fields=`, raise pagination, kill noisy polling where WS isn't worth it)

## Step 3 — `scripts/directus-cleanup.ts` (new)
Stand-alone Node/TS script the client runs on the server. Inputs via env (`DIRECTUS_URL`, `DIRECTUS_ADMIN_TOKEN`, `KEEP_ADMIN_EMAIL`). Two modes:
- `--dry-run` (default): prints what would be deleted, per collection.
- `--confirm`: actually deletes.

Deletion order (respects FKs):
1. `request_notes`
2. `request_files` (and the underlying `directus_files` they reference)
3. `notifications`
4. `audit_log`
5. `requests`
6. `directus_users` where `email != KEEP_ADMIN_EMAIL`
7. `branches`

Safety: refuses to run if `KEEP_ADMIN_EMAIL` isn't found, refuses if more than 1 admin would survive, refuses if `--confirm` is missing.

## Step 4 — Live verification (only if you give me the token)
Using your admin token, I curl Directus and verify:
- every collection from the bootstrap script exists with the documented fields and relation directions;
- the `Admin` policy has `admin_access=true` and is linked to your admin user via `/access`;
- `Supervisor` / `Agent` policies have exactly the documented `permissions` rows (no extras, none missing);
- public policies on `/requests` and `/request_files` are scoped to single-PK reads only;
- flows for reassign + removal exist and are enabled.

Output: a delta report. Any missing/extra permission becomes a patch to `scripts/directus-bootstrap.ts` so re-running it converges.

## Step 5 — `HANDOVER.md` (new, at repo root)
Single client-facing document with:
- Production env vars and what each does
- DNS / reverse-proxy / CORS checklist
- Bootstrap order: `directus-bootstrap.ts` → cleanup → first admin login → smoke test
- Per-phase checklist (Phases 1–14 from your brief) with ✅ / ⚠ / ❌ status and the file/commit where each was addressed
- Per-role smoke-test script (Admin / Supervisor / Underwriter / Sales) with exact steps and expected outcomes
- Known limitations and the deferred Medium/Low findings
- Rollback procedure

## Out of scope
- I won't redesign any UI; only labels/spacing/state fixes already implied by the brief.
- I won't touch the production Directus DB directly — cleanup is via the script you run.
- I won't add WebSocket subscriptions unless I find a polling cost the audit flags as Critical; otherwise it goes to HANDOVER.md as a recommended follow-up.

## Verification gate before I report "done"
- `bun run build` and `bunx tsc --noEmit` both clean.
- Every Critical/High finding shows a corresponding commit/edit.
- `scripts/directus-cleanup.ts` runs end-to-end in `--dry-run` against your live URL (or against a mock if you can't expose it).
- HANDOVER.md exists and references real file paths.

## Deliverables summary
- Many file edits across `src/routes/`, `src/services/`, `src/components/`, `src/lib/`.
- New: `scripts/directus-cleanup.ts`.
- Patched: `scripts/directus-bootstrap.ts` if the live diff finds gaps.
- New: `HANDOVER.md` at repo root.
- Audit findings printed in chat, grouped ✅ / ⚠ / ❌, with the fix or deferral noted for each.
