/** Saral look: colours, font and money format shared by the rebuilt screens. */

export const C = {
  ground: '#F6F7FB', surface: '#FFFFFF', ink: '#111827', muted: '#4B5563', faint: '#6B7280',
  line: '#E5E7EB', lineStrong: '#D1D5DB',
  primary: '#3730A3', primarySoft: '#EEF2FF', primaryDark: '#1E1B4B',
  due: '#C2410C', dueSoft: '#FFEDD5', dueInk: '#9A3412',
  ok: '#166534', okSoft: '#DCFCE7', danger: '#B91C1C', dangerSoft: '#FEE2E2',
};

export const FONT = "'Inter', 'Noto Sans Devanagari', 'Noto Sans Bengali', system-ui, sans-serif";

export const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
