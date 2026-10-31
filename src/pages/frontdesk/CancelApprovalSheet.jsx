import React from 'react';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { Button, Icon, Sheet } from '../../components/saral/Saral';
import { C } from '../../components/saral/tokens';
import { Err, Note, ReasonBox } from './parts';
import { apiError } from './fdUtil';

/**
 * Cancelling a visit that is already paid needs an admin's sign-off: the server
 * answers "requiresApproval" and we send a CANCEL_APPOINTMENT request with the
 * reason (same as the full appointment list). The refund is settled when the
 * admin approves.
 */
export default function CancelApprovalSheet({ visit, onClose }) {
  const [reason, setReason] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const ref = String(visit.referredBy || '').trim();

  const send = async () => {
    if (saving || !reason.trim()) return;
    setSaving(true); setErr('');
    try {
      await apiClient.post('/approvals', {
        type: 'CANCEL_APPOINTMENT',
        title: `${visit.patientName || 'Patient'} — cancel paid appointment`,
        appointmentId: visit.appointmentId,
        payload: '{}',
        reason: reason.trim(),
      }, { suppressErrorToast: true });
      window.dispatchEvent(new Event('1rad_approvals_changed'));
      setSent(true);
    } catch (e) {
      setErr(apiError(e) || t('fd.failed'));
    } finally {
      setSaving(false);
    }
  };

  const footer = sent
    ? <Button kind="quiet" size="lg" full onClick={onClose}>{t('pay.close')}</Button>
    : <Button kind="primary" size="lg" full onClick={send} disabled={saving || !reason.trim()}>{t('ed.send')}</Button>;

  return (
    <Sheet open onClose={onClose} title={t('cx.paidTitle')} footer={footer}>
      {sent ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0', textAlign: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: C.okSoft, color: C.ok, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={44} stroke={2.6} /></div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{t('ed.sent')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Note tone="warn">{t('cx.paidSub', { name: visit.patientName || '' })}</Note>
          {ref && ref.toLowerCase() !== 'self' && <Note>{t('cx.refNote', { ref })}</Note>}
          <ReasonBox value={reason} onChange={setReason} />
          <Err>{err}</Err>
        </div>
      )}
    </Sheet>
  );
}
