import React from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../i18n';
import { Button, Chip } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError, fieldStyle } from '../../components/saral/formUtil';
import { fetchDailyCheck } from '../../api/billing/moneyApi';
import { istDay } from './mnUtil';

/**
 * Money ▸ Daily check (owner, accountant). Does the day add up? The day's visits,
 * bills, money in and cash book in one line, then every record that does not
 * match — most serious first — each with a button to fix it. Then the checks that
 * passed, so a clean day is visibly clean.
 */
const KINDS = ['NO_BILL', 'CANCELLED_VISIT', 'PAID_MISMATCH', 'TOTAL_MISMATCH', 'SHARE_ON_CANCELLED', 'DUPLICATE', 'NOT_CLOSED', 'CASH_DIFFERENCE'];
const SEV = { high: { bg: C.dangerSoft, fg: C.danger }, medium: { bg: C.dueSoft, fg: C.dueInk }, low: { bg: '#F3F4F6', fg: C.muted } };
const signed = (n) => (n < 0 ? `−${inr(-n)}` : inr(n));

export default function CheckArea({ vp }) {
  const navigate = useNavigate();
  const [day, setDay] = React.useState(istDay(0));
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [ver, setVer] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setD(null); setErr('');
    fetchDailyCheck(day).then(r => { if (alive) setD(r); }).catch(e => { if (alive) setErr(apiError(e) || t('ck.failed')); });
    return () => { alive = false; };
  }, [day, ver]);

  const fix = (i) => {
    if (i.billNumber) return navigate(`/money/bills?q=${encodeURIComponent(i.billNumber)}`);
    if (i.kind === 'NO_BILL') return navigate('/money/tools', { state: { newBill: Date.now() } });
    if (i.kind === 'SHARE_ON_CANCELLED') return navigate('/money/partners');
    if (i.kind === 'NOT_CLOSED' || i.kind === 'CASH_DIFFERENCE') return navigate('/money/book');
    return null;
  };

  const card = { background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 16, minWidth: 0 };
  const groups = d ? KINDS.map(k => ({ k, rows: d.issues.filter(i => i.kind === k) })).filter(g => g.rows.length) : [];
  const c = d?.counts;

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: vp.phone ? '12px 12px 90px' : '18px 22px 24px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridAutoRows: 'max-content', gap: 12, alignContent: 'start' }}>
      <div>
        <div style={{ fontSize: vp.phone ? 22 : 26, fontWeight: 800 }}>{t('ck.title')}</div>
        <div style={{ fontSize: 15, color: C.muted }}>{t('ck.help')}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip on={day === istDay(0)} onClick={() => setDay(istDay(0))}>{t('mn.d.today')}</Chip>
        <Chip on={day === istDay(-1)} onClick={() => setDay(istDay(-1))}>{t('mn.d.yesterday')}</Chip>
        <input type="date" aria-label={t('ck.pick')} value={day} max={istDay(0)} onChange={e => e.target.value && setDay(e.target.value)} style={{ ...fieldStyle, width: 180, height: 44 }} />
      </div>

      {err && (
        <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: 14, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{err}</span><Button kind="quiet" onClick={() => setVer(v => v + 1)}>{t('mn.retry')}</Button>
        </div>
      )}
      {!d && !err && <div style={{ color: C.faint }}>…</div>}

      {d && (
        <>
          <div style={{ ...card, padding: '10px 14px', display: 'grid', gridTemplateColumns: vp.phone ? 'repeat(2, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))', gap: 10 }}>
            {[[t('ck.visits'), String(c.visits), c.visitsCancelled ? t('ck.cancelledN', { n: c.visitsCancelled }) : null],
              [t('ck.bills'), String(c.bills), c.billsCancelled ? t('ck.cancelledN', { n: c.billsCancelled }) : null],
              [t('ck.billed'), inr(c.billed), null],
              [t('ck.moneyIn'), signed(c.moneyIn), null],
              [t('ck.cash'), signed(c.cash), null],
              [t('ck.drawer'), c.closed ? t('ck.closed') : t('ck.open'), null]].map(([k, v, sub]) => (
              <div key={k} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{k.toUpperCase()}</div>
                <div style={{ fontSize: 19, fontWeight: 800 }}>{v}</div>
                {sub && <div style={{ fontSize: 12, color: C.faint }}>{sub}</div>}
              </div>
            ))}
          </div>

          <div style={{ ...card, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center',
            background: d.issues.length ? C.dangerSoft : C.okSoft, borderColor: d.issues.length ? '#FECACA' : '#BBF7D0' }}>
            <span style={{ fontSize: 26 }} aria-hidden="true">{d.issues.length ? '!' : '✓'}</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: d.issues.length ? C.danger : C.ok }}>
              {d.issues.length ? t('ck.problems', { n: d.issues.length }) : t('ck.allGood')}
            </span>
          </div>

          {groups.map(g => (
            <div key={g.k} style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', background: C.ground, borderBottom: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: SEV[g.rows[0].severity]?.bg, color: SEV[g.rows[0].severity]?.fg }}>{g.rows.length}</span>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>{t(`ck.k.${g.k}`)}</span>
              </div>
              <div style={{ fontSize: 13, color: C.muted, padding: '8px 14px 0' }}>{t(`ck.why.${g.k}`)}</div>
              {g.rows.map((i, n) => (
                <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 14px', borderTop: n ? '1px solid #F3F4F6' : 'none', minHeight: 44 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i.patientName || t(`ck.k.${i.kind}`)}{i.billNumber && <span style={{ fontWeight: 500, color: C.faint }}> · {i.billNumber}</span>}
                    </span>
                    {i.detail && <span style={{ display: 'block', fontSize: 13, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.detail}</span>}
                  </span>
                  {i.amount != null && <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{signed(i.amount)}</span>}
                  <Button kind="quiet" onClick={() => fix(i)}>{t(`ck.fix.${g.k}`)}</Button>
                </div>
              ))}
            </div>
          ))}

          {d.passed.length > 0 && (
            <div style={{ ...card, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: C.faint, marginBottom: 6 }}>{t('ck.passed').toUpperCase()}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {d.passed.map(k => <span key={k} style={{ fontSize: 13, fontWeight: 700, color: C.ok, background: C.okSoft, borderRadius: 999, padding: '3px 10px' }}>✓ {t(`ck.ok.${k}`)}</span>)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
