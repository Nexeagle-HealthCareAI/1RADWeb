/**
 * appointmentServiceApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls for per-service operations, comments, SLA, and import
 * within an appointment.
 *
 * Single Responsibility: appointment operational workflow only.
 * No state, no React — pure async functions.
 */

import apiClient from '../apiClient';

// ── Per-Service Operations ────────────────────────────────────────────────────

/**
 * Transition a specific service within an appointment to a new status.
 * Updates per-service TAT timestamps and recomputes the parent appointment's rollup.
 * @param {string} appointmentId
 * @param {string} serviceId
 * @param {string} status  e.g., 'SCANNED', 'DELIVERED'
 */
export const updateServiceStatus = async (appointmentId, serviceId, status) => {
  const res = await apiClient.patch(
    `/appointments/${appointmentId}/services/${serviceId}/status`,
    { Status: status }
  );
  return res.data;
};

/**
 * Set technician notes for a specific service within an appointment.
 * Null/empty value clears the field.
 * @param {string} appointmentId
 * @param {string} serviceId
 * @param {string|null} notes
 */
export const updateServiceNotes = async (appointmentId, serviceId, notes) => {
  const res = await apiClient.patch(
    `/appointments/${appointmentId}/services/${serviceId}/notes`,
    { Notes: notes }
  );
  return res.data;
};

// ── Radiology Workflow ────────────────────────────────────────────────────────

/**
 * Update the radiology report progress / TAT stage for an appointment.
 * @param {string} appointmentId
 * @param {object} command  UpdateReportProgressCommand payload
 */
export const updateOperationsStatus = async (appointmentId, command) => {
  const res = await apiClient.put(
    `/appointments/${appointmentId}/operations-status`,
    command
  );
  return res.data;
};

// ── SLA / Overdue ─────────────────────────────────────────────────────────────

/**
 * Fetch overdue appointments (patients waiting past the SLA threshold).
 * @param {number|null} thresholdMinutes  Defaults to server config (180 min).
 */
export const fetchOverdueAppointments = async (thresholdMinutes = null) => {
  const params = thresholdMinutes != null ? { thresholdMinutes } : {};
  const res = await apiClient.get('/appointments/overdue', { params });
  return res.data;
};

/**
 * Acknowledge (silence) the SLA alert for a specific appointment.
 * Idempotent — re-acking preserves the original acker and timestamp.
 * @param {string} appointmentId
 * @param {boolean} acknowledged
 */
export const acknowledgeOverdue = async (appointmentId, acknowledged = true) => {
  const res = await apiClient.post(
    `/appointments/${appointmentId}/overdue-ack`,
    { Acknowledged: acknowledged }
  );
  return res.data;
};

// ── Comment Trail ─────────────────────────────────────────────────────────────

/**
 * Add a comment to an appointment's append-only comment trail.
 * @param {string} appointmentId
 * @param {string} body  Comment text
 */
export const addAppointmentComment = async (appointmentId, body) => {
  const res = await apiClient.post(`/appointments/${appointmentId}/comments`, { Body: body });
  return res.data;
};

/**
 * Fetch an appointment's full comment history (newest-first).
 * @param {string} appointmentId
 */
export const fetchAppointmentComments = async (appointmentId) => {
  const res = await apiClient.get(`/appointments/${appointmentId}/comments`);
  return res.data;
};

/**
 * Bulk fetch comments for multiple appointments (for export).
 * @param {string[]} appointmentIds  Max 500.
 */
export const fetchCommentsBulk = async (appointmentIds) => {
  const res = await apiClient.post('/appointments/comments/bulk', {
    AppointmentIds: appointmentIds
  });
  return res.data;
};

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Import appointments from an Excel file.
 * @param {File} file
 */
export const importAppointments = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post('/appointments/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return res.data;
};
