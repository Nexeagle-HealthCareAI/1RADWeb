import React, { useState, useMemo, useEffect, useRef } from 'react';
import NarrativeEditor from './NarrativeEditor';

const KeywordManager = ({
  keywords,
  keywordSearch,
  setKeywordSearch,
  selectedKeywordId,
  setSelectedKeywordId,
  newMacro,
  setNewMacro,
  handleSaveMacro,
  handleDeleteKeyword,
  isKeywordSaving
}) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const editorRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const [sortConfig, setSortConfig] = useState({ key: 'category', direction: 'asc' });

  const filteredKeywords = useMemo(() => {
    let result = keywords.filter(k =>
      (k.trigger || k.keyword || '').toLowerCase().includes(keywordSearch.toLowerCase()) ||
      (k.replacementText || '').toLowerCase().includes(keywordSearch.toLowerCase()) ||
      (k.category || k.Category || '').toLowerCase().includes(keywordSearch.toLowerCase())
    );

    if (sortConfig.key) {
      result.sort((a, b) => {
        const aValue = (a[sortConfig.key] || a[sortConfig.key.charAt(0).toUpperCase() + sortConfig.key.slice(1)] || '').toString().toLowerCase();
        const bValue = (b[sortConfig.key] || b[sortConfig.key.charAt(0).toUpperCase() + sortConfig.key.slice(1)] || '').toString().toLowerCase();
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [keywords, keywordSearch, sortConfig]);

  useEffect(() => { setPage(1); }, [keywordSearch, sortConfig]);

  const totalPages = Math.ceil(filteredKeywords.length / itemsPerPage);
  const paginatedKeywords = filteredKeywords.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const thStyle = { padding: '14px 24px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', cursor: 'pointer', userSelect: 'none', letterSpacing: '0.3px' };

  return (
    <div className="keyword-manager fade-in" style={{ padding: isMobile ? '10px' : '20px', height: '100%', display: 'flex', flexDirection: 'column', gap: isMobile ? '15px' : '25px' }}>

      {/* ── Keyword table ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: isMobile ? '16px' : '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

        {/* Toolbar row */}
        <div style={{
          padding: isMobile ? '15px' : '16px 24px',
          background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: '12px'
        }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: isMobile ? '100%' : '420px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              value={keywordSearch}
              onChange={e => setKeywordSearch(e.target.value)}
              placeholder="Search keywords by trigger, category, or content..."
              style={{
                width: '100%',
                padding: '10px 36px 10px 36px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '13px',
                fontWeight: 500,
                outline: 'none',
                background: 'white',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = '#1d4ed8'; e.target.style.boxShadow = '0 0 0 3px rgba(29, 78, 216, 0.1)'; }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
            />
            {keywordSearch && (
              <button
                type="button"
                onClick={() => setKeywordSearch('')}
                aria-label="Clear search"
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: 0, lineHeight: 1 }}
              >×</button>
            )}
          </div>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap' }}>{filteredKeywords.length} entries</span>
        </div>

        {/* Table */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: paginatedKeywords.length === 0 ? 'visible' : 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '600px' : 'auto' }}>
              <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th onClick={() => handleSort('category')} style={thStyle}>Category {getSortIcon('category')}</th>
                  <th onClick={() => handleSort('trigger')} style={thStyle}>Trigger {getSortIcon('trigger')}</th>
                  <th onClick={() => handleSort('replacementText')} style={thStyle}>Expansion Text {getSortIcon('replacementText')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedKeywords.map((k, idx) => (
                  <tr key={k.id || idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'white', background: '#334155', padding: '3px 8px', borderRadius: '5px' }}>
                        {(k.category || k.Category || 'General').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', padding: '4px 10px', borderRadius: '6px', fontFamily: 'monospace' }}>
                        /{k.trigger || k.keyword}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', maxWidth: '560px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {k.replacementText?.replace(/<[^>]*>?/gm, '') || 'Empty…'}
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setSelectedKeywordId(k.id);
                            setNewMacro({ trigger: k.trigger || k.keyword, replacementText: k.replacementText, category: k.category || k.Category || '' });
                          }}
                          style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
                        >Edit</button>
                        <button
                          onClick={() => handleDeleteKeyword(k.id)}
                          style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedKeywords.length === 0 && (
                  <tr><td colSpan="4" style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No keywords found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredKeywords.length > 0 && (
            <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', flexShrink: 0 }}>
              <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
                {filteredKeywords.length} keywords • Page {page} of {totalPages || 1}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0',
                    background: page === 1 ? '#f1f5f9' : 'white',
                    color: page === 1 ? '#94a3b8' : '#374151',
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '12px', fontWeight: 500
                  }}
                >← Previous</button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{
                    padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0',
                    background: page >= totalPages ? '#f1f5f9' : 'white',
                    color: page >= totalPages ? '#94a3b8' : '#374151',
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    fontSize: '12px', fontWeight: 500
                  }}
                >Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Keyword editor modal ── */}
      {selectedKeywordId && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(10, 22, 40, 0.7)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 11000
          }}
          onClick={() => setSelectedKeywordId(null)}
        >
          <div
            style={{
              width: isMobile ? '100%' : '900px',
              height: isMobile ? '100%' : '90vh',
              background: '#f1f5f9', borderRadius: isMobile ? 0 : '16px',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              overflow: 'hidden', animation: 'modalPopUp 0.3s cubic-bezier(0.175,0.885,0.32,1.275)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ padding: '20px 28px', background: 'linear-gradient(135deg, #1d4ed8 0%, #0a1628 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginBottom: '3px' }}>
                  Configuration → Keywords
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>
                  {selectedKeywordId === 'new' ? 'New Keyword' : 'Edit Keyword'}
                </div>
              </div>
              <button onClick={() => setSelectedKeywordId(null)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>

            {/* Category + trigger inputs */}
            <div style={{
              padding: isMobile ? '15px' : '18px 28px',
              background: 'white', borderBottom: '1px solid #e2e8f0',
              display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr',
              gap: isMobile ? '14px' : '20px', flexShrink: 0
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Category</label>
                <input
                  type="text"
                  list="category-suggestions"
                  value={newMacro.category}
                  placeholder="e.g. CHEST, CT, BRAIN"
                  onChange={e => setNewMacro({ ...newMacro, category: e.target.value.toUpperCase() })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 500, outline: 'none', boxSizing: 'border-box' }}
                />
                <datalist id="category-suggestions">
                  {Array.from(new Set(keywords.map(k => (k.category || k.Category || '').toUpperCase()).filter(Boolean))).map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Trigger word</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#1d4ed8', flexShrink: 0 }}>/</span>
                  <input
                    type="text"
                    value={newMacro.trigger}
                    placeholder="e.g. normal_brain"
                    onChange={e => setNewMacro({ ...newMacro, trigger: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: '7px', border: '1px solid #1d4ed8', fontSize: '14px', fontWeight: 600, outline: 'none', color: '#1d4ed8', background: '#eff6ff' }}
                  />
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '5px 0 0' }}>
                  Type this trigger word in the editor, then press Space or Enter to expand.
                </p>
              </div>
            </div>

            {/* Full Word-like NarrativeEditor */}
            <NarrativeEditor
              ref={editorRef}
              content={newMacro.replacementText || ''}
              onChange={(html) => setNewMacro(prev => ({ ...prev, replacementText: html }))}
              onSave={handleSaveMacro}
              placeholder="Type the expansion text for this keyword..."
              editable={true}
              style={{ flex: 1, minHeight: 0, height: 'auto' }}
            />

            {/* Footer */}
            <div style={{ padding: '16px 28px', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexShrink: 0 }}>
              <button
                onClick={() => setSelectedKeywordId(null)}
                style={{ padding: '10px 22px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, cursor: 'pointer', background: 'white', color: '#374151' }}
              >Cancel</button>
              <button
                disabled={isKeywordSaving}
                onClick={handleSaveMacro}
                style={{ padding: '10px 26px', borderRadius: '8px', border: 'none', background: '#1d4ed8', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(29,78,216,0.25)' }}
              >
                {isKeywordSaving ? 'Saving…' : 'Save Keyword'}
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

export default KeywordManager;
