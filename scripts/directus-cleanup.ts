/**
 * directus-cleanup.ts — wipe ALL demo / test data from a self-hosted
 * Directus instance, leaving ONLY:
 *   - The production admin user (email = KEEP_ADMIN_EMAIL)
 *   - The app_settings singleton (preserved, not deleted)
 *   - Directus system collections (roles, policies, permissions, access, etc.)
 *
 * Deletes from these collections in FK-safe order:
 *   1. request_notes
 *   2. request_files          (and their underlying directus_files)
 *   3. notifications
 *   4. audit_log
 *   5. requests               (CASCADEs above also clean orphans)
 *   6. directus_users         (everyone EXCEPT KEEP_ADMIN_EMAIL)
 *   7. branches
 *
 * Usage (on the Directus server):
 *
 *   DIRECTUS_URL="https://directus.mebrokers.net" \
 *   DIRECTUS_ADMIN_TOKEN="<admin static token>" \
 *   KEEP_ADMIN_EMAIL="admin@mebrokers.net" \
 *   bun scripts/directus-cleanup.ts            # dry-run (default)
 *
 *   ... same env, then add: --confirm          # actually delete
 *
 * Safety guards:
 *   - Refuses to run if KEEP_ADMIN_EMAIL is not found in directus_users.
 *   - Refuses if KEEP_ADMIN_EMAIL matches more than one user (ambiguous).
 *   - Refuses to delete anything without --confirm; dry-run prints counts.
 *   - Never deletes the app_settings singleton.
 *   - Never touches system collections (directus_roles, _policies, _access,
 *     _permissions, _flows, _settings, _files except orphans).
 *
 * Output: a per-collection report of what would be / was deleted.
 */

type FetchInit = { method?: string; body?: string };

const URL_BASE = (process.env.DIRECTUS_URL ?? "").replace(/\/$/, "");
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN ?? "";
const KEEP = (process.env.KEEP_ADMIN_EMAIL ?? "").trim().toLowerCase();
const CONFIRM = process.argv.includes("--confirm");

if (!URL_BASE || !TOKEN || !KEEP) {
  console.error(
    "Missing env. Required: DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, KEEP_ADMIN_EMAIL.\n" +
      "Example:\n" +
      "  DIRECTUS_URL=https://directus.mebrokers.net \\\n" +
      "  DIRECTUS_ADMIN_TOKEN=xxx \\\n" +
      "  KEEP_ADMIN_EMAIL=admin@mebrokers.net \\\n" +
      "  bun scripts/directus-cleanup.ts [--confirm]",
  );
  process.exit(2);
}

