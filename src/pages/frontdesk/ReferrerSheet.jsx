import React from 'react';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { withDoctorPrefix } from '../../utils/referrerFormat';
import { Button, Chip, Icon, Sheet } from '../../components/saral/Saral';
import { C } from '../../components/saral/tokens';
import { Err, Note, ReasonBox, PartnerMore } from './parts';
import { apiError, fieldStyle, labelStyle } from './fdUtil';

/**
 * Change who sent the patient (the referral partner who earns the commission).
 * Same calls as the full appointment list: POST /appointments/{id}/change-referrer;
 * when that partner's commission is already paid the server asks for approval and
 * we send a CHANGE_REFERRER request (with who was paid and how much) instead.
 */
export default function ReferrerSheet({ visit, onClose, onDone, isOnline }) {
  const [partners, setPartners] = React.useState([]);
  const [pick, setPick] = React.useState(null); // { name, isDoctor, contact, advisedBy, address }
  const [other, setOther] = React.useState(false);
  const [phase, setPhase] = React.useState('form'); // form | approval | done | sent
  const [snap, setSnap] = React.useState({ prev: '', paid: 0 });
  const [reason, setReason] = React.useState('');
  const [err, setErr] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const current = String(visit.referredBy || '').trim() || 'Self';

  React.useEffect(() => {
    let alive = true;
    apiClient.get('/referrers', { params: { search: '' }, suppressErrorToast: true }).then(r => {
      if (!alive) return;
      setPartners((Array.isArray(r.data) ? r.data : r.data?.items || [])
        .filter(p => !p.mergedIntoId && (p.name || '').trim() && (p.name || '').trim().toLowerCase() !== 'self'));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const body = () => {
    const isSelf = pick.name.trim().toLowerCase() === 'self';
    const isOther = pick.isDoctor === false && !isSelf;
    const m = pick.more || {};
    const clean = (v) => String(v || '').trim() || null;
    return {
      newReferrerName: withDoctorPrefix(pick.name.trim(), pick.isDoctor),
      newReferrerContact: (pick.contact || '').trim() || null,
      newReferrerIsDoctor: pick.isDoctor !== false,
      newReferrerSupportedByDoctor: isOther ? (pick.advisedBy || '').trim() : null,
      newReferrerEmail: isSelf ? null : clean(m.email),
      newReferrerSpecialty: (!isSelf && pick.isDoctor !== false) ? clean(m.specialty) : null,
      newReferrerDegree: (!isSelf && pick.isDoctor !== false) ? clean(m.degree) : null,
      newReferrerAddress: isSelf ? null : (clean(m.address) || clean(pick.address)),
      newReferrerSupportedSpecialty: isOther ? clean(m.advSpecialty) : null,
      newReferrerSupportedDegree: isOther ? clean(m.advDegree) : null,
    };
  };
  const newName = pick ? withDoctorPrefix(pick.name.trim(), pick.isDoctor) : '';

  const save = async () => {
    if (saving) return;
    setErr('');
    if (isOnline === false) return setErr(t('fd.offline'));
    if (!pick || !pick.name.trim()) return setErr(t('bk.needRef'));
    if (pick.isDoctor === false && pick.name.trim().toLowerCase() !== 'self' && !String(pick.advisedBy || '').trim()) return setErr(t('bk.needAdvisedBy'));
    setSaving(true);
    try {
      const res = await apiClient.post(`/appointments/${visit.appointmentId}/change-referrer`, body(), { suppressErrorToast: true });
      if (res?.data?.requiresApproval) {
        setSnap({ prev: res.data.previousReferrerName || current, paid: Number(res.data.previousPaidCommission) || 0 });
        setPhase('approval');
        return;
      }
      setPhase('done');
      onDone?.();
    } catch (e) {
      setErr(!e?.response ? t('fd.offline') : (apiError(e) || t('fd.failed')));
    } finally {
      setSaving(false);
    }
  };

  const sendApproval = async () => {
    if (saving || !reason.trim()) return;
    setSaving(true); setErr('');
    try {
      await apiClient.post('/approvals', {
        type: 'CHANGE_REFERRER',
        title: `${visit.patientName || 'Patient'} — referrer → ${pick.name.trim()}`,
        appointmentId: visit.appointmentId,
        payload: JSON.stringify({ ...body(), previousReferrerName: snap.prev || null, previousPaidCommission: snap.paid }),
        reason: reason.trim(),
      }, { suppressErrorToast: true });
      window.dispatchEvent(new Event('1rad_approvals_changed'));
      setPhase('sent');
    } catch (e) {
      setErr(apiError(e) || t('fd.failed'));
    } finally {
      setSaving(false);
    }
  };

  let footer = <Button kind="quiet" size="lg" full onClick={onClose}>{t('pay.close')}</Button>;
  if (phase === 'form') footer = <Button kind="primary" size="lg" full onClick={save} disabled={saving || !pick || isOnline === false}>{saving ? t('ed.saving') : t('rf.save')}</Button>;
  if (phase === 'approval') footer = <Button kind="primary" size="lg" full onClick={sendApproval} disabled={saving || !reason.trim()}>{t('ed.send')}</Button>;

  const isPick = (name) => pick && !other && pick.name.toLowerCase() === name.toLowerCase();

  return (
    <Sheet open onClose={onClose} title={t('rf.title')} footer={footer}>
      {(phase === 'done' || phase === 'sent') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0', textAlign: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: C.okSoft, color: C.ok, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={44} stroke={2.6} /></div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{phase === 'sent' ? t('ed.sent') : t('rf.done', { name: newName })}</div>
        </div>
      )}
      {phase === 'approval' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>{t('ed.approvalTitle')}</div>
          <Note tone="warn">{t('rf.paidSub', { name: snap.prev })}</Note>
          <div style={{ fontSize: 16 }}>{snap.prev} → <b>{newName}</b></div>
          <ReasonBox value={reason} onChange={setReason} />
          <Err>{err}</Err>
        </div>
      )}
      {phase === 'form' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 16, color: C.muted }}>{t('rf.now', { name: current })}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip on={isPick('Self')} onClick={() => { setOther(false); setPick({ name: 'Self', isDoctor: true }); }}>{t('bk.self')}</Chip>
            {partners.slice(0, 12).map(p => (
              <Chip key={p.id || p.name} on={isPick(p.name)} onClick={() => { setOther(false); setPick({ name: p.name, isDoctor: p.isDoctor !== false, contact: p.contact || '', advisedBy: p.supportedByDoctor || '', address: p.address || '' }); }}>
                {withDoctorPrefix(p.name, p.isDoctor !== false)}
              </Chip>
            ))}
            <Chip on={other} onClick={() => { setOther(true); setPick({ name: '', isDoctor: true, contact: '', advisedBy: '' }); }}>{t('bk.someoneElse')}</Chip>
          </div>
          {other && pick && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={pick.name} placeholder={t('bk.refName')} aria-label={t('bk.refName')} onChange={e => setPick({ ...pick, name: e.target.value })} style={fieldStyle} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Chip on={pick.isDoctor !== false} onClick={() => setPick({ ...pick, isDoctor: true })}>{t('bk.isDoctor')}</Chip>
                <Chip on={pick.isDoctor === false} onClick={() => setPick({ ...pick, isDoctor: false })}>{t('bk.otherPerson')}</Chip>
              </div>
              {pick.isDoctor === false && <input value={pick.advisedBy} placeholder={t('bk.advisedBy')} aria-label={t('bk.advisedBy')} onChange={e => setPick({ ...pick, advisedBy: e.target.value })} style={fieldStyle} />}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>{t('rf.contact')}</span>
                <input inputMode="numeric" value={pick.contact} onChange={e => setPick({ ...pick, contact: e.target.value.replace(/[^\d+ ]/g, '') })} style={fieldStyle} />
              </label>
              <PartnerMore value={pick.more || {}} isDoctor={pick.isDoctor} onChange={(m) => setPick({ ...pick, more: m })} />
            </div>
          )}
          <Err>{err}</Err>
        </div>
      )}
    </Sheet>
  );
}
