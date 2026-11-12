import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import useAuth from '../../auth/useAuth';
import { useBillingSettings } from '../../api/billing/billingSettingsApi';
import { t, useLang } from '../../i18n';
import { Chip } from '../../components/saral/Saral';
import { C, FONT } from '../../components/saral/tokens';
import { useToast, useViewport } from '../../components/saral/hooks';
import BillsArea from './BillsArea';
import CashBookArea from './CashBookArea';
import OverviewArea from './OverviewArea';
import ExpensesArea from './ExpensesArea';
import ReportsArea from './ReportsArea';
import SetupArea from './SetupArea';
import { moneyRole } from './mnUtil';

const BillingPage = React.lazy(() => import('../BillingPage'));
const PartnersPage = React.lazy(() => import('../partners/PartnersPage'));

/**
 * Money (redesign, Nov 2026): one menu, organised by the job each person does.
 * The owner lands on Overview, the front desk on Today at the counter, the
 * accountant on Bills. Bills and the counter are rebuilt; the other areas show
 * the existing screens inside this menu until they are rebuilt in turn.
 */
const AREAS = [
  { id: 'overview', icon: '◎', roles: ['owner', 'acc'] },
  { id: 'counter', icon: '₹', roles: ['owner', 'desk'] },
  { id: 'bills', icon: '▤', roles: ['owner', 'desk', 'acc'] },
  { id: 'book', icon: '⇅', roles: ['owner', 'acc'] },
  { id: 'partners', icon: '⚭', roles: ['owner', 'acc'], partners: true },
  { id: 'exp', icon: '⊖', roles: ['owner', 'acc'] },
  { id: 'reports', icon: '⤓', roles: ['owner', 'acc'] },
  { id: 'setup', icon: '⚙', roles: ['owner'] },
  // Every tool of the older billing screen, so nothing is lost while the new screens take over.
  { id: 'tools', icon: '☰', roles: ['owner', 'acc'] },
];
const LANDING = { owner: 'overview', desk: 'counter', acc: 'bills' };

