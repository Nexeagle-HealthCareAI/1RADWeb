// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────────────────
vi.mock('../api/apiClient', () => ({ default: { post: vi.fn() } }));
vi.mock('./useElectron', () => ({
  nativeStorage: { set: vi.fn().mockResolvedValue(true), delete: vi.fn().mockResolvedValue(true) },
}));
vi.mock('../db/repos/reportsRepo', () => ({ saveLocalDraft: vi.fn().mockResolvedValue(true) }));

import apiClient from '../api/apiClient';
import { nativeStorage } from './useElectron';
import useReportAutosave from './useReportAutosave';

function makeProps(overrides = {}) {
  return {
    appointmentId: 'appt-1',
    activeServiceId: null,
    selectedTemplateId: 'tpl-1',
    isFinalized: false,
    isOnline: true,
    editorText: '<p>findings</p>',
    impression: 'imp',
    advice: 'adv',
    editorRef: { current: { editor: { getHTML: () => '<p>findings</p>' } } },
    applyContent: vi.fn(),
    addToOutbox: vi.fn().mockResolvedValue(true),
    notify: vi.fn(),
    logEvent: vi.fn(),
    onFinalized: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  apiClient.post.mockReset();
  nativeStorage.set.mockClear();
  nativeStorage.delete.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

describe('useReportAutosave', () => {
  it('writes a local draft (with fresh findings) when content is dirty', async () => {
    renderHook(() => useReportAutosave(makeProps()));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    expect(nativeStorage.set).toHaveBeenCalled();
    const [key, draft] = nativeStorage.set.mock.calls[0];
    expect(key).toBe('1rad_draft_appt-1');
    expect(draft.findings).toBe('<p>findings</p>');
  });

  it('cloud-saves within ~45s of the first edit, sending the current rowVersion', async () => {
    apiClient.post.mockResolvedValue({ data: { success: true, data: { rowVersion: 'v2' } } });
    const { result } = renderHook(() => useReportAutosave(makeProps()));

    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });   // local -> DIRTY
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });  // cloud fires

    expect(apiClient.post).toHaveBeenCalledWith('/reporting/save', expect.objectContaining({
      appointmentId: 'appt-1',
      rowVersion: null,            // no baseline seeded yet
      isFinalized: false,
    }));
    expect(result.current.saveStatus).toBe('SUCCESS');
  });

  it('advances the OCC rowVersion on a successful save', async () => {
    apiClient.post.mockResolvedValue({ data: { success: true, data: { rowVersion: 'v2' } } });
    const { result } = renderHook(() => useReportAutosave(makeProps()));

    await act(async () => { await result.current.saveNow(false); });
    expect(result.current.saveStatus).toBe('SUCCESS');
    expect(apiClient.post.mock.calls[0][1].rowVersion).toBe(null);

    await act(async () => { await result.current.saveNow(false); });
    expect(apiClient.post.mock.calls[1][1].rowVersion).toBe('v2');  // token advanced
  });

  it('on a 409 OCC conflict: applies server state, flags CONFLICT, and Undo re-sends the user copy', async () => {
    apiClient.post.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'OCC_CONFLICT', data: { findings: 'srv', rowVersion: 'v9' } } },
    });
    const props = makeProps();
    const { result } = renderHook(() => useReportAutosave(props));

    await act(async () => { await result.current.saveNow(false); });

    expect(props.applyContent).toHaveBeenCalledWith(expect.objectContaining({ findings: 'srv' }));
    expect(result.current.saveStatus).toBe('CONFLICT');
    expect(result.current.occConflict).toBeTruthy();

    // Undo re-POSTs the stashed user content with the server's new token.
    apiClient.post.mockResolvedValueOnce({ data: { success: true, data: { rowVersion: 'v10' } } });
    await act(async () => { await result.current.undoConflict(); });

    const undoPayload = apiClient.post.mock.calls[1][1];
    expect(undoPayload.findings).toBe('<p>findings</p>');  // the user's pre-conflict content
    expect(undoPayload.rowVersion).toBe('v9');             // server's token from the conflict
    expect(result.current.occConflict).toBeNull();
  });
});
