import React from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import { AuthContext } from '../../auth/AuthContext';
import useOffline from '../../hooks/useOffline';
import { useBillingSettings } from '../../api/billing/billingSettingsApi';
import { t, useLang } from '../../i18n';
import { Button, Chip, Icon, Tag } from '../../components/saral/Saral';
import { C, FONT, inr } from '../../components/saral/tokens';
import { useToast, useViewport } from '../../components/saral/hooks';
import { csvCell, csvNumber, downloadCsv } from '../../utils/csv';
import { apiError, fieldStyle } from '../../components/saral/formUtil';
import PartnerSheet from './PartnerSheet';
import PartnerFormSheet from './PartnerFormSheet';
import { LinksSheet, UploadSheet } from './BulkSheets';
import { longDate, setPayWhenBilled } from './ptUtil';

/**
 * Partners and payouts (Saral). Who is owed what - worked out on the server
 * (GET /referrers/outstanding) - and, per partner, paying out with TDS, what is owed
 * back, this year's payments, the portal link and the partner's record.
 * The Referrals page (reports, patient list, volume matrix) and the Billing
 * "Partner share" tab stay as they are; this screen uses the same server calls.
 */
const SHOWS = ['open', 'payable', 'awaiting', 'deficit', 'all'];
const PAGE = 30;

const FINANCE = ['admindoctor', 'admin', 'adminoperator', 'accountant'];
const ADMIN = ['admindoctor', 'admin', 'adminoperator'];

