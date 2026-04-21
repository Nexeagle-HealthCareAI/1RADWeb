import React, { useState, useMemo } from 'react';
import useAuth from '../auth/useAuth';

const INITIAL_FINANCIALS = {
  totalRevenue: 1254300,
  pendingInvoices: 48,
  realizationRate: 94.2,
  averageTicket: 3450,
  recentTransactions: [
    { id: 'TX-9021', patient: 'Karan Mehra', study: 'MRI Brain', amount: 8500, status: 'PAID', date: '2026-04-20 10:15' },
    { id: 'TX-9020', patient: 'Anjali Sharma', study: 'CT Chest', amount: 4200, status: 'PENDING', date: '2026-04-20 09:45' },
    { id: 'TX-9019', patient: 'Rahul Gupta', study: 'X-RAY Pelvis', amount: 1200, status: 'PAID', date: '2026-04-20 09:12' },
  ]
};

export default function BillingPage() {
  const { activeCenter } = useAuth();
  const [financials] = useState(INITIAL_FINANCIALS);

  return (
    <div className="billing-page" style={{ padding: '40px', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header Section */}
      <div className="board-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-1px', marginBottom: '8px' }}>
            FINANCIAL REVENUE HUB
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ 
              background: 'var(--tactical-indigo)', color: 'white', padding: '4px 10px', 
              borderRadius: '6px', fontSize: '10px', fontWeight: 900, letterSpacing: '1px' 
            }}>
              {activeCenter?.name?.toUpperCase() || 'CORE HUB'}
            </span>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
              Fiscal Year 2026-27 | Real-time Revenue Synthesis
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>EXPORT LEDGER</button>
          <button style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', background: '#0f52ba', color: 'white', fontWeight: 800, fontSize: '12px', cursor: 'pointer', boxShadow: '0 8px 20px rgba(15, 82, 186, 0.2)' }}>+ GENERATE INVOICE</button>
        </div>
      </div>

      {/* KPI HUD */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '25px', marginBottom: '40px' }}>
        <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>GROSS REALIZATION</p>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#1a1a2e' }}>₹{(financials.totalRevenue).toLocaleString()}</div>
          <div style={{ marginTop: '10px', fontSize: '11px', color: '#2ecc71', fontWeight: 800 }}>▲ 12.4% vs Last Month</div>
        </div>
        <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>PENDING INVOICES</p>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#f39c12' }}>{financials.pendingInvoices}</div>
          <div style={{ marginTop: '10px', fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Required Clearance: Phase 1</div>
        </div>
        <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>COLLECTION RATE</p>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#0f52ba' }}>{financials.realizationRate}%</div>
          <div style={{ marginTop: '10px', fontSize: '11px', color: '#0f52ba', fontWeight: 800 }}>OPTIMAL OPERATIONAL STATUS</div>
        </div>
        <div className="kpi-card" style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <p style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '15px' }}>AVG ORDER VALUE</p>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#1a1a2e' }}>₹{financials.averageTicket}</div>
          <div style={{ marginTop: '10px', fontSize: '11px', color: '#888', fontWeight: 600 }}>Normalized across all modalities</div>
        </div>
      </div>

      <div className="content-main" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
        {/* Ledger Section */}
        <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
           <h3 style={{ fontSize: '14px', fontWeight: 950, marginBottom: '25px' }}>SYNCED TRANSACTION LOG</h3>
           <table style={{ width: '100%', borderCollapse: 'collapse' }}>
             <thead>
               <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                 <th style={{ padding: '15px 0', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>TRANSACTION ID</th>
                 <th style={{ padding: '15px 0', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>ENTITY</th>
                 <th style={{ padding: '15px 0', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>STUDY DATA</th>
                 <th style={{ padding: '15px 0', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>QUANTUM</th>
                 <th style={{ padding: '15px 0', fontSize: '10px', fontWeight: 950, color: '#94a3b8' }}>STATUS</th>
               </tr>
             </thead>
             <tbody>
               {financials.recentTransactions.map(tx => (
                 <tr key={tx.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                   <td style={{ padding: '20px 0', fontSize: '12px', fontWeight: 900, color: '#0f52ba', fontFamily: 'monospace' }}>{tx.id}</td>
                   <td style={{ padding: '20px 0', fontSize: '13px', fontWeight: 700 }}>{tx.patient}</td>
                   <td style={{ padding: '20px 0', fontSize: '12px', color: '#64748b' }}>{tx.study}</td>
                   <td style={{ padding: '20px 0', fontSize: '13px', fontWeight: 950 }}>₹{tx.amount}</td>
                   <td style={{ padding: '20px 0' }}>
                      <span style={{ 
                        padding: '4px 10px', borderRadius: '6px', fontSize: '9px', fontWeight: 950,
                        background: tx.status === 'PAID' ? '#f0fdf4' : '#fff7ed',
                        color: tx.status === 'PAID' ? '#16a34a' : '#ea580c'
                      }}>
                        {tx.status}
                      </span>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
        </div>

        {/* Tactical Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          <div style={{ background: '#1a1a2e', borderRadius: '24px', padding: '30px', color: 'white' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 950, marginBottom: '20px' }}>SYSTEM ALERTS</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '16px', borderLeft: '3px solid #f39c12' }}>
                <p style={{ fontSize: '11px', fontWeight: 800 }}>REVENUE LEAKAGE DETECTED</p>
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>4 Appointments missing finalized billing codes.</p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '16px', borderLeft: '3px solid #2ecc71' }}>
                <p style={{ fontSize: '11px', fontWeight: 800 }}>BATCH PROCESSING DONE</p>
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>Daily synchronization with clearing house complete.</p>
              </div>
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '24px', padding: '30px', border: '1px solid #e2e8f0' }}>
             <h3 style={{ fontSize: '12px', fontWeight: 950, color: '#0f52ba', letterSpacing: '1px', marginBottom: '15px' }}>REVENUE MODALITY SPLIT</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { name: 'MRI', val: 65, color: '#0f52ba' },
                  { name: 'CT', val: 25, color: '#70d6ff' },
                  { name: 'X-RAY', val: 10, color: '#ff70a6' }
                ].map(m => (
                  <div key={m.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 800, marginBottom: '5px' }}>
                      <span>{m.name}</span>
                      <span>{m.val}%</span>
                    </div>
                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px' }}>
                      <div style={{ width: `${m.val}%`, height: '100%', background: m.color, borderRadius: '3px' }}></div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
