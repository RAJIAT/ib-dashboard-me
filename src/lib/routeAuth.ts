/**
 * Route-level authentication guard for protected dashboard routes.
 *
 * In Directus mode reads the cached "me" from localStorage; in demo mode
 * reads the demo session. On SSR / pre-hydration runs without `window`,
 * we skip the check (component-level fallback redirects then).
 */
import { redirect } from "@tanstack/react-router";
import { DIRECTUS_ENABLED, getCachedMe } from "@/services/directusClient";
import { getCurrentUser } from "@/services/api";

export type AppRole = "admin" | "supervisor" | "agent";

export function requireAuth(opts?: { roles?: AppRole[] }) {
  return ({ location }: { location: { href: string } }) => {
    if (typeof window === "undefined") return; // skip on SSR
    let role: AppRole | undefined;
    let authed = false;
    if (DIRECTUS_ENABLED) {
      const me = getCachedMe();
      authed = !!me;
      role = (me?.app_role ?? undefined) as AppRole | undefined;
    } else {
      const u = getCurrentUser();
      authed = !!u;
      role = u?.role as AppRole | undefined;
    }
    if (!authed) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href } as never,
      });
    }
    if (opts?.roles && role && !opts.roles.includes(role)) {
      throw redirect({ to: "/login" });
    }
  };
}
