import React from 'react';
import PatientInsightsPanel from './PatientInsightsPanel';

/**
 * PatientReferralTrendsPanel — the TRENDS tab: new-vs-returning patient
 * density bar chart, the physician ROI ledger table, and (online-only)
 * patient lifetime-value insights.
 *
 * @param {boolean} isMobile
 * @param {{patientBreakdown: Array, roiLedger: Array}} data
 * @param {object|null|undefined} patientLtv — matrix.patientLtv from the backend; undefined/null when offline
 */
export default function PatientReferralTrendsPanel({ isMobile, data, patientLtv }) {
  return (
    <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '30px' }}>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.3fr', gap: '30px' }}>
        {/* Stacked Patient Acquisition columns */}
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '20px' }}>NEW VS RETURNING CLINICAL DENSITY</h4>

          <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
            <svg viewBox="0 0 350 200" style={{ width: '100%', minWidth: '280px', height: 'auto', display: 'block' }}>
              {[0, 1, 2].map((_, idx) => (
                <line key={idx} x1="30" y1={25 + idx * 60} x2="330" y2={25 + idx * 60} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />
              ))}

              {data.patientBreakdown.map((item, idx) => {
                const barWidth = 16;
                const spacing = 48;
                const xStart = 45 + idx * spacing;

                const maxVal = Math.max(...data.patientBreakdown.map(d => d.newPatients + d.returnPatients), 50);

                const newHeight = (item.newPatients * 130) / maxVal;
                const retHeight = (item.returnPatients * 130) / maxVal;

                return (
                  <g key={idx}>
                    <rect x={xStart} y={160 - newHeight} width={barWidth} height={newHeight} fill="#0f52ba" />
                    <rect x={xStart} y={160 - newHeight - retHeight} width={barWidth} height={retHeight} fill="#06b6d4" />

                    <text x={xStart + barWidth / 2} y="180" fill="#64748b" fontSize="9px" fontWeight="900" textAnchor="middle">
                      {item.month}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
              <span style={{ width: '8px', height: '8px', background: '#0f52ba' }} /> NEW CLINICAL ACQUISITION
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
              <span style={{ width: '8px', height: '8px', background: '#06b6d4' }} /> RETURNING PATIENT SCAN
            </div>
          </div>
        </div>

        {/* ROI Table */}
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '20px' }}>CLINICAL PHYSICIAN ROI LEDGER</h4>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>REFERRING DOCTOR</th>
                  <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>GENERATED REVENUE (₹)</th>
                  <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>COMMISSIONS (₹)</th>
                  <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#0f52ba', textAlign: 'right' }}>ROI MULTIPLIER</th>
                </tr>
              </thead>
              <tbody>
                {data.roiLedger.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: 'white' }}>
                    <td style={{ padding: '12px', fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{row.name}</td>
                    <td style={{ padding: '12px', fontSize: '11px', fontWeight: 800, color: '#059669' }}>₹{row.revenue.toLocaleString()}</td>
                    <td style={{ padding: '12px', fontSize: '11px', fontWeight: 800, color: '#dc2626' }}>₹{row.commission.toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <span style={{ fontSize: '10px', fontWeight: 950, background: '#eff6ff', color: '#0f52ba', padding: '4px 10px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                        {Number.isFinite(row.ratio) ? `${row.ratio.toFixed(1)}x` : '∞'} ROI
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PatientInsightsPanel patientLtv={patientLtv} />

    </div>
  );
}
