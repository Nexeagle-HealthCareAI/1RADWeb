import React, { useState, useRef } from 'react';
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
  getLinkedService = () => null
}) => {
  const [modalityFilter, setModalityFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const editorRef = useRef(null);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const safeTemplates = Array.isArray(templates) ? templates : [];
  const filteredTemplates = safeTemplates.filter(t => {
    const tName = t.name || t.Name || '';
    const tModality = t.modality || t.Modality || '';
    const matchesModality = modalityFilter === 'ALL' || tModality === modalityFilter;
    const matchesSearch = tName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesModality && matchesSearch;
  });

  const thStyle = { padding: '14px 24px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', letterSpacing: '0.3px' };

  return (
    <div
      className="template-manager fade-in"
      style={{ padding: isMobile ? '10px' : '20px', height: '100%', display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '20px', overflow: 'hidden' }}
    >

      {/* ── Template table ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: isMobile ? '16px' : '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

        {/* Toolbar row */}
        <div style={{
          padding: isMobile ? '15px' : '16px 24px',
          background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center',
          flexShrink: 0, gap: '12px'
        }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px', alignItems: isMobile ? 'stretch' : 'center' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', whiteSpace: 'nowrap' }}>Modality</label>
              <select
                value={modalityFilter}
                onChange={e => setModalityFilter(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 500, color: '#1d4ed8', outline: 'none', background: 'white' }}
              >
                <option value="ALL">All Modalities</option>
                {['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'PET-CT'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', whiteSpace: 'nowrap' }}>Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by name..."
                style={{ padding: '7px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', width: isMobile ? '100%' : '200px' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{filteredTemplates.length} templates</span>
            <button
              onClick={() => { setEditTemplate({ id: null, name: '', modality: 'X-RAY', content: '' }); setIsTemplateDrawerOpen(true); }}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#1d4ed8', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              + New Template
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '500px' : 'auto' }}>
            <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={thStyle}>Modality</th>
                <th style={thStyle}>Template Name</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map((t, idx) => {
                const tName = t.name || t.Name || '';
                const tModality = t.modality || t.Modality || '';
                const tId = t.id || t.Id;
                return (
                  <tr key={tId || idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '14px 24px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'white', background: '#334155', padding: '3px 8px', borderRadius: '5px' }}>{tModality}</span>
                    </td>
                    <td style={{ padding: '14px 24px', fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{tName}</td>
                    <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => { setEditTemplate({ id: tId, name: tName, modality: tModality, content: t.content || t.Content || '' }); setIsTemplateDrawerOpen(true); }}
                          style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
                        >Edit</button>
                        <button
                          onClick={() => handleDeleteTemplate(tId)}
                          style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredTemplates.length === 0 && (
                <tr><td colSpan="3" style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No templates found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Template editor modal ── */}
      {isTemplateDrawerOpen && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(10, 22, 40, 0.7)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 11000
          }}
          onClick={() => setIsTemplateDrawerOpen(false)}
        >
          <div
            style={{
              width: isMobile ? '100%' : '980px',
              height: isMobile ? '100%' : '95vh',
              background: '#f1f5f9', borderRadius: isMobile ? 0 : '16px',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              overflow: 'hidden', animation: 'modalPopUp 0.3s cubic-bezier(0.175,0.885,0.32,1.275)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 28px', background: 'linear-gradient(135deg, #1d4ed8 0%, #0a1628 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginBottom: '3px' }}>
                  Configuration → Templates
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>
                  {editTemplate.id ? 'Edit Template' : 'New Template'}
                </div>
              </div>
              <button onClick={() => setIsTemplateDrawerOpen(false)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>

            {/* Name + Modality inputs */}
            <div style={{
              padding: isMobile ? '15px' : '18px 28px',
              background: 'white', borderBottom: '1px solid #e2e8f0',
              display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr',
              gap: isMobile ? '14px' : '24px', flexShrink: 0
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Template Name</label>
                <input
                  type="text"
                  required
                  value={editTemplate.name}
                  placeholder="e.g. Normal Chest X-Ray"
                  onChange={e => setEditTemplate({ ...editTemplate, name: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '14px', fontWeight: 500, outline: 'none', boxSizing: 'border-box' }}
                />
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '5px 0 0' }}>
                  Name must match the service exactly for auto-selection in the reporting editor.
                </p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Modality</label>
                <select
                  value={editTemplate.modality}
                  onChange={e => setEditTemplate({ ...editTemplate, modality: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 500, background: 'white', outline: 'none', boxSizing: 'border-box' }}
                >
                  {['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'MAMMOGRAPHY', 'PET-CT'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Full Word-like NarrativeEditor — fills remaining height */}
            <NarrativeEditor
              ref={editorRef}
              content={editTemplate.content}
              onChange={(html) => setEditTemplate({ ...editTemplate, content: html })}
              onSave={handleSaveTemplate}
              placeholder="Design your report template here. Use headings, lists, and formatting to structure the content your doctors will fill in..."
              editable={true}
              style={{ flex: 1, minHeight: 0, height: 'auto' }}
            />

            {/* Footer */}
            <div style={{ padding: '16px 28px', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexShrink: 0 }}>
              <button
                onClick={() => setIsTemplateDrawerOpen(false)}
                style={{ padding: '10px 22px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: 'white', color: '#374151' }}
              >Cancel</button>
              <button
                disabled={isTemplateSaving}
                onClick={handleSaveTemplate}
                style={{ padding: '10px 26px', borderRadius: '8px', border: 'none', background: '#1d4ed8', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(29,78,216,0.25)' }}
              >
                {isTemplateSaving ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalPopUp {
          from { transform: scale(0.94) translateY(16px); opacity: 0; }
          to   { transform: scale(1) translateY(0); opacity: 1; }
        }
        .fade-in { animation: fadeIn 0.35s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

export default TemplateManager;
