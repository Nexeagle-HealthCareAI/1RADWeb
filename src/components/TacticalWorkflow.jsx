import React from 'react';

const steps = [
  { id: 'capture',  label: 'DATA',     sub: 'CAPTURE',  x: 28,  y: 22 },
  { id: 'sync',     label: 'SYNC',     sub: 'CLOUD',    x: 94,  y: 66 },
  { id: 'pacs',     label: 'PACS',     sub: 'STORAGE',  x: 160, y: 22 },
  { id: 'ai',       label: 'AI',       sub: 'ANALYSIS', x: 226, y: 66 },
  { id: 'review',   label: 'RAD',      sub: 'REVIEW',   x: 292, y: 22 },
  { id: 'dispatch', label: 'DISPATCH', sub: 'REPORT',   x: 358, y: 66 },
];

const PATH = `M 28,22 L 94,66 L 160,22 L 226,66 L 292,22 L 358,66`;

const diamond = (cx, cy, r = 8) =>
  `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;

const TacticalWorkflow = () => (
  <div style={{
    width: '100%',
    background: 'rgba(0,242,254,0.03)',
    border: '1px solid rgba(0,242,254,0.12)',
    borderRadius: '12px',
    padding: '14px 16px 12px',
    backdropFilter: 'blur(8px)',
    position: 'relative',
    overflow: 'hidden',
  }}>
    {/* Corner glow accent */}
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '80px', height: '80px',
      background: 'radial-gradient(circle at 0% 0%, rgba(0,242,254,0.08), transparent 70%)',
      pointerEvents: 'none',
    }} />
    <div style={{
      position: 'absolute', bottom: 0, right: 0,
      width: '80px', height: '80px',
      background: 'radial-gradient(circle at 100% 100%, rgba(0,242,254,0.06), transparent 70%)',
      pointerEvents: 'none',
    }} />

    {/* Header */}
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '10px',
    }}>
      <span style={{
        fontSize: '7.5px', fontWeight: 800, letterSpacing: '2.5px',
        color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase',
      }}>
        Radiology Pipeline
      </span>
      {/* Live dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <div style={{
          width: '5px', height: '5px', borderRadius: '50%',
          background: '#00f2fe', boxShadow: '0 0 6px rgba(0,242,254,0.9)',
          animation: 'livePulse 1.8s infinite ease-in-out',
        }} />
        <span style={{ fontSize: '7px', color: 'rgba(0,242,254,0.5)', letterSpacing: '1px', fontFamily: 'monospace' }}>
          LIVE
        </span>
      </div>
    </div>

    {/* SVG Zigzag */}
    <svg viewBox="0 0 386 92" width="100%" style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id="zgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#00f2fe" stopOpacity="0.05" />
          <stop offset="50%"  stopColor="#00f2fe" stopOpacity="0.5"  />
          <stop offset="100%" stopColor="#00f2fe" stopOpacity="0.05" />
        </linearGradient>
        <filter id="zgGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <path id="zgMotion" d={PATH} fill="none" stroke="none" />
      </defs>

      {/* Base dim track */}
      <polyline
        points="28,22 94,66 160,22 226,66 292,22 358,66"
        fill="none" stroke="rgba(0,242,254,0.1)" strokeWidth="1.5" strokeLinecap="round"
      />

      {/* Animated sweep */}
      <polyline
        points="28,22 94,66 160,22 226,66 292,22 358,66"
        fill="none" stroke="url(#zgGrad)" strokeWidth="1.5" strokeLinecap="round"
        strokeDasharray="70 520" strokeDashoffset="520"
      >
        <animate attributeName="stroke-dashoffset" from="590" to="-70" dur="3.2s" repeatCount="indefinite" calcMode="linear" />
      </polyline>

      {/* Animated ball */}
      <circle r="4" fill="#00f2fe" filter="url(#zgGlow)" opacity="0.95">
        <animateMotion dur="3.2s" repeatCount="indefinite" calcMode="linear">
          <mpath href="#zgMotion" />
        </animateMotion>
      </circle>

      {/* Nodes */}
      {steps.map((step, i) => {
        const isTop = step.y < 44;
        return (
          <g key={step.id}>
            {/* Pulsing halo */}
            <polygon
              points={diamond(step.x, step.y, 12)}
              fill="none" stroke="rgba(0,242,254,0.18)" strokeWidth="0.8" opacity="0"
            >
              <animate attributeName="opacity"
                values="0.7;0;0.7" dur="2.4s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
              <animate attributeName="points"
                values={`${diamond(step.x, step.y, 11)};${diamond(step.x, step.y, 17)};${diamond(step.x, step.y, 11)}`}
                dur="2.4s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
            </polygon>

            {/* Diamond */}
            <polygon
              points={diamond(step.x, step.y, 7)}
              fill="rgba(0,242,254,0.1)" stroke="#00f2fe" strokeWidth="1.1"
              filter="url(#zgGlow)"
            >
              <animate attributeName="fill"
                values="rgba(0,242,254,0.1);rgba(0,242,254,0.25);rgba(0,242,254,0.1)"
                dur="2.4s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
            </polygon>

            {/* Centre dot */}
            <circle cx={step.x} cy={step.y} r="2.2" fill="#00f2fe" opacity="0.95" />

            {/* Step number */}
            <text
              x={step.x}
              y={isTop ? step.y - 20 : step.y + 22}
              textAnchor="middle"
              fontSize="8" fontWeight="800"
              fill="rgba(255,255,255,0.7)" letterSpacing="1.2"
              fontFamily="Inter, sans-serif"
            >{step.label}</text>

            <text
              x={step.x}
              y={isTop ? step.y - 11 : step.y + 30}
              textAnchor="middle"
              fontSize="5.5" fontWeight="600"
              fill="#00f2fe" letterSpacing="0.6" opacity="0.5"
              fontFamily="monospace"
            >{step.sub}</text>
          </g>
        );
      })}
    </svg>

    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes livePulse {
        0%, 100% { opacity: 0.6; transform: scale(1); }
        50%       { opacity: 1;   transform: scale(1.35); }
      }
    `}} />
  </div>
);

export default TacticalWorkflow;
