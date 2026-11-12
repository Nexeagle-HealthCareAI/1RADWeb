import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useAuth from '../../auth/useAuth';
import { t, useLang } from '../../i18n';
import { Chip } from '../../components/saral/Saral';
import { C, FONT } from '../../components/saral/tokens';
import { useToast, useViewport } from '../../components/saral/hooks';
import { fetchOwnerApprovals } from '../../api/billing/ownerApi';
import GlanceArea from './GlanceArea';
import NeedsArea from './NeedsArea';
import SameSetupArea from './SameSetupArea';
import AddCentreArea from './AddCentreArea';

/**
 * Owner board (Nov 2026): every centre the owner runs, on one screen.
 *  • At a glance — the money at every centre for the period, as cards or side by side;
 *  • Needs you — requests from every centre, approved or refused right here;
 *  • Same setup — each rule and price, centre by centre, and making them the same;
 *  • Add a centre — a new centre that starts with (and keeps following) the main centre's setup.
 * Opening a centre switches the login to it, as the centre picker does.
 */
const TABS = ['glance', 'needs', 'setup', 'add'];

export default function OwnerBoardPage() {
  useLang();
  const { tab } = useParams();
  const navigate = useNavigate();
  const { activeCenter, switchCenter } = useAuth();
  const vp = useViewport();
  const toast = useToast();
  const cur = TABS.includes(tab) ? tab : 'glance';
  const [asks, setAsks] = React.useState(null);
  const [ver, setVer] = React.useState(0);
  const [opening, setOpening] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    fetchOwnerApprovals().then(r => { if (alive) setAsks(r); }).catch(() => { if (alive) setAsks([]); });
    return () => { alive = false; };
  }, [ver]);

  const openCentre = async (hospitalId, route = '/money/overview') => {
    if (opening) return;
    setOpening(hospitalId);
    try {
      if (hospitalId !== activeCenter?.id) {
        const r = await switchCenter(hospitalId);
        if (!r?.success) { toast.show(r?.error || t('ow.failed')); return; }
      }
      navigate(route);
    } finally { setOpening(''); }
  };

  const shared = { vp, toast, openCentre, opening, refresh: () => setVer(v => v + 1), ver };
  const count = asks?.length || 0;

  return (
    <div style={{ minHeight: vp.phone ? '100vh' : 'calc(100vh - 64px)', background: C.ground, fontFamily: FONT, color: C.ink }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: vp.phone ? '12px 12px 96px' : '20px 24px 32px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridAutoRows: 'max-content', gap: 14 }}>
        <div>
          <div style={{ fontSize: vp.phone ? 24 : 30, fontWeight: 800 }}>{t('ow.title')}</div>
          <div style={{ fontSize: 15, color: C.muted }}>{t('ow.help')}</div>
        </div>
        <nav aria-label={t('ow.title')} style={{ display: 'flex', gap: 8, overflowX: 'auto', minWidth: 0, paddingBottom: 2 }}>
          {TABS.map(k => (
            <Chip key={k} on={k === cur} onClick={() => navigate(`/owner/${k}`)} aria-current={k === cur ? 'page' : undefined}>
              {t(`ow.tab.${k}`)}
              {k === 'needs' && count > 0 && (
                <span style={{ marginLeft: 8, minWidth: 22, height: 22, padding: '0 6px', borderRadius: 11, background: C.due, color: 'white', fontSize: 13, fontWeight: 800,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>
              )}
            </Chip>
          ))}
        </nav>
        {cur === 'glance' && <GlanceArea {...shared} />}
        {cur === 'needs' && <NeedsArea {...shared} asks={asks} />}
        {cur === 'setup' && <SameSetupArea {...shared} />}
        {cur === 'add' && <AddCentreArea {...shared} />}
      </div>
      {toast.node}
    </div>
  );
}
