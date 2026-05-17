import React from 'react';

const AnalyticsHub = ({
  isMobile,
  liveStats,
  outflowStats,
  matrix,
  timeFilter,
  setTimeFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate
}) => {
  const [activeSection, setActiveSection] = React.useState('METRICS'); // 'METRICS', 'MODALITIES', 'REFERRERS'

  // Master performance metrics mapping from matrix with fallback to live calculations
  const perf = matrix?.performance || {};
  const refContribution = matrix?.referralContribution || {};

  const grossRevenue = perf.grossRevenue !== undefined ? perf.grossRevenue : (liveStats?.totalGross || 0);
  const cashCollected = perf.cashCollected !== undefined ? perf.cashCollected : (liveStats?.totalRevenue || 0);
  const totalExpenses = outflowStats?.totalOutflow || 0;
  const netMargin = cashCollected - totalExpenses;
  const yieldRate = cashCollected > 0 ? (netMargin / cashCollected * 100) : 0;

  return (
    <div className="analytics-main" style={{ animation: 'fadeIn 0.3s' }}>
      {/* ANALYTICS CONTROL BAR */}
      <div style={{ 
        marginBottom: '30px', 
        background: 'white', 
        padding: isMobile ? '20px' : '20px 30px', 
        borderRadius: isMobile ? '16px' : '24px', 
        border: '1px solid #e2e8f0', 
        boxShadow: '0 4px 20px rgba(0,0,0,0.02)' 
      }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '20px' : '30px' }}>
              <div>
                <h3 style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: 950, color: '#1e293b' }}>FINANCIAL_TRENDS</h3>
                {!isMobile && <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Performance across temporal windows</p>}
              </div>
              
              {!isMobile && <div style={{ height: '30px', width: '1px', background: '#e2e8f0' }}></div>}

              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '10px' : '15px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>SCOPE:</span>
                <div style={{ 
                  display: 'flex', 
                  background: '#f1f5f9', 
                  padding: '3px', 
                  borderRadius: '10px', 
                  border: '1px solid #e2e8f0',
                  overflowX: 'auto',
                  width: isMobile ? '100%' : 'auto'
                }}>
                    {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
                      <button 
                        key={t}
                        onClick={() => setTimeFilter(t)}
                        style={{ 
                          padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                          background: timeFilter === t ? '#0f52ba' : 'transparent',
                          color: timeFilter === t ? 'white' : '#64748b',
                          cursor: 'pointer', transition: 'all 0.2s',
                          flex: isMobile ? 1 : 'none',
                          whiteSpace: 'nowrap'
                        }}
                      >{t}</button>
                    ))}
                </div>
                {timeFilter === 'CUSTOM' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.2s', width: isMobile ? '100%' : 'auto' }}>
                    <input 
                      type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                    />
                    <input 
                      type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                    />
                  </div>
                )}
              </div>
          </div>
      </div>

      {/* KPI SUMMARY (TOP ROW MASTER BOARDS) */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? '15px' : '20px', marginBottom: '30px' }}>
          <div style={{ background: 'white', padding: isMobile ? '20px' : '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>GROSS_REVENUE</p>
              <div style={{ fontSize: isMobile ? '22px' : '24px', fontWeight: 950, color: '#1a1a2e' }}>₹{grossRevenue.toLocaleString()}</div>
          </div>
          <div style={{ background: 'white', padding: isMobile ? '20px' : '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>CASH_COLLECTED</p>
              <div style={{ fontSize: isMobile ? '22px' : '24px', fontWeight: 950, color: '#059669' }}>₹{cashCollected.toLocaleString()}</div>
          </div>
          <div style={{ background: 'white', padding: isMobile ? '20px' : '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>TOTAL_EXPENSES</p>
              <div style={{ fontSize: isMobile ? '22px' : '24px', fontWeight: 950, color: '#dc2626' }}>₹{totalExpenses.toLocaleString()}</div>
          </div>
          <div style={{ 
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', 
            padding: isMobile ? '20px' : '25px', 
            borderRadius: '24px', 
            color: 'white', 
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.2)' 
          }}>
              <p style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px', marginBottom: '12px' }}>NET_MARGIN</p>
              <div style={{ fontSize: isMobile ? '22px' : '24px', fontWeight: 950, color: netMargin >= 0 ? '#4ade80' : '#f87171' }}>
                ₹{netMargin.toLocaleString()}
              </div>
              <div style={{ marginTop: '8px', fontSize: '9px', color: yieldRate >= 0 ? '#4ade80' : '#f87171', fontWeight: 800 }}>
                  {yieldRate.toFixed(1)}% YIELD RATE
              </div>
          </div>
      </div>

      {/* ADVANCED SECTION TAB SWITCHER */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '20px', 
        borderBottom: '1px solid #e2e8f0', 
        paddingBottom: '12px',
        overflowX: 'auto'
      }}>
        {[
          { id: 'METRICS', label: '🏆 CLINICAL HEALTH & LEAKAGE' },
          { id: 'MODALITIES', label: '🔬 MODALITY MARGIN ANALYSIS' },
          { id: 'REFERRERS', label: '🤝 PARTNER INTEGRATION RATIO' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            style={{
              padding: '10px 20px',
              borderRadius: '12px',
              border: 'none',
              fontSize: '10px',
              fontWeight: 950,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.3s',
              background: activeSection === tab.id ? '#0f52ba' : 'transparent',
              color: activeSection === tab.id ? 'white' : '#64748b',
              boxShadow: activeSection === tab.id ? '0 4px 12px rgba(15, 82, 186, 0.15)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT AREAS */}
      <div style={{ background: 'white', borderRadius: isMobile ? '20px' : '32px', border: '1px solid #e2e8f0', padding: isMobile ? '20px' : '35px', boxShadow: '0 20px 50px rgba(0,0,0,0.03)' }}>
          
          {/* SECTION 1: CLINICAL HEALTH & LEAKAGE */}
          {activeSection === 'METRICS' && (
            <div style={{ animation: 'fadeIn 0.2s' }}>
              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', letterSpacing: '0.5px' }}>CLINICAL REVENUE LEAKAGE & OUTFLOW RATE</h4>
                <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, marginTop: '2px' }}>Leakage mapping from clinical concessions and overhead expenditures</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CONCESSION_LEAKAGE</span>
                  <div style={{ fontSize: '18px', fontWeight: 950, color: '#e11d48', marginTop: '10px' }}>
                    ₹{(perf.concessionLeakage || 0).toLocaleString()}
                  </div>
                  <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '10px', marginTop: '12px', overflow: 'hidden' }}>
                    <div style={{ width: `${perf.leakagePercentage || 0}%`, height: '100%', background: '#e11d48', borderRadius: '10px' }}></div>
                  </div>
                  <p style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, marginTop: '8px' }}>
                    {perf.leakagePercentage || 0}% discount leakage of gross billing
                  </p>
                </div>

                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>OUTSTANDING_RECEIVABLE</span>
                  <div style={{ fontSize: '18px', fontWeight: 950, color: '#d97706', marginTop: '10px' }}>
                    ₹{(perf.outstandingAR || 0).toLocaleString()}
                  </div>
                  <p style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, marginTop: '22px' }}>
                    Pending patient bills to be realized
                  </p>
                </div>

                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>AVERAGE_STUDY_TICKET</span>
                  <div style={{ fontSize: '18px', fontWeight: 950, color: '#0f52ba', marginTop: '10px' }}>
                    ₹{(perf.averageRevenuePerScan || 0).toLocaleString()}
                  </div>
                  <p style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, marginTop: '22px' }}>
                    Across {perf.totalScansCount || 0} registered study bookings
                  </p>
                </div>

                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '8px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>EXPENSE_BURN_RATE</span>
                  <div style={{ fontSize: '18px', fontWeight: 950, color: '#4f46e5', marginTop: '10px' }}>
                    {perf.expenseRatio || 0}%
                  </div>
                  <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '10px', marginTop: '12px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, perf.expenseRatio || 0)}%`, height: '100%', background: '#4f46e5', borderRadius: '10px' }}></div>
                  </div>
                  <p style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, marginTop: '8px' }}>
                    Burn against cash collection
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: MODALITY PROFITABILITY MATRIX */}
          {activeSection === 'MODALITIES' && (
            <div style={{ animation: 'fadeIn 0.2s' }}>
              <div style={{ marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', letterSpacing: '0.5px' }}>MODALITY MARGIN INTELLIGENCE MATRIX</h4>
                  <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, marginTop: '2px' }}>Modality revenue breakdown after subtracting referring partner cuts</p>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '700px' : 'auto' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #f1f5f9' }}>
                      <th style={{ padding: '12px 10px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>MODALITY</th>
                      <th style={{ padding: '12px 10px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', textAlign: 'center' }}>SCAN VOL</th>
                      <th style={{ padding: '12px 10px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>GROSS BILLING (₹)</th>
                      <th style={{ padding: '12px 10px', fontSize: '9px', fontWeight: 950, color: '#e11d48', letterSpacing: '1px' }}>PARTNER DEDUCTION (₹)</th>
                      <th style={{ padding: '12px 10px', fontSize: '9px', fontWeight: 950, color: '#059669', letterSpacing: '1px' }}>NET CLINIC YIELD (₹)</th>
                      <th style={{ padding: '12px 10px', fontSize: '9px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', textAlign: 'right' }}>NET MARGIN (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(matrix?.modalityProfitability || []).map((item, idx) => {
                      const barColor = item.marginPercentage > 75 ? '#10b981' : item.marginPercentage > 50 ? '#f59e0b' : '#ef4444';
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '15px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f0f3fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 950, color: '#0f52ba' }}>
                                {item.modality.slice(0, 2)}
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{item.modality}</span>
                            </div>
                          </td>
                          <td style={{ padding: '15px 10px', fontSize: '11px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>
                            {item.scanCount}
                          </td>
                          <td style={{ padding: '15px 10px', fontSize: '11px', fontWeight: 900, color: '#1e293b' }}>
                            ₹{(item.grossRevenue || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '15px 10px', fontSize: '11px', fontWeight: 950, color: '#e11d48' }}>
                            ₹{(item.referralCut || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '15px 10px', fontSize: '11px', fontWeight: 950, color: '#059669' }}>
                            ₹{(item.netRevenue || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '15px 10px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 950, color: barColor }}>{item.marginPercentage}%</span>
                              <div style={{ width: '100px', height: '4px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, Math.max(0, item.marginPercentage))}%`, height: '100%', background: barColor, borderRadius: '10px' }}></div>
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
          )}

          {/* SECTION 3: REFERRAL CONTRIBUTION AND SOURCE BALANCING */}
          {activeSection === 'REFERRERS' && (
            <div style={{ animation: 'fadeIn 0.2s' }}>
              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', letterSpacing: '0.5px' }}>PARTNER INTEGRATION & SOURCE SPLIT</h4>
                <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, marginTop: '2px' }}>Physician referred clinical revenue vs. Direct walk-in billing ratios</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '30px' }}>
                {/* REFERRED CARD */}
                <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '25px', borderRadius: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 950, color: '#d97706', letterSpacing: '1px' }}>REFERRED_BUSINESS</span>
                    <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 950 }}>
                      {refContribution.referralRatio || 0}% WEIGHT
                    </span>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 950, color: '#b45309' }}>
                    ₹{(refContribution.referredRevenue || 0).toLocaleString()}
                  </div>
                  <p style={{ fontSize: '10px', color: '#78350f', fontWeight: 700, marginTop: '6px' }}>
                    Generated across {refContribution.referredScansCount || 0} partner referred study bookings
                  </p>
                </div>

                {/* DIRECT CARD */}
                <div style={{ background: '#f0fdf4', border: '1px solid #dcfce7', padding: '25px', borderRadius: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 950, color: '#16a34a', letterSpacing: '1px' }}>DIRECT_WALKINS</span>
                    <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 950 }}>
                      {(100 - (refContribution.referralRatio || 0)).toFixed(1)}% WEIGHT
                    </span>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 950, color: '#15803d' }}>
                    ₹{(refContribution.directRevenue || 0).toLocaleString()}
                  </div>
                  <p style={{ fontSize: '10px', color: '#14532d', fontWeight: 700, marginTop: '6px' }}>
                    Generated across {refContribution.directScansCount || 0} direct patient check-ins
                  </p>
                </div>
              </div>

              {/* DUAL DENSITY INDICATOR */}
              <div style={{ marginTop: '30px', padding: '20px', background: '#f8fafc', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', letterSpacing: '1.5px' }}>INTEGRATION_DENSITY_RATIO</span>
                <div style={{ display: 'flex', height: '16px', background: '#16a34a', borderRadius: '8px', overflow: 'hidden', marginTop: '12px' }}>
                  <div style={{ 
                    width: `${refContribution.referralRatio || 0}%`, 
                    height: '100%', 
                    background: '#d97706', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '8px',
                    fontWeight: 950,
                    color: 'white'
                  }}>
                    {refContribution.referralRatio > 15 ? `REFERRED (${refContribution.referralRatio}%)` : ''}
                  </div>
                  <div style={{ 
                    flex: 1, 
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '8px',
                    fontWeight: 950,
                    color: 'white'
                  }}>
                    {refContribution.referralRatio < 85 ? `DIRECT (${(100 - (refContribution.referralRatio || 0)).toFixed(1)}%)` : ''}
                  </div>
                </div>
                <p style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, marginTop: '8px', textAlign: 'center' }}>
                  A balanced density reduces clinical reliance on specific physician channels and drives organic growth.
                </p>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default AnalyticsHub;
