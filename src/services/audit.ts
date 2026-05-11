/**
 * Audit service — local-only wrapper around demoStore.
 */
import { getAudit, setAudit, type DemoAuditEntry } from "./demoStore";

export type AuditEntry = DemoAuditEntry;
export type AuditAction =
  | "request.status_changed"
  | "request.created"
  | "request.reassigned"
  | "request.assigned_to_underwriter"
  | "request.returned_to_sales"
  | "request.underwriter_changed"
  | "request.sales_changed"
  | "request.document_uploaded"
  | "request.document_removed"
  | "request.reupload_requested"
  | "request.note_added"
  | "request.quote_uploaded"
  | "request.quote_removed"
  | "request.shared_with_customer"
  | "agent.created"
  | "agent.pending_created"
  | "agent.approved"
  | "agent.updated"
  | "agent.activated"
  | "agent.deactivated"
  | "agent.deleted"
  | "auth.login"
  | "auth.logout"
  | "settings.approval_changed";
export type AuditEntityType = "request" | "agent" | "auth";

export async function fetchAudit(opts?: {
  branch?: string;
  action?: string;
  entityType?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
  let rows = getAudit();
  if (opts?.branch) rows = rows.filter((r) => r.branch === opts.branch || r.actorBranch === opts.branch);
  if (opts?.action) rows = rows.filter((r) => r.action === opts.action);
  if (opts?.entityType) rows = rows.filter((r) => r.entityType === opts.entityType);
  if (opts?.limit) rows = rows.slice(0, opts.limit);
  return rows;
}

/** Returns history for one request, oldest first. */
export async function fetchRequestHistory(requestId: string): Promise<AuditEntry[]> {
  const rows = getAudit().filter(
    (r) => r.entityType === "request" && r.entityId === requestId,
  );
  // store is newest-first; reverse for chronological timeline
  return rows.slice().reverse();
}

export async function clearAudit() {
  setAudit([]);
}

export function subscribeAudit(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const fn = () => cb();
  window.addEventListener("aib:audit-changed", fn);
  return () => window.removeEventListener("aib:audit-changed", fn);
}
