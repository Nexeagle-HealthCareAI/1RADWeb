import React from 'react';
import '../styles/global.css';

const RadiologyWorkflowBG = () => {
  return (
    <div className="workflow-bg-overlay">
      <svg className="workflow-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
        {/* Connection Paths */}
        <path d="M100,200 L300,400" className="workflow-line" />
        <path d="M300,400 L500,300" className="workflow-line" />
        <path d="M500,300 L700,500" className="workflow-line" />
        <path d="M700,500 L900,400" className="workflow-line" />
        <path d="M500,300 L500,700" className="workflow-line" />
        <path d="M500,700 L300,850" className="workflow-line" />
        <path d="M500,700 L700,850" className="workflow-line" />

        {/* Workflow Nodes */}
        <g className="workflow-node" transform="translate(100, 200)">
          <circle r="8" fill="#00f2fe" />
          <text x="15" y="5" className="node-label">REGISTRATION</text>
        </g>
        
        <g className="workflow-node" transform="translate(300, 400)">
          <circle r="8" fill="#00f2fe" />
          <text x="15" y="5" className="node-label">TRIAGE/VITALS</text>
        </g>

        <g className="workflow-node" transform="translate(500, 300)">
          <circle r="12" fill="#00f2fe" filter="url(#glow)" />
          <text x="20" y="5" className="node-label highlight">MODALITY SCAN (CT/MRI)</text>
        </g>

        <g className="workflow-node" transform="translate(700, 500)">
          <circle r="8" fill="#00f2fe" />
          <text x="15" y="5" className="node-label">PACS SYNC</text>
        </g>

        <g className="workflow-node" transform="translate(900, 400)">
          <circle r="8" fill="#00f2fe" />
          <text x="15" y="5" className="node-label">CLOUD ARCHIVE</text>
        </g>

        <g className="workflow-node" transform="translate(500, 700)">
          <circle r="10" fill="#00f2fe" />
          <text x="20" y="5" className="node-label highlight">AI ANALYSIS</text>
        </g>

        <g className="workflow-node" transform="translate(300, 850)">
          <circle r="8" fill="#00f2fe" />
          <text x="15" y="5" className="node-label">RADIOLOGIST REVIEW</text>
        </g>

        <g className="workflow-node" transform="translate(700, 850)">
          <circle r="8" fill="#00f2fe" />
          <text x="15" y="5" className="node-label">REPORT SIGNED</text>
        </g>

        {/* Filters */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  );
};

export default RadiologyWorkflowBG;
