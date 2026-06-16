/**
 * Directus client — low-level HTTP + high-level item/file helpers.
 *
 * Enabled when VITE_USE_DIRECTUS=true AND VITE_DIRECTUS_URL is set.
 * When disabled, src/services/api.ts falls back to demoStore.
 */

const URL_BASE_RAW = (import.meta.env.VITE_DIRECTUS_URL as string | undefined)?.replace(/\/$/, "");
export const URL_BASE = URL_BASE_RAW;
export const DIRECTUS_ENABLED =
  String(import.meta.env.VITE_USE_DIRECTUS).toLowerCase() === "true" && !!URL_BASE_RAW;

const STORAGE_KEY = "aib:directus:tokens:v1";
const ME_KEY = "aib:directus:me:v1";

export type DirectusUser = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  app_role?: "admin" | "supervisor" | "agent" | null;
  staff_type?: "underwriter" | "sales" | null;
  branch?: number | { id: number; code: string; name: string } | null;
  agent_code?: string | null;
  supervisor?: string | null;
  assigned_underwriter?: string | null;
  app_active?: boolean | null;
  pending_approval?: boolean | null;
};

type TokenSet = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

function loadTokens(): TokenSet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TokenSet) : null;
  } catch {
    return null;
  }
}

function saveTokens(t: TokenSet | null) {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  else localStorage.removeItem(STORAGE_KEY);
}

let memTokens: TokenSet | null = null;
function getTokens(): TokenSet | null {
  if (memTokens) return memTokens;
  memTokens = loadTokens();
  return memTokens;
}
function setTokens(t: TokenSet | null) {
  memTokens = t;
  saveTokens(t);
}

// ---------------------------------------------------------------------------
// Cached "me"
// ---------------------------------------------------------------------------

