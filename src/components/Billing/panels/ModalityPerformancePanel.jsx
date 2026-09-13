import React from 'react';

/**
 * ModalityPerformancePanel — the MODALITIES tab: gross-vs-net revenue bar
 * chart per modality, plus the full profitability matrix table.
 *
 * @param {Array} servicePerformanceData  per-modality rows: { modality, gross, net, payout, count, avgRevenue, efficiency }
 */
export default function ModalityPerformancePanel({ servicePerformanceData }) {
  return (
    <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '30px' }}>

      <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '20px' }}>MODALITY GROSS WORKLOAD VS NET CLINIC REALIZATION</h4>

        {/* Comparative SVG Vertical Bar Chart */}
        <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
          <svg viewBox="0 0 700 240" style={{ width: '100%', minWidth: '600px', height: 'auto', display: 'block' }}>
            {[0, 1, 2, 3].map((_, idx) => {
              const y = 30 + (idx * 140) / 3;
              return (
                <line key={idx} x1="50" y1={y} x2="680" y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />
              );
            })}

            {servicePerformanceData.map((item, idx) => {
              const barWidth = 16;
              const groupSpacing = 90;
              const xStart = 70 + idx * groupSpacing;

              const maxVal = Math.max(...servicePerformanceData.map(d => d.gross), 50000);
              const grossHeight = (item.gross * 140) / maxVal;
              const netHeight = (item.net * 140) / maxVal;

              return (
                <g key={idx}>
                  <rect x={xStart} y={170 - grossHeight} width={barWidth} height={grossHeight} fill="#0f52ba" rx="4" />
                  <rect x={xStart + barWidth + 6} y={170 - netHeight} width={barWidth} height={netHeight} fill="#10b981" rx="4" />

                  <text x={xStart + barWidth + 3} y="192" fill="#64748b" fontSize="9px" fontWeight="900" textAnchor="middle">
                    {item.modality}
                  </text>
                  <text x={xStart + barWidth + 3} y="208" fill="#94a3b8" fontSize="8px" fontWeight="800" textAnchor="middle">
                    {item.count} SCANS
                  </text>
                </g>
              );
            })}
          </svg>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '3px', background: '#0f52ba' }} /> GROSS REVENUE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '3px', background: '#10b981' }} /> NET REALIZED MARGIN
            </div>
          </div>
        </div>
      </div>

      {/* Profitability Matrix Grid */}
      <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '20px' }}>CLINICAL MODALITY PROFITABILITY MATRIX</h4>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left' }}>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>MODALITY</th>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textAlign: 'center' }}>SCAN VOL</th>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>GROSS BILLING (₹)</th>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>DISCOUNT/COMMISSION (₹)</th>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>NET CLINIC YIELD (₹)</th>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>AVG SCAN VALUE (₹)</th>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textAlign: 'right' }}>COLLECTION EFFICIENCY</th>
              </tr>
            </thead>
            <tbody>
              {servicePerformanceData.map((row, idx) => {
                const efficiencyColor = row.efficiency > 90 ? '#059669' : row.efficiency > 80 ? '#d97706' : '#dc2626';
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '15px', fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>
                      <span style={{ background: '#f1f5f9', color: '#4f46e5', padding: '4px 8px', borderRadius: '6px', fontSize: '9px', marginRight: '10px', fontWeight: 900 }}>{row.modality.slice(0, 3)}</span>
                      {row.modality}
                    </td>
                    <td style={{ padding: '15px', fontSize: '11px', fontWeight: 900, color: '#475569', textAlign: 'center' }}>{row.count}</td>
                    <td style={{ padding: '15px', fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>₹{row.gross.toLocaleString()}</td>
                    <td style={{ padding: '15px', fontSize: '11px', fontWeight: 800, color: '#dc2626' }}>-₹{row.payout.toLocaleString()}</td>
                    <td style={{ padding: '15px', fontSize: '11px', fontWeight: 950, color: '#059669' }}>₹{row.net.toLocaleString()}</td>
                    <td style={{ padding: '15px', fontSize: '11px', fontWeight: 800, color: '#475569' }}>₹{Math.round(row.avgRevenue).toLocaleString()}</td>
                    <td style={{ padding: '15px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: efficiencyColor }}>{row.efficiency.toFixed(1)}%</span>
                        <div style={{ width: '90px', height: '4px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                          <div style={{ width: `${row.efficiency}%`, height: '100%', background: efficiencyColor, borderRadius: '10px' }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
