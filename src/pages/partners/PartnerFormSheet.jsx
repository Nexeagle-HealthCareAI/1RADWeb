import React from 'react';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { Button, Chip, Sheet } from '../../components/saral/Saral';
import { C } from '../../components/saral/tokens';
import { Err, More, Note } from '../../components/saral/parts';
import { apiError, fieldStyle, labelStyle } from '../../components/saral/formUtil';
import { mobileDigits } from './ptUtil';

/**
 * Add a partner (POST /referrers) or change one (PUT /referrers/{id}) - same fields
 * and rules as the Referrals page: name and mobile first, doctor or another person
 * (who then names the doctor they work for), and the optional profile, address and PAN.
 * Adding a name the centre already has on the same mobile reuses that partner; the
 * same name on another mobile is refused by the server with a reason, shown here.
 */
export default function PartnerFormSheet({ partner, onClose, onSaved }) {
  const editing = !!partner?.referrerId;
  const [f, setF] = React.useState(() => ({
    name: partner?.name || '', contact: partner?.contact || '', isDoctor: partner ? partner.isDoctor !== false : true,
    supportedByDoctor: partner?.supportedByDoctor || '', specialty: partner?.specialty || '', degree: partner?.degree || '',
    email: partner?.email || '', address: partner?.address || '', pan: partner?.pan || '',
  }));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

  const pan = f.pan.trim().toUpperCase();
  const save = async () => {
    setErr('');
    if (!f.name.trim()) return setErr(t('pf.needName'));
    const digits = mobileDigits(f.contact);
    if (f.contact.trim() && !/^[6-9]\d{9}$/.test(digits)) return setErr(t('pf.badMobile'));
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return setErr(t('po.panBad'));
    if (!f.isDoctor && !f.supportedByDoctor.trim()) return setErr(t('pf.needDoctor'));
    const body = {
      name: f.name.trim(), contact: digits || f.contact.trim(), address: f.address.trim(),
      email: f.email.trim() || null, specialty: f.isDoctor ? (f.specialty.trim() || null) : null, degree: f.isDoctor ? (f.degree.trim() || null) : null,
      isDoctor: f.isDoctor, supportedByDoctor: f.isDoctor ? null : f.supportedByDoctor.trim(),
      pan: editing ? (pan === (partner.pan || '') ? null : pan) : (pan || null),
    };
    setBusy(true);
    try {
      if (editing) await apiClient.put(`/referrers/${partner.referrerId}`, { referrerId: partner.referrerId, ...body }, { suppressErrorToast: true });
      else {
        const res = await apiClient.post('/referrers', body, { suppressErrorToast: true });
        body.referrerId = res?.data?.referrerId;
      }
      onSaved?.({ ...partner, ...body, pan: pan || partner?.pan });
    } catch (e) { setErr(apiError(e) || t('pf.failed')); setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={editing ? t('pf.editTitle') : t('pf.addTitle')} footer={
      <div style={{ display: 'grid', gap: 8 }}>
        {err && <Err>{err}</Err>}
        <Button size="lg" disabled={busy} onClick={save}>{busy ? t('pf.saving') : t('pf.save')}</Button>
      </div>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={labelStyle}>{t('pf.name')}</span>
          <input value={f.name} onChange={set('name')} style={fieldStyle} autoFocus={!editing} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={labelStyle}>{t('pf.mobile')}</span>
          <input value={f.contact} inputMode="numeric" onChange={e => setF(p => ({ ...p, contact: e.target.value.replace(/[^\d+ ]/g, '').slice(0, 16) }))} style={fieldStyle} />
        </label>
        <div>
          <div style={labelStyle}>{t('pf.kind')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <Chip on={f.isDoctor} onClick={() => setF(p => ({ ...p, isDoctor: true }))}>{t('bk.isDoctor')}</Chip>
            <Chip on={!f.isDoctor} onClick={() => setF(p => ({ ...p, isDoctor: false }))}>{t('bk.otherPerson')}</Chip>
          </div>
          {editing && partner.isDoctor !== f.isDoctor && <div style={{ marginTop: 8 }}><Note tone="warn">{t('pf.kindChange')}</Note></div>}
        </div>
        {!f.isDoctor && (
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelStyle}>{t('bk.advisedBy')}</span>
            <input value={f.supportedByDoctor} onChange={set('supportedByDoctor')} style={fieldStyle} />
          </label>
        )}
        <More label={t('pf.more')} startOpen={editing}>
          <div style={{ display: 'grid', gap: 12 }}>
            {f.isDoctor && (
              <>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 15, color: C.muted }}>{t('md.speciality')}</span><input value={f.specialty} onChange={set('specialty')} style={fieldStyle} /></label>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 15, color: C.muted }}>{t('md.degree')}</span><input value={f.degree} onChange={set('degree')} style={fieldStyle} /></label>
              </>
            )}
            <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 15, color: C.muted }}>{t('md.email')}</span><input value={f.email} type="email" onChange={set('email')} style={fieldStyle} /></label>
            <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 15, color: C.muted }}>{t('md.clinicAddress')}</span><input value={f.address} onChange={set('address')} style={fieldStyle} /></label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 15, color: C.muted }}>{t('po.pan')}</span>
              <input value={f.pan} placeholder="ABCDE1234F" onChange={e => setF(p => ({ ...p, pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) }))} style={{ ...fieldStyle, letterSpacing: 1 }} />
            </label>
          </div>
        </More>
      </div>
    </Sheet>
  );
}
