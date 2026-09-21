// Shared date-range helpers for the referrals feature (temporal filters,
// overview windows). Pulled out of ReferralsPage.jsx so both the page and
// ReferralIntelligencePanel use the exact same implementation.

// The calendar date `offset` days ago in the device's LOCAL time (IST for the centres). This used
// to format the UTC date, so between 00:00 and 05:30 IST "today" was yesterday - the default
// ranges, TODAY and the matrix reference date were all a day behind for the first 5.5 hours.
export const getISODate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return fmtLocalISO(d);
};

// Local-timezone-safe ISO date formatter. Using new Date().toISOString()
// directly is wrong for India (or any non-UTC zone) because it shifts the
// date back across midnight — e.g., 1 Jan 00:30 IST formats to 2024-12-31.
export const fmtLocalISO = (d) => {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - (offset * 60 * 1000));
  return local.toISOString().split('T')[0];
};

export const getOverviewDates = (timeframe) => {
  const now = new Date();
  let start = null;
  let end = getISODate(0); // TODAY

  if (timeframe === 'DAY') {
    start = getISODate(0);
  } else if (timeframe === 'WEEK') {
    // CURRENT calendar week (Mon → Sun), not a rolling 7-day window.
    // JS getDay(): Sun=0, Mon=1 ... Sat=6. Coerce Sun→7 so the offset to
    // Monday is always positive.
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - (day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    start = fmtLocalISO(monday);
    end = fmtLocalISO(sunday);
  } else if (timeframe === 'MONTH') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    start = fmtLocalISO(d);
  } else if (timeframe === 'YEAR') {
    const d = new Date(now.getFullYear(), 0, 1);
    start = fmtLocalISO(d);
  }
  return { start, end };
};
