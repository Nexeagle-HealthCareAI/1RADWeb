/**
 * payoutApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls for referral payouts and commissions.
 *
 * Single Responsibility: referrer commissions only.
 * No state, no React — pure async functions.
 */

import apiClient from '../apiClient';

/**
 * Fetch referral commissions with optional filters. Used to re-verify a
 * referrer's live commission rows immediately before deciding whether a
 * payout edit needs admin approval — the cached/synced list can be behind.
 * @param {object} [opts]
 * @param {string} [opts.referrerId]
 */
export const fetchCommissions = async ({ referrerId, startDate, endDate, updatedAfter, includeDeleted = false } = {}) => {
  const params = {};
  if (referrerId) params.referrerId = referrerId;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (updatedAfter) params.updatedAfter = updatedAfter;
  if (includeDeleted) params.includeDeleted = includeDeleted;
  const res = await apiClient.get('/referrers/commissions', { params });
  return res.data;
};

/**
 * Toggle the status of a specific commission (PAID ↔ UNPAID).
 * @param {string} id
 * @param {string} status
 */
export const updateCommissionStatus = async (id, status) => {
  const res = await apiClient.patch(`/referrers/commissions/${id}/status`, { status });
  return res.data;
};

/**
 * Save a batch of commissions (or a single commission array).
 * Also used for write-offs.
 * @param {object} payload
 * @param {string|null} idempotencyKey
 */
export const batchSaveCommissions = async (payload, idempotencyKey = null) => {
  const config = idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {};
  const res = await apiClient.post('/referrers/commissions/batch', payload, config);
  return res.data;
};

/**
 * Update a single commission.
 * @param {string} id
 * @param {object} payload
 * @param {string|null} idempotencyKey
 */
export const updateCommission = async (id, payload, idempotencyKey = null) => {
  const config = idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {};
  const res = await apiClient.put(`/referrers/commissions/${id}`, payload, config);
  return res.data;
};
