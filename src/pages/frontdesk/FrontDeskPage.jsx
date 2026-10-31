import React from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import { AuthContext } from '../../auth/AuthContext';
import useOffline from '../../hooks/useOffline';
import useLiveAppointments from '../../hooks/useLiveAppointments';
import { useIstToday, shiftYmd } from '../../utils/istClock';
import { visitStage, STAGE_COLORS, stageLabel } from '../../utils/visitStage';
import { formatPatientAge } from '../../utils/patientAge';
import { formatToken } from '../../utils/tokenFormat';
import { printThermalToken } from '../../utils/thermalPrint';
import { ghostPrint, printA4Invoice, printReceiptSlip, printThermalSlip } from '../../utils/billing/printHandlers';
import { getServiceLines } from '../../utils/appointmentServices';
import { useOverdue } from '../../components/OverdueAppointments/OverdueContext';
import { getTrackingUrl } from '../../utils/trackingUrl';
import { t, useLang } from '../../i18n';
import { Button, Chip, Icon, Sheet, Tag, UndoBar } from '../../components/saral/Saral';
import { C, FONT, inr } from '../../components/saral/tokens';
import { useHeldAction, useToast, useViewport } from '../../components/saral/hooks';
import BookingSheet from './BookingSheet';
import PaymentSheet from './PaymentSheet';
import EditSheet from './EditSheet';
import ReferrerSheet from './ReferrerSheet';
import CancelApprovalSheet from './CancelApprovalSheet';
import DoctorRequestsSheet from './DoctorRequestsSheet';
import usePrintCtx from './usePrintCtx';
import TokenSheet from './TokenSheet';
import QRCode from 'qrcode';

const ReportPreviewModal = React.lazy(() => import('../../components/ReportPreviewModal'));

/**
 * Front desk — today's patients, one clear next step per patient (UI review, round 2).
 * Every action has a word on it; "Mark arrived" is held for a few seconds with Undo
 * instead of an "Are you sure?" pop-up (the server cannot move a visit back to
 * "booked", so the request is only sent once the Undo time is over).
 * Edit, Change who sent and Cancel use the same server rules as the full
 * appointment list (refund choice, admin approval for paid visits, 409 when the
 * visit changed meanwhile). Also: report preview/print per test, WhatsApp share and
 * tracking link, bill/receipt prints (Billing's own print functions), doctor-portal
 * booking requests, scan-type and doctor filters, several-day history, overdue
 * marks. The full list stays available while this is tested.
 */

const FILTERS = ['all', 'notArrived', 'arrived', 'inScan', 'waitingReport', 'reportReady', 'given', 'cancelled'];
// Same rules as the full list: a cancelled visit can't be edited; a reported or
// given visit can't be cancelled (the server refuses both).
const canEdit = (v) => String(v.status || '').toUpperCase() !== 'CANCELLED';
const canCancel = (v) => !['CANCELLED', 'DELIVERED', 'REPORTED', 'REPORTING'].includes(String(v.status || '').toUpperCase());
const JOURNEY = ['notArrived', 'arrived', 'inScan', 'waitingReport', 'reportReady', 'given'];
const PAGE = 30;
const ymdOf = (v) => String(v.dateTime || '').slice(0, 10);
const dmy = (ymd) => String(ymd || '').split('-').reverse().join('-');
// A test's report can be printed once it is reported (same rule as the full list).
const reportReadyLine = (status) => ['REPORTED', 'DELIVERED'].includes(String(status || '').toUpperCase());

const istTime = (iso) => {
  if (!iso) return '';
  const s = String(iso);
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(hasZone ? s : `${s}Z`);
  // Bare visit times are already India time; zoned/UTC stamps are converted.
  return d.toLocaleTimeString('en-IN', { timeZone: hasZone ? 'Asia/Kolkata' : 'UTC', hour: 'numeric', minute: '2-digit', hour12: true });
};
const sexWord = (g) => {
  const s = String(g || '').trim().toUpperCase();
  return s === 'F' || s === 'FEMALE' ? t('bk.female') : s === 'M' || s === 'MALE' ? t('bk.male') : (g || '');
};
const testsOf = (a) => (Array.isArray(a.services) && a.services.length ? a.services.map(s => s.serviceName) : [a.service]).filter(Boolean);
const tokenOf = (a) => (a.dailyTokenNumber ?? a.tokenNo) != null ? formatToken(a.dailyTokenNumber ?? a.tokenNo) : '';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Bills by visit for a day or range: { total, paid, due }. Null on failure (bills are optional here).
async function fetchDues(from, to) {
  try {
    const res = await apiClient.get('/finance/invoices', { params: { startDate: from, endDate: to || from }, suppressErrorToast: true });
    const list = Array.isArray(res.data) ? res.data : res.data?.items || [];
    const map = {};
    for (const inv of list) {
      if (!inv.appointmentId || String(inv.status || '').toUpperCase() === 'CANCELLED' || inv.deletedAt) continue;
      const m = map[inv.appointmentId] || { total: 0, paid: 0 };
      m.total += Number(inv.totalAmount) || 0; m.paid += Number(inv.paidAmount) || 0;
      map[inv.appointmentId] = m;
    }
    for (const k of Object.keys(map)) map[k].due = Math.max(0, Math.round((map[k].total - map[k].paid) * 100) / 100);
    return map;
  } catch {
    return null;
  }
}