export default function PartnersPage() {
  useLang();
  const { activeCenter, currentUser } = React.useContext(AuthContext);
  const { isOnline } = useOffline();
  const vp = useViewport();
  const toast = useToast();
  const settings = useBillingSettings(activeCenter?.id);
  const navigate = useNavigate();

  const roles = (currentUser?.roles || []).map(r => String(r).replace(/\s+/g, '').toLowerCase());
  const isAdmin = roles.some(r => ADMIN.includes(r));
  const isFinance = roles.some(r => FINANCE.includes(r));
  const payer = currentUser?.fullName || currentUser?.name || '';
  const centre = { name: activeCenter?.name || activeCenter?.hospitalName || '', address: activeCenter?.address || '' };

  const [show, setShow] = React.useState('open');
  const [search, setSearch] = React.useState('');
  const [q, setQ] = React.useState('');
  const [data, setData] = React.useState(null); // { items, total, totals, page }
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');
  const [roster, setRoster] = React.useState([]);
  const [linkStatus, setLinkStatus] = React.useState({});
  const [sel, setSel] = React.useState(null);
  const [startPay, setStartPay] = React.useState(false);
  const [sheet, setSheet] = React.useState(null); // add | upload | links
  const [ver, setVer] = React.useState(0);
  const seq = React.useRef(0);

  React.useEffect(() => { const h = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(h); }, [search]);

  // First page whenever the filter, search or data change.
  React.useEffect(() => {
    const my = ++seq.current;
    apiClient.get('/referrers/outstanding', { params: { search: q || undefined, show, page: 1, pageSize: PAGE }, suppressErrorToast: true })
      .then(r => { if (my === seq.current) { setPayWhenBilled(r.data?.payWhenBilled); setData(r.data || null); setErr(''); setLoading(false); } })
      .catch(e => { if (my === seq.current) { setErr(apiError(e) || t('pt.loadFailed')); setLoading(false); } });
  }, [q, show, ver]);

  React.useEffect(() => {
    let alive = true;
    apiClient.get('/referrers', { suppressErrorToast: true })
      .then(r => { if (alive) setRoster(Array.isArray(r.data) ? r.data : r.data?.items || []); }).catch(() => {});
    if (isAdmin) {
      apiClient.get('/referrers/link-status', { suppressErrorToast: true }).then(r => {
        if (!alive) return;
        const list = Array.isArray(r.data) ? r.data : r.data?.items || [];
        setLinkStatus(Object.fromEntries(list.map(x => [x.referrerId, x])));
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [ver, isAdmin]);

  const more = async () => {
    if (!data) return;
    const next = (data.page || 1) + 1;
    try {
      const r = await apiClient.get('/referrers/outstanding', { params: { search: q || undefined, show, page: next, pageSize: PAGE }, suppressErrorToast: true });
      setData(d => ({ ...r.data, items: [...(d?.items || []), ...(r.data?.items || [])] }));
    } catch (e) { toast.show(apiError(e) || t('pt.loadFailed'), 'error'); }
  };

  const reload = () => setVer(v => v + 1);

  const exportList = async () => {
    try {
      const all = [];
      for (let page = 1; page < 50; page++) {
        const r = await apiClient.get('/referrers/outstanding', { params: { show: 'all', page, pageSize: 200 }, suppressErrorToast: true });
        all.push(...(r.data?.items || []));
        if (all.length >= (r.data?.total || 0) || !(r.data?.items || []).length) break;
      }
      const byId = Object.fromEntries(roster.map(p => [p.referrerId, p]));
      const lines = [['Partner', 'Type', 'For doctor', 'Speciality', 'Degree', 'Email', 'Mobile', 'Address', 'Ready to pay', 'Waiting for patient', 'Owes back', `Paid ${data?.financialYear || ''}`, 'Last paid'].map(csvCell).join(',')];
      all.forEach(p => {
        const r = byId[p.referrerId] || {};
        lines.push([csvCell(p.name), csvCell(p.isDoctor ? 'Doctor' : 'Other person'), csvCell(p.supportedByDoctor || ''), csvCell(r.specialty || ''), csvCell(r.degree || ''), csvCell(r.email || ''),
          csvCell(p.contact || ''), csvCell(r.address || ''), csvNumber(p.payableNow), csvNumber(p.awaitingPatient), csvNumber(p.deficit), csvNumber(p.paidThisYear), csvCell(p.lastPaidAt ? longDate(p.lastPaidAt) : '')].join(','));
      });
      downloadCsv(`Partners_${new Date().toISOString().slice(0, 10)}.csv`, lines);
    } catch (e) { toast.show(apiError(e) || t('pt.loadFailed'), 'error'); }
  };

  const totals = data?.totals || { payableNow: 0, awaitingPatient: 0, deficit: 0, partnersToPay: 0 };
  const whenBilled = data?.payWhenBilled !== false;
  const items = data?.items || [];

  const header = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: '1 1 260px' }}>
        <div style={{ fontSize: vp.phone ? 26 : 30, fontWeight: 800 }}>{t('pt.title')}</div>
        <div style={{ fontSize: 16, color: C.muted }}>{t('pt.sub')}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: vp.phone ? '100%' : undefined }}>
        {isAdmin && <Button icon="plus" onClick={() => setSheet('add')} style={vp.phone ? { flex: 1 } : undefined}>{t('pt.add')}</Button>}
        {isAdmin && <Button kind="outline" icon="whatsapp" onClick={() => setSheet('links')} style={vp.phone ? { flex: 1 } : undefined}>{t('pt.links')}</Button>}
      </div>
    </div>
  );

  const tile = (label, value, sub, tone, onClick) => {
    const tones = { ok: [C.okSoft, C.ok], due: [C.dueSoft, C.dueInk], danger: [C.dangerSoft, C.danger] };
    const [bg, fg] = tones[tone];
    return (
      <button type="button" onClick={onClick} style={{ textAlign: 'left', background: bg, color: fg, border: 'none', borderRadius: 18, padding: vp.phone ? '10px 14px' : '14px 16px', fontFamily: 'inherit', cursor: 'pointer',
        display: vp.phone ? 'flex' : 'block', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{label}</div>
          <div style={{ fontSize: vp.phone ? 14 : 15 }}>{sub}</div>
        </div>
        <div style={{ fontSize: vp.phone ? 24 : 28, fontWeight: 800 }}>{value}</div>
      </button>
    );
  };

  const card = (p) => (
    <div key={p.referrerId} style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 14, display: 'grid', gap: 10 }}>
      <button type="button" onClick={() => { setStartPay(false); setSel(p); }} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 19, fontWeight: 800 }}>{p.name}</span>
          {p.isDoctor ? <Tag bg={C.primarySoft} fg={C.primary} style={{ fontSize: 13, padding: '3px 10px' }}>{t('ps.doctor')}</Tag>
            : <Tag bg="#F3F4F6" fg="#374151" style={{ fontSize: 13, padding: '3px 10px' }}>{p.supportedByDoctor ? t('ps.agentFor', { name: p.supportedByDoctor }) : t('ps.agent')}</Tag>}
        </div>
        <div style={{ fontSize: 15, color: C.muted }}>{[p.specialty, p.contact, p.lastPaidAt ? t('pt.lastPaid', { date: longDate(p.lastPaidAt) }) : t('pt.neverPaid')].filter(Boolean).join(' · ')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {p.payableNow > 0 && <Tag bg={C.okSoft} fg={C.ok}>{t('pt.ready', { amount: inr(p.payableNow) })}</Tag>}
          {p.awaitingPatient > 0 && <Tag bg={C.dueSoft} fg={C.dueInk}>{t(whenBilled ? 'pt.noBill' : 'pt.waiting', { amount: inr(p.awaitingPatient) })}</Tag>}
          {p.patientOwes > 0 && <Tag bg="#FFF7ED" fg={C.dueInk}>{t('pt.patientOwes', { amount: inr(p.patientOwes) })}</Tag>}
          {p.deficit > 0 && <Tag bg={C.dangerSoft} fg={C.danger}>{t('pt.owes', { amount: inr(p.deficit) })}</Tag>}
          {p.payableNow <= 0 && p.awaitingPatient <= 0 && p.deficit <= 0 && <Tag bg="#F3F4F6" fg="#374151">{t('pt.settled')}</Tag>}
        </div>
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: isFinance && p.payableNow > 0 ? '1fr 1fr' : '1fr', gap: 8 }}>
        {isFinance && p.payableNow > 0 && <Button kind="money" icon="rupee" onClick={() => { setStartPay(true); setSel(p); }}>{t('ps.pay', { amount: inr(p.payableNow) })}</Button>}
        <Button kind="outline" onClick={() => { setStartPay(false); setSel(p); }}>{t('act.view')}</Button>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: FONT, background: C.ground, color: C.ink, minHeight: '100%', padding: vp.phone ? '14px 14px 120px' : '20px 24px 40px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {header}
        {!isOnline && <div role="status" style={{ background: C.dueSoft, color: C.dueInk, borderRadius: 14, padding: '10px 14px', fontSize: 16, fontWeight: 700 }}>{t('fd.offline')}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: vp.phone ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
          {tile(t('pt.tReady'), inr(totals.payableNow), whenBilled
            ? t('pt.tReadySubBilled', { n: totals.partnersToPay, amount: inr(totals.patientOwes || 0) })
            : t('pt.tReadySub', { n: totals.partnersToPay }), 'ok', () => setShow('payable'))}
          {tile(t(whenBilled ? 'pt.tNoBill' : 'pt.tWaiting'), inr(totals.awaitingPatient), t(whenBilled ? 'pt.tNoBillSub' : 'pt.tWaitingSub'), 'due', () => setShow('awaiting'))}
          {tile(t('pt.tOwed'), inr(totals.deficit), t('pt.tOwedSub'), 'danger', () => setShow('deficit'))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <span style={{ position: 'absolute', left: 14, top: 14, color: C.faint }}><Icon name="search" size={20} /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('pt.search')} aria-label={t('pt.search')} style={{ ...fieldStyle, paddingLeft: 44 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {SHOWS.map(s => <Chip key={s} on={show === s} onClick={() => setShow(s)}>{t(s === 'awaiting' && whenBilled ? 'pt.tNoBill' : `pt.show.${s}`)}</Chip>)}
        </div>

        {err && <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: '12px 14px', fontSize: 16, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{err}</span><Button kind="outline" onClick={reload}>{t('pt.retry')}</Button></div>}
        {loading && !data && <div style={{ fontSize: 17, color: C.muted, padding: 24, textAlign: 'center' }}>{t('ps.loading')}</div>}
        {data && !items.length && <div style={{ fontSize: 17, color: C.muted, padding: 24, textAlign: 'center', background: 'white', borderRadius: 18, border: `1px dashed ${C.lineStrong}` }}>{t(show === 'all' ? 'pt.emptyAll' : 'pt.empty')}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: vp.phone ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {items.map(card)}
        </div>
        {data && items.length < (data.total || 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15, color: C.muted }}>{t('fd.of', { shown: items.length, total: data.total })}</span>
            <Button kind="outline" onClick={more}>{t('fd.showMore')}</Button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: vp.phone ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 8 }}>
          <Button kind="outline" onClick={exportList}>{t('pt.download')}</Button>
          {isAdmin && <Button kind="outline" onClick={() => setSheet('upload')}>{t('pt.upload')}</Button>}
          {isAdmin && <Button kind="outline" icon="report" onClick={() => navigate('/referrals')}>{t('pt.reports')}</Button>}
        </div>
      </div>

      {sel && (
        <PartnerSheet key={sel.referrerId} partner={sel} roster={roster} linkStatus={linkStatus} isAdmin={isAdmin} isFinance={isFinance} settings={settings}
          payer={payer} centre={centre} startPay={startPay} toast={(m) => toast.show(m)}
          onClose={() => setSel(null)} onChanged={reload} />
      )}
      {sheet === 'add' && <PartnerFormSheet onClose={() => setSheet(null)} onSaved={() => { setSheet(null); setShow('all'); reload(); toast.show(t('pf.saved')); }} />}
      {sheet === 'upload' && <UploadSheet onClose={() => setSheet(null)} onDone={reload} />}
      {sheet === 'links' && <LinksSheet roster={roster} linkStatus={linkStatus} onClose={() => { setSheet(null); reload(); }} />}
      {toast.node}
    </div>
  );
}
