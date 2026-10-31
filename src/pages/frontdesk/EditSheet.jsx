import React from 'react';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { buildPatientAge, parsePatientAge } from '../../utils/patientAge';
import { getServiceLines } from '../../utils/appointmentServices';
import { isPatientArrived } from '../../utils/arrival';
import { istTodayYmd, shiftYmd } from '../../utils/istClock';
import { Button, Chip, Icon, Sheet } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { Err, Note, RefundChoice, ReasonBox, PatientMore } from './parts';
import { apiError, fieldStyle, isDoctorRole, labelStyle } from './fdUtil';

/**
 * Edit a visit from the front desk — the same server call and the same safety
 * rules as the full appointment list (PUT /appointments/{id}):
 *  - the latest visit is loaded first so existing tests keep their ids (a test
 *    sent without its id would be removed and re-added, upsetting bill and
 *    commission);
 *  - the visit's version is sent; if someone changed it meanwhile the server
 *    refuses (409) and we say so;
 *  - moving an arrived visit to a later day, or making the bill smaller than what
 *    was paid, asks how to return the money (advance or cash);
 *  - removing a test whose commission is already paid goes to Admin Approval.
 * "Who sent" is changed with its own action (Change who sent), as before.
 */

const PRIO = () => [['ROUTINE', t('bk.routine')], ['URGENT', t('bk.urgent')], ['STAT', t('bk.stat')]];
const keyOf = (s) => `${String(s.modality || '').toUpperCase()}|${String(s.serviceName || '').trim().toLowerCase()}`;
const ddmmyyyy = (ymd) => String(ymd || '').split('-').reverse().join('-');

