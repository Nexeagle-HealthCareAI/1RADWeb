import os

file_path = r"c:\Users\mtnoo\OneDrive\Desktop\1Rad\easyrad\src\pages\AdminBoard.jsx"

if not os.path.exists(file_path):
    print(f"Error: File {file_path} does not exist")
    exit(1)

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

idx = -1
for i, line in enumerate(lines):
    if "Operational Peak Matrix (Daily)" in line:
        idx = i
        break

if idx == -1:
    print("Error: Could not find 'Operational Peak Matrix (Daily)'")
    exit(1)

new_chart_code = """           <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '24px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                 <div>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Operational Peak Matrix (Daily)</div>
                    <div style={{ fontSize: '10px', fontWeight: 500, color: '#94a3b8', marginTop: '4px' }}>7-Day Rolling Scanner Inflow</div>
                 </div>
                 <div style={{ display: 'flex', gap: '15px', alignItems: 'center', fontSize: '9px', fontWeight: 950 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                       <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f52ba' }}></div>
                       <span style={{ color: '#64748b' }}>STANDARD</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                       <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626' }}></div>
                       <span style={{ color: '#64748b' }}>CRITICAL LIMIT</span>
                    </div>
                 </div>
              </div>

              <div style={{ position: 'relative', height: '170px', width: '100%' }}>
                 <svg viewBox="0 0 460 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    <defs>
                       {/* Smooth blue gradient for bars */}
                       <linearGradient id="barBlue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0f52ba" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#0f52ba" stopOpacity="0.15" />
                       </linearGradient>
                       {/* Smooth red gradient for peaks */}
                       <linearGradient id="barRed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#dc2626" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#dc2626" stopOpacity="0.15" />
                       </linearGradient>
                       {/* Drop shadow for glowing elements */}
                       <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feComposite in="SourceGraphic" in2="blur" operator="over" />
                       </filter>
                    </defs>

                    {/* Grid lines */}
                    <line x1="35" y1="40" x2="425" y2="40" stroke="#f1f5f9" strokeDasharray="4 4" />
                    <line x1="35" y1="100" x2="425" y2="100" stroke="#f1f5f9" strokeDasharray="4 4" />
                    <line x1="35" y1="160" x2="425" y2="160" stroke="#e2e8f0" strokeWidth="1.5" />

                    {/* Left Grid Values */}
                    <text x="18" y="44" fill="#94a3b8" fontSize="8" fontWeight="900" textAnchor="end">{Math.max(...(volumeTrends || []).map(v => v.count)) || 10}</text>
                    <text x="18" y="104" fill="#94a3b8" fontSize="8" fontWeight="900" textAnchor="end">{Math.round((Math.max(...(volumeTrends || []).map(v => v.count)) || 10) / 2)}</text>
                    <text x="18" y="164" fill="#94a3b8" fontSize="8" fontWeight="900" textAnchor="end">0</text>

                    {/* Columns and Interactive areas */}
                    {(volumeTrends || []).map((day, idx) => {
                       const maxVal = Math.max(...(volumeTrends || []).map(v => v.count)) || 1;
                       const x = idx * 65 + 35;
                       const barHeight = (day.count / maxVal) * 120;
                       const y = 160 - barHeight;
                       const isHovered = hoveredTrendIndex === idx;

                       return (
                          <g key={day.day || idx}>
                             {/* Background column slot for smooth interaction */}
                             <rect 
                                x={x - 25} 
                                y="20" 
                                width="50" 
                                height="155" 
                                fill="transparent" 
                                style={{ cursor: 'pointer' }}
                                onMouseEnter={() => setHoveredTrendIndex(idx)}
                                onMouseLeave={() => setHoveredTrendIndex(null)}
                             />
                             
                             {/* Dynamic Gradient Pillar */}
                             <rect 
                                x={x - 12} 
                                y={y} 
                                width="24" 
                                height={barHeight} 
                                rx="6" 
                                fill={day.isPeak ? "url(#barRed)" : "url(#barBlue)"}
                                stroke={isHovered ? (day.isPeak ? "#dc2626" : "#0f52ba") : "transparent"}
                                strokeWidth="1.5"
                                style={{ transition: 'all 0.2s ease-in-out' }}
                             />

                             {/* Day Label */}
                             <text 
                                x={x} 
                                y="180" 
                                fill={isHovered ? "#1e293b" : "#94a3b8"} 
                                fontSize="8.5" 
                                fontWeight="900" 
                                textAnchor="middle"
                                style={{ transition: 'fill 0.25s' }}
                             >
                                {(day.day || '').toUpperCase()}
                             </text>

                             {/* Value Label above Bar */}
                             <text 
                                x={x} 
                                y={y - 8} 
                                fill={isHovered ? (day.isPeak ? "#dc2626" : "#0f52ba") : "#1e293b"} 
                                fontSize="9.5" 
                                fontWeight="950" 
                                textAnchor="middle"
                                style={{ opacity: isHovered ? 1 : 0.7, transition: 'all 0.2s' }}
                             >
                                {day.count || 0}
                             </text>

                             {/* Visual Indicator of peak status */}
                             {day.isPeak && !isHovered && (
                                <circle 
                                   cx={x} 
                                   cy={y} 
                                   r="3" 
                                   fill="#dc2626" 
                                   stroke="white" 
                                   strokeWidth="1" 
                                />
                             )}
                          </g>
                       );
                    })}

                    {/* Interactive floating premium tooltip */}
                    {hoveredTrendIndex !== null && (() => {
                       const maxVal = Math.max(...(volumeTrends || []).map(v => v.count)) || 1;
                       const day = volumeTrends[hoveredTrendIndex];
                       const x = hoveredTrendIndex * 65 + 35;
                       const y = 160 - (day.count / maxVal) * 120;
                       return (
                          <g filter="url(#glow)">
                             <rect 
                                x={x - 45} 
                                y={y - 45} 
                                width="90" 
                                height="30" 
                                rx="8" 
                                fill="#1e293b" 
                             />
                             <text 
                                x={x} 
                                y={y - 27} 
                                fill="white" 
                                fontSize="8.5" 
                                fontWeight="950" 
                                textAnchor="middle"
                             >
                                {day.count} COMPLETED
                             </text>
                             <polygon 
                                points={`${x - 4},${y - 15} ${x + 4},${y - 15} ${x},${y - 11}`} 
                                fill="#1e293b" 
                             />
                          </g>
                       );
                    })()}
                 </svg>
              </div>
           </div>
"""

lines[idx - 1 : idx + 12] = [new_chart_code]

with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("Peak Matrix upgrade completed successfully!")
