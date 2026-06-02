// useFinanceRevision — a "something changed" signal for the finance caches.
//
// The Admin / Referrals analytics (financial matrix, referrer intelligence,
// strategic outlook) are heavy SERVER-computed views — AR aging, patient
// lifetime value, churn, modality profitability. They can't be recomputed
// from the local cache, so they stay as server fetches. But we still want them
// to refresh on their own after an action instead of going stale until a
// manual reload.
//
// This hook watches the finance-related caches (invoices, expenses, referral
// commissions) and returns a counter that increments ONLY when their contents
// actually change — a new invoice/payment/commission synced in, here or from
// another device. A page adds the counter to its analytics-fetch effect's
// dependencies; when it bumps, the effect re-runs and re-fetches with whatever
// timeframe is currently selected.
//
// Notes:
//   • The first liveQuery emission is treated as the baseline (no bump), so a
//     page's normal mount-time fetch isn't doubled.
//   • Bumps are debounced (a sync that writes invoices AND commissions in quick
//     succession collapses to a single re-fetch).
//   • Value-deduped: a background pull that re-writes identical rows doesn't
//     bump, so we don't re-fetch heavy analytics every 30s for no reason.

import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { tables } from '../db/dexie';

const DEBOUNCE_MS = 800;

export default function useFinanceRevision() {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let last = null;
    let first = true;
    let timer = null;

    const sub = liveQuery(async () => {
      // Count + newest-change marker per table. Counts catch inserts/deletes;
      // the max _updatedAtMs catches in-place edits (e.g. a payment posted
      // against an existing invoice).
      const [invCount, expCount, commCount] = await Promise.all([
        tables.invoices().count(),
        tables.expenses().count(),
        tables.referral_commissions().count(),
      ]);
      const invMax  = await tables.invoices().orderBy('_updatedAtMs').reverse().limit(1).first();
      const commMax = await tables.referral_commissions().orderBy('_updatedAtMs').reverse().limit(1).first();
      return `${invCount}:${expCount}:${commCount}:${invMax?._updatedAtMs || 0}:${commMax?._updatedAtMs || 0}`;
    }).subscribe({
      next: (val) => {
        if (first) { first = false; last = val; return; }   // baseline only
        if (val === last) return;                            // identical → ignore
        last = val;
        clearTimeout(timer);
        timer = setTimeout(() => setRev(r => r + 1), DEBOUNCE_MS);
      },
      error: (err) => console.warn('[useFinanceRevision] liveQuery error', err),
    });

    return () => { clearTimeout(timer); sub.unsubscribe(); };
  }, []);

  return rev;
}
