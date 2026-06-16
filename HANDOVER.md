# Al Raha Insurance Brokers — Production Handover

This document is the single source of truth for deploying, operating and
auditing the Al Raha portal in production.

---

## 1. Architecture at a glance

- **Frontend**: TanStack Start (React 19, Vite 7), Tailwind v4. Single SPA
  bundle, deployed as a static / edge-served site.
- **Backend**: Self-hosted Directus (Postgres + S3-compatible storage).
  All collections (`branches`, `requests`, `request_files`, `request_notes`,
  `notifications`, `audit_log`, `app_settings`) and policies are created by
  `scripts/directus-bootstrap.ts`.
- **Backend switch**: `VITE_USE_DIRECTUS=true` + `VITE_DIRECTUS_URL` point
  the SPA at Directus. When either is missing the app falls back to a
  local-storage demo store **for development only — never in production**.

---

## 2. Required environment variables (production build)

| Var | Value | Where |
| --- | --- | --- |
| `VITE_USE_DIRECTUS` | `true` | Frontend `.env` at build time |
| `VITE_DIRECTUS_URL` | `https://directus.mebrokers.net` | Frontend `.env` at build time |
| `DIRECTUS_URL` | same | Server-side scripts |
| `DIRECTUS_ADMIN_TOKEN` | static admin token | Server-side scripts only |
| `KEEP_ADMIN_EMAIL` | production admin email | Cleanup script |

The Directus server itself needs `CORS_ENABLED=true` and a
`CORS_ORIGIN` allowlist that contains the SPA origin
(`https://alrahaib-flow.lovable.app` or your custom domain).

The `SUPABASE_*` and `VITE_SUPABASE_*` entries in `.env` are Lovable Cloud
artifacts and are unused by this app at runtime; they are safe to leave
empty in self-hosted builds.

---

## 3. First-time bootstrap (run once on a clean Directus)

```bash
# 1. Install
bun install

# 2. Create collections, policies, permissions, flows
DIRECTUS_URL=https://directus.mebrokers.net \
DIRECTUS_ADMIN_TOKEN=<admin static token> \
  bun scripts/directus-bootstrap.ts

# 3. Promote the production admin
#    Sign in to Directus, create a user with email == KEEP_ADMIN_EMAIL,
#    set app_role = "admin", and link the user to the "Admin" policy.
```

After bootstrap, the SPA can be built and deployed.

---

## 4. Production cleanup (between QA and go-live)

Wipes every non-admin user and all transactional data while preserving the
production admin account and the `app_settings` singleton. System
collections (roles, policies, permissions, flows, files belonging to the
admin) are untouched.

```bash
# Dry-run first — prints counts, deletes nothing
DIRECTUS_URL=https://directus.mebrokers.net \
DIRECTUS_ADMIN_TOKEN=<admin static token> \
KEEP_ADMIN_EMAIL=admin@mebrokers.net \
  bun scripts/directus-cleanup.ts

# Actually delete
DIRECTUS_URL=https://directus.mebrokers.net \
DIRECTUS_ADMIN_TOKEN=<admin static token> \
KEEP_ADMIN_EMAIL=admin@mebrokers.net \
  bun scripts/directus-cleanup.ts --confirm
```

Safety guards (see `scripts/directus-cleanup.ts`):
- Aborts if `KEEP_ADMIN_EMAIL` is not present in `directus_users`.
- Aborts if the email matches more than one user.
- Refuses to delete anything without `--confirm`.
- Deletes in FK-safe order: notes → request_files → orphaned directus_files
  → notifications → audit_log → requests → non-admin users → branches.

---

## 5. Build, restart, deploy

```bash
# Pull latest
git pull --ff-only

# Install (only when bun.lockb changed)
bun install

# Type check + build (Lovable infra does this automatically on push)
bunx tsc --noEmit
bun run build

# Static output ends up in dist/ — upload to your edge host
# or restart the Lovable-managed deployment.
```

For local restart of the SPA dev preview only:

```bash
bun run dev
```

The Directus server is restarted by its own service manager
(`pm2 restart directus`, `systemctl restart directus`, etc.) — never from
this codebase.

---

## 6. Fix log (this release)

### Critical / High
- **Auth**: `dxMe()` now clears tokens + cached `me` on 401/403; concurrent
  `/auth/refresh` calls are deduped (Directus rotates refresh tokens).
- **Auth**: `/login` validates the `redirect` search param (same-origin
  only) and honours it after sign-in. Closes open-redirect.
- **Permissions**: `createAgent` (Directus mode) now blocks supervisors
  from creating other supervisors and blocks agents from creating users at
  all — mirrors the demo-mode guard and is also enforced server-side by
  the Supervisor / Agent policies.
- **Requests**: `/requests/$id` enforces ownership — agents can only open
  their own (or originated) requests; supervisors are scoped to their
  branch. The status select is hidden for sales agents (only admins,
  supervisors and the owning underwriter can change status).
- **Quotes**: `removeQuoteFromRequest` performs an ownership check — only
  admins or the uploader can remove a quote (was previously open to any
  authenticated user).

