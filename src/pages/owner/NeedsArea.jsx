import React from 'react';
import { t } from '../../i18n';
import { Button, Sheet, Tag } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError, fieldStyle } from '../../components/saral/formUtil';
import { fetchGlance, reviewOwnerApproval } from '../../api/billing/ownerApi';
import { istDate, istTime } from '../money/mnUtil';
import { needsOf } from './GlanceArea';
import { periodRange } from './owUtil';

/**
 * Owner board ▸ Needs you. Every request waiting for the owner, from every centre,
 * approved or refused here (the server runs that centre's own review, so the
 * effect and the log are the same as approving at the centre). Below: what else
 * needs a look today, centre by centre, with a button to open it.
 */
export default function NeedsArea({ asks, refresh, toast, openCentre, opening, vp }) {
  const [busy, setBusy] = React.useState('');
  const [refuse, setRefuse] = React.useState(null);
  const [note, setNote] = React.useState('');
  const [gone, setGone] = React.useState(() => new Set());
  const [glance, setGlance] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    const [from, to] = periodRange('today');
    fetchGlance(from, to).then(r => { if (alive) setGlance(r); }).catch(() => { if (alive) setGlance({ centres: [] }); });
    return () => { alive = false; };
  }, []);

  const decide = async (a, approve, why) => {
    setBusy(a.id);
    try {
      await reviewOwnerApproval(a.hospitalId, a.id, approve, why);
      setGone(s => new Set(s).add(a.id));
      toast.show(approve ? t('ow.nd.done') : t('ow.nd.refused'));
      setRefuse(null); setNote('');
      refresh();
    } catch (e) {
      toast.show(apiError(e) || t('ow.nd.failed'));
    } finally { setBusy(''); }
  };

  const list = (asks || []).filter(a => !gone.has(a.id));
  const others = (glance?.centres || [])
    .map(r => ({ r, items: needsOf(r).filter(n => !n.here) }))
    .filter(x => x.items.length > 0);
  const card = { background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 18, padding: '14px 16px', display: 'grid', gap: 8 };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridAutoRows: 'max-content', gap: 14 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{t('ow.nd.title')}</div>
        <div style={{ fontSize: 14, color: C.muted }}>{t('ow.nd.help')}</div>
      </div>
      {asks == null && <div style={{ color: C.faint }}>{t('ow.loading')}</div>}
      {asks != null && list.length === 0 && <div style={{ ...card, color: C.ok, fontWeight: 700 }}>✓ {t('ow.nd.none')}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: vp.desktop ? 'repeat(2, minmax(0,1fr))' : 'minmax(0,1fr)', gap: 10 }}>
        {list.map(a => (
          <div key={a.id} style={card}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Tag bg={C.primarySoft} fg={C.primary} style={{ fontSize: 12, padding: '3px 10px' }}>{a.centre}</Tag>
              <span style={{ fontSize: 13, color: C.faint }}>{istDate(a.createdAt)} {istTime(a.createdAt)}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{a.title}</div>
            {(a.billNumber || a.patientName) && (
              <div style={{ fontSize: 14, color: C.muted }}>
                {[a.patientName, a.billNumber && t('ow.nd.bill', { no: a.billNumber, amount: inr(a.billTotal) })].filter(Boolean).join(' · ')}
              </div>
            )}
            {a.reason && <div style={{ fontSize: 15, background: C.ground, borderRadius: 12, padding: '8px 10px' }}>“{a.reason}”</div>}
            <div style={{ fontSize: 13, color: C.faint }}>{a.askedByMe ? t('ow.nd.askedMe') : t('ow.nd.asked', { name: a.askedBy || '—' })}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button kind="ok" onClick={() => decide(a, true)} disabled={!!busy} style={{ flex: 1 }}>{busy === a.id ? '…' : t('ow.nd.approve')}</Button>
              <Button kind="outline" onClick={() => { setRefuse(a); setNote(''); }} disabled={!!busy} style={{ flex: 1 }}>{t('ow.nd.refuse')}</Button>
            </div>
          </div>
        ))}
      </div>

      {others.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{t('ow.nd.other')}</div>
            <div style={{ fontSize: 14, color: C.muted }}>{t('ow.nd.otherHelp')}</div>
          </div>
          {others.map(({ r, items }) => (
            <div key={r.centre.hospitalId} style={{ ...card, gap: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{r.centre.name}</div>
              {items.map(n => (
                <div key={n.k} style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px solid #F3F4F6', paddingTop: 6 }}>
                  <span style={{ flex: 1, fontSize: 15 }}>{n.text}</span>
                  <Button kind="quiet" onClick={() => openCentre(r.centre.hospitalId, n.route)} disabled={!!opening}>
                    {opening === r.centre.hospitalId ? '…' : t('ow.nd.go')}
                  </Button>
                </div>
              ))}
            </div>
          ))}
          {others.some(x => x.items.some(n => n.k === 'late')) && (
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{t('ow.nd.lateNote')}</div>
          )}
        </div>
      )}

      <Sheet open={!!refuse} onClose={() => setRefuse(null)} title={t('ow.nd.refuseTitle')}
        footer={<Button kind="primary" size="lg" disabled={!note.trim() || !!busy} onClick={() => decide(refuse, false, note.trim())}>{t('ow.nd.refuseSend')}</Button>}>
        {refuse && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800 }}>{refuse.centre} · {refuse.title}</div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{t('ow.nd.refuseNote')}</span>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500}
                style={{ ...fieldStyle, height: 'auto', padding: 12, resize: 'vertical' }} />
            </label>
          </div>
        )}
      </Sheet>
    </div>
  );
}
