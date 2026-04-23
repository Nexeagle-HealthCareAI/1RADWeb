import React, { useState } from 'react';

const ReportingPage = () => {
  const [activeTab, setActiveTab] = useState('Narrative');
  const [editorText, setEditorText] = useState('');
  const [impression, setImpression] = useState('NORMAL STUDY.');

  return (
    <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* Header */}
      <header style={{ height: '60px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>📋 DIAGNOSTIC REPORTING</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>Patient: John Doe | Study: USG Abdomen</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>← Back</button>
          <button style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>Save Draft</button>
          <button style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>Finalize</button>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel - DICOM Viewer */}
        <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '14px', borderRight: '1px solid #e2e8f0' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📡</div>
            <div>DICOM Viewer</div>
            <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>Upload DICOM files to view</div>
          </div>
        </div>

        {/* Right Panel - Editor */}
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: '1px solid #e2e8f0' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 20px' }}>
            <button 
              onClick={() => setActiveTab('Narrative')}
              style={{ 
                padding: '12px 20px', 
                border: 'none', 
                background: 'transparent', 
                cursor: 'pointer',
                borderBottom: activeTab === 'Narrative' ? '2px solid #2563eb' : 'none',
                color: activeTab === 'Narrative' ? '#2563eb' : '#64748b',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              Narrative
            </button>
            <button 
              onClick={() => setActiveTab('Structured')}
              style={{ 
                padding: '12px 20px', 
                border: 'none', 
                background: 'transparent', 
                cursor: 'pointer',
                borderBottom: activeTab === 'Structured' ? '2px solid #2563eb' : 'none',
                color: activeTab === 'Structured' ? '#2563eb' : '#64748b',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              Structured
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {activeTab === 'Narrative' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Findings</label>
                  <textarea 
                    value={editorText}
                    onChange={(e) => setEditorText(e.target.value)}
                    placeholder="Enter your findings here..."
                    style={{ 
                      flex: 1, 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '8px', 
                      padding: '12px', 
                      fontSize: '14px', 
                      fontFamily: 'inherit',
                      resize: 'none',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', display: 'block' }}>Impression</label>
                  <textarea 
                    value={impression}
                    onChange={(e) => setImpression(e.target.value)}
                    placeholder="Enter your impression here..."
                    style={{ 
                      width: '100%', 
                      height: '100px',
                      border: '1px solid #e2e8f0', 
                      borderRadius: '8px', 
                      padding: '12px', 
                      fontSize: '14px', 
                      fontFamily: 'inherit',
                      resize: 'none',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
            )}

            {activeTab === 'Structured' && (
              <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', display: 'block' }}>Liver</label>
                  <textarea placeholder="Normal size and echotexture..." style={{ width: '100%', height: '80px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', fontSize: '13px', resize: 'none', outline: 'none' }} />
                </div>

                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', display: 'block' }}>Gallbladder</label>
                  <textarea placeholder="Normal wall thickness..." style={{ width: '100%', height: '80px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', fontSize: '13px', resize: 'none', outline: 'none' }} />
                </div>

                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', display: 'block' }}>Kidneys</label>
                  <textarea placeholder="Normal size and position..." style={{ width: '100%', height: '80px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', fontSize: '13px', resize: 'none', outline: 'none' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportingPage;
