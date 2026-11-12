import React from 'react';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { Button, Chip, Sheet, Tag } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { Err, More, Note } from '../../components/saral/parts';
import { apiError } from '../../components/saral/formUtil';
import PayoutSheet from './PayoutSheet';
import PartnerFormSheet from './PartnerFormSheet';
import { ApprovalSheet, ConfirmSheet, ManualAmountSheet, MergeSheet } from './PartnerActions';
import { currentFy, longDate, mobileDigits, patientOwes, rowState, shortDate } from './ptUtil';
import { printStatement } from './statement';
import { csvCell, csvNumber, downloadCsv } from '../../utils/csv';

/**
 * One partner: what they can be paid now, what waits for the patient, what they owe
 * back, this year's payments, their portal link, and changes to their record.
 * Calls (same as the Referrals page and the Referral Hub):
 *   GET  /referrers/commissions?referrerId=&openOnly=true   open rows
 *   GET  /referrers?search=                                  the full record (PAN, email…)
 *   GET  /referrers/{id}/tds-statement?fy=                   payments in a year
 *   POST /referrers/commissions/pay                          (PayoutSheet)
 *   POST /referrers/{id}/write-off-deficit                   centre absorbs what is owed back
 *   GET  /referrers/{id}/share-link · POST send-links(-whatsapp) · POST {id}/revoke-links
 *   GET  /referrers/{id}/portal-views
 *   PUT  /referrers/{id} · POST /referrers/merge · DELETE /referrers/{id}
 */
const FILTERS = ['all', 'ready', 'waiting', 'owed'];
const STATE_TAG = {
  ready: [C.okSoft, C.ok, 'ps.ready'],
  waiting: [C.dueSoft, C.dueInk, 'ps.waiting'],
  owed: [C.dangerSoft, C.danger, 'ps.owed'],
};

