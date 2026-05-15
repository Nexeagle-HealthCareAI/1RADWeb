import React, { useState, useMemo, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';

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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: newMacro.replacementText,
    onUpdate: ({ editor }) => {
      setNewMacro(prev => ({ ...prev, replacementText: editor.getHTML() }));
    },
  }, [selectedKeywordId]);

  useEffect(() => {
    if (editor && selectedKeywordId) {
      editor.commands.setContent(newMacro.replacementText || '');
    }
    // We only sync on initial selection to prevent cursor resets while typing
  }, [selectedKeywordId, editor]);

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
      {/* --- MODAL POPUP EDITOR: WORD-LIKE EXPERIENCE --- */}
      {selectedKeywordId && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10, 22, 40, 0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 11000
        }} onClick={() => setSelectedKeywordId(null)}>
          
          <div style={{ 
            width: isMobile ? '100%' : '850px', 
            height: isMobile ? '100%' : '90vh',
            background: '#f1f5f9', borderRadius: isMobile ? 0 : '24px', 
            display: 'flex', flexDirection: 'column', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.6)',
            overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)',
            animation: 'modalPopUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }} onClick={e => e.stopPropagation()}>
            
            {/* Header: Institutional Blue */}
            <div style={{ padding: '20px 30px', background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '10px', fontWeight: 950, color: '#60a5fa', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Macro_Architect_v2.0</h3>
                <div style={{ fontSize: '18px', fontWeight: 950 }}>{selectedKeywordId === 'new' ? 'INIT_NEW_MACRO' : 'RECONFIG_MACRO_PAYLOAD'}</div>
              </div>
              <button onClick={() => setSelectedKeywordId(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontSize: '22px' }}>&times;</button>
            </div>

            {/* Config Row (Static) */}
            <div style={{ padding: isMobile ? '15px' : '20px 30px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr', gap: isMobile ? '15px' : '20px', flexShrink: 0 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px' }}>TARGET_CATEGORY</label>
                  <input 
                    type="text" 
                    list="category-suggestions"
                    value={newMacro.category} 
                    placeholder="e.g. X-RAY, CHEST, CT"
                    onChange={e => setNewMacro({...newMacro, category: e.target.value.toUpperCase()})}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 700, outline: 'none', background: '#f8fafc' }}
                  />
                  <datalist id="category-suggestions">
                    {Array.from(new Set(keywords.map(k => (k.category || k.Category || '').toUpperCase()).filter(Boolean))).map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px', marginBottom: '8px' }}>COMMAND_TRIGGER</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 900, color: '#0f52ba' }}>/</span>
                    <input 
                      type="text" 
                      value={newMacro.trigger} 
                      placeholder="e.g. normal_brain"
                      onChange={e => setNewMacro({...newMacro, trigger: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #0f52ba', fontSize: '14px', fontWeight: 800, outline: 'none', background: 'rgba(15, 82, 186, 0.02)', color: '#0f52ba' }}
                    />
                  </div>
                </div>
            </div>

            {/* Word-like Editor Area (Scrollable Workspace) */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: isMobile ? 'white' : '#e2e8f0', padding: isMobile ? '0' : '40px 20px' }}>
              
              {/* Toolbar (Sticky) */}
              <div style={{ 
                background: '#f0f0f0', padding: '6px 12px', 
                borderRadius: isMobile ? 0 : '12px 12px 0 0', 
                border: '1px solid #c8c8c8', borderBottom: '2px solid #c8c8c8',
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px',
                position: 'sticky', top: 0, zIndex: 10,
                width: isMobile ? '100%' : '190mm',
                margin: isMobile ? '0' : '0 auto',
                flexShrink: 0
              }}>
                <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
                  <Icon d={ICONS.bold} />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
                  <Icon d={ICONS.italic} />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
                  <Icon d={ICONS.underline} />
                </ToolbarBtn>
                
                <div style={{ width: '1px', height: '20px', background: '#c8c8c8', margin: '0 4px' }} />
                
                <ToolbarBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align Left">
                  <Icon d={ICONS.alignL} />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Center">
                  <Icon d={ICONS.alignC} />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align Right">
                  <Icon d={ICONS.alignR} />
                </ToolbarBtn>
                
                <div style={{ width: '1px', height: '20px', background: '#c8c8c8', margin: '0 4px' }} />
                
                <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">
                  <Icon d={ICONS.bulletList} />
                </ToolbarBtn>

                <div style={{ flex: 1 }} />
                {!isMobile && <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', alignSelf: 'center' }}>MACRO_ENGINE_v2.0</span>}
              </div>

              {/* Editor Content (Centered Page) */}
              <div style={{ 
                width: isMobile ? '100%' : '190mm', 
                margin: isMobile ? '0' : '0 auto',
                background: 'white', 
                border: isMobile ? 'none' : '1px solid #cbd5e1', 
                boxShadow: isMobile ? 'none' : '0 10px 40px rgba(0,0,0,0.1)', 
                minHeight: isMobile ? '300px' : '450px', 
                padding: isMobile ? '20px' : '50px 70px',
                flexShrink: 0
              }} className="macro-word-page">
                <EditorContent editor={editor} style={{ outline: 'none', fontSize: isMobile ? '14px' : '15px', lineHeight: '1.6' }} />
              </div>
            </div>

            {/* Footer Actions (Static) */}
            <div style={{ padding: '20px 30px', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '15px', flexShrink: 0 }}>
                <button onClick={() => setSelectedKeywordId(null)} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer', background: 'white' }}>ABORT</button>
                <button 
                  disabled={isKeywordSaving} 
                  onClick={handleSaveMacro}
                  style={{ 
                    padding: '12px 30px', borderRadius: '10px', border: 'none', 
                    background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer',
                    boxShadow: '0 8px 25px rgba(15, 82, 186, 0.3)' 
                  }}
                >
                  {isKeywordSaving ? 'COMMITTING...' : 'REGISTER MACRO →'}
                </button>
            </div>
          </div>
          
          <style>{`
            .macro-word-page .ProseMirror { outline: none; min-height: 300px; }
            .macro-word-page p { margin-bottom: 10px; }
            .macro-word-page ul, .macro-word-page ol { padding-left: 20px; margin-bottom: 15px; }
          `}</style>
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

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block', pointerEvents: 'none' }}>
    <path d={d} />
  </svg>
);

const ICONS = {
  bold: 'M3 2h5.5a3.5 3.5 0 0 1 2.19 6.22A3.5 3.5 0 0 1 8.5 15H3V2zm2 5.5h3.5a1.5 1.5 0 0 0 0-3H5v3zm0 5h3.5a1.5 1.5 0 0 0 0-3H5v3z',
  italic: 'M7 2h6v2H10.58L7.42 12H10v2H4v-2h2.42L9.58 4H7V2z',
  underline: 'M3 1h2v7a3 3 0 0 0 6 0V1h2v7a5 5 0 0 1-10 0V1zm-1 13h12v2H2v-2z',
  alignL: 'M2 3h12v2H2V3zm0 4h8v2H2V7zm0 4h12v2H2v-2z',
  alignC: 'M2 3h12v2H2V3zm3 4h6v2H5V7zm-3 4h12v2H2v-2z',
  alignR: 'M2 3h12v2H2V3zm4 4h8v2H6V7zm-4 4h12v2H2v-2z',
  bulletList: 'M2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-2h9v2H5V2zm-3 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-2h9v2H5V6zm-3 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-2h9v2H5v-2z',
};

const ToolbarBtn = ({ children, onClick, active, title }) => (
  <button 
    onMouseDown={e => { e.preventDefault(); onClick(); }} 
    title={title}
    style={{ 
      minWidth: '28px', height: '28px', borderRadius: '3px', border: active ? '1px solid #90c8f0' : '1px solid transparent', 
      background: active ? '#cce4f7' : 'transparent', 
      color: active ? '#003a75' : '#323130',
      fontSize: '11px', fontWeight: 950, cursor: 'pointer', 
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 6px', transition: 'all 0.08s',
      fontFamily: '"Segoe UI", system-ui, sans-serif'
    }}
  >
    {children}
  </button>
);

export default KeywordManager;
