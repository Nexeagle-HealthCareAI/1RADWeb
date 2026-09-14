/**
 * expenseApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls for the operational expense ledger.
 *
 * Single Responsibility: expense CRUD only.
 * No state, no React — pure async functions.
 */

import apiClient from '../apiClient';

/**
 * Fetch expenses with optional filters.
 * Returns raw response data (array OR paged envelope).
 */
export const fetchExpenses = async ({
  search,
  category,
  startDate,
  endDate,
  updatedAfter,
  includeDeleted = false,
  pageSize = 0,
  cursor = null,
} = {}) => {
  const params = {};
  if (search)        params.search        = search;
  if (category)      params.category      = category;
  if (startDate)     params.startDate     = startDate;
  if (endDate)       params.endDate       = endDate;
  if (updatedAfter)  params.updatedAfter  = updatedAfter;
  if (includeDeleted) params.includeDeleted = includeDeleted;
  if (pageSize)      params.pageSize      = pageSize;
  if (cursor)        params.cursor        = cursor;

  const res = await apiClient.get('/finance/expenses', { params });
  return res.data;
};

/**
 * Create a new expense record.
 * @returns {{ id: string }}
 */
export const recordExpense = async (command, idempotencyKey = null) => {
  const config = idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {};
  const res = await apiClient.post('/finance/expense', command, config);
  return res.data;
};

/**
 * Update an existing expense record.
 * @param {string} id
 * @param {object} command  UpdateExpenseCommand payload
 */
export const updateExpense = async (id, command, idempotencyKey = null) => {
  const config = idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {};
  const res = await apiClient.put(`/finance/expenses/${id}`, command, config);
  return res.data;
};

/**
 * Soft-delete an expense record.
 * @param {string} id
 */
export const deleteExpense = async (id) => {
  const res = await apiClient.delete(`/finance/expenses/${id}`);
  return res.data;
};

/**
 * Update the status of an expense (e.g., Draft → Approved → Paid).
 * @param {string} id
 * @param {string} status
 */
export const updateExpenseStatus = async (id, status) => {
  const res = await apiClient.put(`/finance/expenses/${id}/status`, { Status: status });
  return res.data;
};
