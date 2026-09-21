import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/apiClient';

export const VISITS_PAGE = 100;

/**
 * Lazily loaded visits per referral source (Source Analytics).
 *
 * The summary carries every total but no visit rows; a source's visits are fetched only when it is
 * opened, a page at a time, and cached per source AND date range - rows loaded for another range
 * are flagged with a different `rangeKey`, so a caller never shows them for the current one.
 *
 * `rangeParams` is the date part of the query ({} = all time, or { startDate, endDate }); its
 * JSON is the range key.
 *
 * loadSourceVisits(key, { more, silent })
 *   - default: (re)load from the top. Everything already on screen is re-read in one call
 *     (take = max(loaded, page)), so a background refresh does not shrink a list the user has
 *     paged down.
 *   - more: append the next page after the rows already loaded.
 *   - silent: no loading flag (background refresh).
 * A slow response for an older call never overwrites a newer one.
 */
export default function useSourceVisits(rangeParams) {
  const rangeKey = JSON.stringify(rangeParams);
  const [sourceVisits, setSourceVisits] = useState({}); // { [sourceKey]: { rows, loading, error, rangeKey } }
  const cacheRef = useRef({});
  const seqRef = useRef({});
  useEffect(() => { cacheRef.current = sourceVisits; }, [sourceVisits]);

  const peek = useCallback((key) => cacheRef.current[key], []);

  const loadSourceVisits = useCallback(async (key, { more = false, silent = false } = {}) => {
    if (!key) return;
    const seq = (seqRef.current[key] = (seqRef.current[key] || 0) + 1);
    const cached = cacheRef.current[key];
    const have = cached && cached.rangeKey === rangeKey ? cached.rows : [];
    const skip = more ? have.length : 0;
    const take = more ? VISITS_PAGE : Math.max(have.length, VISITS_PAGE);
    if (!silent) setSourceVisits(prev => ({ ...prev, [key]: { rows: have, loading: true, error: null, rangeKey } }));
    try {
      const res = await apiClient.get('/referrers/intelligence/visits', { params: { sourceKey: key, ...JSON.parse(rangeKey), skip, take } });
      if (seq !== seqRef.current[key]) return; // a newer request superseded this one
      const page = res.data?.patients || [];
      setSourceVisits(prev => ({ ...prev, [key]: { rows: more ? [...have, ...page] : page, loading: false, error: null, rangeKey } }));
    } catch (err) {
      if (seq !== seqRef.current[key]) return;
      console.error('[SOURCE VISITS] Load failed', err);
      setSourceVisits(prev => ({ ...prev, [key]: {
        rows: have, loading: false, rangeKey,
        error: !err?.response ? 'Cannot reach the server - these visits could not be loaded.' : 'Could not load this source\'s visits.',
      } }));
    }
  }, [rangeKey]);

  return { sourceVisits, loadSourceVisits, peek, rangeKey };
}