function StageTag({ stage }) {
  const c = STAGE_COLORS[stage] || STAGE_COLORS.notArrived;
  return <Tag bg={c.bg} fg={c.fg}>{stageLabel(stage)}</Tag>;
}

export default function FrontDeskPage() {
  useLang();
  const { activeCenter } = React.useContext(AuthContext);
  const { isOnline } = useOffline();
  const { today } = useIstToday();
  const [pickedDay, setPickedDay] = React.useState(null); // null = follow today
  const day = pickedDay || today;
  const [range, setRange] = React.useState(null); // { from, to } = several days
  const from = range ? range.from : day;
  const to = range ? range.to : day;
  const live = useLiveAppointments(range ? { mode: 'past', startIso: range.from, endIso: range.to } : { mode: 'today', dateIso: day });
  const { rows, loading, refresh, reload, patchRow, mergeRows } = live;
  const { isOverdue, acknowledge } = useOverdue();
  const printCtx = usePrintCtx(activeCenter);
  const vp = useViewport();
  const toast = useToast();
  const held = useHeldAction(6000);
  const [filter, setFilter] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [selId, setSelId] = React.useState(null);
  const [booking, setBooking] = React.useState(false);
  const [paying, setPaying] = React.useState(null);
  const [dues, setDues] = React.useState({}); // appointmentId -> { total, paid, due }
  const [pending, setPending] = React.useState({}); // appointmentId -> stage shown while held
  const [editing, setEditing] = React.useState(null);
  const [changingRef, setChangingRef] = React.useState(null);
  const [cancelApproval, setCancelApproval] = React.useState(null);
  const [showFilters, setShowFilters] = React.useState(false);
  const [modF, setModF] = React.useState('ALL');
  const [docF, setDocF] = React.useState('ALL');
  const [limit, setLimit] = React.useState(PAGE);
  const [reqOpen, setReqOpen] = React.useState(false);
  const [reqCount, setReqCount] = React.useState(0);
  const [bookingRequest, setBookingRequest] = React.useState(null);
  const [preview, setPreview] = React.useState(null); // { app, serviceId, report }
  const [tokenFor, setTokenFor] = React.useState(null); // visit whose token card is open

  // Waiting doctor-portal requests (badge on the button).
  const loadReqCount = React.useCallback(() => apiClient.get('/referrers/booking-requests', { params: { includeDecided: false }, suppressErrorToast: true })
    .then(r => setReqCount(Array.isArray(r?.data) ? r.data.length : 0)).catch(() => {}), []);
  React.useEffect(() => {
    let alive = true;
    apiClient.get('/referrers/booking-requests', { params: { includeDecided: false }, suppressErrorToast: true })
      .then(r => { if (alive) setReqCount(Array.isArray(r?.data) ? r.data.length : 0); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const loadDues = React.useCallback(() => fetchDues(from, to).then(m => { if (m) setDues(m); }), [from, to]);
  React.useEffect(() => {
    let alive = true;
    const run = () => fetchDues(from, to).then(m => { if (alive && m) setDues(m); });
    run();
    const id = setInterval(run, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [from, to]);

  const visits = React.useMemo(() => rows
    .filter(a => { const d = ymdOf(a); return d >= from && d <= to; })
    .map(a => ({ ...a, stage: pending[a.appointmentId] || visitStage(a.status, a.arrivedAt) }))
    .sort((a, b) => {
      const pa = a.priority === 'STAT' ? 0 : a.priority === 'URGENT' ? 1 : 2;
      const pb = b.priority === 'STAT' ? 0 : b.priority === 'URGENT' ? 1 : 2;
      // Several days: newest day first; within a day, urgent first then by time.
      return (range ? ymdOf(b).localeCompare(ymdOf(a)) : 0) || pa - pb || String(a.dateTime).localeCompare(String(b.dateTime));
    }), [rows, from, to, range, pending]);

  const counts = React.useMemo(() => {
    const c = { all: 0 };
    for (const v of visits) { c[v.stage] = (c[v.stage] || 0) + 1; if (v.stage !== 'cancelled') c.all += 1; }
    return c;
  }, [visits]);
  const dueTotal = visits.reduce((s, v) => s + (v.stage === 'cancelled' ? 0 : (dues[v.appointmentId]?.due || 0)), 0);

  const shown = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return visits.filter(v => ((filter === 'all' && v.stage !== 'cancelled') || v.stage === filter)
      && (modF === 'ALL' || getServiceLines(v).some(l => String(l.modality || '').toUpperCase() === modF) || String(v.modality || '').toUpperCase() === modF)
      && (docF === 'ALL' || (v.doctor || '') === docF) && (!s
      || String(v.patientName || '').toLowerCase().includes(s)
      || String(v.mobile || '').includes(s)
      || String(v.dailyTokenNumber ?? '') === s.replace(/^0+/, '')
      || String(v.patientIdentifier || '').toLowerCase().includes(s)));
  }, [visits, filter, q, modF, docF]);
  const modalities = React.useMemo(() => [...new Set(visits.flatMap(v => getServiceLines(v).map(l => String(l.modality || '').toUpperCase())).filter(Boolean))].sort(), [visits]);
  const doctorNames = React.useMemo(() => [...new Set(visits.map(v => v.doctor).filter(Boolean))].sort(), [visits]);
  const filtersOn = modF !== 'ALL' || docF !== 'ALL';
  const split = !vp.phone;
  // Tablet/desktop show the first patient's details until one is picked.
  const sel = visits.find(v => v.appointmentId === selId) || (split ? shown[0] : null) || null;
  const [links, setLinks] = React.useState({}); // appointmentId -> signed tracking link
  const selIdNow = sel?.appointmentId;
  const tokenId = tokenFor?.appointmentId;
  React.useEffect(() => {
    if (!/^https?:/.test(window.location.origin)) return undefined;
    let alive = true;
    for (const id of [selIdNow, tokenId].filter(Boolean)) {
      getTrackingUrl(id).then(l => { if (alive && l) setLinks(m => (m[id] === l ? m : { ...m, [id]: l })); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [selIdNow, tokenId]);

  // ── Actions ──
  const sendStatus = React.useCallback(async (v, status) => {
    if (!isOnline) { toast.show(t('fd.offline'), 'error'); return false; }
    try {
      const res = await apiClient.patch(`/appointments/${v.appointmentId}/status`, `"${status}"`, { headers: { 'Content-Type': 'application/json' }, suppressErrorToast: true });
      if (res?.data?.notAllowed) {
        reload();
        if (res.data.requiresApproval && status === 'cancelled') setCancelApproval(v);
        else toast.show(res.data.message || t('fd.failed'), 'error');
        return false;
      }
      const tok = res?.data?.dailyTokenNumber;
      patchRow(v.appointmentId, a => ({ ...a, status: status.toUpperCase(), ...(status === 'confirmed' ? { arrivedAt: a.arrivedAt || new Date().toISOString() } : {}), ...(tok != null ? { dailyTokenNumber: tok } : {}) }));
      refresh();
      if (status === 'confirmed') {
        setTimeout(loadDues, 1500); // auto-billing makes the bill on arrival
        setTokenFor({ ...v, status: 'CONFIRMED', ...(tok != null ? { dailyTokenNumber: tok } : {}) }); // show the token straight away
      }
      if (status === 'cancelled') { toast.show(t('cx.done')); loadDues(); }
      return true;
    } catch (e) {
      toast.show(e?.response?.data?.message || e?.response?.data?.error || t('fd.failed'), 'error');
      reload();
      return false;
    }
  }, [isOnline, patchRow, refresh, reload, loadDues, toast]);

  const holdStatus = (v, status, stage, text) => {
    if (!isOnline) { toast.show(t('fd.offline'), 'error'); return; }
    setPending(p => ({ ...p, [v.appointmentId]: stage }));
    const clear = () => setPending(p => { const n = { ...p }; delete n[v.appointmentId]; return n; });
    held.hold(text, () => { sendStatus(v, status).finally(clear); }, clear);
  };
  const markArrived = (v) => holdStatus(v, 'confirmed', 'arrived', t('fd.arrivedToast', { name: v.patientName }));
  const giveReport = (v) => holdStatus(v, 'delivered', 'given', t('fd.givenToast', { name: v.patientName }));
  const cancelVisit = (v) => holdStatus(v, 'cancelled', 'cancelled', t('cx.held', { name: v.patientName }));
  const afterEdit = (dto) => { if (dto) mergeRows([dto]); refresh(); loadDues(); };

  const printToken = async (v) => {
    const clinic = { name: activeCenter?.name || activeCenter?.hospitalName || '', address: activeCenter?.address || '' };
    let qr = null;
    try { if (/^https?:/.test(window.location.origin)) qr = await getTrackingUrl(v.appointmentId); } catch { /* no QR */ }
    const age = formatPatientAge(v.patientAge, '');
    const data = {
      clinic, token: tokenOf(v) || '-', patientName: v.patientName || '', patientId: v.patientIdentifier || '',
      ageSex: [age, sexWord(v.patientGender)].filter(Boolean).join(' · '),
      referredBy: v.referredBy && v.referredBy.toLowerCase() !== 'self' ? v.referredBy : '',
      datetime: istTime(v.dateTime), service: testsOf(v).join(', '), modality: v.modality || '', qr,
      footer: ['PLEASE KEEP THIS TOKEN', 'THANK YOU'],
    };
    let r = null;
    try { r = await printThermalToken(data); } catch { r = null; }
    if (r?.ok) return;
    if (r && !r.unconfigured) toast.show(t('fd.printFailed'), 'error');
    let qrImg = '';
    try { if (qr) qrImg = await QRCode.toDataURL(qr, { margin: 0, width: 160 }); } catch { /* slip without QR */ }
    ghostPrint(`<!doctype html><html><head><meta charset="utf-8"><title>Token</title><style>
      @page{size:80mm auto;margin:4mm}body{font-family:system-ui,sans-serif;width:72mm;margin:0;color:#000;text-align:center}
      h1{font-size:16px;margin:0}.a{font-size:11px}.tk{font-size:44px;font-weight:800;margin:6px 0}.l{font-size:13px;text-align:left;margin:2px 0}hr{border:0;border-top:1px dashed #000}
      </style></head><body><h1>${esc(clinic.name)}</h1><div class="a">${esc(clinic.address)}</div><hr>
      <div class="a">TOKEN</div><div class="tk">${esc(data.token)}</div><hr>
      <p class="l"><b>${esc(data.patientName)}</b></p><p class="l">${esc(data.ageSex)} ${data.patientId ? '· ' + esc(data.patientId) : ''}</p>
      <p class="l">${esc(data.service)}</p>${data.referredBy ? `<p class="l">Ref: ${esc(data.referredBy)}</p>` : ''}<p class="l">${esc(String(v.dateTime || day).slice(0, 10).split('-').reverse().join('-'))} ${esc(data.datetime)}</p>
      ${qrImg ? `<hr><img src="${qrImg}" style="width:28mm;height:28mm" alt=""><div class="a">Scan to see report status</div>` : ''}
      <hr><div class="a">${data.footer.join('<br>')}</div></body></html>`);
  };

  // ── Reports, sharing and prints ──
  // Report preview for one test (same call and modal as the full list).
  const openReport = async (v, serviceId) => {
    if (vp.phone) setSelId(null); // the preview opens full screen
    const url = serviceId ? `/Reporting/report/${v.appointmentId}?serviceId=${encodeURIComponent(serviceId)}` : `/Reporting/report/${v.appointmentId}`;
    let report = { mode: 'Narrative Editor', text: '', impression: '', isFinalized: false };
    try {
      const res = await apiClient.get(url, { suppressErrorToast: true });
      const r = res?.data?.success ? res.data.data : null;
      if (r) report = { mode: r.mode || 'Narrative Editor', text: r.findings || '', data: r.structuredData, impression: r.impression, advice: r.advice,
        isFinalized: r.isFinalized || ['reported', 'completed', 'delivered'].includes(String(v.status || '').toLowerCase()) };
    } catch { /* the modal shows an empty report */ }
    setPreview({ app: v, serviceId: serviceId || null, report });
  };
  const trackingLink = async (v) => {
    try { return (await getTrackingUrl(v.appointmentId)) || `${window.location.origin}/track/${v.appointmentId}`; } catch { return `${window.location.origin}/track/${v.appointmentId}`; }
  };
  const shareWhatsApp = (v) => {
    // The signed link is fetched when the patient is picked (below), so the click
    // opens WhatsApp straight away (phones block windows opened after a wait).
    const link = links[v.appointmentId] || `${window.location.origin}/track/${v.appointmentId}`;
    const arrived = !['notArrived', 'cancelled'].includes(v.stage || visitStage(v.status, v.arrivedAt)) && tokenOf(v);
    const msg = t(arrived ? 'wa.checkin' : 'wa.msg', {
      clinic: activeCenter?.name || activeCenter?.hospitalName || '', name: v.patientName || '', token: tokenOf(v) || t('wa.onArrival'),
      pid: v.patientIdentifier || '-', date: dmy(ymdOf(v)), tests: testsOf(v).join(', '), link,
    });
    const phone = String(v.mobile || '').replace(/\D/g, '');
    const url = phone.length >= 10 ? `https://wa.me/91${phone.slice(-10)}?text=${encodeURIComponent(msg)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };
  const copyLink = async (v) => {
    const link = await trackingLink(v);
    try { await navigator.clipboard.writeText(link); toast.show(t('fd.linkCopied')); } catch { toast.show(link); }
  };
  // Bill / receipt / small slip: Billing's own print functions with the centre's tax details.
  const printBill = async (v, kind) => {
    try {
      const res = await apiClient.get('/finance/invoices', { params: { appointmentId: v.appointmentId }, suppressErrorToast: true });
      const list = (Array.isArray(res.data) ? res.data : res.data?.items || []).filter(i => String(i.status || '').toUpperCase() !== 'CANCELLED' && !i.deletedAt);
      const inv = list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      if (!inv) { toast.show(t('fd.noBillPrint'), 'error'); return; }
      const ctx = { ...printCtx, notify: (type, title, msg) => toast.show(msg || title, type === 'error' ? 'error' : 'ok') };
      if (kind === 'A4') await printA4Invoice(inv, ctx);
      else if (kind === 'RECEIPT') await printReceiptSlip(inv, ctx);
      else await printThermalSlip(inv, ctx);
    } catch {
      toast.show(t('fd.failed'), 'error');
    }
  };

  // Main action for a visit: one button, the word says what happens.
  const primaryFor = (v) => {
    const due = dues[v.appointmentId]?.due || 0;
    if (v.stage === 'cancelled') return null;
    if (v.stage === 'notArrived') return ymdOf(v) === today ? { kind: 'primary', icon: 'check', text: t('fd.markArrived'), run: () => markArrived(v) } : null;
    if (v.stage === 'reportReady') return { kind: 'ok', icon: 'report', text: t('fd.giveReport'), run: () => giveReport(v) };
    if (due > 0) return { kind: 'money', icon: 'rupee', text: t('fd.collect', { amount: inr(due) }), run: () => setPaying(v) };
    return null;
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: vp.phone ? '100%' : 0 }}>
        <h1 style={{ margin: 0, fontSize: vp.phone ? 24 : 28, fontWeight: 800, color: C.ink }}>{t('fd.title')}</h1>
        <div style={{ fontSize: 16, color: C.muted, marginTop: 2 }}>
          {range ? `${dmy(range.from)} – ${dmy(range.to)}` : new Date(`${day}T12:00:00Z`).toLocaleDateString(`${document.documentElement.lang || 'en'}-IN`, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
        </div>
      </div>
      {!vp.phone && <Link to="/appointment-board" style={{ fontSize: 16, fontWeight: 700, color: C.primary, minHeight: 48, display: 'inline-flex', alignItems: 'center', padding: '0 8px' }}>{t('fd.fullBoard')}</Link>}
      {/* On phones the two buttons get their own row under the title. */}
      <div style={{ display: 'flex', gap: 10, ...(vp.phone ? { flexBasis: '100%' } : {}) }}>
        <Button kind="outline" size={vp.phone ? 'md' : 'lg'} onClick={() => setReqOpen(true)} style={vp.phone ? { flex: 1, padding: '0 10px' } : undefined}>
          {t('fd.requests')}{reqCount > 0 && <span style={{ minWidth: 26, height: 26, borderRadius: 99, background: C.due, color: 'white', fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{reqCount}</span>}
        </Button>
        <Button kind="primary" size={vp.phone ? 'md' : 'lg'} icon="plus" onClick={() => { setBookingRequest(null); setBooking(true); }} style={vp.phone ? { flex: 1, padding: '0 10px' } : undefined}>{t('bk.title')}</Button>
      </div>
    </div>
  );

  const summary = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
      {[
        { n: counts.all || 0, l: t('fd.patients'), c: C.ink, on: filter === 'all', go: 'all' },
        { n: counts.notArrived || 0, l: t('fd.notArrived'), c: STAGE_COLORS.notArrived.fg, on: filter === 'notArrived', go: 'notArrived' },
        { n: inr(dueTotal), l: t('fd.toCollect'), c: dueTotal > 0 ? C.due : C.ok },
      ].map((k) => {
        const inner = (<>
          <span style={{ fontSize: vp.phone ? 24 : 30, fontWeight: 800, color: k.c, lineHeight: 1.1 }}>{k.n}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.muted }}>{k.l}</span>
        </>);
        const st = { background: 'white', border: `1.5px solid ${k.on ? C.primary : C.line}`, borderRadius: 16, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', fontFamily: 'inherit', minHeight: 72 };
        return k.go
          ? <button key={k.l} type="button" onClick={() => setFilter(k.go)} aria-pressed={k.on} style={{ ...st, cursor: 'pointer' }}>{inner}</button>
          : <div key={k.l} style={st}>{inner}</div>;
      })}
    </div>
  );

  const pickDay = (d) => { setRange(null); setPickedDay(d === today ? null : d); setSelId(null); setFilter('all'); setLimit(PAGE); };
  const dateInput = { minHeight: 44, borderRadius: 999, padding: '0 14px', fontSize: 16, fontFamily: 'inherit', background: 'white', color: C.ink };
  const dayChips = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {[[shiftYmd(today, -1), t('day.yesterday')], [today, t('day.today')], [shiftYmd(today, 1), t('day.tomorrow')]].map(([d, l]) => (
        <Chip key={d} on={!range && day === d} onClick={() => pickDay(d)}>{l}</Chip>
      ))}
      {!range && <input type="date" value={day} aria-label={t('day.other')} onChange={e => { if (e.target.value) pickDay(e.target.value); }}
        style={{ ...dateInput, border: `1.5px solid ${![shiftYmd(today, -1), today, shiftYmd(today, 1)].includes(day) ? C.ink : C.lineStrong}` }} />}
      <Chip on={!!range} onClick={() => { if (!range) { setRange({ from: shiftYmd(today, -6), to: today }); setSelId(null); setFilter('all'); setLimit(PAGE); } }}>{t('day.range')}</Chip>
      {range && (<>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700 }}>{t('day.from')}
          <input type="date" value={range.from} max={range.to} onChange={e => e.target.value && setRange(r => ({ ...r, from: e.target.value }))} style={{ ...dateInput, border: `1.5px solid ${C.ink}` }} /></label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700 }}>{t('day.to')}
          <input type="date" value={range.to} min={range.from} onChange={e => e.target.value && setRange(r => ({ ...r, to: e.target.value }))} style={{ ...dateInput, border: `1.5px solid ${C.ink}` }} /></label>
      </>)}
    </div>
  );

  const tools = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {dayChips}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 14, top: 14, color: C.muted }}><Icon name="search" size={20} /></span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('fd.search')} aria-label={t('fd.search')} type="search"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 50, borderRadius: 14, border: `1.5px solid ${C.lineStrong}`, padding: '0 14px 0 44px', fontSize: 17, fontFamily: 'inherit', background: 'white', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
        {FILTERS.map(f => (
          <Chip key={f} on={filter === f} onClick={() => setFilter(f)} style={{ flexShrink: 0 }}>
            {f === 'all' ? t('fd.all') : stageLabel(f)} {counts[f] ? `· ${counts[f]}` : ''}
          </Chip>
        ))}
        <Chip on={showFilters || filtersOn} onClick={() => setShowFilters(x => !x)} style={{ flexShrink: 0 }}>
          <Icon name="filter" size={18} />{t('fd.filters')}{filtersOn ? ' ·' : ''}
        </Chip>
      </div>
      {(showFilters || filtersOn) && (
        <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700, minWidth: 90 }}>{t('fd.modality')}</span>
            <Chip on={modF === 'ALL'} onClick={() => setModF('ALL')}>{t('fd.all')}</Chip>
            {modalities.map(m => <Chip key={m} on={modF === m} onClick={() => setModF(m)}>{m}</Chip>)}
          </div>
          {doctorNames.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700, minWidth: 90 }}>{t('fd.doctorF')}</span>
              <Chip on={docF === 'ALL'} onClick={() => setDocF('ALL')}>{t('fd.all')}</Chip>
              {doctorNames.map(d => <Chip key={d} on={docF === d} onClick={() => setDocF(d)}>{d}</Chip>)}
            </div>
          )}
          {filtersOn && <Button kind="ghost" onClick={() => { setModF('ALL'); setDocF('ALL'); }} style={{ alignSelf: 'flex-start' }}>{t('fd.clear')}</Button>}
        </div>
      )}
    </div>
  );

  const card = (v) => {
    const p = primaryFor(v);
    const due = dues[v.appointmentId]?.due || 0;
    const on = split && sel?.appointmentId === v.appointmentId;
    const tok = tokenOf(v);
    return (
      <div key={v.appointmentId} style={{ background: 'white', borderRadius: 18, border: `2px solid ${on ? C.primary : C.line}`, boxShadow: on ? '0 4px 16px rgba(55,48,163,0.12)' : 'none', overflow: 'hidden' }}>
        <button type="button" onClick={() => setSelId(v.appointmentId)} aria-label={`${v.patientName}, ${stageLabel(v.stage)}`}
          style={{ width: '100%', background: 'transparent', border: 'none', padding: '14px 14px 10px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.ink, display: 'flex', gap: 12 }}>
          <span style={{ width: 52, minHeight: 52, borderRadius: 14, background: tok ? C.primarySoft : C.ground, color: tok ? C.primary : C.faint, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{tok ? t('fd.token') : ''}</span>
            <span style={{ fontSize: tok ? 20 : 15, fontWeight: 800 }}>{tok || istTime(v.dateTime)}</span>
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{v.patientName}</span>
              {v.priority === 'STAT' && <Tag bg={C.dangerSoft} fg={C.danger}>{t('fd.emergency')}</Tag>}
              {v.priority === 'URGENT' && <Tag bg={C.dueSoft} fg={C.dueInk}>{t('fd.urgent')}</Tag>}
              {isOverdue(v.appointmentId) && <Tag bg={C.dangerSoft} fg={C.danger}>{t('fd.overdue')}</Tag>}
            </span>
            {range && <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>{dmy(ymdOf(v))} · {istTime(v.dateTime)}</span>}
            <span style={{ fontSize: 15, color: C.muted }}>{[formatPatientAge(v.patientAge, ''), sexWord(v.patientGender), testsOf(v).join(', ')].filter(Boolean).join(' · ')}</span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <StageTag stage={v.stage} />
              {due > 0 ? <Tag bg={C.dueSoft} fg={C.dueInk}>{t('fd.due', { amount: inr(due) })}</Tag>
                : dues[v.appointmentId] ? <Tag bg={C.okSoft} fg={C.ok}>{t('fd.paid')}</Tag> : null}
            </span>
          </span>
        </button>
        {(p || vp.phone) && (
          <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px' }}>
            {p && <Button kind={p.kind} icon={p.icon} onClick={p.run} style={{ flex: 1 }}>{p.text}</Button>}
            {vp.phone && <Button kind="quiet" onClick={() => setSelId(v.appointmentId)} style={p ? {} : { flex: 1 }}>{t('fd.more')}</Button>}
          </div>
        )}
      </div>
    );
  };

  const detail = (v) => {
    const b = dues[v.appointmentId];
    const p = primaryFor(v);
    const at = JOURNEY.indexOf(v.stage);
    const stageNote = { inScan: t('fd.inScanRoom'), waitingReport: t('fd.waitingDoctor'), given: t('fd.allDone') }[v.stage];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{v.patientName}</div>
          <div style={{ fontSize: 16, color: C.muted }}>{[formatPatientAge(v.patientAge, ''), sexWord(v.patientGender), v.patientIdentifier, tokenOf(v) && `${t('fd.token')} ${tokenOf(v)}`].filter(Boolean).join(' · ')}</div>
        </div>
        {isOverdue(v.appointmentId) && (
          <div style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700 }}>
            <span style={{ flex: 1 }}>{t('fd.overdue')}</span>
            <Button kind="quiet" onClick={() => acknowledge(v.appointmentId)}>{t('fd.noted')}</Button>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {v.mobile && <a href={`tel:${v.mobile}`} style={{ minHeight: 48, padding: '0 16px', borderRadius: 14, border: `2px solid ${C.primary}`, color: C.primary, fontWeight: 700, fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}><Icon name="phone" size={20} />{t('fd.call')} {v.mobile}</a>}
          <Button kind="outline" icon="print" onClick={() => printToken(v)}>{t('fd.printToken')}</Button>
          {tokenOf(v) && <Button kind="outline" onClick={() => setTokenFor(v)}>{t('tk.show')}</Button>}
        </div>
        {!tokenOf(v) && v.stage === 'notArrived' && <div style={{ fontSize: 15, color: C.muted }}>{t('tk.notYet')}</div>}

        <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>{t('fd.journey')}</div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {JOURNEY.map((s, i) => {
              const done = i < at, now = i === at;
              return (
                <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 40 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? C.ok : now ? C.primary : 'white', color: 'white', border: done || now ? 'none' : `2px solid ${C.lineStrong}` }}>
                    {done && <Icon name="check" size={16} stroke={3} />}
                    {now && <span style={{ width: 8, height: 8, borderRadius: 9, background: 'white' }} />}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: now ? 800 : 600, color: done || now ? C.ink : C.faint }}>{stageLabel(s)}</span>
                </li>
              );
            })}
          </ol>
          {stageNote && <div style={{ fontSize: 15, color: C.muted, marginTop: 8 }}>{stageNote}</div>}
        </div>

        <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{t('fd.tests')}</div>
          {getServiceLines(v).map((l, i) => (
            <div key={l.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 16 }}>
              <span style={{ flex: '1 1 140px' }}>{l.serviceName}</span>
              <span style={{ fontWeight: 700 }}>{inr(l.amount)}</span>
              {v.stage !== 'cancelled' && (reportReadyLine(l.status)
                ? <Button kind="outline" icon="report" onClick={() => openReport(v, l.id)} style={{ flex: '1 1 100%' }}>{t('fd.printReport')}</Button>
                : <span style={{ flex: '1 1 100%', fontSize: 14, color: C.faint }}>{t('fd.reports')}: {t('fd.reportNotReady')}</span>)}
            </div>
          ))}
          <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>{t('fd.sentBy')}: {v.referredBy && v.referredBy.toLowerCase() !== 'self' ? v.referredBy : t('bk.self')}</div>
        </div>

        <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{t('fd.bill')}</div>
          {b ? (<>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}><span>{t('fd.billTotal')}</span><b>{inr(b.total)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: C.ok }}><span>{t('fd.paidAmt')}</span><b>{inr(b.paid)}</b></div>
            {b.due > 0
              ? <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, color: C.due, fontWeight: 800 }}><span>{t('pay.toCollect')}</span><span>{inr(b.due)}</span></div>
              : <div style={{ fontSize: 17, color: C.ok, fontWeight: 800 }}>{t('pay.fullyPaid')}</div>}
          </>) : <div style={{ fontSize: 15, color: C.muted }}>{t('fd.noBill')}</div>}
          {b?.due > 0 && p?.icon !== 'rupee' && <Button kind="outlineMoney" icon="rupee" onClick={() => setPaying(v)}>{t('fd.collect', { amount: inr(b.due) })}</Button>}
        </div>

        {p && <Button kind={p.kind} size="lg" icon={p.icon} full onClick={p.run}>{p.text}</Button>}
        <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{t('fd.share')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <Button kind="outline" icon="whatsapp" onClick={() => shareWhatsApp(v)}>{t('fd.whatsapp')}</Button>
            <Button kind="outline" onClick={() => copyLink(v)}>{t('fd.copyLink')}</Button>
            {b && <Button kind="quiet" icon="print" onClick={() => printBill(v, 'A4')}>{t('fd.printBill')}</Button>}
            {b && <Button kind="quiet" icon="print" onClick={() => printBill(v, 'RECEIPT')}>{t('fd.printReceipt')}</Button>}
            {b && <Button kind="quiet" icon="print" onClick={() => printBill(v, 'SLIP')}>{t('fd.printSlip')}</Button>}
          </div>
        </div>
        {v.stage === 'notArrived' && ymdOf(v) !== today && <div style={{ fontSize: 15, color: C.muted }}>{t('fd.otherDayNote')}</div>}
        {(canEdit(v) || canCancel(v)) && (
          <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {canEdit(v) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button kind="outline" onClick={() => setEditing(v)} style={{ flex: '1 1 160px' }}>{t('ed.edit')}</Button>
                <Button kind="outline" onClick={() => setChangingRef(v)} style={{ flex: '1 1 160px' }}>{t('rf.change')}</Button>
              </div>
            )}
            {/* Kept apart from Edit on purpose, so it is not pressed by mistake. */}
            {canCancel(v) && (
              <div style={{ borderTop: `1px dashed ${C.lineStrong}`, paddingTop: 12, marginTop: 4 }}>
                <Button kind="outlineDanger" icon="close" onClick={() => cancelVisit(v)} full>{t('cx.cancel')}</Button>
              </div>
            )}
          </div>
        )}
        <Link to="/appointment-board" style={{ fontSize: 16, fontWeight: 700, color: C.primary, textAlign: 'center', padding: 8 }}>{t('fd.fullBoard')}</Link>
      </div>
    );
  };

  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {loading && !visits.length && <div style={{ fontSize: 17, color: C.muted, padding: 24, textAlign: 'center' }}>{t('fd.loading')}</div>}
      {!loading && !shown.length && <div style={{ fontSize: 17, color: C.muted, padding: 24, textAlign: 'center', background: 'white', borderRadius: 18, border: `1px dashed ${C.lineStrong}` }}>{t('fd.empty')}</div>}
      {shown.slice(0, limit).map(card)}
      {shown.length > limit && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 8 }}>
          <span style={{ fontSize: 15, color: C.muted }}>{t('fd.of', { shown: Math.min(limit, shown.length), total: shown.length })}</span>
          <Button kind="outline" onClick={() => setLimit(l => l + PAGE)}>{t('fd.showMore')}</Button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ fontFamily: FONT, background: C.ground, color: C.ink, minHeight: '100%', padding: vp.phone ? '14px 14px 120px' : '20px 24px 40px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {header}
        {!isOnline && <div role="status" style={{ background: C.dueSoft, color: C.dueInk, borderRadius: 14, padding: '10px 14px', fontSize: 16, fontWeight: 700 }}>{t('fd.offline')}</div>}
        {summary}
        {split ? (
          <div style={{ display: 'grid', gridTemplateColumns: vp.desktop ? 'minmax(0, 1.3fr) minmax(380px, 1fr)' : 'minmax(0, 1fr) minmax(340px, 0.9fr)', gap: 16, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{tools}{list}</div>
            <div style={{ position: 'sticky', top: 12, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto', background: C.ground, paddingBottom: 8 }}>
              {sel ? detail(sel) : <div style={{ fontSize: 17, color: C.muted, padding: 24 }}>{t('fd.pick')}</div>}
            </div>
          </div>
        ) : (<>{tools}{list}</>)}
      </div>

      {vp.phone && <Sheet open={!!sel} onClose={() => setSelId(null)} title={sel?.patientName || ''}>{sel && detail(sel)}</Sheet>}
      {booking && <BookingSheet open isOnline={isOnline} request={bookingRequest} onClose={() => { setBooking(false); setBookingRequest(null); }}
        onBooked={(row) => { if (bookingRequest) loadReqCount(); if (row.appointmentId) apiClient.get(`/appointments/${row.appointmentId}`, { suppressErrorToast: true }).then(r => r?.data?.appointmentId && mergeRows([r.data])).catch(() => {}); refresh(); }}
        onCollect={(row) => { setBooking(false); setTimeout(() => setPaying(row), 50); }} />}
      {editing && <EditSheet key={editing.appointmentId} visit={editing} isOnline={isOnline} onClose={() => setEditing(null)} onSaved={afterEdit} />}
      {changingRef && <ReferrerSheet key={changingRef.appointmentId} visit={changingRef} isOnline={isOnline} onClose={() => setChangingRef(null)} onDone={() => afterEdit(null)} />}
      {cancelApproval && <CancelApprovalSheet key={cancelApproval.appointmentId} visit={cancelApproval} onClose={() => setCancelApproval(null)} />}
      {tokenFor && (() => {
        // Follow the live row so the token appears as soon as the server has it.
        const live = visits.find(x => x.appointmentId === tokenFor.appointmentId) || tokenFor;
        const tv = (live.dailyTokenNumber ?? null) != null ? live : tokenFor;
        return <TokenSheet visit={tv} token={tokenOf(tv)} link={links[tv.appointmentId] || ''} tests={testsOf(tv).join(', ')}
          onClose={() => setTokenFor(null)} onPrint={() => printToken(tv)} onWhatsApp={() => shareWhatsApp({ ...tv, stage: 'arrived' })} />;
      })()}
      {reqOpen && <DoctorRequestsSheet onClose={() => setReqOpen(false)} onCount={setReqCount}
        onBook={(r) => { setReqOpen(false); setBookingRequest(r); setBooking(true); }} />}
      {preview && (
        <React.Suspense fallback={null}>
          <ReportPreviewModal isOpen onClose={() => setPreview(null)} doctorId={preview.app.doctorId} appointmentId={preview.app.appointmentId}
            appointmentServiceId={preview.serviceId} patientData={preview.app} reportContent={preview.report} />
        </React.Suspense>
      )}
      {paying && <PaymentSheet key={paying.appointmentId} visit={paying} isOnline={isOnline} onClose={() => setPaying(null)} onPaid={() => loadDues()} />}
      <UndoBar held={held.held} onUndo={held.undo} label={t('fd.undo')} onNow={held.flush} nowLabel={t('fd.doneNow')} bottom={vp.phone ? 96 : 24} />
      {toast.node}
    </div>
  );
}
