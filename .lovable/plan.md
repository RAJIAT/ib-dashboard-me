## Goal
Fix every issue in the Agents/Supervisors page so all three tabs (Supervisors, Underwriters, Sales) work correctly end-to-end against Directus.

## Changes

### 1. `src/services/directusApi.ts` — UUID mapping (fixes `invalid input syntax for type uuid: "A122"`)
The dropdown sends `agent_code` (e.g. `A122`); Directus expects a `directus_users.id` UUID. Resolve both `supervisor` and `assigned_underwriter` from the user cache before sending:

- In `createAgent` and `updateAgent`, add a helper `resolveUserUuid(idOrCode)` that looks in `loadUsers()` for `agent_code === x || id === x` and returns `user.id`.
- Apply to `payload.supervisor` and `payload.assigned_underwriter` (only when value is non-empty; preserve `null` for explicit clear).

### 2. `src/i18n/translations.ts` — role-specific labels
Add (AR + EN):
- `addUnderwriterTitle`: "Add Underwriter" / "إضافة مكتتب"
- `addSalesTitle`: "Add Sales Staff" / "إضافة موظف مبيعات"
- `supervisorCreated`: "Supervisor created" / "تم إنشاء المشرف"
- `underwriterCreated`: "Underwriter created" / "تم إنشاء المكتتب"
- `salesCreated`: "Sales staff created" / "تم إنشاء موظف المبيعات"

### 3. `src/components/AgentFormDialog.tsx` — correct modal title per context
Compute title from effective role + staffType:
- supervisor → `addSupervisorTitle` / `editSupervisorTitle`
- agent + underwriter → `addUnderwriterTitle`
- agent + sales → `addSalesTitle`
- fallback → existing `addTitle`

Uses `lockedRole ?? values.role` and `lockedStaffType ?? values.staffType`.

### 4. `src/routes/agents.tsx` — three fixes

**a. Tab persistence (URL search param)**
- Read `?tab=` on mount; default to `supervisor` for admin, `underwriter` for supervisor.
- On tab click, call `navigate({ search: { tab: k }, replace: true })` so refresh preserves selection and back/forward work.

**b. Instant refresh after create/update/delete**
- Extract `refresh()` from the existing `useEffect` to a stable callback (via `useRef` or hoisted closure already capturing `user`).
- Call `await refresh()` at the end of `onCreate`, `onEdit`, `onToggle`, `onApprove`, `confirmDelete` (mirrors the fix used in `branches.tsx`).

**c. Role-specific success toast**
In `onCreate`, pick the toast key from the effective role/staffType:
```ts
const msgKey =
  (isSupervisor ? "agent" : v.role) === "supervisor" ? t.agents.supervisorCreated :
  (v.staffType ?? effectiveTab) === "sales" ? t.agents.salesCreated :
  t.agents.underwriterCreated;
toast.success(msgKey);
```

## Out of scope
- No backend/Directus permission changes.
- No changes to the branch mapping logic (already correct — branches are mapped by code → id in `createAgent`).
- No redesign of the page or dialog.

## Verification
After applying:
1. As admin, open `/agents` → tab defaults to Supervisors; switch to Underwriters → refresh page → tab stays on Underwriters.
2. Click "Add Underwriter" → modal title reads "Add Underwriter".
3. Create a Supervisor → toast reads "Supervisor created"; new row appears immediately with no manual refresh.
4. Create a Sales Agent with an assigned underwriter → no UUID error; the assignment persists and the new row appears immediately.
5. As supervisor, only Underwriters/Sales tabs visible; defaults to Underwriters.
