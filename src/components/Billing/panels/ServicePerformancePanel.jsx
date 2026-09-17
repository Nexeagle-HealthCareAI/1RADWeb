import React, { useMemo, useState } from 'react';

/**
 * ServicePerformancePanel — the SERVICES tab: per-service (not just
 * per-modality) breakdown grouped under each modality, with an Excel export,
 * search, sortable columns, and an optional prior-period comparison.
 *
 * @param {boolean} isMobile
 * @param {Array} modalityGroupedServices  modalities that actually have services, each with a .services[] list
 * @param {Array} allServicesData          flat sorted list, used only for the summary KPI strip
 * @param {() => void} onExportExcel
 * @param {boolean} canCompare             whether the current date scope (TODAY/CUSTOM) supports a prior period
 * @param {boolean} compareEnabled
 * @param {() => void} onToggleCompare
 * @param {boolean} comparisonLoading
 * @param {string} comparisonLabel         e.g. "vs yesterday" / "vs prior 7d"
 * @param {Map} priorServiceLookup         key `${modality}|${serviceName}` → { grossRevenue, netRevenue, scanCount }
 * @param {{totalServices:number, totalScans:number, grossRevenue:number, netRevenue:number}} priorTotals
 */

const COLUMNS = [
  { key: 'serviceName',          label: 'SERVICE NAME',  align: 'left' },
  { key: 'scanCount',            label: 'SCAN VOL',      align: 'center', title: 'Number of times this service was performed in the selected range.' },
  { key: 'grossRevenue',         label: 'GROSS LIST (₹)', align: 'center', title: 'Pre-discount list price for this service.' },
  { key: 'referralCut',          label: 'COMMISSION (₹)', align: 'center', title: 'Referral commission accrued on this service, whether or not it has been paid out yet.' },
  { key: 'netRevenue',           label: 'NET YIELD (₹)', align: 'center', title: 'Billed amount after discounts, minus commission — what the centre actually keeps from this service.' },
  { key: 'avgValue',             label: 'AVG VALUE (₹)', align: 'center', title: 'Gross list price divided by scan volume — the average pre-discount price per scan.' },
  { key: 'collectionEfficiency', label: 'EFFICIENCY',    align: 'right', title: 'Share of this service\'s billed amount that has actually been collected so far.' },
];

const sortValue = (svc, key) => {
  switch (key) {
    case 'serviceName': return (svc.serviceName || '').toLowerCase();
    case 'avgValue': return (svc.scanCount || 0) > 0 ? (svc.grossRevenue || 0) / svc.scanCount : 0;
    default: return svc[key] || 0;
  }
};

const pctChange = (current, prior) => {
  if (!prior) return current > 0 ? null : 0;
  return ((current - prior) / prior) * 100;
};

