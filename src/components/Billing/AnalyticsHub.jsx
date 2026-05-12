import React from 'react';

const AnalyticsHub = ({
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
  return (
    <div className="analytics-main" style={{ animation: 'fadeIn 0.3s' }}>
      {/* ANALYTICS CONTROL BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', background: 'white', padding: '20px 30px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>FINANCIAL_TREND_ANALYSIS</h3>
                <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Visualize performance across different temporal windows</p>
              </div>
              
              <div style={{ height: '30px', width: '1px', background: '#e2e8f0' }}></div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', letterSpacing: '1px' }}>GLOBAL_SCOPE:</span>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    {['TODAY', 'PAST', 'ALL', 'CUSTOM'].map(t => (
                      <button 
                        key={t}
                        onClick={() => setTimeFilter(t)}
                        style={{ 
                          padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                          background: timeFilter === t ? '#0f52ba' : 'transparent',
                          color: timeFilter === t ? 'white' : '#64748b',
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >{t}</button>
                    ))}
                </div>
                {timeFilter === 'CUSTOM' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.2s' }}>
                    <input 
                      type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                    />
                    <input 
                      type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}
                    />
                  </div>
                )}
              </div>
          </div>
      </div>

      {/* LIVE SCOPE SUMMARY (DYNAMIC) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
          <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>SCOPE_GROSS_REVENUE</p>
              <div style={{ fontSize: '24px', fontWeight: 950, color: '#1a1a2e' }}>₹{(liveStats?.totalGross || 0).toLocaleString()}</div>
              <div style={{ marginTop: '10px', fontSize: '9px', color: '#64748b', fontWeight: 800 }}>AGGREGATE INVOICED VOLUME</div>
          </div>
          <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>SCOPE_CASH_COLLECTED</p>
              <div style={{ fontSize: '24px', fontWeight: 950, color: '#059669' }}>₹{(liveStats?.totalRevenue || 0).toLocaleString()}</div>
              <div style={{ marginTop: '10px', fontSize: '9px', color: '#059669', fontWeight: 800 }}>REALIZED LIQUIDITY</div>
          </div>
          <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>SCOPE_TOTAL_EXPENSES</p>
              <div style={{ fontSize: '24px', fontWeight: 950, color: '#dc2626' }}>₹{(outflowStats?.totalOutflow || 0).toLocaleString()}</div>
              <div style={{ marginTop: '10px', fontSize: '9px', color: '#dc2626', fontWeight: 800 }}>OPERATIONAL & REFERRAL OUTFLOW</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '25px', borderRadius: '24px', color: 'white', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.2)' }}>
              <p style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px', marginBottom: '15px' }}>NET_SCOPE_MARGIN</p>
              <div style={{ fontSize: '24px', fontWeight: 950 }}>₹{((liveStats?.totalRevenue || 0) - (outflowStats?.totalOutflow || 0)).toLocaleString()}</div>
              <div style={{ marginTop: '10px', fontSize: '9px', color: (liveStats.totalRevenue - outflowStats.totalOutflow) >= 0 ? '#4ade80' : '#f87171', fontWeight: 800 }}>
                  {((liveStats.totalRevenue - outflowStats.totalOutflow) / (liveStats.totalRevenue || 1) * 100).toFixed(1)}% NET MARGIN
              </div>
          </div>
      </div>

      {/* MODALITY CONTRIBUTION SECTION */}
      <div style={{ background: 'white', borderRadius: '32px', border: '1px solid #e2e8f0', padding: '40px', boxShadow: '0 20px 50px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
              <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b', letterSpacing: '1px' }}>MODALITY_REVENUE_CONTRIBUTION</h3>
                  <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, marginTop: '4px' }}>Strategic breakdown of income by acquisition modality</p>
              </div>
              <div style={{ padding: '10px 20px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #f1f5f9', fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>
                  TOTAL_ACTIVE_CHANNELS: {matrix?.modalityBreakdown?.length || 0}
              </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '2px solid #f1f5f9' }}>
                          <th style={{ padding: '20px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>MODALITY</th>
                          <th style={{ padding: '20px 10px', fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>PERIOD_YIELD (₹)</th>
                          <th style={{ padding: '20px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>CONTRIBUTION</th>
                      </tr>
                  </thead>
                  <tbody>
                      {matrix?.modalityBreakdown?.filter(item => item).map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'all 0.2s' }}>
                              <td style={{ padding: '25px 10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                       <div style={{ width: '36px', height: '36px', borderRadius: '12px', background: '#f0f3fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 950, color: '#0f52ba' }}>
                                           {item.modality.slice(0, 2)}
                                       </div>
                                      <span style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>{item.modality}</span>
                                  </div>
                              </td>
                              <td style={{ padding: '25px 10px', fontSize: '16px', fontWeight: 950, color: '#1e293b' }}>₹{(item.rangeRevenue || 0).toLocaleString()}</td>
                              <td style={{ padding: '25px 10px', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                      <span style={{ fontSize: '14px', fontWeight: 950, color: '#0f52ba' }}>{(item.contributionPercentage || 0)}%</span>
                                      <div style={{ width: '120px', height: '6px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                          <div style={{ width: `${(item.contributionPercentage || 0)}%`, height: '100%', background: 'linear-gradient(90deg, #0f52ba, #60a5fa)', borderRadius: '10px' }}></div>
                                      </div>
                                  </div>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};

export default AnalyticsHub;
