/**
 * api.ts — façade that dispatches between Directus and demo backends.
 *
 * Types are exported once (from demoApi). Function impls come from one
 * backend at module init based on VITE_USE_DIRECTUS.
 */

import { DIRECTUS_ENABLED } from "./directusClient";
import * as demo from "./demoApi";
import * as dx from "./directusApi";

// Types — single source of truth (demo defines them)
export type {
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
  Role,
  StaffType,
} from "./demoApi";

// Pure helpers (no backend) — always from demo
export const canDelete = demo.canDelete;
export const canManageAgents = demo.canManageAgents;
export const canDeleteAgents = demo.canDeleteAgents;
export const canSeeAllBranches = demo.canSeeAllBranches;
export const ensureSeeded = demo.ensureSeeded;

// Backend-bound exports
const i: typeof demo = DIRECTUS_ENABLED ? (dx as unknown as typeof demo) : demo;

export const login = i.login;
export const logout = i.logout;
export const signUp = i.signUp;
export const getCurrentUser = i.getCurrentUser;
export const refreshCurrentUser = i.refreshCurrentUser;

export const listBranches = i.listBranches;
export const listBranchObjects = i.listBranchObjects;
export const getBranches = i.getBranches;
export const createBranch = i.createBranch;
export const updateBranch = i.updateBranch;
export const deleteBranch = i.deleteBranch;

export const listRequests = i.listRequests;
export const getRequest = i.getRequest;
export const resolveAssetUrl = i.resolveAssetUrl;
export const updateRequestStatus = i.updateRequestStatus;
export const submitUpload = i.submitUpload;
export const addRequestNote = i.addRequestNote;
export const resolveRequestNote = i.resolveRequestNote;
export const appendAttachmentsToRequest = i.appendAttachmentsToRequest;
export const reassignRequest = i.reassignRequest;
export const addQuotesToRequest = i.addQuotesToRequest;
export const removeQuoteFromRequest = i.removeQuoteFromRequest;

export const listAgents = i.listAgents;
export const getAgents = i.getAgents;
export const createAgent = i.createAgent;
export const updateAgent = i.updateAgent;
export const approveAgent = i.approveAgent;
export const deleteAgent = i.deleteAgent;
export const requestAgentRemoval = i.requestAgentRemoval;
export const approveAgentRemoval = i.approveAgentRemoval;
export const dismissAgentRemoval = i.dismissAgentRemoval;
export const bulkImportUsers = i.bulkImportUsers;

export const listNotificationsFor = i.listNotificationsFor;
export const markNotificationRead = i.markNotificationRead;
export const markAllNotificationsRead = i.markAllNotificationsRead;

export const getApprovalRequired = i.getApprovalRequired;
export const setApprovalRequired = i.setApprovalRequired;

export const subscribeRequests = i.subscribeRequests;
export const subscribeAgents = i.subscribeAgents;
export const subscribeBranches = i.subscribeBranches;
export const subscribeNotifications = i.subscribeNotifications;
export const subscribeSettings = i.subscribeSettings;

export const dxAssetUrl = i.dxAssetUrl;
export const isDirectusAssetUrl = i.isDirectusAssetUrl;
export const dxFetchAsset = i.dxFetchAsset;

// Directus-only: async notifications loader. Demo mode synthesizes from local store.
export async function getNotifications(): Promise<import("./demoApi").AppNotification[]> {
  if (DIRECTUS_ENABLED) return dx.getNotifications();
  const me = demo.getCurrentUser();
  return me ? demo.listNotificationsFor(me.id) : [];
}
