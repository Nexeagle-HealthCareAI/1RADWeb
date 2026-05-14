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

  const safeTemplates = Array.isArray(templates) ? templates : [];
  const filteredTemplates = safeTemplates.filter(t => {
    const tName = (t.name || t.Name || '');
    const tModality = (t.modality || t.Modality || '');
    const matchesModality = modalityFilter === 'ALL' || tModality === modalityFilter;
    const matchesSearch = tName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesModality && matchesSearch;
  });

  return (
    <div className="template-manager fade-in" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
      <div className="board-header" style={{ display: 'none' }}>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
        <div style={{ padding: '20px 30px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#64748b' }}>FILTER_MODALITY:</label>
              <select 
                value={modalityFilter}
                onChange={e => setModalityFilter(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 800, color: '#0f52ba', outline: 'none' }}
              >
                <option value="ALL">ALL_MODALITIES</option>
                {['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'PET-CT'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <label style={{ fontSize: '9px', fontWeight: 950, color: '#64748b' }}>SEARCH:</label>
              <input 
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by name..."
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 800, outline: 'none', width: '200px' }}
              />
            </div>
          </div>
          <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8' }}>TOTAL_TEMPLATES: {filteredTemplates.length}</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                        EDIT_PROTOCOL
                      </button>
                      <button 
                        onClick={() => handleDeleteTemplate(tId)} 
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '10px', fontWeight: 800 }}
                      >
                        DELETE
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

      {/* --- TEMPLATE EDITOR DRAWER --- */}
      {isTemplateDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setIsTemplateDrawerOpen(false)} style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backdropFilter: 'blur(10px)', background: 'rgba(10, 22, 40, 0.5)', zIndex: 10000,
          display: 'flex', justifyContent: 'flex-end'
        }}>
          <div className="drawer-content" style={{ 
            padding: 0, width: '900px', background: 'white', display: 'flex', flexDirection: 'column',
            height: '100%', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '30px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '10px', fontWeight: 950, color: '#00f2fe', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '4px' }}>Protocol Architect</h2>
                  <div style={{ fontSize: '18px', fontWeight: 950, letterSpacing: '-0.5px' }}>{editTemplate.id ? 'CONFIG_TEMPLATE_STRUCTURE' : 'INIT_NEW_TEMPLATE'}</div>
                </div>
                <button onClick={() => setIsTemplateDrawerOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px' }}>&times;</button>
              </div>
            </div>

            <div style={{ padding: '30px', flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>TEMPLATE_NAME (IDENTIFIER)</label>
                    <input 
                      type="text" required 
                      value={editTemplate.name} 
                      placeholder="e.g. CHEST_XRAY_NORMAL"
                      onChange={e => setEditTemplate({...editTemplate, name: e.target.value})}
                      style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '16px', fontWeight: 800, padding: '10px 0', outline: 'none' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>MODALITY_CONTEXT</label>
                    <select 
                      value={editTemplate.modality} 
                      onChange={e => setEditTemplate({...editTemplate, modality: e.target.value})}
                      style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #eee', fontSize: '12px', fontWeight: 700, background: 'white' }}
                    >
                      {['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'PET-CT'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '15px' }}>CONTENT_STRUCTURE (HTML)</label>
                  <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', minHeight: '400px' }}>
                    <NarrativeEditor 
                      content={editTemplate.content} 
                      onChange={(html) => setEditTemplate({...editTemplate, content: html})}
                      placeholder="Design your report template here..."
                    />
                  </div>
                </div>

                <div style={{ marginTop: '35px', display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setIsTemplateDrawerOpen(false)} style={{ width: '120px', padding: '14px', borderRadius: '12px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>ABORT</button>
                  <button 
                    onClick={handleSaveTemplate}
                    disabled={isTemplateSaving}
                    style={{ 
                      width: '280px', padding: '14px', borderRadius: '12px', border: 'none', 
                      background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
                      boxShadow: '0 8px 20px rgba(15, 82, 186, 0.2)' 
                    }}
                  >
                    {isTemplateSaving ? 'COMMITTING_CHANGES...' : 'SAVE REPORT PROTOCOL →'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateManager;
