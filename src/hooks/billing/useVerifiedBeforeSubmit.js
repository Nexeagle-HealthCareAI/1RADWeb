import { useCallback } from 'react';

/**
 * Generalizes the "re-fetch canonical state right before a money-affecting
 * submit" pattern first applied to the payment drawer (see
 * useInvoiceActions.handleCollectPayment). A cached/snapshotted object — an
 * invoice, a payout line, an expense, a price — can go stale while its
 * drawer sits open (another tab, another device, or just the offline sync
 * cycle not having caught up yet); this re-verifies it against the server
 * immediately before the mutation fires, instead of trusting whatever was
 * last rendered. If the fetch fails or the caller is offline, it falls back
 * to the snapshot unchanged — no regression for the offline-first flow, only
 * a correctness upgrade for the common online path.
 */
export function useVerifiedBeforeSubmit(isOnline) {
  /**
   * @param {object} snapshot - the locally-held object about to be submitted.
   * @param {object} opts
   * @param {() => Promise<any>} opts.fetchFresh - fetches the current server
   *   state (a list or a paged envelope with `.items`).
   * @param {(list: any[]) => any | undefined} opts.findMatch - picks this
   *   snapshot's row out of the fresh list.
   * @returns {Promise<object>} the snapshot merged with the fresh match
   *   (fresh fields win), or the untouched snapshot if verification wasn't
   *   possible.
   */
  const verifyFresh = useCallback(async (snapshot, { fetchFresh, findMatch }) => {
    if (!isOnline) return snapshot;
    try {
      const fresh = await fetchFresh();
      const list = Array.isArray(fresh) ? fresh : (fresh?.items || []);
      const match = findMatch(list);
      return match ? { ...snapshot, ...match } : snapshot;
    } catch {
      // Transient read failure — fall back to the snapshot rather than
      // blocking the submit on it; the server's own guards are the backstop.
      return snapshot;
    }
  }, [isOnline]);

  /**
   * Same idea, but for an existence/membership decision over a whole list
   * (e.g. "does a commission already exist for this invoice?") rather than
   * merging fresh fields into one snapshot object.
   * @param {() => Promise<any>} fetchFresh - fetches the current server state.
   * @returns {Promise<any[] | null>} the fresh list, or null if verification
   *   wasn't possible (offline, or the fetch failed) — callers should fall
   *   back to their cached list in that case.
   */
  const verifyFreshList = useCallback(async (fetchFresh) => {
    if (!isOnline) return null;
    try {
      const fresh = await fetchFresh();
      return Array.isArray(fresh) ? fresh : (fresh?.items || []);
    } catch {
      return null;
    }
  }, [isOnline]);

  return { verifyFresh, verifyFreshList };
}
