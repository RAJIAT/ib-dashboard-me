import { createFileRoute } from "@tanstack/react-router";

const DIRECTUS_TARGET = process.env.DIRECTUS_TARGET || "http://api.rajiatiyah.com:8055";
const FILE_MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 40;
const FILE_MIME_WHITELIST = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
]);
const EXT_FALLBACK_REGEX = /\.(jpe?g|png|webp|heic|heif|pdf|mp4|mov|m4v|3gp)$/i;

function jsonError(status: number, error: string) {
  return Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
}

async function adminJson(path: string, init: RequestInit = {}) {
  const token = process.env.DIRECTUS_ADMIN_TOKEN;
  if (!token) throw new Error("DIRECTUS_ADMIN_TOKEN not configured");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${DIRECTUS_TARGET}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function lookupAgent(agentId: string): Promise<{ name: string; branch: string } | null> {
  const json = await adminJson(
    `/users?filter[agent_id][_eq]=${encodeURIComponent(agentId)}&fields=first_name,last_name,email,branch&limit=1`,
  );
  const u = json.data?.[0];
  if (!u) return null;
  return {
    name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || agentId,
    branch: u.branch ?? "",
  };
}

function getFiles(form: FormData, key: string): File[] {
  return form.getAll(key).filter((value): value is File => value instanceof File);
}

function validateFile(file: File): string | null {
  if (file.size === 0) return "Empty file";
  if (file.size > FILE_MAX_BYTES) return "File is too large";
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const extOk = EXT_FALLBACK_REGEX.test(name);
  if (!FILE_MIME_WHITELIST.has(mime) && !(mime === "" && extOk)) return "Unsupported file type";
  return null;
}

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  const json = await adminJson("/files?fields=id", { method: "POST", body: fd });
  const id = json.data?.id;
  if (!id) throw new Error("Upload response missing file id");
  return id as string;
}

export const Route = createFileRoute("/api/public/submit-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get("content-type") || "";
          if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
            return jsonError(400, "Upload must be multipart/form-data");
          }

          const form = await request.formData();
          const agentId = String(form.get("agent_id") ?? "").trim();
          const customerName = String(form.get("customer_name") ?? "").trim();
          const customerEmail = String(form.get("customer_email") ?? "").trim();
          const customerPhone = String(form.get("customer_phone") ?? "").trim();

          if (!agentId || agentId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(agentId)) return jsonError(400, "Invalid agent_id");
          if (customerName.length < 2 || customerName.length > 100) return jsonError(400, "Invalid customer_name");
          if (customerEmail && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail) || customerEmail.length > 255)) {
            return jsonError(400, "Invalid customer_email");
          }
          if (customerPhone && (customerPhone.length > 32 || !/^[0-9+\-\s()]+$/.test(customerPhone))) {
            return jsonError(400, "Invalid customer_phone");
          }

          const registrationFiles = getFiles(form, "registration");
          const licenseFiles = getFiles(form, "license");
          const emiratesFiles = getFiles(form, "emirates");
          const vehicleMedia = getFiles(form, "vehicle_media");
          const attachments = getFiles(form, "attachments");
          const inspectionFiles = getFiles(form, "inspection");

          if (!registrationFiles[0] || !licenseFiles[0] || !emiratesFiles[0]) {
            return jsonError(400, "Missing required documents");
          }

          const allFiles = [...registrationFiles, ...licenseFiles, ...emiratesFiles, ...vehicleMedia, ...attachments, ...inspectionFiles];
          if (allFiles.length > MAX_FILES) return jsonError(400, "Too many files");
          for (const file of allFiles) {
            const error = validateFile(file);
            if (error) return jsonError(error === "File is too large" ? 413 : 415, error);
          }

          const agent = await lookupAgent(agentId);
          if (!agent) return jsonError(400, "Unknown agent_id");

          const [registration, license, emirates] = await Promise.all([
            uploadFile(registrationFiles[0]),
            uploadFile(licenseFiles[0]),
            uploadFile(emiratesFiles[0]),
          ]);
          const inspection = inspectionFiles[0] ? await uploadFile(inspectionFiles[0]) : null;

          const created = await adminJson("/items/requests?fields=id,request_display_id", {
            method: "POST",
            body: JSON.stringify({
              agent_id: agentId,
              agent_name: agent.name,
              branch: agent.branch || null,
              status: "new",
              registration,
              license,
              emirates,
              inspection,
              customer_name: customerName,
              customer_email: customerEmail || null,
              customer_phone: customerPhone || null,
            }),
          });
          const reqId = String(created.data?.id ?? "");
          if (!reqId) throw new Error("Request response missing id");

          for (const file of vehicleMedia) {
            const fileId = await uploadFile(file);
            await adminJson("/items/request_vehicle_media", {
              method: "POST",
              body: JSON.stringify({ request: reqId, file: fileId, kind: file.type.startsWith("video/") ? "video" : "image" }),
            });
          }

          const extraDocs = [...registrationFiles.slice(1), ...licenseFiles.slice(1), ...emiratesFiles.slice(1), ...attachments];
          for (const file of extraDocs) {
            const fileId = await uploadFile(file);
            await adminJson("/items/request_attachments", {
              method: "POST",
              body: JSON.stringify({ request: reqId, file: fileId, original_name: file.name }),
            });
          }

          return Response.json(
            { ok: true, id: created.data?.request_display_id || reqId },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          console.error("[public/submit-upload]", error);
          return jsonError(500, "Upload failed, please try again");
        }
      },
    },
  },
});