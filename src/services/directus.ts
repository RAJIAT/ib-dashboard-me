/**
 * Directus shim — small helpers used by routes that touch URLs directly.
 * Real backend work lives in directusClient.ts / directusApi.ts.
 */
import type { DemoBranch } from "./demoStore";
import { URL_BASE } from "./directusClient";

export type DxBranch = DemoBranch;

export function isDirectusAssetUrl(url: string): boolean {
  if (!url) return false;
  if (URL_BASE && url.startsWith(URL_BASE)) return true;
  // any /assets/<uuid> path served by Directus
  return /\/assets\/[0-9a-f-]{36}/i.test(url);
}
