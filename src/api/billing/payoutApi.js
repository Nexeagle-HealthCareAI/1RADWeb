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
