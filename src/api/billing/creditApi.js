/**
 * creditApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls for the patient credit/advance wallet.
 *
 * Single Responsibility: patient advance lifecycle only.
 * No state, no React — pure async functions.
 */

import apiClient from '../apiClient';

/**
 * Get a patient's current credit balance and ledger history.
 * @param {string} patientId
 */
export const fetchPatientCredit = async (patientId) => {
  const res = await apiClient.get(`/finance/credit/${patientId}`);
  return res.data;
};

/**
 * Fetch all patients currently holding an advance balance.
 * Used to render the "Advances & Refunds" list.
 */
export const fetchOutstandingCredits = async () => {
  const res = await apiClient.get('/finance/credits/outstanding');
  return res.data;
};

/**
 * Apply a patient's advance balance toward a specific invoice.
 * @param {object} command  ApplyCreditCommand payload
 */
export const applyCredit = async (command) => {
  const res = await apiClient.post('/finance/credit/apply', command);
  return res.data;
};

/**
 * Refund a patient's advance balance as cash (no approval required).
 * @param {object} command  RefundCreditCommand payload
 */
export const refundCredit = async (command) => {
  const res = await apiClient.post('/finance/credit/refund', command);
  return res.data;
};
