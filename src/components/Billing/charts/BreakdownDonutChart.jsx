import React, { useState } from 'react';

/**
 * BreakdownDonutChart
 * ─────────────────────────────────────────────────────────────────────────────
 * A generic SVG donut chart for a { key: amount } breakdown, with a hover
 * state that swaps the centre label between "total" and the hovered
 * segment's own value/share.
 *
 * Extracted from AnalyticsHub.jsx's inline `drawDonutChart()` — used there
 * for payment-mode and discount-vector breakdowns, but takes no billing
 * domain knowledge: any { key: amount } object + a colour map renders.
 *
 * @param {Record<string, number>} dataBreakdown  e.g. { CASH: 1000, UPI: 500 }
 * @param {Record<string, string>} colorMap       e.g. { CASH: '#64748b', UPI: '#06b6d4' }
 */
export default function BreakdownDonutChart({ dataBreakdown, colorMap }) {
  const [hoveredSegment, setHoveredSegment] = useState(null);

  const entries = Object.entries(dataBreakdown).filter(([, val]) => val > 0);
  const total = entries.reduce((acc, [, val]) => acc + val, 0);

  const size = 180;
  const center = size / 2;
  const radius = 60;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercentage = 0;

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={radius} fill="transparent" stroke="#f1f5f9" strokeWidth={strokeWidth} />
        {entries.map(([key, val], idx) => {
          const percentage = (val / total) * 100;
          const strokeDashoffset = circumference - (percentage / 100) * circumference;
          const rotation = (accumulatedPercentage / 100) * 360;
          accumulatedPercentage += percentage;

          const isHovered = hoveredSegment === key;

          return (
            <circle
              key={idx}
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={colorMap[key] || '#cbd5e1'}
              strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform={`rotate(${rotation - 90} ${center} ${center})`}
              style={{ cursor: 'pointer', transition: 'stroke-width 0.2s, stroke 0.2s', transformOrigin: 'center' }}
              onMouseEnter={() => setHoveredSegment(key)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          );
        })}
      </svg>

      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        {hoveredSegment ? (
          <>
            <span style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>
              {hoveredSegment}
            </span>
            <span style={{ fontSize: '15px', fontWeight: 950, color: colorMap[hoveredSegment] }}>
              ₹{dataBreakdown[hoveredSegment].toLocaleString()}
            </span>
            <span style={{ fontSize: '8px', fontWeight: 900, color: '#64748b' }}>
              {((dataBreakdown[hoveredSegment] / total) * 100).toFixed(1)}% SHARE
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '8px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.5px' }}>
              TOTAL VALUE
            </span>
            <span style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b' }}>
              ₹{total.toLocaleString()}
            </span>
            <span style={{ fontSize: '8px', fontWeight: 800, color: '#64748b' }}>
              {entries.length} SEGMENTS
            </span>
          </>
        )}
      </div>
    </div>
  );
}
