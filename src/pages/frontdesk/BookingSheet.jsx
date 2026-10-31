import React from 'react';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { buildPatientAge, formatPatientAge } from '../../utils/patientAge';
import { withDoctorPrefix } from '../../utils/referrerFormat';
import { istTodayYmd, shiftYmd } from '../../utils/istClock';
import { Button, Chip, Icon, Sheet } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';

/**
 * New booking in three short steps (UI review, round 2):
 *   1. Patient — start with the mobile number; pick who is on it or add a new patient.
 *   2. Tests and who sent them — tap tests from the price list, tap the partner.
 *   3. Check and book — when, how urgent, total.
 * Same server calls as the full appointment board (POST /patients, POST /appointments,
 * each with an idempotency key). Errors show inside the sheet — no pop-ups.
 */

const field = {
  width: '100%', minHeight: 56, borderRadius: 14, border: `1.5px solid ${C.lineStrong}`, padding: '0 16px',
  fontSize: 18, fontFamily: 'inherit', color: C.ink, background: 'white', boxSizing: 'border-box', outline: 'none',
};
const label = { fontSize: 16, fontWeight: 700, color: C.ink };
const istNowTime = () => new Date(Date.now() + 330 * 60000).toISOString().slice(11, 19);
const isDoctorRole = (r) => { const l = String(r).toLowerCase().replace(/\s+/g, ''); return l.includes('doctor') || l.includes('radiolog'); };
const sexWord = (g) => {
  const s = String(g || '').trim().toUpperCase();
  return s === 'F' || s === 'FEMALE' ? t('bk.female') : s === 'M' || s === 'MALE' ? t('bk.male') : (g || '');
};
const EMPTY_NEW = { name: '', age: '', unit: 'Y', gender: 'Female' };

function Steps({ step }) {
  const names = [t('bk.s1'), t('bk.s2'), t('bk.s3')];
  return (
    <ol aria-label="steps" style={{ display: 'flex', gap: 6, listStyle: 'none', margin: '0 0 16px', padding: 0 }}>
      {names.map((n, i) => (
        <li key={n} aria-current={step === i + 1 ? 'step' : undefined} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ height: 6, borderRadius: 99, background: i + 1 <= step ? C.primary : C.line }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: i + 1 === step ? C.primary : C.muted }}>{i + 1}. {n}</span>
        </li>
      ))}
    </ol>
  );
}

function Err({ children }) {
  if (!children) return null;
  return <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 12, padding: '10px 14px', fontSize: 15, fontWeight: 700 }}>{children}</div>;
}

