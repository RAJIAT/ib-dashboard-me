/**
 * Directus implementation of the api.ts surface.
 *
 * Only used when DIRECTUS_ENABLED === true. The frontend keeps the same
 * shapes (Agent, InsuranceRequest, etc.) defined in api.ts; we translate
 * between Directus rows and those shapes here.
 *
 * Schema mapping (see scripts/directus-bootstrap.ts):
 *   demoUser.id    ↔ directus_users.id (uuid)
 *   demoAgent.id   ↔ directus_users.agent_code (e.g. "UW-001")
 *   demoAgent.userId ↔ directus_users.id
 *   branch (code)  ↔ branches.code  (with branches.id as FK in other tables)
 *   request.agentId ↔ requests.agent (uuid)
 */

import {
  dxItems,
  dxUsers,
  dxLogin,
  dxLogout,
  dxMe,
  dxUploadFile,
  dxAssetUrl,
  dxReassignRequest,
  dxTriggerRemoval,
  getCachedMe,
  type DirectusUser,
} from "./directusClient";
import type {
  Agent,
  AgentRole,
  AppNotification,
  AttachmentMeta,
  AuthUser,
  BulkImportResult,
  BulkImportRow,
  InsuranceRequest,
  RequestNote,
  RequestNoteKind,
  RequestQuote,
  RequestStatus,
  StaffType,
} from "./demoApi";

// ---------------------------------------------------------------------------
// Branch cache (code ↔ id)
// ---------------------------------------------------------------------------

type DxBranch = {
  id: number;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  is_active?: boolean | null;
};

let branchCache: DxBranch[] | null = null;
let branchCachePromise: Promise<DxBranch[]> | null = null;

async function loadBranches(force = false): Promise<DxBranch[]> {
  if (!force && branchCache) return branchCache;
  if (!force && branchCachePromise) return branchCachePromise;
  branchCachePromise = dxItems<DxBranch>("branches")
    .list({ fields: "id,name,code,address,phone,is_active", limit: -1, sort: "code" })
    .then((data) => {
      branchCache = data;
      branchCachePromise = null;
      return data;
    });
  return branchCachePromise;
}

function invalidateBranches() {
  branchCache = null;
}

async function branchCodeToId(code: string | undefined | null): Promise<number | null> {
  if (!code) return null;
  const all = await loadBranches();
  return all.find((b) => b.code === code)?.id ?? null;
}

async function branchIdToCode(id: number | null | undefined): Promise<string | undefined> {
  if (id == null) return undefined;
  const all = await loadBranches();
  return all.find((b) => b.id === id)?.code;
}

// ---------------------------------------------------------------------------
// User cache (uuid ↔ agent record)
// ---------------------------------------------------------------------------

type DxUserFull = DirectusUser & {
  // After fields=branch.*, branch comes back as an object
  branch?: { id: number; code: string; name: string } | number | null;
};

let userCache: DxUserFull[] | null = null;
let userCachePromise: Promise<DxUserFull[]> | null = null;

const USER_FIELDS =
  "id,email,first_name,last_name,app_role,staff_type,agent_code,supervisor,assigned_underwriter,app_active,pending_approval,branch.id,branch.code,branch.name";

async function loadUsers(force = false): Promise<DxUserFull[]> {
  if (!force && userCache) return userCache;
  if (!force && userCachePromise) return userCachePromise;
  userCachePromise = dxUsers()
    .list({ fields: USER_FIELDS, limit: -1, filter: { app_role: { _nnull: true } } })
    .then((data) => {
      userCache = data as DxUserFull[];
      userCachePromise = null;
      return userCache;
    });
  return userCachePromise;
}

function invalidateUsers() {
  userCache = null;
}

function userBranchCode(u: DxUserFull): string | undefined {
  if (u.branch && typeof u.branch === "object") return u.branch.code;
  return undefined;
}

function userToAgent(u: DxUserFull): Agent {
  const role: AgentRole = u.app_role === "supervisor" ? "supervisor" : "agent";
  return {
    userId: u.id,
    id: u.agent_code || u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email,
    email: u.email,
    branch: userBranchCode(u),
    active: u.app_active !== false,
    role,
    staffType: (u.staff_type as StaffType | null) ?? undefined,
    supervisorId: u.supervisor ?? undefined,
    assignedUnderwriterId: u.assigned_underwriter ?? undefined,
    pendingApproval: u.pending_approval ?? undefined,
  };
}

