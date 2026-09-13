import React from 'react';

/**
 * ServicePerformancePanel — the SERVICES tab: per-service (not just
 * per-modality) breakdown grouped under each modality, with an Excel export.
 *
 * @param {boolean} isMobile
 * @param {Array} modalityGroupedServices  modalities that actually have services, each with a .services[] list
 * @param {Array} allServicesData          flat sorted list, used only for the summary KPI strip
 * @param {() => void} onExportExcel
 */
export default function ServicePerformancePanel({ isMobile, modalityGroupedServices, allServicesData, onExportExcel }) {
  return (
    <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0 }}>SERVICE PERFORMANCE ANALYSIS</h4>
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

      {/* Summary KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '16px' }}>
        {[{
          label: 'TOTAL SERVICES', value: allServicesData.length, color: '#4f46e5', bg: '#eef2ff'
        }, {
          label: 'TOTAL SCANS', value: allServicesData.reduce((s, x) => s + (x.scanCount || 0), 0), color: '#0891b2', bg: '#e0f2fe'
        }, {
          label: 'GROSS BILLING', value: '₹' + Math.round(allServicesData.reduce((s, x) => s + (x.grossRevenue || 0), 0)).toLocaleString(), color: '#059669', bg: '#ecfdf5'
        }, {
          label: 'NET YIELD', value: '₹' + Math.round(allServicesData.reduce((s, x) => s + (x.netRevenue || 0), 0)).toLocaleString(), color: '#dc2626', bg: '#fef2f2'
        }].map((kpi, i) => (
          <div key={i} style={{ background: kpi.bg, borderRadius: '18px', padding: '18px', border: `1px solid ${kpi.color}22` }}>
            <div style={{ fontSize: '8px', fontWeight: 950, color: kpi.color, letterSpacing: '1px', marginBottom: '8px' }}>{kpi.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 950, color: '#1e293b' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {modalityGroupedServices.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '60px 30px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>No service data yet</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, lineHeight: 1.6, maxWidth: '380px', margin: '0 auto' }}>
            Service-level analytics will appear here once invoices with multi-service appointments are recorded.
            Make sure the API is returning <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>modalityProfitability[].services</code> data.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {modalityGroupedServices.map((modGroup, mIdx) => {
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
                        {['SERVICE NAME', 'SCAN VOL', 'GROSS (₹)', 'DISC/COMM (₹)', 'NET YIELD (₹)', 'AVG VALUE (₹)', 'EFFICIENCY'].map((h, hi) => (
                          <th key={hi} style={{ padding: '10px 14px', fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textAlign: hi === 6 ? 'right' : hi > 0 ? 'center' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(modGroup.services || []).map((svc, si) => {
                        const effColor = (svc.collectionEfficiency || 0) > 90 ? '#059669' : (svc.collectionEfficiency || 0) > 75 ? '#d97706' : '#dc2626';
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
                            <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 900, color: '#475569', textAlign: 'center' }}>{svc.scanCount || 0}</td>
                            <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 800, color: '#1e293b', textAlign: 'center' }}>₹{Math.round(svc.grossRevenue || 0).toLocaleString()}</td>
                            <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 800, color: '#dc2626', textAlign: 'center' }}>-₹{Math.round(svc.referralCut || 0).toLocaleString()}</td>
                            <td style={{ padding: '13px 14px', fontSize: '11px', fontWeight: 950, color: '#059669', textAlign: 'center' }}>₹{Math.round(svc.netRevenue || 0).toLocaleString()}</td>
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
