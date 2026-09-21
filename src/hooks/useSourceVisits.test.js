// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../api/apiClient', () => ({ default: { get: vi.fn() } }));

import apiClient from '../api/apiClient';
import useSourceVisits, { VISITS_PAGE } from './useSourceVisits';

const KEY = 'aaaaaaaa-0000-0000-0000-000000000001';
const RANGE_A = { startDate: '2026-06-01', endDate: '2026-06-30' };
const RANGE_B = { startDate: '2026-07-01', endDate: '2026-07-31' };
const rows = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ appointmentId: `v${from + i}` }));
const reply = (n, from = 0) => ({ data: { patients: rows(n, from) } });

beforeEach(() => { apiClient.get.mockReset(); });

describe('useSourceVisits', () => {
  it('loads the first page of a source, for the given date range', async () => {
    apiClient.get.mockResolvedValue(reply(3));
    const { result } = renderHook(() => useSourceVisits(RANGE_A));

    await act(async () => { await result.current.loadSourceVisits(KEY); });

    expect(apiClient.get).toHaveBeenCalledWith('/referrers/intelligence/visits',
      { params: { sourceKey: KEY, ...RANGE_A, skip: 0, take: VISITS_PAGE } });
    const entry = result.current.sourceVisits[KEY];
    expect(entry.rows).toHaveLength(3);
    expect(entry.loading).toBe(false);
    expect(entry.error).toBeNull();
    expect(entry.rangeKey).toBe(result.current.rangeKey);
  });

  it('"load more" appends the next page after the rows already loaded', async () => {
    apiClient.get.mockResolvedValueOnce(reply(VISITS_PAGE)).mockResolvedValueOnce(reply(40, VISITS_PAGE));
    const { result } = renderHook(() => useSourceVisits(RANGE_A));

    await act(async () => { await result.current.loadSourceVisits(KEY); });
    await act(async () => { await result.current.loadSourceVisits(KEY, { more: true }); });

    expect(apiClient.get).toHaveBeenLastCalledWith('/referrers/intelligence/visits',
      { params: { sourceKey: KEY, ...RANGE_A, skip: VISITS_PAGE, take: VISITS_PAGE } });
    const got = result.current.sourceVisits[KEY].rows;
    expect(got).toHaveLength(VISITS_PAGE + 40);
    expect(got[VISITS_PAGE].appointmentId).toBe(`v${VISITS_PAGE}`);   // in order, nothing repeated
  });

  it('a background refresh re-reads everything already on screen instead of shrinking the list', async () => {
    apiClient.get
      .mockResolvedValueOnce(reply(VISITS_PAGE))
      .mockResolvedValueOnce(reply(40, VISITS_PAGE))
      .mockResolvedValueOnce(reply(VISITS_PAGE + 40));
    const { result } = renderHook(() => useSourceVisits(RANGE_A));
    await act(async () => { await result.current.loadSourceVisits(KEY); });
    await act(async () => { await result.current.loadSourceVisits(KEY, { more: true }); });

    await act(async () => { await result.current.loadSourceVisits(KEY, { silent: true }); });

    expect(apiClient.get).toHaveBeenLastCalledWith('/referrers/intelligence/visits',
      { params: { sourceKey: KEY, ...RANGE_A, skip: 0, take: VISITS_PAGE + 40 } });
    expect(result.current.sourceVisits[KEY].rows).toHaveLength(VISITS_PAGE + 40);
  });

  it('a silent refresh never flips the loading flag', async () => {
    apiClient.get.mockResolvedValue(reply(2));
    const { result } = renderHook(() => useSourceVisits(RANGE_A));
    await act(async () => { await result.current.loadSourceVisits(KEY); });

    let pending;
    act(() => { pending = result.current.loadSourceVisits(KEY, { silent: true }); });
    expect(result.current.sourceVisits[KEY].loading).toBe(false);
    await act(async () => { await pending; });
  });

  it('rows cached for another date range are flagged and never counted toward paging in the new one', async () => {
    apiClient.get.mockResolvedValue(reply(VISITS_PAGE));
    const { result, rerender } = renderHook(({ range }) => useSourceVisits(range), { initialProps: { range: RANGE_A } });
    await act(async () => { await result.current.loadSourceVisits(KEY); });
    const rangeA = result.current.rangeKey;

    rerender({ range: RANGE_B });

    expect(result.current.rangeKey).not.toBe(rangeA);
    expect(result.current.sourceVisits[KEY].rangeKey).toBe(rangeA);   // the caller can see it is another range's
    apiClient.get.mockClear();
    await act(async () => { await result.current.loadSourceVisits(KEY, { silent: true }); });
    expect(apiClient.get).toHaveBeenCalledWith('/referrers/intelligence/visits',
      { params: { sourceKey: KEY, ...RANGE_B, skip: 0, take: VISITS_PAGE } });
  });

  it('all-time sends no date parameters', async () => {
    apiClient.get.mockResolvedValue(reply(1));
    const { result } = renderHook(() => useSourceVisits({}));

    await act(async () => { await result.current.loadSourceVisits(KEY); });

    expect(apiClient.get).toHaveBeenCalledWith('/referrers/intelligence/visits',
      { params: { sourceKey: KEY, skip: 0, take: VISITS_PAGE } });
  });

  it('a failed load keeps the rows already shown and says why (offline vs server)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiClient.get.mockResolvedValueOnce(reply(5)).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useSourceVisits(RANGE_A));
    await act(async () => { await result.current.loadSourceVisits(KEY); });

    await act(async () => { await result.current.loadSourceVisits(KEY, { more: true }); });

    let entry = result.current.sourceVisits[KEY];
    expect(entry.rows).toHaveLength(5);
    expect(entry.error).toMatch(/Cannot reach the server/);
    expect(entry.loading).toBe(false);

    apiClient.get.mockRejectedValueOnce({ response: { status: 500 } });
    await act(async () => { await result.current.loadSourceVisits(KEY); });
    entry = result.current.sourceVisits[KEY];
    expect(entry.error).toMatch(/Could not load/);
    expect(entry.rows).toHaveLength(5);
    consoleError.mockRestore();
  });

  it('a slow reply to an older request never overwrites a newer one', async () => {
    let releaseOld;
    apiClient.get
      .mockImplementationOnce(() => new Promise(resolve => { releaseOld = () => resolve(reply(1)); }))
      .mockResolvedValueOnce(reply(7));
    const { result } = renderHook(() => useSourceVisits(RANGE_A));

    let oldCall;
    act(() => { oldCall = result.current.loadSourceVisits(KEY); });
    await act(async () => { await result.current.loadSourceVisits(KEY); });   // newer, resolves first
    await act(async () => { releaseOld(); await oldCall; });                  // older resolves last

    expect(result.current.sourceVisits[KEY].rows).toHaveLength(7);
  });

  it('keeps each source separate and ignores a missing key', async () => {
    apiClient.get.mockResolvedValueOnce(reply(2)).mockResolvedValueOnce(reply(4));
    const { result } = renderHook(() => useSourceVisits(RANGE_A));

    await act(async () => { await result.current.loadSourceVisits('k1'); });
    await act(async () => { await result.current.loadSourceVisits('k2'); });
    await act(async () => { await result.current.loadSourceVisits(null); });

    expect(result.current.sourceVisits.k1.rows).toHaveLength(2);
    expect(result.current.sourceVisits.k2.rows).toHaveLength(4);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});
