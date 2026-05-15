import React, { useState } from 'react';
import NarrativeEditor from './NarrativeEditor';

const TemplateManager = ({ 
  templates, 
  isTemplateDrawerOpen, 
  setIsTemplateDrawerOpen, 
  editTemplate, 
  setEditTemplate, 
  handleSaveTemplate, 
  handleDeleteTemplate,
  isTemplateSaving,
  getLinkedService = () => null // Default mock if not provided
}) => {
  const [modalityFilter, setModalityFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const safeTemplates = Array.isArray(templates) ? templates : [];
  const filteredTemplates = safeTemplates.filter(t => {
    const tName = (t.name || t.Name || '');
    const tModality = (t.modality || t.Modality || '');
    const matchesModality = modalityFilter === 'ALL' || tModality === modalityFilter;
    const matchesSearch = tName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesModality && matchesSearch;
  });

  return (
    <div className="template-manager fade-in" style={{ padding: isMobile ? '10px' : '20px', height: '100%', display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '20px', overflow: 'hidden' }}>
      <div className="board-header" style={{ display: 'none' }}>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: isMobile ? '16px' : '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
        <div style={{ 
          padding: isMobile ? '15px' : '20px 30px', 
          background: '#f8fafc', 
          borderBottom: '1px solid #f1f5f9', 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'stretch' : 'center', 
          flexShrink: 0,
          gap: '15px'
        }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '10px' : '20px', alignItems: isMobile ? 'stretch' : 'center' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', whiteSpace: 'nowrap' }}>FILTER_MODALITY:</label>
              <select 
                value={modalityFilter}
                onChange={e => setModalityFilter(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 800, color: '#0f52ba', outline: 'none' }}
              >
                <option value="ALL">ALL_MODALITIES</option>
                {['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'PET-CT'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', whiteSpace: 'nowrap' }}>SEARCH:</label>
              <input 
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by name..."
                style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 800, outline: 'none', width: isMobile ? '100%' : '200px' }}
              />
            </div>
          </div>
          <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', textAlign: isMobile ? 'center' : 'right' }}>TOTAL_TEMPLATES: {filteredTemplates.length}</div>
        </div>

        <div style={{ flex: 1, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '600px' : 'auto' }}>
            <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>MODALITY</th>
                <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>TEMPLATE NAME</th>
                <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
            {filteredTemplates.map((t, idx) => {
              const tName = t.name || t.Name || '';
              const tModality = t.modality || t.Modality || '';
              const tId = t.id || t.Id;
              
              return (
                <tr key={tId || idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                  <td style={{ padding: '15px 30px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 950, color: 'white', background: '#334155', padding: '4px 10px', borderRadius: '6px' }}>{tModality}</span>
                  </td>
                  <td style={{ padding: '15px 30px', fontSize: '12px', fontWeight: 850, color: '#1e293b' }}>{tName.toUpperCase()}</td>
                  <td style={{ padding: '15px 30px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => { 
                          setEditTemplate({
                            id: tId,
                            name: tName,
                            modality: tModality,
                            content: t.content || t.Content || ''
                          }); 
                          setIsTemplateDrawerOpen(true); 
                        }} 
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '10px', fontWeight: 800 }}
                      >
                        EDIT
                      </button>
                      <button 
                        onClick={() => handleDeleteTemplate(tId)} 
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '10px', fontWeight: 800 }}
                      >
                        DEL
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

      {/* --- TEMPLATE EDITOR: WORD-LIKE PROTOCOL ARCHITECT --- */}
      {isTemplateDrawerOpen && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10, 22, 40, 0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 11000
        }} onClick={() => setIsTemplateDrawerOpen(false)}>
          
          <div style={{ 
            width: isMobile ? '100%' : '1000px', 
            height: isMobile ? '100%' : '95vh',
            background: '#f1f5f9', borderRadius: isMobile ? 0 : '24px', 
            display: 'flex', flexDirection: 'column', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.6)',
            overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)'
          }} onClick={e => e.stopPropagation()}>
            {/* Header: Institutional Blue */}
            <div style={{ padding: '20px 30px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '10px', fontWeight: 950, color: '#60a5fa', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Protocol_Architect_v3.2</h3>
                <div style={{ fontSize: '18px', fontWeight: 950 }}>{editTemplate.id ? 'RECONFIG_DIAGNOSTIC_PROTOCOL' : 'INIT_NEW_TEMPLATE_CORE'}</div>
              </div>
              <button onClick={() => setIsTemplateDrawerOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontSize: '22px' }}>&times;</button>
            </div>

            {/* Config Row (Static) */}
            <div style={{ padding: '20px 30px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '15px' : '30px', flexShrink: 0 }}>
              <div>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px' }}>TEMPLATE_NAME (IDENTIFIER)</label>
                <input 
                  type="text" required 
                  value={editTemplate.name} 
                  placeholder="e.g. CHEST_XRAY_NORMAL"
                  onChange={e => setEditTemplate({...editTemplate, name: e.target.value.toUpperCase()})}
                  style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', fontWeight: 800, outline: 'none', background: '#f8fafc' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px' }}>MODALITY_CONTEXT</label>
                <select 
                  value={editTemplate.modality} 
                  onChange={e => setEditTemplate({...editTemplate, modality: e.target.value})}
                  style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 700, background: 'white' }}
                >
                  {['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'PET-CT'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Word-like Editor Workspace (Scrollable Area) */}
            <div style={{ flex: 1, overflowY: 'auto', background: isMobile ? 'white' : '#e2e8f0', padding: isMobile ? '0' : '40px 20px' }}>
              <div style={{ 
                width: isMobile ? '100%' : '210mm',
                margin: isMobile ? '0' : '0 auto',
                background: 'white', 
                border: isMobile ? 'none' : '1px solid #cbd5e1', 
                boxShadow: isMobile ? 'none' : '0 10px 40px rgba(0,0,0,0.1)', 
                minHeight: isMobile ? '400px' : '297mm', 
                padding: isMobile ? '20px' : '80px 100px',
                flexShrink: 0
              }}>
                <NarrativeEditor 
                  content={editTemplate.content} 
                  onChange={(html) => setEditTemplate({...editTemplate, content: html})}
                  placeholder="Design your institutional report template here..."
                />
              </div>
            </div>

            {/* Footer Actions (Static) */}
            <div style={{ padding: '20px 30px', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '15px', flexShrink: 0 }}>
                <button onClick={() => setIsTemplateDrawerOpen(false)} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer', background: 'white' }}>ABORT</button>
                <button 
                  disabled={isTemplateSaving} 
                  onClick={handleSaveTemplate}
                  style={{ 
                    padding: '12px 30px', borderRadius: '10px', border: 'none', 
                    background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
                    boxShadow: '0 8px 25px rgba(15, 82, 186, 0.3)' 
                  }}
                >
                  {isTemplateSaving ? 'COMMITTING_PROTOCOL...' : 'SAVE REPORT PROTOCOL →'}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateManager;
