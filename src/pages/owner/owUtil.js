import { t } from '../../i18n';
import { istDay, istMonthStart } from '../money/mnUtil';

/** Owner board helpers: periods in India dates, and words for a centre's link state. */
export const PERIODS = ['today', 'week', 'month', 'last'];

export function periodRange(p) {
  if (p === 'today') return [istDay(0), istDay(0)];
  if (p === 'week') return [istDay(-6), istDay(0)];
  if (p === 'month') return [istMonthStart(), istDay(0)];
  const first = new Date(`${istMonthStart()}T00:00:00Z`);
  const lastEnd = new Date(first.getTime() - 86400000);
  const lastStart = new Date(Date.UTC(lastEnd.getUTCFullYear(), lastEnd.getUTCMonth(), 1));
  return [lastStart.toISOString().slice(0, 10), lastEnd.toISOString().slice(0, 10)];
}

export const pctOf = (part, whole) => (whole > 0.009 ? Math.round((part / whole) * 100) : 0);

/** 'Main' · 'Follows Main Road' · 'Own setup' */
export function linkWord(centre, all) {
  if (centre.isMain) return { word: t('ow.c.main'), kind: 'main' };
  if (centre.followsHospitalId) {
    const main = all.find(c => c.hospitalId === centre.followsHospitalId);
    return { word: t('ow.c.follows', { name: main?.name || '' }), kind: 'linked' };
  }
  return { word: t('ow.c.own'), kind: 'own' };
}

export const LINK_COLOURS = {
  main: { bg: '#EEF2FF', fg: '#3730A3' },
  linked: { bg: '#DCFCE7', fg: '#166534' },
  own: { bg: '#F3F4F6', fg: '#374151' },
};

/** t() with a singular form: uses `${key}.one` when n is 1 (each language has its own). */
export const tn = (key, vars = {}) => (vars.n === 1 ? t(`${key}.one`, vars) : t(key, vars));
