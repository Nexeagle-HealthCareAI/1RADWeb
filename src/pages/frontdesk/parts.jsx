import React from 'react';
import { t } from '../../i18n';
import { C } from '../../components/saral/tokens';
import { fieldStyle, labelStyle } from './fdUtil';

/** Small building blocks shared by the front-desk sheets. */

export function Err({ children }) {
  if (!children) return null;
  return <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 12, padding: '10px 14px', fontSize: 15, fontWeight: 700 }}>{children}</div>;
}

export function Note({ children, tone = 'muted' }) {
  if (!children) return null;
  const st = tone === 'warn' ? { background: C.dueSoft, color: C.dueInk } : { background: 'white', color: C.muted, border: `1px solid ${C.line}` };
  return <div style={{ ...st, borderRadius: 14, padding: '12px 14px', fontSize: 16, lineHeight: 1.5 }}>{children}</div>;
}

/** Two big choices: keep the money as advance (wallet) or give cash back now. */
export function RefundChoice({ value, onChange }) {
  const opts = [
    ['WALLET', t('ed.refundWallet'), t('ed.refundWalletSub')],
    ['CASH', t('ed.refundCash'), t('ed.refundCashSub')],
  ];
  return (
    <div role="radiogroup" aria-label={t('ed.refundHow')} style={{ display: 'grid', gap: 8 }}>
      {opts.map(([v, title, sub]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          style={{ minHeight: 68, borderRadius: 16, padding: '10px 16px', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center',
            ...(value === v ? { background: C.primary, color: 'white', border: 'none' } : { background: 'white', color: C.ink, border: `1.5px solid ${C.line}` }) }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{title}</span>
          <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.85 }}>{sub}</span>
        </button>
      ))}
    </div>
  );
}

/** Reason box for an admin-approval request. */
export function ReasonBox({ value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{t('ed.reason')}</span>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={t('ed.reasonPh')} rows={3}
        style={{ ...fieldStyle, minHeight: 96, padding: '12px 16px', resize: 'vertical', lineHeight: 1.4 }} />
    </label>
  );
}

