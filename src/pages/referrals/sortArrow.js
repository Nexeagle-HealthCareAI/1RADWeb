// Shared sort-direction indicator used by every sortable table header in the
// referrals feature (Doctor Links, Roster, Patient Master List, ...).
export const sortArrow = (cur, key) => (cur.key === key ? (cur.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅');