### Medium / UX
- **AgentFormDialog**: Supervisor dropdown is now rendered for agent
  forms; option values use the Directus user UUID (not the agent code) so
  the backend stores the correct relational id. Same fix applied to the
  Assigned Underwriter dropdown.
- **Agents page**: `popstate` listener keeps the active tab in sync when
  the user navigates with Back/Forward.
- **Notifications fan-out** (Directus mode):
  - new note / re-upload request → notify request owner
  - quote uploaded → notify origin sales agent
  - request reassigned → notify new owner
  - new pending user → notify all admins
  - removal requested → notify all admins
  Failures are logged but never break the underlying mutation.
- **Notifications**: `markAllNotificationsRead` now uses a single bulk
  `PATCH` instead of N round-trips.
- **File uploads**: `validateUploadFile` enforces MIME + size up-front
  in `UploadCard` and `MultiUploadCard` (images ≤25 MB raw before
  client-side compression, PDFs ≤10 MB, video ≤50 MB; everything else
  rejected). Toast messages are localized.

### Cleanup
- Removed unused `src/integrations/supabase/` modules and the
  `@supabase/supabase-js` dependency. The leftover `VITE_SUPABASE_*` env
  variables are now safe to leave empty.

---

## 7. Known limitations / non-blocking items

- Real-time updates are polled (10 s for requests, 5 s for notifications,
  30 s for agents). Swapping to Directus WebSockets is a future
  optimisation, not a release blocker.
- Tokens live in `localStorage`. Moving the refresh token to a
  `httpOnly; Secure; SameSite=Strict` cookie requires server-side support
  and is tracked separately.
- Audit log is read-only from the UI; rows are written by Directus flows.

---

## 8. Smoke test checklist (per role)

Run the cleanup script, then create one user per role and verify.

### Admin (`admin@mebrokers.net`)
- [ ] Sign in succeeds; `/users/me` returns the admin user with policy
      `Admin` and `admin_access=true`.
- [ ] Branches: create, edit, deactivate, delete — list refreshes
      immediately, no manual reload.
- [ ] Agents → Supervisors tab: create supervisor → toast says
      "Supervisor created"; row appears immediately.
- [ ] Agents → Underwriters tab: create underwriter; assign a supervisor
      from the dropdown; row appears immediately.
- [ ] Agents → Sales tab: create sales agent; assign an underwriter from
      the dropdown; row appears immediately.
- [ ] Browser Back/Forward across tabs keeps the active tab in sync.
- [ ] Admin does NOT appear in the Underwriters / Sales / Supervisors
      lists.
- [ ] Approve a pending user → admin gets the notification cleared,
      target user receives `user_approved`.
- [ ] Open any request → status dropdown works.
- [ ] Open any quote → "Remove" works.
- [ ] Audit page loads; entries appear for every action above.

### Supervisor
- [ ] Sign in; redirected to `/admin`.
- [ ] Agents page: only `Underwriters` and `Sales` tabs visible.
- [ ] Cannot create another supervisor (UI hides the option; server
      rejects if forced).
- [ ] Cannot delete admin-created agents — "Request removal" button
      appears instead; submitting it sends a notification to admins.
- [ ] Cannot open requests belonging to a different branch — redirected
      to `/admin` with an error toast.

### Underwriter (`agent` + `staff_type=underwriter`)
- [ ] Sign in; redirected to `/agent`.
- [ ] Sees only their own requests in the list.
- [ ] Opening someone else's request URL is blocked with a redirect.
- [ ] Status dropdown is visible on requests they own; can move between
      statuses.
- [ ] Uploading a quote sends a notification to the originating sales
      agent.

### Sales (`agent` + `staff_type=sales`)
- [ ] Sign in; redirected to `/agent`.
- [ ] Sees only their own originated requests.
- [ ] Status dropdown is HIDDEN — only the read-only badge is shown.
- [ ] Submitting a new upload routes the request to their assigned
      underwriter (verified by the `agent` field on the new row).
- [ ] Receives a notification when the underwriter uploads a quote.

### File upload validation (use `/r/<requestId>` public re-upload page)
- [ ] Upload a 30 MB JPEG → rejected with "image too large" toast.
- [ ] Upload a 12 MB PDF → rejected with "document too large" toast.
- [ ] Upload a `.exe` → rejected with "unsupported file type" toast.
- [ ] Upload a 5 MB JPEG → accepted, compressed to under 1 MB before
      send.

---

## 9. Rollback

The deployment is a static SPA bundle; rollback is the previous bundle.
On Lovable, use the platform's deployment history. On a self-hosted
edge, re-upload the previous `dist/` directory.

Directus rollback: take a Postgres snapshot before each deploy. The
cleanup script does not touch system tables, so re-running bootstrap on
a restored database is safe.

---

## 10. Contact / next steps

- Source: this repo.
- Backend admin: Directus at `https://directus.mebrokers.net/admin`.
- For schema changes, edit `scripts/directus-bootstrap.ts` and re-run it
  against the production Directus — the script is idempotent.