let memMe: DirectusUser | null = null;
export function getCachedMe(): DirectusUser | null {
  if (memMe) return memMe;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ME_KEY);
    memMe = raw ? (JSON.parse(raw) as DirectusUser) : null;
  } catch {
    memMe = null;
  }
  return memMe;
}
export function setCachedMe(u: DirectusUser | null) {
  memMe = u;
  if (typeof window === "undefined") return;
  if (u) localStorage.setItem(ME_KEY, JSON.stringify(u));
  else localStorage.removeItem(ME_KEY);
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

async function refresh(): Promise<TokenSet | null> {
  const t = getTokens();
  if (!t || !URL_BASE_RAW) return null;
  const res = await fetch(`${URL_BASE_RAW}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: t.refresh_token, mode: "json" }),
  });
  if (!res.ok) {
    setTokens(null);
    setCachedMe(null);
    return null;
  }
  const j = (await res.json()) as { data: { access_token: string; refresh_token: string; expires: number } };
  const next: TokenSet = {
    access_token: j.data.access_token,
    refresh_token: j.data.refresh_token,
    expires_at: Date.now() + j.data.expires - 30_000,
  };
  setTokens(next);
  return next;
}

async function ensureFreshToken(): Promise<string | null> {
  let t = getTokens();
  if (!t) return null;
  if (Date.now() >= t.expires_at) t = await refresh();
  return t?.access_token ?? null;
}

// ---------------------------------------------------------------------------
// Generic JSON request
// ---------------------------------------------------------------------------

export type DirectusError = { message: string; status: number };

export async function dxRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!URL_BASE_RAW) throw new Error("Directus not configured (VITE_DIRECTUS_URL missing).");
  const token = await ensureFreshToken();
  const res = await fetch(`${URL_BASE_RAW}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    const err: DirectusError = { message: body || res.statusText, status: res.status };
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const ME_FIELDS =
  "id,email,first_name,last_name,app_role,staff_type,agent_code,supervisor,assigned_underwriter,app_active,pending_approval,branch.id,branch.code,branch.name";

export async function dxLogin(email: string, password: string): Promise<DirectusUser> {
  if (!URL_BASE_RAW) {
    throw new Error(
      "Directus is not configured: VITE_DIRECTUS_URL is empty. Set it at build time and rebuild the portal.",
    );
  }
  let res: Response;
  try {
    res = await fetch(`${URL_BASE_RAW}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, mode: "json" }),
    });
  } catch (e) {
    // Network / CORS / DNS failure — fetch rejects without a Response.
    console.error("[directus] login network error", e);
    throw new Error(
      `Cannot reach Directus at ${URL_BASE_RAW}. Check VITE_DIRECTUS_URL, HTTPS, and CORS (CORS_ENABLED + CORS_ORIGIN) on the Directus server.`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[directus] login failed", res.status, text);
    let msg = `Login failed (${res.status})`;
    try {
      const j = JSON.parse(text) as { errors?: Array<{ message?: string }> };
      const m = j.errors?.[0]?.message;
      if (m) msg = m;
    } catch {
      if (text) msg = text;
    }
    throw new Error(msg);
  }
  const j = (await res.json()) as { data: { access_token: string; refresh_token: string; expires: number } };
  setTokens({
    access_token: j.data.access_token,
    refresh_token: j.data.refresh_token,
    expires_at: Date.now() + j.data.expires - 30_000,
  });
  try {
    const me = await dxRequest<{ data: DirectusUser }>(`/users/me?fields=${ME_FIELDS}`);
    setCachedMe(me.data);
    return me.data;
  } catch (e) {
    console.error("[directus] /users/me failed after successful login", e);
    const err = e as DirectusError;
    throw new Error(
      `Logged in but /users/me failed (${err.status ?? "?"}). The user role likely lacks permission to read app_role / branch / etc. Details: ${err.message ?? String(e)}`,
    );
  }
}

export async function dxLogout() {
  const t = getTokens();
  setTokens(null);
  setCachedMe(null);
  if (!t || !URL_BASE_RAW) return;
  await fetch(`${URL_BASE_RAW}/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: t.refresh_token, mode: "json" }),
  }).catch(() => {});
}

export async function dxMe(): Promise<DirectusUser | null> {
  if (!getTokens()) return null;
  try {
    const me = await dxRequest<{ data: DirectusUser }>(`/users/me?fields=${ME_FIELDS}`);
    setCachedMe(me.data);
    return me.data;
  } catch {
    return null;
  }
}

export function dxIsLoggedIn(): boolean {
  return !!getTokens();
}

// ---------------------------------------------------------------------------
// Asset URL
// ---------------------------------------------------------------------------

export function dxAssetUrl(fileId: string | null | undefined): string {
  if (!fileId || !URL_BASE_RAW) return "";
  return `${URL_BASE_RAW}/assets/${fileId}`;
}

export function isDirectusAssetUrl(url: string): boolean {
  if (!URL_BASE_RAW) return false;
  return url.startsWith(`${URL_BASE_RAW}/assets/`);
}

// ---------------------------------------------------------------------------
// File upload (multipart)
// ---------------------------------------------------------------------------

export async function dxUploadFile(file: File, folder?: string): Promise<{ id: string }> {
  if (!URL_BASE_RAW) throw new Error("Directus not configured.");
  const token = await ensureFreshToken();
  const fd = new FormData();
  if (folder) fd.append("folder", folder);
  fd.append("file", file, file.name);
  const res = await fetch(`${URL_BASE_RAW}/files`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: fd,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { data: { id: string } };
  return { id: j.data.id };
}

// ---------------------------------------------------------------------------
// Generic items CRUD
// ---------------------------------------------------------------------------

export type ListQuery = {
  fields?: string;
  filter?: Record<string, unknown>;
  sort?: string;
  limit?: number;
  page?: number;
  search?: string;
};

function buildQuery(q?: ListQuery): string {
  if (!q) return "";
  const params = new URLSearchParams();
  if (q.fields) params.set("fields", q.fields);
  if (q.sort) params.set("sort", q.sort);
  if (q.limit != null) params.set("limit", String(q.limit));
  if (q.page != null) params.set("page", String(q.page));
  if (q.search) params.set("search", q.search);
  if (q.filter) params.set("filter", JSON.stringify(q.filter));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function dxItems<T = Record<string, unknown>>(collection: string) {
  const base = `/items/${collection}`;
  return {
    list: async (q?: ListQuery): Promise<T[]> => {
      const r = await dxRequest<{ data: T[] }>(`${base}${buildQuery(q)}`);
      return r.data;
    },
    get: async (id: string | number, fields?: string): Promise<T | null> => {
      try {
        const r = await dxRequest<{ data: T }>(`${base}/${encodeURIComponent(String(id))}${fields ? `?fields=${fields}` : ""}`);
        return r.data;
      } catch (e: unknown) {
        if ((e as DirectusError).status === 404 || (e as DirectusError).status === 403) return null;
        throw e;
      }
    },
    create: async (payload: Partial<T>): Promise<T> => {
      const r = await dxRequest<{ data: T }>(base, { method: "POST", body: JSON.stringify(payload) });
      return r.data;
    },
    update: async (id: string | number, payload: Partial<T>): Promise<T> => {
      const r = await dxRequest<{ data: T }>(`${base}/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      return r.data;
    },
    remove: async (id: string | number): Promise<void> => {
      await dxRequest<void>(`${base}/${encodeURIComponent(String(id))}`, { method: "DELETE" });
    },
  };
}

// Users (Directus has a dedicated /users endpoint instead of /items/directus_users)
export function dxUsers() {
  const base = `/users`;
  return {
    list: async (q?: ListQuery): Promise<DirectusUser[]> => {
      const r = await dxRequest<{ data: DirectusUser[] }>(`${base}${buildQuery(q)}`);
      return r.data;
    },
    get: async (id: string, fields?: string): Promise<DirectusUser | null> => {
      try {
        const r = await dxRequest<{ data: DirectusUser }>(`${base}/${id}${fields ? `?fields=${fields}` : ""}`);
        return r.data;
      } catch (e: unknown) {
        if ((e as DirectusError).status === 404) return null;
        throw e;
      }
    },
    create: async (payload: Partial<DirectusUser> & { password?: string; role?: string }): Promise<DirectusUser> => {
      const r = await dxRequest<{ data: DirectusUser }>(base, { method: "POST", body: JSON.stringify(payload) });
      return r.data;
    },
    update: async (id: string, payload: Partial<DirectusUser> & { password?: string; role?: string }): Promise<DirectusUser> => {
      const r = await dxRequest<{ data: DirectusUser }>(`${base}/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      return r.data;
    },
    remove: async (id: string): Promise<void> => {
      await dxRequest<void>(`${base}/${id}`, { method: "DELETE" });
    },
  };
}

// ---------------------------------------------------------------------------
// Reassign via webhook flow (server enforces routing rules)
// ---------------------------------------------------------------------------

let cachedReassignFlowId: string | null = null;

export async function dxFindReassignFlowId(): Promise<string | null> {
  if (cachedReassignFlowId) return cachedReassignFlowId;
  const r = await dxRequest<{ data: Array<{ id: string; name: string }> }>(
    "/flows?filter[name][_eq]=lovable: reassign_request&limit=1",
  );
  cachedReassignFlowId = r.data[0]?.id ?? null;
  return cachedReassignFlowId;
}

export async function dxReassignRequest(requestId: string, newAgentId: string): Promise<void> {
  if (!URL_BASE_RAW) throw new Error("Directus not configured.");
  const flowId = await dxFindReassignFlowId();
  if (!flowId) throw new Error("Reassign flow not configured on the server.");
  const token = await ensureFreshToken();
  const res = await fetch(`${URL_BASE_RAW}/flows/trigger/${flowId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ request_id: requestId, new_agent_id: newAgentId }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Reassign failed [${res.status}]: ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Removal-request webhook (optional — flow added in bootstrap)
// ---------------------------------------------------------------------------

let cachedRemovalFlowId: string | null = null;
async function dxFindRemovalFlowId(): Promise<string | null> {
  if (cachedRemovalFlowId) return cachedRemovalFlowId;
  const r = await dxRequest<{ data: Array<{ id: string; name: string }> }>(
    "/flows?filter[name][_eq]=lovable: removal_request&limit=1",
  );
  cachedRemovalFlowId = r.data[0]?.id ?? null;
  return cachedRemovalFlowId;
}

export async function dxTriggerRemoval(agentUserId: string, reason: string): Promise<void> {
  if (!URL_BASE_RAW) throw new Error("Directus not configured.");
  const flowId = await dxFindRemovalFlowId();
  if (!flowId) throw new Error("Removal flow not configured on the server.");
  const token = await ensureFreshToken();
  const res = await fetch(`${URL_BASE_RAW}/flows/trigger/${flowId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ agent_user_id: agentUserId, reason }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Removal request failed [${res.status}]: ${body}`);
  }
}