export default function PartnerSheet({ partner: initial, roster, linkStatus, startPay, isAdmin, isFinance, settings, payer, centre, onClose, onChanged, toast }) {
  const [partner, setPartner] = React.useState(initial);
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [fy, setFy] = React.useState(currentFy());
  const [statement, setStatement] = React.useState(null);
  const [views, setViews] = React.useState(null);
  const [open, setOpen] = React.useState(null); // pay | edit | writeoff | revoke | merge | remove | manual | unmerge
  const [approve, setApprove] = React.useState(null); // { kind: 'unpay' | 'amount', row }
  const [unmerge, setUnmerge] = React.useState(null);
  const [ver, setVer] = React.useState(0);
  const [now] = React.useState(() => Date.now());
  const [linkBusy, setLinkBusy] = React.useState('');
  const id = partner.referrerId;

  React.useEffect(() => {
    let alive = true;
    apiClient.get('/referrers/commissions', { params: { referrerId: id, openOnly: true }, suppressErrorToast: true })
      .then(r => {
        if (!alive) return;
        const got = Array.isArray(r.data) ? r.data.filter(x => Number(x.amount) !== 0) : [];
        setRows(got); setErr('');
        // Opened with "Pay" from the list: go straight to the payout once rows are here.
        if (startPay && ver === 0 && got.some(x => rowState(x) === 'ready')) setOpen('pay');
      })
      .catch(e => { if (alive) { setRows([]); setErr(apiError(e) || t('ps.loadFailed')); } });
    return () => { alive = false; };
  }, [id, ver, startPay]);

  React.useEffect(() => {
    if (!isFinance) return undefined;
    let alive = true;
    apiClient.get(`/referrers/${id}/tds-statement`, { params: { fy }, suppressErrorToast: true })
      .then(r => { if (alive) setStatement(r.data || null); })
      .catch(() => { if (alive) setStatement({ lines: [], gross: 0, tdsAmount: 0, net: 0, failed: true }); });
    return () => { alive = false; };
  }, [id, fy, isFinance, ver]);

  const list = rows || [];
  const sums = list.reduce((s, r) => { const st = rowState(r); s[st] += st === 'owed' ? -Number(r.amount) : Number(r.amount); s.n[st]++; return s; },
    { ready: 0, waiting: 0, owed: 0, n: { ready: 0, waiting: 0, owed: 0 } });
  const shown = filter === 'all' ? list : list.filter(r => rowState(r) === filter);
  const record = (roster || []).find(x => x.referrerId === id) || null;
  const aliases = (roster || []).filter(x => x.mergedIntoId === id && !x.deletedAt);
  const full = { ...partner, ...(record || {}), hasPan: partner.hasPan || !!record?.pan };
  const link = linkStatus?.[id];
  const digits = mobileDigits(full.contact);

  const reload = () => { setVer(v => v + 1); onChanged?.(); };

  const portalUrl = async () => {
    const { data } = await apiClient.get(`/referrers/${id}/share-link`, { suppressErrorToast: true });
    return `${window.location.origin}/r/${id}#t=${data.token}`;
  };
  const copyLink = async () => {
    setLinkBusy('copy');
    try { await navigator.clipboard.writeText(await portalUrl()); toast?.(t('ps.linkCopied')); }
    catch (e) { toast?.(apiError(e) || t('ps.linkFailed')); }
    setLinkBusy('');
  };
  const sendLink = async (channel) => {
    setLinkBusy(channel);
    try {
      const path = channel === 'wa' ? '/referrers/send-links-whatsapp' : '/referrers/send-links';
      const { data } = await apiClient.post(path, { referrerIds: [id], baseUrl: window.location.origin }, { suppressErrorToast: true });
      if (Number(data?.sent) > 0) toast?.(t('ps.linkSent'));
      else if (channel === 'wa') toast?.(data?.error || (data?.noContact?.length ? t('ps.noMobile') : t('ps.linkFailed')));
      else toast?.(data?.noEmail?.length ? t('ps.noEmail') : t('ps.linkFailed'));
    } catch (e) { toast?.(apiError(e) || t('ps.linkFailed')); }
    setLinkBusy('');
  };
  const loadViews = async () => {
    try { const { data } = await apiClient.get(`/referrers/${id}/portal-views`, { suppressErrorToast: true }); setViews(data || { views: [] }); }
    catch { setViews({ views: [], failed: true }); }
  };

  const kindTag = full.isDoctor !== false
    ? <Tag bg={C.primarySoft} fg={C.primary}>{t('ps.doctor')}</Tag>
    : <Tag bg="#F3F4F6" fg="#374151">{full.supportedByDoctor ? t('ps.agentFor', { name: full.supportedByDoctor }) : t('ps.agent')}</Tag>;

  return (
    <>
      <Sheet open onClose={onClose} wide title={full.name} footer={
        isFinance && sums.ready > 0
          ? <Button kind="money" size="lg" icon="rupee" onClick={() => setOpen('pay')}>{t('ps.pay', { amount: inr(sums.ready) })}</Button>
          : null}>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {kindTag}
            {full.specialty && <span style={{ fontSize: 15, color: C.muted }}>{full.specialty}</span>}
            {full.contact && <span style={{ fontSize: 15, color: C.muted }}>{full.contact}</span>}
            {partner.aliasCount > 0 && <Tag bg="#F3F4F6" fg="#374151">{t('ps.aliases', { n: partner.aliasCount })}</Tag>}
          </div>
          {digits.length === 10 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Button kind="outline" icon="phone" onClick={() => { window.location.href = `tel:${digits}`; }}>{t('ps.call')}</Button>
              <Button kind="outline" icon="whatsapp" onClick={() => window.open(`https://wa.me/91${digits}`, '_blank', 'noopener')}>{t('ps.chat')}</Button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Box label={t('ps.readyNow')} value={inr(sums.ready)} sub={t('ps.items', { n: sums.n.ready })} tone="ok" />
            <Box label={t('ps.waitingPatient')} value={inr(sums.waiting)} sub={t('ps.items', { n: sums.n.waiting })} tone="due" />
            <Box label={t('ps.owesBack')} value={inr(sums.owed)} sub={sums.owed > 0 ? t('ps.owesHelp') : ''} tone={sums.owed > 0 ? 'danger' : 'muted'} />
          </div>
          {isFinance && sums.owed > 0 && (
            <Button kind="outline" onClick={() => setOpen('writeoff')}>{t('ps.absorb', { amount: inr(sums.owed) })}</Button>
          )}

          <section>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{t('ps.open')}</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {FILTERS.map(f => <Chip key={f} on={filter === f} onClick={() => setFilter(f)}>{t(`ps.f.${f}`)}{f !== 'all' ? ` (${sums.n[f]})` : ''}</Chip>)}
            </div>
            {err && <div style={{ marginTop: 8 }}><Err>{err}</Err></div>}
            {rows === null && <Note>{t('ps.loading')}</Note>}
            {rows !== null && shown.length === 0 && <div style={{ marginTop: 8 }}><Note>{t('ps.nothingOpen')}</Note></div>}
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {shown.map(r => {
                const st = rowState(r);
                const [bg, fg, label] = STATE_TAG[st];
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', border: `1px solid ${C.line}`, borderRadius: 14, padding: '10px 12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.patientName && r.patientName !== 'Unknown Patient' ? r.patientName : (r.remarks || t('pt.patient'))}</div>
                      <div style={{ fontSize: 14, color: C.muted }}>{[r.serviceName || r.modality, shortDate(r.serviceDate), r.referenceNumber].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'grid', gap: 4, justifyItems: 'end' }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: st === 'owed' ? C.danger : C.ink }}>{st === 'owed' ? `− ${inr(-r.amount)}` : inr(r.amount)}</div>
                      <Tag bg={bg} fg={fg} style={{ fontSize: 13, padding: '3px 10px' }}>{t(label)}</Tag>
                      {st === 'ready' && patientOwes(r) && <Tag bg={C.dueSoft} fg={C.dueInk} style={{ fontSize: 12, padding: '2px 8px' }}>{t('pt.patientOwesRow')}</Tag>}
                      {isFinance && st !== 'owed' && (
                        <button type="button" onClick={() => setApprove({ kind: 'amount', row: r })}
                          style={{ background: 'none', border: 'none', color: C.primary, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '4px 0', minHeight: 32, cursor: 'pointer' }}>{t('ps.changeAmount')}</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {isFinance && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <Button kind="outline" icon="plus" onClick={() => setOpen('manual')}>{t('ps.addManual')}</Button>
              {list.length > 0 && <Button kind="outline" onClick={() => exportOpen(full, list)}>{t('ps.exportOpen')}</Button>}
            </div>
          )}

          {isFinance && <More label={t('ps.recentPaid')}><RecentPaid id={id} ver={ver} onUndo={(row) => setApprove({ kind: 'unpay', row })} /></More>}

          {isFinance && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{t('ps.payments')}</div>
                {[currentFy(), prevFy(currentFy())].map(y => <Chip key={y} on={fy === y} onClick={() => setFy(y)}>{y}</Chip>)}
              </div>
              {!statement && <Note>{t('ps.loading')}</Note>}
              {statement?.failed && <Err>{t('ps.loadFailed')}</Err>}
              {statement && !statement.failed && (statement.lines || []).length === 0 && <Note>{t('ps.noPayments', { fy })}</Note>}
              <div style={{ display: 'grid', gap: 8 }}>
                {(statement?.lines || []).map((l, i) => (
                  <div key={l.payoutNumber || i} style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 14, padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{longDate(l.paidAt)}</div>
                      <div style={{ fontSize: 14, color: C.muted }}>{[t(`po.mode.${String(l.mode || 'CASH').toUpperCase()}`), l.reference, l.payoutNumber].filter(Boolean).join(' · ')}</div>
                      {Number(l.tdsAmount) > 0 && <div style={{ fontSize: 14, color: C.muted }}>{t('ps.tdsCut', { amount: inr(l.tdsAmount) })}</div>}
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{inr(l.net)}</div>
                  </div>
                ))}
              </div>
              {statement && (statement.lines || []).length > 0 && (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <Note>{t('ps.yearTotals', { gross: inr(statement.gross), tds: inr(statement.tdsAmount), net: inr(statement.net) })}</Note>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Button kind="outline" icon="print" onClick={() => printStatement({ statement, partner: full, centre })}>{t('ps.printStatement')}</Button>
                    <Button kind="outline" onClick={() => exportStatement(statement, full)}>{t('ps.downloadStatement')}</Button>
                  </div>
                </div>
              )}
            </section>
          )}

          {isAdmin && (
            <More label={t('ps.portal')}>
              <div style={{ display: 'grid', gap: 10 }}>
                <Note>{t('ps.portalHelp')}</Note>
                <LinkNote link={link} now={now} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  <Button kind="outline" icon="whatsapp" disabled={!!linkBusy} onClick={() => sendLink('wa')}>{linkBusy === 'wa' ? t('ps.sending') : t('ps.sendWa')}</Button>
                  <Button kind="outline" disabled={!!linkBusy} onClick={() => sendLink('email')}>{linkBusy === 'email' ? t('ps.sending') : t('ps.sendEmail')}</Button>
                  <Button kind="outline" disabled={!!linkBusy} onClick={copyLink}>{t('ps.copyLink')}</Button>
                  <Button kind="outline" icon="clock" onClick={loadViews}>{t('ps.activity')}</Button>
                </div>
                {views && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {views.failed && <Err>{t('ps.loadFailed')}</Err>}
                    {!views.failed && (views.views || []).length === 0 && <Note>{t('ps.noViews')}</Note>}
                    {(views.views || []).slice(0, 12).map((v, i) => (
                      <div key={i} style={{ fontSize: 15, color: C.muted, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <span>{new Date(v.viewedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{t(`ps.view.${String(v.action || 'VIEW').toUpperCase()}`) || v.action}</span>
                      </div>
                    ))}
                    {Number(views.distinctDevices) > 1 && <Note tone="warn">{t('ps.manyDevices', { n: views.distinctDevices })}</Note>}
                  </div>
                )}
                <Button kind="outlineDanger" onClick={() => setOpen('revoke')}>{t('ps.revoke')}</Button>
              </div>
            </More>
          )}

          {isAdmin && (
            <More label={t('ps.record')}>
              {aliases.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 15, color: C.muted }}>{t('ps.aliasList')}</div>
                  {aliases.map(a => (
                    <div key={a.referrerId} style={{ display: 'flex', gap: 10, alignItems: 'center', background: C.ground, borderRadius: 12, padding: '8px 12px' }}>
                      <div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>{a.name}</div>
                      <Button kind="quiet" onClick={() => setUnmerge(a)}>{t('ps.unmerge')}</Button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <Button kind="outline" icon="user" onClick={() => setOpen('edit')}>{t('ps.edit')}</Button>
                <Button kind="outline" onClick={() => setOpen('merge')}>{t('ps.merge')}</Button>
                <Button kind="outlineDanger" onClick={() => setOpen('remove')}>{t('ps.remove')}</Button>
              </div>
            </More>
          )}
        </div>
      </Sheet>

      {open === 'pay' && rows && (
        <PayoutSheet partner={full} rows={rows} settings={settings} payer={payer} centre={centre}
          onClose={() => setOpen(null)} onPaid={() => { reload(); }} />
      )}
      {open === 'edit' && (
        <PartnerFormSheet partner={full} onClose={() => setOpen(null)}
          onSaved={(p) => { setOpen(null); setPartner(prev => ({ ...prev, name: p.name, contact: p.contact, isDoctor: p.isDoctor, supportedByDoctor: p.supportedByDoctor, hasPan: !!p.pan || prev.hasPan })); reload(); toast?.(t('pf.saved')); }} />
      )}
      {open === 'writeoff' && (
        <ConfirmSheet title={t('ps.absorbTitle')} body={t('ps.absorbBody', { amount: inr(sums.owed), name: full.name })} confirm={t('ps.absorbYes')}
          run={() => apiClient.post(`/referrers/${id}/write-off-deficit`, null, { suppressErrorToast: true })}
          onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); toast?.(t('ps.absorbed')); }} />
      )}
      {open === 'revoke' && (
        <ConfirmSheet title={t('ps.revokeTitle')} body={t('ps.revokeBody', { name: full.name })} confirm={t('ps.revokeYes')} danger
          run={() => apiClient.post(`/referrers/${id}/revoke-links`, null, { suppressErrorToast: true })}
          onClose={() => setOpen(null)} onDone={() => { setOpen(null); toast?.(t('ps.revoked')); }} />
      )}
      {open === 'remove' && (
        <ConfirmSheet title={t('ps.removeTitle')} body={t('ps.removeBody', { name: full.name })} confirm={t('ps.removeYes')} danger
          run={() => apiClient.delete(`/referrers/${id}`, { suppressErrorToast: true })}
          onClose={() => setOpen(null)} onDone={() => { setOpen(null); onChanged?.(); onClose(); toast?.(t('ps.removed')); }} />
      )}
      {open === 'manual' && (
        <ManualAmountSheet partner={full} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); toast?.(t('ps.manualAdded')); }} />
      )}
      {approve && (
        <ApprovalSheet kind={approve.kind} row={approve.row} partnerName={full.name} onClose={() => setApprove(null)}
          onDone={() => { setApprove(null); toast?.(t('ps.sentForApproval')); }} />
      )}
      {unmerge && (
        <ConfirmSheet title={t('ps.unmergeTitle')} body={t('ps.unmergeBody', { name: unmerge.name, primary: full.name })} confirm={t('ps.unmerge')}
          run={() => apiClient.post(`/referrers/${unmerge.referrerId}/unmerge`, null, { suppressErrorToast: true })}
          onClose={() => setUnmerge(null)} onDone={() => { setUnmerge(null); reload(); toast?.(t('ps.unmerged')); }} />
      )}
      {open === 'merge' && (
        <MergeSheet source={full} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onChanged?.(); onClose(); toast?.(t('ps.merged')); }} />
      )}
    </>
  );
}

