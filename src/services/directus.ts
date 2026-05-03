/**
 * Compatibility shim — original Directus integration was removed when the
 * project switched to a fully local demo. These stubs keep existing imports
 * working without re-introducing any backend dependency.
 */
import type { DemoBranch } from "./demoStore";

export type DxBranch = DemoBranch;

export function isDirectusAssetUrl(_: string): boolean {
  return false;
}