export default function EditSheet({ visit, onClose, onSaved, isOnline }) {
  const [phase, setPhase] = React.useState('loading'); // loading | form | refund | approval | done | failed
  const [full, setFull] = React.useState(null);
  const [f, setF] = React.useState(null); // form fields
  const [lines, setLines] = React.useState([]);
  const [registry, setRegistry] = React.useState([]);
  const [doctors, setDoctors] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [refund, setRefund] = React.useState({ mode: 'WALLET', amount: 0, why: 'future' });
  const [approval, setApproval] = React.useState({ body: null, reason: '', message: '' });
  const [changes, setChanges] = React.useState([]);
  const [err, setErr] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiClient.get(`/appointments/${visit.appointmentId}`, { suppressErrorToast: true });
        const a = res?.data;
        if (!alive) return;
        if (!a?.appointmentId) { setPhase('failed'); return; }
        const { value, unit } = parsePatientAge(a.patientAge);
        const dt = String(a.dateTime || '');
        setFull(a);
        setF({
          name: a.patientName || '', mobile: a.mobile || '', age: value || '', unit: unit || 'Y', gender: a.patientGender || '',
          doctor: a.doctor || '', priority: (a.priority || 'ROUTINE').toUpperCase(), date: dt.slice(0, 10),
          village: a.village || '', block: a.block || '', district: a.district || '', address: a.address || '', sourceOfInfo: a.sourceOfInfo || '',
          notes: a.notes || '',
        });
        setLines(getServiceLines(a).map(l => ({ id: l.id, serviceName: l.serviceName, modality: l.modality, amount: l.amount, referralCutValue: l.referralCutValue, status: l.status })));
        setPhase(String(a.status || '').toUpperCase() === 'CANCELLED' ? 'cancelled' : 'form');
      } catch {
        if (alive) setPhase('failed');
      }
    })();
    apiClient.get('/finance/registry', { suppressErrorToast: true })
      .then(r => { if (alive) setRegistry((Array.isArray(r.data) ? r.data : r.data?.items || []).filter(x => x.isActive !== false)); }).catch(() => {});
    apiClient.get('/personnel', { suppressErrorToast: true }).then(r => {
      if (!alive) return;
      const all = Array.isArray(r.data) ? r.data : r.data?.items || [];
      let docs = all.filter(p => (p.roles || p.Roles || []).some(isDoctorRole)).map(p => p.fullName || p.FullName).filter(Boolean);
      if (!docs.length) docs = all.map(p => p.fullName || p.FullName).filter(Boolean);
      setDoctors(docs);
    }).catch(() => {});
    return () => { alive = false; };
  }, [visit.appointmentId]);

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const shownTests = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    const have = new Set(lines.map(keyOf));
    return registry.filter(r => !have.has(keyOf(r)) && (!s || String(r.serviceName || '').toLowerCase().includes(s))).slice(0, 30);
  }, [registry, q, lines]);
  const curDoctor = f?.doctor || '';
  const doctorChoices = curDoctor && !doctors.includes(curDoctor) ? [curDoctor, ...doctors] : doctors;
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const buildBody = (refundMode) => {
    const svc = lines.map(l => ({ id: l.id || null, serviceName: l.serviceName, modality: String(l.modality || '').toUpperCase(), amount: Number(l.amount) || 0, referralCutValue: Number(l.referralCutValue) || 0 }));
    const origDt = String(full.dateTime || '');
    const dateTime = f.date === origDt.slice(0, 10) ? origDt : `${f.date}T${origDt.slice(11, 19) || '09:00:00'}`;
    return {
      appointmentId: full.appointmentId,
      patientId: full.patientId,
      refundMode: refundMode || null,
      service: svc[0].serviceName, modality: svc[0].modality, amount: svc[0].amount, referralCutValue: svc[0].referralCutValue,
      services: svc,
      dateTime,
      doctor: f.doctor,
      priority: f.priority,
      notes: f.notes, // the server writes notes as sent
      // Address details: null = unchanged (the server leaves it as it is); a value
      // (even empty) = what the user typed.
      ...Object.fromEntries(['village', 'block', 'district', 'address', 'sourceOfInfo'].map(k => [k, f[k].trim() === (full[k] || '') ? null : f[k].trim()])),
      // "Who sent" is unchanged here (Change who sent has its own action);
      // null fields mean "leave as it is" on the server.
      referredBy: full.referredBy ?? null,
      referrerIsDoctor: null,
      patientName: f.name.trim(),
      mobile: f.mobile.trim(),
      patientAge: buildPatientAge(f.age, f.unit),
      patientGender: f.gender,
      rowVersion: full.rowVersion || null,
    };
  };

  const summarise = () => {
    const out = [];
    const orig = getServiceLines(full);
    const origKeys = new Set(orig.map(keyOf)); const nowKeys = new Set(lines.map(keyOf));
    for (const l of lines) if (!origKeys.has(keyOf(l))) out.push(t('ed.added', { name: l.serviceName }));
    for (const l of orig) if (!nowKeys.has(keyOf(l))) out.push(t('ed.removedT', { name: l.serviceName }));
    for (const l of lines) {
      const o = orig.find(x => keyOf(x) === keyOf(l));
      if (o && (Number(o.amount) || 0) !== (Number(l.amount) || 0)) out.push(t('ed.priceT', { name: l.serviceName, from: inr(o.amount), to: inr(l.amount) }));
    }
    if (f.date !== String(full.dateTime || '').slice(0, 10)) out.push(t('ed.dateT', { date: ddmmyyyy(f.date) }));
    if ((full.doctor || '') !== f.doctor) out.push(t('ed.doctorT', { name: f.doctor }));
    if ((full.patientName || '') !== f.name.trim()) out.push(t('ed.nameT', { name: f.name.trim() }));
    if ((full.mobile || '') !== f.mobile.trim()) out.push(t('ed.mobileT', { mobile: f.mobile.trim() }));
    if ((full.patientAge || '') !== buildPatientAge(f.age, f.unit) || (full.patientGender || '') !== f.gender) out.push(t('ed.ageT'));
    if (['village', 'block', 'district', 'address', 'sourceOfInfo'].some(k => (full[k] || '') !== f[k].trim())) out.push(t('md.more').replace(/\s*\(.*\)$/, ''));
    if ((full.notes || '') !== f.notes) out.push(t('md.notes').replace(/\s*\(.*\)$/, ''));
    if ((full.priority || 'ROUTINE').toUpperCase() !== f.priority) out.push(t('ed.prioT', { p: PRIO().find(p => p[0] === f.priority)?.[1] || f.priority }));
    return out;
  };

  const save = async (refundMode) => {
    if (saving) return;
    setErr('');
    if (isOnline === false) return setErr(t('fd.offline'));
    if (!lines.length) return setErr(t('ed.needTest'));
    if (!f.name.trim()) return setErr(t('bk.needName'));
    if (!String(f.age).trim()) return setErr(t('bk.needAge'));
    if (!f.doctor) return setErr(t('bk.needDoctor'));
    const keys = lines.map(keyOf);
    if (new Set(keys).size !== keys.length) return setErr(t('ed.dupTest'));
    const diff = summarise();
    if (!diff.length) return setErr(t('ed.noChanges'));
    // Moving an arrived visit to a later day returns the money: ask how first.
    const movesLater = f.date !== String(full.dateTime || '').slice(0, 10) && f.date > istTodayYmd();
    if (movesLater && isPatientArrived(full) && refundMode === undefined) {
      setRefund({ mode: 'WALLET', amount: 0, why: 'future' });
      setPhase('refund');
      return;
    }
    const body = buildBody(refundMode);
    setSaving(true);
    try {
      const res = await apiClient.put(`/appointments/${full.appointmentId}`, body, { suppressErrorToast: true });
      const d = res?.data || {};
      if (d.requiresRefundChoice) {
        setRefund({ mode: 'WALLET', amount: Number(d.overpayAmount) || 0, why: 'over' });
        setPhase('refund');
        return;
      }
      if (d.requiresApproval) {
        setApproval({ body, reason: '', message: d.message || '' });
        setRefund(r => ({ ...r, mode: refundMode || 'WALLET' }));
        setPhase('approval');
        return;
      }
      setChanges(diff);
      setPhase('done');
      try {
        const fresh = await apiClient.get(`/appointments/${full.appointmentId}`, { suppressErrorToast: true });
        onSaved?.(fresh?.data?.appointmentId ? fresh.data : null);
      } catch { onSaved?.(null); }
    } catch (e) {
      if (e?.response?.status === 409) setErr(apiError(e) || t('ed.conflict'));
      else setErr(!e?.response ? t('fd.offline') : (apiError(e) || t('fd.failed')));
      if (phase !== 'form') setPhase('form');
    } finally {
      setSaving(false);
    }
  };

  const sendApproval = async () => {
    if (saving || !approval.reason.trim()) return;
    setSaving(true); setErr('');
    try {
      await apiClient.post('/approvals', {
        type: 'EDIT_SERVICES',
        title: `${full.patientName || 'Patient'} — service change after payment`,
        appointmentId: full.appointmentId,
        payload: JSON.stringify({ ...approval.body, refundMode: refund.mode }),
        reason: approval.reason.trim(),
      }, { suppressErrorToast: true });
      window.dispatchEvent(new Event('1rad_approvals_changed'));
      setChanges([t('ed.sent')]);
      setPhase('sent');
    } catch (e) {
      setErr(apiError(e) || t('fd.failed'));
    } finally {
      setSaving(false);
    }
  };

  // ── footer per phase ──
  let footer = <Button kind="quiet" size="lg" full onClick={onClose}>{t('pay.close')}</Button>;
  if (phase === 'form') footer = <Button kind="primary" size="lg" full onClick={() => save(undefined)} disabled={saving || isOnline === false}>{saving ? t('ed.saving') : t('ed.save')}</Button>;
  if (phase === 'refund') footer = (
    <div style={{ display: 'flex', gap: 10 }}>
      <Button kind="quiet" size="lg" icon="back" onClick={() => setPhase('form')}>{t('bk.back')}</Button>
      <div style={{ flex: 1 }}><Button kind="primary" size="lg" full onClick={() => save(refund.mode)} disabled={saving}>{saving ? t('ed.saving') : t('ed.save')}</Button></div>
    </div>
  );
  if (phase === 'approval') footer = (
    <div style={{ display: 'flex', gap: 10 }}>
      <Button kind="quiet" size="lg" icon="back" onClick={() => setPhase('form')}>{t('bk.back')}</Button>
      <div style={{ flex: 1 }}><Button kind="primary" size="lg" full onClick={sendApproval} disabled={saving || !approval.reason.trim()}>{t('ed.send')}</Button></div>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={`${t('ed.edit')} · ${visit.patientName || ''}`} footer={footer} wide>
      {phase === 'loading' && <div style={{ fontSize: 17, color: C.muted, padding: 20, textAlign: 'center' }}>{t('ed.loading')}</div>}
      {phase === 'failed' && <Err>{t('ed.loadFailed')}</Err>}
      {phase === 'cancelled' && <Note tone="warn">{t('ed.cancelledNo')}</Note>}

      {(phase === 'done' || phase === 'sent') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0', textAlign: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: C.okSoft, color: C.ok, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={44} stroke={2.6} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{phase === 'sent' ? t('ed.approvalTitle') : t('ed.saved')}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {changes.map((c, i) => <li key={i} style={{ fontSize: 17, color: C.ink }}>{c}</li>)}
          </ul>
        </div>
      )}

      {phase === 'refund' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>{refund.amount > 0 ? t('ed.refundTitle', { amount: inr(refund.amount) }) : t('ed.refundHow')}</div>
          <Note tone="warn">{refund.why === 'future' ? t('ed.refundFuture') : t('ed.refundOver')}</Note>
          {refund.amount > 0 && <div style={labelStyle}>{t('ed.refundHow')}</div>}
          <RefundChoice value={refund.mode} onChange={(m) => setRefund(r => ({ ...r, mode: m }))} />
          <Err>{err}</Err>
        </div>
      )}

      {phase === 'approval' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>{t('ed.approvalTitle')}</div>
          <Note tone="warn">{approval.message || t('ed.approvalEdit')}</Note>
          <div style={labelStyle}>{t('ed.refundHow')}</div>
          <RefundChoice value={refund.mode} onChange={(m) => setRefund(r => ({ ...r, mode: m }))} />
          <ReasonBox value={approval.reason} onChange={(v) => setApproval(a => ({ ...a, reason: v }))} />
          <Err>{err}</Err>
        </div>
      )}

      {phase === 'form' && f && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Patient */}
          <section style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('ed.patient')}</div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>{t('bk.name')}</span>
              <input value={f.name} onChange={e => set('name', e.target.value)} style={fieldStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>{t('bk.mobile')}</span>
              <input inputMode="numeric" value={f.mobile} onChange={e => set('mobile', e.target.value.replace(/[^\d+ ]/g, '').slice(0, 15))} style={fieldStyle} />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>{t('bk.age')}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input inputMode="numeric" aria-label={t('bk.age')} value={f.age} onChange={e => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))} style={{ ...fieldStyle, width: 96 }} />
                {[['Y', t('bk.years')], ['M', t('bk.months')], ['D', t('bk.days')]].map(([u, l]) => <Chip key={u} on={f.unit === u} onClick={() => set('unit', u)}>{l}</Chip>)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>{t('bk.sex')}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[['Female', t('bk.female')], ['Male', t('bk.male')], ['Other', t('bk.other')]].map(([g, l]) => (
                  <Chip key={g} on={String(f.gender).toLowerCase() === g.toLowerCase() || (g !== 'Other' && String(f.gender).toUpperCase() === g[0])} onClick={() => set('gender', g)}>{l}</Chip>
                ))}
              </div>
            </div>
            <PatientMore value={f} onChange={(v) => setF(v)} />
          </section>

          {/* Tests */}
          <section style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('ed.tests')}</div>
            {lines.map((l, i) => (
              <div key={`${l.id || 'new'}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: `1px solid ${C.line}`, paddingBottom: 10 }}>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{l.serviceName}</div>
                  <div style={{ fontSize: 14, color: C.muted }}>{l.modality}</div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 48, padding: '0 12px', borderRadius: 12, border: `1.5px solid ${C.lineStrong}`, background: 'white' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.muted }}>₹</span>
                  <input inputMode="numeric" aria-label={`${t('ed.price')} ${l.serviceName}`} value={String(l.amount ?? '')}
                    onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setLines(ls => ls.map((x, j) => (j === i ? { ...x, amount: v } : x))); }}
                    style={{ width: 80, border: 'none', outline: 'none', fontSize: 17, fontWeight: 700, fontFamily: 'inherit', background: 'transparent' }} />
                </label>
                <Button kind="quiet" icon="close" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>{t('ed.remove')}</Button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{t('bk.total')}</span>
              <span style={{ fontSize: 26, fontWeight: 800 }}>{inr(total)}</span>
            </div>
            {!adding ? (
              <Button kind="outline" icon="plus" onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start' }}>{t('ed.addTest')}</Button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('bk.searchTests')} aria-label={t('bk.searchTests')} style={{ ...fieldStyle, fontSize: 17 }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 200, overflowY: 'auto' }}>
                  {shownTests.map(r => (
                    <Chip key={r.id} onClick={() => { setLines(ls => [...ls, { id: null, serviceName: r.serviceName, modality: String(r.modality || '').toUpperCase(), amount: Number(r.amount) || 0, referralCutValue: Number(r.referralCutValue) || 0 }]); setQ(''); }}>
                      {r.serviceName} · {inr(r.amount)}
                    </Chip>
                  ))}
                  {!shownTests.length && <span style={{ fontSize: 15, color: C.muted }}>{t('bk.noTests')}</span>}
                </div>
              </div>
            )}
          </section>

          {/* Doctor, date, urgency */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {doctorChoices.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={labelStyle}>{t('bk.doctor')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {doctorChoices.map(d => <Chip key={d} on={f.doctor === d} onClick={() => set('doctor', d)}>{d}</Chip>)}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={labelStyle}>{t('ed.date')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip on={f.date === istTodayYmd()} onClick={() => set('date', istTodayYmd())}>{t('bk.today')}</Chip>
                <Chip on={f.date === shiftYmd(istTodayYmd(), 1)} onClick={() => set('date', shiftYmd(istTodayYmd(), 1))}>{t('bk.tomorrow')}</Chip>
                <input type="date" value={f.date} aria-label={t('ed.date')} onChange={e => e.target.value && set('date', e.target.value)} style={{ ...fieldStyle, width: 190, fontSize: 16 }} />
              </div>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>{t('md.notes')}</span>
              <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...fieldStyle, minHeight: 72, padding: '10px 16px', resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={labelStyle}>{t('bk.priority')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRIO().map(([v, l]) => <Chip key={v} on={f.priority === v} onClick={() => set('priority', v)}>{l}</Chip>)}
              </div>
            </div>
          </section>
          <Err>{err}</Err>
        </div>
      )}
    </Sheet>
  );
}
