/**
 * paymentApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls related to payment collection, discounts, and adjustments.
 *
 * Single Responsibility: payment transactions only.
 * No state, no React — pure async functions.
 */

import apiClient from '../apiClient';

/**
 * Commit a settlement — collects full or partial payment for an invoice.
 * @param {object} command  CollectPaymentCommand payload
 * @param {string} idempotencyKey
 * @returns {{ success: boolean }}
 */
export const collectPayment = async (command, idempotencyKey = null) => {
  const config = idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {};
  const res = await apiClient.post('/finance/payments', command, config);
  return res.data;
};

/**
 * Save invoice as draft — applies discounts without collecting money.
 * @param {string} invoiceId
 * @param {object} request  ApplyDiscountRequest payload
 */
export const applyDiscount = async (invoiceId, request) => {
  const res = await apiClient.post(`/finance/invoices/${invoiceId}/discount`, request);
  return res.data;
};

/**
 * Apply a post-payment financial adjustment to a settled invoice.
 * @param {object} command  ApplyExtraDiscountCommand payload
 * @returns {{ success: boolean }}
 */
export const applyAdjustment = async (command) => {
  const res = await apiClient.post('/finance/adjust', command);
  return res.data;
};
