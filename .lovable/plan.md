# Directus Production Integration

Self-hosted Directus is in UAE LAN (not reachable from Lovable preview). I'll build against the documented schema in `scripts/directus-bootstrap.ts` and gate everything on `VITE_USE_DIRECTUS`. demoStore stays as the fallback when the flag is off, so the preview keeps working.

## 1. Env (`.env`)
- Remove leftover `VITE_SUPABASE_*` keys (Lovable Cloud–managed ones stay).
- Add: `VITE_USE_DIRECTUS=false` (so preview stays on demoStore), `VITE_DIRECTUS_URL=`.
- `docs/DEPLOYMENT.md` gets the UAE-specific values documented.

## 2. `src/services/directusClient.ts` — expand
Add high-level helpers used everywhere:
- `dxItems<T>(collection)` returning `{ list, get, create, update, remove }` (wraps `/items/:c`).
- `dxUsers` — same shape against `/users` with `app_role`, `staff_type`, `branch`, etc.
- `dxUploadFile(file, folder?)` — multipart `POST /files`, returns `{ id }`.
- `dxMe()` — `/users/me?fields=…`.
- `dxRegisterFile(requestId, fileId, kind, uploadedBy)` — convenience to insert into `request_files`.
- `dxMarkNotificationRead(id)`, `dxListMyNotifications(unreadOnly?)`.
- `dxListAudit(filters)`.

## 3. `src/services/api.ts` — branch by `DIRECTUS_ENABLED`
Keep every existing export name and signature. At the top of each function:

```ts
if (DIRECTUS_ENABLED) return dxImpl(...args);
return demoImpl(...args);
```

Touched functions: `login`, `logout`, `getCurrentUser`, `refreshCurrentUser`, `listRequests`, `getRequest`, `submitUpload`, `appendAttachmentsToRequest`, `addRequestNote`, `updateRequestStatus`, `assignRequest`, `getAgents`/`listAgents`, `createAgent`/`updateAgent`, `bulkImportUsers`, `getBranches`/`listBranches`/`createBranch`/`updateBranch`, notifications (`getNotifications`, `markNotificationRead`, `pushNotifications`), audit (`getAudit`), settings (`getSettings`/`setSettings`). Subscribe helpers (`subscribeRequests`, `subscribeNotifications`, `subscribeSettings`) fall back to **polling** in Directus mode (5s for notifications, 10s for requests) since WebSocket auth from the browser is fragile through Nginx; we can swap to WS later.

Auth: `login` calls `dxLogin`, stores user in module memory + a small `aib:directus:me` localStorage entry so reloads work without re-fetching. `getCurrentUser` reads memory then `/users/me`. `logout` calls `dxLogout` + clears.

Uploads: `submitUpload` and `appendAttachmentsToRequest` upload each `File` via `dxUploadFile`, then create one `request_files` row per file with the right `kind`. Drops all `fileToDataUrl`/base64 paths in Directus mode.

## 4. Route-level auth guard
Create `src/routes/_authenticated.tsx`:
```tsx
beforeLoad: ({ location }) => {
  if (!getCurrentUser()) throw redirect({ to: "/login", search: { redirect: location.href } });
}
component: () => <Outlet />
```
Move `admin`, `agent`, `agents`, `audit`, `branches`, `requests.$id` under it by renaming (`admin.tsx` → `_authenticated.admin.tsx`, etc.). Customer link routes (`r.$requestId`, `q.$requestId`, `success`, `login`, `index`) stay public.

## 5. NotificationBell
Already calls `getNotifications`/`markNotificationRead` from `api.ts` — once those branch to Directus, it works. Add a 5s polling loop inside `subscribeNotifications`'s Directus branch.

## 6. Audit page
Same — `getAudit` branches; UI unchanged.

## 7. `scripts/directus-bootstrap.ts` — add missing server flows
Append to `flows[]`:
- **`lovable: notify_request_created`** — `items.create` on `requests` → notify the assigned agent + their supervisor (`request_new`).
- **`lovable: notify_status_change`** — `items.update` on `requests` filtered on `payload.status` → notify origin agent + current agent (`request_status`).
- **`lovable: notify_user_pending`** — `items.create` on `directus_users` with `pending_approval=true` → notify all admins (`user_pending`).
- **`lovable: notify_user_approved`** — `items.update` on `directus_users` where `pending_approval` flips false → notify that user (`user_approved`).
- **`lovable: audit_request_changes`** — `action` hook on `requests.update` → insert into `audit_log` with `before`/`after`.
- **`lovable: audit_file_upload`** — `action` hook on `request_files.create` → audit row.
- **`lovable: removal_request`** — webhook `removal_request` → creates `removal_requested` notification to admins; admins respond via item update on the original request that triggers `removal_approved`/`removal_dismissed` notifications.

Each flow follows the existing chain pattern (`item-read` → `exec` → `item-create`).

## 8. demoStore retention
Stays at `src/services/demoStore.ts` untouched. Only consumed when `DIRECTUS_ENABLED === false`. `src/services/directus.ts` shim and `src/services/audit.ts` can stay (audit.ts is only referenced internally and `getAudit` in api.ts will branch).

## What I won't touch
- UI components, layout, styling, copy.
- Roles, permissions JSON, business rules.
- Lovable Cloud / Supabase auto-generated files (kept inert; `@supabase/supabase-js` stays installed only to satisfy TS).

## Risk / verification
- I cannot hit the Directus server from here. Code is written to the documented schema; first real test happens on your UAE staging. I'll add a short `docs/DIRECTUS_INTEGRATION.md` with smoke-test steps (login, create request, upload file, see notification, see audit row).
- Polling instead of WebSockets is intentional for now — simpler under Nginx + auth, can be upgraded later without UI changes.

## Technical details
- New files: `src/routes/_authenticated.tsx`, `docs/DIRECTUS_INTEGRATION.md`.
- Renamed files: 6 routes moved under `_authenticated.`.
- Modified: `.env`, `src/services/api.ts` (largest delta), `src/services/directusClient.ts`, `scripts/directus-bootstrap.ts`.
- No dependency changes. No DB migration on Lovable Cloud (we don't use it).