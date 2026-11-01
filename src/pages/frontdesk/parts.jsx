import React from 'react';
import { t } from '../../i18n';
import { C } from '../../components/saral/tokens';
import { fieldStyle, labelStyle } from './fdUtil';
import { Chip, Icon } from '../../components/saral/Saral';
import { PATIENT_SOURCES, OTHER_SOURCE, canonicalSource } from '../../utils/patientSources';

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


/** A closed-by-default section for optional details, so the main form stays short. */
export function More({ label, children, startOpen = false }) {
  const [open, setOpen] = React.useState(startOpen);
  return (
    <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 16 }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', minHeight: 52, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, color: C.primary, textAlign: 'left' }}>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ transform: open ? 'rotate(90deg)' : 'rotate(-90deg)', display: 'inline-flex', transition: 'transform .15s' }}><Icon name="back" size={18} /></span>
      </button>
      {open && <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} style={fieldStyle} {...rest} />
    </label>
  );
}

/** Village, block, district, address and "how did they hear about us" (all optional). */
export function PatientMore({ value, onChange }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  const src = value.sourceOfInfo || '';
  const known = canonicalSource(src);
  const [other, setOther] = React.useState(!!src && !known);
  return (
    <More label={t('md.more')} startOpen={!!(value.village || value.address || value.district || value.block || src)}>
      <Field label={t('md.village')} value={value.village} onChange={set('village')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <Field label={t('md.block')} value={value.block} onChange={set('block')} />
        <Field label={t('md.district')} value={value.district} onChange={set('district')} />
      </div>
      <Field label={t('md.address')} value={value.address} onChange={set('address')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={labelStyle}>{t('md.source')}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PATIENT_SOURCES.map(sv => {
            const on = sv === OTHER_SOURCE ? other : (!other && known === sv);
            return <Chip key={sv} on={on} onClick={() => { if (sv === OTHER_SOURCE) { setOther(true); onChange({ ...value, sourceOfInfo: '' }); } else { setOther(false); onChange({ ...value, sourceOfInfo: on ? '' : sv }); } }}>{t(`src.${sv}`)}</Chip>;
          })}
        </div>
        {other && <input value={src} placeholder={t('md.sourceOther')} aria-label={t('md.sourceOther')} onChange={e => onChange({ ...value, sourceOfInfo: e.target.value })} style={fieldStyle} />}
      </div>
    </More>
  );
}

/** Extra partner details when a new person is named as "who sent" (all optional). */
export function PartnerMore({ value, onChange, isDoctor }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <More label={t('md.partnerMore')}>
      {isDoctor !== false ? (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <Field label={t('md.speciality')} value={value.specialty} onChange={set('specialty')} />
          <Field label={t('md.degree')} value={value.degree} onChange={set('degree')} />
        </div>
        <Field label={t('md.email')} value={value.email} onChange={set('email')} type="email" inputMode="email" />
      </>) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <Field label={t('md.advSpeciality')} value={value.advSpecialty} onChange={set('advSpecialty')} />
          <Field label={t('md.advDegree')} value={value.advDegree} onChange={set('advDegree')} />
        </div>
      )}
      <Field label={t('md.clinicAddress')} value={value.address} onChange={set('address')} />
    </More>
  );
}
