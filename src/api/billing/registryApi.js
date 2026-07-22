/**
 * registryApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls for the service charge catalogue (price registry).
 *
 * Single Responsibility: service pricing management only.
 * No state, no React — pure async functions.
 */

import apiClient from '../apiClient';

/**
 * Fetch the full service charge registry (all modalities and prices).
 */
export const fetchRegistry = async () => {
  const res = await apiClient.get('/finance/registry');
  return res.data;
};

/**
 * Create a new service charge entry.
 * @param {object} command  UpsertServiceChargeCommand payload
 * @returns {{ id: string }}
 */
export const createServiceCharge = async (command) => {
  const res = await apiClient.post('/finance/registry', command);
  return res.data;
};

/**
 * Update an existing service charge entry.
 * @param {string} id
 * @param {object} command  UpsertServiceChargeCommand payload
 * @returns {{ id: string }}
 */
export const updateServiceCharge = async (id, command) => {
  const res = await apiClient.put(`/finance/registry/${id}`, command);
  return res.data;
};

/**
 * Delete a service charge entry.
 * @param {string} id
 */
export const deleteServiceCharge = async (id) => {
  const res = await apiClient.delete(`/finance/registry/${id}`);
  return res.data;
};

/**
 * Quick-add a service to the catalogue during appointment booking.
 * Smart upsert: creates with template / prices an unpriced entry / returns an existing one.
 * @param {object} command  AddBookingServiceCommand payload
 * @returns {{ success: boolean, data: object }}
 */
export const quickAddService = async (command) => {
  const res = await apiClient.post('/finance/registry/quick-add', command);
  return res.data;
};
