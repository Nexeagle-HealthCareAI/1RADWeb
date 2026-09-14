/**
 * appointmentApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls for core appointment scheduling operations.
 *
 * Single Responsibility: appointment scheduling lifecycle only.
 * No state, no React — pure async functions.
 */

import apiClient from '../apiClient';

/**
 * Fetch appointments with optional filters.
 * @param {{ search?, status?, updatedAfter?, includeDeleted?, startDate? }} params
 */
export const fetchAppointments = async ({
  search,
  status,
  updatedAfter,
  includeDeleted = false,
  startDate,
  pageSize,
  cursor,
  modality,
  doctor
} = {}) => {
  const params = {};
  if (search)        params.search        = search;
  if (status)        params.status        = status;
  if (updatedAfter)  params.updatedAfter  = updatedAfter;
  if (includeDeleted) params.includeDeleted = includeDeleted;
  if (startDate)     params.startDate     = startDate;
  if (pageSize)      params.pageSize      = pageSize;
  if (cursor)        params.cursor        = cursor;
  if (modality)      params.modality      = modality;
  if (doctor)        params.doctor        = doctor;

  const res = await apiClient.get('/appointments', { params });
  return res.data;
};

/**
 * Fetch a single appointment by ID.
 * @param {string} id
 */
export const fetchAppointmentById = async (id) => {
  const res = await apiClient.get(`/appointments/${id}`);
  return res.data;
};

/**
 * Create a new appointment.
 * @param {object} command  CreateAppointmentCommand payload
 * @returns {{ appointmentId: string }}
 */
export const createAppointment = async (command) => {
  const res = await apiClient.post('/appointments', command);
  return res.data;
};

/**
 * Update an existing appointment (full PUT).
 * @param {string} id
 * @param {object} command  UpdateAppointmentCommand payload
 */
export const updateAppointment = async (id, command) => {
  const res = await apiClient.put(`/appointments/${id}`, command);
  return res.data;
};

/**
 * Transition an appointment to a new status.
 * @param {string} id
 * @param {string} status
 */
export const updateAppointmentStatus = async (id, status) => {
  const res = await apiClient.patch(`/appointments/${id}/status`, status);
  return res.data;
};

/**
 * Change the referrer on an appointment.
 * Returns requiresApproval=true if payment was already collected.
 * @param {string} id
 * @param {object} body  ChangeReferrerBody payload
 */
export const changeReferrer = async (id, body) => {
  const res = await apiClient.post(`/appointments/${id}/change-referrer`, body);
  return res.data;
};
