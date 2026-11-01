import React from 'react';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { Button, Sheet, Tag } from '../../components/saral/Saral';
import { C } from '../../components/saral/tokens';
import { Err, ReasonBox } from './parts';
import { apiError } from './fdUtil';

/**
 * Booking requests sent by referring doctors from their portal link. Same calls
 * as the full appointment list: list (GET /referrers/booking-requests), decline
 * with a reason the doctor sees, or Book — which opens New booking filled in
 * from the request (the booking then marks the request as booked).
 */
const TONE = { PENDING: [C.dueSoft, C.dueInk, 'rq.pending'], SCHEDULED: [C.okSoft, C.ok, 'rq.scheduled'], DECLINED: [C.dangerSoft, C.danger, 'rq.declined'] };

export default function DoctorRequestsSheet({ onClose, onBook, onCount }) {
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [declining, setDeclining] = React.useState(null); // { id, reason, busy, err }
  const [ver, setVer] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    apiClient.get('/referrers/booking-requests', { params: { includeDecided: true }, suppressErrorToast: true })
      .then(res => {
        if (!alive) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        setRows(list); setErr('');
        onCount?.(list.filter(r => r.status === 'PENDING').length);
      })
      .catch(() => { if (alive) { setRows([]); setErr(t('rq.loadFailed')); } });
    return () => { alive = false; };
  }, [ver, onCount]);

  const decline = async () => {
    if (!declining || declining.busy) return;
    setDeclining(d => ({ ...d, busy: true, err: '' }));
    try {
      await apiClient.post(`/referrers/booking-requests/${declining.id}/decline`, { reason: declining.reason.trim() || null }, { suppressErrorToast: true });
      setDeclining(null);
      setVer(v => v + 1);
    } catch (e) {
      setDeclining(d => ({ ...d, busy: false, err: apiError(e) || t('fd.failed') }));
    }
  };

  const pending = (rows || []).filter(r => r.status === 'PENDING');
  const decided = (rows || []).filter(r => r.status !== 'PENDING');

  const Row = (r) => {
    const [bg, fg, word] = TONE[r.status] || TONE.PENDING;
    const isDecl = declining?.id === r.id;
    return (
      <div key={r.id} style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{r.patientName}</span>
          {[r.age, r.gender].filter(Boolean).length > 0 && <span style={{ fontSize: 15, color: C.muted }}>{[r.age, r.gender].filter(Boolean).join(' · ')}</span>}
          <Tag bg={bg} fg={fg}>{t(word)}</Tag>
        </div>
        <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.5 }}>
          {t('rq.sentBy', { name: r.referrerName || '' })}{r.referrerContact ? ` (${r.referrerContact})` : ''}
          <br />{[r.modality, r.serviceName].filter(Boolean).join(' · ')}{r.mobile ? ` · ${r.mobile}` : ''}{r.preferredDate ? ` · ${t('rq.wants', { date: String(r.preferredDate).slice(0, 10).split('-').reverse().join('-') })}` : ''}
          {r.notes ? <><br />{r.notes}</> : null}
          {r.status === 'DECLINED' && r.declineReason ? <><br />{t('ed.reason')}: {r.declineReason}</> : null}
        </div>
        {r.status === 'PENDING' && !isDecl && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="primary" icon="plus" onClick={() => onBook(r)} style={{ flex: 1 }}>{t('rq.book')}</Button>
            <Button kind="quiet" onClick={() => setDeclining({ id: r.id, reason: '', busy: false, err: '' })}>{t('rq.decline')}</Button>
          </div>
        )}
        {isDecl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ReasonBox value={declining.reason} onChange={(v) => setDeclining(d => ({ ...d, reason: v }))} />
            <div style={{ fontSize: 14, color: C.muted }}>{t('rq.reason')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button kind="quiet" onClick={() => setDeclining(null)}>{t('bk.back')}</Button>
              <Button kind="outlineDanger" onClick={decline} disabled={declining.busy} style={{ flex: 1 }}>{t('rq.decline')}</Button>
            </div>
            <Err>{declining.err}</Err>
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet open onClose={onClose} title={t('rq.title')} footer={<Button kind="quiet" size="lg" full onClick={onClose}>{t('pay.close')}</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows === null && <div style={{ fontSize: 17, color: C.muted, padding: 20, textAlign: 'center' }}>{t('ed.loading')}</div>}
        <Err>{err}</Err>
        {rows && !pending.length && !err && <div style={{ fontSize: 17, color: C.muted, padding: 12 }}>{t('rq.none')}</div>}
        {pending.map(Row)}
        {decided.length > 0 && <div style={{ fontSize: 16, fontWeight: 800, marginTop: 8 }}>{t('rq.earlier')}</div>}
        {decided.slice(0, 20).map(Row)}
      </div>
    </Sheet>
  );
}
