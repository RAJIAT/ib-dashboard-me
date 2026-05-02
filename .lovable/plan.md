## Critical Fixes Plan

Based on the QA audit, here are the high-priority fixes to make the system production-ready.

### 1. Fix Agent Permissions (Directus)
Update `src/routes/api/directus.$.ts` proxy to handle restricted collections server-side using admin token:
- Allow agents to read `request_missing_attachments` (so they can see customer-uploaded files)
- Allow agents to write to `audit_log` via server proxy (bypassing client role limitations)
- Remove excessive `directus_users.update` permission from Agent role

### 2. Fix UI Refresh After Adding Notes
In `src/routes/requests.$id.tsx`:
- After successful note creation via `/api/notes`, optimistically update local state OR force-refetch the request detail
- Currently the API returns 200 OK but UI doesn't show new note until manual refresh
- Add proper invalidation of the request query/cache

### 3. Fix Hardcoded Agent Fallback
In `src/routes/index.tsx`:
- Remove the `A123` default when `?agent=` query param is missing
- Show an error state or block submission if no valid agent is provided
- Prevents misattributed customer requests

### 4. Fix Data Integrity (Supervisor/Admin Branch Assignment)
- Update test user records in Directus to set proper `branch` and `agent_id` fields
- Backfill empty `branch` fields on existing requests where possible (link via agent → branch)

### 5. Verify Realtime Refresh on New Requests
Re-check `useRequestsLive.ts` polling and ensure new requests appear without manual refresh (user's earlier complaint).

### Files to be edited:
- `src/routes/api/directus.$.ts` — permission proxying
- `src/routes/requests.$id.tsx` — UI refresh after note add
- `src/routes/index.tsx` — remove agent fallback
- `src/hooks/useRequestsLive.ts` — verify polling cadence
- Directus data updates (via admin API) for users/branch assignments

### Outcome
After these fixes the system should be ready for production: agents see all customer files, comments appear instantly, no misattributed requests, and supervisor/admin branch scoping works correctly.