function prevFy(fy) {
  const y = Number(String(fy).slice(0, 4)) - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

function Box({ label, value, sub, tone }) {
  const tones = { ok: [C.okSoft, C.ok], due: [C.dueSoft, C.dueInk], danger: [C.dangerSoft, C.danger], muted: ['white', C.muted] };
  const [bg, fg] = tones[tone] || tones.muted;
  return (
    <div style={{ background: bg, color: fg, borderRadius: 16, padding: '12px 14px', border: tone === 'muted' ? `1px solid ${C.line}` : 'none' }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone === 'muted' ? C.ink : fg }}>{value}</div>
      {sub && <div style={{ fontSize: 14 }}>{sub}</div>}
    </div>
  );
}

/** Payments in the last 90 days, with "ask to undo" (approval). Loaded when opened. */
function RecentPaid({ id, ver, onUndo }) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    apiClient.get('/referrers/commissions', { params: { referrerId: id, startDate: from }, suppressErrorToast: true })
      .then(r => { if (alive) setRows((Array.isArray(r.data) ? r.data : []).filter(x => String(x.status).toUpperCase() === 'PAID' && Number(x.amount) > 0)); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [id, ver]);
  if (rows === null) return <Note>{t('ps.loading')}</Note>;
  if (!rows.length) return <Note>{t('ps.noRecentPaid')}</Note>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.slice(0, 50).map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: C.ground, borderRadius: 12, padding: '8px 12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{r.patientName && r.patientName !== 'Unknown Patient' ? r.patientName : t('pt.patient')}</div>
            <div style={{ fontSize: 14, color: C.muted }}>{[r.serviceName || r.modality, shortDate(r.serviceDate), r.payeeName && `${t('ps.paidTo')} ${r.payeeName}`].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ fontWeight: 800 }}>{inr(r.amount)}</div>
          <Button kind="quiet" onClick={() => onUndo(r)}>{t('ps.undo')}</Button>
        </div>
      ))}
    </div>
  );
}

