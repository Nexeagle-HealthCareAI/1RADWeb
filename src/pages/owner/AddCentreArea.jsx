import React from 'react';
import useAuth from '../../auth/useAuth';
import { t } from '../../i18n';
import { Button, Chip } from '../../components/saral/Saral';
import { C } from '../../components/saral/tokens';
import { apiError, fieldStyle, labelStyle } from '../../components/saral/formUtil';
import { addCentre, fetchOwnerSetup } from '../../api/billing/ownerApi';

/**
 * Owner board ▸ Add a centre. A new centre in the chain that starts with another
 * centre's prices and rules (billing, partner, GST, TDS) and, by default, keeps
 * following that centre. "Start empty" makes a bare centre, as before.
 */
const PRODUCTS = [['RIS,PACS', 'ow.ad.both'], ['RIS', 'ow.ad.ris'], ['PACS', 'ow.ad.pacs']];

export default function AddCentreArea({ toast, openCentre, opening, vp }) {
  const { refreshCenters } = useAuth();
  const [centres, setCentres] = React.useState(null);
  const [f, setF] = React.useState({ chainName: '', hospitalName: '', hospitalAddress: '', gstin: '', modules: 'RIS,PACS', from: null, keep: true });
  const [busy, setBusy] = React.useState(false);
  const [made, setMade] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    fetchOwnerSetup().then(r => {
      if (!alive) return;
      const list = (r?.centres || []).map(c => c.centre);
      setCentres(list);
      const main = list.find(c => c.hospitalId === r?.mainHospitalId) || list[0];
      setF(x => ({ ...x, from: x.from ?? main?.hospitalId ?? null, chainName: x.chainName || main?.groupName || '' }));
    }).catch(() => { if (alive) setCentres([]); });
    return () => { alive = false; };
  }, []);

  const nameOf = (id) => centres?.find(c => c.hospitalId === id)?.name || '';
  const ok = f.hospitalName.trim() && f.hospitalAddress.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!ok) { toast.show(t('ow.ad.need')); return; }
    setBusy(true);
    try {
      const res = await addCentre({
        chainName: f.chainName.trim() || f.hospitalName.trim(), hospitalName: f.hospitalName.trim(), hospitalAddress: f.hospitalAddress.trim(),
        gstin: f.gstin.trim() || null, modules: f.modules,
        copySetupFromHospitalId: f.from || null, keepLinked: !!f.from && f.keep,
      });
      if (!res?.success) { toast.show(res?.message || res?.error || t('ow.ad.failed')); return; }
      const name = f.hospitalName.trim();
      const note = res.setupCopyError ? t('ow.ad.copyFailed', { why: res.setupCopyError }) : res.setupCopied ? t('ow.ad.copied', { from: nameOf(f.from) }) : '';
      toast.show(`${t('ow.ad.done', { name })}${note ? ` ${note}` : ''}`);
      setMade({ id: res.hospitalId, name, note });
      setF(x => ({ ...x, hospitalName: '', hospitalAddress: '', gstin: '' }));
      try { await refreshCenters?.(); } catch { /* the picker refreshes on next sign-in anyway */ }
    } catch (err) {
      toast.show(apiError(err) || t('ow.ad.failed'));
    } finally { setBusy(false); }
  };

  const card = { background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 18, padding: '16px', display: 'grid', gap: 14 };
  const field = (k, label, extra = {}) => (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={labelStyle}>{t(label)}</span>
      <input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} style={fieldStyle} {...extra} />
    </label>
  );

  return (
    <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: vp.desktop ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{t('ow.ad.title')}</div>
        <div style={{ fontSize: 14, color: C.muted }}>{t('ow.ad.help')}</div>
      </div>

      <div style={card}>
        {field('hospitalName', 'ow.ad.name', { autoComplete: 'organization', required: true })}
        {field('hospitalAddress', 'ow.ad.address', { required: true })}
        {field('chainName', 'ow.ad.chain')}
        {field('gstin', 'ow.ad.gstin', { maxLength: 15, style: { ...fieldStyle, textTransform: 'uppercase' } })}
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={labelStyle}>{t('ow.ad.product')}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRODUCTS.map(([v, k]) => <Chip key={v} on={f.modules === v} onClick={() => setF({ ...f, modules: v })}>{t(k)}</Chip>)}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={labelStyle}>{t('ow.ad.start')}</span>
          <div style={{ fontSize: 14, color: C.muted }}>{t('ow.ad.startSub')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(centres || []).map(c => <Chip key={c.hospitalId} on={f.from === c.hospitalId} onClick={() => setF({ ...f, from: c.hospitalId })}>{c.name}</Chip>)}
            <Chip on={!f.from} onClick={() => setF({ ...f, from: null })}>{t('ow.ad.empty')}</Chip>
          </div>
        </div>
        {f.from && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', background: C.okSoft, borderRadius: 14, padding: '12px 14px' }}>
            <input type="checkbox" checked={f.keep} onChange={e => setF({ ...f, keep: e.target.checked })} style={{ width: 20, height: 20, marginTop: 2 }} />
            <span><span style={{ display: 'block', fontWeight: 800 }}>{t('ow.ad.link', { name: nameOf(f.from) })}</span>
              <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>{t('ow.ad.linkSub', { name: nameOf(f.from) })}</span></span>
          </label>
        )}
        <Button kind="primary" size="lg" type="submit" disabled={busy || !ok}>{busy ? '…' : t('ow.ad.go')}</Button>
        {made && (
          <div style={{ background: C.ground, borderRadius: 14, padding: '12px 14px', display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 800 }}>✓ {t('ow.ad.done', { name: made.name })}</div>
            {made.note && <div style={{ fontSize: 14, color: C.muted }}>{made.note}</div>}
            <Button kind="quiet" type="button" onClick={() => openCentre(made.id, '/money/setup')} disabled={!!opening}>{t('ow.ad.open', { name: made.name })}</Button>
          </div>
        )}
      </div>
    </form>
  );
}
