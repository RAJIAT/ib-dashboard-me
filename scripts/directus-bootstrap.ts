/**
 * Directus Bootstrap — idempotent.
 *
 * ينشئ كل البنية: collections, fields, relations, roles, policies, permissions, flows.
 * تشغيل:
 *   DIRECTUS_URL=https://… DIRECTUS_ADMIN_TOKEN=… bun run scripts/directus-bootstrap.ts
 *
 * كل خطوة بتتأكد قبل الإنشاء (idempotent). تقدر تشغّله أكثر من مرة.
 */

import permissionsConfig from "./directus-permissions.json" with { type: "json" };

const URL_BASE = process.env.DIRECTUS_URL?.replace(/\/$/, "");
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

if (!URL_BASE || !TOKEN) {
  console.error("❌ Missing DIRECTUS_URL or DIRECTUS_ADMIN_TOKEN env vars.");
  process.exit(1);
}

// ----------------- HTTP helper -----------------

async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[${res.status}] ${init.method ?? "GET"} ${path}\n${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function exists(path: string): Promise<boolean> {
  const res = await fetch(`${URL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return res.ok;
}

// ----------------- 1. Collections -----------------

type FieldDef = {
  field: string;
  type: string;
  meta?: Record<string, unknown>;
  schema?: Record<string, unknown>;
};

type CollectionDef = {
  collection: string;
  meta?: Record<string, unknown>;
  schema?: Record<string, unknown>;
  fields: FieldDef[];
  singleton?: boolean;
};

const collections: CollectionDef[] = [
  {
    collection: "branches",
    meta: { icon: "store", note: "Branches / فروع" },
    fields: [
      { field: "id", type: "integer", meta: { hidden: true, interface: "input", readonly: true }, schema: { is_primary_key: true, has_auto_increment: true } },
      { field: "name", type: "string", meta: { interface: "input", required: true }, schema: { is_unique: true } },
      { field: "code", type: "string", meta: { interface: "input", required: true }, schema: { is_unique: true } },
      { field: "address", type: "text", meta: { interface: "input-multiline" } },
      { field: "phone", type: "string", meta: { interface: "input" } },
      { field: "is_active", type: "boolean", meta: { interface: "boolean" }, schema: { default_value: true } },
    ],
  },
  {
    collection: "requests",
    meta: { icon: "description", note: "Insurance requests" },
    fields: [
      { field: "id", type: "string", meta: { hidden: false, readonly: true, interface: "input", required: true }, schema: { is_primary_key: true } },
      { field: "uuid", type: "uuid", meta: { interface: "input", readonly: true, special: ["uuid"] } },
      { field: "agent", type: "uuid", meta: { interface: "select-dropdown-m2o", special: ["m2o"], options: { template: "{{first_name}} {{last_name}} ({{agent_code}})" } } },
      { field: "origin_agent", type: "uuid", meta: { interface: "select-dropdown-m2o", special: ["m2o"] } },
      { field: "branch", type: "integer", meta: { interface: "select-dropdown-m2o", special: ["m2o"], required: true } },
      {
        field: "status",
        type: "string",
        meta: {
          interface: "select-dropdown",
          options: {
            choices: [
              { text: "New", value: "new" },
              { text: "Link sent", value: "linkSent" },
              { text: "Processing", value: "processing" },
              { text: "Sold", value: "sold" },
              { text: "Rejected", value: "rejected" },
              { text: "Reupload", value: "reupload" },
            ],
          },
        },
        schema: { default_value: "new" },
      },
      { field: "customer_name", type: "string", meta: { interface: "input" } },
      { field: "customer_email", type: "string", meta: { interface: "input" } },
      { field: "customer_phone", type: "string", meta: { interface: "input" } },
      { field: "assigned_at", type: "timestamp", meta: { interface: "datetime" } },
      { field: "date_created", type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } },
      { field: "date_updated", type: "timestamp", meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true } },
    ],
  },
  {
    collection: "request_notes",
    meta: { icon: "comment" },
    fields: [
      { field: "id", type: "uuid", meta: { hidden: true, readonly: true, special: ["uuid"] }, schema: { is_primary_key: true } },
      { field: "request", type: "string", meta: { interface: "select-dropdown-m2o", special: ["m2o"], required: true } },
      { field: "author", type: "uuid", meta: { interface: "select-dropdown-m2o", special: ["m2o"] } },
      { field: "author_role", type: "string", meta: { interface: "select-dropdown", options: { choices: [ { text: "Admin", value: "admin" }, { text: "Supervisor", value: "supervisor" }, { text: "Agent", value: "agent" } ] } } },
      { field: "text", type: "text", meta: { interface: "input-multiline", required: true } },
      { field: "kind", type: "string", meta: { interface: "select-dropdown", options: { choices: [ { text: "Comment", value: "comment" }, { text: "Missing", value: "missing" } ] } }, schema: { default_value: "comment" } },
      { field: "resolved_at", type: "timestamp", meta: { interface: "datetime" } },
      { field: "date_created", type: "timestamp", meta: { special: ["date-created"], readonly: true, hidden: true } },
    ],
  },
  {
    collection: "request_files",
    meta: { icon: "attachment" },
    fields: [
      { field: "id", type: "uuid", meta: { hidden: true, readonly: true, special: ["uuid"] }, schema: { is_primary_key: true } },
      { field: "request", type: "string", meta: { interface: "select-dropdown-m2o", special: ["m2o"], required: true } },
      { field: "file", type: "uuid", meta: { interface: "file", special: ["file"], required: true } },
      {
        field: "kind",
        type: "string",
        meta: {
          interface: "select-dropdown",
          required: true,
          options: {
            choices: [
              { text: "Registration", value: "registration" },
              { text: "License", value: "license" },
              { text: "Emirates ID", value: "emirates" },
              { text: "Vehicle Image", value: "vehicle_image" },
              { text: "Vehicle Video", value: "vehicle_video" },
              { text: "Inspection", value: "inspection" },
              { text: "Attachment", value: "attachment" },
              { text: "Missing Attachment", value: "missing_attachment" },
              { text: "Quote", value: "quote" },
            ],
          },
        },
      },
      { field: "uploaded_by", type: "uuid", meta: { interface: "select-dropdown-m2o", special: ["m2o"] } },
      { field: "uploaded_at", type: "timestamp", meta: { interface: "datetime", special: ["date-created"] } },
    ],
  },
  {
    collection: "notifications",
    meta: { icon: "notifications" },
    fields: [
      { field: "id", type: "uuid", meta: { hidden: true, readonly: true, special: ["uuid"] }, schema: { is_primary_key: true } },
      { field: "recipient", type: "uuid", meta: { interface: "select-dropdown-m2o", special: ["m2o"], required: true } },
      {
        field: "kind",
        type: "string",
        meta: {
          interface: "select-dropdown",
          options: {
            choices: [
              { text: "Removal Requested", value: "removal_requested" },
              { text: "Removal Approved", value: "removal_approved" },
              { text: "Removal Dismissed", value: "removal_dismissed" },
              { text: "User Pending", value: "user_pending" },
              { text: "User Approved", value: "user_approved" },
              { text: "Request New", value: "request_new" },
              { text: "Request Status", value: "request_status" },
              { text: "Info", value: "info" },
            ],
          },
        },
      },
      { field: "title", type: "string", meta: { interface: "input", required: true } },
      { field: "body", type: "text", meta: { interface: "input-multiline" } },
      { field: "link", type: "string", meta: { interface: "input" } },
      { field: "read", type: "boolean", meta: { interface: "boolean" }, schema: { default_value: false } },
      { field: "date_created", type: "timestamp", meta: { special: ["date-created"], readonly: true, hidden: true } },
    ],
  },
  {
    collection: "audit_log",
    meta: { icon: "history" },
    fields: [
      { field: "id", type: "uuid", meta: { hidden: true, readonly: true, special: ["uuid"] }, schema: { is_primary_key: true } },
      { field: "ts", type: "timestamp", meta: { interface: "datetime", special: ["date-created"] } },
      { field: "actor", type: "uuid", meta: { interface: "select-dropdown-m2o", special: ["m2o"] } },
      { field: "actor_role", type: "string", meta: { interface: "input" } },
      { field: "actor_branch", type: "string", meta: { interface: "input" } },
      { field: "action", type: "string", meta: { interface: "input", required: true } },
      { field: "entity_type", type: "string", meta: { interface: "select-dropdown", options: { choices: [ { text: "Request", value: "request" }, { text: "Agent", value: "agent" }, { text: "Auth", value: "auth" }, { text: "Branch", value: "branch" } ] } } },
      { field: "entity_id", type: "string", meta: { interface: "input" } },
      { field: "entity_label", type: "string", meta: { interface: "input" } },
      { field: "branch", type: "string", meta: { interface: "input" } },
      { field: "before", type: "json", meta: { interface: "input-code", options: { language: "JSON" } } },
      { field: "after", type: "json", meta: { interface: "input-code", options: { language: "JSON" } } },
      { field: "meta", type: "json", meta: { interface: "input-code", options: { language: "JSON" } } },
    ],
  },
  {
    collection: "app_settings",
    singleton: true,
    meta: { icon: "settings", singleton: true },
    fields: [
      { field: "id", type: "integer", meta: { hidden: true, readonly: true, interface: "input" }, schema: { is_primary_key: true, has_auto_increment: true } },
      { field: "require_admin_approval", type: "boolean", meta: { interface: "boolean", note: "If true, new agents require admin approval." }, schema: { default_value: false } },
    ],
  },
];

// Extra fields to add to directus_users
const userFields: FieldDef[] = [
  { field: "app_role", type: "string", meta: { interface: "select-dropdown", options: { choices: [ { text: "Admin", value: "admin" }, { text: "Supervisor", value: "supervisor" }, { text: "Agent", value: "agent" } ] }, required: true } },
  { field: "staff_type", type: "string", meta: { interface: "select-dropdown", options: { choices: [ { text: "Underwriter", value: "underwriter" }, { text: "Sales", value: "sales" } ] } } },
  { field: "branch", type: "integer", meta: { interface: "select-dropdown-m2o", special: ["m2o"] } },
  { field: "agent_code", type: "string", meta: { interface: "input" }, schema: { is_unique: true } },
  { field: "supervisor", type: "uuid", meta: { interface: "select-dropdown-m2o", special: ["m2o"] } },
  { field: "assigned_underwriter", type: "uuid", meta: { interface: "select-dropdown-m2o", special: ["m2o"], note: "For sales staff only — the underwriter their requests are routed to." } },
  { field: "pending_approval", type: "boolean", meta: { interface: "boolean" }, schema: { default_value: false } },
  { field: "app_active", type: "boolean", meta: { interface: "boolean" }, schema: { default_value: true } },
];

// Relations to create (M2O foreign keys)
const relations = [
  { collection: "directus_users", field: "branch", related_collection: "branches" },
  { collection: "directus_users", field: "supervisor", related_collection: "directus_users" },
  { collection: "directus_users", field: "assigned_underwriter", related_collection: "directus_users" },
  { collection: "requests", field: "agent", related_collection: "directus_users" },
  { collection: "requests", field: "origin_agent", related_collection: "directus_users" },
  { collection: "requests", field: "branch", related_collection: "branches" },
  { collection: "request_notes", field: "request", related_collection: "requests", on_delete: "CASCADE" },
  { collection: "request_notes", field: "author", related_collection: "directus_users" },
  { collection: "request_files", field: "request", related_collection: "requests", on_delete: "CASCADE" },
  { collection: "request_files", field: "file", related_collection: "directus_files" },
  { collection: "request_files", field: "uploaded_by", related_collection: "directus_users" },
  { collection: "notifications", field: "recipient", related_collection: "directus_users" },
  { collection: "audit_log", field: "actor", related_collection: "directus_users" },
];

async function ensureCollections() {
  console.log("\n📦 Collections…");
  for (const def of collections) {
    if (await exists(`/collections/${def.collection}`)) {
      console.log(`   = ${def.collection} (exists)`);
      continue;
    }
    await api("/collections", { method: "POST", body: JSON.stringify(def) });
    console.log(`   + ${def.collection}`);
  }
}

async function ensureUserFields() {
  console.log("\n👤 directus_users extension fields…");
  for (const f of userFields) {
    if (await exists(`/fields/directus_users/${f.field}`)) {
      console.log(`   = ${f.field} (exists)`);
      continue;
    }
    await api("/fields/directus_users", { method: "POST", body: JSON.stringify(f) });
    console.log(`   + ${f.field}`);
  }
}

async function ensureRelations() {
  console.log("\n🔗 Relations…");
  for (const r of relations) {
    const id = `${r.collection}.${r.field}`;
    const list = await api<{ data: Array<{ collection: string; field: string }> }>(
      `/relations/${r.collection}/${r.field}`,
    ).catch(() => null);
    if (list) {
      console.log(`   = ${id} (exists)`);
      continue;
    }
    await api("/relations", {
      method: "POST",
      body: JSON.stringify({
        collection: r.collection,
        field: r.field,
        related_collection: r.related_collection,
        schema: { on_delete: r.on_delete ?? "SET NULL" },
      }),
    });
    console.log(`   + ${id}`);
  }
}

// ----------------- 2. Roles & Permissions -----------------

const ROLE_NAMES = ["Admin", "Supervisor", "Agent"] as const;
type RoleName = (typeof ROLE_NAMES)[number];

async function ensureRoles(): Promise<Record<RoleName, string>> {
  console.log("\n🛡️  Roles…");
  const existing = await api<{ data: Array<{ id: string; name: string }> }>(
    "/roles?limit=-1",
  );
  const map = {} as Record<RoleName, string>;

  for (const name of ROLE_NAMES) {
    const found = existing.data.find((r) => r.name === name);
    if (found) {
      map[name] = found.id;
      console.log(`   = ${name}`);
      continue;
    }
    const created = await api<{ data: { id: string } }>("/roles", {
      method: "POST",
      body: JSON.stringify({
        name,
        admin_access: name === "Admin",
        app_access: true,
        description: `App role: ${name}`,
      }),
    });
    map[name] = created.data.id;
    console.log(`   + ${name}`);
  }
  return map;
}

async function ensurePermissions(roleMap: Record<RoleName, string>) {
  console.log("\n🔐 Permissions…");
  // Wipe existing app-managed permissions for these roles, then recreate.
  // Mark app-managed by stamping comment field.
  const existing = await api<{ data: Array<{ id: number; comment: string | null }> }>(
    "/permissions?limit=-1&filter[comment][_eq]=lovable-bootstrap",
  );
  if (existing.data.length) {
    const ids = existing.data.map((p) => p.id);
    await api("/permissions", { method: "DELETE", body: JSON.stringify(ids) });
    console.log(`   - cleared ${ids.length} stale entries`);
  }

  const config = permissionsConfig as Record<string, Array<Record<string, unknown>>>;
  const batches: Array<{ role: RoleName; entries: Array<Record<string, unknown>> }> = [
    { role: "Supervisor", entries: config.supervisor },
    { role: "Agent", entries: config.agent },
  ];

  for (const { role, entries } of batches) {
    for (const entry of entries) {
      const { _comment, validation, permissions, fields, action, collection } = entry as {
        _comment?: string;
        validation?: unknown;
        permissions?: unknown;
        fields?: string[];
        action: string;
        collection: string;
      };
      await api("/permissions", {
        method: "POST",
        body: JSON.stringify({
          role: roleMap[role],
          collection,
          action,
          fields: fields ?? ["*"],
          permissions: permissions ?? {},
          validation: validation ?? {},
          comment: "lovable-bootstrap",
        }),
      });
      console.log(`   + ${role} → ${collection}.${action}${_comment ? " // " + _comment : ""}`);
    }
  }
}

// ----------------- 3. Flows -----------------

const flows = [
  {
    name: "lovable: enforce_sales_routing",
    icon: "policy",
    color: "#E74C3C",
    description: "Sales staff can only reassign to their assigned underwriter.",
    status: "active",
    trigger: "event",
    accountability: "all",
    options: {
      type: "filter",
      scope: ["items.update"],
      collections: ["requests"],
    },
    operations: [
      {
        key: "guard",
        name: "Guard",
        type: "exec",
        options: {
          code: `
module.exports = async function({ $accountability, $trigger, payload }) {
  if (!payload || !('agent' in payload)) return;
  const userId = $accountability?.user;
  if (!userId) return;
  const me = await $trigger.services.usersService.readOne(userId, { fields: ['id','staff_type','assigned_underwriter','app_role'] }).catch(()=>null);
  if (!me) return;
  if (me.app_role === 'admin' || me.app_role === 'supervisor') return;
  if (me.staff_type === 'sales') {
    if (payload.agent !== me.assigned_underwriter) {
      throw new Error('Sales agents can only reassign to their assigned underwriter.');
    }
  }
};`.trim(),
        },
      },
    ],
  },
  {
    name: "lovable: auto_assigned_at",
    icon: "schedule",
    color: "#3498DB",
    description: "Sets assigned_at when agent changes.",
    status: "active",
    trigger: "event",
    accountability: "all",
    options: { type: "filter", scope: ["items.update"], collections: ["requests"] },
    operations: [
      {
        key: "stamp",
        name: "Stamp timestamp",
        type: "exec",
        options: {
          code: `module.exports = async function({ payload }) { if (payload && 'agent' in payload) { payload.assigned_at = new Date().toISOString(); } return payload; };`,
        },
      },
    ],
  },
  {
    name: "lovable: quote_kind_guard",
    icon: "verified",
    color: "#9B59B6",
    description: "Only underwriters can upload kind=quote files.",
    status: "active",
    trigger: "event",
    accountability: "all",
    options: { type: "filter", scope: ["items.create"], collections: ["request_files"] },
    operations: [
      {
        key: "guard",
        name: "Guard",
        type: "exec",
        options: {
          code: `
module.exports = async function({ $accountability, $trigger, payload }) {
  if (payload?.kind !== 'quote') return;
  const userId = $accountability?.user;
  if (!userId) return;
  const me = await $trigger.services.usersService.readOne(userId, { fields: ['app_role','staff_type'] }).catch(()=>null);
  const ok = me && (me.app_role === 'admin' || me.app_role === 'supervisor' || me.staff_type === 'underwriter');
  if (!ok) throw new Error('Only underwriters can upload quotes.');
};`.trim(),
        },
      },
    ],
  },
];

async function ensureFlows() {
  console.log("\n⚡ Flows…");
  const existing = await api<{ data: Array<{ id: string; name: string }> }>("/flows?limit=-1");
  for (const f of flows) {
    const found = existing.data.find((x) => x.name === f.name);
    if (found) {
      console.log(`   = ${f.name} (exists)`);
      continue;
    }
    const created = await api<{ data: { id: string } }>("/flows", {
      method: "POST",
      body: JSON.stringify({ ...f, operations: undefined }),
    });
    // Operations need to be created separately and linked to the flow
    let prevKey: string | null = null;
    for (const op of f.operations) {
      const opCreated = await api<{ data: { id: string } }>("/operations", {
        method: "POST",
        body: JSON.stringify({ ...op, flow: created.data.id }),
      });
      if (prevKey === null) {
        // first operation = entry point
        await api(`/flows/${created.data.id}`, {
          method: "PATCH",
          body: JSON.stringify({ operation: opCreated.data.id }),
        });
      }
      prevKey = opCreated.data.id;
    }
    console.log(`   + ${f.name}`);
  }
}

// ----------------- Main -----------------

async function main() {
  console.log(`🚀 Bootstrapping Directus at ${URL_BASE}`);
  await ensureCollections();
  await ensureUserFields();
  await ensureRelations();
  const roleMap = await ensureRoles();
  await ensurePermissions(roleMap);
  await ensureFlows();
  console.log("\n✅ Done. Run scripts/directus-seed.ts next to add demo data.");
}

main().catch((err) => {
  console.error("\n💥 Bootstrap failed:", err);
  process.exit(1);
});
