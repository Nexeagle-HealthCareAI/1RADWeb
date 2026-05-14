import React, { useState, useMemo, useEffect } from 'react';

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
  isKeywordSaving,
  formatMacroText,
  macroTextareaRef
}) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [page, setPage] = useState(1);
  const itemsPerPage = isMobile ? 6 : 8;
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
  
  useEffect(() => {
    setPage(1);
  }, [keywordSearch, sortConfig]);

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

  return (
    <div className="keyword-manager fade-in" style={{ padding: isMobile ? '10px' : '20px', height: '100%', display: 'flex', flexDirection: 'column', gap: isMobile ? '15px' : '25px' }}>
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
          gap: '15px'
        }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <label style={{ fontSize: '9px', fontWeight: 950, color: '#64748b' }}>SEARCH_MACROS:</label>
            <input 
              type="text"
              value={keywordSearch}
              onChange={e => setKeywordSearch(e.target.value)}
              placeholder="Search by trigger or content..."
              style={{ flex: 1, padding: '8px 15px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, outline: 'none', width: isMobile ? '100%' : '300px' }}
            />
          </div>
          <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', textAlign: isMobile ? 'center' : 'right' }}>TOTAL_ENTRIES: {filteredKeywords.length}</div>
        </div>

        <div style={{ flex: 1, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '600px' : 'auto' }}>
            <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th 
                    onClick={() => handleSort('category')}
                    style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', cursor: 'pointer', userSelect: 'none' }}
                  >
                    CATEGORY {getSortIcon('category')}
                  </th>
                  <th 
                    onClick={() => handleSort('trigger')}
                    style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', cursor: 'pointer', userSelect: 'none' }}
                  >
                    TRIGGER {getSortIcon('trigger')}
                  </th>
                  <th 
                    onClick={() => handleSort('replacementText')}
                    style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', cursor: 'pointer', userSelect: 'none' }}
                  >
                    EXPANSION_TEXT {getSortIcon('replacementText')}
                  </th>
                  <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>ACTIONS</th>
                </tr>
            </thead>
            <tbody>
              {paginatedKeywords.map((k, idx) => (
                <tr key={k.id || idx} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s' }}>
                  <td style={{ padding: '20px 30px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 950, color: 'white', background: '#334155', padding: '4px 10px', borderRadius: '6px' }}>
                      {(k.category || k.Category || 'GENERAL').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '20px 30px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', background: 'rgba(15, 82, 186, 0.05)', padding: '6px 12px', borderRadius: '8px', fontFamily: 'monospace' }}>
                      /{k.trigger || k.keyword}
                    </span>
                  </td>
                  <td style={{ padding: '20px 30px' }}>
                    <div style={{ 
                      fontSize: '12px', color: '#64748b', fontWeight: 600, 
                      maxWidth: '600px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
                    }}>
                      {k.replacementText?.replace(/<[^>]*>?/gm, '') || 'Empty expansion...'}
                    </div>
                  </td>
                  <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => { 
                          setSelectedKeywordId(k.id); 
                          setNewMacro({ 
                            trigger: k.trigger || k.keyword, 
                            replacementText: k.replacementText,
                            category: k.category || k.Category || ''
                          }); 
                        }} 
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '10px', fontWeight: 800 }}
                      >
                        EDIT
                      </button>
                      <button 
                        onClick={() => handleDeleteKeyword(k.id)} 
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '10px', fontWeight: 800 }}
                      >
                        DEL
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '20px 30px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '10px', fontWeight: 900, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>PREV</button>
          <span style={{ fontSize: '10px', fontWeight: 950, color: '#64748b' }}>PAGE {page} OF {totalPages || 1}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '10px', fontWeight: 900, cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}>NEXT</button>
        </div>
      </div>

      {/* --- MODAL POPUP EDITOR --- */}
      {selectedKeywordId && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10, 22, 40, 0.7)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 11000, animation: 'fadeIn 0.3s ease-out'
        }} onClick={() => setSelectedKeywordId(null)}>
          
          <div style={{ 
            width: isMobile ? '100%' : '600px', 
            height: isMobile ? '100%' : 'auto',
            background: 'white', borderRadius: isMobile ? 0 : '32px', 
            display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            animation: 'modalPopUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            maxHeight: isMobile ? '100%' : '90vh', overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            
            <div style={{ padding: isMobile ? '20px' : '30px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '9px', fontWeight: 950, color: '#00f2fe', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Macro Architect</h3>
                  <div style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 950, letterSpacing: '-0.5px' }}>{selectedKeywordId === 'new' ? 'INIT_NEW_SHORTCUT' : 'MODIFY_CORE_MACRO'}</div>
                </div>
                <button onClick={() => setSelectedKeywordId(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontSize: '20px' }}>&times;</button>
              </div>
            </div>

            <div style={{ padding: isMobile ? '20px' : '30px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '20px' : '25px', marginBottom: '25px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>MACRO_TYPE / ORGAN</label>
                  <input 
                    type="text" 
                    list="category-suggestions"
                    value={newMacro.category} 
                    placeholder="e.g. LIVER, GB, HEART"
                    onChange={e => setNewMacro({...newMacro, category: e.target.value.toUpperCase()})}
                    style={{ width: '100%', border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '16px', fontWeight: 800, padding: '10px 0', outline: 'none' }}
                  />
                  <datalist id="category-suggestions">
                    {Array.from(new Set(keywords.map(k => (k.category || k.Category || '').toUpperCase()).filter(Boolean))).map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '10px' }}>TRIGGER_COMMAND</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '24px', fontWeight: 900, color: '#0f52ba' }}>/</span>
                    <input 
                      type="text" 
                      value={newMacro.trigger} 
                      placeholder="e.g. normal_cxr"
                      onChange={e => setNewMacro({...newMacro, trigger: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                      style={{ flex: 1, border: 'none', borderBottom: '2px solid #f0f0f0', fontSize: '18px', fontWeight: 800, padding: '10px 0', outline: 'none', color: '#0f52ba' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px' }}>EXPANSION_PAYLOAD</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['bold', 'italic', 'underline'].map(cmd => (
                      <button 
                        key={cmd} 
                        onClick={() => formatMacroText(cmd)} 
                        style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: 900, cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        {cmd.charAt(0).toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div 
                  ref={macroTextareaRef}
                  contentEditable="true"
                  onInput={(e) => setNewMacro({...newMacro, replacementText: e.currentTarget.innerHTML})}
                  dangerouslySetInnerHTML={{ __html: newMacro.replacementText }}
                  style={{ 
                    minHeight: isMobile ? '150px' : '200px', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', 
                    background: '#f8fafc', outline: 'none', fontSize: '15px', lineHeight: '1.6', color: '#1e293b'
                  }}
                />
              </div>

              <div style={{ marginTop: '35px', display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', gap: '15px' }}>
                <button onClick={() => setSelectedKeywordId(null)} style={{ flex: 1, padding: '15px', borderRadius: '16px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>ABORT</button>
                <button 
                  disabled={isKeywordSaving} 
                  onClick={handleSaveMacro}
                  style={{ 
                    flex: 2, padding: '15px', borderRadius: '16px', border: 'none', 
                    background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
                    boxShadow: '0 8px 25px rgba(15, 82, 186, 0.3)' 
                  }}
                >
                  {isKeywordSaving ? 'COMMITTING...' : 'SAVE MACRO SHORTHAND →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes modalPopUp {
          from { transform: scale(0.9) translateY(20px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        .fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default KeywordManager;
