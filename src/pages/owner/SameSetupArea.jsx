import React from 'react';
import { t } from '../../i18n';
import { Button, Chip, Sheet, Tag } from '../../components/saral/Saral';
import { C, inr } from '../../components/saral/tokens';
import { apiError } from '../../components/saral/formUtil';
import { copyOwnerSetup, fetchOwnerSetup, unlinkCentre } from '../../api/billing/ownerApi';
import { LINK_COLOURS, linkWord, tn } from './owUtil';

/**
 * Owner board ▸ Same setup. Every billing rule and the price list, centre by
 * centre, each row marked Same or Differs; the prices that differ; and one panel
 * to make centres the same as another — copied once or kept linked (linked is the
 * default, as the owner asked). Tests only a follower offers are never removed.
 */
const pctOrNone = (v) => (v == null ? t('ow.st.v.noLimit') : `${Number(v)}%`);
const onOff = (v) => (v ? t('ow.st.v.on') : t('ow.st.v.off'));
const RULES = [
  { k: 'auto', get: (b, c) => !!c?.autoBilling, show: onOff },
  { k: 'desk', get: b => Number(b.frontDeskDiscountLimitPercent), show: v => `${v}%` },
  { k: 'acc', get: b => (b.accountantDiscountLimitPercent == null ? null : Number(b.accountantDiscountLimitPercent)), show: pctOrNone },
  { k: 'reason', get: b => !!b.discountReasonRequired, show: onOff },
  { k: 'pay', get: b => b.partnerPayWhenBilled !== false, show: v => (v ? t('ow.st.v.billed') : t('ow.st.v.paid')) },
  { k: 'gst', get: b => !!b.gstEnabled, show: onOff },
  { k: 'cn', get: b => !!b.creditNotesEnabled, show: onOff },
  { k: 'tds', get: b => !!b.tdsEnabled, show: onOff },
  { k: 'tdsRate', get: b => (b.tdsEnabled ? Number(b.tdsCommissionRate) : null), show: v => (v == null ? '—' : `${v}%`) },
];

function StateTag({ same }) {
  return same
    ? <Tag bg={C.okSoft} fg={C.ok} style={{ fontSize: 12, padding: '2px 10px' }}>{t('ow.st.same')}</Tag>
    : <Tag bg={C.dueSoft} fg={C.dueInk} style={{ fontSize: 12, padding: '2px 10px' }}>{t('ow.st.differs')}</Tag>;
}

