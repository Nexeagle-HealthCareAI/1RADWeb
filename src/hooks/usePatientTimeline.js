import { useState, useCallback } from 'react';
import apiClient from '../api/apiClient';

/**
 * usePatientTimeline — owns the patient's prior-studies timeline: the history
 * list + loading flag and the fetch that populates them (dedicated timeline API
 * for Guid patients, else an /appointments search fallback). Moved verbatim from
 * ReportingPage; the page passes the patient's appointment in and renders the
 * returned history/loading in the TIMELINE tab.
 */
export default function usePatientTimeline() {
  const [patientHistory, setPatientHistory] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const fetchPatientTimeline = useCallback(async (appointmentData, currentAppId) => {
    if (!appointmentData) return;
    setLoadingTimeline(true);
    try {
      const patientId = appointmentData.patientId || appointmentData.patientIdentifier;

      // Try the dedicated patient timeline API first if patientId is a valid Guid
      const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isGuid = guidRegex.test(patientId);

      if (isGuid) {
        console.info(`[TIMELINE] Querying dedicated timeline API for patient Guid: ${patientId}`);
        const res = await apiClient.get(`/patients/${patientId}/timeline`);
        if (res.data?.success && Array.isArray(res.data.data)) {
          const formattedHistory = res.data.data
            .filter(a => String(a.appointmentId) !== String(appointmentData.appointmentId) && a.displayId !== currentAppId)
            .map(a => ({
              ...a,
              assetCount: a.assets?.length || 0,
              reportImpression: a.report?.impression || '',
              report: a.report
            }));
          setPatientHistory(formattedHistory);
          setLoadingTimeline(false);
          return;
        }
      }

      // Fallback search
      const searchQuery = patientId
        ? String(patientId)
        : (appointmentData.patientName || '');

      if (!searchQuery) return;

      const [todayRes, archiveRes] = await Promise.all([
        apiClient.get('/appointments', { params: { search: searchQuery } }).catch(() => ({ data: [] })),
        apiClient.get('/appointments', { params: { search: searchQuery, isArchive: true } }).catch(() => ({ data: [] })),
      ]);

      const seen = new Set();
      const merged = [...(Array.isArray(todayRes.data) ? todayRes.data : []), ...(Array.isArray(archiveRes.data) ? archiveRes.data : [])]
        .filter(a => {
          const key = String(a.appointmentId);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      const past = merged
        .filter(a => {
          const samePatient =
            (patientId && (String(a.patientId) === String(patientId) || String(a.patientIdentifier) === String(patientId))) ||
            a.patientName?.toLowerCase().trim() === appointmentData.patientName?.toLowerCase().trim();
          const different =
            String(a.appointmentId) !== String(appointmentData.appointmentId) &&
            a.displayId !== currentAppId;
          return samePatient && different;
        })
        .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));

      setPatientHistory(past);
    } catch (err) {
      console.warn('[TIMELINE] Fetch failed:', err.message);
    } finally {
      setLoadingTimeline(false);
    }
  }, []);
  return { patientHistory, loadingTimeline, fetchPatientTimeline };
}
