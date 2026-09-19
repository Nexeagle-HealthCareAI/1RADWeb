// useFinanceRevision — a "something changed" signal for the finance caches.
//
// The Admin / Referrals analytics (financial matrix, referrer intelligence,
// strategic outlook) are heavy SERVER-computed views — AR aging, patient
// lifetime value, churn, modality profitability. They can't be recomputed
// from the local cache, so they stay as server fetches. But we still want them
// to refresh on their own after an action instead of going stale until a
// manual reload.
//
// Invoices/Expenses/ReferralCommissions are no longer offline-cached, so this
// can no longer watch a Dexie liveQuery for changes — instead, the Billing
// action hooks (useInvoiceActions, useExpenseActions, usePayoutActions)
// dispatch a `FINANCE_CHANGED_EVENT` window event right after a successful
// direct-API mutation, and this hook just counts those events. A page adds
// the counter to its analytics-fetch effect's dependencies; when it bumps,
// the effect re-runs and re-fetches with whatever timeframe is currently
// selected.
//
// Bumps are debounced — a batch of billing actions in quick succession
// collapses to a single re-fetch.

import { useEffect, useState } from 'react';

export const FINANCE_CHANGED_EVENT = '1rad:finance-changed';

export function notifyFinanceChanged() {
  try { window.dispatchEvent(new Event(FINANCE_CHANGED_EVENT)); } catch (_) { /* non-browser context */ }
}

const DEBOUNCE_MS = 800;

export default function useFinanceRevision() {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let timer = null;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRev(r => r + 1), DEBOUNCE_MS);
    };
    window.addEventListener(FINANCE_CHANGED_EVENT, onChange);
    return () => { clearTimeout(timer); window.removeEventListener(FINANCE_CHANGED_EVENT, onChange); };
  }, []);

  return rev;
}
