import apiClient from '../apiClient';

/**
 * Owner board (phase 4): every centre the owner runs, on one screen.
 * The server checks, for every call, that the user is an admin of each centre named.
 */

/** Each centre's money for the period (IST 'YYYY-MM-DD'), side by side, plus totals. */
export const fetchGlance = async (from, to) =>
  (await apiClient.get('/owner/glance', { params: { from, to }, suppressErrorToast: true })).data;

/** Requests waiting for the owner at every centre. */
export const fetchOwnerApprovals = async () =>
  (await apiClient.get('/owner/approvals', { suppressErrorToast: true })).data || [];

export const reviewOwnerApproval = async (hospitalId, id, approve, note) =>
  (await apiClient.post(`/owner/centres/${hospitalId}/approvals/${id}/review`, { approve, note: note || null }, { suppressErrorToast: true })).data;

/** Each centre's billing rules and prices, and which centre each follows. */
export const fetchOwnerSetup = async () =>
  (await apiClient.get('/owner/setup', { suppressErrorToast: true })).data;

export const copyOwnerSetup = async ({ fromHospitalId, toHospitalIds, billing, prices, keepLinked }) =>
  (await apiClient.post('/owner/setup/copy', { fromHospitalId, toHospitalIds, billing, prices, keepLinked }, { suppressErrorToast: true })).data;

export const unlinkCentre = async (hospitalId) =>
  (await apiClient.delete(`/owner/setup/links/${hospitalId}`, { suppressErrorToast: true })).data;

/** A new centre; optionally starting with another centre's setup (linked by default). */
export const addCentre = async (body) =>
  (await apiClient.post('/hospitals/chain', body, { suppressErrorToast: true })).data;
