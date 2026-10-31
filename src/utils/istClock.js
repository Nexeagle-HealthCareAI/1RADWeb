import { useEffect, useState } from 'react';

/**
 * India time helpers (review A2/A3). The centre works in IST, and visit times
 * (appointment.dateTime, and the serviceDate copied from it) are stored as IST
 * clock time with no zone marker. Audit stamps (createdAt, updatedAt, paidAt…)
 * are UTC. These helpers keep the two apart and never depend on the browser's
 * own time zone.
 */

const IST_OFFSET_MS = 330 * 60000;

/** Today's date in India as YYYY-MM-DD. */
export const istTodayYmd = (now = Date.now()) => new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Pure YYYY-MM-DD arithmetic. */
export const shiftYmd = (ymd, days) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const HAS_ZONE = /[zZ]|[+-]\d{2}:?\d{2}$/;

/** A visit time (IST clock, no zone) as epoch ms. A value that carries a zone is honoured. */
export const visitMs = (value) => {
  if (!value) return 0;
  const s = String(value);
  const t = new Date(HAS_ZONE.test(s) ? s : `${s}+05:30`).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** A UTC audit stamp sent without a zone marker, as epoch ms. */
export const utcMs = (value) => {
  if (!value) return 0;
  const s = String(value);
  const t = new Date(HAS_ZONE.test(s) ? s : `${s}Z`).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * { today, yesterday } in India, re-checked every 30 seconds and when the tab
 * comes back into view, so a board left open overnight moves to the new day.
 */
export function useIstToday() {
  const [today, setToday] = useState(() => istTodayYmd());
  useEffect(() => {
    const check = () => setToday(prev => { const t = istTodayYmd(); return t === prev ? prev : t; });
    const id = setInterval(check, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return { today, yesterday: shiftYmd(today, -1) };
}
