import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import apiClient from '../api/apiClient';
import { useAuth } from './AuthContext';

const AppointmentContext = createContext(null);

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

  const updateAppointment = useCallback(async (appointmentId, updates) => {
    try {
      // If status update
      if (updates.status) {
        await apiClient.patch(`/appointments/${appointmentId}/status`, `"${updates.status.toUpperCase()}"`, {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      fetchAppointments();
      return { success: true };
    } catch (error) {
      console.error('[MOBILE APPOINTMENTS] Update failed:', error);
      return { success: false };
    }
  }, [fetchAppointments]);

  const deleteAppointment = useCallback(async (appointmentId) => {
    try {
      await apiClient.delete(`/appointments/${appointmentId}`);
      fetchAppointments();
      return { success: true };
    } catch (error) {
      console.error('[MOBILE APPOINTMENTS] Delete failed:', error);
      return { success: false };
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