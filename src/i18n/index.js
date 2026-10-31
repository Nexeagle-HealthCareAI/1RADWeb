import { useSyncExternalStore } from 'react';
import { STRINGS } from './strings';

/**
 * App language (UI review: "English only"). One small store, no library:
 *   t('nav.billing')            → the word in the current language, English if missing
 *   t('money.due', { n: '750' }) → "{n}" placeholders filled in
 *   useLang()                   → [lang, setLang]; components re-render on change
 * Patient names, test names and amounts are never translated.
 * The choice is kept per device (localStorage '1rad_lang').
 */

export const LANGS = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'hi', label: 'हिंदी', short: 'हि' },
  { id: 'bn', label: 'বাংলা', short: 'বা' },
];

const KEY = '1rad_lang';
const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    if (LANGS.some(l => l.id === v)) return v;
  } catch { /* storage blocked */ }
  return 'en';
};

let current = read();
const listeners = new Set();
const apply = () => {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
};
apply();

export const getLang = () => current;

export function setLang(lang) {
  if (!LANGS.some(l => l.id === lang) || lang === current) return;
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* storage blocked */ }
  apply();
  listeners.forEach(fn => fn());
}

export const nextLang = () => {
  const i = LANGS.findIndex(l => l.id === current);
  setLang(LANGS[(i + 1) % LANGS.length].id);
};

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  return [lang, setLang];
}

export function t(key, vars) {
  const table = STRINGS[current] || STRINGS.en;
  let s = table[key] ?? STRINGS.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

const NAV_KEYS = {
  '/admin-board': 'nav.dashboard', '/appointment-board': 'nav.appointments', '/billing': 'nav.billing',
  '/approvals': 'nav.approvals', '/technician': 'nav.imaging', '/doctor-board': 'nav.reporting',
  '/referrals': 'nav.referrals', '/staff': 'nav.staff', '/operations-board': 'nav.operations',
  '/configuration': 'nav.configuration', '/subscription': 'nav.subscription', '/dicom-bridge': 'nav.bridge',
  '/studies': 'nav.studies', '/settings': 'nav.settings',
};
/** Menu label for a NAV_ITEMS entry (or any { route, label }) in the current language. */
export const navLabel = (item) => (NAV_KEYS[item?.route] ? t(NAV_KEYS[item.route]) : item?.label);