function LinkNote({ link, now }) {
  if (!link || !link.lastSentAt) return <div style={{ fontSize: 15, color: C.muted }}>{t('ps.linkNever')}</div>;
  if (link.revokedAt && (!link.lastSentAt || new Date(link.revokedAt) > new Date(link.lastSentAt))) return <div style={{ fontSize: 15, color: C.danger }}>{t('ps.linkRevoked')}</div>;
  const exp = link.lastSentExpiresAt ? new Date(link.lastSentExpiresAt) : null;
  if (!exp) return <div style={{ fontSize: 15, color: C.danger }}>{t('ps.linkRevoked')}</div>;
  const days = Math.ceil((exp - now) / 864e5);
  if (days <= 0) return <div style={{ fontSize: 15, color: C.danger }}>{t('ps.linkExpired', { date: longDate(exp) })}</div>;
  const via = String(link.lastSentChannel || '').toLowerCase().includes('whats') ? 'WhatsApp' : t('ps.email');
  const warn = days <= 14 && !link.autoRenew;
  return (
    <div style={{ fontSize: 15, color: warn ? C.dueInk : C.muted }}>
      {t('ps.linkSentOn', { date: longDate(link.lastSentAt), via, days })} · {link.autoRenew ? t('ps.renews') : t('ps.noRenew')}
    </div>
  );
}