function userToAuth(u: DxUserFull): AuthUser {
  const role = (u.app_role ?? "agent") as AuthUser["role"];
  return {
    id: u.id,
    email: u.email,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email,
    role,
    agentId: u.agent_code ?? undefined,
    branch: userBranchCode(u),
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<AuthUser> {
  const u = await dxLogin(email, password);
  invalidateBranches();
  invalidateUsers();
  return userToAuth(u as DxUserFull);
}

export async function logout(): Promise<void> {
  await dxLogout();
  invalidateBranches();
  invalidateUsers();
}

export function getCurrentUser(): AuthUser | null {
  // Synchronous: relies on cached "me" persisted by directusClient.
  const m = getCachedMe();
  return m ? userToAuth(m as DxUserFull) : null;
}

export async function refreshCurrentUser(): Promise<AuthUser | null> {
  const u = await dxMe();
  return u ? userToAuth(u as DxUserFull) : null;
}

export async function signUp(): Promise<AuthUser> {
  throw new Error("Sign up is disabled.");
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export async function getBranches(opts?: { onlyActive?: boolean }): Promise<DxBranch[]> {
  const all = await loadBranches(true);
  return opts?.onlyActive ? all.filter((b) => b.is_active !== false) : all;
}

export function listBranches(): string[] {
  return (branchCache ?? []).filter((b) => b.is_active !== false).map((b) => b.code);
}

export function listBranchObjects(): DxBranch[] {
  return branchCache ?? [];
}

export async function createBranch(input: {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  is_active?: boolean;
}): Promise<DxBranch> {
  const created = await dxItems<DxBranch>("branches").create({
    name: input.name,
    code: input.code,
    address: input.address,
    phone: input.phone,
    is_active: input.is_active ?? true,
  });
  invalidateBranches();
  return created;
}

export async function updateBranch(id: number, patch: Partial<DxBranch>): Promise<DxBranch> {
  const updated = await dxItems<DxBranch>("branches").update(id, patch);
  invalidateBranches();
  return updated;
}

export async function deleteBranch(id: number): Promise<void> {
  await dxItems("branches").remove(id);
  invalidateBranches();
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

type DxRequest = {
  id: string;
  uuid?: string;
  agent?: string | DxUserFull | null;
  origin_agent?: string | DxUserFull | null;
  branch?: number | DxBranch | null;
  status: RequestStatus;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  assigned_at?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
};

type DxRequestFile = {
  id: string;
  request: string;
  file: string | { id: string; type?: string; filesize?: number; filename_download?: string };
  kind:
    | "registration"
    | "license"
    | "emirates"
    | "vehicle_image"
    | "vehicle_video"
    | "inspection"
    | "attachment"
    | "missing_attachment"
    | "quote";
  uploaded_by?: string | DxUserFull | null;
  uploaded_at?: string | null;
};

type DxNote = {
  id: string;
  request: string;
  author?: string | DxUserFull | null;
  author_role?: "admin" | "supervisor" | "agent" | null;
  text: string;
  kind: "comment" | "missing";
  resolved_at?: string | null;
  date_created?: string | null;
};

const REQUEST_FIELDS =
  "id,uuid,status,customer_name,customer_email,customer_phone,assigned_at,date_created,date_updated," +
  "agent.id,agent.first_name,agent.last_name,agent.agent_code,agent.staff_type," +
  "origin_agent.id,origin_agent.first_name,origin_agent.last_name,origin_agent.agent_code,origin_agent.staff_type," +
  "branch.id,branch.code,branch.name";

function userDisplayName(u?: DxUserFull | string | null): string {
  if (!u || typeof u === "string") return "";
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "";
}

function userAgentCode(u?: DxUserFull | string | null): string {
  if (!u || typeof u === "string") return typeof u === "string" ? u : "";
  return u.agent_code || u.id;
}

function userId(u?: DxUserFull | string | null): string | undefined {
  if (!u) return undefined;
  return typeof u === "string" ? u : u.id;
}

async function rowToRequest(r: DxRequest): Promise<InsuranceRequest> {
  // Load files + notes in parallel
  const [files, notes] = await Promise.all([
    dxItems<DxRequestFile>("request_files").list({
      filter: { request: { _eq: r.id } },
      fields: "id,kind,uploaded_at,file.id,file.type,file.filesize,file.filename_download,uploaded_by.id,uploaded_by.first_name,uploaded_by.last_name",
      sort: "uploaded_at",
      limit: -1,
    }),
    dxItems<DxNote>("request_notes").list({
      filter: { request: { _eq: r.id } },
      fields: "id,author_role,text,kind,resolved_at,date_created,author.id,author.first_name,author.last_name",
      sort: "date_created",
      limit: -1,
    }),
  ]);

  const branchCode = r.branch && typeof r.branch === "object" ? r.branch.code : await branchIdToCode(r.branch as number | null);

  const registration: string[] = [];
  const license: string[] = [];
  const emirates: string[] = [];
  const attachments: AttachmentMeta[] = [];
  const missingAttachments: AttachmentMeta[] = [];
  const vehicleMedia: NonNullable<InsuranceRequest["images"]>["vehicleMedia"] = [];
  let inspection: string | undefined;
  const quotes: RequestQuote[] = [];

  for (const f of files) {
    const fileObj = typeof f.file === "object" ? f.file : { id: f.file };
    const url = dxAssetUrl(fileObj.id);
    const name = (fileObj as { filename_download?: string }).filename_download ?? "";
    const type = (fileObj as { type?: string }).type ?? "";
    const size = (fileObj as { filesize?: number }).filesize ?? 0;
    const att: AttachmentMeta = { name, type, size, url };
    switch (f.kind) {
      case "registration":
        registration.push(url);
        break;
      case "license":
        license.push(url);
        break;
      case "emirates":
        emirates.push(url);
        break;
      case "inspection":
        inspection = url;
        break;
      case "vehicle_image":
        vehicleMedia.push({ kind: "image", url });
        break;
      case "vehicle_video":
        vehicleMedia.push({ kind: "video", name, size, type });
        break;
      case "attachment":
        attachments.push(att);
        break;
      case "missing_attachment":
        missingAttachments.push(att);
        break;
      case "quote":
        quotes.push({
          id: f.id,
          name,
          type,
          size,
          url,
          uploadedByUserId: userId(f.uploaded_by) ?? "",
          uploadedByName: userDisplayName(f.uploaded_by),
          uploadedAt: f.uploaded_at ?? "",
        });
        break;
    }
  }

  const reqNotes: RequestNote[] = notes.map((n) => ({
    id: n.id,
    authorId: userId(n.author) ?? "",
    authorName: userDisplayName(n.author),
    authorRole: (n.author_role ?? "agent") as RequestNote["authorRole"],
    text: n.text,
    kind: n.kind,
    createdAt: n.date_created ?? "",
    resolvedAt: n.resolved_at ?? undefined,
  }));

  return {
    id: r.id,
    uuid: r.uuid ?? r.id.toLowerCase(),
    agentId: userAgentCode(r.agent),
    agentName: userDisplayName(r.agent),
    originAgentId: r.origin_agent ? userAgentCode(r.origin_agent) : undefined,
    originAgentName: r.origin_agent ? userDisplayName(r.origin_agent) : undefined,
    branch: branchCode ?? "",
    status: r.status,
    createdAt: r.date_created ?? "",
    assignedAt: r.assigned_at ?? undefined,
    customerName: r.customer_name ?? undefined,
    customerEmail: r.customer_email ?? undefined,
    customerPhone: r.customer_phone ?? undefined,
    notes: reqNotes,
    quotes,
    images: { registration, license, emirates, vehicleMedia, inspection, attachments, missingAttachments },
  };
}

export async function listRequests(opts?: { agentId?: string; branch?: string }): Promise<InsuranceRequest[]> {
  await loadBranches();
  const filter: Record<string, unknown> = {};
  if (opts?.agentId) {
    // agentId comes in as agent_code; resolve to UUID via user cache
    const users = await loadUsers();
    const u = users.find((x) => x.agent_code === opts.agentId || x.id === opts.agentId);
    if (u) {
      filter._or = [{ agent: { _eq: u.id } }, { origin_agent: { _eq: u.id } }];
    } else {
      return [];
    }
  }
  if (opts?.branch) {
    const id = await branchCodeToId(opts.branch);
    if (id) filter.branch = { _eq: id };
  }
  const rows = await dxItems<DxRequest>("requests").list({
    fields: REQUEST_FIELDS,
    filter,
    sort: "-date_created",
    limit: -1,
  });
  return Promise.all(rows.map(rowToRequest));
}

export async function getRequest(id: string): Promise<InsuranceRequest | null> {
  const row = await dxItems<DxRequest>("requests").get(id, REQUEST_FIELDS);
  if (!row) return null;
  return rowToRequest(row);
}

export async function resolveAssetUrl(stored: string): Promise<{ url: string; mime: string }> {
  return { url: stored, mime: "" };
}

export async function updateRequestStatus(id: string, status: RequestStatus): Promise<InsuranceRequest> {
  await dxItems("requests").update(id, { status });
  const r = await getRequest(id);
  if (!r) throw new Error("Request not found after update");
  return r;
}

// ---------------------------------------------------------------------------
// Upload (anonymous public link page)
// ---------------------------------------------------------------------------

function nextRequestId(): string {
  // Client-side id generator — server uniqueness enforced by PK.
  // Pattern matches demo: "REQ-" + 4 random digits + 2 letters.
  const n = Math.floor(1000 + Math.random() * 9000);
  const a = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const b = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `REQ-${n}${a}${b}`;
}

export async function submitUpload(input: {
  agentId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  images: {
    registration: File[];
    license: File[];
    emirates: File[];
    vehicleMedia: File[];
    attachments?: File[];
  };
  optional?: { inspection?: File | null };
}): Promise<{ id: string }> {
  // Look up the agent user
  const users = await loadUsers(true);
  const agent = users.find((u) => u.agent_code === input.agentId || u.id === input.agentId);
  if (!agent) throw new Error("Agent not found");
  const branchId = agent.branch && typeof agent.branch === "object" ? agent.branch.id : null;
  if (!branchId) throw new Error("Agent has no branch");

  const id = nextRequestId();

  await dxItems("requests").create({
    id,
    agent: agent.id,
    origin_agent: agent.id,
    branch: branchId,
    status: "new",
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    customer_phone: input.customerPhone,
    assigned_at: new Date().toISOString(),
  });

  // Upload all files in parallel, then create request_files rows.
  const uploads: Array<Promise<unknown>> = [];

  const queue = (files: File[], kind: DxRequestFile["kind"]) => {
    for (const f of files) {
      uploads.push(
        (async () => {
          const { id: fileId } = await dxUploadFile(f);
          await dxItems("request_files").create({
            request: id,
            file: fileId,
            kind,
            uploaded_by: agent.id,
          });
        })(),
      );
    }
  };

  queue(input.images.registration, "registration");
  queue(input.images.license, "license");
  queue(input.images.emirates, "emirates");
  queue(input.images.attachments ?? [], "attachment");

  for (const f of input.images.vehicleMedia) {
    queue([f], f.type.startsWith("video/") ? "vehicle_video" : "vehicle_image");
  }
  if (input.optional?.inspection) queue([input.optional.inspection], "inspection");

  await Promise.all(uploads);
  return { id };
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function addRequestNote(
  requestId: string,
  input: { text: string; kind: RequestNoteKind },
): Promise<InsuranceRequest> {
  const me = getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  await dxItems("request_notes").create({
    request: requestId,
    author: me.id,
    author_role: me.role,
    text: input.text.trim(),
    kind: input.kind,
  });
  if (input.kind === "missing") {
    await dxItems("requests").update(requestId, { status: "reupload" });
  }
  const r = await getRequest(requestId);
  if (!r) throw new Error("Request not found");
  // Fan-out: notify the request's current owner (skip self-notes).
  try {
    const row = await dxItems<DxRequest>("requests").get(requestId, "id,agent.id");
    const ownerId = row && typeof row.agent === "object" ? row.agent?.id : (row?.agent as string | undefined);
    if (ownerId && ownerId !== me.id) {
      await createNotification({
        recipient: ownerId,
        kind: input.kind === "missing" ? "request_status" : "info",
        title: input.kind === "missing" ? `Re-upload requested on ${r.id}` : `New note on ${r.id}`,
        body: input.text.slice(0, 240),
        link: `/requests/${r.id}`,
      });
    }
  } catch (e) {
    console.warn("[notify] addRequestNote fan-out failed", e);
  }
  return r;

}

export async function resolveRequestNote(requestId: string, noteId: string): Promise<InsuranceRequest> {
  await dxItems("request_notes").update(noteId, { resolved_at: new Date().toISOString() });
  const r = await getRequest(requestId);
  if (!r) throw new Error("Request not found");
  return r;
}

export async function appendAttachmentsToRequest(
  requestId: string,
  files: File[],
): Promise<InsuranceRequest> {
  const me = getCurrentUser();
  const uploaderId = me?.id;
  const real = files.filter((f) => !f.type.startsWith("video/"));
  await Promise.all(
    real.map(async (f) => {
      const { id: fileId } = await dxUploadFile(f);
      await dxItems("request_files").create({
        request: requestId,
        file: fileId,
        kind: "missing_attachment",
        uploaded_by: uploaderId,
      });
    }),
  );
  // Auto-resolve any open "missing" notes + advance status
  const openNotes = await dxItems<DxNote>("request_notes").list({
    filter: { request: { _eq: requestId }, kind: { _eq: "missing" }, resolved_at: { _null: true } },
    fields: "id",
    limit: -1,
  });
  await Promise.all(
    openNotes.map((n) =>
      dxItems("request_notes").update(n.id, { resolved_at: new Date().toISOString() }),
    ),
  );
  await dxItems("requests").update(requestId, { status: "processing" });
  const r = await getRequest(requestId);
  if (!r) throw new Error("Request not found");
  return r;
}

// ---------------------------------------------------------------------------
// Agents (users with app_role)
// ---------------------------------------------------------------------------

export async function getAgents(): Promise<Agent[]> {
  const users = await loadUsers(true);
  // Admins are not "agents/offices"; exclude them from the agents list.
  return users.filter((u) => u.app_role !== "admin").map(userToAgent);
}

export function listAgents(): Agent[] {
  return (userCache ?? []).filter((u) => u.app_role !== "admin").map(userToAgent);
}

export async function createAgent(input: {
  id: string;
  name: string;
  email?: string;
  branch?: string;
  role?: AgentRole;
  staffType?: StaffType;
  supervisorId?: string;
  password?: string;
  assignedUnderwriterId?: string;
}): Promise<Agent> {
  // Client-side role guard mirroring demo behavior. The Directus policy on
  // /users/POST should also enforce this server-side; this check just
  // produces a clean error before the network round-trip.
  const me = getCurrentUser();
  if (me?.role === "supervisor" && input.role === "supervisor") {
    throw new Error("Supervisors cannot create other supervisors.");
  }
  if (me?.role === "agent") {
    throw new Error("Agents cannot create users.");
  }
  if (!input.email) throw new Error("Email is required");
  if (!input.password || input.password.length < 6) throw new Error("Password (min 6 chars) is required");

  const branchId = input.branch ? await branchCodeToId(input.branch) : null;
  const [first, ...rest] = input.name.split(" ");
  // Look up the Directus "App User" role id to attach to the new user.
  // We rely on the app_role field for our own permission filters, but Directus
  // still requires a role assignment for app_access.
  const appRoleName = input.role === "supervisor" ? "Supervisor" : "Agent";
  let dxRoleId: string | undefined;
  try {
    const roles = await dxItems<{ id: string; name: string }>("directus_roles").list({
      filter: { name: { _eq: appRoleName } },
      fields: "id,name",
      limit: 1,
    });
    dxRoleId = roles[0]?.id;
  } catch (e) {
    // Non-admin Directus policies can't read directus_roles. Continue without —
    // the create call below will fail with a clearer error if the policy also
    // forbids creating users.
    console.warn("[directus] could not look up Directus role; continuing without role assignment", e);
  }
  // Resolve agent_code → user UUID for relational fields (supervisor / assigned_underwriter).
  const allUsers = await loadUsers();
  const resolveUserUuid = (v: string | undefined | null): string | null => {
    if (!v) return null;
    const found = allUsers.find((u) => u.id === v || u.agent_code === v);
    return found?.id ?? null;
  };
  const payload: Record<string, unknown> = {
    email: input.email,
    password: input.password,
    first_name: first,
    last_name: rest.join(" ") || null,
    app_role: input.role ?? "agent",
    staff_type: input.staffType ?? (input.role === "agent" ? "underwriter" : undefined),
    branch: branchId,
    agent_code: input.id,
    supervisor: resolveUserUuid(input.supervisorId),
    assigned_underwriter: resolveUserUuid(input.assignedUnderwriterId),
    app_active: true,
    pending_approval: false,
  };
  if (dxRoleId) payload.role = dxRoleId;
  try {
    const created = await dxUsers().create(payload);
    invalidateUsers();
    return userToAgent(created as DxUserFull);
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/forbidden|permission|403/i.test(msg)) {
      throw new Error(
        `Directus denied user creation (${msg}). The signed-in admin must be assigned a Directus policy with admin_access=true (or with create permission on directus_users). Run scripts/directus-bootstrap.ts and ensure your admin user is linked to the "Admin" policy via /access.`,
      );
    }
    throw e;
  }
}

export async function updateAgent(
  id: string,
  patch: Partial<{
    name: string;
    email: string | null;
    branch: string | null;
    active: boolean;
    supervisorId: string | null;
    role: AgentRole;
    staffType: StaffType;
    password: string;
    assignedUnderwriterId: string | null;
  }>,
): Promise<Agent> {
  const users = await loadUsers();
  const user = users.find((u) => u.id === id || u.agent_code === id);
  if (!user) throw new Error("Agent not found");
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const [first, ...rest] = patch.name.split(" ");
    payload.first_name = first;
    payload.last_name = rest.join(" ") || null;
  }
  if (patch.email !== undefined) payload.email = patch.email;
  if (patch.branch !== undefined) {
    payload.branch = patch.branch ? await branchCodeToId(patch.branch) : null;
  }
  if (patch.active !== undefined) payload.app_active = patch.active;
  if (patch.role !== undefined) payload.app_role = patch.role;
  if (patch.staffType !== undefined) payload.staff_type = patch.staffType;
  const resolveUserUuid2 = (v: string | null): string | null => {
    if (!v) return null;
    const found = users.find((u) => u.id === v || u.agent_code === v);
    return found?.id ?? null;
  };
  if (patch.supervisorId !== undefined) payload.supervisor = resolveUserUuid2(patch.supervisorId);
  if (patch.assignedUnderwriterId !== undefined) payload.assigned_underwriter = resolveUserUuid2(patch.assignedUnderwriterId);
  if (patch.password) payload.password = patch.password;
  const updated = await dxUsers().update(user.id, payload);
  invalidateUsers();
  return userToAgent(updated as DxUserFull);
}

export async function approveAgent(id: string): Promise<Agent> {
  const users = await loadUsers();
  const u = users.find((x) => x.id === id || x.agent_code === id);
  if (!u) throw new Error("Agent not found");
  const updated = await dxUsers().update(u.id, { app_active: true, pending_approval: false });
  invalidateUsers();
  return userToAgent(updated as DxUserFull);
}

export async function deleteAgent(id: string): Promise<void> {
  const me = getCurrentUser();
  if (me?.role === "supervisor") {
    throw new Error("Supervisors must request removal from the admin");
  }
  const users = await loadUsers();
  const u = users.find((x) => x.id === id || x.agent_code === id);
  if (!u) throw new Error("Agent not found");
  await dxUsers().remove(u.id);
  invalidateUsers();
}

// ---------------------------------------------------------------------------
// Reassign (delegates to server flow)
// ---------------------------------------------------------------------------

export async function reassignRequest(requestId: string, newAgentId: string): Promise<InsuranceRequest> {
  // newAgentId may be agent_code or uuid; resolve to uuid.
  const users = await loadUsers();
  const target = users.find((u) => u.id === newAgentId || u.agent_code === newAgentId);
  if (!target) throw new Error("Target agent not found");
  await dxReassignRequest(requestId, target.id);
  const r = await getRequest(requestId);
  if (!r) throw new Error("Request not found after reassign");
  return r;
}

// ---------------------------------------------------------------------------
// Quotes (underwriter uploads)
// ---------------------------------------------------------------------------

export async function addQuotesToRequest(requestId: string, files: File[]): Promise<InsuranceRequest> {
  const me = getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  if (!files.length) throw new Error("No files");
  await Promise.all(
    files.map(async (f) => {
      const { id: fileId } = await dxUploadFile(f);
      await dxItems("request_files").create({
        request: requestId,
        file: fileId,
        kind: "quote",
        uploaded_by: me.id,
      });
    }),
  );
  // Auto-return: if current owner is an underwriter and origin_agent is a sales user,
  // reassign back to origin sales agent (server flow could also handle this).
  const req = await dxItems<DxRequest>("requests").get(requestId, REQUEST_FIELDS);
  if (req) {
    const currentOwner = req.agent && typeof req.agent === "object" ? req.agent : null;
    const origin = req.origin_agent && typeof req.origin_agent === "object" ? req.origin_agent : null;
    if (currentOwner?.staff_type === "underwriter" && origin && origin.id !== currentOwner.id) {
      await dxItems("requests").update(requestId, {
        agent: origin.id,
        assigned_at: new Date().toISOString(),
      });
    }
  }
  const r = await getRequest(requestId);
  if (!r) throw new Error("Request not found");
  return r;
}

export async function removeQuoteFromRequest(requestId: string, quoteId: string): Promise<InsuranceRequest> {
  const me = getCurrentUser();
  if (!me) throw new Error("Not authenticated");
  // Ownership check: only admin or the uploader can remove a quote.
  if (me.role !== "admin") {
    const row = await dxItems<DxRequestFile>("request_files").get(quoteId, "id,kind,uploaded_by");
    const uploaderId = row && typeof row.uploaded_by === "object" ? row.uploaded_by?.id : (row?.uploaded_by as string | undefined);
    if (!row || row.kind !== "quote" || uploaderId !== me.id) {
      throw new Error("Not allowed: you can only remove your own quotes");
    }
  }
  await dxItems("request_files").remove(quoteId);
  const r = await getRequest(requestId);
  if (!r) throw new Error("Request not found");
  return r;
}

// ---------------------------------------------------------------------------
// Removal workflow
// ---------------------------------------------------------------------------

export async function requestAgentRemoval(agentId: string, reason: string): Promise<Agent> {
  const users = await loadUsers();
  const u = users.find((x) => x.id === agentId || x.agent_code === agentId);
  if (!u) throw new Error("Agent not found");
  try {
    await dxTriggerRemoval(u.id, reason);
  } catch {
    // Fall back: stamp the user record so admins can see the request.
    await dxUsers().update(u.id, { pending_approval: true });
  }
  invalidateUsers();
  return userToAgent({ ...u, pending_approval: true });
}

export async function approveAgentRemoval(agentId: string): Promise<void> {
  const users = await loadUsers();
  const u = users.find((x) => x.id === agentId || x.agent_code === agentId);
  if (!u) throw new Error("Agent not found");
  await dxUsers().remove(u.id);
  invalidateUsers();
}

export async function dismissAgentRemoval(agentId: string): Promise<Agent> {
  const users = await loadUsers();
  const u = users.find((x) => x.id === agentId || x.agent_code === agentId);
  if (!u) throw new Error("Agent not found");
  const updated = await dxUsers().update(u.id, { pending_approval: false });
  invalidateUsers();
  return userToAgent(updated as DxUserFull);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

type DxNotification = {
  id: string;
  recipient: string;
  kind: AppNotification["kind"];
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  date_created?: string | null;
};

function notifToApp(n: DxNotification): AppNotification {
  return {
    id: n.id,
    recipientUserId: n.recipient,
    kind: n.kind,
    title: n.title,
    body: n.body ?? undefined,
    link: n.link ?? undefined,
    read: !!n.read,
    createdAt: n.date_created ?? "",
  };
}

async function createNotification(input: {
  recipient: string;
  kind: AppNotification["kind"];
  title: string;
  body?: string;
  link?: string;
}): Promise<void> {
  try {
    await dxItems("notifications").create({
      recipient: input.recipient,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      read: false,
    });
  } catch (e) {
    // Notification failure must never break the underlying mutation.
    console.warn("[directus] failed to create notification", e);
  }
}

async function notifyAdmins(input: { kind: AppNotification["kind"]; title: string; body?: string; link?: string }): Promise<void> {
  const users = await loadUsers();
  const admins = users.filter((u) => u.app_role === "admin");
  await Promise.all(admins.map((a) => createNotification({ recipient: a.id, ...input })));
}

export async function getNotifications(): Promise<AppNotification[]> {
  const me = getCurrentUser();
  if (!me) return [];
  const rows = await dxItems<DxNotification>("notifications").list({
    filter: { recipient: { _eq: me.id } },
    sort: "-date_created",
    limit: 200,
  });
  return rows.map(notifToApp);
}

export function listNotificationsFor(userId: string): AppNotification[] {
  // No sync cache in Directus mode; caller should use getNotifications() (async).
  void userId;
  return [];
}


export async function markNotificationRead(id: string): Promise<void> {
  await dxItems("notifications").update(id, { read: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  // Single bulk PATCH using a filter avoids N round-trips.
  const { dxRequest } = await import("./directusClient");
  await dxRequest("/items/notifications", {
    method: "PATCH",
    body: JSON.stringify({
      query: { filter: { recipient: { _eq: userId }, read: { _eq: false } } },
      data: { read: true },
    }),
  });
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

type DxAuditRow = {
  id: string;
  ts: string;
  actor?: string | DxUserFull | null;
  actor_role?: string | null;
  actor_branch?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  entity_label?: string | null;
  branch?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown> | null;
};

export async function getAudit(): Promise<
  Array<{
    id: string;
    ts: string;
    actorId: string | null;
    actorName: string | null;
    actorRole: string;
    actorBranch: string | null;
    action: string;
    entityType: string | null;
    entityId: string | null;
    entityLabel: string | null;
    branch: string | null;
    before: unknown;
    after: unknown;
    meta?: Record<string, unknown>;
  }>
> {
  const rows = await dxItems<DxAuditRow>("audit_log").list({
    fields: "id,ts,actor_role,actor_branch,action,entity_type,entity_id,entity_label,branch,before,after,meta,actor.id,actor.first_name,actor.last_name",
    sort: "-ts",
    limit: 1000,
  });
  return rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    actorId: userId(r.actor) ?? null,
    actorName: userDisplayName(r.actor) || null,
    actorRole: r.actor_role ?? "anonymous",
    actorBranch: r.actor_branch ?? null,
    action: r.action,
    entityType: r.entity_type ?? null,
    entityId: r.entity_id ?? null,
    entityLabel: r.entity_label ?? null,
    branch: r.branch ?? null,
    before: r.before ?? null,
    after: r.after ?? null,
    meta: r.meta ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

type DxSettings = { id: number; require_admin_approval: boolean };

export function getApprovalRequired(): boolean {
  // Synchronous fallback — UI usually calls async loaders to refresh.
  // We don't aggressively cache; default false until async load runs.
  return false;
}

export async function setApprovalRequired(v: boolean): Promise<void> {
  await dxRequest_singleton({ require_admin_approval: v });
}

async function dxRequest_singleton(payload: Partial<DxSettings>): Promise<void> {
  // app_settings is a singleton
  const { dxRequest } = await import("./directusClient");
  await dxRequest<{ data: DxSettings }>("/items/app_settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getSettingsAsync(): Promise<{ requireAdminApproval: boolean }> {
  const { dxRequest } = await import("./directusClient");
  try {
    const r = await dxRequest<{ data: DxSettings }>("/items/app_settings");
    return { requireAdminApproval: !!r.data.require_admin_approval };
  } catch {
    return { requireAdminApproval: false };
  }
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export async function bulkImportUsers(branch: string, rows: BulkImportRow[]): Promise<BulkImportResult> {
  const result: BulkImportResult = { created: 0, skipped: [] };
  const branchId = await branchCodeToId(branch);
  if (!branchId) throw new Error("Branch not found");
  const existing = await loadUsers(true);
  const roles = await dxItems<{ id: string; name: string }>("directus_roles").list({
    filter: { name: { _in: ["Supervisor", "Agent"] } },
    fields: "id,name",
    limit: -1,
  });
  const roleId = (n: "Supervisor" | "Agent") => roles.find((r) => r.name === n)?.id;

  // Determine next agent_code per role
  const prefixOf = (role: BulkImportRow["role"]) =>
    role === "supervisor" ? "SUP" : role === "underwriter" ? "UW" : "SLS";
  const nextCode = (role: BulkImportRow["role"]) => {
    const p = prefixOf(role);
    let max = 0;
    for (const u of existing) {
      const m = (u.agent_code ?? "").match(new RegExp(`^${p}-(\\d+)$`));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `${p}-${String(max + 1).padStart(3, "0")}`;
  };

  const branchSup = existing.find((u) => u.app_role === "supervisor" && (typeof u.branch === "object" ? u.branch?.id === branchId : u.branch === branchId));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNo = i + 2;
    const name = (row.name ?? "").trim();
    const email = (row.email ?? "").trim().toLowerCase();
    const role = row.role;
    if (!name || !email || !role) {
      result.skipped.push({ row: lineNo, reason: "missing fields" });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      result.skipped.push({ row: lineNo, reason: "invalid email" });
      continue;
    }
    if (existing.some((u) => u.email.toLowerCase() === email)) {
      result.skipped.push({ row: lineNo, reason: "email exists" });
      continue;
    }
    const agentCode = nextCode(role);
    const appRole: AgentRole = role === "supervisor" ? "supervisor" : "agent";
    const password = row.password && row.password.length >= 6 ? row.password : "ChangeMe!2026";
    const [first, ...rest] = name.split(" ");
    try {
      const created = await dxUsers().create({
        email,
        password,
        first_name: first,
        last_name: rest.join(" ") || null,
        app_role: appRole,
        staff_type: role === "supervisor" ? undefined : (role as StaffType),
        branch: branchId,
        agent_code: agentCode,
        supervisor: role === "supervisor" ? null : branchSup?.id ?? null,
        app_active: true,
        role: appRole === "supervisor" ? roleId("Supervisor") : roleId("Agent"),
      } as Record<string, unknown>);
      existing.push(created as DxUserFull);
      result.created += 1;
    } catch (e) {
      result.skipped.push({ row: lineNo, reason: (e as Error).message || "create failed" });
    }
  }
  invalidateUsers();
  return result;
}

// ---------------------------------------------------------------------------
// Settings + subscription stubs (polling-based)
// ---------------------------------------------------------------------------

function poll(cb: () => void, ms: number) {
  if (typeof window === "undefined") return () => {};
  const h = window.setInterval(cb, ms);
  return () => window.clearInterval(h);
}

export const subscribeRequests = (cb: () => void) => poll(cb, 10_000);
export const subscribeAgents = (cb: () => void) => poll(cb, 30_000);
export const subscribeBranches = (cb: () => void) => poll(cb, 60_000);
export const subscribeNotifications = (cb: () => void) => poll(cb, 5_000);
export const subscribeSettings = (cb: () => void) => poll(cb, 60_000);

// ---------------------------------------------------------------------------
// Asset URL helpers (re-exports for parity with demo api)
// ---------------------------------------------------------------------------

export { dxAssetUrl, isDirectusAssetUrl } from "./directusClient";

export async function dxFetchAsset(url: string): Promise<{ blob: Blob; mime: string } | null> {
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return { blob, mime: blob.type };
  } catch {
    return null;
  }
}
