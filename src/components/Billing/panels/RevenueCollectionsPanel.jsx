import React from 'react';
import BilledCollectedLineChart from '../charts/BilledCollectedLineChart';
import BreakdownDonutChart from '../charts/BreakdownDonutChart';

/**
 * RevenueCollectionsPanel — the REVENUE tab of AnalyticsHub: billed-vs-collected
 * trend, payment-mode breakdown, AR aging buckets, and the heuristic recovery
 * insight card. Pulled out of AnalyticsHub's inline JSX so this one report
 * card can be read, changed, and (eventually) tested on its own.
 *
 * @param {boolean} isMobile
 * @param {{chartTrend: Array, paymentModes: Record<string,number>, agingBuckets: object}} data
 * @param {Record<string,string>} paymentColors
 * @param {object} matrix  backend financial matrix (only used here for the advance-settled callout)
 * @param {{riskRatio: number, riskBadge: string, advice: string, totalDues: number}} recoveryInsight
 */
export default function RevenueCollectionsPanel({ isMobile, data, paymentColors, matrix, recoveryInsight }) {
  return (
    <div style={{ animation: 'fadeIn 0.2s', display: 'flex', flexDirection: 'column', gap: '30px' }}>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.7fr 1fr', gap: '30px' }}>
        {/* Line Chart Card */}
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0 }}>MONTHLY BILLED VS COLLECTED WORKLOAD</h4>
              <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', margin: 0 }}>Comparison of raw clinical billing volume vs realized cash inflows</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f52ba' }} /> BILLED
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} /> COLLECTED
              </div>
            </div>
          </div>
          <BilledCollectedLineChart data={data.chartTrend} />
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: '12px',
            marginTop: '20px',
            paddingTop: '18px',
            borderTop: '1px solid #e2e8f0'
          }}>
            <div style={{ flex: 1, background: 'white', padding: '12px 14px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f52ba', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, lineHeight: '1.4' }}>
                <strong style={{ color: '#1e293b' }}>Billed</strong> is the total scan work performed/invoiced.
              </span>
            </div>
            <div style={{ flex: 1, background: 'white', padding: '12px 14px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, lineHeight: '1.4' }}>
                <strong style={{ color: '#1e293b' }}>Collected</strong> is the actual cash/UPI received in the bank.
              </span>
            </div>
            <div style={{ flex: 1, background: 'white', padding: '12px 14px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f87171', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, lineHeight: '1.4' }}>
                The <strong style={{ color: '#1e293b' }}>Gap</strong> shows outstanding insurer claims or pending co-pays.
              </span>
            </div>
          </div>
        </div>

        {/* Donut Card */}
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', marginBottom: '15px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, textAlign: 'center' }}>PAYMENT METHOD REALIZATION</h4>
            <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginTop: '3px', margin: 0, textAlign: 'center' }}>Cash flow distribution across modes</p>
          </div>

          <BreakdownDonutChart dataBreakdown={data.paymentModes} colorMap={paymentColors} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', width: '100%', marginTop: '20px' }}>
            {Object.entries(data.paymentModes).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '8px 12px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: paymentColors[key], flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8' }}>{key}</span>
                  <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e293b' }}>₹{val.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Advances reconcile the screen: money settled from a patient's
              earlier advance is NOT fresh cash, so it's shown separately
              and excluded from the cash channels above. */}
          {Number(matrix?.collectionChannels?.advanceAmount) > 0 && (
            <div style={{ marginTop: '12px', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '9px 12px' }}>
                <span style={{ fontSize: '9px', fontWeight: 900, color: '#1e3a8a' }}>💳 SETTLED FROM ADVANCES</span>
                <span style={{ fontSize: '11px', fontWeight: 950, color: '#1d4ed8' }}>₹{Number(matrix.collectionChannels.advanceAmount).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8', marginTop: '5px', textAlign: 'center' }}>Paid from a patient&apos;s earlier advance — excluded from cash collected.</div>
            </div>
          )}
        </div>
      </div>

      {/* Aging and Recovery AI Card */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.7fr 1fr', gap: '30px' }}>
        <div style={{ background: 'white', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b', margin: 0, marginBottom: '15px' }}>ACCOUNTS RECEIVABLE AGING ANALYSIS</h4>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '15px' }}>
            {[
              { label: '0–30 DAYS (NORMAL)', val: data.agingBuckets.bucket30, risk: '🟢 LOW RISK', color: '#059669', bg: '#f0fdf4', border: '#dcfce7' },
              { label: '31–60 DAYS (FOLLOW-UP)', val: data.agingBuckets.bucket60, risk: '🟡 MODERATE', color: '#d97706', bg: '#fffbeb', border: '#fef3c7' },
              { label: '61–90 DAYS (ACTION)', val: data.agingBuckets.bucket90, risk: '🟠 SIGNIFICANT', color: '#ea580c', bg: '#fff7ed', border: '#ffedd5' },
              { label: '90+ DAYS (DELINQUENT)', val: data.agingBuckets.bucketPlus, risk: '🔴 CRITICAL', color: '#dc2626', bg: '#fff5f5', border: '#fed7d7' }
            ].map((bucket, idx) => (
              <div key={idx} style={{ background: bucket.bg, border: `1px solid ${bucket.border}`, padding: '16px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '8px', fontWeight: 950, color: bucket.color, letterSpacing: '0.5px' }}>{bucket.label}</span>
                <span style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b' }}>₹{bucket.val.toLocaleString()}</span>
                <span style={{ fontSize: '9px', fontWeight: 900, color: bucket.color }}>{bucket.risk}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '25px',
          borderRadius: '24px',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <span style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px' }}>AI Outstanding Realization Analyst</span>
              <span style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#38bdf8', padding: '3px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 950 }}>
                HEALTH SCORE: {(100 - recoveryInsight.riskRatio).toFixed(0)}%
              </span>
            </div>
            <div style={{ fontSize: '11px', fontWeight: 900, color: '#38bdf8', marginBottom: '8px' }}>
              STATUS: {recoveryInsight.riskBadge}
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', lineHeight: '1.6', fontWeight: 700, margin: 0 }}>
              {recoveryInsight.advice}
            </p>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px', marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>TOTAL DUES OUTSTANDING</span>
              <span style={{ fontSize: '14px', fontWeight: 950, color: '#f87171' }}>₹{recoveryInsight.totalDues.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CRITICAL EXPOSURE RATIO</span>
              <span style={{ fontSize: '14px', fontWeight: 950, color: '#f87171' }}>{recoveryInsight.riskRatio.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