function DeltaBadge({ pct }) {
  if (pct === null || pct === undefined || !isFinite(pct)) return null;
  const flat = Math.abs(pct) < 0.5;
  const up = pct > 0;
  const color = flat ? '#94a3b8' : up ? '#059669' : '#dc2626';
  const arrow = flat ? '·' : up ? '▲' : '▼';
  return (
    <span style={{ fontSize: '9px', fontWeight: 900, color, marginLeft: '6px', whiteSpace: 'nowrap' }}>
      {arrow} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export default function ServicePerformancePanel({
  isMobile, modalityGroupedServices, allServicesData, onExportExcel,
  canCompare = false, compareEnabled = false, onToggleCompare = () => {},
  comparisonLoading = false, comparisonLabel = '', priorServiceLookup = null, priorTotals = null,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState(null); // { key, dir: 'asc' | 'desc' }

  const showCompare = canCompare && compareEnabled && priorServiceLookup && !comparisonLoading;

  const toggleSort = (key) => {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) return { key, dir: key === 'serviceName' ? 'asc' : 'desc' };
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  // Filter (by search) then sort, within each modality group — keeps the
  // per-modality subtotal structure intact rather than flattening the list.
  const visibleGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return modalityGroupedServices
      .map(modGroup => {
        let services = modGroup.services || [];
        if (q) services = services.filter(s => (s.serviceName || '').toLowerCase().includes(q));
        if (sortConfig) {
          const { key, dir } = sortConfig;
          services = [...services].sort((a, b) => {
            const av = sortValue(a, key), bv = sortValue(b, key);
            if (av < bv) return dir === 'asc' ? -1 : 1;
            if (av > bv) return dir === 'asc' ? 1 : -1;
            return 0;
          });
        }
        return { ...modGroup, services };
      })
      .filter(modGroup => modGroup.services.length > 0);
  }, [modalityGroupedServices, searchQuery, sortConfig]);

  const kpiPrior = priorTotals || {};

  return (
    <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0 }}>SERVICE PERFORMANCE ANALYSIS</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search service…"
            style={{
              padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0',
              fontSize: '11px', fontWeight: 700, color: '#1e293b', outline: 'none',
              width: isMobile ? '140px' : '180px',
            }}
          />
          {canCompare && (
            <button
              onClick={onToggleCompare}
              title={comparisonLabel || 'Compare to the prior period'}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: compareEnabled ? '#eef2ff' : 'transparent',
                color: compareEnabled ? '#4f46e5' : '#64748b',
                border: `1px solid ${compareEnabled ? '#c7d2fe' : '#e2e8f0'}`,
                padding: '8px 14px', borderRadius: '10px', fontSize: '9px', fontWeight: 950,
                cursor: 'pointer', letterSpacing: '0.3px',
              }}
            >
              {compareEnabled ? '✓' : '⇄'} COMPARE{compareEnabled && comparisonLabel ? ` (${comparisonLabel.toUpperCase()})` : ''}
            </button>
          )}
          {modalityGroupedServices.length > 0 && (
            <button
              onClick={onExportExcel}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#0f52ba',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '9px',
                fontWeight: 950,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(15, 82, 186, 0.2)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              📥 EXPORT EXCEL
            </button>
          )}
        </div>
        </div>
        <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, margin: 0 }}>
          GROSS is the pre-discount list price for services performed — it should match Revenue's GROSS (LIST PRICE). NET YIELD is the actual billed amount (after discounts, i.e. Revenue's PATIENT BILL) minus real referral commission owed — it should track Revenue's CLINIC INCOME. For cash collected and other billing detail, see the Revenue tab.
        </p>
      </div>

      {compareEnabled && comparisonLoading && (
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8' }}>Loading comparison…</div>
      )}

      {/* Summary KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '16px' }}>
        {[{
          label: 'TOTAL SERVICES', value: allServicesData.length, color: '#4f46e5', bg: '#eef2ff', prior: kpiPrior.totalServices,
          title: 'Number of distinct service names billed in this range (a multi-service visit counts once per service, not once per visit).'
        }, {
          label: 'TOTAL SCANS', value: allServicesData.reduce((s, x) => s + (x.scanCount || 0), 0), color: '#0891b2', bg: '#e0f2fe', prior: kpiPrior.totalScans,
          title: 'Total scan volume across every service line — how many times a service was actually performed.'
        }, {
          label: 'GROSS (LIST PRICE)', value: allServicesData.reduce((s, x) => s + (x.grossRevenue || 0), 0), color: '#059669', bg: '#ecfdf5', prior: kpiPrior.grossRevenue, isMoney: true,
          title: 'Pre-discount list price for every service performed — matches Revenue\'s GROSS (LIST PRICE) KPI exactly.'
        }, {
          label: 'NET YIELD', value: allServicesData.reduce((s, x) => s + (x.netRevenue || 0), 0), color: '#dc2626', bg: '#fef2f2', prior: kpiPrior.netRevenue, isMoney: true,
          title: 'Actual billed amount after discounts, minus real referral commission owed — should track Revenue\'s CLINIC INCOME.'
        }].map((kpi, i) => (
          <div key={i} title={kpi.title} style={{ background: kpi.bg, borderRadius: '18px', padding: '18px', border: `1px solid ${kpi.color}22` }}>
            <div style={{ fontSize: '8px', fontWeight: 950, color: kpi.color, letterSpacing: '1px', marginBottom: '8px' }}>{kpi.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 950, color: '#1e293b', display: 'flex', alignItems: 'baseline' }}>
              {kpi.isMoney ? '₹' + Math.round(kpi.value).toLocaleString() : kpi.value}
              {showCompare && <DeltaBadge pct={pctChange(kpi.value, kpi.prior)} />}
            </div>
          </div>
        ))}
      </div>

      {visibleGroups.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '60px 30px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
            {searchQuery ? 'No services match your search' : 'No service data yet'}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, lineHeight: 1.6, maxWidth: '380px', margin: '0 auto' }}>
            {searchQuery ? 'Try a different service name.' : (
              <>Service-level analytics will appear here once invoices with multi-service appointments are recorded.
              Make sure the API is returning <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>modalityProfitability[].services</code> data.</>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {visibleGroups.map((modGroup, mIdx) => {
            const modalityColor = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0f766e'][mIdx % 7];
            const modalityGross = (modGroup.services || []).reduce((s, x) => s + (x.grossRevenue || 0), 0);
            const modalityNet = (modGroup.services || []).reduce((s, x) => s + (x.netRevenue || 0), 0);
            const modalityScans = (modGroup.services || []).reduce((s, x) => s + (x.scanCount || 0), 0);
            return (
              <div key={mIdx} style={{ background: 'white', borderRadius: '20px', border: `1px solid ${modalityColor}30`, overflow: 'hidden' }}>
                <div style={{ background: `linear-gradient(135deg, ${modalityColor}12 0%, ${modalityColor}06 100%)`, padding: '16px 22px', borderBottom: `1px solid ${modalityColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: modalityColor, color: 'white', padding: '6px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: 950, letterSpacing: '1px' }}>
                      {modGroup.modality}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                      {(modGroup.services || []).length} service{(modGroup.services || []).length !== 1 ? 's' : ''} · {modalityScans} scans
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>GROSS</div>
                      <div style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>₹{Math.round(modalityGross).toLocaleString()}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>NET YIELD</div>
                      <div style={{ fontSize: '13px', fontWeight: 950, color: '#059669' }}>₹{Math.round(modalityNet).toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
                        {COLUMNS.map((col) => {
                          const active = sortConfig?.key === col.key;
                          return (
                            <th
                              key={col.key}
                              onClick={() => toggleSort(col.key)}
                              title={col.title}
                              style={{
                                padding: '10px 14px', fontSize: '8px', fontWeight: 950,
                                color: active ? '#0f52ba' : '#94a3b8', letterSpacing: '0.5px',
                                textAlign: col.align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                              }}
                            >
                              {col.label}{active ? (sortConfig.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {(modGroup.services || []).map((svc, si) => {
                        const effColor = (svc.collectionEfficiency || 0) > 90 ? '#059669' : (svc.collectionEfficiency || 0) > 75 ? '#d97706' : '#dc2626';
                        const prior = showCompare ? priorServiceLookup.get(`${modGroup.modality}|${svc.serviceName}`) : null;
                        return (
                          <tr key={si} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: modalityColor, flexShrink: 0 }} />
                                {svc.serviceName || 'Unknown Service'}
                              </div>
                            </td>
                            <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 900, color: '#475569', textAlign: 'center' }}>
                              {svc.scanCount || 0}
                              {showCompare && <DeltaBadge pct={pctChange(svc.scanCount || 0, prior?.scanCount)} />}
                            </td>
                            <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 800, color: '#1e293b', textAlign: 'center' }}>
                              ₹{Math.round(svc.grossRevenue || 0).toLocaleString()}
                              {showCompare && <DeltaBadge pct={pctChange(svc.grossRevenue || 0, prior?.grossRevenue)} />}
                            </td>
                            <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 800, color: '#dc2626', textAlign: 'center' }}>-₹{Math.round(svc.referralCut || 0).toLocaleString()}</td>
                            <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 950, color: '#059669', textAlign: 'center' }}>
                              ₹{Math.round(svc.netRevenue || 0).toLocaleString()}
                              {showCompare && <DeltaBadge pct={pctChange(svc.netRevenue || 0, prior?.netRevenue)} />}
                            </td>
                            <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>₹{(svc.scanCount || 0) > 0 ? Math.round((svc.grossRevenue || 0) / svc.scanCount).toLocaleString() : '—'}</td>
                            <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 950, color: effColor }}>{(svc.collectionEfficiency || 0).toFixed(1)}%</span>
                                <div style={{ width: '80px', height: '4px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(svc.collectionEfficiency || 0, 100)}%`, height: '100%', background: effColor, borderRadius: '10px', transition: 'width 0.5s' }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: `${modalityColor}08`, borderTop: `2px solid ${modalityColor}20` }}>
                        <td style={{ padding: '11px 14px', fontSize: '10px', fontWeight: 950, color: modalityColor }}>SUBTOTAL — {modGroup.modality}</td>
                        <td style={{ padding: '11px 14px', fontSize: '10px', fontWeight: 950, color: '#1e293b', textAlign: 'center' }}>{modalityScans}</td>
                        <td style={{ padding: '11px 14px', fontSize: '10px', fontWeight: 950, color: '#1e293b', textAlign: 'center' }}>₹{Math.round(modalityGross).toLocaleString()}</td>
                        <td colSpan={2} style={{ padding: '11px 14px', fontSize: '10px', fontWeight: 950, color: '#059669', textAlign: 'center' }}>NET ₹{Math.round(modalityNet).toLocaleString()}</td>
                        <td colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