/** Open rows for one partner - no patient mobile or address (review #26). */
function exportOpen(partner, rows) {
  const lines = [['Date', 'Patient', 'Test', 'Reference', 'Amount', 'State'].map(csvCell).join(',')];
  rows.forEach(r => lines.push([shortDate(r.serviceDate), r.patientName || '', r.serviceName || r.modality || '', r.referenceNumber || '', csvNumber(r.amount), t(STATE_TAG[rowState(r)][2])].map((v, i) => (i === 4 ? v : csvCell(v))).join(',')));
  downloadCsv(`Partner_${String(partner.name || 'partner').replace(/[^A-Za-z0-9]+/g, '_')}_open.csv`, lines);
}

function exportStatement(st, partner) {
  const lines = [['Date', 'Payout no.', 'Mode', 'Reference', 'Gross', 'Owed back recovered', 'TDS %', 'TDS', 'Net'].map(csvCell).join(',')];
  (st.lines || []).forEach(l => lines.push([csvCell(longDate(l.paidAt)), csvCell(l.payoutNumber || ''), csvCell(l.mode || ''), csvCell(l.reference || ''), csvNumber(l.gross), csvNumber(l.deficitRecovered), csvNumber(l.tdsRate), csvNumber(l.tdsAmount), csvNumber(l.net)].join(',')));
  lines.push([csvCell('Total'), '', '', '', csvNumber(st.gross), '', '', csvNumber(st.tdsAmount), csvNumber(st.net)].join(','));
  downloadCsv(`TDS_${String(st.payeeName || partner.name || 'partner').replace(/[^A-Za-z0-9]+/g, '_')}_${st.financialYear}${st.pan ? `_${st.pan}` : ''}.csv`, lines);
}
