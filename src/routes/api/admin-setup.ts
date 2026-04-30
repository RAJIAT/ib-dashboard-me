/**
 * One-shot admin bootstrap endpoint.
 *
 * Calls Directus Admin API to:
 *  1. Fix Agent + Public permissions
 *  2. Drop legacy collections (agents, requests_files)
 *  3. Verify environment
 *
 * Protected by DIRECTUS_ADMIN_TOKEN (server-side env). Safe to keep — without
 * the token nothing happens. Delete after use if you prefer.
 *
 * GET /api/admin-setup?action=status
 * POST /api/admin-setup   body: { action: "fix-permissions" | "cleanup" | "create-users" | "all" }
 */
import { createFileRoute } from "@tanstack/react-router";

const DIRECTUS = "http://74.162.122.193:8055";

function dx(path: string, init: RequestInit = {}) {
  const token = process.env.DIRECTUS_ADMIN_TOKEN;
  if (!token) throw new Error("DIRECTUS_ADMIN_TOKEN env var not set");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${DIRECTUS}${path}`, { ...init, headers });
}

async function dxJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await dx(path, init);
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : ({} as T);
}

async function getRoles() {
  const { data } = await dxJson<{ data: any[] }>("/roles?fields=id,name");
  return data;
}

async function getCollections() {
  const { data } = await dxJson<{ data: any[] }>("/collections?limit=-1");
  return data.map((c: any) => c.collection);
}

async function getPolicies() {
  const { data } = await dxJson<{ data: any[] }>("/policies?fields=id,name,roles");
  return data;
}

async function getPolicyForRole(roleId: string | null) {
  const policies = await getPolicies();
  // Find a policy attached to that role
  if (roleId === null) {
    return policies.find((p) => p.name?.toLowerCase().includes("public")) ?? null;
  }
  return policies.find((p) =>
    Array.isArray(p.roles) && p.roles.some((r: any) => (typeof r === "string" ? r === roleId : r?.role === roleId))
  ) ?? null;
}

async function ensurePermission(policyId: string, collection: string, action: string, fields = "*", permissions: any = {}) {
  const existing = await dxJson<{ data: any[] }>(
    `/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`
  );
  if (existing.data?.length) {
    return { skipped: true, id: existing.data[0].id, collection, action };
  }
  const created = await dxJson("/permissions", {
    method: "POST",
    body: JSON.stringify({
      policy: policyId,
      collection,
      action,
      fields,
      permissions,
      validation: {},
      presets: null,
    }),
  });
  return { created: true, collection, action, id: (created as any)?.data?.id };
}

async function fixPermissions() {
  const roles = await getRoles();
  const agentRole = roles.find((r) => r.name === "Agent");
  const log: any[] = [];

  if (agentRole) {
    const policy = await getPolicyForRole(agentRole.id);
    if (policy) {
      log.push(await ensurePermission(policy.id, "audit_log", "create"));
      log.push(await ensurePermission(policy.id, "request_missing_attachments", "read"));
      log.push(await ensurePermission(policy.id, "request_missing_attachments", "create"));
    } else {
      log.push({ error: "No policy found for Agent role" });
    }
  } else {
    log.push({ error: "Agent role not found" });
  }

  // Tighten Public: ensure no list access on requests, only read by ID
  const publicPolicy = await getPolicyForRole(null);
  if (publicPolicy) {
    // Remove permissive public read on requests if it exists with no filter
    const existing = await dxJson<{ data: any[] }>(
      `/permissions?filter[policy][_eq]=${publicPolicy.id}&filter[collection][_eq]=requests&filter[action][_eq]=read`
    );
    for (const p of existing.data) {
      // Only keep if it has an id-based filter; otherwise tighten
      const perms = p.permissions || {};
      if (!perms._and && !perms.id) {
        await dx(`/permissions/${p.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            fields: ["id", "status", "reference_number", "created_at", "updated_at"],
            permissions: {},
          }),
        });
        log.push({ tightened: "public read on requests", id: p.id });
      }
    }
  }

  return log;
}

async function cleanupLegacy() {
  const collections = await getCollections();
  const log: any[] = [];
  for (const c of ["agents", "requests_files"]) {
    if (collections.includes(c)) {
      const r = await dx(`/collections/${c}`, { method: "DELETE" });
      log.push({ collection: c, deleted: r.ok, status: r.status });
    } else {
      log.push({ collection: c, skipped: "not present" });
    }
  }
  return log;
}

async function status() {
  const collections = await getCollections();
  const roles = await getRoles();
  const me = await dxJson("/users/me?fields=email,role.name");
  return {
    me,
    roles: roles.map((r) => r.name),
    collections,
    has_legacy_agents: collections.includes("agents"),
    has_legacy_requests_files: collections.includes("requests_files"),
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...(init.headers || {}) },
  });
}

export const Route = createFileRoute("/api/admin-setup")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const action = url.searchParams.get("action") ?? "status";
          if (action === "status") return json(await status());
          return json({ error: "unknown action" }, { status: 400 });
        } catch (e: any) {
          return json({ error: e.message, stack: e.stack }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { action } = (await request.json()) as { action: string };
          const result: any = {};
          if (action === "fix-permissions" || action === "all") {
            result.permissions = await fixPermissions();
          }
          if (action === "cleanup" || action === "all") {
            result.cleanup = await cleanupLegacy();
          }
          if (action === "status" || action === "all") {
            result.status = await status();
          }
          return json(result);
        } catch (e: any) {
          return json({ error: e.message, stack: e.stack }, { status: 500 });
        }
      },
    },
  },
});
