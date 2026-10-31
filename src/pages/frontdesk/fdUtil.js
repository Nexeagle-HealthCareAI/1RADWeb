import { t } from '../../i18n';
import { C } from '../../components/saral/tokens';

/** Plain helpers and styles shared by the front-desk sheets. */

export const fieldStyle = {
  width: '100%', minHeight: 56, borderRadius: 14, border: `1.5px solid ${C.lineStrong}`, padding: '0 16px',
  fontSize: 18, fontFamily: 'inherit', color: C.ink, background: 'white', boxSizing: 'border-box', outline: 'none',
};
export const labelStyle = { fontSize: 16, fontWeight: 700, color: C.ink };

export const isDoctorRole = (r) => { const l = String(r).toLowerCase().replace(/\s+/g, ''); return l.includes('doctor') || l.includes('radiolog'); };
export const sexWord = (g) => {
  const s = String(g || '').trim().toUpperCase();
  return s === 'F' || s === 'FEMALE' ? t('bk.female') : s === 'M' || s === 'MALE' ? t('bk.male') : (g || '');
};
export const apiError = (e) => e?.response?.data?.message || e?.response?.data?.error || (typeof e?.response?.data === 'string' ? e.response.data : '');