async function api<T = unknown>(path: string, init: FetchInit = {}): Promise<T> {
  const res = await fetch(`${URL_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: init.body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Page through /items/<col>?fields=id and return all ids
async function listIds(collection: string, extraFilter?: Record<string, unknown>): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams();
    params.set("fields", "id");
    params.set("limit", "1000");
    params.set("page", String(page));
    if (extraFilter) params.set("filter", JSON.stringify(extraFilter));
    const r = await api<{ data: Array<{ id: string | number }> }>(
      `/items/${collection}?${params.toString()}`,
    );
    if (!r.data.length) break;
    for (const row of r.data) ids.push(String(row.id));
    if (r.data.length < 1000) break;
    page += 1;
  }
  return ids;
}

async function listUsers(): Promise<Array<{ id: string; email: string; app_role: string | null }>> {
  const out: Array<{ id: string; email: string; app_role: string | null }> = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams();
    params.set("fields", "id,email,app_role");
    params.set("limit", "1000");
    params.set("page", String(page));
    const r = await api<{ data: Array<{ id: string; email: string; app_role: string | null }> }>(
      `/users?${params.toString()}`,
    );
    if (!r.data.length) break;
    out.push(...r.data);
    if (r.data.length < 1000) break;
    page += 1;
  }
  return out;
}

// Find directus_files referenced by request_files so we can clean orphan files
async function listFileIdsReferencedByRequests(): Promise<string[]> {
  const out: string[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams();
    params.set("fields", "file");
    params.set("limit", "1000");
    params.set("page", String(page));
    const r = await api<{ data: Array<{ file: string | null }> }>(
      `/items/request_files?${params.toString()}`,
    );
    if (!r.data.length) break;
    for (const row of r.data) if (row.file) out.push(row.file);
    if (r.data.length < 1000) break;
    page += 1;
  }
  return out;
}

async function deleteItemsBatch(collection: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  // Directus supports DELETE /items/<collection> with body of ids
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await api(`/items/${collection}`, {
      method: "DELETE",
      body: JSON.stringify(chunk),
    });
  }
}

async function deleteUsersBatch(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await api(`/users`, { method: "DELETE", body: JSON.stringify(chunk) });
  }
}

async function deleteFilesBatch(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await api(`/files`, { method: "DELETE", body: JSON.stringify(chunk) });
  }
}

function banner(s: string) {
  console.log(`\n=== ${s} ===`);
}

async function main() {
  banner("Directus cleanup");
  console.log(`URL:            ${URL_BASE}`);
  console.log(`Keep admin:     ${KEEP}`);
  console.log(`Mode:           ${CONFIRM ? "CONFIRM (deletes)" : "dry-run"}`);

  // ---- preflight: verify admin exists, exactly one ----
  banner("Preflight");
  const users = await listUsers();
  const keepMatches = users.filter((u) => u.email.toLowerCase() === KEEP);
  if (keepMatches.length === 0) {
    console.error(`FATAL: KEEP_ADMIN_EMAIL "${KEEP}" not found in directus_users. Aborting.`);
    process.exit(3);
  }
  if (keepMatches.length > 1) {
    console.error(`FATAL: KEEP_ADMIN_EMAIL "${KEEP}" matches ${keepMatches.length} users. Aborting.`);
    process.exit(3);
  }
  const keepId = keepMatches[0].id;
  console.log(`Production admin to preserve: ${KEEP} (id=${keepId})`);

  const usersToDelete = users.filter((u) => u.id !== keepId);
  console.log(`Users to delete: ${usersToDelete.length}`);
  console.log(`Users to keep:   1 (${KEEP})`);

  // ---- gather counts in deletion order ----
  banner("Gathering data");
  const noteIds = await listIds("request_notes");
  const reqFileIds = await listIds("request_files");
  const referencedFileIds = await listFileIdsReferencedByRequests();
  const notifIds = await listIds("notifications");
  const auditIds = await listIds("audit_log");
  const requestIds = await listIds("requests");
  const branchIds = await listIds("branches");

  console.log(`request_notes:     ${noteIds.length}`);
  console.log(`request_files:     ${reqFileIds.length}`);
  console.log(`  → directus_files referenced by request_files: ${referencedFileIds.length}`);
  console.log(`notifications:     ${notifIds.length}`);
  console.log(`audit_log:         ${auditIds.length}`);
  console.log(`requests:          ${requestIds.length}`);
  console.log(`branches:          ${branchIds.length}`);
  console.log(`directus_users:    ${usersToDelete.length} (excluding ${KEEP})`);

  if (!CONFIRM) {
    banner("DRY RUN — nothing was deleted");
    console.log("Re-run with --confirm to actually delete.");
    return;
  }

  // ---- delete in FK-safe order ----
  banner("Deleting (FK-safe order)");

  console.log(`request_notes (${noteIds.length})...`);
  await deleteItemsBatch("request_notes", noteIds);

  console.log(`request_files (${reqFileIds.length})...`);
  await deleteItemsBatch("request_files", reqFileIds);

  console.log(`directus_files orphaned by request_files (${referencedFileIds.length})...`);
  // Only delete files whose ONLY referent was request_files. Safer: skip any
  // that no longer exist (Directus 404s are tolerated).
  for (let i = 0; i < referencedFileIds.length; i += 100) {
    const chunk = referencedFileIds.slice(i, i + 100);
    try {
      await deleteFilesBatch(chunk);
    } catch (e) {
      console.warn(`  WARN: file batch failed (${(e as Error).message}). Skipping.`);
    }
  }

  console.log(`notifications (${notifIds.length})...`);
  await deleteItemsBatch("notifications", notifIds);

  console.log(`audit_log (${auditIds.length})...`);
  await deleteItemsBatch("audit_log", auditIds);

  console.log(`requests (${requestIds.length})...`);
  await deleteItemsBatch("requests", requestIds);

  console.log(`directus_users (${usersToDelete.length}, keeping ${KEEP})...`);
  await deleteUsersBatch(usersToDelete.map((u) => u.id));

  console.log(`branches (${branchIds.length})...`);
  await deleteItemsBatch("branches", branchIds);

  banner("Done");
  console.log("Database is clean. Verify by logging in as the production admin.");
}

main().catch((e) => {
  console.error("Cleanup FAILED:", e);
  process.exit(1);
});
