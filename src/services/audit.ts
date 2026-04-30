/**
 * Audit log — Directus-backed.
 *
 * Persists every sensitive event (request status change, agent CRUD, login,
 * logout) into the `audit_log` Directus collection. Events are written in a
 * fire-and-forget way: failures are swallowed so an audit problem never
 * breaks the main user flow.
 *
 * Reads are paged through Directus and may be filtered by branch (used by
 * supervisors) and entity type / action.
 */

import { dxFetch } from "./directus";
import { getCurrentUser, type Role } from "./api";

export type AuditAction =
  | "request.status_changed"
  | "request.created"
  | "agent.created"
  | "agent.updated"
  | "agent.activated"
  | "agent.deactivated"
  | "agent.deleted"
  | "auth.login"
  | "auth.logout";

export type AuditEntityType = "request" | "agent" | "auth";

export type AuditEntry = {
  id: string;
  ts: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: Role | "anonymous";
  actorBranch?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  entityLabel?: string | null;
  branch?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
};

const EVENT = "aib:audit-changed";

type DxAuditRow = {
  id: number;
  ts: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string;
  actor_branch: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  branch: string | null;
  before: unknown;
  after: unknown;
  meta: Record<string, unknown> | null;
};

function rowToEntry(r: DxAuditRow): AuditEntry {
  return {
    id: String(r.id),
    ts: r.ts,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorRole: (r.actor_role as Role | "anonymous") || "anonymous",
    actorBranch: r.actor_branch,
    action: r.action as AuditAction,
    entityType: (r.entity_type as AuditEntityType) || "request",
    entityId: r.entity_id,
    entityLabel: r.entity_label,
    branch: r.branch,
    before: r.before,
    after: r.after,
    meta: r.meta ?? undefined,
  };
}

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Record a single event. Safe to call from anywhere; failures are swallowed. */
export function logEvent(input: {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  branch?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
  actor?: { id: string; name: string; role: Role | "anonymous"; branch?: string | null };
}) {
  const u = input.actor ?? getCurrentUser();
  const payload = {
    ts: new Date().toISOString(),
    actor_id: u?.id ?? null,
    actor_name: u?.name ?? null,
    actor_role: (u?.role ?? "anonymous"),
    actor_branch: (u && "branch" in u ? u.branch : null) ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    entity_label: input.entityLabel ?? null,
    branch: input.branch ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    meta: input.meta ?? null,
  };
  // Fire and forget. Never block the UI on audit IO.
  dxFetch("/items/audit_log", {
    method: "POST",
    body: JSON.stringify(payload),
  })
    .then(() => notify())
    .catch((e) => {
      // Don't surface to users — audit must never block business flow.
      if (typeof console !== "undefined") console.warn("[audit] write failed", e);
    });
}

// In-memory cache for synchronous-ish reads. Refreshed by listAudit().
let _cache: AuditEntry[] = [];

export async function fetchAudit(opts?: {
  branch?: string;
  action?: AuditAction;
  entityType?: AuditEntityType;
  limit?: number;
}): Promise<AuditEntry[]> {
  const params = new URLSearchParams({
    fields: "id,ts,actor_id,actor_name,actor_role,actor_branch,action,entity_type,entity_id,entity_label,branch,before,after,meta",
    sort: "-ts",
    limit: String(opts?.limit ?? 500),
  });
  if (opts?.action) params.set("filter[action][_eq]", opts.action);
  if (opts?.entityType) params.set("filter[entity_type][_eq]", opts.entityType);
  if (opts?.branch) {
    // Supervisor scope: rows where either the entity branch or actor branch matches.
    params.set("filter[_or][0][branch][_eq]", opts.branch);
    params.set("filter[_or][1][actor_branch][_eq]", opts.branch);
  }
  try {
    const json = await dxFetch(`/items/audit_log?${params.toString()}`);
    const rows = (json.data ?? []) as DxAuditRow[];
    _cache = rows.map(rowToEntry);
    return _cache;
  } catch {
    return _cache;
  }
}

/** Synchronous accessor returning the last-fetched cache. */
export function listAudit(opts?: {
  branch?: string;
  action?: AuditAction;
  entityType?: AuditEntityType;
  limit?: number;
}): AuditEntry[] {
  // Trigger a background refresh; current callers will get notified through
  // subscribeAudit() and re-render with fresh data.
  void fetchAudit(opts);
  let out = _cache;
  if (opts?.branch) out = out.filter((e) => e.branch === opts.branch || e.actorBranch === opts.branch);
  if (opts?.action) out = out.filter((e) => e.action === opts.action);
  if (opts?.entityType) out = out.filter((e) => e.entityType === opts.entityType);
  if (opts?.limit) out = out.slice(0, opts.limit);
  return out;
}

export function subscribeAudit(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = () => cb();
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/** Admin-only: clear all audit entries. */
export async function clearAudit() {
  // Fetch IDs in pages and delete. Directus has no "delete all" endpoint.
  try {
    while (true) {
      const json = await dxFetch("/items/audit_log?fields=id&limit=100");
      const ids = ((json.data ?? []) as Array<{ id: number }>).map((r) => r.id);
      if (ids.length === 0) break;
      await dxFetch("/items/audit_log", {
        method: "DELETE",
        body: JSON.stringify({ keys: ids }),
      });
      if (ids.length < 100) break;
    }
    _cache = [];
    notify();
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[audit] clear failed", e);
  }
}