export default function BookingSheet({ open, onClose, onBooked, onCollect, isOnline }) {
  const [step, setStep] = React.useState(1);
  const [mobile, setMobile] = React.useState('');
  const [found, setFound] = React.useState(null); // null = not searched, [] = none
  const [searching, setSearching] = React.useState(false);
  const [patient, setPatient] = React.useState(null); // chosen existing patient
  const [adding, setAdding] = React.useState(false);
  const [np, setNp] = React.useState(EMPTY_NEW);
  const [registry, setRegistry] = React.useState([]);
  const [doctors, setDoctors] = React.useState([]);
  const [partners, setPartners] = React.useState([]);
  const [mod, setMod] = React.useState('ALL');
  const [q, setQ] = React.useState('');
  const [tests, setTests] = React.useState([]); // registry rows
  const [sentBy, setSentBy] = React.useState({ kind: 'self' }); // self | partner{p} | other{name,isDoctor,advisedBy}
  const [doctor, setDoctor] = React.useState('');
  const [priority, setPriority] = React.useState('ROUTINE');
  const [day, setDay] = React.useState('today');
  const [otherDate, setOtherDate] = React.useState('');
  const [err, setErr] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [booked, setBooked] = React.useState(null);
  const keys = React.useRef({ patient: crypto.randomUUID(), booking: crypto.randomUUID() });

  // The parent mounts this sheet fresh for each booking, so the form starts empty.
  React.useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    apiClient.get('/finance/registry', { suppressErrorToast: true })
      .then(r => { if (alive) setRegistry((Array.isArray(r.data) ? r.data : r.data?.items || []).filter(x => x.isActive !== false)); }).catch(() => {});
    apiClient.get('/personnel', { suppressErrorToast: true }).then(r => {
      if (!alive) return;
      const all = Array.isArray(r.data) ? r.data : r.data?.items || [];
      let docs = all.filter(p => (p.roles || p.Roles || []).some(isDoctorRole)).map(p => p.fullName || p.FullName).filter(Boolean);
      if (!docs.length) docs = all.map(p => p.fullName || p.FullName).filter(Boolean);
      setDoctors(docs); setDoctor(d => d || docs[0] || '');
    }).catch(() => {});
    apiClient.get('/referrers', { params: { search: '' }, suppressErrorToast: true }).then(r => {
      if (!alive) return;
      const list = (Array.isArray(r.data) ? r.data : r.data?.items || [])
        .filter(p => !p.mergedIntoId && (p.name || '').trim() && (p.name || '').trim().toLowerCase() !== 'self');
      setPartners(list);
    }).catch(() => {});
    return () => { alive = false; };
  }, [open]);

  // Search as soon as 10 digits are in (latest number wins).
  const searchSeq = React.useRef(0);
  const onMobile = (raw) => {
    const m = raw.replace(/\D/g, '').slice(-10);
    setMobile(m); setPatient(null); setFound(null); setAdding(false);
    const seq = ++searchSeq.current;
    if (m.length !== 10) { setSearching(false); return; }
    setSearching(true);
    apiClient.get('/patients', { params: { search: m }, suppressErrorToast: true })
      .then(r => {
        if (seq !== searchSeq.current) return;
        const list = (Array.isArray(r.data) ? r.data : r.data?.data || r.data?.items || [])
          .filter(p => String(p.mobile || '').replace(/\D/g, '').endsWith(m));
        setFound(list.slice(0, 8));
        setAdding(list.length === 0);
      })
      .catch(() => { if (seq === searchSeq.current) { setFound([]); setAdding(true); } })
      .finally(() => { if (seq === searchSeq.current) setSearching(false); });
  };

  const modalities = React.useMemo(() => [...new Set(registry.map(r => String(r.modality || '').toUpperCase()).filter(Boolean))], [registry]);
  const shownTests = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return registry.filter(r => (mod === 'ALL' || String(r.modality || '').toUpperCase() === mod) && (!s || String(r.serviceName || '').toLowerCase().includes(s)));
  }, [registry, mod, q]);
  const total = tests.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const topPartners = partners.slice(0, 8);
  const dateYmd = day === 'today' ? istTodayYmd() : day === 'tomorrow' ? shiftYmd(istTodayYmd(), 1) : otherDate;
  const patientName = patient ? (patient.fullName || patient.name) : np.name;

  const toggleTest = (r) => setTests(list => (list.some(x => x.id === r.id) ? list.filter(x => x.id !== r.id) : [...list, r]));

  const next1 = () => {
    setErr('');
    if (mobile.length !== 10) return setErr(t('bk.mobileInvalid'));
    if (!patient) {
      if (!np.name.trim()) return setErr(t('bk.needName'));
      if (!String(np.age).trim()) return setErr(t('bk.needAge'));
    }
    setStep(2);
  };
  const next2 = () => {
    setErr('');
    if (!tests.length) return setErr(t('bk.needTest'));
    if (sentBy.kind === 'other' && !String(sentBy.name || '').trim()) return setErr(t('bk.needRef'));
    if (sentBy.kind === 'other' && sentBy.isDoctor === false && !String(sentBy.advisedBy || '').trim()) return setErr(t('bk.needAdvisedBy'));
    if (!doctor) return setErr(t('bk.needDoctor'));
    setStep(3);
  };

  const book = async () => {
    if (saving) return;
    setErr('');
    if (isOnline === false) return setErr(t('fd.offline'));
    if (!dateYmd) return setErr(t('bk.pickDate'));
    setSaving(true);
    try {
      let patientId = patient?.patientId || patient?.id;
      if (!patientId) {
        const res = await apiClient.post('/patients', {
          fullName: np.name.trim(), mobile, age: buildPatientAge(np.age, np.unit), gender: np.gender,
          village: '', block: '', district: '', address: '', sourceOfInfo: '',
        }, { headers: { 'Idempotency-Key': keys.current.patient } });
        patientId = res?.data?.patientId;
        setPatient({ patientId, fullName: np.name.trim(), mobile, age: buildPatientAge(np.age, np.unit), gender: np.gender });
      }
      if (!patientId || String(patientId).startsWith('temp-')) { setErr(t('bk.notSynced')); return; }

      const ref = sentBy.kind === 'self' ? { name: 'Self', isDoctor: true, contact: '' }
        : sentBy.kind === 'partner' ? { name: sentBy.p.name, isDoctor: sentBy.p.isDoctor !== false, contact: sentBy.p.contact || '', address: sentBy.p.address || '', advisedBy: sentBy.p.supportedByDoctor || '' }
          : { name: sentBy.name.trim(), isDoctor: sentBy.isDoctor !== false, contact: '', advisedBy: sentBy.advisedBy || '' };
      const lines = tests.map(r => ({ serviceName: r.serviceName, modality: String(r.modality || '').toUpperCase(), amount: Number(r.amount) || 0, referralCutValue: Number(r.referralCutValue) || 0, serviceChargeId: r.id }));
      const payload = {
        patientId,
        service: lines[0].serviceName, modality: lines[0].modality, amount: lines[0].amount, referralCutValue: lines[0].referralCutValue,
        services: lines,
        dateTime: `${dateYmd}T${istNowTime()}`,
        type: 'scheduled',
        doctor,
        referredBy: withDoctorPrefix(ref.name, ref.isDoctor),
        referredContact: ref.contact || '',
        referredAddress: ref.address || '',
        referrerIsDoctor: ref.isDoctor,
        referrerSupportedByDoctor: ref.isDoctor ? '' : (ref.advisedBy || ''),
        notes: '',
        priority,
      };
      const res = await apiClient.post('/appointments', payload, { headers: { 'Idempotency-Key': keys.current.booking }, suppressErrorToast: true });
      const appointmentId = res?.data?.appointmentId;
      const row = {
        appointmentId, patientId, patientName, mobile, service: lines[0].serviceName, modality: lines[0].modality,
        services: lines, amount: total, dateTime: payload.dateTime, status: 'BOOKED', priority, referredBy: payload.referredBy,
        patientAge: patient?.age || buildPatientAge(np.age, np.unit), patientGender: patient?.gender || np.gender,
      };
      setBooked({ ...row, day });
      onBooked?.(row);
    } catch (e) {
      const detail = e?.response?.data?.message || e?.response?.data?.error || (typeof e?.response?.data === 'string' ? e.response.data : '');
      if (e?.response?.status === 409) setErr(detail || `${patientName} ${t('bk.duplicate')}`);
      else setErr(!e?.response ? t('fd.offline') : (detail || t('fd.failed')));
    } finally {
      setSaving(false);
    }
  };

  // ── Footer per step ──
  let footer;
  if (booked) {
    footer = (
      <div style={{ display: 'flex', gap: 10 }}>
        <Button kind="outline" size="lg" style={{ flex: '0 0 auto', padding: '0 20px' }} onClick={onClose}>{t('bk.done')}</Button>
        {booked.day === 'today' && <Button kind="money" size="lg" icon="rupee" style={{ flex: 1, minWidth: 0 }} onClick={() => onCollect?.(booked)}>{t('bk.collectNow')}</Button>}
      </div>
    );
  } else if (step === 1) {
    footer = <Button kind="primary" size="lg" full onClick={next1} disabled={mobile.length !== 10 || (!patient && !adding)}>{t('bk.next1')}</Button>;
  } else {
    footer = (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button kind="quiet" size="lg" icon="back" onClick={() => { setErr(''); setStep(step - 1); }}>{t('bk.back')}</Button>
        <div style={{ flex: 1 }}>
          {step === 2
            ? <Button kind="primary" size="lg" full onClick={next2}>{t('bk.next2')}</Button>
            : <Button kind="primary" size="lg" full onClick={book} disabled={saving || isOnline === false}>{saving ? t('bk.saving') : t('bk.book', { amount: inr(total) })}</Button>}
        </div>
      </div>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('bk.title')} footer={footer} wide>
      {booked ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0', textAlign: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: C.okSoft, color: C.ok, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={44} stroke={2.6} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{t('bk.booked')}</div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{booked.patientName}</div>
          <div style={{ fontSize: 16, color: C.muted }}>{booked.services.map(s => s.serviceName).join(', ')} · {inr(booked.amount)}</div>
          <div style={{ fontSize: 16, color: C.muted }}>{t('bk.bookedFor', { date: booked.day === 'today' ? t('bk.today') : booked.day === 'tomorrow' ? t('bk.tomorrow') : booked.dateTime.slice(0, 10).split('-').reverse().join('-') })}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Steps step={step} />

          {step === 1 && (<>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={label}>{t('bk.mobile')}</span>
              <input autoFocus inputMode="numeric" autoComplete="tel" value={mobile} placeholder="98765 43210"
                onChange={e => onMobile(e.target.value)}
                style={{ ...field, fontSize: 24, fontWeight: 700, letterSpacing: 1 }} />
              <span style={{ fontSize: 14, color: C.muted }}>{searching ? t('bk.searching') : t('bk.mobileHelp')}</span>
            </label>

            {found && found.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={label}>{t('bk.found')}</div>
                {found.map(p => {
                  const id = p.patientId || p.id;
                  const on = patient && (patient.patientId || patient.id) === id;
                  return (
                    <button key={id} type="button" onClick={() => { setPatient(p); setAdding(false); setErr(''); }} aria-pressed={!!on}
                      style={{ minHeight: 64, borderRadius: 16, padding: '10px 14px', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                        background: on ? C.primarySoft : 'white', border: `2px solid ${on ? C.primary : C.line}`, color: C.ink }}>
                      <span style={{ width: 40, height: 40, borderRadius: 999, background: on ? C.primary : C.ground, color: on ? 'white' : C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={on ? 'check' : 'user'} size={20} />
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 18, fontWeight: 800 }}>{p.fullName || p.name}</span>
                        <span style={{ fontSize: 15, color: C.muted }}>{[formatPatientAge(p.age, ''), sexWord(p.gender), p.village, p.patientIdentifier].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  );
                })}
                {!adding && <Button kind="quiet" icon="plus" onClick={() => { setPatient(null); setAdding(true); }}>{t('bk.newPatient')}</Button>}
              </div>
            )}
            {found && found.length === 0 && <div style={{ fontSize: 16, fontWeight: 700, color: C.muted }}>{t('bk.none')}</div>}

            {adding && !patient && mobile.length === 10 && (
              <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{t('bk.newPatient')}</div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={label}>{t('bk.name')}</span>
                  <input value={np.name} autoComplete="name" onChange={e => setNp({ ...np, name: e.target.value })} style={field} />
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={label}>{t('bk.age')}</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input inputMode="numeric" aria-label={t('bk.age')} value={np.age} onChange={e => setNp({ ...np, age: e.target.value.replace(/\D/g, '').slice(0, 3) })} style={{ ...field, width: 96 }} />
                    {[['Y', t('bk.years')], ['M', t('bk.months')], ['D', t('bk.days')]].map(([u, l]) => (
                      <Chip key={u} on={np.unit === u} onClick={() => setNp({ ...np, unit: u })}>{l}</Chip>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={label}>{t('bk.sex')}</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[['Female', t('bk.female')], ['Male', t('bk.male')], ['Other', t('bk.other')]].map(([g, l]) => (
                      <Chip key={g} on={np.gender === g} onClick={() => setNp({ ...np, gender: g })}>{l}</Chip>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>)}

          {step === 2 && (<>
            <div style={{ fontSize: 16, color: C.muted }}>{t('bk.patient')}: <b style={{ color: C.ink }}>{patientName}</b> · {mobile}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Chip on={mod === 'ALL'} onClick={() => setMod('ALL')}>{t('bk.allTests')}</Chip>
                {modalities.map(m => <Chip key={m} on={mod === m} onClick={() => setMod(m)}>{m}</Chip>)}
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: 17, color: C.muted }}><Icon name="search" size={20} /></span>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('bk.searchTests')} aria-label={t('bk.searchTests')} style={{ ...field, paddingLeft: 44, fontSize: 17 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, maxHeight: 300, overflowY: 'auto', padding: 2 }}>
                {shownTests.map(r => {
                  const on = tests.some(x => x.id === r.id);
                  return (
                    <button key={r.id} type="button" onClick={() => toggleTest(r)} aria-pressed={on}
                      style={{ minHeight: 60, borderRadius: 14, padding: '8px 12px', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                        background: on ? C.primarySoft : 'white', border: `2px solid ${on ? C.primary : C.line}`, color: C.ink }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, border: `2px solid ${on ? C.primary : C.lineStrong}`, background: on ? C.primary : 'white', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {on && <Icon name="check" size={16} stroke={3} />}
                      </span>
                      <span style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>{r.serviceName}</span>
                      <span style={{ fontSize: 16, fontWeight: 800 }}>{inr(r.amount)}</span>
                    </button>
                  );
                })}
                {!shownTests.length && <div style={{ fontSize: 16, color: C.muted, padding: 8 }}>{t('bk.noTests')}</div>}
              </div>
              {tests.length > 0 && <div style={{ fontSize: 16, fontWeight: 700, color: C.primary }}>{t('bk.chosenTests', { n: tests.length })} · {inr(total)}</div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={label}>{t('bk.sentBy')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Chip on={sentBy.kind === 'self'} onClick={() => setSentBy({ kind: 'self' })}>{t('bk.self')}</Chip>
                {topPartners.map(p => (
                  <Chip key={p.id || p.name} on={sentBy.kind === 'partner' && sentBy.p.name === p.name} onClick={() => setSentBy({ kind: 'partner', p })}>
                    {withDoctorPrefix(p.name, p.isDoctor !== false)}
                  </Chip>
                ))}
                <Chip on={sentBy.kind === 'other'} onClick={() => setSentBy({ kind: 'other', name: '', isDoctor: true, advisedBy: '' })}>{t('bk.someoneElse')}</Chip>
              </div>
              {sentBy.kind === 'other' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={sentBy.name} placeholder={t('bk.refName')} aria-label={t('bk.refName')} onChange={e => setSentBy({ ...sentBy, name: e.target.value })} style={field} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Chip on={sentBy.isDoctor !== false} onClick={() => setSentBy({ ...sentBy, isDoctor: true })}>{t('bk.isDoctor')}</Chip>
                    <Chip on={sentBy.isDoctor === false} onClick={() => setSentBy({ ...sentBy, isDoctor: false })}>{t('bk.otherPerson')}</Chip>
                  </div>
                  {sentBy.isDoctor === false && (
                    <input value={sentBy.advisedBy} placeholder={t('bk.advisedBy')} aria-label={t('bk.advisedBy')} onChange={e => setSentBy({ ...sentBy, advisedBy: e.target.value })} style={field} />
                  )}
                </div>
              )}
            </div>

            {doctors.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={label}>{t('bk.doctor')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {doctors.map(d => <Chip key={d} on={doctor === d} onClick={() => setDoctor(d)}>{d}</Chip>)}
                </div>
              </div>
            )}
          </>)}

          {step === 3 && (<>
            <div style={{ background: 'white', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 800 }}>{patientName}</div>
                  <div style={{ fontSize: 15, color: C.muted }}>{mobile}{doctor ? ` · ${doctor}` : ''}</div>
                </div>
                <Button kind="quiet" onClick={() => setStep(1)}>{t('bk.change')}</Button>
              </div>
              {tests.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17 }}><span>{r.serviceName}</span><b>{inr(r.amount)}</b></div>
              ))}
              <div style={{ borderTop: `1px dashed ${C.lineStrong}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{t('bk.total')}</span>
                <span style={{ fontSize: 30, fontWeight: 800 }}>{inr(total)}</span>
              </div>
              <div style={{ fontSize: 15, color: C.muted }}>{t('bk.sentBy')}: {sentBy.kind === 'self' ? t('bk.self') : sentBy.kind === 'partner' ? withDoctorPrefix(sentBy.p.name, sentBy.p.isDoctor !== false) : withDoctorPrefix(sentBy.name, sentBy.isDoctor)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={label}>{t('bk.when')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip on={day === 'today'} onClick={() => setDay('today')}>{t('bk.today')}</Chip>
                <Chip on={day === 'tomorrow'} onClick={() => setDay('tomorrow')}>{t('bk.tomorrow')}</Chip>
                <Chip on={day === 'other'} onClick={() => setDay('other')}>{t('bk.pickDate')}</Chip>
                {day === 'other' && <input type="date" min={istTodayYmd()} value={otherDate} aria-label={t('bk.pickDate')} onChange={e => setOtherDate(e.target.value)} style={{ ...field, width: 190, fontSize: 16 }} />}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={label}>{t('bk.priority')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[['ROUTINE', t('bk.routine')], ['URGENT', t('bk.urgent')], ['STAT', t('bk.stat')]].map(([v, l]) => (
                  <Chip key={v} on={priority === v} onClick={() => setPriority(v)}>{l}</Chip>
                ))}
              </div>
            </div>
          </>)}

          <Err>{err}</Err>
        </div>
      )}
    </Sheet>
  );
}
