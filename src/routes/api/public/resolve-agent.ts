/**
 * Resolve an agent's display name and branch from their public agent_id.
 *
 * Used by the public upload form so anonymous customers (who don't have the
 * agents list cached client-side) can still tag their request with the right
 * agent_name and branch on the server.
 */
import { createFileRoute } from "@tanstack/react-router";

const DIRECTUS = process.env.DIRECTUS_TARGET || "http://api.rajiatiyah.com:8055";

export const Route = createFileRoute("/api/public/resolve-agent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = process.env.DIRECTUS_ADMIN_TOKEN;
        if (!token) {
          return Response.json({ ok: false, error: "not configured" }, { status: 500 });
        }
        const url = new URL(request.url);
        const agentId = (url.searchParams.get("agent_id") ?? "").trim();
        if (!agentId || agentId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
          return Response.json({ ok: false, error: "invalid agent_id" }, { status: 400 });
        }
        try {
          const r = await fetch(
            `${DIRECTUS}/users?filter[agent_id][_eq]=${encodeURIComponent(agentId)}&fields=id,first_name,last_name,email,agent_id,branch&limit=1`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!r.ok) return Response.json({ ok: false, error: "lookup failed" }, { status: 502 });
          const j = (await r.json()) as { data?: any[] };
          const u = j.data?.[0];
          if (!u) return Response.json({ ok: true, found: false });
          const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || agentId;
          return Response.json(
            { ok: true, found: true, agent_id: u.agent_id, name, branch: u.branch ?? "" },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e: any) {
          return Response.json({ ok: false, error: e.message }, { status: 500 });
        }
      },
    },
  },
});
