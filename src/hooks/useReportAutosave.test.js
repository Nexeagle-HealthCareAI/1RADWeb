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
import { saveLocalDraft } from '../db/repos/reportsRepo';
import { nativeStorage } from './useElectron';
import useReportAutosave from './useReportAutosave';

// The editor's content lives behind a ref, like the real TipTap instance.
function makeProps(overrides = {}) {
  const doc = { html: '<p>findings</p>' };
  return {
    doc,
    appointmentId: 'appt-1',
    activeServiceId: null,
    selectedTemplateId: 'tpl-1',
    isFinalized: false,
    isOnline: true,
    editorText: '<p>findings</p>',
    impression: 'imp',
    advice: 'adv',
    editorRef: { current: { editor: { getHTML: () => doc.html } } },
    applyContent: vi.fn(),
    addToOutbox: vi.fn().mockResolvedValue(true),
    notify: vi.fn(),
    logEvent: vi.fn(),
    onFinalized: vi.fn(),
    ...overrides,
  };
}

// Open a report the way ReportingPage does: load it, let the clean snapshot
// settle, then the doctor types something.
async function openAndEdit(props, rerender, result, serviceId = null) {
  act(() => { result.current.markContentLoaded(serviceId); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  props.doc.html = '<p>findings edited</p>';
  rerender({ ...props, editorText: props.doc.html });
}

beforeEach(() => {
  saveLocalDraft.mockClear();
  vi.useFakeTimers();
  apiClient.post.mockReset();
  nativeStorage.set.mockClear();
  nativeStorage.delete.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

describe('useReportAutosave', () => {
  it('opening a report is not an edit: nothing is saved', async () => {
    const props = makeProps();
    const { result } = renderHook((p) => useReportAutosave(p), { initialProps: props });
    act(() => { result.current.markContentLoaded(null); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(nativeStorage.set).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('writes a local draft (with fresh findings) after an edit', async () => {
    const props = makeProps();
    const { result, rerender } = renderHook((p) => useReportAutosave(p), { initialProps: props });
    await openAndEdit(props, rerender, result);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    expect(nativeStorage.set).toHaveBeenCalled();
    const [key, draft] = nativeStorage.set.mock.calls[0];
    expect(key).toBe('1rad_draft_appt-1');
    expect(draft.findings).toBe('<p>findings edited</p>');
  });

  it('caches the offline draft under the study it belongs to', async () => {
    const props = makeProps({ activeServiceId: 'svc-B' });
    const { result, rerender } = renderHook((p) => useReportAutosave(p), { initialProps: props });
    await openAndEdit(props, rerender, result, 'svc-B');
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });

    expect(saveLocalDraft).toHaveBeenCalled();
    const [appt, draft, svc] = saveLocalDraft.mock.calls.at(-1);
    expect(appt).toBe('appt-1');
    expect(svc).toBe('svc-B');
    expect(draft.findings).toBe('<p>findings edited</p>');
  });

  it('cloud-saves within ~45s of the first edit, sending the current rowVersion', async () => {
    apiClient.post.mockResolvedValue({ data: { success: true, data: { rowVersion: 'v2' } } });
    const props = makeProps();
    const { result, rerender } = renderHook((p) => useReportAutosave(p), { initialProps: props });
    await openAndEdit(props, rerender, result);

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
    const props = makeProps();
    const { result, rerender } = renderHook((p) => useReportAutosave(p), { initialProps: props });
    await openAndEdit(props, rerender, result);

    await act(async () => { await result.current.saveNow(false); });
    expect(result.current.saveStatus).toBe('SUCCESS');
    expect(apiClient.post.mock.calls[0][1].rowVersion).toBe(null);

    props.doc.html = '<p>findings edited again</p>';
    rerender({ ...props, editorText: props.doc.html });
    await act(async () => { await result.current.saveNow(false); });
    expect(apiClient.post.mock.calls[1][1].rowVersion).toBe('v2');  // token advanced
  });

  it('on a 409 OCC conflict: applies server state, flags CONFLICT, and Undo re-sends the user copy', async () => {
    apiClient.post.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'OCC_CONFLICT', data: { findings: 'srv', rowVersion: 'v9' } } },
    });
    const props = makeProps();
    const { result, rerender } = renderHook((p) => useReportAutosave(p), { initialProps: props });
    await openAndEdit(props, rerender, result);

    await act(async () => { await result.current.saveNow(false); });

    expect(props.applyContent).toHaveBeenCalledWith(expect.objectContaining({ findings: 'srv' }));
    expect(result.current.saveStatus).toBe('CONFLICT');
    expect(result.current.occConflict).toBeTruthy();

    // Undo re-POSTs the stashed user content with the server's new token.
    apiClient.post.mockResolvedValueOnce({ data: { success: true, data: { rowVersion: 'v10' } } });
    await act(async () => { await result.current.undoConflict(); });

    const undoPayload = apiClient.post.mock.calls[1][1];
    expect(undoPayload.findings).toBe('<p>findings edited</p>');  // the user's pre-conflict content
    expect(undoPayload.rowVersion).toBe('v9');                    // server's token from the conflict
    expect(result.current.occConflict).toBeNull();
  });
});
