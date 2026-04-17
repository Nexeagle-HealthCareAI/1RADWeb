import React from 'react';

const TacticalWorkflow = () => {
  const steps = [
    { id: 'capture', label: 'DATA CAPTURE', sub: 'MODALITY ACQUISITION', delay: '0s' },
    { id: 'sync', label: 'CLOUD SYNC', sub: 'DICOM TRANSMISSION', delay: '1s' },
    { id: 'ai', label: 'AI ANALYSIS', sub: 'NEURAL INFERENCE', delay: '2s' },
    { id: 'review', label: 'RAD REVIEW', sub: 'CLINICAL EVALUATION', delay: '3s' },
    { id: 'dispatch', label: 'DISPATCH', sub: 'REPORT DISTRIBUTION', delay: '4s' }
  ];

  return (
    <div className="tactical-pipeline-container">
      <div className="pipeline-track">
        <div className="pipeline-data-pulse" />
      </div>
      
      {steps.map((step, index) => (
        <div 
          key={step.id} 
          className="pipeline-node-wrapper"
          style={{ animationDelay: step.delay }}
        >
          <div className="node-indicator">
            <div className="node-core" />
            <div className="node-halo" />
          </div>
          
          <div className="node-content">
            <div className="node-main-label">{step.label}</div>
            <div className="node-sub-label">{step.sub}</div>
          </div>
          
          {index < steps.length - 1 && (
            <div className="node-connector" style={{ animationDelay: step.delay }} />
          )}
        </div>
      ))}

      <style dangerouslySetInnerHTML={{ __html: `
        .tactical-pipeline-container {
          display: flex;
          flex-direction: column;
          gap: 40px;
          margin-top: 50px;
          padding-left: 20px;
          position: relative;
        }

        .pipeline-track {
          position: absolute;
          left: 27px;
          top: 10px;
          bottom: 10px;
          width: 2px;
          background: rgba(0, 242, 254, 0.1);
          overflow: hidden;
        }

        .pipeline-data-pulse {
          position: absolute;
          width: 100%;
          height: 50px;
          background: linear-gradient(to bottom, transparent, #00f2fe, transparent);
          animation: dataPulse 4s infinite linear;
        }

        .pipeline-node-wrapper {
          display: flex;
          align-items: center;
          gap: 25px;
          opacity: 0;
          animation: nodeFadeIn 0.8s forwards;
        }

        .node-indicator {
          width: 16px;
          height: 16px;
          position: relative;
          z-index: 2;
        }

        .node-core {
          width: 100%;
          height: 100%;
          background: #00f2fe;
          border-radius: 50%;
          box-shadow: 0 0 10px #00f2fe;
        }

        .node-halo {
          position: absolute;
          top: -4px;
          left: -4px;
          right: -4px;
          bottom: -4px;
          border: 1px solid rgba(0, 242, 254, 0.5);
          border-radius: 50%;
          animation: haloPulse 2s infinite ease-out;
        }

        .node-content {
          display: flex;
          flex-direction: column;
        }

        .node-main-label {
          font-size: 13px;
          font-weight: 900;
          color: #fff;
          letter-spacing: 2px;
        }

        .node-sub-label {
          font-size: 9px;
          color: #00f2fe;
          letter-spacing: 1px;
          text-transform: uppercase;
          opacity: 0.6;
          font-family: monospace;
        }

        @keyframes dataPulse {
          0% { top: -10%; }
          100% { top: 110%; }
        }

        @keyframes nodeFadeIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes haloPulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}} />
    </div>
  );
};

export default TacticalWorkflow;
