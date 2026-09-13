import React, { useState } from 'react';

/**
 * BilledCollectedLineChart
 * ─────────────────────────────────────────────────────────────────────────────
 * A two-series (billed vs. collected) SVG line chart with a hover tooltip
 * showing realization rate and outstanding dues for the hovered point.
 *
 * Extracted from AnalyticsHub.jsx's inline `drawLineChart()` — pure
 * presentation, no billing/domain logic, no dependency on the parent's
 * state. Owns its own hover state so it's a genuine drop-in component: any
 * screen with a { label, billed, collected } series can render this without
 * wiring anything up.
 *
 * @param {Array<{label: string, billed: number, collected: number}>} data
 */
export default function BilledCollectedLineChart({ data }) {
  const [hoveredPoint, setHoveredPoint] = useState(null); // { x, y, label, val, type, idx, otherVal }

  const width = 600;
  const height = 220;
  const paddingX = 60;
  const paddingY = 40;

  const chartWidth = width - paddingX - 30;
  const chartHeight = height - paddingY - 20;

  const maxVal = Math.max(...data.map(d => Math.max(d.billed, d.collected)), 50000);

  const pointsBilled = data.map((d, i) => {
    const x = paddingX + (data.length > 1 ? (i * chartWidth) / (data.length - 1) : chartWidth / 2);
    const y = paddingY + chartHeight - (d.billed * chartHeight) / maxVal;
    return { x, y, val: d.billed, label: d.label, type: 'Billed' };
  });

  const pointsCollected = data.map((d, i) => {
    const x = paddingX + (data.length > 1 ? (i * chartWidth) / (data.length - 1) : chartWidth / 2);
    const y = paddingY + chartHeight - (d.collected * chartHeight) / maxVal;
    return { x, y, val: d.collected, label: d.label, type: 'Collected' };
  });

  const pathBilled = `M ${pointsBilled.map(p => `${p.x},${p.y}`).join(' L ')}`;
  const pathCollected = `M ${pointsCollected.map(p => `${p.x},${p.y}`).join(' L ')}`;

  const gridTicks = 4;
  const gridLines = Array.from({ length: gridTicks }).map((_, idx) => {
    const y = paddingY + (idx * chartHeight) / (gridTicks - 1);
    const val = Math.round(maxVal - (idx * maxVal) / (gridTicks - 1));
    return { y, val };
  });

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: '500px', height: 'auto', display: 'block' }}>
        {gridLines.map((line, idx) => (
          <g key={idx}>
            <line x1={paddingX} y1={line.y} x2={width - 20} y2={line.y} stroke="#f1f5f9" strokeWidth={1.5} strokeDasharray="4,4" />
            <line x1={paddingX - 5} y1={line.y} x2={paddingX} y2={line.y} stroke="#cbd5e1" strokeWidth={1.5} />
            <text x={paddingX - 12} y={line.y + 3} fill="#64748b" fontSize="10px" fontWeight="800" textAnchor="end">
              ₹{line.val >= 100000
                ? `${(line.val / 100000).toFixed(1).replace(/\.0$/, '')}L`
                : line.val >= 1000
                ? `${(line.val / 1000).toFixed(1).replace(/\.0$/, '')}k`
                : line.val}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = paddingX + (i * chartWidth) / (data.length - 1);
          return (
            <g key={i}>
              <line x1={x} y1={paddingY + chartHeight} x2={x} y2={paddingY + chartHeight + 5} stroke="#cbd5e1" strokeWidth={1.5} />
              <text x={x} y={paddingY + chartHeight + 18} fill="#64748b" fontSize="10px" fontWeight="900" textAnchor="middle">
                {d.label}
              </text>
            </g>
          );
        })}

        <line x1={paddingX} y1={paddingY - 10} x2={paddingX} y2={paddingY + chartHeight} stroke="#cbd5e1" strokeWidth={1.5} />
        <line x1={paddingX} y1={paddingY + chartHeight} x2={width - 20} y2={paddingY + chartHeight} stroke="#cbd5e1" strokeWidth={1.5} />

        <path d={pathBilled} fill="none" stroke="#0f52ba" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathCollected} fill="none" stroke="#10b981" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

        {pointsBilled.map((p, i) => (
          <circle
            key={`b-${i}`}
            cx={p.x}
            cy={p.y}
            r={hoveredPoint?.idx === i && hoveredPoint?.type === 'Billed' ? 7 : 5}
            fill="#0f52ba"
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'pointer', transition: 'r 0.2s' }}
            onMouseEnter={() => setHoveredPoint({ ...p, idx: i, otherVal: pointsCollected[i].val })}
            onMouseLeave={() => setHoveredPoint(null)}
          />
        ))}

        {pointsCollected.map((p, i) => (
          <circle
            key={`c-${i}`}
            cx={p.x}
            cy={p.y}
            r={hoveredPoint?.idx === i && hoveredPoint?.type === 'Collected' ? 7 : 5}
            fill="#10b981"
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'pointer', transition: 'r 0.2s' }}
            onMouseEnter={() => setHoveredPoint({ ...p, idx: i, otherVal: pointsBilled[i].val })}
            onMouseLeave={() => setHoveredPoint(null)}
          />
        ))}
      </svg>

      {hoveredPoint && (() => {
        const billedVal = hoveredPoint.type === 'Billed' ? hoveredPoint.val : hoveredPoint.otherVal;
        const collectedVal = hoveredPoint.type === 'Collected' ? hoveredPoint.val : hoveredPoint.otherVal;
        const outstandingVal = Math.max(0, billedVal - collectedVal);
        const realizationPct = billedVal > 0 ? ((collectedVal / billedVal) * 100).toFixed(1) : '0.0';

        return (
          <div style={{
            position: 'absolute',
            top: `${hoveredPoint.y - 100}px`,
            left: `${hoveredPoint.x - 85}px`,
            background: 'rgba(15, 23, 42, 0.96)',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '12px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.12)',
            zIndex: 100,
            pointerEvents: 'none',
            fontSize: '11px',
            fontWeight: 800,
            animation: 'fadeIn 0.15s ease-out'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '9px', fontWeight: 900, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {hoveredPoint.label} REALIZATIONS
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f52ba' }} />
              <span>BILLED: <b style={{ color: '#60a5fa' }}>₹{billedVal.toLocaleString()}</b></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              <span>COLLECTED: <b style={{ color: '#34d399' }}>₹{collectedVal.toLocaleString()}</b></span>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                <span style={{ color: '#94a3b8', fontSize: '9px' }}>REALIZATION RATE:</span>
                <span style={{ color: '#34d399', fontWeight: 900 }}>{realizationPct}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                <span style={{ color: '#94a3b8', fontSize: '9px' }}>OUTSTANDING DUES:</span>
                <span style={{ color: '#f87171', fontWeight: 900 }}>₹{outstandingVal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
