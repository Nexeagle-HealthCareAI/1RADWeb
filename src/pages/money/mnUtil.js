import { t } from '../../i18n';
import { C } from '../../components/saral/tokens';

const norm = (r) => String(r || '').replace(/\s+/g, '').toLowerCase();
const ADMIN = ['admindoctor', 'admin', 'adminoperator'];

/** 'owner' (admins), 'acc' (accountant) or 'desk' (everyone else who can bill). */
export function moneyRole(currentUser) {
  const roles = (currentUser?.roles || []).map(norm);
  if (roles.some(r => ADMIN.includes(r))) return 'owner';
  if (roles.includes('accountant')) return 'acc';
  return 'desk';
}

/** The most this person may take off a bill, as %; null = no limit. Mirrors the server's DiscountPolicy. */
export function discountLimitPercent(role, settings) {
  if (role === 'owner') return null;
  if (role === 'acc') return settings?.accountantDiscountLimitPercent ?? null;
  return settings?.frontDeskDiscountLimitPercent ?? 10;
}

const IST = 5.5 * 60 * 60 * 1000;
/** 'YYYY-MM-DD' for a day in India, `offsetDays` from today. */
export function istDay(offsetDays = 0) {
  const d = new Date(Date.now() + IST + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}
export function istMonthStart() { return istDay(0).slice(0, 8) + '01'; }

/** API timestamps may come without a zone; they are UTC. */
export function asDate(x) {
  if (!x) return null;
  const s = String(x);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
}
export function istTime(x) {
  const d = asDate(x);
  return d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';
}
export function istDate(x) {
  const d = asDate(x);
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '';
}

/** Status word and colours for a bill. */
export function billTag(bill) {
  const st = String(bill?.status || '').toUpperCase();
  if (st === 'CANCELLED') return { word: t('mn.tag.cancelled'), bg: '#F3F4F6', fg: C.muted };
  if (bill?.isFree && Number(bill?.totalAmount ?? bill?.total) <= 0.01) return { word: t('mn.tag.free'), bg: C.okSoft, fg: C.ok };
  if (st === 'PAID') return { word: t('mn.tag.paid'), bg: C.okSoft, fg: C.ok };
  if (st === 'PARTIAL') return { word: t('mn.tag.part'), bg: C.dueSoft, fg: C.dueInk };
  return { word: t('mn.tag.due'), bg: C.dueSoft, fg: C.dueInk };
}

export const balanceOf = (bill) => Math.max(0, Math.round((Number(bill?.balanceAmount ?? bill?.balance ?? ((bill?.totalAmount ?? 0) - (bill?.paidAmount ?? 0))) || 0) * 100) / 100);

export const newKey = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);
