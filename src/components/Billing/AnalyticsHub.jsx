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

      {/* KPI SUMMARY */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? '15px' : '20px', marginBottom: '30px' }}>
          <div style={{ background: 'white', padding: isMobile ? '20px' : '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>GROSS_REVENUE</p>
              <div style={{ fontSize: isMobile ? '22px' : '24px', fontWeight: 950, color: '#1a1a2e' }}>₹{(liveStats?.totalGross || 0).toLocaleString()}</div>
          </div>
          <div style={{ background: 'white', padding: isMobile ? '20px' : '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>CASH_COLLECTED</p>
              <div style={{ fontSize: isMobile ? '22px' : '24px', fontWeight: 950, color: '#059669' }}>₹{(liveStats?.totalRevenue || 0).toLocaleString()}</div>
          </div>
          <div style={{ background: 'white', padding: isMobile ? '20px' : '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <p style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>TOTAL_EXPENSES</p>
              <div style={{ fontSize: isMobile ? '22px' : '24px', fontWeight: 950, color: '#dc2626' }}>₹{(outflowStats?.totalOutflow || 0).toLocaleString()}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: isMobile ? '20px' : '25px', borderRadius: '24px', color: 'white', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.2)' }}>
              <p style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px', marginBottom: '12px' }}>NET_MARGIN</p>
              <div style={{ fontSize: isMobile ? '22px' : '24px', fontWeight: 950 }}>₹{((liveStats?.totalRevenue || 0) - (outflowStats?.totalOutflow || 0)).toLocaleString()}</div>
              <div style={{ marginTop: '8px', fontSize: '9px', color: '#4ade80', fontWeight: 800 }}>
                  {((liveStats.totalRevenue - outflowStats.totalOutflow) / (liveStats.totalRevenue || 1) * 100).toFixed(1)}% YIELD
              </div>
          </div>
      </div>

      {/* MODALITY CONTRIBUTION */}
      <div style={{ background: 'white', borderRadius: isMobile ? '20px' : '32px', border: '1px solid #e2e8f0', padding: isMobile ? '20px' : '40px', boxShadow: '0 20px 50px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: '30px', gap: '15px' }}>
              <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', letterSpacing: '1px' }}>MODALITY_CONTRIBUTION</h3>
                  {!isMobile && <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, marginTop: '4px' }}>Breakdown of income by acquisition modality</p>}
              </div>
              <div style={{ padding: '8px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9', fontSize: '10px', fontWeight: 950, color: '#0f52ba', textAlign: 'center' }}>
                  CHANNELS: {matrix?.modalityBreakdown?.length || 0}
              </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '600px' : 'auto' }}>
                  <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '2px solid #f1f5f9' }}>
                          <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>MODALITY</th>
                          <th style={{ padding: '15px 10px', fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>YIELD (₹)</th>
                          <th style={{ padding: '15px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px' }}>WEIGHT</th>
                      </tr>
                  </thead>
                  <tbody>
                      {matrix?.modalityBreakdown?.filter(item => item).map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                              <td style={{ padding: '15px 10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                       <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#f0f3fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 950, color: '#0f52ba' }}>
                                           {item.modality.slice(0, 2)}
                                       </div>
                                      <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{item.modality}</span>
                                  </div>
                              </td>
                              <td style={{ padding: '15px 10px', fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>₹{(item.rangeRevenue || 0).toLocaleString()}</td>
                              <td style={{ padding: '15px 10px', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                      <span style={{ fontSize: '12px', fontWeight: 950, color: '#0f52ba' }}>{(item.contributionPercentage || 0)}%</span>
                                      <div style={{ width: isMobile ? '80px' : '120px', height: '5px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
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
