import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import apiClient from '../api/apiClient';
import { useAuth } from './AuthContext';

const AppointmentContext = createContext(null);

// --- Status vocabulary (gap analysis P0-6) ----------------------------------
// The API's appointment states are BOOKED → CONFIRMED → IN_PROGRESS → SCANNED →
// REPORTING → REPORTED → DELIVERED (+ COMPLETED, CANCELLED), forward-only. The
// screens use a simpler lower-case set; these maps translate both ways. The app
// used to send 'pending' / 'scheduled', which the API rejects.
const API_TO_UI = {
  BOOKED: 'scheduled',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  SCANNED: 'completed',
  COMPLETED: 'completed',
  REPORTING: 'completed',
  REPORTED: 'completed',
  DELIVERED: 'completed',
  CANCELLED: 'cancelled',
};
const UI_TO_API = {
  confirmed: 'CONFIRMED',
  in_progress: 'IN_PROGRESS',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
};

export const toUiStatus = (apiStatus) =>
  API_TO_UI[String(apiStatus || '').toUpperCase()] || String(apiStatus || 'scheduled').toLowerCase();

// Statuses a user can move an appointment TO from the app.
export const SETTABLE_STATUSES = Object.keys(UI_TO_API);

const apiErrorMessage = (error, fallback) =>
  error?.response?.data?.error || error?.response?.data?.message || fallback;

export function AppointmentProvider({ children }) {
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);

  // --- API Sync ---
  const fetchAppointments = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const response = await apiClient.get('/appointments', { params: filters });
      setAppointments(response.data);
    } catch (error) {
      console.error('[MOBILE APPOINTMENTS] Fetch failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPatients = useCallback(async (search = '') => {
    try {
      const response = await apiClient.get('/patients', { params: { search } });
      const mapped = response.data.map(p => ({
        ...p,
        id: p.patientId,
        name: p.fullName,
        phone: p.mobile
      }));
      setPatients(mapped);
    } catch (error) {
      console.error('[MOBILE PATIENTS] Fetch failed:', error);
    }
  }, []);

  const fetchPersonnel = useCallback(async () => {
    try {
      const response = await apiClient.get('/personnel');
      setDoctors(response.data);
    } catch (error) {
      console.error('[MOBILE PERSONNEL] Fetch failed:', error);
    }
  }, []);

  const { activeCenter } = useAuth();

  // Lifecycle
  useEffect(() => {
    fetchAppointments();
    fetchPatients();
    fetchPersonnel();
  }, [fetchAppointments, fetchPatients, fetchPersonnel, activeCenter]);

  // --- Handlers ---
  const createAppointment = useCallback(async (appointmentData) => {
    try {
      const response = await apiClient.post('/appointments', {
        patientId: appointmentData.patientId,
        service: appointmentData.type || appointmentData.service,
        modality: appointmentData.modality || 'X-RAY',
        dateTime: new Date().toISOString(),
        type: 'BOOKED',
        doctor: appointmentData.doctor || 'Unassigned',
        notes: appointmentData.notes
      });
      fetchAppointments();
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[MOBILE APPOINTMENTS] Create failed:', error);
      return { success: false, error: 'Failed to create appointment' };
    }
  }, [fetchAppointments]);

  // Only status changes are sent from the app; other edits need the web app.
  const updateAppointment = useCallback(async (appointmentId, updates) => {
    if (!updates?.status) return { success: true };

    const target = toUiStatus(updates.status);
    const current = appointments.find(a => a.appointmentId === appointmentId);
    if (current && toUiStatus(current.status) === target) return { success: true }; // no change

    const apiStatus = UI_TO_API[target];
    if (!apiStatus) {
      return { success: false, error: 'An appointment cannot be moved back to that status.' };
    }
    try {
      await apiClient.patch(`/appointments/${appointmentId}/status`, JSON.stringify(apiStatus), {
        headers: { 'Content-Type': 'application/json' }
      });
      fetchAppointments();
      return { success: true };
    } catch (error) {
      console.error('[MOBILE APPOINTMENTS] Update failed:', error);
      return { success: false, error: apiErrorMessage(error, 'Failed to update appointment status.') };
    }
  }, [appointments, fetchAppointments]);

  // There is no DELETE endpoint: appointments are cancelled, never deleted
  // (paid ones need an approval in the web app, and the API says so).
  const deleteAppointment = useCallback(async (appointmentId) => {
    try {
      await apiClient.patch(`/appointments/${appointmentId}/status`, JSON.stringify('CANCELLED'), {
        headers: { 'Content-Type': 'application/json' }
      });
      fetchAppointments();
      return { success: true };
    } catch (error) {
      console.error('[MOBILE APPOINTMENTS] Cancel failed:', error);
      return { success: false, error: apiErrorMessage(error, 'Failed to cancel appointment.') };
    }
  }, [fetchAppointments]);

  const getAppointmentsByDate = useCallback((date) => {
    return appointments.filter(apt => apt.date === date);
  }, [appointments]);

  const getTodayAppointments = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    return getAppointmentsByDate(today);
  }, [getAppointmentsByDate]);

  const getUpcomingAppointments = useCallback(() => {
    return appointments.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  }, [appointments]);

  return (
    <AppointmentContext.Provider value={{
      appointments,
      patients,
      doctors,
      loading,
      fetchAppointments,
      fetchPatients,
      createAppointment,
      updateAppointment,
      deleteAppointment,
      getAppointmentsByDate,
      getTodayAppointments,
      getUpcomingAppointments
    }}>
      {children}
    </AppointmentContext.Provider>
  );
}

export function useAppointments() {
  const context = useContext(AppointmentContext);
  if (!context) {
    throw new Error('useAppointments must be used within an AppointmentProvider');
  }
  return context;
}
