// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../api/apiClient', () => ({ default: { get: vi.fn() } }));

import apiClient from '../api/apiClient';
import usePatientTimeline from './usePatientTimeline';

const GUID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => { apiClient.get.mockReset(); });

describe('usePatientTimeline', () => {
  it('uses the dedicated timeline API for a Guid patient and excludes the current appointment', async () => {
    apiClient.get.mockResolvedValue({
      data: { success: true, data: [
        { appointmentId: 'A', displayId: 'D-A', assets: [{}, {}], report: { impression: 'imp-A' } },
        { appointmentId: 'CURRENT', displayId: 'D-CUR', report: null },   // the open study — must be filtered out
      ] },
    });
    const { result } = renderHook(() => usePatientTimeline());

    await act(async () => {
      await result.current.fetchPatientTimeline(
        { patientId: GUID, appointmentId: 'CURRENT' }, 'D-CUR',
      );
    });

    expect(apiClient.get).toHaveBeenCalledWith(`/patients/${GUID}/timeline`);
    expect(result.current.patientHistory).toHaveLength(1);
    expect(result.current.patientHistory[0]).toMatchObject({ appointmentId: 'A', assetCount: 2, reportImpression: 'imp-A' });
    expect(result.current.loadingTimeline).toBe(false);
  });

  it('swallows a fetch failure and clears the loading flag (timeline never blocks reporting)', async () => {
    apiClient.get.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => usePatientTimeline());

    await act(async () => {
      await result.current.fetchPatientTimeline({ patientId: GUID, appointmentId: 'CURRENT' }, 'D-CUR');
    });

    expect(result.current.patientHistory).toEqual([]);
    expect(result.current.loadingTimeline).toBe(false);
  });
});