export default function SameSetupArea({ toast, vp }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [ver, setVer] = React.useState(0);
  const [from, setFrom] = React.useState(null);
  const [to, setTo] = React.useState([]);
  const [parts, setParts] = React.useState({ billing: true, prices: true });
  const [keep, setKeep] = React.useState(true);
  const [ask, setAsk] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [allPrices, setAllPrices] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setErr('');
    fetchOwnerSetup().then(r => {
      if (!alive) return;
      setD(r);
      const main = r.mainHospitalId || r.centres?.[0]?.centre.hospitalId || null;
      setFrom(f => f || main);
    }).catch(e => { if (alive) setErr(apiError(e) || t('ow.failed')); });
    return () => { alive = false; };
  }, [ver]);

  const centres = d?.centres || [];
  const all = centres.map(c => c.centre);
  const ids = all.map(c => c.hospitalId);
  const nameOf = (id) => all.find(c => c.hospitalId === id)?.name || '';
  const mainId = from || d?.mainHospitalId;

  // Prices: how many tests at each centre differ from the main centre.
  const priceRows = d?.prices || [];
  const diffFromMain = (id) => priceRows.filter(p => {
    const m = p.prices[mainId]; const x = p.prices[id];
    return m != null && (x == null || Number(x) !== Number(m));
  }).length;
  const differing = priceRows.filter(p => {
    const vals = ids.map(id => (p.prices[id] == null ? null : Number(p.prices[id])));
    return vals.some(v => v !== vals[0]);
  });

  React.useEffect(() => {
    // Default "To": every other centre that isn't already the same.
    if (!d || !mainId) return;
    setTo(ids.filter(id => id !== mainId));
  }, [d, mainId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setBusy(true);
    try {
      const res = await copyOwnerSetup({ fromHospitalId: mainId, toHospitalIds: to, billing: parts.billing, prices: parts.prices, keepLinked: keep });
      const detail = parts.prices ? (res || []).map(r => t('ow.st.doneDetail', { name: nameOf(r.hospitalId), added: r.pricesAdded, updated: r.pricesUpdated })).join(' · ') : '';
      toast.show(`${tn('ow.st.done', { n: (res || []).length })}${detail ? ` ${detail}` : ''}`);
      setAsk(false);
      setVer(v => v + 1);
    } catch (e) { toast.show(apiError(e) || t('ow.nd.failed')); } finally { setBusy(false); }
  };
  const unlink = async (c) => {
    try { await unlinkCentre(c.hospitalId); toast.show(t('ow.st.unlinked', { name: c.name })); setVer(v => v + 1); }
    catch (e) { toast.show(apiError(e) || t('ow.nd.failed')); }
  };

  if (err) return <div role="alert" style={{ background: C.dangerSoft, color: C.danger, borderRadius: 14, padding: 14, fontWeight: 700 }}>{err}</div>;
  if (!d) return <div style={{ color: C.faint }}>{t('ow.loading')}</div>;
  if (!centres.length) return <div style={{ color: C.faint }}>{t('ow.none')}</div>;

  const card = { background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 18 };
  const cell = { padding: '10px 12px', borderTop: '1px solid #F3F4F6', whiteSpace: 'nowrap', textAlign: 'left', verticalAlign: 'top' };
  const sticky = { position: 'sticky', left: 0, background: 'white', zIndex: 1 };
  const shownPrices = allPrices ? differing : differing.slice(0, 12);
  const toOk = to.length > 0 && (parts.billing || parts.prices);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridAutoRows: 'max-content', gap: 14 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{t('ow.st.title')}</div>
        <div style={{ fontSize: 14, color: C.muted }}>{t('ow.st.help')}</div>
      </div>

      {vp.phone ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {centres.map(({ centre: c }) => {
              const lw = linkWord(c, all);
              return (
                <span key={c.hospitalId} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: 'white', border: `1.5px solid ${C.line}`, borderRadius: 999, padding: '4px 6px 4px 12px' }}>
                  <b style={{ fontSize: 14 }}>{c.name}</b>
                  <Tag bg={LINK_COLOURS[lw.kind].bg} fg={LINK_COLOURS[lw.kind].fg} style={{ fontSize: 11, padding: '2px 8px' }}>{lw.kind === 'linked' ? t('ow.c.follows', { name: nameOf(c.followsHospitalId) }) : lw.word}</Tag>
                  {lw.kind === 'linked' && <button type="button" onClick={() => unlink(c)} style={{ border: 'none', background: 'none', color: C.primary, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{t('ow.st.unlink')}</button>}
                </span>
              );
            })}
          </div>
          {[...RULES.map(r => ({ k: r.k, vals: centres.map(c => r.show(r.get(c.billing, c))), raw: centres.map(c => r.get(c.billing, c)) })),
            { k: 'prices', vals: centres.map(c => { const n = c.centre.hospitalId === mainId ? 0 : diffFromMain(c.centre.hospitalId); return n ? `${tn('ow.st.v.tests', { n: c.priceCount })} · ${tn('ow.st.v.priceDiff', { n })}` : tn('ow.st.v.tests', { n: c.priceCount }); }),
              raw: centres.map(c => (c.centre.hospitalId === mainId ? 0 : diffFromMain(c.centre.hospitalId))) }].map(row => {
            const mi = Math.max(0, centres.findIndex(c => c.centre.hospitalId === mainId));
            const same = row.k === 'prices' ? differing.length === 0 : row.raw.every(v => v === row.raw[0]);
            return (
              <div key={row.k} style={{ ...card, padding: '12px 14px', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ flex: 1, fontWeight: 800, fontSize: 16 }}>{t(`ow.st.r.${row.k}`)}</span><StateTag same={same} />
                </div>
                {centres.map((c, i) => {
                  const off = !same && (row.k === 'prices' ? row.raw[i] > 0 : row.raw[i] !== row.raw[mi]);
                  return (
                    <div key={c.centre.hospitalId} style={{ display: 'flex', gap: 8, fontSize: 15, borderTop: '1px solid #F3F4F6', paddingTop: 6 }}>
                      <span style={{ flex: 1, color: C.muted }}>{c.centre.name}</span>
                      <b style={{ color: off ? C.dueInk : C.ink }}>{row.vals[i]}</b>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 15 }}>
          <thead>
            <tr>
              <th style={{ ...cell, ...sticky, borderTop: 'none', fontSize: 12, letterSpacing: 1, color: C.faint }}>{t('ow.st.rule').toUpperCase()}</th>
              <th style={{ ...cell, borderTop: 'none' }} />
              {centres.map(({ centre: c, billing }) => {
                const lw = linkWord(c, all);
                return (
                  <th key={c.hospitalId} style={{ ...cell, borderTop: 'none' }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{c.name}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                      <Tag bg={LINK_COLOURS[lw.kind].bg} fg={LINK_COLOURS[lw.kind].fg} style={{ fontSize: 11, padding: '2px 8px' }}>{lw.word}</Tag>
                      {!billing.customised && <Tag bg="#F3F4F6" fg={C.faint} style={{ fontSize: 11, padding: '2px 8px' }}>{t('ow.st.notSet')}</Tag>}
                    </div>
                    {lw.kind === 'linked' && (
                      <button type="button" onClick={() => unlink(c)}
                        style={{ marginTop: 6, border: 'none', background: 'none', padding: 0, color: C.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {t('ow.st.unlink')}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {RULES.map(r => {
              const vals = centres.map(c => r.get(c.billing, c));
              const main = r.get((centres.find(c => c.centre.hospitalId === mainId) || centres[0]).billing, centres.find(c => c.centre.hospitalId === mainId) || centres[0]);
              const same = vals.every(v => v === vals[0]);
              return (
                <tr key={r.k}>
                  <td style={{ ...cell, ...sticky, fontWeight: 700, color: C.muted }}>{t(`ow.st.r.${r.k}`)}</td>
                  <td style={cell}><StateTag same={same} /></td>
                  {centres.map((c, i) => {
                    const off = !same && vals[i] !== main;
                    return (
                      <td key={c.centre.hospitalId} style={{ ...cell, fontWeight: 700, color: off ? C.dueInk : C.ink, background: off ? '#FFF7ED' : undefined }}>
                        {r.show(vals[i])}
                        {!c.billing.customised && <div style={{ fontSize: 12, fontWeight: 500, color: C.faint }}>{t('ow.st.default')}</div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr>
              <td style={{ ...cell, ...sticky, fontWeight: 700, color: C.muted }}>{t('ow.st.r.prices')}</td>
              <td style={cell}><StateTag same={differing.length === 0} /></td>
              {centres.map(c => {
                const isMain = c.centre.hospitalId === mainId;
                const n = isMain ? 0 : diffFromMain(c.centre.hospitalId);
                return (
                  <td key={c.centre.hospitalId} style={{ ...cell, fontWeight: 700, color: n > 0 ? C.dueInk : C.ink, background: n > 0 ? '#FFF7ED' : undefined }}>
                    {tn('ow.st.v.tests', { n: c.priceCount })}
                    {!isMain && <div style={{ fontSize: 12, fontWeight: 600, color: n > 0 ? C.dueInk : C.ok }}>{n > 0 ? tn('ow.st.v.priceDiff', { n }) : t('ow.st.v.priceSame')}</div>}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      )}

      <div style={{ ...card, padding: '14px 16px', display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{t('ow.st.make')}</div>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{t('ow.st.from').toUpperCase()}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {all.map(c => <Chip key={c.hospitalId} on={mainId === c.hospitalId} onClick={() => setFrom(c.hospitalId)}>{c.name}</Chip>)}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{t('ow.st.to').toUpperCase()}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {all.filter(c => c.hospitalId !== mainId).map(c => {
              const on = to.includes(c.hospitalId);
              return <Chip key={c.hospitalId} on={on} onClick={() => setTo(on ? to.filter(x => x !== c.hospitalId) : [...to, c.hospitalId])}>{on ? '✓ ' : ''}{c.name}</Chip>;
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: C.faint }}>{t('ow.st.what').toUpperCase()}</span>
          {[['billing', 'ow.st.billing'], ['prices', 'ow.st.priceList']].map(([k, label]) => (
            <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 16, fontWeight: 600 }}>
              <input type="checkbox" checked={parts[k]} onChange={e => setParts({ ...parts, [k]: e.target.checked })} style={{ width: 20, height: 20 }} />
              {t(label)}
            </label>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', background: C.ground, borderRadius: 14, padding: '10px 12px' }}>
          <input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
          <span><span style={{ display: 'block', fontWeight: 800 }}>{t('ow.st.link')}</span>
            <span style={{ fontSize: 13, color: C.muted }}>{t('ow.st.linkSub', { name: nameOf(mainId) })}</span></span>
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button kind="primary" size="lg" disabled={!toOk} onClick={() => setAsk(true)}>{t('ow.st.go')}</Button>
          {!toOk && <span style={{ fontSize: 14, color: C.faint }}>{to.length ? t('ow.st.pickWhat') : t('ow.st.pickTo')}</span>}
        </div>
        <div style={{ fontSize: 13, color: C.faint }}>{t('ow.st.dateNote')}</div>
      </div>

      <div style={{ ...card, overflowX: 'auto' }}>
        <div style={{ padding: '14px 16px 6px' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{t('ow.st.prices')}</div>
          <div style={{ fontSize: 14, color: C.muted }}>{differing.length ? t('ow.st.pricesHelp') : t('ow.st.pricesNone')}</div>
        </div>
        {differing.length > 0 && (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 15 }}>
            <thead>
              <tr>
                <th style={{ ...cell, ...sticky, fontSize: 12, letterSpacing: 1, color: C.faint }}>{t('ow.st.test').toUpperCase()}</th>
                {all.map(c => <th key={c.hospitalId} style={{ ...cell, textAlign: 'right', fontWeight: 800 }}>{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {shownPrices.map(p => {
                const m = p.prices[mainId];
                return (
                  <tr key={`${p.modality}|${p.test}`}>
                    <td style={{ ...cell, ...sticky, fontWeight: 700, whiteSpace: 'normal', minWidth: 160 }}>{p.test}<span style={{ display: 'block', fontSize: 12, color: C.faint, fontWeight: 500 }}>{p.modality}</span></td>
                    {all.map(c => {
                      const v = p.prices[c.hospitalId];
                      const off = c.hospitalId !== mainId && m != null && (v == null || Number(v) !== Number(m));
                      return <td key={c.hospitalId} style={{ ...cell, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: v == null ? C.faint : off ? C.dueInk : C.ink, background: off ? '#FFF7ED' : undefined }}>{v == null ? '—' : inr(v)}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {differing.length > 12 && !allPrices && (
          <div style={{ padding: 12 }}><Button kind="quiet" onClick={() => setAllPrices(true)}>{t('ow.st.pricesMore', { n: differing.length })}</Button></div>
        )}
      </div>

      <Sheet open={ask} onClose={() => setAsk(false)} title={tn('ow.st.confirm', { n: to.length, name: nameOf(mainId) })}
        footer={<Button kind="primary" size="lg" disabled={busy} onClick={run}>{busy ? '…' : t('ow.st.go')}</Button>}>
        <div style={{ display: 'grid', gap: 10, fontSize: 16, lineHeight: 1.5 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{to.map(id => <Tag key={id} bg={C.primarySoft} fg={C.primary}>{nameOf(id)}</Tag>)}</div>
          {parts.billing && <div>• {t('ow.st.confirmBilling', { name: nameOf(mainId) })}</div>}
          {parts.prices && <div>• {t('ow.st.confirmPrices', { name: nameOf(mainId) })}</div>}
          <div style={{ fontWeight: 700 }}>• {keep ? t('ow.st.confirmLink', { name: nameOf(mainId) }) : t('ow.st.confirmOnce')}</div>
        </div>
      </Sheet>
    </div>
  );
}