export default function MoneyPage() {
  useLang();
  const { area } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCenter, currentUser } = useAuth();
  const role = moneyRole(currentUser);
  const settings = useBillingSettings(activeCenter?.id);
  const vp = useViewport();
  const toast = useToast();

  const mine = AREAS.filter(a => a.roles.includes(role));
  const cur = mine.find(a => a.id === area) || mine.find(a => a.id === LANDING[role]) || mine[0];
  React.useEffect(() => {
    if (cur && area !== cur.id) navigate(`/money/${cur.id}`, { replace: true });
  }, [area, cur, navigate]);

  // The centre's identity for printed bills and receipts (as the old Billing page).
  const [taxProfile, setTaxProfile] = React.useState(null);
  React.useEffect(() => {
    const id = activeCenter?.id;
    if (!id) return undefined;
    let alive = true;
    apiClient.get(`/hospitals/${id}`, { suppressErrorToast: true }).then(res => {
      if (!alive) return;
      const d = res?.data || {};
      setTaxProfile({
        gstin: (d.gstin || d.GSTIN || '').toUpperCase(), pan: (d.pan || d.PAN || '').toUpperCase(),
        hospitalAddress: d.hospitalAddress || '', registrationNumber: d.registrationNumber || '',
        nabhNumber: d.nabhNumber || d.NABHNumber || '', publicContact: d.publicContact || '', publicEmail: d.publicEmail || '',
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, [activeCenter?.id]);
  const printCtx = React.useMemo(() => ({
    activeCenter, ownerDetails: null,
    taxProfile: taxProfile ? { ...taxProfile, gstEnabled: settings?.gstEnabled !== false } : null,
  }), [activeCenter, taxProfile, settings?.gstEnabled]);

  if (!cur) return null;
  const go = (id) => navigate(`/money/${id}`);
  const centreName = activeCenter?.name || activeCenter?.hospitalName || '';

  const body = (() => {
    if (cur.id === 'bills' || cur.id === 'counter') {
      return <BillsArea key={cur.id} counter={cur.id === 'counter'} role={role} settings={settings}
        centre={activeCenter} printCtx={printCtx} toast={toast} vp={vp} />;
    }
    if (cur.id === 'book') return <CashBookArea role={role} toast={toast} vp={vp} />;
    if (cur.id === 'overview') return <OverviewArea vp={vp} />;
    if (cur.id === 'exp') return <ExpensesArea toast={toast} vp={vp} />;
    if (cur.id === 'reports') return <ReportsArea toast={toast} vp={vp} printCtx={printCtx} />;
    if (cur.id === 'setup') return <SetupArea centre={activeCenter} toast={toast} vp={vp} />;
    if (cur.id === 'tools') {
      const tab = new URLSearchParams(location.search).get('tab');
      const known = ['INVOICES', 'REFERRAL_CUTS', 'EXPENSES', 'DAYBOOK', 'CREDIT_NOTES', 'SERVICES', 'FINANCE', 'ANALYTICS'];
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: vp.phone ? 0 : '14px 22px' }}>
          <div style={{ margin: vp.phone ? '10px 12px' : '0 0 12px', fontSize: 14, color: C.muted, background: 'white',
            border: `1px dashed ${C.lineStrong}`, borderRadius: 12, padding: '8px 12px' }}>{t('mn.tools.help')}</div>
          <React.Suspense fallback={<div style={{ padding: 20, color: C.faint }}>…</div>}>
            <BillingPage embedded showTabs initialView={known.includes(tab) ? tab : 'INVOICES'}
              openInvoice={location.state?.openInvoice || null} startNewBill={!!location.state?.newBill} />
          </React.Suspense>
        </div>
      );
    }
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: vp.phone ? 0 : '14px 22px' }}>
        {!cur.partners && <div style={{ margin: vp.phone ? '10px 12px' : '0 0 12px', fontSize: 14, color: C.muted, background: 'white',
          border: `1px dashed ${C.lineStrong}`, borderRadius: 12, padding: '8px 12px' }}>{t('mn.oldScreen')}</div>}
        <React.Suspense fallback={<div style={{ padding: 20, color: C.faint }}>…</div>}>
          {cur.partners ? <PartnersPage /> : <BillingPage embedded initialView={cur.old} />}
        </React.Suspense>
      </div>
    );
  })();

  return (
    <div style={{ display: 'flex', flexDirection: vp.phone ? 'column' : 'row', height: vp.phone ? 'auto' : 'calc(100vh - 64px)', minHeight: vp.phone ? '100vh' : 0,
      background: C.ground, fontFamily: FONT, color: C.ink }}>
      {vp.phone ? (
        <nav aria-label={t('mn.title')} style={{ position: 'sticky', top: 0, zIndex: 400, display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 12px', background: C.ground, borderBottom: `1px solid ${C.line}` }}>
          {mine.map(a => <Chip key={a.id} on={a.id === cur.id} onClick={() => go(a.id)} aria-current={a.id === cur.id ? 'page' : undefined}>{t(`mn.nav.${a.id}`)}</Chip>)}
        </nav>
      ) : (
        <nav aria-label={t('mn.title')} style={{ width: 232, flexShrink: 0, background: 'white', borderRight: `1px solid ${C.line}`, padding: '18px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 800, padding: '0 8px 2px' }}>{t('mn.title')}</div>
          <div style={{ fontSize: 13, color: C.faint, padding: '0 8px 12px' }}>{centreName}</div>
          {mine.map(a => {
            const on = a.id === cur.id;
            return (
              <button key={a.id} type="button" onClick={() => go(a.id)} aria-current={on ? 'page' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 10px', border: 'none', borderRadius: 12,
                  fontFamily: 'inherit', fontSize: 15, fontWeight: 700, textAlign: 'left', cursor: 'pointer',
                  background: on ? C.primarySoft : 'white', color: on ? C.primary : '#374151' }}>
                <span aria-hidden="true" style={{ width: 18, textAlign: 'center' }}>{a.icon}</span>
                <span style={{ flex: 1 }}>{t(`mn.nav.${a.id}`)}</span>
              </button>
            );
          })}
        </nav>
      )}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{body}</main>
      {toast.node}
    </div>
  );
}
