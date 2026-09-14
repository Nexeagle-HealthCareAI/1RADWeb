import React from 'react';

const riskColor = (level) => {
  const k = String(level || '').toUpperCase();
  if (k === 'CRITICAL') return { bg: '#fff5f5', border: '#fed7d7', text: '#dc2626' };
  if (k === 'ELEVATED') return { bg: '#fffbeb', border: '#fef3c7', text: '#d97706' };
  return { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b' };
};

const segmentColor = (tier) => {
  const k = String(tier || '').toUpperCase();
  if (k.includes('HIGH')) return '#059669';
  if (k.includes('MID')) return '#d97706';
  return '#64748b';
};

/**
 * PatientInsightsPanel — patient lifetime value, value segmentation, cohort
 * retention, and churn-risk alerts. This surfaces data the backend
 * (PatientLtvCalculator) already computes on every /finance/matrix request
 * but that, until now, no UI ever displayed — confirmed via git history to
 * be pre-existing dead computation, not something dropped during the recent
 * AnalyticsHub refactor.
 *
 * Online-only: there is no offline fallback for this panel. The underlying
 * math (per-patient cohort grouping, month-over-month retention, churn
 * detection) is a materially bigger client-side undertaking than the other
 * fallback calculators in financialMatrixFallback.js, and duplicating it
 * untested would trade "no data offline" for "possibly wrong data offline" —
 * the worse failure mode for a lifetime-value figure. Shows an explanatory
 * empty state instead of guessing.
 *
 * @param {object|null|undefined} patientLtv — matrix.patientLtv from the backend
 */
export default function PatientInsightsPanel({ patientLtv }) {
  if (!patientLtv) {
    return (
      <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: '28px', marginBottom: '10px' }}>📶</div>
        <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: '0 0 6px 0' }}>PATIENT INSIGHTS NEED A LIVE CONNECTION</h4>
        <p style={{ fontSize: '11px', fontWeight: 700, margin: 0 }}>Lifetime value, segments, and churn alerts are calculated on the server and aren't cached for offline use.</p>
      </div>
    );
  }

  const { averageOrderValue = 0, purchaseFrequency = 0, estimatedLifetimeValue = 0, segments = [], retentionHeatmap = [], churnAlerts = [] } = patientLtv;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Headline stats */}
      <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '4px' }}>PATIENT LIFETIME VALUE</h4>
        <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', marginBottom: '20px' }}>
          Rough estimate from the currently selected date range — extrapolates 3 years forward from the average order value × visit frequency <em>within that range</em>. Narrow the date filter (e.g. last 12 months) for a more realistic projection; "All Time" will overstate it.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px' }}>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '6px' }}>AVG ORDER VALUE</div>
            <div style={{ fontSize: '18px', fontWeight: 950, color: '#1e293b' }}>₹{Math.round(averageOrderValue).toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '6px' }}>VISIT FREQUENCY</div>
            <div style={{ fontSize: '18px', fontWeight: 950, color: '#1e293b' }}>{purchaseFrequency.toFixed(2)}×</div>
          </div>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', marginBottom: '6px' }}>EST. LIFETIME VALUE</div>
            <div style={{ fontSize: '18px', fontWeight: 950, color: '#0f52ba' }}>₹{Math.round(estimatedLifetimeValue).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Value segments */}
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '18px' }}>PATIENT VALUE SEGMENTS</h4>
          {segments.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>No patients in the active scope.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {segments.map((seg, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 900, color: '#1e293b' }}>
                    <span>{seg.tier} <span style={{ color: '#94a3b8', fontWeight: 700 }}>({seg.patientCount})</span></span>
                    <span>₹{Math.round(seg.totalRevenue).toLocaleString()} · {seg.percentage.toFixed(0)}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ width: `${seg.percentage}%`, height: '100%', background: segmentColor(seg.tier), borderRadius: '10px' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Churn alerts */}
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '4px' }}>CHURN RISK ALERTS</h4>
          <p style={{ fontSize: '9.5px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', marginBottom: '16px' }}>Patients 45–180 days since their last visit, worth a follow-up call.</p>
          {churnAlerts.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>No patients currently at churn risk.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {churnAlerts.map((alert, idx) => {
                const c = riskColor(alert.riskLevel);
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: '14px', padding: '10px 14px' }}>
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 900, color: '#1e293b' }}>{alert.patientName}</div>
                      <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748b', marginTop: '2px' }}>{alert.lastModality} · {alert.daysSinceLastScan} days ago</div>
                    </div>
                    <span style={{ fontSize: '8.5px', fontWeight: 950, padding: '4px 10px', borderRadius: '8px', color: c.text, background: 'white', border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>{alert.riskLevel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Retention cohort heatmap */}
      {retentionHeatmap.length > 0 && (
        <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '4px' }}>MONTHLY COHORT RETENTION</h4>
          <p style={{ fontSize: '9.5px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', marginBottom: '16px' }}>Of patients who first visited in a given month, what share came back in each of the following 5 months.</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>COHORT</th>
                  <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', textAlign: 'center' }}>SIZE</th>
                  {[0, 1, 2, 3, 4, 5].map(m => (
                    <th key={m} style={{ padding: '10px 12px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', textAlign: 'center' }}>M{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retentionHeatmap.map((cohort, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 900, color: '#1e293b' }}>{cohort.cohortMonth}</td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: '#64748b', textAlign: 'center' }}>{cohort.size}</td>
                    {(cohort.retentionRates || []).map((rate, ri) => {
                      const intensity = Math.min(1, rate / 100);
                      return (
                        <td key={ri} style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', minWidth: '38px', padding: '4px 6px', borderRadius: '6px',
                            fontSize: '10px', fontWeight: 900,
                            background: `rgba(15, 82, 186, ${0.08 + intensity * 0.35})`,
                            color: intensity > 0.5 ? '#0f172a' : '#475569',
                          }}>{rate.toFixed(0)}%</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
