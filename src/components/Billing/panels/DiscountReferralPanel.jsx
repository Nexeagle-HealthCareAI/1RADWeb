import React from 'react';
import BreakdownDonutChart from '../charts/BreakdownDonutChart';

/**
 * DiscountReferralPanel — the DISCOUNTS tab: discount-vector donut, top
 * referring-physician commission bars, and the concession/margin leakage
 * audit table.
 *
 * @param {boolean} isMobile
 * @param {{discounts: Record<string,number>, topRecipients: Array, leakageTable: Array}} data
 * @param {Record<string,string>} discountColors
 */
export default function DiscountReferralPanel({ isMobile, data, discountColors }) {
  return (
    <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '30px' }}>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', gap: '30px' }}>
        {/* Discount Donut Allocation */}
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', marginBottom: '15px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, textAlign: 'center' }}>DISCOUNT & CONCESSION LEAKAGE ALLOCATION</h4>
            <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', margin: 0, textAlign: 'center' }}>Distribution of approved patient margin cuts by categories</p>
          </div>

          <BreakdownDonutChart dataBreakdown={data.discounts} colorMap={discountColors} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', width: '100%', marginTop: '20px' }}>
            {Object.entries(data.discounts).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '8px 12px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: discountColors[key], flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8' }}>{key}</span>
                  <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b' }}>₹{val.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Horizontal Payout Bar Chart */}
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '20px' }}>TOP REFERRING PHYSICIAN COMMISSION BALANCE</h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {data.topRecipients.map((ref, idx) => {
              const maxRecip = Math.max(...data.topRecipients.map(r => r.amount), 1000);
              const pct = (ref.amount / maxRecip) * 100;
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b' }}>{ref.name}</span>
                    <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>₹{ref.amount.toLocaleString()}</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #0f52ba, #3b82f6)', borderRadius: '10px', transition: 'width 0.5s ease-out' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Auditor discount leakage table */}
      <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '5px' }}>CONCESSION & MARGIN AUDITOR DIRECTORY</h4>
        <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginBottom: '20px' }}>Real-time leakage detector tracking doctors approving or receiving above-average margin discounts</p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left' }}>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>DOCTOR</th>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textAlign: 'center' }}>AVG DISCOUNT (%)</th>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>TOTAL DISCOUNT (₹)</th>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px' }}>TOTAL BILLED WORKLOAD (₹)</th>
                <th style={{ padding: '12px 15px', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '0.5px', textAlign: 'right' }}>AUDITOR STATUS</th>
              </tr>
            </thead>
            <tbody>
              {data.leakageTable.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '15px', fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{row.name}</td>
                  <td style={{ padding: '15px', fontSize: '11px', fontWeight: 950, color: row.color, textAlign: 'center' }}>{row.avgRate.toFixed(1)}%</td>
                  <td style={{ padding: '15px', fontSize: '11px', fontWeight: 800, color: '#475569' }}>₹{row.totalDisc.toLocaleString()}</td>
                  <td style={{ padding: '15px', fontSize: '11px', fontWeight: 800, color: '#475569' }}>₹{row.totalBilled.toLocaleString()}</td>
                  <td style={{ padding: '15px', textAlign: 'right' }}>
                    <span style={{ fontSize: '9px', fontWeight: 950, padding: '4px 10px', borderRadius: '8px', background: `${row.color}15`, color: row.color, border: `1px solid ${row.color}30` }}>
                      {row.badge}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
